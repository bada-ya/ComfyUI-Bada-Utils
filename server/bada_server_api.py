"""
ComfyUI-Bada-Utils: Unified Backend REST API Routes
- Workflow Organization & File Management API (Tree, Content, Move, Mkdir, Delete, Favorites)
- Universal Presets Persistence API (load / save)
- Auto Model & LoRA Discovery API
"""

import os
import sys
import shutil
import json
import logging
import asyncio
import subprocess
from aiohttp import web
from server import PromptServer
import folder_paths

logger = logging.getLogger("ComfyUI-Bada-Utils")

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(CURRENT_DIR)
PRESETS_FILE = os.path.join(PARENT_DIR, "presets_data.json")
FAVORITES_FILE = os.path.join(PARENT_DIR, "favorites_data.json")

# Active terminal subprocess tasks: task_id -> subprocess.Process
ACTIVE_TERMINAL_TASKS = {}



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
# 3. Bada Terminal & Environment Helpers
# =========================================================================

def detect_comfyui_environment():
    """
    Detects ComfyUI installation environment and returns key paths and presets:
    - Portable, StabilityMatrix, Desktop, Venv, Conda, Standard
    """
    try:
        base_dir = os.path.realpath(folder_paths.base_path)
    except Exception:
        base_dir = os.path.realpath(os.path.dirname(os.path.dirname(PARENT_DIR)))

    py_exec = os.path.realpath(sys.executable)
    py_dir = os.path.dirname(py_exec)

    env_type = "Standard"
    norm_base = base_dir.replace("\\", "/").lower()
    norm_py = py_exec.replace("\\", "/").lower()

    if "stabilitymatrix" in norm_base or "stabilitymatrix" in norm_py or "packages/comfyui" in norm_base:
        env_type = "StabilityMatrix"
    elif "python_embeded" in norm_py or "comfyui_windows_portable" in norm_base:
        env_type = "Portable"
    elif "comfyui-electron" in norm_base or "electron" in norm_base or "comfyui desktop" in norm_base:
        env_type = "Desktop"
    elif os.environ.get("CONDA_PREFIX"):
        env_type = "Conda"
    elif sys.prefix != getattr(sys, "base_prefix", sys.prefix):
        env_type = "Venv"

    # Custom nodes root
    custom_nodes_dirs = folder_paths.get_folder_paths("custom_nodes")
    custom_nodes_root = os.path.realpath(custom_nodes_dirs[0]) if custom_nodes_dirs else os.path.join(base_dir, "custom_nodes")

    # List installed custom node folders
    custom_nodes_list = []
    if os.path.exists(custom_nodes_root):
        try:
            for entry in sorted(os.scandir(custom_nodes_root), key=lambda e: e.name.lower()):
                if entry.is_dir() and not entry.name.startswith((".", "__")):
                    custom_nodes_list.append({
                        "name": entry.name,
                        "path": os.path.realpath(entry.path).replace("\\", "/")
                    })
        except Exception as e:
            logger.warning(f"[Bada-Utils] Failed to list custom nodes: {e}")

    # Python scripts directory
    scripts_dir = os.path.join(py_dir, "Scripts")
    if not os.path.exists(scripts_dir):
        scripts_dir = py_dir

    presets = [
        {"id": "custom_nodes_root", "label": "📁 Custom Nodes Root", "path": custom_nodes_root.replace("\\", "/"), "category": "primary"},
        {"id": "comfyui_root", "label": "🏠 ComfyUI Root", "path": base_dir.replace("\\", "/"), "category": "primary"},
        {"id": "python_scripts", "label": "🐍 Python / Scripts", "path": scripts_dir.replace("\\", "/"), "category": "system"},
    ]

    try:
        models_dir = os.path.realpath(folder_paths.models_dir)
        if os.path.exists(models_dir):
            presets.append({"id": "models_root", "label": "🎨 Models Directory", "path": models_dir.replace("\\", "/"), "category": "system"})
    except Exception:
        pass

    try:
        output_dir = os.path.realpath(folder_paths.get_output_directory())
        if os.path.exists(output_dir):
            presets.append({"id": "output_root", "label": "🖼️ Output Directory", "path": output_dir.replace("\\", "/"), "category": "system"})
    except Exception:
        pass

    return {
        "env_type": env_type,
        "python_executable": py_exec.replace("\\", "/"),
        "python_dir": py_dir.replace("\\", "/"),
        "scripts_dir": scripts_dir.replace("\\", "/"),
        "comfyui_root": base_dir.replace("\\", "/"),
        "custom_nodes_root": custom_nodes_root.replace("\\", "/"),
        "custom_nodes": custom_nodes_list,
        "presets": presets
    }


def browse_subdirectories(target_path):
    """
    Returns list of direct subdirectories for tree expansion.
    """
    if not target_path or not os.path.exists(target_path):
        return []
    real_path = os.path.realpath(target_path)
    if not os.path.isdir(real_path):
        return []

    subdirs = []
    try:
        for entry in sorted(os.scandir(real_path), key=lambda e: e.name.lower()):
            if entry.is_dir() and not entry.name.startswith((".", "__")):
                has_children = False
                try:
                    for sub in os.scandir(entry.path):
                        if sub.is_dir() and not sub.name.startswith((".", "__")):
                            has_children = True
                            break
                except Exception:
                    pass

                subdirs.append({
                    "name": entry.name,
                    "path": os.path.realpath(entry.path).replace("\\", "/"),
                    "has_children": has_children
                })
    except Exception as e:
        logger.warning(f"[Bada-Utils] Browse dir error {target_path}: {e}")
    return subdirs


async def run_terminal_command(task_id, command, cwd=None):
    """
    Executes shell command with real-time streaming via ComfyUI WebSocket.
    """
    env_info = detect_comfyui_environment()
    effective_cwd = cwd if (cwd and os.path.exists(cwd)) else env_info["custom_nodes_root"]

    # Environment PATH injection so 'pip' and 'python' point to ComfyUI's python
    sub_env = os.environ.copy()
    sub_env["PYTHONUNBUFFERED"] = "1"
    py_dir = os.path.dirname(sys.executable)
    scripts_dir = os.path.join(py_dir, "Scripts")
    existing_path = sub_env.get("PATH", "")
    sub_env["PATH"] = f"{scripts_dir}{os.pathsep}{py_dir}{os.pathsep}{existing_path}"

    logger.info(f"[Bada-Terminal] Starting task {task_id} in {effective_cwd}: {command}")

    # Send initial start event
    PromptServer.instance.send_sync("bada_terminal_start", {
        "task_id": task_id,
        "command": command,
        "cwd": effective_cwd.replace("\\", "/")
    })

    try:
        proc = await asyncio.create_subprocess_shell(
            command,
            cwd=effective_cwd,
            env=sub_env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        ACTIVE_TERMINAL_TASKS[task_id] = proc

        async def stream_pipe(pipe, event_type):
            while True:
                line = await pipe.readline()
                if not line:
                    break
                try:
                    text = line.decode("utf-8", errors="replace")
                except Exception:
                    text = str(line)
                PromptServer.instance.send_sync(event_type, {
                    "task_id": task_id,
                    "text": text
                })

        await asyncio.gather(
            stream_pipe(proc.stdout, "bada_terminal_stdout"),
            stream_pipe(proc.stderr, "bada_terminal_stderr")
        )

        exit_code = await proc.wait()
        logger.info(f"[Bada-Terminal] Task {task_id} exited with code {exit_code}")
        PromptServer.instance.send_sync("bada_terminal_exit", {
            "task_id": task_id,
            "code": exit_code
        })
    except Exception as e:
        logger.error(f"[Bada-Terminal] Task {task_id} execution error: {e}")
        PromptServer.instance.send_sync("bada_terminal_stderr", {
            "task_id": task_id,
            "text": f"\r\n[Execution Error]: {str(e)}\r\n"
        })
        PromptServer.instance.send_sync("bada_terminal_exit", {
            "task_id": task_id,
            "code": -1
        })
    finally:
        ACTIVE_TERMINAL_TASKS.pop(task_id, None)


def kill_terminal_task(task_id):
    """
    Terminates active process including children on Windows.
    """
    proc = ACTIVE_TERMINAL_TASKS.get(task_id)
    if not proc:
        return False
    try:
        if os.name == "nt":
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
        else:
            proc.terminate()
        return True
    except Exception as e:
        logger.warning(f"[Bada-Terminal] Failed to kill task {task_id}: {e}")
        try:
            proc.kill()
        except Exception:
            pass
        return False


# =========================================================================
# 4. Master Route Registration
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

        # --- D. Terminal Hub API ---
        async def terminal_env_handler(request):
            try:
                env_data = detect_comfyui_environment()
                return web.json_response({"success": True, "data": env_data})
            except Exception as e:
                return web.json_response({"success": False, "error": str(e)}, status=500)

        async def terminal_browse_handler(request):
            try:
                target_path = request.query.get("path", "")
                subdirs = browse_subdirectories(target_path)
                return web.json_response({"success": True, "path": target_path, "subdirs": subdirs})
            except Exception as e:
                return web.json_response({"success": False, "error": str(e)}, status=500)

        async def terminal_exec_handler(request):
            try:
                body = await request.json()
                command = (body.get("command") or "").strip()
                cwd = (body.get("cwd") or "").strip()
                task_id = body.get("task_id") or f"task_{int(asyncio.get_event_loop().time() * 1000)}"

                if not command:
                    return web.json_response({"success": False, "error": "Command is required"}, status=400)

                asyncio.create_task(run_terminal_command(task_id, command, cwd))
                return web.json_response({
                    "success": True,
                    "task_id": task_id,
                    "message": "Command execution started"
                })
            except Exception as e:
                return web.json_response({"success": False, "error": str(e)}, status=500)

        async def terminal_kill_handler(request):
            try:
                body = await request.json()
                task_id = body.get("task_id")
                if not task_id:
                    return web.json_response({"success": False, "error": "task_id is required"}, status=400)

                killed = kill_terminal_task(task_id)
                return web.json_response({"success": True, "killed": killed})
            except Exception as e:
                return web.json_response({"success": False, "error": str(e)}, status=500)

        async def terminal_restart_handler(request):
            try:
                PromptServer.instance.send_sync("bada_comfyui_restarting", {"message": "Restarting ComfyUI..."})
                return web.json_response({"success": True, "message": "ComfyUI restart signaled"})
            except Exception as e:
                return web.json_response({"success": False, "error": str(e)}, status=500)

        async def terminal_open_cmd_handler(request):
            try:
                body = await request.json()
                cwd = (body.get("cwd") or "").strip()
                env_info = detect_comfyui_environment()
                effective_cwd = cwd if (cwd and os.path.exists(cwd)) else env_info["custom_nodes_root"]
                effective_cwd = os.path.realpath(effective_cwd)

                if os.name == "nt":
                    dir_name = os.path.basename(effective_cwd) or effective_cwd
                    cmd_str = f'start "Bada CMD - {dir_name}" cmd.exe'
                    subprocess.Popen(cmd_str, cwd=effective_cwd, shell=True)
                else:
                    subprocess.Popen(["x-terminal-emulator"], cwd=effective_cwd)

                return web.json_response({"success": True, "cwd": effective_cwd.replace("\\", "/")})
            except Exception as e:
                logger.error(f"[Bada-Terminal] Failed to open cmd: {e}")
                return web.json_response({"success": False, "error": str(e)}, status=500)

        routes.get("/api/bada/terminal/env")(terminal_env_handler)
        routes.get("/api/bada/terminal/browse")(terminal_browse_handler)
        routes.post("/api/bada/terminal/exec")(terminal_exec_handler)
        routes.post("/api/bada/terminal/kill")(terminal_kill_handler)
        routes.post("/api/bada/terminal/restart")(terminal_restart_handler)
        routes.post("/api/bada/terminal/open_cmd")(terminal_open_cmd_handler)

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
