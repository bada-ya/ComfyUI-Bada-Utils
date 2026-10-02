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