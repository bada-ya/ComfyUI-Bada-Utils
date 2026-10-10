import { app } from "../../scripts/app.js";
import { escapeHtml } from "./bada_shared.js";
import { BadaI18n } from "./bada_i18n.js";
// PHASE 3: the presets helpers and showToast were only used by buildInlinePresetsPanel(),
// deleted with the legacy category. bada_settings_v2.js imports the presets helpers from
// presets_overview_modal.js directly; presets_modal.js stays registered via its own import.
import "./tooltip_fixer.js";
// Legacy Manager node-name cache warm-up. Must be imported here so it registers
// its own app extension; it self-gates on the active Manager UI.
import { refreshLegacyManagerCache, getLastRefreshDate, getManagerUiMode,
    MODE_LEGACY, MODE_MODERN, MODE_UNSUPPORTED } from "./bada_manager_cache.js";
// Settings v2. Registers the ONLY "Bada Utils" category and owns the canonical
// BadaUtils.* setting IDs. See the module header for the migration plan.
import { registerBadaV2Settings } from "./bada_settings_v2.js";

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
// ──────────────────────────────────────────────────────────────────────────────
//  Bilingual label tables (shared by the single "Bada Utils" category)
// ──────────────────────────────────────────────────────────────────────────────
// PHASE 3 (2026-10-04): the legacy category and its id-remapping helper are deleted. Settings v2
// (bada_settings_v2.js) is the sole owner of the canonical BadaUtils.* ids — 28+ call sites
// read them, so those keys never moved. BADA_SETTINGS_TEXTS and BADA_UNIFIED_SETTINGS below
// stay because applyBilingualSettingsUI() resolves every v2 row's bilingual title and
// description through BADA_UNIFIED_SETTINGS ids: these tables are v2's label source, not
// legacy leftovers.

const BADA_SETTINGS_TEXTS = {
    en: {
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
        cloudSyncName: "☁️ Cloud Sync (Google Drive)",
        cloudSyncDesc: "Back up presets, favorites, Gemini chat history, system prompts and workflows to Google Drive and sync only the changed parts in the background.",

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
        cloudSyncName: "☁️ 클라우드 동기화 (Google Drive)",
        cloudSyncDesc: "프리셋·즐겨찾기·제미나이 채팅 기록·시스템 프롬프트·워크플로우를 Google Drive에 백업하고 변경된 부분만 백그라운드에서 자동 동기화합니다.",

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
    },
    cloudSync: {
        id: "BadaUtils.CloudSync",
        category: ["Bada Utils", "CloudSync"],
        name: "☁️ Cloud Sync (Google Drive)",
        type: "boolean",
        sortOrder: 100,
        defaultValue: null
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

           All values below were measured against the live dialog in a real browser,
           not guessed:
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
        /* Divider handling (2026-10-10, 3-tier). ComfyUI draws ONE divider per shared
           SECTION, so 7 sections mean 6 lines only between sections — exactly like
           Crystools / VHS / KJNodes. No hiding: the line is the section boundary the
           user asked for. Only the vertical rhythm is tuned (kept).

           NOTE: no backticks allowed in this block (JS template literal). */
        .setting-group:has([data-setting-id^="BadaUtils"]) > .my-8 {
            border-top-color: rgba(255, 255, 255, 0.14) !important;
        }
        /* Section headings (2026-10-10, 3-tier). category[1] (Language, Translation,
           Sidebar, Canvas, Presets, Image Fix, Smart Care) is drawn by ComfyUI as the
           bold line above each block, same as other extensions. HIDDEN per user request
           2026-10-10: the divider line alone marks the section boundary. The h3 node and
           the .my-8 divider are SEPARATE nodes, so hiding h3 does not move or duplicate
           any divider. Only the CATEGORY MENU guard stays: text-xs uppercase menu labels
           must never be touched.
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
/* Control font size (2026-10-03). Measured at 16px on every v2 control, which made
           the combo boxes and the list inputs shout louder than their own row titles.
           13px matches the row title size so the row reads as one unit. Scoped to the
           BadaUtils prefix, which after Phase 3 is every Bada row.

           NOTE the descendant selector: the combo rows are NOT native <select> elements in
           this frontend — they are custom components, so selecting .form-input select only
           left the language and badge-position dropdowns at 16px (measured, then fixed). */
        .setting-group:has([data-setting-id^="BadaUtils"]) .form-input,
        .setting-group:has([data-setting-id^="BadaUtils"]) .form-input * {
            font-size: 13px !important;
        }
        /* Translator list rows: give the input the space. Measured before the change:
           label column 822px vs input column 176px, i.e. the two text fields were crammed
           into a sixth of the row while the description text took the rest. Only these two
           rows are changed - every other row's label/input balance is already right. */
        .setting-group:has([data-setting-id="BadaUtils.TranslationBlacklist"]) .form-label,
        .setting-group:has([data-setting-id="BadaUtils.TranslationWhitelist"]) .form-label {
            flex: 0 1 300px !important;
            max-width: 300px !important;
        }
        .setting-group:has([data-setting-id="BadaUtils.TranslationBlacklist"]) .form-input,
        .setting-group:has([data-setting-id="BadaUtils.TranslationWhitelist"]) .form-input {
            flex: 1 1 auto !important;
            max-width: none !important;
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
        }
        .setting-group:has([data-setting-id="BadaUtils.TranslationBlacklist"]) .form-input input,
        .setting-group:has([data-setting-id="BadaUtils.TranslationWhitelist"]) .form-input input {
            flex: 1 1 auto !important;
            width: auto !important;
            min-width: 0 !important;
        }
        /* The Save button sits at the far right of the row; the hint line wraps underneath. */
        .setting-group:has([data-setting-id^="BadaUtils"]) .setting-item:has(.bada-v2-save-btn) {
            flex-wrap: wrap !important;
        }
        .bada-v2-list-hint { flex-basis: 100%; }
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

        /* PHASE 3: the .bada-trans-* and #bada-inline-presets-panel rules are deleted with the
           legacy category. They styled DOM only buildNoteHelperPanel() / buildInlinePresetsPanel()
           produced, and both builders are gone. They were also actively harmful in Phase 1:
           scoped to BadaLegacy.* they suppressed v2's real NoteHelper label and left a bare
           unlabelled switch (measured labelDisplay "none", row height 34). v2's rows are native
           ComfyUI rows, styled by the [data-setting-id^="BadaUtils"] rules above. */
    `;
    document.head.appendChild(style);
})();

// PHASE 3 (2026-10-04): buildInlinePresetsPanel() and buildNoteHelperPanel() were deleted
// along with the legacy category that was their only caller. Both were per-row custom
// renderers — the exact mechanism settings v2 exists to remove. v2 renders its own compact
// presets row and reaches the same backup/restore through presets_overview_modal.js.// ──────────────────────────────────────────────────────────────────────────────
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

/**
 * Idle label for the manual-refresh button. Module-level because it is needed in TWO
 * places: once when the widget is built, and again on every repaint (below).
 */
function managerCacheIdleText() {
    return BadaI18n.lang === "ko" ? "🔄 지금 갱신" : "🔄 Refresh now";
}

/**
 * Label for the manual-refresh button on a Manager that has no legacy backend. Every warm
 * target is a /v2/ route there, so the button can only ever fail — it is disabled and says
 * so, instead of inviting a click that reports a bare "Failed" with no explanation.
 */
function managerCacheUnsupportedBtnText() {
    return BadaI18n.lang === "ko" ? "⛔ 사용 불가" : "⛔ Unavailable";
}

/**
 * Colour/interaction states for the manual-refresh button, split by Manager flavour.
 *
 * Only the paintable properties live here; the layout (padding, sizing, flex) stays in
 * BTN_BASE inside mountManagerCacheWidget() so there is a single source for each concern.
 * `Object.assign` on individual properties is used instead of rewriting cssText, because a
 * cssText rewrite from the repaint path would also need a copy of that layout string.
 */
const MANAGER_CACHE_BTN_STYLE = {
    idle: {
        background: "rgba(59,130,246,0.16)",
        borderColor: "rgba(59,130,246,0.45)",
        color: "#93c5fd",
        cursor: "pointer",
        opacity: "",
    },
    unsupported: {
        background: "rgba(100,116,139,0.12)",
        borderColor: "rgba(100,116,139,0.3)",
        color: "#94a3b8",
        cursor: "not-allowed",
        opacity: "0.7",
    },
};

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

    refreshBtn.textContent = managerCacheIdleText();

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
            refreshBtn.textContent = managerCacheIdleText();
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

    if (!modeEl) return;

    // The probe result is cached inside the module, so this resolves from memory after the
    // first call — a repaint (language switch, settings rebuild) no longer costs a request.
    Promise.resolve(getManagerUiMode?.()).then((mode) => {
        let text;
        let muted = false;

        if (mode === MODE_UNSUPPORTED) {
            // THE case that used to be invisible. This Manager dropped the legacy backend,
            // so /v2/manager/is_legacy_manager_ui — and every warm target — is gone. Say it
            // here instead of letting the row look like a working setting that does nothing.
            text = isKo
                ? "⚠ 이 Manager 버전에는 구형(레거시) 백엔드가 없어 이 기능이 동작하지 않습니다"
                : "⚠ This Manager has no legacy backend, so this feature cannot run here";
            muted = true;
        } else if (mode === MODE_LEGACY) {
            text = isKo ? "구형 메니저 · 스위치는 시작 시 자동 갱신" : "Legacy Manager · switch runs the startup refresh";
        } else if (mode === MODE_MODERN) {
            text = isKo ? "신형 메니저 · 자동 갱신 없이 버튼으로만 실행" : "Modern Manager · button-only, no automatic refresh";
        } else {
            // Transient probe failure — do not claim a mode we have not confirmed.
            text = isKo ? "메니저 유형 확인 중… (다시 시도됨)" : "Detecting Manager flavour… (will retry)";
        }
        if (modeEl.textContent !== text) modeEl.textContent = text;
        if (modeEl.style.color !== (muted ? "#fbbf24" : "")) {
            modeEl.style.color = muted ? "#fbbf24" : "";
        }

        const btn = wrap.querySelector("button");
        if (!btn) return;

        if (mode === MODE_UNSUPPORTED) {
            // Refuse to pretend: a live button here can only ever report "Failed", because
            // every target it calls is a /v2/ route that no longer exists.
            btn.disabled = true;
            Object.assign(btn.style, MANAGER_CACHE_BTN_STYLE.unsupported);
            const t = managerCacheUnsupportedBtnText();
            if (btn.textContent !== t) btn.textContent = t;
            return;
        }

        // LANGUAGE SWITCH (2026-10-03). The button label used to be written once, when the
        // widget was first built, so switching to English left an English timestamp next to a
        // Korean "지금 갱신". Repaint it here too — but ONLY while idle: during a refresh the
        // transient "갱신 중… / ✓ 완료 / ⚠ 실패" states must survive the repaint that follows.
        if (!btn.disabled) {
            const btnText = managerCacheIdleText();
            if (btn.textContent !== btnText) btn.textContent = btnText;
            Object.assign(btn.style, MANAGER_CACHE_BTN_STYLE.idle);
        }
    }).catch(() => { /* the stamp above is already written; never break the repaint */ });
}

// ──────────────────────────────────────────────────────────────────────────────
//  Build Rich Full-Width Note Helper & Translator Panel
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
            // GUARD ORDER (2026-10-10): formLabel lookup FIRST. If the row's label is not
            // rendered yet (dialog just opened, search filter mid-pass), return WITHOUT
            // stamping the guard so the next pass retries instead of skipping forever.
            const formLabel = row.querySelector(".form-label, label");
            if (!formLabel) return;

            if (row.__badaDescApplied === `${targetLang || lang}|${isKo}`) return;
            row.__badaDescApplied = `${targetLang || lang}|${isKo}`;

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
            } else if (id === BADA_UNIFIED_SETTINGS.cloudSync.id) {
                targetTitle = texts.cloudSyncName;
                targetDesc = texts.cloudSyncDesc;
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

        // ── Settings v2 owns the ONLY "Bada Utils" category and carries the canonical
        //    BadaUtils.* keys that 28+ call sites read. PHASE 3: nothing is registered after it.
        registerBadaV2Settings(safeAddSetting, { lang: currentLang });
        // Re-localize the v2 position dropdown. The identical call earlier in setup() ran
        // before the v2 row existed; with the legacy category gone, this call is the only one.
        updatePresetBadgePositionOptions(currentLang);

        // PHASE 3: the legacy "Bada Utils (Legacy)" category is GONE. The duplicate UI Language
        // row it registered was a real bug source, not just clutter: two settings rows both
        // claimed to own the language, each with its own defaultValue and onChange, and the
        // reentrancy guard in BadaI18n.setLanguage() silently dropped whichever call lost the
        // race. That is how the dropdown could read "English" while the rows rendered Korean.
        // bada_settings_v2.js's BadaUtils.Language is now the single source of truth.
        // Auto-refresh the settings DOM when the language switches. notifyListeners() fires on
        // every change, so this is the most direct hook there is for the custom rows —
        // applyBilingualSettingsUI() cannot reach them (they are not native ComfyUI rows),
        // hence the mount alongside it.
        BadaI18n.subscribe((lang) => {
            applyBilingualSettingsUI(lang);
            window.__BADA_MOUNT_LOCALIZED_ROWS__?.();
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

        // PHASE 3: the legacy registrations below this line are gone. Compact Sidebar keeps
        // the initial apply above because bada_settings_v2.js only reacts to onChange, so
        // dropping this would leave the mode unapplied until the user toggled the switch.
        // ⑦ Markdown Note Helper, ⑦-b/⑦-c translator lists, ⑦-d Manager cache and
        // ⑧ Missing Node Detective were all removed here; v2 owns those ids natively.

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
                        // LANGUAGE SWITCH (2026-10-03). This observer callback is the path that
                        // actually fires when the user picks a new language in the dropdown —
                        // it was calling applyBilingualSettingsUI() alone, so the native rows
                        // were relabelled but our CUSTOM rows were not: the Manager cache
                        // "지금 갱신" button and the Global Presets 백업/불러오기/관리자 buttons
                        // kept the old language. The mount is idempotent, so running it here is
                        // safe; it is what finally made a language switch re-label them.
                        window.__BADA_MOUNT_LOCALIZED_ROWS__?.();
                    });
                });

                observer.observe(dialog, { childList: true, subtree: true });
            }

            const triggerUIUpdate = () => {
                observeSettingsDialog();
                applyBilingualSettingsUI();
                // Settings v2 augments its two translator rows with a Save button and a
                // duplicate/conflict hint, and re-labels its custom-rendered presets row after
                // a language switch. Idempotent, so calling it on every UI pass is safe and
                // means the buttons reappear after any dialog re-render.
                window.__BADA_MOUNT_LOCALIZED_ROWS__?.();
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
                    window.__BADA_MOUNT_LOCALIZED_ROWS__?.();
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
