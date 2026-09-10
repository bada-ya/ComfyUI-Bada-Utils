/**
 * ComfyUI Universal Smart Presets - Glassmorphic Modal UI
 * - Global Node Presets Manager
 * - Drag & Drop Preset Reordering (⠿) & Order Buttons (▲/▼)
 * - In-place Inline Title Rename on Pencil Click (✏️) or Double-Click
 * - Accordion Deep Preview Expand/Collapse (▼/▲)
 * - Non-blocking Glassmorphism Toast Notification on Apply/Save/Delete
 * - Comprehensive Guide Sub-Modal for Backup & Cross-Workflow Sharing
 */

import { BadaI18n } from "./bada_i18n.js";

let modalElement = null;
let currentTargetNode = null;
let onApplyCallback = null;
let onUpdateCallback = null;
let onSaveCallback = null;
let onDeleteCallback = null;
let onRenameCallback = null;
let onReorderCallback = null;
let onImportCallback = null;
let onExportCallback = null;
let getCurrentPresets = null;

// Global expanded state tracking by preset name
const expandedState = new Set();

/**
 * Glassmorphic Toast Notification Engine
 */
export function showToast(message, type = "success", duration = 2500) {
    let container = document.getElementById("usp-toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "usp-toast-container";
        container.className = "usp-toast-container";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `usp-toast ${type}`;
    toast.innerHTML = message;
    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add("show");
    });

    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => {
            toast.remove();
            if (container && container.children.length === 0) {
                container.remove();
            }
        }, 300);
    }, duration);
}

/**
 * Detailed Backup & Cross-Workflow Guide Sub-Modal
 */
