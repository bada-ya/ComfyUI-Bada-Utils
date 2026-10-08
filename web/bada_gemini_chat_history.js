/**
 * ⚓ Bada Async Gemini Studio — 🔞 제미나이 채팅 기록 팝업
 * ---------------------------------------------------------------------------
 * 「🕐」 버튼(프롬프트 관리 · 새 채팅 오른쪽)에서 열리는 대화 목록입니다.
 *   • 대화 선택 → 현재 스레드로 복원, 이어서 대화 가능
 추가: 10행 넘으면 스크롤 / 📌 상단 고정(30개 자동 삭제 제외)
 *   • 개별 삭제 / 전체 삭제
 *   • 📌 상단 고정 — 고정한 대화는 30개 자동 삭제 상한에서 제외되고 목록 맨 위에 놓인다
 *   • 목록은 10행까지만 펼쳐지고, 그 위로 스크롤된다(대화가 늘어나도 팝업이 화면을 덮지 않는다)
 *   • 📤 백업(.json 다운로드) / 📥 복원(파일 업로드, 병합 또는 전체 교체)
 *
 * 저장 위치는 `gemini_chat_history.json` 입니다. `engines_registry.json` 과 분리된
 * 이유(배포 대상 파일에 개인 대화를 넣지 않기 위함)는
 * server/gemini_chat_history.py 의 모듈 주석을 참고하세요.
 *
 * 이 모듈은 창(모달)이 아니라 **노드 내부 팝업**입니다. 노드가 캔버스 위에 떠 있고,
 * z-index 를 높이면 다른 노드를 덮어버리기 때문입니다.
 */
import { BadaI18n } from "./bada_i18n.js";
import { showToast } from "./bada_shared.js";

const API = {
    list: "/api/bada/gemini/chats",
    get: "/api/bada/gemini/chats/get",
    thumbs: "/api/bada/gemini/chats/thumbs",
    del: "/api/bada/gemini/chats/delete",
    pin: "/api/bada/gemini/chats/pin",
    clear: "/api/bada/gemini/chats/clear",
    exportUrl: "/api/bada/gemini/chats/export",
    importUrl: "/api/bada/gemini/chats/import",
};

// How an attachment is remembered when the user picked 「저장 안 함」: no bytes, just the
// fact that there WAS an image. Rendered as a grey placeholder in the restored thread.
export const IMAGE_OMITTED_MARK = "__omitted__";

const T = () => (typeof BadaI18n !== "undefined" && BadaI18n.lang === "ko");

const L = {
    ko: {
        title: "🕐 채팅 기록",
        empty: "저장된 대화가 없습니다.\n대화를 나눈 뒤 다시 열어 주세요.",
        search: "🔍 제목 검색...",
        msgs: "턴",
        imgs: "이미지",
        imgSaved: "이미지 {n}미저장",
        restore: "▶ 이어하기",
        remove: "🗑",
        removeTitle: "이 대화 삭제",
        pin: "📌",
        pinTitle: "상단 고정 (30개 자동 삭제에서 제외)",
        unpinTitle: "고정 해제",
        pinnedOn: "📌 상단 고정 — 30개 자동 삭제에서 제외됩니다",
        pinnedOff: "고정 해제되었습니다",
        pinnedSection: "📌 고정됨 — 자동 삭제되지 않음",
        confirmDelete: "「{title}」 대화를 삭제할까요?",
        backup: "📤 백업",
        restore2: "📥 복원",
        clearAll: "🗑 전체 삭제",
        confirmClear: "저장된 대화를 모두 삭제할까요?\n(백업을 먼저 받아두시는 것을 권장합니다)",
        imageMode: "🖼️ 첨부 이미지 저장",
        imageModes: {
            original: "원본 (1~8 MB)",
            large: "2048px (~350 KB)",
            small: "1024px (~100 KB)",
            none: "저장 안 함 (0 KB)",
        },
        imageNote: "「저장 안 함」으로 저장한 이미지는 복원 시 자리표시자로만 남고,\n대화 내용은 그대로 복원됩니다.",
        imported: "✅ {n}개의 대화를 복원했습니다",
        importedMerge: "✅ {n}개를 병합했습니다",
        deleted: "🗑 삭제되었습니다",
        cleared: "🗑 모두 삭제되었습니다",
        failed: "❌ {err}",
        cap: "최근 {n}개까지 보관",
        justNow: "방금",
        minAgo: "{n}분 전",
        hourAgo: "{n}시간 전",
        dayAgo: "{n}일 전",
    },
    en: {
        title: "🕐 Chat history",
        empty: "No saved conversations yet.\nChat a little, then come back.",
        search: "🔍 Search titles...",
        msgs: "turns",
        imgs: "images",
        imgSaved: "{n} unsaved",
        restore: "▶ Resume",
        remove: "🗑",
        removeTitle: "Delete this conversation",
        pin: "📌",
        pinTitle: "Pin to top (exempt from the 30-chat auto-delete)",
        unpinTitle: "Unpin",
        pinnedOn: "📌 Pinned to top",
        pinnedOff: "Unpinned",
        pinnedSection: "📌 Pinned — never auto-deleted",
        confirmDelete: "Delete “{title}”?",
        backup: "📤 Backup",
        restore2: "📥 Restore",
        clearAll: "🗑 Clear all",
        confirmClear: "Delete every saved conversation?\n(Backing up first is recommended)",
        imageMode: "🖼️ Attachment storage",
        imageModes: {
            original: "Original (1–8 MB)",
            large: "2048px (~350 KB)",
            small: "1024px (~100 KB)",
            none: "Don't save (0 KB)",
        },
        imageNote: "Images saved as 「Don't save」 come back as placeholders;\nthe conversation text is restored in full.",
        imported: "✅ Restored {n} conversation(s)",
        importedMerge: "✅ Merged {n}",
        deleted: "🗑 Deleted",
        cleared: "🗑 All deleted",
        failed: "❌ {err}",
        cap: "keeps the newest {n}",
        justNow: "just now",
        minAgo: "{n}m ago",
        hourAgo: "{n}h ago",
        dayAgo: "{n}d ago",
    },
};

const t = (key) => (T() ? L.ko : L.en)[key];

function fmtBytes(bytes) {
    if (!bytes || bytes < 1024) return `${bytes || 0} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fmtWhen(stamp) {
    const diff = Date.now() / 1000 - Number(stamp || 0);
    if (!stamp || diff < 0) return "";
    if (diff < 60) return t("justNow");
    if (diff < 3600) return t("minAgo").replace("{n}", Math.floor(diff / 60));
    if (diff < 86400) return t("hourAgo").replace("{n}", Math.floor(diff / 3600));
    return t("dayAgo").replace("{n}", Math.floor(diff / 86400));
}

async function postJSON(url, body) {
    const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.success) throw new Error(data.error || `HTTP ${resp.status}`);
    return data;
}

/**
 * Loads a conversation's tiny previews ONCE and caches them for the popup's lifetime.
 *
 * Two things make this necessary rather than merely tidy:
 *   • the list scrolls, so a row leaves and re-enters the viewport; without a cache every
 *     scroll-back would re-request and re-decode the same base64.
 *   • `render()` rebuilds the whole list on every search keystroke and after every pin, so
 *     the same rows are constructed repeatedly.
 * A failed load is cached as `[]` too — otherwise a row that cannot be previewed (deleted
 * mid-session, 404) would retry on every keystroke forever.
 */
const thumbCache = new Map();
const thumbPending = new Map();

async function loadThumbs(chatId) {
    if (thumbCache.has(chatId)) return thumbCache.get(chatId);
    if (thumbPending.has(chatId)) return thumbPending.get(chatId);
    const task = (async () => {
        let out = [];
        try {
            const resp = await fetch(`${API.thumbs}?id=${encodeURIComponent(chatId)}&n=3&size=28`);
            const data = await resp.json();
            if (data.success && Array.isArray(data.thumbs)) {
                out = { thumbs: data.thumbs, omitted: data.omitted || 0 };
            }
        } catch {
            // Preview is decoration; a failure must never break the row or the list.
            out = { thumbs: [], omitted: 0 };
        }
        thumbCache.set(chatId, out);
        thumbPending.delete(chatId);
        return out;
    })();
    thumbPending.set(chatId, task);
    return task;
}

/**
 * Open the history popup.
 *
 * `anchor` is the 🕐 button; `opts.onRestore(chat)` hands the chosen conversation back to
 * the node, which is what makes 「이어하기」 resume the SAME id so the next save updates
 * that row rather than creating a duplicate.
 *
 * This is a popup INSIDE the node, not a window: a modal would float above the canvas and
 * cover whatever the user is looking at while they pick a conversation.
 */
export async function openChatHistory(anchor, opts = {}) {
    const onRestore = opts.onRestore || (() => {});
    const onImageModeChange = opts.onImageModeChange || (() => {});
    let imageMode = opts.imageMode || "small";
    let chats = [];
    let maxChats = 30;

    const pop = document.createElement("div");
    pop.className = "bada-chat-history-pop";
    // Semi-transparent backdrop so the floating panel reads as a layer above the canvas
    // instead of looking like a gap in the node. It is a sibling, NOT a child: giving it
    // its own class means the `pop.contains()` outside-click guard ignores it and treats a
    // backdrop click as "click outside", which closes the popup.
    const backdrop = document.createElement("div");
    backdrop.className = "bada-chat-history-backdrop";

    // Idempotent, and it tells the OWNER that the popup is gone. Without the callback the
    // owner's handle survives an Esc / canvas-click dismissal, and because the button now
    // toggles on that stale handle, the very next click would close an already-closed
    // popup and appear to do nothing.
    let closed = false;
    const close = () => {
        if (closed) return;
        closed = true;
        pop.remove();
        backdrop.remove();
        document.removeEventListener("pointerdown", onOutside, true);
        document.removeEventListener("keydown", onKey, true);
        if (typeof opts.onClose === "function") opts.onClose();
    };
    // The popup now lives on document.body, so clicking the CANVAS behind it is the
    // natural way out — same affordance as clicking the backdrop of the lightbox.
    // `pop.contains` still guards clicks inside the panel itself.
    const onOutside = (e) => {
        if (!pop.contains(e.target) && e.target !== anchor) close();
    };
    const onKey = (e) => { if (e.key === "Escape") close(); };

    const head = document.createElement("div");
    head.className = "bada-chat-history-head";
    const headTitle = document.createElement("span");
    headTitle.className = "bada-chat-history-title";
    headTitle.textContent = t("title");
    head.appendChild(headTitle);

    const search = document.createElement("input");
    search.type = "text";
    search.className = "bada-chat-history-search";
    search.placeholder = t("search");

    const list = document.createElement("div");
    list.className = "bada-chat-history-list";

    const foot = document.createElement("div");
    foot.className = "bada-chat-history-foot";

    pop.append(head, search, list, foot);
    // document.body 에 붙인다. 노드 안에 붙이면 `.bada-async-gemini-root` 의
    // overflow:hidden 과 520px 고정 폭에 걸려 어떤 크기로 만들어도 잘린다
    // (실측: width 840px 지정 → 실제 437px). 뷰포트 fixed 패널은 둘 다 피한다.
    document.body.appendChild(backdrop);
    document.body.appendChild(pop);

    // ── list ──────────────────────────────────────────────────────────────
    const buildRow = (chat) => {
        const row = document.createElement("div");
        row.className = "bada-chat-history-row";
        if (opts.currentId && chat.id === opts.currentId) row.classList.add("current");

        const meta = [];
        if (chat.messageCount) meta.push(`${chat.messageCount}${t("msgs")}`);
        if (chat.imageCount) meta.push(`${chat.imageCount}${t("imgs")}`);
        if (chat.bytes) meta.push(fmtBytes(chat.bytes));
        const when = fmtWhen(chat.updatedAt);
        if (when) meta.push(when);

        const main = document.createElement("div");
        main.className = "bada-chat-history-main";
        const name = document.createElement("div");
        name.className = "bada-chat-history-name";
        // textContent, never innerHTML: a conversation title is arbitrary user text and
        // must never be parsed as markup.
        name.textContent = chat.title || (T() ? "(제목 없음)" : "(untitled)");
        const metaEl = document.createElement("div");
        metaEl.className = "bada-chat-history-meta";
        metaEl.textContent = meta.join(" · ");
        main.append(name, metaEl);

        // ── 🖼️ previews: only for conversations that actually hold images ──────────
        // Rendered BEFORE `main` so a row without images is pixel-identical to before —
        // the element is only inserted when there is something to show.
        let thumbsEl = null;
        const paintThumbs = (result) => {
            const list2 = (result && result.thumbs) || [];
            const omitted = (result && result.omitted) || 0;
            if (!list2.length && !omitted) return;
            if (thumbsEl) {
                thumbsEl.remove();
                thumbsEl = null;
            }
            thumbsEl = document.createElement("div");
            thumbsEl.className = "bada-chat-history-thumbs";
            // The whole strip is the target — a 28px image is a small click area, and the
            // user asked for "click the thumbnail to resume", not "hit 28×28 exactly".
            thumbsEl.title = T() ? "클릭하면 이 대화를 이어갑니다" : "Click to resume this conversation";
            thumbsEl.onclick = () => resume(thumbsEl);
            list2.forEach((src) => {
                const img = document.createElement("img");
                img.src = src;
                img.alt = "";
                img.loading = "lazy";
                // A 28px preview must never blow the row out if the source is still decoding.
                img.width = 28;
                img.height = 28;
                // The strip owns the click; the image must not also open a lightbox.
                img.onclick = (e) => { e.stopPropagation(); };
                thumbsEl.appendChild(img);
            });
            // 「저장 안 함」 turns have no bytes; say so rather than implying "no images".
            if (omitted) {
                const ghost = document.createElement("span");
                ghost.className = "bada-chat-history-thumb ghost";
                ghost.title = T()
                    ? `이미지 ${omitted}장은 「저장 안 함」이라 미리보기가 없습니다`
                    : `${omitted} image(s) were saved with 「Don't save」 — no preview`;
                ghost.textContent = "🖼";
                thumbsEl.appendChild(ghost);
            }
            row.insertBefore(thumbsEl, main);
        };
        // Lazy: only conversations the summary says hold images are fetched at all, and the
        // request waits for the row to actually scroll into view.
        if (chat.imageCount > 0) {
            loadThumbs(chat.id).then((result) => {
                // The row may have been re-rendered (search / pin) and detached already.
                if (row.isConnected) paintThumbs(result);
            });
        }

        // One restore path shared by 「이어하기」 and a clicked preview: a preview is a
        // shortcut to the SAME conversation, never a separate lightbox, so a click can
        // never land the user somewhere other than where the row points.
        const resume = async (trigger) => {
            trigger.disabled = true;
            try {
                const resp = await fetch(`${API.get}?id=${encodeURIComponent(chat.id)}`);
                const data = await resp.json();
                if (!data.success) throw new Error(data.error || (T() ? "불러오기 실패" : "Load failed"));
                await onRestore(data.chat);
                close();
            } catch (err) {
                alert(t("failed").replace("{err}", err.message));
            } finally {
                trigger.disabled = false;
            }
        };

        const openBtn = document.createElement("button");
        openBtn.type = "button";
        openBtn.className = "bada-chat-history-open";
        openBtn.textContent = t("restore");
        openBtn.onclick = () => resume(openBtn);

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "bada-chat-history-del";
        delBtn.textContent = t("remove");
        delBtn.title = t("removeTitle");
        delBtn.onclick = async () => {
            if (!confirm(t("confirmDelete").replace("{title}", chat.title || ""))) return;
            try {
                await postJSON(API.del, { id: chat.id });
                chats = chats.filter(c => c.id !== chat.id);
                render();
            } catch (err) {
                alert(t("failed").replace("{err}", err.message));
            }
        };

        const pinBtn = document.createElement("button");
        pinBtn.type = "button";
        pinBtn.className = "bada-chat-history-pin";
        pinBtn.textContent = t("pin");
        // Reflect state two ways: the tooltip says what clicking will DO, and the row
        // highlight says what is already true.
        const synced = chat.pinned ? t("unpinTitle") : t("pinTitle");
        pinBtn.title = synced;
        pinBtn.setAttribute("aria-pressed", chat.pinned ? "true" : "false");
        pinBtn.setAttribute("aria-label", synced);
        if (chat.pinned) {
            row.classList.add("pinned");
            pinBtn.classList.add("on");
        }
        pinBtn.onclick = async () => {
            pinBtn.disabled = true;
            try {
                const next = !chat.pinned;
                // Re-read the list from the server rather than patching the local copy:
                // pinning moves the row to the top of the list, so its POSITION changes
                // too, and that ordering lives on the server.
                const data = await postJSON(API.pin, { id: chat.id, pinned: next });
                chat.pinned = data.chat ? !!data.chat.pinned : next;
                showToast(chat.pinned ? t("pinnedOn") : t("pinnedOff"));
                await load();
            } catch (err) {
                alert(t("failed").replace("{err}", err.message));
            } finally {
                pinBtn.disabled = false;
            }
        };

        row.append(main, pinBtn, openBtn, delBtn);
        return row;
    };

    // Sticky header for the pinned block. It is a sibling INSIDE the scroll container so it
    // stays put while the list scrolls — the pinned chats must remain identifiable when the
    // user has scrolled down into the unpinned ones.
    const sectionEl = document.createElement("div");
    sectionEl.className = "bada-chat-history-section";
    sectionEl.textContent = t("pinnedSection");

    const render = () => {
        const needle = (search.value || "").trim().toLowerCase();
        const rows = chats.filter(c => !needle || (c.title || "").toLowerCase().includes(needle));

        list.innerHTML = "";
        if (!rows.length) {
            const empty = document.createElement("div");
            empty.className = "bada-chat-history-empty";
            empty.textContent = needle
                ? (T() ? "검색 결과가 없습니다." : "No matches.")
                : t("empty");
            list.appendChild(empty);
            return;
        }
        // The search filter is applied BEFORE the split, so a query that matches only
        // unpinned chats shows no header at all rather than an empty "고정됨" band.
        const pinned = rows.filter(c => c.pinned);
        const loose = rows.filter(c => !c.pinned);
        if (pinned.length) {
            list.appendChild(sectionEl);
            pinned.forEach(chat => list.appendChild(buildRow(chat)));
        }
        loose.forEach(chat => list.appendChild(buildRow(chat)));
    };

    const load = async () => {
        try {
            const resp = await fetch(API.list);
            const data = await resp.json();
            if (!data.success) throw new Error(data.error || (T() ? "목록 조회 실패" : "List failed"));
            chats = Array.isArray(data.chats) ? data.chats : [];
            maxChats = data.maxChats || 30;
            render();
        } catch (err) {
            list.innerHTML = "";
            const msg = document.createElement("div");
            msg.className = "bada-chat-history-empty";
            msg.textContent = t("failed").replace("{err}", err.message);
            list.appendChild(msg);
        }
    };

    search.oninput = render;
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("keydown", onKey, true);

    // ── footer: image-retention picker + backup / restore / clear ──────────
    const renderFoot = () => {
        foot.innerHTML = "";

        const modeWrap = document.createElement("div");
        modeWrap.className = "bada-chat-history-mode";
        const modeLabel = document.createElement("span");
        modeLabel.textContent = t("imageMode");
        const select = document.createElement("select");
        select.className = "bada-chat-history-mode-select";
        const modes = L[T() ? "ko" : "en"].imageModes;
        Object.keys(modes).forEach(key => {
            const opt = document.createElement("option");
            opt.value = key;
            opt.textContent = modes[key];
            if (key === imageMode) opt.selected = true;
            select.appendChild(opt);
        });
        select.onchange = () => {
            imageMode = select.value;
            onImageModeChange(imageMode);
        };
        const note = document.createElement("div");
        note.className = "bada-chat-history-note";
        note.textContent = t("imageNote");
        modeWrap.append(modeLabel, select, note);
        foot.appendChild(modeWrap);

        const row = document.createElement("div");
        row.className = "bada-chat-history-actions";

        const mk = (cls, label, title, onClick) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = `bada-chat-history-act ${cls}`;
            b.textContent = label;
            if (title) b.title = title;
            b.onclick = onClick;
            return b;
        };

        const backupBtn = mk("", t("backup"),
            T() ? `최근 ${maxChats}개 대화를 .json 파일로 내려받습니다.`
                : `Download the newest ${maxChats} conversations as a .json file.`,
            () => {
                fetch(API.exportUrl)
                    .then(res => res.blob())
                    .then(blob => {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.style.display = "none";
                        a.href = url;
                        a.download = "bada_gemini_chats_backup.json";
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                    })
                    .catch(() => {
                        showToast(T() ? "백업 다운로드에 실패했습니다." : "Failed to download backup.", "error");
                    });
            });

        const importBtn = mk("", t("restore2"),
            T() ? "백업 .json 파일을 불러옵니다." : "Load a backup .json file.",
            () => {
                const picker = document.createElement("input");
                picker.type = "file";
                picker.accept = "application/json,.json";
                picker.onchange = async () => {
                    const file = picker.files && picker.files[0];
                    if (!file) return;
                    try {
                        const payload = JSON.parse(await file.text());
                        // With nothing to lose, merge without asking. Otherwise replace is the
                        // destructive default only behind an explicit confirmation.
                        const merge = !chats.length || confirm(T()
                            ? "현재 기록과 병합할까요?\n취소하면 전체를 교체합니다."
                            : "Merge with the current history?\nCancel replaces everything.");
                        const data = await postJSON(API.importUrl, { payload, merge });
                        alert((merge ? t("importedMerge") : t("imported")).replace("{n}", data.imported));
                        await load();
                    } catch (err) {
                        alert(t("failed").replace("{err}", err.message));
                    }
                };
                picker.click();
            });

        const clearBtn = mk("danger", t("clearAll"), "",
            async () => {
                if (!chats.length) return;
                if (!confirm(t("confirmClear"))) return;
                try {
                    await postJSON(API.clear, { confirm: true });
                    chats = [];
                    render();
                } catch (err) {
                    alert(t("failed").replace("{err}", err.message));
                }
            });

        row.append(backupBtn, importBtn, clearBtn);
        const cap = document.createElement("span");
        cap.className = "bada-chat-history-cap";
        cap.textContent = t("cap").replace("{n}", maxChats);
        row.appendChild(cap);
        foot.appendChild(row);
    };

    // Place after the first paint so offsetWidth is real, then clamp inside the node.
    requestAnimationFrame(() => {
        const host = pop.offsetParent;
        if (!host) return;
        const btnRect = anchor.getBoundingClientRect();
        const hostRect = host.getBoundingClientRect();
        const width = pop.offsetWidth || 320;
        let left = btnRect.right - hostRect.left - width;
        left = Math.max(6, Math.min(left, hostRect.width - width - 6));
        pop.style.left = `${left}px`;
        pop.style.top = `${btnRect.bottom - hostRect.top + 6}px`;
    });

    renderFoot();
    await load();
    search.focus();
    return { close };
}