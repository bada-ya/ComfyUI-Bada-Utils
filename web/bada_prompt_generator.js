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
    { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash-Lite (권장 ⭐)", name_en: "Gemini 3.5 Flash-Lite (Recommended ⭐)" },
    { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash", name_en: "Gemini 3.6 Flash" },
    { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", name_en: "Gemini 3.8 Flash" },
];

const I18N = {
    ko: {
        enhance: "증강",
        uncensored: "무검열",
        target: "모델",
        submenu: "서브메뉴",
        request_text: "요청사항 입력란",
        requestPlaceholder: "요청사항을 입력하세요 (이미지만으로도 생성 가능)",
        duration: "영상 길이 (초)",
        durationTip: "영상 모델(MINIMAX H3 / LTX2.5)의 초 단위 길이입니다.",
        apiHeader: "API Key & 우선순위 모델 선택",
        keyPlaceholder: "Gemini API 키 입력",
        showKey: "API 키 표시",
        hideKey: "API 키 숨기기",
        issueKeyTip: "Google AI Studio에서 API 키 발급",
        getKey: "발급",
        checkKey: "연결확인",
        testing: "확인중...",
        manage: "⚙️ 시스템 프롬프트",
        keyRequired: "Gemini API 키를 먼저 입력해 주세요.",
        keyOk: "✅ API 연결 정상",
        keyFail: "❌ API 연결 실패",
        saved: "저장됨",
        manageTip: "시스템 프롬프트를 등록·선택·삭제·이동합니다.",
        manageLoadFail: "⚠️ 모델 관리 모듈을 불러오지 못했습니다.",
        enhanceTip: "OFF이면 Gemini를 호출하지 않고 요청사항 원문을 그대로 통과시킵니다.",
        uncensoredTip: "BLOCK_NONE + 3-Pass Zero-Refusal 우회 폴백을 활성화합니다.",
        targetTip: "프롬프트를 최적화할 대상 모델을 선택하세요.",
        submenuTip: "선택한 모델에서 사용할 기능(서브모드)을 선택하세요.",
        noPrompts: "(등록된 프롬프트 없음)",
        aspectRatio: "화면 비율",
        aspectRatioAuto: "자동",
        aspectRatioTip: "선택한 화면비가 모든 메뉴(KREA2 / QWEN2.1 / MINIMAX H3 / LTX2.5 / 시스템 프롬프트)에 공통 적용되어 Gemini가 분석에 활용합니다.",
        aspectRatioBroken: "⚠️ 화면비 값이 전달되지 않습니다. ComfyUI를 재시작해 주세요.",
        general: "일반",
    },
    en: {
        enhance: "Enhance",
        uncensored: "Uncensored",
        target: "Target Model",
        submenu: "Submenu",
        request_text: "Request / Instruction",
        requestPlaceholder: "Enter a request (or connect images only)",
        duration: "Duration (sec)",
        durationTip: "Duration in seconds for video models (MINIMAX H3 / LTX2.5).",
        apiHeader: "API Key & Priority Model",
        keyPlaceholder: "Enter Gemini API key",
        showKey: "Show API key",
        hideKey: "Hide API key",
        issueKeyTip: "Get an API key from Google AI Studio",
        getKey: "Get Key",
        checkKey: "Check",
        testing: "Testing...",
        manage: "⚙️ System Prompt",
        keyRequired: "Please enter your Gemini API key first.",
        keyOk: "✅ API connected",
        keyFail: "❌ API connection failed",
        saved: "Saved",
        manageTip: "Create, select, delete or reorder system prompts.",
        manageLoadFail: "⚠️ Could not load the model manager.",
        enhanceTip: "When OFF the request text passes through untouched (no Gemini call).",
        uncensoredTip: "Enables BLOCK_NONE plus the 3-Pass zero-refusal fallback.",
        targetTip: "Choose the downstream model to optimize the prompt for.",
        submenuTip: "Choose the capability of the selected model.",
        noPrompts: "(No prompts registered)",
        aspectRatio: "Aspect Ratio",
        aspectRatioAuto: "Auto",
        aspectRatioTip: "The selected aspect ratio applies to every tab (KREA2 / QWEN2.1 / MINIMAX H3 / LTX2.5 / System Prompt) and is given to Gemini for analysis.",
        aspectRatioBroken: "⚠️ The aspect ratio is not reaching Gemini. Please restart ComfyUI.",
        general: "General",
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

function localizedLabel(entry, fallback) {
    // `name` is the widget VALUE and the key the backend matches on; `name_en` is display
    // only. Keeping them separate is what lets the header follow the Bada UI-language
    // setting without changing what gets queued.
    if (BadaI18n.lang === "en" && entry?.name_en) return entry.name_en;
    return entry?.name || fallback;
}

function submenuNamesFor(registry, targetName) {
    if (!registry) return null;
    const targets = registry.targets || [];
    const target = targets.find((x) => x.name === targetName) || targets.find((x) => x.id === targetName);
    if (!target) return null;
    if (target.dynamic === "user_prompts") {
        const entries = (registry.user_prompts || []).filter((p) => p.name);
        return entries.length ? entries : [{ name: t("noPrompts") }];
    }
    const entries = (target.submenus || []).filter((s) => s.name);
    return entries.length ? entries : [{ name: t("general") }];
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
            showToast(t("keyOk"), "ok", 2600);
            return true;
        }
        showToast(t("keyFail"), "err", 5200);
        return false;
    } catch (err) {
        console.warn("[BadaPromptGen] API key check failed:", err);
        showToast(t("keyFail"), "err", 5200);
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
const HEADER_WIDTH = 380;
// Initial estimate only — `calibrateHeight()` measures the real rendered height and
// corrects it (up *and* down) within two frames. Sized above the tallest realistic layout
// (≈250px with both picker groups) so the very first paint cannot overlap the native
// widget rows underneath; if calibration were ever to fail, the failure mode is a harmless
// gap rather than a hidden row.
const HEADER_HEIGHT = 262;
const NODE_WIDTH_INSET = 20;

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
    keyInput.placeholder = t("keyPlaceholder");
    keyInput.spellcheck = false;
    keyInput.autocomplete = "off";
    keyInput.value = readKey();

    const eye = el("button", "bpg-icon-btn", "👁");
    eye.type = "button";
    eye.title = t("showKey");
    eye.addEventListener("click", () => {
        keyInput.type = keyInput.type === "password" ? "text" : "password";
        eye.classList.toggle("bpg-icon-btn--on", keyInput.type === "text");
        eye.title = t(keyInput.type === "password" ? "showKey" : "hideKey");
    });

    const issueBtn = el("button", "bpg-btn", t("getKey"));
    issueBtn.type = "button";
    issueBtn.dataset.i18n = "getKey";
    issueBtn.title = t("issueKeyTip");
    issueBtn.addEventListener("click", () => {
        window.open("https://aistudio.google.com/app/apikey", "_blank", "noopener");
    });

    const testBtn = el("button", "bpg-btn bpg-btn--accent", t("checkKey"));
    testBtn.type = "button";
    testBtn.dataset.i18n = "checkKey";
    testBtn.addEventListener("click", async () => {
        testBtn.disabled = true;
        testBtn.textContent = t("testing");
        const key = writeKey(keyInput.value);
        const ok = await verifyKey(key);
        if (ok) pushToServer(key);
        testBtn.disabled = false;
        testBtn.textContent = t("checkKey");
    });

    keyInput.addEventListener("input", () => pushToServer(writeKey(keyInput.value)));
    keyInput.addEventListener("blur", () => pushToServer(writeKey(keyInput.value)));
    keyInput.addEventListener("paste", () => setTimeout(() => pushToServer(writeKey(keyInput.value)), 30));

    row1.append(keyInput, eye, issueBtn, testBtn);
    root.appendChild(row1);

    // -- priority model row --------------------------------------------------
    const row2 = el("div", "bpg-row");
    const modelSel = el("select", "bpg-select");

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
    row2.appendChild(modelSel);

    // 시스템 프롬프트 관리 sits next to the model select (where the old
    // "LocalStorage 자동 저장" notice was) so the toggle row below only has to
    // fit three controls instead of four on a narrow node.
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
            showToast(t("manageLoadFail"), "err", 5000);
        } finally {
            manageBtn.disabled = false;
        }
    });
    row2.appendChild(manageBtn);
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

    // -- aspect ratio picker (sits to the right of 무검열) --------------------
    // Mirrors the native `aspect_ratio` combo widget so the hidden widget and this
    // control can never drift. Empty value = "let the AI decide".
    const ratioWidget = widgets.aspect_ratio;
    if (!ratioWidget) {
        // The node exposes `aspect_ratio` in INPUT_TYPES. If that widget is missing the
        // running ComfyUI has the OLD node module loaded and never restart-picked it up,
        // so the picker below would look functional while sending nothing. Fail loudly
        // instead of silently dropping the user's choice.
        console.warn(
            "[BadaPromptGen] `aspect_ratio` widget not found — ComfyUI is running the old "
            + "node module. Restart ComfyUI, otherwise the 화면 비율 선택 value is discarded.",
        );
    }
    const ASPECT_RATIOS = [
        "1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "9:21", "21:9",
    ];
    const ratioBox = el("div", "bpg-card bpg-card--ratio");
    const ratioLabel = el("span", "bpg-card-label", t("aspectRatio"));
    ratioLabel.dataset.i18n = "aspectRatio";
    const ratioSel = el("select", "bpg-ratio-select");
    for (const value of ASPECT_RATIOS) {
        const opt = el("option", null, value);
        opt.value = value;
        ratioSel.appendChild(opt);
    }
    const AUTO_RATIO = "";
    const autoOpt = el("option", null, t("aspectRatioAuto"));
    autoOpt.value = AUTO_RATIO;
    ratioSel.insertBefore(autoOpt, ratioSel.firstChild);
    ratioBox.append(ratioLabel, ratioSel);

    function syncRatio() {
        const current = ratioWidget ? String(ratioWidget.value ?? AUTO_RATIO) : AUTO_RATIO;
        ratioSel.value = [...ratioSel.options].some((o) => o.value === current) ? current : AUTO_RATIO;
        ratioBox.title = t("aspectRatioTip");
        // The auto option is not [data-i18n], so relabel it explicitly on a language switch.
        autoOpt.textContent = t("aspectRatioAuto");
        const chosen = ratioSel.value;
        ratioBox.classList.toggle("bpg-card--on", !!chosen);
        // Label stays "화면 비율" whatever is picked: the <select> beside it already
        // shows the value, and appending it here overflowed the card.
        ratioBox.dataset.ratio = chosen;
    }

    ratioSel.addEventListener("change", () => {
        if (!ratioWidget) {
            // Surface it on screen too; a console warning alone is easy to miss and the
            // control would otherwise look like it had taken the value.
            ratioBox.classList.add("bpg-card--broken");
            ratioBox.title = t("aspectRatioBroken");
            showToast(t("aspectRatioBroken"), "err", 6000);
            syncRatio();
            return;
        }
        ratioWidget.value = ratioSel.value;
        if (node.onWidgetChanged) {
            node.onWidgetChanged(ratioWidget.name, ratioSel.value, ratioWidget.options?.indexOf?.(ratioSel.value), ratioWidget);
        }
        syncRatio();
        node.setDirtyCanvas?.(true, true);
    });
    syncRatio();
    row3.appendChild(ratioBox);
    root.appendChild(row3);

    const targetGroup = el("div", "bpg-picker-group");
    const targetLabel = el("div", "bpg-picker-label", t("target"));
    targetLabel.dataset.i18n = "target";
    const targetButtons = el("div", "bpg-choice-row");
    targetGroup.append(targetLabel, targetButtons);

    const submenuGroup = el("div", "bpg-picker-group");
    const submenuLabel = el("div", "bpg-picker-label", t("submenu"));
    submenuLabel.dataset.i18n = "submenu";
    const submenuButtons = el("div", "bpg-choice-row");
    submenuGroup.append(submenuLabel, submenuButtons);

    function addChoiceButtons(container, items, selectedValue, onSelect) {
        container.replaceChildren(...items.map((item) => {
            const button = el("button", "bpg-choice", item.label);
            button.type = "button";
            button.classList.toggle("bpg-choice--selected", item.value === selectedValue);
            button.setAttribute("aria-pressed", String(item.value === selectedValue));
            button.addEventListener("click", () => onSelect(item.value));
            return button;
        }));
    }

    function renderTargetButtons() {
        const registryTargets = (REGISTRY?.targets || []).filter((target) => target.name || target.id);
        const items = registryTargets.length
            ? registryTargets.map((target) => ({
                value: target.name || target.id,
                label: localizedLabel(target, target.name || target.id),
            }))
            : (widgets.target?.options?.values || []).map((value) => ({ value, label: value }));
        addChoiceButtons(targetButtons, items, widgets.target?.value, (value) => {
            widgets.target.value = value;
            widgets.target.callback?.call(widgets.target, value, app.canvas, node, null, {});
            syncSubmenuFor(node, false);
            renderTargetButtons();
            node.setDirtyCanvas?.(true, true);
        });
    }

    function renderSubmenuButtons() {
        const entries = submenuNamesFor(REGISTRY, widgets.target?.value)
            || (widgets.submenu?.options?.values || []).map((name) => ({ name }));
        const items = entries.map((entry) => ({ value: entry.name, label: localizedLabel(entry, entry.name) }));
        addChoiceButtons(submenuButtons, items, widgets.submenu?.value, (value) => {
            widgets.submenu.value = value;
            widgets.submenu.callback?.call(widgets.submenu, value, app.canvas, node, null, {});
            node.setDirtyCanvas?.(true, true);
        });
    }

    root.append(targetGroup, submenuGroup);
    renderTargetButtons();
    renderSubmenuButtons();

    const WIDGET_LABELS = ["target", "submenu", "request_text", "duration"];

    function localize() {
        const displayTitle = "⚓ Bada Prompt Generator";
        if (!node.title || ["BadaPromptGenerator", "⚓ Bada 프롬프트 생성기", "Bada 프롬프트 생성기", displayTitle].includes(node.title)) {
            node.title = displayTitle;
        }
        for (const key of WIDGET_LABELS) {
            const w = widgets[key];
            if (!w) continue;
            const text = t(key);
            w.label = text;
            if (w.options) w.options.label = text;
        }
        if (widgets.ui_language) widgets.ui_language.value = BadaI18n.lang;
        if (widgets.enhance) widgets.enhance.tooltip = t("enhanceTip");
        if (widgets.uncensored) widgets.uncensored.tooltip = t("uncensoredTip");
        if (widgets.target) widgets.target.tooltip = t("targetTip");
        if (widgets.submenu) widgets.submenu.tooltip = t("submenuTip");
        if (widgets.duration) widgets.duration.tooltip = t("durationTip");
        const requestInput = widgets.request_text?.inputEl || widgets.request_text?.element;
        if (requestInput) requestInput.placeholder = t("requestPlaceholder");
        keyInput.placeholder = t("keyPlaceholder");
        eye.title = t(keyInput.type === "password" ? "showKey" : "hideKey");
        issueBtn.title = t("issueKeyTip");
        manageBtn.title = t("manageTip");
    }

    const langSub = () => {
        root.querySelectorAll("[data-i18n]").forEach((target) => {
            target.textContent = t(target.dataset.i18n);
        });
        Object.values(cards).forEach((c) => c.paint());
        syncRatio();
        fillModels();
        localize();
        renderTargetButtons();
        renderSubmenuButtons();
        node.setDirtyCanvas?.(true, true);
    };
    localize();
    BadaI18n.subscribe(langSub);
    // A language switch changes label widths, so the rows wrap differently and the panel
    // needs re-measuring — otherwise the leftover height clips the rows underneath.
    node.__bpgRecalibrate?.();

    const onRemoved = node.onRemoved;
    node.onRemoved = function () {
        BadaI18n.unsubscribe(langSub);
        return onRemoved ? onRemoved.apply(this, arguments) : undefined;
    };

    fillModels();
    pullFromServer();
    return { root, cards, renderTargetButtons, renderSubmenuButtons };
}

// ---------------------------------------------------------------------------
// Cascading combo (target -> submenu)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Progressive image sockets
// ---------------------------------------------------------------------------
// The node declares image_1..image_6 but only ever *reveals* the sockets the
// user can actually use right now:
//
//     0 connected  ->  image_1                       (one empty socket to fill)
//     image_1      ->  image_1, image_2
//     image_1..2   ->  image_1, image_2, image_3
//     ...up to     ->  image_1 .. image_6
//
// Only ever-trailing, always-unwired sockets are removed, so every surviving
// socket keeps its array index and every link keeps its target. That makes this
// safe: hiding cannot orphan a connection, and a hidden socket can never be
// clicked because it is not in the array at all.
//
// Loading a workflow makes LiteGraph rebuild node.inputs from the node definition,
// which replaces every socket with a *new* object. Any socket stashed earlier is
// then stale, so syncImageSlots() repairs by name (dedupe -> ensure -> restore ->
// sort) rather than trusting object identity. The image_1..image_6 name space is
// enforced as a hard ceiling, so a 7th row can never appear however many times this
// runs. Sockets inside 1..6 that carry a link are never force-removed.
const IMAGE_SLOT_RE = /^image_(\d+)$/;
const TOTAL_IMAGE_SLOTS = 6;

function imageSlotIndex(slot) {
    const m = IMAGE_SLOT_RE.exec((slot && slot.name) || "");
    return m ? parseInt(m[1], 10) - 1 : -1;
}

