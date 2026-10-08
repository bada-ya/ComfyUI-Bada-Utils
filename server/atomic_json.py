"""
Shared, crash-safe JSON persistence.

Every user-visible setting the pack writes — the Gemini API key, the workflow metadata,
the preset store, the favourites list — used to be written with a plain
``open(path, "w")``. That truncates the file FIRST and writes second, so a crash, a
power cut or a full disk in between leaves a half-written (usually empty) file behind and
the setting is silently gone. The chat-history store already avoided this with a private
temp-file dance; this module is that same routine, promoted to one place so no new write
site can forget it.

The sequence is the only one that is safe here:

1. serialise into a temp file **in the same directory** (a temp file in %TEMP% would be a
   different filesystem, and ``os.replace`` cannot move across filesystems),
2. ``flush`` + ``fsync`` so the bytes are on the disk, not merely in the OS buffer,
3. ``os.replace``, which is atomic on Windows and POSIX — a reader sees either the whole
   old file or the whole new one, never a partial one,
4. keep the previous contents as ``<name>.bak`` so a bad write is still recoverable.

The directory fsync in step 5 is skipped on Windows, where opening a directory handle is
not supported; ``os.replace`` is already durable there once the file itself was fsynced.
"""
import json
import logging
import os
import tempfile

logger = logging.getLogger("ComfyUI-Bada-Utils")


def write_json_atomic(path: str, payload, *, indent: int = 2, backup: bool = True) -> None:
    """Serialise ``payload`` to ``path`` without ever leaving a partial file behind.

    Raises on failure (after removing its own temp file), so callers keep their existing
    ``except`` handling and their honest error messages.
    """
    directory = os.path.dirname(path) or "."
    os.makedirs(directory, exist_ok=True)

    if backup and os.path.exists(path):
        try:
            with open(path, "rb") as source, open(path + ".bak", "wb") as target:
                target.write(source.read())
        except OSError as exc:  # noqa: BLE001
            # A missing backup must never block the real write.
            logger.warning("[Bada] backup of %s failed: %s", path, exc)

    handle = tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", delete=False, dir=directory, suffix=".tmp"
    )
    try:
        with handle:
            json.dump(payload, handle, ensure_ascii=False, indent=indent)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(handle.name, path)
    except BaseException:
        try:
            if os.path.exists(handle.name):
                os.remove(handle.name)
        except OSError:
            logger.debug("[Bada] temp cleanup failed for %s", path, exc_info=True)
        raise

    if os.name != "nt":
        # Persist the rename itself, so the swap survives a power cut too. Windows has no
        # directory fsync and does not need one here.
        try:
            fd = os.open(directory, os.O_RDONLY)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
        except OSError:  # noqa: BLE001
            logger.debug("[Bada] directory fsync skipped for %s", path, exc_info=True)
