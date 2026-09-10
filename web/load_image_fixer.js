/**
 * ComfyUI-Bada-Utils: Clipboard & LoadImage Auto-Error Fixer
 * 
 * Automatically intercepts and heals false-positive "Missing Media" validation errors
 * and red outline borders on LoadImage, LoadImageMask, and other image-loading nodes
 * caused by clipboard pasting (Ctrl+V) or subfolder paths (e.g. pasted/..., clipspace/...).
 * 
 * Controlled by BadaUtils.LoadImageClipboardFix boolean setting.
 */
import { app } from "../../scripts/app.js";

const SETTING_ID = "BadaUtils.LoadImageClipboardFix";

/**
 * Checks if the Clipboard & LoadImage Auto-Error Fixer is enabled in Bada Utils settings.
 */
export function isLoadImageFixEnabled() {
    if (!app?.ui?.settings) return true;
    try {
        const val = app.ui.settings.getSettingValue(SETTING_ID, true);
        return typeof val === "boolean" ? val : true;
    } catch {
        return true;
    }
}

/**
 * Checks if a node is an image-loading node (LoadImage, LoadImageMask, LoadImageOutput, or custom).
 */
export function isImageLoadingNode(node) {
    if (!node) return false;
    const type = node.type || node.comfyClass || "";
    if (type.includes("LoadImage") || type.includes("ImageLoader")) return true;
    if (node.widgets?.some(w => w.name === "image" && (w.type === "combo" || w.options?.values))) return true;
    return false;
}

/**
 * Ensures that if a widget has a non-empty string value (such as "pasted/image.png"),
 * that value is included in widget.options.values so ComfyUI frontend's
 * `scanNodeMediaCandidates` validator does NOT falsely flag it as missing media.
 */
export function protectImageWidgetCombo(node, widget) {
    if (!widget) return;
    if (!widget.options) widget.options = {};
    if (widget.options.__badaComboProtected) return;
    widget.options.__badaComboProtected = true;

    let internalValues = widget.options.values;
    if (!internalValues) {
        internalValues = [];
    }

    try {
        Object.defineProperty(widget.options, "values", {
            get() {
                let resolved = typeof internalValues === "function" ? internalValues.call(this, widget) : internalValues;
                if (!Array.isArray(resolved)) {
                    if (resolved && typeof resolved === "object") {
                        resolved = Object.keys(resolved);
                    } else {
                        resolved = [];
                    }
                }
                
                if (isLoadImageFixEnabled() && typeof widget.value === "string" && widget.value.trim()) {
                    const currentVal = widget.value.trim();
                    if (!resolved.includes(currentVal)) {
                        resolved = [...resolved, currentVal];
                    }
                }
                return resolved;
            },
            set(newVals) {
                internalValues = newVals;
            },
            configurable: true,
            enumerable: true
        });
    } catch (e) {
        // Fallback if property define fails
        if (Array.isArray(widget.options.values) && typeof widget.value === "string" && widget.value.trim()) {
            if (!widget.options.values.includes(widget.value.trim())) {
                widget.options.values.push(widget.value.trim());
            }
        }
    }

    // Hook widget callback to clear errors and redraw when value changes
    const origCallback = widget.callback;
    widget.callback = function (val) {
        if (isLoadImageFixEnabled() && typeof val === "string" && val.trim()) {
            if (Array.isArray(internalValues) && !internalValues.includes(val.trim())) {
                internalValues.push(val.trim());
            }
            clearNodeFalseErrors(node);
        }
        return origCallback ? origCallback.apply(this, arguments) : undefined;
    };
}

/**
 * Clears false-positive error flags on an image-loading node.
 */
export function clearNodeFalseErrors(node) {
    if (!node || !isLoadImageFixEnabled()) return;

    // Check if node has genuine unconnected required inputs
    const hasUnconnectedRequiredInputs = node.inputs?.some(input => !input.link && !input.optional);
    if (!hasUnconnectedRequiredInputs) {
        if (node.has_errors) {
            node.has_errors = false;
            node.setDirtyCanvas?.(true, true);
        }
    }

    // Clear from Pinia missingMedia store if accessible
    try {
        const piniaState = window.__pinia?.state?.value;
        if (piniaState && piniaState.missingMedia) {
            const store = piniaState.missingMedia;
            if (Array.isArray(store.missingMediaCandidates)) {
                store.missingMediaCandidates = store.missingMediaCandidates.filter(
                    c => String(c.nodeId) !== String(node.id)
                );
                if (!store.missingMediaCandidates.length) {
                    store.missingMediaCandidates = null;
                }
            }
        }
    } catch {}
}

/**
 * Heals a specific node by syncing all its image widgets and removing red borders.
 */
export function healImageNode(node) {
    if (!node || !isLoadImageFixEnabled()) return;

    if (node.widgets) {
        for (const w of node.widgets) {
            if (w.name === "image" || w.type === "combo" || (typeof w.value === "string" && (w.value.includes("/") || w.value.includes("\\")))) {
                protectImageWidgetCombo(node, w);
                
                // Directly ensure in internal array
                if (typeof w.value === "string" && w.value.trim()) {
                    const val = w.value.trim();
                    if (Array.isArray(w.options?.values) && !w.options.values.includes(val)) {
                        w.options.values.push(val);
                    }
                }
            }
        }
    }

    if (isImageLoadingNode(node)) {
        clearNodeFalseErrors(node);
    }
}

/**
 * Heals all image nodes currently on the canvas.
 */
export function healAllImageNodes() {
    if (!isLoadImageFixEnabled()) return;
    const graph = app?.graph || window.app?.graph;
    if (!graph?._nodes) return;

    for (const node of graph._nodes) {
        healImageNode(node);
    }
    graph.setDirtyCanvas?.(true, true);
}

/**
 * Sets up the auto-error fixer hooks, lifecycle listeners, and paste interceptors.
 */
export function setupLoadImageFixer() {
    if (window._badaLoadImageFixerInstalled) return;
    window._badaLoadImageFixerInstalled = true;

    window.BadaLoadImageFixer = {
        healImageNode,
        healAllImageNodes,
        isLoadImageFixEnabled
    };

    console.log("[ComfyUI-Bada-Utils] 📋 Initializing Clipboard & LoadImage Auto-Error Fixer...");

    // 1. Hook LGraphNode.prototype.configure (when workflows are loaded or pasted from JSON)
    if (window.LGraphNode) {
        const origConfigure = window.LGraphNode.prototype.configure;
        window.LGraphNode.prototype.configure = function (data) {
            const r = origConfigure ? origConfigure.apply(this, arguments) : undefined;
            try {
                if (isLoadImageFixEnabled()) {
                    healImageNode(this);
                }
            } catch (e) {
                console.warn("[Bada-Utils] LoadImageFixer configure notice:", e);
            }
            return r;
        };

        // 2. Hook LGraphNode.prototype.addWidget
        const origAddWidget = window.LGraphNode.prototype.addWidget;
        window.LGraphNode.prototype.addWidget = function (type, name, value, callback, options) {
            const widget = origAddWidget ? origAddWidget.apply(this, arguments) : null;
            if (widget && (name === "image" || type === "combo")) {
                try {
                    protectImageWidgetCombo(this, widget);
                } catch (e) {}
            }
            return widget;
        };
    }

    // 3. Listen for paste events directly on canvas to instantly heal after upload finishes
    window.addEventListener("paste", () => {
        if (!isLoadImageFixEnabled()) return;
        setTimeout(healAllImageNodes, 150);
        setTimeout(healAllImageNodes, 450);
        setTimeout(healAllImageNodes, 1000);
        setTimeout(healAllImageNodes, 2000);
    }, true);

    // 4. Initial scan when graph is ready
    setTimeout(healAllImageNodes, 1000);
    setTimeout(healAllImageNodes, 3000);

    console.log("[ComfyUI-Bada-Utils] 📋 Clipboard & LoadImage Auto-Error Fixer Active!");
}
