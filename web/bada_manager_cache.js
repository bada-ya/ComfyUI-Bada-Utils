import { app } from "../../scripts/app.js";

/**
 * ComfyUI-Bada-Utils · bada_manager_cache.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Warms ComfyUI-Manager's node-name cache once a day, but ONLY while the legacy
 * manager UI is the one running.
 *
 * ── Why ────────────────────────────────────────────────────────────────────
 * Manager 4.x ships two independent backends:
 *     comfyui_manager/glob/manager_core.py    <- current UI
 *     comfyui_manager/legacy/manager_core.py  <- --enable-manager-legacy-ui
 *
 * Both expose the same read-only endpoint /v2/customnode/getmappings. The
 * divergence is in how each resolves its data file (get_data_by_mode):
 *     if mode == "cache" and is_file_created_within_one_day(cache_uri):
 *         json_obj = await manager_util.get_data(cache_uri)   # local, no network
 *     else:
 *         json_obj = await manager_util.get_data(uri)          # network download
 *
 * and in the CNR loader (cnr_utils._get_cnr_data):
 *     if dont_wait and cache_state == 'not-cached':
 *         return {}          # <-- the legacy path gives up here
 *
 * is_file_created_within_one_day() returns False for a file that does not exist
 * yet, so the first run after a fresh install must download over the network.
 * The legacy UI reads it with dont_wait=True, so when absent it returns an EMPTY
 * mapping instead of waiting — and every custom node name silently vanishes
 * from search. Hence the reported sequence:
 *   1. boot legacy  -> names missing (cache empty)
 *   2. boot modern  -> names appear  (blocking download WRITES the cache file)
 *   3. boot legacy  -> names still appear (now cache_state == 'cached')
 * The cache is not invalidated wrongly; it is simply missing on first boot.
 *
 * ── What this does ──────────────────────────────────────────────────────────
 * On boot, if the legacy UI is active and we have not refreshed today, issue one
 * `mode=remote` request per file. That takes the network branch in
 * get_data_by_mode(), which downloads and persists through Manager's own
 * `cache_lock`. By the time the user opens Manager the cache is fresh, so the
 * legacy UI takes the cached branch and node names resolve.
 *
 * Two files are warmed (Plan B):
 *   - extension-node-map.json (1.5 MB) node name -> package. Fixes the search.
 *   - custom-node-list.json   (1.8 MB) catalogue w/ title, description, author.
 *     Pre-warming keeps the first list render instant.
 */

const LEGACY_CACHE_SETTING_ID = "BadaUtils.LegacyManagerCacheRefresh";
const LAST_REFRESH_KEY = "bada.mgr_cache.legacy.last_date";
/** Full timestamp of the last successful warm-up, for display in the settings UI. */
const LAST_REFRESH_AT_KEY = "bada.mgr_cache.legacy.last_at";

/**
 * Manager data files to warm, in priority order.
 *
 * `extension-node-map.json` (node name -> package) is the file that actually
 * fixes search, and BOTH backends expose /v2/customnode/getmappings.
 *
 * `custom-node-list.json` (the catalogue behind the node list) is only reachable
 * through /v2/customnode/getlist, which exists in the LEGACY backend alone —
 * verified: comfyui_manager/glob/manager_server.py has no such route. So the
 * catalogue is warmed only when the legacy UI is running; on the modern UI that
 * fetch would 404.
 *
 * `skip_update=true` on the catalogue fetch is REQUIRED, not cosmetic. That route
 * computes `skip_update` from the query string and then calls
 * `check_state_of_git_node_pack(node_packs, do_fetch=True, do_update_check=True)`,
 * which runs `git fetch` against EVERY installed non-CNR pack. Warming the cache
 * must not drag the user's whole custom_nodes tree over the network once a day —
 * and the Manager UI itself sends the same flag for every load but the explicit
 * "Check for updates" view (js/custom-nodes-manager.js:1956), so the warm-up now
 * costs exactly one HTTP round trip and nothing else.
 */
const TARGET_NODE_MAP = { url: "/v2/customnode/getmappings?mode=remote", label: "extension-node-map.json" };
const TARGET_CATALOG = { url: "/v2/customnode/getlist?mode=remote&skip_update=true", label: "custom-node-list.json" };

function targetsFor(isLegacy) {
    return isLegacy ? [TARGET_NODE_MAP, TARGET_CATALOG] : [TARGET_NODE_MAP];
}

function todayStamp() {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${mm}-${dd}`;
}

function readSettingEnabled() {
    try {
        const value = app?.ui?.settings?.getSettingValue?.(LEGACY_CACHE_SETTING_ID);
        // Undefined means the value has not been read from disk yet. Treat as
        // enabled: the default is true, and this only runs under legacy UI.
        if (value === undefined || value === null) return true;
        return value === true || value === "true";
    } catch (_) {
        console.debug("[Bada ManagerCache] setting read skipped:", _);
        return true;
    }
}

/**
 * Which Manager flavour answers this module's probe — the single gate for everything here.
 *
 * The probe route is itself version-dependent. `/v2/manager/is_legacy_manager_ui` lived in
 * Manager's LEGACY backend package (`comfyui_manager/legacy/manager_server.py`, added by
 * upstream commit 31de92a7), and upstream has since DELETED that package: a current Manager
 * tree is `glob/` only and exposes no `/v2` route at all. On such a Manager the probe 404s
 * AND every other `/v2/` call this module makes (getmappings, getlist) is dead too.
 *
 * Reporting that 404 as "modern UI" was the original bug: the module then did nothing at all
 * while Settings still showed the row as enabled, so the only visible symptom was a
 * node-name cache that never refreshed. Keeping the states apart is what makes that
 * diagnosable — see mountManagerCacheWidget()/paintManagerCacheWidget() in bada_core.js.
 */
export const MODE_LEGACY = "legacy";          // probe says the legacy UI is running
export const MODE_MODERN = "modern";          // probe says the modern UI is running
export const MODE_UNSUPPORTED = "unsupported"; // probe route is gone -> no legacy backend
export const MODE_UNKNOWN = "unknown";        // transient probe failure (restarting, blip)

/**
 * Cached probe result. Only DEFINITIVE answers are cached: a transient `unknown` must not
 * disable the feature for the rest of the session, so it is re-probed on the next ask.
 */
let cachedManagerMode = null;

/** Probe Manager. Never throws — always resolves to one of the four MODE_* values. */
async function detectManagerUiMode() {
    try {
        const res = await fetch("/v2/manager/is_legacy_manager_ui");
        if (!res.ok) {
            console.warn(`[Bada ManagerCache] /v2/manager/is_legacy_manager_ui -> HTTP ${res.status}`
                + " — this Manager has no legacy backend, so the node-name cache warm-up"
                + " cannot run here");
            return MODE_UNSUPPORTED;
        }
        const data = await res.json();
        if (data?.is_legacy_manager_ui === true) return MODE_LEGACY;
        if (data?.is_legacy_manager_ui === false) return MODE_MODERN;
        return MODE_UNKNOWN; // 200 but no usable flag — ask again later
    } catch (err) {
        console.warn("[Bada ManagerCache] could not detect manager UI:", err);
        return MODE_UNKNOWN;
    }
}

function alreadyRefreshedToday() {
    try {
        return localStorage.getItem(LAST_REFRESH_KEY) === todayStamp();
    } catch (_) {
        // Private mode — fall back to "not yet", costing one extra refresh per boot.
        return false;
    }
}

function markRefreshedToday() {
    try {
        localStorage.setItem(LAST_REFRESH_KEY, todayStamp());
        // Keep a human-readable timestamp alongside the guard so the settings row
        // can show when the cache was last rebuilt.
        localStorage.setItem(LAST_REFRESH_AT_KEY, new Date().toISOString());
    } catch (_) { /* private mode: the guard simply never latches */ }
}

/** When the cache was last warmed, as a Date — or null if it never has been. */
export function getLastRefreshDate() {
    try {
        const iso = localStorage.getItem(LAST_REFRESH_AT_KEY);
        if (!iso) return null;
        const parsed = new Date(iso);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    } catch (_) {
        return null;
    }
}

/**
 * Which Manager flavour is loaded: "legacy" | "modern" | "unsupported" | "unknown".
 *
 * Cached on purpose: the settings widget repaints on every language switch and every
 * settings rebuild, and the probe used to be re-fetched each time. Now the first call
 * costs one GET and every later call is a resolved promise.
 */
export async function getManagerUiMode() {
    if (cachedManagerMode === null) cachedManagerMode = await detectManagerUiMode();
    return cachedManagerMode;
}

/**
 * Boolean gate for the refresh paths: ONLY a confirmed legacy UI may warm the cache.
 * Fail-closed by construction — "modern", "unsupported" and "unknown" are all false.
 */
async function isLegacyManagerActive() {
    return (await getManagerUiMode()) === MODE_LEGACY;
}
/**
 * Fetch one Manager data file with mode=remote. The body is deliberately never
 * parsed: Manager has written the cache by the time the response arrives, so the
 * JSON is discarded to keep ~3 MB out of the JS heap.
 */
async function warmTarget(target) {
    try {
        const res = await fetch(target.url);
        if (!res.ok) {
            console.warn(`[Bada ManagerCache] ${target.label} -> HTTP ${res.status}`);
            return false;
        }
        console.info(`[Bada ManagerCache] ${target.label} cache refreshed`);
        return true;
    } catch (err) {
        console.warn(`[Bada ManagerCache] ${target.label} refresh failed:`, err);
        return false;
    }
}

/**
 * Rebuild Manager's cache files over the network.
 *
 * @param {object}  [options]
 * @param {boolean} [options.force]  Skip the once-a-day guard (the manual button).
 * @param {boolean} [options.requireLegacy]  Only run under the legacy UI. This is
 *   the default for the automatic boot path, because the automatic refresh exists
 *   solely to work around the legacy UI's `dont_wait` early return. The manual
 *   button passes false: warming `extension-node-map.json` is useful on the modern
 *   UI too (it makes the first Manager open instant instead of a cold download).
 *
 * @returns {Promise<{ok: boolean, legacy: boolean, refreshed: string[], failed: string[]}>}
 */
export async function refreshLegacyManagerCache(options = {}) {
    const { force = false, requireLegacy = true } = options;

    const mode = await getManagerUiMode();
    const legacy = mode === MODE_LEGACY;

    // Every warm target is a /v2/ route, so on a Manager that dropped the legacy backend
    // there is provably nothing to warm. Bail BEFORE spending two doomed requests — this is
    // also what stops the manual button from reporting a bare "Failed" with no reason.
    if (mode === MODE_UNSUPPORTED) {
        console.info("[Bada ManagerCache] Manager mode \"unsupported\" — nothing to do");
        return { ok: false, legacy, mode, refreshed: [], failed: [] };
    }
    if (requireLegacy && !legacy) {
        console.info(`[Bada ManagerCache] Manager mode "${mode}" — automatic warm-up skipped`);
        return { ok: false, legacy, mode, refreshed: [], failed: [] };
    }
    if (!force && !readSettingEnabled()) {
        console.info("[Bada ManagerCache] disabled by setting — skipped");
        return { ok: false, legacy, mode, refreshed: [], failed: [] };
    }
    if (!force && alreadyRefreshedToday()) {
        console.info("[Bada ManagerCache] already refreshed today — skipped");
        return { ok: false, legacy, mode, refreshed: [], failed: [] };
    }

    const refreshed = [];
    const failed = [];
    for (const target of targetsFor(legacy)) {
        if (await warmTarget(target)) refreshed.push(target.label);
        else failed.push(target.label);
    }

    // Latch only when the file that fixes search succeeded, so a partial failure
    // is retried next boot instead of being suppressed for a whole day.
    if (refreshed.includes(TARGET_NODE_MAP.label)) markRefreshedToday();
    return { ok: failed.length === 0 && refreshed.length > 0, legacy, mode, refreshed, failed };
}

/**
 * Register the extension. The automatic refresh stays legacy-only: it exists purely
 * to work around the legacy backend's `dont_wait` early return, and firing a
 * multi-megabyte download on every boot for modern-UI users would be waste.
 *
 * The settings row itself is deliberately NOT hidden on the modern UI. The manual
 * "Force refresh" button is genuinely useful there — it turns the first Manager
 * open from a cold multi-megabyte download into a cache hit — so the row stays
 * visible and only the on/off toggle is disabled (it controls the boot-time
 * behaviour, which does not apply to the modern UI).
 *
 * `unsupported` gets its own branch on purpose. detectManagerUiMode() has already
 * logged the 404; this says what it MEANS. Without it the module just silently stopped
 * existing after a Manager update while Settings still showed the row as enabled.
 */
app.registerExtension({
    name: "BadaUtils.ManagerCacheRefresh",

    async setup() {
        try {
            const mode = await getManagerUiMode();
            if (mode === MODE_LEGACY) {
                console.info("[Bada ManagerCache] legacy Manager UI detected");
                await refreshLegacyManagerCache();
            } else if (mode === MODE_UNSUPPORTED) {
                console.warn("[Bada ManagerCache] this Manager version has no legacy backend, so the "
                    + "node-name cache refresh cannot run here (Settings shows the same)");
            } else if (mode === MODE_MODERN) {
                console.info("[Bada ManagerCache] modern Manager UI active — "
                    + "automatic refresh skipped, manual refresh still available in settings");
            } else {
                console.warn("[Bada ManagerCache] could not determine the Manager flavour; "
                    + "automatic refresh skipped for now");
            }
        } catch (err) {
            console.warn("[Bada ManagerCache] skipped:", err);
        }
    },
});