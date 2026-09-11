import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { BadaI18n } from "./bada_i18n.js";

// CSS 스타일시트 동적 로드
const link = document.createElement("link");
link.rel = "stylesheet";
link.type = "text/css";
link.href = new URL("./auto_assigner.css", import.meta.url).href;
document.head.appendChild(link);

const SKIP_VALUE = "__SKIP_APPLY__";

/**
 * ⚡ ComfyUI Auto Model & LoRA Assigner Engine
 */
class AutoModelAssigner {
    static modelsCache = null;

    /**
     * 로컬 모델 파일 목록 API 호출 및 캐싱
     */
    static async fetchLocalModels() {
        try {
            const resp = await api.fetchApi("/api/auto-assign/models");
            if (resp.ok) {
                const data = await resp.json();
                const models = data.models || data.data;
                if (data.status === "success" && models) {
                    this.modelsCache = models;
                    return this.modelsCache;
                }
            }
        } catch (err) {
            console.warn("[AutoModelAssigner] Backend API not reachable, falling back to widget options:", err);
        }
        return null;
    }

    /**
     * 해당 노드가 모델/LoRA 관련 노드인지 확인
     */
    static isModelNode(node) {
        if (!node) return false;
        const nodeType = (node.type || "").toLowerCase();
        if (
            nodeType.includes("lora") ||
            nodeType.includes("checkpoint") ||
            nodeType.includes("unet") ||
            nodeType.includes("diffusion") ||
            nodeType.includes("vae") ||
            nodeType.includes("clip") ||
            nodeType.includes("controlnet") ||
            nodeType.includes("upscale") ||
            nodeType.includes("dasiwa") ||
            nodeType.includes("deno") ||
            nodeType.includes("rgthree")
        ) {
            return true;
        }
        if (node.widgets && node.widgets.length > 0) {
            return node.widgets.some(w => this.isModelWidget(w, node));
        }
        return false;
    }

    /**
     * 해당 위젯이 모델/LoRA 선택 위젯인지 판별
     */
    static isModelWidget(widget, node) {
        if (!widget) return false;
        const name = (widget.name || "").toLowerCase();
        const val = typeof widget.value === "string" ? widget.value.toLowerCase() : "";
        
        // 1. 이름 패턴 검사 (lora, ckpt, unet, lora_1, model 등)
        if (
            name.includes("ckpt") ||
            name.includes("unet") ||
            name.includes("clip") ||
            name.includes("vae") ||
            name.includes("lora") ||
            name.includes("control_net") ||
            name.includes("model_name") ||
            name.includes("upscale_model") ||
            name === "model" ||
            name.startsWith("lora_") ||
            name.startsWith("model_")
        ) {
            return true;
        }

        // 2. 값 패턴 검사 (.safetensors, .ckpt, .gguf 등)
        if (
            val.endsWith(".safetensors") ||
            val.endsWith(".ckpt") ||
            val.endsWith(".pt") ||
            val.endsWith(".bin") ||
            val.endsWith(".pth") ||
            val.endsWith(".gguf")
        ) {
            return true;
        }

        // 3. 위젯 options.values 검사
        if (widget.options && Array.isArray(widget.options.values)) {
            const hasModelFiles = widget.options.values.some(v => 
                typeof v === "string" && (
                    v.endsWith(".safetensors") || 
                    v.endsWith(".ckpt") || 
                    v.endsWith(".pt") || 
                    v.endsWith(".bin") || 
                    v.endsWith(".pth") || 
                    v.endsWith(".gguf")
                )
            );
            if (hasModelFiles) return true;
        }

        return false;
    }

    /**
     * 카테고리별 사용 가능한 로컬 모델 파일 목록 획득 (별칭 및 폴백 지원)
     */
    static getAvailableModelsForCategory(category, localModels) {
        if (!localModels) return [];
        let list = localModels[category];
        if (!list || list.length === 0) {
            if (category === "diffusion_models") list = localModels["unet"];
            else if (category === "unet") list = localModels["diffusion_models"];
            else if (category === "clip") list = localModels["text_encoders"];
            else if (category === "text_encoders") list = localModels["clip"];
            else if (category === "loras") list = localModels["lora"];
            else if (category === "checkpoints") list = localModels["checkpoint"];
        }
        return Array.isArray(list) ? list : [];
    }

    /**
     * 위젯 및 노드 유형으로부터 모델 카테고리 추론
     */
    static detectCategory(widgetOrName, node) {
        const wName = typeof widgetOrName === "string" ? widgetOrName.toLowerCase() : ((widgetOrName?.name || "").toLowerCase());
        const nType = (node?.type || "").toLowerCase();

        if (wName.includes("ckpt") || nType.includes("checkpoint")) return "checkpoints";
        if (wName.includes("unet") || nType.includes("unet") || nType.includes("diffusion") || nType.includes("transformer")) return "diffusion_models";
        if (wName.includes("lora") || nType.includes("lora") || nType.includes("dasiwa") || nType.includes("deno") || nType.includes("rgthree")) return "loras";
        if (wName.includes("vae") || nType.includes("vae")) return "vae";
        if (wName.includes("clip") || nType.includes("clip") || nType.includes("text_encoder")) return "clip";
        if (wName.includes("control_net") || nType.includes("controlnet")) return "controlnet";
        if (wName.includes("upscale") || nType.includes("upscale")) return "upscale_models";
        return "checkpoints";
    }

    /**
     * 노드에서 모든 모델 슬롯을 범용적으로 추출
     * (기본 노드 + rgthree Power Lora Loader + DaSiWa LoRA Loader + Deno Multi LoRA + CR LoRA Stack 등 서드파티 완벽 지원)
     */
    static extractModelSlots(node, localModels) {
        if (!node) return [];
        const slots = [];
        const nodeType = (node.type || "").toLowerCase();

        // ----------------------------------------------------
        // 1. rgthree Power Lora Loader 특화 처리
        // ----------------------------------------------------
        const isRgthreeNode = nodeType.includes("power lora") || nodeType.includes("rgthree");
        if (isRgthreeNode || (node.widgets && node.widgets.some(w => (w.value && typeof w.value === "object" && "lora" in w.value) || (typeof w.setLora === "function" && w.name?.startsWith("lora_"))))) {
            if (node.widgets) {
                let slotIdx = 1;
                node.widgets.forEach(w => {
                    const isRgthreeWidget = (w.value && typeof w.value === "object" && "lora" in w.value) || (typeof w.setLora === "function" && w.name?.startsWith("lora_"));
                    if (isRgthreeWidget) {
                        const loraPath = (typeof w.value === "object" ? w.value?.lora : w.value) || "";
                        // None 또는 빈값 제외
                        if (!loraPath || loraPath === "None" || loraPath === "__none__" || loraPath.trim() === "") return;

                        const category = "loras";
                        const availableList = this.getAvailableModelsForCategory(category, localModels);

                        slots.push({
                            node,
                            widget: w,
                            slotType: "rgthree",
                            slotKey: `rgthree_${slotIdx}`,
                            slotLabel: `LoRA Slot #${slotIdx}`,
                            category,
                            currentValue: loraPath,
                            availableList,
                            applyValue: (newVal) => {
                                if (typeof w.setLora === "function") {
                                    w.setLora(newVal);
                                }
                                if (w.value && typeof w.value === "object") {
                                    w.value.lora = newVal;
                                } else {
                                    w.value = newVal;
                                }
                                if (w.callback) w.callback(w.value, app.canvas, node, app.canvas.graph_mouse, {});
                                if (node.onWidgetChanged) {
                                    node.onWidgetChanged(w.name, w.value, null, w);
                                }
                                node.setDirtyCanvas?.(true, true);
                            }
                        });
                        slotIdx++;
                    }
                });
            }
        }

        // ----------------------------------------------------
        // 2. DaSiWa LoRA Loader / JSON Stack 특화 처리
        // ----------------------------------------------------
        if (nodeType.includes("dasiwa") || (node.widgets && node.widgets.some(w => w.name === "stack_data" || (typeof w.value === "string" && w.value.startsWith("[") && w.value.includes('"lora"'))))) {
            const stackWidget = node.widgets && node.widgets.find(w => w.name === "stack_data" || (typeof w.value === "string" && w.value.startsWith("[") && w.value.includes('"lora"')));
            const rawStackStr = stackWidget?.value || node.properties?.stack_data;
            if (rawStackStr) {
                try {
                    const stackData = typeof rawStackStr === "string" ? JSON.parse(rawStackStr) : rawStackStr;
                    if (Array.isArray(stackData)) {
                        stackData.forEach((item, idx) => {
                            if (item && typeof item === "object") {
                                const loraPath = item.lora || "";
                                // 설정된 LoRA가 있거나 슬롯이 활성화된 경우
                                if (loraPath && loraPath !== "None" && loraPath !== "__none__" && loraPath.trim() !== "") {
                                    const category = "loras";
                                    const availableList = this.getAvailableModelsForCategory(category, localModels);

                                    slots.push({
                                        node,
                                        slotType: "dasiwa_json",
                                        slotKey: `dasiwa_stack_${idx}`,
                                        slotLabel: `LoRA Slot #${idx + 1}`,
                                        category,
                                        currentValue: loraPath,
                                        availableList,
                                        applyValue: (newVal) => {
                                            try {
                                                const currentStr = stackWidget?.value || node.properties?.stack_data || "[]";
                                                const currentArr = typeof currentStr === "string" ? JSON.parse(currentStr) : currentStr;
                                                if (currentArr && currentArr[idx]) {
                                                    currentArr[idx].lora = newVal;
                                                    const updatedStr = JSON.stringify(currentArr);
                                                    if (stackWidget) stackWidget.value = updatedStr;
                                                    if (node.properties) node.properties.stack_data = updatedStr;
                                                    if (stackWidget?.callback) stackWidget.callback(updatedStr, app.canvas, node, app.canvas.graph_mouse, {});
                                                    node.setDirtyCanvas?.(true, true);
                                                }
                                            } catch (err) {
                                                console.error("[AutoModelAssigner] Failed to update DaSiWa stack:", err);
                                            }
                                        }
                                    });
                                }
                            }
                        });
                    }
                } catch (e) {
                    console.warn("[AutoModelAssigner] Error parsing DaSiWa stack_data:", e);
                }
            }
        }

        // ----------------------------------------------------
        // 3. 표준 위젯 및 Deno Multi-LoRA, 일반 Combo/Text 위젯 처리
        // ----------------------------------------------------
        if (node.widgets) {
            node.widgets.forEach((widget, idx) => {
                // 이미 rgthree나 dasiwa로 처리된 위젯은 중복 방지
                if (widget.name === "stack_data" || (widget.value && typeof widget.value === "object" && "lora" in widget.value) || typeof widget.setLora === "function") {
                    return;
                }

                if (!this.isModelWidget(widget, node)) return;

                const currentValue = typeof widget.value === "string" ? widget.value : "";
                // 빈 슬롯(__none__, None 등)은 건너뛰기
                if (!currentValue || currentValue === "__none__" || currentValue === "None" || currentValue.trim() === "") {
                    return;
                }

                const category = this.detectCategory(widget, node);
                let availableList = this.getAvailableModelsForCategory(category, localModels);
                if (availableList.length === 0 && widget.options && Array.isArray(widget.options.values)) {
                    availableList = widget.options.values;
                }
                availableList = availableList.filter(f => typeof f === "string" && f.trim() !== "" && f !== "__none__" && f !== "None");

                const slotName = widget.name || `slot_${idx + 1}`;

                slots.push({
                    node,
                    widget,
                    slotType: "standard_widget",
                    slotKey: `widget_${slotName}_${idx}`,
                    slotLabel: slotName,
                    category,
                    currentValue: currentValue,
                    availableList,
                    applyValue: (newVal) => {
                        const oldValue = widget.value;
                        widget.value = newVal;
                        if (widget.callback) {
                            widget.callback(newVal, app.canvas, node, app.canvas.graph_mouse, {});
                        }
                        if (node.onWidgetChanged) {
                            node.onWidgetChanged(widget.name, newVal, oldValue, widget);
                        }
                        node.setDirtyCanvas?.(true, true);
                    }
                });
            });
        }
        return slots;
    }

