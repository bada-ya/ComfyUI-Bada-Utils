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
// 펼침 상태 (항목명 → true/false). 팝업 닫아도 유지 안 함(열 때마다 접힘).
let detailExpanded = {};

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
// 원격 개수+경로 1회 조회 — 동기화 중엔 개수 변동이라 참고용.
async function fetchRemoteSnapshot() {
    try {
        const r = await fetch("/api/bada/cloud/remote-counts");
        const s = await r.json();
        if (s.success && Array.isArray(s.targets)) {
            detailRemoteSnapshot = s.targets;
            detailRemoteError = "";
        } else {
            detailRemoteError = s.error || "";
        }
    } catch (e) {
        detailRemoteError = String(e && e.message || e);
    }
    paintDetailFiles();
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
        if (frac) frac.textContent = isKo ? "대기 중" : "Idle";
        if (cur) { cur.textContent = ""; cur.title = ""; }
        const ls = s.last_sync || detailLastSyncSnapshot || {};
        const when = fmtTime(ls.last_sync_at);
        if (stateLine) stateLine.textContent = when
            ? (isKo ? `마지막 동기화 ${when} (↑${ls.uploaded ?? 0} ↓${ls.downloaded ?? 0})` : `Last sync ${when} (↑${ls.uploaded ?? 0} ↓${ls.downloaded ?? 0})`)
            : (isKo ? "아직 동기화한 적 없음" : "Never synced yet");
    }
    paintDetailFiles();
}
function remoteTargetByName(name) {
    if (!Array.isArray(detailRemoteSnapshot)) return null;
    return detailRemoteSnapshot.find((t) => t.name === name) || null;
}
function paintDetailFiles() {
    if (!detailModalEl) return;
    const isKo = (BadaI18n.lang === "ko");
    const body = detailModalEl.querySelector("#bada-detail-files-body");
    if (!body) return;
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
        const arrow = detailExpanded[f.name] ? "▾" : "▸";
        left.textContent = `${arrow} ${mark} ${label}`;
        const rightEl = document.createElement("span");
        rightEl.textContent = rightParts.join(" · ") || "";
        rightEl.style.cssText = "color:#94a3b8; white-space:nowrap;";
        line.appendChild(left);
        line.appendChild(rightEl);
        line.addEventListener("click", (e) => {
            e.stopPropagation();
            detailExpanded[f.name] = !detailExpanded[f.name];
            paintDetailFiles();
        });
        wrap.appendChild(line);
        // 펼침: 로컬 절대경로 + Drive 원격 이름 (읽기 전용, 추후 사용자 설정 대비).
        if (detailExpanded[f.name]) {
            const sub = document.createElement("div");
            sub.style.cssText = "padding:2px 0 8px 22px; font-size:11px; color:#64748b; line-height:1.7; word-break:break-all;";
            const rt2 = remoteTargetByName(f.name);
            const lp = (rt2 && rt2.local_path) || "";
            const rn = (rt2 && rt2.remote_name) || "";
            const l1 = document.createElement("div");
            l1.textContent = `📁 ${lp || (isKo ? "로컬 경로 확인 중…" : "resolving local path…")}`;
            l1.title = lp;
            const l2 = document.createElement("div");
            l2.textContent = `☁️ Drive: ${rn || (isKo ? "원격 확인 중…" : "checking remote…")}`;
            l2.title = rn;
            sub.appendChild(l1);
            sub.appendChild(l2);
            wrap.appendChild(sub);
        }
        body.appendChild(wrap);
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
                    <span id="bada-detail-progress-frac" style="font-size:14px; font-weight:700; color:#e2e8f0;">—</span>
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
