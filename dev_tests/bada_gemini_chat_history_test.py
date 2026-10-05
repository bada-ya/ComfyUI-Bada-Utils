"""
🔞 제미나이 채팅 기록 — backend verification (hermetic).

Exercises the REAL handlers registered by `server/bada_promptgen_api.py` against a
throw-away temp directory, after stubbing the two ComfyUI internals the module imports
(`server.PromptServer`, `aiohttp`). No running instance, no `pip install`, and it never
touches your real `gemini_chat_history.json`.

What is pinned here:
  • the 30-conversation cap, and that pruning drops the OLDEST entries
  • 「저장 안 함」 shape: zero image bytes but `imageCount` + `imagesOmitted` preserved,
    so the restored thread can still draw a placeholder
  • upsert is idempotent per id (a restored chat must UPDATE, never fork a duplicate)
  • list payloads carry no message bodies or image data
  • export → clear → import round-trips, merge and replace
  • `clear` refuses without `confirm` (a stray POST must not wipe the history)

    python dev_tests/bada_gemini_chat_history_test.py
"""
import asyncio
import importlib
import io
import json
import os
import shutil
import sys
import tempfile
import types

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PKG_NAME = "bada_chat_hist_pkg"  # the real dir name contains "-" and is not an identifier

results = []


def check(label, cond, info=""):
    results.append(bool(cond))
    print(f"[{'PASS' if cond else 'FAIL'}] {label}" + (f" :: {info}" if info else ""))


def call(method, path, body=None, query=None):
    """Invoke a registered handler and return (status, parsed-json)."""
    handler = ROUTES.table[(method, path)]
    req = _Request(body, query)
    resp = asyncio.get_event_loop().run_until_complete(handler(req))
    try:
        return resp.status, json.loads(resp.text)
    except Exception:
        return resp.status, {}


# ---------------------------------------------------------------- stub ComfyUI
TMP_ROOT = tempfile.mkdtemp(prefix="bada_chat_history_")


class _Routes:
    def __init__(self):
        self.table = {}

    def _register(self, method):
        def outer(path):
            def decorator(handler):
                self.table[(method, path)] = handler
                return handler
            return decorator
        return outer

    def get(self, path):
        return self._register("GET")(path)

    def post(self, path):
        return self._register("POST")(path)


ROUTES = _Routes()

server_stub = types.ModuleType("server")
server_stub.PromptServer = types.SimpleNamespace(instance=types.SimpleNamespace(routes=ROUTES))
sys.modules["server"] = server_stub


class _Request:
    """Minimal stand-in exposing `.json()`, `.rel_url.query` and nothing else."""

    def __init__(self, body=None, query=None):
        self._body = body if body is not None else {}
        self.rel_url = types.SimpleNamespace(query=query or {})

    async def json(self):
        return self._body


class _Response:
    def __init__(self, text="", status=200):
        self.status = status
        self.text = text


class _Web:
    @staticmethod
    def json_response(data=None, status=200, **kwargs):
        return _Response(json.dumps(data if data is not None else {}, ensure_ascii=False), status)

    @staticmethod
    def Response(body=b"", content_type=None, headers=None, **kwargs):
        # The export route returns raw bytes; expose them as .text so the test can parse it.
        if isinstance(body, bytes):
            body = body.decode("utf-8")
        return _Response(body, 200)


aiohttp_stub = types.ModuleType("aiohttp")
aiohttp_stub.web = _Web()
sys.modules["aiohttp"] = aiohttp_stub

# `server/__init__.py` imports bada_server_api, which needs ComfyUI's `folder_paths`.
# Only a couple of its attributes are read at import time.
folder_paths_stub = types.ModuleType("folder_paths")
folder_paths_stub.get_user_directory = lambda: TMP_ROOT
folder_paths_stub.models_dir = os.path.join(TMP_ROOT, "models")
folder_paths_stub.base_path = TMP_ROOT
sys.modules["folder_paths"] = folder_paths_stub

pkg = types.ModuleType(PKG_NAME)
pkg.__path__ = [REPO_ROOT]
sys.modules[PKG_NAME] = pkg

api = importlib.import_module(f"{PKG_NAME}.server.bada_promptgen_api")
api.register_promptgen_api_routes()

# Redirect the store into the temp dir BEFORE any handler touches it.
history = importlib.import_module(f"{PKG_NAME}.server.gemini_chat_history")
HISTORY_FILE = os.path.join(TMP_ROOT, "gemini_chat_history.json")
history.HISTORY_FILE = HISTORY_FILE


# ============================================================== routes exist
for method, path in [
    ("GET", "/api/bada/gemini/chats"),
    ("GET", "/api/bada/gemini/chats/get"),
    ("GET", "/api/bada/gemini/chats/export"),
    ("POST", "/api/bada/gemini/chats/save"),
    ("POST", "/api/bada/gemini/chats/delete"),
    ("POST", "/api/bada/gemini/chats/clear"),
    ("POST", "/api/bada/gemini/chats/import"),
]:
    check(f"route registered: {method} {path}", (method, path) in ROUTES.table)


def msgs(text, images=None, count=None, omitted=False):
    return [{
        "role": "user",
        "text": text,
        "images": images or [],
        "imageCount": count if count is not None else len(images or []),
        "imagesOmitted": omitted,
    }]


# ============================================================== save / list
status, data = call("POST", "/api/bada/gemini/chats/save",
                    {"messages": msgs("첫 질문입니다", ["data:image/png;base64,AAA"])})
check("save returns 200", status == 200, f"status={status}")
chat_id = data.get("chat", {}).get("id", "")
check("save mints an id", bool(chat_id), f"id={chat_id[:16]}")
check("title derives from the first user message",
      data.get("chat", {}).get("title") == "첫 질문입니다", str(data.get("chat", {}).get("title")))

# --- 「저장 안 함」 shape ------------------------------------------------
status, data = call("POST", "/api/bada/gemini/chats/save",
                    {"messages": msgs("사진 봐줘", [], count=3, omitted=True)})
omitted_id = data["chat"]["id"]
status, got = call("GET", "/api/bada/gemini/chats/get", query={"id": omitted_id})
stored = got["chat"]["messages"][0]
check("「저장 안 함」 stores no image bytes", stored["images"] == [], str(stored["images"]))
check("「저장 안 함」 keeps the image COUNT", stored["imageCount"] == 3, str(stored["imageCount"]))
check("「저장 안 함」 keeps the omitted flag", stored["imagesOmitted"] is True)

# --- upsert is idempotent ----------------------------------------------
base = msgs("첫 질문입니다", ["data:image/png;base64,AAA"]) + [{"role": "model", "text": "답변", "images": []}]
call("POST", "/api/bada/gemini/chats/save", {"id": chat_id, "messages": base})
call("POST", "/api/bada/gemini/chats/save",
     {"id": chat_id, "messages": base + [{"role": "user", "text": "더", "images": []}]})
status, listing = call("GET", "/api/bada/gemini/chats")
matching = [c for c in listing["chats"] if c["id"] == chat_id]
check("upsert updates in place (no duplicate row)", len(matching) == 1, f"rows={len(matching)}")
check("upsert appended the new turn", matching and matching[0]["messageCount"] == 3,
      str(matching[0]["messageCount"] if matching else None))

# --- list payload carries no bodies ------------------------------------
raw = json.dumps(listing)
check("list payload has no message bodies", '"messages"' not in raw)
check("list payload has no image data", "base64" not in raw)
check("list reports the cap", listing.get("maxChats") == 30, str(listing.get("maxChats")))
check("list counts images", any(c["imageCount"] == 3 for c in listing["chats"]))


# ============================================================== 30-chat cap
for i in range(35):
    call("POST", "/api/bada/gemini/chats/save", {"messages": msgs(f"flood-{i}")})
status, listing = call("GET", "/api/bada/gemini/chats")
check("cap holds at 30 conversations", len(listing["chats"]) == 30, f"stored={len(listing['chats'])}")
titles = [c["title"] for c in listing["chats"]]
check("newest kept, oldest dropped", "flood-34" in titles and "flood-0" not in titles,
      f"newest={titles[0]!r}")
check("pruning is newest-first ordered",
      titles == [c["title"] for c in sorted(listing["chats"], key=lambda c: -c["updatedAt"])])

# ============================================================== clear guard
status, data = call("POST", "/api/bada/gemini/chats/clear", {})
check("clear without confirm is refused", status == 400, f"status={status}")
status, listing2 = call("GET", "/api/bada/gemini/chats")
check("refused clear left the data intact", len(listing2["chats"]) == 30,
      f"still={len(listing2['chats'])}")

# ============================================================== backup flow
handler = ROUTES.table[("GET", "/api/bada/gemini/chats/export")]
resp = asyncio.get_event_loop().run_until_complete(handler(_Request()))
backup = json.loads(resp.text)
check("export returns a chats array", isinstance(backup.get("chats"), list))

call("POST", "/api/bada/gemini/chats/clear", {"confirm": True})
status, empty = call("GET", "/api/bada/gemini/chats")
check("confirmed clear empties the store", empty["chats"] == [])

status, data = call("POST", "/api/bada/gemini/chats/import", {"payload": backup})
check("import restores every chat", data.get("imported") == 30, f"imported={data.get('imported')}")
status, restored = call("GET", "/api/bada/gemini/chats")
check("restored list is full again", len(restored["chats"]) == 30, f"n={len(restored['chats'])}")

# merge keeps local-only rows. The cap means a merge can push the NEWEST local chat out —
# that is the documented 「최근 30개」 behaviour, not a bug — so assert survival on a chat
# that is not the single freshest one.
status, data = call("POST", "/api/bada/gemini/chats/save", {"messages": msgs("local-only")})
call("POST", "/api/bada/gemini/chats/save", {"messages": msgs("newer-local")})
status, merged = call("GET", "/api/bada/gemini/chats")
local_ids = {c["id"] for c in merged["chats"]
             if c["title"] in ("local-only", "newer-local")}
status, data = call("POST", "/api/bada/gemini/chats/import", {"payload": backup, "merge": True})
status, merged = call("GET", "/api/bada/gemini/chats")
kept_ids = {c["id"] for c in merged["chats"]}
check("merge keeps chats missing from the file", bool(local_ids & kept_ids),
      f"local ids still present={len(local_ids & kept_ids)}")
check("merge is still capped at 30", len(merged["chats"]) == 30, f"n={len(merged['chats'])}")

# importing the same backup twice must not duplicate anything
status, before = call("GET", "/api/bada/gemini/chats")
call("POST", "/api/bada/gemini/chats/import", {"payload": backup, "merge": True})
status, after = call("GET", "/api/bada/gemini/chats")
check("re-importing your own backup adds no duplicates",
      len(before["chats"]) == len(after["chats"]),
      f"{len(before['chats'])} -> {len(after['chats'])}")

# ============================================================== delete
victim = merged["chats"][0]["id"]
status, data = call("POST", "/api/bada/gemini/chats/delete", {"id": victim})
check("delete removes one chat", status == 200, f"status={status}")
status, data = call("POST", "/api/bada/gemini/chats/delete", {"id": "does-not-exist"})
check("deleting a missing chat 404s", status == 404, f"status={status}")

# ============================================================== robustness
status, data = call("POST", "/api/bada/gemini/chats/save", {"messages": []})
check("saving an empty thread is a 400", status == 400, f"status={status}")
status, data = call("POST", "/api/bada/gemini/chats/import", {"payload": {"nope": 1}})
check("importing junk is a 400", status == 400, f"status={status}")
status, data = call("POST", "/api/bada/gemini/chats/save",
                    {"messages": [{"role": "user", "text": "  ", "images": []},
                                  {"role": "user", "text": "실질", "images": []}]})
check("blank messages are dropped on save", data.get("chat", {}).get("messageCount") == 1,
      str(data.get("chat", {}).get("messageCount")))

# --- REGRESSION: recency must survive same-second saves --------------------
# `updatedAt` alone is second-precision, so a burst of saves shares one timestamp. Python's
# sort is stable, which made the 30-cap prune by INSERTION order and keep `flood-0` instead
# of the newest chat — silently discarding the conversation the user just wrote.
check("same-second saves still prune by recency",
      "flood-34" in titles and "flood-0" not in titles,
      f"newest={titles[0]!r}")
