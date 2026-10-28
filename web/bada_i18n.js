/**
 * ComfyUI-Bada-Utils Comprehensive 2-Tier i18n Translation Engine
 * - Tier 1: ComfyUI Native Settings UI Language (Automatically synced with ComfyUI's Locale)
 * - Tier 2: Bada Master Language Switch (Controls canvas nodes, badges, context menus, modals, sidebars)
 */

import { app as comfyApp } from "../../scripts/app.js";

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
            "ctx_global_presets": "⚓ Global Presets ({count})",
            "ctx_save_current": "💾 Save Current Settings as Global Preset...",
            "ctx_auto_assign_all": "⚓ [Bada] Node Smart Care",
            "ctx_auto_assign_node": "⚡ [Bada] Auto-Assign Node Models",
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

            // --- Universal Smart Presets Modal (guide / toasts / tooltips) ---
            "presets_modal_guide_title": "Bada Preset Hub Backup & Cross-Workflow Guide",
            "presets_modal_guide_subtitle": "How to securely share and migrate presets across workflows and systems",
            "presets_modal_guide_storage_title": "Storage Location & Cross-Workflow Migration",
            "presets_modal_guide_storage_body": "• <b>Universal Presets</b> are stored <b>only inside the current workflow</b> (embedded within the Hub node and PNG metadata).<br>\n• Saving the workflow or generating images automatically packages your universal presets.<br>\n• To share or copy presets to <b>another workflow or PC</b>, click <b>[📤 Backup (Export)]</b> to export a <code style=\"color:#fde68a;\">.json</code> file, and use <b>[📥 Load (Import)]</b> in your target workflow.<br>\n• (※ Single-node <b>Global Presets</b> are saved permanently in ComfyUI and available across all workflows automatically.)",
            "presets_modal_guide_match_title": "1. Smart 3-Tier Node Matching Engine",
            "presets_modal_guide_match_intro": "When applying a universal preset, the system locates canvas nodes using a 3-tier priority sequence:",
            "presets_modal_guide_match_tiers": "Tier 1: Unique Node ID (node.id) ➔ 100% exact match within the same workflow<br>\nTier 2: Node Title + Node Type ➔ Cross-workflow title-based targeting<br>\nTier 3: Spatial Canvas Order (Left to Right) ➔ 1:1 ordered pairing",
            "presets_modal_guide_tip_title": "2. Pro-Tip: Differentiating Multiple Nodes",
            "presets_modal_guide_tip_text": "If your workflow uses multiple nodes of the same type (e.g. 2 KSamplers, 3 Detailers), <b>double-click each node and give it a unique title</b>!",
            "presets_modal_guide_examples_title": "💡 Recommended Title Examples:",
            "presets_modal_guide_backup_title": "3. Backup (Export) & Import",
            "presets_modal_guide_backup_body": "• <b>📤 Backup (Export):</b> Downloads all presets as a single <code style=\"color:#fde68a;\">.json</code> backup file.<br>\n• <b>📥 Load (Import):</b> Select any previously exported <code style=\"color:#fde68a;\">.json</code> file to merge presets into your workflow instantly.",
            "presets_modal_guide_close": "Close Guide",
            "presets_modal_toast_import_success": "📥 Global presets imported successfully!",
            "presets_modal_toast_import_error": "⚠️ Error reading JSON file: {error}",
            "presets_modal_toast_name_required": "⚠️ Please enter a preset name!",
            "presets_modal_toast_saved": "💾 Preset [{name}] saved!",
            "presets_modal_toast_applied": "✨ Preset [{name}] applied instantly!",
            "presets_modal_toast_renamed": "✏️ Preset renamed to [{name}].",
            "presets_modal_toast_reordered": "↕️ Preset order updated.",
            "presets_modal_confirm_delete": "Delete preset '{name}'?",
            "presets_modal_toast_deleted": "🗑️ Preset [{name}] deleted.",
            "presets_modal_on": "Enable (ON)",
            "presets_modal_off": "Disable (OFF)",
            "presets_modal_click_to": "Click to {state}",
            "presets_modal_toast_opt_excluded": "⚡ [{key}] option excluded (ignored on apply)",
            "presets_modal_toast_opt_included": "⚡ [{key}] option included (apply ON)",
            "presets_modal_toast_lora_on": "🟣 LoRA #{index} enabled ON",
            "presets_modal_toast_lora_off": "⚪ LoRA #{index} disabled OFF",
            "presets_modal_no_data": "No data",
            "presets_modal_no_lora": "No LoRA (empty)",
            "presets_modal_default_values": "Default values",
            "presets_modal_no_detail_data": "No detailed data.",
            "presets_modal_no_lora_registered": "No LoRA registered.",
            "presets_modal_no_detail_values": "Detailed settings are empty.",
            "presets_modal_lora_toggle_title": "Toggle LoRA apply",
            "presets_modal_lora_weight": "Weight:",
            "presets_modal_lora_weight_title": "Adjust weight",
            "presets_modal_step_decrease": "Decrease by {step}",
            "presets_modal_step_increase": "Increase by {step}",
            "presets_modal_value_toggle_title": "Change value",
            "presets_modal_apply_toggle_title": "Toggle apply",
            "presets_modal_detail_header": "📋 Detailed Parameter Control & Inline Edit:",
            "presets_modal_detail_hint": "💡 Toggle options or edit values, then save or apply (auto-saved in real time)",
            "presets_modal_current_suffix": " (current)",

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
            "wf_tab_plus": "⚓ Workflows+",
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
            "wf_ctx_load": "Load to Canvas",
            "wf_ctx_fav_add": "Add to Bookmarks",
            "wf_ctx_fav_remove": "Remove from Bookmarks",
            "wf_ctx_move": "Move to Folder...",
            "wf_ctx_new_subfolder": "New Subfolder",
            "wf_ctx_rename": "Rename",
            "wf_ctx_delete": "Delete",
            "wf_ctx_delete_perm": "Permanently Delete",
            "wf_ctx_empty_trash": "Empty Trash",
            "wf_modal_trash_confirm": "Move <strong>'{name}'</strong> {target} to <strong>Trash</strong>?",
            "wf_modal_trash_btn": "Move to Trash",
            "wf_modal_delete_perm_confirm": "Are you sure you want to <strong>permanently delete</strong> '<strong>{name}</strong>'?<br><span style='color:#ef4444;font-size:12px;'>This action cannot be undone.</span>",
            "wf_modal_empty_trash_confirm": "Are you sure you want to <strong>permanently delete</strong> all items in the Trash?<br><span style='color:#ef4444;font-size:12px;'>This action cannot be undone.</span>",
            "wf_modal_empty_trash_btn": "Empty Trash",
            "wf_ctx_edit_info": "Edit Info & Thumbnail...",
            "wf_info_modal_title": "⚓ Workflow Info & Thumbnail",
            "wf_notes_label": "Notes & Description",
            "wf_notes_placeholder": "Enter workflow usage, tips, recommended models...",
            "wf_thumb_label": "Cover Thumbnail",
            "wf_thumb_canvas_btn": "⚡ Set Latest Canvas Output",
            "wf_thumb_paste_btn": "📋 Paste Clipboard (Ctrl+V)",
            "wf_thumb_upload_btn": "📁 Upload Image...",
            "wf_thumb_remove_btn": "🗑️ Remove",
            "wf_thumb_drop_hint": "Drop image here, or press Ctrl+V to paste",
            "wf_thumb_pasted_toast": "Image pasted from clipboard.",
            "wf_save_btn": "Save Info",
            "wf_info_saved_toast": "Workflow info & thumbnail saved successfully.",
            "wf_no_info_hint": "No notes or thumbnail recorded.<br>(Right-click to edit info)",
            "wf_card_path_label": "Path",
            "wf_card_notes_label": "Notes",
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

            // --- Workflows+ Sidebar: Google Drive sync ---
            "wf_gdrive_title": "Google Drive cloud sync",
            "wf_gdrive_title_linked": "Google Drive cloud sync (linked)",
            "wf_gdrive_title_status": "Google Drive cloud sync ({msg})",
            "wf_gdrive_auth_required": "auth required",
            "wf_gdrive_syncing": "Google Drive syncing {frac}{cur}",
            "wf_gdrive_cancel_requested": "Cancelling sync… it stops after the current file.",
            "wf_gdrive_cancel_error": "Cancel error: ",
            "wf_gdrive_missing_libs": "google-api-python-client is required.\npip install google-api-python-client google-auth-oauthlib",
            "wf_gdrive_missing_credentials": "credentials.json is required in the parent folder.",
            "wf_gdrive_starting": "Starting Google Drive async sync...",
            "wf_gdrive_cancelled": "Sync cancelled.",
            "wf_gdrive_complete": "Google Drive sync complete!",
            "wf_gdrive_busy": "Sync already in progress.",
            "wf_gdrive_failed": "Sync failed",
            "wf_gdrive_error": "Sync error: ",

            // --- Workflows+ Sidebar: toasts / tooltips ---
            "wf_refreshed": "Workflows refreshed",
            "wf_load_read_error": "Could not read the workflow file.",
            "wf_load_failed": "Failed to load",
            "wf_load_success": "'{name}' loaded successfully!",
            "wf_load_error": "Load error: ",
            "wf_focus_title": "Locate active: '{name}'",
            "wf_focus_none": "No active workflow is currently open.",
            "wf_focus_located": "🎯 Located '{name}'",
            "wf_focus_active": "Active: '{name}'",
            "wf_font_size_title": "Font Size: {label}\n(Left-click: Cycle / Right-click: Menu)",
            "wf_font_size_toast": "Font Size: ",
            "wf_font_menu_title": "🔤 Font & Row Size",
            "wf_font_compact": "Small (A⁻ - 13px)",
            "wf_font_standard": "Medium (A - 14.5px)",
            "wf_font_large": "Large (A⁺ - 16px)",
            "wf_font_xlarge": "Extra Large (A⁺⁺ - 18px)",
            "wf_fav_removed": "'{name}' removed from bookmarks.",
            "wf_fav_added": "⭐ '{name}' added to bookmarks!",
            "wf_root_label": "Root",
            "wf_move_success": "'{name}' moved to {target}!",
            "wf_move_failed": "Failed to move",
            "wf_move_error": "Move error: ",
            "wf_move_folder_forbidden": "A folder cannot be moved into itself or a subfolder.",
            "wf_move_folder_success": "📁 '{name}' moved to {target}!",
            "wf_move_selection_failed": "Could not move the selected items.",
            "wf_move_selection_success": "📦 Moved {count} item(s) to {target}{failed}",
            "wf_move_failed_count": " ({count} failed)",
            "wf_badge_thumb": "Thumbnail attached (Click to edit)",
            "wf_badge_notes": "Notes attached (Click to edit)",
            "wf_path_tooltip": "{name}\nPath: {path}",
            "wf_folder_create_failed": "Failed to create folder",
            "wf_untitled": "Untitled",
            "wf_folder_created": "Folder '{name}' created!",
            "wf_create_failed": "Failed to create folder",

            // --- Workflows+ Sidebar: rename / delete ---
            "wf_type_folder": "Folder",
            "wf_type_workflow": "Workflow",
            "wf_rename_new_name": "Enter New Name",
            "wf_rename_hint": "Only the name changes — the location stays the same.",
            "wf_rename_success": "Renamed to '{name}'!",
            "wf_rename_failed": "Failed to rename",
            "wf_modal_delete_trash_title": "🗑️ Delete {type}",
            "wf_modal_delete_perm_title": "🗑️ Delete {type} Permanently",
            "wf_modal_delete_perm_btn": "Delete Permanently",
            "wf_trash_target_folder": "folder and its contents",
            "wf_trash_target_workflow": "workflow",
            "wf_trash_emptied": "Trash emptied.",
            "wf_deleted_permanent": "'{name}' permanently deleted!",
            "wf_deleted_trash": "'{name}' moved to Trash!",
            "wf_delete_failed": "Failed to delete",

            // --- Workflows+ Sidebar: preview / thumbnail ---
            "wf_preview_footer": "Right-click to edit info & thumbnail",
            "wf_clip_no_direct_paste": "Please press Ctrl+V to paste the image.",
            "wf_clip_empty": "No image found in clipboard.",
            "wf_clip_denied": "Please press Ctrl+V directly to paste the image.",
            "wf_thumb_searching": "⏳ Searching...",
            "wf_thumb_saving": "⏳ Saving...",
            "wf_thumb_canvas_load_failed": "Could not load canvas image.",
            "wf_thumb_canvas_none": "No recently generated image found on canvas or history.",

            // --- Save As Folder Picker ---
            "wf_saveas_title": "💾 Save Workflow As (Choose Folder)",
            "wf_saveas_folder": "📁 Destination Folder",
            "wf_saveas_root": "Root (top level)",
            "wf_trash_folder": "Trash",
            "wf_saveas_name": "📄 File Name",
            "wf_saveas_name_required": "Please enter a file name.",
            "wf_saveas_path": "Target path",
            "wf_saveas_exists": "(a file with this name already exists - you will be asked to overwrite)",
            "wf_saveas_confirm": "Save",
            "wf_saveas_new_folder": "➕ New Folder",
            "wf_saveas_new_folder_ph": "New folder name",
            "wf_saveas_new_folder_btn": "Create",
            "wf_saveas_new_folder_done": "Folder '{folder}' created.",
            "wf_saveas_selected": "Selected folder",
            "wf_saveas_tree_hint": "Click = select · ▶/▼ or double-click = expand · Arrow keys to navigate",


            // --- Settings Tab ---
            "category": "⚓ Bada Utils",
            "settings_cat_general": "1. General",
            "settings_cat_smart": "2. Smart Features",
            "settings_cat_workflow": "3. Workflow & QoL",
            "settings_cat_startup": "4. Startup Behavior",
            "settings_cat_presets": "5. Global Presets",
            "settings_cat_image": "6. Image & Clipboard QoL",
            "settings_name_lang": "🌐 UI Language",
            "settings_name_sidebar": "📁 Sidebar Workflow Folder Management",
            "settings_name_mouse": "🖱️ Smooth Mouse Pan & Wheel Zoom Fixer",
            "settings_name_blank": "🧼 Clean Blank Canvas Startup",
            "settings_name_presets": "Global Presets",
            "settings_name_loadimage": "📋 Clipboard & LoadImage Auto-Error Fixer",
            "settings_desc_lang": "Set display language for Bada nodes, context menus, modals, and Workflows+ sidebar.",
            "settings_desc_sidebar": "Organize and move workflow folders via drag-and-drop in the left sidebar.",
            "settings_desc_mouse": "Smooth mouse wheel zooming and middle-click panning even over canvas nodes or text widgets.",
            "settings_desc_blank": "Start ComfyUI and new tabs with a clean blank canvas instead of default workflows with missing-model errors.",
            "settings_desc_loadimage": "Automatically fixes red border and input validation errors caused by pasting clipboard images (Ctrl+V) or subfolder paths in LoadImage nodes.",

            // --- Auto Model & LoRA Assigner ---
            "aa_modal_title": "⚡ Smart Model & LoRA Assigner & Folder Browser",
            "aa_summary_missing": "Review and assign missing models with local PC folder explorer, or switch to your desired model.",
            "aa_badge_missing": "⚠️ {missingCount} Missing / Total {totalCount} Nodes",
            "aa_summary_ok": "All models are properly loaded. You can browse or replace models from the folder tree.",
            "aa_badge_ok": "✅ All {totalCount} Models Loaded",
            "aa_footer_notice": "※ Skipped nodes will retain their original model names.",
            "aa_btn_cancel": "Close",
            "aa_btn_apply": "⚡ Apply Selected Models",
            "aa_skip_current": "(Skip / Keep Current)",
            "aa_smart_match": "Smart Match:",
            "aa_folder_tree_open": "📂 Open Folder Tree",
            "aa_folder_tree_close": "📂 Close Folder Tree",
            "aa_manual_select": "Manual Selection",
            "aa_toast_applied": "✅ Successfully applied {count} model(s)!",
            "aa_toast_none": "No changes were made.",

            // --- Gemini Studio ---
            "gem_apikey_section": "🔑 API Key & Priority Model Selection",
            "gem_apikey_placeholder": "Enter Google Gemini API Key...",
            "gem_apikey_save": "Save Key",
            "gem_apikey_saved": "Key saved!",
            "gem_gen_btn": "✨ Generate AI Prompt (Shift+Enter)",
            "gem_gen_running": "Generating prompt...",
            "gem_copy_prompt": "📋 Copy Prompt",
            "gem_copy_notes": "📝 Copy Notes",
            "gem_tab_chat": "✨ Uncensored Gemini (Chat)",
            "gem_toggle_nsfw_title": "Allow NSFW Content",
            "gem_toggle_nsfw_desc": "Uncensored sensual & intimate scenes",
            "gem_toggle_trans_title": "Korean Translation & Notes",
            "gem_toggle_trans_desc": "Separate English prompt and director notes",
            "gem_prompt_input_placeholder": "Describe the scene, character, or idea in detail...",

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
            "rp_final_preview": "Final Prompt Preview",

            // --- Bada Google Translator ---
            "trans_node_title": "⚓ Bada Google Translator",
            "trans_label_text": "text",
            "trans_label_from": "from_lang",
            "trans_label_to": "to_lang",
            "trans_label_quotes": "preserve_quotes",
            "trans_tip_quotes": "When true, text inside double quotes (\" \") is preserved without translation.",

            // --- Global Presets Overview Modal ---
            "presets_overview_title": "Global Presets Overview & Manager",
            "presets_overview_subtitle": "Review and manage all global presets stored in ComfyUI",
            "presets_overview_total_label": "🎯 Total Presets:",
            "presets_overview_node_types_label": "🧩 Node Types:",
            "presets_overview_shared_note": "※ Stored globally across all workflows",
            "presets_overview_empty_title": "No Global Presets Saved Yet",
            "presets_overview_empty_hint": "💡 Right-click any node on canvas and select <b>[Save Current Settings as Global Preset...]</b> to save your first global preset!",
            "presets_overview_count_one": "{n} Preset",
            "presets_overview_count_many": "{n} Presets",
            "presets_overview_backup_all": "📤 Backup All Presets (JSON)",
            "presets_overview_import": "📥 Import Presets",
            "presets_overview_close": "✕ Close",
            "presets_overview_export_done": "📤 Global presets backup JSON downloaded",
            "presets_overview_backup_all_done": "📤 Global presets backup JSON downloaded",
            "presets_overview_import_done": "📥 Global presets imported successfully",
            "presets_overview_import_merged_done": "📥 Global presets successfully imported & merged",
            "presets_overview_json_error": "⚠️ Failed to parse JSON file: ",

            // --- Missing Node Detective Modal ---
            "detective_title": "Bada Missing Node Detective",
            "detective_real_class": "Real Class (Type)",
            "detective_copy": "Copy",
            "detective_display_title": "Display Title",
            "detective_searching": "Searching ComfyUI Manager database...",
            "detective_slots_guide": "Original Sockets & Parameters Guide",
            "detective_close": "Close",
            "detective_copy_type_toast": "Real node class type copied!",
            "detective_registered": "ComfyUI Manager Registered Node!",
            "detective_priority_manager": "Priority 1: Manager",
            "detective_priority_install": "Priority 1: Install via ComfyUI Manager",
            "detective_install_oneclick": "Install via Manager (One-Click)",
            "detective_open_manager": "Open in Manager",
            "detective_confirm_install": "Install '{packTitle}' into ComfyUI custom_nodes?\n\nRepo: {repoUrl}",
            "detective_alt_options": "Alternative Options (GitHub / Google)",
            "detective_open_github": "Open GitHub Repo",
            "detective_google_search": "Google Search",
            "detective_copy_clone": "Copy Clone Cmd",
            "detective_clone_copied": "git clone command copied!",
            "detective_installing": "Installing...",
            "detective_cloning": "Cloning repository and installing dependencies...",
            "detective_installed_done": "'{packTitle}' installed successfully!",
            "detective_restart_hint": "Restart ComfyUI server to load and use the newly installed nodes.",
            "detective_restart_now": "Restart ComfyUI Now",
            "detective_restart_toast": "Restarting ComfyUI...",
            "detective_retry_install": "Retry Install via Manager",
            "detective_install_failed": "Installation Failed",
            "detective_unindexed": "Unindexed / Independent Node",
            "detective_priority_google": "Priority 1: Google & GitHub",
            "detective_not_indexed_body": "This node is not indexed in ComfyUI Manager DB. Use Google Search (Priority 1) or GitHub Code Search to find the author's repo:",
            "detective_google_priority": "Priority 1: Google Search",
            "detective_google_best": "Google Search (Best Match)",
            "detective_priority2": "Priority 2: GitHub Search",
            "detective_gh_code": "GitHub Code Search",
            "detective_gh_repos": "GitHub Repos",
            "detective_copy_name": "Copy Node Name",
            "detective_github_tip": "💡 <b>Tip</b>: On GitHub Code Search, click the repository name (e.g. author/repo) at the top of the file snippet to visit the main repo.",

            // --- Settings v2: Global Presets row + Cloud Sync row ---
            "cloud_title": "☁️ Cloud Sync (Google Drive)",
            "cloud_desc": "Automatically synchronizes ComfyUI workflows and settings with Google Drive.",
            "cloud_master_title": "Master Cloud Sync ON/OFF",
            "cloud_opt_startup": "Auto-sync on Startup",
            "cloud_opt_realtime": "Auto-sync on Realtime Changes",
            "cloud_status_idle": "⏸️ Google Drive not linked",
            "cloud_status_ok": "✅ Google Drive linked",
            "cloud_status_no_libs": "⚠️ Install google-api-python-client",
            "cloud_status_no_creds": "⚠️ credentials.json not found",
            "cloud_status_auth": "🔑 Authentication required",
            "cloud_sync_now": "☁️ Sync Now",
            "cloud_syncing": "⏳ Syncing… (click to cancel)",
            "cloud_cancelling": "⏳ Cancelling…",
            "cloud_detail_btn": "🔍 View sync details",
            "cloud_pro_title": "👑 Bada PRO",
            "cloud_pro_guide_btn": "📄 Get",
            "cloud_pro_guide_tip": "Open activation guide (new tab)",
            "cloud_pro_hint": "Sync any files, folders, or your Gemini chat history — <b style=\"color:#fbbf24\">free</b>, no capacity limits.<br>Drag &amp; drop your issued JSON file here to activate PRO.",
            "cloud_pro_pick_file": "📎 Choose file",
            "cloud_pro_active": "👑 Bada PRO Active ✓ · Unlimited capacity",
            "cloud_pro_err_not_cred": "⚠️ Not a valid PRO credential (no client_id)",
            "cloud_pro_err_invalid": "⚠️ Not a valid JSON credentials file",
            "cloud_pro_err_same_basic": "⚠️ Same as the bundled BASIC credential — upload your own PRO file",
            "settings_v2_save_apply": "Save and apply to nodes",
            "settings_v2_dup": "Duplicate: {names}",
            "settings_v2_conflict_blacklist": "\"{name}\" is also in Add — Exclude wins",
            "settings_v2_conflict_whitelist": "\"{name}\" is also in Exclude — Exclude wins",
            "settings_v2_presets_empty": "No global presets saved yet",
            "settings_v2_presets_export": "📤 Backup All (JSON)",
            "settings_v2_presets_import": "📥 Import",
            "settings_v2_presets_open": "🌐 Open Presets Manager",
            "settings_v2_request_failed": "⚠️ Request failed: {err}",
            "settings_v2_syncing": "⏳ Syncing {frac}{cur}",
            "cloud_status_preparing": "⏳ Preparing sync…",
            "cloud_last_sync": "☁️ Last sync {when} (↑{up} ↓{down})",
            "cloud_cancel_requested": "⏳ Cancelling… it stops after the current file.",
            "cloud_no_sync_running": "ℹ️ No sync is currently running.",
            "cloud_cancel_failed": "❌ Cancel request failed: {err}",
            "cloud_cancelled": "Sync cancelled.",
            "cloud_trash_cleaned": " · Cleaned(trash): local {local}, drive {remote}",
            "cloud_sync_done": "✅ Sync done (upload {up} · download {down}{extra})",
            "cloud_failed": "Failed",
            "cloud_request_failed": "❌ Request failed: {err}"
        },

        ko: {
            // --- Settings Tab ---
            "category": "⚓ Bada Utils",
            "settings_cat_general": "1. 일반",
            "settings_cat_smart": "2. 스마트 기능",
            "settings_cat_workflow": "3. 워크플로우 & 편의성",
            "settings_cat_startup": "4. 시작 환경",
            "settings_cat_presets": "5. 글로벌 프리셋",
            "settings_cat_image": "6. 이미지 & 클립보드 편의성",
            "settings_name_lang": "🌐 UI 언어 설정",
            "settings_name_sidebar": "📁 사이드바 워크플로우 폴더 관리",
            "settings_name_mouse": "🖱️ 부드러운 마우스 휠 줌 & 패닝 보정기",
            "settings_name_blank": "🧼 시작 시 클린 빈 캔버스로 열기",
            "settings_name_presets": "글로벌 프리셋",
            "settings_name_loadimage": "📋 클립보드 & LoadImage 자동 에러 해결사",
            "settings_desc_lang": "Bada 모든 노드, 우클릭 메뉴, 모달 창, Workflows+의 표시 언어를 제어합니다.",
            "settings_desc_sidebar": "왼쪽 사이드바에서 드래그 앤 드롭으로 워크플로우 폴더를 자유롭게 정리하고 이동합니다.",
            "settings_desc_mouse": "노드 위나 텍스트 박스 위에서도 휠 줌 및 중간 버튼 패닝이 막힘없이 부드럽게 작동합니다.",
            "settings_desc_blank": "ComfyUI 실행 시 모델 누락 에러가 나는 기본 워크플로우 대신 깨끗한 빈 캔버스로 시작합니다.",
            "settings_desc_loadimage": "LoadImage 노드에 클립보드 이미지(Ctrl+V)를 붙여넣거나 하위 경로 로드 시 발생하는 빨간 테두리 에러를 자동으로 치료합니다.",

            // --- Auto Model & LoRA Assigner ---
            "aa_modal_title": "⚡ 모델 / LoRA 스마트 자동 장착 & 폴더 탐색기",
            "aa_summary_missing": "누락된 모델을 내 PC 폴더 탐색기로 확인 및 장착하거나, 원하는 모델로 즉시 변경할 수 있습니다.",
            "aa_badge_missing": "⚠️ {missingCount}개 누락됨 / 총 {totalCount}개 노드",
            "aa_summary_ok": "모든 모델이 정상 장착되어 있습니다. 폴더 트리에서 모델을 확인하거나 다른 모델로 교체할 수 있습니다.",
            "aa_badge_ok": "✅ 전체 {totalCount}개 정상 장착됨",
            "aa_footer_notice": "※ 건너뛴 노드는 기존 모델명이 그대로 유지됩니다.",
            "aa_btn_cancel": "닫기",
            "aa_btn_apply": "⚡ 선택한 모델 장착 / 확인",
            "aa_skip_current": "(건너뛰기 / 현재 유지)",
            "aa_smart_match": "스마트 추천:",
            "aa_folder_tree_open": "📂 폴더 트리 열기",
            "aa_folder_tree_close": "📂 폴더 트리 닫기",
            "aa_manual_select": "직접 선택",
            "aa_toast_applied": "✅ {count}개 모델이 성공적으로 장착되었습니다!",
            "aa_toast_none": "변경된 항목이 없습니다.",

            // --- Gemini Studio ---
            "gem_apikey_section": "🔑 API Key & 우선순위 모델 선택",
            "gem_apikey_placeholder": "Google Gemini API Key 입력...",
            "gem_apikey_save": "키 저장",
            "gem_apikey_saved": "키가 저장되었습니다!",
            "gem_gen_btn": "✨ AI 프롬프트 생성 (Shift+Enter)",
            "gem_gen_running": "프롬프트 생성 중...",
            "gem_copy_prompt": "📋 프롬프트 복사",
            "gem_copy_notes": "📝 해설 복사",
            "gem_tab_chat": "✨ 무검열 제미나이 (채팅)",
            "gem_toggle_nsfw_title": "성인용 콘텐츠 허용 (NSFW)",
            "gem_toggle_nsfw_desc": "관능적/친밀한 장면 무검열 묘사",
            "gem_toggle_trans_title": "한국어 번역 및 해설",
            "gem_toggle_trans_desc": "영문 프롬프트와 연출 해설 분할",
            "gem_prompt_input_placeholder": "생성하고자 하는 장면, 인물, 구도, 조명 등을 자세히 적어보세요...",
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
            "ctx_global_presets": "⚓ 글로벌 프리셋 ({count})",
            "ctx_save_current": "💾 현재 세팅 글로벌 프리셋으로 저장...",
            "ctx_auto_assign_all": "⚓ [바다] 노드 스마트 케어",
            "ctx_auto_assign_node": "⚡ [바다] 이 노드 모델 자동 장착",
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

            // --- Universal Smart Presets Modal (guide / toasts / tooltips) ---
            "presets_modal_guide_title": "Bada 프리셋 허브 백업 & 타 워크플로우 적용 가이드",
            "presets_modal_guide_subtitle": "다른 컴퓨터나 새로운 워크플로우로 프리셋을 안전하게 공유하는 방법",
            "presets_modal_guide_storage_title": "유니버셜 프리셋 허브 저장 위치 & 타 워크플로우 적용 안내",
            "presets_modal_guide_storage_body": "• <b>유니버셜 프리셋</b>은 개별 노드의 글로벌 프리셋과 달리 <b>현재 워크플로우(Hub 노드 데이터) 내부에만 저장</b>됩니다.<br>\n• 워크플로우를 저장하거나 이미지를 생성하면 메타데이터에 유니버셜 프리셋이 함께 자동 저장됩니다.<br>\n• <b>다른 워크플로우나 다른 PC에 동일한 유니버셜 프리셋을 복사/적용</b>하려면, 하단의 <b>[📤 백업 (Export)]</b> 버튼으로 <code style=\"color:#fde68a;\">.json</code> 파일을 내보낸 후 대상 워크플로우에서 <b>[📥 불러오기 (Import)]</b>를 이용해 주세요.<br>\n• (※ <b>개별 노드의 글로벌 프리셋</b>은 ComfyUI 시스템에 영구 저장되므로 내보내기/가져오기 없이도 모든 워크플로우에서 즉시 공유됩니다.)",
            "presets_modal_guide_match_title": "1. 스마트 노드 매칭 3단계 작동 원리",
            "presets_modal_guide_match_intro": "유니버셜 프리셋을 적용할 때, 시스템은 캔버스 상의 노드를 아래 3단계 우선순위로 자동 탐색하여 1:1로 안전하게 매칭합니다:",
            "presets_modal_guide_match_tiers": "1단계: 노드 고유 번호 (node.id) ➔ 동일 워크플로우 내에서 100% 완벽 매칭<br>\n2단계: 노드 제목 (title) + 노드 종류 (nodeType) ➔ 타 워크플로우 전용 제목 매칭<br>\n3단계: 캔버스 좌측 ➔ 우측 배치 순서 1:1 순차 배정 (중복 배정 원천 차단)",
            "presets_modal_guide_tip_title": "2. 가장 중요한 핵심 꿀팁 (동일 노드 다중 사용 시)",
            "presets_modal_guide_tip_text": "한 워크플로우에 <b>KSampler 2개</b>, <b>Load VAE 2개</b>, <b>디테일러 5개</b> 등 같은 종류의 노드를 여러 개 사용 중이라면, <b>노드를 더블 클릭하여 이름을 다르게 지정</b>해 주세요!",
            "presets_modal_guide_examples_title": "💡 노드 제목(Title) 구분 권장 예시:",
            "presets_modal_guide_backup_title": "3. 백업(Export) & 불러오기(Import) 활용법",
            "presets_modal_guide_backup_body": "• <b>📤 백업 (Export):</b> 현재 저장된 모든 프리셋을 <code style=\"color:#fde68a;\">.json</code> 단일 파일로 다운로드하여 안전하게 백업합니다.<br>\n• <b>📥 불러오기 (Import):</b> 다운로드받은 <code style=\"color:#fde68a;\">.json</code> 프리셋 파일을 선택하면 기존 프리셋 목록에 즉시 병합되어 바로 사용하실 수 있습니다.",
            "presets_modal_guide_close": "가이드 확인 완료 (닫기)",
            "presets_modal_toast_import_success": "📥 글로벌 프리셋을 성공적으로 불러왔습니다!",
            "presets_modal_toast_import_error": "⚠️ JSON 파일을 읽는 중 오류가 발생했습니다: {error}",
            "presets_modal_toast_name_required": "⚠️ 프리셋 이름을 입력해 주세요!",
            "presets_modal_toast_saved": "💾 [{name}] 프리셋이 저장되었습니다!",
            "presets_modal_toast_applied": "✨ [{name}] 프리셋 즉시 적용 완료!",
            "presets_modal_toast_renamed": "✏️ 프리셋 이름이 [{name}] (으)로 변경되었습니다.",
            "presets_modal_toast_reordered": "↕️ 프리셋 순서가 변경되었습니다.",
            "presets_modal_confirm_delete": "'{name}' 프리셋을 정말 삭제하시겠습니까?",
            "presets_modal_toast_deleted": "🗑️ [{name}] 프리셋이 삭제되었습니다.",
            "presets_modal_on": "적용(ON)",
            "presets_modal_off": "제외(OFF)",
            "presets_modal_click_to": "클릭하여 {state}",
            "presets_modal_toast_opt_excluded": "⚡ [{key}] 옵션 제외 (적용 시 무시)",
            "presets_modal_toast_opt_included": "⚡ [{key}] 옵션 포함 (적용 ON)",
            "presets_modal_toast_lora_on": "🟣 LoRA #{index} 적용 ON",
            "presets_modal_toast_lora_off": "⚪ LoRA #{index} 제외 OFF",
            "presets_modal_no_data": "데이터 없음",
            "presets_modal_no_lora": "LoRA 없음 (비어있음)",
            "presets_modal_default_values": "기본 설정값",
            "presets_modal_no_detail_data": "상세 데이터가 없습니다.",
            "presets_modal_no_lora_registered": "등록된 LoRA가 없습니다.",
            "presets_modal_no_detail_values": "상세 설정값이 비어있습니다.",
            "presets_modal_lora_toggle_title": "LoRA 적용 여부 켜기/끄기",
            "presets_modal_lora_weight": "가중치:",
            "presets_modal_lora_weight_title": "가중치 조절",
            "presets_modal_step_decrease": "{step} 감소",
            "presets_modal_step_increase": "{step} 증가",
            "presets_modal_value_toggle_title": "값 변경",
            "presets_modal_apply_toggle_title": "적용 여부 켜기/끄기",
            "presets_modal_detail_header": "📋 상세 파라미터 제어 & 인라인 수정:",
            "presets_modal_detail_hint": "💡 스위치로 옵션을 켜고 끄거나 값을 수정한 뒤 저장/적용할 수 있습니다 (실시간 자동 저장)",
            "presets_modal_current_suffix": " (현재값)",

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
            "wf_tab_plus": "⚓ 워크플로우+",
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
            "wf_ctx_load": "불러오기 (Load)",
            "wf_ctx_fav_add": "즐겨찾기 추가",
            "wf_ctx_fav_remove": "즐겨찾기에서 제거",
            "wf_ctx_move": "폴더로 이동... (Move to)",
            "wf_ctx_new_subfolder": "하위 새 폴더 (New Subfolder)",
            "wf_ctx_rename": "이름 변경 (Rename)",
            "wf_ctx_delete": "삭제 (Delete)",
            "wf_ctx_delete_perm": "영구 삭제 (Delete Permanently)",
            "wf_ctx_empty_trash": "휴지통 비우기 (Empty Trash)",
            "wf_modal_trash_confirm": "<strong>'{name}'</strong> {target} <strong>휴지통으로 이동</strong>하시겠습니까?",
            "wf_modal_trash_btn": "휴지통으로 이동",
            "wf_modal_delete_perm_confirm": "휴지통의 <strong>'{name}'</strong> 항목을 <strong>영구 삭제</strong>하시겠습니까?<br><span style='color:#ef4444;font-size:12px;'>이 작업은 되돌릴 수 없습니다.</span>",
            "wf_modal_empty_trash_confirm": "휴지통의 모든 워크플로우를 <strong>영구 삭제</strong>하시겠습니까?<br><span style='color:#ef4444;font-size:12px;'>이 작업은 되돌릴 수 없습니다.</span>",
            "wf_modal_empty_trash_btn": "휴지통 비우기",
            "wf_ctx_edit_info": "정보 및 썸네일 설정...",
            "wf_info_modal_title": "⚓ 워크플로우 정보 및 썸네일",
            "wf_notes_label": "주석 및 설명 메모",
            "wf_notes_placeholder": "이 워크플로우의 특징, 권장 모델, 세팅 팁 등을 자유롭게 적어보세요...",
            "wf_thumb_label": "대표 썸네일 이미지",
            "wf_thumb_canvas_btn": "⚡ 캔버스 최근 생성물로 지정",
            "wf_thumb_paste_btn": "📋 클립보드 붙여넣기 (Ctrl+V)",
            "wf_thumb_upload_btn": "📁 이미지 업로드...",
            "wf_thumb_remove_btn": "🗑️ 썸네일 제거",
            "wf_thumb_drop_hint": "이미지를 여기에 드롭하거나 Ctrl+V 붙여넣기",
            "wf_thumb_pasted_toast": "클립보드 이미지가 등록되었습니다.",
            "wf_save_btn": "정보 저장",
            "wf_info_saved_toast": "워크플로우 정보와 썸네일이 저장되었습니다.",
            "wf_no_info_hint": "등록된 주석이나 썸네일이 없습니다.<br>(우클릭하여 정보 및 썸네일 등록)",
            "wf_card_path_label": "경로",
            "wf_card_notes_label": "주석/메모",
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

            // --- Workflows+ Sidebar: Google Drive sync ---
            "wf_gdrive_title": "Google Drive 클라우드 동기화",
            "wf_gdrive_title_linked": "Google Drive 클라우드 동기화 (연동됨)",
            "wf_gdrive_title_status": "Google Drive 클라우드 동기화 ({msg})",
            "wf_gdrive_auth_required": "인증 필요",
            "wf_gdrive_syncing": "Google Drive 동기화 중 {frac}{cur}",
            "wf_gdrive_cancel_requested": "동기화 중단 요청… 진행 중인 파일까지만 마무리하고 멈춥니다.",
            "wf_gdrive_cancel_error": "중단 요청 오류: ",
            "wf_gdrive_missing_libs": "google-api-python-client 설치가 필요합니다.\npip install google-api-python-client google-auth-oauthlib",
            "wf_gdrive_missing_credentials": "credentials.json 파일이 상위 폴더에 필요합니다.",
            "wf_gdrive_starting": "Google Drive 비동기 동기화 시작...",
            "wf_gdrive_cancelled": "동기화가 중단되었습니다.",
            "wf_gdrive_complete": "Google Drive 동기화 완료!",
            "wf_gdrive_busy": "이미 동기화가 진행 중입니다.",
            "wf_gdrive_failed": "동기화 실패",
            "wf_gdrive_error": "동기화 오류: ",

            // --- Workflows+ Sidebar: toasts / tooltips ---
            "wf_refreshed": "새로고침 완료",
            "wf_load_read_error": "워크플로우 파일을 읽을 수 없습니다.",
            "wf_load_failed": "불러오기 실패",
            "wf_load_success": "'{name}' 불러오기 완료!",
            "wf_load_error": "불러오기 오류: ",
            "wf_focus_title": "현재 작업: '{name}' 위치로 이동",
            "wf_focus_none": "현재 열려있는 워크플로우가 없습니다.",
            "wf_focus_located": "🎯 '{name}' 위치로 이동했습니다.",
            "wf_focus_active": "현재 작업: '{name}'",
            "wf_font_size_title": "글자 크기: {label}\n(좌클릭: 크기 순환 변경 / 우클릭: 목록 선택)",
            "wf_font_size_toast": "글자 크기: ",
            "wf_font_menu_title": "🔤 글자 & 행 크기 설정",
            "wf_font_compact": "작게 (A⁻ - 13px)",
            "wf_font_standard": "보통 (A - 14.5px)",
            "wf_font_large": "크게 (A⁺ - 16px)",
            "wf_font_xlarge": "아주 크게 (A⁺⁺ - 18px)",
            "wf_fav_removed": "'{name}' 즐겨찾기에서 제거되었습니다.",
            "wf_fav_added": "⭐ '{name}' 즐겨찾기에 추가되었습니다!",
            "wf_root_label": "최상위(Root)",
            "wf_move_success": "'{name}' -> {target} 이동 완료!",
            "wf_move_failed": "이동 실패",
            "wf_move_error": "이동 오류: ",
            "wf_move_folder_forbidden": "폴더를 자기 자신이나 하위 폴더 안으로 옮길 수 없습니다.",
            "wf_move_folder_success": "📁 '{name}' -> {target} 이동 완료!",
            "wf_move_selection_failed": "선택한 항목을 이동하지 못했습니다.",
            "wf_move_selection_success": "📦 {count}개 항목 -> {target} 이동 완료!{failed}",
            "wf_move_failed_count": " ({count}개 실패)",
            "wf_badge_thumb": "대표 썸네일 등록됨 (클릭하여 수정)",
            "wf_badge_notes": "주석 및 메모 등록됨 (클릭하여 수정)",
            "wf_path_tooltip": "{name}\n경로: {path}",
            "wf_folder_create_failed": "폴더 생성 실패",
            "wf_untitled": "제목 없음",
            "wf_folder_created": "폴더 '{name}' 생성 완료!",
            "wf_create_failed": "생성 실패",

            // --- Workflows+ Sidebar: rename / delete ---
            "wf_type_folder": "폴더",
            "wf_type_workflow": "워크플로우",
            "wf_rename_new_name": "새 이름 입력",
            "wf_rename_hint": "이름만 변경됩니다. 위치는 그대로 유지됩니다.",
            "wf_rename_success": "'{name}' (으)로 변경 완료!",
            "wf_rename_failed": "이름 변경 실패",
            "wf_modal_delete_trash_title": "🗑️ {type} 삭제 (휴지통 이동)",
            "wf_modal_delete_perm_title": "🗑️ {type} 영구 삭제",
            "wf_modal_delete_perm_btn": "영구 삭제",
            "wf_trash_target_folder": "폴더와 내부 파일을",
            "wf_trash_target_workflow": "워크플로우를",
            "wf_trash_emptied": "휴지통을 비웠습니다.",
            "wf_deleted_permanent": "'{name}' 영구 삭제 완료!",
            "wf_deleted_trash": "'{name}' 휴지통으로 이동 완료!",
            "wf_delete_failed": "삭제 실패",

            // --- Workflows+ Sidebar: preview / thumbnail ---
            "wf_preview_footer": "우클릭하여 정보 및 썸네일 수정",
            "wf_clip_no_direct_paste": "브라우저 보안으로 인해 직접 붙여넣기를 호출할 수 없습니다. 키보드 단축키 Ctrl+V 를 눌러 붙여넣어 주세요!",
            "wf_clip_empty": "클립보드에 복사된 이미지가 없습니다. 이미지를 복사한 후 Ctrl+V 또는 이 버튼을 눌러주세요.",
            "wf_clip_denied": "클립보드 읽기 권한이 허용되지 않았습니다. 키보드로 Ctrl+V 를 눌러 붙여넣어 주세요!",
            "wf_thumb_searching": "⏳ 찾는 중...",
            "wf_thumb_saving": "⏳ 저장 중...",
            "wf_thumb_canvas_load_failed": "캔버스 이미지를 불러오지 못했습니다.",
            "wf_thumb_canvas_none": "캔버스 또는 히스토리에 최근 생성된 이미지가 없습니다.",

            // --- Save As 폴더 지정 저장 ---
            "wf_saveas_title": "💾 다른 이름으로 저장 (폴더 지정)",
            "wf_saveas_folder": "📁 저장할 폴더",
            "wf_saveas_root": "최상위 (Root)",
            "wf_trash_folder": "휴지통",
            "wf_saveas_name": "📄 파일 이름",
            "wf_saveas_name_required": "파일 이름을 입력해 주세요.",
            "wf_saveas_path": "저장 위치",
            "wf_saveas_exists": "(같은 이름의 파일이 이미 있습니다 - 덮어쓰기 확인창이 표시됩니다)",
            "wf_saveas_confirm": "저장",
            "wf_saveas_new_folder": "➕ 새 폴더",
            "wf_saveas_new_folder_ph": "새 폴더 이름",
            "wf_saveas_new_folder_btn": "생성",
            "wf_saveas_new_folder_done": "'{folder}' 폴더를 생성했습니다.",
            "wf_saveas_selected": "선택한 폴더",
            "wf_saveas_tree_hint": "클릭 = 선택 · ▶/▼ 또는 더블클릭 = 펼치기 · 방향키로 이동",


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
            "rp_final_preview": "최종 프롬프트 미리보기",

            // --- Bada Google Translator ---
            "trans_node_title": "⚓ Bada Google Translator",
            "trans_label_text": "번역할 원문 텍스트",
            "trans_label_from": "출발 언어 (from_lang)",
            "trans_label_to": "도착 언어 (to_lang)",
            "trans_label_quotes": "따옴표 원문 보존 (preserve_quotes)",
            "trans_tip_quotes": "True 시 큰따옴표(\" \") 안의 내용은 번역하지 않고 원문 그대로 유지합니다.",

            // --- Global Presets Overview Modal ---
            "presets_overview_title": "글로벌 프리셋 전체 현황 및 관리자",
            "presets_overview_subtitle": "ComfyUI 전역에 저장된 모든 노드별 프리셋을 한눈에 확인하고 관리합니다",
            "presets_overview_total_label": "🎯 총 등록된 프리셋:",
            "presets_overview_node_types_label": "🧩 등록된 노드 종류:",
            "presets_overview_shared_note": "※ 모든 워크플로우에서 공유됨",
            "presets_overview_empty_title": "저장된 글로벌 프리셋이 없습니다",
            "presets_overview_empty_hint": "💡 캔버스에서 원하는 노드를 우클릭 후 <b>[현재 세팅 글로벌 프리셋으로 저장...]</b>을 누르면 이곳에 등록됩니다.",
            "presets_overview_count_one": "{n}개 프리셋",
            "presets_overview_count_many": "{n}개 프리셋",
            "presets_overview_backup_all": "📤 전체 프리셋 백업 (JSON)",
            "presets_overview_import": "📥 프리셋 불러오기",
            "presets_overview_close": "✕ 닫기",
            "presets_overview_export_done": "📤 백업 파일 다운로드 완료",
            "presets_overview_backup_all_done": "📤 전체 백업 파일 다운로드 완료",
            "presets_overview_import_done": "📥 글로벌 프리셋 불러오기 완료",
            "presets_overview_import_merged_done": "📥 글로벌 프리셋 불러오기 완료",
            "presets_overview_json_error": "⚠️ JSON 파일 형식 오류: ",

            // --- Missing Node Detective Modal ---
            "detective_title": "바다 미싱 노드 탐정 & 깃허브 해결사",
            "detective_real_class": "진짜 노드 이름 (Type)",
            "detective_copy": "복사",
            "detective_display_title": "표시된 이름 (Title)",
            "detective_searching": "ComfyUI 매니저 데이터베이스에서 저장소 조회 중...",
            "detective_slots_guide": "원래 연결 슬롯 정보 (대체 노드 교체 가이드)",
            "detective_close": "닫기",
            "detective_copy_type_toast": "진짜 노드 이름(Type)이 복사되었습니다!",
            "detective_registered": "ComfyUI 매니저 공식 등록 노드 확인!",
            "detective_priority_manager": "1순위: 매니저 설치 권장",
            "detective_priority_install": "1순위 추천: ComfyUI 매니저로 설치",
            "detective_install_oneclick": "ComfyUI 매니저로 설치 (원클릭)",
            "detective_open_manager": "매니저 창에서 보기",
            "detective_confirm_install": "📦 [ComfyUI 매니저 연동 설치]\n\n'{packTitle}' 커스텀 노드를 ComfyUI에 설치하시겠습니까?\n\n저장소: {repoUrl}",
            "detective_alt_options": "보조 수동 옵션 (2순위 깃허브 / 3순위 구글)",
            "detective_open_github": "GitHub 저장소 열기 (2순위)",
            "detective_google_search": "Google 검색 (3순위)",
            "detective_copy_clone": "Git Clone 복사",
            "detective_clone_copied": "git clone 명령어가 복사되었습니다!",
            "detective_installing": "설치 진행 중... (Git clone & pip 패키지)",
            "detective_cloning": "저장소를 다운로드하고 필요한 파이썬 패키지(requirements.txt)를 설치하고 있습니다...",
            "detective_installed_done": "'{packTitle}' 설치가 완료되었습니다!",
            "detective_restart_hint": "ComfyUI 서버를 재시작하시면 워크플로우에서 이 노드를 즉시 사용하실 수 있습니다.",
            "detective_restart_now": "ComfyUI 지금 재시작",
            "detective_restart_toast": "🔄 ComfyUI 서버 재시작 중... 잠시 후 새로고침 됩니다.",
            "detective_retry_install": "ComfyUI 매니저로 다시 설치",
            "detective_install_failed": "설치 실패",
            "detective_unindexed": "ComfyUI 매니저 미등록 노드 (독립 커스텀 노드)",
            "detective_priority_google": "1순위: Google & GitHub 검색",
            "detective_not_indexed_body": "이 노드는 ComfyUI 매니저 공식 DB에 등록되어 있지 않은 개인/독립 노드입니다.<br>아래 <b>1순위 Google 검색</b> 및 <b>2순위 GitHub 코드 검색</b>을 누르면 원작자 저장소를 즉시 찾으실 수 있습니다.",
            "detective_google_priority": "1순위 추천: Google에서 저장소 찾기 ⭐",
            "detective_google_best": "Google에서 저장소 검색 (1순위 추천)",
            "detective_priority2": "2순위: GitHub 직접 검색",
            "detective_gh_code": "GitHub 코드 정확 일치 검색",
            "detective_gh_repos": "GitHub 저장소 검색",
            "detective_copy_name": "노드 이름 복사",
            "detective_github_tip": "💡 <b>GitHub 코드 검색 팁</b>: 검색 결과 창에서 각 소스 파일 상단에 파란색으로 표시되는 <b>'작성자/저장소명'</b>(예: AlnVFX/ComfyUI-SeedVR2_VideoUpscaler)을 클릭하시면 해당 노드의 원작자 메인 저장소로 바로 이동합니다.",

            // --- Settings v2: Global Presets row + Cloud Sync row ---
            "cloud_title": "☁️ 클라우드 동기화 (Google Drive)",
            "cloud_desc": "컴피유아이 워크플로우와 설정을 구글 드라이브와 자동으로 동기화합니다.",
            "cloud_master_title": "마스터 동기화 ON/OFF",
            "cloud_opt_startup": "시작 시 자동 동기화",
            "cloud_opt_realtime": "실시간 변경 시 자동 동기화",
            "cloud_status_idle": "⏸️ Google Drive 연동 대기",
            "cloud_status_ok": "✅ Google Drive 연동됨",
            "cloud_status_no_libs": "⚠️ google-api-python-client 설치 필요",
            "cloud_status_no_creds": "⚠️ credentials.json 없음",
            "cloud_status_auth": "🔑 인증 필요",
            "cloud_sync_now": "☁️ 지금 동기화",
            "cloud_syncing": "⏳ 동기화 중… (누르면 중단)",
            "cloud_cancelling": "⏳ 중단 중…",
            "cloud_detail_btn": "🔍 동기화 상세 보기",
            "cloud_pro_title": "👑 Bada PRO",
            "cloud_pro_guide_btn": "📄 발급",
            "cloud_pro_guide_tip": "발급 방법 안내 열기 (새 탭)",
            "cloud_pro_hint": "원하는 파일·폴더와 제미나이 채팅 기록을 <b style=\"color:#fbbf24\">무료로</b>, 용량에 상관없이 동기화하세요<br>발급받은 JSON 파일을 드래그&드롭하면 PRO가 활성화됩니다",
            "cloud_pro_pick_file": "📎 파일 선택",
            "cloud_pro_active": "👑 Bada PRO 활성화됨 ✓ · 무제한 용량",
            "cloud_pro_err_not_cred": "⚠️ PRO 자격증명이 아닙니다 (client_id 없음)",
            "cloud_pro_err_invalid": "⚠️ 올바른 JSON 자격증명 파일이 아닙니다",
            "cloud_pro_err_same_basic": "⚠️ 기본(BASIC) 자격증명과 동일합니다 — PRO 전용 파일을 올려주세요",
            "settings_v2_save_apply": "저장 및 노드에 반영",
            "settings_v2_dup": "중복: {names}",
            "settings_v2_conflict_blacklist": "\"{name}\"는 추가에도 있음 — 제외 우선",
            "settings_v2_conflict_whitelist": "\"{name}\"는 제외에도 있음 — 제외 우선",
            "settings_v2_presets_empty": "저장된 글로벌 프리셋이 없습니다",
            "settings_v2_presets_export": "📤 전체 백업 (JSON)",
            "settings_v2_presets_import": "📥 불러오기",
            "settings_v2_presets_open": "🌐 프리셋 관리자 열기",
            "settings_v2_request_failed": "⚠️ 요청 실패: {err}",
            "settings_v2_syncing": "⏳ 동기화 중 {frac}{cur}",
            "cloud_status_preparing": "⏳ 동기화 준비 중…",
            "cloud_last_sync": "☁️ 마지막 동기화 {when} (↑{up} ↓{down})",
            "cloud_cancel_requested": "⏳ 중단 요청… 진행 중인 파일까지만 마무리하고 멈춥니다.",
            "cloud_no_sync_running": "ℹ️ 진행 중인 동기화가 없습니다.",
            "cloud_cancel_failed": "❌ 중단 요청 실패: {err}",
            "cloud_cancelled": "동기화가 중단되었습니다.",
            "cloud_trash_cleaned": " · 정리(휴지통): 로컬 {local}, 드라이브 {remote}",
            "cloud_sync_done": "✅ 동기화 완료 (업로드 {up} · 다운로드 {down}{extra})",
            "cloud_failed": "실패",
            "cloud_request_failed": "❌ 요청 실패: {err}"
        }
    },

    /**
     * Get Bada Custom Node Language Setting
     * Strictly independent from ComfyUI native locale (Comfy.Locale has 0 effect)
     */
    getBadaLanguage(appInstance) {
        try {
            // 1) Direct BADA localStorage setting
            const direct = localStorage.getItem("BadaUtils_Language") || localStorage.getItem("BadaUtils.Language");
            if (direct === "ko" || direct === "en") return direct;

            // 2) ComfyUI App Settings API lookup for BadaUtils.Language
            const theApp = appInstance || comfyApp || (typeof window !== "undefined" ? window.app : null);
            const settingVal = theApp?.ui?.settings?.getSettingValue?.("BadaUtils.Language") ??
                               theApp?.ui?.settings?.settings?.["BadaUtils.Language"]?.value ??
                               theApp?.ui?.settings?.settingsValues?.["BadaUtils.Language"];
            if (settingVal) {
                const s = (typeof settingVal === "object" && settingVal.value) ? settingVal.value : String(settingVal);
                if (s === "ko" || s === "en") {
                    try {
                        localStorage.setItem("BadaUtils_Language", s);
                        localStorage.setItem("BadaUtils.Language", s);
                    } catch (e) { console.debug("[Bada] ignored:", e); }
                    return s;
                }
            }

            // 3) ComfyUI settings localStorage entry
            const comfySetting = localStorage.getItem("Comfy.Settings.BadaUtils.Language");
            if (comfySetting) {
                const s = String(comfySetting).replace(/"/g, "").trim().toLowerCase();
                if (s === "ko" || s === "en") return s;
            }
        } catch (e) { console.debug("[Bada] ignored:", e); }

        // Default to "en" (English First for ComfyUI Manager / Registry Compliance)
        return "en";
    },

    init(appInstance) {
        const newLang = this.getBadaLanguage(appInstance);
        if (newLang && newLang !== this._lang) {
            this._lang = newLang;
            this.notifyListeners();
        } else if (!this._lang) {
            this._lang = newLang;
        }
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
                    const theApp = comfyApp || (typeof window !== "undefined" ? window.app : null);
                    if (theApp?.ui?.settings?.getSettingValue?.("BadaUtils.Language") !== lang) {
                        theApp?.ui?.settings?.setSettingValue?.("BadaUtils.Language", lang);
                    }
                }
            } catch (e) { console.debug("[Bada] ignored:", e); }
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

// Immediate background auto-sync from ComfyUI /settings backend
(async function autoSyncServerSettings() {
    try {
        const res = await fetch("/settings");
        if (res.ok) {
            const settings = await res.json();
            const lang = settings?.["BadaUtils.Language"];
            if (lang === "ko" || lang === "en") {
                try {
                    localStorage.setItem("BadaUtils_Language", lang);
                    localStorage.setItem("BadaUtils.Language", lang);
                } catch (e) { console.debug("[Bada] ignored:", e); }
                if (BadaI18n._lang !== lang) {
                    BadaI18n.setLanguage(lang, false);
                }
            }
        }
    } catch (e) { console.debug("[Bada] ignored:", e); }
})();

window.BadaI18n = BadaI18n;


