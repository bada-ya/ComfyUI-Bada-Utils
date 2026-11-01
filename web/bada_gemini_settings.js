/**
 * ⚓ Bada Gemini 공통 설정 모듈 (2026-11-01 라운드 14)
 *
 * ⚓ Bada Prompt Generator와 ⚓ Bada Async Gemini Studio가
 * **API 키 목록 / 비활성 키**를 **완전 공유**하도록 분리한 모듈.
 *
 * - localStorage 키: `bada_gemini_api_keys`, `bada_gemini_api_disabled`
 * - 서버 동기화: `config.json` (POST /api/bada/gemini/config, GET 동일)
 * - 두 노드 모두 이 모듈을 import해 사용 → 한쪽에서 키를 바꾸면 다른 쪽 즉시 반영
 *
 * 「어느 모델을 쓸까」는 이 모듈의 사실이 아니다 (2026-11-01 모델 설정 제거).
 * 모델은 server/gemini_api.py 의 키 배치 표(KEY_CASCADES/QUALITY_KEY_CASCADES) 가 정한다.
 */

import { BadaI18n } from "./bada_i18n.js";

// ──────────────────────────────────────────────────────────────────────────────
// 상수
// ──────────────────────────────────────────────────────────────────────────────
export const KEYS_LS = "bada_gemini_api_keys";
export const DISABLED_LS = "bada_gemini_api_disabled";
export const CONFIG_URL = "/api/bada/gemini/config";

// 활성 키 상한 — server/gemini_api.py::MAX_KEYS 와 같은 값이어야 한다 (KEY_CASCADES 가 1~4 키만
// 안다). 헤더의 «최대 n개» 와 설정 창 노트가 이 상수를 채워 넣으므로 숫자를 여러 곳에 박지 않는다.
export const KEY_CAP = 4;

// i18n 헬퍼 (pg_ 네임스페이스 — bada_prompt_generator.js 와 동일)
const pgT = (key, params) => BadaI18n.t("pg_" + key, params);

// ──────────────────────────────────────────────────────────────────────────────
// DOM 생성 헬퍼 (bada_prompt_generator.js 의 el() 과 동일)
// ──────────────────────────────────────────────────────────────────────────────
function el(tag, cls, text) {
    const created = document.createElement(tag);
    if (cls) created.className = cls;
    if (text != null) created.textContent = text;
    return created;
}

// 토스트 (bada_shared.js 의 showToast 가 있으면 재사용, 없으면 자체 구현)
let _sharedShowToast = null;
try {
    // 동적 import 는 모듈 레벨에서 불가하므로, 호출 시점에 주입받도록 설계
    // 여기서는 기본 토스트만 제공 (호출측이 override 가능)
} catch (_) {}

export function setToastHandler(fn) {
    _sharedShowToast = fn;
}

function showToast(msg, level = "info", ms = 3000) {
    if (_sharedShowToast) {
        _sharedShowToast(msg, level, ms);
        return;
    }
    // 폴백: 기존 토스트 호스트 재사용 또는 신규 생성
    let host = document.getElementById("bpg-toast-host");
    if (!host) {
        host = document.createElement("div");
        host.id = "bpg-toast-host";
        host.className = "bpg-toast-host";
        document.body.appendChild(host);
    }
    const el_ = document.createElement("div");
    el_.className = `bpg-toast bpg-toast--${level}`;
    el_.textContent = String(msg);
    host.appendChild(el_);
    requestAnimationFrame(() => el_.classList.add("bpg-toast--in"));
    setTimeout(() => {
        el_.classList.remove("bpg-toast--in");
        setTimeout(() => el_.remove(), 320);
    }, Math.max(900, ms));
}

// ──────────────────────────────────────────────────────────────────────────────
// API 키 읽기/쓰기 (localStorage)
// ──────────────────────────────────────────────────────────────────────────────
// «이 브라우저가 키 사본을 직접 만든 적이 있는가». 서버는 더 이상 평문 키를 주지
// 않으므로 (server/gemini_api.py::get_config_handler, 2026-11-01), 이 값이 false 인
// 브라우저는 키 «값» 을 모르는 상태다 — 화면이 비어 있는 것과 서버에 키가 없는 것은
// 다른 말이므로 여기서 갈아탄 브라우저가 빈 목록으로 서버를 덮어쓰는 일은 금지된다
// (아래 pushToServer 의 가드). 키를 더하거나 빼거나 끈 순간에만 참이 된다.
let _localTouched = false;

export function readKeys() {
    try {
        const raw = localStorage.getItem(KEYS_LS);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.filter((k) => k && k.trim()) : [];
    } catch (_) {
        return [];
    }
}

export function writeKeys(keys) {
    const arr = Array.isArray(keys) ? keys.filter((k) => k && k.trim()) : [];
    _localTouched = true; // 키 목록을 «직접» 고쳤다는 기록 — 마지막 키를 지운 것도 여기에 해당한다
    if (arr.length) localStorage.setItem(KEYS_LS, JSON.stringify(arr));
    else localStorage.removeItem(KEYS_LS);
    return arr;
}

export function addKey(key) {
    const k = (key || "").trim();
    if (!k) return readKeys();
    const cur = readKeys();
    if (cur.includes(k)) return cur;
    cur.push(k);
    writeKeys(cur);
    return cur;
}

export function removeKey(key) {
    const k = (key || "").trim();
    const cur = readKeys().filter((x) => x !== k);
    writeKeys(cur);
    return cur;
}

// ──────────────────────────────────────────────────────────────────────────────
// 비활성 키 읽기/쓰기 (localStorage)
// ──────────────────────────────────────────────────────────────────────────────
export function readDisabled() {
    try {
        const raw = localStorage.getItem(DISABLED_LS);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.filter((k) => k && k.trim()) : [];
    } catch (_) {
        return [];
    }
}

export function writeDisabled(list) {
    const arr = Array.isArray(list)
        ? [...new Set(list.filter((k) => k && k.trim()))]
        : [];
    if (arr.length) localStorage.setItem(DISABLED_LS, JSON.stringify(arr));
    else localStorage.removeItem(DISABLED_LS);
    return arr;
}

export function isKeyEnabled(key) {
    return !readDisabled().includes(key);
}

export function setKeyEnabled(key, enabled) {
    const rest = readDisabled().filter((k) => k !== key);
    if (!enabled) rest.push(key);
    return writeDisabled(rest);
}

// 실제 API 호출에 쓰이는 키 (활성 키만)
export function enabledKeys() {
    const disabled = readDisabled();
    return readKeys().filter((k) => !disabled.includes(k));
}

export function enabledKeyCount() {
    return enabledKeys().length;
}

// ──────────────────────────────────────────────────────────────────────────────
// 모델 관련 코드 전체 제거 (2026-11-01). «먼저 시도하는 모델» 선택은 사라졌고
// 모델은 서버 표(KEY_CASCADES/QUALITY_KEY_CASCADES + generation_mode) 가 정한다.
// 이 파일에는 모델 이름·목록을 읽는 코드가 있어서는 안 된다 — 남아 있으면 그 순간
// 프론트가 모델 목록의 두 번째 출처가 되어 구 모델(3.8-flash 등) 이 화면에 되살아난다.
// ──────────────────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────────────
// 마스킹 / 중복 검사
// ──────────────────────────────────────────────────────────────────────────────
export function maskKey(key) {
    const k = String(key || "");
    return k.length > 8 ? k.slice(0, 4) + "••••••••" + k.slice(-4) : "••••••••";
}

export function findDuplicateKey(key, list) {
    const k = String(key || "").trim();
    if (!k) return null;
    const arr = list || readKeys();
    return arr.find((x) => String(x || "").trim() === k) || null;
}

// ──────────────────────────────────────────────────────────────────────────────
// 서버 동기화 (config.json ↔ localStorage)
//
// 서버는 이 목록이 저장된 config.json 을 유일한 키·모델 출처로 읽는다(Async 생성·채팅과
// ⚓ Bada Prompt Generator 큐 노드 포함 — nodes/bada_prompt_generator.py::resolve_api_keys).
// 그런데 «창에서 키를 지우고 즉시 생성» 을 누르면 디바운스된 저장 하나가 경쟁으로 남는다.
// 실행 경로는 flushToServer() 를 불러 보류분을 먼저 붙여 넣는다.
// ──────────────────────────────────────────────────────────────────────────────
const PUSH_DEBOUNCE_MS = 400;

let _syncTimer = null;
let _pending = null;   // 보류 중인 저장 본문
let _inFlight = null;  // 지금 달리고 있는 POST
// GET 이 알려주는 «서버 쪽 사정» — 평문은 없고 개수·마스킹만 있다 (pullFromServer 가 갱신).
let _srvStatus = { key_count: 0, key_count_enabled: 0, masked_keys: [] };

function sendToServer(body) {
    const task = (async () => {
        try {
            const res = await fetch(CONFIG_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (!data.success) console.warn("[BadaGeminiSettings] config.json sync failed:", data.error);
            return !!data.success;
        } catch (err) {
            console.warn("[BadaGeminiSettings] config.json sync error:", err);
            return false;
        }
    })();
    _inFlight = task;
    task.then(() => { if (_inFlight === task) _inFlight = null; });
    return task;
}

export function pushToServer(keys) {
    // debounce — 매 키 입력마다 서버를 치지 않는다. 실행 직전 동기화가 필요하면 flushToServer().
    // `default_model` 은 보내지 않는다 (2026-11-01 모델 설정 제거): 순차 시드의 기본값은
    // 서버가 소유하고, 옛 프론트가 보내도 POST 핸들러가 받지 않는다.
    const body = {};
    // «서버만 키를 아는» 브라우저(이 브라우저에서 키를 한 번도 넣지 않은 곳) 에서 빈 목록이
    // 나가면 그 자체가 서버 키 삭제다. 화면이 비어 있다고 서버가 빈 것이 아니므로, 지움은 이
    // 브라우저에서 키를 더하거나 빼거나 끈 뒤의 동작만 허용한다.
    const blindErase = Array.isArray(keys) && keys.length === 0
        && !hasLocalKeyDraft() && _srvStatus.key_count > 0;
    if (Array.isArray(keys) && !blindErase) body.api_keys = keys;
    body.api_disabled = readDisabled();
    // blind 상태의 «설정 저장» 은 아무 일이 아닌 버튼이어야 한다. 빈 본문까지 POST 하면
    // 서버의 활성/비활성 표시만 조용히 초기화된다.
    if (blindErase && !body.api_disabled.length) return;
    _pending = body;
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(() => {
        _syncTimer = null;
        const queued = _pending;
        _pending = null;
        sendToServer(queued);
    }, PUSH_DEBOUNCE_MS);
}

/**
 * 보류 중인 config.json 저장을 즉시 붙여 넣고, 달리고 있는 저장이 끝나기를 잠깐 기다린다.
 * 생성·채팅 실행 직전 한 번씩 부른다. 반환값은 «기다림이 상한 안에 끝났는가» — false 라도
 * 요청은 계속 달리므로 호출 측은 그냥 진행한다(서버가 한 박자 옛 config 를 읽을 수 있을 뿐).
 */
export function flushToServer(timeoutMs = 1500) {
    if (_syncTimer) {
        clearTimeout(_syncTimer);
        _syncTimer = null;
    }
    if (_pending) {
        const queued = _pending;
        _pending = null;
        sendToServer(queued);
    }
    const waiting = _inFlight;
    if (!waiting) return Promise.resolve(true);
    // 상한이 없는 기다림은 «서버가 응답 없는데 생성 버튼이 영구 걸림» 으로 번다.
    return Promise.race([
        waiting.then(() => true, () => true),
        new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs)),
    ]);
}

export async function pullFromServer() {
    try {
        const res = await fetch(`${CONFIG_URL}?ts=${Date.now()}`);
        const data = await res.json();
        if (!data || !data.success) return null;
        // ⚠️ 이 함수는 서버 답으로 «지역 저장소를 고치지 않는다» (2026-11-01 평문 제거).
        // 옛 구현은 `data.api_keys` 를 localStorage 로 옮겨 담았는데, 그 한 줄 때문에 GET 응답이
        // 키 평문을 담고 다녀야 했다. 지금은 응답에 평문이 없고, 그래서 이 함수가 읽는 것은
        // 개수뿐이다. «서버에만 키가 있는» 첫 브라우저는 키를 붙여넣는 것으로 시작한다.
        // `models`/`default_model` 도 읽지 않는다 — 모델은 서버 표의 소지고 이 창은 키만 다룬다.
        const keyCount = Number(data.key_count) || 0;
        _srvStatus = {
            key_count: keyCount,
            // 옛 서버가 이 필드 없이 답하면 «전부 활성» 으로 본다 (비활성 정보를 구할 방법이 없다).
            key_count_enabled: Number.isFinite(data.key_count_enabled)
                ? data.key_count_enabled : keyCount,
            masked_keys: Array.isArray(data.masked_keys) ? data.masked_keys : [],
        };
        return data;
    } catch (err) {
        return null;
    }
}

/** GET 이 최근 알려준 서버 쪽 키 사정 (평문은 없다). 응답을 아직 못 받았다면 0. */
export function serverKeyStatus() {
    return _srvStatus;
}

/** 이 브라우저가 키 목록을 직접 만든 적이 있는가 (localStorage 사본 또는 이번 세션의 편집). */
export function hasLocalKeyDraft() {
    if (_localTouched) return true;
    try {
        return localStorage.getItem(KEYS_LS) !== null;
    } catch (_) {
        return false;
    }
}

/**
 * 헤더의 «API Key = n개» 가 쓸 개수 — 두 ⚓ 노드가 부르는 단일 출처.
 * 지역 사본이 있으면 그 값이 정답이고, 이 브라우저가 키를 한 번도 만진 적이 없을 때만
 * 서버가 알려준 활성 개수를 보여준다. 그렇지 않으면 첫 브라우저에서 헤더가 «0개» 로
 * 빨개지고 사용자는 없는 키를 넣으러 다닌다 (생성은 config.json 의 키로 잘도 돌아간다).
 */
export function displayKeyCount() {
    if (hasLocalKeyDraft()) return enabledKeyCount();
    return _srvStatus.key_count_enabled || 0;
}

// ──────────────────────────────────────────────────────────────────────────────
// 키 연결 테스트
// ──────────────────────────────────────────────────────────────────────────────
const KEY_FAIL_KEYS = {
    no_key: "key_required",
    invalid_key: "key_fail_invalid_key",
    quota: "key_fail_quota",
    bad_request: "key_fail_request",
    upstream: "key_fail_upstream",
    timeout: "key_fail_timeout",
    unreachable: "key_fail_unreachable",
};
const KEY_FAIL_ECHO_CODES = new Set(["no_key"]);

function keyFailMessage(data) {
    const raw = String((data && (data.error || data.message)) || "").replace(/\s+/g, " ").trim();
    const why = raw.length > 90 ? `${raw.slice(0, 90)}…` : raw;
    const code = String((data && data.code) || "");
    const known = Object.prototype.hasOwnProperty.call(KEY_FAIL_KEYS, code);
    const base = known ? pgT(KEY_FAIL_KEYS[code]) : pgT("key_fail");
    const dup = KEY_FAIL_ECHO_CODES.has(code) || (why.length >= 8 && base.includes(why));
    return why && !dup ? `${base} — ${why}` : base;
}

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
        showToast(keyFailMessage(data), "err", 6200);
        return false;
    } catch (err) {
        console.warn("[BadaGeminiSettings] API key check failed:", err);
        showToast(pgT("key_fail_unreachable"), "err", 6200);
        return false;
    }
}

