// LEXI — свои уроки учителя: игры без ограничения «до 6», тренировка учителя (предпросмотр),
// совместимость игр с фразами, сохранение настроек, изоляция статистики класса.
// Запуск против локального Supabase (см. tests/e2e/README.md): node tests/e2e/teacher-lessons.mjs
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
const ALL = ['quiz', 'spell', 'pairs', 'truefalse', 'cards', 'builder', 'listen', 'audio', 'mixed', 'boss', 'crystals'];
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
async function playToEnd(page) {
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
      await page.fill('#play .answerbox input', st.en); await page.locator('#play .answerbox button').first().click();
    } else if (await page.locator('#play .options button:not([disabled])').count()) {
      const want = st.kind === 'listen' ? st.en : st.ru;
      await page.locator('#play .options button').filter({ hasText: new RegExp('^\\s*' + esc(want) + '\\s*$') }).first().click();
    }
    const idx = await page.evaluate(() => game ? game.index : -1);
    const next = page.locator('#play button:not([disabled])', { hasText: /Следующее|Результат|Дальше|Продолжить/ }).first();
    await page.waitForFunction(i => !game || game.index !== i || document.querySelector('#play .lesson-result, #play .pair-finish') || [...document.querySelectorAll('#play button:not([disabled])')].some(b => /Следующее|Результат|Дальше|Продолжить/.test(b.textContent)), idx, { timeout: 5000 });
    if (await next.count()) await next.click();
  }
  throw new Error('round did not finish');
}
const mine = `owner_id=(select id from auth.users where email='${mail('teacher')}')`;
const lessonModes = title => sql(`select coalesce(array_to_string(modes, ','), 'NULL') from custom_lessons where title='${title}' and ${mine}`);

const PM = '#myLessonPage .my-modes .mode';   // games on the lesson page
async function newLesson(t, title, words, pick) {
  await t.getByRole('tab', { name: /Мои уроки/ }).click(); await t.getByRole('button', { name: '＋ Новый урок' }).first().click();
  await t.fill('#lsTitle', title); await t.fill('#lsWords', words);
  await t.waitForTimeout(350);
  if (pick) { await t.locator('.mode-pick .btn-link', { hasText: 'Снять все' }).click(); for (const m of pick) await t.locator(`.mode-opt[data-mode="${m}"]`).click(); }
  await t.getByRole('button', { name: 'Сохранить урок' }).click();
  await t.locator('.ml-card', { hasText: title }).waitFor();
}

try {
  const WORDS = 'apple — яблоко\npear — груша\nplum — слива\ncherry — вишня\nbanana — банан\nlemon — лимон\nice cream — мороженое';

  /* 1. Teacher, class, student */
  const tctx = await device(); const t = await tctx.newPage();
  await signUp(t, { role: 'teacher', name: 'Учитель Тест', email: mail('teacher') });
  await t.getByPlaceholder(/Например: 5/).fill('6 «А»');
  await t.getByRole('button', { name: 'Создать класс' }).click();
  await t.locator('.group-card .code').waitFor();
  const code = (await t.locator('.group-card .code').innerText()).trim();
  const sctx = await device({ width: 390, height: 844 }); const s = await sctx.newPage();
  await signUp(s, { role: 'student', name: 'Петя', email: mail('petya'), join: code });
  ok('teacher + class + student ready');

  /* 2. Mode picker: counter, select all / clear all, no limit */
  await t.getByRole('tab', { name: /Мои уроки/ }).click(); await t.getByRole('button', { name: '＋ Новый урок' }).first().click();
  assert.equal(await t.locator('.mode-opt').count(), ALL.length);
  assert.match(await t.locator('.mode-count').innerText(), new RegExp('Выбрано: ' + ALL.length + ' из ' + ALL.length));
  await t.locator('.mode-pick .btn-link', { hasText: 'Снять все' }).click();
  assert.match(await t.locator('.mode-count').innerText(), /Выбрано: 0 из 12/);
  for (const m of ALL.slice(0, 8)) await t.locator(`.mode-opt[data-mode="${m}"]`).click();
  assert.match(await t.locator('.mode-count').innerText(), /Выбрано: 8 из 12/);
  await t.locator('.mode-pick .btn-link', { hasText: 'Выбрать все' }).click();
  assert.match(await t.locator('.mode-count').innerText(), /Выбрано: 12 из 12/);
  ok('picker: «Выбрано: N из 12», «Выбрать все» / «Снять все», no cap');

  /* 3. Lessons with 1, 6, 10 and all games */
  await newLesson(t, 'Один режим', WORDS, ['quiz']);
  assert.equal(lessonModes('Один режим'), 'quiz');
  await newLesson(t, 'Шесть игр', WORDS, ALL.slice(0, 6));
  assert.equal(lessonModes('Шесть игр').split(',').length, 6);
  await newLesson(t, 'Десять игр', WORDS, ALL.slice(0, 10));
  assert.equal(lessonModes('Десять игр').split(',').length, 10);
  await newLesson(t, 'Все игры', WORDS, null);
  assert.equal(lessonModes('Все игры').split(',').length, 11);
  assert.match(await t.locator('.lesson-row', { hasText: 'Все игры' }).innerText(), /игр в уроке: 12/);
  // nothing selected → refused
  await t.getByRole('button', { name: '＋ Новый урок' }).first().click();
  await t.fill('#lsTitle', 'Без игр'); await t.fill('#lsWords', WORDS);
  await t.locator('.mode-pick .btn-link', { hasText: 'Снять все' }).click();
  await t.getByRole('button', { name: 'Сохранить урок' }).click();
  await t.locator('.lexi-toast', { hasText: 'хотя бы одну игру' }).waitFor();
  assert.equal(sql(`select count(*) from custom_lessons where title='Без игр' and ${mine}`), '0');
  ok('lessons saved with 1, 6, 10 and all 12 games; zero games refused');

  /* 4. Edit keeps working and survives reload */
  await t.reload(); await t.getByRole('tab', { name: /Мои уроки/ }).click();
  await t.locator('.lesson-row', { hasText: 'Шесть игр' }).getByRole('button', { name: /Редактировать/ }).click();
  assert.match(await t.locator('.mode-count').innerText(), /Выбрано: 6 из 12/);
  for (const m of ALL.slice(6, 9)) await t.locator(`.mode-opt[data-mode="${m}"]`).click();
  await t.getByRole('button', { name: 'Сохранить изменения' }).click();
  await t.locator('.lesson-row', { hasText: 'Шесть игр' }).filter({ hasText: 'игр в уроке: 9' }).waitFor();
  await t.reload(); await t.getByRole('tab', { name: /Мои уроки/ }).click();
  await t.locator('.lesson-row', { hasText: 'Шесть игр' }).getByRole('button', { name: /Редактировать/ }).click();
  assert.match(await t.locator('.mode-count').innerText(), /Выбрано: 9 из 12/);
  assert.equal(await t.locator('#lsWords').inputValue(), WORDS);
  await t.getByRole('button', { name: 'Отмена', exact: true }).click();
  ok('edit: games and words persist after reload (6 → 9 games)');

  /* 5. Compatibility: phrases-only lesson */
  await t.getByRole('button', { name: '＋ Новый урок' }).first().click();
  await t.fill('#lsTitle', 'Только фразы'); await t.fill('#lsWords', 'ice cream — мороженое\ngood morning — доброе утро\nthank you — спасибо');
  await t.waitForTimeout(350);
  for (const m of ['builder', 'audio', 'boss', 'crystals']) assert.match(await t.locator(`.mode-opt[data-mode="${m}"]`).getAttribute('class'), /unfit/, m + ' must be unfit');
  assert.match(await t.locator('.mode-note').innerText(), /«Конструктор» собирает только отдельные слова/);
  await t.getByRole('button', { name: 'Сохранить урок' }).click();
  await t.locator('.lexi-toast', { hasText: 'Не подходит к словам урока' }).waitFor();
  assert.equal(sql(`select count(*) from custom_lessons where title='Только фразы' and ${mine}`), '0');
  for (const m of ['builder', 'audio', 'boss', 'crystals']) await t.locator(`.mode-opt[data-mode="${m}"]`).click();
  await t.getByRole('button', { name: 'Сохранить урок' }).click();
  await t.locator('.lesson-row', { hasText: 'Только фразы' }).waitFor();
  assert.equal(lessonModes('Только фразы').split(',').length, 8);
  // mixed words + phrase → partial, explained
  await t.getByRole('button', { name: '＋ Новый урок' }).first().click();
  await t.fill('#lsWords', WORDS); await t.waitForTimeout(350);
  assert.match(await t.locator('.mode-opt[data-mode="builder"]').getAttribute('class'), /partial/);
  assert.match(await t.locator('.mode-note').innerText(), /Фразы пропускаются: в игре 6 слов из 7/);
  await t.fill('#lsWords', ''); await t.fill('#lsTitle', '');
  await t.getByRole('tab', { name: /Мои уроки/ }).click();   // back to the list of lessons
  ok('compatibility: builder/audio/boss/crystals refused for phrases with a clear reason; partial use explained');

  /* 6. Teacher plays own lesson — every game, same engine */
  const xpBefore = sql(`select coalesce((select xp from user_stats u join auth.users a on a.id=u.user_id where a.email='${mail('teacher')}'),0)`);
  await t.locator('.lesson-row', { hasText: 'Все игры' }).getByRole('link', { name: /Играть/ }).click();
  await t.waitForURL(/index\.html#\/my\/t-/);
  await t.locator(PM).first().waitFor();
  assert.match(await t.locator('#myLessonPage .eyebrow').first().innerText(), /МОЙ УРОК/);
  assert.match(await t.locator('.task-preview-note').innerText(), /не сохраняются в статистику класса/);
  assert.equal(await t.locator('[role=dialog], .task-overlay').count(), 0, 'a page, not a modal');
  assert.ok(!/lesson=/.test(t.url()), 'lesson id removed from the address bar after load');
  const speech = await t.evaluate(() => typeof speechSynthesis !== 'undefined');
  assert.equal(await t.locator(PM + ':not(.is-soft)').count(), speech ? 12 : 10);
  const played = [];
  for (const m of ALL) {
    if (!(await t.locator(PM).count())) { await t.locator('#myLessonBanner button').click(); }
    const btn = t.locator(`${PM}[data-play="${m}"]`);
    if (['audio', 'listen'].includes(m) && !speech) { assert.equal(await btn.count(), 0); continue; }
    await btn.click();
    await t.waitForFunction(mm => window.game && game.mode === mm, m, { timeout: 5000 });
    const st = await t.evaluate(() => ({ preview: !!game.cloud?.meta?.preview, n: game.words.length, ids: game.words.map(w => w.id), en: game.words.map(w => w.en) }));
    assert.ok(st.preview, m + ': preview flag');
    assert.ok(st.n > 0 && st.ids.every(id => /^c_/.test(id)), m + ': lesson words only');
    if (['builder', 'audio', 'boss', 'crystals'].includes(m)) assert.ok(!st.en.includes('ice cream'), m + ': phrases skipped');
    assert.match(await t.locator('#myLessonBanner').innerText(), /Тренировка учителя/);
    if (['quiz', 'spell', 'pairs'].includes(m)) await playToEnd(t); else await t.evaluate(() => finish());
    await t.locator('#play .lesson-result, #play .pair-finish').first().waitFor();
    played.push(m);
    if (m === 'quiz') {
      await t.locator('#play .lexi-reward.preview').waitFor();
      // «Повторить» stays on the lesson words
      await t.locator('#play button', { hasText: /^Повторить$/ }).click();
      await t.waitForFunction(() => window.game && game.mode === 'quiz' && game.index === 0);
      assert.ok(await t.evaluate(() => game.words.every(w => /^c_/.test(w.id)) && game.cloud.meta.preview), '«Повторить» keeps lesson words');
      await t.evaluate(() => finish());
    }
    const back = t.locator('#play .task-return button');
    if (await back.count()) await back.click(); else await t.locator('#myLessonBanner button').click();
    await t.locator(`${PM}.is-done[data-play="${m}"]`).waitFor();
    assert.match(await t.locator(`${PM}[data-play="${m}"]`).innerText(), /пройдено/);
  }
  ok('teacher plays own lesson in all ' + played.length + ' available games (same game engine, lesson words only)');

  /* 7. Teacher training changes nothing in the cloud */
  await t.waitForTimeout(1500);
  const tid = sql(`select id from auth.users where email='${mail('teacher')}'`);
  assert.equal(sql(`select count(*) from sessions where user_id='${tid}'`), '0');
  assert.equal(sql(`select count(*) from word_progress where user_id='${tid}'`), '0');
  assert.equal(sql(`select coalesce((select xp from user_stats where user_id='${tid}'),0)`), xpBefore);
  assert.equal(sql(`select count(*) from leaderboard where user_id='${tid}'`), '0');
  assert.equal(await t.evaluate(() => JSON.parse(localStorage.getItem('lexigo_cloud_queue') || '[]').length), 0);
  ok('teacher training: 0 sessions, 0 word progress, XP unchanged, not in ТОП-3, nothing queued');

  /* 8. Assign from the training panel → wizard with the lesson's games, no 6-game cap */
  await t.locator('#myLessonPage a', { hasText: 'Назначить ученикам' }).click();
  await t.waitForURL(/me\.html/); await t.locator('.wiz').waitFor();
  assert.match(await t.locator('.wiz .mode-count').innerText(), /Выбрано: 12 из 12/);
  assert.equal(await t.locator('.wiz select').last().inputValue() !== '', true);
  await t.getByRole('button', { name: 'Назначить', exact: true }).click();
  await t.locator('.group-card', { hasText: 'Все игры' }).waitFor();
  assert.equal(sql(`select cardinality(modes) from assignments where title='Все игры' and teacher_id='${tid}'`), '12');
  // a Spotlight assignment with all games too
  await t.getByRole('button', { name: '＋ Новое задание' }).click();
  await t.locator('.wiz-step select').nth(1).selectOption('4');
  await t.locator('.lessons-pick label').first().click();
  await t.locator('.wiz .mode-pick .btn-link', { hasText: 'Выбрать все' }).click();
  assert.match(await t.locator('.wiz .mode-count').innerText(), /Выбрано: 12 из 12/);
  await t.getByRole('button', { name: 'Назначить', exact: true }).click();
  await t.locator('.group-card', { hasText: 'Spotlight 4' }).waitFor();
  assert.equal(sql(`select cardinality(modes) from assignments where grade=4 and teacher_id='${tid}'`), '12');
  ok('assignments with all 12 games (own lesson pre-filled from the lesson; Spotlight via «Выбрать все»)');

  /* 9. Student plays the assignment; class stats contain only the student */
  await s.reload(); await s.locator('#lessons .tl-card', { hasText: 'Все игры' }).getByRole('link', { name: /Открыть урок/ }).click();
  await s.locator(PM).first().waitFor();
  assert.equal(await s.locator(PM + '.is-task').count(), 12);
  assert.ok(!(await s.locator('.task-preview-note').count()), 'student sees a normal task, not the teacher preview');
  await s.locator(PM + '[data-mode="quiz"]').click(); await playToEnd(s);
  await s.locator('#play .task-return button').waitFor(); await s.waitForTimeout(1500);
  const sid = sql(`select id from auth.users where email='${mail('petya')}'`);
  assert.equal(sql(`select count(*) from sessions s join assignments a on a.id=s.assignment_id where a.title='Все игры' and a.teacher_id='${tid}' and s.finished`), '1');
  assert.equal(sql(`select user_id from sessions s join assignments a on a.id=s.assignment_id where a.title='Все игры' and a.teacher_id='${tid}'`), sid);
  await t.reload(); await t.getByRole('tab', { name: 'Задания' }).click();
  await t.locator('.group-card', { hasText: 'Все игры' }).getByRole('button', { name: 'Результаты' }).click();
  await t.locator('.dialog .tbl').waitFor();
  assert.match(await t.locator('.dialog .tbl tbody').innerText(), /Петя[\s\S]*В процессе 1\/12/);
  assert.equal(await t.locator('.dialog .tbl tbody tr').count(), 1);
  await t.keyboard.press('Escape');
  ok('student plays the 12-game assignment; results show only the student (1/12), teacher training absent');

  /* 10. Mobile: cabinet and training panel fit a phone screen */
  const mctx = await device({ width: 360, height: 760 }); const m = await mctx.newPage();
  await m.goto(SITE + 'auth.html'); await m.fill('#loginEmail', mail('teacher')); await m.fill('#loginPassword', PASS);
  await m.getByRole('button', { name: 'Войти' }).click(); await m.waitForURL(/me\.html/); await m.locator('.cab-head h1').waitFor();
  await m.getByRole('tab', { name: /Мои уроки/ }).click(); await m.locator('.ml-grid').waitFor();
  assert.ok(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal scroll in lessons tab');
  await m.locator('.lesson-row', { hasText: 'Все игры' }).getByRole('link', { name: /Играть/ }).click();
  await m.locator(PM).first().waitFor();
  const box = await m.locator('#myLessonPage .my-head').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 360, 'panel fits the screen');
  await m.locator(PM + '[data-mode="pairs"]').click(); await playToEnd(m);
  await m.locator('#play .pair-finish, #play .lesson-result').first().waitFor();
  assert.ok(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal scroll in game');
  ok('mobile 360px: lessons tab, lesson page and a game fit without horizontal scroll');

  /* 11. Other users cannot open someone else's lesson in training mode */
  await s.goto(SITE + 'index.html?lesson=' + sql(`select id from custom_lessons where title='Один режим' and ${mine}`));
  await s.waitForTimeout(2500);
  await s.locator('#myLessonPage h1', { hasText: 'Урок не найден' }).waitFor();
  assert.equal(await s.locator(PM).count(), 0);
  ok('training link of another teacher\'s lesson does not open for a student');

  const real = errors.filter(e => !/net::ERR|status of 4\d\d/.test(e));
  assert.deepEqual(real, [], 'no JavaScript errors');
  console.log(`PASS teacher lessons: ${passed.length} scenarios, no JS errors`);
} catch (e) {
  console.error('FAIL', e.message, '\nerrors:', errors.slice(0, 8));
  try { for (const c of browser.contexts()) for (const p of c.pages()) await p.screenshot({ path: '/tmp/fail-' + Math.random().toString(36).slice(2, 6) + '.png', fullPage: true }); } catch { /* */ }
  process.exitCode = 1;
} finally { await browser.close(); }
