// LEXI — уроки от учителя как полноценная часть платформы (2026-11-02 v2).
// Ученик: назначенный урок на главной → страница урока → игра → выход → возвращение с сохранённым прогрессом.
// Учитель: «Мои уроки» → страница урока → любая подходящая игра → возврат → правка → назначение.
// Конструктор: плитки = буквы ответа (повторы, заглавные) на уроке учителя и в учебниках.
// Доступ: ученик видит только свои уроки; чужой урок не открывается; тренировка учителя не попадает в статистику.
// Запуск против локального Supabase (см. tests/e2e/README.md): node tests/e2e/lesson-pages.mjs
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';

const SITE = (process.env.LEXIGO_URL || 'http://127.0.0.1:4173/').replace(/index\.html$/, '');
const CLOUD = process.env.CLOUD_URL || 'http://127.0.0.1:54321';
const ANON = process.env.CLOUD_ANON;
const PSQL = process.env.PSQL || 'psql -h /tmp -p 54329 -U postgres -d lexigo_e2e -Atc';
assert.ok(ANON, 'CLOUD_ANON is required');
const sql = q => execSync(PSQL + ' ' + JSON.stringify(q), { encoding: 'utf8' }).trim();
const run = Date.now().toString(36);
const mail = who => `${who}-${run}@lexigo.test`;
const PASS = 'Lexi-test-2026!';
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const multiset = a => [...a].sort().join('\u0001');

const browser = await chromium.launch({ headless: true });
const errors = [], passed = [];
const ok = m => { passed.push(m); console.log('  ✓ ' + m); };

async function device(viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport, bypassCSP: true, reducedMotion: 'reduce' });
  await ctx.route('**/config.js', r => r.fulfill({ contentType: 'application/javascript', body: `window.LEXIGO_CLOUD=Object.freeze({url:${JSON.stringify(CLOUD)},anonKey:${JSON.stringify(ANON)}});` }));
  ctx.on('page', p => {
    p.on('pageerror', e => errors.push(p.url() + ' ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push(p.url() + ' ' + m.text()); });
    p.on('dialog', d => { errors.push('unexpected alert: ' + d.message()); d.dismiss(); });
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
async function logIn(page, email, next) {
  await page.goto(SITE + 'auth.html' + (next ? '?next=' + encodeURIComponent(next) : ''));
  await page.fill('#loginEmail', email); await page.fill('#loginPassword', PASS);
  await page.getByRole('button', { name: 'Войти' }).click();
}
const resultCard = '#play .lesson-result, #play .pair-finish';
async function nextQuestion(page, idx) {
  const next = page.locator('#play button:not([disabled])', { hasText: /Следующее|Результат|Дальше|Продолжить/ }).first();
  await page.waitForFunction(i => !game || game.index !== i || document.querySelector('#play .lesson-result, #play .pair-finish') || [...document.querySelectorAll('#play button:not([disabled])')].some(b => /Следующее|Результат|Дальше|Продолжить/.test(b.textContent)), idx, { timeout: 5000 });
  if (await next.count()) await next.click();
}
/* «Конструктор»: каждое задание — плитки ровно из букв ответа; собираем по порядку — засчитывается */
async function playBuilder(page, seen) {
  for (let i = 0; i < 60; i++) {
    if (await page.locator(resultCard).count()) return;
    const st = await page.evaluate(() => ({ idx: game.index, en: game.words[game.index].en, answer: LexiWordBuilder.answer(game.words[game.index].en), tiles: [...document.querySelectorAll('#play .builder-bank .builder-token')].map(b => b.textContent) }));
    assert.equal(multiset(st.tiles), multiset(Array.from(st.answer)), 'tiles = letters of «' + st.en + '»: ' + st.tiles.join(' '));
    seen && seen.push(st.answer);
    for (const ch of Array.from(st.answer)) await page.locator('#play .builder-bank .builder-token:not([hidden])').filter({ hasText: new RegExp('^' + esc(ch) + '$') }).first().click();
    await page.locator('#play .builder-tools button', { hasText: 'Проверить' }).click();
    await page.locator('#play .feedback').waitFor();
    assert.equal(await page.locator('#play .feedback').getAttribute('data-result'), 'ok', 'built word accepted: ' + st.answer);
    await nextQuestion(page, st.idx);
  }
  throw new Error('builder round did not finish');
}
async function playToEnd(page) {
  for (let i = 0; i < 80; i++) {
    if (await page.locator(resultCard).count()) return;
    const st = await page.evaluate(() => game && { mode: game.mode, en: game.words[game.index]?.en, ru: game.words[game.index]?.ru, kind: game.activeQuestionMode, idx: game.index });
    if (!st) throw new Error('no game');
    if (st.mode === 'builder') return playBuilder(page);
    if (st.mode === 'pairs') {
      const words = await page.evaluate(() => game.words.map(w => [w.en, w.ru]));
      for (const [en, ru] of words) { await page.getByRole('button', { name: 'Английское слово: ' + en, exact: true }).click(); await page.getByRole('button', { name: 'Перевод: ' + ru, exact: true }).click(); }
      continue;
    }
    if (await page.locator('#play .answerbox input:not([disabled])').count()) {
      await page.fill('#play .answerbox input', st.en); await page.locator('#play .answerbox button').first().click();
    } else if (await page.locator('#play .options button:not([disabled])').count()) {
      const want = st.kind === 'listen' ? st.en : st.ru;
      await page.locator('#play .options button').filter({ hasText: new RegExp('^\\s*' + esc(want) + '\\s*$') }).first().click();
    } else if (await page.locator('#play .buttons button:not([disabled])', { hasText: /Верно|Неверно/ }).count()) {
      const shown = await page.evaluate(() => document.querySelector('#play .question p[style]')?.textContent.trim());
      await page.locator('#play .buttons button', { hasText: shown === st.ru ? /Верно/ : /Неверно/ }).first().click();
    }
    await nextQuestion(page, st.idx);
  }
  throw new Error('round did not finish');
}
const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const pageModes = page => page.locator('#myLessonPage .my-modes .mode');

try {
  const WORDS = ['apple — яблоко', 'coffee — кофе', 'cherry — вишня', 'Monday — понедельник', 'balloon — воздушный шар', 'T‑shirt — футболка', 'ice cream — мороженое', 'sheep — овца'].join('\n');

  /* 1. Teacher, class, students; a lesson with three chosen games */
  const tctx = await device(); const t = await tctx.newPage();
  await signUp(t, { role: 'teacher', name: 'Анна Петровна', email: mail('teacher') });
  await t.getByPlaceholder(/Например: 5/).fill('5 «Б»');
  await t.getByRole('button', { name: 'Создать класс' }).click();
  await t.locator('.group-card .code').waitFor();
  const code = (await t.locator('.group-card .code').innerText()).trim();
  const sctx = await device(); const s = await sctx.newPage();
  await signUp(s, { role: 'student', name: 'Петя', email: mail('petya'), join: code });
  const octx = await device(); const o = await octx.newPage();
  await signUp(o, { role: 'student', name: 'Оля', email: mail('olya') });
  // an older lesson saved before the games list existed (modes = null) must still work
  const tid = sql(`select id from auth.users where email='${mail('teacher')}'`);
  sql(`insert into custom_lessons(owner_id,title,words,created_at,updated_at) values ('${tid}','Старый урок','[{"en":"cat","ru":"кошка"},{"en":"dog","ru":"собака"},{"en":"bird","ru":"птица"}]'::jsonb, now()-interval '30 days', now()-interval '30 days')`);
  await t.reload(); await t.getByRole('tab', { name: /Мои уроки/ }).click();
  await t.locator('.ml-card', { hasText: 'Старый урок' }).waitFor();
  await t.getByRole('button', { name: '＋ Новый урок' }).first().click();
  await t.fill('#lsTitle', 'Фрукты и одежда'); await t.fill('#lsWords', WORDS); await t.waitForTimeout(350);
  await t.locator('.mode-pick .btn-link', { hasText: 'Снять все' }).click();
  for (const m of ['quiz', 'builder', 'pairs']) await t.locator(`.mode-opt[data-mode="${m}"]`).click();
  await t.getByRole('button', { name: 'Сохранить урок' }).click();
  const card = t.locator('.ml-card', { hasText: 'Фрукты и одежда' });
  await card.waitFor();
  ok('teacher, class «5 «Б»», student in the class, student outside it; a lesson with 3 chosen games and an old lesson (no games list)');

  /* 2. «Мои уроки»: prominent cards at the top of the tab */
  const cardText = await card.innerText();
  assert.match(cardText, /8 слов/); assert.match(cardText, /создан/); assert.match(cardText, /Ещё не назначен/);
  for (const b of ['Открыть', '▶ Играть', 'Редактировать', 'Назначить']) assert.equal(await card.getByText(b, { exact: true }).count(), 1, 'button ' + b);
  assert.match(await t.getByRole('tab', { name: /Мои уроки/ }).innerText(), /Мои уроки · 2/);
  const tabTop = await t.locator('.ml-head').boundingBox();
  assert.ok(tabTop.y < 400, 'the lessons list starts at the top of the tab, not below a form');
  assert.match(await t.locator('.ml-card', { hasText: 'Старый урок' }).innerText(), /игр в уроке: 12/);
  ok('«Мои уроки»: cards with title, words, date, assignment info and Открыть / Играть / Редактировать / Назначить at the top of the tab');

  /* 3. Teacher opens the lesson as a full page and plays ANY suitable game */
  await card.getByText('Открыть', { exact: true }).click();
  await t.waitForURL(/index\.html#\/my\/t-/);
  await t.locator('#myLessonPage h1', { hasText: 'Фрукты и одежда' }).waitFor();
  assert.equal(await t.locator('[role=dialog], .task-overlay').count(), 0, 'a page, not a modal window');
  assert.match(await t.locator('#myLessonPage .eyebrow').first().innerText(), /МОЙ УРОК/);
  assert.equal(await t.locator('#myLessonPage .my-word-list li').count(), 8);
  assert.match(await t.locator('#myLessonPage .my-word-list').innerText(), /coffee[\s\S]*кофе/);
  const tModes = await pageModes(t).evaluateAll(bs => bs.map(b => b.dataset.mode || b.dataset.game));
  for (const m of ['cards', 'quiz', 'truefalse', 'pairs', 'builder', 'fix', 'spell', 'crystals', 'mixed', 'boss']) assert.ok(tModes.includes(m), 'teacher sees ' + m);
  assert.ok(tModes.length >= 11, 'not limited to the 3 lesson games: ' + tModes.join(','));
  assert.equal(await t.locator('#myLessonPage .mode.is-task').count(), 3, '★ marks the 3 games of the lesson');
  assert.match(await t.locator('#breadcrumbs').innerText(), /Мои уроки[\s\S]*Фрукты и одежда/);
  // spell is not one of the lesson games — still playable
  await t.locator('#myLessonPage .mode[data-mode="spell"]').click();
  await t.waitForURL(/#\/my\/t-[^/]+\/play\/spell$/);
  await t.waitForFunction(() => window.game && game.mode === 'spell');
  const tst = await t.evaluate(() => ({ preview: !!game.cloud?.meta?.preview, ids: game.words.map(w => w.id) }));
  assert.ok(tst.preview && tst.ids.every(id => /^c_/.test(id)), 'teacher training uses the lesson words only');
  assert.match(await t.locator('#myLessonBanner').innerText(), /Тренировка учителя/);
  assert.match(await t.locator('#breadcrumbs').innerText(), /Фрукты и одежда[\s\S]*Напиши слово/);
  await playToEnd(t);
  await t.locator('#play .task-return button', { hasText: 'К играм урока' }).click();
  await t.waitForURL(/#\/my\/t-[0-9a-f-]+$/);
  await t.locator('#myLessonPage .mode.is-done[data-mode="spell"]').waitFor();
  // switch to the builder: tiles are exactly the letters (coffee, cherry, balloon, Monday, T-shirt)
  await t.locator('#myLessonPage .mode[data-mode="builder"]').click();
  await t.waitForFunction(() => window.game && game.mode === 'builder');
  const built = [];
  await playBuilder(t, built);
  assert.ok(!built.includes('ice cream'), 'phrase skipped in the builder');
  assert.ok(built.includes('T-shirt') && built.includes('Monday') && built.includes('coffee'), 'hyphen, capital and repeated letters are playable: ' + built.join(','));
  // back via the game's own «← К режимам» button
  await t.locator('#myLessonBanner button').click();
  await t.waitForURL(/#\/my\/t-[0-9a-f-]+$/);
  await t.locator('#myLessonPage .mode.is-done[data-mode="builder"]').waitFor();
  await t.locator('#myLessonPage .mode[data-mode="quiz"]').click();
  await t.waitForFunction(() => window.game && game.mode === 'quiz');
  await t.locator('#back').click();
  await t.waitForURL(/#\/my\/t-[0-9a-f-]+$/);
  ok('teacher: full lesson page (words + ' + tModes.length + ' games, ★ on lesson games) → spell, builder, quiz with lesson words → back to the page, «✓ пройдено»');

  /* 4. Teacher training never reaches the class statistics */
  await t.waitForTimeout(1200);
  assert.equal(sql(`select count(*) from sessions where user_id='${tid}'`), '0');
  assert.equal(sql(`select count(*) from word_progress where user_id='${tid}'`), '0');
  assert.equal(sql(`select coalesce((select xp from user_stats where user_id='${tid}'),0)`), '0');
  ok('teacher training: 0 sessions, 0 word progress, 0 XP');

  /* 5. Edit from the lesson page, then assign */
  await t.locator('#myLessonPage a', { hasText: 'Редактировать' }).click();
  await t.waitForURL(/me\.html/); await t.locator('#lsTitle').waitFor();
  assert.equal(await t.inputValue('#lsTitle'), 'Фрукты и одежда');
  await t.fill('#lsWords', WORDS + '\nkitten — котёнок'); await t.waitForTimeout(300);
  await t.getByRole('button', { name: 'Сохранить изменения' }).click();
  await t.locator('.ml-card', { hasText: 'Фрукты и одежда' }).filter({ hasText: '9 слов' }).waitFor();
  await t.locator('.ml-card', { hasText: 'Фрукты и одежда' }).getByRole('button', { name: /^Назначить/ }).click();
  await t.locator('.wiz').waitFor();
  assert.match(await t.locator('.wiz .mode-count').innerText(), /Выбрано: 3 из 12/);
  await t.getByRole('button', { name: 'Назначить', exact: true }).click();
  await t.locator('.group-card', { hasText: 'Фрукты и одежда' }).waitFor();
  const aid = sql(`select id from assignments where title='Фрукты и одежда' and teacher_id='${tid}'`);
  const lid = sql(`select id from custom_lessons where title='Фрукты и одежда' and owner_id='${tid}'`);
  await t.getByRole('tab', { name: /Мои уроки/ }).click();
  assert.match(await t.locator('.ml-card', { hasText: 'Фрукты и одежда' }).innerText(), /Назначен: 5 «Б»/);
  ok('teacher: «Редактировать» from the page opens the editor; saved (9 words); «Назначить» → wizard with the 3 lesson games → assigned; card shows «Назначен: 5 «Б»»');

  /* 6. Student: the lesson comes first on the home page */
  await s.goto(SITE + 'index.html#/home');
  const feature = s.locator('#myLessonsHome .tl-feature');
  await feature.waitFor();
  assert.equal(await s.evaluate(() => document.getElementById('homePage').firstElementChild.id), 'myLessonsHome', 'block is the first thing on the home page');
  const fy = (await feature.boundingBox()).y, hy = (await s.locator('#lexiHome').boundingBox()).y;
  assert.ok(fy < hy, 'above Lexi and the textbooks');
  const ft = await feature.innerText();
  assert.match(ft, /Твой урок от учителя/i); assert.match(ft, /Фрукты и одежда/); assert.match(ft, /Анна Петровна/); assert.match(ft, /9 слов/); assert.match(ft, /Не начат/);
  ok('student home: «Твой урок от учителя» first — title, teacher, 9 words, «Не начат», «Открыть урок»');

  /* 7. Student opens the page, plays, leaves, comes back */
  await feature.getByRole('link', { name: /Открыть урок/ }).click();
  await s.waitForURL(new RegExp('#/my/a-' + aid + '$'));
  await s.locator('#myLessonPage h1', { hasText: 'Фрукты и одежда' }).waitFor();
  assert.equal(await s.locator('[role=dialog], .task-overlay').count(), 0, 'a page, not a modal window');
  assert.match(await s.locator('#myLessonPage .eyebrow').first().innerText(), /УРОК ОТ УЧИТЕЛЯ/);
  assert.match(await s.locator('#myLessonPage .my-meta').innerText(), /Анна Петровна · 9 слов/);
  const sModes = await pageModes(s).evaluateAll(bs => bs.map(b => b.dataset.mode || b.dataset.game));
  assert.ok(sModes.includes('truefalse') && sModes.includes('spell') && sModes.length >= 11, 'all suitable games, not only the 3 of the task: ' + sModes.join(','));
  assert.equal(await s.locator('#myLessonPage .mode.is-task').count(), 3);
  await s.locator('#myLessonPage .mode[data-mode="quiz"]').click();
  await s.waitForFunction(() => window.game && game.mode === 'quiz');
  assert.ok(await s.evaluate(() => game.cloud.meta.assignment_id && !game.cloud.meta.preview));
  await playToEnd(s);
  await s.locator('#play .task-return button', { hasText: 'Вернуться к уроку' }).click();
  await s.locator('#myLessonPage .mode.is-done[data-mode="quiz"]').waitFor();
  assert.match(await s.locator('#myLessonPage .my-progress').innerText(), /В процессе[\s\S]*Игры задания: 1 из 3/);
  await s.waitForTimeout(1500);
  const sid = sql(`select id from auth.users where email='${mail('petya')}'`);
  assert.equal(sql(`select count(*) from sessions where user_id='${sid}' and assignment_id='${aid}' and finished and mode='quiz'`), '1');
  // leave to the home page: status updated
  await s.locator('#gameHome, #homeNav').first().click().catch(() => s.goto(SITE + 'index.html#/home'));
  await s.goto(SITE + 'index.html#/home'); await feature.waitFor();
  await s.locator('#myLessonsHome .tl-feature', { hasText: 'В процессе' }).waitFor();
  assert.match(await feature.innerText(), /Продолжить/);
  // come back on ANOTHER device: progress comes from the account
  const s2ctx = await device({ width: 390, height: 844 }); const s2 = await s2ctx.newPage();
  await s2.goto(SITE + 'index.html#/my/a-' + aid);
  await s2.waitForURL(/auth\.html/);
  await s2.fill('#loginEmail', mail('petya')); await s2.fill('#loginPassword', PASS); await s2.getByRole('button', { name: 'Войти' }).click();
  await s2.waitForURL(new RegExp('#/my/a-' + aid));
  await s2.locator('#myLessonPage .mode.is-done[data-mode="quiz"]').waitFor();
  ok('student: page → quiz → «Вернуться к уроку» (✓, «В процессе 1 из 3», session saved) → home «Продолжить» → another device: sign-in returns to the lesson with progress');

  /* 8. Continue: builder and pairs → «Завершён»; extra game saved too; the lesson stays for review */
  await s2.locator('#myLessonPage .mode[data-mode="builder"]').click();
  await s2.waitForFunction(() => window.game && game.mode === 'builder');
  await playBuilder(s2);
  await s2.locator('#play .task-return button').click();
  await s2.locator('#myLessonPage .mode[data-mode="pairs"]').click();
  await s2.waitForFunction(() => window.game && game.mode === 'pairs');
  await playToEnd(s2);
  await s2.locator('#play .task-return button').click();
  await s2.locator('#myLessonPage .my-progress', { hasText: 'Завершён' }).waitFor();
  await s2.locator('#myLessonPage .mode[data-mode="truefalse"]').click();
  await s2.waitForFunction(() => window.game && game.mode === 'truefalse');
  await playToEnd(s2); await s2.waitForTimeout(1500);
  assert.equal(sql(`select count(distinct mode) from sessions where user_id='${sid}' and assignment_id='${aid}' and finished`), '4');
  assert.ok(Number(sql(`select count(*) from word_progress where user_id='${sid}' and word_id like 'c\\_%'`)) >= 5, 'word progress of lesson words saved');
  await s2.goto(SITE + 'index.html#/home');
  await s2.locator('#myLessonsHome .tl-feature', { hasText: 'Завершён' }).waitFor();
  assert.match(await s2.locator('#myLessonsHome .tl-feature').innerText(), /Повторить/);
  assert.ok(await noHScroll(s2), 'phone: home without horizontal scroll');
  const fb = await s2.locator('#myLessonsHome .tl-feature').boundingBox();
  assert.ok(fb.y < 844 && fb.x >= 0 && fb.x + fb.width <= 390, 'phone: the lesson card is on the first screen');
  ok('student: builder (tiles = letters) + pairs → «Завершён»; extra «Верно / неверно» saved too (4 games); home keeps the lesson with «Повторить»; phone 390 px');

  /* 9. Student cabinet: «Уроки от учителя» */
  await s.goto(SITE + 'me.html'); await s.locator('#lessons .tl-card').first().waitFor();
  const cab = await s.locator('#lessons').innerText();
  assert.match(cab, /Уроки от учителя/); assert.match(cab, /Фрукты и одежда/); assert.match(cab, /Завершён/);
  assert.equal(await s.locator('#lessons .tl-card a').first().getAttribute('href'), 'index.html#/my/a-' + aid);
  const order = await s.evaluate(() => [...document.querySelectorAll('.cab-grid > section')].map(x => x.id || x.className).slice(0, 3).join('|'));
  assert.match(order, /st-hero.*lessons/);
  ok('student cabinet: «Уроки от учителя» right after the greeting, card «Завершён», link to the lesson page');

  /* 10. Access */
  await o.goto(SITE + 'index.html#/my/a-' + aid);
  await o.locator('#myLessonPage h1', { hasText: 'Урок не найден' }).waitFor();
  assert.equal(await o.evaluate(() => !!game), false, 'no game started');
  await o.goto(SITE + 'index.html#/my/t-' + lid);
  await o.locator('#myLessonPage h1', { hasText: /Урок не найден|через задание/ }).waitFor();
  await o.goto(SITE + 'index.html#/home'); await o.waitForTimeout(2000);
  assert.equal(await o.locator('#myLessonsHome:not([hidden])').count(), 0, 'no lessons → no empty block');
  assert.equal(await o.locator('#myLessonsHome .tl-card').count(), 0);
  // the student follows a link to the lesson itself → his assignment opens
  await s.goto(SITE + 'index.html#/my/t-' + lid);
  await s.waitForURL(new RegExp('#/my/a-' + aid + '$'));
  await s.locator('#myLessonPage h1', { hasText: 'Фрукты и одежда' }).waitFor();
  // a lesson that was never assigned stays closed
  const oldId = sql(`select id from custom_lessons where title='Старый урок' and owner_id='${tid}'`);
  await s.goto(SITE + 'index.html#/my/t-' + oldId);
  await s.locator('#myLessonPage h1', { hasText: 'Урок не найден' }).waitFor();
  // the student cannot change the lesson through the API
  const changed = await s.evaluate(async id => { const sb = await LexigoCloud.client(); const r = await sb.from('custom_lessons').update({ title: 'взлом' }).eq('id', id).select(); return (r.data || []).length; }, lid);
  assert.equal(changed, 0); assert.equal(sql(`select title from custom_lessons where id='${lid}'`), 'Фрукты и одежда');
  ok('access: a student outside the class gets «Урок не найден», no game, no empty home block; own student is redirected from the lesson link to his task; unassigned lesson closed; lessons cannot be changed by a student');

  /* 11. Old links and old lessons */
  await s.goto(SITE + 'index.html?task=' + aid);
  await s.waitForURL(new RegExp('index\\.html#/my/a-' + aid + '$'));
  await s.locator('#myLessonPage h1', { hasText: 'Фрукты и одежда' }).waitFor();
  await t.goto(SITE + 'index.html?lesson=' + oldId);
  await t.waitForURL(new RegExp('#/my/t-' + oldId + '$'));
  await t.locator('#myLessonPage h1', { hasText: 'Старый урок' }).waitFor();
  assert.ok(await pageModes(t).count() >= 11, 'old lesson: all games');
  ok('old links ?task= and ?lesson= open the new pages; a lesson saved without a games list works with every game');

  /* 12. Teacher results: only the student */
  await t.goto(SITE + 'me.html'); await t.getByRole('tab', { name: 'Задания' }).click();
  await t.locator('.group-card', { hasText: 'Фрукты и одежда' }).getByRole('button', { name: 'Результаты' }).click();
  await t.locator('.dialog .tbl').waitFor();
  assert.match(await t.locator('.dialog .tbl tbody').innerText(), /Петя[\s\S]*Выполнено/);
  assert.equal(await t.locator('.dialog .tbl tbody tr').count(), 1);
  await t.keyboard.press('Escape');
  ok('teacher results: Петя «Выполнено», teacher training absent');

  /* 13. Phone and tablet layouts */
  for (const vp of [{ width: 360, height: 760 }, { width: 820, height: 1180 }]) {
    const c = await device(vp); const m = await c.newPage();
    await logIn(m, mail('teacher')); await m.waitForURL(/me\.html/); await m.locator('.cab-head h1').waitFor();
    await m.getByRole('tab', { name: /Мои уроки/ }).click(); await m.locator('.ml-grid').waitFor();
    assert.ok(await noHScroll(m), vp.width + ': lessons tab');
    await m.locator('.ml-card', { hasText: 'Фрукты и одежда' }).getByText('▶ Играть').click();
    await m.locator('#myLessonPage .my-modes').waitFor();
    assert.ok(await noHScroll(m), vp.width + ': lesson page');
    await m.locator('#myLessonPage .mode[data-mode="builder"]').click();
    await m.waitForFunction(() => window.game && game.mode === 'builder');
    assert.ok(await noHScroll(m), vp.width + ': builder game');
    await c.close();
  }
  ok('phone 360 px and tablet 820 px: lessons tab, lesson page and a game without horizontal scroll');

  const real = errors.filter(e => !/net::ERR|status of 4\d\d/.test(e));
  assert.deepEqual(real, [], 'no JavaScript errors');
  console.log(`PASS lesson pages: ${passed.length} scenarios, no JS errors`);
} catch (e) {
  console.error('FAIL', e.message, '\nerrors:', errors.slice(0, 8));
  try { for (const c of browser.contexts()) for (const p of c.pages()) await p.screenshot({ path: '/tmp/fail-' + Math.random().toString(36).slice(2, 6) + '.png', fullPage: true }); } catch { /* */ }
  process.exitCode = 1;
} finally { await browser.close(); }
