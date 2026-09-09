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

const FONT_SIZE_PRESETS = [
    { label: "작게 (A⁻ - 13px)", icon: "A⁻", name: "compact", fontSize: "13px", folderHeight: "28px", fileHeight: "27px", folderIcon: "14.5px", fileIcon: "13.5px", badgeFont: "11px", badgeHeight: "17px", chevron: "10px" },
    { label: "보통 (A - 14.5px)", icon: "A", name: "standard", fontSize: "14.5px", folderHeight: "31px", fileHeight: "30px", folderIcon: "16px", fileIcon: "15px", badgeFont: "11.5px", badgeHeight: "19px", chevron: "11px" },
    { label: "크게 (A⁺ - 16px)", icon: "A⁺", name: "large", fontSize: "16px", folderHeight: "34px", fileHeight: "33px", folderIcon: "17.5px", fileIcon: "16.5px", badgeFont: "12px", badgeHeight: "20px", chevron: "12px" },
    { label: "아주 크게 (A⁺⁺ - 18px)", icon: "A⁺⁺", name: "xlarge", fontSize: "18px", folderHeight: "38px", fileHeight: "37px", folderIcon: "19.5px", fileIcon: "18.5px", badgeFont: "13px", badgeHeight: "22px", chevron: "13px" }
];

class WorkflowsPlusManager {
    constructor() {
        this.treeData = null;
        this.expandedFolders = new Set();
        this.searchQuery = "";
        this.activeTab = localStorage.getItem("qol_workflows_active_tab") || "plus";
        this.fontSizeIndex = parseInt(localStorage.getItem("qol_workflows_font_size_idx") ?? "1", 10);
        if (isNaN(this.fontSizeIndex) || this.fontSizeIndex < 0 || this.fontSizeIndex >= FONT_SIZE_PRESETS.length) {
            this.fontSizeIndex = 1;
        }
        this.highlightedItem = null;
        this.draggedItem = null;

        this.activeWorkflowPath = localStorage.getItem("qol_active_workflow_path") || "";
        this.activeWorkflowName = localStorage.getItem("qol_active_workflow_name") || "";

        this.contextTarget = null;
        this.mountedSidebar = null;
        this.isMounting = false;

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
    }

    async init() {
        this.injectStyles();
        this.setupContextMenu();
        this.setupSidebarLifecycle();
        this.setupAutoSyncOnSave();
        await this.loadFavorites();
        await this.loadTree();
        console.log("[QoL-Utils] Workflows+ Manager initialized cleanly.");
    }

