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
import json
import logging
import re
import urllib.parse
import urllib.request

logger = logging.getLogger("ComfyUI-Bada-Utils")

# Realistic browser headers to prevent 429 bot blocking
BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://translate.google.com/",
}

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

    def _fetch_translation(self, query_text, from_lang, to_lang):
        """
        Execute request with multi-endpoint fallback to bypass 429 Too Many Requests
        """
        strategies = [
            # 1. Google Chrome Extension official client (highest quota, practically immune to 429)
            (
                "https://translate.googleapis.com/translate_a/single",
                {"client": "dict-chrome-ex", "sl": from_lang, "tl": to_lang, "dt": "t", "q": query_text},
            ),
            # 2. Clients5 translate endpoint
            (
                "https://clients5.google.com/translate_a/t",
                {"client": "dict-chrome-ex", "sl": from_lang, "tl": to_lang, "q": query_text},
            ),
            # 3. Standard GTX client on translate.googleapis.com
            (
                "https://translate.googleapis.com/translate_a/single",
                {"client": "gtx", "sl": from_lang, "tl": to_lang, "dt": "t", "q": query_text},
            ),
            # 4. Standard GTX client on translate.google.com
            (
                "https://translate.google.com/translate_a/single",
                {"client": "gtx", "sl": from_lang, "tl": to_lang, "dt": "t", "q": query_text},
            ),
        ]

        last_error = None
        # Create direct opener (ignoring corrupted local proxies)
        direct_opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

        for base_url, params in strategies:
            try:
                url = f"{base_url}?{urllib.parse.urlencode(params)}"
                req = urllib.request.Request(url, headers=BROWSER_HEADERS)

                with direct_opener.open(req, timeout=10) as response:
                    raw_data = response.read().decode("utf-8")
                    res_json = json.loads(raw_data)

                    # Format A: [[["chunk1", "orig1", ...], ["chunk2", "orig2", ...]], ...]
                    if isinstance(res_json, list) and len(res_json) > 0:
                        if isinstance(res_json[0], list) and len(res_json[0]) > 0 and isinstance(res_json[0][0], list):
                            chunks = [
                                item[0]
                                for item in res_json[0]
                                if item and isinstance(item, list) and len(item) > 0 and item[0]
                            ]
                            return "".join(chunks)
                        # Format B: ["chunk1", "chunk2", ...]
                        elif isinstance(res_json[0], str):
                            return "".join([c for c in res_json if isinstance(c, str)])

            except Exception as err:
                last_error = err
                logger.warning(f"[ComfyUI-Bada-Utils] Translation endpoint {base_url} ({params.get('client')}) fallback: {err}")
                continue

        if last_error:
            raise last_error
        return query_text

    def translate(self, text, from_lang="ko", to_lang="en", preserve_quotes=True):
        if not text or not text.strip():
            return ("",)

        if from_lang != "auto" and from_lang == to_lang:
            return (text,)

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
            translated_text = self._fetch_translation(processed_text, from_lang, to_lang)

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
