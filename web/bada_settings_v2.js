// ──────────────────────────────────────────────────────────────────────────────
//  Bada Utils · Settings v2  (Phase 1 — coexistence skeleton)
// ──────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE EXISTS
//   The old "Bada Utils" settings category grafted its UI onto ComfyUI's React rows
//   (per-row custom renderers, JS label/description re-injection, `:has()` CSS hacks,
//   a MutationObserver). Every new feature risked breaking the whole dialog. v2 is the
//   clean replacement: native row types only, and no reliance on internal class names.
//
// 3-TIER CATEGORIES (2026-10-10) — READ BEFORE EDITING
//   The old rule below ("one subgroup per row") was measured against a 2-ELEMENT
//   category ([Bada Utils, RowName]). It is REFUTED for 3-element categories:
//   Crystools, VHS and KJNodes all register [Extension, Section, RowLabel] with a
//   SHARED section, and every row renders. So category[1] is the shared section
//   (7 total, user-defined 2026-10-10), category[2] is the unique row label taken
//   from the setting id. Dividers then fall ONLY between sections — drawn by ComfyUI
//   itself, nothing to hide, no observer needed for them.
//   A regression test pins the row count so drops cannot silently regress.
//
// PHASE 1 STRATEGY (strangler pattern)
//   1. The canonical `BadaUtils.*` setting IDs move to THIS module (it is authoritative).
//   2. The legacy registrations in bada_core.js are renamed to `BadaLegacy.*` and its
//      category is relabelled "Bada Utils (Legacy) / (구)", so both coexist without an
//      ID collision and the 28+ call sites that read `BadaUtils.*` keep working.
//   3. v2 registers FIRST (bada_core.js calls registerBadaV2Settings before its own
//      registrations), so the new nav entry lands ABOVE the legacy one. Measured rule:
//      the settings nav follows REGISTRATION order, not the alphabet.
//
// DEPENDENCIES (intentionally globals, so this module stays a leaf)
//   window.__BADA_SYNC_SIDEBAR_STATE__, window.__BADA_WORKFLOW_ORGANIZER_INSTANCE__,
//   window.BadaLoadImageFixer, window.__badaApplySettingsUI
//
// Phase 2 note: the Global Presets row is NO LONGER a window bridge. It used to call
// window.__BADA_BUILD_PRESETS_PANEL__ (bada_core.js's inline panel); that global is deleted
// and this module now imports presets_overview_modal.js directly.
//
// NOTE: this is a normal JS module, not an injected CSS template literal, so ordinary
// text is safe here. Keep injected-CSS concerns out of this file.
// ──────────────────────────────────────────────────────────────────────────────
import { BadaI18n } from "./bada_i18n.js";
import { escapeHtml } from "./bada_shared.js";
// Phase 2: the Global Presets row is self-owned. It used to call back into
// bada_core.js's buildInlinePresetsPanel() through window.__BADA_BUILD_PRESETS_PANEL__;
// that bridge is gone, so v2 imports the overview modal module directly.
import {
    showGlobalPresetsOverviewModal,
    getGlobalPresetsSummary,
    exportGlobalPresetsJson,
    importGlobalPresetsJson,
} from "./presets_overview_modal.js";

export const BADA_V2_CATEGORY = "Bada Utils";

// Phase 1 uses native rows only, so the position dropdown needs the same option payload
// the legacy table used. bada_core.js's updatePresetBadgePositionOptions() localizes the
// REGISTERED setting in place (it looks the setting up by this exact id), so the strings
// here only need to be valid defaults.
const PRESET_POSITION_OPTIONS = [
    { value: "bottom", text: "Bottom Dock (Recommended)" },
    { value: "bottom_inside", text: "Bottom Inside" },
    { value: "top_high", text: "Top Stacked" },
    { value: "top_left", text: "Top Left (Legacy)" },
];

/** Unbox a ComfyUI toggle/select payload into a plain boolean. */
function asBool(v) {
    return (typeof v === "object" && v !== null && "value" in v) ? !!v.value : !!v;
}

/**
 * Compact-sidebar apply. Reimplemented here (self-contained) instead of reaching into
 * bada_core.js, because that function is declared deep inside the legacy setup() and is
 * about to become legacy-only in Phase 3.
 */
function applyCompactSidebarState(enabled) {
    try {
        if (enabled) {
            document.body.classList.add("bada-compact-sidebar");
            window.app?.ui?.settings?.setSettingValue?.("Comfy.Sidebar.Size", "small");
        } else {
            document.body.classList.remove("bada-compact-sidebar");
            window.app?.ui?.settings?.setSettingValue?.("Comfy.Sidebar.Size", "normal");
        }
    } catch (_) { console.debug("[Bada v2] ignored:", _); }
}

/**
 * Translator list rows: Save button + duplicate/conflict hint (settings v2).
 *
 * WHY AN EXPLICIT SAVE BUTTON. Instant apply was implemented first and removed at the user's
 * request. Worth recording WHY it looked broken, because it was not: the logic worked. The
 * state flips immediately, but ComfyUI SUPPRESSES CANVAS REPAINTS WHILE THE SETTINGS MODAL IS
 * OPEN. Measured on a live instance by hashing the canvas backing store:
 *
 *   before typing ................................. 13344c724fac
 *   after the debounce, DIALOG STILL OPEN ......... 13344c724fac   <- identical: no repaint
 *   after closing the dialog ....................... abf2849a0dac   <- repainted here
 *
 * So a Save button alone would change nothing about repainting; what the user gains is
 * positive confirmation that the input was committed. To also kill the "I need F5" part, the
 * save handler forces the repaint itself, in two passes.
 *
 * REPAINT COST (measured, 40-node canvas): a forced repaint averages 31.9 ms and never
 * exceeded 40 ms, most of which is just waiting for the next animation frame. A real F5 needs
 * 5713 ms before the app is usable again - roughly 179x slower. The second pass is free by
 * comparison, which is why it is worth doing rather than trusting the modal to repaint.
 *
 * NO CUSTOM RENDERER. The rows stay native ComfyUI `text` settings; this only augments the
 * already-rendered DOM, the same pattern mountManagerCacheWidget() uses. v2's rule is
 * "native row types only", and that holds. The mount is idempotent, so bada_core.js can call
 * it on every settings-UI pass without any bookkeeping.
 */
const TRANSLATOR_ROW_IDS = ["BadaUtils.TranslationBlacklist", "BadaUtils.TranslationWhitelist"];

