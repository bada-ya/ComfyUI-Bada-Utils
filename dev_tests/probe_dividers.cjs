// Measures every horizontal rule (hr / border-top / border-bottom) and every empty
// vertical band inside the Bada settings category, so we can tell a real category
// divider from a leftover duplicate line.
const { chromium } = require('playwright');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1900, height: 1400 } });
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
    page.on('pageerror', e => errors.push('PAGEERROR ' + e.message.slice(0, 200)));
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
        // Several `.setting-group` blocks exist. Bada ships 15 of them, one per row, and the
        // two translator-list rows are collapsed to height 1px. Between neighbouring groups
        // ComfyUI's store may drop a horizontal rule, so those collapsed rows can leave a
        // pair of EMPTY lines behind. Dump the whole parent so the divider sequence is visible.
        const groups = [...document.querySelectorAll('.setting-group')];
        const badaGroups = groups.filter(g => g.querySelector('[data-setting-id^="BadaUtils"], [data-setting-id^="⚓ Bada"]'));
        if (!badaGroups.length) return { error: 'no Bada setting-group' };
        const parent = badaGroups[0].parentElement;
        const pRect = parent.getBoundingClientRect();

        const seq = [...parent.children].map(el => {
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            const sid = el.querySelector?.('[data-setting-id]')?.getAttribute('data-setting-id') || '';
            return {
                tag: el.tagName.toLowerCase(),
                cls: (el.getAttribute('class') || '').trim().slice(0, 40),
                sid,
                disp: cs.display,
                h: Math.round(r.height),
                top: Math.round(r.top - pRect.top),
                bottom: Math.round(r.bottom - pRect.top),
                mt: cs.marginTop, mb: cs.marginBottom, pt: cs.paddingTop, pb: cs.paddingBottom,
                bt: cs.borderTopWidth + ' ' + cs.borderTopColor.slice(0, 24),
                bb: cs.borderBottomWidth + ' ' + cs.borderBottomColor.slice(0, 24),
                shadow: cs.boxShadow === 'none' ? '' : cs.boxShadow.slice(0, 40),
                // ::before / ::after are a classic source of invisible-to-the-eye rules.
                before: (() => { const s = getComputedStyle(el, '::before'); return s.content === 'none' ? '' : s.content + ' ' + s.borderTopWidth + ' ' + s.height; })(),
                after: (() => { const s = getComputedStyle(el, '::after'); return s.content === 'none' ? '' : s.content + ' ' + s.borderTopWidth + ' ' + s.height; })(),
            };
        });

        // Everything inside the Bada column that actually PAINTS a horizontal line.
        const painters = [];
        const root = parent;
        const walk = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
        let n;
        while ((n = walk.nextNode())) {
            const r = n.getBoundingClientRect();
            if (r.width < 40) continue;
            const cs = getComputedStyle(n);
            for (const [pseudo, style] of [['self', cs], ['::before', getComputedStyle(n, '::before')], ['::after', getComputedStyle(n, '::after')]]) {
                const bw = parseFloat(style.borderTopWidth) || 0;
                const bbw = parseFloat(style.borderBottomWidth) || 0;
                const bh = parseFloat(style.height) || 0;
                const bg = style.backgroundImage;
                if ((bw > 0 && (bh <= bw + 3 || bh === 0)) || (bbw > 0 && (bh <= bbw + 3 || bh === 0))
                    || (bg !== 'none' && /gradient/.test(bg) && bh <= 4)) {
                    painters.push({
                        tag: n.tagName.toLowerCase(), pseudo,
                        cls: (n.getAttribute('class') || '').trim().slice(0, 52),
                        sid: n.getAttribute('data-setting-id') || (n.closest('[data-setting-id]')?.getAttribute('data-setting-id') || ''),
                        top: Math.round(r.top - pRect.top), w: Math.round(r.width), h: Math.round(r.height),
                        which: bw > 0 ? `bt ${bw} ${style.borderTopColor.slice(0, 22)}` : `bb ${bbw} ${style.borderBottomColor.slice(0, 22)}`,
                    });
                }
            }
        }
        return { parentCls: (parent.getAttribute('class') || '').trim().slice(0, 70), parentH: Math.round(pRect.height), seq, painters };
    });
    console.log(JSON.stringify(dump, null, 1));
    // Screenshot the dialog so the vertical rhythm can be compared against the user's shots.
    await page.locator('.setting-group').first().evaluate(el => el.scrollIntoView({ block: 'start' }));
    await sleep(800);
    const clip = await page.evaluate(() => {
        const gs = [...document.querySelectorAll('.setting-group')].filter(g => g.querySelector('[data-setting-id^="BadaUtils"], [data-setting-id^="⚓ Bada"]'));
        const a = gs[0].getBoundingClientRect(), z = gs[gs.length - 1].getBoundingClientRect();
        const sc = document.querySelector('.setting-group')?.closest('div[class*="overflow"], div[class*="scroll"]');
        return { x: 0, y: Math.max(0, a.top), width: 1900, height: Math.min(2400, z.bottom - Math.max(0, a.top)) };
    });
    await page.screenshot({ path: 'dev_tests/_dividers_shot.png', clip }).catch(e => console.log('clip fail', e.message));
    if (errors.length) console.log('CONSOLE ERRORS:\n' + errors.join('\n'));
    await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });