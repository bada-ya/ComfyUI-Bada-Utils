"""
Folder rename / move verification for the Workflow+ sidebar (workflow_organizer.js).

Regression harness for the reported bug: right-clicking a FOLDER in the left sidebar and
picking "Rename" always failed with

    HTTP 404 {"success": false, "error": "Source file not found: /<folder>"}

and the sidebar turned that into a red toast in the bottom-right corner. Root cause: the
sidebar posts folder renames to the same endpoint as workflow renames
(`POST /api/qol/workflows/move`), but that handler resolved the source with
`find_file_in_workflows()`, which can only ever return FILES - a directory never matched, so
every folder rename was a guaranteed 404.

Unlike the other scripts in this folder this one does NOT talk to a live instance. It stubs
the two ComfyUI internals the module imports (`server.PromptServer`, `folder_paths`), then
imports and registers the REAL `server/bada_server_api.py` handlers against a throw-away
temp directory. That keeps it fast, hermetic and safe to run anywhere - it never reads or
writes your real workflows folder.

    python dev_tests/bada_folder_rename_test.py
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
PKG_NAME = "bada_test_pkg"  # the real dir name contains "-" and cannot be an identifier

results = []


def check(label, cond, info=""):
    results.append(bool(cond))
    print(f"[{'PASS' if cond else 'FAIL'}] {label}" + (f" :: {info}" if info else ""))


# ---------------------------------------------------------------------------
# Bootstrap: stub ComfyUI internals, then import the real module as a package
# ---------------------------------------------------------------------------
TMP_ROOT = tempfile.mkdtemp(prefix="bada_folder_rename_")
USER_DIR = os.path.join(TMP_ROOT, "user")
WORKFLOWS = os.path.join(USER_DIR, "default", "workflows")
os.makedirs(WORKFLOWS, exist_ok=True)


class _Routes:
    """Records every route so the test can call the real handlers directly."""

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

folder_paths_stub = types.ModuleType("folder_paths")
folder_paths_stub.get_user_directory = lambda: USER_DIR
folder_paths_stub.models_dir = os.path.join(TMP_ROOT, "models")
folder_paths_stub.base_path = TMP_ROOT
sys.modules["folder_paths"] = folder_paths_stub

pkg = types.ModuleType(PKG_NAME)
pkg.__path__ = [REPO_ROOT]
sys.modules[PKG_NAME] = pkg

api = importlib.import_module(f"{PKG_NAME}.server.bada_server_api")
api.register_bada_api_routes()

# Source of the module, so handler bodies can be asserted on (not just their behaviour).
MODULE_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server", "bada_server_api.py"
)
with open(MODULE_FILE, "r", encoding="utf-8") as fh:
    path_text = fh.read()

MOVE = ROUTES.table[("POST", "/api/qol/workflows/move")]
MKDIR = ROUTES.table[("POST", "/api/qol/workflows/create_folder")]
META = ROUTES.table[("POST", "/api/qol/workflows/metadata")]

check("ROUTES-REGISTERED", callable(MOVE) and callable(MKDIR) and callable(META),
      "move/mkdir/metadata handlers captured")


class _Req:
    def __init__(self, payload):
        self._payload = payload

    async def json(self):
        return self._payload


def call(handler, **payload):
    """Invoke a real handler and return (status, decoded_json_body).

    `Response.text` is read directly instead of `Response.json()`: the latter drains the
    payload stream, which needs the same event loop that produced the response.
    """
    loop = asyncio.new_event_loop()
    try:
        resp = loop.run_until_complete(handler(_Req(payload)))
        raw = getattr(resp, "text", "") or ""
        try:
            body = json.loads(raw) if raw else {}
        except ValueError:
            body = {"_raw": raw}
        return resp.status, body
    finally:
        loop.close()


def move(source, target="/", new_name="", overwrite=False):
    return call(MOVE, source_path=source, target_folder=target,
                new_name=new_name, overwrite=overwrite)


def mkdir(name, parent="/"):
    return call(MKDIR, folder_name=name, parent_folder=parent)


def write(rel, content='{"nodes": []}'):
    full = os.path.join(WORKFLOWS, rel.replace("/", os.sep))
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        f.write(content)
    return full


def read_meta():
    meta_path = os.path.join(WORKFLOWS, ".bada_meta.json")
    if not os.path.isfile(meta_path):
        return {}
    with open(meta_path, "r", encoding="utf-8") as f:
        return json.load(f)


def reset():
    """Wipe the temp workflows root between scenarios."""
    for entry in os.listdir(WORKFLOWS):
        full = os.path.join(WORKFLOWS, entry)
        shutil.rmtree(full) if os.path.isdir(full) else os.remove(full)



# ===========================================================================
print("\n--- 1. THE REPORTED BUG: renaming a folder used to answer 404 ---------")
# ===========================================================================
reset()
mkdir("_BadaOrig")
mkdir("child", parent="/_BadaOrig")
write("_BadaOrig/child/inner.json")

status, body = move("/_BadaOrig", "/", "_BadaRenamed")
check("FOLDER-RENAME-OK", status == 200 and body.get("success") is True, f"status={status} body={body}")
check("FOLDER-RENAME-NEW-ON-DISK", os.path.isdir(os.path.join(WORKFLOWS, "_BadaRenamed")))
check("FOLDER-RENAME-OLD-GONE", not os.path.exists(os.path.join(WORKFLOWS, "_BadaOrig")))
check("FOLDER-RENAME-NO-JSON-SUFFIX",
      not any(n.endswith(".json") for n in os.listdir(WORKFLOWS)),
      f"entries={sorted(os.listdir(WORKFLOWS))}")
check("FOLDER-RENAME-CHILDREN-CAME-ALONG",
      os.path.isfile(os.path.join(WORKFLOWS, "_BadaRenamed", "child", "inner.json")))
check("FOLDER-RENAME-NEW-PATH", body.get("new_path") == "/_BadaRenamed", str(body.get("new_path")))
check("FOLDER-RENAME-TYPE", body.get("type") == "folder", str(body.get("type")))

# ===========================================================================
print("\n--- 2. Nested rename keeps the parent path ---------------------------")
# ===========================================================================
reset()
mkdir("parent")
mkdir("inner", parent="/parent")
status, body = move("/parent/inner", "/parent", "renamed")
check("NESTED-FOLDER-RENAME-OK", status == 200 and body.get("success") is True, f"status={status}")
check("NESTED-FOLDER-ON-DISK", os.path.isdir(os.path.join(WORKFLOWS, "parent", "renamed")))
check("NESTED-FOLDER-NEW-PATH", body.get("new_path") == "/parent/renamed", str(body.get("new_path")))

# ===========================================================================
print("\n--- 3. Moving a folder into another folder ---------------------------")
# ===========================================================================
reset()
mkdir("src")
mkdir("dst")
write("src/keep.json")
status, body = move("/src", "/dst", "moved")
check("FOLDER-MOVE-OK", status == 200 and body.get("success") is True, f"status={status}")
check("FOLDER-MOVE-ON-DISK", os.path.isfile(os.path.join(WORKFLOWS, "dst", "moved", "keep.json")))
check("FOLDER-MOVE-OLD-REMOVED", not os.path.exists(os.path.join(WORKFLOWS, "src")))

# ===========================================================================
print("\n--- 4. Guard rails --------------------------------------------------")
# ===========================================================================
reset()
mkdir("outer")
mkdir("inner", parent="/outer")
status, body = move("/outer", "/outer/inner", "loop")
check("SELF-SUBTREE-REJECTED", status == 400 and body.get("success") is False,
      f"status={status} {body.get('error')}")
check("SELF-SUBTREE-NO-DAMAGE", os.path.isdir(os.path.join(WORKFLOWS, "outer", "inner")))

mkdir("dup")
status, body = move("/outer", "/", "dup")
check("EXISTING-DEST-409", status == 409 and body.get("success") is False,
      f"status={status} {body.get('error')}")
check("EXISTING-DEST-INTACT", os.path.isdir(os.path.join(WORKFLOWS, "dup")))

status, body = move("/outer", "/", "bad:name")
check("INVALID-CHAR-REJECTED", status == 400 and body.get("success") is False,
      f"status={status} {body.get('error')}")
check("INVALID-CHAR-NO-DAMAGE", os.path.isdir(os.path.join(WORKFLOWS, "outer")))

status, body = move("/outer", "/", "CON")
check("RESERVED-NAME-REJECTED", status == 400 and body.get("success") is False,
      f"status={status} {body.get('error')}")

status, body = move("/../etc", "/", "hax")
check("TRAVERSAL-REJECTED", status == 400 and body.get("success") is False,
      f"status={status} {body.get('error')}")

status, body = move("/", "/", "root_rename")
check("ROOT-PROTECTED", status == 403 and body.get("success") is False,
      f"status={status} {body.get('error')}")

status, body = move("/does_not_exist", "/", "x")
check("MISSING-SOURCE-404", status == 404 and body.get("success") is False,
      f"status={status} {body.get('error')}")

# A path separator is stripped to the basename (traversal defence, unchanged behaviour):
# it must never create a nested directory.
status, body = move("/outer", "/", "nested/name")
check("SLASH-COERCED-TO-BASENAME",
      status == 200 and os.path.isdir(os.path.join(WORKFLOWS, "name")) and
      not os.path.exists(os.path.join(WORKFLOWS, "nested")),
      f"status={status} entries={sorted(os.listdir(WORKFLOWS))}")

# ===========================================================================
print("\n--- 5. Case-only rename (two-step rename on Windows) ----------------")
# ===========================================================================
reset()
mkdir("photos")
status, body = move("/photos", "/", "Photos")
check("CASE-RENAME-OK", status == 200 and body.get("success") is True, f"status={status} {body.get('error')}")
# os.listdir returns the real on-disk casing; os.path.isdir would match case-insensitively
# on Windows and therefore cannot prove the rename happened.
check("CASE-RENAME-ON-DISK", "Photos" in os.listdir(WORKFLOWS), str(os.listdir(WORKFLOWS)))
check("CASE-RENAME-NO-TEMP-LEFTOVER",
      not any("__bada_case_tmp__" in n for n in os.listdir(WORKFLOWS)), str(os.listdir(WORKFLOWS)))

# ===========================================================================
print("\n--- 6. Metadata / notes follow a folder rename -----------------------")
# ===========================================================================
reset()
mkdir("alpha")
mkdir("beta", parent="/alpha")
write("alpha/w1.json")
write("alpha/beta/w2.json")
call(META, path="alpha/w1.json", notes="first note")
call(META, path="alpha/beta/w2.json", notes="second note")
check("META-BEFORE", read_meta().get("alpha/w1.json", {}).get("notes") == "first note", str(read_meta()))

status, body = move("/alpha", "/", "gamma")
check("META-RENAME-OK", status == 200 and body.get("success") is True, f"status={status}")
meta = read_meta()
check("META-NOTES-KEPT-TOP", meta.get("gamma/w1.json", {}).get("notes") == "first note", str(meta))
check("META-NOTES-KEPT-NESTED", meta.get("gamma/beta/w2.json", {}).get("notes") == "second note", str(meta))
check("META-OLD-KEYS-GONE", "alpha/w1.json" not in meta and "alpha/beta/w2.json" not in meta, str(meta))
check("META-MIGRATED-COUNT", body.get("metadata_migrated") == 2, str(body.get("metadata_migrated")))

# ===========================================================================
print("\n--- 7. Workflow file rename must not regress -------------------------")
# ===========================================================================
reset()
write("orig.json")
status, body = move("orig.json", "/", "renamed")
check("FILE-RENAME-OK", status == 200 and body.get("success") is True, f"status={status} {body.get('error')}")
check("FILE-RENAME-JSON-APPENDED", os.path.isfile(os.path.join(WORKFLOWS, "renamed.json")))
check("FILE-RENAME-TYPE", body.get("type") == "file", str(body.get("type")))

reset()
write("a.json")
write("b.json")
status, body = move("a.json", "/", "b")
check("FILE-DUP-409", status == 409 and body.get("success") is False, f"status={status} {body.get('error')}")
check("FILE-DUP-INTACT", os.path.isfile(os.path.join(WORKFLOWS, "b.json")) and
      os.path.isfile(os.path.join(WORKFLOWS, "a.json")))

reset()
mkdir("box")
write("box/keep.json")
status, body = move("box/keep.json", "/", "moved_wf")
check("FILE-MOVE-OK", status == 200 and os.path.isfile(os.path.join(WORKFLOWS, "moved_wf.json")),
      f"status={status}")

reset()
write("note.json")
call(META, path="note.json", notes="keep me")
status, body = move("note.json", "/", "note2")
check("FILE-META-KEPT", read_meta().get("note2.json", {}).get("notes") == "keep me", str(read_meta()))

# ===========================================================================
print("\n--- 8. W2: model scan must be cached and off the event loop --------")
# ===========================================================================
MODELS = ROUTES.table[("GET", "/api/auto-assign/models")]
TREE = ROUTES.table[("GET", "/api/qol/workflows/tree")]

check("W2-ROUTES-REGISTERED", callable(MODELS) and callable(TREE))

# Count real scans so the TTL cache is observable rather than assumed.
scan_calls = {"n": 0}
_real_scan = api.get_all_available_models
def _counting_scan():
    scan_calls["n"] += 1
    return _real_scan()
api.get_all_available_models = _counting_scan

try:
    status, body = call(MODELS)
    check("W2-HANDLER-OK", status == 200 and body.get("status") == "success", f"status={status}")
    check("W2-FIRST-CALL-IS-COLD", body.get("cached") is False, f"cached={body.get('cached')}")
    check("W2-SCANNED-ONCE", scan_calls["n"] == 1, f"scans={scan_calls['n']}")

    status, body = call(MODELS)
    check("W2-SECOND-CALL-IS-WARM", body.get("cached") is True, f"cached={body.get('cached')}")
    check("W2-NO-RESCAN", scan_calls["n"] == 1, f"scans={scan_calls['n']} (TTL cache should prevent a re-walk)")

    # Expire the TTL and confirm exactly one fresh scan happens.
    api._CACHED_MODELS_AT -= (api.MODELS_CACHE_TTL_SECONDS + 1)
    status, body = call(MODELS)
    check("W2-TTL-EXPIRES", body.get("cached") is False and scan_calls["n"] == 2,
        f"cached={body.get('cached')} scans={scan_calls['n']}")

    # A failed/empty scan must never be cached.
    api._CACHED_MODELS = None
    api._CACHED_MODELS_AT = 0.0
    api.get_all_available_models = lambda: {}
    status, body = call(MODELS)
    check("W2-EMPTY-NOT-CACHED", body.get("cached") is False and api._CACHED_MODELS is None,
        f"cached={body.get('cached')}")

    api.get_all_available_models = _counting_scan

    # Both handlers must offload their blocking walk with asyncio.to_thread.
    check("W2-MODELS-USES-TO-THREAD", "asyncio.to_thread(get_all_available_models_cached)" in path_text,
        "the blocking os.walk scan must not run on the event loop")
    check("W2-TREE-USES-TO-THREAD", "await asyncio.to_thread(build_workflow_tree, root_dir)" in path_text)
    check("W2-NO-BARE-SYNC-CALL", "models_data = get_all_available_models()" not in path_text,
        "the raw blocking call must not remain in the handler")

    status, body = call(TREE)
    check("W2-TREE-STILL-WORKS", status == 200 and body.get("success") is True, f"status={status}")
finally:
    api.get_all_available_models = _real_scan

# ===========================================================================
shutil.rmtree(TMP_ROOT, ignore_errors=True)

passed = sum(results)
print(f"\n=== {passed}/{len(results)} checks passed ===")
if passed != len(results):
    print("RESULT: FAIL")
    sys.exit(1)
print("RESULT: PASS")
