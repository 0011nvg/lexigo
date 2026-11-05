// LEXI (2026-11-03): «Весь учебник» keeps the chosen Spotlight everywhere — words, title, next round, result, reload, back.
// Regression for «выбрал Spotlight 5 — открылся Spotlight 2»: the book came from the last opened lesson (default Spotlight 2).
import assert from 'node:assert/strict';
import { chromium } from './browser-runtime.mjs';
const BASE = process.env.LEXIGO_URL || 'http://127.0.0.1:4173/index.html';
const browser = await chromium.launch({ headless: true });
const errors = [];
const ok = m => console.log('  ✓ ' + m);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
async function fresh(opts = { viewport: { width: 1280, height: 900 } }) {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => { errors.push('dialog: ' + d.message()); d.dismiss(); });
  await page.route(/supabase\.co/, r => r.abort());
  return page;
}
/* where every word of the running game comes from */
const state = page => page.evaluate(() => {
  const gradeOf = id => LEXIGO_DATA.books.find(b => b.sections.some(s => s.words.some(w => w.id === id)))?.grade;
  return { hash: location.hash, book: book.grade, wb: LexigoWholeBook.current && LexigoWholeBook.current.grade,
    grades: game ? [...new Set(game.words.map(w => gradeOf(w.id)))] : [], key: game && game.round ? game.round.key : null,
    crumbs: document.getElementById('breadcrumbs').textContent, title: document.getElementById('gameTitle').textContent };
});
function expectBook(st, g, mode, what) {
  assert.equal(st.hash, `#/book/${g}/play/${mode}`, what + ': address');
  assert.equal(st.book, g, what + ': lesson context');
  assert.equal(st.wb, g, what + ': whole-book context');
  assert.deepEqual(st.grades, [g], what + ': every word is from Spotlight ' + g);
  assert.equal(st.key, `B${g}|${mode}`, what + ': progress is kept for Spotlight ' + g);
  assert.match(st.crumbs, new RegExp(g + ' класс.*Весь учебник'), what + ': breadcrumbs');
}
async function finishRound(page) {
  for (let i = 0; i < 60 && !(await page.locator('#play .lesson-result').count()); i++) {
    const st = await page.evaluate(() => ({ ru: game.words[game.index].ru, idx: game.index }));
    await page.locator('#play .options button').filter({ hasText: new RegExp('^\\s*' + esc(st.ru) + '\\s*$') }).first().click();
    await page.waitForFunction(i => !game || game.index !== i || document.querySelector('#play .lesson-result'), st.idx);
  }
  await page.locator('#play .lesson-result').waitFor();
}
try {
  /* 1. every book 2–10, opened after a lesson of Spotlight 2 (the old default) */
  const page = await fresh();
  for (const g of [2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    await page.goto(BASE + '#/lesson/2/0'); await page.locator('#launcher').waitFor();
    await page.goto(BASE + `#/course/${g}/0`);
    await page.locator('#wholeBookOpen').click();
    await page.locator('.wb-mode[data-wb-mode=quiz]').click();
    expectBook(await state(page), g, 'quiz', 'Spotlight ' + g);
    const first = await page.evaluate(() => game.words.map(w => w.id));
    await finishRound(page);
    assert.match(await page.locator('.result-round').innerText(), new RegExp('15 из \\d+ слов'));
    await page.getByRole('button', { name: 'Следующий раунд →' }).click();
    const st = await state(page);
    expectBook(st, g, 'quiz', 'Spotlight ' + g + ' next round');
    assert.ok((await page.evaluate(() => game.words.map(w => w.id))).every(id => !first.includes(id)), 'next round — new words of the same book');
    await page.reload(); await page.waitForFunction(() => !!game);
    expectBook(await state(page), g, 'quiz', 'Spotlight ' + g + ' after reload');
    await page.locator('#back').click();
    assert.equal(await page.evaluate(() => location.hash), `#/course/${g}/0`, 'back → the same book');
    assert.equal(await page.locator('#courseTitle').innerText(), g + ' класс');
  }
  ok('Spotlight 2–10: words, title, progress, next round, reload and «назад» stay in the chosen book');

  /* 2. switches 2 → 5, 5 → 9, 9 → 3 with every kind of start (one game, several games, final test) */
  for (const [from, to, mode] of [[2, 5, 'mixed'], [5, 9, 'boss'], [9, 3, 'spell']]) {
    await page.goto(BASE + `#/course/${from}/0`); await page.locator('#wholeBookOpen').click();
    await page.locator('.wb-mode[data-wb-mode=truefalse]').click();
    expectBook(await state(page), from, 'truefalse', 'before switch');
    await page.goto(BASE + `#/course/${to}/0`); await page.locator('#wholeBookOpen').click();
    await page.locator(`.wb-mode[data-wb-mode=${mode}]`).click();
    if (mode === 'mixed') { await page.getByRole('button', { name: 'Выбрать все' }).click(); await page.getByRole('button', { name: 'Начать раунд →' }).click(); }
    if (mode === 'boss') { await page.locator('.boss-setup h2', { hasText: to + ' класс' }).waitFor(); await page.getByRole('button', { name: 'Начать тест →' }).click(); }
    expectBook(await state(page), to, mode, `switch ${from} → ${to} (${mode})`);
  }
  ok('switching 2 → 5, 5 → 9, 9 → 3 (several games, final test, one game): always the newly chosen book');

  /* 3. an old saved choice (my class = 2, last lesson in Spotlight 2) does not win over an explicit choice */
  const p2 = await fresh({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await p2.goto(BASE + '#/home');
  await p2.evaluate(() => { localStorage.setItem('lexigo_my_class_v1', '2'); localStorage.setItem('lexigo_last_activity_v1', JSON.stringify({ path: '/lesson/2/0', mode: 'quiz', done: true, at: Date.now() })); });
  await p2.reload();
  await p2.goto(BASE + '#/course/7/0'); await p2.locator('#wholeBookOpen').click();
  await p2.locator('.wb-mode[data-wb-mode=pairs]').click();
  expectBook(await state(p2), 7, 'pairs', 'saved Spotlight 2 vs explicit Spotlight 7 (phone)');
  ok('phone: an old saved Spotlight 2 does not replace the explicitly chosen Spotlight 7');

  /* 4. a wrong or missing book in the address never starts a random book */
  await p2.goto(BASE + '#/book/1/play/quiz'); await p2.waitForTimeout(300);
  assert.equal(await p2.evaluate(() => location.hash), '#/home'); assert.equal(await p2.evaluate(() => !!game), false);
  await p2.goto(BASE + '#/course/11/0'); await p2.waitForTimeout(300);
  assert.equal(await p2.evaluate(() => location.hash), '#/home', 'unknown book → choose a book on the home page, not Spotlight 2');
  await p2.goto(BASE + '#/book/6'); await p2.waitForTimeout(300);
  assert.equal(await p2.evaluate(() => location.hash), '#/course/6/0');
  ok('unknown book in the address → home page (choose a book); #/book/6 → Spotlight 6');

  /* 5. ordinary lessons still work as before */
  await page.goto(BASE + '#/lesson/4/0'); await page.locator('#launcher').waitFor();
  await page.locator('.mode[data-mode=quiz]').click();
  const les = await state(page);
  assert.match(les.hash, /^#\/lesson\/4\/0\/play\/quiz$/); assert.equal(les.wb, null); assert.deepEqual(les.grades, [4]);
  ok('lesson games keep their own address and words');

  assert.deepEqual(errors, []);
  console.log('LEXI whole-book context: OK');
} finally { await browser.close(); }
