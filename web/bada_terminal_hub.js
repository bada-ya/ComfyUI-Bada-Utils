/**
 * ⚓ ComfyUI-Bada-Utils: Master Terminal Hub & Command Studio
 * ComfyUI 내부에서 Git 커스텀 노드 클론, 패키지 설치, 터미널 명령을
 * 실시간 스트리밍 콘솔과 함께 원클릭으로 실행하는 개발자/관리자 허브 (노드 + 사이드바 탭)
 */

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// Dynamically inject CSS stylesheet
(function loadStylesheet() {
    const cssUrl = new URL("./bada_terminal_hub.css", import.meta.url).href;
    if (!document.querySelector(`link[href="${cssUrl}"]`)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.type = "text/css";
        link.href = cssUrl;
        document.head.appendChild(link);
    }
})();

// Command Preset Definitions
const COMMAND_PRESETS = [
    {
        id: "git_clone",
        name: "🚀 git clone <URL>",
        template: "git clone {ARG}",
        placeholder: "Enter GitHub URL (e.g. https://github.com/user/repo.git)",
        defaultTarget: "custom_nodes_root",
        needArg: true
    },
    {
        id: "git_pull",
        name: "🔄 git pull (Update Node)",
        template: "git pull",
        placeholder: "No arguments needed (runs git pull in selected directory)",
        defaultTarget: "selected_node",
        needArg: false
    },
    {
        id: "git_status",
        name: "📊 git status (Check Status)",
        template: "git status",
        placeholder: "No arguments needed (checks status)",
        defaultTarget: "selected_node",
        needArg: false
    },
    {
        id: "git_log",
        name: "📜 git log -n 5 (Recent Commits)",
        template: "git log -n 5 --oneline",
        placeholder: "No arguments needed",
        defaultTarget: "selected_node",
        needArg: false
    },
    {
        id: "pip_req",
        name: "📦 pip install -r requirements.txt",
        template: "python -m pip install -r requirements.txt",
        placeholder: "No arguments needed (installs requirements.txt if present)",
        defaultTarget: "selected_node",
        needArg: false
    },
    {
        id: "pip_pkg",
        name: "⚡ pip install <Package>",
        template: "python -m pip install {ARG}",
        placeholder: "Enter package name(s) (e.g. opencv-python onnxruntime)",
        defaultTarget: "comfyui_root",
        needArg: true
    },
    {
        id: "custom",
        name: "🛠️ Custom Command (Direct Shell)",
        template: "{ARG}",
        placeholder: "Enter any custom command (e.g. dir, git branch -a, python test.py)",
        defaultTarget: "custom_nodes_root",
        needArg: true
    }
];

/**
 * Creates the complete Terminal Hub UI Component (Reusable for Node Widget and Sidebar Tab)
 */
