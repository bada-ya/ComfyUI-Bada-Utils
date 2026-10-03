// Phase 1 acceptance probe: verifies the two Bada categories coexist correctly.
//   - the NEW "Bada Utils" nav entry must sit ABOVE the legacy one (registration order)
//   - the new category must render as ONE .setting-group with ZERO forced dividers
//   - the new rows must carry the canonical BadaUtils.* ids (28+ call sites read them)
//   - the legacy category must render with BadaLegacy.* ids and stay functional
const { chromium } = require('playwright');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// bada_settings_v2.js registers exactly this many rows. Pinning the number here is what
// catches the silent failure mode: rows sharing a [category, subgroup] pair are dropped
// by ComfyUI without any error, so a shrinking row list is the only symptom.
const EXPECTED_V2_ROWS = 15;

async function clickNav(page, navId) {
    await page.evaluate((id) => {
        document.querySelector(`[data-nav-id="${id}"]`)?.click();
    }, navId);
    await sleep(2500);
}

async function measure(page) {
    return page.evaluate(() => {
        const groups = [...document.querySelectorAll('.setting-group')]
            .filter(g => g.querySelector('[data-setting-id]'));
        return {
            groupCount: groups.length,
            dividers: groups.filter(g => g.querySelector(':scope > .my-8.border-t')).length,
            // NOTE: `data-setting-id` lives ON the `.setting-item` element itself, not inside
            // it. The previous selector (`.setting-item [data-setting-id]`) could therefore
            // never match, which is why rowIds came back empty even when the rows rendered.
            rows: groups.flatMap(g => [...g.querySelectorAll(':scope > .setting-item[data-setting-id]')]
                .map(n => n.getAttribute('data-setting-id'))),
        };
    });
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1900, height: 1400 } });
    await page.goto('http://127.0.0.1:8188/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(7000);
    await page.evaluate(() => document.querySelector('.comfy-settings-btn')?.click());
    await sleep(4500);

    const nav = await page.evaluate(() => [...document.querySelectorAll('[data-nav-id]')]
        .map(n => ({ id: n.getAttribute('data-nav-id'), label: (n.textContent || '').trim() })));
    const badaNavs = nav.filter(n => /Bada/i.test(n.label));
    const navOrderOk = badaNavs.length === 2
        && !/\(구\)|\(Legacy\)/.test(badaNavs[0].label)
        && /\(구\)|\(Legacy\)/.test(badaNavs[1].label);

    const newNav = badaNavs.find(n => !/\(구\)|\(Legacy\)/.test(n.label));
    const legacyNav = badaNavs.find(n => /\(구\)|\(Legacy\)/.test(n.label));

    await clickNav(page, newNav?.id);
    const newCat = await measure(page);

    await clickNav(page, legacyNav?.id);
    const legacyCat = await measure(page);

    const result = {
        badaNavs,
        navOrderOk,
        newCategory: { id: newNav?.id, groupCount: newCat.groupCount, dividers: newCat.dividers, rowIds: newCat.rows },
        legacyCategory: { id: legacyNav?.id, groupCount: legacyCat.groupCount, dividers: legacyCat.dividers, rowIds: legacyCat.rows },
    };

    // Phase 1 acceptance criteria, asserted rather than eyeballed.
    const checks = [
        ['two Bada categories coexist', badaNavs.length === 2],
        ['new category is ABOVE the legacy one', navOrderOk],
        ['new category renders ONE row per registered setting (not just the last)',
            newCat.rows.length === EXPECTED_V2_ROWS],
        ['new rows carry the canonical BadaUtils.* ids',
            newCat.rows.length > 0 && newCat.rows.every(id => id.startsWith('BadaUtils.'))],
        ['legacy rows are remapped to BadaLegacy.*',
            legacyCat.rows.length > 0 && legacyCat.rows.every(id => id.startsWith('BadaLegacy.'))],
        ['legacy category still renders its groups', legacyCat.groupCount > 1],
    ];
    const failures = checks.filter(([, ok]) => !ok).map(([name]) => name);
    result.checks = checks.map(([name, ok]) => `${ok ? 'PASS' : 'FAIL'}  ${name}`);
    result.phase1Accepted = failures.length === 0;

    console.log(JSON.stringify(result, null, 1));
    await browser.close();
    if (failures.length) process.exit(1);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });