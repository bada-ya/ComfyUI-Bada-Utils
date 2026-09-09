import { app } from "../../scripts/app.js";
import { BadaI18n } from "./bada_i18n.js";
import { showGlobalPresetsOverviewModal, getGlobalPresetsSummary, getGlobalPresetsStore } from "./presets_overview_modal.js";
import { showToast } from "./presets_modal.js";

/**
 * ComfyUI-Bada-Utils · bada_core.js
 * 
 * Unified Bilingual Settings (English + 한국어) with Full-Width Inline
 * Global Presets Overview & Management Panel.
 * 
 * Freeze-Safe Architecture:
 * Uses ComfyUI's native addSetting custom renderer with full-width CSS styling.
 * ZERO MutationObserver on document.body, ZERO DOM racing, ZERO infinite loops.
 */

// ──────────────────────────────────────────────────────────────────────────────
//  Bilingual Settings Definitions
// ──────────────────────────────────────────────────────────────────────────────
const BADA_UNIFIED_SETTINGS = {
    lang: {
        id: "BadaUtils.Language",
        category: ["🌊 Bada Utils", "1. General (일반)"],
        name: "🌐 UI Language (UI 언어 설정)",
        tooltip: "Set display language for Bada nodes, context menus, modals, and Workflows+ sidebar. (Bada 노드, 우클릭 메뉴, 모달 창, Workflows+ 사이드바의 표시 언어를 설정합니다.)",
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
        tooltip: "Organize and move workflow folders via drag-and-drop in the left sidebar. (왼쪽 사이드바에서 드래그 앤 드롭으로 워크플로우 폴더를 자유롭게 정리하고 이동합니다.)",
        type: "boolean",
        defaultValue: true
    },
    mouse: {
        id: "BadaUtils.MouseFix",
        category: ["🌊 Bada Utils", "3. Workflow & QoL (워크플로우 & 편의성)"],
        name: "🖱️ Smooth Mouse Pan & Wheel Zoom Fixer (마우스 휠 줌 & 중간 버튼 패닝 보정기)",
        tooltip: "Smooth mouse wheel zooming and middle-click panning even over canvas nodes or text widgets. (캔버스 위 노드나 텍스트 위에서도 끊김 없이 휠 줌 및 중간 버튼 패닝이 가능하도록 보정합니다.)",
        type: "boolean",
        defaultValue: true
    },
    blankStartup: {
        id: "BadaUtils.BlankStartup",
        category: ["🌊 Bada Utils", "4. Startup Behavior (시작 환경)"],
        name: "🧼 Clean Blank Canvas Startup (시작 시 클린 빈 캔버스로 열기)",
        tooltip: "Start ComfyUI and new tabs with a clean blank canvas instead of default workflows with missing-model errors. (ComfyUI 최초 구동이나 새 탭 열기 시 모델 누락 에러가 발생하는 기본 템플릿 대신 깨끗한 빈 캔버스로 시작합니다.)",
        type: "boolean",
        defaultValue: true
    },
    presetsPanel: {
        id: "BadaUtils.GlobalPresetsPanel",
        category: ["🌊 Bada Utils", "5. Global Presets (글로벌 프리셋 등록 현황 및 관리)"],
        name: "Global Presets",
        defaultValue: null
    }
};

let isPresetsExpanded = true;

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ──────────────────────────────────────────────────────────────────────────────
//  Compact Spacing & Full-Width CSS Injection
// ──────────────────────────────────────────────────────────────────────────────
(function injectBadaStyles() {
    if (document.getElementById("bada-core-css")) return;
    const style = document.createElement("style");
    style.id = "bada-core-css";
    style.textContent = `
        /* 1. Drastically reduce vertical gaps between Bada Utils setting groups */
        .setting-group:has([data-setting-id^="BadaUtils"]) {
            margin-bottom: 0 !important;
        }
        .setting-group:has([data-setting-id^="BadaUtils"]) .my-8 {
            margin-top: 8px !important;
            margin-bottom: 8px !important;
            border-color: rgba(255, 255, 255, 0.08) !important;
        }
        .setting-group:has([data-setting-id^="BadaUtils"]) h3 {
            margin-top: 2px !important;
            margin-bottom: 6px !important;
            font-size: 14px !important;
            font-weight: 700 !important;
        }
        .setting-group:has([data-setting-id^="BadaUtils"]) .setting-item {
            margin-bottom: 6px !important;
        }
        .setting-group:has([data-setting-id^="BadaUtils"]) .flex.min-h-8 {
            min-height: 28px !important;
        }

        /* 2. Full-width styling for Bada Global Presets panel */
        div[data-setting-id="BadaUtils.GlobalPresetsPanel"] {
            width: 100% !important;
            margin-top: 2px !important;
        }
        div[data-setting-id="BadaUtils.GlobalPresetsPanel"] > div {
            flex-direction: column !important;
            align-items: stretch !important;
            width: 100% !important;
        }
        div[data-setting-id="BadaUtils.GlobalPresetsPanel"] .form-label {
            display: none !important;
        }
        div[data-setting-id="BadaUtils.GlobalPresetsPanel"] .form-input {
            width: 100% !important;
            max-width: 100% !important;
            display: block !important;
            justify-content: stretch !important;
        }
        div[data-setting-id="BadaUtils.GlobalPresetsPanel"] #BadaUtils\\.GlobalPresetsPanel {
            width: 100% !important;
        }
        #bada-inline-presets-panel button {
            cursor: pointer;
            transition: filter 0.15s, transform 0.12s;
        }
        #bada-inline-presets-panel button:hover {
            filter: brightness(1.18);
            transform: translateY(-1px);
        }

        /* 3. Wide readable tooltips for settings */
        .p-tooltip {
            max-width: 520px !important;
            width: max-content !important;
            z-index: 9999 !important;
        }
        .p-tooltip .p-tooltip-text {
            max-width: 520px !important;
            min-width: 320px !important;
            white-space: normal !important;
            line-height: 1.55 !important;
            font-size: 13px !important;
            font-weight: 400 !important;
            padding: 9px 14px !important;
            border-radius: 8px !important;
            background: #374151 !important;
            color: #ffffff !important;
            border: 1px solid rgba(255, 255, 255, 0.16) !important;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.5) !important;
            word-break: keep-all !important;
            text-align: left !important;
        }
        .p-tooltip.p-tooltip-right .p-tooltip-arrow {
            border-right-color: #374151 !important;
        }
        .p-tooltip.p-tooltip-left .p-tooltip-arrow {
            border-left-color: #374151 !important;
        }
        .p-tooltip.p-tooltip-top .p-tooltip-arrow {
            border-top-color: #374151 !important;
        }
        .p-tooltip.p-tooltip-bottom .p-tooltip-arrow {
            border-bottom-color: #374151 !important;
        }

        /* Enlarge hit-area for Bada setting info icons */
        .setting-group:has([data-setting-id^="BadaUtils"]) .pi-info-circle {
            cursor: pointer;
            padding: 4px 6px;
            margin: -4px 0;
            border-radius: 4px;
            transition: color 0.15s, background-color 0.15s;
        }
        .setting-group:has([data-setting-id^="BadaUtils"]) .pi-info-circle:hover {
            color: #38bdf8 !important;
            background-color: rgba(56, 189, 248, 0.14);
        }
    `;
    document.head.appendChild(style);
})();