    injectStyles() {
        let style = document.getElementById("qol-workflows-plus-styles");
        if (!style) {
            style = document.createElement("style");
            style.id = "qol-workflows-plus-styles";
            document.head.appendChild(style);
        }
        style.textContent = `
            /* Ensure Sidebar Panel is strictly a single vertical column */
            .side-bar-panel, .workflows-panel, [aria-label='Workflows'], .side-bar-container {
                flex-direction: column !important;
            }
            .side-bar-panel > *, .workflows-panel > *, [aria-label='Workflows'] > * {
                width: 100% !important;
                box-sizing: border-box !important;
            }

            /* Plus Mode: unconditionally HIDE all sibling elements in sidebar except tabContainer, plusPanel, and contextMenu */
            .side-bar-panel.qol-mode-plus > *:not(.qol-tab-container):not(.qol-plus-panel):not(.qol-context-menu),
            .workflows-panel.qol-mode-plus > *:not(.qol-tab-container):not(.qol-plus-panel):not(.qol-context-menu),
            [aria-label='Workflows'].qol-mode-plus > *:not(.qol-tab-container):not(.qol-plus-panel):not(.qol-context-menu) {
                display: none !important;
            }

            /* Plus Mode: ensure plusPanel is flex display */
            .side-bar-panel.qol-mode-plus .qol-plus-panel,
            .workflows-panel.qol-mode-plus .qol-plus-panel,
            [aria-label='Workflows'].qol-mode-plus .qol-plus-panel {
                display: flex !important;
            }

            /* Native Mode: hide plusPanel */
            .side-bar-panel.qol-mode-native .qol-plus-panel,
            .workflows-panel.qol-mode-native .qol-plus-panel,
            [aria-label='Workflows'].qol-mode-native .qol-plus-panel {
                display: none !important;
            }

            /* Tab Container on Top of Sidebar (32px height) */
            .qol-tab-container {
                display: flex !important;
                align-items: center;
                gap: 3px;
                background: #141416;
                padding: 3px;
                border-radius: 6px;
                border: 1px solid #27272a;
                margin: 6px 8px 8px 8px;
                box-sizing: border-box;
                height: 32px;
                width: calc(100% - 16px) !important;
                flex-shrink: 0;
            }
            .qol-tab-btn {
                flex: 1;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
                padding: 4px 8px;
                border-radius: 4px;
                border: none;
                background: transparent;
                color: #a1a1aa;
                font-size: 12.5px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.12s ease;
                user-select: none;
                height: 26px;
            }
            .qol-tab-btn:hover {
                color: #f4f4f5;
                background: rgba(255, 255, 255, 0.06);
            }
            .qol-tab-btn.active {
                background: #27272a;
                color: #ffffff;
                font-weight: 600;
            }
            .qol-tab-btn.active.plus-tab {
                background: #4f46e5;
                color: #ffffff;
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
                min-height: 0;
                overflow: hidden;
                color: #e4e4e7;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                font-size: var(--qol-font-size);
                box-sizing: border-box;
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
                font-size: var(--qol-font-size);
                color: #e4e4e7;
                white-space: normal;
                word-break: break-word;
                overflow-wrap: anywhere;
                line-height: 1.35;
                letter-spacing: -0.2px;
                pointer-events: none;
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
                padding: 1px 5px;
                border-radius: 3px;
                background: #4f46e5;
                color: #e0e7ff;
                border: 1px solid rgba(165, 180, 252, 0.5);
                margin-left: 4px;
                line-height: 15px;
                flex-shrink: 0;
                align-self: flex-start;
                margin-top: 2px;
                pointer-events: none;
                white-space: nowrap;
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
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 13px;
                color: #71717a;
                cursor: pointer;
                padding: 1px 3px;
                border-radius: 3px;
                transition: all 0.12s ease;
                opacity: 0;
                flex-shrink: 0;
                margin-left: auto;
                align-self: flex-start;
                margin-top: 2px;
                pointer-events: auto !important;
                user-select: none;
            }
            .qol-file-row:hover .qol-fav-star {
                opacity: 0.75;
            }
            .qol-fav-star:hover {
                transform: scale(1.25);
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
        `;
    }

