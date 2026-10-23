/**
 * ComfyUI-Bada-Utils · bada_compat.js
 *
 * (P2) Defensive adapter for the Nodes 2.0 program.
 *
 * WHY IT EXISTS
 *   Nodes 2.0 keeps the legacy LiteGraph canvas but ALSO ships a second, Vue
 *   DOM-node renderer. Several internal contracts we depend on change shape in
 *   that mode:
 *     - node.id becomes a branded string NodeId, so a number stored in an old
 *       workflow/preset no longer strict-matches a live node.id.
 *     - node.widgets can be undefined until the first assignment.
 *     - node.size only reports the requested size; the real render extent comes
 *       from getBounding().
 *     - LGraph.configure() requires an active Pinia store, and web/blank_startup.js
 *       already owns the Impact Pack stack-inspection wrapper for it. This module
 *       never re-wraps configure; it only reports whether that contract looks intact.
 *
 * SAFETY CONTRACT
 *   Pure helpers + read-only probes. Nothing here patches a prototype, hooks a
 *   DOM node, or mutates the app. Importing it is a no-op beyond defining
 *   functions and exposing window.BadaCompat. Mode is delegated to window.BadaMode
 *   (bada_mode.js) so we never re-detect the renderer twice or diverge.
 *
 * USAGE
 *   import { isSameId, widgets, bounding } from "./bada_compat.js";
 *   window.BadaCompat.selfTest() // diagnostics for the Node 2.0 smoke sheet
 */
import { app } from "../../scripts/app.js";

// Impact Pack stack-inspection contract string, mirrored (read-only) from
// web/blank_startup.js. We must contain it, blank_startup.js must keep it.
const IMPACT_STACK_CONTRACT = "loadGraphData";

// ──────────────────────────────────────────────────────────────────────────────
//  Core utility
// ──────────────────────────────────────────────────────────────────────────────
export function safe(fn, fallback) {
    try {
        const value = fn();
        return value === undefined ? fallback : value;
    } catch (_) {
        return fallback;
    }
}

// ──────────────────────────────────────────────────────────────────────────────
//  Node identity (Nodes 2.0 brands node.id as a string)
// ──────────────────────────────────────────────────────────────────────────────
// Returns a normalized string id for a node, or null when absent. Never throws
// on a missing/odd node so it is safe inside hot loops.
export function nodeId(node) {
    if (!node) return null;
    const id = node.id;
    if (id === undefined || id === null) return null;
    return String(id);
}

// Type-tolerant id equality. True only when both are present and stringify
// equal. Guards the classic Nodes 2.0 break of "5" === 5 (number preset id read
// back from a legacy workflow compared against a live string node.id).
export function isSameId(a, b) {
    if (a === undefined || a === null || b === undefined || b === null) return false;
    return String(a) === String(b);
}

// ──────────────────────────────────────────────────────────────────────────────
//  Widgets (node.widgets may be undefined before first assignment)
// ──────────────────────────────────────────────────────────────────────────────
// Always returns a real array so callers can .find/.some/.forEach unguarded.
export function widgets(node) {
    const list = node && node.widgets;
    return Array.isArray(list) ? list : [];
}

// First widget whose name matches, or (when name is a function) matches via the
// predicate. Returns undefined when nothing matches.
export function findWidget(node, nameOrPredicate) {
    const list = widgets(node);
    if (typeof nameOrPredicate === "function") {
        return list.find((w) => w && nameOrPredicate(w));
    }
    return list.find((w) => w && w.name === nameOrPredicate);
}

// ──────────────────────────────────────────────────────────────────────────────
//  Geometry (node.size = requested only; getBounding() = real render extent)
// ──────────────────────────────────────────────────────────────────────────────
// getBounding() output shape has varied across frontends. Accept both
// [x, y, w, h] and [w, h]; fall back to node.size when unavailable.
function boundingArray(node) {
    const gb = node && typeof node.getBounding === "function"
        ? safe(() => node.getBounding([0, 0, 0, 0]), null)
        : null;
    if (Array.isArray(gb) && gb.length >= 4) {
        const w = gb[2];
        const h = gb[3];
        if (typeof w === "number" && typeof h === "number") return [w, h];
    }
    if (Array.isArray(gb) && gb.length >= 2) {
        const w = gb[0];
        const h = gb[1];
        if (typeof w === "number" && typeof h === "number") return [w, h];
    }
    const size = node && node.size;
    if (Array.isArray(size) && size.length >= 2) return [size[0], size[1]];
    return [0, 0];
}

// Real bounding size as [width, height].
export function bounding(node) {
    return boundingArray(node);
}

export function width(node) {
    return boundingArray(node)[0];
}

export function height(node) {
    return boundingArray(node)[1];
}

// ──────────────────────────────────────────────────────────────────────────────
//  Mode (delegated to bada_mode.js so we never detect twice)
// ──────────────────────────────────────────────────────────────────────────────
export function mode() {
    return safe(() => {
        const bm = window.BadaMode;
        if (!bm) return "unknown";
        const current = bm.get ? bm.get() : bm.detect ? bm.detect() : null;
        return (current && current.mode) || bm.MODE_UNKNOWN || "unknown";
    }, "unknown");
}

export function isVueNodes() {
    const bm = window.BadaMode;
    const vue = bm ? bm.MODE_VUE_NODES : "vueNodes";
    return mode() === vue;
}

export function isLegacy() {
    const bm = window.BadaMode;
    const legacy = bm ? bm.MODE_LEGACY : "legacy";
    return mode() === legacy;
}

// ──────────────────────────────────────────────────────────────────────────────
//  Settings + sidebar (shape drifts between frontend builds)
// ──────────────────────────────────────────────────────────────────────────────
// Register a setting, degrading gracefully. On the first throw we retry with a
// shallow clone (some builds choke on a stale options/renderer reference). Mirrors
// the safeAddSetting behavior already used by web/bada_core.js.
export function addSetting(config) {
    if (!config) return false;
    const api = safe(() => app.ui.settings, null);
    if (!api || typeof api.addSetting !== "function") {
        console.warn("[BadaCompat] settings API unavailable; skipped:", config.id);
        return false;
    }
    const primary = safe(() => { api.addSetting(config); return true; }, false);
    if (primary) return true;
    const cloned = { ...config };
    return safe(() => { api.addSetting(cloned); return true; }, false) === true;
}

export function getSetting(id, fallback) {
    return safe(() => app.ui.settings.getSettingValue(id, fallback), fallback);
}

export function setSetting(id, value) {
    return safe(() => {
        app.ui.settings.setSettingValue(id, value);
        return true;
    }, false) === true;
}

export function registerSidebarTab(config) {
    if (!config) return false;
    const mgr = safe(() => app.extensionManager, null);
    if (!mgr || typeof mgr.registerSidebarTab !== "function") {
        console.warn("[BadaCompat] extensionManager.registerSidebarTab unavailable:", config.id);
        return false;
    }
    return safe(() => {
        mgr.registerSidebarTab(config);
        return true;
    }, false) === true;
}

// ──────────────────────────────────────────────────────────────────────────────
//  Graph access
// ──────────────────────────────────────────────────────────────────────────────
export function nodes() {
    const graph = safe(() => app.graph, null);
    if (!graph) return [];
    if (Array.isArray(graph._nodes)) return graph._nodes;
    if (Array.isArray(graph.nodes)) return graph.nodes;
    return [];
}

// getNodeById is an object-key lookup in LiteGraph so it tolerates number/string,
// but we keep a guarded wrapper so callers never touch app.graph directly.
export function nodeById(id) {
    if (id === undefined || id === null) return null;
    return safe(() => app.graph.getNodeById(id), null);
}

// ──────────────────────────────────────────────────────────────────────────────
//  Impact Pack configure contract (read-only complement to blank_startup.js)
// ──────────────────────────────────────────────────────────────────────────────
// blank_startup.js owns the LGraph.configure wrapper and its name-based stack
// contract. We only READ it so the compat layer / smoke sheet can report whether
// that contract currently looks intact. This function NEVER patches anything.
export function impactConfigureOk() {
    return safe(() => {
        const L = window.LGraph;
        const wrapper = L && L.prototype && L.prototype.configure;
        if (typeof wrapper !== "function") return false;
        return (wrapper.name || "").indexOf(IMPACT_STACK_CONTRACT) !== -1;
    }, false) === true;
}

// ──────────────────────────────────────────────────────────────────────────────
//  Self-test (for console + the Nodes 2.0 smoke sheet)
// ──────────────────────────────────────────────────────────────────────────────
export function selfTest() {
    return {
        mode: mode(),
        isVueNodes: isVueNodes(),
        isLegacy: isLegacy(),
        hasSettingsApi: safe(() => typeof app.ui.settings.addSetting === "function", false),
        hasSidebarApi: safe(() => typeof app.extensionManager.registerSidebarTab === "function", false),
        impactConfigureOk: impactConfigureOk(),
        widgetsOfNull: widgets(null).length,
        idTolerant: isSameId("5", 5) && !isSameId(null, 0),
        boundingOfNull: bounding(null)
    };
}

export const BadaCompat = {
    safe,
    nodeId,
    isSameId,
    widgets,
    findWidget,
    bounding,
    width,
    height,
    mode,
    isVueNodes,
    isLegacy,
    addSetting,
    getSetting,
    setSetting,
    registerSidebarTab,
    nodes,
    nodeById,
    impactConfigureOk,
    selfTest
};

safe(() => { window.BadaCompat = BadaCompat; });

// Observe-only registration so the smoke sheet can read a one-line status without
// importing the module from the console. It patches nothing.
safe(() => {
    if (!app || typeof app.registerExtension !== "function") return;
    app.registerExtension({
        name: "ComfyUI.BadaUtils.Compat",
        async setup() {
            console.log("[BadaCompat] active", selfTest());
        }
    });
});