// Phase 2 acceptance probe: the Global Presets row is self-owned.
//   - the window bridge window.__BADA_BUILD_PRESETS_PANEL__ no longer exists
//   - the v2 row renders its own three buttons and no legacy inline panel
//   - "Open Presets Manager" actually opens the overview modal
//   - the legacy "(구)" row still renders its old inline panel (no regression)
const { chromium } = require('playwright');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function openNav(page, navId) {
    await page.evaluate((id) => document.querySelector(`[data-nav-id="${id}"]`)?.click(), navId);
    await sleep(2500);
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1900, height: 1400 } });
    const errors = [];
    // Only Bada's own failures count. Other extensions on this instance emit 404s (e.g.
    // ComfyUI-Impact-Pack's impact-sam-editor.js) and ComfyUI logs "ComfyApp graph accessed
    // before initialization" on every cold boot; neither is caused by, or fixable from here.
    const isBada = (t) => /bada/i.test(t);
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && isBada(m.text())) errors.push('CONSOLE: ' + m.text().slice(0, 160)); });

    await page.goto('http://127.0.0.1:8188/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(7000);
    await page.evaluate(() => document.querySelector('.comfy-settings-btn')?.click());
    await sleep(4500);

    const bridgeGone = await page.evaluate(() => typeof window.__BADA_BUILD_PRESETS_PANEL__);

    await openNav(page, 'root/Bada Utils');
    const v2Row = await page.evaluate(() => {
        const host = document.querySelector('[data-setting-id="BadaUtils.GlobalPresetsPanel"]');
        return {
            rowPresent: !!host,
            hasOpen: !!host?.querySelector('#bada-v2-presets-open-btn'),
            hasExport: !!host?.querySelector('#bada-v2-presets-export-btn'),
            hasImport: !!host?.querySelector('#bada-v2-presets-import-btn'),
            hasLegacyPanel: !!host?.querySelector('#bada-inline-presets-panel'),
            listText: (host?.querySelector('#bada-v2-presets-list')?.textContent || '').trim().slice(0, 80),
        };
    });

    const modalOpened = await page.evaluate(async () => {
        document.querySelector('[data-setting-id="BadaUtils.GlobalPresetsPanel"] #bada-v2-presets-open-btn')?.click();
        await new Promise(r => setTimeout(r, 1200));
        const m = document.getElementById('bada-global-presets-overview-modal');
        return {
            appeared: !!m,
            visible: !!m && getComputedStyle(m).display !== 'none',
            hasContent: !!m && m.textContent.trim().length > 0,
        };
    });
    await page.evaluate(() => document.getElementById('bada-global-presets-overview-modal')?.click());
    await sleep(800);

    await openNav(page, 'root/Bada Utils (구)');
    const legacyRow = await page.evaluate(() => {
        const host = document.querySelector('[data-setting-id="BadaLegacy.GlobalPresetsPanel"]');
        return {
            rowPresent: !!host,
            stillHasInlinePanel: !!host?.querySelector('#bada-inline-presets-panel'),
            hasExportBtn: !!host?.querySelector('#bada-inline-export-btn'),
            hasImportBtn: !!host?.querySelector('#bada-inline-import-btn'),
        };
    });

    const result = { bridgeType: bridgeGone, v2Row, modalOpened, legacyRow };
    const checks = [
        ['the window bridge is gone', bridgeGone === 'undefined'],
        ['v2 presets row exists', v2Row.rowPresent],
        ['v2 row renders open/export/import', v2Row.hasOpen && v2Row.hasExport && v2Row.hasImport],
        ['v2 row does NOT reuse the legacy inline panel', !v2Row.hasLegacyPanel],
        ['"Open Presets Manager" opens the overview modal',
            modalOpened.appeared && modalOpened.visible && modalOpened.hasContent],
        ['legacy (구) row keeps its inline panel (no regression)',
            legacyRow.rowPresent && legacyRow.stillHasInlinePanel
            && legacyRow.hasExportBtn && legacyRow.hasImportBtn],
        ['no page errors during Phase 2 flows', errors.length === 0],
    ];
    result.checks = checks.map(([n, ok]) => `${ok ? 'PASS' : 'FAIL'}  ${n}`);
    if (errors.length) result.errors = errors.slice(0, 5);
    result.phase2Accepted = checks.every(([, ok]) => ok);

    console.log(JSON.stringify(result, null, 1));
    await browser.close();
    if (!result.phase2Accepted) process.exit(1);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });