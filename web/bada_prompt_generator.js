/**
 * ⚓ Bada 프롬프트 생성기 (Bada Prompt Generator) — ComfyUI Web Extension
 *
 * - 2단 캐스케이드 콤보: `target` (모델) 선택 시 `submenu` 위젯의 목록이 실시간 교체
 *   (DOM 커스텀 위젯 대신 네이티브 콤보를 사용해 ComfyUI 레이아웃 함정을 회피)
 * - 🔥 증강 / 🔓 무검열 토글: 네이티브 BOOLEAN 위젯 + Studio 스타일 CSS 룩
 * - 🔑 API Key 헤더: Bada Async Gemini Studio 헤더 UI 이식
 *   (localStorage + config.json 자동 동기화 — Queue 실행 시 파이썬 노드가 config.json 을 읽음)
 * - 노드가 반환한 `ui.bada_promptgen_toast` 를 websocket `executed` 이벤트로 받아 토스트 표시
 * - engines_registry.json 기반 (GET /api/bada/promptgen/registry)
 */
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { BadaI18n } from "./bada_i18n.js";

const NODE_CLASS = "BadaPromptGenerator";
const REGISTRY_URL = "/api/bada/promptgen/registry";
const CONFIG_URL = "/api/bada/gemini/config";
const KEY_LS = "bada_gemini_api_key";
const MODEL_LS = "bada_gemini_model";

const FALLBACK_MODELS = [
    { id: "gemini-3.6-flash", name: "⚡ 3.6 Flash (권장 ⭐)", name_en: "⚡ 3.6 Flash (Recommended ⭐)" },
    { id: "gemini-3.1-flash-lite", name: "🚀 3.1 Flash-Lite", name_en: "🚀 3.1 Flash-Lite" },
    { id: "gemini-flash-latest", name: "🌟 Flash Latest", name_en: "🌟 Flash Latest" },
    { id: "gemini-3.8-flash", name: "⚡ 3.8 Flash (프리뷰)", name_en: "⚡ 3.8 Flash (Preview)" },
    { id: "gemini-3.7-flash", name: "⚡ 3.7 Flash", name_en: "⚡ 3.7 Flash" },
    { id: "gemini-3.1-pro-preview", name: "🧠 3.1 Pro", name_en: "🧠 3.1 Pro" },
    { id: "gemini-pro-latest", name: "🧠 Pro Latest", name_en: "🧠 Pro Latest" },
];

const I18N = {
    ko: {
        enhance: "🔥 증강",
        uncensored: "🔓 무검열",
        target: "모델",
        submenu: "서브메뉴",
        request_text: "요청사항 입력란",
        duration: "영상 길이 (초)",
        apiHeader: "🔑 API Key & 우선순위 모델 선택",
        getKey: "발급",
        checkKey: "연결확인",
        testing: "확인중...",
        lsNotice: "LocalStorage 자동 저장",
        manage: "⚙️ 모델 관리…",
        keyRequired: "Gemini API 키를 먼저 입력해 주세요.",
        keyOk: "✅ API 연결 정상",
        keyFail: "❌ API 연결 실패",
        saved: "저장됨",
        manageTip: "대상 모델 / 시스템 프롬프트를 등록·선택·삭제·이동합니다.",
        enhanceTip: "OFF이면 Gemini를 호출하지 않고 요청사항 원문을 그대로 통과시킵니다.",
        uncensoredTip: "BLOCK_NONE + 3-Pass Zero-Refusal 우회 폴백을 활성화합니다.",
        targetTip: "프롬프트를 최적화할 대상 모델을 선택하세요.",
        submenuTip: "선택한 모델에서 사용할 기능(서브모드)을 선택하세요.",
    },
    en: {
        enhance: "🔥 Enhance",
        uncensored: "🔓 Uncensored",
        target: "Target Model",
        submenu: "Submenu",
        request_text: "Request / Instruction",
        duration: "Duration (sec)",
        apiHeader: "🔑 API Key & Priority Model",
        getKey: "Get Key",
        checkKey: "Check",
        testing: "Testing...",
        lsNotice: "Auto-saved to LocalStorage",
        manage: "⚙️ Manage Models…",
        keyRequired: "Please enter your Gemini API key first.",
        keyOk: "✅ API connected",
        keyFail: "❌ API connection failed",
        saved: "Saved",
        manageTip: "Register, select, delete or reorder target models and system prompts.",
        enhanceTip: "When OFF the request text passes through untouched (no Gemini call).",
        uncensoredTip: "Enables BLOCK_NONE plus the 3-Pass zero-refusal fallback.",
        targetTip: "Choose the downstream model to optimize the prompt for.",
        submenuTip: "Choose the capability of the selected model.",
    },
};

