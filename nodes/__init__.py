"""
ComfyUI-Bada-Utils Pure Node Registry
Only 2 clean, powerful master nodes:
1. BadaPresetHub (Wireless Smart Presets Master Hub)
2. BadaRegionalPrompt (Visual Interactive Regional Prompt)
"""
from .bada_preset_hub import BadaPresetHub
from .bada_regional_prompt import BadaRegionalPrompt
from .bada_async_gemini import BadaAsyncGeminiStudio
from .bada_google_translator import BadaGoogleTranslator
from .bada_prompt_generator import BadaPromptGenerator

NODE_CLASS_MAPPINGS = {
    "BadaPresetHub": BadaPresetHub,
    "BadaRegionalPrompt": BadaRegionalPrompt,
    "VisualGridPromptNode": BadaRegionalPrompt,
    "BadaAsyncGeminiStudio": BadaAsyncGeminiStudio,
    "BadaGoogleTranslator": BadaGoogleTranslator,
    "BadaPromptGenerator": BadaPromptGenerator,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BadaPresetHub": "⚓ Bada Preset Hub",
    "BadaRegionalPrompt": "⚓ Bada Visual Regional Prompt",
    "VisualGridPromptNode": "📐 Visual Grid Regional Prompt (Legacy)",
    "BadaAsyncGeminiStudio": "⚓ Bada Async Gemini Studio",
    "BadaGoogleTranslator": "⚓ Bada Google Translator",
    "BadaPromptGenerator": "⚓ Bada Prompt Generator",
}

__all__ = [
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
    "BadaPresetHub",
    "BadaRegionalPrompt",
    "BadaAsyncGeminiStudio",
    "BadaGoogleTranslator",
    "BadaPromptGenerator",
]
