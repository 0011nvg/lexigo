// LEXI personal space (2026-11-02): my class, continue, favourite modules, hard words, one word set for every game.
// Scenarios from the brief: new student, choose 10 of 30 words, return visit, favourites, temporary class switch,
// hard words after reload, mobile (iPhone viewport; WebKit too when LEXIGO_WEBKIT=1).
import assert from 'node:assert/strict';
import { chromium } from './browser-runtime.mjs';
import { webkit, devices } from 'playwright';
const BASE = process.env.LEXIGO_URL || 'http://127.0.0.1:4173/index.html';
const errors = [];
const ok = m => console.log('  ✓ ' + m);
const browser = await chromium.launch({ headless: true });
async function fresh(b = browser, opts = { viewport: { width: 1280, height: 900 } }) {
  const ctx = await b.newContext({ reducedMotion: 'reduce', ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|supabase/i.test(m.text())) errors.push(m.text()); });
  await page.route(/supabase\.co/, r => r.abort());
  return page;
}
const solve = async page => {
  const st = await page.evaluate(() => ({ en: game.words[game.index].en, ru: game.words[game.index].ru, kind: game.activeQuestionMode, idx: game.index }));
  if (await page.locator('#play .builder-bank').count()) {
    const target = st.en.trim().includes(' ') ? st.en.trim().split(/\s+/) : [...st.en.trim()];
    for (const t of target) await page.locator('#play .builder-bank .builder-token:not([hidden])').filter({ hasText: new RegExp('^' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).first().click();
    await page.locator('#play .builder-tools button', { hasText: 'Проверить' }).click();
  } else if (await page.locator('#play .answerbox input:not([disabled])').count()) {
    await page.fill('#play .answerbox input', st.en); await page.locator('#play .answerbox button').first().click();
  } else if (await page.locator('#play .options button:not([disabled])').count()) {
    const want = st.kind === 'listen' ? st.en : st.ru;
    await page.locator('#play .options button').filter({ hasText: new RegExp('^\\s*' + want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$') }).first().click();
  } else if (await page.locator('#play .buttons .btn.good').count()) {
    const claim = await page.evaluate(() => document.querySelector('#play .question p[style]')?.textContent || '');
    await page.locator('#play .buttons .btn', { hasText: claim.trim() === st.ru.trim() ? 'Верно' : 'Неверно' }).first().click();
  }
  await page.waitForFunction(i => !game || game.index !== i || document.querySelector('#play .lesson-result') || [...document.querySelectorAll('#play button:not([disabled])')].some(b => /Следующее|Результат/.test(b.textContent)), st.idx);
  const next = page.locator('#play button:not([disabled])', { hasText: /Следующее|Результат/ }).first();
  if (await next.count()) await next.click();
};
async function finishRound(page) { for (let i = 0; i < 80 && !(await page.locator('#play .lesson-result').count()); i++) await solve(page); await page.locator('#play .lesson-result').waitFor(); }
const storage = (page, key) => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), key);

try {
  /* 1. New student: chooses 6th grade on the home page → module → training */
  let page = await fresh();
  await page.goto(BASE + '#/home');
  await page.locator('.desk-new .class-picker').waitFor();
  assert.match(await page.locator('.lexi-hero-sub').innerText(), /Выбери свой класс/);
  assert.equal(await page.locator('.desk-continue').count(), 0, 'no continue card for a brand-new student');
  await page.locator('.class-picker button', { hasText: /^6$/ }).click();
  await page.waitForURL(/#\/course\/6\/0$/);
  assert.equal((await storage(page, 'lexigo_my_class_v1')).grade, 6);
  assert.match(await page.locator('#classBar').innerText(), /Мой класс/);
  await page.locator('#moduleTabs a').nth(1).click();
  await page.locator('#lessonCards a.lesson-card').nth(1).click();
  await page.locator('#launcher .mode[data-mode=quiz]').click();
  await page.locator('#play .options button').first().waitFor();
  await finishRound(page);
  const last = await storage(page, 'lexigo_last_activity_v1');
  assert.match(last.path, /^\/lesson\/6\/\d+$/); assert.equal(last.mode, 'quiz'); assert.equal(last.finished, true);
  ok('new student: picks 6th grade once → Spotlight 6 → module 2 → lesson → game; class and finished game remembered');

  /* 2. Choose 10 of 30 words and play several games with exactly these words */
  await page.goto(BASE + '#/lesson/6/m1/words');
  await page.locator('#words input').first().waitFor();
  const total = await page.locator('#words input').count(); assert.ok(total >= 12, 'module has enough words: ' + total);
  await page.locator('#none').click();
  for (let i = 0; i < 10; i++) await page.locator('#words input').nth(i).check();
  assert.equal(await page.locator('#selectedCount').innerText(), 'Выбрано 10 из ' + total);
  assert.match(await page.locator('#wordsDone').innerText(), /Тренировать выбранные \(10\)/);
  const chosen = await page.evaluate(() => selectedWords().map(w => w.id).sort());
  await page.locator('#wordsDone').click();
  assert.match(await page.locator('#lwStatus').innerText(), /Выбрано: 10 из/);
  for (const mode of ['quiz', 'spell', 'truefalse', 'builder']) {
    await page.goto(BASE + '#/lesson/6/m1'); await page.locator('#launcher').waitFor();
    await page.locator('#launcher .mode[data-mode=' + mode + ']').click();
    const used = await page.evaluate(() => game.words.map(w => w.id));
    assert.ok(used.length && used.every(id => chosen.includes(id)), mode + ' uses only the 10 chosen words');
  }
  // switch to all words and back to my chosen 10 — the choice is not lost
  await page.goto(BASE + '#/lesson/6/m1'); await page.locator('#lessonWords').waitFor();
  await page.locator('#all').click();
  assert.equal(await page.evaluate(() => selectedWords().length), total);
  await page.locator('#lwMine').click();
  assert.deepEqual(await page.evaluate(() => selectedWords().map(w => w.id).sort()), chosen);
  ok('word choice: «Выбрано 10 из ' + total + '», «Тренировать выбранные (10)», 4 games use only them; all ↔ chosen keeps the choice');

  /* 3. Too few words: the lesson explains it in plain words */
  await page.goto(BASE + '#/lesson/6/m1/words'); await page.locator('#none').click(); await page.locator('#words input').first().check();
  await page.goto(BASE + '#/lesson/6/m1');
  assert.match(await page.locator('#lwNote').innerText(), /минимум 2 слова/);
  await page.locator('#launcher .mode[data-mode=quiz]').click();
  await page.locator('.lx-notice').waitFor(); assert.match(await page.locator('.lx-notice').innerText(), /минимум два слова/i);
  await page.locator('.lx-notice button', { hasText: 'Закрыть' }).click();
  await page.goto(BASE + '#/lesson/6/m1/words');
  for (let i = 0; i < 10; i++) await page.locator('#words input').nth(i).check();
  ok('1 chosen word: the lesson says which games need 2 or 3 words; quiz shows a friendly explanation');

  /* 4. Hard words: mark ☆, train only them, they survive reload, unmark */
  const hardIds = [];
  for (const i of [0, 2, 4]) { await page.locator('#words .wordrow').nth(i).locator('.star-btn').click(); hardIds.push(await page.locator('#words .wordrow').nth(i).getAttribute('data-id')); }
  assert.equal(await page.locator('#words .wordrow.is-hard').count(), 3);
  assert.equal(await page.locator('#words .wordrow').nth(0).locator('input').isChecked(), true, 'the star does not toggle the checkbox');
  await page.reload(); await page.locator('#words .wordrow').first().waitFor();
  assert.equal(await page.locator('#words .wordrow.is-hard').count(), 3, 'hard words survive reload');
  await page.goto(BASE + '#/lesson/6/m1');
  await page.locator('#lwHard').click();
  assert.deepEqual(await page.evaluate(() => selectedWords().map(w => w.id).sort()), [...hardIds].sort());
  await page.locator('#launcher .mode[data-mode=spell]').click();
  assert.ok((await page.evaluate(() => game.words.map(w => w.id))).every(id => hardIds.includes(id)), 'game uses only hard words');
  await page.goto(BASE + '#/home');
  await page.locator('.desk-hard').waitFor();
  assert.match(await page.locator('.desk-hard').innerText(), /3 слова для повторения/);
  await page.locator('.desk-hard button', { hasText: 'Повторить' }).click();
  await page.waitForURL(/#\/lesson\/6\/m1\/play\/mixed$/);
  assert.ok((await page.evaluate(() => game.words.map(w => w.id))).every(id => hardIds.includes(id)), 'home «Повторить» trains only the hard words of that module');
  // 3 right answers in a row → the word leaves the list
  await page.evaluate(id => { const w = scope.find(x => x.id === id); record(w, true); record(w, true); record(w, true); }, hardIds[0]);
  assert.equal(!!(await storage(page, 'lexigo_hard_words_v1'))[hardIds[0]], false, 'learned word leaves «Сложные слова»');
  ok('hard words: ☆ in the list, kept after reload, «★ Сложные» set, home block «3 слова для повторения» → «Повторить», auto-removed after 3 right answers');

  /* 5. Favourite modules: add from two classes, quick links on home, main class unchanged */
  await page.goto(BASE + '#/course/6/2'); await page.locator('#favToggle').click();
  assert.equal(await page.locator('#favToggle').getAttribute('aria-pressed'), 'true');
  await page.goto(BASE + '#/course/5/3'); await page.locator('#favToggle').click();
  assert.equal((await storage(page, 'lexigo_my_class_v1')).grade, 6, 'a favourite from 5th grade does not change the class');
  await page.goto(BASE + '#/home'); await page.locator('.fav-list').waitFor();
  assert.equal(await page.locator('.fav-list li').count(), 2);
  await page.locator('.fav-link').filter({ hasText: /^5/ }).click();
  await page.waitForURL(/#\/course\/5\/3$/);
  await page.locator('#favToggle').click(); // remove with one tap
  await page.goto(BASE + '#/home'); assert.equal(await page.locator('.fav-list li').count(), 1);
  ok('favourites: ☆ on modules of 6th and 5th grade, «Мои модули» on home, one-tap remove, class stays 6');

  /* 6. Temporary class switch: open Spotlight 5 lesson, main class stays 6; explicit change works */
  await page.goto(BASE + '#/course/5/0');
  assert.match(await page.locator('#classBar').innerText(), /Твой класс — 6, он не изменится/);
  await page.locator('#lessonCards a.lesson-card').nth(1).click(); await page.locator('#launcher').waitFor();
  await page.goto(BASE + '#/home');
  assert.match(await page.locator('.desk-class').innerText(), /6 класс/);
  assert.match(await page.locator('.lexi-hero .hero-go').innerText(), /5 класс/, 'continue shows the last opened lesson (5th grade)');
  assert.equal(await page.locator('.desk-continue').count(), 0, 'one «continue» action: the lemon button, no duplicate card');
  await page.locator('.desk-class a.btn').click(); await page.waitForURL(/#\/course\/6\/0$/);
  ok('temporary 5th grade: main class stays 6 on home and «Открыть уроки» leads to Spotlight 6; continue card points to the 5th-grade lesson');

  /* 7. Return visit: new tab / reload → greeting, continue card, honest «unfinished» */
  await page.goto(BASE + '#/lesson/6/m1/play/builder'); await page.locator('#play .builder-bank').waitFor();
  const ctx = page.context(); const p2 = await ctx.newPage(); p2.on('pageerror', e => errors.push(e.message));
  await p2.goto(BASE + '#/home'); await p2.locator('.lexi-desk').waitFor();
  assert.match(await p2.locator('.lexi-hero-sub').innerText(), /С возвращением! Продолжим учить слова\?/);
  // 2026-11-04: одно действие — лимонная кнопка; модуль большой (раунды), поэтому «дальше по словам», а не «сначала»
  assert.equal(await p2.locator('.desk-continue').count(), 0);
  assert.match(await p2.locator('.lexi-hero .hero-go').innerText(), /Продолжить/);
  assert.match(await p2.locator('.lexi-hero .hero-go small').innerText(), /Конструктор слов, дальше по словам/);
  assert.match(await p2.locator('.desk-device').innerText(), /на этом устройстве/, 'honest note: stored on this device only');
  await p2.locator('.lexi-hero .hero-go').click();
  await p2.waitForURL(/#\/lesson\/6\/m1\/play\/builder$/);
  assert.equal(await p2.evaluate(() => game?.mode), 'builder');
  ok('return visit: «С возвращением! Продолжим учить слова?», the lemon «Продолжить» says «Конструктор слов, дальше по словам» → opens it');
  await ctx.close();

  /* 8. Old saved selection format (array of ids) is still read */
  page = await fresh();
  await page.goto(BASE + '#/home');
  const legacy = await page.evaluate(() => { const b = DB.books.find(x => x.grade === 4); const ids = b.sections[3].words.slice(0, 5).map(w => w.id); localStorage.setItem('lexigo_word_selection_v1', JSON.stringify({ '4:3': ids })); return ids; });
  await page.goto(BASE + '#/lesson/4/3'); await page.locator('#launcher').waitFor();
  assert.deepEqual(await page.evaluate(() => selectedWords().map(w => w.id)), legacy);
  ok('earlier saved word choices (old format) are kept');
  await page.context().close();

  /* 9. Mobile: iPhone viewport, no horizontal scroll on home / words / lesson */
  const engines = [['chromium', browser]];
  if (process.env.LEXIGO_WEBKIT) engines.push(['webkit', await webkit.launch()]);
  for (const [name, b] of engines) {
    const { defaultBrowserType, ...iphone } = devices['iPhone 13'];
    const m = await fresh(b, iphone);
    await m.goto(BASE + '#/home'); await m.locator('.class-picker button', { hasText: /^7$/ }).click(); await m.waitForURL(/#\/course\/7\/0$/);
    await m.goto(BASE + '#/course/7/1'); await m.locator('#favToggle').click();
    await m.goto(BASE + '#/lesson/7/m1/words'); await m.locator('#words .star-btn').first().click();
    await m.goto(BASE + '#/lesson/7/m1'); await m.locator('#lessonWords').waitFor();
    for (const path of ['#/home', '#/lesson/7/m1/words', '#/lesson/7/m1', '#/course/7/1']) {
      await m.goto(BASE + path); await m.waitForTimeout(150);
      const over = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(over <= 1, name + ' ' + path + ' overflows by ' + over + 'px');
    }
    await m.goto(BASE + '#/home');
    for (const sel of ['.desk-class', '.desk-favs', '.desk-hard', '.lexi-hero .hero-go']) assert.ok(await m.locator(sel).isVisible(), sel + ' visible on ' + name);
    await m.screenshot({ path: 'test-results/personal-home-' + name + '.png', fullPage: true }).catch(() => {});
    ok(name + ' iPhone: home desk, ☆ words, word set and favourites work without horizontal scroll');
    await m.context().close(); if (b !== browser) await b.close();
  }
  assert.deepEqual(errors, [], 'no page errors');
  console.log('personal: all scenarios passed');
} finally { await browser.close(); }
