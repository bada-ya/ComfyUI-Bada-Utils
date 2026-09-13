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

# 1-1. Dual Manager: Bridge ComfyUI-Manager Legacy Assets & Backend Routes
try:
    import sys
    import os
    import nodes
    from server import PromptServer
    from aiohttp import web

    mgr_mod = sys.modules.get("comfyui_manager")
    if not mgr_mod:
        try:
            import comfyui_manager as mgr_mod
        except Exception:
            mgr_mod = None

    if mgr_mod and hasattr(mgr_mod, "__file__") and mgr_mod.__file__:
        mgr_dir = os.path.dirname(os.path.abspath(mgr_mod.__file__))
        mgr_js = os.path.join(mgr_dir, "js")
        if os.path.isdir(mgr_js):
            # Mount static assets for on-demand lazy load WITHOUT auto-injecting into browser startup:
            if hasattr(PromptServer, "instance") and PromptServer.instance and hasattr(PromptServer.instance, "app"):
                try:
                    PromptServer.instance.app.router.add_static("/bada_dual/mgr_assets", mgr_js)
                    logger.info("[ComfyUI-Bada-Utils] 🧩 Dual Manager: On-demand assets mounted at /bada_dual/mgr_assets (startup clean).")
                except Exception as static_err:
                    logger.debug(f"[ComfyUI-Bada-Utils] Dual Manager static route notice: {static_err}")

        # Safe non-conflicting route bridge:
        if hasattr(PromptServer, "instance") and PromptServer.instance and hasattr(PromptServer.instance, "routes"):
            orig_routes = PromptServer.instance.routes
            existing_route_keys = set((r.method, r.path) for r in orig_routes)

            dummy_routes = web.RouteTableDef()
            PromptServer.instance.routes = dummy_routes
            try:
                from comfyui_manager.legacy import manager_server as legacy_mgr_server  # noqa: F401
                from comfyui_manager.legacy import share_3rdparty as legacy_share  # noqa: F401
            except Exception as bridge_err:
                logger.info(
                    f"[ComfyUI-Bada-Utils] ℹ️ 레거시 매니저를 로드할 수 없습니다 (신형 매니저만 단독 동작합니다). "
                    f"상단 바 버튼이 불필요하시면 바다 유틸 설정('7. 클래식 매니저')에서 퀵 런처를 끄실 수 있습니다. ({bridge_err})"
                )
            finally:
                PromptServer.instance.routes = orig_routes

            # Safely merge only non-conflicting routes into orig_routes
            mounted_count = 0
            for r in dummy_routes:
                if (r.method, r.path) not in existing_route_keys:
                    orig_routes._items.append(r)
                    existing_route_keys.add((r.method, r.path))
                    mounted_count += 1
            if mounted_count > 0:
                logger.info(f"[ComfyUI-Bada-Utils] 🧩 Dual Manager: {mounted_count} legacy backend routes bridged successfully.")
except Exception as e:
    logger.debug(f"[ComfyUI-Bada-Utils] Dual Manager legacy asset/route bridge notice: {e}")

# 2. Register Unified REST API Endpoints
try:
    register_bada_api_routes()
    register_gemini_api_routes()
except Exception as e:
    logger.warning(f"[ComfyUI-Bada-Utils] Server API initialization notice: {e}")

# 3. Export Node Class Mappings
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

print("\033[36m[ComfyUI-Bada-Utils]\033[0m ⚓ All-in-One Suite (QoL, Presets, Regional Prompt & Async Gemini Studio) Loaded Successfully!")