function t(key) {
    const isKo = BadaI18n.lang === "ko";
    return (isKo ? I18N.ko : I18N.en)[key] || (isKo ? I18N.ko : I18N.en).request_text;
}

// ---------------------------------------------------------------------------
// Registry cache
// ---------------------------------------------------------------------------
let REGISTRY = null;

async function fetchRegistry(force = false) {
    if (REGISTRY && !force) return REGISTRY;
    try {
        const res = await fetch(`${REGISTRY_URL}?ts=${Date.now()}`);
        const data = await res.json();
        if (data && data.success) REGISTRY = data.registry || data;
    } catch (err) {
        console.warn("[BadaPromptGen] registry fetch failed:", err);
    }
    return REGISTRY;
}

function submenuNamesFor(registry, targetName) {
    if (!registry) return null;
    const targets = registry.targets || [];
    const target = targets.find((x) => x.name === targetName) || targets.find((x) => x.id === targetName);
    if (!target) return null;
    if (target.dynamic === "user_prompts") {
        const names = (registry.user_prompts || []).map((p) => p.name).filter(Boolean);
        return names.length ? names : ["(등록된 프롬프트 없음)"];
    }
    const names = (target.submenus || []).map((s) => s.name).filter(Boolean);
    return names.length ? names : ["일반"];
}

// ---------------------------------------------------------------------------
// Light toast (self-contained — never depends on another extension being loaded)
// ---------------------------------------------------------------------------
function toastHost() {
    let host = document.getElementById("bpg-toast-host");
    if (!host) {
        host = document.createElement("div");
        host.id = "bpg-toast-host";
        host.className = "bpg-toast-host";
        document.body.appendChild(host);
    }
    return host;
}

function showToast(msg, level = "info", ms = 3000) {
    if (!msg) return;
    const host = toastHost();
    const el = document.createElement("div");
    el.className = `bpg-toast bpg-toast--${level}`;
    el.textContent = String(msg);
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add("bpg-toast--in"));
    setTimeout(() => {
        el.classList.remove("bpg-toast--in");
        setTimeout(() => el.remove(), 320);
    }, Math.max(900, ms));
    // keep the stack short
    while (host.children.length > 5) host.removeChild(host.firstElementChild);
}

// ---------------------------------------------------------------------------
// API key / model helpers
//   localStorage  = browser-side source of truth (shared with Gemini Studio)
//   config.json   = server-side mirror the queue node reads (resolve_api_key)
// ---------------------------------------------------------------------------
function readKey() {
    return (localStorage.getItem(KEY_LS) || "").trim();
}

function writeKey(value) {
    const key = (value || "").trim();
    if (key) localStorage.setItem(KEY_LS, key);
    else localStorage.removeItem(KEY_LS);
    return key;
}

function readModel() {
    return (localStorage.getItem(MODEL_LS) || "").trim();
}

function writeModel(value) {
    const model = (value || "").trim();
    if (model) localStorage.setItem(MODEL_LS, model);
    return model;
}

let _syncTimer = null;
function pushToServer(key, model) {
    // debounce — every keystroke must not hit the server
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(async () => {
        const body = {};
        if (typeof key === "string") body.api_key = key;
        if (model) body.default_model = model;
        if (!Object.keys(body).length) return;
        try {
            const res = await fetch(CONFIG_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (!data.success) console.warn("[BadaPromptGen] config.json sync failed:", data.error);
        } catch (err) {
            console.warn("[BadaPromptGen] config.json sync error:", err);
        }
    }, 600);
}

async function pullFromServer() {
    try {
        const res = await fetch(`${CONFIG_URL}?ts=${Date.now()}`);
        const data = await res.json();
        if (!data || !data.success) return null;
        if (!readModel() && data.default_model) writeModel(data.default_model);
        return data;
    } catch (err) {
        return null;
    }
}

async function verifyKey(key) {
    const target = (key || "").trim();
    if (!target) {
        showToast(t("keyRequired"), "warn", 3400);
        return false;
    }
    try {
        const res = await fetch("/api/bada/gemini/test", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: target }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.success) {
            showToast(`${t("keyOk")} · ${data.message || ""}`, "ok", 2600);
            return true;
        }
        showToast(`${t("keyFail")} · ${data.error || "HTTP " + res.status}`, "err", 5200);
        return false;
    } catch (err) {
        showToast(`${t("keyFail")} · ${err.message}`, "err", 5200);
        return false;
    }
}

