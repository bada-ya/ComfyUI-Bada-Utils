// Guards the Legacy Manager node-name cache warm-up (web/bada_manager_cache.js).
//
// Background: Manager 4.x has two independent backends — `glob` (modern) and
// `legacy` (--enable-manager-legacy-ui). Both expose the same read-only
// /v2/customnode/getmappings endpoint, but get_data_by_mode() only reads its cache
// file when is_file_created_within_one_day() passes, and the legacy CNR loader
// returns `{}` when dont_wait=True and the cache is absent. So on a fresh install
// the legacy UI sees an empty mapping and every custom node name silently vanishes
// from search until the modern UI is booted once and writes the cache file.
//
// These are all *inclusions* (the module must exist, must be wired, must stay
// read-only), so nothing else in the suite would catch a regression.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const JS = read(path.join("web", "bada_manager_cache.js"));
const CORE = read(path.join("web", "bada_core.js"));
// Settings v2 (Phase 1) now owns the canonical BadaUtils.* registrations; the legacy block
// in bada_core.js was remapped to BadaLegacy.*. Guards that asserted "this setting is a
// plain boolean" must therefore accept EITHER the legacy block (via toLegacyId) or the v2
// module.
const V2 = read(path.join("web", "bada_settings_v2.js"));

let fails = 0;
const check = (label, ok) => {
    console.log(`${ok ? "OK " : "BAD"} ${label}`);
    if (!ok) fails++;
};

// --- 1. module exists and is wired in ---------------------------------------
check("bada_manager_cache.js exists", /refreshLegacyManagerCache/.test(JS));
check("imported from bada_core.js so its extension registers",
    /import \{[^}]*\} from "\.\/bada_manager_cache\.js";/.test(CORE));
