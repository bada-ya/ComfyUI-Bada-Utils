# dev_tests — BadaPromptGenerator verification harness

Throw-away verification scripts for the `BadaPromptGenerator` node. They talk to a
**live** ComfyUI instance over HTTP (they never import ComfyUI internals), so they
must be pointed at a scratch instance instead of the daily driver on port `8188`:

```powershell
$env:BADA_TEST_BASE = "http://127.0.0.1:8199"   # scratch instance (default anyway)
```

| script | what it proves |
| --- | --- |
| `bada_promptgen_exec_test.py` | Backend **execution** path. Queues `enhance=false` (no Gemini call), then asserts the node executed, `generated_text` passed `request_text` through verbatim, `wh_ratio` stayed empty, the `bada_promptgen_toast` ui key was emitted, and a downstream consumer node actually received the text. |
| `bada_promptgen_ui_smoke.py` | Frontend **browser** path (Playwright/Chromium, headless). 49 checks: boot/registration, node header DOM, toggle-card ↔ BOOLEAN widget sync (both directions), cascading `target → submenu`, toast rendering from a websocket `executed` payload, API-key row (mask/reveal/empty-key warning), model select → localStorage + `config.json`, modal CRUD (create/load/reorder/delete), and modal → registry → node `submenu` integration (no restart). |
| `bada_promptgen_live_check.py` | **Read-only** readiness probe for an already-running instance (defaults to port `8188`). Confirms the registry route answers, `BadaPromptGenerator` is in `/object_info`, and the browser-side assets (`bada_prompt_generator.js` / `.css`, `bada_promptgen_modal.js`, `bada_i18n.js`) are served with the latest markers. Mutates nothing — safe on the daily driver. |
| `bada_saveas_ui_smoke.py` | Frontend **browser** path for the Save As Folder Picker. 24 checks: extension boot, `ComfyWorkflow.prototype.promptSave` hook, `Comfy.SaveWorkflowAs` opening the Bada dialog, the Windows Explorer-style tree (root row first, first-level folders matching the tree API, a parent expanding with a `▼` chevron and its child appearing at a deeper indent), in-place folder creation + auto-select + breadcrumb, live target-path preview, the real save landing on disk at `<root>/<folder>/<name>.json`, and the Cancel path. Creates a blank temporary workflow first (never renames a real file) and deletes every artifact afterwards, so it is safe on the daily driver. |
| `bada_folder_rename_test.py` | Workflow+ sidebar **folder** rename/move. 53 checks against the real `server/bada_server_api.py` handlers: the reported 404 regression, no `.json` suffix on folders, nested renames, folder moves, guard rails (self-subtree 400, duplicate target 409, illegal/reserved Windows names 400, path traversal 400, root protection 403), case-only renames, `.bada_meta.json` note/thumbnail migration, the unchanged workflow-file path, and the **model-scan TTL cache / `asyncio.to_thread` offload** (cold → warm → TTL expiry → an empty scan is never cached, plus the handlers must not call the blocking walk inline). **Hermetic** — stubs `server.PromptServer` / `folder_paths` and works on a temp directory, so it needs no running instance and never touches your real workflows folder. |
| `bada_folder_drag_test.js` | Workflow+ sidebar **folder drag & drop + multi-select** (Node, no browser needed). 103 checks that pull the real `WorkflowsPlusManager` class out of `web/workflow_organizer.js` with `vm` and exercise the frontend half: `splitSidebarPath()` on every folder/file path shape, `moveWorkflowFolder()` self/descendant refusal + request payload, `rebaseSidebarStateAfterFolderMove()` (expanded folders / bookmarks / active workflow / selection all follow a folder to its new parent), **Ctrl+Click additive toggle and Shift+Click range selection — with the guarantee that neither modifier opens the workflow, that ranges skip folder rows, and that folders can never join a multi-selection (a modifier click on a folder narrows the selection to that folder alone)**, `resolveDragEntries()` deciding what a drag carries and refusing a mixed batch, and `moveSelectionToFolder()` batch semantics (nested rows ride along with their moved folder, rows already in the target are skipped). Also asserts the drag/click wiring exists, that no stale `attachFileDragEvents` reference survived the refactor, that the multi-select palette does not imitate the active-workflow highlight, **that `showToast()` escapes server-supplied markup (XSS regression)**, **that `escapeHtml()` has exactly one implementation**, and **that no permanent polling remains (event-driven settings-dialog detection, self-terminating startup probes)**. |

> Is your main instance already up to date? `python dev_tests/bada_promptgen_live_check.py`
> — if it prints `READY`, you only need a browser hard refresh (<kbd>Ctrl</kbd>+<kbd>F5</kbd>);
> a server restart is only required after editing Python files.

Requirements (install into the ComfyUI venv or any Python 3.10+):

```powershell
pip install requests playwright
playwright install chromium
```

> `bada_saveas_ui_smoke.py` also works when only the regular `chromium-*` build is
> cached (no `chromium_headless_shell-*`): it detects the missing headless shell and
> relaunches with `channel="chromium"` automatically.
> If `import requests` suddenly fails with a `python39.dll` conflict, clear the
> `PYTHONPATH` environment variable for the test run.

Run:

```powershell
python dev_tests/bada_promptgen_exec_test.py
python dev_tests/bada_promptgen_ui_smoke.py      # screenshots -> dev_tests/_shots (gitignored)
python dev_tests/bada_saveas_ui_smoke.py         # Save As folder picker (safe on 8188)
python dev_tests/bada_folder_rename_test.py      # folder rename/move (no instance needed)
node   dev_tests/bada_folder_drag_test.js       # folder drag & drop (no instance needed)
```

> `bada_folder_rename_test.py` and `bada_folder_drag_test.js` are the odd ones out: neither
> talks to a live instance. The Python one imports the real REST handlers with
> `server.PromptServer` / `folder_paths` stubbed and drives them against a temp directory; the
> Node one loads the real sidebar class with `vm` and stubs the browser globals. Both are
> therefore safe to run anywhere and never touch your real workflows folder. The Python script
> needs `aiohttp` (use the ComfyUI interpreter); the Node script needs only `node`.

Both scripts exit non-zero on the first failed check and print a `PASS/FAIL` line
per assertion. The UI smoke test is **idempotent**: every prompt it creates is
deleted again and `config.json`'s `default_model` is restored, so it can be
re-run at any time. Scratch artifacts:

- `dev_tests/_shots/*.png` — per-section screenshots (`BADA_TEST_SHOTS` overrides the path)
- `engines_registry.json.bak` — snapshot written by the REST API before each save (gitignored)

> Note: ComfyUI history only stores outputs of `OUTPUT_NODE`s, which is why the
> exec test verifies the data flow through a downstream consumer node
> (`ShowText` / `PreviewAny`) rather than reading node 1's own outputs.
