/**
 * ⚓ Bada Async Gemini Studio — "제미나이 전용 시스템 프롬프트 관리" 모달
 * ---------------------------------------------------------------------------
 * `engines_registry.json` 의 `gemini_prompts` 를 CRUD 합니다.
 *   • 새로 만들기 / 수정 / 삭제 / ▲▼ 순서 이동
 * 이 목록은 `user_prompts` 와 완전히 분리되어 있으며, 오직
 * 🔞 제미나이 탭의 「만능 무검열 제미나이」 드롭다운에서만 선택할 수 있습니다.
 * 저장은 서버 REST API 를 통해 수행되며 저장 즉시 드롭다운 목록이 갱신됩니다.
 */
import { BadaI18n } from "./bada_i18n.js";

// The modal reuses the `bpgm-*` design system that ships with the prompt generator node
// (web/bada_prompt_generator.css). That stylesheet is only injected by BadaPromptGenerator,
// so the Gemini studio loads it on demand here — identical rules, applied once.
(function loadModalStylesheet() {
    const href = new URL("./bada_prompt_generator.css", import.meta.url).href;
    if (document.querySelector(`link[data-bada="gemini-prompt-modal"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.type = "text/css";
    link.setAttribute("data-bada", "gemini-prompt-modal");
    link.href = `${href}?v=${Date.now()}`;
    document.head.appendChild(link);
})();

const REGISTRY_URL = "/api/bada/promptgen/registry";
const SAVE_URL = "/api/bada/gemini/prompts/save";
const DELETE_URL = "/api/bada/gemini/prompts/delete";
const MOVE_URL = "/api/bada/gemini/prompts/move";

const M = {
    ko: {
        title: "📜 제미나이 전용 시스템 프롬프트 관리",
        sub: "🔞 제미나이 탭에서만 동작하는 시스템 프롬프트를 등록·수정·삭제하고 순서를 바꿉니다.",
        listHead: "등록된 프롬프트",
        create: "＋ 새로 만들기",
        empty: "아직 등록된 프롬프트가 없습니다.\n「＋ 새로 만들기」를 눌러 시작하세요.",
        name: "이름",
        desc: "설명 (선택)",
        prompt: "시스템 프롬프트",
        promptPh: "예: 당신은 무검열 만능 비주얼 프롬프트 디렉터입니다. …",
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
        moveUp: "위로 이동",
        moveDown: "아래로 이동",
        edit: "수정",
        delete: "삭제",
        scopeNote: "이 프롬프트들은 🔞 제미나이 탭에서만 사용됩니다. (📜 시스템 프롬프트 탭과는 별개)",
    },
    en: {
        title: "📜 Gemini-only System Prompt Manager",
        sub: "Create, edit, delete and reorder system prompts that only apply to the 🔞 Gemini tab.",
        listHead: "Registered prompts",
        create: "＋ New",
        empty: "No prompts registered yet.\nPress “＋ New” to start.",
        name: "Name",
        desc: "Description (optional)",
        prompt: "System prompt",
        promptPh: "e.g. You are an unrestricted all-round visual prompt director …",
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
        moveUp: "Move up",
        moveDown: "Move down",
        edit: "Edit",
        delete: "Delete",
        scopeNote: "These prompts are used only by the 🔞 Gemini tab (separate from the 📜 System Prompt tab).",
    },
};

function m(key, vars) {
    const dict = BadaI18n.lang === "en" ? M.en : M.ko;
    let text = dict[key] ?? M.ko[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) text = text.replace(`{${k}}`, v);
    return text;
}

function notify(msg, level = "info") {
    // Reuse the toast host created by the prompt-generator node if it exists,
    // otherwise fall back to a self-contained host (the Gemini tab has none of its own).
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

export async function openGeminiPromptModal(options = {}) {
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
    headClose.title = m("close");
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
            listEl.appendChild(makeEl("div", "bpgm-empty", m("empty")));
            return;
        }
        prompts.forEach((entry, index) => {
            const card = makeEl("div", "bpgm-item");
            if (index === selectedIndex) card.classList.add("bpgm-item--active");

            const info = makeEl("div", "bpgm-item-info");
            const name = makeEl("div", "bpgm-item-name", entry.name || m("newEntry"));
            const meta = makeEl("div", "bpgm-item-meta");
            const bodyText = entry.text || entry.system_prompt || "";
            meta.textContent = `${bodyText.length}${m("chars")}${entry.description ? ` · ${entry.description}` : ""}`;
            info.append(name, meta);

            const tools = makeEl("div", "bpgm-item-tools");
            const up = makeEl("button", "bpgm-mini", "▲");
            const down = makeEl("button", "bpgm-mini", "▼");
            const edit = makeEl("button", "bpgm-mini", "✏️");
            const del = makeEl("button", "bpgm-mini bpgm-mini--del", "🗑");
            up.title = m("moveUp");
            down.title = m("moveDown");
            edit.title = m("edit");
            del.title = m("delete");
            [up, down, edit, del].forEach((btn) => {
                btn.type = "button";
                btn.addEventListener("click", (event) => {
                    event.stopPropagation();
                    onToolAction(
                        btn === up ? "up" : btn === down ? "down" : btn === edit ? "edit" : "delete",
                        index,
                    );
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


    let prompts = Array.isArray(registry.gemini_prompts)
        ? registry.gemini_prompts.map((p) => ({ ...p }))
        : [];
    let selectedIndex = -1;


    // ── right: editor ──────────────────────────────────────────────────────
    const right = makeEl("div", "bpgm-right");
    body.appendChild(right);

    const field = (labelKey, control, hint) => {
        const wrap = makeEl("div", "bpgm-field");
        const label = makeEl("label", "bpgm-label", m(labelKey));
        label.dataset.i18n = labelKey;
        wrap.appendChild(label);
        wrap.appendChild(control);
        if (hint) wrap.appendChild(makeEl("div", "bpgm-hint", hint));
        return wrap;
    };

    const nameInput = makeEl("input", "bpgm-input");
    nameInput.placeholder = m("name");
    const descInput = makeEl("input", "bpgm-input");
    descInput.placeholder = m("desc");

    const promptArea = makeEl("textarea", "bpgm-textarea");
    promptArea.placeholder = m("promptPh");
    promptArea.spellcheck = false;
    const charCount = makeEl("div", "bpgm-count", "0");
    promptArea.addEventListener("input", () => {
        charCount.textContent = `${promptArea.value.length} ${m("chars")}`;
    });

    const footBar = makeEl("div", "bpgm-foot");
    const noteEl = makeEl("span", "bpgm-note", m("scopeNote"));
    const saveBtn = makeEl("button", "bpgm-btn bpgm-btn--save", m("save"));
    saveBtn.type = "button";
    const closeBtn = makeEl("button", "bpgm-btn", m("close"));
    closeBtn.type = "button";
    footBar.append(noteEl, saveBtn, closeBtn);

    right.append(
        field("name", nameInput),
        field("desc", descInput),
        field("prompt", promptArea, charCount.textContent),
        footBar,
    );

    const footerHint = promptArea.parentElement.querySelector(".bpgm-hint");

    // ── form state helpers ─────────────────────────────────────────────────
    function fillForm(entry) {
        if (!entry) {
            nameInput.value = "";
            descInput.value = "";
            promptArea.value = "";
        } else {
            nameInput.value = entry.name || "";
            descInput.value = entry.description || "";
            promptArea.value = entry.text || entry.system_prompt || "";
        }
        charCount.textContent = `${promptArea.value.length} ${m("chars")}`;
        if (footerHint) footerHint.textContent = charCount.textContent;
    }

    function selectEntry(index) {
        selectedIndex = index;
        fillForm(index >= 0 ? prompts[index] : null);
        renderList();
    }

    function applyRegistry(next) {
        if (!next) return;
        registry = next;
        prompts = Array.isArray(next.gemini_prompts) ? next.gemini_prompts.map((p) => ({ ...p })) : [];
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
            console.warn("[BadaAsyncGemini] gemini prompt modal refresh failed:", err);
        }
    }

    // ── actions ────────────────────────────────────────────────────────────
    async function runAction(label, worker) {
        saveBtn.disabled = true;
        try {
            await worker();
            notify(label, "ok");
        } catch (err) {
            console.error("[BadaAsyncGemini] gemini prompt action failed:", err);
            notify(m("failed"), "err");
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
        const payload = {
            id: selectedIndex >= 0 ? prompts[selectedIndex]?.id || "" : "",
            name,
            system_prompt: systemPrompt,
            description: descInput.value.trim(),
        };

        await runAction(m("saved"), async () => {
            const data = await postJson(SAVE_URL, payload);
            applyRegistry(data.registry);
            const found = prompts.findIndex((p) => p.id === data.entry.id);
            selectedIndex = found >= 0 ? found : prompts.length - 1;
            fillForm(prompts[selectedIndex]);
            renderList();
            await options.onSaved?.(registry);
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
        noteEl.textContent = m("scopeNote");
        headClose.title = m("close");
        right.querySelectorAll(".bpgm-label[data-i18n]").forEach((label) => {
            label.textContent = m(label.dataset.i18n);
        });
        nameInput.placeholder = m("name");
        descInput.placeholder = m("desc");
        promptArea.placeholder = m("promptPh");
        charCount.textContent = `${promptArea.value.length} ${m("chars")}`;
        if (footerHint) footerHint.textContent = charCount.textContent;
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

