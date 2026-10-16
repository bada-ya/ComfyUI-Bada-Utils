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
  5. 중복 실행 방지 (_SYNC_GUARD)
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
    from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload
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
GDRIVE_SETTINGS_PATH = os.path.join(PARENT_DIR, '.gdrive_settings.json')

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
    '.gdrive_snapshot.json',
}

# 워크플로우 폴더를 재귀 스캔할 때 건너뛸 디렉터리 (휴지통 폴더 포함).
WORKFLOW_EXCLUDE_DIRS = {'__pycache__', '_deleted_workflows'}

# 1차 버전의 로컬 캐시 매니페스트 경로 (워크플로우 폴더를 더럽히지 않도록 노드 루트).
LOCAL_MANIFEST_CACHE = os.path.join(PARENT_DIR, '.gdrive_manifest.json')

# 마지막 동기화 결과(시각/업·다운로드 수) 영속 파일.
# status API 가 매번 이걸 읽어 설정창에 "언제·무엇을" 보여준다. 새로고침 후에도 유지.
LAST_SYNC_STATE_FILE = os.path.join(PARENT_DIR, '.gdrive_sync_state.json')

# 3-Way Snapshot 파일 (삭제 및 이동 추적을 통한 좀비 파일 방지용).
SNAPSHOT_STATE_FILE = os.path.join(PARENT_DIR, '.gdrive_snapshot.json')

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


def get_base_snapshot():
    """
    직전 동기화 성공 시점의 3-Way 비교 기준 스냅샷(Base)을 로드.
    반환: { rel_path: { "mtime": float, "size": int } } 또는 None (첫 동기화)
    """
    if not os.path.exists(SNAPSHOT_STATE_FILE):
        return None
    try:
        with open(SNAPSHOT_STATE_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            if isinstance(data, dict):
                return data
    except Exception as e:
        logger.warning(f"[GDrive] Failed to load base snapshot: {e}")
    return None


def save_base_snapshot(snapshot_dict):
    """동기화 완료 후 최종 합의된 파일 목록과 mtime을 스냅샷으로 영속 저장."""
    try:
        with open(SNAPSHOT_STATE_FILE, 'w', encoding='utf-8') as f:
            json.dump(snapshot_dict, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"[GDrive] Failed to save base snapshot: {e}")


def trash_local_workflow(rel_path):
    """
    로컬 워크플로우를 영구 삭제하지 않고 `_deleted_workflows/` 안전 보관함으로 이동.
    (실수로 인한 유실 0% 보장 — 마우스로 즉시 복원 가능)
    """
    try:
        full_path = _resolve_local_path(rel_path)
        if not os.path.exists(full_path):
            return True
        root = _resolve_workflows_root()
        sub_rel = rel_path[len(WORKFLOWS_NS):]  # workflows/ 이후 상대경로
        trash_dir = os.path.join(root, "_deleted_workflows", os.path.dirname(sub_rel))
        os.makedirs(trash_dir, exist_ok=True)
        trash_target = os.path.join(trash_dir, os.path.basename(sub_rel))
        # 만약 휴지통에 이미 동명 파일이 있다면 덮어쓰거나 타임스탬프 부여
        if os.path.exists(trash_target):
            base_n, ext = os.path.splitext(os.path.basename(sub_rel))
            trash_target = os.path.join(trash_dir, f"{base_n}_{int(time.time())}{ext}")
        import shutil
        shutil.move(full_path, trash_target)
        logger.info(f"[GDrive] Local workflow safely moved to trash: {rel_path} -> {trash_target}")
        return True
    except Exception as e:
        logger.error(f"[GDrive] Failed to move local workflow to trash ({rel_path}): {e}")
        return False


def trash_remote_file(service, file_id, file_name=""):
    """
    구글 드라이브 파일을 영구 파기(delete)하지 않고 '구글 드라이브 휴지통'으로 안전 이동.
    (구글 드라이브 휴지통에서 30일간 언제든 복원 가능)
    """
    try:
        service.files().update(fileId=file_id, body={'trashed': True}).execute()
        logger.info(f"[GDrive] Remote file safely moved to Drive trash: {file_name} (ID: {file_id})")
        return True
    except Exception as e:
        logger.error(f"[GDrive] Failed to move remote file to trash ({file_name}): {e}")
        return False


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


_SESSION_ROOT_ID = None
_SESSION_SUBFOLDER_CACHE = {}


def _get_or_create_remote_folder(service, folder_name, parent_id=None):
    """
    Drive 대상 폴더 ID를 조회하거나 없으면 생성.
    - 루트 폴더(parent_id is None)는 세션 캐싱하여 중복 API 호출 0회로 최적화
    """
    global _SESSION_ROOT_ID
    if parent_id is None and folder_name == FOLDER_NAME and _SESSION_ROOT_ID:
        return _SESSION_ROOT_ID

    escaped = folder_name.replace("\\", "\\\\").replace("'", "\\'")
    query = (f"name = '{escaped}' and "
             f"mimeType = 'application/vnd.google-apps.folder' and trashed = false")
    if parent_id:
        query += f" and '{parent_id}' in parents"
    results = service.files().list(q=query, fields="files(id, name)").execute()
    items = results.get('files', [])
    if items:
        f_id = items[0]['id']
        if parent_id is None and folder_name == FOLDER_NAME:
            _SESSION_ROOT_ID = f_id
        return f_id

    file_metadata = {
        'name': folder_name,
        'mimeType': 'application/vnd.google-apps.folder'
    }
    if parent_id:
        file_metadata['parents'] = [parent_id]
    folder = service.files().create(body=file_metadata, fields='id').execute()
    new_id = folder.get('id')
    if parent_id is None and folder_name == FOLDER_NAME:
        _SESSION_ROOT_ID = new_id
    return new_id


def _get_subfolder_ids(service, root_id):
    """
    루트 폴더 아래 하위폴더 5종(Presets/Favorites/GeminiChat/SystemPrompts/Workflows)
    의 ID 를 조회·생성해 {폴더명: ID} 로 반환.
    - 세션 메모리에 캐싱하여 5회 순차 API 호출(5초)을 0초로 단축!
    """
    global _SESSION_SUBFOLDER_CACHE
    all_names = list(REMOTE_FOLDER_BY_REL.values()) + [REMOTE_WORKFLOWS_FOLDER]
    if _SESSION_SUBFOLDER_CACHE and all(k in _SESSION_SUBFOLDER_CACHE for k in all_names):
        return dict(_SESSION_SUBFOLDER_CACHE)

    ids = {}
    for name in all_names:
        ids[name] = _get_or_create_remote_folder(service, name, parent_id=root_id)
    _SESSION_SUBFOLDER_CACHE = ids
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


def _list_entries_in_parents_batch(service, parent_ids):
    """
    여러 parent_id 안의 자식 항목(파일/폴더)을 OR 조건으로 단 1~2번의 Drive API 호출로 일괄 조회한다.
    - 기존: 폴더마다 1번씩 순차 호출 (15개 폴더 = 15번 네트워크 통신, 15초 소요)
    - 개선: OR 쿼리로 20개 폴더를 단 1번 호출에 일괄 조회 (1~1.5초 소요)
    반환: { parent_id: [ {"name", "id", "is_folder", "modifiedTime", "size", "folder_id"} ] }
    """
    if not parent_ids:
        return {}

    result = {pid: [] for pid in parent_ids}
    batch_size = 20
    for i in range(0, len(parent_ids), batch_size):
        chunk = parent_ids[i:i + batch_size]
        parent_filter = " or ".join([f"'{pid}' in parents" for pid in chunk])
        query = f"({parent_filter}) and trashed = false"

        page_token = None
        while True:
            params = {
                "q": query,
                "fields": "nextPageToken, files(id, name, mimeType, modifiedTime, size, parents)",
                "pageSize": 1000,
            }
            if page_token:
                params["pageToken"] = page_token
            res = service.files().list(**params).execute()
            for item in res.get("files", []):
                name = item.get("name")
                if not name:
                    continue
                mt = _parse_drive_time(item.get("modifiedTime"))
                try:
                    size = int(item.get("size") or 0)
                except (TypeError, ValueError):
                    size = 0
                parents = item.get("parents", [])
                p_id = parents[0] if parents else None
                entry = {
                    "name": name,
                    "id": item.get("id"),
                    "is_folder": item.get("mimeType") == "application/vnd.google-apps.folder",
                    "modifiedTime": mt,
                    "size": size,
                    "folder_id": p_id,
                }
                if p_id in result:
                    result[p_id].append(entry)
                else:
                    for cid in chunk:
                        if cid in parents:
                            result.setdefault(cid, []).append(entry)
                            break
            page_token = res.get("nextPageToken")
            if not page_token:
                break
    return result


def _list_workflows_recursive_fast(service, root_id, legacy_files=None):
    """
    Workflows 폴더를 BFS 배치 쿼리로 탐색하여 재귀 깊이당 단 1회의 Drive API 호출로 초고속 열거한다.
    - 기존 재귀 stack: 폴더마다 개별 호출 (10~15번 왕복)
    - BFS 배치: 깊이 레벨당 단 1번 호출 (보통 1~2번 왕복으로 전체 트리 복원)
    """
    files_map = {}
    current_level = [(root_id, "")]

    while current_level:
        parent_ids = [fid for fid, _ in current_level]
        batch_results = _list_entries_in_parents_batch(service, parent_ids)

        next_level = []
        for fid, rdir in current_level:
            entries = batch_results.get(fid, [])
            for entry in entries:
                name, item_id = entry["name"], entry["id"]
                if entry["is_folder"]:
                    sub_rel = f"{rdir}/{name}" if rdir else name
                    next_level.append((item_id, sub_rel))
                    continue
                if not rdir:
                    if name.startswith("workflows___"):
                        key = name
                        if legacy_files is not None:
                            legacy_files.append({
                                "key": key, "id": item_id, "name": name, "folder_id": fid,
                                "modifiedTime": entry["modifiedTime"],
                            })
                    else:
                        key = (WORKFLOWS_NS + name).replace("/", "___")
                else:
                    key = (WORKFLOWS_NS + rdir + "/" + name).replace("/", "___")
                files_map[key] = {
                    "id": item_id,
                    "name": name,
                    "modifiedTime": entry["modifiedTime"],
                    "size": entry["size"],
                    "folder_id": fid,
                }
        current_level = next_level

    return files_map


def _list_remote_files(service, subfolder_ids):
    """
    하위폴더 5종을 배치 쿼리로 일괄 조회해 초고속으로 병합한다.
    - config 4종: 단 1회의 OR 쿼리로 일괄 조회 (4회 -> 1회)
    - Workflows: BFS 레벨별 배치 쿼리로 일괄 조회 (10~15회 -> 1~2회)
    총 통신 횟수: 기존 15~20회 -> 2~3회로 85% 이상 단축 (15초 -> 1.5초)
    """
    files_map = {}
    legacy_workflows = []

    # 1. Config 폴더 4종 일괄 조회 (단 1회 API 호출!)
    config_folder_ids = {
        folder_id: folder_name
        for folder_name, folder_id in subfolder_ids.items()
        if folder_name != REMOTE_WORKFLOWS_FOLDER
    }

    if config_folder_ids:
        batch_configs = _list_entries_in_parents_batch(service, list(config_folder_ids.keys()))
        for folder_id, entries in batch_configs.items():
            for entry in entries:
                if entry["is_folder"]:
                    continue
                stored_name = entry["name"]
                remote_key = _remote_key_from_stored(stored_name)
                files_map[remote_key] = {
                    "id": entry["id"],
                    "name": stored_name,
                    "modifiedTime": entry["modifiedTime"],
                    "size": entry["size"],
                    "folder_id": folder_id,
                }

    # 2. Workflows 폴더 BFS 배치 조회 (깊이당 1회 API 호출!)
    wf_root_id = subfolder_ids.get(REMOTE_WORKFLOWS_FOLDER)
    if wf_root_id:
        files_map.update(
            _list_workflows_recursive_fast(service, wf_root_id, legacy_files=legacy_workflows)
        )

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
    # 비원자적 쓰기 방지: tmp에 쓴 뒤 os.replace로 교체 (중단 시 잘린 파일 방지).
    tmp_path = full_path + ".tmp"
    with open(tmp_path, 'wb') as f:
        f.write(payload)
    os.replace(tmp_path, full_path)

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
        trashed_local_count = 0
        trashed_remote_count = 0

        # --- 3-Way Snapshot 판정 (Smart Merge & Ghost/Zombie 방지) ---
        base_snapshot = get_base_snapshot()

        to_upload = []
        to_download = []
        to_trash_remote = []
        to_trash_local = []

        # 원격 파일 맵 변환: remote_key('___' 인코딩) -> rel_path('/')
        remote_by_rel = {}
        for r_name, r_meta in remote_files.items():
            r_rel = r_name.replace('___', '/')
            try:
                _resolve_local_path(r_rel)
                remote_by_rel[r_rel] = r_meta
            except ValueError:
                continue

        all_keys = set(local_manifest.keys()) | set(remote_by_rel.keys())
        if base_snapshot is not None:
            all_keys |= set(base_snapshot.keys())

        for rel_path in all_keys:
            is_workflow = rel_path.startswith(WORKFLOWS_NS)
            in_local = rel_path in local_manifest
            in_remote = rel_path in remote_by_rel
            in_base = bool(base_snapshot and (rel_path in base_snapshot))

            l_meta = local_manifest.get(rel_path)
            r_meta = remote_by_rel.get(rel_path)
            b_meta = base_snapshot.get(rel_path) if base_snapshot else None

            # [CASE 1: 양쪽 모두 존재]
            if in_local and in_remote:
                r_mtime = r_meta.get("modifiedTime", 0)
                l_mtime = l_meta["mtime"]
                # 1초 오차 허용
                if l_mtime > r_mtime + 1:
                    to_upload.append(rel_path)
                elif r_mtime > l_mtime + 1:
                    to_download.append(rel_path)
                # 동일하면 no-op

            # [CASE 2: 로컬에만 있음]
            elif in_local and not in_remote:
                if is_workflow and in_base:
                    # 직전엔 있었는데 원격에서 사라짐 -> 원격(타 PC)에서 삭제된 것으로 판정
                    to_trash_local.append(rel_path)
                else:
                    # 직전에 없었거나 Base 없음 -> 로컬에서 새로 만든 파일 -> 원격 업로드
                    to_upload.append(rel_path)

            # [CASE 3: 원격에만 있음]
            elif in_remote and not in_local:
                if is_workflow and in_base:
                    # 직전엔 있었는데 로컬에서 사라짐 -> 현재 PC에서 사용자가 삭제/이동한 것으로 판정
                    to_trash_remote.append((rel_path, r_meta.get("id"), r_meta.get("name", "")))
                else:
                    # 직전에 없었거나 Base 없음 -> 원격(타 PC)에서 새로 만든 파일 -> 로컬 다운로드
                    to_download.append(rel_path)

            # [CASE 4: 양쪽 다 없음 (Base에만 잔재)]
            # 둘 다 이미 삭제된 상태 -> Base에서 자연 소멸 (아무 조치 불필요)

        total_actions = len(to_upload) + len(to_download) + len(to_trash_local) + len(to_trash_remote)
        logger.info(
            f"[GDrive Smart Sync Plan] Upload: {len(to_upload)}, Download: {len(to_download)}, "
            f"Trash Local: {len(to_trash_local)}, Trash Remote: {len(to_trash_remote)}"
        )

        # --- 1) 안전 휴지통 처리: 원격 및 로컬 ---
        for rel_path, f_id, f_name in to_trash_remote:
            if _CANCEL_EVENT.is_set():
                cancelled = True
                break
            if f_id and trash_remote_file(service, f_id, f_name):
                trashed_remote_count += 1
                logger.info(f"[GDrive] Remote trash: {rel_path}")

        for rel_path in to_trash_local:
            if _CANCEL_EVENT.is_set():
                cancelled = True
                break
            if trash_local_workflow(rel_path):
                trashed_local_count += 1
                logger.info(f"[GDrive] Local trash: {rel_path}")

        # --- 2) 로컬 기준: 업로드 ---
        total_upload = len(to_upload)
        uploaded = set()
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
            target_folder_name = _target_folder_name(rel_path)
            if target_folder_name is None:
                continue
            if target_folder_name == REMOTE_WORKFLOWS_FOLDER:
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
            _notify_sync_state(True, phase="uploading", done=uploaded_count,
                              total=total_upload, current=rel_path)

        # --- 3) 원격 기준: 다운로드 ---
        total_download = len(to_download)
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

        # 3-Way Snapshot 갱신: 동기화가 정상 완료되었거나 일부라도 반영된 경우,
        # 최신 로컬 상태를 기준으로 Base 스냅샷을 캡처해 다음 동기화의 기준으로 삼는다.
        try:
            latest_local = build_local_manifest()
            save_base_snapshot(latest_local)
            logger.info(f"[GDrive] Base snapshot updated with {len(latest_local)} files.")
        except Exception as e:
            logger.warning(f"[GDrive] Failed to update base snapshot: {e}")

        if cancelled:
            logger.info(
                f"[GDrive] sync cancelled by user (uploaded: {uploaded_count}, downloaded: {downloaded_count}, "
                f"trash_local: {trashed_local_count}, trash_remote: {trashed_remote_count})"
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
        msg_parts = [f"uploaded: {uploaded_count}", f"downloaded: {downloaded_count}"]
        if trashed_local_count > 0:
            msg_parts.append(f"local trash: {trashed_local_count}")
        if trashed_remote_count > 0:
            msg_parts.append(f"remote trash: {trashed_remote_count}")

        return {
            "status": "success",
            "message": f"Sync completed ({', '.join(msg_parts)})",
            "uploaded": uploaded_count,
            "downloaded": downloaded_count,
            "trashed_local": trashed_local_count,
            "trashed_remote": trashed_remote_count,
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


def get_gdrive_settings() -> dict:
    """
    Cloud Sync 전용 설정(.gdrive_settings.json)을 로드한다.
    - 보안상 config.json(Gemini API 키 등)과 완전히 분리.
    - 기본값(최초 사용자): 전부 OFF — cloud_sync_enabled=False, startup_autosync=False,
      realtime_autosync=False. 사용자가 한 번이라도 토글하면 .gdrive_settings.json 에
      저장된 값이 우선하여 이후 업데이트와 무관하게 유지된다.
    """
    defaults = {
        "cloud_sync_enabled": False,
        "startup_autosync": False,
        "realtime_autosync": False,
    }
    if not os.path.exists(GDRIVE_SETTINGS_PATH):
        return defaults
    try:
        with open(GDRIVE_SETTINGS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, dict):
                defaults.update(data)
    except Exception as e:
        logger.warning(f"[GDrive] Failed to read {GDRIVE_SETTINGS_PATH}: {e}")
    return defaults


def set_gdrive_settings(new_settings: dict) -> dict:
    """
    Cloud Sync 전용 설정을 갱신 및 파일에 저장한다.
    """
    current = get_gdrive_settings()
    if isinstance(new_settings, dict):
        current.update(new_settings)
    try:
        with open(GDRIVE_SETTINGS_PATH, "w", encoding="utf-8") as f:
            json.dump(current, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.error(f"[GDrive] Failed to save {GDRIVE_SETTINGS_PATH}: {e}")
    return current


def is_startup_autosync_enabled() -> bool:
    """시작 시 자동 동기화 활성화 여부 확인 (마스터 ON 및 startup_autosync ON)."""
    settings = get_gdrive_settings()
    return bool(settings.get("cloud_sync_enabled", False)) and bool(settings.get("startup_autosync", False))


def normalize_sync_rel_path(p: str) -> str:
    """주어진 경로나 파일명을 동기화 표준 상대경로(.configs/... 또는 workflows/...)로 정규화."""
    if not p:
        return ""
    p = p.replace("\\", "/").strip().lstrip("/")
    if p in SYNC_TARGET_FILES:
        return f"{_CONFIG_NS}{p}"
    if p.startswith(_CONFIG_NS):
        return p
    try:
        wf_root = _resolve_workflows_root().replace("\\", "/").rstrip("/")
        if p.lower().startswith(wf_root.lower()):
            sub = p[len(wf_root):].lstrip("/")
            return f"{WORKFLOWS_NS}{sub}"
    except Exception:
        pass
    if p.startswith(WORKFLOWS_NS):
        return p
    return f"{WORKFLOWS_NS}{p}"


def _perform_pinpoint_sync_blocking(details: dict) -> bool:
    """
    실시간 단일 파일 저장/삭제/이동(Pinpoint Sync)을 수행한다.
    - 전체 드라이브 스캔(Full Scan)을 완전히 생략하여 1~2초 이내 초고속 완료
    - 이동(Move) 시 Drive native move API(부모 폴더 변경)를 사용하여 재업로드 0초
    - 3-Way Snapshot(.gdrive_snapshot.json) 동시 갱신으로 좀비 부활 원천 차단
    - 실패 시 False 반환 -> 호출측에서 _perform_sync_blocking()으로 안전 폴백
    """
    if not _SYNC_GUARD.acquire(blocking=False):
        logger.info("[GDrive Pinpoint] Sync already in progress, skipping.")
        return False

    service, msg = get_drive_service()
    if not service:
        _SYNC_GUARD.release()
        return False

    _notify_sync_state(True)
    try:
        action = details.get("action")
        root_id = _get_or_create_remote_folder(service, FOLDER_NAME)
        subfolder_ids = _get_subfolder_ids(service, root_id)

        # -------------------------------------------------------------
        # 1. SAVE: 신규 생성 또는 업데이트
        # -------------------------------------------------------------
        if action == "save":
            raw_path = details.get("path")
            if not raw_path:
                return True
            rel_path = normalize_sync_rel_path(raw_path)
            try:
                full_path = _resolve_local_path(rel_path)
            except Exception:
                return True
            if not os.path.exists(full_path):
                logger.debug(f"[GDrive Pinpoint Save] Local file does not exist (skip): {full_path}")
                return True

            local_meta = {
                "size": os.path.getsize(full_path),
                "mtime": os.path.getmtime(full_path)
            }
            target_folder_name = _target_folder_name(rel_path)
            if not target_folder_name:
                return False

            if target_folder_name == REMOTE_WORKFLOWS_FOLDER:
                subdir = os.path.dirname(rel_path[len(WORKFLOWS_NS):])
                target_folder_id = _ensure_workflow_folder(
                    service, subfolder_ids[REMOTE_WORKFLOWS_FOLDER],
                    subdir.replace("\\", "/")
                )
            else:
                target_folder_id = subfolder_ids[target_folder_name]

            remote_name = _stored_remote_name(rel_path)
            existing_id = _find_remote_file_in_folder(service, target_folder_id, remote_name)

            _upload_single_file(service, target_folder_id, rel_path, local_meta, existing_id=existing_id)
            logger.info(f"[GDrive Pinpoint Save] Uploaded: {rel_path} (ID: {existing_id or 'new'})")

            # 3-Way Snapshot 갱신 (좀비 방지)
            snapshot = get_base_snapshot() or {}
            snapshot[rel_path] = {
                "size": local_meta["size"],
                "mtime": os.path.getmtime(full_path)
            }
            save_base_snapshot(snapshot)
            _save_last_sync_state(1, 0)
            return True

        # -------------------------------------------------------------
        # 2. DELETE: 로컬 삭제 -> 원격 안전 휴지통 이동
        # -------------------------------------------------------------
        elif action == "delete":
            raw_path = details.get("path")
            if not raw_path:
                return False
            rel_path = normalize_sync_rel_path(raw_path)

            target_folder_name = _target_folder_name(rel_path)
            if not target_folder_name:
                return False

            if target_folder_name == REMOTE_WORKFLOWS_FOLDER:
                subdir = os.path.dirname(rel_path[len(WORKFLOWS_NS):])
                folder_id = _ensure_workflow_folder(
                    service, subfolder_ids[REMOTE_WORKFLOWS_FOLDER],
                    subdir.replace("\\", "/")
                )
            else:
                folder_id = subfolder_ids[target_folder_name]

            remote_name = _stored_remote_name(rel_path)
            file_id = _find_remote_file_in_folder(service, folder_id, remote_name)
            if file_id:
                trash_remote_file(service, file_id, remote_name)
                logger.info(f"[GDrive Pinpoint Delete] Trashed remote file: {rel_path} (ID: {file_id})")

            # 3-Way Snapshot 에서 제거 (좀비 방지)
            snapshot = get_base_snapshot()
            if snapshot and rel_path in snapshot:
                del snapshot[rel_path]
                save_base_snapshot(snapshot)
            _save_last_sync_state(0, 0)
            return True

        # -------------------------------------------------------------
        # 3. MOVE: 폴더 이동 / 이름 변경 (Drive API Native Move)
        # -------------------------------------------------------------
        elif action == "move":
            source_raw = details.get("source")
            target_raw = details.get("target")
            if not source_raw or not target_raw:
                return False

            source_rel = normalize_sync_rel_path(source_raw)
            target_rel = normalize_sync_rel_path(target_raw)

            # 구 위치 정보
            old_subdir = os.path.dirname(source_rel[len(WORKFLOWS_NS):])
            old_name = _stored_remote_name(source_rel)
            old_folder_id = _ensure_workflow_folder(
                service, subfolder_ids[REMOTE_WORKFLOWS_FOLDER],
                old_subdir.replace("\\", "/")
            )

            # 신 위치 정보
            new_subdir = os.path.dirname(target_rel[len(WORKFLOWS_NS):])
            new_name = _stored_remote_name(target_rel)
            new_folder_id = _ensure_workflow_folder(
                service, subfolder_ids[REMOTE_WORKFLOWS_FOLDER],
                new_subdir.replace("\\", "/")
            )

            file_id = _find_remote_file_in_folder(service, old_folder_id, old_name)
            target_full = _resolve_local_path(target_rel)

            if file_id:
                # Drive Native Move: 부모 폴더 변경 + 이름 변경 (데이터 재업로드 0초!)
                body = {}
                if old_name != new_name:
                    body['name'] = new_name
                kwargs = {}
                if old_folder_id != new_folder_id:
                    kwargs['addParents'] = new_folder_id
                    kwargs['removeParents'] = old_folder_id

                resp = service.files().update(
                    fileId=file_id,
                    body=body or None,
                    fields='id, modifiedTime, parents',
                    **kwargs
                ).execute()

                if os.path.exists(target_full):
                    _pin_local_mtime(target_full, resp.get("modifiedTime"))

                logger.info(
                    f"[GDrive Pinpoint Move] Native Drive move: '{source_rel}' -> '{target_rel}' "
                    f"(ID: {file_id}, from: {old_folder_id} -> to: {new_folder_id})"
                )
            else:
                # 원격에 구 파일이 없었다면 신규 업로드
                if os.path.exists(target_full):
                    local_meta = {
                        "size": os.path.getsize(target_full),
                        "mtime": os.path.getmtime(target_full)
                    }
                    _upload_single_file(service, new_folder_id, target_rel, local_meta)
                    logger.info(f"[GDrive Pinpoint Move] Uploaded to target (not found in source): {target_rel}")

            # 3-Way Snapshot 갱신: 구 경로 제거 + 신 경로 등록 (좀비 방지)
            snapshot = get_base_snapshot() or {}
            if source_rel in snapshot:
                del snapshot[source_rel]
            if os.path.exists(target_full):
                snapshot[target_rel] = {
                    "size": os.path.getsize(target_full),
                    "mtime": os.path.getmtime(target_full)
                }
            save_base_snapshot(snapshot)
            _save_last_sync_state(1, 0)
            return True

        # -------------------------------------------------------------
        # 4. MULTI_MOVE: 다중 파일 이동
        # -------------------------------------------------------------
        elif action == "multi_move":
            items = details.get("items", [])
            if not items:
                return False
            snapshot = get_base_snapshot() or {}
            success_count = 0
            for itm in items:
                s_rel = normalize_sync_rel_path(itm.get("source") or itm.get("path") or "")
                t_rel = normalize_sync_rel_path(itm.get("target") or itm.get("newPath") or "")
                if not s_rel or not t_rel:
                    continue
                old_sub = os.path.dirname(s_rel[len(WORKFLOWS_NS):])
                old_nm = _stored_remote_name(s_rel)
                old_fid = _ensure_workflow_folder(service, subfolder_ids[REMOTE_WORKFLOWS_FOLDER], old_sub.replace("\\", "/"))
                new_sub = os.path.dirname(t_rel[len(WORKFLOWS_NS):])
                new_nm = _stored_remote_name(t_rel)
                new_fid = _ensure_workflow_folder(service, subfolder_ids[REMOTE_WORKFLOWS_FOLDER], new_sub.replace("\\", "/"))
                f_id = _find_remote_file_in_folder(service, old_fid, old_nm)
                t_full = _resolve_local_path(t_rel)
                if f_id:
                    body = {'name': new_nm} if old_nm != new_nm else None
                    kw = {}
                    if old_fid != new_fid:
                        kw['addParents'] = new_fid
                        kw['removeParents'] = old_fid
                    resp = service.files().update(fileId=f_id, body=body, fields='id, modifiedTime', **kw).execute()
                    if os.path.exists(t_full):
                        _pin_local_mtime(t_full, resp.get("modifiedTime"))
                elif os.path.exists(t_full):
                    l_meta = {"size": os.path.getsize(t_full), "mtime": os.path.getmtime(t_full)}
                    _upload_single_file(service, new_fid, t_rel, l_meta)
                if s_rel in snapshot:
                    del snapshot[s_rel]
                if os.path.exists(t_full):
                    snapshot[t_rel] = {"size": os.path.getsize(t_full), "mtime": os.path.getmtime(t_full)}
                success_count += 1
            save_base_snapshot(snapshot)
            _save_last_sync_state(success_count, 0)
            logger.info(f"[GDrive Pinpoint Multi-Move] Successfully moved {success_count} files via Native Move.")
            return True

        return False

    except Exception as e:
        logger.warning(f"[GDrive Pinpoint] Error ({e}), will fallback to full sync.")
        return False
    finally:
        _SYNC_GUARD.release()
        _notify_sync_state(False)


def trigger_realtime_sync(details: dict = None) -> dict:
    """
    실시간 변경 감지 시 백그라운드 동기화를 즉시 트리거한다 (Zero-Delay + Tail-Dedup + Pinpoint).
    - details(action, path 등)가 주어지면 초고속 Pinpoint Sync(1~2초) 실행
    - details가 없거나 실패 시 전체 Snapshot Full Sync로 안전 폴백
    """
    settings = get_gdrive_settings()
    if not bool(settings.get("cloud_sync_enabled", False)):
        return {"status": "disabled", "reason": "master_off"}
    if not bool(settings.get("realtime_autosync", False)):
        return {"status": "disabled", "reason": "realtime_off"}

    if not GDRIVE_LIBS_AVAILABLE or not os.path.exists(TOKEN_PATH):
        return {"status": "disabled", "reason": "not_authenticated"}

    acquired = _SYNC_GUARD.acquire(blocking=False)
    if not acquired:
        return {"status": "busy", "reason": "sync_in_progress"}
    # TOCTOU 방지: 스레드 생성까지 가드를 들고 있다가, 생성 직후 놓는다.
    # 내부 수행부(_perform_*_blocking)가 진입 시 같은 가드를 acquire하므로,
    # 생성~수행부 진입 사이 찰나의 중복 호출이 가드에 걸려 busy로 걸러진다.

    def _worker():
        try:
            logger.info(f"[GDrive] Realtime sync triggered (action: {details.get('action') if details else 'full'})...")
            if details and isinstance(details, dict) and details.get("action"):
                success = _perform_pinpoint_sync_blocking(details)
                if not success:
                    logger.info("[GDrive] Pinpoint sync requested fallback to full sync.")
                    _perform_sync_blocking()
            else:
                _perform_sync_blocking()
            logger.info("[GDrive] Realtime sync completed.")
        except Exception as e:
            logger.error(f"[GDrive] Realtime sync error: {e}")

    try:
        threading.Thread(target=_worker, name="GDriveRealtimeSync", daemon=True).start()
    finally:
        try:
            _SYNC_GUARD.release()
        except RuntimeError:
            pass
    return {"status": "queued", "message": "Realtime sync started in background"}


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
    _apply_path_prefill(details)
    return details



def _resolve_workflows_root_safe():
    try:
        return _resolve_workflows_root()
    except Exception:
        return ""


def _build_path_prefill():
    m = {}
    for rel_path in get_target_rel_paths():
        name = os.path.basename(rel_path)
        try:
            lp = _resolve_local_path(rel_path)
        except ValueError:
            lp = ""
        m[name] = {
            "local_path": lp,
            "remote_name": rel_path.replace("/", "___"),
        }
    wf_root = _resolve_workflows_root_safe()
    m["workflows"] = {
        "local_path": wf_root,
        "remote_name": "Workflows/",
    }
    return m

def _apply_path_prefill(details):
    try:
        prefill = _build_path_prefill()
    except Exception:
        return
    for entry in details:
        pp = prefill.get(entry.get("name"), {})
        if pp.get("local_path"):
            entry["local_path"] = pp["local_path"]
        if pp.get("remote_name"):
            entry["remote_name"] = pp["remote_name"]


def get_remote_counts_snapshot(target: str = None):
    """
    팝업 열 때 호출 — 원격(Drive) 개수 + 추적 경로 스냅샷.
    - target 이 주어지면 해당 단일 항목만 초고속 점진적(Progressive) 반환 (0.2~1.5초)
    - target 이 None 이면 전체 항목 반환
    - mtime 일치 최적화: 로컬과 원격 mtime 이 같으면 다운로드 없이 로컬 내용 개수로 즉시 확정 (0초)
    """
    service, msg = get_drive_service()
    if service is None:
        return {"success": False, "error": msg, "targets": []}

    try:
        root_id = _get_or_create_remote_folder(service, FOLDER_NAME)
        subfolder_ids = _get_subfolder_ids(service, root_id)
    except Exception as e:
        logger.warning(f"[GDrive] get_remote_counts_snapshot folder error: {e}")
        return {"success": False, "error": str(e), "targets": []}

    def _parse_content_count_from_json(fname, data):
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
            up = data.get("user_prompts")
            gp = data.get("gemini_prompts")
            return (len(up) if isinstance(up, list) else 0) + (len(gp) if isinstance(gp, list) else 0)
        if fname == "presets_data.json":
            if not isinstance(data, dict):
                return None
            total = 0
            for node_val in data.values():
                if isinstance(node_val, (dict, list)):
                    total += len(node_val)
            return total
        return None

    def _count_remote_config_by_id(file_id, fname):
        try:
            req = service.files().get_media(fileId=file_id)
            fh = io.BytesIO()
            downloader = MediaIoBaseDownload(fh, req)
            done = False
            while not done:
                _, done = downloader.next_chunk()
            fh.seek(0)
            data = json.loads(fh.read().decode("utf-8"))
            return _parse_content_count_from_json(fname, data)
        except Exception as e:
            logger.debug(f"[GDrive] remote count by id failed ({fname}): {e}")
            return None

    # -----------------------------------------------------------------
    # A. 단일 TARGET 요청 (점진적 로딩 모드)
    # -----------------------------------------------------------------
    if target:
        if target in SYNC_TARGET_FILES:
            rel_path = f".configs/{target}"
            folder_name = REMOTE_FOLDER_BY_REL.get(rel_path)
            subfolder_id = subfolder_ids.get(folder_name)
            try:
                local_path = _resolve_local_path(rel_path)
            except Exception:
                local_path = ""
            local_count = _count_config_items(target, local_path) if (local_path and os.path.exists(local_path)) else None

            remote_exists = False
            remote_count = None
            if subfolder_id:
                escaped = target.replace("\\", "\\\\").replace("'", "\\'")
                res = service.files().list(
                    q=f"name = '{escaped}' and '{subfolder_id}' in parents and trashed = false",
                    fields="files(id, name, modifiedTime, size)"
                ).execute()
                items = res.get("files", [])
                if items:
                    item = items[0]
                    remote_exists = True
                    remote_mtime = _parse_drive_time(item.get("modifiedTime"))
                    local_mtime = os.path.getmtime(local_path) if (local_path and os.path.exists(local_path)) else 0.0
                    # mtime 일치 최적화: 내용 다운로드 생략 (0ms)
                    if local_path and os.path.exists(local_path) and abs(local_mtime - remote_mtime) <= 1.0:
                        remote_count = local_count
                    else:
                        remote_count = _count_remote_config_by_id(item["id"], target)

            t = {
                "name": target,
                "local_path": local_path,
                "remote_name": rel_path.replace("/", "___"),
                "local_count": local_count,
                "remote_count": remote_count,
                "remote_exists": remote_exists,
                "kind": "config",
            }
            _apply_path_prefill([t])
            return {"success": True, "targets": [t]}

        elif target == "workflows":
            try:
                wf_root = _resolve_workflows_root()
            except Exception:
                wf_root = ""
            wf_local_count = sum(1 for _ in _iter_workflow_rel_paths())
            wf_remote_count = 0
            try:
                # Workflows 폴더만 타깃 배치 조회
                wf_folder_id = subfolder_ids.get(REMOTE_WORKFLOWS_FOLDER)
                remote_files, _ = _list_remote_files(service, {REMOTE_WORKFLOWS_FOLDER: wf_folder_id})
                wf_remote_count = sum(1 for rn in remote_files if rn.startswith("workflows___"))
            except Exception as e:
                logger.warning(f"[GDrive] workflows remote count failed: {e}")

            t = {
                "name": "workflows",
                "local_path": wf_root,
                "remote_name": "Workflows/ (로컬 디렉터리 구조를 실제 중첩 폴더로 저장)",
                "local_count": wf_local_count,
                "remote_count": wf_remote_count,
                "remote_exists": wf_remote_count > 0,
                "kind": "workflows",
            }
            _apply_path_prefill([t])
            return {"success": True, "targets": [t]}

    # -----------------------------------------------------------------
    # B. 전체 TARGET 요청 (기존 모드 호환 + mtime 최적화)
    # -----------------------------------------------------------------
    targets = []
    try:
        wf_root = _resolve_workflows_root()
    except Exception:
        wf_root = ""
    for rel_path in get_target_rel_paths():
        name = os.path.basename(rel_path)
        try:
            local_path = _resolve_local_path(rel_path)
        except Exception:
            local_path = ""
        local_count = _count_config_items(name, local_path) if (local_path and os.path.exists(local_path)) else None
        targets.append({
            "name": name,
            "local_path": local_path,
            "remote_name": rel_path.replace("/", "___"),
            "local_count": local_count,
            "remote_count": None,
            "remote_exists": False,
            "kind": "config",
        })

    wf_local_count = sum(1 for _ in _iter_workflow_rel_paths())
    targets.append({
        "name": "workflows",
        "local_path": wf_root,
        "remote_name": "Workflows/ (로컬 디렉터리 구조를 실제 중첩 폴더로 저장)",
        "local_count": wf_local_count,
        "remote_count": None,
        "remote_exists": False,
        "kind": "workflows",
    })

    try:
        remote_files, _ = _list_remote_files(service, subfolder_ids)
    except Exception as e:
        logger.warning(f"[GDrive] remote files query failed: {e}")
        return {"success": False, "error": str(e), "targets": targets}

    wf_remote_count = 0
    for t in targets:
        if t["kind"] == "config":
            rn = t["remote_name"]
            meta = remote_files.get(rn)
            if meta and meta.get("id"):
                t["remote_exists"] = True
                local_path = t["local_path"]
                local_mtime = os.path.getmtime(local_path) if (local_path and os.path.exists(local_path)) else 0.0
                remote_mtime = meta.get("modifiedTime", 0.0)
                if local_path and os.path.exists(local_path) and abs(local_mtime - remote_mtime) <= 1.0:
                    t["remote_count"] = t["local_count"]
                else:
                    t["remote_count"] = _count_remote_config_by_id(meta["id"], t["name"])
        else:
            for rn in remote_files:
                if rn.startswith("workflows___"):
                    wf_remote_count += 1
            t["remote_count"] = wf_remote_count
            t["remote_exists"] = wf_remote_count > 0

    _apply_path_prefill(targets)
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
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[GDrive] open local failed ({name}): {e}")
        return {"success": False, "path": full_path, "error": str(e)}

    # 포어그라운드 집중(_bring_explorer_to_front)은 최대 ~2초 폴링 대기가 있어 응답을 지연시킨다.
    # 탐색기는 이미 떠 있으므로, 열기 동작은 즉시 성공으로 응답하고 집중은 백그라운드 데몬 스레드에서 비동기 처리한다.
    try:
        threading.Thread(
            target=_bring_explorer_to_front, args=(full_path,), daemon=True
        ).start()
    except Exception as e:  # noqa: BLE001 — 집중 실패는 열기 동작에 영향 없음.
        logger.debug(f"[GDrive] background focus scheduling failed (harmless): {e}")

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
