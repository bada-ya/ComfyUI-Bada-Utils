/**
 * ⚓ Bada 프롬프트 생성기 — "모델 관리" 모달
 * ---------------------------------------------------------------
 * `engines_registry_user.json` 의 `user_prompts` 를 CRUD 합니다 (배포본 아님).
 *   • 새로 만들기 / 수정 / 삭제 / ▲▼ 순서 이동
 *   • 공식 프롬프트(Qwen PE)를 템플릿으로 불러와 편집
 * 저장은 서버 REST API 를 통해 수행되며 저장 즉시 노드의
 * target / submenu 목록이 갱신됩니다 (mtime 캐시 자동 무효화).
 *
 * UI 본체는 `bada_prompt_modal_core.js` 가 담당하고, 이 파일은 차이만 주입한다
 * (레지스트리 키·API 주소·문구·출력 형식/템플릿 기능).
 */
import { createPromptModalOpener } from "./bada_prompt_modal_core.js";

export const openPromptGenModal = createPromptModalOpener({
    promptsKey: "user_prompts",
    urls: {
        save: "/api/bada/promptgen/user_prompts/save",
        delete: "/api/bada/promptgen/user_prompts/delete",
        move: "/api/bada/promptgen/user_prompts/move",
    },
    textKeys: {
        title: "pmgen_title",
        sub: "pmgen_sub",
        format: "pmgen_format",
        text: "pmgen_text",
        json: "pmgen_json",
        fields: "pmgen_fields",
        promptPh: "pmgen_prompt_ph",
        template: "pmgen_template",
        templateNone: "pmgen_template_none",
        loadTemplate: "pmgen_load_template",
    },
    noteKey: "pmgen_official_note",
    log: {
        refresh: "[BadaPromptGen] modal refresh failed:",
        action: "[BadaPromptGen] modal action failed:",
    },
    features: {
        outputFormat: true,
        officialTemplates: true,
    },
});
