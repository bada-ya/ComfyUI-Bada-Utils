/**
 * ⚓ Bada 프롬프트 관리 모달 공통 코어
 * ---------------------------------------------------------------------------
 * `bada_gemini_prompt_modal.js`(gemini_prompts)와
 * `bada_promptgen_modal.js`(user_prompts)가 공유하는 CRUD UI.
 *
 * 두 모달은 레지스트리 키·API 주소·문구·부가 필드만 다르고 구조가 같다.
 * 차이는 전부 설정 객체로만 주입한다 — 코어 안에 모달별 분기 상수를 두지 않는다.
 *
 * config:
 *   promptsKey  레지스트리에서 읽을 배열 키 ("gemini_prompts" | "user_prompts")
 *   urls        { save, delete, move } — 레지스트리 조회는 공통 주소를 쓴다
 *   texts       { ko, en } 덮어쓰기·추가 문구 (공통 문구는 SHARED_TEXTS)
 *   noteKey     하단 안내 문구 키 (scopeNote | officialNote)
 *   log         { refresh, action } console 경고·오류 접두사
 *   features    { outputFormat, officialTemplates }
 *                 outputFormat      출력 형식(JSON)·키 입력·목록 메타 접두사·저장 페이로드 확장
 *                 officialTemplates 공식 프롬프트 템플릿 선택 행
 */
import { BadaI18n } from "./bada_i18n.js";

const REGISTRY_URL = "/api/bada/promptgen/registry";

/** 두 모달에서 문구가 완전히 같은 항목. 다르면 각 모달 texts 에서 덮어쓴다. */
export const SHARED_TEXTS = {
    ko: {
        listHead: "등록된 프롬프트",
        create: "＋ 새로 만들기",
        empty: "아직 등록된 프롬프트가 없습니다.\n「＋ 새로 만들기」를 눌러 시작하세요.",
        name: "이름",
        desc: "설명 (선택)",
        prompt: "시스템 프롬프트",
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
    },
    en: {
        listHead: "Registered prompts",
        create: "＋ New",
        empty: "No prompts registered yet.\nPress “＋ New” to start.",
        name: "Name",
        desc: "Description (optional)",
        prompt: "System prompt",
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
    },
};

function notify(msg, level = "info") {
    // Reuse the toast host created by the prompt-generator node if it exists,
    // otherwise fall back to a self-contained host.
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

export function createPromptModalOpener(config) {
    const { promptsKey, urls, noteKey, log, features = {} } = config;
    const outputFormat = !!features.outputFormat;
    const officialTemplates = !!features.officialTemplates;
    const texts = {
        ko: { ...SHARED_TEXTS.ko, ...(config.texts?.ko || {}) },
        en: { ...SHARED_TEXTS.en, ...(config.texts?.en || {}) },
    };

    function m(key, vars) {
        const dict = BadaI18n.lang === "en" ? texts.en : texts.ko;
        let text = dict[key] ?? texts.ko[key] ?? key;
        if (vars) for (const [k, v] of Object.entries(vars)) text = text.replace(`{${k}}`, v);
        return text;
    }

    // 모달별 단일 인스턴스. 두 모달은 서로를 닫지 않는다(각자 자기 인스턴스만 관리).
    let activeModal = null;

    return async function open(options = {}) {
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

        let prompts = Array.isArray(registry[promptsKey])
            ? registry[promptsKey].map((p) => ({ ...p }))
            : [];
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
                const formatPrefix = outputFormat
                    ? `${entry.output_format === "json" ? "JSON" : "TEXT"} · `
                    : "";
                meta.textContent = `${formatPrefix}${bodyText.length}${m("chars")}${entry.description ? ` · ${entry.description}` : ""}`;
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

        let formatSel = null;
        let optText = null;
        let optJson = null;
        let fieldsInput = null;
        if (outputFormat) {
            formatSel = makeEl("select", "bpgm-input bpgm-selectbox");
            optText = makeEl("option", null, m("text"));
            optText.value = "text";
            optJson = makeEl("option", null, m("json"));
            optJson.value = "json";
            formatSel.append(optText, optJson);

            fieldsInput = makeEl("input", "bpgm-input");
            fieldsInput.placeholder = "rewritten_prompt, negative_prompt";
            fieldsInput.value = "rewritten_prompt";
        }

        let templateRow = null;
        let templateSel = null;
        let templateNone = null;
        let templateBtn = null;
        if (officialTemplates) {
            templateRow = makeEl("div", "bpgm-template-row");
            templateSel = makeEl("select", "bpgm-input bpgm-selectbox");
            templateNone = makeEl("option", null, m("templateNone"));
            templateNone.value = "";
            templateSel.appendChild(templateNone);
            const official = registry.official_prompts || {};
            Object.entries(official).forEach(([key, value]) => {
                const opt = makeEl("option", null, `${value.title || key} — ${value.target || key}`);
                opt.value = key;
                templateSel.appendChild(opt);
            });
            templateBtn = makeEl("button", "bpgm-btn", m("loadTemplate"));
            templateBtn.type = "button";
            templateRow.append(templateSel, templateBtn);
        }

        const promptArea = makeEl("textarea", "bpgm-textarea");
        promptArea.placeholder = m("promptPh");
        promptArea.spellcheck = false;
        const charCount = makeEl("div", "bpgm-count", "0");
        promptArea.addEventListener("input", () => {
            charCount.textContent = `${promptArea.value.length} ${m("chars")}`;
        });

        const footBar = makeEl("div", "bpgm-foot");
        const noteEl = makeEl("span", "bpgm-note", m(noteKey));
        const saveBtn = makeEl("button", "bpgm-btn bpgm-btn--save", m("save"));
        saveBtn.type = "button";
        const closeBtn = makeEl("button", "bpgm-btn", m("close"));
        closeBtn.type = "button";
        footBar.append(noteEl, saveBtn, closeBtn);

        const fieldNodes = [field("name", nameInput), field("desc", descInput)];
        if (outputFormat) fieldNodes.push(field("format", formatSel), field("fields", fieldsInput));
        if (officialTemplates) fieldNodes.push(field("template", templateRow));
        fieldNodes.push(field("prompt", promptArea, charCount.textContent), footBar);
        right.append(...fieldNodes);

        const footerHint = promptArea.parentElement.querySelector(".bpgm-hint");

        // ── form state helpers ─────────────────────────────────────────────────
        function fillForm(entry) {
            if (!entry) {
                nameInput.value = "";
                descInput.value = "";
                if (outputFormat) {
                    formatSel.value = "text";
                    fieldsInput.value = "rewritten_prompt";
                }
                promptArea.value = "";
            } else {
                nameInput.value = entry.name || "";
                descInput.value = entry.description || "";
                if (outputFormat) {
                    formatSel.value = entry.output_format === "json" ? "json" : "text";
                    fieldsInput.value = (entry.output_fields || ["rewritten_prompt"]).join(", ");
                }
                promptArea.value = entry.text || entry.system_prompt || "";
            }
            charCount.textContent = `${promptArea.value.length} ${m("chars")}`;
            if (footerHint) footerHint.textContent = charCount.textContent;
            if (outputFormat) fieldsInput.disabled = formatSel.value !== "json";
        }

        function selectEntry(index) {
            selectedIndex = index;
            fillForm(index >= 0 ? prompts[index] : null);
            renderList();
        }

        function applyRegistry(next) {
            if (!next) return;
            registry = next;
            prompts = Array.isArray(next[promptsKey]) ? next[promptsKey].map((p) => ({ ...p })) : [];
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
                console.warn(log.refresh, err);
            }
        }

        // ── actions ────────────────────────────────────────────────────────────
        async function runAction(label, worker) {
            saveBtn.disabled = true;
            try {
                await worker();
                notify(label, "ok");
            } catch (err) {
                console.error(log.action, err);
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
                    const data = await postJson(urls.delete, { id: entry.id || entry.name });
                    selectedIndex = -1;
                    applyRegistry(data.registry);
                    fillForm(null);
                    await options.onSaved?.(registry);
                });
                return;
            }
            await runAction(m("moved"), async () => {
                const data = await postJson(urls.move, { id: entry.id || entry.name, direction: kind });
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

        if (outputFormat) {
            formatSel.addEventListener("change", () => {
                fieldsInput.disabled = formatSel.value !== "json";
            });
        }

        if (officialTemplates) {
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
        }

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
            if (outputFormat) {
                const fields = fieldsInput.value.split(",").map((x) => x.trim()).filter(Boolean);
                payload.output_format = formatSel.value === "json" ? "json" : "text";
                payload.output_fields = fields.length ? fields : ["rewritten_prompt"];
                payload.images = (selectedIndex >= 0 && prompts[selectedIndex]?.images) || { mode: "multi", inject_refs: false, vision: true };
            }

            await runAction(m("saved"), async () => {
                const data = await postJson(urls.save, payload);
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
            noteEl.textContent = m(noteKey);
            headClose.title = m("close");
            right.querySelectorAll(".bpgm-label[data-i18n]").forEach((label) => {
                label.textContent = m(label.dataset.i18n);
            });
            nameInput.placeholder = m("name");
            descInput.placeholder = m("desc");
            promptArea.placeholder = m("promptPh");
            if (outputFormat) {
                optText.textContent = m("text");
                optJson.textContent = m("json");
            }
            if (officialTemplates) {
                templateNone.textContent = m("templateNone");
                templateBtn.textContent = m("loadTemplate");
            }
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
    };
}
