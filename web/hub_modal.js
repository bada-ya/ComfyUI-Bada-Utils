/**
 * ComfyUI Master Preset Hub Modal Controller
 * - Visual Preset Selection & Management Modal
 * - Live Dynamic Selected Nodes & Parameters Preview Box (Adaptive max-height: 55vh)
 * - Instant Apply (Zero blocking popups + Floating Glassmorphic Toast)
 * - Drag & Drop Preset Card Reordering (⠿) & Order Buttons (▲/▼)
 * - In-place Inline Title Rename (✏️ / Double Click)
 * - Accordion Deep Matrix Expand/Collapse (▼/▲)
 * - JSON Import/Export & Comprehensive Cross-Workflow Guide Sub-Modal
 */

import { app } from "../../scripts/app.js";
import { extractNodeState } from "./smart_presets.js";
import { showToast, showGuideModal } from "./presets_modal.js";
import { BadaI18n } from "./bada_i18n.js";

let hubModalElement = null;
let currentHubNode = null;
let onApplyMasterCallback = null;
let onSaveMasterCallback = null;
let onDeleteMasterCallback = null;
let onRenameMasterCallback = null;
let onReorderMasterCallback = null;
let onExportMasterCallback = null;
let onImportMasterCallback = null;
let getHubPresetsCallback = null;

// Track expanded state across master preset cards
const expandedHubState = new Set();

export function initHubModal(callbacks) {
    onApplyMasterCallback = callbacks.onApply;
    onSaveMasterCallback = callbacks.onSave;
    onDeleteMasterCallback = callbacks.onDelete;
    onRenameMasterCallback = callbacks.onRename;
    onReorderMasterCallback = callbacks.onReorder;
    onExportMasterCallback = callbacks.onExport;
    onImportMasterCallback = callbacks.onImport;
    getHubPresetsCallback = callbacks.getPresets;

    createHubModalDOM();
}

function createHubModalDOM() {
    const existing = document.getElementById("usp-hub-modal");
    if (existing) {
        existing.remove();
    }

    const backdrop = document.createElement("div");
    backdrop.id = "usp-hub-modal";
    backdrop.className = "usp-modal-backdrop";
    backdrop.innerHTML = `
        <div class="usp-modal-container">
            <div class="usp-modal-header">
                <div class="usp-header-title-box">
                    <div class="usp-header-icon gold">🌟</div>
                    <div>
                        <h3 class="usp-header-title" id="usp-hub-title">${BadaI18n.t("modal_hub_title")}</h3>
                        <p class="usp-header-subtitle" id="usp-hub-subtitle">${BadaI18n.t("modal_hub_subtitle")}</p>
                    </div>
                </div>
                <button class="usp-btn-close" id="usp-hub-btn-close" title="Close">✕</button>
            </div>

            <div class="usp-modal-body">
                <!-- Save Box with Dynamic Live Selection Preview -->
                <div class="usp-save-bar gold" id="usp-hub-save-box">
                    <div class="usp-save-input-row">
                        <input type="text" class="usp-input" id="usp-hub-name-input" placeholder="${BadaI18n.t("modal_hub_input_placeholder")}" />
                        <button class="usp-btn usp-btn-gold" id="usp-hub-btn-save">
                            ${BadaI18n.t("modal_hub_save_btn")}
                        </button>
                    </div>

                    <!-- Live Selected Nodes Preview Box (Adaptive height) -->
                    <div id="usp-hub-selected-preview-container">
                        <!-- Populated dynamically by renderSelectedNodesPreview -->
                    </div>
                </div>

                <!-- Presets List -->
                <div class="usp-presets-list" id="usp-hub-presets-container">
                    <!-- Master Preset cards -->
                </div>
            </div>

            <div class="usp-modal-footer">
                <div class="usp-footer-left">
                    <button class="usp-btn usp-btn-secondary" id="usp-hub-btn-export" title="Export to JSON">
                        ${BadaI18n.t("modal_export_btn")}
                    </button>
                    <button class="usp-btn usp-btn-secondary" id="usp-hub-btn-import" title="Import from JSON">
                        ${BadaI18n.t("modal_import_btn")}
                    </button>
                    <button class="usp-btn usp-btn-guide" id="usp-hub-btn-guide" title="Cross-workflow guide">
                        ${BadaI18n.t("modal_guide_btn")}
                    </button>
                    <input type="file" id="usp-hub-import-input" accept=".json" style="display: none;" />
                </div>
                <button class="usp-btn usp-btn-secondary" id="usp-hub-btn-done">${BadaI18n.t("modal_close_btn")}</button>
            </div>
        </div>
    `;

    document.body.appendChild(backdrop);
    hubModalElement = backdrop;

    // Events
    document.getElementById("usp-hub-btn-close").addEventListener("click", closeHubModal);
    document.getElementById("usp-hub-btn-done").addEventListener("click", closeHubModal);
    backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) closeHubModal();
    });

    document.getElementById("usp-hub-btn-save").addEventListener("click", handleSaveMaster);
    document.getElementById("usp-hub-name-input").addEventListener("keydown", (e) => {
        if (e.key === "Enter") handleSaveMaster();
    });

    // Guide Modal
    document.getElementById("usp-hub-btn-guide").addEventListener("click", showGuideModal);

    // Export / Import
    document.getElementById("usp-hub-btn-export").addEventListener("click", () => {
        if (onExportMasterCallback) onExportMasterCallback(currentHubNode);
    });

    const fileInput = document.getElementById("usp-hub-import-input");
    document.getElementById("usp-hub-btn-import").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file && onImportMasterCallback) {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    onImportMasterCallback(data, currentHubNode);
                    renderHubPresetList();
                    showToast(BadaI18n.t("toast_hub_import_success"), "success");
                } catch (err) {
                    showToast(BadaI18n.t("toast_hub_import_error") + err.message, "warning");
                }
            };
            reader.readAsText(file);
        }
        fileInput.value = "";
    });
}