    showToast(message, isError = false) {
        const toast = document.createElement("div");
        toast.className = "qol-toast";
        if (isError) {
            toast.style.borderColor = "#ef4444";
            toast.style.color = "#fef2f2";
            toast.innerHTML = `<span>❌</span> <span>${message}</span>`;
        } else {
            toast.innerHTML = `<span>✨</span> <span>${message}</span>`;
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
                    } catch (e) {}
                    return res;
                };
                targetApp._qolHooked = true;
            }
        } catch (e) {}

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
        };
        setupTabsObserver();
        setInterval(setupTabsObserver, 2000);

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
                }
            } catch (e) {}
        };
        setupPiniaSubscription();
        setInterval(setupPiniaSubscription, 3000);

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
            } catch (e) {}
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
            } catch (e) {}

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
        } catch (e) {}
    }

    setupSidebarLifecycle() {
        const applyIsolation = (sidebar) => {
            if (!sidebar) return;
            const isPlus = this.activeTab === "plus";
            const expectedClass = isPlus ? "qol-mode-plus" : "qol-mode-native";
            const removeClass = isPlus ? "qol-mode-native" : "qol-mode-plus";
            sidebar.classList.remove(removeClass);
            sidebar.classList.add(expectedClass);

            // Directly hide/show sibling elements to guarantee zero bleed-through
            Array.from(sidebar.children).forEach(child => {
                if (child.classList.contains("qol-tab-container") || child.classList.contains("qol-context-menu")) {
                    child.style.display = "flex";
                } else if (child.classList.contains("qol-plus-panel")) {
                    child.style.display = isPlus ? "flex" : "none";
                } else {
                    child.style.display = isPlus ? "none" : "";
                }
            });
        };

        const checkSidebar = () => {
            if (this.isMounting) return;

            const sidebar = document.querySelector(".side-bar-panel") ||
                            document.querySelector(".workflows-panel") ||
                            document.querySelector("[aria-label='Workflows']");

            if (sidebar) {
                const hasTab = sidebar.querySelector(".qol-tab-container");
                const hasPanel = sidebar.querySelector(".qol-plus-panel");
                if (sidebar !== this.mountedSidebar || !hasTab || !hasPanel) {
                    this.mountTabsAndContainer(sidebar);
                } else {
                    applyIsolation(sidebar);
                }
            }
        };

        document.addEventListener("click", (e) => {
            const dockBtn = e.target.closest(".side-bar-button, [aria-label*='Workflow'], button, .p-tabmenu-item");
            if (dockBtn) {
                setTimeout(checkSidebar, 20);
                setTimeout(checkSidebar, 80);
                setTimeout(checkSidebar, 200);
                setTimeout(checkSidebar, 500);
            }
        }, true);

        setInterval(checkSidebar, 400);
        checkSidebar();
    }

    mountTabsAndContainer(sidebar) {
        if (!sidebar || this.isMounting) return;
        this.isMounting = true;
        this.mountedSidebar = sidebar;

        try {
            document.querySelectorAll(".qol-tab-container, .qol-plus-panel").forEach(el => el.remove());

            // 1. Create Tab Switcher
            const tabContainer = document.createElement("div");
            tabContainer.className = "qol-tab-container";
            tabContainer.innerHTML = `
                <button class="qol-tab-btn native-tab ${this.activeTab === 'native' ? 'active' : ''}" id="qol-tab-native">
                    <span>${BadaI18n.t("wf_tab_native")}</span>
                </button>
                <button class="qol-tab-btn plus-tab ${this.activeTab === 'plus' ? 'active' : ''}" id="qol-tab-plus">
                    <span>${BadaI18n.t("wf_tab_plus")}</span>
                </button>
            `;

            sidebar.prepend(tabContainer);

            tabContainer.querySelector("#qol-tab-native").addEventListener("click", () => {
                this.switchTab("native", sidebar);
            });
            tabContainer.querySelector("#qol-tab-plus").addEventListener("click", () => {
                this.switchTab("plus", sidebar);
            });

            // 2. Create Workflows+ Panel
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
            sidebar.appendChild(plusPanel);

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
                this.showToast("새로고침 완료");
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

            // Attach MutationObserver to sidebar so dynamic child additions by Vue don't break isolation
            if (!sidebar._qolObserver) {
                const observer = new MutationObserver(() => {
                    const hasTab = sidebar.querySelector(".qol-tab-container");
                    const hasPanel = sidebar.querySelector(".qol-plus-panel");
                    if (!hasTab || !hasPanel) {
                        this.mountTabsAndContainer(sidebar);
                    } else {
                        const expectedClass = this.activeTab === "plus" ? "qol-mode-plus" : "qol-mode-native";
                        const removeClass = this.activeTab === "plus" ? "qol-mode-native" : "qol-mode-plus";
                        if (!sidebar.classList.contains(expectedClass)) {
                            sidebar.classList.remove(removeClass);
                            sidebar.classList.add(expectedClass);
                        }
                    }
                });
                observer.observe(sidebar, { childList: true, subtree: false });
                sidebar._qolObserver = observer;
            }

            // Apply active tab immediately
            this.switchTab(this.activeTab, sidebar);
        } finally {
            this.isMounting = false;
        }
    }

    switchTab(tabName, sidebar) {
        this.activeTab = tabName;
        localStorage.setItem("qol_workflows_active_tab", tabName);

        if (!sidebar) {
            sidebar = document.querySelector(".side-bar-panel") ||
                      document.querySelector(".workflows-panel") ||
                      document.querySelector("[aria-label='Workflows']");
        }
        if (!sidebar) return;

        const tabContainer = sidebar.querySelector(".qol-tab-container");
        const nativeBtn = tabContainer?.querySelector("#qol-tab-native");
        const plusBtn = tabContainer?.querySelector("#qol-tab-plus");
        const plusPanel = sidebar.querySelector(".qol-plus-panel");

        if (tabName === "native") {
            sidebar.classList.remove("qol-mode-plus");
            sidebar.classList.add("qol-mode-native");
            nativeBtn?.classList.add("active");
            plusBtn?.classList.remove("active");
            if (plusPanel) plusPanel.style.display = "none";

            // Trigger native ComfyUI sync & reload
            this.syncNativeBookmarks();
        } else {
            sidebar.classList.remove("qol-mode-native");
            sidebar.classList.add("qol-mode-plus");
            plusBtn?.classList.add("active");
            nativeBtn?.classList.remove("active");
            if (plusPanel) {
                plusPanel.style.display = "flex";
                this.loadFavorites().then(() => this.loadTree()).then(() => {
                    setTimeout(() => this.scrollToActiveWorkflow(), 150);
                });
            }
        }
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
            this.showToast(`'${filename}' 불러오기 완료!`);
        } catch (e) {
            console.error("[QoL-Utils] Error loading workflow:", e);
            this.showToast(`불러오기 오류: ${e.message}`, true);
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
            focusBtn.title = `현재 작업: '${cleanName}' 위치로 이동`;
            focusBtn.classList.add("has-active");
        }

        this.renderPlusTree();

        if (autoFocus) {
            setTimeout(() => this.scrollToActiveWorkflow(false), 50);
        }
    }

    scrollToActiveWorkflow(showToast = false) {
        if (!this.activeWorkflowName && !this.activeWorkflowPath) {
            if (showToast) this.showToast("현재 열려있는 워크플로우가 없습니다.");
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
                    this.showToast(`🎯 '${this.activeWorkflowName}' 위치로 이동했습니다.`);
                }
            } else if (showToast && this.activeWorkflowName) {
                this.showToast(`현재 작업: '${this.activeWorkflowName}'`);
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

        const plusPanel = document.querySelector(".qol-plus-panel");
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

        const fontBtn = document.querySelector("#qol-btn-font-size");
        if (fontBtn) {
            fontBtn.title = `글자 크기: ${preset.label}\n(좌클릭: 크기 순환 변경 / 우클릭: 목록 선택)`;
            fontBtn.innerHTML = `<span style="font-weight:700; font-size:12px; font-family:sans-serif; letter-spacing:-0.5px;">${preset.icon || 'Aa'}</span>`;
        }

        if (showToast) {
            this.showToast(`글자 크기: ${preset.label}`);
        }
    }

    showFontSizeMenu(e) {
        e.preventDefault();
        e.stopPropagation();

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
                🔤 글자 & 행 크기 설정
            </div>
            ${FONT_SIZE_PRESETS.map((preset, idx) => `
                <div class="qol-menu-item font-size-item" data-idx="${idx}" style="justify-content: space-between; gap: 14px;">
                    <span>${preset.label}</span>
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
        menu.style.left = `${Math.min(rect.left || e.clientX, window.innerWidth - 220)}px`;
        menu.style.top = `${(rect.bottom || e.clientY) + 4}px`;
        menu.style.display = "block";
    }

    escapeHtml(str) {
        return String(str || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
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
            } catch (e) {}

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
                } catch (e) {}
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
        } catch (e) {}

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
        } catch (e) {}

        // 2. Click ONLY the dedicated refresh button if available in DOM (never generic tree buttons)
        try {
            const refreshBtns = document.querySelectorAll(
                "button[data-testid='workflows-refresh-button'], button:has(>[data-testid='workflows-refresh-icon']), button:has(>i.pi-refresh)"
            );
            refreshBtns.forEach(btn => btn.click());
        } catch (e) {}
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
            this.showToast(`'${filename}' 즐겨찾기에서 제거되었습니다.`);
        } else {
            const toAdd = norm.endsWith(".json") ? norm : norm + ".json";
            this.favorites.add(toAdd);
            this.showToast(`⭐ '${filename}' 즐겨찾기에 추가되었습니다!`);
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
                const targetLabel = cleanTarget === "/" ? "최상위(Root)" : `'${cleanTarget}'`;
                const filename = cleanSource.split("/").pop();
                this.showToast(`'${filename}' -> ${targetLabel} 이동 완료!`);

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
                this.showToast(data.error || "이동 실패", true);
                return false;
            }
        } catch (e) {
            this.showToast(`이동 오류: ${e.message}`, true);
            return false;
        }
    }

    attachFileDragEvents(fileRow, file) {
        fileRow.addEventListener("mousedown", (e) => {
            if (e.button !== 0) return; // Left mouse only

            const startX = e.clientX;
            const startY = e.clientY;
            let hasMoved = false;
            let targetFolder = null;

            const treeScrollEl = document.querySelector("#qol-tree-scroll");
            const rootDropEl = document.querySelector("#qol-root-dropzone");

            const onMouseMove = (moveEv) => {
                const dist = Math.hypot(moveEv.clientX - startX, moveEv.clientY - startY);

                if (!hasMoved && dist > 4) {
                    hasMoved = true;
                    this.isCustomDragging = true;
                    this.draggedPath = file.path;
                    this.draggedName = file.name;
                    fileRow.classList.add("dragging");
                    document.body.style.cursor = "grabbing";
                    document.body.style.userSelect = "none";

                    if (rootDropEl) rootDropEl.classList.add("visible");

                    if (!this.dragGhostEl) {
                        this.dragGhostEl = document.createElement("div");
                        this.dragGhostEl.className = "qol-drag-ghost";
                        this.dragGhostEl.innerHTML = `<span>📄</span> <span>${file.name}</span>`;
                        document.body.appendChild(this.dragGhostEl);
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
                    document.querySelectorAll(".drag-insert-top").forEach(el => el.classList.remove("drag-insert-top"));
                    document.querySelectorAll(".drag-insert-bottom").forEach(el => el.classList.remove("drag-insert-bottom"));
                    targetFolder = null;

                    if (rootDropHit) {
                        rootDropHit.classList.add("dragover");
                        targetFolder = "/";
                    } else if (folderRowHit) {
                        folderRowHit.classList.add("dragover");
                        targetFolder = folderRowHit.getAttribute("data-path");

                        // Auto-expand folder if hovered intentionally for 1.2s (1200ms)
                        if (targetFolder && !this.expandedFolders.has(targetFolder)) {
                            if (this.hoveredFolder !== targetFolder) {
                                if (this.hoverExpandTimer) {
                                    clearTimeout(this.hoverExpandTimer);
                                    this.hoverExpandTimer = null;
                                }
                                this.hoveredFolder = targetFolder;
                                this.hoverExpandTimer = setTimeout(() => {
                                    if (this.isCustomDragging && this.hoveredFolder === targetFolder) {
                                        this.expandedFolders.add(targetFolder);
                                        this.renderPlusTree();
                                    }
                                }, 1200);
                            }
                        }
                    } else if (fileRowHit && fileRowHit !== fileRow) {
                        const rect = fileRowHit.getBoundingClientRect();
                        const isTopHalf = moveEv.clientY < rect.top + rect.height / 2;
                        
                        if (isTopHalf) {
                            fileRowHit.classList.add("drag-insert-top");
                        } else {
                            fileRowHit.classList.add("drag-insert-bottom");
                        }

                        const hitPath = fileRowHit.getAttribute("data-path") || "";
                        targetFolder = hitPath.includes("/") ? hitPath.split("/").slice(0, -1).join("/") : "/";
                    } else if (containerHit) {
                        containerHit.classList.add("dragover");
                        targetFolder = containerHit.getAttribute("data-folder-path") || "/";
                    }

                    if (!folderRowHit && this.hoverExpandTimer) {
                        clearTimeout(this.hoverExpandTimer);
                        this.hoverExpandTimer = null;
                        this.hoveredFolder = null;
                    }
                }
            };

            const onMouseUp = async (upEv) => {
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
                fileRow.classList.remove("dragging");
                document.querySelectorAll(".dragover").forEach(el => el.classList.remove("dragover"));
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
                        await this.moveWorkflowFile(file.path, targetFolder);
                    }
                }
            };

            window.addEventListener("mousemove", onMouseMove, true);
            window.addEventListener("mouseup", onMouseUp, true);
        });
    }

    renderPlusTree() {
        const treeScroll = document.querySelector("#qol-tree-scroll");
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
                    if (!query || displayName.toLowerCase().includes(query) || file.name.toLowerCase().includes(query) || file.filename.toLowerCase().includes(query)) {
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

                if (isActive) {
                    const activeTag = document.createElement("span");
                    activeTag.className = "qol-active-tag";
                    activeTag.textContent = BadaI18n.t("wf_active_tag");
                    fileRow.appendChild(activeTag);
                }

                const starBtn = document.createElement("span");
                starBtn.className = "qol-fav-star is-fav";
                starBtn.textContent = "★";
                starBtn.title = BadaI18n.t("wf_ctx_fav_remove");
                starBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    this.toggleFavorite(file.path);
                });
                fileRow.appendChild(starBtn);

                // Click to load
                fileRow.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (this.justFinishedDrag) return;
                    this.loadWorkflowToCanvas(file.path);
                });

                // Context menu
                fileRow.addEventListener("contextmenu", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.showContextMenu(e, {
                        type: "file",
                        path: file.path,
                        name: file.name,
                        filename: file.filename
                    });
                });

                // Drag & drop
                this.attachFileDragEvents(fileRow, file);

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
                filteredFiles = filteredFiles.filter(f => f.name.toLowerCase().includes(query) || f.filename.toLowerCase().includes(query));
                filteredFolders = filteredFolders.filter(f => {
                    const matchSelf = f.name.toLowerCase().includes(query);
                    const matchChildren = f.files.some(cf => cf.name.toLowerCase().includes(query));
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

                // Expand/Collapse Click
                folderRow.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (this.justFinishedDrag) return;
                    if (this.expandedFolders.has(folderNode.path)) {
                        this.expandedFolders.delete(folderNode.path);
                    } else {
                        this.expandedFolders.add(folderNode.path);
                    }
                    this.renderPlusTree();
                });

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
                    name.title = `${file.filename}\n경로: ${file.path}`;

                    fileRow.appendChild(icon);
                    fileRow.appendChild(name);

                    if (isActive) {
                        const activeTag = document.createElement("span");
                        activeTag.className = "qol-active-tag";
                        activeTag.textContent = "● 작업중";
                        fileRow.appendChild(activeTag);
                    }

                    const starBtn = document.createElement("span");
                    const isFav = this.isFavorited(file.path);
                    starBtn.className = `qol-fav-star ${isFav ? "is-fav" : ""}`;
                    starBtn.textContent = isFav ? "★" : "☆";
                    starBtn.title = isFav ? "즐겨찾기에서 제거" : "즐겨찾기에 추가";
                    starBtn.addEventListener("click", (e) => {
                        e.stopPropagation();
                        this.toggleFavorite(file.path);
                    });
                    fileRow.appendChild(starBtn);

                    // Drag & drop
                    this.attachFileDragEvents(fileRow, file);

                    // Click to load
                    fileRow.addEventListener("click", (e) => {
                        e.stopPropagation();
                        if (this.justFinishedDrag) return;
                        this.loadWorkflowToCanvas(file.path);
                    });

                    // Context Menu
                    fileRow.addEventListener("contextmenu", (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.showContextMenu(e, {
                            type: "file",
                            path: file.path,
                            name: file.name,
                            filename: file.filename
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
                <span>⚡</span> <span>${BadaI18n.t("wf_ctx_load")}</span>
            </div>
            <div class="qol-menu-item" id="qol-m-fav">
                <span id="qol-m-fav-icon">⭐</span> <span id="qol-m-fav-text">${BadaI18n.t("wf_ctx_fav_add")}</span>
            </div>
            <div class="qol-menu-item" id="qol-m-move">
                <span>📁</span> <span>${BadaI18n.t("wf_ctx_move")}</span>
            </div>
            <div class="qol-menu-item" id="qol-m-new-subfolder">
                <span>➕</span> <span>${BadaI18n.t("wf_ctx_new_subfolder")}</span>
            </div>
            <div class="qol-menu-separator"></div>
            <div class="qol-menu-item" id="qol-m-rename">
                <span>✏️</span> <span>${BadaI18n.t("wf_ctx_rename")}</span>
            </div>
            <div class="qol-menu-item danger" id="qol-m-delete">
                <span>🗑️</span> <span>${BadaI18n.t("wf_ctx_delete")}</span>
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
        const moveItem = menu.querySelector("#qol-m-move");
        const newSubItem = menu.querySelector("#qol-m-new-subfolder");

        if (targetInfo.type === "file") {
            loadItem.style.display = "flex";
            moveItem.style.display = "flex";
            newSubItem.style.display = "none";
            if (favItem) {
                favItem.style.display = "flex";
                const isFav = this.favorites.has(targetInfo.path);
                if (favIcon) favIcon.textContent = isFav ? "★" : "⭐";
                if (favText) favText.textContent = isFav ? "즐겨찾기에서 제거" : "즐겨찾기에 추가";
            }
        } else if (targetInfo.type === "folder") {
            loadItem.style.display = "none";
            moveItem.style.display = "none";
            newSubItem.style.display = "flex";
            if (favItem) favItem.style.display = "none";
        }

        menu.style.left = `${Math.min(e.clientX, window.innerWidth - 200)}px`;
        menu.style.top = `${Math.min(e.clientY, window.innerHeight - 180)}px`;
        menu.style.display = "block";
    }

    async getFolderList() {
        try {
            const res = await fetch("/api/qol/workflows/folders");
            if (res.ok) {
                const data = await res.json();
                return data.folders || ["/"];
            }
        } catch (e) {}
        return ["/"];
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
                    this.showToast(`폴더 '${name}' 생성 완료!`);
                    close();
                    if (parent !== "/") this.expandedFolders.add(parent);
                    await this.loadTree();
                } else {
                    this.showToast(data.error || "생성 실패", true);
                }
            } catch (e) {
                this.showToast(`Error: ${e.message}`, true);
            }
        };
    }

    openRenameModal(targetPath, isFolder) {
        const currentName = targetPath.split("/").pop().replace(/\.json$/i, "");
        const currentFolder = targetPath.includes("/") ? targetPath.split("/").slice(0, -1).join("/") : "/";

        const overlay = document.createElement("div");
        overlay.className = "qol-modal-overlay";
        overlay.innerHTML = `
            <div class="qol-modal-dialog">
                <div class="qol-modal-header">
                    <span>✏️ ${isFolder ? "폴더" : "워크플로우"} 이름 변경</span>
                    <span style="cursor:pointer;" id="qol-m-close">&times;</span>
                </div>
                <div class="qol-modal-body">
                    <div>
                        <div class="qol-form-label" style="margin-bottom:4px;">새 이름 입력</div>
                        <input type="text" class="qol-input" id="qol-rename-input" value="${currentName}" autofocus />
                    </div>
                </div>
                <div class="qol-modal-footer">
                    <button class="qol-btn qol-btn-cancel" id="qol-m-cancel">취소</button>
                    <button class="qol-btn qol-btn-primary" id="qol-m-confirm">변경하기</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.querySelector("#qol-m-close").onclick = close;
        overlay.querySelector("#qol-m-cancel").onclick = close;
        overlay.querySelector("#qol-m-confirm").onclick = async () => {
            const newName = overlay.querySelector("#qol-rename-input").value.trim();
            if (!newName || newName === currentName) {
                close();
                return;
            }
            const formattedName = isFolder ? newName : (newName.endsWith(".json") ? newName : newName + ".json");
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
                    this.showToast(`'${newName}' (으)로 변경 완료!`);
                    close();
                    const newPath = currentFolder === "/" ? formattedName : `${currentFolder}/${formattedName}`;
                    if (this.activeWorkflowPath === targetPath) {
                        this.setActiveWorkflow(newPath, false);
                    }
                    if (this.isFavorited(targetPath)) {
                        this.favorites.delete(this.normalizePath(targetPath));
                        this.favorites.delete(targetPath);
                        this.favorites.add(this.normalizePath(newPath));
                        await this.saveFavorites();
                    }
                    await this.loadTree();
                } else {
                    this.showToast(data.error || "이름 변경 실패", true);
                }
            } catch (e) {
                this.showToast(`Error: ${e.message}`, true);
            }
        };
    }

    openDeleteConfirmModal(targetPath, isFolder) {
        const name = targetPath.split("/").pop();

        const overlay = document.createElement("div");
        overlay.className = "qol-modal-overlay";
        overlay.innerHTML = `
            <div class="qol-modal-dialog">
                <div class="qol-modal-header" style="color: #f87171;">
                    <span>🗑️ ${isFolder ? "폴더" : "워크플로우"} 삭제</span>
                    <span style="cursor:pointer;" id="qol-m-close">&times;</span>
                </div>
                <div class="qol-modal-body">
                    <p style="margin: 0; font-size: 13px; line-height: 1.4;">
                        정말로 <strong>'${name}'</strong> ${isFolder ? "폴더와 내부 파일을" : "워크플로우를"} 삭제하시겠습니까?
                    </p>
                </div>
                <div class="qol-modal-footer">
                    <button class="qol-btn qol-btn-cancel" id="qol-m-cancel">취소</button>
                    <button class="qol-btn qol-btn-danger" id="qol-m-confirm">삭제</button>
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
                    this.showToast(`'${name}' 삭제 완료!`);
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
                    this.showToast(data.error || "삭제 실패", true);
                }
            } catch (e) {
                this.showToast(`Error: ${e.message}`, true);
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
