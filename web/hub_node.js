/**
 * ComfyUI Universal Preset Hub Node Extension
 * - Node 2.0 compatible: UI renders as a DOM widget (addDOMWidget), no canvas painting
 * - Real-Time Multi-Instance Wireless Mirroring (All Hub Nodes on canvas sync 100% like clones)
 * - Direct Radio Switcher Panel: Instant One-Click Preset Switching
 * - Exclusive Single-Active State (Radio Button Mode across Workflow)
 * - Dynamic Node Auto-Height Scaling & Native Internal Scrolling
 * - Drag & Drop Reordering with Visual Insertion Guide
 * - Complete Two-Way Sync with Universal Preset Hub Modal
 * - Zero Cross-Workflow Leakage + Automatic PNG Metadata Embedding
 */

import { app } from "../../scripts/app.js";
import { extractNodeState, applyNodeState } from "./smart_presets.js";
import { initHubModal, showHubManageModal } from "./hub_modal.js";
import { showToast } from "./presets_modal.js";
import { BadaI18n } from "./bada_i18n.js";

const ROW_HEIGHT = 24;
const ROW_GAP = 4;
const HEADER_HEIGHT = 24;
const EMPTY_HEIGHT = 38;
const TOP_BTN_HEIGHT = 28;
const TOP_CONTROLS_HEIGHT = 40; // 6(top pad) + 28(btn) + 6(bottom pad)
const BOTTOM_PADDING = 8;
const MAX_VISIBLE_ROWS = 6.5;
const MAX_LIST_VIEW_HEIGHT = Math.round(MAX_VISIBLE_ROWS * (ROW_HEIGHT + ROW_GAP)); // ~182px
const NODE_DEFAULT_WIDTH = 370;

export let hubPresetsStore = {}; // Backwards compatibility

let selectionWatcherAttached = false;
let stylesInjected = false;

function isHubNode(n) {
    return !!n && (n.comfyClass === "BadaPresetHub" || n.type === "BadaPresetHub");
}

/**
 * Shared stylesheet for the hub DOM panel (injected once)
 */
function injectHubStyles() {
    if (stylesInjected || typeof document === "undefined") return;
    stylesInjected = true;

    const style = document.createElement("style");
    style.id = "bada-hub-node-css";
    style.textContent = `
    .bada-hub-root {
        font-family: Arial, sans-serif;
        color: #f8fafc;
        width: 100%;
        box-sizing: border-box;
        padding: 6px 10px 8px 10px;
        user-select: none;
    }
    .bada-hub-toprow { display: flex; gap: 6px; margin-bottom: 6px; }
    .bada-hub-btn {
        height: ${TOP_BTN_HEIGHT}px; border-radius: 5px; font-size: 11.5px; font-weight: bold;
        display: flex; align-items: center; justify-content: center; cursor: pointer;
        border: 1px solid rgba(255, 255, 255, 0.1); white-space: nowrap; overflow: hidden;
    }
    .bada-hub-save {
        flex: 1; background: rgba(30, 41, 59, 0.65); color: #94a3b8;
        font-weight: 600; font-size: 11px;
    }
    .bada-hub-save.active {
        background: linear-gradient(#0e3a4e, #0a2533);
        border-color: rgba(56, 189, 248, 0.6); color: #38bdf8; font-weight: bold;
    }
    .bada-hub-settings {
        width: 74px; flex-shrink: 0;
        background: linear-gradient(#334155, #1e293b);
        border-color: rgba(245, 158, 11, 0.55); color: #fbbf24;
    }
    .bada-hub-header { display: flex; justify-content: space-between; align-items: center; height: ${HEADER_HEIGHT}px; }
    .bada-hub-title { color: #f59e0b; font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; }
    .bada-hub-hint { color: #94a3b8; font-size: 10px; margin-left: 8px; white-space: nowrap; }
    .bada-hub-list {
        display: flex; flex-direction: column; gap: ${ROW_GAP}px;
        max-height: ${MAX_LIST_VIEW_HEIGHT}px; overflow-y: auto; overflow-x: hidden;
        padding-right: 4px; scrollbar-width: thin; scrollbar-color: rgba(245, 158, 11, 0.75) transparent;
    }
    .bada-hub-list::-webkit-scrollbar { width: 4px; }
    .bada-hub-list::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.08); border-radius: 2px; }
    .bada-hub-list::-webkit-scrollbar-thumb { background: rgba(245, 158, 11, 0.75); border-radius: 2px; }
    .bada-hub-row {
        display: flex; align-items: center; height: ${ROW_HEIGHT}px; min-height: ${ROW_HEIGHT}px;
        border-radius: 4px; padding: 0 5px 0 2px; box-sizing: border-box; cursor: pointer;
        background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .bada-hub-row.active {
        background: linear-gradient(90deg, rgba(245, 158, 11, 0.2), rgba(217, 119, 6, 0.09));
        border-color: rgba(245, 158, 11, 0.85);
    }
    .bada-hub-row.dragging { opacity: 0.4; }
    .bada-hub-row.drop-before { box-shadow: 0 -2px 0 0 #f59e0b; }
    .bada-hub-row.drop-after { box-shadow: 0 2px 0 0 #f59e0b; }
    .bada-hub-grip { width: 18px; flex-shrink: 0; text-align: center; color: #64748b; font-size: 11px; cursor: grab; }
    .bada-hub-row.active .bada-hub-grip { color: #fcd34d; }
    .bada-hub-name {
        flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        font-size: 12px; color: #f8fafc;
    }
    .bada-hub-row.active .bada-hub-name { color: #fef08a; font-weight: bold; }
    .bada-hub-tag { font-size: 10.5px; color: #94a3b8; margin: 0 6px; white-space: nowrap; }
    .bada-hub-row.active .bada-hub-tag { color: #fcd34d; }
    .bada-hub-switch {
        position: relative; width: 46px; height: 16px; border-radius: 8px; flex-shrink: 0;
        background: #1e293b; border: 1px solid rgba(255, 255, 255, 0.16);
    }
    .bada-hub-switch .bada-hub-knob {
        position: absolute; top: 1.5px; left: 2px; width: 11px; height: 11px;
        border-radius: 50%; background: #475569;
    }
    .bada-hub-switch .bada-hub-state {
        position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
        font-size: 8.5px; font-weight: bold; color: #64748b;
    }
    .bada-hub-switch.on { background: linear-gradient(90deg, #10b981, #059669); border-color: rgba(255, 255, 255, 0.9); }
    .bada-hub-switch.on .bada-hub-knob { left: auto; right: 2px; background: #ffffff; }
    .bada-hub-switch.on .bada-hub-state { right: auto; left: 7px; color: #ffffff; }
    .bada-hub-empty {
        border: 1px dashed rgba(255, 255, 255, 0.15); border-radius: 6px; color: #94a3b8;
        font-size: 11px; text-align: center; padding: 10px 6px; margin-top: 6px;
    }`;
    document.head.appendChild(style);
}
/**
 * Automatically ensures that the currently active preset is visible inside the DOM list viewport
 */
export function ensureActivePresetInView(node) {
    if (!node || !node.properties) return;
    const ui = node._hubUI;
    if (!ui || !ui.listEl) return;

    const presets = getHubPresets(node);
    const activeName = node.properties.active_preset;
    if (!activeName || !presets[activeName]) return;

    const activeIdx = Object.keys(presets).indexOf(activeName);
    if (activeIdx < 0) return;

    const list = ui.listEl;
    const rowEl = list.children[activeIdx];
    if (!rowEl) return;

    const listRect = list.getBoundingClientRect();
    const rowRect = rowEl.getBoundingClientRect();
    if (rowRect.top < listRect.top) {
        list.scrollTop -= listRect.top - rowRect.top;
    } else if (rowRect.bottom > listRect.bottom) {
        list.scrollTop += rowRect.bottom - listRect.bottom;
    }
    node._scrollOffset = list.scrollTop;
}

/**
 * Broadcast updated presets and active state to ALL BadaPresetHub nodes on canvas in real-time
 */
export function broadcastHubPresets(presets, activePreset = null) {
    if (!app.graph?._nodes) return;

    for (const n of app.graph._nodes) {
        if (!isHubNode(n)) continue;
        if (!n.properties) n.properties = {};
        n.properties.hub_presets = JSON.parse(JSON.stringify(presets));
        if (activePreset !== null) {
            n.properties.active_preset = activePreset;
        }
    }
    updateAllHubNodes();
}

/**
 * Get hub presets dictionary from a BadaPresetHub node instance (Synchronized across all canvas hub nodes)
 */
export function getHubPresets(hubNode) {
    if (!hubNode && app.graph?._nodes) {
        hubNode = app.graph._nodes.find(isHubNode);
    }
    if (!hubNode) return {};
    if (!hubNode.properties) hubNode.properties = {};
    if (!hubNode.properties.hub_presets || typeof hubNode.properties.hub_presets !== "object") {
        hubNode.properties.hub_presets = {};
    }

    // If this node is empty but other hub nodes on canvas have presets, auto-inherit
    if (Object.keys(hubNode.properties.hub_presets).length === 0 && app.graph?._nodes) {
        const otherHub = app.graph._nodes.find(n =>
            isHubNode(n) &&
            n !== hubNode &&
            n.properties?.hub_presets &&
            Object.keys(n.properties.hub_presets).length > 0
        );
        if (otherHub) {
            hubNode.properties.hub_presets = JSON.parse(JSON.stringify(otherHub.properties.hub_presets));
            if (otherHub.properties.active_preset) {
                hubNode.properties.active_preset = otherHub.properties.active_preset;
            }
        }
    }

    return hubNode.properties.hub_presets;
}

/**
 * Dynamically calculate and request the exact required size for BadaPresetHub node
 */
export function computeHubNodeSize(node) {
    if (!node || !node.size) return [NODE_DEFAULT_WIDTH, 140];
    const presets = getHubPresets(node);
    const count = Object.keys(presets).length;

    let listHeight = 0;
    if (count === 0) {
        listHeight = HEADER_HEIGHT + EMPTY_HEIGHT;
    } else {
        const fullContentHeight = HEADER_HEIGHT + count * (ROW_HEIGHT + ROW_GAP);
        listHeight = Math.min(fullContentHeight, HEADER_HEIGHT + MAX_LIST_VIEW_HEIGHT);
    }

    const totalHeight = TOP_CONTROLS_HEIGHT + listHeight + BOTTOM_PADDING;
    const currentW = Math.max(node.size[0] || NODE_DEFAULT_WIDTH, NODE_DEFAULT_WIDTH);
    node.size = [currentW, totalHeight];
    return node.size;
}

/**
 * Live selection watcher (replaces legacy LGraphCanvas prototype patches).
 * Uses the frontend canvas event bus when available; the DOM panel also
 * refreshes the detection badge on hover as a universal fallback.
 */
function attachSelectionWatcher() {
    if (selectionWatcherAttached) return;
    try {
        if (app.canvas && typeof app.canvas.addEventListener === "function") {
            app.canvas.addEventListener("selection:changed", () => refreshAllHubSelectionBadges());
            selectionWatcherAttached = true;
        }
    } catch (e) {
        console.debug("[Bada Hub] selection watcher unavailable:", e);
    }
}

function refreshAllHubSelectionBadges() {
    if (!app.graph?._nodes) return;
    for (const node of app.graph._nodes) {
        if (isHubNode(node)) node._hubUI?.updateSelectionBadge?.();
    }
}
/**
 * Register BadaPresetHub extension
 */
app.registerExtension({
    name: "ComfyUI.BadaPresetHub",

    async setup() {

        // Auto-clean any legacy global localStorage hub cache
        try {
            localStorage.removeItem("ComfyUI_Master_Hub_Presets_v1");
            localStorage.removeItem("ComfyUI_Universal_Hub_Presets_v1");
        } catch (e) { console.debug("[Bada] ignored:", e); }

        // Initialize Grand Modal Callbacks with synced data across all nodes
        initHubModal({
            getPresets: (hubNode) => getHubPresets(hubNode),
            onApply: (presetName, presetData, hubNode) => {
                applyMasterPresetToWorkflow(presetData, hubNode);
            },
            onSave: (hubNode, presetName) => {
                saveMasterPresetFromSelection(hubNode, presetName);
            },
            onDelete: (presetName, hubNode) => {
                const presets = getHubPresets(hubNode);
                delete presets[presetName];
                let newActive = hubNode?.properties?.active_preset;
                if (newActive === presetName) {
                    const remaining = Object.keys(presets);
                    newActive = remaining.length > 0 ? remaining[0] : "None";
                }
                broadcastHubPresets(presets, newActive);
                app.graph?.setDirtyCanvas(true, true);
            },
            onRename: (oldName, newName, hubNode) => {
                const presets = getHubPresets(hubNode);
                if (presets[oldName]) {
                    const data = presets[oldName];
                    data.name = newName;
                    delete presets[oldName];
                    presets[newName] = data;
                    let newActive = hubNode?.properties?.active_preset;
                    if (newActive === oldName) {
                        newActive = newName;
                    }
                    broadcastHubPresets(presets, newActive);
                    app.graph?.setDirtyCanvas(true, true);
                }
            },
            onReorder: (fromIdx, toIdx, hubNode) => {
                const presets = getHubPresets(hubNode);
                const entries = Object.entries(presets);
                const [moved] = entries.splice(fromIdx, 1);
                entries.splice(toIdx, 0, moved);

                const newStore = {};
                for (const [k, v] of entries) {
                    newStore[k] = v;
                }
                broadcastHubPresets(newStore);
                app.graph?.setDirtyCanvas(true, true);
            },
            onExport: (hubNode) => {
                const presets = getHubPresets(hubNode);
                const blob = new Blob([JSON.stringify(presets, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `comfyui_universal_hub_presets_${new Date().toISOString().slice(0, 10)}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast(BadaI18n.t("toast_hub_export_success"), "info");
            },
            onImport: (importedData, hubNode) => {
                if (importedData && typeof importedData === "object") {
                    const presets = getHubPresets(hubNode);
                    Object.assign(presets, importedData);
                    broadcastHubPresets(presets);
                    app.graph?.setDirtyCanvas(true, true);
                    showToast(BadaI18n.t("toast_hub_import_success"), "success");
                }
            },
        });

        attachSelectionWatcher();
    },

    async nodeCreated(node) {
        if (isHubNode(node)) {
            node.title = BadaI18n.t("hub_node_title");
            // Inherit presets from any existing hub node on canvas
            getHubPresets(node);
            setupHubNodeWidgets(node);
            computeHubNodeSize(node);
        }
    },

    async loadedGraphNode(node) {
        if (isHubNode(node)) {
            node.title = BadaI18n.t("hub_node_title");
            getHubPresets(node);
            setupHubNodeWidgets(node);
            computeHubNodeSize(node);
        }
    },

    afterConfigureGraph() {
        attachSelectionWatcher();
        if (app.graph?._nodes) {
            for (const node of app.graph._nodes) {
                if (isHubNode(node)) {
                    node.title = BadaI18n.t("hub_node_title");
                    getHubPresets(node);
                    setupHubNodeWidgets(node);
                    computeHubNodeSize(node);
                }
            }
            updateAllHubNodes();
        }
    }
});

// Auto-refresh all hub nodes when Bada language setting changes
BadaI18n.subscribe(() => {
    if (app.graph?._nodes) {
        for (const node of app.graph._nodes) {
            if (isHubNode(node)) {
                node.title = BadaI18n.t("hub_node_title");
            }
        }
    }
    updateAllHubNodes();
});

/**
 * Get list of currently selected nodes on canvas (Supports both Ctrl+Click and Ctrl+Drag Box Area Selection)
 */
export function getCurrentlySelectedNodes(hubNode) {
    const selectedMap = new Map();

    // 1. Collect from app.canvas.selected_nodes (Object map: { [id]: node })
    if (app.canvas?.selected_nodes) {
        for (const k in app.canvas.selected_nodes) {
            const n = app.canvas.selected_nodes[k];
            if (n && n.id !== undefined) {
                selectedMap.set(n.id, n);
            }
        }
    }

    // 2. Collect from app.graph._nodes (is_selected flag set by LiteGraph Area/Box selection)
    if (app.graph?._nodes) {
        for (const n of app.graph._nodes) {
            if (n && n.is_selected && n.id !== undefined) {
                selectedMap.set(n.id, n);
            }
        }
    }

    // 3. Filter out hubNode itself and any BadaPresetHub nodes
    const selected = [];
    for (const [id, n] of selectedMap.entries()) {
        if (n && n !== hubNode && n.type !== "BadaPresetHub" && n.comfyClass !== "BadaPresetHub") {
            selected.push(n);
        }
    }

    return selected;
}

/**
 * Top-row [Save from Selection] button behavior (opens modal with prefilled default name)
 */
function openHubSaveFlow(node) {
    const selectedNodes = getCurrentlySelectedNodes(node);
    if (selectedNodes.length === 0) {
        showToast(BadaI18n.t("modal_hub_no_selection"), "warning");
        return;
    }

    const presets = getHubPresets(node);
    const defaultName = `${BadaI18n.t("hub_preset_default_name")} #${Object.keys(presets).length + 1}`;
    showHubManageModal(node, { focusSave: true, defaultName: defaultName });
    app.graph?.setDirtyCanvas(true, true);
}

/**
 * Move a preset entry to a new index and broadcast the reordered store
 */
function movePresetOrder(node, fromIndex, insertAt, movedName) {
    const presets = getHubPresets(node);
    const entries = Object.entries(presets);
    if (fromIndex < 0 || fromIndex >= entries.length) return;

    const [moved] = entries.splice(fromIndex, 1);
    const finalIndex = insertAt > fromIndex ? insertAt - 1 : insertAt;
    entries.splice(Math.max(0, Math.min(entries.length, finalIndex)), 0, moved);

    const newStore = {};
    for (const [k, v] of entries) {
        newStore[k] = v;
    }
    broadcastHubPresets(newStore);
    showToast(`↕️ [${movedName}] 프리셋 순서가 변경되었습니다.`, "gold");
}
/**
 * Build the DOM panel UI for a hub node (rendered inside the DOM widget host)
 */
function buildHubUI(node) {
    injectHubStyles();

    const root = document.createElement("div");
    root.className = "bada-hub-root";

    const topRow = document.createElement("div");
    topRow.className = "bada-hub-toprow";

    const saveBtn = document.createElement("div");
    saveBtn.className = "bada-hub-btn bada-hub-save";

    const settingsBtn = document.createElement("div");
    settingsBtn.className = "bada-hub-btn bada-hub-settings";
    settingsBtn.textContent = BadaI18n.t("hub_settings_btn");

    topRow.append(saveBtn, settingsBtn);

    const header = document.createElement("div");
    header.className = "bada-hub-header";
    const titleEl = document.createElement("span");
    titleEl.className = "bada-hub-title";
    const hintEl = document.createElement("span");
    hintEl.className = "bada-hub-hint";
    header.append(titleEl, hintEl);

    const listEl = document.createElement("div");
    listEl.className = "bada-hub-list";

    const emptyEl = document.createElement("div");
    emptyEl.className = "bada-hub-empty";
    emptyEl.textContent = BadaI18n.t("hub_empty_hint");

    root.append(topRow, header, listEl, emptyEl);

    let lastSig = null;
    let dragState = null; // { fromIndex, name }
    let pendingInsertAt = -1;
    let suppressClickUntil = 0;

    // --- Top action buttons ---
    saveBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openHubSaveFlow(node);
    });
    settingsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showHubManageModal(node);
        app.graph?.setDirtyCanvas(true, true);
    });

    // Universal fallback: refresh detection badge whenever the pointer enters the panel
    root.addEventListener("pointerenter", () => updateSelectionBadge());

    function updateSelectionBadge() {
        const selCount = getCurrentlySelectedNodes(node).length;
        if (selCount > 0) {
            saveBtn.classList.add("active");
            saveBtn.textContent = BadaI18n.t("hub_detected_nodes", { count: selCount });
        } else {
            saveBtn.classList.remove("active");
            saveBtn.textContent = BadaI18n.t("hub_select_nodes");
        }
        return selCount;
    }

    function clearDropMarks() {
        pendingInsertAt = -1;
        listEl.querySelectorAll(".bada-hub-row").forEach(r => r.classList.remove("drop-before", "drop-after"));
    }

    function makeRow(name, presetData, idx, isActive) {
        const row = document.createElement("div");
        row.className = "bada-hub-row" + (isActive ? " active" : "");
        row.dataset.index = String(idx);

        const grip = document.createElement("span");
        grip.className = "bada-hub-grip";
        grip.textContent = "⠿";
        grip.title = "드래그하여 순서 변경";

        const nameEl = document.createElement("span");
        nameEl.className = "bada-hub-name";
        nameEl.textContent = `⚓ ${name}`;
        nameEl.title = name;

        const tagEl = document.createElement("span");
        tagEl.className = "bada-hub-tag";
        const nodeCount = presetData?.targets?.length || 0;
        tagEl.textContent = BadaI18n.t("hub_row_tag", { count: nodeCount });

        const sw = document.createElement("span");
        sw.className = "bada-hub-switch" + (isActive ? " on" : "");
        const knob = document.createElement("span");
        knob.className = "bada-hub-knob";
        const stateEl = document.createElement("span");
        stateEl.className = "bada-hub-state";
        stateEl.textContent = isActive ? "ON" : "OFF";
        sw.append(knob, stateEl);

        row.append(grip, nameEl, tagEl, sw);

        // Click row or switch: activate preset and sync across ALL hub nodes
        row.addEventListener("click", (e) => {
            e.stopPropagation();
            if (dragState || Date.now() < suppressClickUntil) return;
            const presets = getHubPresets(node);
            if (!presets[name]) return;
            applyMasterPresetToWorkflow(presets[name], node);
            broadcastHubPresets(presets, name);
        });

        // Reordering is initiated from the grip handle only
        grip.addEventListener("pointerdown", () => { row.draggable = true; });
        row.addEventListener("dragstart", (e) => {
            dragState = { fromIndex: idx, name };
            row.classList.add("dragging");
            try {
                e.dataTransfer.setData("text/plain", String(idx));
                e.dataTransfer.effectAllowed = "move";
            } catch (err) { console.debug("[Bada Hub] ignored:", err); }
        });
        row.addEventListener("dragend", () => {
            row.draggable = false;
            row.classList.remove("dragging");
            dragState = null;
            clearDropMarks();
            suppressClickUntil = Date.now() + 150;
        });

        return row;
    }

    // --- Drag & Drop reordering (insertion guide) ---
    listEl.addEventListener("dragover", (e) => {
        if (!dragState) return;
        e.preventDefault();
        try { e.dataTransfer.dropEffect = "move"; } catch (err) { console.debug("[Bada Hub] ignored:", err); }

        clearDropMarks();
        const rows = Array.from(listEl.querySelectorAll(".bada-hub-row"));
        if (rows.length === 0) return;

        let insertAt = rows.length; // default: drop after last row
        for (let i = 0; i < rows.length; i++) {
            const r = rows[i].getBoundingClientRect();
            if (e.clientY < r.top + r.height / 2) {
                insertAt = i;
                break;
            }
        }
        pendingInsertAt = insertAt;
        if (insertAt < rows.length) {
            rows[insertAt].classList.add("drop-before");
        } else {
            rows[rows.length - 1].classList.add("drop-after");
        }
    });

    listEl.addEventListener("dragleave", (e) => {
        if (!listEl.contains(e.relatedTarget)) clearDropMarks();
    });

    listEl.addEventListener("drop", (e) => {
        if (!dragState) return;
        e.preventDefault();

        const fromIndex = dragState.fromIndex;
        const movedName = dragState.name;
        const insertAt = pendingInsertAt;
        dragState = null;
        clearDropMarks();
        suppressClickUntil = Date.now() + 150;

        if (insertAt < 0 || insertAt === fromIndex || insertAt === fromIndex + 1) {
            refresh({ force: true });
            return;
        }
        movePresetOrder(node, fromIndex, insertAt, movedName);
    });

    function refresh({ force = false } = {}) {
        const presets = getHubPresets(node);
        const names = Object.keys(presets);
        const activeName = node.properties?.active_preset || "None";

        updateSelectionBadge();
        titleEl.textContent = BadaI18n.t("hub_presets_header", { count: names.length });
        hintEl.textContent = BadaI18n.t("hub_click_apply");
        settingsBtn.textContent = BadaI18n.t("hub_settings_btn");
        emptyEl.textContent = BadaI18n.t("hub_empty_hint");

        const sig = [
            BadaI18n.lang,
            activeName,
            names.map(nm => `${nm}:${presets[nm]?.targets?.length || 0}`).join("\u0001"),
        ].join("\u0002");

        if (!force && sig === lastSig) return;
        lastSig = sig;
        if (dragState) return; // never rebuild rows in the middle of a drag

        listEl.replaceChildren();
        if (names.length === 0) {
            emptyEl.style.display = "";
        } else {
            emptyEl.style.display = "none";
            names.forEach((nm, idx) => {
                listEl.appendChild(makeRow(nm, presets[nm], idx, nm === activeName));
            });
        }
        ensureActivePresetInView(node);
    }

    return { root, listEl, refresh, updateSelectionBadge };
}
/**
 * Attach the hub DOM widget (official addDOMWidget API: renders on both Node 1.x and Node 2.0)
 */
function setupHubNodeWidgets(node) {
    node.title = BadaI18n.t("hub_node_title");
    if (!node.properties) node.properties = {};
    if (!node.properties.active_preset) node.properties.active_preset = "None";
    if (!node.properties.hub_presets) node.properties.hub_presets = {};
    if (node._scrollOffset === undefined) node._scrollOffset = 0;

    // Build the DOM panel and widget mount only once per node instance
    if (!node._hubHooksInitialized) {
        node._hubHooksInitialized = true;

        const ui = buildHubUI(node);
        node._hubUI = ui;

        node.addDOMWidget("bada_hub_ui", "custom", ui.root, {
            serialize: false,
            hideOnZoom: false,
        });
    }

    node._hubUI?.refresh({ force: true });
}

/**
 * Save snapshot of all currently selected nodes with pos info & mode state (Synced across all hub nodes)
 */
export function saveMasterPresetFromSelection(hubNode, presetName) {
    if (!hubNode && app.graph?._nodes) {
        hubNode = app.graph._nodes.find(isHubNode);
    }
    if (!hubNode) return;

    const selectedNodes = getCurrentlySelectedNodes(hubNode);
    if (selectedNodes.length === 0) {
        showToast(BadaI18n.t("modal_hub_no_selection"), "warning");
        return;
    }

    const targetsData = [];
    for (const targetNode of selectedNodes) {
        targetsData.push({
            id: targetNode.id,
            title: targetNode.title || targetNode.type,
            nodeType: targetNode.comfyClass || targetNode.type,
            pos: targetNode.pos ? [targetNode.pos[0], targetNode.pos[1]] : [0, 0],
            state: extractNodeState(targetNode),
        });
    }

    const presets = getHubPresets(hubNode);
    presets[presetName] = {
        name: presetName,
        timestamp: Date.now(),
        targets: targetsData,
    };

    // Broadcast newly saved preset to ALL hub nodes on the canvas
    broadcastHubPresets(presets, presetName);
    app.graph?.setDirtyCanvas(true, true);
}

/**
 * Apply composite master preset data with Smart 3-Stage Matching
 * 1. Exact ID match (Same workflow)
 * 2. Exact Custom Title + NodeType match (Cross-workflow renamed nodes)
 * 3. Sequential 1:1 NodeType match ordered by relative canvas X position (Zero duplication)
 */
export function applyMasterPresetToWorkflow(presetData, hubNode = null) {
    if (!presetData || !Array.isArray(presetData.targets)) {
        showToast(BadaI18n.t("hub_invalid_data"), "warning");
        return;
    }

    const graph = app.graph;
    if (!graph || !graph._nodes) return;

    let appliedCount = 0;
    const usedNodeIds = new Set();
    const targets = presetData.targets.map(t => ({ ...t, _matched: false }));

    // --- Pass 1: Exact Node ID Matching ---
    for (const target of targets) {
        const nodeById = graph.getNodeById(target.id);
        if (nodeById && !usedNodeIds.has(nodeById.id)) {
            const currentType = nodeById.comfyClass || nodeById.type;
            if (currentType === target.nodeType || !target.nodeType) {
                applyNodeState(nodeById, target.state);
                usedNodeIds.add(nodeById.id);
                target._matched = true;
                appliedCount++;
            }
        }
    }

    // --- Pass 2: Custom Title + NodeType Matching (Cross-Workflow with Named Nodes) ---
    for (const target of targets) {
        if (target._matched) continue;
        if (target.title && target.nodeType) {
            const matchedByTitle = graph._nodes.find(n =>
                !usedNodeIds.has(n.id) &&
                (n.comfyClass || n.type) === target.nodeType &&
                (n.title || n.type) === target.title
            );
            if (matchedByTitle) {
                applyNodeState(matchedByTitle, target.state);
                usedNodeIds.add(matchedByTitle.id);
                target._matched = true;
                appliedCount++;
            }
        }
    }

    // --- Pass 3: Sequential 1:1 Matching by Canvas Position (Left-to-Right Flow) ---
    for (const target of targets) {
        if (target._matched) continue;
        if (target.nodeType) {
            const availableNodes = graph._nodes.filter(n =>
                !usedNodeIds.has(n.id) &&
                (n.comfyClass || n.type) === target.nodeType
            );

            if (availableNodes.length > 0) {
                // Sort by relative canvas X position (left-to-right flow)
                availableNodes.sort((a, b) => (a.pos?.[0] || 0) - (b.pos?.[0] || 0));
                const targetNode = availableNodes[0];

                applyNodeState(targetNode, target.state);
                usedNodeIds.add(targetNode.id);
                target._matched = true;
                appliedCount++;
            }
        }
    }

    // Synchronize active preset across ALL hub nodes on canvas
    if (graph._nodes) {
        for (const n of graph._nodes) {
            if (isHubNode(n)) {
                if (!n.properties) n.properties = {};
                n.properties.active_preset = presetData.name;
            }
        }
    }

    updateAllHubNodes();
    graph.setDirtyCanvas(true, true);
    showToast(BadaI18n.t("hub_apply_done", { name: presetData.name, count: appliedCount }), "gold");
}

/**
 * Update all Hub nodes on canvas (Recomputes size and refreshes DOM panels)
 */
export function updateAllHubNodes() {
    if (!app.graph?._nodes) return;

    for (const node of app.graph._nodes) {
        if (!isHubNode(node)) continue;
        computeHubNodeSize(node);
        node._hubUI?.refresh();
    }
    app.graph.setDirtyCanvas(true, true);
}