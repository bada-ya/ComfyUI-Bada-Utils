# 🌊 ComfyUI-Bada-Utils (Bada Suite)

<div align="center">

![Platform](https://img.shields.io/badge/Platform-Windows_%7C_Linux_%7C_Mac-blue?logo=windows)
![ComfyUI](https://img.shields.io/badge/ComfyUI-Custom_Node_Suite-orange?logo=python)
![License](https://img.shields.io/badge/License-MIT-green.svg)
![Language](https://img.shields.io/badge/Language-English_%7C_한국어-brightgreen)
[![GitHub stars](https://img.shields.io/badge/GitHub-ComfyUI--Bada--Utils-181717?logo=github)](https://github.com/bada-ya/ComfyUI-Bada-Utils)

**The Ultimate All-in-One Quality of Life (QoL), Smart Presets Master Hub, Auto Model Assigner & Visual Regional Prompting Suite for ComfyUI.**  
*Seamlessly unifying 4 flagship productivity tools into a single, high-performance package.*

[English Documentation](#-4-flagship-integrated-modules) •
[🇰🇷 한국어 설명서 보기 (README_ko.md)](README_ko.md) •
[📸 Visual Walkthrough](#-module-visual-guides--features) •
[⚙️ Settings & i18n](#-bada-settings--bilingual-i18n) •
[🚀 Installation](#-installation)

</div>

---

## 🌟 4 Flagship Integrated Modules

`ComfyUI-Bada-Utils` integrates Quality of Life enhancements, master preset switching, intelligent model auto-detection, and interactive visual regional prompting to accelerate your workflow creation and generation speed.

```
🌊 ComfyUI-Bada-Utils
├── 📐 Module 1: Visual Grid Regional Prompt Pro (Visual Grid Regional Prompt)
│   └── Diagonal drag partitioning, 10-category shot explorer, SVG silhouette preview, 6 AI format outputs
├── 🌟 Module 2: Universal Smart Presets & Master Hub (Universal Smart Presets)
│   └── 24px slim on-canvas radio switcher, Ctrl+drag batch snapshot, 2-tier roof badges, global presets
├── ⚡ Module 3: Auto Model & LoRA Assigner (Auto Model Assigner)
│   └── Missing model detection on workflow load, intelligent fuzzy matching (%), folder tree explorer
└── ✨ Module 4: Quality of Life (QoL) Master (Quality of Life Utils)
    └── Workflows+ sidebar explorer (drag-and-drop / 0-item folder preservation), active tracking, blank startup, mouse pan/zoom fixer
```

---

## 📸 Module Visual Guides & Features

---

### 📐 Module 1. Visual Grid Regional Prompt Pro (`BadaRegionalPrompt`)
> **Interactive multi-panel spatial composition prompt generator**  
> *(Optimized for Krea 2, MiniMax, Flux, SD3, ComfyUI BREAK, Midjourney, Imagen 3, ChatGPT, Gemini)*

<p align="center">
  <img src="docs/images/vrp/node_overview.png" alt="Visual Grid Regional Prompt Node Overview" width="850">
</p>

#### 🌟 Key Features
1. **🖱️ Click & Drag Interactive Area Partitioning**:
   * Click and drag diagonally across grid cells to immediately create neon-highlighted rectangular areas.
   <p align="center">
     <img src="docs/images/vrp/drag_area_guide.png" alt="Drag Area Guide" width="700">
   </p>
2. **📂 10-Category Character Sheet Shot Explorer**:
   * Windows Explorer-style collapsible tree with real-time keyword search:
     1. **👤 Face & Head (Hair to Collarbone)**: Front, Profile, 3/4 View, High Angle, Low Angle, Back Head
     2. **👁️ Extreme Macro Close-up**: Front, Side, 3/4 View
     3. **👚 Bust Shot**: Front, Profile, 3/4 View, High/Low Angle
     4. **👗 Waist Shot**: Front, Profile, 3/4 View, High/Low Angle
     5. **✨ Chest & Neckline**: Front, Side, 3/4 View, High/Low Angle
     6. **🧍 Full Body Turnaround**: Front, Side, 3/4 View, Back View, Walking Pose
     7. **🦵 Lower Body (Hips to Legs)**: Front, Side, 3/4 View, Back View, Dynamic Pose
     8. **🍑 Hips & Buttocks**: Front Pelvis, Side Hip, Back View, Low Angle
     9. **🖐️ Hands & Fingers**: Back of Hand, Palm
     10. **🦶 Feet & Toes**: Barefoot Top, Sole, Front, 3/4, Side
   <p align="center">
     <img src="docs/images/vrp/preset_dropdown.png" alt="Shot Tree Selector" width="600">
   </p>
3. **🧍 Vector SVG Silhouette Dynamic Viewer**: Full body, macro face, bust, hands, feet, and seated poses render dynamic SVG silhouettes with automatic 16:9, 9:16, and 1:1 aspect ratio scaling.
4. **🎨 5 Art Styles & White Backdrop Lock**: Hyper-realistic, Semi-realistic, 2D Anime, Concept Art, 3D CG — your `White Backdrop` toggle remains permanently preserved across style changes.
5. **👤 Master Character Profile Anchor**: Global top input bar enforces character facial, hair, and costume consistency across all partitioned panels.
6. **🧩 6 Multi-AI Formats**:
   * **Natural Spatial**: Krea 2, MiniMax, Gemini, GPT-4o, Flux, Midjourney.
   * **ComfyUI / SD BREAK**: `(prompt:1.1) BREAK` syntax.
   * **Structured Tags**: `[Area 1 | LEFT (50% W, 100% H)]`.
   * **Coordinates Bounding Box**: `<area_1 bbox="[0.0, 0.0, 0.5, 1.0]">`.
   * **Comma-Separated List** and **Raw JSON**.

---

### 🌟 Module 2. Universal Smart Presets & Master Hub (`BadaPresetHub` & `SmartPresets`)
> **Wire-free master controller that switches complete workflow configurations with a single click**

<p align="center">
  <img src="docs/images/usp/01_universal_hub_node.png" alt="Universal Preset Hub Node" width="600">
</p>

#### 🌟 Key Features
1. **🔘 On-Canvas 24px Ultra-Slim Radio Switcher (Fast Groups Style)**:
   * Instantly switch complete workflow parameter snapshots right on the canvas without opening modal dialogs.
2. **🎯 2 Canvas Selection Modes for Instant Snapshot**:
   * **`Ctrl + Mouse Drag` (Box Area Selection)**: Drag a box around dozens of nodes to capture them all (`🎯 Canvas Selection: 11 Nodes`).
   * **`Ctrl + Mouse Click` (Multi-Node Point Selection)**: Select only the required nodes (Checkpoints, VAE, KSampler, etc.).
   <p align="center">
     <img src="docs/images/usp/02_selection_box_drag.png" alt="Ctrl Drag Box Selection" width="48%">
     <img src="docs/images/usp/03_selection_multi_click.png" alt="Ctrl Click Multi Selection" width="48%">
   </p>
3. **🟣 Full Bypass & 🔴 Mute Branch Support**:
   * Effortlessly store and toggle execution states (Active, Bypass, Mute) for upscalers, detailers, and face enhancers across different presets.
4. **📋 Universal Preset Hub Manager**:
   * Review node pill tags, reorder (▲/▼), rename (✏️), and export/import `.json` backup profiles.
   <p align="center">
     <img src="docs/images/usp/04_universal_hub_modal.png" alt="Universal Hub Manager Modal" width="800">
   </p>
5. **🏷️ 2-Tier Roof Badges**:
   * Canvas nodes automatically display `[🌐 N]` (Global Presets count) and `[🌟 N]` (Universal Hub linkage count) badges for 1-click modal popup access.
   <p align="center">
     <img src="docs/images/usp/05_node_roof_badges.png" alt="2-Tier Roof Badges" width="500">
   </p>
6. **🌐 Per-Node Global Presets & Parameter ON/OFF Pill Toggles**:
   * Access node-specific global presets via right-click context menu.
   * Disable `seed` (strike-through) to **keep the active seed while injecting steps, cfg, sampler, and scheduler**.
   <p align="center">
     <img src="docs/images/usp/06_context_menu.png" alt="Context Menu" width="48%">
     <img src="docs/images/usp/07_global_preset_modal.png" alt="Global Preset Manager" width="48%">
   </p>
7. **🧠 3-Tier Smart Node Matching Engine**:
   * `Tier 1 (Node ID)` ➔ `Tier 2 (Title + Type)` ➔ `Tier 3 (Left-to-Right Canvas Coordinate Mapping)` ensures 100% collision-free preset restoration on third-party workflows.

---

### ⚡ Module 3. Auto Model & LoRA Assigner (`Auto Assigner`)
> **Automatically detect missing models upon loading external workflows and link them to local files in 1 click**

| 1. Right-Click Blank Canvas (Batch Assign) | 2. All Models Batch Smart Match Modal |
| :---: | :---: |
| ![Canvas Right Click](docs/images/ama/01_canvas_menu.png) | ![All Models Modal](docs/images/ama/02_all_models_modal_v2.png) |
| *Click `⚡ Auto-Assign All Models/LoRAs` at the bottom* | *Scans missing models with 100% path matching & similarity rankings* |

| 3. Right-Click Specific Node (Single Node) | 4. Single Node Smart Match Modal |
| :---: | :---: |
| ![Node Right Click](docs/images/ama/03_single_node_menu.png) | ![Single Node Modal](docs/images/ama/04_single_node_modal_v2.png) |
| *Click `⚡ Auto-Assign This Node`* | *Instantly inspect and swap models for the selected node* |

#### 🌟 Key Features
1. **🌲 Windows Explorer-Style Folder Tree Explorer**:
   * Browse model directory hierarchies with auto-expand and instant highlighting for currently active model files.
2. **🧩 Universal Slot Adapter for Third-Party Multi-LoRA Nodes**:
   * Full support for `Power Lora Loader (rgthree)`, `DaSiWa LoRA Loader`, `Deno Multi LoRA Loader`, `Comfyroll`, `Efficiency Nodes`, and custom loader stacks.
3. **🧠 Intelligent Fuzzy Matcher**:
   * Normalizes precision (`fp8`, `bf16`, `fp16`), version (`v1`, `v2`, `turbo`), and punctuation to recommend the best local match sorted by similarity (%).
4. **🌐 1-Click Smart Web Search**:
   * Cleaned model filenames with instant search links to `🔍 Google Search`, `🤗 HuggingFace`, and `💖 Civitai`.
5. **🛡️ Automatic Red Error Border Removal**:
   * Instantly removes red error outlines and refreshes canvas widgets once models are assigned.

---

### ✨ Module 4. Quality of Life (QoL) Master (`Workflows+` & Canvas Fixer)
> **Sidebar workflow manager, active workflow live tracker, clean startup canvas & global mouse fixer**

#### 📊 Native Workflows vs Enhanced Workflows+ Comparison
| Feature | 📋 Native Workflows Tab | ✨ Enhanced Workflows+ Tab |
| :--- | :---: | :---: |
| **Native State Preserved** | 100% Native | 1-Click Tab Switch (`Workflows` ↔ `Workflows+`) |
| **Empty Folders (`0` items)** | ❌ Hidden when empty | ⭕ **Preserved with grey item count badge** |
| **Mouse Drag & Drop** | ❌ Not supported | ⭕ **Drag to any folder or Root dynamically** |
| **Hover Auto-Expand** | ❌ Not supported | ⭕ **1.2s hover auto-opens subfolders** |
| **Font & Row Size Control** | ❌ Fixed | ⭕ **4-level size switch (`A⁻` ~ `A⁺⁺`) with persistence** |
| **Active Workflow Tracking** | ❌ Manual search | ⭕ **🎯 Real-time auto-focus & smooth scroll into view** |
| **Favorites (⭐/★)** | ⭕ Basic | ⭕ **100% 2-way live sync with native SQLite DB** |
| **Context Menu** | ❌ Basic | ⭕ **Load / Move to / Favorite / Rename / Delete** |

#### 📸 Feature Highlights
* **(1) ✨ Workflows+ Explorer & 🎛️ Quick Toolbar**:
  <p align="center">
    <img src="docs/images/qol/02_workflows_plus.png" alt="Enhanced Workflows+ Tab" width="380">
    <img src="docs/images/qol/04_toolbar_menu.png" alt="Quick Toolbar" width="380">
  </p>
  * 🎯 **Focus Active Workflow**: Smoothly scrolls to and highlights the currently active workflow in bright green.
  * **`A⁺⁺` Font & Row Scaling**: Left-click cycles through 4 levels (`A⁻` to `A⁺⁺`), right-click opens quick selector.
  * ➕ **New Folder**, 📂 **Expand/Collapse All**, 🔄 **Refresh**.

* **(2) 🖱️ Drag & Drop Folder Moving**:
  <p align="center">
    <img src="docs/images/qol/05_drag_and_drop.png" alt="Drag and Drop Moving" width="380">
    <img src="docs/images/qol/03_context_menu.png" alt="Context Menu" width="320">
  </p>
  * Drag files with mouse ghost badge to `🏠 Root` dropzone or target subfolders.
  * Hovering over a collapsed folder for 1.2s automatically expands it.

* **(3) 🎯 Real-Time Active Workflow Focus & Favorites Sync**:
  <p align="center">
    <img src="docs/images/qol/06_active_workflow_focus.png" alt="Active Workflow Auto Focus" width="500">
  </p>
  * Automatically marks the open workflow with a blue `[• Active]` badge and centers it in the view.
  * 100% two-way synchronized with native ComfyUI SQLite database (`comfyui.db`) and favorites bar.

* **(4) 🧼 Clean Blank Canvas Startup**:
  * Eliminates startup missing model errors ("2 errors found") and starts with a clean, empty canvas.

* **(5) 🖱️ Global Canvas Mouse Pan & Zoom Fixer**:
  * Prevents middle-click panning and wheel zooming from freezing over textareas, DOM widgets, or custom nodes.

---

## ⚙️ BADA Settings & Bilingual i18n

Open the ComfyUI Settings dialog (**`⚙️ Settings`**) to customize your BADA experience:

* **🌐 UI Language**: Real-time switching between `English` and `한국어` (runs completely independently from ComfyUI's native language).
* **✨ [QoL] Startup & New Tab Canvas**: `Clean Blank Canvas` / `Default ComfyUI Workflow`.
* **✨ [QoL] Auto-Dismiss Initial Missing Model Alerts**: Toggle automatic error suppression.
* **🖱️ [QoL] Global Canvas Mouse Fixer**: Toggle middle-click pan & wheel zoom capture.
* **⚡ [Auto Assigner] Scan on Workflow Load**: Toggle automatic missing model prompt on load.

---

> [!NOTE]
> **💡 Recommended ComfyUI Canvas Mode**:  
> Like `rgthree-comfy` and other advanced visual canvas suites, **Classic Canvas Rendering (Nodes 1.0)** is recommended for the best interactive experience.  
> If you have experimental **Nodes 2.0** enabled in ComfyUI Settings (`⚙️ -> Use New Nodes 2.0`), please set it to **Disabled (OFF)** for full interactive grid dragging and on-canvas radio buttons.

---

## 📂 Included Example Workflow

Drag and drop [`workflows/visual_grid_prompt_workflow.json`](workflows/visual_grid_prompt_workflow.json) directly onto your ComfyUI canvas to immediately test the full regional prompt character turnaround pipeline.

---

## 🚀 Installation

### Method 1: 1-Click Symlink Installer (Windows Recommended)
Double-click **`install_junction.bat`** in the repository root to automatically link `ComfyUI-Bada-Utils` into your `ComfyUI/custom_nodes/` directory.

### Method 2: ComfyUI Manager
1. Open ComfyUI Manager.
2. Search for `ComfyUI-Bada-Utils` and click **Install**.
3. Restart ComfyUI and press **`Ctrl + F5` (Hard Refresh)** in your browser.

### Method 3: Git Clone
```bash
cd ComfyUI/custom_nodes
git clone https://github.com/bada-ya/ComfyUI-Bada-Utils.git
```

---

## 🛡️ 100% Backward Compatibility
All existing workflows built with `UniversalPresetHub`, `VisualGridPromptNode`, or `VisualGridPrompt` load seamlessly with zero missing node errors thanks to built-in class alias resolution.

---

## 📄 License
This project is open-sourced under the **[MIT License](LICENSE)**.