/**
 * Get list of currently selected nodes on canvas
 */
function getSelectedNodes(hubNode) {
    const selected = [];
    const canvasSelection = app.canvas?.selected_nodes;

    if (canvasSelection && Object.keys(canvasSelection).length > 0) {
        for (const k in canvasSelection) {
            const n = canvasSelection[k];
            if (n && n !== hubNode && n.type !== "UniversalPresetHub" && n.comfyClass !== "UniversalPresetHub" && n.type !== "BadaPresetHub" && n.comfyClass !== "BadaPresetHub") {
                selected.push(n);
            }
        }
    } else if (app.graph?._nodes) {
        for (const n of app.graph._nodes) {
            if (n.is_selected && n !== hubNode && n.type !== "UniversalPresetHub" && n.comfyClass !== "UniversalPresetHub" && n.type !== "BadaPresetHub" && n.comfyClass !== "BadaPresetHub") {
                selected.push(n);
            }
        }
    }

    return selected;
}

/**
 * Extract human-readable summary of key parameters for a node
 */
function getNodeSummary(node) {
    const nodeType = node.comfyClass || node.type || "Node";
    const title = node.title || nodeType;
    const state = extractNodeState(node);
    const details = [];
    const mode = (node.mode !== undefined) ? Number(node.mode) : (state.mode || 0);
    const isBypassed = (mode === 4 || state.isBypassed);
    const isMuted = (mode === 2 || state.isMuted);

    // 0. Node Execution Mode Banner
    if (isBypassed) {
        details.push({
            text: BadaI18n.t("modal_hub_bypass_state"),
            isBypass: true
        });
    } else if (isMuted) {
        details.push({
            text: BadaI18n.t("modal_hub_mute_state"),
            isMute: true
        });
    }

    // 1. Fast Groups Bypasser & Muter (rgthree)
    if (state._isFastGroups && state.groups) {
        for (const [gName, gVal] of Object.entries(state.groups)) {
            details.push({
                text: `${gName}: ${gVal ? "ON" : "OFF"}`,
                isGroup: true
            });
        }
    }

    // 2. LoRA Stack (rgthree Power Lora Loader or multi-lora stacks)
    if (state._isLoraStack && Array.isArray(state.loras)) {
        const activeLoras = state.loras.filter(l => l && l.on !== false && l.lora && l.lora !== "None");
        if (activeLoras.length > 0) {
            activeLoras.forEach((l, idx) => {
                const name = String(l.lora).split(/[\/\\]/).pop().replace(/\.(safetensors|pt|ckpt)$/i, "");
                const str = l.strength !== undefined ? ` (${typeof l.strength === "number" ? l.strength.toFixed(2) : l.strength})` : "";
                details.push({
                    text: `LoRA #${idx + 1}: ${name}${str}`,
                    isLora: true
                });
            });
        } else {
            details.push({ text: BadaI18n.t("modal_hub_lora_none"), isLora: true });
        }
    }

    // 3. Scan standard widgets
    if (state.widgets && !isBypassed && !isMuted) {
        for (const [key, val] of Object.entries(state.widgets)) {
            if (val === undefined || val === null || val === "" || typeof val === "function") continue;

            // Model / Checkpoint / VAE / CLIP / UNET
            if (/vae_name|ckpt_name|unet_name|model_name|clip_name|lora_name/i.test(key)) {
                const cleanVal = String(val).split(/[\/\\]/).pop();
                const label = key.replace(/_name$/i, "").toUpperCase();
                details.push({ text: `${label}: ${cleanVal}`, isCkpt: true });
            }
            // KSampler core settings
            else if (/^(steps|cfg|sampler_name|scheduler|denoise|seed)$/i.test(key)) {
                if (key === "seed" && Number(val) > 1000000) {
                    details.push({ text: `seed: ${String(val).slice(0, 8)}...` });
                } else {
                    details.push({ text: `${key}: ${val}` });
                }
            }
            // Prompt / Text
            else if (/^(text|prompt|string|text_positive|text_negative)$/i.test(key) && typeof val === "string") {
                const clean = val.replace(/\s+/g, " ").trim();
                if (clean) {
                    const shortText = clean.length > 40 ? clean.slice(0, 37) + "..." : clean;
                    details.push({ text: `${BadaI18n.t("modal_hub_text_prefix")}: "${shortText}"` });
                }
            }
        }

        // Generic fallback for widgets
        if (details.length === 0) {
            const entries = Object.entries(state.widgets).filter(([k, v]) => typeof v !== "object" && typeof v !== "function");
            for (const [k, v] of entries.slice(0, 4)) {
                const strVal = String(v).split(/[\/\\]/).pop();
                const shortVal = strVal.length > 25 ? strVal.slice(0, 22) + "..." : strVal;
                details.push({ text: `${k}: ${shortVal}` });
            }
        }
    }

    if (details.length === 0) {
        details.push({ text: isBypassed ? BadaI18n.t("modal_hub_bypass_config") : BadaI18n.t("modal_hub_default_params") });
    }

    return {
        title,
        nodeType,
        details,
        isBypassed,
        isMuted,
        mode,
    };
}

/**
 * Render the live selected nodes & parameters preview box inside save area
 */
function renderSelectedNodesPreview(hubNode) {
    const container = document.getElementById("usp-hub-selected-preview-container");
    if (!container) return;

    const selectedNodes = getSelectedNodes(hubNode);
    const count = selectedNodes.length;

    if (count === 0) {
        container.innerHTML = `
            <div class="usp-selected-preview-box empty">
                <div class="usp-selected-preview-header">
                    <span class="usp-header-badge warning">${BadaI18n.t("modal_hub_empty_badge")}</span>
                </div>
                <div class="usp-selected-empty-text">
                    ${BadaI18n.t("modal_hub_empty_desc")}
                </div>
            </div>
        `;
        return;
    }

    const chipsHtml = selectedNodes.map(node => {
        const summary = getNodeSummary(node);
        const paramsHtml = summary.details.map(d => {
            const cls = d.isBypass ? "usp-chip-param bypass" : (d.isMute ? "usp-chip-param mute" : (d.isLora ? "usp-chip-param lora" : (d.isCkpt ? "usp-chip-param ckpt" : "usp-chip-param")));
            return `<div class="${cls}" title="${escapeHtml(d.text)}">${escapeHtml(d.text)}</div>`;
        }).join("");

        const modeBadgeHtml = summary.isBypassed
            ? `<span class="usp-chip-mode-badge bypass">🟣 Bypass</span>`
            : (summary.isMuted ? `<span class="usp-chip-mode-badge mute">🔴 Mute</span>` : "");

        return `
            <div class="usp-selected-node-chip ${summary.isBypassed ? "bypass" : (summary.isMuted ? "mute" : "")}">
                <div class="usp-chip-header">
                    <span class="usp-chip-icon">${summary.isBypassed ? "🟣" : (summary.isMuted ? "🔴" : "🎯")}</span>
                    <span class="usp-chip-title" title="${escapeHtml(summary.title)}">${escapeHtml(summary.title)}</span>
                    ${modeBadgeHtml}
                    <span class="usp-chip-type" title="${escapeHtml(summary.nodeType)}">${escapeHtml(summary.nodeType)}</span>
                </div>
                <div class="usp-chip-details">
                    ${paramsHtml}
                </div>
            </div>
        `;
    }).join("");

    container.innerHTML = `
        <div class="usp-selected-preview-box">
            <div class="usp-selected-preview-header">
                <div class="usp-preview-header-left">
                    <span class="usp-header-badge gold">${BadaI18n.t("modal_hub_target_badge", { count })}</span>
                </div>
                <span class="usp-selected-hint">${BadaI18n.t("modal_hub_target_hint")}</span>
            </div>
            <div class="usp-selected-nodes-grid">
                ${chipsHtml}
            </div>
        </div>
    `;
}

export function showHubManageModal(hubNode = null, options = {}) {
    if (!hubModalElement || !document.getElementById("usp-hub-modal")) {
        createHubModalDOM();
    }
    if (!hubNode && app.graph?._nodes) {
        hubNode = app.graph._nodes.find(n => n.type === "UniversalPresetHub" || n.comfyClass === "UniversalPresetHub") || null;
    }
    currentHubNode = hubNode;

    const titleEl = document.getElementById("usp-hub-title");
    if (titleEl) titleEl.textContent = BadaI18n.t("modal_hub_title");
    const subEl = document.getElementById("usp-hub-subtitle");
    if (subEl) subEl.innerHTML = BadaI18n.t("modal_hub_subtitle");

    const nameInput = document.getElementById("usp-hub-name-input");
    if (nameInput) nameInput.placeholder = BadaI18n.t("modal_hub_input_placeholder");
    const saveBtn = document.getElementById("usp-hub-btn-save");
    if (saveBtn) saveBtn.innerHTML = BadaI18n.t("modal_hub_save_btn");
    const exportBtn = document.getElementById("usp-hub-btn-export");
    if (exportBtn) exportBtn.innerHTML = BadaI18n.t("modal_export_btn");
    const importBtn = document.getElementById("usp-hub-btn-import");
    if (importBtn) importBtn.innerHTML = BadaI18n.t("modal_import_btn");
    const guideBtn = document.getElementById("usp-hub-btn-guide");
    if (guideBtn) guideBtn.innerHTML = BadaI18n.t("modal_guide_btn");
    const doneBtn = document.getElementById("usp-hub-btn-done");
    if (doneBtn) doneBtn.textContent = BadaI18n.t("modal_close_btn");

    const saveBox = document.getElementById("usp-hub-save-box");

    if (options.focusSave) {
        nameInput.value = options.defaultName || "";
        saveBox.style.boxShadow = "0 0 0 2px rgba(245, 158, 11, 0.6)";
        setTimeout(() => {
            nameInput.focus();
            nameInput.select();
        }, 80);
    } else {
        nameInput.value = "";
        saveBox.style.boxShadow = "none";
    }

    renderSelectedNodesPreview(hubNode);
    renderHubPresetList();
    hubModalElement.classList.add("active");
}

export function closeHubModal() {
    if (hubModalElement) {
        hubModalElement.classList.remove("active");
    }
    currentHubNode = null;
}

function handleSaveMaster() {
    if (!currentHubNode && app.graph?._nodes) {
        currentHubNode = app.graph._nodes.find(n => n.type === "UniversalPresetHub" || n.comfyClass === "UniversalPresetHub") || null;
    }
    if (!currentHubNode) return;

    const selectedNodes = getSelectedNodes(currentHubNode);
    if (selectedNodes.length === 0) {
        showToast("⚠️ 캔버스에서 먼저 노드들을 마우스로 선택(Ctrl+클릭 / 드래그)해 주세요!", "warning");
        return;
    }

    const input = document.getElementById("usp-hub-name-input");
    const name = input.value.trim();
    if (!name) {
        showToast("⚠️ 유니버셜 프리셋 이름을 입력해 주세요!", "warning");
        input.focus();
        return;
    }

    if (onSaveMasterCallback) {
        onSaveMasterCallback(currentHubNode, name);
        input.value = "";
        renderHubPresetList();
        renderSelectedNodesPreview(currentHubNode);
        showToast(`💾 [${name}] 유니버셜 프리셋이 저장되었습니다! (총 ${selectedNodes.length}개 노드)`, "gold");
    }
}

function renderHubPresetList() {
    const container = document.getElementById("usp-hub-presets-container");
    container.innerHTML = "";

    if (!currentHubNode && app.graph?._nodes) {
        currentHubNode = app.graph._nodes.find(n => n.type === "UniversalPresetHub" || n.comfyClass === "UniversalPresetHub") || null;
    }

    const presets = getHubPresetsCallback ? getHubPresetsCallback(currentHubNode) : (currentHubNode?.properties?.hub_presets || {});
    const presetNames = Object.keys(presets);

    if (presetNames.length === 0) {
        container.innerHTML = `
            <div class="usp-empty-notice">
                ${BadaI18n.t("modal_hub_empty")}
            </div>
        `;
        return;
    }

    presetNames.forEach((presetName, index) => {
        const presetData = presets[presetName];
        const card = createMasterPresetCard(presetName, presetData, index, presetNames.length);
        container.appendChild(card);
    });

    setupHubDragAndDrop(container);
}

function createMasterPresetCard(presetName, presetData, index, totalCount) {
    const card = document.createElement("div");
    card.className = "usp-preset-card hub-card";
    card.draggable = true;
    card.dataset.index = index;
    card.dataset.name = presetName;

    const isExpanded = expandedHubState.has(presetName);
    if (isExpanded) {
        card.classList.add("expanded");
    }

    const targets = presetData.targets || [];
    const previewHtml = generateTargetsPreview(targets);
    const deepMatrixHtml = generateMasterDeepMatrixHtml(targets);

    card.innerHTML = `
        <div class="usp-card-top">
            <div class="usp-preset-name-box">
                <span class="usp-drag-handle" title="드래그하여 순서 변경">⠿</span>
                <span class="usp-preset-icon">🌟</span>
                <span class="usp-preset-name-text" title="클릭하여 이름 수정">${escapeHtml(presetName)}</span>
                <span class="usp-preset-badge-tag">${targets.length}개 노드 연동</span>
            </div>
            <div class="usp-card-actions">
                <!-- Reorder buttons -->
                <button class="usp-btn usp-btn-order" data-action="up" title="Up" ${index === 0 ? "disabled" : ""}>▲</button>
                <button class="usp-btn usp-btn-order" data-action="down" title="Down" ${index === totalCount - 1 ? "disabled" : ""}>▼</button>
                
                <button class="usp-btn usp-btn-expand ${isExpanded ? "active" : ""}" data-action="toggle-expand" title="Details">
                    <span class="usp-expand-icon">▼</span> ${isExpanded ? BadaI18n.t("modal_collapse_btn") : BadaI18n.t("modal_details_btn")}
                </button>
                <button class="usp-btn usp-btn-apply" data-action="apply">
                    <span>▶</span> ${BadaI18n.t("modal_apply_btn")}
                </button>
                <button class="usp-btn usp-btn-secondary" data-action="rename" title="Rename">
                    <span>✏️</span>
                </button>
                <button class="usp-btn usp-btn-danger" data-action="delete" title="Delete">
                    <span>🗑️</span>
                </button>
            </div>
        </div>
        <div class="usp-preview-box">
            ${previewHtml}
        </div>
        <div class="usp-card-expanded-content">
            ${deepMatrixHtml}
        </div>
    `;

    // 1. Instant Apply (Closes modal immediately + Non-blocking Toast)
    card.querySelector('[data-action="apply"]').addEventListener("click", () => {
        closeHubModal();
        if (onApplyMasterCallback) {
            onApplyMasterCallback(presetName, presetData, currentHubNode);
        }
    });

    // 2. Expand / Collapse Toggle
    const expandBtn = card.querySelector('[data-action="toggle-expand"]');
    expandBtn.addEventListener("click", () => {
        if (expandedHubState.has(presetName)) {
            expandedHubState.delete(presetName);
            card.classList.remove("expanded");
            expandBtn.classList.remove("active");
            expandBtn.innerHTML = `<span class="usp-expand-icon">▼</span> ${BadaI18n.t("modal_details_btn")}`;
        } else {
            expandedHubState.add(presetName);
            card.classList.add("expanded");
            expandBtn.classList.add("active");
            expandBtn.innerHTML = `<span class="usp-expand-icon">▼</span> ${BadaI18n.t("modal_collapse_btn")}`;
        }
    });

    // 3. Inline Rename (No prompt popups!)
    const titleSpan = card.querySelector(".usp-preset-name-text");
    const renameBtn = card.querySelector('[data-action="rename"]');

    const triggerInlineRename = () => {
        startMasterInlineRename(card, presetName, (newName) => {
            if (onRenameMasterCallback) {
                onRenameMasterCallback(presetName, newName, currentHubNode);
                if (expandedHubState.has(presetName)) {
                    expandedHubState.delete(presetName);
                    expandedHubState.add(newName);
                }
                renderHubPresetList();
                showToast(`✏️ 유니버셜 프리셋 이름이 [${newName}] (으)로 변경되었습니다.`, "gold");
            }
        });
    };

    renameBtn.addEventListener("click", triggerInlineRename);
    titleSpan.addEventListener("dblclick", triggerInlineRename);

    // 4. Reorder Up / Down
    card.querySelector('[data-action="up"]').addEventListener("click", () => {
        if (onReorderMasterCallback && index > 0) {
            onReorderMasterCallback(index, index - 1, currentHubNode);
            renderHubPresetList();
            showToast("↕️ 유니버셜 프리셋 순서가 변경되었습니다.", "gold");
        }
    });

    card.querySelector('[data-action="down"]').addEventListener("click", () => {
        if (onReorderMasterCallback && index < totalCount - 1) {
            onReorderMasterCallback(index, index + 1, currentHubNode);
            renderHubPresetList();
            showToast("↕️ 유니버셜 프리셋 순서가 변경되었습니다.", "gold");
        }
    });

    // 5. Delete
    card.querySelector('[data-action="delete"]').addEventListener("click", () => {
        if (confirm(`'${presetName}' 유니버셜 프리셋을 정말 삭제하시겠습니까?`)) {
            if (onDeleteMasterCallback) {
                onDeleteMasterCallback(presetName, currentHubNode);
                expandedHubState.delete(presetName);
                renderHubPresetList();
                showToast(`🗑️ [${presetName}] 유니버셜 프리셋이 삭제되었습니다.`, "warning");
            }
        }
    });

    return card;
}

/**
 * Inline Rename for Master Presets
 */
function startMasterInlineRename(card, oldName, onSave) {
    const nameBox = card.querySelector(".usp-preset-name-box");
    const titleSpan = card.querySelector(".usp-preset-name-text");
    if (!nameBox || !titleSpan) return;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "usp-inline-edit-input gold";
    input.value = oldName;

    titleSpan.replaceWith(input);
    input.focus();
    input.select();

    let isFinished = false;

    const finishEdit = (shouldSave) => {
        if (isFinished) return;
        isFinished = true;

        const newName = input.value.trim();
        if (shouldSave && newName && newName !== oldName) {
            onSave(newName);
        } else {
            input.replaceWith(titleSpan);
        }
    };

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            finishEdit(true);
        } else if (e.key === "Escape") {
            finishEdit(false);
        }
    });

    input.addEventListener("blur", () => {
        finishEdit(true);
    });
}

/**
 * Setup Drag and Drop for Master Preset Cards
 */
function setupHubDragAndDrop(container) {
    let draggedCard = null;

    container.querySelectorAll(".usp-preset-card").forEach((card) => {
        card.addEventListener("dragstart", (e) => {
            draggedCard = card;
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", card.dataset.index);
            card.classList.add("dragging");
        });

        card.addEventListener("dragend", () => {
            card.classList.remove("dragging");
            container.querySelectorAll(".usp-preset-card").forEach((c) => {
                c.classList.remove("drag-over-top", "drag-over-bottom");
            });
            draggedCard = null;
        });

        card.addEventListener("dragover", (e) => {
            e.preventDefault();
            if (!draggedCard || draggedCard === card) return;

            const rect = card.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;

            if (e.clientY < midpoint) {
                card.classList.add("drag-over-top");
                card.classList.remove("drag-over-bottom");
            } else {
                card.classList.add("drag-over-bottom");
                card.classList.remove("drag-over-top");
            }
        });

        card.addEventListener("dragleave", () => {
            card.classList.remove("drag-over-top", "drag-over-bottom");
        });

        card.addEventListener("drop", (e) => {
            e.preventDefault();
            card.classList.remove("drag-over-top", "drag-over-bottom");
            if (!draggedCard || draggedCard === card) return;

            const fromIndex = parseInt(draggedCard.dataset.index, 10);
            const toIndex = parseInt(card.dataset.index, 10);

            if (onReorderMasterCallback && fromIndex !== toIndex) {
                onReorderMasterCallback(fromIndex, toIndex, currentHubNode);
                renderHubPresetList();
                showToast("↕️ 유니버셜 프리셋 순서가 변경되었습니다.", "gold");
            }
        });
    });
}

function generateTargetsPreview(targets) {
    if (!targets || targets.length === 0) {
        return '<span class="usp-tag">연동된 노드 없음</span>';
    }

    return targets.map(t => {
        const title = t.title || t.nodeType || "Node";
        const isBypassed = t.state?.isBypassed || t.state?.mode === 4;
        const isMuted = t.state?.isMuted || t.state?.mode === 2;

        if (isBypassed) {
            return `<span class="usp-tag usp-tag-node bypass"><span class="usp-tag-node-title">${escapeHtml(title)}</span> <span class="usp-tag-node-detail bypass">(🟣 바이패스)</span></span>`;
        }
        if (isMuted) {
            return `<span class="usp-tag usp-tag-node mute"><span class="usp-tag-node-title">${escapeHtml(title)}</span> <span class="usp-tag-node-detail mute">(🔴 뮤트)</span></span>`;
        }

        let detail = "";
        if (t.state?._isFastGroups && t.state.groups) {
            const count = Object.keys(t.state.groups).length;
            detail = `그룹 ${count}개 제어`;
        } else if (t.state?._isLoraStack && Array.isArray(t.state.loras)) {
            const activeCount = t.state.loras.filter(l => l && l.on !== false && l.lora && l.lora !== "None").length;
            detail = `LoRA ${activeCount || t.state.loras.length}종`;
        } else if (t.state?.widgets) {
            const keys = Object.keys(t.state.widgets);
            if (keys.length > 0) {
                const sampleVal = String(t.state.widgets[keys[0]] ?? "").split(/[\/\\]/).pop();
                detail = sampleVal.length > 14 ? sampleVal.slice(0, 12) + "..." : sampleVal;
            }
        }

        return `<span class="usp-tag usp-tag-node"><span class="usp-tag-node-title">${escapeHtml(title)}</span>${detail ? ` <span class="usp-tag-node-detail">(${escapeHtml(detail)})</span>` : ""}</span>`;
    }).join("");
}

function generateMasterDeepMatrixHtml(targets) {
    if (!targets || targets.length === 0) {
        return '<div class="usp-empty-notice">연동된 노드 세부 정보가 없습니다.</div>';
    }

    const nodeBoxes = targets.map(t => {
        const title = t.title || t.nodeType || "Node";
        const nodeType = t.nodeType || "Unknown";
        const isBypassed = t.state?.isBypassed || t.state?.mode === 4;
        const isMuted = t.state?.isMuted || t.state?.mode === 2;
        const params = [];

        if (isBypassed) {
            params.push(`
                <div class="usp-mode-status-notice bypass">
                    <span class="usp-mode-icon">🟣</span>
                    <div class="usp-mode-text">
                        <div class="usp-mode-heading">바이패스 (Bypass) 모드</div>
                        <div class="usp-mode-sub">이 프리셋 적용 시 노드를 건너뛰고 입력 데이터를 그대로 통과시킵니다.</div>
                    </div>
                </div>
            `);
        } else if (isMuted) {
            params.push(`
                <div class="usp-mode-status-notice mute">
                    <span class="usp-mode-icon">🔴</span>
                    <div class="usp-mode-text">
                        <div class="usp-mode-heading">뮤트 (Mute) 모드</div>
                        <div class="usp-mode-sub">이 프리셋 적용 시 노드 실행이 완전히 중단됩니다.</div>
                    </div>
                </div>
            `);
        }

        // Fast Groups (rgthree)
        if (t.state?._isFastGroups && t.state.groups) {
            for (const [gName, gVal] of Object.entries(t.state.groups)) {
                params.push(`
                    <div class="usp-expanded-param-item">
                        <span class="usp-param-key">${escapeHtml(gName)}:</span>
                        <span class="usp-param-val" style="color: ${gVal ? "#38bdf8" : "#94a3b8"}; font-weight: bold;">${gVal ? "ON (활성)" : "OFF (바이패스)"}</span>
                    </div>
                `);
            }
        }

        // LoRAs
        if (t.state?._isLoraStack && Array.isArray(t.state.loras)) {
            t.state.loras.forEach((l, idx) => {
                const name = String(l.lora || "None").split(/[\/\\]/).pop();
                const str = l.strength !== undefined ? l.strength : 1.0;
                const stateIcon = l.on === false ? "⚪" : "🟣";
                params.push(`
                    <div class="usp-expanded-param-item usp-lora-row">
                        <span class="usp-lora-idx">${stateIcon} #${idx + 1}</span>
                        <span class="usp-lora-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
                        <span class="usp-lora-weight">${str}</span>
                    </div>
                `);
            });
        }

        // Widgets
        if (t.state?.widgets) {
            for (const [key, val] of Object.entries(t.state.widgets)) {
                if (key.startsWith("_") || typeof val === "object" || typeof val === "function") continue;
                let displayVal = String(val);
                if (/ckpt_name|model_name|vae_name|clip_name|unet_name|lora_name/i.test(key)) {
                    displayVal = displayVal.split(/[\/\\]/).pop();
                }
                params.push(`
                    <div class="usp-expanded-param-item">
                        <span class="usp-param-key">${escapeHtml(key)}:</span>
                        <span class="usp-param-val">${escapeHtml(displayVal)}</span>
                    </div>
                `);
            }
        }

        if (params.length === 0) {
            params.push('<div class="usp-expanded-param-item"><span class="usp-param-key">기본 설정값 연동</span></div>');
        }

        return `
            <div class="usp-expanded-node-box ${isBypassed ? "bypass" : (isMuted ? "mute" : "")}">
                <div class="usp-expanded-node-title">
                    <span>${escapeHtml(title)}</span>
                    ${isBypassed ? '<span class="usp-chip-mode-badge bypass">🟣 Bypass</span>' : (isMuted ? '<span class="usp-chip-mode-badge mute">🔴 Mute</span>' : "")}
                    <span class="usp-expanded-node-type">${escapeHtml(nodeType)}</span>
                </div>
                <div class="usp-expanded-params-list">
                    ${params.join("")}
                </div>
            </div>
        `;
    }).join("");

    return `
        <div style="font-weight: 700; color: #f1f5f9; margin-bottom: 12px; font-size: 0.94rem;">📋 연동 노드별 상세 파라미터 매트릭스:</div>
        <div class="usp-expanded-grid">
            ${nodeBoxes}
        </div>
    `;
}

function escapeHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