export async function testAllKeys() {
    const keys = enabledKeys();
    if (!keys.length) {
        showToast(pgT("key_required"), "warn", 3400);
        return 0;
    }
    let okCount = 0;
    for (const key of keys) {
        if (await verifyKey(key)) okCount++;
    }
    showToast(`${pgT("keys_checked")}: ${okCount}/${keys.length}`,
        okCount === keys.length ? "ok" : "warn", 5000);
    return okCount;
}

// ──────────────────────────────────────────────────────────────────────────────
// 설정 모달 (API 키 다중 관리 전용) — 두 노드 공통 사용 · 모델 선택은 2026-11-01 제거
// ──────────────────────────────────────────────────────────────────────────────
// refreshHeaderFn: 호출측 노드 헤더 갱신 함수 (bada_prompt_generator.js 의 refreshHeaderState)
// syncServerFn: 서버 동기화 후 호출될 함수 (선택사항)
export function openSettingsModal({ onClose, refreshHeaderFn } = {}) {
    // ⚓ Bada Prompt Generator::openSettingsModal 과 동일한 창 (2026-11-01).
    // PG 측 함수는 안전상의 이유로 원본을 그대로 두고, 이 공통 모듈 쪽만 같은
    // 구조·같은 클래스·같은 i18n 키로_port_했다. 양쪽 창이 눈에 보이는 단위로
    // 차이가 나면 이 함수와 PG :306 을 대조해서 맞추면 된다.
    // 유일한 차이: 헤더 갱신이 PG 는 refreshHeaderState() 직접 호출,
    // 여기서는 호출측이 넘긴 refreshHeaderFn?.() (미전달 시 조용히 생략).
    const existing = document.getElementById("bpg-settings-modal");
    if (existing) existing.remove();

    // 닫기는 네 곳에서 일어난다(✕ · 확인 · 닫기 · 바깥 클릭) — 구독 정리까지 한 곳에서.
    const close = () => {
        overlay.remove();
        onClose?.();
    };

    const overlay = el("div", "bpg-settings-overlay");
    overlay.id = "bpg-settings-modal";

    const panel = el("div", "bpg-settings-panel");

    const head = el("div", "bpg-settings-head");
    const headTitle = el("div", "bpg-settings-title", pgT("settings"));
    headTitle.dataset.i18n = "settings";
    const headClose = el("button", "bpg-settings-close", "✕");
    headClose.type = "button";
    headClose.title = pgT("close");
    headClose.addEventListener("click", close);
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
        // «/app/apikey» 가 아니라 «/app/projects» 로 연다. 무료 한도는 프로젝트 단위로 계산되므로
        // (실측 429 본문의 quotaId 가 …PerDayPerProjectPerModel…) 새 프로젝트를 만들어 그 안에서
        // 키를 발급받아야 한도가 따로 돈다. 노트 세 번째 줄의 «+ 새 프로젝트 만들기» 도 이 화면에 있다.
        window.open("https://aistudio.google.com/app/projects", "_blank", "noopener");
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

    // 왜 키를 여러 개 넣는지, 키가 없다면 어디서 발급받는지 — 창이 넓은데도 툴팁에 숨겨 두면
    // 첫 사용자가 동선을 끝까지 스스로 못 끝낸다. 캐스케이드가 «활성 키 개수» 로 모델을 나누는
    // 설계 자체이므로 이 창에서 가장 중요한 설명이다.
    // data-i18n 을 붙이지 않는다: 재번역기는 파라미터 모르고 textContent 를 통째로 덮어쓰므로
    // {cap}/{get} 자리가 글자로 남게 된다.
    const note = el("div", "bpg-settings-note");
    const noteParams = { cap: KEY_CAP, get: pgT("get_key") };
    for (const noteKey of ["keys_note_cap", "keys_note_project", "keys_note_issue"]) {
        note.appendChild(el("p", "bpg-settings-note-line", pgT(noteKey, noteParams)));
    }
    keysSection.appendChild(note);

    function syncServer() {
        pushToServer(readKeys());
        // 키를 더하거나 빼거나 끈 즉시 모든 ⚓ 노드의 «API Key = N 개» 가 따라 간다.
        refreshHeaderFn?.();
    }

    function renderKeys() {
        keysList.replaceChildren();
        const keys = readKeys();
        const disabled = readDisabled();
        // «키가 없다» 와 «이 브라우저에 사본이 없다» 는 다른 말이다 (GET 이 키 평문을 주지 않는다).
        // 서버에는 키가 있는데 이 창 목록이 그것보다 적다면(첫 설치·다른 브라우저·config.json 을
        // 손본 경우) 그 사실을 먼저 밝혀야 한다. 아니면 사용자는 없는 키를 발급받으러 다니거나,
        // «저장» 한 번이 서버 키를 지울까 봐 창을 못 건드린다.
        const serverNotice = () => {
            const srvKeys = serverKeyStatus().key_count;
            if (srvKeys > keys.length) {
                keysList.appendChild(el("div", "bpg-settings-key-server", pgT("keys_server_only", { n: srvKeys })));
            }
        };
        if (!keys.length) {
            keysList.appendChild(el("div", "bpg-settings-key-empty", pgT("keys_empty")));
            serverNotice();
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
        serverNotice();
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

    // «먼저 시도하는 모델» 섹션은 2026-11-01 제거 — 모델은 서버 표(KEY_CASCADES/
    // QUALITY_KEY_CASCADES × generation_mode) 가 정하고, ⚙️ 창은 키 전용 창이다.
    // 여기에 모델 위젯을 다시 놓으면 그 순간 프론트가 모델 목록의 두 번째 출처가 된다.

    // 구 버전이 남긴 «선택 모델» 값 정리. 읽는 코드가 없어 무해하기는 하지만, 남아 있으면
    // «어디선가 쓰는 값 아닌가» 라는 오해가 헷갈림의 씨가 된다 — 구 라인업 이름(3.8-flash 등) 이
    // 이 키에 박혀 돌아다니는 것도 여기가 마지막이다.
    localStorage.removeItem("bada_gemini_model");

    const foot = el("div", "bpg-settings-foot");
    const saveBtn = el("button", "bpg-settings-btn-save", pgT("save_settings"));
    saveBtn.type = "button";
    saveBtn.dataset.i18n = "save_settings";
    saveBtn.addEventListener("click", () => {
        pushToServer(readKeys());
        refreshHeaderFn?.(); // 헤더의 «API Key = n개» 도 이 저장 직후 갱신
        showToast(pgT("settings_saved"), "ok", 2500);
        close();
    });
    const closeBtn = el("button", "bpg-settings-btn-close", pgT("close"));
    closeBtn.type = "button";
    closeBtn.dataset.i18n = "close";
    closeBtn.addEventListener("click", close);
    foot.append(saveBtn, closeBtn);

    panel.append(head, body, foot);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close();
    });
}

export function migrateLegacySingleKey() {
    const legacy = localStorage.getItem("bada_gemini_api_key");
    if (legacy && !readKeys().length) {
        writeKeys([legacy.trim()]);
        pushToServer(readKeys());
        localStorage.removeItem("bada_gemini_api_key");
    }
    // «bada_gemini_model» 은 더 이상 어디서도 읽지 않는 유물이다 (모델 설정 제거, 2026-11-01).
    // 예전에는 여기서 구 버전 선택값을 이어받았지만, 이제는 반대로 지우는 쪽이 migrate 다.
    localStorage.removeItem("bada_gemini_model");
}

// 모듈 로드 시 자동 마이그레이션
migrateLegacySingleKey();