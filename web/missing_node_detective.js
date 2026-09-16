/**
 * ══════════════════════════════════════════════════════════════════════════════
 * ⚓ ComfyUI-Bada-Utils: Missing Node Detective (미싱 노드 탐정)
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Automatically detects uninstalled/missing nodes on the canvas (red 'X' nodes).
 * Features:
 * 1. Reveals the original un-altered Python class type ('node.type') even if renamed.
 * 2. Instant on-node detective button widget [🕵️ 미싱 노드 탐정 & 깃허브 찾기].
 * 3. Right-click context menu shortcuts (Copy real name, GitHub code search, Google search).
 * 4. High-speed lookup against ComfyUI Manager's local database cache to find the exact GitHub repo!
 * 5. One-click direct installation via Bada Terminal Hub (git clone).
 * 6. Displays original inputs, outputs, and stored parameter values for easy manual node replacement.
 */

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { BadaI18n } from "./bada_i18n.js";

// 1. Dynamic Stylesheet Injection
const link = document.createElement("link");
link.rel = "stylesheet";
link.type = "text/css";
link.href = new URL("./missing_node_detective.css", import.meta.url).href;
document.head.appendChild(link);

const SETTING_ID = "BadaUtils.MissingNodeDetective";

function isDetectiveEnabled() {
    try {
        if (app?.ui?.settings) {
            const val = app.ui.settings.getSettingValue(SETTING_ID);
            if (typeof val === "boolean") return val;
        }
    } catch (_) {}
    return true;
}

/**
 * Checks if a node on the canvas is missing/uninstalled.
 */
export function isMissingNode(node) {
    if (!node || !node.type) return false;
    // Missing in LiteGraph:
    // 1. Not in LiteGraph.registered_node_types
    // 2. Or flagged with is_missing
    if (!window.LiteGraph?.registered_node_types?.[node.type]) return true;
    if (node.is_missing) return true;
    if (node.flags && node.flags.missing) return true;
    return false;
}

/**
 * Copies text to system clipboard with visual feedback.
 */
function copyToClipboard(text, successMsg = "클립보드에 복사되었습니다!") {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showToast(`📋 ${successMsg}`);
        }).catch(() => {
            fallbackCopy(text, successMsg);
        });
    } else {
        fallbackCopy(text, successMsg);
    }
}

function fallbackCopy(text, successMsg) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand("copy");
        showToast(`📋 ${successMsg}`);
    } catch (e) {
        prompt("복사할 텍스트:", text);
    }
    document.body.removeChild(ta);
}

/**
 * Lightweight Toast Notification
 */
function showToast(msg) {
    let toast = document.getElementById("bada-detective-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "bada-detective-toast";
        toast.style.cssText = `
            position: fixed;
            top: 24px;
            left: 50%;
            transform: translateX(-50%) translateY(-10px);
            background: rgba(15, 23, 42, 0.94);
            border: 1.5px solid #00f0ff;
            color: #ffffff;
            padding: 8px 18px;
            border-radius: 9999px;
            font-size: 13.5px;
            font-weight: 600;
            z-index: 1000000;
            box-shadow: 0 10px 30px rgba(0,0,0,0.8), 0 0 15px rgba(0,240,255,0.4);
            pointer-events: none;
            opacity: 0;
            transition: all 0.22s ease-out;
            font-family: sans-serif;
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    requestAnimationFrame(() => {
        toast.style.opacity = "1";
        toast.style.transform = "translateX(-50%) translateY(0)";
    });
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(-50%) translateY(-10px)";
    }, 2400);
}

/**
 * Shows the Missing Node Detective Modal with deep inspection and lookup.
 */
export async function showMissingNodeModal(node) {
    if (!node) return;

    const isKo = (BadaI18n.lang === "ko");
    const realType = String(node.type || "Unknown").trim();
    const displayTitle = String(node.title || realType).trim();
    const nodeId = node.id != null ? String(node.id) : "?";

    // Overlay creation
    let overlay = document.querySelector(".bada-detective-overlay");
    if (overlay) overlay.remove();

    overlay = document.createElement("div");
    overlay.className = "bada-detective-overlay";

    const modal = document.createElement("div");
    modal.className = "bada-detective-modal";

    modal.innerHTML = `
        <div class="bada-detective-header">
            <div class="bada-detective-title">
                <span class="bada-detective-title-icon">🕵️</span>
                <span>${isKo ? "바다 미싱 노드 탐정 & 깃허브 해결사" : "Bada Missing Node Detective"}</span>
                <span class="bada-detective-badge">#${nodeId} MISSING</span>
            </div>
            <button class="bada-detective-close" title="Close">✕</button>
        </div>
        <div class="bada-detective-body">
            <!-- Node Identity Card -->
            <div class="bada-detective-card">
                <div class="bada-detective-field-row">
                    <span class="bada-detective-label">${isKo ? "진짜 노드 이름 (Type)" : "Real Class (Type)"}:</span>
                    <div class="bada-detective-value-box">
                        <span id="bada-det-type">${realType}</span>
                        <button class="bada-detective-copy-btn" id="bada-det-copy-type">📋 ${isKo ? "복사" : "Copy"}</button>
                    </div>
                </div>
                <div class="bada-detective-field-row">
                    <span class="bada-detective-label">${isKo ? "표시된 이름 (Title)" : "Display Title"}:</span>
                    <div class="bada-detective-value-box" style="color: #94a3b8;">
                        <span>${displayTitle}</span>
                    </div>
                </div>
            </div>

            <!-- Repository Lookup Result Section (Async Loaded) -->
            <div id="bada-det-repo-section" class="bada-detective-repo-card" style="background: #1e2230; border: 1px dashed #374158;">
                <div style="display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: #94a3b8;">
                    <span style="display: inline-block; animation: spin 1s linear infinite;">⏳</span>
                    <span>${isKo ? "ComfyUI 매니저 데이터베이스에서 저장소 조회 중..." : "Searching ComfyUI Manager database..."}</span>
                </div>
            </div>

            <!-- Node Slots & Parameters Summary (for replacing with alternatives) -->
            <div class="bada-detective-card bada-detective-slots-summary">
                <div style="font-size: 13px; font-weight: 700; color: #cbd5e1; display: flex; align-items: center; gap: 6px;">
                    <span>🔌</span>
                    <span>${isKo ? "원래 연결 슬롯 정보 (대체 노드 교체 가이드)" : "Original Sockets & Parameters Guide"}</span>
                </div>
                <div class="bada-detective-slots-grid">
                    <div class="bada-detective-slot-column">
                        <div class="bada-detective-slot-col-title">Inputs (${node.inputs?.length || 0})</div>
                        ${(node.inputs && node.inputs.length > 0) 
                            ? node.inputs.map(inp => `
                                <div class="bada-detective-slot-item">
                                    <span class="bada-slot-dot in"></span>
                                    <span>${inp.name}</span>
                                    <span style="font-size: 11px; color: #64748b;">(${inp.type})</span>
                                </div>
                            `).join("")
                            : `<div style="font-size: 12px; color: #64748b;">(No inputs)</div>`
                        }
                    </div>
                    <div class="bada-detective-slot-column">
                        <div class="bada-detective-slot-col-title">Outputs (${node.outputs?.length || 0})</div>
                        ${(node.outputs && node.outputs.length > 0)
                            ? node.outputs.map(out => `
                                <div class="bada-detective-slot-item">
                                    <span class="bada-slot-dot out"></span>
                                    <span>${out.name}</span>
                                    <span style="font-size: 11px; color: #64748b;">(${out.type})</span>
                                </div>
                            `).join("")
                            : `<div style="font-size: 12px; color: #64748b;">(No outputs)</div>`
                        }
                    </div>
                </div>
            </div>
        </div>
        <div class="bada-detective-footer">
            <button class="bada-btn-secondary" id="bada-det-close-btn">${isKo ? "닫기" : "Close"}</button>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Fade-in
    requestAnimationFrame(() => overlay.classList.add("visible"));

    // Event Listeners for close
    const closeModal = () => {
        overlay.classList.remove("visible");
        setTimeout(() => overlay.remove(), 220);
    };

    modal.querySelector(".bada-detective-close").addEventListener("click", closeModal);
    modal.querySelector("#bada-det-close-btn").addEventListener("click", closeModal);
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeModal();
    });

    const escListener = (e) => {
        if (e.key === "Escape") {
            closeModal();
            window.removeEventListener("keydown", escListener);
        }
    };
    window.addEventListener("keydown", escListener);

    // Copy Type Button
    modal.querySelector("#bada-det-copy-type").addEventListener("click", () => {
        copyToClipboard(realType, isKo ? "진짜 노드 이름(Type)이 복사되었습니다!" : "Real node class type copied!");
    });

    // 2. Perform Backend Lookup
    try {
        const queryUrl = `/api/bada/missing-node/lookup?type=${encodeURIComponent(realType)}&title=${encodeURIComponent(displayTitle)}`;
        const resp = await api.fetchApi(queryUrl);
        const repoSection = modal.querySelector("#bada-det-repo-section");

        if (resp.ok) {
            const data = await resp.json();
            if (data.found && data.repo) {
                // FOUND IN MANAGER DATABASE
                const repoUrl = data.repo;
                const packTitle = data.title || "Custom Node";
                repoSection.className = "bada-detective-repo-card found";
                repoSection.innerHTML = `
                    <div class="bada-detective-repo-header found">
                        <span>🟢</span>
                        <span>${isKo ? "알려진 커스텀 노드 저장소 발견!" : "Known Custom Node Repository Found!"}</span>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <div class="bada-detective-repo-title">📦 ${packTitle}</div>
                        <a href="${repoUrl}" target="_blank" rel="noopener noreferrer" class="bada-detective-repo-url">${repoUrl}</a>
                    </div>
                    <div class="bada-detective-actions">
                        <a href="${repoUrl}" target="_blank" rel="noopener noreferrer" class="bada-btn-primary">
                            <span>🐙</span>
                            <span>${isKo ? "GitHub 저장소 열기" : "Open GitHub Repo"}</span>
                        </a>
                        <button class="bada-btn-secondary" id="bada-det-copy-clone">
                            <span>📋</span>
                            <span>${isKo ? "Git Clone 명령어 복사" : "Copy Git Clone Command"}</span>
                        </button>
                        <button class="bada-btn-success" id="bada-det-install-btn">
                            <span>⚡</span>
                            <span>${isKo ? "바다 터미널로 바로 설치" : "Install via Bada Terminal"}</span>
                        </button>
                    </div>
                `;

                // Clone command copy
                repoSection.querySelector("#bada-det-copy-clone").addEventListener("click", () => {
                    const cmd = `git clone ${repoUrl}`;
                    copyToClipboard(cmd, isKo ? "git clone 명령어가 복사되었습니다!" : "git clone command copied!");
                });

                // Direct Install via Bada Terminal Hub
                repoSection.querySelector("#bada-det-install-btn").addEventListener("click", async () => {
                    if (confirm(isKo ? `⚡ 이 커스텀 노드를 ComfyUI custom_nodes에 바로 클론/설치하시겠습니까?\n\n저장소: ${repoUrl}` : `Install this node into custom_nodes via Bada Terminal Hub?\n\nRepo: ${repoUrl}`)) {
                        try {
                            const execResp = await api.fetchApi("/api/bada/terminal/exec", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    command: `git clone ${repoUrl}`,
                                    cwd: "custom_nodes"
                                })
                            });
                            if (execResp.ok) {
                                showToast(isKo ? "🚀 설치가 시작되었습니다! 완료 후 ComfyUI를 재시작해 주세요." : "Installation started! Restart ComfyUI when done.");
                            } else {
                                window.open(repoUrl, "_blank");
                            }
                        } catch (e) {
                            window.open(repoUrl, "_blank");
                        }
                    }
                });

                return;
            }
        }

        // NOT FOUND IN MANAGER DATABASE (NEW OR UNINDEXED)
        const ghCodeSearchUrl = `https://github.com/search?q=${encodeURIComponent(realType)}+language:Python&type=code`;
        const ghRepoSearchUrl = `https://github.com/search?q=${encodeURIComponent(realType)}&type=repositories`;
        const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(`"${realType}" ComfyUI`)}`;
        const registrySearchUrl = `https://registry.comfy.org/search?q=${encodeURIComponent(realType)}`;

        repoSection.className = "bada-detective-repo-card not-found";
        repoSection.innerHTML = `
            <div class="bada-detective-repo-header not-found">
                <span>🟡</span>
                <span>${isKo ? "ComfyUI 매니저 공식 DB 미등록 노드 (신규/개인 노드)" : "Unindexed / New Custom Node"}</span>
            </div>
            <div style="font-size: 13px; color: #cbd5e1; line-height: 1.5;">
                ${isKo 
                    ? "매니저 공식 목록에 아직 등록되지 않은 노드입니다. 아래 원클릭 검색 버튼을 누르면 원작자의 깃허브 저장소와 파이썬 소스 코드를 바로 찾으실 수 있습니다." 
                    : "This node is not yet indexed in ComfyUI Manager DB. Use the one-click search buttons below to find the author's repo and Python code directly:"}
            </div>
            <div class="bada-detective-actions">
                <a href="${ghCodeSearchUrl}" target="_blank" rel="noopener noreferrer" class="bada-btn-primary">
                    <span>🐙</span>
                    <span>${isKo ? "GitHub 코드 검색 (가장 정확 ⭐)" : "GitHub Code Search"}</span>
                </a>
                <a href="${googleSearchUrl}" target="_blank" rel="noopener noreferrer" class="bada-btn-secondary">
                    <span>🔍</span>
                    <span>${isKo ? "Google에서 검색" : "Search on Google"}</span>
                </a>
                <a href="${ghRepoSearchUrl}" target="_blank" rel="noopener noreferrer" class="bada-btn-secondary">
                    <span>📂</span>
                    <span>${isKo ? "GitHub 저장소 검색" : "GitHub Repos"}</span>
                </a>
                <a href="${registrySearchUrl}" target="_blank" rel="noopener noreferrer" class="bada-btn-secondary">
                    <span>📦</span>
                    <span>Comfy Registry</span>
                </a>
            </div>
        `;
    } catch (err) {
        console.warn("[Bada-Detective] Lookup request failed:", err);
    }
}

