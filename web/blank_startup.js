/**
 * ComfyUI-QoL-Utils: Blank Startup & Clean Tab Module
 * Intercepts ONLY the built-in default blueprint template (10 nodes, ModelSamplingAuraFlow, last_node_id: 71)
 * so that initial startup, new tabs, and closed tabs open to a clean blank canvas with ZERO error popups,
 * without EVER interfering with real user workflows, saved files, or dropped images.
 * 
 * Controlled directly by BadaUtils.BlankStartup boolean toggle.
 */
import { app } from "../../scripts/app.js";

const BLANK_GRAPH_DATA = {
    last_node_id: 0,
    last_link_id: 0,
    nodes: [],
    links: [],
    groups: [],
    config: {},
    extra: {},
    version: 0.4
};

/**
 * Precisely identifies the ComfyUI built-in default template graph.
 * ComfyUI v1.48+ default blueprint has exactly 10 nodes, last_node_id 71, last_link_id 82,
 * and contains ModelSamplingAuraFlow.
 */
function isBuiltinDefaultTemplate(data) {
    if (!data || typeof data !== "object") return false;

    if (data.last_node_id === 71 && data.last_link_id === 82 && Array.isArray(data.nodes) && data.nodes.length === 10) {
        const hasAuraFlow = data.nodes.some(n => n.type === "ModelSamplingAuraFlow");
        if (hasAuraFlow) return true;
    }

    return false;
}

function shouldStartBlank() {
    if (!app?.ui?.settings) return true;
    try {
        const badaVal = app.ui.settings.getSettingValue("BadaUtils.BlankStartup", true);
        if (typeof badaVal === "boolean") return badaVal;
        const qolVal = app.ui.settings.getSettingValue("QoL.StartupBehavior", "blank");
        return qolVal === "blank";
    } catch {
        return true;
    }
}

function overrideDefaultGraph() {
    if (!shouldStartBlank()) return;
    try {
        if (window.comfyAPI && window.comfyAPI.defaultGraph) {
            const blank = window.comfyAPI.defaultGraph.blankGraph || BLANK_GRAPH_DATA;
            window.comfyAPI.defaultGraph.defaultGraph = blank;
            window.comfyAPI.defaultGraph.defaultGraphJSON = JSON.stringify(blank);
        }
        if (window.app) {
            window.app.defaultGraph = BLANK_GRAPH_DATA;
        }
        if (app) {
            app.defaultGraph = BLANK_GRAPH_DATA;
        }
    } catch (e) {
        console.warn("[QoL-Utils] overrideDefaultGraph notice:", e);
    }
}

// Immediate prototype patch with precise default template detection
function patchLGraph() {
    if (window.LGraph && LGraph.prototype && !LGraph.prototype._qolBlankConfigured) {
        LGraph.prototype._qolBlankConfigured = true;
        const origConfigure = LGraph.prototype.configure;
        LGraph.prototype.configure = function (data, clean) {
            if (data && isBuiltinDefaultTemplate(data)) {
                if (shouldStartBlank()) {
                    console.log("[QoL-Utils] Intercepted built-in default template -> Starting with clean blank graph.");
                    return origConfigure.call(this, BLANK_GRAPH_DATA, clean);
                }
            }
            return origConfigure.apply(this, arguments);
        };
    }
}

// Patch immediately upon script load
patchLGraph();
overrideDefaultGraph();

export function setupBlankStartup() {
    patchLGraph();
    overrideDefaultGraph();

    // Hook app.clean
    const origClean = app.clean;
    if (origClean) {
        app.clean = function () {
            const res = origClean.apply(this, arguments);
            if (shouldStartBlank() && app.graph) {
                app.graph.clear();
                if (app.canvas && typeof app.canvas.setDirty === "function") {
                    app.canvas.setDirty(true, true);
                }
            }
            return res;
        };
    }

    // Initial canvas cleanup if default template was restored on startup
    const cleanupInitialCanvas = () => {
        if (!shouldStartBlank()) return;

        overrideDefaultGraph();

        if (app.graph) {
            const nodes = app.graph._nodes || [];
            const isDefaultNodes = nodes.length === 10 && nodes.some(n => n.type === "ModelSamplingAuraFlow");
            
            let isDefaultSerialized = false;
            if (!isDefaultNodes && typeof app.graph.serialize === "function") {
                isDefaultSerialized = isBuiltinDefaultTemplate(app.graph.serialize());
            }

            if (isDefaultNodes || isDefaultSerialized) {
                const activeTab = document.querySelector(".workspace-tab-active, [aria-selected='true']");
                const tabText = activeTab ? activeTab.textContent : "Unsaved Workflow";
                const isUnsaved = !tabText || tabText.includes("Unsaved") || tabText.includes("Untitled");

                if (isUnsaved) {
                    console.log("[QoL-Utils] Cleared default error blueprint nodes from initial unsaved tab.");
                    app.graph.clear();
                    if (app.canvas && typeof app.canvas.setDirty === "function") {
                        app.canvas.setDirty(true, true);
                    }
                }
            }
        }

        // Dismiss error toasts caused by the default blueprint template
        const dismissSpuriousErrors = () => {
            const errorToasts = document.querySelectorAll(".p-toast-message-error, .comfy-toast, [data-pc-section='message'], .p-toast-message");
            errorToasts.forEach(toast => {
                const text = toast.textContent || "";
                if (
                    text.includes("errors found") ||
                    text.includes("Load Diffusion Model") ||
                    text.includes("Load CLIP") ||
                    text.includes("ModelSamplingAuraFlow") ||
                    text.includes("Cannot convert to subgraph") ||
                    text.includes("nothing to convert") ||
                    text.includes("Nothing selected")
                ) {
                    const closeBtn = toast.querySelector(".p-toast-icon-close, button, .p-toast-message-icon-close");
                    if (closeBtn) closeBtn.click();
                    else toast.remove();
                }
            });
        };

        dismissSpuriousErrors();
    };

    setTimeout(cleanupInitialCanvas, 50);
    setTimeout(cleanupInitialCanvas, 150);
    setTimeout(cleanupInitialCanvas, 350);
    setTimeout(cleanupInitialCanvas, 700);
    setTimeout(cleanupInitialCanvas, 1500);
    setTimeout(cleanupInitialCanvas, 3000);

    // Continuous toast watcher during the first 5 seconds of startup
    try {
        const toastObserver = new MutationObserver(() => {
            cleanupInitialCanvas();
        });
        toastObserver.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => {
            toastObserver.disconnect();
        }, 5000);
    } catch (e) {}

    console.log("[QoL-Utils] Clean Blank Startup module active.");
}
