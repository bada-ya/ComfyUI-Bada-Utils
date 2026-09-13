import { app } from "../../scripts/app.js";
import { BadaI18n } from "./bada_i18n.js";
import { showGlobalPresetsOverviewModal, getGlobalPresetsSummary, getGlobalPresetsStore } from "./presets_overview_modal.js";
import { showToast } from "./presets_modal.js";
import { setupDualManager } from "./bada_dual_manager.js";

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
//  SVG Vector Icons for Settings UI (100% Native Vector Matches)
// ──────────────────────────────────────────────────────────────────────────────
const BADA_ICONS = {
    workflow: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="15" height="15" style="display:inline-block; vertical-align:-2px; filter:drop-shadow(0 0 3px rgba(0,240,255,0.85));"><path fill="none" stroke="#00f0ff" stroke-linecap="round" stroke-width="1.35" d="M9.186 3.1H6.814m2.372 9.8H7.553C4.466 12.9 2.2 9.904 2.95 6.812l.305-1.262M14.75 2.172l-.594 2.45a1.194 1.194 0 01-1.15.928h-2.3c-.771 0-1.338-.749-1.15-1.522l.593-2.45a1.194 1.194 0 011.15-.928h2.3c.771 0 1.338.749 1.15 1.522Zm-8.304 0-.593 2.45a1.194 1.194 0 01-1.15.928h-2.3c-.772 0-1.338-.749-1.15-1.522l.592-2.45A1.194 1.194 0 012.995.65h2.3c.771 0 1.337.749 1.15 1.522Zm8.304 9.8-.594 2.45a1.194 1.194 0 01-1.15.928h-2.3c-.771 0-1.338-.749-1.15-1.522l.593-2.45a1.194 1.194 0 011.15-.928h2.3c.771 0 1.338.749 1.15 1.522Z"/></svg>`,
    terminal: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#00e5ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-3px; filter:drop-shadow(0 0 4px rgba(0,229,255,0.85));"><rect x="2" y="4" width="20" height="16" rx="3"/><polyline points="6 9 10 12 6 15"/><line x1="12" y1="15" x2="17" y2="15"/></svg>`
};

// ──────────────────────────────────────────────────────────────────────────────
//  Bilingual Settings Definitions (Title + Sub-description, No Numbers, No Tooltips)
// ──────────────────────────────────────────────────────────────────────────────
const BADA_SETTINGS_TEXTS = {
    en: {
        category: "Bada Utils",
        langName: "🌐 UI Language",
        langDesc: "Set display language for Bada nodes, context menus, modals, and Workflows+ sidebar.",

        sidebarName: "📁 Sidebar Workflows+ Folder Management",
        sidebarDesc: `Replaces native sidebar Workflows with <span style="color: #00f0ff; font-weight: 700; display: inline-flex; align-items: center; gap: 3px;">${BADA_ICONS.workflow} Workflows+</span>. Enables folder creation and drag-and-drop management.`,

        mouseName: "🖱️ Mouse Wheel Zoom & Middle-Click Pan Fixer",
        mouseDesc: "Ensures smooth mouse wheel zooming and middle-click drag-panning even directly over canvas nodes or text widgets.",

        blankName: "🧼 Clean Blank Canvas Startup",
        blankDesc: "Start ComfyUI and new tabs with a clean blank canvas instead of default workflows with missing-model errors.",

        presetsBadgeName: "🏷️ Global Presets",
        presetsBadgeDesc: "Display shortcut preset badges on node roofs. Disabling this hides the badges without deleting any preset data.",
        presetsName: "Global Presets",

        loadImageName: "📋 Clipboard & LoadImage Auto-Error Fixer",
        loadImageDesc: "Automatically fixes red border and input validation errors caused by pasting clipboard images (Ctrl+V) or subfolder paths in LoadImage nodes.",

        terminalHubPlain: "Bada Terminal Hub",
        terminalHubTitle: `${BADA_ICONS.terminal} Bada Terminal Hub`,
        terminalHubDesc: "Show or hide the Bada Terminal Hub shortcut icon at the bottom of the left sidebar.",

        dualManagerName: "🧩 Classic Manager Quick Launcher",
        dualManagerDesc: "Adds a classic ComfyUI-Manager launch button directly to the left of Extensions on the top bar, allowing both new and legacy managers to be used."
    },
    ko: {
        category: "Bada Utils",
        langName: "🌐 UI 언어 설정",
        langDesc: "Bada 모든 노드, 우클릭 메뉴, 모달 창, Workflows+의 표시 언어를 설정합니다.",

        sidebarName: "📁 사이드바 워크플로우+ 폴더 관리",
        sidebarDesc: `왼쪽 사이드바의 순정 워크플로우를 <span style="color: #00f0ff; font-weight: 700; display: inline-flex; align-items: center; gap: 3px;">${BADA_ICONS.workflow} 워크플로우+</span>로 대체합니다. 폴더 생성, 워크플로우 이동이 가능해집니다.`,

        mouseName: "🖱️ 마우스 휠 줌 & 중간 버튼(휠) 패닝 보정기",
        mouseDesc: "캔버스 위 노드나 텍스트 박스 위에서도 끊김 없이 휠 줌 및 중간 버튼(휠 클릭) 드래그 패닝이 작동하도록 보정합니다.",

        blankName: "🧼 시작 시 클린 빈 캔버스로 열기",
        blankDesc: "ComfyUI 실행 시 모델 누락 에러가 발생하는 기본 템플릿 대신 깨끗한 빈 캔버스로 시작합니다.",

        presetsBadgeName: "🏷️ 글로벌 프리셋",
        presetsBadgeDesc: "노드 상단 지붕에 글로벌 프리셋 바로가기 뱃지를 표시합니다. 꺼도 저장된 프리셋 데이터는 안전하게 유지됩니다.",
        presetsName: "글로벌 프리셋",

        loadImageName: "📋 클립보드 & LoadImage 자동 에러 해결사",
        loadImageDesc: "LoadImage 노드에 클립보드 이미지(Ctrl+V)를 붙여넣거나 하위 경로 로드 시 발생하는 빨간 테두리 에러를 자동으로 치료합니다.",

        terminalHubPlain: "바다 터미널 허브",
        terminalHubTitle: `${BADA_ICONS.terminal} 바다 터미널 허브`,
        terminalHubDesc: "좌측 사이드바 하단에 Bada Terminal Hub 바로가기 탭 아이콘을 표시합니다.",

        dualManagerName: "🧩 클래식 매니저 퀵 런처",
        dualManagerDesc: "신형 상단 바의 Extensions 버튼 왼쪽에 클래식 ComfyUI-Manager 호출 버튼을 추가하여 신형과 구형 매니저를 동시에 사용합니다."
    }
};

