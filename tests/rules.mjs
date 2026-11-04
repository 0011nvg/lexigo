// LEXI (2026-11-02, evening): games right after the word set, single words only in the word builder and the audio dictation,
// lean teacher materials (no «train» block, no time limit, words chosen inside), «Верно / неверно» reactions, Lexi speaks English.
import assert from 'node:assert/strict';
import { chromium } from './browser-runtime.mjs';

// 2026-11-03: a right answer moves on by itself; a wrong one waits for «Следующее»
async function nextQ(page) { await page.waitForFunction(() => !game || !game.answered || document.querySelector('#play .lesson-result') || [...document.querySelectorAll('#play button:not([disabled])')].some(b => /Следующее|Результат/.test(b.textContent))); const b = page.locator('#play button:not([disabled])', { hasText: /Следующее|Результат/ }).first(); if (await b.count()) await b.click(); }

const BASE = process.env.LEXIGO_URL || 'http://127.0.0.1:4173/index.html';
const browser = await chromium.launch({ headless: true });
const errors = [];
const ok = m => console.log('  ✓ ' + m);
async function fresh(opts = { viewport: { width: 1280, height: 900 } }) {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/supabase\.co/, r => r.abort());
  return page;
}
try {
  let page = await fresh();
  await page.goto(BASE + '#/home');

  /* 1. single word vs phrase: by structure, not by symbols */
  const verdict = await page.evaluate(() => Object.fromEntries(["don't", 'ice-cream', 'T-shirt', 'Mr.', 'Hello!', "baker's", 'get up', 'How are you?', 'a/an', '(to) swim', 'living room', 'Thank you!'].map(en => [en, isSingleWordEntry({ en })])));
  assert.deepEqual(verdict, { "don't": true, 'ice-cream': true, 'T-shirt': true, 'Mr.': true, 'Hello!': true, "baker's": true, 'get up': false, 'How are you?': false, 'a/an': false, '(to) swim': false, 'living room': false, 'Thank you!': false });
  ok('apostrophe and hyphen words are single words; phrases are recognised by their structure');

  /* 2. word builder and audio dictation: only single words; the phrases stay in the lesson and in other games */
  await page.goto(BASE + '#/lesson/2/0'); await page.locator('#launcher').waitFor();
  const lesson = await page.evaluate(() => ({ all: selectedWords().length, phrases: selectedWords().filter(w => !isSingleWordEntry(w)).map(w => w.id) }));
  assert.ok(lesson.phrases.length >= 3, 'the lesson has phrases');
  await page.locator('.mode[data-mode=builder]').click();
  const b = await page.evaluate(() => ({ words: game.words.map(w => w.id), single: game.words.every(isBuilderWord) }));
  assert.ok(b.single && b.words.every(id => !lesson.phrases.includes(id)), 'builder: no phrases');
  for (let i = 0; i < 3; i++) {
    const t = await page.evaluate(() => [...document.querySelectorAll('#play .builder-bank .builder-token')].map(x => x.textContent));
    const en = await page.evaluate(() => LexiWordBuilder.answer(game.words[game.index].en));
    assert.deepEqual([...t].sort(), [...en].sort(), 'tiles are exactly the letters of the word (case included): ' + en);
    assert.equal(await page.locator('#play .builder-line .builder-token').count(), 0, 'nothing is placed in advance');
    for (const ch of en) await page.locator('#play .builder-bank .builder-token:not([hidden])').filter({ hasText: new RegExp('^' + ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).first().click();
    await page.locator('#play .builder-tools button', { hasText: 'Проверить' }).click();
    await page.locator('#play .feedback').waitFor();
    assert.equal(await page.locator('#play .feedback').getAttribute('data-result'), 'ok', 'a correctly built word is accepted: ' + en);
    await nextQ(page);
  }
  await page.goto(BASE + '#/lesson/2/0'); await page.locator('.mode[data-mode=audio]').click();
  if (await page.evaluate(() => !!game)) assert.ok(await page.evaluate(() => game.words.every(isSingleWordEntry)), 'audio: no phrases');
  await page.goto(BASE + '#/lesson/2/0'); await page.locator('.mode[data-mode=quiz]').click();
  await page.goto(BASE + '#/lesson/2/0'); await page.locator('.mode[data-mode=cards]').click();
  // other games still use phrases: run quiz rounds until a phrase appears
  let phraseInQuiz = false;
  for (let i = 0; i < 8 && !phraseInQuiz; i++) { await page.goto(BASE + '#/home'); await page.goto(BASE + '#/lesson/2/0/play/quiz'); phraseInQuiz = await page.evaluate(ids => game.words.some(w => ids.includes(w.id)), lesson.phrases); }
  assert.ok(phraseInQuiz, 'phrases are still used in «Выбери перевод»');
  assert.equal(await page.evaluate(n => selectedWords().length === n, lesson.all), true, 'phrases are not removed from the lesson');
  ok('builder and audio dictation: single words only, tiles = letters of the word, nothing pre-placed; phrases stay in the lesson and in other games');

  /* 3. only phrases selected → friendly message, no game, a way back to the games */
  await page.goto(BASE + '#/lesson/2/0/words'); await page.locator('#none').click();
  await page.evaluate(ids => { for (const id of ids.slice(0, 3)) selected.add(id); renderWords(); }, lesson.phrases);
  await page.goto(BASE + '#/lesson/2/0'); await page.locator('.mode[data-mode=builder]').click();
  await page.locator('.lx-notice').waitFor(); assert.match(await page.locator('.lx-notice').innerText(), /только отдельные слова/);
  assert.equal(await page.evaluate(() => !!game), false);
  await page.locator('.lx-notice button', { hasText: 'Закрыть' }).click();
  assert.ok(await page.locator('.mode[data-mode=quiz]').isVisible(), 'the other games are right there');
  await page.locator('.mode[data-mode=quiz]').click(); assert.equal(await page.evaluate(() => game.mode), 'quiz');
  ok('only phrases chosen: «Конструктор» explains why and the student picks another game');

  /* 4. games right after the word set: no route step */
  await page.goto(BASE + '#/lesson/2/0'); await page.locator('#launcher').waitFor();
  assert.equal(await page.locator('.route-tools, .route-pickbar, .route-banner').count(), 0);
  assert.ok(await page.locator('#lessonWords').isVisible() && await page.locator('.mode[data-mode=spell]').isVisible());
  ok('lesson: word set, then all the games — no «Пройти по порядку / Выбрать игры»');

  /* 5. teacher: no «train» block, no time limit, words chosen inside the materials; mixed test has no timer */
  await page.goto(BASE + '#/lesson/6/m1/teacher'); await page.locator('#printTest').waitFor();
  assert.equal(await page.locator('#wordsDone').isVisible(), false, 'no «Тренировать» button for the teacher');
  assert.equal(await page.locator('#timeLimit').count(), 0, 'no time limit setting');
  assert.match(await page.locator('#teacherWordCount').innerText(), /все слова урока: \d+/);
  await page.locator('#teacherPickWords').click();
  assert.ok(await page.locator('#words .wordrow').first().isVisible(), 'the word list opens inside the teacher page');
  await page.locator('#none').click(); for (let i = 0; i < 6; i++) await page.locator('#words input').nth(i).check();
  assert.match(await page.locator('#wordsDone').innerText(), /Готово: 6 слов/);
  await page.locator('#wordsDone').click();
  assert.equal(await page.evaluate(() => document.body.dataset.page), 'teacher', 'stays on the teacher page');
  assert.match(await page.locator('#teacherWordCount').innerText(), /выбрано 6 из/);
  await page.fill('#gs5', '85'); await page.fill('#gs4', '70'); await page.fill('#gs3', '45'); await page.locator('#gsPartial').check();
  await page.evaluate(() => { window.print = () => {}; printTeacherTest(); });
  const teacherSheet = await page.evaluate(() => document.querySelector('#lexigoPrint .print-teacher').innerText);
  assert.match(teacherSheet, /Критерии оценивания для учителя/); assert.match(teacherSheet, /0,5 балла/); assert.match(teacherSheet, /85% и выше/);
  assert.equal(await page.evaluate(() => document.querySelectorAll('#lexigoPrint .print-question').length), 6);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('lexigo_grade_scale_v1')).p5), 85, 'the school scale is remembered');
  await page.goto(BASE + '#/lesson/6/m1/play/mixed');
  assert.equal(await page.evaluate(() => game.deadline), 0, 'no time limit in the mixed test');
  ok('teacher: words chosen inside «Материалы к уроку», no train block or timer, own grading scale with partial points');

  /* 6. «Верно / неверно»: right → short badge and auto-next, wrong → short useful explanation */
  await page.goto(BASE + '#/lesson/6/m1/play/truefalse'); await page.locator('#play .buttons .btn.good').waitFor();
  const st = await page.evaluate(() => ({ ru: game.words[game.index].ru, claim: document.querySelector('#play .question p[style]').textContent.trim(), i: game.index }));
  await page.locator('#play .buttons .btn', { hasText: st.claim === st.ru.trim() ? 'Верно' : 'Неверно' }).first().click();
  assert.ok(await page.locator('#play .feedback.fb-quick').isVisible());
  assert.equal(await page.locator('#play .feedback.fb-quick .learning-tip').isVisible(), false, 'no big green box with a long tip');
  assert.match(await page.locator('#play .feedback.fb-quick strong').innerText(), /Верно/);
  assert.ok(await page.locator('#play .buttons .btn.is-correct').count() === 1, 'the chosen button is marked with ✓ (not colour only)');
  await page.waitForFunction(i => game.index !== i, st.i);
  const st2 = await page.evaluate(() => ({ ru: game.words[game.index].ru, claim: document.querySelector('#play .question p[style]').textContent.trim(), en: game.words[game.index].en }));
  await page.locator('#play .buttons .btn', { hasText: st2.claim === st2.ru.trim() ? 'Неверно' : 'Верно' }).first().click();
  const why = await page.locator('#play .feedback.fb-tf .why').innerText();
  assert.ok(why.includes(st2.en) && why.includes(st2.ru.trim()), 'the explanation names the word and its meaning');
  assert.ok(await page.locator('#play button', { hasText: /Следующее/ }).isVisible());
  ok('«Верно / неверно»: right answer — badge, Lexi and the next task; wrong — a short explanation with the right pair');

  /* 7. Lexi speaks English on the home page; taps work on a phone; no line twice in a row; no autoplay sound */
  const phone = await fresh({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await phone.addInitScript(() => { window.__spoken = 0; const S = window.speechSynthesis; if (S) { const o = S.speak.bind(S); S.speak = u => { window.__spoken++; try { o(u); } catch { /* headless */ } }; } });
  await phone.goto(BASE + '#/home'); await phone.locator('.lexi-live-bubble.show').waitFor();
  assert.match(await phone.locator('.lexi-live-bubble b').innerText(), /[A-Za-z]/, 'the greeting is in English');
  assert.equal(await phone.evaluate(() => window.__spoken), 0, 'no sound without a tap');
  const lines = [];
  for (let i = 0; i < 5; i++) { await phone.locator('.lexi-live-hit').tap(); lines.push(await phone.locator('.lexi-live-bubble b').innerText()); }
  for (let i = 1; i < lines.length; i++) assert.notEqual(lines[i], lines[i - 1], 'no immediate repeat');
  const bubble = await phone.locator('.lexi-live-bubble').boundingBox(), go = await phone.locator('.lexi-hero .hero-go').boundingBox();
  const overlap = (a, c) => a.x < c.x + c.width && c.x < a.x + a.width && a.y < c.y + c.height && c.y < a.y + a.height;
  assert.equal(overlap(bubble, go), false, 'the bubble does not cover the main button');
  const textRects = await phone.evaluate(() => [...document.querySelectorAll('.lexi-hero-title, .lexi-hero-sub')].flatMap(n => { const out = [], tw = document.createTreeWalker(n, NodeFilter.SHOW_TEXT); while (tw.nextNode()) { const r = document.createRange(); r.selectNodeContents(tw.currentNode); out.push(...[...r.getClientRects()].map(x => ({ x: x.x, y: x.y, width: x.width, height: x.height }))); } return out; }));
  assert.ok(textRects.length && textRects.every(r => !overlap(bubble, r)), 'nor the greeting text');
  if (await phone.locator('.lexi-say').count()) { await phone.locator('.lexi-say').tap(); assert.equal(await phone.evaluate(() => window.__spoken), 1, '🔊 speaks only after a tap'); }
  ok('Lexi on the phone: English lines with a Russian hint, tap to talk, no repeats, no autoplay, bubble clear of buttons: ' + lines.join(' / '));

  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS rules: single words in builder/audio, no route step, lean teacher materials, «Верно / неверно», English Lexi');
} finally { await browser.close(); }