function createTerminalHubComponent({ isSidebar = false, node = null } = {}) {
    let envData = null;
    let currentPath = "";
    let currentPreset = COMMAND_PRESETS[0];
    let argText = "";
    let isRunning = false;
    let currentTaskId = "";
    let cliHistory = [];
    let historyIndex = -1;

    // Root Container
    const root = document.createElement("div");
    root.className = "bada-terminal-root";
    if (isSidebar) {
        root.style.border = "none";
        root.style.borderRadius = "0";
        root.style.boxShadow = "none";
        root.style.height = "100%";
        root.style.maxHeight = "100%";
    }

    // 1. Header
    const header = document.createElement("div");
    header.className = "bada-terminal-header";
    header.innerHTML = `
        <div class="bada-terminal-title">
            <span>⚓</span> Bada Terminal Hub
        </div>
        <div class="bada-terminal-env-badge" id="badaEnvBadge">Detecting...</div>
    `;
    root.appendChild(header);

    // 2. Controls Section
    const controls = document.createElement("div");
    controls.className = "bada-terminal-controls";

    // Directory options data store
    let allDirectoryOptions = [];
    let activeHighlightIndex = -1;
    let filteredItems = [];

    // Row 1: Target Directory with Searchable Combobox
    const pathField = document.createElement("div");
    pathField.className = "bada-term-field";
    pathField.innerHTML = `<div class="bada-term-label"><span>Target Directory (Path)</span></div>`;
    const pathRow = document.createElement("div");
    pathRow.className = "bada-term-input-row";

    // Searchable Combobox Wrapper
    const searchWrap = document.createElement("div");
    searchWrap.className = "bada-search-select-wrap";

    const searchControl = document.createElement("div");
    searchControl.className = "bada-search-select-control";
    searchControl.innerHTML = `
        <span class="bada-search-icon">📁</span>
        <input type="text" class="bada-search-select-input" placeholder="Search or select directory..." spellcheck="false" autocomplete="off" />
        <span class="bada-search-arrow">▼</span>
    `;
    const searchInput = searchControl.querySelector(".bada-search-select-input");
    const searchArrow = searchControl.querySelector(".bada-search-arrow");

    const dropdownMenu = document.createElement("div");
    dropdownMenu.className = "bada-search-dropdown-menu";

    searchWrap.appendChild(searchControl);
    searchWrap.appendChild(dropdownMenu);

    function getSelectedLabel() {
        const found = allDirectoryOptions.find(o => o.path === currentPath);
        return found ? found.label : (currentPath ? currentPath.split("/").pop() : "");
    }

    function selectDirectory(item) {
        currentPath = item.path;
        searchInput.value = item.label;
        searchWrap.classList.remove("open");
        updatePreview();
    }

    function updateHighlightedItem() {
        const itemEls = dropdownMenu.querySelectorAll(".bada-search-item");
        itemEls.forEach((el, idx) => {
            if (idx === activeHighlightIndex) {
                el.classList.add("highlighted");
                el.scrollIntoView({ block: "nearest" });
            } else {
                el.classList.remove("highlighted");
            }
        });
    }

    function renderDropdownList(query = "") {
        dropdownMenu.innerHTML = "";
        const q = (query || "").trim().toLowerCase();
        filteredItems = [];

        const groups = {};
        allDirectoryOptions.forEach(opt => {
            const matchLabel = opt.label.toLowerCase().includes(q);
            const matchPath = opt.path.toLowerCase().includes(q);
            const matchName = opt.name ? opt.name.toLowerCase().includes(q) : false;
            if (!q || matchLabel || matchPath || matchName) {
                if (!groups[opt.group]) groups[opt.group] = [];
                groups[opt.group].push(opt);
                filteredItems.push(opt);
            }
        });

        if (filteredItems.length === 0) {
            dropdownMenu.innerHTML = `<div class="bada-search-empty">No matching directories for "${query}"</div>`;
            activeHighlightIndex = -1;
            return;
        }

        let itemIdx = 0;
        for (const [groupName, items] of Object.entries(groups)) {
            const grpTitle = document.createElement("div");
            grpTitle.className = "bada-search-group-title";
            grpTitle.textContent = groupName;
            dropdownMenu.appendChild(grpTitle);

            items.forEach(item => {
                const itemEl = document.createElement("div");
                itemEl.className = "bada-search-item";
                if (item.path === currentPath) itemEl.classList.add("selected");
                itemEl.dataset.index = itemIdx;

                if (q) {
                    const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, "gi");
                    itemEl.innerHTML = item.label.replace(regex, `<span class="bada-search-match">$1</span>`);
                } else {
                    itemEl.textContent = item.label;
                }

                itemEl.addEventListener("click", () => {
                    selectDirectory(item);
                });

                dropdownMenu.appendChild(itemEl);
                itemIdx++;
            });
        }

        activeHighlightIndex = 0;
        updateHighlightedItem();
    }

    searchInput.addEventListener("focus", () => {
        searchWrap.classList.add("open");
        renderDropdownList(searchInput.value === getSelectedLabel() ? "" : searchInput.value);
        searchInput.select();
    });

    searchInput.addEventListener("click", () => {
        if (!searchWrap.classList.contains("open")) {
            searchWrap.classList.add("open");
            renderDropdownList("");
        }
    });

    searchArrow.addEventListener("click", (e) => {
        e.stopPropagation();
        if (searchWrap.classList.contains("open")) {
            searchWrap.classList.remove("open");
        } else {
            searchWrap.classList.add("open");
            renderDropdownList("");
            searchInput.focus();
        }
    });

    // Real-time filtering on typing
    searchInput.addEventListener("input", () => {
        searchWrap.classList.add("open");
        renderDropdownList(searchInput.value);
    });

    // Keyboard navigation
    searchInput.addEventListener("keydown", (e) => {
        if (!searchWrap.classList.contains("open")) {
            if (e.key === "ArrowDown" || e.key === "Enter") {
                searchWrap.classList.add("open");
                renderDropdownList("");
                return;
            }
        }

        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (filteredItems.length > 0) {
                activeHighlightIndex = (activeHighlightIndex + 1) % filteredItems.length;
                updateHighlightedItem();
            }
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (filteredItems.length > 0) {
                activeHighlightIndex = (activeHighlightIndex - 1 + filteredItems.length) % filteredItems.length;
                updateHighlightedItem();
            }
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (filteredItems.length > 0 && activeHighlightIndex >= 0 && activeHighlightIndex < filteredItems.length) {
                selectDirectory(filteredItems[activeHighlightIndex]);
                searchInput.blur();
            }
        } else if (e.key === "Escape") {
            searchWrap.classList.remove("open");
            searchInput.value = getSelectedLabel();
            searchInput.blur();
        }
    });

    document.addEventListener("click", (e) => {
        if (!searchWrap.contains(e.target)) {
            if (searchWrap.classList.contains("open")) {
                searchWrap.classList.remove("open");
                searchInput.value = getSelectedLabel();
            }
        }
    });

    const treeBtn = document.createElement("button");
    treeBtn.className = "bada-term-btn-icon";
    treeBtn.innerHTML = `<span>📂</span> Tree`;
    treeBtn.title = "Explore folder tree (Explorer)";

    const openCmdBtn = document.createElement("button");
    openCmdBtn.className = "bada-term-btn-icon";
    openCmdBtn.innerHTML = `<span>💻</span> CMD`;
    openCmdBtn.title = "Open Windows Command Prompt (cmd.exe) in this directory";
    openCmdBtn.style.borderColor = "rgba(0, 229, 255, 0.4)";
    openCmdBtn.style.color = "#00e5ff";

    openCmdBtn.addEventListener("click", async () => {
        try {
            const res = await fetch("/api/bada/terminal/open_cmd", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ cwd: currentPath })
            });
            if (res.status === 404) {
                appendLog(`\r\n[Notice] ComfyUI 파이썬 서버 재시작이 필요합니다. (신규 API 엔드포인트 등록을 위해 ComfyUI 콘솔 창을 껐다 켜주세요!)\r\n`, "stderr");
                return;
            }
            const rawText = await res.text();
            let data = {};
            try {
                data = JSON.parse(rawText);
            } catch (jsonErr) {
                appendLog(`\r\n[Server Response Error]: ${rawText}\r\n`, "stderr");
                return;
            }
            if (data.success) {
                appendLog(`\r\n[System] Launched real Windows CMD in: ${data.cwd}\r\n`, "success");
            } else {
                appendLog(`\r\n[Error launching CMD]: ${data.error}\r\n`, "stderr");
            }
        } catch (e) {
            appendLog(`\r\n[Error launching CMD]: ${e.message}\r\n`, "stderr");
        }
    });

    pathRow.appendChild(searchWrap);
    pathRow.appendChild(treeBtn);
    pathRow.appendChild(openCmdBtn);
    pathField.appendChild(pathRow);
    controls.appendChild(pathField);

    // Row 2: Command Action Preset
    const cmdField = document.createElement("div");
    cmdField.className = "bada-term-field";
    cmdField.innerHTML = `<div class="bada-term-label"><span>Command Action</span></div>`;
    const cmdSelect = document.createElement("select");
    cmdSelect.className = "bada-term-select";
    COMMAND_PRESETS.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name;
        cmdSelect.appendChild(opt);
    });
    cmdField.appendChild(cmdSelect);
    controls.appendChild(cmdField);

    // Row 3: Arguments / URL Input
    const argField = document.createElement("div");
    argField.className = "bada-term-field";
    argField.innerHTML = `<div class="bada-term-label"><span>Arguments / URL</span></div>`;
    const argRow = document.createElement("div");
    argRow.className = "bada-term-input-row";

    const argInput = document.createElement("input");
    argInput.type = "text";
    argInput.className = "bada-term-input";
    argInput.placeholder = currentPreset.placeholder;

    const pasteBtn = document.createElement("button");
    pasteBtn.className = "bada-term-btn-icon";
    pasteBtn.innerHTML = `<span>📋</span> Paste`;
    pasteBtn.title = "Paste from clipboard";

    argRow.appendChild(argInput);
    argRow.appendChild(pasteBtn);
    argField.appendChild(argRow);
    controls.appendChild(argField);

    // Preview Bar
    const previewBar = document.createElement("div");
    previewBar.className = "bada-term-preview";
    previewBar.textContent = "> Preview: waiting for input...";
    controls.appendChild(previewBar);

    // Master Execute Button
    const execBtn = document.createElement("button");
    execBtn.className = "bada-term-exec-btn";
    execBtn.innerHTML = `<span>⚡</span> Execute Command`;
    controls.appendChild(execBtn);

    root.appendChild(controls);

    // 3. Live Terminal Console
    const consoleWrap = document.createElement("div");
    consoleWrap.className = "bada-term-console-wrap";

    const consoleToolbar = document.createElement("div");
    consoleToolbar.className = "bada-term-console-toolbar";
    consoleToolbar.innerHTML = `
        <div class="bada-term-console-status">
            <span class="bada-term-status-dot idle" id="badaStatusDot"></span>
            <span id="badaStatusText">Idle</span>
        </div>
        <div class="bada-term-console-actions">
            <button class="bada-term-mini-btn" id="badaBtnCopy" title="Copy console output">📋 Copy</button>
            <button class="bada-term-mini-btn" id="badaBtnClear" title="Clear console">🧹 Clear</button>
            <button class="bada-term-mini-btn" id="badaBtnRestart" title="Signal ComfyUI restart" style="color:#e3b341;border-color:rgba(227,179,65,0.4)">🔄 Restart ComfyUI</button>
        </div>
    `;
    consoleWrap.appendChild(consoleToolbar);

    const screen = document.createElement("div");
    screen.className = "bada-term-screen";
    screen.innerHTML = `<span class="bada-term-log-system">⚓ Bada Terminal Hub ready. Select target directory & command to execute.\n</span>`;
    consoleWrap.appendChild(screen);

    // CLI Interactive Input Bar
    const cliBar = document.createElement("div");
    cliBar.className = "bada-term-cli-bar";
    cliBar.innerHTML = `
        <span class="bada-term-cli-prompt">$</span>
        <input type="text" class="bada-term-cli-input" placeholder="Type custom shell command and press Enter..." />
        <button class="bada-term-cli-send">Run</button>
    `;
    consoleWrap.appendChild(cliBar);
    root.appendChild(consoleWrap);

    // Elements
    const statusDot = consoleToolbar.querySelector("#badaStatusDot");
    const statusText = consoleToolbar.querySelector("#badaStatusText");
    const envBadge = header.querySelector("#badaEnvBadge");
    const cliInput = cliBar.querySelector(".bada-term-cli-input");
    const cliSendBtn = cliBar.querySelector(".bada-term-cli-send");
    const btnCopy = consoleToolbar.querySelector("#badaBtnCopy");
    const btnClear = consoleToolbar.querySelector("#badaBtnClear");
    const btnRestart = consoleToolbar.querySelector("#badaBtnRestart");

    function appendLog(text, type = "stdout") {
        const span = document.createElement("span");
        span.className = `bada-term-log-${type}`;
        span.textContent = text;
        screen.appendChild(span);
        screen.scrollTop = screen.scrollHeight;
    }

    function setStatus(state, label) {
        statusDot.className = `bada-term-status-dot ${state}`;
        statusText.textContent = label;
        if (state === "running") {
            isRunning = true;
            execBtn.classList.add("running");
            execBtn.innerHTML = `<span>⏹️</span> Stop Task`;
        } else {
            isRunning = false;
            execBtn.classList.remove("running");
            execBtn.innerHTML = `<span>⚡</span> Execute Command`;
        }
    }

    function updatePreview() {
        const rawArg = argInput.value.trim();
        let fullCmd = currentPreset.template;
        if (currentPreset.needArg) {
            fullCmd = fullCmd.replace("{ARG}", rawArg || "<ARG>");
        }
        const dirName = currentPath ? currentPath.split("/").pop() || currentPath : "default";
        previewBar.textContent = `> cd "${dirName}" && ${fullCmd}`;
        previewBar.title = `Full directory: ${currentPath}\nCommand: ${fullCmd}`;
    }

    async function loadEnvironment() {
        try {
            const res = await fetch("/api/bada/terminal/env");
            const json = await res.json();
            if (json.success && json.data) {
                envData = json.data;
                let shortEnv = envData.env_type || "Env";
                if (shortEnv === "StabilityMatrix") shortEnv = "Matrix";
                envBadge.textContent = shortEnv;
                envBadge.title = `${envData.env_type} Environment (${envData.comfyui_root})`;

                allDirectoryOptions = [];

                // Core Presets
                (envData.presets || []).forEach(p => {
                    allDirectoryOptions.push({
                        group: "📁 Core Presets",
                        label: p.label,
                        path: p.path,
                        name: p.label
                    });
                });

                // Installed Custom Nodes
                if (envData.custom_nodes && envData.custom_nodes.length > 0) {
                    envData.custom_nodes.forEach(n => {
                        allDirectoryOptions.push({
                            group: "📦 Installed Custom Nodes",
                            label: `📦 ${n.name}`,
                            path: n.path,
                            name: n.name
                        });
                    });
                }

                currentPath = envData.custom_nodes_root;
                searchInput.value = getSelectedLabel();
                updatePreview();
            }
        } catch (e) {
            console.error("[BadaTerminal] Failed to load environment:", e);
            envBadge.textContent = "Offline";
        }
    }

    cmdSelect.addEventListener("change", () => {
        const found = COMMAND_PRESETS.find(p => p.id === cmdSelect.value);
        if (found) {
            currentPreset = found;
            argInput.placeholder = found.placeholder;
            if (!found.needArg) {
                argInput.value = "";
            }

            if (envData) {
                if (found.defaultTarget === "custom_nodes_root" && envData.custom_nodes_root) {
                    currentPath = envData.custom_nodes_root;
                    searchInput.value = getSelectedLabel();
                } else if (found.defaultTarget === "comfyui_root" && envData.comfyui_root) {
                    currentPath = envData.comfyui_root;
                    searchInput.value = getSelectedLabel();
                }
            }
            updatePreview();
        }
    });

    argInput.addEventListener("input", () => {
        argText = argInput.value;
        updatePreview();
    });

    pasteBtn.addEventListener("click", async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                argInput.value = text.trim();
                argText = argInput.value;
                updatePreview();
            }
        } catch (e) {
            appendLog("\r\n[Warning] Clipboard access denied. Please paste manually.\r\n", "stderr");
        }
    });

    async function executeAction(customCmd = null) {
        if (isRunning && !customCmd) {
            if (currentTaskId) {
                try {
                    await fetch("/api/bada/terminal/kill", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ task_id: currentTaskId })
                    });
                    appendLog(`\r\n[Task stopped by user]\r\n`, "stderr");
                } catch (e) {
                    appendLog(`\r\n[Kill failed]: ${e.message}\r\n`, "stderr");
                }
            }
            setStatus("idle", "Stopped");
            return;
        }

        let cmdToRun = "";
        if (customCmd) {
            cmdToRun = customCmd.trim();
        } else {
            const rawArg = argInput.value.trim();
            if (currentPreset.needArg && !rawArg) {
                appendLog(`\r\n[Error] Please provide required arguments or URL.\r\n`, "stderr");
                return;
            }
            cmdToRun = currentPreset.template.replace("{ARG}", rawArg);
        }

        if (!cmdToRun) return;

        currentTaskId = `bada_${Date.now()}`;
        setStatus("running", "Running...");
        appendLog(`\r\n------------------------------------------------------------\r\n`, "system");
        appendLog(`[Exec] $ ${cmdToRun}\r\n`, "system");
        appendLog(`[CWD]  ${currentPath}\r\n`, "system");
        appendLog(`------------------------------------------------------------\r\n`, "system");

        try {
            const res = await fetch("/api/bada/terminal/exec", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    task_id: currentTaskId,
                    command: cmdToRun,
                    cwd: currentPath
                })
            });
            const json = await res.json();
            if (!json.success) {
                appendLog(`[Execution Error]: ${json.error}\r\n`, "stderr");
                setStatus("error", "Failed");
            }
        } catch (e) {
            appendLog(`[Request Error]: ${e.message}\r\n`, "stderr");
            setStatus("error", "Error");
        }
    }

    execBtn.addEventListener("click", () => executeAction());

    function submitCli() {
        const val = cliInput.value.trim();
        if (!val) return;
        cliHistory.push(val);
        historyIndex = cliHistory.length;
        cliInput.value = "";
        executeAction(val);
    }

    cliSendBtn.addEventListener("click", submitCli);
    cliInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            submitCli();
        } else if (e.key === "ArrowUp") {
            if (cliHistory.length > 0 && historyIndex > 0) {
                historyIndex--;
                cliInput.value = cliHistory[historyIndex];
            }
        } else if (e.key === "ArrowDown") {
            if (historyIndex < cliHistory.length - 1) {
                historyIndex++;
                cliInput.value = cliHistory[historyIndex];
            } else {
                historyIndex = cliHistory.length;
                cliInput.value = "";
            }
        }
    });

    btnCopy.addEventListener("click", () => {
        const text = screen.innerText || screen.textContent;
        navigator.clipboard.writeText(text).then(() => {
            btnCopy.textContent = "✅ Copied!";
            setTimeout(() => { btnCopy.textContent = "📋 Copy"; }, 1500);
        });
    });

    btnClear.addEventListener("click", () => {
        screen.innerHTML = "";
    });

    btnRestart.addEventListener("click", async () => {
        if (confirm("Restart ComfyUI server now?")) {
            appendLog(`\r\n[System] Signaling ComfyUI restart...\r\n`, "system");
            try {
                await fetch("/api/bada/terminal/restart", { method: "POST" });
            } catch (e) {
                appendLog(`[Restart signal]: ${e.message}\r\n`, "stderr");
            }
        }
    });

    // Folder Tree Explorer Modal
    treeBtn.addEventListener("click", () => {
        openTreeModal();
    });

    function openTreeModal() {
        const backdrop = document.createElement("div");
        backdrop.className = "bada-tree-modal-backdrop";

        const modal = document.createElement("div");
        modal.className = "bada-tree-modal";
        modal.innerHTML = `
            <div class="bada-tree-header">
                <div class="bada-tree-header-title">
                    <span>📁</span> Directory Tree Explorer
                </div>
                <button class="bada-tree-close-btn" id="badaTreeClose">✕</button>
            </div>
            <div class="bada-tree-content" id="badaTreeContainer">
                <div style="padding:10px;color:#8b949e">Loading directory tree...</div>
            </div>
            <div class="bada-tree-footer">
                <span id="badaTreeSelectedPath" style="flex:1;font-size:11px;color:#8b949e;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
                <button class="bada-term-mini-btn" id="badaTreeCancel" style="padding:5px 10px;">Cancel</button>
                <button class="bada-term-exec-btn" id="badaTreeSelectBtn" style="width:auto;padding:5px 14px;font-size:11.5px;">Select This Folder</button>
            </div>
        `;
        backdrop.appendChild(modal);
        document.body.appendChild(backdrop);

        const treeContainer = modal.querySelector("#badaTreeContainer");
        const pathLabel = modal.querySelector("#badaTreeSelectedPath");
        const selectBtn = modal.querySelector("#badaTreeSelectBtn");
        const closeBtn = modal.querySelector("#badaTreeClose");
        const cancelBtn = modal.querySelector("#badaTreeCancel");

        let chosenPath = currentPath || (envData ? envData.comfyui_root : "");
        pathLabel.textContent = chosenPath;

        function closeModal() {
            backdrop.remove();
        }
        closeBtn.addEventListener("click", closeModal);
        cancelBtn.addEventListener("click", closeModal);
        backdrop.addEventListener("click", (e) => {
            if (e.target === backdrop) closeModal();
        });

        selectBtn.addEventListener("click", () => {
            if (chosenPath) {
                currentPath = chosenPath;
                const exists = allDirectoryOptions.some(o => o.path === chosenPath);
                if (!exists) {
                    allDirectoryOptions.unshift({
                        group: "📁 Selected Custom Folders",
                        label: `📁 ${chosenPath.split("/").pop()} (${chosenPath})`,
                        path: chosenPath,
                        name: chosenPath.split("/").pop()
                    });
                }
                searchInput.value = getSelectedLabel();
                updatePreview();
            }
            closeModal();
        });

        async function renderTree() {
            treeContainer.innerHTML = "";
            const rootPaths = [
                { name: "🏠 ComfyUI Root", path: envData.comfyui_root },
                { name: "📁 Custom Nodes Root", path: envData.custom_nodes_root }
            ];

            for (const rootItem of rootPaths) {
                const nodeEl = createTreeNode(rootItem.name, rootItem.path, true);
                treeContainer.appendChild(nodeEl);
            }
        }

        function createTreeNode(name, fullPath, isRoot = false) {
            const wrap = document.createElement("div");
            wrap.className = "bada-tree-node";

            const item = document.createElement("div");
            item.className = "bada-tree-item";
            if (fullPath === chosenPath) item.classList.add("selected");

            item.innerHTML = `
                <span class="bada-tree-toggle">▶</span>
                <span class="bada-tree-icon">📁</span>
                <span class="bada-tree-name">${name}</span>
            `;

            const childrenWrap = document.createElement("div");
            childrenWrap.className = "bada-tree-children";
            childrenWrap.style.display = "none";

            let loaded = false;
            const toggleSpan = item.querySelector(".bada-tree-toggle");

            async function toggleExpand(e) {
                if (e) e.stopPropagation();
                if (childrenWrap.style.display === "none") {
                    childrenWrap.style.display = "flex";
                    toggleSpan.textContent = "▼";
                    if (!loaded) {
                        loaded = true;
                        childrenWrap.innerHTML = `<div style="padding:4px;color:#8b949e;font-size:11px">Scanning...</div>`;
                        try {
                            const res = await fetch(`/api/bada/terminal/browse?path=${encodeURIComponent(fullPath)}`);
                            const json = await res.json();
                            childrenWrap.innerHTML = "";
                            if (json.success && json.subdirs && json.subdirs.length > 0) {
                                json.subdirs.forEach(sub => {
                                    const subNode = createTreeNode(sub.name, sub.path);
                                    childrenWrap.appendChild(subNode);
                                });
                            } else {
                                childrenWrap.innerHTML = `<div style="padding:4px;color:#6e7681;font-size:10.5px">No subfolders</div>`;
                            }
                        } catch (err) {
                            childrenWrap.innerHTML = `<div style="padding:4px;color:#f85149;font-size:10.5px">Scan error</div>`;
                        }
                    }
                } else {
                    childrenWrap.style.display = "none";
                    toggleSpan.textContent = "▶";
                }
            }

            toggleSpan.addEventListener("click", toggleExpand);
            item.addEventListener("click", () => {
                treeContainer.querySelectorAll(".bada-tree-item.selected").forEach(el => el.classList.remove("selected"));
                item.classList.add("selected");
                chosenPath = fullPath;
                pathLabel.textContent = chosenPath;
            });

            wrap.appendChild(item);
            wrap.appendChild(childrenWrap);

            if (isRoot) {
                toggleExpand();
            }

            return wrap;
        }

        renderTree();
    }

    // WebSocket Listeners
    api.addEventListener("bada_terminal_stdout", (e) => {
        const data = e.detail;
        if (data && data.task_id === currentTaskId) {
            appendLog(data.text, "stdout");
        }
    });

    api.addEventListener("bada_terminal_stderr", (e) => {
        const data = e.detail;
        if (data && data.task_id === currentTaskId) {
            appendLog(data.text, "stderr");
        }
    });

    api.addEventListener("bada_terminal_exit", (e) => {
        const data = e.detail;
        if (data && data.task_id === currentTaskId) {
            if (data.code === 0) {
                appendLog(`\r\n[Task completed successfully (code 0)]\r\n`, "success");
                setStatus("success", "Completed");
            } else {
                appendLog(`\r\n[Task exited with code ${data.code}]\r\n`, "stderr");
                setStatus("error", `Exited (${data.code})`);
            }
        }
    });

    api.addEventListener("bada_comfyui_restarting", (e) => {
        appendLog(`\r\n[System] ComfyUI server restart triggered...\r\n`, "system");
    });

    loadEnvironment();
    return root;
}

/**
 * Registers Bada Terminal Hub into ComfyUI V1 Sidebar Tabs (Strict Single Instance)
 */
function registerSidebarTab() {
    if (window.__BADA_TERMINAL_TAB_REGISTERED__) return;

    if (!app.extensionManager || !app.extensionManager.registerSidebarTab) {
        return;
    }

    // Prevent duplicate tabs in extensionManager.sidebarTab
    const existingTabs = app.extensionManager?.sidebarTab?.sidebarTabs;
    if (Array.isArray(existingTabs) && existingTabs.some(t => t.id === "bada-terminal-hub")) {
        window.__BADA_TERMINAL_TAB_REGISTERED__ = true;
        return;
    }

    try {
        app.extensionManager.registerSidebarTab({
            id: "bada-terminal-hub",
            icon: "bada-tab-icon-terminal",
            title: "",
            tooltip: "⚓ Bada Terminal Hub (Git & Node Console)",
            type: "custom",
            render: (el) => {
                el.innerHTML = "";
                el.style.width = "100%";
                el.style.height = "100%";
                el.style.display = "flex";
                el.style.flexDirection = "column";
                el.style.overflow = "hidden";
                const component = createTerminalHubComponent({ isSidebar: true });
                el.appendChild(component);
            }
        });
        window.__BADA_TERMINAL_TAB_REGISTERED__ = true;
        console.log("[BadaTerminal] Single Sidebar tab 'bada-terminal-hub' registered successfully! ⚡");
        reorderTerminalSidebarTab();
        setTimeout(reorderTerminalSidebarTab, 300);
        setTimeout(reorderTerminalSidebarTab, 1000);
    } catch (e) {
        console.warn("[BadaTerminal] registerSidebarTab error:", e);
    }
}

function reorderTerminalSidebarTab() {
    // 1. Move to end of extensionManager tabs array
    try {
        const tabs = app.extensionManager?.sidebarTab?.sidebarTabs;
        if (tabs && Array.isArray(tabs)) {
            const idx = tabs.findIndex(t => t.id === "bada-terminal-hub");
            if (idx !== -1 && idx !== tabs.length - 1) {
                const [tab] = tabs.splice(idx, 1);
                tabs.push(tab);
            }
        }
    } catch (e) {}

    // 2. Move DOM button to the bottom of the sidebar toolbar container (below extensions)
    try {
        const termBtn = document.querySelector('button:has(.bada-tab-icon-terminal), [data-testid="bada-terminal-hub-tab-button"]');
        if (termBtn && termBtn.parentElement) {
            const container = termBtn.parentElement;
            if (container.lastElementChild !== termBtn) {
                container.appendChild(termBtn);
            }
        }
    } catch (e) {}
}

// Ensure strict single DOM button and keep at bottom of sidebar
setInterval(() => {
    const buttons = document.querySelectorAll('button:has(.bada-tab-icon-terminal), [data-testid="bada-terminal-hub-tab-button"]');
    if (buttons.length > 1) {
        for (let i = 1; i < buttons.length; i++) {
            buttons[i].remove();
        }
    }
    reorderTerminalSidebarTab();
}, 400);

// Global modal launcher
window.showBadaTerminalModal = function () {
    const backdrop = document.createElement("div");
    backdrop.className = "bada-tree-modal-backdrop";
    backdrop.style.zIndex = "100000";

    const modal = document.createElement("div");
    modal.className = "bada-tree-modal";
    modal.style.width = "620px";
    modal.style.height = "580px";
    modal.style.maxWidth = "95vw";
    modal.style.maxHeight = "90vh";

    const comp = createTerminalHubComponent({ isSidebar: true });
    modal.appendChild(comp);

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) backdrop.remove();
    });
};

app.registerExtension({
    name: "BadaUtils.TerminalHub",

    async setup() {
        registerSidebarTab();
    },

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "BadaTerminalHub") return;

        const origNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            if (origNodeCreated) origNodeCreated.apply(this, arguments);

            const node = this;
            node.size = [560, 520];

            if (node.widgets) {
                node.widgets.forEach(w => {
                    w.type = "converted-widget";
                    w.hidden = true;
                    if (w.computeSize) w.computeSize = () => [0, -4];
                });
            }

            const root = createTerminalHubComponent({ isSidebar: false, node });

            node.addDOMWidget("bada_terminal_widget", "TerminalHub", root, {
                serialize: false,
                hideOnZoom: false
            });

            function syncContainerSize() {
                if (!root || !node || !node.size) return;
                const w = Math.max(480, node.size[0] - 20);
                const h = Math.max(420, node.size[1] - 46);
                root.style.width = w + "px";
                root.style.maxWidth = w + "px";
                root.style.height = h + "px";
                root.style.maxHeight = h + "px";
            }

            const origOnDrawForeground = node.onDrawForeground;
            node.onDrawForeground = function (ctx) {
                if (origOnDrawForeground) origOnDrawForeground.apply(this, arguments);
                syncContainerSize();
            };

            setTimeout(syncContainerSize, 50);
            setTimeout(syncContainerSize, 200);
        };
    }
});