function getSettingsText(key) {
    const lang = BadaI18n.lang === "ko" ? "ko" : "en";
    return BADA_SETTINGS_TEXTS[lang][key] || BADA_SETTINGS_TEXTS.en[key] || "";
}

const BADA_UNIFIED_SETTINGS = {
    lang: {
        id: "BadaUtils.Language",
        category: ["Bada Utils", "Language"],
        name: "🌐 UI Language",
        type: "combo",
        sortOrder: 900,
        options: [
            { value: "en", text: "English" },
            { value: "ko", text: "한국어 (Korean)" },
        ],
        defaultValue: "en"
    },
    sidebar: {
        id: "BadaUtils.SidebarOrganizer",
        category: ["Bada Utils", "Sidebar"],
        name: "📁 Sidebar Workflows+ Folder Management",
        type: "boolean",
        sortOrder: 800,
        defaultValue: true
    },
    mouse: {
        id: "BadaUtils.MouseFix",
        category: ["Bada Utils", "MouseFix"],
        name: "🖱️ Mouse Wheel Zoom & Middle-Click Pan Fixer",
        type: "boolean",
        sortOrder: 700,
        defaultValue: true
    },
    blankStartup: {
        id: "BadaUtils.BlankStartup",
        category: ["Bada Utils", "BlankStartup"],
        name: "🧼 Clean Blank Canvas Startup",
        type: "boolean",
        sortOrder: 600,
        defaultValue: true
    },
    presetsBadge: {
        id: "BadaUtils.ShowPresetBadges",
        category: ["Bada Utils", "PresetBadges"],
        name: "🏷️ Global Presets",
        type: "boolean",
        sortOrder: 500,
        defaultValue: true
    },
    presetsPanel: {
        id: "BadaUtils.GlobalPresetsPanel",
        category: ["Bada Utils", "PresetsPanel"],
        name: "Global Presets",
        sortOrder: 400,
        defaultValue: null
    },
    loadImageFix: {
        id: "BadaUtils.LoadImageClipboardFix",
        category: ["Bada Utils", "LoadImageFix"],
        name: "📋 Clipboard & LoadImage Auto-Error Fixer",
        type: "boolean",
        sortOrder: 300,
        defaultValue: true
    },
    terminalHub: {
        id: "BadaUtils.TerminalHubSidebar",
        category: ["Bada Utils", "TerminalHub"],
        name: "Bada Terminal Hub",
        type: "boolean",
        sortOrder: 200,
        defaultValue: true
    },
    dualManager: {
        id: "BadaUtils.DualManager",
        category: ["Bada Utils", "DualManager"],
        name: "🧩 Classic Manager Quick Launcher",
        type: "boolean",
        sortOrder: 100,
        defaultValue: true
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
// ──────────────────────────────────────────────────────────────────────────────
//  Early Fetch & Node Registry Interceptor (⚓ Anchor Icon Guarantee)
// ──────────────────────────────────────────────────────────────────────────────
(function setupEarlyAnchorInterceptor() {
    if (window._badaAnchorInterceptorInstalled) return;
    window._badaAnchorInterceptorInstalled = true;

    function patchObjectInfo(data) {
        if (!data || typeof data !== 'object') return;
        for (const [k, node] of Object.entries(data)) {
            if (k.startsWith('Bada') || (node.category && (node.category.includes('Bada') || node.category.includes('🌊') || node.category.includes('🌟')))) {
                if (node.category) node.category = node.category.replace(/🌊|🌟/g, '⚓');
                if (node.display_name) node.display_name = node.display_name.replace(/🌊|🌟/g, '⚓');
            }
        }
    }

    const origFetch = window.fetch;
    window.fetch = async function(...args) {
        const res = await origFetch.apply(this, args);
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
        if (url && (url.includes('/object_info') || url.endsWith('/object_info'))) {
            try {
                const clone = res.clone();
                const data = await clone.json();
                patchObjectInfo(data);
                return new Response(JSON.stringify(data), {
                    status: res.status,
                    statusText: res.statusText,
                    headers: res.headers
                });
            } catch (e) {
                // Ignore fallback
            }
        }
        return res;
    };
})();

(function injectBadaStyles() {
    if (document.getElementById("bada-core-css")) return;
    const style = document.createElement("style");
    style.id = "bada-core-css";
    style.textContent = `
        /* Clean Minimalist Sidebar: Pure Icons Only (Strictly hide labels & eliminate scrollbars) */
        .side-bar-button-label {
            display: none !important;
        }
        .side-bar-button {
            height: 2.25rem !important;
            padding: 0.5rem !important;
        }
        .side-tool-bar-container {
            overflow-y: hidden !important;
        }

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
            display: none !important;
        }
        .setting-group:has([data-setting-id^="BadaUtils"]) .setting-item {
            margin-bottom: 14px !important;
            padding-bottom: 12px !important;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06) !important;
        }
        .setting-group:has([data-setting-id^="BadaUtils"]) .setting-item:last-child {
            border-bottom: none !important;
        }
        .setting-group:has([data-setting-id^="BadaUtils"]) .flex.min-h-8 {
            min-height: 34px !important;
            align-items: flex-start !important;
        }
        .setting-group:has([data-setting-id^="BadaUtils"]) .form-label {
            align-items: flex-start !important;
            margin-top: 2px !important;
        }
        .setting-group:has([data-setting-id^="BadaUtils"]) .form-input {
            margin-top: 2px !important;
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
    `;
    document.head.appendChild(style);
})();

// ──────────────────────────────────────────────────────────────────────────────
//  Build Rich Full-Width Presets Panel
// ──────────────────────────────────────────────────────────────────────────────
function buildInlinePresetsPanel() {
    const isKo = BadaI18n.lang === "ko";
    const summary = getGlobalPresetsSummary();
    const summaryHeader = summary.totalPresets > 0
        ? (isKo 
            ? `🎯 총 ${summary.totalPresets}개의 글로벌 프리셋 (${summary.nodeCount}개 노드 타입)`
            : `🎯 Total Presets: ${summary.totalPresets} across ${summary.nodeCount} Node Types`)
        : (isKo
            ? `📭 저장된 글로벌 프리셋이 없습니다`
            : `📭 No Global Presets Saved Yet`);

    const panel = document.createElement("div");
    panel.id = "bada-inline-presets-panel";
    panel.style.cssText = "width: 100%; display: flex; flex-direction: column; gap: 10px; box-sizing: border-box;";

    // 0. Preset Badges Toggle Control Row
    const badgeRow = document.createElement("div");
    badgeRow.id = "bada-preset-badge-toggle-row";
    badgeRow.style.cssText = [
        "display: flex; align-items: center; justify-content: space-between; gap: 12px;",
        "padding: 10px 14px; background: rgba(255, 255, 255, 0.03);",
        "border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px;"
    ].join("");

    const isBadgesEnabled = (() => {
        try {
            if (window.app?.ui?.settings) {
                const v = window.app.ui.settings.getSettingValue("BadaUtils.ShowPresetBadges", true);
                if (typeof v === "boolean") return v;
            }
        } catch (_) {}
        try {
            const local = localStorage.getItem("Comfy.Settings.BadaUtils.ShowPresetBadges");
            if (local !== null) return JSON.parse(local);
        } catch (_) {}
        return true;
    })();

    badgeRow.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 3px; min-width: 0;">
            <span style="font-size: 13px; font-weight: 700; color: #f8fafc;">${isKo ? "🏷️ 노드 프리셋 뱃지 표시" : "🏷️ Show Node Preset Badges"}</span>
            <span style="font-size: 11px; color: #94a3b8; line-height: 1.4;">${isKo ? "노드 상단 지붕에 글로벌 프리셋 바로가기 뱃지를 표시합니다. 꺼도 저장된 프리셋 데이터는 안전하게 유지됩니다." : "Display shortcut preset badges on node roofs. Disabling this hides the badges without deleting any preset data."}</span>
        </div>
        <label style="position: relative; display: inline-block; width: 44px; height: 24px; cursor: pointer; flex-shrink: 0; margin-left: 12px;">
            <input type="checkbox" id="bada-badge-toggle-checkbox" ${isBadgesEnabled ? "checked" : ""} style="opacity: 0; width: 0; height: 0;">
            <span class="bada-switch-track" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: ${isBadgesEnabled ? "#6366f1" : "rgba(255, 255, 255, 0.2)"}; transition: .2s; border-radius: 24px;"></span>
            <span class="bada-switch-thumb" style="position: absolute; content: ''; height: 18px; width: 18px; left: ${isBadgesEnabled ? "23px" : "3px"}; bottom: 3px; background-color: white; transition: .2s; border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.4);"></span>
        </label>
    `;

    const checkbox = badgeRow.querySelector("#bada-badge-toggle-checkbox");
    const track = badgeRow.querySelector(".bada-switch-track");
    const thumb = badgeRow.querySelector(".bada-switch-thumb");

    checkbox.addEventListener("change", (e) => {
        const checked = e.target.checked;
        if (track) track.style.backgroundColor = checked ? "#6366f1" : "rgba(255, 255, 255, 0.2)";
        if (thumb) thumb.style.left = checked ? "23px" : "3px";
        try {
            if (window.app?.ui?.settings) {
                window.app.ui.settings.setSettingValue("BadaUtils.ShowPresetBadges", checked);
            }
        } catch (_) {}
        try {
            localStorage.setItem("Comfy.Settings.BadaUtils.ShowPresetBadges", JSON.stringify(checked));
        } catch (_) {}
        app.graph?.setDirtyCanvas?.(true, true);
        showToast(isKo 
            ? (checked ? "🏷️ 노드 프리셋 뱃지 표시 켜짐" : "🏷️ 노드 프리셋 뱃지 숨김 (프리셋 데이터는 안전하게 보존됨)")
            : (checked ? "🏷️ Node preset badges shown" : "🏷️ Node preset badges hidden (data preserved)"), "info");
    });

    panel.appendChild(badgeRow);

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
            <span style="font-size: 11px; color: #94a3b8;">${isKo ? "※ 모든 워크플로우에서 전역 공유됨" : "※ Shared globally across workflows"}</span>
            <button type="button" id="bada-inline-toggle-btn" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.18); color: #e2e8f0; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                <span class="bada-toggle-text">${isPresetsExpanded ? (isKo ? "▲ 접기" : "▲ Collapse") : (isKo ? "▼ 펼치기" : "▼ Expand")}</span>
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
                ${isKo ? `
                    📭 저장된 글로벌 프리셋이 없습니다.<br>
                    <span style="font-size: 11px; color: #64748b;">(캔버스에서 노드를 우클릭하여 '현재 세팅 글로벌 프리셋으로 저장'을 선택하면 여기에 표시됩니다)</span>
                ` : `
                    📭 No global presets saved yet.<br>
                    <span style="font-size: 11px; color: #64748b;">(Right-click any node on canvas and select 'Save Current Settings as Global Preset' to view them here)</span>
                `}
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
                ${isKo ? "📤 전체 백업 (JSON)" : "📤 Backup All (JSON)"}
            </button>
            <button type="button" id="bada-inline-import-btn" style="background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.15); color: #e2e8f0; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                ${isKo ? "📥 불러오기" : "📥 Import"}
            </button>
        </div>
        <button type="button" id="bada-inline-popup-btn" style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.25); padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(99,102,241,0.3);">
            ${isKo ? "🌐 전용 팝업으로 크게 보기" : "🌐 Open Presets Manager"}
        </button>
    `;
    body.appendChild(actions);

    // Toggle expand/collapse
    headerBar.addEventListener("click", () => {
        isPresetsExpanded = !isPresetsExpanded;
        body.style.display = isPresetsExpanded ? "flex" : "none";
        const txt = headerBar.querySelector(".bada-toggle-text");
        if (txt) txt.textContent = isPresetsExpanded ? (isKo ? "▲ 접기" : "▲ Collapse") : (isKo ? "▼ 펼치기" : "▼ Expand");
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
        showToast(isKo ? "📤 백업 파일 다운로드 완료" : "📤 Global presets backup JSON downloaded", "success");
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
                        showToast(isKo ? "📥 글로벌 프리셋 불러오기 완료" : "📥 Global presets imported successfully", "success");
                    }
                } catch (err) {
                    showToast((isKo ? "⚠️ JSON 파일 형식 오류: " : "⚠️ Failed to parse JSON file: ") + err.message, "warning");
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
//  Dynamic Settings Dialog Live Updater (Freeze-Safe & Re-entrant Guarded)
// ──────────────────────────────────────────────────────────────────────────────
let isApplyingBilingualUI = false;
function applyBilingualSettingsUI(targetLang) {
    if (isApplyingBilingualUI) return;
    isApplyingBilingualUI = true;
    try {
        const lang = targetLang || BadaI18n.lang || "en";
        const isKo = lang === "ko";
        const texts = BADA_SETTINGS_TEXTS[isKo ? "ko" : "en"];

        // NOTE: Do NOT modify app.ui.settings.settingsLookup/settingsById here.
        // Those are Vue reactive refs — any mutation triggers a full dialog re-render,
        // which orphans PrimeVue tooltips at (0,0) and breaks ALL native tooltips.
        // Bilingual display is handled purely through DOM-level label updates below.

        // 2. Setting rows label updates (Title with custom SVG + Sub-description below)
        const settingRows = document.querySelectorAll('[data-setting-id^="BadaUtils"], [data-setting-id^="⚓ Bada"]');
        settingRows.forEach(row => {
            const id = row.getAttribute("data-setting-id");
            if (id === BADA_UNIFIED_SETTINGS.presetsPanel.id) return; // inline presets panel is handled separately

            const formLabel = row.querySelector(".form-label, label");
            if (!formLabel) return;

            let targetTitle = null;
            let targetDesc = null;

            if (id === BADA_UNIFIED_SETTINGS.lang.id) {
                targetTitle = texts.langName;
                targetDesc = texts.langDesc;
            } else if (id === BADA_UNIFIED_SETTINGS.sidebar.id) {
                targetTitle = texts.sidebarName;
                targetDesc = texts.sidebarDesc;
            } else if (id === BADA_UNIFIED_SETTINGS.mouse.id) {
                targetTitle = texts.mouseName;
                targetDesc = texts.mouseDesc;
            } else if (id === BADA_UNIFIED_SETTINGS.blankStartup.id) {
                targetTitle = texts.blankName;
                targetDesc = texts.blankDesc;
            } else if (id === BADA_UNIFIED_SETTINGS.presetsBadge.id) {
                targetTitle = texts.presetsBadgeName;
                targetDesc = texts.presetsBadgeDesc;
            } else if (id === BADA_UNIFIED_SETTINGS.loadImageFix.id) {
                targetTitle = texts.loadImageName;
                targetDesc = texts.loadImageDesc;
            } else if (id === BADA_UNIFIED_SETTINGS.terminalHub.id) {
                targetTitle = texts.terminalHubTitle;
                targetDesc = texts.terminalHubDesc;
            } else if (id === BADA_UNIFIED_SETTINGS.dualManager.id) {
                targetTitle = texts.dualManagerName;
                targetDesc = texts.dualManagerDesc;
            }

            if (!targetTitle) return;

            // Enforce vertical flex layout for form-label
            formLabel.style.display = "flex";
            formLabel.style.flexDirection = "column";
            formLabel.style.alignItems = "flex-start";
            formLabel.style.justifyContent = "center";
            formLabel.style.gap = "3px";

            // Title span injection (with custom SVG)
            const titleSpan = formLabel.querySelector("span[id$='-label']") || formLabel.querySelector("span");
            if (titleSpan && titleSpan.__badaTitle !== targetTitle) {
                titleSpan.__badaTitle = targetTitle;
                titleSpan.innerHTML = targetTitle;
                titleSpan.style.color = "#f8fafc";
                titleSpan.style.fontWeight = "600";
                titleSpan.style.fontSize = "13px";
                titleSpan.style.display = "inline-flex";
                titleSpan.style.alignItems = "center";
                titleSpan.style.gap = "6px";
            }

            // Sub-description injection
            let descEl = formLabel.querySelector(".bada-setting-desc");
            if (!descEl && targetDesc) {
                descEl = document.createElement("div");
                descEl.className = "bada-setting-desc";
                descEl.style.cssText = "font-size: 11px; color: #94a3b8; line-height: 1.4; font-weight: 400; margin-top: 1px;";
                formLabel.appendChild(descEl);
            }
            if (descEl && targetDesc && descEl.__badaDesc !== targetDesc) {
                descEl.__badaDesc = targetDesc;
                descEl.innerHTML = targetDesc;
            }
        });

        // 3. Clean left sidebar nav item (Single clean plug icon)
        const navLink = document.querySelector('[data-nav-id="root/Bada Utils"]');
        if (navLink) {
            const span = navLink.querySelector("span");
            if (span && span.textContent.startsWith("⚓")) {
                span.textContent = "Bada Utils";
            }
        }
    } catch (e) {
        console.warn("[ComfyUI-Bada-Utils] Safe bilingual UI updater handled exception:", e);
    } finally {
        isApplyingBilingualUI = false;
    }
}
window.__badaApplySettingsUI = applyBilingualSettingsUI;

// ──────────────────────────────────────────────────────────────────────────────
//  Extension Registration
// ──────────────────────────────────────────────────────────────────────────────
app.registerExtension({
    name: "BadaUtils.Core",

    async setup() {
        // 1. Initialize Canvas bilingual translation engine
        BadaI18n.init(app);
        const currentLang = BadaI18n.lang || "en";
        const texts = BADA_SETTINGS_TEXTS[currentLang === "ko" ? "ko" : "en"];

        // 2. Register Unified Bilingual Settings (English + 한국어)
        const safeAddSetting = (settingConfig) => {
            try {
                console.log("[Bada safeAddSetting]", settingConfig.id, JSON.stringify(settingConfig.category));
                app.ui.settings.addSetting(settingConfig);
            } catch (err) {
                console.warn("[Bada safeAddSetting CAUGHT ERROR]", settingConfig.id, err);
                try {
                    const fallbackConfig = { ...settingConfig };
                    app.ui.settings.addSetting(fallbackConfig);
                } catch (fallbackErr) {
                    console.warn("[ComfyUI-Bada-Utils] Failed to add setting:", settingConfig.id, err, fallbackErr);
                }
            }
        };

        // ① UI Language
        safeAddSetting({
            id: BADA_UNIFIED_SETTINGS.lang.id,
            category: [texts.category, "Language"],
            name: texts.langName,
            type: BADA_UNIFIED_SETTINGS.lang.type,
            sortOrder: BADA_UNIFIED_SETTINGS.lang.sortOrder,
            options: BADA_UNIFIED_SETTINGS.lang.options,
            defaultValue: currentLang,
            onChange: (newVal) => {
                const target = (typeof newVal === "object" && newVal?.value) ? newVal.value : newVal;
                if (target === "ko" || target === "en") {
                    BadaI18n.setLanguage(target, false);
                    applyBilingualSettingsUI(target);
                    app.graph?.setDirtyCanvas?.(true, true);
                }
            }
        });

        // Auto-refresh presets inline panel and settings DOM when language switches
        BadaI18n.subscribe((lang) => {
            const existingPanel = document.getElementById("bada-inline-presets-panel");
            if (existingPanel) {
                existingPanel.replaceWith(buildInlinePresetsPanel());
            }
            applyBilingualSettingsUI(lang);
        });

        // ② Sidebar Workflow Folder Management
        safeAddSetting({
            id: BADA_UNIFIED_SETTINGS.sidebar.id,
            category: [texts.category, "Sidebar"],
            name: texts.sidebarName,
            type: BADA_UNIFIED_SETTINGS.sidebar.type,
            sortOrder: BADA_UNIFIED_SETTINGS.sidebar.sortOrder,
            defaultValue: BADA_UNIFIED_SETTINGS.sidebar.defaultValue,
            onChange: (newVal) => {
                const target = (typeof newVal === "object" && newVal !== null && "value" in newVal) ? !!newVal.value : !!newVal;
                if (window.__BADA_SYNC_SIDEBAR_STATE__) {
                    window.__BADA_SYNC_SIDEBAR_STATE__(target);
                }
            }
        });

        // ③ Smooth Mouse Pan & Wheel Zoom Fixer
        safeAddSetting({
            id: BADA_UNIFIED_SETTINGS.mouse.id,
            category: [texts.category, "MouseFix"],
            name: texts.mouseName,
            type: BADA_UNIFIED_SETTINGS.mouse.type,
            sortOrder: BADA_UNIFIED_SETTINGS.mouse.sortOrder,
            defaultValue: BADA_UNIFIED_SETTINGS.mouse.defaultValue
        });

        // ④ Startup Behavior (Clean Blank Canvas Startup)
        safeAddSetting({
            id: BADA_UNIFIED_SETTINGS.blankStartup.id,
            category: [texts.category, "BlankStartup"],
            name: texts.blankName,
            type: BADA_UNIFIED_SETTINGS.blankStartup.type,
            sortOrder: BADA_UNIFIED_SETTINGS.blankStartup.sortOrder,
            defaultValue: BADA_UNIFIED_SETTINGS.blankStartup.defaultValue
        });

        // ⑤-1 Node Preset Badges
        safeAddSetting({
            id: BADA_UNIFIED_SETTINGS.presetsBadge.id,
            category: [texts.category, "PresetBadges"],
            name: texts.presetsBadgeName,
            type: BADA_UNIFIED_SETTINGS.presetsBadge.type,
            sortOrder: BADA_UNIFIED_SETTINGS.presetsBadge.sortOrder,
            defaultValue: BADA_UNIFIED_SETTINGS.presetsBadge.defaultValue,
            onChange: () => {
                app.graph?.setDirtyCanvas?.(true, true);
            }
        });

        // ⑤-2 Full-Width Inline Global Presets Overview & Management Panel
        safeAddSetting({
            id: BADA_UNIFIED_SETTINGS.presetsPanel.id,
            category: [texts.category, "PresetsPanel"],
            name: texts.presetsName,
            sortOrder: BADA_UNIFIED_SETTINGS.presetsPanel.sortOrder,
            type: () => {
                return buildInlinePresetsPanel();
            },
            defaultValue: null
        });

        // ⑥ Clipboard & LoadImage Auto-Error Fixer
        safeAddSetting({
            id: BADA_UNIFIED_SETTINGS.loadImageFix.id,
            category: [texts.category, "LoadImageFix"],
            name: texts.loadImageName,
            type: BADA_UNIFIED_SETTINGS.loadImageFix.type,
            sortOrder: BADA_UNIFIED_SETTINGS.loadImageFix.sortOrder,
            defaultValue: BADA_UNIFIED_SETTINGS.loadImageFix.defaultValue,
            onChange: (newVal) => {
                const isEnabled = (typeof newVal === "object" && newVal?.value !== undefined) ? newVal.value : newVal;
                if (isEnabled && window.BadaLoadImageFixer?.healAllImageNodes) {
                    window.BadaLoadImageFixer.healAllImageNodes();
                }
            }
        });

        // ⑦ Bada Terminal Hub Sidebar Tab
        safeAddSetting({
            id: BADA_UNIFIED_SETTINGS.terminalHub.id,
            category: [texts.category, "TerminalHub"],
            name: texts.terminalHubPlain || "Bada Terminal Hub",
            type: BADA_UNIFIED_SETTINGS.terminalHub.type,
            sortOrder: BADA_UNIFIED_SETTINGS.terminalHub.sortOrder,
            defaultValue: BADA_UNIFIED_SETTINGS.terminalHub.defaultValue,
            onChange: (newVal) => {
                const target = (typeof newVal === "object" && newVal !== null && "value" in newVal) ? !!newVal.value : !!newVal;
                if (window.__BADA_SYNC_TERMINAL_SIDEBAR__) {
                    window.__BADA_SYNC_TERMINAL_SIDEBAR__(target);
                }
            }
        });

        // ⑧ Classic Manager Quick Launcher
        safeAddSetting({
            id: BADA_UNIFIED_SETTINGS.dualManager.id,
            category: [texts.category, "DualManager"],
            name: texts.dualManagerName,
            type: BADA_UNIFIED_SETTINGS.dualManager.type,
            sortOrder: BADA_UNIFIED_SETTINGS.dualManager.sortOrder,
            defaultValue: BADA_UNIFIED_SETTINGS.dualManager.defaultValue,
            onChange: (newVal) => {
                const target = (typeof newVal === "object" && newVal !== null && "value" in newVal) ? !!newVal.value : !!newVal;
                if (window.__BADA_SET_DUAL_MANAGER_VISIBILITY__) {
                    window.__BADA_SET_DUAL_MANAGER_VISIBILITY__(target);
                }
            }
        });

        // Initialize Classic Manager Launcher
        try {
            setupDualManager();
        } catch (e) {
            console.warn("[ComfyUI-Bada-Utils] Dual Manager launcher init notice:", e);
        }

        // 4. ⌨️ Global ESC Key Dismissal for All Custom Bada Modals & Dialogs
        if (!window.__BADA_GLOBAL_ESC_INSTALLED__) {
            window.__BADA_GLOBAL_ESC_INSTALLED__ = true;
            window.addEventListener("keydown", (e) => {
                if (e.key === "Escape") {
                    // 1. Guide Modal (Top-most sub-modal)
                    const guideModal = document.getElementById("usp-guide-modal");
                    if (guideModal && guideModal.classList.contains("active")) {
                        guideModal.classList.remove("active");
                        e.stopPropagation();
                        e.preventDefault();
                        return;
                    }

                    // 2. Auto-assign Overlay
                    const autoAssignOverlay = document.querySelector(".auto-assign-overlay");
                    if (autoAssignOverlay) {
                        autoAssignOverlay.remove();
                        e.stopPropagation();
                        e.preventDefault();
                        return;
                    }

                    // 3. Global Presets Overview Modal
                    const overviewModal = document.getElementById("bada-global-presets-overview-modal");
                    if (overviewModal && overviewModal.classList.contains("active")) {
                        overviewModal.classList.remove("active");
                        e.stopPropagation();
                        e.preventDefault();
                        return;
                    }

                    // 4. Universal Preset Hub Modal
                    const hubModal = document.getElementById("usp-hub-modal");
                    if (hubModal && hubModal.classList.contains("active")) {
                        hubModal.classList.remove("active");
                        e.stopPropagation();
                        e.preventDefault();
                        return;
                    }

                    // 5. Global Presets Manager Modal
                    const presetsModal = document.getElementById("usp-presets-modal");
                    if (presetsModal && presetsModal.classList.contains("active")) {
                        presetsModal.classList.remove("active");
                        e.stopPropagation();
                        e.preventDefault();
                        return;
                    }
                }
            }, true); // Capture phase
        }

        // 4. Ensure all Bada node titles and categories display the anchor ⚓ symbol
        const updateNodeTitles = () => {
            if (window.LiteGraph && LiteGraph.registered_node_types) {
                for (const [type, ctor] of Object.entries(LiteGraph.registered_node_types)) {
                    if (type.startsWith("Bada") || type === "UniversalPresetHub" || (ctor.category && (ctor.category.includes("Bada") || ctor.category.includes("🌊") || ctor.category.includes("🌟")))) {
                        try { if (ctor.title) ctor.title = ctor.title.replace(/🌊|🌟/g, "⚓"); } catch (_) {}
                        try { if (ctor.prototype?.title) ctor.prototype.title = ctor.prototype.title.replace(/🌊|🌟/g, "⚓"); } catch (_) {}
                        try { if (ctor.category) ctor.category = ctor.category.replace(/🌊|🌟/g, "⚓"); } catch (_) {}
                        if (ctor.nodeData) {
                            try { if (ctor.nodeData.category) ctor.nodeData.category = ctor.nodeData.category.replace(/🌊|🌟/g, "⚓"); } catch (_) {}
                            try { if (ctor.nodeData.display_name) ctor.nodeData.display_name = ctor.nodeData.display_name.replace(/🌊|🌟/g, "⚓"); } catch (_) {}
                        }
                    }
                }
            }
        };
        updateNodeTitles();
        setTimeout(updateNodeTitles, 500);
        setTimeout(updateNodeTitles, 1500);
        setTimeout(updateNodeTitles, 3000);

        // 5. Safe & Efficient Triggering for Bilingual Settings UI (Title SVGs + Sub-descriptions)
        if (!window.__BADA_SETTINGS_UI_OBSERVER_INSTALLED__) {
            window.__BADA_SETTINGS_UI_OBSERVER_INSTALLED__ = true;

            function observeSettingsDialog() {
                const dialog = document.querySelector('[role="dialog"]');
                if (!dialog || dialog.__badaObserverAttached) return;
                dialog.__badaObserverAttached = true;

                let scheduled = false;
                const observer = new MutationObserver((mutations) => {
                    // Strictly ignore tooltips and non-Bada elements to prevent any layout interference
                    let hasBadaChange = false;
                    for (const m of mutations) {
                        for (const node of m.addedNodes) {
                            if (node.nodeType === 1 && (node.matches?.('[data-setting-id^="BadaUtils"]') || node.querySelector?.('[data-setting-id^="BadaUtils"]'))) {
                                hasBadaChange = true;
                                break;
                            }
                        }
                        if (hasBadaChange) break;
                    }
                    if (!hasBadaChange) return;

                    if (scheduled) return;
                    scheduled = true;
                    requestAnimationFrame(() => {
                        scheduled = false;
                        applyBilingualSettingsUI();
                    });
                });

                observer.observe(dialog, { childList: true, subtree: true });
            }

            const triggerUIUpdate = () => {
                observeSettingsDialog();
                applyBilingualSettingsUI();
            };

            // Intercept settings dialog open
            if (app.ui?.settings && !app.ui.settings.__badaHooked) {
                app.ui.settings.__badaHooked = true;
                const origShow = app.ui.settings.show;
                if (origShow) {
                    app.ui.settings.show = function (...args) {
                        const res = origShow.apply(this, args);
                        setTimeout(triggerUIUpdate, 60);
                        setTimeout(triggerUIUpdate, 250);
                        return res;
                    };
                }
            }

            // Click listener for settings sidebar, categories, and tabs
            document.addEventListener("click", (e) => {
                const target = e.target;
                if (target && target.closest) {
                    const isSettingsRelated = target.closest(
                        '.side-tool-bar-container button, button[aria-label*="Setting"], button[title*="Setting"], [role="dialog"] div.cursor-pointer, [role="dialog"] [role="tab"], [role="dialog"] li, .p-listbox-item'
                    );
                    if (isSettingsRelated) {
                        setTimeout(triggerUIUpdate, 50);
                        setTimeout(triggerUIUpdate, 200);
                        setTimeout(triggerUIUpdate, 500);
                    }
                }
            }, true);

            // Input listener for settings search box filtering
            document.addEventListener("input", (e) => {
                if (e.target && e.target.closest && e.target.closest('[role="dialog"] input')) {
                    setTimeout(triggerUIUpdate, 50);
                    setTimeout(triggerUIUpdate, 200);
                }
            }, true);

            // Shortcut listener for Ctrl + ,
            window.addEventListener("keydown", (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === ",") {
                    setTimeout(triggerUIUpdate, 150);
                    setTimeout(triggerUIUpdate, 500);
                }
            }, true);

            // Scoped dialog detector interval (checks only if [role="dialog"] exists)
            setInterval(() => {
                const dialog = document.querySelector('[role="dialog"]');
                if (dialog && !dialog.__badaObserverAttached) {
                    observeSettingsDialog();
                    applyBilingualSettingsUI();
                }
            }, 400);

            // Ghost tooltip pruner removed: was interfering with native PrimeVue tooltips.
        }

        console.log(
            "%c[ComfyUI-Bada-Utils]%c BADA Bilingual Settings & Full-Width Global Presets Panel Ready ⚓",
            "color: #00f0ff; font-weight: bold;", "color: inherit;"
        );
    }
});
