import { app } from "../../scripts/app.js";
import { BadaI18n } from "./bada_i18n.js";
import { showGlobalPresetsOverviewModal, getGlobalPresetsSummary } from "./presets_overview_modal.js";

/**
 * ComfyUI-Bada-Utils Core Settings Initializer
 * Settings Section is permanently unified in English (한국어) bilingual format:
 * 1. General (일반) -> 🌐 UI Language (UI 언어 설정)
 * 2. Smart Features (스마트 기능) -> 📁 Sidebar Workflow Folder Management (사이드바 워크플로우 폴더 정리 및 이동)
 * 3. Workflow & QoL (워크플로우 & 편의성) -> 🖱️ Smooth Mouse Pan & Wheel Zoom Fixer (마우스 휠 줌 & 중간 버튼 패닝 보정기)
 * 4. Global Presets (글로벌 프리셋) -> 🌐 Global Presets Status (글로벌 프리셋 등록 현황 및 요약)
 */

const BADA_UNIFIED_SETTINGS = {
    lang: {
        id: "BadaUtils.Language",
        category: ["🌊 Bada Utils", "1. General (일반)"],
        name: "🌐 UI Language (UI 언어 설정)",
        type: "combo",
        options: [
            { value: "en", text: "English (영어)" },
            { value: "ko", text: "한국어 (Korean)" },
        ],
        defaultValue: "en"
    },
    sidebar: {
        id: "BadaUtils.SidebarOrganizer",
        category: ["🌊 Bada Utils", "2. Smart Features (스마트 기능)"],
        name: "📁 Sidebar Workflow Folder Management (사이드바 워크플로우 폴더 정리 및 이동)",
        type: "boolean",
        defaultValue: true
    },
    mouse: {
        id: "BadaUtils.MouseFix",
        category: ["🌊 Bada Utils", "3. Workflow & QoL (워크플로우 & 편의성)"],
        name: "🖱️ Smooth Mouse Pan & Wheel Zoom Fixer (마우스 휠 줌 & 중간 버튼 패닝 보정기)",
        type: "boolean",
        defaultValue: true
    },
    presetsOverview: {
        id: "BadaUtils.GlobalPresetsOverview",
        category: ["🌊 Bada Utils", "4. Global Presets (글로벌 프리셋)"],
        name: "🌐 Global Presets Status (글로벌 프리셋 등록 현황 및 요약)",
        type: "hidden"
    }
};

/**
 * Live DOM updater for open Settings Dialogs (both PrimeVue modal & classic table)
 * Ensures 100% unified English (한국어) bilingual text and injects Global Presets Button & Badge.
 */
function applyBilingualSettingsUI() {
    // 1. Update internal app.ui.settings.settings definitions
    try {
        const settingsMap = app?.ui?.settings?.settings;
        if (settingsMap) {
            if (settingsMap[BADA_UNIFIED_SETTINGS.lang.id]) {
                settingsMap[BADA_UNIFIED_SETTINGS.lang.id].name = BADA_UNIFIED_SETTINGS.lang.name;
            }
            if (settingsMap[BADA_UNIFIED_SETTINGS.sidebar.id]) {
                settingsMap[BADA_UNIFIED_SETTINGS.sidebar.id].name = BADA_UNIFIED_SETTINGS.sidebar.name;
            }
            if (settingsMap[BADA_UNIFIED_SETTINGS.mouse.id]) {
                settingsMap[BADA_UNIFIED_SETTINGS.mouse.id].name = BADA_UNIFIED_SETTINGS.mouse.name;
            }
            if (settingsMap[BADA_UNIFIED_SETTINGS.presetsOverview.id]) {
                settingsMap[BADA_UNIFIED_SETTINGS.presetsOverview.id].name = BADA_UNIFIED_SETTINGS.presetsOverview.name;
            }
        }
    } catch (e) {}

    // 2. Real-time DOM replacement inside open settings dialogs
    const dialogs = document.querySelectorAll(".p-dialog, .comfy-modal, .comfy-settings-dialog, .p-dialog-content");
    dialogs.forEach(dialog => {
        const textElements = dialog.querySelectorAll("span, label, td, tr, div, p, a, h3, h4");
        textElements.forEach(el => {
            if (el.children.length === 0 && el.textContent) {
                const text = el.textContent.trim();

                // Item 1: UI Language
                if (text.includes("UI Language") || text.includes("UI 언어")) {
                    el.textContent = BADA_UNIFIED_SETTINGS.lang.name;
                }
                // Item 2: Sidebar Workflow Folder Management
                else if (text.includes("Sidebar Workflow") || text.includes("사이드바 워크플로우")) {
                    el.textContent = BADA_UNIFIED_SETTINGS.sidebar.name;
                }
                // Item 3: Smooth Mouse Pan & Wheel Zoom Fixer
                else if (text.includes("Smooth Mouse") || text.includes("마우스 휠 줌")) {
                    el.textContent = BADA_UNIFIED_SETTINGS.mouse.name;
                }
                // Item 4: Global Presets Status
                else if (text.includes("Global Presets Status") || text.includes("글로벌 프리셋 등록 현황")) {
                    el.textContent = BADA_UNIFIED_SETTINGS.presetsOverview.name;
                }
                // Category Headers (strip numeric prefix for clean look if wanted)
                else if (text.match(/^(?:1\.\s*)?General(?:\s*\(일반\))?$/i) || text === "일반") {
                    el.textContent = "General (일반)";
                }
                else if (text.match(/^(?:2\.\s*)?Smart Features(?:\s*\(스마트 기능\))?$/i) || text === "스마트 기능") {
                    el.textContent = "Smart Features (스마트 기능)";
                }
                else if (text.match(/^(?:3\.\s*)?Workflow & QoL(?:\s*\(워크플로우 & 편의성\))?$/i) || text === "워크플로우 & 편의성") {
                    el.textContent = "Workflow & QoL (워크플로우 & 편의성)";
                }
                else if (text.match(/^(?:4\.\s*)?Global Presets(?:\s*\(글로벌 프리셋\))?$/i) || text === "글로벌 프리셋") {
                    el.textContent = "Global Presets (글로벌 프리셋)";
                }
            }
        });

        // 3. Inject Button & Live Badge directly on the Global Presets Status row
        injectPresetsButtonIntoRow(dialog);
    });
}

function injectPresetsButtonIntoRow(dialog) {
    if (!dialog) return;

    // Find the text element for Global Presets Status
    const statusLabels = Array.from(dialog.querySelectorAll("span, label, td, div, p")).filter(el =>
        el.children.length === 0 && el.textContent && el.textContent.includes("Global Presets Status")
    );

    statusLabels.forEach(labelEl => {
        // Find row container (.p-field, tr, or flex container)
        let row = labelEl.closest("tr") || labelEl.closest(".p-field") || labelEl.parentElement;
        if (row && row.children.length === 1 && row.parentElement && row.parentElement.classList.contains("p-field")) {
            row = row.parentElement;
        }

        if (!row) return;

        let btnContainer = row.querySelector(".bada-injected-btn-container");
        const summary = getGlobalPresetsSummary();
        const badgeText = summary.totalPresets > 0
            ? `🎯 ${summary.totalPresets} Presets / ${summary.nodeCount} Nodes (총 ${summary.totalPresets}개)`
            : `📭 0 Presets (0개 등록됨)`;

        if (!btnContainer) {
            btnContainer = document.createElement("div");
            btnContainer.className = "bada-injected-btn-container";
            btnContainer.style.cssText = "display: flex; align-items: center; gap: 12px; margin-left: auto; flex-shrink: 0;";

            const summaryBadge = document.createElement("span");
            summaryBadge.className = "bada-summary-badge-live";
            summaryBadge.style.cssText = "font-size: 12px; color: #38bdf8; font-weight: 600; background: rgba(56, 189, 248, 0.12); padding: 5px 12px; border-radius: 8px; border: 1px solid rgba(56, 189, 248, 0.3); font-family: sans-serif;";
            summaryBadge.textContent = badgeText;

            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "bada-btn-open-overview";
            btn.style.cssText = "background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: #ffffff; border: 1px solid rgba(255,255,255,0.25); padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 4px 14px rgba(99,102,241,0.35); transition: all 0.2s ease;";
            btn.innerHTML = `<span>🌐</span> <span>View Presets (프리셋 전체 현황 및 관리)</span>`;

            btn.addEventListener("mouseenter", () => {
                btn.style.transform = "translateY(-1px)";
                btn.style.boxShadow = "0 6px 18px rgba(99,102,241,0.5)";
            });
            btn.addEventListener("mouseleave", () => {
                btn.style.transform = "none";
                btn.style.boxShadow = "0 4px 14px rgba(99,102,241,0.35)";
            });

            btn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                showGlobalPresetsOverviewModal();
            });

            btnContainer.appendChild(summaryBadge);
            btnContainer.appendChild(btn);

            row.style.display = "flex";
            row.style.alignItems = "center";
            row.style.justifyContent = "space-between";
            row.style.gap = "16px";
            row.style.padding = "6px 0";
            row.appendChild(btnContainer);
        } else {
            // Update live badge text on refresh
            const badge = btnContainer.querySelector(".bada-summary-badge-live");
            if (badge) {
                badge.textContent = badgeText;
            }
        }
    });
}

app.registerExtension({
    name: "BadaUtils.Core",

    async setup() {
        // 1. Initialize Bada language state (Canvas nodes & menus continue using BadaI18n)
        BadaI18n.init(app);
        const initialLang = BadaI18n.lang;

        // 2. Register Unified Bilingual Settings
        app.ui.settings.addSetting({
            id: BADA_UNIFIED_SETTINGS.lang.id,
            category: BADA_UNIFIED_SETTINGS.lang.category,
            name: BADA_UNIFIED_SETTINGS.lang.name,
            type: BADA_UNIFIED_SETTINGS.lang.type,
            options: BADA_UNIFIED_SETTINGS.lang.options,
            defaultValue: initialLang,
            onChange: (newVal) => {
                const target = (typeof newVal === "object" && newVal?.value) ? newVal.value : newVal;
                if (target === "ko" || target === "en") {
                    if (BadaI18n.lang !== target) {
                        BadaI18n.setLanguage(target, false);
                    }
                    applyBilingualSettingsUI();
                    app.graph?.setDirtyCanvas?.(true, true);
                }
            }
        });

        app.ui.settings.addSetting({
            id: BADA_UNIFIED_SETTINGS.sidebar.id,
            category: BADA_UNIFIED_SETTINGS.sidebar.category,
            name: BADA_UNIFIED_SETTINGS.sidebar.name,
            type: BADA_UNIFIED_SETTINGS.sidebar.type,
            defaultValue: BADA_UNIFIED_SETTINGS.sidebar.defaultValue
        });

        app.ui.settings.addSetting({
            id: BADA_UNIFIED_SETTINGS.mouse.id,
            category: BADA_UNIFIED_SETTINGS.mouse.category,
            name: BADA_UNIFIED_SETTINGS.mouse.name,
            type: BADA_UNIFIED_SETTINGS.mouse.type,
            defaultValue: BADA_UNIFIED_SETTINGS.mouse.defaultValue
        });

        app.ui.settings.addSetting({
            id: BADA_UNIFIED_SETTINGS.presetsOverview.id,
            category: BADA_UNIFIED_SETTINGS.presetsOverview.category,
            name: BADA_UNIFIED_SETTINGS.presetsOverview.name,
            type: "hidden",
            defaultValue: ""
        });

        applyBilingualSettingsUI();

        // 3. Monitor settings dialog opening to inject button and update bilingual labels
        const observer = new MutationObserver(() => {
            const hasSettingsModal = document.querySelector(".p-dialog, .comfy-modal, .comfy-settings-dialog");
            if (hasSettingsModal) {
                applyBilingualSettingsUI();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // Polling hook when settings dialog is opened
        setInterval(() => {
            const hasSettingsModal = document.querySelector(".p-dialog, .comfy-modal, .comfy-settings-dialog");
            if (hasSettingsModal) {
                applyBilingualSettingsUI();
            }
        }, 500);

        // 4. Cleanup floating tooltips
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

        console.log("%c[ComfyUI-Bada-Utils]%c BADA Settings unified in English (한국어) with Global Presets Overview 🌊", "color: #00f0ff; font-weight: bold;", "color: inherit;");
    }
});
