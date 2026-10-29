/**
 * Shared browser-side helpers.
 *
 * These used to be copy-pasted into every file that needed them: escapeHtml() existed as
 * seven separate module-level functions plus two WorkflowsPlusManager methods, and showToast()
 * as four independent implementations with four separate toast containers and animations.
 * They had already drifted (two different apostrophe entities, some with a falsy guard and
 * some without), which is exactly the failure mode duplication invites.
 *
 * Import from here instead of redefining.
 */

/**
 * Escapes text for safe interpolation into an innerHTML template.
 *
 * Important when the text is not ours: REST error strings embed user-controlled paths and
 * file names, and a workflow/folder name may contain markup on Linux/macOS.
 */
export function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * Flattens a Bada API response into one shape: `{ ok, data, error }`.
 *
 * Every hand-rolled variant of this failed differently, and the failure mode that mattered was
 * always the same one: the reason was thrown away. `await res.json()` on its own rejects when the
 * body is plain text (an unregistered route answers "404: Not Found") or HTML (a 500 page), and a
 * `catch (_)` swallows the reason along with it. Note also that some routes answer HTTP 200 with
 * `success: false` (e.g. a PRO-gated toggle), so `res.ok` alone is not a verdict.
 *
 * `error` is never empty — it falls back to the HTTP status, which keeps `{why}` placeholders in
 * translated strings from rendering as a dangling separator.
 */
export async function readApi(res) {
    let body = null;
    try {
        body = await res.json();
    } catch (_) {
        body = null; // text / HTML / empty body — the status line below is the reason we have
    }
    const data = body && typeof body === "object" ? body : {};
    // Routes that report success without a `success` key (realtime sync) must stay ok.
    if (res.ok && data.success !== false) return { ok: true, data };
    return { ok: false, data, error: String(data.error || data.message || "") || `HTTP ${res.status}` };
}

/**
 * 한 줄로 보여줄 이유 문자열만 남긴다: 공백·개행은 한 칸으로 접고 `max` 자로 자르며, 잘렸다면 `…` 로
 * 그 표시를 남긴다. 서버 `str(e)` 는 트레이스백 수준으로 길 수 있고 개행을 그대로 들고 오는 경우가
 * 있어서, 토스트·title 에 얹기 전에는 반드시 이 통과를 지나게 한다. 인수가 없거나 비면 빈 문자열을
 * 돌려주지 않고 `fallback` 을 쓴다 — `{why}` 자리가 비면 구분자만 남는 화면이 되기 때문.
 */
export function clipReason(value, max = 90, fallback = "") {
    const raw = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
    if (!raw) return String(fallback || "");
    return raw.length > max ? `${raw.slice(0, max)}…` : raw;
}

const TOAST_STYLE_ID = "bada-shared-toast-style";
const TOAST_CONTAINER_ID = "bada-shared-toast-container";

function ensureToastStyles() {
    if (document.getElementById(TOAST_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = TOAST_STYLE_ID;
    // ⚠️ Scope this sheet to `.bada-shared-toast` ONLY.
    //
    // This block used to also style `.bada-toast`, which belongs to the node's OWN in-card
    // banner (web/bada_async_gemini.css). Both rules landed on the SAME element, so the
    // node banner inherited `position:fixed`, `background:rgba(24,24,27,.94)` and
    // `backdrop-filter:blur(4px)` — rendering it as a 751px-tall opaque black slab over
    // the node, exactly the 「창을 닫으면 검정색으로 화면을 가리고 있어」 report. Renaming
    // the JS class alone did NOT fix it: the stale `.bada-toast` rule below kept winning the
    // cascade, which is why the mask survived a reload. One class name, one owner.
    style.textContent = `
        .bada-shared-toast {
            position: fixed;
            right: 16px;
            bottom: 16px;
            z-index: 10001;
            display: flex;
            align-items: center;
            gap: 8px;
            max-width: 340px;
            padding: 10px 14px;
            border-radius: 8px;
            border: 1px solid #3f3f46;
            background: rgba(24, 24, 27, 0.94);
            backdrop-filter: blur(4px);
            color: #e4e4e7;
            font-size: 12px;
            line-height: 1.4;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
            pointer-events: none;
            /* 새 알림은 아래에서 살짝 올라오며 나타나고, 사라질 때는 다시 내려간다.
               transform 을 쓰므로 요소는 자기 자리를 유지한다 — 흐름에 있는 것처럼
               높이 변화를 일으키면 그 위에 있는 UI 가 들썩여 화면이 흔들린다. */
            animation: badaSharedToastIn 0.22s ease-out;
        }
        .bada-shared-toast.error {
            border-color: #ef4444;
            color: #fef2f2;
        }
        .bada-shared-toast.closing {
            animation: badaSharedToastOut 0.22s ease-in forwards;
        }
        @keyframes badaSharedToastIn {
            from { opacity: 0; transform: translateY(10px); }
            to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes badaSharedToastOut {
            from { opacity: 1; transform: translateY(0); }
            to   { opacity: 0; transform: translateY(10px); }
        }
        @media (prefers-reduced-motion: reduce) {
            .bada-shared-toast,
            .bada-shared-toast.closing { animation: none; }
        }
    `;
    document.head.appendChild(style);
}

function ensureToastContainer() {
    let container = document.getElementById(TOAST_CONTAINER_ID);
    if (container) return container;
    ensureToastStyles();
    container = document.createElement("div");
    container.id = TOAST_CONTAINER_ID;
    container.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:10001;display:flex;flex-direction:column;gap:8px;pointer-events:none;";
    document.body.appendChild(container);
    return container;
}

/**
 * Bottom-right toast. `message` is escaped here, so callers may safely forward raw server
 * error text (which embeds user-controlled paths / names).
 */
export function showToast(message, type = "info", duration = 3000) {
    if (message === undefined || message === null || message === "") return;
    const container = ensureToastContainer();
    const toast = document.createElement("div");
    // `bada-shared-toast`, NOT `bada-toast`. The node stylesheet claims `.bada-toast` for
    // its OWN in-card banner (`position:absolute` against `.bada-async-gemini-root`), and
    // sharing the name dragged this fixed viewport toast into the node's coordinate space —
    // it rendered over the canvas, beside the node, instead of the bottom-right corner.
    toast.className = `bada-shared-toast${type === "error" ? " error" : ""}`;
    const icon = document.createElement("span");
    icon.textContent = type === "error" ? "❌" : "✨";
    const text = document.createElement("span");
    text.textContent = String(message);
    toast.append(icon, text);
    container.appendChild(toast);

    setTimeout(() => {
        // Class swap, not an inline opacity write: the exit keyframes animate on their own,
        // and `forwards` keeps the element transparent until it is removed so it cannot
        // flash back to opacity 1 in the gap between the class change and remove().
        toast.classList.add("closing");
        setTimeout(() => toast.remove(), 250);
    }, duration);
}

/**
 * Place a popup (menu, tooltip, preview card) inside the viewport, flipping it to the other
 * side of its anchor when it would overflow.
 *
 * WHY THIS EXISTS (2026-10-04). Every popup in this codebase used to guess its own size with a
 * hardcoded pixel constant, and each guess was wrong in a different direction:
 *
 *   - the Workflows+ sidebar context menu clamped with `innerHeight - 180` against a menu that is
 *     ~300px tall, so right-clicking a workflow near the BOTTOM of the list left Delete (and
 *     anything below it) below the fold — the user reported Rename as the last visible row;
 *   - the font-size menu had no vertical clamp at all;
 *   - the hover preview card assumed a fixed 360px height that a long note blows past;
 *   - the canvas badge tooltip placed itself at `clientX + 14, clientY + 14` with no clamp at
 *     all, so a node at the right or bottom edge of the viewport cut the tooltip off.
 *
 * Measuring instead of guessing fixes all of them at once, and keeps the next popup from
 * inventing its own constant.
 *
 * MEASUREMENT ORDER MATTERS. offsetWidth/offsetHeight are 0 while an element is `display: none`,
 * so the caller MUST make the element visible before calling this. Measuring first silently
 * yields 0 and falls through to the unclamped anchor position — the very bug this replaces.
 *
 * @param {HTMLElement} el      Element to position; its style.left/top are mutated.
 * @param {number}      anchorX Preferred left edge, normally the pointer's clientX.
 * @param {number}      anchorY Preferred top edge, normally the pointer's clientY.
 * @param {number}      [gap]   Minimum breathing room from the window edge. Default 8.
 */
export function placePopupInViewport(el, anchorX, anchorY, gap = 8) {
    if (!el) return { left: 0, top: 0 };

    const w = el.offsetWidth;
    const h = el.offsetHeight;

    let left = anchorX;
    // Flip to the anchor's left rather than clamping: clamping keeps the menu on screen but
    // detaches it from the thing the user clicked, which is worse than a small offset.
    if (left + w > window.innerWidth - gap) {
        left = Math.max(gap, anchorX - w);
    }

    let top = anchorY;
    if (top + h > window.innerHeight - gap) {
        // Flip ABOVE the anchor. Clamping `top` alone just reproduces the original bug with a
        // different constant — the popup still hangs off the bottom.
        top = Math.max(gap, anchorY - h);
    }

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    return { left, top };
}

/**
 * Frontend-version-agnostic settings-row anchors.
 *
 * ComfyUI 0.43.0 ships frontend 1.57.4, whose FormItem dropped the .form-label and
 * .form-input classes. Measured in the installed bundles, not assumed: form-label and
 * form-input occur 2 and 14 times in 1.55.18 and zero times in 1.57.4, while the label
 * anchor <span id="<settingId>-label">, data-setting-id and setting-item are identical
 * in both. Key every settings-DOM lookup off that anchor, and one code path covers
 * <= 1.56 (where the legacy classes still resolve first) and 1.57+ (derived from the
 * span) - no version sniffing, no second build for people on an older ComfyUI.
 *
 * FormItem markup, identical apart from the two removed classes:
 *   div.setting-item[data-setting-id]               the row our CSS hooks
 *     div.flex.min-h-8                             FormItem root
 *       div.(form-label)flex.grow.items-center        label cell
 *         span[id="<settingId>-label"]               title anchor  <-- primary anchor
 *       div.(form-input)flex.justify-end              control cell
 *         <control id aria-labelledby="<settingId>-label">
 */
export function findBadaSettingLabelSpan(row) {
    if (!row) return null;
    const id = row.getAttribute("data-setting-id");
    if (id) {
        // getElementById is not a selector engine, so ids containing dots need no escaping.
        const exact = document.getElementById(id + "-label");
        if (exact && row.contains(exact)) return exact;
    }
    const bySuffix = row.querySelector('span[id$="-label"]');
    if (bySuffix) return bySuffix;
    // Frontends <= 1.56: .form-label is the label cell and wraps the title span.
    const legacy = row.querySelector(".form-label");
    if (!legacy) return null;
    return (legacy.matches("span") ? legacy : legacy.querySelector("span")) || legacy;
}

/**
 * Returns { labelSpan, labelCell, controlCell } for a settings row, or null while the
 * row has not rendered its label yet. Callers must treat null as "retry later".
 */
export function findBadaSettingCells(row) {
    const labelSpan = findBadaSettingLabelSpan(row);
    if (!labelSpan) return null;
    const labelCell = labelSpan.parentElement || row.querySelector(".form-label") || labelSpan;
    // The control cell is the label cell sibling. .form-input stays in the chain for the
    // frontends that still render it.
    const controlCell = (labelCell !== labelSpan && labelCell.nextElementSibling)
        || row.querySelector(".form-input")
        || null;
    return { labelSpan, labelCell, controlCell };
}
