/**
 * ⚓ Bada Async Gemini Studio
 * ComfyUI Web Extension (6-Engine Multi-Mode Edition)
 * - 3 Fast & Robust Models: Gemini 2.0 Flash-Lite, Gemini 2.5 Flash-Lite, Gemini 2.5 Flash
 * - 6 Dedicated Engine Tabs (left → right):
 *    1. KREA 2 (일반 / 스토리보드)
 *    2. QWEN2.1 (official T2I / I2I prompt enhancement)
 *    3. MiniMax H3 (5 submodes, duration slider, multimodal vision)
 *    4. LTX-Video (5 submodes, duration slider, 6-element DiT)
 *    5. 📜 사용자 시스템 프롬프트
 *    6. ✨ 무검열 제미나이 (인터랙티브 챗 & Gem 페르소나, 제미나이 전용 시스템 프롬프트)
 * - Excludes 텍스트 가공 도구 as requested
 * - Independent non-blocking execution, Zero VRAM impact, Zero-Refusal 3-Pass pipeline
 * - One-click clipboard copy & direct injection to active CLIP Text Encode nodes
 */

import { app } from "../../scripts/app.js";
import { BadaI18n } from "./bada_i18n.js";

// Dynamically inject CSS stylesheet
(function loadStylesheet() {
    const cssHref = new URL("./bada_async_gemini.css", import.meta.url).href;
    const existing = document.querySelector(`link[data-bada="async-gemini"]`);
    if (!existing) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.type = "text/css";
        link.setAttribute("data-bada", "async-gemini");
        link.href = `${cssHref}?v=${Date.now()}`;
        document.head.appendChild(link);
    }
})();

// Exact 7 Models matching bada-ya.github.io
const EXACT_MODELS = [
    { id: "gemini-3.5-flash-lite", name: "🚀 Gemini 3.5 Flash-Lite (권장 ⭐)", name_en: "🚀 Gemini 3.5 Flash-Lite (Recommended ⭐)", desc: "1,500회/일 • 최신 초고속 영작/실시간 챗", desc_en: "1,500 RPD • Ultra Fast / Live Chat" },
    { id: "gemini-3.6-flash", name: "⚡ Gemini 3.6 Flash", name_en: "⚡ Gemini 3.6 Flash", desc: "1,500회/일 • 표준 올라운더 Flash", desc_en: "1,500 RPD • Standard Flash Output" },
    { id: "gemini-3.8-flash", name: "🌟 Gemini 3.8 Flash", name_en: "🌟 Gemini 3.8 Flash", desc: "1,500회/일 • 최신 고성능 Flash", desc_en: "1,500 RPD • High Performance Flash" },
];

// 6 Engine Tabs Specification (left → right order)
const ENGINES = [
    { id: "krea", name: "KREA 2", name_en: "KREA 2", tag: "Photorealism", tag_en: "Photorealism", color: "#10b981" },
    { id: "qwen21", name: "QWEN2.1", name_en: "QWEN2.1", tag: "Image Prompt Enhancer", tag_en: "Image Prompt Enhancer", color: "#f59e0b" },
    { id: "minimax", name: "MiniMax H3", name_en: "MiniMax H3", tag: "Omni-Modal Video", tag_en: "Omni-Modal Video", color: "#6366f1" },
    { id: "ltx", name: "LTX-Video", name_en: "LTX-Video", tag: "6-Element DiT", tag_en: "6-Element DiT", color: "#06b6d4" },
    { id: "system_prompt", name: "📜 시스템", name_en: "📜 System", tag: "사용자 시스템 프롬프트", tag_en: "Custom System Prompt", color: "#38bdf8" },
    { id: "uncensored", name: "🔞 제미나이", name_en: "🔞 Gemini", tag: "Zero-Refusal Uncensored Chat", tag_en: "Zero-Refusal Uncensored Chat", color: "#a855f7" },
];

// Output frame (aspect ratio) choices — "" means "let the AI decide".
// Keep in sync with server/gemini_api.py::ASPECT_RATIO_CHOICES
const ASPECT_RATIOS = [
    { id: "", label: "자동", label_en: "Auto" },
    { id: "1:1", label: "1:1", label_en: "1:1" },
    { id: "3:2", label: "3:2", label_en: "3:2" },
    { id: "2:3", label: "2:3", label_en: "2:3" },
    { id: "4:3", label: "4:3", label_en: "4:3" },
    { id: "3:4", label: "3:4", label_en: "3:4" },
    { id: "5:4", label: "5:4", label_en: "5:4" },
    { id: "4:5", label: "4:5", label_en: "4:5" },
    { id: "16:9", label: "16:9", label_en: "16:9" },
    { id: "9:16", label: "9:16", label_en: "9:16" },
    { id: "21:9", label: "21:9", label_en: "21:9" },
    { id: "9:21", label: "9:21", label_en: "9:21" },
    { id: "2:1", label: "2:1", label_en: "2:1" },
    { id: "1:2", label: "1:2", label_en: "1:2" },
];

// MiniMax H3 Submodes
const MINIMAX_SUBMODES = [
    { id: "ref2va", name: "Ref2VA", tag: "전체 참조", tag_en: "Full Ref", desc: "인물/의상/사물/동작/사운드 통합 연출", desc_en: "Character, attire, motion & audio direction" },
    { id: "t2va", name: "T2VA", tag: "텍스트", tag_en: "Text", desc: "텍스트 프롬프트 기반 24fps 비디오+오디오 생성", desc_en: "24fps video + audio from text prompt" },
    { id: "i2va", name: "I2VA", tag: "첫 프레임", tag_en: "First Frame", desc: "첫 이미지로부터 유기적 물리 동작 전개", desc_en: "Organic motion expanding from first image" },
    { id: "fl2va", name: "FL2VA", tag: "첫-끝 루프", tag_en: "First-Last Loop", desc: "시작 프레임과 끝 프레임을 잇는 시퀀스", desc_en: "Seamless transition between start & end frames" },
    { id: "l2va", name: "L2VA", tag: "끝 착륙", tag_en: "End Target", desc: "지정된 마지막 프레임 이미지로 역산 수렴", desc_en: "Reverse motion converging to final frame" },
];

// LTX-Video Submodes
const LTX_SUBMODES = [
    { id: "ltx_2_5", name: "LTX 2.5", tag: "6요소 DiT", tag_en: "6-Element DiT", desc: "샷, 조명, 액션, 인물, 카메라, 사운드 6대 요소 결합", desc_en: "Shot, light, action, character, camera, sound" },
    { id: "ltx_t2v", name: "LTX T2V", tag: "텍스트 모션", tag_en: "Text Motion", desc: "텍스트 서술 기반 24fps 시네마틱 프롬프트", desc_en: "Text-driven 24fps cinematic motion prompt" },
    { id: "ltx_i2v", name: "LTX I2V", tag: "첫 프레임", tag_en: "First Frame", desc: "첫 프레임 이미지 기반 모션 역동성 확장", desc_en: "Dynamic motion extension from initial frame" },
    { id: "voice_audio", name: "Voice & Audio", tag: "대사/음향", tag_en: "Voice & Audio", desc: "캐릭터 음성 대사 및 배경 앰비언스 사운드 동기화", desc_en: "Dialogue synchronization & atmospheric sound" },
    { id: "camera_master", name: "Camera Master", tag: "3D 카메라", tag_en: "3D Camera", desc: "35mm 아나모픽 렌즈, 슬로우 돌리 인/아웃, 3D 카메라 궤적", desc_en: "35mm anamorphic, dolly in/out, 3D camera trajectory" },
];

// KREA 2 Submodes & Presets
// 주의: `id` 는 localStorage 호환을 위해 절대 바꾸지 않는다 (general / storyboard).
const KREA_SUBMODES = [
    { id: "general", name: "🖼️ T2I · 이미지 분석", name_en: "🖼️ T2I · Image Analysis", desc: "KREA 2 포토리얼 화풍 렌더링", desc_en: "KREA 2 photorealism rendering" },
    { id: "storyboard", name: "🎞️ 스토리보드", name_en: "🎞️ Storyboard", desc: "연속 컷 시퀀스 분할 생성", desc_en: "Sequential cut storyboard prompts" },
];

// 주의: `id` 는 localStorage 호환을 위해 절대 바꾸지 않는다 (t2i / i2i).
const QWEN_SUBMODES = [
    { id: "t2i", name: "🖼️ T2I · 이미지 분석", name_en: "🖼️ T2I · Image Analysis", desc: "텍스트 기반 이미지 프롬프트 강화", desc_en: "Text-to-image prompt enhancement" },
    { id: "i2i", name: "🪄 I2I (편집)", name_en: "🪄 I2I (Edit)", desc: "참조 이미지를 바탕으로 편집 프롬프트 생성", desc_en: "Image-edit prompt from reference images" },
];

// Gem Personas for Uncensored Gemini Chat
const GEM_PERSONAS_LIST = [
    { id: "universal", name: "⚡ 만능 무검열 제미나이", name_en: "⚡ All-Round Uncensored Gemini" },
    { id: "cinematic_director", name: "🎬 시네마틱 프롬프트 디렉터", name_en: "🎬 Cinematic Prompt Director" },
    { id: "fashion_lookbook", name: "👗 하이패션 & 룩북 마스터", name_en: "👗 High-Fashion & Lookbook Master" },
    { id: "scenario_writer", name: "🧠 심층 기획 & 시나리오 작가", name_en: "🧠 Deep Scenario & Narrative Writer" },
];

// ============================================================================
//  IMAGE HANDLING CONSTANTS
//  Gemini `inline_data` caps a single image at 20 MB, and a raw 4K DataURL
//  expands to ~25 MB once base64-encoded — which is why the studio used to
//  fail on large uploads. Mirroring nodes/bada_prompt_generator.py
//  (MAX_IMAGE_EDGE), we downscale in the browser before ever hitting the wire.
// ============================================================================
const IMAGE_ANALYSIS_MAX_EDGE = 1024;   // long-edge cap for vision/prompt work
const IMAGE_ANALYSIS_JPEG_QUALITY = 0.82;
const MAX_IMAGES_T2I = 1;               // KREA2 general, QWEN2.1 T2I, storyboard…
const MAX_IMAGES_I2I = 6;               // QWEN2.1 I2I (reference set)

/**
 * Downscale + recompress a single image to a Gemini-friendly DataURL.
 * Small images are returned untouched so we never add needless JPEG artifacts.
 */
function downscaleImageForGemini(dataUrl, maxEdge = IMAGE_ANALYSIS_MAX_EDGE) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
            if (!longEdge || longEdge <= maxEdge) { resolve({ dataUrl, resized: false }); return; }
            const scale = maxEdge / longEdge;
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
            const ctx = canvas.getContext("2d");
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve({ dataUrl: canvas.toDataURL("image/jpeg", IMAGE_ANALYSIS_JPEG_QUALITY), resized: true });
        };
        img.onerror = () => resolve({ dataUrl, resized: false });
        img.src = dataUrl;
    });
}

/** How many images the active engine/submode accepts. */
function currentImageLimit(engine, qwenSubMode) {
    if (engine === "qwen21") return qwenSubMode === "i2i" ? MAX_IMAGES_I2I : MAX_IMAGES_T2I;
    if (engine === "uncensored") return Infinity;   // chat tab has its own picker
    return MAX_IMAGES_T2I;                        // krea / minimax / ltx / system
}

// ============================================================================
//  PROMPT INPUT PLACEHOLDER
//
//  All of the per-engine guidance used to live in separate `.bada-callout`
//  boxes stacked inside the submode panel, which wasted ~150-200px of vertical
//  space. Those boxes are gone; every line of guidance now composes into the
//  input textarea's placeholder instead — same position for every tab, one DOM
//  node fewer per hint, and the user reads it right where they type.
//  Layers (in order): engine note → how-to / limits → example → optional tail.
// ============================================================================
function composePlaceholder(layers) {
    return layers
        .filter(line => line && String(line).trim())
        .map(line => String(line).trim())
        .join("\n");
}

// ── 이미지 분석 안내 (KREA2 일반 · QWEN2.1 T2I 공통) ─────────────────────────
function imageAnalysisHint(isKo) {
    return isKo
        ? [
            "🖼️ 이미지만 첨부하면 이미지를 분석해 프롬프트를 생성합니다.",
            "🖼️ 이미지 첨부(최대 1장)와 요청사항을 텍스트로 입력하면 함께 반영하여 프롬프트를 생성합니다.",
        ]
        : [
            "🖼️ Attach an image only and the prompt is generated from analyzing it.",
            "🖼️ Attach an image (up to 1) plus a text request and both are combined into the prompt.",
        ];
}

// ── 다중 참조 이미지 안내 (QWEN2.1 I2I) ─────────────────────────────────────
function multiImageHint(isKo) {
    return isKo
        ? [
            "🪄 참조 이미지는 최대 6장까지 첨부할 수 있습니다.",
            "📐 참고 이미지는 전송 효율을 위해 자동으로 1024px로 리사이즈되어 전송된 후 분석됩니다.",
        ]
        : [
            "🪄 Up to 6 reference images can be attached.",
            "📐 Reference images are automatically resized to 1024px for efficient transmission, then analyzed.",
        ];
}

app.registerExtension({
    name: "bada.AsyncGeminiStudio",

    async beforeRegisterNodeDef(nodeType, nodeData, appInstance) {
        if (nodeData.name !== "BadaAsyncGeminiStudio" && nodeData.name !== "bada_async_gemini") {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);

            const node = this;
            node.title = "⚓ Bada Async Gemini Studio";
            // 크기는 여기서 강제하지 않는다. onConfigure(워크플로우 복원) 가 저장된 크기를
            // 그대로 적용해야 하므로, 여기서 setSize 하면 사용자의 창 크기가 매번 초기화된다.
            // 초기 크기는 아래 LAYOUT ENGINE 이 userPreferredHeight 를 보고 결정한다.

            // The backend no longer exposes an output socket (RETURN_TYPES is empty). A node
            // instance restored from a saved workflow can still carry the old slot, so drop it
            // here as well — otherwise the "prompt" socket survives a plain browser refresh.
            while (node.outputs && node.outputs.length > 0) {
                node.removeOutput(0);
            }

            // Hide raw multiline widgets
            if (node.widgets && node.widgets.length > 0) {
                const rawPromptWidget = node.widgets.find(w => w.name === "generated_prompt");
                if (rawPromptWidget) {
                    rawPromptWidget.type = "converted-widget";
                    rawPromptWidget.hidden = true;
                    if (rawPromptWidget.computeSize) rawPromptWidget.computeSize = () => [0, -4];
                }
                const rawSysWidget = node.widgets.find(w => w.name === "system_instruction");
                if (rawSysWidget) {
                    rawSysWidget.type = "converted-widget";
                    rawSysWidget.hidden = true;
                    if (rawSysWidget.computeSize) rawSysWidget.computeSize = () => [0, -4];
                }
            }

            // State
            let activeEngine = localStorage.getItem("bada_active_engine") || "krea";
            let minimaxSub = localStorage.getItem("bada_minimax_sub") || "ref2va";
            let ltxSub = localStorage.getItem("bada_ltx_sub") || "ltx_2_5";
            let kreaSub = localStorage.getItem("bada_krea_sub") || "general";
            if (!KREA_SUBMODES.some(submode => submode.id === kreaSub)) kreaSub = "general";
            let qwenSub = localStorage.getItem("bada_qwen_sub") || "t2i";
            let userSystemPrompts = [];
            // 📜 시스템 탭의 상태 안내문구 (예전 promptInfo 박스의 내용을 placeholder 로 이관)
            let systemHintText = "";
            let selectedSystemPromptId = localStorage.getItem("bada_async_system_prompt") || "";
            let systemPromptsLoaded = false;
            let systemPromptLoadPromise = null;
            let storyboardCutCount = parseInt(localStorage.getItem("bada_storyboard_cuts") || "4", 10);
            let durationSec = parseInt(localStorage.getItem("bada_duration_sec") || "10", 10);

            let isNSFW = localStorage.getItem("bada_is_nsfw") !== "false";
            let isTranslate = localStorage.getItem("bada_is_translate") !== "false";
            let aspectRatio = localStorage.getItem("bada_aspect_ratio") || "";
            if (!ASPECT_RATIOS.some(ratio => ratio.id === aspectRatio)) aspectRatio = "";
            let isKo = (typeof BadaI18n !== "undefined" && BadaI18n.lang === "ko");

            let uploadedImages = [];
            let isGenerating = false;
            let timerInterval = null;
            let lastEnglishPrompt = "";
            let lastKoreanTranslation = "";
            let lastStoryboardData = null;
            let currentTab = "english";

            // Chat State (Uncensored Gemini Tab)
            // `bada_web_search` 는 실시간 웹검색 제거 이전 잔여 키라서 1회 정리한다.
            localStorage.removeItem("bada_web_search");
            let selectedGemPersona = localStorage.getItem("bada_gem_persona") || "universal";
            // 제미나이 탭 전용 시스템 프롬프트 (engines_registry.json :: gemini_prompts)
            let gemChatPrompts = [];
            let selectedGemPromptId = localStorage.getItem("bada_gem_chat_prompt") || "";
            let gemChatPromptsLoaded = false;
            let gemChatPromptsLoadPromise = null;
            let chatMessages = [];
            let chatUploadedImages = [];
            let isChatSending = false;
            let chatPersonaCleanup = null;
            let errorLogs = [];
            let unreadErrorCount = 0;
            let generateAbortController = null;
            let chatAbortController = null;

            // Root Card Container (방안 A: bada-async-gemini-root 병기)
            const root = document.createElement("div");
            root.className = "bada-gemini-card bada-async-gemini-root";

            // The header row (duplicate ⚓ title + ZERO-REFUSAL / NON-BLOCKING badges) was
            // removed: it duplicated the node title directly above it and, once the title
            // went, was left as an empty full-width box costing a row. The 🔔 bell already
            // lives in the API-key label row.

            // Error Log Modal
            const errorModalOverlay = document.createElement("div");
            errorModalOverlay.className = "bada-error-modal-overlay bada-hidden";
            errorModalOverlay.innerHTML = `
                <div class="bada-error-modal">
                    <div class="bada-error-modal-header">
                        <div class="bada-error-modal-title">
                            <span>🔔</span>
                            <span id="bada-err-title">${isKo ? "오류 알림 내역" : "Error Notification Log"}</span>
                        </div>
                        <div class="bada-error-modal-actions">
                            <button type="button" id="bada-err-clear-btn" class="bada-error-modal-btn">🗑️ ${isKo ? "비우기" : "Clear"}</button>
                            <button type="button" id="bada-err-close-btn" class="bada-error-modal-close" title="${isKo ? "닫기" : "Close"}">✖️</button>
                        </div>
                    </div>
                    <div class="bada-error-modal-body" id="bada-err-list">
                    </div>
                </div>
            `;
            root.appendChild(errorModalOverlay);

            function renderErrorList() {
                const listEl = errorModalOverlay.querySelector("#bada-err-list");
                if (!listEl) return;
                const isKoNow = (typeof BadaI18n !== "undefined" && BadaI18n.lang === "ko");
                if (errorLogs.length === 0) {
                    listEl.innerHTML = `
                        <div class="bada-error-empty">
                            <span style="font-size: 24px;">🎉</span>
                            <span>${isKoNow ? "기록된 오류가 없습니다." : "No errors recorded."}</span>
                        </div>
                    `;
                    return;
                }
                listEl.innerHTML = errorLogs.map(item => `
                    <div class="bada-error-item">
                        <div class="bada-error-meta">
                            <span class="bada-error-source">[${item.source}]</span>
                            <span>${item.time}</span>
                        </div>
                        <div class="bada-error-text">${item.msg}</div>
                    </div>
                `).join("");
            }

            function addErrorLog(source, msg) {
                const now = new Date();
                const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
                errorLogs.unshift({ id: Date.now(), time: timeStr, source, msg: String(msg) });
                if (errorLogs.length > 10) errorLogs.length = 10;
                unreadErrorCount++;
                updateBellBadge();
            }

            // The in-panel "⚓ Bada Async Gemini Studio" title duplicated the node title directly
// above it, costing a whole row. The 🔔 bell moved down into the API-key label row
// (where the "LocalStorage 자동 저장" text used to sit), removing one more row.
function updateBellBadge() {
                const bellBtn = root.querySelector("#bada-error-bell");
                const badgeEl = root.querySelector("#bada-bell-badge");
                if (!badgeEl || !bellBtn) return;
                if (unreadErrorCount > 0) {
                    badgeEl.textContent = unreadErrorCount > 99 ? "99+" : unreadErrorCount;
                    badgeEl.style.display = "inline-flex";
                    bellBtn.classList.add("has-unread");
                } else {
                    badgeEl.style.display = "none";
                    bellBtn.classList.remove("has-unread");
                }
            }

            const errCloseBtn = errorModalOverlay.querySelector("#bada-err-close-btn");
            if (errCloseBtn) {
                errCloseBtn.onclick = () => {
                    errorModalOverlay.classList.add("bada-hidden");
                };
            }

            const errClearBtn = errorModalOverlay.querySelector("#bada-err-clear-btn");
            if (errClearBtn) {
                errClearBtn.onclick = () => {
                    errorLogs = [];
                    unreadErrorCount = 0;
                    updateBellBadge();
                    renderErrorList();
                };
            }

            errorModalOverlay.onclick = (e) => {
                if (e.target === errorModalOverlay) {
                    errorModalOverlay.classList.add("bada-hidden");
                }
            };

            // Toast Alert Banner
            const toast = document.createElement("div");
            toast.className = "bada-toast";
            root.appendChild(toast);

            function showToast(msg, type = "info", duration = 3000) {
                toast.textContent = msg;
                toast.className = `bada-toast ${type}`;
                if (toast._timer) clearTimeout(toast._timer);
                toast._timer = setTimeout(() => {
                    toast.className = "bada-toast";
                }, duration);
            }

            // 2. 🔑 API Key & Priority Model (맨위에서 두번째 - 모든 4대 탭 공통 적용!)
            const configSection = document.createElement("div");
            configSection.className = "bada-section bada-config-top-section";
            configSection.style.cssText = "flex: 0 0 auto !important; margin: 0 0 2px 0; padding: 6px 8px; background: rgba(0,0,0,0.25); border: 1px solid var(--bada-border); border-radius: var(--bada-radius-md);";
            configSection.innerHTML = `
                <div class="bada-label bada-config-label" style="margin-bottom: 4px;">
                    <div class="bada-config-title-group">
                        <span class="bada-config-title-text">${isKo ? "🔑 API Key & 우선순위 모델 선택" : "🔑 API Key & Priority Model"}</span>
                        <div class="bada-key-actions">
                            <button type="button" id="bada-btn-get-key" class="bada-key-action-btn" title="${isKo ? "Google AI Studio API 키 발급 페이지 열기" : "Open Google AI Studio API Key page"}">
                                <span class="bada-action-icon">↗️</span><span class="bada-action-text">${isKo ? "발급" : "Get Key"}</span>
                            </button>
                            <button type="button" id="bada-btn-test-key" class="bada-key-action-btn" title="${isKo ? "Gemini API 연결 및 키 유효성 테스트" : "Test Gemini API connection and key validity"}">
                                <span class="bada-action-icon">🔌</span><span class="bada-action-text">${isKo ? "연결확인" : "Check"}</span>
                            </button>
                        </div>
                    </div>
                    <span class="bada-config-bell-slot">
                        <button type="button" id="bada-error-bell" class="bada-bell-btn" title="${isKo ? "오류 알림 내역" : "Error Notification Log"}">
                            <span class="bada-bell-icon">🔔</span>
                            <span class="bada-bell-badge" id="bada-bell-badge" style="display: none;">0</span>
                        </button>
                    </span>
                </div>
            `;
            const configRow = document.createElement("div");
            configRow.className = "bada-config-row";

            const inputGroup = document.createElement("div");
            inputGroup.className = "bada-input-group";
            const apiKeyInput = document.createElement("input");
            apiKeyInput.className = "bada-input";
            apiKeyInput.type = "password";
            apiKeyInput.placeholder = "Gemini API Key (••••••••)";
            const savedKey = localStorage.getItem("bada_gemini_api_key") || "";
            if (savedKey) apiKeyInput.value = savedKey;

            apiKeyInput.addEventListener("input", () => {
                localStorage.setItem("bada_gemini_api_key", apiKeyInput.value.trim());
            });

            const toggleEyeBtn = document.createElement("button");
            toggleEyeBtn.className = "bada-toggle-eye";
            toggleEyeBtn.type = "button";
            toggleEyeBtn.innerHTML = "👁️";
            toggleEyeBtn.onclick = (e) => {
                e.preventDefault();
                apiKeyInput.type = apiKeyInput.type === "password" ? "text" : "password";
            };
            inputGroup.appendChild(apiKeyInput);
            inputGroup.appendChild(toggleEyeBtn);

            const modelSelect = document.createElement("select");
            modelSelect.className = "bada-select";
            EXACT_MODELS.forEach(m => {
                const opt = document.createElement("option");
                opt.value = m.id;
                opt.textContent = isKo ? m.name : (m.name_en || m.name);
                modelSelect.appendChild(opt);
            });
            const rawSaved = localStorage.getItem("bada_gemini_model") || "gemini-3.5-flash-lite";
            const validIds = EXACT_MODELS.map(m => m.id);
            const savedModel = validIds.includes(rawSaved) ? rawSaved : "gemini-3.5-flash-lite";
            modelSelect.value = savedModel;
            localStorage.setItem("bada_gemini_model", savedModel);
            modelSelect.addEventListener("change", () => {
                localStorage.setItem("bada_gemini_model", modelSelect.value);
            });

            configRow.appendChild(inputGroup);
            configRow.appendChild(modelSelect);
            configSection.appendChild(configRow);
            root.appendChild(configSection);

            // Wired here, not next to the header: the bell now lives in the config label row,
            // which only exists once configSection has been built.
            const errorBellBtn = root.querySelector("#bada-error-bell");
            if (errorBellBtn) {
                errorBellBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    unreadErrorCount = 0;
                    updateBellBadge();
                    renderErrorList();
                    errorModalOverlay.classList.remove("bada-hidden");
                };
                updateBellBadge();
            }

            // Button Event Handlers: 발급 (AI Studio 새 탭) & 연결확인 (API Test)
            const getKeyBtn = configSection.querySelector("#bada-btn-get-key");
            const testKeyBtn = configSection.querySelector("#bada-btn-test-key");

            if (getKeyBtn) {
                getKeyBtn.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.open("https://aistudio.google.com/app/apikey", "_blank", "noopener,noreferrer");
                });
            }

            if (testKeyBtn) {
                testKeyBtn.addEventListener("click", async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (testKeyBtn.dataset.busy === "true") return;

                    const isKo = (typeof BadaI18n !== "undefined" && BadaI18n.lang === "ko");
                    let curKey = (apiKeyInput.value || localStorage.getItem("bada_gemini_api_key") || "").trim();

                    // If input box was empty but localStorage had it, sync into input box
                    if (!apiKeyInput.value && curKey) {
                        apiKeyInput.value = curKey;
                    }

                    if (!curKey) {
                        showToast(isKo ? "Gemini API 키를 먼저 입력해 주세요." : "Please enter Gemini API Key first.", "error", 3500);
                        apiKeyInput.focus();
                        return;
                    }

                    testKeyBtn.dataset.busy = "true";
                    testKeyBtn.classList.remove("success", "error");
                    testKeyBtn.classList.add("testing");

                    const origIcon = "🔌";
                    const iconSpan = testKeyBtn.querySelector(".bada-action-icon");
                    const textSpan = testKeyBtn.querySelector(".bada-action-text");

                    if (iconSpan) iconSpan.innerHTML = '<span class="bada-spinner-tiny">⏳</span>';
                    if (textSpan) textSpan.textContent = isKo ? "확인중..." : "Testing...";

                    const startTime = Date.now();
                    const testAbort = new AbortController();
                    const timeoutTimer = setTimeout(() => testAbort.abort(), 6000);

                    try {
                        // Direct browser fetch to Google Generative Language API (Ultra-fast ~0.3-0.5s, exactly like Prompt Studio!)
                        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(curKey)}`;
                        const res = await fetch(listUrl, { signal: testAbort.signal });
                        clearTimeout(timeoutTimer);
                        const latency = Date.now() - startTime;
                        const data = await res.json().catch(() => ({}));

                        testKeyBtn.classList.remove("testing");

                        if (res.ok) {
                            // 1. Success! Save to LocalStorage
                            localStorage.setItem("bada_gemini_api_key", curKey);
                            // 2. Sync to ComfyUI backend config in background (fire-and-forget)
                            fetch("/api/bada/gemini/config", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ api_key: curKey })
                            }).catch(() => {});

                            testKeyBtn.classList.add("success");
                            if (iconSpan) iconSpan.textContent = "✅";
                            if (textSpan) textSpan.textContent = `${latency}ms`;
                            showToast(
                                isKo
                                    ? `✅ Google Gemini API 정상 연결 확인 완료! (${latency}ms)`
                                    : `✅ Google Gemini API Connected! (${latency}ms)`,
                                "success",
                                3500
                            );
                        } else {
                            const errMsg = data?.error?.message || `HTTP ${res.status}`;
                            testKeyBtn.classList.add("error");
                            if (iconSpan) iconSpan.textContent = "❌";
                            if (textSpan) textSpan.textContent = isKo ? "오류" : "Error";
                            showToast(
                                (isKo ? "❌ Gemini API 인증 실패: " : "❌ Gemini API auth failed: ") + errMsg,
                                "error",
                                5000
                            );
                            addErrorLog(isKo ? "API 연결 테스트" : "API Connection Test", errMsg);
                        }
                    } catch (err) {
                        clearTimeout(timeoutTimer);
                        testKeyBtn.classList.remove("testing");
                        testKeyBtn.classList.add("error");
                        if (iconSpan) iconSpan.textContent = "❌";
                        if (textSpan) textSpan.textContent = isKo ? "오류" : "Error";

                        const errDesc = err.name === "AbortError"
                            ? (isKo ? "응답 시간 초과 (6초)" : "Timeout (6s)")
                            : (err.message || "Network error");

                        showToast(
                            (isKo ? "❌ Gemini 연결 오류: " : "❌ Connection error: ") + errDesc,
                            "error",
                            5000
                        );
                        addErrorLog(isKo ? "API 연결 테스트" : "API Connection Test", errDesc);
                    } finally {
                        clearTimeout(timeoutTimer);
                        setTimeout(() => {
                            testKeyBtn.dataset.busy = "false";
                            testKeyBtn.classList.remove("success", "error", "testing");
                            if (iconSpan) iconSpan.textContent = origIcon;
                            if (textSpan) textSpan.textContent = (typeof BadaI18n !== "undefined" && BadaI18n.lang === "ko") ? "연결확인" : "Check";
                        }, 3500);
                    }
                });
            }

            // Fetch server config if present
            fetch("/api/bada/gemini/config")
                .then(r => r.json())
                .then(data => {
                    if (data.success && !apiKeyInput.value && data.has_key) {
                        apiKeyInput.placeholder = data.masked_key || "Using Server/ENV Key ✅";
                    }
                })
                .catch(() => {});

            // 3. 4 Engine Tabs Navigation
            const engineNav = document.createElement("div");
            engineNav.className = "bada-engine-nav";

            function renderEngineNav() {
                engineNav.innerHTML = "";
                const isKoNow = (typeof BadaI18n !== "undefined" && BadaI18n.lang === "ko");
                ENGINES.forEach(eng => {
                    const btn = document.createElement("button");
                    btn.type = "button";
                    btn.className = `bada-engine-btn ${activeEngine === eng.id ? "active" : ""}`;
                    btn.setAttribute("data-engine", eng.id);
                    btn.textContent = isKoNow ? eng.name : (eng.name_en || eng.name);
                    btn.title = isKoNow ? `${eng.name} (${eng.tag})` : `${eng.name_en || eng.name} (${eng.tag_en || eng.tag})`;
                    btn.onclick = () => {
                        activeEngine = eng.id;
                        localStorage.setItem("bada_active_engine", activeEngine);
                        engineNav.querySelectorAll(".bada-engine-btn").forEach(b => {
                            b.classList.toggle("active", b.getAttribute("data-engine") === activeEngine);
                        });
                        renderEngineView();
                    };
                    engineNav.appendChild(btn);
                });
            }
            renderEngineNav();
            root.appendChild(engineNav);

            // Container for Standard Prompt Generator (MiniMax, LTX, KREA)
            const promptStudioContainer = document.createElement("div");
            promptStudioContainer.className = "bada-prompt-studio-container";
            if (activeEngine === "uncensored") {
                promptStudioContainer.style.setProperty("display", "none", "important");
                promptStudioContainer.classList.add("bada-hidden");
            } else {
                promptStudioContainer.style.setProperty("display", "flex", "important");
            }
            promptStudioContainer.style.flexDirection = "column";
            promptStudioContainer.style.gap = "10px";
            root.appendChild(promptStudioContainer);

            // Container for Uncensored Gemini Chat
            const chatStudioContainer = document.createElement("div");
            chatStudioContainer.className = "bada-gemini-chat-wrap";
            if (activeEngine === "uncensored") {
                chatStudioContainer.style.setProperty("display", "flex", "important");
            } else {
                chatStudioContainer.style.setProperty("display", "none", "important");
                chatStudioContainer.classList.add("bada-hidden");
            }
            root.appendChild(chatStudioContainer);

            // -------------------------------------------------------------
            // PROMPT STUDIO COMPONENTS (MiniMax / LTX / KREA)
            // -------------------------------------------------------------
            const submodePanel = document.createElement("div");
            submodePanel.className = "bada-submode-panel";
            promptStudioContainer.appendChild(submodePanel);

            // Options Row: slim NSFW / Korean toggles (left) + Aspect Ratio dropdown (right).
            // The ON/OFF chips that used to sit inside each toggle card are gone: they ate
            // ~45px + an 8px gap apiece in a three-column row, and that missing width is what
            // ellipsised the labels next to them ("Allow NS…", "한국어 변…") in BOTH languages.
            // The pressed state now lives on the card itself (`.on` -> accent border + fill),
            // which reads at a glance and costs zero horizontal space.
            const optionsGrid = document.createElement("div");
            optionsGrid.className = "bada-options-row";
            optionsGrid.innerHTML = `
                <div class="bada-options-toggles">
                    <div class="bada-toggle-card${isNSFW ? ' on' : ''}" id="bada-toggle-nsfw" role="button" tabindex="0" aria-pressed="${isNSFW ? 'true' : 'false'}" aria-label="${isKo ? "성인용 콘텐츠 허용 (NSFW)" : "Allow NSFW Content"}" title="${isKo ? "관능적/친밀한 장면 무검열 묘사" : "Uncensored sensual & intimate scenes"}">
                        <span class="bada-toggle-title">${isKo ? "성인용 콘텐츠 (NSFW)" : "Allow NSFW"}</span>
                    </div>
                    <div class="bada-toggle-card${isTranslate ? ' on' : ''}" id="bada-toggle-trans" role="button" tabindex="0" aria-pressed="${isTranslate ? 'true' : 'false'}" aria-label="${isKo ? "한국어 번역 및 해설" : "Korean Translation & Notes"}" title="${isKo ? "영문 프롬프트와 연출 해설 분할" : "Separate English prompt and director notes"}">
                        <span class="bada-toggle-title">${isKo ? "한국어 번역" : "Korean Translation"}</span>
                    </div>
                </div>
                <div class="bada-aspect-picker" id="bada-aspect-picker">
                    <button type="button" class="bada-aspect-trigger" id="bada-aspect-trigger" aria-expanded="false" aria-haspopup="listbox">
                        <span class="bada-aspect-trigger-label" id="bada-aspect-label">${isKo ? "화면 비율 선택" : "Aspect Ratio"}</span>
                        <span class="bada-aspect-trigger-value" id="bada-aspect-value">${activeAspectLabel()}</span>
                        <span class="bada-aspect-arrow" id="bada-aspect-arrow">▼</span>
                    </button>
                    <div class="bada-aspect-menu" id="bada-aspect-menu" role="listbox"></div>
                </div>
            `;
            promptStudioContainer.appendChild(optionsGrid);

            // -------------------------------------------------------------
            // ASPECT RATIO PICKER (expands downward / persisted / forwarded to the AI)
            // -------------------------------------------------------------
            const aspectPicker = optionsGrid.querySelector("#bada-aspect-picker");
            const aspectTrigger = optionsGrid.querySelector("#bada-aspect-trigger");
            const aspectMenu = optionsGrid.querySelector("#bada-aspect-menu");

            function activeAspectLabel() {
                const isKoNow = (typeof BadaI18n !== "undefined" && BadaI18n.lang === "ko");
                const found = ASPECT_RATIOS.find(ratio => ratio.id === aspectRatio) || ASPECT_RATIOS[0];
                return isKoNow ? found.label : (found.label_en || found.label);
            }

            function renderAspectChips() {
                const isKoNow = (typeof BadaI18n !== "undefined" && BadaI18n.lang === "ko");
                aspectMenu.innerHTML = "";
                ASPECT_RATIOS.forEach(ratio => {
                    const chip = document.createElement("button");
                    chip.type = "button";
                    chip.className = `bada-aspect-chip ${aspectRatio === ratio.id ? "active" : ""}`;
                    chip.textContent = isKoNow ? ratio.label : (ratio.label_en || ratio.label);
                    chip.title = ratio.id
                        ? (isKoNow ? `${ratio.id} 비율로 프레임을 구성합니다` : `Compose the frame at ${ratio.id}`)
                        : (isKoNow ? "AI가 장면에 맞는 비율을 직접 선택합니다" : "Let the AI pick the ratio for the scene");
                    chip.onclick = () => {
                        aspectRatio = ratio.id;
                        localStorage.setItem("bada_aspect_ratio", aspectRatio);
                        syncAspectPicker();
                        setAspectPickerOpen(false);
                    };
                    aspectMenu.appendChild(chip);
                });
            }

            function syncAspectPicker() {
                const isKoNow = (typeof BadaI18n !== "undefined" && BadaI18n.lang === "ko");
                const labelEl = optionsGrid.querySelector("#bada-aspect-label");
                const valueEl = optionsGrid.querySelector("#bada-aspect-value");
                if (labelEl) labelEl.textContent = isKoNow ? "화면 비율 선택" : "Aspect Ratio";
                if (valueEl) valueEl.textContent = activeAspectLabel();
                renderAspectChips();
            }

            function positionAspectMenu() {
                const rect = aspectTrigger.getBoundingClientRect();
                const width = aspectMenu.offsetWidth || 200;
                const height = aspectMenu.offsetHeight || 200;
                const margin = 6;
                let left = rect.left;
                let top = rect.bottom + 4;
                // Flip up / clamp so the menu always stays inside the viewport.
                if (left + width > window.innerWidth - margin) left = window.innerWidth - width - margin;
                if (left < margin) left = margin;
                if (top + height > window.innerHeight - margin) {
                    const above = rect.top - height - 4;
                    top = above > margin ? above : Math.max(margin, window.innerHeight - height - margin);
                }
                aspectMenu.style.left = `${Math.round(left)}px`;
                aspectMenu.style.top = `${Math.round(top)}px`;
            }

            function setAspectPickerOpen(open) {
                const isOpen = !!open;
                aspectTrigger.classList.toggle("open", isOpen);
                aspectTrigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
                const arrow = optionsGrid.querySelector("#bada-aspect-arrow");
                if (arrow) arrow.textContent = isOpen ? "▲" : "▼";
                if (!isOpen) {
                    aspectMenu.classList.remove("open");
                    if (aspectMenu.parentNode !== aspectPicker) aspectPicker.appendChild(aspectMenu);
                    return;
                }
                // Move the menu to <body> so no ancestor overflow/transform can clip it,
                // then measure and place it. This is a pure overlay: the node keeps its
                // exact size and position, so the canvas never jolts. (Previously the
                // in-flow accordion called fitToContent(), which grew the node on open and
                // shrank it on close -> the big vertical shake reported by the user.)
                if (aspectMenu.parentNode !== document.body) document.body.appendChild(aspectMenu);
                aspectMenu.classList.add("open");
                positionAspectMenu();
            }

            aspectTrigger.onclick = () => setAspectPickerOpen(!aspectMenu.classList.contains("open"));
            const onAspectOutsidePointerDown = (e) => {
                if (!aspectMenu.classList.contains("open")) return;
                if (!aspectPicker.contains(e.target) && !aspectMenu.contains(e.target)) {
                    setAspectPickerOpen(false);
                }
            };
            document.addEventListener("pointerdown", onAspectOutsidePointerDown);
            // Keep the menu pinned to the trigger while the canvas is panned/zoomed.
            const onAspectViewportChange = () => {
                if (aspectMenu.classList.contains("open")) positionAspectMenu();
            };
            window.addEventListener("resize", onAspectViewportChange);
            window.addEventListener("scroll", onAspectViewportChange, true);
            syncAspectPicker();

            // Both toggles now report their state through the card itself instead of an ON/OFF chip
            // and a toast. The toast was the yellow-highlighted banner: `.bada-toast` is a
            // block child of the card's flex column, so firing it on every click shoved the
            // whole panel down — and it fired on BOTH enable and disable, in both languages.
            // Nothing is lost: the card's border/background change is the confirmation.
            const nsfwToggle = optionsGrid.querySelector("#bada-toggle-nsfw");
            const transToggle = optionsGrid.querySelector("#bada-toggle-trans");

            // Shared visual sync for both cards. aria-pressed keeps the state readable by
            // assistive tech now that the visible ON/OFF text is gone.
            function syncToggleCards() {
                nsfwToggle.classList.toggle("on", isNSFW);
                nsfwToggle.setAttribute("aria-pressed", isNSFW ? "true" : "false");
                transToggle.classList.toggle("on", isTranslate);
                transToggle.setAttribute("aria-pressed", isTranslate ? "true" : "false");
            }

            nsfwToggle.onclick = () => {
                isNSFW = !isNSFW;
                localStorage.setItem("bada_is_nsfw", isNSFW);
                syncToggleCards();
            };

            transToggle.onclick = () => {
                isTranslate = !isTranslate;
                localStorage.setItem("bada_is_translate", isTranslate);
                syncToggleCards();
            };

            // These are role="button" now, so Enter/Space must activate them — a div with
            // onclick alone is unreachable by keyboard and screen readers skip it.
            [nsfwToggle, transToggle].forEach((card) => {
                card.onkeydown = (e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    card.click();
                };
            });
            syncToggleCards();

            // Prompt Instruction Section
            const promptSection = document.createElement("div");
            promptSection.className = "bada-section";
            promptSection.innerHTML = `
                <div class="bada-label">
                    <span id="bada-input-label">${isKo ? "✍️ 씬 연출 지시사항" : "✍️ Scene & Character Directives"}</span>
                    <span class="bada-subtext" id="bada-char-counter">${isKo ? "0자" : "0 chars"}</span>
                </div>
            `;
            const instructionTextarea = document.createElement("textarea");
            instructionTextarea.className = "bada-textarea";
            instructionTextarea.rows = 5;
            instructionTextarea.placeholder = isKo 
                ? "생성하고자 하는 장면, 인물, 구도, 조명 등을 자세히 적어보세요..." 
                : "Describe the scene, character, composition, lighting in detail...";
            instructionTextarea.addEventListener("input", () => {
                const counter = promptSection.querySelector("#bada-char-counter");
                const isKoNow = (typeof BadaI18n !== "undefined" && BadaI18n.lang === "ko");
                if (counter) counter.textContent = isKoNow ? `${instructionTextarea.value.length}자` : `${instructionTextarea.value.length} chars`;
            });
            promptSection.appendChild(instructionTextarea);

            promptStudioContainer.appendChild(promptSection);

            // Multimodal Reference Images Section
            const imgSection = document.createElement("div");
            imgSection.className = "bada-section";
            const imgLabelRow = document.createElement("div");
            imgLabelRow.className = "bada-label";
            imgLabelRow.innerHTML = `
                <span id="bada-img-label">${isKo ? "🖼️ 참고 이미지 (멀티모달 비전)" : "🖼️ Reference Images (Multimodal Vision)"}</span>
                <span class="bada-subtext" id="bada-img-counter">0 attached</span>
            `;
            imgSection.appendChild(imgLabelRow);

            const fileInput = document.createElement("input");
            fileInput.type = "file";
            fileInput.multiple = true;
            fileInput.accept = "image/*";
            fileInput.style.display = "none";
            imgSection.appendChild(fileInput);

            const dropzone = document.createElement("div");
            dropzone.className = "bada-dropzone";
            dropzone.innerHTML = `
                <div class="bada-drop-icon">📁</div>
                <div class="bada-drop-text" id="bada-drop-text">${isKo ? "드래그하거나 <b>Ctrl+V</b>로 이미지 붙여넣기" : "Drag images or paste with <b>Ctrl+V</b>"}</div>
                <div class="bada-drop-subtext" id="bada-drop-subtext">${isKo ? "PNG, JPG, WEBP 지원" : "PNG, JPG, WEBP supported"}</div>
            `;
            dropzone.onclick = () => fileInput.click();

            ["dragenter", "dragover"].forEach(eventName => {
                dropzone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropzone.classList.add("dragover");
                });
            });
            ["dragleave", "drop"].forEach(eventName => {
                dropzone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropzone.classList.remove("dragover");
                });
            });
            dropzone.addEventListener("drop", (e) => {
                const files = e.dataTransfer.files;
                handleFiles(files);
            });
            fileInput.addEventListener("change", () => {
                if (fileInput.files.length > 0) {
                    handleFiles(fileInput.files);
                    fileInput.value = "";
                }
            });
            imgSection.appendChild(dropzone);

            const thumbContainer = document.createElement("div");
            thumbContainer.className = "bada-thumbnails-container";
            thumbContainer.style.display = "none";

            const thumbGrid = document.createElement("div");
            thumbGrid.className = "bada-thumbnails-grid";
            thumbContainer.appendChild(thumbGrid);

            const thumbActions = document.createElement("div");
            thumbActions.className = "bada-thumb-actions";
            thumbActions.innerHTML = `
                <span id="bada-thumb-hint">${isKo ? "이미지 클릭/호버하여 삭제" : "Click / hover image to delete"}</span>
                <button type="button" class="bada-btn-text" id="bada-clear-all">${isKo ? "🗑️ 전체 삭제" : "🗑️ Clear All"}</button>
            `;
            thumbContainer.appendChild(thumbActions);
            imgSection.appendChild(thumbContainer);
            promptStudioContainer.appendChild(imgSection);

            // 이미지 첨부: 모드별 장수 제한을 먼저 걸고, Gemini 전송 전에 브라우저에서
            // 1024px/JPEG 로 축소한다 (원본 그대로면 base64 변환 후 20MB 를 넘어 실패한다).
            async function handleFiles(files) {
                const incoming = Array.from(files).filter(f => f && f.type && f.type.startsWith("image/"));
                if (!incoming.length) return;

                const limit = currentImageLimit(activeEngine, qwenSub);
                let resizedCount = 0;

                for (const file of incoming) {
                    if (uploadedImages.length >= limit) {
                        showToast(
                            isKo
                                ? `⚠️ ${activeEngine === "qwen21" && qwenSub === "i2i" ? "I2I" : "현재 모드"}는 최대 ${limit}장까지 첨부할 수 있습니다.`
                                : `⚠️ This mode accepts up to ${limit} image(s).`,
                            "error", 3500,
                        );
                        break;
                    }
                    try {
                        const rawDataUrl = await readFileAsDataUrl(file);
                        const { dataUrl, resized } = await downscaleImageForGemini(rawDataUrl);
                        if (resized) resizedCount += 1;
                        uploadedImages.push(dataUrl);
                    } catch (err) {
                        console.warn("[BadaAsyncGemini] image attach failed:", err);
                        showToast(isKo ? "⚠️ 이미지를 읽을 수 없습니다." : "⚠️ Could not read the image.", "error", 2500);
                    }
                }

                renderThumbnails();
                if (uploadedImages.length > 0) {
                    const base = isKo ? `🖼️ 참고 이미지 ${uploadedImages.length}장 첨부 완료` : `🖼️ ${uploadedImages.length} reference image(s) attached`;
                    const note = resizedCount > 0
                        ? (isKo ? ` (1024px로 축소 ${resizedCount}장)` : ` (${resizedCount} resized to 1024px)`)
                        : "";
                    showToast(base + note, "success", 1800);
                }
            }

            function readFileAsDataUrl(file) {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = () => reject(reader.error || new Error("FileReader error"));
                    reader.readAsDataURL(file);
                });
            }

            function renderThumbnails() {
                thumbGrid.innerHTML = "";
                const counter = root.querySelector("#bada-img-counter");
                if (counter) counter.textContent = `${uploadedImages.length} attached`;

                if (uploadedImages.length === 0) {
                    thumbContainer.style.display = "none";
                    return;
                }
                thumbContainer.style.display = "flex";
                uploadedImages.forEach((imgData, idx) => {
                    const item = document.createElement("div");
                    item.className = "bada-thumbnail-item";
                    item.innerHTML = `
                        <img class="bada-thumbnail-img" src="${imgData}" />
                        <button type="button" class="bada-thumbnail-del" title="${isKo ? "삭제" : "Delete"}">×</button>
                        <div class="bada-thumbnail-num">#${idx + 1}</div>
                    `;
                    item.querySelector(".bada-thumbnail-del").onclick = (e) => {
                        e.stopPropagation();
                        uploadedImages.splice(idx, 1);
                        renderThumbnails();
                    };
                    thumbGrid.appendChild(item);
                });
            }

            thumbActions.querySelector("#bada-clear-all").onclick = () => {
                uploadedImages = [];
                renderThumbnails();
                showToast(isKo ? "모든 참고 이미지를 삭제했습니다." : "All reference images cleared.", "info", 1500);
            };

            // Main Generate Button
            const generateBtn = document.createElement("button");
            generateBtn.type = "button";
            generateBtn.className = "bada-btn-generate";
            generateBtn.innerHTML = `<span>🚀</span> <span>${isKo ? "프롬프트 생성 (비동기)" : "Generate Prompt (Async)"}</span>`;
            promptStudioContainer.appendChild(generateBtn);

            // Output Section (Standard & Storyboard)
            const outputSection = document.createElement("div");
            outputSection.className = "bada-section";
            outputSection.innerHTML = `
                <div class="bada-label">
                    <span id="bada-output-title">${isKo ? "✨ 생성된 프롬프트 결과" : "✨ Generated Output"}</span>
                </div>
            `;
            const tabsHeader = document.createElement("div");
            tabsHeader.className = "bada-tabs-header";
            const tabEng = document.createElement("button");
            tabEng.type = "button";
            tabEng.className = "bada-tab-btn active";
            tabEng.textContent = isKo ? "🇺🇸 영문 마스터" : "🔤 English Master";

            const tabKor = document.createElement("button");
            tabKor.type = "button";
            tabKor.className = "bada-tab-btn";
            tabKor.textContent = isKo ? "🇰🇷 한국어 번역" : "🇰🇷 Korean Translation";

            const tabAll = document.createElement("button");
            tabAll.type = "button";
            tabAll.className = "bada-tab-btn";
            tabAll.textContent = isKo ? "📜 통합본" : "📜 Combined";

            tabsHeader.appendChild(tabEng);
            tabsHeader.appendChild(tabKor);
            tabsHeader.appendChild(tabAll);
            outputSection.appendChild(tabsHeader);

            const outputTextarea = document.createElement("textarea");
            outputTextarea.className = "bada-textarea output";
            outputTextarea.rows = 4;
            outputTextarea.placeholder = isKo ? "생성된 프롬프트가 여기에 표시됩니다. 자유롭게 직접 수정할 수도 있습니다." : "Generated prompt will appear here. You can also edit it directly.";
            outputSection.appendChild(outputTextarea);

            // Clipboard button: it shares the tab bar but is styled as a separate group.
            // It always copies whatever the currently selected tab is showing.
            const copyBtn = document.createElement("button");
            copyBtn.type = "button";
            copyBtn.className = "bada-tab-copy";
            const COPY_TAB_META = {
                english: { ko: "영문 마스터", en: "English Master", chip: { ko: "📋 영문", en: "📋 English" } },
                korean: { ko: "한국어 번역", en: "Korean Translation", chip: { ko: "📋 한국어", en: "📋 Korean" } },
                all: { ko: "통합본", en: "Combined", chip: { ko: "📋 통합본", en: "📋 Combined" } },
            };
            function refreshCopyButton() {
                const langKo = (typeof BadaI18n !== "undefined" && BadaI18n.lang === "ko");
                const meta = COPY_TAB_META[currentTab] || COPY_TAB_META.english;
                copyBtn.textContent = langKo ? meta.chip.ko : meta.chip.en;
                copyBtn.title = langKo
                    ? `지금 화면에 보이는 [${meta.ko}] 내용을 클립보드에 복사합니다 (탭을 바꾸면 대상도 바뀝니다)`
                    : `Copies the visible [${meta.en}] text to the clipboard (follows the active tab)`;
            }
            copyBtn.onclick = async () => {
                const langKo = (typeof BadaI18n !== "undefined" && BadaI18n.lang === "ko");
                const meta = COPY_TAB_META[currentTab] || COPY_TAB_META.english;
                const text = (outputTextarea.value || "").trim();
                if (!text) {
                    showToast(langKo ? "⚠️ 복사할 생성된 프롬프트가 없습니다." : "⚠️ No generated prompt to copy.", "error", 2000);
                    return;
                }
                try {
                    await navigator.clipboard.writeText(text);
                    copyBtn.classList.add("active");
                    showToast(langKo
                        ? `📋 ${meta.ko} 내용을 클립보드에 복사했습니다!`
                        : `📋 Copied the ${meta.en} text to the clipboard!`, "success", 2000);
                    setTimeout(() => copyBtn.classList.remove("active"), 1200);
                } catch (err) {
                    showToast((langKo ? "클립보드 복사 실패: " : "Clipboard copy failed: ") + err, "error", 2500);
                }
            };
            tabsHeader.appendChild(copyBtn);
            refreshCopyButton();

            // Storyboard Card Container (Rendered when Storyboard cuts are returned)
            const storyboardOutputContainer = document.createElement("div");
            storyboardOutputContainer.className = "bada-storyboard-panel";
            storyboardOutputContainer.style.display = "none";
            outputSection.appendChild(storyboardOutputContainer);

            promptStudioContainer.appendChild(outputSection);

            function updateActiveTab(tabName) {
                currentTab = tabName;
                tabEng.classList.toggle("active", tabName === "english");
                tabKor.classList.toggle("active", tabName === "korean");
                tabAll.classList.toggle("active", tabName === "all");

                if (tabName === "english") {
                    outputTextarea.value = lastEnglishPrompt;
                } else if (tabName === "korean") {
                    outputTextarea.value = lastKoreanTranslation || (isKo ? "(한국어 해설이 없습니다)" : "(No translation available)");
                } else if (tabName === "all") {
                    if (lastKoreanTranslation) {
                        outputTextarea.value = `${lastEnglishPrompt}\n\n--- KOREAN TRANSLATION ---\n${lastKoreanTranslation}`;
                    } else {
                        outputTextarea.value = lastEnglishPrompt;
                    }
                }
                refreshCopyButton();
                autoFitOutputTextarea();
            }

            tabEng.onclick = () => updateActiveTab("english");
            tabKor.onclick = () => updateActiveTab("korean");
            tabAll.onclick = () => updateActiveTab("all");

            // QWEN2.1 (and the structured-JSON system prompt mode) return no Korean block, so the
            // "한국어 번역" / "통합본" tabs are filled through the format-preserving translate proxy.
            async function ensureKoreanTranslation(text) {
                try {
                    const resp = await fetch("/api/bada/translate", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ text: text, target_lang: "ko", source_lang: "en" })
                    });
                    const data = await resp.json();
                    if (data.success && data.translated_text) {
                        lastKoreanTranslation = data.translated_text;
                        if (currentTab === "korean" || currentTab === "all") updateActiveTab(currentTab);
                    }
                } catch (err) {
                    console.warn("[BadaAsyncGemini] Korean translation failed:", err);
                }
            }

            const syncOutputToNodeWidget = (text) => {
                if (node.widgets && node.widgets.length > 0) {
                    const promptW = node.widgets.find(w => w.name === "generated_prompt");
                    if (promptW) promptW.value = text;
                }
            };

            outputTextarea.addEventListener("input", () => {
                if (currentTab === "english") {
                    lastEnglishPrompt = outputTextarea.value;
                    syncOutputToNodeWidget(lastEnglishPrompt);
                }
                scheduleOutputRefit();
            });

            function sendTextToActiveClip(text) {
                const canvas = appInstance.canvas;
                const selectedNodes = canvas?.selected_nodes ? Object.values(canvas.selected_nodes) : [];
                const targetCandidates = selectedNodes.filter(n => n.id !== node.id);

                let targetNode = targetCandidates.find(n => {
                    const title = (n.title || n.type || "").toLowerCase();
                    return title.includes("clip") || title.includes("prompt") || title.includes("text");
                });

                if (!targetNode && targetCandidates.length === 1) {
                    targetNode = targetCandidates[0];
                }

                if (targetNode && targetNode.widgets) {
                    const textWidget = targetNode.widgets.find(w => w.type === "customtext" || w.name === "text" || w.name === "prompt" || (typeof w.value === "string" && w.options?.multiline));
                    if (textWidget) {
                        textWidget.value = text;
                        if (targetNode.onWidgetChanged) {
                            targetNode.onWidgetChanged(textWidget.name, text, textWidget.value, textWidget);
                        }
                        canvas.setDirty(true, true);
                        showToast(isKo ? `➡️ '${targetNode.title || targetNode.type}' 노드로 프롬프트 주입 완료!` : `➡️ Injected prompt into '${targetNode.title || targetNode.type}'!`, "success", 3000);
                        return true;
                    }
                }

                showToast(isKo ? "⚠️ 프롬프트를 전송할 CLIPTextEncode 노드를 캔버스에서 먼저 클릭해 주세요!" : "⚠️ Please select a CLIPTextEncode node on canvas first!", "error", 4000);
                return false;
            }

            function loadSystemPromptRegistry(force = false) {
                if (!force && systemPromptsLoaded) return Promise.resolve(userSystemPrompts);
                if (systemPromptLoadPromise) return systemPromptLoadPromise;

                systemPromptLoadPromise = fetch(`/api/bada/promptgen/registry?ts=${Date.now()}`)
                    .then(async response => {
                        const data = await response.json();
                        if (!response.ok || !data.success) throw new Error(data.error || `HTTP ${response.status}`);
                        userSystemPrompts = Array.isArray(data.registry?.user_prompts)
                            ? data.registry.user_prompts.filter(prompt => prompt && (prompt.text || prompt.system_prompt))
                            : [];
                        const selectedExists = userSystemPrompts.some(prompt =>
                            String(prompt.id || prompt.name) === selectedSystemPromptId
                        );
                        if (!selectedExists) {
                            selectedSystemPromptId = String(userSystemPrompts[0]?.id || userSystemPrompts[0]?.name || "");
                        }
                        if (selectedSystemPromptId) localStorage.setItem("bada_async_system_prompt", selectedSystemPromptId);
                        else localStorage.removeItem("bada_async_system_prompt");
                        systemPromptsLoaded = true;
                        return userSystemPrompts;
                    })
                    .catch(error => {
                        systemPromptsLoaded = false;
                        throw error;
                    })
                    .finally(() => { systemPromptLoadPromise = null; });
                return systemPromptLoadPromise;
            }

            async function openSystemPromptManager(button) {
                button.disabled = true;
                try {
                    const modal = await import("./bada_promptgen_modal.js");
                    await modal.openPromptGenModal({
                        onSaved: async () => {
                            await loadSystemPromptRegistry(true);
                            if (activeEngine === "system_prompt") renderSubmodePanel();
                        },
                    });
                } catch (error) {
                    console.error("[BadaAsyncGemini] system prompt manager failed:", error);
                    showToast(isKo ? "시스템 프롬프트 관리자를 열지 못했습니다." : "Could not open the system prompt manager.", "error", 4000);
                } finally {
                    button.disabled = false;
                }
            }

            // -------------------------------------------------------------
            // 제미나이 탭 전용 시스템 프롬프트 (engines_registry.json :: gemini_prompts)
            // `user_prompts` 와 완전히 분리되어 있어, 이 목록은 오직 🔞 제미나이 탭에서만 사용된다.
            // -------------------------------------------------------------
            function loadGemChatPrompts(force = false) {
                if (!force && gemChatPromptsLoaded) return Promise.resolve(gemChatPrompts);
                if (gemChatPromptsLoadPromise) return gemChatPromptsLoadPromise;

                gemChatPromptsLoadPromise = fetch(`/api/bada/promptgen/registry?ts=${Date.now()}`)
                    .then(async response => {
                        const data = await response.json();
                        if (!response.ok || !data.success) throw new Error(data.error || `HTTP ${response.status}`);
                        gemChatPrompts = Array.isArray(data.registry?.gemini_prompts)
                            ? data.registry.gemini_prompts.filter(prompt => prompt && (prompt.text || prompt.system_prompt) && prompt.id)
                            : [];
                        const selectedExists = gemChatPrompts.some(prompt =>
                            String(prompt.id) === selectedGemPromptId
                        );
                        if (!selectedExists) {
                            selectedGemPromptId = "";
                            localStorage.removeItem("bada_gem_chat_prompt");
                        }
                        gemChatPromptsLoaded = true;
                        return gemChatPrompts;
                    })
                    .catch(error => {
                        gemChatPromptsLoaded = false;
                        throw error;
                    })
                    .finally(() => { gemChatPromptsLoadPromise = null; });
                return gemChatPromptsLoadPromise;
            }

            async function openGemPromptManager(button) {
                button.disabled = true;
                try {
                    const modal = await import("./bada_gemini_prompt_modal.js");
                    await modal.openGeminiPromptModal({
                        onSaved: async () => {
                            await loadGemChatPrompts(true);
                            if (activeEngine === "uncensored") renderChatStudio();
                        },
                    });
                } catch (error) {
                    console.error("[BadaAsyncGemini] gemini prompt manager failed:", error);
                    showToast(isKo ? "제미나이 프롬프트 관리자를 열지 못했습니다." : "Could not open the Gemini prompt manager.", "error", 4000);
                } finally {
                    button.disabled = false;
                }
            }

            // -------------------------------------------------------------
            // SUBMODE RENDERING (MiniMax / LTX / KREA / QWEN / System Prompt)
            // -------------------------------------------------------------
            function renderSubmodePanel() {
                submodePanel.innerHTML = "";

                if (activeEngine === "minimax") {
                    const headerRow = document.createElement("div");
                    headerRow.className = "bada-submode-header";
                    headerRow.innerHTML = `
                        <div class="bada-submode-title">
                            <span>🎬</span> <span>${isKo ? "MiniMax H3 세부 모드" : "MiniMax H3 Submodes"}</span>
                        </div>
                        <span class="bada-engine-tag">Omni-Modal Video + Audio</span>
                    `;
                    submodePanel.appendChild(headerRow);

                    const grid = document.createElement("div");
                    grid.className = "bada-submode-grid cols-5";
                    MINIMAX_SUBMODES.forEach(sub => {
                        const card = document.createElement("div");
                        card.className = `bada-sub-card compact minimax-card ${minimaxSub === sub.id ? "active" : ""}`;
                        card.innerHTML = `
                            <span class="bada-sub-name">${isKo ? sub.name : (sub.name_en || sub.name)}</span>
                            <span class="bada-sub-tag">${isKo ? sub.tag : (sub.tag_en || sub.tag)}</span>
                        `;
                        card.onclick = () => {
                            minimaxSub = sub.id;
                            localStorage.setItem("bada_minimax_sub", minimaxSub);
                            renderSubmodePanel();
                            updateInputPlaceholders();
                        };
                        grid.appendChild(card);
                    });
                    submodePanel.appendChild(grid);

                    renderDurationSlider();

                } else if (activeEngine === "ltx") {
                    const headerRow = document.createElement("div");
                    headerRow.className = "bada-submode-header";
                    headerRow.innerHTML = `
                        <div class="bada-submode-title">
                            <span>🎥</span> <span>${isKo ? "LTX-Video 2.5 세부 모드" : "LTX-Video 2.5 Submodes"}</span>
                        </div>
                        <span class="bada-engine-tag">6-Element DiT Architecture</span>
                    `;
                    submodePanel.appendChild(headerRow);

                    const grid = document.createElement("div");
                    grid.className = "bada-submode-grid cols-5";
                    LTX_SUBMODES.forEach(sub => {
                        const card = document.createElement("div");
                        card.className = `bada-sub-card compact ltx-card ${ltxSub === sub.id ? "active" : ""}`;
                        card.innerHTML = `
                            <span class="bada-sub-name">${isKo ? sub.name : (sub.name_en || sub.name)}</span>
                            <span class="bada-sub-tag">${isKo ? sub.tag : (sub.tag_en || sub.tag)}</span>
                        `;
                        card.onclick = () => {
                            ltxSub = sub.id;
                            localStorage.setItem("bada_ltx_sub", ltxSub);
                            renderSubmodePanel();
                            updateInputPlaceholders();
                        };
                        grid.appendChild(card);
                    });
                    submodePanel.appendChild(grid);

                    renderDurationSlider();

                } else if (activeEngine === "krea") {
                    const headerRow = document.createElement("div");
                    headerRow.className = "bada-submode-header";
                    headerRow.innerHTML = `
                        <div class="bada-submode-title">
                            <span>🟢</span> <span>${isKo ? "KREA 2 세부 모드 선택" : "KREA 2 Submodes"}</span>
                        </div>
                        <span class="bada-engine-tag">krea-ai-v2 Photorealism</span>
                    `;
                    submodePanel.appendChild(headerRow);

                    const grid = document.createElement("div");
                    grid.className = "bada-submode-grid cols-3";
                    KREA_SUBMODES.forEach(sub => {
                        const card = document.createElement("div");
                        card.className = `bada-sub-card ${kreaSub === sub.id ? "active" : ""}`;
                        card.innerHTML = `
                            <span class="bada-sub-name">${isKo ? sub.name : (sub.name_en || sub.name)}</span>
                            <span class="bada-sub-tag">${isKo ? sub.desc : (sub.desc_en || sub.desc)}</span>
                        `;
                        card.onclick = () => {
                            kreaSub = sub.id;
                            localStorage.setItem("bada_krea_sub", kreaSub);
                            renderSubmodePanel();
                            updateInputPlaceholders();
                        };
                        grid.appendChild(card);
                    });
                    submodePanel.appendChild(grid);

                    if (kreaSub === "storyboard") {
                        const cutSliderRow = document.createElement("div");
                        cutSliderRow.className = "bada-duration-row";
                        cutSliderRow.innerHTML = `
                            <div class="bada-duration-label">
                                <span>🎬 ${isKo ? "스토리 컷 수:" : "Story Cuts:"}</span>
                                <span><b id="bada-cut-num">${storyboardCutCount}</b>${isKo ? "컷" : " Cuts"}</span>
                            </div>
                            <input type="range" class="bada-duration-slider" min="2" max="15" step="1" value="${storyboardCutCount}">
                            <span class="bada-duration-badge" id="bada-cut-badge">${storyboardCutCount} Cuts</span>
                        `;
                        const slider = cutSliderRow.querySelector(".bada-duration-slider");
                        slider.addEventListener("input", (e) => {
                            storyboardCutCount = parseInt(e.target.value, 10);
                            localStorage.setItem("bada_storyboard_cuts", storyboardCutCount);
                            cutSliderRow.querySelector("#bada-cut-num").textContent = storyboardCutCount;
                            cutSliderRow.querySelector("#bada-cut-badge").textContent = `${storyboardCutCount} Cuts`;
                        });
                        submodePanel.appendChild(cutSliderRow);
                    }
                } else if (activeEngine === "qwen21") {
                    const headerRow = document.createElement("div");
                    headerRow.className = "bada-submode-header";
                    headerRow.innerHTML = `
                        <div class="bada-submode-title"><span>🖼️</span><span>${isKo ? "QWEN2.1 세부 모드 선택" : "QWEN2.1 Submodes"}</span></div>
                        <span class="bada-engine-tag">Official Prompt Enhancer</span>
                    `;
                    submodePanel.appendChild(headerRow);

                    const grid = document.createElement("div");
                    grid.className = "bada-submode-grid cols-2";
                    QWEN_SUBMODES.forEach(sub => {
                        const card = document.createElement("div");
                        card.className = `bada-sub-card qwen-card ${qwenSub === sub.id ? "active" : ""}`;
                        card.innerHTML = `<span class="bada-sub-name">${isKo ? sub.name : sub.name_en}</span><span class="bada-sub-tag">${isKo ? sub.desc : sub.desc_en}</span>`;
                        card.onclick = () => {
                            qwenSub = sub.id;
                            localStorage.setItem("bada_qwen_sub", qwenSub);
                            renderSubmodePanel();
                            updateInputPlaceholders();
                        };
                        grid.appendChild(card);
                    });
                    submodePanel.appendChild(grid);
                } else if (activeEngine === "system_prompt") {
                    const headerRow = document.createElement("div");
                    headerRow.className = "bada-submode-header";
                    headerRow.innerHTML = `<div class="bada-submode-title"><span>📜</span><span>${isKo ? "시스템 프롬프트 선택" : "System Prompt"}</span></div><span class="bada-engine-tag">Custom Instructions</span>`;
                    submodePanel.appendChild(headerRow);

                    const controls = document.createElement("div");
                    controls.className = "bada-preset-row";
                    const promptSelect = document.createElement("select");
                    promptSelect.className = "bada-select";
                    promptSelect.setAttribute("aria-label", isKo ? "시스템 프롬프트 선택" : "Select system prompt");
                    const manageButton = document.createElement("button");
                    manageButton.type = "button";
                    manageButton.className = "bada-btn-text bada-system-prompt-manage";
                    manageButton.textContent = isKo ? "⚙️ 프롬프트 관리" : "⚙️ Manage Prompts";
                    manageButton.onclick = () => openSystemPromptManager(manageButton);
                    controls.append(promptSelect, manageButton);
                    submodePanel.appendChild(controls);

                    // 안내문구는 입력창 placeholder 로 옮겨 DOM 을 가볍게 유지한다.
                    const setSystemHint = (text) => {
                        systemHintText = text || "";
                        if (activeEngine === "system_prompt") updateInputPlaceholders();
                    };

                    const renderPromptOptions = () => {
                        promptSelect.replaceChildren();
                        if (!userSystemPrompts.length) {
                            const option = document.createElement("option");
                            option.value = "";
                            option.textContent = systemPromptsLoaded
                                ? (isKo ? "등록된 시스템 프롬프트가 없습니다" : "No system prompts registered")
                                : (isKo ? "시스템 프롬프트 불러오는 중..." : "Loading system prompts...");
                            promptSelect.appendChild(option);
                            promptSelect.disabled = !systemPromptsLoaded;
                            if (systemPromptsLoaded) {
                                selectedSystemPromptId = "";
                                localStorage.removeItem("bada_async_system_prompt");
                            }
                            setSystemHint(isKo
                                ? "프롬프트 관리에서 새 시스템 프롬프트를 등록하세요."
                                : "Register a system prompt with Manage Prompts to get started.");
                            return;
                        }

                        promptSelect.disabled = false;
                        userSystemPrompts.forEach(prompt => {
                            const option = document.createElement("option");
                            option.value = String(prompt.id || prompt.name);
                            option.textContent = prompt.name || option.value;
                            promptSelect.appendChild(option);
                        });
                        const selected = userSystemPrompts.find(prompt =>
                            String(prompt.id || prompt.name) === selectedSystemPromptId
                        ) || userSystemPrompts[0];
                        selectedSystemPromptId = String(selected.id || selected.name);
                        promptSelect.value = selectedSystemPromptId;
                        localStorage.setItem("bada_async_system_prompt", selectedSystemPromptId);
                        setSystemHint(selected.description || (isKo
                            ? "선택한 사용자 시스템 프롬프트로 생성합니다."
                            : "Generation uses the selected custom system prompt."));
                    };

                    promptSelect.addEventListener("change", () => {
                        selectedSystemPromptId = promptSelect.value;
                        localStorage.setItem("bada_async_system_prompt", selectedSystemPromptId);
                        renderPromptOptions();
                        updateInputPlaceholders();
                    });
                    renderPromptOptions();

                    if (!systemPromptsLoaded && !systemPromptLoadPromise) {
                        loadSystemPromptRegistry()
                            .then(() => {
                                if (activeEngine === "system_prompt") renderSubmodePanel();
                            })
                            .catch(() => {
                                setSystemHint(isKo
                                    ? "시스템 프롬프트를 불러오지 못했습니다. 관리 버튼을 눌러 다시 시도하세요."
                                    : "Could not load system prompts. Open the manager to retry.");
                            });
                    }
                }
            }

            function renderDurationSlider() {
                const durRow = document.createElement("div");
                durRow.className = "bada-duration-row";
                const calcFrames = (sec) => sec * 24 + 1;

                durRow.innerHTML = `
                    <div class="bada-duration-label">
                        <span>⏱️ ${isKo ? "목표 시간:" : "Target Duration:"}</span>
                        <span><b id="bada-dur-num">${durationSec}</b>${isKo ? "초" : "s"}</span>
                    </div>
                    <input type="range" class="bada-duration-slider" min="1" max="30" step="1" value="${durationSec}">
                    <span class="bada-duration-badge" id="bada-frame-badge">${calcFrames(durationSec)} frames</span>
                `;

                const slider = durRow.querySelector(".bada-duration-slider");
                const numText = durRow.querySelector("#bada-dur-num");
                const frameBadge = durRow.querySelector("#bada-frame-badge");

                slider.addEventListener("input", (e) => {
                    durationSec = parseInt(e.target.value, 10);
                    localStorage.setItem("bada_duration_sec", durationSec);
                    numText.textContent = durationSec;
                    frameBadge.textContent = `${calcFrames(durationSec)} frames`;
                    updateInputPlaceholders();
                });

                submodePanel.appendChild(durRow);
            }

            function updateInputPlaceholders() {
                const label = promptSection.querySelector("#bada-input-label");
                if (activeEngine === "minimax") {
                    const sub = MINIMAX_SUBMODES.find(s => s.id === minimaxSub) || MINIMAX_SUBMODES[0];
                    label.textContent = isKo
                        ? `✍️ MiniMax H3 요청 (${minimaxSub.toUpperCase()} • ${durationSec}초)`
                        : `✍️ MiniMax H3 Prompt (${minimaxSub.toUpperCase()} • ${durationSec}s)`;
                    instructionTextarea.placeholder = composePlaceholder([
                        isKo
                            ? `⚡ ${sub.name} (${sub.tag}): ${sub.desc}`
                            : `⚡ ${sub.name_en || sub.name} (${sub.tag_en || sub.tag}): ${sub.desc_en || sub.desc}`,
                        isKo
                            ? "MiniMax H3로 생성할 영상 씬과 동작을 입력하세요."
                            : "Describe the video scene and motion for MiniMax H3.",
                        isKo
                            ? "예: 사이버펑크 네온 비를 맞으며 걷는 여성, 35mm 영화 필름 룩, 자연스러운 카메라 트래킹"
                            : "e.g. Woman walking in cyberpunk neon rain, 35mm film aesthetic, fluid tracking shot",
                    ]);
                    generateBtn.className = "bada-btn-generate minimax";
                    generateBtn.innerHTML = `<span>🎬</span> <span>${isKo ? "MiniMax H3 프롬프트 생성 🚀" : "Generate MiniMax H3 Prompt 🚀"}</span>`;
                } else if (activeEngine === "ltx") {
                    const sub = LTX_SUBMODES.find(s => s.id === ltxSub) || LTX_SUBMODES[0];
                    label.textContent = isKo
                        ? `✍️ LTX-Video 요청 (${ltxSub.toUpperCase()} • ${durationSec}초)`
                        : `✍️ LTX-Video Prompt (${ltxSub.toUpperCase()} • ${durationSec}s)`;
                    instructionTextarea.placeholder = composePlaceholder([
                        isKo
                            ? `⚡ ${sub.name} (${sub.tag}): ${sub.desc}`
                            : `⚡ ${sub.name_en || sub.name} (${sub.tag_en || sub.tag}): ${sub.desc_en || sub.desc}`,
                        isKo
                            ? "LTX-Video 2.5로 생성할 비디오 씬을 입력하세요."
                            : "Describe the video scene for LTX-Video 2.5.",
                        isKo
                            ? "예: 천천히 돌리 인하는 카메라, 인물의 감정적인 표정 변화, 따뜻한 림 라이트와 앰비언트 사운드"
                            : "e.g. Slow camera dolly in, subtle facial emotions, warm rim lighting and ambient sound",
                    ]);
                    generateBtn.className = "bada-btn-generate ltx";
                    generateBtn.innerHTML = `<span>🎥</span> <span>${isKo ? "LTX-Video 프롬프트 생성 🚀" : "Generate LTX-Video Prompt 🚀"}</span>`;
                } else if (activeEngine === "krea") {
                    if (kreaSub === "storyboard") {
                        label.textContent = isKo
                            ? `✍️ KREA 2 스토리보드 요청 (${storyboardCutCount}컷)`
                            : `✍️ KREA 2 Storyboard Prompt (${storyboardCutCount} Cuts)`;
                        instructionTextarea.placeholder = composePlaceholder([
                            isKo
                                ? "🎞️ 상황을 분석하여 일관된 인물/공간을 유지하는 연속 컷 시퀀스를 작성합니다."
                                : "🎞️ Generates sequential cut prompts maintaining character & scene consistency.",
                            isKo
                                ? "스토리보드로 분할할 전체 시나리오나 스토리 개요를 입력하세요."
                                : "Enter narrative or scenario outline to divide into storyboard cuts.",
                            isKo
                                ? "예: 골목길에서 버려진 안드로이드를 수리하는 소녀, 기동 후 서로 미소를 짓는 4단계 시퀀스"
                                : "e.g. Girl repairing an android in an alleyway, 4-step sequence ending in a shared smile",
                        ]);
                        generateBtn.className = "bada-btn-generate";
                        generateBtn.innerHTML = `<span>🎞️</span> <span>${isKo ? `${storyboardCutCount}컷 스토리보드 생성 🚀` : `Generate ${storyboardCutCount}-Cut Storyboard 🚀`}</span>`;
                    } else {
                        label.textContent = isKo ? "✍️ KREA 2 요청" : "✍️ KREA 2 Prompt";
                        instructionTextarea.placeholder = composePlaceholder([
                            isKo
                                ? "ℹ️ KREA 2의 최신 포토리얼 화풍 렌더링 규칙을 적용합니다."
                                : "ℹ️ Applies KREA 2 photorealism rendering rules.",
                            isKo
                                ? "KREA 2로 생성할 씬의 아이디어나 스토리텔을 자유롭게 입력하세요."
                                : "Enter the idea or storyline you want to generate with KREA 2.",
                            isKo
                                ? "예: 비에 젖은 아스팔트와 네온 조명이 반사되는 사이버펑크 도시, 포토리얼리스틱 질감"
                                : "e.g. Cyberpunk city with wet asphalt reflecting neon lights, photorealistic texture",
                            ...imageAnalysisHint(isKo),
                        ]);
                        generateBtn.className = "bada-btn-generate";
                        generateBtn.innerHTML = `<span>🟢</span> <span>${isKo ? "KREA 2 프롬프트 생성 🚀" : "Generate KREA 2 Prompt 🚀"}</span>`;
                    }
                } else if (activeEngine === "qwen21") {
                    const modeName = qwenSub === "i2i" ? "I2I" : "T2I";
                    label.textContent = isKo ? `✍️ QWEN2.1 ${modeName} 프롬프트 요청` : `✍️ QWEN2.1 ${modeName} Prompt Request`;
                    instructionTextarea.placeholder = qwenSub === "i2i"
                        ? composePlaceholder([
                            isKo
                                ? "ℹ️ Qwen-Image-2.1 편집 지침을 적용합니다."
                                : "ℹ️ Applies Qwen-Image-2.1 edit instructions.",
                            isKo
                                ? "참조 이미지를 첨부하고 원하는 편집 내용을 입력하세요."
                                : "Attach reference images and describe the desired edit.",
                            ...multiImageHint(isKo),
                        ])
                        : composePlaceholder([
                            isKo
                                ? "ℹ️ Qwen-Image-2.1 공식 T2I 프롬프트 강화 지침과 권장 화면 비율을 적용합니다."
                                : "ℹ️ Applies the official Qwen-Image-2.1 T2I prompt enhancer and returns a suggested aspect ratio.",
                            isKo
                                ? "QWEN2.1로 생성할 씬의 아이디어나 스토리텔을 자유롭게 입력하세요."
                                : "Enter the idea or storyline you want to generate with QWEN2.1.",
                            isKo
                                ? "예: 비에 젖은 아스팔트와 네온 조명이 반사되는 사이버펑크 도시, 포토리얼리스틱 질감"
                                : "e.g. Cyberpunk city with wet asphalt reflecting neon lights, photorealistic texture",
                            ...imageAnalysisHint(isKo),
                        ]);
                    generateBtn.className = "bada-btn-generate qwen";
                    // 버튼 라벨에서 모드 접미사는 뺀다 (세부분등 카드에서 이미 T2I/I2I 가 표시됨)
                    generateBtn.innerHTML = `<span>🖼️</span> <span>${isKo ? "QWEN2.1 프롬프트 생성 🚀" : "Generate QWEN2.1 Prompt 🚀"}</span>`;
                } else if (activeEngine === "system_prompt") {
                    const selected = userSystemPrompts.find(prompt =>
                        String(prompt.id || prompt.name) === selectedSystemPromptId
                    );
                    label.textContent = isKo
                        ? `✍️ 시스템 프롬프트 요청${selected ? ` (${selected.name})` : ""}`
                        : `✍️ System Prompt Request${selected ? ` (${selected.name})` : ""}`;
                    instructionTextarea.placeholder = composePlaceholder([
                        isKo ? "ℹ️ 선택한 사용자 시스템 프롬프트로 생성합니다." : "ℹ️ Generation uses the selected custom system prompt.",
                        systemHintText,
                        isKo ? "생성할 내용을 입력하세요." : "Describe what to generate with the selected system prompt.",
                    ]);
                    generateBtn.className = "bada-btn-generate system-prompt";
                    generateBtn.innerHTML = `<span>📜</span> <span>${isKo ? "시스템 프롬프트로 생성 🚀" : "Generate with System Prompt 🚀"}</span>`;
                }
            }

            function renderEngineView() {
                if (activeEngine === "uncensored") {
                    promptStudioContainer.style.setProperty("display", "none", "important");
                    promptStudioContainer.classList.add("bada-hidden");
                    chatStudioContainer.style.setProperty("display", "flex", "important");
                    chatStudioContainer.classList.remove("bada-hidden");
                    renderChatStudio();
                    setTimeout(syncContainerSize, 0);
                } else {
                    chatStudioContainer.style.setProperty("display", "none", "important");
                    chatStudioContainer.classList.add("bada-hidden");
                    promptStudioContainer.style.setProperty("display", "flex", "important");
                    promptStudioContainer.classList.remove("bada-hidden");
                    renderSubmodePanel();
                    updateInputPlaceholders();
                    setTimeout(syncContainerSize, 0);
                }
            }

            // -------------------------------------------------------------
            // -------------------------------------------------------------
            // GENERATE PROMPT EXECUTION HANDLER (중단 기능 및 에러 로깅 지원)
            // -------------------------------------------------------------
            generateBtn.onclick = async () => {
                if (isGenerating) {
                    if (generateAbortController) {
                        generateAbortController.abort();
                    }
                    return;
                }

                const instruction = instructionTextarea.value.trim();
                const key = apiKeyInput.value.trim();
                const model = modelSelect.value;

                if (!instruction && uploadedImages.length === 0) {
                    showToast(isKo ? "⚠️ 프롬프트 지시사항 또는 참고 이미지를 입력해 주세요." : "⚠️ Please enter prompt directives or attach a reference image.", "error", 3000);
                    instructionTextarea.focus();
                    return;
                }

                if (activeEngine === "qwen21" && qwenSub === "i2i" && uploadedImages.length === 0) {
                    showToast(isKo ? "QWEN2.1 I2I 편집용 참조 이미지를 첨부해 주세요." : "Attach at least one reference image for QWEN2.1 I2I.", "error", 3000);
                    return;
                }
                if (activeEngine === "system_prompt" && !userSystemPrompts.some(prompt =>
                    String(prompt.id || prompt.name) === selectedSystemPromptId
                )) {
                    showToast(isKo ? "먼저 시스템 프롬프트를 등록하고 선택해 주세요." : "Register and select a system prompt first.", "error", 3000);
                    return;
                }

                isGenerating = true;
                generateAbortController = new AbortController();
                generateBtn.disabled = false;
                generateBtn.classList.add("bada-btn-stop");
                let dataSuccess = false;
                const startTime = Date.now();
                const btnOriginalHtml = generateBtn.innerHTML;
                const isKoNow = (typeof BadaI18n !== "undefined" && BadaI18n.lang === "ko");
                const genLoadingText = isKoNow ? "작업 중..." : "Working...";
                generateBtn.innerHTML = `<span class="bada-spinner"></span> <span>${genLoadingText} ⏱️ 0.0s <b style="margin-left:6px;background:rgba(0,0,0,0.35);padding:1.5px 6px;border-radius:4px;border:1px solid rgba(255,255,255,0.2);">⏹️ ${isKoNow ? "중단" : "Stop"}</b></span>`;

                timerInterval = setInterval(() => {
                    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                    generateBtn.innerHTML = `<span class="bada-spinner"></span> <span>${genLoadingText} ⏱️ ${elapsed}s <b style="margin-left:6px;background:rgba(0,0,0,0.35);padding:1.5px 6px;border-radius:4px;border:1px solid rgba(255,255,255,0.2);">⏹️ ${isKoNow ? "중단" : "Stop"}</b></span>`;
                }, 100);

            // No "working" toast here on purpose: like the completion banner,
            // `.bada-toast` is a block child of the card's flex column, so it inserted
            // a full-width banner above the config section and shoved the panel down
            // mid-generation. The generate button already shows a spinner, the elapsed
            // timer and a Stop control.

                try {
                    const resp = await fetch("/api/bada/gemini/generate", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            api_key: key,
                            model: model,
                            engine_mode: activeEngine,
                            submode: activeEngine === "minimax"
                                ? minimaxSub
                                : (activeEngine === "ltx" ? ltxSub : (activeEngine === "qwen21" ? qwenSub : kreaSub)),
                            duration: durationSec,
                            cut_count: storyboardCutCount,
                            is_nsfw: isNSFW,
                            translate_korean: isTranslate,
                            aspect_ratio: aspectRatio,
                            instruction: instruction,
                            images: uploadedImages,
                            system_prompt_id: activeEngine === "system_prompt" ? selectedSystemPromptId : ""
                        }),
                        signal: generateAbortController.signal
                    });

                    const data = await resp.json();
                    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

                    if (data.success && (data.prompt || data.storyboard)) {
                        dataSuccess = true;
                        lastEnglishPrompt = data.prompt || "";
                        lastKoreanTranslation = data.korean_translation || "";
                        lastStoryboardData = data.storyboard || null;

                        syncOutputToNodeWidget(lastEnglishPrompt);

                        // QWEN2.1 returns only the enhanced prompt (no Korean block) — fill the
                        // "한국어 번역" / "통합본" tabs asynchronously so all engines behave the same.
                        if (!lastKoreanTranslation && !lastStoryboardData && isTranslate && lastEnglishPrompt) {
                            ensureKoreanTranslation(lastEnglishPrompt);
                        }

                        // If storyboard data exists, render cards
                        if (lastStoryboardData && lastStoryboardData.cuts && lastStoryboardData.cuts.length > 0) {
                            renderStoryboardCards(lastStoryboardData);
                        } else {
                            storyboardOutputContainer.style.display = "none";
                            outputTextarea.style.display = "block";
                            tabsHeader.style.display = "flex";
                            updateActiveTab("english");
                        }

                        // Completed state with elapsed time
                        generateBtn.innerHTML = `<span>✨</span> <span>${isKoNow ? `생성 완료! (${duration}초)` : `Completed! (${duration}s)`}</span>`;
                        setTimeout(() => {
                            if (!isGenerating) updateInputPlaceholders();
                        }, 3500);

                        // No success toast here on purpose: `.bada-toast` is a block child of the
                        // card's flex column, so showing it inserted a full-width banner ABOVE the
                        // config section and shoved the whole panel — every engine tab included —
                        // downwards. The generate button already reads "생성 완료! (N초)".
                    } else {
                        const errMsg = data.error || (isKoNow ? "알 수 없는 오류가 발생했습니다." : "An unknown error occurred.");
                        showToast(`❌ ${isKoNow ? "오류" : "Error"}: ${errMsg}`, "error", 5000);
                        addErrorLog(isKoNow ? `${activeEngine.toUpperCase()} 생성` : `${activeEngine.toUpperCase()} Generation`, errMsg);
                    }
                } catch (err) {
                    if (err.name === "AbortError") {
                        showToast(isKoNow ? "⏹️ 생성이 사용자에 의해 중단되었습니다." : "⏹️ Generation cancelled by user.", "info", 3000);
                    } else {
                        const errDesc = err.message || "Network error";
                        showToast((isKoNow ? "❌ 네트워크 오류: " : "❌ Network error: ") + errDesc, "error", 5000);
                        addErrorLog(isKoNow ? `${activeEngine.toUpperCase()} 생성` : `${activeEngine.toUpperCase()} Generation`, errDesc);
                    }
                } finally {
                    isGenerating = false;
                    generateAbortController = null;
                    clearInterval(timerInterval);
                    timerInterval = null;
                    generateBtn.disabled = false;
                    generateBtn.classList.remove("bada-btn-stop");
                    if (!dataSuccess) {
                        generateBtn.innerHTML = btnOriginalHtml;
                    }
                }
            };

            function renderStoryboardCards(sbData) {
                storyboardOutputContainer.innerHTML = "";
                storyboardOutputContainer.style.display = "flex";
                outputTextarea.style.display = "none";
                tabsHeader.style.display = "none";

                const toolbar = document.createElement("div");
                toolbar.className = "bada-story-toolbar";
                toolbar.innerHTML = `
                    <span class="bada-story-badge">🎞️ ${isKo ? `스토리보드 (${sbData.cuts.length}컷 생성 완료)` : `Storyboard (${sbData.cuts.length} Cuts Generated)`}</span>
                    <div style="display: flex; gap: 4px;">
                        <button type="button" class="bada-btn-cut-action" id="bada-copy-all-cuts">${isKo ? "📋 전체 컷 복사" : "📋 Copy All Cuts"}</button>
                        <button type="button" class="bada-btn-cut-action" id="bada-send-all-cuts">${isKo ? "➡️ 1번 컷 CLIP 전송" : "➡️ Send Cut #1 to CLIP"}</button>
                    </div>
                `;
                toolbar.querySelector("#bada-copy-all-cuts").onclick = async () => {
                    const allText = sbData.cuts.map(c => `[Cut ${c.cutNumber}: ${c.cameraAngle}]\n${c.englishPrompt}\n(${c.koreanTranslation})`).join("\n\n");
                    await navigator.clipboard.writeText(allText);
                    showToast(isKo ? "전체 스토리보드 컷이 복사되었습니다! 📋" : "All storyboard cuts copied to clipboard! 📋", "success", 2000);
                };
                toolbar.querySelector("#bada-send-all-cuts").onclick = () => {
                    if (sbData.cuts.length > 0) {
                        sendTextToActiveClip(sbData.cuts[0].englishPrompt);
                    }
                };
                storyboardOutputContainer.appendChild(toolbar);

                if (sbData.summary) {
                    const sumBox = document.createElement("div");
                    sumBox.className = "bada-callout";
                    const summaryTitle = document.createElement("b");
                    summaryTitle.textContent = isKo ? "전체 줄거리" : "Overall Synopsis";
                    sumBox.append(summaryTitle, document.createTextNode(`: ${String(sbData.summary)}`));
                    storyboardOutputContainer.appendChild(sumBox);
                }

                sbData.cuts.forEach(cut => {
                    const card = document.createElement("div");
                    card.className = "bada-story-card";
                    const englishPrompt = String(cut.englishPrompt ?? "");
                    const koreanTranslation = String(cut.koreanTranslation ?? "");

                    const storyHeader = document.createElement("div");
                    storyHeader.className = "bada-story-header";
                    const cutNumber = document.createElement("span");
                    cutNumber.className = "bada-cut-num";
                    cutNumber.textContent = `Cut #${String(cut.cutNumber ?? "")}`;
                    const cameraAngle = document.createElement("span");
                    cameraAngle.className = "bada-cut-angle";
                    cameraAngle.textContent = String(cut.cameraAngle || "Standard");
                    storyHeader.append(cutNumber, cameraAngle);

                    const promptEl = document.createElement("div");
                    promptEl.className = "bada-cut-prompt";
                    promptEl.textContent = englishPrompt;
                    card.append(storyHeader, promptEl);

                    if (koreanTranslation) {
                        const translationEl = document.createElement("div");
                        translationEl.className = "bada-cut-trans";
                        translationEl.textContent = koreanTranslation;
                        card.appendChild(translationEl);
                    }

                    const actions = document.createElement("div");
                    actions.className = "bada-cut-actions";
                    const copyButton = document.createElement("button");
                    copyButton.type = "button";
                    copyButton.className = "bada-btn-cut-action bada-copy-cut";
                    copyButton.textContent = isKo ? "📋 복사" : "📋 Copy";
                    const clipButton = document.createElement("button");
                    clipButton.type = "button";
                    clipButton.className = "bada-btn-cut-action bada-clip-cut";
                    clipButton.textContent = isKo ? "➡️ CLIP 전송" : "➡️ Send to CLIP";
                    actions.append(copyButton, clipButton);
                    card.appendChild(actions);

                    copyButton.onclick = async () => {
                        await navigator.clipboard.writeText(englishPrompt);
                        showToast(isKo ? `Cut #${cut.cutNumber} 영문 프롬프트 복사 완료!` : `Cut #${cut.cutNumber} English prompt copied!`, "success", 1500);
                    };
                    clipButton.onclick = () => {
                        sendTextToActiveClip(englishPrompt);
                    };
                    storyboardOutputContainer.appendChild(card);
                });
            }

            // -------------------------------------------------------------
            // ✨ UNCENSORED GEMINI CHAT STUDIO COMPONENT
            // -------------------------------------------------------------
            function renderChatStudio() {
                chatStudioContainer.innerHTML = "";

                // Topbar
                const chatTopbar = document.createElement("div");
                chatTopbar.className = "bada-chat-topbar";

                // ── 페르소나 + 제미나이 전용 시스템 프롬프트 선택 (펼침式 드롭다운) ──
                // "만능 무검열 제미나이" 버튼을 누르면 아래 목록이 펼쳐지고,
                // Gem 페르소나 또는 사용자가 등록한 제미나이 전용 프롬프트를 고른다.
                const personaPicker = document.createElement("div");
                personaPicker.className = "bada-gem-picker";

                const personaTrigger = document.createElement("button");
                personaTrigger.type = "button";
                personaTrigger.className = "bada-gem-select bada-gem-picker-trigger";
                personaTrigger.setAttribute("aria-expanded", "false");

                const personaTriggerLabel = document.createElement("span");
                personaTriggerLabel.className = "bada-gem-picker-label";
                const personaTriggerArrow = document.createElement("span");
                personaTriggerArrow.className = "bada-gem-picker-arrow";
                personaTriggerArrow.textContent = "▼";
                personaTrigger.append(personaTriggerLabel, personaTriggerArrow);

                const personaMenu = document.createElement("div");
                personaMenu.className = "bada-gem-picker-menu";

                const newChatBtn = document.createElement("button");
                newChatBtn.type = "button";
                newChatBtn.className = "bada-pill bada-gem-new-chat";
                newChatBtn.innerHTML = isKo ? "✏️ 새 채팅" : "✏️ New Chat";
                newChatBtn.onclick = () => {
                    chatMessages = [];
                    renderChatMessages();
                    showToast(isKo ? "대화가 초기화되었습니다." : "Conversation reset.", "info", 1500);
                };

                const managePromptsBtn = document.createElement("button");
                managePromptsBtn.type = "button";
                managePromptsBtn.className = "bada-pill bada-gem-prompt-manage";
                managePromptsBtn.textContent = isKo ? "⚙️ 프롬프트 관리" : "⚙️ Manage Prompts";
                managePromptsBtn.title = isKo
                    ? "제미나이 탭 전용 시스템 프롬프트 작성 · 수정 · 삭제 · 순서 이동"
                    : "Create / edit / delete / reorder Gemini-only system prompts";
                managePromptsBtn.onclick = () => openGemPromptManager(managePromptsBtn);

                personaPicker.append(personaTrigger, personaMenu);
                chatTopbar.append(personaPicker);
                chatTopbar.appendChild(managePromptsBtn);
                chatTopbar.appendChild(newChatBtn);
                chatStudioContainer.appendChild(chatTopbar);

                // 현재 선택된 항목의 표시 이름
                function activeGemPromptLabel() {
                    const isKoNow = (typeof BadaI18n !== "undefined" && BadaI18n.lang === "ko");
                    if (selectedGemPromptId) {
                        const found = gemChatPrompts.find(p => String(p.id) === selectedGemPromptId);
                        if (found) return `📜 ${found.name || found.id}`;
                    }
                    const persona = GEM_PERSONAS_LIST.find(p => p.id === selectedGemPersona) || GEM_PERSONAS_LIST[0];
                    return isKoNow ? persona.name : (persona.name_en || persona.name);
                }

                function setPersonaMenuOpen(open) {
                    const isOpen = !!open;
                    personaMenu.classList.toggle("open", isOpen);
                    personaTrigger.classList.toggle("open", isOpen);
                    personaTrigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
                    personaTriggerArrow.textContent = isOpen ? "▲" : "▼";
                }

                function applyGemPromptSelection({ personaId = "", promptId = "" }) {
                    if (promptId) {
                        selectedGemPromptId = String(promptId);
                        localStorage.setItem("bada_gem_chat_prompt", selectedGemPromptId);
                    } else {
                        selectedGemPromptId = "";
                        localStorage.removeItem("bada_gem_chat_prompt");
                    }
                    if (personaId) {
                        selectedGemPersona = personaId;
                        localStorage.setItem("bada_gem_persona", selectedGemPersona);
                    }
                    personaTriggerLabel.textContent = activeGemPromptLabel();
                    renderPersonaMenu();
                    setPersonaMenuOpen(false);
                    // No toast here: every item in this menu funnels through
                    // applyGemPromptSelection(), so firing one popped the banner over the panel
                    // on every persona / system-prompt pick. The trigger label above already
                    // shows the new selection, so nothing is lost.
                }

                function renderPersonaMenu() {
                    const isKoNow = (typeof BadaI18n !== "undefined" && BadaI18n.lang === "ko");
                    personaMenu.innerHTML = "";

                    // 1) 내장 Gem 페르소나
                    const personaGroup = document.createElement("div");
                    personaGroup.className = "bada-gem-picker-group";
                    GEM_PERSONAS_LIST.forEach(p => {
                        const item = document.createElement("button");
                        item.type = "button";
                        const isActive = !selectedGemPromptId && p.id === selectedGemPersona;
                        item.className = `bada-gem-picker-item persona ${isActive ? "active" : ""}`;
                        item.textContent = isKoNow ? p.name : (p.name_en || p.name);
                        item.onclick = () => applyGemPromptSelection({ personaId: p.id });
                        personaGroup.appendChild(item);
                    });
                    personaMenu.appendChild(personaGroup);

                    // 2) 제미나이 탭 전용 사용자 시스템 프롬프트
                    const userGroup = document.createElement("div");
                    userGroup.className = "bada-gem-picker-group";
                    const userHead = document.createElement("div");
                    userHead.className = "bada-gem-picker-group-title";
                    userHead.textContent = isKoNow
                        ? "📜 제미나이 전용 시스템 프롬프트"
                        : "📜 Gemini-only System Prompts";
                    userGroup.appendChild(userHead);

                    if (!gemChatPrompts.length) {
                        const empty = document.createElement("div");
                        empty.className = "bada-gem-picker-empty";
                        empty.textContent = gemChatPromptsLoaded
                            ? (isKoNow
                                ? "등록된 프롬프트가 없습니다. 「⚙️ 프롬프트 관리」로 추가하세요."
                                : "No prompts yet. Use “⚙️ Manage Prompts” to add one.")
                            : (isKoNow ? "불러오는 중..." : "Loading...");
                        userGroup.appendChild(empty);
                    } else {
                        gemChatPrompts.forEach(prompt => {
                            const key = String(prompt.id);
                            const isActive = selectedGemPromptId === key;
                            const item = document.createElement("button");
                            item.type = "button";
                            item.className = `bada-gem-picker-item custom ${isActive ? "active" : ""}`;
                            item.textContent = `📜 ${prompt.name || key}`;
                            if (prompt.description) item.title = prompt.description;
                            item.onclick = () => applyGemPromptSelection({ promptId: key });
                            userGroup.appendChild(item);
                        });
                    }
                    personaMenu.appendChild(userGroup);
                }

                personaTrigger.onclick = () => {
                    const willOpen = !personaMenu.classList.contains("open");
                    if (willOpen) renderPersonaMenu();
                    setPersonaMenuOpen(willOpen);
                };
                const onPersonaOutsidePointerDown = (e) => {
                    if (!personaMenu.classList.contains("open")) return;
                    if (!personaPicker.contains(e.target)) setPersonaMenuOpen(false);
                };
                // renderChatStudio() 는 탭 전환마다 다시 호출되므로 이전 리스너를 정리한다.
                chatPersonaCleanup?.();
                document.addEventListener("pointerdown", onPersonaOutsidePointerDown);
                chatPersonaCleanup = () => {
                    document.removeEventListener("pointerdown", onPersonaOutsidePointerDown);
                    chatPersonaCleanup = null;
                };

                personaTriggerLabel.textContent = activeGemPromptLabel();
                renderPersonaMenu();
                if (!gemChatPromptsLoaded && !gemChatPromptsLoadPromise) {
                    loadGemChatPrompts()
                        .then(() => {
                            personaTriggerLabel.textContent = activeGemPromptLabel();
                            renderPersonaMenu();
                        })
                        .catch((error) => {
                            console.warn("[BadaAsyncGemini] gemini chat prompts load failed:", error);
                        });
                }

                // Message Thread
                const thread = document.createElement("div");
                thread.className = "bada-chat-thread";
                chatStudioContainer.appendChild(thread);

                // Chat Input Bar
                const chatInputBar = document.createElement("div");
                chatInputBar.className = "bada-chat-input-bar bada-gemini-chat-inputbar";

                const chatFileInput = document.createElement("input");
                chatFileInput.type = "file";
                chatFileInput.multiple = true;
                chatFileInput.accept = "image/*";
                chatFileInput.style.display = "none";
                chatInputBar.appendChild(chatFileInput);

                const chatAttachBtn = document.createElement("button");
                chatAttachBtn.type = "button";
                chatAttachBtn.className = "bada-pill";
                chatAttachBtn.innerHTML = "🖼️";
                chatAttachBtn.title = isKo ? "이미지 첨부" : "Attach Image";
                chatAttachBtn.onclick = () => chatFileInput.click();
                chatInputBar.appendChild(chatAttachBtn);

                chatFileInput.addEventListener("change", () => {
                    Array.from(chatFileInput.files).forEach(f => {
                        const r = new FileReader();
                        r.onload = (ev) => {
                            chatUploadedImages.push(ev.target.result);
                            renderChatImagesPreview();
                        };
                        r.readAsDataURL(f);
                    });
                    chatFileInput.value = "";
                });

                const chatTextarea = document.createElement("textarea");
                chatTextarea.className = "bada-chat-textarea";
                chatTextarea.rows = 3;
                chatTextarea.placeholder = isKo 
                    ? "무검열 제미나이에게 메시지 보내기... (Enter로 전송, Shift+Enter 줄바꿈)"
                    : "Send message to Uncensored Gemini... (Enter to send, Shift+Enter for newline)";

                // Auto-grow composer: starts at 3 lines and grows upward as you type, up to
                // CHAT_TEXTAREA_MAX_LINES. Past that it stops growing and scrolls internally, so
                // a long message stays readable without the box swallowing the conversation.
                // `rows = 3` alone cannot do this — it only sets the *initial* height, and the
                // old CSS `max-height: 80px` capped growth at ~3 lines anyway, which is why the
                // composer looked stuck at a single line.
                const CHAT_TEXTAREA_MAX_LINES = 5;

                function autoGrowChatTextarea() {
                    if (!chatTextarea) return;
                    const computed = window.getComputedStyle(chatTextarea);
                    const lineHeight = parseFloat(computed.lineHeight)
                        || (parseFloat(computed.fontSize) || 12) * 1.5;
                    // Reset first: a textarea only reports the height it *needs* when it is
                    // allowed to shrink back to `auto`, otherwise scrollHeight stays pinned at
                    // the previous (taller) size and the box would never come back down.
                    chatTextarea.style.height = "auto";
                    const maxHeight = lineHeight * CHAT_TEXTAREA_MAX_LINES;
                    const contentHeight = chatTextarea.scrollHeight;
                    chatTextarea.style.height = Math.min(contentHeight, maxHeight) + "px";
                    chatTextarea.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
                }
                chatTextarea.addEventListener("input", autoGrowChatTextarea);

                chatTextarea.addEventListener("keydown", (e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendChatMessage();
                    }
                });
                chatInputBar.appendChild(chatTextarea);

                const chatSendBtn = document.createElement("button");
                chatSendBtn.type = "button";
                chatSendBtn.className = "bada-chat-send-btn";
                chatSendBtn.innerHTML = "🚀";
                chatSendBtn.onclick = () => sendChatMessage();
                chatInputBar.appendChild(chatSendBtn);

                // Paint the initial 3-line height once the bar is in the DOM. `rows = 3` is only
                // the pre-layout hint; measuring here is what actually reserves the space.
                setTimeout(() => autoGrowChatTextarea(), 0);

                // Chat Attach Preview Row
                const chatImagesPreviewRow = document.createElement("div");
                chatImagesPreviewRow.className = "bada-thumbnails-grid";
                chatImagesPreviewRow.style.display = "none";
                chatStudioContainer.appendChild(chatImagesPreviewRow);

                function renderChatImagesPreview() {
                    chatImagesPreviewRow.innerHTML = "";
                    if (chatUploadedImages.length === 0) {
                        chatImagesPreviewRow.style.display = "none";
                        return;
                    }
                    chatImagesPreviewRow.style.display = "grid";
                    chatUploadedImages.forEach((img, idx) => {
                        const item = document.createElement("div");
                        item.className = "bada-thumbnail-item";
                        item.innerHTML = `
                            <img class="bada-thumbnail-img" src="${img}" />
                            <button type="button" class="bada-thumbnail-del">×</button>
                        `;
                        item.querySelector(".bada-thumbnail-del").onclick = () => {
                            chatUploadedImages.splice(idx, 1);
                            renderChatImagesPreview();
                        };
                        chatImagesPreviewRow.appendChild(item);
                    });
                }

                chatStudioContainer.appendChild(chatInputBar);

                function renderChatMessages() {
                    thread.innerHTML = "";
                    if (chatMessages.length === 0) {
                        const isKoNow = (typeof BadaI18n !== "undefined" && BadaI18n.lang === "ko");
                        const emptyState = document.createElement("div");
                        emptyState.className = "bada-chat-empty-state";
                        emptyState.style.cssText = "display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; min-height: 180px; text-align: center; color: var(--bada-text-dim); padding: 24px 16px; user-select: none;";
                        emptyState.innerHTML = `
                            <div style="font-size: 28px; margin-bottom: 8px;">🔞</div>
                            <div style="font-size: 13px; font-weight: 700; color: var(--bada-text-main); margin-bottom: 4px;">${isKoNow ? "🔞 무검열 제미나이 자유 대화" : "🔞 Uncensored Gemini Studio"}</div>
                            <div style="font-size: 11px; line-height: 1.5; max-width: 260px; color: var(--bada-text-muted);">${isKoNow ? "질문을 입력하거나 이미지를 첨부(Ctrl+V)하여 대화 및 프롬프트 기획을 시작하세요." : "Type a prompt or attach images (Ctrl+V) to start planning."}</div>
                        `;
                        thread.appendChild(emptyState);
                        return;
                    }

                    chatMessages.forEach(msg => {
                        const row = document.createElement("div");
                        row.className = `bada-msg-row ${msg.role}`;

                        const bubble = document.createElement("div");
                        bubble.className = `bada-msg-bubble ${msg.role}`;

                        if (msg.images && msg.images.length > 0) {
                            const imgWrap = document.createElement("div");
                            imgWrap.className = "bada-msg-images";
                            msg.images.forEach(im => {
                                const th = document.createElement("img");
                                th.className = "bada-msg-thumb";
                                th.src = im;
                                imgWrap.appendChild(th);
                            });
                            bubble.appendChild(imgWrap);
                        }

                        const textContent = document.createElement("div");
                        textContent.style.whiteSpace = "pre-wrap";
                        textContent.textContent = msg.text;
                        bubble.appendChild(textContent);

                        // If model message, add Copy & Send to CLIP actions + Duration tag
                        if (msg.role === "model") {
                            const actRow = document.createElement("div");
                            actRow.className = "bada-msg-actions";
                            actRow.style.display = "flex";
                            actRow.style.alignItems = "center";
                            actRow.style.gap = "6px";

                            const isKoNow = (typeof BadaI18n !== "undefined" && BadaI18n.lang === "ko");
                            const copyMBtn = document.createElement("button");
                            copyMBtn.type = "button";
                            copyMBtn.className = "bada-btn-msg-act";
                            copyMBtn.innerHTML = isKoNow ? "📋 복사" : "📋 Copy";
                            copyMBtn.onclick = async () => {
                                await navigator.clipboard.writeText(msg.text);
                                showToast(isKoNow ? "답변 텍스트가 복사되었습니다! 📋" : "Reply copied to clipboard! 📋", "success", 1500);
                            };

                            const clipMBtn = document.createElement("button");
                            clipMBtn.type = "button";
                            clipMBtn.className = "bada-btn-msg-act";
                            clipMBtn.innerHTML = isKoNow ? "➡️ CLIP 전송" : "➡️ Send to CLIP";
                            clipMBtn.onclick = () => {
                                sendTextToActiveClip(msg.text);
                            };

                            actRow.appendChild(copyMBtn);
                            actRow.appendChild(clipMBtn);

                            if (msg.duration) {
                                const durSpan = document.createElement("span");
                                durSpan.style.cssText = "font-size: 10.5px; color: var(--bada-text-dim); margin-left: auto; font-family: monospace; font-weight: 600;";
                                durSpan.textContent = `⏱️ ${msg.duration}${isKoNow ? "초 완료" : "s done"}`;
                                actRow.appendChild(durSpan);
                            }

                            bubble.appendChild(actRow);
                        }

                        row.appendChild(bubble);
                        thread.appendChild(row);
                    });

                    thread.scrollTop = thread.scrollHeight;
                }

                async function sendChatMessage() {
                    if (isChatSending) {
                        if (chatAbortController) {
                            chatAbortController.abort();
                        }
                        return;
                    }

                    const text = chatTextarea.value.trim();
                    if (!text && chatUploadedImages.length === 0) return;

                    const key = apiKeyInput.value.trim();
                    const model = modelSelect.value;

                    // Add user message
                    const userMsg = {
                        role: "user",
                        text: text,
                        images: [...chatUploadedImages]
                    };
                    chatMessages.push(userMsg);
                    chatTextarea.value = "";
                    // Reset the composer to its 3-line rest height — otherwise the box stays
                    // tall at its previous size until the next keystroke re-measures it.
                    autoGrowChatTextarea();
                    chatUploadedImages = [];
                    renderChatImagesPreview();
                    renderChatMessages();

                    isChatSending = true;
                    chatAbortController = new AbortController();

                    chatSendBtn.disabled = false;
                    chatSendBtn.className = "bada-chat-send-btn bada-stop-state";
                    chatSendBtn.innerHTML = "⏹️";
                    chatSendBtn.title = isKo ? "채팅 응답 생성 중단" : "Stop generation";

                    const chatStartTime = Date.now();
                    const isKoNow = (typeof BadaI18n !== "undefined" && BadaI18n.lang === "ko");
                    const chatWorkingText = isKoNow ? "작업 중..." : "Working...";

                    // Add typing status bubble to thread with Stop button
                    const typingRow = document.createElement("div");
                    typingRow.className = "bada-msg-row model bada-msg-typing";
                    typingRow.innerHTML = `
                        <div class="bada-msg-bubble model" style="display:flex; align-items:center; gap:8px; padding: 8px 12px; background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.3);">
                            <span class="bada-spinner"></span>
                            <span style="font-size: 12px; font-weight: 600; color: #a5b4fc;">${chatWorkingText}</span>
                            <span class="bada-typing-timer" style="font-size: 11px; font-weight: 700; color: #38bdf8;">⏱️ 0.0s</span>
                            <button type="button" class="bada-typing-stop-btn" id="bada-chat-bubble-stop">⏹️ ${isKoNow ? "중단" : "Stop"}</button>
                        </div>
                    `;
                    const bubbleStop = typingRow.querySelector("#bada-chat-bubble-stop");
                    if (bubbleStop) {
                        bubbleStop.onclick = (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (chatAbortController) chatAbortController.abort();
                        };
                    }
                    thread.appendChild(typingRow);
                    thread.scrollTop = thread.scrollHeight;

                    const chatTimerInterval = setInterval(() => {
                        const elapsed = ((Date.now() - chatStartTime) / 1000).toFixed(1);
                        const timerEl = typingRow.querySelector(".bada-typing-timer");
                        if (timerEl) timerEl.textContent = `⏱️ ${elapsed}s`;
                    }, 100);

                    try {
                        const resp = await fetch("/api/bada/gemini/chat", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                api_key: key,
                                model: model,
                                persona: selectedGemPersona,
                                system_prompt_id: selectedGemPromptId,
                                messages: chatMessages
                            }),
                            signal: chatAbortController.signal
                        });

                        const data = await resp.json();
                        const duration = ((Date.now() - chatStartTime) / 1000).toFixed(1);
                        clearInterval(chatTimerInterval);
                        if (typingRow.parentNode) typingRow.remove();

                        if (data.success && data.reply) {
                            chatMessages.push({
                                role: "model",
                                text: data.reply,
                                duration: duration
                            });
                            renderChatMessages();
                        // No completion toast here on purpose: `.bada-toast` is a block
                        // child of the card's flex column, so it inserted a full-width
                        // banner above the API-key row and pushed the panel down. The
                        // reply bubble already renders "⏱️ N.N초 완료" inline.
                        } else {
                            const errDesc = data.error || (isKoNow ? '응답 실패' : 'No response');
                            showToast((isKoNow ? "❌ 채팅 오류: " : "❌ Chat error: ") + errDesc, "error", 4000);
                            addErrorLog(isKoNow ? "무검열 제미나이 채팅" : "Gemini Chat", errDesc);
                        }
                    } catch (err) {
                        clearInterval(chatTimerInterval);
                        if (typingRow.parentNode) typingRow.remove();
                        if (err.name === "AbortError") {
                            showToast(isKoNow ? "⏹️ 채팅 생성이 사용자에 의해 중단되었습니다." : "⏹️ Chat response cancelled by user.", "info", 3000);
                        } else {
                            const errDesc = err.message || "Network error";
                            showToast((isKoNow ? "❌ 네트워크 오류: " : "❌ Network error: ") + errDesc, "error", 4000);
                            addErrorLog(isKoNow ? "무검열 제미나이 채팅" : "Gemini Chat", errDesc);
                        }
                    } finally {
                        clearInterval(chatTimerInterval);
                        isChatSending = false;
                        chatAbortController = null;
                        chatSendBtn.disabled = false;
                        chatSendBtn.className = "bada-chat-send-btn";
                        chatSendBtn.innerHTML = "🚀";
                        chatSendBtn.title = isKoNow ? "메시지 보내기" : "Send message";
                    }
                }

                renderChatMessages();
            }

            // Global Ctrl+V listener for images
            const onGlobalPaste = (e) => {
                if (!node.is_selected && !root.matches(":hover")) return;
                const items = e.clipboardData?.items;
                if (!items) return;

                let imageFound = false;
                const pasteFiles = [];
                for (let item of items) {
                    if (item.type.startsWith("image/")) {
                        const blob = item.getAsFile();
                        if (blob) { imageFound = true; pasteFiles.push(blob); }
                    }
                }
                if (imageFound) {
                    e.preventDefault();
                    // 붙여넣기도 첨부 경로와 동일한 축소/장수 제한을 탄다.
                    handleFiles(pasteFiles).then(() => {
                        showToast(isKo ? "📸 클립보드 이미지 첨부 완료!" : "📸 Clipboard image attached!", "success", 2000);
                    });
                }
            };

            // Dynamic live bilingual updater when BadaUtils.Language changes
            function updateAllStaticLabels() {
                isKo = (typeof BadaI18n !== "undefined" && BadaI18n.lang === "ko");

                // Options row (slim toggles + aspect ratio picker)
                const nsfwTitle = optionsGrid.querySelector("#bada-toggle-nsfw .bada-toggle-title");
                if (nsfwTitle) nsfwTitle.textContent = isKo ? "성인용 콘텐츠 (NSFW)" : "Allow NSFW";
                nsfwToggle.setAttribute("aria-label", isKo ? "성인용 콘텐츠 허용 (NSFW)" : "Allow NSFW Content");
                nsfwToggle.title = isKo ? "관능적/친밀한 장면 무검열 묘사" : "Uncensored sensual & intimate scenes";

                const transTitle = optionsGrid.querySelector("#bada-toggle-trans .bada-toggle-title");
                if (transTitle) transTitle.textContent = isKo ? "한국어 번역" : "Korean Translation";
                transToggle.setAttribute("aria-label", isKo ? "한국어 번역 및 해설" : "Korean Translation & Notes");
                transToggle.title = isKo ? "영문 프롬프트와 연출 해설 분할" : "Separate English prompt and director notes";

                // Aspect ratio picker labels + chips (rebuild for the active language)
                syncAspectPicker();

                // Config section
                const cfgTitle = configSection.querySelector(".bada-config-title-text");
                if (cfgTitle) cfgTitle.textContent = isKo ? "🔑 API Key & 우선순위 모델 선택" : "🔑 API Key & Priority Model";

                const curGetKeyBtn = configSection.querySelector("#bada-btn-get-key");
                const curTestKeyBtn = configSection.querySelector("#bada-btn-test-key");
                if (curGetKeyBtn) {
                    const textSpan = curGetKeyBtn.querySelector(".bada-action-text");
                    if (textSpan) textSpan.textContent = isKo ? "발급" : "Get Key";
                    curGetKeyBtn.title = isKo ? "Google AI Studio API 키 발급 페이지 열기" : "Open Google AI Studio API Key page";
                }
                if (curTestKeyBtn && curTestKeyBtn.dataset.busy !== "true") {
                    const textSpan = curTestKeyBtn.querySelector(".bada-action-text");
                    if (textSpan) textSpan.textContent = isKo ? "연결확인" : "Check";
                    curTestKeyBtn.title = isKo ? "Gemini API 연결 및 키 유효성 테스트" : "Test Gemini API connection and key validity";
                }

                // Model select options
                const currentModelVal = modelSelect.value;
                modelSelect.innerHTML = "";
                EXACT_MODELS.forEach(m => {
                    const opt = document.createElement("option");
                    opt.value = m.id;
                    opt.textContent = isKo ? m.name : (m.name_en || m.name);
                    modelSelect.appendChild(opt);
                });
                modelSelect.value = currentModelVal;

                // Dropzone & Image hints
                const imgLabel = imgLabelRow.querySelector("#bada-img-label");
                if (imgLabel) imgLabel.textContent = isKo ? "🖼️ 참고 이미지 (멀티모달 비전)" : "🖼️ Reference Images (Multimodal Vision)";
                const dropText = dropzone.querySelector("#bada-drop-text");
                if (dropText) dropText.innerHTML = isKo ? "드래그하거나 <b>Ctrl+V</b>로 이미지 붙여넣기" : "Drag images or paste with <b>Ctrl+V</b>";
                const dropSub = dropzone.querySelector("#bada-drop-subtext");
                if (dropSub) dropSub.textContent = isKo ? "PNG, JPG, WEBP 지원" : "PNG, JPG, WEBP supported";
                const thumbHint = thumbActions.querySelector("#bada-thumb-hint");
                if (thumbHint) thumbHint.textContent = isKo ? "이미지 클릭/호버하여 삭제" : "Click / hover image to delete";
                const clearAllBtn = thumbActions.querySelector("#bada-clear-all");
                if (clearAllBtn) clearAllBtn.textContent = isKo ? "🗑️ 전체 삭제" : "🗑️ Clear All";

                // Clipboard button label follows the active tab
                refreshCopyButton();
                outputTextarea.placeholder = isKo ? "생성된 프롬프트가 여기에 표시됩니다. 자유롭게 직접 수정할 수도 있습니다." : "Generated prompt will appear here. You can also edit it directly.";

                // Output section header & tabs
                const outputTitle = outputSection.querySelector("#bada-output-title");
                if (outputTitle) outputTitle.textContent = isKo ? "✨ 생성된 프롬프트 결과" : "✨ Generated Output";
                tabEng.textContent = isKo ? "🇺🇸 영문 마스터" : "🔤 English Master";
                tabKor.textContent = isKo ? "🇰🇷 한국어 번역" : "🇰🇷 Korean Translation";
                tabAll.textContent = isKo ? "📜 통합본" : "📜 Combined";

                // Character counter
                const charCounter = promptSection.querySelector("#bada-char-counter");
                if (charCounter) {
                    charCounter.textContent = isKo ? `${instructionTextarea.value.length}자` : `${instructionTextarea.value.length} chars`;
                }

                // Error modal & bell labels
                const errTitleEl = errorModalOverlay.querySelector("#bada-err-title");
                const errClearBtnEl = errorModalOverlay.querySelector("#bada-err-clear-btn");
                const errCloseBtnEl = errorModalOverlay.querySelector("#bada-err-close-btn");
                const errorBellBtnEl = root.querySelector("#bada-error-bell");
                if (errTitleEl) errTitleEl.textContent = isKo ? "오류 알림 내역" : "Error Notification Log";
                if (errClearBtnEl) errClearBtnEl.textContent = isKo ? "🗑️ 비우기" : "🗑️ Clear";
                if (errCloseBtnEl) errCloseBtnEl.title = isKo ? "닫기" : "Close";
                if (errorBellBtnEl) errorBellBtnEl.title = isKo ? "오류 알림 내역" : "Error Notifications";

                // Gemini chat topbar (페르소나/프롬프트 드롭다운 · 프롬프트 관리 · 새 채팅)
                const gemManageBtn = chatStudioContainer.querySelector(".bada-gem-prompt-manage");
                if (gemManageBtn) {
                    gemManageBtn.textContent = isKo ? "⚙️ 프롬프트 관리" : "⚙️ Manage Prompts";
                    gemManageBtn.title = isKo
                        ? "제미나이 탭 전용 시스템 프롬프트 작성 · 수정 · 삭제 · 순서 이동"
                        : "Create / edit / delete / reorder Gemini-only system prompts";
                }
                const gemNewChatBtn = chatStudioContainer.querySelector(".bada-gem-new-chat");
                if (gemNewChatBtn) gemNewChatBtn.innerHTML = isKo ? "✏️ 새 채팅" : "✏️ New Chat";
                const gemTriggerLabel = chatStudioContainer.querySelector(".bada-gem-picker-label");
                if (gemTriggerLabel) {
                    const persona = GEM_PERSONAS_LIST.find(p => p.id === selectedGemPersona) || GEM_PERSONAS_LIST[0];
                    const picked = selectedGemPromptId
                        ? gemChatPrompts.find(p => String(p.id) === selectedGemPromptId)
                        : null;
                    gemTriggerLabel.textContent = picked
                        ? `📜 ${picked.name || picked.id}`
                        : (isKo ? persona.name : (persona.name_en || persona.name));
                }

                renderEngineNav();
                renderEngineView();
                app.graph?.setDirtyCanvas?.(true, true);
            }

            const langSubscription = () => {
                updateAllStaticLabels();
                // label lengths differ per language -> re-fit the output box and the frame height
                scheduleOutputRefit(60);
            };
            BadaI18n.subscribe(langSubscription);

            // Initial call to ensure all static labels match current Bada language
            updateAllStaticLabels();

            // ─────────────────────────────────────────────────────────────
            // LAYOUT ENGINE  (방안 A: Pure Flex Chain & 매 프레임 onDrawForeground에서 직접 동기화)
            // ─────────────────────────────────────────────────────────────
            function hideAllBackendWidgets(n) {
                if (!n || !n.widgets) return;
                for (const w of n.widgets) {
                    if (w.name !== "bada_gemini_ui") {
                        w.hidden = true;
                        w.type = "hidden";
                        if (w.computeSize) w.computeSize = () => [0, -4];
                    }
                }
            }

            // The output box no longer has a manual resize grip: it is resized to fit exactly the
            // text it currently shows, and the node frame follows it (grow AND shrink).
            let outputRefitTimer = null;
            function scheduleOutputRefit(delay = 0) {
                if (outputRefitTimer) clearTimeout(outputRefitTimer);
                outputRefitTimer = setTimeout(() => {
                    outputRefitTimer = null;
                    autoFitOutputTextarea();
                }, delay);
            }
            function autoFitOutputTextarea() {
                if (!outputTextarea) return;
                if (outputTextarea.style.display === "none") {
                    setTimeout(fitToContent, 0);
                    return;
                }
                // 1) size the box to its content, 2) let the node frame follow it
                outputTextarea.style.height = "auto";
                outputTextarea.style.height = Math.max(64, outputTextarea.scrollHeight + 2) + "px";
                setTimeout(fitToContent, 0);
            }

            function syncContainerSize() {
                if (!root || !node || !node.size) return;

                const w = Math.max(400, node.size[0] - 20);
                const h = Math.max(380, node.size[1] - 46);

                // onDrawForeground 에서 매 프레임 호출되므로, 값이 실제로 바뀔 때만
                // style 을 쓴다. (매 프레임 style 쓰기는 reflow 를 유발해 캔버스 조작이
                //  "끌리는" 원인이었다 — 노드가 순간적으로 작아 보이는 진짜 이유.)
                if (root.__badaW !== w) {
                    root.__badaW = w;
                    root.style.width = w + "px";
                    root.style.maxWidth = w + "px";
                }
                if (root.__badaH !== h) {
                    root.__badaH = h;
                    root.style.height = h + "px";
                    root.style.maxHeight = h + "px";
                    root.style.overflow = "hidden";
                }

                root.classList.toggle("bada-compact-width", w < 380);
                root.classList.toggle("bada-ultra-compact", w < 340);
            }

            const NODE_MIN_HEIGHT = 420;
            const NODE_MAX_HEIGHT = 1600;

            // setSize() 로 인한 내부 리사이즈와 사용자 드래그를 구분하기 위한 플래그.
            let isInternalResize = false;
            function setSizeInternal(w, h) {
                isInternalResize = true;
                try { node.setSize([w, h]); } finally { isInternalResize = false; }
            }

            // 사용자가 마우스로 직접 리사이즈한 높이 (0 = 아직 리사이즈 안 함)
            // setSize()는 onResize()를 호출하지 않으므로 onResize에서만 기록됨.
            // 이 높이는 절대 줄이지 않으며, 자동 조정은 grow만 수행한다.
            const USER_HEIGHT_KEY = "bada_async_gemini_user_height";
            let userPreferredHeight = 0;
            let isUserResizing = false;
            let resizeEndTimer = null;
            try {
                const saved = parseInt(localStorage.getItem(USER_HEIGHT_KEY) || "0", 10);
                if (Number.isFinite(saved) && saved >= NODE_MIN_HEIGHT) userPreferredHeight = saved;
            } catch (e) { /* localStorage 사용 불가 환경 */ }

            function fitToContent() {
                if (!root || !node || !node.size) return;
                syncContainerSize();
                const area = root.querySelector(".bada-prompt-studio-container");
                if (!area) return;

                // 사용자가 직접 리사이즈 중이거나, 명시적으로 지정한 높이가 있으면 존중한다.
                if (isUserResizing || userPreferredHeight > 0) return;

                // The uncensored (제미나이) chat tab hides the prompt-studio container, so its
                // measurements are 0 x 0 and any auto-resize would collapse the node down to the
                // minimum. That view keeps the height the user set by hand instead.
                if (activeEngine === "uncensored") return;

                // 1) Grow the node until the inner content fits.
                //    Never shrinks — a taller frame is harmless (the panel scrolls), a
                //    shorter one is not, so growing is the only safe auto-adjustment.
                let overflow = area.scrollHeight - area.clientHeight;
                let steps = 0;
                while (overflow > 1 && steps < 5 && node.size[1] < NODE_MAX_HEIGHT) {
                    steps += 1;
                    setSizeInternal(node.size[0],
                                    Math.min(NODE_MAX_HEIGHT, node.size[1] + overflow + 8));
                    syncContainerSize();
                    overflow = area.scrollHeight - area.clientHeight;
                }

                if (steps && appInstance && appInstance.canvas) appInstance.canvas.setDirty(true, true);
            }

            window.addEventListener("paste", onGlobalPaste);
            const onVisChange = () => { syncContainerSize(); };
            window.addEventListener("visibilitychange", onVisChange);
            window.addEventListener("focus", onVisChange);

            const onRemoved = node.onRemoved;
            node.onRemoved = function () {
                window.removeEventListener("paste", onGlobalPaste);
                document.removeEventListener("pointerdown", onAspectOutsidePointerDown);
                window.removeEventListener("resize", onAspectViewportChange);
                window.removeEventListener("scroll", onAspectViewportChange, true);
                // The aspect menu can be re-parented to <body> while open; make sure it
                // never survives the node that owns it.
                if (aspectMenu && aspectMenu.parentNode === document.body) aspectMenu.remove();
                chatPersonaCleanup?.();
                window.removeEventListener("visibilitychange", onVisChange);
                window.removeEventListener("focus", onVisChange);
                if (timerInterval) clearInterval(timerInterval);
                if (resizeEndTimer) clearTimeout(resizeEndTimer);
                if (outputRefitTimer) clearTimeout(outputRefitTimer);
                BadaI18n.unsubscribe(langSubscription);
                onRemoved?.apply(this, arguments);
            };

            // Initialize views
            renderEngineView();

            // Mount DOM Widget — Regional Prompt 방식: 심플하게 두 옵션만
            const domWidget = node.addDOMWidget("bada_gemini_ui", "custom", root, {
                serialize: false,
                hideOnZoom: false,
            });

            // Minimum size boundary (Regional Prompt 방식과 동일).
            // 크기를 강제로 되돌리지 않는다 — 하한만 보장한다. (여기가 노드를 강제로
            // 420x420으로 만들어 "창이 갑자기 줄어드는" 경험의 또 다른 원인이었다.)
            node.computeSize = function (out) {
                out = out || [0, 0];
                out[0] = Math.max(out[0] || 0, 420);
                out[1] = Math.max(out[1] || 0, NODE_MIN_HEIGHT);
                return out;
            };

            const origResize = node.onResize;
            node.onResize = function (size) {
                if (size[0] < 420) size[0] = 420;
                if (size[1] < 420) size[1] = 420;
                origResize?.apply(this, arguments);

                // onResize 는 사용자가 마우스로 노드를 드래그할 때만 호출된다
                // (setSize() 는 이 훅을 건드리지 않는다). 그래서 이 값을
                // "사용자가 원하는 높이"로 간주해 자동 축소를 영구히 멈춘다.
                if (!isInternalResize) {
                    isUserResizing = true;
                    if (resizeEndTimer) clearTimeout(resizeEndTimer);
                    resizeEndTimer = setTimeout(() => { isUserResizing = false; }, 220);
                    userPreferredHeight = this.size[1];
                    try { localStorage.setItem(USER_HEIGHT_KEY, String(userPreferredHeight)); } catch (e) { /* private mode */ }
                }

                syncContainerSize();
                // a width change re-wraps the text -> re-fit the output box afterwards
                scheduleOutputRefit(120);
            };

            const origConfigure = node.onConfigure;
            node.onConfigure = function (data) {
                const r = origConfigure ? origConfigure.apply(this, arguments) : undefined;
                // Must ALSO be stripped here, not only in onNodeCreated. LiteGraph's
                // configure() restores the serialized `outputs` array *after* the node is
                // constructed, so any workflow saved while the socket still existed brought
                // the "prompt" output straight back on load — surviving a plain refresh and
                // making the node look connectable when it is UI-only.
                while (this.outputs && this.outputs.length > 0) {
                    this.removeOutput(0);
                }
                hideAllBackendWidgets(this);
                if (this.size && this.size[0] < 420) this.size[0] = 520;
                if (this.size && this.size[1] < 420) this.size[1] = 780;
                // 사용자가 직접 정한 높이가 있으면 워크플로우에 저장된 값보다 우선한다.
                // (다른 노드가 실행되며 그래프가 리로드될 때 이 노드가 "확 줄어드는" 원인 제거)
                if (userPreferredHeight > 0 && this.size && this.size[1] !== userPreferredHeight) {
                    this.size[1] = userPreferredHeight;
                }
                setTimeout(() => {
                    hideAllBackendWidgets(this);
                    fitToContent();
                    if (appInstance && appInstance.canvas) appInstance.canvas.setDirty(true, true);
                }, 50);
                return r;
            };

            const origRemoved = node.onRemoved;
            node.onRemoved = function () {
                BadaI18n.unsubscribe(langSubscription);
                origRemoved?.apply(this, arguments);
            };

            // onDrawForeground: Regional Prompt 방식 그대로 — 매 프레임 직접 호출, throttle 없음
            const origDrawFg = node.onDrawForeground;
            node.onDrawForeground = function (ctx) {
                hideAllBackendWidgets(this);
                syncContainerSize();
                origDrawFg?.apply(this, arguments);
            };

            // 초기 크기 설정 — 사용자가 지정한 높이가 있으면 그 값을 최우선으로 복원한다.
            const initialHeight = userPreferredHeight > 0 ? userPreferredHeight : 820;
            if (!node.size || node.size[0] < 420 || node.size[1] < 520) {
                setSizeInternal(520, initialHeight);
            } else if (userPreferredHeight > 0 && node.size[1] !== userPreferredHeight) {
                setSizeInternal(node.size[0], userPreferredHeight);
            }
            syncContainerSize();
            // first honest measurement once the panel is in the DOM
            setTimeout(fitToContent, 0);
            setTimeout(fitToContent, 350);
            if (appInstance && appInstance.canvas) appInstance.canvas.setDirty(true, true);
        };
    }
});

