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
  3. 변경분만 pinpoint 업/다운 (manifest.json 의 SHA256+mtime+size Diff)
  4. Drive 파일명 충돌 방지를 위해 상대경로는 `___` 로 인코딩
  5. 중복 실행 방지 (_SYNC_LOCK)
  6. 두 네임스페이스 모두 realpath 로 루트 탈출(../) 차단

의도적 제외 대상
  - config.json          : Gemini API 키 등 시크릿 포함. Drive 업로드 금지.
  - credentials/token    : 인증 파일. 커밋·동기화·배포 전부 금지.
  - 워크플로우 출력물    : __pycache__ 등 무의미 파일은 스캔 제외.

주의 (engines_registry.json)
  GitHub 배포 기본값이지만 사용자가 UI 에서 프롬프트를 고치면 개인 데이터가 된다.
  덮어쓰기 직전 항상 `.bak` 을 남기고 경고 로그를 기록하므로, `git pull` 직후
  동기화로 프롬프트가 되돌려져도 `.bak` 에서 복구할 수 있다.
"""


import os
import io
import json
import time
import asyncio
import hashlib
import logging
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger("ComfyUI-Bada-Utils.GDrive")

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
FOLDER_NAME = 'ComfyUI_BadaUtils_Configs'
MANIFEST_FILE_NAME = 'manifest.json'

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(CURRENT_DIR)

CREDENTIALS_PATH = os.path.join(PARENT_DIR, 'credentials.json')
TOKEN_PATH = os.path.join(PARENT_DIR, 'token.json')

# 동기화 대상 파일명 (커스텀 노드 루트 기준). 워크플로우 디렉터리와 무관하게 고정.
# engines_registry.json 은 Gemini/Prompt Generator 의 사용자 시스템 프롬프트를 담는
# 파일이다. GitHub 배포 기본값이지만 사용자가 UI 에서 프롬프트를 추가·수정하면
# 개인 데이터가 되므로 동기화 대상에 포함한다. 다만 덮어쓰기 시 git 충돌로 인한
# 프롬프트 유실을 막기 위해 `_download_single_file` 에서 .bak 백업 + 로그를 남긴다.
SYNC_TARGET_FILES = [
    'presets_data.json',
    'favorites_data.json',
    'gemini_chat_history.json',
    'engines_registry.json',
]

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
    로컬 대상 파일들의 매니페스트를 생성:
    { "rel_path": { "sha256": str, "size": int, "mtime": float } }
    존재하지 않는 파일은 건너뛴다 (선택적 동기화).

    두 묶음을 합친다.
      1) `.configs/*` : 노드 루트 개인 데이터 (get_target_rel_paths)
      2) `workflows/*` : 워크플로우 폴더 재귀 스캔
    """
    manifest = {}

    for rel_path in get_target_rel_paths() + list(_iter_workflow_rel_paths()):
        full_path = _resolve_local_path(rel_path)
        if not os.path.isfile(full_path):
            continue
        try:
            stat = os.stat(full_path)
            manifest[rel_path] = {
                "sha256": calculate_sha256(full_path),
                "size": stat.st_size,
                "mtime": stat.st_mtime,
            }
        except Exception as e:
            logger.warning(f"[GDrive] stat failed {rel_path}: {e}")
    return manifest


def _get_or_create_remote_folder(service, folder_name):
    """Drive 대상 폴더 ID를 조회하거나 없으면 생성."""
    query = (f"name = '{folder_name}' and "
             f"mimeType = 'application/vnd.google-apps.folder' and trashed = false")
    results = service.files().list(q=query, fields="files(id, name)").execute()
    items = results.get('files', [])
    if items:
        return items[0]['id']

    file_metadata = {
        'name': folder_name,
        'mimeType': 'application/vnd.google-apps.folder'
    }
    folder = service.files().create(body=file_metadata, fields='id').execute()
    return folder.get('id')


def _find_remote_file_in_folder(service, folder_id, file_name):
    """특정 폴더 안의 파일 ID 조회."""
    query = f"name = '{file_name}' and '{folder_id}' in parents and trashed = false"
    results = service.files().list(q=query, fields="files(id, name)").execute()
    items = results.get('files', [])
    if items:
        return items[0]['id']
    return None


def _download_remote_manifest(service, folder_id):
    """원격 manifest.json 을 내려받아 (dict, file_id) 로 반환."""
    file_id = _find_remote_file_in_folder(service, folder_id, MANIFEST_FILE_NAME)
    if not file_id:
        return {}, None
    try:
        request = service.files().get_media(fileId=file_id)
        fh = io.BytesIO()
        downloader = MediaIoBaseDownload(fh, request)
        done = False
        while not done:
            status, done = downloader.next_chunk()
        fh.seek(0)
        content = fh.read().decode('utf-8')
        return json.loads(content), file_id
    except Exception as e:
        logger.warning(f"[GDrive] remote manifest download failed: {e}")
        return {}, file_id


def _upload_remote_manifest(service, folder_id, manifest_data, existing_file_id=None):
    """갱신된 manifest.json 을 업로드."""
    content_bytes = json.dumps(manifest_data, ensure_ascii=False, indent=2).encode('utf-8')
    fh = io.BytesIO(content_bytes)
    media = MediaIoBaseUpload(fh, mimetype='application/json', resumable=True)

    if existing_file_id:
        service.files().update(fileId=existing_file_id, media_body=media).execute()
    else:
        file_metadata = {
            'name': MANIFEST_FILE_NAME,
            'parents': [folder_id]
        }
        service.files().create(body=file_metadata, media_body=media, fields='id').execute()


def _upload_single_file(service, folder_id, rel_path, local_meta):
    """단일 파일 업로드 (신규 or 갱신)."""
    full_path = _resolve_local_path(rel_path)
    remote_name = rel_path.replace('/', '___')
    existing_id = _find_remote_file_in_folder(service, folder_id, remote_name)

    media = MediaFileUpload(full_path, mimetype='application/json', resumable=True)
    if existing_id:
        service.files().update(fileId=existing_id, media_body=media).execute()
    else:
        file_metadata = {'name': remote_name, 'parents': [folder_id]}
        service.files().create(body=file_metadata, media_body=media, fields='id').execute()
    return local_meta


def _download_single_file(service, folder_id, rel_path, remote_meta):
    """단일 파일 다운로드 (다운로드 전 기존 파일 .bak 백업)."""
    remote_name = rel_path.replace('/', '___')
    remote_file_id = _find_remote_file_in_folder(service, folder_id, remote_name)
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
                    "(If this ran right after git pull, your saved prompts may have been restored)"
                )
        except Exception:
            pass

    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, 'wb') as f:
        f.write(payload)
    return remote_meta


def _perform_sync_blocking():
    """
    실제 동기화(차단) 작업. manifest Diff 로 변경분만 업/다운로드한다.
    반환: {"status", "message", "uploaded", "downloaded", "last_sync_at"}
    """
    service, msg = get_drive_service()
    if not service:
        return {"status": "error", "message": msg, "uploaded": 0, "downloaded": 0}

    try:
        folder_id = _get_or_create_remote_folder(service, FOLDER_NAME)
        local_manifest = build_local_manifest()
        remote_manifest, remote_manifest_file_id = _download_remote_manifest(service, folder_id)

        uploaded_count = 0
        downloaded_count = 0
        updated_manifest = dict(remote_manifest)

        # --- Diff: 업로드 (로컬이 더 새롭거나 원격에 없음) ---
        for rel_path, local_meta in local_manifest.items():
            remote_meta = remote_manifest.get(rel_path)
            needs_upload = (
                not remote_meta
                or remote_meta.get("sha256") != local_meta["sha256"]
                or remote_meta.get("mtime", 0) < local_meta["mtime"]
            )
            if not needs_upload:
                continue

            updated_manifest[rel_path] = _upload_single_file(service, folder_id, rel_path, local_meta)
            uploaded_count += 1
            logger.info(f"[GDrive] upload: {rel_path}")

        # --- Diff: 다운로드 (원격이 더 새롭거나 로컬에 없음) ---
        for rel_path, remote_meta in remote_manifest.items():
            # 화이트리스트 밖 경로 방어 (구 manifest 잔재 등).
            try:
                _resolve_local_path(rel_path)
            except ValueError:
                continue

            local_meta = local_manifest.get(rel_path)
            needs_download = (
                not local_meta
                or local_meta.get("sha256") != remote_meta.get("sha256")
                or remote_meta.get("mtime", 0) > local_meta.get("mtime", 0)
            )
            if not needs_download:
                continue

            result_meta = _download_single_file(service, folder_id, rel_path, remote_meta)
            if result_meta is not None:
                updated_manifest[rel_path] = result_meta
                downloaded_count += 1
                logger.info(f"[GDrive] download: {rel_path}")

        # 원격 manifest 갱신
        _upload_remote_manifest(service, folder_id, updated_manifest, remote_manifest_file_id)

        # 로컬 캐시 manifest 저장 (노드 루트에 숨김 파일).
        try:
            with open(LOCAL_MANIFEST_CACHE, 'w', encoding='utf-8') as f:
                json.dump(updated_manifest, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

        # 마지막 동기화 결과 영속 저장 → 설정창 status API 가 읽어 표시.
        _save_last_sync_state(uploaded_count, downloaded_count)

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


async def sync_gdrive_async():
    """넌블로킹 동기화 래퍼. 이미 동기화 중이면 busy 반환."""
    if _SYNC_LOCK.locked():
        return {"status": "busy", "message": "A sync operation is already in progress."}

    async with _SYNC_LOCK:
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(_THREAD_POOL, _perform_sync_blocking)
        return result


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