/** Second repaint pass, aimed at the frame after the modal's own throttling settles. */
const TRANSLATOR_REPAINT_RETRY_MS = 120;

/** Normalise a comma-separated list the way the legacy hint did: case/whitespace folded. */
function parseNameList(raw) {
    const items = String(raw || "").split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((rawItem) => ({ raw: rawItem, key: rawItem.toLowerCase().replace(/\s+/g, " ") }));
    const counts = new Map();
    items.forEach(({ key }) => counts.set(key, (counts.get(key) || 0) + 1));
    return { items, counts };
}

/**
 * Describe the duplicate / conflict state of the two lists.
 * Duplicates inside one list are harmless (matching is a membership test) and a name in both
 * lists resolves in favour of Exclude - these are warnings, not errors, and nothing here
 * rewrites the stored value. This mirrors buildNoteHelperPanel()'s legacy hint, which also
 * only warned. Verified against real nodes: exclude wins, duplicates change nothing.
 */
function describeListIssues(blacklistRaw, whitelistRaw) {
    const bl = parseNameList(blacklistRaw);
    const wl = parseNameList(whitelistRaw);
    const wlKeys = new Set(wl.items.map((i) => i.key));

    const dupOf = (parsed) => [...parsed.counts.entries()]
        .filter(([, n]) => n > 1)
        .map(([key]) => parsed.items.find((i) => i.key === key)?.raw || key);
    const conflicts = [...new Set(bl.items.map((i) => i.key).filter((k) => wlKeys.has(k)))]
        .map((k) => bl.items.find((i) => i.key === k)?.raw || k);

    return { dupBlacklist: dupOf(bl), dupWhitelist: dupOf(wl), conflicts };
}

/**
 * Commit the two lists and push them to the nodes.
 * Persists explicitly rather than trusting the store to already hold them, re-scans the
 * canvas, and forces the repaint in two passes so the change is visible without an F5.
 */
function applyTranslationLists() {
    try {
        const bl = document.querySelector('[data-setting-id="BadaUtils.TranslationBlacklist"] input');
        const wl = document.querySelector('[data-setting-id="BadaUtils.TranslationWhitelist"] input');
        if (bl) window.app?.ui?.settings?.setSettingValue?.("BadaUtils.TranslationBlacklist", bl.value.trim());
        if (wl) window.app?.ui?.settings?.setSettingValue?.("BadaUtils.TranslationWhitelist", wl.value.trim());

        window.__BADA_REAPPLY_NOTE_HELPER_NODES__?.();

        // Two passes: the first repaints immediately, the second lands after the modal's
        // throttling would have swallowed it. This is what removes the need for F5.
        window.app?.graph?.setDirtyCanvas?.(true, true);
        setTimeout(() => window.app?.graph?.setDirtyCanvas?.(true, true), TRANSLATOR_REPAINT_RETRY_MS);
    } catch (_) { console.debug("[Bada v2] save failed:", _); }
}

const SAVE_BTN_CSS = [
    "flex: 0 0 auto; width: 30px; height: 30px;",
    "display: flex; align-items: center; justify-content: center;",
    "background: rgba(255, 255, 255, 0.06);",
    "border: 1px solid rgba(255, 255, 255, 0.18);",
    "border-radius: 6px; color: #e2e8f0; font-size: 15px; line-height: 1;",
    "cursor: pointer; transition: background 0.15s, color 0.15s, border-color 0.15s;",
].join(" ");
const SAVE_BTN_OK_EXTRA = "background: rgba(16, 185, 129, 0.18); border-color: #10b981; color: #34d399;";

/** Reusable row decorator: Save button + a hint line, both idempotent. */
function decorateTranslatorRow(rowId, isKo, onChange) {
    const row = document.querySelector(`[data-setting-id="${rowId}"]`);
    if (!row) return null;
    const col = row.querySelector(".form-input");
    const input = col?.querySelector("input");
    if (!col || !input) return null;

    // --- Save button -----------------------------------------------------------
    let btn = col.querySelector(".bada-v2-save-btn");
    if (!btn) {
        btn = document.createElement("button");
        btn.type = "button";
        btn.className = "bada-v2-save-btn";
        btn.textContent = "💾";
        const label = isKo ? "저장 및 노드에 반영" : "Save and apply to nodes";
        btn.setAttribute("aria-label", label);
        btn.title = label;
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            applyTranslationLists();
            // Flash a check so the user has positive confirmation the input was committed.
            btn.textContent = "✓";
            btn.style.cssText = SAVE_BTN_CSS + SAVE_BTN_OK_EXTRA;
            setTimeout(() => {
                btn.textContent = "💾";
                btn.style.cssText = SAVE_BTN_CSS;
            }, 1200);
            onChange?.();
        });
        col.appendChild(btn);
    }

    // --- hint line -------------------------------------------------------------
    let hint = row.querySelector(".bada-v2-list-hint");
    if (!hint) {
        hint = document.createElement("div");
        hint.className = "bada-v2-list-hint";
        hint.style.cssText = "width:100%; font-size:11px; line-height:1.4; margin-top:3px; color:#94a3b8;";
        row.appendChild(hint);
    }

    // Live warning while typing - feedback without applying anything.
    if (!input.dataset.badaHintBound) {
        input.dataset.badaHintBound = "1";
        input.addEventListener("input", () => onChange?.());
    }

    return { row, col, input, hint, btn };
}

/** Repaint both hint lines from the current input values. Cheap: string work only. */
function refreshTranslatorHints(isKo) {
    const bl = document.querySelector('[data-setting-id="BadaUtils.TranslationBlacklist"] input');
    const wl = document.querySelector('[data-setting-id="BadaUtils.TranslationWhitelist"] input');
    if (!bl || !wl) return;

    const { dupBlacklist, dupWhitelist, conflicts } = describeListIssues(bl.value, wl.value);

    const paint = (rowId, parts, hasConflict) => {
        const row = document.querySelector(`[data-setting-id="${rowId}"]`);
        const hint = row?.querySelector(".bada-v2-list-hint");
        const input = row?.querySelector(".form-input input");
        if (!hint || !input) return;
        if (!parts.length) {
            hint.textContent = "";
            input.style.borderColor = "";
            input.style.boxShadow = "";
            return;
        }
        hint.textContent = parts.join("   ");
        hint.style.color = hasConflict ? "#f59e0b" : "#ef4444";
        input.style.borderColor = hasConflict ? "#f59e0b" : "#ef4444";
        input.style.boxShadow = "";
    };

    const dup = (names) => (isKo ? `중복: ${names.join(", ")}` : `Duplicate: ${names.join(", ")}`);
    const blParts = [];
    if (dupBlacklist.length) blParts.push(dup(dupBlacklist));
    for (const c of conflicts) {
        blParts.push(isKo ? `"${c}"는 추가에도 있음 — 제외 우선` : `"${c}" is also in Add — Exclude wins`);
    }
    paint("BadaUtils.TranslationBlacklist", blParts.map((p) => `⛔ ${p}`), conflicts.length > 0);

    const wlParts = [];
    if (dupWhitelist.length) wlParts.push(dup(dupWhitelist));
    for (const c of conflicts) {
        wlParts.push(isKo ? `"${c}"는 제외에도 있음 — 제외 우선` : `"${c}" is also in Exclude — Exclude wins`);
    }
    paint("BadaUtils.TranslationWhitelist", wlParts.map((p) => `⛔ ${p}`), conflicts.length > 0);
}