// ---------------------------------------------------------------------------
// Stylesheet injection
// ---------------------------------------------------------------------------
(function loadStylesheet() {
    const cssHref = new URL("./bada_prompt_generator.css", import.meta.url).href;
    if (document.querySelector('link[data-bada="prompt-generator"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.type = "text/css";
    link.setAttribute("data-bada", "prompt-generator");
    link.href = `${cssHref}?v=${Date.now()}`;
    document.head.appendChild(link);
})();

// ---------------------------------------------------------------------------
// Node DOM header (fixed height — deliberately NOT a flex-fill area, so the
// LiteGraph layout engine can never enter a size feedback loop)
// ---------------------------------------------------------------------------
const HEADER_WIDTH = 400;
const HEADER_HEIGHT = 138;

function el(tag, cls, text) {
    const created = document.createElement(tag);
    if (cls) created.className = cls;
    if (text != null) created.textContent = text;
    return created;
}

function swallow(targetEl) {
    // Keep LiteGraph from dragging / zooming the canvas through the widget
    ["pointerdown", "mousedown", "wheel", "dblclick"].forEach((evt) => {
        targetEl.addEventListener(evt, (e) => e.stopPropagation());
    });
    targetEl.addEventListener("keydown", (e) => e.stopPropagation());
    targetEl.addEventListener("keyup", (e) => e.stopPropagation());
    return targetEl;
}

function modelOptions() {
    const fromRegistry = REGISTRY && Array.isArray(REGISTRY.gemini_models) ? REGISTRY.gemini_models : [];
    const merged = fromRegistry.length ? fromRegistry : FALLBACK_MODELS;
    return merged.map((m) => (typeof m === "string" ? { id: m, name: m } : m));
}

function buildHeader(node, widgets) {
    const root = el("div", "bpg-root");
    swallow(root);

    const title = el("div", "bpg-sec-title", t("apiHeader"));
    title.dataset.i18n = "apiHeader";
    root.appendChild(title);

    // -- API key row -------------------------------------------------------
    const row1 = el("div", "bpg-row");
    const keyInput = el("input", "bpg-key");
    keyInput.type = "password";
    keyInput.placeholder = "AIzaSy…  (Gemini API Key)";
    keyInput.spellcheck = false;
    keyInput.autocomplete = "off";
    keyInput.value = readKey();

    const eye = el("button", "bpg-icon-btn", "👁");
    eye.type = "button";
    eye.title = "표시 / 숨김";
    eye.addEventListener("click", () => {
        keyInput.type = keyInput.type === "password" ? "text" : "password";
        eye.classList.toggle("bpg-icon-btn--on", keyInput.type === "text");
    });

    const issueBtn = el("button", "bpg-btn", t("getKey"));
    issueBtn.type = "button";
    issueBtn.dataset.i18n = "getKey";
    issueBtn.title = "Google AI Studio 에서 키 발급";
    issueBtn.addEventListener("click", () => {
        window.open("https://aistudio.google.com/app/apikey", "_blank", "noopener");
    });

    const testBtn = el("button", "bpg-btn bpg-btn--accent", t("checkKey"));
    testBtn.type = "button";
    testBtn.dataset.i18n = "checkKey";
    testBtn.addEventListener("click", async () => {
        const original = testBtn.textContent;
        testBtn.disabled = true;
        testBtn.textContent = t("testing");
        const key = writeKey(keyInput.value);
        const ok = await verifyKey(key);
        if (ok) pushToServer(key);
        testBtn.disabled = false;
        testBtn.textContent = original;
    });

    keyInput.addEventListener("input", () => pushToServer(writeKey(keyInput.value)));
    keyInput.addEventListener("blur", () => pushToServer(writeKey(keyInput.value)));
    keyInput.addEventListener("paste", () => setTimeout(() => pushToServer(writeKey(keyInput.value)), 30));

    row1.append(keyInput, eye, issueBtn, testBtn);
    root.appendChild(row1);

    // -- priority model row --------------------------------------------------
    const row2 = el("div", "bpg-row");
    const modelSel = el("select", "bpg-select");
    const notice = el("span", "bpg-notice", t("lsNotice"));
    notice.dataset.i18n = "lsNotice";

    function fillModels() {
        const current = readModel() || (REGISTRY && REGISTRY.gemini_model) || FALLBACK_MODELS[0].id;
        modelSel.innerHTML = "";
        for (const m of modelOptions()) {
            const label = BadaI18n.lang === "en" && m.name_en ? m.name_en : m.name;
            const opt = el("option", null, label);
            opt.value = m.id;
            modelSel.appendChild(opt);
        }
        const has = modelSel.querySelector(`option[value="${CSS.escape(current)}"]`);
        modelSel.value = has ? current : FALLBACK_MODELS[0].id;
        writeModel(modelSel.value);
    }

    modelSel.addEventListener("change", () => {
        const model = writeModel(modelSel.value);
        pushToServer(undefined, model);
        showToast(`${t("saved")} · ${model}`, "ok", 1800);
    });
    row2.append(modelSel, notice);
    root.appendChild(row2);

    // -- toggle + manage row -------------------------------------------------
    const row3 = el("div", "bpg-row bpg-row--toggles");
    const cards = {};

    function makeCard(widgetName, labelKey, tipKey) {
        const widget = widgets[widgetName];
        const card = el("div", "bpg-card");
        card.title = t(tipKey);
        const label = el("span", "bpg-card-label", t(labelKey));
        label.dataset.i18n = labelKey;
        const switchEl = el("span", "bpg-switch");
        switchEl.appendChild(el("i"));
        card.append(label, switchEl);
        const paint = () => {
            card.classList.toggle("bpg-card--on", !!widget.value);
            card.title = t(tipKey);
        };
        card.addEventListener("click", () => {
            widget.value = !widget.value;
            paint();
            if (node.onWidgetChanged) node.onWidgetChanged(widget.name, widget.value, !widget.value, widget);
            node.setDirtyCanvas?.(true, true);
        });
        paint();
        cards[widgetName] = { paint };
        return card;
    }

    row3.appendChild(makeCard("enhance", "enhance", "enhanceTip"));
    row3.appendChild(makeCard("uncensored", "uncensored", "uncensoredTip"));

    const manageBtn = el("button", "bpg-btn bpg-btn--manage", t("manage"));
    manageBtn.type = "button";
    manageBtn.dataset.i18n = "manage";
    manageBtn.title = t("manageTip");
    manageBtn.addEventListener("click", async () => {
        manageBtn.disabled = true;
        try {
            const mod = await import("./bada_promptgen_modal.js");
            await mod.openPromptGenModal({
                registry: REGISTRY,
                onSaved: async () => {
                    await fetchRegistry(true);
                    refreshAllNodes();
                },
            });
        } catch (err) {
            console.error("[BadaPromptGen] modal load failed:", err);
            showToast(`⚠️ 모델 관리 모듈을 불러오지 못했습니다: ${err.message}`, "err", 5000);
        } finally {
            manageBtn.disabled = false;
        }
    });
    row3.appendChild(manageBtn);
    root.appendChild(row3);

    const WIDGET_LABELS = ["target", "submenu", "request_text", "duration"];

    function localize() {
        for (const key of WIDGET_LABELS) {
            const w = widgets[key];
            if (!w) continue;
            const text = t(key);
            w.label = text;
            if (w.options) w.options.label = text;
        }
        if (widgets.target) widgets.target.tooltip = t("targetTip");
        if (widgets.submenu) widgets.submenu.tooltip = t("submenuTip");
    }

    const langSub = () => {
        root.querySelectorAll("[data-i18n]").forEach((target) => {
            target.textContent = t(target.dataset.i18n);
        });
        Object.values(cards).forEach((c) => c.paint());
        fillModels();
        localize();
        node.setDirtyCanvas?.(true, true);
    };
    localize();
    BadaI18n.subscribe(langSub);

    const onRemoved = node.onRemoved;
    node.onRemoved = function () {
        BadaI18n.unsubscribe(langSub);
        return onRemoved ? onRemoved.apply(this, arguments) : undefined;
    };

    fillModels();
    pullFromServer();
    return { root, cards };
}

// ---------------------------------------------------------------------------
// Cascading combo (target -> submenu)
// ---------------------------------------------------------------------------
function widgetByName(node, name) {
    return (node.widgets || []).find((w) => w.name === name);
}

function syncSubmenuFor(node, preserve = true) {
    const targetW = widgetByName(node, "target");
    const subW = widgetByName(node, "submenu");
    if (!targetW || !subW) return;
    const names = submenuNamesFor(REGISTRY, targetW.value);
    if (!names) return;
    subW.options = subW.options || {};
    subW.options.values = names;
    if (!preserve || !names.includes(subW.value)) subW.value = names[0];
    node.setDirtyCanvas?.(true, true);
}

function refreshAllNodes() {
    const nodes = app.graph?._nodes || [];
    for (const node of nodes) {
        if (node.type !== NODE_CLASS) continue;
        const targetW = widgetByName(node, "target");
        if (targetW && REGISTRY) {
            const names = (REGISTRY.targets || []).map((x) => x.name).filter(Boolean);
            if (names.length) {
                targetW.options = targetW.options || {};
                targetW.options.values = names;
                if (!names.includes(targetW.value)) targetW.value = names[0];
            }
        }
        syncSubmenuFor(node, true);
        const header = node.__bpgHeader;
        if (header?.cards) Object.values(header.cards).forEach((c) => c.paint());
    }
}

function setupNode(node) {
    const widgetNames = ["enhance", "uncensored", "target", "submenu", "request_text", "duration"];
    const widgets = {};
    for (const name of widgetNames) widgets[name] = widgetByName(node, name);
    if (!widgets.target || !widgets.submenu) {
        console.warn("[BadaPromptGen] backend widgets missing — extension skipped for this node");
        return;
    }

    // Collapse the two BOOLEAN rows and drive them from the DOM toggle cards.
    // (Same hide pattern already proven in bada_async_gemini.js — values keep
    //  serializing and are still sent to the queue.)
    for (const name of ["enhance", "uncensored"]) {
        const w = widgets[name];
        if (!w) continue;
        w.hidden = true;
        w.type = "hidden";
        if (w.computeSize) w.computeSize = () => [0, -4];
    }

    const header = buildHeader(node, widgets);
    node.__bpgHeader = header;

    const domWidget = node.addDOMWidget("bada_promptgen_ui", "custom", header.root, {
        serialize: false,
        hideOnZoom: false,
    });
    // Reported height. The frontend wraps DOM widgets in a `.dom-widget` box and
    // reserves a label strip (~16px) for it, so a hard-coded 138 makes this panel
    // paint over the native widget rows below it (the reported overlap).
    // `calibrateHeight()` below measures the rendered content and adds that slack
    // back, so the canvas box and the panel always match.
    let domHeight = HEADER_HEIGHT;
    domWidget.computeSize = () => [HEADER_WIDTH, domHeight];

    const headerIndex = node.widgets.indexOf(domWidget);
    if (headerIndex > 0) {
        node.widgets.splice(headerIndex, 1);
        node.widgets.unshift(domWidget);
    }

    const originalTargetCb = widgets.target.callback;
    widgets.target.callback = function (value, canvas, originNode, pos, extra) {
        if (originalTargetCb) originalTargetCb.call(this, value, canvas, originNode, pos, extra);
        syncSubmenuFor(node, false);
    };

    const originalSubmenuCb = widgets.submenu.callback;
    widgets.submenu.callback = function (value, canvas, originNode, pos, extra) {
        if (originalSubmenuCb) originalSubmenuCb.call(this, value, canvas, originNode, pos, extra);
        node.setDirtyCanvas?.(true, true);
    };

    const originalComputeSize = node.computeSize;
    node.computeSize = function (out) {
        const size = originalComputeSize ? originalComputeSize.call(this, out || [0, 0]) : (out || [0, 0]);
        size[0] = Math.max(size[0], HEADER_WIDTH + 26);
        size[1] = Math.max(size[1], 520);
        return size;
    };

    if (!node.size || node.size[0] < HEADER_WIDTH + 26 || node.size[1] < 520) {
        node.setSize([446, 560]);
    }

    // ---- height calibration (overlap guard) --------------------------------
    // Measure what the panel actually renders, plus the slack the DOM-widget
    // wrapper eats, and report *that* to LiteGraph.  Self-correcting but
    // deliberately bounded (3 passes, only on a >1px delta) so it can never
    // enter the documented size feedback loop.
    let calibrations = 0;
    const calibrateHeight = () => {
        if (calibrations >= 3) return;
        const wrap = header.root.parentElement;
        if (!wrap) return;
        const scale = (app.canvas && app.canvas.ds && app.canvas.ds.scale) || 1;
        const contentH = Math.ceil(header.root.getBoundingClientRect().height / scale);
        const wrapH = Math.round(wrap.getBoundingClientRect().height / scale);
        if (contentH < 8 || wrapH < 8) return;
        const slack = Math.max(0, domHeight - wrapH);   // label strip the wrapper eats
        const next = contentH + slack;
        if (Math.abs(next - domHeight) <= 1) return;
        domHeight = next;
        calibrations += 1;
        const need = node.computeSize ? node.computeSize() : [HEADER_WIDTH + 26, 520];
        if (node.size[0] + 1 < need[0] || node.size[1] + 1 < need[1]) {
            node.setSize([Math.max(node.size[0], need[0]), Math.max(node.size[1], need[1])]);
        }
        node.setDirtyCanvas?.(true, true);
    };
    const onContentResize = () => setTimeout(calibrateHeight, 0);
    let resizeObserver = null;
    if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(onContentResize);
        resizeObserver.observe(header.root);
    }
    requestAnimationFrame(() => requestAnimationFrame(calibrateHeight));
    setTimeout(calibrateHeight, 300);

    const removeBefore = node.onRemoved;
    node.onRemoved = function () {
        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }
        return removeBefore ? removeBefore.apply(this, arguments) : undefined;
    };

    syncSubmenuFor(node, true);
    app.graph?.setDirtyCanvas?.(true, true);
}

// ---------------------------------------------------------------------------
// Extension entry
// ---------------------------------------------------------------------------
app.registerExtension({
    name: "ComfyUI.BadaUtils.PromptGenerator",

    async setup() {
        await fetchRegistry();
        api.addEventListener("executed", (event) => {
            const list = event?.detail?.output?.bada_promptgen_toast;
            if (!Array.isArray(list)) return;
            for (const item of list) {
                showToast(item?.msg, item?.level || "info", 3800);
            }
        });
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_CLASS) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
            try {
                setupNode(this);
            } catch (err) {
                console.error("[BadaPromptGen] node setup failed:", err);
            }
            return result;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (info) {
            const result = onConfigure ? onConfigure.apply(this, arguments) : undefined;
            setTimeout(() => {
                try {
                    syncSubmenuFor(this, true);
                    const header = this.__bpgHeader;
                    if (header?.cards) Object.values(header.cards).forEach((c) => c.paint());
                } catch (err) {
                    console.warn("[BadaPromptGen] onConfigure sync failed:", err);
                }
            }, 30);
            return result;
        };
    },
});
