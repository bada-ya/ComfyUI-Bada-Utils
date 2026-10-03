// Guards the BadaAsyncGeminiStudio panel slimming: the completion banner, the pass-status
// badge and the duplicated in-panel title are gone, and the 🔔 bell moved into the API-key
// label row. These are all *removals*, which nothing else in the suite would catch.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const JS = read(path.join("web", "bada_async_gemini.js"));
const CSS = read(path.join("web", "bada_async_gemini.css"));

let fails = 0;
const check = (label, ok) => {
    console.log(`${ok ? "OK " : "BAD"} ${label}`);
    if (!ok) fails++;
};

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
// this reason. Short action confirmations (copy / attach / key check) are a different thing
// and are deliberately left in place, so the assertion is scoped to generation wording.
const genBanners = (JS.match(/showToast\([^\n]*?(생성 완료|작업 중|답변 생성 완료|Reply completed|working\.\.\. \(Click)/g) || []);
check("no generation banner toast left",
    genBanners.length === 0,
    genBanners.length ? genBanners.join(" | ") : "none");
check("action toasts still work (copy / attach / key check)",
    /Copied the \$\{meta\.en\} text to the clipboard/.test(JS)
    && /Clipboard image attached/.test(JS)
    && /Google Gemini API Connected/.test(JS));
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

console.log(fails === 0 ? "\nRESULT: PASS" : `\nRESULT: FAIL (${fails})`);
process.exit(fails === 0 ? 0 : 1);