export function showGuideModal() {
    let guideElement = document.getElementById("usp-guide-modal");
    if (!guideElement) {
        guideElement = document.createElement("div");
        guideElement.id = "usp-guide-modal";
        guideElement.className = "usp-guide-backdrop";
        document.body.appendChild(guideElement);
    }

    const isKo = BadaI18n.lang === "ko";

    guideElement.innerHTML = `
        <div class="usp-guide-container">
            <div class="usp-guide-header">
                <div class="usp-guide-title-box">
                    <div class="usp-guide-icon">💡</div>
                    <div>
                        <h3 class="usp-guide-title">${isKo ? "Bada 프리셋 허브 백업 & 타 워크플로우 적용 가이드" : "Bada Preset Hub Backup & Cross-Workflow Guide"}</h3>
                        <p class="usp-guide-subtitle">${isKo ? "다른 컴퓨터나 새로운 워크플로우로 프리셋을 안전하게 공유하는 방법" : "How to securely share and migrate presets across workflows and systems"}</p>
                    </div>
                </div>
                <button class="usp-btn-close" id="usp-guide-btn-close" title="Close">✕</button>
            </div>

            <div class="usp-guide-body">
                <!-- Section 0: Storage Notice -->
                <div class="usp-guide-section" style="border: 1px solid rgba(245, 158, 11, 0.4); background: rgba(245, 158, 11, 0.08); border-radius: 8px; padding: 12px 14px;">
                    <div class="usp-guide-section-title" style="color: #fbbf24; margin-bottom: 6px;">
                        <span>📌</span> ${isKo ? "유니버셜 프리셋 허브 저장 위치 & 타 워크플로우 적용 안내" : "Storage Location & Cross-Workflow Migration"}
                    </div>
                    <p class="usp-guide-text" style="line-height: 1.5;">
                        ${isKo ? `
                            • <b>유니버셜 프리셋</b>은 개별 노드의 글로벌 프리셋과 달리 <b>현재 워크플로우(Hub 노드 데이터) 내부에만 저장</b>됩니다.<br>
                            • 워크플로우를 저장하거나 이미지를 생성하면 메타데이터에 유니버셜 프리셋이 함께 자동 저장됩니다.<br>
                            • <b>다른 워크플로우나 다른 PC에 동일한 유니버셜 프리셋을 복사/적용</b>하려면, 하단의 <b>[📤 백업 (Export)]</b> 버튼으로 <code style="color:#fde68a;">.json</code> 파일을 내보낸 후 대상 워크플로우에서 <b>[📥 불러오기 (Import)]</b>를 이용해 주세요.<br>
                            • (※ <b>개별 노드의 글로벌 프리셋</b>은 ComfyUI 시스템에 영구 저장되므로 내보내기/가져오기 없이도 모든 워크플로우에서 즉시 공유됩니다.)
                        ` : `
                            • <b>Universal Presets</b> are stored <b>only inside the current workflow</b> (embedded within the Hub node and PNG metadata).<br>
                            • Saving the workflow or generating images automatically packages your universal presets.<br>
                            • To share or copy presets to <b>another workflow or PC</b>, click <b>[📤 Backup (Export)]</b> to export a <code style="color:#fde68a;">.json</code> file, and use <b>[📥 Load (Import)]</b> in your target workflow.<br>
                            • (※ Single-node <b>Global Presets</b> are saved permanently in ComfyUI and available across all workflows automatically.)
                        `}
                    </p>
                </div>

                <!-- Section 1 -->
                <div class="usp-guide-section">
                    <div class="usp-guide-section-title">
                        <span>🎯</span> ${isKo ? "1. 스마트 노드 매칭 3단계 작동 원리" : "1. Smart 3-Tier Node Matching Engine"}
                    </div>
                    <p class="usp-guide-text">
                        ${isKo ? "유니버셜 프리셋을 적용할 때, 시스템은 캔버스 상의 노드를 아래 3단계 우선순위로 자동 탐색하여 1:1로 안전하게 매칭합니다:" : "When applying a universal preset, the system locates canvas nodes using a 3-tier priority sequence:"}
                    </p>
                    <div class="usp-guide-code-example">
                        ${isKo ? `
                            1단계: 노드 고유 번호 (node.id) ➔ 동일 워크플로우 내에서 100% 완벽 매칭<br>
                            2단계: 노드 제목 (title) + 노드 종류 (nodeType) ➔ 타 워크플로우 전용 제목 매칭<br>
                            3단계: 캔버스 좌측 ➔ 우측 배치 순서 1:1 순차 배정 (중복 배정 원천 차단)
                        ` : `
                            Tier 1: Unique Node ID (node.id) ➔ 100% exact match within the same workflow<br>
                            Tier 2: Node Title + Node Type ➔ Cross-workflow title-based targeting<br>
                            Tier 3: Spatial Canvas Order (Left to Right) ➔ 1:1 ordered pairing
                        `}
                    </div>
                </div>

                <!-- Section 2: Critical Tip -->
                <div class="usp-guide-section">
                    <div class="usp-guide-section-title emerald">
                        <span>⚠️</span> ${isKo ? "2. 가장 중요한 핵심 꿀팁 (동일 노드 다중 사용 시)" : "2. Pro-Tip: Differentiating Multiple Nodes"}
                    </div>
                    <p class="usp-guide-text">
                        ${isKo ? "한 워크플로우에 <b>KSampler 2개</b>, <b>Load VAE 2개</b>, <b>디테일러 5개</b> 등 같은 종류의 노드를 여러 개 사용 중이라면, <b>노드를 더블 클릭하여 이름을 다르게 지정</b>해 주세요!" : "If your workflow uses multiple nodes of the same type (e.g. 2 KSamplers, 3 Detailers), <b>double-click each node and give it a unique title</b>!"}
                    </p>
                    <div class="usp-guide-tip-box">
                        <div class="usp-guide-tip-title">${isKo ? "💡 노드 제목(Title) 구분 권장 예시:" : "💡 Recommended Title Examples:"}</div>
                        <div>• <b>KSampler:</b> <code style="color:#ffffff; background:rgba(0,0,0,0.3); padding:1px 5px; border-radius:3px;">[Base KSampler]</code> / <code style="color:#ffffff; background:rgba(0,0,0,0.3); padding:1px 5px; border-radius:3px;">[Hires KSampler]</code></div>
                        <div>• <b>Detailer:</b> <code style="color:#ffffff; background:rgba(0,0,0,0.3); padding:1px 5px; border-radius:3px;">[Face Detailer]</code> / <code style="color:#ffffff; background:rgba(0,0,0,0.3); padding:1px 5px; border-radius:3px;">[Hand Detailer]</code></div>
                    </div>
                </div>

                <!-- Section 3 -->
                <div class="usp-guide-section">
                    <div class="usp-guide-section-title">
                        <span>🔄</span> ${isKo ? "3. 백업(Export) & 불러오기(Import) 활용법" : "3. Backup (Export) & Import"}
                    </div>
                    <p class="usp-guide-text">
                        ${isKo ? `
                            • <b>📤 백업 (Export):</b> 현재 저장된 모든 프리셋을 <code style="color:#fde68a;">.json</code> 단일 파일로 다운로드하여 안전하게 백업합니다.<br>
                            • <b>📥 불러오기 (Import):</b> 다운로드받은 <code style="color:#fde68a;">.json</code> 프리셋 파일을 선택하면 기존 프리셋 목록에 즉시 병합되어 바로 사용하실 수 있습니다.
                        ` : `
                            • <b>📤 Backup (Export):</b> Downloads all presets as a single <code style="color:#fde68a;">.json</code> backup file.<br>
                            • <b>📥 Load (Import):</b> Select any previously exported <code style="color:#fde68a;">.json</code> file to merge presets into your workflow instantly.
                        `}
                    </p>
                </div>
            </div>

            <div class="usp-guide-footer">
                <button class="usp-btn usp-btn-gold" id="usp-guide-btn-confirm">
                    <span>✓</span> ${isKo ? "가이드 확인 완료 (닫기)" : "Close Guide"}
                </button>
            </div>
        </div>
    `;

    const closeGuide = () => {
        guideElement.classList.remove("active");
        document.removeEventListener("keydown", handleGuideKeyDown, true);
    };

    const handleGuideKeyDown = (e) => {
        if (e.key === "Escape") {
            closeGuide();
            e.stopPropagation();
            e.preventDefault();
        }
    };
    document.addEventListener("keydown", handleGuideKeyDown, true);

    guideElement.querySelector("#usp-guide-btn-close").addEventListener("click", closeGuide);
    guideElement.querySelector("#usp-guide-btn-confirm").addEventListener("click", closeGuide);
    guideElement.addEventListener("click", (e) => {
        if (e.target === guideElement) closeGuide();
    });

    guideElement.classList.add("active");
}

export function initModal(callbacks) {
    onApplyCallback = callbacks.onApply;
    onUpdateCallback = callbacks.onUpdate;
    onSaveCallback = callbacks.onSave;
    onDeleteCallback = callbacks.onDelete;
    onRenameCallback = callbacks.onRename;
    onReorderCallback = callbacks.onReorder;
    onImportCallback = callbacks.onImport;
    onExportCallback = callbacks.onExport;
    getCurrentPresets = callbacks.getPresets;

    createModalDOM();
}

/**
 * Main Global Presets Modal Creation
 */
function createModalDOM() {
    const existing = document.getElementById("usp-presets-modal");
    if (existing) {
        existing.remove();
    }

    const backdrop = document.createElement("div");
    backdrop.id = "usp-presets-modal";
    backdrop.className = "usp-modal-backdrop";
    backdrop.innerHTML = `
        <div class="usp-modal-container">
            <div class="usp-modal-header">
                <div class="usp-header-title-box">
                    <div class="usp-header-icon">🌐</div>
                    <div>
                        <h3 class="usp-header-title" id="usp-node-title">${BadaI18n.t("modal_global_title", { name: "" })}</h3>
                        <p class="usp-header-subtitle" id="usp-node-subtitle">${BadaI18n.t("modal_global_subtitle", { type: "" })}</p>
                    </div>
                </div>
                <button class="usp-btn-close" id="usp-btn-close" title="Close">✕</button>
            </div>

            <div class="usp-modal-body">
                <!-- Save Current Box -->
                <div class="usp-save-bar" id="usp-global-save-box">
                    <div class="usp-save-input-row">
                        <input type="text" class="usp-input" id="usp-preset-name-input" placeholder="${BadaI18n.t("modal_global_input_placeholder")}" />
                        <button class="usp-btn usp-btn-primary" id="usp-btn-save-current">
                            ${BadaI18n.t("modal_global_save_btn")}
                        </button>
                    </div>
                </div>

                <!-- Presets List -->
                <div class="usp-presets-list" id="usp-presets-list-container">
                    <!-- Cards will be populated here -->
                </div>
            </div>

            <div class="usp-modal-footer">
                <div class="usp-footer-left">
                    <button class="usp-btn usp-btn-secondary" id="usp-btn-export" title="Export to JSON">
                        ${BadaI18n.t("modal_export_btn")}
                    </button>
                    <button class="usp-btn usp-btn-secondary" id="usp-btn-import" title="Import from JSON">
                        ${BadaI18n.t("modal_import_btn")}
                    </button>
                    <input type="file" id="usp-import-file-input" accept=".json" style="display: none;" />
                </div>
                <button class="usp-btn usp-btn-secondary" id="usp-btn-done">${BadaI18n.t("modal_close_btn")}</button>
            </div>
        </div>
    `;

    document.body.appendChild(backdrop);
    modalElement = backdrop;

    // Event Listeners
    document.getElementById("usp-btn-close").addEventListener("click", closeModal);
    document.getElementById("usp-btn-done").addEventListener("click", closeModal);
    backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) closeModal();
    });

    document.getElementById("usp-btn-save-current").addEventListener("click", handleSaveCurrent);
    document.getElementById("usp-preset-name-input").addEventListener("keydown", (e) => {
        if (e.key === "Enter") handleSaveCurrent();
    });

    // Import / Export
    document.getElementById("usp-btn-export").addEventListener("click", () => {
        if (onExportCallback) onExportCallback();
    });

    const fileInput = document.getElementById("usp-import-file-input");
    document.getElementById("usp-btn-import").addEventListener("click", () => {
        fileInput.click();
    });
    fileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file && onImportCallback) {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    onImportCallback(data);
                    renderPresetList();
                    showToast("📥 글로벌 프리셋을 성공적으로 불러왔습니다!", "success");
                } catch (err) {
                    showToast("⚠️ JSON 파일을 읽는 중 오류가 발생했습니다: " + err.message, "warning");
                }
            };
            reader.readAsText(file);
        }
        fileInput.value = "";
    });
}

export function showPresetModal(node, options = {}) {
    if (!modalElement || !document.getElementById("usp-presets-modal")) {
        createModalDOM();
    }
    currentTargetNode = node;

    const nodeType = node.comfyClass || node.type || "UnknownNode";
    const nodeTitle = node.title || nodeType;

    document.getElementById("usp-node-title").textContent = BadaI18n.t("modal_global_title", { name: nodeTitle });
    document.getElementById("usp-node-subtitle").textContent = BadaI18n.t("modal_global_subtitle", { type: nodeType });

    const nameInput = document.getElementById("usp-preset-name-input");
    nameInput.placeholder = BadaI18n.t("modal_global_input_placeholder");
    const saveBtn = document.getElementById("usp-btn-save-current");
    if (saveBtn) saveBtn.innerHTML = BadaI18n.t("modal_global_save_btn");
    const exportBtn = document.getElementById("usp-btn-export");
    if (exportBtn) exportBtn.innerHTML = BadaI18n.t("modal_export_btn");
    const importBtn = document.getElementById("usp-btn-import");
    if (importBtn) importBtn.innerHTML = BadaI18n.t("modal_import_btn");
    const doneBtn = document.getElementById("usp-btn-done");
    if (doneBtn) doneBtn.textContent = BadaI18n.t("modal_close_btn");

    const saveBox = document.getElementById("usp-global-save-box");

    if (options.focusSave) {
        nameInput.value = options.defaultName || "";
        if (saveBox) saveBox.style.boxShadow = "0 0 0 2px rgba(99, 102, 241, 0.6)";
        setTimeout(() => {
            nameInput.focus();
            nameInput.select();
        }, 80);
    } else {
        nameInput.value = "";
        if (saveBox) saveBox.style.boxShadow = "none";
    }

    renderPresetList();
    modalElement.classList.add("active");

    const onKeyDown = (e) => {
        if (e.key === "Escape") {
            closeModal();
            e.stopPropagation();
            e.preventDefault();
        }
    };
    if (modalElement._onKeyDown) {
        document.removeEventListener("keydown", modalElement._onKeyDown, true);
    }
    modalElement._onKeyDown = onKeyDown;
    document.addEventListener("keydown", onKeyDown, true);
}

