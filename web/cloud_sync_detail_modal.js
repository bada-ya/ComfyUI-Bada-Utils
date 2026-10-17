/**
 * ComfyUI-Bada-Utils: Cloud Sync Detail Modal
 * "동기화 상세" 팝업 — 설정 다이얼로그 값 셀 제약을 벗어나 넓게 표시.
 * 참조: web/presets_overview_modal.js (usp-modal-backdrop 패턴 재사용).
 * 닫기(버튼·바깥·ESC)는 팝업만 닫고 설정창은 그대로 둔다.
 */

import { BadaI18n } from "./bada_i18n.js";

let detailModalEl = null;
let detailPollTimer = null;
let detailFilesSnapshot = [];
let detailLastSyncSnapshot = null;
// 원격 개수+경로 스냅샷 (팝업 열 때 1회 조회, 1초 폴링과 분리).
let detailRemoteSnapshot = null;
let detailRemoteError = "";
// expand state (name -> false means collapsed). Default expanded; paths prefilled from status.
let detailExpanded = {};
// ── 커스텀 폴더 섹션 상태 — 팝업 열 때 1회 조회 + 추가/제거 후 갱신 (1초 폴링과 분리). ──
let customFolders = [];        // [{name, path, rel_path, exists, is_file}] — path 는 이 PC 의 ComfyUI 위치로 해석된 절대경로
let customSyncEnabled = false; // 마스터 ON/OFF (custom_sync.enabled)
let customCounts = {};         // name -> remote-counts target ({local_count, remote_count, remote_exists, local_path, remote_name})
let customAddOpen = false;     // 인라인 추가 폼 표시 여부
let customAddError = "";       // 인라인 검증 에러 (빨간 글씨)
let customAddDraft = "";       // 입력 중 내용 보존 (재렌더링 시 복원)
let customAddName = "";        // Drive 이름(선택) 입력 중 내용 보존 — 비워두면 로컬 basename 사용

const MAX_NAME_LEN = 40;
const truncName = (s) => {
    if (!s) return "";
    return (s.length > MAX_NAME_LEN) ? (s.slice(0, MAX_NAME_LEN) + "…") : s;
};
const fmtSize = (b) => {
    if (!b || b <= 0) return "";
    const kb = b / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
};
const fmtTime = (ts) => {
    if (!ts) return null;
    try {
        const d = new Date(ts * 1000);
        const p = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    } catch (_) { return null; }
};
const FILE_LABELS = {
    "presets_data.json": { ko: "⚓ 프리셋 (Regional Prompt)", en: "⚓ Presets (Regional Prompt)" },
    "favorites_data.json": { ko: "⭐ 즐겨찾기", en: "⭐ Favorites" },
    "gemini_chat_history.json": { ko: "⚓ 제미나이 채팅 기록", en: "⚓ Gemini chat history" },
    "engines_registry.json": { ko: "⚓ 시스템 프롬프트", en: "⚓ System prompts" },
    "workflows": { ko: "🗂️ 워크플로우 파일", en: "🗂️ Workflow files" },
};

export function isCloudDetailModalOpen() {
    return !!(detailModalEl && detailModalEl.classList.contains("active"));
}

export function openCloudDetailModal(files, lastSync) {
    detailFilesSnapshot = Array.isArray(files) ? files : [];
    detailLastSyncSnapshot = lastSync || null;
    detailRemoteSnapshot = null;
    detailRemoteError = "";
    detailExpanded = {};
    customFolders = [];
    customSyncEnabled = false;
    customCounts = {};
    customAddOpen = false;
    customAddError = "";
    customAddDraft = "";
    customAddName = "";
    if (!detailModalEl) {
        detailModalEl = document.createElement("div");
        detailModalEl.id = "bada-cloud-detail-modal";
        detailModalEl.className = "usp-modal-backdrop";
        document.body.appendChild(detailModalEl);
    }
    renderDetailModal();
    requestAnimationFrame(() => { detailModalEl.classList.add("active"); });
    startDetailPoll();
    // 원격 개수+경로는 열 때 1회만 (API 1회, 1초 폴링과 분리).
    fetchRemoteSnapshot();
    // 커스텀 폴더 목록 + 폴더별 개수도 동일하게 열 때 1회.
    fetchCustomFolders();
    const onKeyDown = (e) => {
        if (e.key === "Escape") {
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            closeCloudDetailModal();
            e.preventDefault();
        }
    };
    if (detailModalEl._onKeyDown) {
        document.removeEventListener("keydown", detailModalEl._onKeyDown, true);
    }
    detailModalEl._onKeyDown = onKeyDown;
    document.addEventListener("keydown", onKeyDown, true);
}

export function closeCloudDetailModal() {
    if (detailModalEl) {
        if (detailModalEl._onKeyDown) {
            document.removeEventListener("keydown", detailModalEl._onKeyDown, true);
            delete detailModalEl._onKeyDown;
        }
        detailModalEl.classList.remove("active");
    }
    stopDetailPoll();
}

function startDetailPoll() {
    stopDetailPoll();
    const tick = async () => {
        if (!isCloudDetailModalOpen()) return;
        try {
            const r = await fetch("/api/bada/cloud/status");
            const s = await r.json();
            if (!s.success) return;
            detailFilesSnapshot = Array.isArray(s.files) ? s.files : detailFilesSnapshot;
            detailLastSyncSnapshot = s.last_sync || detailLastSyncSnapshot;
            paintDetailProgress(s);
        } catch (_) { /* next tick */ }
    };
    tick();
    detailPollTimer = setInterval(tick, 1000);
}
function stopDetailPoll() {
    if (detailPollTimer) { clearInterval(detailPollTimer); detailPollTimer = null; }
}
// 원격 개수+경로 점진적(Progressive) 조회 — 가벼운 설정부터 즉시 표시하고 워크플로우를 뒤이어 갱신.
function isRemoteChecking() {
    if (!Array.isArray(detailFilesSnapshot) || !detailFilesSnapshot.length) return false;
    if (!Array.isArray(detailRemoteSnapshot)) return true;
    return detailFilesSnapshot.some(f => !detailRemoteSnapshot.find(t => t.name === f.name));
}

async function fetchRemoteSnapshot() {
    if (!Array.isArray(detailRemoteSnapshot)) {
        detailRemoteSnapshot = [];
    }
    detailRemoteError = "";

    const items = Array.isArray(detailFilesSnapshot) ? detailFilesSnapshot : [];
    const configItems = items.filter(f => f.name !== "workflows");
    const hasWorkflows = items.some(f => f.name === "workflows");

    // 1단계: 가벼운 설정 항목 4종을 동시 병렬 요청 -> 0.3~0.5초 만에 완료
    const configPromises = configItems.map(async (item) => {
        try {
            const r = await fetch(`/api/bada/cloud/remote-counts?target=${encodeURIComponent(item.name)}`);
            const s = await r.json();
            if (s.success && Array.isArray(s.targets)) {
                for (const t of s.targets) {
                    const idx = detailRemoteSnapshot.findIndex(x => x.name === t.name);
                    if (idx >= 0) {
                        detailRemoteSnapshot[idx] = t;
                    } else {
                        detailRemoteSnapshot.push(t);
                    }
                }
                paintDetailFiles();
            }
        } catch (e) {
            console.debug(`[Bada Detail] Error fetching target ${item.name}:`, e);
        }
    });

    await Promise.allSettled(configPromises);

    // 2단계: 워크플로우 항목 요청 (1~2초)
    if (hasWorkflows) {
        try {
            const r = await fetch("/api/bada/cloud/remote-counts?target=workflows");
            const s = await r.json();
            if (s.success && Array.isArray(s.targets)) {
                for (const t of s.targets) {
                    const idx = detailRemoteSnapshot.findIndex(x => x.name === t.name);
                    if (idx >= 0) {
                        detailRemoteSnapshot[idx] = t;
                    } else {
                        detailRemoteSnapshot.push(t);
                    }
                }
                paintDetailFiles();
            }
        } catch (e) {
            console.debug("[Bada Detail] Error fetching workflows target:", e);
        }
    }

    // 3단계: 전체 확인 완료 -> 상단 헤더 상태 갱신
    try {
        const isKoNow = (BadaI18n.lang === "ko");
        const fracNow = detailModalEl ? detailModalEl.querySelector("#bada-detail-progress-frac") : null;
        const syncBtnNow = detailModalEl ? detailModalEl.querySelector("#bada-detail-sync-btn") : null;
        const busyNow = !!syncBtnNow && syncBtnNow.dataset && syncBtnNow.dataset.mode === "cancel";
        if (fracNow && !busyNow) {
            fracNow.textContent = isRemoteChecking() ? (isKoNow ? "확인 중…" : "Checking...") : (isKoNow ? "대기 중" : "Idle");
        }
    } catch (_) {}
}

function paintDetailProgress(s) {
    if (!detailModalEl) return;
    const isKo = (BadaI18n.lang === "ko");
    const bar = detailModalEl.querySelector("#bada-detail-progress-bar");
    const frac = detailModalEl.querySelector("#bada-detail-progress-frac");
    const cur = detailModalEl.querySelector("#bada-detail-progress-current");
    const stateLine = detailModalEl.querySelector("#bada-detail-state-line");
    const prog = s.progress || {};
    const syncBtn = detailModalEl.querySelector("#bada-detail-sync-btn");
    const paintSyncBtn = () => {
        if (!syncBtn) return;
        if (s.syncing) {
            const done = prog.done ?? 0;
            const total = prog.total ?? 0;
            syncBtn.textContent = isKo ? `⏹ 중단 (${done}/${total})` : `⏹ Cancel (${done}/${total})`;
            syncBtn.dataset.mode = "cancel";
            syncBtn.style.cssText = "background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.4); color:#fca5a5; border-radius:6px; padding:5px 12px; font-size:12px; font-weight:700; cursor:pointer;";
        } else {
            syncBtn.textContent = isKo ? "☁️ 지금 동기화" : "☁️ Sync now";
            syncBtn.dataset.mode = "sync";
            syncBtn.style.cssText = "background:rgba(14,165,233,0.2); border:1px solid rgba(14,165,233,0.4); color:#e0f2fe; border-radius:6px; padding:5px 12px; font-size:12px; font-weight:700; cursor:pointer;";
        }
    };
    paintSyncBtn();
    if (s.syncing && prog.total !== undefined) {
        const done = prog.done ?? 0;
        const total = prog.total ?? 0;
        const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
        if (bar) bar.style.width = pct + "%";
        if (frac) frac.textContent = `${done}/${total} (${pct}%)`;
        if (cur) {
            const full = prog.current || "";
            cur.textContent = full ? truncName(full) : (isKo ? "준비 중…" : "Preparing…");
            cur.title = full;
        }
        if (stateLine) stateLine.textContent = isKo
            ? "⏳ 동기화 중 — 창을 닫아도 백그라운드에서 계속됩니다."
            : "⏳ Syncing — continues in background if closed.";
    } else {
        if (bar) bar.style.width = "0%";
        if (frac) {
            if (isRemoteChecking()) {
                frac.textContent = isKo ? "확인 중…" : "Checking...";
            } else {
                frac.textContent = isKo ? "대기 중" : "Idle";
            }
        }
        if (cur) { cur.textContent = ""; cur.title = ""; }
        const ls = s.last_sync || detailLastSyncSnapshot || {};
        const when = fmtTime(ls.last_sync_at);
        if (stateLine) stateLine.textContent = when
            ? (isKo ? `마지막 동기화 ${when} (↑${ls.uploaded ?? 0} ↓${ls.downloaded ?? 0})` : `Last sync ${when} (↑${ls.uploaded ?? 0} ↓${ls.downloaded ?? 0})`)
            : (isKo ? "아직 동기화한 적 없음" : "Never synced yet");
    }
    paintDetailFiles();
}
function localPathByName(name) {
    for (const f of detailFilesSnapshot) { if (f.name === name) return f; }
    return null;
}
function remoteTargetByName(name) {
    if (!Array.isArray(detailRemoteSnapshot)) return null;
    return detailRemoteSnapshot.find((t) => t.name === name) || null;
}
// "로컬 열기" — 서버 측 화이트리스트 검증 + 탐색기에서 폴더 열림 (파일은 /select 하이라이트).
// 피드백(✅/⚠️) 표시 후 재렌더링으로 원래 라벨 복원.
async function callOpenLocal(name, btn) {
    const isKo = BadaI18n.lang === "ko";
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    // 체감 완화: 서버 응답(즉시) 전이라도 버튼을 먼저 "여는 중…"으로 전환 — 탐색기는 곧 떠 있음.
    btn.textContent = isKo ? "⏳ 여는 중…" : "⏳ Opening…";
    try {
        const r = await fetch("/api/bada/cloud/open-local", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target: name }),
        });
        const s = await r.json();
        if (s.success) {
            btn.textContent = isKo ? "✅ 열림" : "✅ Opened";
        } else {
            btn.textContent = isKo ? "⚠️ 실패" : "⚠️ Failed";
            btn.title = s.error || "";
        }
    } catch (_) {
        btn.textContent = isKo ? "⚠️ 실패" : "⚠️ Failed";
    }
    setTimeout(paintDetailFiles, 1600);
}
// "Drive 열기" — 서버 화이트리스트 검증 후 해당 Drive 파일/폴더 URL을 새 탭으로 오픈.
// 피드백(✅/⚠️) 표시 후 재렌더링으로 원래 라벨 복원.
async function callOpenDrive(name, btn) {
    const isKo = BadaI18n.lang === "ko";
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    try {
        const r = await fetch("/api/bada/cloud/open-drive", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target: name }),
        });
        const s = await r.json();
        if (s.success && s.url) {
            window.open(s.url, "_blank", "noopener");
            btn.textContent = isKo ? "✅ 열림" : "✅ Opened";
            btn.title = s.url;
        } else {
            btn.textContent = isKo ? "⚠️ 실패" : "⚠️ Failed";
            btn.title = s.error || "";
        }
    } catch (_) {
        btn.textContent = isKo ? "⚠️ 실패" : "⚠️ Failed";
    }
    setTimeout(paintDetailFiles, 1600);
}
// 커스텀 폴더 목록 + 마스터 토글 조회 — 팝업 열 때 1회, 추가/제거 후 재호출.
async function fetchCustomFolders() {
    try {
        const r = await fetch("/api/bada/cloud/custom-folders");
        const s = await r.json();
        if (s.success) {
            customSyncEnabled = !!s.enabled;
            customFolders = Array.isArray(s.folders) ? s.folders : [];
        }
    } catch (_) { /* 서버 미응답 — 빈 섹션 유지 */ }
    paintDetailFiles();
    // 폴더별 개수는 built-in과 동일한 점진적 패턴 (폴더당 1회, 열 때만).
    for (const f of customFolders) fetchCustomCounts(f.name);
}

// 폴더별 로컬/원격 개수 — remote-counts?target=custom:<name> (조회 전용, 생성하지 않음).
async function fetchCustomCounts(name) {
    try {
        const r = await fetch(`/api/bada/cloud/remote-counts?target=${encodeURIComponent("custom:" + name)}`);
        const s = await r.json();
        if (s.success && Array.isArray(s.targets)) {
            for (const t of s.targets) {
                customCounts[String(t.name || "").replace(/^custom:/, "")] = t;
            }
            paintDetailFiles();
        }
    } catch (_) {}
}

