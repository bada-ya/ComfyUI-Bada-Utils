"""
ComfyUI-Bada-Utils: Bonus Quality of Life Utility Nodes
- BadaShowText: Real-time string/value inspector with pass-through
- BadaAnySwitch: Dynamic wildcard A/B switch router
- BadaNote: Smooth markdown note node that never blocks canvas panning
"""

class AnyType(str):
    """A wildcard socket type that matches any connection type in ComfyUI."""
    def __ne__(self, __value: object) -> bool:
        return False

any_type = AnyType("*")


class BadaShowText:
    """
    🌊 Bada Show Text (Live Inspector)
    Displays strings or any values directly on the node UI while passing the data downstream.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {"forceInput": True}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "show_text"
    OUTPUT_NODE = True
    CATEGORY = "🌊 Bada Utils/QoL"

    def show_text(self, text, unique_id=None, extra_pnginfo=None):
        text_str = str(text) if text is not None else ""
        return {
            "ui": {"string": [text_str]},
            "result": (text_str,)
        }


class BadaAnySwitch:
    """
    🌊 Bada Any Switch (Universal A/B Router)
    Dynamically routes between Input 1 and Input 2 for any socket type (Model, Latent, Image, Conditioning, String, etc.).
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "select": ("INT", {"default": 1, "min": 1, "max": 2, "step": 1}),
                "input_1": (any_type,),
            },
            "optional": {
                "input_2": (any_type,),
            }
        }

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("output",)
    FUNCTION = "switch"
    CATEGORY = "🌊 Bada Utils/QoL"

    def switch(self, select, input_1, input_2=None):
        if select == 1 or input_2 is None:
            return (input_1,)
        return (input_2,)


class BadaNote:
    """
    🌊 Bada Note (Markdown Canvas Comment)
    Clean, non-intrusive markdown documentation note with guaranteed smooth middle-pan and wheel-zoom navigation.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "note": ("STRING", {"multiline": True, "default": "Write workflow notes or documentation here..."}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("note",)
    FUNCTION = "get_note"
    CATEGORY = "🌊 Bada Utils/QoL"

    def get_note(self, note):
        return (note,)
