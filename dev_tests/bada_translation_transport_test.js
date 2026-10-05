/**
 * Guards the POST transport for Google translation (2026-10-04).
 *
 * THE BUG. "Long text doesn't translate" was never a translation failure. The text was
 * percent-encoded into the query string of a GET request, and Google rejects that URL with
 * HTTP 400 once it passes roughly 16.5k characters — about 2,300 Korean characters. Measured:
 *
 *   GET  2,250 chars -> 200      GET  2,300 chars -> 400
 *   POST 40,000 chars -> 200
 *
 * So the failover log filled with 400s that no amount of retrying could fix, while short text
 * worked simply because it never reached the limit. Splitting the text would have papered over a
 * transport bug at the cost of translation quality (each chunk loses surrounding context); POST
 * removes the ceiling outright and is now the primary path, with GET kept as a fallback.
 *
 * These checks are static: they pin the wiring and the fallback ordering, which is what silently
 * regresses. The behaviour itself is proven by dev_tests/verify_translation_transport.py, which
 * drives the real function against the real endpoint.
 *
 *   node dev_tests/bada_translation_transport_test.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const RUNTIME = read("translation_runtime.py");
const SERVER = read(path.join("server", "bada_server_api.py"));
const NODE = read(path.join("nodes", "bada_google_translator.py"));

const results = [];
function check(label, cond, info = "") {
    results.push(Boolean(cond));
    console.log(`[${cond ? "PASS" : "FAIL"}] ${label}` + (info ? ` :: ${info}` : ""));
}

const stripPyComments = (s) => s.replace(/^\s*#.*$/gm, "");

// --- the shared helper exists and is a real POST ---------------------------------
check("post_translation is exported from the shared runtime",
    /def post_translation\(url, params, headers, timeout\):/.test(RUNTIME));
check("post_translation really sends POST",
    /method="POST"/.test(RUNTIME), "a GET here would reintroduce the URL ceiling");
check("post_translation sends a form body, not a query string",
    /urlencode\(params\)\.encode\("utf-8"\)/.test(RUNTIME)
    && /TRANSLATION_POST_CONTENT_TYPE = "application\/x-www-form-urlencoded"/.test(RUNTIME));
check("post_translation bypasses a corrupt local proxy like the GET path",
    /ProxyHandler\(\{\}\)/.test(RUNTIME));
check("post_translation stays third-party free",
    !/^\s*(import|from)\s+requests/m.test(RUNTIME),
    "this module deliberately has no pip dependencies");
check("the GET ceiling is documented where the fix lives",
    /16\.5k/.test(RUNTIME) && /2,300/.test(RUNTIME),
    "the measured numbers are the justification for this whole change; do not lose them");

// --- the shared parser replaces the duplicated inline chunk-walking -------------
check("parse_translate_response is shared", /def parse_translate_response\(res_json\):/.test(RUNTIME));
check("parser handles both documented payload shapes",
    /isinstance\(res_json\[0\]\[0\], list\)/.test(RUNTIME) && /isinstance\(res_json\[0\], str\)/.test(RUNTIME));
check("parser returns empty for an answer carrying no translation",
    /return ""/.test(RUNTIME),
    "an empty parse must fall through to the next endpoint, not report success with ''");

// --- both callers use POST first, GET second -------------------------------------
for (const [name, src] of [["server handler", SERVER], ["translator node", NODE]]) {
    const body = stripPyComments(src);
    const postIdx = body.indexOf("post_translation(");
    // The GET fallback is recognisable by building a URL with a query string.
    const getIdx = body.indexOf("?{urllib.parse.urlencode(params)}") >= 0
        ? body.indexOf("?{urllib.parse.urlencode(params)}")
        : body.indexOf('{urllib.parse.urlencode(params)}');

    check(`${name}: POST is attempted before GET`, postIdx > -1 && getIdx > postIdx,
        `post@${postIdx} get@${getIdx}`);
    check(`${name}: keeps the GET fallback`, getIdx > -1,
        "dropping it would regress any endpoint/mirror that only accepts GET");
    check(`${name}: POST is inside the endpoint loop, so every endpoint gets it`,
        /for base_url, params in strategies:[\s\S]{0,400}?post_translation\(/.test(body));
    check(`${name}: an empty parse falls through instead of returning`, (function () {
        // `return parsed` must be guarded by `if parsed:` — otherwise "" would count as a
        // success and the failover would stop on the first endpoint that answers with no
        // translation. Exactly two guarded returns: one per pass (POST, then GET).
        const guarded = body.match(/if parsed:\s*\n\s*return parsed/g) || [];
        if (guarded.length !== 2) return false;
        // After removing those two, no bare `return parsed` may remain.
        return !/^\s*return parsed\s*$/m.test(body.replace(/if parsed:\s*\n\s*return parsed/g, ""));
    })(), "one guarded return per pass: POST and GET");
}

// --- no duplicated response parsing left behind -----------------------------------
check("no duplicated inline chunk-walking in the server handler",
    !/chunks = \[\s*\n?\s*item\[0\]/.test(stripPyComments(SERVER)));
check("no duplicated inline chunk-walking in the node",
    !/chunks = \[\s*\n?\s*item\[0\]/.test(stripPyComments(NODE)));

// --- pathological input is rejected up front, not after a 20s timeout -----------
check("server handler caps absurd input before spending a request",
    /TRANSLATION_MAX_CHARS/.test(SERVER) && /status=413/.test(SERVER));
check("the cap is documented with its reason",
    /TRANSLATION_MAX_CHARS = 200_000/.test(RUNTIME) && /pathological input/i.test(RUNTIME));

const passed = results.filter(Boolean).length;
console.log(`\n=== ${passed}/${results.length} checks passed ===`);
if (passed !== results.length) {
    console.log("RESULT: FAIL");
    process.exit(1);
}
console.log("RESULT: PASS");