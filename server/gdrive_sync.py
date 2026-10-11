"""Google Drive Manifest Diff Sync — ComfyUI-Bada-Utils (v3)
====================================================================
동기화 범위
  A. `.configs/*` (노드 루트 개인 데이터 4종)
     - presets_data.json        (프리셋 라이브러리 / Visual Regional Prompt 공유)
     - favorites_data.json      (즐겨찾기)
     - gemini_chat_history.json (제미나이 채팅 기록)
     - engines_registry.json    (Gemini · Prompt Generator 시스템 프롬프트)

  B. `workflows/*` (ComfyUI 사용자 워크플로우 폴더, .json 재귀)

설계 원칙
  1. 라이브러리 미설치 시 서버 기동에 영향 없음 (GDRIVE_LIBS_AVAILABLE=False)
  2. 동기화는 넌블로킹 (ThreadPoolExecutor + run_in_executor)
  3. 변경분만 pinpoint 업/다운 (원격 폴더 목록 1회 조회 + modifiedTime Diff)
     - 별도의 manifest 파일을 쓰지 않는다. 원격 폴더 자체가 상태이므로
       버전 불일치/중단·오류 후 재업로드 문제가 구조적으로 없다.
     - 루프 방지: 업/다운 직후 로컬 mtime 을 Drive modifiedTime 값으로 고정(os.utime)해
       양쪽 시간을 일치시킨다. (Drive API v3 은 원격 modifiedTime 지정을 허용하지 않는다.)
  4. 내부 동기화 지도 키는 rel_path 를 `___` 로 인코딩한 형태 (다운로드·스냅샷 공용 키).
     Drive 에는 파일을 실제 중첩 폴더 구조로 저장한다 (Workflows/<subdir>/<file>.json).
  5. 중복 실행 방지 (_SYNC_LOCK)
  6. 두 네임스페이스 모두 realpath 로 루트 탈출(../) 차단

의도적 제외 대상
  - config.json          : Gemini API 키 등 시크릿 포함. Drive 업로드 금지.
  - credentials/token    : 인증 파일. 커밋·동기화·배포 전부 금지.
  - 워크플로우 출력물    : __pycache__ 등 무의미 파일은 스캔 제외.

주의 (engines_registry.json)
  Drive 양방향 공유 파일이다. git 배포하지 않는다(.gitignore) — git pull이
  로컬을 되돌리면 동기화가 핑퐁 업로드를 반복하므로 추적을 중단했다.
  다른 PC 버전으로 덮어쓰기 직전 항상 `.bak` 을 남기고 경고 로그를 기록하므로,
  덮여도 `.bak` 에서 복구할 수 있다.
"""


import os
import io
import json
import time
import asyncio
import hashlib
import logging
import threading
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger("ComfyUI-Bada-Utils.GDrive")

# 동기화 중복 실행 방지용 락 (수동 버튼과 기동 자동 동기화가 겹치는 경우).
# _perform_sync_blocking 은 여러 경로(버튼·자동)에서 호출되므로 함수 진입부에서
# 넌블로킹으로 획득해 이미 돌고 있으면 busy 로 즉시 반환한다.
_SYNC_GUARD = threading.Lock()

# 사용자 중단 요청 플래그. request_sync_cancel() 이 set 하면 진행 중인 동기화가
# 다음 파일 경계에서 즉시 루프를 빠져나온다. (ComfyUI 를 끄지 않고도 중단 가능)
_CANCEL_EVENT = threading.Event()

# 기동 자동 동기화는 프로세스당 1회만 예약한다.
_AUTOSYNC_SCHEDULED = False

# 진행 중 동기화의 분모/분자 기억장치 (WS를 놓친 늦은 설정창용 폴링 백업).
# _notify_sync_state 가 WS 푸시를 쏠 때마다 최신값을 덮어써 둔다.
# /api/bada/cloud/status 가 이 값을 함께 내려주면 설정창은
# "열 때 1회 조회 → 진행 중 폴링"만으로 숫자를 표시할 수 있다 (WS 의존 탈출).
# 키: phase/uploaded/downloaded/done/total/current/syncing/updated_at
_LAST_PROGRESS = {}
_PROGRESS_LOCK = threading.Lock()

# --- Google API client imports with safety fallback -------------------------
try:
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload, MediaIoBaseUpload
    GDRIVE_LIBS_AVAILABLE = True
except ImportError:
    GDRIVE_LIBS_AVAILABLE = False
    logger.warning(
        "[GDrive] google-api-python-client / google-auth-oauthlib not installed → "
        "Cloud Sync feature is disabled. (server startup is unaffected)"
    )

SCOPES = ['https://www.googleapis.com/auth/drive.file']
FOLDER_NAME = 'ComfyUI-Bada-Utils-Cloud-Sync'
MANIFEST_FILE_NAME = 'manifest.json'

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(CURRENT_DIR)

CREDENTIALS_PATH = os.path.join(PARENT_DIR, 'credentials.json')
TOKEN_PATH = os.path.join(PARENT_DIR, 'token.json')

# 동기화 대상 파일명 (커스텀 노드 루트 기준). 워크플로우 디렉터리와 무관하게 고정.
# engines_registry.json 은 Gemini/Prompt Generator 의 사용자 시스템 프롬프트를 담는
# 파일이다. Drive 양방향 공유로 일원화했으므로 git 배포하지 않는다(.gitignore).
# 덮어쓰기 시 프롬프트 유실을 막기 위해 `_download_single_file` 에서 .bak 백업 + 로그를 남긴다.
SYNC_TARGET_FILES = [
    'presets_data.json',
    'favorites_data.json',
    'gemini_chat_history.json',
    'engines_registry.json',
]

# 로컬 상대경로(rel_path) → Drive 하위폴더 이름 매핑표.
#   - config 4종은 각각 전용 하위폴더에 파일명만 저장 (Drive 탐색기에서 깔끔하게 표시)
#   - workflows 는 로컬 디렉터리 구조를 Drive 실제 중첩 폴더로 그대로 재현
#     (파일명은 basename 만 사용. 구 평면 '___' 이름 잔재는 첫 동기화에서 자동 이동)
# Drive 구조:
#   ComfyUI-Bada-Utils-Cloud-Sync/
#     ├── Presets/       presets_data.json
#     ├── Favorites/     favorites_data.json
#     ├── GeminiChat/    gemini_chat_history.json
#     ├── SystemPrompts/ engines_registry.json
#     └── Workflows/
#           ├── <file>.json
#           └── <subdir>/<file>.json ...
REMOTE_FOLDER_BY_REL = {
    '.configs/presets_data.json':        'Presets',
    '.configs/favorites_data.json':      'Favorites',
    '.configs/gemini_chat_history.json': 'GeminiChat',
    '.configs/engines_registry.json':    'SystemPrompts',
}
REMOTE_WORKFLOWS_FOLDER = 'Workflows'

# 워크플로우 동기화에서 제외할 항목 (이름 기준).
# manifest/상태 파일과 서버가 만든 출력물은 동기화해도 의미가 없고 충돌만 만든다.
WORKFLOW_EXCLUDE_NAMES = {
    '.gdrive_manifest.json',
    '.gdrive_sync_state.json',
}

# 워크플로우 폴더를 재귀 스캔할 때 건너뛸 디렉터리.
WORKFLOW_EXCLUDE_DIRS = {'__pycache__'}

# 1차 버전의 로컬 캐시 매니페스트 경로 (워크플로우 폴더를 더럽히지 않도록 노드 루트).
LOCAL_MANIFEST_CACHE = os.path.join(PARENT_DIR, '.gdrive_manifest.json')

# 마지막 동기화 결과(시각/업·다운로드 수) 영속 파일.
# status API 가 매번 이걸 읽어 설정창에 "언제·무엇을" 보여준다. 새로고침 후에도 유지.
LAST_SYNC_STATE_FILE = os.path.join(PARENT_DIR, '.gdrive_sync_state.json')

_SYNC_LOCK = asyncio.Lock()
_THREAD_POOL = ThreadPoolExecutor(max_workers=2, thread_name_prefix="GDriveSyncWorker")


def get_last_sync_state():
    """마지막으로 성공한 동기화 결과를 반환. 없으면 기본값."""
    try:
        if os.path.exists(LAST_SYNC_STATE_FILE):
            with open(LAST_SYNC_STATE_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
            if isinstance(data, dict):
                return {
                    "last_sync_at": data.get("last_sync_at"),
                    "uploaded": data.get("uploaded", 0),
                    "downloaded": data.get("downloaded", 0),
                }
    except Exception:
        pass
    return {"last_sync_at": None, "uploaded": 0, "downloaded": 0}


def get_last_progress():
    """진행 중(또는 마지막) 동기화의 분모/분자 스냅샷. status API가 그대로 내려준다."""
    try:
        with _PROGRESS_LOCK:
            return dict(_LAST_PROGRESS)
    except Exception:
        return {}


def _save_last_sync_state(uploaded, downloaded):
    """동기화 성공 시 결과를 디스크에 기록 (설정창 영속 표시용)."""
    try:
        with open(LAST_SYNC_STATE_FILE, 'w', encoding='utf-8') as f:
            json.dump(
                {"last_sync_at": time.time(), "uploaded": uploaded, "downloaded": downloaded},
                f, ensure_ascii=False, indent=2,
            )
    except Exception as exc:
        logger.debug(f"[GDrive] last-sync state save failed (ignored): {exc}")


def check_gdrive_libs():
    """라이브러리 설치 여부. 라우트/프론트에서 기능 On/Off 판단에 사용."""
    return GDRIVE_LIBS_AVAILABLE


def get_target_rel_paths():
    """동기화 대상 상대경로 목록 (`.configs/<filename>` 네임스페이스)."""
    return [f".configs/{name}" for name in SYNC_TARGET_FILES]


def get_gdrive_status():
    """현재 연동 상태를 요약해 반환 (인증 전/후, 라이브러리 유무)."""
    if not GDRIVE_LIBS_AVAILABLE:
        return {
            "status": "missing_libs",
            "authorized": False,
            "message": "google-api-python-client is required.",
        }

    if not os.path.exists(CREDENTIALS_PATH) and not os.path.exists(TOKEN_PATH):
        return {
            "status": "missing_credentials",
            "authorized": False,
            "message": "credentials.json file is missing.",
        }

    if os.path.exists(TOKEN_PATH):
        try:
            creds = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)
            if creds and (creds.valid or creds.refresh_token):
                return {
                    "status": "authenticated",
                    "authorized": True,
                    "message": "Google Drive linked successfully",
                }
        except Exception:
            pass

    return {
        "status": "unauthenticated",
        "authorized": False,
        "message": "Google Drive authentication is required.",
    }


def get_drive_service():
    """
    인증 후 Google Drive API 서비스 객체를 반환.
    라이브러리 미설치/인증 실패 시 (None, 사유) 를 반환해 호출측이 안전하게 처리.
    """
    if not GDRIVE_LIBS_AVAILABLE:
        return None, "google-api-python-client is not installed."

    creds = None
    if os.path.exists(TOKEN_PATH):
        try:
            creds = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)
        except Exception as e:
            logger.warning(f"[GDrive] token.json load failed: {e}")
            creds = None

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
                with open(TOKEN_PATH, 'w', encoding='utf-8') as token_file:
                    token_file.write(creds.to_json())
            except Exception as e:
                logger.warning(f"[GDrive] token refresh failed: {e}")
                creds = None

        if not creds:
            if not os.path.exists(CREDENTIALS_PATH):
                return None, "credentials.json file is missing in the parent folder."
            try:
                flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_PATH, SCOPES)
                creds = flow.run_local_server(port=0)
                with open(TOKEN_PATH, 'w', encoding='utf-8') as token_file:
                    token_file.write(creds.to_json())
            except Exception as e:
                logger.error(f"[GDrive] OAuth flow failed: {e}")
                return None, f"OAuth authentication failed: {str(e)}"

    try:
        service = build('drive', 'v3', credentials=creds, cache_discovery=False)
        return service, "OK"
    except Exception as e:
        logger.error(f"[GDrive] Drive service build failed: {e}")
        return None, f"Drive service creation failed: {str(e)}"


def calculate_sha256(filepath):
    """파일 SHA256 (64KB 청크 스트리밍)."""
    hasher = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            hasher.update(chunk)
    return hasher.hexdigest()


WORKFLOWS_NS = "workflows/"
_CONFIG_NS = ".configs/"


def _resolve_workflows_root():
    """
    ComfyUI 사용자 워크플로우 루트 절대경로.
    server.bada_server_api 의 구현과 동일한 후보 순서를 쓰되, 이 모듈이 단독으로
    import 되어도 동작하도록 folder_paths 조회 실패 시 경로 추론으로 폴백한다.
    """
    try:
        import folder_paths
        user_dir = folder_paths.get_user_directory()
    except Exception:
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        user_dir = os.path.join(base_dir, "user")

    candidate1 = os.path.join(user_dir, "default", "workflows")
    if os.path.exists(candidate1):
        return os.path.realpath(candidate1)

    candidate2 = os.path.join(user_dir, "workflows")
    if os.path.exists(candidate2):
        return os.path.realpath(candidate2)

    os.makedirs(candidate1, exist_ok=True)
    return os.path.realpath(candidate1)


def _resolve_local_path(rel_path):
    """
    동기화 상대경로를 실제 로컬 절대경로로 변환.

    두 가지 네임스페이스를 허용한다.
      - `.configs/<filename>` : 노드 루트의 개인 데이터 (화이트리스트 강제)
      - `workflows/<subpath>` : ComfyUI 워크플로우 폴더 내부

    양쪽 모두 경로 탈출(../)을 realpath 로 검사해 루트 밖으로 나가지 못하게 막는다.
    """
    clean_rel = rel_path.replace("\\", "/").lstrip("/")

    if clean_rel.startswith(_CONFIG_NS):
        cfg_name = clean_rel[len(_CONFIG_NS):]
        # 경로 탈출(../) 방지 — 화이트리스트에 있는 파일명만 허용.
        if cfg_name not in SYNC_TARGET_FILES:
            raise ValueError(f"동기화 대상이 아닌 파일: {cfg_name}")
        return os.path.join(PARENT_DIR, cfg_name)

    if clean_rel.startswith(WORKFLOWS_NS):
        root = _resolve_workflows_root()
        target = os.path.realpath(os.path.join(root, clean_rel[len(WORKFLOWS_NS):]))
        # realpath 비교로 junction/대소문자/../ 를 모두 무력화.
        if os.path.commonpath((root, target)) != root:
            raise ValueError(f"허용되지 않은 동기화 경로: {rel_path}")
        return target

    raise ValueError(f"허용되지 않은 동기화 경로: {rel_path}")


def _iter_workflow_rel_paths():
    """
    워크플로우 루트를 재귀 스캔해 `workflows/<subpath>` 형태의 상대경로를 yield.
    .json 만 대상으로 하고, manifest/상태 파일과 __pycache__ 는 건너뛴다.
    """
    root = _resolve_workflows_root()
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in WORKFLOW_EXCLUDE_DIRS]
        for name in filenames:
            if not name.lower().endswith(".json"):
                continue
            if name in WORKFLOW_EXCLUDE_NAMES:
                continue
            full_path = os.path.join(dirpath, name)
            if not os.path.isfile(full_path):
                continue
            # 윈도우 경로 구분자와 드라이브 문자 차이를 없애기 위해 realpath 기준으로 상대화.
            rel = os.path.relpath(os.path.realpath(full_path), root).replace("\\", "/")
            yield f"{WORKFLOWS_NS}{rel}"


def build_local_manifest():
    """
    로컬 대상 파일들의 목록을 생성:
    { "rel_path": { "size": int, "mtime": float } }
    존재하지 않는 파일은 건너뛴다 (선택적 동기화).

    두 묶음을 합친다.
      1) `.configs/*` : 노드 루트 개인 데이터 (get_target_rel_paths)
      2) `workflows/*` : 워크플로우 폴더 재귀 스캔

    SHA256 해시는 계산하지 않는다. 판단 기준은 modifiedTime(mtime) 뿐이므로
    349개 파일을 전부 읽어 해시를 만드는 비용이 사라져 로컬 스캔이 빨라진다.
    """
    manifest = {}

    for rel_path in get_target_rel_paths() + list(_iter_workflow_rel_paths()):
        full_path = _resolve_local_path(rel_path)
        if not os.path.isfile(full_path):
            continue
        try:
            stat = os.stat(full_path)
            manifest[rel_path] = {
                "size": stat.st_size,
                "mtime": stat.st_mtime,
            }
        except Exception as e:
            logger.warning(f"[GDrive] stat failed {rel_path}: {e}")
    return manifest


def _get_or_create_remote_folder(service, folder_name, parent_id=None):
    """
    Drive 대상 폴더 ID를 조회하거나 없으면 생성.

    parent_id : 상위 폴더 ID. 주어지면 그 **안에서만** 이름을 찾고(동명 폴더 혼동 방지),
      없으면 생성 시 상위 폴더 안에 넣는다. None 이면(루트) 기존과 동일하게
      My Drive 최상위에서 찾는다.
    """
    escaped = folder_name.replace("\\", "\\\\").replace("'", "\\'")
    query = (f"name = '{escaped}' and "
             f"mimeType = 'application/vnd.google-apps.folder' and trashed = false")
    if parent_id:
        query += f" and '{parent_id}' in parents"
    results = service.files().list(q=query, fields="files(id, name)").execute()
    items = results.get('files', [])
    if items:
        return items[0]['id']

    file_metadata = {
        'name': folder_name,
        'mimeType': 'application/vnd.google-apps.folder'
    }
    if parent_id:
        file_metadata['parents'] = [parent_id]
    folder = service.files().create(body=file_metadata, fields='id').execute()
    return folder.get('id')


def _get_subfolder_ids(service, root_id):
    """
    루트 폴더 아래 하위폴더 5종(Presets/Favorites/GeminiChat/SystemPrompts/Workflows)
    의 ID 를 조회·생성해 {폴더명: ID} 로 반환. 이미 있으면 재사용한다.
    """
    all_names = list(REMOTE_FOLDER_BY_REL.values()) + [REMOTE_WORKFLOWS_FOLDER]
    ids = {}
    for name in all_names:
        ids[name] = _get_or_create_remote_folder(service, name, parent_id=root_id)
    return ids


# 워크플로우 하위폴더 ID 캐시 (동기화 1회 단위 초기화 — 폴더당 조회 API 1회만 발생).
_WORKFLOW_FOLDER_CACHE = {}


def _ensure_workflow_folder(service, root_id, rel_dir):
    """
    'Workflows/<rel_dir>' 중첩 폴더를 단계별로 조회·생성해 마지막 폴더 ID 반환.

    rel_dir 이 비면 Workflows 루트 ID 를 그대로 반환한다.
    단계별 캐시를 써서 이미 만든 폴더는 추가 API 호출 없이 재사용한다.
    """
    if not rel_dir:
        return root_id
    cached = _WORKFLOW_FOLDER_CACHE.get(rel_dir)
    if cached:
        return cached
    current = root_id
    walked = []
    for part in rel_dir.split("/"):
        if not part or part == ".":
            continue
        walked.append(part)
        key = "/".join(walked)
        cached = _WORKFLOW_FOLDER_CACHE.get(key)
        if cached:
            current = cached
            continue
        current = _get_or_create_remote_folder(service, part, parent_id=current)
        _WORKFLOW_FOLDER_CACHE[key] = current
    return current


def _target_folder_name(rel_path):
    """rel_path 가 배정될 Drive 하위폴더 이름. 대상 밖이면 None."""
    if rel_path in REMOTE_FOLDER_BY_REL:
        return REMOTE_FOLDER_BY_REL[rel_path]
    if rel_path.startswith(WORKFLOWS_NS):
        return REMOTE_WORKFLOWS_FOLDER
    return None


def _stored_remote_name(rel_path):
    """
    Drive 하위폴더 안에 실제로 저장할 파일명 (모두 basename).

    config 4종은 전용 하위폴더에 파일명만, workflows 도 하위 디렉터리 구조를
    Drive 중첩 폴더로 표현하므로 파일명만 쓴다.
    (내부 지도 키는 별도로 rel_path 전체를 '___' 로 인코딩하므로 이 차이는 투명하다)
    """
    return rel_path.split('/')[-1]


def _remote_key_from_stored(stored_name):
    """
    config 하위폴더 안의 저장 파일명 → 내부 지도 키('.configs' 네임스페이스 '___' 인코딩).

    워크플로우는 _list_workflows_recursive 가 중첩 폴더 경로 기준으로 키를 만든다.
    """
    return (_CONFIG_NS + stored_name).replace('/', '___')


def _find_remote_file_in_folder(service, folder_id, file_name):
    """특정 폴더 안의 파일 ID 조회."""
    # 파일명에 작은따옴표(')나 백슬래시(\)가 있으면 Drive 쿼리 문법이 깨져
    # 400 "Invalid Value" 가 발생한다(예: "Icekiub's Video..."). 쿼리용으로 이스케이프.
    escaped = file_name.replace("\\", "\\\\").replace("'", "\\'")
    query = f"name = '{escaped}' and '{folder_id}' in parents and trashed = false"
    results = service.files().list(q=query, fields="files(id, name)").execute()
    items = results.get('files', [])
    if items:
        return items[0]['id']
    return None


def _list_folder_files(service, folder_id):
    """단일 폴더의 파일 목록을 페이지네이션으로 조회. {저장 파일명: 메타} 반환."""
    files_map = {}
    page_token = None
    while True:
        params = {
            "q": f"'{folder_id}' in parents and trashed = false",
            "fields": "nextPageToken, files(id, name, modifiedTime, size)",
            "pageSize": 1000,
        }
        if page_token:
            params["pageToken"] = page_token
        results = service.files().list(**params).execute()
        for item in results.get("files", []):
            name = item.get("name")
            if not name:
                continue
            mt = _parse_drive_time(item.get("modifiedTime"))
            try:
                size = int(item.get("size") or 0)
            except (TypeError, ValueError):
                size = 0
            files_map[name] = {
                "id": item.get("id"),
                "modifiedTime": mt,
                "size": size,
            }
        page_token = results.get("nextPageToken")
        if not page_token:
            break
    return files_map


def _list_folder_entries(service, folder_id):
    """
    단일 폴더 안의 항목(파일 + 하위폴더)을 페이지네이션으로 조회.
    반환: [{"name","id","is_folder","modifiedTime","size"}, ...]
    """
    entries = []
    page_token = None
    while True:
        params = {
            "q": f"'{folder_id}' in parents and trashed = false",
            "fields": "nextPageToken, files(id, name, mimeType, modifiedTime, size)",
            "pageSize": 1000,
        }
        if page_token:
            params["pageToken"] = page_token
        results = service.files().list(**params).execute()
        for item in results.get("files", []):
            name = item.get("name")
            if not name:
                continue
            mt = _parse_drive_time(item.get("modifiedTime"))
            try:
                size = int(item.get("size") or 0)
            except (TypeError, ValueError):
                size = 0
            entries.append({
                "name": name,
                "id": item.get("id"),
                "is_folder": item.get("mimeType") == "application/vnd.google-apps.folder",
                "modifiedTime": mt,
                "size": size,
            })
        page_token = results.get("nextPageToken")
        if not page_token:
            break
    return entries


def _list_workflows_recursive(service, root_id, legacy_files=None):
    """
    Workflows 폴더를 재귀 열거해 로컬 디렉터리 구조를 그대로 지도로 복원한다.

    반환: { '___' 인코딩 키: {"id","name","modifiedTime","size","folder_id"} }
      - 하위폴더 안 파일: 'workflows/<subdir>/<file>' 를 '___' 로 인코딩한 키
        (구 평면 저장 시의 키와 동일 → 다운로드/스냅샷/루프방지 로직 무변경)
      - 루트 폴더의 구(舊) 잔재('workflows___...' 이름): 키=파일명 그대로,
        legacy_files 리스트에 수집해 호출측이 중첩 폴더로 자동 이동(마이그레이션)
      - folder_id: 파일이 실제로 속한 폴더 ID (업로드 parents / 이동 기준)
    """
    files_map = {}
    stack = [(root_id, "")]  # (folder_id, Workflows 기준 상대경로)
    while stack:
        folder_id, rel_dir = stack.pop()
        for entry in _list_folder_entries(service, folder_id):
            name, item_id = entry["name"], entry["id"]
            if entry["is_folder"]:
                sub_rel = f"{rel_dir}/{name}" if rel_dir else name
                stack.append((item_id, sub_rel))
                continue
            if not rel_dir:
                if name.startswith("workflows___"):
                    # 구(舊) 평면 잔재 — 기존 인코딩 키 그대로 지도에 포함하고 이동용으로 기록.
                    key = name
                    if legacy_files is not None:
                        # modifiedTime 포함 — 중첩 위치에同名 파일이 이미 있으면 dedup 시 신규 판정 기준.
                        legacy_files.append({
                            "key": key, "id": item_id, "name": name, "folder_id": folder_id,
                            "modifiedTime": entry["modifiedTime"],
                        })
                else:
                    key = (WORKFLOWS_NS + name).replace("/", "___")
            else:
                key = (WORKFLOWS_NS + rel_dir + "/" + name).replace("/", "___")
            files_map[key] = {
                "id": item_id,
                "name": name,
                "modifiedTime": entry["modifiedTime"],
                "size": entry["size"],
                "folder_id": folder_id,
            }
    return files_map


def _list_remote_files(service, subfolder_ids):
    """
    하위폴더 5종을 각각 조회해 하나의 지도로 병합한다.
      - config 4종: 평면 조회 (파일명에 '.configs/' 네임스페이스를 붙여 키 복원)
      - Workflows: _list_workflows_recursive 재귀 열거 (중첩 폴더 구조 → 키 복원)

    반환: (files_map, legacy_workflows)
      - files_map: { remote_key: {"id","name","modifiedTime","size","folder_id"} }
        · remote_key: '___' 로 인코딩된 rel_path (다운로드/스냅샷 로직과 동일한 키)
        · folder_id : 파일이 속은 하위폴더 ID (업로드 시 parents 지정용)
        · modifiedTime: Drive modifiedTime 을 파싱한 epoch 초 (원격 상태의 유일한 시간 기준)
        · size      : Drive 의 size (폴더/구글 문서는 없을 수 있어 0)
      - legacy_workflows: Workflows 루트에 남은 구 평면 잔재 목록 (마이그레이션용, modifiedTime 포함)

    이 목록이 곧 원격 상태이므로 별도의 manifest 파일은 쓰지 않는다.
    (중단/오류/버전 불일치 없이 다음 동기화에서 원격을 그대로 보고 재개 가능)
    """
    files_map = {}
    legacy_workflows = []
    for folder_name, folder_id in subfolder_ids.items():
        if folder_name == REMOTE_WORKFLOWS_FOLDER:
            files_map.update(
                _list_workflows_recursive(service, folder_id, legacy_files=legacy_workflows)
            )
            continue
        for stored_name, meta in _list_folder_files(service, folder_id).items():
            remote_key = _remote_key_from_stored(stored_name)
            meta["name"] = stored_name
            meta["folder_id"] = folder_id
            files_map[remote_key] = meta
    return files_map, legacy_workflows


def _parse_drive_time(iso_str):
    """Drive 의 ISO8601(UTC) 시간 문자열 또는 epoch 숫자를 epoch 초(float)로 변환. 실패 시 0."""
    if iso_str is None:
        return 0.0
    # 다운로드 경로의 remote_meta 는 _list_remote_files 에서 이미 epoch float 으로
    # 바꿔둔 값을 갖고 있으므로, 숫자는 파싱 없이 그대로 쓴다.
    if isinstance(iso_str, (int, float)):
        try:
            epoch = float(iso_str)
        except (TypeError, ValueError):
            return 0.0
        return epoch if epoch > 0 else 0.0
    if not isinstance(iso_str, str) or not iso_str:
        return 0.0
    try:
        import datetime as _dt
        s = iso_str.replace("Z", "+00:00")
        return _dt.datetime.fromisoformat(s).timestamp()
    except Exception:
        return 0.0


def _pin_local_mtime(full_path, iso_time):
    """
    로컬 파일의 mtime 을 Drive modifiedTime 값과 일치시킨다 (업/다운 루프 방지의 핵심).

    Drive API v3 은 원격 modifiedTime 을 클라이언트가 지정할 수 없다(읽기 전용).
    따라서 '원격을 로컬에 맞추는' 대신 '로컬을 원격에 맞춘다'. 양쪽이 같아지면
    다음 동기화에서 업로드/다운로드 조건이 모두 거짓이 되어 반복 전송이 사라진다.

    iso_time 은 ISO8601 문자열(업로드 응답) 또는 epoch float(원격 목록 캐시)
    둘 다 받는다. 다운로드 쪽은 _list_remote_files 가 이미 epoch 으로 바꿔두므로
    이전 코드는 float.replace() 에서 예외가 나 고정이 조용히 실패했었다.

    파싱 실패/적용 실패 시 False (호출측은 조용히 진행 — 다음 동기화에서 재시도).
    """
    epoch = _parse_drive_time(iso_time)
    if epoch <= 0:
        return False
    try:
        os.utime(full_path, (epoch, epoch))
        return True
    except Exception as e:
        logger.debug(f"[GDrive] mtime pin failed {full_path}: {e}")
        return False


def _upload_single_file(service, folder_id, rel_path, local_meta,
                        existing_id=None, existing_meta=None):
    """
    단일 파일 업로드 (신규 or 갱신).

    folder_id     : 파일이 들어갈 Drive 하위폴더 ID (Presets/.../Workflows 또는 중첩 하위폴더).
    existing_id   : 원격 목록에서 미리 찾은 파일 ID (없으면 신규 생성)
    existing_meta : 원격 목록 메타 ({"name","folder_id"}). 이름/위치가 현재 대상과 다르면
                    갱신과 동시에 이름 변경 + 폴더 이동 (구 평면 잔재 마이그레이션용).
    업로드 후 **응답으로 돌아온 modifiedTime 을 읽어 로컬 mtime 에 그대로 고정**한다.
    (Drive API v3 create()/update() 는 modifiedTime 파라미터를 받지 않으므로
      원격 시간을 지정하는 방식은 쓸 수 없다.)
    """
    full_path = _resolve_local_path(rel_path)
    # 하위폴더 안 실제 저장 파일명 (모두 basename — 중첩 폴더가 디렉터리를 표현).
    remote_name = _stored_remote_name(rel_path)
    fields = 'id, modifiedTime'

    media = MediaFileUpload(full_path, mimetype='application/json', resumable=True)
    if existing_id:
        body = {}
        kwargs = {}
        if existing_meta:
            if existing_meta.get("name") and existing_meta["name"] != remote_name:
                body['name'] = remote_name
            old_parent = existing_meta.get("folder_id")
            if old_parent and old_parent != folder_id:
                kwargs['addParents'] = folder_id
                kwargs['removeParents'] = old_parent
        resp = service.files().update(
            fileId=existing_id,
            body=body or None,
            media_body=media,
            fields=fields,
            **kwargs,
        ).execute()
    else:
        file_metadata = {'name': remote_name, 'parents': [folder_id]}
        resp = service.files().create(
            body=file_metadata,
            media_body=media,
            fields=fields,
        ).execute()

    _pin_local_mtime(full_path, (resp or {}).get('modifiedTime'))
    return local_meta


def _download_single_file(service, rel_path, remote_meta):
    """
    단일 파일 다운로드 (다운로드 전 기존 파일 .bak 백업).

    remote_meta : 원격 목록에서 미리 찾은 {"id","modifiedTime","size"}
    다운로드 후 로컬 mtime 을 원격 modifiedTime 으로 고정(os.utime) → 다음 동기화에서
    양쪽 시간이 같아져 다시 다운로드/업로드하는 루프가 생기지 않는다.
    (폴더 위치는 remote_meta["id"] 로 직접 접근하므로 부모 폴더 ID 가 필요 없다)
    """
    remote_file_id = remote_meta.get("id")
    if not remote_file_id:
        return None

    request = service.files().get_media(fileId=remote_file_id)
    fh = io.BytesIO()
    downloader = MediaIoBaseDownload(fh, request)
    done = False
    while not done:
        status, done = downloader.next_chunk()
    fh.seek(0)
    payload = fh.read()

    full_path = _resolve_local_path(rel_path)
    if os.path.exists(full_path):
        # engines_registry.json 은 GitHub 배포 기본값과 사용자 수정본이 공존하는 파일이라
        # `git pull` 이 배포본으로 되돌린 직후 동기화가 돌면 사용자가 UI 에서 저장한
        # 프롬프트가 조용히 덮여버린다. 덮어쓰기 직전 .bak 은 모든 파일에 대해 남기고,
        # 이 파일에 한해서만 경고 로그를 남여 원인 추적이 가능하게 한다.
        try:
            with open(full_path, 'rb') as src, open(full_path + '.bak', 'wb') as dst:
                dst.write(src.read())
            if rel_path.endswith('engines_registry.json'):
                logger.warning(
                    "[GDrive] Overwriting engines_registry.json with the remote version. "
                    f"The existing content is kept at {full_path}.bak. "
                    "(If this happened during sync, your local changes were replaced by another PC's version)"
                )
        except Exception:
            pass

    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, 'wb') as f:
        f.write(payload)

    # 원격 시간을 로컬 mtime 에 고정 (루프 방지의 핵심).
    _pin_local_mtime(full_path, remote_meta.get("modifiedTime"))
    return remote_meta


def _move_flat_workflow_file(service, file_id, new_name, target_folder_id, old_folder_id):
    """평면 잔재를 basename 으로 rename 하고 중첩 폴더로 이동. 동일 폴더(최상위 파일)이면 rename 만."""
    kwargs = {}
    if old_folder_id and old_folder_id != target_folder_id:
        # 같은 부모를 add/remove 동시에 보내는 건 모순이므로 동일 폴더면 생략.
        kwargs['addParents'] = target_folder_id
        kwargs['removeParents'] = old_folder_id
    service.files().update(
        fileId=file_id,
        body={'name': new_name},
        fields='id',
        **kwargs,
    ).execute()


def _perform_sync_blocking():
    """
    실제 동기화(차단) 작업.

    원격 폴더 목록을 1회 조회해 {파일명: 메타} 지도를 만든 뒤, 로컬 스캔 결과와
    modifiedTime(mtime) 기준으로 비교해 변경분만 업/다운로드한다.
    (manifest 파일 없이도 중단·오류 시 다음 동기화에서 원격을 보고 그대로 재개)

    반환: {"status", "message", "uploaded", "downloaded", "last_sync_at"}
    """
    # 이미 동기화가 돌고 있으면(수동 버튼/자동 겹침) 중복 실행하지 않는다.
    if not _SYNC_GUARD.acquire(blocking=False):
        return {"status": "busy", "message": "A sync is already in progress.", "uploaded": 0, "downloaded": 0}

    service, msg = get_drive_service()
    if not service:
        _SYNC_GUARD.release()
        _notify_sync_state(False)
        return {"status": "error", "message": msg, "uploaded": 0, "downloaded": 0}

    _CANCEL_EVENT.clear()
    _notify_sync_state(True)
    cancelled = False

    try:
        # 루트 폴더 → 그 안의 하위폴더 5종 ID 조회/생성 (이미 있으면 재사용).
        root_id = _get_or_create_remote_folder(service, FOLDER_NAME)
        subfolder_ids = _get_subfolder_ids(service, root_id)
        local_manifest = build_local_manifest()
        remote_files, legacy_workflows = _list_remote_files(service, subfolder_ids)
        # 중첩 폴더 캐시는 이번 동기화 기준으로 초기화 (이전 세션의 stale 폴더 ID 방지).
        _WORKFLOW_FOLDER_CACHE.clear()

        uploaded_count = 0
        downloaded_count = 0

        # --- B안: 업로드 대상 사전 계산 (정확한 분모) ---
        # 전송 루프에 들어가기 전 메모리 내 비교만으로 대상을 확정한다.
        # API 추가 호출·디스크 재스캔 없음 (local_manifest/remote_files 재사용).
        to_upload = []
        for rel_path, local_meta in local_manifest.items():
            remote_name = rel_path.replace('/', '___')
            remote_meta = remote_files.get(remote_name)
            if (not remote_meta
                    or remote_meta.get("modifiedTime", 0) < local_meta["mtime"] - 1):
                to_upload.append(rel_path)
        total_upload = len(to_upload)

        # --- 로컬 기준: 업로드 (원격에 없거나 로컬이 더 새로움) ---
        uploaded = set()  # 이번 세션 업로드한 파일 (다운로드 루프 모순 방지)
        for rel_path in to_upload:
            if _CANCEL_EVENT.is_set():
                cancelled = True
                break
            local_meta = local_manifest.get(rel_path)
            if local_meta is None:
                continue
            remote_name = rel_path.replace('/', '___')
            remote_meta = remote_files.get(remote_name)

            existing_id = remote_meta.get("id") if remote_meta else None
            # rel_path 성격에 맞는 하위폴더(Presets/.../Workflows) ID로 업로드.
            target_folder_name = _target_folder_name(rel_path)
            if target_folder_name is None:
                # 매핑 밖(이론상 발생 불가 — 화이트리스트로 이미 걸러짐). 안전하게 건너뜀.
                continue
            if target_folder_name == REMOTE_WORKFLOWS_FOLDER:
                # 로컬 하위 디렉터리 구조를 Drive 중첩 폴더로 그대로 재현한다.
                subdir = os.path.dirname(rel_path[len(WORKFLOWS_NS):])
                target_folder_id = _ensure_workflow_folder(
                    service, subfolder_ids[REMOTE_WORKFLOWS_FOLDER],
                    subdir.replace("\\", "/"))
            else:
                target_folder_id = subfolder_ids[target_folder_name]
            _upload_single_file(service, target_folder_id, rel_path, local_meta,
                                existing_id, existing_meta=remote_meta)
            uploaded.add(rel_path)
            uploaded_count += 1
            logger.info(f"[GDrive] upload: {rel_path}")
            # A안: 매 파일마다 푸시 — 작은 파일이 많아도 진행률이 살아움직인다.
            # WS 350회 수준은 노이즈가 아니라 정상 범위.
            _notify_sync_state(True, phase="uploading", done=uploaded_count,
                              total=total_upload, current=rel_path)

        # --- B안: 다운로드 대상 사전 계산 (정확한 분모) ---
        # remote_files 키는 '___' 인코딩 이름이므로 로컬 rel_path로 되돌려 판정.
        # 이번 세션 업로드분 제외 + 화이트리스트 밖 잔재 제외까지 미리 반영.
        to_download = []
        for remote_name, remote_meta in remote_files.items():
            rel_path = remote_name.replace('___', '/')
            if rel_path in uploaded:
                continue
            try:
                _resolve_local_path(rel_path)
            except ValueError:
                continue
            local_meta = local_manifest.get(rel_path)
            if (not local_meta
                    or remote_meta.get("modifiedTime", 0) > local_meta.get("mtime", 0) + 1):
                to_download.append(rel_path)
        total_download = len(to_download)

        # --- 원격 기준: 다운로드 (원격이 더 새롭거나 로컬에 없음) ---
        for rel_path in to_download:
            if _CANCEL_EVENT.is_set():
                cancelled = True
                break
            remote_name = rel_path.replace('/', '___')
            remote_meta = remote_files.get(remote_name)
            if remote_meta is None:
                continue

            result_meta = _download_single_file(service, rel_path, remote_meta)
            if result_meta is not None:
                downloaded_count += 1
                logger.info(f"[GDrive] download: {rel_path}")
                # A안: 매 파일마다 푸시 — "54/54"처럼 정확히 찬다.
                _notify_sync_state(True, phase="downloading", done=downloaded_count,
                                  total=total_download, current=rel_path)

        # --- 워크플로우 구조 마이그레이션: 구 평면 잔재('workflows___...')를 중첩 폴더로 이동 ---
        # 이름/위치만 정정하고 내용은 그대로다. 실패해도 잔재는 매번 재귀 열거에서
        # 다시 잡히므로 다음 동기화에서 재시도된다.
        if not cancelled and legacy_workflows:
            for legacy in legacy_workflows:
                if _CANCEL_EVENT.is_set():
                    cancelled = True
                    break
                legacy_rel = legacy["key"].replace('___', '/')
                # 이번 세션 업로드 루프가 이미 인라인 rename+move 로 옮긴 잔재는 스킵.
                # (잔재 기록은 동기화 전 스냅샷이라 name/folder_id 가 stale 함.)
                if legacy_rel in uploaded:
                    continue
                try:
                    _resolve_local_path(legacy_rel)
                except ValueError:
                    continue
                basename = legacy_rel.split('/')[-1]
                subdir = os.path.dirname(legacy_rel[len(WORKFLOWS_NS):])
                target_id = _ensure_workflow_folder(
                    service, subfolder_ids[REMOTE_WORKFLOWS_FOLDER],
                    subdir.replace("\\", "/"))
                if legacy.get("name") == basename and legacy.get("folder_id") == target_id:
                    continue
                # 중첩 위치에同名 파일이 이미 있으면 (다른 PC 가 먼저 업로드/수동 복사)
                # modifiedTime 으로 신규 쪽을 유지하고 낡은 쪽만 삭제.
                # (그냥 rename 하면 같은 폴더에同名 파일 2개가 만들어진다.)
                nested_meta = remote_files.get(legacy["key"])
                if nested_meta and nested_meta.get("id") != legacy["id"]:
                    try:
                        if nested_meta.get("modifiedTime", 0) >= legacy.get("modifiedTime", 0):
                            # 중첩이 더 새것 → 구 평면 잔재 삭제.
                            service.files().delete(fileId=legacy["id"]).execute()
                            logger.info(
                                f"[GDrive] drop stale flat workflow file (nested is newer): {legacy['name']}"
                            )
                        else:
                            # 평면이 더 새것 → 중첩 위치로 옮긴 뒤 낡은 중첩 파일 삭제.
                            _move_flat_workflow_file(
                                service, legacy["id"], basename, target_id,
                                legacy.get("folder_id"))
                            service.files().delete(fileId=nested_meta["id"]).execute()
                            logger.info(
                                f"[GDrive] replace stale nested workflow with newer flat copy: {legacy['name']}"
                            )
                    except Exception as e:  # noqa: BLE001
                        logger.warning(f"[GDrive] workflow dedup failed ({legacy['name']}): {e}")
                    continue
                try:
                    _move_flat_workflow_file(
                        service, legacy["id"], basename, target_id,
                        legacy.get("folder_id"))
                    logger.info(
                        f"[GDrive] migrate flat workflow file: {legacy['name']} -> {basename}"
                    )
                except Exception as e:  # noqa: BLE001
                    logger.warning(f"[GDrive] workflow migration failed ({legacy['name']}): {e}")

        # 마지막 동기화 결과 영속 저장 → 설정창 status API 가 읽어 표시.
        # (취소된 경우에도 이번에 실제로 옮긴 개수는 정확하므로 그대로 기록)
        _save_last_sync_state(uploaded_count, downloaded_count)

        if cancelled:
            logger.info(
                f"[GDrive] sync cancelled by user (uploaded: {uploaded_count}, downloaded: {downloaded_count})"
            )
            _notify_sync_state(False, phase="cancelled", done=downloaded_count,
                              total=total_download,
                              uploaded=uploaded_count, downloaded=downloaded_count)
            return {
                "status": "cancelled",
                "message": f"Sync cancelled (uploaded: {uploaded_count}, downloaded: {downloaded_count})",
                "uploaded": uploaded_count,
                "downloaded": downloaded_count,
                "last_sync_at": time.time(),
            }

        _notify_sync_state(False, phase="done",
                          uploaded=uploaded_count, downloaded=downloaded_count)
        return {
            "status": "success",
            "message": f"Sync completed (uploaded: {uploaded_count}, downloaded: {downloaded_count})",
            "uploaded": uploaded_count,
            "downloaded": downloaded_count,
            "last_sync_at": time.time(),
        }

    except Exception as e:
        logger.error(f"[GDrive] sync error: {e}", exc_info=True)
        return {"status": "error", "message": str(e), "uploaded": 0, "downloaded": 0}
    finally:
        # 프론트에 "동기화 끝"을 알려 구름 아이콘/버튼 스핀을 멈추게 한다.
        _notify_sync_state(False)
        _SYNC_GUARD.release()


def _notify_sync_state(syncing, uploaded=0, downloaded=0,
                       phase=None, done=0, total=0, current=""):
    """
    동기화 시작/진행/종료를 연결된 프론트엔드에 WebSocket 으로 푸시한다.

    - 폴링이 전혀 없다. 서버가 상태가 바뀔 때만 send 알린다.
    - phase: "uploading"|"downloading" (진행 중, 매 파일마다) | "done"|"cancelled" (종료)
    - 진행 중엔 done/total/current(현재 파일)로 "86/340" 표시가 가능하다.
    - PromptServer.instance.send_sync 는 스레드에서 호출해도 안전하다
      (내부적으로 loop.call_soon_threadsafe 사용).
    - PromptServer 가 아직 준비되지 않았거나 실패해도 조용히 무시한다.
    """
    try:
        from server import PromptServer
        instance = getattr(PromptServer, "instance", None)
        if instance is None:
            return
        payload = {
            "syncing": bool(syncing),
            "uploaded": int(uploaded),
            "downloaded": int(downloaded),
        }
        if phase:
            payload["phase"] = phase
        # 원인1 수정: total=0이어도 done/total을 보낸다.
        # 이전엔 `if total:`이라 할 일 0건이면 필드 자체가 없어
        # 프론트가 숫자를 표시할 수 없었다.
        if phase in ("uploading", "downloading", "cancelled", "done"):
            payload["done"] = int(done)
            payload["total"] = int(total)
        if current:
            # 전체 경로가 길면 파일명만 (토스트/툴팁용).
            payload["current"] = str(current).split("/")[-1]
        # WS 푸시와 별개로 최신 진행률을 기억장치에 저장.
        # 설정창이 늦게 열려 WS를 놓쳐도 status 폴링으로 숫자를 복원한다.
        try:
            with _PROGRESS_LOCK:
                _LAST_PROGRESS.clear()
                _LAST_PROGRESS.update(payload)
                _LAST_PROGRESS["updated_at"] = time.time()
        except Exception:
            pass
        instance.send_sync("bada.cloud.sync", payload)
    except Exception as e:
        logger.debug(f"[GDrive] sync-state push failed (ignored): {e}")


def is_syncing():
    """현재 동기화가 돌고 있는지 (락 상태). 폴링 없이 1회 질의용."""
    return _SYNC_GUARD.locked()


def request_sync_cancel():
    """
    진행 중인 동기화 중단을 요청한다.

    반환: {"status": "cancelling"|"idle", "message": ...}
      - cancelling: 중단 플래그를 세웠다. 진행 중이던 파일이 끝나는 즉시 루프를 빠져나온다.
      - idle      : 애초에 돌고 있는 동기화가 없다.
    """
    if not _SYNC_GUARD.locked():
        return {"status": "idle", "message": "No sync is currently running."}
    _CANCEL_EVENT.set()
    logger.info("[GDrive] Sync cancellation requested by user.")
    return {"status": "cancelling", "message": "Sync cancellation requested."}


async def sync_gdrive_async():
    """넌블로킹 동기화 래퍼. 이미 동기화 중이면 busy 반환."""
    # busy 판정도 수행부(_SYNC_GUARD)와 같은 락을 본다.
    # (예전엔 asyncio 락을 별도로 봐서 둘의 상태가 어긋날 수 있었다.)
    if _SYNC_GUARD.locked():
        return {"status": "busy", "message": "A sync operation is already in progress."}

    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(_THREAD_POOL, _perform_sync_blocking)
    return result


def schedule_startup_autosync(delay_seconds=0.0):
    """
    ComfyUI 기동 시 1회 자동 동기화를 예약한다 (완전 비동기·논블로킹).

    - 별도 데몬 스레드에서 돌므로 ComfyUI 기동/GUI 를 전혀 막지 않는다.
    - delay_seconds 기본 0: 굳이 기다릴 이유가 없다. 동기화는 백그라운드이고,
      manifest 를 쓰지 않으므로 중단·오류가 나도 다음 실행에 원격을 보고 재개한다.
    - 미인증(token.json 없음) 상태에서는 아무 것도 하지 않는다. 기동과 동시에
      OAuth 인증 브라우저 창이 뜨는 것을 막기 위함 — 인증은 설정창 버튼으로 유도.
    - 라이브러리 미설치, 이미 예약됨, 이미 동기화 중인 경우도 조용히 스킵.
    """
    global _AUTOSYNC_SCHEDULED
    if _AUTOSYNC_SCHEDULED:
        return False
    if not GDRIVE_LIBS_AVAILABLE:
        return False
    if not os.path.exists(TOKEN_PATH):
        logger.info(
            "[GDrive] Startup auto-sync skipped: Google account not linked yet "
            "(press Cloud Sync in settings to authorize)."
        )
        return False

    _AUTOSYNC_SCHEDULED = True

    def _worker():
        try:
            if delay_seconds > 0:
                time.sleep(delay_seconds)
            result = _perform_sync_blocking()
            status = result.get("status")
            if status == "success":
                logger.info(
                    "[GDrive] Startup auto-sync done "
                    f"(uploaded: {result.get('uploaded', 0)}, downloaded: {result.get('downloaded', 0)})"
                )
            elif status == "busy":
                logger.debug("[GDrive] Startup auto-sync skipped: sync already running.")
            elif status == "cancelled":
                # 사용자가 끊은 것은 실패가 아니므로 WARNING이 아닌 INFO로 기록.
                logger.info(
                    "[GDrive] Startup auto-sync cancelled by user "
                    f"(uploaded: {result.get('uploaded', 0)}, downloaded: {result.get('downloaded', 0)})"
                )
            else:
                logger.warning(f"[GDrive] Startup auto-sync failed: {result.get('message')}")
        except Exception as e:  # noqa: BLE001
            logger.warning(f"[GDrive] Startup auto-sync error (ignored): {e}")

    threading.Thread(target=_worker, daemon=True, name="GDriveAutoSync").start()
    logger.info("[GDrive] Startup auto-sync scheduled (background, does not block ComfyUI).")
    return True


