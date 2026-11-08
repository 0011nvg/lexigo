// LEXI — «Конструктор слов» в браузере на учебниках Spotlight 2–9 (2026-11-02 v2).
// В каждом классе: урок с заглавными словами (дни, месяцы, страны) и урок со словами с повторяющимися буквами.
// В каждом задании плитки = буквы ответа; собранное по порядку слово засчитывается; ошибка — не засчитывается.
import assert from 'node:assert/strict';
import { chromium } from './browser-runtime.mjs';

// 2026-11-03: a right answer moves on by itself; a wrong one waits for «Следующее»
async function nextQ(page) { await page.waitForFunction(() => !game || !game.answered || document.querySelector('#play .lesson-result') || [...document.querySelectorAll('#play button:not([disabled])')].some(b => /Следующее|Результат/.test(b.textContent))); const b = page.locator('#play button:not([disabled])', { hasText: /Следующее|Результат/ }).first(); if (await b.count()) await b.click(); }

const BASE = process.env.LEXIGO_URL || 'http://127.0.0.1:4173/index.html';
const browser = await chromium.launch({ headless: true });
const errors = [];
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const multiset = a => [...a].sort().join('\u0001');
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(()=>document.addEventListener('lexigo:answer',e=>{window.builderLast={correct:e.detail.correct,text:e.detail.feedback.textContent}}));
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => { errors.push('alert: ' + d.message()); d.dismiss(); });
  await page.goto(BASE + '#/home');
  // lessons to test: per grade, the section with most capitalised words and the one with most repeated letters
  const plan = await page.evaluate(() => LEXIGO_DATA.books.flatMap(b => {
    const score = f => b.sections.map((s, i) => ({ i, n: s.words.filter(w => LexiWordBuilder.isBuilderWord(w) && f(LexiWordBuilder.answer(w.en))).length })).sort((x, y) => y.n - x.n)[0];
    const caps = score(a => /[A-Z]/.test(a)), reps = score(a => new Set(a.toLowerCase()).size < a.length);
    return [...new Set([caps.i, reps.i])].map(i => ({ grade: b.grade, i }));
  }));
  let questions = 0, capitals = 0, repeats = 0, wrongTried = 0;
  for (const { grade, i } of plan) {
    await page.goto(BASE + '#/home');
    await page.goto(BASE + `#/lesson/${grade}/${i}/play/builder`);
    await page.waitForFunction(() => typeof game !== 'undefined' && game && game.mode === 'builder');
    for (let k = 0; k < 40; k++) {
      if (await page.locator('#play .lesson-result').count()) break;
      const st = await page.evaluate(() => ({ idx: game.index, en: game.words[game.index].en, answer: LexiWordBuilder.answer(game.words[game.index].en), tiles: [...document.querySelectorAll('#play .builder-bank .builder-token')].map(b => b.textContent), kind: !!document.querySelector('#play .builder-bank') }));
      assert.ok(st.kind, 'builder question for ' + st.en);
      assert.equal(multiset(st.tiles), multiset(Array.from(st.answer)), `Spotlight ${grade}: tiles of «${st.en}» = ${st.tiles.join(' ')}`);
      if (/[A-Z]/.test(st.answer)) capitals++;
      if (new Set(st.answer.toLowerCase()).size < st.answer.length) repeats++;
      const order = Array.from(st.answer);
      // once per lesson: a wrong order is not accepted
      const wrong = wrongTried < plan.length && new Set(order).size > 1 && k === 0;
      const seq = wrong ? order.slice().reverse() : order;
      if (wrong && seq.join('') === order.join('')) seq.push(seq.shift());
      for (const ch of seq) await page.locator('#play .builder-bank .builder-token:not([hidden])').filter({ hasText: new RegExp('^' + esc(ch) + '$') }).first().click();
      assert.equal(await page.locator('#play .builder-bank .builder-token:not([hidden])').count(), 0, 'every tile used exactly once');
      await page.evaluate(()=>window.builderLast=null);
      await page.locator('#play .builder-tools button', { hasText: 'Проверить' }).click();
      await page.waitForFunction(()=>window.builderLast!==null);
      const feedback=await page.evaluate(()=>window.builderLast);
      assert.equal(feedback.correct,!wrong,(wrong?'wrong order rejected: ':'accepted: ')+st.answer);
      if (wrong) { wrongTried++; assert.match(feedback.text, new RegExp('Правильный порядок: «' + esc(st.answer) + '»')); }
      questions++;
      await nextQ(page);
    }
    await page.locator('#play .lesson-result').waitFor();
  }
  assert.ok(capitals > 5 && repeats > 20, `capitals ${capitals}, repeated letters ${repeats}`);
  assert.deepEqual(errors, []);
  console.log(`PASS builder in the browser: ${plan.length} Spotlight lessons (grades 2–9), ${questions} questions, ${capitals} with capitals, ${repeats} with repeated letters, wrong order rejected ${wrongTried}×`);
} catch (e) { console.error('FAIL', e.message, errors.slice(0, 5)); process.exitCode = 1; } finally { await browser.close(); }
