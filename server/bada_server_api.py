"""
ComfyUI-Bada-Utils: Unified Backend REST API Routes
- Workflow Organization & File Management API (Tree, Content, Move, Mkdir, Delete, Favorites)
- Universal Presets Persistence API (load / save)
- Auto Model & LoRA Discovery API
"""

import os
import sys
import re
import shutil
import json
import logging
import asyncio
import subprocess
import time
import threading
import base64
import urllib.parse
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


def get_workflows_meta_file(root_dir):
    return os.path.join(root_dir, ".bada_meta.json")


def load_workflow_metadata(root_dir):
    meta_path = get_workflows_meta_file(root_dir)
    if os.path.isfile(meta_path):
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"[Bada-Utils] Failed to load workflow metadata: {e}")
    return {}


def save_workflow_metadata(root_dir, meta_data):
    meta_path = get_workflows_meta_file(root_dir)
    try:
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta_data, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        logger.error(f"[Bada-Utils] Failed to save workflow metadata: {e}")
        return False


def build_workflow_tree(root_dir):
    """
    Recursively scans the user workflows directory and builds a nested tree representation.
    Includes metadata (notes, thumbnail) for instant hover preview.
    """
    meta_data = load_workflow_metadata(root_dir)

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

        file_names_set = {e.name.lower() for e in entries if e.is_file()}

        for entry in entries:
            if entry.name.startswith("."):
                continue  # Skip hidden files like .index.json, .bada_meta.json
            entry_rel = os.path.join(rel_path, entry.name) if rel_path else entry.name

            if entry.is_dir():
                sub_node = scan_dir(entry.path, entry_rel)
                node["folders"].append(sub_node)
                node["count"] += sub_node["count"]
            elif entry.is_file():
                lower_name = entry.name.lower()
                # Skip companion thumbnail files from standalone workflow listing
                if lower_name.endswith((".thumb.png", ".thumb.jpg", ".thumb.webp", ".thumb.jpeg")):
                    continue

                if lower_name.endswith((".json", ".png")):
                    clean_name = os.path.splitext(entry.name)[0]
                    # If this is foo.png and foo.json exists in same folder, treat foo.png as companion image
                    if lower_name.endswith(".png") and (clean_name.lower() + ".json") in file_names_set:
                        continue

                    file_rel_path = entry_rel.replace("\\", "/")
                    norm_key = file_rel_path.lstrip("/")

                    item_meta = meta_data.get(norm_key) or meta_data.get(file_rel_path) or {}
                    notes = item_meta.get("notes", "")
                    thumbnail = item_meta.get("thumbnail", "")

                    # Auto-detect companion thumbnail if not explicitly in metadata
                    if not thumbnail:
                        for ext in [".thumb.png", ".thumb.webp", ".thumb.jpg", ".png", ".jpg", ".webp"]:
                            cand = clean_name + ext
                            if cand.lower() in file_names_set:
                                cand_rel = os.path.join(rel_path, cand) if rel_path else cand
                                thumbnail = cand_rel.replace("\\", "/")
                                break

                    node["files"].append({
                        "name": clean_name,
                        "filename": entry.name,
                        "path": file_rel_path,
                        "notes": notes,
                        "thumbnail": thumbnail,
                        "has_notes": bool(notes),
                        "has_thumbnail": bool(thumbnail)
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
    표준 카테고리뿐 아니라 시스템 및 서드파티 노드가 등록한 모든 모델 폴더(seedvr2, latent_upscale_models,
    toobusy_flashvsr, llm, sams, ultralytics 등)와 models 디렉토리 내의 실제 서브폴더들까지 동적으로 완전 수집합니다.
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
        "latent_upscale_models": "latent_upscale_models",
        "clip_vision": "clip_vision",
        "style_models": "style_models",
        "embeddings": "embeddings",
        "gligen": "gligen",
        "photomaker": "photomaker",
        "vae_approx": "vae_approx",
        "model_patches": "model_patches",
        "detection": "detection",
        "sams": "sams",
        "ultralytics": "ultralytics",
        "ipadapter": "ipadapter",
        "seedvr2": "seedvr2",
        "toobusy_flashvsr": "toobusy_flashvsr",
        "flashvsr": "flashvsr",
        "llm": "llm",
    }
    
    # 1. ComfyUI에 등록된 모든 folder_type 동적 수집
    if hasattr(folder_paths, "folder_names_and_paths"):
        for folder_type in folder_paths.folder_names_and_paths.keys():
            k_lower = str(folder_type).lower()
            if k_lower not in model_categories:
                model_categories[k_lower] = folder_type

    result = {}
    for key, folder_type in model_categories.items():
        try:
            files = folder_paths.get_filename_list(folder_type)
            if files:
                result[key] = list(files)
            elif key not in result:
                result[key] = []
        except Exception:
            if key not in result:
                result[key] = []

    # 2. models_dir 하위의 실제 서브폴더 직접 보완 스캔 (정션 및 서드파티 폴더 포함)
    try:
        model_extensions = {".safetensors", ".ckpt", ".pt", ".bin", ".pth", ".gguf", ".onnx"}
        models_base = getattr(folder_paths, "models_dir", None)
        if models_base and os.path.exists(models_base):
            for entry in os.listdir(models_base):
                sub_path = os.path.join(models_base, entry)
                if os.path.isdir(sub_path) and not entry.startswith((".", "_")):
                    entry_lower = entry.lower()
                    if not result.get(entry_lower):
                        scanned_files = []
                        for root, _, filenames in os.walk(sub_path):
                            for fname in filenames:
                                ext = os.path.splitext(fname)[1].lower()
                                if ext in model_extensions:
                                    rel = os.path.relpath(os.path.join(root, fname), sub_path)
                                    scanned_files.append(rel.replace("/", "\\"))
                        if scanned_files:
                            result[entry_lower] = scanned_files
                            if entry != entry_lower:
                                result[entry] = scanned_files
    except Exception as e:
        logger.warning(f"[Bada Server] Error scanning models_dir subfolders: {e}")
            
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
    # Prevent interactive Git GUI dialogs / CredentialHelperSelector popups on Windows
    sub_env["GIT_TERMINAL_PROMPT"] = "0"
    sub_env["GCM_INTERACTIVE"] = "never"
    sub_env["GIT_ASKPASS"] = ""
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
# 3.5. Missing Node Detective & Multi-Tier Repository Lookup Engine
# =========================================================================

CACHED_DETECTIVE_DB = None

def clean_node_key(s):
    """Normalizes string to alphanumeric lowercase (e.g. 'Power Lora Loader (rgthree)' -> 'powerloraloaderrgthree')"""
    if not s:
        return ""
    return re.sub(r"[^a-z0-9]", "", str(s).lower())

def get_detective_database():
    """
    Builds and caches a unified multi-tier custom node database from:
    1. *_extension-node-map.json (Exact node-to-repo classes: 40,000+ nodes)
    2. *_nodes.json (Modern ComfyUI Nodes 2.0 DB: 5,600+ packages with descriptions and downloads)
    3. *_custom-node-list.json (Manager channel list with nodename_pattern regex)
    """
    global CACHED_DETECTIVE_DB
    import glob

    # Collect search directories
    search_dirs = []
    try:
        user_dir = folder_paths.get_user_directory()
        if user_dir:
            search_dirs.append(os.path.join(user_dir, "__manager", "cache"))
    except Exception:
        pass

    try:
        base_dir = getattr(folder_paths, "base_path", None)
        if base_dir:
            search_dirs.append(os.path.join(base_dir, "user", "__manager", "cache"))
            search_dirs.append(os.path.join(base_dir, "custom_nodes", "ComfyUI-Manager"))
    except Exception:
        pass

    # StabilityMatrix packages discovery
    try:
        sm_packages_root = r"D:\StabilityMatrix\Data\Packages"
        if os.path.isdir(sm_packages_root):
            for pkg in os.listdir(sm_packages_root):
                cache_cand = os.path.join(sm_packages_root, pkg, "user", "__manager", "cache")
                if os.path.isdir(cache_cand) and cache_cand not in search_dirs:
                    search_dirs.append(cache_cand)
    except Exception:
        pass

    # Site-packages
    try:
        import comfyui_manager
        if hasattr(comfyui_manager, "__file__") and comfyui_manager.__file__:
            pkg_dir = os.path.dirname(comfyui_manager.__file__)
            if pkg_dir not in search_dirs:
                search_dirs.append(pkg_dir)
    except Exception:
        pass

    # Discover candidate files
    ext_map_files = []
    nodes_json_files = []
    cn_list_files = []
    stats_files = []

    for d in search_dirs:
        if not os.path.isdir(d):
            continue
        ext_map_files.extend(glob.glob(os.path.join(d, "*_extension-node-map.json")))
        ext_map_files.extend(glob.glob(os.path.join(d, "extension-node-map.json")))
        nodes_json_files.extend(glob.glob(os.path.join(d, "*_nodes.json")))
        cn_list_files.extend(glob.glob(os.path.join(d, "*_custom-node-list.json")))
        cn_list_files.extend(glob.glob(os.path.join(d, "custom-node-list.json")))
        stats_files.extend(glob.glob(os.path.join(d, "*_github-stats.json")))

    if not ext_map_files and not nodes_json_files and not cn_list_files:
        return None

    # Check latest mtime for cache invalidation
    all_files = ext_map_files + nodes_json_files + cn_list_files + stats_files
    latest_mtime = max(os.path.getmtime(f) for f in all_files) if all_files else 0

    if CACHED_DETECTIVE_DB and CACHED_DETECTIVE_DB[0] == latest_mtime:
        return CACHED_DETECTIVE_DB[1]

    logger.info("[Bada-Detective] Indexing comprehensive custom node database from manager caches...")

    exact_map = {}
    clean_map = {}
    tokens_map = {}
    patterns_list = []
    repo_meta = {}
    github_stars_map = {}

    # 0. Parse github-stats.json (stars & popularity metrics)
    if stats_files:
        try:
            latest_stats = max(stats_files, key=os.path.getmtime)
            with open(latest_stats, "r", encoding="utf-8", errors="replace") as f:
                stats_data = json.load(f)
                for repo_url, s_val in stats_data.items():
                    c_ref = repo_url.strip().rstrip("/").lower()
                    st = s_val.get("stars", 0) if isinstance(s_val, dict) else 0
                    github_stars_map[c_ref] = st
        except Exception as e:
            logger.debug(f"[Bada-Detective] github-stats parse note: {e}")

    # 1. Parse custom-node-list.json (metadata & nodename_pattern regex)
    if cn_list_files:
        try:
            latest_cn = max(cn_list_files, key=os.path.getmtime)
            with open(latest_cn, "r", encoding="utf-8", errors="replace") as f:
                cn_data = json.load(f)
                for item in cn_data.get("custom_nodes", []):
                    ref = item.get("reference", "").strip().rstrip("/")
                    if not ref:
                        continue
                    clean_ref = ref.lower()
                    stars = github_stars_map.get(clean_ref, 0)
                    repo_meta[clean_ref] = {
                        "title": item.get("title", ""),
                        "author": item.get("author", ""),
                        "description": item.get("description", ""),
                        "search_term": item.get("title", "") or os.path.basename(ref),
                        "repo": ref,
                        "stars": stars,
                        "downloads": 0,
                        "score": stars * 10
                    }
                    pat = item.get("nodename_pattern")
                    if pat:
                        try:
                            patterns_list.append((re.compile(pat, re.I), repo_meta[clean_ref]))
                        except Exception:
                            pass
        except Exception as e:
            logger.debug(f"[Bada-Detective] custom-node-list parse note: {e}")

    # 2. Parse nodes.json (Modern ComfyUI Nodes 2.0 DB: 5,600+ packages)
    if nodes_json_files:
        try:
            latest_nj = max(nodes_json_files, key=os.path.getmtime)
            with open(latest_nj, "r", encoding="utf-8", errors="replace") as f:
                nj_data = json.load(f)
                for item in nj_data.get("nodes", []):
                    repo = item.get("repository", "").strip()
                    if not repo:
                        continue
                    clean_ref = repo.rstrip("/").lower()
                    pkg_id = item.get("id", "").strip()
                    pkg_name = item.get("name", "").strip()
                    author = item.get("author") or (item.get("publisher") or {}).get("name", "")
                    desc = item.get("description", "")
                    title = pkg_name or pkg_id or os.path.basename(repo)
                    search_term = pkg_name or pkg_id or title
                    stars = item.get("github_stars", 0) or github_stars_map.get(clean_ref, 0)
                    downloads = item.get("downloads", 0)
                    score = downloads + stars * 10

                    pack_entry = {
                        "repo": repo,
                        "title": title,
                        "author": author,
                        "description": desc,
                        "search_term": search_term,
                        "stars": stars,
                        "downloads": downloads,
                        "score": score,
                        "source": "nodes.json"
                    }

                    if clean_ref not in repo_meta or not repo_meta[clean_ref].get("description"):
                        repo_meta[clean_ref] = pack_entry

                    # Index pkg id and name (with score comparison)
                    for k in [pkg_id, pkg_name]:
                        ck = clean_node_key(k)
                        if ck:
                            if ck not in clean_map or score > clean_map[ck].get("score", 0):
                                clean_map[ck] = pack_entry

                    # Tokenize description: extracts mentioned nodes like 'Nodes: PoseNode, PainterNode, DeepTranslatorTextNode'
                    desc_tokens = re.findall(r"\b[A-Za-z0-9_]{3,}\b", desc)
                    for tok in desc_tokens:
                        c_tok = clean_node_key(tok)
                        if len(c_tok) > 3:
                            if c_tok not in tokens_map or score > tokens_map[c_tok].get("score", 0):
                                tokens_map[c_tok] = pack_entry
        except Exception as e:
            logger.debug(f"[Bada-Detective] nodes.json parse note: {e}")

    # 3. Parse extension-node-map.json (Class level mapping: 40,000+ nodes)
    if ext_map_files:
        try:
            latest_ext = max(ext_map_files, key=os.path.getmtime)
            with open(latest_ext, "r", encoding="utf-8", errors="replace") as f:
                ext_data = json.load(f)
                for repo, info in ext_data.items():
                    if not isinstance(info, list) or len(info) == 0:
                        continue
                    nodes_list = info[0] if isinstance(info[0], list) else []
                    meta = info[1] if len(info) > 1 and isinstance(info[1], dict) else {}
                    title_aux = meta.get("title_aux") or meta.get("title") or os.path.basename(repo)

                    clean_ref = repo.strip().rstrip("/").lower()
                    parent_meta = repo_meta.get(clean_ref, {})
                    title = parent_meta.get("title") or title_aux
                    author = parent_meta.get("author", "")
                    desc = parent_meta.get("description", "")
                    search_term = parent_meta.get("search_term") or os.path.basename(repo) or title
                    stars = parent_meta.get("stars", 0) or github_stars_map.get(clean_ref, 0)
                    downloads = parent_meta.get("downloads", 0)
                    score = downloads + stars * 10

                    pack_info = {
                        "repo": repo,
                        "title": title,
                        "author": author,
                        "description": desc,
                        "search_term": search_term,
                        "stars": stars,
                        "downloads": downloads,
                        "score": score,
                        "source": "extension-node-map"
                    }

                    for n in nodes_list:
                        n_str = str(n).strip()
                        if not n_str:
                            continue
                        exact_key = n_str.lower()
                        clean_k = clean_node_key(n_str)
                        entry = dict(pack_info, node_name=n_str)

                        # Prefer package with higher popularity score
                        if exact_key not in exact_map or score > exact_map[exact_key].get("score", 0):
                            exact_map[exact_key] = entry
                        if clean_k not in clean_map or score > clean_map[clean_k].get("score", 0):
                            clean_map[clean_k] = entry
        except Exception as e:
            logger.warning(f"[Bada-Detective] Failed to parse extension-node-map: {e}")

    db = {
        "exact_map": exact_map,
        "clean_map": clean_map,
        "tokens_map": tokens_map,
        "patterns": patterns_list,
        "repo_meta": repo_meta
    }

    logger.info(f"[Bada-Detective] Database successfully built: {len(exact_map)} exact classes, {len(clean_map)} clean keys, {len(tokens_map)} description tokens, {len(patterns_list)} patterns.")
    CACHED_DETECTIVE_DB = (latest_mtime, db)
    return db


def lookup_node_repo(node_type, node_title=None):
    """
    Intelligently resolves any missing ComfyUI node to its official Manager registered repository.
    Supports:
    - Tier 1: Exact lowercase match
    - Tier 2: Clean alphanumeric match (removes spaces, symbols, underscores)
    - Tier 3: Parentheses/namespace extraction (e.g. 'Power Lora Loader (rgthree)' -> 'RgthreePowerLoraLoader')
    - Tier 4: Prefix & suffix stripping (e.g. 'Rgthree', 'was_', 'comfyui_', 'cui_', etc.)
    - Tier 5: Modern Nodes 2.0 DB description tokens (e.g. 'DeepTranslatorTextNode')
    - Tier 6: nodename_pattern regex matching
    """
    db = get_detective_database()
    if not db:
        return None

    exact_map = db["exact_map"]
    clean_map = db["clean_map"]
    tokens_map = db["tokens_map"]
    patterns = db["patterns"]

    candidates = []
    if node_type:
        candidates.append(str(node_type).strip())
    if node_title and str(node_title).strip() != str(node_type).strip():
        candidates.append(str(node_title).strip())

    for raw in candidates:
        if not raw:
            continue
        norm = raw.lower()
        c_key = clean_node_key(raw)

        # ─── Tier 1: Exact lowercase match ───
        if norm in exact_map:
            return exact_map[norm]

        # ─── Tier 2: Clean alphanumeric match ───
        if c_key in clean_map:
            return clean_map[c_key]

        # ─── Tier 3: Parentheses / Namespace decomposition ───
        # e.g. 'Power Lora Loader (rgthree)' -> base='Power Lora Loader', ns='rgthree'
        m = re.match(r"^(.*?)\s*[\(\[]([^\)\]]+)[\)\]]\s*$", raw)
        if m:
            base_str = m.group(1).strip()
            ns_str = m.group(2).strip()
            c_base = clean_node_key(base_str)
            c_ns = clean_node_key(ns_str)

            # Try combo 1: ns + base (e.g. rgthreepowerloraloader == RgthreePowerLoraLoader)
            combo_ns_base = clean_node_key(ns_str + base_str)
            if combo_ns_base in clean_map:
                return clean_map[combo_ns_base]

            # Try combo 2: base + ns (e.g. powerloraloaderrgthree)
            combo_base_ns = clean_node_key(base_str + ns_str)
            if combo_base_ns in clean_map:
                return clean_map[combo_base_ns]

            # Try pattern matching on raw string (e.g. 'KSampler (Inspire)' matches 'Inspire$' pattern)
            for regex, item in patterns:
                if regex.search(raw):
                    return {
                        "repo": item.get("repo") or item.get("reference", ""),
                        "title": item.get("title", ""),
                        "author": item.get("author", ""),
                        "description": item.get("description", ""),
                        "search_term": item.get("search_term") or item.get("title", ""),
                        "source": "nodename_pattern"
                    }

            # Try ns alone if ns refers to a known package (e.g. rgthree, inspire, was)
            if c_ns in clean_map and len(c_ns) >= 3:
                return clean_map[c_ns]

            # Try base alone (fallback if base is a unique custom node)
            if c_base in clean_map:
                return clean_map[c_base]
            if c_base in tokens_map:
                return tokens_map[c_base]

        # ─── Tier 4: Prefix & suffix stripping ───
        for prefix in ["rgthree", "was_", "was", "comfyui_", "comfyui", "comfy_", "cui_", "kj_", "kj", "impact_", "impact"]:
            clean_pref = clean_node_key(prefix)
            if c_key.startswith(clean_pref) and len(c_key) > len(clean_pref) + 2:
                sub = c_key[len(clean_pref):]
                if sub in clean_map:
                    return clean_map[sub]
                if sub in tokens_map:
                    return tokens_map[sub]

        for suffix in ["_node", "node", "_text", "text"]:
            clean_suf = clean_node_key(suffix)
            if c_key.endswith(clean_suf) and len(c_key) > len(clean_suf) + 3:
                sub = c_key[:-len(clean_suf)]
                if sub in clean_map:
                    return clean_map[sub]
                if sub in tokens_map:
                    return tokens_map[sub]

        # ─── Tier 5: Nodes 2.0 DB description tokens ───
        if c_key in tokens_map:
            return tokens_map[c_key]

        # ─── Tier 6: Manager regex nodename_pattern ───
        for regex, item in patterns:
            if regex.search(raw):
                return {
                    "repo": item.get("repo") or item.get("reference", ""),
                    "title": item.get("title", ""),
                    "author": item.get("author", ""),
                    "description": item.get("description", ""),
                    "search_term": item.get("search_term") or item.get("title", ""),
                    "source": "nodename_pattern"
                }

    return None


def install_custom_node_pack(repo_url, pack_title=None):
    """
    Safely installs a custom node repository into ComfyUI custom_nodes,
    and automatically executes pip install for requirements.txt if present.
    """
    if not repo_url or not repo_url.startswith("http"):
        return {"success": False, "error": "Invalid repository URL"}

    env_info = detect_comfyui_environment()
    custom_nodes_root = env_info["custom_nodes_root"]
    py_exec = sys.executable

    raw_name = repo_url.rstrip("/").split("/")[-1]
    if raw_name.endswith(".git"):
        raw_name = raw_name[:-4]

    target_dir = os.path.join(custom_nodes_root, raw_name)
    if os.path.exists(target_dir):
        return {
            "success": True,
            "already_installed": True,
            "target": raw_name,
            "message": f"'{raw_name}' is already installed in custom_nodes folder."
        }

    # 1. Run git clone
    clone_cmd = ["git", "clone", repo_url, target_dir]
    logger.info(f"[Bada-Installer] Cloning {repo_url} into {target_dir}...")
    git_env = os.environ.copy()
    git_env["GIT_TERMINAL_PROMPT"] = "0"
    git_env["GCM_INTERACTIVE"] = "never"
    git_env["GIT_ASKPASS"] = ""
    res = subprocess.run(clone_cmd, capture_output=True, text=True, env=git_env)
    if res.returncode != 0:
        logger.error(f"[Bada-Installer] Git clone failed: {res.stderr}")
        return {"success": False, "error": f"Git clone failed: {res.stderr or res.stdout}"}

    # 2. Check requirements.txt
    req_file = os.path.join(target_dir, "requirements.txt")
    req_installed = False
    if os.path.isfile(req_file):
        logger.info(f"[Bada-Installer] Installing dependencies from {req_file}...")
        pip_cmd = [py_exec, "-s", "-m", "pip", "install", "-r", req_file]
        pip_res = subprocess.run(pip_cmd, capture_output=True, text=True)
        if pip_res.returncode == 0:
            req_installed = True
        else:
            logger.warning(f"[Bada-Installer] pip install warnings/errors: {pip_res.stderr}")

    return {
        "success": True,
        "installed": True,
        "target": raw_name,
        "requirements_installed": req_installed,
        "message": f"'{raw_name}' successfully installed!"
    }


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

                # Reject path traversal patterns
                if ".." in source_rel or ".." in target_folder_rel or ".." in new_name:
                    return web.json_response({"success": False, "error": "Path traversal characters ('..') are forbidden"}, status=400)

                root_dir = get_workflows_root_dir()
                src_full = find_file_in_workflows(root_dir, source_rel)

                if not src_full or not os.path.isfile(src_full):
                    return web.json_response({"success": False, "error": f"Source file not found: {source_rel}"}, status=404)

                if not is_safe_path(root_dir, src_full):
                    return web.json_response({"success": False, "error": "Source path escapes workflows directory"}, status=403)

                clean_target_dir = target_folder_rel.replace("\\", "/").lstrip("/\\")
                dest_dir = os.path.abspath(os.path.join(root_dir, clean_target_dir))

                if not is_safe_path(root_dir, dest_dir):
                    return web.json_response({"success": False, "error": "Invalid target directory"}, status=403)

                # Sanitize file_name: enforce pure basename to prevent traversal
                raw_name = new_name if new_name else os.path.basename(src_full)
                file_name = os.path.basename(raw_name.replace("\\", "/"))
                if not file_name:
                    return web.json_response({"success": False, "error": "Invalid file name"}, status=400)

                if not file_name.endswith(".json") and not file_name.endswith(".png"):
                    file_name += ".json"

                dest_full = os.path.realpath(os.path.abspath(os.path.join(dest_dir, file_name)))

                # Strict containment check on final destination file path
                if not is_safe_path(root_dir, dest_full) or not is_safe_path(dest_dir, dest_full):
                    return web.json_response({"success": False, "error": "Destination file path escapes workflows directory"}, status=403)

                os.makedirs(dest_dir, exist_ok=True)

                # Move file
                shutil.move(src_full, dest_full)
                new_rel_path = "/" + os.path.relpath(dest_full, root_dir).replace("\\", "/")

                # Companion thumbnail and metadata migration
                try:
                    src_base = os.path.splitext(src_full)[0]
                    dest_base = os.path.splitext(dest_full)[0]
                    for thumb_ext in [".thumb.png", ".thumb.webp", ".thumb.jpg"]:
                        src_thumb = src_base + thumb_ext
                        if os.path.isfile(src_thumb):
                            dest_thumb = dest_base + thumb_ext
                            shutil.move(src_thumb, dest_thumb)

                    src_rel_key = os.path.relpath(src_full, root_dir).replace("\\", "/").lstrip("/")
                    dest_rel_key = os.path.relpath(dest_full, root_dir).replace("\\", "/").lstrip("/")
                    meta = load_workflow_metadata(root_dir)
                    if src_rel_key in meta:
                        entry = meta.pop(src_rel_key)
                        if entry.get("thumbnail"):
                            for thumb_ext in [".thumb.png", ".thumb.webp", ".thumb.jpg"]:
                                if entry["thumbnail"].endswith(thumb_ext):
                                    entry["thumbnail"] = os.path.splitext(dest_rel_key)[0] + thumb_ext
                        meta[dest_rel_key] = entry
                        save_workflow_metadata(root_dir, meta)
                except Exception as meta_e:
                    logger.warning(f"[Bada-Utils] Metadata migration warning on move: {meta_e}")

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

                if ".." in folder_name or ".." in parent_rel:
                    return web.json_response({"success": False, "error": "Path traversal characters ('..') are forbidden"}, status=400)

                clean_folder = os.path.basename(folder_name.replace("\\", "/"))
                if not clean_folder:
                    return web.json_response({"success": False, "error": "Invalid folder name"}, status=400)

                root_dir = get_workflows_root_dir()
                clean_parent = parent_rel.replace("\\", "/").lstrip("/\\")
                target_dir = os.path.realpath(os.path.abspath(os.path.join(root_dir, clean_parent, clean_folder)))

                if not is_safe_path(root_dir, target_dir):
                    return web.json_response({"success": False, "error": "Invalid folder path"}, status=403)

                os.makedirs(target_dir, exist_ok=True)
                rel_path = "/" + os.path.relpath(target_dir, root_dir).replace("\\", "/")
                return web.json_response({"success": True, "message": f"Folder '{clean_folder}' created", "path": rel_path})
            except Exception as e:
                return web.json_response({"success": False, "error": str(e)}, status=500)

        async def delete_workflow_handler(request):
            try:
                body = await request.json()
                target_rel = (body.get("target_path") or body.get("path") or "").strip()

                if not target_rel:
                    return web.json_response({"success": False, "error": "Target path is required"}, status=400)

                if ".." in target_rel:
                    return web.json_response({"success": False, "error": "Path traversal characters ('..') are forbidden"}, status=400)

                root_dir = get_workflows_root_dir()
                clean_rel = target_rel.replace("\\", "/").lstrip("/\\")
                target_full = os.path.realpath(os.path.abspath(os.path.join(root_dir, clean_rel)))

                if not is_safe_path(root_dir, target_full):
                    return web.json_response({"success": False, "error": "Invalid path"}, status=403)

                def cleanup_companion_and_meta(file_path):
                    try:
                        base = os.path.splitext(file_path)[0]
                        for thumb_ext in [".thumb.png", ".thumb.webp", ".thumb.jpg"]:
                            thumb_cand = base + thumb_ext
                            if os.path.isfile(thumb_cand):
                                os.remove(thumb_cand)
                        clean_k = os.path.relpath(file_path, root_dir).replace("\\", "/").lstrip("/")
                        meta = load_workflow_metadata(root_dir)
                        if clean_k in meta:
                            meta.pop(clean_k, None)
                            save_workflow_metadata(root_dir, meta)
                    except Exception as me:
                        logger.warning(f"[Bada-Utils] Metadata delete cleanup error: {me}")

                if os.path.isdir(target_full):
                    shutil.rmtree(target_full)
                    return web.json_response({"success": True, "message": f"Folder '{clean_rel}' deleted"})
                elif os.path.isfile(target_full):
                    cleanup_companion_and_meta(target_full)
                    os.remove(target_full)
                    return web.json_response({"success": True, "message": f"File '{clean_rel}' deleted"})
                else:
                    found = find_file_in_workflows(root_dir, clean_rel)
                    if found and os.path.isfile(found) and is_safe_path(root_dir, found):
                        cleanup_companion_and_meta(found)
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

        # --- Workflow Metadata & Thumbnail Handlers ---
        async def get_workflow_metadata_handler(request):
            try:
                root_dir = get_workflows_root_dir()
                meta_data = load_workflow_metadata(root_dir)
                target_path = request.query.get("path", "").strip().replace("\\", "/").lstrip("/")
                if target_path:
                    item_meta = meta_data.get(target_path, {})
                    if not item_meta.get("thumbnail"):
                        full_file = find_file_in_workflows(root_dir, target_path)
                        if full_file:
                            base_no_ext = os.path.splitext(full_file)[0]
                            for ext in [".thumb.png", ".thumb.webp", ".thumb.jpg", ".png", ".jpg", ".webp"]:
                                cand = base_no_ext + ext
                                if os.path.isfile(cand) and cand != full_file:
                                    rel = os.path.relpath(cand, root_dir).replace("\\", "/")
                                    item_meta["thumbnail"] = rel
                                    break
                    return web.json_response({"success": True, "path": target_path, "data": item_meta})
                return web.json_response({"success": True, "metadata": meta_data})
            except Exception as e:
                logger.error(f"[Bada-Utils] get_workflow_metadata_handler error: {e}")
                return web.json_response({"success": False, "error": str(e)}, status=500)

        async def save_workflow_metadata_handler(request):
            try:
                body = await request.json()
                raw_path = (body.get("path") or "").strip().replace("\\", "/").lstrip("/")
                if not raw_path:
                    return web.json_response({"success": False, "error": "Workflow path is required"}, status=400)
                if ".." in raw_path:
                    return web.json_response({"success": False, "error": "Path traversal forbidden"}, status=400)

                root_dir = get_workflows_root_dir()
                meta_data = load_workflow_metadata(root_dir)

                current_entry = meta_data.get(raw_path, {})
                if "notes" in body:
                    current_entry["notes"] = str(body.get("notes") or "").strip()
                if "thumbnail" in body:
                    current_entry["thumbnail"] = str(body.get("thumbnail") or "").strip()
                current_entry["updated_at"] = time.time()

                meta_data[raw_path] = current_entry
                save_workflow_metadata(root_dir, meta_data)

                return web.json_response({"success": True, "data": current_entry})
            except Exception as e:
                logger.error(f"[Bada-Utils] save_workflow_metadata_handler error: {e}")
                return web.json_response({"success": False, "error": str(e)}, status=500)

        async def upload_thumbnail_handler(request):
            try:
                root_dir = get_workflows_root_dir()
                raw_path = ""
                image_bytes = None

                if request.content_type.startswith("multipart/"):
                    reader = await request.multipart()
                    while True:
                        part = await reader.next()
                        if part is None:
                            break
                        if part.name == "path":
                            raw_path = (await part.text()).strip()
                        elif part.name in ["file", "image"]:
                            image_bytes = await part.read()
                else:
                    body = await request.json()
                    raw_path = (body.get("path") or "").strip()
                    img_data = body.get("image_base64") or body.get("image") or ""
                    if img_data:
                        if "," in img_data:
                            img_data = img_data.split(",", 1)[1]
                        image_bytes = base64.b64decode(img_data)

                raw_path = raw_path.replace("\\", "/").lstrip("/")
                if not raw_path:
                    return web.json_response({"success": False, "error": "Workflow path is required"}, status=400)
                if ".." in raw_path:
                    return web.json_response({"success": False, "error": "Path traversal forbidden"}, status=400)
                if not image_bytes:
                    return web.json_response({"success": False, "error": "No image data provided"}, status=400)

                wf_full = find_file_in_workflows(root_dir, raw_path)
                if not wf_full or not os.path.isfile(wf_full):
                    wf_full = os.path.realpath(os.path.abspath(os.path.join(root_dir, raw_path)))
                    if not is_safe_path(root_dir, wf_full):
                        return web.json_response({"success": False, "error": "Invalid workflow path"}, status=400)

                target_dir = os.path.dirname(wf_full)
                base_no_ext = os.path.splitext(os.path.basename(wf_full))[0]
                thumb_filename = f"{base_no_ext}.thumb.png"
                thumb_full = os.path.join(target_dir, thumb_filename)

                if not is_safe_path(root_dir, thumb_full):
                    return web.json_response({"success": False, "error": "Invalid thumbnail destination"}, status=403)

                with open(thumb_full, "wb") as f:
                    f.write(image_bytes)

                thumb_rel = os.path.relpath(thumb_full, root_dir).replace("\\", "/")

                # Auto-update metadata
                meta_data = load_workflow_metadata(root_dir)
                entry = meta_data.get(raw_path, {})
                entry["thumbnail"] = thumb_rel
                entry["updated_at"] = time.time()
                meta_data[raw_path] = entry
                save_workflow_metadata(root_dir, meta_data)

                thumb_url = f"/api/bada/workflows/thumbnail?path={urllib.parse.quote(thumb_rel)}&t={int(time.time())}"
                return web.json_response({
                    "success": True,
                    "thumbnail": thumb_rel,
                    "thumbnail_url": thumb_url
                })
            except Exception as e:
                logger.error(f"[Bada-Utils] upload_thumbnail_handler error: {e}")
                return web.json_response({"success": False, "error": str(e)}, status=500)

        async def get_thumbnail_handler(request):
            try:
                target_path = request.query.get("path", "").strip()
                if not target_path:
                    return web.json_response({"success": False, "error": "Path parameter required"}, status=400)
                if ".." in target_path:
                    return web.json_response({"success": False, "error": "Path traversal forbidden"}, status=400)

                root_dir = get_workflows_root_dir()
                full_path = find_file_in_workflows(root_dir, target_path)
                if not full_path or not os.path.isfile(full_path):
                    clean_rel = target_path.replace("\\", "/").lstrip("/\\")
                    cand = os.path.realpath(os.path.abspath(os.path.join(root_dir, clean_rel)))
                    if os.path.isfile(cand) and is_safe_path(root_dir, cand):
                        full_path = cand

                if not full_path or not os.path.isfile(full_path) or not is_safe_path(root_dir, full_path):
                    return web.json_response({"success": False, "error": "Thumbnail file not found"}, status=404)

                ext = os.path.splitext(full_path)[1].lower()
                content_type = "image/png"
                if ext in [".jpg", ".jpeg"]:
                    content_type = "image/jpeg"
                elif ext == ".webp":
                    content_type = "image/webp"

                return web.FileResponse(full_path, headers={
                    "Content-Type": content_type,
                    "Cache-Control": "public, max-age=3600"
                })
            except Exception as e:
                return web.json_response({"success": False, "error": str(e)}, status=500)

        routes.get("/api/bada/workflows/folders")(list_folders_handler)
        routes.post("/api/bada/workflows/move")(move_workflow_handler)
        routes.post("/api/bada/workflows/mkdir")(create_folder_handler)
        routes.post("/api/bada/workflows/create_folder")(create_folder_handler)
        routes.post("/api/bada/workflows/delete")(delete_workflow_handler)
        routes.get("/api/bada/workflows/favorites")(favorites_handler)
        routes.post("/api/bada/workflows/favorites")(favorites_handler)

        routes.get("/api/bada/workflows/metadata")(get_workflow_metadata_handler)
        routes.post("/api/bada/workflows/metadata")(save_workflow_metadata_handler)
        routes.post("/api/bada/workflows/thumbnail/upload")(upload_thumbnail_handler)
        routes.get("/api/bada/workflows/thumbnail")(get_thumbnail_handler)

        routes.get("/api/qol/workflows/metadata")(get_workflow_metadata_handler)
        routes.post("/api/qol/workflows/metadata")(save_workflow_metadata_handler)
        routes.post("/api/qol/workflows/thumbnail/upload")(upload_thumbnail_handler)
        routes.get("/api/qol/workflows/thumbnail")(get_thumbnail_handler)

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

                def execute_restart_worker():
                    time.sleep(0.8)
                    try:
                        try:
                            sys.stdout.flush()
                            sys.stderr.flush()
                            if hasattr(sys.stdout, "close_log"):
                                sys.stdout.close_log()
                        except Exception:
                            pass

                        # 1. Comfy-CLI session support
                        if "__COMFY_CLI_SESSION__" in os.environ:
                            reboot_file = os.path.join(os.environ["__COMFY_CLI_SESSION__"] + ".reboot")
                            with open(reboot_file, "w"):
                                pass
                            print("\n[ComfyUI-Bada-Utils] Signaling reboot to comfy-cli...\n", flush=True)
                            os._exit(0)

                        # 2. Reconstruct launch arguments
                        sys_argv = sys.argv.copy()
                        if "--windows-standalone-build" in sys_argv:
                            sys_argv.remove("--windows-standalone-build")

                        if sys_argv[0].endswith("__main__.py"):
                            module_name = os.path.basename(os.path.dirname(sys_argv[0]))
                            cmds = [sys.executable, "-m", module_name] + sys_argv[1:]
                        elif sys.platform.startswith("win32"):
                            cmds = ['"' + sys.executable + '"', '"' + sys_argv[0] + '"'] + sys_argv[1:]
                        else:
                            cmds = [sys.executable] + sys_argv

                        print(f"\n[ComfyUI-Bada-Utils] 🔄 Restarting ComfyUI server: {cmds}\n", flush=True)
                        os.execv(sys.executable, cmds)
                    except Exception as err:
                        logger.error(f"[ComfyUI-Bada-Utils] os.execv restart failed: {err}. Attempting subprocess fallback...")
                        try:
                            clean_cmds = [sys.executable, sys.argv[0]] + sys_argv[1:]
                            subprocess.Popen(clean_cmds, cwd=getattr(folder_paths, "base_path", None), shell=False)
                            os._exit(0)
                        except Exception as err2:
                            logger.error(f"[ComfyUI-Bada-Utils] Subprocess fallback failed: {err2}")

                threading.Thread(target=execute_restart_worker, daemon=True).start()
                return web.json_response({"success": True, "message": "ComfyUI restart initiated"})
            except Exception as e:
                logger.error(f"[ComfyUI-Bada-Utils] Failed to initiate restart: {e}")
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

        # --- E. Missing Node Detective API ---
        async def missing_node_lookup_handler(request):
            try:
                node_type = request.query.get("type", "").strip()
                node_title = request.query.get("title", "").strip()
                if not node_type and not node_title:
                    return web.json_response({"success": False, "error": "Missing node type parameter"}, status=400)

                match = lookup_node_repo(node_type, node_title)
                if match:
                    return web.json_response({
                        "success": True,
                        "found": True,
                        "repo": match.get("repo", ""),
                        "title": match.get("title", ""),
                        "author": match.get("author", ""),
                        "description": match.get("description", ""),
                        "node_name": match.get("node_name", node_type),
                        "type": node_type,
                        "search_term": match.get("search_term") or match.get("title", "")
                    })
                else:
                    return web.json_response({
                        "success": True,
                        "found": False,
                        "type": node_type,
                        "title": node_title
                    })
            except Exception as e:
                logger.error(f"[Bada-Detective] Lookup error: {e}")
                return web.json_response({"success": False, "error": str(e)}, status=500)

        routes.get("/api/bada/missing-node/lookup")(missing_node_lookup_handler)

        async def customnode_install_handler(request):
            try:
                body = await request.json()
                repo = (body.get("repo") or "").strip()
                title = (body.get("title") or "").strip()
                if not repo:
                    return web.json_response({"success": False, "error": "Repo URL is required"}, status=400)

                loop = asyncio.get_event_loop()
                result = await loop.run_in_executor(None, install_custom_node_pack, repo, title)
                return web.json_response(result)
            except Exception as e:
                logger.error(f"[Bada-Installer] Install error: {e}")
                return web.json_response({"success": False, "error": str(e)}, status=500)

        routes.post("/api/bada/customnode/install")(customnode_install_handler)

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
