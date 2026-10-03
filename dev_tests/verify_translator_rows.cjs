// Acceptance probe for the translator rows: Save button, widened inputs, smaller font,
// duplicate/conflict hints, and a repaint that actually lands without an F5.
const { chromium } = require('playwright');
const { withSettingsGuard } = require('./_settings_guard.cjs');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const crypto = require('crypto');

// MUTATES REAL SETTINGS. The guard snapshots and restores both translator fields, so this
// probe can no longer leave "AlphaNode" in the user's profile.
const MUTATED_IDS = ['BadaUtils.TranslationBlacklist', 'BadaUtils.TranslationWhitelist'];

const canvasHash = async (page) => {
    const d = await page.evaluate(() => {
        const el = document.querySelector('#graph canvas') || document.querySelector('canvas');
        if (!el) return null;
        try { return el.toDataURL('image/png'); } catch (e) { return 'ERR'; }
    });
    if (!d || d === 'ERR') return 'no-canvas';
    return crypto.createHash('sha1').update(d).digest('hex').slice(0, 12);
};
const badges = (page) => page.evaluate(() =>
    (window.app?.graph?._nodes || []).filter(n => n.title === 'AlphaNode').map(n => !!n._badaNoteAttached));

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1900, height: 1400 } });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && /bada/i.test(m.text())) errors.push('CONSOLE: ' + m.text().slice(0, 140)); });

    await page.goto('http://127.0.0.1:8188/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(8000);

    // Everything from here on writes to the real settings store (the probe clicks the real
    // Save button), so it all runs inside the guard.
    const outcome = await withSettingsGuard(page, MUTATED_IDS, async () => {
    await page.evaluate(() => {
        window.app.graph.clear();
        for (const t of ['AlphaNode', 'BetaNode']) {
            const n = LiteGraph.createNode('CLIPTextEncode');
            n.title = t; n.pos = [120, 120];
            window.app.graph.add(n);
        }
        window.app.ui.settings.setSettingValue('BadaUtils.TranslationBlacklist', '');
        window.app.ui.settings.setSettingValue('BadaUtils.TranslationWhitelist', '');
        window.app.graph.setDirtyCanvas(true, true);
    });
    await sleep(2000);

    await page.evaluate(() => document.querySelector('.comfy-settings-btn')?.click());
    await sleep(4500);
    await page.evaluate(() => document.querySelector('[data-nav-id="root/Bada Utils"]')?.click());
    await sleep(2500);
const geo = await page.evaluate(() => {
        const row = document.querySelector('[data-setting-id="BadaUtils.TranslationBlacklist"]');
        const btn = row?.querySelector('.bada-v2-save-btn');
        const input = row?.querySelector('.form-input input');
        const combo = document.querySelector('[data-setting-id="BadaUtils.Language"] .form-input');
        return {
            saveBtnPresent: !!btn,
            saveBtnText: btn?.textContent,
            saveBtnWidth: Math.round(btn?.getBoundingClientRect().width || 0),
            gapToRightEdge: btn ? Math.round(row.querySelector('.form-input').getBoundingClientRect().right - btn.getBoundingClientRect().right) : null,
            labelWidth: Math.round(row?.querySelector('.form-label')?.getBoundingClientRect().width || 0),
            inputWidth: Math.round(input?.getBoundingClientRect().width || 0),
            inputFontSize: input ? getComputedStyle(input).fontSize : null,
            comboFontSize: combo ? getComputedStyle(combo).fontSize : null,
        };
    });

    // Type a conflict; the hint must appear WITHOUT anything being applied.
    const blSel = '[data-setting-id="BadaUtils.TranslationBlacklist"] input';
    const wlSel = '[data-setting-id="BadaUtils.TranslationWhitelist"] input';
    await page.click(blSel); await page.keyboard.press('Control+a');
    await page.type(blSel, 'AlphaNode', { delay: 30 });
    await page.click(wlSel); await page.keyboard.press('Control+a');
    await page.type(wlSel, 'AlphaNode', { delay: 30 });
    await sleep(500);
    const hint = await page.evaluate(() => ({
        bl: document.querySelector('[data-setting-id="BadaUtils.TranslationBlacklist"] .bada-v2-list-hint')?.textContent || '',
        wl: document.querySelector('[data-setting-id="BadaUtils.TranslationWhitelist"] .bada-v2-list-hint')?.textContent || '',
    }));

    // Click Save: node state AND repaint must both change with the dialog still open.
    const beforeSave = await badges(page);
    const hashBefore = await canvasHash(page);
    await page.click('[data-setting-id="BadaUtils.TranslationBlacklist"] .bada-v2-save-btn');
    await sleep(700);
    const afterSave = await badges(page);
    const hashAfter = await canvasHash(page);
    const btnAfter = await page.evaluate(() =>
        document.querySelector('[data-setting-id="BadaUtils.TranslationBlacklist"] .bada-v2-save-btn')?.textContent);
    const stored = await page.evaluate(() => window.app.ui.settings.getSettingValue('BadaUtils.TranslationBlacklist'));

    const checks = [
        ['Save button is mounted on the native row', geo.saveBtnPresent && geo.saveBtnText === '💾'],
        ['Save button is compact and at the far right',
            geo.saveBtnWidth <= 34 && geo.gapToRightEdge >= 0 && geo.gapToRightEdge <= 12],
        ['the input is now much wider than the label', geo.inputWidth > geo.labelWidth && geo.inputWidth > 400],
        ['v2 controls use a smaller font', geo.inputFontSize === '13px' && geo.comboFontSize === '13px'],
        ['conflict warning shows on BOTH rows while typing',
            /Exclude wins|제외 우선/.test(hint.bl) && /Exclude wins|제외 우선/.test(hint.wl)],
        ['Save changes the node state with no reload', beforeSave.some(Boolean) && afterSave.every(v => v === false)],
        ['Save repaints the canvas with the dialog still open', hashAfter !== hashBefore],
        ['the value is persisted', stored === 'AlphaNode'],
        ['no Bada page errors', errors.length === 0],
    ];
    const result = {
        geo, hint, badgesBeforeSave: beforeSave, badgesAfterSave: afterSave,
        canvasHashBeforeSave: hashBefore, canvasHashAfterSave: hashAfter,
        saveBtnTextJustAfterClick: btnAfter, stored,
        checks: checks.map(([n, ok]) => `${ok ? 'PASS' : 'FAIL'}  ${n}`),
    };
    if (errors.length) result.errors = errors.slice(0, 4);
    result.translatorRowsAccepted = checks.every(([, ok]) => ok);
    return result;
    });   // end withSettingsGuard — original settings are restored in its finally

    console.log(JSON.stringify(outcome, null, 1));
    await browser.close();
    if (!outcome.translatorRowsAccepted) process.exit(1);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });