# -*- coding: utf-8 -*-
"""Shared PromptServer route registration with bounded retry.

ComfyUI creates ``server.PromptServer.instance`` during startup, but custom-node
modules are imported in a version-dependent order — on some hosts (and in tests)
the import happens BEFORE the instance exists, so registering routes at import
time can hit ``instance is None``. Historically each register_* function handled
that case differently: one logged "will be registered on server start" (with no
such mechanism), another raised AttributeError and lost every route — and because
``__init__.py`` used to wrap all four calls in a single try/except, one failure
skipped the rest as well.

This module gives every register_* function ONE bounded retry policy: if the
instance exists, register immediately; otherwise a daemon poller registers it as
soon as it appears (or gives up after ``DEFAULT_TIMEOUT_S`` with a clear log).
Registration is idempotent per label, so repeated calls never double-register.

Threading note: in every known ComfyUI startup order there is a wide gap between
instance creation and ``PromptServer.add_routes()`` (which copies the route table
into the running app), so registering from the poller thread lands safely before
the app freezes its routes. If that ever changes, the timeout log line below is
the diagnostic to look for.
"""
from __future__ import annotations

import logging
import threading
import time

logger = logging.getLogger("ComfyUI-Bada-Utils")

POLL_INTERVAL_S = 0.5
DEFAULT_TIMEOUT_S = 120.0

_labels_done: set = set()
_lock = threading.Lock()


def _prompt_server_instance():
    """Return the live PromptServer instance, or None (never raises)."""
    try:
        import server
        prompt_server_cls = getattr(server, "PromptServer", None)
        if prompt_server_cls is None:
            return None
        return prompt_server_cls.instance
    except Exception:  # noqa: BLE001 — no ComfyUI `server` module at all (tests etc.)
        return None


def register_when_ready(register_fn, *, label: str, timeout: float = DEFAULT_TIMEOUT_S) -> bool:
    """Run ``register_fn()`` once the PromptServer instance is available.

    - Instance exists now  → register immediately on the calling thread.
    - Instance missing yet → spawn a bounded daemon poller (0.5s interval,
      ``timeout`` seconds total) that registers as soon as it appears.
    Idempotent per ``label``: at most one attempt is ever made, so callers may
    invoke this freely without risking duplicate route registration. Never raises.

    Returns True when registration was attempted synchronously (instance existed),
    False when a background poller was spawned or the label was already handled.
    """
    with _lock:
        if label in _labels_done:
            return False
        _labels_done.add(label)

    def _attempt() -> None:
        try:
            register_fn()
            logger.info("[Bada-Utils] %s registered.", label)
        except Exception as exc:  # noqa: BLE001 — one failure must not kill startup
            logger.warning(
                "[Bada-Utils] %s registration failed (routes unavailable this session): %s",
                label, exc,
            )

    if _prompt_server_instance() is not None:
        _attempt()
        return True

    def _poll() -> None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            time.sleep(POLL_INTERVAL_S)
            if _prompt_server_instance() is not None:
                logger.info("[Bada-Utils] PromptServer instance appeared — registering %s now.", label)
                _attempt()
                return
        logger.warning(
            "[Bada-Utils] %s: PromptServer instance never appeared within %.0fs; "
            "routes will NOT be registered this session (check ComfyUI startup order).",
            label, timeout,
        )

    threading.Thread(target=_poll, name=f"bada-routes-{label}", daemon=True).start()
    return False
