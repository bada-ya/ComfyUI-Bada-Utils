"""
ComfyUI-Bada-Utils: Zero-Dependency Google Translator Node
Author: bada-ya (https://github.com/bada-ya)

Free endpoint based on translate.googleapis.com with zero external dependencies.
Features:
- Pure Python standard library (urllib, json, re, html)
- Multi-endpoint & multi-client automatic failover (bypasses 429 Too Many Requests)
- High-fidelity Chrome browser headers emulation
- Smart quotes preservation (__PRESERVED_n__ pattern)
- HTML entity unescaping
- Resilient error handling & fallback
"""
import html
import logging
import re
import time
from concurrent.futures import TimeoutError as FutureTimeoutError

from ..translation_runtime import (
    TRANSLATION_MAX_CHARS,
    TRANSLATION_TIMEOUT_SECONDS,
    fetch_translation_with_failover,
    submit_translation,
)

logger = logging.getLogger("ComfyUI-Bada-Utils")

class BadaGoogleTranslator:
    """
    ⚓ Bada Google Translator
    외부 패키지 설치(pip) 없이 파이썬 내장 라이브러리만으로 동작하는 무의존성(Zero-Dependency) 구글 번역 노드입니다.
    구글의 429 Too Many Requests 차단을 회피하기 위한 다중 엔드포인트 자동 페일오버 및 브라우저 헤더 에뮬레이션을 탑재했습니다.
    큰따옴표(" ")로 묶인 프롬프트나 고유명사는 번역하지 않고 원문 그대로 보존하는 스마트 치환 기능이 내장되어 있습니다.
    """

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "text": ("STRING", {"multiline": True, "default": "", "placeholder": "Enter text to translate..."}),
                "from_lang": (["ko", "auto", "en", "ja", "zh-CN"], {"default": "ko"}),
                "to_lang": (["en", "ko", "ja", "zh-CN"], {"default": "en"}),
                "preserve_quotes": ("BOOLEAN", {"default": True}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "translate"
    CATEGORY = "⚓ Bada Utils/Text"
    OUTPUT_NODE = False

    def _fetch_translation(self, query_text, from_lang, to_lang, deadline=None):
        """
        Execute request with multi-endpoint fallback to bypass 429 Too Many Requests.
        Delegates to the shared 4-strategy POST→GET failover (translation_runtime) —
        previously this method carried its own copy of that loop.
        """
        return fetch_translation_with_failover(
            query_text, from_lang, to_lang,
            deadline=deadline, context="translator-node",
        )

    def translate(self, text, from_lang="ko", to_lang="en", preserve_quotes=True):
        if not text or not text.strip():
            return ("",)

        if from_lang != "auto" and from_lang == to_lang:
            return (text,)

        if len(text) > TRANSLATION_MAX_CHARS:
            logger.warning(
                f"[ComfyUI-Bada-Utils] Text too long ({len(text):,} chars, max {TRANSLATION_MAX_CHARS:,}). "
                "Returning input unchanged."
            )
            return (text,)

        if len(text) > 5000:
            logger.warning(
                "[ComfyUI-Bada-Utils] Text exceeds 5,000 characters. "
                "Translation may take longer or Google may reject it."
            )

        original_text = text
        preserved_map = {}

        # 1. Preserve quotes logic
        processed_text = text
        if preserve_quotes:
            pattern = re.compile(r'("[^"]*"|“[^”]*”)')

            def replace_match(match):
                idx = len(preserved_map)
                placeholder = f"__PRESERVED_{idx}__"
                preserved_map[placeholder] = match.group(0)
                return placeholder

            processed_text = pattern.sub(replace_match, processed_text)

        # 2. Request Translation with Failover
        try:
            deadline = time.monotonic() + TRANSLATION_TIMEOUT_SECONDS
            future = submit_translation(
                self._fetch_translation,
                processed_text,
                from_lang,
                to_lang,
                deadline=deadline,
            )
            if future is None:
                raise RuntimeError("번역 요청이 많습니다. 잠시 후 다시 시도해 주세요.")
            try:
                translated_text = future.result(timeout=max(0, deadline - time.monotonic()))
            except FutureTimeoutError as timeout_error:
                future.cancel()
                raise TimeoutError("Translation exceeded the 20-second overall timeout") from timeout_error

            # 3. Decode HTML entities (e.g., &quot;, &#39;, &amp;)
            translated_text = html.unescape(translated_text)

            # 4. Restore preserved quotes
            if preserve_quotes and preserved_map:
                for ph, orig_val in preserved_map.items():
                    idx = ph.replace("__PRESERVED_", "").replace("__", "")
                    restore_pattern = re.compile(rf"__\s*PRESERVED_{idx}\s*__", re.IGNORECASE)
                    translated_text = restore_pattern.sub(orig_val, translated_text)

            return (translated_text,)

        except Exception as e:
            logger.error(f"[ComfyUI-Bada-Utils] Google Translate error: {e}")
            print(f"\033[31m[ComfyUI-Bada-Utils] ⚠️ Google Translate request failed: {e}\033[0m")
            return (original_text,)