// ──────────────────────────────────────────────────────────────────────────────
//  Build Rich Full-Width Presets Panel
// ──────────────────────────────────────────────────────────────────────────────
function buildInlinePresetsPanel() {
    const summary = getGlobalPresetsSummary();
    const summaryHeader = summary.totalPresets > 0
        ? `🎯 Total Presets: ${summary.totalPresets} across ${summary.nodeCount} Node Types (총 ${summary.totalPresets}개 / ${summary.nodeCount}개 노드 등록됨)`
        : `📭 No Global Presets Saved Yet (저장된 글로벌 프리셋이 없습니다)`;

    const panel = document.createElement("div");
    panel.id = "bada-inline-presets-panel";
    panel.style.cssText = "width: 100%; display: flex; flex-direction: column; gap: 12px; box-sizing: border-box;";

    // Header Controls Bar (Summary + Badges + Toggle Button)
    const headerBar = document.createElement("div");
    headerBar.id = "bada-inline-toggle-header";
    headerBar.style.cssText = [
        "display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;",
        "padding: 10px 14px; background: rgba(99, 102, 241, 0.10);",
        "border: 1px solid rgba(99, 102, 241, 0.25); border-radius: 8px;",
        "cursor: pointer; user-select: none; transition: background 0.18s;"
    ].join("");
    
    headerBar.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 13px; color: #38bdf8; font-weight: 700;">${summaryHeader}</span>
            <span style="font-size: 11px; font-weight: 700; color: #a5b4fc; background: rgba(99, 102, 241, 0.25); border: 1px solid rgba(99, 102, 241, 0.4); padding: 1px 8px; border-radius: 10px;">${summary.totalPresets}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 11px; color: #94a3b8;">※ Shared globally across workflows (모든 워크플로우에서 전역 공유됨)</span>
            <button type="button" id="bada-inline-toggle-btn" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.18); color: #e2e8f0; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                <span class="bada-toggle-text">${isPresetsExpanded ? "▲ Collapse (접기)" : "▼ Expand (펼치기)"}</span>
            </button>
        </div>
    `;

    headerBar.addEventListener("mouseenter", () => { headerBar.style.background = "rgba(99, 102, 241, 0.18)"; });
    headerBar.addEventListener("mouseleave", () => { headerBar.style.background = "rgba(99, 102, 241, 0.10)"; });

    // Collapsible Body
    const body = document.createElement("div");
    body.id = "bada-inline-presets-body";
    body.style.cssText = `display: ${isPresetsExpanded ? "flex" : "none"}; flex-direction: column; gap: 12px;`;

    // Presets Cards Grid (or Empty State)
    const cardsContainer = document.createElement("div");
    if (summary.nodeSummaries.length === 0) {
        cardsContainer.innerHTML = `
            <div style="text-align: center; padding: 24px; background: rgba(255, 255, 255, 0.02); border: 1px dashed rgba(255, 255, 255, 0.15); border-radius: 8px; color: #94a3b8; font-size: 12px; line-height: 1.6;">
                📭 저장된 글로벌 프리셋이 없습니다.<br>
                <span style="font-size: 11px; color: #64748b;">(캔버스에서 노드를 우클릭하여 '현재 세팅 글로벌 프리셋으로 저장'을 선택하면 여기에 표시됩니다)</span>
            </div>
        `;
    } else {
        const grid = document.createElement("div");
        grid.style.cssText = "display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; max-height: 280px; overflow-y: auto; padding-right: 4px;";
        summary.nodeSummaries.forEach(node => {
            const card = document.createElement("div");
            card.style.cssText = "background: rgba(25, 32, 54, 0.85); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; min-width: 0;";
            const tags = node.presets.map(name =>
                `<span style="font-size: 11px; color: #cbd5e1; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); padding: 2px 6px; border-radius: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;" title="${escapeHtml(name)}">🏷️ ${escapeHtml(name)}</span>`
            ).join("");
            card.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255, 255, 255, 0.06); padding-bottom: 6px;">
                    <span style="font-size: 12px; font-weight: 700; color: #f1f5f9; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(node.nodeType)}">🧩 ${escapeHtml(node.nodeType)}</span>
                    <span style="font-size: 11px; font-weight: 700; color: #a5b4fc; background: rgba(99, 102, 241, 0.2); padding: 1px 6px; border-radius: 10px;">${node.count}</span>
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 4px; max-height: 80px; overflow-y: auto;">
                    ${tags}
                </div>
            `;
            grid.appendChild(card);
        });
        cardsContainer.appendChild(grid);
    }
    body.appendChild(cardsContainer);

    // Action Bar (Backup, Import, Full Popup)
    const actions = document.createElement("div");
    actions.style.cssText = "display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 10px;";
    actions.innerHTML = `
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button type="button" id="bada-inline-export-btn" style="background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.15); color: #e2e8f0; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                📤 Backup All (전체 백업 JSON)
            </button>
            <button type="button" id="bada-inline-import-btn" style="background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.15); color: #e2e8f0; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                📥 Import (불러오기)
            </button>
        </div>
        <button type="button" id="bada-inline-popup-btn" style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.25); padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(99,102,241,0.3);">
            🌐 Open Full Popup (전용 팝업으로 크게 보기)
        </button>
    `;
    body.appendChild(actions);

    // Toggle expand/collapse
    headerBar.addEventListener("click", () => {
        isPresetsExpanded = !isPresetsExpanded;
        body.style.display = isPresetsExpanded ? "flex" : "none";
        const txt = headerBar.querySelector(".bada-toggle-text");
        if (txt) txt.textContent = isPresetsExpanded ? "▲ Collapse (접기)" : "▼ Expand (펼치기)";
    });

    // Popup button
    actions.querySelector("#bada-inline-popup-btn")?.addEventListener("click", (e) => {
        e.stopPropagation();
        showGlobalPresetsOverviewModal();
    });

    // Backup button
    actions.querySelector("#bada-inline-export-btn")?.addEventListener("click", (e) => {
        e.stopPropagation();
        const store = getGlobalPresetsStore();
        const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `comfyui_global_presets_backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("📤 Global presets backup JSON downloaded (백업 파일 다운로드 완료)", "success");
    });

    // Import button
    actions.querySelector("#bada-inline-import-btn")?.addEventListener("click", (e) => {
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
                        const merged = { ...getGlobalPresetsStore() };
                        for (const [k, v] of Object.entries(imported)) {
                            merged[k] = { ...(merged[k] || {}), ...v };
                        }
                        localStorage.setItem("ComfyUI_Universal_Smart_Presets_v1", JSON.stringify(merged));
                        fetch("/api/bada/presets/save", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ presets: merged })
                        }).catch(() => {});
                        // Seamlessly update panel in place
                        panel.replaceWith(buildInlinePresetsPanel());
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

    panel.appendChild(headerBar);
    panel.appendChild(body);
    return panel;
}

// ──────────────────────────────────────────────────────────────────────────────
//  Extension Registration
// ──────────────────────────────────────────────────────────────────────────────
app.registerExtension({
    name: "BadaUtils.Core",

    async setup() {
        // 1. Initialize Canvas bilingual translation engine
        BadaI18n.init(app);

        // 2. Register Unified Bilingual Settings (English + 한국어)
        // ① UI Language
        app.ui.settings.addSetting({
            id: BADA_UNIFIED_SETTINGS.lang.id,
            category: BADA_UNIFIED_SETTINGS.lang.category,
            name: BADA_UNIFIED_SETTINGS.lang.name,
            tooltip: BADA_UNIFIED_SETTINGS.lang.tooltip,
            type: BADA_UNIFIED_SETTINGS.lang.type,
            options: BADA_UNIFIED_SETTINGS.lang.options,
            defaultValue: BadaI18n.lang || "en",
            onChange: (newVal) => {
                const target = (typeof newVal === "object" && newVal?.value) ? newVal.value : newVal;
                if ((target === "ko" || target === "en") && BadaI18n.lang !== target) {
                    BadaI18n.setLanguage(target, false);
                    app.graph?.setDirtyCanvas?.(true, true);
                }
            }
        });

        // ② Sidebar Workflow Folder Management
        app.ui.settings.addSetting({
            id: BADA_UNIFIED_SETTINGS.sidebar.id,
            category: BADA_UNIFIED_SETTINGS.sidebar.category,
            name: BADA_UNIFIED_SETTINGS.sidebar.name,
            tooltip: BADA_UNIFIED_SETTINGS.sidebar.tooltip,
            type: BADA_UNIFIED_SETTINGS.sidebar.type,
            defaultValue: BADA_UNIFIED_SETTINGS.sidebar.defaultValue
        });

        // ③ Smooth Mouse Pan & Wheel Zoom Fixer
        app.ui.settings.addSetting({
            id: BADA_UNIFIED_SETTINGS.mouse.id,
            category: BADA_UNIFIED_SETTINGS.mouse.category,
            name: BADA_UNIFIED_SETTINGS.mouse.name,
            tooltip: BADA_UNIFIED_SETTINGS.mouse.tooltip,
            type: BADA_UNIFIED_SETTINGS.mouse.type,
            defaultValue: BADA_UNIFIED_SETTINGS.mouse.defaultValue
        });

        // ④ Startup Behavior (Clean Blank Canvas)
        app.ui.settings.addSetting({
            id: BADA_UNIFIED_SETTINGS.blankStartup.id,
            category: BADA_UNIFIED_SETTINGS.blankStartup.category,
            name: BADA_UNIFIED_SETTINGS.blankStartup.name,
            tooltip: BADA_UNIFIED_SETTINGS.blankStartup.tooltip,
            type: BADA_UNIFIED_SETTINGS.blankStartup.type,
            defaultValue: BADA_UNIFIED_SETTINGS.blankStartup.defaultValue
        });

        // ⑤ Full-Width Inline Global Presets Overview & Management Panel
        app.ui.settings.addSetting({
            id: BADA_UNIFIED_SETTINGS.presetsPanel.id,
            category: BADA_UNIFIED_SETTINGS.presetsPanel.category,
            name: BADA_UNIFIED_SETTINGS.presetsPanel.name,
            type: () => {
                return buildInlinePresetsPanel();
            },
            defaultValue: null
        });

        // 3. Cleanup floating stuck tooltips only when settings dialog is actually closed
        const cleanupStuckTooltips = () => {
            setTimeout(() => {
                if (!document.querySelector('[role="dialog"]')) {
                    document.querySelectorAll(".p-tooltip, .comfy-tooltip").forEach(el => el.remove());
                }
            }, 100);
        };
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") cleanupStuckTooltips();
        }, true);
        document.addEventListener("click", (e) => {
            if (e.target.closest?.('button[aria-label*="Close"], .p-dialog-header-close')) {
                cleanupStuckTooltips();
            }
        }, true);

        console.log(
            "%c[ComfyUI-Bada-Utils]%c BADA Bilingual Settings & Full-Width Global Presets Panel Ready 🌊",
            "color: #00f0ff; font-weight: bold;", "color: inherit;"
        );
    }
});
