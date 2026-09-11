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

NODE_CLASS_MAPPINGS = {
    "BadaPresetHub": BadaPresetHub,
    "BadaRegionalPrompt": BadaRegionalPrompt,
    "VisualGridPromptNode": BadaRegionalPrompt,
    "BadaAsyncGeminiStudio": BadaAsyncGeminiStudio,
    "BadaTerminalHub": BadaTerminalHub,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BadaPresetHub": "⚓ Bada Preset Hub",
    "BadaRegionalPrompt": "⚓ Bada Visual Regional Prompt",
    "VisualGridPromptNode": "📐 Visual Grid Regional Prompt (Legacy)",
    "BadaAsyncGeminiStudio": "⚓ Bada Async Gemini Studio",
    "BadaTerminalHub": "⚓ Bada Terminal Hub",
}

__all__ = [
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
    "BadaPresetHub",
    "BadaRegionalPrompt",
    "BadaAsyncGeminiStudio",
    "BadaTerminalHub",
]
