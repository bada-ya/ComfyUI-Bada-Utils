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

Requirements (install into the ComfyUI venv or any Python 3.10+):

```powershell
pip install requests playwright
playwright install chromium
```

Run:

```powershell
python dev_tests/bada_promptgen_exec_test.py
python dev_tests/bada_promptgen_ui_smoke.py      # screenshots -> dev_tests/_shots (gitignored)
```

Both scripts exit non-zero on the first failed check and print a `PASS/FAIL` line
per assertion. The UI smoke test is **idempotent**: every prompt it creates is
deleted again and `config.json`'s `default_model` is restored, so it can be
re-run at any time. Scratch artifacts:

- `dev_tests/_shots/*.png` — per-section screenshots (`BADA_TEST_SHOTS` overrides the path)
- `engines_registry.json.bak` — snapshot written by the REST API before each save (gitignored)

> Note: ComfyUI history only stores outputs of `OUTPUT_NODE`s, which is why the
> exec test verifies the data flow through a downstream consumer node
> (`ShowText` / `PreviewAny`) rather than reading node 1's own outputs.
