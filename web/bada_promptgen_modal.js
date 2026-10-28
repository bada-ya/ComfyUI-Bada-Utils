/**
 * ⚓ Bada 프롬프트 생성기 — "모델 관리" 모달
 * ---------------------------------------------------------------
 * `engines_registry.json` 의 `user_prompts` 를 CRUD 합니다.
 *   • 새로 만들기 / 수정 / 삭제 / ▲▼ 순서 이동
 *   • 공식 프롬프트(Qwen PE)를 템플릿으로 불러와 편집
 * 저장은 서버 REST API 를 통해 수행되며 저장 즉시 노드의
 * target / submenu 목록이 갱신됩니다 (mtime 캐시 자동 무효화).
 *
 * UI 본체는 `bada_prompt_modal_core.js` 가 담당하고, 이 파일은 차이만 주입한다
 * (레지스트리 키·API 주소·문구·출력 형식/템플릿 기능).
 */
import { createPromptModalOpener } from "./bada_prompt_modal_core.js";

const TEXTS = {
    ko: {
        title: "⚙️ Bada 프롬프트 생성기 — 시스템 프롬프트 관리",
        sub: "사용자 시스템 프롬프트를 등록·수정·삭제하고 순서를 바꿉니다.",
        format: "출력 형식",
        text: "일반 텍스트",
        json: "JSON (구조화)",
        fields: "JSON 키 (쉼표 구분)",
        promptPh: "예: 당신은 시네마틱 비디오 프롬프트 전문가입니다. …",
        template: "공식 프롬프트 템플릿",
        templateNone: "— 템플릿 선택 —",
        loadTemplate: "불러오기",
        officialNote: "공식 프롬프트는 Qwen Research License 에 따르며 삭제할 수 없습니다.",
    },
    en: {
        title: "⚙️ Bada Prompt Generator — System Prompt Manager",
        sub: "Create, edit, delete and reorder your custom system prompts.",
        format: "Output format",
        text: "Plain text",
        json: "JSON (structured)",
        fields: "JSON keys (comma separated)",
        promptPh: "e.g. You are a cinematic video prompt expert …",
        template: "Official prompt template",
        templateNone: "— choose template —",
        loadTemplate: "Load",
        officialNote: "Official prompts follow the Qwen Research License and cannot be deleted.",
    },
};

export const openPromptGenModal = createPromptModalOpener({
    promptsKey: "user_prompts",
    urls: {
        save: "/api/bada/promptgen/user_prompts/save",
        delete: "/api/bada/promptgen/user_prompts/delete",
        move: "/api/bada/promptgen/user_prompts/move",
    },
    texts: TEXTS,
    noteKey: "officialNote",
    log: {
        refresh: "[BadaPromptGen] modal refresh failed:",
        action: "[BadaPromptGen] modal action failed:",
    },
    features: {
        outputFormat: true,
        officialTemplates: true,
    },
});
