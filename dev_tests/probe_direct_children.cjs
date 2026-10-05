// Prints the DIRECT children of every Bada .setting-group wrapper, plus the path from the
// forced divider up to its wrapper. Needed to know whether `> .my-8` will match the
// ComfyUI-inserted divider, or whether it sits deeper and needs a descendant selector.
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
        return groups.map(g => {
            const sid = g.querySelector('[data-setting-id]')?.getAttribute('data-setting-id') || '';
            const kids = [...g.children].map(c => ({
                tag: c.tagName.toLowerCase(),
                cls: (c.getAttribute('class') || '').trim().slice(0, 48),
                h: Math.round(c.getBoundingClientRect().height),
            }));
            const div = g.querySelector('.border-t.border-border-default');
            const path = [];
            let cur = div;
            while (cur && cur !== g) { path.unshift(cur.tagName.toLowerCase() + '.' + (cur.getAttribute('class') || '').split(' ')[0]); cur = cur.parentElement; }
            return { sid, kidCount: g.children.length, kids, dividerDepth: div ? path.length : -1, dividerPath: path.join(' > ') };
        });
    });
    console.log(JSON.stringify(dump, null, 1));
    await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });