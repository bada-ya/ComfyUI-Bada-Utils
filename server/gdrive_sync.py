"""
Google Drive Async Background Sync Module for ComfyUI-Bada-Utils
- Uses a single manifest.json file to calculate Diff (SHA256, mtime, size)
- Ensures non-blocking async background operations and zero UI delays
"""

import os
import json
import io
import time
import asyncio
import hashlib
import logging
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger("ComfyUI-Bada-Utils.GDrive")

# Google API client imports with safety fallback
try:
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload, MediaIoBaseUpload
    GDRIVE_LIBS_AVAILABLE = True
except ImportError:
    GDRIVE_LIBS_AVAILABLE = False
    logger.warning("[GDrive] google-api-python-client or google-auth-oauthlib is not installed.")

SCOPES = ['https://www.googleapis.com/auth/drive.file']
FOLDER_NAME = 'ComfyUI_Workflows'
MANIFEST_FILE_NAME = 'manifest.json'

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(CURRENT_DIR)

# Path for credentials and token files
CREDENTIALS_PATH = os.path.join(PARENT_DIR, 'credentials.json')
TOKEN_PATH = os.path.join(PARENT_DIR, 'token.json')

# Global Lock to prevent duplicate sync tasks
_SYNC_LOCK = asyncio.Lock()
_THREAD_POOL = ThreadPoolExecutor(max_workers=2, thread_name_prefix="GDriveSyncWorker")


def check_gdrive_libs():
    return GDRIVE_LIBS_AVAILABLE


def get_drive_service():
    """
    Authenticates and returns the Google Drive API service.
    Returns None if libraries are missing or credentials file is not found.
    """
    if not GDRIVE_LIBS_AVAILABLE:
        return None, "google-api-python-client 라이브러리가 설치되어 있지 않습니다."

    creds = None
    if os.path.exists(TOKEN_PATH):
        try:
            creds = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)
        except Exception as e:
            logger.warning(f"[GDrive] Failed to load token.json: {e}")
            creds = None

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
                with open(TOKEN_PATH, 'w', encoding='utf-8') as token_file:
                    token_file.write(creds.to_json())
            except Exception as e:
                logger.warning(f"[GDrive] Failed to refresh token: {e}")
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
                logger.error(f"[GDrive] OAuth Flow failed: {e}")
                return None, f"OAuth 인증 실패: {str(e)}"

    try:
        service = build('drive', 'v3', credentials=creds, cache_discovery=False)
        return service, "OK"
    except Exception as e:
        logger.error(f"[GDrive] Failed to build drive service: {e}")
        return None, f"Drive Service 생성 실패: {str(e)}"


def get_gdrive_status():
    """
    Returns the current status of Google Drive integration.
    """
    if not GDRIVE_LIBS_AVAILABLE:
        return {
            "status": "missing_libs",
            "authorized": False,
            "message": "google-api-python-client 라이브러리가 필요합니다."
        }

    if not os.path.exists(CREDENTIALS_PATH) and not os.path.exists(TOKEN_PATH):
        return {
            "status": "missing_credentials",
            "authorized": False,
            "message": "credentials.json 파일이 존재하지 않습니다."
        }

    if os.path.exists(TOKEN_PATH):
        try:
            creds = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)
            if creds and (creds.valid or creds.refresh_token):
                return {
                    "status": "authenticated",
                    "authorized": True,
                    "message": "Google Drive 연동 완료됨"
                }
        except Exception:
            pass

    return {
        "status": "unauthenticated",
        "authorized": False,
        "message": "Google Drive 인증이 필요합니다."
    }


def calculate_sha256(filepath):
    """Calculates SHA256 hash of a file."""
    hasher = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def _resolve_local_path(workflows_dir, rel_path):
    """Resolves local file path for both workflows and node configuration files (.configs/)."""
    clean_rel = rel_path.replace('\\', '/').lstrip('/')
    if clean_rel.startswith('.configs/'):
        cfg_name = clean_rel[len('.configs/'):]
        return os.path.join(PARENT_DIR, cfg_name)
    return os.path.join(workflows_dir, clean_rel.replace('/', os.sep))


def build_local_manifest(workflows_dir):
    """
    Scans local workflows directory and node configuration files and generates manifest map:
    { "rel_path": { "sha256": str, "size": int, "mtime": float } }
    """
    manifest = {}
    if not os.path.exists(workflows_dir):
        return manifest

    # 1. Workflows (.json) scanning
    for root, _, files in os.walk(workflows_dir):
        for filename in files:
            if not filename.endswith('.json') or filename.startswith('.'):
                continue
            full_path = os.path.join(root, filename)
            rel_path = os.path.relpath(full_path, workflows_dir).replace('\\', '/')
            try:
                stat = os.stat(full_path)
                sha = calculate_sha256(full_path)
                manifest[rel_path] = {
                    "sha256": sha,
                    "size": stat.st_size,
                    "mtime": stat.st_mtime
                }
            except Exception as e:
                logger.warning(f"[GDrive] Failed to stat file {rel_path}: {e}")

    # 2. Node Config Files scanning (.configs/)
    config_files = ["presets_data.json", "config.json", "engines_registry.json", "favorites_data.json"]
    for cfg_name in config_files:
        cfg_full_path = os.path.join(PARENT_DIR, cfg_name)
        if os.path.isfile(cfg_full_path):
            rel_path = f".configs/{cfg_name}"
            try:
                stat = os.stat(cfg_full_path)
                sha = calculate_sha256(cfg_full_path)
                manifest[rel_path] = {
                    "sha256": sha,
                    "size": stat.st_size,
                    "mtime": stat.st_mtime
                }
            except Exception as e:
                logger.warning(f"[GDrive] Failed to stat config file {cfg_name}: {e}")

    return manifest


def _get_or_create_remote_folder(service, folder_name):
    """Retrieves or creates target folder ID on Google Drive."""
    query = f"name = '{folder_name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    results = service.files().list(q=query, fields="files(id, name)").execute()
    items = results.get('files', [])
    if items:
        return items[0]['id']

    # Create new folder
    file_metadata = {
        'name': folder_name,
        'mimeType': 'application/vnd.google-apps.folder'
    }
    folder = service.files().create(body=file_metadata, fields='id').execute()
    return folder.get('id')


def _find_remote_file_in_folder(service, folder_id, file_name):
    """Finds a file inside a specific Google Drive folder."""
    query = f"name = '{file_name}' and '{folder_id}' in parents and trashed = false"
    results = service.files().list(q=query, fields="files(id, name)").execute()
    items = results.get('files', [])
    if items:
        return items[0]['id']
    return None


def _download_remote_manifest(service, folder_id):
    """Downloads remote manifest.json in a single request."""
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
        logger.warning(f"[GDrive] Failed to download remote manifest: {e}")
        return {}, file_id


def _upload_remote_manifest(service, folder_id, manifest_data, existing_file_id=None):
    """Uploads updated manifest.json to Google Drive."""
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


