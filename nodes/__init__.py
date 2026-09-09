"""
ComfyUI-Bada-Utils Pure Node Registry
Only 2 clean, powerful nodes:
1. BadaPresetHub (Wireless Smart Presets)
2. BadaRegionalPrompt (Visual Interactive Regional Prompt)
"""
from .bada_preset_hub import BadaPresetHub
from .bada_regional_prompt import BadaRegionalPrompt

NODE_CLASS_MAPPINGS = {
    "BadaPresetHub": BadaPresetHub,
    "BadaRegionalPrompt": BadaRegionalPrompt,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BadaPresetHub": "🌊 Bada Preset Hub",
    "BadaRegionalPrompt": "🌊 Bada Visual Regional Prompt",
}

__all__ = [
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
    "BadaPresetHub",
    "BadaRegionalPrompt",
]
