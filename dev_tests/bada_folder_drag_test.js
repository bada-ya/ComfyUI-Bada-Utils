/**
 * Drag & drop verification for the Workflow+ sidebar folder rows.
 *
 * Companion to dev_tests/bada_folder_rename_test.py (which drives the real REST handlers).
 * This one covers the *frontend* half of folder drag & drop: it loads the real
 * `WorkflowsPlusManager` class out of web/workflow_organizer.js and exercises the pure
 * path / state logic against a stubbed browser environment.
 *
 *   - splitSidebarPath()   folder rows carry a leading slash ("/A/B"), file rows do not
 *                          ("A/B.json") - the source of the old broken root-folder parent
 *   - moveWorkflowFolder() self / descendant refusal, no-op when already in place, the exact
 *                          POST payload, and the state rebase after a successful move
 *   - rebaseSidebarStateAfterFolderMove()
 *                          expanded folders, bookmarks and the active workflow all follow the
 *                          folder to its new parent (a superset of the rename case)
 *
 * No browser and no running ComfyUI instance are required:
 *
 *   node dev_tests/bada_folder_drag_test.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO_ROOT = path.dirname(__dirname);
const SOURCE_FILE = path.join(REPO_ROOT, "web", "workflow_organizer.js");

const results = [];
function check(label, cond, info = "") {
    results.push(Boolean(cond));
    console.log(`[${cond ? "PASS" : "FAIL"}] ${label}` + (info ? ` :: ${info}` : ""));
}

// ---------------------------------------------------------------------------
// Load the real class out of the ES module (brace matching, no bundler needed)
// ---------------------------------------------------------------------------
const source = fs.readFileSync(SOURCE_FILE, "utf8");
const classStart = source.indexOf("class WorkflowsPlusManager");
if (classStart < 0) {
    console.log("[ABORT] could not find `class WorkflowsPlusManager` in web/workflow_organizer.js");
    process.exit(2);
}
let depth = 0;
let classEnd = -1;
for (let i = source.indexOf("{", classStart); i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
        depth--;
        if (depth === 0) { classEnd = i + 1; break; }
    }
}
if (classEnd < 0) {
    console.log("[ABORT] unbalanced braces while extracting the class");
    process.exit(2);
}

// ---------------------------------------------------------------------------
// Minimal browser stubs
// ---------------------------------------------------------------------------
const store = new Map();
const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
};
// `fetch` is a proxy onto a host-side handler: the class under test lives in the vm context,
// so reassigning `context.fetch` from here would not be visible to it.
let fetchHandler = async () => ({ ok: true, json: async () => ({}) });
// A tiny DOM stand-in: the class only needs data-kind / data-path attributes, a classList
// and `closest(".qol-bookmarks-container")` to resolve Shift ranges. showToast additionally
// needs createElement/body, so those live here too and are mutated in place (the vm holds a
// reference to this exact object).
const dom = { rows: [], toasts: [] };

function makeEl(tag) {
    return {
        tagName: tag, textContent: "", innerHTML: "", className: "", style: {},
        children: [], removed: false,
        append(...nodes) { this.children.push(...nodes); },
        appendChild(node) { this.children.push(node); return node; },
        remove() { this.removed = true; },
    };
}

const documentStub = {
    body: makeEl("body"),
    head: makeEl("head"),
    querySelector: () => null,
    querySelectorAll: (selector) => {
        if (selector.includes("qol-folder-row") || selector.includes("qol-file-row")) return dom.rows.slice();
        return [];
    },
    createElement: (tag) => {
        const el = makeEl(tag);
        if (tag === "div") dom.toasts.push(el);
        return el;
    },
    getElementById: () => null,
};

function makeRow(kind, path, section = "tree") {
    const classes = new Set();
    return {
        section,
        getAttribute: (name) => (name === "data-kind" ? kind : name === "data-path" ? path : null),
        classList: {
            add: (c) => classes.add(c),
            remove: (c) => classes.delete(c),
            contains: (c) => classes.has(c),
            toggle: (c, on) => {
                if (on === undefined) { classes.has(c) ? classes.delete(c) : classes.add(c); }
                else if (on) classes.add(c); else classes.delete(c);
            },
        },
        closest: (sel) => (sel === ".qol-bookmarks-container" && section === "bookmarks" ? {} : null),
    };
}

// Mirrors web/bada_shared.js: the class delegates escapeHtml() to that imported binding,
// so the vm needs an equivalent free variable for showToast() to be testable at all.
const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    localStorage,
    window: {},
    document: documentStub,
    FONT_SIZE_PRESETS: [{ name: "a" }, { name: "b" }, { name: "c" }, { name: "d" }, { name: "e" }],
    BadaI18n: { lang: "en", t: (k) => k },
    app: { graph: {} },
    escapeHtml,
    fetch: (...args) => fetchHandler(...args),
});
vm.runInContext(`${source.slice(classStart, classEnd)}\nglobalThis.__Manager = WorkflowsPlusManager;`, context);
const Manager = context.__Manager;

const toasts = [];
const requests = [];

function makeManager() {
    const mgr = new Manager();
    mgr.showToast = (msg, isError = false) => { toasts.push({ msg, isError }); };
    mgr.loadTree = async () => { mgr.treeData = mgr.treeData || {}; };
    mgr.saveFavorites = async () => { mgr.savedFavorites = true; };
    mgr.fetchImpl = async (url, init) => {
        requests.push({ url, init, body: JSON.parse(init.body) });
        return { json: async () => ({ success: true, new_path: "SERVER_PATH" }) };
    };
    return mgr;
}

async function callMove(mgr, sourcePath, target) {
    fetchHandler = mgr.fetchImpl;
    try {
        return await mgr.moveWorkflowFolder(sourcePath, target);
    } finally {
        fetchHandler = async () => ({ ok: true, json: async () => ({}) });
    }
}


(async () => {
    console.log("\n--- 1. splitSidebarPath: folder rows keep a leading slash -------");
    {
        const m = makeManager();
        let r = m.splitSidebarPath("/A/B");
        check("SPLIT-NESTED-FOLDER", r.parent === "/A" && r.name === "B", JSON.stringify(r));
        r = m.splitSidebarPath("/A");
        check("SPLIT-ROOT-FOLDER", r.parent === "/" && r.name === "A", JSON.stringify(r));
        r = m.splitSidebarPath("A/B.json");
        check("SPLIT-NESTED-FILE", r.parent === "/A" && r.name === "B.json", JSON.stringify(r));
        r = m.splitSidebarPath("B.json");
        check("SPLIT-ROOT-FILE", r.parent === "/" && r.name === "B.json", JSON.stringify(r));
        r = m.splitSidebarPath("/A/B/");
        // A trailing separator must not produce an empty name: it is just a sloppy path.
        check("SPLIT-TRAILING-SLASH", r.parent === "/A" && r.name === "B", JSON.stringify(r));
    }

    console.log("\n--- 2. moveWorkflowFolder guards ---------------------------------");
    let m = makeManager();
    toasts.length = 0; requests.length = 0;
    check("MOVE-SAME-FOLDER-NOOP", (await callMove(m, "/A", "/A")) === false && requests.length === 0);

    m = makeManager();
    toasts.length = 0; requests.length = 0;
    check("MOVE-INTO-ITSELF-REFUSED", (await callMove(m, "/A", "/A/B")) === false && requests.length === 0,
        JSON.stringify(toasts));
    check("MOVE-INTO-ITSELF-TOAST-IS-ERROR", toasts.length === 1 && toasts[0].isError === true);

    m = makeManager();
    toasts.length = 0; requests.length = 0;
    check("MOVE-INTO-DESCENDANT-REFUSED", (await callMove(m, "/A", "/A/B/C")) === false && requests.length === 0);

    // "/AB" must NOT count as a descendant of "/A" (shared prefix, no separator).
    m = makeManager();
    toasts.length = 0; requests.length = 0;
    await callMove(m, "/A", "/AB");
    check("MOVE-UNRELATED-PREFIX-ALLOWED", requests.length === 1, JSON.stringify(requests.map(r => r.body)));

    console.log("\n--- 3. moveWorkflowFolder request payload ------------------------");
    m = makeManager();
    toasts.length = 0; requests.length = 0;
    check("MOVE-RETURNS-TRUE", (await callMove(m, "/A", "/B")) === true);
    check("MOVE-ONE-REQUEST", requests.length === 1, JSON.stringify(requests));
    const sent = requests[0];
    check("MOVE-URL", sent.url === "/api/qol/workflows/move", sent.url);
    check("MOVE-METHOD", sent.init.method === "POST", sent.init.method);
    check("MOVE-SOURCE", sent.body.source_path === "/A", JSON.stringify(sent.body));
    check("MOVE-TARGET", sent.body.target_folder === "/B", JSON.stringify(sent.body));
    check("MOVE-EMPTY-NAME-KEEPS-FOLDER-NAME", sent.body.new_name === "", JSON.stringify(sent.body));
    check("MOVE-NO-OVERWRITE", sent.body.overwrite === false, JSON.stringify(sent.body));
    check("MOVE-SUCCESS-TOAST", toasts.some(t => t.isError === false), JSON.stringify(toasts));

    m = makeManager();
    toasts.length = 0; requests.length = 0;
    await callMove(m, "/A/B", "/");
    check("MOVE-TO-ROOT-TARGET", requests.length === 1 && requests[0].body.target_folder === "/",
        JSON.stringify(requests.map(r => r.body)));

    m = makeManager();
    toasts.length = 0; requests.length = 0;
    m.fetchImpl = async (url, init) => {
        requests.push({ url, body: JSON.parse(init.body) });
        return { json: async () => ({ success: false, error: "boom" }) };
    };
    check("MOVE-SERVER-ERROR-RETURNED", (await callMove(m, "/A", "/B")) === false);
    check("MOVE-SERVER-ERROR-TOAST", toasts.some(t => t.isError === true && t.msg === "boom"), JSON.stringify(toasts));


    console.log("\n--- 4. rebaseSidebarStateAfterFolderMove (drag, not rename) -----");
    m = makeManager();
    m.expandedFolders = new Set(["/A", "/A/sub", "/A/sub/deep", "/Keep", "/AB"]);
    m.favorites = new Set(["A/w1.json", "A/sub/w2.json", "Keep/w3.json", "AB/w4.json"]);
    m.activeWorkflowPath = "A/sub/w2.json";
    m.activeWorkflowName = "w2";
    await m.rebaseSidebarStateAfterFolderMove("/A", "/B/A");

    const ex = m.expandedFolders;
    check("REBASE-EXPANDED-SELF", ex.has("/B/A"), Array.from(ex).join(", "));
    check("REBASE-EXPANDED-NESTED", ex.has("/B/A/sub") && ex.has("/B/A/sub/deep"), Array.from(ex).join(", "));
    check("REBASE-EXPANDED-OLD-GONE", !ex.has("/A") && !ex.has("/A/sub") && !ex.has("/A/sub/deep"));
    check("REBASE-EXPANDED-UNRELATED-KEPT", ex.has("/Keep") && ex.has("/AB"), Array.from(ex).join(", "));
    check("REBASE-EXPANDED-NEW-PARENT-OPEN", ex.has("/B") || ex.has("B"), Array.from(ex).join(", "));

    const fav = m.favorites;
    check("REBASE-FAV-TOP", fav.has("B/A/w1.json"), Array.from(fav).join(", "));
    check("REBASE-FAV-NESTED", fav.has("B/A/sub/w2.json"), Array.from(fav).join(", "));
    check("REBASE-FAV-UNRELATED-KEPT", fav.has("Keep/w3.json") && fav.has("AB/w4.json"), Array.from(fav).join(", "));
    check("REBASE-FAV-SYNCHRONISED", m.savedFavorites === true);

    check("REBASE-ACTIVE-PATH", m.activeWorkflowPath === "B/A/sub/w2.json", m.activeWorkflowPath);
    check("REBASE-ACTIVE-NAME", m.activeWorkflowName === "w2", m.activeWorkflowName);
    check("REBASE-ACTIVE-PERSISTED", localStorage.getItem("qol_active_workflow_path") === "B/A/sub/w2.json");

    // Rename (same parent) keeps working through the very same helper.
    m = makeManager();
    m.expandedFolders = new Set(["/A/sub"]);
    m.favorites = new Set(["A/w.json"]);
    m.activeWorkflowPath = "A/w.json";
    await m.rebaseSidebarStateAfterFolderMove("/A", "/Renamed");
    check("REBASE-RENAME-SAME-PARENT", m.expandedFolders.has("/Renamed/sub") && m.favorites.has("Renamed/w.json"),
        `${Array.from(m.expandedFolders).join(", ")} | ${Array.from(m.favorites).join(", ")}`);

    // Nothing under the moved folder -> no favourites sync, no active-workflow churn.
    m = makeManager();
    m.expandedFolders = new Set(["/Keep"]);
    m.favorites = new Set(["Keep/w.json"]);
    m.activeWorkflowPath = "Keep/w.json";
    m.savedFavorites = false;
    await m.rebaseSidebarStateAfterFolderMove("/A", "/B/A");
    check("REBASE-NOOP-UNRELATED", !m.savedFavorites && m.activeWorkflowPath === "Keep/w.json",
        `${m.savedFavorites} ${m.activeWorkflowPath}`);

    console.log("\n--- 5. multi-select: Ctrl / Shift click semantics ------------------");
    {
        const rows = [
            makeRow("folder", "/A"),
            makeRow("file", "A/w1.json"),
            makeRow("file", "A/w2.json"),
            makeRow("folder", "/B"),
            makeRow("file", "B/w3.json"),
        ];
        dom.rows = rows;
        let opens = 0;
        const m = makeManager();
        m.setSelection([], null);
        const plain = () => { opens++; };

        m.handleRowClick({ stopPropagation() {}, ctrlKey: false, shiftKey: false }, "folder", "/A", plain);
        check("MS-PLAIN-RUNS-DEFAULT", opens === 1, `opens=${opens}`);
        check("MS-PLAIN-SELECTS-SINGLE", m.selection.size === 1 && m.isSelected("folder", "/A"),
            [...m.selection].join(", "));

        m.handleRowClick({ stopPropagation() {}, ctrlKey: true, shiftKey: false }, "file", "A/w1.json", plain);
        check("MS-CTRL-DOES-NOT-OPEN", opens === 1, `opens=${opens}`);
        check("MS-CTRL-ADDITIVE", m.selection.size === 2 && m.isSelected("folder", "/A") && m.isSelected("file", "A/w1.json"),
            [...m.selection].join(", "));

        m.handleRowClick({ stopPropagation() {}, ctrlKey: true, shiftKey: false }, "file", "A/w1.json", plain);
        check("MS-CTRL-TOGGLES-OFF", m.selection.size === 1 && !m.isSelected("file", "A/w1.json"),
            [...m.selection].join(", "));

        // Range anchors are workflows: folder rows are skipped by the range entirely.
        m.setSelection(["file:A/w1.json"], "file:A/w1.json");
        m.handleRowClick({ stopPropagation() {}, ctrlKey: false, shiftKey: true }, "file", "A/w2.json", plain);
        check("MS-SHIFT-DOES-NOT-OPEN", opens === 1, `opens=${opens}`);
        check("MS-SHIFT-RANGE", m.selection.size === 2 &&
            m.isSelected("file", "A/w1.json") && m.isSelected("file", "A/w2.json"),
            [...m.selection].join(", "));

        m.setSelection(["file:A/w1.json"], "file:A/w1.json");
        m.handleRowClick({ stopPropagation() {}, ctrlKey: false, shiftKey: true }, "file", "B/w3.json", plain);
        check("MS-SHIFT-RANGE-FORWARD", m.selection.size === 3, [...m.selection].join(", "));
        check("MS-SHIFT-RANGE-EXCLUDES-FOLDERS",
            !m.isSelected("folder", "/A") && !m.isSelected("folder", "/B"), [...m.selection].join(", "));

        m.setSelection(["file:A/w1.json"], "file:A/w1.json");
        m.handleRowClick({ stopPropagation() {}, ctrlKey: false, shiftKey: true }, "file", "A/w2.json", plain);
        m.handleRowClick({ stopPropagation() {}, ctrlKey: false, shiftKey: true }, "file", "B/w3.json", plain);
        // The anchor stays where it was, so a second Shift+Click re-ranges from the same start.
        check("MS-SHIFT-ANCHOR-PERSISTS", m.selection.size === 3, [...m.selection].join(", "));

        // A folder cannot be a range anchor either — the Shift+Click just picks that workflow.
        m.setSelection(["folder:A"], "folder:A");
        m.handleRowClick({ stopPropagation() {}, ctrlKey: false, shiftKey: true }, "file", "B/w3.json", plain);
        check("MS-SHIFT-FROM-FOLDER-ANCHOR-SELECTS-ONE",
            m.selection.size === 1 && m.isSelected("file", "B/w3.json"), [...m.selection].join(", "));

        m.setSelection(["folder:A", "file:A/w1.json", "file:A/w2.json"], "file:A/w2.json");
        m.applySelectionHighlight();
        check("MS-HIGHLIGHT-APPLIED",
            rows[0].classList.contains("qol-selected") && rows[1].classList.contains("qol-selected") &&
            !rows[3].classList.contains("qol-selected"));
        m.clearSelection();
        check("MS-CLEAR-REMOVES-HIGHLIGHT", !rows[0].classList.contains("qol-selected") && m.selection.size === 0);

        // Bookmarks and the tree are separate lists: a range must not cross the boundary.
        dom.rows = [makeRow("file", "A/w1.json", "bookmarks"), makeRow("folder", "/A")];
        m.setSelection(["file:A/w1.json"], "file:A/w1.json");
        m.selectRangeTo("folder:A");
        check("MS-RANGE-STOPPED-AT-SECTION", m.selection.size === 1 && m.isSelected("folder", "/A"),
            [...m.selection].join(", "));
    }

    console.log("\n--- 5b. folders never join a multi-selection ----------------------");
    {
        // A/1, folder A, A/2, A/3 — a plain range would swallow the folder row.
        const rows = [
            makeRow("file", "A/1.json"),
            makeRow("folder", "/A"),
            makeRow("file", "A/2.json"),
            makeRow("file", "A/3.json"),
        ];
        dom.rows = rows;
        let opens = 0;
        const m = makeManager();
        m.setSelection([], null);
        const plain = () => { opens++; };
        const noMod = { stopPropagation() {}, ctrlKey: false, shiftKey: false };

        m.handleRowClick(noMod, "file", "A/1.json", plain);
        m.handleRowClick({ stopPropagation() {}, ctrlKey: false, shiftKey: true }, "file", "A/3.json", plain);
        check("MS-RANGE-SKIPS-FOLDER-ROW", m.selection.size === 3 && !m.isSelected("folder", "/A"),
            [...m.selection].join(", "));
        check("MS-RANGE-IS-WORKFLOWS-ONLY",
            [...m.selection].every(k => k.startsWith("file:")), [...m.selection].join(", "));

        // Ctrl on a folder narrows the selection to that folder and nothing else.
        m.setSelection(["file:A/1.json", "file:A/2.json", "file:A/3.json"], "file:A/3.json");
        m.handleRowClick({ stopPropagation() {}, ctrlKey: true, shiftKey: false }, "folder", "/A", plain);
        check("MS-CTRL-FOLDER-COLLAPSES-SELECTION",
            m.selection.size === 1 && m.isSelected("folder", "/A"), [...m.selection].join(", "));
        check("MS-CTRL-FOLDER-NO-DEFAULT-ACTION", opens === 1, `opens=${opens}`);

        // Shift on a folder behaves the same way.
        m.setSelection(["file:A/1.json", "file:A/2.json"], "file:A/2.json");
        m.handleRowClick({ stopPropagation() {}, ctrlKey: false, shiftKey: true }, "folder", "/A", plain);
        check("MS-SHIFT-FOLDER-COLLAPSES-SELECTION",
            m.selection.size === 1 && m.isSelected("folder", "/A"), [...m.selection].join(", "));
        check("MS-SHIFT-FOLDER-NO-DEFAULT-ACTION", opens === 1, `opens=${opens}`);

        // A plain click on a folder still expands/collapses it.
        m.handleRowClick(noMod, "folder", "/A", plain);
        check("MS-PLAIN-FOLDER-STILL-RUNS-DEFAULT", opens === 2, `opens=${opens}`);

        // Folders can never stack up either.
        m.setSelection(["folder:A"], "folder:A");
        m.handleRowClick({ stopPropagation() {}, ctrlKey: true, shiftKey: false }, "folder", "/B", plain);
        check("MS-FOLDERS-NOT-STACKED", m.selection.size === 1 && m.isSelected("folder", "/B"),
            [...m.selection].join(", "));
    }

    console.log("\n--- 6. resolveDragEntries: what a drag actually carries -----------");
    {
        const m = makeManager();
        dom.rows = [];
        m.setSelection([], null);
        check("DRAG-UNSELECTED-CARRIES-ONE", m.resolveDragEntries("file", "A/w1.json").length === 1);

        m.setSelection(["file:A/w1.json", "file:A/w2.json"], "file:A/w2.json");
        const carried = m.resolveDragEntries("file", "A/w1.json");
        check("DRAG-SELECTED-CARRIES-ALL", carried.length === 2, JSON.stringify(carried));
        check("DRAG-CARRIES-ONLY-WORKFLOWS", carried.every(e => e.kind === "file"), JSON.stringify(carried));
        check("DRAG-ROUNDTRIP-PATHS",
            carried.some(e => e.path === "A/w1.json") && carried.some(e => e.path === "A/w2.json"),
            JSON.stringify(carried));

        // Safety net: a folder that slipped into a multi-selection must never be batched.
        m.setSelection(["file:A/w1.json", "folder:B", "file:A/w2.json"], "file:A/w1.json");
        const guarded = m.resolveDragEntries("file", "A/w1.json");
        check("DRAG-MIXED-SELECTION-FALLS-BACK-TO-ONE",
            guarded.length === 1 && guarded[0].path === "A/w1.json" && guarded[0].kind === "file",
            JSON.stringify(guarded));

        m.setSelection(["folder:A", "folder:B"], "folder:A");
        check("DRAG-FOLDER-SELECTION-FALLS-BACK-TO-ONE",
            m.resolveDragEntries("folder", "/A").length === 1);

        m.setSelection(["file:A/w1.json"], "file:A/w1.json");
        check("DRAG-LONE-SELECTION-CARRIES-ONE", m.resolveDragEntries("file", "A/w1.json").length === 1);
    }

    console.log("\n--- 7. moveSelectionToFolder: batch semantics --------------------");
    {
        // A folder can no longer reach this helper through the UI (handleRowClick /
        // resolveDragEntries both keep folders out of a multi-selection), so the entries
        // below are hand-built to prove the internal guards still hold if a future caller
        // ever hands it a mixed batch.
        const m = makeManager();
        dom.rows = [];
        toasts.length = 0; requests.length = 0;
        m.fetchImpl = async (url, init) => {
            const b = JSON.parse(init.body);
            requests.push(b);
            if (b.source_path === "/bad") return { json: async () => ({ success: false, error: "nope" }) };
            const parent = b.target_folder === "/" ? "" : b.target_folder.replace(/^\//, "");
            return {
                json: async () => ({
                    success: true,
                    new_path: `${parent ? `/${parent}/` : "/"}${b.source_path.split("/").pop()}`,
                }),
            };
        };

        const entries = [
            { kind: "file", path: "A/w1.json", key: "file:A/w1.json" },
            { kind: "file", path: "A/w2.json", key: "file:A/w2.json" },
            { kind: "folder", path: "/A", key: "folder:A" },
            { kind: "file", path: "A/deep/w3.json", key: "file:A/deep/w3.json" },
            { kind: "file", path: "/bad", key: "file:bad" },
            { kind: "file", path: "C/already.json", key: "file:C/already.json" },
        ];
        // `moveSelectionToFolder` posts through the context's `fetch` proxy, so arm it here
        // (callMove() does the same for the single-item helpers).
        fetchHandler = m.fetchImpl;
        const result = await m.moveSelectionToFolder(entries, "/C");
        fetchHandler = async () => ({ ok: true, json: async () => ({}) });

        const sentPaths = requests.map(r => r.source_path);
        // "/A" itself is a legitimate move to "/C/A" and carries A/w1, A/w2, A/deep/w3 with it.
        check("BATCH-FOLDER-IS-SENT", sentPaths.includes("/A"), `sent=${sentPaths.join(", ")}`);
        check("BATCH-NESTED-RIDES-ALONG", !sentPaths.includes("A/w1.json") && !sentPaths.includes("A/deep/w3.json"),
            `sent=${sentPaths.join(", ")}`);
        check("BATCH-ALREADY-IN-TARGET-SKIPPED", !sentPaths.includes("C/already.json"), `sent=${sentPaths.join(", ")}`);
        check("BATCH-REMAINING-SENT", sentPaths.length === 2, `sent=${sentPaths.join(", ")}`);
        check("BATCH-TARGET-IS-C", requests.every(r => r.target_folder === "/C"));
        check("BATCH-COUNTS", result.moved.length === 1 && result.failed.length === 1,
            `moved=${result.moved.length} failed=${result.failed.length}`);
        check("BATCH-SUMMARY-TOAST", toasts.some(t => t.isError === false && /\b1\b/.test(t.msg)),
            JSON.stringify(toasts));

        // A folder may never be dropped into its own subtree, nor onto itself.
        toasts.length = 0; requests.length = 0;
        fetchHandler = m.fetchImpl;
        await m.moveSelectionToFolder([{ kind: "folder", path: "/A" }], "/A/B");
        await m.moveSelectionToFolder([{ kind: "folder", path: "/A" }], "/A");
        fetchHandler = async () => ({ ok: true, json: async () => ({}) });
        check("BATCH-SELF-NESTING-SKIPPED", requests.length === 0, `sent=${requests.map(r => r.source_path).join(", ")}`);

        // A folder move must drag the selection with it.
        m.expandedFolders = new Set(["/A/sub"]);
        m.favorites = new Set(["A/w1.json"]);
        m.activeWorkflowPath = "";
        m.selection = new Set(["folder:A", "file:A/w1.json", "file:A/w2.json"]);
        m.selectionAnchor = "file:A/w2.json";
        await m.rebaseSidebarStateAfterFolderMove("/A", "/C/A");
        check("BATCH-SELECTION-FOLLOWS-FOLDER",
            m.isSelected("folder", "/C/A") && m.isSelected("file", "/C/A/w1.json") && m.isSelected("file", "/C/A/w2.json"),
            [...m.selection].join(", "));
        check("BATCH-ANCHOR-FOLLOWS", m.selectionAnchor === "file:C/A/w2.json", String(m.selectionAnchor));
    }

    console.log("\n--- 8. attachRowDragEvents wiring --------------------------------");
    check("DRAG-FN-EXPOSED", typeof Manager.prototype.attachRowDragEvents === "function");
    check("DRAG-FILE-ROW-WIRED", /attachRowDragEvents\(fileRow, file, "file"\)/.test(source),
        'both file row call sites must pass kind="file"');
    check("DRAG-FOLDER-ROW-WIRED", /attachRowDragEvents\(folderRow, folderNode, "folder"\)/.test(source));
    check("DRAG-OLD-FN-GONE", !/attachFileDragEvents/.test(source), "no stale attachFileDragEvents references");
    check("DRAG-CSS-GRAB-CURSOR", /\.qol-folder-row:not\(\.dragover\)\s*\{\s*cursor: grab/.test(source));
    check("DRAG-CSS-DRAGGING", /\.qol-folder-row\.dragging\s*\{\s*opacity: 0\.4/.test(source));
    check("DRAG-CSS-INVALID-TARGET", /\.drag-invalid/.test(source), "red refused-drop state must be styled");
    check("DRAG-FORBIDDEN-GUARD", /isForbiddenTarget/.test(source), "self/descendant targets must be refused client-side");

    console.log("\n--- 9. multi-select styling must not mimic the active workflow ----");
    {
        // Extracts the declaration block that follows `selector`.
        const blockOf = (selector) => {
            const start = source.indexOf(selector);
            if (start < 0) return null;
            const open = source.indexOf("{", start);
            let depth = 0;
            for (let i = open; i < source.length; i++) {
                if (source[i] === "{") depth++;
                else if (source[i] === "}") {
                    depth--;
                    if (depth === 0) return source.slice(open + 1, i);
                }
            }
            return null;
        };

        const selectedCss = blockOf(".qol-file-row.qol-selected");
        const nameCss = blockOf(".qol-folder-row.qol-selected .qol-folder-name");
        const activeCss = blockOf(".qol-file-row.active-workflow");
        check("CSS-SELECTED-BLOCK-EXISTS", selectedCss !== null);
        check("CSS-ACTIVE-BLOCK-EXISTS", activeCss !== null);

        // The original bug: the selection rule was a copy of the active-workflow palette.
        check("CSS-SELECTED-NOT-INDIGO",
            !/99,\s*102,\s*241|#818cf8|79,\s*70,\s*229/i.test(selectedCss || ""),
            (selectedCss || "").trim().replace(/\s+/g, " ").slice(0, 90));
        check("CSS-SELECTED-NO-GRADIENT", !/linear-gradient/i.test(selectedCss || ""));
        check("CSS-SELECTED-NO-BOLD", !/font-weight:\s*600/i.test(`${selectedCss} ${nameCss}`));
        check("CSS-SELECTED-NOT-WHITE-TEXT", !/#ffffff/i.test(nameCss || ""), (nameCss || "").trim());

        // Cascade order decides which of the two wins on a row that is both.
        const iHover = source.indexOf(".qol-file-row:hover {");
        const iSelected = source.indexOf(".qol-file-row.qol-selected");
        const iActive = source.indexOf(".qol-file-row.active-workflow {");
        check("CSS-ORDER-HOVER-SELECTED-ACTIVE",
            iHover >= 0 && iHover < iSelected && iSelected < iActive,
            `hover=${iHover} selected=${iSelected} active=${iActive}`);
    }

    console.log("\n--- 10. showToast escapes server-supplied text (XSS) -----------------");
    {
        const m = makeManager();
        delete m.showToast;                       // use the real implementation
        dom.toasts.length = 0;

        m.showToast("Source file not found: <img src=x onerror=alert(1)>", true);
        check("TOAST-CREATED", dom.toasts.length === 1, `created=${dom.toasts.length}`);
        check("TOAST-ESCAPES-MARKUP", !dom.toasts[0].innerHTML.includes("<img"), dom.toasts[0].innerHTML);
        check("TOAST-KEEPS-TEXT", dom.toasts[0].innerHTML.includes("&lt;img"), dom.toasts[0].innerHTML);

        m.showToast("Plain message");
        check("TOAST-PLAIN-UNAFFECTED", dom.toasts[1].innerHTML.includes("Plain message"),
            dom.toasts[1].innerHTML);
        m.showToast(12345);
        check("TOAST-HANDLES-NON-STRING", dom.toasts[2].innerHTML.includes("12345"),
            dom.toasts[2].innerHTML);

        // The escaping chain must exist in exactly one place in web/.
        const shared = require("fs").readFileSync(path.join(REPO_ROOT, "web", "bada_shared.js"), "utf8");
        const marker = '.replace(/&/g, "&amp;")';
        const holders = require("fs").readdirSync(path.join(REPO_ROOT, "web"))
            .filter((f) => f.endsWith(".js"))
            .filter((f) => require("fs").readFileSync(path.join(REPO_ROOT, "web", f), "utf8").includes(marker));
        check("ESCAPEHTML-SINGLE-SOURCE",
            holders.length === 1 && holders[0] === "bada_shared.js",
            `escaping chain found in: ${holders.join(", ") || "(none)"}`);
        check("ESCAPEHTML-EXPORTED", /export function escapeHtml\(/.test(shared));
    }

    console.log("\n--- 11. no permanent polling left behind -----------------------");
    {
        const core = require("fs").readFileSync(path.join(REPO_ROOT, "web", "bada_core.js"), "utf8");
        check("NO-POLL-IN-SETTINGS-UI", !/setInterval\(\s*\(\)\s*=>\s*\{\s*\n\s*const dialog = document\.querySelector/.test(core),
            "the 300ms dialog detector must not come back");
        check("DIALOG-WATCHER-EVENT-DRIVEN", /new MutationObserver\(attachIfDialogPresent\)/.test(core));
        check("ANCHOR-SELFHEAL-EVENT-DRIVEN", /removedNodes/.test(core),
            "anchor-icon repair must observe removals, not poll");

        check("RETRY-HELPER-EXISTS", source.includes("const retryUntilSatisfied = (fn, intervalMs"));
        check("RETRY-IS-SELF-TERMINATING",
            source.includes("if (ok || waited >= maxMs) {") && source.includes("clearInterval(timer)"),
            "the 2s/3s probes must stop once satisfied instead of running forever");
        check("PROBES-REPORT-SATISFIED",
            source.includes("return !!(tabsContainer && tabsContainer._qolObserved)"));

        // ---- POPUP MENUS STAY INSIDE THE VIEWPORT (2026-10-04) --------------------
        // Reported: right-clicking a workflow near the BOTTOM of the sidebar clipped the menu —
        // Rename was the last visible row and Delete was unreachable. Root cause was a hardcoded
        // guess, `Math.min(clientY, innerHeight - 180)`, against a menu that is ~300px tall, so
        // the clamp still left the lower half below the fold. Mid-list rows only looked correct
        // because the guess happened to leave room there, which is why it survived.
        //
        // The fix measures the real menu and flips it above the anchor when it would overflow.
        // These guards pin the WIRING, because the previous checks in this file all passed while
        // the menus were visibly broken.
        const live = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

        check("MENU-HELPER-EXISTS",
            /function placeMenuInViewport\(menu, anchorX, anchorY\)/.test(live)
            && /placePopupInViewport/.test(live),
            "the local wrapper must delegate to the shared helper, not reimplement it");
        check("MENU-HELPER-IN-SHARED-MODULE", (function () {
            const shared = require("fs").readFileSync(
                path.join(REPO_ROOT, "web", "bada_shared.js"), "utf8");
            return /export function placePopupInViewport\(/.test(shared)
                && /offsetWidth/.test(shared) && /offsetHeight/.test(shared)
                && /anchorY - h/.test(shared)
                && /anchorX - w/.test(shared);
        })(), "one shared implementation — that is what stops the next popup inventing its own constant");
        check("NO-DUPLICATE-VIEWPORT-HELPER",
            (live.match(/function placePopupInViewport/g) || []).length === 0,
            "the helper must live in bada_shared.js only");

        check("CONTEXT-MENU-USES-HELPER", /placeMenuInViewport\(menu, e\.clientX, e\.clientY\);/.test(live));
        check("FONT-MENU-USES-HELPER", /placeMenuInViewport\(menu, rect\.left \|\| e\.clientX/.test(live),
            "the font-size menu had no vertical clamp at all and ran off the bottom");

        // offsetWidth is 0 while an element is display:none, so measuring before showing it
        // silently yields 0 and falls through to the unclamped cursor position — the exact bug.
        check("MENUS-DISPLAYED-BEFORE-MEASURING", (function () {
            const ctx = live.slice(live.indexOf("showContextMenu(e, targetInfo)"));
            const disp = ctx.indexOf('menu.style.display = "block"');
            const place = ctx.indexOf("placeMenuInViewport(");
            return disp > -1 && place > -1 && disp < place;
        })());

        check("NO-HARDCODED-MENU-CLAMP", !/innerHeight\s*-\s*(1[0-9]{2}|[2-9][0-9]{2})/.test(live),
            "the -180 guess must not come back");

        // The hover preview card had the same disease: `estimatedHeight = 360` standing in for a
        // height that varies with the notes text and thumbnail.
        check("HOVER-CARD-MEASURES-HEIGHT", /const cardHeight = this\.hoverCardEl\.offsetHeight;/.test(live)
            && !live.includes("estimatedHeight"),
            "a long note makes the card taller than any fixed guess");

        // The canvas badge tooltip had NO clamp at all — it sat at the raw cursor offset, so a
        // node near the right/bottom edge pushed it off-screen and the text just vanished.
        const smartSrc = fs.readFileSync(path.join(REPO_ROOT, "web", "smart_presets.js"), "utf8");
        const smartLive = smartSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
        check("BADGE-TOOLTIP-CLAMPED", /placePopupInViewport\(tooltipElement,/.test(smartLive),
            "the badge tooltip must clamp like every other popup");
        check("BADGE-TOOLTIP-VISIBLE-BEFORE-MEASURING", (function () {
            const fn = smartLive.slice(smartLive.indexOf("function showTooltip("));
            const act = fn.indexOf('tooltipElement.classList.add("active")');
            const place = fn.indexOf("placePopupInViewport(");
            return act > -1 && place > -1 && act < place;
        })(), "offsetWidth reads 0 while hidden, so the clamp would silently do nothing");

        // The note-helper translate-button tooltip (2026-10-04). Reported as "클릭: 번..." with
        // the sentence truncated when the button sat near the right edge. Unlike the popups above
        // it could not simply be flipped: `white-space: nowrap` on a long bilingual string meant a
        // single line never fits near an edge, so it needed wrapping as well.
        const noteSrc = fs.readFileSync(path.join(REPO_ROOT, "web", "bada_note_helper.js"), "utf8");
        const noteLive = noteSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
        check("NOTE-TOOLTIP-NO-RAW-OFFSET", !/style\.left = `\$\{x \+ 12\}px`/.test(noteLive),
            "the unclamped `x + 12, y + 12` placement must not come back");
        check("NOTE-TOOLTIP-WRAPS-WHEN-EDGE", /whiteSpace = "normal"/.test(noteLive)
            && /const roomLeft = Math\.max\(160,/.test(noteLive),
            "wrapping must be bounded by the room actually available on the side we flip to");
        check("NOTE-TOOLTIP-RESETS-WRAP", /whiteSpace = "nowrap"/.test(noteLive)
            && /el\.style\.maxWidth = `\$\{TOOLTIP_MAX_WIDTH\}px`/.test(noteLive),
            "a narrow maxWidth from a previous hover must not persist into a roomier one");
        check("NOTE-TOOLTIP-MEASURES-FINAL-FORM", /const naturalWidth = el\.offsetWidth;/.test(noteLive)
            && /const w = el\.offsetWidth;/.test(noteLive),
            "measure unwrapped to decide, then re-measure the wrapped form before placing");
        check("NOTE-TOOLTIP-VISIBLE-BEFORE-MEASURING", (function () {
            const fn = noteLive.slice(noteLive.indexOf("function showTooltip("));
            const vis = fn.indexOf('el.style.opacity = "1"');
            const place = fn.indexOf("measureAndClampTooltip(");
            return vis > -1 && place > -1 && vis < place;
        })(), "opacity:0 still lays out (unlike display:none), but measuring first is still wrong");
        check("NOTE-TOOLTIP-BOUNDED-WIDTH", /const TOOLTIP_MAX_WIDTH = \d+;/.test(noteLive),
            "an unwrapped wrap would sprawl across the canvas on a wide monitor");
    }

    const passed = results.filter(Boolean).length;
    console.log(`\n=== ${passed}/${results.length} checks passed ===`);
    if (passed !== results.length) {
        console.log("RESULT: FAIL");
        process.exit(1);
    }
    console.log("RESULT: PASS");
})();
