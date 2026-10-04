import { app } from "../../scripts/app.js";
import { BadaI18n } from "./bada_i18n.js";

/**
 * ComfyUI-Bada-Utils: Smart Text Node One-Click Translator Extension
 * Streamlined 1-Button Header Titlebar Control (🌐 / ⏳ / ✅)
 * 
 * Features:
 * 1) Automatically detects visible text input/display widgets; blacklist entries are excluded
 * 2) Real-Time Instant Apply: Blacklist changes immediately update translation buttons
 * 3) Auto-Hide on Collapsed: Completely disappears when node is collapsed (no floating icons)
 * 4) Rich Settings Descriptions: Full bilingual titles and sub-descriptions in Bada Settings panel
 */

// Tooltip Element
let tooltipEl = null;

/**
 * Widest the tooltip may ever get, and the gap kept from the window edge.
 *
 * WHY THESE EXIST (2026-10-04). The tooltip was placed at `x + 12, y + 12` with no clamping at
 * all and `white-space: nowrap`, so hovering the translate button on a node near the RIGHT edge
 * pushed the tooltip off-screen — the user saw "클릭: 번..." with the rest of the sentence gone.
 * It was invisible *why* it was truncated: nothing was drawn off-canvas, the text was simply
 * absent, so it read as a rendering glitch rather than a placement bug.
 *
 * `nowrap` is the reason a single long bilingual string could never fit near an edge. Wrapping is
 * only enabled when the one-line form does NOT fit (see measureAndClampTooltip), so the common
 * case — a button with room around it — still renders as the single line it always was. That
 * keeps this invisible for anyone who was not previously hitting the bug.
 */
const TOOLTIP_MAX_WIDTH = 340;
const TOOLTIP_EDGE_GAP = 10;

function getOrCreateTooltip() {
    if (!tooltipEl) {
        tooltipEl = document.createElement("div");
        tooltipEl.className = "bada-note-tooltip";
        Object.assign(tooltipEl.style, {
            position: "fixed",
            zIndex: "999999",
            padding: "6px 10px",
            background: "rgba(15, 23, 42, 0.95)",
            color: "#f8fafc",
            border: "1px solid rgba(147, 197, 253, 0.4)",
            borderRadius: "6px",
            fontSize: "12px",
            fontWeight: "600",
            pointerEvents: "none",
            boxShadow: "0 6px 16px rgba(0,0,0,0.4)",
            backdropFilter: "blur(4px)",
            transition: "opacity 0.12s ease",
            opacity: "0",
            whiteSpace: "nowrap",
            // Cached, so the wrapping decision below can be undone when the tooltip reappears in
            // a roomier spot. Assigned here rather than in measureAndClampTooltip because the
            // element is created once and reused for every hover.
            maxWidth: `${TOOLTIP_MAX_WIDTH}px`,
        });
        document.body.appendChild(tooltipEl);
    }
    return tooltipEl;
}

/**
 * Fit the tooltip to the viewport, allowing it to wrap only when it must.
 *
 * Stands alone rather than reusing bada_shared.js's placePopupInViewport() because this tooltip
 * needs one extra step that helper does not model: it must first MEASURE with nowrap applied to
 * learn whether wrapping is needed at all, then optionally re-measure wrapped before positioning.
 * placePopupInViewport() assumes a fixed size up front, which is exactly what we are deciding here.
 *
 * @param {HTMLElement} el  The tooltip element.
 * @param {number} anchorX  Pointer clientX.
 * @param {number} anchorY  Pointer clientY.
 */
function measureAndClampTooltip(el, anchorX, anchorY) {
    const GAP = TOOLTIP_EDGE_GAP;

    // Pass 1 — the historical single-line form. Measure where it would LAND, not just its size:
    // a button mid-canvas has room, a button at the right edge does not, and the two must look
    // identical until room actually runs out.
    el.style.whiteSpace = "nowrap";
    el.style.left = "0px";
    el.style.top = "0px";
    const naturalWidth = el.offsetWidth;

    const overflowsRight = anchorX + GAP + naturalWidth > window.innerWidth - GAP;
    if (overflowsRight) {
        // Pass 2 — wrapping. Cap the width to the room actually available on the LEFT of the
        // anchor (the side we are about to flip to), so the text reflows into a block that fits
        // instead of running off the edge. Also bounded by TOOLTIP_MAX_WIDTH so the tooltip never
        // sprawls across half the canvas on a wide monitor.
        const roomLeft = Math.max(160, anchorX - GAP * 2);
        el.style.whiteSpace = "normal";
        el.style.maxWidth = `${Math.min(TOOLTIP_MAX_WIDTH, roomLeft)}px`;
    } else {
        // Reset, or the previous hover's narrow maxWidth would persist into this one.
        el.style.maxWidth = `${TOOLTIP_MAX_WIDTH}px`;
    }

    // Now measure the final form and place it. The element has opacity 0 but is NOT display:none,
    // so offsetWidth/Height are real — the same trap as the sidebar menus, avoided here by
    // never toggling display on this element.
    const w = el.offsetWidth;
    const h = el.offsetHeight;

    let left = anchorX + GAP;
    if (left + w > window.innerWidth - GAP) {
        left = Math.max(GAP, anchorX - GAP - w);
    }

    let top = anchorY + GAP;
    if (top + h > window.innerHeight - GAP) {
        top = Math.max(GAP, anchorY - GAP - h);
    }

    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
}

function showTooltip(text, x, y) {
    const el = getOrCreateTooltip();
    el.textContent = text;
    // Visible before measuring, positioned after (see measureAndClampTooltip).
    el.style.opacity = "1";
    measureAndClampTooltip(el, x, y);
}

function hideTooltip() {
    if (tooltipEl) tooltipEl.style.opacity = "0";
}

function showLongTranslationWarning(lang) {
    const isKo = lang === "ko";
    let toast = document.getElementById("bada-translation-length-warning");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "bada-translation-length-warning";
        Object.assign(toast.style, {
            position: "fixed",
            top: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: "1000000",
            maxWidth: "min(640px, calc(100vw - 32px))",
            padding: "10px 16px",
            border: "1px solid #f59e0b",
            borderRadius: "6px",
            background: "rgba(30, 24, 12, 0.96)",
            color: "#fef3c7",
            fontSize: "13px",
            lineHeight: "1.5",
            boxShadow: "0 6px 20px rgba(0, 0, 0, 0.35)",
            pointerEvents: "none"
        });
        document.body.appendChild(toast);
    }

    toast.textContent = isKo
        ? "5000자를 넘었습니다. 번역 시간이 오래 걸리거나 구글에서 번역을 거부 할 수 있습니다."
        : "This text exceeds 5,000 characters. Translation may take longer or Google may reject it.";
    clearTimeout(toast._badaDismissTimer);
    toast._badaDismissTimer = setTimeout(() => toast.remove(), 5000);
}

// Bottom-of-screen toast: tells the user what the translate button actually did, so a silent
// no-op (empty widget, rejected request, write that never reached the control) is visible.
function showTranslateToast(message, kind = "info") {
    const palette = {
        info: { border: "#60a5fa", bg: "rgba(30, 41, 59, 0.96)", fg: "#dbeafe" },
        success: { border: "#34d399", bg: "rgba(6, 42, 32, 0.96)", fg: "#a7f3d0" },
        error: { border: "#ef4444", bg: "rgba(45, 20, 20, 0.96)", fg: "#fecaca" },
    };
    const c = palette[kind] || palette.info;

    let toast = document.getElementById("bada-translate-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "bada-translate-toast";
        Object.assign(toast.style, {
            position: "fixed",
            bottom: "24px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: "1000000",
            maxWidth: "min(640px, calc(100vw - 32px))",
            padding: "10px 16px",
            borderRadius: "6px",
            fontSize: "13px",
            lineHeight: "1.5",
            boxShadow: "0 6px 20px rgba(0, 0, 0, 0.35)",
            pointerEvents: "none",
            transition: "opacity 0.15s ease",
            opacity: "0"
        });
        document.body.appendChild(toast);
    }

    toast.style.border = `1px solid ${c.border}`;
    toast.style.background = c.bg;
    toast.style.color = c.fg;
    toast.textContent = message;
    toast.style.opacity = "1";
    clearTimeout(toast._badaDismissTimer);
    toast._badaDismissTimer = setTimeout(() => { toast.style.opacity = "0"; }, 3200);
}

// Get Current Bada Utils UI Language setting ('en' | 'ko')
function getBadaLanguage() {
    try {
        if (app.ui && app.ui.settings && app.ui.settings.getSettingValue) {
            const val = app.ui.settings.getSettingValue("BadaUtils.Language");
            if (val) return val;
        }
    } catch (e) { console.debug("[Bada] ignored:", e); }
    return (BadaI18n && BadaI18n.lang === "ko") ? "ko" : "en";
}

// Check if Note Helper setting is enabled
function isNoteHelperEnabled() {
    try {
        if (app.ui && app.ui.settings && app.ui.settings.getSettingValue) {
            const val = app.ui.settings.getSettingValue("BadaUtils.NoteHelper");
            if (val !== undefined) return !!val;
        }
    } catch (e) { console.debug("[Bada] ignored:", e); }
    return true; // Default Enabled
}

// Get user-configured node names that must not receive translation controls.
function getTranslationBlacklist() {
    try {
        if (app.ui && app.ui.settings && app.ui.settings.getSettingValue) {
            const val = app.ui.settings.getSettingValue("BadaUtils.TranslationBlacklist");
            if (typeof val === "string" && val.trim()) {
                return val.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
            }
        }
    } catch (e) { console.debug("[Bada] ignored:", e); }
    return [];
}