def _count_config_items(filename, full_path):
    """
    개인 데이터 파일의 '내용 갯수'를 센다. 설정창에서 "N개"로 보여주기 위함.
    실패/미존재 시 None (프론트에서 갯수 자리를 비운다).

    파일마다 구조가 다르므로 파일명으로 분기한다.
      - favorites_data.json      : 최상단 배열 → len
      - gemini_chat_history.json : {"chats":[...]} → len(chats)
      - engines_registry.json    : user_prompts + gemini_prompts 배열 길이 합
      - presets_data.json        : {노드타입:{프리셋명:{...}}} → 모든 리프 프리셋 합
    """
    try:
        with open(full_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return None

    try:
        if filename == "favorites_data.json":
            if isinstance(data, list):
                return len(data)
            if isinstance(data, dict) and isinstance(data.get("favorites"), list):
                return len(data["favorites"])
            return None

        if filename == "gemini_chat_history.json":
            if isinstance(data, dict) and isinstance(data.get("chats"), list):
                return len(data["chats"])
            return None

        if filename == "engines_registry.json":
            if not isinstance(data, dict):
                return None
            up = data.get("user_prompts")
            gp = data.get("gemini_prompts")
            total = 0
            if isinstance(up, list):
                total += len(up)
            if isinstance(gp, list):
                total += len(gp)
            return total

        if filename == "presets_data.json":
            # {노드타입: {프리셋명: {...}}} 또는 {노드타입: [프리셋...]}
            if not isinstance(data, dict):
                return None
            total = 0
            for node_val in data.values():
                if isinstance(node_val, dict):
                    total += len(node_val)
                elif isinstance(node_val, list):
                    total += len(node_val)
            return total
    except Exception:
        return None
    return None


def get_sync_file_details():
    """
    설정창 현황 표시용.

    `.configs/*` 개인 데이터는 파일별로 존재/용량/내용갯수를 낱개로 반환하고,
    워크플로우는 개수가 많을 수 있어 **한 줄 요약**(존재 개수 + 총 용량)으로만 반환한다.
    """
    details = []
    for rel_path in get_target_rel_paths():
        try:
            full_path = _resolve_local_path(rel_path)
        except ValueError:
            continue
        name = os.path.basename(rel_path)
        if os.path.isfile(full_path):
            entry = {
                "name": name,
                "exists": True,
                "size": os.path.getsize(full_path),
            }
            cnt = _count_config_items(name, full_path)
            if cnt is not None:
                entry["count"] = cnt
            details.append(entry)
        else:
            details.append({"name": name, "exists": False, "size": 0})

    # 워크플로우 요약 — 낱개로 나열하면 설정창이 수십 줄로 늘어나므로 요약 1줄만.
    wf_count = 0
    wf_bytes = 0
    try:
        for rel_path in _iter_workflow_rel_paths():
            try:
                full_path = _resolve_local_path(rel_path)
            except ValueError:
                continue
            if os.path.isfile(full_path):
                wf_count += 1
                wf_bytes += os.path.getsize(full_path)
    except Exception as e:
        logger.debug(f"[GDrive] workflow summary failed (ignored): {e}")

    details.append({
        "name": "workflows",
        "exists": wf_count > 0,
        "size": wf_bytes,
        "count": wf_count,
    })
    return details


def get_remote_counts_snapshot():
    """
    팝업 열 때 1회 호출 — 원격(Drive) 개수 + 추적 경로 스냅샷.

    반환: {"success": bool, "targets": [...], "error": str}
      targets 항목:
        - name        : 파일명 또는 "workflows"
        - local_path  : 로컬 절대경로 (config=파일, workflows=폴더)
        - remote_name : Drive 원격 이름 (config='___' 인코딩 키 / workflows='Workflows' 구조 표시)
        - local_count : 로컬 내용 개수 (config=내용, workflows=파일 수)
        - remote_count: 원격 내용 개수 (config=원격 파일 있으면 로컬과 동일 취급 불가→None,
                        workflows=원격 파일 수; config 원격은 존재 여부만)
        - remote_exists: 원격에 파일/항목이 하나라도 있는지

    설계:
      - config 4종은 원격 파일을 메모리로 다운로드해 내용 개수까지 셈
        (디스크 기록 없음, 합 ~100KB·1~2초, 팝업 열 때 1회만).
        실패하면 remote_count=None → 팝업은 "원격 있음"으로 표시.
      - workflows는 원격 파일 수 = 항목 수이므로 remote_count 확정 가능.
      - 동기화 중이 아닐 때만 호출 권장 (동기화 중엔 개수 변동).
      - 인증 실패 시 success=False + error.
    """
    targets = []
    # 로컬 기준 골격 먼저 (원격 실패해도 경로는 보여준다).
    try:
        wf_root = _resolve_workflows_root()
    except Exception:
        wf_root = ""
    for rel_path in get_target_rel_paths():
        name = os.path.basename(rel_path)
        try:
            local_path = _resolve_local_path(rel_path)
        except ValueError:
            local_path = ""
        local_count = None
        if local_path and os.path.isfile(local_path):
            try:
                local_count = _count_config_items(name, local_path)
            except Exception:
                local_count = None
        targets.append({
            "name": name,
            "local_path": local_path,
            # rel_path('.configs/<name>') → 원격 이름 규칙과 동일하게 인코딩.
            "remote_name": rel_path.replace("/", "___"),
            "local_count": local_count,
            "remote_count": None,
            "remote_exists": False,
            "kind": "config",
        })
    # 워크플로우 로컬 개수
    wf_local_count = 0
    try:
        for rel_path in _iter_workflow_rel_paths():
            try:
                fp = _resolve_local_path(rel_path)
            except ValueError:
                continue
            if os.path.isfile(fp):
                wf_local_count += 1
    except Exception:
        pass
    targets.append({
        "name": "workflows",
        "local_path": wf_root,
        "remote_name": "Workflows/ (로컬 디렉터리 구조를 실제 중첩 폴더로 저장)",
        "local_count": wf_local_count,
        "remote_count": None,
        "remote_exists": False,
        "kind": "workflows",
    })

    # 원격 조회 (루트 1회 + 하위폴더 5종 조회·생성 후 각 폴더 목록 병합)
    service, msg = get_drive_service()
    if service is None:
        return {"success": False, "error": msg, "targets": targets}
    try:
        # 루트 → 하위폴더 5종 ID 조회/생성 후 병합 목록 (동기화와 동일한 구조).
        root_id = _get_or_create_remote_folder(service, FOLDER_NAME)
        subfolder_ids = _get_subfolder_ids(service, root_id)
        remote_files, _ = _list_remote_files(service, subfolder_ids)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[GDrive] remote counts snapshot failed: {e}")
        return {"success": False, "error": str(e), "targets": targets}

    # remote_files 키는 '___' 인코딩 이름.
    wf_remote_count = 0
    # config 원격 내용 개수 — 메모리로만 다운로드해 파싱 (디스크 기록 없음).
    # 파일 4개, 합 ~100KB, 1~2초. 팝업 열 때 1회만이라 부담 없음.
    def _count_remote_config(remote_name):
        meta = remote_files.get(remote_name)
        if not meta or not meta.get("id"):
            return None
        try:
            request = service.files().get_media(fileId=meta["id"])
            fh = io.BytesIO()
            downloader = MediaIoBaseDownload(fh, request)
            done = False
            while not done:
                _, done = downloader.next_chunk()
            fh.seek(0)
            data = json.loads(fh.read().decode("utf-8"))
            # _count_config_items는 디스크 경로를 받으므로 여기서 직접 분기.
            # (같은 구조 판정 — 파일 4종)
            fname = remote_name.split("___")[-1]
            if fname == "favorites_data.json":
                if isinstance(data, list):
                    return len(data)
                if isinstance(data, dict) and isinstance(data.get("favorites"), list):
                    return len(data["favorites"])
                return None
            if fname == "gemini_chat_history.json":
                if isinstance(data, dict) and isinstance(data.get("chats"), list):
                    return len(data["chats"])
                return None
            if fname == "engines_registry.json":
                if not isinstance(data, dict):
                    return None
                total = 0
                up = data.get("user_prompts")
                gp = data.get("gemini_prompts")
                if isinstance(up, list):
                    total += len(up)
                if isinstance(gp, list):
                    total += len(gp)
                return total
            if fname == "presets_data.json":
                if not isinstance(data, dict):
                    return None
                total = 0
                for node_val in data.values():
                    if isinstance(node_val, dict):
                        total += len(node_val)
                    elif isinstance(node_val, list):
                        total += len(node_val)
                return total
        except Exception as e:  # noqa: BLE001
            logger.debug(f"[GDrive] remote content count failed ({remote_name}): {e}")
            return None
        return None

    for t in targets:
        if t["kind"] == "config":
            rn = t["remote_name"]
            if rn in remote_files:
                t["remote_exists"] = True
                t["remote_count"] = _count_remote_config(rn)
        else:
            for rn in remote_files:
                if rn.startswith("workflows___"):
                    wf_remote_count += 1
            t["remote_count"] = wf_remote_count
            t["remote_exists"] = wf_remote_count > 0
    return {"success": True, "targets": targets}


# --- Web UI "Open Local" action -------------------------------------------------
def _reveal_in_explorer(path):
    """로컬 파일/폴더를 탐색기(Finder)에서 *열어 보여준다* — 파일 자체를 기본 프로그램으로 실행하지 않는다.

    - Windows: 파일은 `explorer.exe /select,"<path>"` (부모 폴더 열기 + 해당 파일 하이라이트),
      폴더는 바로 열기.
    - macOS: 파일은 `open -R <path>` (Finder reveal), 폴더는 `open <path>`.
    - Linux: 부모 디렉터리 xdg-open.
    """
    abs_path = os.path.abspath(path)
    if os.name == "nt":
        # path 는 항상 서버 측에서 화이트리스트로 해석된 값 (클라이언트 입력 아님).
        if os.path.isfile(abs_path):
            subprocess.Popen(["explorer.exe", f"/select,{abs_path}"])
        else:
            subprocess.Popen(["explorer.exe", abs_path])
    elif sys.platform == "darwin":
        if os.path.isfile(abs_path):
            subprocess.Popen(["open", "-R", abs_path])
        else:
            subprocess.Popen(["open", abs_path])
    else:
        target = abs_path if os.path.isdir(abs_path) else (os.path.dirname(abs_path) or ".")
        subprocess.Popen(["xdg-open", target])


def _find_explorer_window(folder_name):
    """타이틀이 folder_name 과 일치하는 보이는 탐색기 창 HWND 를 찾는다. (Windows 전용)

    EnumWindows 순서는 Z-order 상단→하단이므로 첫 매칭 = 가장 앞쪽 매칭 창이다.
    타이틀 완전 일치 우선, 없으면 부분(하위문자열) 일치로 폴백. 실패 시 None.
    """
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.windll.user32
    target = (folder_name or "").strip().lower()
    exact_hits = []
    partial_hits = []

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def _enum_proc(hwnd, lparam):
        if not user32.IsWindowVisible(hwnd):
            return True
        cls_buf = ctypes.create_unicode_buffer(64)
        user32.GetClassNameW(hwnd, cls_buf, 64)
        # 탐색기 창 클래스: CabinetWClass (폴더 뷰), ExploreWClass (검색/레거시).
        if cls_buf.value not in ("CabinetWClass", "ExploreWClass"):
            return True
        title_buf = ctypes.create_unicode_buffer(512)
        user32.GetWindowTextW(hwnd, title_buf, 512)
        title = title_buf.value.strip().lower()
        if target and (title == target or target in title):
            (exact_hits if title == target else partial_hits).append(hwnd)
        return True

    # 콜백 참조를 살려두어 EnumWindows 도중 GC 로 사라지지 않게 한다.
    user32.EnumWindows(_enum_proc, None)
    if exact_hits:
        return exact_hits[0]
    if partial_hits:
        return partial_hits[0]
    return None


def _bring_explorer_to_front(target_path):
    """Best-effort: 방금 연 탐색기 창을 포어그라운드로 올린다.

    Windows 의 SetForegroundWindow 락 정책(포어그라운드 잠금)이 백그라운드 프로세스의
    포커스 탈취를 막으므로, AttachThreadInput + Alt 키 주입 조합으로 우회한다.
    100% 성공 보장은 없다 — 사용자가 다른 앱에서 타이핑 중이면 OS 가 차단할 수 있고,
    그 경우 작업표시줄 깜빡임으로 폴백된다 (창 자체는 열린다).
    """
    if os.name != "nt":
        return
    try:
        import ctypes

        user32 = ctypes.windll.user32
        kernel32 = ctypes.windll.kernel32

        abs_path = os.path.abspath(target_path)
        # /select 의 경우 창 타이틀은 부모 폴더 이름이다.
        if os.path.isfile(abs_path):
            match_name = os.path.basename(os.path.dirname(abs_path))
        else:
            match_name = os.path.basename(abs_path.rstrip("\\/"))

        # 탐색기 창이 열릴 시간을 주며 최대 ~2초까지 폴링한다.
        hwnd = None
        deadline = time.time() + 2.0
        while time.time() < deadline:
            hwnd = _find_explorer_window(match_name)
            if hwnd:
                break
            time.sleep(0.15)
        if not hwnd:
            logger.debug("[GDrive] focus attempt skipped (no matching Explorer window)")
            return

        # 현재 스레드 입력 큐를 대상 창 스레드에 연결해 포어그라운드 권한을 임시로 획득한다.
        fg_thread = user32.GetWindowThreadProcessId(hwnd, None)
        cur_thread = kernel32.GetCurrentThreadId()
        attached = bool(user32.AttachThreadInput(cur_thread, fg_thread, True))
        try:
            # Alt 키 주입 트릭: OS 의 포어그라운드 락 타이머를 초기화한다.
            user32.keybd_event(0x12, 0, 0, 0)           # VK_MENU (Alt) down
            user32.keybd_event(0x12, 0, 0x0002, 0)      # Alt up (KEYEVENTF_KEYUP)
            if not user32.IsWindowVisible(hwnd):
                user32.ShowWindow(hwnd, 9)              # SW_RESTORE — 최소화 상태면 복원
            user32.BringWindowToTop(hwnd)
            ok = bool(user32.SetForegroundWindow(hwnd))
            logger.info(
                f"[GDrive] focus attempt on Explorer window: "
                f"{'ok' if ok else 'blocked by OS (taskbar blink fallback)'}"
            )
        finally:
            if attached:
                user32.AttachThreadInput(cur_thread, fg_thread, False)
    except Exception as e:  # noqa: BLE001 — best-effort. 열기 동작 자체는 절대 깨뜨리지 않는다.
        logger.debug(f"[GDrive] focus attempt failed (harmless): {e}")


def open_local_target(target_name):
    """
    Web UI "로컬 열기" 액션 — 대상 이름에 해당하는 로컬 *폴더*를 탐색기로 연다 (파일 자체는 실행하지 않음).

    - 폴더 대상(workflows): 폴더 바로 열기.
    - 파일 대상(.configs/*): `explorer /select` 로 부모 폴더를 열고 해당 파일을 하이라이트.
    열기 후 ctypes 로 창을 포어그라운드로 올리는 best-effort 시도를 한다 (_bring_explorer_to_front).

    보안 설계: 클라이언트는 *이름*만 보내고(화이트리스트), 경로 해석은 전부 서버 측에서
      _resolve_local_path / _resolve_workflows_root 를 통해 수행하므로 임의 경로·
      트래버설(..\\..)은 구조적으로 불가능하다.

    반환: {"success": bool, "path": str, "error": str}
    """
    name = str(target_name or "").strip()
    try:
        if name == "workflows":
            full_path = _resolve_workflows_root()
        elif name in SYNC_TARGET_FILES:
            full_path = _resolve_local_path(f".configs/{name}")
        else:
            return {"success": False, "error": f"Unknown target: {name}"}
    except ValueError as e:
        return {"success": False, "error": str(e)}

    if not os.path.exists(full_path):
        kind = "folder" if name == "workflows" else "file"
        return {
            "success": False,
            "path": full_path,
            "error": f"Local {kind} does not exist yet (not downloaded)",
        }
    try:
        _reveal_in_explorer(full_path)
        # 포어그라운드 집중 best-effort — 짧은 폴링 대기(최대 ~2초)가 있으므로 워커 스레드에서 호출해야 한다.
        _bring_explorer_to_front(full_path)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[GDrive] open local failed ({name}): {e}")
        return {"success": False, "path": full_path, "error": str(e)}
    logger.info(f"[GDrive] opened local target: {full_path}")
    return {"success": True, "path": full_path}


def _find_remote_folder_by_name(service, folder_name, parent_id=None):
    """
    Drive 폴더를 **조회만** 한다 (없어도 생성하지 않는다 — "열기" 액션이 Drive 를 오염시키면 안 된다).
    parent_id 가 주어지면 그 안에서만 찾는다(동명 폴더 혼동 방지), 없으면 My Drive 최상위.
    반환: 폴더 ID 또는 None.
    """
    escaped = folder_name.replace("\\", "\\\\").replace("'", "\\'")
    query = (f"name = '{escaped}' and "
             f"mimeType = 'application/vnd.google-apps.folder' and trashed = false")
    if parent_id:
        query += f" and '{parent_id}' in parents"
    results = service.files().list(q=query, fields="files(id, name)").execute()
    items = results.get('files', [])
    return items[0]['id'] if items else None


def open_drive_target(target_name):
    """
    Web UI "Drive 열기" 액션 — 대상 이름에 해당하는 Drive 파일/폴더의 URL 을 만들어 반환한다.
    (실제 브라우저 오픈은 프론트에서 window.open 으로 처리 — 서버는 URL 조립·검증만 담당)

    - 폴더 대상(workflows / config 4종 모두): **동기화 하위폴더까지만** 열린다.
      · workflows → '.../Workflows' 폴더 URL
      · config 4종 → '.../Presets' | 'Favorites' | 'GeminiChat' | 'SystemPrompts' 폴더 URL
      (파일 자체를 여는 대신 폴더까지만 — 로컬 '폴더 열기'와 동일한 정책.
       파일 URL 은 Drive 뷰어로 새 탭이 전환돼 UX 가 끊기고, 폴더가 더 유용하기 때문)

    보안 설계: open_local_target 과 동일 — 클라이언트는 이름(화이트리스트)만 보내고
      경로 해석은 전부 서버 측 매핑표를 통해 수행하므로 임의 경로 조작은 불가능하다.
    조회 전용이므로 Drive 에 폴더/파일을 생성하지 않는다 (없으면 실패로 응답).

    반환: {"success": bool, "url": str, "kind": "folder", "error": str}
    """
    name = str(target_name or "").strip()
    if name != "workflows" and name not in SYNC_TARGET_FILES:
        return {"success": False, "error": f"Unknown target: {name}"}

    try:
        service, reason = get_drive_service()
        if not service:
            return {"success": False, "error": f"Drive 연결 실패: {reason}"}

        # 루트 폴더(조회만) — 한 번도 동기화하지 않았으면 존재하지 않는다.
        root_id = _find_remote_folder_by_name(service, FOLDER_NAME)
        if not root_id:
            return {"success": False, "error": "Drive 에 동기화 폴더가 없습니다 (먼저 동기화하세요)"}

        if name == "workflows":
            folder_id = _find_remote_folder_by_name(service, REMOTE_WORKFLOWS_FOLDER, parent_id=root_id)
            if not folder_id:
                return {"success": False, "error": "Workflows 폴더가 Drive 에 아직 없습니다"}
            url = f"https://drive.google.com/drive/folders/{folder_id}"
            logger.info(f"[GDrive] drive target resolved: workflows → {url}")
            return {"success": True, "kind": "folder", "url": url}

        # config 4종 — workflows 와 동일하게 **전용 하위폴더까지만** 연다 (파일 URL 아님).
        # 매핑표(REMOTE_FOLDER_BY_REL)로 서브폴더명만 확정하고, 파일명(_stored_remote_name)은 쓰지 않는다.
        rel_path = f".configs/{name}"
        subfolder_name = REMOTE_FOLDER_BY_REL.get(rel_path)
        if not subfolder_name:
            return {"success": False, "error": f"Unknown target: {name}"}

        subfolder_id = _find_remote_folder_by_name(service, subfolder_name, parent_id=root_id)
        if not subfolder_id:
            return {"success": False, "error": f"'{subfolder_name}' 폴더가 Drive 에 아직 없습니다"}

        url = f"https://drive.google.com/drive/folders/{subfolder_id}"
        logger.info(f"[GDrive] drive target resolved: {name} → {url}")
        return {"success": True, "kind": "folder", "url": url}
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[GDrive] open drive target failed ({name}): {e}")
        return {"success": False, "error": str(e)}
