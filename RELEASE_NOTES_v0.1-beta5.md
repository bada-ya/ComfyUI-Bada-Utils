# v0.1-beta5 — 2026-10-03

Beta build of the Gemini-facing UI pass. **19 commits ahead of production** (`da6910f`),
54 files, +13,256 / −1,320.

> Production was **not** touched. This release is `bada-ya/ComfyUI-Bada-Utils-Beta` branch `main`
> at `3752032`.

---

## ✨ Added

### BadaPromptGenerator — a real frontend node
`web/bada_prompt_generator.js` + `.css` (~1,660 lines) and `nodes/bada_prompt_generator.py`
written from scratch. The node ships as its own modal UI rather than a widget soup.

### Gemini-only system prompt manager
`web/bada_gemini_prompt_modal.js` + a REST CRUD API (`server/bada_promptgen_api.py`, +391).
Create / edit / delete / reorder prompts scoped to the 🔞 제미나이 tab, selectable from the
persona dropdown. **Requires a ComfyUI restart** — `server/` changed.

### Gemini personas
`universal` · `cinematic_director` · `fashion_lookbook` · `scenario_writer`, served by
`server/gemini_api.py` (+459) on `BLOCK_NONE`.

### Registry-driven engines with `name_en`
`engines_registry.json` (+313) carries both Korean and English display names. The Korean `name`
stays the **backend value**; only the presentation is localized.

### Dev test suites
Three new this batch, alongside the existing ones:

| File | Covers |
| --- | --- |
| `bada_async_gemini_layout_test.js` | 78 checks — panel slimming, banner removals, composer growth |
| `bada_promptgen_ratio_test.js` | ratio picker, label localisation, node-width reflow |
| `bada_promptgen_registry_test.py` | registry schema integrity |
| `bada_folder_drag_test.js` | 103 checks — sidebar drag/drop, multi-select, XSS regression |
| `bada_folder_rename_test.py` | 53 checks — server-side rename/move guard rails |
| `bada_promptgen_ui_smoke.py` · `bada_saveas_ui_smoke.py` | browser paths (need a live instance) |

---

## 🔧 Changed

- **KREA2 / QWEN2.1** relabelled; `MiniMax H3` and `LTX-Video` given submenu depth and an
  AI aspect-ratio picker.
- **Shared aspect-ratio picker** injected into Gemini, with panel-height recalibration on
  language / width change.
- Gemini models → **3.5 / 3.6 / 3.8** endpoints, ~8s timeouts, monochrome dark theme.
- **Prompt Generator**: aspect ratio `자동` + 9 presets, system-prompt button moved right,
  `LocalStorage 자동 저장` wording removed, stray control icons dropped.
- **Async Studio**: 🔔 bell relocated into the API-key row; duplicate title, black header box,
  `Pass N` badge and the KREA/QWEN/MiniMax/LTX dots all removed.
- **404 fixes**: folder rename (nested paths were 404ing), duplicate-name 409, bad-input 400.
- **Folder drag & multi-select**: Ctrl / Ctrl+Shift multi-select, batch move, `Too Many Requests`
  resolved with an async server model-scan TTL cache offloaded to a worker thread.
- **Logger hardening**: 104 JS blocks + 14 Python blocks converted; batch model fallback latency
  bounded to ~3 minutes.
---

## 🐛 Fixed

### Panel reshaped itself on every interaction
`.bada-toast` is a **block child** of the card's flex column, so a toast shoved the layout *down*
instead of floating over it.

- **Six** generation banners removed (success · working · chat completion ×2 · generation).
- **Toggle clicks** stopped toasting — NSFW and Korean-translation fired on *every* click, in both
  languages, on both enable and disable.
- **Persona menu** stopped firing `📜 적용됨` on all six entries; they all funnelled through one
  function, so every pick popped the banner.
- Action toasts (copy / attach / key-check) and genuine **error** toasts are kept on purpose.

### Options row was clipped in both languages
`Allow NS…` · `한국어 변…` — the `ON`/`OFF` chips ate ~45px + an 8px gap each inside a 474px row.
Chips removed (**+106px**), toggles given width priority, row made `flex-wrap`-able. Now
**386px (ko) / 378px (en)** against 474px. Pressed state moved onto the card itself (amber /
green border + fill), with `role="button"`, `aria-pressed`, a focus ring and Enter/Space.

### Chat composer was pinned to one line
`rows = 1` + CSS `max-height: 80px`. Now **3 lines at rest → grows upward to 5 → then scrolls**,
resetting to 3 on send.

### 영상 길이 row was being clipped
Narrowing the node left the height spent, so the panel painted over the native widget rows —
clipped in Korean, fully hidden in English. Height is now recalculated on language / width change.

### Saved workflows kept a phantom `prompt` socket
LiteGraph restores serialized `outputs` *after* `onNodeCreated`, so stripping there alone let it
survive a refresh. Now stripped in **both** `onNodeCreated` and `onConfigure`.

### Security & robustness
- **XSS** in the sidebar toast (`showToast()` interpolated `${message}` unescaped; ~10 call sites
  forward server errors).
- **Blocking event loop**: the filesystem walk ran inline in the aiohttp handler.
- **Permanent 300 ms polling** replaced with event-driven dialog detection.
- `escapeHtml()` de-duplicated (9 copies → `web/bada_shared.js`).
- 118 i18n hardcoded Korean strings converted to English defaults.
- Four-stage failover for prompt validation.
- One-click Format-Preserve Note Helper + White List Settings Pane.

---

## ✅ Verification

| Suite | Result |
| --- | --- |
| `bada_async_gemini_layout_test.js` | **78/78 PASS** |
| `bada_folder_drag_test.js` | 103/103 PASS |
| `bada_folder_rename_test.py` | 53/53 PASS |
| `bada_promptgen_ratio_test.js` | PASS |
| `bada_promptgen_registry_test.py` | PASS |
| `node --check` on every file in `web/` | PASS |
| `py_compile` on every Python file | PASS |
| CSS brace balance | 211/211 |

**Browser-verified by the user** on the daily driver
(`D:\StabilityMatrix\Data\Packages\ComfyUI`).

---

## ⚠️ Before upgrading from production

1. **Restart ComfyUI.** `server/bada_promptgen_api.py` and `server/bada_server_api.py` changed —
   without a restart the prompt manager 404s and the new aspect-ratio widget renders but sends
   its value nowhere.
2. Then <kbd>Ctrl</kbd>+<kbd>F5>. A plain F5 is not enough; ComfyUI serves extensions with long
   cache headers.
3. If `BadaPromptGenerator` shows *"⚠️ 화면비 값이 전달되지 않습니다"*, that means **restart, do
   not refresh**.
4. `config.json`, `favorites_data.json`, `*.bak` and `dev_tests/_shots/` are gitignored — no API
   keys or scratch artefacts are committed.

## ⚠️ Known limitations

- **No browser automation** was available, so layout claims rest on a width model plus manual
  confirmation. The browser suites (`*_ui_smoke.py`) need a live instance and were not run here.
- `fitToContent()` only ever **grows** the Async Studio node, and `userPreferredHeight` persists
  to localStorage — a node you manually made very tall will not shrink back automatically. The
  5-line composer cap keeps this bounded.
- Safari/Firefox were not exercised; only the daily driver was.