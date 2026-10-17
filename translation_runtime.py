import json
import logging
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from threading import BoundedSemaphore

logger = logging.getLogger("ComfyUI-Bada-Utils")

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

# Realistic browser headers to prevent 429 bot blocking.
# Single source of truth — nodes import this instead of redefining it.
BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://translate.google.com/",
}

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


def translation_strategies(query_text, source_lang="auto", target_lang="en"):
    """The 4-tier endpoint/client strategy list in failover order.

    Shared by every caller of fetch_translation_with_failover() — keep the order and
    parameter shapes here only (single source of truth).
    """
    return [
        # 1. Google Chrome Extension official client (highest quota, practically immune to 429)
        (
            "https://translate.googleapis.com/translate_a/single",
            {"client": "dict-chrome-ex", "sl": source_lang, "tl": target_lang, "dt": "t", "q": query_text},
        ),
        # 2. Clients5 translate endpoint
        (
            "https://clients5.google.com/translate_a/t",
            {"client": "dict-chrome-ex", "sl": source_lang, "tl": target_lang, "q": query_text},
        ),
        # 3. Standard GTX client on translate.googleapis.com
        (
            "https://translate.googleapis.com/translate_a/single",
            {"client": "gtx", "sl": source_lang, "tl": target_lang, "dt": "t", "q": query_text},
        ),
        # 4. Standard GTX client on translate.google.com
        (
            "https://translate.google.com/translate_a/single",
            {"client": "gtx", "sl": source_lang, "tl": target_lang, "dt": "t", "q": query_text},
        ),
    ]


def fetch_translation_with_failover(query_text, source_lang="auto", target_lang="en",
                                    headers=None, deadline=None, context=""):
    """Canonical 4-strategy POST→GET failover for translate_a/* endpoints.

    Single implementation shared by the translator node and the Note Helper API —
    each caller used to carry its own copy of this loop (drift risk).

    TRANSPORT FIRST (2026-10-04): every strategy is tried as POST first, because GET with
    the text percent-encoded into the query string is rejected with HTTP 400 once the URL
    passes ~16.5k characters (~2,300 Korean chars). POST carries the same parameters in a
    form body with no such ceiling (verified to 40,000 chars); GET stays as a fallback so
    no endpoint/mirror that worked before can regress.

    Returns the translated text; when every strategy produced no parseable answer but none
    raised, falls back to the input unchanged (mirrors the pre-refactor behaviour).
    """
    deadline = deadline or (time.monotonic() + TRANSLATION_TIMEOUT_SECONDS)
    ctx = f" {context}" if context else ""
    strategies = translation_strategies(query_text, source_lang, target_lang)

    last_error = None
    # Direct opener — ignore corrupted local proxy config.
    direct_opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    for base_url, params in strategies:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("Translation exceeded the 20-second overall timeout")
        try:
            raw_bytes = post_translation(
                base_url,
                params,
                headers or BROWSER_HEADERS,
                min(TRANSLATION_ATTEMPT_TIMEOUT_SECONDS, remaining),
            )
            parsed = parse_translate_response(json.loads(raw_bytes.decode("utf-8")))
            if parsed:
                return parsed
        except Exception as err:
            last_error = err
            logger.warning(
                "[Bada-Translate]%s POST %s (%s) failed, falling back to GET: %s",
                ctx, base_url, params.get("client"), err,
            )
            continue

    for base_url, params in strategies:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("Translation exceeded the 20-second overall timeout")
        try:
            url = f"{base_url}?{urllib.parse.urlencode(params)}"
            req = urllib.request.Request(url, headers=headers or BROWSER_HEADERS)
            with direct_opener.open(
                req,
                timeout=min(TRANSLATION_ATTEMPT_TIMEOUT_SECONDS, remaining),
            ) as response:
                parsed = parse_translate_response(json.loads(response.read().decode("utf-8")))
                if parsed:
                    return parsed
        except Exception as err:
            last_error = err
            logger.warning(
                "[Bada-Translate]%s GET %s (%s) failover: %s",
                ctx, base_url, params.get("client"), err,
            )
            continue

    if time.monotonic() >= deadline:
        raise TimeoutError("Translation exceeded the 20-second overall timeout")
    if last_error:
        raise last_error
    return query_text


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