const isImageSlot = (s) => IMAGE_SLOT_RE.test((s && s.name) || "");

/** Remove sockets that repeat a name, keeping the wired one. */
function dedupeImageSlots(node) {
    const byName = new Map();
    const doomed = [];
    for (const slot of node.inputs.slice()) {
        if (!isImageSlot(slot)) continue;
        const prev = byName.get(slot.name);
        if (prev === undefined) { byName.set(slot.name, slot); continue; }
        // A wired socket always beats an unwired one; otherwise the earlier wins.
        if (prev.link == null && slot.link != null) {
            byName.set(slot.name, slot);
            doomed.push(prev);
        } else {
            doomed.push(slot);
        }
    }
    doomed.forEach((slot) => {
        const at = node.inputs.indexOf(slot);
        if (at !== -1) node.inputs.splice(at, 1);
    });
    return doomed.length;
}

/**
 * Put image_N back into ascending N order. The image block is rebuilt in place at the
 * position the first image socket already occupied, so other inputs (clip, mask, ...)
 * keep their relative order instead of being shuffled to the back.
 */
function sortImageSlots(node) {
    const images = node.inputs.filter(isImageSlot);
    if (images.length < 2) return false;
    const sorted = images.slice().sort((a, b) => imageSlotIndex(a) - imageSlotIndex(b));
    const anchor = node.inputs.indexOf(images[0]);
    if (anchor === -1) return false;
    let changed = false;
    for (let i = 0; i < sorted.length; i++) {
        if (node.inputs[anchor + i] === sorted[i]) continue;
        const at = node.inputs.indexOf(sorted[i]);
        if (at === -1) continue;
        node.inputs.splice(at, 1);
        node.inputs.splice(anchor + i, 0, sorted[i]);
        changed = true;
    }
    return changed;
}

/** Guarantee image_1..image_6 all exist (LiteGraph rebuilds inputs on workflow load). */
function ensureImageSlots(node) {
    let added = false;
    for (let i = 1; i <= TOTAL_IMAGE_SLOTS; i++) {
        const name = `image_${i}`;
        if (node.inputs.some((s) => s && s.name === name)) continue;
        // Inherit the rendering flags from a sibling so it looks identical.
        const sibling = node.inputs.find(isImageSlot);
        const slot = { name, type: "IMAGE", link: null };
        if (sibling) {
            if (sibling.shape !== undefined) slot.shape = sibling.shape;
            if (sibling.color_off !== undefined) slot.color_off = sibling.color_off;
        }
        node.inputs.push(slot);
        added = true;
    }
    return added;
}

function syncImageSlots(node) {
    if (!node || !Array.isArray(node.inputs)) return;
    let changed = false;

    // 0) Repair first. Loading a workflow makes LiteGraph rebuild node.inputs from the
    //    node definition, so sockets we stashed earlier are stale objects that are no
    //    longer part of this array -- blindly re-inserting them produced visible
    //    duplicates (image_2, image_2, image_2 ...). So: de-duplicate by name, then
    //    only restore a stashed socket when its name is genuinely missing.
    changed = dedupeImageSlots(node) > 0 || changed;
    changed = ensureImageSlots(node) || changed;

    const present = new Set(node.inputs.filter(isImageSlot).map((s) => s.name));
    const stash = node.__bpgHiddenImageSlots || (node.__bpgHiddenImageSlots = []);
    for (let i = stash.length - 1; i >= 0; i--) {
        const slot = stash[i];
        if (!isImageSlot(slot) || present.has(slot.name)) { stash.splice(i, 1); continue; }
        node.inputs.push(slot);
        present.add(slot.name);
    }

    changed = sortImageSlots(node) || changed;

    // 1) Enforce the name space: the node definition only ever declares image_1..image_6,
    //    so a socket numbered above that cannot be legitimate and is dropped. (Sockets
    //    inside 1..6 are never force-removed — dropping one would destroy a live link.)
    //    This is what stops a 7th row from ever appearing.
    const stray = node.inputs.filter((s) => isImageSlot(s) && imageSlotIndex(s) >= TOTAL_IMAGE_SLOTS);
    stray.forEach((slot) => {
        const at = node.inputs.indexOf(slot);
        if (at === -1) return;
        node.inputs.splice(at, 1);
        stash.push(slot);
        changed = true;
    });

    const slots = node.inputs.filter(isImageSlot);
    if (!slots.length) return;

    // 2) Reveal up to the last wired socket, plus one spare to wire next.
    let lastWired = -1;
    slots.forEach((s, i) => { if (s.link != null) lastWired = i; });
    const visible = lastWired < 0 ? 1 : Math.min(slots.length, lastWired + 2);

    // 3) Hide the tail. Everything past `lastWired` is unwired by construction, so this
    //    can never drop a live connection.
    for (let i = visible; i < slots.length; i++) {
        const slot = slots[i];
        if (slot.link != null) continue;
        const at = node.inputs.indexOf(slot);
        if (at === -1) continue;
        node.inputs.splice(at, 1);
        stash.push(slot);
        changed = true;
    }

    if (changed) {
        node.__bpgVisibleImageSlots = visible;
        refitForSlots(node);
    }
}

/**
 * Re-fit the frame after sockets appear/disappear. Runs only on an actual socket
 * count change (never on a timer or a draw), so it cannot fight a manual resize.
 * Like the header calibrator it is a one-shot per change and floors at
 * computeSize() so the node never clips its own content.
 */
function refitForSlots(node) {
    setTimeout(() => {
        if (!node || !node.size || !node.inputs) return;
        const need = node.computeSize ? node.computeSize() : null;
        if (!need) return;
        const height = Math.max(need[1], Math.ceil(need[1]) + 40);
        if (Math.abs(height - node.size[1]) > 2) {
            node.setSize([node.size[0], height]);
        }
        node.__bpgSyncHeaderWidth?.();
        node.setDirtyCanvas?.(true, true);
    }, 0);
}

function hookImageSlots(node) {
    if (!node || node.__bpgImageSlotsHooked) return;
    node.__bpgImageSlotsHooked = true;

    // Fires on every connect/disconnect. Chain to any previous handler so we never
    // clobber another extension's hook.
    const prev = node.onConnectionsChange;
    node.onConnectionsChange = function () {
        const r = syncImageSlots(this);
        return prev ? prev.apply(this, arguments) : r;
    };

    syncImageSlots(node);
}

function widgetByName(node, name) {
    return (node.widgets || []).find((w) => w.name === name);
}

function syncDurationFor(node) {
    const duration = widgetByName(node, "duration");
    if (!duration) return;

    if (!Object.prototype.hasOwnProperty.call(duration, "__bpgOriginalType")) {
        duration.__bpgOriginalType = duration.type;
        duration.__bpgOriginalComputeSize = duration.computeSize;
    }

    const target = String(widgetByName(node, "target")?.value || "");
    const visible = /MINIMAX\s*H3|LTX\s*2\.5/i.test(target);
    duration.hidden = !visible;
    if (visible) {
        duration.type = duration.__bpgOriginalType || "number";
        if (duration.__bpgOriginalComputeSize) duration.computeSize = duration.__bpgOriginalComputeSize;
        else delete duration.computeSize;
    } else {
        duration.type = "hidden";
        duration.computeSize = () => [0, -4];
    }
}

function syncSubmenuFor(node, preserve = true) {
    const targetW = widgetByName(node, "target");
    const subW = widgetByName(node, "submenu");
    if (!targetW || !subW) return;
    const names = (submenuNamesFor(REGISTRY, targetW.value) || []).map((entry) => entry.name);
    if (!names) return;
    subW.options = subW.options || {};
    subW.options.values = names;
    if (!preserve || !names.includes(subW.value)) subW.value = names[0];
    syncDurationFor(node);
    node.__bpgHeader?.renderSubmenuButtons?.();
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
        header?.renderTargetButtons?.();
        header?.renderSubmenuButtons?.();
        if (header?.cards) Object.values(header.cards).forEach((c) => c.paint());
    }
}

