"""
ComfyUI-Bada-Utils (All-in-One Quality of Life, Presets, Auto-Assigner & Regional Prompting Suite)
Author: bada-ya (https://github.com/bada-ya)
"""
import sys
import subprocess
import logging

logger = logging.getLogger("ComfyUI-Bada-Utils")

# Auto pip install required Google Drive packages if missing
def _auto_install_gdrive_deps():
    required = {
        "googleapiclient": "google-api-python-client>=2.100.0",
        "google_auth_oauthlib": "google-auth-oauthlib>=1.1.0",
        "google.auth": "google-auth-httplib2>=0.1.1"
    }
    missing = []
    for mod_name, pkg_name in required.items():
        try:
            __import__(mod_name)
        except ImportError:
            missing.append(pkg_name)

    if missing:
        logger.info(f"[ComfyUI-Bada-Utils] 구글 드라이브 동기화 필요 패키지 감지: {missing}. 자동 설치를 진행합니다...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", *missing])
            logger.info("[ComfyUI-Bada-Utils] 필요 패키지 자동 설치 완료!")
        except Exception as e:
            logger.warning(f"[ComfyUI-Bada-Utils] 패키지 자동 설치 실패 (수동 pip install 필요): {e}")

_auto_install_gdrive_deps()

from .nodes import (
    NODE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS,
)
from .server import register_bada_api_routes, register_gemini_api_routes, register_promptgen_api_routes

# 1. Register Web Frontend Assets Directory
WEB_DIRECTORY = "./web"

# 2. Register Unified REST API Endpoints
try:
    register_bada_api_routes()
    register_gemini_api_routes()
    register_promptgen_api_routes()
except Exception as e:
    logger.warning(f"[ComfyUI-Bada-Utils] Server API initialization notice: {e}")

# 3. Export Node Class Mappings
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

print("\033[36m[ComfyUI-Bada-Utils]\033[0m ⚓ All-in-One Suite (QoL, Presets, Regional Prompt & Async Gemini Studio) Loaded Successfully!")
