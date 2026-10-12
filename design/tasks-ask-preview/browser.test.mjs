import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, extname } from 'node:path';

// Opt in using an already installed Playwright. No dependency installation.
test('browser walkthrough: drafts, focus, lifecycle, history, keyboard, themes and widths', { skip: !process.env.PLAYWRIGHT_MODULE }, async () => {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
  const root = fileURLToPath(new URL('.', import.meta.url));
  const server = createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!/^\/(index\.html|style\.css|app\.mjs|model\.mjs)$/.test(path)) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript' }[extname(path)]);
    response.end(await readFile(join(root, path)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
    const errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:')) external.push(request.url()); });
    const url = `http://127.0.0.1:${server.address().port}/index.html`;
    await page.goto(url);
    const shots = process.env.PREVIEW_SCREENSHOTS || '/tmp/pi-tasks-ask-preview-checks';
    await mkdir(shots, { recursive: true });
    await page.screenshot({ path: join(shots, 'wide-dark.png'), fullPage: true });
    assert.equal(await page.locator('#view .list-row').count(), 4);
    await page.locator('#tab-requests').click();
    assert.equal(await page.locator('#view').innerText().then(t => t.includes('r1')), false);
    await page.locator('[data-kind=request][data-id=r1]').click();
    assert.equal(await page.locator('#detail-dialog').evaluate(e => e.open), true);
    assert.match(await page.locator('#detail-dialog').innerText(), /REFERENCE r1/);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement?.dataset.id === 'r1');
    await page.locator('#tab-questions').click();
    await page.locator('[data-kind=question][data-id=q1]').click();
    assert.equal(await page.locator('#submit-answer').isDisabled(), true);
    await page.locator('input[value=local]').check();
    await page.locator('#answer-note').fill('Keep it private. <script>not executable</script>');
    await page.screenshot({ path: join(shots, 'question-overlay.png'), fullPage: true });
    await page.locator('#ask-back').click();
    await page.waitForFunction(() => document.activeElement?.dataset.id === 'q1');
    await page.locator('[data-id=q1]').click();
    assert.equal(await page.locator('input[value=local]').isChecked(), true);
    assert.equal(await page.locator('#answer-note').inputValue(), 'Keep it private. <script>not executable</script>');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#ask-dialog').open);
    await page.locator('[data-id=q1]').click();
    await page.locator('#submit-answer').click();
    await page.waitForFunction(() => !document.querySelector('#ask-dialog').open);
    assert.match(await page.locator('[data-id=q1]').innerText(), /Answer submitted/);
    await page.locator('#tab-work').click();
    assert.equal(await page.locator('[data-id=t4]').getAttribute('data-status'), 'blocked');
    await page.locator('[data-id=t4]').click();
    await page.locator('#detail-question').click();
    assert.equal(await page.locator('#ask-dialog').evaluate(e => e.open), true);
    await page.locator('#advance-answer').click();
    assert.match(await page.locator('#ask-dialog').innerText(), /DELIVERED TO AGENT/);
    assert.match(await page.locator('#ask-dialog').innerText(), /Receiving it does not mean it has been applied/);
    await page.locator('#advance-answer').click();
    assert.match(await page.locator('#ask-dialog').innerText(), /Publishing is excluded/);
    await page.locator('#ask-back').click();
    assert.match(await page.locator('#plan-summary').innerText(), /2 of 4/);
    assert.equal(await page.locator('#events .event').count(), 6);
    assert.match(await page.locator('#events .event').nth(1).innerText(), /Release decision requested/);
    assert.equal(await page.locator('#events script').count(), 0);
    await page.locator('#events .event').nth(3).locator('summary').click();
    assert.match(await page.locator('#events .event').nth(3).innerText(), /<script>not executable<\/script>/);
    await page.screenshot({ path: join(shots, 'answer-applied.png'), fullPage: true });
    // Reset, test a custom instruction: application does not approve release.
    await page.locator('#reset').click();
    await page.locator('#tab-questions').click();
    await page.locator('[data-id=q1]').click();
    await page.locator('input[value=custom]').check();
    assert.equal(await page.locator('#submit-answer').isDisabled(), true);
    await page.locator('#custom-answer').fill('Reconsider the scope');
    await page.locator('#submit-answer').click();
    await page.locator('[data-id=q1]').click();
    await page.locator('#advance-answer').click(); await page.locator('#advance-answer').click();
    assert.match(await page.locator('#ask-dialog').innerText(), /no approval is inferred/);
    await page.locator('#ask-back').click();
    await page.locator('#tab-work').click();
    assert.equal(await page.locator('[data-id=t4]').getAttribute('data-status'), 'blocked');
    // Explicit sample withdrawal does not unblock work.
    await page.locator('#reset').click(); await page.locator('#tab-questions').click();
    await page.locator('[data-id=q1]').click(); await page.locator('#withdraw-question').click();
    await page.locator('#tab-work').click();
    assert.equal(await page.locator('[data-id=t4]').getAttribute('data-status'), 'blocked');
    // Keyboard tab semantics, row movement, and panel close/return.
    await page.locator('#reset').click(); await page.locator('#tab-work').focus();
    await page.keyboard.press('ArrowRight'); assert.equal(await page.locator('#tab-requests').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.id), 'q1');
    await page.keyboard.press('ArrowDown'); assert.equal(await page.evaluate(() => document.activeElement.dataset.id), 'q2');
    await page.keyboard.press('Enter'); assert.match(await page.locator('#ask-title').innerText(), /handoff/);
    await page.keyboard.press('Escape');
    await page.locator('#close-workspace').click(); assert.equal(await page.locator('#workspace').isVisible(), false);
    await page.locator('#reopen-workspace').click(); assert.equal(await page.locator('#tab-questions').getAttribute('aria-selected'), 'true');
    // Width/theme variants and dialog resize. These are browser checks, not terminal tests.
    for (const theme of ['dark', 'light']) {
      if (theme === 'light') await page.locator('#theme-toggle').click();
      for (const width of [1440, 980, 390]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${theme} ${width}: horizontal overflow`);
        await page.locator('[data-id=q1]').click();
        const rect = await page.locator('#ask-dialog').boundingBox();
        assert.ok(rect.x >= 0 && rect.x + rect.width <= width + 1 && rect.y >= 0 && rect.y + rect.height <= 901, `${theme} ${width}: dialog out of bounds`);
        if (width === 390) await page.screenshot({ path: join(shots, `narrow-${theme}.png`), fullPage: true });
        await page.keyboard.press('Escape');
      }
    }
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.locator('#width-toggle').click();
    assert.equal(await page.locator('body').evaluate(e => e.classList.contains('narrow')), true);
    await page.screenshot({ path: join(shots, 'compact-light.png'), fullPage: true });
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    console.log(`Browser checks passed. Screenshots: ${shots}`);
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
});
