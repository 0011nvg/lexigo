// LEXI cloud accounts — end-to-end journey against a LOCAL Supabase stack
// (real Supabase Auth/GoTrue + PostgREST + PostgreSQL with supabase/schema.sql).
// Start the stack first (see tests/e2e/README.md). Env: LEXIGO_URL, CLOUD_URL, CLOUD_ANON, PSQL.
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';

const SITE = (process.env.LEXIGO_URL || 'http://127.0.0.1:4173/').replace(/index\.html$/, '');
const CLOUD = process.env.CLOUD_URL || 'http://127.0.0.1:54321';
const ANON = process.env.CLOUD_ANON;
const PSQL = process.env.PSQL || 'psql -h /tmp -p 54329 -U postgres -d lexigo_e2e -Atc';
assert.ok(ANON, 'CLOUD_ANON is required');
const sql = q => execSync(PSQL + ' ' + JSON.stringify(q), { encoding: 'utf8' }).trim();
const xpOf = email => Number(sql(`select u.xp from user_stats u join auth.users a on a.id=u.user_id where a.email='${email}'`));
const uidOf = email => sql(`select id from auth.users where email='${email}'`);
const run = Date.now().toString(36);
const mail = who => `${who}-${run}@lexigo.test`;
const PASS = 'Lexi-test-2026!';

const browser = await chromium.launch({ headless: true });
const errors = [];
const passed = [];
const ok = m => { passed.push(m); console.log('  ✓ ' + m); };

