import { app } from "../../scripts/app.js";
import { BadaI18n } from "./bada_i18n.js";
import { showGlobalPresetsOverviewModal, getGlobalPresetsSummary, getGlobalPresetsStore } from "./presets_overview_modal.js";
import { showToast } from "./presets_modal.js";

/**
 * ComfyUI-Bada-Utils Core Settings Initializer
 * Settings Section is permanently unified in English (한국어) bilingual format:
 * 1. General (일반) -> 🌐 UI Language (UI 언어 설정)
 * 2. Smart Features (스마트 기능) -> 📁 Sidebar Workflow Folder Management (사이드바 워크플로우 폴더 정리 및 이동)
 * 3. Workflow & QoL (워크플로우 & 편의성) -> 🖱️ Smooth Mouse Pan & Wheel Zoom Fixer (마우스 휠 줌 & 중간 버튼 패닝 보정기)
 * + 4. Global Presets (글로벌 프리셋) -> Inline Expandable Information & Management Panel
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
    }
};

let isPresetsExpanded = true;

/**
 * Live DOM updater for open Settings Dialogs (both PrimeVue modal & classic table)
 * Ensures 100% unified English (한국어) bilingual text and injects Global Presets Expandable Panel.
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
                else if (text.match(/^(?:1\.\s*)?General(?:\s*\(일반\))?$/i) || text === "일반") {
                    el.textContent = "1. General (일반)";
                }
                else if (text.match(/^(?:2\.\s*)?Smart Features(?:\s*\(스마트 기능\))?$/i) || text === "스마트 기능") {
                    el.textContent = "2. Smart Features (스마트 기능)";
                }
                else if (text.match(/^(?:3\.\s*)?Workflow & QoL(?:\s*\(워크플로우 & 편의성\))?$/i) || text === "워크플로우 & 편의성") {
                    el.textContent = "3. Workflow & QoL (워크플로우 & 편의성)";
                }
            }
        });

        // 3. Inject / Attach the Expandable Global Presets Panel right after MouseFix setting row
        injectInlinePresetsPanel(dialog);
    });
}

function injectInlinePresetsPanel(dialog) {
    if (!dialog) return;

    // 1. Find the element containing "Smooth Mouse" or "마우스 휠 줌"
    const allTextEls = Array.from(dialog.querySelectorAll("span, label, td, div, p"));
    const mouseLabel = allTextEls.find(el =>
        el.children.length === 0 && el.textContent && (
            el.textContent.includes("Smooth Mouse") ||
            el.textContent.includes("마우스 휠 줌")
        )
    );

    if (!mouseLabel) return;

    // 2. Walk up to find the outermost container row of this setting
    let settingRow = mouseLabel;
    while (settingRow.parentElement && settingRow.parentElement !== dialog && !settingRow.parentElement.classList.contains("p-dialog-content")) {
        const p = settingRow.parentElement;
        if (p.querySelector(".p-inputswitch, input[type='checkbox'], .p-togglebutton, .p-checkbox") || p.classList.contains("p-field") || p.classList.contains("form-group")) {
            settingRow = p;
            break;
        }
        settingRow = p;
    }

    if (!settingRow || !settingRow.parentElement) return;

    // 3. Check if panel is already attached as next sibling
    let panel = document.getElementById("bada-inline-presets-panel");
    const isAlreadyAttached = panel && panel.parentElement === settingRow.parentElement && settingRow.nextElementSibling === panel;

    if (!panel) {
        panel = document.createElement("div");
        panel.id = "bada-inline-presets-panel";
    }

    panel.style.cssText = "width: 100%; margin-top: 24px; padding-top: 18px; border-top: 1px solid rgba(255, 255, 255, 0.12); display: flex; flex-direction: column; gap: 14px; box-sizing: border-box;";

    if (!isAlreadyAttached) {
        settingRow.insertAdjacentElement("afterend", panel);
    }

    renderInlinePresetsContent(panel);
}

function renderInlinePresetsContent(panel) {
    const summary = getGlobalPresetsSummary();
    const summaryHeader = summary.totalPresets > 0
        ? `🎯 Total Presets: ${summary.totalPresets} across ${summary.nodeCount} Node Types (총 ${summary.totalPresets}개 / ${summary.nodeCount}개 노드 등록됨)`
        : `📭 No Global Presets Saved Yet (저장된 글로벌 프리셋이 없습니다)`;

    panel.innerHTML = `
        <!-- Section Header Bar -->
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; cursor: pointer; user-select: none;" id="bada-inline-toggle-header">
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 15px; font-weight: 700; color: #f8fafc; display: flex; align-items: center; gap: 8px;">
                    <span style="color: #818cf8;">🌐</span>
                    <span>4. Global Presets (글로벌 프리셋 등록 현황 및 관리)</span>
                </span>
                <span style="font-size: 12px; font-weight: 600; color: #38bdf8; background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.3); padding: 2px 10px; border-radius: 10px;">
                    ${summary.totalPresets} ${summary.totalPresets === 1 ? "Preset (1개)" : "Presets (" + summary.totalPresets + "개)"}
                </span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 12px; color: #94a3b8;">※ Stored Globally (ComfyUI 전역 공유)</span>
                <button type="button" id="bada-inline-toggle-btn" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color: #cbd5e1; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                    <span>${isPresetsExpanded ? "▲ Collapse (접기)" : "▼ Expand (펼치기)"}</span>
                </button>
            </div>
        </div>

        <!-- Expandable Body Container -->
        <div id="bada-inline-presets-body" style="display: ${isPresetsExpanded ? 'flex' : 'none'}; flex-direction: column; gap: 14px; background: rgba(20, 24, 38, 0.7); border: 1px solid rgba(99, 102, 241, 0.25); border-radius: 12px; padding: 16px; box-shadow: 0 4px 16px rgba(0,0,0,0.25);">
            <div style="font-size: 13px; color: #93c5fd; font-weight: 600; display: flex; align-items: center; justify-content: space-between;">
                <span>${summaryHeader}</span>
                <span style="font-size: 11px; color: #64748b;">(동일 노드면 모든 워크플로우에서 즉시 적용)</span>
            </div>

            <!-- Cards Grid -->
            <div style="display: flex; flex-direction: column; gap: 10px; max-height: 280px; overflow-y: auto; padding-right: 4px;">
                ${summary.nodeSummaries.length === 0 ? `
                    <div style="text-align: center; padding: 24px 16px; background: rgba(255, 255, 255, 0.02); border: 1px dashed rgba(255, 255, 255, 0.1); border-radius: 8px;">
                        <span style="font-size: 13px; color: #94a3b8;">
                            💡 캔버스에서 원하는 노드를 <b>우클릭</b> 후 <b>[현재 세팅 글로벌 프리셋으로 저장...]</b>을 누르면 이곳에 노드별로 자동 등록됩니다.
                        </span>
                    </div>
                ` : `
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px;">
                        ${summary.nodeSummaries.map(node => `
                            <div style="background: rgba(30, 36, 56, 0.85); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px;">
                                <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255, 255, 255, 0.06); padding-bottom: 4px;">
                                    <span style="font-size: 13px; font-weight: 700; color: #f1f5f9; font-family: monospace;">🧩 ${escapeHtml(node.nodeType)}</span>
                                    <span style="font-size: 11px; font-weight: 600; color: #a5b4fc; background: rgba(99, 102, 241, 0.2); padding: 1px 6px; border-radius: 6px;">${node.count}개</span>
                                </div>
                                <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                                    ${node.presets.map(name => `
                                        <span style="font-size: 11px; color: #cbd5e1; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); padding: 2px 6px; border-radius: 8px;">🏷️ ${escapeHtml(name)}</span>
                                    `).join("")}
                                </div>
                            </div>
                        `).join("")}
                    </div>
                `}
            </div>

            <!-- Action Bar -->
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 10px;">
                <div style="display: flex; gap: 8px;">
                    <button type="button" id="bada-inline-export-btn" style="background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.15); color: #e2e8f0; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                        📤 Backup All (전체 백업 JSON)
                    </button>
                    <button type="button" id="bada-inline-import-btn" style="background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.15); color: #e2e8f0; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                        📥 Import (불러오기)
                    </button>
                </div>
                <button type="button" id="bada-inline-popup-btn" style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.25); padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(99,102,241,0.3);">
                    🌐 Open Full Popup (전용 팝업으로 크게 보기)
                </button>
            </div>
        </div>
    `;

    // Toggle expand/collapse
    const toggleHeader = panel.querySelector("#bada-inline-toggle-header");
    toggleHeader?.addEventListener("click", () => {
        isPresetsExpanded = !isPresetsExpanded;
        const body = panel.querySelector("#bada-inline-presets-body");
        const btn = panel.querySelector("#bada-inline-toggle-btn span");
        if (body) body.style.display = isPresetsExpanded ? "flex" : "none";
        if (btn) btn.textContent = isPresetsExpanded ? "▲ Collapse (접기)" : "▼ Expand (펼치기)";
    });

    // Popup button
    panel.querySelector("#bada-inline-popup-btn")?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        showGlobalPresetsOverviewModal();
    });

    // Backup button
    panel.querySelector("#bada-inline-export-btn")?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const store = getGlobalPresetsStore();
        const jsonStr = JSON.stringify(store, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `comfyui_global_presets_backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("📤 Global presets backup JSON downloaded (백업 파일 다운로드 완료)", "success");
    });

    // Import button
    panel.querySelector("#bada-inline-import-btn")?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = (evt) => {
            const file = evt.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (re) => {
                try {
                    const imported = JSON.parse(re.target.result);
                    if (imported && typeof imported === "object") {
                        const current = getGlobalPresetsStore();
                        const merged = { ...current };
                        for (const [k, v] of Object.entries(imported)) {
                            merged[k] = { ...(merged[k] || {}), ...v };
                        }
                        localStorage.setItem("ComfyUI_Universal_Smart_Presets_v1", JSON.stringify(merged));
                        fetch("/api/bada/presets/save", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ presets: merged })
                        }).catch(() => {});
                        renderInlinePresetsContent(panel);
                        showToast("📥 Global presets imported successfully (글로벌 프리셋 불러오기 완료)", "success");
                    }
                } catch (err) {
                    showToast("⚠️ Failed to parse JSON file (JSON 파일 형식 오류): " + err.message, "warning");
                }
            };
            reader.readAsText(file);
        };
        input.click();
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

        // 2. Register Unified Bilingual Settings (Only clean 3 core toggles)
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

        applyBilingualSettingsUI();

        // 3. Monitor settings dialog opening to inject expandable panel and update bilingual labels
        const observer = new MutationObserver(() => {
            const hasSettingsModal = document.querySelector(".p-dialog, .comfy-modal, .comfy-settings-dialog");
            if (hasSettingsModal) {
                applyBilingualSettingsUI();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // Fast periodic check while settings modal is open
        setInterval(() => {
            const hasSettingsModal = document.querySelector(".p-dialog, .comfy-modal, .comfy-settings-dialog");
            if (hasSettingsModal) {
                applyBilingualSettingsUI();
            }
        }, 300);

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

        console.log("%c[ComfyUI-Bada-Utils]%c BADA Settings unified in English (한국어) with Expandable Global Presets Panel 🌊", "color: #00f0ff; font-weight: bold;", "color: inherit;");
    }
});
