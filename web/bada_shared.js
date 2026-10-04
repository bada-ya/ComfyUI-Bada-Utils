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

const TOAST_STYLE_ID = "bada-shared-toast-style";
const TOAST_CONTAINER_ID = "bada-shared-toast-container";

function ensureToastStyles() {
    if (document.getElementById(TOAST_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = TOAST_STYLE_ID;
    style.textContent = `
        .bada-toast {
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
            transition: opacity 0.25s ease;
            pointer-events: none;
        }
        .bada-toast.error {
            border-color: #ef4444;
            color: #fef2f2;
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
    toast.className = `bada-toast${type === "error" ? " error" : ""}`;
    const icon = document.createElement("span");
    icon.textContent = type === "error" ? "❌" : "✨";
    const text = document.createElement("span");
    text.textContent = String(message);
    toast.append(icon, text);
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
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