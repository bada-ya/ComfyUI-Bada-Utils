"""
⚓ Bada Async Gemini Studio — 채팅 기록 저장소 (history store)
--------------------------------------------------------------------------
🔞 제미나이 탭의 대화를 JSON 파일로 영속화합니다.

왜 파일인가 (localStorage 대신)
    이 프로젝트는 이미 `engines_registry.json` 을 REST 로 읽고 쓰는 선례가 있고,
    채팅 기록은 **백업·이관이 목적**이므로 브라우저 저장소로는 충족되지 않습니다.
    특히 localStorage 는 5MB 를 다른 설정(API 키, 엔진 선택)과 **공유**하므로,
    대화 이미지가 이를 밀어내면 사용자가 모르게 설정이 사라집니다.

왜 `engines_registry.json` 과 분리한가
    그 파일은 GitHub 배포 대상입니다. 채팅 기록은 개인 데이터이므로 같은 파일에
    넣으면 실수로 배포·공개됩니다. 별도 파일로 두면 배포에서 자연스럽게 빠집니다.

용량
    서버 파일이므로 브라우저 5MB 한도 같은 강제 제한이 없습니다. 다만 무한정
    커지는 것을 막기 위해 **최근 `MAX_CHATS` 개**만 유지합니다(사용자 요청).
    이미지는 프론트가 선택한 품질(원본/2048px/1024px/안 함)로 이미 축소되므로,
    대화당 대략 0~수 MB 범위입니다.
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
import uuid

from .atomic_json import write_json_atomic

logger = logging.getLogger("ComfyUI-Bada-Utils")

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HISTORY_FILE = os.path.join(ROOT_DIR, "gemini_chat_history.json")

# 사용자가 지정한 보관 개수. 초과하면 가장 오래된 것부터 버린다.
# 상단 고정한 대화는 여기서 세지 않는다 — `_prune` 가 따로 보존한다.
MAX_CHATS = 30

# 상단 고정은 「자동 삭제되면 안 되는 대화」를 위한 것이므로, 사용자가 30개를 넘겨
# 고정한 순간 나머지가 전부 밀려나는 결과는 고-fixed 기능의 취지에 맞지 않는다.
# 대신 고정 대수도 따로 상한을 두어 파일이 무한정 커지는 것만 막는다.
MAX_PINNED = 30

# 한 대화 안에서 무한정 쌓이는 것을 막기 위한 안전망(문자 수 기준).
# 서버가 신뢰하는 한계치는 훨씬 높지만, 저장 파일이 비정상적으로 커지는 것을 막는다.
MAX_TEXT_CHARS_PER_CHAT = 2_000_000

_SLUG_RE = re.compile(r"[^0-9a-zA-Z가-힣._-]+")

# One-shot flag so a missing Pillow is logged once, not once per image per row.
_THUMB_DEP_WARNED: list = []


def _read_json(path: str, fallback):
    try:
        if not os.path.exists(path):
            return fallback
        import io

        with io.open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception as exc:  # noqa: BLE001
        logger.warning("[BadaChatHistory] failed to read %s: %s", path, exc)
        return fallback


def _write_json(path: str, payload) -> None:
    """Atomic write: temp file in the same folder + os.replace, with a .bak copy.

    A half-written history file would lose every conversation at once, so the temp-file
    dance is not optional. Shared with the rest of the pack via ``server/atomic_json.py``.
    """
    write_json_atomic(path, payload)


# ---------------------------------------------------------------------------
#  정규화 (normalize)
# ---------------------------------------------------------------------------

def _coerce_messages(raw) -> list:
    """Accept whatever the browser sent and return only what we trust.

    The stored shape per message is ``{role, text, images, imageCount,
    imagesOmitted}``. ``images`` holds either real data-URLs or a single
    ``__omitted__`` marker per image when the user chose 「저장 안 함」 — that
    marker is what lets the restored thread still *show* that an image was
    attached while sending nothing to Gemini.
    """
    if not isinstance(raw, list):
        return []

    cleaned = []
    total_chars = 0
    for item in raw:
        if not isinstance(item, dict):
            continue
        role = "user" if item.get("role") == "user" else "model"
        text = item.get("text")
        text = text if isinstance(text, str) else ""

        images = item.get("images")
        images = [i for i in images if isinstance(i, str) and i] if isinstance(images, list) else []

        # The count is authoritative for the placeholder UI; fall back to what we can see.
        raw_count = item.get("imageCount")
        image_count = raw_count if isinstance(raw_count, int) and raw_count >= 0 else len(images)
        omitted = bool(item.get("imagesOmitted"))

        # Whitespace-only text carries nothing: keeping it would inflate the title, the byte
        # counter and every restored thread with an invisible bubble.
        if not text.strip() and not images and not (omitted and image_count):
            continue

        total_chars += len(text)
        if total_chars > MAX_TEXT_CHARS_PER_CHAT:
            logger.warning(
                "[BadaChatHistory] chat text exceeded %d chars; truncating.",
                MAX_TEXT_CHARS_PER_CHAT,
            )
            break

        cleaned.append({
            "role": role,
            "text": text,
            "images": images,
            "imageCount": image_count,
            "imagesOmitted": omitted,
        })
    return cleaned


def _first_user_text(messages: list) -> str:
    """Title = the first thing the user actually asked, so the list reads like a history."""
    for msg in messages:
        if msg.get("role") != "user":
            continue
        text = (msg.get("text") or "").strip()
        if text:
            return re.sub(r"\s+", " ", text)[:60]
    return ""


def _derive_title(messages: list, fallback: str) -> str:
    title = _first_user_text(messages)
    if title:
        return title
    return (fallback or "제미나이 대화").strip()[:60]


def _summary(chat: dict) -> dict:
    """The list payload — deliberately WITHOUT message bodies or image data.

    The picker can hold 30 conversations holding images; shipping all of that just
    to render titles and timestamps would be a needless multi-megabyte response.

    ``updatedAtMs`` is exposed alongside ``updatedAt`` on purpose. The second-precision value
    is what the UI shows ("3분 전"), but the millisecond one is the authoritative recency
    key: without it a client re-sorting the list would collapse every same-second chat to a
    tie and could show a stale conversation first.
    """
    return {
        "id": chat.get("id", ""),
        "title": chat.get("title", ""),
        "updatedAt": chat.get("updatedAt", 0),
        "updatedAtMs": chat.get("updatedAtMs", 0),
        "createdAt": chat.get("createdAt", 0),
        "messageCount": len(chat.get("messages") or []),
        "imageCount": sum(
            int(m.get("imageCount") or 0) for m in (chat.get("messages") or []) if isinstance(m, dict)
        ),
        "bytes": int(chat.get("bytes") or 0),
        # The picker needs this to render the fixed section and keep it above the
        # recency-ordered remainder.
        "pinned": bool(chat.get("pinned")),
    }


def _prune(chats: list) -> list:
    """Keep the newest MAX_CHATS UNPINNED conversations, newest first, and keep every
    pinned one regardless of age.

    The caller stores the list already ordered (updatedAt desc), so slicing is enough.

    Why pinned entries escape the cap: 「상단 고정」 exists so a conversation the user
    explicitly kept cannot be silently deleted by the next save once the cap is reached.
    Counting pinned chats against the cap would defeat the feature — pinning thirty
    conversations would evict everything else, and the pinned set itself would still be
    at the mercy of whichever save pushed the total over.

    The pinned set is separately bounded (MAX_PINNED) purely as a guard against an
    unbounded file; pruning drops the OLDEST pinned entries beyond that.
    """
    if len(chats) <= MAX_CHATS and sum(1 for c in chats if c.get("pinned")) <= MAX_PINNED:
        return chats

    pinned = [c for c in chats if c.get("pinned")]
    loose = [c for c in chats if not c.get("pinned")]
    dropped_pinned = max(0, len(pinned) - MAX_PINNED)
    if dropped_pinned:
        pinned = pinned[:MAX_PINNED]
    dropped_loose = max(0, len(loose) - MAX_CHATS)
    if dropped_loose:
        logger.info("[BadaChatHistory] pruned %d chat(s) over the %d cap",
                    dropped_loose, MAX_CHATS)
    if dropped_pinned:
        logger.info("[BadaChatHistory] pruned %d PINNED chat(s) over the %d limit",
                    dropped_pinned, MAX_PINNED)
    # Newest first again: a pinned chat rescued from the trim must not jump ahead of
    # newer unpinned ones, so the two halves are merged back in recency order.
    return sorted(pinned + loose[:MAX_CHATS],
                  key=lambda c: (int(c.get("updatedAtMs") or 0),
                                 int(c.get("updatedAt") or 0)),
                  reverse=True)


def load_store() -> dict:
    data = _read_json(HISTORY_FILE, {})
    if not isinstance(data, dict):
        data = {}
    chats = data.get("chats")
    data["chats"] = [c for c in chats if isinstance(c, dict)] if isinstance(chats, list) else []
    data.setdefault("version", 1)
    return data


def save_store(data: dict) -> None:
    data["chats"] = _prune(data.get("chats") or [])
    data["version"] = 1
    _write_json(HISTORY_FILE, data)


# ---------------------------------------------------------------------------
#  공개 API (upsert / delete / export / import)
# ---------------------------------------------------------------------------

def upsert_chat(chat_id: str, title: str, messages: list) -> dict:
    """Insert or update one conversation and return its summary.

    ``messages`` arriving with the SAME id replaces the stored copy wholesale —
    the browser is authoritative because it holds the live thread. Every send
    calls this, so an interrupted session still leaves the last complete turn.
    """
    cleaned = _coerce_messages(messages)
    if not cleaned:
        raise ValueError("저장할 메시지가 없습니다.")

    data = load_store()
    chats = data.get("chats") or []

    now = int(time.time())
    entry_id = (chat_id or "").strip() or f"chat-{uuid.uuid4().hex[:12]}"

    existing = None
    for chat in chats:
        if chat.get("id") == entry_id:
            existing = chat
            break

    # Millisecond precision, not seconds. A burst of saves (a scripted import, or just
    # several quick messages) lands inside ONE second, and every row then shares an
    # `updatedAt`, which makes the newest-first sort a no-op: Python's sort is stable, so the
    # 30-cap would prune by INSERTION order instead of recency and could discard the chat the
    # user just wrote. Subtracting a millisecond from every existing row guarantees the new
    # entry outranks all of them no matter how fast they arrive.
    now_ms = int(time.time() * 1000)
    if existing is None and chats:
        try:
            highest = max(int(c.get("updatedAtMs") or 0) for c in chats)
            if now_ms <= highest:
                now_ms = highest + 1
        except Exception:  # noqa: BLE001
            pass

    # Approximate on-disk cost for the picker; cheap and good enough for a label.
    try:
        size = len(json.dumps(cleaned, ensure_ascii=False).encode("utf-8"))
    except Exception:  # noqa: BLE001
        size = 0

    entry = {
        "id": entry_id,
        "title": _derive_title(cleaned, title),
        "createdAt": (existing or {}).get("createdAt") or now,
        "updatedAt": now,
        "updatedAtMs": now_ms,
        "messages": cleaned,
        "bytes": size,
        # Pin survives resaves. `upsert_chat` REPLACES the stored dict wholesale (the
        # browser owns the live thread), so a pin that is not copied here would silently
        # vanish the moment the user sends one more message in that conversation.
        "pinned": bool((existing or {}).get("pinned")),
    }

    if existing is not None:
        chats[chats.index(existing)] = entry
    else:
        chats.append(entry)

    # Newest first — `_prune` relies on this ordering to drop the oldest. `updatedAtMs` is
    # the real key; `updatedAt` only breaks ties so older files (saved before this field
    # existed) still sort deterministically.
    chats.sort(
        key=lambda c: (int(c.get("updatedAtMs") or 0), int(c.get("updatedAt") or 0)),
        reverse=True,
    )
    data["chats"] = chats
    save_store(data)
    return _summary(entry)


def delete_chat(chat_id: str) -> bool:
    data = load_store()
    chats = data.get("chats") or []
    remaining = [c for c in chats if c.get("id") != chat_id]
    if len(remaining) == len(chats):
        return False
    data["chats"] = remaining
    save_store(data)
    return True


def set_chat_pinned(chat_id: str, pinned: bool) -> dict:
    """Flip a conversation's pin and return its new summary.

    `pinned` is applied AFTER loading so the flag is never lost to a concurrent
    upsert, and it touches only this field: rewriting `updatedAt` here would be wrong
    — pinning is not activity, and bumping recency would make a pinned-but-ancient chat
    jump to the top of the unpinned ordering the moment it is unpinned again.
    """
    data = load_store()
    chats = data.get("chats") or []
    for chat in chats:
        if chat.get("id") == chat_id:
            chat["pinned"] = bool(pinned)
            data["chats"] = chats
            save_store(data)
            return _summary(chat)
    raise KeyError(chat_id)


def chat_thumbnails(chat_id: str, limit: int = 3, size: int = 28) -> dict:
    """Up to `limit` tiny data-URL previews of a conversation's most RECENT images.

    Why a separate endpoint instead of putting thumbnails in the list payload: the store
    holds 30 conversations, each of which may carry images at up to the original quality.
    Inlining even three 28px previews per row would still force the browser to parse every
    conversation's images on every popup open, and the list endpoint's whole design goal
    (see `_summary`) is to stay small. This way the browser asks for previews only for the
    rows it actually scrolls into view.

    Ordering is newest-first, which is what the picker wants: the last image in a thread is
    the most recent thing the user saw. Walking messages backwards is what makes that fall
    out for free.

    `imageCount` still set but `images` empty (「저장 안 함」) have no bytes to preview, so
    they are skipped and reported as `omitted` — the row then renders a placeholder instead
    of implying the conversation had no images at all.
    """
    chat = get_chat(chat_id)
    if chat is None:
        raise KeyError(chat_id)

    thumbs: list = []
    omitted = 0
    # Newest first: reverse walk so "most recent image" leads.
    for message in reversed(chat.get("messages") or []):
        if not isinstance(message, dict):
            continue
        images = [i for i in (message.get("images") or []) if isinstance(i, str) and i]
        for image in reversed(images):
            made = _make_thumbnail(image, size)
            if made:
                thumbs.append(made)
            if len(thumbs) >= limit:
                break
        # 「저장 안 함」 stores `images: []` with `imageCount` still set (the browser has no
        # bytes to send), so the shortfall IS the omitted count. There is no `__omitted__`
        # marker in the file — that constant lives in the browser and is applied on restore.
        if message.get("imagesOmitted"):
            omitted += max(0, int(message.get("imageCount") or 0))
        if len(thumbs) >= limit:
            break

    return {"thumbs": thumbs, "omitted": omitted, "size": size}


def _make_thumbnail(data_url: str, size: int) -> str:
    """One data-URL → a `size`px JPEG data-URL, or "" when anything is unusable.

    Fails soft on purpose. A thumbnail is decoration: an unreadable, animated or gigantic
    image must degrade to "no preview", never to a 500 that breaks the whole list.

    Pillow ships with ComfyUI (it is required by the image loaders), so this is normally
    present. If it ever is not — a minimal install, or this module imported outside the
    ComfyUI venv — the ImportError is logged ONCE and every image silently returns "".
    That is the right failure mode for the UI, but it must not be invisible to the user:
    a warn makes 「previews are off」 diagnosable from the console instead of looking like
    「my images are broken」.
    """
    try:
        import base64

        from PIL import Image
        import io
    except ImportError:
        if not _THUMB_DEP_WARNED:
            _THUMB_DEP_WARNED.append(True)
            logger.warning(
                "[BadaChatHistory] Pillow is unavailable, so chat-history image previews "
                "are disabled (the list still works). Install Pillow in the ComfyUI "
                "environment to enable them."
            )
        return ""
    try:

        match = re.match(r"^data:image/[a-zA-Z0-9.+-]+;base64,(.+)$", data_url.strip(), re.S)
        if not match:
            return ""
        raw = base64.b64decode(match.group(1), validate=False)
        if not raw:
            return ""

        with Image.open(io.BytesIO(raw)) as image:
            # Animated GIFs / APNGs would otherwise decode frame-by-frame for no benefit.
            try:
                image.seek(0)
            except Exception:  # noqa: BLE001
                pass
            # Paletted + transparency modes must go through RGB or JPEG encoding raises.
            if image.mode not in ("RGB", "L"):
                image = image.convert("RGBA")
                # Flatten onto dark grey so transparent PNGs don't become black squares.
                backdrop = Image.new("RGB", image.size, (32, 32, 36))
                backdrop.paste(image, mask=image.split()[-1])
                image = backdrop
            elif image.mode == "L":
                image = image.convert("RGB")
            # thumbnail() only ever SHRINKS, so a small source keeps its own size — which is
            # what we want; upscaling a 40px image to 28px would just blur it.
            image.thumbnail((size, size), Image.LANCZOS)
            buffer = io.BytesIO()
            # quality=60 at 28px is visually indistinguishable from q=90 and ~1/4 the bytes.
            image.save(buffer, format="JPEG", quality=60, optimize=True)
        return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
    except Exception as exc:  # noqa: BLE001
        # Deliberately NOT interpolated with `chat_id`: this function has no such parameter,
        # and referencing it here raised NameError INSIDE the handler — which would replace
        # the soft "no preview" fallback with a hard 500 that takes down the whole list.
        logger.debug("[BadaChatHistory] thumbnail skipped: %s", exc)
        return ""


def get_chat(chat_id: str):
    for chat in (load_store().get("chats") or []):
        if chat.get("id") == chat_id:
            return chat
    return None


def list_chats() -> list:
    """Pinned conversations first, then the rest newest-first.

    The store is already recency-ordered, so the only thing this adds is the leading
    pinned block. Doing it HERE rather than in the picker means the ordering survives
    anywhere else the list is consumed, and the browser does not need to re-sort
    (which is exactly where a same-second tie could reshuffle rows under the cursor).
    """
    chats = load_store().get("chats") or []
    pinned = [c for c in chats if c.get("pinned")]
    loose = [c for c in chats if not c.get("pinned")]
    return [_summary(c) for c in pinned + loose]


def export_store() -> dict:
    """The whole store, for a user-initiated backup download."""
    data = load_store()
    return {
        "version": 1,
        "exportedAt": int(time.time()),
        "maxChats": MAX_CHATS,
        "maxPinned": MAX_PINNED,
        "chats": data.get("chats") or [],
    }


def import_store(payload: dict, merge: bool = False) -> int:
    """Restore from a user-supplied backup. Returns how many chats were added.

    ``merge=False`` replaces everything (the explicit 「전체 교체」 action);
    ``merge=True`` keeps local chats whose ids are not in the file, which is the
    safe default for 「병합」. Ids that collide are overwritten by the file so a
    re-import of your own backup is idempotent.
    """
    if not isinstance(payload, dict):
        raise ValueError("백업 파일 형식이 올바르지 않습니다.")
    incoming = payload.get("chats")
    if not isinstance(incoming, list):
        raise ValueError("백업 파일에 chats 목록이 없습니다.")

    normalized = []
    base_ms = int(time.time() * 1000)
    for index, item in enumerate(incoming):
        if not isinstance(item, dict):
            continue
        messages = _coerce_messages(item.get("messages"))
        if not messages:
            continue
        entry_id = (item.get("id") or "").strip() or f"chat-{uuid.uuid4().hex[:12]}"
        try:
            size = int(item.get("bytes") or 0) or len(
                json.dumps(messages, ensure_ascii=False).encode("utf-8")
            )
        except Exception:  # noqa: BLE001
            size = 0
        normalized.append({
            "id": entry_id,
            "title": (item.get("title") or "").strip()[:60] or _derive_title(messages, ""),
            "createdAt": int(item.get("createdAt") or time.time()),
            "updatedAt": int(item.get("updatedAt") or time.time()),
            # Backups written before `updatedAtMs` existed have none; derive a strictly
            # decreasing sequence so the newest-first order survives the round trip instead
            # of collapsing to one shared timestamp.
            "updatedAtMs": int(item.get("updatedAtMs") or (base_ms + index)),
            "messages": messages,
            "bytes": size,
            # Pin travels with the backup. Dropping it here would silently UNPIN
            # conversations the user deliberately kept — the exact protection the pin
            # exists for, lost on the one action meant to preserve their work.
            "pinned": bool(item.get("pinned")),
        })

    if merge:
        data = load_store()
        by_id = {c.get("id"): c for c in (data.get("chats") or [])}
        for chat in normalized:
            by_id[chat["id"]] = chat
        merged = list(by_id.values())
    else:
        merged = normalized

    merged.sort(
        key=lambda c: (int(c.get("updatedAtMs") or 0), int(c.get("updatedAt") or 0)),
        reverse=True,
    )
    data = {"version": 1, "chats": _prune(merged)}
    save_store(data)
    return len(normalized)