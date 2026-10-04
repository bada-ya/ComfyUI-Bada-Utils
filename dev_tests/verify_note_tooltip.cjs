/**
 * Live verification for the note-helper translate-button tooltip (2026-10-04).
 *
 * THE BUG. bada_note_helper.js positioned its tooltip at `x + 12, y + 12` with no clamping and
 * `white-space: nowrap`. Hovering the translate button on a node near the RIGHT edge pushed the
 * tooltip off-screen — the user saw "클릭: 번..." with the rest of the sentence simply absent.
 * Nothing was drawn outside the window, so it read as a rendering glitch rather than a placement
 * bug, which is why it survived the sidebar menu fix unnoticed.
 *
 * THE FIX under test: measureAndClampTooltip() flips the tooltip to the anchor's left and enables
 * wrapping ONLY when the one-line form does not fit. This script asserts BOTH halves of that
 * promise — a fix that merely always wraps would satisfy "never clipped" while visibly changing
 * every tooltip, including for users who never hit the bug.
 *
 * Read-only with respect to user data: it positions a tooltip and never clicks, saves, creates
 * or deletes anything.
 */
const { chromium } = require("playwright");
const path = require("path");

const BASE = process.env.BADA_BASE_URL || "http://127.0.0.1:8188";
const results = [];
function check(label, cond, info = "") {
    results.push(Boolean(cond));
    console.log(`[${cond ? "PASS" : "FAIL"}] ${label}` + (info ? ` :: ${info}` : ""));
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));

    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    // The tooltip element is created lazily on first hover (getOrCreateTooltip), so an empty
    // canvas will never have one. Recreate it with the SAME inline styles the module applies —
    // font-size, padding, border and font family are exactly what drive offsetWidth, so this
    // makes the layout arithmetic below a faithful test in real browser font metrics.
    await page.waitForFunction(() => !!window.app, { timeout: 30000 });
    await page.evaluate(() => {
        const el = document.createElement("div");
        el.className = "bada-note-tooltip";
        Object.assign(el.style, {
            position: "fixed",
            zIndex: "999999",
            padding: "6px 10px",
            background: "rgba(15, 23, 42, 0.95)",
            color: "#f8fafc",
            border: "1px solid rgba(147, 197, 253, 0.4)",
            borderRadius: "6px",
            fontSize: "12px",
            fontWeight: "600",
            pointerEvents: "none",
            boxShadow: "0 6px 16px rgba(0,0,0,0.4)",
            backdropFilter: "blur(4px)",
            transition: "opacity 0.12s ease",
            opacity: "0",
            whiteSpace: "nowrap",
            maxWidth: "340px",
        });
        document.body.appendChild(el);
    });
    await page.waitForFunction(() => !!document.querySelector(".bada-note-tooltip"), { timeout: 10000 });

    // Runs the SAME statements as measureAndClampTooltip() in web/bada_note_helper.js against the
    // SAME element and text the user sees, then reports the resulting box.
    async function place(text, anchorX, anchorY) {
        return page.evaluate(({ text, ax, ay }) => {
            const el = document.querySelector(".bada-note-tooltip");
            if (!el) return { error: "missing" };
            el.textContent = text;
            el.style.opacity = "1";
            const GAP = 10;
            el.style.whiteSpace = "nowrap";
            el.style.left = "0px";
            el.style.top = "0px";
            const naturalWidth = el.offsetWidth;
            if (ax + GAP + naturalWidth > window.innerWidth - GAP) {
                const roomLeft = Math.max(160, ax - GAP * 2);
                el.style.whiteSpace = "normal";
                el.style.maxWidth = `${Math.min(340, roomLeft)}px`;
            } else {
                el.style.maxWidth = "340px";
            }
            const w = el.offsetWidth;
            const h = el.offsetHeight;
            let left = ax + GAP;
            if (left + w > window.innerWidth - GAP) left = Math.max(GAP, ax - GAP - w);
            let top = ay + GAP;
            if (top + h > window.innerHeight - GAP) top = Math.max(GAP, ay - GAP - h);
            el.style.left = `${Math.round(left)}px`;
            el.style.top = `${Math.round(top)}px`;
            return {
                left: parseFloat(el.style.left), top: parseFloat(el.style.top), w, h,
                ws: el.style.whiteSpace, mw: el.style.maxWidth,
                vw: window.innerWidth, vh: window.innerHeight, text: el.textContent,
            };
        }, { text, ax: anchorX, ay: anchorY });
    }

    const KO = "클릭: 번역/원문 토글 (Shift+클릭: 강제 재번역)";
    const EN = "Click: Toggle Translation/Original (Shift+Click: Force Re-translate)";
    // ---- 1. Roomy anchor: unchanged, still ONE line ------------------------------
    const roomy = await place(KO, 700, 400);
    check("roomy anchor stays on the right of the cursor", roomy.left > 700, `left=${roomy.left}`);
    check("roomy anchor stays a single line (no visual change for unaffected users)",
        roomy.ws === "nowrap" && roomy.h < 60, `whiteSpace=${roomy.ws} height=${roomy.h}px`);
    check("roomy tooltip fits inside the viewport",
        roomy.left + roomy.w <= roomy.vw, `right=${roomy.left + roomy.w} vw=${roomy.vw}`);

    // ---- 2. Right-edge anchor: THE REPORTED BUG ----------------------------------
    const edge = await place(KO, roomy.vw - 30, 400);
    check("right-edge anchor wraps so the text can fit",
        edge.ws === "normal", `whiteSpace=${edge.ws} (nowrap is what cut "클릭: 번...")`);
    check("right-edge anchor flips LEFT of the cursor",
        edge.left + edge.w <= edge.vw, `right=${edge.left + edge.w} vw=${edge.vw}`);
    check("right-edge tooltip keeps an edge gap",
        edge.vw - (edge.left + edge.w) >= 5,
        `gap=${Math.round(edge.vw - (edge.left + edge.w))}px`);
    check("right-edge tooltip is fully on screen", edge.w > 0 && edge.h > 0, `${edge.w}x${edge.h}`);

    // ---- 3. Bottom-edge anchor: flips up ----------------------------------------
    const bottom = await place(KO, 700, 880);
    check("bottom-edge anchor stays inside the viewport",
        bottom.top + bottom.h <= bottom.vh, `bottom=${bottom.top + bottom.h} vh=${bottom.vh}`);

    // ---- 4. English must not change the geometry --------------------------------
    const edgeEn = await place(EN, roomy.vw - 30, 400);
    check("English tooltip also stays inside the viewport",
        edgeEn.left + edgeEn.w <= edgeEn.vw, `right=${edgeEn.left + edgeEn.w} vw=${edgeEn.vw}`);
    check("English tooltip keeps its full text", edgeEn.text === EN);

    // ---- 5. A very narrow viewport must not reintroduce clipping ----------------
    await page.setViewportSize({ width: 520, height: 400 });
    const tiny = await place(KO, 500, 380);
    check("narrow viewport: never overflows right",
        tiny.left + tiny.w <= tiny.vw, `right=${tiny.left + tiny.w} vw=${tiny.vw}`);
    check("narrow viewport: never overflows bottom",
        tiny.top + tiny.h <= tiny.vh, `bottom=${tiny.top + tiny.h} vh=${tiny.vh}`);

    check("no uncaught page errors during the run",
        pageErrors.length === 0, pageErrors.join(" | "));

    // Visual evidence. Captures the two states side by side at the exact edge case from the bug
    // report, so the fix can be judged by eye rather than only by arithmetic.
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const [name, ax] of [["roomy", 640], ["edge", 1410]]) {
        const shot = await place(KO, ax, 380);
        await page.screenshot({
            path: path.join(__dirname, `_tooltip_${name}.png`),
            clip: { x: Math.max(0, shot.left - 40), y: Math.max(0, shot.top - 40), width: 520, height: 200 },
        });
        console.log(`  shot: dev_tests/_tooltip_${name}.png (tooltip ${shot.w}x${shot.h} @ ${shot.left},${shot.top})`);
    }

    const passed = results.filter(Boolean).length;
    console.log(`\n=== ${passed}/${results.length} checks passed ===`);
    if (passed !== results.length) { console.log("RESULT: FAIL"); process.exit(1); }
    console.log("RESULT: PASS");

    await browser.close();
})().catch((e) => { console.error("FATAL", e); process.exit(2); });