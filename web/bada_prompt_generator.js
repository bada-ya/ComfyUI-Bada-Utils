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

// Shared document.body remount watcher: one MutationObserver per module, rAF-coalesced.
// Replaces the previous per-node observers (Nodes 2.0 Vue-overlay remount self-heal).
let __badaBodyObserver = null;
const __badaBodyWatchers = new Set();
let __badaBodyWatchPending = false;
function __badaEnsureBodyObserver() {
    if (__badaBodyObserver || typeof MutationObserver === "undefined" || !document.body) return;
    __badaBodyObserver = new MutationObserver(() => {
        if (__badaBodyWatchPending) return;
        __badaBodyWatchPending = true;
        const raf = window.requestAnimationFrame || ((cb) => setTimeout(cb, 0));
        raf(() => { __badaBodyWatchPending = false; for (const fn of __badaBodyWatchers) { try { fn(); } catch (e) { console.debug("[Bada] ignored:", e); } } });
    });
    __badaBodyObserver.observe(document.body, { childList: true, subtree: true });
}
function __badaWatchBodyRemount(fn) { __badaBodyWatchers.add(fn); __badaEnsureBodyObserver(); return () => __badaBodyWatchers.delete(fn); }

const NODE_CLASS = "BadaPromptGenerator";
const REGISTRY_URL = "/api/bada/promptgen/registry";
const CONFIG_URL = "/api/bada/gemini/config";
const KEYS_LS = "bada_gemini_api_keys";
const DISABLED_LS = "bada_gemini_api_disabled";
const MODEL_LS = "bada_gemini_model";

// 모델 모드 (속도/균형/품질) — 값은 `server/gemini_api.py:MODE_CASCADES` 의 키와 문자열까지
// 같아야 하는 기호 값이다. 화면 언어가 영어여도 저장 값은 한국어 리터럴로 남는다
// (config.json·localStorage 가 그 형태로 이미 쌓여 있어 번역하면 옛 설정이 풀린다).
// 이 셋을 고르면 새 서버 쪽 캐스케이드 표도 함께 고쳐야 한다.
const MODE_LS = "bada_gemini_model_mode";
const MODE_CHOICES = ["속도", "균형", "품질"];
const MODE_DEFAULT = "균형";
// 값 → 사전 키. `dataset.i18n` 에는 이 쪽의 실제 키 이름만 넣는다 («mode_» + 값 을 이어 붙이면
// pg_mode_속도 같은 없는 키가 나와 언어 전환 때 키 이름이 그대로 화면에 뜬다).
const MODE_LABEL_KEYS = { "속도": "mode_speed", "균형": "mode_balance", "품질": "mode_quality" };

// D-5 라운드 때 로컬 사전 39키를 전역 사전으로 옮기고, 전역 t() 를 가리던 섀도 t() 도 없앴다.
// 그 자리에는 지금 pg_* 65키가 들어 있다 — D-5 이후 추가분은 tools/harness_p1h/p43_d5_keys.cjs 의
// PG_POST_D5_KEYS 등록부가 센다. 키 이름은 같은 파일의 pg_* 대응표. 값이 없으면 전역 t() 가 키 이름을
// 그대로 화면에 뱉는다 — 옛 t() 의 request_text 폴백은 «뭘 못 찾았는지» 를 지워버리므로 되살리지 않는다.
const pgT = (key, params) => BadaI18n.t("pg_" + key, params);

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
        return entries.length ? entries : [{ name: pgT("no_prompts") }];
    }
    const entries = (target.submenus || []).filter((s) => s.name);
    return entries.length ? entries : [{ name: pgT("general") }];
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
function readKeys() {
    try {
        const raw = localStorage.getItem(KEYS_LS);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.filter((k) => k && k.trim()) : [];
    } catch (_) {
        return [];
    }
}

function writeKeys(keys) {
    const arr = Array.isArray(keys) ? keys.filter((k) => k && k.trim()) : [];
    if (arr.length) localStorage.setItem(KEYS_LS, JSON.stringify(arr));
    else localStorage.removeItem(KEYS_LS);
    return arr;
}

function addKey(key) {
    const k = (key || "").trim();
    if (!k) return readKeys();
    const cur = readKeys();
    if (cur.includes(k)) return cur;
    cur.push(k);
    writeKeys(cur);
    return cur;
}

function removeKey(key) {
    const k = (key || "").trim();
    const cur = readKeys().filter((x) => x !== k);
    writeKeys(cur);
    return cur;
}

// --- 키 활성/비활성 -------------------------------------------------------
// 전체 키 목록은 그대로 두고, "비활성" 목록만 따로 보관한다. config.json 에도
// 같은 목록을 미러링해 재시작·다른 브라우저에서도 상태가 유지된다.
function readDisabled() {
    try {
        const raw = localStorage.getItem(DISABLED_LS);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.filter((k) => k && k.trim()) : [];
    } catch (_) {
        return [];
    }
}

function writeDisabled(list) {
    const arr = Array.isArray(list)
        ? [...new Set(list.filter((k) => k && k.trim()))]
        : [];
    if (arr.length) localStorage.setItem(DISABLED_LS, JSON.stringify(arr));
    else localStorage.removeItem(DISABLED_LS);
    return arr;
}

function isKeyEnabled(key) {
    return !readDisabled().includes(key);
}

function setKeyEnabled(key, enabled) {
    const rest = readDisabled().filter((k) => k !== key);
    if (!enabled) rest.push(key);
    return writeDisabled(rest);
}

// 실제 API 호출에 쓰이는 키 (활성 키만)
function enabledKeys() {
    const disabled = readDisabled();
    return readKeys().filter((k) => !disabled.includes(k));
}

