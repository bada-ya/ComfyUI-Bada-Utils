"""
bada ✨ Async Gemini Studio Custom Node
Independent, non-blocking multimodal prompt brainstorming & generation studio for ComfyUI.
"""

DEFAULT_SYSTEM_INSTRUCTION = (
    "You are a world-class AI prompt engineer specializing in cinematic video and image generation "
    "(such as Wan 2.1, LTX-Video, FLUX, SDXL, Midjourney). "
    "Carefully analyze any attached reference images (noticing color palettes, lighting, subject appearance, framing, texture) "
    "along with the user's instructions. "
    "Craft a rich, detailed, coherent, and visually captivating English prompt. "
    "Describe subjects, actions, environment, camera movement, atmospheric lighting, and high-fidelity textures. "
    "Output ONLY the final detailed prompt in English without any markdown conversational preamble or commentary."
)

class BadaAsyncGeminiStudio:
    """
    bada ✨ Async Gemini Studio
    - Independent non-blocking execution via in-node [Generate] button
    - Multimodal image drag & drop / clipboard paste (Ctrl+V)
    - One-click copy & direct injection to active CLIP Text Encode nodes
    - Standard STRING output for downstream workflow connection
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "generated_prompt": (
                    "STRING",
                    {
                        "multiline": True,
                        "default": "",
                        "placeholder": "Generated prompt will appear here and can be connected downstream...",
                    },
                ),
            },
            "optional": {
                "system_instruction": (
                    "STRING",
                    {
                        "multiline": True,
                        "default": DEFAULT_SYSTEM_INSTRUCTION,
                        "placeholder": "Custom system prompt for Gemini...",
                    },
                ),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    FUNCTION = "execute"
    CATEGORY = "⚓ Bada Utils/Gemini"
    OUTPUT_NODE = False

    def execute(self, generated_prompt="", system_instruction="", unique_id=None, **kwargs):
        """
        When executed in ComfyUI queue, simply passes the current generated_prompt string.
        """
        return (generated_prompt,)

    @classmethod
    def IS_CHANGED(cls, generated_prompt="", **kwargs):
        # Always propagate updated text to downstream nodes
        return generated_prompt or ""

NODE_CLASS_MAPPINGS = {
    "BadaAsyncGeminiStudio": BadaAsyncGeminiStudio,
    "bada_async_gemini": BadaAsyncGeminiStudio,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BadaAsyncGeminiStudio": "⚓ Bada Async Gemini Studio",
    "bada_async_gemini": "⚓ Bada Async Gemini Studio",
}

