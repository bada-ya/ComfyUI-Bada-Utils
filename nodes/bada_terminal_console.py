"""
ComfyUI-Bada-Utils: Master Terminal Hub & Command Studio Node
"""

class BadaTerminalHub:
    """
    ⚓ Bada Terminal Hub (통합 터미널 & 커맨드 스튜디오)
    ComfyUI 내부에서 Git 커스텀 노드 클론, 패키지 설치, 터미널 명령을
    실시간 스트리밍 콘솔과 함께 원클릭으로 실행하는 개발자/관리자 허브 노드입니다.
    """
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {},
            "optional": {
                "initial_directory": ("STRING", {"default": "custom_nodes", "multiline": False}),
                "initial_command": ("STRING", {"default": "git status", "multiline": False}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
            }
        }

    RETURN_TYPES = ()
    FUNCTION = "execute"
    CATEGORY = "⚓ Bada Utils/Tools"
    OUTPUT_NODE = True

    def execute(self, **kwargs):
        return ()