def _perform_sync_blocking(workflows_dir):
    """
    Core synchronous sync logic executed inside ThreadPoolExecutor.
    1. Single download of remote manifest.json (~0.1s)
    2. Diff computation (SHA256, mtime, size)
    3. Pinpoint uploads & downloads ONLY for changed files
    """
    service, msg = get_drive_service()
    if not service:
        return {"status": "error", "message": msg}

    try:
        folder_id = _get_or_create_remote_folder(service, FOLDER_NAME)
        local_manifest = build_local_manifest(workflows_dir)
        remote_manifest, remote_manifest_file_id = _download_remote_manifest(service, folder_id)

        uploaded_count = 0
        downloaded_count = 0
        updated_manifest = dict(remote_manifest)

        # List all remote files to map remote paths to Drive File IDs
        remote_files_map = {}
        query = f"'{folder_id}' in parents and trashed = false"
        page_token = None
        while True:
            response = service.files().list(q=query, fields="nextPageToken, files(id, name)", pageToken=page_token).execute()
            for f in response.get('files', []):
                remote_files_map[f['name']] = f['id']
            page_token = response.get('nextPageToken', None)
            if not page_token:
                break

        # Flattened filename mapper for nested paths (e.g. subfolder/test.json -> subfolder___test.json)
        def encode_remote_name(rel_path):
            return rel_path.replace('/', '___')

        def decode_remote_name(remote_name):
            return remote_name.replace('___', '/')

        # Compare Local vs Remote
        # 1. Upload candidates (Local exists & newer/missing remote)
        for rel_path, l_info in local_manifest.items():
            r_info = remote_manifest.get(rel_path)
            need_upload = False

            if not r_info:
                need_upload = True
            elif l_info['sha256'] != r_info.get('sha256'):
                if l_info['mtime'] >= r_info.get('mtime', 0):
                    need_upload = True

            if need_upload:
                local_file_path = _resolve_local_path(workflows_dir, rel_path)
                remote_name = encode_remote_name(rel_path)
                existing_id = remote_files_map.get(remote_name)

                media = MediaFileUpload(local_file_path, mimetype='application/json', resumable=True)
                if existing_id:
                    service.files().update(fileId=existing_id, media_body=media).execute()
                else:
                    file_metadata = {
                        'name': remote_name,
                        'parents': [folder_id]
                    }
                    new_f = service.files().create(body=file_metadata, media_body=media, fields='id').execute()
                    remote_files_map[remote_name] = new_f.get('id')

                updated_manifest[rel_path] = l_info
                uploaded_count += 1
                logger.info(f"[GDrive] Pinpoint uploaded: {rel_path}")

        # 2. Download candidates (Remote exists & newer/missing local)
        for rel_path, r_info in remote_manifest.items():
            l_info = local_manifest.get(rel_path)
            need_download = False

            if not l_info:
                need_download = True
            elif l_info['sha256'] != r_info.get('sha256'):
                if r_info.get('mtime', 0) > l_info['mtime']:
                    need_download = True

            if need_download:
                remote_name = encode_remote_name(rel_path)
                remote_id = remote_files_map.get(remote_name)
                if remote_id:
                    local_file_path = _resolve_local_path(workflows_dir, rel_path)
                    os.makedirs(os.path.dirname(local_file_path), exist_ok=True)

                    # Backup if local file existed and was modified
                    if os.path.exists(local_file_path) and l_info:
                        bak_path = local_file_path + '.bak'
                        try:
                            with open(local_file_path, 'rb') as fsrc, open(bak_path, 'wb') as fdst:
                                fdst.write(fsrc.read())
                        except Exception:
                            pass

                    request = service.files().get_media(fileId=remote_id)
                    fh = io.FileIO(local_file_path, 'wb')
                    downloader = MediaIoBaseDownload(fh, request)
                    done = False
                    while not done:
                        status, done = downloader.next_chunk()

                    # Match mtime
                    mtime = r_info.get('mtime', time.time())
                    os.utime(local_file_path, (mtime, mtime))

                    updated_manifest[rel_path] = r_info
                    downloaded_count += 1
                    logger.info(f"[GDrive] Pinpoint downloaded: {rel_path}")

        # 3. Update Manifest on remote
        _upload_remote_manifest(service, folder_id, updated_manifest, remote_manifest_file_id)

        # Save local cached manifest
        local_cache_path = os.path.join(workflows_dir, '.gdrive_manifest.json')
        try:
            with open(local_cache_path, 'w', encoding='utf-8') as f:
                json.dump(updated_manifest, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

        return {
            "status": "success",
            "message": f"동기화 완료 (업로드: {uploaded_count}개, 다운로드: {downloaded_count}개)",
            "uploaded": uploaded_count,
            "downloaded": downloaded_count
        }

    except Exception as e:
        logger.error(f"[GDrive] Sync error: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}


async def sync_gdrive_async(workflows_dir):
    """Non-blocking async sync wrapper."""
    if _SYNC_LOCK.locked():
        return {"status": "busy", "message": "이미 동기화 작업이 진행 중입니다."}

    async with _SYNC_LOCK:
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(_THREAD_POOL, _perform_sync_blocking, workflows_dir)
        return result


def _perform_upload_single_blocking(workflows_dir, rel_path):
    """Uploads a single workflow file to Google Drive and updates manifest."""
    service, msg = get_drive_service()
    if not service:
        return {"status": "error", "message": msg}

    try:
        clean_rel = rel_path.replace('\\', '/').lstrip('/')
        full_path = _resolve_local_path(workflows_dir, clean_rel)
        if not os.path.exists(full_path):
            return {"status": "error", "message": f"파일을 찾을 수 없습니다: {clean_rel}"}

        folder_id = _get_or_create_remote_folder(service, FOLDER_NAME)
        remote_name = clean_rel.replace('/', '___')
        existing_id = _find_remote_file_in_folder(service, folder_id, remote_name)

        media = MediaFileUpload(full_path, mimetype='application/json', resumable=True)
        if existing_id:
            service.files().update(fileId=existing_id, media_body=media).execute()
        else:
            file_metadata = {
                'name': remote_name,
                'parents': [folder_id]
            }
            service.files().create(body=file_metadata, media_body=media, fields='id').execute()

        # Update local and remote manifest
        remote_manifest, remote_manifest_file_id = _download_remote_manifest(service, folder_id)
        stat = os.stat(full_path)
        sha = calculate_sha256(full_path)

        remote_manifest[clean_rel] = {
            "sha256": sha,
            "size": stat.st_size,
            "mtime": stat.st_mtime
        }
        _upload_remote_manifest(service, folder_id, remote_manifest, remote_manifest_file_id)

        logger.info(f"[GDrive] Single upload complete: {clean_rel}")
        return {"status": "success", "message": f"업로드 완료: {clean_rel}"}

    except Exception as e:
        logger.error(f"[GDrive] Single upload error: {e}")
        return {"status": "error", "message": str(e)}


async def upload_single_async(workflows_dir, rel_path):
    """Non-blocking single upload async wrapper."""
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(_THREAD_POOL, _perform_upload_single_blocking, workflows_dir, rel_path)
    return result
