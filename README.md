# 🌊 ComfyUI-Bada-Utils (Bada Suite)

<div align="center">

![Platform](https://img.shields.io/badge/Platform-Windows_%7C_Linux_%7C_Mac-blue?logo=windows)
![ComfyUI](https://img.shields.io/badge/ComfyUI-Custom_Node_Suite-orange?logo=python)
![License](https://img.shields.io/badge/License-MIT-green.svg)
![i18n](https://img.shields.io/badge/Language-English_%7C_한국어-brightgreen)

**The Ultimate All-in-One Quality of Life, Smart Presets Hub, Auto Model Assigner & Visual Regional Prompting Suite for ComfyUI.**

[English Documentation](#-core-features) | [🇰🇷 한국어 설명서 보기 (README_ko.md)](README_ko.md)

</div>

---

## 🌟 Core Modules & Features

`ComfyUI-Bada-Utils` integrates 4 powerful workflow productivity tools into a single, high-performance custom node package:

```
🌊 ComfyUI-Bada-Utils
├── 📂 1. Workflow & QoL Tools     (Sidebar folder move, empty canvas startup, smooth mouse pan & wheel zoom)
├── 🌟 2. Universal Smart Presets  (Wireless master preset hub & node parameter batch save/restore)
├── ⚡ 3. Auto Model Assigner       (Automatic missing model & LoRA detection with smart local matching)
└── 📐 4. Visual Regional Prompt   (Interactive visual grid regional prompting & vector silhouette preview)
```

---

### 1. 📂 Workflow & Quality of Life (QoL) Enhancements
* **Sidebar Workflow Moving & Organization**: Drag-and-drop workflow JSON files into subfolders directly in the left sidebar.
* **Clean Blank Canvas Startup**: Starts ComfyUI with a clean empty canvas, eliminating default missing model startup errors.
* **Global Smooth Mouse Pan & Zoom Fixer**: Seamless middle-click drag panning and wheel zooming over nodes and text boxes without getting stuck.
* **Utility Nodes**:
  - `🌊 Bada Show Text`: Inspector node that displays string/any outputs on canvas.
  - `🌊 Bada Any Switch`: Flexible multi-type router switch.
  - `🌊 Bada Note`: Non-intrusive markdown documentation note.

---

### 2. 🌟 Universal Smart Presets (Master Preset Hub)
* **Zero-Wire Preset Controller**: Save and apply entire workflow configurations (models, LoRAs, samplers, CLIP, VAE, denoise values) with a single click.
* **Embedded Metadata**: Presets are embedded inside the workflow and saved generated image metadata automatically.
* **Modern Glassmorphism Hub Drawer**: Full preset management with drag-and-drop reordering.

---

### 3. ⚡ Auto Model & LoRA Assigner
* **Smart Workflow Loader**: Scans loaded workflows for missing checkpoints, diffusion models, UNet, CLIP, VAE, and LoRAs.
* **Fuzzy Local Matching**: Compares missing names against locally installed models and suggests best matches.
* **One-Click Batch Replace**: Updates all node widget loaders simultaneously.

---

### 4. 📐 Visual Grid Regional Prompt (Pro)
* **Interactive Canvas Partitioning**: Click & drag diagonally on the visual grid to create custom multi-panel regions with neon colors.
* **10 Character Sheet Shot Classifications**: Quick-select presets for full body turnarounds, face close-ups, bust shots, hands, feet, etc.
* **Multi-AI Output Formats**:
  1. *Natural Spatial*: Optimized for Krea 2, MiniMax, Gemini, Flux, and GPT-4o.
  2. *ComfyUI / SD Regional Prompt (BREAK syntax)*.
  3. *Structured Tags* (`[Area 1 | LEFT (50% W, 100% H)]`).
  4. *Coordinates Bounding Box* (`<area_1 bbox="...">`).
  5. *Raw JSON*.

---

## ⚙️ ComfyUI Settings Integration

Open ComfyUI Settings (`⚙️`) to customize Bada Suite options:
* **UI Language**: Switch between `English` and `한국어` in real-time.
* **Clean Blank Canvas Startup**: Toggle On/Off.
* **Smooth Mouse Pan & Zoom**: Toggle On/Off.
* **Auto Model Assigner Alert**: Toggle On/Off.
* **Sidebar Folder Management**: Toggle On/Off.

---

## 🚀 Installation

### Method 1: ComfyUI Manager (Recommended)
Search for `ComfyUI-Bada-Utils` in ComfyUI Manager and click **Install**.

### Method 2: Git Clone
Navigate to your ComfyUI `custom_nodes/` directory and run:
```bash
cd custom_nodes
git clone https://github.com/bada-ya/ComfyUI-Bada-Utils.git
```
Then restart ComfyUI.

---

## 🛡️ Backward Compatibility
All previous workflow files created with `UniversalPresetHub`, `VisualGridPromptNode`, `VisualGridPrompt`, or `QoL_*` nodes are **100% backward compatible** via automatic class alias mapping.

---

## 📄 License
Released under the [MIT License](LICENSE).
