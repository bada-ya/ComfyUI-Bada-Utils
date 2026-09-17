/**
 * ══════════════════════════════════════════════════════════════════════════════
 * ⚓ ComfyUI-Bada-Utils: Missing Node Detective (미싱 노드 탐정)
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Automatically detects uninstalled/missing nodes on the canvas (red 'X' nodes).
 * Features:
 * 1. Reveals the original un-altered Python class type ('node.type') even if renamed.
 * 2. High-visibility floating neon badge at the bottom-right of the missing node.
 * 3. Right-click context menu shortcuts (Copy real name, Exact GitHub code search, Google search).
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

export function isDetectiveEnabled() {
    try {
        if (app?.ui?.settings) {
            const val = app.ui.settings.getSettingValue(SETTING_ID);
            if (typeof val === "boolean") return val;
        }
    } catch (_) {}
    try {
        const local = localStorage.getItem("Comfy.Settings.BadaUtils.MissingNodeDetective");
        if (local !== null) {
            const parsed = JSON.parse(local);
            if (typeof parsed === "boolean") return parsed;
        }
    } catch (_) {}
    return true;
}

/**
 * Checks if a node on the canvas is missing/uninstalled.
 */
export function isMissingNode(node) {
    if (!node) return false;
    if (node.is_missing || (node.flags && node.flags.missing)) return true;

    const reg = window.LiteGraph?.registered_node_types
        || window.LGraphCanvas?.registered_node_types
        || (typeof LiteGraph !== "undefined" ? LiteGraph.registered_node_types : null);

    const type = node.type || node.last_serialization?.type;

    if (type && reg) {
        if (!reg[type]) return true;
    }

    if (node.has_errors) {
        if (!type || !reg || !reg[type] || node.last_serialization) return true;
    }

    if (type === "MissingNode" || node.constructor?.name === "MissingNode") return true;

    return false;
}

/**
 * Resolves a missing node's exact GitHub repo and package metadata
 * using Bada's 6-Tier lookup backend + client-side ComfyUI Manager mappings fallback.
 */
export async function lookupMissingNodeInfo(realType, displayTitle = "") {
    let data = null;

    // Step 1: Query Bada Backend 6-Tier Lookup Engine
    try {
        const queryUrl = `/api/bada/missing-node/lookup?type=${encodeURIComponent(realType)}&title=${encodeURIComponent(displayTitle)}`;
        const resp = await api.fetchApi(queryUrl);
        if (resp.ok) {
            const resJson = await resp.json();
            if (resJson.found && resJson.repo) {
                data = resJson;
            }
        }
    } catch (e) {
        console.debug("[Bada-Detective] Backend lookup exception:", e);
    }

    // Step 2: Client-Side Dual-Layer Fallback (Direct ComfyUI Manager Mappings)
    if (!data) {
        try {
            if (!window._badaManagerMappingsPromise) {
                window._badaManagerMappingsPromise = api.fetchApi("/v2/customnode/getmappings?mode=local")
                    .then(r => r.ok ? r.json() : null)
                    .catch(() => null);
            }
            const mappings = await window._badaManagerMappingsPromise;
            if (mappings) {
                const clean = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
                const targetClean = clean(realType);
                const targetCleanTitle = clean(displayTitle);

                for (const repoKey in mappings) {
                    const packInfo = mappings[repoKey];
                    const nodeList = packInfo[0] || [];
                    const meta = packInfo[1] || {};

                    const isHit = nodeList.some(n => {
                        const c = clean(n);
                        return c === targetClean || (targetCleanTitle && c === targetCleanTitle);
                    });

                    if (isHit) {
                        let finalRepo = repoKey;
                        if (!finalRepo.startsWith("http")) {
                            const cn = window.CustomNodesManager?.instance?.custom_nodes;
                            if (cn) {
                                for (const k in cn) {
                                    if (cn[k].title === meta.title_aux || k === repoKey || cn[k].reference === repoKey) {
                                        finalRepo = cn[k].files?.[0] || cn[k].repository || finalRepo;
                                        break;
                                    }
                                }
                            }
                        }
                        if (!finalRepo.startsWith("http")) {
                            finalRepo = `https://github.com/${repoKey}`;
                        }

                        data = {
                            found: true,
                            repo: finalRepo,
                            title: meta.title_aux || repoKey.split("/").pop(),
                            author: meta.author || "",
                            description: meta.description || "",
                            search_term: meta.title_aux || repoKey.split("/").pop()
                        };
                        break;
                    }
                }
            }
        } catch (err) {
            console.debug("[Bada-Detective] Client manager mapping fallback exception:", err);
        }
    }

    return data;
}

