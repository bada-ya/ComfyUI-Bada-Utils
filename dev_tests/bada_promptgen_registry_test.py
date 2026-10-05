"""Registry integrity for BadaPromptGenerator.

The header renders `name_en` while still sending `name` as the widget VALUE, so a
mistake in either direction is silent: the UI shows the wrong language, or the backend
stops finding the submenu. This asserts the separation holds for every entry, and that
the画面 비율 directive still reaches every engine path.

Hermetic — stubs `aiohttp` and imports the node as a package, so it needs no running
ComfyUI instance and no `pip install`.
"""
import importlib
import os
import sys
import types

PKG_NAME = "bada_pkg"  # the real dir name contains "-" and cannot be an identifier
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# aiohttp is only needed at import time for the route decorators.
aiohttp_stub = types.ModuleType("aiohttp")


class _Web:
    """Minimal stand-in for the `aiohttp.web` names the server module uses."""

    @staticmethod
    def json_response(data=None, status=200, **kwargs):
        return {"data": data, "status": status}

    @staticmethod
    def FileResponse(path=None, **kwargs):
        return {"path": path}

    class HTTPRequestEntityTooLarge(Exception):
        status = 413


aiohttp_stub.web = _Web()
sys.modules["aiohttp"] = aiohttp_stub

pkg = types.ModuleType(PKG_NAME)
pkg.__path__ = [REPO_ROOT]
sys.modules[PKG_NAME] = pkg

mod = importlib.import_module(f"{PKG_NAME}.nodes.bada_prompt_generator")
registry = mod.load_registry()

results = []


def check(label, cond, info=""):
    results.append(bool(cond))
    print(f"[{'PASS' if cond else 'FAIL'}] {label}" + (f" :: {info}" if info else ""))


RATIO = "9:16"
MARK = "ASPECT RATIO DIRECTIVE"

for target in registry["targets"]:
    name = target.get("name")
    check(f"target {name!r} has an English name", bool(target.get("name_en")),
          f"name_en={target.get('name_en')!r}")

    resolved_t = mod.resolve_target(registry, name)
    check(f"target {name!r} resolves by its `name`",
          resolved_t is not None and resolved_t.get("name") == name)

    for sub in target.get("submenus") or []:
        sub_name = sub.get("name")
        tag = f"{name}/{sub_name}"

        check(f"{tag} has an English name", bool(sub.get("name_en")),
              f"name_en={sub.get('name_en')!r}")

        resolved_s = mod.resolve_submenu(resolved_t, sub_name)
        check(f"{tag} resolves by its `name`",
              resolved_s is not None and resolved_s.get("name") == sub_name)

        prompt = mod.build_system_prompt(registry, resolved_s, 1, 10, True, RATIO)
        check(f"{tag} still receives the {RATIO} directive", MARK in prompt)

        # `name_en` is display-only: it must never reach the system instruction. Skipped
        # when the two are equal (T2VA, LTX 2.5, ...), where the mode name legitimately
        # appears in the engine text.
        if sub.get("name_en") and sub["name_en"] != sub_name:
            check(f"{tag} does not leak name_en into the prompt",
                  sub["name_en"] not in prompt)

passed = sum(results)
print(f"\n=== {passed}/{len(results)} checks passed ===")
print("RESULT:", "PASS" if passed == len(results) else "FAIL")
sys.exit(0 if passed == len(results) else 1)