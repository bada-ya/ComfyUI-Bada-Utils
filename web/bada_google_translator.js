/**
 * ComfyUI-Bada-Utils: Bada Google Translator Web Extension
 * - Seamlessly synchronizes with Bada UI Language setting (한국어 / English)
 * - Dynamically updates node title, widget labels, and tooltips in real-time
 * - Zero external dependencies, pure vanilla ComfyUI integration
 */
import { app } from "../../scripts/app.js";
import { BadaI18n } from "./bada_i18n.js";

// 노드에 그려지는 글자는 전역 사전(web/bada_i18n.js)의 translator_* 키에서만 꺼낸다.
// 로컬 사전을 따로 두면 사전이 두 개가 되어, 언어를 바꿨을 때 한쪽만 낡은 글자로 남는 창이 생긴다.
const WIDGET_KEYS = {
    text: "translator_text",
    from_lang: "translator_from_lang",
    to_lang: "translator_to_lang",
    preserve_quotes: "translator_preserve_quotes"
};

// 오래된 워크플로에는 라벨 개편 전 제목이 그대로 저장되어 있다 — 그 제목들도 «사용자가 안 건드린 기본값» 으로 본다
const LEGACY_TITLES = ["Bada Google Translator", "⚓ Bada Google Translator"];

export function updateTranslatorNodeLabels(node, lang) {
    if (!node) return;
    // lang 은 ComfyUI 설정 콜백이 «방금 고른 언어» 를 직접 넘기는 자리다.
    // 그때는 BadaI18n.lang 이 아직 이전 값일 수 있으므로 t() 가 아니라 tAt(lang, …) 로 읽는다.
    const tr = (key) => BadaI18n.tAt(lang || BadaI18n.lang, key);
    const title = tr("translator_node_title");

    // 1. Update Title if it was not customized by user manually
    const defaultTitles = new Set([
        BadaI18n.tAt("ko", "translator_node_title"),
        BadaI18n.tAt("en", "translator_node_title"),
        ...LEGACY_TITLES
    ]);
    if (!node._customUserTitle || defaultTitles.has(node.title)) {
        node.title = title;
    }

    // 2. Update Widget Labels and Tooltips
    if (node.widgets && node.widgets.length > 0) {
        for (const w of node.widgets) {
            const base = WIDGET_KEYS[w.name];
            if (!base) continue;
            w.label = tr(base + "_label");
            const tooltip = tr(base + "_tooltip");
            if (tooltip) {
                w.tooltip = tooltip;
                if (w.options) w.options.tooltip = tooltip;
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
