"""
ComfyUI-Bada-Utils (All-in-One Quality of Life, Presets, Auto-Assigner & Regional Prompting Suite)
Author: bada-ya (https://github.com/bada-ya)
"""
import logging
from .nodes import (
    NODE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS,
)
from .server import register_bada_api_routes, register_gemini_api_routes

logger = logging.getLogger("ComfyUI-Bada-Utils")

# 1. Register Web Frontend Assets Directory
WEB_DIRECTORY = "./web"

# 2. Register Unified REST API Endpoints
try:
    register_bada_api_routes()
    register_gemini_api_routes()
except Exception as e:
    logger.warning(f"[ComfyUI-Bada-Utils] Server API initialization notice: {e}")

# 3. Export Node Class Mappings
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

print("\033[36m[ComfyUI-Bada-Utils]\033[0m ⚓ All-in-One Suite (QoL, Presets, Regional Prompt & Async Gemini Studio) Loaded Successfully!")