/**
 * Attaches the Detective Button Widget to a missing node on the canvas.
 */
export function attachDetectiveWidget(node) {
    if (!isDetectiveEnabled()) return;
    if (!isMissingNode(node)) return;
    if (node._badaDetectiveWidgetAdded) return;
    node._badaDetectiveWidgetAdded = true;

    // Add clean button widget to the missing node
    const btnLabel = BadaI18n.lang === "ko" ? "🕵️ [바다] 노드 정보 & 깃허브 찾기" : "🕵️ [Bada] Find Real Node & GitHub";
    const w = node.addWidget("button", btnLabel, null, () => {
        showMissingNodeModal(node);
    });

    if (w) {
        w.serialize = false; // Never serialize to workflow JSON
    }

    if (node.setDirtyCanvas) {
        node.setDirtyCanvas(true, true);
    }
}

/**
 * Scans all nodes on the graph and attaches detective widget to any missing node.
 */
export function scanAndHealMissingNodes() {
    if (!isDetectiveEnabled()) return;
    if (!app.graph || !app.graph._nodes) return;
    for (const node of app.graph._nodes) {
        if (isMissingNode(node)) {
            attachDetectiveWidget(node);
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  Extension Registration
// ══════════════════════════════════════════════════════════════════════════════

app.registerExtension({
    name: "BadaUtils.MissingNodeDetective",

    async setup() {
        console.log("[ComfyUI-Bada-Utils] 🕵️ Missing Node Detective (미싱 노드 탐정) Initialized!");

        // Auto-scan whenever graph configuration completes
        const origConfigure = app.graph.configure;
        if (origConfigure) {
            app.graph.configure = function () {
                const res = origConfigure.apply(this, arguments);
                setTimeout(() => scanAndHealMissingNodes(), 150);
                return res;
            };
        }

        // Periodic check to catch any dynamically pasted / dropped nodes
        setInterval(() => {
            if (isDetectiveEnabled()) {
                scanAndHealMissingNodes();
            }
        }, 2000);
    },

    async nodeCreated(node) {
        if (isMissingNode(node)) {
            attachDetectiveWidget(node);
        }
    },

    async loadedGraphNode(node) {
        if (isMissingNode(node)) {
            attachDetectiveWidget(node);
        }
    },

    /**
     * Context Menu Injection for Missing Nodes
     */
    async getNodeMenuOptions(node, options) {
        if (!isDetectiveEnabled()) return;
        if (!isMissingNode(node)) return;

        const isKo = (BadaI18n.lang === "ko");
        const realType = String(node.type || "Unknown").trim();

        const detectiveItems = [
            null, // Separator
            {
                content: isKo ? "🕵️ [바다 탐정] 미싱 노드 분석 & 깃허브 찾기..." : "🕵️ [Bada] Inspect & Find GitHub Repo...",
                callback: () => showMissingNodeModal(node)
            },
            {
                content: isKo ? `📋 [바다] 진짜 노드 이름 복사: ${realType}` : `📋 [Bada] Copy Real Type: ${realType}`,
                callback: () => copyToClipboard(realType, isKo ? "진짜 노드 이름이 복사되었습니다!" : "Real node class type copied!")
            },
            {
                content: isKo ? "🐙 [바다] GitHub에서 이 노드 코드 검색" : "🐙 [Bada] Search Node on GitHub",
                callback: () => {
                    const ghUrl = `https://github.com/search?q=${encodeURIComponent(realType)}+language:Python&type=code`;
                    window.open(ghUrl, "_blank");
                }
            },
            {
                content: isKo ? "🔍 [바다] Google에서 설치법 검색" : "🔍 [Bada] Search on Google",
                callback: () => {
                    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(`"${realType}" ComfyUI`)}`;
                    window.open(googleUrl, "_blank");
                }
            },
            null // Separator
        ];

        // Prepend to top of context menu
        options.unshift(...detectiveItems);
    }
});
