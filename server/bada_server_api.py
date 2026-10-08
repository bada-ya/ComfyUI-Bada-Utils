"""
ComfyUI-Bada-Utils: Unified Backend REST API Routes
- Workflow Organization & File Management API (Tree, Content, Move, Mkdir, Delete, Favorites)
- Universal Presets Persistence API (load / save)
- Auto Model & LoRA Discovery API
"""

import asyncio
import os
import sys
import re
import shutil
import json
import logging
import base64
import html
import time
import urllib.parse
import urllib.request
from aiohttp import web
from server import PromptServer
import folder_paths
from . import gdrive_sync
from ..translation_runtime import (
    TRANSLATION_ATTEMPT_TIMEOUT_SECONDS,
    TRANSLATION_TIMEOUT_SECONDS,
    submit_translation,
)

logger = logging.getLogger("ComfyUI-Bada-Utils")

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(CURRENT_DIR)
PRESETS_FILE = os.path.join(PARENT_DIR, "presets_data.json")
FAVORITES_FILE = os.path.join(PARENT_DIR, "favorites_data.json")


def get_node_version():
    """Reads node version from pyproject.toml."""
    try:
        pyproject_path = os.path.join(PARENT_DIR, "pyproject.toml")
        if os.path.exists(pyproject_path):
            with open(pyproject_path, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip().startswith("version"):
                        parts = line.split("=")
                        if len(parts) >= 2:
                            return parts[1].strip().strip('"\'')
    except Exception as e:
        logger.warning(f"[Bada-Utils] get_node_version error: {e}")
    return "1.0.3"


def get_cloud_sync_details():
    """Returns metadata and accurate counts of synced node configuration & workflow items."""
    details = {
        "workflows_count": 0,
        "presets_count": 0,
        "regional_presets_count": 0,
        "gemini_chats_count": 0,
        "promptgen_count": 0,
        "favorites_count": 0,
        "last_sync": "N/A"
    }
    
    # 1. Workflows (.json) Count (Local scan + .gdrive_manifest.json check)
    try:
        workflows_dir = get_workflows_root_dir()
        if os.path.exists(workflows_dir):
            wf_cnt = 0
            for root, _, files in os.walk(workflows_dir):
                for filename in files:
                    if filename.endswith('.json') and not filename.startswith('.'):
                        wf_cnt += 1
            
            manifest_cache = os.path.join(workflows_dir, ".gdrive_manifest.json")
            if os.path.exists(manifest_cache):
                try:
                    with open(manifest_cache, "r", encoding="utf-8") as f:
                        mdata = json.load(f)
                        if isinstance(mdata, dict):
                            gdrive_wfs = sum(1 for k in mdata.keys() if not k.startswith(".configs/") and not k.startswith("."))
                            if gdrive_wfs > wf_cnt:
                                wf_cnt = gdrive_wfs
                except Exception:
                    pass

            details["workflows_count"] = wf_cnt
    except Exception as e:
        logger.warning(f"[Bada-Utils] Failed to count workflows: {e}")

    # 2. presets_data.json (Sum of all presets in category lists & BadaRegionalPrompt presets)
    try:
        if os.path.exists(PRESETS_FILE):
            with open(PRESETS_FILE, "r", encoding="utf-8") as f:
                pdata = json.load(f)
                if isinstance(pdata, dict):
                    total_presets = 0
                    regional_presets = 0
                    for k, val in pdata.items():
                        c_cnt = 0
                        if isinstance(val, list):
                            c_cnt = len(val)
                        elif isinstance(val, dict):
                            c_cnt = len(val)
                        else:
                            c_cnt = 1
                        total_presets += c_cnt
                        if "regional" in k.lower() or "badaregional" in k.lower():
                            regional_presets += c_cnt
                    details["presets_count"] = total_presets
                    details["regional_presets_count"] = regional_presets
                elif isinstance(pdata, list):
                    details["presets_count"] = len(pdata)
    except Exception as e:
        logger.warning(f"[Bada-Utils] Failed to count presets: {e}")

    # 3. gemini_chat_history.json & config.json (Gemini chats)
    try:
        chat_hist_file = os.path.join(PARENT_DIR, "gemini_chat_history.json")
        if os.path.exists(chat_hist_file):
            with open(chat_hist_file, "r", encoding="utf-8") as f:
                hdata = json.load(f)
                chats = hdata.get("chats") if isinstance(hdata, dict) else hdata
                if isinstance(chats, list):
                    details["gemini_chats_count"] = len(chats)
        else:
            cfg_file = os.path.join(PARENT_DIR, "config.json")
            if os.path.exists(cfg_file):
                with open(cfg_file, "r", encoding="utf-8") as f:
                    cdata = json.load(f)
                    chats = cdata.get("chats") or cdata.get("gemini_chats") or cdata.get("history") or []
                    if isinstance(chats, (dict, list)):
                        details["gemini_chats_count"] = len(chats)
    except Exception:
        pass

    # 4. engines_registry.json
    try:
        reg_file = os.path.join(PARENT_DIR, "engines_registry.json")
        if os.path.exists(reg_file):
            with open(reg_file, "r", encoding="utf-8") as f:
                rdata = json.load(f)
                uprompts = rdata.get("user_prompts") or {}
                official_prompts = rdata.get("official_prompts") or {}
                u_len = len(uprompts) if isinstance(uprompts, (dict, list)) else 0
                o_len = len(official_prompts) if isinstance(official_prompts, (dict, list)) else 0
                details["promptgen_count"] = u_len + o_len
    except Exception:
        pass

    # 5. favorites_data.json & native ComfyUI .index.json
    try:
        fav_set = set()
        if os.path.exists(FAVORITES_FILE):
            try:
                with open(FAVORITES_FILE, "r", encoding="utf-8") as f:
                    fdata = json.load(f)
                    if isinstance(fdata, list):
                        fav_set.update(fdata)
            except Exception:
                pass

        try:
            workflows_dir = get_workflows_root_dir()
            idx_file = os.path.join(workflows_dir, ".index.json")
            if os.path.exists(idx_file):
                with open(idx_file, "r", encoding="utf-8") as f:
                    idata = json.load(f)
                    if isinstance(idata, dict) and isinstance(idata.get("favorites"), list):
                        fav_set.update(idata.get("favorites"))
        except Exception:
            pass

        # Filter favorites to only count files that actually exist on disk
        valid_favs = set()
        workflows_dir = get_workflows_root_dir()
        for fav_item in fav_set:
            if not isinstance(fav_item, str):
                continue
            clean_item = fav_item.replace("workflows/", "").replace("\\", "/").lstrip("/")
            full_path = os.path.join(workflows_dir, clean_item)
            if os.path.isfile(full_path):
                valid_favs.add(clean_item)
            else:
                cand = find_file_in_workflows(workflows_dir, clean_item)
                if cand and os.path.isfile(cand):
                    rel_cand = os.path.relpath(cand, workflows_dir).replace("\\", "/")
                    valid_favs.add(rel_cand)

        # Auto-sync favorites_data.json if we found native favorites
        if valid_favs:
            try:
                with open(FAVORITES_FILE, "w", encoding="utf-8") as f:
                    json.dump(sorted(list(valid_favs)), f, ensure_ascii=False, indent=2)
            except Exception:
                pass

        details["favorites_count"] = len(valid_favs)
    except Exception:
        pass

    # 6. Last sync mtime from .gdrive_manifest.json
    try:
        workflows_dir = get_workflows_root_dir()
        manifest_cache = os.path.join(workflows_dir, ".gdrive_manifest.json")
        if os.path.exists(manifest_cache):
            stat = os.stat(manifest_cache)
            details["last_sync"] = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(stat.st_mtime))
    except Exception:
        pass

    return details





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


def remove_companion_thumbnail(root_dir, rel_wf_path):
    """Safely delete companion thumbnail file associated with a workflow."""
    try:
        wf_full = find_file_in_workflows(root_dir, rel_wf_path)
        if not wf_full:
            clean_rel = rel_wf_path.replace("\\", "/").lstrip("/\\")
            wf_full = os.path.realpath(os.path.abspath(os.path.join(root_dir, clean_rel)))
        if wf_full and os.path.exists(wf_full):
            target_dir = os.path.dirname(wf_full)
            base_no_ext = os.path.splitext(os.path.basename(wf_full))[0]
            for ext in [".thumb.png", ".thumb.webp", ".thumb.jpg", ".thumb.jpeg"]:
                thumb_cand = os.path.join(target_dir, f"{base_no_ext}{ext}")
                if os.path.isfile(thumb_cand) and is_safe_path(root_dir, thumb_cand):
                    try:
                        os.remove(thumb_cand)
                        logger.info(f"[Bada-Utils] Removed companion thumbnail: {thumb_cand}")
                    except Exception as fe:
                        logger.warning(f"[Bada-Utils] Could not remove thumbnail {thumb_cand}: {fe}")
    except Exception as e:
        logger.warning(f"[Bada-Utils] remove_companion_thumbnail error for {rel_wf_path}: {e}")


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
                    thumbnail = item_meta.get("thumbnail", None)

                    # Auto-detect companion thumbnail ONLY if not explicitly specified in metadata
                    if thumbnail is None:
                        for ext in [".thumb.png", ".thumb.webp", ".thumb.jpg", ".png", ".jpg", ".webp"]:
                            cand = clean_name + ext
                            if cand.lower() in file_names_set:
                                cand_rel = os.path.join(rel_path, cand) if rel_path else cand
                                thumbnail = cand_rel.replace("\\", "/")
                                break
                    if thumbnail is None:
                        thumbnail = ""

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

        # --- A-2. Format-Preserving Translation API ---
        async def translate_handler(request):
            try:
                body = await request.json()
                text = body.get("text", "")
                target_lang = body.get("target_lang", "ko")
                source_lang = body.get("source_lang", "auto")

                if not text or not text.strip():
                    return web.json_response({"success": True, "translated_text": text})

                protected_items = []
                def protect_match(match):
                    idx = len(protected_items)
                    protected_items.append(match.group(0))
                    return f"__BADA_PROT_{idx}__"

                patterns = [
                    r'```[\s\S]*?```',                           # Code blocks
                    r'`[^`\n]+`',                                 # Inline code
                    r'https?://[^\s)]+',                          # URLs
                    r'\[([^\]]+)\]\(([^)]+)\)',                   # Markdown links
                    r'^[│├└─┃┣┗━+|]{2,}.*$',                      # ASCII tree / box art lines
                    r'\|?\s*:?-+:?\s*\|.*',                       # Markdown table headers/dividers
                    r'\b[\w.-]+(?:/[\w.-]+)+\b'                   # File & Directory paths
                ]

                protected_text = text
                for pat in patterns:
                    protected_text = re.sub(pat, protect_match, protected_text, flags=re.MULTILINE)

                headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
                    "Referer": "https://translate.google.com/",
                }

                strategies = [
                    (
                        "https://translate.googleapis.com/translate_a/single",
                        {"client": "dict-chrome-ex", "sl": source_lang, "tl": target_lang, "dt": "t", "q": protected_text},
                    ),
                    (
                        "https://clients5.google.com/translate_a/t",
                        {"client": "dict-chrome-ex", "sl": source_lang, "tl": target_lang, "q": protected_text},
                    ),
                    (
                        "https://translate.googleapis.com/translate_a/single",
                        {"client": "gtx", "sl": source_lang, "tl": target_lang, "dt": "t", "q": protected_text},
                    ),
                    (
                        "https://translate.google.com/translate_a/single",
                        {"client": "gtx", "sl": source_lang, "tl": target_lang, "dt": "t", "q": protected_text},
                    ),
                ]

                deadline = time.monotonic() + TRANSLATION_TIMEOUT_SECONDS

                def fetch_translation_with_failover():
                    direct_opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
                    last_err = None
                    for base_url, params in strategies:
                        remaining = deadline - time.monotonic()
                        if remaining <= 0:
                            raise TimeoutError("Translation exceeded the 20-second overall timeout")
                        try:
                            url = f"{base_url}?{urllib.parse.urlencode(params)}"
                            req = urllib.request.Request(url, headers=headers)
                            with direct_opener.open(
                                req,
                                timeout=min(TRANSLATION_ATTEMPT_TIMEOUT_SECONDS, remaining),
                            ) as response:
                                raw_bytes = response.read()
                                res_json = json.loads(raw_bytes.decode('utf-8'))
                                chunks = []
                                if isinstance(res_json, list) and len(res_json) > 0:
                                    if isinstance(res_json[0], list) and len(res_json[0]) > 0 and isinstance(res_json[0][0], list):
                                        for item in res_json[0]:
                                            if item and isinstance(item, list) and len(item) > 0 and item[0]:
                                                chunks.append(item[0])
                                        return "".join(chunks)
                                    elif isinstance(res_json[0], str):
                                        return "".join([c for c in res_json if isinstance(c, str)])
                        except Exception as err:
                            last_err = err
                            logger.warning(f"[Bada-Utils] Note Helper translate endpoint {base_url} ({params.get('client')}) failover: {err}")
                            continue
                    if time.monotonic() >= deadline:
                        raise TimeoutError("Translation exceeded the 20-second overall timeout")
                    if last_err:
                        raise last_err
                    return protected_text

                future = submit_translation(fetch_translation_with_failover)
                if future is None:
                    return web.json_response({
                        "success": False,
                        "error": "번역 요청이 많습니다. 잠시 후 다시 시도해 주세요.",
                    }, status=429)
                try:
                    raw_translated = await asyncio.wait_for(
                        asyncio.wrap_future(future),
                        timeout=TRANSLATION_TIMEOUT_SECONDS,
                    )
                except asyncio.TimeoutError:
                    future.cancel()
                    return web.json_response({
                        "success": False,
                        "error": "번역 시간이 20초를 초과했습니다. 잠시 후 다시 시도해 주세요.",
                    }, status=504)
                except TimeoutError:
                    return web.json_response({
                        "success": False,
                        "error": "번역 시간이 20초를 초과했습니다. 잠시 후 다시 시도해 주세요.",
                    }, status=504)
                translated_text = html.unescape(raw_translated) if raw_translated else protected_text

                def restore_match(match):
                    try:
                        idx = int(match.group(1))
                        if 0 <= idx < len(protected_items):
                            return protected_items[idx]
                    except Exception:
                        pass
                    return match.group(0)

                restored_text = re.sub(r'__\s*(?:BADA|bada)\s*_\s*(?:PROT|prot)\s*_\s*(\d+)\s*__', restore_match, translated_text)

                return web.json_response({"success": True, "translated_text": restored_text})
            except Exception as e:
                logger.error(f"[Bada-Utils] Translation error: {e}")
                return web.json_response({"success": False, "error": str(e)}, status=500)

        routes.post("/api/bada/translate")(translate_handler)

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
                    if os.path.realpath(target_full) == os.path.realpath(root_dir):
                        return web.json_response({"success": False, "error": "Cannot delete the workflow root directory"}, status=403)
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
                    thumb_val = str(body.get("thumbnail") or "").strip()
                    current_entry["thumbnail"] = thumb_val
                    if not thumb_val or body.get("delete_thumbnail") is True:
                        remove_companion_thumbnail(root_dir, raw_path)
                elif body.get("delete_thumbnail") is True:
                    current_entry["thumbnail"] = ""
                    remove_companion_thumbnail(root_dir, raw_path)

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
                max_upload_bytes = 50 * 1024 * 1024
                max_json_bytes = ((max_upload_bytes + 2) // 3) * 4 + 128 * 1024
                is_multipart = request.content_type.startswith("multipart/")
                request_limit = max_upload_bytes + 128 * 1024 if is_multipart else max_json_bytes

                if request.content_length is not None and request.content_length > request_limit:
                    raise web.HTTPRequestEntityTooLarge(max_size=request_limit, actual_size=request.content_length)

                if is_multipart:
                    reader = await request.multipart()
                    while True:
                        part = await reader.next()
                        if part is None:
                            break
                        if part.name == "path":
                            raw_path = (await part.text()).strip()
                        elif part.name in ["file", "image"]:
                            chunks = []
                            part_size = 0
                            while True:
                                chunk = await part.read_chunk(size=64 * 1024)
                                if not chunk:
                                    break
                                part_size += len(chunk)
                                if part_size > max_upload_bytes:
                                    raise web.HTTPRequestEntityTooLarge(max_size=max_upload_bytes, actual_size=part_size)
                                chunks.append(chunk)
                            image_bytes = b"".join(chunks)
                else:
                    chunks = []
                    body_size = 0
                    async for chunk in request.content.iter_chunked(64 * 1024):
                        body_size += len(chunk)
                        if body_size > max_json_bytes:
                            raise web.HTTPRequestEntityTooLarge(max_size=max_json_bytes, actual_size=body_size)
                        chunks.append(chunk)
                    body = json.loads(b"".join(chunks))
                    if not isinstance(body, dict):
                        return web.json_response({"success": False, "error": "Invalid request body"}, status=400)
                    raw_path = body.get("path") or ""
                    if not isinstance(raw_path, str):
                        return web.json_response({"success": False, "error": "Invalid workflow path"}, status=400)
                    raw_path = raw_path.strip()
                    img_data = body.get("image_base64") or body.get("image") or ""
                    if img_data:
                        if not isinstance(img_data, str):
                            return web.json_response({"success": False, "error": "Invalid image data"}, status=400)
                        if "," in img_data:
                            img_data = img_data.split(",", 1)[1]
                        max_encoded_bytes = ((max_upload_bytes + 2) // 3) * 4 + 128 * 1024
                        if len(img_data) > max_encoded_bytes:
                            raise web.HTTPRequestEntityTooLarge(max_size=max_encoded_bytes, actual_size=len(img_data))
                        try:
                            image_bytes = base64.b64decode(img_data, validate=True)
                        except Exception:
                            return web.json_response({"success": False, "error": "Invalid base64 image data"}, status=400)
                        if len(image_bytes) > max_upload_bytes:
                            raise web.HTTPRequestEntityTooLarge(max_size=max_upload_bytes, actual_size=len(image_bytes))

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

                # Validate and re-encode before writing; never save source bytes as a thumbnail.
                try:
                    from PIL import Image, UnidentifiedImageError
                    import io
                    max_pixels = 40_000_000
                    with Image.open(io.BytesIO(image_bytes)) as probe:
                        if probe.format not in {"JPEG", "PNG", "WEBP"}:
                            return web.json_response({"success": False, "error": "Unsupported image format. Use PNG, JPEG, or WebP."}, status=400)
                        if probe.width <= 0 or probe.height <= 0 or probe.width * probe.height > max_pixels:
                            return web.json_response({"success": False, "error": "Image dimensions exceed the safe limit of 40 megapixels."}, status=413)
                        probe.verify()

                    im = Image.open(io.BytesIO(image_bytes))
                    max_dim = 640
                    if im.width > max_dim or im.height > max_dim:
                        im.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
                    out_buf = io.BytesIO()
                    has_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
                    if has_alpha:
                        im.save(out_buf, format="PNG", optimize=True)
                    else:
                        im.convert("RGB").save(out_buf, format="PNG", optimize=True)
                    thumbnail_bytes = out_buf.getvalue()
                    im.close()
                    if not thumbnail_bytes:
                        raise ValueError("Thumbnail conversion produced no data")
                except UnidentifiedImageError as opt_err:
                    logger.warning(f"[Bada-Utils] Invalid thumbnail image: {opt_err}")
                    return web.json_response({"success": False, "error": "The uploaded file is not a valid supported image."}, status=400)
                except Image.DecompressionBombError as opt_err:
                    logger.warning(f"[Bada-Utils] Thumbnail image exceeds pixel safety limit: {opt_err}")
                    return web.json_response({"success": False, "error": "Image dimensions exceed the safe pixel limit."}, status=413)
                except Exception as opt_err:
                    logger.warning(f"[Bada-Utils] Thumbnail conversion failed: {opt_err}")
                    return web.json_response({"success": False, "error": "Image validation or thumbnail conversion failed."}, status=400)

                with open(thumb_full, "wb") as f:
                    f.write(thumbnail_bytes)

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
            except web.HTTPRequestEntityTooLarge:
                return web.json_response({"success": False, "error": "Thumbnail upload exceeds the 50 MiB file limit."}, status=413)
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
                    "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
                    "Pragma": "no-cache",
                    "Expires": "0"
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

        # --- F. Google Drive Cloud Sync API ---
        async def gdrive_status_handler(request):
            try:
                status_info = gdrive_sync.get_gdrive_status()
                return web.json_response(status_info)
            except Exception as e:
                return web.json_response({"status": "error", "authorized": False, "message": str(e)}, status=500)

        async def gdrive_sync_handler(request):
            try:
                workflows_dir = get_workflows_root_dir()
                result = await gdrive_sync.sync_gdrive_async(workflows_dir)
                status_code = 200 if result.get("status") in ["success", "busy"] else 400
                return web.json_response(result, status=status_code)
            except Exception as e:
                return web.json_response({"status": "error", "message": str(e)}, status=500)

        async def gdrive_upload_single_handler(request):
            try:
                body = await request.json()
                rel_path = body.get("rel_path") or body.get("path") or body.get("filename")
                if not rel_path:
                    return web.json_response({"status": "error", "message": "rel_path parameter missing"}, status=400)

                workflows_dir = get_workflows_root_dir()
                result = await gdrive_sync.upload_single_async(workflows_dir, rel_path)
                status_code = 200 if result.get("status") == "success" else 400
                return web.json_response(result, status=status_code)
            except Exception as e:
                return web.json_response({"status": "error", "message": str(e)}, status=500)

        async def gdrive_details_handler(request):
            try:
                details = get_cloud_sync_details()
                return web.json_response({"status": "success", "details": details})
            except Exception as e:
                return web.json_response({"status": "error", "message": str(e)}, status=500)

        async def version_handler(request):
            try:
                ver = get_node_version()
                return web.json_response({"success": True, "version": ver})
            except Exception as e:
                return web.json_response({"success": False, "version": "1.0.3", "error": str(e)})

        routes.get("/api/bada/version")(version_handler)
        routes.get("/cloud/gdrive/status")(gdrive_status_handler)
        routes.get("/cloud/gdrive/details")(gdrive_details_handler)
        routes.post("/cloud/gdrive/sync")(gdrive_sync_handler)
        routes.post("/cloud/gdrive/upload_single")(gdrive_upload_single_handler)

        # Startup Trigger: Boot Background Sync (If authenticated)
        try:
            status = gdrive_sync.get_gdrive_status()
            if status.get("authorized"):
                logger.info("[ComfyUI-Bada-Utils] Triggering boot background Google Drive sync...")
                asyncio.create_task(gdrive_sync.sync_gdrive_async(get_workflows_root_dir()))
        except Exception as se:
            logger.warning(f"[ComfyUI-Bada-Utils] Boot sync trigger notice: {se}")

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
