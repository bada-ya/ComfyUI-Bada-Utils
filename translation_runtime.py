from concurrent.futures import ThreadPoolExecutor
from threading import BoundedSemaphore
import urllib.error
import urllib.parse
import urllib.request

MAX_CONCURRENT_TRANSLATIONS = 2
MAX_QUEUED_TRANSLATIONS = 8
TRANSLATION_TIMEOUT_SECONDS = 20.0
TRANSLATION_ATTEMPT_TIMEOUT_SECONDS = 5.0

# Long text used to fail with HTTP 400 purely because of how it was SENT, not because the
# endpoint could not translate it. Measured against translate_a/single on 2026-10-04:
#
#   GET  2,250 Korean chars -> 200      GET  2,300 Korean chars -> 400
#   POST 40,000 Korean chars -> 200      (URL-encoded length ~16.5k is the GET ceiling)
#
# The text was being percent-encoded into the query string, and Google rejects the resulting
# URL outright once it grows past roughly 16.5k characters. So every node report of "long text
# doesn't translate" was a transport failure masquerading as a translation failure — short text
# simply never reached the limit.
#
# POST carries the same parameters in a form body, where there is no such ceiling, so this is
# the primary path now. The GET strategies remain in the caller as a fallback: POST is not
# universally available across every endpoint/mirror, and degrading to the old behaviour is
# strictly better than failing.
TRANSLATION_POST_CONTENT_TYPE = "application/x-www-form-urlencoded"

# Guard against pathological input (pasted logs, minified blobs). Far above anything a human
# would write in a prompt box, and well under the request-size limits of the endpoints.
TRANSLATION_MAX_CHARS = 200_000


def parse_translate_response(res_json):
    """
    Extract translated text from a translate_a/* JSON payload.

    Google returns two shapes depending on the endpoint:
      A: [[["translated", "source", ...], ...], ...]   (translate_a/single with dt=t)
      B: ["translated", "translated", ...]             (older/other endpoints)

    Returns "" when the payload is well-formed JSON but carries no translation — the caller treats
    that as "this endpoint did not answer" and tries the next one, rather than reporting success
    with an empty string. That distinction matters now that every endpoint is tried twice (POST
    then GET): an empty parse must fall through, not short-circuit the failover.
    """
    if not isinstance(res_json, list) or len(res_json) == 0:
        return ""

    if isinstance(res_json[0], list) and len(res_json[0]) > 0:
        if isinstance(res_json[0][0], list):
            chunks = [
                item[0]
                for item in res_json[0]
                if item and isinstance(item, list) and len(item) > 0 and item[0]
            ]
            return "".join(chunks)

    if isinstance(res_json[0], str):
        return "".join([c for c in res_json if isinstance(c, str)])

    return ""

_translation_executor = ThreadPoolExecutor(
    max_workers=MAX_CONCURRENT_TRANSLATIONS,
    thread_name_prefix="bada-translate",
)
_translation_slots = BoundedSemaphore(MAX_CONCURRENT_TRANSLATIONS + MAX_QUEUED_TRANSLATIONS)


def post_translation(url, params, headers, timeout):
    """
    Issue a translate_a/* request as POST instead of GET.

    Same URL and same parameter names as the GET path; only the transport differs. Google accepts
    `application/x-www-form-urlencoded` bodies on these endpoints, and the body is not subject to
    the query-string length ceiling that made long text fail with HTTP 400.

    Built on urllib (not requests) to match the rest of this module, which deliberately has no
    third-party dependencies.
    """
    body = urllib.parse.urlencode(params).encode("utf-8")
    request_headers = dict(headers or {})
    request_headers["Content-Type"] = TRANSLATION_POST_CONTENT_TYPE
    request_headers["Content-Length"] = str(len(body))

    req = urllib.request.Request(url, data=body, headers=request_headers, method="POST")
    # Bypass a corrupted local proxy config, exactly as the GET path does.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(req, timeout=timeout) as response:
        return response.read()


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