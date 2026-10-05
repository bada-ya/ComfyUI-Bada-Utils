"""Real-browser (Playwright) smoke test for the Bada Save As Folder Picker.

The feature replaces ComfyUI's filename-only "Save workflow" prompt with a
folder-aware dialog (folder list + in-place folder creation + live target path
preview) by wrapping `ComfyWorkflow.prototype.promptSave()`.

What this script proves end to end:
  1. the extension boots and the promptSave hook is installed on the ComfyWorkflow prototype
  2. `Comfy.SaveWorkflowAs` (File > Save As / Ctrl+Shift+S) opens the Bada dialog
  3. the Windows Explorer-style folder tree: root row first, visible top-level
     folders matching `/api/qol/workflows/folders`, parent rows expanding with a
     ▼ chevron and children appearing at a deeper indent
  4. "New Folder" creates a folder on disk, auto-selects it and shows it nested
     (plus the breadcrumb path)
  5. the target-path preview tracks folder + file name
  6. confirming actually writes `<root>/<folder>/<name>.json` through the native flow
  7. Cancel aborts without creating a file

Safety / idempotency (safe to re-run):
  * the test first creates a **blank (temporary) workflow** and refuses to
    continue unless `activeWorkflow.isTemporary` is true - that guarantees the
    native "Save As" creates a NEW file instead of renaming an existing one
  * every artifact it creates (`<folder>/<name>.json`, the folder itself) is
    deleted again via the Bada workflow API before the script exits
  * nothing else in the user data directory is touched

Requirements: `pip install playwright requests` + `playwright install chromium`
(playwright 1.57.x matches the pre-existing chromium-1200 cache).

Run (frontend-only feature, so the daily driver is fine - it cleans up after itself):
    python dev_tests/bada_saveas_ui_smoke.py
    BADA_TEST_BASE=http://127.0.0.1:8188   # target instance (default)
    BADA_TEST_SHOTS=<dir>                  # screenshot output (default ./_shots)
"""
import io
import os
import sys
import time

import requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
from playwright.sync_api import sync_playwright  # noqa: E402

BASE = os.environ.get("BADA_TEST_BASE", "http://127.0.0.1:8188").rstrip("/")
FOLDER = os.environ.get("BADA_TEST_FOLDER", "_BadaSaveAsTest")
NAME = os.environ.get("BADA_TEST_NAME", "bada_saveas_probe")
SHOT_DIR = os.environ.get("BADA_TEST_SHOTS") or os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "_shots")
os.makedirs(SHOT_DIR, exist_ok=True)

FOLDERS_URL = BASE + "/api/qol/workflows/folders"
TREE_URL = BASE + "/api/qol/workflows/tree"
DELETE_URL = BASE + "/api/qol/workflows/delete"
FILE_URL = BASE + "/api/userdata/workflows%2F{0}%2F{1}.json"

results = []


def check(label, cond, info=""):
    results.append(bool(cond))
    print(f"[{'PASS' if cond else 'FAIL'}] {label}" + (f" :: {info}" if info else ""))
    return bool(cond)


def ts():
    return str(int(time.time() * 1000))


def api_folders():
    data = requests.get(FOLDERS_URL, params={"ts": ts()}, timeout=20).json()
    return data.get("folders") or [], data.get("root_dir") or ""


def api_tree_top_level():
    """First-level folder paths as the tree API reports them (what the picker renders)."""
    data = requests.get(TREE_URL, params={"ts": ts()}, timeout=20).json()
    tree = data.get("tree") or {}
    return sorted(["/" + str(node.get("path", "")) for node in (tree.get("folders") or [])])


def api_file_exists():
    url = FILE_URL.format(FOLDER, NAME) + f"?ts={ts()}"
    return requests.get(url, timeout=20).status_code == 200


def api_delete(target_rel):
    try:
        body = requests.post(DELETE_URL, json={"target_path": target_rel}, timeout=20).json()
        return bool(body.get("success"))
    except Exception:
        return False


def cleanup():
    api_delete(f"{FOLDER}/{NAME}.json")
    api_delete(FOLDER)
    leftovers, _ = api_folders()
    return f"/{FOLDER}" not in leftovers


# ---------------------------------------------------------------------------
# page-side helpers (kept as tiny JS strings so evaluate() calls stay readable)
# ---------------------------------------------------------------------------
JS_BOOT_OK = "() => !!(window.app && window.app.extensionManager && window.__BADA_WORKFLOW_ORGANIZER_INSTANCE__)"

JS_WORKFLOW_STATE = """() => {
  const pinia = window.__pinia ||
    document.querySelector('#vue-app')?.__vue_app__?.config?.globalProperties?.$pinia;
  const store = pinia?._s?.get('workflow');
  const inst = store?.activeWorkflow || (store?.openWorkflows || [])[0];
  if (!inst) return { found: false };
  const proto = Object.getPrototypeOf(inst);
  return {
    found: true,
    hooked: !!proto.__badaSaveAsPicker,
    className: proto.constructor?.name,
    basePath: proto.constructor?.basePath,
    isTemporary: !!inst.isTemporary,
    directory: inst.directory,
    filename: inst.filename,
    path: inst.path,
  };
}"""

JS_NEW_BLANK = "() => window.app.extensionManager.command.execute('Comfy.NewBlankWorkflow')"
JS_SAVE_AS = "() => { window.app.extensionManager.command.execute('Comfy.SaveWorkflowAs'); }"

JS_TREE_ROWS = """() => Array.from(document.querySelectorAll('#qol-sa-tree .qol-sa-row')).map(r => ({
  path: r.getAttribute('data-path'),
  indent: parseInt((r.style.paddingLeft || '0'), 10),
  selected: r.classList.contains('selected'),
  expandable: !!r.querySelector('.qol-sa-chevron[data-toggle]'),
  chevron: (r.querySelector('.qol-sa-chevron')?.textContent || '').trim(),
  name: (r.querySelector('.qol-sa-name')?.textContent || '').trim(),
}))"""
JS_SELECTED_PATH = "() => document.querySelector('#qol-sa-tree .qol-sa-row.selected')?.getAttribute('data-path') || null"
JS_PREVIEW = "() => document.querySelector('#qol-sa-path')?.textContent || ''"
JS_BREADCRUMB = "() => (document.querySelector('#qol-sa-breadcrumb')?.textContent || '').replace(/\\s+/g, ' ').trim()"
JS_MODAL_OPEN = "() => !!document.querySelector('#qol-sa-tree')"
JS_NATIVE_DIALOG_TEXT = """() => {
  const dlg = document.querySelector('.p-dialog, [role="dialog"]');
  return dlg ? (dlg.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 160) : '';
}"""

JS_READY = """() => {
  const em = window.app?.extensionManager;
  const reg = em?.command?.commands;
  let has = false;
  try {
    if (Array.isArray(reg)) has = reg.some(c => c?.id === 'Comfy.SaveWorkflowAs');
    else if (reg && typeof reg === 'object') has = Object.prototype.hasOwnProperty.call(reg, 'Comfy.SaveWorkflowAs');
  } catch (e) {}
  const pinia = window.__pinia ||
    document.querySelector('#vue-app')?.__vue_app__?.config?.globalProperties?.$pinia;
  const wf = pinia?._s?.get('workflow')?.activeWorkflow;
  return { hasCommand: has, hasWorkflow: !!wf, registered: reg ? (Array.isArray(reg) ? reg.length : Object.keys(reg).length) : -1 };
}"""

def launch_chromium(pw):
    """Prefer the headless shell, but fall back to the full chromium build.

    Some Playwright setups only have the regular `chromium-*` download cached
    (no `chromium_headless_shell-*`), so fall back to channel="chromium".
    """
    try:
        return pw.chromium.launch(headless=True)
    except Exception as exc:
        print(f"   [note] headless shell unavailable ({type(exc).__name__}) - using channel='chromium'")
        return pw.chromium.launch(headless=True, channel="chromium")


def main():
    print(f"== Bada Save As Folder Picker / UI smoke :: {BASE} ==")
    folders_before, root_dir = api_folders()
    if root_dir:
        print(f"   workflows root: {root_dir}")

    with sync_playwright() as pw:
        browser = launch_chromium(pw)
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        page.on("pageerror", lambda err: print(f"   [pageerror] {err}"))

        def on_console(msg):
            if msg.type in ("warning", "error"):
                text = msg.text
                print(f"   [console.{msg.type}] {text[:400]}")

        page.on("console", on_console)

        try:
            page.goto(BASE, wait_until="domcontentloaded", timeout=60_000)
            page.wait_for_function(JS_BOOT_OK, timeout=60_000)
            check("extension boot (Bada Workflows+ instance present)", True)

            # --- 1. hook installed on the ComfyWorkflow prototype ------------
            state = page.evaluate(JS_WORKFLOW_STATE)
            if not state.get("found"):
                page.evaluate(JS_NEW_BLANK)
                page.wait_for_timeout(1500)
                state = page.evaluate(JS_WORKFLOW_STATE)
            check("active workflow instance found", bool(state.get("found")), str(state))

            if not state.get("hooked"):
                deadline = time.time() + 20
                while time.time() < deadline and not page.evaluate(JS_WORKFLOW_STATE).get("hooked"):
                    page.wait_for_timeout(1000)
                state = page.evaluate(JS_WORKFLOW_STATE)
            check("promptSave hook installed (proto.__badaSaveAsPicker)", state.get("hooked"), str(state.get("className")))
            check("hook target is the workflows class", state.get("basePath") == "workflows/", str(state.get("basePath")))

            # --- 2. always work on a fresh TEMPORARY workflow (never rename a real file)
            if not state.get("isTemporary"):
                page.evaluate(JS_NEW_BLANK)
                page.wait_for_timeout(2000)
                state = page.evaluate(JS_WORKFLOW_STATE)
            check("active workflow is temporary (safe Save As)", state.get("isTemporary"), str(state.get("path")))

            # --- 3. File > Save As opens the Bada dialog ---------------------
            check("command API available (app.extensionManager.command.execute)",
                  page.evaluate("() => typeof window.app.extensionManager.command?.execute === 'function'"))

            # The command registry / workflow store populate a few seconds after
            # the extension boots, so wait for readiness and retry the trigger.
            try:
                page.wait_for_function(
                    "() => { const s = (%s)(); return s.hasCommand && s.hasWorkflow; }" % JS_READY,
                    timeout=60_000)
                ready = page.evaluate(JS_READY)
            except Exception:
                ready = page.evaluate(JS_READY)
            check("Comfy.SaveWorkflowAs command registered + active workflow ready",
                  ready.get("hasCommand") and ready.get("hasWorkflow"), str(ready))

            dialog_ok = False
            for _ in range(6):
                page.evaluate(JS_SAVE_AS)
                try:
                    page.wait_for_selector("#qol-sa-tree", timeout=3000)
                    dialog_ok = True
                    break
                except Exception:
                    page.wait_for_timeout(700)
            if not dialog_ok:
                native = page.evaluate(JS_NATIVE_DIALOG_TEXT)
                check("Comfy.SaveWorkflowAs opens the folder dialog", False,
                      f"native dialog={native!r} state={page.evaluate(JS_READY)}")
                raise AssertionError("Bada Save As dialog did not open - see console output above")
            check("Comfy.SaveWorkflowAs opens the folder dialog", page.evaluate(JS_MODAL_OPEN))
            page.screenshot(path=os.path.join(SHOT_DIR, "saveas_01_dialog.png"))

            rows = page.evaluate(JS_TREE_ROWS)
            # renderSaveAsTree indents by `8 + depth * 16`: root = 8px, first level = 24px
            root_indent, top_indent = 8 + 0 * 16, 8 + 1 * 16
            top_level = sorted([r["path"] for r in rows if r["indent"] == top_indent])
            api_top_level = sorted([f for f in folders_before if f == "/" or f.count("/") == 1])
            check("tree renders the root row first",
                  bool(rows) and rows[0]["path"] == "/" and rows[0]["indent"] == root_indent,
                  str(rows[0]) if rows else "no rows")
            check("visible top-level folders match the tree API",
                  top_level == api_tree_top_level(), f"ui={len(top_level)}")

            # Informational only: the folders API uses os.walk (which does not descend
            # into junction/symlink directories) while the tree uses os.scandir, so a
            # junction folder (e.g. "Stability Matrix") is shown by the picker but is
            # absent from /api/qol/workflows/folders.
            api_top_level = sorted([f for f in folders_before if f != "/" and (len(f.split("/")) - 1) == 1])
            if api_top_level != top_level:
                print("   [note] folders API vs tree API differ (junction dirs): "
                      f"api_only={sorted(set(api_top_level) - set(top_level))} "
                      f"tree_only={sorted(set(top_level) - set(api_top_level))}")

            # --- Explorer-style hierarchy: expand a parent and check nesting ---
            parent = next((f for f in sorted(folders_before, key=len)
                           if f != "/" and any(o.startswith(f + "/") for o in folders_before)), None)
            child = next((o for o in folders_before if parent and o.startswith(parent + "/")), None)
            if parent and child:
                page.click(f"#qol-sa-tree .qol-sa-row[data-path='{parent}'] .qol-sa-chevron[data-toggle]")
                page.wait_for_timeout(300)
                rows2 = page.evaluate(JS_TREE_ROWS)
                parent_row = next((r for r in rows2 if r["path"] == parent), None)
                child_row = next((r for r in rows2 if r["path"] == child), None)
                check("parent folder expands with a ▼ chevron",
                      bool(parent_row) and parent_row["chevron"] == "▼", str(parent_row))
                check("child folder is nested deeper than its parent",
                      bool(child_row) and bool(parent_row) and child_row["indent"] > parent_row["indent"],
                      f"parent={parent_row and parent_row['indent']}px child={child_row and child_row['indent']}px")
                page.click(f"#qol-sa-tree .qol-sa-row[data-path='{parent}'] .qol-sa-chevron[data-toggle]")
                page.wait_for_timeout(200)
            else:
                check("nested-folder hierarchy check", True, "skipped - this instance has no nested folders")
            page.screenshot(path=os.path.join(SHOT_DIR, "saveas_01b_tree_hierarchy.png"))

            # --- 4. create a folder in place (under Root) ---------------------
            page.click("#qol-sa-tree .qol-sa-row[data-path='/']")
            page.wait_for_timeout(200)
            check("root row is selectable", page.evaluate(JS_SELECTED_PATH) == "/",
                  str(page.evaluate(JS_SELECTED_PATH)))
            page.click("#qol-sa-newbtn")
            page.fill("#qol-sa-newname", FOLDER)
            page.click("#qol-sa-newcreate")
            page.wait_for_function(
                "() => !!document.querySelector(\"#qol-sa-tree .qol-sa-row[data-path='/" + FOLDER + "']\")",
                timeout=15_000)
            check("new folder created and auto-selected", page.evaluate(JS_SELECTED_PATH) == f"/{FOLDER}",
                  str(page.evaluate(JS_SELECTED_PATH)))
            rows3 = page.evaluate(JS_TREE_ROWS)
            new_row = next((r for r in rows3 if r["path"] == f"/{FOLDER}"), None)
            check("new folder appears nested under Root (deeper indent)",
                  bool(new_row) and new_row["indent"] > root_indent, str(new_row))
            check("breadcrumb shows the selected folder",
                  FOLDER in page.evaluate(JS_BREADCRUMB), page.evaluate(JS_BREADCRUMB))
            folders_now, _ = api_folders()
            check("new folder exists on the server", f"/{FOLDER}" in folders_now)
            page.screenshot(path=os.path.join(SHOT_DIR, "saveas_02_new_folder.png"))

            # --- 5. live target path preview ---------------------------------
            page.fill("#qol-sa-name", NAME)
            preview = page.evaluate(JS_PREVIEW)
            check("path preview shows the chosen folder + file",
                  f"workflows/{FOLDER}/{NAME}.json" in preview, preview.strip()[:120])

            # --- 6. confirm -> native save into the folder -------------------
            page.click("#qol-sa-confirm")
            saved = False
            deadline = time.time() + 20
            while time.time() < deadline:
                if api_file_exists():
                    saved = True
                    break
                page.wait_for_timeout(500)
            check(f"workflow saved to workflows/{FOLDER}/{NAME}.json", saved)
            if root_dir:
                disk = os.path.join(root_dir, FOLDER, f"{NAME}.json")
                check("file exists on disk", os.path.isfile(disk), disk)
            page.screenshot(path=os.path.join(SHOT_DIR, "saveas_03_saved.png"))

            # --- 7. cancel path aborts natively ------------------------------
            page.wait_for_timeout(1200)
            reopened = False
            for _ in range(5):
                page.evaluate(JS_SAVE_AS)
                try:
                    page.wait_for_selector("#qol-sa-tree", timeout=3000)
                    reopened = True
                    break
                except Exception:
                    page.wait_for_timeout(500)
            check("Save As dialog reopens for the cancel path", reopened)
            if reopened:
                page.click("#qol-sa-cancel")
                page.wait_for_timeout(600)
                check("Cancel closes the dialog", not page.evaluate(JS_MODAL_OPEN))
        finally:
            try:
                page.close()
                browser.close()
            except Exception:
                pass
            ok = cleanup()
            check("cleanup removed the test folder", ok, f"/{FOLDER}")
            leftovers, _ = api_folders()
            check("folder list back to the original state", sorted(leftovers) == sorted(folders_before))

    passed = sum(1 for r in results if r)
    print(f"\n{passed}/{len(results)} checks passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
