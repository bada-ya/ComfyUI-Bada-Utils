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
let detailFilesLastSig = null; // 동일 스냅샷+상태면 재렌더 생략 (PRO 전환은 별도 시그니처)
let detailLastSyncSnapshot = null;
// 원격 개수+경로 스냅샷 (팝업 열 때 1회 조회, 1초 폴링과 분리).
let detailRemoteSnapshot = null;
let detailRemoteError = "";
// expand state (name -> false means collapsed). Default expanded; paths prefilled from status.
let detailExpanded = {};
// ── 커스텀 폴더 섹션 상태 — 팝업 열 때 1회 조회 + 추가/제거 후 갱신 (1초 폴링과 분리). ──
let customFolders = [];        // [{name, path, rel_path, exists, is_file}] — path 는 이 PC 의 ComfyUI 위치로 해석된 절대경로
let customSyncEnabled = false; // 마스터 ON/OFF (custom_sync.enabled)
let customProActive = false;   // Bada PRO 활성화 상태 — 미발급이면 토글·추가 비활성화 + 발급 안내 표시
let customCounts = {};         // name -> remote-counts target ({local_count, remote_count, remote_exists, local_path, remote_name})
let customAddOpen = false;     // 인라인 추가 폼 표시 여부
let customAddError = "";       // 인라인 검증 에러 (빨간 글씨)
let customAddDraft = "";       // 입력 중 내용 보존 (재렌더링 시 복원)
let customAddName = "";        // Drive 이름(선택) 입력 중 내용 보존 — 비워두면 로컬 basename 사용
let customBrowseOpen = false;  // 미니 트리 표시 여부 (추가 폼이 열려 있을 때만)
let customBrowseRel = "";      // 탐색 중인 ComfyUI 기준 상대경로 ("" = 루트)
let customBrowseCache = {};    // rel -> browse-tree 스냅샷
let customBrowseLoading = null;  // 로딩 중인 rel (null = 유휴)
let customBrowseError = "";    // 트리 조회 에러

const MAX_NAME_LEN = 40;
// 열기 버튼의 임시 피드백(⏳ 여는 중… / ✅ 열림 / ⚠️ 실패)을 원래 라벨로 되돌리는 대기 시간.
const OPEN_BUTTON_REVERT_MS = 5000;
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
// Bada PRO 전용 동기화 대상 — 서버 PRO_ONLY_PERSONAL_DATA(gdrive_sync.py) 와 짝을 이룬다.
const PRO_ONLY_FILES = new Set(["gemini_chat_history.json"]);
const isProOnlyFile = (name) => PRO_ONLY_FILES.has(name);

const FILE_LABELS = {
    "presets_data.json": { ko: "⚓ 프리셋 (Regional Prompt)", en: "⚓ Presets (Regional Prompt)" },
    "favorites_data.json": { ko: "⭐ 즐겨찾기", en: "⭐ Favorites" },
    "gemini_chat_history.json": { ko: "⚓ 제미나이 채팅 기록", en: "⚓ Gemini chat history" },
    "engines_registry_user.json": { ko: "⚓ 시스템 프롬프트", en: "⚓ System prompts" },
    "workflows": { ko: "🗂️ 워크플로우 파일", en: "🗂️ Workflow files" },
};

export function isCloudDetailModalOpen() {
    return !!(detailModalEl && detailModalEl.classList.contains("active"));
}

// ── Drive 잔해 상태 — 동기화에서 제외한 대상이 Drive 에 남긴 복사본(용량) 추적.
// 서버는 최근 동기화가 수집한 캐시를 바로 돌려주고, 아직 스캔 전이면 읽기 전용 스캔을 1회 돈다.
let customResidue = [];           // [{name, folder_id, files, bytes}] — 등록 대상에 속하지 않는 고아 트리
let customResidueScannedAt = 0;   // 0 = 이번 세션에서 아직 스캔 전
let customResidueLoading = false;
let customResidueError = "";
let customResidueTruncated = false;

// ── 삭제 보관함(_deleted_custom) 상태 — 다른 PC 에서 삭제되어 이 PC 에서 물러난 파일들.
// 원래는 넣기만 하고 버리는 수단이 없었다. 보관 기간이 지난 항목은 동기화 후처리가 자동
// 정리하고, 이 모달에서 직접 고어서 영구 삭제할 수도 있다.
let customTrash = null;        // 서버 scan_custom_trash 응답 (null = 이번 세션 조회 전)
let customTrashLoading = false;
let customTrashError = "";
let customTrashBusy = false;   // 정리/보관기간 저장 진행 중 — 중복 클릭 방지

export function openCloudDetailModal(files, lastSync) {
    detailFilesSnapshot = Array.isArray(files) ? files : [];
    detailFilesLastSig = null; // 모달 재오픈 시 렌더 가드 초기화
    detailLastSyncSnapshot = lastSync || null;
    detailRemoteSnapshot = null;
    detailRemoteError = "";
    detailExpanded = {};
    customFolders = [];
    customSyncEnabled = false;
    customProActive = false; // 미발급으로 시작 — 조회 완료 시 갱신 (안전측).
    customCounts = {};
    customAddOpen = false;
    customAddError = "";
    customAddDraft = "";
    customAddName = "";
    customBrowseOpen = false;
    customBrowseRel = "";
    customBrowseCache = {};
    customBrowseLoading = null;
    customBrowseError = "";
    customResidue = [];
    customResidueScannedAt = 0;
    customResidueLoading = false;
    customResidueError = "";
    customResidueTruncated = false;
    customTrash = null;
    customTrashLoading = false;
    customTrashError = "";
    customTrashBusy = false;
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
    // Drive 잔해(제외된 대상의 Drive 복사본) 도 열 때 1회 확인.
    fetchCustomResidue();
    // 삭제 보관함 규모도 열 때 1회 (로컬 폴더를 세기만 한다 — 삭제 없음).
    fetchCustomTrash();
    // Bada PRO 상태 — 미발급이면 커스텀 동기화 섹션(토글·추가) 비활성화 + 발급 안내.
    // 조회 실패 시 미발급 상태로 유지 (안전측). 상태 변경 시에만 재렌더.
    fetch("/api/bada/cloud/pro/status").then((r) => r.json()).then((s) => {
        if (!s || !s.success) return;
        const next = !!s.active;
        if (next !== customProActive) {
            customProActive = next;
            if (isCloudDetailModalOpen()) paintDetailFiles();
        }
    }).catch(() => {});
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
    detailPollTimer = setInterval(tick, 3000);
}
function stopDetailPoll() {
    if (detailPollTimer) { clearInterval(detailPollTimer); detailPollTimer = null; }
}
// 원격 개수+경로 점진적(Progressive) 조회 — 가벼운 설정부터 즉시 표시하고 워크플로우를 뒤이어 갱신.
function isRemoteChecking() {
    const visible = Array.isArray(detailFilesSnapshot) ? detailFilesSnapshot.filter(f => f && f.name !== "custom_targets.json") : [];
    if (!visible.length) return false;
    if (!Array.isArray(detailRemoteSnapshot)) return true;
    return visible.some(f => !detailRemoteSnapshot.find(t => t.name === f.name));
}

async function fetchRemoteSnapshot() {
    if (!Array.isArray(detailRemoteSnapshot)) {
        detailRemoteSnapshot = [];
    }
    detailRemoteError = "";

    const items = Array.isArray(detailFilesSnapshot) ? detailFilesSnapshot.filter(f => f.name !== "custom_targets.json") : [];
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
// 피드백 라벨을 잠시 후 원래대로 되돌림. 클릭당 타이머 1개, DOM 은 라벨/title 만 건드림.
// 재렌더로 버튼이 교체된 경우(isConnected=false) 새 버튼이 이미 정상이므로 아무것도 하지 않는다.
function scheduleOpenButtonRevert(btn, label, title, delayMs = OPEN_BUTTON_REVERT_MS) {
    if (!btn) return;
    if (btn._openRevertTimer) clearTimeout(btn._openRevertTimer);
    btn._openRevertTimer = setTimeout(() => {
        btn._openRevertTimer = 0;
        if (!btn.isConnected) return;
        btn.textContent = label;
        btn.title = title;
        btn.disabled = false;
    }, delayMs);
}
// "로컬 열기" — 서버 측 화이트리스트 검증 + 탐색기에서 폴더 열림 (파일은 /select 하이라이트).
async function callOpenLocal(name, btn) {
    const isKo = BadaI18n.lang === "ko";
    if (!btn || btn.disabled) return;
    const baseLabel = btn.textContent;
    const baseTitle = btn.title || "";
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
    scheduleOpenButtonRevert(btn, baseLabel, baseTitle);
}
// "Drive 열기" — 서버 화이트리스트 검증 후 해당 Drive 파일/폴더 URL을 새 탭으로 오픈.
async function callOpenDrive(name, btn) {
    const isKo = BadaI18n.lang === "ko";
    if (!btn || btn.disabled) return;
    const baseLabel = btn.textContent;
    const baseTitle = btn.title || "";
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
    scheduleOpenButtonRevert(btn, baseLabel, baseTitle);
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

// Drive 잔해 조회 — 캐시(저렴한 즉답) → 이번 세션 첫 조회면 읽기 전용 스캔을 1회 시도한다.
async function fetchCustomResidue() {
    if (customResidueLoading) return;
    customResidueLoading = true;
    customResidueError = "";
    paintDetailFiles();
    try {
        const r = await fetch("/api/bada/cloud/custom-residue");
        const s = await r.json();
        if (s && s.success) {
            customResidue = Array.isArray(s.orphans) ? s.orphans : [];
            customResidueScannedAt = Number(s.scanned_at || 0);
            customResidueTruncated = !!s.truncated;
        } else {
            customResidueError = String((s && s.error) || "unknown");
        }
    } catch (_) {
        customResidueError = "network";
    }
    customResidueLoading = false;
    paintDetailFiles();
    if (!customResidueScannedAt && !customResidueError) scanCustomResidue();
}

// Drive Custom/ 트리를 직접 훑는 재스캔 — 읽기 전용(휴지통 이동 없음), 대상 트리가 깊으면 수 초 걸린다.
async function scanCustomResidue() {
    if (customResidueLoading) return;
    customResidueLoading = true;
    customResidueError = "";
    paintDetailFiles();
    try {
        const r = await fetch("/api/bada/cloud/custom-residue-scan", { method: "POST" });
        const s = await r.json();
        if (s && s.success) {
            customResidue = Array.isArray(s.orphans) ? s.orphans : [];
            customResidueScannedAt = Number(s.scanned_at || 0);
            customResidueTruncated = !!s.truncated;
        } else {
            customResidueError = String((s && s.error) || "unknown");
        }
    } catch (_) {
        customResidueError = "network";
    }
    customResidueLoading = false;
    paintDetailFiles();
}

// 잔해 1개를 Drive 휴지통으로 이동 — 영구 파기 아님(30일 복원). 동기화 대상은 서버가 거부한다.
async function purgeCustomResidue(name, btn, isKo) {
    if (!btn || btn.disabled) return;
    const msg = isKo
        ? `Drive 의 'Custom/${name}' 을 정리할까요?\n\n이 대상은 이미 동기화에서 제외되어 어느 PC 의 파일에도 영향을 주지 않습니다.\nDrive 휴지통으로만 이동하며 30일 안에 복원할 수 있습니다.`
        : `Move 'Custom/${name}' to the Drive trash?\n\nThis target is already excluded from sync — no PC's files are affected.\nIt is only moved to the Drive trash (restorable for 30 days).`;
    if (!confirm(msg)) return;
    btn.disabled = true;
    btn.textContent = isKo ? "정리 중…" : "Moving…";
    try {
        const r = await fetch("/api/bada/cloud/custom-residue-purge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name }),
        });
        const s = await r.json();
        if (s && s.success) {
            customResidue = customResidue.filter((o) => String(o.name) !== String(name));
            paintDetailFiles();
            return;
        }
        btn.title = String((s && s.error) || "");
        btn.textContent = isKo ? "⚠️ 실패" : "⚠️ Failed";
    } catch (err) {
        btn.title = String(err || "");
        btn.textContent = isKo ? "⚠️ 실패" : "⚠️ Failed";
    }
    scheduleOpenButtonRevert(btn, isKo ? "🗑 Drive에서 정리" : "🗑 Purge from Drive",
        isKo ? "이 폴더를 Drive 휴지통으로 (30일 복원 가능)" : "Move this folder to the Drive trash (30-day restore)");
}

// ── Drive 잔해 섹션 — 제외된 대상이 Drive 에 남긴 파일을 눈으로 확인시키고 정리한다.
// 동기화 대상 목록이 비어 있어도 그려야 한다 — 대상을 전부 해제한 뒤가 바로 그 상황이다.
function paintCustomResidue(sec, isKo) {
    if (!customProActive) return; // 미발급이면 커스텀 동기화 자체가 존재하지 않는다
    if (!customResidue.length && !customResidueLoading && !customResidueError && !customResidueScannedAt) return;

    const box = document.createElement("div");
    box.style.cssText = "margin-top:10px; border:1px solid rgba(245,158,11,0.35); border-radius:8px; background:rgba(245,158,11,0.07); padding:8px 10px; font-size:12px;";

    const head = document.createElement("div");
    head.style.cssText = "display:flex; align-items:center; justify-content:space-between; gap:10px; font-weight:700; color:#fcd34d;";
    const totalMB = (customResidue.reduce((n, o) => n + (Number(o.bytes) || 0), 0) / 1048576).toFixed(1);
    const title = document.createElement("span");
    title.textContent = customResidue.length
        ? (isKo ? `🧹 Drive에 남은 잔해 ${customResidue.length}건 · ${totalMB}MB`
                : `🧹 Drive leftovers ${customResidue.length} · ${totalMB}MB`)
        : (isKo ? "🧹 Drive 잔해" : "🧹 Drive leftovers");
    head.appendChild(title);
    const again = document.createElement("button");
    again.type = "button";
    again.style.cssText = "flex-shrink:0; background:rgba(56,189,248,0.15); border:1px solid rgba(56,189,248,0.4); color:#bae6fd; border-radius:6px; padding:2px 10px; font-size:11px; font-weight:700; cursor:pointer;";
    again.textContent = customResidueLoading ? (isKo ? "확인 중…" : "Scanning…") : (isKo ? "🔄 다시 확인" : "🔄 Re-scan");
    again.title = isKo ? "Drive Custom/ 트리를 다시 훑습니다 (읽기 전용 — 아무것도 지우지 않음)"
                       : "Re-scan the Drive Custom/ tree (read-only — nothing is deleted)";
    again.disabled = customResidueLoading;
    again.addEventListener("click", () => scanCustomResidue());
    head.appendChild(again);
    box.appendChild(head);

    // 마지막 확인 시각을 항상 보여준다 — 재스캔이 실제로 돌아갔다는 눈으로 보이는 증거.
    // (스캔이 5초 남짓 걸려도 버튼 상태만 바뀌면 알아채기 어렵다.)
    if (customResidueScannedAt) {
        const when = document.createElement("div");
        when.style.cssText = "margin-top:2px; font-size:11px; color:#94a3b8;";
        const ts = new Date(customResidueScannedAt * 1000).toLocaleTimeString();
        when.textContent = (isKo ? "마지막 확인: " : "Last checked: ") + ts
            + (customResidueLoading ? (isKo ? " (확인 중…)" : " (scanning…)") : "");
        box.appendChild(when);
    }

    if (customResidueError) {
        const err = document.createElement("div");
        err.style.cssText = "margin-top:4px; color:#fca5a5;";
        err.textContent = (isKo ? "잔해 확인 실패: " : "Residue scan failed: ") + customResidueError;
        box.appendChild(err);
    }
    if (customResidueTruncated) {
        const warn = document.createElement("div");
        warn.style.cssText = "margin-top:4px; color:#fbbf24;";
        warn.textContent = isKo
            ? "⚠️ 폴더 수가 많아 일부만 확인했습니다 — 목록이 실제보다 짧을 수 있습니다."
            : "⚠️ Too many folders — only part of the tree was scanned.";
        box.appendChild(warn);
    }
    if (!customResidue.length) {
        const ok = document.createElement("div");
        ok.style.cssText = "margin-top:4px; color:#86efac;";
        ok.textContent = isKo
            ? "✅ 동기화 범위 밖의 Drive 잔해가 없습니다."
            : "✅ No Drive copies outside the sync scope.";
        box.appendChild(ok);
    }
    for (const o of customResidue) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex; align-items:center; gap:8px; margin-top:5px; color:#e2e8f0; word-break:break-all;";
        const mb = ((Number(o.bytes) || 0) / 1048576).toFixed(1);
        const info = document.createElement("span");
        info.textContent = `☁️ Custom/${o.name} — ` + (isKo
            ? `파일 ${Number(o.files) || 0}개 · ${mb}MB`
            : `${Number(o.files) || 0} files · ${mb}MB`);
        info.title = isKo ? "동기화에서 제외되었지만 Drive 에 남아 용량을 차지합니다"
                          : "Excluded from sync but still stored in Drive";
        row.appendChild(info);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.style.cssText = "flex-shrink:0; background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.4); color:#fca5a5; border-radius:6px; padding:2px 10px; font-size:11px; font-weight:700; cursor:pointer;";
        btn.textContent = isKo ? "🗑 Drive에서 정리" : "🗑 Purge from Drive";
        btn.title = isKo ? "Drive 휴지통으로 이동 (30일 복원 가능)" : "Move to the Drive trash (restorable for 30 days)";
        btn.addEventListener("click", () => purgeCustomResidue(String(o.name || ""), btn, isKo));
        row.appendChild(btn);
        box.appendChild(row);
    }

    const note = document.createElement("div");
    note.style.cssText = "margin-top:6px; font-size:11px; color:#94a3b8;";
    note.textContent = isKo
        ? "정리는 Drive 휴지통으로 이동만 합니다 (30일 복원 가능) — 현재 동기화 대상은 이 목록에 나타나지 않습니다."
        : "Purging only moves folders to the Drive trash (30-day restore) — active targets never appear here.";
    box.appendChild(note);
    sec.appendChild(box);
}


