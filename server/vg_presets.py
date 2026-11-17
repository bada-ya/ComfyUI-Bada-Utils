# -*- coding: utf-8 -*-
"""⚓ Bada Visual Regional Prompt 의 [외모 프리셋] / [나만의 프리셋] 저장소.

배경
  이 두 목록은 원래 브라우저 localStorage 에만 있어서 PC 간 공유가 불가능했다.
  presets_data.json 의 예약 섹션(_vg_char_presets / _vg_custom_presets)에
  {이름: 항목} dict 로 저장해, 기존 개인 데이터 4종과 같은 항목 단위 병합
  (bada_sync_merge) + GDrive 동기화 경로를 그대로 탄다.

왜 list 가 아니라 dict 인가
  병합기는 {노드타입: {프리셋명: 값}} 2단 구조만 항목 단위로 다룬다
  (bada_sync_merge._presets_items). 그래서 프론트의 배열을 dict 로 변환해 저장한다.
  키는 프리셋 이름(label) 이고, 이름이 비면 id/인덱스로 대체한다.

프론트엔드는 /api/bada/presets/load 응답에서 이 섹션들을 받지 않는다
(노드 프리셋 개요에 노드 타입처럼 노출되면 안 되기 때문). 따라서
presets/save 가 파일을 통째로 덮어쓸 때 이 섹션들을 반드시 보존해야 한다 —
그 처리를 preserve_sections() 가 담당한다.
"""
from __future__ import annotations

import json
import os
import threading

try:  # 패키지(ComfyUI 로드) / 단독 실행(테스트) 양쪽 지원
    from .atomic_json import write_json_atomic
except ImportError:  # pragma: no cover - 테스트 경로
    from atomic_json import write_json_atomic

SECTION_BY_KIND = {
    "char": "_vg_char_presets",
    "custom": "_vg_custom_presets",
}
SECTIONS = tuple(SECTION_BY_KIND.values())

# presets_data.json 은 프리셋 저장과 외모/나만의 저장이 같은 파일을 read-modify-write 한다.
# 두 핸들러가 겹쳐 쓰면 한쪽 섹션이 통째로 사라질 수 있어 직렬화한다.
LOCK = threading.Lock()


def section_for(kind):
    """kind('char'|'custom') -> 예약 섹션 이름. 모르는 kind 면 None."""
    return SECTION_BY_KIND.get(kind)


def preset_key(item, index):
    """dict 키 = 프리셋 이름. 이름이 비면 id/인덱스로 대체(항목 유실 방지)."""
    if not isinstance(item, dict):
        return None
    for field in ("label", "label_en", "id"):
        v = item.get(field)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return f"preset_{index + 1}"


def list_to_dict(items):
    """프론트 배열 -> {이름: 항목}. 이름이 겹치면 뒤에 인덱스를 붙여 보존한다."""
    out = {}
    for i, item in enumerate(items or []):
        key = preset_key(item, i)
        if not key:
            continue
        if key in out:
            key = f"{key} ({i + 1})"
        out[key] = item
    return out


def read_file(path):
    """presets_data.json 을 읽는다. 없으면 {}, 깨졌으면 예외(호출자가 판단)."""
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, dict) else {}


def read_sections(path):
    """두 섹션을 프론트가 쓰는 배열 형태로 돌려준다.

    반환: {"char": [...], "custom": [...], "char_exists": bool, "custom_exists": bool}
    exists 는 "섹션이 파일에 존재하는가" 다. false 면 프론트가 현재 목록으로 시드한다.
    """
    out = {"char": [], "custom": [], "char_exists": False, "custom_exists": False}
    data = read_file(path)
    for kind, section in SECTION_BY_KIND.items():
        value = data.get(section)
        if not isinstance(value, dict):
            continue
        out[kind + "_exists"] = True
        bucket = out[kind]
        for name, item in value.items():
            if not isinstance(item, dict):
                continue
            entry = dict(item)
            entry.setdefault("label", name)  # 이름이 항목에 없으면 키로 복원
            bucket.append(entry)
    return out


def write_kind(path, kind, items):
    """한 섹션만 갱신하고 나머지(노드 프리셋·다른 섹션)는 그대로 보존한다."""
    section = section_for(kind)
    if not section:
        raise ValueError(f"unknown kind: {kind!r}")
    with LOCK:
        try:
            data = read_file(path)
        except Exception:  # noqa: BLE001 — 깨진 파일은 새로 만든다 (.bak 은 write_json_atomic 이 남긴다)
            data = {}
        data[section] = list_to_dict(items)
        write_json_atomic(path, data)
        return len(data[section])


def preserve_sections(path, incoming):
    """프리셋 전체 저장 직전: 기존 파일의 예약 섹션을 새 저장본에 다시 붙인다.

    프론트엔드는 /presets/load 에서 이 섹션들을 받지 않으므로, 그대로 덮어쓰면
    외모/나만의 프리셋이 통째로 사라진다. 읽기-보존-쓰기를 같은 락 안에서 수행한다.
    """
    with LOCK:
        try:
            prev = read_file(path)
        except Exception:  # noqa: BLE001 — 읽기 실패 시 예약 섹션만 비운 채 저장한다
            prev = {}
        merged = {k: v for k, v in (incoming or {}).items() if k not in SECTIONS}
        for section in SECTIONS:
            if isinstance(prev.get(section), dict):
                merged[section] = prev[section]
        write_json_atomic(path, merged)
        return merged
