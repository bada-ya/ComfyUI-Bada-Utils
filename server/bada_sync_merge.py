# -*- coding: utf-8 -*-
"""개인 데이터 4종 합집합 병합 + tombstone 삭제 전파 (순수 로직 모듈).

이 모듈은 Google Drive·파일시스템·ComfyUI 에 전혀 의존하지 않는다.
입력으로 받은 Python 구조체(dict/list)만으로 합집합 병합과 tombstone 관리를 수행해
단위 테스트가 가능하도록 분리했다. 실제 Drive 입출력과 오케스트레이션은
gdrive_sync.py 의 _sync_and_merge_personal_data() 가 담당한다.

배경
  개인 데이터 4종(presets/favorites/gemini_chat_history/engines_registry)은
  각각 단일 JSON 덩어리라, 워크플로우처럼 파일 단위 last-write-wins 로 동기화하면
  나중에 동기화한 PC 의 내용으로 상대 PC 전체가 통째 덮어써져 유실된다.
  -> 항목(id/키) 단위 합집합 병합 + 삭제 의도만 tombstone 로 전파해야 한다.

tombstone 사이드카는 앱 백엔드가 저장을 다시 직렬화할 때 예약 키를 지워버리므로
데이터 파일 "안"이 아니라 별도 파일로 관리해야 한다(설계 확정 사항).

tombstone 보관 상한 = 항목수(cap 기본 500). 시간 기반 만료는 하지 않고,
가장 최근 삭제된 cap 개만 유지한다.
"""

from __future__ import annotations

import copy

# tombstone 보관 상한 (항목수). 가장 최근 삭제된 cap 개만 유지하고 나머지는 버린다.
#   * 100 → 500 상향: 대화가 200개(📌 고정 100개 별도)로 늘면서 삭제 의도도 그만큼
#     오래 기억해야 한다. tombstone 이 먼저 증발하면 오래 오프라인이던 PC를 다시
#     붙였을 때 Drive 사본에서 이미 지운 대화가 되살아난다.
#     항목당 ~100 B 수준이라 500개여도 사이드카는 수십 KB — 아낄 이유가 없다.
TOMBSTONE_CAP = 500

# presets 2단 키 구분자: 노드타입과 프리셋명 사이에 사용할 수 없는 문자.
_SEP = "\u0000"

VALID_KINDS = ("gemini", "favorites", "presets", "engines")


def _gemini_chats(data):
    if not isinstance(data, dict):
        return []
    ch = data.get("chats")
    return ch if isinstance(ch, list) else []


def _gemini_key(item):
    if isinstance(item, dict):
        cid = item.get("id")
        if cid is not None:
            return str(cid)
    return None


def _gemini_ts(item):
    try:
        return float(item.get("updatedAtMs") or 0)
    except (AttributeError, TypeError, ValueError):
        return 0.0


def _fav_list(data):
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        fav = data.get("favorites")
        if isinstance(fav, list):
            return fav
    return []


def _fav_key(item):
    return item if isinstance(item, str) else None


def _presets_items(data):
    if not isinstance(data, dict):
        return
    for nt, val in data.items():
        if isinstance(val, dict):
            for pn, pv in val.items():
                yield nt + _SEP + pn, (nt, pn, pv)


def _engines_items(data):
    if not isinstance(data, dict):
        return
    for sec in ("user_prompts", "gemini_prompts"):
        arr = data.get(sec)
        if isinstance(arr, list):
            for it in arr:
                if isinstance(it, dict) and it.get("id") is not None:
                    yield sec + ":" + str(it.get("id")), (sec, it)


def _iter_keyed(kind, data):
    if kind == "gemini":
        for it in _gemini_chats(data):
            k = _gemini_key(it)
            if k is not None:
                yield k, it
    elif kind == "favorites":
        for it in _fav_list(data):
            k = _fav_key(it)
            if k is not None:
                yield k, it
    elif kind == "presets":
        for k, item in _presets_items(data):
            yield k, item
    elif kind == "engines":
        for k, item in _engines_items(data):
            yield k, item
    else:
        raise ValueError("지원하지 않는 kind: " + repr(kind))


def extract_live_keys(kind, data):
    return {k for k, _ in _iter_keyed(kind, data)}


def normalize_tombstones(raw):
    out = {}
    items = None
    if isinstance(raw, dict):
        items = raw.get("tombstones")
    elif isinstance(raw, list):
        items = raw
    if isinstance(items, list):
        for it in items:
            if not isinstance(it, dict):
                continue
            k = it.get("k")
            if not isinstance(k, str) or not k:
                continue
            try:
                t = float(it.get("t") or 0)
            except (TypeError, ValueError):
                t = 0.0
            if k not in out or t > out[k]:
                out[k] = t
    return out


def prune_tombstones(tmap, cap=TOMBSTONE_CAP):
    if not isinstance(tmap, dict):
        tmap = normalize_tombstones(tmap)
    try:
        cap = int(cap)
    except (TypeError, ValueError):
        cap = TOMBSTONE_CAP
    kept = sorted(tmap.items(), key=lambda kv: kv[1], reverse=True)
    if cap >= 0:
        kept = kept[:cap]
    return {"version": 1, "tombstones": [{"k": k, "t": t} for k, t in kept]}


def _winner_loser(winner, local_data, remote_data):
    if winner == "remote":
        return remote_data, local_data
    return local_data, remote_data


def _rebuild_gemini(local_data, remote_data, merged_keys, winner):
    primary, secondary = _winner_loser(winner, local_data, remote_data)
    out = copy.deepcopy(primary) if isinstance(primary, dict) else {}
    items = {}
    for src in (secondary, primary):
        for it in _gemini_chats(src):
            k = _gemini_key(it)
            if k is not None:
                items[k] = it
    chats = [copy.deepcopy(items[k]) for k in items if k in merged_keys]
    chats.sort(key=_gemini_ts, reverse=True)
    out["chats"] = chats
    if "version" not in out:
        lv = local_data.get("version") if isinstance(local_data, dict) else None
        rv = remote_data.get("version") if isinstance(remote_data, dict) else None
        vers = [v for v in (lv, rv) if isinstance(v, int)]
        out["version"] = max(vers) if vers else 1
    return out


def _rebuild_favorites(local_data, remote_data, merged_keys, winner):
    primary, secondary = _winner_loser(winner, local_data, remote_data)
    seen = set()
    ordered = []
    for src in (primary, secondary):
        for it in _fav_list(src):
            k = _fav_key(it)
            if k is None or k not in merged_keys or k in seen:
                continue
            seen.add(k)
            ordered.append(it)
    if isinstance(primary, dict) and isinstance(primary.get("favorites"), list):
        out = copy.deepcopy(primary)
        out["favorites"] = ordered
        return out
    return ordered


def _rebuild_presets(local_data, remote_data, merged_keys, winner):
    primary, secondary = _winner_loser(winner, local_data, remote_data)
    items = {}
    for src in (secondary, primary):
        for k, item in _presets_items(src):
            items[k] = item
    out = {}
    for k, (nt, pn, val) in items.items():
        if k not in merged_keys:
            continue
        out.setdefault(nt, {})[pn] = copy.deepcopy(val)
    return out


def _rebuild_engines(local_data, remote_data, merged_keys, winner):
    primary, secondary = _winner_loser(winner, local_data, remote_data)
    out = copy.deepcopy(primary) if isinstance(primary, dict) else {}
    for sec in ("user_prompts", "gemini_prompts"):
        items = {}
        for src in (secondary, primary):
            arr = src.get(sec) if isinstance(src, dict) else None
            if isinstance(arr, list):
                for it in arr:
                    if isinstance(it, dict) and it.get("id") is not None:
                        items[str(it.get("id"))] = it
        merged = [copy.deepcopy(items[i]) for i in items if (sec + ":" + i) in merged_keys]
        out[sec] = merged
    return out


def rebuild_merged(kind, local_data, remote_data, merged_keys, winner="local"):
    merged_keys = set(merged_keys)
    if kind == "gemini":
        return _rebuild_gemini(local_data, remote_data, merged_keys, winner)
    if kind == "favorites":
        return _rebuild_favorites(local_data, remote_data, merged_keys, winner)
    if kind == "presets":
        return _rebuild_presets(local_data, remote_data, merged_keys, winner)
    if kind == "engines":
        return _rebuild_engines(local_data, remote_data, merged_keys, winner)
    raise ValueError("지원하지 않는 kind: " + repr(kind))


def merge_personal_data(kind, local_data, remote_data, base_keys,
                        local_tombstones_raw, remote_tombstones_raw,
                        now_ms, winner="local", cap=TOMBSTONE_CAP):
    local_keys = extract_live_keys(kind, local_data)
    remote_keys = extract_live_keys(kind, remote_data)

    tmap = normalize_tombstones(local_tombstones_raw)
    for k, t in normalize_tombstones(remote_tombstones_raw).items():
        if k not in tmap or t > tmap[k]:
            tmap[k] = t

    base = set(base_keys) if base_keys else set()
    newly_deleted = (base - local_keys) | (base - remote_keys)
    for k in newly_deleted:
        if k not in tmap:
            tmap[k] = float(now_ms)

    tomb_keys = set(tmap.keys())
    merged_keys = (local_keys | remote_keys) - tomb_keys

    data = rebuild_merged(kind, local_data, remote_data, merged_keys, winner)
    return {
        "data": data,
        "live_keys": merged_keys,
        "tombstones": prune_tombstones(tmap, cap),
    }