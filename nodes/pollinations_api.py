"""
ComfyUI-Bada-Utils: Pollinations.AI provider bridge (added 2026-11-01, round 13)

Pollinations.AI (https://pollinations.ai) is a keyless text endpoint. It sits **next to**
the Gemini engine rather than inside its quota logic:

  * No API key and no Google project, so there is no RequestsPerDayPerProjectPerModel
    bucket to spend - which is exactly why it was added.
  * It does not speak the Gemini REST contract: no safetySettings, no system_instruction,
    no responseSchema, no finishReason, no candidates[].
  * The anonymous tier is rate limited **per IP**: text is one request at a time, at
    least 30 seconds apart. Beyond that the API answers **HTTP 402** (Payment Required)
    with a `Retry-After` header - not 429, and not a daily bucket.

Verified against the live service on 2026-11-01 (the docs and the service disagree about
model names often enough that both were checked):

    GET  https://text.pollinations.ai/models
         -> [{"name": "openai-fast", "tier": "anonymous", "input_modalities": ["text"], ...}]
    POST https://text.pollinations.ai/    {"model": ..., "messages": [...]}
         -> 200, `text/plain`, body is the completion itself (no envelope)

Consequences pinned here:
  1. Not part of the 4-model Gemini lineup (EXACT_MODELS) and NOT subject to
     mark_model_dead() / is_model_dead() - that 404 cache keys Gemini model ids, and
     retiring "openai-fast" after a transient 5xx would be wrong until a restart.
  2. The "one system instruction" contract survives because the same system text is sent
     as a real `role: system` message (build_messages). A responseSchema has no
     equivalent on this API, so it becomes an explicit "answer JSON only" instruction and
     _extract_json() on the answer.
  3. call_text() answers in the exact `(status, body)` contract of
     nodes/bada_prompt_generator.py::_post_generate_content, so the 3-Pass logic, the
     refusal check and the failure toasts are reused instead of duplicated.
  4. The trailing slash of the root route is load bearing: without it the server answers
     301 and urllib would follow it as a GET, dropping the body.

No third-party package is imported (urllib.request only, the same policy as
nodes/gemini_prompt_generator.py, so the file loads even when `requests` is missing).
Logs and exceptions stay ASCII/English - repository rule, see test_log_language.py.
"""
import json
import urllib.error
import urllib.request

DEFAULT_BASE_URL = "https://text.pollinations.ai"

# The anonymous tier served exactly one text model when this was written
# (`openai-fast` = GPT-OSS 20B). `flux` is an **image** model and answers
# `Cannot POST /flux`; a dropdown that ships names the tier does not serve is a bug that
# only shows up as a failure on the user's first generation. `list_models()` refreshes
# this from GET {base}/models, but nothing here may reach the network at import.
MODELS = ("openai-fast",)
DEFAULT_MODEL = MODELS[0]

# Root route = plain-text completion. `{base}` is always followed by "/" (see note 4).
TEXT_PATH = "{base}/"
MODELS_PATH = "{base}/models"
REFERRER = "bada-yaml"

# Anonymous tier: one text request per IP per ~30 s. A generation is a single call, so
# this is a ceiling on how fast the node may retry, not a budget to spend.
RATE_LIMIT_WINDOW_S = 30

USER_AGENT = "ComfyUI-Bada-Utils/1.0 (Pollinations bridge)"

# 402 is documented as the over-limit answer; 429 is what a proxy in front of it answers.
# Both mean the same thing to the user: wait, do not go looking for an API key.
RATE_LIMIT_STATUSES = (402, 429)

# Refusal literals are ASCII: the free tier answers in the language it was asked in, and
# the node's own detector is Gemini shaped. Only apology-style openers count, so a long
# prompt that merely mentions a guideline is not thrown away.
REFUSAL_MARKERS = (
    "i can't help with that", "i cannot help with that", "i'm sorry, but i can't",
    "i can t do that", "i cannot do that", "i can t assist", "i cannot assist",
    "i am unable to help", "i'm unable to help", "i can not help", "as an ai",
    "not able to help with that", "violates my", "against my guidelines",
    "i can't provide", "i cannot provide", "i won't be able to",
)


def available_models():
    """Dropdown entries for the provider combo. Keeps the shipped list if the API is down."""
    return list(MODELS)


def base_url(config=None):
    if config:
        url = (config.get("pollinations") or {}).get("base_url")
        if url:
            return str(url).rstrip("/")
    return DEFAULT_BASE_URL


def default_model(config=None):
    if config:
        model = (config.get("pollinations") or {}).get("model")
        if model:
            return str(model)
    return DEFAULT_MODEL


def list_models(timeout=8.0, config=None):
    """Live text-model list from GET {base}/models, falling back to MODELS.

    Only called on demand (the config panel), never at import: node import must not be
    able to hang or touch the network. Entries that are not text->text (image, audio) are
    dropped, because a name the text route cannot answer is not a candidate.
    """
    url = MODELS_PATH.format(base=base_url(config).rstrip("/"))
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8", "replace"))
    except Exception:  # noqa: BLE001 - offline is normal, the shipped list is the fallback
        return list(MODELS)
    names = []
    if isinstance(data, list):
        for row in data:
            if isinstance(row, str):
                names.append(row)
            elif isinstance(row, dict):
                ins = row.get("input_modalities")
                outs = row.get("output_modalities")
                if isinstance(ins, list) and "text" not in ins:
                    continue
                if isinstance(outs, list) and "text" not in outs:
                    continue
                name = row.get("name") or row.get("id")
                if name:
                    names.append(str(name))
    return names or list(MODELS)


def build_messages(payload, json_schema=None):
    """Turn a Gemini REST payload into Pollinations `messages` (system text stays system).

    Reusing the **same** system text is what makes the result interchangeable with a
    Gemini one: output fields, length rules and engine rules all come from that single
    source (server/gemini_api.py). Inline images are dropped - the anonymous text tier has
    no image channel, and `openai-fast` reports `"vision": false`.
    """
    def _parts(obj):
        if isinstance(obj, dict):
            return "".join(str(p.get("text", "")) for p in (obj.get("parts") or [])
                           if isinstance(p, dict))
        return str(obj or "")

    messages = []
    system_text = _parts(payload.get("system_instruction")).strip()
    if system_text:
        messages.append({"role": "system", "content": system_text})
    for row in (payload.get("contents") or []):
        role = str(row.get("role") or "user") if isinstance(row, dict) else "user"
        if role not in ("system", "user", "assistant"):
            role = "user"
        text = _parts(row).strip()
        if text:
            messages.append({"role": role, "content": text})
    if json_schema:
        messages.append({"role": "system",
                         "content": "Return a single JSON object only. No prose, no code "
                                    "fences. Use exactly this schema: "
                                    + json.dumps(json_schema, ensure_ascii=False)})
    if not messages:
        messages.append({"role": "user", "content": " "})
    return messages


def _extract_json(text):
    """First JSON object in `text`, ignoring code fences and leading prose."""
    if not text:
        return None
    stripped = text.strip()
    if stripped.startswith("```"):
        # ```json { ... } ``` -> drop the fences, then fall through to the brace scan.
        stripped = stripped.strip("`")
        if stripped.lower().startswith("json"):
            stripped = stripped[4:]
    try:
        obj = json.loads(stripped)
        return obj if isinstance(obj, dict) else None
    except Exception:  # noqa: BLE001
        pass
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        obj = json.loads(stripped[start:end + 1])
    except Exception:  # noqa: BLE001
        return None
    return obj if isinstance(obj, dict) else None


def _looks_like_refusal(text):
    """Conservative refusal check on the first characters only (see REFUSAL_MARKERS)."""
    head = (text or "")[:400].lower()
    return any(marker in head for marker in REFUSAL_MARKERS)


def _refusal_note():
    """Refusal wording lives here - the node must not re-implement it.

    The sentence is deliberately matched by `is_refusal_response()` in
    server/gemini_api.py (the "I cannot provide" regex). That is not a coincidence: the
    node decides Pass 1 -> Pass 2 promotion from that one function, so a synthetic
    refusal has to speak its language rather than adding a second detector.
    """
    return "I cannot provide the requested content."


def refusal_error(model=""):
    """ASCII error text for a request Pollinations would not answer."""
    return ("Pollinations (%s) refused the request or returned no usable prompt. "
            "Enable 'Uncensored' (Pass 2/3), choose another Pollinations model, "
            "or set Provider back to Google Gemini." % (model or DEFAULT_MODEL))


def _unwrap_completion(raw):
    """Answer text of a 200 body, plus an ASCII error string when the body carries one.

    The root route answers `text/plain` with the completion, so the fast path is `raw`
    itself. The OpenAI schema (`choices[].message.content`) is tolerated as well, because
    that is what {base}/openai and most proxies return - and the model's own `reasoning`
    field is deliberately ignored, it is not the answer.
    """
    stripped = (raw or "").strip()
    if not stripped.startswith("{"):
        return stripped, ""
    try:
        obj = json.loads(stripped)
    except Exception:  # noqa: BLE001 - prose that merely starts with a brace
        return stripped, ""
    if not isinstance(obj, dict):
        return stripped, ""
    if obj.get("error"):
        err = obj["error"]
        if isinstance(err, dict):
            err = err.get("message") or err
        return "", "Pollinations API error: %s" % " ".join(str(err).split())[:200]
    choices = obj.get("choices")
    if isinstance(choices, list) and choices and isinstance(choices[0], dict):
        message = choices[0].get("message")
        if isinstance(message, dict):
            return str(message.get("content") or ""), ""
        return str(choices[0].get("text") or ""), ""
    return stripped, ""


def _failure(status, detail="", retry_after=""):
    """One ASCII failure line for a non-200 (the node shows it verbatim)."""
    hint = ""
    if status in RATE_LIMIT_STATUSES:
        # Saying "rate limited" is the difference between "wait half a minute" and
        # "go looking for an API key this provider does not have".
        hint = " (rate limited, not daily: wait ~%ss" % RATE_LIMIT_WINDOW_S
        if retry_after:
            hint += ", Retry-After %ss" % retry_after
        hint += ")"
    return "Pollinations HTTP %s%s: %s" % (status, hint, " ".join(str(detail).split()))


def call_text(model, messages, timeout=45, json_schema=None, config=None,
              enable_logger=False):
    """One keyless text call. Returns `(status, body)` like `_post_generate_content`.

    * 200 -> `body` is a **Gemini-shaped** envelope so `_extract_candidate_text()` and
      `is_refusal_response()` in the node work with no second parser:
      `{"candidates": [{"content": {"parts": [{"text": ...}]}}]}`
    * otherwise -> `body` is an ASCII string (the failure detail), which is exactly what
      `_http_failure_detail()` expects for a non-200.
    A refusal, an empty completion, or prose where JSON was required comes back as
    200 + `_refusal_note()`, i.e. it travels the node's existing refusal path (Pass 2/3
    with Uncensored ON, hard stop with it OFF).
    """
    url = TEXT_PATH.format(base=base_url(config).rstrip("/"))
    body = json.dumps({
        "model": model or DEFAULT_MODEL,
        "messages": messages,
        # `referrer` + `enableLogger` are the anonymous-tier identity switches; `safe: false`
        # is the documented filter switch and the node's uncensored toggle has no other
        # meaning on this provider.
        "referrer": REFERRER,
        "safe": False,
        "enableLogger": bool(enable_logger),
    }).encode("utf-8")
    request = urllib.request.Request(url, data=body, method="POST", headers={
        "Content-Type": "application/json",
        "Accept": "text/plain, application/json",
        "User-Agent": USER_AGENT,
    })
    try:
        with urllib.request.urlopen(request, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", "replace")
            status = getattr(resp, "status", None) or getattr(resp, "code", 200)
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            detail = exc.read().decode("utf-8", "replace")[:300]
        except Exception:  # noqa: BLE001
            pass
        retry_after = ""
        try:
            retry_after = str((exc.headers or {}).get("Retry-After") or "").strip()
        except Exception:  # noqa: BLE001
            retry_after = ""
        return (exc.code or 502), _failure(exc.code or 502, detail, retry_after)
    except Exception as exc:  # noqa: BLE001 - DNS, TLS, timeout: never raise into the node
        return 0, "Pollinations connection error: %s" % " ".join(str(exc).split())[:200]

    if status != 200:
        return status, _failure(status, raw)

    text, error = _unwrap_completion(raw)
    if error:
        return 502, error
    if not text.strip():
        # An empty completion is indistinguishable from a refusal to the user, and the
        # refusal path is the one that already knows how to try Pass 2/3.
        return 200, _envelope(_refusal_note())
    if _looks_like_refusal(text):
        return 200, _envelope(_refusal_note())
    if json_schema:
        obj = _extract_json(text)
        if obj is None:
            # Prose where the schema was required: same reasoning as an empty answer.
            return 200, _envelope(_refusal_note())
        text = json.dumps(obj, ensure_ascii=False)
    return 200, _envelope(text)


def _envelope(text):
    """Wrap an answer into the Gemini shape the node already parses."""
    return {"candidates": [{"content": {"parts": [{"text": text}]}}]}
