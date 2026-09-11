/**
 * ComfyUI-Bada-Utils Comprehensive 2-Tier i18n Translation Engine
 * - Tier 1: ComfyUI Native Settings UI Language (Automatically synced with ComfyUI's Locale)
 * - Tier 2: Bada Master Language Switch (Controls canvas nodes, badges, context menus, modals, sidebars)
 */

export const BadaI18n = {
    _lang: null,
    get lang() {
        if (!this._lang) {
            this._lang = this.getBadaLanguage();
        }
        return this._lang;
    },
    set lang(val) {
        this._lang = val;
    },
    listeners: new Set(),

    dict: {
        en: {
            // --- Settings Tab ---
            "category": "⚓ Bada Utils",
            "settings_lang": "UI Language",
            "settings_lang_desc": "Controls language for all Bada nodes, context menus, modals, and Workflows+",
            "blank_canvas": "Clean Blank Canvas on Startup",
            "blank_canvas_desc": "Starts ComfyUI with an empty clean canvas instead of the default missing-model workflow.",
            "mouse_fix": "Smooth Mouse Pan & Wheel Zoom Fixer",
            "mouse_fix_desc": "Allows middle-click panning and wheel zooming seamlessly even over nodes and text widgets.",
            "auto_assign": "Auto Model & LoRA Assigner Alert",
            "auto_assign_desc": "Automatically detects missing models/LoRAs when loading workflows and prompts smart local matching.",
            "sidebar_organizer": "Sidebar Workflow Folder Management",
            "sidebar_organizer_desc": "Enables drag-and-drop workflow folder moving and organization in the left sidebar.",
            "load_image_fix": "Clipboard & LoadImage Auto-Error Fixer",
            "load_image_fix_desc": "Automatically fixes red border and input validation errors caused by pasting clipboard images (Ctrl+V) or subfolder paths in LoadImage nodes.",

            // --- Bada Preset Hub (Canvas Node) ---
            "hub_node_title": "⚓ Bada Preset Hub",
            "hub_select_nodes": "💡 Select node(s) on canvas (Ctrl+Click / Drag)",
            "hub_detected_nodes": "🎯 Detected: {count} Nodes (Ready to Save)",
            "hub_settings_btn": "⚙️ Settings",
            "hub_presets_header": "📜 Bada Presets ({count})",
            "hub_click_apply": "⚡ Click to Apply Instantly",
            "hub_empty_hint": "💡 Select node(s) and click top button to save a preset",
            "hub_switch_on": "ON",
            "hub_switch_off": "OFF",

            // --- Smart Presets Context Menu & Roof Badges ---
            "ctx_global_presets": "🌐 Global Presets ({count})",
            "ctx_save_current": "💾 Save Current Settings as Global Preset...",
            "ctx_open_manager": "📋 Open Global Presets Manager...",
            "ctx_auto_assign_all": "⚡ Auto-Assign All Models/LoRAs",
            "ctx_auto_assign_node": "⚡ Auto-Assign Node Models",
            "badge_global_title": "🌐 Global Presets ({count})",
            "badge_global_desc": "Stored in ComfyUI globally across all workflows for <b>{name}</b>.",
            "badge_global_action": "👉 Click to open Global Presets Manager",
            "badge_hub_title": "⚓ Bada Preset Hub Link ({count})",
            "badge_hub_desc": "<b>{name}</b> is linked to {count} preset(s) in the Hub.",
            "badge_hub_action": "👉 Click to open Bada Preset Hub Manager",

            // --- Global Presets Modal ---
            "modal_global_title": "🌐 {name} Global Presets Manager",
            "modal_global_subtitle": "Node Type: {type} · Stored globally in ComfyUI (Instantly shared across all workflows)",
            "modal_global_input_placeholder": "Enter new global preset name (e.g. Fast Turbo 8step)...",
            "modal_global_save_btn": "💾 Save Current Settings",
            "modal_global_empty": "No saved presets.<br>Enter a name above and click <b>[Save Current Settings]</b>!",
            "modal_global_hint": "💡 Click tags (Pill) or switches to toggle options <b>ON/OFF</b>. Click <b>[Details]</b> to edit and save values.",
            "modal_apply_btn": "▶ Apply Instantly",
            "modal_details_btn": "Details",
            "modal_collapse_btn": "Collapse",
            "modal_export_btn": "📤 Backup (Export)",
            "modal_import_btn": "📥 Load (Import)",
            "modal_guide_btn": "💡 Backup & Cross-Workflow Guide",
            "modal_close_btn": "Close",

            // --- Bada Preset Hub Modal ---
            "modal_hub_title": "Bada Preset Hub Manager",
            "modal_hub_subtitle": "Bada presets are <strong>saved only within the current workflow</strong> and embedded in PNG metadata",
            "modal_hub_input_placeholder": "Enter universal preset name (e.g. FLUX Detailer Setup)...",
            "modal_hub_save_btn": "💾 Save from Current Selection",
            "modal_hub_empty": "No saved universal presets.<br>Select nodes on canvas and click <b>[Save from Current Selection]</b>!",
            "modal_hub_selected_count": "🎯 Selected Canvas Nodes ({count})",
            "modal_hub_no_selection": "⚠️ No nodes selected on canvas. Please select nodes first!",
            "modal_hub_empty_badge": "⚠️ No nodes selected (0)",
            "modal_hub_empty_desc": "Please select nodes to group on canvas (<b>Ctrl + Click</b> or <b>Shift + Drag</b>) before saving.",
            "modal_hub_target_badge": "🎯 Target Nodes: <strong>{count} selected</strong>",
            "modal_hub_target_hint": "※ All settings of the nodes below will be saved as a snapshot preset.",
            "modal_hub_bypass_state": "🟣 Bypass Active",
            "modal_hub_mute_state": "🔴 Mute Active",
            "modal_hub_lora_none": "LoRA: No active items",
            "modal_hub_text_prefix": "Text",
            "modal_hub_default_params": "Default parameters linked",
            "modal_hub_bypass_config": "Bypass configuration",
            "toast_hub_export_success": "📤 Universal preset backup JSON file downloaded.",
            "toast_hub_import_success": "📥 Universal presets successfully imported!",
            "toast_hub_import_error": "⚠️ Error reading JSON file: ",
            "toast_global_export_success": "📤 Global presets backup JSON file downloaded.",
            "toast_global_import_success": "📥 Global presets successfully imported!",

            // --- Workflows+ Sidebar ---
            "wf_tab_native": "Workflows",
            "wf_tab_plus": "Workflows+",
            "wf_search_placeholder": "Search workflows...",
            "wf_btn_focus": "Locate currently active workflow",
            "wf_btn_font_size": "Font Size (Click: Cycle / Right-click: Menu)",
            "wf_btn_new_folder": "New Folder",
            "wf_btn_toggle_all": "Expand / Collapse All",
            "wf_btn_refresh": "Refresh",
            "wf_root_dropzone": "🏠 Drop here to move to Root folder",
            "wf_empty_search": "No search results found.",
            "wf_empty_list": "No workflows found.<br>Click ➕ above to create a new folder.",
            "wf_active_tag": "● Active",
            "wf_bookmarks_header": "Bookmarks",
            "wf_browse_header": "Browse",
            "wf_ctx_load": "⚡ Load to Canvas",
            "wf_ctx_fav_add": "⭐ Add to Bookmarks",
            "wf_ctx_fav_remove": "★ Remove from Bookmarks",
            "wf_ctx_move": "📁 Move to Folder...",
            "wf_ctx_new_subfolder": "➕ New Subfolder",
            "wf_ctx_rename": "✏️ Rename",
            "wf_ctx_delete": "🗑️ Delete",
            "wf_modal_move_title": "📁 Move Workflow",
            "wf_modal_move_dest": "Select Destination Folder",
            "wf_modal_move_or_sub": "Or Create New Subfolder",
            "wf_modal_move_btn": "Move",
            "wf_modal_mkdir_title": "➕ Create New Folder",
            "wf_modal_mkdir_parent": "Parent Folder",
            "wf_modal_mkdir_name": "New Folder Name",
            "wf_modal_mkdir_btn": "Create",
            "wf_modal_rename_title": "✏️ Rename {type}",
            "wf_modal_rename_btn": "Rename",
            "wf_modal_delete_title": "🗑️ Delete {type}",
            "wf_modal_delete_confirm": "Are you sure you want to delete <strong>'{name}'</strong> {target}?",
            "wf_modal_delete_btn": "Delete",
            "wf_cancel_btn": "Cancel",

            // --- Regional Prompt ---
            "rp_art_style": "Style:",
            "rp_hyper_real": "Hyper Real",
            "rp_semi_real": "Semi Real",
            "rp_anime": "2D",
            "rp_character": "Character",
            "rp_3d": "3D",
            "rp_none": "None",
            "rp_white_bg": "White BG",
            "rp_grid_lines": "Grid Lines",
            "rp_silhouette": "Silhouette",
            "rp_global_char": "Global Appearance",
            "rp_char_preset_btn": "Appearance Presets",
            "rp_select_area_hint": "📍 Select a region to edit",
            "rp_apply_btn": "Apply (Ctrl+Enter)",
            "rp_copy_btn": "Copy Prompt",
            "rp_reset_btn": "Reset",
            "rp_final_preview": "Final Prompt Preview"
        },

        ko: {
            // --- Settings Tab ---
            "category": "⚓ Bada Utils",
            "settings_lang": "UI 언어 (Language)",
            "settings_lang_desc": "Bada 모든 노드, 우클릭 메뉴, 모달 창, Workflows+의 표시 언어를 제어합니다.",
            "blank_canvas": "시작 시 깨끗한 빈 캔버스로 열기",
            "blank_canvas_desc": "ComfyUI 실행 시 모델 누락 에러가 나는 기본 워크플로우 대신 깨끗한 빈 캔버스로 시작합니다.",
            "mouse_fix": "마우스 휠 줌 & 중간 버튼 패닝 보정기",
            "mouse_fix_desc": "노드 위나 텍스트 박스 위에서도 휠 줌 및 휠 클릭 드래그 화면 이동이 막힘없이 부드럽게 작동합니다.",
            "auto_assign": "자동 모델 & LoRA 스마트 매칭 알림",
            "auto_assign_desc": "워크플로우를 불러올 때 없는 모델이나 LoRA가 있으면 로컬 모델과 자동으로 매칭하여 안내창을 띄웁니다.",
            "sidebar_organizer": "사이드바 워크플로우 폴더 정리 및 이동",
            "sidebar_organizer_desc": "왼쪽 워크플로우 사이드바에서 워크플로우를 다른 폴더로 드래그하여 이동하거나 새 폴더를 생성할 수 있습니다.",
            "load_image_fix": "클립보드 & 로드 이미지 인풋 에러 자동 해결기",
            "load_image_fix_desc": "로드 이미지 노드에 Ctrl+V로 클립보드 이미지를 붙여넣거나 하위 경로를 불러올 때 발생하는 빨간 테두리 및 인풋 에러를 무결점으로 자동 해결합니다.",

            // --- Bada Preset Hub (Canvas Node) ---
            "hub_node_title": "⚓ Bada Preset Hub",
            "hub_select_nodes": "💡 캔버스에서 노드를 선택하세요 (Ctrl+클릭 / 드래그)",
            "hub_detected_nodes": "🎯 캔버스 선택 감지: {count}개 노드 (저장 가능)",
            "hub_settings_btn": "⚙️ 설정",
            "hub_presets_header": "📜 Bada 프리셋 ({count}개)",
            "hub_click_apply": "⚡ 클릭하여 즉시 적용",
            "hub_empty_hint": "💡 노드 선택 후 상단 버튼을 눌러 저장해 보세요",
            "hub_switch_on": "ON",
            "hub_switch_off": "OFF",

            // --- Smart Presets Context Menu & Roof Badges ---
            "ctx_global_presets": "🌐 글로벌 프리셋 ({count})",
            "ctx_save_current": "💾 현재 세팅 글로벌 프리셋으로 저장...",
            "ctx_open_manager": "📋 글로벌 프리셋 관리자 열기...",
            "ctx_auto_assign_all": "⚡ 전체 모델/LoRA 자동 장착",
            "ctx_auto_assign_node": "⚡ 이 노드 모델 자동 장착",
            "badge_global_title": "🌐 글로벌 프리셋 ({count}개)",
            "badge_global_desc": "<b>{name}</b> 노드에 저장된 전역 프리셋입니다.",
            "badge_global_action": "👉 클릭하여 글로벌 프리셋 관리자 열기",
            "badge_hub_title": "⚓ Bada 프리셋 허브 연동 ({count}개)",
            "badge_hub_desc": "<b>{name}</b> 노드가 포함된 {count}개의 Bada 프리셋이 허브에 등록되어 있습니다.",
            "badge_hub_action": "👉 클릭하여 Bada 프리셋 허브 관리자 열기",

            // --- Global Presets Modal ---
            "modal_global_title": "🌐 {name} 프리셋 관리자",
            "modal_global_subtitle": "노드 타입: {type} · ComfyUI 전역 저장 (동일 노드면 다른 워크플로우에서도 즉시 적용)",
            "modal_global_input_placeholder": "새 글로벌 프리셋 이름 입력 (예: Fast Turbo 8step)...",
            "modal_global_save_btn": "💾 현재 세팅 저장",
            "modal_global_empty": "저장된 프리셋이 없습니다.<br>위 입력창에 이름을 적고 <b>[현재 세팅 저장]</b>을 눌러보세요!",
            "modal_global_hint": "💡 태그(Pill)나 스위치를 클릭하여 원하는 옵션만 <b>켜고 끌 수 있으며(ON/OFF)</b>, <b>[상세 보기]</b>에서 값을 수정한 뒤 프리셋으로 저장 및 즉시 적용할 수 있습니다.",
            "modal_apply_btn": "▶ 즉시 적용",
            "modal_details_btn": "상세 보기",
            "modal_collapse_btn": "접기",
            "modal_export_btn": "📤 백업 (Export)",
            "modal_import_btn": "📥 불러오기 (Import)",
            "modal_guide_btn": "💡 백업 및 타 워크플로우 적용 가이드",
            "modal_close_btn": "닫기",

            // --- Bada Preset Hub Modal ---
            "modal_hub_title": "Bada 프리셋 허브 관리자",
            "modal_hub_subtitle": "Bada 프리셋은 <strong>현재 워크플로우에만 저장</strong>되며 워크플로우 저장(Ctrl+S) 및 이미지 생성 시 메타데이터에 자동 동봉됩니다",
            "modal_hub_input_placeholder": "새 유니버셜 프리셋 이름 입력 (예: FLUX 디테일러 세팅)...",
            "modal_hub_save_btn": "💾 현재 선택 노드로 저장",
            "modal_hub_empty": "저장된 유니버셜 프리셋이 없습니다.<br>캔버스에서 노드를 선택하고 <b>[현재 선택 노드로 저장]</b>을 눌러보세요!",
            "modal_hub_selected_count": "🎯 선택된 캔버스 노드 ({count}개)",
            "modal_hub_no_selection": "⚠️ 캔버스에서 선택된 노드가 없습니다. 먼저 노드들을 선택해 주세요!",
            "modal_hub_empty_badge": "⚠️ 선택된 노드 없음 (0개)",
            "modal_hub_empty_desc": "캔버스에서 묶고 싶은 노드들을 마우스로 선택(<b>Ctrl + 클릭</b> 또는 <b>Shift + 드래그</b>)한 후 저장해 주세요.",
            "modal_hub_target_badge": "🎯 저장 대상 노드: <strong>{count}개 선택됨</strong>",
            "modal_hub_target_hint": "※ 아래 노드들의 전체 세팅값이 하나의 유니버셜 프리셋 세트로 스냅샷 저장됩니다",
            "modal_hub_bypass_state": "🟣 바이패스 (Bypass) 상태",
            "modal_hub_mute_state": "🔴 뮤트 (Mute) 상태",
            "modal_hub_lora_none": "LoRA: 활성 항목 없음",
            "modal_hub_text_prefix": "텍스트",
            "modal_hub_default_params": "기본 파라미터 연동",
            "modal_hub_bypass_config": "바이패스 설정",
            "toast_hub_export_success": "📤 유니버셜 프리셋 JSON 백업 파일이 다운로드되었습니다.",
            "toast_hub_import_success": "📥 유니버셜 프리셋을 성공적으로 불러왔습니다!",
            "toast_hub_import_error": "⚠️ JSON 파일을 읽는 중 오류가 발생했습니다: ",
            "toast_global_export_success": "📤 글로벌 프리셋 JSON 백업 파일이 다운로드되었습니다.",
            "toast_global_import_success": "📥 글로벌 프리셋을 성공적으로 불러왔습니다!",

            // --- Workflows+ Sidebar ---
            "wf_tab_native": "Workflows",
            "wf_tab_plus": "Workflows+",
            "wf_search_placeholder": "워크플로우 검색...",
            "wf_btn_focus": "현재 작업 중인 워크플로우 위치로 이동",
            "wf_btn_font_size": "글자 크기 조절 (좌클릭: 순환 변경 / 우클릭: 메뉴)",
            "wf_btn_new_folder": "새 폴더 생성",
            "wf_btn_toggle_all": "모두 펼치기 / 접기",
            "wf_btn_refresh": "새로고침",
            "wf_root_dropzone": "🏠 최상위 폴더 (Root) 로 드롭하여 이동",
            "wf_empty_search": "검색 결과가 없습니다.",
            "wf_empty_list": "워크플로우가 없습니다.<br>상단 ➕ 로 새 폴더를 만드세요.",
            "wf_active_tag": "● 작업중",
            "wf_bookmarks_header": "Bookmarks",
            "wf_browse_header": "Browse",
            "wf_ctx_load": "⚡ 불러오기 (Load)",
            "wf_ctx_fav_add": "⭐ 즐겨찾기 추가",
            "wf_ctx_fav_remove": "★ 즐겨찾기에서 제거",
            "wf_ctx_move": "📁 폴더로 이동... (Move to)",
            "wf_ctx_new_subfolder": "➕ 하위 새 폴더 (New Subfolder)",
            "wf_ctx_rename": "✏️ 이름 변경 (Rename)",
            "wf_ctx_delete": "🗑️ 삭제 (Delete)",
            "wf_modal_move_title": "📁 워크플로우 이동",
            "wf_modal_move_dest": "대상 폴더 선택",
            "wf_modal_move_or_sub": "또는 새 하위 폴더 생성",
            "wf_modal_move_btn": "이동하기",
            "wf_modal_mkdir_title": "➕ 새 폴더 생성",
            "wf_modal_mkdir_parent": "상위 폴더 (Parent)",
            "wf_modal_mkdir_name": "새 폴더 이름",
            "wf_modal_mkdir_btn": "생성하기",
            "wf_modal_rename_title": "✏️ {type} 이름 변경",
            "wf_modal_rename_btn": "변경하기",
            "wf_modal_delete_title": "🗑️ {type} 삭제",
            "wf_modal_delete_confirm": "정말로 <strong>'{name}'</strong> {target} 삭제하시겠습니까?",
            "wf_modal_delete_btn": "삭제",
            "wf_cancel_btn": "취소",

            // --- Regional Prompt ---
            "rp_art_style": "화풍:",
            "rp_hyper_real": "극실사",
            "rp_semi_real": "반실사",
            "rp_anime": "2D",
            "rp_character": "캐릭터",
            "rp_3d": "3D",
            "rp_none": "없음",
            "rp_white_bg": "백색 배경",
            "rp_grid_lines": "격자 실선",
            "rp_silhouette": "실루엣",
            "rp_global_char": "인물 공통 외모",
            "rp_char_preset_btn": "외모 프리셋 설정",
            "rp_select_area_hint": "📍 편집할 영역을 선택하세요",
            "rp_apply_btn": "적용 (Ctrl+Enter)",
            "rp_copy_btn": "복사 (Copy)",
            "rp_reset_btn": "초기화",
            "rp_final_preview": "최종 프롬프트 미리보기"
        }
    },

    /**
     * Get Bada Custom Node Language Setting
     * Strictly independent from ComfyUI native locale (Comfy.Locale has 0 effect)
     */
    getBadaLanguage(app) {
        try {
            // 1) Direct BADA localStorage setting
            const direct = localStorage.getItem("BadaUtils_Language") || localStorage.getItem("BadaUtils.Language");
            if (direct === "ko" || direct === "en") return direct;

            // 2) ComfyUI App Settings API lookup for BadaUtils.Language
            const theApp = app || (typeof window !== "undefined" ? window.app : null);
            const settingVal = theApp?.ui?.settings?.getSettingValue?.("BadaUtils.Language") ||
                               theApp?.ui?.settings?.settings?.["BadaUtils.Language"]?.value;
            if (settingVal) {
                const s = (typeof settingVal === "object" && settingVal.value) ? settingVal.value : String(settingVal);
                if (s === "ko" || s === "en") return s;
            }

            // 3) ComfyUI settings localStorage entry
            const comfySetting = localStorage.getItem("Comfy.Settings.BadaUtils.Language");
            if (comfySetting) {
                const s = String(comfySetting).replace(/"/g, "").trim().toLowerCase();
                if (s === "ko" || s === "en") return s;
            }
        } catch (e) {}

        // Default to "en" (English First for ComfyUI Manager / Registry Compliance)
        return "en";
    },

    init(app) {
        this._lang = this.getBadaLanguage(app);
    },

    _isSettingLang: false,

    setLanguage(lang, updateComfySetting = false) {
        if (lang !== "ko" && lang !== "en") return;
        if (this._isSettingLang) return;
        this._isSettingLang = true;
        try {
            this._lang = lang;
            try {
                localStorage.setItem("BadaUtils_Language", lang);
                localStorage.setItem("BadaUtils.Language", lang);
                localStorage.setItem("Comfy.Settings.BadaUtils.Language", JSON.stringify(lang));
                if (updateComfySetting) {
                    const theApp = typeof window !== "undefined" ? window.app : null;
                    if (theApp?.ui?.settings?.getSettingValue?.("BadaUtils.Language") !== lang) {
                        theApp?.ui?.settings?.setSettingValue?.("BadaUtils.Language", lang);
                    }
                }
            } catch (e) {}
            this.notifyListeners();
        } finally {
            this._isSettingLang = false;
        }
    },

    subscribe(listener) {
        if (typeof listener === "function") {
            this.listeners.add(listener);
        }
    },

    unsubscribe(listener) {
        this.listeners.delete(listener);
    },

    notifyListeners() {
        for (const listener of this.listeners) {
            try {
                listener(this.lang);
            } catch (e) {
                console.warn("[BadaI18n] listener notification error:", e);
            }
        }
    },

    /**
     * Tier 1 Translation (For Settings dialog based on current Bada/ComfyUI language)
     */
    tSettings(key, app, params = {}) {
        const lang = this.lang || this.getBadaLanguage(app);
        const dict = this.dict[lang] || this.dict.en;
        let str = dict[key] || this.dict.en[key] || key;
        for (const [k, v] of Object.entries(params)) {
            str = str.replace(new RegExp(`\\{${k}\\}`, "g"), v);
        }
        return str;
    },

    /**
     * Tier 2 Translation (For Bada Nodes, Badges, Modals, Menus controlled by Bada Language setting)
     */
    t(key, params = {}) {
        const currentDict = this.dict[this.lang] || this.dict.en;
        let str = currentDict[key] || this.dict.en[key] || key;
        for (const [k, v] of Object.entries(params)) {
            str = str.replace(new RegExp(`\\{${k}\\}`, "g"), v);
        }
        return str;
    }
};

