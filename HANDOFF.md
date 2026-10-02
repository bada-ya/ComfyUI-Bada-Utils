# Beta Handoff - 2026-10-03

## Destination

- Repository: `bada-ya/ComfyUI-Bada-Utils-Beta`
- Branch: `main`
- The production repository `bada-ya/ComfyUI-Bada-Utils` must not receive these changes.
  `origin` was **not** pushed from and stays 16 commits behind local `main`.

## Changes

Two independent batches are included: the Workflows+ sidebar work from this session, plus
prompt-generator work that was still uncommitted in the working tree when the session began
(commit 1 - authored in an earlier session, pushed as-is).

### Commit 1 - promptgen: Gemini-only system prompt manager

- New REST routes in `server/bada_promptgen_api.py`:
  `POST /api/bada/gemini/prompts/save|delete|move`, CRUD over `engines_registry.json` ->
  `gemini_prompts`, fully separate from the existing `user_prompts` list.
- New `web/bada_gemini_prompt_modal.js`: create / edit / delete / reorder modal, lazily
  imported from `web/bada_async_gemini.js` and wired only into the Gemini tab's uncensored
  dropdown. Reuses the `bpgm-*` design system by loading `bada_prompt_generator.css` on demand.
- `engines_registry.json`: new/edited system-prompt text. Contains uncensored-oriented prompt
  content by design, same as the node's existing uncensored mode.
- Assorted promptgen / async-studio refinements in `nodes/bada_prompt_generator.py`,
  `server/gemini_api.py`, `web/bada_prompt_generator.js`, `web/bada_async_gemini.{js,css}`,
  `README.md`, `README_ko.md`.

### Commit 2 - sidebar: folder rename, drag & drop, multi-select

**Fix - folder rename always 404'd.** Right-click > Rename on a folder returned
`404 {"error": "Source file not found: /<folder>"}` and surfaced as a red toast. The rename
dialog posts folders to the same `POST /api/qol/workflows/move` endpoint as workflows, but the
handler resolved the source with `find_file_in_workflows()`, which only ever returns files, so
a directory could never match.

- `server/bada_server_api.py`:
  - `move_workflow_folder()` routes directory sources to a folder move/rename branch.
  - `.json` is no longer forced onto folder names (it would create `MyFolder.json`).
  - Guard rails: self-subtree 400, duplicate target 409, illegal/reserved Windows names 400,
    path traversal 400, workflows-root protection 403.
  - `remap_metadata_for_move()` re-points every `.bada_meta.json` key under a moved folder.
    Without it, renaming a folder silently dropped the notes/thumbnails of everything inside.
  - **Windows case-only rename fix**: `os.path.realpath()` returns the on-disk casing, so
    `photos` -> `Photos` was silently dropped. The destination is now split into `dest_real`
    (containment check only) and `dest_literal` (the move itself, keeps the typed casing),
    with a two-step rename for the case-only case.
  - File branch hardened: an existing destination is a clean 409 instead of a raw shutil 500,
    and `overwrite` is now honoured.
- `web/workflow_organizer.js`:
  - `attachFileDragEvents()` -> `attachRowDragEvents(rowEl, item, kind)`. One drag engine for
    both row types; `kind` decides the ghost icon, what counts as a valid drop target, and
    which move helper commits. Folders drop onto folders (Explorer behaviour); hovering a
    workflow row means "into the folder that owns it".
  - Impossible drops (a folder into itself or its own subtree) turn the target red with a
    `no-drop` cursor and never reach the server.
  - `moveWorkflowFolder()`; `rebaseSidebarStateAfterFolderRename` -> `...AfterFolderMove`
    (a rename and a move are the same path rewrite, so both now share one helper).
  - **Multi-select**: Ctrl+Click adds/toggles, Shift+Click selects a visible range, Esc clears.
    Both modifiers now suppress the row's default action - previously they ran the plain click
    and silently reopened the workflow.
  - **Folders never join a multi-selection.** A modifier click on a folder narrows the
    selection to that folder alone, and Shift ranges skip folder rows. A range running across
    a folder produced the confusing state where a folder and its own children were both
    selected and then both dragged. Enforced in `handleRowClick()` and again in
    `resolveDragEntries()`, the only producer of batch-move input.
  - `moveSelectionToFolder()` moves the batch in one pass, reloading the tree once instead of
    once per item, and rebasing expanded folders / bookmarks / active workflow / selection.
  - Multi-select styling is deliberately neutral (flat zinc wash + slim grey bar; no indigo,
    no gradient, no bold) so it cannot be mistaken for the active-workflow highlight. The CSS
    rule is also deliberately placed after `.qol-file-row:hover` and before `.active-workflow`
    so the "you are here" highlight always wins on a row that is both.
- Tests: `dev_tests/bada_folder_rename_test.py` (41 checks, Python) and
  `dev_tests/bada_folder_drag_test.js` (90 checks, Node).

## Runtime Notes

- **A ComfyUI restart is required** for the `server/bada_server_api.py` changes.
- Frontend-only changes need just a browser hard refresh (<kbd>Ctrl</kbd>+<kbd>F5</kbd>).
- Verified environment: `D:\StabilityMatrix\Data\Packages\ComfyUI` (NOT `ComfyUI_antig`),
  `user\default\workflows` is a junction to `D:\AI\workflows`, and
  `custom_nodes\ComfyUI-Bada-Utils` is a junction to this repo, so edits apply on restart.
- Do not touch `D:\StabilityMatrix\Data\Packages\ComfyUI_antig`.
- `config.json`, `favorites_data.json`, `*.bak` and `dev_tests/_shots/` are gitignored, so no
  API keys or scratch artefacts were committed.

## Verification

- `node --check` on `web/workflow_organizer.js` and both test scripts: PASS.
- `python dev_tests/bada_folder_rename_test.py` -> **41/41 PASS**. It stubs `server.PromptServer`
  and `folder_paths`, imports the **real** handlers and drives them against a temp directory,
  so it needs no running instance and never touches the real workflows folder.
- `node dev_tests/bada_folder_drag_test.js` -> **90/90 PASS**. It pulls the real
  `WorkflowsPlusManager` class out of the ES module with `vm` and stubs the browser globals.
  No browser or Playwright required.
- The live bug was reproduced before fixing it: `POST /api/qol/workflows/move` with a folder
  source answered `404 {"success": false, "error": "Source file not found: /_BadaRenameTest"}`.
- Two real bugs were caught *by* these tests while writing them, not merely covered:
  - A backtick inside a CSS comment terminated the `injectStyles()` template literal. It was an
    even number of backticks, so `node --check` passed while the runtime would have thrown.
  - Shift-range anchors were resolved against the first row matching the key, so a bookmark and
    the same workflow in the tree shared one key and the wrong section could win.
- **Not verified:** anything needing a real browser (visual appearance, actual mouse drag
  ghosting, drop-target highlighting). Playwright is not installed in this environment.
  Confirm in a browser before promoting to production.
- Known scope gaps: the context menu still acts on a single row (no multi delete/move), and
  multi-select is mouse-only because the custom drag is mouse-driven.

## Follow-up

- Restart the daily driver and re-check folder rename, folder drag and multi-select drag in a
  real browser.
- Decide whether the folder "Move" context-menu entry should be exposed (the backend and the
  drag path already support it; only the menu entry is still hidden for folders).
- Decide whether multi-select should gain a context-menu multi delete/move.
- Re-run both sidebar tests after any ComfyUI frontend version bump.