    /**
     * 문자열 정규화 (비교용)
     */
    static normalizeString(str) {
        if (!str) return "";
        let clean = str.replace(/\\/g, "/").split("/").pop(); // 파일명만 추출
        clean = clean.replace(/\.(safetensors|ckpt|pt|bin|pth|onnx|engine)$/i, ""); // 확장자 제거
        clean = clean.toLowerCase();
        clean = clean.replace(/[_.\-\s()[\]]+/g, " ").trim(); // 특수문자 공백 치환
        return clean;
    }

    /**
     * 온라인 검색용 최적화 쿼리 추출
     * (특수문자, 확장자, 경로 등을 제거하여 구글/허깅페이스/Civitai에서 100% 검색되도록 정제)
     */
    static getCleanSearchQuery(filename) {
        if (!filename) return "";
        let base = filename.replace(/\\/g, "/").split("/").pop();
        base = base.replace(/\.(safetensors|ckpt|pt|bin|pth|onnx|engine)$/i, "");
        base = base.replace(/[_.\-\s()[\]]+/g, " ").trim();
        return base;
    }

    /**
     * 두 문자열 간의 유사도 점수 산출 (0 ~ 100)
     */
    static calculateSimilarity(target, candidate) {
        if (!target || !candidate) return 0;

        const targetBase = target.replace(/\\/g, "/").split("/").pop();
        const candBase = candidate.replace(/\\/g, "/").split("/").pop();

        // 1. 순수 파일명(확장자 포함) 완전 일치 (폴더 경로만 다른 경우)
        if (targetBase.toLowerCase() === candBase.toLowerCase()) {
            return 100;
        }

        const normTarget = this.normalizeString(target);
        const normCand = this.normalizeString(candidate);

        // 2. 정규화 후 완전 일치
        if (normTarget === normCand) {
            return 98;
        }

        // 3. 토큰 자카드 유사도 + 부분 포함 점수
        const targetTokens = new Set(normTarget.split(" ").filter(t => t.length > 0));
        const candTokens = new Set(normCand.split(" ").filter(t => t.length > 0));

        let intersection = 0;
        for (const t of targetTokens) {
            if (candTokens.has(t)) intersection++;
        }

        const union = new Set([...targetTokens, ...candTokens]).size;
        const jaccard = union === 0 ? 0 : (intersection / union);

        // 4. 레벤슈타인 거리 기반 유사도
        const levScore = this.levenshteinScore(normTarget, normCand);

        // 5. 가중치 점수 계산
        let finalScore = Math.round((jaccard * 0.6 + levScore * 0.4) * 100);

        // 정밀도 키워드 일치 보너스 (fp8, fp16, bf16)
        const precisions = ["fp8", "fp16", "bf16", "v1", "v2", "turbo", "inpainting", "lora"];
        for (const p of precisions) {
            if (normTarget.includes(p) && normCand.includes(p)) finalScore += 5;
            if (normTarget.includes(p) && !normCand.includes(p)) finalScore -= 5;
        }

        return Math.max(0, Math.min(99, finalScore));
    }

    /**
     * 레벤슈타인 거리 유사도 (0.0 ~ 1.0)
     */
    static levenshteinScore(s1, s2) {
        const longer = s1.length > s2.length ? s1 : s2;
        const shorter = s1.length > s2.length ? s2 : s1;
        if (longer.length === 0) return 1.0;

        const costs = [];
        for (let i = 0; i <= longer.length; i++) {
            let lastValue = i;
            for (let j = 0; j <= shorter.length; j++) {
                if (i === 0) {
                    costs[j] = j;
                } else if (j > 0) {
                    let newValue = costs[j - 1];
                    if (longer.charAt(i - 1) !== shorter.charAt(j - 1)) {
                        newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                    }
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
            if (i > 0) costs[shorter.length] = lastValue;
        }
        return (longer.length - costs[shorter.length]) / parseFloat(longer.length);
    }

    /**
     * 노드의 에러 상태를 초기화하고 캔버스를 완전히 새로고침하는 유틸리티
     */
    static clearNodeErrorsAndRefresh(nodes = []) {
        nodes.forEach(node => {
            if (!node) return;
            // 1. LiteGraph 노드 레벨 에러 플래그 제거
            node.has_errors = false;
            delete node.rendering_error;
            delete node.boxcolor;
            delete node.color;
            
            if (node.flags) {
                delete node.flags.has_errors;
                delete node.flags.error;
            }

            // 노드 개별 캔버스 재렌더링
            if (node.setDirtyCanvas) {
                node.setDirtyCanvas(true, true);
            }
        });

        // 2. 그래프 전체 변경 알림 및 캔버스 강제 재렌더링
        try {
            if (app.graph) {
                app.graph.afterChange?.();
                app.graph.change?.();
                app.graph.setDirtyCanvas?.(true, true);
            }
            if (app.canvas) {
                app.canvas.setDirty?.(true, true);
                app.canvas.draw?.(true, true);
            }
        } catch (e) {
            console.warn("[AutoModelAssigner] Error during canvas refresh:", e);
        }

        // 3. ComfyUI 최신 프론트엔드 에러 사이드바 / Validation 갱신 이벤트 트리거
        try {
            window.dispatchEvent(new CustomEvent("graphChanged"));
            window.dispatchEvent(new Event("resize"));
            
            // 사이드바의 에러 패널 새로고침 버튼(🔄)이 있으면 자동 클릭
            const refreshButtons = document.querySelectorAll("button i.pi-refresh, button i[class*='refresh'], button[aria-label*='refresh'], .p-button-icon.pi-refresh");
            refreshButtons.forEach(btn => {
                const parentBtn = btn.closest("button");
                if (parentBtn) {
                    parentBtn.click();
                }
            });
        } catch (e) {
            // silent ignore
        }
    }

    /**
     * 자동 장착 메인 실행 함수 (targetNode가 null이면 전체 워크플로우 대상)
     */
    static async runAutoAssign(targetNode = null) {
        this.showToast("🔍 모델 및 LoRA 슬롯 분석 중...", "info");

        // 1. 로컬 모델 목록 로드
        let localModels = await this.fetchLocalModels();

        // 2. 대상 노드 목록 수집
        const nodesToScan = targetNode 
            ? [targetNode] 
            : (app.graph?._nodes || []);

        const itemsToResolve = [];
        let totalChecked = 0;
        let alreadyMatchedCount = 0;
        let missingCount = 0;

        for (const node of nodesToScan) {
            const slots = this.extractModelSlots(node, localModels);
            totalChecked += slots.length;

            for (const slot of slots) {
                const availableList = slot.availableList || [];
                const currentValue = slot.currentValue;

                if (availableList.length === 0) {
                    missingCount++;
                    itemsToResolve.push({
                        ...slot,
                        isAlreadyValid: false,
                        recommendations: [],
                        selectedMatch: SKIP_VALUE,
                        topScore: 0,
                        isPerfectMatch: false
                    });
                    continue;
                }

                const isAlreadyValid = availableList.includes(currentValue);

                if (isAlreadyValid) {
                    alreadyMatchedCount++;
                    // 정상이면 에러 플래그 정리
                    node.has_errors = false;
                    delete node.boxcolor;

                    // 현재 모델 + 다른 대체 추천 목록 구성
                    const otherCands = availableList.filter(c => c !== currentValue);
                    const otherScored = otherCands.map(cand => ({
                        file: cand,
                        score: this.calculateSimilarity(currentValue, cand),
                        isCurrent: false
                    })).sort((a, b) => b.score - a.score);

                    const recommendations = [
                        { file: currentValue, score: 100, isCurrent: true },
                        ...otherScored.slice(0, 3)
                    ];

                    itemsToResolve.push({
                        ...slot,
                        isAlreadyValid: true,
                        recommendations,
                        selectedMatch: currentValue,
                        topScore: 100,
                        isPerfectMatch: true
                    });
                } else {
                    missingCount++;

                    // 유사도 매칭 수행
                    const scoredList = availableList.map(cand => ({
                        file: cand,
                        score: this.calculateSimilarity(currentValue, cand),
                        isCurrent: false
                    })).sort((a, b) => b.score - a.score);

                    const topMatch = scoredList[0];

                    itemsToResolve.push({
                        ...slot,
                        isAlreadyValid: false,
                        recommendations: scoredList.slice(0, 4),
                        selectedMatch: topMatch ? topMatch.file : (availableList[0] || ""),
                        topScore: topMatch ? topMatch.score : 0,
                        isPerfectMatch: topMatch && topMatch.score === 100
                    });
                }
            }
        }

        if (totalChecked === 0 || itemsToResolve.length === 0) {
            this.showToast("캔버스에 감지 가능한 모델 또는 LoRA 슬롯이 없습니다.", "warning");
            return;
        }

        // 항상 모달 창을 띄워 사용자에게 모델 확인 및 재장착 제어권을 제공합니다.
        this.showResolverModal(itemsToResolve, alreadyMatchedCount, missingCount);
    }

    /**
     * 모델 파일 목록(상대 경로 배열)을 계층적 트리 객체로 변환
     */
    static buildTreeStructure(fileList) {
        const root = {
            name: "root",
            type: "folder",
            path: "",
            children: {},
            files: [],
            totalCount: 0
        };

        for (const fullPath of fileList) {
            if (!fullPath || typeof fullPath !== "string") continue;
            const normalized = fullPath.replace(/\\/g, "/");
            const parts = normalized.split("/");
            const fileName = parts.pop();

            let currentFolder = root;
            let currentPathAcc = "";

            for (const folderName of parts) {
                currentPathAcc = currentPathAcc ? `${currentPathAcc}/${folderName}` : folderName;
                if (!currentFolder.children[folderName]) {
                    currentFolder.children[folderName] = {
                        name: folderName,
                        type: "folder",
                        path: currentPathAcc,
                        children: {},
                        files: [],
                        totalCount: 0
                    };
                }
                currentFolder = currentFolder.children[folderName];
            }

            currentFolder.files.push({
                name: fileName,
                fullPath: fullPath,
                type: "file"
            });
        }

        // 각 폴더 하위의 총 파일 개수 재귀 계산
        const calcCount = (folder) => {
            let count = folder.files.length;
            for (const childName in folder.children) {
                count += calcCount(folder.children[childName]);
            }
            folder.totalCount = count;
            return count;
        };
        calcCount(root);

        return root;
    }

    /**
     * 폴더 트리 DOM 노드 재귀 생성 (Windows 탐색기 스타일)
     */
    static renderTreeDOM(folderNode, selectedFile, onSelectFile, depth = 0) {
        const fragment = document.createDocumentFragment();

        // 1. 하위 폴더들 렌더링 (알파벳/가나다 순)
        const sortedFolders = Object.values(folderNode.children).sort((a, b) => a.name.localeCompare(b.name));
        for (const childFolder of sortedFolders) {
            const folderWrapper = document.createElement("div");
            folderWrapper.className = "tree-folder-wrapper";

            const folderRow = document.createElement("div");
            folderRow.className = "tree-folder-row";
            folderRow.innerHTML = `
                <span class="tree-arrow">▶</span>
                <span class="tree-folder-icon">📁</span>
                <span class="tree-folder-name" title="${escapeHtml(childFolder.path)}">${escapeHtml(childFolder.name)}</span>
                <span class="tree-count-badge">${childFolder.totalCount}</span>
            `;

            const folderContent = document.createElement("div");
            folderContent.className = "tree-folder-content";

            // 폴더 내부 자식들 재귀 생성
            const subContent = this.renderTreeDOM(childFolder, selectedFile, onSelectFile, depth + 1);
            folderContent.appendChild(subContent);

            // 선택된 파일이 이 폴더 하위에 위치하는지 확인 -> 기본 자동 펼침
            const normalizedSelected = selectedFile ? selectedFile.replace(/\\/g, "/").toLowerCase() : "";
            const isSelectedInside = normalizedSelected.startsWith(childFolder.path.toLowerCase() + "/");
            if (isSelectedInside) {
                folderRow.classList.add("expanded");
                folderContent.classList.add("expanded");
                folderRow.querySelector(".tree-folder-icon").textContent = "📂";
            }

            // 폴더 클릭 시 토글 이벤트
            folderRow.addEventListener("click", (e) => {
                e.stopPropagation();
                const isExpanded = folderRow.classList.toggle("expanded");
                folderContent.classList.toggle("expanded", isExpanded);
                folderRow.querySelector(".tree-folder-icon").textContent = isExpanded ? "📂" : "📁";
            });

            folderWrapper.appendChild(folderRow);
            folderWrapper.appendChild(folderContent);
            fragment.appendChild(folderWrapper);
        }

        // 2. 현재 폴더 직속 파일들 렌더링 (알파벳/가나다 순)
        const sortedFiles = folderNode.files.slice().sort((a, b) => a.name.localeCompare(b.name));
        for (const file of sortedFiles) {
            const fileRow = document.createElement("div");
            const normalizedFile = file.fullPath.replace(/\\/g, "/").toLowerCase();
            const normalizedSelected = selectedFile ? selectedFile.replace(/\\/g, "/").toLowerCase() : "";
            const isSelected = normalizedFile === normalizedSelected;

            fileRow.className = `tree-file-row ${isSelected ? 'selected' : ''}`;
            fileRow.dataset.file = file.fullPath;
            fileRow.dataset.search = file.fullPath.toLowerCase();

            const extMatch = file.name.match(/\.([a-zA-Z0-9]+)$/);
            const ext = extMatch ? extMatch[1] : "";

            fileRow.innerHTML = `
                <span class="tree-file-icon">📄</span>
                <span class="tree-file-name" title="${escapeHtml(file.fullPath)}">${escapeHtml(file.name)}</span>
                ${ext ? `<span class="tree-file-badge">${ext}</span>` : ''}
            `;

            fileRow.addEventListener("click", (e) => {
                e.stopPropagation();
                onSelectFile(file.fullPath);
            });

            fragment.appendChild(fileRow);
        }

        return fragment;
    }

    /**
     * 스마트 모델 매핑 모달 UI 렌더링
     */
    static showResolverModal(items, alreadyMatchedCount, missingCount = 0) {
        // 기존 열린 모달 제거
        const existing = document.querySelector(".auto-assign-overlay");
        if (existing) existing.remove();

        const overlay = document.createElement("div");
        overlay.className = "auto-assign-overlay";

        const closeOverlay = () => {
            document.removeEventListener("keydown", handleKeyDown, true);
            overlay.remove();
        };

        const handleKeyDown = (e) => {
            if (e.key === "Escape") {
                closeOverlay();
                e.stopPropagation();
                e.preventDefault();
            }
        };
        document.addEventListener("keydown", handleKeyDown, true);

        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) closeOverlay();
        });

        const modal = document.createElement("div");
        modal.className = "auto-assign-modal";

        const isKo = BadaI18n.lang === "ko";

        // 1. 헤더
        const header = document.createElement("div");
        header.className = "auto-assign-header";
        header.innerHTML = `
            <div class="auto-assign-title">
                <span class="icon">⚡</span>
                <span>${isKo ? "모델 / LoRA 스마트 자동 장착 &amp; 폴더 탐색기" : "Smart Model &amp; LoRA Assigner &amp; Folder Browser"}</span>
            </div>
            <button class="auto-assign-close-btn" title="${isKo ? '닫기' : 'Close'}">✕</button>
        `;
        header.querySelector(".auto-assign-close-btn").onclick = () => closeOverlay();

        // 2. 요약 바
        const summary = document.createElement("div");
        summary.className = "auto-assign-summary";
        
        let summaryBadgeHtml = "";
        let summaryText = "";
        if (missingCount > 0) {
            summaryText = isKo 
                ? "누락된 모델을 내 PC 폴더 탐색기로 확인 및 장착하거나, 원하는 모델로 즉시 변경할 수 있습니다."
                : "Review and assign missing models with local PC folder explorer, or switch to your desired model.";
            summaryBadgeHtml = isKo
                ? `<span class="badge" style="background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.4);">⚠️ ${missingCount}개 누락됨 / 총 ${items.length}개 노드</span>`
                : `<span class="badge" style="background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.4);">⚠️ ${missingCount} Missing / Total ${items.length} Nodes</span>`;
        } else {
            summaryText = isKo
                ? "모든 모델이 정상 장착되어 있습니다. 폴더 트리에서 모델을 확인하거나 다른 모델로 교체할 수 있습니다."
                : "All models are properly loaded. You can browse or replace models from the folder tree.";
            summaryBadgeHtml = isKo
                ? `<span class="badge" style="background: rgba(34, 197, 94, 0.2); color: #86efac; border: 1px solid rgba(34, 197, 94, 0.4);">✅ 전체 ${items.length}개 정상 장착됨</span>`
                : `<span class="badge" style="background: rgba(34, 197, 94, 0.2); color: #86efac; border: 1px solid rgba(34, 197, 94, 0.4);">✅ All ${items.length} Models Loaded</span>`;
        }

        summary.innerHTML = `
            <span>${summaryText}</span>
            ${summaryBadgeHtml}
        `;

        // 3. 바디 리스트
        const body = document.createElement("div");
        body.className = "auto-assign-body";

        items.forEach((item, index) => {
            const card = document.createElement("div");
            card.className = "auto-assign-item-card";

            const nodeTitle = item.node.title || item.node.type || `Node #${item.node.id}`;
            const cleanQuery = this.getCleanSearchQuery(item.currentValue);
            
            // 검색 링크 생성
            const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(cleanQuery + " safetensors")}`;
            const hfUrl = `https://huggingface.co/models?search=${encodeURIComponent(cleanQuery)}`;
            const civitaiUrl = `https://civitai.com/search/models?query=${encodeURIComponent(cleanQuery)}`;

            // 추천 버튼 렌더링
            let recsListHtml = "";
            if (item.recommendations && item.recommendations.length > 0) {
                recsListHtml = item.recommendations.map(r => {
                    const badgeClass = r.score >= 80 ? "high" : (r.score >= 40 ? "medium" : "low");
                    const isSelected = r.file === item.selectedMatch;
                    const labelText = r.isCurrent ? (isKo ? "현재장착" : "Current") : `${r.score}%`;
                    return `
                        <button type="button" class="auto-assign-rec-btn ${isSelected ? 'selected' : ''}" data-file="${escapeHtml(r.file)}">
                            <span class="auto-assign-match-badge ${badgeClass}">${labelText}</span>
                            <span>${escapeHtml(r.file)}</span>
                        </button>
                    `;
                }).join("");
            }

            // 건너뛰기 버튼 추가
            const isSkipSelected = item.selectedMatch === SKIP_VALUE;
            const skipBtnHtml = `
                <button type="button" class="auto-assign-skip-btn ${isSkipSelected ? 'selected' : ''}" data-file="${SKIP_VALUE}">
                    <span>${isKo ? "⏭️ 적용 안함 (건너뛰기)" : "⏭️ Skip / Keep Current"}</span>
                </button>
            `;

            const origLabel = item.isAlreadyValid 
                ? (isKo ? "✅ 현재 장착됨:" : "✅ Currently Loaded:")
                : (isKo ? "❌ 누락된 원본:" : "❌ Missing Original:");
            const origClass = item.isAlreadyValid ? "valid" : "missing";
            const statusBadgeText = item.isAlreadyValid ? (isKo ? "✅ 정상 장착" : "✅ Valid") : (isKo ? "⚠️ 누락됨" : "⚠️ Missing");
            const statusBadgeClass = item.isAlreadyValid ? "ok" : "warn";
            const recsTitleText = item.isAlreadyValid 
                ? (isKo ? "💡 빠른 추천 후보 (유사도순):" : "💡 Smart Recommendations (by similarity):")
                : (isKo ? "💡 추천 후보 (유사도순):" : "💡 Suggested Matches (by similarity):");

            card.innerHTML = `
                <div class="auto-assign-item-header">
                    <div class="auto-assign-node-info">
                        <span>#${item.node.id} ${escapeHtml(nodeTitle)} <span style="color: #a5b4fc; font-size: 0.95rem; font-weight: 600; margin-left: 6px;">[${escapeHtml(item.slotLabel || "Model")}]</span></span>
                        <span class="auto-assign-cat-badge">${escapeHtml(item.category)}</span>
                        <span class="auto-assign-status-badge ${statusBadgeClass}">${statusBadgeText}</span>
                    </div>
                </div>

                <div class="auto-assign-orig-wrapper">
                    <div class="auto-assign-orig-file ${origClass}">
                        <div class="auto-assign-orig-file-text">
                            <span>${origLabel}</span> ${escapeHtml(item.currentValue)}
                        </div>
                        <div class="auto-assign-search-group">
                            <a href="${googleUrl}" target="_blank" rel="noopener noreferrer" class="auto-assign-search-btn google" title="${isKo ? '구글에서 스마트 검색' : 'Smart Search on Google'}">
                                <span>${isKo ? '🔍 구글 검색' : '🔍 Google'}</span>
                            </a>
                            <a href="${hfUrl}" target="_blank" rel="noopener noreferrer" class="auto-assign-search-btn hf" title="${isKo ? 'HuggingFace에서 모델 검색' : 'Search model on HuggingFace'}">
                                <span>🤗 HuggingFace</span>
                            </a>
                            <a href="${civitaiUrl}" target="_blank" rel="noopener noreferrer" class="auto-assign-search-btn civitai" title="${isKo ? 'Civitai에서 모델 검색' : 'Search model on Civitai'}">
                                <span>💖 Civitai</span>
                            </a>
                        </div>
                    </div>
                </div>

                <div>
                    <div class="auto-assign-recs-title">
                        <span>${recsTitleText}</span>
                    </div>
                    <div class="auto-assign-recs-list" id="recs-${index}">
                        ${recsListHtml}
                        ${skipBtnHtml}
                    </div>
                </div>

                <!-- 🌲 윈도우 탐색기 스타일 폴더 트리 탐색기 -->
                <div class="auto-assign-tree-section">
                    <div class="auto-assign-tree-header-row">
                        <div class="auto-assign-tree-title">
                            <span class="icon">📁</span>
                            <span>[${escapeHtml(item.category)}] ${isKo ? "보유 모델 폴더 탐색기 (클릭하여 펼침/선택)" : "Model Folder Explorer (Click to expand/select)"}</span>
                        </div>
                        <div class="auto-assign-tree-toolbar">
                            <div class="auto-assign-tree-search-wrapper">
                                <span class="search-icon">🔍</span>
                                <input type="text" class="auto-assign-tree-search-input" placeholder="${isKo ? '파일명 / 하위 폴더 검색...' : 'Search file / subfolder...'}" />
                            </div>
                            <button type="button" class="auto-assign-tree-btn btn-expand-all">${isKo ? '📂 모두 펼치기' : '📂 Expand All'}</button>
                            <button type="button" class="auto-assign-tree-btn btn-collapse-all">${isKo ? '📁 모두 접기' : '📁 Collapse All'}</button>
                        </div>
                    </div>

                    <div class="auto-assign-tree-container" id="tree-container-${index}">
                    </div>

                    <div class="auto-assign-selected-bar">
                        <span class="selected-label">${isKo ? "👉 최종 선택된 모델:" : "👉 Selected Model:"}</span>
                        <span class="selected-value-display" id="selected-display-${index}">${escapeHtml(item.selectedMatch === SKIP_VALUE ? (isKo ? "⏭️ [적용 안함] 기존 모델 유지" : "⏭️ [Skip] Keep original model") : (item.selectedMatch || (isKo ? "(선택 안됨)" : "(None selected)")))}</span>
                    </div>
                </div>
            `;

            // 트리 DOM 생성 및 삽입
            const treeContainer = card.querySelector(`#tree-container-${index}`);
            const selectedDisplay = card.querySelector(`#selected-display-${index}`);
            const searchInput = card.querySelector(".auto-assign-tree-search-input");
            const btnExpandAll = card.querySelector(".btn-expand-all");
            const btnCollapseAll = card.querySelector(".btn-collapse-all");

            // 모델 트리 구조 생성
            const treeData = this.buildTreeStructure(item.availableList);

            // 선택 업데이트 공통 핸들러
            const updateSelection = (chosenFile) => {
                item.selectedMatch = chosenFile;

                if (chosenFile === SKIP_VALUE) {
                    selectedDisplay.textContent = isKo ? "⏭️ [적용 안함] 변경하지 않고 원본 유지" : "⏭️ [Skip] Keep original model";
                    selectedDisplay.style.color = "#94a3b8";
                } else {
                    selectedDisplay.textContent = chosenFile;
                    selectedDisplay.style.color = "#38bdf8";
                }

                // 상단 추천 칩 동기화
                const allRecBtns = card.querySelectorAll(".auto-assign-rec-btn, .auto-assign-skip-btn");
                allRecBtns.forEach(b => {
                    b.classList.toggle("selected", b.dataset.file === chosenFile);
                });

                // 트리 내 파일 하이라이트 동기화
                const allFileRows = treeContainer.querySelectorAll(".tree-file-row");
                allFileRows.forEach(row => {
                    const isSel = row.dataset.file === chosenFile;
                    row.classList.toggle("selected", isSel);
                    if (isSel) {
                        // 해당 파일의 상위 부모 폴더들 모두 펼치기
                        let parent = row.parentElement;
                        while (parent && parent !== treeContainer) {
                            if (parent.classList.contains("tree-folder-content")) {
                                parent.classList.add("expanded");
                                const prev = parent.previousElementSibling;
                                if (prev && prev.classList.contains("tree-folder-row")) {
                                    prev.classList.add("expanded");
                                    const icon = prev.querySelector(".tree-folder-icon");
                                    if (icon) icon.textContent = "📂";
                                }
                            }
                            parent = parent.parentElement;
                        }
                        // 스크롤 포커스 (중앙 정렬)
                        row.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
                    }
                });

                card.classList.toggle("skipped", chosenFile === SKIP_VALUE);
            };

            // 트리 DOM 렌더링
            const treeFragment = this.renderTreeDOM(treeData, item.selectedMatch, (clickedFile) => {
                updateSelection(clickedFile);
            });
            treeContainer.appendChild(treeFragment);

            // 상단 추천 버튼 이벤트 연결
            const allRecBtns = card.querySelectorAll(".auto-assign-rec-btn, .auto-assign-skip-btn");
            allRecBtns.forEach(btn => {
                btn.addEventListener("click", () => {
                    updateSelection(btn.dataset.file);
                });
            });

            // 모두 펼치기 버튼
            btnExpandAll.addEventListener("click", () => {
                treeContainer.querySelectorAll(".tree-folder-row").forEach(r => {
                    r.classList.add("expanded");
                    const icon = r.querySelector(".tree-folder-icon");
                    if (icon) icon.textContent = "📂";
                });
                treeContainer.querySelectorAll(".tree-folder-content").forEach(c => c.classList.add("expanded"));
            });

            // 모두 접기 버튼
            btnCollapseAll.addEventListener("click", () => {
                treeContainer.querySelectorAll(".tree-folder-row").forEach(r => {
                    r.classList.remove("expanded");
                    const icon = r.querySelector(".tree-folder-icon");
                    if (icon) icon.textContent = "📁";
                });
                treeContainer.querySelectorAll(".tree-folder-content").forEach(c => c.classList.remove("expanded"));
            });

            // 실시간 파일/폴더 검색 필터링
            searchInput.addEventListener("input", (e) => {
                const query = (e.target.value || "").trim().toLowerCase();
                const allWrappers = treeContainer.querySelectorAll(".tree-folder-wrapper");
                const allFiles = treeContainer.querySelectorAll(".tree-file-row");

                if (!query) {
                    // 검색어 비움: 모든 항목 표시
                    allFiles.forEach(f => f.style.display = "flex");
                    allWrappers.forEach(w => w.style.display = "block");
                    return;
                }

                // 파일 검색
                allFiles.forEach(fileRow => {
                    const match = fileRow.dataset.search.includes(query);
                    fileRow.style.display = match ? "flex" : "none";
                    if (match) {
                        // 일치하는 파일의 상위 폴더는 펼치기
                        let parent = fileRow.parentElement;
                        while (parent && parent !== treeContainer) {
                            if (parent.classList.contains("tree-folder-content")) {
                                parent.classList.add("expanded");
                                const prev = parent.previousElementSibling;
                                if (prev && prev.classList.contains("tree-folder-row")) {
                                    prev.classList.add("expanded");
                                    const icon = prev.querySelector(".tree-folder-icon");
                                    if (icon) icon.textContent = "📂";
                                }
                            }
                            parent = parent.parentElement;
                        }
                    }
                });

                // 폴더 내에 보이는 파일이 있는지 확인하여 빈 폴더 숨기기
                allWrappers.forEach(wrapper => {
                    const visibleChildren = wrapper.querySelectorAll(".tree-file-row:not([style*='display: none'])");
                    wrapper.style.display = visibleChildren.length > 0 ? "block" : "none";
                });
            });

            if (isSkipSelected) {
                card.classList.add("skipped");
            }

            body.appendChild(card);
        });

        // 4. 푸터
        const footer = document.createElement("div");
        footer.className = "auto-assign-footer";
        footer.innerHTML = `
            <div class="auto-assign-footer-left">
                <span>${isKo ? "※ 건너뛴 노드는 기존 모델명이 그대로 유지됩니다." : "※ Skipped nodes will retain their original model names."}</span>
            </div>
            <div class="auto-assign-footer-right">
                <button class="auto-assign-btn auto-assign-btn-secondary" id="btn-cancel">${isKo ? "닫기" : "Close"}</button>
                <button class="auto-assign-btn auto-assign-btn-primary" id="btn-apply">${isKo ? "⚡ 선택한 모델 장착 / 확인" : "⚡ Apply Selected Models"}</button>
            </div>
        `;

        footer.querySelector("#btn-cancel").onclick = () => closeOverlay();
        footer.querySelector("#btn-apply").onclick = () => {
            let appliedCount = 0;
            let skippedCount = 0;
            const modifiedNodes = [];

            for (const item of items) {
                if (item.selectedMatch && item.selectedMatch !== SKIP_VALUE) {
                    if (typeof item.applyValue === "function") {
                        item.applyValue(item.selectedMatch);
                    } else if (item.widget) {
                        const oldValue = item.widget.value;
                        item.widget.value = item.selectedMatch;
                        if (item.widget.callback) {
                            item.widget.callback(item.selectedMatch, app.canvas, item.node, app.canvas.graph_mouse, {});
                        }
                        if (item.node.onWidgetChanged) {
                            item.node.onWidgetChanged(item.widget.name, item.selectedMatch, oldValue, item.widget);
                        }
                    }
                    if (!modifiedNodes.includes(item.node)) {
                        modifiedNodes.push(item.node);
                    }
                    appliedCount++;
                } else {
                    skippedCount++;
                }
            }
            
            // 에러 상태 클리어 및 캔버스 새로고침
            if (modifiedNodes.length > 0) {
                this.clearNodeErrorsAndRefresh(modifiedNodes);
            }

            closeOverlay();

            if (appliedCount > 0 && skippedCount > 0) {
                this.showToast(`🎉 ${appliedCount}개 모델/LoRA 슬롯 장착 완료 (⏭️ ${skippedCount}개 건너뜀)`, "success");
            } else if (appliedCount > 0) {
                this.showToast(`🎉 ${appliedCount}개 모델/LoRA 슬롯 장착 및 확인 완료!`, "success");
            } else {
                this.showToast(`⏭️ ${skippedCount}개 슬롯의 모델 변경을 건너뛰었습니다.`, "info");
            }
        };

        modal.appendChild(header);
        modal.appendChild(summary);
        modal.appendChild(body);
        modal.appendChild(footer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        requestAnimationFrame(() => {
            overlay.classList.add("visible");
            // 🌟 모달이 화면에 열리는 즉시 각 트리의 선택된 파일이 중앙에 보이도록 자동 스크롤
            setTimeout(() => {
                overlay.querySelectorAll(".auto-assign-tree-container").forEach(container => {
                    const selectedRow = container.querySelector(".tree-file-row.selected");
                    if (selectedRow) {
                        selectedRow.scrollIntoView({ block: "center", inline: "nearest" });
                    }
                });
            }, 80);
        });
    }

    /**
     * 토스트 알림창 표시
     */
    static showToast(message, type = "info") {
        let container = document.querySelector(".auto-assign-toast-container");
        if (!container) {
            container = document.createElement("div");
            container.className = "auto-assign-toast-container";
            document.body.appendChild(container);
        }

        const toast = document.createElement("div");
        toast.className = `auto-assign-toast ${type}`;
        
        let icon = "⚡";
        if (type === "success") icon = "✅";
        if (type === "warning") icon = "⚠️";
        if (type === "error") icon = "❌";
        if (type === "info") icon = "ℹ️";

        toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transform = "translateY(10px)";
            toast.style.transition = "all 0.3s ease";
            setTimeout(() => toast.remove(), 300);
        }, 3200);
    }
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ==========================================
// 🚀 ComfyUI Extension 등록 및 메뉴 최하단 고정
// ==========================================
app.registerExtension({
    name: "BadaUtils.AutoModelAssigner",

    async setup() {
        if (window.__BADA_AUTO_ASSIGNER_LOADED__) {
            console.log("[AutoModelAssigner] AutoModelAssigner already active. Skipping duplicate setup.");
            return;
        }
        window.__BADA_AUTO_ASSIGNER_LOADED__ = true;

        console.log("[AutoModelAssigner] Initializing Context Menus at absolute bottom position...");

        // 1. 캔버스 빈 공간 우클릭 메뉴 훅
        const origGetCanvasMenuOptions = LGraphCanvas.prototype.getCanvasMenuOptions;
        LGraphCanvas.prototype.getCanvasMenuOptions = function () {
            const options = origGetCanvasMenuOptions ? origGetCanvasMenuOptions.apply(this, arguments) : [];
            
            options.push(null); // 구분선
            options.push({
                content: BadaI18n.t("ctx_auto_assign_all"),
                isAutoModelAssigner: true,
                callback: () => {
                    AutoModelAssigner.runAutoAssign(null);
                }
            });

            return options;
        };

        // 2. 개별 노드 우클릭 메뉴 훅
        const origGetNodeMenuOptions = LGraphCanvas.prototype.getNodeMenuOptions;
        LGraphCanvas.prototype.getNodeMenuOptions = function (node) {
            const options = origGetNodeMenuOptions ? origGetNodeMenuOptions.apply(this, arguments) : [];

            // 해당 노드가 모델 관련 위젯을 가지고 있는 경우에만 메뉴 추가
            if (AutoModelAssigner.isModelNode(node)) {
                options.push(null); // 구분선
                options.push({
                    content: BadaI18n.t("ctx_auto_assign_node"),
                    isAutoModelAssigner: true,
                    callback: () => {
                        AutoModelAssigner.runAutoAssign(node);
                    }
                });
            }

            return options;
        };

        // 3. 🛡️ LiteGraph.ContextMenu 생성자 가로채기 (다른 노드들이 덧붙인 뒤에도 항상 무조건 맨 아래로 이동)
        if (typeof LiteGraph !== "undefined" && LiteGraph.ContextMenu) {
            const origContextMenu = LiteGraph.ContextMenu;
            LiteGraph.ContextMenu = function (values, options) {
                if (Array.isArray(values)) {
                    // 우리 메뉴 항목 검색 (플래그 또는 텍스트 기반)
                    const targetIndex = values.findIndex(v => 
                        v && (
                            v.isAutoModelAssigner === true || 
                            (typeof v.content === "string" && (
                                v.content.includes("자동 장착") || 
                                v.content.includes("Auto-Assign")
                            ))
                        )
                    );

                    if (targetIndex !== -1) {
                        const [targetItem] = values.splice(targetIndex, 1);
                        
                        // 타겟 바로 앞의 null(구분선)이 고립되어 연속으로 남지 않도록 정리
                        if (targetIndex > 0 && values[targetIndex - 1] === null) {
                            if (targetIndex < values.length && values[targetIndex] === null) {
                                values.splice(targetIndex, 1);
                            }
                        }

                        // 맨 끝에 있는 연속 null 제거
                        while (values.length > 0 && values[values.length - 1] === null) {
                            values.pop();
                        }

                        // 항상 맨 아래에 구분선과 함께 추가!
                        values.push(null);
                        values.push(targetItem);
                    }
                }
                return new origContextMenu(values, options);
            };
            LiteGraph.ContextMenu.prototype = origContextMenu.prototype;
        }
    }
});

window.AutoModelAssigner = AutoModelAssigner;
export { AutoModelAssigner };
export default AutoModelAssigner;
