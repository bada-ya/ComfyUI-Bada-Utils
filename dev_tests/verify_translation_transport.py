"""
Live proof for the POST transport fix (2026-10-04).

Runs the REAL translation_runtime.post_translation() against the REAL Google endpoints, in the
same POST-then-GET order as server/bada_server_api.py's handler, across the character counts that
used to fail. Behavioural counterpart to bada_translation_transport_test.js, which only pins the
wiring.

    python dev_tests/verify_translation_transport.py

Read-only: talks to the public translate endpoint, writes nothing locally, and does not need a
running ComfyUI.

ENVIRONMENT NOTE: a stray PYTHONPATH (e.g. a Python 3.9 tree on a 3.12 interpreter) makes
`import socket` fail with "Module use of python39.dll conflicts with this version of Python".
Run as:  $env:PYTHONPATH=$null; python dev_tests/verify_translation_transport.py
"""
import importlib.util
import json
import os
import time
import urllib.parse
import urllib.request

_SPEC = importlib.util.spec_from_file_location(
    "tr", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "translation_runtime.py")
)
tr = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(tr)

HDR = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Referer": "https://translate.google.com/",
}

# The first two strategies from bada_server_api.py - the ones that used to 400 on long input.
STRATEGIES = [
    ("https://translate.googleapis.com/translate_a/single",
     {"client": "dict-chrome-ex", "sl": "ko", "tl": "en", "dt": "t"}),
    ("https://clients5.google.com/translate_a/t",
     {"client": "dict-chrome-ex", "sl": "ko", "tl": "en"}),
]

SENTENCE = "\uc548\ub155\ud558\uc138\uc694. \uc774\uac83\uc740 \uc544\uc9c1 \uae34 \ud55c\uad6d\uc5b4 \ud14d\uc2a4\ud2b8 \ubc84\uc804 \ud14c\uc2a4\ud2b8\uc785\ub2c8\ub2e4. "

# 2,300 is the first size that used to fail with GET (HTTP 400 at a ~16.5k URL).
SIZES = (100, 2300, 5000, 20000, 40000)


def make_text(n):
    out = ""
    while len(out) < n:
        out += SENTENCE
    return out[:n]


def translate(text, deadline=None):
    """POST first, then GET - the same order the handler uses."""
    deadline = deadline or (time.monotonic() + tr.TRANSLATION_TIMEOUT_SECONDS)
    last_error = None

    for base_url, template in STRATEGIES:
        params = dict(template, q=text)
        try:
            raw = tr.post_translation(
                base_url, params, HDR,
                min(tr.TRANSLATION_ATTEMPT_TIMEOUT_SECONDS, max(0.1, deadline - time.monotonic())),
            )
            out = tr.parse_translate_response(json.loads(raw.decode("utf-8")))
            if out:
                return out, "POST"
        except Exception as err:
            last_error = err

    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for base_url, template in STRATEGIES:
        params = dict(template, q=text)
        try:
            url = "{}?{}".format(base_url, urllib.parse.urlencode(params))
            with opener.open(urllib.request.Request(url, headers=HDR), timeout=5.0) as resp:
                out = tr.parse_translate_response(json.loads(resp.read().decode("utf-8")))
                if out:
                    return out, "GET"
        except Exception as err:
            last_error = err

    raise last_error or RuntimeError("no translation returned")


def main():
    failed = 0
    for n in SIZES:
        try:
            out, how = translate(make_text(n))
            ok = len(out) > 0
            failed += 0 if ok else 1
            print("[{}] chars={:>6} -> via {:<4} outLen={}".format(
                "PASS" if ok else "FAIL", n, how, len(out)))
        except Exception as err:
            failed += 1
            print("[FAIL] chars={:>6} -> {}: {}".format(n, type(err).__name__, err))

    total = len(SIZES)
    print("\n=== {}/{} checks passed ===".format(total - failed, total))
    if failed:
        print("RESULT: FAIL")
        return 1
    print("RESULT: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())