# NOTE: the assertion must read the LIST endpoint, not the last save response. This used
# to iterate `merged["chats"]` — a leftover from the import test that was empty at this
# point — so `all([])` returned True and the check passed without asserting anything.
status, listed = call("GET", "/api/bada/gemini/chats")
check("rows carry a millisecond sort key",
      bool(listed.get("chats")) and all(
          isinstance(c.get("updatedAtMs"), int) for c in listed["chats"]),
      f"checked {len(listed.get('chats') or [])} rows; missing on "
      f"{[c.get('title') for c in listed.get('chats') or [] if not isinstance(c.get('updatedAtMs'), int)]}")

# A backup written BEFORE `updatedAtMs` existed must still import cleanly: the key is
# synthesized on the way in, otherwise those rows would sort arbitrarily forever.
status, data = call("POST", "/api/bada/gemini/chats/import", {
    "payload": {"version": 1, "chats": [
        {"id": "legacy-1", "title": "구버전 백업", "updatedAt": 100,
         "messages": [{"role": "user", "text": "구백업"}]}]},
    "merge": True,
})
status, legacy = call("GET", "/api/bada/gemini/chats")
legacy_row = [c for c in legacy["chats"] if c["id"] == "legacy-1"]
check("legacy backup (no updatedAtMs) imports with a synthesized key",
      legacy_row and isinstance(legacy_row[0].get("updatedAtMs"), int),
      str(legacy_row[0].get("updatedAtMs") if legacy_row else None))

# --- REGRESSION: whitespace-only text must not survive ---------------------
# `"  "` is truthy in Python, so an empty-looking bubble used to be persisted, inflating the
# title, the byte counter and every restored thread.
status, data = call("POST", "/api/bada/gemini/chats/save",
                    {"messages": [{"role": "user", "text": "   ", "images": []}]})
check("whitespace-only message is a 400 (nothing to store)", status == 400, f"status={status}")

# ================================================== 📌 pin / 「상단 고정」
# The promise the pin button makes is "this conversation will not be auto-deleted".
# That is only true if the cap is counted over UNPINNED rows, so the store is first pushed
# past the cap: an unpinned victim is created, then the oldest survivor is pinned, then more
# saves arrive. If pinned entries counted toward the 30, the victim would survive and the
# pinned one would die — the exact inverse of what the user asked for.
call("POST", "/api/bada/gemini/chats/clear", {"confirm": True})
for i in range(30):
    call("POST", "/api/bada/gemini/chats/save", {"messages": msgs(f"pin-{i}")})
status, before = call("GET", "/api/bada/gemini/chats")
check("pinned section starts empty (sanity)", len(before["chats"]) == 30)

# The OLDEST row — the one the next save is guaranteed to evict.
oldest_id = before["chats"][-1]["id"]
check("the oldest row is the eviction candidate", before["chats"][-1]["title"] == "pin-0",
      before["chats"][-1]["title"])

status, data = call("POST", "/api/bada/gemini/chats/pin", {"id": oldest_id, "pinned": True})
check("pin returns 200", status == 200, f"status={status}")
check("pin echoes the new state", data.get("chat", {}).get("pinned") is True,
      str(data.get("chat", {}).get("pinned")))

# Now push past the cap. Without pin-aware pruning this save deletes `pin-0`.
for i in range(30, 40):
    call("POST", "/api/bada/gemini/chats/save", {"messages": msgs(f"pin-{i}")})
status, after = call("GET", "/api/bada/gemini/chats")
ids = [c["id"] for c in after["chats"]]
titles = [c["title"] for c in after["chats"]]
check("PINNED chat survives 10 saves past the 30-cap", oldest_id in ids, f"pinned evicted! n={len(ids)}")
check("the cap now allows 31 rows (30 loose + 1 pinned)", len(ids) == 31, f"n={len(ids)}")
check("an UNPINNED row was evicted instead", "pin-1" not in titles,
      f"loose kept={sum(1 for c in after['chats'] if not c['pinned'])}")
check("the pinned row leads the list", after["chats"][0]["id"] == oldest_id,
      f"first={after['chats'][0]['title']!r}")
check("unpinned rows stay newest-first below it",
      titles[1] == "pin-39", f"second={titles[1]!r}")

# Unpinning must hand the row BACK to the cap: it is the oldest, so the next save takes it.
call("POST", "/api/bada/gemini/chats/pin", {"id": oldest_id, "pinned": False})
call("POST", "/api/bada/gemini/chats/save", {"messages": msgs("pin-40")})
status, unpinned = call("GET", "/api/bada/gemini/chats")
check("unpinning returns the row to the cap", oldest_id not in [c["id"] for c in unpinned["chats"]],
      "the row outlived the cap after being unpinned")
check("store is back to exactly 30", len(unpinned["chats"]) == 30, f"n={len(unpinned['chats'])}")

# A pin must not be lost by ordinary use of that conversation: upsert REPLACES the stored
# dict, so a pin that is not copied forward disappears the moment the user sends again.
# Pinned a row that is actually still stored — pinning an evicted id 404s, and pinning a
# row that the cap has already dropped would assert nothing about pin survival.
status, live = call("GET", "/api/bada/gemini/chats")
live_id = live["chats"][-1]["id"]
call("POST", "/api/bada/gemini/chats/pin", {"id": live_id, "pinned": True})
call("POST", "/api/bada/gemini/chats/save", {"id": live_id, "messages": msgs("pin 이어쓰기")})
status, kept = call("GET", "/api/bada/gemini/chats")
row = [c for c in kept["chats"] if c["id"] == live_id]
check("the pin SURVIVES an upsert of that same chat", row and row[0]["pinned"] is True,
      str(row[0].get("pinned") if row else "row gone"))
check("pinning is not treated as activity (recency untouched)",
      row and row[0]["title"] == "pin 이어쓰기", str(row[0].get("title") if row else None))

status, data = call("POST", "/api/bada/gemini/chats/pin", {"id": "no-such-chat", "pinned": True})
check("pinning a missing chat 404s", status == 404, f"status={status}")
status, data = call("POST", "/api/bada/gemini/chats/pin", {"pinned": True})
check("pin without an id is a 400", status == 400, f"status={status}")

# `"false"` is truthy in Python. A client that stringified a checkbox would otherwise PIN a
# chat the user just unpinned — the one inversion that is silent and hard to notice.
call("POST", "/api/bada/gemini/chats/clear", {"confirm": True})
status, data = call("POST", "/api/bada/gemini/chats/save", {"messages": msgs("coerce")})
coerce_id = data["chat"]["id"]
call("POST", "/api/bada/gemini/chats/pin", {"id": coerce_id, "pinned": "false"})
status, coerced = call("GET", "/api/bada/gemini/chats")
check('pinned:"false" unpins rather than pins',
      not any(c.get("pinned") for c in coerced["chats"]),
      str([c.get("pinned") for c in coerced["chats"]]))

# A backup is how the user protects their work; the pin has to travel with it.
status, data = call("POST", "/api/bada/gemini/chats/pin", {"id": coerce_id, "pinned": True})
status, exp = call("GET", "/api/bada/gemini/chats/export")
call("POST", "/api/bada/gemini/chats/clear", {"confirm": True})
call("POST", "/api/bada/gemini/chats/import", {"payload": exp, "merge": False})
status, restored = call("GET", "/api/bada/gemini/chats")
check("the pin survives export → clear → import",
      restored["chats"] and restored["chats"][0]["pinned"] is True,
      str(restored["chats"][0].get("pinned") if restored["chats"] else "empty"))
check("the imported pin leads the list",
      restored["chats"] and restored["chats"][0]["title"] == "coerce")

# ============================================ 🖼️ thumbnails (thumbs endpoint)
# The picker shows up to three 28px previews per conversation. The hard requirement is
# SIZE: these previews must never ship the stored image, or opening the picker re-downloads
# megabytes to paint a few 28px squares.
def _comfy_venv_python():
    """The ComfyUI interpreter, which is where Pillow lives.

    The suite is documented to run under `python`, which on this machine is NOT the ComfyUI
    venv — so a bare `from PIL import Image` dies at import time and takes the whole run
    with it. Resolved once here instead, and used by both the fixture and the decoder.
    """
    try:
        import PIL  # noqa: F401
        return sys.executable
    except ImportError:
        pass
    for guess in (
        os.path.join(os.environ.get("APPDATA", ""), "..", "StabilityMatrix", "Data",
                     "Packages", "ComfyUI", "venv", "Scripts", "python.exe"),
        r"D:\StabilityMatrix\Data\Packages\ComfyUI\venv\Scripts\python.exe",
    ):
        guess = os.path.normpath(guess)
        if os.path.exists(guess):
            return guess
    raise RuntimeError("Pillow not found; install it or run this suite in the ComfyUI venv")


def _run_with_pillow(code: str) -> str:
    """Execute `code` in an interpreter that has Pillow and return its stdout."""
    import subprocess
    completed = subprocess.run([_comfy_venv_python(), "-c", code],
                               capture_output=True, text=True)
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or "pillow helper failed")
    return completed.stdout.strip()


def _png_b64(w, h, colour=(200, 40, 40)):
    script = (
        "import base64, io\n"
        "from PIL import Image\n"
        "buf = io.BytesIO()\n"
        f"Image.new('RGB', ({w}, {h}), {colour!r}).save(buf, format='PNG')\n"
        "print(base64.b64encode(buf.getvalue()).decode())\n"
    )
    return "data:image/png;base64," + _run_with_pillow(script)


def _jpeg_size(data_url: str):
    """(width, height) of a JPEG data-URL, decoded by Pillow in the venv."""
    import base64 as _b64
    payload = _b64.b64encode(_b64.b64decode(data_url.split(",", 1)[1])).decode()
    # f-string, not %-format: the payload is megabytes and `'%d %d' %` chokes on any stray
    # `%` while also being needlessly slow for a large string.
    return _run_with_pillow(
        "import base64, io\n"
        "from PIL import Image\n"
        f"im = Image.open(io.BytesIO(base64.b64decode('{payload}')))\n"
        "print(im.size[0], im.size[1])\n"
    )


BIG_PNG = _png_b64(1200, 800)

status, data = call("POST", "/api/bada/gemini/chats/save", {"messages": [{
    "role": "user", "text": "썸네일 대화에요", "images": [BIG_PNG], "imageCount": 1,
}]})
thumb_chat_id = data["chat"]["id"]
check("thumbnail chat saved", bool(thumb_chat_id))

status, thumbs = call("GET", "/api/bada/gemini/chats/thumbs",
                      query={"id": thumb_chat_id, "n": 3, "size": 28})
check("thumbs returns 200", status == 200, f"status={status}")
check("thumbs returns one preview per stored image", len(thumbs["thumbs"]) == 1,
      str(len(thumbs["thumbs"])))
check("thumbs are JPEGs (not the original PNG)", thumbs["thumbs"][0].startswith("data:image/jpeg;base64,"),
      thumbs["thumbs"][0][:30])
# THE size guarantee. A 1200x800 PNG is a few KB here; the shipped preview must be a small
# fraction of it, and small enough that 30 conversations x 3 previews stay trivial.
thumb_bytes = len(thumbs["thumbs"][0])
source_bytes = len(BIG_PNG)
check("the preview is a small fraction of the source", thumb_bytes < source_bytes / 3,
      f"thumb={thumb_bytes}B source={source_bytes}B")
check("the preview stays tiny (<4KB per image at 28px)", thumb_bytes < 4096, f"{thumb_bytes}B")
check("thumbs report the requested size", thumbs.get("size") == 28, str(thumbs.get("size")))

# The decoded pixels must actually be 28px-ish: a preview that silently ships full-size
# bytes would pass every assertion above on size only by luck of the colour.
_w, _h = (int(v) for v in _jpeg_size(thumbs["thumbs"][0]).split())
check("the decoded preview is actually downscaled", max(_w, _h) <= 28, f"{_w}x{_h}")

# `n` caps how many are returned, newest first. Three images in ONE message prove the cap
# and the ordering without needing several messages.
status, data = call("POST", "/api/bada/gemini/chats/save", {"messages": [{
    "role": "user", "text": "여러 장",
    "images": [BIG_PNG, BIG_PNG, _png_b64(300, 300, (0, 0, 255))], "imageCount": 3,
}]})
multi_id = data["chat"]["id"]
status, thumbs = call("GET", "/api/bada/gemini/chats/thumbs",
                      query={"id": multi_id, "n": 3, "size": 28})
check("n=3 returns all three images", len(thumbs["thumbs"]) == 3, str(len(thumbs["thumbs"])))
status, thumbs2 = call("GET", "/api/bada/gemini/chats/thumbs",
                       query={"id": multi_id, "n": 2, "size": 28})
