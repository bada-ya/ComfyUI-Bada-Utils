# -*- coding: utf-8 -*-
"""
엔진 레지스트리 스토어 — 배포본과 사용자본을 갈라 읽는 단일 창구
================================================================

`engines_registry.json`(배포본) 은 GitHub/ComfyUI Manager 로 받는 파일이다. 한때는
사용자가 UI 에서 직접 쓴 시스템 프롬프트(`user_prompts` · `gemini_prompts`) 와 노드
기본값(`defaults`) 까지 그 파일 하나에 들어 있어서, `git pull` 이 배포본을 되돌리는
순간 개인 프롬프트가 조용히 사라졌다 (동일 사고 기록: server/gdrive_sync.py 의
`_download_single_file` 주석). 그래서 개인 데이터를 `engines_registry_user.json`
으로 분리했다.

  - engines_registry.json      : git 추적(배포본). 이 모듈은 **읽기만** 한다.
  - engines_registry_user.json : .gitignore/.comfyignore. 모든 쓰기는 여기만.

병합 규칙 (단순함이 곧 안전이라 규칙을 최소로 둔다)
  - `user_prompts` · `gemini_prompts` · `defaults` → 사용자본이 정답.
    사용자본이 없거나 깨진 경우에만 배포본 목록으로 대체한다 (빈 목록으로 절대 대체 않음).
  - 그 밖의 키(`targets`, `official_prompts`, ...) → 배포본이 정답.
  - 배포본에서 `built_in: true` 인 예시 프롬프트는 첫 읽기 때 사용자본에 복사되어
    계속 보인다. 이후 릴리스로 예시가 추가되면 그 시점부터 자동으로 따라온다.

읽기는 스탬프(mtime_ns + size) 캐시, 쓰기는 `server/atomic_json.py` 의 원자적 쓰기를
그대로 쓴다. 캐시된 dict 를 그대로 반환하므로 반환값은 **읽기 전용** 계약이다. 값을
고쳐 저장하려면 반드시 `read_user()` 로 새로 읽어 시작해야 캐시와 디스크가 어긋나지
않는다.
"""
from __future__ import annotations

import copy
import logging
import os

try:  # ComfyUI 는 커스텀 노드를 패키지로 로드하므로 상대 임포트가 정상 경로.
    from .atomic_json import read_json_fallback, write_json_atomic
except ImportError:  # pragma: no cover - 파일 경로로 직접 로드된 경우(플랫 로딩)
    import importlib.util as _ilu

    _ATOMIC_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "atomic_json.py")
    _spec = _ilu.spec_from_file_location("bada_atomic_json", _ATOMIC_PATH)
    _atomic = _ilu.module_from_spec(_spec)
    _spec.loader.exec_module(_atomic)
    read_json_fallback = _atomic.read_json_fallback
    write_json_atomic = _atomic.write_json_atomic

logger = logging.getLogger("ComfyUI-Bada-Utils")

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE_FILE = os.path.join(ROOT_DIR, "engines_registry.json")
USER_FILE = os.path.join(ROOT_DIR, "engines_registry_user.json")

# 사용자본이 전권을 갖는 키 — 사용자가 직접 만들고 순서를 바꾸는 데이터다.
USER_OWNED_LISTS = ("user_prompts", "gemini_prompts")
USER_OWNED_KEYS = ("defaults",)

# 사용자 파일을 열어본 사람에게 이 파일의 정체를 알려주는 머리글 (주석 없는 JSON 의 대안).
USER_FILE_DESCRIPTION = (
    "Bada Prompt Generator 사용자 데이터 — 시스템 프롬프트와 노드 기본값. "
    "배포본(engines_registry.json)과 달리 git·Manager 업데이트로 덮어쓰지 않는 개인 파일입니다."
)

_cache = {
    "base": {"stamp": None, "data": None},
    "user": {"stamp": None, "data": None},
}


# ---------------------------------------------------------------------------
# 내부 헬퍼 — 스탬프 캐시 읽기
# ---------------------------------------------------------------------------
def _stamp(path: str):
    """캐시 무효화 판정용 스탬프. 파일이 없으면 None. (mtime_ns + 크기 → 같은 초 내 저장도 구분)"""
    try:
        stat = os.stat(path)
    except OSError:
        return None
    return (stat.st_mtime_ns, stat.st_size)


def _read_dict(path: str, label: str):
    """JSON 객체를 dict 로 읽는다. 없거나 깨지면 None — 호출측이 '없음'을 구분하게 둔다."""
    if not os.path.exists(path):
        return None
    data = read_json_fallback(path, None, log_prefix="[BadaRegistry]")
    if isinstance(data, dict):
        return data
    if data is not None:
        logger.error("[BadaRegistry] %s registry is not a JSON object: %s", label, path)
    return None


def _cached_read(kind: str, path: str, force: bool):
    """`kind` 캐시를 스탬프 기준으로 갱신해 반환. 파일 없음/파싱 실패 시 None."""
    slot = _cache[kind]
    stamp = _stamp(path)
    if stamp is None:
        slot["stamp"] = None
        slot["data"] = None
        return None
    if not force and slot["stamp"] == stamp and slot["data"] is not None:
        return slot["data"]

    data = _read_dict(path, kind)
    if data is None:
        # 캐시를 비우긴 하되 다음 호출에서 다시 읽게 둔다 (일시적 잠김/읽기 실패 회복).
        slot["stamp"] = None
        slot["data"] = None
        return None
    slot["stamp"] = stamp
    slot["data"] = data
    return data


def _adopt_builtins(user_data: dict, base_data: dict) -> dict:
    """배포본의 `built_in` 예시를 사용자본 뷰에 보충하고 보호 플래그를 배포본 기준으로 못 박는다.

    플래그를 사용자 파일에 맡기면 JSON 을 직접 열어 `built_in` 을 지우는 것으로 삭제
    방호가 풀린다. 예시 여부 판단은 항상 배포본만 믿는다.
    """
    for section in USER_OWNED_LISTS:
        items = user_data.get(section)
        if not isinstance(items, list):
            items = []
            user_data[section] = items

        base_items = base_data.get(section)
        if not isinstance(base_items, list):
            continue
        builtins = [it for it in base_items if isinstance(it, dict) and it.get("built_in")]

        known = {}
        for item in items:
            if not isinstance(item, dict):
                continue
            for key in (item.get("id"), item.get("name")):
                if key:
                    known[str(key)] = item

        for built_in_item in builtins:
            match = None
            for key in (built_in_item.get("id"), built_in_item.get("name")):
                if key and str(key) in known:
                    match = known[str(key)]
                    break
            if match is None:
                fresh = copy.deepcopy(built_in_item)
                fresh["built_in"] = True
                items.append(fresh)
                for key in (fresh.get("id"), fresh.get("name")):
                    if key:
                        known[str(key)] = fresh
            else:
                match["built_in"] = True
    return user_data


def _seed_payload(base_data: dict) -> dict:
    """배포본에서 사용자본 초안을 만든다. 개인 데이터(목록·기본값) 만 복사한다."""
    payload = {"schema_version": base_data.get("schema_version", 1), "description": USER_FILE_DESCRIPTION}
    for section in USER_OWNED_LISTS:
        items = base_data.get(section)
        payload[section] = copy.deepcopy(items) if isinstance(items, list) else []
    for key in USER_OWNED_KEYS:
        if key in base_data:
            payload[key] = copy.deepcopy(base_data[key])
    return payload


