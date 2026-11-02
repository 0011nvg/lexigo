// LEXI+ (2026-11-02): chosen words, games right after the word set, configurable final test, honest storage notes, mobile.
import assert from 'node:assert/strict';
import { chromium } from './browser-runtime.mjs';
const BASE = process.env.LEXIGO_URL || 'http://127.0.0.1:4173/index.html';
const browser = await chromium.launch({ headless: true });
const errors = [];
const ok = m => console.log('  ✓ ' + m);
async function fresh(viewport = { width: 1280, height: 900 }) {
  const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
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
  const next = page.locator('#play button:not([disabled])', { hasText: /Следующее|Результат/ }).first();
  await page.waitForFunction(i => !game || game.index !== i || document.querySelector('#play .lesson-result') || [...document.querySelectorAll('#play button:not([disabled])')].some(b => /Следующее|Результат/.test(b.textContent)), st.idx);
  if (await next.count()) await next.click();
};
async function finishRound(page) { for (let i = 0; i < 60 && !(await page.locator('#play .lesson-result').count()); i++) await solve(page); await page.locator('#play .lesson-result').waitFor(); }
try {
  /* 1. Choose 20 of 30 words: counter, games use only them, the choice is remembered */
  let page = await fresh();
  await page.goto(BASE + '#/lesson/4/3/words');
  await page.locator('#words input').first().waitFor();
  const total = await page.locator('#words input').count();
  for (let i = 0; i < total - 20; i++) await page.locator('#words input').nth(i).uncheck();
  assert.equal(await page.locator('#selectedCount').innerText(), 'Выбрано 20 из ' + total);
  assert.match(await page.locator('#wordsDone').innerText(), /Тренировать выбранные \(20\)/);
  const chosen = await page.evaluate(() => selectedWords().map(w => w.id).sort());
  await page.locator('#wordsDone').click();
  assert.match(await page.locator('#openWords').innerText(), /20 из/);
  assert.match(await page.locator('#selectionChip').innerText(), /20 из/);
  await page.locator('.mode[data-mode=quiz]').click();
  const used = await page.evaluate(() => game.words.map(w => w.id));
  assert.ok(used.every(id => chosen.includes(id)), 'quiz uses only chosen words');
  await page.reload(); await page.goto(BASE + '#/home'); await page.goto(BASE + '#/lesson/4/3');
  await page.locator('#launcher').waitFor();
  assert.deepEqual(await page.evaluate(() => selectedWords().map(w => w.id).sort()), chosen);
  ok('words: «Выбрано 20 из ' + total + '», games use only them, choice remembered after reload');

  /* 2. Edge cases: no words → friendly message, no game; one word → quiz explains the minimum */
  await page.goto(BASE + '#/lesson/4/3/words'); await page.locator('#none').click();
  assert.equal(await page.locator('#wordsDone').isDisabled(), true);
  await page.goto(BASE + '#/lesson/4/3'); await page.locator('.mode[data-mode=spell]').click();
  await page.locator('.lx-notice').waitFor(); assert.match(await page.locator('.lx-notice').innerText(), /выбери хотя бы одно слово/i);
  assert.equal(await page.evaluate(() => !!game), false);
  await page.locator('.lx-notice .btn', { hasText: 'Закрыть' }).click();
  await page.evaluate(() => { selected = new Set([scope.find(w => /^[a-z]+$/i.test(w.en)).id]); renderWords(); });
  await page.locator('.mode[data-mode=quiz]').click();
  await page.locator('.lx-notice').waitFor(); assert.match(await page.locator('.lx-notice').innerText(), /минимум два слова/);
  await page.locator('.lx-notice .btn', { hasText: 'Выбрать слова' }).click(); await page.waitForURL(/\/words$/);
  await page.locator('#all').click();
  ok('edge cases: empty choice blocked, one word → Lexi explains the minimum and offers to pick more');

  /* 3. Final test: chosen task types only, never crystals; chosen words; mistakes come back */
  await page.goto(BASE + '#/lesson/4/3'); await page.locator('.mode[data-mode=boss]').click();
  await page.locator('.boss-setup').waitFor();
  assert.equal(await page.locator('.boss-type[data-type=crystals]').count(), 0);
  for (const t of ['builder', 'quiz']) if ((await page.locator(`.boss-type[data-type=${t}]`).getAttribute('aria-pressed')) === 'true') await page.locator(`.boss-type[data-type=${t}]`).click();
  await page.locator('.boss-type[data-type=spell]').click();   // switch off the only writing task
  assert.equal(await page.locator('.boss-setup .btn', { hasText: 'Начать тест' }).isDisabled(), true);
  assert.match(await page.locator('.boss-msg').innerText(), /Напиши слово.*Аудиодиктант/);
  await page.locator('.boss-type[data-type=spell]').click();
  await page.locator('.boss-type[data-type=truefalse]').click();
  await page.locator('.boss-setup .btn', { hasText: 'Начать тест' }).click();
  const types = await page.evaluate(() => game.types.slice().sort());
  assert.deepEqual(types, ['fix', 'spell', 'truefalse']);
  const seen = new Set();
  for (let i = 0; i < 40 && !(await page.locator('#play .lesson-result').count()); i++) { seen.add(await page.evaluate(() => game.activeQuestionMode)); await solve(page); }
  assert.ok([...seen].every(m => ['fix', 'spell', 'truefalse'].includes(m)), 'only chosen task types: ' + [...seen]);
  // setting is remembered and used when the test is opened by link
  await page.goto(BASE + '#/lesson/4/3'); await page.goto(BASE + '#/lesson/4/3/play/boss'); await page.locator('#play .question').waitFor();
  assert.deepEqual(await page.evaluate(() => game.types.slice().sort()), ['fix', 'spell', 'truefalse']);
  ok('final test: chosen task types only (no crystals), needs one writing task, remembered for links');

  /* 4. No intermediate «route» step: the games are shown at once and one tap starts a game; the word set stays */
  await page.goto(BASE + '#/lesson/4/3'); await page.locator('#launcher').waitFor();
  assert.equal(await page.locator('.route-tools, .route-pickbar').count(), 0, 'no «Пройти по порядку / Выбрать игры»');
  const setBefore = await page.evaluate(() => selectedWords().map(w => w.id).sort());
  await page.locator('.mode[data-mode=quiz]').click();
  assert.equal(await page.evaluate(() => game.mode), 'quiz');
  assert.ok((await page.evaluate(() => game.words.map(w => w.id))).every(id => setBefore.includes(id)));
  await finishRound(page);
  await page.locator('#back').click(); await page.locator('.mode[data-mode=truefalse]').click();
  assert.equal(await page.evaluate(() => game.mode), 'truefalse');
  ok('games: shown right after the word set, one tap starts any game, the chosen words stay');

  /* 5. Interrupted test, then back: nothing breaks; storage note is honest for guests */
  await page.goto(BASE + '#/lesson/4/3/play/spell'); await solve(page); await page.locator('#back').click();
  await page.goto(BASE + '#/lesson/4/3/play/spell'); await page.locator('#play .question').waitFor();
  assert.match(await page.locator('#launcher .progress-note').textContent(), /на этом устройстве/);
  assert.doesNotMatch(await page.locator('body').innerText(), /в этом браузере/i);
  await page.goto(BASE + '#/lesson/4/3/teacher');
  assert.equal(await page.locator('#teacherPage .report h3').innerText(), 'Результаты практики');
  assert.equal(await page.locator('#homeNav').innerText(), 'Уроки');
  assert.match(await page.locator('#breadcrumbs').innerText(), /^Уроки/);
  ok('interrupted round restarts cleanly; "Уроки" in navigation; no "в этом браузере"');
  await page.close();

  /* 6. Phone: word list, picking, final-test settings, true/false — no horizontal scroll */
  page = await fresh({ width: 375, height: 740 });
  for (const route of ['#/lesson/4/3', '#/lesson/4/3/words', '#/lesson/4/3/play/truefalse', '#/lesson/4/3/teacher', '#/awards']) {
    await page.goto(BASE + route); await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'no horizontal scroll on ' + route);
  }
  await page.goto(BASE + '#/lesson/4/3/words');
  const box = await page.locator('#words input').first().boundingBox(); assert.ok(box.width >= 24 && box.height >= 24, 'large checkboxes');
  const row = await page.locator('#words .wordrow').first().boundingBox(); assert.ok(row.height >= 48, 'large tap area');
  await page.goto(BASE + '#/lesson/4/3/play/truefalse');
  const [a, b] = await page.locator('#play .buttons .btn').evaluateAll(n => n.map(x => { const r = x.getBoundingClientRect(); return [r.width, r.height]; }));
  assert.ok(Math.abs(a[0] - b[0]) < 2 && a[1] >= 56, 'true/false buttons equal and big');
  await page.goto(BASE + '#/lesson/4/3'); await page.locator('.mode[data-mode=boss]').click(); await page.locator('.boss-setup').waitFor();
  assert.equal(await page.evaluate(() => { const c = document.querySelector('.boss-setup .lx-notice-card').getBoundingClientRect(); return c.right <= innerWidth && c.left >= 0; }), true);
  ok('phone: no horizontal scroll, large checkboxes and buttons, test settings fit the screen');

  assert.deepEqual(errors, []);
  console.log('PASS plus: chosen words, several games, configurable final test, honest notes, phone');
} finally { await browser.close(); }