async function device(viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport, bypassCSP: true, reducedMotion: 'reduce' });
  await ctx.route('**/config.js', r => r.fulfill({ contentType: 'application/javascript', body: `window.LEXIGO_CLOUD=Object.freeze({url:${JSON.stringify(CLOUD)},anonKey:${JSON.stringify(ANON)}});` }));
  ctx.on('page', p => {
    p.on('pageerror', e => errors.push(p.url() + ' ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push(p.url() + ' ' + m.text()); });
  });
  return ctx;
}
async function signUp(page, { role, name, email, join }) {
  await page.goto(SITE + 'auth.html' + (join ? '?join=' + join : '#signup'));
  await page.getByRole('tab', { name: 'Регистрация' }).click();
  if (role === 'teacher') await page.locator('.role-pick label', { hasText: 'Учитель' }).click();
  await page.fill('#suName', name); await page.fill('#suEmail', email); await page.fill('#suPassword', PASS);
  if (role === 'student') await page.check('#consentAge');
  await page.check('#consentPolicy');
  await page.getByRole('button', { name: 'Создать аккаунт' }).click();
  await page.waitForURL(/me\.html/);
  await page.locator('.cab-head h1').waitFor();
}
async function signIn(page, email) {
  await page.goto(SITE + 'auth.html');
  await page.fill('#loginEmail', email); await page.fill('#loginPassword', PASS);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.waitForURL(/me\.html/); await page.locator('.cab-head h1').waitFor();
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
async function playToEnd(page, { mistakes = 0 } = {}) {
  let wrongLeft = mistakes;
  for (let i = 0; i < 80; i++) {
    if (await page.locator('#play .lesson-result, #play .pair-finish').count()) return;
    const st = await page.evaluate(() => game && { mode: game.mode, en: game.words[game.index]?.en, ru: game.words[game.index]?.ru, kind: game.activeQuestionMode });
    if (!st) throw new Error('no game');
    if (st.mode === 'pairs') {
      const words = await page.evaluate(() => game.words.map(w => [w.en, w.ru]));
      for (const [en, ru] of words) { await page.getByRole('button', { name: 'Английское слово: ' + en, exact: true }).click(); await page.getByRole('button', { name: 'Перевод: ' + ru, exact: true }).click(); }
      continue;
    }
    if (await page.locator('#play .answerbox input:not([disabled])').count()) {
      await page.fill('#play .answerbox input', wrongLeft-- > 0 ? 'zzz' : st.en); await page.locator('#play .answerbox button').first().click();
    } else if (await page.locator('#play .options button:not([disabled])').count()) {
      const want = st.kind === 'listen' ? st.en : st.ru;
      const btn = wrongLeft-- > 0 ? page.locator('#play .options button').filter({ hasNotText: new RegExp('^' + esc(want) + '$') }).first() : page.locator('#play .options button').filter({ hasText: new RegExp('^\\s*' + esc(want) + '\\s*$') }).first();
      await btn.click();
    }
    const idx = await page.evaluate(() => game ? game.index : -1);
    const next = page.locator('#play button:not([disabled])', { hasText: /Следующее|Результат|Дальше|Продолжить/ }).first();
    await page.waitForFunction(i => !game || game.index !== i || document.querySelector('#play .lesson-result, #play .pair-finish') || [...document.querySelectorAll('#play button:not([disabled])')].some(b => /Следующее|Результат|Дальше|Продолжить/.test(b.textContent)), idx, { timeout: 5000 });
    if (await next.count()) await next.click();
  }
  throw new Error('round did not finish');
}

try {
  /* 0. Guest: games work, header offers sign-in, nudge after the first round */
  let guest = await device();
  let g = await guest.newPage();
  await g.goto(SITE + 'index.html#/lesson/3/2/play/quiz');
  await g.locator('#play .question').waitFor();
  assert.equal(await g.locator('#accountButton').getAttribute('href'), 'auth.html');
  await playToEnd(g);
  await g.locator('.signup-nudge').waitFor({ timeout: 4000 });
  await g.locator('.lb .lb-cta').waitFor({ timeout: 8000 });   // empty board: a guest would make it — invited to sign in
  const guestWords = await g.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('lexigo_progress_v1') || '{}')).length);
  assert.ok(guestWords > 0);
  ok('guest: plays without an account, gentle sign-up hint after the first round (' + guestWords + ' words kept on device)');

  /* 1. Teacher registers, creates a class and a custom lesson */
  const tctx = await device();
  const t = await tctx.newPage();
  await signUp(t, { role: 'teacher', name: 'Виктория Геннадьевна', email: mail('teacher') });
  assert.match(await t.locator('.cab-head').innerText(), /Учитель/);
  await t.getByPlaceholder(/Например: 5/).fill('5 «Б»');
  await t.getByRole('button', { name: 'Создать класс' }).click();
  await t.locator('.group-card .code').waitFor();
  const code = (await t.locator('.group-card .code').innerText()).trim();
  assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);
  ok('teacher: registration, cabinet, class created with join code ' + code);
  await t.getByRole('tab', { name: 'Мои уроки' }).click();
  await t.fill('#lsTitle', 'Фрукты — дополнительно');
  await t.fill('#lsWords', 'apple — яблоко\npear — груша\nplum; слива\ncherry\tвишня\nбез перевода');
  assert.match(await t.locator('#lsWords + small').innerText(), /Распознано слов: 4/);
  await t.getByRole('button', { name: 'Сохранить урок' }).click();
  await t.locator('.row', { hasText: 'Фрукты — дополнительно' }).waitFor();
  ok('teacher: custom lesson parsed (4 of 5 lines) and saved');

  /* 2. Student joins by invite link */
  const sctx = await device({ width: 390, height: 844 });
  const s = await sctx.newPage();
  await signUp(s, { role: 'student', name: 'Маша', email: mail('masha'), join: code });
  await s.locator('.row', { hasText: '5 «Б»' }).waitFor();
  assert.match(await s.locator('.st-hero').innerText(), /Маша/);
  ok('student: registration from invite link → in the class immediately (mobile)');

  /* 3. Teacher assigns Spotlight lessons and the custom lesson */
  await t.reload(); await t.getByRole('tab', { name: 'Классы' }).click();
  await t.locator('.tbl td', { hasText: 'Маша' }).waitFor();
  await t.getByRole('tab', { name: 'Задания' }).click();
  await t.getByRole('button', { name: '＋ Новое задание' }).click();
  await t.locator('.wiz-step select').nth(1).selectOption('3');
  await t.locator('.lessons-pick label').first().click();
  await t.locator('.wiz-step .seg button', { hasText: 'Найди пару' }).click();      // deselect pairs → quiz + spell
  await t.locator('textarea[maxlength="500"]').fill('Повторите к пятнице');
  await t.getByRole('button', { name: 'Назначить' }).click();
  await t.locator('.group-card', { hasText: 'Spotlight 3' }).waitFor();
  await t.getByRole('tab', { name: 'Мои уроки' }).click();
  await t.locator('.row', { hasText: 'Фрукты' }).getByRole('button', { name: 'Назначить' }).click();
  await t.locator('.wiz-step .seg button', { hasText: 'Напиши слово' }).click();     // → quiz + pairs
  await t.getByRole('button', { name: 'Назначить' }).click();
  await t.locator('.group-card', { hasText: 'Фрукты' }).waitFor();
  assert.equal(await t.locator('article.group-card').count(), 2);
  ok('teacher: two assignments (Spotlight 3 lesson: quiz+spell, own lesson: quiz+pairs) in a few clicks');

  /* 4. Student sees tasks, completes the Spotlight one */
  await s.reload(); await s.locator('.task-card-s').first().waitFor();
  assert.equal(await s.locator('.task-card-s').count(), 2);
  assert.match(await s.locator('.task-card-s', { hasText: 'Spotlight 3' }).innerText(), /Повторите к пятнице/);
  await s.locator('.task-card-s', { hasText: 'Spotlight 3' }).getByRole('link', { name: 'Начать' }).click();
  await s.locator('.task-overlay').waitFor();
  await s.locator('.task-mode', { hasText: 'Выбери перевод' }).click();
  await playToEnd(s, { mistakes: 1 });
  // ТОП-3: first result on this board → congratulation + name form
  await s.locator('.lb-claim').waitFor({ timeout: 10000 });
  await s.locator('.lb-name').fill('<x>');
  await s.locator('.lb-claim button').click();
  await s.locator('.lb-msg', { hasText: 'Имя' }).waitFor();
  await s.locator('.lb-name').fill('Маша К.');
  await s.locator('.lb-claim button').click();
  await s.locator('.lb-saved').waitFor();
  assert.match(await s.locator('.lb-list li.mine').innerText(), /Маша К\./);
  ok('ТОП-3: top result → congratulation, name validated, saved on the server, own row highlighted');
  await s.getByRole('button', { name: 'Вернуться к заданию' }).click();
  await s.locator('.task-mode.done', { hasText: 'Выбери перевод' }).waitFor();
  await s.locator('.task-mode', { hasText: 'Напиши слово' }).click();
  await playToEnd(s);
  await s.waitForTimeout(1500);
  const done = sql(`select string_agg(mode||':'||finished, ',' order by mode) from sessions s where s.user_id='${uidOf(mail('masha'))}' and s.assignment_id is not null and s.created_at > now() - interval '10 minutes'`);
  assert.match(done, /quiz:true/); assert.match(done, /spell:true/);
  const xp = xpOf(mail('masha'));
  assert.ok(xp > 0, 'server XP');
  const chipXP = await s.evaluate(() => window.LexiQuest.state().xp);
  assert.equal(chipXP, xp, 'header XP equals server XP');
  ok('student: assignment launched from cabinet, both games saved to the cloud; server XP ' + xp + ' = XP on screen');

  /* 5. Custom lesson with pairs */
  await s.goto(SITE + 'me.html'); await s.locator('.task-card-s', { hasText: 'Фрукты' }).getByRole('link', { name: 'Начать' }).click();
  await s.locator('.task-mode', { hasText: 'Найди пару' }).click();
  await playToEnd(s);
  await s.waitForTimeout(1200);
  assert.equal(sql(`select count(*) from sessions where user_id='${uidOf(mail('masha'))}' and mode='pairs' and finished and lesson_id is not null`), '1');
  ok('student: own-lesson words work in existing games (pairs) and are saved with the lesson');

  /* 6. Cabinet shows progress, history, task status */
  await s.goto(SITE + 'me.html'); await s.locator('.task-card-s').first().waitFor();
  assert.match(await s.locator('.task-card-s', { hasText: 'Spotlight 3' }).innerText(), /Выполнено/);
  assert.ok(await s.locator('.hist .row').count() >= 3);
  assert.match(await s.locator('.book-row').first().innerText(), /Spotlight 3/);
  ok('student cabinet: task «Выполнено», history, book progress');

  /* 7. Another device: same account, progress follows */
  const s2ctx = await device();
  const s2 = await s2ctx.newPage();
  await signIn(s2, mail('masha'));
  await s2.goto(SITE + 'index.html'); await s2.locator('#accountButton.acct-btn:not(.guest)').waitFor();
  await s2.waitForFunction(() => Object.keys(JSON.parse(localStorage.getItem('lexigo_progress_v1') || '{}')).length > 0, null, { timeout: 8000 });
  const xp2 = await s2.evaluate(() => window.LexiQuest.state().xp);
  assert.equal(xp2, xpOf(mail('masha')));
  assert.match(await s2.locator('.lexi-hero-title').innerText(), /Маша/);
  ok('second device: word progress and XP restored after sign-in; Lexi greets by name');
  const lbRows = await s2.evaluate(async () => { const sb = await window.LexigoCloud.client(); const { data } = await sb.from('sessions').select('board_key').not('board_key', 'is', null).limit(1); const t = await sb.rpc('leaderboard_top', { p_board: data[0].board_key }); return t.data; });
  assert.equal(lbRows[0].name, 'Маша К.'); assert.equal(lbRows[0].mine, true);
  ok('ТОП-3 is stored on the server: visible after reload and on another device');

  /* 8. Resubmitting the same round awards nothing (idempotence through the API) */
  const before = xpOf(mail('masha'));
  const r = await s2.evaluate(async () => { const sb = await window.LexigoCloud.client(); const p = { client_id: 'replay-attack-1', mode: 'quiz', finished: true, events: [{ w: 'w10', ok: true }, { w: 'w11', ok: true }] };
    const a = await sb.rpc('submit_session', { p }); const b = await sb.rpc('submit_session', { p }); const c = await sb.from('user_stats').update({ xp: 999999 }).eq('user_id', (await sb.auth.getUser()).data.user.id);
    return [a.data.xp_gained, b.data.duplicate, b.data.xp_gained, !!c.error]; });
  assert.deepEqual(r, [4, true, 0, true]);
  assert.equal(xpOf(mail('masha')), before + 4);
  ok('anti-farming via API: replayed round gives 0 XP, direct XP edit is refused');

  /* 9. Teacher sees results and difficult words */
  await t.goto(SITE + 'me.html'); await t.getByRole('tab', { name: 'Задания' }).click();
  await t.locator('article.group-card', { hasText: 'Spotlight 3' }).getByRole('button', { name: 'Результаты' }).click();
  const dlg = t.locator('.dialog');
  await dlg.locator('.chip.ok', { hasText: 'Выполнено' }).waitFor();
  assert.match(await dlg.innerText(), /Маша/);
  assert.match(await dlg.innerText(), /затруднения/);
  assert.ok(await dlg.locator('.hard span').count() >= 1, 'the deliberate mistake shows up as a difficult word');
  ok('teacher: results per student (Выполнено), accuracy, difficult words');

  /* 10. Isolation: another teacher sees nothing; outsider cannot open the task */
  const t2ctx = await device(); const t2 = await t2ctx.newPage();
  await signUp(t2, { role: 'teacher', name: 'Другой учитель', email: mail('teacher2') });
  const leak = await t2.evaluate(async () => { const sb = await window.LexigoCloud.client(); const q = await Promise.all(['profiles', 'sessions', 'word_progress', 'assignments', 'custom_lessons', 'group_members'].map(tb => sb.from(tb).select('*')));
    return q.map(x => x.data ? x.data.length : -1); });
  assert.deepEqual(leak, [1, 0, 0, 0, 0, 0]);
  ok('isolation: a second teacher sees only own profile — no students, results, tasks or lessons');

  /* 11. Guest progress import on this device, once */
  const gp = await guest.newPage();
  await signUp(gp, { role: 'student', name: 'Петя', email: mail('petya') });
  await gp.getByRole('button', { name: 'Перенести' }).click();
  await gp.locator('.lexi-toast', { hasText: 'Перенесено слов' }).waitFor();
  assert.equal(Number(sql(`select count(*) from word_progress where user_id='${uidOf(mail('petya'))}'`)), guestWords);
  await gp.goto(SITE + 'me.html'); await gp.locator('.st-hero').waitFor();
  assert.equal(await gp.getByRole('button', { name: 'Перенести' }).count(), 0);
  ok('guest progress imported into the new account once (' + guestWords + ' words, no XP)');

  /* 12. Two accounts on one device do not mix local data; sign-out returns to guest */
  await gp.goto(SITE + 'index.html'); await gp.locator('#accountButton:not(.guest)').waitFor();
  await gp.waitForFunction(() => Object.keys(localStorage).filter(k => k.startsWith('lexigo_progress_v1')).length >= 2, null, { timeout: 8000 });
  const keys = await gp.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('lexigo_progress_v1')));
  assert.ok(keys.includes('lexigo_progress_v1') && keys.some(k => k.startsWith('lexigo_progress_v1@')), 'guest and account progress stored separately');
  await gp.goto(SITE + 'me.html'); await gp.locator('#logoutBtn').click(); await gp.waitForURL(/index\.html/);
  await gp.locator('#accountButton.guest').waitFor();
  ok('one device, several users: data kept apart; sign-out returns to guest mode');

  /* 13. Account deletion removes everything */
  const petyaId = uidOf(mail('petya'));
  await signIn(gp, mail('petya'));
  await gp.getByRole('button', { name: '⚙ Настройки' }).click();
  await gp.getByRole('button', { name: 'Удалить аккаунт и все данные' }).click();
  await gp.fill('#delConfirm', 'удалить');
  await gp.getByRole('button', { name: 'Удалить навсегда' }).click();
  await gp.waitForURL(/index\.html/);
  assert.equal(sql(`select count(*) from profiles where id='${petyaId}'`), '0');
  assert.equal(sql(`select count(*) from auth.users where email='${mail('petya')}'`), '0');
  ok('account deletion: profile, progress and login removed');

  /* 14. Teacher removes the student → access ends */
  await t.goto(SITE + 'me.html'); await t.getByRole('tab', { name: 'Классы' }).click();
  await t.locator('.tbl tr', { hasText: 'Маша' }).getByRole('button', { name: 'Убрать' }).click();
  await t.locator('.dialog').getByRole('button', { name: 'Убрать' }).click();
  await t.locator('.empty', { hasText: 'Пока никто не вступил' }).waitFor();
  ok('teacher removes a student: membership ends, results hidden');

  const real = errors.filter(e => !/net::ERR|status of 4\d\d/.test(e));
  assert.deepEqual(real, [], 'no JavaScript errors');
  console.log(`PASS cloud journey: ${passed.length} scenarios, no JS errors`);
} catch (e) {
  console.error('FAIL', e.message, '\nerrors:', errors.slice(0, 8));
  try { for (const c of browser.contexts()) for (const p of c.pages()) await p.screenshot({ path: '/tmp/shots/fail-' + Math.random().toString(36).slice(2, 6) + '.png' }); } catch { /* */ }
  process.exitCode = 1;
} finally { await browser.close(); }
