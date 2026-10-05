// Read-only measurement: does ComfyUI render ONE .setting-group per category SUBGROUP (so
// merging subgroups removes dividers), or one per individual setting? Opens the settings
// dialog, visits a stock ComfyUI category (Comfy), and reports how many setting rows each
// .setting-group holds. Verifies the "collapse subgroups to drop dividers" hypothesis.
const { chromium } = require('playwright');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1900, height: 1400 } });
    await page.goto('http://127.0.0.1:8188/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(7000);
    await page.evaluate(() => document.querySelector('.comfy-settings-btn')?.click());
    await sleep(5000);

    const visit = async (navText) => {
        await page.evaluate((t) => {
            const el = [...document.querySelectorAll('*')].find(e =>
                (e.textContent || '').trim() === t && e.children.length <= 2 && e.offsetParent);
            el?.click();
        }, navText);
        await sleep(3000);
        return page.evaluate(() => {
            const groups = [...document.querySelectorAll('.setting-group')];
            return {
                groupCount: groups.length,
                rowsPerGroup: groups.map(g => g.querySelectorAll(':scope > .setting-item').length),
                dividers: groups.filter(g => g.querySelector(':scope > .my-8.border-t')).length,
                h3s: groups.filter(g => g.querySelector(':scope > h3')).length,
            };
        });
    };

    const comfy = await visit('Comfy');
    const bada = await visit('Bada Utils');
    console.log('COMFTY_CATEGORY=' + JSON.stringify(comfy));
    console.log('BADA_CATEGORY=' + JSON.stringify(bada));
    await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });