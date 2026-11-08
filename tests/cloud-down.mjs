// LEXI (2026-11-03): the account server is unreachable (blocked, throttled, hanging) — games keep working in guest mode,
// sign-in shows a clear message instead of hanging forever.
import assert from 'node:assert/strict';
import { chromium } from './browser-runtime.mjs';
const SITE = (process.env.LEXIGO_URL || 'http://127.0.0.1:4173/').replace(/index\.html$/, '');
const browser = await chromium.launch({ headless: true });
const errors = [];
const ok = m => console.log('  ✓ ' + m);
try {
  for (const mode of ['hang', 'refused']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await ctx.route('**/config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.LEXIGO_CLOUD=Object.freeze({url:"https://lexigo-down.supabase.co",anonKey:"sb_publishable_down_test_key_0123456789"});' }));
    await ctx.route(/supabase\.co/, r => mode === 'hang' ? undefined /* never answers */ : r.abort('connectionrefused'));
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.dismiss());
    /* a signed-in hint makes the site talk to the server at start-up */
    await page.goto(SITE + 'index.html#/home');
    await page.goto(SITE + 'index.html#/lesson/5/0'); await page.locator('#launcher').waitFor();
    await page.locator('.mode[data-mode=quiz]').click();
    const st = await page.evaluate(() => ({ ru: game.words[game.index].ru, idx: game.index }));
    await page.locator('#play .options button').filter({ hasText: new RegExp('^\\s*' + st.ru.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$') }).first().click();
    await page.waitForFunction(i => game.index !== i, st.idx);
    ok(mode + ': a game starts and answers count while the account server does not answer');
    await page.goto(SITE + 'auth.html');
    await page.fill('#loginEmail', 'pupil@example.com'); await page.fill('#loginPassword', 'Lexi-test-2026!');
    const t0 = Date.now();
    await page.getByRole('button', { name: 'Войти' }).click();
    const msg = page.locator('text=/Сервер аккаунтов сейчас не отвечает|Нет связи с сервером аккаунтов/').first();
    await msg.waitFor({ timeout: 25000 });
    assert.ok(Date.now() - t0 < 20000, 'the message comes within 20 s');
    assert.match(await msg.innerText(), /игры работают и без входа/i);
    ok(mode + ': sign-in shows «' + (await msg.innerText()).slice(0, 60) + '…» after ' + Math.round((Date.now() - t0) / 1000) + ' s, not an endless spinner');
    await ctx.close();
  }
  assert.deepEqual(errors, []);
  console.log('LEXI with the account server down: OK');
} finally { await browser.close(); }
