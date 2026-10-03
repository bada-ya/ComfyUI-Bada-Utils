// ──────────────────────────────────────────────────────────────────────────────
//  Bada Utils · Settings v2  (Phase 1 — coexistence skeleton)
// ──────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE EXISTS
//   The old "Bada Utils" settings category grafted its UI onto ComfyUI's React rows
//   (per-row custom renderers, JS label/description re-injection, `:has()` CSS hacks,
//   a MutationObserver). Every new feature risked breaking the whole dialog. v2 is the
//   clean replacement: native row types only, and no reliance on internal class names.
//
// MEASURED CONSTRAINT (Playwright, against this ComfyUI build) — READ BEFORE EDITING
//   ComfyUI renders AT MOST ONE SETTING PER [category, subgroup] PAIR. Registering several
//   rows that share a subgroup silently DROPS every row but the last one; there is no error
//   and no console warning. Controlled experiment on a live instance:
//
//     3 rows, ONE shared subgroup   -> rendered: ["EXP.A3"]        (2 of 3 lost)
//     3 rows, one subgroup each     -> rendered: ["EXP.B1","EXP.B2","EXP.B3"]
//
//   So every v2 row MUST carry its own subgroup. An earlier revision of this file put all
//   15 rows in a single "General" subgroup on the theory that one group means zero forced
//   dividers — that rendered exactly ONE row (the last registered). The "no dividers" look
//   is a CSS concern, not a grouping concern: bada_core.js already hides the per-subgroup
//   `> h3.text-base` labels and tightens `.my-8` for `[data-setting-id^="BadaUtils"]`.
//   dev_tests/verify_phase1.cjs asserts the row count so this cannot silently regress.
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
 * Re-label the custom-rendered presets row after a language switch.
 * No-op when the row is not on screen. Safe to call on every settings-UI pass.
 */
function refreshPresetsRowLanguage() {
    const row = document.getElementById("bada-v2-presets-row");
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

    // The subgroup label itself is hidden by bada_core.js's `> h3.text-base` rule, so the
    // per-row subgroup is invisible in the UI — it exists only to keep the rows distinct.
    const add = (config) => addSetting({
        ...config,
        category: [BADA_V2_CATEGORY, String(config.id).replace(/^BadaUtils\./, "")],
    });

    // ① UI Language -----------------------------------------------------------
    add({
        id: "BadaUtils.Language",
        name: "🌐 UI Language",
        type: "combo",
        sortOrder: 900,
        options: [
            { value: "en", text: "English" },
            { value: "ko", text: "한국어 (Korean)" },
        ],
        defaultValue: lang,
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

    // ② Text & Prompt one-click translator (native toggle; lists are native rows below)
    add({
        id: "BadaUtils.NoteHelper",
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
        name: "📝 Translation Blacklist",
        type: "text",
        sortOrder: 840,
        defaultValue: "",
    });
    add({
        id: "BadaUtils.TranslationWhitelist",
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
        name: "🧩 Legacy Manager Node-Name Cache Refresh",
        type: "boolean",
        sortOrder: 820,
        defaultValue: true,
    });

    // ⑦ Save As folder picker -------------------------------------------------
    add({
        id: "BadaUtils.SaveAsFolderPicker",
        name: "💾 Save As Folder Picker",
        type: "boolean",
        sortOrder: 790,
        defaultValue: true,
        onChange: () => {
            window.__BADA_WORKFLOW_ORGANIZER_INSTANCE__?.setupSaveAsFolderPicker?.();
        },
    });

    // ⑧ Mouse wheel zoom / middle-click pan fixer -----------------------------
    add({
        id: "BadaUtils.MouseFix",
        name: "🖱️ Mouse Wheel Zoom & Middle-Click Pan Fixer",
        type: "boolean",
        sortOrder: 700,
        defaultValue: true,
    });

    // ⑨ Compact sidebar -------------------------------------------------------
    add({
        id: "BadaUtils.CompactSidebar",
        name: "📐 Compact Sidebar",
        type: "boolean",
        sortOrder: 650,
        defaultValue: true,
        onChange: (newVal) => applyCompactSidebarState(asBool(newVal)),
    });

    // ⑩ Clean blank canvas startup -------------------------------------------
    add({
        id: "BadaUtils.BlankStartup",
        name: "🧼 Clean Blank Canvas Startup",
        type: "boolean",
        sortOrder: 600,
        defaultValue: true,
    });

    // ⑪ Global presets badges -------------------------------------------------
    add({
        id: "BadaUtils.ShowPresetBadges",
        name: "🏷️ Global Presets",
        type: "boolean",
        sortOrder: 500,
        defaultValue: true,
        onChange: () => window.app?.graph?.setDirtyCanvas?.(true, true),
    });

    // ⑫ Preset badge position -------------------------------------------------
    add({
        id: "BadaUtils.PresetBadgePosition",
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
        name: "Global Presets",
        sortOrder: 400,
        defaultValue: null,
        type: () => buildPresetsRow(),
    });

    // ⑭ Clipboard & LoadImage auto-error fixer --------------------------------
    add({
        id: "BadaUtils.LoadImageClipboardFix",
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
        name: "🩺 Node Smart Care (Missing Node Resolver & Model Assigner)",
        type: "boolean",
        sortOrder: 150,
        defaultValue: true,
    });
}