// 노드 헤더에 «API Key = N 개» 로 보여 주는 값. 등록 키 전체가 아니라 **활성 키**만 센다
// (비활성 키는 어떤 호출에도 쓰이지므로 개수를 세도 실행에 도움이 안 된다).
function enabledKeyCount() {
    return enabledKeys().length;
}

function maskKey(key) {
    const k = String(key || "");
    return k.length > 8 ? k.slice(0, 4) + "••••••••" + k.slice(-4) : "••••••••";
}

// 이미 등록된 키인지 검사 (대소문자/공백만 다른 것은 같은 키로 간주)
function findDuplicateKey(key, list = readKeys()) {
    const k = String(key || "").trim();
    if (!k) return null;
    return list.find((x) => String(x || "").trim() === k) || null;
}

function readModel() {
    return (localStorage.getItem(MODEL_LS) || "").trim();
}

function writeModel(value) {
    const model = (value || "").trim();
    if (model) localStorage.setItem(MODEL_LS, model);
    return model;
}

// --- 모델 모드 (속도/균형/품질) ---------------------------------------------
// 노드 헤더의 드롭다운과 ⚙️ 모델 설정 팝업 라디오가 이 한 곳을 함께 본다.
// 저장된 값이 셋 중 하나가 아니면(옛 버전·직접 편집) 기본 값으로 되돌린다 —
// 아닌 값을 그대로 두면 서버 캐스케이드 표에 없어서 «뭘로 생성됐는지» 알 수 없어진다.
function readMode() {
    const value = (localStorage.getItem(MODE_LS) || "").trim();
    return MODE_CHOICES.includes(value) ? value : MODE_DEFAULT;
}

function writeMode(value) {
    const mode = MODE_CHOICES.includes(value) ? value : MODE_DEFAULT;
    localStorage.setItem(MODE_LS, mode);
    return mode;
}

function modeLabel(mode) {
    return pgT(MODE_LABEL_KEYS[MODE_CHOICES.includes(mode) ? mode : MODE_DEFAULT]);
}

let _syncTimer = null;
function pushToServer(keys, model, mode) {
    // debounce — every keystroke must not hit the server
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(async () => {
        const body = {};
        // 빈 배열도 그대로 보낸다 — 마지막 키를 지웠을 때 config.json 쪽 목록도 비워야 한다.
        if (Array.isArray(keys)) body.api_keys = keys;
        if (model) body.default_model = model;
        if (mode) body.model_mode = mode;
        // 비활성 목록은 항상 미러링 (재시작·다른 브라우저에서도 유지)
        body.api_disabled = readDisabled();
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
        if (data.api_keys && Array.isArray(data.api_keys)) writeKeys(data.api_keys);
        if (data.api_disabled && Array.isArray(data.api_disabled)) writeDisabled(data.api_disabled);
        // 서버에는 옛 버전이 남긴 다른 값도 있을 수 있다 → 셋 중 맞는 것만 받아 온다
        // (아니면 readMode() 이 기본 값으로 되돌리므로 저장이 안 되는 것과 같은 화면이 된다)
        if (!localStorage.getItem(MODE_LS) && MODE_CHOICES.includes(data.model_mode)) {
            localStorage.setItem(MODE_LS, data.model_mode);
        }
        return data;
    } catch (err) {
        return null;
    }
}

// 서버 /gemini/test 가 실패마다 싣는 기호 값(code) → 이 파일 사전 키. 사전에 없는(= 미래의)
// 코드나 구버전 서버가 코드를 안 준 응답은 원문만 붙여 보여주므로 화면이 침묵하지 않는다.
const KEY_FAIL_KEYS = {
    no_key: "key_required",
    invalid_key: "key_fail_invalid_key",
    quota: "key_fail_quota",
    bad_request: "key_fail_request",
    upstream: "key_fail_upstream",
    timeout: "key_fail_timeout",
    unreachable: "key_fail_unreachable",
};

// 서버가 "자기 문구"를 그대로 되돌려 보내는 코드 (server/gemini_api.py 의 고정 문자열).
// 이 경우 원문을 붙이면 같은 말을 두 번 읽게 되고, 언어를 바꾼 화면에선 남의 언어
// 문장이 이유 자리에 뜨므로 코드로 판정해 붙이지 않는다.
const KEY_FAIL_ECHO_CODES = new Set(["no_key"]);

// 서버 원문(Google 메시지)은 언어가 섞여 있어 보조 자리에만 쓴다. 길이가 천 자인 응답도
// 있으므로 토스트에서 자른다 — 잘린 줄은 … 로 표시해 원문이 짧지 않았음을 남긴다.
function keyFailMessage(data) {
    const raw = String((data && (data.error || data.message)) || "").replace(/\s+/g, " ").trim();
    const why = raw.length > 90 ? `${raw.slice(0, 90)}…` : raw;
    const code = String((data && data.code) || "");
    // code 는 외부에서 온 문자열이라 그 자체로 사전 검색에 쓴다. 프로토타입을 타고
    // 올라가 "constructor" 같은 값이 사전 키로 잡히지 않도록 객체 자체의 키만 인정한다.
    const known = Object.prototype.hasOwnProperty.call(KEY_FAIL_KEYS, code);
    const base = known ? pgT(KEY_FAIL_KEYS[code]) : pgT("key_fail");
    // 구버전 서버가 코드를 안 주는 경우를 대비해 문자열 동일성도 본다. 지나치게 짧은
    // 문자열이 우연히 걸려 진짜 이유를 지우면 안 되어 길이 제한을 둔다.
    const dup = KEY_FAIL_ECHO_CODES.has(code) || (why.length >= 8 && base.includes(why));
    return why && !dup ? `${base} — ${why}` : base;
}

// ---------------------------------------------------------------------------
// 설정 모달 (API 키 다중 관리 + 모델 모드 선택)
// ---------------------------------------------------------------------------
function openSettingsModal() {
    const existing = document.getElementById("bpg-settings-modal");
    if (existing) existing.remove();

    const overlay = el("div", "bpg-settings-overlay");
    overlay.id = "bpg-settings-modal";

    const panel = el("div", "bpg-settings-panel");

    const head = el("div", "bpg-settings-head");
    const headTitle = el("div", "bpg-settings-title", pgT("settings"));
    headTitle.dataset.i18n = "settings";
    const headClose = el("button", "bpg-settings-close", "✕");
    headClose.type = "button";
    headClose.title = pgT("close");
    headClose.addEventListener("click", () => overlay.remove());
    head.append(headTitle, headClose);

    const body = el("div", "bpg-settings-body");

    const keysSection = el("div", "bpg-settings-section");

    // --- 헤더: 🔑 API 키 ........................ [발급] [연결확인] [키 추가]
    const keysHead = el("div", "bpg-settings-keys-head");
    const keysTitle = el("div", "bpg-settings-section-title", pgT("api_keys_title"));
    keysTitle.dataset.i18n = "api_keys_title";
    const keysActions = el("div", "bpg-settings-keys-actions");

    const issueBtn = el("button", "bpg-settings-act", pgT("get_key"));
    issueBtn.type = "button";
    issueBtn.dataset.i18n = "get_key";
    issueBtn.title = pgT("issue_key_tip");
    issueBtn.addEventListener("click", () => {
        window.open("https://aistudio.google.com/app/apikey", "_blank", "noopener");
    });

    const testBtn = el("button", "bpg-settings-act", pgT("check_all_keys"));
    testBtn.type = "button";
    testBtn.dataset.i18n = "check_all_keys";

    const addToggleBtn = el("button", "bpg-settings-act bpg-settings-act--accent", pgT("add_key"));
    addToggleBtn.type = "button";
    addToggleBtn.dataset.i18n = "add_key";

    keysActions.append(issueBtn, testBtn, addToggleBtn);
    keysHead.append(keysTitle, keysActions);
    keysSection.appendChild(keysHead);

    const keysList = el("div", "bpg-settings-key-items");
    keysSection.appendChild(keysList);

    // 입력 행 — "키 추가" 를 눌렀을 때만 나타난다.
    const addRow = el("div", "bpg-settings-add-row");
    addRow.hidden = true;

    const addInput = el("input", "bpg-settings-key-input");
    addInput.type = "password";
    addInput.placeholder = pgT("key_placeholder");
    addInput.spellcheck = false;
    addInput.autocomplete = "off";

    const addConfirmBtn = el("button", "bpg-settings-add-confirm", pgT("add"));
    addConfirmBtn.type = "button";
    addConfirmBtn.dataset.i18n = "add";

    addRow.append(addInput, addConfirmBtn);
    keysSection.appendChild(addRow);

    function syncServer() {
        pushToServer(readKeys(), readModel());
        // 키를 더하거나 빼거나 끈 즉시 모든 ⚓ 노드의 «API Key = N 개» 가 따라 간다.
        // (지금은 이 창이 열려 있어 헤더가 안 보이더라도, 닫은 뒤 헤더가 옛 숫자를
        //  계속 달고 있는 쪽이 더 나쁜 상태다)
        refreshHeaderState();
    }

    function renderKeys() {
        keysList.replaceChildren();
        const keys = readKeys();
        const disabled = readDisabled();
        if (!keys.length) {
            keysList.appendChild(el("div", "bpg-settings-key-empty", pgT("keys_empty")));
            return;
        }
        for (const key of keys) {
            const enabled = !disabled.includes(key);
            const item = el("div",
                "bpg-settings-key-item" + (enabled ? "" : " bpg-settings-key-item--off"));

            // 활성/비활성 — 체크하면 ✓ 표시, 다시 누르면 해제
            const check = el("button", "bpg-settings-key-check", enabled ? "✓" : "");
            check.type = "button";
            check.setAttribute("role", "checkbox");
            check.setAttribute("aria-checked", String(enabled));
            check.title = pgT(enabled ? "key_disable_tip" : "key_enable_tip");
            check.addEventListener("click", () => {
                setKeyEnabled(key, !enabled);
                renderKeys();
                syncServer();
            });

            const label = el("span", "bpg-settings-key-masked", maskKey(key));
            label.title = enabled ? key : pgT("key_disabled");

            // 눈 — 마스킹 ↔ 전체 키
            let revealed = false;
            const eye = el("button", "bpg-settings-key-eye", "👁");
            eye.type = "button";
            eye.title = pgT("show_key");
            eye.addEventListener("click", () => {
                revealed = !revealed;
                label.textContent = revealed ? key : maskKey(key);
                eye.textContent = revealed ? "🙈" : "👁";
                eye.title = pgT(revealed ? "hide_key" : "show_key");
                eye.classList.toggle("bpg-settings-key-eye--on", revealed);
            });

            // 삭제 — 브라우저 기본 confirm (확인/취소)
            const del = el("button", "bpg-settings-key-del", "✕");
            del.type = "button";
            del.title = pgT("del_key");
            del.addEventListener("click", () => {
                if (!confirm(pgT("confirm_delete_key", { key: maskKey(key) }))) return;
                removeKey(key);
                writeDisabled(readDisabled().filter((k) => k !== key));
                renderKeys();
                syncServer();
            });

            item.append(check, label, eye, del);
            keysList.appendChild(item);
        }
    }

    function submitAdd() {
        const raw = (addInput.value || "").trim();
        if (!raw) {
            showToast(pgT("key_required"), "warn", 3400);
            return;
        }
        // 중복 — 이미 등록된 키는 추가하지 않고 입력칸을 그대로 남겨 사용자가 고칠 수 있게 한다.
        if (findDuplicateKey(raw)) {
            showToast(pgT("key_duplicate"), "warn", 4200);
            addInput.focus();
            addInput.select?.();
            return;
        }
        addKey(raw);
        // 새 키는 기본 활성 — 혹시 이전에 비활성으로 남아 있었어도 해제
        writeDisabled(readDisabled().filter((k) => k !== raw));
        addInput.value = "";
        addRow.hidden = true;
        addToggleBtn.classList.remove("bpg-settings-act--open");
        renderKeys();
        syncServer();
    }

    addToggleBtn.addEventListener("click", () => {
        const show = addRow.hidden;
        addRow.hidden = !show;
        addToggleBtn.classList.toggle("bpg-settings-act--open", show);
        if (show) addInput.focus();
    });
    addConfirmBtn.addEventListener("click", submitAdd);
    addInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            submitAdd();
        } else if (e.key === "Escape") {
            addRow.hidden = true;
            addToggleBtn.classList.remove("bpg-settings-act--open");
        }
    });

    testBtn.addEventListener("click", async () => {
        // 연결확인은 "활성 키"만 검사한다.
        const keys = enabledKeys();
        if (!keys.length) {
            showToast(pgT("key_required"), "warn", 3400);
            return;
        }
        testBtn.disabled = true;
        testBtn.textContent = pgT("testing");
        let okCount = 0;
        for (const key of keys) {
            if (await verifyKey(key)) okCount++;
        }
        showToast(`${pgT("keys_checked")}: ${okCount}/${keys.length}`,
            okCount === keys.length ? "ok" : "warn", 5000);
        testBtn.disabled = false;
        testBtn.textContent = pgT("check_all_keys");
    });

    renderKeys();
    body.appendChild(keysSection);

    const modeSection = el("div", "bpg-settings-section");
    const modeTitle = el("div", "bpg-settings-section-title", pgT("model_mode"));
    modeTitle.dataset.i18n = "model_mode";
    modeSection.appendChild(modeTitle);

    const modeRadioWrap = el("div", "bpg-settings-mode-radio");
    const modes = MODE_CHOICES.map((value) => ({ value, label: pgT(MODE_LABEL_KEYS[value]) }));

    // 헤더 드롭다운과 같은 저장 값을 본다 (여기서 저장하면 헤더도 즉시 따라간다)
    const currentMode = readMode();

    for (const m of modes) {
        const radioWrap = el("div", "bpg-settings-radio-item");
        const radio = el("input", "bpg-settings-radio");
        radio.type = "radio";
        radio.name = "bpg_model_mode";
        radio.value = m.value;
        if (m.value === currentMode) radio.checked = true;
        const radioLabel = el("span", "bpg-settings-radio-label", m.label);
        radioLabel.dataset.i18n = MODE_LABEL_KEYS[m.value];
        radioWrap.append(radio, radioLabel);
        radioWrap.addEventListener("click", () => {
            radio.checked = true;
        });
        modeRadioWrap.appendChild(radioWrap);
    }

    modeSection.appendChild(modeRadioWrap);
    body.appendChild(modeSection);

    const foot = el("div", "bpg-settings-foot");
    const saveBtn = el("button", "bpg-settings-btn-save", pgT("save_settings"));
    saveBtn.type = "button";
    saveBtn.dataset.i18n = "save_settings";
    saveBtn.addEventListener("click", () => {
        const radios = overlay.querySelectorAll('input[name="bpg_model_mode"]');
        let selected = "균형";
        for (const r of radios) {
            if (r.checked) {
                selected = r.value;
                break;
            }
        }
        const mode = writeMode(selected);
        pushToServer(readKeys(), readModel(), mode);
        refreshHeaderState(); // 헤더의 «속도/균형/품질» 드롭다운도 이 값으로
        showToast(pgT("settings_saved"), "ok", 2500);
        overlay.remove();
    });
    const closeBtn = el("button", "bpg-settings-btn-close", pgT("close"));
    closeBtn.type = "button";
    closeBtn.dataset.i18n = "close";
    closeBtn.addEventListener("click", () => overlay.remove());
    foot.append(saveBtn, closeBtn);

    panel.append(head, body, foot);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.remove();
    });
}

// export: 노드를 실제로 만들지 않고 이 확인 경로만 검사할 수 있게 (회귀 테스트용)
export async function verifyKey(key) {
    const target = (key || "").trim();
    if (!target) {
        showToast(pgT("key_required"), "warn", 3400);
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
            showToast(pgT("key_ok"), "ok", 2600);
            return true;
        }
        // 실패 이유 없이 "연결 실패"만 뜨면 사용자가 키 문제인지 네트워크인지 못 가른다 (P2-A)
        showToast(keyFailMessage(data), "err", 6200);
        return false;
    } catch (err) {
        console.warn("[BadaPromptGen] API key check failed:", err);
        // fetch 자체가 실패하면(서버 종료) 이유 문자열은 사용자에게 소용없다 → 정해진 문구
        showToast(pgT("key_fail_unreachable"), "err", 6200);
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

function buildHeader(node, widgets) {
    const root = el("div", "bpg-root");
    swallow(root);

    // -- 모델 모드 줄 (예전 «모델 이름» 선택 자리) ----------------------------
    // 이 자리는 한때 모델 이름을 고르는 드롭다운이었다. 그런데 노드·서버 둘 다
    // 모드 캐스케이드(server/gemini_api.py:model_cascade) 가 속도/균형/품질 셋 중 하나로
    // 항상 해석하므로, 여기서 고른 모델 이름은 생성 결과에 전혀 닿지 않았다(죽은 컨트롤).
    // 같은 자리에서 이제 모드를 고른다. ⚙️ 모델 설정 팝업의 라디오와 같은 값을 공유한다.
    const row2 = el("div", "bpg-row");
    const modeSel = el("select", "bpg-select");

    function fillModes() {
        modeSel.innerHTML = "";
        for (const value of MODE_CHOICES) {
            const opt = el("option", null, pgT(MODE_LABEL_KEYS[value]));
            opt.value = value;
            modeSel.appendChild(opt);
        }
    }

    function renderMode() {
        if (!modeSel.options.length) fillModes();
        modeSel.value = readMode();
        modeSel.title = pgT("mode_tip");
    }

    modeSel.addEventListener("change", () => {
        // 사전에 없는 값으로의 저장은 허용하지 않는다 — readMode() 가 기본 값으로 되돌린다
        const mode = writeMode(modeSel.value);
        renderMode();
        pushToServer(undefined, readModel(), mode);
        refreshHeaderState(); // ⚓ 노드가 여러 개면 다른 노드의 드롭다운도 함께
        showToast(`${pgT("saved")} · ${modeLabel(mode)}`, "ok", 1800);
    });

    // 활성 키 개수 안내 — 글자만 놓는다(누르는 게 아님). 0개일 때만 경고색.
    const keyCount = el("span", "bpg-keycount");

    function renderKeyCount() {
        const n = enabledKeyCount();
        keyCount.textContent = pgT("key_count", { n });
        keyCount.classList.toggle("bpg-keycount--zero", n === 0);
        keyCount.title = pgT("key_count_tip");
    }

    const settingsBtn = el("button", "bpg-btn bpg-btn--manage", pgT("settings"));
    settingsBtn.type = "button";
    settingsBtn.dataset.i18n = "settings";
    settingsBtn.title = pgT("settings_tip");
    settingsBtn.addEventListener("click", () => openSettingsModal());
    row2.append(modeSel, keyCount, settingsBtn);
    root.appendChild(row2);

    // -- toggle + manage row -------------------------------------------------
    const row3 = el("div", "bpg-row bpg-row--toggles");
    const cards = {};

    function makeCard(widgetName, labelKey, tipKey) {
        const widget = widgets[widgetName];
        const card = el("div", "bpg-card");
        card.title = pgT(tipKey);
        const label = el("span", "bpg-card-label", pgT(labelKey));
        label.dataset.i18n = labelKey;
        card.append(label);
        const paint = () => {
            card.classList.toggle("bpg-card--on", !!widget.value);
            card.title = pgT(tipKey);
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

    row3.appendChild(makeCard("enhance", "enhance", "enhance_tip"));
    row3.appendChild(makeCard("uncensored", "uncensored", "uncensored_tip"));

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
            + "node module. Restart ComfyUI, otherwise the aspect-ratio value is discarded.",
        );
    }
    const ASPECT_RATIOS = [
        "1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "9:21", "21:9",
    ];
    const ratioBox = el("div", "bpg-card bpg-card--ratio");
    const ratioLabel = el("span", "bpg-card-label", pgT("aspect_ratio"));
    ratioLabel.dataset.i18n = "aspect_ratio";
    const ratioSel = el("select", "bpg-ratio-select");
    for (const value of ASPECT_RATIOS) {
        const opt = el("option", null, value);
        opt.value = value;
        ratioSel.appendChild(opt);
    }
    const AUTO_RATIO = "";
    const autoOpt = el("option", null, pgT("aspect_ratio_auto"));
    autoOpt.value = AUTO_RATIO;
    ratioSel.insertBefore(autoOpt, ratioSel.firstChild);
    ratioBox.append(ratioLabel, ratioSel);

    function syncRatio() {
        const current = ratioWidget ? String(ratioWidget.value ?? AUTO_RATIO) : AUTO_RATIO;
        ratioSel.value = [...ratioSel.options].some((o) => o.value === current) ? current : AUTO_RATIO;
        ratioBox.title = pgT("aspect_ratio_tip");
        // The auto option is not [data-i18n], so relabel it explicitly on a language switch.
        autoOpt.textContent = pgT("aspect_ratio_auto");
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
            ratioBox.title = pgT("aspect_ratio_broken");
            showToast(pgT("aspect_ratio_broken"), "err", 6000);
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

    // -- 시스템 프롬프트 버튼 (화면 비율 카드 바로 오른쪽, 같은 행) --------
    const systemPromptBtn = el("button", "bpg-btn bpg-btn--manage bpg-btn--inline", pgT("system_prompt"));
    systemPromptBtn.type = "button";
    systemPromptBtn.dataset.i18n = "system_prompt";
    systemPromptBtn.title = pgT("system_prompt_tip");
    systemPromptBtn.addEventListener("click", async () => {
        systemPromptBtn.disabled = true;
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
            showToast(pgT("manage_load_fail"), "err", 5000);
        } finally {
            systemPromptBtn.disabled = false;
        }
    });
    row3.appendChild(systemPromptBtn);
    root.appendChild(row3);

    const targetGroup = el("div", "bpg-picker-group");
    const targetLabel = el("div", "bpg-picker-label", pgT("target"));
    targetLabel.dataset.i18n = "target";
    const targetButtons = el("div", "bpg-choice-row");
    targetGroup.append(targetLabel, targetButtons);

    const submenuGroup = el("div", "bpg-picker-group");
    const submenuLabel = el("div", "bpg-picker-label", pgT("submenu"));
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
            const text = pgT(key);
            w.label = text;
            if (w.options) w.options.label = text;
        }
        if (widgets.ui_language) widgets.ui_language.value = BadaI18n.lang;
        if (widgets.enhance) widgets.enhance.tooltip = pgT("enhance_tip");
        if (widgets.uncensored) widgets.uncensored.tooltip = pgT("uncensored_tip");
        if (widgets.target) widgets.target.tooltip = pgT("target_tip");
        if (widgets.submenu) widgets.submenu.tooltip = pgT("submenu_tip");
        if (widgets.duration) widgets.duration.tooltip = pgT("duration_tip");
        const requestInput = widgets.request_text?.inputEl || widgets.request_text?.element;
        if (requestInput) requestInput.placeholder = pgT("request_placeholder");
        settingsBtn.title = pgT("settings_tip");
    }

    const langSub = () => {
        root.querySelectorAll("[data-i18n]").forEach((target) => {
            target.textContent = pgT(target.dataset.i18n);
        });
        Object.values(cards).forEach((c) => c.paint());
        syncRatio();
        fillModes();      // <option> 은 [data-i18n] 로 안 잡힌다 → 다시 채운다
        renderMode();
        renderKeyCount(); // «API Key = N 개» 도 언어에 따라 다시 쓴다
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

    fillModes();
    renderMode();
    renderKeyCount();
    // 서버에는 로컬이 비어 있던 값(모드·키 목록) 이 들어올 수 있다 → 그 뒤 다시 그린다
    pullFromServer().then((data) => {
        if (!data) return;
        renderMode();
        renderKeyCount();
    });
    return { root, cards, renderTargetButtons, renderSubmenuButtons, renderMode, renderKeyCount };
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
        header?.renderMode?.();
        header?.renderKeyCount?.();
        if (header?.cards) Object.values(header.cards).forEach((c) => c.paint());
    }
}

// 모드·활성 키 개수는 모든 ⚓ 노드가 같은 저장 값(localStorage) 을 본다.
// 그래서 한 노드에서 바꾸거나 팝업에서 키를 늘리면 나머지 노드 헤더도 함께 그린다.
// (refreshAllNodes() 는 콤보 목록까지 다시 짜는 무거운 작업이라 이 둘만 갱신할 땐 쓰지 않는다)
function refreshHeaderState() {
    for (const node of app.graph?._nodes || []) {
        if (node.type !== NODE_CLASS) continue;
        const header = node.__bpgHeader;
        header?.renderMode?.();
        header?.renderKeyCount?.();
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

    // [Node 2.0 프레임 가드] bada_async_gemini.js와 동일한 패턴 — 프론트엔드의
    // "요소 실측폭 -> widget.width -> .dom-widget 호스트폭" 자기참조 되먹임은
    // 위젯이 잠시 분리된 상태(= 토글/재렌더)의 낡은 값을 영구 고착시킨다.
    // 폭의 유일한 진실 원천은 node.size[0]이므로 getter를 그 값에 연결하고
    // 되먹임 대입은 버린다. (2026-10-05 Gemini 노드에서 실측 검증됨)
    if (domWidget) {
        Object.defineProperty(domWidget, "width", {
            configurable: true,
            get() { return node.size ? node.size[0] : HEADER_WIDTH + NODE_WIDTH_INSET; },
            set() { /* 프론트엔드의 자기 되먹임 — 의도적으로 무시 */ },
        });
    }

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
    let remountPending = false;

    let lastWrap = null;
    const calibrateHeight = () => {
        if (calibrations >= 3) return;
        if (!document.contains(header.root)) { remountPending = true; return; }
        const wrap = header.root.parentElement;
        if (!wrap) return;
        if (wrap !== lastWrap) {
            // Node 2.0(Vue 오버레이) <-> 1.X(LiteGraph) 토글로 위젯 호스트가 통째로
            // 교체된다. 새 호스트에서는 이전 호스트 기준으로 세운 보정 예산/슬랙이
            // 무의미하므로 처음부터 다시 측정한다.
            lastWrap = wrap;
            remountPending = false;
            calibrations = 0;
        }
        const scale = (app.canvas && app.canvas.ds && app.canvas.ds.scale) || 1;
        const contentH = Math.ceil(header.root.getBoundingClientRect().height / scale);
        const wrapH = Math.round(wrap.getBoundingClientRect().height / scale);
        if (contentH < 8) return;
        if (wrapH < 8) {
            // Node 2.0에서 호스트 실측이 잠시 0이 되는 구간(재렌더 중) — 카드 자체만
            // 믿고 grow-only로 보정한다. (줄어드는 방향은 절대 취하지 않는다)
            const grown = contentH + 16;
            if (grown - domHeight > 1) {
                domHeight = grown;
                calibrations += 1;
                const need = node.computeSize ? node.computeSize() : [HEADER_WIDTH + 26, 520];
                if (node.size[0] + 1 < need[0] || node.size[1] + 1 < need[1]) {
                    node.setSize([Math.max(node.size[0], need[0]), Math.max(node.size[1], need[1])]);
                }
                node.setDirtyCanvas?.(true, true);
            }
            return;
        }
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

    // ── 시각적 순서 + 위치 기반 직렬화 호환 ───────────────────────────────────
    // 이 프론트엔드(Node 2.0)는 DOM 위젯을 `position: fixed` + JS가 계산한 화면
    // 좌표로 배치한다 — 즉 배치는 CSS 흐름이 아니라 **node.widgets 배열 순서**가
    // 결정한다. (실측: 배열에서 domWidget을 앞/뒤로 옮기면 헤더와 입력창의 top
    // 좌표가 서로 뒤바뀐다. CSS order·DOM 재이동은 전부 무효.)
    //
    // 그래서 헤더를 위에 올리려면 배열에서 domWidget이 맨 앞이어야 한다. 그런데
    // widgets_values 는 **위치 기반**으로 저장/복원되므로, 배열을 재정렬하면 다른
    // 순서로 저장된 옛 워크플로우는 로드 때 값이 한 칸씩 밀린다
    // (duration ← "en", target ← 서브메뉴 이름 …). 아래에서 PG_CANON_ORDER 로
    // 통일 저장하고, configure 에서 값 타입을 보고 옛 순서를 되돌려 이름 기준으로
    // 복원한다.
    const PG_CANON_ORDER = [
        "bada_promptgen_ui", "enhance", "uncensored", "target", "submenu",
        "aspect_ratio", "ui_language", "duration", "request_text",
    ];
    // 과거에 저장됐을 수 있는 위치 순서들 (한 값 = 위젯 하나).
    const PG_LEGACY_ORDERS = [
        PG_CANON_ORDER, // 현β 순서 (재정렬된 배열)
        ["enhance", "uncensored", "target", "submenu", "aspect_ratio", "request_text", "duration", "ui_language", "bada_promptgen_ui"], // 재정렬 전 INPUT_TYPES 순서
        ["bada_promptgen_ui", "enhance", "uncensored", "target", "submenu", "ui_language", "duration", "request_text"], // aspect_ratio 이전 + 재정렬
        ["enhance", "uncensored", "target", "submenu", "request_text", "duration", "ui_language", "bada_promptgen_ui"], // aspect_ratio 이전 + INPUT_TYPES
    ];

    // 배열을 정본 순서로 재배열한다 (미래에 추가된 위젯은 끝에 보존).
    const reorderToCanonical = () => {
        const byName = {};
        for (const w of node.widgets || []) byName[w.name] = w;
        const extra = (node.widgets || []).filter((w) => !PG_CANON_ORDER.includes(w.name));
        const ordered = [];
        for (const nm of PG_CANON_ORDER) if (byName[nm]) ordered.push(byName[nm]);
        node.widgets.length = 0;
        node.widgets.push(...ordered, ...extra);
    };

    // 값 타입이 위젯 성격과 얼마나 맞는지 점수화 — 가장 잘 맞는 옛 순서를 고른다.
    const scoreOrder = (order, values) => {
        if (order.length !== values.length) return -1;
        let score = 0;
        for (let i = 0; i < order.length; i++) {
            const nm = order[i], v = values[i];
            if (nm === "duration" && typeof v === "number") score++;
            else if ((nm === "enhance" || nm === "uncensored") && typeof v === "boolean") score++;
            else if ((nm === "target" || nm === "submenu" || nm === "aspect_ratio" ||
                      nm === "request_text" || nm === "ui_language") && typeof v === "string") score++;
            else if (nm === "bada_promptgen_ui" && (v === "" || v == null)) score++;
        }
        return score;
    };

    const patchConfigure = () => {
        if (node.__bpgConfigurePatched) return;
        node.__bpgConfigurePatched = true;
        reorderToCanonical();
        // 생성 시점의 기본값 — configure 는 로드 직후에 불리므로 여기서 잡은 값이
        // 곧 "기본값"이다. (프론트엔드가 widget.options.default 를 지워서 못 쓴다.)
        const widgetDefaults = {};
        for (const w of node.widgets || []) widgetDefaults[w.name] = w.value;
        const originalConfigure = node.configure;
        node.configure = function (info) {
            const r = originalConfigure ? originalConfigure.apply(this, arguments) : undefined;
            try {
                if (info && Array.isArray(info.widgets_values) && info.widgets_values.length) {
                    const values = info.widgets_values;
                    const names = this.widgets.map((w) => w.name);
                    const byOrder = (order) => {
                        const m = {};
                        order.forEach((nm, i) => { m[nm] = values[i]; });
                        return m;
                    };
                    // 기본(현재 배열 순서)이 가장 자연스러운 후보다. 더 잘 맞는
                    // 옛 순서가 있을 때만 갈아탄다 (정상 워크플로우는 건드리지 않음).
                    let best = names;
                    let bestScore = scoreOrder(names, values);
                    for (const order of PG_LEGACY_ORDERS) {
                        const s = scoreOrder(order, values);
                        if (s > bestScore) { bestScore = s; best = order; }
                    }
                    const chosen = byOrder(best);
                    for (const w of this.widgets) {
                        if (Object.prototype.hasOwnProperty.call(chosen, w.name) && chosen[w.name] !== undefined) {
                            w.value = chosen[w.name];
                        } else if (Object.prototype.hasOwnProperty.call(widgetDefaults, w.name)) {
                            // 옛 순서에 없던 위젯(예: 나중에 추가된 aspect_ratio)은
                            // 기본 대입이 남긴 어긋난 값을 지우고 기본값으로 되돌린다.
                            w.value = widgetDefaults[w.name];
                        }
                    }
                    // 값이 바뀌었을 수 있으니 헤더(모드·키 개수·서브메뉴 버튼)를 다시 그린다.
                    try { node.__bpgHeader?.renderSubmenuButtons?.(); } catch (_) { /* cosmetic */ }
                    node.setDirtyCanvas?.(true, true);
                }
            } catch (err) {
                console.warn("[BadaPromptGen] configure remap failed:", err);
            }
            return r;
        };
    };
    patchConfigure();

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
    const MIN_NODE_HEIGHT = 560;
    // Nodes 2.0는 위젯을 재배치할 때 computeSize를 거치지 않고 node.size에
    // 직접 대입하는 경로를 쓴다. 카드는 HEADER_WIDTH 이하로 줄 수 없는데 프레임만
    // 그 아래로 내려가면 카드가 프레임 밖으로 넘쳐 보인다 — 사용자가 본
    // "2.0에서 외부 틀이 확 줄어든" 화면이 정확히 이 상태다.
    // 하한 아래로만 올리는 grow-only 복원이라 사용자 드래그로는 줄일 수 있다.
    const enforceNodeFloor = () => {
        if (!node.size) return false;
        let restored = false;
        if (node.size[0] < MIN_NODE_WIDTH) { node.size[0] = MIN_NODE_WIDTH; restored = true; }
        if (node.size[1] < MIN_NODE_HEIGHT) { node.size[1] = MIN_NODE_HEIGHT; restored = true; }
        return restored;
    };
    const originalComputeSize = node.computeSize;
    node.computeSize = function (out) {
        const size = originalComputeSize ? originalComputeSize.call(this, out || [0, 0]) : (out || [0, 0]);
        size[0] = Math.max(size[0], MIN_NODE_WIDTH);
        size[1] = Math.max(size[1], MIN_NODE_HEIGHT);
        return size;
    };

    if (!node.size || node.size[0] < HEADER_WIDTH + 26 || node.size[1] < 520) {
        node.setSize([446, 560]);
    }
    syncHeaderWidth();

    const originalOnResize = node.onResize;
    node.onResize = function (size) {
        // 마우스로 틀을 줄일 때의 하한 클램프 (Gemini 노드와 동일 패턴).
        if (size) {
            if (size[0] < MIN_NODE_WIDTH) size[0] = MIN_NODE_WIDTH;
            if (size[1] < MIN_NODE_HEIGHT) size[1] = MIN_NODE_HEIGHT;
        }
        const result = originalOnResize ? originalOnResize.apply(this, arguments) : undefined;
        syncHeaderWidth();
        return result;
    };
    node.__bpgSyncHeaderWidth = syncHeaderWidth;

    // 1.X(LiteGraph 렌더)에서는 프레임 단위 점검이 유일한 실시간 창이다.
    // Gemini 노드의 syncContainerSize와 같은 패턴이고, 값이 그대로면 즉시 return 한다.
    const originalOnDrawForeground = node.onDrawForeground;
    node.onDrawForeground = function (ctx) {
        if (enforceNodeFloor()) app.graph?.setDirtyCanvas?.(true, true);
        syncHeaderWidth();
        if (originalOnDrawForeground) originalOnDrawForeground.apply(this, arguments);
    };

    // ---- Node 2.0 <-> 1.X 재부착 처리 ---------------------------------------
    // Nodes 2.0 설정을 토글하면 프론트엔드가 위젯 호스트를 통째로 옮기지만
    // (canvas DOM -> Vue 오버레이 -> 복귀), 노드 JS 상태(보정 예산, domHeight
    // 스냅샷)는 토글 전 값으로 남아 새 호스트에 낡은 값을 씌운다 — 이것이
    // "토글하면 창이 망가진다"의 원인이었다. 호스트 (재)부착을 감지해 예산을
    // 리셋하고 다시 측정한다.
    let unwatchRemount = null;
    if (typeof MutationObserver !== "undefined") {
        let wasAttached = document.contains(header.root);
        let lastHost = header.root.parentElement;
        unwatchRemount = __badaWatchBodyRemount(() => {
            const attached = document.contains(header.root);
            const host = header.root.parentElement;
            if (attached && host && (host !== lastHost || !wasAttached)) {
                lastHost = host;
                wasAttached = true;
                remountPending = false;
                calibrations = 0;
                // Nodes 2.0(Vue 오버레이)으로 토글하면 onDrawForeground가 더 이상
                // 불리지 않는 경로가 남는다. 재부착 지점이 새 호스트 기준으로
                // 카드 폭을 node.size에서 다시 계산할 수 있는 유일한 창이다.
                if (enforceNodeFloor()) app.graph?.setDirtyCanvas?.(true, true);
                syncHeaderWidth();
                scheduleCalibration(50);
                scheduleCalibration(600);
            }
            wasAttached = attached;
        });
    }

    const originalOnConfigure = node.onConfigure;
    node.onConfigure = function () {
        const r = originalOnConfigure ? originalOnConfigure.apply(this, arguments) : undefined;
        // 그래프 재로딩 시 프론트엔드의 크기 재계산이 최소치 아래로 내리지 못하게
        // 선제 복원한다. (Gemini 노드의 onConfigure 복원과 동일한 안전장치)
        if (this.size) {
            if (this.size[0] < MIN_NODE_WIDTH) this.size[0] = 446;
            if (this.size[1] < 520) this.size[1] = 560;
        }
        calibrations = 0;
        remountPending = false;
        syncHeaderWidth();
        scheduleCalibration(60);
        scheduleCalibration(500);
        return r;
    };

    let resizeObserver = null;
    if (typeof ResizeObserver !== "undefined") {
        // The observer reports content growth (wrapped rows, longer labels); re-measure
        // through the scheduler so bursts collapse into one calibration.
        resizeObserver = new ResizeObserver(() => scheduleCalibration(0));
        resizeObserver.observe(header.root);
    }
    requestAnimationFrame(() => requestAnimationFrame(calibrateHeight));
    setTimeout(calibrateHeight, 300);
    // Node 2.0이 요소를 분리했다가 다시 붙이는 시점의 rAF/RO 측정은 전부 실패한다 —
    // remountPending이 서 있으면 800ms/2500ms에 한 번씩 다시 측정한다.
    const bootstrapRemountCheck = (delay) => setTimeout(() => {
        if (remountPending && document.contains(header.root)) {
            remountPending = false;
            calibrations = 0;
            scheduleCalibration(0);
        }
    }, delay);
    bootstrapRemountCheck(800);
    bootstrapRemountCheck(2500);

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
        if (unwatchRemount) {
            unwatchRemount();
            unwatchRemount = null;
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