export function closeModal() {
    if (modalElement) {
        if (modalElement._onKeyDown) {
            document.removeEventListener("keydown", modalElement._onKeyDown, true);
            delete modalElement._onKeyDown;
        }
        modalElement.classList.remove("active");
    }
    currentTargetNode = null;
}

function handleSaveCurrent() {
    if (!currentTargetNode) return;
    const input = document.getElementById("usp-preset-name-input");
    const name = input.value.trim();
    if (!name) {
        showToast("⚠️ 프리셋 이름을 입력해 주세요!", "warning");
        input.focus();
        return;
    }

    if (onSaveCallback) {
        onSaveCallback(currentTargetNode, name);
        input.value = "";
        renderPresetList();
        showToast(`💾 [${name}] 프리셋이 저장되었습니다!`, "info");
    }
}

function renderPresetList() {
    if (!currentTargetNode) return;
    const container = document.getElementById("usp-presets-list-container");
    container.innerHTML = "";

    const presets = getCurrentPresets ? getCurrentPresets(currentTargetNode) : {};
    const presetNames = Object.keys(presets);

    if (presetNames.length === 0) {
        container.innerHTML = `
            <div class="usp-empty-notice">
                ${BadaI18n.t("modal_global_empty")}
            </div>
        `;
        return;
    }

    const hintBar = document.createElement("div");
    hintBar.className = "usp-list-guide-hint";
    hintBar.innerHTML = `<span>💡</span> <span>${BadaI18n.t("modal_global_hint")}</span>`;
    container.appendChild(hintBar);

    presetNames.forEach((presetName, index) => {
        const presetData = presets[presetName];
        const card = createPresetCard(presetName, presetData, index, presetNames.length);
        container.appendChild(card);
    });

    setupDragAndDrop(container);
}

function createPresetCard(presetName, presetData, index, totalCount) {
    const card = document.createElement("div");
    card.className = "usp-preset-card";
    card.draggable = true;
    card.dataset.index = index;
    card.dataset.name = presetName;

    const isExpanded = expandedState.has(presetName);
    if (isExpanded) {
        card.classList.add("expanded");
    }

    // Collapsed Preview Tags Summary
    const previewHtml = generatePreviewTags(presetData, presetName);
    // Deep Expanded Details
    const expandedDetailsHtml = generateDeepDetailsHtml(presetData, presetName, currentTargetNode);

    const loraBadge = presetData._isLoraStack ? `<span class="usp-preset-badge-tag">LoRA Stack (${presetData.loras?.length || 0})</span>` : "";

    card.innerHTML = `
        <div class="usp-card-top">
            <div class="usp-preset-name-box">
                <span class="usp-drag-handle" title="드래그하여 순서 변경">⠿</span>
                <span class="usp-preset-icon">🔖</span>
                <span class="usp-preset-name-text" title="클릭하여 이름 수정">${escapeHtml(presetName)}</span>
                ${loraBadge}
            </div>
            <div class="usp-card-actions">
                <button class="usp-btn usp-btn-order" data-action="up" title="Up" ${index === 0 ? "disabled" : ""}>▲</button>
                <button class="usp-btn usp-btn-order" data-action="down" title="Down" ${index === totalCount - 1 ? "disabled" : ""}>▼</button>
                
                <button class="usp-btn usp-btn-expand ${isExpanded ? "active" : ""}" data-action="toggle-expand" title="Details">
                    <span class="usp-expand-icon">▼</span> ${isExpanded ? BadaI18n.t("modal_collapse_btn") : BadaI18n.t("modal_details_btn")}
                </button>
                <button class="usp-btn usp-btn-apply" data-action="apply">
                    <span>▶</span> ${BadaI18n.t("modal_apply_btn")}
                </button>
                <button class="usp-btn usp-btn-secondary" data-action="rename" title="Rename">
                    <span>✏️</span>
                </button>
                <button class="usp-btn usp-btn-danger" data-action="delete" title="Delete">
                    <span>🗑️</span>
                </button>
            </div>
        </div>
        <div class="usp-preview-box">
            ${previewHtml}
        </div>
        <div class="usp-card-expanded-content">
            ${expandedDetailsHtml}
        </div>
    `;

    // 1. Instant Apply - Closes modal immediately + Toast notification
    card.querySelector('[data-action="apply"]').addEventListener("click", () => {
        if (onApplyCallback && currentTargetNode) {
            closeModal();
            onApplyCallback(currentTargetNode, presetName, presetData);
            showToast(`✨ [${presetName}] 프리셋 즉시 적용 완료!`, "success");
        }
    });

    // 2. Expand / Collapse Toggle
    const expandBtn = card.querySelector('[data-action="toggle-expand"]');
    expandBtn.addEventListener("click", () => {
        if (expandedState.has(presetName)) {
            expandedState.delete(presetName);
            card.classList.remove("expanded");
            expandBtn.classList.remove("active");
            expandBtn.innerHTML = `<span class="usp-expand-icon">▼</span> ${BadaI18n.t("modal_details_btn")}`;
        } else {
            expandedState.add(presetName);
            card.classList.add("expanded");
            expandBtn.classList.add("active");
            expandBtn.innerHTML = `<span class="usp-expand-icon">▼</span> ${BadaI18n.t("modal_collapse_btn")}`;
        }
    });

    // 3. Inline Rename (No prompt popups!)
    const titleSpan = card.querySelector(".usp-preset-name-text");
    const renameBtn = card.querySelector('[data-action="rename"]');

    const triggerInlineRename = () => {
        startInlineRename(card, presetName, (newName) => {
            if (onRenameCallback && currentTargetNode) {
                onRenameCallback(currentTargetNode, presetName, newName);
                if (expandedState.has(presetName)) {
                    expandedState.delete(presetName);
                    expandedState.add(newName);
                }
                renderPresetList();
                showToast(`✏️ 프리셋 이름이 [${newName}] (으)로 변경되었습니다.`, "info");
            }
        });
    };

    renameBtn.addEventListener("click", triggerInlineRename);
    titleSpan.addEventListener("dblclick", triggerInlineRename);

    // 4. Reorder Up / Down
    card.querySelector('[data-action="up"]').addEventListener("click", () => {
        if (onReorderCallback && currentTargetNode && index > 0) {
            onReorderCallback(currentTargetNode, index, index - 1);
            renderPresetList();
            showToast(`↕️ 프리셋 순서가 변경되었습니다.`, "info");
        }
    });

    card.querySelector('[data-action="down"]').addEventListener("click", () => {
        if (onReorderCallback && currentTargetNode && index < totalCount - 1) {
            onReorderCallback(currentTargetNode, index, index + 1);
            renderPresetList();
            showToast(`↕️ 프리셋 순서가 변경되었습니다.`, "info");
        }
    });

    // 5. Delete
    card.querySelector('[data-action="delete"]').addEventListener("click", () => {
        if (confirm(`'${presetName}' 프리셋을 정말 삭제하시겠습니까?`)) {
            if (onDeleteCallback && currentTargetNode) {
                onDeleteCallback(currentTargetNode, presetName);
                expandedState.delete(presetName);
                renderPresetList();
                showToast(`🗑️ [${presetName}] 프리셋이 삭제되었습니다.`, "warning");
            }
        }
    });

    // --- 6. TWO-WAY REALTIME TOGGLE & SYNC ENGINE ---
    
    // Shared helper to toggle a widget key
    const toggleWidget = (key, forcedState = null) => {
        if (!presetData._disabledWidgets) presetData._disabledWidgets = [];
        const isCurrentlyDisabled = presetData._disabledWidgets.includes(key);
        const shouldDisable = forcedState !== null ? !forcedState : !isCurrentlyDisabled;

        if (shouldDisable && !isCurrentlyDisabled) {
            presetData._disabledWidgets.push(key);
        } else if (!shouldDisable && isCurrentlyDisabled) {
            presetData._disabledWidgets = presetData._disabledWidgets.filter(k => k !== key);
        }

        const nowDisabled = presetData._disabledWidgets.includes(key);

        // Sync collapsed tag
        const tag = card.querySelector(`.usp-tag[data-key="${CSS.escape(key)}"]`);
        if (tag) {
            tag.classList.toggle("disabled", nowDisabled);
            const icon = tag.querySelector(".usp-tag-status-icon");
            if (icon) icon.textContent = nowDisabled ? "⊘" : "●";
            tag.title = `클릭하여 ${nowDisabled ? "적용(ON)" : "제외(OFF)"}`;
        }

        // Sync expanded row
        const row = card.querySelector(`.usp-expanded-param-item[data-key="${CSS.escape(key)}"]`);
        if (row) {
            row.classList.toggle("disabled", nowDisabled);
            const toggleBox = row.querySelector(".usp-widget-toggle");
            if (toggleBox) toggleBox.checked = !nowDisabled;
        }

        // Persist update
        if (onUpdateCallback && currentTargetNode) {
            onUpdateCallback(currentTargetNode, presetName, presetData);
        }

        showToast(nowDisabled ? `⚡ [${key}] 옵션 제외 (적용 시 무시)` : `⚡ [${key}] 옵션 포함 (적용 ON)`, "info", 1600);
    };

    // Shared helper to toggle a LoRA item
    const toggleLora = (loraIdx, forcedState = null) => {
        if (!presetData.loras || !presetData.loras[loraIdx]) return;
        const item = presetData.loras[loraIdx];
        const isCurrentlyOn = item.on !== false;
        const nowOn = forcedState !== null ? forcedState : !isCurrentlyOn;
        item.on = nowOn;

        // Sync collapsed tag
        const tag = card.querySelector(`.usp-tag-lora[data-lora-idx="${loraIdx}"]`);
        if (tag) {
            tag.classList.toggle("disabled", !nowOn);
            const icon = tag.querySelector(".usp-tag-status-icon");
            if (icon) icon.textContent = nowOn ? "🟣" : "⚪";
            tag.title = `클릭하여 ${nowOn ? "제외(OFF)" : "적용(ON)"}`;
        }

        // Sync expanded row
        const row = card.querySelector(`.usp-lora-row[data-lora-idx="${loraIdx}"]`);
        if (row) {
            row.classList.toggle("disabled", !nowOn);
            const toggleBox = row.querySelector(".usp-lora-toggle");
            if (toggleBox) toggleBox.checked = nowOn;
        }

        // Persist update
        if (onUpdateCallback && currentTargetNode) {
            onUpdateCallback(currentTargetNode, presetName, presetData);
        }

        showToast(nowOn ? `🟣 LoRA #${loraIdx + 1} 적용 ON` : `⚪ LoRA #${loraIdx + 1} 제외 OFF`, "info", 1600);
    };

    // A. Collapsed Preview Tag Clicks
    card.querySelector(".usp-preview-box").addEventListener("click", (e) => {
        const tag = e.target.closest(".usp-tag");
        if (!tag) return;

        if (tag.dataset.key) {
            toggleWidget(tag.dataset.key);
        } else if (tag.dataset.loraIdx !== undefined) {
            toggleLora(parseInt(tag.dataset.loraIdx, 10));
        }
    });

    // B. Expanded Row Toggle Switch Changes
    card.querySelector(".usp-card-expanded-content").addEventListener("change", (e) => {
        if (e.target.classList.contains("usp-widget-toggle")) {
            const key = e.target.dataset.key;
            if (key) toggleWidget(key, e.target.checked);
        } else if (e.target.classList.contains("usp-lora-toggle")) {
            const idx = parseInt(e.target.dataset.loraIdx, 10);
            if (!isNaN(idx)) toggleLora(idx, e.target.checked);
        }
    });

    // C. Expanded Row In-modal Input / Select Changes (Auto-detected widgets)
    card.querySelector(".usp-card-expanded-content").addEventListener("input", (e) => {
        const target = e.target;
        
        // 1. Standard Widget Value Inputs (select, number, text, boolean)
        if (target.dataset.key && (
            target.classList.contains("usp-inline-widget-select") ||
            target.classList.contains("usp-inline-widget-num") ||
            target.classList.contains("usp-inline-widget-text") ||
            target.classList.contains("usp-inline-widget-bool")
        )) {
            const key = target.dataset.key;
            let val;
            if (target.type === "checkbox") {
                val = target.checked;
            } else if (target.type === "number") {
                val = target.value === "" ? 0 : Number(target.value);
            } else {
                val = target.value;
            }

            if (!presetData.widgets) presetData.widgets = {};
            presetData.widgets[key] = val;

            // Sync text on collapsed tag
            const tag = card.querySelector(`.usp-tag[data-key="${CSS.escape(key)}"]`);
            if (tag) {
                const valSpan = tag.querySelector(".usp-tag-val");
                if (valSpan) {
                    let displayVal = val;
                    if (typeof val === "number") {
                        displayVal = Number.isInteger(val) ? val : val.toFixed(2);
                    } else if (typeof val === "string") {
                        displayVal = val.split(/[\/\\]/).pop();
                    }
                    valSpan.textContent = String(displayVal);
                }
            }

            if (onUpdateCallback && currentTargetNode) {
                onUpdateCallback(currentTargetNode, presetName, presetData);
            }
        }

        // 2. LoRA Strength Inputs
        if (target.classList.contains("usp-lora-strength-input")) {
            const idx = parseInt(target.dataset.loraIdx, 10);
            if (presetData.loras && presetData.loras[idx]) {
                const newStrength = target.value === "" ? 0 : parseFloat(target.value);
                presetData.loras[idx].strength = newStrength;

                // Sync text on collapsed LoRA tag
                const tag = card.querySelector(`.usp-tag-lora[data-lora-idx="${idx}"]`);
                if (tag) {
                    const valSpan = tag.querySelector(".usp-tag-val");
                    if (valSpan) valSpan.textContent = typeof newStrength === "number" ? newStrength.toFixed(2) : String(newStrength);
                }

                if (onUpdateCallback && currentTargetNode) {
                    onUpdateCallback(currentTargetNode, presetName, presetData);
                }
            }
        }
    });

    // D. Stepper Button Clicks ([-] and [+])
    card.querySelector(".usp-card-expanded-content").addEventListener("click", (e) => {
        const btn = e.target.closest(".usp-stepper-btn");
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();

        const stepper = btn.closest(".usp-number-stepper");
        if (!stepper) return;
        const input = stepper.querySelector("input[type='number']");
        if (!input) return;

        const step = parseFloat(btn.dataset.step) || (Number.isInteger(parseFloat(input.value)) ? 1 : 0.05);
        let curVal = parseFloat(input.value);
        if (isNaN(curVal)) curVal = 0;

        const isPlus = btn.classList.contains("usp-stepper-btn-plus") || btn.classList.contains("usp-lora-stepper-plus");
        let newVal = isPlus ? curVal + step : curVal - step;

        if (input.min !== "" && newVal < parseFloat(input.min)) newVal = parseFloat(input.min);
        if (input.max !== "" && newVal > parseFloat(input.max)) newVal = parseFloat(input.max);

        // Clean decimal precision
        if (!Number.isInteger(newVal)) {
            const stepDecimals = (String(step).split(".")[1] || "00").length;
            newVal = parseFloat(newVal.toFixed(Math.max(stepDecimals, 2)));
        }

        input.value = newVal;
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    return card;
}

/**
 * Start In-place title editing
 */
function startInlineRename(card, oldName, onSave) {
    const nameBox = card.querySelector(".usp-preset-name-box");
    const titleSpan = card.querySelector(".usp-preset-name-text");
    if (!nameBox || !titleSpan) return;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "usp-inline-edit-input";
    input.value = oldName;

    titleSpan.replaceWith(input);
    input.focus();
    input.select();

    let isFinished = false;

    const finishEdit = (shouldSave) => {
        if (isFinished) return;
        isFinished = true;

        const newName = input.value.trim();
        if (shouldSave && newName && newName !== oldName) {
            onSave(newName);
        } else {
            input.replaceWith(titleSpan);
        }
    };

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            finishEdit(true);
        } else if (e.key === "Escape") {
            finishEdit(false);
        }
    });

    input.addEventListener("blur", () => {
        finishEdit(true);
    });
}

/**
 * Setup Drag and Drop reordering across cards
 */
function setupDragAndDrop(container) {
    let draggedCard = null;

    container.querySelectorAll(".usp-preset-card").forEach((card) => {
        card.addEventListener("dragstart", (e) => {
            draggedCard = card;
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", card.dataset.index);
            card.classList.add("dragging");
        });

        card.addEventListener("dragend", () => {
            card.classList.remove("dragging");
            container.querySelectorAll(".usp-preset-card").forEach((c) => {
                c.classList.remove("drag-over-top", "drag-over-bottom");
            });
            draggedCard = null;
        });

        card.addEventListener("dragover", (e) => {
            e.preventDefault();
            if (!draggedCard || draggedCard === card) return;

            const rect = card.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;

            if (e.clientY < midpoint) {
                card.classList.add("drag-over-top");
                card.classList.remove("drag-over-bottom");
            } else {
                card.classList.add("drag-over-bottom");
                card.classList.remove("drag-over-top");
            }
        });

        card.addEventListener("dragleave", () => {
            card.classList.remove("drag-over-top", "drag-over-bottom");
        });

        card.addEventListener("drop", (e) => {
            e.preventDefault();
            card.classList.remove("drag-over-top", "drag-over-bottom");
            if (!draggedCard || draggedCard === card) return;

            const fromIndex = parseInt(draggedCard.dataset.index, 10);
            const toIndex = parseInt(card.dataset.index, 10);

            if (onReorderCallback && currentTargetNode && fromIndex !== toIndex) {
                onReorderCallback(currentTargetNode, fromIndex, toIndex);
                renderPresetList();
                showToast(`↕️ 프리셋 순서가 변경되었습니다.`, "info");
            }
        });
    });
}

function generatePreviewTags(presetData, presetName) {
    if (!presetData) return '<span class="usp-tag">데이터 없음</span>';

    const disabledWidgets = Array.isArray(presetData._disabledWidgets) ? presetData._disabledWidgets : [];

    // 1. Dynamic LoRA Stack (Render ALL LoRAs with click-to-toggle)
    if (presetData._isLoraStack && Array.isArray(presetData.loras)) {
        if (presetData.loras.length === 0) {
            return '<span class="usp-tag">LoRA 없음 (비어있음)</span>';
        }
        return presetData.loras.map((item, idx) => {
            const isOn = item.on !== false;
            const shortName = (item.lora || "None").split(/[\/\\]/).pop();
            const strengthStr = typeof item.strength === "number" ? item.strength.toFixed(2) : (item.strength ?? "1.0");
            const stateIcon = isOn ? "🟣" : "⚪";
            return `
                <span class="usp-tag usp-tag-lora ${isOn ? "" : "disabled"}" data-lora-idx="${idx}" title="클릭하여 ${isOn ? "제외(OFF)" : "적용(ON)"}">
                    <span class="usp-tag-status-icon">${stateIcon}</span>
                    <span class="usp-tag-lora-name">${escapeHtml(shortName)}</span>
                    <b class="usp-tag-val">${strengthStr}</b>
                </span>
            `;
        }).join("");
    }

    // 2. Standard Widgets (Render ALL widgets without truncation)
    const widgets = presetData.widgets || presetData;
    const keys = Object.keys(widgets).filter((k) => !k.startsWith("_"));
    if (keys.length === 0) return '<span class="usp-tag">기본 설정값</span>';

    return keys.map((k) => {
        const isDisabled = disabledWidgets.includes(k);
        let val = widgets[k];
        let displayVal = val;
        if (typeof val === "number") {
            displayVal = Number.isInteger(val) ? val : val.toFixed(2);
        } else if (typeof val === "string") {
            displayVal = val.split(/[\/\\]/).pop();
        }
        const stateIcon = isDisabled ? "⊘" : "●";
        return `
            <span class="usp-tag ${isDisabled ? "disabled" : ""}" data-key="${escapeHtml(k)}" title="클릭하여 ${isDisabled ? "적용(ON)" : "제외(OFF)"}">
                <span class="usp-tag-status-icon">${stateIcon}</span>
                <span class="usp-tag-key">${escapeHtml(k)}:</span>
                <span class="usp-tag-val">${escapeHtml(String(displayVal))}</span>
            </span>
        `;
    }).join("");
}

function generateDeepDetailsHtml(presetData, presetName, targetNode) {
    if (!presetData) return '<div class="usp-empty-notice">상세 데이터가 없습니다.</div>';

    const disabledWidgets = Array.isArray(presetData._disabledWidgets) ? presetData._disabledWidgets : [];
    const items = [];

    // 1. LoRA Stack Deep Table
    if (presetData._isLoraStack && Array.isArray(presetData.loras)) {
        if (presetData.loras.length === 0) {
            items.push('<div class="usp-expanded-param-item"><span class="usp-param-key">등록된 LoRA가 없습니다.</span></div>');
        } else {
            presetData.loras.forEach((item, idx) => {
                const cleanName = (item.lora || "None").split(/[\/\\]/).pop();
                const str = item.strength !== undefined ? item.strength : 1.0;
                const isOn = item.on !== false;
                items.push(`
                    <div class="usp-expanded-param-item usp-lora-row ${isOn ? "" : "disabled"}" data-lora-idx="${idx}">
                        <label class="usp-toggle-switch" title="LoRA 적용 여부 켜기/끄기">
                            <input type="checkbox" class="usp-toggle-checkbox usp-lora-toggle" data-lora-idx="${idx}" ${isOn ? "checked" : ""}>
                            <span class="usp-toggle-slider"></span>
                        </label>
                        <span class="usp-lora-idx">#${idx + 1}</span>
                        <span class="usp-lora-name" title="${escapeHtml(item.lora || "None")}">${escapeHtml(cleanName)}</span>
                        <div class="usp-lora-inputs">
                            <div class="usp-lora-strength-wrap">
                                <span class="usp-lora-strength-label">가중치:</span>
                                <div class="usp-number-stepper">
                                    <button type="button" class="usp-stepper-btn usp-lora-stepper-minus" data-lora-idx="${idx}" data-step="0.05" title="0.05 감소">−</button>
                                    <input type="number" step="0.05" class="usp-inline-widget-num usp-lora-strength-input" data-lora-idx="${idx}" value="${str}" title="가중치 조절" />
                                    <button type="button" class="usp-stepper-btn usp-lora-stepper-plus" data-lora-idx="${idx}" data-step="0.05" title="0.05 증가">+</button>
                                </div>
                            </div>
                        </div>
                    </div>
                `);
            });
        }
    }

    // 2. All Widgets Details (Interactive Combo Select, Number Stepper, Text)
    const widgets = presetData.widgets || presetData;
    if (widgets && typeof widgets === "object") {
        for (const [key, val] of Object.entries(widgets)) {
            if (key.startsWith("_") || typeof val === "object" || typeof val === "function") continue;
            
            const isDisabled = disabledWidgets.includes(key);
            const targetNodeWidget = targetNode?.widgets?.find(w => w.name === key);

            let inputHtml = "";

            // A. Dropdown Combo (Sampler, Scheduler, Checkpoints, VAE, etc.)
            if (targetNodeWidget && (targetNodeWidget.type === "combo" || Array.isArray(targetNodeWidget.options?.values))) {
                const options = targetNodeWidget.options.values || [];
                let hasCurrent = false;
                const optsHtml = options.map(opt => {
                    const isSelected = String(opt) === String(val);
                    if (isSelected) hasCurrent = true;
                    return `<option value="${escapeHtml(opt)}" ${isSelected ? "selected" : ""}>${escapeHtml(opt)}</option>`;
                }).join("");

                const extraOpt = (!hasCurrent && val !== undefined && val !== null) ? `<option value="${escapeHtml(val)}" selected>${escapeHtml(val)} (현재값)</option>` : "";
                inputHtml = `<select class="usp-inline-widget-select" data-key="${escapeHtml(key)}">${extraOpt}${optsHtml}</select>`;
            }
            // B. Number Stepper: [-] [ value ] [+]
            else if (targetNodeWidget?.type === "number" || typeof val === "number") {
                const minAttr = targetNodeWidget?.options?.min !== undefined ? `min="${targetNodeWidget.options.min}"` : "";
                const maxAttr = targetNodeWidget?.options?.max !== undefined ? `max="${targetNodeWidget.options.max}"` : "";
                let stepVal = 1;
                let stepAttr = "";
                if (targetNodeWidget?.options?.step !== undefined) {
                    stepVal = targetNodeWidget.options.step;
                    stepAttr = `step="${stepVal}"`;
                } else if (Number.isInteger(val)) {
                    stepVal = 1;
                    stepAttr = 'step="1"';
                } else {
                    stepVal = 0.05;
                    stepAttr = 'step="0.01"';
                }
                inputHtml = `
                    <div class="usp-number-stepper">
                        <button type="button" class="usp-stepper-btn usp-stepper-btn-minus" data-key="${escapeHtml(key)}" data-step="${stepVal}" title="${stepVal} 감소">−</button>
                        <input type="number" class="usp-inline-widget-num" data-key="${escapeHtml(key)}" value="${val}" ${minAttr} ${maxAttr} ${stepAttr} />
                        <button type="button" class="usp-stepper-btn usp-stepper-btn-plus" data-key="${escapeHtml(key)}" data-step="${stepVal}" title="${stepVal} 증가">+</button>
                    </div>
                `;
            }
            // C. Boolean Input
            else if (typeof val === "boolean") {
                inputHtml = `
                    <label class="usp-toggle-switch" title="값 변경">
                        <input type="checkbox" class="usp-inline-widget-bool" data-key="${escapeHtml(key)}" ${val ? "checked" : ""} />
                        <span class="usp-toggle-slider"></span>
                    </label>
                `;
            }
            // D. Text Input
            else {
                inputHtml = `<input type="text" class="usp-inline-widget-text" data-key="${escapeHtml(key)}" value="${escapeHtml(String(val))}" />`;
            }

            items.push(`
                <div class="usp-expanded-param-item ${isDisabled ? "disabled" : ""}" data-key="${escapeHtml(key)}">
                    <label class="usp-toggle-switch" title="적용 여부 켜기/끄기">
                        <input type="checkbox" class="usp-toggle-checkbox usp-widget-toggle" data-key="${escapeHtml(key)}" ${!isDisabled ? "checked" : ""}>
                        <span class="usp-toggle-slider"></span>
                    </label>
                    <span class="usp-param-key">${escapeHtml(key)}:</span>
                    <div class="usp-param-input-wrap">
                        ${inputHtml}
                    </div>
                </div>
            `);
        }
    }

    if (items.length === 0) {
        return '<div class="usp-empty-notice">상세 설정값이 비어있습니다.</div>';
    }

    return `
        <div style="font-weight: 700; color: #f1f5f9; margin-bottom: 14px; font-size: 1.38rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <span>📋 상세 파라미터 제어 & 인라인 수정:</span>
            <span style="font-size: 1.05rem; font-weight: 500; color: #38bdf8; background: rgba(56, 189, 248, 0.08); padding: 4px 12px; border-radius: 6px; border: 1px solid rgba(56, 189, 248, 0.22);">
                💡 스위치로 옵션을 켜고 끄거나 값을 수정한 뒤 저장/적용할 수 있습니다 (실시간 자동 저장)
            </span>
        </div>
        <div class="usp-expanded-params-list">
            ${items.join("")}
        </div>
    `;
}

function escapeHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
