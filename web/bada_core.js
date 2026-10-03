import { app } from "../../scripts/app.js";
import { escapeHtml } from "./bada_shared.js";
import { BadaI18n } from "./bada_i18n.js";
import { showGlobalPresetsOverviewModal, getGlobalPresetsSummary, getGlobalPresetsStore } from "./presets_overview_modal.js";
import { showToast } from "./presets_modal.js";
import "./tooltip_fixer.js";
// Legacy Manager node-name cache warm-up. Must be imported here so it registers
// its own app extension; it self-gates on the active Manager UI.
import { refreshLegacyManagerCache, getLastRefreshDate, getManagerUiMode } from "./bada_manager_cache.js";

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

        compactSidebarName: "📐 Compact Sidebar (Icons Only)",
        compactSidebarDesc: "Hides text labels beneath sidebar icons and applies compact padding, eliminating vertical scrollbars.",

        blankName: "🧼 Clean Blank Canvas Startup",
        blankDesc: "Start ComfyUI and new tabs with a clean blank canvas instead of default workflows with missing-model errors.",

        presetsBadgeName: "🏷️ Global Presets",
        presetsBadgeDesc: "Display shortcut preset badges on nodes. Disabling this hides the badges without deleting any preset data.",
        presetsBadgePosName: "🏷️ Preset Badge Position",
        presetsBadgePosDesc: "Position for preset badges on nodes. 'Bottom Dock' auto-tracks dynamic node height changes without overlapping execution time.",
        presetsBadgePosOptions: [
            { value: "bottom", text: "Bottom Dock (Recommended)" },
            { value: "bottom_inside", text: "Bottom Inside" },
            { value: "top_high", text: "Top Stacked" },
            { value: "top_left", text: "Top Left (Legacy)" },
        ],
        presetsName: "Global Presets",

        loadImageName: "📋 Clipboard & LoadImage Auto-Error Fixer",
        loadImageDesc: "Automatically fixes red border and input validation errors caused by pasting clipboard images (Ctrl+V) or subfolder paths in LoadImage nodes.",

        terminalHubPlain: "Bada Terminal Hub",
        terminalHubTitle: `${BADA_ICONS.terminal} Bada Terminal Hub`,
        terminalHubDesc: "Show or hide the Bada Terminal Hub shortcut icon at the bottom of the left sidebar.",

        detectiveName: "⚓ Node Smart Care (Missing Node Resolver & Model Assigner)",
        detectiveDesc: "Smartly resolves uninstalled missing nodes (red X) and missing models/LoRAs via right-click menu, providing one-click installation and smart auto-assignment.",

        noteHelperName: "📝 Text & Prompt One-Click Translator",
        noteHelperDesc: "Automatically adds a one-click translation button to nodes with text inputs or displayed text.",

        translationBlacklistName: "📝 Translation Blacklist",
        translationBlacklistDesc: "Enter node names to exclude from automatic translation, separated by commas.",
        translationWhitelistName: "➕ Translation Forced-Add List",
        translationWhitelistDesc: "Enter node names to force translation buttons on, separated by commas. Auto-detection misses are covered here.",
        saveAsName: "💾 Save As Folder Picker (Choose & Create Folders)",
        saveAsDesc: "Adds folder selection and one-click folder creation to the native File ▸ Save As dialog, so workflows can be saved into any subfolder of the workflows root.",

        legacyManagerCacheName: "🧩 Legacy Manager Node-Name Cache Refresh",
        legacyManagerCacheDesc: "Rebuilds ComfyUI-Manager's node-name index so newly registered custom node names become searchable in the legacy Manager UI. Runs once a day at startup, or on demand with the button below.",

    },
    ko: {
        category: "Bada Utils",
        langName: "🌐 UI 언어 설정",
        langDesc: "Bada 모든 노드, 우클릭 메뉴, 모달 창, Workflows+의 표시 언어를 설정합니다.",

        sidebarName: "📁 사이드바 워크플로우+ 폴더 관리",
        sidebarDesc: `왼쪽 사이드바의 순정 워크플로우를 <span style="color: #00f0ff; font-weight: 700; display: inline-flex; align-items: center; gap: 3px;">${BADA_ICONS.workflow} 워크플로우+</span>로 대체합니다. 폴더 생성, 워크플로우 이동이 가능해집니다.`,

        mouseName: "🖱️ 마우스 휠 줌 & 중간 버튼(휠) 패닝 보정기",
        mouseDesc: "캔버스 위 노드나 텍스트 박스 위에서도 끊김 없이 휠 줌 및 중간 버튼(휠 클릭) 드래그 패닝이 작동하도록 보정합니다.",

        compactSidebarName: "📐 사이드바 콤팩트 모드 (아이콘만 표시)",
        compactSidebarDesc: "사이드바 아이콘 아래 글씨 라벨을 숨기고 여백을 줄여 세로 스크롤바 없는 깔끔한 미니멀 툴바로 만듭니다.",

        blankName: "🧼 시작 시 클린 빈 캔버스로 열기",
        blankDesc: "ComfyUI 실행 시 모델 누락 에러가 발생하는 기본 템플릿 대신 깨끗한 빈 캔버스로 시작합니다.",

        presetsBadgeName: "🏷️ 글로벌 프리셋",
        presetsBadgeDesc: "노드에 글로벌 프리셋 바로가기 뱃지를 표시합니다. 꺼도 저장된 프리셋 데이터는 안전하게 유지됩니다.",
        presetsBadgePosName: "🏷️ 프리셋 뱃지 위치",
        presetsBadgePosDesc: "노드의 프리셋 뱃지 표시 위치를 설정합니다. 기본값(노드 하단 바깥쪽)은 생성물로 인한 노드 길이 변화를 자동 추적하며 상단 실행 시간과 겹치지 않습니다.",
        presetsBadgePosOptions: [
            { value: "bottom", text: "노드 하단 바깥쪽 (Bottom Dock - 권장)" },
            { value: "bottom_inside", text: "노드 하단 안쪽 (Bottom Inside)" },
            { value: "top_high", text: "노드 상단 2층 (Top Stacked)" },
            { value: "top_left", text: "노드 상단 좌측 (Top Left - 레거시)" },
        ],
        presetsName: "글로벌 프리셋",

        loadImageName: "📋 클립보드 & LoadImage 자동 에러 해결사",
        loadImageDesc: "LoadImage 노드에 클립보드 이미지(Ctrl+V)를 붙여넣거나 하위 경로 로드 시 발생하는 빨간 테두리 에러를 자동으로 치료합니다.",

        terminalHubPlain: "바다 터미널 허브",
        terminalHubTitle: `${BADA_ICONS.terminal} 바다 터미널 허브`,
        terminalHubDesc: "좌측 사이드바 하단에 Bada Terminal Hub 바로가기 탭 아이콘을 표시합니다.",

        detectiveName: "⚓ 노드 스마트 케어 (미싱 노드 복구 & 모델 자동 장착)",
        detectiveDesc: "캔버스 빈 공간 또는 노드 우클릭 시, 미설치 미싱 노드(빨간 X) 탐색/설치 및 누락된 모델/LoRA를 탭별로 한눈에 케어하고 스마트 자동 장착합니다.",

        noteHelperName: "📝 텍스트 & 프롬프트 원클릭 번역기",
        noteHelperDesc: "텍스트 입력 또는 표시 위젯이 있는 노드에 번역 버튼을 자동으로 추가합니다.",

        translationBlacklistName: "📝 번역 제외 노드 목록",
        translationBlacklistDesc: "자동 번역에서 제외할 노드명을 쉼표(,)로 구분하여 입력하세요.",
        translationWhitelistName: "➕ 번역 강제 추가 노드 목록",
        translationWhitelistDesc: "자동감지되지 않는 노드명을 쉼표(,)로 구분하여 입력하세요. 번역 버튼이 강제로 추가됩니다.",
        saveAsName: "💾 다른 이름으로 저장 폴더 선택기",
        saveAsDesc: "순정 '다른 이름으로 저장' 창에 폴더 선택과 새 폴더 생성을 추가하여, 워크플로우 루트 안의 원하는 하위 폴더에 바로 저장할 수 있게 합니다.",

        legacyManagerCacheName: "🧩 구형 메니저 커스텀 노드명 캐시 갱신",
        legacyManagerCacheDesc: "구형 메니저에서 새로 등록된 커스텀 노드명이 검색되도록 노드명 인덱스를 다시 만듭니다. 시작 시 하루 1회 자동 실행되며, 아래 버튼으로 언제든지 직접 갱신할 수 있습니다.",

    }
};

function getSettingsText(key) {
    const lang = BadaI18n.lang === "ko" ? "ko" : "en";
    return BADA_SETTINGS_TEXTS[lang][key] || BADA_SETTINGS_TEXTS.en[key] || "";
}

function updatePresetBadgePositionOptions(lang) {
    const setting = BADA_UNIFIED_SETTINGS.presetsBadgePosition;
    const options = BADA_SETTINGS_TEXTS[lang === "ko" ? "ko" : "en"].presetsBadgePosOptions;
    const localizedOptions = options.map((option) => ({ ...option }));
    setting.options.splice(0, setting.options.length, ...localizedOptions);

    const registeredSetting = app.ui?.settings?.settingsLookup?.[setting.id];
    if (registeredSetting) {
        if (Array.isArray(registeredSetting.options) && registeredSetting.options !== setting.options) {
            registeredSetting.options.splice(0, registeredSetting.options.length, ...localizedOptions.map((option) => ({ ...option })));
        } else {
            registeredSetting.options = setting.options;
        }
    }

    const row = document.querySelector(`[data-setting-id="${setting.id}"]`);
    const selectedValue = app.ui?.settings?.getSettingValue?.(setting.id) || setting.defaultValue;
    const selectedOption = localizedOptions.find((option) => option.value === selectedValue);
    const selectedLabel = row?.querySelector(".p-select-label");
    if (selectedLabel && selectedOption) {
        selectedLabel.textContent = selectedOption.text;
        selectedLabel.setAttribute("aria-label", selectedOption.text);
    }

    const openList = document.getElementById(`${setting.id}_list`);
    if (openList) {
        openList.querySelectorAll('[role="option"]').forEach((option, index) => {
            if (localizedOptions[index]) {
                option.textContent = localizedOptions[index].text;
                option.setAttribute("aria-label", localizedOptions[index].text);
            }
        });
    }

    const select = row?.querySelector("select");
    if (!select) return;

    const currentValue = select.value || selectedValue;
    select.replaceChildren(...setting.options.map(({ value, text }) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        return option;
    }));
    select.value = currentValue;
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
    noteHelper: {
        id: "BadaUtils.NoteHelper",
        category: ["Bada Utils", "NoteHelper"],
        name: "📝 Text & Prompt One-Click Translator",
        type: "boolean",
        sortOrder: 850,
        defaultValue: true
    },
    translationBlacklist: {
        id: "BadaUtils.TranslationBlacklist",
        category: ["Bada Utils", "TranslationBlacklist"],
        name: "📝 Translation Blacklist",
        type: "text",
        sortOrder: 840,
        defaultValue: ""
    },
    translationWhitelist: {
        id: "BadaUtils.TranslationWhitelist",
        category: ["Bada Utils", "TranslationWhitelist"],
        name: "➕ Translation Forced-Add List",
        type: "text",
        sortOrder: 839,
        defaultValue: "show text, show any"
    },
    sidebar: {
        id: "BadaUtils.SidebarOrganizer",
        category: ["Bada Utils", "Sidebar"],
        name: "📁 Sidebar Workflows+ Folder Management",
        type: "boolean",
        sortOrder: 800,
        defaultValue: true
    },
    // Legacy Manager cache warm-up. The default is true for BOTH manager UIs on
    // purpose: bada_manager_cache.js gates on /v2/manager/is_legacy_manager_ui and
    // hides this row entirely when the modern UI is active, so a shared default
    // avoids clobbering a stored value on every boot and keeps the two modes
    // independent — no forced overwrite is needed.
    legacyManagerCache: {
        id: "BadaUtils.LegacyManagerCacheRefresh",
        category: ["Bada Utils", "ManagerCache"],
        name: "🧩 Legacy Manager Node-Name Cache Refresh",
        type: "boolean",
        sortOrder: 820,
        defaultValue: true
    },
    saveAsFolderPicker: {
        id: "BadaUtils.SaveAsFolderPicker",
        category: ["Bada Utils", "SaveAsFolderPicker"],
        name: "💾 Save As Folder Picker",
        type: "boolean",
        sortOrder: 790,
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
    compactSidebar: {
        id: "BadaUtils.CompactSidebar",
        category: ["Bada Utils", "CompactSidebar"],
        name: "📐 Compact Sidebar",
        type: "boolean",
        sortOrder: 650,
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
    presetsBadgePosition: {
        id: "BadaUtils.PresetBadgePosition",
        category: ["Bada Utils", "PresetBadgePosition"],
        name: "🏷️ Preset Badge Position",
        type: "combo",
        options: [
            { value: "bottom", text: "Bottom Dock (Recommended)" },
            { value: "bottom_inside", text: "Bottom Inside" },
            { value: "top_high", text: "Top Stacked" },
            { value: "top_left", text: "Top Left (Legacy)" },
        ],
        sortOrder: 490,
        defaultValue: "bottom"
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
    missingDetective: {
        id: "BadaUtils.MissingNodeDetective",
        category: ["Bada Utils", "NodeSmartCare"],
        name: "🩺 Node Smart Care (Missing Node Resolver & Model Assigner)",
        type: "boolean",
        sortOrder: 150,
        defaultValue: true
    }
};

let isPresetsExpanded = true;

// escapeHtml now lives in ./bada_shared.js (imported at the top of this file).

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
        /* Clean Minimalist Sidebar: Pure Icons Only (Controlled by BadaUtils.CompactSidebar) */
        body.bada-compact-sidebar .side-bar-button-label {
            display: none !important;
        }
        body.bada-compact-sidebar .side-bar-button {
            height: 2.25rem !important;
            padding: 0.5rem !important;
        }
        body.bada-compact-sidebar .side-tool-bar-container {
            overflow-y: hidden !important;
        }

        /* Settings Sidebar: Immediate Distinctive Anchor ⚓ icon for Bada Utils */
        [data-nav-id="root/Bada Utils"] i,
        [data-nav-id="root/Bada Utils"] svg,
        [data-nav-id="root/Bada Utils"] [class*="icon"],
        [data-nav-id*="Bada"] i,
        [data-nav-id*="Bada"] svg {
            display: none !important;
        }
        [data-nav-id="root/Bada Utils"]:not(:has(.bada-nav-anchor))::before,
        [data-nav-id*="Bada"]:not(:has(.bada-nav-anchor))::before {
            content: "⚓" !important;
            font-size: 15px !important;
            margin-right: 6px !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
        }

        /* 1. Reduce vertical gaps between Bada Utils setting groups.

           All values below were measured with Playwright against the live dialog
           (dev_tests/probe_dividers.cjs), not guessed:
             - container class is setting-group (SINGULAR), confirmed via DOM walk
             - Bada ships 15 separate wrappers, one per row
             - .setting-item itself has no border, but ComfyUI drops a forced
               "my-8 border-t border-border-default" rule INSIDE each wrapper, which is
               why the vertical rhythm has to be tuned here at all

           .setting-item:last-child never matched (the last row is nested inside the
           panels column, not a sibling of the rest), which is why trailing space survived.
           Use :last-of-type on the parent instead.

           NOTE: never put a backtick inside this block. It lives inside a JS template
           literal, and a stray backtick closes the string early, which throws a
           SyntaxError and prevents the ENTIRE bada_core.js from loading. */
        .setting-group:has([data-setting-id^="BadaUtils"]) {
            margin-bottom: 0 !important;
        }
        .setting-group:has([data-setting-id^="BadaUtils"]) .my-8 {
            margin-top: 8px !important;
            margin-bottom: 8px !important;
            border-color: rgba(255, 255, 255, 0.08) !important;
        }
        /* The Global-Presets block is ONE feature: the "글로벌 프리셋" toggle, its
           "프리셋 뱃지 위치" dropdown and the presets panel all belong together, so no
           rule should cut through them. ComfyUI forces a divider above EVERY row (a
           my-8 border-t border-border-default div, confirmed as a DIRECT child of
           .setting-group via dev_tests/probe_direct_children.cjs), which left the two
           stray lines the user circled on both sides of the 프리셋 뱃지 위치 row.
           Remove only the painted line and keep the 8px rhythm, so the block stays
           continuous without collapsing the row spacing.
           NOTE: no backticks allowed in this block (JS template literal). */
        .setting-group:has([data-setting-id="BadaUtils.PresetBadgePosition"]) > .my-8,
        .setting-group:has([data-setting-id="BadaUtils.GlobalPresetsPanel"]) > .my-8 {
            border-top-color: transparent !important;
        }
        /* Sub-group headings such as "Language", "NoteHelper", "Sidebar" are internal
           grouping labels that duplicate the row title right below them, so they were
           always meant to be hidden. Distinguish the two kinds of h3 by class, measured
           in the live dialog (dev_tests/probe_settings_dom.cjs):
             - text-xs font-bold text-text-secondary uppercase -> the CATEGORY MENU
               (General / Other / ...). Must stay visible.
             - text-base                               -> per-subgroup label.
               Hidden; a blanket h3 display:none would kill the menu too.
           NOTE: no backticks allowed in this block (JS template literal). */
        .setting-group:has([data-setting-id^="BadaUtils"]) > h3.text-base {
            display: none !important;
        }
        .setting-group:has([data-setting-id^="BadaUtils"]) .setting-item {
            margin-bottom: 8px !important;
            padding-bottom: 0 !important;
            border-bottom: none !important;
        }
        /* The real tail of the list. :last-child fails here because the final item sits
           in a different container than its siblings. */
        .setting-group:has([data-setting-id^="BadaUtils"]) > .setting-item:last-of-type {
            margin-bottom: 0 !important;
            padding-bottom: 0 !important;
        }
        .setting-group:has([data-setting-id^="BadaUtils"]) .flex.min-h-8 {
            min-height: 34px !important;
            align-items: center !important;
        }
        .setting-group:has([data-setting-id^="BadaUtils"]) .form-label {
            /* REGRESSION FIX: this rule used to say align-items: center. The JS layer below
               turns .form-label into a column flex container (title span + description),
               and an !important "center" on the cross axis overrode the inline flex-start
               and pushed BOTH the title and the description into the horizontal middle of
               the row (measured live: spanLeft 367 / descLeft 228 inside a 822px label).
               flex-start restores the original left alignment; text-align: left is a
               belt-and-braces guard for the text itself. */
            align-items: flex-start !important;
            text-align: left !important;
            margin-top: 0 !important;
        }
        .setting-group:has([data-setting-id^="BadaUtils"]) .form-input {
            margin-top: 0 !important;
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

        /* 3. Full-width styling for Bada Note Helper & Translator panel */
        div[data-setting-id="BadaUtils.NoteHelper"] {
            width: 100% !important;
            margin-top: 2px !important;
        }
        div[data-setting-id="BadaUtils.NoteHelper"] > div {
            flex-direction: column !important;
            align-items: stretch !important;
            width: 100% !important;
        }
        div[data-setting-id="BadaUtils.NoteHelper"] .form-label,
        div[data-setting-id="BadaUtils.NoteHelper"] .form-input > input[type="checkbox"],
        div[data-setting-id="BadaUtils.NoteHelper"] .form-input > .p-inputswitch,
        div[data-setting-id="BadaUtils.NoteHelper"] .form-input > label {
            display: none !important;
        }
        div[data-setting-id="BadaUtils.NoteHelper"] .form-input {
            width: 100% !important;
            max-width: 100% !important;
            display: block !important;
        }
        /* The two translator lists moved INTO the NoteHelper panel, so their original rows
           must disappear completely - row AND wrapper.

           ComfyUI forces one divider per category: its SettingGroup component renders a
           "my-8 border-t border-border-default" div as the FIRST child of every
           .setting-group (confirmed in the frontend bundle settingStore-*.js and by
           measurement: 14 rules for 15 groups). Hiding only the inner
           [data-setting-id] div therefore left the wrapper alive with nothing but that
           divider, stacking THREE rules back to back (measured top=185/194/203) between
           the translator panel and the sidebar row - the empty band the user flagged.
           Hiding the wrapper removes its divider too, so the run collapses 3 lines -> 1.

           NOTE: no backticks allowed in this block (JS template literal). */
        .setting-group:has([data-setting-id="BadaUtils.TranslationBlacklist"]),
        .setting-group:has([data-setting-id="BadaUtils.TranslationWhitelist"]) {
            display: none !important;
        }
        div[data-setting-id="BadaUtils.TranslationBlacklist"],
        div[data-setting-id="BadaUtils.TranslationWhitelist"] {
            display: none !important;
        }
        .bada-trans-row { display: flex; gap: 8px; align-items: center; }
        .bada-trans-row .bada-trans-input { flex: 1 1 auto; min-width: 0; }
        .bada-trans-row .bada-trans-input.dup {
            border-color: #ef4444 !important;
            box-shadow: 0 0 0 1px rgba(239,68,68,0.55) !important;
        }
        .bada-trans-row .bada-trans-input.conflict {
            border-color: #f59e0b !important;
            box-shadow: 0 0 0 1px rgba(245,158,11,0.55) !important;
        }
        .bada-trans-hint { font-size: 11px; line-height: 1.5; margin-top: 4px; color: #94a3b8; }
        .bada-trans-hint.warn { color: #fbbf24; }
        .bada-trans-hint.error { color: #f87171; }
        .bada-trans-hint.ok { color: #34d399; }

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
    panel.style.cssText = "width: 100%; display: flex; flex-direction: column; gap: 8px; box-sizing: border-box;";

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
    body.style.cssText = `display: ${isPresetsExpanded ? "flex" : "none"}; flex-direction: column; gap: 8px;`;

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
        // No max-height here: the panel is already collapsed/expanded by the header toggle,
        // so capping the grid just leaves a band of dead space under the last row whenever
        // the presets do not fill it. overflow-y:auto then never engages.
        const grid = document.createElement("div");
        grid.style.cssText = "display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; align-content: start;";
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
    // No border-top: the grid above already ends the content block, so the rule added a
    // lone horizontal line floating between the cards and the buttons.
    actions.style.cssText = "display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; padding-top: 2px;";
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
//  Legacy Manager Cache — status line + manual refresh button
// ──────────────────────────────────────────────────────────────────────────────
// This is deliberately NOT a custom setting renderer (`type: () => ...`). Two separate
// freeze bugs came from doing that:
//
//   1. Calling app.ui.settings.setSettingValue() while BUILDING a row re-triggers the
//      settings rebuild, which rebuilds the row again -> the whole "Bada Utils" category
//      vanished from the settings list.
//   2. Subscribing to BadaI18n from inside the builder is fatal. notifyListeners() does
//      `for (const listener of this.listeners)`, and JS for..of visits elements ADDED
//      during iteration. Rebuilding the panel inside its own listener therefore re-queued
//      itself forever and froze Chrome whenever the language was switched.
//
// So: the setting stays a plain boolean switch (native, stable), and this function mounts
// one extra widget into the row's own DOM from applyBilingualSettingsUI(). No settings
// writes at build time, no i18n subscription, and every DOM write is guarded by an
// existence/content check so re-running it is a no-op.
const MANAGER_CACHE_WIDGET_ID = "bada-manager-cache-widget";

function mountManagerCacheWidget(row) {
    if (!row) return;
    const existing = row.querySelector("#" + MANAGER_CACHE_WIDGET_ID);
    if (existing) {
        // Already mounted — only refresh the volatile text, never rebuild.
        paintManagerCacheWidget(existing);
        return;
    }

    // Mount into the ROW, not into .form-input. .form-input is the narrow right-hand
    // column sized for a toggle, so anything placed there is squeezed into ~11rem and
    // wraps into three ragged lines. The row itself spans the full dialog width, which
    // puts this on its own row below the title/description and lines up with them.
    const wrap = document.createElement("div");
    wrap.id = MANAGER_CACHE_WIDGET_ID;
    wrap.style.cssText = "display: flex; align-items: center; justify-content: space-between;"
        + " flex-wrap: wrap; gap: 10px; width: 100%; box-sizing: border-box;"
        + " margin-top: 6px; padding: 8px 10px; border-radius: 6px;"
        + " background: rgba(148, 163, 184, 0.06);";

    // Single text column: timestamp on top, Manager-mode note underneath. flex:1 +
    // min-width:0 lets the long Korean note wrap inside the row instead of forcing
    // the button onto a second line.
    const left = document.createElement("div");
    left.style.cssText = "display: flex; flex-direction: column; gap: 3px; flex: 1 1 260px; min-width: 0;";

    const stampEl = document.createElement("span");
    stampEl.style.cssText = "font-size: 11.5px; color: #cbd5e1; line-height: 1.4;"
        + " font-variant-numeric: tabular-nums; white-space: nowrap;";
    left.appendChild(stampEl);

    const modeEl = document.createElement("span");
    modeEl.style.cssText = "font-size: 10.5px; color: #94a3b8; line-height: 1.45;";
    left.appendChild(modeEl);

    const BTN_IDLE = "background: rgba(59,130,246,0.16); border: 1px solid rgba(59,130,246,0.45); color: #93c5fd;";
    const BTN_BASE = " padding: 5px 13px; border-radius: 6px; font-size: 11px; font-weight: 700;"
        + " cursor: pointer; white-space: nowrap; flex: 0 0 auto; transition: background 0.15s;";

    const refreshBtn = document.createElement("button");
    refreshBtn.type = "button";
    refreshBtn.style.cssText = BTN_IDLE + BTN_BASE;
    refreshBtn.onmouseenter = () => { if (!refreshBtn.disabled) refreshBtn.style.background = "rgba(59,130,246,0.28)"; };
    refreshBtn.onmouseleave = () => { if (!refreshBtn.disabled) refreshBtn.style.background = "rgba(59,130,246,0.16)"; };

    const idleText = () => (BadaI18n.lang === "ko" ? "🔄 지금 갱신" : "🔄 Refresh now");
    refreshBtn.textContent = idleText();

    wrap.append(left, refreshBtn);

    // .form-input sits above us in the row's flex order; insert right after it so the
    // status strip reads directly beneath the toggle column it belongs to.
    const formInput = row.querySelector(".form-input");
    if (formInput && formInput.parentNode === row) {
        row.insertBefore(wrap, formInput.nextSibling);
    } else {
        row.appendChild(wrap);
    }
    // Let the status strip span the full row width even though the row is a flex line.
    wrap.style.flexBasis = "100%";
    paintManagerCacheWidget(wrap);

    // The only user-triggered write path. Nothing below runs during a settings rebuild.
    // force = skip today's guard; requireLegacy = false so the button also works on the
    // modern UI, where only extension-node-map.json is reachable (getlist is legacy-only).
    refreshBtn.onclick = async () => {
        if (refreshBtn.disabled) return;
        refreshBtn.disabled = true;
        refreshBtn.textContent = BadaI18n.lang === "ko" ? "⏳ 갱신 중…" : "⏳ Refreshing…";
        refreshBtn.style.background = "rgba(100,116,139,0.25)";
        refreshBtn.style.color = "#cbd5e1";
        refreshBtn.style.borderColor = "rgba(148,163,184,0.45)";
        let ok = false;
        try {
            const res = await refreshLegacyManagerCache({ force: true, requireLegacy: false });
            ok = !!res?.ok;
        } catch (err) {
            console.warn("[Bada ManagerCache] manual refresh failed:", err);
            ok = false;
        }
        paintManagerCacheWidget(wrap);
        refreshBtn.textContent = ok
            ? (BadaI18n.lang === "ko" ? "✓ 완료" : "✓ Done")
            : (BadaI18n.lang === "ko" ? "⚠ 실패" : "⚠ Failed");
        refreshBtn.style.background = ok ? "rgba(16,185,129,0.22)" : "rgba(239,68,68,0.18)";
        refreshBtn.style.color = ok ? "#6ee7b7" : "#fca5a5";
        refreshBtn.style.borderColor = ok ? "rgba(16,185,129,0.55)" : "rgba(239,68,68,0.5)";
        setTimeout(() => {
            refreshBtn.disabled = false;
            refreshBtn.textContent = idleText();
            refreshBtn.style.cssText = BTN_IDLE + BTN_BASE;
        }, 2000);
    };
}

/** Update only the volatile text inside an already-mounted widget. */
function paintManagerCacheWidget(wrap) {
    const spans = wrap.querySelectorAll("span");
    const stampEl = spans[0];
    const modeEl = spans[1];
    const isKo = BadaI18n.lang === "ko";

    const last = getLastRefreshDate?.();
    let stampText;
    if (!last) {
        stampText = isKo ? "마지막 갱신: 기록 없음" : "Last refreshed: never";
    } else {
        const pad = (n) => String(n).padStart(2, "0");
        const when = `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())} `
            + `${pad(last.getHours())}:${pad(last.getMinutes())}:${pad(last.getSeconds())}`;
        stampText = (isKo ? "마지막 갱신: " : "Last refreshed: ") + when;
    }
    if (stampEl && stampEl.textContent !== stampText) stampEl.textContent = stampText;

    if (modeEl) {
        // Only the legacy Manager needs the boot-time refresh; say which mode is running
        // so the switch never looks broken on the modern UI. Kept to one short line —
        // the full explanation already lives in the row description above.
        getManagerUiMode?.().then((legacy) => {
            const text = legacy
                ? (isKo ? "구형 메니저 · 스위치는 시작 시 자동 갱신" : "Legacy Manager · switch runs the startup refresh")
                : (isKo ? "신형 메니저 · 자동 갱신 없이 버튼으로만 실행" : "Modern Manager · button-only, no automatic refresh");
            if (modeEl.textContent !== text) modeEl.textContent = text;
        }).catch(() => {});
    }
}

// ──────────────────────────────────────────────────────────────────────────────
//  Build Rich Full-Width Note Helper & Translator Panel
// ──────────────────────────────────────────────────────────────────────────────
function buildNoteHelperPanel() {
    const isKo = BadaI18n.lang === "ko";

    let isEnabled = true;
    try {
        if (app.ui && app.ui.settings && app.ui.settings.getSettingValue) {
            const v = app.ui.settings.getSettingValue("BadaUtils.NoteHelper");
            if (v !== undefined) isEnabled = !!v;
        }
    } catch (_) { console.debug("[Bada] ignored:", _); }

    let blacklistStr = "";
    try {
        if (app.ui && app.ui.settings && app.ui.settings.getSettingValue) {
            const str = app.ui.settings.getSettingValue("BadaUtils.TranslationBlacklist");
            if (typeof str === "string") {
                blacklistStr = str;
            }
        }
    } catch (_) { console.debug("[Bada] ignored:", _); }

    let whitelistStr = "";
    try {
        if (app.ui && app.ui.settings && app.ui.settings.getSettingValue) {
            const str = app.ui.settings.getSettingValue("BadaUtils.TranslationWhitelist");
            if (typeof str === "string") {
                whitelistStr = str;
            }
        }
    } catch (_) { console.debug("[Bada] ignored:", _); }

    // Normalize a comma-separated list for duplicate / conflict detection:
    // trim + lowercase + collapse inner whitespace, keep first raw form for display.
    const parseNameList = (raw) => {
        const items = String(raw || "").split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .map((rawItem) => ({
                raw: rawItem,
                key: rawItem.toLowerCase().replace(/\s+/g, " "),
            }));
        const counts = new Map();
        items.forEach(({ key }) => counts.set(key, (counts.get(key) || 0) + 1));
        return { items, counts };
    };

    const panel = document.createElement("div");
    panel.id = "bada-note-helper-panel";
    panel.style.cssText = "width: 100%; display: flex; flex-direction: column; gap: 6px; box-sizing: border-box; padding: 4px 0;";

    // Header (Title + Toggle Switch)
    // justify-content: flex-start (not space-between): the toggle belongs to this panel,
    // not to the far edge of the settings dialog. Spacing them apart pushed the switch
    // ~1200px away from its own title and cost a whole visual line.
    const headerRow = document.createElement("div");
    headerRow.style.cssText = "display: flex; align-items: center; justify-content: flex-start; width: 100%; gap: 10px;";

    const titleEl = document.createElement("div");
    titleEl.style.cssText = "font-size: 13px; font-weight: 600; color: #f8fafc; display: flex; align-items: center; gap: 6px;";
    titleEl.innerHTML = isKo ? "📝 텍스트 & 프롬프트 원클릭 번역기" : "📝 Text & Prompt One-Click Translator";

    // Custom Toggle Switch (iOS / ComfyUI Pill Style)
    const toggleLabel = document.createElement("label");
    toggleLabel.style.cssText = "position: relative; display: inline-block; width: 40px; height: 22px; cursor: pointer; flex-shrink: 0; user-select: none;";

    const toggleInput = document.createElement("input");
    toggleInput.type = "checkbox";
    toggleInput.checked = isEnabled;
    toggleInput.style.cssText = "opacity: 0; width: 0; height: 0; position: absolute;";

    const toggleSlider = document.createElement("span");
    const updateSlider = () => {
        const checked = toggleInput.checked;
        toggleSlider.style.cssText = `
            position: absolute; top: 0; left: 0; right: 0; bottom: 0;
            background-color: ${checked ? "#0284c7" : "#475569"};
            transition: background-color 0.2s; border-radius: 22px;
            box-shadow: ${checked ? "0 0 8px rgba(2, 132, 199, 0.4)" : "none"};
        `;
        toggleSlider.innerHTML = `
            <span style="
                position: absolute; content: ''; height: 16px; width: 16px;
                left: ${checked ? "21px" : "3px"}; bottom: 3px;
                background-color: #ffffff; transition: left 0.2s; border-radius: 50%;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            "></span>
        `;
    };
    updateSlider();

    toggleInput.addEventListener("change", () => {
        const val = toggleInput.checked;
        updateSlider();
        try {
            if (app.ui?.settings?.setSettingValue) {
                app.ui.settings.setSettingValue("BadaUtils.NoteHelper", val);
            }
        } catch (_) { console.debug("[Bada] ignored:", _); }
        if (window.__BADA_SYNC_NOTE_HELPER_STATE__) {
            window.__BADA_SYNC_NOTE_HELPER_STATE__(val);
        }
        app.graph?.setDirtyCanvas?.(true, true);
    });

    toggleLabel.appendChild(toggleInput);
    toggleLabel.appendChild(toggleSlider);
    headerRow.appendChild(titleEl);
    headerRow.appendChild(toggleLabel);

    // Shared input style helper
    const transInputStyle = [
        "flex: 1; min-width: 0; height: 34px;",
        "background: rgba(15, 23, 42, 0.85); color: #f8fafc;",
        "border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 6px;",
        "padding: 0 12px; font-size: 13px; font-family: monospace, inherit;",
        "outline: none; transition: border-color 0.15s, box-shadow 0.15s;"
    ].join("");

    const mkInput = (val, ph) => {
        const el = document.createElement("input");
        el.type = "text";
        el.value = val;
        el.placeholder = ph;
        el.className = "bada-trans-input";
        el.style.cssText = transInputStyle;
        return el;
    };

    const blInputEl = mkInput(blacklistStr, isKo ? "제외할 노드명 (쉼표로 구분)" : "Node names to exclude (comma-separated)");
    const wlInputEl = mkInput(whitelistStr, isKo ? "추가할 노드명 (쉼표로 구분)" : "Node names to force-add (comma-separated)");
    blInputEl.id = "bada-translation-blacklist-input";
    blInputEl.setAttribute("aria-label", isKo ? "번역 제외 노드 목록" : "Translation exclude list");
    wlInputEl.id = "bada-translation-whitelist-input";
    wlInputEl.setAttribute("aria-label", isKo ? "번역 강제 추가 노드 목록" : "Translation force-add list");

    const mkListLabel = (text, inputId, color, background) => {
        const label = document.createElement("label");
        label.htmlFor = inputId;
        label.textContent = text;
        label.style.cssText = [
            "display: flex; align-items: center; justify-content: center;",
            // Narrower than the old 96px so BOTH label+input+apply groups fit on one line.
            // The input carries flex:1 + min-width:0, so it absorbs whatever is left over.
            "flex: 0 0 84px; min-height: 34px; box-sizing: border-box;",
            "border: 1px solid currentColor; border-radius: 6px;",
            "font-size: 12px; font-weight: 700; white-space: nowrap;",
            `color: ${color}; background: ${background};`
        ].join("");
        return label;
    };

    const blLabel = mkListLabel(
        isKo ? "제외 목록" : "Exclude",
        blInputEl.id,
        "#fca5a5",
        "rgba(127, 29, 29, 0.22)"
    );
    const wlLabel = mkListLabel(
        isKo ? "강제 추가" : "Force add",
        wlInputEl.id,
        "#6ee7b7",
        "rgba(6, 78, 59, 0.22)"
    );

    const descEl = document.createElement("div");
    descEl.style.cssText = "font-size: 11px; color: #94a3b8; line-height: 1.4; font-weight: 400;";
    descEl.textContent = isKo
        ? "번역 버튼을 자동으로 추가합니다. 제외 / 강제 추가할 노드명을 쉼표(,)로 구분해 입력하세요."
        : "Auto-adds translation buttons. Enter excluded / forced-add node names, separated by commas.";

    const mkApplyBtn = () => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = isKo ? "적용" : "Apply";
        btn.style.cssText = [
            "height: 34px; padding: 0 18px; min-width: 64px;",
            "background: rgba(15, 23, 42, 0.9); color: #38bdf8;",
            "border: 1px solid #38bdf8; border-radius: 6px;",
            "font-size: 13px; font-weight: 700; cursor: pointer;",
            "transition: all 0.15s ease; white-space: nowrap; flex-shrink: 0;"
        ].join("");
        btn.addEventListener("mouseenter", () => {
            btn.style.background = "#0284c7";
            btn.style.color = "#ffffff";
            btn.style.boxShadow = "0 0 10px rgba(2, 132, 199, 0.4)";
        });
        btn.addEventListener("mouseleave", () => {
            btn.style.background = "rgba(15, 23, 42, 0.9)";
            btn.style.color = "#38bdf8";
            btn.style.boxShadow = "none";
        });
        return btn;
    };
    const applyBtn = mkApplyBtn();

    const flashApplyBtn = (btn) => {
        btn.textContent = isKo ? "✓ 적용됨" : "✓ Applied";
        btn.style.borderColor = "#10b981";
        btn.style.color = "#10b981";
        setTimeout(() => {
            btn.textContent = isKo ? "적용" : "Apply";
            btn.style.borderColor = "#38bdf8";
            btn.style.color = "#38bdf8";
        }, 1500);
    };

    const applyBtn2 = mkApplyBtn();

    const transHintEl = document.createElement("div");
    transHintEl.className = "bada-trans-hint";
    transHintEl.style.cssText = "font-size: 11px; line-height: 1.4; margin-top: 3px; color: #94a3b8;";

    const setInputMark = (input, state) => {
        input.classList.remove("dup", "conflict");
        if (state === "dup") {
            input.classList.add("dup");
            input.style.borderColor = "#ef4444";
            input.style.boxShadow = "0 0 0 1px rgba(239,68,68,0.55)";
        } else if (state === "conflict") {
            input.classList.add("conflict");
            input.style.borderColor = "#f59e0b";
            input.style.boxShadow = "0 0 0 1px rgba(245,158,11,0.55)";
        } else {
            input.style.borderColor = "rgba(255, 255, 255, 0.25)";
            input.style.boxShadow = "none";
        }
    };

    const refreshTransHint = () => {
        const bl = parseNameList(blInputEl.value);
        const wl = parseNameList(wlInputEl.value);
        const wlKeySet = new Set(wl.items.map((i) => i.key));
        const msgs = [];
        let level = "ok";
        const collectDup = (parsed, tagKo, tagEn) => {
            const out = [];
            for (const [key, n] of parsed.counts) {
                if (n > 1) {
                    const raws = [...new Set(parsed.items.filter((i) => i.key === key).map((i) => i.raw))];
                    out.push(key);
                    const v = raws.length > 1 ? (isKo ? ` (표기 변형: ${raws.join(" / ")})` : ` (variants: ${raws.join(" / ")})`) : "";
                    msgs.push(isKo ? `⚠️ [${tagKo}] "${raws[0]}" ${n}회 중복${v}` : `⚠️ [${tagEn}] "${raws[0]}" duplicated ${n}x${v}`);
                    level = "error";
                }
            }
            return out;
        };
        const dupBlKeys = collectDup(bl, "제외", "Exclude");
        const dupWlKeys = collectDup(wl, "추가", "Add");
        const conflicts = bl.items.map((i) => i.key).filter((k) => wlKeySet.has(k));
        const uniqConf = [...new Set(conflicts)];
        uniqConf.forEach((k) => {
            const raw = bl.items.find((i) => i.key === k)?.raw || k;
            msgs.push(isKo ? `⛔ "${raw}"가 제외와 추가에 모두 있습니다 — 제외가 우선 적용됩니다` : `⛔ "${raw}" is in both Exclude and Add — Exclude wins`);
            if (level !== "error") level = "warn";
        });
        if (!msgs.length) {
            const a = bl.items.length, b = wl.items.length;
            transHintEl.textContent = (a || b) ? (isKo ? `✓ 제외 ${a}개 · 추가 ${b}개 — 중복 없음` : `✓ ${a} excluded · ${b} forced — no duplicates`) : "";
            transHintEl.className = "bada-trans-hint ok";
        } else {
            transHintEl.innerHTML = msgs.map((m) => `<div>${m}</div>`).join("");
            transHintEl.className = `bada-trans-hint ${level}`;
        }
        setInputMark(blInputEl, dupBlKeys.length ? "dup" : (uniqConf.length ? "conflict" : "ok"));
        setInputMark(wlInputEl, dupWlKeys.length ? "dup" : (uniqConf.length ? "conflict" : "ok"));
    };

    const persistTransLists = () => {
        try {
            if (app.ui?.settings?.setSettingValue) {
                app.ui.settings.setSettingValue("BadaUtils.TranslationBlacklist", blInputEl.value.trim());
                app.ui.settings.setSettingValue("BadaUtils.TranslationWhitelist", wlInputEl.value.trim());
            }
        } catch (_) { console.debug("[Bada] ignored:", _); }
        if (window.__BADA_REAPPLY_NOTE_HELPER_NODES__) {
            window.__BADA_REAPPLY_NOTE_HELPER_NODES__();
        }
        app.graph?.setDirtyCanvas?.(true, true);
    };

    const handleApply = () => {
        persistTransLists();
        flashApplyBtn(applyBtn);
    };

    const handleApply2 = () => {
        persistTransLists();
        flashApplyBtn(applyBtn2);
    };

    applyBtn.addEventListener("click", handleApply);
    applyBtn2.addEventListener("click", handleApply2);
    blInputEl.addEventListener("input", refreshTransHint);
    wlInputEl.addEventListener("input", refreshTransHint);
    blInputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleApply();
        }
    });
    wlInputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleApply2();
        }
    });

    // Both lists share ONE row. They were stacked as two full-width rows, which made this
    // panel three visual lines (header + exclude + force-add). flex-wrap keeps them usable
    // on a narrow dialog instead of forcing a second line via a fixed min-width.
    const blRow = document.createElement("div");
    blRow.className = "bada-trans-row";
    blRow.style.cssText = "display: flex; align-items: center; gap: 8px; width: 100%; margin-top: 2px; flex-wrap: wrap;";

    const blGroup = document.createElement("div");
    blGroup.style.cssText = "display: flex; align-items: center; gap: 8px; flex: 1 1 320px; min-width: 0;";
    blGroup.appendChild(blLabel);
    blGroup.appendChild(blInputEl);
    blGroup.appendChild(applyBtn);

    const wlGroup = document.createElement("div");
    wlGroup.style.cssText = "display: flex; align-items: center; gap: 8px; flex: 1 1 320px; min-width: 0;";
    wlGroup.appendChild(wlLabel);
    wlGroup.appendChild(wlInputEl);
    wlGroup.appendChild(applyBtn2);

    blRow.appendChild(blGroup);
    blRow.appendChild(wlGroup);

    panel.appendChild(headerRow);
    panel.appendChild(descEl);
    panel.appendChild(blRow);
    panel.appendChild(transHintEl);

    refreshTransHint();

    return panel;
}

// ──────────────────────────────────────────────────────────────────────────────
//  Dynamic Settings Dialog Live Updater (Freeze-Safe & Re-entrant Guarded)
// ──────────────────────────────────────────────────────────────────────────────
let isApplyingBilingualUI = false;
function applyBilingualSettingsUI(targetLang) {
    if (isApplyingBilingualUI) return;
    isApplyingBilingualUI = true;
    // Mirror the flag onto window so the settings-dialog MutationObserver can ignore the
    // DOM writes we make below. Without this, our own mutations re-trigger the observer,
    // which calls this function again in a loop and freezes the settings tab.
    window.__BADA_APPLYING_UI__ = true;
    try {
        const lang = targetLang || BadaI18n.lang || "en";
        const isKo = lang === "ko";
        const texts = BADA_SETTINGS_TEXTS[isKo ? "ko" : "en"];
        updatePresetBadgePositionOptions(lang);

        // 2. Setting rows label updates (Title with custom SVG + Sub-description below)
        const settingRows = document.querySelectorAll('[data-setting-id^="BadaUtils"], [data-setting-id^="⚓ Bada"]');
        settingRows.forEach(row => {
            const id = row.getAttribute("data-setting-id");
            // The Manager cache row is a plain boolean switch again, so it needs its bilingual
            // title/description like every other Bada row. mountManagerCacheWidget() is
            // invoked right after that, and it is idempotent, so this stays loop-safe.
            if (id === BADA_UNIFIED_SETTINGS.presetsPanel.id) return;
            // Idempotence guard: the settings-dialog MutationObserver treats any added
            // node inside a BadaUtils row as a trigger to call this function again. If we
            // ever re-append the description node unconditionally, that re-entry becomes an
            // endless append -> observe -> append loop and the tab freezes. Both writes
            // below are therefore content-guarded (desc is only created when absent, and
            // only rewritten when the text actually changes), so a second pass is a no-op.
            if (row.__badaDescApplied === `${targetLang || lang}|${isKo}`) return;
            row.__badaDescApplied = `${targetLang || lang}|${isKo}`;

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
            } else if (id === BADA_UNIFIED_SETTINGS.saveAsFolderPicker.id) {
                targetTitle = texts.saveAsName;
                targetDesc = texts.saveAsDesc;
            } else if (id === BADA_UNIFIED_SETTINGS.mouse.id) {
                targetTitle = texts.mouseName;
                targetDesc = texts.mouseDesc;
            } else if (id === BADA_UNIFIED_SETTINGS.compactSidebar.id) {
                targetTitle = texts.compactSidebarName;
                targetDesc = texts.compactSidebarDesc;
            } else if (id === BADA_UNIFIED_SETTINGS.blankStartup.id) {
                targetTitle = texts.blankName;
                targetDesc = texts.blankDesc;
            } else if (id === BADA_UNIFIED_SETTINGS.presetsBadge.id) {
                targetTitle = texts.presetsBadgeName;
                targetDesc = texts.presetsBadgeDesc;
            } else if (id === BADA_UNIFIED_SETTINGS.presetsBadgePosition.id) {
                targetTitle = texts.presetsBadgePosName;
                targetDesc = texts.presetsBadgePosDesc;
            } else if (id === BADA_UNIFIED_SETTINGS.loadImageFix.id) {
                targetTitle = texts.loadImageName;
                targetDesc = texts.loadImageDesc;
            } else if (id === BADA_UNIFIED_SETTINGS.noteHelper.id) {
                targetTitle = texts.noteHelperName;
                targetDesc = texts.noteHelperDesc;
            } else if (id === BADA_UNIFIED_SETTINGS.translationBlacklist.id) {
                targetTitle = texts.translationBlacklistName;
                targetDesc = texts.translationBlacklistDesc;
            } else if (id === BADA_UNIFIED_SETTINGS.translationWhitelist.id) {
                targetTitle = texts.translationWhitelistName;
                targetDesc = texts.translationWhitelistDesc;
            } else if (BADA_UNIFIED_SETTINGS.terminalHub && id === BADA_UNIFIED_SETTINGS.terminalHub.id) {
                targetTitle = texts.terminalHubTitle;
                targetDesc = texts.terminalHubDesc;
            } else if (id === BADA_UNIFIED_SETTINGS.legacyManagerCache.id) {
                targetTitle = texts.legacyManagerCacheName;
                targetDesc = texts.legacyManagerCacheDesc;
            } else if (id === BADA_UNIFIED_SETTINGS.missingDetective.id) {
                targetTitle = texts.detectiveName;
                targetDesc = texts.detectiveDesc;
            }

            if (!targetTitle) return;

            const registeredSetting = app.ui?.settings?.settingsLookup?.[id];
            if (registeredSetting) registeredSetting.name = targetTitle;

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
                descEl.style.cssText = "font-size: 11px; color: #cbd5e1; line-height: 1.4; font-weight: 400; margin-top: 1px;";
                formLabel.appendChild(descEl);
            }
            if (descEl && targetDesc && descEl.__badaDesc !== targetDesc) {
                descEl.__badaDesc = targetDesc;
                descEl.innerHTML = targetDesc;
            }

            // Attach the last-refresh timestamp + "Refresh now" button under the switch.
            // Placed AFTER the description writes so it must not be skipped by the
            // idempotence guard above, and it is itself idempotent (mountManagerCacheWidget
            // returns immediately when #bada-manager-cache-widget is already present), so
            // the dialog's MutationObserver cannot drive it into an append loop.
            if (id === BADA_UNIFIED_SETTINGS.legacyManagerCache.id) {
                try {
                    mountManagerCacheWidget(row);
                } catch (_) { console.debug("[Bada ManagerCache] widget mount skipped:", _); }
            }
        });

        // 3. Clean left sidebar nav item: Distinctive Anchor ⚓ icon (replaces generic plug 🔌)
        const navLink = document.querySelector('[data-nav-id="root/Bada Utils"]');
        if (navLink) {
            let anchor = navLink.querySelector(".bada-nav-anchor");
            if (!anchor) {
                // Hide generic plug icon if present
                const plugIcon = navLink.querySelector("i, svg, [class*='icon']");
                if (plugIcon) {
                    plugIcon.style.display = "none";
                }
                anchor = document.createElement("span");
                anchor.className = "bada-nav-anchor";
                anchor.textContent = "⚓";
                anchor.style.cssText = "font-size: 15px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; margin-right: 6px;";
                navLink.insertBefore(anchor, navLink.firstChild);
            }
            const labelSpan = navLink.querySelector("span:not(.bada-nav-anchor)");
            if (labelSpan && labelSpan.textContent.startsWith("⚓")) {
                labelSpan.textContent = "Bada Utils";
            }
        }
    } catch (e) {
        console.warn("[ComfyUI-Bada-Utils] Safe bilingual UI updater handled exception:", e);
    } finally {
        isApplyingBilingualUI = false;
        window.__BADA_APPLYING_UI__ = false;
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
        updatePresetBadgePositionOptions(currentLang);

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
            // Rebuild the note-helper panel so its bilingual header / placeholders /
            // duplicate hints follow the new language (it is a custom renderer).
            try {
                const noteRow = document.querySelector('[data-setting-id="BadaUtils.NoteHelper"]');
                if (noteRow) {
                    const host = noteRow.querySelector(".form-input, div");
                    const oldPanel = document.getElementById("bada-note-helper-panel");
                    if (host && oldPanel) {
                        const fresh = buildNoteHelperPanel();
                        oldPanel.replaceWith(fresh);
                    }
                }
            } catch (_) { console.debug("[Bada] ignored:", _); }
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

        // ②-1 Save As Folder Picker (ComfyUI File ▸ Save As ▸ 폴더 지정 저장)
        safeAddSetting({
            id: BADA_UNIFIED_SETTINGS.saveAsFolderPicker.id,
            category: [texts.category, "SaveAsFolderPicker"],
            name: texts.saveAsName,
            type: BADA_UNIFIED_SETTINGS.saveAsFolderPicker.type,
            sortOrder: BADA_UNIFIED_SETTINGS.saveAsFolderPicker.sortOrder,
            defaultValue: BADA_UNIFIED_SETTINGS.saveAsFolderPicker.defaultValue,
            onChange: () => {
                // 훅은 promptSave() 호출 시점에 설정값을 다시 읽으므로 재시도만 걸어 주면 된다.
                window.__BADA_WORKFLOW_ORGANIZER_INSTANCE__?.setupSaveAsFolderPicker?.();
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

        // ③-1 Compact Sidebar Mode (Icon-Only, Scrollbar-Free)
        function applyCompactSidebarState(enabled) {
            if (enabled) {
                document.body.classList.add("bada-compact-sidebar");
                try {
                    if (window.app?.ui?.settings?.setSettingValue) {
                        window.app.ui.settings.setSettingValue("Comfy.Sidebar.Size", "small");
                    }
                } catch (_) { console.debug("[Bada] ignored:", _); }
            } else {
                document.body.classList.remove("bada-compact-sidebar");
                try {
                    if (window.app?.ui?.settings?.setSettingValue) {
                        window.app.ui.settings.setSettingValue("Comfy.Sidebar.Size", "normal");
                    }
                } catch (_) { console.debug("[Bada] ignored:", _); }
            }
        }

        const initialCompact = (() => {
            try {
                if (window.app?.ui?.settings) {
                    const v = window.app.ui.settings.getSettingValue("BadaUtils.CompactSidebar", true);
                    if (typeof v === "boolean") return v;
                }
            } catch (_) { console.debug("[Bada] ignored:", _); }
            try {
                const local = localStorage.getItem("Comfy.Settings.BadaUtils.CompactSidebar");
                if (local !== null) return JSON.parse(local);
            } catch (_) { console.debug("[Bada] ignored:", _); }
            return true;
        })();
        applyCompactSidebarState(initialCompact);

        safeAddSetting({
            id: BADA_UNIFIED_SETTINGS.compactSidebar.id,
            category: [texts.category, "CompactSidebar"],
            name: texts.compactSidebarName,
            type: BADA_UNIFIED_SETTINGS.compactSidebar.type,
            sortOrder: BADA_UNIFIED_SETTINGS.compactSidebar.sortOrder,
            defaultValue: BADA_UNIFIED_SETTINGS.compactSidebar.defaultValue,
            onChange: (newVal) => {
                const target = (typeof newVal === "object" && newVal !== null && "value" in newVal) ? !!newVal.value : !!newVal;
                applyCompactSidebarState(target);
            }
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

        // ⑤-1-b Node Preset Badge Position
        safeAddSetting({
            id: BADA_UNIFIED_SETTINGS.presetsBadgePosition.id,
            category: [texts.category, "PresetBadgePosition"],
            name: texts.presetsBadgePosName,
            type: BADA_UNIFIED_SETTINGS.presetsBadgePosition.type,
            options: BADA_UNIFIED_SETTINGS.presetsBadgePosition.options,
            sortOrder: BADA_UNIFIED_SETTINGS.presetsBadgePosition.sortOrder,
            defaultValue: BADA_UNIFIED_SETTINGS.presetsBadgePosition.defaultValue,
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
                const isEnabled = (typeof newVal === "object" && newVal !== null && "value" in newVal)
                    ? !!newVal.value
                    : (newVal === true || newVal === "true");
                window._badaLoadImageFixEnabled = isEnabled;
                if (isEnabled && window.BadaLoadImageFixer?.healAllImageNodes) {
                    window.BadaLoadImageFixer.healAllImageNodes();
                }
            }
        });

        // ⑦ Markdown Note Helper & Translator Panel (Single Consolidated UI)
        safeAddSetting({
            id: BADA_UNIFIED_SETTINGS.noteHelper.id,
            category: [texts.category, "NoteHelper"],
            name: texts.noteHelperName,
            sortOrder: BADA_UNIFIED_SETTINGS.noteHelper.sortOrder,
            type: () => {
                return buildNoteHelperPanel();
            },
            defaultValue: BADA_UNIFIED_SETTINGS.noteHelper.defaultValue
        });

        // ⑦-b Translation Blacklist Setting (Registered for persistence)
        safeAddSetting({
            id: BADA_UNIFIED_SETTINGS.translationBlacklist.id,
            category: [texts.category, "TranslationBlacklist"],
            name: texts.translationBlacklistName,
            type: BADA_UNIFIED_SETTINGS.translationBlacklist.type,
            sortOrder: BADA_UNIFIED_SETTINGS.translationBlacklist.sortOrder,
            defaultValue: BADA_UNIFIED_SETTINGS.translationBlacklist.defaultValue
        });

        // ⑦-c Translation Whitelist (Forced-add) Setting (Registered for persistence)
        safeAddSetting({
            id: BADA_UNIFIED_SETTINGS.translationWhitelist.id,
            category: [texts.category, "TranslationWhitelist"],
            name: texts.translationWhitelistName,
            type: BADA_UNIFIED_SETTINGS.translationWhitelist.type,
            sortOrder: BADA_UNIFIED_SETTINGS.translationWhitelist.sortOrder,
            defaultValue: BADA_UNIFIED_SETTINGS.translationWhitelist.defaultValue
        });

        // ⑦-d Legacy Manager Node-Name Cache Refresh
        // A plain boolean switch on purpose. It used to be a custom renderer
        // (`type: () => buildManagerCachePanel()`), which caused two separate freezes:
        // building the row wrote a setting value (re-triggering the row rebuild), and the
        // builder subscribed to BadaI18n — notifyListeners() iterates a Set with for..of,
        // which visits listeners ADDED mid-iteration, so the rebuilt panel re-queued itself
        // forever and hung the browser on every language switch. The switch alone is safe;
        // the timestamp + "Refresh now" button are mounted separately by
        // mountManagerCacheWidget(), which never writes settings and never subscribes.
        safeAddSetting({
            id: BADA_UNIFIED_SETTINGS.legacyManagerCache.id,
            category: [texts.category, "ManagerCache"],
            name: texts.legacyManagerCacheName,
            type: BADA_UNIFIED_SETTINGS.legacyManagerCache.type,
            defaultValue: BADA_UNIFIED_SETTINGS.legacyManagerCache.defaultValue
        });



        // ⑧ Missing Node Detective (Real Name & GitHub Finder)
        safeAddSetting({
            id: BADA_UNIFIED_SETTINGS.missingDetective.id,
            category: [texts.category, "MissingDetective"],
            name: texts.detectiveName,
            type: BADA_UNIFIED_SETTINGS.missingDetective.type,
            sortOrder: BADA_UNIFIED_SETTINGS.missingDetective.sortOrder,
            defaultValue: BADA_UNIFIED_SETTINGS.missingDetective.defaultValue
        });

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
                        try { if (ctor.title) ctor.title = ctor.title.replace(/🌊|🌟/g, "⚓"); } catch (_) { console.debug("[Bada] ignored:", _); }
                        try { if (ctor.prototype?.title) ctor.prototype.title = ctor.prototype.title.replace(/🌊|🌟/g, "⚓"); } catch (_) { console.debug("[Bada] ignored:", _); }
                        try { if (ctor.category) ctor.category = ctor.category.replace(/🌊|🌟/g, "⚓"); } catch (_) { console.debug("[Bada] ignored:", _); }
                        if (ctor.nodeData) {
                            try { if (ctor.nodeData.category) ctor.nodeData.category = ctor.nodeData.category.replace(/🌊|🌟/g, "⚓"); } catch (_) { console.debug("[Bada] ignored:", _); }
                            try { if (ctor.nodeData.display_name) ctor.nodeData.display_name = ctor.nodeData.display_name.replace(/🌊|🌟/g, "⚓"); } catch (_) { console.debug("[Bada] ignored:", _); }
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
                    // Detect Bada setting rows or settings sidebar nav items.
                    // Ignore mutations we caused ourselves: applyBilingualSettingsUI() writes
                    // into these rows, so without this check the observer re-triggers itself
                    // forever and the settings tab locks the renderer up.
                    if (window.__BADA_APPLYING_UI__) return;
                    let hasBadaChange = false;
                    for (const m of mutations) {
                        for (const node of m.addedNodes) {
                            if (node.nodeType === 1 && (
                                node.matches?.('[data-setting-id^="BadaUtils"], [data-nav-id*="Bada"]') ||
                                node.querySelector?.('[data-setting-id^="BadaUtils"], [data-nav-id*="Bada"]')
                            )) {
                                hasBadaChange = true;
                                break;
                            }
                        }
                        if (!hasBadaChange) {
                            // The native UI can re-render the left sidebar and drop our anchor
                            // icon. Watching for it being removed is what makes the repair
                            // event-driven instead of needing a polling loop.
                            for (const node of m.removedNodes) {
                                if (node.nodeType === 1 && (
                                    node.matches?.(".bada-nav-anchor") ||
                                    node.querySelector?.(".bada-nav-anchor")
                                )) {
                                    hasBadaChange = true;
                                    break;
                                }
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

            // Event-driven dialog detection.
            //
            // This used to be `setInterval(() => document.querySelector('[role="dialog"]'),
            // 300)` — a DOM query 3.3x/second that ran for the entire page lifetime and was
            // never cleared (the only such interval in the codebase). It is replaced by a
            // MutationObserver that does nothing while the page is idle and fires only when a
            // dialog is actually inserted. The self-healing half of the old poll (restore the
            // left-sidebar anchor icon if the native UI drops it) now lives in the per-dialog
            // observer above, which watches removedNodes — so nothing polls at all.
            const attachIfDialogPresent = () => {
                const dialog = document.querySelector('[role="dialog"]');
                if (dialog && !dialog.__badaObserverAttached) {
                    observeSettingsDialog();
                    applyBilingualSettingsUI();
                }
            };

            const dialogWatcher = new MutationObserver(attachIfDialogPresent);
            dialogWatcher.observe(document.body, { childList: true, subtree: true });
            attachIfDialogPresent();   // cover a dialog that was already open at install time

            // Ghost tooltip pruner removed: was interfering with native PrimeVue tooltips.
        }

        console.log(
            "%c[ComfyUI-Bada-Utils]%c BADA Bilingual Settings & Full-Width Global Presets Panel Ready ⚓",
            "color: #00f0ff; font-weight: bold;", "color: inherit;"
        );
    }
});
