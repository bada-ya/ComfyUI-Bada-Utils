import { app } from "../../scripts/app.js";
import { BadaI18n } from "./bada_i18n.js";

/**
 * ComfyUI-Bada-Utils Core Settings Initializer
 * Controls precisely the 3 Bada Settings:
 * 1. General -> UI Language
 * 2. Smart Features -> Sidebar Workflow Folder Management
 * 3. Workflow & QoL -> Smooth Mouse Pan & Wheel Zoom Fixer
 */

const BADA_3_SETTINGS = {
    lang: {
        id: "BadaUtils.Language",
        category: ["🌊 Bada Utils", "General"],
        en: "🌐 UI Language (언어 설정)",
        ko: "🌐 UI 언어 (Language)",
        type: "combo",
        options: [
            { value: "en", text: "English" },
            { value: "ko", text: "한국어 (Korean)" },
        ],
        defaultValue: "en"
    },
    sidebar: {
        id: "BadaUtils.SidebarOrganizer",
        category: ["🌊 Bada Utils", "Smart Features"],
        en: "📁 Sidebar Workflow Folder Management (사이드바 폴더 관리)",
        ko: "📁 사이드바 워크플로우 폴더 정리 및 이동",
        type: "boolean",
        defaultValue: true
    },
    mouse: {
        id: "BadaUtils.MouseFix",
        category: ["🌊 Bada Utils", "Workflow & QoL"],
        en: "🖱️ Smooth Mouse Pan & Wheel Zoom Fixer (마우스 휠 줌 보정기)",
        ko: "🖱️ 마우스 휠 줌 & 중간 버튼 패닝 보정기",
        type: "boolean",
        defaultValue: true
    }
};

let currentAppliedLang = null;

function apply3SettingsUI(targetLang) {
    const isKo = targetLang === "ko";
    currentAppliedLang = targetLang;

    // 1. Update internal app.ui.settings.settings definitions
    try {
        const settingsMap = app?.ui?.settings?.settings;
        if (settingsMap) {
            if (settingsMap[BADA_3_SETTINGS.lang.id]) {
                settingsMap[BADA_3_SETTINGS.lang.id].name = isKo ? BADA_3_SETTINGS.lang.ko : BADA_3_SETTINGS.lang.en;
            }
            if (settingsMap[BADA_3_SETTINGS.sidebar.id]) {
                settingsMap[BADA_3_SETTINGS.sidebar.id].name = isKo ? BADA_3_SETTINGS.sidebar.ko : BADA_3_SETTINGS.sidebar.en;
            }
            if (settingsMap[BADA_3_SETTINGS.mouse.id]) {
                settingsMap[BADA_3_SETTINGS.mouse.id].name = isKo ? BADA_3_SETTINGS.mouse.ko : BADA_3_SETTINGS.mouse.en;
            }
        }
    } catch (e) {}

    // 2. Real-time DOM replacement inside open settings modal
    const dialogs = document.querySelectorAll(".p-dialog, .comfy-modal, .comfy-settings-dialog, .p-dialog-content");
    dialogs.forEach(dialog => {
        const textElements = dialog.querySelectorAll("span, label, td, tr, div, p, a");
        textElements.forEach(el => {
            if (el.children.length === 0 && el.textContent) {
                const text = el.textContent.trim();

                // Check Item 1: UI Language
                if (text.includes("UI Language") || text.includes("UI 언어")) {
                    el.textContent = isKo ? BADA_3_SETTINGS.lang.ko : BADA_3_SETTINGS.lang.en;
                }
                // Check Item 2: Sidebar Workflow Folder Management
                else if (text.includes("Sidebar Workflow") || text.includes("사이드바 워크플로우")) {
                    el.textContent = isKo ? BADA_3_SETTINGS.sidebar.ko : BADA_3_SETTINGS.sidebar.en;
                }
                // Check Item 3: Smooth Mouse Pan & Wheel Zoom Fixer
                else if (text.includes("Smooth Mouse") || text.includes("마우스 휠 줌")) {
                    el.textContent = isKo ? BADA_3_SETTINGS.mouse.ko : BADA_3_SETTINGS.mouse.en;
                }
            }
        });
    });
}

app.registerExtension({
    name: "BadaUtils.Core",

    async setup() {
        // 1. Initialize strictly from Bada's own setting (Comfy.Locale has 0 effect)
        BadaI18n.init(app);
        const initialLang = BadaI18n.lang;

        // 2. Register the 3 settings
        app.ui.settings.addSetting({
            id: BADA_3_SETTINGS.lang.id,
            category: BADA_3_SETTINGS.lang.category,
            name: initialLang === "ko" ? BADA_3_SETTINGS.lang.ko : BADA_3_SETTINGS.lang.en,
            type: BADA_3_SETTINGS.lang.type,
            options: BADA_3_SETTINGS.lang.options,
            defaultValue: initialLang,
            onChange: (newVal) => {
                const target = (typeof newVal === "object" && newVal?.value) ? newVal.value : newVal;
                if (target === "ko" || target === "en") {
                    if (BadaI18n.lang !== target) {
                        BadaI18n.setLanguage(target, false);
                    }
                    apply3SettingsUI(target);
                    app.graph?.setDirtyCanvas?.(true, true);
                }
            }
        });

        app.ui.settings.addSetting({
            id: BADA_3_SETTINGS.sidebar.id,
            category: BADA_3_SETTINGS.sidebar.category,
            name: initialLang === "ko" ? BADA_3_SETTINGS.sidebar.ko : BADA_3_SETTINGS.sidebar.en,
            type: BADA_3_SETTINGS.sidebar.type,
            defaultValue: BADA_3_SETTINGS.sidebar.defaultValue
        });

        app.ui.settings.addSetting({
            id: BADA_3_SETTINGS.mouse.id,
            category: BADA_3_SETTINGS.mouse.category,
            name: initialLang === "ko" ? BADA_3_SETTINGS.mouse.ko : BADA_3_SETTINGS.mouse.en,
            type: BADA_3_SETTINGS.mouse.type,
            defaultValue: BADA_3_SETTINGS.mouse.defaultValue
        });

        currentAppliedLang = initialLang;
        apply3SettingsUI(initialLang);

        // 3. Cleanup floating tooltips
        const cleanupStuckTooltips = () => {
            const tooltips = document.querySelectorAll(".p-tooltip, .comfy-tooltip");
            tooltips.forEach(t => {
                if (t.style.display !== "none" && (!document.querySelector(".p-dialog-mask") || t.getBoundingClientRect().top <= 10)) {
                    t.remove();
                }
            });
        };
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") setTimeout(cleanupStuckTooltips, 100);
        }, true);
        setInterval(cleanupStuckTooltips, 1500);

        console.log("%c[ComfyUI-Bada-Utils]%c BADA Custom Node language is 100% independent and controlled by Bada Settings. 🌊", "color: #00f0ff; font-weight: bold;", "color: inherit;");
    }
});

