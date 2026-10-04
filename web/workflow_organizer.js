/**
 * ComfyUI-QoL-Utils: Dedicated 'Workflows+' Tab & Advanced Workflow Explorer
 * 
 * Features & Polish:
 * 1. Flawless Drag & Drop moving (Folder highlight, auto-expand, smooth drop, Root dropzone).
 * 2. Real-time auto-sync on 'Save As', 'Save', Rename, Delete.
 * 3. Single-column vertical layout (Tabs on top, Content underneath taking 100% width).
 * 4. ComfyUI native sidebar collapse/expand works 100% normally.
 * 5. Workflows load cleanly and instantly via app.loadGraphData.
 * 6. Native ComfyUI 'Workflows' tab is 100% untouched when active.
 * 7. Last active tab is remembered in localStorage.
 * 8. Empty folders unconditionally displayed with count '0' badge.
 * 9. Active workflow auto-focus & high-visibility tracking.
 */

import { app } from "../../scripts/app.js";
import { BadaI18n } from "./bada_i18n.js";
import { escapeHtml, placePopupInViewport } from "./bada_shared.js";

const FONT_SIZE_PRESETS = [
    { label: "작게 (A⁻ - 13px)", label_ko: "작게 (A⁻ - 13px)", label_en: "Small (A⁻ - 13px)", icon: "A⁻", name: "compact", fontSize: "13px", folderHeight: "28px", fileHeight: "27px", folderIcon: "14.5px", fileIcon: "13.5px", badgeFont: "11px", badgeHeight: "17px", chevron: "10px" },
    { label: "보통 (A - 14.5px)", label_ko: "보통 (A - 14.5px)", label_en: "Medium (A - 14.5px)", icon: "A", name: "standard", fontSize: "14.5px", folderHeight: "31px", fileHeight: "30px", folderIcon: "16px", fileIcon: "15px", badgeFont: "11.5px", badgeHeight: "19px", chevron: "11px" },
    { label: "크게 (A⁺ - 16px)", label_ko: "크게 (A⁺ - 16px)", label_en: "Large (A⁺ - 16px)", icon: "A⁺", name: "large", fontSize: "16px", folderHeight: "34px", fileHeight: "33px", folderIcon: "17.5px", fileIcon: "16.5px", badgeFont: "12px", badgeHeight: "20px", chevron: "12px" },
    { label: "아주 크게 (A⁺⁺ - 18px)", label_ko: "아주 크게 (A⁺⁺ - 18px)", label_en: "Extra Large (A⁺⁺ - 18px)", icon: "A⁺⁺", name: "xlarge", fontSize: "18px", folderHeight: "38px", fileHeight: "37px", folderIcon: "19.5px", fileIcon: "18.5px", badgeFont: "13px", badgeHeight: "22px", chevron: "13px" }
];

function getPresetLabel(preset) {
    if (!preset) return "";
    return BadaI18n.lang === "ko" ? (preset.label_ko || preset.label) : (preset.label_en || preset.label);
}

/**
 * Viewport clamping for this file's popups now lives in bada_shared.js as
 * placePopupInViewport(), shared with smart_presets.js. It used to be a local copy with its own
 * constants; one shared helper is the point — see that function's header for the four popups
 * that were each guessing a different (wrong) size.
 */
function placeMenuInViewport(menu, anchorX, anchorY) {
    return placePopupInViewport(menu, anchorX, anchorY, 8);
}


class WorkflowsPlusManager {
    constructor() {
        this.treeData = null;
        this.expandedFolders = new Set();
        this.searchQuery = "";
        this.fontSizeIndex = parseInt(localStorage.getItem("qol_workflows_font_size_idx") ?? "1", 10);
        if (isNaN(this.fontSizeIndex) || this.fontSizeIndex < 0 || this.fontSizeIndex >= FONT_SIZE_PRESETS.length) {
            this.fontSizeIndex = 1;
        }
        this.highlightedItem = null;
        this.draggedItem = null;

        // Multi-select state. Keys are "<kind>:<normalised path>", e.g. "folder:A/B".
        this.selection = new Set();
        this.selectionAnchor = null;

        this.activeWorkflowPath = localStorage.getItem("qol_active_workflow_path") || "";
        this.activeWorkflowName = localStorage.getItem("qol_active_workflow_name") || "";

        this.contextTarget = null;
        this.mountedSidebar = null;
        this.plusPanel = null;

        // Favorites (즐겨찾기) State
        try {
            const rawFavs = localStorage.getItem("qol_workflows_favorites");
            this.favorites = new Set(rawFavs ? JSON.parse(rawFavs) : []);
        } catch (e) {
            this.favorites = new Set();
        }
        this.favoritesExpanded = localStorage.getItem("qol_workflows_fav_expanded") !== "false";

        // Custom Mouse Pointer Drag & Auto-Scroll State
        this.isCustomDragging = false;
        this.draggedPath = null;
        this.draggedName = null;
        this.dragGhostEl = null;
        this.scrollAnimId = null;
        this.lastMouseY = null;
        this.justFinishedDrag = false;
        this.hoverExpandTimer = null;
        this.hoveredFolder = null;

        // Floating hover preview state
        this.hoverCardEl = null;
        this.hoverTimer = null;
        this.hoverTargetFile = null;

        window.__BADA_WORKFLOW_ORGANIZER_INSTANCE__ = this;
        window.__BADA_SYNC_SIDEBAR_STATE__ = (val) => {
            this.syncSidebarStateWithSetting(val);
        };
    }

    async init() {
        this.injectStyles();
        this.setupContextMenu();
        this.setupHoverPreviewCard();
        this.registerSidebarTab();
        this.cleanNativeTooltipsAndKeybindings();
        this.setupAutoSyncOnSave();
        this.setupSaveAsFolderPicker();
        this.setupMultiSelect();

        await this.loadFavorites();
        await this.loadTree();
        console.log("[BadaUtils] Workflows+ Manager initialized cleanly.");
    }

    injectStyles() {
        let style = document.getElementById("qol-workflows-plus-styles");
        if (!style) {
            style = document.createElement("style");
            style.id = "qol-workflows-plus-styles";
            document.head.appendChild(style);
        }
        style.textContent = `
            /* Bada Custom Blue Workflow Icon for Sidebar Tab */
            .bada-tab-icon-workflow,
            .bada-tab-icon-wave,
            .bada-tab-icon-anchor {
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                font-style: normal !important;
                width: 1.25rem !important;
                height: 1.25rem !important;
                line-height: 1 !important;
                background-repeat: no-repeat !important;
                background-position: center !important;
                background-size: contain !important;
                background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' width='16' height='16'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%2338bdf8'/%3E%3Cstop offset='100%25' stop-color='%2300f0ff'/%3E%3C/linearGradient%3E%3Cfilter id='glow' x='-20%25' y='-20%25' width='140%25' height='140%25'%3E%3CfeDropShadow dx='0' dy='0' stdDeviation='0.45' flood-color='%2300f0ff' flood-opacity='0.85'/%3E%3C/filter%3E%3C/defs%3E%3Cpath fill='none' stroke='url(%23g)' stroke-linecap='round' stroke-width='1.35' filter='url(%23glow)' d='M9.186 3.1H6.814m2.372 9.8H7.553C4.466 12.9 2.2 9.904 2.95 6.812l.305-1.262M14.75 2.172l-.594 2.45a1.194 1.194 0 01-1.15.928h-2.3c-.771 0-1.338-.749-1.15-1.522l.593-2.45a1.194 1.194 0 011.15-.928h2.3c.771 0 1.338.749 1.15 1.522Zm-8.304 0-.593 2.45a1.194 1.194 0 01-1.15.928h-2.3c-.772 0-1.338-.749-1.15-1.522l.592-2.45A1.194 1.194 0 012.995.65h2.3c.771 0 1.337.749 1.15 1.522Zm8.304 9.8-.594 2.45a1.194 1.194 0 01-1.15.928h-2.3c-.771 0-1.338-.749-1.15-1.522l.593-2.45a1.194 1.194 0 011.15-.928h2.3c.771 0 1.338.749 1.15 1.522Z'/%3E%3C/svg%3E") !important;
                transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), filter 0.18s ease !important;
            }
            .bada-tab-icon-workflow::before,
            .bada-tab-icon-wave::before,
            .bada-tab-icon-anchor::before {
                content: '' !important;
                display: none !important;
            }

            /* Hover & Active Micro-animations for Bada Workflow button */
            [data-testid="bada-workflows-plus-tab-button"]:hover .bada-tab-icon-workflow,
            [data-testid="bada-workflows-plus-tab-button"]:hover .bada-tab-icon-wave {
                transform: scale(1.15) !important;
                filter: drop-shadow(0 0 6px rgba(0, 229, 255, 0.95)) !important;
            }

            /* Clean Native Icon-Only Sidebar (Controlled by BadaUtils.CompactSidebar) */
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
            body.bada-compact-sidebar [data-testid="bada-workflows-plus-tab-button"] .side-bar-button-label {
                display: none !important;
            }

            /* Toggle State: When Bada Sidebar Organizer is ACTIVE (Setting ON):
               Hide the native ComfyUI workflow button and display only the Bada blue workflow button */
            body.bada-sidebar-organizer-active [data-testid="workflows-tab-button"],
            body.bada-sidebar-organizer-active button[aria-label="Workflows"]:not([data-testid="bada-workflows-plus-tab-button"]),
            body.bada-sidebar-organizer-active button[aria-label="워크플로우"]:not([data-testid="bada-workflows-plus-tab-button"]) {
                display: none !important;
            }
            body.bada-sidebar-organizer-active [data-testid="bada-workflows-plus-tab-button"] {
                display: inline-flex !important;
            }

            /* Toggle State: When Bada Sidebar Organizer is INACTIVE (Setting OFF):
               Show the native ComfyUI workflow button and hide Bada blue workflow button */
            body:not(.bada-sidebar-organizer-active) [data-testid="workflows-tab-button"],
            body.bada-sidebar-organizer-disabled [data-testid="workflows-tab-button"],
            body:not(.bada-sidebar-organizer-active) button[aria-label="Workflows"]:not([data-testid="bada-workflows-plus-tab-button"]),
            body.bada-sidebar-organizer-disabled button[aria-label="Workflows"]:not([data-testid="bada-workflows-plus-tab-button"]),
            body:not(.bada-sidebar-organizer-active) button[aria-label="워크플로우"]:not([data-testid="bada-workflows-plus-tab-button"]),
            body.bada-sidebar-organizer-disabled button[aria-label="워크플로우"]:not([data-testid="bada-workflows-plus-tab-button"]) {
                display: inline-flex !important;
            }
            body:not(.bada-sidebar-organizer-active) [data-testid="bada-workflows-plus-tab-button"],
            body.bada-sidebar-organizer-disabled [data-testid="bada-workflows-plus-tab-button"] {
                display: none !important;
            }

            /* Workflows+ Main Container with Dynamic Typography Variables */
            .qol-plus-panel {
                --qol-font-size: 14.5px;
                --qol-folder-height: 31px;
                --qol-file-height: 30px;
                --qol-folder-icon-size: 16px;
                --qol-file-icon-size: 15px;
                --qol-badge-font-size: 11.5px;
                --qol-badge-height: 19px;
                --qol-chevron-size: 11px;

                display: flex;
                flex-direction: column;
                flex: 1;
                width: 100% !important;
                height: 100% !important;
                min-height: 0;
                overflow: hidden;
                color: #e4e4e7;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                font-size: var(--qol-font-size);
                box-sizing: border-box;
                padding-top: 8px;
            }

            /* Compact 1-Line Toolbar */
            .qol-toolbar {
                display: flex;
                align-items: center;
                gap: 5px;
                padding: 0 8px 8px 8px;
                flex-shrink: 0;
            }
            .qol-search-wrapper {
                flex: 1;
                position: relative;
                display: flex;
                align-items: center;
            }
            .qol-search-input {
                width: 100%;
                background: #18181b;
                border: 1px solid #3f3f46;
                border-radius: 6px;
                padding: 5px 26px 5px 28px;
                color: #ffffff;
                font-size: 13px;
                outline: none;
                height: 30px;
                box-sizing: border-box;
                transition: border-color 0.15s ease;
            }
            .qol-search-input:focus {
                border-color: #6366f1;
            }
            .qol-search-icon {
                position: absolute;
                left: 8px;
                font-size: 13px;
                color: #71717a;
                pointer-events: none;
            }
            .qol-search-clear {
                position: absolute;
                right: 8px;
                font-size: 14px;
                color: #71717a;
                cursor: pointer;
                display: none;
            }
            .qol-search-clear:hover {
                color: #fff;
            }

            .qol-icon-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                background: #27272a;
                border: 1px solid #3f3f46;
                border-radius: 6px;
                width: 30px;
                height: 30px;
                color: #d4d4d8;
                cursor: pointer;
                transition: all 0.12s ease;
                font-size: 13px;
                padding: 0;
                flex-shrink: 0;
            }
            .qol-icon-btn:hover {
                background: #3f3f46;
                color: #ffffff;
                border-color: #6366f1;
            }
            .qol-icon-btn.has-active {
                border-color: #818cf8;
                color: #a5b4fc;
            }

            /* Root Drop Zone: Only visible during drag */
            .qol-root-dropzone {
                display: none;
                align-items: center;
                justify-content: center;
                gap: 6px;
                margin: 0 8px 8px 8px;
                padding: 9px;
                background: rgba(99, 102, 241, 0.15);
                border: 1.5px dashed #818cf8;
                border-radius: 6px;
                color: #c7d2fe;
                font-size: 12.5px;
                font-weight: 500;
                flex-shrink: 0;
            }
            .qol-root-dropzone * {
                pointer-events: none;
            }
            .qol-root-dropzone.visible {
                display: flex !important;
            }
            .qol-root-dropzone.dragover {
                background: rgba(99, 102, 241, 0.35) !important;
                border-color: #a5b4fc !important;
                color: #ffffff !important;
            }

            /* Tree List */
            .qol-tree-scroll {
                flex: 1;
                overflow-y: auto;
                overflow-x: hidden;
                padding: 0 4px 16px 4px;
            }
            .qol-tree-scroll::-webkit-scrollbar {
                width: 5px;
            }
            .qol-tree-scroll::-webkit-scrollbar-thumb {
                background: #3f3f46;
                border-radius: 3px;
            }

            .qol-tree-node {
                display: flex;
                flex-direction: column;
                user-select: none;
            }

            /* Folder Row */
            .qol-folder-row {
                display: flex;
                align-items: flex-start;
                gap: 7px;
                padding: 4px 8px;
                border-radius: 5px;
                cursor: pointer;
                transition: background 0.1s ease;
                margin: 1px 0;
                position: relative;
                min-height: var(--qol-folder-height);
                box-sizing: border-box;
            }
            .qol-folder-row * {
                pointer-events: none;
            }
            .qol-folder-row:hover {
                background: rgba(255, 255, 255, 0.06);
            }
            .qol-folder-row.dragover {
                background: rgba(99, 102, 241, 0.25) !important;
                outline: 1.5px solid #818cf8 !important;
                border-radius: 5px !important;
            }
            /* Folders are draggable into other folders: grab cursor, like the file rows. */
            .qol-folder-row:not(.dragover) {
                cursor: grab;
            }
            .qol-folder-row:active {
                cursor: grabbing;
            }
            .qol-folder-row.dragging {
                opacity: 0.4;
            }
            /* Multi-select styling lives just above the Active Workflow block — see there. */
            /* A row that is being dragged as part of a multi-selection. */
            .qol-folder-row.qol-multi-dragging,
            .qol-file-row.qol-multi-dragging {
                opacity: 0.4;
            }
            /* Refused drop target: a folder dropped into itself or one of its own children. */
            .qol-folder-row.dragover.drag-invalid,
            .qol-children-container.dragover.drag-invalid,
            #qol-root-dropzone.dragover.drag-invalid {
                background: rgba(239, 68, 68, 0.22) !important;
                outline: 1.5px solid #ef4444 !important;
                cursor: no-drop;
            }

            .qol-chevron {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 16px;
                height: 16px;
                font-size: var(--qol-chevron-size);
                color: #71717a;
                transition: transform 0.12s ease;
                flex-shrink: 0;
                margin-top: 3px;
            }
            .qol-chevron.expanded {
                transform: rotate(90deg);
                color: #a1a1aa;
            }

            .qol-folder-icon {
                font-size: var(--qol-folder-icon-size);
                flex-shrink: 0;
                margin-top: 2px;
            }
            .qol-folder-name {
                flex: 1;
                font-size: var(--qol-font-size);
                font-weight: 500;
                color: #f4f4f5;
                white-space: normal;
                word-break: break-word;
                overflow-wrap: anywhere;
                line-height: 1.35;
                letter-spacing: -0.2px;
            }
            .qol-count-badge {
                font-size: var(--qol-badge-font-size);
                font-weight: 500;
                padding: 0 7px;
                border-radius: 9999px;
                background: #27272a;
                color: #a1a1aa;
                border: 1px solid #3f3f46;
                margin-left: auto;
                line-height: var(--qol-badge-height);
                flex-shrink: 0;
                align-self: flex-start;
                margin-top: 2px;
            }
            .qol-count-badge.zero {
                opacity: 0.55;
                border-color: #27272a;
            }

            /* Workflow File Row */
            .qol-file-row {
                display: flex;
                align-items: flex-start;
                gap: 7px;
                padding: 4px 8px 4px 26px;
                border-radius: 5px;
                cursor: grab;
                transition: background 0.1s ease, color 0.1s ease;
                margin: 1px 0;
                min-height: var(--qol-file-height);
                box-sizing: border-box;
                position: relative;
            }
            .qol-file-row:active {
                cursor: grabbing;
            }
            .qol-file-row:hover {
                background: rgba(99, 102, 241, 0.15);
                color: #ffffff;
            }
            .qol-file-row.dragging {
                opacity: 0.4;
                background: rgba(255, 255, 255, 0.05);
            }
            .qol-file-row.drag-insert-top::before {
                content: '';
                position: absolute;
                top: -1px;
                left: 20px;
                right: 0;
                height: 2px;
                background: #6366f1;
                border-radius: 2px;
                z-index: 10;
                box-shadow: 0 0 4px #6366f1;
            }
            .qol-file-row.drag-insert-bottom::after {
                content: '';
                position: absolute;
                bottom: -1px;
                left: 20px;
                right: 0;
                height: 2px;
                background: #6366f1;
                border-radius: 2px;
                z-index: 10;
                box-shadow: 0 0 4px #6366f1;
            }
            .qol-file-icon {
                font-size: var(--qol-file-icon-size);
                color: #93c5fd;
                flex-shrink: 0;
                pointer-events: none;
                margin-top: 2px;
            }
            .qol-file-name {
                flex: 1;
                min-width: 0;
                font-size: var(--qol-font-size);
                color: #e4e4e7;
                white-space: normal;
                word-break: break-word;
                overflow-wrap: anywhere;
                line-height: 1.35;
                letter-spacing: -0.2px;
                pointer-events: none;
                margin-right: 6px;
            }

            /* Badges Container: Align all status and metadata chips on single horizontal baseline */
            .qol-file-badges {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                margin-left: auto;
                flex-shrink: 0;
                align-self: flex-start;
                margin-top: 1px;
            }

            /* Multi-select (Ctrl / Shift + click)
             *
             * Deliberately NEUTRAL, and deliberately placed here:
             *   - after the .qol-file-row:hover rule  -> a selected row keeps its own look on hover
             *   - before the .active-workflow rule   -> the "you are here" highlight always wins
             * It must never be confused with the active workflow, so: no indigo, no
             * gradient, no bold, no white text — just a flat zinc wash and a slim grey bar.
             * NOTE: never use backticks in this comment — it lives inside a JS template
             * literal, and a stray one would terminate it and break injectStyles(). */
            .qol-folder-row.qol-selected,
            .qol-file-row.qol-selected {
                background: rgba(63, 63, 70, 0.55) !important;
                box-shadow: inset 3px 0 0 rgba(161, 161, 170, 0.75) !important;
                border-radius: 5px;
            }
            .qol-folder-row.qol-selected:hover,
            .qol-file-row.qol-selected:hover {
                background: rgba(82, 82, 91, 0.6) !important;
            }
            .qol-folder-row.qol-selected .qol-folder-name,
            .qol-file-row.qol-selected .qol-file-name {
                color: #d4d4d8;
            }
            .qol-folder-row.qol-selected .qol-count-badge,
            .qol-file-row.qol-selected .qol-file-icon {
                opacity: 0.8;
            }

            /* Active Workflow Highlight */
            .qol-file-row.active-workflow {
                background: linear-gradient(90deg, rgba(99, 102, 241, 0.28) 0%, rgba(79, 70, 229, 0.14) 100%) !important;
                border-left: 3.5px solid #818cf8 !important;
                padding-left: 22.5px !important;
                font-weight: 600 !important;
                color: #ffffff !important;
                box-shadow: inset 0 0 0 1px rgba(129, 140, 248, 0.3) !important;
            }
            .qol-file-row.qol-bookmark-row.active-workflow {
                padding-left: 5px !important;
            }
            .qol-file-row.active-workflow .qol-file-name {
                color: #ffffff !important;
                font-weight: 600 !important;
            }
            .qol-file-row.active-workflow .qol-file-icon {
                color: #c7d2fe !important;
            }
            .qol-active-tag {
                font-size: 10px;
                font-weight: 600;
                height: 18px;
                padding: 0 6px;
                border-radius: 4px;
                background: rgba(79, 70, 229, 0.4);
                color: #e0e7ff;
                border: 1px solid rgba(129, 140, 248, 0.55);
                display: inline-flex;
                align-items: center;
                line-height: 18px;
                box-sizing: border-box;
                white-space: nowrap;
                pointer-events: none;
                flex-shrink: 0;
            }

            .qol-badge-chip {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 20px;
                height: 18px;
                padding: 0 4px;
                border-radius: 4px;
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.14);
                font-size: 11px;
                line-height: 1;
                color: #e4e4e7;
                cursor: pointer;
                transition: all 0.12s ease;
                user-select: none;
                box-sizing: border-box;
                flex-shrink: 0;
            }
            .qol-badge-chip:hover {
                background: rgba(99, 102, 241, 0.35);
                border-color: #818cf8;
                transform: scale(1.1);
            }

            /* Success Pulse */
            @keyframes qolPulseGreen {
                0% { background: rgba(34, 197, 94, 0.5); outline: 2px solid #22c55e; }
                50% { background: rgba(34, 197, 94, 0.25); outline: 2px solid #4ade80; }
                100% { background: transparent; outline: 2px solid transparent; }
            }
            .qol-moved-success {
                animation: qolPulseGreen 2.2s ease-out !important;
                border-radius: 5px !important;
            }

            /* Search Keyword Highlight (Yellow Mark) */
            .qol-search-highlight {
                background: #facc15 !important;
                color: #000000 !important;
                font-weight: 700 !important;
                border-radius: 3px !important;
                padding: 0 3px !important;
                margin: 0 !important;
                text-shadow: none !important;
                display: inline !important;
                box-shadow: 0 0 3px rgba(250, 204, 21, 0.7) !important;
            }

            /* Section Headers (Bookmarks & Browse) matching native styling */
            .qol-section-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 10px 8px 6px 8px;
                font-size: 11.5px;
                font-weight: 600;
                color: #a1a1aa;
                text-transform: uppercase;
                letter-spacing: 0.6px;
                border-bottom: 1px dashed rgba(255, 255, 255, 0.12);
                margin: 4px 2px 6px 2px;
                user-select: none;
            }
            .qol-section-header.bookmarks-header {
                color: #fbbf24;
                margin-top: 2px;
            }
            .qol-section-header.browse-header {
                color: #94a3b8;
                margin-top: 10px;
            }
            .qol-section-header .qol-section-title {
                display: flex;
                align-items: center;
                gap: 5px;
            }
            .qol-section-header .qol-section-count {
                font-size: 11px;
                background: rgba(251, 191, 36, 0.18);
                color: #fef08a;
                border: 1px solid rgba(251, 191, 36, 0.38);
                padding: 0 6px;
                border-radius: 9999px;
                line-height: 16px;
                font-weight: 600;
            }

            /* Bookmarks Container & Rows */
            .qol-bookmarks-container {
                display: flex;
                flex-direction: column;
                margin-bottom: 2px;
            }
            .qol-bookmark-row {
                padding-left: 8px !important;
            }
            .qol-bookmark-row .qol-fav-star {
                opacity: 0.95 !important;
                color: #fbbf24 !important;
            }

            .qol-fav-star {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 20px;
                height: 18px;
                font-size: 12.5px;
                line-height: 1;
                color: #71717a;
                cursor: pointer;
                border-radius: 4px;
                transition: all 0.12s ease;
                opacity: 0;
                flex-shrink: 0;
                pointer-events: auto !important;
                user-select: none;
                box-sizing: border-box;
            }
            .qol-file-row:hover .qol-fav-star {
                opacity: 0.75;
            }
            .qol-fav-star:hover {
                transform: scale(1.2);
                color: #fbbf24 !important;
                opacity: 1 !important;
            }
            .qol-fav-star.is-fav {
                color: #fbbf24 !important;
                opacity: 1 !important;
                text-shadow: 0 0 6px rgba(251, 191, 36, 0.6);
            }

            /* Subtree Children Container */
            .qol-children-container {
                display: flex;
                flex-direction: column;
                margin-left: 12px;
                border-left: 1px solid #27272a;
                padding-left: 3px;
            }

            /* Context Menu */
            .qol-context-menu {
                position: fixed;
                z-index: 10000;
                background: #18181b;
                border: 1px solid #3f3f46;
                border-radius: 6px;
                box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.65);
                padding: 4px;
                min-width: 200px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 13px;
                color: #e4e4e7;
                display: none;
            }
            .qol-menu-item {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 7px 12px;
                border-radius: 4px;
                cursor: pointer;
                transition: background 0.1s ease;
                user-select: none;
            }
            .qol-menu-icon {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 18px;
                font-size: 14px;
                flex-shrink: 0;
            }
            .qol-menu-item:hover {
                background: #4f46e5;
                color: #ffffff;
            }
            .qol-menu-item.danger:hover {
                background: #ef4444;
                color: #ffffff;
            }
            .qol-menu-separator {
                height: 1px;
                background: #27272a;
                margin: 4px 0;
            }

            /* Modal Dialog */
            .qol-modal-overlay {
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0, 0, 0, 0.65);
                backdrop-filter: blur(3px);
                z-index: 10001;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .qol-modal-dialog {
                background: #18181b;
                border: 1px solid #3f3f46;
                border-radius: 10px;
                width: 420px;
                max-width: 90vw;
                box-shadow: 0 20px 35px -5px rgba(0, 0, 0, 0.7);
                overflow: hidden;
                color: #f4f4f5;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }
            .qol-modal-header {
                padding: 14px 16px;
                border-bottom: 1px solid #27272a;
                display: flex;
                align-items: center;
                justify-content: space-between;
                font-size: 14px;
                font-weight: 600;
            }
            .qol-modal-body {
                padding: 16px;
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            .qol-form-label {
                font-size: 11px;
                font-weight: 500;
                color: #a1a1aa;
                text-transform: uppercase;
            }
            .qol-select, .qol-input {
                background: #09090b;
                border: 1px solid #3f3f46;
                border-radius: 5px;
                color: #fff;
                padding: 8px 10px;
                font-size: 12px;
                outline: none;
                width: 100%;
                box-sizing: border-box;
            }
            .qol-select:focus, .qol-input:focus { border-color: #6366f1; }

            /* Windows Explorer-style folder tree (Save As picker) */
            .qol-sa-tree {
                height: 208px;
                overflow: auto;
                background: #09090b;
                border: 1px solid #3f3f46;
                border-radius: 6px;
                padding: 4px 0;
                font-size: 12.5px;
                outline: none;
            }
            .qol-sa-tree:focus { border-color: #6366f1; }
            .qol-sa-row {
                display: flex;
                align-items: center;
                gap: 6px;
                height: 24px;
                padding-right: 8px;
                cursor: default;
                color: #e4e4e7;
                white-space: nowrap;
                user-select: none;
            }
            .qol-sa-row:hover { background: #27272a; }
            .qol-sa-row.selected { background: #2563eb; color: #ffffff; }
            .qol-sa-chevron {
                flex: 0 0 12px;
                width: 12px;
                text-align: center;
                font-size: 9px;
                color: #a1a1aa;
                cursor: pointer;
            }
            .qol-sa-row.selected .qol-sa-chevron { color: #ffffff; }
            .qol-sa-chevron.empty { visibility: hidden; }
            .qol-sa-icon { flex: 0 0 auto; }
            .qol-sa-name { overflow: hidden; text-overflow: ellipsis; }
            .qol-sa-count { margin-left: auto; font-size: 10.5px; color: #71717a; }
            .qol-sa-row.selected .qol-sa-count { color: #dbeafe; }
            .qol-sa-breadcrumb {
                margin-top: 6px;
                font-size: 11.5px;
                color: #a1a1aa;
                display: flex;
                align-items: center;
                gap: 4px;
                flex-wrap: wrap;
                word-break: break-all;
            }
            .qol-sa-breadcrumb b { color: #f4f4f5; font-weight: 600; }
            .qol-sa-hint { margin-top: 4px; font-size: 11px; color: #71717a; }
            .qol-modal-footer {
                padding: 12px 16px;
                border-top: 1px solid #27272a;
                display: flex;
                justify-content: flex-end;
                gap: 8px;
                background: #121214;
            }
            .qol-btn {
                padding: 6px 14px;
                border-radius: 5px;
                font-size: 12px;
                font-weight: 500;
                cursor: pointer;
                border: none;
                transition: all 0.12s ease;
            }
            .qol-btn-cancel { background: #27272a; color: #d4d4d8; }
            .qol-btn-cancel:hover { background: #3f3f46; color: #fff; }
            .qol-btn-primary { background: #4f46e5; color: #fff; }
            .qol-btn-primary:hover { background: #4338ca; }
            .qol-btn-danger { background: #ef4444; color: #fff; }
            .qol-btn-danger:hover { background: #dc2626; }

            /* Drag Ghost Badge following mouse cursor */
            .qol-drag-ghost {
                position: fixed;
                z-index: 10005;
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 4px 12px;
                background: rgba(24, 24, 27, 0.9);
                backdrop-filter: blur(4px);
                border: 1px solid #4f46e5;
                border-radius: 4px;
                color: #e4e4e7;
                font-size: 12px;
                font-weight: 500;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
                pointer-events: none;
                user-select: none;
                transform: translate(12px, 15px);
                max-width: 250px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            /* Toast */
            .qol-toast {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 10002;
                background: #18181b;
                border: 1px solid #22c55e;
                color: #f0fdf4;
                padding: 8px 14px;
                border-radius: 6px;
                box-shadow: 0 10px 25px -5px rgba(0,0,0,0.6);
                font-size: 12px;
                display: flex;
                align-items: center;
                gap: 6px;
            }

            /* Floating Glassmorphism Workflow Hover Preview Card */
            .qol-workflow-hover-preview {
                position: fixed;
                z-index: 999999;
                width: 320px;
                max-width: 90vw;
                background: rgba(18, 18, 22, 0.96);
                backdrop-filter: blur(16px);
                -webkit-backdrop-filter: blur(16px);
                border: 1px solid rgba(0, 240, 255, 0.4);
                box-shadow: 0 12px 36px rgba(0, 0, 0, 0.7), 0 0 18px rgba(0, 240, 255, 0.2);
                border-radius: 12px;
                padding: 12px;
                display: none;
                flex-direction: column;
                gap: 10px;
                pointer-events: none;
                opacity: 0;
                transform: translateY(4px) scale(0.98);
                transition: opacity 0.16s ease-out, transform 0.16s cubic-bezier(0.16, 1, 0.3, 1);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                color: #e4e4e7;
            }

            .qol-workflow-hover-preview.visible {
                opacity: 1;
                transform: translateY(0) scale(1);
            }

            .qol-preview-thumb-box {
                width: 100%;
                max-height: 200px;
                min-height: 110px;
                background: #09090b;
                border-radius: 8px;
                overflow: hidden;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 1px solid rgba(255, 255, 255, 0.08);
            }

            .qol-preview-thumb-img {
                max-width: 100%;
                max-height: 200px;
                object-fit: contain;
                border-radius: 6px;
                display: block;
            }

            .qol-preview-thumb-empty {
                color: #71717a;
                font-size: 11px;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 6px;
                padding: 14px;
                text-align: center;
            }

            .qol-preview-title-row {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 6px;
            }

            .qol-preview-title {
                font-weight: 700;
                font-size: 13.5px;
                color: #f4f4f5;
                word-break: break-all;
                line-height: 1.35;
            }

            .qol-preview-path {
                font-size: 11px;
                color: #38bdf8;
                background: rgba(56, 189, 248, 0.12);
                padding: 2px 6px;
                border-radius: 4px;
                border: 1px solid rgba(56, 189, 248, 0.25);
                margin-top: 3px;
                word-break: break-all;
            }

            .qol-preview-notes-box {
                background: rgba(24, 24, 27, 0.8);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 8px;
                padding: 8px 10px;
                max-height: 140px;
                overflow-y: auto;
                font-size: 12px;
                line-height: 1.45;
                color: #d4d4d8;
                white-space: pre-wrap;
                word-break: break-word;
            }

            .qol-preview-notes-empty {
                font-style: italic;
                color: #71717a;
                font-size: 11px;
            }

            .qol-preview-footer {
                font-size: 10.5px;
                color: #71717a;
                text-align: right;
                border-top: 1px solid rgba(255, 255, 255, 0.08);
                padding-top: 6px;
                margin-top: -2px;
            }

            .qol-file-badge-indicator {
                font-size: 11.5px;
                opacity: 0.85;
                margin-left: 4px;
                margin-right: 2px;
                flex-shrink: 0;
                display: inline-flex;
                align-items: center;
                user-select: none;
            }
        `;
    }

    showToast(message, isError = false) {
        const toast = document.createElement("div");
        toast.className = "qol-toast";
        // Escape ONCE, here, rather than at the ~10 call sites: most of them forward
        // `data.error` straight from the REST API, and those messages embed user-controlled
        // text (`Source file not found: <path>`, `'<name>' already exists`, `Move failed: <OSError>`).
        // Without this, a workflow file whose name contains markup runs as HTML. Windows
        // forbids `<`/`>` in filenames, but Linux/macOS do not, and a shared workflow pack is
        // an untrusted source. No caller intentionally passes markup into showToast().
        const safeMessage = this.escapeHtml(message);
        if (isError) {
            toast.style.borderColor = "#ef4444";
            toast.style.color = "#fef2f2";
            toast.innerHTML = `<span>❌</span> <span>${safeMessage}</span>`;
        } else {
            toast.innerHTML = `<span>✨</span> <span>${safeMessage}</span>`;
        }
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transition = "opacity 0.25s ease";
            setTimeout(() => toast.remove(), 250);
        }, 2500);
    }

    startAutoScroll(treeScroll) {
        if (this.scrollAnimId) return;

        const checkScroll = () => {
            if (!this.isCustomDragging || this.lastMouseY === null || !treeScroll) {
                this.scrollAnimId = null;
                return;
            }

            const rect = treeScroll.getBoundingClientRect();
            const y = this.lastMouseY;
            const topThreshold = rect.top + 55;
            const bottomThreshold = rect.bottom - 55;

            if (y < topThreshold && y >= rect.top - 60) {
                // Near top edge of tree view: scroll UP
                const intensity = Math.min(1, Math.max(0.15, (topThreshold - y) / 55));
                const speed = Math.max(3, Math.round(intensity * 18));
                treeScroll.scrollTop -= speed;
                this.scrollAnimId = requestAnimationFrame(checkScroll);
            } else if (y > bottomThreshold && y <= rect.bottom + 60) {
                // Near bottom edge of tree view: scroll DOWN
                const intensity = Math.min(1, Math.max(0.15, (y - bottomThreshold) / 55));
                const speed = Math.max(3, Math.round(intensity * 18));
                treeScroll.scrollTop += speed;
                this.scrollAnimId = requestAnimationFrame(checkScroll);
            } else {
                this.scrollAnimId = null;
            }
        };

        this.scrollAnimId = requestAnimationFrame(checkScroll);
    }

    stopAutoScroll() {
        if (this.scrollAnimId) {
            cancelAnimationFrame(this.scrollAnimId);
            this.scrollAnimId = null;
        }
    }

    setupAutoSyncOnSave() {
        const self = this;

        // 1. Hook app.loadGraphData if available (instant response when opening workflows)
        try {
            const targetApp = app || window.app;
            if (targetApp && typeof targetApp.loadGraphData === "function" && !targetApp._qolHooked) {
                const origLoad = targetApp.loadGraphData;
                targetApp.loadGraphData = async function(...args) {
                    const res = await origLoad.apply(this, args);
                    try {
                        const targetPath = args[3] || args[0]?.extra?.title || args[0]?.name || "";
                        if (targetPath) {
                            self.setActiveWorkflow(targetPath, true);
                        } else {
                            setTimeout(() => self.detectActiveWorkflowFromUI(), 50);
                        }
                    } catch (e) { console.debug("[Bada] ignored:", e); }
                    return res;
                };
                targetApp._qolHooked = true;
            }
        } catch (e) { console.debug("[Bada] ignored:", e); }

        // 2. Instant Mousedown Interceptor on top workspace tabs (0ms response with auto-scroll)
        document.addEventListener("mousedown", (e) => {
            const topTab = e.target.closest(".comfyui-tab, .comfy-tab, [role='tab'], .p-tabview-nav li, .p-tabmenu-item");
            if (topTab) {
                const clone = topTab.cloneNode(true);
                clone.querySelectorAll("button, i, svg, .close, span[class*='close']").forEach(b => b.remove());
                const text = clone.textContent.trim();
                if (text && text !== "+" && text !== "×") {
                    self.setActiveWorkflow(text, true);
                }
            }
        }, true);

        // 3. Fast multi-stage verification on click
        document.addEventListener("click", (e) => {
            const topTab = e.target.closest(".comfyui-tab, .comfy-tab, [role='tab'], header button, .p-tabview-nav li, .p-tabmenu-item");
            if (topTab) {
                self.detectActiveWorkflowFromUI();
                setTimeout(() => self.detectActiveWorkflowFromUI(), 50);
                setTimeout(() => self.detectActiveWorkflowFromUI(), 180);
            }
        }, true);

        // Retries `fn` every `intervalMs` until it reports success, then stops for good.
        // Both probes below need a retry because ComfyUI's Vue app (and its pinia store)
        // may not exist yet when this extension boots — but they must not keep the tab awake
        // forever once the target shows up. Returns false immediately if the target is
        // already there, so a warm start never creates a timer at all.
        const retryUntilSatisfied = (fn, intervalMs, maxMs = 60000) => {
            let satisfied = false;
            try { satisfied = fn() === true; } catch (e) { console.debug("[Bada] ignored:", e); }
            if (satisfied) return;
            let waited = 0;
            const timer = setInterval(() => {
                waited += intervalMs;
                let ok = false;
                try { ok = fn() === true; } catch (e) { console.debug("[Bada] ignored:", e); }
                if (ok || waited >= maxMs) {
                    clearInterval(timer);
                    if (!ok) console.warn("[BadaUtils] Gave up attaching after", maxMs, "ms.");
                }
            }, intervalMs);
        };

        // 4. MutationObserver on top tabs container for native DOM attribute changes
        const setupTabsObserver = () => {
            const tabsContainer = document.querySelector(".comfyui-tabs, .comfy-tabs, [role='tablist'], .p-tabview-nav, .p-tabmenu-nav");
            if (tabsContainer && !tabsContainer._qolObserved) {
                const observer = new MutationObserver(() => {
                    self.detectActiveWorkflowFromUI();
                });
                observer.observe(tabsContainer, {
                    attributes: true,
                    attributeFilter: ["class", "aria-selected", "aria-current"],
                    subtree: true
                });
                tabsContainer._qolObserved = true;
            }
            return !!(tabsContainer && tabsContainer._qolObserved);
        };
        retryUntilSatisfied(setupTabsObserver, 2000);

        // 5. Pinia store subscription for memory-speed state change detection
        const setupPiniaSubscription = () => {
            try {
                let pinia = window.__pinia || window.__VUE_DEVTOOLS_GLOBAL_HOOK__?.apps?.[0]?.config?.globalProperties?.$pinia;
                if (!pinia) {
                    const appEls = [document.querySelector("#vue-app"), document.querySelector("#app"), document.querySelector(".comfy-vue-app"), document.body];
                    for (const el of appEls) {
                        if (el?.__vue_app__?.config?.globalProperties?.$pinia) {
                            pinia = el.__vue_app__.config.globalProperties.$pinia;
                            break;
                        }
                    }
                }
                if (pinia && pinia._s) {
                    const wfStore = pinia._s.get("workflow") || pinia._s.get("workflowDraft");
                    if (wfStore && typeof wfStore.$subscribe === "function" && !wfStore._qolSubscribed) {
                        wfStore.$subscribe((mutation, state) => {
                            const act = state?.activeWorkflow || wfStore?.activeWorkflow;
                            if (act) {
                                const detected = act.path || act.filename || act.name || "";
                                if (detected) self.setActiveWorkflow(detected, true);
                            }
                        });
                        wfStore._qolSubscribed = true;
                    }
                    return !!wfStore;
                }
                return false;
            } catch (e) {
                return false;
            }
        };
        retryUntilSatisfied(setupPiniaSubscription, 3000);

        // 6. Hook window.fetch for all workflow / userdata save requests
        const origFetch = window.fetch;
        window.fetch = async function(...args) {
            const res = await origFetch.apply(this, args);
            try {
                const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
                const method = (args[1]?.method || "GET").toUpperCase();

                if (url.includes("userdata") || url.includes("workflow") || url.includes("graph") || url.includes("/api/qol")) {
                    if (method === "POST" || method === "PUT" || method === "DELETE") {
                        setTimeout(() => {
                            self.loadTree();
                            self.detectActiveWorkflowFromUI();
                        }, 250);
                        setTimeout(() => self.loadTree(), 1200);
                    }
                }
            } catch (e) { console.debug("[Bada] ignored:", e); }
            return res;
        };

        // 7. Listen to Ctrl+S / Cmd+S save shortcuts
        window.addEventListener("keydown", (e) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
                setTimeout(() => {
                    self.loadTree();
                    self.detectActiveWorkflowFromUI();
                }, 400);
                setTimeout(() => self.loadTree(), 1200);
            }
        }, true);
    }

    detectActiveWorkflowFromUI() {
        try {
            let detected = "";

            // 1. Try to read activeWorkflow from Pinia stores
            try {
                const appEls = [
                    document.querySelector("#vue-app"),
                    document.querySelector("#app"),
                    document.querySelector(".comfy-vue-app"),
                    document.querySelector(".side-bar-panel"),
                    document.body
                ];
                let pinia = window.__pinia || window.__VUE_DEVTOOLS_GLOBAL_HOOK__?.apps?.[0]?.config?.globalProperties?.$pinia;
                if (!pinia) {
                    for (const el of appEls) {
                        if (el?.__vue_app__?.config?.globalProperties?.$pinia) {
                            pinia = el.__vue_app__.config.globalProperties.$pinia;
                            break;
                        }
                    }
                }
                if (pinia && pinia._s) {
                    const wfStore = pinia._s.get("workflow") || pinia._s.get("workflowDraft") || pinia._s.get("workspace");
                    const act = wfStore?.activeWorkflow;
                    if (act) {
                        detected = act.path || act.filename || act.name || "";
                    }
                }
            } catch (e) { console.debug("[Bada] ignored:", e); }

            // 2. Try to read from top tabs in DOM
            if (!detected) {
                const activeTabEl = document.querySelector(
                    ".comfyui-tabs [aria-selected='true'], .comfyui-tab.active, .comfyui-tab.p-highlight, .comfy-tab.active, [data-tab-active='true'], .comfyui-tab-selected, .p-tabmenu-item.p-highlight"
                );
                if (activeTabEl) {
                    const clone = activeTabEl.cloneNode(true);
                    clone.querySelectorAll("button, i, svg, .close, span[class*='close']").forEach(b => b.remove());
                    const text = clone.textContent.trim();
                    if (text && text !== "+" && text !== "×") {
                        detected = text;
                    }
                }
            }

            // 3. Try to read from document.title
            if (!detected && document.title) {
                const titleMatch = document.title.match(/^(.+?)\s*[-|•]\s*ComfyUI/i);
                if (titleMatch && titleMatch[1]) {
                    detected = titleMatch[1].trim();
                }
            }

            // 4. Try to read from top menu graph title
            if (!detected) {
                const topGraphBtn = document.querySelector(".comfy-menu-topbar button, [aria-label*='Graph'], .graph-title");
                if (topGraphBtn) {
                    const text = topGraphBtn.textContent.trim();
                    if (text && text !== "Graph" && text !== "Workflow") {
                        detected = text;
                    }
                }
            }

            if (detected) {
                const cleanDetected = detected.split("/").pop().replace(/\.json$/i, "").trim();
                if (cleanDetected && cleanDetected !== this.activeWorkflowName) {
                    this.setActiveWorkflow(detected, true);
                }
            }
        } catch (e) { console.debug("[Bada] ignored:", e); }
    }

    getTabLabel() {
        const isKo = (typeof BadaI18n !== "undefined" && BadaI18n.lang === "ko");
        return isKo ? "⚓ 워크플로우+" : "⚓ Workflows+";
    }

    updateTabLabel() {
        try {
            const label = this.getTabLabel();
            const tab = app.extensionManager?.sidebarTab?.sidebarTabs?.find(t => t.id === "bada-workflows-plus");
            if (tab) {
                tab.title = label;
                tab.tooltip = label;
            }
            const btn = document.querySelector('[data-testid="bada-workflows-plus-tab-button"]');
            if (btn) {
                btn.setAttribute("aria-label", label);
                btn.setAttribute("title", label);
                const labelSpan = btn.querySelector(".side-bar-button-label");
                if (labelSpan) labelSpan.textContent = label;
            }
        } catch (e) { console.debug("[Bada] ignored:", e); }
    }

    registerSidebarTab() {
        if (!app.extensionManager || !app.extensionManager.registerSidebarTab) {
            console.warn("[BadaUtils] app.extensionManager.registerSidebarTab not available.");
            return;
        }

        const tabTitle = this.getTabLabel();

        app.extensionManager.registerSidebarTab({
            id: "bada-workflows-plus",
            icon: "bada-tab-icon-workflow",
            title: tabTitle,
            tooltip: tabTitle,
            type: "custom",
            render: (el) => {
                this.mountToContainer(el);
            }
        });
        console.log("[BadaUtils] Bada Workflows sidebar tab registered via extensionManager with title:", tabTitle);

        if (typeof BadaI18n !== "undefined" && BadaI18n.subscribe) {
            BadaI18n.subscribe(() => {
                this.updateTabLabel();
            });
        }

        this.syncSidebarStateWithSetting();
        this.reorderSidebarTab();
        setTimeout(() => this.reorderSidebarTab(), 300);
        setTimeout(() => this.reorderSidebarTab(), 1000);
        setTimeout(() => this.reorderSidebarTab(), 2500);
    }

    reorderSidebarTab() {
        try {
            this.updateTabLabel();
            const tabs = app.extensionManager?.sidebarTab?.sidebarTabs;
            if (!tabs || !Array.isArray(tabs)) return;
            const plusIdx = tabs.findIndex(t => t.id === "bada-workflows-plus");
            const wfIdx = tabs.findIndex(t => t.id === "workflows");
            if (plusIdx !== -1 && wfIdx !== -1) {
                if (plusIdx !== wfIdx - 1) {
                    const [plusTab] = tabs.splice(plusIdx, 1);
                    const targetIdx = tabs.findIndex(t => t.id === "workflows");
                    if (targetIdx !== -1) {
                        tabs.splice(targetIdx, 0, plusTab);
                    }
                }
            }
        } catch (e) {
            console.warn("[BadaUtils] Reorder sidebar tab error:", e);
        }
    }

    syncSidebarStateWithSetting(forcedVal) {
        let isEnabled = forcedVal;
        if (isEnabled === undefined) {
            try {
                if (window.app?.ui?.settings?.getSettingValue) {
                    const val = window.app.ui.settings.getSettingValue("BadaUtils.SidebarOrganizer");
                    isEnabled = (val !== undefined) ? !!val : true;
                } else {
                    isEnabled = true;
                }
            } catch (e) {
                isEnabled = true;
            }
        }

        if (isEnabled) {
            document.body.classList.add("bada-sidebar-organizer-active");
            document.body.classList.remove("bada-sidebar-organizer-disabled");
        } else {
            document.body.classList.remove("bada-sidebar-organizer-active");
            document.body.classList.add("bada-sidebar-organizer-disabled");
            try {
                if (app.extensionManager?.sidebarTab?.activeSidebarTab === "bada-workflows-plus") {
                    app.extensionManager.sidebarTab.activeSidebarTab = "workflows";
                }
            } catch (e) { console.debug("[Bada] ignored:", e); }
        }
        this.reorderSidebarTab();
    }

    cleanNativeTooltipsAndKeybindings() {
        const removeBindings = () => {
            try {
                const root = document.querySelector("#vue-app") || document.querySelector("#app") || document.querySelector("body > div");
                const vnode = root?.__vue_app__;
                if (!vnode?._context?.provides) return false;
                let pinia = null;
                for (const s of Object.getOwnPropertySymbols(vnode._context.provides)) {
                    if (vnode._context.provides[s]?._s) {
                        pinia = vnode._context.provides[s];
                        break;
                    }
                }
                const kbStore = pinia?._s?.get("keybinding");
                if (kbStore) {
                    ["assets", "node-library", "model-library", "workflows"].forEach(id => {
                        kbStore.removeAllKeybindingsForCommand("Workspace.ToggleSidebarTab." + id);
                    });
                    return true;
                }
            } catch (e) { console.debug("[Bada] ignored:", e); }
            return false;
        };

        if (!removeBindings()) {
            const timer = setInterval(() => {
                if (removeBindings()) clearInterval(timer);
            }, 300);
            setTimeout(() => clearInterval(timer), 10000);
        }

        // Tooltip observer removed: All Bada settings now use explicit sub-descriptions,
        // eliminating interference with native PrimeVue tooltips.
    }

    mountToContainer(container) {
        if (!container) return;
        this.mountedSidebar = container;

        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.height = "100%";
        container.style.width = "100%";
        container.style.overflow = "hidden";
        container.style.boxSizing = "border-box";

        if (!this.plusPanel) {
            this.createPlusPanel();
        }

        if (this.plusPanel.parentElement !== container) {
            container.innerHTML = "";
            container.appendChild(this.plusPanel);
        }

        this.renderPlusTree();
        this.loadFavorites().then(() => this.loadTree()).then(() => {
            setTimeout(() => this.scrollToActiveWorkflow(), 150);
        });
    }

    createPlusPanel() {
        if (this.plusPanel) return this.plusPanel;

        const plusPanel = document.createElement("div");
        plusPanel.className = "qol-plus-panel";
        plusPanel.innerHTML = `
            <div class="qol-toolbar">
                <div class="qol-search-wrapper">
                    <span class="qol-search-icon">🔍</span>
                    <input type="text" class="qol-search-input" placeholder="${BadaI18n.t("wf_search_placeholder")}" />
                    <span class="qol-search-clear">&times;</span>
                </div>
                <button class="qol-icon-btn ${this.activeWorkflowName ? 'has-active' : ''}" id="qol-btn-focus-toolbar" title="${BadaI18n.t("wf_btn_focus")}">🎯</button>
                <button class="qol-icon-btn" id="qol-btn-font-size" title="${BadaI18n.t("wf_btn_font_size")}">Aa</button>
                <button class="qol-icon-btn" id="qol-btn-new-folder" title="${BadaI18n.t("wf_btn_new_folder")}">➕</button>
                <button class="qol-icon-btn" id="qol-btn-toggle-all" title="${BadaI18n.t("wf_btn_toggle_all")}">📂</button>
                <button class="qol-icon-btn" id="qol-btn-refresh" title="${BadaI18n.t("wf_btn_refresh")}">🔄</button>
            </div>

            <div class="qol-root-dropzone" id="qol-root-dropzone">
                <span>${BadaI18n.t("wf_root_dropzone")}</span>
            </div>

            <div class="qol-tree-scroll" id="qol-tree-scroll"></div>
        `;

        this.plusPanel = plusPanel;

        // Apply saved font size settings
        this.applyFontSize(this.fontSizeIndex, false);

        // Toolbar Events
        const searchInput = plusPanel.querySelector(".qol-search-input");
        const clearBtn = plusPanel.querySelector(".qol-search-clear");
        searchInput.addEventListener("input", (e) => {
            this.searchQuery = e.target.value.trim().toLowerCase();
            clearBtn.style.display = this.searchQuery ? "block" : "none";
            this.renderPlusTree();
        });
        clearBtn.addEventListener("click", () => {
            searchInput.value = "";
            this.searchQuery = "";
            clearBtn.style.display = "none";
            this.renderPlusTree();
        });

        plusPanel.querySelector("#qol-btn-focus-toolbar")?.addEventListener("click", () => {
            this.scrollToActiveWorkflow();
        });

        const fontBtn = plusPanel.querySelector("#qol-btn-font-size");
        fontBtn?.addEventListener("click", (e) => {
            e.stopPropagation();
            this.cycleFontSize();
        });
        fontBtn?.addEventListener("contextmenu", (e) => {
            this.showFontSizeMenu(e);
        });

        plusPanel.querySelector("#qol-btn-new-folder").addEventListener("click", () => {
            this.openNewFolderModal("/");
        });

        let allExpanded = false;
        plusPanel.querySelector("#qol-btn-toggle-all").addEventListener("click", () => {
            allExpanded = !allExpanded;
            if (allExpanded && this.treeData) {
                const addAll = (node) => {
                    if (node.path && node.path !== "/") this.expandedFolders.add(node.path);
                    if (node.folders) node.folders.forEach(addAll);
                };
                addAll(this.treeData);
            } else {
                this.expandedFolders.clear();
            }
            this.renderPlusTree();
        });

        plusPanel.querySelector("#qol-btn-refresh").addEventListener("click", async () => {
            await this.loadTree();
            this.showToast(BadaI18n.lang === "ko" ? "새로고침 완료" : "Workflows refreshed");
        });

        // Root Dropzone Events
        const rootDrop = plusPanel.querySelector("#qol-root-dropzone");
        rootDrop.addEventListener("dragenter", (e) => {
            e.preventDefault();
            e.stopPropagation();
            rootDrop.classList.add("dragover");
        });
        rootDrop.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "move";
            rootDrop.classList.add("dragover");
        });
        rootDrop.addEventListener("dragleave", (e) => {
            e.preventDefault();
            e.stopPropagation();
            rootDrop.classList.remove("dragover");
        });
        rootDrop.addEventListener("drop", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            rootDrop.classList.remove("dragover");
            rootDrop.classList.remove("visible");

            const sourcePath = e.dataTransfer.getData("text/plain") || window.__qolDraggedWorkflow || this.draggedItem?.path;
            if (sourcePath) {
                await this.moveWorkflowFile(sourcePath, "/");
                this.draggedItem = null;
                window.__qolDraggedWorkflow = null;
            }
        });

        return plusPanel;
    }

    async loadTree() {
        try {
            await this.loadFavorites();
            const res = await fetch("/api/qol/workflows/tree");
            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    this.treeData = data.tree;

                    if (this.activeWorkflowPath && this.activeWorkflowPath.includes("/")) {
                        const parts = this.activeWorkflowPath.split("/").slice(0, -1);
                        let acc = "";
                        for (const p of parts) {
                            acc = acc ? `${acc}/${p}` : p;
                            this.expandedFolders.add(acc);
                        }
                    }

                    this.renderPlusTree();
                    this.applySelectionHighlight();   // rows were rebuilt from scratch
                    return this.treeData;
                }
            }
        } catch (e) {
            console.error("[QoL-Utils] Failed to fetch workflow tree:", e);
        }
        return null;
    }

    async loadWorkflowToCanvas(workflowPath) {
        try {
            const cleanRelPath = workflowPath.replace(/\\/g, "/").replace(/^[/\\]+/, "").trim();
            const filename = cleanRelPath.split("/").pop().replace(/\.json$/i, "");

            let nativeLoaded = false;
            try {
                const nativeSidebar = document.querySelector(".side-bar-panel, .workflows-panel, [aria-label='Workflows']");
                if (nativeSidebar) {
                    const treeNodes = nativeSidebar.querySelectorAll(".p-treenode, .p-tree-node, [role='treeitem'], li");
                    for (const node of treeNodes) {
                        const labelEl = node.querySelector(".p-treenode-label, .p-tree-node-label, .p-treenode-text, span.label, span");
                        const labelText = labelEl ? labelEl.textContent.trim() : "";
                        if (labelText && (labelText === filename || labelText === `${filename}.json` || labelText === cleanRelPath)) {
                            const clickTarget = node.querySelector(".p-treenode-content, .p-tree-node-content, button, span") || node;
                            clickTarget.click();
                            nativeLoaded = true;
                            break;
                        }
                    }
                }
            } catch (e) {
                console.warn("[QoL-Utils] Native node click check:", e);
            }

            if (!nativeLoaded) {
                const res = await fetch(`/api/qol/workflows/content?path=${encodeURIComponent(workflowPath)}`);
                if (!res.ok) throw new Error("워크플로우 파일을 읽을 수 없습니다.");
                const json = await res.json();
                if (json.success && json.data) {
                    const graphData = json.data;

                    if (app && typeof app.loadGraphData === "function") {
                        await app.loadGraphData(graphData, true, true, cleanRelPath);
                    } else if (window.app && typeof window.app.loadGraphData === "function") {
                        await window.app.loadGraphData(graphData, true, true, cleanRelPath);
                    } else if (window.app?.graph && typeof window.app.graph.configure === "function") {
                        window.app.graph.configure(graphData);
                    }
                } else {
                    throw new Error(json.error || "불러오기 실패");
                }
            }

            this.setActiveWorkflow(workflowPath, false);
            this.showToast(BadaI18n.lang === "ko" ? `'${filename}' 불러오기 완료!` : `'${filename}' loaded successfully!`);
        } catch (e) {
            console.error("[QoL-Utils] Error loading workflow:", e);
            this.showToast((BadaI18n.lang === "ko" ? "불러오기 오류: " : "Load error: ") + e.message, true);
        }
    }

    resolveActiveWorkflowPath(nameOrPath) {
        if (!nameOrPath || !this.treeData) return nameOrPath;
        const clean = this.normalizePath(nameOrPath).replace(/\.json$/i, "").trim().toLowerCase();
        const base = clean.split("/").pop();

        let foundPath = "";
        const searchNode = (node) => {
            if (node.files) {
                for (const f of node.files) {
                    const fNorm = this.normalizePath(f.path).replace(/\.json$/i, "").trim().toLowerCase();
                    const fBase = (f.name || "").trim().toLowerCase();
                    if (fNorm === clean || fBase === clean || fBase === base) {
                        foundPath = f.path;
                        return true;
                    }
                }
            }
            if (node.folders) {
                for (const sub of node.folders) {
                    if (searchNode(sub)) return true;
                }
            }
            return false;
        };
        searchNode(this.treeData);
        return foundPath || nameOrPath;
    }

    isWorkflowMatch(f) {
        if (!this.activeWorkflowName && !this.activeWorkflowPath) return false;

        const targetName = (this.activeWorkflowName || "").replace(/\.json$/i, "").trim().toLowerCase();
        const targetPath = this.normalizePath(this.activeWorkflowPath || "").replace(/\.json$/i, "").trim().toLowerCase();

        const fPath = this.normalizePath(f.path || "").replace(/\.json$/i, "").trim().toLowerCase();
        const fName = (f.name || "").replace(/\.json$/i, "").trim().toLowerCase();
        const fFilename = (f.filename || "").replace(/\.json$/i, "").trim().toLowerCase();

        if (targetPath) {
            if (fPath === targetPath || fPath.endsWith("/" + targetPath)) return true;
        }
        if (targetName) {
            if (fName === targetName || fFilename === targetName) return true;
            if (fPath.endsWith("/" + targetName)) return true;
        }
        return false;
    }

    setActiveWorkflow(pathOrName, autoFocus = true) {
        if (!pathOrName) return;
        const cleanName = pathOrName.split("/").pop().replace(/\.json$/i, "").trim();
        if (!cleanName) return;

        const resolvedPath = this.resolveActiveWorkflowPath(pathOrName);
        this.activeWorkflowPath = resolvedPath;
        this.activeWorkflowName = cleanName;
        localStorage.setItem("qol_active_workflow_path", resolvedPath);
        localStorage.setItem("qol_active_workflow_name", cleanName);

        if (resolvedPath && resolvedPath.includes("/")) {
            const parts = resolvedPath.split("/").slice(0, -1);
            let acc = "";
            for (const p of parts) {
                acc = acc ? `${acc}/${p}` : p;
                this.expandedFolders.add(acc);
            }
        }

        const focusBtn = document.querySelector("#qol-btn-focus-toolbar");
        if (focusBtn) {
            focusBtn.title = BadaI18n.lang === "ko" ? `현재 작업: '${cleanName}' 위치로 이동` : `Locate active: '${cleanName}'`;
            focusBtn.classList.add("has-active");
        }

        this.renderPlusTree();

        if (autoFocus) {
            setTimeout(() => this.scrollToActiveWorkflow(false), 50);
        }
    }

    scrollToActiveWorkflow(showToast = false) {
        if (!this.activeWorkflowName && !this.activeWorkflowPath) {
            if (showToast) this.showToast(BadaI18n.lang === "ko" ? "현재 열려있는 워크플로우가 없습니다." : "No active workflow is currently open.");
            return;
        }

        const resolvedPath = this.resolveActiveWorkflowPath(this.activeWorkflowPath || this.activeWorkflowName);
        if (resolvedPath && resolvedPath.includes("/")) {
            const parts = resolvedPath.split("/").slice(0, -1);
            let acc = "";
            for (const p of parts) {
                acc = acc ? `${acc}/${p}` : p;
                this.expandedFolders.add(acc);
            }
            this.renderPlusTree();
        }

        setTimeout(() => {
            const activeNodes = document.querySelectorAll(".qol-file-row.active-workflow");
            if (activeNodes.length > 0) {
                const targetNode = activeNodes[activeNodes.length - 1] || activeNodes[0];
                targetNode.scrollIntoView({ block: "nearest", behavior: "smooth" });
                if (showToast) {
                    activeNodes.forEach(node => {
                        node.classList.add("qol-moved-success");
                        setTimeout(() => node.classList.remove("qol-moved-success"), 2200);
                    });
                    this.showToast(BadaI18n.lang === "ko" ? `🎯 '${this.activeWorkflowName}' 위치로 이동했습니다.` : `🎯 Located '${this.activeWorkflowName}'`);
                }
            } else if (showToast && this.activeWorkflowName) {
                this.showToast(BadaI18n.lang === "ko" ? `현재 작업: '${this.activeWorkflowName}'` : `Active: '${this.activeWorkflowName}'`);
            }
        }, 40);
    }

    cycleFontSize() {
        const nextIndex = (this.fontSizeIndex + 1) % FONT_SIZE_PRESETS.length;
        this.applyFontSize(nextIndex, true);
    }

    applyFontSize(index, showToast = false) {
        if (index === undefined || isNaN(index) || index < 0 || index >= FONT_SIZE_PRESETS.length) {
            index = 1;
        }
        this.fontSizeIndex = index;
        localStorage.setItem("qol_workflows_font_size_idx", index.toString());
        const preset = FONT_SIZE_PRESETS[this.fontSizeIndex];

        const plusPanel = this.plusPanel || document.querySelector(".qol-plus-panel");
        if (plusPanel) {
            plusPanel.style.setProperty("--qol-font-size", preset.fontSize);
            plusPanel.style.setProperty("--qol-folder-height", preset.folderHeight);
            plusPanel.style.setProperty("--qol-file-height", preset.fileHeight);
            plusPanel.style.setProperty("--qol-folder-icon-size", preset.folderIcon);
            plusPanel.style.setProperty("--qol-file-icon-size", preset.fileIcon);
            plusPanel.style.setProperty("--qol-badge-font-size", preset.badgeFont);
            plusPanel.style.setProperty("--qol-badge-height", preset.badgeHeight);
            plusPanel.style.setProperty("--qol-chevron-size", preset.chevron);
        }

        const fontBtn = this.plusPanel?.querySelector("#qol-btn-font-size") || document.querySelector("#qol-btn-font-size");
        const isKo = BadaI18n.lang === "ko";
        if (fontBtn) {
            fontBtn.title = isKo 
                ? `글자 크기: ${getPresetLabel(preset)}\n(좌클릭: 크기 순환 변경 / 우클릭: 목록 선택)`
                : `Font Size: ${getPresetLabel(preset)}\n(Left-click: Cycle / Right-click: Menu)`;
            fontBtn.innerHTML = `<span style="font-weight:700; font-size:12px; font-family:sans-serif; letter-spacing:-0.5px;">${preset.icon || 'Aa'}</span>`;
        }

        if (showToast) {
            this.showToast((isKo ? "글자 크기: " : "Font Size: ") + getPresetLabel(preset));
        }
    }

    showFontSizeMenu(e) {
        e.preventDefault();
        e.stopPropagation();
        const isKo = BadaI18n.lang === "ko";

        let menu = document.getElementById("qol-font-size-menu");
        if (!menu) {
            menu = document.createElement("div");
            menu.id = "qol-font-size-menu";
            menu.className = "qol-context-menu";
            document.body.appendChild(menu);

            window.addEventListener("click", () => {
                menu.style.display = "none";
            });
        }

        menu.innerHTML = `
            <div style="padding: 6px 10px 5px 10px; font-size: 11px; font-weight: 600; color: #a1a1aa; text-transform: uppercase; border-bottom: 1px solid #27272a; margin-bottom: 4px;">
                ${isKo ? "🔤 글자 & 행 크기 설정" : "🔤 Font & Row Size"}
            </div>
            ${FONT_SIZE_PRESETS.map((preset, idx) => `
                <div class="qol-menu-item font-size-item" data-idx="${idx}" style="justify-content: space-between; gap: 14px;">
                    <span>${getPresetLabel(preset)}</span>
                    <span style="color: #818cf8; font-weight: bold;">${this.fontSizeIndex === idx ? "✓" : ""}</span>
                </div>
            `).join("")}
        `;

        menu.querySelectorAll(".font-size-item").forEach(item => {
            item.addEventListener("click", (ev) => {
                ev.stopPropagation();
                const idx = parseInt(item.getAttribute("data-idx"), 10);
                this.applyFontSize(idx, true);
                menu.style.display = "none";
            });
        });

        const targetBtn = e.currentTarget || e.target;
        const rect = targetBtn?.getBoundingClientRect ? targetBtn.getBoundingClientRect() : { left: e.clientX, bottom: e.clientY };
        // Display BEFORE measuring (see placeMenuInViewport). This menu had NO vertical clamp
        // at all, so it ran off the bottom of the window whenever the button sat low.
        menu.style.display = "block";
        placeMenuInViewport(menu, rect.left || e.clientX, (rect.bottom || e.clientY) + 4);
    }

    /** Delegates to the shared implementation (web/bada_shared.js). */
    escapeHtml(str) {
        return escapeHtml(str);
    }

    highlightMatch(text, query) {
        if (!text) return "";
        if (!query || !query.trim()) return this.escapeHtml(text);

        try {
            const cleanQuery = query.trim();
            const escaped = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const regex = new RegExp(`(${escaped})`, "gi");
            const parts = text.split(regex);
            return parts.map(part => {
                if (part.toLowerCase() === cleanQuery.toLowerCase()) {
                    return `<mark class="qol-search-highlight">${this.escapeHtml(part)}</mark>`;
                }
                return this.escapeHtml(part);
            }).join("");
        } catch (e) {
            return this.escapeHtml(text);
        }
    }

    normalizePath(p) {
        if (!p) return "";
        return p.replace(/\\/g, "/").replace(/^\/?workflows\//i, "").replace(/^\/+/, "").trim();
    }

    isFavorited(filePath) {
        if (!filePath || !this.favorites || this.favorites.size === 0) return false;
        const norm = this.normalizePath(filePath);
        if (this.favorites.has(norm)) return true;

        const normLower = norm.toLowerCase();
        const normNoExt = norm.replace(/\.json$/i, "").toLowerCase();
        for (const fav of this.favorites) {
            const fNorm = this.normalizePath(fav).toLowerCase();
            const fNoExt = fNorm.replace(/\.json$/i, "");
            if (fNorm === normLower || fNoExt === normNoExt || fNorm === normLower + ".json" || fNorm + ".json" === normLower) {
                return true;
            }
        }
        return false;
    }

    async loadFavorites() {
        try {
            let favs = [];
            // 1. Fetch native ComfyUI userdata endpoint (instant, live without server restart)
            try {
                const res = await fetch("/api/userdata/workflows%2F.index.json");
                if (res.ok) {
                    const data = await res.json();
                    if (data && Array.isArray(data.favorites)) {
                        favs = data.favorites;
                    }
                }
            } catch (e) { console.debug("[Bada] ignored:", e); }

            // 2. Fallback to /api/qol/workflows/favorites
            if (!favs || favs.length === 0) {
                try {
                    const res2 = await fetch("/api/qol/workflows/favorites");
                    if (res2.ok) {
                        const data2 = await res2.json();
                        if (data2.success && Array.isArray(data2.favorites)) {
                            favs = data2.favorites;
                        }
                    }
                } catch (e) { console.debug("[Bada] ignored:", e); }
            }

            if (favs && favs.length > 0) {
                this.favorites = new Set(favs.map(f => this.normalizePath(f)).filter(Boolean));
                localStorage.setItem("qol_workflows_favorites", JSON.stringify(Array.from(this.favorites)));
            } else {
                this.favorites = new Set();
                localStorage.removeItem("qol_workflows_favorites");
            }
        } catch (e) {
            console.warn("[QoL-Utils] Could not fetch favorites from server:", e);
        }
        return this.favorites;
    }

    async saveFavorites() {
        const favList = Array.from(this.favorites);
        localStorage.setItem("qol_workflows_favorites", JSON.stringify(favList));

        const formattedForNative = favList.map(item => {
            const clean = this.normalizePath(item);
            return clean.startsWith("workflows/") ? clean : `workflows/${clean}`;
        });

        // 1. Save directly to native ComfyUI userdata endpoint
        try {
            await fetch("/api/userdata/workflows%2F.index.json", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ favorites: formattedForNative })
            });
        } catch (e) {
            console.warn("[QoL-Utils] Failed to sync to native /api/userdata:", e);
        }

        // 2. Also save to custom API if available
        try {
            await fetch("/api/qol/workflows/favorites", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ favorites: favList })
            });
        } catch (e) { console.debug("[Bada] ignored:", e); }

        // 3. Immediately sync native ComfyUI Bookmarks UI
        await this.syncNativeBookmarks();
    }

    async syncNativeBookmarks() {
        try {
            // 1. Trigger Pinia workflowBookmark store reload if available
            const appEls = [
                document.querySelector("#vue-app"),
                document.querySelector("#app"),
                document.querySelector(".comfy-vue-app"),
                document.querySelector(".side-bar-panel"),
                document.querySelector(".workflows-sidebar-tab"),
                document.body
            ];

            let pinia = window.__pinia || window.__VUE_DEVTOOLS_GLOBAL_HOOK__?.apps?.[0]?.config?.globalProperties?.$pinia;

            if (!pinia) {
                for (const el of appEls) {
                    if (el?.__vue_app__?.config?.globalProperties?.$pinia) {
                        pinia = el.__vue_app__.config.globalProperties.$pinia;
                        break;
                    }
                    if (el?._vnode?.component?.appContext?.provides) {
                        const provides = el._vnode.component.appContext.provides;
                        for (const key of Object.getOwnPropertySymbols(provides)) {
                            if (provides[key]?._s) {
                                pinia = provides[key];
                                break;
                            }
                        }
                    }
                }
            }

            if (pinia && pinia._s && pinia._s.has("workflowBookmark")) {
                const bookmarkStore = pinia._s.get("workflowBookmark");
                if (typeof bookmarkStore?.loadBookmarks === "function") {
                    await bookmarkStore.loadBookmarks();
                }
            }
        } catch (e) { console.debug("[Bada] ignored:", e); }

        // 2. Click ONLY the dedicated refresh button if available in DOM (never generic tree buttons)
        try {
            const refreshBtns = document.querySelectorAll(
                "button[data-testid='workflows-refresh-button'], button:has(>[data-testid='workflows-refresh-icon']), button:has(>i.pi-refresh)"
            );
            refreshBtns.forEach(btn => btn.click());
        } catch (e) { console.debug("[Bada] ignored:", e); }
    }

    async toggleFavorite(filePath) {
        if (!filePath) return;
        const norm = this.normalizePath(filePath);
        const filename = norm.split("/").pop().replace(/\.json$/i, "");
        const isCurrentlyFav = this.isFavorited(norm);

        if (isCurrentlyFav) {
            const normLower = norm.toLowerCase();
            const normNoExt = norm.replace(/\.json$/i, "").toLowerCase();
            const toDelete = [];
            for (const fav of this.favorites) {
                const fNorm = this.normalizePath(fav).toLowerCase();
                const fNoExt = fNorm.replace(/\.json$/i, "");
                if (fNorm === normLower || fNoExt === normNoExt || fNorm === normLower + ".json" || fNorm + ".json" === normLower) {
                    toDelete.push(fav);
                }
            }
            toDelete.forEach(d => this.favorites.delete(d));
            this.showToast(BadaI18n.lang === "ko" ? `'${filename}' 즐겨찾기에서 제거되었습니다.` : `'${filename}' removed from bookmarks.`);
        } else {
            const toAdd = norm.endsWith(".json") ? norm : norm + ".json";
            this.favorites.add(toAdd);
            this.showToast(BadaI18n.lang === "ko" ? `⭐ '${filename}' 즐겨찾기에 추가되었습니다!` : `⭐ '${filename}' added to bookmarks!`);
        }

        await this.saveFavorites();
        this.renderPlusTree();
    }

    async moveWorkflowFile(sourcePath, targetFolder) {
        if (!sourcePath || targetFolder === undefined) return false;

        const cleanSource = sourcePath.replace(/\\/g, "/").trim();
        let cleanTarget = targetFolder.replace(/\\/g, "/").trim();
        if (!cleanTarget || cleanTarget === ".") cleanTarget = "/";

        const currentFolder = cleanSource.includes("/") ? cleanSource.split("/").slice(0, -1).join("/") : "/";
        if (currentFolder === cleanTarget) {
            return false;
        }

        try {
            const res = await fetch("/api/qol/workflows/move", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    source_path: cleanSource,
                    target_folder: cleanTarget,
                    overwrite: false
                })
            });
            const data = await res.json();
            if (data.success) {
                const targetLabel = cleanTarget === "/" ? (BadaI18n.lang === "ko" ? "최상위(Root)" : "Root") : `'${cleanTarget}'`;
                const filename = cleanSource.split("/").pop();
                this.showToast(BadaI18n.lang === "ko" ? `'${filename}' -> ${targetLabel} 이동 완료!` : `'${filename}' moved to ${targetLabel}!`);

                const newPath = cleanTarget === "/" ? filename : `${cleanTarget}/${filename}`;

                if (this.activeWorkflowPath === cleanSource) {
                    this.setActiveWorkflow(newPath, false);
                }

                if (this.isFavorited(cleanSource)) {
                    this.favorites.delete(this.normalizePath(cleanSource));
                    this.favorites.delete(cleanSource);
                    this.favorites.add(this.normalizePath(newPath));
                    await this.saveFavorites();
                }

                if (cleanTarget !== "/") {
                    this.expandedFolders.add(cleanTarget);
                    const parts = cleanTarget.split("/");
                    let acc = "";
                    for (const p of parts) {
                        acc = acc ? `${acc}/${p}` : p;
                        this.expandedFolders.add(acc);
                    }
                }

                this.highlightedItem = cleanSource.split("/").pop();
                await this.loadTree();
                return true;
            } else {
                this.showToast(data.error || (BadaI18n.lang === "ko" ? "이동 실패" : "Failed to move"), true);
                return false;
            }
        } catch (e) {
            this.showToast((BadaI18n.lang === "ko" ? "이동 오류: " : "Move error: ") + e.message, true);
            return false;
        }
    }

    /**
     * Moves a whole FOLDER into `targetFolder` (drag & drop, or any future UI entry point).
     *
     * Hits the same endpoint as moveWorkflowFile() — the backend routes by inspecting whether
     * the source is a directory — so the request is identical apart from the type. Afterwards
     * the expanded state, bookmarks and active workflow that pointed *inside* the folder have
     * to follow it, which is what rebaseSidebarStateAfterFolderMove() takes care of.
     */
    async moveWorkflowFolder(sourcePath, targetFolder) {
        if (!sourcePath || targetFolder === undefined) return false;

        const isKo = BadaI18n.lang === "ko";
        const cleanSource = sourcePath.replace(/\\/g, "/").trim();
        let cleanTarget = targetFolder.replace(/\\/g, "/").trim();
        if (!cleanTarget || cleanTarget === ".") cleanTarget = "/";

        const { parent: currentFolder, name: folderName } = this.splitSidebarPath(cleanSource);
        if (currentFolder === cleanTarget) return false; // already there

        // Refuse the impossible placements up-front instead of letting the server answer 400.
        const sourceKey = this.normalizePath(cleanSource);
        const targetKey = this.normalizePath(cleanTarget);
        if (targetKey && (targetKey === sourceKey || targetKey.startsWith(`${sourceKey}/`))) {
            this.showToast(isKo ? "폴더를 자기 자신이나 하위 폴더 안으로 옮길 수 없습니다." : "A folder cannot be moved into itself or a subfolder.", true);
            return false;
        }

        try {
            const res = await fetch("/api/qol/workflows/move", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    source_path: cleanSource,
                    target_folder: cleanTarget,
                    new_name: "", // keep the current name — only the parent changes
                    overwrite: false
                })
            });
            const data = await res.json();
            if (!data.success) {
                this.showToast(data.error || (isKo ? "이동 실패" : "Failed to move"), true);
                return false;
            }

            const targetLabel = cleanTarget === "/" ? (isKo ? "최상위(Root)" : "Root") : `'${cleanTarget}'`;
            this.showToast(isKo ? `📁 '${folderName}' -> ${targetLabel} 이동 완료!` : `📁 '${folderName}' moved to ${targetLabel}!`);

            // Folder rows are addressed with a leading slash, matching the tree's own paths.
            const newPath = cleanTarget === "/" ? `/${folderName}` : `${cleanTarget}/${folderName}`;
            await this.rebaseSidebarStateAfterFolderMove(cleanSource, newPath);

            this.highlightedItem = folderName;
            await this.loadTree();
            return true;
        } catch (e) {
            this.showToast((isKo ? "이동 오류: " : "Move error: ") + e.message, true);
            return false;
        }
    }

    /**
     * Sidebar drag & drop, shared by workflow rows and folder rows.
     *
     * `kind` ("file" | "folder") is the only difference between the two:
     *   - the icon shown on the ghost badge,
     *   - what counts as a target. A workflow can be ordered against a sibling workflow row
     *     (the top/bottom insert line); a folder cannot — you drop a folder onto a folder, so
     *     hovering a workflow row means "into the folder that owns that row".
     *   - the commit call: moveWorkflowFile() vs moveWorkflowFolder().
     */
    attachRowDragEvents(rowEl, item, kind) {
        const isFolder = kind === "folder";
        const icon = isFolder ? "📁" : "📄";
        const itemPath = item.path;
        const itemName = item.name;
        const sourceKey = this.normalizePath(itemPath);

        /**
         * A folder may never be dropped into itself or into one of its own descendants.
         * The backend answers 400 for that, but catching it here keeps the drag honest (the
         * target turns red and no request is sent) instead of failing after the drop.
         */
        const isForbiddenTarget = (targetPath) => {
            if (!isFolder || !targetPath) return false;
            const norm = this.normalizePath(targetPath);
            return !!norm && (norm === sourceKey || norm.startsWith(`${sourceKey}/`));
        };

        rowEl.addEventListener("mousedown", (e) => {
            if (e.button !== 0) return; // Left mouse only

            const startX = e.clientX;
            const startY = e.clientY;
            let hasMoved = false;
            let targetFolder = null;

            // Highlights `el` and records `path` as the drop target, unless the placement is
            // impossible (folder into itself / its own subtree) — then only the red state
            // stays and `targetFolder` is left null so nothing is committed on mouseup.
            const markTarget = (el, path) => {
                if (el) el.classList.add("dragover");
                if (isForbiddenTarget(path)) {
                    if (el) el.classList.add("drag-invalid");
                    return false;
                }
                targetFolder = path;
                return true;
            };

            const treeScrollEl = document.querySelector("#qol-tree-scroll");
            const rootDropEl = document.querySelector("#qol-root-dropzone");

            const onMouseMove = (moveEv) => {
                const dist = Math.hypot(moveEv.clientX - startX, moveEv.clientY - startY);

                if (!hasMoved && dist > 4) {
                    hasMoved = true;
                    this.isCustomDragging = true;
                    this.draggedPath = itemPath;
                    this.draggedName = itemName;
                    rowEl.classList.add("dragging");
                    document.body.style.cursor = "grabbing";
                    document.body.style.userSelect = "none";

                    if (rootDropEl) rootDropEl.classList.add("visible");

                    if (!this.dragGhostEl) {
                        this.dragGhostEl = document.createElement("div");
                        this.dragGhostEl.className = "qol-drag-ghost";
                        const iconEl = document.createElement("span");
                        iconEl.textContent = icon;
                        const nameEl = document.createElement("span");
                        nameEl.textContent = itemName;
                        this.dragGhostEl.append(iconEl, nameEl);
                        document.body.appendChild(this.dragGhostEl);
                    }

                    // Carrying more than one row? Say so on the ghost, and dim the others.
                    const carried = this.resolveDragEntries(kind, itemPath);
                    if (carried.length > 1) {
                        this.dragGhostEl.lastElementChild.textContent = `${itemName} +${carried.length - 1}`;
                        carried.forEach((entry) => {
                            if (entry.key === key) return;
                            this.getSelectableRows().forEach((row) => {
                                if (this.rowSelectionKey(row) === entry.key) row.classList.add("qol-multi-dragging");
                            });
                        });
                    }
                }

                if (this.isCustomDragging) {
                    this.lastMouseY = moveEv.clientY;

                    if (this.dragGhostEl) {
                        this.dragGhostEl.style.left = `${moveEv.clientX}px`;
                        this.dragGhostEl.style.top = `${moveEv.clientY}px`;
                    }

                    // Smooth Boundary Auto-Scroll up & down
                    if (treeScrollEl) {
                        this.startAutoScroll(treeScrollEl);
                    }

                    // Real-time hit-testing for drop target
                    const hit = document.elementFromPoint(moveEv.clientX, moveEv.clientY);
                    const folderRowHit = hit?.closest(".qol-folder-row");
                    const rootDropHit = hit?.closest("#qol-root-dropzone");
                    const fileRowHit = hit?.closest(".qol-file-row");
                    const containerHit = hit?.closest(".qol-children-container");

                    document.querySelectorAll(".dragover").forEach(el => el.classList.remove("dragover"));
                    document.querySelectorAll(".drag-invalid").forEach(el => el.classList.remove("drag-invalid"));
                    document.querySelectorAll(".drag-insert-top").forEach(el => el.classList.remove("drag-insert-top"));
                    document.querySelectorAll(".drag-insert-bottom").forEach(el => el.classList.remove("drag-insert-bottom"));
                    targetFolder = null;

                    if (rootDropHit) {
                        markTarget(rootDropHit, "/");
                    } else if (folderRowHit) {
                        const folderPath = folderRowHit.getAttribute("data-path");
                        const accepted = markTarget(folderRowHit, folderPath);

                        // Auto-expand folder if hovered intentionally for 1.2s (1200ms)
                        if (accepted && folderPath && !this.expandedFolders.has(folderPath)) {
                            if (this.hoveredFolder !== folderPath) {
                                if (this.hoverExpandTimer) {
                                    clearTimeout(this.hoverExpandTimer);
                                    this.hoverExpandTimer = null;
                                }
                                this.hoveredFolder = folderPath;
                                this.hoverExpandTimer = setTimeout(() => {
                                    if (this.isCustomDragging && this.hoveredFolder === folderPath) {
                                        this.expandedFolders.add(folderPath);
                                        this.renderPlusTree();
                                    }
                                }, 1200);
                            }
                        }
                    } else if (fileRowHit && fileRowHit !== rowEl) {
                        if (isFolder) {
                            // A folder is dropped onto a folder, never ordered against a
                            // sibling workflow — the folder that owns this row is the target.
                            const owner = fileRowHit.closest(".qol-children-container");
                            if (owner) {
                                markTarget(owner, owner.getAttribute("data-folder-path") || "/");
                            }
                        } else {
                            const rect = fileRowHit.getBoundingClientRect();
                            const isTopHalf = moveEv.clientY < rect.top + rect.height / 2;

                            if (isTopHalf) {
                                fileRowHit.classList.add("drag-insert-top");
                            } else {
                                fileRowHit.classList.add("drag-insert-bottom");
                            }

                            const hitPath = fileRowHit.getAttribute("data-path") || "";
                            markTarget(null, hitPath.includes("/") ? hitPath.split("/").slice(0, -1).join("/") : "/");
                        }
                    } else if (containerHit) {
                        markTarget(containerHit, containerHit.getAttribute("data-folder-path") || "/");
                    }

                    if (!folderRowHit && this.hoverExpandTimer) {
                        clearTimeout(this.hoverExpandTimer);
                        this.hoverExpandTimer = null;
                        this.hoveredFolder = null;
                    }
                }
            };

            const onMouseUp = async () => {
                window.removeEventListener("mousemove", onMouseMove, true);
                window.removeEventListener("mouseup", onMouseUp, true);

                this.stopAutoScroll();
                this.lastMouseY = null;
                if (this.hoverExpandTimer) {
                    clearTimeout(this.hoverExpandTimer);
                    this.hoverExpandTimer = null;
                    this.hoveredFolder = null;
                }

                document.body.style.cursor = "";
                document.body.style.userSelect = "";
                rowEl.classList.remove("dragging");
                document.querySelectorAll(".qol-multi-dragging").forEach(el => el.classList.remove("qol-multi-dragging"));
                document.querySelectorAll(".dragover").forEach(el => el.classList.remove("dragover"));
                document.querySelectorAll(".drag-invalid").forEach(el => el.classList.remove("drag-invalid"));
                document.querySelectorAll(".drag-insert-top").forEach(el => el.classList.remove("drag-insert-top"));
                document.querySelectorAll(".drag-insert-bottom").forEach(el => el.classList.remove("drag-insert-bottom"));

                if (this.dragGhostEl) {
                    this.dragGhostEl.remove();
                    this.dragGhostEl = null;
                }
                if (rootDropEl) rootDropEl.classList.remove("visible");

                if (this.isCustomDragging) {
                    this.isCustomDragging = false;
                    this.justFinishedDrag = true;
                    setTimeout(() => { this.justFinishedDrag = false; }, 200);

                    if (targetFolder !== null && targetFolder !== undefined) {
                        const carried = this.resolveDragEntries(kind, itemPath);
                        if (carried.length > 1) {
                            await this.moveSelectionToFolder(carried, targetFolder);
                        } else if (isFolder) {
                            await this.moveWorkflowFolder(itemPath, targetFolder);
                        } else {
                            await this.moveWorkflowFile(itemPath, targetFolder);
                        }
                    }
                }
            };

            window.addEventListener("mousemove", onMouseMove, true);
            window.addEventListener("mouseup", onMouseUp, true);
        });
    }

    buildFileBadges(file, isActive, isFav) {
        const badgesContainer = document.createElement("div");
        badgesContainer.className = "qol-file-badges";

        if (isActive) {
            const activeTag = document.createElement("span");
            activeTag.className = "qol-active-tag";
            activeTag.textContent = BadaI18n.t("wf_active_tag");
            badgesContainer.appendChild(activeTag);
        }

        if (file.has_thumbnail || file.thumbnail) {
            const tBadge = document.createElement("span");
            tBadge.className = "qol-badge-chip qol-thumb-badge";
            tBadge.textContent = "🖼️";
            tBadge.title = BadaI18n.lang === "ko" ? "대표 썸네일 등록됨 (클릭하여 수정)" : "Thumbnail attached (Click to edit)";
            tBadge.addEventListener("click", (e) => {
                e.stopPropagation();
                this.openWorkflowInfoModal(file);
            });
            badgesContainer.appendChild(tBadge);
        }

        if (file.has_notes || (file.notes && file.notes.trim())) {
            const nBadge = document.createElement("span");
            nBadge.className = "qol-badge-chip qol-notes-badge";
            nBadge.textContent = "📝";
            nBadge.title = BadaI18n.lang === "ko" ? "주석 및 메모 등록됨 (클릭하여 수정)" : "Notes attached (Click to edit)";
            nBadge.addEventListener("click", (e) => {
                e.stopPropagation();
                this.openWorkflowInfoModal(file);
            });
            badgesContainer.appendChild(nBadge);
        }

        const starBtn = document.createElement("span");
        starBtn.className = `qol-fav-star ${isFav ? "is-fav" : ""}`;
        starBtn.textContent = isFav ? "★" : "☆";
        starBtn.title = isFav 
            ? BadaI18n.t("wf_ctx_fav_remove")
            : BadaI18n.t("wf_ctx_fav_add");
        starBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.toggleFavorite(file.path);
        });
        badgesContainer.appendChild(starBtn);

        return badgesContainer;
    }

    renderPlusTree() {
        const treeScroll = this.plusPanel?.querySelector("#qol-tree-scroll") || document.querySelector("#qol-tree-scroll");
        if (!treeScroll || !this.treeData) return;

        treeScroll.innerHTML = "";

        const query = this.searchQuery;
        const activePath = this.activeWorkflowPath;
        const activeName = this.activeWorkflowName;

        // Build exact file lookup map (Strict relative paths only, no fuzzy basename fallback)
        const exactFilesMap = new Map();
        const collectFiles = (node) => {
            if (node.files) {
                node.files.forEach(f => {
                    const normPath = this.normalizePath(f.path).toLowerCase();
                    const normNoExt = normPath.replace(/\.json$/i, "");
                    exactFilesMap.set(normPath, f);
                    exactFilesMap.set(normNoExt, f);
                    exactFilesMap.set(normPath + ".json", f);
                });
            }
            if (node.folders) node.folders.forEach(collectFiles);
        };
        collectFiles(this.treeData);

        // 1. Collect Favorite Files (Filtered strictly to existing files with exact paths)
        let favFiles = [];
        const seenPaths = new Set();
        if (this.favorites && this.favorites.size > 0) {
            this.favorites.forEach(favPath => {
                const clean = this.normalizePath(favPath).toLowerCase();
                const cleanNoExt = clean.replace(/\.json$/i, "");
                const file = exactFilesMap.get(clean) || exactFilesMap.get(cleanNoExt);
                if (file && !seenPaths.has(file.path)) {
                    seenPaths.add(file.path);
                    const displayName = file.path.includes("/") ? file.path.replace(/\.json$/i, "") : file.name;
                    const notesMatch = file.notes && file.notes.toLowerCase().includes(query);
                    if (!query || displayName.toLowerCase().includes(query) || file.name.toLowerCase().includes(query) || file.filename.toLowerCase().includes(query) || notesMatch) {
                        favFiles.push({
                            ...file,
                            displayName: displayName
                        });
                    }
                }
            });
        }

        // 2. Render Bookmarks Section directly at top (순정 스타일과 동일하게 배치)
        if (favFiles.length > 0) {
            const bookmarksHeader = document.createElement("div");
            bookmarksHeader.className = "qol-section-header bookmarks-header";
            bookmarksHeader.innerHTML = `
                <span class="qol-section-title">Bookmarks</span>
                <span class="qol-section-count">${favFiles.length}</span>
            `;
            treeScroll.appendChild(bookmarksHeader);

            const bookmarksContainer = document.createElement("div");
            bookmarksContainer.className = "qol-bookmarks-container";

            favFiles.forEach(file => {
                const fileRow = document.createElement("div");
                fileRow.className = "qol-file-row qol-bookmark-row";
                fileRow.setAttribute("data-path", file.path);
                fileRow.setAttribute("data-kind", "file");
                const parentDir = file.path.includes("/") ? file.path.split("/").slice(0, -1).join("/") : "/";
                fileRow.setAttribute("data-parent-folder", parentDir);

                const isActive = this.isWorkflowMatch(file);
                if (isActive) fileRow.classList.add("active-workflow");

                const icon = document.createElement("span");
                icon.className = "qol-file-icon";
                icon.textContent = "📄";

                const name = document.createElement("span");
                name.className = "qol-file-name";
                name.innerHTML = this.highlightMatch(file.displayName || file.name, query);
                name.title = `${file.filename}\n경로: ${file.path}`;

                fileRow.appendChild(icon);
                fileRow.appendChild(name);

                // Harmonious badges & favorite star
                fileRow.appendChild(this.buildFileBadges(file, isActive, true));

                // Hover preview
                fileRow.addEventListener("mouseenter", () => {
                    this.scheduleHoverPreview(file, fileRow);
                });
                fileRow.addEventListener("mouseleave", () => {
                    this.cancelHoverPreview();
                });

                // Click to load — Ctrl/Shift clicks only multi-select instead.
                this.attachRowClickEvents(fileRow, "file", file.path, () => {
                    this.loadWorkflowToCanvas(file.path);
                });

                // Context menu
                fileRow.addEventListener("contextmenu", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.cancelHoverPreview();
                    this.showContextMenu(e, {
                        type: "file",
                        path: file.path,
                        name: file.name,
                        filename: file.filename,
                        notes: file.notes,
                        thumbnail: file.thumbnail
                    });
                });

                // Drag & drop
                this.attachRowDragEvents(fileRow, file, "file");

                bookmarksContainer.appendChild(fileRow);
            });

            treeScroll.appendChild(bookmarksContainer);
        }

        // 3. Render Browse Section Header
        const browseHeader = document.createElement("div");
        browseHeader.className = "qol-section-header browse-header";
        browseHeader.innerHTML = `
            <span class="qol-section-title">Browse</span>
        `;
        treeScroll.appendChild(browseHeader);

        // 4. Render Folder Tree & Root Workflows
        const createFolderNode = (folderNode, depth = 0) => {
            const isRoot = folderNode.path === "/";

            let filteredFiles = folderNode.files || [];
            let filteredFolders = folderNode.folders || [];
            if (query) {
                filteredFiles = filteredFiles.filter(f => 
                    f.name.toLowerCase().includes(query) || 
                    f.filename.toLowerCase().includes(query) ||
                    (f.notes && f.notes.toLowerCase().includes(query))
                );
                filteredFolders = filteredFolders.filter(f => {
                    const matchSelf = f.name.toLowerCase().includes(query);
                    const matchChildren = f.files.some(cf => 
                        cf.name.toLowerCase().includes(query) || 
                        (cf.notes && cf.notes.toLowerCase().includes(query))
                    );
                    return matchSelf || matchChildren;
                });
                if (!filteredFiles.length && !filteredFolders.length && !folderNode.name.toLowerCase().includes(query)) {
                    return null;
                }
            }

            const isExpanded = query ? true : this.expandedFolders.has(folderNode.path);

            const folderContainer = document.createElement("div");
            folderContainer.className = "qol-tree-node";
            folderContainer.setAttribute("data-folder-path", folderNode.path);

            if (!isRoot) {
                const folderRow = document.createElement("div");
                folderRow.className = "qol-folder-row";
                folderRow.setAttribute("data-path", folderNode.path);
                folderRow.setAttribute("data-kind", "folder");

                const chevron = document.createElement("span");
                chevron.className = `qol-chevron ${isExpanded ? "expanded" : ""}`;
                chevron.textContent = "▶";

                const icon = document.createElement("span");
                icon.className = "qol-folder-icon";
                icon.textContent = isExpanded ? "📂" : "📁";

                const name = document.createElement("span");
                name.className = "qol-folder-name";
                name.innerHTML = this.highlightMatch(folderNode.name, query);

                const countBadge = document.createElement("span");
                countBadge.className = `qol-count-badge ${folderNode.count === 0 ? "zero" : ""}`;
                countBadge.textContent = folderNode.count;

                folderRow.appendChild(chevron);
                folderRow.appendChild(icon);
                folderRow.appendChild(name);
                folderRow.appendChild(countBadge);

                // Expand/Collapse Click — Ctrl/Shift clicks only multi-select instead.
                this.attachRowClickEvents(folderRow, "folder", folderNode.path, () => {
                    if (this.expandedFolders.has(folderNode.path)) {
                        this.expandedFolders.delete(folderNode.path);
                    } else {
                        this.expandedFolders.add(folderNode.path);
                    }
                    this.renderPlusTree();
                });

                // Drag & drop
                this.attachRowDragEvents(folderRow, folderNode, "folder");

                // Context Menu
                folderRow.addEventListener("contextmenu", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.showContextMenu(e, {
                        type: "folder",
                        path: folderNode.path,
                        name: folderNode.name
                    });
                });

                folderContainer.appendChild(folderRow);
            }

            // Render children
            if (isRoot || isExpanded) {
                const childrenContainer = document.createElement("div");
                childrenContainer.className = isRoot ? "qol-root-children" : "qol-children-container";
                childrenContainer.setAttribute("data-folder-path", folderNode.path);

                filteredFolders.forEach(sub => {
                    const subEl = createFolderNode(sub, depth + 1);
                    if (subEl) childrenContainer.appendChild(subEl);
                });

                filteredFiles.forEach(file => {
                    const fileRow = document.createElement("div");
                    fileRow.className = "qol-file-row";
                    fileRow.setAttribute("data-path", file.path);
                    fileRow.setAttribute("data-kind", "file");
                    const parentDir = file.path.includes("/") ? file.path.split("/").slice(0, -1).join("/") : "/";
                    fileRow.setAttribute("data-parent-folder", parentDir);

                    const isActive = this.isWorkflowMatch(file);
                    if (isActive) {
                        fileRow.classList.add("active-workflow");
                    }

                    if (this.highlightedItem && (file.filename === this.highlightedItem || file.name === this.highlightedItem)) {
                        fileRow.classList.add("qol-moved-success");
                        setTimeout(() => {
                            fileRow.classList.remove("qol-moved-success");
                            this.highlightedItem = null;
                        }, 2200);
                    }

                    const icon = document.createElement("span");
                    icon.className = "qol-file-icon";
                    icon.textContent = "📄";

                    const name = document.createElement("span");
                    name.className = "qol-file-name";
                    name.innerHTML = this.highlightMatch(file.name, query);
                    name.title = `${file.filename}${BadaI18n.lang === "ko" ? "\n경로: " : "\nPath: "}${file.path}`;

                    fileRow.appendChild(icon);
                    fileRow.appendChild(name);

                    // Harmonious badges & favorite star
                    const isFav = this.isFavorited(file.path);
                    fileRow.appendChild(this.buildFileBadges(file, isActive, isFav));

                    // Hover preview
                    fileRow.addEventListener("mouseenter", () => {
                        this.scheduleHoverPreview(file, fileRow);
                    });
                    fileRow.addEventListener("mouseleave", () => {
                        this.cancelHoverPreview();
                    });

                    // Drag & drop
                    this.attachRowDragEvents(fileRow, file, "file");

                    // Click to load — Ctrl/Shift clicks only multi-select instead.
                    this.attachRowClickEvents(fileRow, "file", file.path, () => {
                        this.loadWorkflowToCanvas(file.path);
                    });

                    // Context Menu
                    fileRow.addEventListener("contextmenu", (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.cancelHoverPreview();
                        this.showContextMenu(e, {
                            type: "file",
                            path: file.path,
                            name: file.name,
                            filename: file.filename,
                            notes: file.notes,
                            thumbnail: file.thumbnail
                        });
                    });

                    childrenContainer.appendChild(fileRow);
                });

                folderContainer.appendChild(childrenContainer);
            }

            return folderContainer;
        };

        const treeDom = createFolderNode(this.treeData);
        if (treeDom) {
            treeScroll.appendChild(treeDom);
        }

        if (!treeScroll.children.length) {
            const emptyEl = document.createElement("div");
            emptyEl.style.padding = "20px 8px";
            emptyEl.style.textAlign = "center";
            emptyEl.style.color = "#71717a";
            emptyEl.style.fontSize = "11px";
            emptyEl.innerHTML = query ? BadaI18n.t("wf_empty_search") : BadaI18n.t("wf_empty_list");
            treeScroll.appendChild(emptyEl);
        }
    }

    setupContextMenu() {
        const menu = document.createElement("div");
        menu.className = "qol-context-menu";
        menu.innerHTML = `
            <div class="qol-menu-item" id="qol-m-load">
                <span class="qol-menu-icon">⚡</span> <span>${BadaI18n.t("wf_ctx_load")}</span>
            </div>
            <div class="qol-menu-item" id="qol-m-fav">
                <span class="qol-menu-icon" id="qol-m-fav-icon">⭐</span> <span id="qol-m-fav-text">${BadaI18n.t("wf_ctx_fav_add")}</span>
            </div>
            <div class="qol-menu-item" id="qol-m-edit-info">
                <span class="qol-menu-icon">📝</span> <span>${BadaI18n.t("wf_ctx_edit_info")}</span>
            </div>
            <div class="qol-menu-item" id="qol-m-move">
                <span class="qol-menu-icon">📁</span> <span>${BadaI18n.t("wf_ctx_move")}</span>
            </div>
            <div class="qol-menu-item" id="qol-m-new-subfolder">
                <span class="qol-menu-icon">➕</span> <span>${BadaI18n.t("wf_ctx_new_subfolder")}</span>
            </div>
            <div class="qol-menu-separator"></div>
            <div class="qol-menu-item" id="qol-m-rename">
                <span class="qol-menu-icon">✏️</span> <span>${BadaI18n.t("wf_ctx_rename")}</span>
            </div>
            <div class="qol-menu-item danger" id="qol-m-delete">
                <span class="qol-menu-icon">🗑️</span> <span>${BadaI18n.t("wf_ctx_delete")}</span>
            </div>
        `;
        document.body.appendChild(menu);
        this.contextMenuEl = menu;

        window.addEventListener("click", () => {
            menu.style.display = "none";
        });

        menu.querySelector("#qol-m-load").addEventListener("click", () => {
            if (this.contextTarget?.type === "file") {
                this.loadWorkflowToCanvas(this.contextTarget.path);
            }
        });

        menu.querySelector("#qol-m-fav").addEventListener("click", () => {
            if (this.contextTarget?.type === "file") {
                this.toggleFavorite(this.contextTarget.path);
            }
        });

        menu.querySelector("#qol-m-edit-info").addEventListener("click", () => {
            if (this.contextTarget?.type === "file") {
                this.openWorkflowInfoModal(this.contextTarget);
            }
        });

        menu.querySelector("#qol-m-move").addEventListener("click", () => {
            if (this.contextTarget?.type === "file") {
                this.openMoveModal(this.contextTarget.path);
            }
        });

        menu.querySelector("#qol-m-new-subfolder").addEventListener("click", () => {
            const parent = this.contextTarget?.type === "folder" ? this.contextTarget.path : "/";
            this.openNewFolderModal(parent);
        });

        menu.querySelector("#qol-m-rename").addEventListener("click", () => {
            if (this.contextTarget) {
                this.openRenameModal(this.contextTarget.path, this.contextTarget.type === "folder");
            }
        });

        menu.querySelector("#qol-m-delete").addEventListener("click", () => {
            if (this.contextTarget) {
                this.openDeleteConfirmModal(this.contextTarget.path, this.contextTarget.type === "folder");
            }
        });
    }

    showContextMenu(e, targetInfo) {
        this.contextTarget = targetInfo;
        const menu = this.contextMenuEl;

        const loadItem = menu.querySelector("#qol-m-load");
        const favItem = menu.querySelector("#qol-m-fav");
        const favIcon = menu.querySelector("#qol-m-fav-icon");
        const favText = menu.querySelector("#qol-m-fav-text");
        const editInfoItem = menu.querySelector("#qol-m-edit-info");
        const moveItem = menu.querySelector("#qol-m-move");
        const newSubItem = menu.querySelector("#qol-m-new-subfolder");

        if (targetInfo.type === "file") {
            loadItem.style.display = "flex";
            if (editInfoItem) editInfoItem.style.display = "flex";
            moveItem.style.display = "flex";
            newSubItem.style.display = "none";
            if (favItem) {
                favItem.style.display = "flex";
                const isFav = this.favorites.has(targetInfo.path);
                if (favIcon) favIcon.textContent = isFav ? "★" : "⭐";
                if (favText) favText.textContent = isFav ? BadaI18n.t("wf_ctx_fav_remove") : BadaI18n.t("wf_ctx_fav_add");
            }
        } else if (targetInfo.type === "folder") {
            loadItem.style.display = "none";
            if (editInfoItem) editInfoItem.style.display = "none";
            moveItem.style.display = "none";
            newSubItem.style.display = "flex";
            if (favItem) favItem.style.display = "none";
        }

        // CLAMP TO THE VIEWPORT (2026-10-04). This used to hardcode guesses:
        //     left = min(clientX, innerWidth - 200)
        //     top  = min(clientY, innerHeight - 180)
        // 180px is far shorter than the real menu (6 items + a separator ≈ 300px), so
        // right-clicking a workflow near the BOTTOM of the list clamped `top` to a value that
        // still left the lower half below the fold. The user reported exactly that: Rename was
        // the last visible item and Delete was invisible. Mid-list rows only looked right
        // because the guess happened to leave room there.
        //
        // Display BEFORE positioning: offsetWidth/offsetHeight are 0 on a display:none element,
        // and the per-item show/hide above must have run first (the folder menu is shorter than
        // the file menu, so one measurement serves both).
        menu.style.display = "block";
        placeMenuInViewport(menu, e.clientX, e.clientY);
    }

    async getFolderList() {
        try {
            const res = await fetch("/api/qol/workflows/folders");
            if (res.ok) {
                const data = await res.json();
                return data.folders || ["/"];
            }
        } catch (e) { console.debug("[Bada] ignored:", e); }
        return ["/"];
    }

    // =========================================================================
    // ★ Save As Folder Picker  (ComfyUI File ▸ Save As ▸ 폴더 지정 저장)
    // -------------------------------------------------------------------------
    // 네이티브 흐름 (comfyui-frontend 1.53.x):
    //   Command "Comfy.SaveWorkflowAs" → workflowService.saveWorkflowAs(wf)
    //     → wf.promptSave()                        ← 순정 "Enter the filename:" 창
    //     → 저장 경로 = wf.directory + "/" + 이름 + ".json"
    // 따라서 ComfyWorkflow 프로토타입의 promptSave() 한 곳만 감싸면 되고,
    // 폴더 선택 결과를 wf.directory 에 잠시 반영하는 것만으로 네이티브 저장
    // (덮어쓰기 확인, saveAs/rename, 탭 상태, draft, 북마크)을 100% 재사용한다.
    // 어떤 이유로든 실패하면 원래 promptSave() 로 폴백하므로 순정 동작이 보존된다.
    // =========================================================================

    isSaveAsFolderPickerEnabled() {
        try {
            const v = window.app?.ui?.settings?.getSettingValue?.("BadaUtils.SaveAsFolderPicker");
            if (typeof v === "boolean") return v;
        } catch (e) { console.debug("[Bada] ignored:", e); }
        try {
            const local = localStorage.getItem("Comfy.Settings.BadaUtils.SaveAsFolderPicker");
            if (local !== null) return JSON.parse(local);
        } catch (e) { console.debug("[Bada] ignored:", e); }
        return true;
    }

    findComfyWorkflowPrototype() {
        try {
            const pinia = window.__pinia ||
                window.__VUE_DEVTOOLS_GLOBAL_HOOK__?.apps?.[0]?.config?.globalProperties?.$pinia ||
                document.querySelector("#vue-app")?.__vue_app__?.config?.globalProperties?.$pinia;
            const store = pinia?._s?.get("workflow");
            const instance = store?.activeWorkflow ||
                (Array.isArray(store?.openWorkflows) ? store.openWorkflows[0] : null) ||
                (Array.isArray(store?.persistedWorkflows) ? store.persistedWorkflows[0] : null) ||
                null;
            if (!instance) return null;

            const proto = Object.getPrototypeOf(instance);
            // 워크플로우 클래스(basePath "workflows/")만 대상. 서브그래프 블루프린트("subgraphs/")는 제외.
            if (proto?.constructor?.basePath === "workflows/" && typeof proto.promptSave === "function") {
                return proto;
            }
        } catch (e) { console.debug("[Bada] ignored:", e); }
        return null;
    }

    setupSaveAsFolderPicker() {
        const hook = () => {
            const proto = this.findComfyWorkflowPrototype();
            if (!proto || proto.__badaSaveAsPicker) return !!proto;

            const manager = this;
            const origPromptSave = proto.promptSave;

            proto.promptSave = async function (...args) {
                if (!manager.isSaveAsFolderPickerEnabled()) {
                    return await origPromptSave.apply(this, args);
                }
                try {
                    const picked = await manager.openSaveAsModal(this);
                    if (!picked || !picked.name) return null;   // 취소 → saveWorkflowAs() 가 중단된다

                    const prevDir = this.directory;
                    const prevPath = this.path;
                    if (picked.directory && picked.directory !== prevDir) {
                        // 네이티브 saveWorkflowAs() 가 "directory + / + 이름 + .json" 으로 저장한다.
                        this.directory = picked.directory;
                        setTimeout(() => {
                            // 저장이 성공하면 path 가 새 경로로 바뀐다. 바뀌지 않았다면
                            // (덮어쓰기 취소/오류) 원래 폴더로 되돌려 다음 저장에 영향이 없게 한다.
                            if (this.path === prevPath && this.directory !== prevDir) {
                                this.directory = prevDir;
                            }
                        }, 4000);
                    }
                    return picked.name;
                } catch (e) {
                    console.warn("[BadaUtils] Save As folder picker failed — falling back to native dialog:", e);
                    return await origPromptSave.apply(this, args);
                }
            };

            proto.__badaSaveAsPicker = true;
            console.log("[BadaUtils] Save As Folder Picker hooked:", proto.constructor?.name || "ComfyWorkflow");
            return true;
        };

        if (hook()) return;

        // 워크플로우 인스턴스가 아직 생성되지 않았을 수 있으므로 준비될 때까지 재시도 (기존 코드 관례와 동일)
        let tries = 0;
        this._saveAsHookTimer = setInterval(() => {
            tries += 1;
            if (hook() || tries >= 60) {
                clearInterval(this._saveAsHookTimer);
                this._saveAsHookTimer = null;
            }
        }, 2000);
    }

    folderToDirectory(folder) {
        const clean = String(folder || "/").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
        return clean ? `workflows/${clean}` : "workflows";
    }

    directoryToFolder(dir) {
        const clean = String(dir || "").replace(/\\/g, "/").replace(/\/+$/g, "");
        if (!clean || clean === "workflows") return "/";
        return "/" + clean.replace(/^workflows\//, "");
    }

    normalizeFolderPath(rawPath) {
        const clean = String(rawPath ?? "").replace(/\\/g, "/").replace(/\/+$/g, "");
        if (!clean || clean === "/") return "/";
        return clean.startsWith("/") ? clean : "/" + clean;
    }

    /**
     * Windows Explorer-style folder tree (folders only, hierarchy kept).
     * The server tree stores paths without a leading slash ("1234/4567"),
     * while the folder API uses "/1234/4567" - everything is normalised here.
     * Returns the flat list of *visible* rows so keyboard navigation can reuse it.
     */
    renderSaveAsTree(container, selectedPath, expandedPaths) {
        const rows = [];
        const walk = (node, depth) => {
            const isRoot = depth === 0;
            const path = isRoot ? "/" : this.normalizeFolderPath(node.path);
            const children = (node.folders || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
            const hasChildren = children.length > 0;
            const expanded = isRoot || expandedPaths.has(path);
            rows.push({
                path,
                depth,
                hasChildren,
                expanded,
                name: isRoot ? BadaI18n.t("wf_saveas_root") : node.name,
                count: node.count || 0,
            });
            if (hasChildren && expanded) children.forEach((sub) => walk(sub, depth + 1));
        };
        if (this.treeData) walk(this.treeData, 0);

        container.innerHTML = rows.map((row) => {
            const chevron = row.hasChildren
                ? `<span class="qol-sa-chevron" data-toggle="1">${row.expanded ? "▼" : "▶"}</span>`
                : `<span class="qol-sa-chevron empty">▶</span>`;
            const icon = row.path === "/" ? "🏠" : (row.expanded ? "📂" : "📁");
            const count = row.count ? `<span class="qol-sa-count">${row.count}</span>` : "";
            return `<div class="qol-sa-row ${row.path === selectedPath ? "selected" : ""}" data-path="${escapeHtml(row.path)}" ` +
                `style="padding-left:${8 + row.depth * 16}px;">${chevron}<span class="qol-sa-icon">${icon}</span>` +
                `<span class="qol-sa-name">${escapeHtml(row.name)}</span>${count}</div>`;
        }).join("");

        return rows;
    }

    sanitizeWorkflowName(raw) {
        let name = String(raw ?? "")
            .replace(/[\\/:*?"<>|]/g, "")
            .replace(/\.+$/g, "")
            .trim();
        name = name.replace(/\.app\.json$/i, "").replace(/\.json$/i, "");
        return name.trim();
    }

    getRememberedSaveFolder() {
        try {
            return localStorage.getItem("bada_saveas_last_folder") || "";
        } catch (e) {
            return "";
        }
    }

    rememberSaveFolder(folder) {
        try {
            localStorage.setItem("bada_saveas_last_folder", folder || "/");
        } catch (e) { console.debug("[Bada] ignored:", e); }
    }

    workflowExistsAt(folder, name) {
        try {
            if (!this.treeData || !name) return false;
            const rel = String(folder || "/").replace(/^\/+|\/+$/g, "");
            const target = (rel ? `${rel}/` : "") + name;
            const wanted = new Set([`${target}.json`.toLowerCase(), `${target}.app.json`.toLowerCase()]);
            const walk = (node) => {
                if (!node) return false;
                for (const f of (node.files || [])) {
                    if (wanted.has(String(f.path || "").toLowerCase())) return true;
                }
                for (const sub of (node.folders || [])) {
                    if (walk(sub)) return true;
                }
                return false;
            };
            return walk(this.treeData);
        } catch (e) {
            return false;
        }
    }

    async createWorkflowFolder(parentFolder, folderName) {
        const clean = String(folderName || "").replace(/[\\/:*?"<>|]/g, "").replace(/\.+$/g, "").trim();
        if (!clean) return null;
        try {
            const res = await fetch("/api/qol/workflows/create_folder", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ folder_name: clean, parent_folder: parentFolder || "/" })
            });
            const data = await res.json();
            if (data.success) {
                if (parentFolder && parentFolder !== "/") this.expandedFolders.add(parentFolder);
                await this.loadTree();
                return data.path || null;
            }
            this.showToast(data.error || (BadaI18n.lang === "ko" ? "폴더 생성 실패" : "Failed to create folder"), true);
        } catch (e) {
            this.showToast(`Error: ${e.message}`, true);
        }
        return null;
    }

    async openSaveAsModal(wf) {
        const isKo = BadaI18n.lang === "ko";
        if (!this.treeData) {
            try { await this.loadTree(); } catch (e) { console.debug("[Bada] ignored:", e); }
        }

        let folders = await this.getFolderList();
        const currentFolder = this.directoryToFolder(wf?.directory);
        const remembered = this.getRememberedSaveFolder();
        let initialFolder = currentFolder;
        if ((wf?.isTemporary || currentFolder === "/") && remembered && folders.includes(remembered)) {
            initialFolder = remembered;
        }
        if (!folders.includes(initialFolder)) initialFolder = "/";

        const initialName = this.sanitizeWorkflowName(wf?.filename) || (isKo ? "제목 없음" : "Untitled");

        return new Promise((resolve) => {
            const overlay = document.createElement("div");
            overlay.className = "qol-modal-overlay";
            overlay.innerHTML = `
                <div class="qol-modal-dialog">
                    <div class="qol-modal-header">
                        <span>${BadaI18n.t("wf_saveas_title")}</span>
                        <span style="cursor:pointer;" id="qol-sa-close">&times;</span>
                    </div>
                    <div class="qol-modal-body">
                        <div>
                            <div class="qol-form-label" style="margin-bottom:4px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
                                <span>${BadaI18n.t("wf_saveas_folder")}</span>
                                <button class="qol-btn" id="qol-sa-newbtn" style="padding:2px 10px; font-size:12px; white-space:nowrap;">${BadaI18n.t("wf_saveas_new_folder")}</button>
                            </div>
                            <div id="qol-sa-tree" class="qol-sa-tree" tabindex="0" role="tree" aria-label="${BadaI18n.t("wf_saveas_folder")}"></div>
                            <div id="qol-sa-breadcrumb" class="qol-sa-breadcrumb"></div>
                            <div class="qol-sa-hint">${BadaI18n.t("wf_saveas_tree_hint")}</div>
                            <div id="qol-sa-newrow" style="display:none; margin-top:8px; gap:6px; align-items:center;">
                                <input type="text" class="qol-input" id="qol-sa-newparent" style="flex:0 0 38%;" readonly />
                                <input type="text" class="qol-input" id="qol-sa-newname" style="flex:1 1 auto;" placeholder="${BadaI18n.t("wf_saveas_new_folder_ph")}" />
                                <button class="qol-btn qol-btn-primary" id="qol-sa-newcreate" style="white-space:nowrap;">${BadaI18n.t("wf_saveas_new_folder_btn")}</button>
                            </div>
                        </div>
                        <div>
                            <div class="qol-form-label" style="margin-bottom:4px;">${BadaI18n.t("wf_saveas_name")}</div>
                            <input type="text" class="qol-input" id="qol-sa-name" value="${escapeHtml(initialName)}" />
                        </div>
                        <div id="qol-sa-path" style="font-size:12px; line-height:1.5; opacity:0.85; word-break:break-all;"></div>
                    </div>
                    <div class="qol-modal-footer">
                        <button class="qol-btn qol-btn-cancel" id="qol-sa-cancel">${BadaI18n.t("wf_cancel_btn")}</button>
                        <button class="qol-btn qol-btn-primary" id="qol-sa-confirm">${BadaI18n.t("wf_saveas_confirm")}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            const treeEl = overlay.querySelector("#qol-sa-tree");
            const crumbEl = overlay.querySelector("#qol-sa-breadcrumb");
            const nameInput = overlay.querySelector("#qol-sa-name");
            const newRow = overlay.querySelector("#qol-sa-newrow");
            const newParent = overlay.querySelector("#qol-sa-newparent");
            const newName = overlay.querySelector("#qol-sa-newname");
            const pathEl = overlay.querySelector("#qol-sa-path");

            let selectedPath = this.normalizeFolderPath(initialFolder);
            const expandedPaths = new Set(["/"]);
            (() => {
                let acc = "";
                selectedPath.split("/").filter(Boolean).forEach((part) => {
                    acc += "/" + part;
                    expandedPaths.add(acc);
                });
            })();
            let visibleRows = [];

            let settled = false;
            const finish = (value) => {
                if (settled) return;
                settled = true;
                try { overlay.remove(); } catch (e) { console.debug("[Bada] ignored:", e); }
                resolve(value);
            };
            const cancel = () => finish(null);

            const renderTree = () => {
                visibleRows = this.renderSaveAsTree(treeEl, selectedPath, expandedPaths);
            };

            const renderBreadcrumb = () => {
                const parts = selectedPath.split("/").filter(Boolean);
                crumbEl.innerHTML = `<span>${BadaI18n.t("wf_saveas_selected")}</span> <b>🏠 ${escapeHtml(BadaI18n.t("wf_saveas_root"))}</b>` +
                    parts.map((part) => `<span>›</span><b>${escapeHtml(part)}</b>`).join("");
            };

            const refreshPreview = () => {
                const name = this.sanitizeWorkflowName(nameInput.value);
                const dir = this.folderToDirectory(selectedPath);
                const exists = !!name && this.workflowExistsAt(selectedPath, name);
                pathEl.innerHTML = `${exists ? "⚠️" : "📂"} ${BadaI18n.t("wf_saveas_path")}: <strong>${escapeHtml(`${dir}/${name || "..."}.json`)}</strong>` +
                    (exists ? ` <span style="color:#fbbf24;">${escapeHtml(BadaI18n.t("wf_saveas_exists"))}</span>` : "");
                newParent.value = selectedPath;
            };

            const refreshAll = () => {
                renderTree();
                renderBreadcrumb();
                refreshPreview();
            };

            const selectPath = (path, keepTreeFocus = false) => {
                selectedPath = this.normalizeFolderPath(path);
                refreshAll();
                if (keepTreeFocus) treeEl.focus();
            };

            const confirmSave = () => {
                const name = this.sanitizeWorkflowName(nameInput.value);
                if (!name) {
                    this.showToast(BadaI18n.t("wf_saveas_name_required"), true);
                    nameInput.focus();
                    return;
                }
                this.rememberSaveFolder(selectedPath);
                finish({ name, folder: selectedPath, directory: this.folderToDirectory(selectedPath) });
            };

            overlay.querySelector("#qol-sa-close").onclick = cancel;
            overlay.querySelector("#qol-sa-cancel").onclick = cancel;
            overlay.querySelector("#qol-sa-confirm").onclick = confirmSave;
            nameInput.oninput = refreshPreview;

            // Explorer-style tree: click a row to select, click ▶/▼ (or double-click) to expand
            treeEl.addEventListener("click", (e) => {
                const row = e.target.closest(".qol-sa-row");
                if (!row) return;
                const path = row.getAttribute("data-path");
                const wantsToggle = !!e.target.closest(".qol-sa-chevron[data-toggle]") || e.detail === 2;
                if (wantsToggle) {
                    const entry = visibleRows.find((r) => r.path === path);
                    if (entry && entry.hasChildren) {
                        if (expandedPaths.has(path)) expandedPaths.delete(path);
                        else expandedPaths.add(path);
                    }
                }
                selectPath(path, true);
            });

            // Explorer-style keyboard: ↑/↓ move, → expand or step into, ← collapse or step out
            treeEl.addEventListener("keydown", (e) => {
                const idx = visibleRows.findIndex((r) => r.path === selectedPath);
                const row = visibleRows[idx];
                if (e.key === "ArrowDown" && idx > -1 && idx < visibleRows.length - 1) {
                    e.preventDefault();
                    selectPath(visibleRows[idx + 1].path, true);
                } else if (e.key === "ArrowUp" && idx > 0) {
                    e.preventDefault();
                    selectPath(visibleRows[idx - 1].path, true);
                } else if (e.key === "ArrowRight" && row) {
                    e.preventDefault();
                    if (row.hasChildren && !expandedPaths.has(row.path)) {
                        expandedPaths.add(row.path);
                    } else if (row.hasChildren && visibleRows[idx + 1] && visibleRows[idx + 1].depth > row.depth) {
                        selectedPath = visibleRows[idx + 1].path;
                    }
                    refreshAll();
                } else if (e.key === "ArrowLeft" && row) {
                    e.preventDefault();
                    if (row.hasChildren && expandedPaths.has(row.path)) {
                        expandedPaths.delete(row.path);
                    } else {
                        selectedPath = this.normalizeFolderPath(selectedPath.split("/").slice(0, -1).join("/"));
                    }
                    refreshAll();
                }
            });

            overlay.querySelector("#qol-sa-newbtn").onclick = () => {
                const willShow = newRow.style.display === "none" || !newRow.style.display;
                newRow.style.display = willShow ? "flex" : "none";
                if (willShow) {
                    refreshPreview();
                    newName.focus();
                }
            };

            overlay.querySelector("#qol-sa-newcreate").onclick = async () => {
                const parent = selectedPath;
                const created = await this.createWorkflowFolder(parent, newName.value);
                if (!created) return;
                newName.value = "";
                newRow.style.display = "none";
                // 부모와 새로 만든 폴더까지 자동으로 펼쳐서 트리에 즉시 보이게 한다
                expandedPaths.add(parent);
                let acc = "";
                this.normalizeFolderPath(created).split("/").filter(Boolean).forEach((part) => {
                    acc += "/" + part;
                    expandedPaths.add(acc);
                });
                selectPath(created);
                this.showToast(BadaI18n.t("wf_saveas_new_folder_done", { folder: created }));
            };

            overlay.addEventListener("keydown", (e) => {
                if (e.key === "Escape") {
                    e.preventDefault();
                    cancel();
                } else if (e.key === "Enter") {
                    if (document.activeElement === newName) {
                        e.preventDefault();
                        overlay.querySelector("#qol-sa-newcreate").click();
                    } else {
                        e.preventDefault();
                        confirmSave();
                    }
                }
            });

            refreshAll();
            setTimeout(() => {
                nameInput.focus();
                nameInput.select();
            }, 30);
        });
    }




    async openMoveModal(workflowPath) {
        const folders = await this.getFolderList();
        const currentFolder = workflowPath.includes("/") ? workflowPath.split("/").slice(0, -1).join("/") : "/";

        const overlay = document.createElement("div");
        overlay.className = "qol-modal-overlay";
        overlay.innerHTML = `
            <div class="qol-modal-dialog">
                <div class="qol-modal-header">
                    <span>${BadaI18n.t("wf_modal_move_title")}</span>
                    <span style="cursor:pointer;" id="qol-m-close">&times;</span>
                </div>
                <div class="qol-modal-body">
                    <div style="font-size: 12px; color: #93c5fd; background: #27272a; padding: 6px 10px; border-radius: 5px; word-break: break-all;">
                        📄 ${workflowPath}
                    </div>
                    <div>
                        <div class="qol-form-label" style="margin-bottom:4px;">${BadaI18n.t("wf_modal_move_dest")}</div>
                        <select class="qol-select" id="qol-dest-select">
                            <option value="/">[Root] /</option>
                            ${folders.filter(f => f !== "/").map(f => `<option value="${f}" ${f === currentFolder ? 'disabled' : ''}>📁 ${f} ${f === currentFolder ? '(Current)' : ''}</option>`).join("")}
                        </select>
                    </div>
                    <div>
                        <div class="qol-form-label" style="margin-bottom:4px;">${BadaI18n.t("wf_modal_move_or_sub")}</div>
                        <input type="text" class="qol-input" id="qol-new-sub-input" placeholder="e.g. 4.SDXL_Upscale" />
                    </div>
                </div>
                <div class="qol-modal-footer">
                    <button class="qol-btn qol-btn-cancel" id="qol-m-cancel">${BadaI18n.t("wf_cancel_btn")}</button>
                    <button class="qol-btn qol-btn-primary" id="qol-m-confirm">${BadaI18n.t("wf_modal_move_btn")}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.querySelector("#qol-m-close").onclick = close;
        overlay.querySelector("#qol-m-cancel").onclick = close;
        overlay.querySelector("#qol-m-confirm").onclick = async () => {
            const selectVal = overlay.querySelector("#qol-dest-select").value;
            const customSub = overlay.querySelector("#qol-new-sub-input").value.trim();
            let target = selectVal;
            if (customSub) {
                target = target === "/" ? customSub : `${target}/${customSub}`;
            }
            close();
            await this.moveWorkflowFile(workflowPath, target);
        };
    }

    async openNewFolderModal(defaultParent = "/") {
        const folders = await this.getFolderList();

        const overlay = document.createElement("div");
        overlay.className = "qol-modal-overlay";
        overlay.innerHTML = `
            <div class="qol-modal-dialog">
                <div class="qol-modal-header">
                    <span>${BadaI18n.t("wf_modal_mkdir_title")}</span>
                    <span style="cursor:pointer;" id="qol-m-close">&times;</span>
                </div>
                <div class="qol-modal-body">
                    <div>
                        <div class="qol-form-label" style="margin-bottom:4px;">${BadaI18n.t("wf_modal_mkdir_parent")}</div>
                        <select class="qol-select" id="qol-parent-select">
                            <option value="/">[Root] /</option>
                            ${folders.filter(f => f !== "/").map(f => `<option value="${f}" ${f === defaultParent ? "selected" : ""}>📁 ${f}</option>`).join("")}
                        </select>
                    </div>
                    <div>
                        <div class="qol-form-label" style="margin-bottom:4px;">${BadaI18n.t("wf_modal_mkdir_name")}</div>
                        <input type="text" class="qol-input" id="qol-folder-name-input" placeholder="e.g. 1234 or 5.FLUX_Lora" autofocus />
                    </div>
                </div>
                <div class="qol-modal-footer">
                    <button class="qol-btn qol-btn-cancel" id="qol-m-cancel">${BadaI18n.t("wf_cancel_btn")}</button>
                    <button class="qol-btn qol-btn-primary" id="qol-m-confirm">${BadaI18n.t("wf_modal_mkdir_btn")}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.querySelector("#qol-m-close").onclick = close;
        overlay.querySelector("#qol-m-cancel").onclick = close;
        overlay.querySelector("#qol-m-confirm").onclick = async () => {
            const parent = overlay.querySelector("#qol-parent-select").value;
            const name = overlay.querySelector("#qol-folder-name-input").value.trim();
            if (!name) return;

            try {
                const res = await fetch("/api/qol/workflows/create_folder", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ folder_name: name, parent_folder: parent })
                });
                const data = await res.json();
                if (data.success) {
                    this.showToast(BadaI18n.lang === "ko" ? `폴더 '${name}' 생성 완료!` : `Folder '${name}' created!`);
                    close();
                    if (parent !== "/") this.expandedFolders.add(parent);
                    await this.loadTree();
                } else {
                    this.showToast(data.error || (BadaI18n.lang === "ko" ? "생성 실패" : "Failed to create folder"), true);
                }
            } catch (e) {
                this.showToast(`Error: ${e.message}`, true);
            }
        };
    }

    /**
     * Splits a sidebar path into its parent folder and its own name.
     *
     * The tree deliberately uses two different shapes: FOLDER rows keep a leading slash
     * ("/A/B", "/" for the root) while FILE rows do not ("A/B.json"). A naive
     * `includes("/") ? split("/").slice(0, -1).join("/") : "/"` therefore yielded "" for a
     * root-level folder, which then built a wrong destination path.
     */
    splitSidebarPath(path) {
        const parts = String(path || "").replace(/\\/g, "/").split("/").filter(Boolean);
        const name = parts.pop() || "";
        return { parent: parts.length ? `/${parts.join("/")}` : "/", name };
    }

    /**
     * Expands every ancestor folder of `path`.
     *
     * Both the bare ("A/B") and leading-slash ("/A/B") forms are registered because the tree
     * render matches the latter while several older call sites store the former.
     */
    expandAncestorsOf(path) {
        const parts = String(path || "").replace(/\\/g, "/").split("/").filter(Boolean);
        parts.pop(); // drop the entry itself, keep only its ancestors
        let acc = "";
        for (const p of parts) {
            acc = acc ? `${acc}/${p}` : p;
            this.expandedFolders.add(acc);
            this.expandedFolders.add(`/${acc}`);
        }
    }

    // =========================================================================
    // Multi-select (Ctrl / Shift + click), then drag to move several rows at once
    // =========================================================================

    /** Selection key for a sidebar row: "<kind>:<normalised path>". */
    selectionKey(kind, path) {
        return `${kind}:${this.normalizePath(path)}`;
    }

    parseSelectionKey(key) {
        const sep = key.indexOf(":");
        return { kind: key.slice(0, sep), path: key.slice(sep + 1) };
    }

    /** Bookmarks and the tree are separate lists, so a range must not span the two. */
    selectionSectionOf(row) {
        return row.closest(".qol-bookmarks-container") ? "bookmarks" : "tree";
    }

    /** Visible selectable rows in visual (DOM) order. */
    getSelectableRows() {
        return Array.from(document.querySelectorAll(".qol-folder-row[data-path], .qol-file-row[data-path]"));
    }

    rowSelectionKey(row) {
        return this.selectionKey(row.getAttribute("data-kind"), row.getAttribute("data-path"));
    }

    isSelected(kind, path) {
        return this.selection.has(this.selectionKey(kind, path));
    }

    clearSelection() {
        if (!this.selection.size && !this.selectionAnchor) return;
        this.selection.clear();
        this.selectionAnchor = null;
        this.applySelectionHighlight();
    }

    /** Re-applies `.qol-selected` to every rendered row (after a re-render or a change). */
    applySelectionHighlight() {
        this.getSelectableRows().forEach((row) => {
            row.classList.toggle("qol-selected", this.selection.has(this.rowSelectionKey(row)));
        });
    }

    setSelection(keys, anchor) {
        this.selection = new Set(keys);
        this.selectionAnchor = anchor ?? (this.selection.size ? [...this.selection][this.selection.size - 1] : null);
        this.applySelectionHighlight();
    }

    /**
     * Shift+Click: selects every workflow row visible between the anchor and `key`.
     *
     * Folder rows are deliberately skipped: a range that ran across them would build the
     * mixed folder+workflow selection that reads as a bug (a folder plus its own children,
     * which then travel to the destination twice).
     */
    selectRangeTo(key) {
        const isFileRow = (r) => r.getAttribute("data-kind") === "file";
        const rows = this.getSelectableRows().filter(isFileRow);
        const targetRow = rows.find((r) => this.rowSelectionKey(r) === key);
        // A bookmark and the same workflow in the tree share one selection key, so the anchor
        // must be looked up inside the section the user actually clicked in.
        const section = targetRow ? this.selectionSectionOf(targetRow) : null;
        const inSection = (r) => !section || this.selectionSectionOf(r) === section;

        const anchorRow = rows.find((r) => this.rowSelectionKey(r) === this.selectionAnchor && inSection(r));
        if (!anchorRow) {
            this.setSelection([key], key);
            return;
        }
        const list = rows.filter(inSection);
        const from = list.findIndex((r) => this.rowSelectionKey(r) === this.selectionAnchor);
        const to = list.findIndex((r) => this.rowSelectionKey(r) === key);
        if (from < 0 || to < 0) {
            this.setSelection([key], key);
            return;
        }
        const [lo, hi] = from <= to ? [from, to] : [to, from];
        this.setSelection(list.slice(lo, hi + 1).map((r) => this.rowSelectionKey(r)), this.selectionAnchor);
    }

    /**
     * The single place implementing click semantics for every sidebar row:
     *   plain click -> select it alone, then run the row's default action (load / expand)
     *   Ctrl+click  -> toggle it in the selection, default action suppressed
     *   Shift+click -> select the visible range from the anchor, default action suppressed
     *
     * Ctrl/Shift must NOT open the workflow: before this, both simply triggered the plain
     * click, so every "add to selection" click silently replaced the loaded graph.
     *
     * FOLDERS NEVER JOIN A MULTI-SELECTION. A modifier click on a folder row narrows the
     * selection to that one folder, so a folder can never be mixed with workflows and
     * folders can never be multi-selected. Without this, selecting a folder together with
     * some of its own children looks like a bug: the children are dragged out of the
     * folder while the folder itself is dragged too.
     */
    handleRowClick(e, kind, path, runDefaultAction) {
        e.stopPropagation();
        if (this.justFinishedDrag) return;

        const key = this.selectionKey(kind, path);
        const modified = e.ctrlKey || e.metaKey || e.shiftKey;

        if (kind === "folder" && modified) {
            this.setSelection([key], key);
            return;
        }

        if (e.shiftKey && this.selectionAnchor) {
            this.selectRangeTo(key);
            return;
        }

        if (e.ctrlKey || e.metaKey) {
            if (this.selection.has(key)) this.selection.delete(key);
            else this.selection.add(key);
            this.selectionAnchor = key;
            this.applySelectionHighlight();
            return;
        }

        this.setSelection([key], key);
        if (runDefaultAction) runDefaultAction();
    }

    attachRowClickEvents(rowEl, kind, path, runDefaultAction) {
        rowEl.addEventListener("click", (e) => this.handleRowClick(e, kind, path, runDefaultAction));
    }

    setupMultiSelect() {
        window.addEventListener("keydown", (e) => {
            if (e.key !== "Escape") return;
            const active = document.activeElement;
            if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) return;
            this.clearSelection();
        });
    }

    /**
     * Turns the current selection into the rows a drag should carry.
     *
     * Dragging a row that belongs to a multi-selection carries the whole selection; dragging
     * an unselected row carries only that row, because a bare click on a workflow opens it
     * rather than selecting it, and silently dragging a stale selection would be surprising.
     *
     * This is the ONLY producer of moveSelectionToFolder() input, so it is also where the
     * "a multi-selection never contains a folder" rule is enforced a second time: handle-
     * RowClick() already prevents it, and if a folder ever slipped in anyway we fall back to
     * dragging just the grabbed row rather than producing a confusing mixed batch.
     */
    resolveDragEntries(kind, path) {
        const key = this.selectionKey(kind, path);
        if (!this.selection.has(key) || this.selection.size < 2) {
            return [{ kind, path, key }];
        }
        const keys = [...this.selection];
        if (keys.some((k) => k.startsWith("folder:"))) {
            return [{ kind, path, key }];
        }
        return keys.map((k) => {
            const parsed = this.parseSelectionKey(k);
            return { kind: parsed.kind, path: parsed.path, key: k };
        });
    }

    /**
     * Moves several rows into `targetFolder` in a single pass.
     *
     * The UI only ever hands this workflows (folders are kept out of multi-selections), but
     * the guards below stay so the helper is safe for any future caller:
     *   - rows nested inside another moved folder travel with it and are dropped from the
     *     batch, since once that parent has moved their old path no longer exists;
     *   - the target itself, and anything that would end up nested inside itself, is skipped;
     *   - rows already sitting in the target folder are skipped.
     * The tree is reloaded once at the end instead of once per item, and each successful move
     * rebases the sidebar state.
     */
    async moveSelectionToFolder(entries, targetFolder) {
        const isKo = BadaI18n.lang === "ko";
        const target = String(targetFolder || "/").replace(/\\/g, "/").trim() || "/";
        const targetKey = this.normalizePath(target);

        const selectedFolderKeys = entries.filter((e) => e.kind === "folder").map((e) => this.normalizePath(e.path));
        const batch = entries.filter((e) => {
            const key = this.normalizePath(e.path);
            if (key === targetKey) return false;
            // A folder may not be moved into itself or into one of its own subfolders.
            if (e.kind === "folder" && targetKey.startsWith(`${key}/`)) return false;
            // Anything inside another selected folder rides along with that folder.
            if (selectedFolderKeys.some((fk) => key.startsWith(`${fk}/`))) return false;
            return true;
        });

        const moved = [];
        const failed = [];
        for (const entry of batch) {
            if (this.splitSidebarPath(entry.path).parent === target) continue; // already there
            try {
                const res = await fetch("/api/qol/workflows/move", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        source_path: entry.path,
                        target_folder: target,
                        new_name: "",
                        overwrite: false
                    })
                });
                const data = await res.json();
                if (!data.success) {
                    failed.push(entry);
                    continue;
                }
                moved.push({ ...entry, newPath: (data.new_path || "").replace(/\\/g, "/") });
            } catch (e) {
                failed.push(entry);
            }
        }

        if (!moved.length) {
            if (failed.length) this.showToast(isKo ? "선택한 항목을 이동하지 못했습니다." : "Could not move the selected items.", true);
            return { moved, failed };
        }

        // Follow the moved rows with the rest of the sidebar state (expanded folders,
        // bookmarks, active workflow and the selection itself).
        for (const entry of moved) {
            const newPath = entry.newPath || "";
            if (!newPath) continue;
            if (entry.kind === "folder") {
                await this.rebaseSidebarStateAfterFolderMove(entry.path, newPath);
            } else {
                if (this.activeWorkflowPath === entry.path) this.setActiveWorkflow(newPath, false);
                if (this.isFavorited(entry.path)) {
                    this.favorites.delete(this.normalizePath(entry.path));
                    this.favorites.delete(entry.path);
                    this.favorites.add(this.normalizePath(newPath));
                    await this.saveFavorites();
                }
                this.rebaseSelectionPath(entry.path, newPath);
            }
        }

        const targetLabel = target === "/" ? (isKo ? "최상위(Root)" : "Root") : `'${target}'`;
        const failedNote = failed.length ? (isKo ? ` (${failed.length}개 실패)` : ` (${failed.length} failed)`) : "";
        this.showToast(isKo
            ? `📦 ${moved.length}개 항목 -> ${targetLabel} 이동 완료!${failedNote}`
            : `📦 Moved ${moved.length} item(s) to ${targetLabel}${failedNote}`);

        await this.loadTree();
        this.applySelectionHighlight();
        return { moved, failed };
    }

    /** Rewrites one selected row's key after it changed location. */
    rebaseSelectionPath(oldPath, newPath) {
        for (const kind of ["file", "folder"]) {
            const oldKey = this.selectionKey(kind, oldPath);
            if (!this.selection.has(oldKey)) continue;
            this.selection.delete(oldKey);
            this.selection.add(this.selectionKey(kind, newPath));
            if (this.selectionAnchor === oldKey) this.selectionAnchor = this.selectionKey(kind, newPath);
        }
    }

    /**
     * Re-points every piece of sidebar state that lived under a relocated FOLDER.
     *
     * Covers both a rename (same parent, new name) and a drag & drop move (new parent), since
     * in either case the folder's own path changes while everything nested under it moves
     * with it. `expandedFolders` stores full paths ("/A", "/A/B"), so without this the folder
     * would simply collapse right afterwards. Bookmarks and the active workflow may also
     * point at workflows *inside* the folder — the backend only migrates the on-disk
     * metadata, never these browser-side lists.
     */
    async rebaseSidebarStateAfterFolderMove(oldPath, newPath) {
        const oldKey = this.normalizePath(oldPath);
        const newKey = this.normalizePath(newPath);
        if (!oldKey || !newKey || oldKey === newKey) return;

        // Returns the rewritten path, or null when the entry is not part of the moved folder.
        const rebase = (value) => {
            if (value === oldKey) return newKey;
            if (value.startsWith(`${oldKey}/`)) return `${newKey}/${value.slice(oldKey.length + 1)}`;
            return null;
        };

        // 1) Expanded folders — the renamed folder itself stays open so the result is visible.
        const rebasedFolders = new Set();
        this.expandedFolders.forEach((p) => {
            const moved = rebase(this.normalizePath(p));
            rebasedFolders.add(moved === null ? p : `/${moved}`);
        });
        rebasedFolders.add(`/${newKey}`);
        this.expandedFolders = rebasedFolders;
        this.expandAncestorsOf(newPath);

        // 2) Bookmarks pointing at workflows inside the folder.
        const rebasedFavorites = new Set();
        let favoritesChanged = false;
        this.favorites.forEach((f) => {
            const moved = rebase(this.normalizePath(f));
            if (moved === null) {
                rebasedFavorites.add(f);
            } else {
                rebasedFavorites.add(moved);
                favoritesChanged = true;
            }
        });
        this.favorites = rebasedFavorites;
        if (favoritesChanged) await this.saveFavorites();

        // 3) The active workflow may live inside the renamed folder. Written directly instead
        // of via setActiveWorkflow(), which resolves against the still-stale tree.
        const movedActive = rebase(this.normalizePath(this.activeWorkflowPath));
        if (movedActive !== null) {
            this.activeWorkflowPath = movedActive;
            this.activeWorkflowName = movedActive.split("/").pop().replace(/\.json$/i, "").trim();
            localStorage.setItem("qol_active_workflow_path", movedActive);
            localStorage.setItem("qol_active_workflow_name", this.activeWorkflowName);
        }

        // 4) Selected rows inside the folder travelled with it.
        if (this.selection && this.selection.size) {
            const rebasedSelection = new Set();
            this.selection.forEach((k) => {
                const sep = k.indexOf(":");
                const moved = rebase(k.slice(sep + 1));
                rebasedSelection.add(moved === null ? k : `${k.slice(0, sep)}:${moved}`);
            });
            this.selection = rebasedSelection;
            if (this.selectionAnchor) {
                const sep = this.selectionAnchor.indexOf(":");
                const movedAnchor = rebase(this.selectionAnchor.slice(sep + 1));
                this.selectionAnchor = movedAnchor === null
                    ? this.selectionAnchor
                    : `${this.selectionAnchor.slice(0, sep)}:${movedAnchor}`;
            }
        }
    }

    openRenameModal(targetPath, isFolder) {
        const isKo = BadaI18n.lang === "ko";
        const { parent: currentFolder, name: currentName } = this.splitSidebarPath(targetPath);
        const typeLabel = isFolder ? (isKo ? "폴더" : "Folder") : (isKo ? "워크플로우" : "Workflow");
        const parentLabel = currentFolder === "/" ? (isKo ? "최상위(Root)" : "Root") : currentFolder;

        const overlay = document.createElement("div");
        overlay.className = "qol-modal-overlay";
        overlay.innerHTML = `
            <div class="qol-modal-dialog">
                <div class="qol-modal-header">
                    <span>✏️ ${isKo ? `${typeLabel} 이름 변경` : `Rename ${typeLabel}`}</span>
                    <span style="cursor:pointer;" id="qol-m-close">&times;</span>
                </div>
                <div class="qol-modal-body">
                    <div style="font-size: 12px; color: #93c5fd; background: #27272a; padding: 6px 10px; border-radius: 5px; word-break: break-all;">
                        ${isFolder ? "📁" : "📄"} ${this.escapeHtml(parentLabel)}/${this.escapeHtml(currentName)}
                    </div>
                    <div>
                        <div class="qol-form-label" style="margin-bottom:4px;">${isKo ? "새 이름 입력" : "Enter New Name"}</div>
                        <input type="text" class="qol-input" id="qol-rename-input" value="${this.escapeHtml(currentName)}" autofocus />
                    </div>
                    <div style="font-size: 11px; color: #a1a1aa; margin-top:6px;">
                        ${isKo ? "이름만 변경됩니다. 위치는 그대로 유지됩니다." : "Only the name changes — the location stays the same."}
                    </div>
                </div>
                <div class="qol-modal-footer">
                    <button class="qol-btn qol-btn-cancel" id="qol-m-cancel">${isKo ? "취소" : "Cancel"}</button>
                    <button class="qol-btn qol-btn-primary" id="qol-m-confirm">${isKo ? "변경하기" : "Rename"}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.querySelector("#qol-m-close").onclick = close;
        overlay.querySelector("#qol-m-cancel").onclick = close;
        overlay.querySelector("#qol-m-confirm").onclick = async () => {
            const rawName = overlay.querySelector("#qol-rename-input").value.trim();
            // A folder must never gain a ".json" suffix (it would create "MyFolder.json"),
            // while a workflow must always end with one.
            const formattedName = isFolder
                ? rawName.replace(/\.json$/i, "")
                : (rawName.toLowerCase().endsWith(".json") ? rawName : rawName + ".json");
            if (!formattedName || formattedName === currentName) {
                close();
                return;
            }
            try {
                const res = await fetch("/api/qol/workflows/move", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        source_path: targetPath,
                        target_folder: currentFolder,
                        new_name: formattedName,
                        overwrite: false
                    })
                });
                const data = await res.json();
                if (data.success) {
                    this.showToast(isKo ? `'${formattedName}' (으)로 변경 완료!` : `Renamed to '${formattedName}'!`);
                    close();

                    // Folder rows are addressed with a leading slash, file rows without one,
                    // and only the server knows the final spelling — prefer its `new_path`.
                    const serverPath = (data.new_path || "").replace(/\\/g, "/");
                    const newPath = isFolder
                        ? (serverPath || (currentFolder === "/" ? `/${formattedName}` : `${currentFolder}/${formattedName}`))
                        : (currentFolder === "/" ? formattedName : `${currentFolder}/${formattedName}`);

                    if (isFolder) {
                        // Everything nested under the folder moved with it: expanded state,
                        // bookmarks and the active workflow all have to follow.
                        await this.rebaseSidebarStateAfterFolderMove(targetPath, newPath);
                    } else {
                        if (this.activeWorkflowPath === targetPath) {
                            this.setActiveWorkflow(newPath, false);
                        }
                        if (this.isFavorited(targetPath)) {
                            this.favorites.delete(this.normalizePath(targetPath));
                            this.favorites.delete(targetPath);
                            this.favorites.add(this.normalizePath(newPath));
                            await this.saveFavorites();
                        }
                    }
                    await this.loadTree();
                } else {
                    this.showToast(data.error || (isKo ? "이름 변경 실패" : "Failed to rename"), true);
                }
            } catch (e) {
                this.showToast(`Error: ${e.message}`, true);
            }
        };
    }

    openDeleteConfirmModal(targetPath, isFolder) {
        const isKo = BadaI18n.lang === "ko";
        const name = targetPath.split("/").pop();
        const typeLabel = isFolder ? (isKo ? "폴더" : "Folder") : (isKo ? "워크플로우" : "Workflow");

        const overlay = document.createElement("div");
        overlay.className = "qol-modal-overlay";
        overlay.innerHTML = `
            <div class="qol-modal-dialog">
                <div class="qol-modal-header" style="color: #f87171;">
                    <span>🗑️ ${isKo ? `${typeLabel} 삭제` : `Delete ${typeLabel}`}</span>
                    <span style="cursor:pointer;" id="qol-m-close">&times;</span>
                </div>
                <div class="qol-modal-body">
                    <p style="margin: 0; font-size: 13px; line-height: 1.4;">
                        ${isKo 
                            ? `정말로 <strong>'${name}'</strong> ${isFolder ? "폴더와 내부 파일을" : "워크플로우를"} 삭제하시겠습니까?`
                            : `Are you sure you want to delete <strong>'${name}'</strong> ${isFolder ? "folder and its contents" : "workflow"}?`}
                    </p>
                </div>
                <div class="qol-modal-footer">
                    <button class="qol-btn qol-btn-cancel" id="qol-m-cancel">${isKo ? "취소" : "Cancel"}</button>
                    <button class="qol-btn qol-btn-danger" id="qol-m-confirm">${isKo ? "삭제" : "Delete"}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.querySelector("#qol-m-close").onclick = close;
        overlay.querySelector("#qol-m-cancel").onclick = close;
        overlay.querySelector("#qol-m-confirm").onclick = async () => {
            try {
                const res = await fetch("/api/qol/workflows/delete", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ target_path: targetPath })
                });
                const data = await res.json();
                if (data.success) {
                    this.showToast(isKo ? `'${name}' 삭제 완료!` : `'${name}' deleted!`);
                    close();
                    if (this.activeWorkflowPath === targetPath) {
                        this.activeWorkflowPath = "";
                        this.activeWorkflowName = "";
                        localStorage.removeItem("qol_active_workflow_path");
                        localStorage.removeItem("qol_active_workflow_name");
                    }
                    if (this.isFavorited(targetPath)) {
                        this.favorites.delete(this.normalizePath(targetPath));
                        this.favorites.delete(targetPath);
                        await this.saveFavorites();
                    }
                    await this.loadTree();
                } else {
                    this.showToast(data.error || (isKo ? "삭제 실패" : "Failed to delete"), true);
                }
            } catch (e) {
                this.showToast(`Error: ${e.message}`, true);
            }
        };
    }

    /** Delegates to the shared implementation (web/bada_shared.js). */
    escapeHtml(str) {
        if (!str) return "";
        return escapeHtml(str);
    }

    setupHoverPreviewCard() {
        if (document.getElementById("qol-workflow-hover-preview")) return;
        const card = document.createElement("div");
        card.id = "qol-workflow-hover-preview";
        card.className = "qol-workflow-hover-preview";
        document.body.appendChild(card);
        this.hoverCardEl = card;
    }

    scheduleHoverPreview(file, rowEl) {
        if (this.isCustomDragging || this.justFinishedDrag) return;
        this.cancelHoverPreview();
        this.hoverTimer = setTimeout(() => {
            this.showHoverPreview(file, rowEl);
        }, 180);
    }

    cancelHoverPreview() {
        if (this.hoverTimer) {
            clearTimeout(this.hoverTimer);
            this.hoverTimer = null;
        }
        if (this.hoverCardEl) {
            this.hoverCardEl.classList.remove("visible");
            this.hoverCardEl.style.display = "none";
        }
        this.hoverTargetFile = null;
    }

    showHoverPreview(file, rowEl) {
        if (!this.hoverCardEl || !rowEl || this.isCustomDragging) return;
        this.hoverTargetFile = file;

        const rect = rowEl.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const hasThumb = Boolean(file.thumbnail);
        const hasNotes = Boolean(file.notes && file.notes.trim());

        const vParam = file.thumbVersion || Date.now();
        const thumbHtml = hasThumb
            ? `<div class="qol-preview-thumb-box"><img class="qol-preview-thumb-img" src="/api/bada/workflows/thumbnail?path=${encodeURIComponent(file.thumbnail)}&v=${vParam}" alt="Thumbnail" /></div>`
            : `<div class="qol-preview-thumb-box"><div class="qol-preview-thumb-empty"><span style="font-size: 22px;">🖼️</span><span>${BadaI18n.t("wf_no_info_hint")}</span></div></div>`;

        const notesHtml = hasNotes
            ? `<div class="qol-preview-notes-box">${this.escapeHtml(file.notes)}</div>`
            : `<div class="qol-preview-notes-box qol-preview-notes-empty">${BadaI18n.t("wf_no_info_hint")}</div>`;

        this.hoverCardEl.innerHTML = `
            ${thumbHtml}
            <div>
                <div class="qol-preview-title-row">
                    <span class="qol-preview-title">📄 ${this.escapeHtml(file.name || file.filename)}</span>
                </div>
                <div class="qol-preview-path">📁 ${this.escapeHtml(file.path)}</div>
            </div>
            ${notesHtml}
            <div class="qol-preview-footer">💡 ${BadaI18n.lang === "ko" ? "우클릭하여 정보 및 썸네일 수정" : "Right-click to edit info & thumbnail"}</div>
        `;

        this.hoverCardEl.style.display = "flex";

        // Same root cause as the context menus (2026-10-04): a hardcoded `estimatedHeight = 360`
        // stood in for the real card height, which varies with the notes text and the
        // thumbnail. A long note makes the card taller than the guess, so near the bottom of the
        // viewport it still hung off the edge. The card is already displayed above, so measure
        // it instead. Width is a genuine fixed 320px in .qol-preview-card, so that one stays.
        const cardWidth = this.hoverCardEl.offsetWidth || 320;
        let left = rect.right + 12;
        if (left + cardWidth > window.innerWidth - 10) {
            left = Math.max(10, rect.left - cardWidth - 12);
        }

        const cardHeight = this.hoverCardEl.offsetHeight;
        let top = rect.top - 10;
        if (cardHeight > 0 && top + cardHeight > window.innerHeight - 10) {
            top = Math.max(10, window.innerHeight - cardHeight - 10);
        }

        this.hoverCardEl.style.left = `${left}px`;
        this.hoverCardEl.style.top = `${top}px`;

        requestAnimationFrame(() => {
            if (this.hoverTargetFile === file) {
                this.hoverCardEl.classList.add("visible");
            }
        });
    }

    updateFileInTreeData(node, filePath, data) {
        if (!node) return false;
        const normTarget = this.normalizePath(filePath).toLowerCase();
        if (node.files) {
            for (const f of node.files) {
                const fNorm = this.normalizePath(f.path).toLowerCase();
                if (fNorm === normTarget || fNorm === normTarget + ".json" || fNorm + ".json" === normTarget) {
                    Object.assign(f, data);
                    return true;
                }
            }
        }
        if (node.folders) {
            for (const sub of node.folders) {
                if (this.updateFileInTreeData(sub, filePath, data)) return true;
            }
        }
        return false;
    }

    async openWorkflowInfoModal(targetInfo) {
        const filePath = targetInfo.path;
        let currentNotes = targetInfo.notes || "";
        let currentThumb = targetInfo.thumbnail || "";

        try {
            const res = await fetch(`/api/bada/workflows/metadata?path=${encodeURIComponent(filePath)}`);
            if (res.ok) {
                const json = await res.json();
                if (json.success && json.data) {
                    if (json.data.notes !== undefined) currentNotes = json.data.notes;
                    if (json.data.thumbnail !== undefined) currentThumb = json.data.thumbnail;
                }
            }
        } catch (e) { console.debug("[Bada] ignored:", e); }

        let pendingImageBase64 = null;
        let isThumbRemoved = false;

        const overlay = document.createElement("div");
        overlay.className = "qol-modal-overlay";

        overlay.innerHTML = `
            <div class="qol-modal-dialog" style="max-width: 480px; width: 92%;">
                <div class="qol-modal-header">
                    <span>${BadaI18n.t("wf_info_modal_title")}</span>
                    <span style="cursor:pointer;" id="qol-info-close">&times;</span>
                </div>
                <div class="qol-modal-body" style="gap: 12px; display: flex; flex-direction: column;">
                    <div style="font-size: 12px; color: #38bdf8; background: #18181b; padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(56, 189, 248, 0.25); word-break: break-all;">
                        📄 <strong>${this.escapeHtml(targetInfo.name || targetInfo.filename)}</strong>
                        <div style="font-size: 11px; color: #a1a1aa; margin-top: 2px;">📁 ${this.escapeHtml(filePath)}</div>
                    </div>

                    <div>
                        <div class="qol-form-label" style="margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
                            <span>🖼️ ${BadaI18n.t("wf_thumb_label")}</span>
                            <button class="qol-btn" id="qol-thumb-remove-btn" style="padding: 2px 8px; font-size: 11px; background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.4); display: ${currentThumb ? 'inline-flex' : 'none'};">${BadaI18n.t("wf_thumb_remove_btn")}</button>
                        </div>

                        <div id="qol-thumb-preview-container" style="width: 100%; height: 160px; background: #09090b; border: 2px dashed rgba(255, 255, 255, 0.15); border-radius: 8px; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; cursor: pointer;">
                            <img id="qol-thumb-img-preview" src="${currentThumb ? `/api/bada/workflows/thumbnail?path=${encodeURIComponent(currentThumb)}&t=${Date.now()}` : ''}" style="max-width: 100%; max-height: 100%; object-fit: contain; display: ${currentThumb ? 'block' : 'none'}; border-radius: 6px;" />
                            <div id="qol-thumb-placeholder" style="color: #71717a; font-size: 12px; text-align: center; display: ${currentThumb ? 'none' : 'flex'}; flex-direction: column; align-items: center; gap: 6px;">
                                <span style="font-size: 24px;">🖼️</span>
                                <span>${BadaI18n.t("wf_thumb_drop_hint")}</span>
                            </div>
                            <input type="file" id="qol-thumb-file-input" accept="image/*" style="display: none;" />
                        </div>

                        <div style="display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap;">
                            <button class="qol-btn qol-btn-primary" id="qol-thumb-canvas-btn" style="flex: 1; min-width: 140px; font-size: 11.5px; padding: 6px 8px; background: linear-gradient(135deg, #0284c7, #0369a1); border: 1px solid #38bdf8;">
                                ${BadaI18n.t("wf_thumb_canvas_btn")}
                            </button>
                            <button class="qol-btn" id="qol-thumb-paste-btn" style="flex: 1; min-width: 130px; font-size: 11.5px; padding: 6px 8px; background: #27272a; border: 1px solid #6366f1; color: #e0e7ff;">
                                ${BadaI18n.t("wf_thumb_paste_btn")}
                            </button>
                            <button class="qol-btn" id="qol-thumb-upload-btn" style="font-size: 11.5px; padding: 6px 10px; background: #27272a; border: 1px solid #3f3f46; color: #e4e4e7;">
                                ${BadaI18n.t("wf_thumb_upload_btn")}
                            </button>
                        </div>
                    </div>

                    <div>
                        <div class="qol-form-label" style="margin-bottom: 6px;">📝 ${BadaI18n.t("wf_notes_label")}</div>
                        <textarea class="qol-textarea" id="qol-notes-input" rows="4" placeholder="${BadaI18n.t("wf_notes_placeholder")}" style="width: 100%; box-sizing: border-box; background: #18181b; color: #f4f4f5; border: 1px solid #3f3f46; border-radius: 6px; padding: 8px; font-size: 12.5px; line-height: 1.4; resize: vertical; min-height: 80px; max-height: 200px; font-family: inherit;">${this.escapeHtml(currentNotes)}</textarea>
                    </div>
                </div>
                <div class="qol-modal-footer">
                    <button class="qol-btn qol-btn-cancel" id="qol-info-cancel">${BadaI18n.t("wf_cancel_btn")}</button>
                    <button class="qol-btn qol-btn-primary" id="qol-info-save">${BadaI18n.t("wf_save_btn")}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const thumbContainer = overlay.querySelector("#qol-thumb-preview-container");
        const imgPreview = overlay.querySelector("#qol-thumb-img-preview");
        const placeholder = overlay.querySelector("#qol-thumb-placeholder");
        const fileInput = overlay.querySelector("#qol-thumb-file-input");
        const removeBtn = overlay.querySelector("#qol-thumb-remove-btn");
        const uploadBtn = overlay.querySelector("#qol-thumb-upload-btn");
        const canvasBtn = overlay.querySelector("#qol-thumb-canvas-btn");
        const pasteBtn = overlay.querySelector("#qol-thumb-paste-btn");
        const notesInput = overlay.querySelector("#qol-notes-input");

        const updatePreviewUI = (dataUrl) => {
            if (dataUrl) {
                imgPreview.src = dataUrl;
                imgPreview.style.display = "block";
                placeholder.style.display = "none";
                removeBtn.style.display = "inline-flex";
                isThumbRemoved = false;
            } else {
                imgPreview.src = "";
                imgPreview.style.display = "none";
                placeholder.style.display = "flex";
                removeBtn.style.display = "none";
                isThumbRemoved = true;
                pendingImageBase64 = null;
            }
        };

        // Client-side auto-resizer to 640px (lightweight ~100KB thumbnail)
        const resizeToThumbnailBase64 = (source, maxDim = 640) => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                let objectUrl = null;
                if (source instanceof Blob) {
                    objectUrl = URL.createObjectURL(source);
                    img.src = objectUrl;
                } else if (typeof source === "string") {
                    img.src = source;
                    if (source.startsWith("http") || source.startsWith("/")) {
                        img.crossOrigin = "anonymous";
                    }
                } else {
                    return reject(new Error("Invalid image source"));
                }

                img.onload = () => {
                    if (objectUrl) URL.revokeObjectURL(objectUrl);
                    let w = img.naturalWidth || img.width;
                    let h = img.naturalHeight || img.height;
                    if (w <= 0 || h <= 0) {
                        return reject(new Error("Image has zero dimensions"));
                    }
                    if (w > maxDim || h > maxDim) {
                        if (w > h) {
                            h = Math.round((h * maxDim) / w);
                            w = maxDim;
                        } else {
                            w = Math.round((w * maxDim) / h);
                            h = maxDim;
                        }
                    }
                    const canvas = document.createElement("canvas");
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext("2d");
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = "high";
                    ctx.drawImage(img, 0, 0, w, h);
                    const dataUrl = canvas.toDataURL("image/png");
                    resolve(dataUrl);
                };
                img.onerror = (err) => {
                    if (objectUrl) URL.revokeObjectURL(objectUrl);
                    reject(err);
                };
            });
        };

        const loadThumbnailBlob = async (blob) => {
            if (!blob) return;
            try {
                const resizedDataUrl = await resizeToThumbnailBase64(blob, 640);
                pendingImageBase64 = resizedDataUrl;
                updatePreviewUI(pendingImageBase64);
                this.showToast(BadaI18n.t("wf_thumb_pasted_toast"));
            } catch (err) {
                console.error("[BadaUtils] Thumbnail resize error, falling back to raw reader:", err);
                const reader = new FileReader();
                reader.onload = (e) => {
                    pendingImageBase64 = e.target.result;
                    updatePreviewUI(pendingImageBase64);
                    this.showToast(BadaI18n.t("wf_thumb_pasted_toast"));
                };
                reader.readAsDataURL(blob);
            }
        };

        // Clipboard Paste handler (Ctrl+V anywhere while modal is open)
        const handlePaste = (e) => {
            const items = (e.clipboardData || window.clipboardData)?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type && items[i].type.indexOf("image") !== -1) {
                    const file = items[i].getAsFile();
                    if (file) {
                        loadThumbnailBlob(file);
                        e.preventDefault();
                        e.stopPropagation();
                        break;
                    }
                }
            }
        };
        window.addEventListener("paste", handlePaste, true);

        // Fallback Ctrl+C trigger if user thinks "컨트롤씨로 등록"
        const handleKeyDown = async (e) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")) {
                const activeTag = document.activeElement?.tagName;
                if (activeTag === "TEXTAREA" || activeTag === "INPUT") return;
                if (navigator.clipboard && navigator.clipboard.read) {
                    try {
                        const items = await navigator.clipboard.read();
                        for (const item of items) {
                            const imgType = item.types.find(t => t.startsWith("image/"));
                            if (imgType) {
                                const blob = await item.getType(imgType);
                                loadThumbnailBlob(blob);
                                e.preventDefault();
                                break;
                            }
                        }
                    } catch (err) { console.debug("[Bada] ignored:", err); }
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown, true);

        const close = () => {
            window.removeEventListener("paste", handlePaste, true);
            window.removeEventListener("keydown", handleKeyDown, true);
            overlay.remove();
        };

        overlay.querySelector("#qol-info-close").onclick = close;
        overlay.querySelector("#qol-info-cancel").onclick = close;

        uploadBtn.onclick = () => fileInput.click();
        thumbContainer.onclick = (e) => {
            if (e.target !== removeBtn) fileInput.click();
        };

        fileInput.onchange = () => {
            const file = fileInput.files?.[0];
            if (file) {
                loadThumbnailBlob(file);
            }
        };

        thumbContainer.ondragover = (e) => {
            e.preventDefault();
            thumbContainer.style.borderColor = "#00f0ff";
            thumbContainer.style.background = "rgba(0, 240, 255, 0.05)";
        };
        thumbContainer.ondragleave = () => {
            thumbContainer.style.borderColor = "rgba(255, 255, 255, 0.15)";
            thumbContainer.style.background = "#09090b";
        };
        thumbContainer.ondrop = (e) => {
            e.preventDefault();
            thumbContainer.style.borderColor = "rgba(255, 255, 255, 0.15)";
            thumbContainer.style.background = "#09090b";
            const file = e.dataTransfer?.files?.[0];
            if (file && file.type.startsWith("image/")) {
                loadThumbnailBlob(file);
            }
        };

        removeBtn.onclick = (e) => {
            e.stopPropagation();
            updatePreviewUI(null);
        };

        if (pasteBtn) {
            pasteBtn.onclick = async () => {
                try {
                    if (!navigator.clipboard || !navigator.clipboard.read) {
                        alert(BadaI18n.lang === "ko" ? "브라우저 보안으로 인해 직접 붙여넣기를 호출할 수 없습니다. 키보드 단축키 Ctrl+V 를 눌러 붙여넣어 주세요!" : "Please press Ctrl+V to paste the image.");
                        return;
                    }
                    const items = await navigator.clipboard.read();
                    let found = false;
                    for (const item of items) {
                        const imgType = item.types.find(t => t.startsWith("image/"));
                        if (imgType) {
                            const blob = await item.getType(imgType);
                            loadThumbnailBlob(blob);
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        alert(BadaI18n.lang === "ko" ? "클립보드에 복사된 이미지가 없습니다. 이미지를 복사한 후 Ctrl+V 또는 이 버튼을 눌러주세요." : "No image found in clipboard.");
                    }
                } catch (err) {
                    console.warn("Clipboard paste button error:", err);
                    alert(BadaI18n.lang === "ko" ? "클립보드 읽기 권한이 허용되지 않았습니다. 키보드로 Ctrl+V 를 눌러 붙여넣어 주세요!" : "Please press Ctrl+V directly to paste the image.");
                }
            };
        }

        canvasBtn.onclick = async () => {
            try {
                canvasBtn.textContent = "⏳ 찾는 중...";
                canvasBtn.disabled = true;

                let latestImgSrc = null;

                if (app.graph && Array.isArray(app.graph._nodes)) {
                    for (let i = app.graph._nodes.length - 1; i >= 0; i--) {
                        const node = app.graph._nodes[i];
                        if (node.imgs && node.imgs.length > 0) {
                            const lastImg = node.imgs[node.imgs.length - 1];
                            if (lastImg && lastImg.src) {
                                latestImgSrc = lastImg.src;
                                break;
                            }
                        }
                    }
                }

                if (!latestImgSrc) {
                    try {
                        const hRes = await fetch("/history?max_items=1");
                        if (hRes.ok) {
                            const hData = await hRes.json();
                            const firstPromptId = Object.keys(hData)[0];
                            if (firstPromptId && hData[firstPromptId].outputs) {
                                const outs = hData[firstPromptId].outputs;
                                for (const nodeId of Object.keys(outs)) {
                                    if (outs[nodeId].images && outs[nodeId].images.length > 0) {
                                        const imgInfo = outs[nodeId].images[outs[nodeId].images.length - 1];
                                        latestImgSrc = `/view?filename=${encodeURIComponent(imgInfo.filename)}&subfolder=${encodeURIComponent(imgInfo.subfolder || "")}&type=${encodeURIComponent(imgInfo.type || "output")}`;
                                        break;
                                    }
                                }
                            }
                        }
                    } catch (he) { console.debug("[Bada] ignored:", he); }
                }

                if (latestImgSrc) {
                    try {
                        const resizedDataUrl = await resizeToThumbnailBase64(latestImgSrc, 640);
                        pendingImageBase64 = resizedDataUrl;
                        updatePreviewUI(pendingImageBase64);
                    } catch (imgErr) {
                        console.error("[BadaUtils] Canvas thumbnail extract error:", imgErr);
                        alert(BadaI18n.lang === "ko" ? "캔버스 이미지를 불러오지 못했습니다." : "Could not load canvas image.");
                    } finally {
                        canvasBtn.textContent = BadaI18n.t("wf_thumb_canvas_btn");
                        canvasBtn.disabled = false;
                    }
                } else {
                    alert(BadaI18n.lang === "ko" ? "캔버스 또는 히스토리에 최근 생성된 이미지가 없습니다." : "No recently generated image found on canvas or history.");
                    canvasBtn.textContent = BadaI18n.t("wf_thumb_canvas_btn");
                    canvasBtn.disabled = false;
                }
            } catch (err) {
                console.error("[BadaUtils] Canvas thumbnail extract error:", err);
                canvasBtn.textContent = BadaI18n.t("wf_thumb_canvas_btn");
                canvasBtn.disabled = false;
            }
        };

        const saveBtn = overlay.querySelector("#qol-info-save");
        saveBtn.onclick = async () => {
            saveBtn.textContent = "⏳ 저장 중...";
            saveBtn.disabled = true;

            const notesVal = notesInput.value.trim();
            let finalThumbPath = currentThumb;

            try {
                if (pendingImageBase64) {
                    const upRes = await fetch("/api/bada/workflows/thumbnail/upload", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            path: filePath,
                            image_base64: pendingImageBase64
                        })
                    });
                    if (upRes.ok) {
                        const upJson = await upRes.json();
                        if (upJson.success && upJson.thumbnail) {
                            finalThumbPath = upJson.thumbnail;
                        }
                    }
                } else if (isThumbRemoved) {
                    finalThumbPath = "";
                }

                await fetch("/api/bada/workflows/metadata", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        path: filePath,
                        notes: notesVal,
                        thumbnail: finalThumbPath,
                        delete_thumbnail: isThumbRemoved
                    })
                });

                const now = Date.now();
                targetInfo.notes = notesVal;
                targetInfo.thumbnail = finalThumbPath;
                targetInfo.has_notes = Boolean(notesVal);
                targetInfo.has_thumbnail = Boolean(finalThumbPath);
                targetInfo.thumbVersion = now;

                this.updateFileInTreeData(this.treeData, filePath, {
                    notes: notesVal,
                    thumbnail: finalThumbPath,
                    has_notes: Boolean(notesVal),
                    has_thumbnail: Boolean(finalThumbPath),
                    thumbVersion: now
                });

                close();
                this.renderPlusTree();
                this.showToast(BadaI18n.t("wf_info_saved_toast"));
            } catch (err) {
                console.error("[BadaUtils] Failed to save workflow info:", err);
                alert("Failed to save workflow info: " + err.message);
                saveBtn.textContent = BadaI18n.t("wf_save_btn");
                saveBtn.disabled = false;
            }
        };
    }
}

export function setupWorkflowOrganizer() {
    if (window.__BADA_WORKFLOW_ORGANIZER_INITIALIZED__) {
        console.log("[BadaUtils] Workflow organizer already active. Skipping duplicate init.");
        return;
    }
    window.__BADA_WORKFLOW_ORGANIZER_INITIALIZED__ = true;
    const manager = new WorkflowsPlusManager();
    manager.init();
}