// 미니 트리 박스 ① — 헤더(breadcrumb + 현재 폴더 선택 버튼).
function paintCustomBrowseTree(sec, isKo) {
    if (!customBrowseOpen) return;
    const box = document.createElement("div");
    // 1초 폴링 재렌더 시 스크롤 유지용 식별자 — paintDetailFiles 가 복원한다.
    box.id = "bada-custom-browse-box";
    box.style.cssText = "margin:6px 0 2px 4px;border:1px solid rgba(148,163,184,0.3);border-radius:8px;background:rgba(15,23,42,0.5);padding:8px 10px;font-size:12px;max-height:240px;overflow-y:auto;";
    const key = customBrowseRel || "";
    const snap = customBrowseCache[key];
    const head = document.createElement("div");
    head.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;";
    const crumb = document.createElement("div");
    crumb.style.cssText = "display:flex;align-items:center;flex-wrap:wrap;gap:2px;color:#94a3b8;min-width:0;";
    const mkCrumb = (label, rel, isLast) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.style.cssText = isLast ? "background:none;border:none;color:#e2e8f0;font-size:12px;font-weight:700;padding:1px 3px;" : "background:none;border:none;color:#7dd3fc;font-size:12px;cursor:pointer;padding:1px 3px;text-decoration:underline;";
        if (!isLast) b.addEventListener("click", () => { customBrowseRel = rel; fetchCustomBrowse(rel); paintDetailFiles(); });
        return b;
    };
    crumb.appendChild(mkCrumb("ComfyUI", "", key === ""));
    if (key) {
        const parts = key.split("/");
        let acc = "";
        parts.forEach((pt, i) => {
            const sep = document.createElement("span");
            sep.textContent = " › ";
            crumb.appendChild(sep);
            acc = acc ? (acc + "/" + pt) : pt;
            crumb.appendChild(mkCrumb(pt, acc, i === parts.length - 1));
        });
    }
    head.appendChild(crumb);
    const hereBtn = document.createElement("button");
    hereBtn.type = "button";
    hereBtn.textContent = isKo ? "현재 폴더 선택" : "Select folder";
    if (!key || !snap) {
        hereBtn.disabled = true;
        hereBtn.title = isKo ? "하위 폴더로 이동한 뒤 선택" : "Enter a subfolder first";
        hereBtn.style.cssText = "flex-shrink:0;background:rgba(148,163,184,0.1);border:1px solid rgba(148,163,184,0.25);color:#64748b;border-radius:6px;padding:3px 10px;font-size:11px;cursor:not-allowed;";
    } else {
        hereBtn.title = snap.path || "";
        hereBtn.style.cssText = "flex-shrink:0;background:rgba(14,165,233,0.2);border:1px solid rgba(14,165,233,0.4);color:#e0f2fe;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:700;cursor:pointer;";
        hereBtn.addEventListener("click", () => { customAddDraft = snap.path || ""; paintDetailFiles(); });
    }
    head.appendChild(hereBtn);
    box.appendChild(head);
    paintCustomBrowseTreeBody(box, isKo, key, snap);
    sec.appendChild(box);
}

// 미니 트리 박스 2 — 로딩/에러 분기 후 목록으로 위임.
function paintCustomBrowseTreeBody(box, isKo, key, snap) {
    if (customBrowseLoading === key) {
        const ld = document.createElement("div");
        ld.style.cssText = "padding:8px 4px;color:#94a3b8;";
        ld.textContent = isKo ? "불러오는 중…" : "Loading…";
        box.appendChild(ld);
        return;
    }
    if (customBrowseError || !snap) {
        const er = document.createElement("div");
        er.style.cssText = "padding:6px 4px;color:#fca5a5;";
        er.textContent = "⚠️ " + (customBrowseError || (isKo ? "목록 없음" : "No data"));
        box.appendChild(er);
        const retry = document.createElement("button");
        retry.type = "button";
        retry.textContent = isKo ? "다시 시도" : "Retry";
        retry.style.cssText = "background:none;border:1px solid rgba(148,163,184,0.35);color:#94a3b8;border-radius:6px;padding:2px 10px;font-size:11px;cursor:pointer;margin:2px 0 4px 4px;";
        retry.addEventListener("click", () => { delete customBrowseCache[key]; fetchCustomBrowse(key); });
        box.appendChild(retry);
        return;
    }
    paintCustomBrowseRows(box, isKo, snap);
}

// 미니 트리 박스 ③ — 폴더/파일 행 목록.
function paintCustomBrowseRows(box, isKo, snap) {
    const key = customBrowseRel || "";
    const normAbs = (p) => String(p || "").replace(/\\/g, "/").toLowerCase();
    const cleanDraft = customAddDraft.trim().replace(/^"+|"+$/g, "").trim();
    if (key) {
        const up = document.createElement("div");
        up.style.cssText = "padding:3px 6px;border-radius:6px;cursor:pointer;color:#7dd3fc;";
        up.textContent = "⬆ ..";
        up.addEventListener("click", () => { customBrowseRel = snap.parent_rel || ""; fetchCustomBrowse(customBrowseRel); paintDetailFiles(); });
        box.appendChild(up);
    }
    const mkRow = (icon, label, sub, absPath, enterRel) => {
        const selected = !!(cleanDraft && absPath && normAbs(cleanDraft) === normAbs(absPath));
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:8px;padding:3px 6px;border-radius:6px;" + (selected ? "background:rgba(34,197,94,0.15);outline:1px solid rgba(34,197,94,0.5);" : "");
        row.title = absPath || "";
        // 좌측 체크박스 — 폴더/파일 공통. 체크하면 입력창에 경로 지정 (=선택).
        // 진입과 완전히 분리: 체크박스 클릭은 버블링 차단, 행 클릭은 진입(폴더)/지정(파일).
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = selected;
        cb.title = absPath || "";
        cb.style.cssText = "flex-shrink:0;width:15px;height:15px;accent-color:#22c55e;cursor:pointer;margin:0;";
        cb.addEventListener("click", (e) => {
            e.stopPropagation();
            customAddDraft = absPath || "";
            paintDetailFiles();
        });
        row.appendChild(cb);
        const left = document.createElement("span");
        left.style.cssText = "color:#cbd5e1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;cursor:pointer;";
        left.textContent = icon + " " + label + (sub ? "  (" + sub + ")" : "") + (selected ? " ✅" : "");
        left.title = (enterRel ? (isKo ? "클릭: 폴더 안으로 진입" : "Click: enter folder") + " · " : "") + (absPath || "");
        left.addEventListener("click", (e) => {
            e.stopPropagation();
            if (enterRel) { customBrowseRel = enterRel; fetchCustomBrowse(enterRel); }
            else { customAddDraft = absPath || ""; }
            paintDetailFiles();
        });
        row.appendChild(left);
        box.appendChild(row);
    };
    const folders = (snap && snap.folders) || [];
    const files = (snap && snap.files) || [];
    for (const d of folders) mkRow("📁", d.name, "", d.path, d.rel_path);
    for (const fl of files) mkRow("📄", fl.name, fmtSize(fl.size), fl.path, null);
    if (!folders.length && !files.length) {
        const em = document.createElement("div");
        em.style.cssText = "padding:8px 4px;color:#64748b;";
        em.textContent = isKo ? "빈 폴더입니다" : "Empty folder";
        box.appendChild(em);
    }
    if ((snap && snap.truncated_dirs) || (snap && snap.truncated_files)) {
        const tr = document.createElement("div");
        tr.style.cssText = "padding:4px 6px;font-size:11px;color:#fbbf24;";
        tr.textContent = isKo ? "⚠️ 항목이 많아 일부만 표시 — 하위 폴더로 이동" : "⚠️ Showing first 300 — enter a subfolder";
        box.appendChild(tr);
    }
}

// 미니 트리 조회 — rel 1단계 목록을 캐시에 저장 (중복 요청 방지).
async function fetchCustomBrowse(rel) {
    const key = rel || "";
    if (customBrowseCache[key] || customBrowseLoading === key) return;
    customBrowseLoading = key;
    customBrowseError = "";
    paintDetailFiles();
    const isKo = (BadaI18n.lang === "ko");
    try {
        const r = await fetch(`/api/bada/cloud/browse-tree?path=${encodeURIComponent(key)}`);
        const s = await r.json();
        if (s.success) {
            customBrowseCache[key] = s;
            customBrowseError = "";
        } else {
            customBrowseError = s.error || (isKo ? "목록을 불러오지 못했습니다" : "Failed to load");
        }
    } catch (_) {
        customBrowseError = isKo ? "서버 오류 — 다시 시도하세요 (ComfyUI 재시작 필요 가능)" : "Server error — retry (may need ComfyUI restart)";
    }
    customBrowseLoading = null;
    paintDetailFiles();
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
    // Bada PRO 미발급이면 disabled + 회색 (클릭 무반응) — 발급 안내 툴팁.
    const swLabel = document.createElement("label");
    swLabel.className = "bada-cloud-switch";
    swLabel.style.cssText = "margin:0; flex-shrink:0;" + (customProActive ? " cursor:pointer;" : " cursor:not-allowed; opacity:0.45;");
    const swInput = document.createElement("input");
    swInput.type = "checkbox";
    swInput.checked = customSyncEnabled;
    if (!customProActive) {
        swInput.disabled = true;
        swInput.title = isKo ? "Bada PRO 미발급 — 발급 후 사용 가능" : "Bada PRO required — activate to use";
    } else {
        swInput.title = isKo ? "커스텀 동기화 ON/OFF (폴더·파일)" : "Custom sync ON/OFF (folders & files)";
    }
    const swSpan = document.createElement("span");
    swSpan.className = "bada-cloud-slider";
    swLabel.appendChild(swInput);
    swLabel.appendChild(swSpan);
    // 마스터 토글 — 서버 영속화 (custom_sync.enabled), 실패 시 체크박스 되돌림. 미발급이면 리스너 미부착.
    if (customProActive) {
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
    }
    rightCtl.appendChild(swLabel);

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    if (customProActive) {
        addBtn.style.cssText = "background:rgba(14,165,233,0.2); border:1px solid rgba(14,165,233,0.4); color:#e0f2fe; border-radius:6px; padding:3px 12px; font-size:12px; font-weight:700; cursor:pointer;";
    } else {
        addBtn.disabled = true;
        addBtn.style.cssText = "background:rgba(148,163,184,0.1); border:1px solid rgba(148,163,184,0.25); color:#64748b; border-radius:6px; padding:3px 12px; font-size:12px; font-weight:700; cursor:not-allowed;";
        addBtn.title = isKo ? "Bada PRO 미발급 — 발급 후 사용 가능" : "Bada PRO required — activate to use";
    }
    addBtn.textContent = isKo ? "+ 추가" : "+ Add";
    rightCtl.appendChild(addBtn);

    header.appendChild(rightCtl);
    sec.appendChild(header);

    // 미발급 안내는 PRO 그룹 헤더 아래 통합 공지(paintProSectionHeader) 가 담당한다 — 중복 제거.

    // 인라인 추가 폼 — [경로 입력][확인][✕] + 빨간 검증 에러 (팝업 없음). 미발급이면 폼 자체가 열리지 않음.
    if (customAddOpen && customProActive) {
        const form = document.createElement("div");
        form.style.cssText = "display:flex; align-items:center; gap:8px; padding:6px 0 2px 4px;";
        const input = document.createElement("input");
        input.type = "text";
        input.dataset.field = "customPath"; // 재렌더 시 포커스 복원용 식별자
        input.value = customAddDraft;
        input.placeholder = isKo ? '직접 입력/붙여넣기 또는 아래 목록에서 선택' : 'Type/paste a path or pick from the list below';
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

        // 미니 트리 토글 — ComfyUI 내부 목록에서 클릭 선택 (붙여넣기 대체).
        const browseBtn = document.createElement("button");
        browseBtn.type = "button";
        browseBtn.textContent = customBrowseOpen ? (isKo ? "📁 목록 닫기" : "📁 Hide list") : (isKo ? "📁 목록에서 선택" : "📁 Browse");
        browseBtn.title = isKo ? "ComfyUI 폴더 목록에서 폴더/파일 선택" : "Pick a folder/file from the ComfyUI folder list";
        browseBtn.style.cssText = "flex-shrink:0; background:rgba(14,165,233,0.15); border:1px solid rgba(14,165,233,0.4); color:#bae6fd; border-radius:6px; padding:5px 10px; font-size:12px; cursor:pointer;";
        browseBtn.addEventListener("click", () => {
            customBrowseOpen = !customBrowseOpen;
            if (customBrowseOpen) fetchCustomBrowse(customBrowseRel);
            paintDetailFiles();
            // 목록을 열면 트리 박스 위치로 모달 스크롤 이동 (하단 잘림 방지).
            if (customBrowseOpen) {
                requestAnimationFrame(() => {
                    try {
                        const scrollEl = detailModalEl && detailModalEl.querySelector("#bada-detail-scroll");
                        const box = detailModalEl && detailModalEl.querySelector("#bada-custom-browse-box");
                        if (scrollEl && box) {
                            const target = box.offsetTop - scrollEl.offsetTop - 12;
                            if (target > scrollEl.scrollTop) scrollEl.scrollTo({ top: target, behavior: "smooth" });
                        }
                    } catch (_) {}
                });
            }
        });

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
                    customBrowseOpen = false;
                    customBrowseRel = "";
                    customBrowseCache = {};
                    customBrowseLoading = null;
                    customBrowseError = "";
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
            customBrowseOpen = false;
            customBrowseRel = "";
            paintDetailFiles();
        });

        form.appendChild(input);
        form.appendChild(nameInput);
        form.appendChild(okBtn);
        form.appendChild(browseBtn);
        form.appendChild(cancelBtn);
        sec.appendChild(form);
        paintCustomBrowseTree(sec, isKo);

        if (customAddError) {
            const errEl = document.createElement("div");
            errEl.style.cssText = "padding:2px 4px; font-size:11px; color:#fca5a5;";
            errEl.textContent = `⚠️ ${customAddError}`;
            sec.appendChild(errEl);
        }
    } else if (customProActive) {
        addBtn.addEventListener("click", () => {
            customAddOpen = true;
            customBrowseOpen = true; // +추가 누르면 트리도 바로 표시 (목록 버튼 2단계 제거)
            fetchCustomBrowse(customBrowseRel);
            paintDetailFiles();
            requestAnimationFrame(() => {
                try {
                    const scrollEl = detailModalEl && detailModalEl.querySelector("#bada-detail-scroll");
                    const box = detailModalEl && detailModalEl.querySelector("#bada-custom-browse-box");
                    if (scrollEl && box) {
                        const target = box.offsetTop - scrollEl.offsetTop - 12;
                        if (target > scrollEl.scrollTop) scrollEl.scrollTo({ top: target, behavior: "smooth" });
                    }
                } catch (_) {}
            });
        });
    }

    // 폴더가 없으면 점선 플레이스홀더 — PRO 활성: 클릭=추가 폼 / 미발급: 발급 안내(무반응).
    if (!customFolders.length) {
        const empty = document.createElement("div");
        if (customProActive) {
            empty.style.cssText = "border:1px dashed rgba(148,163,184,0.35); border-radius:8px; padding:12px 14px; margin-top:8px; font-size:12px; color:#94a3b8; text-align:center; cursor:pointer;";
            empty.textContent = isKo ? "아직 동기화 대상이 없습니다 — 클릭하여 폴더 또는 파일 추가" : "No sync targets yet — click to add a folder or file";
            empty.addEventListener("click", () => {
                customAddOpen = true;
                customBrowseOpen = true;
                fetchCustomBrowse(customBrowseRel);
                paintDetailFiles();
            });
        } else {
            // Bada PRO 미발급 — 발급 안내 (클릭 무반응).
            empty.style.cssText = "border:1px dashed rgba(245,158,11,0.4); border-radius:8px; padding:12px 14px; margin-top:8px; font-size:12px; color:#fbbf24; text-align:center; cursor:not-allowed;";
            empty.textContent = isKo
                ? "👑 Bada PRO 미발급 — 설정 > 클라우드 동기화에서 발급받은 JSON 자격증명 파일을 드래그&드롭하세요"
                : "👑 Bada PRO not activated — drag & drop your issued JSON credential file in Settings > Cloud Sync";
        }
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
            // 제거 = 동기화 범위에서만 제외 (오클릭 방지 확인). Drive 복사본 정리는 사용자가 직접 고른다.
            const msg = isKo
                ? `'${f.name}' 대상을 동기화에서 제거할까요?\n\n모든 PC의 동기화 범위에서만 제외되고, 로컬 파일은 그대로 남습니다.`
                : `Remove '${f.name}' from sync targets?\n\nIt is only excluded from sync on all PCs — local files stay untouched.`;
            if (!confirm(msg)) return;
            const purgeMsg = isKo
                ? `이어서 Drive 복사본을 정할까요?\n\n[예] Drive 복사본도 정리 — Drive 휴지통으로 이동 (30일 복원 가능)\n[아니오] 등록만 해제 — Drive 복사본은 Drive 에 그대로 남음`
                : `Next: what about the Drive copy?\n\n[Yes] Also purge the Drive copy — moved to the Drive trash (30-day restore)\n[No] Unregister only — the Drive copy stays in Drive`;
            const purgeRemote = confirm(purgeMsg);
            rmBtn.disabled = true;
            try {
                const r = await fetch("/api/bada/cloud/custom-folder-remove", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: f.name, purge_remote: purgeRemote }),
                });
                const s = await r.json();
                if (s.success) {
                    rmBtn.textContent = s.remote_purged
                        ? (isKo ? "✅ 제거됨 · Drive 정리됨" : "✅ Removed · Drive purged")
                        : (isKo ? "✅ 제거됨" : "✅ Removed");
                    if (!s.remote_purged && s.remote_note) rmBtn.title = String(s.remote_note);
                    delete customCounts[f.name];
                    fetchCustomFolders(); // 목록 갱신
                    scanCustomResidue();  // 제거 직후 잔해/정리 결과 반영
                } else {
                    rmBtn.textContent = isKo ? "⚠️ 실패" : "⚠️ Failed";
                    rmBtn.title = s.error || "";
                    scheduleOpenButtonRevert(rmBtn, isKo ? "✕ 제거" : "✕ Remove",
                        isKo ? "등록 해제 (로컬·Drive 파일은 삭제되지 않음)" : "Unregister only — local & Drive files are kept");
                }
            } catch (_) {
                rmBtn.textContent = isKo ? "⚠️ 실패" : "⚠️ Failed";
                scheduleOpenButtonRevert(rmBtn, isKo ? "✕ 제거" : "✕ Remove",
                    isKo ? "등록 해제 (로컬·Drive 파일은 삭제되지 않음)" : "Unregister only — local & Drive files are kept");
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

    // 동기화 대상 아래에 Drive 잔해 섹션 — 대상을 전부 해제한 뒤에도 보인다.
    paintCustomResidue(sec, isKo);
    // Drive 잔해 아래 — 이번 PC 에 쌓인 삭제 보관함 정리가 이어서 나온다.
    paintCustomTrash(sec, isKo);
    body.appendChild(sec);
}

// ── PRO 그룹 헤더 — 제미나이 채팅 기록 + 커스텀 동기화 대상을 하나의 PRO 섹션으로 묶는다.
// 미발급이면 잠금 사유와 발급 안내를 바로 아래에 표시한다 (행 잠금은 각 행에서 처리).
function paintProSectionHeader(body, isKo) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin:14px 0 6px; padding-top:10px; border-top:1px solid rgba(245,158,11,0.3);";
    const badge = document.createElement("span");
    badge.textContent = "⭐ PRO";
    badge.style.cssText = "background:rgba(245,158,11,0.16); border:1px solid rgba(245,158,11,0.5); color:#fcd34d; border-radius:6px; padding:1px 8px; font-size:11px; font-weight:800; letter-spacing:0.4px;";
    const title = document.createElement("span");
    title.textContent = isKo ? "PRO 전용 동기화" : "PRO-only sync";
    title.style.cssText = "font-size:13px; font-weight:700; color:#e2e8f0;";
    const state = document.createElement("span");
    state.textContent = customProActive ? (isKo ? "· 활성화됨" : "· active") : (isKo ? "· 미발급" : "· not activated");
    state.style.cssText = "font-size:11px; color:" + (customProActive ? "#34d399" : "#fbbf24") + ";";
    wrap.appendChild(badge);
    wrap.appendChild(title);
    wrap.appendChild(state);
    body.appendChild(wrap);

    if (customProActive) return;

    const notice = document.createElement("div");
    notice.style.cssText = "display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin:0 0 8px; padding:6px 10px; border-radius:6px; background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.3); font-size:11px; color:#fbbf24;";
    const txt = document.createElement("span");
    txt.textContent = isKo
        ? "⚠️ Bada PRO 미발급 — 제미나이 채팅 기록과 커스텀 동기화 대상은 동기화되지 않고 이 기기에만 보관됩니다 (Drive·로컬 데이터 삭제 없음)"
        : "⚠️ Bada PRO not activated — Gemini chat history and custom sync targets stay on this device and are NOT synced (nothing on Drive or your PC is deleted)";
    const guide = document.createElement("button");
    guide.type = "button";
    guide.textContent = isKo ? "🚀 발급 가이드" : "🚀 Activation guide";
    guide.style.cssText = "flex-shrink:0; background:rgba(245,158,11,0.18); border:1px solid rgba(245,158,11,0.5); color:#fde68a; border-radius:6px; padding:2px 10px; font-size:11px; font-weight:700; cursor:pointer;";
    guide.addEventListener("click", (e) => {
        e.stopPropagation();
        window.open("/api/bada/cloud/pro/guide?lang=" + (isKo ? "ko" : "en"), "_blank", "noopener");
    });
    notice.appendChild(txt);
    notice.appendChild(guide);
    body.appendChild(notice);
}

// ── 삭제 보관함(_deleted_custom) — 다른 PC 에서 삭제되어 이 PC 에서 물러난 파일들의 격리소.
// 백엔드가 동기화 후처리로 보관 기간이 지난 항목만 자동 정리하고(1일 1회), 이 섹션은
// 사람이 직접 비울 때 쓴다. 모든 정리는 이 PC 의 보관함만 건드리며 Drive 는 건드리지 않는다.
const TRASH_BTN = "flex-shrink:0; background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.4); "
    + "color:#fca5a5; border-radius:6px; padding:2px 10px; font-size:11px; font-weight:700; cursor:pointer;";

// 보관함 API 응답 해석 — 서버가 이 라우트를 아직 모르면 본문이 "404: Not Found" 같은
// 일반 텍스트라서 r.json() 이 파서 오류를 던진다. 그 원문을 보여주기엔 너무 거칠다.
async function readTrashApi(r) {
    if (r.status === 404 || r.status === 405) return { success: false, error: "http-" + r.status, restart: true };
    if (!r.ok) return { success: false, error: "http-" + r.status };
    try {
        return await r.json();
    } catch (_) {
        return { success: false, error: "network" };
    }
}

// 실패 사유를 사람이 읽는 문장으로 — 재시작으로 풀리는 문제는 그렇게 안내한다.
function trashApiFault(s, isKo) {
    if (s && s.restart) {
        return isKo
            ? "ComfyUI 를 다시 시작하면 사용할 수 있습니다 — 서버가 이 기능을 얹기 전 코드로 떠 있습니다."
            : "Restart ComfyUI to use this — the server is still running code from before this feature.";
    }
    return String((s && s.error) || "");
}

async function fetchCustomTrash() {
    if (customTrashLoading) return;
    customTrashLoading = true;
    customTrashError = "";
    paintDetailFiles();
    try {
        const r = await fetch("/api/bada/cloud/custom-trash");
        const s = await readTrashApi(r);
        if (s && s.success) customTrash = s;
        else customTrashError = (s && s.restart) ? "restart" : String((s && s.error) || "unknown");
    } catch (_) {
        customTrashError = "network";
    }
    customTrashLoading = false;
    paintDetailFiles();
}

// mode="older" = 보관 기간이 지난 항목만, mode="all" = 보관함 전체를 영구 삭제한다.
async function purgeCustomTrash(mode, btn, isKo) {
    const all = mode === "all";
    const files = Number(((all ? customTrash && customTrash.files : customTrash && customTrash.expired_files)) || 0);
    const bytes = Number(((all ? customTrash && customTrash.bytes : customTrash && customTrash.expired_bytes)) || 0);
    const days = Number((customTrash && customTrash.retention_days) || 0);
    if (!files) return;
    const mb = (bytes / 1048576).toFixed(1);
    const scope = all
        ? (isKo ? "보관 기간과 상관없이 보관함 전체를 지웁니다.\n"
                : "This empties the whole retention folder, newer items included.\n")
        : (isKo ? `'${days}일' 보다 오래된 항목만 지우고, 그보다 최신은 그대로 남습니다.\n`
                : `Only items older than ${days} days go; newer items stay.\n`);
    const msg = isKo
        ? `삭제 보관함에서 ${files}개 · ${mb}MB 를 지금 영구 삭제할까요?\n\n` + scope
          + "대상은 이 PC 의 _deleted_custom 폴더뿐이며 구글 드라이브에는 영향이 없습니다.\n"
          + "한번 지우면 되돌릴 수 없습니다. 계속할까요?"
        : `Permanently delete ${files} files · ${mb}MB from the local trash folder now?\n\n` + scope
          + `Only this PC's _deleted_custom folder is affected — Google Drive is untouched.\n`
          + "This cannot be undone. Continue?";
    if (!window.confirm(msg)) return;
    const keep = btn.textContent;
    customTrashBusy = true;
    btn.disabled = true;
    btn.textContent = isKo ? "정리 중…" : "Cleaning…";
    paintDetailFiles();
    try {
        const r = await fetch("/api/bada/cloud/custom-trash-purge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: all ? "all" : "older" }),
        });
        const s = await readTrashApi(r);
        if (s && s.success) {
            customTrashBusy = false;
            fetchCustomTrash(); // 디스크를 다시 세어 실제 남은 양만 보여준다.
            return;
        }
        const why = trashApiFault(s, isKo);
        btn.title = why;
        btn.textContent = isKo ? "⚠️ 실패" : "⚠️ Failed";
        window.alert(isKo ? `보관함을 정리하지 못했습니다.

${why}`
                          : `Could not clean the trash folder.

${why}`);
    } catch (err) {
        btn.title = String(err || "");
        btn.textContent = isKo ? "⚠️ 실패" : "⚠️ Failed";
        window.alert(isKo ? "보관함을 정리하지 못했습니다: " + String(err || "")
                          : "Could not clean the trash folder: " + String(err || ""));
    }
    customTrashBusy = false;
    btn.disabled = false;
    btn.textContent = keep;
    paintDetailFiles();
}

// 보관 기간 저장 — 값만 바꾼다 (이 시점에 아무것도 지우지 않는다).
async function setCustomTrashRetention(days, isKo) {
    customTrashBusy = true;
    paintDetailFiles();
    try {
        const r = await fetch("/api/bada/cloud/custom-trash-retention", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ days: Number(days) }),
        });
        const s = await readTrashApi(r);
        if (s && s.success) {
            customTrashBusy = false;
            fetchCustomTrash(); // 바뀐 기준으로 자동 정리 대상 개수를 다시 센다.
            return;
        }
        const why = trashApiFault(s, isKo);
        window.alert(isKo ? `보관 기간을 저장하지 못했습니다.

${why}`
                          : `Could not save the retention period.

${why}`);
    } catch (err) {
        window.alert(isKo ? "보관 기간을 저장하지 못했습니다: " + String(err || "")
                          : "Could not save the retention period: " + String(err || ""));
    }
    customTrashBusy = false;
    paintDetailFiles();
}

