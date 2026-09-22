"""
ComfyUI-Bada-Utils Pure Node Registry
Only 2 clean, powerful master nodes:
1. BadaPresetHub (Wireless Smart Presets Master Hub)
2. BadaRegionalPrompt (Visual Interactive Regional Prompt)
"""
from .bada_preset_hub import BadaPresetHub
from .bada_regional_prompt import BadaRegionalPrompt
from .bada_async_gemini import BadaAsyncGeminiStudio
from .bada_terminal_console import BadaTerminalHub
from .bada_google_translator import BadaGoogleTranslator

NODE_CLASS_MAPPINGS = {
    "BadaPresetHub": BadaPresetHub,
    "BadaRegionalPrompt": BadaRegionalPrompt,
    "VisualGridPromptNode": BadaRegionalPrompt,
    "BadaAsyncGeminiStudio": BadaAsyncGeminiStudio,
    "BadaTerminalHub": BadaTerminalHub,
    "BadaGoogleTranslator": BadaGoogleTranslator,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BadaPresetHub": "⚓ Bada Preset Hub",
    "BadaRegionalPrompt": "⚓ Bada Visual Regional Prompt",
    "VisualGridPromptNode": "📐 Visual Grid Regional Prompt (Legacy)",
    "BadaAsyncGeminiStudio": "⚓ Bada Async Gemini Studio",
    "BadaTerminalHub": "⚓ Bada Terminal Hub",
    "BadaGoogleTranslator": "⚓ Bada Google Translator",
}

__all__ = [
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
    "BadaPresetHub",
    "BadaRegionalPrompt",
    "BadaAsyncGeminiStudio",
    "BadaTerminalHub",
    "BadaGoogleTranslator",
]