// Get user-configured node names that must always receive translation controls
// (covers nodes missed by auto-detection). Exclude (blacklist) wins on conflict.
function getTranslationWhitelist() {
    try {
        if (app.ui && app.ui.settings && app.ui.settings.getSettingValue) {
            const val = app.ui.settings.getSettingValue("BadaUtils.TranslationWhitelist");
            if (typeof val === "string" && val.trim()) {
                return val.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
            }
        }
    } catch (e) { console.debug("[Bada] ignored:", e); }
    return [];
}

// Shared partial-name matcher (case-insensitive, whitespace-compacted).
function matchesNameList(names, list) {
    return list.some((item) => {
        const compactItem = item.replace(/\s+/g, "");
        return names.some((name) => name.includes(item) || name.replace(/\s+/g, "").includes(compactItem));
    });
}

function isTextWidget(widget) {
    if (!widget || widget.hidden || String(widget.type || "").toLowerCase() === "hidden") return false;

    const name = `${widget.name || ""} ${widget.label || ""}`.toLowerCase();
    if (/(api[\s_-]*key|password|secret|token)/.test(name)) return false;

    const element = widget.inputEl || widget.element;
    const tag = String(element?.tagName || "").toLowerCase();
    if (tag === "input") {
        const inputType = String(element.type || "text").toLowerCase();
        return ["text", "search"].includes(inputType) && typeof element.value === "string";
    }
    if (tag === "textarea") return typeof element.value === "string";
    if (tag === "select") return false;

    const type = String(widget.type || "").toLowerCase();
    return ["text", "string", "customtext", "textarea", "markdown"].includes(type) &&
        typeof widget.value === "string";
}

// Add translation controls to nodes with visible text widgets unless excluded.
// Whitelisted (forced-add) nodes bypass auto-detection; blacklist always wins.
function isTargetNoteNode(node) {
    if (!node) return false;
    const names = [node.type, node.comfyClass, node.title]
        .filter(Boolean)
        .map((name) => String(name).toLowerCase());
    if (matchesNameList(names, getTranslationBlacklist())) return false;
    if (matchesNameList(names, getTranslationWhitelist())) return true;
    return getTextWidgets(node).length > 0;
}

function getWidgetKey(widget, index) {
    const candidates = [
        widget?.name,
        widget?.label,
        widget?.inputEl?.name,
        widget?.element?.name,
        widget?.type,
        `widget_${index}`
    ].filter(Boolean);
    return (candidates[0] || `widget_${index}`) + `:${index}`;
}

function getTextWidgets(node) {
    if (!node || !node.widgets) return [];

    const strict = node.widgets
        .map((widget, index) => ({ widget, key: getWidgetKey(widget, index) }))
        .filter(({ widget }) => {
            return isTextWidget(widget);
        });
    if (strict.length > 0) return strict;

    // Fallback for whitelisted (forced-add) nodes missed by auto-detection:
    // accept any DOM-backed text-like widget even if its type tag is exotic.
    const names = [node.type, node.comfyClass, node.title]
        .filter(Boolean)
        .map((name) => String(name).toLowerCase());
    if (!matchesNameList(names, getTranslationWhitelist())) return [];
    return node.widgets
        .map((widget, index) => ({ widget, key: getWidgetKey(widget, index) }))
        .filter(({ widget }) => {
            if (!widget || widget.hidden) return false;
            const el = widget.inputEl || widget.element;
            const tag = String(el?.tagName || "").toLowerCase();
            if ((tag === "input" || tag === "textarea") && typeof el.value === "string") return true;
            return typeof widget.value === "string" && widget.value.trim().length > 0;
        });
}

function getWidgetText(widget) {
    if (typeof widget.value === "string") return widget.value;
    if (widget.inputEl && typeof widget.inputEl.value === "string") return widget.inputEl.value;
    if (widget.element && typeof widget.element.value === "string") return widget.element.value;
    return "";
}

// Resolve the real DOM control behind a widget.
// Legacy frontend: widget.inputEl / widget.element IS the <input>/<textarea>.
// Current (Vue) frontend: multiline widgets expose `element` as the textarea (with
// `inputEl` kept as a deprecated alias), but wrapper elements exist too - so fall back to
// looking for the control inside the wrapper instead of silently doing nothing.
function resolveWidgetControl(widget) {
    if (!widget) return null;
    const direct = widget.inputEl || widget.element;
    if (direct) {
        const tag = String(direct.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea") return direct;
        const nested = typeof direct.querySelector === "function"
            ? direct.querySelector("input, textarea")
            : null;
        if (nested) return nested;
    }
    return null;
}

function setWidgetText(widget, text) {
    if (!widget) return;

    const control = resolveWidgetControl(widget);
    if (control) {
        control.value = text;
        // Writing `.value` alone leaves the framework binding (and our own widget callback)
        // untouched, so the rendered control can snap back to the old value. An `input` event
        // keeps both in sync; callers guard it with `_badaApplyingTranslation`.
        try {
            control.dispatchEvent(new Event("input", { bubbles: true }));
        } catch (_) { console.debug("[Bada] ignored:", _); }
    }
    if (typeof widget.value === "string") widget.value = text;
}

function getRuntimeOriginals(node) {
    if (!node._badaOriginalTexts || typeof node._badaOriginalTexts !== "object") {
        node._badaOriginalTexts = {};
    }
    return node._badaOriginalTexts;
}

function getFocusedTextWidgetKey(node) {
    if (!node || !node.widgets || !document || !document.activeElement) return null;

    const focused = getTextWidgets(node).find(({ widget }) => {
        const el = widget.inputEl || widget.element;
        return !!el && document.activeElement === el;
    });

    return focused ? focused.key : null;
}

function getTargetWidgetKey(node, fallbackKey = null) {
    const textWidgets = getTextWidgets(node);
    if (!textWidgets.length) return fallbackKey || null;

    const focusedKey = getFocusedTextWidgetKey(node);
    if (focusedKey) return focusedKey;

    if (node.badaNoteState?.activeWidgetKey) {
        const activeExists = textWidgets.some(({ key }) => key === node.badaNoteState.activeWidgetKey);
        if (activeExists) return node.badaNoteState.activeWidgetKey;
    }

    return textWidgets[0].key;
}

function getActiveWidgetState(node) {
    if (!node || !node.badaNoteState || !node.badaNoteState.activeWidgetKey) return null;
    return getWidgetState(node, node.badaNoteState.activeWidgetKey);
}

function syncNodeStateFromActiveWidget(node) {
    const active = getActiveWidgetState(node);
    if (!active || !node.badaNoteState) return;

    node.badaNoteState.originalText = active.original || "";
    node.badaNoteState.translatedText = active.translated || "";
    node.badaNoteState.translatedLang = active.translatedLang || null;
    node.badaNoteState.viewMode = active.viewMode || "original";
}

// Safely get main prompt/note text for a specific widget or active widget
function getNodeText(node, widgetKey = null) {
    const targetKey = widgetKey || getTargetWidgetKey(node);
    if (!targetKey) return "";

    for (const { widget, key } of getTextWidgets(node)) {
        if (key === targetKey) return getWidgetText(widget);
    }
    return "";
}

function getWidgetState(node, widgetKey) {
    if (!node.properties) node.properties = {};
    if (!node.properties.bada_text_map || typeof node.properties.bada_text_map !== "object") {
        node.properties.bada_text_map = {};
    }

    if (!node.properties.bada_text_map[widgetKey]) {
        node.properties.bada_text_map[widgetKey] = {
            original: "",
            translated: "",
            translatedLang: null,
            viewMode: "original"
        };
    }

    return node.properties.bada_text_map[widgetKey];
}

// Safely set prompt/note text without triggering third-party UI side-effects
function setNodeText(node, text, widgetKey = null) {
    const targetKey = widgetKey || getTargetWidgetKey(node);
    if (!targetKey) return;

    const matched = getTextWidgets(node).find(({ key }) => key === targetKey);
    if (matched) {
        node._badaApplyingTranslation = true;
        setWidgetText(matched.widget, text);
        node._badaApplyingTranslation = false;
        const state = getWidgetState(node, targetKey);
        if (!state.original && text) state.original = text;
        state.viewMode = state.viewMode || "original";
        if (node.badaNoteState) {
            node.badaNoteState.activeWidgetKey = targetKey;
            syncNodeStateFromActiveWidget(node);
        }
        if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);
        return;
    }

    if (node.widgets) {
        for (const w of node.widgets) {
            if (typeof w.value === "string") w.value = text;
        }
    }

    if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);
}

// Restore ONLY attached bada note nodes to Original Text
function restoreAllNotesToOriginal() {
    if (app.graph && app.graph._nodes) {
        app.graph._nodes.forEach(node => {
            if (node._badaNoteAttached && isTargetNoteNode(node) && node.badaNoteState) {
                const keys = getTextWidgets(node).map(({ key }) => key);
                const runtimeOriginals = getRuntimeOriginals(node);
                for (const key of keys) {
                    const state = getWidgetState(node, key);
                    const originalText = runtimeOriginals[key] || state.original;
                    if (originalText) {
                        const target = getTextWidgets(node).find(({ key: k }) => k === key);
                        if (target) {
                            node._badaApplyingTranslation = true;
                            setWidgetText(target.widget, originalText);
                            node._badaApplyingTranslation = false;
                            state.viewMode = "original";
                        }
                    }
                }
                node.badaNoteState.activeWidgetKey = getTargetWidgetKey(node);
                node.badaNoteState.viewMode = "original";
            }
        });
    }
}

// Sync setting state callback
window.__BADA_SYNC_NOTE_HELPER_STATE__ = function(enabled) {
    if (!enabled) {
        restoreAllNotesToOriginal();
    } else {
        // Re-enabling has to re-attach: the badge is painted from the node's own draw/click
        // hooks, so a node whose hooks were never installed (or were dropped while the helper
        // was off) would stay bare until the graph is reloaded.
        window.__BADA_REAPPLY_NOTE_HELPER_NODES__();
    }
    // The settings store settles a tick after the toggle, so paint once more to be certain
    // the badge actually appears (or disappears) instead of waiting for the next interaction.
    setTimeout(() => app.graph?.setDirtyCanvas?.(true, true), 80);
};

// Real-Time Instant Re-apply callback for Blacklist changes
window.__BADA_REAPPLY_NOTE_HELPER_NODES__ = function() {
    if (app.graph && app.graph._nodes) {
        app.graph._nodes.forEach(node => {
            if (!isTargetNoteNode(node)) {
                if (node._badaNoteAttached) {
                    if (node.badaNoteState && node.badaNoteState.originalText) {
                        setNodeText(node, node.properties?.bada_original_text || node.badaNoteState.originalText);
                    }
                    node._badaNoteAttached = false;
                    node.badaNoteState = null;
                }
            } else {
                attachBadaNoteHelper(node);
            }
        });
        app.graph.setDirtyCanvas(true, true);
    }
};

// Attach Bada Note Helper behaviors & Titlebar Header Buttons to node
function attachBadaNoteHelper(node) {
    if (!isTargetNoteNode(node)) {
        if (node._badaNoteAttached) {
            if (node.badaNoteState && node.badaNoteState.originalText) {
                setNodeText(node, node.properties?.bada_original_text || node.badaNoteState.originalText);
            }
            node._badaNoteAttached = false;
            node.badaNoteState = null;
        }
        return;
    }
    if (node._badaNoteAttached) return;

    node._badaNoteAttached = true;
    if (!node.properties) node.properties = {};

    const textWidgets = getTextWidgets(node);
    const currentText = textWidgets.length ? getNodeText(node, textWidgets[0].key) : "";
    const firstKey = textWidgets.length ? textWidgets[0].key : null;

    if (!node.properties.bada_original_text && currentText) {
        node.properties.bada_original_text = currentText;
    }

    if (!node.properties.bada_text_map || typeof node.properties.bada_text_map !== "object") {
        node.properties.bada_text_map = {};
    }

    for (const { key, widget } of textWidgets) {
        const state = getWidgetState(node, key);
        const widgetValue = getWidgetText(widget);
        const runtimeOriginals = getRuntimeOriginals(node);
        const hasOldTranslation = !!state.translated && widgetValue === state.translated;

        if (hasOldTranslation && state.original) {
            node._badaApplyingTranslation = true;
            setWidgetText(widget, state.original);
            node._badaApplyingTranslation = false;
        } else if (widgetValue && widgetValue !== state.original) {
            state.original = widgetValue;
        }

        runtimeOriginals[key] = state.original || widgetValue || "";
        state.translated = "";
        state.translatedLang = null;
        state.viewMode = "original";
    }

    const activeKey = firstKey || getTargetWidgetKey(node);
    node.badaNoteState = {
        activeWidgetKey: activeKey,
        viewMode: "original",
        originalText: node.properties.bada_original_text || currentText,
        translatedText: null,
        translatedLang: null,
        isTranslating: false
    };
    node.properties.bada_translated_text = null;
    node.properties.bada_translated_lang = null;

    if (!isNoteHelperEnabled() && node.properties.bada_original_text) {
        setNodeText(node, node.properties.bada_original_text, activeKey);
        node.badaNoteState.viewMode = "original";
    }

    if (node.widgets) {
        node.widgets.forEach((w, index) => {
            const key = getWidgetKey(w, index);
            const origCallback = w.callback;
            const focusTarget = w.inputEl || w.element;

            if (focusTarget) {
                const prevFocus = focusTarget.onfocus;
                focusTarget.onfocus = function(ev) {
                    if (node.badaNoteState) node.badaNoteState.activeWidgetKey = key;
                    if (prevFocus) return prevFocus.call(this, ev);
                };

                const prevBlur = focusTarget.onblur;
                focusTarget.onblur = function(ev) {
                    if (node.badaNoteState && node.badaNoteState.activeWidgetKey === key) {
                        const freshKey = getTargetWidgetKey(node, key);
                        if (freshKey && freshKey !== key) {
                            node.badaNoteState.activeWidgetKey = freshKey;
                        }
                    }
                    if (prevBlur) return prevBlur.call(this, ev);
                };
            }

            w.callback = function(val) {
                const state = node.badaNoteState;
                const widgetState = getWidgetState(node, key);

                if (node._badaApplyingTranslation) {
                    if (origCallback) return origCallback.apply(this, arguments);
                    return;
                }

                if (state) {
                    state.activeWidgetKey = key;
                }

                widgetState.original = val;
                getRuntimeOriginals(node)[key] = val;
                widgetState.viewMode = "original";
                widgetState.translated = "";
                widgetState.translatedLang = null;

                node.properties.bada_original_text = val;
                node.properties.bada_translated_text = null;
                node.properties.bada_translated_lang = null;
                syncNodeStateFromActiveWidget(node);

                if (origCallback) return origCallback.apply(this, arguments);
            };
        });
    }

    // Header Title Bar Button Geometry Metrics (1 Streamlined Button)
    const btnWidth = 24;
    const btnHeight = 20;
    const btnPaddingRight = 8;
    
    function getHeaderHeight(n) {
        if (LiteGraph && LiteGraph.NODE_TITLE_HEIGHT) return LiteGraph.NODE_TITLE_HEIGHT;
        return 30;
    }

    // Calculate Button Bounds (1 Button: Translate)
    function getButtonBounds(n) {
        const hHeight = getHeaderHeight(n);
        const padY = Math.floor((hHeight - btnHeight) / 2);

        // Drawing Y (onDrawForeground is offset by +hHeight in LiteGraph, so subtract hHeight)
        const yDraw = -hHeight + padY;
        
        // Hit Test Y
        const yHit1 = padY;           // Relative to node top 0
        const yHit2 = yDraw;          // Relative to translated origin

        const width = (n.size && n.size[0] > 50) ? n.size[0] : 200;
        const xTranslate = width - btnPaddingRight - btnWidth - btnWidth - 8;

        return [
            { id: "translate", x: xTranslate, yDraw, yHit1, yHit2, w: btnWidth, h: btnHeight }
        ];
    }

    // Render 1 Button inside Header Title Bar
    function drawHeaderButtons(n, ctx) {
        if (!isNoteHelperEnabled()) return;

        // Hide Completely if Node is Collapsed by native ComfyUI (No Floating Icons)
        if (n.flags && n.flags.collapsed) return;

        const state = n.badaNoteState;
        if (!state) return;

        const buttons = getButtonBounds(n);
        ctx.save();

        buttons.forEach(btn => {
            let icon = "";
            let isHighlighted = false;
            let bgStyle = "rgba(30, 41, 59, 0.92)";
            let borderColor = "rgba(255, 255, 255, 0.35)";

            if (btn.id === "translate") {
                const activeWidgetState = getActiveWidgetState(n);
                const translatedText = activeWidgetState?.translated || state.translatedText || null;
                const isTranslatedView = activeWidgetState ? activeWidgetState.viewMode === "translated" : state.viewMode === "translated";

                if (state.isTranslating) {
                    icon = "⏳";
                } else if (translatedText && isTranslatedView) {
                    icon = "✅";
                    isHighlighted = true;
                } else {
                    icon = "🌐";
                }
            }

            if (isHighlighted) {
                bgStyle = "rgba(37, 99, 235, 0.95)"; // Vibrant Highlight Blue
                borderColor = "#bfdbfe";
            }

            // Draw Button Rect inside Title Bar
            ctx.fillStyle = bgStyle;
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = 1.2;

            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(btn.x, btn.yDraw, btn.w, btn.h, 4);
            } else {
                ctx.rect(btn.x, btn.yDraw, btn.w, btn.h);
            }
            ctx.fill();
            ctx.stroke();

            // Draw Emoji / Icon Text
            ctx.font = "bold 12px Segoe UI Emoji, Apple Color Emoji, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "#ffffff";
            ctx.fillText(icon, btn.x + btn.w / 2, btn.yDraw + btn.h / 2 + 1);
        });

        ctx.restore();
    }

    // 1. Draw in onDrawForeground
    const origOnDrawForeground = node.onDrawForeground;
    node.onDrawForeground = function(ctx, canvas) {
        if (origOnDrawForeground) {
            origOnDrawForeground.apply(this, arguments);
        }
        drawHeaderButtons(this, ctx);
    };

    // 2. Handle Mouse Down / Clicks on Title Bar Header Buttons
    const origOnMouseDown = node.onMouseDown;
    node.onMouseDown = function(e, localPos, canvas) {
        if (!isNoteHelperEnabled()) {
            if (origOnMouseDown) return origOnMouseDown.apply(this, arguments);
            return false;
        }

        // Hide & Ignore clicks if node is collapsed
        if (this.flags && this.flags.collapsed) {
            if (origOnMouseDown) return origOnMouseDown.apply(this, arguments);
            return false;
        }

        if (!localPos || !this.badaNoteState) {
            if (origOnMouseDown) return origOnMouseDown.apply(this, arguments);
            return false;
        }

        const buttons = getButtonBounds(this);
        const clickX = localPos[0];
        const clickY = localPos[1];
        const state = this.badaNoteState;

        for (const btn of buttons) {
            const isHitY = (clickY >= btn.yHit1 && clickY <= btn.yHit1 + btn.h) ||
                           (clickY >= btn.yHit2 && clickY <= btn.yHit2 + btn.h);

            if (clickX >= btn.x && clickX <= btn.x + btn.w && isHitY) {
                
                // Translate Button
                if (btn.id === "translate") {
                    const isForce = !!e.shiftKey; // Force re-translate ONLY on Shift + Click

                    if (state.isTranslating) return true;

                    const currentBadaLang = getBadaLanguage(); // "en" or "ko"

                    const textEntries = getTextWidgets(this);
                    if (!this.properties) this.properties = {};
                    if (!this.properties.bada_text_map || typeof this.properties.bada_text_map !== "object") {
                        this.properties.bada_text_map = {};
                    }
                    const map = this.properties.bada_text_map;
                    const runtimeOriginals = getRuntimeOriginals(this);

                    textEntries.forEach(({ key, widget }) => {
                        if (!map[key]) {
                            map[key] = { original: "", translated: "", translatedLang: null, viewMode: "original" };
                        }
                        const item = map[key];
                        if (!Object.prototype.hasOwnProperty.call(runtimeOriginals, key)) {
                            runtimeOriginals[key] = getWidgetText(widget) || "";
                        }
                        if (!item.original) {
                            item.original = runtimeOriginals[key];
                        }

                        const currentText = getWidgetText(widget) || "";
                        const previousOriginal = runtimeOriginals[key] || item.original || "";
                        const previousTranslation = item.translated || "";
                        if (currentText && currentText !== previousOriginal && currentText !== previousTranslation) {
                            runtimeOriginals[key] = currentText;
                            item.original = currentText;
                            item.translated = "";
                            item.translatedLang = null;
                            item.viewMode = "original";
                            state.viewMode = "original";
                        }
                    });

                    const hasTranslatedView = state.viewMode === "translated" ||
                        textEntries.some(({ key, widget }) => {
                            const item = map[key];
                            const currentText = getWidgetText(widget);
                            return item && item.translated &&
                                (item.viewMode === "translated" || currentText === item.translated);
                        });

                    if (hasTranslatedView && !isForce) {
                        textEntries.forEach(({ key, widget }) => {
                            const item = map[key];
                            if (!item) return;
                            const originalText = runtimeOriginals[key] || item.original || getWidgetText(widget) || "";
                            if (originalText) {
                                this._badaApplyingTranslation = true;
                                setWidgetText(widget, originalText);
                                this._badaApplyingTranslation = false;
                                item.viewMode = "original";
                            }
                        });

                        state.viewMode = "original";
                        state.translatedText = "";
                        state.translatedLang = null;
                        if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
                        return true;
                    }

                    const hasLongText = textEntries.some(({ key, widget }) => {
                        const originalText = runtimeOriginals[key] || map[key]?.original || getWidgetText(widget) || "";
                        return originalText.length > 5000;
                    });
                    if (hasLongText) showLongTranslationWarning(currentBadaLang);

                    state.isTranslating = true;
                    if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);

                    const langKo = currentBadaLang === "ko";
                    let okCount = 0;
                    let failCount = 0;
                    let skipCount = 0;

                    Promise.all(textEntries.map(({ key, widget }) => {
                        const item = map[key] || (map[key] = { original: "", translated: "", translatedLang: null, viewMode: "original" });
                        const originalText = runtimeOriginals[key] || item.original || getWidgetText(widget) || "";
                        item.original = originalText || item.original || "";
                        if (!item.original.trim()) {
                            skipCount += 1;
                            return Promise.resolve();
                        }

                        return fetch("/api/bada/translate", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ text: item.original, target_lang: currentBadaLang })
                        })
                        .then(res => res.json())
                        .then(data => {
                            if (data.success && data.translated_text) {
                                item.translated = data.translated_text;
                                item.translatedLang = currentBadaLang;
                                item.viewMode = "translated";
                                this._badaApplyingTranslation = true;
                                setWidgetText(widget, data.translated_text);
                                this._badaApplyingTranslation = false;
                                okCount += 1;
                            } else {
                                failCount += 1;
                                console.warn("[BadaUtils.NoteHelper] translate rejected:", data);
                            }
                        });
                    }))
                    .then(() => {
                        state.isTranslating = false;
                        const translatedStates = textEntries.map(({ key }) => map[key]).filter(Boolean);
                        const anyTranslated = translatedStates.some(item => item.viewMode === "translated");
                        state.viewMode = anyTranslated ? "translated" : "original";
                        state.translatedText = translatedStates.find(item => item.viewMode === "translated" && item.translated)?.translated || "";
                        state.translatedLang = translatedStates.find(item => item.viewMode === "translated" && item.translatedLang)?.translatedLang || null;
                        if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);

                        // Report the outcome - a silent no-op is impossible to debug for the user
                        if (okCount > 0) {
                            const target = langKo ? "한국어" : "English";
                            showTranslateToast(
                                langKo ? `✅ ${okCount}개 텍스트를 ${target}로 번역했습니다.`
                                       : `✅ Translated ${okCount} text field(s) to ${target}.`,
                                "success"
                            );
                        } else if (failCount > 0) {
                            showTranslateToast(
                                langKo ? "⚠️ 번역 서버가 요청을 거부했습니다. 잠시 후 다시 시도해 주세요."
                                       : "⚠️ The translation server rejected the request. Please try again.",
                                "error"
                            );
                        } else if (skipCount > 0) {
                            showTranslateToast(
                                langKo ? "⚠️ 번역할 텍스트가 비어 있습니다. 내용을 입력한 뒤 다시 눌러 주세요."
                                       : "⚠️ There is no text to translate. Type something first, then click again.",
                                "error"
                            );
                        }
                    })
                    .catch(err => {
                        state.isTranslating = false;
                        showTranslateToast(
                            (langKo ? "번역 서버 연결 실패: " : "Translation server connection failed: ") +
                            (err && err.message ? err.message : err),
                            "error"
                        );
                        if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
                    });

                    return true;
                }
            }
        }

        if (origOnMouseDown) {
            return origOnMouseDown.apply(this, arguments);
        }
    };

    // 3. Handle Mouse Move (Cursor & Streamlined Bilingual Tooltips)
    const origOnMouseMove = node.onMouseMove;
    node.onMouseMove = function(e, localPos, canvas) {
        if (isNoteHelperEnabled() && localPos && this.badaNoteState) {
            if (this.flags && this.flags.collapsed) {
                hideTooltip();
                if (origOnMouseMove) return origOnMouseMove.apply(this, arguments);
                return;
            }

            const buttons = getButtonBounds(this);
            const mouseX = localPos[0];
            const mouseY = localPos[1];

            let hoveredBtn = null;
            for (const btn of buttons) {
                const isHitY = (mouseY >= btn.yHit1 && mouseY <= btn.yHit1 + btn.h) ||
                               (mouseY >= btn.yHit2 && mouseY <= btn.yHit2 + btn.h);
                if (mouseX >= btn.x && mouseX <= btn.x + btn.w && isHitY) {
                    hoveredBtn = btn;
                    break;
                }
            }

            if (hoveredBtn) {
                if (canvas && canvas.canvas) {
                    canvas.canvas.style.cursor = "pointer";
                }
                const lang = getBadaLanguage();
                let tipMsg = "";

                if (hoveredBtn.id === "translate") {
                    tipMsg = (lang === "ko") 
                        ? "클릭: 번역/원문 토글 (Shift+클릭: 강제 재번역)" 
                        : "Click: Toggle Translation/Original (Shift+Click: Force Re-translate)";
                }

                showTooltip(tipMsg, e.clientX, e.clientY);
                return;
            }
        }

        hideTooltip();
        if (origOnMouseMove) {
            return origOnMouseMove.apply(this, arguments);
        }
    };

    const origOnMouseLeave = node.onMouseLeave;
    node.onMouseLeave = function(e) {
        hideTooltip();
        if (origOnMouseLeave) {
            return origOnMouseLeave.apply(this, arguments);
        }
    };
}

function scheduleAttachBadaNoteHelper(node) {
    if (!node || node._badaNoteAttachScheduled) return;
    node._badaNoteAttachScheduled = true;

    const schedule = window.requestAnimationFrame || (callback => setTimeout(callback, 0));
    schedule(() => {
        node._badaNoteAttachScheduled = false;
        if (node.graph && node.graph._nodes && !node.graph._nodes.includes(node)) return;
        attachBadaNoteHelper(node);
    });
}

function watchGraphNodeAdditions(graph) {
    if (!graph || graph._badaNoteHelperNodeAddedHook) return;

    const originalOnNodeAdded = graph.onNodeAdded;
    graph.onNodeAdded = function(node) {
        const result = originalOnNodeAdded?.apply(this, arguments);
        scheduleAttachBadaNoteHelper(node);
        return result;
    };
    graph._badaNoteHelperNodeAddedHook = true;
}

// Register Extension with Multi-Hook Scanning
app.registerExtension({
    name: "ComfyUI.BadaUtils.NoteHelper",

    async setup() {
        watchGraphNodeAdditions(app.graph);
        if (app.graph && app.graph._nodes) {
            app.graph._nodes.forEach(node => scheduleAttachBadaNoteHelper(node));
        }
    },

    async afterConfigure() {
        watchGraphNodeAdditions(app.graph);
        if (app.graph && app.graph._nodes) {
            app.graph._nodes.forEach(node => scheduleAttachBadaNoteHelper(node));
        }
    },

    async nodeCreated(node) {
        scheduleAttachBadaNoteHelper(node);
    },

    async loadedGraphNode(node) {
        scheduleAttachBadaNoteHelper(node);
    },

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            const result = origOnNodeCreated ? origOnNodeCreated.apply(this, arguments) : undefined;
            scheduleAttachBadaNoteHelper(this);
            return result;
        };
    }
});
