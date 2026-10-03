// Focused probe for the region the user circled: the "프리셋 뱃지 위치" row and the
// settings rows directly above/below it. Dumps the full inner DOM tree with rects and
// painted borders, then saves a 2x crop so the lines can be compared to the screenshot.
const { chromium } = require('playwright');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1900, height: 1400 }, deviceScaleFactor: 2 });
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
        const groups = [...document.querySelectorAll('.setting-group')];
        const byId = (id) => groups.find(g => g.querySelector('[data-setting-id="' + id + '"]'));
        const ids = [
            'BadaUtils.ShowPresetBadges',
            'BadaUtils.PresetBadgePosition',
            'BadaUtils.GlobalPresetsPanel',
            'BadaUtils.Language',
        ];
        const out = {};
        for (const id of ids) {
            const g = byId(id);
            if (!g) { out[id] = 'MISSING'; continue; }
            const gr = g.getBoundingClientRect();
            const nodes = [];
            const walk = document.createTreeWalker(g, NodeFilter.SHOW_ELEMENT);
            let n;
            while ((n = walk.nextNode())) {
                const r = n.getBoundingClientRect();
                const cs = getComputedStyle(n);
                const pseudoB = getComputedStyle(n, '::before');
                const pseudoA = getComputedStyle(n, '::after');
                const bw = parseFloat(cs.borderTopWidth) || 0;
                const bbw = parseFloat(cs.borderBottomWidth) || 0;
                const lineish = (bw > 0) || (bbw > 0)
                    || (parseFloat(pseudoB.borderTopWidth) > 0) || (parseFloat(pseudoA.borderBottomWidth) > 0)
                    || (cs.backgroundImage !== 'none' && /gradient/.test(cs.backgroundImage));
                nodes.push({
                    tag: n.tagName.toLowerCase(),
                    cls: (n.getAttribute('class') || '').trim().slice(0, 60),
                    sid: n.getAttribute('data-setting-id') || '',
                    top: Math.round(r.top - gr.top), h: Math.round(r.height), w: Math.round(r.width),
                    mt: cs.marginTop, mb: cs.marginBottom, pt: cs.paddingTop, pb: cs.paddingBottom,
                    bt: bw ? bw + ' ' + cs.borderTopColor + ' ' + cs.borderTopStyle : '0',
                    bb: bbw ? bbw + ' ' + cs.borderBottomColor + ' ' + cs.borderBottomStyle : '0',
                    bg: cs.backgroundImage === 'none' ? '' : cs.backgroundImage.slice(0, 50),
                    lineish,
                });
            }
            out[id] = { top: Math.round(gr.top), h: Math.round(gr.height), nodes: nodes.filter(x => x.lineish || x.h > 0) };
        }
        return out;
    });
    console.log(JSON.stringify(dump, null, 1));

    // Tight 2x crop spanning the badge rows so the lines are visible.
    const clip = await page.evaluate(() => {
        const groups = [...document.querySelectorAll('.setting-group')];
        const a = groups.find(g => g.querySelector('[data-setting-id="BadaUtils.ShowPresetBadges"]'));
        const b = groups.find(g => g.querySelector('[data-setting-id="BadaUtils.GlobalPresetsPanel"]'));
        if (!a || !b) return null;
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        const top = Math.max(0, ra.top - 14);
        const bottom = Math.min(window.innerHeight, rb.top + 20);
        return { x: 0, y: top, width: window.innerWidth, height: Math.max(10, bottom - top) };
    });
    if (clip) await page.screenshot({ path: 'dev_tests/_badge_zone.png', clip }).catch(e => console.log('clip fail', e.message));
    await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });