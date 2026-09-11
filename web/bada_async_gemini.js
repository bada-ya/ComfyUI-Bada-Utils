/**
 * ⚓ Bada Async Gemini Studio
 * ComfyUI Web Extension (4-Engine Multi-Mode Edition)
 * - Exact 7 Models: 3.6 Flash, 3.1 Flash-Lite, 3.8 Flash, 3.7 Flash, Flash Latest, 3.1 Pro, Pro Latest
 * - 4 Dedicated Engine Tabs:
 *    1. ● MiniMax H3 (5 submodes, duration slider, multimodal vision)
 *    2. ● LTX-Video (5 submodes, duration slider, 6-element DiT)
 *    3. ● KREA 2 (3 submodes: 일반/스타일칩, 시스템프롬프트/지침카드, 스토리보드/컷슬라이더 & 카드뷰)
 *    4. ✨ 무검열 제미나이 (Google AI Studio식 무검열 인터랙티브 챗 & 4대 Gem 페르소나, 실시간 웹검색 그라운딩)
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
    { id: "gemini-3.6-flash", name: "⚡ 3.6 Flash (권장 ⭐)", name_en: "⚡ 3.6 Flash (Recommended ⭐)", desc: "1,500회/일 • 올라운더/NSFW 1차 통과", desc_en: "1,500 RPD • All-rounder / Uncensored pass" },
    { id: "gemini-3.1-flash-lite", name: "🚀 3.1 Flash-Lite", name_en: "🚀 3.1 Flash-Lite", desc: "1,500회/일 • 초고속 영작/실시간 챗", desc_en: "1,500 RPD • Fast English / Live Chat" },
    { id: "gemini-flash-latest", name: "🌟 Flash Latest", name_en: "🌟 Flash Latest", desc: "1,500회/일 • 최신 Flash 자동 라우팅", desc_en: "1,500 RPD • Latest Flash Auto-routing" },
    { id: "gemini-3.8-flash", name: "⚡ 3.8 Flash (프리뷰)", name_en: "⚡ 3.8 Flash (Preview)", desc: "20회/일 • 최신 기능 사전 체험", desc_en: "20 RPD • Preview Latest Features" },
    { id: "gemini-3.7-flash", name: "⚡ 3.7 Flash", name_en: "⚡ 3.7 Flash", desc: "1,500회/일 • 안정적 표준 작업", desc_en: "1,500 RPD • Reliable Standard Output" },
    { id: "gemini-3.1-pro-preview", name: "🧠 3.1 Pro", name_en: "🧠 3.1 Pro", desc: "50회/일 • 고난도 시나리오 & 기획", desc_en: "50 RPD • Complex Reasoning & Planning" },
    { id: "gemini-pro-latest", name: "🧠 Pro Latest", name_en: "🧠 Pro Latest", desc: "50회/일 • 최신 Pro 심층 추론", desc_en: "50 RPD • Deepest Multimodal Reasoning" },
];

// 4 Engine Tabs Specification
const ENGINES = [
    { id: "minimax", name: "● MiniMax H3", name_en: "● MiniMax H3", tag: "Omni-Modal Video", tag_en: "Omni-Modal Video", color: "#6366f1" },
    { id: "ltx", name: "● LTX-Video", name_en: "● LTX-Video", tag: "6-Element DiT", tag_en: "6-Element DiT", color: "#06b6d4" },
    { id: "krea", name: "● KREA 2", name_en: "● KREA 2", tag: "Photorealism", tag_en: "Photorealism", color: "#10b981" },
    { id: "uncensored", name: "🔞 제미나이", name_en: "🔞 Gemini", tag: "Zero-Refusal Uncensored Chat", tag_en: "Zero-Refusal Uncensored Chat", color: "#a855f7" },
];

// MiniMax H3 Submodes
const MINIMAX_SUBMODES = [
    { id: "ref2va", name: "Ref2VA", tag: "전체 참조", tag_en: "Full Ref", icon: "🎬", desc: "인물/의상/사물/동작/사운드 통합 연출", desc_en: "Character, attire, motion & audio direction" },
    { id: "t2va", name: "T2VA", tag: "텍스트", tag_en: "Text", icon: "⚡", desc: "텍스트 프롬프트 기반 24fps 비디오+오디오 생성", desc_en: "24fps video + audio from text prompt" },
    { id: "i2va", name: "I2VA", tag: "첫 프레임", tag_en: "First Frame", icon: "🖼️", desc: "첫 이미지로부터 유기적 물리 동작 전개", desc_en: "Organic motion expanding from first image" },
    { id: "fl2va", name: "FL2VA", tag: "첫-끝 루프", tag_en: "First-Last Loop", icon: "🔄", desc: "시작 프레임과 끝 프레임을 잇는 시퀀스", desc_en: "Seamless transition between start & end frames" },
    { id: "l2va", name: "L2VA", tag: "끝 착륙", tag_en: "End Target", icon: "🎯", desc: "지정된 마지막 프레임 이미지로 역산 수렴", desc_en: "Reverse motion converging to final frame" },
];

// LTX-Video Submodes
const LTX_SUBMODES = [
    { id: "ltx_2_5", name: "LTX 2.5", tag: "6요소 DiT", tag_en: "6-Element DiT", icon: "⚡", desc: "샷, 조명, 액션, 인물, 카메라, 사운드 6대 요소 결합", desc_en: "Shot, light, action, character, camera, sound" },
    { id: "ltx_t2v", name: "LTX T2V", tag: "텍스트 모션", tag_en: "Text Motion", icon: "📝", desc: "텍스트 서술 기반 24fps 시네마틱 프롬프트", desc_en: "Text-driven 24fps cinematic motion prompt" },
    { id: "ltx_i2v", name: "LTX I2V", tag: "첫 프레임", tag_en: "First Frame", icon: "🖼️", desc: "첫 프레임 이미지 기반 모션 역동성 확장", desc_en: "Dynamic motion extension from initial frame" },
    { id: "voice_audio", name: "Voice & Audio", tag: "대사/음향", tag_en: "Voice & Audio", icon: "🗣️", desc: "캐릭터 음성 대사 및 배경 앰비언스 사운드 동기화", desc_en: "Dialogue synchronization & atmospheric sound" },
    { id: "camera_master", name: "Camera Master", tag: "3D 카메라", tag_en: "3D Camera", icon: "🎥", desc: "35mm 아나모픽 렌즈, 슬로우 돌리 인/아웃, 3D 카메라 궤적", desc_en: "35mm anamorphic, dolly in/out, 3D camera trajectory" },
];

// KREA 2 Submodes & Presets
const KREA_SUBMODES = [
    { id: "general", name: "🌐 일반", name_en: "🌐 General", desc: "KREA 2 화풍 & 스타일 칩", desc_en: "KREA 2 art styles & style chips" },
    { id: "system_prompt", name: "📜 시스템 프롬프트", name_en: "📜 System Prompt", desc: "등록된 KREA 2 지침 적용", desc_en: "Apply registered KREA 2 directives" },
    { id: "storyboard", name: "🎞️ 스토리보드", name_en: "🎞️ Storyboard", desc: "연속 컷 시퀀스 분할 생성", desc_en: "Sequential cut storyboard prompts" },
];

const KREA_STYLES = [
    { id: "cinematic_photo", name: "35mm 필름", name_en: "35mm Film", icon: "🎬" },
    { id: "iphone_snapshot", name: "Raw 스냅샷", name_en: "Raw Snapshot", icon: "📱" },
    { id: "vintage_retro", name: "빈티지 레트로", name_en: "Vintage Retro", icon: "🎞️" },
    { id: "digital_art", name: "디지털 아트", name_en: "Digital Art", icon: "🎨" },
    { id: "3d_render", name: "3D 렌더링", name_en: "3D Render", icon: "🧊" },
    { id: "cyberpunk_anime", name: "사이버펑크", name_en: "Cyberpunk", icon: "🌆" },
];

const KREA_PRESETS = [
    { id: "krea_cinematic_photo", name: "시네마틱 35mm 영화 필름 (Anamorphic)", name_en: "Cinematic 35mm Film (Anamorphic)", desc: "35mm 아나모픽 렌즈, 코닥 포트라 400 필름 그레인, 볼류메트릭 림 라이팅, 헐리우드 영화 룩", desc_en: "35mm anamorphic lens, Kodak Portra 400 grain, volumetric rim lighting, Hollywood film aesthetic" },
    { id: "krea_raw_snapshot", name: "날것의 스마트폰 스냅샷 (Raw UGC)", name_en: "Authentic Smartphone Snapshot (Raw UGC)", desc: "iPhone 15 Pro 무보정 스냅샷, 직광 플래시, 자연스러운 피부 질감 및 리얼리즘", desc_en: "iPhone 15 Pro unretouched snapshot, direct flash, authentic skin texture & realism" },
    { id: "krea_surreal_3d", name: "초현실 판타지 & 컨셉 아트 (Octane 3D)", name_en: "Surreal Fantasy & Concept Art (Octane 3D)", desc: "언리얼 엔진 5 & 옥테인 3D 렌더링, 레이트레이싱 광원, 8k 하이퍼 디테일", desc_en: "Unreal Engine 5 & Octane 3D render, ray-traced lighting, 8k hyper-detail" },
    { id: "krea_vintage_polaroid", name: "빈티지 레트로 폴라로이드 (90s Analog)", name_en: "Vintage Retro Polaroid (90s Analog)", desc: "1990년대 폴라로이드 사진, 빛바랜 색감, 아날로그 그레인 및 따뜻한 감성", desc_en: "1990s Polaroid photo, faded colors, analog grain and nostalgic warmth" },
    { id: "krea_vogue_fashion", name: "하이엔드 패션 & 룩북 (Vogue Editorial)", name_en: "High-End Fashion & Lookbook (Vogue Editorial)", desc: "보그 매거진 화보, 스튜디오 스트로브 조명, 오뜨 꾸뛰르 의상 및 모델 포징", desc_en: "Vogue editorial photoshoot, studio strobe lights, haute couture attire & model poses" },
];

// Gem Personas for Uncensored Gemini Chat
const GEM_PERSONAS_LIST = [
    { id: "universal", name: "⚡ 만능 무검열 제미나이", name_en: "⚡ All-Round Uncensored Gemini" },
    { id: "cinematic_director", name: "🎬 시네마틱 프롬프트 디렉터", name_en: "🎬 Cinematic Prompt Director" },
    { id: "fashion_lookbook", name: "👗 하이패션 & 룩북 마스터", name_en: "👗 High-Fashion & Lookbook Master" },
    { id: "scenario_writer", name: "🧠 심층 기획 & 시나리오 작가", name_en: "🧠 Deep Scenario & Narrative Writer" },
];

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
            node.setSize([520, 820]);

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
            let activeEngine = localStorage.getItem("bada_active_engine") || "krea"; // minimax | ltx | krea | uncensored
            let minimaxSub = localStorage.getItem("bada_minimax_sub") || "ref2va";
            let ltxSub = localStorage.getItem("bada_ltx_sub") || "ltx_2_5";
            let kreaSub = localStorage.getItem("bada_krea_sub") || "general"; // general | system_prompt | storyboard
            let kreaStyle = localStorage.getItem("bada_krea_style") || "cinematic_photo";
            let kreaPresetId = localStorage.getItem("bada_krea_preset") || "krea_cinematic_photo";
            let storyboardCutCount = parseInt(localStorage.getItem("bada_storyboard_cuts") || "4", 10);
            let durationSec = parseInt(localStorage.getItem("bada_duration_sec") || "10", 10);

            let isNSFW = localStorage.getItem("bada_is_nsfw") !== "false";
            let isTranslate = localStorage.getItem("bada_is_translate") !== "false";
            let isKo = (typeof BadaI18n !== "undefined" && BadaI18n.lang === "ko");

            let uploadedImages = [];
            let isGenerating = false;
            let timerInterval = null;
            let lastEnglishPrompt = "";
            let lastKoreanTranslation = "";
            let lastStoryboardData = null;
            let currentTab = "english";

            // Chat State (Uncensored Gemini Tab)
            let selectedGemPersona = localStorage.getItem("bada_gem_persona") || "universal";
            let webSearchEnabled = localStorage.getItem("bada_web_search") === "true";
            let chatMessages = [];
            let chatUploadedImages = [];
            let isChatSending = false;
            let errorLogs = [];
            let unreadErrorCount = 0;
            let generateAbortController = null;
            let chatAbortController = null;

            // Root Card Container (방안 A: bada-async-gemini-root 병기)
            const root = document.createElement("div");
            root.className = "bada-gemini-card bada-async-gemini-root";

            // 1. Header
            const header = document.createElement("div");
            header.className = "bada-header bada-gemini-header";
            header.innerHTML = `
                <div class="bada-title">
                    <span>⚓</span>
                    <span>Bada Async Gemini Studio</span>
                </div>
                <div class="bada-badges-group">
                    <span class="bada-badge uncensored" title="5대 카테고리 BLOCK_NONE 및 3-Pass 제로 거부">🛡️ ZERO-REFUSAL</span>
                    <span class="bada-badge">NON-BLOCKING ⚡</span>
                    <button type="button" id="bada-error-bell" class="bada-bell-btn" title="${isKo ? "오류 알림 내역" : "Error Notification Log"}">
                        <span class="bada-bell-icon">🔔</span>
                        <span class="bada-bell-badge" id="bada-bell-badge" style="display: none;">0</span>
                    </button>
                </div>
            `;
            root.appendChild(header);

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
                unreadErrorCount++;
                updateBellBadge();
            }

            function updateBellBadge() {
                const bellBtn = header.querySelector("#bada-error-bell");
                const badgeEl = header.querySelector("#bada-bell-badge");
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

            const errorBellBtn = header.querySelector("#bada-error-bell");
            if (errorBellBtn) {
                errorBellBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    unreadErrorCount = 0;
                    updateBellBadge();
                    renderErrorList();
                    errorModalOverlay.classList.remove("bada-hidden");
                };
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
                    <span class="bada-subtext">${isKo ? "LocalStorage 자동 저장" : "Stored in LocalStorage"}</span>
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
            const savedModel = localStorage.getItem("bada_gemini_model") || "gemini-3.6-flash";
            modelSelect.value = savedModel;
            modelSelect.addEventListener("change", () => {
                localStorage.setItem("bada_gemini_model", modelSelect.value);
            });

            configRow.appendChild(inputGroup);
            configRow.appendChild(modelSelect);
            configSection.appendChild(configRow);
            root.appendChild(configSection);

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

            // Options Row (NSFW & Korean Translation Toggles)
            const optionsGrid = document.createElement("div");
            optionsGrid.className = "bada-options-grid";
            optionsGrid.innerHTML = `
                <div class="bada-toggle-card" id="bada-toggle-nsfw">
                    <div class="bada-toggle-info">
                        <span class="bada-toggle-title">${isKo ? "성인용 콘텐츠 허용 (NSFW)" : "Allow NSFW Content"}</span>
                        <span class="bada-toggle-desc">${isKo ? "관능적/친밀한 장면 무검열 묘사" : "Uncensored sensual & intimate scenes"}</span>
                    </div>
                    <span class="bada-toggle-badge ${isNSFW ? 'amber' : ''}" id="bada-badge-nsfw">${isNSFW ? 'ON' : 'OFF'}</span>
                </div>
                <div class="bada-toggle-card" id="bada-toggle-trans">
                    <div class="bada-toggle-info">
                        <span class="bada-toggle-title">${isKo ? "한국어 번역 및 해설" : "Korean Translation & Notes"}</span>
                        <span class="bada-toggle-desc">${isKo ? "영문 프롬프트와 연출 해설 분할" : "Separate English prompt and director notes"}</span>
                    </div>
                    <span class="bada-toggle-badge ${isTranslate ? 'green' : ''}" id="bada-badge-trans">${isTranslate ? 'ON' : 'OFF'}</span>
                </div>
            `;
            promptStudioContainer.appendChild(optionsGrid);

            const nsfwToggle = optionsGrid.querySelector("#bada-toggle-nsfw");
            const nsfwBadge = optionsGrid.querySelector("#bada-badge-nsfw");
            nsfwToggle.onclick = () => {
                isNSFW = !isNSFW;
                localStorage.setItem("bada_is_nsfw", isNSFW);
                nsfwBadge.textContent = isNSFW ? "ON" : "OFF";
                nsfwBadge.className = `bada-toggle-badge ${isNSFW ? 'amber' : ''}`;
                showToast(isKo ? `성인용 콘텐츠(NSFW) 허용: ${isNSFW ? 'ON' : 'OFF'}` : `Allow NSFW Content: ${isNSFW ? 'ON' : 'OFF'}`, "info", 1500);
            };

            const transToggle = optionsGrid.querySelector("#bada-toggle-trans");
            const transBadge = optionsGrid.querySelector("#bada-badge-trans");
            transToggle.onclick = () => {
                isTranslate = !isTranslate;
                localStorage.setItem("bada_is_translate", isTranslate);
                transBadge.textContent = isTranslate ? "ON" : "OFF";
                transBadge.className = `bada-toggle-badge ${isTranslate ? 'green' : ''}`;
                showToast(isKo ? `한국어 번역 및 해설: ${isTranslate ? 'ON' : 'OFF'}` : `Korean Translation & Notes: ${isTranslate ? 'ON' : 'OFF'}`, "info", 1500);
            };

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
            instructionTextarea.rows = 3;
            instructionTextarea.placeholder = isKo 
                ? "생성하고자 하는 장면, 인물, 구도, 조명 등을 자세히 적어보세요..." 
                : "Describe the scene, character, composition, lighting in detail...";
            instructionTextarea.addEventListener("input", () => {
                const counter = promptSection.querySelector("#bada-char-counter");
                const isKoNow = (typeof BadaI18n !== "undefined" && BadaI18n.lang === "ko");
                if (counter) counter.textContent = isKoNow ? `${instructionTextarea.value.length}자` : `${instructionTextarea.value.length} chars`;
            });
            promptSection.appendChild(instructionTextarea);

            // Quick Style Tags Bar
            const quickBar = document.createElement("div");
            quickBar.className = "bada-quick-bar";
            const quickTags = [
                { label: "🎬 35mm Film", label_ko: "🎬 35mm 필름", text: "35mm anamorphic lens, Kodak Portra 400 film grain, dramatic volumetric lighting" },
                { label: "📸 Raw UGC", label_ko: "📸 리얼 스냅", text: "iPhone 15 Pro raw snapshot, direct flash, authentic skin imperfections, zero filtering" },
                { label: "🎥 Video Motion", label_ko: "🎥 비디오 모션", text: "dynamic slow-motion tracking shot, atmospheric breeze blowing hair, fluid motion" },
                { label: "🌧️ Wet Neon", label_ko: "🌧️ 네온 비", text: "wet asphalt rain reflections, neon city lighting, dramatic moody shadows, cyberpunk" },
                { label: "👗 Vogue Editorial", label_ko: "👗 보그 화보", text: "high-fashion vogue editorial, studio strobe lighting, luxury fabrics" }
            ];

            function renderQuickBar() {
                quickBar.innerHTML = "";
                const isKoNow = (typeof BadaI18n !== "undefined" && BadaI18n.lang === "ko");
                quickTags.forEach(tag => {
                    const pill = document.createElement("button");
                    pill.type = "button";
                    pill.className = "bada-pill";
                    pill.textContent = isKoNow ? tag.label_ko : tag.label;
                    pill.onclick = (e) => {
                        e.preventDefault();
                        if (instructionTextarea.value.trim().length > 0) {
                            instructionTextarea.value += `, ${tag.text}`;
                        } else {
                            instructionTextarea.value = tag.text;
                        }
                        instructionTextarea.focus();
                    };
                    quickBar.appendChild(pill);
                });
            }
            renderQuickBar();
            promptSection.appendChild(quickBar);
            promptStudioContainer.appendChild(promptSection);

            // Custom Directives Accordion
            const accordion = document.createElement("div");
            accordion.style.border = "1px solid var(--bada-border)";
            accordion.style.borderRadius = "var(--bada-radius-sm)";
            accordion.style.overflow = "hidden";

            const accBtn = document.createElement("button");
            accBtn.type = "button";
            accBtn.style.width = "100%";
            accBtn.style.background = "var(--bada-bg-surface-elevated)";
            accBtn.style.border = "none";
            accBtn.style.padding = "6px 10px";
            accBtn.style.display = "flex";
            accBtn.style.alignItems = "center";
            accBtn.style.justifyContent = "space-between";
            accBtn.style.color = "var(--bada-text-muted)";
            accBtn.style.fontSize = "11px";
            accBtn.style.fontWeight = "700";
            accBtn.style.cursor = "pointer";
            accBtn.innerHTML = `<span id="bada-acc-title">${isKo ? "⚙️ 커스텀 시스템 지시사항 (선택 사항)" : "⚙️ Custom System Directives (Optional)"}</span><span id="bada-acc-arrow">▼</span>`;

            const accBody = document.createElement("div");
            accBody.style.display = "none";
            accBody.style.padding = "8px";
            accBody.style.background = "#090d15";

            const customDirectivesInput = document.createElement("textarea");
            customDirectivesInput.className = "bada-textarea";
            customDirectivesInput.rows = 2;
            customDirectivesInput.placeholder = isKo ? "이번 생성에만 강제 주입할 커스텀 시스템 지시사항이 있다면 입력하세요..." : "Enter custom system directives to override for this generation only...";
            accBody.appendChild(customDirectivesInput);

            accBtn.onclick = () => {
                const isHidden = accBody.style.display === "none";
                accBody.style.display = isHidden ? "block" : "none";
                accBtn.querySelector("#bada-acc-arrow").textContent = isHidden ? "▲" : "▼";
            };
            accordion.appendChild(accBtn);
            accordion.appendChild(accBody);
            promptStudioContainer.appendChild(accordion);

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

            function handleFiles(files) {
                Array.from(files).forEach(file => {
                    if (!file.type.startsWith("image/")) return;
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        uploadedImages.push(e.target.result);
                        renderThumbnails();
                        showToast(isKo ? `🖼️ 참고 이미지 #${uploadedImages.length} 첨부 완료` : `🖼️ Reference image #${uploadedImages.length} attached`, "success", 1500);
                    };
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
                    <span class="bada-badge" id="bada-pass-status" style="display: none;"></span>
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

            // Storyboard Card Container (Rendered when Storyboard cuts are returned)
            const storyboardOutputContainer = document.createElement("div");
            storyboardOutputContainer.className = "bada-storyboard-panel";
            storyboardOutputContainer.style.display = "none";
            outputSection.appendChild(storyboardOutputContainer);

            // Output Actions Row
            const actionsRow = document.createElement("div");
            actionsRow.className = "bada-actions-row";

            const copyBtn = document.createElement("button");
            copyBtn.type = "button";
            copyBtn.className = "bada-btn-secondary";
            copyBtn.innerHTML = `<span>📋</span> <span>${isKo ? "프롬프트 복사" : "Copy Prompt"}</span>`;
            copyBtn.onclick = async () => {
                const text = (lastEnglishPrompt || outputTextarea.value).trim();
                if (!text) {
                    showToast(isKo ? "⚠️ 복사할 생성된 프롬프트가 없습니다." : "⚠️ No generated prompt to copy.", "error", 2000);
                    return;
                }
                try {
                    await navigator.clipboard.writeText(text);
                    copyBtn.classList.add("active");
                    copyBtn.innerHTML = `<span>✅</span> <span>Copied!</span>`;
                    showToast(isKo ? "클립보드에 영문 프롬프트가 복사되었습니다! 📋" : "Copied English prompt to clipboard! 📋", "success", 2000);
                    setTimeout(() => {
                        copyBtn.classList.remove("active");
                        copyBtn.innerHTML = `<span>📋</span> <span>${isKo ? "프롬프트 복사" : "Copy Prompt"}</span>`;
                    }, 2000);
                } catch (err) {
                    showToast((isKo ? "클립보드 복사 실패: " : "Clipboard copy failed: ") + err, "error", 2500);
                }
            };

            const sendClipBtn = document.createElement("button");
            sendClipBtn.type = "button";
            sendClipBtn.className = "bada-btn-secondary";
            sendClipBtn.innerHTML = `<span>➡️</span> <span>${isKo ? "CLIP 전송" : "Send to Active CLIP"}</span>`;
            sendClipBtn.title = isKo ? "선택된 CLIPTextEncode 노드의 텍스트로 영문 프롬프트를 다이렉트 주입합니다." : "Directly injects English prompt into selected CLIPTextEncode node.";
            sendClipBtn.onclick = () => {
                const text = (lastEnglishPrompt || outputTextarea.value).trim();
                if (!text) {
                    showToast(isKo ? "⚠️ 전송할 생성된 프롬프트가 없습니다." : "⚠️ No generated prompt to send.", "error", 2000);
                    return;
                }
                sendTextToActiveClip(text);
            };

            const downloadTxtBtn = document.createElement("button");
            downloadTxtBtn.type = "button";
            downloadTxtBtn.className = "bada-btn-secondary";
            downloadTxtBtn.innerHTML = `<span>💾</span> <span>${isKo ? "TXT 다운로드" : "Download TXT"}</span>`;
            downloadTxtBtn.onclick = () => {
                const text = outputTextarea.value.trim();
                if (!text) {
                    showToast(isKo ? "다운로드할 텍스트가 없습니다." : "No text to download.", "error", 1500);
                    return;
                }
                const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `bada_${activeEngine}_prompt_${Date.now()}.txt`;
                a.click();
                URL.revokeObjectURL(url);
                showToast(isKo ? "텍스트 파일 다운로드 완료!" : "Text file downloaded!", "success", 1500);
            };

            actionsRow.appendChild(copyBtn);
            actionsRow.appendChild(sendClipBtn);
            actionsRow.appendChild(downloadTxtBtn);
            outputSection.appendChild(actionsRow);
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
            }

            tabEng.onclick = () => updateActiveTab("english");
            tabKor.onclick = () => updateActiveTab("korean");
            tabAll.onclick = () => updateActiveTab("all");

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

            // -------------------------------------------------------------
            // SUBMODE RENDERING (MiniMax / LTX / KREA)
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
                        card.className = `bada-sub-card minimax-card ${minimaxSub === sub.id ? "active" : ""}`;
                        card.innerHTML = `
                            <span class="bada-sub-icon">${sub.icon}</span>
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

                    const activeSub = MINIMAX_SUBMODES.find(s => s.id === minimaxSub) || MINIMAX_SUBMODES[0];
                    const callout = document.createElement("div");
                    callout.className = "bada-callout";
                    const subName = isKo ? activeSub.name : (activeSub.name_en || activeSub.name);
                    const subTag = isKo ? activeSub.tag : (activeSub.tag_en || activeSub.tag);
                    const subDesc = isKo ? activeSub.desc : (activeSub.desc_en || activeSub.desc);
                    callout.innerHTML = `⚡ <b>${subName} (${subTag})</b>: ${subDesc}`;
                    submodePanel.appendChild(callout);

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
                        card.className = `bada-sub-card ltx-card ${ltxSub === sub.id ? "active" : ""}`;
                        card.innerHTML = `
                            <span class="bada-sub-icon">${sub.icon}</span>
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

                    const activeSub = LTX_SUBMODES.find(s => s.id === ltxSub) || LTX_SUBMODES[0];
                    const callout = document.createElement("div");
                    callout.className = "bada-callout";
                    const subName = isKo ? activeSub.name : (activeSub.name_en || activeSub.name);
                    const subTag = isKo ? activeSub.tag : (activeSub.tag_en || activeSub.tag);
                    const subDesc = isKo ? activeSub.desc : (activeSub.desc_en || activeSub.desc);
                    callout.innerHTML = `⚡ <b>${subName} (${subTag})</b>: ${subDesc}`;
                    submodePanel.appendChild(callout);

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

                    if (kreaSub === "general") {
                        const callout = document.createElement("div");
                        callout.className = "bada-callout";
                        callout.innerHTML = `ℹ️ <b>${isKo ? "일반 모드" : "General Mode"}</b>: ${isKo ? "KREA 2의 최신 화풍 렌더링 규칙과 선택한 스타일을 적용합니다." : "Applies KREA 2 photorealism rules with selected art style."}`;
                        submodePanel.appendChild(callout);

                        const chipsRow = document.createElement("div");
                        chipsRow.className = "bada-chips-row";
                        KREA_STYLES.forEach(st => {
                            const chip = document.createElement("button");
                            chip.type = "button";
                            chip.className = `bada-chip ${kreaStyle === st.id ? "active" : ""}`;
                            chip.innerHTML = `<span>${st.icon}</span> <span>${isKo ? st.name : (st.name_en || st.name)}</span>`;
                            chip.onclick = () => {
                                kreaStyle = st.id;
                                localStorage.setItem("bada_krea_style", kreaStyle);
                                chipsRow.querySelectorAll(".bada-chip").forEach(c => c.classList.remove("active"));
                                chip.classList.add("active");
                            };
                            chipsRow.appendChild(chip);
                        });
                        submodePanel.appendChild(chipsRow);

                    } else if (kreaSub === "system_prompt") {
                        const presetRow = document.createElement("div");
                        presetRow.className = "bada-preset-row";
                        const presetSelect = document.createElement("select");
                        presetSelect.className = "bada-select";
                        KREA_PRESETS.forEach(p => {
                            const opt = document.createElement("option");
                            opt.value = p.id;
                            opt.textContent = isKo ? p.name : (p.name_en || p.name);
                            if (p.id === kreaPresetId) opt.selected = true;
                            presetSelect.appendChild(opt);
                        });
                        presetRow.appendChild(presetSelect);
                        submodePanel.appendChild(presetRow);

                        const activePreset = KREA_PRESETS.find(p => p.id === kreaPresetId) || KREA_PRESETS[0];
                        const appliedCard = document.createElement("div");
                        appliedCard.className = "bada-applied-card";
                        appliedCard.innerHTML = `
                            <div class="bada-applied-header">
                                <span>📌 ${isKo ? "적용 지침: " : "Directive: "}${isKo ? activePreset.name : (activePreset.name_en || activePreset.name)}</span>
                                <span class="bada-badge">KREA-2 Preset</span>
                            </div>
                            <div class="bada-applied-desc">${isKo ? activePreset.desc : (activePreset.desc_en || activePreset.desc)}</div>
                        `;
                        submodePanel.appendChild(appliedCard);

                        presetSelect.addEventListener("change", (e) => {
                            kreaPresetId = e.target.value;
                            localStorage.setItem("bada_krea_preset", kreaPresetId);
                            renderSubmodePanel();
                        });

                    } else if (kreaSub === "storyboard") {
                        const callout = document.createElement("div");
                        callout.className = "bada-callout";
                        callout.innerHTML = `🎞️ <b>${isKo ? "스토리보드 생성기" : "Storyboard Generator"}</b>: ${isKo ? "상황을 분석하여 일관된 인물/공간을 유지하는 연속 컷 시퀀스를 작성합니다." : "Generates sequential cut prompts maintaining character & scene consistency."}`;
                        submodePanel.appendChild(callout);

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

                        const chipsRow = document.createElement("div");
                        chipsRow.className = "bada-chips-row";
                        KREA_STYLES.forEach(st => {
                            const chip = document.createElement("button");
                            chip.type = "button";
                            chip.className = `bada-chip ${kreaStyle === st.id ? "active" : ""}`;
                            chip.innerHTML = `<span>${st.icon}</span> <span>${isKo ? st.name : (st.name_en || st.name)}</span>`;
                            chip.onclick = () => {
                                kreaStyle = st.id;
                                localStorage.setItem("bada_krea_style", kreaStyle);
                                chipsRow.querySelectorAll(".bada-chip").forEach(c => c.classList.remove("active"));
                                chip.classList.add("active");
                            };
                            chipsRow.appendChild(chip);
                        });
                        submodePanel.appendChild(chipsRow);
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
                    label.textContent = isKo 
                        ? `✍️ MiniMax H3 요청 (${minimaxSub.toUpperCase()} • ${durationSec}초)`
                        : `✍️ MiniMax H3 Prompt (${minimaxSub.toUpperCase()} • ${durationSec}s)`;
                    instructionTextarea.placeholder = isKo
                        ? "MiniMax H3로 생성할 영상 씬과 동작을 입력하세요.\n예: 사이버펑크 네온 비를 맞으며 걷는 여성, 35mm 영화 필름 룩, 자연스러운 카메라 트래킹"
                        : "Describe the video scene and motion for MiniMax H3.\ne.g. Woman walking in cyberpunk neon rain, 35mm film aesthetic, fluid tracking shot";
                    generateBtn.className = "bada-btn-generate minimax";
                    generateBtn.innerHTML = `<span>🎬</span> <span>${isKo ? "MiniMax H3 프롬프트 생성 🚀" : "Generate MiniMax H3 Prompt 🚀"}</span>`;
                } else if (activeEngine === "ltx") {
                    label.textContent = isKo
                        ? `✍️ LTX-Video 요청 (${ltxSub.toUpperCase()} • ${durationSec}초)`
                        : `✍️ LTX-Video Prompt (${ltxSub.toUpperCase()} • ${durationSec}s)`;
                    instructionTextarea.placeholder = isKo
                        ? "LTX-Video 2.5로 생성할 비디오 씬을 입력하세요.\n예: 천천히 돌리 인하는 카메라, 인물의 감정적인 표정 변화, 따뜻한 림 라이트와 앰비언트 사운드"
                        : "Describe the video scene for LTX-Video 2.5.\ne.g. Slow camera dolly in, subtle facial emotions, warm rim lighting and ambient sound";
                    generateBtn.className = "bada-btn-generate ltx";
                    generateBtn.innerHTML = `<span>🎥</span> <span>${isKo ? "LTX-Video 프롬프트 생성 🚀" : "Generate LTX-Video Prompt 🚀"}</span>`;
                } else if (activeEngine === "krea") {
                    if (kreaSub === "storyboard") {
                        label.textContent = isKo
                            ? `✍️ KREA 2 스토리보드 요청 (${storyboardCutCount}컷)`
                            : `✍️ KREA 2 Storyboard Prompt (${storyboardCutCount} Cuts)`;
                        instructionTextarea.placeholder = isKo
                            ? "스토리보드로 분할할 전체 시나리오나 스토리 개요를 입력하세요.\n예: 골목길에서 버려진 안드로이드를 수리하는 소녀, 기동 후 서로 미소를 짓는 4단계 시퀀스"
                            : "Enter narrative or scenario outline to divide into storyboard cuts.\ne.g. Girl repairing an android in an alleyway, 4-step sequence ending in a shared smile";
                        generateBtn.className = "bada-btn-generate";
                        generateBtn.innerHTML = `<span>🎞️</span> <span>${isKo ? `${storyboardCutCount}컷 스토리보드 생성 🚀` : `Generate ${storyboardCutCount}-Cut Storyboard 🚀`}</span>`;
                    } else {
                        const subTag = kreaSub === 'system_prompt' ? (isKo ? '지침 적용' : 'Directive') : kreaStyle;
                        label.textContent = isKo ? `✍️ KREA 2 요청 (${subTag})` : `✍️ KREA 2 Prompt (${subTag})`;
                        instructionTextarea.placeholder = isKo
                            ? "KREA 2로 생성할 씬의 아이디어나 스토리들을 자유롭게 입력하세요.\n예: 비에 젖은 아스팔트와 네온 조명이 반사되는 사이버펑크 도시, 포토리얼리스틱 질감"
                            : "Enter ideas or scenes to generate with KREA 2.\ne.g. Cyberpunk city with wet asphalt reflecting neon lights, photorealistic texture";
                        generateBtn.className = "bada-btn-generate";
                        generateBtn.innerHTML = `<span>🟢</span> <span>${isKo ? "KREA 2 프롬프트 생성 🚀" : "Generate KREA 2 Prompt 🚀"}</span>`;
                    }
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
                const customDirectives = customDirectivesInput.value.trim();

                if (!instruction && uploadedImages.length === 0) {
                    showToast(isKo ? "⚠️ 프롬프트 지시사항 또는 참고 이미지를 입력해 주세요." : "⚠️ Please enter prompt directives or attach a reference image.", "error", 3000);
                    instructionTextarea.focus();
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

                showToast(isKoNow ? `🚀 ${activeEngine.toUpperCase()} 작업 중... (중단하려면 버튼 클릭)` : `🚀 ${activeEngine.toUpperCase()} working... (Click to Stop)`, "info", 2500);

                // Prepare style / preset
                let styleParam = "";
                if (activeEngine === "krea") {
                    if (kreaSub === "system_prompt") {
                        const activeP = KREA_PRESETS.find(p => p.id === kreaPresetId) || KREA_PRESETS[0];
                        styleParam = activeP.desc;
                    } else {
                        styleParam = kreaStyle;
                    }
                }

                try {
                    const resp = await fetch("/api/bada/gemini/generate", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            api_key: key,
                            model: model,
                            engine_mode: activeEngine,
                            submode: activeEngine === "minimax" ? minimaxSub : (activeEngine === "ltx" ? ltxSub : kreaSub),
                            style: styleParam,
                            duration: durationSec,
                            cut_count: storyboardCutCount,
                            is_nsfw: isNSFW,
                            translate_korean: isTranslate,
                            instruction: instruction,
                            custom_directives: customDirectives,
                            images: uploadedImages
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

                        // If storyboard data exists, render cards
                        if (lastStoryboardData && lastStoryboardData.cuts && lastStoryboardData.cuts.length > 0) {
                            renderStoryboardCards(lastStoryboardData);
                        } else {
                            storyboardOutputContainer.style.display = "none";
                            outputTextarea.style.display = "block";
                            tabsHeader.style.display = "flex";
                            updateActiveTab("english");
                        }

                        const passBadge = root.querySelector("#bada-pass-status");
                        if (passBadge) {
                            passBadge.style.display = "inline-block";
                            const passText = data.pass_used === 2 ? "🛡️ Pass 2 VFX Override" : (data.pass_used === 3 ? "🎨 Pass 3 Metaphor" : "⚡ Pass 1 Direct");
                            passBadge.textContent = `${passText} (${data.model || model}) • ⏱️ ${duration}${isKoNow ? "초 완료" : "s done"}`;
                        }

                        // Completed state with elapsed time
                        generateBtn.innerHTML = `<span>✨</span> <span>${isKoNow ? `생성 완료! (${duration}초)` : `Completed! (${duration}s)`}</span>`;
                        setTimeout(() => {
                            if (!isGenerating) updateInputPlaceholders();
                        }, 3500);

                        showToast(isKoNow ? `✨ ${activeEngine.toUpperCase()} 생성 완료! (소요 시간: ${duration}초)` : `✨ ${activeEngine.toUpperCase()} completed in ${duration}s!`, "success", 3000);
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
                    sumBox.innerHTML = `<b>${isKo ? "전체 줄거리" : "Overall Synopsis"}</b>: ${sbData.summary}`;
                    storyboardOutputContainer.appendChild(sumBox);
                }

                sbData.cuts.forEach(cut => {
                    const card = document.createElement("div");
                    card.className = "bada-story-card";
                    card.innerHTML = `
                        <div class="bada-story-header">
                            <span class="bada-cut-num">Cut #${cut.cutNumber}</span>
                            <span class="bada-cut-angle">${cut.cameraAngle || 'Standard'}</span>
                        </div>
                        <div class="bada-cut-prompt">${cut.englishPrompt}</div>
                        ${cut.koreanTranslation ? `<div class="bada-cut-trans">${cut.koreanTranslation}</div>` : ''}
                        <div class="bada-cut-actions">
                            <button type="button" class="bada-btn-cut-action bada-copy-cut">${isKo ? "📋 복사" : "📋 Copy"}</button>
                            <button type="button" class="bada-btn-cut-action bada-clip-cut">${isKo ? "➡️ CLIP 전송" : "➡️ Send to CLIP"}</button>
                        </div>
                    `;
                    card.querySelector(".bada-copy-cut").onclick = async () => {
                        await navigator.clipboard.writeText(cut.englishPrompt);
                        showToast(isKo ? `Cut #${cut.cutNumber} 영문 프롬프트 복사 완료!` : `Cut #${cut.cutNumber} English prompt copied!`, "success", 1500);
                    };
                    card.querySelector(".bada-clip-cut").onclick = () => {
                        sendTextToActiveClip(cut.englishPrompt);
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

                const personaSelect = document.createElement("select");
                personaSelect.className = "bada-gem-select";
                GEM_PERSONAS_LIST.forEach(p => {
                    const opt = document.createElement("option");
                    opt.value = p.id;
                    opt.textContent = isKo ? p.name : (p.name_en || p.name);
                    if (p.id === selectedGemPersona) opt.selected = true;
                    personaSelect.appendChild(opt);
                });
                personaSelect.addEventListener("change", (e) => {
                    selectedGemPersona = e.target.value;
                    localStorage.setItem("bada_gem_persona", selectedGemPersona);
                    showToast((isKo ? "페르소나 변경: " : "Persona changed: ") + personaSelect.options[personaSelect.selectedIndex].text, "info", 1500);
                });

                const webSearchBtn = document.createElement("button");
                webSearchBtn.type = "button";
                webSearchBtn.className = `bada-websearch-btn ${webSearchEnabled ? 'active' : ''}`;
                webSearchBtn.innerHTML = `<span>🔍 ${isKo ? "실시간 웹검색" : "Live Web Search"}</span>`;
                webSearchBtn.onclick = () => {
                    webSearchEnabled = !webSearchEnabled;
                    localStorage.setItem("bada_web_search", webSearchEnabled);
                    webSearchBtn.classList.toggle("active", webSearchEnabled);
                    showToast(isKo ? `실시간 웹검색(Google Search): ${webSearchEnabled ? 'ON' : 'OFF'}` : `Live Web Search (Google): ${webSearchEnabled ? 'ON' : 'OFF'}`, "info", 1500);
                };

                const newChatBtn = document.createElement("button");
                newChatBtn.type = "button";
                newChatBtn.className = "bada-pill";
                newChatBtn.innerHTML = isKo ? "✏️ 새 채팅" : "✏️ New Chat";
                newChatBtn.onclick = () => {
                    chatMessages = [];
                    renderChatMessages();
                    showToast(isKo ? "대화가 초기화되었습니다." : "Conversation reset.", "info", 1500);
                };

                chatTopbar.appendChild(personaSelect);
                chatTopbar.appendChild(webSearchBtn);
                chatTopbar.appendChild(newChatBtn);
                chatStudioContainer.appendChild(chatTopbar);

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
                chatTextarea.rows = 1;
                chatTextarea.placeholder = isKo 
                    ? "무검열 제미나이에게 메시지 보내기... (Enter로 전송, Shift+Enter 줄바꿈)"
                    : "Send message to Uncensored Gemini... (Enter to send, Shift+Enter for newline)";

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

                            // Grounding sources
                            if (msg.grounding_sources && msg.grounding_sources.length > 0) {
                                const gBox = document.createElement("div");
                                gBox.className = "bada-grounding-box";
                                gBox.innerHTML = `<div>🔍 <b>${isKoNow ? "웹 검색 출처:" : "Web Sources:"}</b></div>`;
                                const sList = document.createElement("div");
                                sList.className = "bada-sources-list";
                                msg.grounding_sources.forEach(src => {
                                    const link = document.createElement("a");
                                    link.className = "bada-source-link";
                                    link.href = src.uri;
                                    link.target = "_blank";
                                    link.textContent = src.title || src.uri;
                                    sList.appendChild(link);
                                });
                                gBox.appendChild(sList);
                                bubble.appendChild(gBox);
                            }
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
                                web_search: webSearchEnabled,
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
                                grounding_sources: data.grounding_sources || [],
                                duration: duration
                            });
                            renderChatMessages();
                            showToast(isKoNow ? `✨ 답변 생성 완료! (${duration}초 소요)` : `✨ Reply completed in ${duration}s!`, "success", 2500);
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
                for (let item of items) {
                    if (item.type.startsWith("image/")) {
                        const blob = item.getAsFile();
                        if (blob) {
                            imageFound = true;
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                                if (activeEngine === "uncensored") {
                                    chatUploadedImages.push(ev.target.result);
                                    if (chatStudioContainer.querySelector(".bada-thumbnails-grid")) {
                                        chatStudioContainer.querySelector(".bada-thumbnails-grid").style.display = "grid";
                                    }
                                } else {
                                    uploadedImages.push(ev.target.result);
                                    renderThumbnails();
                                }
                                showToast(isKo ? "📸 클립보드 이미지 첨부 완료!" : "📸 Clipboard image attached!", "success", 2000);
                            };
                            reader.readAsDataURL(blob);
                        }
                    }
                }
                if (imageFound) e.preventDefault();
            };

            // Dynamic live bilingual updater when BadaUtils.Language changes
            function updateAllStaticLabels() {
                isKo = (typeof BadaI18n !== "undefined" && BadaI18n.lang === "ko");

                // Options grid
                const nsfwTitle = optionsGrid.querySelector("#bada-toggle-nsfw .bada-toggle-title");
                const nsfwDesc = optionsGrid.querySelector("#bada-toggle-nsfw .bada-toggle-desc");
                if (nsfwTitle) nsfwTitle.textContent = isKo ? "성인용 콘텐츠 허용 (NSFW)" : "Allow NSFW Content";
                if (nsfwDesc) nsfwDesc.textContent = isKo ? "관능적/친밀한 장면 무검열 묘사" : "Uncensored sensual & intimate scenes";

                const transTitle = optionsGrid.querySelector("#bada-toggle-trans .bada-toggle-title");
                const transDesc = optionsGrid.querySelector("#bada-toggle-trans .bada-toggle-desc");
                if (transTitle) transTitle.textContent = isKo ? "한국어 번역 및 해설" : "Korean Translation & Notes";
                if (transDesc) transDesc.textContent = isKo ? "영문 프롬프트와 연출 해설 분할" : "Separate English prompt and director notes";

                // Config section
                const cfgTitle = configSection.querySelector(".bada-config-title-text");
                const cfgSub = configSection.querySelector(".bada-subtext");
                if (cfgTitle) cfgTitle.textContent = isKo ? "🔑 API Key & 우선순위 모델 선택" : "🔑 API Key & Priority Model";
                if (cfgSub) cfgSub.textContent = isKo ? "LocalStorage 자동 저장" : "Stored in LocalStorage";

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

                // Accordion
                const accTitle = accordion.querySelector("#bada-acc-title");
                if (accTitle) accTitle.textContent = isKo ? "⚙️ 커스텀 시스템 지시사항 (선택 사항)" : "⚙️ Custom System Directives (Optional)";
                customDirectivesInput.placeholder = isKo ? "이번 생성에만 강제 주입할 커스텀 시스템 지시사항이 있다면 입력하세요..." : "Enter custom system directives to override for this generation only...";

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

                // Action buttons
                copyBtn.innerHTML = `<span>📋</span> <span>${isKo ? "프롬프트 복사" : "Copy Prompt"}</span>`;
                sendClipBtn.innerHTML = `<span>➡️</span> <span>${isKo ? "CLIP 전송" : "Send to Active CLIP"}</span>`;
                sendClipBtn.title = isKo ? "선택된 CLIPTextEncode 노드의 텍스트로 영문 프롬프트를 다이렉트 주입합니다." : "Directly injects English prompt into selected CLIPTextEncode node.";
                downloadTxtBtn.innerHTML = `<span>💾</span> <span>${isKo ? "TXT 다운로드" : "Download TXT"}</span>`;
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
                const errorBellBtnEl = header.querySelector("#bada-error-bell");
                if (errTitleEl) errTitleEl.textContent = isKo ? "오류 알림 내역" : "Error Notification Log";
                if (errClearBtnEl) errClearBtnEl.textContent = isKo ? "🗑️ 비우기" : "🗑️ Clear";
                if (errCloseBtnEl) errCloseBtnEl.title = isKo ? "닫기" : "Close";
                if (errorBellBtnEl) errorBellBtnEl.title = isKo ? "오류 알림 내역" : "Error Notifications";

                renderQuickBar();
                renderEngineNav();
                renderEngineView();
                app.graph?.setDirtyCanvas?.(true, true);
            }

            const langSubscription = () => {
                updateAllStaticLabels();
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

            function syncContainerSize() {
                if (!root || !node || !node.size) return;

                const w = Math.max(400, node.size[0] - 20);
                const h = Math.max(380, node.size[1] - 46);

                root.style.width = w + "px";
                root.style.maxWidth = w + "px";
                root.style.height = h + "px";
                root.style.maxHeight = h + "px";
                root.style.overflow = "hidden";

                root.classList.toggle("bada-compact-width", w < 380);
                root.classList.toggle("bada-ultra-compact", w < 340);
            }

            window.addEventListener("paste", onGlobalPaste);
            const onVisChange = () => { syncContainerSize(); };
            window.addEventListener("visibilitychange", onVisChange);
            window.addEventListener("focus", onVisChange);

            const onRemoved = node.onRemoved;
            node.onRemoved = function () {
                window.removeEventListener("paste", onGlobalPaste);
                window.removeEventListener("visibilitychange", onVisChange);
                window.removeEventListener("focus", onVisChange);
                if (timerInterval) clearInterval(timerInterval);
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

            // Minimum size boundary (Regional Prompt 방식과 동일)
            node.computeSize = function (out) {
                out = out || [0, 0];
                out[0] = 420;
                out[1] = 420;
                return out;
            };

            const origResize = node.onResize;
            node.onResize = function (size) {
                if (size[0] < 420) size[0] = 420;
                if (size[1] < 420) size[1] = 420;
                origResize?.apply(this, arguments);
                syncContainerSize();
            };

            const origConfigure = node.onConfigure;
            node.onConfigure = function (data) {
                const r = origConfigure ? origConfigure.apply(this, arguments) : undefined;
                hideAllBackendWidgets(this);
                if (this.size && this.size[0] < 420) this.size[0] = 520;
                if (this.size && this.size[1] < 420) this.size[1] = 780;
                setTimeout(() => {
                    hideAllBackendWidgets(this);
                    syncContainerSize();
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

            // 초기 크기 설정
            if (!node.size || node.size[0] < 420 || node.size[1] < 520) {
                node.setSize([520, 820]);
            }
            syncContainerSize();
            if (appInstance && appInstance.canvas) appInstance.canvas.setDirty(true, true);
        };
    }
});