/**
 * Entry point called by bada_core.js's settings-UI pass. Idempotent by construction.
 *
 * Does TWO jobs, because ComfyUI cannot re-render a `type` renderer on its own:
 *   - mounts the Save buttons / hint lines on the two translator text rows
 *   - re-labels the custom-rendered Global Presets row after a language switch
 * Both are no-ops when their target is not on screen.
 */
export function mountLocalizedRows() {
    const isKo = BadaI18n.lang === "ko";
    const refresh = () => refreshTranslatorHints(isKo);
    for (const id of TRANSLATOR_ROW_IDS) decorateTranslatorRow(id, isKo, refresh);
    refresh();
    refreshPresetsRowLanguage();
    refreshCloudSyncRowLanguage();
}

// Exposed as a global so bada_core.js's existing (event-driven, non-polling) settings-UI
// observer can trigger the mount. No custom renderer, no per-keystroke re-render.
window.__BADA_MOUNT_LOCALIZED_ROWS__ = mountLocalizedRows;

/**
 * The v2 Global Presets row (Phase 2).
 *
 * Deliberately compact: a count, a button into the existing overview modal, and backup /
 * restore. The legacy inline panel rendered a full card grid INSIDE the settings row, which
 * is what made the old category grow to fifteen tall groups; the modal already shows that
 * grid, so duplicating it here would rebuild the problem v2 exists to remove.
 *
 * Node type names come from the localStorage store, which a user can populate from an
 * imported JSON backup — so every interpolated name goes through escapeHtml().
 */
function buildPresetsRow() {
    const isKo = BadaI18n.lang === "ko";
    const summary = getGlobalPresetsSummary();

    const row = document.createElement("div");
    row.id = "bada-v2-presets-row";
    row.style.cssText = "width:100%; display:flex; flex-direction:column; gap:8px; box-sizing:border-box;";

    const list = document.createElement("div");
    list.id = "bada-v2-presets-list";
    list.style.cssText = "display:flex; flex-wrap:wrap; gap:4px;";

    // Localized strings, kept in one place so the in-place language refresh below can reuse
    // exactly the same wording.
    const texts = {
        empty: isKo ? "저장된 글로벌 프리셋이 없습니다" : "No global presets saved yet",
        export: isKo ? "📤 전체 백업 (JSON)" : "📤 Backup All (JSON)",
        import: isKo ? "📥 불러오기" : "📥 Import",
        open: isKo ? "🌐 프리셋 관리자 열기" : "🌐 Open Presets Manager",
    };

    const renderList = () => {
        const s = getGlobalPresetsSummary();
        if (s.nodeSummaries.length === 0) {
            list.innerHTML = `<span style="font-size:11px; color:#64748b;">${texts.empty}</span>`;
            return;
        }
        list.innerHTML = s.nodeSummaries.slice(0, 12).map(n =>
            `<span title="${escapeHtml(n.nodeType)}" style="font-size:11px; color:#cbd5e1; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); padding:2px 6px; border-radius:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:200px;">🧩 ${escapeHtml(n.nodeType)} <b style="color:#a5b4fc;">${n.count}</b></span>`
        ).join("");
        if (s.nodeSummaries.length > 12) {
            list.innerHTML += `<span style="font-size:11px; color:#64748b;">+${s.nodeSummaries.length - 12}</span>`;
        }
    };
    renderList();

    const btn = (id, label, css) =>
        `<button type="button" id="${id}" style="${css}">${label}</button>`;
    const plainBtn = "background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); color:#e2e8f0; padding:6px 12px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:4px;";
    const primaryBtn = "background:linear-gradient(135deg,#6366f1 0%,#4f46e5 100%); color:#fff; border:1px solid rgba(255,255,255,0.25); padding:6px 14px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:6px; box-shadow:0 4px 12px rgba(99,102,241,0.3);";

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;";
    actions.innerHTML =
        `<div style="display:flex; gap:8px; flex-wrap:wrap;">` +
        btn("bada-v2-presets-export-btn", texts.export, plainBtn) +
        btn("bada-v2-presets-import-btn", texts.import, plainBtn) +
        `</div>` +
        btn("bada-v2-presets-open-btn", texts.open, primaryBtn);

    row.appendChild(list);
    row.appendChild(actions);

    actions.querySelector("#bada-v2-presets-open-btn")?.addEventListener("click", (e) => {
        e.stopPropagation();
        showGlobalPresetsOverviewModal();
    });
    actions.querySelector("#bada-v2-presets-export-btn")?.addEventListener("click", (e) => {
        e.stopPropagation();
        exportGlobalPresetsJson();
    });
    actions.querySelector("#bada-v2-presets-import-btn")?.addEventListener("click", (e) => {
        e.stopPropagation();
        // Re-render in place so the counts above refresh without reopening the dialog.
        importGlobalPresetsJson(() => row.replaceWith(buildPresetsRow()));
    });

    // LANGUAGE SWITCH (2026-10-03). A `type` renderer runs ONCE, when the row is created, so
    // the buttons kept whatever language was active at that moment — switching to English left
    // "전체 백업 / 불러오기 / 프리셋 관리자 열기" on screen. Native rows are relabelled by
    // bada_core.js's applyBilingualSettingsUI(), but a custom-rendered row is invisible to it.
    // So the row carries its own in-place refresh, invoked from the same settings-UI pass.
    // In place rather than replaceWith(), because ComfyUI still holds a reference to this
    // element as the row's rendered content.
    row._badaRefreshLanguage = () => {
        const ko = BadaI18n.lang === "ko";
        texts.empty = ko ? "저장된 글로벌 프리셋이 없습니다" : "No global presets saved yet";
        const set = (id, label) => {
            const el = row.querySelector("#" + id);
            if (el) el.textContent = label;
        };
        set("bada-v2-presets-export-btn", ko ? "📤 전체 백업 (JSON)" : "📤 Backup All (JSON)");
        set("bada-v2-presets-import-btn", ko ? "📥 불러오기" : "📥 Import");
        set("bada-v2-presets-open-btn", ko ? "🌐 프리셋 관리자 열기" : "🌐 Open Presets Manager");
        renderList();
    };

    return row;
}

