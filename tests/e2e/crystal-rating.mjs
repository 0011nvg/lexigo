// LEXI — «Кристальная экспедиция» в облаке (2026-11-02): рекорды и рейтинг на сервере, защита от подделки,
// повторной отправки и чужих данных, ники без личных данных, совместимость с уроками и заданиями учителя.
// Запуск против локального Supabase (см. tests/e2e/README.md): node tests/e2e/crystal-rating.mjs
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';
import { idle, answer, playLevel } from '../crystal-helpers.mjs';

const SITE = (process.env.LEXIGO_URL || 'http://127.0.0.1:4173/').replace(/index\.html$/, '');
const CLOUD = process.env.CLOUD_URL || 'http://127.0.0.1:54321';
const ANON = process.env.CLOUD_ANON; assert.ok(ANON, 'CLOUD_ANON is required');
const PSQL = process.env.PSQL || 'psql -h /tmp -p 54329 -U postgres -d lexigo_e2e -Atc';
const sql = q => execSync(PSQL + ' ' + JSON.stringify(q), { encoding: 'utf8' }).trim();
const run = Date.now().toString(36), PASS = 'Lexi-test-2026!';
const mail = who => `${who}-${run}@lexigo.test`;
const uid = who => sql(`select id from auth.users where email='${mail(who)}'`);
const browser = await chromium.launch({ headless: true });
const errors = [], passed = []; const ok = m => { passed.push(m); console.log('  ✓ ' + m); };

async function device(viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport, bypassCSP: true, reducedMotion: 'reduce' });
  await ctx.route('**/config.js', r => r.fulfill({ contentType: 'application/javascript', body: `window.LEXIGO_CLOUD=Object.freeze({url:${JSON.stringify(CLOUD)},anonKey:${JSON.stringify(ANON)}});` }));
  ctx.on('page', p => { p.on('pageerror', e => errors.push(p.url() + ' ' + e.message)); p.on('dialog', d => { errors.push('alert: ' + d.message()); d.dismiss(); }); });
  return ctx;
}
async function signUp(page, { role, name, who, join }) {
  await page.goto(SITE + 'auth.html' + (join ? '?join=' + join : '#signup'));
  await page.getByRole('tab', { name: 'Регистрация' }).click();
  if (role === 'teacher') await page.locator('.role-pick label', { hasText: 'Учитель' }).click();
  await page.fill('#suName', name); await page.fill('#suEmail', mail(who)); await page.fill('#suPassword', PASS);
  if (role === 'student') await page.check('#consentAge');
  await page.check('#consentPolicy');
  await page.getByRole('button', { name: 'Создать аккаунт' }).click();
  await page.waitForURL(/me\.html/); await page.locator('.cab-head h1').waitFor();
}
const rpc = (page, fn, args) => page.evaluate(async ([fn, args]) => { const sb = await LexigoCloud.client(); const r = await sb.rpc(fn, args); return { data: r.data, error: r.error && (r.error.message || r.error.code) }; }, [fn, args]);

try {
  /* 1. ученик проходит уровень 1 — результат на сервере, рейтинг, ответы на слова как обычная тренировка */
  const actx = await device(); const a = await actx.newPage();
  await signUp(a, { role: 'student', name: 'Аня Иванова', who: 'anya' });
  await a.goto(SITE + 'index.html#/lesson/5/3/play/crystals'); await a.locator('.cq-map').waitFor();
  await a.locator('.cq-rating .cq-name').waitFor();
  await a.locator('.cq-level[data-level="1"]').click(); await a.locator('#cqBoard .cq-gem').first().waitFor();
  await a.waitForFunction(() => LexiCrystalQuest.debug().run && LexiCrystalQuest.debug().run.id, null, { timeout: 10000 });
  await playLevel(a);
  await a.locator('.crystal-result.won').waitFor();
  await a.locator('.cq-res-rating', { hasText: 'Рейтинг экспедиции' }).waitFor({ timeout: 10000 });
  assert.match(await a.locator('.cq-res-rating').innerText(), /место \d+/);
  const A = uid('anya');
  const row = sql(`select won||'|'||stars||'|'||rating||'|'||(moves_used+moves_left-words_ok) from crystal_runs where user_id='${A}' and finished_at is not null`);
  const [won, stars, rating, base] = row.split('|');
  assert.equal(won, 'true'); assert.ok(Number(stars) >= 1 && Number(rating) > 1000); assert.equal(base, '20', 'moves identity checked by the server');
  await a.waitForTimeout(1500);
  assert.equal(sql(`select count(*) from sessions where user_id='${A}' and mode='crystals' and finished`), '1', 'word answers saved as a finished session');
  assert.ok(Number(sql(`select count(*) from word_progress where user_id='${A}' and left(word_id, 3) = 's5_'`)) >= 2, 'word progress in the account');
  ok('student: level 1 played through the UI → server run (won, ' + stars + '★, rating ' + rating + ', moves identity 20), place shown; word answers = finished session + word progress');

  /* 2. ник и рейтинг без личных данных */
  await a.locator('.crystal-result button', { hasText: 'Карта уровней' }).click();
  await a.locator('.cq-top li.mine').waitFor();
  assert.match(await a.locator('.cq-top li.mine').innerText(), /Исследователь [0-9A-F]{4}/, 'no real name in the rating');
  assert.ok(!/Аня|Иванова|@/.test(await a.locator('.cq-top li.mine').innerText()) && !/Иванова|@/.test(await a.locator('.cq-rating').innerText()), 'no name or e-mail');
  await a.fill('.cq-name input', '<script>'); await a.locator('.cq-name button').click();
  await a.locator('.cq-name small', { hasText: 'от 2 до 20 символов' }).waitFor();
  await a.fill('.cq-name input', 'Кристальная Аня'); await a.locator('.cq-name button').click();
  await a.locator('.cq-top li.mine', { hasText: 'Кристальная Аня' }).waitFor();
  assert.equal(await a.locator('.cq-level.locked').count(), 3, 'level 2 open from the server too');
  ok('rating shows «Исследователь XXXX» until a nickname is set; bad nickname refused; nickname «Кристальная Аня» shown; no name or e-mail');

  /* 3. второй ученик: открытые уровни и рекорды с сервера на новом устройстве, честный порядок */
  const bctx = await device({ width: 390, height: 844 }); const b = await bctx.newPage();
  await signUp(b, { role: 'student', name: 'Борис', who: 'boris' });
  await b.goto(SITE + 'index.html#/lesson/5/3/play/crystals'); await b.locator('.cq-top').waitFor();
  assert.match(await b.locator('.cq-top').innerText(), /Кристальная Аня/); assert.equal(await b.locator('.cq-top li.mine').count(), 0, 'not in the rating before playing');
  assert.equal(await b.locator('.cq-level.locked').count(), 4);
  const a2ctx = await device(); const a2 = await a2ctx.newPage();
  await a2.goto(SITE + 'auth.html'); await a2.fill('#loginEmail', mail('anya')); await a2.fill('#loginPassword', PASS); await a2.getByRole('button', { name: 'Войти' }).click(); await a2.waitForURL(/me\.html/);
  await a2.goto(SITE + 'index.html#/lesson/2/0/play/crystals'); await a2.locator('.cq-top li.mine').waitFor();
  assert.equal(await a2.locator('.cq-level.locked').count(), 3, 'another device: level 2 open from the account');
  assert.ok(await a2.locator('.cq-level[data-level="1"] .cq-stars .on').count() >= 1, 'stars from the account');
  ok('another student sees the rating; on a new device the account brings back stars and opened levels');

  /* 4. защита: заблокированный уровень, подделка очков, слишком быстро, чужая партия, повторная отправка, прямая запись */
  const B = uid('boris');
  assert.equal((await rpc(b, 'crystal_start', { p_level: 3, p_day: null })).data.ok, false, 'level 3 locked on the server');
  const s1 = (await rpc(b, 'crystal_start', { p_level: 1, p_day: null })).data; assert.ok(s1.ok);
  const fake = await rpc(b, 'crystal_finish', { p: { run_id: s1.run_id, won: true, score: 900000, moves_left: 19, moves_used: 4, words_ok: 3, words_tried: 3 } });
  assert.equal(fake.data.ok, false); assert.equal(fake.data.reason, 'implausible');
  const s2 = (await rpc(b, 'crystal_start', { p_level: 1, p_day: null })).data;
  assert.equal((await rpc(b, 'crystal_finish', { p: { run_id: s2.run_id, won: true, score: 6000, moves_left: 10, moves_used: 13, words_ok: 3, words_tried: 3 } })).data.reason, 'implausible', 'too fast for 13 moves');
  await b.waitForTimeout(7000);
  const s3 = (await rpc(b, 'crystal_start', { p_level: 1, p_day: null })).data; await b.waitForTimeout(7500);
  assert.equal((await rpc(b, 'crystal_finish', { p: { run_id: s3.run_id, won: true, score: 6000, moves_left: 12, moves_used: 10, words_ok: 3, words_tried: 3 } })).data.reason, 'implausible', 'moves do not add up (10 + 12 ≠ 20 + 3)');
  assert.equal((await rpc(b, 'crystal_finish', { p: { run_id: s1.run_id, won: true, score: 5000, moves_left: 11, moves_used: 12, words_ok: 3, words_tried: 3 } })).data.duplicate, true, 'a finished run cannot be sent again');
  const aRun = sql(`select id from crystal_runs where user_id='${A}' and finished_at is not null limit 1`);
  assert.equal((await rpc(b, 'crystal_finish', { p: { run_id: aRun, won: true, score: 5000, moves_left: 11, moves_used: 12, words_ok: 3, words_tried: 3 } })).data.reason, 'run', 'someone else\'s run');
  const ins = await b.evaluate(async () => { const sb = await LexigoCloud.client(); const r = await sb.from('crystal_runs').insert({ user_id: (await sb.auth.getUser()).data.user.id, level: 5, day: '2026-11-02', won: true, stars: 3, score: 99999, rating: 99999 }); return r.error ? 'refused' : 'inserted'; });
  assert.equal(ins, 'refused', 'no direct writes');
  const seen = await b.evaluate(async () => { const sb = await LexigoCloud.client(); const r = await sb.from('crystal_runs').select('user_id'); return [...new Set((r.data || []).map(x => x.user_id))]; });
  assert.ok(seen.every(x => x === B), 'a student sees only own runs');
  assert.equal(sql(`select coalesce(sum(rating),0) from crystal_runs where user_id='${B}'`), '0', 'no rating from fake results');
  const anon = await b.evaluate(async () => { const r = await fetch(window.LEXIGO_CLOUD.url + '/rest/v1/rpc/crystal_top', { method: 'POST', headers: { apikey: window.LEXIGO_CLOUD.anonKey, 'content-type': 'application/json' }, body: '{}' }); return r.status; });
  assert.ok(anon >= 400, 'guests cannot read the rating through the API');
  ok('server protection: locked level 3, fake score, too fast, moves that do not add up → «implausible», 0 rating; duplicate finish ignored; someone else\'s run refused; no direct inserts; own runs only; no anonymous access');

  /* 5. уроки учителя: «Кристаллы» в задании засчитываются; тренировка учителя не попадает в рейтинг */
  const tctx = await device(); const t = await tctx.newPage();
  await signUp(t, { role: 'teacher', name: 'Учитель Кристаллов', who: 'teacher' });
  await t.getByPlaceholder(/Например: 5/).fill('6 «В»'); await t.getByRole('button', { name: 'Создать класс' }).click();
  await t.locator('.group-card .code').waitFor(); const code = (await t.locator('.group-card .code').innerText()).trim();
  await t.getByRole('tab', { name: /Мои уроки/ }).click(); await t.getByRole('button', { name: '＋ Новый урок' }).first().click();
  await t.fill('#lsTitle', 'Кристальные слова'); await t.fill('#lsWords', 'apple — яблоко\npear — груша\nlemon — лимон\ncherry — вишня\nbanana — банан\nmango — манго'); await t.waitForTimeout(300);
  await t.locator('.mode-pick .btn-link', { hasText: 'Снять все' }).click(); await t.locator('.mode-opt[data-mode="crystals"]').click();
  await t.getByRole('button', { name: 'Сохранить урок' }).click(); await t.locator('.ml-card', { hasText: 'Кристальные слова' }).waitFor();
  await t.locator('.ml-card', { hasText: 'Кристальные слова' }).getByText('▶ Играть').click();
  await t.locator('#myLessonPage .mode[data-play="crystals"]').click();
  await t.locator('.cq-map').waitFor();
  assert.equal(await t.locator('.cq-level.locked').count(), 0, 'teacher preview: all levels open');
  assert.match(await t.locator('.cq-rating').innerText(), /не попадает/);
  await t.locator('.cq-level[data-level="1"]').click(); await t.locator('#cqBoard .cq-gem').first().waitFor();
  await playLevel(t); await t.locator('.crystal-result').waitFor();
  assert.match(await t.locator('.cq-res-rating').innerText(), /Тренировка учителя/);
  await t.waitForTimeout(1200);
  const T = uid('teacher');
  assert.equal(sql(`select count(*) from crystal_runs where user_id='${T}'`), '0'); assert.equal(sql(`select count(*) from sessions where user_id='${T}'`), '0');
  // назначение и прохождение учеником
  await t.goto(SITE + 'me.html'); await t.getByRole('tab', { name: /Мои уроки/ }).click();
  await t.locator('.ml-card', { hasText: 'Кристальные слова' }).getByRole('button', { name: /^Назначить/ }).click();
  await t.getByRole('button', { name: 'Назначить', exact: true }).click(); await t.locator('.group-card', { hasText: 'Кристальные слова' }).waitFor();
  const aid = sql(`select id from assignments where teacher_id='${T}' and title='Кристальные слова'`);
  await b.evaluate(async c => { const sb = await LexigoCloud.client(); await sb.rpc('join_group', { p_code: c }); }, code);
  await b.goto(SITE + 'index.html#/my/a-' + aid); await b.locator('#myLessonPage .mode[data-play="crystals"]').click();
  await b.locator('.cq-level[data-level="1"]').click(); await b.locator('#cqBoard .cq-gem').first().waitFor();
  const words = await b.evaluate(() => game.words.map(w => w.id));
  assert.ok(words.length === 6 && words.every(id => /^c_/.test(id)), 'the expedition uses the lesson words');
  await playLevel(b); await b.locator('.crystal-result').waitFor();
  await b.locator('#play .task-return button', { hasText: 'Вернуться к уроку' }).click();
  await b.locator('#myLessonPage .mode.is-done[data-play="crystals"]').waitFor();
  await b.waitForTimeout(1500);
  assert.equal(sql(`select count(*) from sessions where user_id='${B}' and assignment_id='${aid}' and mode='crystals' and finished`), '1');
  ok('teacher lesson: preview with all levels open, no runs or sessions for the teacher; student plays the assigned lesson\'s words → task «✓ пройдено», session with the assignment');

  /* 6. удаление аккаунта удаляет и результаты экспедиции */
  await b.evaluate(async () => { const sb = await LexigoCloud.client(); await sb.rpc('delete_my_account'); });
  assert.equal(sql(`select count(*) from crystal_runs where user_id='${B}'`), '0');
  ok('account deletion removes expedition runs and nickname');

  const real = errors.filter(e => !/net::ERR|status of 4\d\d|Failed to load resource/.test(e));
  assert.deepEqual(real, [], 'no JS errors');
  console.log(`PASS crystal rating: ${passed.length} scenarios`);
} catch (e) {
  console.error('FAIL', e.message, '\nerrors:', errors.slice(0, 8));
  try { for (const c of browser.contexts()) for (const p of c.pages()) await p.screenshot({ path: '/tmp/cq-fail-' + Math.random().toString(36).slice(2, 6) + '.png', fullPage: true }); } catch { /* */ }
  process.exitCode = 1;
} finally { await browser.close(); }
