// LEXI (2026-11-03): rounds in blocks continue on another device — local Supabase stack (see tests/e2e/README.md).
// Device A plays round 1 of «Весь учебник» → word_rounds keeps the 15 words; device B (same account) sees «15 из …»
// and gets words 16–30; the server keeps only own rows; an old device cannot roll back a new cycle.
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';
const SITE = (process.env.LEXIGO_URL || 'http://127.0.0.1:4173/').replace(/index\.html$/, '');
const CLOUD = process.env.CLOUD_URL || 'http://127.0.0.1:54321';
const ANON = process.env.CLOUD_ANON;
const PSQL = process.env.PSQL || 'psql -h /tmp -p 54329 -U postgres -d lexigo_e2e -Atc';
assert.ok(ANON, 'CLOUD_ANON is required');
const sql = q => execSync(PSQL + ' ' + JSON.stringify(q), { encoding: 'utf8' }).trim();
const email = `rounds-${Date.now().toString(36)}@lexigo.test`, PASS = 'Lexi-test-2026!';
const browser = await chromium.launch({ headless: true });
const errors = [];
const ok = m => console.log('  ✓ ' + m);
async function device() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, bypassCSP: true, reducedMotion: 'reduce' });
  await ctx.route('**/config.js', r => r.fulfill({ contentType: 'application/javascript', body: `window.LEXIGO_CLOUD=Object.freeze({url:${JSON.stringify(CLOUD)},anonKey:${JSON.stringify(ANON)}});` }));
  ctx.on('page', p => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push(m.text()); }); });
  return ctx;
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
try {
  const A = await (await device()).newPage();
  await A.goto(SITE + 'auth.html#signup');
  await A.getByRole('tab', { name: 'Регистрация' }).click();
  await A.fill('#suName', 'Раунды'); await A.fill('#suEmail', email); await A.fill('#suPassword', PASS);
  await A.check('#consentAge'); await A.check('#consentPolicy');
  await A.getByRole('button', { name: 'Создать аккаунт' }).click();
  await A.waitForURL(/me\.html/);
  await A.goto(SITE + 'index.html#/course/5/0');
  await A.evaluate(() => LexigoCloudSession.ready);
  await A.locator('#wholeBookOpen').click(); await A.locator('.wb-mode[data-wb-mode=quiz]').click();
  const r1 = await A.evaluate(() => game.words.map(w => w.id));
  for (let i = 0; i < 15; i++) {
    const st = await A.evaluate(() => ({ ru: game.words[game.index].ru, idx: game.index }));
    await A.locator('#play .options button').filter({ hasText: new RegExp('^\\s*' + esc(st.ru) + '\\s*$') }).first().click();
    await A.waitForFunction(i => game.index !== i || document.querySelector('#play .lesson-result'), st.idx);
  }
  await A.locator('#play .lesson-result').waitFor();
  let row = '';
  for (let i = 0; i < 40 && !row; i++) { row = sql(`select cardinality(seen) from word_rounds r join auth.users u on u.id=r.user_id where u.email='${email}' and scope='B5|quiz'`); if (!row || row === '0') { row = ''; await A.waitForTimeout(250); } }
  assert.equal(row, '15', 'the server keeps 15 words of round 1');
  assert.deepEqual(sql(`select array_to_string(seen, ',') from word_rounds r join auth.users u on u.id=r.user_id where u.email='${email}' and scope='B5|quiz'`).split(',').sort(), [...r1].sort());
  ok('device A: round 1 of the whole book saved to the cloud (word_rounds, 15 words)');

  const B = await (await device()).newPage();
  await B.goto(SITE + 'auth.html');
  await B.fill('#loginEmail', email); await B.fill('#loginPassword', PASS);
  await B.getByRole('button', { name: 'Войти' }).click(); await B.waitForURL(/me\.html/);
  await B.goto(SITE + 'index.html#/course/5/0');
  await B.evaluate(() => LexigoCloudSession.ready); await B.waitForTimeout(500);
  await B.locator('#wholeBookOpen').click();
  assert.match(await B.locator('.wb-mode[data-wb-mode=quiz] small').innerText(), /^15 из \d+ слов\nраунд 2 из/);
  await B.locator('.wb-mode[data-wb-mode=quiz]').click();
  const r2 = await B.evaluate(() => game.words.map(w => w.id));
  assert.ok(r2.every(id => !r1.includes(id)), 'device B continues with new words');
  const total = await B.evaluate(() => game.round.poolIds.length);
  assert.equal(await B.locator('#counter').getAttribute('data-round'), `15 из ${total} слов · Раунд 2 из ${Math.ceil(total / 15)}`);
  ok('device B (same account): «15 из … · раунд 2», the next round brings words 16–30');

  /* a stale device of the old cycle cannot roll the progress back (server keeps the newer cycle) */
  await B.evaluate(() => { LexiRounds.reset('B5|quiz'); return LexiRounds.flush(); });
  await B.waitForTimeout(800);
  assert.equal(sql(`select cycle||':'||cardinality(seen) from word_rounds r join auth.users u on u.id=r.user_id where u.email='${email}' and scope='B5|quiz'`), '1:0');
  await A.evaluate(() => LexiRounds.mark('B5|quiz', 's5_400')); await A.waitForTimeout(2000);
  assert.equal(sql(`select cycle||':'||cardinality(seen) from word_rounds r join auth.users u on u.id=r.user_id where u.email='${email}' and scope='B5|quiz'`), '1:0', 'old cycle from device A is ignored');
  ok('a new cycle on one device is not undone by an older device');
  assert.deepEqual(errors, []);
  console.log('LEXI rounds in the cloud: OK');
} finally { await browser.close(); }
