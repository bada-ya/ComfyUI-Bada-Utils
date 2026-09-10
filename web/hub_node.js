/**
 * ComfyUI Universal Preset Hub Node Extension
 * - Real-Time Multi-Instance Wireless Mirroring (All Hub Nodes on canvas sync 100% like clones)
 * - Direct On-Canvas Radio Switcher (Fast Groups Style): Instant One-Click Preset Switching
 * - Exclusive Single-Active State (Radio Button Mode across Workflow)
 * - Dynamic Node Auto-Height Scaling & Smooth Internal Mouse-Wheel Scrolling
 * - Canvas Drag & Drop Reordering with Visual Insertion Guide
 * - Complete Two-Way Sync with Universal Preset Hub Modal
 * - Full Support for Node Execution Modes (Bypass 🟣 / Mute 🔴 / Active 🟢)
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

/**
 * Automatically ensures that the currently active preset is always visible inside the node viewport
 */
export function ensureActivePresetInView(node) {
    if (!node || !node.properties) return;
    const presets = getHubPresets(node);
    const presetNames = Object.keys(presets);
    const count = presetNames.length;
    if (count === 0) return;

    const activeName = node.properties.active_preset;
    if (!activeName || !presets[activeName]) return;

    const activeIdx = presetNames.indexOf(activeName);
    if (activeIdx < 0) return;

    const listTopY = TOP_CONTROLS_HEIGHT;
    const listBottomY = node.size[1] - BOTTOM_PADDING;
    const listViewHeight = Math.max(10, listBottomY - listTopY);
    const viewH = Math.max(10, listViewHeight - HEADER_HEIGHT);
    const fullContentHeight = HEADER_HEIGHT + count * (ROW_HEIGHT + ROW_GAP);
    const maxScroll = Math.max(0, fullContentHeight - listViewHeight);

    if (maxScroll <= 0) {
        node._scrollOffset = 0;
        return;
    }

    const itemTop = activeIdx * (ROW_HEIGHT + ROW_GAP);
    const itemBottom = itemTop + ROW_HEIGHT;
    let scroll = Math.max(0, Math.min(maxScroll, node._scrollOffset || 0));

    if (itemTop < scroll) {
        scroll = itemTop;
    } else if (itemBottom > scroll + viewH) {
        scroll = Math.min(maxScroll, itemBottom - viewH);
    }

    node._scrollOffset = scroll;
}

/**
 * Broadcast updated presets and active state to ALL BadaPresetHub nodes on canvas in real-time
 */
export function broadcastHubPresets(presets, activePreset = null) {
    if (!app.graph?._nodes) return;

    for (const n of app.graph._nodes) {
        if (n.type === "BadaPresetHub" || n.comfyClass === "BadaPresetHub") {
            if (!n.properties) n.properties = {};
            n.properties.hub_presets = JSON.parse(JSON.stringify(presets));
            if (activePreset !== null) {
                n.properties.active_preset = activePreset;
            }
            ensureActivePresetInView(n);
        }
    }
    updateAllHubNodes();
}

/**
 * Get hub presets dictionary from a BadaPresetHub node instance (Synchronized across all canvas hub nodes)
 */
export function getHubPresets(hubNode) {
    if (!hubNode && app.graph?._nodes) {
        hubNode = app.graph._nodes.find(n => n.type === "BadaPresetHub" || n.comfyClass === "BadaPresetHub");
    }
    if (!hubNode) return {};
    if (!hubNode.properties) hubNode.properties = {};
    if (!hubNode.properties.hub_presets || typeof hubNode.properties.hub_presets !== "object") {
        hubNode.properties.hub_presets = {};
    }

    // If this node is empty but other hub nodes on canvas have presets, auto-inherit
    if (Object.keys(hubNode.properties.hub_presets).length === 0 && app.graph?._nodes) {
        const otherHub = app.graph._nodes.find(n => 
            (n.type === "BadaPresetHub" || n.comfyClass === "BadaPresetHub") && 
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
 * Dynamically calculate and set the exact required size for BadaPresetHub node
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
 * Register BadaPresetHub extension
 */
app.registerExtension({
    name: "ComfyUI.BadaPresetHub",

    async setup() {
        console.log("[Hub Node] Initializing Cloned Multi-Instance Universal Preset Hub Switchers...");

        // Auto-clean any legacy global localStorage hub cache
        try {
            localStorage.removeItem("ComfyUI_Master_Hub_Presets_v1");
            localStorage.removeItem("ComfyUI_Universal_Hub_Presets_v1");
        } catch (e) {}

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

        // 1. Window-level Wheel listener for smooth internal list scrolling without zooming canvas
        window.addEventListener("wheel", (e) => {
            const canvas = app.canvas;
            if (!canvas || !app.graph?._nodes) return;

            const rect = canvas.canvas?.getBoundingClientRect?.() || document.querySelector("canvas")?.getBoundingClientRect?.();
            if (!rect) return;

            const clientX = e.clientX;
            const clientY = e.clientY;
            if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return;

            const scale = Number(canvas.ds?.scale || 1);
            const offset = canvas.ds?.offset || [0, 0];
            const canvasX = (clientX - rect.left) / scale - offset[0];
            const canvasY = (clientY - rect.top) / scale - offset[1];

            for (const node of app.graph._nodes) {
                if (node.type === "BadaPresetHub" || node.comfyClass === "BadaPresetHub") {
                    if (
                        node.pos &&
                        node.size &&
                        canvasX >= node.pos[0] &&
                        canvasX <= node.pos[0] + node.size[0] &&
                        canvasY >= node.pos[1] &&
                        canvasY <= node.pos[1] + node.size[1]
                    ) {
                        const presets = getHubPresets(node);
                        const count = Object.keys(presets).length;
                        const listTopY = TOP_CONTROLS_HEIGHT;
                        const listBottomY = node.size[1] - BOTTOM_PADDING;
                        const listViewHeight = listBottomY - listTopY;
                        const totalContentHeight = HEADER_HEIGHT + count * (ROW_HEIGHT + ROW_GAP);
                        const maxScroll = Math.max(0, totalContentHeight - listViewHeight);

                        if (maxScroll > 0 && canvasY >= node.pos[1] + listTopY && canvasY <= node.pos[1] + listBottomY) {
                            e.preventDefault();
                            e.stopPropagation();
                            const delta = e.deltaY > 0 ? 36 : -36;
                            node._scrollOffset = Math.max(0, Math.min(maxScroll, (node._scrollOffset || 0) + delta));
                            app.graph.setDirtyCanvas(true, true);
                            return;
                        }
                    }
                }
            }
        }, { passive: false });

        // 2. Real-time canvas selection watcher (Ctrl+Click & Ctrl+Drag Box Area Selection)
        if (typeof LGraphCanvas !== "undefined") {
            const origProcessMouseDown = LGraphCanvas.prototype.processMouseDown;
            LGraphCanvas.prototype.processMouseDown = function () {
                const res = origProcessMouseDown ? origProcessMouseDown.apply(this, arguments) : false;
                setTimeout(() => updateAllHubNodes(), 30);
                return res;
            };

            const origProcessMouseUp = LGraphCanvas.prototype.processMouseUp;
            LGraphCanvas.prototype.processMouseUp = function () {
                const res = origProcessMouseUp ? origProcessMouseUp.apply(this, arguments) : false;
                setTimeout(() => updateAllHubNodes(), 20);
                setTimeout(() => updateAllHubNodes(), 100);
                return res;
            };

            const origSelectNodesInArea = LGraphCanvas.prototype.selectNodesInArea;
            if (origSelectNodesInArea) {
                LGraphCanvas.prototype.selectNodesInArea = function () {
                    const res = origSelectNodesInArea.apply(this, arguments);
                    setTimeout(() => updateAllHubNodes(), 20);
                    return res;
                };
            }

            const origDeselectAllNodes = LGraphCanvas.prototype.deselectAllNodes;
            if (origDeselectAllNodes) {
                LGraphCanvas.prototype.deselectAllNodes = function () {
                    const res = origDeselectAllNodes.apply(this, arguments);
                    setTimeout(() => updateAllHubNodes(), 20);
                    return res;
                };
            }
        }
    },

    async nodeCreated(node) {
        if (node.comfyClass === "BadaPresetHub" || node.type === "BadaPresetHub") {
            node.title = BadaI18n.t("hub_node_title");
            // Inherit presets from any existing hub node on canvas
            getHubPresets(node);
            setupHubNodeWidgets(node);
            computeHubNodeSize(node);
            updateAllHubNodes();
        }
    },

    async loadedGraphNode(node) {
        if (node.comfyClass === "BadaPresetHub" || node.type === "BadaPresetHub") {
            node.title = BadaI18n.t("hub_node_title");
            getHubPresets(node);
            setupHubNodeWidgets(node);
            computeHubNodeSize(node);
            updateHubPresetButton(node);
        }
    }
});

// Auto-refresh all hub nodes when Bada language setting changes
BadaI18n.subscribe(() => {
    if (app.graph?._nodes) {
        for (const node of app.graph._nodes) {
            if (node.comfyClass === "BadaPresetHub" || node.type === "BadaPresetHub") {
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
 * Configure Ultra-Streamlined Top Action Controls + Selection Status + Direct On-Canvas Preset Switcher
 */
function setupHubNodeWidgets(node) {
    node.title = BadaI18n.t("hub_node_title");
    if (!node.properties) node.properties = {};
    if (!node.properties.active_preset) node.properties.active_preset = "None";
    if (!node.properties.hub_presets) node.properties.hub_presets = {};
    if (node._scrollOffset === undefined) node._scrollOffset = 0;
    if (!node._dragState) node._dragState = null;

    // Clear LiteGraph standard vertical stacked widgets in favor of sleek canvas buttons
    node.widgets = [];

    // Attach event hooks only once per node instance to prevent recursion
    if (!node._hubHooksInitialized) {
        node._hubHooksInitialized = true;

        // 3. Interactive Mouse Event Handlers for Direct On-Canvas Buttons, Switching & Reordering
        const origOnMouseDown = node.onMouseDown;
        node.onMouseDown = function (e, localPos, canvas) {
            const res = origOnMouseDown ? origOnMouseDown.apply(this, arguments) : false;
            if (res) return res;

            const localX = localPos ? localPos[0] : (e && e.canvasX !== undefined ? e.canvasX - this.pos[0] : 0);
            const localY = localPos ? localPos[1] : (e && e.canvasY !== undefined ? e.canvasY - this.pos[1] : 0);

            // 1. Top Row Action Buttons: [🎯 캔버스 선택 감지: N개 노드 (저장 가능)] + [⚙️ 설정]
            const btnY = 6;
            const btnH = TOP_BTN_HEIGHT;
            if (localY >= btnY && localY <= btnY + btnH && localX >= 10 && localX <= this.size[0] - 10) {
                const settingBtnW = 74;
                const settingBtnX = this.size[0] - 10 - settingBtnW;
                const saveBtnW = settingBtnX - 6 - 10;

                // Clicked [⚙️ 설정] Button -> Opens Hub Modal Manager
                if (localX >= settingBtnX && localX <= settingBtnX + settingBtnW) {
                    showHubManageModal(this);
                    app.graph?.setDirtyCanvas(true, true);
                    return true;
                }

                // Clicked [🎯 캔버스 선택 감지 / 저장] Button
                if (localX >= 10 && localX <= 10 + saveBtnW) {
                    const selectedNodes = getCurrentlySelectedNodes(this);
                    if (selectedNodes.length === 0) {
                        showToast(BadaI18n.t("modal_hub_no_selection"), "warning");
                        return true;
                    }

                    const presets = getHubPresets(this);
                    const defaultName = `${BadaI18n.lang === "ko" ? "유니버셜 세팅" : "Universal Preset"} #${Object.keys(presets).length + 1}`;
                    showHubManageModal(this, { focusSave: true, defaultName: defaultName });
                    app.graph?.setDirtyCanvas(true, true);
                    return true;
                }
            }

            // 2. Preset List Row Clicking / Dragging
            const presets = getHubPresets(this);
            const presetNames = Object.keys(presets);
            const count = presetNames.length;
            if (count === 0) return false;

            const listTopY = TOP_CONTROLS_HEIGHT;
            const listBottomY = this.size[1] - BOTTOM_PADDING;

            if (localY >= listTopY + HEADER_HEIGHT && localY <= listBottomY && localX >= 10 && localX <= this.size[0] - 10) {
                const scroll = this._scrollOffset || 0;
                const contentY = localY - (listTopY + HEADER_HEIGHT) + scroll;
                const rowIndex = Math.floor(contentY / (ROW_HEIGHT + ROW_GAP));
                const offsetInRow = contentY % (ROW_HEIGHT + ROW_GAP);

                if (rowIndex >= 0 && rowIndex < count && offsetInRow <= ROW_HEIGHT) {
                    const targetName = presetNames[rowIndex];

                    // Check if user clicked on drag handle ⠿ (X: 10 ~ 38px)
                    if (localX <= 38) {
                        this._dragState = {
                            active: true,
                            fromIndex: rowIndex,
                            targetIndex: rowIndex,
                            name: targetName,
                            startY: localY,
                            currentY: localY,
                        };
                        if (app.canvas?.canvas) app.canvas.canvas.style.cursor = "grabbing";
                        app.graph?.setDirtyCanvas(true, true);
                        return true;
                    }

                    // Clicked on the row or Radio Toggle Switch: Activate and sync across ALL hub nodes!
                    applyMasterPresetToWorkflow(presets[targetName], this);
                    broadcastHubPresets(presets, targetName);
                    ensureActivePresetInView(this);
                    app.graph?.setDirtyCanvas(true, true);
                    return true;
                }
            }

            return false;
        };

        const origOnMouseMove = node.onMouseMove;
        node.onMouseMove = function (e, localPos, canvas) {
            origOnMouseMove?.apply(this, arguments);

            const presets = getHubPresets(this);
            const presetNames = Object.keys(presets);
            const count = presetNames.length;
            const localX = localPos ? localPos[0] : (e && e.canvasX !== undefined ? e.canvasX - this.pos[0] : 0);
            const localY = localPos ? localPos[1] : (e && e.canvasY !== undefined ? e.canvasY - this.pos[1] : 0);
            const listTopY = TOP_CONTROLS_HEIGHT;
            const listBottomY = this.size[1] - BOTTOM_PADDING;

            // Handle Active Drag Reordering
            if (this._dragState?.active) {
                this._dragState.currentY = localY;
                const scroll = this._scrollOffset || 0;
                const contentY = Math.max(0, localY - (listTopY + HEADER_HEIGHT) + scroll);
                const rawTargetIndex = Math.floor(contentY / (ROW_HEIGHT + ROW_GAP));
                this._dragState.targetIndex = Math.max(0, Math.min(count - 1, rawTargetIndex));
                app.graph?.setDirtyCanvas(true, true);
                return;
            }

            // Top Row Buttons Hover Cursor
            const btnY = 6;
            const btnH = TOP_BTN_HEIGHT;
            if (localY >= btnY && localY <= btnY + btnH && localX >= 10 && localX <= this.size[0] - 10) {
                if (app.canvas?.canvas) app.canvas.canvas.style.cursor = "pointer";
                return;
            }

            // Preset List Hover Cursor
            if (localY >= listTopY + HEADER_HEIGHT && localY <= listBottomY && localX >= 10 && localX <= this.size[0] - 10) {
                if (localX <= 38) {
                    if (app.canvas?.canvas) app.canvas.canvas.style.cursor = "grab";
                } else {
                    if (app.canvas?.canvas) app.canvas.canvas.style.cursor = "pointer";
                }
            }
        };

        const origOnMouseUp = node.onMouseUp;
        node.onMouseUp = function (e, localPos, canvas) {
            origOnMouseUp?.apply(this, arguments);

            if (this._dragState?.active) {
                const fromIndex = this._dragState.fromIndex;
                const toIndex = this._dragState.targetIndex;
                const presetName = this._dragState.name;
                this._dragState = null;

                if (fromIndex !== undefined && toIndex !== undefined && fromIndex !== toIndex) {
                    const presets = getHubPresets(this);
                    const entries = Object.entries(presets);
                    const [moved] = entries.splice(fromIndex, 1);
                    entries.splice(toIndex, 0, moved);

                    const newStore = {};
                    for (const [k, v] of entries) {
                        newStore[k] = v;
                    }
                    broadcastHubPresets(newStore);
                    showToast(`↕️ [${presetName}] 프리셋 순서가 변경되었습니다.`, "gold");
                }

                if (app.canvas?.canvas) app.canvas.canvas.style.cursor = "default";
                app.graph?.setDirtyCanvas(true, true);
            }
        };

        // 4. Custom Canvas Rendering: Streamlined Top Row, Live Selection Bar & On-Canvas Radio Switcher
        const origDrawForeground = node.onDrawForeground;
        node.onDrawForeground = function (ctx) {
            origDrawForeground?.apply(this, arguments);

            const presets = getHubPresets(this);
            const presetNames = Object.keys(presets);
            const count = presetNames.length;
            const activeName = this.properties?.active_preset || "None";

            ctx.save();

            // Auto-ensure active preset is always visible inside viewport
            if (!this._dragState?.active) {
                ensureActivePresetInView(this);
            }

            // 1. Top Row: [🎯 캔버스 선택 감지: N개 노드 (저장 가능)] + [⚙️ 설정]
            const btnY = 6;
            const btnH = TOP_BTN_HEIGHT;
            const settingBtnW = 74;
            const settingBtnX = this.size[0] - 10 - settingBtnW;
            const saveBtnX = 10;
            const saveBtnW = settingBtnX - 6 - saveBtnX;
            const selectedNodes = getCurrentlySelectedNodes(this);
            const selCount = selectedNodes.length;

            // Left Action Button: Selection Watcher + Instant Save Trigger
            ctx.save();
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(saveBtnX, btnY, saveBtnW, btnH, 5);
            else ctx.rect(saveBtnX, btnY, saveBtnW, btnH);

            if (selCount > 0) {
                const saveGrad = ctx.createLinearGradient(saveBtnX, btnY, saveBtnX, btnY + btnH);
                saveGrad.addColorStop(0, "#0e3a4e");
                saveGrad.addColorStop(1, "#0a2533");
                ctx.fillStyle = saveGrad;
                ctx.fill();

                ctx.strokeStyle = "rgba(56, 189, 248, 0.6)";
                ctx.lineWidth = 1.2;
                ctx.stroke();

                ctx.fillStyle = "#38bdf8";
                ctx.font = "bold 11.5px sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(BadaI18n.t("hub_detected_nodes", { count: selCount }), saveBtnX + saveBtnW / 2, btnY + btnH / 2);
            } else {
                ctx.fillStyle = "rgba(30, 41, 59, 0.65)";
                ctx.fill();

                ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.fillStyle = "#94a3b8";
                ctx.font = "11px sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(BadaI18n.t("hub_select_nodes"), saveBtnX + saveBtnW / 2, btnY + btnH / 2);
            }

            // Right Action Button: [⚙️ 설정]
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(settingBtnX, btnY, settingBtnW, btnH, 5);
            else ctx.rect(settingBtnX, btnY, settingBtnW, btnH);

            const setGrad = ctx.createLinearGradient(settingBtnX, btnY, settingBtnX, btnY + btnH);
            setGrad.addColorStop(0, "#334155");
            setGrad.addColorStop(1, "#1e293b");
            ctx.fillStyle = setGrad;
            ctx.fill();

            ctx.strokeStyle = "rgba(245, 158, 11, 0.55)";
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.fillStyle = "#fbbf24";
            ctx.font = "bold 11.5px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(BadaI18n.t("hub_settings_btn"), settingBtnX + settingBtnW / 2, btnY + btnH / 2);
            ctx.restore();

            // 2. Preset List Header Strip
            const listTopY = TOP_CONTROLS_HEIGHT;
            const listBottomY = this.size[1] - BOTTOM_PADDING;
            const listViewHeight = Math.max(10, listBottomY - listTopY);
            const fullContentHeight = HEADER_HEIGHT + count * (ROW_HEIGHT + ROW_GAP);
            const maxScroll = Math.max(0, fullContentHeight - listViewHeight);
            const scrollOffset = Math.max(0, Math.min(maxScroll, this._scrollOffset || 0));

            ctx.fillStyle = "#f59e0b";
            ctx.font = "bold 11px sans-serif";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(BadaI18n.t("hub_presets_header", { count }), 12, listTopY + 12);

            ctx.fillStyle = "#94a3b8";
            ctx.font = "10px sans-serif";
            ctx.textAlign = "right";
            ctx.fillText(BadaI18n.t("hub_click_apply"), this.size[0] - 12, listTopY + 12);

            // 4. Preset List Viewport with Strict Canvas Clipping
            ctx.save();
            ctx.beginPath();
            ctx.rect(8, listTopY + HEADER_HEIGHT, this.size[0] - 16, Math.max(0, listViewHeight - HEADER_HEIGHT));
            ctx.clip();

            ctx.translate(0, -scrollOffset);

            if (count === 0) {
                // Empty State Notice
                const emptyBoxY = listTopY + HEADER_HEIGHT + 6;
                ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                if (ctx.roundRect) {
                    ctx.beginPath();
                    ctx.roundRect(10, emptyBoxY, this.size[0] - 20, 36, 6);
                    ctx.stroke();
                } else {
                    ctx.strokeRect(10, emptyBoxY, this.size[0] - 20, 36);
                }
                ctx.setLineDash([]);

                ctx.fillStyle = "#94a3b8";
                ctx.font = "11px sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(BadaI18n.t("hub_empty_hint"), this.size[0] / 2, emptyBoxY + 18);
            } else {
                // Draw Preset Rows
                presetNames.forEach((name, idx) => {
                    const presetData = presets[name];
                    const rowY = listTopY + HEADER_HEIGHT + idx * (ROW_HEIGHT + ROW_GAP);
                    const rowW = this.size[0] - 20;
                    const isActive = (name === activeName);
                    const isDraggingThis = (this._dragState?.active && this._dragState.fromIndex === idx);

                    ctx.save();
                    if (isDraggingThis) {
                        ctx.globalAlpha = 0.4;
                    }

                    // Row Background Container
                    ctx.beginPath();
                    if (ctx.roundRect) {
                        ctx.roundRect(10, rowY, rowW, ROW_HEIGHT, 4);
                    } else {
                        ctx.rect(10, rowY, rowW, ROW_HEIGHT);
                    }

                    if (isActive) {
                        const rowGrad = ctx.createLinearGradient(10, rowY, 10 + rowW, rowY + ROW_HEIGHT);
                        rowGrad.addColorStop(0, "rgba(245, 158, 11, 0.2)");
                        rowGrad.addColorStop(1, "rgba(217, 119, 6, 0.09)");
                        ctx.fillStyle = rowGrad;
                        ctx.fill();

                        ctx.strokeStyle = "rgba(245, 158, 11, 0.85)";
                        ctx.lineWidth = 1.3;
                        ctx.stroke();
                    } else {
                        ctx.fillStyle = "rgba(30, 41, 59, 0.7)";
                        ctx.fill();

                        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
                        ctx.lineWidth = 1;
                        ctx.stroke();
                    }

                    // ⠿ Drag Grip Icon
                    ctx.fillStyle = isActive ? "#fcd34d" : "#64748b";
                    ctx.font = "bold 11px sans-serif";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText("⠿", 20, rowY + ROW_HEIGHT / 2);

                    // 🟢 Radio Toggle Switch Capsule Dimensions
                    const switchW = 46;
                    const switchH = 16;
                    const switchX = 10 + rowW - switchW - 5;
                    const switchY = rowY + (ROW_HEIGHT - switchH) / 2;

                    // 🏷️ Target Node Count Tag Measurement
                    const nodeCount = presetData?.targets?.length || 0;
                    const countTagText = BadaI18n.lang === "ko" ? `(${nodeCount}개)` : `(${nodeCount})`;
                    ctx.font = "10.5px sans-serif";
                    const countTagWidth = ctx.measureText(countTagText).width;

                    // 🌟 Dynamic Preset Name Width Calculation (Adapts dynamically when user widens node)
                    const titleStartX = 30;
                    const tagGap = 6;
                    const switchMargin = 8;
                    const maxTitleWidth = Math.max(50, switchX - switchMargin - countTagWidth - tagGap - titleStartX);

                    ctx.font = isActive ? "bold 12px sans-serif" : "12px sans-serif";
                    let displayName = name;
                    let titleText = `⚓ ${displayName}`;

                    if (ctx.measureText(titleText).width > maxTitleWidth) {
                        let truncated = displayName;
                        while (truncated.length > 1 && ctx.measureText(`⚓ ${truncated}...`).width > maxTitleWidth) {
                            truncated = truncated.slice(0, -1);
                        }
                        titleText = `⚓ ${truncated}...`;
                    }

                    // Draw Preset Name (Font size 12px fully preserved)
                    ctx.fillStyle = isActive ? "#fef08a" : "#f8fafc";
                    ctx.textAlign = "left";
                    ctx.textBaseline = "middle";
                    ctx.fillText(titleText, titleStartX, rowY + ROW_HEIGHT / 2);

                    const finalTitleWidth = ctx.measureText(titleText).width;

                    // Draw Target Node Count Tag
                    ctx.font = "10.5px sans-serif";
                    ctx.fillStyle = isActive ? "#fcd34d" : "#94a3b8";
                    ctx.fillText(countTagText, titleStartX + finalTitleWidth + tagGap, rowY + ROW_HEIGHT / 2);

                    // Draw Switch Capsule
                    ctx.beginPath();
                    if (ctx.roundRect) {
                        ctx.roundRect(switchX, switchY, switchW, switchH, 8);
                    } else {
                        ctx.rect(switchX, switchY, switchW, switchH);
                    }

                    if (isActive) {
                        // Vibrant Active Gradient (Emerald / Amber)
                        const swGrad = ctx.createLinearGradient(switchX, switchY, switchX + switchW, switchY + switchH);
                        swGrad.addColorStop(0, "#10b981");
                        swGrad.addColorStop(1, "#059669");
                        ctx.fillStyle = swGrad;
                        ctx.fill();

                        ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
                        ctx.lineWidth = 1;
                        ctx.stroke();

                        // Active "ON" Text
                        ctx.fillStyle = "#ffffff";
                        ctx.font = "bold 8.5px sans-serif";
                        ctx.textAlign = "left";
                        ctx.fillText("ON", switchX + 7, switchY + switchH / 2 + 0.5);

                        // Knob on Right
                        ctx.beginPath();
                        ctx.arc(switchX + switchW - 8, switchY + switchH / 2, 5.5, 0, Math.PI * 2);
                        ctx.fillStyle = "#ffffff";
                        ctx.fill();
                    } else {
                        // Inactive Switch
                        ctx.fillStyle = "#1e293b";
                        ctx.fill();

                        ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
                        ctx.lineWidth = 1;
                        ctx.stroke();

                        // Inactive "OFF" Text
                        ctx.fillStyle = "#64748b";
                        ctx.font = "bold 8.5px sans-serif";
                        ctx.textAlign = "right";
                        ctx.fillText("OFF", switchX + switchW - 6, switchY + switchH / 2 + 0.5);

                        // Knob on Left
                        ctx.beginPath();
                        ctx.arc(switchX + 8, switchY + switchH / 2, 5.5, 0, Math.PI * 2);
                        ctx.fillStyle = "#475569";
                        ctx.fill();
                    }

                    ctx.restore();
                });

                // Draw Drag Insertion Indicator Line
                if (this._dragState?.active && this._dragState.targetIndex !== undefined) {
                    const targetY = listTopY + HEADER_HEIGHT + this._dragState.targetIndex * (ROW_HEIGHT + ROW_GAP);
                    ctx.save();
                    ctx.strokeStyle = "#f59e0b";
                    ctx.lineWidth = 2.5;
                    ctx.beginPath();
                    ctx.moveTo(10, targetY - 2);
                    ctx.lineTo(this.size[0] - 10, targetY - 2);
                    ctx.stroke();

                    ctx.fillStyle = "#f59e0b";
                    ctx.beginPath();
                    ctx.arc(10, targetY - 2, 4, 0, Math.PI * 2);
                    ctx.arc(this.size[0] - 10, targetY - 2, 4, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
            }

            ctx.restore(); // Restore Clipping & Translation

            // 5. Draw Sleek Modern Scrollbar (when content exceeds viewport)
            if (maxScroll > 0) {
                const scrollTrackX = this.size[0] - 10;
                const scrollTrackY = listTopY + HEADER_HEIGHT + 2;
                const scrollTrackH = Math.max(10, listViewHeight - HEADER_HEIGHT - 4);

                ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(scrollTrackX, scrollTrackY, 4, scrollTrackH, 2);
                } else {
                    ctx.rect(scrollTrackX, scrollTrackY, 4, scrollTrackH);
                }
                ctx.fill();

                const thumbH = Math.max(18, (scrollTrackH / fullContentHeight) * scrollTrackH);
                const thumbY = scrollTrackY + (scrollOffset / maxScroll) * (scrollTrackH - thumbH);

                ctx.fillStyle = "rgba(245, 158, 11, 0.75)";
                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(scrollTrackX, thumbY, 4, thumbH, 2);
                } else {
                    ctx.rect(scrollTrackX, thumbY, 4, thumbH);
                }
                ctx.fill();
            }

            ctx.restore();
        };
    }

    updateHubPresetButton(node);
}

function updateHubPresetButton(node) {
    // Top action buttons and status indicators are rendered directly on-canvas
}

/**
 * Save snapshot of all currently selected nodes with pos info & mode state (Synced across all hub nodes)
 */
export function saveMasterPresetFromSelection(hubNode, presetName) {
    if (!hubNode && app.graph?._nodes) {
        hubNode = app.graph._nodes.find(n => n.type === "BadaPresetHub" || n.comfyClass === "BadaPresetHub");
    }
    if (!hubNode) return;

    const selectedNodes = getCurrentlySelectedNodes(hubNode);
    if (selectedNodes.length === 0) {
        showToast("⚠️ 캔버스에서 선택된 노드가 없습니다.", "warning");
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
        showToast("⚠️ 유효하지 않은 유니버셜 프리셋 데이터입니다.", "warning");
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
            if (n.comfyClass === "BadaPresetHub" || n.type === "BadaPresetHub") {
                if (!n.properties) n.properties = {};
                n.properties.active_preset = presetData.name;
            }
        }
    }

    updateAllHubNodes();
    graph.setDirtyCanvas(true, true);
    showToast(BadaI18n.lang === "ko" 
        ? `✨ [${presetData.name}] 유니버셜 프리셋 일괄 적용 완료 (총 ${appliedCount}개 노드 동기화)` 
        : `✨ Applied [${presetData.name}] preset (${appliedCount} nodes synchronized)`, "gold");
}

/**
 * Update all Hub nodes on canvas (Recomputes size, updates buttons, refreshes switcher)
 */
export function updateAllHubNodes() {
    if (!app.graph?._nodes) return;

    for (const node of app.graph._nodes) {
        if (node.comfyClass === "BadaPresetHub" || node.type === "BadaPresetHub") {
            computeHubNodeSize(node);
            updateHubPresetButton(node);
        }
    }
    app.graph.setDirtyCanvas(true, true);
}
