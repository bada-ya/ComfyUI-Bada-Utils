"""
ComfyUI-Bada-Utils (All-in-One Quality of Life, Presets, Auto-Assigner & Regional Prompting Suite)
Author: bada-ya (https://github.com/bada-ya)
"""
import logging
import os
import sys
import subprocess

logger = logging.getLogger("ComfyUI-Bada-Utils")

# ── Ensure Cloud Sync dependencies (finished BEFORE the GUI opens) ───────────
# Key fact: ComfyUI itself does NOT auto-install a custom node's requirements.txt.
# Installing custom-node requirements is ComfyUI-Manager's job. When a user installs
# via `git clone` manually, nobody installs requirements, so the Google libraries are
# missing. (Only the console-facing notices below are English on purpose.)
#
# [Why a blocking (synchronous) install?]
#   Previously this ran in a background thread: after the "GUI go to …" server-ready
#   log appeared, the install finished 4–5 minutes later and only activated on the
#   NEXT restart. Users saw "ready" but Cloud Sync stayed off that session — the
#   ready moment and the actually-ready moment diverged. So we finish the install
#   HERE, before the GUI opens, making "ready" mean "usable".
#
#   - If already installed (most users / ComfyUI-Manager installs) → returns instantly,
#     zero startup delay, and none of the notices below ever print.
#   - Only the first `git clone` install blocks startup briefly (one-time) → usable
#     this very session.
#   - Any failure (offline, etc.) is swallowed so startup never dies (keeps the
#     "no impact on server startup" guarantee).
def _ensure_cloud_deps():
    try:
        import importlib.util
        needed = ("googleapiclient", "google_auth_oauthlib")
        if all(importlib.util.find_spec(m) is not None for m in needed):
            return  # Already installed → return immediately (zero delay, silent).
    except Exception:
        return  # find_spec error → skip install attempt (protect startup).

    logger.info(
        "[ComfyUI-Bada-Utils] Installing Cloud Sync dependencies "
        "(google-api-python-client)... first run only, may take a moment; "
        "usable this session once done."
    )
    try:
        # aiohttp / Pillow already ship with ComfyUI, so install only the 2 Google libs.
        subprocess.run(
            [sys.executable, "-m", "pip", "install",
             "google-api-python-client", "google-auth-oauthlib"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=600,
            check=False,
        )
        logger.info("[ComfyUI-Bada-Utils] Cloud Sync dependencies installed — usable this session.")
    except Exception as exc:
        logger.warning(
            f"[ComfyUI-Bada-Utils] Cloud Sync dependency install failed "
            f"(ignored, server startup continues): {exc}"
        )


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