function paintCustomTrash(sec, isKo) {
    const d = customTrash;
    const files = Number((d && d.files) || 0);
    // 보관함이 비어 있어도 남긴다 — 보관 기간을 고르는 자리가 여기뿐이라 사라지면 만질 거리가 없다.
    // (위의 Drive 잔해 섹션과 같은 규칙 — 조회를 아예 못 한 경우에만 조용히 숨긴다.)
    if (!d && !customTrashLoading && !customTrashError) return;

    const box = document.createElement("div");
    box.style.cssText = "margin-top:10px; border:1px solid rgba(148,163,184,0.35); border-radius:8px; background:rgba(148,163,184,0.07); padding:8px 10px; font-size:12px;";

    const head = document.createElement("div");
    head.style.cssText = "display:flex; align-items:center; justify-content:space-between; gap:10px; font-weight:700; color:#cbd5e1;";
    const title = document.createElement("span");
    const mb = ((Number((d && d.bytes) || 0)) / 1048576).toFixed(1);
    const KO_NAME = "🗃 이 PC의 삭제 보관함";
    const EN_NAME = "🗃 Local trash folder";
    // 세어 보지 않은 것과 세어 두고 없는 것을 같은 '0개'로 묶어 말하지 않는다.
    if (!d) title.textContent = isKo ? KO_NAME : EN_NAME;
    else if (files <= 0) title.textContent = isKo ? `${KO_NAME} · 비어 있음` : `${EN_NAME} · empty`;
    else title.textContent = isKo ? `${KO_NAME} ${files}개 · ${mb}MB` : `${EN_NAME} ${files} · ${mb}MB`;
    title.title = isKo
        ? "동기화 중에 다른 PC 에서 사라져 이 PC 에서도 물러난 파일들 (_deleted_custom 폴더)"
        : "Files that were deleted on another PC and moved out of this one (_deleted_custom)";
    head.appendChild(title);
    box.appendChild(head);

    const age = Number((d && d.oldest_age_days) || 0);
    const sub = document.createElement("div");
    sub.style.cssText = "margin-top:2px; font-size:11px; color:#94a3b8;";
    sub.textContent = files > 0
        ? (isKo
            ? `제일 오래된 항목 ${age}일 전 · 보관 기간이 지나면 동기화 때 자동으로 지웁니다.`
            : `Oldest item ${age} days ago · items past the retention period are pruned during sync.`)
        : (isKo
            ? `다른 PC 에서 사라진 파일이 이 PC 에서도 물러나면 이곳에 쌓입니다 — 지금은 모아 둔 것이 없습니다.`
            : "Files removed on other PCs and on this one pile up here — nothing is held right now.");
    if (d) box.appendChild(sub);

    if (customTrashError) {
        const err = document.createElement("div");
        err.style.cssText = "margin-top:4px; color:#fca5a5;";
        err.textContent = customTrashError === "restart"
            ? (isKo ? "ComfyUI 를 다시 시작하면 나타나는 새 기능입니다."
                    : "Restart ComfyUI to load this feature.")
            : (isKo ? "보관함 확인 실패: " : "Trash scan failed: ") + customTrashError;
        box.appendChild(err);
    }
    if (customTrashLoading || customTrashBusy) {
        const busy = document.createElement("div");
        busy.style.cssText = "margin-top:4px; color:#93c5fd;";
        busy.textContent = isKo ? "⏳ 확인·정리 중…" : "⏳ Working…";
        box.appendChild(busy);
    }
    if (d && d.truncated) {
        const warn = document.createElement("div");
        warn.style.cssText = "margin-top:4px; color:#fbbf24;";
        warn.textContent = isKo
            ? "⚠️ 항목이 너무 많아 일부만 세었습니다 — 실제가 더 많을 수 있습니다."
            : "⚠️ Too many items — the count is a partial scan.";
        box.appendChild(warn);
    }

    // 보유량 상위 항목 — 무엇을 채우는지 눈으로 확인시키고 정리 판단을 돕는다.
    const top = (d && Array.isArray(d.by_target)) ? d.by_target.slice(0, 3) : [];
    for (const t of top) {
        const row = document.createElement("div");
        row.style.cssText = "margin-top:3px; font-size:11px; color:#94a3b8; word-break:break-all;";
        row.textContent = `└ ${t.name} — ` + (isKo
            ? `파일 ${Number(t.files) || 0}개 · ${((Number(t.bytes) || 0) / 1048576).toFixed(1)}MB`
            : `${Number(t.files) || 0} files · ${((Number(t.bytes) || 0) / 1048576).toFixed(1)}MB`);
        box.appendChild(row);
    }

    const days = Number((d && d.retention_days) || 0);
    const expFiles = Number((d && d.expired_files) || 0);
    const expMB = ((Number((d && d.expired_bytes) || 0)) / 1048576).toFixed(1);

    // 만료분만 정리 버튼이 꺼진 이유를 적어 둔다 — 개수 0 이 고장처럼 보이는 막는다.
    if (!customTrashError && files > 0 && days > 0 && expFiles <= 0) {
        const why = document.createElement("div");
        why.style.cssText = "margin-top:4px; font-size:11px; color:#93c5fd;";
        why.textContent = isKo
            ? "ℹ️ 자동 정리 대상이 아직 0개입니다 — 보관함 나이 기준이 새로 잡혀 모든 항목이 보관 기간 안에 있습니다. 바로 비우려면 '모두 비우기'를 쓰세요."
            : "ℹ️ Nothing is due yet — every item is inside the retention period. Use 'Empty now' to clear the folder right away.";
        box.appendChild(why);
    }

    const row2 = document.createElement("div");
    row2.style.cssText = "display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:7px;";

    // 보관함은 비어 있어도 다시 세어 볼 거리가 남아야 한다 — 지금 보이는 0개가 낡은 값일 수 있다.
    // (위 Drive 잔해 섹션의 [다시 확인] 과 같은 규칙. 세기만 하고 아무것도 지우지 않는다.)
    const again = document.createElement("button");
    again.type = "button";
    again.style.cssText = "flex-shrink:0; background:rgba(56,189,248,0.15); border:1px solid rgba(56,189,248,0.4); "
        + "color:#bae6fd; border-radius:6px; padding:2px 10px; font-size:11px; font-weight:700; cursor:pointer;";
    again.textContent = (customTrashLoading || customTrashBusy)
        ? (isKo ? "⏳ 확인 중…" : "⏳ Checking…")
        : (isKo ? "🔄 다시 확인" : "🔄 Re-check");
    again.title = isKo
        ? "보관함 디스크를 다시 세어 개수와 보관 기간을 갱신합니다 (아무것도 지우지 않음)"
        : "Count the trash folder again (deletes nothing)";
    again.disabled = customTrashLoading || customTrashBusy;
    again.addEventListener("click", () => fetchCustomTrash());
    row2.appendChild(again);

    if (files > 0) {
        if (days > 0) {
            const older = document.createElement("button");
            older.type = "button";
            older.style.cssText = TRASH_BTN;
            older.textContent = isKo ? `🧹 ${days}일 지난 항목만 정리 (${expFiles}개 · ${expMB}MB)`
                                    : `🧹 Older than ${days}d (${expFiles} · ${expMB}MB)`;
            older.title = isKo
                ? "보관 기간을 넘긴 항목만 영구 삭제 — 최신 항목은 그대로 남습니다 (Drive 영향 없음)"
                : "Permanently delete only items past the retention period (Drive untouched)";
            older.disabled = customTrashBusy || customTrashLoading || expFiles <= 0;
            older.addEventListener("click", () => purgeCustomTrash("older", older, isKo));
            row2.appendChild(older);
        }
        const all = document.createElement("button");
        all.type = "button";
        all.style.cssText = TRASH_BTN + "background:rgba(220,38,38,0.22);";
        all.textContent = isKo ? "🗑 모두 비우기" : "🗑 Empty now";
        all.title = isKo
            ? "보관 기간과 상관없이 보관함 전체를 영구 삭제 — 되돌릴 수 없습니다"
            : "Permanently delete everything in the trash folder — irreversible";
        all.disabled = customTrashBusy || customTrashLoading || files <= 0;
        all.addEventListener("click", () => purgeCustomTrash("all", all, isKo));
        row2.appendChild(all);
    }

    const lbl = document.createElement("span");
    lbl.textContent = isKo ? "보관 기간" : "Retain";
    lbl.style.cssText = "font-size:11px; color:#94a3b8;";
    const sel = document.createElement("select");
    sel.style.cssText = "background:rgba(15,23,42,0.8); border:1px solid rgba(148,163,184,0.4); color:#e2e8f0; border-radius:6px; padding:2px 6px; font-size:11px; font-weight:700; cursor:pointer;";
    sel.disabled = customTrashBusy;
    const choices = (d && Array.isArray(d.retention_choices) && d.retention_choices.length)
        ? d.retention_choices : [0, 7, 30, 90];
    for (const c of choices) {
        const op = document.createElement("option");
        op.value = String(c);
        op.textContent = c > 0
            ? (isKo ? `${c}일 후 자동 삭제` : `${c} days`)
            : (isKo ? "자동 정리 없음" : "Never auto-clean");
        if (c === days) op.selected = true;
        sel.appendChild(op);
    }
    sel.title = isKo
        ? "보관 기간이 지난 항목만 동기화 중에 자동으로 지웁니다 (기본 30일)"
        : "Only items older than this are auto-pruned during sync (default 30 days)";
    sel.addEventListener("change", () => setCustomTrashRetention(sel.value, isKo));
    // 현재값을 못 얻은 상태에서 선택지를 보여주면 '자동 정리 없음'으로 오해한다.
    if (d) { row2.appendChild(lbl); row2.appendChild(sel); }
    if (row2.childNodes.length) box.appendChild(row2);

    const note = document.createElement("div");
    note.style.cssText = "margin-top:6px; font-size:11px; color:#94a3b8;";
    note.textContent = isKo
        ? "정리는 이 PC 의 보관함에서만 지워지며 구글 드라이브와 다른 PC 는 영향받지 않습니다. '자동 정리 없음' 을 고르면 자동으로 지워지는 것은 없고 버튼으로만 비우게 됩니다."
        : "Cleaning only deletes from this PC's trash folder (Google Drive and other PCs untouched).";
    if (d) box.appendChild(note);

    sec.appendChild(box);
}

