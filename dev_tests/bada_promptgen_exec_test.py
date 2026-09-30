"""End-to-end /prompt execution test for BadaPromptGenerator.

enhance=OFF path (zero API calls): the node must execute, pass request_text
straight through `generated_text`, leave wh_ratio empty and emit the
`bada_promptgen_toast` ui key (ComfyUI forwards any non-empty `ui` dict through
the websocket `executed` event, so a non OUTPUT_NODE still reaches the browser).

Contract points exercised here (must match web/bada_prompt_generator.js):
  GET  /api/bada/promptgen/registry
  POST /prompt  with widget keys enhance/uncensored/target/submenu/request_text(+duration)
A unique marker is injected into request_text so ComfyUI's output cache
cannot serve a stale result.

Run (against a throw-away instance — never against the daily driver port 8188):
    python dev_tests/bada_promptgen_exec_test.py
    BADA_TEST_BASE=http://127.0.0.1:8199   # override the target instance
"""
import io
import os
import sys
import time
import uuid

import requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
BASE = os.environ.get("BADA_TEST_BASE", "http://127.0.0.1:8199").rstrip("/")
REGISTRY_URL = BASE + "/api/bada/promptgen/registry"
results = []


def check(label, cond, info=""):
    results.append(bool(cond))
    print(f"[{'PASS' if cond else 'FAIL'}] {label}" + (f" :: {info}" if info else ""))


try:
    r = requests.get(REGISTRY_URL, params={"ts": uuid.uuid4().hex[:6]}, timeout=20)
    payload = r.json()
except Exception as exc:  # noqa: BLE001
    print(f"[ABORT] registry fetch failed: {exc}")
    sys.exit(2)

check("REG-ENDPOINT-OK", r.status_code == 200 and payload.get("success") is True,
      f"status={r.status_code} url={REGISTRY_URL}")
reg = payload.get("registry") or {}
targets = reg.get("targets") or []
check("REG-TARGETS-PRESENT", len(targets) >= 1, f"count={len(targets)}")

t0 = targets[0].get("name")
sub_objs = targets[0].get("submenus") or []
sub0 = sub_objs[0].get("name") if sub_objs else "\uc77c\ubc18"
print(f"target={t0!r} submenu={sub0!r} submenus={[s.get('name') for s in sub_objs]}")

token = uuid.uuid4().hex[:8]
req_text = f"[exec-verify {token}] a cinematic red fox running through snow, 35mm"

# ---- pick a downstream consumer node that accepts any input type ----------
consumer = None
try:
    info = requests.get(BASE + "/object_info", timeout=90).json()
    preferred = ("ShowText", "PreviewAny", "DisplayAny", "AnyToString")
    for name in preferred:
        spec = info.get(name)
        if not spec:
            continue
        req = ((spec.get("input") or {}).get("required") or {})
        if not req:
            continue
        consumer = (name, next(iter(req)))
        break
    if consumer is None:
        for name, spec in info.items():
            req = ((spec.get("input") or {}).get("required") or {})
            if any(isinstance(v, (list, tuple)) and any("*" in str(x) for x in v) for v in req.values()):
                consumer = (name, next(iter(req)))
                break
except Exception as exc:  # noqa: BLE001
    print(f"[WARN] consumer discovery failed: {exc}")
check("CONSUMER-FOUND", consumer is not None, str(consumer))
consumer = consumer or ("PreviewAny", "source")

wf = {
    "1": {"class_type": "BadaPromptGenerator",
          "inputs": {"enhance": False, "uncensored": False, "target": t0, "submenu": sub0,
                     "request_text": req_text, "duration": 10}},
    "2": {"class_type": consumer[0], "inputs": {consumer[1]: ["1", 0]}},
    "3": {"class_type": consumer[0], "inputs": {consumer[1]: ["1", 1]}},
}
r = requests.post(BASE + "/prompt", json={"prompt": wf, "client_id": "exec-verify"}, timeout=30)
check("EXEC-PROMPT-ACCEPTED", r.status_code == 200, f"{r.status_code} {r.text[:300]}")
if r.status_code != 200:
    print("\n=== EXEC TEST ABORTED (prompt rejected) ===")
    sys.exit(1)
pid = (r.json() or {}).get("prompt_id")

done, hist = False, {}
for _ in range(60):
    time.sleep(1.5)
    try:
        h = requests.get(BASE + f"/history/{pid}", timeout=20).json().get(pid)
    except Exception:  # noqa: BLE001
        continue
    if h:
        hist = h
        if (h.get("status") or {}).get("completed"):
            done = True
            break
check("EXEC-DONE", done, str((hist.get("status") or {}).get("messages", [])[-2:])[:250])

outs = (hist.get("outputs") or {}).get("1", {})
res = (hist.get("outputs") or {}).get("2", {})
res2 = (hist.get("outputs") or {}).get("3", {})
# Regular (non-ui) outputs of a non-OUTPUT_NODE are not stored in history ->
# the downstream consumer is the authoritative witness of both sockets.
got = (res.get("text") or res.get("images") or [""])[0]
ratio = (res2.get("text") or [""])[0]
if isinstance(got, list):
    got = str(got)
print(f"node1 output keys={list(outs.keys())} toasts={outs.get('bada_promptgen_toast')}")
print(f"consumer(node2).text = {str(got)[:220]!r}")
print(f"consumer(node3).text = {str(ratio)[:60]!r}")
check("EXEC-TOAST-KEY-EMITTED", "bada_promptgen_toast" in outs, str(list(outs.keys())))
check("EXEC-PASSTHROUGH-TEXT", str(got).strip() == req_text.strip(),
      f"marker={token in str(got)} len={len(str(got))}")
check("EXEC-WH-RATIO-EMPTY", str(ratio) == "", repr(str(ratio)[:40]))
check("EXEC-CONSUMER-RECEIVED", bool(res) and bool(str(got)), "node2 received the generated text")
errs = (hist.get("status") or {}).get("messages") or []
check("EXEC-NO-ERROR-MSG", not any("execution_error" in str(m[0]) for m in errs if isinstance(m, (list, tuple))),
      str(errs)[-200:])

print(f"\n=== EXEC TEST: {sum(results)}/{len(results)} passed ===")
sys.exit(0 if all(results) else 1)
