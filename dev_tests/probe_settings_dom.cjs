// Structural dump of the Bada settings category: sub-headings, empty leftovers, and the
// rows we hide via CSS. Used to tell "intended hidden heading" from "leftover empty node".
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
        const group = document.querySelector('.setting-group');
        if (!group) return { error: 'no .setting-group' };
        const describe = (el, depth) => {
            const cs = getComputedStyle(el);
            return {
                d: depth,
                tag: el.tagName.toLowerCase(),
                cls: (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).join(' ').slice(0, 80),
                id: el.getAttribute('data-setting-id'),
                disp: cs.display,
                h: Math.round(el.getBoundingClientRect().height),
                text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
                kids: depth < 1 ? [...el.children].map(c => describe(c, depth + 1)) : undefined,
            };
        };
        return {
            groupCls: (group.getAttribute('class') || '').trim(),
            children: [...group.children].map(c => describe(c, 0)),
            h3s: [...document.querySelectorAll('h3')].map(h => ({
                text: (h.textContent || '').trim().slice(0, 28),
                cls: (h.getAttribute('class') || '').trim().slice(0, 60),
                display: getComputedStyle(h).display,
            })),
        };
    });
    console.log(JSON.stringify(dump, null, 1));
    await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
