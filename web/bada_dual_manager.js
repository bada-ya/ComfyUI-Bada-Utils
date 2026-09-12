/**
 * ComfyUI-Bada-Utils · Classic Manager Quick Launcher (클래식 매니저 퀵 런처)
 * 
 * Injects a classic blue puzzle-icon Manager button to the modern ComfyUI top bar
 * directly to the left of the 'Extensions' button.
 * Controlled by setting 'BadaUtils.DualManager'.
 * Clicking this button launches the classic/legacy ComfyUI-Manager dialog.
 */
import { app } from "../../scripts/app.js";

// 1. Invisible anchor guard: Prevents legacy comfyui-manager.js setup from crashing on null .comfy-menu
(function ensureLegacyMenuAnchor() {
    if (typeof document === "undefined") return;
    const ensure = () => {
        if (!document.querySelector(".comfy-menu") && document.body) {
            const dummy = document.createElement("div");
            dummy.className = "comfy-menu bada-hidden-anchor";
            dummy.style.display = "none";
            document.body.appendChild(dummy);
        }
    };
    if (document.body) ensure();
    else document.addEventListener("DOMContentLoaded", ensure);
})();

// 2. Channel list sanitizer: Ensure selected channel (e.g. 'custom') is present in dropdown list
(function setupChannelSanitizer() {
    if (window._badaChannelSanitizerInstalled) return;
    window._badaChannelSanitizerInstalled = true;

    const origFetch = window.fetch;
    window.fetch = async function (...args) {
        const res = await origFetch.apply(this, args);
        try {
            const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
            if (url && url.includes("/v2/manager/channel_url_list") && (!args[1] || !args[1].method || args[1].method.toUpperCase() === "GET")) {
                const clone = res.clone();
                const data = await clone.json();
                if (data && Array.isArray(data.list) && data.selected) {
                    const hasSelected = data.list.some(item => item.split("::")[0] === data.selected);
                    if (!hasSelected) {
                        data.list.push(`${data.selected}::${data.selected}`);
                        return new Response(JSON.stringify(data), {
                            status: res.status,
                            statusText: res.statusText,
                            headers: res.headers
                        });
                    }
                }
            }
        } catch (_) {}
        return res;
    };
})();

function isDualManagerEnabled() {
    try {
        if (app?.ui?.settings) {
            const val = app.ui.settings.getSettingValue("BadaUtils.DualManager", true);
            if (typeof val === "boolean") return val;
        }
    } catch (_) {}
    return true;
}

export function updateDualManagerVisibility(forceState) {
    const pill = document.getElementById("bada-dual-manager-pill");
    const enabled = (forceState !== undefined) ? !!forceState : isDualManagerEnabled();
    if (pill) {
        pill.style.display = enabled ? "inline-flex" : "none";
    }
}
window.__BADA_SET_DUAL_MANAGER_VISIBILITY__ = updateDualManagerVisibility;

