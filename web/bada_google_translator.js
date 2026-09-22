/**
 * ComfyUI-Bada-Utils: Bada Google Translator Web Extension
 * - Seamlessly synchronizes with Bada UI Language setting (한국어 / English)
 * - Dynamically updates node title, widget labels, and tooltips in real-time
 * - Zero external dependencies, pure vanilla ComfyUI integration
 */
import { app } from "../../scripts/app.js";
import { BadaI18n } from "./bada_i18n.js";

const TRANSLATOR_I18N = {
    ko: {
        title: "⚓ Bada Google Translator",
        widgets: {
            text: {
                label: "번역할 원문 텍스트",
                tooltip: "구글 번역기로 번역할 원문 텍스트를 입력하세요."
            },
            from_lang: {
                label: "출발 언어 (from_lang)",
                tooltip: "원문 언어 (기본값: ko 한국어, auto: 자동 감지)"
            },
            to_lang: {
                label: "도착 언어 (to_lang)",
                tooltip: "번역 대상 언어 (기본값: en 영어)"
            },
            preserve_quotes: {
                label: "따옴표 원문 보존 (preserve_quotes)",
                tooltip: "True 시 큰따옴표(\" \") 안의 내용은 번역하지 않고 원문 그대로 유지합니다."
            }
        }
    },
    en: {
        title: "⚓ Bada Google Translator",
        widgets: {
            text: {
                label: "text",
                tooltip: "Text to translate using Google Translate free endpoint."
            },
            from_lang: {
                label: "from_lang",
                tooltip: "Source language (Default: ko, auto: Auto Detect)"
            },
            to_lang: {
                label: "to_lang",
                tooltip: "Target language (Default: en)"
            },
            preserve_quotes: {
                label: "preserve_quotes",
                tooltip: "When true, text inside double quotes (\" \") is preserved without translation."
            }
        }
    }
};

export function updateTranslatorNodeLabels(node, lang) {
    if (!node) return;
    const isKo = (lang || BadaI18n.lang) === "ko";
    const dict = isKo ? TRANSLATOR_I18N.ko : TRANSLATOR_I18N.en;

    // 1. Update Title if it was not customized by user manually
    if (!node._customUserTitle || node.title === TRANSLATOR_I18N.ko.title || node.title === TRANSLATOR_I18N.en.title || node.title === "Bada Google Translator" || node.title === "⚓ Bada Google Translator") {
        node.title = dict.title;
    }

    // 2. Update Widget Labels and Tooltips
    if (node.widgets && node.widgets.length > 0) {
        for (const w of node.widgets) {
            const info = dict.widgets[w.name];
            if (info) {
                w.label = info.label;
                if (info.tooltip) {
                    w.tooltip = info.tooltip;
                    if (w.options) w.options.tooltip = info.tooltip;
                }
            }
        }
    }

    if (node.setDirtyCanvas) {
        node.setDirtyCanvas(true, true);
    }
}

app.registerExtension({
    name: "ComfyUI-Bada-Utils.GoogleTranslator",

    async beforeRegisterNodeDef(nodeType, nodeData, appInstance) {
        if (nodeData.name !== "BadaGoogleTranslator") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated?.apply(this, arguments);
            const node = this;
            updateTranslatorNodeLabels(node, BadaI18n.lang);
            return r;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const r = onConfigure?.apply(this, arguments);
            const node = this;
            updateTranslatorNodeLabels(node, BadaI18n.lang);
            return r;
        };
    },

    async setup() {
        // Initial pass on existing canvas nodes if any
        if (app.graph && app.graph._nodes) {
            for (const node of app.graph._nodes) {
                if (node.type === "BadaGoogleTranslator" || node.comfyClass === "BadaGoogleTranslator") {
                    updateTranslatorNodeLabels(node, BadaI18n.lang);
                }
            }
        }

        // Subscribe to BadaI18n language change events in real time
        BadaI18n.subscribe((newLang) => {
            if (!app.graph || !app.graph._nodes) return;
            for (const node of app.graph._nodes) {
                if (node.type === "BadaGoogleTranslator" || node.comfyClass === "BadaGoogleTranslator") {
                    updateTranslatorNodeLabels(node, newLang);
                }
            }
            if (app.canvas) {
                app.canvas.draw(true, true);
            }
        });
    }
});
