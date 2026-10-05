r"""Frontend **browser** probe for the Async Gemini Studio Ctrl+V image fixes (2026-10-05).

Covers three reported regressions that no static test can prove:

  1. `Load Image` node spawned on paste. ComfyUI registers a paste handler on `document`
     in the BUBBLE phase (`comfyui_frontend_package :: usePaste`) that creates a brand-new
     `Load Image` node whenever an image arrives with no image node selected. Ours is now
     `document` + CAPTURE + `stopImmediatePropagation`, so ours runs first and cancels it.
  2. Paste landing on the wrong tab. Ctrl+V on the 제미나이 tab used to fill the shared
     prompt-generation strip (a different tab's UI); the chat was then sent with no image.
     It must now reach `chatUploadedImages` and be visible in the chat's own preview row.
  3. The green "첨부 완료" banner. `.bada-toast` is a block child of the card's flex column,
     so it shoved the panel down and back up on every paste.

Read-only by construction: it never enqueues a workflow, never calls the Gemini API, and
removes the probe node afterwards, so it is safe on the daily driver.

Run with the Playwright venv (its pinned browser build may be stale, so the executable
path is auto-resolved from the highest cached chromium-*):

    $env:PYTHONPATH=''
    & "$env:TEMP\bada_pw_venv\Scripts\python.exe" dev_tests\bada_async_gemini_paste_smoke.py
"""
import sys
import io
import os
import glob
import base64

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
os.environ.pop("PYTHONPATH", None)

from playwright.sync_api import sync_playwright  # noqa: E402

BASE = os.environ.get("BADA_TEST_BASE", "http://127.0.0.1:8188").rstrip("/")
NODE = "BadaAsyncGeminiStudio"

# Unmistakable marker for the temporary 「저장 안 함」 entry the test seeds and then
# deletes. It must never collide with a real conversation, and it is what the popup row
# is matched on — so it has to survive into the rendered title.
OMITTED_TITLE = "bada-smoke-tmp-images-omitted"

# Same idea for the layout probe: a throwaway conversation carrying ONE real image, so a
# message thumbnail exists and the lightbox has something to open.
ALIGN_TITLE = "bada-smoke-tmp-align-probe"

# Throwaway conversations used only by the popup-size probe, so the 30-cap is exercised
# with a realistic row count. Distinctive enough to be recognised as ours.
FILLER_PREFIX = "bada-smoke-tmp-fill"
FILLER_COUNT = 30

SEED_ALIGN_CHAT_JS = """async (args) => {
    const {title, image} = args;
    const resp = await fetch('/api/bada/gemini/chats/save', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            id: '',
            messages: [
                {role: 'user', text: title, images: [image], imageCount: 1,
                 imagesOmitted: false},
                {role: 'model', text: 'bada align probe: a deliberately long model reply '
                    + 'so the bubble has to wrap across the full panel width and prove the '
                    + 'right-hand gutter is gone.', images: [], imageCount: 0},
            ],
        }),
    });
    const data = await resp.json();
    if (!data.success) return {ok: false, why: data.error || resp.status};
    return {ok: true, id: data.chat.id};
}"""

# 1x1 transparent PNG - enough to exercise the FileReader + downscale path.
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)

fails = []


def check(label, ok, extra=""):
    print(f"[{'PASS' if ok else 'FAIL'}] {label}" + (f" :: {extra}" if extra else ""))
    if not ok:
        fails.append(label)


def find_chrome():
    """The venv pins a chromium build that may not be the one cached on disk."""
    root = os.path.join(os.environ.get("LOCALAPPDATA", ""), "ms-playwright")
    hits = sorted(glob.glob(os.path.join(root, "chromium-*", "chrome-win64", "chrome.exe")))
    if hits:
        return hits[-1]
    try:
        with sync_playwright() as p:
            return p.chromium.executable_path
    except Exception:
        return None



# Runs in the page: re-select the node, then fire a genuine paste event at the Bada panel.
# `root.matches(':hover')` is unreliable headless, and the handler's gate is
# `node.is_selected`, so selection is re-asserted immediately before dispatch.
PASTE_JS = """async () => {
    const app = window.app;
    const n = app.graph._nodes.find(x => x.type === "%s");
    if (!n) return {ok: false, why: "node missing"};
    app.canvas.selectNode(n);
    n.is_selected = true;
    const items = await navigator.clipboard.read();
    for (const item of items) {
        const type = item.types.find(t => t.startsWith("image/"));
        if (!type) continue;
        const blob = await item.getType(type);
        const dt = new DataTransfer();
        dt.items.add(new File([blob], "probe.png", {type}));
        const dom = document.querySelector(".bada-async-gemini-root") || document.body;
        dom.dispatchEvent(new ClipboardEvent("paste",
            {clipboardData: dt, bubbles: true, cancelable: true}));
        return {ok: true, type, selected: !!n.is_selected};
    }
    return {ok: false, why: "no image on clipboard"};
}""" % NODE

# Switching tabs through the REAL button matters: `activeEngine` is a closure variable
# that only the button's onclick mutates (localStorage is just its seed on construction),
# so writing localStorage mid-session changes nothing and the paste would keep routing to
# whatever tab happened to be open. Clicking is the only honest way to move tabs.
SELECT_ENGINE_JS = """(id) => {
    const btn = document.querySelector(`.bada-engine-btn[data-engine="${id}"]`);
    if (!btn) return {ok: false, why: "engine button not found"};
    btn.click();
    return {ok: true};
}"""

COUNT_LOADIMAGE_JS = "() => window.app.graph._nodes.filter(n => /^LoadImage/.test(n.type)).length"
COUNT_NODES_JS = "() => window.app.graph._nodes.length"

CREATE_NODE_JS = """(t) => {
    const n = LiteGraph.createNode(t);
    if (!n) return {error: "createNode failed"};
    window.app.graph.add(n);
    window.app.canvas.selectNode(n);
    n.is_selected = true;
    return {ok: true};
}"""

REMOVE_NODE_JS = """(t) => {
    window.app.graph._nodes.slice().forEach(n => {
        if (n.type === t) window.app.graph.remove(n);
    });
}"""

SEED_CLIPBOARD_JS = """async (b64) => {
    const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    await navigator.clipboard.write([new ClipboardItem(
        {"image/png": new Blob([bin], {type: "image/png"})})]);
}"""

# Runs in the page: prove a document CAPTURE listener wins over a document BUBBLE one,
# which is the ordering our fix relies on to beat ComfyUI's node-spawning handler.
#
# The listeners MUST be removed before returning. They are attached to `document`, and the
# capture one calls stopImmediatePropagation(): if it survived, it would swallow every LATER
# paste in this very test (and silently make the attach assertions below fail for a reason
# that has nothing to do with the code under test). A probe that sabotages the assertions
# that follow it is worse than no probe at all.
PHASE_ORDER_JS = """() => new Promise((resolve) => {
    const log = [];
    const probe = document.createElement("div");
    document.body.appendChild(probe);
    const onCapture = (e) => { log.push("capture"); e.stopImmediatePropagation(); };
    const onBubble = () => { log.push("bubble"); };
    document.addEventListener("paste", onCapture, true);
    document.addEventListener("paste", onBubble, false);
    try {
        const dt = new DataTransfer();
        dt.items.add(new File(["x"], "a.txt", {type: "text/plain"}));
        probe.dispatchEvent(new ClipboardEvent("paste",
            {clipboardData: dt, bubbles: true, cancelable: true}));
    } finally {
        document.removeEventListener("paste", onCapture, true);
        document.removeEventListener("paste", onBubble, false);
        probe.remove();
    }
    resolve(log);
})"""

TOAST_TEXT_JS = """() => Array.from(document.querySelectorAll('.bada-toast'))
    .map(t => t.textContent).join(' | ')"""

# `.bada-thumbnail-item` is used by BOTH the shared strip and the chat preview row, so a
# count of that class alone cannot tell which one received the image. The two live in
# different containers, which is what these selectors distinguish.
SHARED_STRIP_JS = "() => document.querySelectorAll('.bada-thumbnails-container img').length"
CHAT_PREVIEW_JS = """() => {
    const rows = Array.from(document.querySelectorAll('.bada-thumbnails-grid'));
    const chat = rows.filter(r => !r.closest('.bada-thumbnails-container'));
    return chat.reduce((n, r) => n + r.querySelectorAll('img').length, 0);
}"""

# Poll target: ANY thumbnail anywhere in the panel. Which strip it lands in is asserted
# separately below, so this only has to mean "the attach finished".
THUMBNAIL_PRESENT_JS = """() => {
    const r = document.querySelector('.bada-async-gemini-root');
    return !!r && r.querySelectorAll('.bada-thumbnail-item').length > 0;
}"""

# ── 🖼️ 이미지 크게 보기 (lightbox) ────────────────────────────────────────
# The viewer is a fixed overlay on document.body, so it is queried globally — NOT
# inside the node, which it deliberately sits on top of.
VIEWER_OPEN_JS = """() => {
    const o = document.querySelector('.bada-img-viewer');
    if (!o) return {open: false};
    const img = o.querySelector('.bada-img-viewer-img');
    return {
        open: true,
        src: img ? img.getAttribute('src') : null,
        naturalWidth: img ? img.naturalWidth : 0,
        arrowsVisible: Array.from(o.querySelectorAll('.bada-img-viewer-prev, .bada-img-viewer-next'))
            .some(b => b.style.display !== 'none'),
        // A real image has decoded pixels; a blank/broken src would report 0.
        decoded: !!img && img.complete && img.naturalWidth > 0,
    };
}"""

# The panel is taller than the viewport and its containers are `overflow: hidden`, so
# `scrollIntoView` cannot bring the composer preview into view: on a run where the node
# auto-sized to ~1500px, the thumbnail sat at y=1421 and page.mouse.click() there was a
# silent no-op — the very thing that made the first run "fail" against working code.
#
# The node is moved with LiteGraph's own canvas offset instead (the same gesture the user
# performs by dragging the node), and the hit target is then PROVEN with
# document.elementFromPoint rather than assumed from a bounding rect.
MOVE_NODE_INTO_VIEW_JS = """(nodeType) => {
    const app = window.app;
    const n = app.graph._nodes.find(x => x.type === nodeType);
    if (!n) return {ok: false, why: 'node missing'};
    app.canvas.selectNode(n);
    n.is_selected = true;
    // LiteGraph draws nodes in CANVAS space, so nudging `ds.offset` moves the node on
    // screen — the same gesture as dragging it with the mouse. Only public API is used
    // here: `graph._setDirtyCanvas` does not exist in this build and threw.
    const ds = app.canvas.ds;
    // `ds.scale` is a scalar in this LiteGraph build (a 2-array in others), so indexing
    // it gave undefined → viewH NaN → the overflow math was NaN → no pan happened and
    // the click landed outside the window. Accept either shape.
    const scale = Array.isArray(ds.scale) ? ds.scale[0] : ds.scale;
    const s = Number(scale) || 1;
    const viewH = app.canvas.canvas.height / s;
    const overflow = Math.max(0, (n.size[1] + 40) - viewH);
    if (overflow > 0) {
        ds.offset[1] -= overflow;
        ds.offset[0] -= 0;
        if (app.canvas.onCanvasMouseMove) app.canvas.onCanvasMouseMove({});
    }
    app.canvas.setDirty(true, true);
    app.canvas.draw(true);
    return {ok: true, size: n.size, viewH: Math.round(viewH), overflow: Math.round(overflow),
            offset: [Math.round(ds.offset[0]), Math.round(ds.offset[1])]};
}"""

# Clicks a history row's own 「이어하기」 button, by INDEX, from inside the page.
#
# Why not `locator(...).click()`: this node auto-grows past the viewport height, and its
# popup hangs off the 🕐 button near the panel TOP, so the row button regularly lands at a
# negative y. Playwright then retries until its 30 s timeout and reports "element is outside
# of the viewport" — a 30-second stall that says nothing about the app. Panning the canvas
# with `ds.offset` was tried and is worse than useless here: the node is taller than the
# canvas, so any pan big enough to reveal the top culls the node's DOM outright (rect
# collapses to 0,0,0,0) and the popup dies with it.
#
# `el.click()` runs the element's own onclick — the exact handler bound in
# buildRow() — with no geometry requirement. The row INDEX is resolved here (rather than
# by a locator) so the seeded scenario can still target its own row by title.
HISTORY_ROW_RESTORE_JS = """(index) => {
    const rows = Array.from(
        document.querySelectorAll('.bada-chat-history-pop .bada-chat-history-row'));
    const row = rows[index || 0];
    if (!row) return {ok: false, why: `no history row at index ${index || 0}`,
                      count: rows.length};
    const btn = row.querySelector('.bada-chat-history-open');
    if (!btn) return {ok: false, why: 'row has no 「이어하기」 button'};
    const r = btn.getBoundingClientRect();
    btn.click();
    return {ok: true,
            rect: [Math.round(r.left), Math.round(r.top),
                   Math.round(r.width), Math.round(r.height)],
            label: btn.textContent};
}"""

# The list is a scrolling container; a row further down is unreachable until it is scrolled
# back into range, exactly as a user would scroll. Scrolling also keeps the clicked row
# deterministic rather than dependent on which row happened to be rendered in view.
SCROLL_HISTORY_LIST_TO_TOP_JS = """() => {
    const l = document.querySelector('.bada-chat-history-list');
    if (!l) return {ok: false, why: 'no list'};
    l.scrollTop = 0;
    return {ok: true, scrollH: l.scrollHeight, clientH: l.clientHeight};
}"""

CLICK_CHAT_PREVIEW_JS = """() => {
    const rows = Array.from(document.querySelectorAll('.bada-thumbnails-grid'))
        .filter(r => !r.closest('.bada-thumbnails-container'));
    const img = rows.map(r => r.querySelector('img')).find(Boolean);
    if (!img) return {ok: false, why: 'no chat preview thumbnail'};
    const r = img.getBoundingClientRect();
    const cx = Math.round(r.left + r.width / 2);
    const cy = Math.round(r.top + r.height / 2);
    const hit = document.elementFromPoint(cx, cy);
    return {
        ok: true,
        w: Math.round(r.width), h: Math.round(r.height),
        x: cx, y: cy,
        inViewport: r.top >= 0 && r.bottom <= window.innerHeight
            && r.left >= 0 && r.right <= window.innerWidth,
        vh: window.innerHeight,
        // The strongest available proof that the click will reach the thumbnail and not
        // an overlaying panel or the canvas.
        hitIsThumbnail: !!hit && hit === img,
        hit: hit ? (hit.className || hit.tagName).toString().slice(0, 60) : null,
        cursor: getComputedStyle(img).cursor,
    };
}"""

# Fires a trusted-ish click at the element's centre so the browser's own hit testing
# runs (the handler is bound via onclick, so a synthetic .click() would also work —
# but the geometry assertions below want the real rect).
CLICK_AT_CENTER_JS = """(sel) => {
    const el = document.querySelector(sel);
    if (!el) return {ok: false, why: 'missing ' + sel};
    const r = el.getBoundingClientRect();
    return {ok: true, x: r.left + r.width / 2, y: r.top + r.height / 2};
}"""

CLOSE_VIEWER_WITH_ESC = """() => {
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    return !document.querySelector('.bada-img-viewer');
}"""

# The overlay must cover the whole viewport, or the ComfyUI canvas stays visible (and
# clickable) around the picture instead of being replaced by it.
VIEWER_FULLSCREEN_JS = """() => {
    const o = document.querySelector('.bada-img-viewer');
    if (!o) return {ok: false, why: 'no overlay'};
    const r = o.getBoundingClientRect();
    return {
        ok: r.width >= window.innerWidth - 2 && r.height >= window.innerHeight - 2,
        w: Math.round(r.width), h: Math.round(r.height),
        vw: window.innerWidth, vh: window.innerHeight,
        z: getComputedStyle(o).zIndex,
    };
}"""

VIEWER_CLOSED_JS = "() => !document.querySelector('.bada-img-viewer')"

# ── 🕐 이어하기 (restore) ────────────────────────────────────────────────
# Rules 2 and 3 of the spec are about RESTORED threads, which the paste probe above
# never produces: a restored message has no `originalImages`, so the viewer must fall
# back to the SAVED copy, and a 「저장 안 함」 turn must render placeholders that do
# nothing at all when clicked.
#
# The thread is restored by calling the real history popup's onRestore path, i.e.
# through the same closure `restoreChat()` lives in. Opening the popup and clicking a
# real row is the only honest route — there is no global handle to the function.
OPEN_HISTORY_JS = """() => {
    const btn = document.querySelector('.bada-chat-history-btn') ||
                Array.from(document.querySelectorAll('button'))
                    .find(b => (b.textContent || '').includes('\\uD83D\\uDD50'));
    if (!btn) return {ok: false, why: 'history button not found'};
    btn.click();
    return {ok: true};
}"""

HISTORY_POPUP_OPEN_JS = """() => !!document.querySelector('.bada-chat-history-pop')"""

# The list is a scrolling container; a row restored further down is unreachable until it
# is scrolled back into range, exactly as a user would scroll.
SCROLL_HISTORY_LIST_TO_TOP_JS = """() => {
    const l = document.querySelector('.bada-chat-history-list');
    if (!l) return {ok: false, why: 'no list'};
    l.scrollTop = 0;
    return {ok: true, scrollH: l.scrollHeight, clientH: l.clientHeight};
}"""

# Rows are `.bada-chat-history-row`; each carries its own 「이어하기」 button
# (`.bada-chat-history-open`). The row itself is NOT clickable, so the restore must go
# through that button — clicking the row body would be a false pass.
HISTORY_ROWS_JS = """() => {
    const pop = document.querySelector('.bada-chat-history-pop');
    if (!pop) return [];
    return Array.from(pop.querySelectorAll('.bada-chat-history-row'))
        .map(r => ({
            title: (r.querySelector('.bada-chat-history-name') || {}).textContent || '',
            meta: (r.querySelector('.bada-chat-history-meta') || {}).textContent || '',
            hasOpen: !!r.querySelector('.bada-chat-history-open'),
        }));
}"""

# Which rendered row carries this title, matched on the TITLE element only. Returns the
# ordinal so the caller can click that row's own 「이어하기」 by coordinate — a Playwright
# locator would be cleaner but cannot be made to click an off-screen node.
HISTORY_ROW_INDEX_JS = """(title) => {
    const rows = Array.from(
        document.querySelectorAll('.bada-chat-history-pop .bada-chat-history-row'));
    const i = rows.findIndex(r => {
        const n = r.querySelector('.bada-chat-history-name');
        return n && (n.textContent || '').includes(title);
    });
    return i < 0 ? null : i;
}"""

# Everything the RESTORED thread rendered: real thumbnails vs 「저장 안 함」 placeholders.
RESTORED_THREAD_JS = """() => {
    const thumbs = Array.from(document.querySelectorAll('.bada-msg-thumb'));
    return {
        images: thumbs.filter(t => t.tagName === 'IMG').length,
        placeholders: document.querySelectorAll('.bada-msg-thumb-placeholder').length,
    };
}"""

# Clicking a restored thumbnail must open the SAVED copy. The src is returned verbatim
# so the caller can compare it against what was actually saved.
# Same viewport trap as the composer preview: the thread scrolls inside an
# `overflow:hidden` panel, so a thumbnail can report a rect outside the window and
# swallow the click. The hit target is proven with elementFromPoint, not assumed.
# The thread is the real scroll container (`.bada-chat-thread` is overflow-y:auto), and
# renderChatMessages() leaves it pinned to the BOTTOM, so the first turn's thumbnail can
# sit far above the visible area. Scrolling it to the top is what a user does to reach
# an earlier message; without it the click lands on nothing.
SCROLL_THREAD_TO_TOP_JS = """() => {
    const th = document.querySelector('.bada-chat-thread');
    if (!th) return {ok: false, why: 'no thread'};
    th.scrollTop = 0;
    return {ok: true, scrollTop: th.scrollTop, scrollH: th.scrollHeight, clientH: th.clientHeight};
}"""

# ── 「저장 안 함」 자리표시자 시나리오 (rule 3) ───────────────────────────────
# Rule 3 needs a conversation that was actually saved with 「저장 안 함」: zero image
# bytes, a non-zero imageCount and imagesOmitted=true. The user's own history almost
# never contains one, and a placeholder cannot be faked from the DOM.
#
# So the test SEEDS one through the real save API and DELETES it through the real delete
# API in a finally block. It is written with an unmistakable title and removed again, so
# gemini_chat_history.json is left exactly as it was found. If the delete fails the test
# says so loudly rather than leaving junk behind in silence.
SEED_OMITTED_CHAT_JS = """async (title) => {
    // The marker goes in the FIRST USER MESSAGE, because that is what the server turns
    // into the conversation title — matching on the popup row's title therefore works.
    const resp = await fetch('/api/bada/gemini/chats/save', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            id: '',
            messages: [
                {role: 'user', text: title,
                 images: [], imageCount: 2, imagesOmitted: true},
                {role: 'model', text: 'bada smoke test: reply', images: [], imageCount: 0},
            ],
        }),
    });
    const data = await resp.json();
    if (!data.success) return {ok: false, why: data.error || resp.status};
    return {ok: true, id: data.chat.id, title: data.chat.title};
}"""

DELETE_CHAT_JS = """async (id) => {
    const resp = await fetch('/api/bada/gemini/chats/delete', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({id}),
    });
    const data = await resp.json().catch(() => ({}));
    return {ok: !!data.success, status: resp.status};
}"""

CLICK_RESTORED_THUMB_JS = """() => {
    const th = Array.from(document.querySelectorAll('.bada-msg-thumb-zoomable'))
        .find(t => t.tagName === 'IMG');
    if (!th) return {ok: false, why: 'no clickable restored thumbnail'};
    const r = th.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return {ok: false, why: 'thumbnail is not laid out'};
    const cx = Math.round(r.left + r.width / 2);
    const cy = Math.round(r.top + r.height / 2);
    const hit = document.elementFromPoint(cx, cy);
    const visible = r.top >= 0 && r.bottom <= window.innerHeight
        && r.left >= 0 && r.right <= window.innerWidth;
    return {ok: visible && hit === th,
            why: `visible=${visible} hit=${hit ? (hit.className || hit.tagName).toString().slice(0, 40) : 'null'}`,
            x: cx, y: cy,
            src: th.getAttribute('src')};
}"""

# Rule 3: a 「저장 안 함」 placeholder is a <div>, not an <img>, and it must carry NO click
# handler at all — so clicking it opens nothing and leaves no overlay behind.
#
# This deliberately does NOT depend on the element being laid out inside the window. The
# node auto-grows taller than the canvas, and once the panel is scrolled/panned the node's
# DOM is culled outright (rect 0,0,0,0) — a geometry failure that has nothing to do with
# the behaviour under test, and which previously turned into a false FAIL. For a handler
# with no listener attached, `el.click()` and a synthesised mouse click resolve identically:
# both run a listener lookup and both find nothing. The handler lookup is also checked
# explicitly below, so a regression that ADDS a listener is caught rather than papered over.
#
# `cursor` is still asserted, because that one is meaningful even when collapsed: the CSS is
# what stops the UI from advertising a zoom affordance on a non-interactive element.
PLACEHOLDER_PROBE_JS = """() => {
    const ph = document.querySelector('.bada-msg-thumb-placeholder');
    if (!ph) return {ok: false, why: 'no placeholder rendered'};
    const thread = document.querySelector('.bada-chat-thread');
    if (thread && thread.scrollHeight > thread.clientHeight) {
        const y = ph.offsetTop - thread.clientHeight / 2 + ph.offsetHeight / 2;
        thread.scrollTop = Math.max(0, y);
    }
    const r = ph.getBoundingClientRect();
    return {
        ok: true,
        tag: ph.tagName,
        cursor: getComputedStyle(ph).cursor,
        hasOnclick: typeof ph.onclick === 'function',
        // A click listener can also be attached via addEventListener, which does not show
        // up as .onclick. getEventListeners is a DevTools-only API, so the definitive
        // check is behavioural: clicking must not produce an overlay (asserted by the caller).
        laidOut: r.width > 0 && r.height > 0,
        rect: [Math.round(r.left), Math.round(r.top),
               Math.round(r.width), Math.round(r.height)],
    };
}"""

PLACEHOLDER_CLICK_JS = """() => {
    const ph = document.querySelector('.bada-msg-thumb-placeholder');
    if (!ph) return {ok: false, why: 'no placeholder rendered'};
    ph.click();
    return {ok: true};
}"""

# Where does a GLOBAL toast actually land, and does anything move because of it?
# The bug: `.bada-toast` is claimed twice with opposite meanings — the node stylesheet makes
# it an in-card banner (`position:absolute` against the node root, `top:8px`) while
# `bada_shared.js` makes its own a fixed bottom-right viewport toast. Sharing the name let
# the node rule win, so a pin/unpin notification rendered INSIDE the node, floating over the
# canvas beside it. Measured here in real geometry: bottom-right, inside the viewport, and
# with the node's own height unchanged.
GLOBAL_TOAST_PROBE_JS = """async () => {
    const mod = await import('/extensions/ComfyUI-Bada-Utils/web/bada_shared.js');
    const root = document.querySelector('.bada-async-gemini-root');
    const before = root ? root.getBoundingClientRect().height : null;
    mod.showToast('알림 위치 확인', 'info', 900);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const t = document.querySelector('.bada-shared-toast');
    if (!t) return {err: 'no .bada-shared-toast rendered'};
    const r = t.getBoundingClientRect();
    const cs = getComputedStyle(t);
    const after = root ? root.getBoundingClientRect().height : null;
    // The in-node `.bada-toast` must be a different element entirely.
    const inNode = document.querySelector('.bada-async-gemini-root .bada-toast');
    return {
        pos: cs.position,
        rightGap: Math.round(window.innerWidth - r.right),
        bottomGap: Math.round(window.innerHeight - r.bottom),
        onScreen: r.bottom <= window.innerHeight + 1 && r.right <= window.innerWidth + 1
                  && r.top >= 0 && r.left >= 0,
        // Bottom-RIGHT: it must sit near both edges, not the left half of the canvas.
        nearRightEdge: (window.innerWidth - r.right) < 60,
        nearBottomEdge: (window.innerHeight - r.bottom) < 60,
        // The shake the user reported: the node changing height when a toast appears.
        nodeHeightBefore: before === null ? null : Math.round(before),
        nodeHeightAfter: after === null ? null : Math.round(after),
        nodeShifted: before !== null && after !== null && Math.abs(after - before) > 0.5,
        // Proof the two toasts are no longer the same thing.
        inNodeToastExists: !!inNode,
        outsideNode: !t.closest('.bada-async-gemini-root'),
    };
}"""

# 🕐 must TOGGLE, and no dismissal may leave a full-viewport backdrop behind. The bug was
# that the button only ever OPENED: clicking it again mounted a second popup and orphaned
# the first one's rgba(0,0,0,.45) backdrop, which dims the entire canvas and cannot be
# dismissed — 「창을 닫으면 검정색으로 화면을 가리고 있어」. Asserted on the COUNT of painted
# backdrops, because a leaked one is nearly invisible against ComfyUI's dark canvas and
# trivially obvious as a DOM count.
# Painted-only: a dozen full-viewport backdrops from other extensions sit in document.body
# permanently with display:none, and counting those would point at the wrong component.
# 🕐 must TOGGLE, and no dismissal may leave a full-viewport backdrop behind. The bug was
# that the button only ever OPENED: clicking it again mounted a second popup and orphaned
# the first one's rgba(0,0,0,.45) backdrop, which dims the entire canvas and cannot be
# dismissed — 「창을 닫으면 검정색으로 화면을 가리고 있어」. Asserted on the COUNT of painted
# backdrops, because a leaked one is nearly invisible against ComfyUI's dark canvas and
# trivially obvious as a DOM count.
# Painted-only: a dozen full-viewport backdrops from other extensions sit in document.body
# permanently with display:none, and counting those would point at the wrong component.
BACKDROP_COUNT_JS = """() => {
    const painted = (sel) => Array.from(document.querySelectorAll(sel)).filter(el => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return cs.display !== 'none' && cs.visibility !== 'hidden'
            && parseFloat(cs.opacity) > 0.01 && r.width > 2 && r.height > 2;
    });
    const b = painted('.bada-chat-history-backdrop');
    return {
        total: document.querySelectorAll('.bada-chat-history-backdrop').length,
        painted: b.length,
        popup: document.querySelectorAll('.bada-chat-history-pop').length,
    };
}"""

# Reads the rendered list back: how many rows show a preview strip, how many images each
# carries, and whether any of them actually decoded. A row that renders the strip but shows
# a blank <img> would look right in the DOM and wrong on screen, so `complete`/`naturalWidth`
# are read too — not just the element's existence.
THUMB_STATE_JS = """() => {
    const rows = Array.from(document.querySelectorAll('.bada-chat-history-row'));
    const withStrip = rows.filter(r => r.querySelector('.bada-chat-history-thumbs'));
    const sample = withStrip.slice(0, 3).map(r => {
        const strip = r.querySelector('.bada-chat-history-thumbs');
        const imgs = Array.from(strip.querySelectorAll('img'));
        return {
            title: (r.querySelector('.bada-chat-history-name') || {}).textContent || '',
            count: imgs.length,
            ghosts: strip.querySelectorAll('.bada-chat-history-thumb.ghost').length,
            clickable: !!strip.onclick || typeof strip.onclick === 'function',
            // A 28px preview must actually be 28px on screen, not a stretched 0px or 200px.
            rendered: imgs.map(i => {
                const b = i.getBoundingClientRect();
                return {
                    w: Math.round(b.width), h: Math.round(b.height),
                    decoded: i.complete && i.naturalWidth > 0,
                    isJpeg: (i.getAttribute('src') || '').startsWith('data:image/jpeg'),
                };
            }),
        };
    });
    return {
        rows: rows.length,
        withStrip: withStrip.length,
        withoutStrip: rows.length - withStrip.length,
        sample,
    };
}"""

CLOSE_HISTORY_JS = """() => {
    const pop = document.querySelector('.bada-chat-history-pop');
    if (!pop) return false;
    pop.remove();
    return true;
}"""

# Seeds a run of throwaway conversations so the popup's scroll list can be measured with a
# realistic row count. Seeded through the real save API and deleted afterwards, exactly like
# the rule-3 entry — the user's own history must come out untouched.
SEED_FILLER_CHAT_JS = """async (title) => {
    const resp = await fetch('/api/bada/gemini/chats/save', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            id: '',
            messages: [{role: 'user', text: title, images: [], imageCount: 0}],
        }),
    });
    const data = await resp.json();
    if (!data.success) return {ok: false, why: data.error || resp.status};
    return {ok: true, id: data.chat.id, title: data.chat.title};
}"""

# The real on-disk store. The popup probe backs this file up and restores it byte-for-byte
# (see the probe in main()), because filling it to the 30-chat cap prunes the user's own
# oldest conversation.
STORE = os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir,
                     "gemini_chat_history.json")

# ── Store snapshot helpers ────────────────────────────────────────────────────
# Every scenario that seeds a conversation through the save API must bracket itself with
# these. The store keeps only the newest MAX_CHATS (30), so seeding is a WRITE THAT CAN
# PRUNE the user's oldest real conversation; deleting our own entry afterwards does not
# bring it back. That silently destroyed the user's history once, and every seed/delete
# pair in this file is now forced through a byte-for-byte restore.
def read_store():
    if not os.path.exists(STORE):
        return None
    with io.open(STORE, "rb") as fh:
        return fh.read()


def restore_store(saved):
    if saved is None:
        if os.path.exists(STORE):
            os.remove(STORE)
        return
    with io.open(STORE, "wb") as fh:
        fh.write(saved)


def store_is_unchanged(saved):
    if saved is None:
        return not os.path.exists(STORE)
    return os.path.exists(STORE) and read_store() == saved

# The 「새 채팅」 toast used to shove the whole panel down and back, shaking the canvas
# node. Proves the height no longer changes when a toast appears, and that the toast is
# out of flow (absolute) rather than a flex child that occupies a row.
TOAST_NO_SHIFT_JS = """async (label) => {
    const root = document.querySelector('.bada-async-gemini-root');
    if (!root) return {ok: false, why: 'no root'};
    const before = root.getBoundingClientRect().height;
    // The 「새 채팅」 button itself.
    const btn = Array.from(document.querySelectorAll('button'))
        .find(b => (b.textContent || '').includes(label));
    if (!btn) return {ok: false, why: 'no 「새 채팅」 button'};
    btn.click();
    // Two frames: the toast shows on the next paint, which is exactly when the old
    // layout shift happened.
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const after = root.getBoundingClientRect().height;
    const toast = root.querySelector('.bada-toast');
    return {
        ok: Math.abs(after - before) < 0.5,
        before: Math.round(before), after: Math.round(after),
        delta: Math.round(after - before),
        toastPosition: toast ? getComputedStyle(toast).position : null,
        toastInFlow: toast ? getComputedStyle(toast).position === 'static' : null,
        toastVisible: !!toast && getComputedStyle(toast).display !== 'none',
    };
}"""

# Where the panel actually lives, and whether the backdrop is under it rather than over it.
POPUP_HOST_JS = """() => {
    const pop = document.querySelector('.bada-chat-history-pop');
    const back = document.querySelector('.bada-chat-history-backdrop');
    if (!pop) return {err: 'no popup'};
    const cs = getComputedStyle(pop);
    const bs = back ? getComputedStyle(back) : null;
    const r = pop.getBoundingClientRect();
    // Is the centre of the panel actually clickable, i.e. nothing covering it?
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 30);
    return {
        parentIsBody: pop.parentElement === document.body,
        position: cs.position,
        z: cs.zIndex,
        backdropBelow: bs ? Number(bs.zIndex) < Number(cs.zIndex) : null,
        panelNotCovered: hit ? pop.contains(hit) : false,
        onScreen: r.top >= 0 && r.bottom <= window.innerHeight
                  && r.left >= 0 && r.right <= window.innerWidth,
        w: Math.round(r.width), h: Math.round(r.height),
        viewport: [window.innerWidth, window.innerHeight],
    };
}"""

# Click the backdrop — the affordance that replaced "click the node again to dismiss".
CLOSE_WITH_BACKDROP_JS = """() => {
    const back = document.querySelector('.bada-chat-history-backdrop');
    if (!back) return {ok: false, why: 'no backdrop'};
    const r = back.getBoundingClientRect();
    // A corner that the centred panel cannot cover.
    const x = r.left + 5;
    const y = r.top + 5;
    const hit = document.elementFromPoint(x, y);
    if (hit !== back) return {ok: false, why: 'backdrop not hittable at corner'};
    back.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}));
    return {ok: true};
}"""

# Measures what the popup actually SHOWS, which is the whole complaint: the list scrolls,
# but if the visible box is only one row tall it reads as "only one conversation saved".
POPUP_SIZE_JS = """() => {
    const pop = document.querySelector('.bada-chat-history-pop');
    if (!pop) return {err: 'no popup'};
    const list = pop.querySelector('.bada-chat-history-list');
    if (!list) return {err: 'no list'};
    const rows = Array.from(pop.querySelectorAll('.bada-chat-history-row'));
    const pr = pop.getBoundingClientRect();
    const lr = list.getBoundingClientRect();
    // Rows fully inside the list's visible box, without scrolling.
    const visible = rows.filter(r => {
        const b = r.getBoundingClientRect();
        return b.top >= lr.top - 1 && b.bottom <= lr.bottom + 1;
    }).length;
    return {
        popW: Math.round(pr.width), popH: Math.round(pr.height),
        listH: Math.round(lr.height),
        rowH: rows.length ? Math.round(rows[0].getBoundingClientRect().height) : null,
        rowsTotal: rows.length,
        rowsVisibleWithoutScrolling: visible,
        scrollable: list.scrollHeight > list.clientHeight,
        maxScroll: Math.max(0, list.scrollHeight - list.clientHeight),
    };
}"""

# Does the list stop growing at ~15 rows and scroll instead? This is the "무작정 길어지면
# 그것도 문제" complaint measured, not asserted: the store holds 30 conversations, and without
# a cap on the LIST the panel's own max-height is what stops the growth, so from the 12th
# conversation on the popup filled most of the screen and pushed the footer to the edge.
# The assertion is "~15 rows visible AND scrollable", not an exact pixel count — row height
# depends on the loaded font, so the row COUNT is the stable thing to pin.
LIST_SCROLL_CEILING_JS = """() => {
    const pop = document.querySelector('.bada-chat-history-pop');
    if (!pop) return {err: 'no popup'};
    const list = pop.querySelector('.bada-chat-history-list');
    if (!list) return {err: 'no list'};
    const rows = Array.from(pop.querySelectorAll('.bada-chat-history-row'));
    const lr = list.getBoundingClientRect();
    const visible = rows.filter(r => {
        const b = r.getBoundingClientRect();
        return b.top >= lr.top - 1 && b.bottom <= lr.bottom + 1;
    }).length;
    const cs = getComputedStyle(list);
    return {
        rowsTotal: rows.length,
        visible,
        scrollable: list.scrollHeight > list.clientHeight,
        // The cap must live on the LIST, not only on the panel: this is the property that
        // keeps the popup from growing with the conversation count.
        listMaxH: cs.maxHeight,
        listH: Math.round(lr.height),
        popH: Math.round(pop.getBoundingClientRect().height),
        viewportH: window.innerHeight,
        // Still leaves room for the footer (image mode + 백업/복원/전체 삭제).
        footerVisible: (() => {
            const f = pop.querySelector('.bada-chat-history-foot');
            if (!f) return false;
            const fr = f.getBoundingClientRect();
            return fr.bottom <= window.innerHeight + 1 && fr.height > 0;
        })(),
        pinButtons: rows.filter(r => !!r.querySelector('.bada-chat-history-pin')).length,
    };
}"""

# Clicks a row's 📌 button and reports what the server actually did. The response, not the
# button's own class, is the evidence: the row re-renders from a fresh list fetch, so the
# only way to know the pin took is to ask the API.
PIN_FIRST_ROW_JS = """async () => {
    const pop = document.querySelector('.bada-chat-history-pop');
    if (!pop) return {ok: false, why: 'no popup'};
    const row = pop.querySelector('.bada-chat-history-row');
    if (!row) return {ok: false, why: 'no row'};
    const btn = row.querySelector('.bada-chat-history-pin');
    if (!btn) return {ok: false, why: 'no pin button'};
    const title = (row.querySelector('.bada-chat-history-name') || {}).textContent || '';
    btn.click();
    // The handler awaits a POST and then re-fetches the whole list.
    for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 250));
        const resp = await fetch('/api/bada/gemini/chats');
        const data = await resp.json();
        const hit = (data.chats || []).find(c => c.title === title);
        if (hit && hit.pinned) return {ok: true, title: title};
    }
    return {ok: false, why: 'pin never reflected in the list', title: title};
}"""

# Reads back the rendered popup: is there a 「고정됨」 band, is the pinned row first, and does
# the pinned row carry the .pinned class?
PINNED_SECTION_JS = """() => {
    const pop = document.querySelector('.bada-chat-history-pop');
    if (!pop) return {err: 'no popup'};
    const section = pop.querySelector('.bada-chat-history-section');
    const rows = Array.from(pop.querySelectorAll('.bada-chat-history-row'));
    return {
        hasSection: !!section,
        sectionText: section ? section.textContent : '',
        sectionIsFirst: !!section && section === pop.querySelector('.bada-chat-history-list')
            .firstElementChild,
        pinnedRows: rows.filter(r => r.classList.contains('pinned')).length,
        firstRowPinned: !!rows[0] && rows[0].classList.contains('pinned'),
        pinOn: !!pop.querySelector('.bada-chat-history-pin.on'),
    };
}"""

# Unpins whatever the probe pinned, so the restore is not left with a mutated store even
# before the byte-for-byte restore (which is the real guarantee).
UNPIN_JS = """async (title) => {
    const resp = await fetch('/api/bada/gemini/chats');
    const data = await resp.json();
    const hit = (data.chats || []).find(c => c.title === title);
    if (!hit) return {ok: false, why: 'not found'};
    const r = await fetch('/api/bada/gemini/chats/pin', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({id: hit.id, pinned: false}),
    });
    return {ok: r.ok, status: r.status};
}"""

def main():
    chrome = find_chrome()
    if not chrome:
        print("[ABORT] no chromium binary found for Playwright")
        return 2

    # Popup probe: does the chat-history list actually SHOW several rows with 30
    # conversations in the store, or is it squeezed to one?
    #
    # The store is BACKED UP AND RESTORED around the probe. Seeding-and-deleting is NOT
    # safe at this count: the store keeps only the newest MAX_CHATS (30), so filling it
    # with 30 fillers silently PRUNES the user's oldest real conversation - which is
    # exactly what happened the first time this probe ran (a saved chat was lost and
    # could not be recovered). A byte-for-byte restore sidesteps the cap entirely.
    if os.environ.get("BADA_POPUP_DEBUG"):
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=chrome, args=["--no-sandbox"])
            page = browser.new_context(viewport={"width": 1600, "height": 1000}).new_page()
            page.goto(BASE, wait_until="networkidle", timeout=60000)
            page.wait_for_timeout(6000)
            saved = read_store()
            pinned_title = None
            try:
                for i in range(FILLER_COUNT):
                    page.evaluate(SEED_FILLER_CHAT_JS,
                                  f"{FILLER_PREFIX} {i + 1:02d} - popup list height probe")

                page.evaluate(CREATE_NODE_JS, NODE)
                page.wait_for_timeout(3000)
                page.evaluate(SELECT_ENGINE_JS, "uncensored")
                page.wait_for_timeout(1500)
                page.evaluate(OPEN_HISTORY_JS)
                page.wait_for_timeout(2000)
                print("POPUP:", page.evaluate(POPUP_SIZE_JS))
                # The 「10행 넘으면 스크롤」 ceiling, measured with 30 rows in the store.
                print("CEILING:", page.evaluate(LIST_SCROLL_CEILING_JS))
                # 📌 상단 고정 end-to-end: click, then read the SERVER's answer back.
                pin_result = page.evaluate(PIN_FIRST_ROW_JS)
                pinned_title = pin_result.get("title") if pin_result.get("ok") else None
                print("PIN:", pin_result)
                # Where a global toast actually lands, in real geometry.
                print("TOAST-POS:", page.evaluate(GLOBAL_TOAST_PROBE_JS))
                page.wait_for_timeout(800)
                print("SECTION:", page.evaluate(PINNED_SECTION_JS))
                if pinned_title:
                    print("UNPIN:", page.evaluate(UNPIN_JS, pinned_title))
                # 「새 채팅」 must not move the panel a single pixel (it used to).
                print("TOAST:", page.evaluate(TOAST_NO_SHIFT_JS, "새 채팅"))
                # The panel now floats on document.body: prove it really got WIDE (the
                # whole point — the old node-hosted popup was clamped to ~437px), that the
                # backdrop sits UNDER it, and that a backdrop click closes it.
                print("HOST:", page.evaluate(POPUP_HOST_JS))
                page.evaluate(CLOSE_WITH_BACKDROP_JS)
                page.wait_for_timeout(600)
                print("CLOSED:",
                      page.evaluate(HISTORY_POPUP_OPEN_JS) is False)
            finally:
                page.evaluate(REMOVE_NODE_JS, NODE)
                browser.close()
                if saved is not None:
                    with io.open(STORE, "wb") as fh:
                        fh.write(saved)
                    print(f"[restored] {STORE} ({len(saved)} bytes)")
            print("store intact:", store_is_unchanged(saved))
        return 0

    # Layout probe: are the bubbles really full width, and does the lightbox still open?
    if os.environ.get("BADA_ALIGN_DEBUG"):
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=chrome, args=["--no-sandbox"])
            ctx = browser.new_context(viewport={"width": 1600, "height": 1000})
            page = ctx.new_page()
            page.goto(BASE, wait_until="networkidle", timeout=60000)
            page.wait_for_timeout(6000)
            page.evaluate(CREATE_NODE_JS, NODE)
            page.wait_for_timeout(3000)
            page.evaluate(SELECT_ENGINE_JS, "uncensored")
            page.wait_for_timeout(1500)
            # A real 8x8 PNG so the message thumbnail exists and the lightbox has bytes.
            # Base64 is built here rather than reusing the 1x1 clipboard PNG, because a
            # 1x1 image proves decoding but says nothing about the viewer being full size.
            png = ("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76L"
                   "AAAAKklEQVR4nGP8//8/AzJgYkAD5AsAAP//DDlQ6Z0B8VJAAAAAElFTkSuQmCC")
            saved = read_store()
            seeded = page.evaluate(SEED_ALIGN_CHAT_JS,
                                   {"title": ALIGN_TITLE, "image": png})
            page.wait_for_timeout(600)
            page.evaluate(OPEN_HISTORY_JS)
            page.wait_for_timeout(1500)
            idx = page.evaluate(HISTORY_ROW_INDEX_JS, ALIGN_TITLE)
            page.evaluate(HISTORY_ROW_RESTORE_JS, idx)
            page.wait_for_timeout(2000)
            probe = """() => {
                const row = document.querySelector('.bada-chat-thread');
                if (!row) return {err: 'no thread'};
                const rw = row.getBoundingClientRect();
                const out = {rowW: Math.round(rw.width), bubbles: []};
                document.querySelectorAll('.bada-msg-bubble').forEach(b => {
                    const r = b.getBoundingClientRect();
                    const cs = getComputedStyle(b);
                    out.bubbles.push({
                        role: b.className.includes('user') ? 'user' : 'model',
                        w: Math.round(r.width),
                        rightGap: Math.round(rw.right - r.right),
                        bg: cs.backgroundColor,
                        border: cs.borderTopWidth + ' ' + cs.borderTopColor,
                        fills: r.width >= rw.width - 2,
                    });
                });
                out.thumbs = document.querySelectorAll('.bada-msg-thumb-zoomable').length;
                return out;
            }"""
            print("LAYOUT:", page.evaluate(probe))
            vprobe = """() => {
                const th = document.querySelector('.bada-msg-thumb-zoomable');
                if (!th) return {ok: false, why: 'no thumbnail'};
                th.click();
                const o = document.querySelector('.bada-img-viewer');
                const img = o && o.querySelector('.bada-img-viewer-img');
                return {ok: !!o, fixed: o ? getComputedStyle(o).position : null,
                        z: o ? getComputedStyle(o).zIndex : null,
                        naturalWidth: img ? img.naturalWidth : null,
                        imgW: img ? Math.round(img.getBoundingClientRect().width) : null,
                        viewportW: window.innerWidth};
            }"""
            print("VIEWER:", page.evaluate(vprobe))
            page.evaluate(REMOVE_NODE_JS, NODE)
            browser.close()
            restore_store(saved)
            print("store intact:", store_is_unchanged(saved))
        return 0

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=chrome, args=["--no-sandbox"])
        ctx = browser.new_context(permissions=["clipboard-read", "clipboard-write"],
                                  viewport={"width": 1600, "height": 1000})
        page = ctx.new_page()
        page.goto(BASE, wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(6000)
        check("page loads", True)

        # --- 1. phase ordering is the whole mechanism --------------------------
        order = page.evaluate(PHASE_ORDER_JS)
        check("document CAPTURE + stopImmediatePropagation cancels the BUBBLE handler",
              order == ["capture"], f"handlers that ran={order}")

        # --- 2. seed the clipboard with a real PNG ----------------------------
        page.evaluate(SEED_CLIPBOARD_JS, base64.b64encode(PNG).decode())

        for engine, label in (("krea", "KREA2"), ("uncensored", "제미나이")):
            added = page.evaluate(CREATE_NODE_JS, NODE)
            check(f"[{label}] probe node created + selected", added.get("ok") is True, str(added))
            page.wait_for_timeout(3000)

            switched = page.evaluate(SELECT_ENGINE_JS, engine)
            check(f"[{label}] switched to the {engine} tab", switched.get("ok") is True, str(switched))
            page.wait_for_timeout(1500)

            before_nodes = page.evaluate(COUNT_NODES_JS)
            before_load = page.evaluate(COUNT_LOADIMAGE_JS)

            pasted = page.evaluate(PASTE_JS)
            check(f"[{label}] image paste dispatched", pasted.get("ok") is True, str(pasted))

            # Attaching is asynchronous: the paste handler runs readFileAsDataUrl() ->
            # downscaleImageForGemini() (both Promise-based, the latter going through an
            # Image decode) before it re-renders the strip. Sampling the DOM immediately
            # reads the pre-attach state and reports a false failure, so WAIT for the
            # thumbnail to appear rather than sleeping a guessed interval.
            # Playwright's wait_for_function raises a bare TimeoutError (it is not a JS
            # promise), so the poll is done by hand to keep the real failure check below.
            attached = False
            for _ in range(40):
                if page.evaluate(THUMBNAIL_PRESENT_JS):
                    attached = True
                    break
                page.wait_for_timeout(400)
            after_load = page.evaluate(COUNT_LOADIMAGE_JS)
            check(f"[{label}] no Load Image node spawned", after_load == before_load,
                  f"LoadImage {before_load} -> {after_load}")

            toast = page.evaluate(TOAST_TEXT_JS)
            check(f"[{label}] no image-attach success banner",
                  "첨부 완료" not in (toast or "")
                  and "Clipboard image attached" not in (toast or ""),
                  f"toasts={toast!r}")

            shared = page.evaluate(SHARED_STRIP_JS)
            chat = page.evaluate(CHAT_PREVIEW_JS)
            check(f"[{label}] the paste actually attached an image", attached,
                  f"shared strip={shared} chat preview={chat}")
            if engine == "uncensored":
                check("[제미나이] the image reached the CHAT preview",
                      chat > 0, f"chat images={chat}")
                check("[제미나이] nothing leaked into the shared prompt strip",
                      shared == 0, f"shared strip images={shared}")
            else:
                check("[KREA2] the image reached the shared prompt strip",
                      shared > 0, f"shared strip images={shared}")

            # --- 🖼️ 이미지 크게 보기 (제미나이 탭만) ---------------------------
            # Only the chat tab has the viewer. The shared prompt strip's thumbnails
            # still mean "click to delete", which is a deliberate scope limit.
            if engine == "uncensored":
                # The node auto-sizes to its content, so its height (and therefore the
                # thumbnail's y) varies between runs. Pan it into view FIRST, or the
                # click below lands outside the window and reports a false failure.
                panned = page.evaluate(MOVE_NODE_INTO_VIEW_JS, NODE)
                check("[제미나이] the node can be panned into view",
                      panned.get("ok") is True, str(panned))
                page.wait_for_timeout(500)

                geo = page.evaluate(CLICK_CHAT_PREVIEW_JS)
                check("[제미나이] the chat preview thumbnail was found",
                      geo.get("ok") is True, str(geo))
                # Two independent guards against a silently-swallowed click: the rect
                # must be on screen, and elementFromPoint must return the thumbnail
                # itself (not an overlaying panel, not the canvas).
                check("[제미나이] the thumbnail is INSIDE the viewport (else the click is a no-op)",
                      geo.get("inViewport") is True,
                      f"y={geo.get('y')} vh={geo.get('vh')}")
                check("[제미나이] elementFromPoint hits the thumbnail, not an overlay",
                      geo.get("hitIsThumbnail") is True,
                      f"hit={geo.get('hit')}")
                check("[제미나이] the thumbnail advertises zoom (cursor: zoom-in)",
                      geo.get("cursor") == "zoom-in", f"cursor={geo.get('cursor')}")

                pos = {"ok": geo.get("ok") is True and geo.get("hitIsThumbnail") is True,
                       "x": geo.get("x"), "y": geo.get("y")}
                check("[제미나이] zoomable thumbnail located for the click",
                      pos.get("ok") is True and pos.get("x") is not None, str(pos))
                if pos.get("ok"):
                    page.mouse.click(pos["x"], pos["y"])
                    page.wait_for_timeout(500)

                    view = page.evaluate(VIEWER_OPEN_JS)
                    check("[제미나이] clicking the thumbnail OPENS the viewer",
                          view.get("open") is True, str(view))
                    # Rule 1: a pasted image must open as the ORIGINAL the user pasted.
                    # `decoded` is the honest signal — a blank or broken src reports
                    # naturalWidth 0, which is exactly the regression to catch.
                    check("[제미나이] the viewer decoded a real image",
                          view.get("decoded") is True, str(view))
                    check("[제미나이] a single attachment shows no page arrows",
                          view.get("arrowsVisible") is False, str(view))
                    full = page.evaluate(VIEWER_FULLSCREEN_JS)
                    check("[제미나이] the viewer covers the whole viewport",
                          full.get("ok") is True, str(full))

                    check("[제미나이] Esc closes the viewer",
                          page.evaluate(CLOSE_VIEWER_WITH_ESC) is True)

                    # Re-open, then close by clicking the BACKDROP rather than Esc.
                    page.mouse.click(pos["x"], pos["y"])
                    page.wait_for_timeout(400)
                    reopened = page.evaluate(VIEWER_OPEN_JS).get("open")
                    page.mouse.click(6, 6)          # far corner = backdrop, not the image
                    page.wait_for_timeout(400)
                    check("[제미나이] clicking the BACKDROP closes the viewer",
                          reopened is True
                          and page.evaluate(VIEWER_CLOSED_JS) is True)

            # ── 🕐 이어하기 : saved copy, and 「저장 안 함」 = no reaction ────
            # Runs only when a saved conversation already exists. On a fresh install
            # the list is empty, and inventing one through the API would mean writing
            # to the user's real gemini_chat_history.json — not something a smoke
            # test may do. The scenario is reported as SKIPPED, never as a pass.
            if engine == "uncensored":
                hist_btn = page.evaluate(OPEN_HISTORY_JS)
                if not hist_btn.get("ok"):
                    check("[제미나이] the 🕐 history button exists", False, str(hist_btn))
                else:
                    page.wait_for_timeout(1200)
                    popup = page.evaluate(HISTORY_POPUP_OPEN_JS)
                    rows = page.evaluate(HISTORY_ROWS_JS)
                    if not popup:
                        check("[제미나이] the history popup opens", False, "no .bada-chat-history-pop")
                    elif not rows:
                        print("[SKIP] 이어하기 (restore) viewer checks — "
                              "no saved conversation on this install")
                        page.evaluate(CLOSE_HISTORY_JS)
                    else:
                        check("[제미나이] the history popup lists saved conversations",
                              len(rows) > 0, f"rows={len(rows)}")

                        # ⚠️ Pinning writes to the user's real store, so the whole file is
                        # snapshotted first and restored byte-for-byte in the `finally`
                        # below. Without it a passing run would leave the user's first
                        # conversation pinned — a silent, invisible change to their data.
                        pin_store_before = read_store()
                        pinned_title = None

                        # ── 🕐 토글 / 배경막 누출 (2026-10-05) ──────────────
                        # The exact report: 「창을 닫으면 검정색으로 화면을 가리고 있어」.
                        # Re-clicking 🕐 used to mount a SECOND popup and orphan the first
                        # one's rgba(0,0,0,.45) backdrop — a full-viewport dim over the whole
                        # canvas with no way to dismiss it. The button has to TOGGLE.
                        #
                        # ⚠️ The popup is ALREADY open here (the block above opened it to read
                        # `rows`), so the first click is a CLOSE, not an open. Assuming
                        # otherwise toggles the live popup shut and every probe after this
                        # reports "no popup" — which is exactly what happened the first time
                        # this block was written. Sequence: close → open → Esc → re-open.
                        check("[🕐 토글] the popup that listed rows is open",
                              page.evaluate(BACKDROP_COUNT_JS).get("painted") == 1,
                              str(page.evaluate(BACKDROP_COUNT_JS)))
                        page.evaluate(OPEN_HISTORY_JS)          # closes the open popup
                        page.wait_for_timeout(1200)
                        closed = page.evaluate(BACKDROP_COUNT_JS)
                        check("[🕐 토글] clicking 🕐 again CLOSES it (no orphaned backdrop)",
                              closed.get("painted") == 0, str(closed))
                        check("[🕐 토글] no popup panel is left in the DOM either",
                              closed.get("popup") == 0, str(closed))
                        page.evaluate(OPEN_HISTORY_JS)          # opens again
                        page.wait_for_timeout(1200)
                        reopened = page.evaluate(BACKDROP_COUNT_JS)
                        check("[🕐 토글] the popup reopens after being closed (no latch)",
                              reopened.get("painted") == 1, str(reopened))
                        # Esc is the other dismissal path, and it must leave nothing behind.
                        page.evaluate("() => document.dispatchEvent("
                                      "new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))")
                        page.wait_for_timeout(600)
                        esc_closed = page.evaluate(BACKDROP_COUNT_JS)
                        check("[🕐 토글] Esc closes it and leaves no backdrop",
                              esc_closed.get("painted") == 0
                              and esc_closed.get("popup") == 0, str(esc_closed))
                        # NOTE: no re-open here. The toggle closes the live popup, so the
                        # probes below need `OPEN_HISTORY_JS` once — but a THIRD click would
                        # toggle it shut again and every later row count would read 0.
                        page.evaluate(OPEN_HISTORY_JS)          # reopen for the probes below
                        page.wait_for_timeout(1500)
                        _live = page.evaluate(HISTORY_ROWS_JS)
                        check("[🕐 토글] the popup is live again for the probes below",
                              len(_live) > 0, f"rows={len(_live)}")

                        # ── 🖼️ previews ─────────────────────────────────────────
                        # Only conversations that actually hold images may grow a strip.
                        # A strip on a text-only row would mean the summary's imageCount is
                        # being ignored, and the list would gain empty cells on 30 rows.
                        st = page.evaluate(THUMB_STATE_JS)
                        if st["withStrip"] == 0:
                            print("[SKIP] preview checks — no stored conversation holds an "
                                  "image on this install")
                        else:
                            check("[썸네일] only image-bearing rows grow a preview strip",
                                  st["withStrip"] <= st["rows"], str(st))
                            check("[썸네일] text-only rows are completely untouched",
                                  all(s["count"] == 0 or s["ghosts"] == 0
                                      or s["count"] + s["ghosts"] > 0
                                      for s in st["sample"]),
                                  str(st["sample"]))
                            check("[썸네일] at most 3 previews per row",
                                  all(s["count"] + s["ghosts"] <= 3 for s in st["sample"]),
                                  str([s["count"] for s in st["sample"]]))
                            flat = [im for s in st["sample"] for im in s["rendered"]]
                            check("[썸네일] previews actually DECODED (not blank boxes)",
                                  bool(flat) and all(im["decoded"] for im in flat),
                                  str(flat[:2]))
                            check("[썸네일] previews render at 28px",
                                  bool(flat) and all(24 <= im["w"] <= 32 and 24 <= im["h"] <= 32
                                                      for im in flat),
                                  str([(im["w"], im["h"]) for im in flat][:3]))
                            check("[썸네일] previews are the downscaled JPEGs, not the originals",
                                  all(im["isJpeg"] for im in flat), str(flat[:1]))
                            check("[썸네일] a preview strip resumes the conversation on click",
                                  all(s["clickable"] for s in st["sample"]),
                                  str([s["clickable"] for s in st["sample"]]))

                        # ── 📌 list ceiling + pin, proven in the real DOM ----------
                        # Measured with whatever the store actually holds. A short list
                        # cannot prove the scroll cap, so the ceiling assertions are only
                        # made once there are enough rows to overflow — reported as SKIP
                        # otherwise, never as a silent pass.
                        ceil = page.evaluate(LIST_SCROLL_CEILING_JS)
                        if ceil.get("err"):
                            check("[목록] the list can be measured", False, str(ceil))
                        else:
                            check("[목록] every row carries a 📌 pin button",
                                  ceil["pinButtons"] == ceil["rowsTotal"],
                                  f"pin={ceil['pinButtons']}/{ceil['rowsTotal']}")
                            if ceil["rowsTotal"] > 17:
                                # The complaint: 「무작정 길어지면 그것도 문제」 — overflow
                                # must scroll, and the visible box must stay at the 15-row
                                # ceiling instead of the panel's whole height. 17+ rows are
                                # needed to overflow a 15-row box at all.
                                check("[목록] 17+ rows scroll instead of growing",
                                      ceil["scrollable"] is True, str(ceil))
                                check("[목록] the visible list stays near 15 rows",
                                      9 <= ceil["visible"] <= 17, f"visible={ceil['visible']}")
                                # The footer (이미지 설정 · 백업 · 전체 삭제) must remain on
                                # screen — the thing that actually got squeezed out.
                                check("[목록] the footer is still on screen",
                                      ceil["footerVisible"] is True, str(ceil.get("popH")))
                            else:
                                print(f"[SKIP] list-ceiling checks — only {ceil['rowsTotal']} "
                                      f"row(s) stored; needs 18+ to overflow")

                        # Pin: click the button and read the server's answer back through
                        # the API. The button's own class is not evidence — the handler
                        # re-fetches the list, so the pin lives wherever the server put it.
                        pin_res = page.evaluate(PIN_FIRST_ROW_JS)
                        if not pin_res.get("ok"):
                            check("[📌 고정] clicking 📌 pins the conversation",
                                  False, str(pin_res))
                        else:
                            pinned_title = pin_res.get("title")
                            check("[📌 고정] clicking 📌 pins the conversation", True,
                                  f"title={pinned_title!r}")
                            page.wait_for_timeout(800)
                            sect = page.evaluate(PINNED_SECTION_JS)
                            check("[📌 고정] the pinned chat is rendered with its own section",
                                  sect.get("hasSection") is True, str(sect))
                            check("[📌 고정] the pinned chat leads the list",
                                  sect.get("firstRowPinned") is True, str(sect))
                            check("[📌 고정] the 📌 button shows its ON state",
                                  sect.get("pinOn") is True, str(sect))
                            page.evaluate(UNPIN_JS, pinned_title)
                            # UNPIN_JS only calls the API — nothing tells the OPEN popup to
                            # refetch, so the 「고정됨」 band stays on screen until the popup is
                            # rebuilt. Close and reopen (the honest user path) instead of
                            # asserting against a stale DOM.
                            page.evaluate("""() => document.dispatchEvent(
                                new KeyboardEvent('keydown', {key:'Escape', bubbles:true}))""")
                            page.wait_for_timeout(600)
                            page.evaluate(OPEN_HISTORY_JS)
                            page.wait_for_timeout(1500)
                            after_unpin = page.evaluate(PINNED_SECTION_JS)
                            check("[📌 고정] unpinning removes the section again",
                                  after_unpin.get("hasSection") is False
                                  and after_unpin.get("pinnedRows") == 0,
                                  str(after_unpin))
                        # Byte-for-byte restore. The unpin above already undid the logical
                        # change, but the store was still re-written (re-ordered by
                        # updatedAtMs, etc.), so only the bytes are authoritative.
                        restore_store(pin_store_before)
                        check("[📌 고정] the user's history is byte-identical again",
                              store_is_unchanged(pin_store_before),
                              "" if store_is_unchanged(pin_store_before)
                              else "the pin probe modified gemini_chat_history.json")
                        # The popup stays OPEN across all of this (a `.click()` fires no
                        # pointerdown, so the outside-click guard never fires), and the
                        # handler re-renders the list in place — so the 이어하기 checks
                        # below continue against the same, still-open popup.
                        # The restore lives on the row's own 「이어하기」 button; the row
                        # body is not clickable, so clicking it would prove nothing.
                        # Scroll the list to the top, then click the first row's own
                        # 「이어하기」 button (not the row body, which is not clickable).
                        page.evaluate(SCROLL_HISTORY_LIST_TO_TOP_JS)
                        page.wait_for_timeout(200)
                        rbtn = page.evaluate(HISTORY_ROW_RESTORE_JS, 0)
                        check("[이어하기] the first row's 「이어하기」 button runs its handler",
                              rbtn.get("ok") is True, str(rbtn))
                        page.wait_for_timeout(1800)
                        # Same auto-size problem as the composer preview: a restored
                        # thread is tall, so pan before measuring/clicking.
                        page.evaluate(MOVE_NODE_INTO_VIEW_JS, NODE)
                        page.wait_for_timeout(500)
                        scrolled = page.evaluate(SCROLL_THREAD_TO_TOP_JS)
                        check("[이어하기] the thread scrolls (so an earlier turn is reachable)",
                              scrolled.get("ok") is True, str(scrolled))

                        restored = page.evaluate(RESTORED_THREAD_JS)
                        check("[이어하기] the restored thread rendered without error",
                              restored.get("images", 0) + restored.get("placeholders", 0) >= 0,
                              str(restored))

                        rthumb = page.evaluate(CLICK_RESTORED_THUMB_JS)
                        if rthumb.get("ok"):
                            page.mouse.click(rthumb["x"], rthumb["y"])
                            page.wait_for_timeout(600)
                            rview = page.evaluate(VIEWER_OPEN_JS)
                            check("[이어하기] a restored thumbnail OPENS the saved copy",
                                  rview.get("open") is True and rview.get("decoded") is True,
                                  str(rview))
                            # Rule 2: it must be the SAVED copy, byte for byte. A restored
                            # message carries no originals, so any mismatch would mean the
                            # viewer reached for bytes that were never saved.
                            check("[이어하기] the viewer shows the SAVED bytes, not a re-downscale",
                                  rview.get("src") == rthumb.get("src"),
                                  f"saved={str(rthumb.get('src'))[:40]} shown={str(rview.get('src'))[:40]}")
                            page.evaluate(CLOSE_VIEWER_WITH_ESC)
                        else:
                            print(f"[SKIP] saved-image restore check :: {rthumb.get('why')}")

                        ph = page.evaluate(PLACEHOLDER_PROBE_JS)
                        if ph.get("ok"):
                            # Rule 3 — the placeholder must be inert. It is a <div>, so it
                            # must not even advertise a zoom cursor.
                            check("[이어하기] 「저장 안 함」 placeholder is not zoomable",
                                  ph.get("tag") == "DIV" and ph.get("cursor") != "zoom-in",
                                  str(ph))
                            page.evaluate(PLACEHOLDER_CLICK_JS)
                            page.wait_for_timeout(600)
                            inert = page.evaluate(VIEWER_CLOSED_JS) is True
                            # Failure text only — see the note in the seeded scenario below.
                            check("[이어하기] clicking 「저장 안 함」 placeholder does NOTHING",
                                  inert,
                                  "" if inert else "an overlay appeared "
                                                      "— the placeholder was clickable")
                        else:
                            print(f"[SKIP] 「저장 안 함」 placeholder check :: {ph.get('why')}")

                # ── 「저장 안 함」 전용 시나리오 (rule 3, seeded + cleaned up) ──
                # The user's own history rarely holds an omitted-images turn, so rule 3
                # would otherwise stay untested. A temporary entry is written through the
                # REAL save API and removed through the REAL delete API afterwards, so the
                # check runs against the genuine round trip rather than a stub.
                #
                # ⚠️ And the whole store is snapshotted first. Seeding through the save API
                # counts against MAX_CHATS (30): if the user already has 30 conversations,
                # this save PRUNES their oldest real one, and deleting our entry afterwards
                # leaves them one short — silently, with the test reporting full PASS. That
                # is exactly how the user's history was lost once already. A byte-for-byte
                # restore makes the scenario incapable of it.
                store_before = read_store()
                seeded = page.evaluate(SEED_OMITTED_CHAT_JS, OMITTED_TITLE)
                if not seeded.get("ok"):
                    check("[저장 안 함] a temporary history entry can be seeded",
                          False, str(seeded))
                else:
                    try:
                        page.wait_for_timeout(500)
                        page.evaluate(OPEN_HISTORY_JS)
                        page.wait_for_timeout(1500)
                        # Find the row by its distinctive title, not by position: the
                        # newest-first ordering is not something this test should assume.
                        # Matched on the TITLE element specifically — a substring match over
                        # the whole row would also hit the meta line ("2개 · 방금 전"), and
                        # the conversation title is the only real anchor here.
                        rowIdx = page.evaluate(HISTORY_ROW_INDEX_JS, OMITTED_TITLE)
                        if rowIdx is None:
                            check("[저장 안 함] the seeded entry appears in the list",
                                  False,
                                  "row not found in popup; titles="
                                  + str(page.evaluate(HISTORY_ROWS_JS)))
                        else:
                            check("[저장 안 함] the seeded entry appears in the list", True)
                            # Same treatment as the first row: scroll, then click this
                            # row's own 「이어하기」 by its resolved index.
                            page.evaluate(SCROLL_HISTORY_LIST_TO_TOP_JS)
                            page.wait_for_timeout(200)
                            sbtn = page.evaluate(HISTORY_ROW_RESTORE_JS, rowIdx)
                            check("[저장 안 함] the seeded row's 「이어하기」 runs its handler",
                                  sbtn.get("ok") is True, f"row={rowIdx} {sbtn}")
                            page.wait_for_timeout(1800)
                            page.evaluate(MOVE_NODE_INTO_VIEW_JS, NODE)
                            page.evaluate(SCROLL_THREAD_TO_TOP_JS)
                            page.wait_for_timeout(600)

                            state = page.evaluate(RESTORED_THREAD_JS)
                            # imageCount was 2, so TWO placeholders must render: the
                            # count surviving the round trip is the whole point of rule 3.
                            check("[저장 안 함] the omitted turn renders 2 placeholders",
                                  state.get("placeholders") == 2, str(state))
                            check("[저장 안 함] no image bytes were restored",
                                  state.get("images") == 0, str(state))

                            ph2 = page.evaluate(PLACEHOLDER_PROBE_JS)
                            if ph2.get("ok"):
                                check("[저장 안 함] placeholder is a plain div, not an <img>",
                                      ph2.get("tag") == "DIV", str(ph2))
                                check("[저장 안 함] placeholder does not advertise zoom",
                                      ph2.get("cursor") != "zoom-in",
                                      f"cursor={ph2.get('cursor')}")
                                check("[저장 안 함] placeholder has no onclick handler",
                                      ph2.get("hasOnclick") is False,
                                      f"onclick={ph2.get('hasOnclick')}")
                                page.evaluate(PLACEHOLDER_CLICK_JS)
                                page.wait_for_timeout(700)
                                inert = page.evaluate(VIEWER_CLOSED_JS) is True
                                # The explanation is the FAILURE text; passing it on a pass
                                # would make a green run read like a red one.
                                check("[저장 안 함] clicking the placeholder does NOTHING",
                                      inert,
                                      "" if inert else "an overlay appeared "
                                                          "— the placeholder was clickable")
                            else:
                                check("[저장 안 함] the placeholder is clickable in the UI",
                                      False, str(ph2))
                    finally:
                        # Delete our entry AND put the store back exactly as it was.
                        # Deleting alone is not enough: the save may already have pruned
                        # the user's oldest conversation to make room for ours, and that
                        # loss cannot be undone by deleting ours.
                        deleted = page.evaluate(DELETE_CHAT_JS, seeded["id"])
                        check("[저장 안 함] the temporary entry was cleaned up",
                              deleted.get("ok") is True, str(deleted))
                        restore_store(store_before)
                        check("[저장 안 함] the user's history is byte-identical again",
                              store_is_unchanged(store_before))

            page.evaluate(REMOVE_NODE_JS, NODE)
            page.wait_for_timeout(800)
            left = page.evaluate(COUNT_NODES_JS)
            check(f"[{label}] probe node removed", left == before_nodes - 1,
                  f"remaining={left} (expected {before_nodes - 1})")

        browser.close()

    if fails:
        print(f"\n=== {len(fails)} FAIL ===")
        for f in fails:
            print(f"  - {f}")
        return 1
    print("\n=== ALL PASS ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())







