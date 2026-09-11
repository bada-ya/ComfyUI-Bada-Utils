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

// Dynamically inject CSS stylesheet
(function loadStylesheet() {
    const cssUrl = new URL("./bada_async_gemini.css", import.meta.url).href;
    if (!document.querySelector(`link[href="${cssUrl}"]`)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.type = "text/css";
        link.href = cssUrl;
        document.head.appendChild(link);
    }
})();

// Exact 7 Models matching bada-ya.github.io
const EXACT_MODELS = [
    { id: "gemini-3.6-flash", name: "⚡ 3.6 Flash (권장 ⭐)", desc: "1,500회/일 • 올라운더/NSFW 1차 통과" },
    { id: "gemini-3.1-flash-lite", name: "🚀 3.1 Flash-Lite", desc: "1,500회/일 • 초고속 영작/실시간 챗" },
    { id: "gemini-flash-latest", name: "🌟 Flash Latest", desc: "1,500회/일 • 최신 Flash 자동 라우팅" },
    { id: "gemini-3.8-flash", name: "⚡ 3.8 Flash (프리뷰)", desc: "20회/일 • 최신 기능 사전 체험" },
    { id: "gemini-3.7-flash", name: "⚡ 3.7 Flash", desc: "1,500회/일 • 안정적 표준 작업" },
    { id: "gemini-3.1-pro-preview", name: "🧠 3.1 Pro", desc: "50회/일 • 고난도 시나리오 & 기획" },
    { id: "gemini-pro-latest", name: "🧠 Pro Latest", desc: "50회/일 • 최신 Pro 심층 추론" },
];

// 4 Engine Tabs Specification
const ENGINES = [
    { id: "minimax", name: "● MiniMax H3", tag: "Omni-Modal Video", color: "#6366f1" },
    { id: "ltx", name: "● LTX-Video", tag: "6-Element DiT", color: "#06b6d4" },
    { id: "krea", name: "● KREA 2", tag: "Photorealism", color: "#10b981" },
    { id: "uncensored", name: "✨ 무검열 제미나이", tag: "Zero-Refusal Chat", color: "#a855f7" },
];

// MiniMax H3 Submodes
const MINIMAX_SUBMODES = [
    { id: "ref2va", name: "Ref2VA", tag: "전체 참조", icon: "🎬", desc: "인물/의상/사물/동작/사운드 통합 연출" },
    { id: "t2va", name: "T2VA", tag: "텍스트", icon: "⚡", desc: "텍스트 프롬프트 기반 24fps 비디오+오디오 생성" },
    { id: "i2va", name: "I2VA", tag: "첫 프레임", icon: "🖼️", desc: "첫 이미지로부터 유기적 물리 동작 전개" },
    { id: "fl2va", name: "FL2VA", tag: "첫-끝 루프", icon: "🔄", desc: "시작 프레임과 끝 프레임을 잇는 시퀀스" },
    { id: "l2va", name: "L2VA", tag: "끝 착륙", icon: "🎯", desc: "지정된 마지막 프레임 이미지로 역산 수렴" },
];

// LTX-Video Submodes
const LTX_SUBMODES = [
    { id: "ltx_2_5", name: "LTX 2.5", tag: "6요소 DiT", icon: "⚡", desc: "샷, 조명, 액션, 인물, 카메라, 사운드 6대 요소 결합" },
    { id: "ltx_t2v", name: "LTX T2V", tag: "텍스트 모션", icon: "📝", desc: "텍스트 서술 기반 24fps 시네마틱 프롬프트" },
    { id: "ltx_i2v", name: "LTX I2V", tag: "첫 프레임", icon: "🖼️", desc: "첫 프레임 이미지 기반 모션 역동성 확장" },
    { id: "voice_audio", name: "Voice & Audio", tag: "대사/음향", icon: "🗣️", desc: "캐릭터 음성 대사 및 배경 앰비언스 사운드 동기화" },
    { id: "camera_master", name: "Camera Master", tag: "3D 카메라", icon: "🎥", desc: "35mm 아나모픽 렌즈, 슬로우 돌리 인/아웃, 3D 카메라 궤적" },
];

// KREA 2 Submodes & Presets
const KREA_SUBMODES = [
    { id: "general", name: "🌐 일반", desc: "KREA 2 화풍 & 스타일 칩" },
    { id: "system_prompt", name: "📜 시스템 프롬프트", desc: "등록된 KREA 2 지침 적용" },
    { id: "storyboard", name: "🎞️ 스토리보드", desc: "연속 컷 시퀀스 분할 생성" },
];

const KREA_STYLES = [
    { id: "cinematic_photo", name: "35mm 필름", icon: "🎬" },
    { id: "iphone_snapshot", name: "Raw 스냅샷", icon: "📱" },
    { id: "vintage_retro", name: "빈티지 레트로", icon: "🎞️" },
    { id: "digital_art", name: "디지털 아트", icon: "🎨" },
    { id: "3d_render", name: "3D 렌더링", icon: "🧊" },
    { id: "cyberpunk_anime", name: "사이버펑크", icon: "🌆" },
];

const KREA_PRESETS = [
    { id: "krea_cinematic_photo", name: "시네마틱 35mm 영화 필름 (Anamorphic)", desc: "35mm 아나모픽 렌즈, 코닥 포트라 400 필름 그레인, 볼류메트릭 림 라이팅, 헐리우드 영화 룩" },
    { id: "krea_raw_snapshot", name: "날것의 스마트폰 스냅샷 (Raw UGC)", desc: "iPhone 15 Pro 무보정 스냅샷, 직광 플래시, 자연스러운 피부 질감 및 리얼리즘" },
    { id: "krea_surreal_3d", name: "초현실 판타지 & 컨셉 아트 (Octane 3D)", desc: "언리얼 엔진 5 & 옥테인 3D 렌더링, 레이트레이싱 광원, 8k 하이퍼 디테일" },
    { id: "krea_vintage_polaroid", name: "빈티지 레트로 폴라로이드 (90s Analog)", desc: "1990년대 폴라로이드 사진, 빛바랜 색감, 아날로그 그레인 및 따뜻한 감성" },
    { id: "krea_vogue_fashion", name: "하이엔드 패션 & 룩북 (Vogue Editorial)", desc: "보그 매거진 화보, 스튜디오 스트로브 조명, 오뜨 꾸뛰르 의상 및 모델 포징" },
];

// Gem Personas for Uncensored Gemini Chat
const GEM_PERSONAS_LIST = [
    { id: "universal", name: "⚡ 만능 무검열 제미나이" },
    { id: "cinematic_director", name: "🎬 시네마틱 프롬프트 디렉터" },
    { id: "fashion_lookbook", name: "👗 하이패션 & 룩북 마스터" },
    { id: "scenario_writer", name: "🧠 심층 기획 & 시나리오 작가" },
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
            let chatMessages = [
                {
                    role: "model",
                    text: "안녕하세요! Google AI Studio 개발자 API와 직결된 **100% 무검열 자유 대화 & 프롬프트 스튜디오**입니다.\n무엇이든 자유롭게 질문하시거나 이미지를 첨부해 시네마틱 프롬프트 기획을 시작해 보세요!"
                }
            ];
            let chatUploadedImages = [];
            let isChatSending = false;

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
                </div>
            `;
            root.appendChild(header);

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

            // 2. 4 Engine Tabs Navigation
            const engineNav = document.createElement("div");
            engineNav.className = "bada-engine-nav";

            ENGINES.forEach(eng => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = `bada-engine-btn ${activeEngine === eng.id ? "active" : ""}`;
                btn.setAttribute("data-engine", eng.id);
                btn.textContent = eng.name;
                btn.title = `${eng.name} (${eng.tag})`;
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
            root.appendChild(engineNav);

            // Container for Standard Prompt Generator (MiniMax, LTX, KREA)
            const promptStudioContainer = document.createElement("div");
            promptStudioContainer.className = "bada-prompt-studio-container";
            promptStudioContainer.style.display = "flex";
            promptStudioContainer.style.flexDirection = "column";
            promptStudioContainer.style.gap = "10px";
            root.appendChild(promptStudioContainer);

            // Container for Uncensored Gemini Chat
            const chatStudioContainer = document.createElement("div");
            chatStudioContainer.className = "bada-gemini-chat-wrap";
            chatStudioContainer.style.display = "none";
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
                        <span class="bada-toggle-title">성인용 콘텐츠 허용 (NSFW)</span>
                        <span class="bada-toggle-desc">관능적/친밀한 장면 무검열 묘사</span>
                    </div>
                    <span class="bada-toggle-badge ${isNSFW ? 'amber' : ''}" id="bada-badge-nsfw">${isNSFW ? 'ON' : 'OFF'}</span>
                </div>
                <div class="bada-toggle-card" id="bada-toggle-trans">
                    <div class="bada-toggle-info">
                        <span class="bada-toggle-title">한국어 번역 및 해설</span>
                        <span class="bada-toggle-desc">영문 프롬프트와 연출 해설 분할</span>
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
                showToast(`성인용 콘텐츠(NSFW) 허용: ${isNSFW ? 'ON' : 'OFF'}`, "info", 1500);
            };

            const transToggle = optionsGrid.querySelector("#bada-toggle-trans");
            const transBadge = optionsGrid.querySelector("#bada-badge-trans");
            transToggle.onclick = () => {
                isTranslate = !isTranslate;
                localStorage.setItem("bada_is_translate", isTranslate);
                transBadge.textContent = isTranslate ? "ON" : "OFF";
                transBadge.className = `bada-toggle-badge ${isTranslate ? 'green' : ''}`;
                showToast(`한국어 번역 및 해설: ${isTranslate ? 'ON' : 'OFF'}`, "info", 1500);
            };

            // API Key & Model Config Section
            const configSection = document.createElement("div");
            configSection.className = "bada-section";
            configSection.innerHTML = `
                <div class="bada-label">
                    <span>🔑 API Key & 우선순위 모델 선택</span>
                    <span class="bada-subtext">LocalStorage 자동 저장</span>
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
                opt.textContent = `${m.name}`;
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
            promptStudioContainer.appendChild(configSection);

            // Fetch server config if present
            fetch("/api/bada/gemini/config")
                .then(r => r.json())
                .then(data => {
                    if (data.success && !apiKeyInput.value && data.has_key) {
                        apiKeyInput.placeholder = data.masked_key || "Using Server/ENV Key ✅";
                    }
                })
                .catch(() => {});

            // Prompt Instruction Section
            const promptSection = document.createElement("div");
            promptSection.className = "bada-section";
            promptSection.innerHTML = `
                <div class="bada-label">
                    <span id="bada-input-label">✍️ 씬 연출 지시사항</span>
                    <span class="bada-subtext" id="bada-char-counter">0자</span>
                </div>
            `;
            const instructionTextarea = document.createElement("textarea");
            instructionTextarea.className = "bada-textarea";
            instructionTextarea.rows = 3;
            instructionTextarea.addEventListener("input", () => {
                const counter = promptSection.querySelector("#bada-char-counter");
                if (counter) counter.textContent = `${instructionTextarea.value.length}자`;
            });
            promptSection.appendChild(instructionTextarea);

            // Quick Style Tags Bar
            const quickBar = document.createElement("div");
            quickBar.className = "bada-quick-bar";
            const quickTags = [
                { label: "🎬 35mm Film", text: "35mm anamorphic lens, Kodak Portra 400 film grain, dramatic volumetric lighting" },
                { label: "📸 Raw UGC", text: "iPhone 15 Pro raw snapshot, direct flash, authentic skin imperfections, zero filtering" },
                { label: "🎥 Video Motion", text: "dynamic slow-motion tracking shot, atmospheric breeze blowing hair, fluid motion" },
                { label: "🌧️ Wet Neon", text: "wet asphalt rain reflections, neon city lighting, dramatic moody shadows, cyberpunk" },
                { label: "👗 Vogue Editorial", text: "high-fashion vogue editorial, studio strobe lighting, luxury fabrics" }
            ];
            quickTags.forEach(tag => {
                const pill = document.createElement("button");
                pill.type = "button";
                pill.className = "bada-pill";
                pill.textContent = tag.label;
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
            accBtn.innerHTML = `<span>⚙️ 커스텀 시스템 지시사항 (선택 사항)</span><span id="bada-acc-arrow">▼</span>`;

            const accBody = document.createElement("div");
            accBody.style.display = "none";
            accBody.style.padding = "8px";
            accBody.style.background = "#090d15";

            const customDirectivesInput = document.createElement("textarea");
            customDirectivesInput.className = "bada-textarea";
            customDirectivesInput.rows = 2;
            customDirectivesInput.placeholder = "이번 생성에만 강제 주입할 커스텀 시스템 지시사항이 있다면 입력하세요...";
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
                <span>🖼️ 참고 이미지 (멀티모달 비전)</span>
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
                <div class="bada-drop-text">드래그하거나 <b>Ctrl+V</b>로 이미지 붙여넣기</div>
                <div class="bada-drop-subtext">PNG, JPG, WEBP 지원</div>
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
                <span>이미지 클릭/호버하여 삭제</span>
                <button type="button" class="bada-btn-text" id="bada-clear-all">🗑️ 전체 삭제</button>
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
                        showToast(`🖼️ 참고 이미지 #${uploadedImages.length} 첨부 완료`, "success", 1500);
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
                        <button type="button" class="bada-thumbnail-del" title="삭제">×</button>
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
                showToast("모든 참고 이미지를 삭제했습니다.", "info", 1500);
            };

            // Main Generate Button
            const generateBtn = document.createElement("button");
            generateBtn.type = "button";
            generateBtn.className = "bada-btn-generate";
            generateBtn.innerHTML = `<span>🚀</span> <span>Generate Prompt (독립 비동기 실행)</span>`;
            promptStudioContainer.appendChild(generateBtn);

            // Output Section (Standard & Storyboard)
            const outputSection = document.createElement("div");
            outputSection.className = "bada-section";
            outputSection.innerHTML = `
                <div class="bada-label">
                    <span>✨ Generated Output</span>
                    <span class="bada-badge" id="bada-pass-status" style="display: none;"></span>
                </div>
            `;
            const tabsHeader = document.createElement("div");
            tabsHeader.className = "bada-tabs-header";
            const tabEng = document.createElement("button");
            tabEng.type = "button";
            tabEng.className = "bada-tab-btn active";
            tabEng.textContent = "🔤 English Master";

            const tabKor = document.createElement("button");
            tabKor.type = "button";
            tabKor.className = "bada-tab-btn";
            tabKor.textContent = "🇰🇷 Korean Translation";

            const tabAll = document.createElement("button");
            tabAll.type = "button";
            tabAll.className = "bada-tab-btn";
            tabAll.textContent = "📜 Combined";

            tabsHeader.appendChild(tabEng);
            tabsHeader.appendChild(tabKor);
            tabsHeader.appendChild(tabAll);
            outputSection.appendChild(tabsHeader);

            const outputTextarea = document.createElement("textarea");
            outputTextarea.className = "bada-textarea output";
            outputTextarea.rows = 4;
            outputTextarea.placeholder = "생성된 프롬프트가 여기에 표시됩니다. 자유롭게 직접 수정할 수도 있습니다.";
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
            copyBtn.innerHTML = `<span>📋</span> <span>Copy Prompt</span>`;
            copyBtn.onclick = async () => {
                const text = (lastEnglishPrompt || outputTextarea.value).trim();
                if (!text) {
                    showToast("⚠️ 복사할 생성된 프롬프트가 없습니다.", "error", 2000);
                    return;
                }
                try {
                    await navigator.clipboard.writeText(text);
                    copyBtn.classList.add("active");
                    copyBtn.innerHTML = `<span>✅</span> <span>Copied!</span>`;
                    showToast("클립보드에 영문 프롬프트가 복사되었습니다! 📋", "success", 2000);
                    setTimeout(() => {
                        copyBtn.classList.remove("active");
                        copyBtn.innerHTML = `<span>📋</span> <span>Copy Prompt</span>`;
                    }, 2000);
                } catch (err) {
                    showToast("클립보드 복사 실패: " + err, "error", 2500);
                }
            };

            const sendClipBtn = document.createElement("button");
            sendClipBtn.type = "button";
            sendClipBtn.className = "bada-btn-secondary";
            sendClipBtn.innerHTML = `<span>➡️</span> <span>Send to Active CLIP</span>`;
            sendClipBtn.title = "선택된 CLIPTextEncode 노드의 텍스트로 영문 프롬프트를 다이렉트 주입합니다.";
            sendClipBtn.onclick = () => {
                const text = (lastEnglishPrompt || outputTextarea.value).trim();
                if (!text) {
                    showToast("⚠️ 전송할 생성된 프롬프트가 없습니다.", "error", 2000);
                    return;
                }
                sendTextToActiveClip(text);
            };

            const downloadTxtBtn = document.createElement("button");
            downloadTxtBtn.type = "button";
            downloadTxtBtn.className = "bada-btn-secondary";
            downloadTxtBtn.innerHTML = `<span>💾</span> <span>Download TXT</span>`;
            downloadTxtBtn.onclick = () => {
                const text = outputTextarea.value.trim();
                if (!text) {
                    showToast("다운로드할 텍스트가 없습니다.", "error", 1500);
                    return;
                }
                const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `bada_${activeEngine}_prompt_${Date.now()}.txt`;
                a.click();
                URL.revokeObjectURL(url);
                showToast("텍스트 파일 다운로드 완료!", "success", 1500);
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
                    outputTextarea.value = lastKoreanTranslation || "(한국어 해설이 없습니다)";
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
                        showToast(`➡️ '${targetNode.title || targetNode.type}' 노드로 프롬프트 주입 완료!`, "success", 3000);
                        return true;
                    }
                }

                showToast("⚠️ 프롬프트를 전송할 CLIPTextEncode 노드를 캔버스에서 먼저 클릭해 주세요!", "error", 4000);
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
                            <span>🎬</span> <span>MiniMax H3 세부 모드</span>
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
                            <span class="bada-sub-name">${sub.name}</span>
                            <span class="bada-sub-tag">${sub.tag}</span>
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
                    callout.innerHTML = `⚡ <b>${activeSub.name} (${activeSub.tag})</b>: ${activeSub.desc}`;
                    submodePanel.appendChild(callout);

                    renderDurationSlider();

                } else if (activeEngine === "ltx") {
                    const headerRow = document.createElement("div");
                    headerRow.className = "bada-submode-header";
                    headerRow.innerHTML = `
                        <div class="bada-submode-title">
                            <span>🎥</span> <span>LTX-Video 2.5 세부 모드</span>
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
                            <span class="bada-sub-name">${sub.name}</span>
                            <span class="bada-sub-tag">${sub.tag}</span>
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
                    callout.innerHTML = `⚡ <b>${activeSub.name} (${activeSub.tag})</b>: ${activeSub.desc}`;
                    submodePanel.appendChild(callout);

                    renderDurationSlider();

                } else if (activeEngine === "krea") {
                    // KREA 2 has 3 Submodes: 일반, 시스템 프롬프트, 스토리보드
                    const headerRow = document.createElement("div");
                    headerRow.className = "bada-submode-header";
                    headerRow.innerHTML = `
                        <div class="bada-submode-title">
                            <span>🟢</span> <span>KREA 2 세부 모드 선택</span>
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
                            <span class="bada-sub-name">${sub.name}</span>
                            <span class="bada-sub-tag">${sub.desc}</span>
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
                        callout.innerHTML = `ℹ️ <b>일반 모드</b>: KREA 2의 최신 화풍 렌더링 규칙과 선택한 스타일을 적용합니다.`;
                        submodePanel.appendChild(callout);

                        const chipsRow = document.createElement("div");
                        chipsRow.className = "bada-chips-row";
                        KREA_STYLES.forEach(st => {
                            const chip = document.createElement("button");
                            chip.type = "button";
                            chip.className = `bada-chip ${kreaStyle === st.id ? "active" : ""}`;
                            chip.innerHTML = `<span>${st.icon}</span> <span>${st.name}</span>`;
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
                            opt.textContent = p.name;
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
                                <span>📌 적용 지침: ${activePreset.name}</span>
                                <span class="bada-badge">KREA-2 Preset</span>
                            </div>
                            <div class="bada-applied-desc">${activePreset.desc}</div>
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
                        callout.innerHTML = `🎞️ <b>스토리보드 생성기</b>: 상황을 분석하여 일관된 인물/공간을 유지하는 연속 컷 시퀀스를 작성합니다.`;
                        submodePanel.appendChild(callout);

                        const cutSliderRow = document.createElement("div");
                        cutSliderRow.className = "bada-duration-row";
                        cutSliderRow.innerHTML = `
                            <div class="bada-duration-label">
                                <span>🎬 스토리 컷 수:</span>
                                <b id="bada-cut-num">${storyboardCutCount}</b>컷
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
                            chip.innerHTML = `<span>${st.icon}</span> <span>${st.name}</span>`;
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
                        <span>⏱️ 목표 시간:</span>
                        <span><b id="bada-dur-num">${durationSec}</b>초</span>
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
                    label.textContent = `✍️ MiniMax H3 요청 (${minimaxSub.toUpperCase()} • ${durationSec}초)`;
                    instructionTextarea.placeholder = "MiniMax H3로 생성할 영상 씬과 동작을 입력하세요.\n예: 사이버펑크 네온 비를 맞으며 걷는 여성, 35mm 영화 필름 룩, 자연스러운 카메라 트래킹";
                    generateBtn.className = "bada-btn-generate minimax";
                    generateBtn.innerHTML = `<span>🎬</span> <span>MiniMax H3 프롬프트 생성 🚀</span>`;
                } else if (activeEngine === "ltx") {
                    label.textContent = `✍️ LTX-Video 요청 (${ltxSub.toUpperCase()} • ${durationSec}초)`;
                    instructionTextarea.placeholder = "LTX-Video 2.5로 생성할 비디오 씬을 입력하세요.\n예: 천천히 돌리 인하는 카메라, 인물의 감정적인 표정 변화, 따뜻한 림 라이트와 앰비언트 사운드";
                    generateBtn.className = "bada-btn-generate ltx";
                    generateBtn.innerHTML = `<span>🎥</span> <span>LTX-Video 프롬프트 생성 🚀</span>`;
                } else if (activeEngine === "krea") {
                    if (kreaSub === "storyboard") {
                        label.textContent = `✍️ KREA 2 스토리보드 요청 (${storyboardCutCount}컷)`;
                        instructionTextarea.placeholder = "스토리보드로 분할할 전체 시나리오나 스토리 개요를 입력하세요.\n예: 골목길에서 버려진 안드로이드를 수리하는 소녀, 기동 후 서로 미소를 짓는 4단계 시퀀스";
                        generateBtn.className = "bada-btn-generate";
                        generateBtn.innerHTML = `<span>🎞️</span> <span>${storyboardCutCount}컷 스토리보드 생성 🚀</span>`;
                    } else {
                        label.textContent = `✍️ KREA 2 요청 (${kreaSub === 'system_prompt' ? '지침 적용' : kreaStyle})`;
                        instructionTextarea.placeholder = "KREA 2로 생성할 씬의 아이디어나 스토리들을 자유롭게 입력하세요.\n예: 비에 젖은 아스팔트와 네온 조명이 반사되는 사이버펑크 도시, 포토리얼리스틱 질감";
                        generateBtn.className = "bada-btn-generate";
                        generateBtn.innerHTML = `<span>🟢</span> <span>KREA 2 프롬프트 생성 🚀</span>`;
                    }
                }
            }

            function renderEngineView() {
                if (activeEngine === "uncensored") {
                    promptStudioContainer.style.display = "none";
                    chatStudioContainer.style.display = "flex";
                    renderChatStudio();
                    // onDrawForeground가 매 프레임 syncContainerSize를 호출하므로 별도 sync 불필요
                    // 단, 즉시 한 번만 호출하여 초기 레이아웃 설정
                    setTimeout(syncContainerSize, 0);
                } else {
                    chatStudioContainer.style.display = "none";
                    promptStudioContainer.style.display = "flex";
                    renderSubmodePanel();
                    updateInputPlaceholders();
                }
            }

            // -------------------------------------------------------------
            // GENERATE PROMPT EXECUTION HANDLER
            // -------------------------------------------------------------
            generateBtn.onclick = async () => {
                if (isGenerating) return;

                const instruction = instructionTextarea.value.trim();
                const key = apiKeyInput.value.trim();
                const model = modelSelect.value;
                const customDirectives = customDirectivesInput.value.trim();

                if (!instruction && uploadedImages.length === 0) {
                    showToast("⚠️ 프롬프트 지시사항 또는 참고 이미지를 입력해 주세요.", "error", 3000);
                    instructionTextarea.focus();
                    return;
                }

                isGenerating = true;
                generateBtn.disabled = true;
                const startTime = Date.now();
                const btnOriginalHtml = generateBtn.innerHTML;
                generateBtn.innerHTML = `<span class="bada-spinner"></span> <span>[${activeEngine.toUpperCase()}] 프롬프트 생성 중... (0s)</span>`;

                timerInterval = setInterval(() => {
                    const elapsed = Math.round((Date.now() - startTime) / 1000);
                    generateBtn.innerHTML = `<span class="bada-spinner"></span> <span>[${activeEngine.toUpperCase()}] 프롬프트 생성 중... (${elapsed}s)</span>`;
                }, 1000);

                showToast(`🚀 ${activeEngine.toUpperCase()} 프롬프트 생성 중 (독립 비동기 실행)`, "info", 3000);

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
                        })
                    });

                    const data = await resp.json();
                    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

                    if (data.success && (data.prompt || data.storyboard)) {
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
                            passBadge.textContent = `${passText} (${data.model || model}) ${duration}s`;
                        }

                        showToast(`✨ ${activeEngine.toUpperCase()} 프롬프트 생성 성공! (${duration}초)`, "success", 3000);
                    } else {
                        const errMsg = data.error || "알 수 없는 오류가 발생했습니다.";
                        showToast(`❌ 오류: ${errMsg}`, "error", 5000);
                    }
                } catch (err) {
                    showToast(`❌ 네트워크 오류: ${err.message}`, "error", 5000);
                } finally {
                    isGenerating = false;
                    clearInterval(timerInterval);
                    timerInterval = null;
                    generateBtn.disabled = false;
                    generateBtn.innerHTML = btnOriginalHtml;
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
                    <span class="bada-story-badge">🎞️ 스토리보드 (${sbData.cuts.length}컷 생성 완료)</span>
                    <div style="display: flex; gap: 4px;">
                        <button type="button" class="bada-btn-cut-action" id="bada-copy-all-cuts">📋 전체 컷 복사</button>
                        <button type="button" class="bada-btn-cut-action" id="bada-send-all-cuts">➡️ 1번 컷 CLIP 전송</button>
                    </div>
                `;
                toolbar.querySelector("#bada-copy-all-cuts").onclick = async () => {
                    const allText = sbData.cuts.map(c => `[Cut ${c.cutNumber}: ${c.cameraAngle}]\n${c.englishPrompt}\n(${c.koreanTranslation})`).join("\n\n");
                    await navigator.clipboard.writeText(allText);
                    showToast("전체 스토리보드 컷이 복사되었습니다! 📋", "success", 2000);
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
                    sumBox.innerHTML = `<b>전체 줄거리</b>: ${sbData.summary}`;
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
                            <button type="button" class="bada-btn-cut-action bada-copy-cut">📋 복사</button>
                            <button type="button" class="bada-btn-cut-action bada-clip-cut">➡️ CLIP 전송</button>
                        </div>
                    `;
                    card.querySelector(".bada-copy-cut").onclick = async () => {
                        await navigator.clipboard.writeText(cut.englishPrompt);
                        showToast(`Cut #${cut.cutNumber} 영문 프롬프트 복사 완료!`, "success", 1500);
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
                    opt.textContent = p.name;
                    if (p.id === selectedGemPersona) opt.selected = true;
                    personaSelect.appendChild(opt);
                });
                personaSelect.addEventListener("change", (e) => {
                    selectedGemPersona = e.target.value;
                    localStorage.setItem("bada_gem_persona", selectedGemPersona);
                    showToast(`페르소나 변경: ${personaSelect.options[personaSelect.selectedIndex].text}`, "info", 1500);
                });

                const webSearchBtn = document.createElement("button");
                webSearchBtn.type = "button";
                webSearchBtn.className = `bada-websearch-btn ${webSearchEnabled ? 'active' : ''}`;
                webSearchBtn.innerHTML = `<span>🔍 실시간 웹검색</span>`;
                webSearchBtn.onclick = () => {
                    webSearchEnabled = !webSearchEnabled;
                    localStorage.setItem("bada_web_search", webSearchEnabled);
                    webSearchBtn.classList.toggle("active", webSearchEnabled);
                    showToast(`실시간 웹검색(Google Search): ${webSearchEnabled ? 'ON' : 'OFF'}`, "info", 1500);
                };

                const newChatBtn = document.createElement("button");
                newChatBtn.type = "button";
                newChatBtn.className = "bada-pill";
                newChatBtn.innerHTML = "✏️ 새 채팅";
                newChatBtn.onclick = () => {
                    chatMessages = [
                        {
                            role: "model",
                            text: "새 대화가 시작되었습니다! 무검열 제미나이에게 무엇이든 물어보세요."
                        }
                    ];
                    renderChatMessages();
                    showToast("대화가 초기화되었습니다.", "info", 1500);
                };

                chatTopbar.appendChild(personaSelect);
                chatTopbar.appendChild(webSearchBtn);
                chatTopbar.appendChild(newChatBtn);
                chatStudioContainer.appendChild(chatTopbar);

                // Message Thread
                const thread = document.createElement("div");
                thread.className = "bada-chat-thread";
                chatStudioContainer.appendChild(thread);

                // Chat Input Bar (방안 A: bada-gemini-chat-inputbar 병기)
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
                chatAttachBtn.title = "이미지 첨부";
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
                chatTextarea.placeholder = "무검열 제미나이에게 메시지 보내기... (Enter로 전송, Shift+Enter 줄바꿈)";

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

                        // If model message, add Copy & Send to CLIP actions
                        if (msg.role === "model") {
                            const actRow = document.createElement("div");
                            actRow.className = "bada-msg-actions";

                            const copyMBtn = document.createElement("button");
                            copyMBtn.type = "button";
                            copyMBtn.className = "bada-btn-msg-act";
                            copyMBtn.innerHTML = "📋 복사";
                            copyMBtn.onclick = async () => {
                                await navigator.clipboard.writeText(msg.text);
                                showToast("답변 텍스트가 복사되었습니다! 📋", "success", 1500);
                            };

                            const clipMBtn = document.createElement("button");
                            clipMBtn.type = "button";
                            clipMBtn.className = "bada-btn-msg-act";
                            clipMBtn.innerHTML = "➡️ CLIP 전송";
                            clipMBtn.onclick = () => {
                                // Extract first prompt block or entire text
                                sendTextToActiveClip(msg.text);
                            };

                            actRow.appendChild(copyMBtn);
                            actRow.appendChild(clipMBtn);
                            bubble.appendChild(actRow);

                            // Grounding sources
                            if (msg.grounding_sources && msg.grounding_sources.length > 0) {
                                const gBox = document.createElement("div");
                                gBox.className = "bada-grounding-box";
                                gBox.innerHTML = `<div>🔍 <b>웹 검색 출처:</b></div>`;
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
                    const text = chatTextarea.value.trim();
                    if (!text && chatUploadedImages.length === 0) return;
                    if (isChatSending) return;

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
                    chatSendBtn.disabled = true;
                    chatSendBtn.innerHTML = `<span class="bada-spinner"></span>`;

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
                            })
                        });

                        const data = await resp.json();
                        if (data.success && data.reply) {
                            chatMessages.push({
                                role: "model",
                                text: data.reply,
                                grounding_sources: data.grounding_sources || []
                            });
                            renderChatMessages();
                        } else {
                            showToast(`❌ 채팅 오류: ${data.error || '응답 실패'}`, "error", 4000);
                        }
                    } catch (err) {
                        showToast(`❌ 네트워크 오류: ${err.message}`, "error", 4000);
                    } finally {
                        isChatSending = false;
                        chatSendBtn.disabled = false;
                        chatSendBtn.innerHTML = "🚀";
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
                                showToast("📸 클립보드 이미지 첨부 완료!", "success", 2000);
                            };
                            reader.readAsDataURL(blob);
                        }
                    }
                }
                if (imageFound) e.preventDefault();
            };
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

                // 방안 A: JS는 오직 root의 width/height만 설정 (자식 픽셀 계산 코드 완전 배제)
                root.style.width = w + "px";
                root.style.maxWidth = w + "px";
                root.style.height = h + "px";
                root.style.maxHeight = h + "px";
                root.style.overflow = "hidden";
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

