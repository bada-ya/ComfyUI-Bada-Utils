# Beta Handoff — 2026-10-04 (Phase 3: legacy category deleted + startup language fixed)

## Two separate problems, in one report

The user reported (a) buttons stuck in Korean and (b) suspecting the legacy category was
responsible. They were different bugs. Deleting legacy did NOT fix the startup symptom, so it
had to be diagnosed separately — worth recording, because the guess was plausible and wrong.

### (a) STARTUP DREW EVERY ROW IN KOREAN WITH THE LANGUAGE SET TO ENGLISH

Two independent causes, both now fixed in `registerBadaV2Settings()`:

1. **The stored value was ignored.** `defaultValue: lang` took the language from `BadaI18n` at
   registration time. `getBadaLanguage()` reads **localStorage first**, while the dropdown
   renders the value ComfyUI restored from its own store — so the two could disagree, giving
   "dropdown says English, rows say Korean". Now the row reads the actual setting first
   (`storedLang`) and falls back to the registration-time language.
2. **The server sync landed too late.** `bada_i18n.js` fetches `/settings` asynchronously at
   module load, i.e. after the rows are built. `notifyListeners()` fires, but a re-label cannot
   repaint rows the dialog already rendered. A bounded 4-try poll now replays the same two
   passes a manual switch runs, and bails when the engine already agrees.

Deleting the legacy category was NOT the cause. It did remove a real duplicate-language-row
hazard (two rows owning the language, each with its own `onChange`, racing through
`BadaI18n.setLanguage()`'s reentrancy guard), which is gone now regardless.

### (b) PHASE 3 — the legacy category is deleted

`bada_core.js` went from 1758 to ~1234 lines. Removed: all 16 legacy registrations,
`toLegacyId()`, both custom-renderer builders (`buildInlinePresetsPanel`,
`buildNoteHelperPanel`), the `.bada-trans-*` / `#bada-inline-presets-panel` CSS, the
`BadaLegacy.*` CSS rules, the now-unused presets imports, and the `category` keys in
`BADA_SETTINGS_TEXTS`.

**Deliberately KEPT** (they look like legacy leftovers but are not):
- `BADA_SETTINGS_TEXTS` + `BADA_UNIFIED_SETTINGS` — `applyBilingualSettingsUI()` resolves every
  v2 row's title/description through them. They are v2's label source.
- `applyCompactSidebarState` + its initial apply — v2 only reacts to `onChange`, so dropping the
  startup call would leave the mode unapplied until the user toggled the switch.
- `presets_modal.js` stays loaded via `hub_modal.js` / `smart_presets.js` / the overview modal.

## Test-suite damage worth recording

14 checks failed on deletion because they *asserted the legacy category existed*. Those were
rewritten as absence checks. Three of my own mistakes along the way, each of which made a test
fail for the wrong reason:

- `panelBuilder` sliced to `buildNoteHelperPanel`, which no longer exists — `indexOf` returns
  -1, so `slice(a, -1)` silently produced a garbage region and failed 9 unrelated checks.
- `stripComments` only stripped **full-line** `//` comments, so a deleted symbol named in a
  line-closing comment read as a live reference. Now strips trailing `//` too.
- A blanket line-range deletion ate `mountManagerCacheWidget` along with the two builders.
  Recovered from a `%TEMP%` copy. **Use anchored index arithmetic, not line numbers, when
  deleting multi-hundred-line regions.**

New checks are verified by breaking the code deliberately: reverting `resolvedLang` → red,
deleting the late-sync block → red, removing each of the five language mounts → red.
`bada_manager_cache_test.js` → **77/77**, all files pass the ESM parse.

**VERIFIED IN THE BROWSER (2026-10-04).** The user confirmed on a live instance, after
`Ctrl+F5`: the new category opens in the correct language on a fresh start (no Korean-then-
back-to-English toggle needed), and switching English ↔ Korean relabels the three presets
buttons and the Manager cache "지금 갱신 / Refresh now" button together with every native row.
The legacy category is gone from the sidebar, as intended. So the two startup causes above are
confirmed fixed in practice, not just on paper.

---

# Beta Handoff — 2026-10-03 (round 2: the language switch never reached the custom rows)

## The bug the previous round missed

The round-1 fix was correct but **not wired to anything that fires on a language change**, so
the same three buttons stayed Korean and the Manager cache button still read 지금 갱신.
Restarting ComfyUI changed nothing, which is the tell: nothing was stale on disk, the labels
were simply never rewritten.

Two independent causes, both the same shape — *custom DOM whose text is written once and
never repainted*:

1. **The entry point was unreachable.** `mountLocalizedRows()` (which re-labels the presets
   row) was called only from `triggerUIUpdate()` — dialog open, clicks, Ctrl+comma. The path
   that actually runs when you pick a language in the dropdown is the dialog MutationObserver,
   and that callback called `applyBilingualSettingsUI()` alone. Reachable ≠ invoked.
2. **The widget repaint skipped its own button.** `paintManagerCacheWidget()` refreshed the
   timestamp and mode spans but never the refresh button, whose label was written once at
   build time. The screenshot proved it: an English "Last refreshed:" line sitting directly
   next to a Korean "지금 갱신".

## The fix

- `managerCacheIdleText()` is now module-level (one source of truth), and
  `paintManagerCacheWidget()` repaints the button too — guarded by `!btn.disabled` so it can
  never stomp the transient 갱신 중… / ✓ 완료 / ⚠ 실패 states of an in-flight refresh.
- The mount now runs at **all five** places that relabel native rows: both language
  `onChange` handlers, the `BadaI18n.subscribe` callback (the most direct hook there is —
  `notifyListeners()` fires on every switch), the dialog MutationObserver, `triggerUIUpdate`,
  and `attachIfDialogPresent`.

## Guarding the WIRING, not just the hook

The round-1 checks asserted the per-row refresh existed. That was the wrong unit: the code
was fine and the tests still passed while the feature was visibly broken. The new check walks
every `applyBilingualSettingsUI(...)` call site and requires the mount to follow it.

That check was itself wrong twice before it was right — a count-based version
(`sites >= 3 && withMount >= 3`) passed with a call site deleted, and a `});` boundary regex
matched the `}` inside an explanatory comment. It now delimits each region at the next call
site, which is unambiguous. **Verified by deleting each of the five mounts individually and
confirming the suite goes red — all five are genuinely required, none is decorative.**

Worth knowing: `git checkout -- web/bada_core.js` during that verification wiped the working
tree back to the last commit. Recovered from a `%TEMP%` copy; re-verify the mount count (5)
before trusting the file again.

`bada_manager_cache_test.js` → **78/78**, all four files pass the ESM parse.

---

# Beta Handoff — 2026-10-03 (round 1: custom-rendered rows now follow the language switch)

## The bug

With the UI language set to English, the three buttons on the Global Presets row still read
전체 백업 (JSON) / 불러오기 / 프리셋 관리자 열기.

Cause: `buildPresetsRow()` is a `type` **renderer**, and ComfyUI runs it exactly ONCE, when the
row is created. The buttons therefore kept whichever language was active at that moment.
Native rows are re-labelled by `bada_core.js`'s `applyBilingualSettingsUI()`, but a
custom-rendered row is invisible to that pass — so it silently kept the old language.

## The fix

- The presets row gets an explicit `id="bada-v2-presets-row"` and a `_badaRefreshLanguage()`
  hook that rewrites the three button labels **and** re-renders the count strip **in place**.
  In place rather than `replaceWith()`, because ComfyUI still holds a reference to that
  element as the row's rendered content.
- `refreshPresetsRowLanguage()` is a no-op when the row is not on screen.
- The entry point was renamed `mountTranslatorRows()` → **`mountLocalizedRows()`** (global
  `__BADA_MOUNT_LOCALIZED_ROWS__`) because it now does two jobs: mounting the translator Save
  buttons, and re-labelling the presets row. `bada_core.js`'s existing settings-UI pass calls
  it, so language switches are picked up without a dialog reopen.

`bada_manager_cache_test.js` → **75/75**, both files pass the ESM parse.

Note: my first version of the new check asserted a `textContent = ko ? ...` form that does not
exist — the labels go through a local `set()` helper. The check was wrong, not the code.

---

# Beta Handoff — 2026-10-03 (forced-add list ships the user's own nodes by default)

## Change

`BadaUtils.TranslationWhitelist` default is now:

```
Show Any, Preview as Text, Show Text
```

was `show text, show any`. So a **fresh install** of the user's custom-node pack comes up with
the three nodes already in 번역 강제 추가 노드 목록 — no setup needed. These are the user's own
custom nodes, which the automatic detector cannot recognise, which is exactly what the
forced-add list is for.

**This is a default only.** Once the user saves the field, their value wins and the default
never applies again, so existing profiles are unaffected. Matching is case-insensitive and
partial (`matchesNameList` uses `includes`), so the casing is for readability only.

`bada_core.js` still carries the old default on `BADA_UNIFIED_SETTINGS`, but that one is
attached to the legacy `BadaLegacy.TranslationWhitelist` key, which nothing reads. The live
store key is `BadaUtils.TranslationWhitelist`, owned by `bada_settings_v2.js`.

## Open item — investigated, not reproducible, NOT a settings bug

The user reported: adding nodes works, but after clearing the list one badge (`Show Text`)
survives until F5, while the others clear. **Analysis was stopped at the user's request** —
that node always gets the translator anyway.

What was established before stopping, in case it is picked up later:

- Every **state** transition is provably correct. With nodes titled `Show Text` / `Show Any`
  that auto-detection cannot see, driving the real 💾 button through
  add → clear gave: store `""`, both `_badaNoteAttached === false`, both
  `badaNoteState === null`, no exception, and no Bada console errors.
- `setSettingValue(id, "")` genuinely writes an empty string; the store does **not** fall back
  to the default, so "the empty write was silently ignored" is ruled out.
- A first attempt failed to reproduce because the test used `CLIPTextEncode`, which has a
  text widget and is therefore **auto-detected** — it stays attached after the list is
  cleared, which looks like the bug but is correct behaviour. `KSampler` is the node type that
  actually isolates the forced-add path.
- The badge is painted from `node.onDrawForeground` (installed once on attach, never
  uninstalled), and `drawHeaderButtons()` bails when `badaNoteState` is null — so clearing the
  state does stop the paint.

So the remaining suspect is the **canvas repaint while the settings modal is open**, which was
already measured as suppressed. The Save handler forces two repaints for exactly that reason.

---

# Beta Handoff — 2026-10-03 (translator rows: Save button, widened, no F5 needed)

## The root cause behind "I have to press F5"

Instant apply was implemented first, then removed at the user's request. The important finding
is that **it never actually failed** — it was invisible:

```
node badges after the debounce, DIALOG STILL OPEN .... [false, false]   <- state was correct
canvas hash before typing ............................ 13344c724fac
canvas hash after typing, DIALOG STILL OPEN .......... 13344c724fac   <- IDENTICAL: no repaint
canvas hash after closing the dialog ................. abf2849a0dac   <- repainted only here
```

**ComfyUI suppresses canvas repaints while the settings modal is open.** So a Save button by
itself would not have fixed anything; what the user actually gains from it is positive
confirmation that the input was committed. To also remove the F5 reflex, the save handler
forces the repaint itself.

Repaint cost (measured, 40-node canvas), which is why this is cheap:

| | |
| --- | --- |
| forced repaint | avg **31.9 ms**, never over 40 ms (mostly waiting for the next frame) |
| real F5 | **5713 ms** until the app is usable again |
| ratio | ~**179x** |

## What was built (all on NATIVE rows, no custom renderer)

`bada_settings_v2.js` augments the already-rendered DOM; `bada_core.js`'s existing
event-driven settings-UI pass calls `window.__BADA_MOUNT_TRANSLATOR_ROWS__` (idempotent).
Same pattern as `mountManagerCacheWidget()`.

- **💾 Save button**, 34 px, flush to the right edge (`gapToRightEdge: 0`). Flashes `✓` in
  green for 1.2 s on save.
- **Save forces the repaint twice** — immediately, then 120 ms later. The second pass is the
  part that beats the modal's throttling.
- **Input widened**: label column 822 px → 300 px, input 176 px → **656 px**.
- **Font 16 px → 13 px** on every v2 control, matching the row title size.
- **Duplicate / conflict hints restored** for the native rows (they existed only in the legacy
  panel). They warn, they do not rewrite the stored value.

`node dev_tests/verify_translator_rows.cjs` → `translatorRowsAccepted: true` (9/9)

## Duplicate / conflict behaviour — verified, not assumed

Tested against two real `CLIPTextEncode` nodes with distinct titles:

| case | input | result |
| --- | --- | --- |
| A. same name in both lists | excl=`Alpha,Beta` / add=`Alpha,Beta` | both excluded — **Exclude wins** |
| B. same name twice in Exclude | excl=`Alpha, Alpha` | Alpha excluded, Beta kept |
| C. same name twice in Add | add=`Beta, Beta` | both kept |

The behaviour was already correct (`isTargetNoteNode()` tests Exclude first, and matching is a
membership test so duplicates are harmless). What v2 was missing was only the **warning**, and
that is now back.

## Trap worth remembering

The combo rows are **not native `<select>` elements** in this frontend. A rule targeting
`.form-input select` left the language and badge-position dropdowns at 16 px while the text
inputs were correctly 13 px. It needs a descendant selector (`.form-input *`).

## Regression suites

`verify_phase1.cjs` → true, `verify_phase2.cjs` → true,
`verify_translator_rows.cjs` → true, `bada_manager_cache_test.js` → **73/73**,
`bada_folder_drag_test.js` → **103/103**. The frozen `Bada Utils (구)` category is untouched,
including its own Apply button.

---

# Beta Handoff — 2026-10-03 (instant apply + divider removal; legacy category FROZEN)

## Decision the user made

Option **A (instant apply)** was chosen over "apply when the dialog closes", and the
`Bada Utils (구)` category is **frozen** — no further work on it until Phase 3 deletes it.

## Two measurements this rests on

Both were taken against the live instance before writing any code, because getting either
wrong fails *silently*:

1. **A native ComfyUI `text` setting fires `onChange` on every keystroke.** Typing
   "KSampler,Loader" produced 16 calls; blurring produced none. So reacting while typing needs
   no extra machinery — the option-B alternative would have required building dialog-close
   detection from scratch, and would have given no feedback while typing.
2. **`onChange` runs AFTER the settings store write.** Reading `getSettingValue()` back
   synchronously inside the callback returned the identical value on every one of those 16
   calls. Had the order been reversed, the debounced re-apply would have silently re-applied
   the *previous* value.

## What was implemented

- `bada_settings_v2.js`: `scheduleNoteHelperReapply()` — 300 ms debounce, then
  `__BADA_REAPPLY_NOTE_HELPER_NODES__()` + `setDirtyCanvas`. Wired as `onChange` on
  `BadaUtils.TranslationBlacklist` and `BadaUtils.TranslationWhitelist`. **No Apply button.**
  The value itself is persisted by ComfyUI; this only re-scans the canvas so the badges
  attach/detach.
  The debounce is a *cost* control, not a correctness one: the re-apply walks every node.
- `bada_core.js`: the forced divider rule was `PresetBadgePosition` + `GlobalPresetsPanel`
  only; it is now the `BadaUtils` **prefix**, so all 15 v2 rows lose their painted line and the
  category reads as one continuous block. Only the line is removed — the 8 px margin rhythm
  above it is untouched. The selector is a prefix on purpose, so the frozen `BadaLegacy.*`
  rows keep their separators.

`node dev_tests/verify_instant_apply.cjs` → `instantApplyAccepted: true` (7/7)

| check | measured |
| --- | --- |
| typing re-applies with no Apply button | 11 keystrokes → 0 calls at +120 ms, **1 call** after the debounce |
| the burst is coalesced | 11 keystrokes → 1 re-apply |
| value persisted | `ZZProbeNode` |
| every v2 divider | `rgba(0, 0, 0, 0)` |
| frozen (구) dividers | `rgb(73, 74, 80)` — unchanged |
| legacy Apply button | still present |
| Bada page errors | none |

Regression suites re-run green: `verify_phase1.cjs` → true, `verify_phase2.cjs` → true,
`bada_manager_cache_test.js` → **69/69**, `bada_folder_drag_test.js` → **103/103**.

## Two mistakes made here, both caught by the suites

1. I wrote a CSS comment inside the injected template literal using **backticks**
   (`` `my-8 border-t` ``), which broke the module parse — the same class of bug as the stray
   brace that broke Phase 1. The file already carries a
   `NOTE: no backticks allowed in this block` warning. Use plain quotes in that block.
2. My first "legacy Apply button is untouched" check asserted `/function handleApply/`, but
   the source declares `const handleApply = () => {`. The check was wrong, not the code.

## Not done (deliberately)

- The legacy panel's **duplicate/conflict hint** (`⛔ "X" is in both Exclude and Add`) exists
  only in `buildNoteHelperPanel()`. v2's native text rows have no such hint. Adding it would
  mean building a custom renderer, which is exactly what v2 exists to remove — so it is out
  of scope unless the user asks for a non-renderer version.

---

# Beta Handoff — 2026-10-03 (Settings v2: translator rows invisible — fixed)

## The regression the user reported, and the fix

Symptom: in the new **Bada Utils** category the *텍스트 & 프롬프트 원클릭 번역기* row
looked empty, and the *번역 제외 / 강제 추가 목록* rows were gone entirely.

Cause: `bada_core.js` carries a block of CSS that **keys on the setting id**. Three of those
rules were written when the translator was a **custom-renderer** row, where hiding the row's
own label and native switch is correct because the rendered panel supplies its own toggle:

```css
div[data-setting-id="BadaUtils.NoteHelper"] .form-label { display: none !important; }
.setting-group:has([data-setting-id="BadaUtils.TranslationBlacklist"]) { display: none !important; }
```

Phase 1 moved the canonical `BadaUtils.*` ids to settings v2, where `NoteHelper` is a **plain
native boolean** — but the selectors still said `BadaUtils.*`, so they kept matching and
suppressed v2's real controls. Measured before the fix:

| row | measured |
| --- | --- |
| `BadaUtils.NoteHelper` | `labelDisplay: none` — bare unlabelled switch, height 34 |
| `BadaUtils.TranslationBlacklist` | `groupDisplay: none`, height 0 |
| `BadaUtils.TranslationWhitelist` | `groupDisplay: none`, height 0 |

Fix: scope those rules (and the language-change panel rebuild at `bada_core.js`'s
`applyBilingualSettingsUI`) to **`BadaLegacy.*`**, which is where the custom-renderer rows
actually live now. Measured after:

| row | v2 | legacy |
| --- | --- | --- |
| `*.NoteHelper` | height 38, label + toggle visible | height 118, panel intact, label hidden (by design) |
| `*.TranslationBlacklist/Whitelist` | height 38, visible | hidden (by design — the legacy panel has inline list inputs) |

The v2 list rows **must** stay visible: Phase 2 removed the inline translator panel, so those
two native rows are the only remaining UI for those settings. Hiding them made them
unreachable. `dev_tests/bada_manager_cache_test.js` now asserts that no
`BadaUtils.NoteHelper` / `BadaUtils.Translation*` selector survives in `bada_core.js`.

**Generalisable lesson for Phase 3:** any CSS or JS in `bada_core.js` that selects a setting by
`[data-setting-id="BadaUtils.…"]` must be audited. The `^="BadaUtils"` prefix selectors are
still correct (they intentionally target v2), but exact-id ones were written for the custom
renderers and now follow the canonical ids to the wrong category.

All suites re-run green after the fix: `verify_phase1.cjs` → `phase1Accepted: true`,
`verify_phase2.cjs` → `phase2Accepted: true`, `bada_manager_cache_test.js` → **65/65**,
`bada_folder_drag_test.js` → **103/103**.

---

# Beta Handoff — 2026-10-03 (Settings v2 Phase 2: presets row self-owned)

## Phase 2 acceptance: PASS (browser-verified)

`node dev_tests/verify_phase2.cjs` → `phase2Accepted: true`

| check | result |
| --- | --- |
| `window.__BADA_BUILD_PRESETS_PANEL__` no longer exists | PASS (`undefined`) |
| v2 presets row renders its own open / backup / import buttons | PASS |
| v2 row does **not** reuse the legacy inline panel | PASS |
| "Open Presets Manager" opens the overview modal | PASS |
| legacy `(구)` row keeps its old inline panel (no regression) | PASS |
| no Bada page errors during the flow | PASS |

Also still green: `verify_phase1.cjs` → `phase1Accepted: true`,
`bada_manager_cache_test.js` → **64/64**, `bada_folder_drag_test.js` → **103/103**.

## What Phase 2 changed

1. **The window bridge is deleted.** v2's `GlobalPresetsPanel` row used to call
   `window.__BADA_BUILD_PRESETS_PANEL__` — a global pointing back into `bada_core.js`'s
   `buildInlinePresetsPanel()`. That was the last thing forcing v2 to be a leaf module.
   `bada_settings_v2.js` now imports `presets_overview_modal.js` directly.
2. **Backup / restore was extracted, not duplicated.** The JSON export and the merge-on-import
   (~45 lines) lived inline inside `buildInlinePresetsPanel()`, so v2 could not have reused them.
   They now live in `presets_overview_modal.js` as `exportGlobalPresetsJson()` and
   `importGlobalPresetsJson(onDone)`, and **both** the legacy panel and the v2 row call them.
   File names, merge semantics, the `/api/bada/presets/save` POST and the toasts are unchanged.
3. **The v2 row is deliberately compact.** The legacy inline panel rendered a full card grid
   *inside* the settings row — that is what made the old category fifteen tall groups. The
   overview modal already shows that grid, so v2 shows a count strip (top 12 node types + `+N`)
   and a button into the modal. Node type names come from an importable JSON file, so they go
   through `escapeHtml()`.

`buildInlinePresetsPanel()` itself is **kept** — the `(구)` category still renders it. It is
deleted in Phase 3 along with that category.

---

# Beta Handoff — 2026-10-03 (Settings v2 Phase 1: coexistence verified)

> ⚠️ **Read the "Two blocking bugs found in this session" section below before touching
> `web/bada_settings_v2.js`.** Both failure modes are completely silent — no exception, no
> console warning, no error toast.

## Two blocking bugs found in this session

### 1. A stray `}` made the ENTIRE extension fail to load

`web/bada_settings_v2.js` ended with one closing brace too many. Because `bada_core.js`
imports it, the parse error killed the whole Bada JS bundle: **no Bada settings category
rendered at all**, and every Bada extension feature was dead in the browser. The Python side
kept working, so `/object_info` still listed all five Bada nodes — which makes this look like
a settings-only problem when it is not.

It survived the previous session because `node --check web/*.js` **passed**: run against a
`.js` path, Node did not parse the file as the ES module the browser actually loads.
`node --check` only surfaces this class of bug when the file is parsed as a module:

```powershell
Copy-Item web\bada_settings_v2.js "$env:TEMP\v2.mjs" -Force; node --check "$env:TEMP\v2.mjs"
```

Every file in `web/` now passes that ESM check. Use it, not the bare `.js` form.

### 2. ComfyUI renders AT MOST ONE SETTING PER `[category, subgroup]` PAIR

This invalidates the original Phase 1 design premise ("put all rows in one `General`
subgroup so ComfyUI emits zero forced dividers"). Measured with Playwright against the live
instance at `127.0.0.1:8188`, as a controlled experiment:

| registration | rendered |
| --- | --- |
| 3 rows, ONE shared subgroup | `["EXP.A3"]` — 2 of 3 silently lost |
| 3 rows, one subgroup each | `["EXP.B1","EXP.B2","EXP.B3"]` — all 3 |

Before the fix the new "Bada Utils" category showed **1 of its 15 rows** (the last one
registered). The legacy category was unaffected, purely because every legacy row already had
its own subgroup.

**Therefore every v2 row gets its own subgroup** (derived from its id). The subgroup *label*
stays invisible because `bada_core.js` already hides `> h3.text-base` for
`[data-setting-id^="BadaUtils"]`, so "no dividers" remains a CSS concern rather than a
grouping concern. `dev_tests/verify_phase1.cjs` pins `EXPECTED_V2_ROWS = 15` so a shrinking
row list fails the build instead of passing quietly.

## Phase 1 acceptance: PASS (browser-verified)

`node dev_tests/verify_phase1.cjs` → `phase1Accepted: true`

- Both categories coexist; the new one sits **above** the legacy one (nav follows
  registration order).
- New category renders all **15** rows, all with canonical `BadaUtils.*` ids.
- Legacy category renders all **15** rows, all remapped to `BadaLegacy.*`.
- `node dev_tests/bada_manager_cache_test.js` → **60/60 PASS**.
- `node dev_tests/bada_folder_drag_test.js` → **103/103 PASS**.
- `python dev_tests/bada_folder_rename_test.py` → **not run**: no `python` on PATH in this
  environment (`py -3` resolves to the Store stub, exit 9009). No Python file was touched.

`verify_phase1.cjs` also had a bug worth noting: it read `[data-setting-id]` as a *descendant*
of `.setting-item`, but the attribute lives **on** `.setting-item` itself, so `rowIds` was
always `[]` and the probe asserted nothing about the rows.

## Where the backup actually lives

The pre-migration state is preserved as a **git branch**, not as a separate file in `web/`:

- `backup/pre-settings-v2` (local) and `beta/backup/pre-settings-v2` (pushed) — both at
  `d1215df`, which is also `main`'s HEAD.
- Verified: that tree has **no** `BadaLegacy` occurrences and **no** `web/bada_settings_v2.js`.

So the Settings v2 work is currently **uncommitted working-tree changes** on top of that
snapshot. Restore with `git checkout backup/pre-settings-v2 -- web/`.

---

# Beta Handoff — 2026-10-03 (v0.1-beta5: Async Studio panel + Prompt Generator UI)

## Current state

| | |
| --- | --- |
| Beta remote | `bada-ya/ComfyUI-Bada-Utils-Beta`, branch `main` |
| Beta head | `3752032` — *fix(async): unclip the options row, drop toggle banners, auto-grow the composer* |
| Production | `bada-ya/ComfyUI-Bada-Utils` — **untouched, still `da6910f`** |
| Delta vs production | 20 commits, 54 files, +13,256 / −1,320 |
| Browser-verified | yes, by the user, on the daily driver |

Beta is **20 commits ahead of production** and is the only thing that has been touched this session.
`origin` is read-only (`ls-remote`); the single write this session was `git push beta main`.

## What you must do to see a change (read this first)

ComfyUI loads the two halves of this extension at different times, so **what you must do to see a
change depends on which files were touched**. Getting this wrong is silent — the UI keeps working
and simply ignores your input.

| Touched | What to do | Why |
| --- | --- | --- |
| `web/*.js`, `web/*.css` | **Ctrl+F5** in the browser (nothing else) | Served straight off disk; the browser is the only cache. A plain F5 is not enough — ComfyUI serves extensions with long cache headers. |
| `engines_registry.json`, any `user_prompts` / `gemini_prompts` list | **Ctrl+F5** | `GET /api/bada/promptgen/registry` reads the file per request and `load_registry()` caches by **mtime**, so a rename shows up without a restart. |
| `nodes/*.py`, `server/*.py` | **Restart ComfyUI, then Ctrl+F5** | Python is imported once at node registration. `INPUT_TYPES` is built at that moment, so a **new widget does not exist** until the process restarts. |

### The failure mode worth memorising

Adding a widget to `INPUT_TYPES` and only doing Ctrl+F5 gives you a frontend that renders the
control perfectly and sends the value **nowhere**. Nothing errors; the value is just dropped.

`BadaPromptGenerator` guards this: if the `aspect_ratio` widget is missing the picker turns red and
toasts *"⚠️ 화면비 값이 전달되지 않습니다. ComfyUI를 재시작해 주세요."* plus a console warning. That
message means **restart, do not refresh**.

Also worth knowing:

- Restart the **daily driver**, not `ComfyUI_antig`.
- If a node's *layout* looks stale after a restart, do Ctrl+F5 **again** — a restart alone re-fetches
  the extension JS only for newly loaded nodes.
- Changes never require `pip install`; the only Python dependency this extension has beyond
  ComfyUI's own (`aiohttp` ships with ComfyUI itself) is optional.

## Destination

- Repository: `bada-ya/ComfyUI-Bada-Utils-Beta`
- Branch: `main`
- The production repository `bada-ya/ComfyUI-Bada-Utils` was **not** pushed to and remains at
  `da6910f`. `origin` is only ever read (`ls-remote`, `--dry-run fetch`), never written.

## Why this batch exists

A UI polish + bug-fix pass over the two Gemini-facing nodes, driven by what the user saw on the
daily driver. Every item below was a visible defect, not a refactor: three of them made the panel
physically reshape itself on interaction.

## Changes (v0.1-beta5)

### 1. Async Studio options row was clipped in both languages

The NSFW / Korean-translation toggles rendered as `Allow NS…` and `한국어 변…`. Cause: each card
held an `ON`/`OFF` chip worth ~45px + an 8px gap, inside a three-column row that only had 474px
to work with (node 520px − 20 chrome − 24 padding). Chips removed (**+106px**), the toggle group
now takes first claim on the width (`flex: 0 1 auto` → `1 1 auto`), and `.bada-options-row` gained
`flex-wrap: wrap` so dragging the node narrower moves the aspect picker onto its own line instead
of truncating. Measured after: **386px (ko) / 378px (en) against 474px**.

The pressed state moved onto the card itself — `.bada-toggle-card.on`, amber for NSFW, green for
translation — instead of a text chip, and keeps a 1px border in both states so toggling never
reflows the row. Visible labels shortened (`성인용 콘텐츠 (NSFW)` / `Allow NSFW`); the full wording
lives in `aria-label` and the tooltip. Toggles also gained `role="button"`, `tabindex="0"`,
`aria-pressed`, a `:focus-visible` ring and Enter/Space activation.

### 2. Toggle clicks popped a banner over the panel

`showToast()` in the NSFW / Korean handlers fired on every click, in both languages, on **both
enable and disable**. `.bada-toast` is a block child of the card's flex column, so it shoved the
layout down rather than floating over it. Removed — the card's own border/background change is
the feedback.

Same fix for the Gemini persona menu: all six entries (4 Gem personas + the Gemini-only system
prompts) funnelled through `applyGemPromptSelection()` and fired `📜 적용됨` on every pick. The
trigger label already shows the selection, so nothing is lost. **Error** toasts (manager-open
failures) are deliberately untouched — only the confirmation banners went.

### 3. Chat composer was pinned to one line

`rows = 1` plus a CSS `max-height: 80px` with no resize logic. Now 3 lines at rest, growing upward
while typing to a 5-line cap, then scrolling the text upward inside the box; sending resets it to
3. Implemented with the existing `autoFitOutputTextarea()` pattern (reset to `auto`, measure
`scrollHeight`) so JS and CSS cannot disagree about the cap. `max-height` was removed from CSS
because it fought the auto-grow; `line-height: 1.5` is now explicit so the 5-line maths is
reliable. Enter still sends, Shift+Enter still newlines.

### 4. Earlier in the same branch

- **KREA2 / QWEN2.1** menu labels, `name_en` display support in `engines_registry.json`. The
  registry `name` stays the **backend value**; only the presentation is localized.
- Shared **aspect-ratio picker** injected into Gemini, plus panel-height re-measurement when the
  language or node width changes — the 영상 길이 row was being clipped (hidden entirely in English,
  which wraps one row more).
- `LocalStorage 자동 저장` wording removed; system-prompt button moved right; stray control icons
  dropped.
- Async Studio output socket stripped in **both** `onNodeCreated` and `onConfigure` (LiteGraph
  restores serialized `outputs` *after* construction, so `onNodeCreated` alone let a saved
  workflow's `prompt` socket survive a refresh).
- 🔔 bell relocated into the API-key label row; `.bada-toast` generation banners removed.

## Tests

| Suite | Result |
| --- | --- |
| `node dev_tests/bada_async_gemini_layout_test.js` | **78/78 PASS** (new file) |
| `node dev_tests/bada_promptgen_ratio_test.js` | PASS (new file) |
| `python dev_tests/bada_promptgen_registry_test.py` | PASS (new file) |
| `node dev_tests/bada_folder_drag_test.js` | 103/103 PASS |
| `python dev_tests/bada_folder_rename_test.py` | 53/53 PASS |
| `node --check` on every file in `web/` | PASS |
| `py_compile` on every Python file | PASS |
| CSS brace balance (`bada_async_gemini.css`) | 211/211 |

`bada_async_gemini_layout_test.js` pins the six banner removals, the output-socket strip in both
hooks, the ON/OFF chip removal, the persona-menu toast removal and the composer's 3→5-line growth.
Short **action** toasts (copy / attach / key check) are kept on purpose, so the no-banner assertion
is scoped to generation wording rather than banning `showToast` outright.

## Not verified

- **No browser automation here** (no Playwright). Layout claims are backed by the width model in
  the commit body plus the user's manual confirmation on the daily driver.
- Node height after a **language switch** in the Async Studio was not re-checked visually; the
  recalibration code is in place but unexercised.
- `fitToContent()` only ever **grows** the node and `userPreferredHeight` is persisted to
  localStorage, so a user who manually made the node very tall cannot get it back automatically.
  The 5-line composer cap keeps this bounded, but the behaviour is deliberate — do not "fix" it
  into an auto-shrink without reading this first.

## Previous batch — v0.1-beta4 audit fixes (`d498f35` and earlier)

Retained for context: the XSS fix and the two performance items below are already on Beta and
are part of the delta against production. Nothing here was touched in v0.1-beta5.

## Changes

### 1. XSS in the sidebar toast (the one that mattered)

`WorkflowsPlusManager.showToast()` built its markup with an unescaped `${message}`, and roughly
ten call sites forward `data.error` straight from the REST API. Those messages embed
user-controlled text — `Source file not found: <path>`, `'<name>' already exists`,
`Move failed: <OSError>`. A workflow file whose name contains markup therefore ran as HTML.
Windows forbids `<`/`>` in filenames, but Linux/macOS do not, and a shared workflow pack is an
untrusted source. ComfyUI's local server has no authentication, so XSS there equals full access
to the local REST API.

Fixed once at the entry point, so no call site had to change. Every caller was checked first to
confirm none of them intentionally passes markup.

### 2. Blocking filesystem walk on the aiohttp event loop

`get_all_available_models()` runs `os.listdir(models_dir)` plus an `os.walk()` over every model
subfolder and had **no cache** (the existing `CACHED_DETECTIVE_DB` belongs to the missing-node
detective and is unrelated). It was called directly from the `async def get_models_handler`, so
for the duration of the scan the whole server — UI, queue, websockets — stalled.

- Added `get_all_available_models_cached()`: 300 s TTL guarded by a `threading.Lock`. An
  empty/failed result is deliberately **not** cached, so a transient filesystem error cannot
  poison the answer for five minutes.
- `get_models_handler` now awaits `asyncio.to_thread(...)` and reports a `cached` flag.
- `get_tree_handler` offloads `build_workflow_tree()` the same way.

### 3. Permanent 300 ms polling loop

`web/bada_core.js` ran `setInterval(() => document.querySelector('[role="dialog"]'), 300)` from
page load to tab close — three DOM queries per second, forever, and the only interval in the
codebase that was never cleared.

- Replaced with a `MutationObserver` that does nothing while the page is idle.
- The poll's second job (re-adding the left-sidebar anchor icon when the native UI drops it) was
  folded into the existing per-dialog observer by watching `removedNodes`, so the repair is now
  event-driven too. Nothing polls any more.
- Bonus: the two startup probes in `workflow_organizer.js` (2 s tab observer, 3 s pinia
  subscription) keep their retry semantics — ComfyUI's Vue app may not exist yet at boot — but
  now go through `retryUntilSatisfied()` and stop for good once attached, or after 60 s.

### 4. N1 - de-duplicate `escapeHtml()`

Nine copies existed (seven module-level functions plus two `WorkflowsPlusManager` methods) and
had already drifted: two different apostrophe entities, some with a falsy guard and some
without. New `web/bada_shared.js` (90 lines) exports `escapeHtml()` and a shared toast
implementation; the seven duplicates are deleted. The two class methods stay as thin delegating
wrappers so the many `this.escapeHtml(...)` call sites are untouched.

The four `showToast()` implementations were deliberately **left alone** — each has a
deliberately different look (e.g. the glassmorphic one in `presets_modal.js`) and there is no
browser here to verify a visual change. The shared module gives them a migration target.

### 5. N3 - surface silently swallowed errors

Every empty `catch {}` and bare `except: pass` now logs at debug level
(`console.debug(...)` / `logger.debug(..., exc_info=True)`), which stays silent by default.

- JS: **104** blocks converted. (An earlier line-based count of 60 missed the
  `catch (e) {` multi-line form — 104 is the accurate figure.)
- Python: **14** blocks converted. `nodes/bada_regional_prompt.py` had no logger at all, so a
  `logging` import and a module `logger` were added.
- The codemods were one-off scripts and have been deleted.
## Runtime Notes

- **A ComfyUI restart is required** — `server/bada_server_api.py` changed.
- The frontend-only parts need a browser hard refresh (<kbd>Ctrl</kbd>+<kbd>F5</kbd>).
- Verified environment: `D:\StabilityMatrix\Data\Packages\ComfyUI` (NOT `ComfyUI_antig`),
  `user\default\workflows` is a junction to `D:\AI\workflows`, and
  `custom_nodes\ComfyUI-Bada-Utils` is a junction to this repo, so edits apply on restart.
- Do not touch `D:\StabilityMatrix\Data\Packages\ComfyUI_antig`.
- `config.json`, `favorites_data.json`, `*.bak` and `dev_tests/_shots/` are gitignored, so no
  API keys or scratch artefacts were committed.

## Verification

- `node --check` on **every** file in `web/` and `dev_tests/`: PASS.
- `py_compile` on every Python file: PASS.
- `node dev_tests/bada_folder_drag_test.js` -> **103/103 PASS** (was 90).
  New coverage: the toast escaping a `<img src=x onerror=...>` payload, `escapeHtml()` having
  exactly one implementation, the absence of the 300 ms poll, the event-driven dialog watcher and
  anchor self-heal, and the self-terminating startup probes.
- `python dev_tests/bada_folder_rename_test.py` -> **53/53 PASS** (was 41).
  New coverage: the model-scan TTL cache cold -> warm -> expiry path, that an empty scan is never
  cached, and that neither handler still calls the blocking walk inline.
- Import graph checked for all seven consumers of `bada_shared.js`, and the module was confirmed
  to actually be served by the running instance (HTTP 200).

### Two mistakes made during this batch, both caught and corrected

1. The JS codemod spliced matches front-to-back, which invalidates the positions of matches not
   yet processed. Fixed by replacing back-to-front; the 104 conversions are correct.
2. The Python codemod emitted `except E: as _ignored_err`, breaking compilation. Repaired with a
   corrective pass rather than reverting, so the audit fixes in the same files survived.
   `py_compile` is what caught it.

### Not verified

- **No browser testing.** Playwright is not installed here, so nothing requiring a real browser
  was checked. The `bada_shared.js` import graph is syntactically valid and the module is served
  over HTTP, but it has not been loaded by a browser. The settings-dialog MutationObserver is
  likewise unexercised. **Confirm this first before promoting to production.**
- The new body-level observer fires on every DOM mutation batch. Idle cost is zero, but on a
  very busy canvas the callback may run more often than the old 300 ms timer did. If drag
  latency is noticed, narrow the observer to the dialog host element.
- No memory profiling, no concurrency testing, and the XSS fix was verified by asserting the
  escaped output rather than by executing a payload in a browser.

## Follow-up

- Load the extension in a browser and confirm the sidebar, presets hub, smart presets and settings
  dialog all still work (this batch touched shared code in seven files).
- Re-run both sidebar tests after any ComfyUI frontend version bump.
- Decide whether the folder "Move" context-menu entry should be exposed (the backend and the drag
  path already support it; only the menu entry is still hidden for folders).
- Decide whether multi-select should gain a context-menu multi delete/move.
- Optionally migrate the four remaining `showToast()` implementations onto `bada_shared.js`.
- Promotion to production (`origin`) is still **not** approved and was never pushed to.