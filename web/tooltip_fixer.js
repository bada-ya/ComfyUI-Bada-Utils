/**
 * ⚓ Bada Tooltip Fixer (PrimeVue Ghost Tooltip Annihilator & Auto-Aligner)
 * ─────────────────────────────────────────────────────────────────────────────
 * Resolves the notorious ComfyUI native bug when using '--enable-manager-legacy-ui',
 * where PrimeVue tooltips lose coordinate alignment and accumulate at (0, 0).
 * 
 * 1. Safely wraps legacy ComfyUI-Manager's body capture mouseenter listener
 * 2. Real-time tracks the hovered tooltip host element
 * 3. Auto-repositions (0, 0) orphaned tooltips directly adjacent to their host (e.g. (i) icon)
 * 4. Strictly prevents tooltip stacking and cleans up stale/abandoned tooltips
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function setupBadaTooltipFixer() {
    if (typeof window === "undefined" || window.__BADA_TOOLTIP_FIXER_INSTALLED__) return;
    window.__BADA_TOOLTIP_FIXER_INSTALLED__ = true;

    // 1. Intercept legacy manager's aggressive capture phase mouseenter/mouseleave
    const origAddEventListener = EventTarget.prototype.addEventListener;
    const origRemoveEventListener = EventTarget.prototype.removeEventListener;
    // 래핑 매핑: removeEventListener(원본) 호출 시 래핑본으로 변환해 해제 (A안).
    const wrappedListeners = new WeakMap();
    EventTarget.prototype.addEventListener = function (type, listener, options) {
        if (this === document.body && (type === "mouseenter" || type === "mouseleave") && (options === true || options?.capture)) {
            const safeListener = function (e) {
                // Only invoke legacy manager handler if target actually carries the 'tooltip' attribute
                if (e.target && typeof e.target.getAttribute === "function" && e.target.getAttribute("tooltip")) {
                    return listener.apply(this, arguments);
                }
            };
            // 원본 -> 래핑 매핑 보관 (같은 원본 재등록 시 기존 래핑 재사용).
            let perTarget = wrappedListeners.get(this);
            if (!perTarget) {
                perTarget = new Map();
                wrappedListeners.set(this, perTarget);
            }
            let perType = perTarget.get(type);
            if (!perType) {
                perType = new Map();
                perTarget.set(type, perType);
            }
            perType.set(listener, safeListener);
            return origAddEventListener.call(this, type, safeListener, false);
        }
        return origAddEventListener.apply(this, arguments);
    };
    EventTarget.prototype.removeEventListener = function (type, listener, options) {
        try {
            const perTarget = wrappedListeners.get(this);
            const wrapped = perTarget?.get(type)?.get(listener);
            if (wrapped) {
                perTarget.get(type).delete(listener);
                return origRemoveEventListener.call(this, type, wrapped, false);
            }
        } catch (_) { console.debug("[Bada] ignored:", _); }
        return origRemoveEventListener.apply(this, arguments);
    };

    // 2. Track the actively hovered host element
    let activeHost = null;
    document.addEventListener("pointerover", (e) => {
        const host = e.target.closest?.(
            '[data-pd-tooltip], [aria-describedby], .pi-info-circle, i, svg, [title], [tooltip], .p-button, button, .cursor-pointer, span'
        );
        if (host) {
            const hasIndicator = host.tagName === 'I' || 
                                 host.tagName === 'svg' || 
                                 host.getAttribute?.('data-pd-tooltip') || 
                                 host.getAttribute?.('aria-describedby') || 
                                 host.textContent === 'ⓘ' ||
                                 host.classList?.contains('pi-info-circle');
            if (hasIndicator) {
                activeHost = host;
            }
        }
    }, { capture: true, passive: true });

    // 3. Auto-Repositioner & Orphan Annihilator for PrimeVue .p-tooltip
    function sanitizeTooltips() {
        const tooltips = Array.from(document.querySelectorAll(".p-tooltip"));
        if (tooltips.length === 0) return;

        tooltips.forEach((tt, idx) => {
            // Guarantee single visible tooltip policy: delete older duplicates
            if (idx < tooltips.length - 1) {
                tt.remove();
                return;
            }

            const style = window.getComputedStyle(tt);
            const topPx = parseFloat(style.top || "0");
            const leftPx = parseFloat(style.left || "0");
            const rect = tt.getBoundingClientRect();

            // Detect if misplaced at top-left (0, 0)
            const isMisplaced = (rect.left <= 25 && rect.top <= 25) || (topPx === 0 && leftPx === 0);
            if (isMisplaced) {
                if (activeHost && activeHost.isConnected) {
                    const hostRect = activeHost.getBoundingClientRect();
                    // Host must be visible on screen
                    if (hostRect.width > 0 && hostRect.height > 0) {
                        const ttW = tt.offsetWidth || 180;
                        const ttH = tt.offsetHeight || 32;

                        let targetLeft = hostRect.left + (hostRect.width / 2) - (ttW / 2);
                        let targetTop = hostRect.top - ttH - 8;

                        // Clamping to screen viewport boundaries
                        if (targetLeft < 10) targetLeft = 10;
                        if (targetLeft + ttW > window.innerWidth - 10) targetLeft = window.innerWidth - ttW - 10;
                        if (targetTop < 10) targetTop = hostRect.bottom + 8; // Flip to bottom if no room above

                        tt.style.setProperty("left", targetLeft + "px", "important");
                        tt.style.setProperty("top", targetTop + "px", "important");
                        tt.style.setProperty("display", "block", "important");
                        tt.style.setProperty("opacity", "1", "important");
                        tt.style.setProperty("visibility", "visible", "important");
                        tt.style.setProperty("pointer-events", "none", "important");
                        return;
                    }
                }
                // If no active host found, purge the orphan element
                tt.remove();
            }
        });
    }

    // 4. MutationObserver to catch tooltip mounting
    const observer = new MutationObserver((mutations) => {
        let shouldSanitize = false;
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node.nodeType === 1 && (node.classList?.contains("p-tooltip") || node.querySelector?.(".p-tooltip"))) {
                    shouldSanitize = true;
                    break;
                }
            }
            if (shouldSanitize) break;
        }
        if (shouldSanitize) {
            requestAnimationFrame(sanitizeTooltips);
            setTimeout(sanitizeTooltips, 20);
        }
    });

    try {
        observer.observe(document.body, { childList: true });
    } catch (_) { console.debug("[Bada] ignored:", _); }

    // 5. Clean up on pointerdown, tab switch, and escape
    window.addEventListener("pointerdown", () => {
        document.querySelectorAll(".p-tooltip").forEach(t => t.remove());
    }, { capture: true, passive: true });

    // 6. Global CSS Safety Net
    const style = document.createElement("style");
    style.id = "bada-tooltip-guard-css";
    style.textContent = `
        /* Prevent (0, 0) ghost tooltip flash before JS repositions */
        .p-tooltip[style*="left: 0px; top: 0px"],
        .p-tooltip[style*="top: 0px; left: 0px"] {
            opacity: 0 !important;
        }
    `;
    document.head.appendChild(style);

    console.log("%c[ComfyUI-Bada-Utils]%c 🛡️ Ghost Tooltip Auto-Healer & PrimeVue Aligner Active", "color: #00f0ff; font-weight: bold;", "color: inherit;");
})();
