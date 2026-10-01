from concurrent.futures import ThreadPoolExecutor
from threading import BoundedSemaphore

MAX_CONCURRENT_TRANSLATIONS = 2
MAX_QUEUED_TRANSLATIONS = 8
TRANSLATION_TIMEOUT_SECONDS = 20.0
TRANSLATION_ATTEMPT_TIMEOUT_SECONDS = 5.0

_translation_executor = ThreadPoolExecutor(
    max_workers=MAX_CONCURRENT_TRANSLATIONS,
    thread_name_prefix="bada-translate",
)
_translation_slots = BoundedSemaphore(MAX_CONCURRENT_TRANSLATIONS + MAX_QUEUED_TRANSLATIONS)


def submit_translation(function, *args, **kwargs):
    if not _translation_slots.acquire(blocking=False):
        return None

    try:
        future = _translation_executor.submit(function, *args, **kwargs)
    except Exception:
        _translation_slots.release()
        raise

    future.add_done_callback(lambda _: _translation_slots.release())
    return future