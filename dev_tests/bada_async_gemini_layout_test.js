// Guards the BadaAsyncGeminiStudio panel slimming: the completion banner, the pass-status
// badge and the duplicated in-panel title are gone, and the 🔔 bell moved into the API-key
// label row. These are all *removals*, which nothing else in the suite would catch.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
// The sources are CRLF on Windows, so a pattern anchored to a bare "\n" only passes by
// luck. Normalising once here keeps every check below readable and line-ending agnostic.
const readNormalized = (p) => read(p).replace(/\r\n/g, "\n");
const JS = readNormalized(path.join("web", "bada_async_gemini.js"));
const CSS = readNormalized(path.join("web", "bada_async_gemini.css"));
// The history popup lives in its own module (dynamically imported so the node's initial
// load stays light). Mount-point checks MUST read this file, not JS — asserting on the
// wrong source would fail for the right reason and tempt someone into weakening the check.
const HIST_JS = readNormalized(path.join("web", "bada_gemini_chat_history.js"));

// --- 1b. runtime slice used by the checks below -----------------------------
// openChatImageViewer() is a self-contained block of source, so it can be lifted
// out and executed against a stub DOM. Static patterns cannot prove that pressing
// Esc really removes the overlay, or that an empty list really does nothing.
const VIEWER_START = JS.indexOf("let chatImageViewerCleanup = null;");
// `closeChatImageViewer` is declared BEFORE `openChatImageViewer`, so searching for it
// from VIEWER_START returns -1. The next section header is the reliable end marker.
const VIEWER_END = JS.indexOf("// ── 채팅 기록: 텍스트 컨텍스트 크기", VIEWER_START);
const VIEWER_SRC = JS.slice(VIEWER_START, VIEWER_END);

let fails = 0;
const failed = [];
const check = (label, ok, extra = "") => {
    // `extra` carries the observed value on failure. Without it a BAD line just says
    // WHAT broke, never WHY, and the reader has to re-run with a debugger to learn
    // whether the viewer opened two overlays or zero.
    console.log(`${ok ? "OK " : "BAD"} ${label}${ok || !extra ? "" : `  → ${extra}`}`);
    if (!ok) { fails++; failed.push(label); }
};

// Strip comments before asserting a symbol is ABSENT. This file now carries long prose
// explanations that NAME the removed strings on purpose ("Clipboard image attached", the old
// `window.addEventListener("paste", ...)` call, …), and a file-wide match would read those
// comments as live code and fail a check for entirely the wrong reason.
//
// ONLY line comments are stripped. A block-comment pass (`/\/\*[\s\S]*?\*\//`) is a trap in
// this file: `fileInput.accept = "image/*"` puts a bare `/*` INSIDE a string literal, which
// pairs with some `*/` ~100 KB later and silently deletes a third of the source — every
// positive check below would then report "missing" while the code is present and fine.
const stripComments = (src) => src.replace(/\/\/.*$/gm, "");

// --- 1. completion banner --------------------------------------------------
check("success completion toast removed",
    !/생성 완료! \(소요 시간/.test(JS) && !/completed in \$\{duration\}s!"/.test(JS));
check("the button still reports completion",
    /생성 완료! \(\$\{duration\}초\)/.test(JS));

// The 제미나이 chat tab had a third banner in the same slot.
check("chat completion toast removed",
    !/답변 생성 완료! \(\$\{duration\}초 소요\)/.test(JS) && !/Reply completed in \$\{duration\}s!/.test(JS));
check("chat error toast survives", /채팅 오류/.test(JS) && /Chat error/.test(JS));
// The reply bubble carries its own timing label, so no feedback is lost.
check("reply bubble keeps its inline timer",
    /durSpan\.textContent = `⏱️ \$\{msg\.duration\}\$\{isKoNow \? "초 완료" : "s done"\}`/.test(JS));

// --- 2. pass-status badge --------------------------------------------------
check("'#bada-pass-status' element gone", !JS.includes("bada-pass-status"));
check("pass-badge update logic gone", !/passBadge/.test(JS));
check("dead 'lastWhRatio' state gone", !JS.includes("lastWhRatio"));

// --- 3. title row + bell relocation ----------------------------------------
check("in-panel '⚓ Bada Async Gemini Studio' title gone", !/class="bada-title"/.test(JS));
check("'.bada-title' CSS removed", !/\.bada-title \{/.test(CSS));

// --- 3b. header row (the empty black box) ---------------------------------
// After the title went, the header was left holding only the ZERO-REFUSAL / NON-BLOCKING
// badges — an empty full-width box costing a row in a panel that must scroll. Removed too.
check("header element gone", !/const header = document\.createElement/.test(JS));
check("no 'root.appendChild(header)' left", !JS.includes("root.appendChild(header)"));
check("'bada-gemini-header' class gone from JS", !JS.includes("bada-gemini-header"));
check("'bada-badges-group' gone from JS", !JS.includes("bada-badges-group"));
// Assert the badge *markup* is gone, not the bare words: "Zero-Refusal" legitimately
// survives in a code comment and in the 제미나이 tab's `tag` config value.
check("badge markup gone", !JS.includes('class="bada-badge'));
check("ZERO-REFUSAL / NON-BLOCKING badge spans gone",
    !/🛡️ ZERO-REFUSAL<\/span>/.test(JS) && !/NON-BLOCKING ⚡<\/span>/.test(JS));
check("orphan header CSS removed", !/\.bada-gemini-header \{/.test(CSS) && !/\.bada-badges-group \{/.test(CSS) && !/^\.bada-badge \{/m.test(CSS));
// --- 3d. ON/OFF chips removed, pressed state moved onto the card ------------
// The chips ("ON"/"OFF") cost ~45px + an 8px gap each inside a three-column row, and that
// missing width is what ellipsised the toggle labels in BOTH languages ("Allow NS…",
// "한국어 변…"). They are replaced by `.bada-toggle-card.on` (accent border + fill).
check("'.bada-toggle-badge' markup gone", !/bada-badge-nsfw|bada-badge-trans/.test(JS));
// Anchored to the selector so the comment that documents the removal (which names the old
// class on purpose) is not mistaken for a live rule — same convention as the header checks.
check("'.bada-toggle-badge' CSS rule gone", !/^\s*\.bada-toggle-badge[.{\s]/m.test(CSS));
check("orphan chip colour rules gone (.amber / .green)",
    !/^\s*\.bada-toggle-badge\.amber/m.test(CSS) && !/^\s*\.bada-toggle-badge\.green/m.test(CSS));
check("no ON/OFF chip text left in the toggle markup",
    !/id="bada-badge-/.test(JS) && !/nsfwBadge|transBadge/.test(JS));
check("pressed state is the '.on' class", /\.bada-toggle-card\.on \{/.test(CSS));
check("both toggles get an accent-coloured '.on' state",
    /#bada-toggle-nsfw\.on \{/.test(CSS) && /#bada-toggle-trans\.on \{/.test(CSS));
check("toggle cards expose aria-pressed for the now-textless state",
    /aria-pressed="\$\{isNSFW \? 'true' : 'false'\}"/.test(JS)
    && /aria-pressed="\$\{isTranslate \? 'true' : 'false'\}"/.test(JS)
    && /setAttribute\("aria-pressed"/.test(JS));
check("toggles are reachable by keyboard (role/tabindex + Enter/Space)",
    /id="bada-toggle-nsfw" role="button" tabindex="0"/.test(JS)
    && /id="bada-toggle-trans" role="button" tabindex="0"/.test(JS)
    && /e\.key !== "Enter" && e\.key !== " "/.test(JS));
check("CSS focus ring for the keyboard-focusable cards",
    /\.bada-toggle-card:focus-visible \{/.test(CSS));

// --- 3e. the toggle-click toasts are gone ----------------------------------
// Firing showToast on every toggle click popped the blue banner over the panel — in both
// languages, on both enable and disable. `.bada-toast` is a block child of the card's flex
// column, so each one shoved the layout down instead of floating over it.
const nsfwHandler = JS.slice(JS.indexOf("nsfwToggle.onclick"), JS.indexOf("transToggle.onclick"));
const transHandler = JS.slice(JS.indexOf("transToggle.onclick"), JS.indexOf("syncToggleCards();", JS.indexOf("transToggle.onclick")));
check("NSFW toggle no longer toasts", !/showToast/.test(nsfwHandler));
check("Korean-translation toggle no longer toasts", !/showToast/.test(transHandler));
check("no ON/OFF wording anywhere in the toggle handlers",
    !/Allow NSFW Content: /.test(JS) && !/한국어 번역 및 해설: /.test(JS));
// The state change itself must survive — only the banner was dropped.
check("both toggles still flip state + persist + resync the card",
    /isNSFW = !isNSFW/.test(JS) && /localStorage\.setItem\("bada_is_nsfw", isNSFW\)/.test(JS)
    && /isTranslate = !isTranslate/.test(JS) && /localStorage\.setItem\("bada_is_translate", isTranslate\)/.test(JS)
    && /syncToggleCards\(\);/.test(JS));

// --- 3f. the options row must not crush its labels -------------------------
// `.bada-options-toggles` went `0 1 auto` -> `1 1 auto` and the row gained `flex-wrap`, so
// the toggles win the width fight and the aspect picker wraps below instead of truncating.
check("options row wraps instead of truncating", /\.bada-options-row \{[^}]*flex-wrap: wrap/s.test(CSS));
check("toggles get first claim on the row width", /\.bada-options-toggles \{[^}]*flex: 1 1 auto/s.test(CSS));
check("visible toggle labels kept short enough for 520px",
    /"성인용 콘텐츠 \(NSFW\)" : "Allow NSFW"/.test(JS)
    && /"한국어 번역" : "Korean Translation"/.test(JS));
// The full wording must survive somewhere, since the visible label is now abbreviated.
check("full toggle wording kept in aria-label",
    /aria-label="\$\{isKo \? "성인용 콘텐츠 허용 \(NSFW\)" : "Allow NSFW Content"\}"/.test(JS)
    && /aria-label="\$\{isKo \? "한국어 번역 및 해설" : "Korean Translation & Notes"\}"/.test(JS));
// Live language switching must use the same short labels as the initial render.
check("language switch updates the short labels too",
    /nsfwTitle\.textContent = isKo \? "성인용 콘텐츠 \(NSFW\)" : "Allow NSFW"/.test(JS)
    && /transTitle\.textContent = isKo \? "한국어 번역" : "Korean Translation"/.test(JS));

// --- 5. 제미나이 persona-menu selection must not toast ----------------------
// Every entry in that dropdown (4 Gem personas + all Gemini-only system prompts) funnels
// through applyGemPromptSelection(), so the single showToast there fired on EVERY pick and
// popped the banner over the panel. The trigger label is the real feedback, so only the
// banner goes — the manager-open ERROR toast above must survive.
const personaSelect = JS.slice(
    JS.indexOf("function applyGemPromptSelection"),
    JS.indexOf("function renderPersonaMenu"),
);
check("persona-menu selection no longer toasts", !/showToast/.test(personaSelect));
check("no '📜 적용됨 / Applied' banner left", !/📜 적용됨/.test(JS) && !/📜 Applied/.test(JS));
check("selection still updates the trigger label + closes the menu",
    /personaTriggerLabel\.textContent = activeGemPromptLabel\(\);/.test(personaSelect)
    && /setPersonaMenuOpen\(false\);/.test(personaSelect)
    && /renderPersonaMenu\(\);/.test(personaSelect));
check("selection still persists to localStorage",
    /localStorage\.setItem\("bada_gem_persona"/.test(personaSelect)
    && /localStorage\.setItem\("bada_gem_chat_prompt"/.test(personaSelect));
check("persona menu error toasts survive (manager failures must stay visible)",
    /제미나이 프롬프트 관리자를 열지 못했습니다/.test(JS));

// --- 6. chat composer auto-grows 3 lines -> 5, then scrolls ---------------
// It was pinned to `rows = 1` with a CSS `max-height: 80px` (~3 lines) and no JS resize, so a
// long message had nowhere to go. Requirements: rest at 3 lines, grow upward while typing, stop
// at 5 lines, and scroll the text upward past that.
check("composer rests at 3 lines", /chatTextarea\.rows = 3;/.test(JS));
check("CSS no longer caps the composer at 80px",
    !/\.bada-chat-textarea \{[^}]*max-height: 80px/s.test(CSS));
check("CSS reserves a 3-line floor so it cannot collapse to one line",
    /\.bada-chat-textarea \{[^}]*min-height: 54px/s.test(CSS));
check("auto-grow helper exists and is wired to input",
    /function autoGrowChatTextarea\(\)/.test(JS)
    && /addEventListener\("input", autoGrowChatTextarea\)/.test(JS));
// The `height = "auto"` reset before measuring is the whole trick: without it scrollHeight
// stays pinned to the previous taller box and the composer can never shrink back.
check("auto-grow resets to 'auto' before measuring scrollHeight",
    /chatTextarea\.style\.height = "auto";\s*\n\s*const maxHeight/.test(JS)
    && /const contentHeight = chatTextarea\.scrollHeight;/.test(JS));
check("cap is 5 lines", /const CHAT_TEXTAREA_MAX_LINES = 5;/.test(JS));
check("height is clamped to the 5-line cap",
    /Math\.min\(contentHeight, maxHeight\) \+ "px"/.test(JS));
check("past 5 lines the text scrolls upward instead of growing",
    /overflowY = contentHeight > maxHeight \? "auto" : "hidden"/.test(JS));
check("line-height is explicit so the maths is reliable",
    /\.bada-chat-textarea \{[^}]*line-height: 1\.5/s.test(CSS));
check("initial 3-line height painted after mount",
    /setTimeout\(\(\) => autoGrowChatTextarea\(\), 0\)/.test(JS));
check("sending resets the composer back to 3 lines",
    /chatTextarea\.value = "";[\s\S]{0,400}?autoGrowChatTextarea\(\);/.test(JS));
// The composer's key bindings must survive the rewrite.
check("Enter still sends, Shift+Enter still newlines",
    /e\.key === "Enter" && !e\.shiftKey/.test(JS) && /sendChatMessage\(\);/.test(JS));

// --- 3c. working toast ----------------------------------------------------
// Same layout-shifting `.bada-toast` problem as the completion banner.
check("'working' toast removed",
    !/작업 중\.\.\. \(중단/.test(JS) && !/working\.\.\. \(Click to Stop\)/.test(JS));

// No *generation* banner may come back. `.bada-toast` is a block child of the card's flex
// column, so any "done" toast pushes the panel down — three of them had to be removed for
// this reason. Text-only action confirmations (copy / key check) are a different thing and
// are deliberately left in place, so the assertion is scoped to generation wording.
const genBanners = (JS.match(/showToast\([^\n]*?(생성 완료|작업 중|답변 생성 완료|Reply completed|working\.\.\. \(Click)/g) || []);
check("no generation banner toast left",
    genBanners.length === 0,
    genBanners.length ? genBanners.join(" | ") : "none");
check("action toasts still work (copy / key check)",
    /Copied the \$\{meta\.en\} text to the clipboard/.test(JS)
    && /Google Gemini API Connected/.test(JS));

// IMAGE-ATTACH SUCCESS BANNERS ARE GONE (user request, 2026-10-05). The last layout-shifting
// banner of this kind popped in above the API-key row on every paste, so the node grew, then
// shrank when it expired — a visible jerk that the user reported as "눈아파". The thumbnail row
// re-rendering is the confirmation instead. Error toasts (over the cap, unreadable image) stay.
check("REGRESSION: no image-attach success banner", (function () {
    const live = stripComments(JS);
    return !/Clipboard image attached/.test(live)
        && !/클립보드 이미지 첨부 완료/.test(live)
        && !/참고 이미지 \$\{uploadedImages\.length\}장 첨부 완료/.test(live);
})());
check("REGRESSION: image-attach ERRORS still surface", (function () {
    const live = stripComments(JS);
    return /This mode accepts up to \$\{limit\} image/.test(live)
        && /Could not read the image/.test(live)
        && /Chat attachments are limited to \$\{MAX_CHAT_IMAGES\}/.test(live);
})());

// PASTE ROUTING (2026-10-05). Ctrl+V on the 제미나이 tab used to call handleFiles(), which fills
// the shared prompt-generation strip — a different tab's UI — so the pasted image landed on
// KREA 2 and the chat message went out with no image at all. It must route by tab now.
check("REGRESSION: the paste handler routes by active tab", (function () {
    const h = JS.slice(JS.indexOf("const onGlobalPaste"), JS.indexOf("function updateAllStaticLabels"));
    return /if \(activeEngine === "uncensored"\) handleChatImageFiles\(pasteFiles\);\s*else handleFiles\(pasteFiles\);/.test(h);
})());
// The chat attach path must reach `chatUploadedImages` (what sendChatMessage ships as
// `{role:"user", images:[...]}`), NOT the shared `uploadedImages` strip.
check("REGRESSION: chat paste fills chatUploadedImages, not the shared strip", (function () {
    const fn = JS.slice(JS.indexOf("async function handleChatImageFiles"), JS.indexOf("function readFileAsDataUrl"));
    return /chatUploadedImages\.push\(dataUrl\)/.test(fn)
        && !/uploadedImages\.push/.test(fn);
})());
// The backend already turns each msg.images entry into a Gemini inline_data part, so the
// frontend half of that contract must stay wired.
check("chat send still ships images with the user message", /images: \[\.\.\.chatUploadedImages\]/.test(JS));

// STRAY `Load Image` NODE (2026-10-05). ComfyUI registers a paste handler on `document` in the
// BUBBLE phase (comfyui_frontend_package :: usePaste) that spawns a Load Image node whenever an
// image arrives with no image node selected. A bubble listener on `window` runs AFTER it, which
// is exactly why the node appeared whenever the caret was not in the chat textarea. Ours must be
// a document CAPTURE listener that stops propagation.
check("REGRESSION: paste is captured on document, not bubbled from window", (function () {
    const live = stripComments(JS);
    return /document\.addEventListener\("paste", onGlobalPaste, true\)/.test(live)
        && /document\.removeEventListener\("paste", onGlobalPaste, true\)/.test(live)
        && !/window\.addEventListener\("paste", onGlobalPaste\)/.test(live)
        && !/window\.removeEventListener\("paste", onGlobalPaste\)/.test(live);
})());
check("REGRESSION: the handled paste cancels ComfyUI's node-spawning handler", (function () {
    const h = JS.slice(JS.indexOf("const onGlobalPaste"), JS.indexOf("function updateAllStaticLabels"));
    return /e\.preventDefault\(\);/.test(h) && /e\.stopImmediatePropagation\(\);/.test(h);
})());
// Only images are ours to swallow: text pastes into the chat textarea must keep working.
check("text pastes are left to the browser", (function () {
    const h = JS.slice(JS.indexOf("const onGlobalPaste"), JS.indexOf("function updateAllStaticLabels"));
    return /if \(!pasteFiles\.length\) return;/.test(h);
})());
// The button must still carry its own feedback: spinner + elapsed timer + Stop control.
// The label is interpolated (`${isKoNow ? "중단" : "Stop"}`), so match the ternary itself.
check("generate button keeps spinner + timer + Stop",
    /class="bada-spinner"/.test(JS)
    && /\$\{genLoadingText\} ⏱️ \$\{elapsed\}s/.test(JS)
    && /⏹️ \$\{isKoNow \? "중단" : "Stop"\}<\/b>/.test(JS));
check("bell rendered exactly once", (JS.match(/id="bada-error-bell"/g) || []).length === 1);
check("bell sits in the config label row", /bada-config-bell-slot[\s\S]{0,400}id="bada-error-bell"/.test(JS));
// Scope the "not in the header" check to the header template itself — a file-wide regex
// would happily span from the badges all the way down to the bell's new home.
const headerTemplate = JS.slice(
    JS.indexOf("header.innerHTML = `"),
    JS.indexOf("root.appendChild(header)"),
);
check("bell no longer inside the header template", !headerTemplate.includes("bada-error-bell"));
check("badges removed with the header", !JS.includes('class="bada-badge'));
check("bell slot CSS present", /\.bada-config-bell-slot \{[^}]*margin-left: auto/s.test(CSS));

// Every bell lookup must go through `root`: the bell is no longer a descendant of `header`,
// so a `header.querySelector` would silently resolve to null and kill the error log.
check("no 'header.querySelector(\"#bada-error-bell\")' left", !JS.includes('header.querySelector("#bada-error-bell")'));
check("no 'header.querySelector(\"#bada-bell-badge\")' left", !JS.includes('header.querySelector("#bada-bell-badge")'));
check("bell badge read via root", JS.includes('root.querySelector("#bada-bell-badge")'));
check("bell click wired via root", JS.includes('root.querySelector("#bada-error-bell")'));
// The click handler runs at setup time, so it must be attached only once configSection — and
// therefore the bell — exists. (updateBellBadge above it is just a function declaration.)
check("bell click wired after configSection is appended",
    JS.indexOf("root.appendChild(configSection)")
        < JS.indexOf('const errorBellBtn = root.querySelector("#bada-error-bell")'));

// --- regressions we must not cause -----------------------------------------
check("showToast survives (errors still surface)", /function showToast\(/.test(JS));
check("error toasts still fire", /오류.*: \$\{errMsg\}/.test(JS) && /채팅 오류/.test(JS));
check("'.bada-subtext' CSS kept (char/image counters still use it)",
    /\.bada-subtext \{/.test(CSS) && /id="bada-char-counter"/.test(JS) && /id="bada-img-counter"/.test(JS));
check("error modal kept", /bada-error-modal/.test(JS));

// --- 4. output socket -----------------------------------------------------
// The node is UI-only (RETURN_TYPES is empty), but a workflow saved while the "prompt"
// socket still existed re-serializes it, and LiteGraph restores `outputs` *after*
// onNodeCreated runs — so stripping there alone let it survive a refresh.
check("'● ' bullet prefixes gone from the engine list", !/"● /.test(JS) && !/● KREA 2\(/.test(JS));
check("engine ids and names intact",
    /\{ id: "krea", name: "KREA 2"/.test(JS)
    && /\{ id: "qwen21", name: "QWEN2\.1"/.test(JS)
    && /\{ id: "minimax", name: "MiniMax H3"/.test(JS)
    && /\{ id: "ltx", name: "LTX-Video"/.test(JS));
check("시스템 / 제미나이 tabs untouched", /name: "📜 시스템"/.test(JS) && /name: "🔞 제미나이"/.test(JS));

check("outputs stripped in onNodeCreated", /nodeType\.prototype\.onNodeCreated[\s\S]*?while \(node\.outputs && node\.outputs\.length > 0\)/.test(JS));
check("outputs ALSO stripped in onConfigure",
    /node\.onConfigure = function \(data\) \{[\s\S]*?while \(this\.outputs && this\.outputs\.length > 0\)/.test(JS));
check("backend really has no outputs", /RETURN_TYPES = \(\)/.test(read(path.join("nodes", "bada_async_gemini.py"))));

// Every tab must carry the same 1px box so unselected engines stay separable, without the
// row reflowing when a tab is selected.
const engineBtnCss = CSS.slice(CSS.indexOf(".bada-engine-btn {"), CSS.indexOf(".bada-engine-btn:hover"));
check("unselected tabs have a thin box", /border:\s*1px solid/.test(engineBtnCss));
check("active tabs use the same 1px thickness (no reflow on select)", /\.bada-engine-btn\.active[\s\S]*?border:\s*1px solid/.test(CSS));

// --- 4b. chat bubble alignment (no wasted right-hand gutter) --------------
// The two sides were separated by `justify-content: flex-end / flex-start`, which left a
// wide empty gutter beside every message and capped the bubble at 86% of the row. Both
// sides now run full width and are told apart by FILL vs THIN BORDER alone.
//
// The `flex-end`/`flex-start` rules are asserted GONE rather than merely "not required":
// re-adding one of them is exactly the regression this guards, and a rule that merely
// loses to a later selector would pass a naive presence check.
const bubbleCss = CSS.slice(CSS.indexOf(".bada-msg-row {"),
    CSS.indexOf(".bada-msg-images {"));
check("bubbles run the full row width (86% cap removed)",
    /max-width:\s*100%/.test(bubbleCss) && !/max-width:\s*86%/.test(bubbleCss));
// `max-width: 100%` ALONE is not enough and this is the trap worth naming: the bubble is a
// flex item, so it defaults to `flex: 0 1 auto` and shrinks to its CONTENT width. A short
// user message then left a 252 px gutter inside a 427 px thread — the exact complaint this
// change exists to fix, and it looks correct in the stylesheet while being wrong on screen.
// Only `flex: 1 1 auto` makes it actually fill the row.
check("bubbles FILL the row (flex-grow), not merely shrink-to-content",
    /flex:\s*1 1 auto/.test(bubbleCss));
// `min-width: 0` lets a long unbreakable token shrink below its intrinsic width instead of
// forcing a horizontal scrollbar out of the `overflow-x: hidden` thread.
check("long words cannot force a horizontal scrollbar (min-width: 0)",
    /min-width:\s*0/.test(bubbleCss));
check("padding is inside the width (box-sizing)",
    /box-sizing:\s*border-box/.test(bubbleCss));
check("left/right gutter justification removed",
    !/justify-content:\s*flex-(start|end)/.test(bubbleCss));
// The user side keeps a filled background; the AI side must have NONE, or the two would
// still read as differently-shaded blocks instead of fill-vs-outline.
check("user bubble keeps a filled background",
    /\.bada-msg-bubble\.user\s*\{[^}]*background:\s*#4a4a4a/.test(bubbleCss));
check("AI bubble has NO background (border-only distinction)",
    /\.bada-msg-bubble\.model\s*\{[^}]*background:\s*transparent/.test(bubbleCss));
check("AI bubble keeps a thin border so the two sides stay separable",
    /\.bada-msg-bubble\.model\s*\{[^}]*border:\s*1px solid/.test(bubbleCss));
// The old "tail" corners (border-bottom-*-radius: 2px) hinted at which side a bubble sat
// on. With both sides full width they are meaningless noise, so they must not creep back.
check("obsolete bubble tail corners removed",
    !/border-bottom-(left|right)-radius/.test(bubbleCss));
// The alignment is CSS-only: the renderer must keep tagging BOTH sides with the role class,
// otherwise one half of the stylesheet silently stops applying.
check("renderer still tags both sides with the role class",
    /row\.className = `bada-msg-row \$\{msg\.role\}`/.test(JS)
    && /bubble\.className = `bada-msg-bubble \$\{msg\.role\}`/.test(JS));

// --- 4c. chat-history popup: a viewport-fixed PANEL, not a node-hosted popup ----
// The node is `overflow: hidden` and its width is pinned to 520px by JS, so a popup
// anchored inside it was clamped by `max-width: calc(100% - 12px)` no matter how wide it
// was declared: `width: 840px` measured 437px on screen. That is why asking for a bigger
// popup twice did not help. Moving the panel to `document.body` as a fixed overlay is what
// actually lets it grow, so the mount point and the fixed positioning are both pinned.
check("popup is a viewport-fixed overlay (node overflow/width cannot clamp it)",
    /\.bada-chat-history-pop\s*\{[^}]*position:\s*fixed/.test(CSS));
check("popup is mounted on document.body, not inside the node",
    /document\.body\.appendChild\(pop\)/.test(HIST_JS)
    && !/anchor\.parentElement\.appendChild\(pop\)/.test(HIST_JS));
check("popup width is viewport-relative and actually large",
    /width:\s*min\(\s*8\d\dpx/.test(CSS), "declared 840px, clamps to 100vw-48px");
check("popup is centred so it cannot hang off a corner",
    /\.bada-chat-history-pop\s*\{[^}]*transform:\s*translate\(-50%,\s*-50%\)/.test(CSS));

// --- 4d. the list must scroll at ~15 rows, not grow to the panel cap -----------
// The store holds 30 conversations. Without a cap on the LIST itself the panel's
// max-height (760px) is what stops the growth, so from the 12th conversation on the popup
// filled most of the screen and the footer (image mode + backup/clear) was pushed to the
// very bottom edge. `max-height` on the scroll container is what turns that into a scroll.
//
// 15 rows, not 10: the pinned block sits at the TOP of this same list, so with only 10
// rows visible every extra pin pushes the unpinned conversations off screen. What should
// need scrolling is 「고정되지 않은 대화」, not the pinned ones.
const listBlock = (CSS.match(/\.bada-chat-history-list\s*\{[^}]*\}/) || [""])[0];
const listMaxH = parseInt((listBlock.match(/max-height:\s*(\d+)px/) || [])[1] || "0", 10);
check("history list has its OWN max-height (~15 rows, not the panel cap)",
    listMaxH >= 650 && listMaxH <= 720, `max-height=${listMaxH}px`);
// The panel must be tall enough for the list to REACH its own cap, otherwise the panel
// clamps first and 15 rows silently render as ~10. This coupling is why raising the list
// alone was a no-op: a 690px list inside a 760px panel leaves ~70px for the head, the
// search box and the footer, so the list gets cut straight back down.
const popMaxH = parseInt(((CSS.match(/\.bada-chat-history-pop\s*\{[^}]*\}/) || [""])[0]
    .match(/max-height:\s*min\((\d+)px/) || [])[1] || "0", 10);
check("the PANEL is tall enough for the list's own max-height to take effect",
    popMaxH >= listMaxH + 250,
    `panel=${popMaxH}px list=${listMaxH}px (needs >= ${listMaxH + 250})`);
check("history list is the scroll container",
    /overflow-y:\s*auto/.test(listBlock));
// Scrolling must not chain to whatever is behind the overlay.
check("list scroll is contained (no scroll chaining past the popup)",
    /overscroll-behavior:\s*contain/.test(listBlock));
// min-height stays: it is what guarantees a usable list when only 1-2 chats exist.
check("history list keeps a usable min-height", /min-height:\s*\d+px/.test(listBlock));

// --- 4e. 📌 pin: a pinned chat must survive the 30-chat cap ---------------------
// The UI promise is "this one will not be auto-deleted". Three separate pieces can break it,
// so each is pinned here rather than assumed:
//   1. the button exists and talks to a dedicated endpoint
//   2. the server counts the cap over UNPINNED rows only (the whole point of the feature)
//   3. the flag is copied forward by upsert, which REPLACES the stored dict wholesale
const py = require("fs").readFileSync(path.join(__dirname, "..", "server",
    "gemini_chat_history.py"), "utf8");
check("pin button is rendered on every row",
    /b\.className = "bada-chat-history-pin"|pinBtn\.className = "bada-chat-history-pin"/.test(HIST_JS)
    && /row\.append\(main, pinBtn, openBtn, delBtn\)/.test(HIST_JS));
check("pin posts to a dedicated endpoint",
    /pin:\s*"\/api\/bada\/gemini\/chats\/pin"/.test(HIST_JS)
    && /postJSON\(API\.pin,\s*\{\s*id:\s*chat\.id,\s*pinned:\s*next\s*\}\)/.test(HIST_JS));
// Re-reading the list (not patching the local row) is required because pinning CHANGES the
// row's position — that ordering is the server's to decide.
check("pinning re-reads the list (the row moves to the top)",
    /await load\(\)/.test(HIST_JS));
check("pinned rows are split into their own leading section",
    /rows\.filter\(c => c\.pinned\)/.test(HIST_JS)
    && /pinnedSection/.test(HIST_JS));
check("pinned rows are visually distinguished",
    /\.bada-chat-history-row\.pinned/.test(CSS)
    && /\.bada-chat-history-pin\.on/.test(CSS));
// The search filter runs BEFORE the pinned/loose split, so a query matching no pinned
// chat must not render an empty 「고정됨」 band.
check("search filters before the pinned split (no empty section band)",
    /const rows = chats\.filter[\s\S]{0,700}const pinned = rows\.filter\(c => c\.pinned\)/.test(HIST_JS));
check("pin is exempt from the cap (prune counts UNPINNED rows)",
    /MAX_CHATS[\s\S]{0,80}MAX_PINNED/.test(py)
    && /loose = \[c for c in chats if not c\.get\("pinned"\)\]/.test(py)
    && /dropped_loose = max\(0, len\(loose\) - MAX_CHATS\)/.test(py));
// `upsert_chat` rebuilds the entry from scratch; without copying `pinned` forward the flag
// vanishes the moment the user sends another message in that conversation.
check("upsert preserves the pin across a resave",
    /"pinned": bool\(\(existing or \{\}\)\.get\("pinned"\)\)/.test(py));
check("the pin travels with a backup (import restores it)",
    /"pinned": bool\(item\.get\("pinned"\)\)/.test(py));
check("pinned chats lead the list",
    /pinned = \[c for c in chats if c\.get\("pinned"\)\]/.test(py));
// A floating panel needs a backdrop, and the backdrop MUST be below the panel or it
// swallows every click inside it.
check("popup has a backdrop below the panel",
    /\.bada-chat-history-backdrop\s*\{[^}]*position:\s*fixed/.test(CSS)
    && /19999/.test(CSS) && /z-index:\s*20000/.test(CSS));
check("the backdrop is mounted alongside (sibling), not inside the panel",
    /document\.body\.appendChild\(backdrop\)/.test(HIST_JS));
// Clicking outside must still dismiss it; with the panel on body the outside-click guard
// is the only way out besides Esc.
check("outside click still closes the popup",
    /!pop\.contains\(e\.target\) && e\.target !== anchor\) close\(\)/.test(HIST_JS));
check("close() removes the backdrop too (or it strands a grey veil)",
    /const close = \(\) => \{[\s\S]{0,120}backdrop\.remove\(\)/.test(HIST_JS));

// The list scrolled correctly all along; what was broken was the VISIBLE BOX. With the
// popup capped at a fixed 420px, the head + search + footer (the attachment-storage
// picker) consumed the height and the list was squeezed down to `min-height: 60px` —
// one row. Thirty conversations were rendered and reachable, yet the popup read as
// "only one is saved".
const listCss = CSS.slice(CSS.indexOf(".bada-chat-history-list {"),
    CSS.indexOf(".bada-chat-history-row {"));
const listMin = (listCss.match(/min-height:\s*(\d+)px/) || [])[1];
// 60px was literally one row (rows measure ~43px + padding). Several rows must fit
// without scrolling, so the floor has to clear a few of them.
check("list shows several rows without scrolling (min-height raised from 60px)",
    Number(listMin) >= 150, `min-height=${listMin}px`);
check("list still scrolls when it outgrows the popup",
    /overflow-y:\s*auto/.test(listCss));
// A hidden scrollbar is why "how many of the 30 am I looking at?" was unanswerable.
check("list has a visible scrollbar affordance",
    /scrollbar-width:\s*thin/.test(listCss)
    && /\.bada-chat-history-list::-webkit-scrollbar-thumb/.test(CSS));

// --- 4d. the toast must not shove the panel (canvas shaking on 「새 채팅」) ------
// `.bada-toast` was a BLOCK flex child of the card's column, so showing one (「대화가
// 초기화되었습니다」) pushed everything below it down and then back when it hid — the
// panel visibly jumped. It is now absolutely positioned: zero height contribution.
const toastCss = CSS.slice(CSS.indexOf(".bada-toast {"),
    CSS.indexOf(".bada-toast.info"));
check("toast is out of flow (absolute), so it cannot shift the panel",
    /\.bada-toast\s*\{[^}]*position:\s*absolute/.test(CSS));
check("the toast no longer reserves a flex row",
    !/\.bada-toast\s*\{[^}]*flex:\s*0 0 auto/.test(CSS));
// `right: 0` alone collapses to zero width on a centred flex item, so both edges are
// pinned; and pointer-events:none keeps the overlay from eating clicks meant for the
// content it covers.
check("toast spans the panel width from both edges",
    /\.bada-toast\s*\{[^}]*left:\s*0/.test(CSS)
    && /\.bada-toast\s*\{[^}]*right:\s*0/.test(CSS));
check("the floating toast cannot swallow clicks on the content beneath it",
    /\.bada-toast\s*\{[^}]*pointer-events:\s*none/.test(CSS));
// --- 4f. the GLOBAL toast must not be captured by the node's own .bada-toast ------
// `.bada-toast` is claimed TWICE with opposite meanings: `bada_async_gemini.css` styles it
// as an in-card banner (`position:absolute` against `.bada-async-gemini-root`, `top:8px`),
// while `bada_shared.js` styles its own as a fixed bottom-right viewport toast. When the
// chat-history pin handler called the shared `showToast`, the node rule won on cascade and
// the notification was positioned inside the NODE — it appeared over the canvas beside the
// node instead of the bottom-right corner. Sharing the name made one component's styling
// silently relocate another's.
const SHARED = fs.readFileSync(path.join(__dirname, "..", "web", "bada_shared.js"), "utf8");
check("the global toast uses its OWN class, not the node's `.bada-toast`",
    /toast\.className = `bada-shared-toast/.test(SHARED)
    && !/toast\.className = `bada-toast/.test(SHARED));
// The collision is a no-op only if the shared stylesheet really defines the new name and
// really anchors to the viewport corner.
check("the global toast is anchored bottom-right of the VIEWPORT",
    /\.bada-shared-toast\s*\{[^}]*position:\s*fixed/.test(SHARED)
    && /\.bada-shared-toast\s*\{[^}]*right:\s*16px/.test(SHARED)
    && /\.bada-shared-toast\s*\{[^}]*bottom:\s*16px/.test(SHARED));
// Appear / disappear without moving anything: a transform-only animation. An opacity or
// height change would reflow whatever sits above it and shake the view.
check("the global toast animates on transform only (no layout shift)",
    /@keyframes badaSharedToastIn[\s\S]{0,220}transform:\s*translateY/.test(SHARED)
    && /@keyframes badaSharedToastOut[\s\S]{0,220}transform:\s*translateY/.test(SHARED));
check("the exit animation ends with `forwards` (no opacity flash before removal)",
    /\.bada-shared-toast\.closing\s*\{[^}]*animation:[^}]*forwards/.test(SHARED)
    && /toast\.classList\.add\("closing"\)/.test(SHARED));
// The injected stylesheet was missing its `</style>`-equivalent closing brace, which let the
// following `.bada-toast.error` rule land OUTSIDE the block. Every rule after the break was
// silently dropped — the exit transition included, so toasts popped out with no fade.
const sharedStyleBlock = (SHARED.match(/style\.textContent\s*=\s*`([\s\S]*?)`\s*;/) || [])[1] || "";
check("the injected toast stylesheet is brace-balanced (no rules silently dropped)",
    (sharedStyleBlock.match(/\{/g) || []).length === (sharedStyleBlock.match(/\}/g) || []).length,
    `{=${(sharedStyleBlock.match(/\{/g) || []).length} }=${(sharedStyleBlock.match(/\}/g) || []).length}`);
// THE regression that shipped the black slab. The shared sheet carried a stale
// `.bada-toast` rule, so the NODE's own in-card banner picked up `position:fixed`,
// `background:rgba(24,24,27,.94)` and `backdrop-filter:blur(4px)` and rendered as a
// 751px opaque panel over the node — 「창을 닫으면 검정색으로 화면을 가리고 있어」.
// Renaming the JS class alone did not help: the stale rule kept winning the cascade.
// Asserted on the ABSENCE of `.bada-toast` selectors, which is the only thing that
// distinguishes a fixed sheet from a half-renamed one.
check("the shared sheet styles NO `.bada-toast` selector (only the node may own that name)",
    !/(^|[^-\w.])\.bada-toast(?![\w-])/.test(sharedStyleBlock),
    `offenders: ${(sharedStyleBlock.match(/[^\n]*\.bada-toast[^\n]*/g) || []).join(" | ")}`);
// Defence in depth: even if some other stylesheet re-injects those properties, the node
// banner must never be allowed to grow into a slab. A banner is always one line.
const nodeToastBlock = (CSS.match(/\.bada-toast\s*\{[^}]*\}/) || [""])[0];
check("the node banner cannot grow into a panel (hard height cap + no blur)",
    /max-height:\s*\d+px/.test(nodeToastBlock)
    && /overflow:\s*hidden/.test(nodeToastBlock)
    && /backdrop-filter:\s*none/.test(nodeToastBlock)
    && /position:\s*absolute/.test(nodeToastBlock));
// And the two names must never both appear as owners of the same element.
check("the node's own in-card toast keeps its absolute positioning",
    /\.bada-toast\s*\{[^}]*position:\s*absolute/.test(CSS));

// --- 4g. 🕐 must TOGGLE, and a dismissal must never orphan a backdrop --------------
// The button only ever OPENED. Closing was reachable from Esc, a canvas click and the
// backdrop — but not from the button the user was looking at. Two consequences, both
// reported as 「창을 닫으면 검정색으로 화면을 가리고 있어」:
//   1. clicking 🕐 again mounted a SECOND popup; the first one's full-viewport
//      rgba(0,0,0,.45) backdrop stayed in document.body with no way to dismiss it,
//      dimming the whole canvas.
//   2. `chatHistoryHandle` was assigned only AFTER the `await`s, so the `if (handle)`
//      guard was false for the entire opening window — nothing prevented the double open.
const handleBlock = (JS.match(/async function openChatHistory\(button\) \{[\s\S]*?\n {12}\}/) || [""])[0];
check("🕐 toggles: an existing handle is closed and the function RETURNS",
    /if \(chatHistoryHandle\) \{[\s\S]{0,320}handle\.close\(\);[\s\S]{0,40}return;/.test(handleBlock));
// Clearing before the await is what closes the opening window to re-entry; assigning
// only after it (the original order) makes the guard useless exactly when it is needed.
check("the handle is released BEFORE the awaits (no double-open window)",
    /const handle = chatHistoryHandle;\s*\n\s*chatHistoryHandle = null;/.test(handleBlock)
    && handleBlock.indexOf("chatHistoryHandle = null;") < handleBlock.indexOf("await import("));
// A failed import must not leave the toggle latched, or the button is dead forever. The
// window is generous because the explanatory comment sits between `catch` and the fix —
// too tight a bound fails on the comment and reports a bug that isn't there.
check("a failed open releases the lock (the button cannot latch shut)",
    /catch \(error\) \{[\s\S]{0,400}?chatHistoryHandle = null;/.test(handleBlock));
check("every dismissal reports back so the owner clears its handle",
    /onClose: \(\) => \{ chatHistoryHandle = null; \}/.test(JS)
    && /if \(typeof opts\.onClose === "function"\) opts\.onClose\(\);/.test(HIST_JS));
// close() runs from four sites (button, Esc, canvas, backdrop/restore); without the
// guard the later ones re-run on detached nodes and re-fire onClose.
check("close() is idempotent (no duplicate teardown, no repeated onClose)",
    /let closed = false;[\s\S]{0,160}if \(closed\) return;\s*\n\s*closed = true;/.test(HIST_JS));
check("the backdrop is removed with the panel, never alone",
    /pop\.remove\(\);\s*\n\s*backdrop\.remove\(\);/.test(HIST_JS));

// Absolute positioning resolves against the nearest positioned ancestor. Without
// `position: relative` on the card the toast resolves against the VIEWPORT and floats
// off at the top of the canvas — invisible, and a silent loss of the error messages.
check("the card is positioned so the absolute toast anchors to it",
    /\.bada-gemini-card,\s*\n?\s*\.bada-async-gemini-root\s*\{[^}]*position:\s*relative/.test(CSS));
// The toast still has to be VISIBLE — a layout fix must not silence the message.
check("toast messages still surface (not hidden)",
    /function showToast\(/.test(JS));

// 「새 채팅」 must be SILENT. Its result is already on screen — the thread immediately
// falls back to the empty-state hint — so a 1.5 s toast carrying no information only
// covered the API-key row (the very spot a previous fix had just cleared) and made the
// press look like a mistake. Error toasts still exist and still surface.
check("「새 채팅」 shows NO toast",
    !/대화가 초기화되었습니다/.test(JS) && !/Conversation reset\./.test(JS));
check("...and it does not call showToast at all",
    !/newChatBtn\.onclick[\s\S]{0,900}showToast\(/.test(JS));
// The empty state must still render, or the user gets a blank panel with no explanation.
check("「새 채팅」 still re-renders the empty state",
    /newChatBtn\.onclick[\s\S]{0,1600}renderChatMessages\(\)/.test(JS)
    && /newChatBtn\.onclick[\s\S]{0,1600}renderChatImagesPreview\(\)/.test(JS));

// --- 5. REGRESSION: restoreChat scope ------------------------------------
// renderChatImagesPreview() is declared INSIDE renderChatStudio(), but restoreChat()
// lives outside it. Calling the inner name directly threw
// "renderChatImagesPreview is not defined" the instant the user pressed 「이어하기」,
// so the history feature was unreachable in practice even though the code "existed".
const innerOnlyNames = ["renderChatImagesPreview", "renderChatMessages", "renderChatLengthNotice"];
check("restoreChat exists in the outer scope", JS.includes("async function restoreChat(chat)"));
{
    // Slice the body by brace matching, not by hunting an indentation sentinel: a naive
    // marker search ran past the function into unrelated code and produced false hits.
    const start = JS.indexOf("async function restoreChat(chat) {");
    let depth = 0, end = start;
    for (let i = JS.indexOf("{", start); i < JS.length; i++) {
        if (JS[i] === "{") depth++;
        else if (JS[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
    // Strip comments first: an explanatory note that merely NAMES the inner function
    // ("renderChatImagesPreview() is declared INSIDE...") is not a call site, and
    // matching it would make this check unsatisfiable.
    const body = JS.slice(start, end)
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/^[ \t]*\/\/.*$/gm, " ");
    const bad = [];
    for (const name of innerOnlyNames) {
        // Match a bare call — `refreshChatMessages()` is prefixed, so requiring the
        // preceding char to be a non-identifier excludes the published bindings.
        const rx = new RegExp(`(^|[^\\w.])${name}\\s*\\(`, "g");
        if (rx.test(body)) bad.push(name);
    }
    check("restoreChat calls NO inner-scope renderer directly",
        bad.length === 0, `offending: ${bad.join(", ") || "none"}`);
    check("restoreChat refreshes the preview through the published binding",
        /refreshChatImagePreview\(\)/.test(body));
    check("restoreChat refreshes the thread through the published binding",
        /refreshChatMessages\(\)/.test(body));
    // The onRestore handler after it had the same defect for the length notice.
    const onRestore = JS.slice(JS.indexOf("onRestore:"), JS.indexOf("onRestore:") + 300);
    check("onRestore refreshes the notice through the published binding",
        /refreshChatLengthNotice\(\)/.test(onRestore)
        && !/(^|[^\w.])renderChatLengthNotice\s*\(/.test(onRestore));
}
// Each renderer must actually be published, or the bindings stay no-ops forever and
// the UI silently stops updating after a restore.
for (const [pub, inner] of [
    ["refreshChatImagePreview", "renderChatImagesPreview"],
    ["refreshChatMessages", "renderChatMessages"],
    ["refreshChatLengthNotice", "renderChatLengthNotice"],
]) {
    check(`${pub} is published from renderChatStudio`,
        new RegExp(`${pub}\\s*=\\s*${inner};`).test(JS));
}

// --- 6. chat tab drag & drop ----------------------------------------------
check("chat container binds dragenter/dragover/drop",
    /chatStudioContainer\.addEventListener\(evt, fn\)/.test(JS)
    && /"dragenter", onDragEnter/.test(JS)
    && /"dragover", onDragOver/.test(JS)
    && /"drop", onDrop/.test(JS));
check("drop is routed into the shared image attach path",
    /handleChatImageFiles\(files\)/.test(JS));
// ComfyUI listens for drop on the canvas/document; without stopPropagation the same
// gesture would ALSO create a node there.
check("drop calls preventDefault AND stopPropagation",
    /const onDrop = \(e\) => \{[\s\S]*?e\.preventDefault\(\);[\s\S]*?e\.stopPropagation\(\)/.test(JS));
// Text drags must not light the panel up, or every in-panel text selection would glow.
check("drag handlers ignore non-file drags", /const hasFiles = \(e\) => \{[\s\S]*?"Files"/.test(JS));
check("dragleave uses a depth counter (no flicker across children)",
    /let dragDepth = 0/.test(JS) && /dragDepth = Math\.max\(0, dragDepth - 1\)/.test(JS));
check("drag listeners are torn down on tab switch",
    /chatDragHandlers = \[/.test(JS)
    && /chatStudioContainer\.removeEventListener\(evt, fn\)/.test(JS)
    && /chatDragHandlers = null/.test(JS));
// The overlay sits on top of the panel; without pointer-events:none it would eat the
// drop before the container handler ever saw it.
check("dragover overlay does not swallow the drop",
    /\.bada-chat-dragover::after \{[\s\S]*?pointer-events: none/.test(CSS));
check("dragover overlay style exists", /\.bada-chat-dragover \{/.test(CSS));

// Deleting a thumbnail must keep chatOriginalImages index-aligned with
// chatUploadedImages, otherwise 「원본으로 저장」 re-attaches the WRONG image.
check("thumbnail delete keeps the originals array aligned",
    /chatUploadedImages\.splice\(idx, 1\);[\s\S]{0,200}?chatOriginalImages\.splice\(idx, 1\)/.test(JS));

// --- 7. 이미지 크게 보기 (lightbox, 2026-10-05) ----------------------------
// A chat image was a 48px thumbnail of a 1024px downscale: there was no way to
// actually LOOK at a picture. Clicking one must now open a full-viewport viewer,
// and WHICH bytes it opens is the user's whole spec:
//   1. 붙여넣기 / 드래그앤드롭 / 불러오기  → 원본(붙여 넣은 것)
//   2. 「이어하기」로 불러온 기록          → 저장된 원본/2048/1024 그대로
//   3. 「저장 안 함」                     → 아무 반응 없음
check("a lightbox open function exists", /function openChatImageViewer\(sources, startIndex = 0\)/.test(JS));
check("the viewer mounts on document.body (must cover the whole canvas)",
    /document\.body\.appendChild\(overlay\)/.test(JS));
check("the viewer overlay class exists in CSS", /\.bada-img-viewer \{/.test(CSS));
check("the viewer image is size-capped instead of overflowing",
    /\.bada-img-viewer-img \{[\s\S]*?max-width: 92vw[\s\S]*?max-height: 90vh/.test(CSS));
check("the viewer overlay sits above the litegraph canvas",
    /\.bada-img-viewer \{[\s\S]*?z-index: 99999/.test(CSS));
check("an empty source list opens nothing (「저장 안 함」 = no reaction)",
    /const list = \(sources \|\| \[\]\)\.filter\(s => typeof s === "string" && s\);\s*\n\s*\/\/[^\n]*\n\s*if \(!list\.length\) return;/.test(JS));
check("Esc closes the viewer",
    /e\.key === "Escape"[\s\S]{0,120}?destroy\(\)/.test(JS));
check("arrow keys page through multi-image turns",
    /e\.key === "ArrowLeft"/.test(JS) && /e\.key === "ArrowRight"/.test(JS));
check("the keydown listener is removed on close (no leak across opens)",
    /document\.removeEventListener\("keydown", onKeydown, true\)/.test(JS));
check("clicking the backdrop closes, clicking the image does not",
    /if \(e\.target === overlay\) destroy\(\)/.test(JS));
// ComfyUI listens for these on the document; letting them through would pan/zoom the
// canvas behind the overlay, or right-click the node instead of dismissing.
check("the viewer swallows the canvas gestures",
    /blockedEvents = \["pointerdown", "mousedown", "wheel", "dblclick", "contextmenu", "dragstart"\]/.test(JS)
    && /blockedEvents\.forEach\(evt => overlay\.addEventListener\(evt, swallow\)\)/.test(JS)
    && /blockedEvents\.forEach\(evt => overlay\.removeEventListener\(evt, swallow\)\)/.test(JS));

// Rule 1 — the live turn keeps its pre-downscale bytes on the message itself.
check("the user message carries its own originals",
    /originalImages: \[\.\.\.chatOriginalImages\]/.test(JS));
check("the thread thumbnail opens the originals when they exist",
    /msg\.originalImages\[i\]\) \|\| im/.test(JS)
    && /th\.onclick = \(\) => openChatImageViewer\(viewList, i\)/.test(JS));
// Rule 2 — a restored message has no `originalImages` key, so the fallback `|| im`
// resolves to the saved copy. Assert the key is NOT hydrated by restoreChat().
{
    const start = JS.indexOf("async function restoreChat(chat)");
    const body = JS.slice(start, JS.indexOf("function renderThumbnails()", start));
    check("restoreChat does NOT invent originals (falls back to the saved copy)",
        !/originalImages/.test(body));
    check("zoomable class is applied to every thread thumbnail",
        /className = "bada-msg-thumb bada-msg-thumb-zoomable"/.test(JS));
    check("the 「저장 안 함」 placeholder is NOT clickable",
        /bada-msg-thumb-placeholder";\n\s*box\.textContent/.test(JS));
}
// The composer preview holds live originals too, so it opens them as well.
check("the composer preview thumbnail opens the originals",
    /thumbImg\.onclick = \(e\) => \{[\s\S]{0,400}?openChatImageViewer\(originals, idx\)/.test(JS));
check("the delete button no longer collides with the zoom click",
    /bada-thumbnail-del"\)\.onclick = \(e\) => \{\s*\n\s*e\.stopPropagation\(\);/.test(JS));

// The overlay lives on document.body, i.e. OUTSIDE the rebuilt chat container, so
// tearing the container down on a tab switch does not remove it.
check("the viewer is closed on tab switch",
    /closeChatImageViewer\(\);\s*\n\s*chatPersonaCleanup = null;/.test(JS));
check("the viewer is closed on 「새 채팅」 and on 「이어하기」",
    /persistChatHistory\(\);\n\s*closeChatImageViewer\(\);/.test(JS)
    && /if \(!chat \|\| !Array\.isArray\(chat\.messages\)\) return;\n(?:\s*\/\/[^\n]*\n)+\s*closeChatImageViewer\(\);/.test(JS));

// --- 8. REGRESSION: history image policy must not decay across turns ----------
// persistChatHistory() re-saved every EARLIER turn from its raw `msg.images`, which
// is the 1024px API copy. Two turns after choosing 「원본」, the file on disk was
// quietly 1024px — the selection the user made had silently rotted.
check("persistChatHistory reuses each turn's already-saved copy",
    /const cached = Array\.isArray\(msg\.savedImages\) \? msg\.savedImages : null;/.test(JS)
    && /images: cached\.slice\(\)/.test(JS));
check("persistChatHistory caches the result on the message",
    /msg\.savedImages = saved\.images;/.test(JS)
    && /msg\.savedImagesOmitted = saved\.imagesOmitted;/.test(JS));
check("restoreChat seeds the cache from the restored bytes",
    /savedImages: Array\.isArray\(m\.images\) \? m\.images\.slice\(\) : \[\]/.test(JS));
// `originalImages` / `savedImages` are display + reuse state only. The history file is
// the user's backup, so it must NOT balloon with a second full copy of every picture.
check("the memory-only fields are never serialized into the history payload",
    (function () {
        const start = JS.indexOf("async function persistChatHistory(");
        const body = JS.slice(start, JS.indexOf("async function restoreChat(", start));
        const push = body.slice(body.indexOf("payload.push("), body.indexOf("});", body.indexOf("payload.push(")));
        return /role:/.test(push) && /text:/.test(push) && /images:/.test(push)
            && !/originalImages/.test(push) && !/savedImages/.test(push);
    })());

// The REAL policy bug this session found: 「원본」 short-circuited to `images`, which
// holds the 1024px API copy. The option was labelled 「원본」 but stored the downscale.
check("「원본」 no longer short-circuits to the 1024px API copy",
    (function () {
        const start = JS.indexOf("async function applyHistoryImagePolicy(");
        const body = JS.slice(start, JS.indexOf("// ── 이미지 크게 보기", start));
        return !/mode === "original"/.test(body)
            && /const source = originalCopies\[i\] \|\| images\[i\];/.test(body);
    })());
check("with no originals captured, the 1024px copy is kept instead of dropped",
    /if \(!originalCopies\.length\) \{\s*\n\s*return \{ images: images\.slice\(\)/.test(JS));

// --- 9. RUNTIME: the viewer really behaves, not just looks right in source ----
// The whole spec is behavioural ("누르면 원본이 보인다", "저장 안 함이면 반응 없음"),
// so the block is executed against a stub DOM. A regex cannot tell whether Esc
// removes the overlay, whether the arrows wrap, or whether a second open stacks two
// overlays — all three were real risks in the first draft.
function makeStubDom() {
    const listeners = new Map();          // document-level, keyed by type+capture
    const el = (tag) => {
        const node = {
            tagName: tag,
            className: "",
            style: {},
            textContent: "",
            title: "",
            src: "",
            draggable: false,
            children: [],
            parentNode: null,
            removed: false,
            handlers: new Map(),
            appendChild(child) { child.parentNode = node; node.children.push(child); return child; },
            remove() {
                node.removed = true;
                if (node.parentNode) {
                    node.parentNode.children = node.parentNode.children.filter(c => c !== node);
                }
            },
            addEventListener(type, fn) {
                if (!node.handlers.has(type)) node.handlers.set(type, []);
                node.handlers.get(type).push(fn);
            },
            removeEventListener(type, fn) {
                const arr = node.handlers.get(type) || [];
                const i = arr.indexOf(fn);
                if (i >= 0) arr.splice(i, 1);
            },
            fire(type, event) {
                (node.handlers.get(type) || []).slice().forEach(fn => fn(event || {}));
            },
        };
        return node;
    };
    const body = el("body");
    return {
        body,
        document: {
            body,
            createElement: el,
            addEventListener(type, fn, capture) {
                const key = `${type}:${capture ? "capture" : "bubble"}`;
                if (!listeners.has(key)) listeners.set(key, []);
                listeners.get(key).push(fn);
            },
            removeEventListener(type, fn, capture) {
                const key = `${type}:${capture ? "capture" : "bubble"}`;
                const arr = listeners.get(key) || [];
                const i = arr.indexOf(fn);
                if (i >= 0) arr.splice(i, 1);
            },
            fire(type, event, capture) {
                const key = `${type}:${capture ? "capture" : "bubble"}`;
                (listeners.get(key) || []).slice().forEach(fn => fn(event || {}));
            },
            listenerCount() {
                let n = 0;
                for (const arr of listeners.values()) n += arr.length;
                return n;
            },
        },
    };
}

// The block references `isKo` from the enclosing closure, so it is supplied explicitly.
const buildViewer = (dom) => new Function("document", "isKo",
    `${VIEWER_SRC}\nreturn { openChatImageViewer, closeChatImageViewer };`)(dom.document, true);

// --- 10. RUNTIME: the image save policy must survive MULTIPLE turns ----------
// 「원본」/「2048px」 chosen on turn 1 used to be overwritten by the raw 1024px API
// copy the moment turn 2 was saved. A two-turn simulation is the only way to see it:
// the bug is invisible in a single-turn test because turn 1 IS the current turn.
// Only persistChatHistory() is lifted out. applyHistoryImagePolicy() is deliberately
// NOT injected as source: a function declaration would shadow the stub parameter and
// silently swap the policy under test for the real (canvas-dependent) one.
const PERSIST_SRC = JS.slice(
    JS.indexOf("async function persistChatHistory("),
    JS.indexOf("// Restore one conversation.", JS.indexOf("async function persistChatHistory(")),
);

/**
 * Runs the REAL persistChatHistory() over a scripted conversation.
 * `applyHistoryImagePolicy` is stubbed so the "downscale" is a pure function of the
 * requested edge — no canvas needed, and the assertion can talk about sizes directly.
 *
 * The stub mirrors the corrected policy rules exactly: 「원본」 keeps the original
 * bytes as-is, and 「2048px」/「1024px」 downscale THE ORIGINAL (not the 1024px API
 * copy, which is what the real bug did).
 */
/**
 * Reproduces the 「send → 새 채팅」 loop the user reported: five short conversations,
 * and the list ends up holding ONE row instead of five.
 *
 * Both persistChatHistory() call sites are fire-and-forget (`.onclick` and the end of a
 * turn), so the save for the turn you just finished is still in flight when 「새 채팅」
 * clears `currentChatId`. When that late response lands, line 1287 does
 * `currentChatId = data.chat.id` and hands the NEW chat the OLD chat's id — every later
 * save then overwrites the same row. Nothing errors, so the app looks fine.
 *
 * The stub server mints an id per save and keeps a row table, so the assertion can talk
 * about how many DISTINCT conversations survived.
 */
async function simulateChatNewChatLoop(cycles) {
    // A store keyed by id, mirroring the server's upsert-and-mint behaviour.
    const rows = new Map();
    let minted = 0;
    // Latency the stub returns AFTER recording the call — this is the in-flight window.
    const release = [];
    const chatApiPost = (path, body) => new Promise((resolve) => {
        const id = body.id || `chat-${++minted}`;
        const existing = rows.has(id);
        rows.set(id, body.messages);
        release.push(() => resolve({ chat: { id } }));
    });
    const CHAT_API = { save: "/save" };
    const applyHistoryImagePolicy = () => ({
        images: [], imageCount: 0, imagesOmitted: false,
    });

    const scope = { chatMessages: [], currentChatId: "", chatEpoch: 0 };
    const factory = new Function(
        "applyHistoryImagePolicy", "chatApiPost", "CHAT_API", "scope",
        `let chatMessages = scope.chatMessages;
         let currentChatId = scope.currentChatId;
         let chatEpoch = scope.chatEpoch;
         let chatSaveInFlight = null;
         ${PERSIST_SRC}
         return {
             persist: (...a) => persistChatHistory(...a),
             setMessages: (m) => { chatMessages = m; },
             setId: (i) => { currentChatId = i; },
             bumpEpoch: () => { chatEpoch++; },
             getInFlight: () => chatSaveInFlight,
             getId: () => currentChatId,
             getMessages: () => chatMessages,
         };`);
    const node = factory(applyHistoryImagePolicy, chatApiPost, CHAT_API, scope);

    for (let i = 1; i <= cycles; i++) {
        // 1. the user sends a message and the reply lands -> a save is fired
        node.setMessages([
            { role: "user", text: `안녕 테스트 ${i}`, images: [], imageCount: 0 },
            { role: "model", text: "reply", images: [], imageCount: 0 },
        ]);
        const inFlight = node.persist();
        // 2. the user presses 「새 채팅」 while that save is STILL OPEN, and the
        //    thread is cleared — the only ordering in which the bug can appear. Clearing
        //    AFTER the response would always overwrite the late adoption, and this test
        //    would then pass no matter what the source did (a false pass).
        node.bumpEpoch();
        node.setMessages([]);
        node.setId("");
        // 3. the response for the conversation that no longer exists lands last
        while (release.length) release.shift()();
        await inFlight;
    }
    return { rows: rows.size, titles: [...rows.keys()], newestId: node.getId() };
}

async function simulatePersist({ mode, turns }) {
    const applyHistoryImagePolicy = (images, originals) => {
        const count = images.length;
        if (!count) return { images: [], imageCount: 0, imagesOmitted: false };
        if (mode === "none") return { images: [], imageCount: count, imagesOmitted: true };
        const copies = Array.isArray(originals) ? originals : [];
        if (!copies.length) {
            return { images: images.slice(), imageCount: count, imagesOmitted: false };
        }
        const edge = mode === "original" ? 0 : (mode === "large" ? 2048 : 1024);
        return {
            images: images.map((im, i) => {
                const source = copies[i] || im;
                return edge > 0 ? `edge${edge}:${source}` : source;
            }),
            imageCount: count,
            imagesOmitted: false,
        };
    };
    const scope = { chatMessages: [], currentChatId: "c1", chatEpoch: 0, chatImageSaveMode: mode, posted: [] };
    const chatApiPost = async (path, body) => { scope.posted.push(body); return { chat: { id: "c1" } }; };
    const CHAT_API = { save: "/save" };
    // `chatMessages` / `currentChatId` are closed-over state in the real file. They are
    // mirrored into local bindings and synced back after every call, which reproduces
    // the real mutation without rewriting a single character of the source under test.
    const factory = new Function("applyHistoryImagePolicy", "chatApiPost", "CHAT_API", "scope",
        `let chatMessages = scope.chatMessages;
         let currentChatId = scope.currentChatId;
         let chatEpoch = scope.chatEpoch;
         ${PERSIST_SRC}
         return async (...args) => {
             await persistChatHistory(...args);
             scope.chatMessages = chatMessages;
             scope.currentChatId = currentChatId;
         };`);
    const persist = factory(applyHistoryImagePolicy, chatApiPost, CHAT_API, scope);
    const results = [];
    for (const turn of turns) {
        // A turn = user message (with its images) + model reply.
        scope.chatMessages.push({
            role: "user",
            text: `q${turn.n}`,
            images: [`api1024:${turn.name}`],
            imageCount: 1,
            imagesOmitted: false,
            originalImages: [turn.original],
        });
        scope.chatMessages.push({ role: "model", text: `a${turn.n}`, images: [], imageCount: 0, imagesOmitted: false });
        await persist([turn.original]);
        results.push(JSON.parse(JSON.stringify(scope.posted[scope.posted.length - 1].messages)));
    }
    return results;
}

const stub = makeStubDom();
const viewer = buildViewer(stub);
const overlays = () => stub.body.children.filter(c => c.className === "bada-img-viewer");
const viewerImg = (o) => o.children.find(c => c.className === "bada-img-viewer-img");
const countOf = (o) => o.children.find(c => c.className === "bada-img-viewer-count");
const btnOf = (o, cls) => o.children.find(c => c.className.includes(cls));
const noop = () => {};
const keyEvent = (key) => ({ key, preventDefault: noop, stopPropagation: noop });

viewer.openChatImageViewer(["data:ORIGINAL"]);
check("RUNTIME: opening mounts exactly one overlay",
    overlays().length === 1, `got ${overlays().length}`);
check("RUNTIME: the shown src IS the passed source",
    viewerImg(overlays()[0]).src === "data:ORIGINAL", viewerImg(overlays()[0]).src);
check("RUNTIME: a single image shows no page counter",
    countOf(overlays()[0]).textContent === "", JSON.stringify(countOf(overlays()[0]).textContent));
check("RUNTIME: a single image hides the arrows (no dead buttons)",
    btnOf(overlays()[0], "bada-img-viewer-prev").style.display === "none"
    && btnOf(overlays()[0], "bada-img-viewer-next").style.display === "none");

// Rule 3 — 「저장 안 함」 arrives as zero sources: NOTHING may happen.
viewer.closeChatImageViewer();
viewer.openChatImageViewer([], 0);
viewer.openChatImageViewer(undefined);
viewer.openChatImageViewer([null, undefined, ""], 2);
check("RUNTIME: an empty/blank source list opens nothing (「저장 안 함」 = no reaction)",
    overlays().length === 0, `got ${overlays().length}`);

// Multi-image paging, including wrap-around at both ends.
viewer.openChatImageViewer(["A", "B", "C"], 1);
let ov = overlays()[0];
check("RUNTIME: the start index is honoured", viewerImg(ov).src === "B", viewerImg(ov).src);
check("RUNTIME: a multi-image turn shows the counter", countOf(ov).textContent === "2 / 3",
    countOf(ov).textContent);
check("RUNTIME: arrows are visible for a multi-image turn",
    btnOf(ov, "bada-img-viewer-next").style.display === "");
btnOf(ov, "bada-img-viewer-next").onclick({ stopPropagation: noop });
check("RUNTIME: next advances the image", viewerImg(ov).src === "C", viewerImg(ov).src);
btnOf(ov, "bada-img-viewer-next").onclick({ stopPropagation: noop });
check("RUNTIME: next WRAPS at the end", viewerImg(ov).src === "A", viewerImg(ov).src);
btnOf(ov, "bada-img-viewer-prev").onclick({ stopPropagation: noop });
check("RUNTIME: previous WRAPS at the start", viewerImg(ov).src === "C", viewerImg(ov).src);

// Keyboard paging mirrors the buttons.
stub.document.fire("keydown", keyEvent("ArrowRight"), true);
check("RUNTIME: ArrowRight advances", viewerImg(ov).src === "A", viewerImg(ov).src);
stub.document.fire("keydown", keyEvent("ArrowLeft"), true);
check("RUNTIME: ArrowLeft goes back", viewerImg(ov).src === "C", viewerImg(ov).src);

// An out-of-range index must not produce a blank viewer.
viewer.closeChatImageViewer();
viewer.openChatImageViewer(["A", "B"], 99);
check("RUNTIME: an out-of-range index clamps into range",
    viewerImg(overlays()[0]).src === "B", viewerImg(overlays()[0]).src);

// Re-opening must REPLACE, never stack.
viewer.openChatImageViewer(["OTHER"]);
check("RUNTIME: re-opening replaces the previous overlay",
    overlays().length === 1 && viewerImg(overlays()[0]).src === "OTHER",
    `overlays=${overlays().length}`);

// Close paths.
stub.document.fire("keydown", keyEvent("Escape"), true);
check("RUNTIME: Esc removes the overlay", overlays().length === 0);
check("RUNTIME: Esc also unbinds the keydown listener (no leak)",
    stub.document.listenerCount() === 0, `listeners=${stub.document.listenerCount()}`);

viewer.openChatImageViewer(["A", "B"]);
ov = overlays()[0];
ov.fire("click", { target: viewerImg(ov), stopPropagation: noop });
check("RUNTIME: clicking the IMAGE does not close it", overlays().length === 1);
ov.fire("click", { target: ov, stopPropagation: noop });
check("RUNTIME: clicking the BACKDROP closes it", overlays().length === 0);

viewer.openChatImageViewer(["A"]);
btnOf(overlays()[0], "bada-img-viewer-close").onclick({ stopPropagation: noop });
check("RUNTIME: the ✕ button closes it", overlays().length === 0);

// The canvas gestures must be swallowed ON the overlay (the node lives outside it).
// stopPropagation() being CALLED is the success signal here: it means the event stops
// at the overlay instead of reaching document, where ComfyUI's canvas handlers live.
viewer.openChatImageViewer(["A"]);
ov = overlays()[0];
const swallowed = [];
const probe = () => swallowed.push(1);
["pointerdown", "mousedown", "wheel", "dblclick", "contextmenu", "dragstart"]
    .forEach(evt => ov.fire(evt, { stopPropagation: probe }));
check("RUNTIME: every canvas gesture is swallowed on the overlay",
    swallowed.length === 6, `stopped=${swallowed.length}/6`);

// Tab-switch / 「새 채팅」 / 「이어하기」 all route through closeChatImageViewer().
viewer.openChatImageViewer(["A"]);
viewer.closeChatImageViewer();
check("RUNTIME: closeChatImageViewer() tears a live viewer down", overlays().length === 0);
viewer.openChatImageViewer(["A"]);
viewer.closeChatImageViewer();
viewer.closeChatImageViewer();
check("RUNTIME: closing twice is harmless (cleanup is idempotent)", overlays().length === 0);

// --- 10. RUNTIME: the save policy must survive MULTIPLE turns ----------------
// 「원본」/「2048px」 chosen on turn 1 used to be silently replaced by the raw 1024px
// API copy the moment turn 2 was saved. Three turns, three modes.
const THREE_TURNS = [
    { n: 1, name: "one", original: "ORIG1" },
    { n: 2, name: "two", original: "ORIG2" },
    { n: 3, name: "three", original: "ORIG3" },
];
const img = (msgs, i) => (msgs[i].images || [])[0];

(async () => {
    // The user reported: five short 「send → 새 채팅」 cycles leave ONE row in the list.
    // The cause is not a grace period — it is a lost-update race on `currentChatId`.
    const loop = await simulateChatNewChatLoop(5);
    check("five 「send → 새 채팅」 cycles produce FIVE saved conversations",
        loop.rows === 5, `rows=${loop.rows} ids=${loop.titles.join(",")}`);
    check("a save that resolves after 「새 채팅」 must not resurrect the old id",
        loop.newestId === "", `currentChatId left as "${loop.newestId}"`);
    check("both persist call sites AWAIT the flush before clearing the id",
        /if \(chatMessages\.length\) await persistChatHistory\(\)/.test(JS)
        || /if \(chatSaveInFlight\) await chatSaveInFlight;/.test(JS));
check("「새 채팅」 awaits the IN-FLIGHT save instead of posting a duplicate row",
        /if \(chatSaveInFlight\) await chatSaveInFlight;/.test(JS));
    check("the save adopts the minted id only when it is still the live conversation",
        /chatEpoch/.test(JS));
    // A reply that lands AFTER 「새 채팅」 belongs to a discarded conversation; appending it
    // would save a one-message "제미나이 대화" row that the user never wrote.
    check("a late reply is dropped instead of saved into the fresh thread",
        /if \(turnEpoch !== chatEpoch\) return;/.test(JS));
    // 「원본」 — every turn keeps the pasted original, forever.
    // Message layout after N turns is [user1, model1, user2, model2, …], so turn N's
    // user message sits at index (N-1)*2.
    let r = await simulatePersist({ mode: "original", turns: THREE_TURNS });
    check("RUNTIME: 「원본」 keeps every turn's original across 3 turns",
        img(r[0], 0) === "ORIG1" && img(r[1], 0) === "ORIG1"
        && img(r[1], 2) === "ORIG2" && img(r[2], 4) === "ORIG3",
        JSON.stringify([img(r[0], 0), img(r[1], 0), img(r[1], 2), img(r[2], 4)]));

    // 「2048px」 — turn 1 must not decay to the 1024px API copy on turn 2.
    r = await simulatePersist({ mode: "large", turns: THREE_TURNS });
    check("RUNTIME: 「2048px」 turn 1 does NOT decay to 1024px on turn 2",
        img(r[0], 0) === "edge2048:ORIG1" && img(r[1], 0) === "edge2048:ORIG1",
        `t1=${img(r[0], 0)} t2_sees_t1=${img(r[1], 0)}`);
    check("RUNTIME: 「2048px」 keeps its own edge for every later turn",
        img(r[2], 2) === "edge2048:ORIG2" && img(r[2], 4) === "edge2048:ORIG3",
        JSON.stringify([img(r[2], 2), img(r[2], 4)]));

    // 「1024px」 — the explicit downscale, applied to the ORIGINAL not the API copy.
    r = await simulatePersist({ mode: "small", turns: THREE_TURNS });
    check("RUNTIME: 「1024px」 downscales the original, not the 1024px API copy",
        img(r[0], 0) === "edge1024:ORIG1" && img(r[1], 0) === "edge1024:ORIG1",
        `t1=${img(r[0], 0)}`);

    // 「저장 안 함」 — no bytes ever, but the COUNT survives so the placeholder renders.
    r = await simulatePersist({ mode: "none", turns: THREE_TURNS });
    check("RUNTIME: 「저장 안 함」 stores zero bytes",
        r[2].every(m => m.images.length === 0), JSON.stringify(r[2].map(m => m.images.length)));
    check("RUNTIME: 「저장 안 함」 still keeps the image COUNT",
        r[2][0].imageCount === 1 && r[2][2].imageCount === 1 && r[2][4].imageCount === 1,
        JSON.stringify(r[2].map(m => m.imageCount)));
    check("RUNTIME: 「저장 안 함」 marks every turn omitted (placeholder renders)",
        r[2].filter(m => m.role === "user").every(m => m.imagesOmitted === true));

    // The payload must stay clean: no memory-only keys may reach the history file.
    r = await simulatePersist({ mode: "original", turns: THREE_TURNS });
    check("RUNTIME: the persisted payload has no originalImages/savedImages keys",
        r[2].every(m => !("originalImages" in m) && !("savedImages" in m)),
        JSON.stringify(Object.keys(r[2][0])));

    // --- REGRESSION (2026-10-05): the node window broke on any button press --------
    // ComfyUI's DOM-widget renderer writes `widget.width = element.getBoundingClientRect().width`
    // on every draw and then sizes the wrapping `.dom-widget` host from THAT value — a
    // closed loop (card width → host width → card width) into which `node.width` never
    // enters. The card was therefore frozen at its creation-time width: measured live at
    // widget.width 274.81px / card 254.81px while the node was 520px, and still 254.81px
    // after growing the node to 900px. That is the reported 「늘리면 빈 공간만 늘고, 줄여도
    // 되돌아오지 않는다」.
    // A second, independent half of the same bug: the stylesheet declared
    // `width:100% !important` on the card, and `!important` beats an inline style, so the
    // width `syncContainerSize()` writes on every frame was discarded (measured: inline
    // 500px → rendered 1600px). Both halves had to go; fixing either one alone leaves the
    // card frozen, because the host it inherits from is itself frozen.
    // The fix is documented in a comment that quotes the very declaration it removes, so
    // the two width checks below read the stylesheet with comments stripped — otherwise the
    // explanation would read as the bug and the guard could never pass.
    const CSS_DECLARED = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    check("REGRESSION: the DOM widget's width getter reads the node width",
        /Object\.defineProperty\(domWidget,\s*"width"/.test(JS)
        && /get\(\)\s*\{\s*return node\.size\s*\?\s*node\.size\[0\]/.test(JS));
    check("REGRESSION: the frontend's self-referential width write is discarded",
        /set\(\)\s*\{[^}]*무시/.test(JS));
    check("REGRESSION: the card no longer hard-codes width via !important",
        !/\.bada-gemini-card,\s*\n\s*\.bada-async-gemini-root\s*\{[^}]*width:\s*100%\s*!important/.test(CSS_DECLARED));
    check("REGRESSION: ...nor max-width, which would re-clip a widened node",
        !/\.bada-gemini-card,\s*\n\s*\.bada-async-gemini-root\s*\{[^}]*max-width:\s*100%\s*!important/.test(CSS_DECLARED));
    // The width sync itself must survive — it is what now does the resizing.
    check("REGRESSION: syncContainerSize still writes the inline width",
        /root\.style\.width\s*=\s*w\s*\+\s*"px"/.test(JS));
    check("REGRESSION: the card still cannot collapse below the node's own box",
        /min-width:\s*0\s*!important/.test(CSS));

    console.log(fails === 0 ? "\nRESULT: PASS" : `\nRESULT: FAIL (${fails})`);
    process.exit(fails === 0 ? 0 : 1);
})();