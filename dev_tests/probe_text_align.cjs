// Measures text alignment inside every Bada settings row: the computed align-items /
// text-align of .form-label, and the horizontal offset of the title span and description
// relative to the label box. Confirms whether the column flex children are centered or
// left-aligned (the user reported them drifting to the center).
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
        const rows = [...document.querySelectorAll('[data-setting-id^="BadaUtils"]')];
        return rows.slice(0, 6).map(row => {
            const id = row.getAttribute('data-setting-id');
            const label = row.querySelector('.form-label, label');
            if (!label) return { id, label: 'MISSING' };
            const lr = label.getBoundingClientRect();
            const cs = getComputedStyle(label);
            const span = label.querySelector("span[id$='-label']") || label.querySelector('span');
            const desc = label.querySelector('.bada-setting-desc');
            const rel = (el) => el ? Math.round(el.getBoundingClientRect().left - lr.left) : null;
            return {
                id,
                labelW: Math.round(lr.width),
                flexDirection: cs.flexDirection,
                inlineAlignItems: label.style.alignItems || '(none)',
                computedAlignItems: cs.alignItems,
                computedTextAlign: cs.textAlign,
                spanLeft: rel(span),
                spanW: span ? Math.round(span.getBoundingClientRect().width) : null,
                descLeft: rel(desc),
                descW: desc ? Math.round(desc.getBoundingClientRect().width) : null,
                descTextAlign: desc ? getComputedStyle(desc).textAlign : null,
            };
        });
    });
    console.log(JSON.stringify(dump, null, 1));
    await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });