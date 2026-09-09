import { app } from "../../scripts/app.js";
import { BadaI18n } from "./bada_i18n.js";
import { showGlobalPresetsOverviewModal, getGlobalPresetsSummary } from "./presets_overview_modal.js";

/**
 * ComfyUI-Bada-Utils Core Settings Initializer
 * Settings Section is permanently unified in English (한국어) bilingual format:
 * 1. General (일반) -> 🌐 UI Language (UI 언어 설정)
 * 2. Smart Features (스마트 기능) -> 📁 Sidebar Workflow Folder Management (사이드바 워크플로우 폴더 정리 및 이동)
 * 3. Workflow & QoL (워크플로우 & 편의성) -> 🖱️ Smooth Mouse Pan & Wheel Zoom Fixer (마우스 휠 줌 & 중간 버튼 패닝 보정기)
 * 4. Global Presets (글로벌 프리셋) -> 🌐 Global Presets Overview (글로벌 프리셋 전체 현황 및 관리)
 */

const BADA_UNIFIED_SETTINGS = {
    lang: {
        id: "BadaUtils.Language",
        category: ["🌊 Bada Utils", "General (일반)"],
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
        category: ["🌊 Bada Utils", "Smart Features (스마트 기능)"],
        name: "📁 Sidebar Workflow Folder Management (사이드바 워크플로우 폴더 정리 및 이동)",
        type: "boolean",
        defaultValue: true
    },
    mouse: {
        id: "BadaUtils.MouseFix",
        category: ["🌊 Bada Utils", "Workflow & QoL (워크플로우 & 편의성)"],
        name: "🖱️ Smooth Mouse Pan & Wheel Zoom Fixer (마우스 휠 줌 & 중간 버튼 패닝 보정기)",
        type: "boolean",
        defaultValue: true
    },
    presetsOverview: {
        id: "BadaUtils.GlobalPresetsOverview",
        category: ["🌊 Bada Utils", "Global Presets (글로벌 프리셋)"],
        name: "🌐 Global Presets Status (글로벌 프리셋 등록 현황 및 요약)",
    }
};

/**
 * Live DOM updater for open Settings Dialogs (both PrimeVue modal & classic table)
 * Ensures 100% unified English (한국어) bilingual text and injects Global Presets Overview Box.
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
                // Category Headers
                else if (text === "General" || text === "일반") {
                    el.textContent = "General (일반)";
                }
                else if (text === "Smart Features" || text === "스마트 기능") {
                    el.textContent = "Smart Features (스마트 기능)";
                }
                else if (text === "Workflow & QoL" || text === "워크플로우 & 편의성") {
                    el.textContent = "Workflow & QoL (워크플로우 & 편의성)";
                }
                else if (text === "Global Presets" || text === "글로벌 프리셋") {
                    el.textContent = "Global Presets (글로벌 프리셋)";
                }
            }
        });

        // 3. Inject / Refresh Global Presets Box inside open Bada settings tab if visible
        injectPresetsOverviewCard(dialog);
    });
}

function injectPresetsOverviewCard(container) {
    if (!container) return;

    // Check if we are inside the Bada Utils settings pane
    const isBadaSection = container.querySelector(".bada-injected-presets-card") ||
                          Array.from(container.querySelectorAll("span, label, td, div")).some(el =>
                              el.textContent && (el.textContent.includes("Bada Utils") || el.textContent.includes("Smooth Mouse") || el.textContent.includes("마우스 휠 줌"))
                          );

    if (!isBadaSection) return;

    let card = container.querySelector(".bada-injected-presets-card");
    if (!card) {
        card = document.createElement("div");
        card.className = "bada-injected-presets-card";
        card.style.cssText = "margin-top: 18px; padding: 18px 20px; background: rgba(30, 34, 48, 0.75); border: 1px solid rgba(99, 102, 241, 0.25); border-radius: 14px; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.3);";

        // Find insertion point (after the last setting item or at container end)
        const targetHost = container.querySelector(".p-dialog-content") || container;
        targetHost.appendChild(card);
    }

    const summary = getGlobalPresetsSummary();
    const summaryHeader = summary.totalPresets > 0
        ? `🎯 Total Presets: ${summary.totalPresets} across ${summary.nodeCount} Node Types (총 ${summary.totalPresets}개 / ${summary.nodeCount}개 노드 등록됨)`
        : `📭 No Global Presets Saved Yet (등록된 글로벌 프리셋이 없습니다)`;

    const badgesHtml = summary.nodeSummaries.length > 0
        ? summary.nodeSummaries.map(n =>
            `<span style="font-size: 12px; background: rgba(99, 102, 241, 0.18); border: 1px solid rgba(99, 102, 241, 0.35); color: #c7d2fe; padding: 3px 10px; border-radius: 8px; font-family: monospace; font-weight: 600;">🧩 ${escapeHtml(n.nodeType)} (${n.count})</span>`
          ).join(" ")
        : `<span style="font-size: 12px; color: #94a3b8;">💡 Right-click any canvas node & save a preset (노드 우클릭 후 프리셋 저장 시 자동 등록)</span>`;

    card.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 18px;">🌐</span>
                <span style="font-size: 15px; font-weight: 700; color: #f8fafc;">Global Presets Information (글로벌 프리셋 등록 현황)</span>
            </div>
            <span style="font-size: 12px; color: #94a3b8;">※ Stored Globally (ComfyUI 전역 공유)</span>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px;">
            <div style="display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 260px;">
                <span style="font-size: 13px; color: #38bdf8; font-weight: 600;">${summaryHeader}</span>
                <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                    ${badgesHtml}
                </div>
            </div>
            <button type="button" class="bada-btn-open-overview" style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: #ffffff; border: 1px solid rgba(255,255,255,0.25); padding: 10px 18px; border-radius: 10px; font-size: 13px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 4px 14px rgba(99,102,241,0.35); transition: all 0.2s ease;">
                <span>🌐</span>
                <span>View All Global Presets (글로벌 프리셋 전체 현황 및 관리)</span>
            </button>
        </div>
    `;

    card.querySelector(".bada-btn-open-overview")?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        showGlobalPresetsOverviewModal();
    });
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
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
            type: () => {
                const container = document.createElement("div");
                injectPresetsOverviewCard(container);
                return container;
            }
        });

        applyBilingualSettingsUI();

        // 3. Monitor settings dialog opening to keep bilingual labels and live preset badges up-to-date
        const observer = new MutationObserver(() => {
            const hasSettingsModal = document.querySelector(".p-dialog, .comfy-modal, .comfy-settings-dialog");
            if (hasSettingsModal) {
                applyBilingualSettingsUI();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });

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
