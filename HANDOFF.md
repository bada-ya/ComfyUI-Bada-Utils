# Beta Handoff - 2026-10-03 (pre-production audit + fixes)

## How to verify a change (read this first)

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

A full read-through audit of the extension (~18.7k lines of Python/JS/CSS/JSON) was performed
ahead of promoting the beta work to production. Verdict: **no blockers**, three warnings. This
batch fixes those three warnings plus the two maintainability items (N1/N3).

Audit result: **0 critical, 3 warnings, 4 informational**, and six areas confirmed clean —
no `eval` / `new Function` / `subprocess` / `pickle` / `exec`; no SSL-verification bypass; no
committed secrets; path-traversal defence consistent across every path-taking handler; thumbnail
upload validated and re-encoded through PIL; thumbnail serving pinned to an image Content-Type;
the Gemini API key is never returned in full; `translation_runtime.py` has a bounded worker pool
and queue.

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