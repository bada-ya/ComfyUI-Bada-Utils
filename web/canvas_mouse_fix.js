/**
 * ComfyUI-QoL-Utils: Global Canvas Mouse Navigation Fixer
 * Ensures 100% smooth middle-click panning (button === 1) and mouse wheel zooming
 * with perfect 1:1 cursor lockstep speed at ANY zoom scale level.
 */
import { app } from "../../scripts/app.js";

export function setupCanvasMouseFix() {
    let isMiddleDragging = false;
    let lastDragPos = { x: 0, y: 0 };

    /**
     * Checks if an HTML element actually has scrollable content in the wheel direction.
     */
    function isElementScrollable(el, deltaY) {
        if (!el || el === document.body || el === document.documentElement || el.tagName === "CANVAS") {
            return false;
        }

        const overflowY = window.getComputedStyle(el).overflowY;
        const isScrollableType = ["auto", "scroll"].includes(overflowY);
        const hasScrollableContent = el.scrollHeight > el.clientHeight + 2;

        if (isScrollableType && hasScrollableContent) {
            // Check scroll boundaries
            if (deltaY > 0 && el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
                return false;
            }
            if (deltaY < 0 && el.scrollTop <= 0) {
                return false;
            }
            return true;
        }

        return isElementScrollable(el.parentElement, deltaY);
    }

    /**
     * Checks if target is part of the ComfyUI graph area
     */
    function isGraphArea(target) {
        if (!target) return false;
        if (target.tagName === "CANVAS") return true;
        if (target.closest(".graph-canvas, #graph-canvas, .litegraph, .comfy-node-dom, .dom-widget")) return true;
        if (target.closest(".side-bar-panel, .comfy-menu, .p-dialog, .qol-modal-overlay, .qol-context-menu")) return false;
        return true;
    }

    // 1. Capture-phase Listener for Middle Mouse Button (Button 1: Pan Canvas)
    window.addEventListener("pointerdown", (e) => {
        if (e.button === 1 && isGraphArea(e.target)) {
            // Prevent browser's native middle-click autoscroll icon
            e.preventDefault();
            e.stopPropagation();

            isMiddleDragging = true;
            lastDragPos = { x: e.clientX, y: e.clientY };

            // Focus canvas
            if (app.canvas && app.canvas.canvas) {
                app.canvas.canvas.focus();
            }
        }
    }, { capture: true, passive: false });

    window.addEventListener("pointermove", (e) => {
        if (isMiddleDragging && app.canvas) {
            e.preventDefault();
            const dx = e.clientX - lastDragPos.x;
            const dy = e.clientY - lastDragPos.y;
            lastDragPos = { x: e.clientX, y: e.clientY };

            // Scale-compensated panning: Divide by ds.scale so cursor moves 1:1 with canvas at ANY zoom level
            if (app.canvas.ds) {
                const scale = app.canvas.ds.scale || 1.0;
                app.canvas.ds.offset[0] += dx / scale;
                app.canvas.ds.offset[1] += dy / scale;
                if (typeof app.canvas.setDirty === "function") {
                    app.canvas.setDirty(true, true);
                }
            }
        }
    }, { capture: true, passive: false });

    window.addEventListener("pointerup", (e) => {
        if (e.button === 1 && isMiddleDragging) {
            isMiddleDragging = false;
            if (app.canvas && typeof app.canvas.setDirty === "function") {
                app.canvas.setDirty(true, true);
            }
        }
    }, { capture: true, passive: false });

    // 2. Capture-phase Listener for Mouse Wheel (Zoom Canvas)
    window.addEventListener("wheel", (e) => {
        if (!isGraphArea(e.target)) return;

        const isScrollable = isElementScrollable(e.target, e.deltaY);
        
        if (!isScrollable || e.ctrlKey || e.altKey) {
            if (app.canvas && typeof app.canvas.adjustZoom === "function") {
                e.preventDefault();
                const delta = e.deltaY < 0 ? 1.1 : 0.9;
                const canvasRect = app.canvas.canvas ? app.canvas.canvas.getBoundingClientRect() : { left: 0, top: 0 };
                const center = [e.clientX - canvasRect.left, e.clientY - canvasRect.top];
                
                app.canvas.adjustZoom(delta, center);
                if (typeof app.canvas.setDirty === "function") {
                    app.canvas.setDirty(true, true);
                }
            } else if (app.canvas && typeof app.canvas.processMouseWheel === "function") {
                e.preventDefault();
                app.canvas.processMouseWheel(e);
            }
        }
    }, { capture: true, passive: false });

    // 3. Expose QoL helper for custom node developers
    window.QoLUtils = window.QoLUtils || {};
    window.QoLUtils.enableSmoothMouseHandling = function (element) {
        if (!element) return;
        element.addEventListener("mousedown", (e) => {
            if (e.button === 1) {
                e.preventDefault();
            }
        }, { passive: false });

        element.addEventListener("wheel", (e) => {
            if (!isElementScrollable(element, e.deltaY)) {
                e.preventDefault();
            }
        }, { passive: false });
    };

    console.log("[QoL-Utils] Global Canvas Mouse Navigation Fixer initialized with scale compensation.");
}