function paintDetailFiles() {
    if (!detailModalEl) return;
    const isKo = (BadaI18n.lang === "ko");
    const body = detailModalEl.querySelector("#bada-detail-files-body");
    if (!body) return;
    // 동일 스냅샷+상태면 재렌더 생략 — 파일·원격·커스텀·PRO·트리·잔해 상태를 함께 비교
    // (파일만 비교하면 PRO 전환 시 잠금이 안 풀리고, 트리 상태를 빼면
    //  browse-tree 응답 후에도 "불러오는 중…"에서 멈추며, 잔해 상태를 빼면
    //  "다시 확인" 버튼이 확인 중에도 갱신되지 않아 무반응으로 보인다).
    try {
        const sig = JSON.stringify([detailFilesSnapshot, detailRemoteSnapshot, customFolders, customSyncEnabled, customProActive, customCounts, customAddOpen, customAddDraft, customAddName, customAddError, customBrowseOpen, customBrowseRel, customBrowseLoading, customBrowseError, customBrowseCache, customResidue, customResidueScannedAt, customResidueLoading, customResidueError, customResidueTruncated, customTrash, customTrashLoading, customTrashError, customTrashBusy]);
        if (sig === detailFilesLastSig) return;
        detailFilesLastSig = sig;
    } catch (_) { /* 시그니처 실패 시 그냥 렌더 */ }
    // 1초 폴링 재렌더 시 포커스 유지 — 커스텀 추가 폼 입력 중 DOM 재생성으로 포커스가
    // 날아가 타이핑이 끊기는 문제 방지. (값은 customAddDraft/customAddName 이 보존)
    let restoreField = null, selStart = 0, selEnd = 0;
    const activeEl = document.activeElement;
    if (activeEl && body.contains(activeEl) && activeEl.dataset && activeEl.dataset.field) {
        restoreField = activeEl.dataset.field;
        try { selStart = activeEl.selectionStart ?? 0; selEnd = activeEl.selectionEnd ?? 0; } catch (_) {}
    }
    // 미니 트리 스크롤 유지 — 1초 폴링 재렌더(body.textContent="") 로 박스가 재생성되면
    // 스크롤이 맨 위로 점프하므로, 재생성 전 scrollTop 을 저장했다가 트리 렌더 후 복원한다.
    // 박스 내부 스크롤 + 모달 전체 스크롤 둘 다 저장 (둘 중 어느 쪽이 움직여도 점프처럼 보인다).
    let browseScrollTop = 0;
    const prevBrowseBox = body.querySelector("#bada-custom-browse-box");
    if (prevBrowseBox) { try { browseScrollTop = prevBrowseBox.scrollTop || 0; } catch (_) {} }
    let modalScrollTop = 0;
    const modalScrollEl = detailModalEl.querySelector("#bada-detail-scroll");
    if (modalScrollEl) { try { modalScrollTop = modalScrollEl.scrollTop || 0; } catch (_) {} }
    body.textContent = "";
    // 내부 관리용 레지스트리는 상세 목록에 노출하지 않는다 (동기화는 유지).
    const visibleFiles = detailFilesSnapshot.filter(f => f && f.name !== "custom_targets.json");
    // PRO 전용 항목은 목록 맨 뒤(PRO 그룹 헤더 아래)로 모은다 — 아래 커스텀 섹션과 한 덩어리.
    const proOnly = visibleFiles.filter(f => isProOnlyFile(f.name));
    const orderedFiles = proOnly.length
        ? [...visibleFiles.filter(f => !isProOnlyFile(f.name)), ...proOnly]
        : visibleFiles;
    let proHeaderPainted = false;
    for (const f of orderedFiles) {
        // 잠금 = PRO 전용 항목 ∧ 미발급 (서버 pro_locked 는 참고용, 이 상태가 우선 — 즉시 반영).
        const proLocked = isProOnlyFile(f.name) && !customProActive;
        if (isProOnlyFile(f.name) && !proHeaderPainted) {
            paintProSectionHeader(body, isKo);
            proHeaderPainted = true;
        }
        const lbl = FILE_LABELS[f.name] || { ko: f.name, en: f.name };
        const label = isKo ? lbl.ko : lbl.en;
        const mark = proLocked ? "🔒" : (f.exists ? "✅" : "➖");
        const sz = fmtSize(f.size);
        const localCnt = (typeof f.count === "number") ? f.count : null;
        const rt = remoteTargetByName(f.name);
        // 오른쪽: 로컬 개수 · 원격 개수/상태 · 용량
        // config: 원격 내용 개수 API 불가 → "원격 있음/없음"만.
        // workflows: 원격 파일 수 확정 → "로컬 N개 · 원격 M개".
        let rightParts = [];
        if (proLocked) {
            rightParts = [isKo ? "PRO 전용 · 이 기기에만 보관" : "PRO-only · kept on this device"];
        } else if (!f.exists) {
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
            p2.textContent = proLocked
                ? (isKo ? "☁️ Drive: PRO 발급 후 동기화 재개 (Drive 기존 사본은 그대로 유지)" : "☁️ Drive: resumes after PRO activation (existing Drive copy kept)")
                : `☁️ Drive: ${rn || (isKo ? "원격 확인 중…" : "checking remote…")}`;
            p2.title = rn;
            l2.appendChild(p2);
            // "Drive 열기" 버튼 — 서버 화이트리스트 검증 후 해당 **동기화 폴더**(Presets/SystemPrompts 등)를 새 탭으로 오픈.
            if (rn && !proLocked) {
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
    // PRO 항목이 없는 환경에서는 커스텀 섹션 직전에 헤더를 그린다 (커스텀도 PRO 그룹 소속).
    if (!proHeaderPainted) paintProSectionHeader(body, isKo);
    // 커스텀 폴더 섹션 — PRO 그룹 헤더 아래에 이어서 표시 (동일 스타일 재사용).
    paintCustomSection(body, isKo);
    // 미니 트리 스크롤 복원 — paintCustomSection 이 박스를 재생성한 뒤 저장값으로 되돌린다.
    if (browseScrollTop > 0) {
        const nextBrowseBox = body.querySelector("#bada-custom-browse-box");
        if (nextBrowseBox) { try { nextBrowseBox.scrollTop = browseScrollTop; } catch (_) {} }
    }
    // 모달 전체 스크롤 복원 — 트리 박스 밖(모달 컨테이너)이 스크롤된 경우 점프 방지.
    if (modalScrollTop > 0) {
        const nextScrollEl = detailModalEl.querySelector("#bada-detail-scroll");
        if (nextScrollEl) { try { nextScrollEl.scrollTop = modalScrollTop; } catch (_) {} }
    }
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
            <div id="bada-detail-scroll" style="padding:18px 24px; overflow-y:auto;">
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
