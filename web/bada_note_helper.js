import { app } from "../../scripts/app.js";
import { BadaI18n } from "./bada_i18n.js";

/**
 * ComfyUI-Bada-Utils: Smart Text Node One-Click Translator Extension
 * Streamlined 1-Button Header Titlebar Control (🌐 / ⏳ / ✅)
 * 
 * Features:
 * 1) 100% Whitelist Matching: Default 7 Whitelist Types + Settings Custom Additions
 * 2) Real-Time Instant Apply: Adding node names in settings instantly attaches buttons (No F5 required)
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

// Get User-Configured Custom Whitelist Node Names from Bada Settings
function getCustomWhitelist() {
    const defaultList = [
        "text encode", "promptline", "text multiline", 
        "show text", "note", "markdown note", "show any"
    ];
    try {
        if (app.ui && app.ui.settings && app.ui.settings.getSettingValue) {
            const val = app.ui.settings.getSettingValue("BadaUtils.CustomTranslationWhitelist");
            if (typeof val === "string" && val.trim()) {
                return val.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
            }
        }
    } catch (e) {}
    return defaultList;
}

// Whitelist-Based Target Node Matcher
function isTargetNoteNode(node) {
    if (!node) return false;
    const typeLower = (node.type || node.comfyClass || "").toLowerCase();
    const titleLower = (node.title || "").toLowerCase();
    
    const whitelist = getCustomWhitelist();

    for (const item of whitelist) {
        if (!item) continue;
        const itemNoSpace = item.replace(/\s+/g, "");
        if (typeLower.includes(item) || titleLower.includes(item) ||
            typeLower.includes(itemNoSpace) || titleLower.includes(itemNoSpace)) {
            return true;
        }
    }

    return false;
}

// Safely get main prompt/note text
function getNodeText(node) {
    if (!node.widgets) return "";
    for (const w of node.widgets) {
        if (w.inputEl && typeof w.inputEl.value === "string") return w.inputEl.value;
        if (w.element && typeof w.element.value === "string") return w.element.value;
        if (w.value !== undefined && typeof w.value === "string" && w.value.length > 0) return w.value;
    }
    return "";
}

// Safely set prompt/note text without triggering third-party UI side-effects
function setNodeText(node, text) {
    if (!node.widgets) return;

    for (const w of node.widgets) {
        if (w.inputEl) {
            w.inputEl.value = text;
        }
        if (w.element) {
            if (w.element.tagName === "TEXTAREA" || w.element.tagName === "INPUT") {
                w.element.value = text;
            }
        }
        if (typeof w.value === "string") {
            w.value = text;
        }
    }

    if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);
}

// Restore ONLY attached bada note nodes to Original Text
function restoreAllNotesToOriginal() {
    if (app.graph && app.graph._nodes) {
        app.graph._nodes.forEach(node => {
            if (node._badaNoteAttached && isTargetNoteNode(node) && node.badaNoteState) {
                const state = node.badaNoteState;
                const savedOriginal = node.properties?.bada_original_text || state.originalText;
                if (savedOriginal) {
                    state.viewMode = "original";
                    setNodeText(node, savedOriginal);
                }
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

// Real-Time Instant Re-apply callback for Whitelist changes
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

    const currentText = getNodeText(node);
    
    // Persist original text in properties
    if (!node.properties.bada_original_text && currentText) {
        node.properties.bada_original_text = currentText;
    }

    const storedOriginal = node.properties.bada_original_text || currentText;
    const storedTranslated = node.properties.bada_translated_text || null;
    const storedTranslatedLang = node.properties.bada_translated_lang || null;

    // State Initialization
    node.badaNoteState = {
        viewMode: (storedTranslated && storedOriginal && currentText === storedTranslated) ? "translated" : "original",
        originalText: storedOriginal,
        translatedText: storedTranslated,
        translatedLang: storedTranslatedLang,
        isTranslating: false
    };

    // If disabled in settings on load, ensure original text is displayed
    if (!isNoteHelperEnabled() && node.properties.bada_original_text) {
        setNodeText(node, node.properties.bada_original_text);
        node.badaNoteState.viewMode = "original";
    }

    // Auto-reset translation on user edit
    if (node.widgets) {
        node.widgets.forEach(w => {
            const origCallback = w.callback;
            w.callback = function(val) {
                const state = node.badaNoteState;
                if (state && state.viewMode === "original") {
                    if (val !== state.originalText) {
                        state.originalText = val;
                        node.properties.bada_original_text = val;
                        state.translatedText = null;
                        state.translatedLang = null;
                        node.properties.bada_translated_text = null;
                        node.properties.bada_translated_lang = null;
                    }
                }
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
                if (state.isTranslating) {
                    icon = "⏳";
                } else if (state.translatedText && state.viewMode === "translated") {
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

                    // If already translated and NOT shift-clicking, toggle between Translation and Original
                    if (state.translatedText && state.translatedLang === currentBadaLang && !isForce) {
                        if (state.viewMode === "translated") {
                            state.viewMode = "original";
                            const origText = this.properties?.bada_original_text || state.originalText;
                            setNodeText(this, origText);
                        } else {
                            state.viewMode = "translated";
                            setNodeText(this, state.translatedText);
                        }
                        if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
                        return true;
                    }

                    // Request Translation from Server using Original Text
                    const baseText = this.properties?.bada_original_text || getNodeText(this);
                    if (!baseText || !baseText.trim()) return true;

                    state.isTranslating = true;
                    if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);

                    fetch("/api/bada/translate", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            text: baseText,
                            target_lang: currentBadaLang
                        })
                    })
                    .then(res => res.json())
                    .then(data => {
                        state.isTranslating = false;
                        if (data.success && data.translated_text) {
                            state.originalText = baseText;
                            node.properties.bada_original_text = baseText;

                            state.translatedText = data.translated_text;
                            state.translatedLang = currentBadaLang;
                            node.properties.bada_translated_text = data.translated_text;
                            node.properties.bada_translated_lang = currentBadaLang;

                            state.viewMode = "translated";
                            setNodeText(node, data.translated_text);
                        } else {
                            alert((currentBadaLang === "ko" ? "번역 오류: " : "Translation Error: ") + (data.error || "Unknown Error"));
                        }
                        if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);
                    })
                    .catch(err => {
                        state.isTranslating = false;
                        alert((currentBadaLang === "ko" ? "번역 서버 연결 실패: " : "Translation Server Connection Failed: ") + err.message);
                        if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);
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
