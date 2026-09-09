"""
ComfyUI-Bada-Utils Pure Node Registry
Flagship Core Nodes:
1. BadaPresetHub (Wireless Smart Presets Master Hub)
2. BadaRegionalPrompt (Visual Interactive Regional Prompt)
Bonus QoL Utility Nodes:
3. BadaShowText (Live Inspector & Pass-through)
4. BadaAnySwitch (Universal Any-type Router)
5. BadaNote (Smooth Markdown Note)
"""
from .bada_preset_hub import BadaPresetHub
from .bada_regional_prompt import BadaRegionalPrompt
from .bada_qol_nodes import BadaShowText, BadaAnySwitch, BadaNote

NODE_CLASS_MAPPINGS = {
    # Core Suite
    "BadaPresetHub": BadaPresetHub,
    "BadaRegionalPrompt": BadaRegionalPrompt,
    "BadaShowText": BadaShowText,
    "BadaAnySwitch": BadaAnySwitch,
    "BadaNote": BadaNote,
    
    # Legacy 100% Backward Compatibility Aliases
    "VisualGridPromptNode": BadaRegionalPrompt,
    "QoL_ShowText": BadaShowText,
    "QoL_AnySwitch": BadaAnySwitch,
    "QoL_NoteNode": BadaNote,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    # Core Suite
    "BadaPresetHub": "🌊 Bada Preset Hub",
    "BadaRegionalPrompt": "🌊 Bada Visual Regional Prompt",
    "BadaShowText": "🌊 Bada Show Text",
    "BadaAnySwitch": "🌊 Bada Any Switch",
    "BadaNote": "🌊 Bada Note",
    
    # Legacy
    "VisualGridPromptNode": "📐 Visual Grid Regional Prompt (Legacy)",
    "QoL_ShowText": "📋 QoL Show & Pass Text (Legacy)",
    "QoL_AnySwitch": "🔀 QoL Any Switch (Legacy)",
    "QoL_NoteNode": "📝 QoL Smooth Note (Legacy)",
}

__all__ = [
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
    "BadaPresetHub",
    "BadaRegionalPrompt",
    "BadaShowText",
    "BadaAnySwitch",
    "BadaNote",
]
