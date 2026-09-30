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
            whiteSpace: "nowrap"
        });
        document.body.appendChild(tooltipEl);
    }
    return tooltipEl;
}

function showTooltip(text, x, y) {
    const el = getOrCreateTooltip();
    el.textContent = text;
    el.style.left = `${x + 12}px`;
    el.style.top = `${y + 12}px`;
    el.style.opacity = "1";
}

function hideTooltip() {
    if (tooltipEl) tooltipEl.style.opacity = "0";
}

// Get Current Bada Utils UI Language setting ('en' | 'ko')
function getBadaLanguage() {
    try {
        if (app.ui && app.ui.settings && app.ui.settings.getSettingValue) {
            const val = app.ui.settings.getSettingValue("BadaUtils.Language");
            if (val) return val;
        }
    } catch (e) {}
    return (BadaI18n && BadaI18n.lang === "ko") ? "ko" : "en";
}

// Check if Note Helper setting is enabled
function isNoteHelperEnabled() {
    try {
        if (app.ui && app.ui.settings && app.ui.settings.getSettingValue) {
            const val = app.ui.settings.getSettingValue("BadaUtils.NoteHelper");
            if (val !== undefined) return !!val;
        }
    } catch (e) {}
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
    } catch (e) {}
    return [];
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
function isTargetNoteNode(node) {
    if (!node) return false;
    const names = [node.type, node.comfyClass, node.title]
        .filter(Boolean)
        .map((name) => String(name).toLowerCase());
    const blocked = getTranslationBlacklist().some((item) => {
        const compactItem = item.replace(/\s+/g, "");
        return names.some((name) => name.includes(item) || name.replace(/\s+/g, "").includes(compactItem));
    });
    return !blocked && getTextWidgets(node).length > 0;
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

    return node.widgets
        .map((widget, index) => ({ widget, key: getWidgetKey(widget, index) }))
        .filter(({ widget }) => {
            return isTextWidget(widget);
        });
}

function getWidgetText(widget) {
    if (typeof widget.value === "string") return widget.value;
    if (widget.inputEl && typeof widget.inputEl.value === "string") return widget.inputEl.value;
    if (widget.element && typeof widget.element.value === "string") return widget.element.value;
    return "";
}

function setWidgetText(widget, text) {
    if (!widget) return;

    if (widget.inputEl) widget.inputEl.value = text;
    if (widget.element) {
        if (widget.element.tagName === "TEXTAREA" || widget.element.tagName === "INPUT") {
            widget.element.value = text;
        }
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
        setWidgetText(matched.widget, text);
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
    }
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
        const xTranslate = width - btnPaddingRight - btnWidth;           // Translate Button

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

                    state.isTranslating = true;
                    if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);

                    Promise.all(textEntries.map(({ key, widget }) => {
                        const item = map[key] || (map[key] = { original: "", translated: "", translatedLang: null, viewMode: "original" });
                        const originalText = runtimeOriginals[key] || item.original || getWidgetText(widget) || "";
                        item.original = originalText || item.original || "";
                        if (!item.original.trim()) return Promise.resolve();

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
                    })
                    .catch(err => {
                        state.isTranslating = false;
                        alert((currentBadaLang === "ko" ? "번역 서버 연결 실패: " : "Translation Server Connection Failed: ") + (err && err.message ? err.message : err));
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

// Register Extension with Multi-Hook Scanning
app.registerExtension({
    name: "ComfyUI.BadaUtils.NoteHelper",

    async setup() {
        if (app.graph && app.graph._nodes) {
            app.graph._nodes.forEach(node => attachBadaNoteHelper(node));
        }
    },

    async afterConfigure() {
        if (app.graph && app.graph._nodes) {
            app.graph._nodes.forEach(node => attachBadaNoteHelper(node));
        }
    },

    async nodeCreated(node) {
        attachBadaNoteHelper(node);
    },

    async loadedGraphNode(node) {
        attachBadaNoteHelper(node);
    },

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);
            attachBadaNoteHelper(this);
        };
    }
});
