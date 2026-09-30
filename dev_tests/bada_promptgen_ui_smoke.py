"""Real-browser (Playwright) smoke test for the BadaPromptGenerator node UI.

Verifies the live frontend end to end:
  1. boot / extension registration
  2. node header DOM (API-key row, model select, toggle cards, manage button)
  3. toggle cards <-> native BOOLEAN widget sync (both directions)
  4. cascading target -> submenu combo
  5. toast host rendering driven by a websocket `executed` payload
  6. API-key row behaviour (mask / reveal / empty-key warning)
  7. model select -> localStorage + config.json synchronisation
  8. prompt-management modal CRUD (create / load / reorder / delete)
  9. modal -> registry -> node submenu integration (no restart required)

Every mutation is cross-checked against the server REST API and reverted, so the
script is idempotent and safe to re-run against a live ComfyUI instance.

Requirements: `pip install playwright requests` + `playwright install chromium`.

Run (against a throw-away instance — never against the daily driver port 8188):
    python dev_tests/bada_promptgen_ui_smoke.py
    BADA_TEST_BASE=http://127.0.0.1:8199   # override the target instance
    BADA_TEST_SHOTS=<dir>                  # screenshot output (default ./_shots)
"""
import io
import os
import sys
import time

import requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
from playwright.sync_api import sync_playwright  # noqa: E402

BASE = os.environ.get("BADA_TEST_BASE", "http://127.0.0.1:8199").rstrip("/")
REG_URL = BASE + "/api/bada/promptgen/registry"
CFG_URL = BASE + "/api/bada/gemini/config"
SHOT_DIR = os.environ.get("BADA_TEST_SHOTS") or os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "_shots")
os.makedirs(SHOT_DIR, exist_ok=True)

results = []


def check(label, cond, info=""):
    results.append(bool(cond))
    print(f"[{'PASS' if cond else 'FAIL'}] {label}" + (f" :: {info}" if info else ""))
    return bool(cond)


def ts():
    return str(int(time.time() * 1000))


def api_registry():
    return requests.get(REG_URL, params={"ts": ts()}, timeout=20).json()["registry"]


def api_cfg():
    return requests.get(CFG_URL, params={"ts": ts()}, timeout=20).json()


def names_of(registry, target_name):
    """Submenu names the node must show for a target (mirrors node/JS logic)."""
    for t in registry.get("targets") or []:
        if t.get("name") == target_name or t.get("id") == target_name:
            if t.get("dynamic") == "user_prompts":
                names = [p.get("name") for p in (registry.get("user_prompts") or []) if p.get("name")]
                return names or ["(등록된 프롬프트 없음)"]
            names = [s.get("name") for s in (t.get("submenus") or []) if s.get("name")]
            return names or ["일반"]
    return None



# ---------------------------------------------------------------------------
# page-side helpers (kept as JS strings so evaluate() calls stay tiny)
# ---------------------------------------------------------------------------
PW = """() => {
  const nodes = (window.app?.graph?._nodes || []).filter((n) => n.type === 'BadaPromptGenerator');
  const n = nodes[nodes.length - 1];
  if (!n) return null;
  const w = {};
  (n.widgets || []).forEach((x) => { w[x.name] = { type: x.type, value: x.value, options: (x.options && x.options.values) || null, hidden: !!x.hidden }; });
      return {
            id: n.id,
            size: n.size,
            title: n.title,
            widgets: w,
            targetLabel: n.widgets.find((x) => x.name === 'target')?.label,
            requestPlaceholder: n.widgets.find((x) => x.name === 'request_text')?.inputEl?.placeholder,
            uiLanguage: n.widgets.find((x) => x.name === 'ui_language')?.value,
            headerTitle: document.querySelector('.bpg-sec-title')?.textContent,
            toggleLabel: document.querySelector('.bpg-card-label')?.textContent,
      };
}"""

SET_TARGET = """([value]) => {
  const nodes = (window.app.graph._nodes || []).filter((n) => n.type === 'BadaPromptGenerator');
  const n = nodes[nodes.length - 1];
  if (!n) return null;
  const t = n.widgets.find((z) => z.name === 'target');
  const s = n.widgets.find((z) => z.name === 'submenu');
  if (!t) return null;
  t.value = value;
  if (t.callback) t.callback.call(t, value, window.app.canvas, n, null, {});
  return { target: t.value, submenu: s.value, options: (s.options.values || []).slice() };
}"""

SET_WIDGET = """([name, value]) => {
  const nodes = (window.app.graph._nodes || []).filter((n) => n.type === 'BadaPromptGenerator');
  const n = nodes[nodes.length - 1];
  if (!n) return null;
  const w = n.widgets.find((z) => z.name === name);
  if (!w) return null;
  w.value = value;
  const header = n.__bpgHeader;
  if (header && header.cards && header.cards[name]) header.cards[name].paint();
  return w.value;
}"""

TOAST_PROBE = """(msg) => {
  const api = window.app && window.app.api;
  if (!api || !api.dispatchEvent) return 'no-api';
  api.dispatchEvent(new CustomEvent('executed', {
    detail: { node: '1', output: { bada_promptgen_toast: [{ msg: msg, level: 'ok' }] } },
  }));
  return 'ok';
}"""


def shot(page, name):
    try:
        page.screenshot(path=os.path.join(SHOT_DIR, f"{name}.png"), full_page=False)
    except Exception as err:
        print("  screenshot skipped:", err)


reg0 = api_registry()
cfg0 = api_cfg()
n_prompts0 = len(reg0.get("user_prompts") or [])
target_names0 = [t.get("name") for t in (reg0.get("targets") or [])]
model_ids0 = [m.get("id") for m in (reg0.get("gemini_models") or [])]
print(f"pre-state: prompts={n_prompts0} targets={target_names0} "
      f"models={len(model_ids0)} default_model={cfg0.get('default_model')}")

console_errors, page_errors = [], []
asset_loaded = {"v": False}
created_names = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1600, "height": 1000})
    page = ctx.new_page()
    page.on("dialog", lambda d: d.accept())
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: page_errors.append(str(e)))
    page.on("request", lambda r: asset_loaded.__setitem__("v", True)
            if "bada_prompt_generator" in r.url else None)

    print("\n== 1. app boot ==")
    page.goto(BASE + "/index.html", wait_until="domcontentloaded", timeout=60000)
    page.wait_for_function("() => !!window.app && !!window.app.graph && !!window.LiteGraph", timeout=90000)
    page.wait_for_selector(".graphcanvas, canvas", timeout=60000)
    page.wait_for_timeout(6000)
    check("UI-A prompt generator asset requested", asset_loaded["v"])
    check("UI-B no page error from prompt generator module",
          not [e for e in page_errors if "promptgen" in e.lower() or "prompt_generator" in e.lower()],
          "; ".join(page_errors[:3]))
    check("UI-C BadaPromptGenerator node type registered",
          page.evaluate("() => !!window.LiteGraph?.registered_node_types?.['BadaPromptGenerator']"))
    browser_reg = page.evaluate(
        """async () => {
            const res = await fetch('/api/bada/promptgen/registry?ts=' + Date.now());
            const data = await res.json();
            return { status: res.status, targets: (data.registry?.targets || []).length };
        }"""
    )
    check("UI-D frontend fetch reaches the registry endpoint",
          browser_reg["status"] == 200 and browser_reg["targets"] == len(target_names0),
          str(browser_reg))
    shot(page, "01_boot")

    print("\n== 2. add node + header DOM ==")
    node_id = page.evaluate(
        """() => {
            const n = window.LiteGraph.createNode('BadaPromptGenerator');
            if (!n) return -1;
            n.pos = [420, 260];
            window.app.graph.add(n);
            window.app.graph.setDirtyCanvas(true, true);
            return n.id;
        }"""
    )
    check("UI-E node created on canvas", node_id not in (None, -1), str(node_id))
    page.wait_for_timeout(3500)
    state = page.evaluate(PW)
    widgets = (state or {}).get("widgets") or {}
    check("UI-F native widgets present", all(k in widgets for k in
          ("target", "submenu", "request_text", "duration", "enhance", "uncensored", "ui_language")),
          ",".join(sorted(widgets.keys())))
    check("UI-G boolean widgets collapsed into DOM toggle cards",
          widgets.get("enhance", {}).get("hidden") is True
          and widgets.get("uncensored", {}).get("hidden") is True
          and widgets.get("enhance", {}).get("type") == "hidden")
    check("UI-H target combo loaded from registry",
          (widgets.get("target", {}).get("options") or []) == target_names0,
          f"dom={len(widgets.get('target', {}).get('options') or [])} registry={len(target_names0)}")
    check("UI-I cascading submenu list matches the active target",
          (widgets.get("submenu", {}).get("options") or []) == names_of(reg0, widgets.get("target", {}).get("value")),
          f"{widgets.get('target', {}).get('value')} -> {widgets.get('submenu', {}).get('options')}")
    check("UI-J node header root rendered", page.locator(".bpg-root").count() > 0,
          f"count={page.locator('.bpg-root').count()}")
    check("UI-K api key input + model select present",
          page.locator(".bpg-key").count() == 1 and page.locator(".bpg-select").count() == 1)
    dom_opts = page.locator(".bpg-select option").count()
    check("UI-L model select lists every registry model", dom_opts == len(model_ids0),
          f"dom={dom_opts} registry={len(model_ids0)}")
    check("UI-M two toggle cards + manage button",
          page.locator(".bpg-card").count() == 2 and page.locator(".bpg-btn--manage").count() == 1)
    check("UI-N fixed-size header (400x138) keeps the node layout stable",
          abs((state or {}).get("size", [0, 0])[0] - 446) < 40 and (state or {}).get("size", [0, 0])[1] >= 520,
          f"size={state['size'] if state else None}")

    print("\n== 2a. Bada language setting ==")
    original_lang = page.evaluate("() => window.BadaI18n.lang")
    check("UI-O node display name is English", state.get("title") == "⚓ Bada Prompt Generator",
          str(state.get("title")))
    for lang, target_label, header_title, toggle_label, placeholder in (
        ("en", "Target Model", "🔑 API Key & Priority Model", "🔥 Enhance",
         "Enter a request (or connect images only)"),
        ("ko", "모델", "🔑 API Key & 우선순위 모델 선택", "🔥 증강",
         "요청사항을 입력하세요 (이미지만으로도 생성 가능)"),
    ):
        page.evaluate("(lang) => window.BadaI18n.setLanguage(lang)", lang)
        page.wait_for_timeout(150)
        lang_state = page.evaluate(PW)
        check(f"UI-{lang.upper()} node labels and header follow Bada language",
              lang_state.get("targetLabel") == target_label
              and lang_state.get("headerTitle") == header_title
              and lang_state.get("toggleLabel") == toggle_label,
              str(lang_state))
        check(f"UI-{lang.upper()} request placeholder and execution language follow setting",
              lang_state.get("requestPlaceholder") == placeholder
              and lang_state.get("uiLanguage") == lang,
              str(lang_state))
    page.evaluate("(lang) => window.BadaI18n.setLanguage(lang)", original_lang)
    page.wait_for_timeout(150)
    check("UI language restored after node checks", page.evaluate("() => window.BadaI18n.lang") == original_lang)
    shot(page, "02_node")

    init_enh = widgets["enhance"]["value"]
    init_unc = widgets["uncensored"]["value"]
    page.locator(".bpg-card").first.click()
    page.wait_for_timeout(450)
    st = page.evaluate(PW)
    enh, unc = st["widgets"]["enhance"]["value"], st["widgets"]["uncensored"]["value"]
    check("UI-O enhance card click flips the native widget", enh is (not init_enh),
          f"{init_enh} -> {enh}")
    check("UI-P card highlight follows widget values",
          page.locator(".bpg-card--on").count() == (1 if enh else 0) + (1 if unc else 0),
          f"on={page.locator('.bpg-card--on').count()} enhance={enh} uncensored={unc}")
    page.locator(".bpg-card").nth(1).click()
    page.wait_for_timeout(450)
    st2 = page.evaluate(PW)
    unc2 = st2["widgets"]["uncensored"]["value"]
    check("UI-Q uncensored card click flips its widget (cards are independent)",
          unc2 is (not unc) and st2["widgets"]["enhance"]["value"] is enh,
          f"uncensored {unc} -> {unc2}, enhance kept {enh}")
    page.evaluate(SET_WIDGET, ["enhance", init_enh])
    page.wait_for_timeout(350)
    check("UI-R widget -> card highlight (reverse sync) works",
          page.evaluate(PW)["widgets"]["enhance"]["value"] is init_enh
          and page.locator(".bpg-card--on").count() == (1 if init_enh else 0) + (1 if unc2 else 0),
          f"on={page.locator('.bpg-card--on').count()}")
    if unc2 is not init_unc:
        page.locator(".bpg-card").nth(1).click()
        page.wait_for_timeout(350)
    check("UI-S toggles restored to pre-test values",
          page.evaluate(PW)["widgets"]["uncensored"]["value"] is init_unc)
    shot(page, "03_toggle")

    print("\n== 4. cascading target -> submenu ==")
    cur_target = page.evaluate(PW)["widgets"]["target"]["value"]
    other = next((t for t in target_names0 if names_of(reg0, t) != names_of(reg0, cur_target)), None)
    check("UI-T a second target with a different submenu set exists", other is not None,
          f"current={cur_target}")
    if other:
        switched = page.evaluate(SET_TARGET, [other])
        page.wait_for_timeout(400)
        check("UI-U target switch rebuilds the submenu list",
              switched["options"] == names_of(reg0, other),
              f"{cur_target}({len(names_of(reg0, cur_target))}) -> {other}({len(switched['options'])})")
        check("UI-V submenu value falls inside the new list",
              switched["submenu"] in switched["options"], str(switched["submenu"]))
        back = page.evaluate(SET_TARGET, [cur_target])
        page.wait_for_timeout(400)
        check("UI-W switching back restores the original submenu list",
              back["options"] == names_of(reg0, cur_target) and back["target"] == cur_target)
    shot(page, "04_combo")

    print("\n== 5. websocket toast rendering ==")
    probe = page.evaluate(TOAST_PROBE, "BPG-UI-PROBE-TOAST")
    page.wait_for_timeout(700)
    toast_txt = " | ".join(page.locator(".bpg-toast").all_inner_texts())
    check("UI-X dispatched `executed` payload renders a node toast",
          probe == "ok" and "BPG-UI-PROBE-TOAST" in toast_txt,
          f"dispatch={probe} toasts={toast_txt[:120]}")

    print("\n== 6. API key row ==")
    check("UI-Y api key input is masked by default",
          page.locator(".bpg-key").get_attribute("type") == "password"
          and bool(page.locator(".bpg-key").get_attribute("placeholder")))
    page.locator(".bpg-icon-btn").first.click()
    page.wait_for_timeout(250)
    check("UI-Z eye button reveals the key",
          page.locator(".bpg-key").get_attribute("type") == "text"
          and page.locator(".bpg-icon-btn--on").count() == 1)
    page.locator(".bpg-icon-btn").first.click()
    page.wait_for_timeout(250)
    check("UI-AA eye button hides it again",
          page.locator(".bpg-key").get_attribute("type") == "password"
          and page.locator(".bpg-icon-btn--on").count() == 0)
    page.locator(".bpg-root .bpg-btn--accent").click()
    page.wait_for_selector(".bpg-toast--warn", timeout=8000)
    check("UI-AB [연결확인] with an empty key warns instead of calling the API",
          page.locator(".bpg-toast--warn").count() >= 1,
          page.locator(".bpg-toast--warn").first.inner_text())
    shot(page, "05_keyrow")

    print("\n== 7. priority model select -> localStorage + config.json ==")
    dom_models = page.evaluate(
        """() => { const s = document.querySelector('.bpg-select');
                   return { value: s.value, values: Array.from(s.options).map((o) => o.value) }; }"""
    )
    check("UI-AC select value follows the server default_model",
          dom_models["value"] == cfg0.get("default_model"),
          f"dom={dom_models['value']} config={cfg0.get('default_model')}")
    alt = next((v for v in dom_models["values"] if v != dom_models["value"]), None)
    check("UI-AD a second model option is available", alt is not None, str(dom_models["values"][:3]))
    if alt:
        with page.expect_response(
            lambda r: r.url.endswith("/api/bada/gemini/config") and r.request.method == "POST",
            timeout=25000,
        ):
            page.locator(".bpg-select").select_option(alt)
        page.wait_for_timeout(800)
        ls_model = page.evaluate("() => localStorage.getItem('bada_gemini_model')")
        check("UI-AE model change mirrors into localStorage", ls_model == alt, f"ls={ls_model}")
        check("UI-AF model change mirrors into config.json (queue-time mirror)",
              api_cfg().get("default_model") == alt, f"config={api_cfg().get('default_model')}")
        with page.expect_response(
            lambda r: r.url.endswith("/api/bada/gemini/config") and r.request.method == "POST",
            timeout=25000,
        ):
            page.locator(".bpg-select").select_option(dom_models["value"])
        page.wait_for_timeout(800)
        check("UI-AG original default_model restored",
              api_cfg().get("default_model") == cfg0.get("default_model"),
              f"config={api_cfg().get('default_model')}")

    print("\n== 8. prompt-management modal CRUD ==")
    page.locator(".bpg-btn--manage").click()
    page.wait_for_selector(".bpgm-overlay", timeout=25000)
    page.wait_for_timeout(900)
    check("UI-AH modal opens and lists every registry prompt",
          page.locator(".bpgm-item").count() == n_prompts0 and page.locator(".bpgm-panel").count() == 1,
          f"dom={page.locator('.bpgm-item').count()} api={n_prompts0}")
    check("UI-AI editor starts empty on a fresh open",
          page.locator(".bpgm-overlay .bpgm-input").nth(0).input_value() == ""
          and page.locator(".bpgm-overlay .bpgm-textarea").input_value() == "")
    shot(page, "06_modal_open")

    def modal_fill(name, text):
        page.locator(".bpgm-overlay .bpgm-btn--accent").click()
        page.wait_for_timeout(250)
        ins = page.locator(".bpgm-overlay .bpgm-input")
        ins.nth(0).fill(name)
        ins.nth(1).fill("created by the playwright UI smoke test")
        page.locator(".bpgm-overlay .bpgm-textarea").fill(text)
        page.wait_for_timeout(150)

    def modal_save():
        with page.expect_response(lambda r: "/user_prompts/save" in r.url, timeout=25000):
            page.locator(".bpgm-overlay .bpgm-btn--save").click()
        page.wait_for_timeout(900)

    def names_now():
        return [p.get("name") for p in (api_registry().get("user_prompts") or [])]

    name_a, text_a = "UISmokeAlpha", "Alpha system prompt written by bada_ui_smoke.py."
    name_b, text_b = "UISmokeBeta", "Beta system prompt written by bada_ui_smoke.py."
    created_names[:] = [name_a, name_b]

    modal_fill(name_a, text_a)
    modal_save()
    reg_a = api_registry()
    entry_a = next((p for p in (reg_a.get("user_prompts") or []) if p.get("name") == name_a), None)
    check("UI-AJ modal save persists the canonical `text` field (server round-trip)",
          bool(entry_a) and entry_a.get("text") == text_a
          and len(reg_a.get("user_prompts") or []) == n_prompts0 + 1,
          f"id={(entry_a or {}).get('id')} text_len={len((entry_a or {}).get('text') or '')} "
          f"count={len(reg_a.get('user_prompts') or [])}")
    check("UI-AK saved entry becomes the active row",
          page.locator(".bpgm-item--active").count() == 1
          and name_a in page.locator(".bpgm-item--active").inner_text())
    shot(page, "07_modal_saved")

    modal_fill(name_b, text_b)
    modal_save()
    order_ab = names_now()
    check("UI-AL second entry appended and listed",
          len(order_ab) == n_prompts0 + 2 and page.locator(".bpgm-item").count() == n_prompts0 + 2,
          f"api={order_ab}")

    page.locator(".bpgm-item").filter(has_text=name_a).first.locator(".bpgm-item-info").click()
    page.wait_for_timeout(500)
    loaded = page.evaluate(
        """() => { const ins = document.querySelectorAll('.bpgm-overlay .bpgm-input');
                   const ta = document.querySelector('.bpgm-overlay .bpgm-textarea');
                   return { name: ins[0].value, desc: ins[1].value, text: ta.value }; }"""
    )
    check("UI-AM clicking a row loads it into the editor",
          loaded["name"] == name_a and loaded["text"] == text_a,
          f"name={loaded['name']} text_len={len(loaded['text'])}")

    idx_b = order_ab.index(name_b)
    page.locator(".bpgm-item").nth(idx_b).locator(".bpgm-mini").nth(0).click()
    page.wait_for_timeout(2200)
    moved = names_now()
    check("UI-AN reorder (▲) reaches the API",
          moved.index(name_b) == idx_b - 1, f"{order_ab} -> {moved}")
    page.locator(".bpgm-item").nth(moved.index(name_b)).locator(".bpgm-mini").nth(1).click()
    page.wait_for_timeout(2200)
    check("UI-AO reorder (▼) restores the original order", names_now() == order_ab)

    print("\n== 9. modal -> registry -> node submenu (no restart) ==")
    dyn = next((t for t in (reg0.get("targets") or []) if t.get("dynamic") == "user_prompts"), None)
    check("UI-AP registry exposes a user_prompts-backed target", dyn is not None,
          str(dyn.get("name") if dyn else None))
    if dyn:
        live = api_registry()
        sw = page.evaluate(SET_TARGET, [dyn["name"]])
        page.wait_for_timeout(700)
        expected = names_of(live, dyn["name"])
        check("UI-AQ new prompts show up as submenu items right away",
              sw["options"] == expected and set(created_names).issubset(set(sw["options"])),
              f"dom={sw['options']} registry={expected}")
        back2 = page.evaluate(SET_TARGET, [cur_target])
        page.wait_for_timeout(500)
        check("UI-AR target switched back for cleanup", back2["target"] == cur_target)
    shot(page, "08_submenu_sync")

    print("\n== 10. cleanup ==")
    for nm in created_names:
        row = page.locator(".bpgm-item").filter(has_text=nm).first
        if row.count() == 0:
            continue
        with page.expect_response(lambda r: "/user_prompts/delete" in r.url, timeout=25000):
            row.locator(".bpgm-mini--del").click()
        page.wait_for_timeout(1300)
    final_names = names_now()
    check("UI-AS delete buttons removed both entries from the registry",
          len(final_names) == n_prompts0 and not any(n in final_names for n in created_names),
          f"count={len(final_names)}")

    page.locator(".bpgm-overlay .bpgm-x").click()
    page.wait_for_timeout(700)
    check("UI-AT modal closes", page.locator(".bpgm-overlay").count() == 0)

    removed = page.evaluate(
        """(id) => {
            const n = window.app.graph.getNodeById(id);
            if (!n) return 'missing';
            const g = window.app.graph;
            if (typeof g.remove === 'function') g.remove(n);
            else if (typeof g.removeNode === 'function') g.removeNode(n);
            else if (typeof n.onRemoved === 'function') n.onRemoved();
            return 'removed';
        }""",
        node_id,
    )
    page.wait_for_timeout(1200)
    check("UI-AU node removed and header DOM cleaned up",
          removed == "removed"
          and page.evaluate("() => (window.app.graph._nodes || []).filter((n) => n.type === 'BadaPromptGenerator').length") == 0
          and page.locator(".bpg-root").count() == 0,
          f"{removed}, root={page.locator('.bpg-root').count()}")
    check("UI-AV config.json default_model left untouched",
          api_cfg().get("default_model") == cfg0.get("default_model"),
          f"config={api_cfg().get('default_model')}")
    ours = [e for e in console_errors
            if any(k in e.lower() for k in ("promptgen", "prompt_generator", "bada-promptgen"))]
    check("UI-AW no console error from the prompt generator extension", not ours,
          "; ".join(e[:120] for e in ours[:3]))
    shot(page, "09_clean")
    browser.close()

# safety net — never leave a mutated config.json behind
if (api_cfg().get("default_model") or "") != (cfg0.get("default_model") or ""):
    requests.post(CFG_URL, json={"default_model": cfg0.get("default_model") or ""}, timeout=20)
    print(f"restored default_model -> {cfg0.get('default_model')}")

print(f"\n=== UI SMOKE: {sum(results)}/{len(results)} passed ===")
if not all(results):
    print("console errors:" + "".join(f"\n  - {e[:200]}" for e in console_errors[:10]))
    print("page errors:" + "".join(f"\n  - {e[:200]}" for e in page_errors[:10]))
sys.exit(0 if all(results) else 1)