check("n=2 is honoured", len(thumbs2["thumbs"]) == 2, str(len(thumbs2["thumbs"])))

# Newest first: the LAST image must lead, since that is what the user saw most recently.
# n=1 must therefore equal the FIRST entry of n=3.
status, thumbs3 = call("GET", "/api/bada/gemini/chats/thumbs",
                       query={"id": multi_id, "n": 1, "size": 28})
check("the MOST RECENT image leads (newest-first)",
      thumbs3["thumbs"][0] == thumbs["thumbs"][0],
      "n=1 did not match the first entry of n=3")

# 「저장 안 함」: images:[] with a count. There are no bytes, so no preview — but the row
# must still be told, or the list implies the conversation had no images at all.
status, data = call("POST", "/api/bada/gemini/chats/save", {"messages": [{
    "role": "user", "text": "저장 안 함", "images": [], "imageCount": 2, "imagesOmitted": True,
}]})
omitted_id = data["chat"]["id"]
status, thumbs = call("GET", "/api/bada/gemini/chats/thumbs", query={"id": omitted_id})
check("「저장 안 함」 yields no preview (there are no bytes)", thumbs["thumbs"] == [],
      str(len(thumbs["thumbs"])))
check("「저장 안 함」 still reports the omitted count", thumbs.get("omitted") == 2,
      str(thumbs.get("omitted")))

# A conversation with no images at all must be a clean empty result, not an error.
status, data = call("POST", "/api/bada/gemini/chats/save", {"messages": msgs("이미지 없음")})
plain_id = data["chat"]["id"]
status, thumbs = call("GET", "/api/bada/gemini/chats/thumbs", query={"id": plain_id})
check("a text-only conversation returns an empty, successful result",
      status == 200 and thumbs["thumbs"] == [], f"status={status} n={len(thumbs['thumbs'])}")

# Corrupt payloads must fail soft. A preview is decoration: a broken image degrades to
# "no preview", never a 500 that breaks the whole list.
status, data = call("POST", "/api/bada/gemini/chats/save", {"messages": [{
    "role": "user", "text": "깨진 이미지",
    "images": ["data:image/png;base64,AAAA", "not-a-data-url"], "imageCount": 2,
}]})
broken_id = data["chat"]["id"]
status, thumbs = call("GET", "/api/bada/gemini/chats/thumbs", query={"id": broken_id})
check("corrupt images are skipped, not fatal", status == 200 and thumbs["thumbs"] == [],
      f"status={status} n={len(thumbs['thumbs'])}")

# `size` and `n` are attacker-controlled query strings and this endpoint decodes images
# server-side, so they are clamped rather than obeyed.
status, thumbs = call("GET", "/api/bada/gemini/chats/thumbs",
                      query={"id": thumb_chat_id, "n": 9999, "size": 9999})
check("an absurd n/size is clamped, not obeyed",
      thumbs.get("size", 0) <= 128 and len(thumbs["thumbs"]) <= 6,
      f"size={thumbs.get('size')} n={len(thumbs['thumbs'])}")
status, thumbs = call("GET", "/api/bada/gemini/chats/thumbs",
                      query={"id": thumb_chat_id, "n": "abc", "size": "xyz"})
check("non-numeric n/size fall back to the defaults",
      status == 200 and thumbs.get("size") == 28, f"status={status} size={thumbs.get('size')}")

status, data = call("GET", "/api/bada/gemini/chats/thumbs", query={"id": "nope"})
check("thumbs for a missing chat 404s", status == 404, f"status={status}")
status, data = call("GET", "/api/bada/gemini/chats/thumbs")
check("thumbs without an id is a 400", status == 400, f"status={status}")

# The LIST payload must stay free of image data, or the popup re-downloads everything it
# would have lazily fetched. This is the whole reason thumbs is a separate endpoint.
status, listing = call("GET", "/api/bada/gemini/chats")
raw = json.dumps(listing)
check("the LIST payload still carries no image bytes", "base64" not in raw)
check("the LIST payload still carries no message bodies", '"messages"' not in raw)

check("history file stayed inside the temp dir",
      HISTORY_FILE.startswith(TMP_ROOT) and os.path.exists(HISTORY_FILE))

shutil.rmtree(TMP_ROOT, ignore_errors=True)

print(f"\n{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)