check("registers its own ComfyUI extension",
    /app\.registerExtension\(\{[\s\S]*?name: "BadaUtils\.ManagerCacheRefresh"/.test(JS));
check("runs from setup()", /async setup\(\) \{[\s\S]*?isLegacyManagerActive\(\)/.test(JS));

// --- 2. gating: modern UI must be a hard no-op -----------------------------
// Requirement: "신형으로 부팅하면 비활성화". The endpoint is Manager's own
// read-only flag route; a non-legacy response must stop everything.
check("gates on /v2/manager/is_legacy_manager_ui",
    /fetch\("\/v2\/manager\/is_legacy_manager_ui"\)/.test(JS));
check("requires an explicit true from that route",
    /data\?\.is_legacy_manager_ui === true/.test(JS));
// The AUTOMATIC boot path is legacy-only; the manual button opts out via
// requireLegacy:false so it also works on the modern UI.
check("automatic path is legacy-only (requireLegacy defaults true)",
    /const \{ force = false, requireLegacy = true \} = options;/.test(JS)
    && /if \(requireLegacy && !legacy\) \{/.test(JS));
check("setup() skips the automatic refresh on the modern UI",
    /if \(await isLegacyManagerActive\(\)\) \{[\s\S]*?await refreshLegacyManagerCache\(\);[\s\S]*?\} else \{/.test(JS));
// Requirement update: the row must stay VISIBLE on the modern UI so the manual
// button is reachable. The earlier display:none lock was deliberately removed.
check("setting row is NOT hidden on the modern UI anymore",
    !/syncSettingVisibility/.test(JS) && !/display: none !important/.test(JS));
check("a failed detection probe is treated as modern (fail-closed)",
    /catch \(err\) \{[\s\S]*?return false;/.test(JS));

// --- 3. the refresh itself --------------------------------------------------
// mode=remote is the whole trick: it takes the network branch in
// get_data_by_mode(), which downloads AND persists the file through Manager's own
// cache_lock. mode=cache would read the missing file and change nothing.
check("warms extension-node-map.json (fixes node-name search)",
    /getmappings\?mode=remote/.test(JS));
check("warms custom-node-list.json too (Plan B)", /getlist\?mode=remote/.test(JS));
check("both warm targets listed", (JS.match(/url: "\/v2\/customnode\/\w+\?mode=remote"/g) || []).length === 2);
// Only the mode-detection probe parses a body; the two warm fetches must not, so
// the ~3 MB of JSON never lands in the JS heap.
check("warm fetches never parse the response body (keeps ~3MB out of the heap)",
    !/await res\.json\(\)/.test(JS.replace(/const data = await res\.json\(\);/, ""))
    && (JS.match(/await res\.json\(\)/g) || []).length === 1);

// --- 4. once-a-day guard ----------------------------------------------------
// Manager's own is_file_created_within_one_day uses a 86400s window, so we mirror
// it with a YYYY-MM-DD stamp rather than inventing a second policy.
check("date-stamped once-a-day guard", /LAST_REFRESH_KEY/.test(JS) && /todayStamp\(\)/.test(JS));
check("guard compares today's stamp in localStorage",
    /localStorage\.getItem\(LAST_REFRESH_KEY\) === todayStamp\(\)/.test(JS));
check("date is latched only after the search-fixing file succeeds",
    /if \(refreshed\.includes\(TARGET_NODE_MAP\.label\)\) markRefreshedToday\(\);/.test(JS));
check("a partial failure retries next boot instead of waiting a day",
    /ok: failed\.length === 0 && refreshed\.length > 0/.test(JS));
check("setting can veto the refresh", /readSettingEnabled\(\)/.test(JS)
    && /disabled by setting — skipped/.test(JS));
// Plan B, mode-aware: /v2/customnode/getlist exists ONLY in the legacy backend
// (verified: comfyui_manager/glob/manager_server.py has no such route), so calling
// it on the modern UI would 404. targetsFor() narrows the list accordingly.
check("catalogue fetch is legacy-only (getlist is not a glob route)",
    /return isLegacy \? \[TARGET_NODE_MAP, TARGET_CATALOG\] : \[TARGET_NODE_MAP\];/.test(JS));
check("force skips both the date guard and the setting veto",
    /if \(!force && !readSettingEnabled\(\)\)/.test(JS)
    && /if \(!force && alreadyRefreshedToday\(\)\)/.test(JS));

// --- 5. ComfyUI-Manager review compliance (ltdrdata) -------------------------
// The reviewer required that we not load another extension's server modules and
// not add network-reachable execution. This module must stay GET-only.
const forbidden = [
    [/import\s+.*comfyui_manager/, "no comfyui_manager Python import in JS"],
    [/routes\.(get|post)\s*\(/, "no route registration"],
    [/create_subprocess|subprocess/, "no shell execution"],
    [/method:\s*["']POST/i, "no POST requests"],
    [/\/customnode\/install/, "no install endpoint"],
    [/\/manager\/reboot/, "no reboot endpoint"],
    [/writeFileSync|writeFile\(/, "no direct cache file writes"],
];
for (const [re, label] of forbidden) check(label, !re.test(JS));
check("exactly two Manager calls, both plain GET fetches",
    (JS.match(/await fetch\(/g) || []).length === 2);
check("setting id matches between module and core",
    /BadaUtils\.LegacyManagerCacheRefresh/.test(JS)
    && /BadaUtils\.LegacyManagerCacheRefresh/.test(CORE));

// --- 6. the setting itself --------------------------------------------------
// Default true for BOTH UIs: the module hides the row under the modern UI, so a
// shared default needs no forced overwrite on boot and survives mode switches.
check("setting defined with defaultValue true",
    /legacyManagerCache: \{[\s\S]*?id: "BadaUtils\.LegacyManagerCacheRefresh"[\s\S]*?defaultValue: true/.test(CORE));
check("setting registered via safeAddSetting",
    /BADA_UNIFIED_SETTINGS\.legacyManagerCache\.id/.test(CORE)
    && /texts\.legacyManagerCacheName/.test(CORE));
check("bilingual label present",
    /legacyManagerCacheName: "🧩 Legacy Manager Node-Name Cache Refresh"/.test(CORE)
    && /legacyManagerCacheName: "🧩 구형 메니저 커스텀 노드명 캐시 갱신"/.test(CORE));
check("bilingual description present",
    /legacyManagerCacheDesc: "Rebuilds ComfyUI-Manager's node-name index/.test(CORE)
    && /legacyManagerCacheDesc: "구형 메니저에서 새로 등록된 커스텀 노드명이 검색되도록/.test(CORE));

// --- 7. settings-panel regressions (caused the whole category to vanish) -----
// Regression 1: calling setSettingValue() while BUILDING a settings row re-triggers
// the settings rebuild, and that rebuild builds the row again — an infinite loop that
// made the entire "Bada Utils" category disappear from the settings list. Writes must
// only ever happen inside a user click handler, matching buildNoteHelperPanel().
const panelBuilder = CORE.slice(
    CORE.indexOf("function mountManagerCacheWidget"),
    CORE.indexOf("function buildNoteHelperPanel"),
);
check("widget exists and is mounted from the shared bilingual pass",
    /function mountManagerCacheWidget\(row\)/.test(CORE)
    && /mountManagerCacheWidget\(row\)/.test(CORE));
check("REGRESSION: no setSettingValue while building the widget",
    !/setSettingValue/.test(panelBuilder));
// Regression 3 (the language-switch freeze): BadaI18n.notifyListeners() walks its Set
// with `for..of`, which visits listeners ADDED during the walk. The old panel rebuilt
// itself inside its own language listener, so every rebuild enqueued a fresh listener
// and the browser froze on each language switch. The widget must therefore never
// subscribe at all, and the setting must be a plain boolean switch.
check("REGRESSION: widget never subscribes to BadaI18n", !/BadaI18n\.subscribe/.test(panelBuilder));
check("REGRESSION: setting is a plain boolean switch, not a custom renderer",
    (/id: toLegacyId\(BADA_UNIFIED_SETTINGS\.legacyManagerCache\.id\),[\s\S]*?type: BADA_UNIFIED_SETTINGS\.legacyManagerCache\.type/.test(CORE)
        || /id: "BadaUtils\.LegacyManagerCacheRefresh",[\s\S]*?type: "boolean"/.test(V2))
    && !/type:\s*\(\)\s*=>\s*\{[\s\S]{0,200}?buildManagerCachePanel/.test(CORE));
check("REGRESSION: buildManagerCachePanel is fully removed",
    !/function buildManagerCachePanel/.test(CORE));
check("widget re-mount is a no-op when already present",
    /const MANAGER_CACHE_WIDGET_ID = "bada-manager-cache-widget";/.test(CORE)
    && /const existing = row\.querySelector\("#" \+ MANAGER_CACHE_WIDGET_ID\);[\s\S]*?if \(existing\)/.test(panelBuilder));
// Layout regression: the widget used to be appended into .form-input, the narrow
// toggle-sized right column, which squeezed the status text into ragged wrapped lines.
// It must attach to the row itself and span the full dialog width.
check("widget attaches to the row, not the narrow .form-input column",
    !/row\.querySelector\("\.form-input"\)[^\n]*\|\|\s*row/.test(panelBuilder)
    && /row\.insertBefore\(wrap, formInput\.nextSibling\)/.test(panelBuilder)
    && /wrap\.style\.flexBasis = "100%"/.test(panelBuilder));
check("status text and button share one flex row",
    /align-items: center; justify-content: space-between/.test(panelBuilder)
    && /flex: 1 1 260px; min-width: 0/.test(panelBuilder)
    && /flex: 0 0 auto/.test(panelBuilder));
check("text writes are content-guarded", /!== stampText\) stampEl\.textContent/.test(panelBuilder)
    && /!== text\) modeEl\.textContent/.test(panelBuilder));
check("no subscribe-result assumed to be a function",
    !/const unsubscribe = BadaI18n\.subscribe/.test(CORE));
check("no duplicated buildNoteHelperPanel declaration",
    (CORE.match(/^function buildNoteHelperPanel\(\)/gm) || []).length === 1);

// --- 7b. Settings-dialog layout regressions ---------------------------------
// The translator header used space-between, which flung its own toggle ~1200px to the
// far edge of the dialog and wasted a whole visual line.
check("translator header keeps its toggle next to the title",
    /headerRow\.style\.cssText = "display: flex; align-items: center; justify-content: flex-start;/.test(CORE));
// Both list groups must live in a SINGLE row (user asked for one line, not three).
check("translator lists share one row",
    /blRow\.appendChild\(blGroup\);\s*blRow\.appendChild\(wlGroup\);/.test(CORE)
    && !/wlRow/.test(CORE)
    && /flex: 1 1 320px; min-width: 0/.test(CORE));

// --- 7c. Settings-dialog layout (values measured with Playwright) -----------
// Facts observed in the live dialog via dev_tests/probe_dividers.cjs:
//   - the container class really is `setting-group` (SINGULAR)
//   - Bada renders 15 separate .setting-group wrappers, one per row
//   - ComfyUI forces a `my-8 border-t border-border-default` div as the FIRST child of
//     each wrapper, so a hidden row still paints its rule (14 rules for 15 groups)
check("settings layout CSS targets the real singular .setting-group",
    (CORE.match(/\.setting-group:has\(/g) || []).length >= 6
    && !/\.setting-groups:has\(/.test(CORE));
check("Bada rows get the tightened 8px / no-padding rhythm",
    /\.setting-group:has\(\[data-setting-id\^="BadaUtils"\]\) \.setting-item \{\s*margin-bottom: 8px !important;\s*padding-bottom: 0 !important;\s*border-bottom: none !important;/.test(CORE));

// REGRESSION: hiding a translator-list row by [data-setting-id] alone left its
// .setting-group wrapper alive holding only ComfyUI's forced divider, so three rules
// stacked back to back (measured top=185/194/203) between the translator panel and the
// sidebar row. The wrapper must be hidden as well, which collapses 3 lines -> 1.
// Scoped to BadaLegacy.* since the Phase 1 id remap: only the LEGACY category has the custom
// translator panel with its inline list inputs, so only there must these rows disappear.
// Settings v2's BadaUtils.* list rows are the only UI for those settings and must stay visible.
check("hidden translator rows drop their forced divider wrapper too",
    /\.setting-group:has\(\[data-setting-id="BadaLegacy\.TranslationBlacklist"\]\),\s*\.setting-group:has\(\[data-setting-id="BadaLegacy\.TranslationWhitelist"\]\) \{\s*display: none !important;/.test(CORE)
    && /div\[data-setting-id="BadaLegacy\.TranslationBlacklist"\]/.test(CORE));
// REGRESSION (2026-10-03): the label/switch-HIDING rules used to target BadaUtils.*, which
// after the Phase 1 remap belongs to settings v2 — where NoteHelper is a plain native boolean.
// They suppressed v2's real label and hid its list rows entirely. Those hiding rules must stay
// scoped to BadaLegacy.*. Layout rules (the width/flex work added later) MAY target the v2
// rows on purpose, so they are not what this guard is about.
check("translator rows are never HIDDEN by BadaUtils.* rules (v2 keeps its native UI)",
    !/div\[data-setting-id="BadaUtils\.NoteHelper"\]/.test(CORE)
    && !/BadaUtils\.NoteHelper"\] \) > \.my-8/.test(CORE)
    && !/data-setting-id="BadaUtils\.TranslationBlacklist"\][\s\S]{0,120}display: none/.test(CORE)
    && !/data-setting-id="BadaUtils\.TranslationWhitelist"\][\s\S]{0,120}display: none/.test(CORE)
    && !/querySelector\('\[data-setting-id="BadaUtils\.NoteHelper"\]'\)/.test(CORE));

// REGRESSION: the Global-Presets block is ONE feature (글로벌 프리셋 toggle + its
// 프리셋 뱃지 위치 dropdown + the presets panel), so ComfyUI's forced divider above the
// badge-position row and above the panel must be painted away. The divider is a DIRECT
// child of .setting-group (confirmed via dev_tests/probe_direct_children.cjs:
// dividerDepth 1 for every Bada row), hence the "> .my-8" combinator. Measured live with
// dev_tests/verify_badge_lines.cjs: those two rows report border-top-color rgba(0,0,0,0)
// while every other Bada row stays rgba(255,255,255,0.08).
// 2026-10-03: generalised. The rule was two exact ids; the user then asked for the WHOLE
// new Bada Utils category to read as one block, so it now covers every BadaUtils row via the
// prefix selector. The frozen BadaLegacy (구) rows are untouched by it.
check("every v2 row's forced divider is painted transparent (category reads as one block)",
    /\.setting-group:has\(\[data-setting-id\^="BadaUtils"\]\) > \.my-8 \{\s*border-top-color: transparent !important;/.test(CORE)
    && !/data-setting-id="BadaUtils\.PresetBadgePosition"\] \) > \.my-8/.test(CORE));

// REGRESSION: the JS layer turns .form-label into a column flex container (title span +
// description), so its cross-axis alignment MUST be flex-start. The previous value
// `align-items: center !important` overrode the inline flex-start and pushed the title and
// the description to the horizontal middle of the row (measured live with
// dev_tests/probe_text_align.cjs: spanLeft 367 / descLeft 228 inside a 822px label).
// Comments are stripped first so the explanatory note above the rule cannot satisfy it.
check("Bada row labels stay left-aligned (never re-centered)", (function () {
    const css = CORE.replace(/\/\*[\s\S]*?\*\//g, "");
    return /\.setting-group:has\(\[data-setting-id\^="BadaUtils"\]\) \.form-label \{[^}]*align-items: flex-start !important;/.test(css)
        && !/\.setting-group:has\(\[data-setting-id\^="BadaUtils"\]\) \.form-label \{[^}]*align-items: center/.test(css);
})());

// --- 7d. Settings v2 coexistence (Phase 1) ----------------------------------
// The canonical BadaUtils.* IDs moved to web/bada_settings_v2.js; the legacy block in
// bada_core.js was remapped to BadaLegacy.* and relabelled "Bada Utils (Legacy)". These are
// inclusions/invariants that nothing else in the suite would catch.
check("settings v2 module exists and is imported by core",
    /export function registerBadaV2Settings\(/.test(V2)
    && /import \{ registerBadaV2Settings \} from "\.\/bada_settings_v2\.js";/.test(CORE));
// ComfyUI renders AT MOST ONE SETTING PER [category, subgroup] pair (measured with
// Playwright: 3 rows sharing one subgroup -> only the last rendered). So v2 must give every
// row its OWN subgroup; a single shared "General" subgroup silently drops 14 of 15 rows.
check("v2 gives every row its OWN subgroup (shared subgroup would drop rows)",
    !/BADA_V2_SUBGROUP/.test(V2)
    && /category: \[BADA_V2_CATEGORY, String\(config\.id\)/.test(V2)
    && (V2.match(/add\(\{/g) || []).length >= 15);
check("v2 owns the canonical BadaUtils.* ids",
    /id: "BadaUtils\.Language"/.test(V2)
    && /id: "BadaUtils\.NoteHelper"/.test(V2)
    && /id: "BadaUtils\.GlobalPresetsPanel"/.test(V2));
check("legacy registrations were remapped to BadaLegacy.*",
    (CORE.match(/toLegacyId\(/g) || []).length === 16
    && !/id: BADA_UNIFIED_SETTINGS\.\w+\.id,/.test(CORE));
check("v2 registers BEFORE the legacy block (nav order == registration order)",
    CORE.indexOf("registerBadaV2Settings(safeAddSetting") > -1
    && CORE.indexOf("registerBadaV2Settings(safeAddSetting") < CORE.indexOf("toLegacyId(BADA_UNIFIED_SETTINGS.lang.id)"));
check("legacy category is relabelled",
    /category: "Bada Utils \(Legacy\)"/.test(CORE) && /category: "Bada Utils \(구\)"/.test(CORE));

// --- 7e. Settings v2 Phase 2: the Global Presets row is self-owned ----------------
// Phase 1 routed v2's presets row through window.__BADA_BUILD_PRESETS_PANEL__, a window
// bridge into bada_core.js. Phase 2 deletes the bridge; v2 imports the overview modal module
// directly, and the backup/restore logic that used to be inlined in bada_core.js's panel is
// now shared from presets_overview_modal.js so the two call sites cannot drift.
const OVERVIEW = read(path.join("web", "presets_overview_modal.js"));
// Strip comments first: both files still NAME the old bridge in prose explaining that it was
// removed, and that mention must not read as a live reference.
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
check("the __BADA_BUILD_PRESETS_PANEL__ window bridge is gone entirely",
    !/__BADA_BUILD_PRESETS_PANEL__/.test(stripComments(CORE))
    && !/__BADA_BUILD_PRESETS_PANEL__/.test(stripComments(V2))
    && !/__BADA_BUILD_PRESETS_PANEL__/.test(stripComments(OVERVIEW)));
check("v2 owns its presets row and imports the overview modal directly",
    /function buildPresetsRow\(\)/.test(V2)
    && /from "\.\/presets_overview_modal\.js"/.test(V2)
    && /type: \(\) => buildPresetsRow\(\)/.test(V2));
check("backup/restore is shared from presets_overview_modal.js (not duplicated)",
    /export function exportGlobalPresetsJson\(\)/.test(OVERVIEW)
    && /export function importGlobalPresetsJson\(/.test(OVERVIEW)
    && /exportGlobalPresetsJson\(\)/.test(V2)
    && /importGlobalPresetsJson\(/.test(V2)
    && /exportGlobalPresetsJson\(\)/.test(CORE)
    && /importGlobalPresetsJson\(/.test(CORE));
check("the v2 presets row escapes user-controlled node type names",
    /escapeHtml\(n\.nodeType\)/.test(V2));

// --- 7f. Translator rows: explicit Save, no auto-apply (2026-10-03) -----------------
// Instant apply was implemented, then removed at the user's request: the state updated
// immediately but ComfyUI suppresses canvas repaints while the settings modal is open, so
// it looked like nothing happened. The two rows are now NATIVE rows augmented with a Save
// button (no custom renderer) that forces the repaint in two passes.
check("auto-apply is fully removed from the v2 translator rows",
    !/scheduleNoteHelperReapply/.test(V2)
    && !/NOTE_HELPER_REAPPLY_DEBOUNCE_MS/.test(V2)
    && !/onChange: scheduleNoteHelperReapply/.test(V2)
    && !/clearTimeout\(noteHelperReapplyTimer\)/.test(V2));
check("the Save button is mounted onto the native rows, with no custom renderer",
    /export function mountLocalizedRows\(\)/.test(V2)
    && /window\.__BADA_MOUNT_LOCALIZED_ROWS__ = mountLocalizedRows/.test(V2)
    && /className = "bada-v2-save-btn"/.test(V2)
    && /textContent = "💾"/.test(V2)
    && /type: \(\) =>/g.test(V2) === false || !/id: "BadaUtils\.TranslationBlacklist"[\s\S]{0,200}type: \(\)/.test(V2));
check("core triggers the idempotent mount from its settings-UI pass",
    /__BADA_MOUNT_LOCALIZED_ROWS__\?\.\(\)/.test(CORE)
    && !/__BADA_MOUNT_TRANSLATOR_ROWS__/.test(CORE));
// LANGUAGE SWITCH (2026-10-03). A `type` renderer runs once at row creation, so a
// custom-rendered row keeps the language that was active then. The user switched to English
// and the Global Presets buttons still read 전체 백업 / 불러오기 / 프리셋 관리자 열기,
// because native rows are relabelled by applyBilingualSettingsUI() but a custom row is
// invisible to it. The row now carries an in-place refresh invoked from the same UI pass.
check("the custom-rendered presets row re-labels itself after a language switch",
    /row\._badaRefreshLanguage = \(\) =>/.test(V2)
    && /function refreshPresetsRowLanguage\(\)/.test(V2)
    && /refreshPresetsRowLanguage\(\);/.test(V2)
    && /row\.id = "bada-v2-presets-row"/.test(V2)
    // The labels are applied via the local `set()` helper, so match that call shape — an
    // earlier version of this check assumed a `textContent = ko ? ...` form that never existed.
    && /set\("bada-v2-presets-export-btn", ko \? "📤 전체 백업 \(JSON\)" : "📤 Backup All \(JSON\)"\)/.test(V2)
    && /set\("bada-v2-presets-import-btn", ko \? "📥 불러오기" : "📥 Import"\)/.test(V2)
    && /set\("bada-v2-presets-open-btn", ko \? "🌐 프리셋 관리자 열기" : "🌐 Open Presets Manager"\)/.test(V2));
// LANGUAGE SWITCH, SECOND ROUND (2026-10-03). The hook above existed and was correct, but
// nothing that ACTUALLY FIRES ON A LANGUAGE CHANGE ever called it. It was reachable only
// from triggerUIUpdate (dialog open / click / Ctrl+,), while the path that runs when the
// user picks a language in the dropdown is the dialog MutationObserver, which called
// applyBilingualSettingsUI() alone. Result: the presets buttons and the Manager cache
// button stayed Korean until the dialog was closed and reopened. Guard the wiring, not
// just the per-row refresh, or this silently regresses again.
check("REGRESSION: EVERY applyBilingualSettingsUI call site also runs the mount", (function () {
    // Count-based ("at least N of N") was too weak: deleting one call site still left the
    // count satisfied. Check each call site individually — every place that relabels the
    // native rows must also relabel the custom ones, or the two drift apart again.
    const sites = [...CORE.matchAll(/applyBilingualSettingsUI\([^)]*\);/g)];
    if (sites.length < 3) return false;
    // Delimit the search at the NEXT call site rather than with a character window or a brace
    // regex: a tight window failed sites whose mount sits behind a long comment, a 900-char
    // window let the next site's mount satisfy this one, and a `});` regex matched the `}`
    // inside an explanatory comment and cut the region short. "Text between this call and the
    // next one" is unambiguous.
    return sites.every((m, i) => {
        const start = m.index + m[0].length;
        const end = i + 1 < sites.length ? sites[i + 1].index : CORE.length;
        return /__BADA_MOUNT_LOCALIZED_ROWS__\?\.\(\);/.test(CORE.slice(start, end));
    });
})());
check("REGRESSION: the v2 language combo re-labels in the same tick", (function () {
    const onChange = V2.slice(V2.indexOf('id: "BadaUtils.Language"'), V2.indexOf('id: "BadaUtils.NoteHelper"'));
    return /BadaI18n\.setLanguage\(target, false\)/.test(onChange)
        && /__badaApplySettingsUI\?\.\(target\)/.test(onChange)
        && /mountLocalizedRows\(\)/.test(onChange);
})());
// The Manager cache widget had the same defect independently: paintManagerCacheWidget()
// refreshed the timestamp + mode spans but never the refresh BUTTON, whose label was
// written once at build time. The user saw an English "Last refreshed:" line sitting next
// to a Korean "지금 갱신" button, which is what finally made the bug obvious.
check("REGRESSION: the Manager cache refresh button is repainted too", (function () {
    const paint = CORE.slice(CORE.indexOf("function paintManagerCacheWidget("), CORE.indexOf("function buildNoteHelperPanel("));
    return /function managerCacheIdleText\(\)/.test(CORE)
        // The transient in-flight states (갱신 중… / ✓ 완료 / ⚠ 실패) must survive a repaint.
        && /btn && !btn\.disabled/.test(paint)
        && /managerCacheIdleText\(\)/.test(paint)
        && /btn\.textContent !== btnText\) btn\.textContent = btnText/.test(paint)
        // And the local closure it replaced must be gone, so there is one source of truth.
        && !/const idleText = \(\) =>/.test(CORE);
})());
check("Save forces the repaint in two passes (this is what removes the F5 reflex)",
    /function applyTranslationLists\(\)/.test(V2)
    && /__BADA_REAPPLY_NOTE_HELPER_NODES__/.test(V2)
    && /setDirtyCanvas\?\.\(true, true\)/.test(V2)
    && /setTimeout\(\(\) => window\.app\?\.graph\?\.setDirtyCanvas/.test(V2)
    && /TRANSLATOR_REPAINT_RETRY_MS = \d+/.test(V2));
check("duplicate / conflict warnings are restored for the native rows",
    /function describeListIssues\(/.test(V2)
    && /dupBlacklist/.test(V2) && /dupWhitelist/.test(V2) && /conflicts/.test(V2)
    && /Exclude wins/.test(V2));
check("the two list inputs are widened and v2 controls use a smaller font",
    /data-setting-id="BadaUtils\.TranslationBlacklist"\]\) \.form-label,\s*\.setting-group:has\(\[data-setting-id="BadaUtils\.TranslationWhitelist"\]\) \.form-label \{\s*flex: 0 1 300px !important;/.test(CORE)
    // Must be a DESCENDANT selector: the combo rows are custom components, not <select>,
    // so a `.form-input select` rule leaves the language/position dropdowns at 16px.
    && /\.form-input,\s*\.setting-group:has\(\[data-setting-id\^="BadaUtils"\]\) \.form-input \* \{\s*font-size: 13px !important;/.test(CORE));
// Keep this tolerant of the explanatory comment between the id and the defaultValue.
check("fresh installs ship the user's own custom nodes pre-filled in the forced-add list",
    /id: "BadaUtils\.TranslationWhitelist"/.test(V2)
    && /defaultValue: "Show Any, Preview as Text, Show Text"/.test(V2)
    && !/show text, show any/.test(V2));
check("the legacy Apply button is untouched (category frozen until Phase 3)",
    /const handleApply = \(\) => \{/.test(CORE) && /applyBtn\.addEventListener\("click", handleApply\)/.test(CORE));
// Divider removal: the transparent-line rule used to name two ids; it must now cover every
// v2 row so the category reads as one block, while the frozen BadaLegacy rows keep theirs.
check("every v2 row loses its forced divider line, BadaLegacy keeps them",
    /\.setting-group:has\(\[data-setting-id\^="BadaUtils"\]\) > \.my-8 \{\s*border-top-color: transparent !important;/.test(CORE)
    && !/BadaUtils\.PresetBadgePosition"\] \) > \.my-8/.test(CORE));

// REGRESSION (twice): the dialog renders TWO kinds of h3, measured with Playwright:
//   text-xs font-bold text-text-secondary uppercase -> the CATEGORY MENU (General/Other).
//   text-base -> per-subgroup labels (Language, NoteHelper, Sidebar, TranslationBlacklist…).
// A blanket `h3 { display:none }` kills the menu; removing it entirely resurfaces every
// subgroup label. Only `> h3.text-base` may be hidden.
check("hides only the subgroup h3.text-base labels, never the category menu", (function () {
    const css = CORE.replace(/\/\*[\s\S]*?\*\//g, "");
    return /> h3\.text-base \{[^}]*display: none/.test(css)
        && !/h3\s*\{\s*display:\s*none/.test(css)
        && !/h3\.text-base[^{]*\{[^}]*display:\s*block/.test(css);
})());

// REGRESSION: the injected stylesheet is a JS template literal. A backtick inside a CSS
// comment closed the string early and threw "Unexpected identifier", which stopped
// bada_core.js from loading AT ALL — no CSS, no settings rows, no i18n. Found by Playwright.
check("no stray backtick inside the injected CSS template literal", (function () {
    const start = CORE.indexOf('style.textContent = `');
    if (start < 0) return true;
    const end = CORE.indexOf('`;', start);
    if (end < 0) return false;
    // Only the opening backtick may appear before the closing "`;" sequence.
    return (CORE.slice(start, end).match(/`/g) || []).length === 1;
})());