def _seed_user_file() -> bool:
    """사용자 파일이 없으면 배포본에서 씨앗을 뽑아 생성. 생성했으면 True.

    덮어쓰지는 않는다(이미 있으면 즉시 종료) — 파싱 실패로 읽히지 않는 파일 위에
    씨앗을 얹으면 사용자가 오늘 쓴 프롬프트가 사라진다. 그런 경우엔 로그만 남긴다.
    """
    if os.path.exists(USER_FILE):
        return False
    try:
        payload = _seed_payload(load_base(force=True))
        write_json_atomic(USER_FILE, payload)
    except Exception as exc:  # noqa: BLE001 — 기동을 막을 수는 없다. 읽기는 배포본으로 계속 된다.
        logger.error("[BadaRegistry] could not create the user registry: %s", exc)
        return False
    logger.info(
        "[BadaRegistry] created %s from the distributed registry (%d system prompts, %d gemini prompts)",
        os.path.basename(USER_FILE),
        len(payload.get("user_prompts") or []),
        len(payload.get("gemini_prompts") or []),
    )
    return True


# ---------------------------------------------------------------------------
# 공개 API — 읽기
# ---------------------------------------------------------------------------
def load_base(force: bool = False) -> dict:
    """배포본 `engines_registry.json` (읽기 전용·캐시). 없거나 깨지면 {}."""
    return _cached_read("base", BASE_FILE, force) or {}


def load_user(force: bool = False) -> dict:
    """사용자본만 반환(캐시). 파일이 없으면 배포본에서 씨앗을 만들어 생성한 뒤 반환한다."""
    _seed_user_file()
    data = _cached_read("user", USER_FILE, force)
    if data is None:
        return {}
    _adopt_builtins(data, load_base(force))
    return data


def load_registry(force: bool = False) -> dict:
    """배포본 + 사용자본 합친 뷰. 분리 전 `engines_registry.json` 과 동일한 형태다."""
    base_data = load_base(force)
    user_data = load_user(force)
    if not base_data:
        # 배포본이 없어도 사용자 프롬프트로는 계속 동작해야 한다.
        return user_data
    if not user_data:
        return base_data

    merged = dict(base_data)
    for section in USER_OWNED_LISTS:
        if isinstance(user_data.get(section), list):
            merged[section] = user_data[section]
    for key in USER_OWNED_KEYS:
        if key in user_data:
            merged[key] = user_data[key]
    return merged


# ---------------------------------------------------------------------------
# 공개 API — 쓰기 (사용자 파일만)
# ---------------------------------------------------------------------------
def read_user() -> dict:
    """읽기-수정-쓰기용 읽기. 캐시를 거치지 않고 항상 디스크를 읽는다 (반환값 수정 가능)."""
    _seed_user_file()
    data = _read_dict(USER_FILE, "user")
    if data is None:
        # 파일이 사라지거나 깨진 직후 저장 — 빈 파일으로 개인 데이터를 덮지 않고 배포본에서 다시 시작한다.
        logger.warning("[BadaRegistry] user registry unreadable, restarting from the distributed defaults")
        data = _seed_payload(load_base(force=True))
    # `load_user()` 와 동일하게 배포본의 예시(built_in) 를 반영해 반환한다. 저장 핸들러는
    # 이 결과를 그대로 디스크에 되돌리므로, 여기서 플래그를 강제하지 않으면 예시를 한 번
    # 편집·저장한 시점부터 삭제 방어가 풀린다 — 보호 판단은 항상 배포본 기준이어야 한다.
    return _adopt_builtins(data, load_base())


def write_user(data: dict) -> None:
    """사용자본 원자적 저장(.bak 보존) 후 캐시 무효화. 실패 시 예외를 그대로 올려 호출측이 전하게 한다."""
    if "schema_version" not in data:
        data["schema_version"] = 1
    write_json_atomic(USER_FILE, data)
    _cache["user"]["stamp"] = None
    _cache["user"]["data"] = None


def ensure_user_file() -> bool:
    """사용자 파일 존재 보장 — 기동 시 1회 호출용. 새로 만들었으면 True."""
    return _seed_user_file()
