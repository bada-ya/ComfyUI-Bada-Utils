# -*- coding: utf-8 -*-
"""
⚓ Bada Prompt Generator — Registry management REST API
=======================================================
Serves the node front-end (`web/bada_prompt_generator.js`) and the
"모델 관리" modal (`web/bada_promptgen_modal.js`).

Endpoints
---------
GET  /api/bada/promptgen/registry            read registry (+ live gemini model info)
POST /api/bada/promptgen/user_prompts/save   create / update a custom system prompt
POST /api/bada/promptgen/user_prompts/delete remove a custom system prompt
POST /api/bada/promptgen/user_prompts/move   reorder a custom system prompt
POST /api/bada/gemini/prompts/save           create / update a Gemini-only system prompt
POST /api/bada/gemini/prompts/delete         remove a Gemini-only system prompt
POST /api/bada/gemini/prompts/move           reorder a Gemini-only system prompt
POST /api/bada/promptgen/defaults            persist the node default widget values
GET  /api/bada/gemini/chats                  list saved 제미나이 chats (summaries only)
GET  /api/bada/gemini/chats/get?id=           load one chat with its full history
GET  /api/bada/gemini/chats/thumbs?id=&n=&size=  tiny previews (28px) of that chat's images
POST /api/bada/gemini/chats/save             create / update one chat
POST /api/bada/gemini/chats/delete           remove one chat
POST /api/bada/gemini/chats/pin              toggle 「상단 고정」 — exempt from the 30-chat cap
POST /api/bada/gemini/chats/clear            remove every chat (requires confirm:true)
GET  /api/bada/gemini/chats/export           download a .json backup of every chat
POST /api/bada/gemini/chats/import           restore from a .json backup

`user_prompts` drives the 📜 시스템 프롬프트 engine tab, while `gemini_prompts`
is a completely separate list used ONLY by the 🔞 제미나이 chat tab
(consumed by server/gemini_api.py::find_gemini_chat_prompt).

Storage is split, and every endpoint below follows the same rule:
  * read  — the merged view of the distributed `engines_registry.json` and the
    user's own `engines_registry_user.json` (server/registry_store.py).
  * write — the USER file only. The distributed file is never written again, so a
    `git pull` or a Manager update can no longer erase a hand-written prompt.
Prompts shipped with `"built_in": true` are examples: they stay visible and
editable in the merged view, but both delete endpoints refuse them (403).

Writes are atomic and keep a `.bak` snapshot, because
`nodes/bada_prompt_generator.py::load_registry()` caches by mtime and therefore
picks every successful save up immediately (no restart required).
"""
from __future__ import annotations

import json
import logging
import os
import re
import uuid

from . import registry_store
from .atomic_json import read_json_fallback

logger = logging.getLogger("ComfyUI-Bada-Utils")

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_FILE = os.path.join(ROOT_DIR, "config.json")

ALLOWED_DEFAULT_KEYS = ("target", "submenu", "enhance", "uncensored", "duration")
SLUG_RE = re.compile(r"[^a-z0-9가-힣._-]+")

# 배포본/사용자본 경로와 입출력 규칙은 전부 server/registry_store.py 의 계약이다.
# 여기서는 read_user()/write_user() 만 쓰기 때문에 "어느 쪽을 덮쓰는가" 가 코드에 남지 않는다.
BUILT_IN_DELETE_ERROR = "기본 제공 프롬프트는 삭제할 수 없습니다."


def _read_json(path: str, fallback):
    return read_json_fallback(path, fallback, log_prefix="[BadaPromptGen]")


def _slugify(text: str) -> str:
    cleaned = SLUG_RE.sub("-", (text or "").strip().lower()).strip("-")
    return cleaned[:48] or "prompt"


def _registry_payload() -> dict:
    """Registry enriched with the live Gemini model selection (from config.json)."""
    registry = registry_store.load_registry()
    registry = dict(registry)
    registry.setdefault("user_prompts", [])
    registry.setdefault("gemini_prompts", [])
    registry.setdefault("targets", [])

    config = _read_json(CONFIG_FILE, {})
    if isinstance(config, dict):
        registry["gemini_model"] = config.get("default_model") or registry.get("gemini_model") or ""
    try:
        from .gemini_api import EXACT_MODELS  # type: ignore

        registry["gemini_models"] = EXACT_MODELS
    except Exception:  # noqa: BLE001
        registry.setdefault("gemini_models", [])
    return registry


