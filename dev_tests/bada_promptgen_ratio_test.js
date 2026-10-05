// Headless check of the prompt-generator header contract. Dependency-free: the option
// list, the renamed submenus and the removed notice are all asserted against the real
// source so the UI and the backend list can never drift apart silently.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const SRC = read(path.join("web", "bada_prompt_generator.js"));
const PY = read(path.join("nodes", "bada_prompt_generator.py"));
const SHARED = read(path.join("server", "gemini_api.py"));
const REGISTRY = JSON.parse(read("engines_registry.json"));

let fails = 0;
const check = (label, ok) => {
    console.log(`${ok ? "OK " : "BAD"} ${label}`);
    if (!ok) fails++;
};

const REQUIRED = ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "9:21", "21:9"];

// --- 1. aspect ratio picker ------------------------------------------------
const ratioBlock = SRC.match(/const ASPECT_RATIOS = \[([\s\S]*?)\];/);
const jsRatios = ratioBlock ? [...ratioBlock[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
check("picker offers exactly the 9 requested ratios", JSON.stringify(jsRatios) === JSON.stringify(REQUIRED));

const pyBlock = PY.match(/NODE_ASPECT_RATIOS = \(([\s\S]*?)\)/);
const pyRatios = pyBlock ? [...pyBlock[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
check("python NODE_ASPECT_RATIOS matches the UI picker", JSON.stringify(pyRatios) === JSON.stringify(jsRatios));

// Every offered ratio must pass the shared directive builder's own validation,
// otherwise the picker would offer choices that silently do nothing.
const sharedBlock = SHARED.match(/ASPECT_RATIO_CHOICES = \(([\s\S]*?)\)/);
const sharedRatios = sharedBlock ? [...sharedBlock[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
const rejected = jsRatios.filter((r) => !sharedRatios.includes(r));
check(`all ratios accepted by ASPECT_RATIO_CHOICES${rejected.length ? ` (rejected: ${rejected})` : ""}`, rejected.length === 0);

// The node must not break workflows saved before the widget existed: "" is the
// default and must mean "no directive".
check('default aspect_ratio is "" (back-compatible)', /"aspect_ratio"\s*:\s*\(list\(NODE_ASPECT_RATIOS\),\s*\{\s*\n?\s*"default": defaults\.get\("aspect_ratio", ""\)/.test(PY));

// --- 2. submenu renames ----------------------------------------------------
const names = (t) => (REGISTRY.targets.find((x) => x.name === t)?.submenus || []).map((s) => s.name);
check("KREA2 submenu renamed", names("KREA2").includes("T2I / 이미지 분석"));
check("QWEN2.1 T2I submenu renamed", names("QWEN2.1").includes("T2I / 이미지 분석"));
check("QWEN2.1 I2I submenu untouched", names("QWEN2.1").includes("I2I (편집)"));
check("defaults.submenu matches the renamed KREA2 entry", REGISTRY.defaults.submenu === "T2I / 이미지 분석");

// Ids / engine routing must NOT have changed - only the display names moved.
const krea = REGISTRY.targets.find((x) => x.name === "KREA2").submenus[0];
const qwen = REGISTRY.targets.find((x) => x.name === "QWEN2.1").submenus[0];
check("KREA2 id/system_prompt preserved", krea.id === "general" && krea.system_prompt.engine === "krea" && krea.system_prompt.type === "builtin");
check("QWEN2.1 T2I id/system_prompt preserved", qwen.id === "t2i" && qwen.system_prompt.key === "qwen_t2i" && qwen.system_prompt.type === "official");

// --- 3. notice removal / manage button -------------------------------------
check("lsNotice label removed", !/lsNotice\s*:/.test(SRC));
check("lsNotice element removed", !SRC.includes('t("lsNotice")'));
check("bpg-notice CSS removed", !read(path.join("web", "bada_prompt_generator.css")).includes("bpg-notice"));
check("manage button retained", SRC.includes("bpg-btn--manage") && SRC.includes("openPromptGenModal"));

// --- 3b. header layout ----------------------------------------------------
// The manage button must live in row2 (the model row), not row3: leaving it in the
// toggle row put four controls in ~420px and ellipsised 증강/무검열/화면 비율.
const manageRow = SRC.match(/row2\.appendChild\(manageBtn\)/) ? 2 : 0;
const manageStillInToggles = /row3\.appendChild\(manageBtn\)/.test(SRC);
check("manage button moved into row2", manageRow === 2 && !manageStillInToggles);
check("exactly one manageBtn definition", (SRC.match(/const manageBtn/g) || []).length === 1);
check("model select shares row2 with the manage button", /row2\.appendChild\(modelSel\)/.test(SRC) && /row2\.appendChild\(manageBtn\)/.test(SRC));

// Toggle row must wrap rather than crush its labels when the node is narrow.
const CSS = read(path.join("web", "bada_prompt_generator.css"));
check("rows wrap instead of crushing labels", /\.bpg-row \{[^}]*flex-wrap: wrap/s.test(CSS));
check("toggle cards have a wrapping floor", /\.bpg-row--toggles \.bpg-card \{[^}]*flex: 1 1 116px/s.test(CSS));

// "(권장 ⭐)" on the default model is intended and must stay. The registry route injects
// `registry["gemini_models"] = EXACT_MODELS`, and the UI prefers that list over
// FALLBACK_MODELS, so both copies have to agree or the label silently differs.
const SERVER = read(path.join("server", "gemini_api.py"));
check("server EXACT_MODELS keeps '(권장 ⭐)'", /gemini-3\.5-flash-lite[^\n]*\(권장 ⭐\)/.test(SERVER));
check("frontend FALLBACK_MODELS keeps '(권장 ⭐)'", /gemini-3\.5-flash-lite[^\n]*\(권장 ⭐\)/.test(SRC));
check("model label identical in both lists", /gemini-3\.5-flash-lite[^\n]*\(권장 ⭐\)/.test(SERVER) && /gemini-3\.5-flash-lite[^\n]*\(권장 ⭐\)/.test(SRC));
check("registry route still injects EXACT_MODELS", /registry\["gemini_models"\] = EXACT_MODELS/.test(read(path.join("server", "bada_promptgen_api.py"))));

// The model dropdown is width-capped so it cannot starve the manage button — this is
// what "제미나이 플레시 권장을 줄이고" actually asked for.
check("model select is width-capped", /\.bpg-row \.bpg-select \{[^}]*max-width: 250px/s.test(read(path.join("web", "bada_prompt_generator.css"))));

// The ratio card label must stay short: it used to append the selected value, which
// overflowed the card and rendered as "화면 비율 ...".
check("ratio label is '화면 비율'", /aspectRatio:\s*"화면 비율",/.test(SRC));
check("ratio label no longer appends the value", !/ratioLabel\.textContent = chosen/.test(SRC));

// --- 3c. restart guard -----------------------------------------------------
// A new INPUT_TYPES widget only exists after a ComfyUI restart. Without this guard
// the picker renders, accepts a value and silently sends nothing.
check("missing backend widget warns on the console", /if \(!ratioWidget\) \{[\s\S]*?console\.warn/.test(SRC));
check("missing backend widget warns on screen", /aspectRatioBroken/.test(SRC) && SRC.includes("bpg-card--broken"));

// --- 5. icon-free control labels ------------------------------------------
// Icons in the toggle row were the main source of ellipsis. Only the *control
// labels* are stripped; toast/status glyphs (✅❌⚠📎♻) stay because they are
// never truncated and carry meaning.
const controlLabels = [
    ...[...SRC.match(/enhance:\s*"([^"]*)"/g), SRC.match(/uncensored:\s*"([^"]*)"/g)]
    , ...[...SRC.matchAll(/id:\s*"gemini-[^"]*",\s*name:\s*"([^"]*)"/g)].map((m) => m[1]),
];
const ICON = /[\u2600-\u27BF\uD83C-\uDBFF\uDC00-\uDFFF\uFE0F\u2B00-\u2BFF\u2190-\u21FF]/;
const withIcons = controlLabels.filter((l) => ICON.test(l) && !/[⭐]/.test(l));
check(`control labels are icon-free (${controlLabels.length} checked)`, withIcons.length === 0);
check("'⭐' (권장 marker) intentionally kept", /Flash-Lite \(권장 ⭐\)/.test(SRC));
check("python widget labels icon-free", !/"label_on": "\s*(🔥|🔓)/.test(PY));
check("apiHeader icon-free", !/apiHeader:\s*"[^\p{Extended_Pictographic}]*[🔥🔑]/u.test(SRC));
// The manage button is the one deliberate exception: "System Prompt Manager" was wide
// enough to wrap onto its own row, so it was shortened AND given the ⚙️ anchor back.
check("manage label is '⚙️ System Prompt'", /manage:\s*"⚙️ System Prompt"/.test(SRC));
check("manage label is '⚙️ 시스템 프롬프트'", /manage:\s*"⚙️ 시스템 프롬프트"/.test(SRC));
check("'Manager'/'관리' dropped from the manage label", !/manage:\s*"[^"]*(Manager|관리)/.test(SRC));

// --- 6. language-aware labels ---------------------------------------------
// Switching Bada Settings to English used to leave Korean on screen because the
// registry only carried `name`. Every entry now carries `name_en` too, and the
// header renders name_en while still sending `name` as the widget VALUE.
check("registry: every target has name_en", REGISTRY.targets.every((t) => !!t.name_en));
check("registry: every submenu has name_en", REGISTRY.targets.every((t) => (t.submenus || []).every((s) => !!s.name_en)));
check("registry: 시스템 프롬프트 -> 'System Prompt'", REGISTRY.targets.find((t) => t.name === "시스템 프롬프트")?.name_en === "System Prompt");
check("registry: 이미지 분석 -> 'Image Analysis'", REGISTRY.targets.every((t) => (t.submenus || []).filter((s) => s.name === "T2I / 이미지 분석").every((s) => s.name_en === "T2I / Image Analysis")));
check("registry: Korean `name` preserved as the value", REGISTRY.targets.find((t) => t.name === "시스템 프롬프트")?.name === "시스템 프롬프트");
check("header uses localizedLabel for targets", /label: localizedLabel\(target/.test(SRC));
check("header uses localizedLabel for submenus", /label: localizedLabel\(entry/.test(SRC));
check("localizedLabel keeps `name` when lang is ko", /BadaI18n\.lang === "en" && entry\?\.name_en\) return entry\.name_en;/.test(SRC));
check("no hardcoded '시스템 프롬프트' special case left", !/target\.name === "시스템 프롬프트"/.test(SRC));
check("server model list carries name_en", /"name_en": "Gemini 3\.5 Flash-Lite \(Recommended ⭐\)"/.test(SERVER));

// --- 7. manage button right-aligned ---------------------------------------
check("manage button right-aligned", /\.bpg-btn--manage \{[^}]*margin-left: auto/s.test(read(path.join("web", "bada_prompt_generator.css"))));

// --- 8. panel height re-measures on wrap changes ---------------------------
// The rows wrap, so the panel height depends on width and on language. The pass budget
// used to be spent once and never reset, so narrowing the node (or switching language)
// left the old height in place and the panel painted over the 영상 길이 (초) row.
check("calibration budget declared before syncHeaderWidth",
    SRC.indexOf("let calibrations = 0;") < SRC.indexOf("const syncHeaderWidth"));
check("width change resets the calibration budget",
    /syncHeaderWidth[\s\S]*?calibrations = 0;\s*\/\/ new width -> new wrap layout/.test(SRC));
check("width change schedules a re-measure",
    /syncHeaderWidth[\s\S]*?calibrations = 0;[^\n]*\n\s*scheduleCalibration\(0\);/.test(SRC));
check("language switch re-measures the panel", /node\.__bpgRecalibrate\?\.\(\);/.test(SRC));
check("only ONE calibrateHeight definition (old duplicate removed)",
    (SRC.match(/const calibrateHeight = \(\) =>/g) || []).length === 1);
check("only ONE calibration budget (old duplicate removed)",
    (SRC.match(/let calibrations = 0;/g) || []).length === 1);
check("initial HEADER_HEIGHT covers the tallest layout",
    /const HEADER_HEIGHT = (\d+);/.test(SRC) && Number(SRC.match(/const HEADER_HEIGHT = (\d+);/)[1]) >= 250);
check("pending calibration timer cleared on removal",
    /onRemoved[\s\S]*?clearTimeout\(calibrationTimer\)/.test(SRC));

// --- 4. i18n completeness --------------------------------------------------
const koKeys = [...SRC.match(/ko:\s*\{([\s\S]*?)\n    \},/)[1].matchAll(/^\s{8}(\w+):/gm)].map((m) => m[1]);
const enKeys = [...SRC.match(/en:\s*\{([\s\S]*?)\n    \},/)[1].matchAll(/^\s{8}(\w+):/gm)].map((m) => m[1]);
const missingEn = koKeys.filter((k) => !enKeys.includes(k));
const missingKo = enKeys.filter((k) => !koKeys.includes(k));
check(`i18n keys balanced ko(${koKeys.length})/en(${enKeys.length})`, !missingEn.length && !missingKo.length);
check("aspectRatio keys present in both locales", ["aspectRatio", "aspectRatioAuto", "aspectRatioTip", "aspectRatioBroken"].every((k) => koKeys.includes(k) && enKeys.includes(k)));

console.log(fails === 0 ? "\nRESULT: PASS" : `\nRESULT: FAIL (${fails})`);
process.exit(fails === 0 ? 0 : 1);