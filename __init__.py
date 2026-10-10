"""
ComfyUI-Bada-Utils (All-in-One Quality of Life, Presets, Auto-Assigner & Regional Prompting Suite)
Author: bada-ya (https://github.com/bada-ya)
"""
import logging
import os
import sys
import subprocess
import threading

logger = logging.getLogger("ComfyUI-Bada-Utils")

# ── Cloud Sync 종속성 자동 설치 (ComfyUI 기동 차단 방지) ──────────────────────
# google-api-python-client / google-auth-oauthlib 이 없으면 클라우드 동기화가
# 비활성화된다. ComfyUI 가 custom_node 의 requirements.txt 를 자동 설치하지만,
# 최초 설치 누락·오프라인·수동 설치 등으로 빠진 경우를 대비해 여기서 한 번 더
# 방어적으로 설치을 시도한다. 기동을 막으면 안 되므로 백그�라운드 스레드 +
# 완전 예외 삼킴(실패해도 조용히 스킵). ComfyUI Manager 재시작 시 설치가 완료된다.
def _ensure_cloud_deps():
    try:
        import importlib.util
        needed = ("googleapiclient", "google_auth_oauthlib")
        if all(importlib.util.find_spec(m) is not None for m in needed):
            return  # 이미 설치됨 → 아무 것도 안 함.
    except Exception:
        return  # importlib 예외는 설치 시도 자체를 포기.

    req_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "requirements.txt")
    if not os.path.exists(req_path):
        return

    def _worker():
        try:
            logger.warning(
                "[ComfyUI-Bada-Utils] Cloud Sync 종속성이 없어 requirements.txt 자동 설치를 "
                "백그라운드에서 시도합니다. (기존에는 수동 설치가 필요했음)"
            )
            subprocess.run(
                [sys.executable, "-m", "pip", "install", "-r", req_path],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=600,
            )
            logger.info("[ComfyUI-Bada-Utils] Cloud Sync 종속성 자동 설치 완료. ComfyUI 재시작 시 활성화됩니다.")
        except Exception as exc:
            logger.debug(f"[ComfyUI-Bada-Utils] Cloud Sync 종속성 자동 설치 실패(무시): {exc}")

    threading.Thread(target=_worker, daemon=True, name="BadaCloudDepsInstall").start()


_ensure_cloud_deps()

from .nodes import (
    NODE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS,
)
from .server import register_bada_api_routes, register_gemini_api_routes, register_promptgen_api_routes, register_cloud_routes

logger = logging.getLogger("ComfyUI-Bada-Utils")

# 1. Register Web Frontend Assets Directory
WEB_DIRECTORY = "./web"

# 2. Register Unified REST API Endpoints
try:
    register_bada_api_routes()
    register_gemini_api_routes()
    register_promptgen_api_routes()
    register_cloud_routes()
except Exception as e:
    logger.warning(f"[ComfyUI-Bada-Utils] Server API initialization notice: {e}")

# 3. Export Node Class Mappings
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

print("\033[36m[ComfyUI-Bada-Utils]\033[0m ⚓ All-in-One Suite (QoL, Presets, Regional Prompt & Async Gemini Studio) Loaded Successfully!")
