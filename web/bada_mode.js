/**
 * ComfyUI-Bada-Utils · bada_mode.js
 *
 * (P0) Render-mode instrumentation for the Nodes 2.0 program.
 *
 * WHAT IT DOES
 *   Detects whether the canvas draws with the legacy LiteGraph renderer or with
 *   Nodes 2.0 (Vue DOM nodes), exposes the raw signal matrix for debugging, and
 *   shows a small status badge in the bottom-left corner.
 *
 * WHY IT EXISTS
 *   The frontend binds heavily to internals (app.graph, app.canvas, node.size,
 *   absolute DOM overlays) whose behaviour differs per renderer. Before migrating
 *   anything we need one trustworthy mode check, plus visibility into what the
 *   real user environment actually looks like (renderer, versions, Impact Pack).
 *
 * SAFETY CONTRACT
 *   This module OBSERVES ONLY. It patches nothing and hooks nothing; every probe
 *   is wrapped so a missing internal can never break startup.
 *
 * DETECTION POLICY
 *   Trust only empirically proven signals for the verdict, record the rest as
 *   context. The whole ComfyUI UI is already Vue, so [data-v-app] and PrimeVue
 *   classes say nothing about the NODE renderer and are never mode evidence.
 *   Verdict signal: Nodes 2.0 renders every node as a DOM element carrying
 *   .lg-node[data-node-id] -- the same handle bada_note_helper.js injects into.
 */
import { app } from "../../scripts/app.js";

export const MODE_LEGACY = "legacy";
export const MODE_VUE_NODES = "vueNodes";
export const MODE_UNKNOWN = "unknown";

const LS_BADGE = "BadaUtils.Mode.Badge";
const BADGE_ATTR = "data-bada-mode-root";
const STYLE_ID = "bada-mode-style";

// Node type names that only Impact Pack registers. An indirect guess at whether
// Impact Pack is installed, because that is the second axis of the P4 matrix.
const IMPACT_PROBE_TYPES = ["ImageScaleBy", "ImagePadForOutpaintMasked", "InpaintModelConditioning"];

// Renderer-like setting ids are scanned out of stored settings instead of being
// hardcoded: the exact id differs across frontend builds, so guessing one lies.
const MODE_SETTING_PATTERN = /(vue|node2|node\.2|nodes2|litegraph)/i;

// Probe on a decaying schedule, then stop. No permanent observer lives here (see
// the observer-consolidation note in the handover).
const SETTLE_SCHEDULE = [0, 400, 1500, 4000, 9000, 16000];

const listeners = new Set();

let latest = null;
let settleTimer = null;
let badgeRoot = null;
let detailOpen = false;
let announced = false;

// ────────────────────────────────────────────────────────────────────────────
//  Probes (read-only)
// ────────────────────────────────────────────────────────────────────────────
function safe(fn, fallback) {
    try {
        const value = fn();
        return value === undefined ? fallback : value;
    } catch (e) {
        return fallback;
    }
}

// Only an explicit ON counts as evidence. A stored "disabled" / "auto" /
// "legacy" must never read as "Nodes 2.0 is on", or the verdict lies.
function isExplicitlyOn(value) {
    if (value === true || value === 1) return true;
    if (typeof value !== "string") return false;
    const text = value.trim().toLowerCase();
    return text === "true" || text === "1" || text === "on" || text === "enabled" || text === "vue";
}

function readStoredRendererSettings() {
    const raw = safe(function () { return localStorage.getItem("Comfy.Settings"); }, null);
    if (!raw) return [];
    const parsed = safe(function () { return JSON.parse(raw); }, null);
    if (!parsed || typeof parsed !== "object") return [];
    const hits = [];
    Object.keys(parsed).forEach(function (key) {
        if (!MODE_SETTING_PATTERN.test(key)) return;
        let value = parsed[key];
        if (value && typeof value === "object" && "value" in value) value = value.value;
        hits.push({ key: key, value: value, enabled: isExplicitlyOn(value) });
    });
    return hits;
}

function countVueNodeElements() {
    return safe(function () { return document.querySelectorAll(".lg-node[data-node-id]").length; }, 0);
}

const NO_CANVAS = { present: false, hasCtx: false, hasGraph: false, ctor: null };

function legacyCanvasSignals() {
    return safe(function () {
        const canvas = app && app.canvas;
        if (!canvas) return NO_CANVAS;
        return {
            present: true,
            hasCtx: !!(canvas.ctx && typeof canvas.ctx === "object"),
            hasGraph: !!canvas.graph,
            ctor: safe(function () { return canvas.constructor ? canvas.constructor.name : null; }, null)
        };
    }, NO_CANVAS);
}

function impactPackSignals() {
    const registry = safe(function () {
        return (window.LiteGraph && window.LiteGraph.registered_node_types) || null;
    }, null);
    const matched = [];
    if (registry) {
        IMPACT_PROBE_TYPES.forEach(function (name) {
            if (Object.prototype.hasOwnProperty.call(registry, name)) matched.push(name);
        });
    }
    let verdict = "unknown";
    if (matched.length >= 2) verdict = "likelyInstalled";
    else if (!registry) verdict = "nodeDefsNotLoaded";
    else if (matched.length === 0) verdict = "likelyAbsent";
    return { matched: matched, registrySeen: !!registry, verdict: verdict };
}

// Read-only health check of the Impact Pack stack contract owned by
// blank_startup.js: the LGraph.configure wrapper name must keep loadGraphData.
function configureContractSignals() {
    const fn = safe(function () {
        return window.LGraph && window.LGraph.prototype && window.LGraph.prototype.configure;
    }, null);
    const name = typeof fn === "function" ? String(fn.name || "") : "";
    return {
        present: typeof fn === "function",
        name: name,
        contractOk: name.indexOf("loadGraphData") !== -1
    };
}

function versionSignals() {
    return {
        frontend: safe(function () { return window.__COMFYUI_FRONTEND_VERSION__ || null; }, null),
        backend: safe(function () { return window.__badaModeBackendVersion || null; }, null),
        api: safe(function () { return !!(app && app.api); }, false)
    };
}

// The frontend build number is the single most useful line in a Nodes 2.0 bug
// report, so grab the backend version we can reach and label it clearly.
function fetchBackendVersion() {
    const assign = function (value) {
        if (value) window.__badaModeBackendVersion = value;
        notify(detect({ reason: "backendVersion" }));
    };
    const viaApi = safe(function () {
        if (app && app.api && typeof app.api.getAppVersion === "function") return app.api.getAppVersion();
        return null;
    }, null);
    if (viaApi && typeof viaApi.then === "function") {
        viaApi.then(assign).catch(function () { return null; });
        return;
    }
    safe(function () {
        return fetch("./api/version", { cache: "no-store" })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (json) { assign(json && json.v ? String(json.v) : null); })
            .catch(function () { return null; });
    }, null);
}

// ────────────────────────────────────────────────────────────────────────────
//  Detection
// ────────────────────────────────────────────────────────────────────────────
export function detect(opts) {
    const options = opts || {};
    const vueNodeCount = countVueNodeElements();
    const canvas = legacyCanvasSignals();
    const stored = readStoredRendererSettings();
    const enabledStored = stored.filter(function (item) { return item.enabled; });

    let mode = MODE_UNKNOWN;
    let confidence = "none";

    if (vueNodeCount > 0) {
        mode = MODE_VUE_NODES;
        confidence = "high";
    } else if (enabledStored.length > 0) {
        // A renderer setting is on but no Vue node DOM exists yet (empty canvas,
        // or Nodes 2.0 mounts late). Never claim legacy on an empty graph.
        mode = MODE_VUE_NODES;
        confidence = "pendingDom";
    } else if (canvas.present && canvas.hasCtx) {
        mode = MODE_LEGACY;
        confidence = "medium";
    }

    return {
        mode: mode,
        confidence: confidence,
        reason: options.reason || "detect",
        detectedAt: Date.now(),
        signals: {
            vueNodeElements: vueNodeCount,
            legacyCanvas: canvas,
            storedRendererSettings: stored,
            impactPack: impactPackSignals(),
            configureContract: configureContractSignals(),
            vueUiRoot: safe(function () { return !!document.querySelector("[data-v-app]"); }, false),
            versions: versionSignals(),
            apiRoot: safe(function () { return !!window.comfyAPI; }, false)
        }
    };
}

export function get() {
    return latest;
}

function notify(result) {
    if (!result) return;
    latest = result;
    listeners.forEach(function (fn) { safe(function () { return fn(result); }); });
    if (!announced && result.confidence === "high") {
        announced = true;
        console.info("[BadaMode] renderer=" + result.mode + " " + JSON.stringify(summarize(result)));
    }
    safe(renderBadge);
}

export function onModeChange(fn) {
    if (typeof fn !== "function") return function () {};
    listeners.add(fn);
    if (latest) safe(function () { return fn(latest); });
    return function () { listeners.delete(fn); };
}

function summarize(result) {
    const s = result.signals;
    return {
        dom: s.vueNodeElements,
        canvas: s.legacyCanvas.hasCtx,
        impactPack: s.impactPack.verdict,
        configure: s.configureContract.present ? (s.configureContract.contractOk ? "ok" : "BROKEN") : "absent",
        backend: s.versions.backend || "?",
        frontend: s.versions.frontend || "?"
    };
}

function startProbing() {
    fetchBackendVersion();
    if (settleTimer) clearTimeout(settleTimer);
    let index = 0;
    const step = function () {
        const result = detect({ reason: "settle-" + index });
        notify(result);
        index += 1;
        const settled = result.mode !== MODE_UNKNOWN && result.confidence === "high";
        if (settled || index >= SETTLE_SCHEDULE.length) {
            settleTimer = null;
            return;
        }
        settleTimer = setTimeout(step, SETTLE_SCHEDULE[index] - SETTLE_SCHEDULE[index - 1]);
    };
    step();
}

// ────────────────────────────────────────────────────────────────────────────
//  Report + debug badge
// ────────────────────────────────────────────────────────────────────────────
function buildReport(result) {
    if (!result) return "BadaMode: no probe yet";
    const s = result.signals;
    const lines = [];
    const push = function (key, value) { lines.push(key + ": " + value); };

    push("renderer", result.mode + " (" + result.confidence + ")");
    push("reason", result.reason);
    push("vueNodeElements", s.vueNodeElements);
    push("legacyCanvas", s.legacyCanvas.present
        ? "present ctx=" + s.legacyCanvas.hasCtx + " graph=" + s.legacyCanvas.hasGraph + " ctor=" + s.legacyCanvas.ctor
        : "absent");
    push("vueUiRoot", s.vueUiRoot);
    push("comfyAPI", s.apiRoot);
    push("backend", s.versions.backend || "unknown");
    push("frontendPkg", s.versions.frontend || "unknown (not exposed by build)");
    push("impactPack", s.impactPack.verdict + (s.impactPack.matched.length ? " [" + s.impactPack.matched.join(", ") + "]" : ""));
    push("configure.name", s.configureContract.name || "(none)");
    push("configure.contract", !s.configureContract.present
        ? "no LGraph.configure wrapper"
        : (s.configureContract.contractOk ? "OK (loadGraphData kept)" : "BROKEN - see blank_startup.js patchLGraph()"));
    if (s.storedRendererSettings.length) {
        lines.push("stored renderer settings:");
        s.storedRendererSettings.forEach(function (item) {
            lines.push("  " + item.key + " = " + item.value + (item.enabled ? "   <- on" : ""));
        });
    } else {
        lines.push("stored renderer settings: (none matched)");
    }
    lines.push("userAgent: " + navigator.userAgent);
    return lines.join("\n");
}

export function report() {
    const text = buildReport(latest);
    console.log("[BadaMode]\n" + text);
    return text;
}

function copyText(text) {
    const done = safe(function () {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text);
            return true;
        }
        return false;
    }, false);
    if (done) return;
    safe(function () {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
    });
}

function badgeEnabled() {
    const stored = safe(function () { return localStorage.getItem(LS_BADGE); }, null);
    return stored === null ? true : stored === "1";
}

export function setBadgeEnabled(enabled) {
    safe(function () { localStorage.setItem(LS_BADGE, enabled ? "1" : "0"); });
    safe(renderBadge);
}

const CSS_RULES = [
    ".bada-mode-root{position:fixed;left:10px;bottom:10px;z-index:2147483000;font-family:ui-monospace,Consolas,Menlo,monospace;font-size:11px;line-height:1.45;color:#dff6ff;background:rgba(12,16,22,.86);border:1px solid rgba(0,240,255,.45);border-radius:7px;padding:3px 8px;box-shadow:0 2px 10px rgba(0,0,0,.45);cursor:pointer;user-select:none;max-width:min(62vw,560px);}",
    ".bada-mode-root b{color:#00f0ff;font-weight:700;}",
    ".bada-mode-root.is-legacy b{color:#ffb86b;}",
    ".bada-mode-root.is-unknown b{color:#ff7b7b;}",
    ".bada-mode-detail{margin-top:6px;border-top:1px solid rgba(255,255,255,.18);padding-top:5px;white-space:pre;display:none;max-height:46vh;overflow:auto;cursor:text;}",
    ".bada-mode-root.is-open .bada-mode-detail{display:block;}",
    ".bada-mode-actions{display:flex;gap:6px;margin-top:5px;}",
    ".bada-mode-actions button{font:inherit;color:#dff6ff;background:rgba(0,240,255,.12);border:1px solid rgba(0,240,255,.4);border-radius:4px;padding:1px 7px;cursor:pointer;}"
];

function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS_RULES.join("\n");
    document.head.appendChild(style);
}

function makeAction(label, handler) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.setAttribute("data-bada-mode-action", label);
    btn.addEventListener("click", function (event) {
        event.stopPropagation();
        handler();
    });
    return btn;
}

function renderBadge() {
    if (typeof document === "undefined" || !document.body) return;

    if (!badgeEnabled()) {
        if (badgeRoot && badgeRoot.parentNode) badgeRoot.parentNode.removeChild(badgeRoot);
        badgeRoot = null;
        return;
    }

    ensureStyle();

    if (!badgeRoot || !badgeRoot.isConnected) {
        badgeRoot = document.createElement("div");
        badgeRoot.setAttribute(BADGE_ATTR, "1");
        badgeRoot.addEventListener("click", function () {
            detailOpen = !detailOpen;
            safe(renderBadge);
        });
        document.body.appendChild(badgeRoot);
    }

    const result = latest;
    const tone = !result || result.mode === MODE_UNKNOWN
        ? "unknown"
        : (result.mode === MODE_LEGACY ? "legacy" : "vue");

    badgeRoot.className = "bada-mode-root is-" + tone + (detailOpen ? " is-open" : "");
    badgeRoot.textContent = "";

    const head = document.createElement("div");
    const label = document.createElement("b");
    label.textContent = modeLabel(result);
    head.appendChild(label);
    const extra = document.createElement("span");
    extra.textContent = result
        ? "  ·  IPack " + result.signals.impactPack.verdict.replace("likely", "~") + "  ·  click for signals"
        : "  ·  probing";
    head.appendChild(extra);
    badgeRoot.appendChild(head);

    const detail = document.createElement("div");
    detail.className = "bada-mode-detail";
    detail.textContent = buildReport(result);
    badgeRoot.appendChild(detail);

    const actions = document.createElement("div");
    actions.className = "bada-mode-actions";
    actions.appendChild(makeAction("copy", function () { copyText(report()); }));
    actions.appendChild(makeAction("re-probe", function () { notify(detect({ reason: "badge" })); }));
    actions.appendChild(makeAction("hide", function () { setBadgeEnabled(false); }));
    badgeRoot.appendChild(actions);
}

function modeLabel(result) {
    if (!result) return "mode: ...";
    if (result.mode === MODE_VUE_NODES) return "Bada · Nodes 2.0";
    if (result.mode === MODE_LEGACY) return "Bada · Legacy canvas";
    return "Bada · mode: unknown";
}

// ────────────────────────────────────────────────────────────────────────────
//  Public surface (console + future P2 compat layer)
// ────────────────────────────────────────────────────────────────────────────
export const BadaMode = {
    MODE_LEGACY: MODE_LEGACY,
    MODE_VUE_NODES: MODE_VUE_NODES,
    MODE_UNKNOWN: MODE_UNKNOWN,
    detect: detect,
    get: get,
    onModeChange: onModeChange,
    report: report,
    setBadgeEnabled: setBadgeEnabled
};

safe(function () { window.BadaMode = BadaMode; });

function registerProbeExtension() {
    if (!app || typeof app.registerExtension !== "function") return;
    app.registerExtension({
        name: "ComfyUI.BadaUtils.RenderModeProbe",
        async setup() {
            startProbing();
        },
        // A workflow load can create the first Vue node DOM or flip the renderer,
        // so re-probe once the graph finished configuring.
        async afterConfigureGraph() {
            if (settleTimer) return;
            notify(detect({ reason: "afterConfigureGraph" }));
        }
    });
}

safe(registerProbeExtension);