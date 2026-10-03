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
    /id: BADA_UNIFIED_SETTINGS\.legacyManagerCache\.id,[\s\S]*?type: BADA_UNIFIED_SETTINGS\.legacyManagerCache\.type/.test(CORE)
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
check("hidden translator rows drop their forced divider wrapper too",
    /\.setting-group:has\(\[data-setting-id="BadaUtils\.TranslationBlacklist"\]\),\s*\.setting-group:has\(\[data-setting-id="BadaUtils\.TranslationWhitelist"\]\) \{\s*display: none !important;/.test(CORE)
    && /div\[data-setting-id="BadaUtils\.TranslationBlacklist"\]/.test(CORE));

// REGRESSION: the Global-Presets block is ONE feature (글로벌 프리셋 toggle + its
// 프리셋 뱃지 위치 dropdown + the presets panel), so ComfyUI's forced divider above the
// badge-position row and above the panel must be painted away. The divider is a DIRECT
// child of .setting-group (confirmed via dev_tests/probe_direct_children.cjs:
// dividerDepth 1 for every Bada row), hence the "> .my-8" combinator. Measured live with
// dev_tests/verify_badge_lines.cjs: those two rows report border-top-color rgba(0,0,0,0)
// while every other Bada row stays rgba(255,255,255,0.08).
check("the two Global-Presets dividers are painted transparent",
    /\.setting-group:has\(\[data-setting-id="BadaUtils\.PresetBadgePosition"\]\) > \.my-8,\s*\.setting-group:has\(\[data-setting-id="BadaUtils\.GlobalPresetsPanel"\]\) > \.my-8 \{\s*border-top-color: transparent !important;/.test(CORE));

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