/**
 * Installs a custom node via Bada Terminal Hub / ComfyUI Manager backend.
 */
export async function installCustomNode(repoUrl, packTitle) {
    try {
        const resp = await api.fetchApi("/api/bada/customnode/install", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ repo: repoUrl, title: packTitle })
        });
        return await resp.json();
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * Copies text to system clipboard with visual feedback.
 */
export function copyToClipboard(text, successMsg = "클립보드에 복사되었습니다!") {
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
 * Opens ComfyUI Manager Window (supporting both Modern v4 New Manager and Legacy UI)
 * and automatically sets the search keyword.
 */
export function openComfyUiManager(searchTerm = "") {
    let opened = false;

    // 0. Direct dialog instances (if available)
    try {
        if (window.manager_instance?.show) {
            window.manager_instance.show();
            opened = true;
        } else if (window.CustomNodesManager?.instance?.show) {
            const mode = window.CustomNodesManager.ShowMode?.NORMAL ?? 0;
            window.CustomNodesManager.instance.show(mode);
            opened = true;
        }
    } catch (_) {}

    // 1. Modern ComfyUI: Pinia Command Store execution
    try {
        const pinia = window.__PINIA__ 
            || document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$pinia;
        const cmdStore = pinia?._s?.get?.("command");
        if (cmdStore?.execute) {
            cmdStore.execute("Comfy.OpenManagerDialog");
            opened = true;
        }
    } catch (e) {
        console.debug("[Bada-Detective] Pinia command open failed:", e);
    }

    // 2. Modern ComfyUI: Click sidebar / menu Manager / Manage Extensions button
    if (!opened) {
        const modernSelectors = [
            'button:has(i[class*="extensions-blocks"])',
            'button:has(i[class*="puzzle"])',
            'button[aria-label*="manageExtensions" i]',
            'button[aria-label*="Extensions" i]',
            'button[aria-label*="Manager" i]',
            'button[aria-label*="매니저"]',
            'button[aria-label*="확장"]',
            '.comfyui-manager-button',
            '#comfyui-manager-button'
        ];

        for (const sel of modernSelectors) {
            try {
                const el = document.querySelector(sel);
                if (el) {
                    el.click();
                    opened = true;
                    break;
                }
            } catch (_) {}
        }
    }

    // 3. Fallback: Search all DOM buttons for manager keywords
    if (!opened) {
        const allBtns = Array.from(document.querySelectorAll("button, div.comfyui-button"));
        const targetBtn = allBtns.find(b => {
            const txt = (b.textContent || "").trim();
            const aria = (b.getAttribute("aria-label") || "").toLowerCase();
            const title = (b.getAttribute("title") || "").toLowerCase();
            return (
                aria.includes("extension") || aria.includes("manager") || aria.includes("매니저") ||
                title.includes("extension") || title.includes("manager") || title.includes("매니저") ||
                txt === "Manager" || txt === "매니저" || txt === "Manage Extensions" || txt === "확장 기능 관리"
            );
        });
        if (targetBtn) {
            targetBtn.click();
            opened = true;
        }
    }

    // 4. Fallback: Legacy ManagerMenu extension commands
    if (!opened && window.app?.extensions) {
        const mgrExt = window.app.extensions.find(e => 
            e.name === "Comfy.Legacy.ManagerMenu" || 
            e.name?.toLowerCase().includes("managermenu") ||
            e.name?.toLowerCase().includes("customnodesmanager")
        );
        const cmd = mgrExt?.commands?.find(c => 
            c.id === "Comfy.Manager.CustomNodesManager.ToggleVisibility" || 
            c.id === "Comfy.Manager.Menu.ToggleVisibility"
        );
        if (cmd?.function) {
            try {
                cmd.function();
                opened = true;
            } catch (e) {
                console.warn("[Bada-Detective] Manager command trigger failed:", e);
            }
        }
    }

    // 5. Search query auto-copy and input focus
    if (searchTerm) {
        copyToClipboard(searchTerm, BadaI18n.lang === "ko" 
            ? `📋 신형 매니저 검색을 위해 노드 이름 '${searchTerm}'이(가) 복사되었습니다!` 
            : `'${searchTerm}' copied for Manager search!`);
        
        setTimeout(() => {
            const inputs = document.querySelectorAll(".cn-manager-filter-input, input[placeholder*='Search' i], input[placeholder*='검색'], input[type='search']");
            for (const input of inputs) {
                if (input && input.offsetParent !== null) {
                    input.value = searchTerm;
                    input.dispatchEvent(new Event("input", { bubbles: true }));
                    input.focus();
                    break;
                }
            }
        }, 400);
    }

    return opened;
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

    // 2. Perform Deep Lookup (1. Bada Multi-Tier Engine -> 2. Client-side Manager Mapping Fallback)
    try {
        const repoSection = modal.querySelector("#bada-det-repo-section");
        const data = await lookupMissingNodeInfo(realType, displayTitle);

        // ══════════════════════════════════════════════════════════════
        //  1순위: ComfyUI 매니저 공식 등록 노드 발견!
        // ══════════════════════════════════════════════════════════════
        if (data && data.found && data.repo) {
            const repoUrl = data.repo;
            const packTitle = data.title || "Custom Node";
            const authorStr = data.author ? `<span style="font-size: 12px; color: #34d399; font-weight: normal; margin-left: 6px;">by ${data.author}</span>` : "";
            const descStr = data.description ? `<div style="font-size: 12px; color: #94a3b8; line-height: 1.4; margin-top: 4px; max-height: 60px; overflow-y: auto;">${data.description}</div>` : "";

            repoSection.className = "bada-detective-repo-card found";
            repoSection.innerHTML = `
                <div class="bada-detective-repo-header found" style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span>🟢</span>
                        <span>${isKo ? "ComfyUI 매니저 공식 등록 노드 확인!" : "ComfyUI Manager Registered Node!"}</span>
                    </div>
                    <span class="bada-priority-badge p1">${isKo ? "1순위: 매니저 설치 권장" : "Priority 1: Manager"}</span>
                </div>

                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <div class="bada-detective-repo-title">📦 ${packTitle} ${authorStr}</div>
                    <a href="${repoUrl}" target="_blank" rel="noopener noreferrer" class="bada-detective-repo-url">${repoUrl}</a>
                    ${descStr}
                </div>

                <!-- 1순위: 매니저 설치 및 매니저 창 열기 메인 액션 영역 -->
                <div style="margin-top: 4px; display: flex; flex-direction: column; gap: 6px;">
                    <div style="font-size: 12px; font-weight: 700; color: #34d399; display: flex; align-items: center; gap: 5px;">
                        <span>⚡</span>
                        <span>${isKo ? "1순위 추천: ComfyUI 매니저로 설치" : "Priority 1: Install via ComfyUI Manager"}</span>
                    </div>
                    <div class="bada-detective-actions">
                        <button class="bada-btn-manager" id="bada-det-install-btn">
                            <span>📦</span>
                            <span>${isKo ? "ComfyUI 매니저로 설치 (원클릭)" : "Install via Manager (One-Click)"}</span>
                        </button>
                        <button class="bada-btn-manager-open" id="bada-det-open-mgr">
                            <span>🔍</span>
                            <span>${isKo ? "매니저 창에서 보기" : "Open in Manager"}</span>
                        </button>
                    </div>
                </div>

                <!-- 2순위 & 3순위: 깃허브 및 구글 검색 보조 액션 영역 -->
                <div style="margin-top: 6px; padding-top: 10px; border-top: 1px dashed rgba(255,255,255,0.1); display: flex; flex-direction: column; gap: 6px;">
                    <div style="font-size: 11.5px; color: #94a3b8; font-weight: 600;">
                        ${isKo ? "보조 수동 옵션 (2순위 깃허브 / 3순위 구글)" : "Alternative Options (GitHub / Google)"}
                    </div>
                    <div class="bada-detective-actions">
                        <a href="${repoUrl}" target="_blank" rel="noopener noreferrer" class="bada-btn-primary">
                            <span>🐙</span>
                            <span>${isKo ? "GitHub 저장소 열기 (2순위)" : "Open GitHub Repo"}</span>
                        </a>
                        <a href="https://www.google.com/search?q=${encodeURIComponent('"' + packTitle + '" ComfyUI')}" target="_blank" rel="noopener noreferrer" class="bada-btn-secondary">
                            <span>🔍</span>
                            <span>${isKo ? "Google 검색 (3순위)" : "Google Search"}</span>
                        </a>
                        <button class="bada-btn-secondary" id="bada-det-copy-clone">
                            <span>📋</span>
                            <span>${isKo ? "Git Clone 복사" : "Copy Clone Cmd"}</span>
                        </button>
                    </div>
                </div>

                <!-- 설치 진행 상태 및 재시작 안내 영역 -->
                <div id="bada-det-install-status-box" style="display: none;"></div>
            `;

            // Clone command copy
            repoSection.querySelector("#bada-det-copy-clone")?.addEventListener("click", () => {
                const cmd = `git clone ${repoUrl}`;
                copyToClipboard(cmd, isKo ? "git clone 명령어가 복사되었습니다!" : "git clone command copied!");
            });

            // Manager GUI Open button
            repoSection.querySelector("#bada-det-open-mgr")?.addEventListener("click", () => {
                closeModal();
                const mgrSearchTerm = data.search_term || packTitle;
                openComfyUiManager(mgrSearchTerm);
            });

            // 1순위: ComfyUI 매니저 연동 설치
            const installBtn = repoSection.querySelector("#bada-det-install-btn");
            const statusBox = repoSection.querySelector("#bada-det-install-status-box");

            installBtn?.addEventListener("click", async () => {
                if (!confirm(isKo 
                    ? `📦 [ComfyUI 매니저 연동 설치]\n\n'${packTitle}' 커스텀 노드를 ComfyUI에 설치하시겠습니까?\n\n저장소: ${repoUrl}` 
                    : `Install '${packTitle}' into ComfyUI custom_nodes?\n\nRepo: ${repoUrl}`)) {
                    return;
                }

                installBtn.disabled = true;
                installBtn.innerHTML = `<span>⏳</span><span>${isKo ? "설치 진행 중... (Git clone & pip 패키지)" : "Installing..."}</span>`;

                statusBox.style.display = "block";
                statusBox.className = "bada-install-card";
                statusBox.innerHTML = `
                    <div style="color: #38bdf8; display: flex; align-items: center; gap: 8px;">
                        <span style="display: inline-block; animation: spin 1s linear infinite;">⏳</span>
                        <span>${isKo ? "저장소를 다운로드하고 필요한 파이썬 패키지(requirements.txt)를 설치하고 있습니다..." : "Cloning repository and installing dependencies..."}</span>
                    </div>
                `;

                try {
                    const result = await installCustomNode(repoUrl, packTitle);

                    if (result.success) {
                        installBtn.style.display = "none";
                        statusBox.innerHTML = `
                            <div style="color: #34d399; font-weight: 700; font-size: 13.5px; display: flex; align-items: center; gap: 6px;">
                                <span>✅</span>
                                <span>${isKo ? `'${packTitle}' 설치가 완료되었습니다!` : `'${packTitle}' installed successfully!`}</span>
                            </div>
                            <div style="color: #cbd5e1; font-size: 12px; line-height: 1.4;">
                                ${isKo ? "ComfyUI 서버를 재시작하시면 워크플로우에서 이 노드를 즉시 사용하실 수 있습니다." : "Restart ComfyUI server to load and use the newly installed nodes."}
                            </div>
                            <div style="margin-top: 4px;">
                                <button class="bada-btn-restart" id="bada-det-restart-btn">
                                    <span>🔄</span>
                                    <span>${isKo ? "ComfyUI 지금 재시작" : "Restart ComfyUI Now"}</span>
                                </button>
                            </div>
                        `;

                        statusBox.querySelector("#bada-det-restart-btn")?.addEventListener("click", async () => {
                            showToast(isKo ? "🔄 ComfyUI 서버 재시작 중... 잠시 후 새로고침 됩니다." : "Restarting ComfyUI...");
                            try {
                                await api.fetchApi("/api/bada/terminal/restart", { method: "POST" });
                            } catch (e) {}
                            setTimeout(() => window.location.reload(), 3500);
                        });
                    } else {
                        installBtn.disabled = false;
                        installBtn.innerHTML = `<span>📦</span><span>${isKo ? "ComfyUI 매니저로 다시 설치" : "Retry Install via Manager"}</span>`;
                        statusBox.innerHTML = `
                            <div style="color: #f87171; font-weight: 700;">❌ ${isKo ? "설치 실패" : "Installation Failed"}</div>
                            <div style="color: #94a3b8; font-size: 11.5px; word-break: break-all;">${result.error || "Unknown error"}</div>
                        `;
                    }
                } catch (err) {
                    installBtn.disabled = false;
                    installBtn.innerHTML = `<span>📦</span><span>${isKo ? "ComfyUI 매니저로 다시 설치" : "Retry Install via Manager"}</span>`;
                    statusBox.innerHTML = `<div style="color: #f87171;">❌ ${err.message}</div>`;
                }
            });

            return;
        }

        // ══════════════════════════════════════════════════════════════
        //  2순위 & 3순위: ComfyUI 매니저 미등록 노드 (독립 커스텀 노드)
        // ══════════════════════════════════════════════════════════════
        const exactPhrase = `"${realType.replace(/"/g, '')}"`;
        const ghCodeSearchUrl = `https://github.com/search?q=${encodeURIComponent(exactPhrase)}+language:Python&type=code`;
        const cleanWords = realType.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[^a-zA-Z0-9]/g, ' ').trim();
        const ghRepoSearchUrl = `https://github.com/search?q=${encodeURIComponent(cleanWords + ' ComfyUI')}&type=repositories`;
        const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(exactPhrase + ' ComfyUI')}`;
        const registrySearchUrl = `https://registry.comfy.org/search?q=${encodeURIComponent(realType.trim())}`;

        repoSection.className = "bada-detective-repo-card not-found";
        repoSection.innerHTML = `
            <div class="bada-detective-repo-header not-found" style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span>🟡</span>
                    <span>${isKo ? "ComfyUI 매니저 미등록 노드 (독립 커스텀 노드)" : "Unindexed / Independent Node"}</span>
                </div>
                <span class="bada-priority-badge p2">${isKo ? "1순위: Google & GitHub 검색" : "Priority 1: Google & GitHub"}</span>
            </div>

            <div style="font-size: 13px; color: #cbd5e1; line-height: 1.5;">
                ${isKo 
                    ? `이 노드는 ComfyUI 매니저 공식 DB에 등록되어 있지 않은 개인/독립 노드입니다.<br>아래 <b>1순위 Google 검색</b> 및 <b>2순위 GitHub 코드 검색</b>을 누르면 원작자 저장소를 즉시 찾으실 수 있습니다.` 
                    : `This node is not indexed in ComfyUI Manager DB. Use Google Search (Priority 1) or GitHub Code Search to find the author's repo:`}
            </div>

            <!-- 1순위: Google 검색 (가장 정확한 저장소 발굴) -->
            <div style="margin-top: 4px; display: flex; flex-direction: column; gap: 6px;">
                <div style="font-size: 12px; font-weight: 700; color: #38bdf8; display: flex; align-items: center; gap: 5px;">
                    <span>🔍</span>
                    <span>${isKo ? "1순위 추천: Google에서 저장소 찾기 ⭐" : "Priority 1: Google Search"}</span>
                </div>
                <div class="bada-detective-actions">
                    <a href="${googleSearchUrl}" target="_blank" rel="noopener noreferrer" class="bada-btn-primary">
                        <span>🔍</span>
                        <span>${isKo ? "Google에서 저장소 검색 (1순위 추천)" : "Google Search (Best Match)"}</span>
                    </a>
                </div>
            </div>

            <!-- 2순위: GitHub 코드 & 저장소 검색 -->
            <div style="margin-top: 6px; padding-top: 10px; border-top: 1px dashed rgba(255,255,255,0.1); display: flex; flex-direction: column; gap: 6px;">
                <div style="font-size: 11.5px; color: #94a3b8; font-weight: 600;">
                    ${isKo ? "2순위: GitHub 직접 검색" : "Priority 2: GitHub Search"}
                </div>
                <div class="bada-detective-actions">
                    <a href="${ghCodeSearchUrl}" target="_blank" rel="noopener noreferrer" class="bada-btn-secondary">
                        <span>🐙</span>
                        <span>${isKo ? "GitHub 코드 정확 일치 검색" : "GitHub Code Search"}</span>
                    </a>
                    <a href="${ghRepoSearchUrl}" target="_blank" rel="noopener noreferrer" class="bada-btn-secondary">
                        <span>📂</span>
                        <span>${isKo ? "GitHub 저장소 검색" : "GitHub Repos"}</span>
                    </a>
                    <a href="${registrySearchUrl}" target="_blank" rel="noopener noreferrer" class="bada-btn-secondary">
                        <span>📦</span>
                        <span>Comfy Registry</span>
                    </a>
                    <button class="bada-btn-secondary" id="bada-det-copy-type-sub">
                        <span>📋</span>
                        <span>${isKo ? "노드 이름 복사" : "Copy Node Name"}</span>
                    </button>
                </div>
                <div style="font-size: 11px; color: #38bdf8; background: rgba(56, 189, 248, 0.08); padding: 6px 10px; border-radius: 6px; border-left: 3px solid #38bdf8; margin-top: 4px; line-height: 1.4;">
                    ${isKo 
                        ? "💡 <b>GitHub 코드 검색 팁</b>: 검색 결과 창에서 각 소스 파일 상단에 파란색으로 표시되는 <b>'작성자/저장소명'</b>(예: AlnVFX/ComfyUI-SeedVR2_VideoUpscaler)을 클릭하시면 해당 노드의 원작자 메인 저장소로 바로 이동합니다."
                        : "💡 <b>Tip</b>: On GitHub Code Search, click the repository name (e.g. author/repo) at the top of the file snippet to visit the main repo."}
                </div>
            </div>
        `;

        repoSection.querySelector("#bada-det-copy-type-sub")?.addEventListener("click", () => {
            copyToClipboard(realType, isKo ? "진짜 노드 이름(Type)이 복사되었습니다!" : "Real node class type copied!");
        });
    } catch (err) {
        console.warn("[Bada-Detective] Lookup request failed:", err);
    }
}

/**
 * Resolves whether the mouse / pointer is directly over the detective badge of a missing node.
 * Uses LiteGraph's native coordinate system for 100% zoom/pan accuracy, and verifies
 * that no modal, dialog, or UI panel is covering the canvas at this screen coordinate.
 */
function findDetectiveBadgeAtPos(eOrX, maybeY) {
    if (!isDetectiveEnabled()) return null;
    if (document.querySelector(".bada-detective-overlay")) return null;

    const canvas = app.canvas;
    const graph = app.graph;
    if (!canvas || !graph || !graph._nodes) return null;

    // Fast check: If no nodes in graph are missing, exit immediately (0 CPU overhead)
    const nodes = graph._nodes;
    if (!nodes || nodes.length === 0) return null;
    let hasMissing = false;
    for (let i = 0; i < nodes.length; i++) {
        if (isMissingNode(nodes[i])) {
            hasMissing = true;
            break;
        }
    }
    if (!hasMissing) return null;

    const canvasEl = canvas.canvas || document.querySelector("canvas#graph-canvas, canvas");
    if (!canvasEl) return null;

    let clientX, clientY, eventObj;
    if (typeof eOrX === "number") {
        clientX = eOrX;
        clientY = maybeY;
        eventObj = { clientX, clientY };
    } else if (eOrX && typeof eOrX === "object") {
        clientX = eOrX.clientX;
        clientY = eOrX.clientY;
        eventObj = eOrX;
    } else {
        return null;
    }

    if (clientX == null || clientY == null) return null;

    // 1. Boundary check on canvas element bounding client rect
    const rect = canvasEl.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
        return null;
    }

    // 2. Crucial check: Is the canvas element ACTUALLY the topmost element under the cursor?
    // If ANY modal (Manager, Settings, etc.), menu, dialog, or backdrop covers this point,
    // document.elementFromPoint will return that element, NOT canvasEl.
    try {
        const topEl = document.elementFromPoint(clientX, clientY);
        if (topEl && topEl !== canvasEl && !canvasEl.contains(topEl)) {
            return null; // A modal, dialog, button, or menu is on top!
        }
    } catch (_) {}

    // 3. Convert screen coordinates to Graph coordinates (Graph Space)
    let gx, gy;
    try {
        if (typeof canvas.convertEventToCanvasOffset === "function") {
            const pt = canvas.convertEventToCanvasOffset(eventObj);
            gx = pt[0];
            gy = pt[1];
        } else {
            const scale = Number(canvas.ds?.scale || 1);
            const offset = canvas.ds?.offset || [0, 0];
            gx = (clientX - rect.left) / scale - offset[0];
            gy = (clientY - rect.top) / scale - offset[1];
        }
    } catch (_) {
        const scale = Number(canvas.ds?.scale || 1);
        const offset = canvas.ds?.offset || [0, 0];
        gx = (clientX - rect.left) / scale - offset[0];
        gy = (clientY - rect.top) / scale - offset[1];
    }

    if (!Number.isFinite(gx) || !Number.isFinite(gy)) return null;

    // 4. Hit-test missing node badges in reverse order (top-most rendered node first)
    for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (!isMissingNode(n)) continue;
        const b = getDetectiveBadgeRect(n);
        if (!b) continue;

        const bx1 = n.pos[0] + b.x;
        const bx2 = bx1 + b.w;
        const by1 = n.pos[1] + b.y;
        const by2 = by1 + b.h;

        // Generous hit box (+4px margin)
        if (gx >= bx1 - 4 && gx <= bx2 + 4 && gy >= by1 - 4 && gy <= by2 + 4) {
            return n;
        }
    }

    return null;
}

// Backward-compatible alias
const findDetectiveBadgeAtScreenPos = findDetectiveBadgeAtPos;

/**
 * Helper to identify transparent or zero-alpha colors.
 * Prevents ComfyUI's modern frontend color adjuster (applyColorAdjustments)
 * from stripping alpha=0 and forcing opacity=0.95 (which turns #fff0 into blinding solid white).
 */
function isTransparentColor(color) {
    if (!color || typeof color !== "string") return false;
    const c = color.trim().toLowerCase();
    if (c === "transparent") return true;
    if (c.startsWith("#")) {
        // 4-digit hex #RGBA (e.g. #fff0, #0000, #abc0)
        if (c.length === 5 && c[4] === "0") return true;
        // 8-digit hex #RRGGBBAA (e.g. #ffffff00, #00000000)
        if (c.length === 9 && c.slice(7, 9) === "00") return true;
    }
    if (c.startsWith("rgba") && /,\s*0(?:\.0+)?\s*\)/.test(c)) return true;
    if (c.startsWith("hsla") && /,\s*0(?:\.0+)?\s*\)/.test(c)) return true;
    return false;
}

// ══════════════════════════════════════════════════════════════════════════════
//  Canvas Badge & Missing Node Aesthetics (LGraphNode Prototype Hooks)
// ══════════════════════════════════════════════════════════════════════════════

export function hookLGraphNodePrototypes() {
    const NodeClass = window.LGraphNode || window.LiteGraph?.LGraphNode;
    if (!NodeClass || !NodeClass.prototype) return;

    if (!window._badaLGraphColorHooked) {
        window._badaLGraphColorHooked = true;

        // 1. Fix renderingBgColor: Prevent #fff0 and transparent colors from turning opaque white
        const origBgDesc = Object.getOwnPropertyDescriptor(NodeClass.prototype, "renderingBgColor");
        const origBgGet = origBgDesc?.get;
        Object.defineProperty(NodeClass.prototype, "renderingBgColor", {
            get() {
                if (isTransparentColor(this.bgcolor) || (isMissingNode(this) && this.type === "Label (rgthree)")) {
                    return "transparent";
                }
                if (origBgGet) {
                    return origBgGet.call(this);
                }
                return this.bgcolor || window.LiteGraph?.NODE_DEFAULT_BGCOLOR || "#353535";
            },
            configurable: true,
            enumerable: true
        });

        // 2. Fix renderingColor: Prevent #fff0 and transparent colors from turning opaque white
        const origColorDesc = Object.getOwnPropertyDescriptor(NodeClass.prototype, "renderingColor");
        const origColorGet = origColorDesc?.get;
        Object.defineProperty(NodeClass.prototype, "renderingColor", {
            get() {
                if (isTransparentColor(this.color) || (isMissingNode(this) && this.type === "Label (rgthree)")) {
                    return "transparent";
                }
                if (origColorGet) {
                    return origColorGet.call(this);
                }
                return this.color || window.LiteGraph?.NODE_DEFAULT_COLOR || "#464646";
            },
            configurable: true,
            enumerable: true
        });

        // 3. Fix title_mode: For missing Label (rgthree), prevent LiteGraph from drawing default 11px title bar
        const origTitleModeDesc = Object.getOwnPropertyDescriptor(NodeClass.prototype, "title_mode");
        const origTitleModeGet = origTitleModeDesc?.get;
        Object.defineProperty(NodeClass.prototype, "title_mode", {
            get() {
                if (this._custom_title_mode !== undefined) return this._custom_title_mode;
                if (isMissingNode(this) && this.type === "Label (rgthree)") {
                    return window.LiteGraph?.NO_TITLE ?? 1;
                }
                if (origTitleModeGet) return origTitleModeGet.call(this);
                return this.constructor?.title_mode ?? window.LiteGraph?.NORMAL_TITLE ?? 0;
            },
            set(v) {
                this._custom_title_mode = v;
            },
            configurable: true,
            enumerable: true
        });
        // 4. For missing Label (rgthree), render its label text gracefully without any badges
        const origDrawFg = NodeClass.prototype.onDrawForeground;
        NodeClass.prototype.onDrawForeground = function (ctx) {
            if (origDrawFg) origDrawFg.apply(this, arguments);
            if (isMissingNode(this) && (this.type === "Label (rgthree)" || this.last_serialization?.type === "Label (rgthree)")) {
                const fontSize = Number(this.properties?.fontSize) || 28;
                const fontFamily = this.properties?.fontFamily || "Arial";
                const fontColor = this.properties?.fontColor || "#ffffff";
                const textAlign = this.properties?.textAlign || "left";
                const angleDeg = parseInt(String(this.properties?.angle || 0)) || 0;
                const padding = Number(this.properties?.padding) || 0;

                ctx.save();
                if (angleDeg) {
                    const cx = this.size[0] / 2;
                    const cy = this.size[1] / 2;
                    ctx.translate(cx, cy);
                    ctx.rotate((angleDeg * Math.PI) / 180);
                    ctx.translate(-cx, -cy);
                }

                ctx.font = `${Math.max(fontSize, 12)}px ${fontFamily}, sans-serif`;
                ctx.fillStyle = fontColor;
                ctx.textAlign = textAlign;
                ctx.textBaseline = "top";
                ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
                ctx.shadowBlur = 4;

                let textX = padding;
                if (textAlign === "center") textX = this.size[0] / 2;
                else if (textAlign === "right") textX = this.size[0] - padding;

                const text = (this.title || "").replace(/\\n/g, "\n").replace(/\n*$/, "");
                const lines = text.split("\n");
                let currentY = padding;
                for (let i = 0; i < lines.length; i++) {
                    ctx.fillText(lines[i] || " ", textX, currentY);
                    currentY += fontSize;
                }
                ctx.restore();
            }
        };
    }
}

// Run immediately if LiteGraph is already loaded
hookLGraphNodePrototypes();

// Global export for unified badge system & modals
window.__BADA_SHOW_MISSING_MODAL__ = showMissingNodeModal;
window.__BADA_IS_MISSING_NODE__ = isMissingNode;
window.__BADA_IS_DETECTIVE_ENABLED__ = isDetectiveEnabled;

// ══════════════════════════════════════════════════════════════════════════════
//  Extension Registration
// ══════════════════════════════════════════════════════════════════════════════

app.registerExtension({
    name: "BadaUtils.Detective",

    async setup() {
        console.log("[ComfyUI-Bada-Utils] 🕵️ Missing Node Detective (미싱 노드 탐정) Active!");
        hookLGraphNodePrototypes();
        try {
            app.graph?.setDirtyCanvas?.(true, true);
        } catch (_) {}
    },

    /**
     * Context Menu Injection for Missing Nodes
     */
    async getNodeMenuOptions(node, options) {
        if (!isDetectiveEnabled()) return;
        if (!isMissingNode(node)) return;

        const isKo = (BadaI18n.lang === "ko");
        const realType = String(node.type || "Unknown").trim();
        const exactPhrase = `"${realType.replace(/"/g, '')}"`;

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
                    const ghUrl = `https://github.com/search?q=${encodeURIComponent(exactPhrase)}+language:Python&type=code`;
                    window.open(ghUrl, "_blank");
                }
            },
            {
                content: isKo ? "🔍 [바다] Google에서 설치법 검색" : "🔍 [Bada] Search on Google",
                callback: () => {
                    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(exactPhrase + ' ComfyUI')}`;
                    window.open(googleUrl, "_blank");
                }
            },
            null // Separator
        ];

        // Prepend to top of context menu
        options.unshift(...detectiveItems);
    },

    afterConfigureGraph() {
        hookLGraphNodePrototypes();
        try {
            app.graph?.setDirtyCanvas?.(true, true);
        } catch (_) {}
    }
});