function setupNode(node) {
    const widgetNames = ["enhance", "uncensored", "target", "submenu", "request_text", "duration", "ui_language", "aspect_ratio"];
    const widgets = {};
    for (const name of widgetNames) widgets[name] = widgetByName(node, name);
    if (!widgets.target || !widgets.submenu) {
        console.warn("[BadaPromptGen] backend widgets missing — extension skipped for this node");
        return;
    }

    // Collapse the two BOOLEAN rows and drive them from the DOM toggle cards.
    // (Same hide pattern already proven in bada_async_gemini.js — values keep
    //  serializing and are still sent to the queue.)
    for (const name of ["enhance", "uncensored", "target", "submenu"]) {
        const w = widgets[name];
        if (!w) continue;
        w.hidden = true;
        w.type = "hidden";
        if (w.computeSize) w.computeSize = () => [0, -4];
    }
    if (widgets.ui_language) {
        widgets.ui_language.hidden = true;
        widgets.ui_language.type = "hidden";
        if (widgets.ui_language.computeSize) widgets.ui_language.computeSize = () => [0, -4];
    }
    // The native aspect_ratio combo is driven by the DOM picker in the header; keep the
    // widget so the value still serializes into the prompt, but stop drawing it twice.
    if (widgets.aspect_ratio) {
        widgets.aspect_ratio.hidden = true;
        widgets.aspect_ratio.type = "hidden";
        if (widgets.aspect_ratio.computeSize) widgets.aspect_ratio.computeSize = () => [0, -4];
    }
    syncDurationFor(node);

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
    let domWidth = HEADER_WIDTH;
    domWidget.computeSize = () => [domWidth, domHeight];

    // ---- height calibration (overlap guard) --------------------------------
    // Measure what the panel actually renders, plus the slack the DOM-widget wrapper
    // eats, and report *that* to LiteGraph, so the canvas box and the panel always match.
    //
    // The panel's height depends on its WIDTH: `.bpg-row` wraps, so narrowing the node
    // grows the content. The pass budget is therefore reset on every width change (and on
    // every language switch) — a budget spent at one width says nothing about the next.
    // Without that reset, narrowing the node left the budget spent, the panel kept its old
    // height and painted over the native widget rows underneath — the 영상 길이 (초) row
    // was clipped in Korean and fully hidden in English, which wraps one row more.
    let calibrations = 0;
    let calibrationTimer = null;

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

    const scheduleCalibration = (delay = 0) => {
        if (calibrationTimer !== null) clearTimeout(calibrationTimer);
        calibrationTimer = setTimeout(() => {
            calibrationTimer = null;
            calibrateHeight();
        }, delay);
    };

    // Exposed so the header can re-measure itself after a language switch, which also
    // changes how much the rows wrap.
    node.__bpgRecalibrate = () => {
        calibrations = 0;
        scheduleCalibration(0);
    };

    const syncHeaderWidth = () => {
        if (!node.size) return;
        const nextWidth = Math.max(HEADER_WIDTH, node.size[0] - NODE_WIDTH_INSET);
        if (Math.abs(nextWidth - domWidth) <= 1 && header.root.style.width === `${nextWidth}px`) return;
        domWidth = nextWidth;
        header.root.style.width = `${domWidth}px`;
        header.root.style.maxWidth = `${domWidth}px`;
        calibrations = 0;      // new width -> new wrap layout -> new required height
        scheduleCalibration(0);
    };

    // Arrange widget visual order: domWidget -> duration -> request_text -> rest
    const domIdx = node.widgets.indexOf(domWidget);
    if (domIdx !== -1) node.widgets.splice(domIdx, 1);

    const durW = widgets.duration;
    const reqW = widgets.request_text;

    if (durW) {
        const durIdx = node.widgets.indexOf(durW);
        if (durIdx !== -1) node.widgets.splice(durIdx, 1);
    }
    if (reqW) {
        const reqIdx = node.widgets.indexOf(reqW);
        if (reqIdx !== -1) node.widgets.splice(reqIdx, 1);
    }

    node.widgets.unshift(domWidget);
    if (durW) node.widgets.push(durW);
    if (reqW) node.widgets.push(reqW);

    const originalTargetCb = widgets.target.callback;
    widgets.target.callback = function (value, canvas, originNode, pos, extra) {
        if (originalTargetCb) originalTargetCb.call(this, value, canvas, originNode, pos, extra);
        syncSubmenuFor(node, false);
    };

    const originalSubmenuCb = widgets.submenu.callback;
    widgets.submenu.callback = function (value, canvas, originNode, pos, extra) {
        if (originalSubmenuCb) originalSubmenuCb.call(this, value, canvas, originNode, pos, extra);
        node.__bpgHeader?.renderSubmenuButtons?.();
        node.setDirtyCanvas?.(true, true);
    };

    const MIN_NODE_WIDTH = HEADER_WIDTH + NODE_WIDTH_INSET;
    const originalComputeSize = node.computeSize;
    node.computeSize = function (out) {
        const size = originalComputeSize ? originalComputeSize.call(this, out || [0, 0]) : (out || [0, 0]);
        size[0] = Math.max(size[0], MIN_NODE_WIDTH);
        size[1] = Math.max(size[1], 500);
        return size;
    };

    if (!node.size || node.size[0] < HEADER_WIDTH + 26 || node.size[1] < 520) {
        node.setSize([446, 560]);
    }
    syncHeaderWidth();

    const originalOnResize = node.onResize;
    node.onResize = function () {
        const result = originalOnResize ? originalOnResize.apply(this, arguments) : undefined;
        syncHeaderWidth();
        return result;
    };
    node.__bpgSyncHeaderWidth = syncHeaderWidth;

    let resizeObserver = null;
    if (typeof ResizeObserver !== "undefined") {
        // The observer reports content growth (wrapped rows, longer labels); re-measure
        // through the scheduler so bursts collapse into one calibration.
        resizeObserver = new ResizeObserver(() => scheduleCalibration(0));
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
        if (calibrationTimer !== null) {
            clearTimeout(calibrationTimer);
            calibrationTimer = null;
        }
        delete this.__bpgSyncHeaderWidth;
        delete this.__bpgRecalibrate;
        return removeBefore ? removeBefore.apply(this, arguments) : undefined;
    };

    syncSubmenuFor(node, true);
    hookImageSlots(node);
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
                    // Workflow load rebuilds every socket as a brand-new object, so the
                    // previous stash is stale. Drop it and re-derive from the live array.
                    this.__bpgHiddenImageSlots = [];
                    syncImageSlots(this);
                    this.__bpgSyncHeaderWidth?.();
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
