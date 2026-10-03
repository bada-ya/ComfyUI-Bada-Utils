# Beta Handoff — 2026-10-03 (v0.1-beta5: Async Studio panel + Prompt Generator UI)

## Current state

| | |
| --- | --- |
| Beta remote | `bada-ya/ComfyUI-Bada-Utils-Beta`, branch `main` |
| Beta head | `3752032` — *fix(async): unclip the options row, drop toggle banners, auto-grow the composer* |
| Production | `bada-ya/ComfyUI-Bada-Utils` — **untouched, still `da6910f`** |
| Delta vs production | 20 commits, 54 files, +13,256 / −1,320 |
| Browser-verified | yes, by the user, on the daily driver |

Beta is **20 commits ahead of production** and is the only thing that has been touched this session.
`origin` is read-only (`ls-remote`); the single write this session was `git push beta main`.

## What you must do to see a change (read this first)

ComfyUI loads the two halves of this extension at different times, so **what you must do to see a
change depends on which files were touched**. Getting this wrong is silent — the UI keeps working
and simply ignores your input.

| Touched | What to do | Why |
| --- | --- | --- |
| `web/*.js`, `web/*.css` | **Ctrl+F5** in the browser (nothing else) | Served straight off disk; the browser is the only cache. A plain F5 is not enough — ComfyUI serves extensions with long cache headers. |
| `engines_registry.json`, any `user_prompts` / `gemini_prompts` list | **Ctrl+F5** | `GET /api/bada/promptgen/registry` reads the file per request and `load_registry()` caches by **mtime**, so a rename shows up without a restart. |
| `nodes/*.py`, `server/*.py` | **Restart ComfyUI, then Ctrl+F5** | Python is imported once at node registration. `INPUT_TYPES` is built at that moment, so a **new widget does not exist** until the process restarts. |

### The failure mode worth memorising

Adding a widget to `INPUT_TYPES` and only doing Ctrl+F5 gives you a frontend that renders the
control perfectly and sends the value **nowhere**. Nothing errors; the value is just dropped.

`BadaPromptGenerator` guards this: if the `aspect_ratio` widget is missing the picker turns red and
toasts *"⚠️ 화면비 값이 전달되지 않습니다. ComfyUI를 재시작해 주세요."* plus a console warning. That
message means **restart, do not refresh**.

Also worth knowing:

- Restart the **daily driver**, not `ComfyUI_antig`.
- If a node's *layout* looks stale after a restart, do Ctrl+F5 **again** — a restart alone re-fetches
  the extension JS only for newly loaded nodes.
- Changes never require `pip install`; the only Python dependency this extension has beyond
  ComfyUI's own (`aiohttp` ships with ComfyUI itself) is optional.

## Destination

- Repository: `bada-ya/ComfyUI-Bada-Utils-Beta`
- Branch: `main`
- The production repository `bada-ya/ComfyUI-Bada-Utils` was **not** pushed to and remains at
  `da6910f`. `origin` is only ever read (`ls-remote`, `--dry-run fetch`), never written.

## Why this batch exists

A UI polish + bug-fix pass over the two Gemini-facing nodes, driven by what the user saw on the
daily driver. Every item below was a visible defect, not a refactor: three of them made the panel
physically reshape itself on interaction.

## Changes (v0.1-beta5)

### 1. Async Studio options row was clipped in both languages

The NSFW / Korean-translation toggles rendered as `Allow NS…` and `한국어 변…`. Cause: each card
held an `ON`/`OFF` chip worth ~45px + an 8px gap, inside a three-column row that only had 474px
to work with (node 520px − 20 chrome − 24 padding). Chips removed (**+106px**), the toggle group
now takes first claim on the width (`flex: 0 1 auto` → `1 1 auto`), and `.bada-options-row` gained
`flex-wrap: wrap` so dragging the node narrower moves the aspect picker onto its own line instead
of truncating. Measured after: **386px (ko) / 378px (en) against 474px**.

The pressed state moved onto the card itself — `.bada-toggle-card.on`, amber for NSFW, green for
translation — instead of a text chip, and keeps a 1px border in both states so toggling never
reflows the row. Visible labels shortened (`성인용 콘텐츠 (NSFW)` / `Allow NSFW`); the full wording
lives in `aria-label` and the tooltip. Toggles also gained `role="button"`, `tabindex="0"`,
`aria-pressed`, a `:focus-visible` ring and Enter/Space activation.

### 2. Toggle clicks popped a banner over the panel

`showToast()` in the NSFW / Korean handlers fired on every click, in both languages, on **both
enable and disable**. `.bada-toast` is a block child of the card's flex column, so it shoved the
layout down rather than floating over it. Removed — the card's own border/background change is
the feedback.

Same fix for the Gemini persona menu: all six entries (4 Gem personas + the Gemini-only system
prompts) funnelled through `applyGemPromptSelection()` and fired `📜 적용됨` on every pick. The
trigger label already shows the selection, so nothing is lost. **Error** toasts (manager-open
failures) are deliberately untouched — only the confirmation banners went.

### 3. Chat composer was pinned to one line

`rows = 1` plus a CSS `max-height: 80px` with no resize logic. Now 3 lines at rest, growing upward
while typing to a 5-line cap, then scrolling the text upward inside the box; sending resets it to
3. Implemented with the existing `autoFitOutputTextarea()` pattern (reset to `auto`, measure
`scrollHeight`) so JS and CSS cannot disagree about the cap. `max-height` was removed from CSS
because it fought the auto-grow; `line-height: 1.5` is now explicit so the 5-line maths is
reliable. Enter still sends, Shift+Enter still newlines.

### 4. Earlier in the same branch

- **KREA2 / QWEN2.1** menu labels, `name_en` display support in `engines_registry.json`. The
  registry `name` stays the **backend value**; only the presentation is localized.
- Shared **aspect-ratio picker** injected into Gemini, plus panel-height re-measurement when the
  language or node width changes — the 영상 길이 row was being clipped (hidden entirely in English,
  which wraps one row more).
- `LocalStorage 자동 저장` wording removed; system-prompt button moved right; stray control icons
  dropped.
- Async Studio output socket stripped in **both** `onNodeCreated` and `onConfigure` (LiteGraph
  restores serialized `outputs` *after* construction, so `onNodeCreated` alone let a saved
  workflow's `prompt` socket survive a refresh).
- 🔔 bell relocated into the API-key label row; `.bada-toast` generation banners removed.

## Tests

| Suite | Result |
| --- | --- |
| `node dev_tests/bada_async_gemini_layout_test.js` | **78/78 PASS** (new file) |
| `node dev_tests/bada_promptgen_ratio_test.js` | PASS (new file) |
| `python dev_tests/bada_promptgen_registry_test.py` | PASS (new file) |
| `node dev_tests/bada_folder_drag_test.js` | 103/103 PASS |
| `python dev_tests/bada_folder_rename_test.py` | 53/53 PASS |
| `node --check` on every file in `web/` | PASS |
| `py_compile` on every Python file | PASS |
| CSS brace balance (`bada_async_gemini.css`) | 211/211 |

`bada_async_gemini_layout_test.js` pins the six banner removals, the output-socket strip in both
hooks, the ON/OFF chip removal, the persona-menu toast removal and the composer's 3→5-line growth.
Short **action** toasts (copy / attach / key check) are kept on purpose, so the no-banner assertion
is scoped to generation wording rather than banning `showToast` outright.

## Not verified

- **No browser automation here** (no Playwright). Layout claims are backed by the width model in
  the commit body plus the user's manual confirmation on the daily driver.
- Node height after a **language switch** in the Async Studio was not re-checked visually; the
  recalibration code is in place but unexercised.
- `fitToContent()` only ever **grows** the node and `userPreferredHeight` is persisted to
  localStorage, so a user who manually made the node very tall cannot get it back automatically.
  The 5-line composer cap keeps this bounded, but the behaviour is deliberate — do not "fix" it
  into an auto-shrink without reading this first.

## Previous batch — v0.1-beta4 audit fixes (`d498f35` and earlier)

Retained for context: the XSS fix and the two performance items below are already on Beta and
are part of the delta against production. Nothing here was touched in v0.1-beta5.

## Changes

### 1. XSS in the sidebar toast (the one that mattered)

`WorkflowsPlusManager.showToast()` built its markup with an unescaped `${message}`, and roughly
ten call sites forward `data.error` straight from the REST API. Those messages embed
user-controlled text — `Source file not found: <path>`, `'<name>' already exists`,
`Move failed: <OSError>`. A workflow file whose name contains markup therefore ran as HTML.
Windows forbids `<`/`>` in filenames, but Linux/macOS do not, and a shared workflow pack is an
untrusted source. ComfyUI's local server has no authentication, so XSS there equals full access
to the local REST API.

Fixed once at the entry point, so no call site had to change. Every caller was checked first to
confirm none of them intentionally passes markup.

### 2. Blocking filesystem walk on the aiohttp event loop

`get_all_available_models()` runs `os.listdir(models_dir)` plus an `os.walk()` over every model
subfolder and had **no cache** (the existing `CACHED_DETECTIVE_DB` belongs to the missing-node
detective and is unrelated). It was called directly from the `async def get_models_handler`, so
for the duration of the scan the whole server — UI, queue, websockets — stalled.

- Added `get_all_available_models_cached()`: 300 s TTL guarded by a `threading.Lock`. An
  empty/failed result is deliberately **not** cached, so a transient filesystem error cannot
  poison the answer for five minutes.
- `get_models_handler` now awaits `asyncio.to_thread(...)` and reports a `cached` flag.
- `get_tree_handler` offloads `build_workflow_tree()` the same way.

### 3. Permanent 300 ms polling loop

`web/bada_core.js` ran `setInterval(() => document.querySelector('[role="dialog"]'), 300)` from
page load to tab close — three DOM queries per second, forever, and the only interval in the
codebase that was never cleared.

- Replaced with a `MutationObserver` that does nothing while the page is idle.
- The poll's second job (re-adding the left-sidebar anchor icon when the native UI drops it) was
  folded into the existing per-dialog observer by watching `removedNodes`, so the repair is now
  event-driven too. Nothing polls any more.
- Bonus: the two startup probes in `workflow_organizer.js` (2 s tab observer, 3 s pinia
  subscription) keep their retry semantics — ComfyUI's Vue app may not exist yet at boot — but
  now go through `retryUntilSatisfied()` and stop for good once attached, or after 60 s.

### 4. N1 - de-duplicate `escapeHtml()`

Nine copies existed (seven module-level functions plus two `WorkflowsPlusManager` methods) and
had already drifted: two different apostrophe entities, some with a falsy guard and some
without. New `web/bada_shared.js` (90 lines) exports `escapeHtml()` and a shared toast
implementation; the seven duplicates are deleted. The two class methods stay as thin delegating
wrappers so the many `this.escapeHtml(...)` call sites are untouched.

The four `showToast()` implementations were deliberately **left alone** — each has a
deliberately different look (e.g. the glassmorphic one in `presets_modal.js`) and there is no
browser here to verify a visual change. The shared module gives them a migration target.

### 5. N3 - surface silently swallowed errors

Every empty `catch {}` and bare `except: pass` now logs at debug level
(`console.debug(...)` / `logger.debug(..., exc_info=True)`), which stays silent by default.

- JS: **104** blocks converted. (An earlier line-based count of 60 missed the
  `catch (e) {` multi-line form — 104 is the accurate figure.)
- Python: **14** blocks converted. `nodes/bada_regional_prompt.py` had no logger at all, so a
  `logging` import and a module `logger` were added.
- The codemods were one-off scripts and have been deleted.
## Runtime Notes

- **A ComfyUI restart is required** — `server/bada_server_api.py` changed.
- The frontend-only parts need a browser hard refresh (<kbd>Ctrl</kbd>+<kbd>F5</kbd>).
- Verified environment: `D:\StabilityMatrix\Data\Packages\ComfyUI` (NOT `ComfyUI_antig`),
  `user\default\workflows` is a junction to `D:\AI\workflows`, and
  `custom_nodes\ComfyUI-Bada-Utils` is a junction to this repo, so edits apply on restart.
- Do not touch `D:\StabilityMatrix\Data\Packages\ComfyUI_antig`.
- `config.json`, `favorites_data.json`, `*.bak` and `dev_tests/_shots/` are gitignored, so no
  API keys or scratch artefacts were committed.

## Verification

- `node --check` on **every** file in `web/` and `dev_tests/`: PASS.
- `py_compile` on every Python file: PASS.
- `node dev_tests/bada_folder_drag_test.js` -> **103/103 PASS** (was 90).
  New coverage: the toast escaping a `<img src=x onerror=...>` payload, `escapeHtml()` having
  exactly one implementation, the absence of the 300 ms poll, the event-driven dialog watcher and
  anchor self-heal, and the self-terminating startup probes.
- `python dev_tests/bada_folder_rename_test.py` -> **53/53 PASS** (was 41).
  New coverage: the model-scan TTL cache cold -> warm -> expiry path, that an empty scan is never
  cached, and that neither handler still calls the blocking walk inline.
- Import graph checked for all seven consumers of `bada_shared.js`, and the module was confirmed
  to actually be served by the running instance (HTTP 200).

### Two mistakes made during this batch, both caught and corrected

1. The JS codemod spliced matches front-to-back, which invalidates the positions of matches not
   yet processed. Fixed by replacing back-to-front; the 104 conversions are correct.
2. The Python codemod emitted `except E: as _ignored_err`, breaking compilation. Repaired with a
   corrective pass rather than reverting, so the audit fixes in the same files survived.
   `py_compile` is what caught it.

### Not verified

- **No browser testing.** Playwright is not installed here, so nothing requiring a real browser
  was checked. The `bada_shared.js` import graph is syntactically valid and the module is served
  over HTTP, but it has not been loaded by a browser. The settings-dialog MutationObserver is
  likewise unexercised. **Confirm this first before promoting to production.**
- The new body-level observer fires on every DOM mutation batch. Idle cost is zero, but on a
  very busy canvas the callback may run more often than the old 300 ms timer did. If drag
  latency is noticed, narrow the observer to the dialog host element.
- No memory profiling, no concurrency testing, and the XSS fix was verified by asserting the
  escaped output rather than by executing a payload in a browser.

## Follow-up

- Load the extension in a browser and confirm the sidebar, presets hub, smart presets and settings
  dialog all still work (this batch touched shared code in seven files).
- Re-run both sidebar tests after any ComfyUI frontend version bump.
- Decide whether the folder "Move" context-menu entry should be exposed (the backend and the drag
  path already support it; only the menu entry is still hidden for folders).
- Decide whether multi-select should gain a context-menu multi delete/move.
- Optionally migrate the four remaining `showToast()` implementations onto `bada_shared.js`.
- Promotion to production (`origin`) is still **not** approved and was never pushed to.