// Answers ONE question before the v2 migration: is the settings dialog's left-nav ordered
// ALPHABETICALLY or by REGISTRATION time? We register two throwaway categories at runtime
// ("AAA Probe Cat" sorts first alphabetically, "ZZZ Probe Cat" sorts last), open the
// dialog, and dump the [data-nav-id] order.
//   - If AAA/ZZZ land at the END in registration order -> order == registration order, so a
//     new category can be placed ABOVE the old one by registering it first.
//   - If AAA lands near the top -> order == alphabetical, and position is not controllable.
// NOTE: this mutates NOTHING on disk; the probe settings exist only in this browser session.
const { chromium } = require('playwright');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1900, height: 1400 } });
    await page.goto('http://127.0.0.1:8188/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(7000);

    const reg = await page.evaluate(() => {
        const s = window.app?.ui?.settings;
        if (!s?.addSetting) return 'NO_SETTINGS_API';
        try {
            s.addSetting({ id: 'ZZProbe.AAA', name: 'AAA Probe', type: 'boolean', defaultValue: true, category: ['AAA Probe Cat', 'sub'] });
            s.addSetting({ id: 'ZZProbe.ZZZ', name: 'ZZZ Probe', type: 'boolean', defaultValue: true, category: ['ZZZ Probe Cat', 'sub'] });
            return 'OK';
        } catch (e) { return 'ERR ' + e.message; }
    });
    console.log('REG=' + reg);
    await sleep(1500);

    await page.evaluate(() => document.querySelector('.comfy-settings-btn')?.click());
    await sleep(4500);

    const dump = await page.evaluate(() => {
        const navs = [...document.querySelectorAll('[data-nav-id]')].map(n => ({
            navId: n.getAttribute('data-nav-id'),
            label: (n.textContent || '').trim().slice(0, 24),
        }));
        const rootIdx = navs.findIndex(x => x.navId === 'root/Bada Utils');
        const aaaIdx = navs.findIndex(x => /AAA Probe/.test(x.label));
        const zzzIdx = navs.findIndex(x => /ZZZ Probe/.test(x.label));
        return { order: navs.map(x => x.label), badaIdx: rootIdx, aaaIdx, zzzIdx };
    });
    console.log(JSON.stringify(dump, null, 1));
    await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });