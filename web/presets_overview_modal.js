/**
 * ComfyUI-Bada-Utils: Global Presets Overview & Manager Modal
 * Displays comprehensive summary of all global presets registered across all node types in ComfyUI.
 */
import { showToast } from "./presets_modal.js";
import { BadaI18n } from "./bada_i18n.js";

let overviewModalEl = null;

export function getGlobalPresetsStore() {
    let store = {};
    try {
        const local = localStorage.getItem("ComfyUI_Universal_Smart_Presets_v1");
        if (local) {
            store = JSON.parse(local);
        }
    } catch (e) {
        console.warn("[GlobalPresetsOverview] Failed to read localStorage:", e);
    }
    return store;
}

export function getGlobalPresetsSummary() {
    const store = getGlobalPresetsStore();
    let totalPresets = 0;
    const nodeSummaries = [];

    for (const [nodeType, presets] of Object.entries(store)) {
        if (presets && typeof presets === "object") {
            const names = Object.keys(presets);
            if (names.length > 0) {
                totalPresets += names.length;
                nodeSummaries.push({
                    nodeType,
                    count: names.length,
                    presets: names
                });
            }
        }
    }

    nodeSummaries.sort((a, b) => b.count - a.count || a.nodeType.localeCompare(b.nodeType));

    return {
        totalPresets,
        nodeCount: nodeSummaries.length,
        nodeSummaries
    };
}

export function showGlobalPresetsOverviewModal() {
    if (!overviewModalEl) {
        overviewModalEl = document.createElement("div");
        overviewModalEl.id = "bada-global-presets-overview-modal";
        overviewModalEl.className = "usp-modal-backdrop";
        document.body.appendChild(overviewModalEl);
    }

    renderOverviewModal();

    requestAnimationFrame(() => {
        overviewModalEl.classList.add("active");
    });

    const onKeyDown = (e) => {
        if (e.key === "Escape") {
            closeGlobalPresetsOverviewModal();
            e.stopPropagation();
            e.preventDefault();
        }
    };
    if (overviewModalEl._onKeyDown) {
        document.removeEventListener("keydown", overviewModalEl._onKeyDown, true);
    }
    overviewModalEl._onKeyDown = onKeyDown;
    document.addEventListener("keydown", onKeyDown, true);
}

export function closeGlobalPresetsOverviewModal() {
    if (overviewModalEl) {
        if (overviewModalEl._onKeyDown) {
            document.removeEventListener("keydown", overviewModalEl._onKeyDown, true);
            delete overviewModalEl._onKeyDown;
        }
        overviewModalEl.classList.remove("active");
    }
}

function renderOverviewModal() {
    const isKo = BadaI18n.lang === "ko";
    const { totalPresets, nodeCount, nodeSummaries } = getGlobalPresetsSummary();

    overviewModalEl.innerHTML = `
        <div class="usp-modal-container" style="max-width: 960px; height: 80vh; min-height: 520px;">
            <!-- Header -->
            <div class="usp-modal-header" style="background: rgba(99, 102, 241, 0.06); border-bottom: 1px solid rgba(99, 102, 241, 0.2);">
                <div class="usp-header-title-box">
                    <div class="usp-header-icon" style="background: rgba(99, 102, 241, 0.2); border-color: rgba(99, 102, 241, 0.4); color: #c7d2fe;">
                        🌐
                    </div>
                    <div>
                        <h3 class="usp-header-title" style="font-size: 19px; color: #f8fafc; font-weight: 700; margin: 0;">
                            ${isKo ? "글로벌 프리셋 전체 현황 및 관리자" : "Global Presets Overview & Manager"}
                        </h3>
                        <p class="usp-header-subtitle" style="font-size: 13px; color: #94a3b8; margin: 4px 0 0 0;">
                            ${isKo ? "ComfyUI 전역에 저장된 모든 노드별 프리셋을 한눈에 확인하고 관리합니다" : "Review and manage all global presets stored in ComfyUI"}
                        </p>
                    </div>
                </div>
                <button class="usp-close-btn" id="bada-overview-close-x" style="background: none; border: none; font-size: 22px; color: #94a3b8; cursor: pointer; padding: 6px 12px; border-radius: 8px;">✕</button>
            </div>

            <!-- Stats Bar -->
            <div style="padding: 14px 28px; background: rgba(0, 0, 0, 0.25); border-bottom: 1px solid rgba(255, 255, 255, 0.06); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
                <div style="display: flex; gap: 20px; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 14px; color: #94a3b8;">${isKo ? "🎯 총 등록된 프리셋:" : "🎯 Total Presets:"}</span>
                        <span style="font-size: 15px; font-weight: bold; color: #38bdf8; background: rgba(56, 189, 248, 0.15); padding: 2px 10px; border-radius: 12px; border: 1px solid rgba(56, 189, 248, 0.3);">${totalPresets}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 14px; color: #94a3b8;">${isKo ? "🧩 등록된 노드 종류:" : "🧩 Node Types:"}</span>
                        <span style="font-size: 15px; font-weight: bold; color: #a855f7; background: rgba(168, 85, 247, 0.15); padding: 2px 10px; border-radius: 12px; border: 1px solid rgba(168, 85, 247, 0.3);">${nodeCount}</span>
                    </div>
                </div>
                <div style="font-size: 12px; color: #64748b;">
                    ${isKo ? "※ 모든 워크플로우에서 공유됨" : "※ Stored globally across all workflows"}
                </div>
            </div>

            <!-- Content Area (Cards Grid) -->
            <div style="flex: 1; overflow-y: auto; padding: 22px 28px; display: flex; flex-direction: column; gap: 16px;">
                ${nodeSummaries.length === 0 ? `
                    <div style="text-align: center; padding: 60px 20px; background: rgba(255, 255, 255, 0.02); border: 1px dashed rgba(255, 255, 255, 0.1); border-radius: 14px;">
                        <div style="font-size: 40px; margin-bottom: 12px;">📭</div>
                        <h4 style="font-size: 16px; color: #e2e8f0; margin: 0 0 8px 0;">
                            ${isKo ? "저장된 글로벌 프리셋이 없습니다" : "No Global Presets Saved Yet"}
                        </h4>
                        <p style="font-size: 13px; color: #94a3b8; max-width: 540px; margin: 0 auto; line-height: 1.6;">
                            ${isKo ? "💡 캔버스에서 원하는 노드를 우클릭 후 <b>[현재 세팅 글로벌 프리셋으로 저장...]</b>을 누르면 이곳에 등록됩니다." : "💡 Right-click any node on canvas and select <b>[Save Current Settings as Global Preset...]</b> to save your first global preset!"}
                        </p>
                    </div>
                ` : `
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 16px;">
                        ${nodeSummaries.map(node => `
                            <div style="background: rgba(30, 34, 48, 0.7); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                                <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255, 255, 255, 0.06); padding-bottom: 10px;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <span style="font-size: 16px;">🧩</span>
                                        <span style="font-size: 14px; font-weight: 700; color: #f1f5f9; font-family: monospace;">${escapeHtml(node.nodeType)}</span>
                                    </div>
                                    <span style="font-size: 12px; font-weight: 600; color: #a5b4fc; background: rgba(99, 102, 241, 0.18); padding: 3px 8px; border-radius: 8px; border: 1px solid rgba(99, 102, 241, 0.3);">
                                        ${isKo ? `${node.count}개 프리셋` : `${node.count} ${node.count === 1 ? "Preset" : "Presets"}`}
                                    </span>
                                </div>
                                <div style="display: flex; flex-wrap: wrap; gap: 6px; max-height: 140px; overflow-y: auto;">
                                    ${node.presets.map(name => `
                                        <span style="font-size: 12px; color: #cbd5e1; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); padding: 4px 10px; border-radius: 14px; display: inline-flex; align-items: center; gap: 4px;">
                                            <span>🏷️</span> <span>${escapeHtml(name)}</span>
                                        </span>
                                    `).join("")}
                                </div>
                            </div>
                        `).join("")}
                    </div>
                `}
            </div>

            <!-- Footer -->
            <div style="padding: 16px 28px; background: rgba(255, 255, 255, 0.02); border-top: 1px solid rgba(255, 255, 255, 0.07); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
                <div style="display: flex; gap: 10px;">
                    <button id="bada-overview-export-btn" class="usp-btn usp-btn-secondary" style="font-size: 13px; padding: 8px 14px; display: inline-flex; align-items: center; gap: 6px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.15); color: #e2e8f0; border-radius: 8px; cursor: pointer;">
                        ${isKo ? "📤 전체 프리셋 백업 (JSON)" : "📤 Backup All Presets (JSON)"}
                    </button>
                    <button id="bada-overview-import-btn" class="usp-btn usp-btn-secondary" style="font-size: 13px; padding: 8px 14px; display: inline-flex; align-items: center; gap: 6px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.15); color: #e2e8f0; border-radius: 8px; cursor: pointer;">
                        ${isKo ? "📥 프리셋 불러오기" : "📥 Import Presets"}
                    </button>
                </div>
                <button id="bada-overview-close-btn" class="usp-btn usp-btn-secondary" style="font-size: 13px; padding: 8px 20px; background: rgba(99, 102, 241, 0.2); border: 1px solid rgba(99, 102, 241, 0.4); color: #e0e7ff; border-radius: 8px; cursor: pointer; font-weight: 600;">
                    ${isKo ? "✕ 닫기" : "✕ Close"}
                </button>
            </div>
        </div>
    `;

    // Event listeners
    overviewModalEl.querySelector("#bada-overview-close-x")?.addEventListener("click", closeGlobalPresetsOverviewModal);
    overviewModalEl.querySelector("#bada-overview-close-btn")?.addEventListener("click", closeGlobalPresetsOverviewModal);
    overviewModalEl.addEventListener("click", (e) => {
        if (e.target === overviewModalEl) closeGlobalPresetsOverviewModal();
    });

    // Export handler
    overviewModalEl.querySelector("#bada-overview-export-btn")?.addEventListener("click", () => {
        const store = getGlobalPresetsStore();
        const jsonStr = JSON.stringify(store, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `comfyui_global_presets_backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(isKo ? "📤 전체 백업 파일 다운로드 완료" : "📤 Global presets backup JSON downloaded", "success");
    });

    // Import handler
    overviewModalEl.querySelector("#bada-overview-import-btn")?.addEventListener("click", () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const imported = JSON.parse(evt.target.result);
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
                        renderOverviewModal();
                        showToast(isKo ? "📥 글로벌 프리셋 불러오기 완료" : "📥 Global presets successfully imported & merged", "success");
                    }
                } catch (err) {
                    showToast((isKo ? "⚠️ JSON 파일 형식 오류: " : "⚠️ Failed to parse JSON file: ") + err.message, "warning");
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
