"""
Google Drive Manifest Diff Sync — ComfyUI-Bada-Utils (v2, scoped)
====================================================================
1차 범위: 사용자 개인 데이터 3종만 동기화합니다.
  - presets_data.json        (프리셋 라이브러리)
  - favorites_data.json      (즐겨찾기)
  - gemini_chat_history.json (제미나이 채팅 기록)

설계 원칙
  1. 라이브러리 미설치 시 서버 기동에 영향 없음 (GDRIVE_LIBS_AVAILABLE=False)
  2. 동기화는 넌블로킹 (ThreadPoolExecutor + run_in_executor)
  3. 변경분만 pinpoint 업/다운 (manifest.json 의 SHA256+mtime+size Diff)
  4. Drive 파일명 충돌 방지를 위해 상대경로는 `___` 로 인코딩
  5. 중복 실행 방지 (_SYNC_LOCK)

의도적 제외 대상 (이전 버전과의 차이)
  - config.json          : Gemini API 키 등 시크릿 포함. Drive 업로드 금지.
  - engines_registry.json: GitHub 배포 아티팩트. 덮어쓰면 배포 오염.
  - credentials/token    : 인증 파일. 커밋·동기화·배포 전부 금지.
  - 워크플로우 .json     : 용량이 크므로 1차에서 제외 (2차 검토).
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
        "[GDrive] google-api-python-client / google-auth-oauthlib 미설치 → "
        "클라우드 동기화 기능이 비활성화됩니다. (서버 기동에는 영향 없음)"
    )

SCOPES = ['https://www.googleapis.com/auth/drive.file']
FOLDER_NAME = 'ComfyUI_BadaUtils_Configs'
MANIFEST_FILE_NAME = 'manifest.json'

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(CURRENT_DIR)

CREDENTIALS_PATH = os.path.join(PARENT_DIR, 'credentials.json')
TOKEN_PATH = os.path.join(PARENT_DIR, 'token.json')

# 동기화 대상 파일명 (커스텀 노드 루트 기준). 워크플로우 디렉터리와 무관하게 고정.
SYNC_TARGET_FILES = [
    'presets_data.json',
    'favorites_data.json',
    'gemini_chat_history.json',
]

# 1차 버전의 로컬 캐시 매니페스트 경로 (워크플로우 폴더를 더럽히지 않도록 노드 루트).
LOCAL_MANIFEST_CACHE = os.path.join(PARENT_DIR, '.gdrive_manifest.json')

_SYNC_LOCK = asyncio.Lock()
_THREAD_POOL = ThreadPoolExecutor(max_workers=2, thread_name_prefix="GDriveSyncWorker")


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
            "message": "google-api-python-client 라이브러리가 필요합니다.",
        }

    if not os.path.exists(CREDENTIALS_PATH) and not os.path.exists(TOKEN_PATH):
        return {
            "status": "missing_credentials",
            "authorized": False,
            "message": "credentials.json 파일이 존재하지 않습니다.",
        }

    if os.path.exists(TOKEN_PATH):
        try:
            creds = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)
            if creds and (creds.valid or creds.refresh_token):
                return {
                    "status": "authenticated",
                    "authorized": True,
                    "message": "Google Drive 연동 완료",
                }
        except Exception:
            pass

    return {
        "status": "unauthenticated",
        "authorized": False,
        "message": "Google Drive 인증이 필요합니다.",
    }


def get_drive_service():
    """
    인증 후 Google Drive API 서비스 객체를 반환.
    라이브러리 미설치/인증 실패 시 (None, 사유) 를 반환해 호출측이 안전하게 처리.
    """
    if not GDRIVE_LIBS_AVAILABLE:
        return None, "google-api-python-client 라이브러리가 설치되어 있지 않습니다."

    creds = None
    if os.path.exists(TOKEN_PATH):
        try:
            creds = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)
        except Exception as e:
            logger.warning(f"[GDrive] token.json 로드 실패: {e}")
            creds = None

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
                with open(TOKEN_PATH, 'w', encoding='utf-8') as token_file:
                    token_file.write(creds.to_json())
            except Exception as e:
                logger.warning(f"[GDrive] token 갱신 실패: {e}")
                creds = None

        if not creds:
            if not os.path.exists(CREDENTIALS_PATH):
                return None, "credentials.json 파일이 상위 폴더에 존재하지 않습니다."
            try:
                flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_PATH, SCOPES)
                creds = flow.run_local_server(port=0)
                with open(TOKEN_PATH, 'w', encoding='utf-8') as token_file:
                    token_file.write(creds.to_json())
            except Exception as e:
                logger.error(f"[GDrive] OAuth Flow 실패: {e}")
                return None, f"OAuth 인증 실패: {str(e)}"

    try:
        service = build('drive', 'v3', credentials=creds, cache_discovery=False)
        return service, "OK"
    except Exception as e:
        logger.error(f"[GDrive] Drive Service 생성 실패: {e}")
        return None, f"Drive Service 생성 실패: {str(e)}"


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


def _resolve_local_path(rel_path):
    """
    `.configs/<filename>` 상대경로를 실제 로컬 절대경로로 변환.
    1차 범위는 전부 노드 루트의 개인 데이터 파일이므로 폴더 탈출을 차단한다.
    """
    clean_rel = rel_path.replace('\\', '/').lstrip('/')
    if not clean_rel.startswith('.configs/'):
        raise ValueError(f"허용되지 않은 동기화 경로: {rel_path}")
    cfg_name = clean_rel[len('.configs/'):]
    # 경로 탈출(../) 방지 — 화이트리스트에 있는 파일명만 허용.
    if cfg_name not in SYNC_TARGET_FILES:
        raise ValueError(f"동기화 대상이 아닌 파일: {cfg_name}")
    return os.path.join(PARENT_DIR, cfg_name)


def build_local_manifest():
    """
    로컬 대상 파일들의 매니페스트를 생성:
    { "rel_path": { "sha256": str, "size": int, "mtime": float } }
    존재하지 않는 파일은 건너뛴다 (선택적 동기화).
    """
    manifest = {}
    for rel_path in get_target_rel_paths():
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
            logger.warning(f"[GDrive] stat 실패 {rel_path}: {e}")
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
        logger.warning(f"[GDrive] 원격 manifest 다운로드 실패: {e}")
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
        try:
            with open(full_path, 'rb') as src, open(full_path + '.bak', 'wb') as dst:
                dst.write(src.read())
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
            logger.info(f"[GDrive] 업로드: {rel_path}")

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
                logger.info(f"[GDrive] 다운로드: {rel_path}")

        # 원격 manifest 갱신
        _upload_remote_manifest(service, folder_id, updated_manifest, remote_manifest_file_id)

        # 로컬 캐시 manifest 저장 (노드 루트에 숨김 파일).
        try:
            with open(LOCAL_MANIFEST_CACHE, 'w', encoding='utf-8') as f:
                json.dump(updated_manifest, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

        return {
            "status": "success",
            "message": f"동기화 완료 (업로드: {uploaded_count}개, 다운로드: {downloaded_count}개)",
            "uploaded": uploaded_count,
            "downloaded": downloaded_count,
            "last_sync_at": time.time(),
        }

    except Exception as e:
        logger.error(f"[GDrive] 동기화 오류: {e}", exc_info=True)
        return {"status": "error", "message": str(e), "uploaded": 0, "downloaded": 0}


async def sync_gdrive_async():
    """넌블로킹 동기화 래퍼. 이미 동기화 중이면 busy 반환."""
    if _SYNC_LOCK.locked():
        return {"status": "busy", "message": "이미 동기화 작업이 진행 중입니다."}

    async with _SYNC_LOCK:
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(_THREAD_POOL, _perform_sync_blocking)
        return result


def get_sync_file_details():
    """설정창 현황 표시용 — 대상 3종 파일의 존재/용량 요약."""
    details = []
    for rel_path in get_target_rel_paths():
        try:
            full_path = _resolve_local_path(rel_path)
        except ValueError:
            continue
        name = os.path.basename(rel_path)
        if os.path.isfile(full_path):
            details.append({"name": name, "exists": True, "size": os.path.getsize(full_path)})
        else:
            details.append({"name": name, "exists": False, "size": 0})
    return details
