// Read-only: dumps the settings dialog's left-nav in DOM order (data-nav-id + label + any
// section heading), so we can tell whether a second "Bada Utils" entry could be placed
// ABOVE the existing one, and whether the order is alphabetical, sectioned, or
// registration order.
const { chromium } = require('playwright');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1900, height: 1400 } });
    await page.goto('http://127.0.0.1:8188/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(7000);
    await page.evaluate(() => document.querySelector('.comfy-settings-btn')?.click());
    await sleep(5000);

    const dump = await page.evaluate(() => {
        const navs = [...document.querySelectorAll('[data-nav-id]')];
        return navs.map((n, i) => ({
            i,
            navId: n.getAttribute('data-nav-id'),
            label: (n.textContent || '').trim().slice(0, 28),
            depth: (n.getAttribute('data-nav-id') || '').split('/').length,
        }));
    });
    console.log(JSON.stringify(dump, null, 0));
    await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });