"""Read-only readiness check for the user's live ComfyUI (default 8188).

Verifies that the running server already exposes the BadaPromptGenerator node,
the promptgen REST route and the latest frontend assets - without mutating
anything (no registry writes, no queue submissions).

    python dev_tests/bada_promptgen_live_check.py            # 8188
    BADA_TEST_BASE=http://127.0.0.1:8199 python dev_tests/bada_promptgen_live_check.py
"""
import io
import os
import sys

import requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
BASE = os.environ.get("BADA_TEST_BASE", "http://127.0.0.1:8188").rstrip("/")
EXT = "/extensions/ComfyUI-Bada-Utils/"

ASSETS = (
    ("bada_prompt_generator.js", "bpg-card--on"),
    ("bada_prompt_generator.css", ".bpgm-overlay"),
    ("bada_promptgen_modal.js", "bpgm-btn--accent"),
    ("bada_i18n.js", "BadaI18n"),
)

ok = True


def line(label, cond, info=""):
    global ok
    ok = ok and bool(cond)
    print(f"[{'PASS' if cond else 'FAIL'}] {label}" + (f" :: {info}" if info else ""))


print(f"target: {BASE}")
try:
    reg = requests.get(BASE + "/api/bada/promptgen/registry", params={"t": "chk"}, timeout=20).json()["registry"]
except Exception as exc:  # noqa: BLE001
    print(f"[FAIL] registry endpoint unreachable: {exc}")
    print("       -> the running server predates the promptgen API: restart ComfyUI.")
    sys.exit(1)

line("registry route alive", True,
     f"targets={[t.get('name') for t in reg.get('targets') or []]} "
     f"models={len(reg.get('gemini_models') or [])} "
     f"user_prompts={len(reg.get('user_prompts') or [])}")

info = requests.get(BASE + "/object_info", timeout=120).json()
node = info.get("BadaPromptGenerator") or {}
line("BadaPromptGenerator node registered", bool(node), f"category={node.get('category')}")

for name, marker in ASSETS:
    try:
        res = requests.get(BASE + EXT + name, params={"t": "chk"}, timeout=30)
        line(f"asset served: {name}",
             res.status_code == 200 and marker in res.text,
             f"HTTP {res.status_code} bytes={len(res.content)} marker({marker})={marker in res.text}")
    except Exception as exc:  # noqa: BLE001
        line(f"asset served: {name}", False, str(exc))

print("\n=== LIVE CHECK:", "READY - hard-refresh the browser (Ctrl+F5) and add the node ==="
      if ok else "NOT READY - see FAIL lines above ===")
sys.exit(0 if ok else 1)
