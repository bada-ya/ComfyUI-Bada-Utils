// Verifies the two Global-Presets dividers are now PAINTED transparent (line gone) and that
// the freshly injected stylesheet actually reached the browser. Prints the computed
// border-top-color of each Bada divider so it can be diffed after the fix.
const { chromium } = require('playwright');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1900, height: 1400 } });
    await page.goto('http://127.0.0.1:8188/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(7000);
    await page.evaluate(() => document.querySelector('.comfy-settings-btn')?.click());
    await sleep(5000);
    await page.evaluate(() => {
        const n = [...document.querySelectorAll('*')].filter(e =>
            /Bada Utils/i.test(e.textContent || '') && (e.textContent || '').trim().length < 40);
        n[n.length - 1]?.click();
    });
    await sleep(5000);

    const dump = await page.evaluate(() => {
        const groups = [...document.querySelectorAll('.setting-group')]
            .filter(g => g.querySelector('[data-setting-id^="BadaUtils"]'));
        const rows = groups.map(g => {
            const sid = g.querySelector('[data-setting-id]')?.getAttribute('data-setting-id') || '';
            const d = g.querySelector(':scope > .my-8.border-t.border-border-default');
            const cs = d ? getComputedStyle(d) : null;
            return {
                sid,
                borderTopColor: cs ? cs.borderTopColor : 'NO-DIVIDER',
                borderTopWidth: cs ? cs.borderTopWidth : '-',
                dividerDisplay: cs ? cs.display : '-',
            };
        });
        // Did the injected stylesheet reach this page?
        let cssFound = false;
        for (const sh of document.styleSheets) {
            let txt = '';
            try { txt = [...sh.cssRules].map(r => r.cssText).join('\n'); } catch (e) { continue; }
            if (txt.indexOf('BadaUtils.PresetBadgePosition') >= 0
                && txt.indexOf('border-top-color: transparent') >= 0) { cssFound = true; }
        }
        return { cssFound, rows };
    });
    console.log(JSON.stringify(dump, null, 1));
    await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });