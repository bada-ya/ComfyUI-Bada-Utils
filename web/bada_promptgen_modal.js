/**
 * ⚓ Bada 프롬프트 생성기 — "모델 관리" 모달
 * ---------------------------------------------------------------
 * `engines_registry.json` 의 `user_prompts` 를 CRUD 합니다.
 *   • 새로 만들기 / 수정 / 삭제 / ▲▼ 순서 이동
 *   • 공식 프롬프트(Qwen PE)를 템플릿으로 불러와 편집
 * 저장은 서버 REST API 를 통해 수행되며 저장 즉시 노드의
 * target / submenu 목록이 갱신됩니다 (mtime 캐시 자동 무효화).
 */
import { BadaI18n } from "./bada_i18n.js";

const REGISTRY_URL = "/api/bada/promptgen/registry";
const SAVE_URL = "/api/bada/promptgen/user_prompts/save";
const DELETE_URL = "/api/bada/promptgen/user_prompts/delete";
const MOVE_URL = "/api/bada/promptgen/user_prompts/move";

const M = {
    ko: {
        title: "⚙️ Bada 프롬프트 생성기 — 모델 관리",
        sub: "사용자 시스템 프롬프트를 등록·수정·삭제하고 순서를 바꿉니다.",
        listHead: "등록된 프롬프트",
        create: "＋ 새로 만들기",
        empty: "아직 등록된 프롬프트가 없습니다.\n「＋ 새로 만들기」를 눌러 시작하세요.",
        name: "이름",
        desc: "설명 (선택)",
        format: "출력 형식",
        text: "일반 텍스트",
        json: "JSON (구조화)",
        fields: "JSON 키 (쉼표 구분)",
        prompt: "시스템 프롬프트",
        promptPh: "예: 당신은 시네마틱 비디오 프롬프트 전문가입니다. …",
        template: "공식 프롬프트 템플릿",
        templateNone: "— 템플릿 선택 —",
        loadTemplate: "불러오기",
        save: "💾 저장",
        close: "닫기",
        newEntry: "새 프롬프트",
        confirmDelete: "「{name}」 항목을 삭제할까요?",
        needName: "이름을 입력해 주세요.",
        needPrompt: "시스템 프롬프트 내용을 입력해 주세요.",
        saved: "✅ 저장되었습니다",
        deleted: "🗑 삭제되었습니다",
        moved: "↕ 순서가 변경되었습니다",
        failed: "❌ 요청 실패",
        chars: "자",
        officialNote: "공식 프롬프트는 Qwen Research License 에 따르며 삭제할 수 없습니다.",
    },
    en: {
        title: "⚙️ Bada Prompt Generator — Model Manager",
        sub: "Create, edit, delete and reorder your custom system prompts.",
        listHead: "Registered prompts",
        create: "＋ New",
        empty: "No prompts registered yet.\nPress “＋ New” to start.",
        name: "Name",
        desc: "Description (optional)",
        format: "Output format",
        text: "Plain text",
        json: "JSON (structured)",
        fields: "JSON keys (comma separated)",
        prompt: "System prompt",
        promptPh: "e.g. You are a cinematic video prompt expert …",
        template: "Official prompt template",
        templateNone: "— choose template —",
        loadTemplate: "Load",
        save: "💾 Save",
        close: "Close",
        newEntry: "New prompt",
        confirmDelete: "Delete “{name}”?",
        needName: "Please enter a name.",
        needPrompt: "Please enter the system prompt body.",
        saved: "✅ Saved",
        deleted: "🗑 Deleted",
        moved: "↕ Order updated",
        failed: "❌ Request failed",
        chars: "chars",
        officialNote: "Official prompts follow the Qwen Research License and cannot be deleted.",
    },
};

function m(key, vars) {
    const dict = BadaI18n.lang === "en" ? M.en : M.ko;
    let text = dict[key] ?? M.ko[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) text = text.replace(`{${k}}`, v);
    return text;
}

function notify(msg, level = "info") {
    // reuse the toast host owned by the node extension (self-contained fallback)
    let host = document.getElementById("bpg-toast-host");
    if (!host) {
        host = document.createElement("div");
        host.id = "bpg-toast-host";
        host.className = "bpg-toast-host";
        document.body.appendChild(host);
    }
    const toast = document.createElement("div");
    toast.className = `bpg-toast bpg-toast--${level}`;
    toast.textContent = msg;
    host.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("bpg-toast--in"));
    setTimeout(() => {
        toast.classList.remove("bpg-toast--in");
        setTimeout(() => toast.remove(), 320);
    }, 3200);
}

async function postJson(url, body) {
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
}

function makeEl(tag, cls, text) {
    const created = document.createElement(tag);
    if (cls) created.className = cls;
    if (text != null) created.textContent = text;
    return created;
}

let activeModal = null;

export async function openPromptGenModal(options = {}) {
    if (activeModal) activeModal.destroy();

    let registry = options.registry || null;
    if (!registry) {
        try {
            const res = await fetch(`${REGISTRY_URL}?ts=${Date.now()}`);
            const data = await res.json();
            registry = data.registry || {};
        } catch (err) {
            registry = {};
        }
    }

    let prompts = Array.isArray(registry.user_prompts) ? registry.user_prompts.map((p) => ({ ...p })) : [];
    let selectedIndex = -1;

    // ── shell ──────────────────────────────────────────────────────────────
    const overlay = makeEl("div", "bpgm-overlay");
    const panel = makeEl("div", "bpgm-panel");
    overlay.appendChild(panel);

    const head = makeEl("div", "bpgm-head");
    const headText = makeEl("div", "bpgm-head-text");
    const titleEl = makeEl("div", "bpgm-title", m("title"));
    const subEl = makeEl("div", "bpgm-sub", m("sub"));
    headText.append(titleEl, subEl);
    const headClose = makeEl("button", "bpgm-x", "✕");
    headClose.type = "button";
    head.append(headText, headClose);
    panel.appendChild(head);

    const body = makeEl("div", "bpgm-body");
    panel.appendChild(body);

    // ── left: list ─────────────────────────────────────────────────────────
    const left = makeEl("div", "bpgm-left");
    const leftHead = makeEl("div", "bpgm-left-head");
    const listTitle = makeEl("span", "bpgm-list-title", m("listHead"));
    const createBtn = makeEl("button", "bpgm-btn bpgm-btn--accent", m("create"));
    createBtn.type = "button";
    leftHead.append(listTitle, createBtn);
    const listEl = makeEl("div", "bpgm-list");
    left.append(leftHead, listEl);
    body.appendChild(left);

    function renderList() {
        listEl.innerHTML = "";
        if (!prompts.length) {
            const empty = makeEl("div", "bpgm-empty", m("empty"));
            listEl.appendChild(empty);
            return;
        }
        prompts.forEach((entry, index) => {
            const card = makeEl("div", "bpgm-item");
            if (index === selectedIndex) card.classList.add("bpgm-item--active");

            const info = makeEl("div", "bpgm-item-info");
            const name = makeEl("div", "bpgm-item-name", entry.name || m("newEntry"));
            const meta = makeEl("div", "bpgm-item-meta");
            const body2 = entry.text || entry.system_prompt || "";
            meta.textContent = `${(entry.output_format === "json" ? "JSON" : "TEXT")} · ${body2.length}${m("chars")}${entry.description ? ` · ${entry.description}` : ""}`;
            info.append(name, meta);

            const tools = makeEl("div", "bpgm-item-tools");
            const up = makeEl("button", "bpgm-mini", "▲");
            const down = makeEl("button", "bpgm-mini", "▼");
            const edit = makeEl("button", "bpgm-mini", "✏️");
            const del = makeEl("button", "bpgm-mini bpgm-mini--del", "🗑");
            [up, down, edit, del].forEach((btn) => {
                btn.type = "button";
                btn.addEventListener("click", (event) => {
                    event.stopPropagation();
                    onToolAction(btn === up ? "up" : btn === down ? "down" : btn === edit ? "edit" : "delete", index);
                });
            });
            up.disabled = index === 0;
            down.disabled = index === prompts.length - 1;
            tools.append(up, down, edit, del);

            card.append(info, tools);
            card.addEventListener("click", () => selectEntry(index));
            listEl.appendChild(card);
        });
    }

    // ── right: editor ──────────────────────────────────────────────────────
    const right = makeEl("div", "bpgm-right");
    body.appendChild(right);

    const field = (labelText, control, hint) => {
        const wrap = makeEl("div", "bpgm-field");
        wrap.appendChild(makeEl("label", "bpgm-label", labelText));
        wrap.appendChild(control);
        if (hint) wrap.appendChild(makeEl("div", "bpgm-hint", hint));
        return wrap;
    };

    const nameInput = makeEl("input", "bpgm-input");
    nameInput.placeholder = m("name");
    const descInput = makeEl("input", "bpgm-input");
    descInput.placeholder = m("desc");

    const formatSel = makeEl("select", "bpgm-input bpgm-selectbox");
    const optText = makeEl("option", null, m("text"));
    optText.value = "text";
    const optJson = makeEl("option", null, m("json"));
    optJson.value = "json";
    formatSel.append(optText, optJson);

    const fieldsInput = makeEl("input", "bpgm-input");
    fieldsInput.placeholder = "rewritten_prompt, negative_prompt";
    fieldsInput.value = "rewritten_prompt";

    const templateRow = makeEl("div", "bpgm-template-row");
    const templateSel = makeEl("select", "bpgm-input bpgm-selectbox");
    const templateNone = makeEl("option", null, m("templateNone"));
    templateNone.value = "";
    templateSel.appendChild(templateNone);
    const official = registry.official_prompts || {};
    Object.entries(official).forEach(([key, value]) => {
        const opt = makeEl("option", null, `${value.title || key} — ${value.target || key}`);
        opt.value = key;
        templateSel.appendChild(opt);
    });
    const templateBtn = makeEl("button", "bpgm-btn", m("loadTemplate"));
    templateBtn.type = "button";
    templateRow.append(templateSel, templateBtn);

    const promptArea = makeEl("textarea", "bpgm-textarea");
    promptArea.placeholder = m("promptPh");
    promptArea.spellcheck = false;
    const charCount = makeEl("div", "bpgm-count", "0");
    promptArea.addEventListener("input", () => {
        charCount.textContent = `${promptArea.value.length} ${m("chars")}`;
    });

    const footBar = makeEl("div", "bpgm-foot");
    const noteEl = makeEl("span", "bpgm-note", m("officialNote"));
    const saveBtn = makeEl("button", "bpgm-btn bpgm-btn--save", m("save"));
    saveBtn.type = "button";
    const closeBtn = makeEl("button", "bpgm-btn", m("close"));
    closeBtn.type = "button";
    footBar.append(noteEl, saveBtn, closeBtn);

    right.append(
        field(m("name"), nameInput),
        field(m("desc"), descInput),
        field(m("format"), formatSel),
        field(m("fields"), fieldsInput),
        field(m("template"), templateRow),
        field(m("prompt"), promptArea, charCount.textContent),
        footBar
    );

    const footerHint = promptArea.parentElement.querySelector(".bpgm-hint");

    // ── form state helpers ─────────────────────────────────────────────────
    function fillForm(entry) {
        if (!entry) {
            nameInput.value = "";
            descInput.value = "";
            formatSel.value = "text";
            fieldsInput.value = "rewritten_prompt";
            promptArea.value = "";
        } else {
            nameInput.value = entry.name || "";
            descInput.value = entry.description || "";
            formatSel.value = entry.output_format === "json" ? "json" : "text";
            fieldsInput.value = (entry.output_fields || ["rewritten_prompt"]).join(", ");
            promptArea.value = entry.text || entry.system_prompt || "";
        }
        charCount.textContent = `${promptArea.value.length} ${m("chars")}`;
        if (footerHint) footerHint.textContent = charCount.textContent;
        fieldsInput.disabled = formatSel.value !== "json";
    }

    function selectEntry(index) {
        selectedIndex = index;
        fillForm(index >= 0 ? prompts[index] : null);
        renderList();
    }

    function applyRegistry(next) {
        if (!next) return;
        registry = next;
        prompts = Array.isArray(next.user_prompts) ? next.user_prompts.map((p) => ({ ...p })) : [];
        if (selectedIndex >= prompts.length) selectedIndex = prompts.length - 1;
        renderList();
        if (selectedIndex >= 0) fillForm(prompts[selectedIndex]);
    }

    async function refreshFromServer() {
        try {
            const res = await fetch(`${REGISTRY_URL}?ts=${Date.now()}`);
            const data = await res.json();
            applyRegistry(data.registry);
        } catch (err) {
            console.warn("[BadaPromptGen] modal refresh failed:", err);
        }
    }

    // ── actions ────────────────────────────────────────────────────────────
    async function runAction(label, worker) {
        saveBtn.disabled = true;
        try {
            await worker();
            notify(label, "ok");
        } catch (err) {
            console.error("[BadaPromptGen] modal action failed:", err);
            notify(`${m("failed")} · ${err.message}`, "err");
        } finally {
            saveBtn.disabled = false;
        }
    }

    async function onToolAction(kind, index) {
        const entry = prompts[index];
        if (!entry) return;
        if (kind === "edit") {
            selectEntry(index);
            nameInput.focus();
            return;
        }
        if (kind === "delete") {
            if (!window.confirm(m("confirmDelete", { name: entry.name || `#${index + 1}` }))) return;
            await runAction(m("deleted"), async () => {
                const data = await postJson(DELETE_URL, { id: entry.id || entry.name });
                selectedIndex = -1;
                applyRegistry(data.registry);
                fillForm(null);
                await options.onSaved?.(registry);
            });
            return;
        }
        await runAction(m("moved"), async () => {
            const data = await postJson(MOVE_URL, { id: entry.id || entry.name, direction: kind });
            applyRegistry(data.registry);
            const movedTo = kind === "up" ? Math.max(0, index - 1) : Math.min(prompts.length - 1, index + 1);
            selectedIndex = movedTo;
            fillForm(prompts[movedTo]);
            renderList();
            await options.onSaved?.(registry);
        });
    }

    createBtn.addEventListener("click", () => {
        selectedIndex = -1;
        fillForm(null);
        renderList();
        nameInput.focus();
    });

    formatSel.addEventListener("change", () => {
        fieldsInput.disabled = formatSel.value !== "json";
    });

    templateBtn.addEventListener("click", () => {
        const key = templateSel.value;
        if (!key) return;
        const source = (registry.official_prompts || {})[key];
        if (!source) return;
        promptArea.value = (source.text || "").trim();
        charCount.textContent = `${promptArea.value.length} ${m("chars")}`;
        if (footerHint) footerHint.textContent = charCount.textContent;
        if (!nameInput.value.trim()) {
            nameInput.value = source.title || key;
            descInput.value = source.target || "";
        }
    });

    async function saveCurrent() {
        const name = nameInput.value.trim();
        const systemPrompt = promptArea.value.trim();
        if (!name) {
            notify(m("needName"), "warn");
            nameInput.focus();
            return;
        }
        if (!systemPrompt) {
            notify(m("needPrompt"), "warn");
            promptArea.focus();
            return;
        }
        const fields = fieldsInput.value.split(",").map((x) => x.trim()).filter(Boolean);
        const payload = {
            id: selectedIndex >= 0 ? prompts[selectedIndex]?.id || "" : "",
            name,
            system_prompt: systemPrompt,
            description: descInput.value.trim(),
            output_format: formatSel.value === "json" ? "json" : "text",
            output_fields: fields.length ? fields : ["rewritten_prompt"],
            images: (selectedIndex >= 0 && prompts[selectedIndex]?.images) || { mode: "multi", inject_refs: false, vision: true },
        };

        await runAction(m("saved"), async () => {
            const data = await postJson(SAVE_URL, payload);
            applyRegistry(data.registry);
            const found = prompts.findIndex((p) => p.id === data.entry.id);
            selectedIndex = found >= 0 ? found : prompts.length - 1;
            fillForm(prompts[selectedIndex]);
            renderList();
            await options.onSaved?.(data.registry || registry);
        });
    }

    saveBtn.addEventListener("click", saveCurrent);
    nameInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") saveCurrent();
    });

    // ── mount / teardown ───────────────────────────────────────────────────
    function onKeydown(event) {
        if (event.key === "Escape") {
            event.stopPropagation();
            destroy();
        }
    }

    function destroy() {
        document.removeEventListener("keydown", onKeydown, true);
        BadaI18n.unsubscribe(langSub);
        overlay.remove();
        if (activeModal === api) activeModal = null;
    }

    const langSub = () => {
        titleEl.textContent = m("title");
        subEl.textContent = m("sub");
        listTitle.textContent = m("listHead");
        createBtn.textContent = m("create");
        saveBtn.textContent = m("save");
        closeBtn.textContent = m("close");
        noteEl.textContent = m("officialNote");
        renderList();
    };
    BadaI18n.subscribe(langSub);

    overlay.addEventListener("pointerdown", (event) => {
        if (event.target === overlay) destroy();
    });
    headClose.addEventListener("click", destroy);
    closeBtn.addEventListener("click", destroy);
    document.addEventListener("keydown", onKeydown, true);

    const api = { overlay, panel, destroy, refreshFromServer };
    activeModal = api;

    fillForm(null);
    renderList();
    document.body.appendChild(overlay);
    setTimeout(() => nameInput.focus(), 40);
    return api;
}
