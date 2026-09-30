# Beta Handoff - 2026-10-01

## Destination

- Repository: `bada-ya/ComfyUI-Bada-Utils-Beta`
- Branch: `main`
- The production repository `bada-ya/ComfyUI-Bada-Utils` must not receive these changes.

## Changes

- **New feature: Save As Folder Picker** (`web/workflow_organizer.js`)
  - Wraps `ComfyWorkflow.prototype.promptSave()`, so `File ▸ Save As` / `Ctrl+Shift+S` opens a Bada dialog instead of the stock filename-only prompt.
  - Dialog: a **Windows Explorer-style folder tree** (`🏠 Root`, `▶/▼` expand/collapse chevrons, per-level indentation, collapsed `📁` vs expanded `📂` icons, per-folder item counts, selected row highlighted, breadcrumb path + hint line), in-place **New Folder** creation that expands/selects the new node, file-name input, live target-path preview (`workflows/<folder>/<name>.json`) and an overwrite warning. Explorer keys are supported: `↑ ↓ ← →`, `Enter` (save), `Esc` (cancel).
  - The chosen folder is applied by temporarily setting `wf.directory` right before returning from `promptSave()`, so the native `saveWorkflowAs()` keeps handling overwrite confirm, `saveAs`/`rename`, tab state, thumbnails, drafts and favorites. A 4s guard restores the original `directory` if the save never happens (overwrite declined / error).
  - Only the workflow class is patched (`constructor.basePath === "workflows/"`, subgraph blueprints are untouched); any failure logs a warning and falls back to the stock ComfyUI dialog.
  - Remembers the last used folder in `localStorage` (`bada_saveas_last_folder`).
- **New setting** `BadaUtils.SaveAsFolderPicker` (default ON) with bilingual name/description (`web/bada_core.js`).
- **i18n**: 12 new keys (`wf_saveas_*`) in both `en` and `ko` dictionaries (`web/bada_i18n.js`).
- **Tests**: `dev_tests/bada_saveas_ui_smoke.py` (Playwright, 19 checks, self-cleaning + safety gate that only ever saves a temporary workflow) and its entry in `dev_tests/README.md`.
- **Docs**: `README.md` / `README_ko.md` (comparison-table row, feature bullets, settings table).
- **Backend: no changes required.** `POST /api/userdata/{file}` already creates missing parent folders, and `/api/qol/workflows/folders` + `/api/qol/workflows/create_folder` were reused as-is.

## Runtime Notes

- Frontend-only change: **no ComfyUI restart needed** — a browser hard refresh (`Ctrl+F5`) is enough.
- Do not touch `D:\StabilityMatrix\Data\Packages\ComfyUI_antig`.
- Verified environment: `comfyui-frontend-package==1.53.6`, `user\default\workflows` is a junction to `D:\AI\workflows`.

## Verification

- `node --check` on the three edited JS files: PASS.
- `dev_tests/bada_saveas_ui_smoke.py` against the live instance on port 8188: **24/24 PASS**
  (hook installed on the `ComfyWorkflow` prototype, `Comfy.SaveWorkflowAs` opens the dialog, root row first and first-level folders matching the tree API, a parent expanding with a `▼` chevron while its child appears one level deeper, new folder created + auto-selected + breadcrumb, path preview correct, file physically written to `D:\AI\workflows\_BadaSaveAsTest\bada_saveas_probe.json`, Cancel path OK, cleanup restored the original folder list).
- Known environment quirk surfaced by the test: `/api/qol/workflows/folders` uses `os.walk` (it does not descend into junction directories) while `/api/qol/workflows/tree` uses `os.scandir`, so the junction folder `D:\AI\workflows\Stability Matrix` shows up in the picker tree but is missing from the folders API (which the pre-existing "Move workflow" modal uses).
- Test caveat: Playwright must wait until the command registry is populated (~2-4s after boot) before firing `Comfy.SaveWorkflowAs`; the script waits for readiness and retries.

## Follow-up

- Visual confirmation in the daily-driver browser after a hard refresh, then decide when to push these changes to the beta repository.
- Re-run the picker test after any ComfyUI frontend version bump (the hook depends on `promptSave()` existing on the `ComfyWorkflow` prototype).