export function setupDualManager() {
    if (window._badaDualManagerInitialized) return;
    window._badaDualManagerInitialized = true;

    console.log("[ComfyUI-Bada-Utils] Initializing Classic Manager Quick Launcher (클래식 매니저 퀵 런처)...");

    const findAnchorContainer = () => {
        // 1. Search for modern ComfyUI extensions blocks icon -> find its outer pill container
        const iconMatch = document.querySelector('[class*="comfy--extensions-blocks"]');
        if (iconMatch) {
            const btn = iconMatch.closest("button, a, [role='button'], .p-button");
            if (btn) {
                const topBarPill = btn.closest('.flex.items-start.gap-2 > *') || btn.parentElement;
                if (topBarPill && topBarPill !== document.body && topBarPill.parentElement) {
                    return topBarPill;
                }
                return btn;
            }
        }

        // 2. Search for button with aria-label / title containing 'extension'
        const directMatch = document.querySelector(
            'button[aria-label*="extension" i], ' +
            'button[aria-label*="확장" i], ' +
            'button[title*="extension" i], ' +
            'button[title*="확장" i], ' +
            '[data-testid*="extension" i]'
        );
        if (directMatch && directMatch.id !== "bada-legacy-manager-btn") {
            const topBarPill = directMatch.closest('.flex.items-start.gap-2 > *') || directMatch.parentElement;
            if (topBarPill && topBarPill !== document.body && topBarPill.parentElement) {
                return topBarPill;
            }
            return directMatch;
        }

        // 3. Search via text content for 'Extensions' or '확장'
        const allButtons = Array.from(document.querySelectorAll("button, [role='button']"));
        for (const b of allButtons) {
            if (b.id === "bada-legacy-manager-btn" || b.closest("#bada-dual-manager-pill")) continue;
            const txt = (b.innerText || b.textContent || "").trim();
            if (txt === "Extensions" || txt === "확장" || txt.includes("Extensions")) {
                const topBarPill = b.closest('.flex.items-start.gap-2 > *') || b.parentElement;
                if (topBarPill && topBarPill !== document.body && topBarPill.parentElement) {
                    return topBarPill;
                }
                return b;
            }
        }

        // 4. Primary Top-bar Anchor: action-bar-card
        const actionCard = document.querySelector('[data-testid="action-bar-card"]');
        if (actionCard && actionCard.parentElement) {
            const prev = actionCard.previousElementSibling;
            if (prev && prev.id !== "bada-dual-manager-pill") {
                return prev;
            }
            return actionCard;
        }

        return null;
    };

    const injectButton = () => {
        const anchorEl = findAnchorContainer();
        if (!anchorEl || !anchorEl.parentElement) {
            return; // Wait until topbar anchor is in DOM
        }

        let pill = document.getElementById("bada-dual-manager-pill");
        if (pill && pill.nextElementSibling === anchorEl) {
            updateDualManagerVisibility();
            return; // Already perfectly positioned directly before Extensions!
        }

        if (!pill) {
            pill = document.createElement("div");
            pill.id = "bada-dual-manager-pill";
            pill.className = "bada-manager-pill pointer-events-auto flex h-12 shrink-0 items-center rounded-lg border border-interface-stroke bg-comfy-menu-bg px-2 shadow-interface";
            pill.style.boxSizing = "border-box";
            pill.style.display = isDualManagerEnabled() ? "inline-flex" : "none";
            pill.style.alignItems = "center";
            pill.style.flexShrink = "0";
            pill.style.zIndex = "10";

            const btn = document.createElement("button");
            btn.id = "bada-legacy-manager-btn";
            btn.type = "button";
            btn.title = "Open Classic ComfyUI-Manager (클래식 매니저 퀵 런처)";

            btn.innerHTML = `
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="margin-right: 5px; vertical-align: middle; flex-shrink: 0;">
                    <path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5s-1.12-2.5-2.5-2.5z"/>
                </svg>
                <span style="font-weight: 600; font-size: 12px; letter-spacing: 0.2px; line-height: 1;">Manager</span>
            `;

            Object.assign(btn.style, {
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#1f618d",
                color: "#ffffff",
                border: "1px solid rgba(255, 255, 255, 0.18)",
                borderRadius: "6px",
                padding: "4px 10px",
                height: "28px",
                cursor: "pointer",
                transition: "all 0.15s ease",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.3)",
                userSelect: "none",
                verticalAlign: "middle",
                fontFamily: "inherit",
                flexShrink: "0"
            });

            btn.onmouseenter = () => {
                btn.style.backgroundColor = "#2980b9";
                btn.style.boxShadow = "0 2px 5px rgba(0, 0, 0, 0.4)";
            };
            btn.onmouseleave = () => {
                btn.style.backgroundColor = "#1f618d";
                btn.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.3)";
                btn.style.transform = "none";
            };
            btn.onmousedown = () => {
                btn.style.transform = "scale(0.96)";
            };
            btn.onmouseup = () => {
                btn.style.transform = "none";
            };

            btn.onclick = (e) => {
                e.stopPropagation();
                e.preventDefault();

                if (window.manager_instance && typeof window.manager_instance.show === "function") {
                    window.manager_instance.show();
                    return;
                }

                try {
                    const legacyExt = app.extensions?.find(x => x.name === "Comfy.Legacy.ManagerMenu" || x.name === "Comfy.Manager" || x.name === "ComfyUI-Manager");
                    if (legacyExt) {
                        const toggleCmd = legacyExt.commands?.find(c => c.id === "Comfy.Manager.Menu.ToggleVisibility");
                        if (toggleCmd && typeof toggleCmd.function === "function") {
                            toggleCmd.function();
                            return;
                        }
                        if (legacyExt.legacyDialog && typeof legacyExt.legacyDialog.show === "function") {
                            legacyExt.legacyDialog.show();
                            return;
                        }
                        if (legacyExt.manager_instance && typeof legacyExt.manager_instance.show === "function") {
                            legacyExt.manager_instance.show();
                            return;
                        }
                    }
                } catch (err) {
                    console.warn("[bada] Legacy manager extension lookup error:", err);
                }

                if (window.ComfyListManagerDialog) {
                    try {
                        new window.ComfyListManagerDialog().show();
                        return;
                    } catch (err) {
                        console.warn("[bada] ComfyListManagerDialog error:", err);
                    }
                }

                const cmDlg = document.getElementById("cm-manager-dialog");
                if (cmDlg) {
                    cmDlg.style.display = (cmDlg.style.display === "none") ? "block" : "none";
                    return;
                }

                try {
                    if (app.extensionManager?.executeCommand) {
                        app.extensionManager.executeCommand("Comfy.Manager.Menu.ToggleVisibility");
                        return;
                    }
                } catch (err) {}

                const oldBtn = Array.from(document.querySelectorAll("button")).find(b => 
                    b !== btn && 
                    !b.id.includes("bada") && 
                    (b.textContent?.trim() === "Manager" || b.innerText?.trim() === "Manager")
                );
                if (oldBtn) {
                    oldBtn.click();
                    return;
                }

                console.warn("[bada] Classic ComfyUI-Manager dialog could not be invoked.");
            };

            pill.appendChild(btn);
        }

        // Insert / reposition pill right before anchorEl
        anchorEl.parentElement.insertBefore(pill, anchorEl);
        updateDualManagerVisibility();
        console.log("[ComfyUI-Bada-Utils] Classic Manager Quick Launcher pill placed before anchor:", anchorEl);
    };

    // Continuous polling check every 600ms
    setInterval(injectButton, 600);

    // Immediate reaction to DOM changes
    try {
        const observer = new MutationObserver(() => {
            const anchorEl = findAnchorContainer();
            const pill = document.getElementById("bada-dual-manager-pill");
            if (!pill || !pill.isConnected || (anchorEl && pill.nextElementSibling !== anchorEl)) {
                injectButton();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}

    // Initial attempt
    injectButton();
}

// Standalone self-registration
app.registerExtension({
    name: "bada.ClassicManagerLauncher",
    async setup() {
        setupDualManager();
    }
});