/**
 * Cloud Sync (Google Drive) row — 수동 동기화 버튼 + 연동 상태 표시.
 * 기존 백엔드 엔드포인트:
 *   GET  /api/bada/cloud/status  → { status, authorized, libs_available, files }
 *   POST /api/bada/cloud/sync    → { status, message, uploaded, downloaded }
 * 1차 동기화 대상: presets_data.json / favorites_data.json / gemini_chat_history.json
 */
function buildCloudSyncRow() {
    // ── Outer Container ──
    const row = document.createElement("div");
    row.id = "bada-v2-cloudsync-row";
    row.style.cssText = "width:100%; display:flex; flex-direction:column; align-items:stretch; gap:10px; box-sizing:border-box; padding:4px 0;";

    const texts = {
        title: "☁️ 클라우드 동기화 (Google Drive)",
        desc: "컴피유아이 워크플로우와 설정을 구글 드라이브와 자동으로 동기화합니다.",
        masterTitle: "마스터 동기화 ON/OFF",
        optStartup: "시작 시 자동 동기화",
        optRealtime: "실시간 변경 시 자동 동기화",
        statusIdle: "⏸️ Google Drive 연동 대기",
        statusOk: "✅ Google Drive 연동됨",
        statusNoLibs: "⚠️ google-api-python-client 설치 필요",
        statusNoCreds: "⚠️ credentials.json 없음",
        statusAuth: "🔑 인증 필요",
        syncNow: "☁️ 지금 동기화",
        syncing: "⏳ 동기화 중… (누르면 중단)",
        cancelling: "⏳ 중단 중…",
        detailBtn: "🔍 동기화 상세 보기",
    };
    const textsEn = {
        title: "☁️ Cloud Sync (Google Drive)",
        desc: "Automatically synchronizes ComfyUI workflows and settings with Google Drive.",
        masterTitle: "Master Cloud Sync ON/OFF",
        optStartup: "Auto-sync on Startup",
        optRealtime: "Auto-sync on Realtime Changes",
        statusIdle: "⏸️ Google Drive not linked",
        statusOk: "✅ Google Drive linked",
        statusNoLibs: "⚠️ Install google-api-python-client",
        statusNoCreds: "⚠️ credentials.json not found",
        statusAuth: "🔑 Authentication required",
        syncNow: "☁️ Sync Now",
        syncing: "⏳ Syncing… (click to cancel)",
        cancelling: "⏳ Cancelling…",
        detailBtn: "🔍 View sync details",
    };

    const t = () => (BadaI18n.lang === "ko" ? texts : textsEn);

    // [시간 포맷] epoch(초) → 로컬 "YYYY-MM-DD HH:MM"
    const fmtTime = (ts) => {
        if (!ts) return null;
        try {
            const d = new Date(ts * 1000);
            const p = (n) => String(n).padStart(2, "0");
            return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
        } catch (_) { return null; }
    };

    // ── 1. Top Bar: Left Title & Right Master Toggle Switch ──
    const topBar = document.createElement("div");
    topBar.style.cssText = "display:flex; align-items:center; justify-content:space-between; gap:16px; width:100%; box-sizing:border-box;";

    const titleEl = document.createElement("div");
    titleEl.style.cssText = "font-size:13px; font-weight:700; color:#f8fafc; display:flex; align-items:center; gap:6px;";

    const masterSwitchLabel = document.createElement("label");
    masterSwitchLabel.className = "bada-cloud-switch";
    masterSwitchLabel.style.cssText = "margin:0; flex-shrink:0;";

    const masterSwitchInput = document.createElement("input");
    masterSwitchInput.type = "checkbox";
    // 최초 사용자 기본값: 서버와 동일하게 OFF (fetch 완료 전 깜빡임 방지)
    masterSwitchInput.checked = false;

    const masterSliderSpan = document.createElement("span");
    masterSliderSpan.className = "bada-cloud-slider";

    masterSwitchLabel.appendChild(masterSwitchInput);
    masterSwitchLabel.appendChild(masterSliderSpan);

    topBar.appendChild(titleEl);
    topBar.appendChild(masterSwitchLabel);
    row.appendChild(topBar);

    // ── 2. Content Row: Left Column (Desc + Sub-options + Status) & Right Column (Buttons) ──
    const contentRow = document.createElement("div");
    contentRow.style.cssText = "display:flex; align-items:flex-start; justify-content:space-between; gap:20px; width:100%; box-sizing:border-box; margin-top:2px;";

    const leftCol = document.createElement("div");
    leftCol.style.cssText = "flex:1 1 auto; display:flex; flex-direction:column; gap:8px; min-width:0;";

    // Description
    const descEl = document.createElement("div");
    descEl.style.cssText = "font-size:11px; color:#94a3b8; line-height:1.5; font-weight:400; word-break:keep-all;";
    leftCol.appendChild(descEl);

    // Sub-options Row (Checkboxes: Startup + Realtime)
    const subOptionsRow = document.createElement("div");
    subOptionsRow.id = "bada-v2-cloudsync-suboptions";
    subOptionsRow.style.cssText = "display:flex; align-items:center; gap:20px; padding:2px 0; transition:opacity 0.2s ease;";

    const createCheckbox = (id, labelText) => {
        const wrap = document.createElement("label");
        wrap.style.cssText = "display:inline-flex; align-items:center; gap:6px; font-size:12px; color:#cbd5e1; cursor:pointer; user-select:none;";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.id = id;
        // 최초 사용자 기본값: 서버와 동일하게 OFF
        cb.checked = false;
        cb.style.cssText = "cursor:pointer; accent-color:#0ea5e9; width:14px; height:14px; margin:0;";
        const span = document.createElement("span");
        span.textContent = labelText;
        wrap.appendChild(cb);
        wrap.appendChild(span);
        return { wrap, cb, span };
    };

    const startupOpt = createCheckbox("bada-cloud-opt-startup", texts.optStartup);
    const realtimeOpt = createCheckbox("bada-cloud-opt-realtime", texts.optRealtime);

    subOptionsRow.appendChild(startupOpt.wrap);
    subOptionsRow.appendChild(realtimeOpt.wrap);
    leftCol.appendChild(subOptionsRow);

    // Status
    const status = document.createElement("div");
    status.id = "bada-v2-cloudsync-status";
    status.style.cssText = "font-size:12px; color:#94a3b8; font-weight:500; display:flex; align-items:center; gap:6px; min-height:18px;";
    leftCol.appendChild(status);

    // Right Column: Buttons (Top aligned!)
    const rightCol = document.createElement("div");
    rightCol.style.cssText = "flex:0 0 160px; display:flex; flex-direction:column; gap:8px; align-items:stretch; align-self:flex-start;";

    const syncBtn = document.createElement("button");
    syncBtn.type = "button";
    syncBtn.id = "bada-v2-cloudsync-btn";
    syncBtn.style.cssText = "background:linear-gradient(135deg,#0ea5e9 0%,#0284c7 100%); color:#fff; border:1px solid rgba(255,255,255,0.25); padding:7px 14px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; box-shadow:0 4px 12px rgba(14,165,233,0.3); transition:all 0.15s ease;";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.id = "bada-v2-cloudsync-toggle";
    toggle.style.cssText = "background:rgba(148,163,184,0.1); border:1px solid rgba(148,163,184,0.28); border-radius:5px; padding:6px 12px; margin:0; color:#cbd5e1; font-size:11px; cursor:pointer; text-align:center; display:flex; align-items:center; justify-content:center; gap:6px; box-sizing:border-box; transition:background 0.15s ease;";
    toggle.addEventListener("mouseenter", () => { toggle.style.background = "rgba(148,163,184,0.22)"; });
    toggle.addEventListener("mouseleave", () => { toggle.style.background = "rgba(148,163,184,0.1)"; });

    rightCol.appendChild(syncBtn);
    rightCol.appendChild(toggle);
    contentRow.appendChild(leftCol);
    contentRow.appendChild(rightCol);
    row.appendChild(contentRow);

    // ── Settings Fetch / Save ──
    const saveSettings = async (patch) => {
        try {
            await fetch("/api/bada/cloud/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patch),
            });
        } catch (err) {
            console.error("[Bada CloudSync] Failed to save settings:", err);
        }
    };

    const updateSubOptionsState = (masterEnabled) => {
        if (masterEnabled) {
            subOptionsRow.style.opacity = "1";
            subOptionsRow.style.pointerEvents = "auto";
        } else {
            subOptionsRow.style.opacity = "0.45";
            subOptionsRow.style.pointerEvents = "none";
        }
    };

    const fetchSettings = async () => {
        try {
            const r = await fetch("/api/bada/cloud/settings");
            const s = await r.json();
            if (s.success) {
                if (typeof s.cloud_sync_enabled === "boolean") {
                    masterSwitchInput.checked = s.cloud_sync_enabled;
                }
                if (typeof s.startup_autosync === "boolean") {
                    startupOpt.cb.checked = s.startup_autosync;
                }
                if (typeof s.realtime_autosync === "boolean") {
                    realtimeOpt.cb.checked = s.realtime_autosync;
                }
                updateSubOptionsState(masterSwitchInput.checked);
            }
        } catch (_) { /* ignore */ }
    };
    // 초기 렌더링: 기본값(OFF) 기준으로 서브옵션 상태 즉시 반영 (fetch 전 깜빡임 방지)
    updateSubOptionsState(masterSwitchInput.checked);
    fetchSettings();

    masterSwitchInput.addEventListener("change", () => {
        const enabled = masterSwitchInput.checked;
        updateSubOptionsState(enabled);
        saveSettings({ cloud_sync_enabled: enabled });
    });

    startupOpt.cb.addEventListener("change", () => {
        saveSettings({ startup_autosync: startupOpt.cb.checked });
    });

    realtimeOpt.cb.addEventListener("change", () => {
        const enabled = realtimeOpt.cb.checked;
        saveSettings({ realtime_autosync: enabled });
        if (enabled) {
            window.__BADA_WORKFLOW_ORGANIZER_INSTANCE__?.setupRealtimeSync?.();
        }
    });

    // 항목별 스냅샷 — 팝업에 넘길 최신값 (renderStatus가 갱신).
    let filesSnapshot = [];
    let lastSyncSnapshot = null;

    toggle.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!filesSnapshot.length) {
            try {
                const r = await fetch("/api/bada/cloud/status");
                const s = await r.json();
                if (s.success) {
                    filesSnapshot = Array.isArray(s.files) ? s.files : [];
                    lastSyncSnapshot = s.last_sync || null;
                }
            } catch (_) { /* 팝업은 빈 표로 열림 */ }
        }
        const { openCloudDetailModal } = await import("./cloud_sync_detail_modal.js");
        openCloudDetailModal(filesSnapshot, lastSyncSnapshot);
    });

    // 동기화 중 여부
    let syncInProgress = false;
    let progressTimer = null;
    const stopProgressPoll = () => {
        if (progressTimer) {
            clearInterval(progressTimer);
            progressTimer = null;
        }
    };
    const setSyncUI = (on) => {
        syncInProgress = !!on;
        syncBtn.disabled = false;
        syncBtn.textContent = syncInProgress ? t().syncing : t().syncNow;
        if (syncInProgress) {
            startProgressPoll();
        } else {
            stopProgressPoll();
        }
    };

    // 분모/분자 한 줄 그리기 (좌측 넓은 영역이므로 긴 파일명도 시원하게 표시)
    const paintProgress = (prog) => {
        if (!prog) return;
        const isKo = (BadaI18n.lang === "ko");
        if (prog.total === undefined) return;
        let cur = "";
        if (prog.current) {
            cur = ` · ${prog.current}`;
        }
        const frac = `${prog.done ?? 0}/${prog.total}`;
        status.textContent = isKo
            ? `⏳ 동기화 중 ${frac}${cur}`
            : `⏳ Syncing ${frac}${cur}`;
        status.title = prog.current || "";
    };

    const startProgressPoll = () => {
        if (progressTimer) return;
        const tick = async () => {
            try {
                const r = await fetch("/api/bada/cloud/status");
                const s = await r.json();
                if (!s.syncing) {
                    setSyncUI(false);
                    renderStatus();
                    return;
                }
                if (s.progress && s.progress.total !== undefined) {
                    paintProgress(s.progress);
                }
            } catch (_) { /* 다음 틱 재시도 */ }
        };
        tick();
        progressTimer = setInterval(tick, 1000);
    };

    const installSettingsCloudWatcher = () => {
        if (window.__BADA_CLOUD_SETTINGS_WATCHER__) return;
        const api = window.app?.api;
        if (!api?.addEventListener) return;
        window.__BADA_CLOUD_SETTINGS_WATCHER__ = true;
        api.addEventListener("bada.cloud.sync", (event) => {
            const detail = event?.detail || {};
            setSyncUI(!!detail.syncing);
            if (detail.syncing && detail.total !== undefined) {
                paintProgress(detail);
            }
            if (!detail.syncing) {
                setSyncUI(false);
                renderStatus();
            }
        });
    };
    installSettingsCloudWatcher();

    const applyLang = () => {
        const T = t();
        titleEl.textContent = T.title;
        descEl.textContent = T.desc;
        masterSwitchLabel.title = T.masterTitle;
        startupOpt.span.textContent = T.optStartup;
        realtimeOpt.span.textContent = T.optRealtime;
        toggle.textContent = T.detailBtn;
        setSyncUI(syncInProgress);
        renderStatus();
    };

    const renderStatus = async () => {
        const T = t();
        status.textContent = T.statusIdle;
        status.title = "";
        try {
            const res = await fetch("/api/bada/cloud/status");
            const data = await res.json();
            if (!data.success) {
                status.textContent = T.statusIdle;
                return;
            }
            if (!data.libs_available) {
                status.textContent = T.statusNoLibs;
                syncBtn.style.display = "none";
                return;
            }
            syncBtn.style.display = "";

            setSyncUI(!!data.syncing);
            if (data.syncing) {
                if (data.progress && data.progress.total !== undefined) {
                    paintProgress(data.progress);
                } else {
                    status.textContent = (BadaI18n.lang === "ko")
                        ? "⏳ 동기화 준비 중…"
                        : "⏳ Preparing sync…";
                }
            } else if (data.status === "missing_credentials") {
                status.textContent = T.statusNoCreds;
            } else if (!data.authorized) {
                status.textContent = T.statusAuth;
            } else {
                status.textContent = T.statusOk;
            }

            filesSnapshot = Array.isArray(data.files) ? data.files : [];
            lastSyncSnapshot = data.last_sync || null;

            if (!data.syncing && data.authorized && lastSyncSnapshot && lastSyncSnapshot.last_sync_at) {
                const when = fmtTime(lastSyncSnapshot.last_sync_at);
                const up = lastSyncSnapshot.uploaded ?? 0;
                const down = lastSyncSnapshot.downloaded ?? 0;
                if (when) {
                    status.textContent = (BadaI18n.lang === "ko")
                        ? `☁️ 마지막 동기화 ${when} (↑${up} ↓${down})`
                        : `☁️ Last sync ${when} (↑${up} ↓${down})`;
                }
            }
        } catch (_) {
            status.textContent = T.statusIdle;
        }
    };

    syncBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (syncInProgress) {
            syncBtn.textContent = t().cancelling;
            try {
                const res = await fetch("/api/bada/cloud/cancel", { method: "POST" });
                const data = await res.json();
                const isKo = (BadaI18n.lang === "ko");
                status.textContent = (data.status === "cancelling")
                    ? (isKo ? "⏳ 중단 요청… 진행 중인 파일까지만 마무리하고 멈춥니다." : "⏳ Cancelling… it stops after the current file.")
                    : (isKo ? "ℹ️ 진행 중인 동기화가 없습니다." : "ℹ️ No sync is currently running.");
                if (data.status !== "cancelling") {
                    setSyncUI(false);
                    renderStatus();
                }
            } catch (err) {
                status.textContent = (BadaI18n.lang === "ko")
                    ? `❌ 중단 요청 실패: ${err}`
                    : `❌ Cancel request failed: ${err}`;
            }
            return;
        }
        setSyncUI(true);
        try {
            const res = await fetch("/api/bada/cloud/sync", { method: "POST" });
            const data = await res.json();
            if (data.status === "cancelled") {
                status.textContent = (BadaI18n.lang === "ko")
                    ? `⏹️ ${data.message || "동기화가 중단되었습니다."}`
                    : `⏹️ ${data.message || "Sync cancelled."}`;
            } else if (data.success) {
                const up = data.uploaded ?? 0;
                const down = data.downloaded ?? 0;
                const tLocal = data.trashed_local ?? 0;
                const tRemote = data.trashed_remote ?? 0;
                const isKo = (BadaI18n.lang === "ko");
                let extra = "";
                if (tLocal > 0 || tRemote > 0) {
                    extra = isKo
                        ? ` · 정리(휴지통): 로컬 ${tLocal}, 드라이브 ${tRemote}`
                        : ` · Cleaned(trash): local ${tLocal}, drive ${tRemote}`;
                }
                status.textContent = isKo
                    ? `✅ 동기화 완료 (업로드 ${up} · 다운로드 ${down}${extra})`
                    : `✅ Sync done (upload ${up} · download ${down}${extra})`;
            } else {
                status.textContent = (BadaI18n.lang === "ko")
                    ? `❌ ${data.error || data.message || "실패"}`
                    : `❌ ${data.error || data.message || "Failed"}`;
            }
        } catch (err) {
            status.textContent = (BadaI18n.lang === "ko")
                ? `❌ 요청 실패: ${err}`
                : `❌ Request failed: ${err}`;
        } finally {
            setSyncUI(false);
            renderStatus();
        }
    });

    applyLang();

    // 언어 전환 시 라벨 갱신
    row._badaRefreshLanguage = applyLang;

    return row;
}


/**
 * Re-label the custom-rendered presets row after a language switch.
 * No-op when the row is not on screen. Safe to call on every settings-UI pass.
 */
function refreshPresetsRowLanguage() {
    const row = document.getElementById("bada-v2-presets-row");
    row?._badaRefreshLanguage?.();
}

/**
 * Re-label the custom-rendered Cloud Sync row after a language switch.
 * No-op when the row is not on screen. Safe to call on every settings-UI pass.
 */
function refreshCloudSyncRowLanguage() {
    const row = document.getElementById("bada-v2-cloudsync-row");
    row?._badaRefreshLanguage?.();
}

/**
 * Registers the new "Bada Utils" category. Every row gets its OWN subgroup: ComfyUI keeps
 * only ONE setting per [category, subgroup] pair, so a shared subgroup would silently drop
 * all but the last row. See the MEASURED CONSTRAINT note in the file header.
 *
 * @param {(config: object) => void} addSetting  bada_core.js's guarded addSetting wrapper.
 * @param {{ lang?: string }} [opts]             Active UI language for initial values.
 */
export function registerBadaV2Settings(addSetting, opts = {}) {
    const lang = (opts.lang === "ko") ? "ko" : "en";

    // PHASE 3 (2026-10-04) — STARTUP SHOWED THE WRONG LANGUAGE.
    // Symptom: with BadaUtils.Language persisted as "en", a fresh load drew EVERY row in
    // Korean, and the user had to switch to Korean and back to English before anything
    // relabelled. Restarting did not help, which ruled out a stale file.
    //
    // Two independent causes, both fixed here:
    //
    // 1. THE STORED VALUE WAS IGNORED. `defaultValue: lang` took the language from
    //    BadaI18n at registration time, not from the user's saved setting. BadaI18n.init()
    //    reads localStorage FIRST (getBadaLanguage step 1) while the dropdown renders the
    //    value ComfyUI restored from its own store, so the two could disagree — the
    //    dropdown said "English" while every row was Korean. Reading the actual setting
    //    makes the registered default agree with what the user chose.
    //
    // 2. THE SERVER SYNC LANDED TOO LATE. bada_i18n.js fetches /settings asynchronously at
    //    module load. When that resolved to a different language, BadaI18n.setLanguage()
    //    fired its listeners, but the settings dialog renders its rows once and a plain
    //    re-label cannot help a row that was already built. So the correction has to be
    //    pushed through the same bilingual pass that paints the rows.
    //
    // Reading the store must not throw during early setup, hence the guarded helper.
    const storedLang = (() => {
        try {
            const v = window.app?.ui?.settings?.getSettingValue?.("BadaUtils.Language");
            const s = (typeof v === "object" && v !== null && "value" in v) ? v.value : v;
            return (s === "ko" || s === "en") ? s : null;
        } catch (_) { return null; }
    })();
    const resolvedLang = storedLang || lang;

    // 3-tier: category[1] is the shared SECTION (7 total), category[2] is the
    // unique ROW LABEL. The section comes from the caller; row label from the id.
    // The subgroup headings are VISIBLE (ComfyUI draws them as the bold line, like
    // Crystools/VHS/KJNodes) — bada_core.js no longer hides them.
    const add = (config) => {
        const { section, ...rest } = config;
        return addSetting({
            ...rest,
            category: [BADA_V2_CATEGORY, section, String(config.id).replace(/^BadaUtils\./, "")],
        });
    };

    // ① UI Language -----------------------------------------------------------
    add({
        id: "BadaUtils.Language",
        section: "Language",
        name: "🌐 UI Language",
        type: "combo",
        sortOrder: 900,
        options: [
            { value: "en", text: "English" },
            { value: "ko", text: "한국어 (Korean)" },
        ],
        // The STORED value wins over the registration-time language, so a fresh load opens in
        // the language the user last chose instead of whatever BadaI18n happened to hold.
        defaultValue: resolvedLang,
        onChange: (newVal) => {
            const target = (typeof newVal === "object" && newVal !== null && "value" in newVal) ? newVal.value : newVal;
            if (target === "ko" || target === "en") {
                BadaI18n.setLanguage(target, false);
                window.__badaApplySettingsUI?.(target);
                // The custom-rendered Global Presets row is invisible to
                // __badaApplySettingsUI(), so re-label it here as well. Called directly rather
                // than waiting for the dialog observer, so the switch takes effect in the same
                // tick instead of one frame later. Idempotent: it only rewrites text in place.
                try { mountLocalizedRows(); } catch (_) { console.debug("[Bada v2] ignored:", _); }
                window.app?.graph?.setDirtyCanvas?.(true, true);
            }
        },
    });

    // Cause 2 above: bada_i18n.js's /settings fetch resolves AFTER this module has registered
    // its rows, and it can report a different language than the one we just registered with.
    // A bare notifyListeners() cannot repaint rows that are already on screen, so when the
    // sync lands on a DIFFERENT language we re-run the same two passes a manual switch runs.
    // Polls briefly rather than once: the fetch may resolve before ComfyUI has even
    // registered BadaUtils.Language, in which case getSettingValue still reports the default.
    // Bounded and cheap — four reads, no observers, no interval left running.
    (() => {
        let tries = 0;
        const MAX_TRIES = 4;
        const timer = setInterval(() => {
            tries++;
            let live;
            try {
                const v = window.app?.ui?.settings?.getSettingValue?.("BadaUtils.Language");
                live = (typeof v === "object" && v !== null && "value" in v) ? v.value : v;
            } catch (_) { live = null; }
            if (live !== "ko" && live !== "en") {
                if (tries >= MAX_TRIES) clearInterval(timer);
                return;
            }
            clearInterval(timer);
            if (live === resolvedLang) return;              // already correct, nothing to do
            if (BadaI18n.lang === live) return;               // engine agrees, UI already right
            BadaI18n.setLanguage(live, false);
            window.__badaApplySettingsUI?.(live);
            try { mountLocalizedRows(); } catch (_) { console.debug("[Bada v2] ignored:", _); }
        }, 300);
    })();

    // ② Text & Prompt one-click translator (native toggle; lists are native rows below)
    add({
        id: "BadaUtils.NoteHelper",
        section: "Translation",
        name: "📝 Text & Prompt One-Click Translator",
        type: "boolean",
        sortOrder: 850,
        defaultValue: true,
    });

    // ③ Translation blacklist / ④ forced-add list (plain text rows so the values stay
    //    persistent and bada_note_helper.js keeps reading the same IDs).
    //    NO auto-apply: instant apply was removed at the user's request because ComfyUI
    //    suppresses canvas repaints while this dialog is open, so the change looked like it
    //    had done nothing. These rows are augmented with a Save button by
    //    mountLocalizedRows() instead - see its comment for the measured detail.
    add({
        id: "BadaUtils.TranslationBlacklist",
        section: "Translation",
        name: "📝 Translation Blacklist",
        type: "text",
        sortOrder: 840,
        defaultValue: "",
    });
    add({
        id: "BadaUtils.TranslationWhitelist",
        section: "Translation",
        name: "➕ Translation Forced-Add List",
        type: "text",
        sortOrder: 839,
        // Default list for a FRESH install only — once the user saves, their value wins and
        // this default never applies again. These are the user's own custom nodes, which the
        // automatic detector cannot recognise, so shipping them pre-filled means a new
        // install gets working translation buttons with no setup.
        // Matching is case-insensitive and partial (matchesNameList uses `includes`), so the
        // exact casing here is for readability only.
        //
        // Note bada_core.js still carries the older default on BADA_UNIFIED_SETTINGS, but that
        // one is attached to the LEGACY `BadaLegacy.TranslationWhitelist` key, which nothing
        // reads. The live store key is BadaUtils.TranslationWhitelist, owned by this module.
        defaultValue: "Show Any, Preview as Text, Show Text",
    });

    // Decorate the two rows now, and let bada_core.js's settings-UI observer re-run the
    // (idempotent) mount after any dialog re-render.
    try { mountLocalizedRows(); } catch (_) { console.debug("[Bada v2] ignored:", _); }

    // ⑤ Sidebar workflows+ folder management ----------------------------------
    add({
        id: "BadaUtils.SidebarOrganizer",
        section: "Sidebar",
        name: "📁 Sidebar Workflows+ Folder Management",
        type: "boolean",
        sortOrder: 800,
        defaultValue: true,
        onChange: (newVal) => {
            window.__BADA_SYNC_SIDEBAR_STATE__?.(asBool(newVal));
        },
    });

    // ⑥ Legacy Manager node-name cache refresh --------------------------------
    //    Plain boolean on purpose. bada_core.js still mounts the status widget into this
    //    row (its id mapping matches), so it looks identical to the legacy category.
    add({
        id: "BadaUtils.LegacyManagerCacheRefresh",
        section: "Sidebar",
        name: "🧩 Legacy Manager Node-Name Cache Refresh",
        type: "boolean",
        sortOrder: 820,
        defaultValue: true,
    });

    // ⑦ Save As folder picker -------------------------------------------------
    add({
        id: "BadaUtils.SaveAsFolderPicker",
        section: "Sidebar",
        name: "💾 Save As Folder Picker",
        type: "boolean",
        sortOrder: 790,
        defaultValue: false,
        onChange: () => {
            window.__BADA_WORKFLOW_ORGANIZER_INSTANCE__?.setupSaveAsFolderPicker?.();
        },
    });

    // ⑧ Mouse wheel zoom / middle-click pan fixer -----------------------------
    add({
        id: "BadaUtils.MouseFix",
        section: "Canvas",
        name: "🖱️ Mouse Wheel Zoom & Middle-Click Pan Fixer",
        type: "boolean",
        sortOrder: 700,
        defaultValue: true,
    });

    // ⑨ Compact sidebar -------------------------------------------------------
    add({
        id: "BadaUtils.CompactSidebar",
        section: "Canvas",
        name: "📐 Compact Sidebar",
        type: "boolean",
        sortOrder: 650,
        defaultValue: true,
        onChange: (newVal) => applyCompactSidebarState(asBool(newVal)),
    });

    // ⑩ Clean blank canvas startup -------------------------------------------
    add({
        id: "BadaUtils.BlankStartup",
        section: "Canvas",
        name: "🧼 Clean Blank Canvas Startup",
        type: "boolean",
        sortOrder: 600,
        defaultValue: true,
    });

    // ⑪ Global presets badges -------------------------------------------------
    add({
        id: "BadaUtils.ShowPresetBadges",
        section: "Presets",
        name: "🏷️ Global Presets",
        type: "boolean",
        sortOrder: 500,
        defaultValue: true,
        onChange: () => window.app?.graph?.setDirtyCanvas?.(true, true),
    });

    // ⑫ Preset badge position -------------------------------------------------
    add({
        id: "BadaUtils.PresetBadgePosition",
        section: "Presets",
        name: "🏷️ Preset Badge Position",
        type: "combo",
        options: PRESET_POSITION_OPTIONS,
        sortOrder: 490,
        defaultValue: "bottom",
        onChange: () => window.app?.graph?.setDirtyCanvas?.(true, true),
    });

    // ⑬ Global presets panel -------------------------------------------------
    //    Phase 2: self-owned. This row used to delegate to bada_core.js's inline panel via
    //    window.__BADA_BUILD_PRESETS_PANEL__. It now builds its own compact row: a live count,
    //    an "open manager" button, and backup/restore. The full card grid lives in the
    //    overview modal, which is the same modal the legacy row's popup button opened.
    add({
        id: "BadaUtils.GlobalPresetsPanel",
        section: "Presets",
        name: "Global Presets",
        sortOrder: 400,
        defaultValue: null,
        type: () => buildPresetsRow(),
    });

    // ⑭ Clipboard & LoadImage auto-error fixer --------------------------------
    add({
        id: "BadaUtils.LoadImageClipboardFix",
        section: "Image Fix",
        name: "📋 Clipboard & LoadImage Auto-Error Fixer",
        type: "boolean",
        sortOrder: 300,
        defaultValue: true,
        onChange: (newVal) => {
            const enabled = (typeof newVal === "object" && newVal !== null && "value" in newVal)
                ? !!newVal.value
                : (newVal === true || newVal === "true");
            window._badaLoadImageFixEnabled = enabled;
            if (enabled && window.BadaLoadImageFixer?.healAllImageNodes) {
                window.BadaLoadImageFixer.healAllImageNodes();
            }
        },
    });

    // ⑮ Node smart care -------------------------------------------------------
    add({
        id: "BadaUtils.MissingNodeDetective",
        section: "Smart Care",
        name: "🩺 Node Smart Care (Missing Node Resolver & Model Assigner)",
        type: "boolean",
        sortOrder: 150,
        defaultValue: true,
    });

    // ⑯ Cloud Sync (Google Drive) --------------------------------------------
    //    Own SECTION ("Cloud Sync") so ComfyUI draws its own divider above it —
    //    exactly the 3-tier pattern the other rows use. Custom-rendered (sync
    //    button + live status) because a boolean cannot trigger a REST call.
    //    Backend: server/gdrive_sync.py via /api/bada/cloud/{status,sync}.
    add({
        id: "BadaUtils.CloudSync",
        section: "Cloud Sync",
        name: "☁️ Cloud Sync (Google Drive)",
        sortOrder: 100,
        defaultValue: null,
        type: () => buildCloudSyncRow(),
    });
}