// 커스텀 폴더 섹션 렌더 — 내장 5개 섹션 아래에 추가 (동일 스타일 재사용).
function paintCustomSection(body, isKo) {
    const sec = document.createElement("div");
    sec.style.cssText = "border-top:1px solid rgba(148,163,184,0.25); margin-top:8px; padding-top:10px;";

    // 헤더: [📁 커스텀 폴더 (N개)]  ...  [마스터 토글] [+추가]
    const header = document.createElement("div");
    header.style.cssText = "display:flex; align-items:center; justify-content:space-between; gap:12px; line-height:1.9;";
    const title = document.createElement("span");
    title.textContent = isKo ? `📂 커스텀 동기화 대상 (${customFolders.length}개)` : `📂 Custom sync targets (${customFolders.length})`;
    title.style.cssText = "font-size:13px; font-weight:700; color:#e2e8f0;";
    header.appendChild(title);

    const rightCtl = document.createElement("div");
    rightCtl.style.cssText = "display:flex; align-items:center; gap:10px; flex-shrink:0;";

    // 마스터 토글 — .bada-cloud-switch/.bada-cloud-slider 재사용 (bada_core.js 전역 CSS).
    const swLabel = document.createElement("label");
    swLabel.className = "bada-cloud-switch";
    swLabel.style.cssText = "margin:0; flex-shrink:0; cursor:pointer;";
    const swInput = document.createElement("input");
    swInput.type = "checkbox";
    swInput.checked = customSyncEnabled;
    swInput.title = isKo ? "커스텀 동기화 ON/OFF (폴더·파일)" : "Custom sync ON/OFF (folders & files)";
    const swSpan = document.createElement("span");
    swSpan.className = "bada-cloud-slider";
    swLabel.appendChild(swInput);
    swLabel.appendChild(swSpan);
    // 마스터 토글 — 서버 영속화 (custom_sync.enabled), 실패 시 체크박스 되돌림.
    swInput.addEventListener("change", async () => {
        const next = swInput.checked;
        try {
            const r = await fetch("/api/bada/cloud/custom-sync-toggle", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled: next }),
            });
            const s = await r.json();
            if (s.success) {
                customSyncEnabled = next;
            } else {
                swInput.checked = customSyncEnabled; // 실패 시 되돌림
            }
        } catch (_) {
            swInput.checked = customSyncEnabled;
        }
    });
    rightCtl.appendChild(swLabel);

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.style.cssText = "background:rgba(14,165,233,0.2); border:1px solid rgba(14,165,233,0.4); color:#e0f2fe; border-radius:6px; padding:3px 12px; font-size:12px; font-weight:700; cursor:pointer;";
    addBtn.textContent = isKo ? "+ 추가" : "+ Add";
    rightCtl.appendChild(addBtn);

    header.appendChild(rightCtl);
    sec.appendChild(header);

    // 인라인 추가 폼 — [경로 입력][확인][✕] + 빨간 검증 에러 (팝업 없음).
    if (customAddOpen) {
        const form = document.createElement("div");
        form.style.cssText = "display:flex; align-items:center; gap:8px; padding:6px 0 2px 4px;";
        const input = document.createElement("input");
        input.type = "text";
        input.dataset.field = "customPath"; // 재렌더 시 포커스 복원용 식별자
        input.value = customAddDraft;
        input.placeholder = isKo ? 'ComfyUI 폴더 내부 경로만 가능 (탐색기 마우스 오른쪽 → "경로로 복사" 후 붙여넣기)' : 'Path inside the ComfyUI folder only (Explorer right-click → "Copy as path", then paste)';
        input.style.cssText = "flex:1; min-width:0; background:rgba(30,41,59,0.6); border:1px solid rgba(148,163,184,0.35); color:#e2e8f0; border-radius:6px; padding:5px 10px; font-size:12px;";
        input.addEventListener("input", () => { customAddDraft = input.value; });

        // Drive 이름(선택) — 비워두면 로컬 파일/폴더명 자동 사용. (따옴표·공백은 서버가 제거)
        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.dataset.field = "customName"; // 재렌더 시 포커스 복원용 식별자
        nameInput.value = customAddName;
        nameInput.placeholder = isKo ? "(선택 — 비워두면 로컬 이름 사용)" : "(optional — blank = use local name)";
        nameInput.style.cssText = "flex:0 1 220px; min-width:0; background:rgba(30,41,59,0.6); border:1px dashed rgba(148,163,184,0.4); color:#e2e8f0; border-radius:6px; padding:5px 10px; font-size:12px;";
        nameInput.addEventListener("input", () => { customAddName = nameInput.value; });

        const okBtn = document.createElement("button");
        okBtn.type = "button";
        okBtn.style.cssText = "flex-shrink:0; background:rgba(34,197,94,0.2); border:1px solid rgba(34,197,94,0.5); color:#bbf7d0; border-radius:6px; padding:5px 14px; font-size:12px; font-weight:700; cursor:pointer;";
        okBtn.textContent = isKo ? "확인" : "Add";

        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.style.cssText = "flex-shrink:0; background:none; border:1px solid rgba(148,163,184,0.35); color:#94a3b8; border-radius:6px; padding:5px 10px; font-size:12px; cursor:pointer;";
        cancelBtn.textContent = "✕";

        const submitAdd = async () => {
            if (okBtn.disabled) return;
            // 다중 줄(여러 경로 일괄 붙여넣기) 차단 — 안내 메시지만 표시.
            if (/[\r\n]/.test(customAddDraft)) {
                customAddError = isKo ? "여러 경로를 붙여넣으셨습니다 — 한 번에 하나씩 등록해 주세요" : "Multiple paths pasted — add them one at a time";
                paintDetailFiles();
                return;
            }
            // 따옴표·공백 자동 제거 (탐색기 "경로로 복사"는 양쪽 \"...\" 포함).
            const cleanPath = customAddDraft.trim().replace(/^\"+|\"+$/g, "").trim();
            if (!cleanPath) {
                customAddError = isKo ? "경로를 입력해 주세요" : "Please enter a path";
                paintDetailFiles();
                return;
            }
            const cleanName = customAddName.trim().replace(/^\"+|\"+$/g, "").trim();
            okBtn.disabled = true;
            try {
                const body = { path: cleanPath };
                if (cleanName) body.name = cleanName;
                const r = await fetch("/api/bada/cloud/custom-folder-add", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });
                const s = await r.json();
                if (s.success) {
                    customAddOpen = false;
                    customAddError = "";
                    customAddDraft = "";
                    customAddName = "";
                    fetchCustomFolders(); // 목록 + 개수 갱신
                } else {
                    customAddError = s.error || (isKo ? "등록 실패" : "Failed to add");
                    paintDetailFiles();
                }
            } catch (_) {
                customAddError = isKo ? "서버 오류 — 다시 시도하세요" : "Server error — retry";
                paintDetailFiles();
            }
        };
        okBtn.addEventListener("click", submitAdd);
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); submitAdd(); } });
        nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); submitAdd(); } });

        cancelBtn.addEventListener("click", () => {
            customAddOpen = false;
            customAddError = "";
            customAddDraft = "";
            customAddName = "";
            paintDetailFiles();
        });

        form.appendChild(input);
        form.appendChild(nameInput);
        form.appendChild(okBtn);
        form.appendChild(cancelBtn);
        sec.appendChild(form);

        if (customAddError) {
            const errEl = document.createElement("div");
            errEl.style.cssText = "padding:2px 4px; font-size:11px; color:#fca5a5;";
            errEl.textContent = `⚠️ ${customAddError}`;
            sec.appendChild(errEl);
        }
    } else {
        addBtn.addEventListener("click", () => { customAddOpen = true; paintDetailFiles(); });
    }

    // 폴더가 없으면 점선 플레이스홀더 (클릭 = 추가 폼 표시).
    if (!customFolders.length) {
        const empty = document.createElement("div");
        empty.style.cssText = "border:1px dashed rgba(148,163,184,0.35); border-radius:8px; padding:12px 14px; margin-top:8px; font-size:12px; color:#94a3b8; text-align:center; cursor:pointer;";
        empty.textContent = isKo ? "아직 동기화 대상이 없습니다 — 클릭하여 폴더 또는 파일 추가" : "No sync targets yet — click to add a folder or file";
        empty.addEventListener("click", () => { customAddOpen = true; paintDetailFiles(); });
        sec.appendChild(empty);
    }

    for (const f of customFolders) {
        const cnt = customCounts[f.name];
        const mark = f.exists ? "✅" : "⚠️";
        const typeIcon = f.is_file ? "📄" : "📁";
        // 오른쪽: 로컬 개수 · 원격 개수/상태 (built-in workflows 패턴 재사용).
        let rightTxt;
        if (!f.exists) {
            rightTxt = isKo ? "로컬에 없음" : "missing locally";
        } else if (cnt && typeof cnt.local_count === "number") {
            const lc = `${isKo ? "로컬 " : "local "}${cnt.local_count}${isKo ? "개" : ""}`;
            let rc;
            if (typeof cnt.remote_count === "number") {
                rc = `${isKo ? "원격 " : "remote "}${cnt.remote_count}${isKo ? "개" : ""}`;
                const diff = cnt.local_count - cnt.remote_count;
                if (diff > 0) rc += isKo ? ` (⏳ ${diff}개 차이)` : ` (⏳ ${diff} pending)`;
                else if (diff < 0) rc += isKo ? ` (☁️ ${-diff}개 많음)` : ` (☁️ ${-diff} more)`;
                else rc += " ✅";
            } else {
                rc = cnt.remote_exists ? (isKo ? "원격 있음" : "remote ✓") : (isKo ? "원격 없음" : "no remote");
            }
            rightTxt = `${lc} · ${rc}`;
        } else {
            rightTxt = isKo ? "확인 중…" : "checking…";
        }

        const wrap = document.createElement("div");
        wrap.style.cssText = "border-bottom:1px solid rgba(148,163,184,0.12); padding-top:6px; margin-top:6px;";

        // 1행: ✅ 폴더명 ... 로컬 N개 · 원격 M개
        const line = document.createElement("div");
        line.style.cssText = "display:flex; justify-content:space-between; gap:12px; line-height:1.9; font-size:13px; color:#cbd5e1;";
        const left = document.createElement("span");
        left.textContent = `${mark} ${typeIcon} ${f.name}`;
        left.title = f.path;
        const rightEl = document.createElement("span");
        rightEl.textContent = rightTxt;
        rightEl.style.cssText = "color:#94a3b8; white-space:nowrap;";
        line.appendChild(left);
        line.appendChild(rightEl);
        wrap.appendChild(line);

        // 2행: 📁 로컬 경로 + [📂 로컬 열기] + [✕ 제거] (target=custom:<name>).
        const l1 = document.createElement("div");
        l1.style.cssText = "display:flex; align-items:center; gap:8px; padding-left:22px; font-size:11px; color:#64748b; line-height:1.7; word-break:break-all;";
        const p1 = document.createElement("span");
        p1.textContent = `${typeIcon} ${f.path}`;
        // rel_path 는 Drive 로 공유되는 ComfyUI 루트 기준 상대경로 — 타 PC 에서도 동일 대상이 해석됨.
        p1.title = f.rel_path ? `${f.path}\n(Drive 공유 상대경로: ${f.rel_path})` : f.path;
        l1.appendChild(p1);
        if (f.exists) {
            const openBtn = document.createElement("button");
            openBtn.type = "button";
            openBtn.style.cssText = "flex-shrink:0; background:rgba(34,197,94,0.15); border:1px solid rgba(34,197,94,0.4); color:#bbf7d0; border-radius:6px; padding:2px 10px; font-size:11px; font-weight:700; cursor:pointer;";
            openBtn.textContent = isKo ? "📂 로컬 열기" : "📂 Open local";
            openBtn.title = f.path;
            openBtn.addEventListener("click", (e) => { e.stopPropagation(); callOpenLocal(`custom:${f.name}`, openBtn); });
            l1.appendChild(openBtn);
        }
        const rmBtn = document.createElement("button");
        rmBtn.type = "button";
        rmBtn.style.cssText = "flex-shrink:0; background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.4); color:#fca5a5; border-radius:6px; padding:2px 10px; font-size:11px; font-weight:700; cursor:pointer;";
        rmBtn.textContent = isKo ? "✕ 제거" : "✕ Remove";
        rmBtn.title = isKo ? "등록 해제 (로컬·Drive 파일은 삭제되지 않음)" : "Unregister only — local & Drive files are kept";
        rmBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (rmBtn.disabled) return;
            // 제거는 데이터 삭제가 아님(로컬·Drive 보존, 타 PC 전파) — 오클릭 방지용 확인 절차.
            const msg = isKo
                ? `'${f.name}' 대상을 동기화에서 제거할까요?\n\n로컬 파일과 Drive 복사본은 삭제되지 않고, 모든 PC의 동기화 범위에서만 제외됩니다.`
                : `Remove '${f.name}' from sync targets?\n\nLocal files and the Drive copy are NOT deleted — it is only excluded from sync on all PCs.`;
            if (!confirm(msg)) return;
            rmBtn.disabled = true;
            try {
                const r = await fetch("/api/bada/cloud/custom-folder-remove", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: f.name }),
                });
                const s = await r.json();
                if (s.success) {
                    rmBtn.textContent = isKo ? "✅ 제거됨" : "✅ Removed";
                    delete customCounts[f.name];
                    fetchCustomFolders(); // 목록 갱신
                } else {
                    rmBtn.textContent = isKo ? "⚠️ 실패" : "⚠️ Failed";
                    rmBtn.title = s.error || "";
                    setTimeout(paintDetailFiles, 1600);
                }
            } catch (_) {
                rmBtn.textContent = isKo ? "⚠️ 실패" : "⚠️ Failed";
                setTimeout(paintDetailFiles, 1600);
            }
        });
        l1.appendChild(rmBtn);

        // 3행: ☁️ Drive 경로 + [🔗 Drive 열기] (조회 전용 — 아직 동기화 전이면 서버가 실패로 응답).
        const l2 = document.createElement("div");
        l2.style.cssText = "display:flex; align-items:center; gap:8px; padding-left:22px; font-size:11px; color:#64748b; line-height:1.7; word-break:break-all;";
        const defaultRemote = f.is_file ? `Custom/${f.name}` : `Custom/${f.name}/`;
        const rn = (cnt && cnt.remote_name) || defaultRemote;
        const p2 = document.createElement("span");
        p2.textContent = `☁️ Drive: ${rn}`;
        p2.title = rn;
        l2.appendChild(p2);
        const driveBtn = document.createElement("button");
        driveBtn.type = "button";
        driveBtn.style.cssText = "flex-shrink:0; background:rgba(56,189,248,0.15); border:1px solid rgba(56,189,248,0.4); color:#bae6fd; border-radius:6px; padding:2px 10px; font-size:11px; font-weight:700; cursor:pointer;";
        driveBtn.textContent = isKo ? "🔗 Drive 열기" : "🔗 Open Drive";
        driveBtn.title = isKo ? "Google Drive 에서 해당 대상 열기 (아직 동기화 전이면 실패)" : "Open in Google Drive (fails if not synced yet)";
        driveBtn.addEventListener("click", (e) => { e.stopPropagation(); callOpenDrive(`custom:${f.name}`, driveBtn); });
        l2.appendChild(driveBtn);

        wrap.appendChild(l1);
        wrap.appendChild(l2);
        sec.appendChild(wrap);
    }

    body.appendChild(sec);
}

function paintDetailFiles() {
    if (!detailModalEl) return;
    const isKo = (BadaI18n.lang === "ko");
    const body = detailModalEl.querySelector("#bada-detail-files-body");
    if (!body) return;
    // 1초 폴링 재렌더 시 포커스 유지 — 커스텀 추가 폼 입력 중 DOM 재생성으로 포커스가
    // 날아가 타이핑이 끊기는 문제 방지. (값은 customAddDraft/customAddName 이 보존)
    let restoreField = null, selStart = 0, selEnd = 0;
    const activeEl = document.activeElement;
    if (activeEl && body.contains(activeEl) && activeEl.dataset && activeEl.dataset.field) {
        restoreField = activeEl.dataset.field;
        try { selStart = activeEl.selectionStart ?? 0; selEnd = activeEl.selectionEnd ?? 0; } catch (_) {}
    }
    body.textContent = "";
    for (const f of detailFilesSnapshot) {
        const lbl = FILE_LABELS[f.name] || { ko: f.name, en: f.name };
        const label = isKo ? lbl.ko : lbl.en;
        const mark = f.exists ? "✅" : "➖";
        const sz = fmtSize(f.size);
        const localCnt = (typeof f.count === "number") ? f.count : null;
        const rt = remoteTargetByName(f.name);
        // 오른쪽: 로컬 개수 · 원격 개수/상태 · 용량
        // config: 원격 내용 개수 API 불가 → "원격 있음/없음"만.
        // workflows: 원격 파일 수 확정 → "로컬 N개 · 원격 M개".
        let rightParts = [];
        if (!f.exists) {
            rightParts = [isKo ? "없음" : "absent"];
        } else if (f.name === "workflows") {
            const lc = (localCnt !== null) ? `${localCnt}${isKo ? "개" : ""}` : "";
            let rc = "";
            if (rt && typeof rt.remote_count === "number") {
                rc = `${isKo ? "원격 " : "remote "}${rt.remote_count}${isKo ? "개" : ""}`;
                if (localCnt !== null && rt.remote_count !== localCnt) {
                    const diff = localCnt - rt.remote_count;
                    rc += diff > 0
                        ? (isKo ? ` (⏳ ${diff}개 차이)` : ` (⏳ ${diff} pending)`)
                        : (isKo ? ` (☁️ ${-diff}개 많음)` : ` (☁️ ${-diff} more)`);
                } else if (localCnt !== null) {
                    rc += " ✅";
                }
            } else if (detailRemoteError) {
                rc = isKo ? "원격 확인 실패" : "remote check failed";
            } else {
                rc = isKo ? "원격 확인 중…" : "checking remote…";
            }
            rightParts = [[lc ? `${isKo ? "로컬 " : "local "}${lc}` : "", rc].filter(Boolean).join(" · "), sz].filter(Boolean);
        } else {
            const lc = (localCnt !== null) ? `${isKo ? "내용 " : ""}${localCnt}${isKo ? "개" : ""}` : (isKo ? "있음" : "present");
            let rc = "";
            const rCnt = (rt && typeof rt.remote_count === "number") ? rt.remote_count : null;
            if (rCnt !== null) {
                rc = `${isKo ? "원격 " : "remote "}${rCnt}${isKo ? "개" : ""}`;
                if (localCnt !== null && rCnt !== localCnt) {
                    const diff = localCnt - rCnt;
                    rc += diff > 0
                        ? (isKo ? ` (⏳ ${diff}개 차이)` : ` (⏳ ${diff} pending)`)
                        : (isKo ? ` (☁️ ${-diff}개 많음)` : ` (☁️ ${-diff} more)`);
                } else if (localCnt !== null) {
                    rc += " ✅";
                }
            } else if (rt && rt.remote_exists) {
                rc = isKo ? "원격 있음" : "remote ✓";
            } else if (rt) {
                rc = isKo ? "원격 없음" : "no remote";
            } else if (detailRemoteError) {
                rc = isKo ? "원격 확인 실패" : "remote check failed";
            } else {
                rc = isKo ? "원격 확인 중…" : "checking remote…";
            }
            rightParts = [[lc, rc].filter(Boolean).join(" · "), sz].filter(Boolean);
        }
        const wrap = document.createElement("div");
        wrap.style.cssText = "border-bottom:1px solid rgba(148,163,184,0.12);";
        const line = document.createElement("button");
        line.type = "button";
        line.style.cssText = "width:100%; display:flex; justify-content:space-between; gap:16px; line-height:1.9; background:none; border:none; padding:0; cursor:pointer; font-size:13px; color:#cbd5e1; text-align:left;";
        line.title = isKo ? "클릭하면 추적 경로 표시" : "Click for tracked paths";
        const left = document.createElement("span");
        const arrow = detailExpanded[f.name] !== false ? "\u25be" : "\u25b8";
        left.textContent = `${arrow} ${mark} ${label}`;
        const rightEl = document.createElement("span");
        rightEl.textContent = rightParts.join(" · ") || "";
        rightEl.style.cssText = "color:#94a3b8; white-space:nowrap;";
        line.appendChild(left);
        line.appendChild(rightEl);
        line.addEventListener("click", (e) => {
            e.stopPropagation();
            detailExpanded[f.name] = (detailExpanded[f.name] !== false) ? false : true;
            paintDetailFiles();
        });
        wrap.appendChild(line);
        // 펼침: 로컬 절대경로 + Drive 원격 이름 (읽기 전용, 추후 사용자 설정 대비).
        if (detailExpanded[f.name] !== false) {
            const sub = document.createElement("div");
            sub.style.cssText = "padding:2px 0 8px 22px; font-size:11px; color:#64748b; line-height:1.7; word-break:break-all;";
            const rt2 = remoteTargetByName(f.name) || localPathByName(f.name);
            const lp = (rt2 && rt2.local_path) || "";
            let rn = (rt2 && rt2.remote_name) || "";
            if (!rn) { const fb = localPathByName(f.name); rn = (fb && (fb.remote_name || fb.remoteName)) || ""; }
            const l1 = document.createElement("div");
            l1.style.cssText = "display:flex; align-items:center; gap:8px;";
            const p1 = document.createElement("span");
            p1.textContent = `📁 ${lp || (isKo ? "로컬 경로 확인 중…" : "resolving local path…")}`;
            p1.title = lp;
            l1.appendChild(p1);
            // "로컬 열기" 버튼 — 서버 화이트리스트 검증 후 탐색기에서 폴더 오픈 (파일은 /select 하이라이트).
            if (lp) {
                const openBtn = document.createElement("button");
                openBtn.type = "button";
                openBtn.style.cssText = "flex-shrink:0; background:rgba(34,197,94,0.15); border:1px solid rgba(34,197,94,0.4); color:#bbf7d0; border-radius:6px; padding:2px 10px; font-size:11px; font-weight:700; cursor:pointer;";
                openBtn.textContent = isKo ? "📂 로컬 열기" : "📂 Open local";
                openBtn.title = `${lp} · ${isKo ? "탐색기에서 폴더 열기 (파일은 하이라이트)" : "open folder in Explorer (file highlighted)"}`;
                openBtn.addEventListener("click", (e) => { e.stopPropagation(); callOpenLocal(f.name, openBtn); });
                l1.appendChild(openBtn);
            }
            const l2 = document.createElement("div");
            l2.style.cssText = "display:flex; align-items:center; gap:8px;";
            const p2 = document.createElement("span");
            p2.textContent = `☁️ Drive: ${rn || (isKo ? "원격 확인 중…" : "checking remote…")}`;
            p2.title = rn;
            l2.appendChild(p2);
            // "Drive 열기" 버튼 — 서버 화이트리스트 검증 후 해당 **동기화 폴더**(Presets/SystemPrompts 등)를 새 탭으로 오픈.
            if (rn) {
                const driveBtn = document.createElement("button");
                driveBtn.type = "button";
                driveBtn.style.cssText = "flex-shrink:0; background:rgba(56,189,248,0.15); border:1px solid rgba(56,189,248,0.4); color:#bae6fd; border-radius:6px; padding:2px 10px; font-size:11px; font-weight:700; cursor:pointer;";
                driveBtn.textContent = isKo ? "🔗 Drive 열기" : "🔗 Open Drive";
                driveBtn.title = isKo ? "Google Drive 에서 해당 동기화 폴더 열기" : "Open the sync folder in Google Drive";
                driveBtn.addEventListener("click", (e) => { e.stopPropagation(); callOpenDrive(f.name, driveBtn); });
                l2.appendChild(driveBtn);
            }
            sub.appendChild(l1);
            sub.appendChild(l2);
            wrap.appendChild(sub);
        }
        body.appendChild(wrap);
    }
    // 커스텀 폴더 섹션 — 내장 5개 섹션 아래에 추가 (동일 스타일 재사용).
    paintCustomSection(body, isKo);
    // 재렌더 후 포커스·커서 복원 — 입력 중이던 입력란으로 되돌린다.
    if (restoreField) {
        const el = body.querySelector(`[data-field="${restoreField}"]`);
        if (el && typeof el.focus === "function") {
            try {
                el.focus({ preventScroll: true });
                el.setSelectionRange(selStart, selEnd);
            } catch (_) {}
        }
    }
}

function renderDetailModal() {
    const isKo = (BadaI18n.lang === "ko");
    detailModalEl.innerHTML = `
        <div class="usp-modal-container" style="max-width:720px; height:auto; max-height:84vh; min-height:0;">
            <div class="usp-modal-header" style="background:rgba(14,165,233,0.07); border-bottom:1px solid rgba(14,165,233,0.25);">
                <div class="usp-header-title-box">
                    <div class="usp-header-icon" style="background:rgba(14,165,233,0.2); border-color:rgba(14,165,233,0.4); color:#bae6fd;">☁️</div>
                    <div>
                        <h3 class="usp-header-title" style="font-size:17px; color:#f8fafc; font-weight:700; margin:0;">${isKo ? "클라우드 동기화 상세" : "Cloud Sync Details"}</h3>
                        <p class="usp-header-subtitle" style="font-size:12px; color:#94a3b8; margin:4px 0 0 0;">${isKo ? "진행률 · 현재 파일 · 항목별 현황" : "Progress · current file · per-target status"}</p>
                    </div>
                </div>
                <button class="usp-close-btn" id="bada-detail-close-x" style="background:none; border:none; font-size:22px; color:#94a3b8; cursor:pointer; padding:6px 12px; border-radius:8px;">✕</button>
            </div>
            <div style="padding:18px 24px; overflow-y:auto;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:8px;">
                    <span id="bada-detail-progress-frac" style="font-size:14px; font-weight:700; color:#e2e8f0;">${isKo ? "\ud655\uc778 \uc911\u2026" : "Checking..."}</span>
                    <button id="bada-detail-sync-btn" data-mode="sync" style="background:rgba(14,165,233,0.2); border:1px solid rgba(14,165,233,0.4); color:#e0f2fe; border-radius:6px; padding:5px 12px; font-size:12px; font-weight:700; cursor:pointer;">${isKo ? "☁️ 지금 동기화" : "☁️ Sync now"}</button>
                </div>
                <div style="width:100%; height:10px; background:rgba(148,163,184,0.15); border-radius:5px; overflow:hidden; margin-bottom:8px;">
                    <div id="bada-detail-progress-bar" style="height:100%; width:0%; background:linear-gradient(90deg,#0ea5e9,#0284c7); border-radius:5px; transition:width 0.3s;"></div>
                </div>
                <div id="bada-detail-progress-current" title="" style="font-size:12px; color:#94a3b8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:4px;"></div>
                <div id="bada-detail-state-line" style="font-size:12px; color:#64748b; margin-bottom:14px;"></div>
                <div id="bada-detail-files-body" style="font-size:13px; color:#cbd5e1;"></div>
            </div>
            <div style="padding:14px 24px; background:rgba(255,255,255,0.02); border-top:1px solid rgba(255,255,255,0.07); display:flex; justify-content:flex-end;">
                <button id="bada-detail-close-btn" class="usp-btn usp-btn-secondary" style="font-size:13px; padding:8px 20px; background:rgba(14,165,233,0.2); border:1px solid rgba(14,165,233,0.4); color:#e0f2fe; border-radius:8px; cursor:pointer; font-weight:600;">${isKo ? "✕ 닫기" : "✕ Close"}</button>
            </div>
        </div>
    `;
    // 닫기는 팝업만 — 설정창 전파 차단.
    // bubble 단계에서만 막는다 (버튼이 먼저 받고 document로 올라가기 전 차단).
    const stopBubble = (e) => { e.stopPropagation(); };
    detailModalEl.addEventListener("pointerdown", stopBubble);
    detailModalEl.addEventListener("mousedown", stopBubble);
    detailModalEl.addEventListener("mouseup", stopBubble);
    detailModalEl.addEventListener("click", stopBubble);
    detailModalEl.querySelector("#bada-detail-close-x")?.addEventListener("click", (e) => { stopBubble(e); closeCloudDetailModal(); });
    detailModalEl.querySelector("#bada-detail-close-btn")?.addEventListener("click", (e) => { stopBubble(e); closeCloudDetailModal(); });
    detailModalEl.addEventListener("click", (e) => {
        if (e.target === detailModalEl) { closeCloudDetailModal(); }
    });
    detailModalEl.querySelector("#bada-detail-sync-btn")?.addEventListener("click", async (e) => {
        stopBubble(e);
        const btn = detailModalEl.querySelector("#bada-detail-sync-btn");
        const mode = (btn && btn.dataset.mode) || "sync";
        try {
            if (mode === "cancel") {
                await fetch("/api/bada/cloud/cancel", { method: "POST" });
            } else {
                await fetch("/api/bada/cloud/sync", { method: "POST" });
            }
        } catch (_) { /* polling detects change */ }
    });
    paintDetailFiles();
}
