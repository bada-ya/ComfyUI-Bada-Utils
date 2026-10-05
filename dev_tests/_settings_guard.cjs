/**
 * Settings guard for browser probes.
 *
 * WHY THIS EXISTS. The Playwright probes drive the REAL running ComfyUI and click the REAL
 * Save button, which persists to `user/default/comfy.settings.json`. An earlier probe typed
 * "AlphaNode" into both translator fields, pressed Save, and that value survived every
 * restart and kept overriding the shipped default — the user saw AlphaNode in their own
 * profile and asked why.
 *
 * So any probe that mutates a setting MUST wrap its body in `withSettingsGuard`. The helper
 * snapshots the real values before the run and writes them back in a `finally`, and also
 * dumps the snapshot to disk so a hard crash (browser kill, power loss) is still
 * recoverable by hand.
 *
 * Read-only probes do not need it.
 *
 * NOTE the restore is best-effort: it goes through the same store the UI uses, so it can only
 * run while ComfyUI is up. If a probe was killed mid-run, use the .json dump to see which
 * values were live and restore them from the UI.
 */
const fs = require('fs');
const path = require('path');

const BACKUP_FILE = path.join(__dirname, '.settings_backup.json');

async function readSettings(page, ids) {
    return page.evaluate((keys) => {
        const out = {};
        for (const k of keys) {
            try { out[k] = window.app?.ui?.settings?.getSettingValue?.(k); }
            catch (_) { out[k] = null; }
        }
        return out;
    }, ids);
}

async function writeSettings(page, values) {
    await page.evaluate((vals) => {
        for (const [k, v] of Object.entries(vals)) {
            try { window.app?.ui?.settings?.setSettingValue?.(k, v); }
            catch (_) { /* ignore */ }
        }
    }, values);
}

/**
 * @param {import('playwright').Page} page
 * @param {string[]} ids              Setting ids the body intends to mutate.
 * @param {() => Promise<any>} body    The probe.
 * @returns {Promise<any>} whatever body returned.
 */
async function withSettingsGuard(page, ids, body) {
    const before = await readSettings(page, ids);
    try {
        fs.writeFileSync(BACKUP_FILE, JSON.stringify(before, null, 2));
    } catch (_) { /* non-fatal */ }
    console.log(`[guard] snapshotted ${ids.length} setting(s) -> ${BACKUP_FILE}`);
    try {
        return await body();
    } finally {
        await writeSettings(page, before);
        console.log('[guard] restored original values:', JSON.stringify(before));
    }
}

module.exports = { withSettingsGuard, readSettings, writeSettings, BACKUP_FILE };