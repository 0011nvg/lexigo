// LEXI (2026-11-03): words in sequential blocks, mode choice in «Весь учебник» and the final test,
// a right answer moves on at once (no explanation, no «Следующее») in every game, a wrong one keeps the explanation.
import assert from 'node:assert/strict';
import { chromium } from './browser-runtime.mjs';
const balancedSize=n=>Math.ceil(n/Math.ceil(n/15));
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
/* answer the current question; returns the question kind */
async function answer(page, right = true) {
  const st = await page.evaluate(() => ({ kind: game.activeQuestionMode, en: game.words[game.index].en, ru: game.words[game.index].ru, idx: game.index }));
  if (await page.locator('#play .builder-bank').count()) {
    const ans = await page.evaluate(() => LexiWordBuilder.answer(game.words[game.index].en));
    const seq = [...ans]; if (!right) seq.reverse();
    for (const ch of seq) await page.locator('#play .builder-bank .builder-token:not([hidden])').filter({ hasText: new RegExp('^' + esc(ch) + '$') }).first().click();
    if (!right && seq.join('') === ans) { await page.locator('#play .builder-tools button', { hasText: /Стереть|Очистить|←/ }).first().click().catch(() => {}); }
    await page.locator('#play .builder-tools button', { hasText: 'Проверить' }).click();
  } else if (await page.locator('#play .answerbox input:not([disabled])').count()) {
    await page.locator('#play .answerbox input').fill(right ? st.en : 'zzzz'); await page.keyboard.press('Enter');
  } else if (await page.locator('#play .buttons .btn.good').count()) {
    const claim = await page.evaluate(() => document.querySelector('#play .question p[style]')?.textContent || '');
    const truth = claim.trim() === st.ru.trim();
    await page.locator('#play .buttons .btn', { hasText: truth === right ? 'Верно' : 'Неверно' }).first().click();
  } else if (await page.locator('#play .card, #play .flashcard, #play [data-card]').count() && st.kind === 'cards') {
    await page.locator('#play button', { hasText: right ? /Знаю/ : /Учу|Не знаю|Повтор/ }).first().click();
  } else {
    const want = st.kind === 'listen' ? st.en : st.ru;
    const opts = page.locator('#play .options button');
    if (right) await opts.filter({ hasText: new RegExp('^\\s*' + esc(want) + '\\s*$') }).first().click();
    else await opts.filter({ hasNotText: new RegExp('^\\s*' + esc(want) + '\\s*$') }).first().click();
  }
  return st;
}
async function playRound(page) {
  for (let i = 0; i < 60 && !(await page.locator('#play .lesson-result, #play .pair-finish').count()); i++) {
    if (await page.evaluate(() => game.mode === 'pairs')) {
      const words = await page.evaluate(() => game.words.map(w => [w.en, w.ru]));
      for (const [en, ru] of words) { await page.getByRole('button', { name: 'Английское слово: ' + en, exact: true }).click(); await page.getByRole('button', { name: 'Перевод: ' + ru, exact: true }).click(); }
      continue;
    }
    if (await page.evaluate(() => game.mode === 'cards')) { await page.locator('#play button', { hasText: /Знаю/ }).first().click(); continue; }
    await answer(page, true);
    await page.waitForFunction(() => !game || !game.answered || document.querySelector('#play .lesson-result'), null, { timeout: 4000 });
  }
  await page.locator('#play .lesson-result, #play .pair-finish').first().waitFor();
}

try {
  /* 1. a right answer: short «✓ Верно!», no explanation, no «Следующее», the next task opens by itself — in every game */
  let page = await fresh();
  await page.goto(BASE + '#/lesson/5/0'); await page.locator('#launcher').waitFor();
  const seenKinds = new Set();
  for (const types of [['quiz'], ['truefalse'], ['listen'], ['builder'], ['spell'], ['audio']]) {
    await page.evaluate(t => start('mixed', selectedWords().filter(isLexicalEntry).filter(isBuilderWord).slice(0, 6), t), types);
    const st = await answer(page, true);
    seenKinds.add(st.kind);
    const fb = page.locator('#play .feedback');
    assert.equal(await fb.getAttribute('data-result'), 'ok', st.kind + ': accepted');
    assert.match(await fb.innerText(), /^\s*✓ Верно!\s*$/, st.kind + ': only a short «✓ Верно!» — no explanation');
    assert.equal(await page.locator('#play .learning-tip:visible, #play .why').count(), 0, st.kind + ': no learning tip after a right answer');
    assert.equal(await page.locator('#play button', { hasText: /Следующее|Результат/ }).count(), 0, st.kind + ': no «Следующее» button');
    const t0 = Date.now();
    await page.waitForFunction(i => game.index !== i, st.idx, { timeout: 2000 });
    assert.ok(Date.now() - t0 < 1500, st.kind + ': next task within a moment');
    /* a wrong answer keeps the right answer and the «Следующее» button */
    const w = await answer(page, false);
    assert.equal(await page.locator('#play .feedback').getAttribute('data-result'), 'miss', w.kind + ': wrong answer rejected');
    assert.ok(await page.locator('#play button', { hasText: /Следующее|Результат/ }).isVisible(), w.kind + ': «Следующее» after a mistake');
  }
  assert.ok(seenKinds.size >= 6, 'checked kinds: ' + [...seenKinds].join(', '));
  ok('right answer → «✓ Верно!» and the next task at once (no explanation) in ' + [...seenKinds].join(', ') + '; wrong answer → explanation and «Следующее»');

  /* final test too */
  await page.evaluate(() => start('boss', selectedWords().filter(isLexicalEntry).filter(w => /^[a-z]+$/i.test(w.en)).slice(0, 5), ['spell', 'quiz']));
  const b1 = await answer(page, true);
  assert.equal(await page.locator('#play button', { hasText: /Следующее|Результат/ }).count(), 0);
  await page.waitForFunction(i => game.index !== i, b1.idx, { timeout: 2000 });
  ok('final test: a right answer moves on by itself as well');

  /* 2. lesson with 123 words: round 1 = first 15 words, round 2 = next 15; counter and result card show the progress */
  page = await fresh();
  await page.goto(BASE + '#/lesson/5/0'); await page.locator('#launcher').waitFor();
  const pool = await page.evaluate(() => selectedWords().filter(isLexicalEntry).map(w => w.id));
  assert.ok(pool.length > 100, 'a big lesson');
  const size=balancedSize(pool.length);
  for (let r = 0; r < 2; r++) {
    if (r === 0) await page.locator('.mode[data-mode=quiz]').click();
    else await page.getByRole('button', { name: 'Следующий раунд →' }).click();
    const ids = await page.evaluate(() => game.words.map(w => w.id));
    assert.deepEqual([...ids].sort(), pool.slice(r * size, r * size + size).sort(), 'round ' + (r + 1) + ' = words ' + (r * 15 + 1) + '–' + (r * 15 + 15));
    assert.equal(await page.locator('#counter').getAttribute('data-round'), `${r * size} из ${pool.length} слов · Группа ${r + 1} из ${Math.ceil(pool.length / 15)} · ${size} слов`);
    await playRound(page);
    assert.match(await page.locator('.result-round').innerText(), new RegExp(`${(r + 1) * size} из ${pool.length} слов`));
  }
  ok('lesson of ' + pool.length + ' words: round 1 — first 15, round 2 — next 15; «N из M слов · Раунд k из n»; «Следующий раунд →»');

  /* interrupted round: resume where you stopped (after reload) */
  await page.locator('#back').click();
  await page.locator('.mode[data-mode=spell]').click();
  const firstSpell = await page.evaluate(() => game.words.map(w => w.id));
  for (let i = 0; i < 4; i++) { await answer(page, true); await page.waitForFunction(i => game.index > i, i); }
  const answered = await page.evaluate(() => game.words.slice(0, 4).map(w => w.id));
  await page.goto(BASE + '#/home'); await page.reload();
  await page.goto(BASE + '#/lesson/5/0'); await page.locator('#launcher').waitFor();
  await page.locator('.mode[data-mode=spell]').click();
  const resumed = await page.evaluate(() => game.words.map(w => w.id));
  assert.ok(answered.every(id => !resumed.includes(id)), 'answered words are not asked again');
  assert.ok(firstSpell.filter(id => !answered.includes(id)).every(id => resumed.includes(id)), 'the rest of the interrupted round comes first');
  assert.equal(await page.locator('#counter').getAttribute('data-round'), `4 из ${pool.length} слов · Группа 1 из ${Math.ceil(pool.length / 15)} · ${size} слов`);
  ok('interrupted round continues after a reload: 4 answered words are not repeated, the other 11 come first');

  /* other games keep their own progress */
  await page.locator('#back').click(); await page.locator('.mode[data-mode=truefalse]').click();
  assert.deepEqual((await page.evaluate(() => game.words.map(w => w.id))).sort(), pool.slice(0, size).sort(), 'another game starts from its own round 1');
  ok('each game has its own progress through the set');

  /* 3. last partial round, then the whole cycle; pairs = field size (9); edge: small lesson has no rounds */
  page = await fresh();
  await page.goto(BASE + '#/lesson/5/0'); await page.locator('#launcher').waitFor();
  const r3 = await page.evaluate(() => {
    const ws = selectedWords().filter(isLexicalEntry), key = lessonRoundKey('spell');
    ws.slice(0, ws.length - 5).forEach(w => LexiRounds.mark(key, w.id));
    start('spell');
    return { n: game.words.length, ids: game.words.map(w => w.id), tail: ws.slice(-5).map(w => w.id), label: document.getElementById('counter').dataset.round };
  });
  assert.equal(r3.n, 5, 'the last round has only the 5 words that are left');
  assert.deepEqual([...r3.ids].sort(), [...r3.tail].sort());
  await playRound(page);
  assert.match(await page.locator('.result-round').innerText(), /Все слова пройдены/);
  assert.ok(await page.getByRole('button', { name: 'Пройти все слова заново' }).isVisible());
  await page.getByRole('button', { name: 'Пройти все слова заново' }).click();
  assert.deepEqual((await page.evaluate(() => game.words.map(w => w.id))).sort(), pool.slice(0, size).sort(), 'a new cycle starts from the first words');
  ok('last partial round (5 words) → «Все слова пройдены» → «Пройти все слова заново» starts again from the first 15');
  await page.locator('#back').click(); await page.locator('.mode[data-mode=pairs]').click();
  assert.equal(await page.evaluate(() => game.words.length), 9, 'pairs: 9 pairs on the field');
  await page.goto(BASE + '#/lesson/2/0'); await page.locator('#launcher').waitFor();
  const small = await page.evaluate(() => { start('quiz'); return { n: game.words.length, all: selectedWords().filter(isLexicalEntry).length, round: game.round }; });
  assert.equal(small.n, small.all); assert.equal(small.round, null);
  ok('pairs take 9 words (field size); a small lesson (' + small.all + ' words) is played whole, without rounds');

  /* 4. «Весь учебник»: tiles with progress, «Несколько игр» (choose one / several / all), final test with the type picker */
  page = await fresh();
  await page.goto(BASE + '#/course/6/0');
  await page.locator('#wholeBookOpen').click();
  await page.locator('.wb-mode[data-wb-mode=mixed]').waitFor();
  const book6 = await page.evaluate(() => { const seen = new Set(); return LEXIGO_DATA.books.find(b => b.grade == 6).sections.flatMap(s => s.words).filter(w => isLexicalEntry(w) && !seen.has(w.id) && seen.add(w.id)).map(w => w.id); });
  await page.locator('.wb-mode[data-wb-mode=mixed]').click();
  await page.getByRole('button', { name: 'Снять все' }).click();
  assert.ok(await page.getByRole('button', { name: 'Начать раунд →' }).isDisabled(), 'nothing chosen → cannot start');
  await page.locator('.wb-mix-setup .boss-type[data-type=truefalse]').click();
  await page.getByRole('button', { name: 'Начать раунд →' }).click();
  let g = await page.evaluate(() => ({ types: game.types, ids: game.words.map(w => w.id), mode: game.mode, grade: book.grade }));
  assert.deepEqual(g.types, ['truefalse'], 'one game');
  assert.equal(g.grade, 6, 'the book context follows the whole-book grade');
  assert.deepEqual([...g.ids].sort(), book6.slice(0, balancedSize(book6.length)).sort(), 'first 15 words of the book');
  await playRound(page);
  await page.getByRole('button', { name: 'Следующий раунд →' }).click();
  g = await page.evaluate(() => ({ ids: game.words.map(w => w.id), types: game.types }));
  assert.deepEqual([...g.ids].sort(), book6.slice(balancedSize(book6.length), balancedSize(book6.length)*2).sort(), 'the next 15 words of the BOOK (not of the lesson)');
  assert.deepEqual(g.types, ['truefalse']);
  await page.goto(BASE + '#/course/6/0'); await page.locator('#wholeBookOpen').click();
  await page.locator('.wb-mode[data-wb-mode=mixed]').click();
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.wb-mix-setup .boss-type[aria-pressed=true]')].map(b => b.dataset.type)), ['truefalse'], 'the choice is kept for this session');
  await page.locator('.wb-mix-setup .boss-type[data-type=spell]').click(); await page.locator('.wb-mix-setup .boss-type[data-type=quiz]').click();
  await page.getByRole('button', { name: 'Начать раунд →' }).click();
  g = await page.evaluate(() => ({ types: game.types, kinds: [], ids: game.words.map(w => w.id) }));
  assert.deepEqual(g.types, ['quiz', 'truefalse', 'spell'], 'several games');
  const kinds = new Set();
  for (let i = 0; i < 6; i++) { const st = await answer(page, true); kinds.add(st.kind); await page.waitForFunction(i => game.index !== i, st.idx); }
  assert.deepEqual([...kinds].sort(), ['quiz', 'spell', 'truefalse'], 'the chosen games alternate');
  await page.goto(BASE + '#/course/6/0'); await page.locator('#wholeBookOpen').click();
  await page.locator('.wb-mode[data-wb-mode=mixed]').click(); await page.getByRole('button', { name: 'Выбрать все' }).click();
  const allTypes = await page.locator('.wb-mix-setup .boss-type').count();
  await page.getByRole('button', { name: 'Начать раунд →' }).click();
  assert.equal(await page.evaluate(() => game.types.length), allTypes, 'all games');
  ok('«Весь учебник» → «Несколько игр»: one, several or all games; the choice is applied and kept; book words go 1–15, 16–30…');

  await page.goto(BASE + '#/course/6/0'); await page.locator('#wholeBookOpen').click();
  await page.locator('.wb-mode[data-wb-mode=boss]').click();
  await page.locator('.boss-setup h2', { hasText: 'Финальный тест' }).waitFor();
  assert.match(await page.locator('.boss-setup .boss-words').innerText(), /по 15 слов по порядку/);
  for (const t of ['builder', 'audio', 'quiz']) if ((await page.locator(`.boss-type[data-type=${t}]`).getAttribute('aria-pressed')) === 'true') await page.locator(`.boss-type[data-type=${t}]`).click();
  if ((await page.locator('.boss-type[data-type=truefalse]').getAttribute('aria-pressed')) !== 'true') await page.locator('.boss-type[data-type=truefalse]').click();
  await page.getByRole('button', { name: 'Начать тест →' }).click();
  g = await page.evaluate(() => ({ mode: game.mode, types: game.types, n: game.words.length }));
  assert.equal(g.mode, 'boss'); assert.deepEqual(g.types, ['truefalse']); assert.equal(g.n,await page.evaluate(()=>LexiRounds.groups(LEXIGO_DATA.books.find(b=>b.grade===6).sections.flatMap(s=>s.words).filter(w=>isLexicalEntry(w)&&isSingleVocabularyWord(w.en)),15)[0].length));
  ok('«Весь учебник» → «Финальный тест» opens the task-type picker, the chosen types are used, 15 words per round');

  /* 5. word-filtered games in the whole book: builder and audio only single words */
  await page.goto(BASE + '#/course/6/0'); await page.locator('#wholeBookOpen').click();
  await page.locator('.wb-mode[data-wb-mode=builder]').click();
  assert.ok(await page.evaluate(() => game.words.every(isBuilderWord)), 'builder: no phrases');
  ok('whole book: «Конструктор слов» gets only single words');

  /* 6. old whole-book progress is carried over */
  page = await fresh();
  await page.goto(BASE + '#/home');
  await page.evaluate(() => localStorage.setItem('lexigo_whole_book_v1_7_quiz', JSON.stringify(['s7_0', 's7_1', 's7_2'])));
  await page.goto(BASE + '#/course/7/0'); await page.locator('#wholeBookOpen').click();
  assert.match(await page.locator('.wb-mode[data-wb-mode=quiz] small').innerText(), /^3 из /);
  ok('old «по этапам» progress is carried over into rounds');

  /* 7. phone 360 px: dialogs fit */
  page = await fresh({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  await page.goto(BASE + '#/course/5/0'); await page.locator('#wholeBookOpen').click();
  await page.locator('.wb-mode[data-wb-mode=mixed]').click();
  const box = await page.locator('.wb-mix-setup .lx-notice-card').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 360, 'the dialog fits the phone screen');
  ok('phone 360 px: «Несколько игр» dialog fits');

  assert.deepEqual(errors, []);
  console.log('LEXI rounds, mode choice and instant next question: OK');
} finally { await browser.close(); }

