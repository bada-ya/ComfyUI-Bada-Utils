import { app } from "../../scripts/app.js";
import { BadaI18n } from "./bada_i18n.js";
import { showGlobalPresetsOverviewModal, getGlobalPresetsSummary, getGlobalPresetsStore } from "./presets_overview_modal.js";
import { showToast } from "./presets_modal.js";

/**
 * ComfyUI-Bada-Utils Core Settings Initializer
 * Settings Section is permanently unified in English (한국어) bilingual format:
 * 1. General (일반) -> 🌐 UI Language (UI 언어 설정)
 * 2. Smart Features (스마트 기능) -> 📁 Sidebar Workflow Folder Management (사이드바 워크플로우 폴더 정리 및 이동)
 * 3. Workflow & QoL (워크플로우 & 편의성) -> 🖱️ Smooth Mouse Pan & Wheel Zoom Fixer (마우스 휠 줌 & 중간 버튼 패닝 보정기)
 * 4. Global Presets (글로벌 프리셋) -> Inline Expandable Information & Management Panel
 */

const BADA_UNIFIED_SETTINGS = {
    lang: {
        id: "BadaUtils.Language",
        category: ["🌊 Bada Utils", "1. General (일반)"],
        name: "🌐 UI Language (UI 언어 설정)",
        type: "combo",
        options: [
            { value: "en", text: "English (영어)" },
            { value: "ko", text: "한국어 (Korean)" },
        ],
        defaultValue: "en"
    },
    sidebar: {
        id: "BadaUtils.SidebarOrganizer",
        category: ["🌊 Bada Utils", "2. Smart Features (스마트 기능)"],
        name: "📁 Sidebar Workflow Folder Management (사이드바 워크플로우 폴더 정리 및 이동)",
        type: "boolean",
        defaultValue: true
    },
    mouse: {
        id: "BadaUtils.MouseFix",
        category: ["🌊 Bada Utils", "3. Workflow & QoL (워크플로우 & 편의성)"],
        name: "🖱️ Smooth Mouse Pan & Wheel Zoom Fixer (마우스 휠 줌 & 중간 버튼 패닝 보정기)",
        type: "boolean",
        defaultValue: true
    }
};

// ──────────────────────────────────────────────────────
//  Escape helper
// ──────────────────────────────────────────────────────
function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ──────────────────────────────────────────────────────
//  Global Presets Expandable Panel (rendered as custom setting)
// ──────────────────────────────────────────────────────
let isPresetsExpanded = false;

function buildPresetsPanel() {
    const summary = getGlobalPresetsSummary();

    // ── Wrapper ──
    const wrapper = document.createElement("div");
    wrapper.id = "bada-presets-panel-wrapper";
    wrapper.style.cssText = `
        width: 100%;
        margin-top: 4px;
        font-family: inherit;
        box-sizing: border-box;
    `;

    // ── Toggle Header ──
    const header = document.createElement("div");
    header.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        background: rgba(99, 102, 241, 0.07);
        border: 1px solid rgba(99, 102, 241, 0.22);
        border-radius: ${isPresetsExpanded ? "10px 10px 0 0" : "10px"};
        cursor: pointer;
        user-select: none;
        transition: background 0.2s;
    `;
    header.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:16px; font-weight:700; color:#f8fafc; display:flex; align-items:center; gap:7px;">
                <span>🗂️</span>
                <span>4. Global Presets (글로벌 프리셋 등록 현황 및 관리)</span>
            </span>
            <span id="bada-presets-badge" style="
                font-size:12px; font-weight:600;
                color:#38bdf8;
                background:rgba(56,189,248,0.13);
                border:1px solid rgba(56,189,248,0.30);
                padding:2px 10px; border-radius:10px;
                min-width:30px; text-align:center;">
                ${summary.totalPresets}개
            </span>
        </div>
        <span id="bada-presets-chevron" style="font-size:13px; color:#94a3b8; font-weight:600; transition:transform 0.25s;">
            ${isPresetsExpanded ? "▲ 접기" : "▼ 펼치기"}
        </span>
    `;
    header.addEventListener("mouseenter", () => {
        header.style.background = "rgba(99, 102, 241, 0.14)";
    });
    header.addEventListener("mouseleave", () => {
        header.style.background = "rgba(99, 102, 241, 0.07)";
    });

    // ── Body ──
    const body = document.createElement("div");
    body.id = "bada-presets-body";
    body.style.cssText = `
        display: ${isPresetsExpanded ? "flex" : "none"};
        flex-direction: column;
        gap: 14px;
        padding: 16px;
        background: rgba(15, 18, 32, 0.75);
        border: 1px solid rgba(99, 102, 241, 0.22);
        border-top: none;
        border-radius: 0 0 10px 10px;
        box-shadow: 0 6px 24px rgba(0,0,0,0.25);
    `;

    // ── Body: Stats row ──
    const statsRow = document.createElement("div");
    statsRow.style.cssText = "display:flex; align-items:center; gap:20px; flex-wrap:wrap; padding-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.08);";
    statsRow.innerHTML = `
        <div style="display:flex;align-items:center;gap:7px;">
            <span style="font-size:12px;color:#94a3b8;">🎯 Total Presets (총 프리셋):</span>
            <span style="font-size:14px;font-weight:bold;color:#38bdf8;">${summary.totalPresets}</span>
        </div>
        <div style="display:flex;align-items:center;gap:7px;">
            <span style="font-size:12px;color:#94a3b8;">🧩 Node Types (노드 종류):</span>
            <span style="font-size:14px;font-weight:bold;color:#a78bfa;">${summary.nodeCount}</span>
        </div>
        <span style="font-size:11px;color:#64748b;margin-left:auto;">※ 모든 워크플로우에서 전역 공유됨</span>
    `;
    body.appendChild(statsRow);

    // ── Body: Cards ──
    const cardsArea = document.createElement("div");
    cardsArea.style.cssText = "display:flex; flex-direction:column; gap:8px; max-height:300px; overflow-y:auto; padding-right:4px;";

    if (summary.nodeSummaries.length === 0) {
        cardsArea.innerHTML = `
            <div style="text-align:center; padding:28px 16px;
                background:rgba(255,255,255,0.02);
                border:1px dashed rgba(255,255,255,0.10);
                border-radius:8px;">
                <div style="font-size:28px; margin-bottom:8px;">📭</div>
                <div style="font-size:13px; color:#94a3b8; line-height:1.6;">
                    저장된 글로벌 프리셋이 없습니다.<br>
                    <span style="color:#64748b; font-size:12px;">
                        캔버스에서 원하는 노드를 <b>우클릭</b> → <b>[현재 세팅 글로벌 프리셋으로 저장...]</b>
                    </span>
                </div>
            </div>
        `;
    } else {
        summary.nodeSummaries.forEach(node => {
            const card = document.createElement("div");
            card.style.cssText = `
                background: rgba(28, 34, 54, 0.85);
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: 8px;
                padding: 10px 12px;
                display: flex;
                flex-direction: column;
                gap: 7px;
            `;
            // Card header
            const cardHeader = document.createElement("div");
            cardHeader.style.cssText = "display:flex;align-items:center;justify-content:space-between;";
            cardHeader.innerHTML = `
                <span style="font-size:13px;font-weight:700;color:#f1f5f9;font-family:monospace;">
                    🧩 ${escapeHtml(node.nodeType)}
                </span>
                <span style="font-size:11px;font-weight:600;color:#a5b4fc;
                    background:rgba(99,102,241,0.18);
                    border:1px solid rgba(99,102,241,0.30);
                    padding:1px 8px; border-radius:8px;">
                    ${node.count}개 등록됨
                </span>
            `;
            card.appendChild(cardHeader);
            // Preset tags
            const tagsRow = document.createElement("div");
            tagsRow.style.cssText = "display:flex;flex-wrap:wrap;gap:5px;";
            node.presets.forEach(name => {
                const tag = document.createElement("span");
                tag.style.cssText = `
                    font-size:11px; color:#cbd5e1;
                    background:rgba(255,255,255,0.05);
                    border:1px solid rgba(255,255,255,0.10);
                    padding:2px 8px; border-radius:10px;
                    display:inline-flex; align-items:center; gap:4px;
                `;
                tag.innerHTML = `🏷️ ${escapeHtml(name)}`;
                tagsRow.appendChild(tag);
            });
            card.appendChild(tagsRow);
            cardsArea.appendChild(card);
        });
    }
    body.appendChild(cardsArea);

    // ── Body: Action Buttons ──
    const actionRow = document.createElement("div");
    actionRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.07);";

    const leftBtns = document.createElement("div");
    leftBtns.style.cssText = "display:flex;gap:8px;";

    const exportBtn = document.createElement("button");
    exportBtn.type = "button";
    exportBtn.style.cssText = btnStyle();
    exportBtn.innerHTML = "📤 Backup (전체 백업)";
    exportBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const store = getGlobalPresetsStore();
        const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `bada_presets_backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("📤 Backup JSON downloaded (백업 완료)", "success");
    });

    const importBtn = document.createElement("button");
    importBtn.type = "button";
    importBtn.style.cssText = btnStyle();
    importBtn.innerHTML = "📥 Import (불러오기)";
    importBtn.addEventListener("click", (e) => {
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
                        // Rebuild panel
                        const panelWrapper = document.getElementById("bada-presets-panel-wrapper");
                        if (panelWrapper) {
                            const newPanel = buildPresetsPanel();
                            panelWrapper.parentElement.replaceChild(newPanel, panelWrapper);
                        }
                        showToast("📥 Presets imported (불러오기 완료)", "success");
                    }
                } catch (err) {
                    showToast("⚠️ JSON parse error: " + err.message, "warning");
                }
            };
            reader.readAsText(file);
        };
        input.click();
    });

    leftBtns.appendChild(exportBtn);
    leftBtns.appendChild(importBtn);

    const popupBtn = document.createElement("button");
    popupBtn.type = "button";
    popupBtn.style.cssText = `
        background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
        color: #fff;
        border: 1px solid rgba(255,255,255,0.22);
        padding: 6px 14px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        box-shadow: 0 4px 12px rgba(99,102,241,0.30);
    `;
    popupBtn.innerHTML = "🌐 전용 팝업으로 크게 보기";
    popupBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showGlobalPresetsOverviewModal();
    });

    actionRow.appendChild(leftBtns);
    actionRow.appendChild(popupBtn);
    body.appendChild(actionRow);

    // ── Toggle logic ──
    header.addEventListener("click", () => {
        isPresetsExpanded = !isPresetsExpanded;
        body.style.display = isPresetsExpanded ? "flex" : "none";
        header.style.borderRadius = isPresetsExpanded ? "10px 10px 0 0" : "10px";
        const chevron = header.querySelector("#bada-presets-chevron");
        if (chevron) chevron.textContent = isPresetsExpanded ? "▲ 접기" : "▼ 펼치기";
    });

    wrapper.appendChild(header);
    wrapper.appendChild(body);
    return wrapper;
}

function btnStyle() {
    return `
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.14);
        color: #e2e8f0;
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 4px;
    `;
}

// ──────────────────────────────────────────────────────
//  Live DOM updater (bilingual label refresh only)
// ──────────────────────────────────────────────────────
function applyBilingualSettingsUI() {
    try {
        const settingsMap = app?.ui?.settings?.settings;
        if (settingsMap) {
            if (settingsMap[BADA_UNIFIED_SETTINGS.lang.id])
                settingsMap[BADA_UNIFIED_SETTINGS.lang.id].name = BADA_UNIFIED_SETTINGS.lang.name;
            if (settingsMap[BADA_UNIFIED_SETTINGS.sidebar.id])
                settingsMap[BADA_UNIFIED_SETTINGS.sidebar.id].name = BADA_UNIFIED_SETTINGS.sidebar.name;
            if (settingsMap[BADA_UNIFIED_SETTINGS.mouse.id])
                settingsMap[BADA_UNIFIED_SETTINGS.mouse.id].name = BADA_UNIFIED_SETTINGS.mouse.name;
        }
    } catch (e) {}

    // Category header text normalization
    const dialogs = document.querySelectorAll(".p-dialog, .comfy-modal, .comfy-settings-dialog, .p-dialog-content");
    dialogs.forEach(dialog => {
        const textEls = dialog.querySelectorAll("span, label, td, tr, div, p, a, h3, h4");
        textEls.forEach(el => {
            if (el.children.length === 0 && el.textContent) {
                const text = el.textContent.trim();
                if (text.includes("UI Language") || text.includes("UI 언어")) {
                    el.textContent = BADA_UNIFIED_SETTINGS.lang.name;
                } else if (text.includes("Sidebar Workflow") || text.includes("사이드바 워크플로우")) {
                    el.textContent = BADA_UNIFIED_SETTINGS.sidebar.name;
                } else if (text.includes("Smooth Mouse") || text.includes("마우스 휠 줌")) {
                    el.textContent = BADA_UNIFIED_SETTINGS.mouse.name;
                } else if (text.match(/^(?:1\.\s*)?General(?:\s*\(일반\))?$/i) || text === "일반") {
                    el.textContent = "1. General (일반)";
                } else if (text.match(/^(?:2\.\s*)?Smart Features(?:\s*\(스마트 기능\))?$/i) || text === "스마트 기능") {
                    el.textContent = "2. Smart Features (스마트 기능)";
                } else if (text.match(/^(?:3\.\s*)?Workflow & QoL(?:\s*\(워크플로우 & 편의성\))?$/i) || text === "워크플로우 & 편의성") {
                    el.textContent = "3. Workflow & QoL (워크플로우 & 편의성)";
                }
            }
        });
    });
}

// ──────────────────────────────────────────────────────
//  Extension Registration
// ──────────────────────────────────────────────────────
app.registerExtension({
    name: "BadaUtils.Core",

    async setup() {
        BadaI18n.init(app);
        const initialLang = BadaI18n.lang;

        // 1. Language toggle
        app.ui.settings.addSetting({
            id: BADA_UNIFIED_SETTINGS.lang.id,
            category: BADA_UNIFIED_SETTINGS.lang.category,
            name: BADA_UNIFIED_SETTINGS.lang.name,
            type: BADA_UNIFIED_SETTINGS.lang.type,
            options: BADA_UNIFIED_SETTINGS.lang.options,
            defaultValue: initialLang,
            onChange: (newVal) => {
                const target = (typeof newVal === "object" && newVal?.value) ? newVal.value : newVal;
                if (target === "ko" || target === "en") {
                    if (BadaI18n.lang !== target) BadaI18n.setLanguage(target, false);
                    applyBilingualSettingsUI();
                    app.graph?.setDirtyCanvas?.(true, true);
                }
            }
        });

        // 2. Sidebar toggle
        app.ui.settings.addSetting({
            id: BADA_UNIFIED_SETTINGS.sidebar.id,
            category: BADA_UNIFIED_SETTINGS.sidebar.category,
            name: BADA_UNIFIED_SETTINGS.sidebar.name,
            type: BADA_UNIFIED_SETTINGS.sidebar.type,
            defaultValue: BADA_UNIFIED_SETTINGS.sidebar.defaultValue
        });

        // 3. Mouse fix toggle
        app.ui.settings.addSetting({
            id: BADA_UNIFIED_SETTINGS.mouse.id,
            category: BADA_UNIFIED_SETTINGS.mouse.category,
            name: BADA_UNIFIED_SETTINGS.mouse.name,
            type: BADA_UNIFIED_SETTINGS.mouse.type,
            defaultValue: BADA_UNIFIED_SETTINGS.mouse.defaultValue
        });

        // 4. Global Presets Panel — registered as a custom "render" type setting
        //    ComfyUI calls `render(el, setter, getter)` and inserts el into the settings DOM.
        app.ui.settings.addSetting({
            id: "BadaUtils.GlobalPresetsPanel",
            category: ["🌊 Bada Utils", "4. Global Presets (글로벌 프리셋 등록 현황 및 관리)"],
            name: "🗂️ Global Presets Overview (글로벌 프리셋 현황 보기)",
            type: (name, setter, value) => {
                // Build the panel element and return it
                return buildPresetsPanel();
            },
            defaultValue: null
        });

        applyBilingualSettingsUI();

        // Observer: refresh bilingual labels whenever settings dialog opens
        const observer = new MutationObserver(() => {
            if (document.querySelector(".p-dialog, .comfy-modal, .comfy-settings-dialog")) {
                applyBilingualSettingsUI();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // Cleanup floating tooltips on ESC
        const cleanupStuckTooltips = () => {
            document.querySelectorAll(".p-tooltip, .comfy-tooltip").forEach(t => {
                if (t.style.display !== "none" && (!document.querySelector(".p-dialog-mask") || t.getBoundingClientRect().top <= 10)) {
                    t.remove();
                }
            });
        };
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") setTimeout(cleanupStuckTooltips, 100);
        }, true);
        setInterval(cleanupStuckTooltips, 1500);

        console.log("%c[ComfyUI-Bada-Utils]%c BADA Settings unified ✅ Global Presets Panel registered 🌊", "color: #00f0ff; font-weight: bold;", "color: inherit;");
    }
});
