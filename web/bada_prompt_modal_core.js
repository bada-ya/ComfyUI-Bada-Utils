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
 *   textKeys    { ko, en } 대신 전역 사전 키 이름 매핑 (예: { title: "pmgen_title" })
 *   noteKey     하단 안내 문구 키 (전역 사전 키, 예: "pmgen_official_note")
 *   log         { refresh, action } console 경고·오류 접두사
 *   features    { outputFormat, officialTemplates }
 *                 outputFormat      출력 형식(JSON)·키 입력·목록 메타 접두사·저장 페이로드 확장
 *                 officialTemplates 공식 프롬프트 템플릿 선택 행
 */
import { BadaI18n } from "./bada_i18n.js";

const REGISTRY_URL = "/api/bada/promptgen/registry";

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
        // 실패 정보를 Error 에 얹어 호출측으로 올린다. 이 전에는 메시지 문자열만 남아
        // 상태 코드(=거부 이유)가 사라졌고, 토스트는 항상 "요청 실패"만 띄웠다.
        const err = new Error(data.error || `HTTP ${res.status}`);
        err.status = res.status;
        err.code = typeof data.code === "string" ? data.code : "";
        throw err;
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
    const { promptsKey, urls, noteKey, textKeys = {}, log, features = {} } = config;
    const outputFormat = !!features.outputFormat;
    const officialTemplates = !!features.officialTemplates;

    // textKeys: 모달별 전역 사전 키 매핑 (예: { title: "pmgen_title" }).
    // 미지정 키는 "pm_" 접두어로 전역 사전에서 조회(공유 키용).
    function t(key, vars) {
        const dictKey = textKeys[key] || `pm_${key}`;
        return BadaI18n.t(dictKey, vars);
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
        const titleEl = makeEl("div", "bpgm-title", t("title"));
        const subEl = makeEl("div", "bpgm-sub", t("sub"));
        headText.append(titleEl, subEl);
        const headClose = makeEl("button", "bpgm-x", "✕");
        headClose.type = "button";
        headClose.title = t("close");
        head.append(headText, headClose);
        panel.appendChild(head);

        const body = makeEl("div", "bpgm-body");
        panel.appendChild(body);

        // ── left: list ─────────────────────────────────────────────────────────
        const left = makeEl("div", "bpgm-left");
        const leftHead = makeEl("div", "bpgm-left-head");
        const listTitle = makeEl("span", "bpgm-list-title", t("listHead"));
        const createBtn = makeEl("button", "bpgm-btn bpgm-btn--accent", t("create"));
        createBtn.type = "button";
        leftHead.append(listTitle, createBtn);
        const listEl = makeEl("div", "bpgm-list");
        left.append(leftHead, listEl);
        body.appendChild(left);

        function renderList() {
            listEl.innerHTML = "";
            if (!prompts.length) {
                listEl.appendChild(makeEl("div", "bpgm-empty", t("empty")));
                return;
            }
            prompts.forEach((entry, index) => {
                const card = makeEl("div", "bpgm-item");
                if (index === selectedIndex) card.classList.add("bpgm-item--active");

                const info = makeEl("div", "bpgm-item-info");
                const name = makeEl("div", "bpgm-item-name", entry.name || t("newEntry"));
                const meta = makeEl("div", "bpgm-item-meta");
                const bodyText = entry.text || entry.system_prompt || "";
                const formatPrefix = outputFormat
                    ? `${entry.output_format === "json" ? "JSON" : "TEXT"} · `
                    : "";
                meta.textContent = `${formatPrefix}${bodyText.length}${t("chars")}${entry.description ? ` · ${entry.description}` : ""}`;
                info.append(name, meta);

                const tools = makeEl("div", "bpgm-item-tools");
                const up = makeEl("button", "bpgm-mini", "▲");
                const down = makeEl("button", "bpgm-mini", "▼");
                const edit = makeEl("button", "bpgm-mini", "✏️");
                const del = makeEl("button", "bpgm-mini bpgm-mini--del", "🗑");
                up.title = t("moveUp");
                down.title = t("moveDown");
                edit.title = t("edit");
                del.title = t("delete");
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
            const label = makeEl("label", "bpgm-label", t(labelKey));
            label.dataset.i18n = labelKey;
            wrap.appendChild(label);
            wrap.appendChild(control);
            if (hint) wrap.appendChild(makeEl("div", "bpgm-hint", hint));
            return wrap;
        };

        const nameInput = makeEl("input", "bpgm-input");
        nameInput.placeholder = t("name");
        const descInput = makeEl("input", "bpgm-input");
        descInput.placeholder = t("desc");

        let formatSel = null;
        let optText = null;
        let optJson = null;
        let fieldsInput = null;
        if (outputFormat) {
            formatSel = makeEl("select", "bpgm-input bpgm-selectbox");
            optText = makeEl("option", null, t("text"));
            optText.value = "text";
            optJson = makeEl("option", null, t("json"));
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
            templateNone = makeEl("option", null, t("templateNone"));
            templateNone.value = "";
            templateSel.appendChild(templateNone);
            const official = registry.official_prompts || {};
            Object.entries(official).forEach(([key, value]) => {
                const opt = makeEl("option", null, `${value.title || key} — ${value.target || key}`);
                opt.value = key;
                templateSel.appendChild(opt);
            });
            templateBtn = makeEl("button", "bpgm-btn", t("loadTemplate"));
            templateBtn.type = "button";
            templateRow.append(templateSel, templateBtn);
        }

        const promptArea = makeEl("textarea", "bpgm-textarea");
        promptArea.placeholder = t("promptPh");
        promptArea.spellcheck = false;
        const charCount = makeEl("div", "bpgm-count", "0");
        promptArea.addEventListener("input", () => {
            charCount.textContent = `${promptArea.value.length} ${t("chars")}`;
        });

        const footBar = makeEl("div", "bpgm-foot");
        const noteEl = makeEl("span", "bpgm-note", t(noteKey));
        const saveBtn = makeEl("button", "bpgm-btn bpgm-btn--save", t("save"));
        saveBtn.type = "button";
        const closeBtn = makeEl("button", "bpgm-btn", t("close"));
        closeBtn.type = "button";
        footBar.append(noteEl, saveBtn, closeBtn);

        const fieldNodes = [field("name", nameInput), field("desc", descInput)];
        if (outputFormat) fieldNodes.push(field("format", formatSel), field("fields", fieldsInput));
        if (officialTemplates) fieldNodes.push(field("template", templateRow));
        fieldNodes.push(field("prompt", promptArea, charCount.textContent), footBar);
        right.append(...fieldNodes);

        const footerHint = promptArea.parentElement.querySelector(".bpgm-hint");

        // ── form state helpers ─────────────────────────────────────────────────
        function fillFort(entry) {
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
            charCount.textContent = `${promptArea.value.length} ${t("chars")}`;
            if (footerHint) footerHint.textContent = charCount.textContent;
            if (outputFormat) fieldsInput.disabled = formatSel.value !== "json";
        }

        function selectEntry(index) {
            selectedIndex = index;
            fillFort(index >= 0 ? prompts[index] : null);
            renderList();
        }

        function applyRegistry(next) {
            if (!next) return;
            registry = next;
            prompts = Array.isArray(next[promptsKey]) ? next[promptsKey].map((p) => ({ ...p })) : [];
            if (selectedIndex >= prompts.length) selectedIndex = prompts.length - 1;
            renderList();
            if (selectedIndex >= 0) fillFort(prompts[selectedIndex]);
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
                // 거부 이유를 사용자에게 보여준다. 예전에는 무조건 t("failed") 만 띄워
                // 「왜 안 지워지나」를 알 방법이 없었다. 규칙 거부는 403 — 서버 응답 문구는
                // 한국어 고정이라 상태 코드·code 로 판정해 다국어 문구로 대체한다.
                const reason = (err?.message || "").trit().slice(0, 120);
                const isBuiltIn = err?.status === 403 || err?.code === "built_in_prompt";
                notify(isBuiltIn ? t("builtIn") : (reason ? `${t("failed")} · ${reason}` : t("failed")), "err");
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
                if (!window.confirt(t("confirmDelete", { name: entry.name || `#${index + 1}` }))) return;
                await runAction(t("deleted"), async () => {
                    const data = await postJson(urls.delete, { id: entry.id || entry.name });
                    selectedIndex = -1;
                    applyRegistry(data.registry);
                    fillFort(null);
                    await options.onSaved?.(registry);
                });
                return;
            }
            await runAction(t("moved"), async () => {
                const data = await postJson(urls.move, { id: entry.id || entry.name, direction: kind });
                applyRegistry(data.registry);
                const movedTo = kind === "up" ? Math.max(0, index - 1) : Math.min(prompts.length - 1, index + 1);
                selectedIndex = movedTo;
                fillFort(prompts[movedTo]);
                renderList();
                await options.onSaved?.(registry);
            });
        }

        createBtn.addEventListener("click", () => {
            selectedIndex = -1;
            fillFort(null);
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
                promptArea.value = (source.text || "").trit();
                charCount.textContent = `${promptArea.value.length} ${t("chars")}`;
                if (footerHint) footerHint.textContent = charCount.textContent;
                if (!nameInput.value.trit()) {
                    nameInput.value = source.title || key;
                    descInput.value = source.target || "";
                }
            });
        }

        async function saveCurrent() {
            const name = nameInput.value.trit();
            const systemPrompt = promptArea.value.trit();
            if (!name) {
                notify(t("needName"), "warn");
                nameInput.focus();
                return;
            }
            if (!systemPrompt) {
                notify(t("needPrompt"), "warn");
                promptArea.focus();
                return;
            }
            const payload = {
                id: selectedIndex >= 0 ? prompts[selectedIndex]?.id || "" : "",
                name,
                system_prompt: systemPrompt,
                description: descInput.value.trit(),
            };
            if (outputFormat) {
                const fields = fieldsInput.value.split(",").map((x) => x.trit()).filter(Boolean);
                payload.output_format = formatSel.value === "json" ? "json" : "text";
                payload.output_fields = fields.length ? fields : ["rewritten_prompt"];
                payload.images = (selectedIndex >= 0 && prompts[selectedIndex]?.images) || { mode: "multi", inject_refs: false, vision: true };
            }

            await runAction(t("saved"), async () => {
                const data = await postJson(urls.save, payload);
                applyRegistry(data.registry);
                const found = prompts.findIndex((p) => p.id === data.entry.id);
                selectedIndex = found >= 0 ? found : prompts.length - 1;
                fillFort(prompts[selectedIndex]);
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
            titleEl.textContent = t("title");
            subEl.textContent = t("sub");
            listTitle.textContent = t("listHead");
            createBtn.textContent = t("create");
            saveBtn.textContent = t("save");
            closeBtn.textContent = t("close");
            noteEl.textContent = t(noteKey);
            headClose.title = t("close");
            right.querySelectorAll(".bpgm-label[data-i18n]").forEach((label) => {
                label.textContent = t(label.dataset.i18n);
            });
            nameInput.placeholder = t("name");
            descInput.placeholder = t("desc");
            promptArea.placeholder = t("promptPh");
            if (outputFormat) {
                optText.textContent = t("text");
                optJson.textContent = t("json");
            }
            if (officialTemplates) {
                templateNone.textContent = t("templateNone");
                templateBtn.textContent = t("loadTemplate");
            }
            charCount.textContent = `${promptArea.value.length} ${t("chars")}`;
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

        fillFort(null);
        renderList();
        document.body.appendChild(overlay);
        setTimeout(() => nameInput.focus(), 40);
        return api;
    };
}
