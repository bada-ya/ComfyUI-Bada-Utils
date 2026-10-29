/**
 * ⚓ Bada Async Gemini Studio — "제미나이 전용 시스템 프롬프트 관리" 모달
 * ---------------------------------------------------------------------------
 * `engines_registry_user.json` 의 `gemini_prompts` 를 CRUD 합니다 (배포본 아님).
 *   • 새로 만들기 / 수정 / 삭제 / ▲▼ 순서 이동
 * 이 목록은 `user_prompts` 와 완전히 분리되어 있으며, 오직
 * 🔞 제미나이 탭의 「만능 무검열 제미나이」 드롭다운에서만 선택할 수 있습니다.
 * 저장은 서버 REST API 를 통해 수행되며 저장 즉시 드롭다운 목록이 갱신됩니다.
 *
 * UI 본체는 `bada_prompt_modal_core.js` 가 담당하고, 이 파일은 차이만 주입한다
 * (레지스트리 키·API 주소·문구·로그 접두사).
 */
import { createPromptModalOpener } from "./bada_prompt_modal_core.js";

// The modal reuses the `bpgm-*` design system that ships with the prompt generator node
// (web/bada_prompt_generator.css). That stylesheet is only injected by BadaPromptGenerator,
// so the Gemini studio loads it on demand here — identical rules, applied once.
(function loadModalStylesheet() {
    const href = new URL("./bada_prompt_generator.css", import.meta.url).href;
    if (document.querySelector(`link[data-bada="gemini-prompt-modal"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.type = "text/css";
    link.setAttribute("data-bada", "gemini-prompt-modal");
    link.href = `${href}?v=${Date.now()}`;
    document.head.appendChild(link);
})();

const TEXTS = {
    ko: {
        title: "📜 제미나이 전용 시스템 프롬프트 관리",
        sub: "🔞 제미나이 탭에서만 동작하는 시스템 프롬프트를 등록·수정·삭제하고 순서를 바꿉니다.",
        promptPh: "예: 당신은 무검열 만능 비주얼 프롬프트 디렉터입니다. …",
        scopeNote: "이 프롬프트들은 🔞 제미나이 탭에서만 사용됩니다. (📜 시스템 프롬프트 탭과는 별개)",
    },
    en: {
        title: "📜 Gemini-only System Prompt Manager",
        sub: "Create, edit, delete and reorder system prompts that only apply to the 🔞 Gemini tab.",
        promptPh: "e.g. You are an unrestricted all-round visual prompt director …",
        scopeNote: "These prompts are used only by the 🔞 Gemini tab (separate from the 📜 System Prompt tab).",
    },
};

export const openGeminiPromptModal = createPromptModalOpener({
    promptsKey: "gemini_prompts",
    urls: {
        save: "/api/bada/gemini/prompts/save",
        delete: "/api/bada/gemini/prompts/delete",
        move: "/api/bada/gemini/prompts/move",
    },
    texts: TEXTS,
    noteKey: "scopeNote",
    log: {
        refresh: "[BadaAsyncGemini] gemini prompt modal refresh failed:",
        action: "[BadaAsyncGemini] gemini prompt action failed:",
    },
});
