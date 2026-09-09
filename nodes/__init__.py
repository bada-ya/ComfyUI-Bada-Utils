"""
ComfyUI-Bada-Utils Pure Node Registry
Only 2 clean, powerful master nodes:
1. BadaPresetHub (Wireless Smart Presets Master Hub)
2. BadaRegionalPrompt (Visual Interactive Regional Prompt)
"""
from .bada_preset_hub import BadaPresetHub
from .bada_regional_prompt import BadaRegionalPrompt

NODE_CLASS_MAPPINGS = {
    "BadaPresetHub": BadaPresetHub,
    "BadaRegionalPrompt": BadaRegionalPrompt,
    "VisualGridPromptNode": BadaRegionalPrompt,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BadaPresetHub": "🌊 Bada Preset Hub",
    "BadaRegionalPrompt": "🌊 Bada Visual Regional Prompt",
    "VisualGridPromptNode": "📐 Visual Grid Regional Prompt (Legacy)",
}

__all__ = [
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
    "BadaPresetHub",
    "BadaRegionalPrompt",
]
