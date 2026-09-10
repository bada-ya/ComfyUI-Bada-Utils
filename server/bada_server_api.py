"""
ComfyUI-Bada-Utils: Unified Backend REST API Routes
- Workflow Organization & File Management API (Tree, Content, Move, Mkdir, Delete, Favorites)
- Universal Presets Persistence API (load / save)
- Auto Model & LoRA Discovery API
"""

import os
import shutil
import json
import logging
from aiohttp import web
from server import PromptServer
import folder_paths

logger = logging.getLogger("ComfyUI-Bada-Utils")

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(CURRENT_DIR)
PRESETS_FILE = os.path.join(PARENT_DIR, "presets_data.json")
FAVORITES_FILE = os.path.join(PARENT_DIR, "favorites_data.json")


# =========================================================================
# 1. Workflow Organization Helpers & Safe Path Checks
# =========================================================================

def get_workflows_root_dir():
    """
    Returns the absolute real path to ComfyUI's user workflows directory (resolving NTFS junctions/symlinks).
    """
    try:
        user_dir = folder_paths.get_user_directory()
    except Exception:
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        user_dir = os.path.join(base_dir, "user")

    # Check <user_dir>/default/workflows first
    candidate1 = os.path.join(user_dir, "default", "workflows")
    if os.path.exists(candidate1):
        return os.path.realpath(candidate1)

    # Check <user_dir>/workflows
    candidate2 = os.path.join(user_dir, "workflows")
    if os.path.exists(candidate2):
        return os.path.realpath(candidate2)

    os.makedirs(candidate1, exist_ok=True)
    return os.path.realpath(candidate1)


def is_safe_path(base_dir, path):
    """
    Ensures that target path is safely contained within base_dir (prevents directory traversal),
    properly resolving NTFS junctions and Windows case-insensitivity.
    """
    try:
        real_base = os.path.normcase(os.path.realpath(base_dir))
        real_path = os.path.normcase(os.path.realpath(path))
        return os.path.commonpath((real_base, real_path)) == real_base
    except Exception as e:
        logger.warning(f"[Bada-Utils] is_safe_path exception: {e}")
        return False


def find_file_in_workflows(root_dir, search_rel):
    """
    Attempts to find the file under root_dir even if extension or exact subpath is omitted.
    """
    clean_rel = search_rel.replace("\\", "/").lstrip("/\\")
    full_path = os.path.abspath(os.path.join(root_dir, clean_rel))
    if os.path.isfile(full_path) and is_safe_path(root_dir, full_path):
        return full_path

    # Try common extensions
    for ext in [".json", ".png", ".jpg", ".jpeg"]:
        candidate = full_path + ext
        if os.path.isfile(candidate) and is_safe_path(root_dir, candidate):
            return candidate

    # Search by basename
    base_name = os.path.basename(clean_rel)
    for root, dirs, files in os.walk(root_dir):
        if base_name in files:
            target = os.path.join(root, base_name)
            if is_safe_path(root_dir, target):
                return target
        for ext in [".json", ".png", ".jpg", ".jpeg"]:
            cand_name = base_name + ext
            if cand_name in files:
                target = os.path.join(root, cand_name)
                if is_safe_path(root_dir, target):
                    return target

    return None


def build_workflow_tree(root_dir):
    """
    Recursively scans the user workflows directory and builds a nested tree representation.
    """
    def scan_dir(current_dir, rel_path=""):
        folder_name = "Root" if not rel_path else os.path.basename(current_dir)
        display_path = "/" if not rel_path else rel_path.replace("\\", "/")

        node = {
            "name": folder_name,
            "path": display_path,
            "count": 0,
            "folders": [],
            "files": []
        }

        try:
            entries = sorted(os.scandir(current_dir), key=lambda e: (not e.is_dir(), e.name.lower()))
        except Exception as e:
            logger.warning(f"[Bada-Utils] Failed to scan dir {current_dir}: {e}")
            return node

        for entry in entries:
            if entry.name.startswith("."):
                continue  # Skip hidden files like .index.json
            entry_rel = os.path.join(rel_path, entry.name) if rel_path else entry.name

            if entry.is_dir():
                sub_node = scan_dir(entry.path, entry_rel)
                node["folders"].append(sub_node)
                node["count"] += sub_node["count"]
            elif entry.is_file():
                if entry.name.lower().endswith((".json", ".png")):
                    clean_name = os.path.splitext(entry.name)[0]
                    file_rel_path = entry_rel.replace("\\", "/")
                    node["files"].append({
                        "name": clean_name,
                        "filename": entry.name,
                        "path": file_rel_path
                    })
                    node["count"] += 1

        return node

    return scan_dir(root_dir)


# =========================================================================
# 2. Local Models & LoRAs Discovery Engine
# =========================================================================

def get_all_available_models():
    """
    ComfyUI folder_paths를 활용하여 각 카테고리별 로컬 보유 모델 목록을 안전하게 수집합니다.
    """
    model_categories = {
        "checkpoints": "checkpoints",
        "diffusion_models": "diffusion_models",
        "unet": "unet",
        "clip": "clip",
        "text_encoders": "text_encoders",
        "vae": "vae",
        "loras": "loras",
        "controlnet": "controlnet",
        "upscale_models": "upscale_models",
        "clip_vision": "clip_vision",
        "style_models": "style_models",
        "embeddings": "embeddings",
        "gligen": "gligen",
        "photomaker": "photomaker",
    }
    
    result = {}
    for key, folder_type in model_categories.items():
        try:
            files = folder_paths.get_filename_list(folder_type)
            result[key] = list(files) if files else []
        except Exception:
            result[key] = []
            
    # diffusion_models & unet 통합
    if not result.get("diffusion_models") and result.get("unet"):
        result["diffusion_models"] = result["unet"]
    elif not result.get("unet") and result.get("diffusion_models"):
        result["unet"] = result["diffusion_models"]
        
    # clip & text_encoders 통합
    if not result.get("clip") and result.get("text_encoders"):
        result["clip"] = result["text_encoders"]
    elif not result.get("text_encoders") and result.get("clip"):
        result["text_encoders"] = result["clip"]

    return result


# =========================================================================
# 3. Master Route Registration
# =========================================================================

def register_bada_api_routes():
    """
    Register all Bada API endpoints onto ComfyUI PromptServer instance.
    """
    try:
        routes = PromptServer.instance.routes

        # --- A. Presets API ---
        async def load_presets_handler(request):
            try:
                data = {}
                if os.path.exists(PRESETS_FILE):
                    with open(PRESETS_FILE, "r", encoding="utf-8") as f:
                        data = json.load(f)
                return web.json_response({"success": True, "presets": data, "hub_presets": {}})
            except Exception as e:
                return web.json_response({"success": False, "error": str(e)}, status=500)

        async def save_presets_handler(request):
            try:
                body = await request.json()
                if "presets" in body:
                    with open(PRESETS_FILE, "w", encoding="utf-8") as f:
                        json.dump(body["presets"], f, ensure_ascii=False, indent=2)
                return web.json_response({"success": True, "message": "Presets saved successfully"})
            except Exception as e:
                return web.json_response({"success": False, "error": str(e)}, status=500)

        # Register Presets endpoints (modern + legacy)
        routes.get("/api/bada/presets/load")(load_presets_handler)
        routes.post("/api/bada/presets/save")(save_presets_handler)
        routes.get("/universal_presets/load")(load_presets_handler)
        routes.post("/universal_presets/save")(save_presets_handler)

        # --- B. Auto Model Assigner API ---
        async def get_models_handler(request):
            try:
                models_data = get_all_available_models()
                return web.json_response({
                    "status": "success",
                    "models": models_data,
                    "data": models_data,
                    "count": sum(len(v) for v in models_data.values())
                })
            except Exception as e:
                return web.json_response({"status": "error", "message": str(e)}, status=500)

        routes.get("/api/auto-assign/models")(get_models_handler)
        routes.get("/api/bada/models")(get_models_handler)

        # --- C. Workflow Tree & Content API ---
        async def get_tree_handler(request):
            try:
                root_dir = get_workflows_root_dir()
                tree = build_workflow_tree(root_dir)
                return web.json_response({"success": True, "tree": tree})
            except Exception as e:
                logger.error(f"[Bada-Utils] get_tree_handler error: {e}")
                return web.json_response({"success": False, "error": str(e)}, status=500)

        async def get_content_handler(request):
            try:
                target_path = request.query.get("path", "").strip()
                if not target_path:
                    return web.json_response({"success": False, "error": "Path parameter required"}, status=400)

                root_dir = get_workflows_root_dir()
                full_path = find_file_in_workflows(root_dir, target_path)

                if not full_path or not os.path.isfile(full_path):
                    return web.json_response({"success": False, "error": f"File not found: {target_path}"}, status=404)

                with open(full_path, "r", encoding="utf-8") as f:
                    content_data = json.load(f)

                return web.json_response({"success": True, "data": content_data})
            except Exception as e:
                return web.json_response({"success": False, "error": str(e)}, status=500)

        routes.get("/api/bada/workflows/tree")(get_tree_handler)
        routes.get("/api/qol/workflows/tree")(get_tree_handler)
        routes.get("/api/bada/workflows/content")(get_content_handler)
        routes.get("/api/qol/workflows/content")(get_content_handler)

        # --- D. Workflow Management & Organization API ---
        async def list_folders_handler(request):
            try:
                root_dir = get_workflows_root_dir()
                folders = ["/"]
                for root, dirs, files in os.walk(root_dir):
                    rel = os.path.relpath(root, root_dir).replace("\\", "/")
                    if rel != "." and is_safe_path(root_dir, root):
                        folders.append("/" + rel)
                folders.sort()
                return web.json_response({"success": True, "folders": folders, "root_dir": root_dir})
            except Exception as e:
                return web.json_response({"success": False, "error": str(e)}, status=500)

        async def move_workflow_handler(request):
            try:
                body = await request.json()
                source_rel = (body.get("source_path") or body.get("source") or "").strip()
                target_folder_rel = (body.get("target_folder") or body.get("target") or "/").strip()
                new_name = body.get("new_name", "").strip()

                if not source_rel:
                    return web.json_response({"success": False, "error": "Source path is required"}, status=400)

                root_dir = get_workflows_root_dir()
                src_full = find_file_in_workflows(root_dir, source_rel)

                if not src_full or not os.path.isfile(src_full):
                    return web.json_response({"success": False, "error": f"Source file not found: {source_rel}"}, status=404)

                clean_target_dir = target_folder_rel.replace("\\", "/").lstrip("/\\")
                dest_dir = os.path.abspath(os.path.join(root_dir, clean_target_dir))

                if not is_safe_path(root_dir, dest_dir):
                    return web.json_response({"success": False, "error": "Invalid target directory"}, status=403)

                os.makedirs(dest_dir, exist_ok=True)
                file_name = new_name if new_name else os.path.basename(src_full)
                if not file_name.endswith(".json") and not file_name.endswith(".png"):
                    file_name += ".json"

                dest_full = os.path.join(dest_dir, file_name)

                # Move file
                shutil.move(src_full, dest_full)
                new_rel_path = "/" + os.path.relpath(dest_full, root_dir).replace("\\", "/")

                return web.json_response({
                    "success": True,
                    "message": f"Successfully moved '{file_name}' to '{target_folder_rel or '/'}'",
                    "new_path": new_rel_path
                })
            except Exception as e:
                return web.json_response({"success": False, "error": str(e)}, status=500)

        async def create_folder_handler(request):
            try:
                body = await request.json()
                folder_name = (body.get("folder_name") or body.get("folder") or "").strip()
                parent_rel = (body.get("parent_folder") or body.get("parent") or "/").strip()

                if not folder_name:
                    return web.json_response({"success": False, "error": "Folder name is required"}, status=400)

                root_dir = get_workflows_root_dir()
                clean_parent = parent_rel.replace("\\", "/").lstrip("/\\")
                target_dir = os.path.abspath(os.path.join(root_dir, clean_parent, folder_name))

                if not is_safe_path(root_dir, target_dir):
                    return web.json_response({"success": False, "error": "Invalid folder path"}, status=403)

                os.makedirs(target_dir, exist_ok=True)
                rel_path = "/" + os.path.relpath(target_dir, root_dir).replace("\\", "/")
                return web.json_response({"success": True, "message": f"Folder '{folder_name}' created", "path": rel_path})
            except Exception as e:
                return web.json_response({"success": False, "error": str(e)}, status=500)

        async def delete_workflow_handler(request):
            try:
                body = await request.json()
                target_rel = (body.get("target_path") or body.get("path") or "").strip()

                if not target_rel:
                    return web.json_response({"success": False, "error": "Target path is required"}, status=400)

                root_dir = get_workflows_root_dir()
                clean_rel = target_rel.replace("\\", "/").lstrip("/\\")
                target_full = os.path.abspath(os.path.join(root_dir, clean_rel))

                if not is_safe_path(root_dir, target_full):
                    return web.json_response({"success": False, "error": "Invalid path"}, status=403)

                if os.path.isdir(target_full):
                    shutil.rmtree(target_full)
                    return web.json_response({"success": True, "message": f"Folder '{clean_rel}' deleted"})
                elif os.path.isfile(target_full):
                    os.remove(target_full)
                    return web.json_response({"success": True, "message": f"File '{clean_rel}' deleted"})
                else:
                    # Try find_file_in_workflows
                    found = find_file_in_workflows(root_dir, clean_rel)
                    if found and os.path.isfile(found):
                        os.remove(found)
                        return web.json_response({"success": True, "message": f"File deleted"})
                    return web.json_response({"success": False, "error": "File or folder not found"}, status=404)
            except Exception as e:
                return web.json_response({"success": False, "error": str(e)}, status=500)

        async def favorites_handler(request):
            try:
                if request.method == "GET":
                    favs = []
                    if os.path.exists(FAVORITES_FILE):
                        with open(FAVORITES_FILE, "r", encoding="utf-8") as f:
                            favs = json.load(f)
                    return web.json_response({"success": True, "favorites": favs})
                elif request.method == "POST":
                    body = await request.json()
                    favs = body.get("favorites", [])
                    with open(FAVORITES_FILE, "w", encoding="utf-8") as f:
                        json.dump(favs, f, ensure_ascii=False, indent=2)
                    return web.json_response({"success": True, "favorites": favs})
            except Exception as e:
                return web.json_response({"success": False, "error": str(e)}, status=500)

        routes.get("/api/bada/workflows/folders")(list_folders_handler)
        routes.post("/api/bada/workflows/move")(move_workflow_handler)
        routes.post("/api/bada/workflows/mkdir")(create_folder_handler)
        routes.post("/api/bada/workflows/create_folder")(create_folder_handler)
        routes.post("/api/bada/workflows/delete")(delete_workflow_handler)
        routes.get("/api/bada/workflows/favorites")(favorites_handler)
        routes.post("/api/bada/workflows/favorites")(favorites_handler)

        # Legacy routes for QoL
        routes.get("/api/qol/workflows/folders")(list_folders_handler)
        routes.post("/api/qol/workflows/move")(move_workflow_handler)
        routes.post("/api/qol/workflows/mkdir")(create_folder_handler)
        routes.post("/api/qol/workflows/create_folder")(create_folder_handler)
        routes.post("/api/qol/workflows/delete")(delete_workflow_handler)
        routes.get("/api/qol/workflows/favorites")(favorites_handler)
        routes.post("/api/qol/workflows/favorites")(favorites_handler)

        logger.info("[ComfyUI-Bada-Utils] Backend REST API Routes registered successfully ⚡")
    except Exception as e:
        logger.warning(f"[ComfyUI-Bada-Utils] Failed to register API routes: {e}")