def _as_bool(value) -> bool:
    """JSON truthiness that survives stringified booleans.

    `bool("false")` is True in Python, so a client that serialises a checkbox as a string
    would PIN the very chat the user just unpinned — an inversion that produces no error
    and no obvious symptom. The string cases are handled explicitly; anything else keeps
    plain Python truthiness.
    """
    if isinstance(value, str):
        return value.strip().lower() not in ("", "0", "false", "no", "off")
    return bool(value)


def _find_prompt_index(prompts: list, key: str) -> int:
    if not key:
        return -1
    for index, item in enumerate(prompts):
        if isinstance(item, dict) and (item.get("id") == key or item.get("name") == key):
            return index
    return -1


def register_promptgen_api_routes():
    try:
        import server
        from aiohttp import web

        if getattr(server, "PromptServer", None) is None or server.PromptServer.instance is None:
            # Instance not created yet (version-dependent startup order). Retry in a
            # bounded background poller instead of deferring forever — the old code
            # logged "routes deferred" but nothing ever re-ran this.
            from .route_registration import register_when_ready

            def _retry_register():
                register_promptgen_api_routes()  # instance exists by then → full registration below

            register_when_ready(_retry_register, label="PromptGen API routes")
            return
        routes = server.PromptServer.instance.routes
    except Exception as exc:  # noqa: BLE001
        logger.warning("[BadaPromptGen] could not bind routes: %s", exc)
        return

    @routes.get("/api/bada/promptgen/registry")
    async def get_registry(request):
        try:
            return web.json_response({"success": True, "registry": _registry_payload()})
        except Exception as exc:  # noqa: BLE001
            logger.exception("[BadaPromptGen] registry read failed")
            return web.json_response({"success": False, "error": str(exc)}, status=500)

    @routes.post("/api/bada/promptgen/user_prompts/save")
    async def save_user_prompt(request):
        try:
            body = await request.json()
            name = (body.get("name") or "").strip()
            # `system_prompt` is what the modal sends; `text` is the key the registry and
            # the node read — accept either so manual/programmatic callers never 400 wrongly.
            system_prompt = (body.get("system_prompt") or body.get("text") or "").strip()
            if not name:
                return web.json_response({"success": False, "error": "이름을 입력해 주세요."}, status=400)
            if not system_prompt:
                return web.json_response({"success": False, "error": "시스템 프롬프트 내용을 입력해 주세요."}, status=400)

            registry = registry_store.read_user()
            prompts = registry.get("user_prompts")
            if not isinstance(prompts, list):
                prompts = []

            entry_id = (body.get("id") or "").strip()
            entry = {
                "id": entry_id or f"{_slugify(name)}-{uuid.uuid4().hex[:6]}",
                "name": name,
                "text": system_prompt,
                "description": (body.get("description") or "").strip(),
                "output_format": body.get("output_format") if body.get("output_format") in ("text", "json") else "text",
                "output_fields": (
                    body.get("output_fields") if isinstance(body.get("output_fields"), list) else ["rewritten_prompt"]
                ),
                "images": (
                    body.get("images")
                    if isinstance(body.get("images"), dict)
                    else {"mode": "multi", "inject_refs": False, "vision": True}
                ),
                "built_in": False,
            }

            index = _find_prompt_index(prompts, entry_id) if entry_id else _find_prompt_index(prompts, name)
            if index >= 0:
                merged = dict(prompts[index])
                merged.update(entry)
                merged["id"] = prompts[index].get("id") or entry["id"]
                merged["built_in"] = bool(prompts[index].get("built_in"))
                prompts[index] = merged
                stored = merged
                action = "updated"
            else:
                while _find_prompt_index(prompts, entry["id"]) >= 0:
                    entry["id"] = f"{_slugify(name)}-{uuid.uuid4().hex[:6]}"
                prompts.append(entry)
                stored = entry
                action = "created"

            registry["user_prompts"] = prompts
            registry_store.write_user(registry)
            logger.info("[BadaPromptGen] user prompt %s: %s", action, name)
            return web.json_response({
                "success": True,
                "action": action,
                # Echo exactly what is on disk: on an update-by-name the id stays the
                # pre-existing one, and the modal re-selects its row through this id.
                "entry": stored,
                "registry": _registry_payload(),
            })
        except Exception as exc:  # noqa: BLE001
            logger.exception("[BadaPromptGen] save failed")
            return web.json_response({"success": False, "error": str(exc)}, status=500)

    @routes.post("/api/bada/promptgen/user_prompts/delete")
    async def delete_user_prompt(request):
        try:
            body = await request.json()
            key = (body.get("id") or body.get("name") or "").strip()
            registry = registry_store.read_user()
            prompts = registry.get("user_prompts")
            if not isinstance(prompts, list):
                return web.json_response({"success": False, "error": "저장된 사용자 프롬프트가 없습니다."}, status=404)

            index = _find_prompt_index(prompts, key)
            if index < 0:
                return web.json_response({"success": False, "error": f"'{key}' 항목을 찾을 수 없습니다."}, status=404)
            if prompts[index].get("built_in"):
                return web.json_response({"success": False, "error": BUILT_IN_DELETE_ERROR}, status=403)

            removed = prompts.pop(index)
            registry["user_prompts"] = prompts
            registry_store.write_user(registry)
            return web.json_response({"success": True, "removed": removed, "registry": _registry_payload()})
        except Exception as exc:  # noqa: BLE001
            logger.exception("[BadaPromptGen] delete failed")
            return web.json_response({"success": False, "error": str(exc)}, status=500)

    @routes.post("/api/bada/promptgen/user_prompts/move")
    async def move_user_prompt(request):
        try:
            body = await request.json()
            key = (body.get("id") or body.get("name") or "").strip()
            direction = (body.get("direction") or "").strip().lower()
            if direction not in ("up", "down"):
                return web.json_response({"success": False, "error": "direction 은 up 또는 down 이어야 합니다."}, status=400)

            registry = registry_store.read_user()
            prompts = registry.get("user_prompts")
            if not isinstance(prompts, list) or not prompts:
                return web.json_response({"success": False, "error": "저장된 사용자 프롬프트가 없습니다."}, status=404)

            index = _find_prompt_index(prompts, key)
            if index < 0:
                return web.json_response({"success": False, "error": f"'{key}' 항목을 찾을 수 없습니다."}, status=404)
            target_index = index - 1 if direction == "up" else index + 1
            if target_index < 0 or target_index >= len(prompts):
                return web.json_response({"success": True, "moved": False, "registry": _registry_payload()})

            prompts[index], prompts[target_index] = prompts[target_index], prompts[index]
            registry["user_prompts"] = prompts
            registry_store.write_user(registry)
            return web.json_response({"success": True, "moved": True, "registry": _registry_payload()})
        except Exception as exc:  # noqa: BLE001
            logger.exception("[BadaPromptGen] move failed")
            return web.json_response({"success": False, "error": str(exc)}, status=500)

    @routes.post("/api/bada/gemini/prompts/save")
    async def save_gemini_prompt(request):
        """Create / update a Gemini-only system prompt (🔞 제미나이 탭 전용)."""
        try:
            body = await request.json()
            name = (body.get("name") or "").strip()
            system_prompt = (body.get("system_prompt") or body.get("text") or "").strip()
            if not name:
                return web.json_response({"success": False, "error": "이름을 입력해 주세요."}, status=400)
            if not system_prompt:
                return web.json_response({"success": False, "error": "시스템 프롬프트 내용을 입력해 주세요."}, status=400)

            registry = registry_store.read_user()
            prompts = registry.get("gemini_prompts")
            if not isinstance(prompts, list):
                prompts = []

            entry_id = (body.get("id") or "").strip()
            entry = {
                "id": entry_id or f"gem-{_slugify(name)}-{uuid.uuid4().hex[:6]}",
                "name": name,
                "text": system_prompt,
                "description": (body.get("description") or "").strip(),
            }

            index = _find_prompt_index(prompts, entry_id) if entry_id else _find_prompt_index(prompts, name)
            if index >= 0:
                merged = dict(prompts[index])
                merged.update(entry)
                merged["id"] = prompts[index].get("id") or entry["id"]
                prompts[index] = merged
                stored = merged
                action = "updated"
            else:
                while _find_prompt_index(prompts, entry["id"]) >= 0:
                    entry["id"] = f"gem-{_slugify(name)}-{uuid.uuid4().hex[:6]}"
                prompts.append(entry)
                stored = entry
                action = "created"

            registry["gemini_prompts"] = prompts
            registry_store.write_user(registry)
            logger.info("[BadaPromptGen] gemini prompt %s: %s", action, name)
            return web.json_response({
                "success": True,
                "action": action,
                "entry": stored,
                "registry": _registry_payload(),
            })
        except Exception as exc:  # noqa: BLE001
            logger.exception("[BadaPromptGen] gemini prompt save failed")
            return web.json_response({"success": False, "error": str(exc)}, status=500)

    @routes.post("/api/bada/gemini/prompts/delete")
    async def delete_gemini_prompt(request):
        try:
            body = await request.json()
            key = (body.get("id") or body.get("name") or "").strip()
            registry = registry_store.read_user()
            prompts = registry.get("gemini_prompts")
            if not isinstance(prompts, list) or not prompts:
                return web.json_response({"success": False, "error": "저장된 제미나이 프롬프트가 없습니다."}, status=404)

            index = _find_prompt_index(prompts, key)
            if index < 0:
                return web.json_response({"success": False, "error": f"'{key}' 항목을 찾을 수 없습니다."}, status=404)
            # 배포본이 예시로 넣어둔 항목(built_in) 은 📜 탭과 동일하게 삭제 대상이 아니다.
            # 사용자 파일에도 플래그가 찍혀 있어야 하므로 판단은 read_user() 의 결과로 한다.
            if prompts[index].get("built_in"):
                return web.json_response({"success": False, "error": BUILT_IN_DELETE_ERROR}, status=403)

            removed = prompts.pop(index)
            registry["gemini_prompts"] = prompts
            registry_store.write_user(registry)
            return web.json_response({"success": True, "removed": removed, "registry": _registry_payload()})
        except Exception as exc:  # noqa: BLE001
            logger.exception("[BadaPromptGen] gemini prompt delete failed")
            return web.json_response({"success": False, "error": str(exc)}, status=500)

    @routes.post("/api/bada/gemini/prompts/move")
    async def move_gemini_prompt(request):
        try:
            body = await request.json()
            key = (body.get("id") or body.get("name") or "").strip()
            direction = (body.get("direction") or "").strip().lower()
            if direction not in ("up", "down"):
                return web.json_response({"success": False, "error": "direction 은 up 또는 down 이어야 합니다."}, status=400)

            registry = registry_store.read_user()
            prompts = registry.get("gemini_prompts")
            if not isinstance(prompts, list) or not prompts:
                return web.json_response({"success": False, "error": "저장된 제미나이 프롬프트가 없습니다."}, status=404)

            index = _find_prompt_index(prompts, key)
            if index < 0:
                return web.json_response({"success": False, "error": f"'{key}' 항목을 찾을 수 없습니다."}, status=404)
            target_index = index - 1 if direction == "up" else index + 1
            if target_index < 0 or target_index >= len(prompts):
                return web.json_response({"success": True, "moved": False, "registry": _registry_payload()})

            prompts[index], prompts[target_index] = prompts[target_index], prompts[index]
            registry["gemini_prompts"] = prompts
            registry_store.write_user(registry)
            return web.json_response({"success": True, "moved": True, "registry": _registry_payload()})
        except Exception as exc:  # noqa: BLE001
            logger.exception("[BadaPromptGen] gemini prompt move failed")
            return web.json_response({"success": False, "error": str(exc)}, status=500)

    @routes.post("/api/bada/promptgen/defaults")
    async def save_defaults(request):
        try:
            body = await request.json()
            registry = registry_store.read_user()
            defaults = registry.get("defaults") if isinstance(registry.get("defaults"), dict) else {}
            for key in ALLOWED_DEFAULT_KEYS:
                if key in body:
                    defaults[key] = body[key]
            registry["defaults"] = defaults
            registry_store.write_user(registry)
            return web.json_response({"success": True, "defaults": defaults})
        except Exception as exc:  # noqa: BLE001
            logger.exception("[BadaPromptGen] defaults save failed")
            return web.json_response({"success": False, "error": str(exc)}, status=500)

    # ------------------------------------------------------------------
    #  🔞 제미나이 채팅 기록 (chat history)
    #
    #  Stored in its own file (gemini_chat_history.json), NOT in engines_registry.json:
    #  the distributed registry ships from GitHub, private data never does (personal
    #  prompts moved to engines_registry_user.json for exactly that reason).
    #  See server/gemini_chat_history.py for the storage rationale.
    # ------------------------------------------------------------------

    @routes.get("/api/bada/gemini/chats")
    async def list_gemini_chats(request):
        """List view only — titles, counts and sizes, never message bodies or images."""
        try:
            from . import gemini_chat_history as history

            chats = history.list_chats()
            return web.json_response({
                "success": True,
                "chats": chats,
                "maxChats": history.MAX_CHATS,
            })
        except Exception as exc:  # noqa: BLE001
            logger.exception("[BadaChatHistory] list failed")
            return web.json_response({"success": False, "error": str(exc)}, status=500)

    @routes.get("/api/bada/gemini/chats/get")
    async def get_gemini_chat(request):
        try:
            from . import gemini_chat_history as history

            chat_id = (request.rel_url.query.get("id") or "").strip()
            if not chat_id:
                return web.json_response({"success": False, "error": "id가 필요합니다."}, status=400)
            chat = history.get_chat(chat_id)
            if chat is None:
                return web.json_response({"success": False, "error": "대화를 찾을 수 없습니다."}, status=404)
            return web.json_response({"success": True, "chat": chat})
        except Exception as exc:  # noqa: BLE001
            logger.exception("[BadaChatHistory] get failed")
            return web.json_response({"success": False, "error": str(exc)}, status=500)

    @routes.post("/api/bada/gemini/chats/save")
    async def save_gemini_chat(request):
        try:
            from . import gemini_chat_history as history

            body = await request.json()
            summary = history.upsert_chat(
                chat_id=(body.get("id") or "").strip(),
                title=(body.get("title") or "").strip(),
                messages=body.get("messages"),
            )
            return web.json_response({"success": True, "chat": summary})
        except ValueError as exc:
            return web.json_response({"success": False, "error": str(exc)}, status=400)
        except Exception as exc:  # noqa: BLE001
            logger.exception("[BadaChatHistory] save failed")
            return web.json_response({"success": False, "error": str(exc)}, status=500)

    @routes.post("/api/bada/gemini/chats/delete")
    async def delete_gemini_chat(request):
        try:
            from . import gemini_chat_history as history

            body = await request.json()
            chat_id = (body.get("id") or "").strip()
            if not chat_id:
                return web.json_response({"success": False, "error": "id가 필요합니다."}, status=400)
            if not history.delete_chat(chat_id):
                return web.json_response({"success": False, "error": "대화를 찾을 수 없습니다."}, status=404)
            return web.json_response({"success": True})
        except Exception as exc:  # noqa: BLE001
            logger.exception("[BadaChatHistory] delete failed")
            return web.json_response({"success": False, "error": str(exc)}, status=500)

    @routes.get("/api/bada/gemini/chats/thumbs")
    async def thumb_gemini_chat(request):
        """Up to 3 tiny previews of one conversation's most recent images.

        Deliberately separate from the LIST payload: 30 conversations × 3 previews would make
        opening the picker parse image data it usually never displays. `n` and `size` are
        clamped rather than trusted, since both are attacker-controllable query strings and
        this endpoint decodes base64 images on the server.
        """
        try:
            from . import gemini_chat_history as history

            # `request.rel_url.query`, NOT `request.query`: that is the accessor every other
            # GET handler in this file uses (see the chats/get route), and it is the one the
            # aiohttp stub exposes. Using `request.query` here raised AttributeError and
            # surfaced as a 500 for a request that was perfectly valid.
            query = request.rel_url.query
            chat_id = (query.get("id") or "").strip()
            if not chat_id:
                return web.json_response({"success": False, "error": "id가 필요합니다."}, status=400)
            try:
                count = max(1, min(6, int(query.get("n", 3))))
                size = max(16, min(128, int(query.get("size", 28))))
            except (TypeError, ValueError):
                count, size = 3, 28
            summary = history.chat_thumbnails(chat_id, limit=count, size=size)
            return web.json_response({"success": True, **summary})
        except KeyError:
            return web.json_response({"success": False, "error": "대화를 찾을 수 없습니다."}, status=404)
        except Exception as exc:  # noqa: BLE001
            logger.exception("[BadaChatHistory] thumbs failed")
            return web.json_response({"success": False, "error": str(exc)}, status=500)

    @routes.post("/api/bada/gemini/chats/pin")
    async def pin_gemini_chat(request):
        """Toggle 「상단 고정」. A pinned chat is exempt from the 30-conversation cap."""
        try:
            from . import gemini_chat_history as history

            body = await request.json()
            chat_id = (body.get("id") or "").strip()
            if not chat_id:
                return web.json_response({"success": False, "error": "id가 필요합니다."}, status=400)
            summary = history.set_chat_pinned(chat_id, _as_bool(body.get("pinned")))
            return web.json_response({"success": True, "chat": summary})
        except KeyError:
            return web.json_response({"success": False, "error": "대화를 찾을 수 없습니다."}, status=404)
        except Exception as exc:  # noqa: BLE001
            logger.exception("[BadaChatHistory] pin failed")
            return web.json_response({"success": False, "error": str(exc)}, status=500)

    @routes.post("/api/bada/gemini/chats/clear")
    async def clear_gemini_chats(request):
        """Bulk delete. Guarded by `confirm` so a stray call cannot wipe the history."""
        try:
            from . import gemini_chat_history as history

            body = await request.json()
            if not body.get("confirm"):
                return web.json_response(
                    {"success": False, "error": "confirm 값이 필요합니다."}, status=400
                )
            history.save_store({"version": 1, "chats": []})
            return web.json_response({"success": True})
        except Exception as exc:  # noqa: BLE001
            logger.exception("[BadaChatHistory] clear failed")
            return web.json_response({"success": False, "error": str(exc)}, status=500)

    @routes.get("/api/bada/gemini/chats/export")
    async def export_gemini_chats(request):
        """Backup download — the user gets a .json they own and can move anywhere."""
        try:
            from . import gemini_chat_history as history

            body = json.dumps(history.export_store(), ensure_ascii=False, indent=2).encode("utf-8")
            return web.Response(
                body=body,
                content_type="application/json; charset=utf-8",
                headers={
                    # Forces a save-as instead of an inline render, so the browser never
                    # tries to display a multi-megabyte image blob.
                    "Content-Disposition": 'attachment; filename="bada_gemini_chats_backup.json"',
                    "Cache-Control": "no-store",
                },
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("[BadaChatHistory] export failed")
            return web.json_response({"success": False, "error": str(exc)}, status=500)

    @routes.post("/api/bada/gemini/chats/import")
    async def import_gemini_chats(request):
        try:
            from . import gemini_chat_history as history

            body = await request.json()
            payload = body.get("payload")
            if payload is None:
                payload = {k: body[k] for k in ("version", "chats", "exportedAt") if k in body}
            count = history.import_store(payload, merge=bool(body.get("merge")))
            return web.json_response({"success": True, "imported": count})
        except ValueError as exc:
            return web.json_response({"success": False, "error": str(exc)}, status=400)
        except Exception as exc:  # noqa: BLE001
            logger.exception("[BadaChatHistory] import failed")
            return web.json_response({"success": False, "error": str(exc)}, status=500)

    logger.info("[ComfyUI-Bada-Utils] Bada Prompt Generator registry routes registered ⚙️")
