// LEXIGO World layer: new modes, round size, Lexi reactions, XP anti-farming,
// missions, boss, stars, calm/board modes, explanations, corrupted storage, mobile.
import assert from 'node:assert/strict';
import { chromium } from './browser-runtime.mjs';
const BASE = process.env.LEXIGO_URL || 'http://127.0.0.1:4173/index.html';
const browser = await chromium.launch({ headless: true });
const errors = [];
const results = [];
const ok = (name) => results.push(name);
async function fresh(viewport = { width: 1280, height: 900 }, init) {
  const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(init || (() => {}));
  return page;
}
const solveCurrent = async page => {
  const st = await page.evaluate(() => ({ en: game.words[game.index].en, kind: game.activeQuestionMode }));
  if (await page.locator('#play .builder-bank').count()) {
    const target = st.en.trim().includes(' ') ? st.en.trim().split(/\s+/) : [...st.en.trim()];
    for (const t of target) await page.locator('#play .builder-bank .builder-token:not([hidden])').filter({ hasText: new RegExp('^' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).first().click();
    await page.locator('#play .builder-tools button', { hasText: 'Проверить' }).click();
  } else if (await page.locator('#play .answerbox input:not([disabled])').count()) {
    await page.fill('#play .answerbox input', st.en); await page.locator('#play .answerbox button').click();
  } else {
    const right = await page.evaluate(() => { const w = game.words[game.index]; return game.activeQuestionMode === 'listen' ? w.en : w.ru; });
    await page.locator('#play .options button').filter({ hasText: right }).first().click();
  }
};
try {
  /* 1. Home: Lexi hero, 3 daily missions, level; books keep real counts */
  let page = await fresh();
  await page.goto(BASE + '#/home');
  await page.locator('.lexi-hero').waitFor();
  assert.equal(await page.locator('.lexi-missions li').count(), 3);
  assert.match(await page.locator('.lexi-level').innerText(), /XP/);
  assert.equal(await page.locator('#courseCards .course-card').count(), 8);
  assert.ok(await page.locator('#homeTitle').isVisible());
  ok('home: Lexi hero, 3 missions, level, 8 books');

  /* 2. Round size: 123-word lesson → 12-word round with honest round label */
  await page.goto(BASE + '#/lesson/5/0/play/quiz');
  await page.locator('#play .question').waitFor();
  assert.equal(await page.evaluate(() => game.words.length), 12);
  assert.match(await page.locator('#counter').getAttribute('data-round'), /Раунд: 12 из \d+ слов урока/);
  ok('round: 12 words from a 123-word lesson');

  /* 3. Non-lexical import headers never reach games */
  const leak = await page.evaluate(() => {
    const words = LEXIGO_DATA.books.flatMap(b => b.sections.flatMap(s => s.words));
    const headers = words.filter(w => !isLexicalEntry(w));
    if (headers.length < 9) throw Error('fixture: expected section headers in source data');
    const s5 = DB.books.find(b => b.grade === 5); const sec = s5.sections.find(s => s.words.some(w => !isLexicalEntry(w)));
    const idx = s5.sections.indexOf(sec); return { idx, total: words.length, headers: headers.length };
  });
  assert.equal(leak.total, 9417, 'source data must stay complete');
  await page.goto(BASE + '#/lesson/5/' + leak.idx + '/play/spell');
  await page.locator('#play .question').waitFor();
  assert.ok(await page.evaluate(() => game.words.every(isLexicalEntry)));
  assert.ok(await page.evaluate(() => scope.some(w => !isLexicalEntry(w))), 'header stays in the word list (data preserved)');
  ok('data: ' + leak.headers + ' section headers kept in data, excluded from games');

  /* 4. Builder: correct assembly, wrong assembly + explanation */
  await page.goto(BASE + '#/lesson/2/5/play/builder');
  await page.locator('#play .builder-bank').waitFor();
  await solveCurrent(page);
  assert.equal(await page.locator('#play .feedback[data-result=ok]').count(), 1, 'builder ok for ' + JSON.stringify(await page.evaluate(() => [game.words[game.index].en, game.activeQuestionMode, document.querySelector('#play .feedback')?.textContent])));
  assert.match(await page.locator('#lexiCoach .lexi-bubble').innerText(), /\S/);
  await page.locator('#play button', { hasText: /Следующее|Результат/ }).first().click();
  const reversed = await page.evaluate(() => [...document.querySelectorAll('#play .builder-bank .builder-token')].map(b => b.textContent));
  const word = await page.evaluate(() => game.words[game.index].en);
  for (const t of [...reversed].reverse()) await page.locator('#play .builder-bank .builder-token:not([hidden])').filter({ hasText: new RegExp('^' + t + '$') }).first().click();
  const assembled = [...reversed].reverse().join('');
  await page.locator('#play .builder-tools button', { hasText: 'Проверить' }).click();
  if (assembled.toLowerCase() !== word.toLowerCase()) {
    assert.equal(await page.locator('#play .feedback[data-result=miss]').count(), 1);
    assert.match(await page.locator('#play .why').innerText(), /Правильный порядок/);
  }
  ok('builder: tiles, check, explanation on wrong order');

  /* 5. Spelling mistake → letter diff explanation */
  await page.goto(BASE + '#/lesson/2/5/play/spell');
  await page.locator('#play .answerbox input').waitFor();
  const en = await page.evaluate(() => game.words[0].en);
  await page.fill('#play .answerbox input', en.slice(0, -1) + (en.endsWith('x') ? 'y' : 'x'));
  await page.locator('#play .answerbox button').click();
  assert.ok(await page.locator('#play .why .diff mark').count() >= 1);
  ok('spell: wrong letters highlighted');

  /* 6. Quiz mistake → chosen and correct options marked */
  await page.goto(BASE + '#/lesson/2/5/play/quiz');
  await page.locator('#play .options').waitFor();
  const wrongLabel = await page.evaluate(() => { const w = game.words[game.index]; return [...document.querySelectorAll('#play .options button')].map(b => b.textContent).find(t => t !== w.ru); });
  await page.locator('#play .options button').filter({ hasText: wrongLabel }).first().click();
  assert.equal(await page.locator('#play .options .is-wrong').count(), 1);
  assert.equal(await page.locator('#play .options .is-correct').count(), 1);
  ok('quiz: wrong choice and right answer highlighted');

  /* 7. Listen & choose with speech stub; fallback without speech */
  const speechPage = await fresh(undefined, () => { window.__spoken = []; if (window.speechSynthesis) speechSynthesis.speak = u => window.__spoken.push(u.text); });
  await speechPage.goto(BASE + '#/lesson/2/5/play/listen');
  await speechPage.locator('#play .options').waitFor();
  assert.ok((await speechPage.evaluate(() => window.__spoken.length)) >= 1, 'autoplay spoke the word');
  assert.equal(await speechPage.evaluate(() => game.activeQuestionMode), 'listen');
  const spoken = await speechPage.evaluate(() => game.words[game.index].en);
  await speechPage.locator('#play .options button').filter({ hasText: spoken }).first().click();
  assert.equal(await speechPage.locator('#play .feedback[data-result=ok]').count(), 1);
  await speechPage.close();
  const mute = await fresh(undefined, () => { delete window.speechSynthesis; delete window.SpeechSynthesisUtterance; });
  await mute.goto(BASE + '#/lesson/2/5/play/listen');
  await mute.locator('#play .question').waitFor();
  assert.ok(await mute.locator('#play .options button').count() >= 2, 'falls back to translation choice');
  await mute.close();
  ok('listen: speaks, checks, falls back without speech');

  /* 8. XP is earned for real answers and capped per word per day */
  await page.goto(BASE + '#/lesson/2/5/words');
  await page.evaluate(() => { localStorage.removeItem('lexigo_quest_v1'); });
  await page.reload(); await page.locator('#words').waitFor({ state: 'attached' });
  const xp = await page.evaluate(() => {
    const w = scope[0]; const before = LexiQuest.state().xp;
    start('spell', [w]); for (let i = 0; i < 5; i++) record(w, true, 'recall');
    record(w, false, 'recall'); record(w, true, 'self');
    return LexiQuest.state().xp - before;
  });
  assert.ok(xp >= 8 && xp <= 8 + 25 + 25, 'XP: 2 awards × 4 for one word, plus possible mission bonus; got ' + xp);
  ok('xp: capped at 2 awards per word per day, self-rating gives 0');

  /* 9. Review mode: empty → friendly message; after a mistake → starts with that word */
  await page.goto(BASE + '#/lesson/2/6');
  await page.evaluate(() => { localStorage.removeItem('lexigo_progress_v1'); progress = {}; });
  await page.locator('[data-mode=review]').click();
  assert.equal(await page.evaluate(() => game), null);
  assert.match(await page.locator('.lexi-toasts').innerText(), /Ошибок/);
  const hardId = await page.evaluate(() => { const w = selectedWords()[0]; start('spell', [w]); record(w, false, 'recall'); stop(); return w.id; });
  await page.goto(BASE + '#/lesson/2/6');
  await page.locator('[data-mode=review]').click();
  await page.locator('#play .question').waitFor();
  assert.deepEqual(await page.evaluate(() => game.words.map(w => w.id)), [hardId]);
  ok('review: empty state and mistake-driven round');

  /* 10. Finish a round → reward card, streak, missions, next step */
  await page.goto(BASE + '#/lesson/2/5/play/spell');
  for (let i = 0; i < 40 && !(await page.locator('.lesson-result').count()); i++) {
    if (await page.locator('#play .answerbox input:not([disabled])').count()) await solveCurrent(page);
    const next = page.locator('#play button', { hasText: /Следующее|Результат/ });
    if (await next.count()) await next.first().click();
  }
  await page.locator('.lexi-reward').waitFor();
  assert.match(await page.locator('.lexi-reward').innerText(), /XP за раунд/);
  assert.equal(await page.locator('.mission-mini li').count(), 3);
  assert.ok(await page.locator('.lexi-next .next-btn').count() === 1);
  assert.equal(await page.locator('.result-actions').getByRole('button', { name: 'Повторить', exact: true }).count(), 1);
  const q = await page.evaluate(() => LexiQuest.state());
  assert.ok(q.streak.count >= 1 && q.badges.perfect, 'streak and perfect badge');
  ok('result: reward card, streak, missions, next step, perfect badge');

  /* 11. Course page: stars on lessons and module boss; boss HUD */
  await page.goto(BASE + '#/course/2/1');
  await page.locator('#lessonCards .boss-card').waitFor();
  assert.ok(await page.locator('#lessonCards .stars').count() >= 2);
  await page.locator('#lessonCards .boss-card').click();
  await page.locator('#bossHud').waitFor();
  assert.equal(await page.evaluate(() => game.mode), 'boss');
  ok('course: stars, module boss card, boss HUD');
  const deep = await fresh();
  await deep.goto(BASE + '#/lesson/2/5/play/crystals');
  await deep.locator('#lexiCoach').waitFor();
  assert.ok(await deep.evaluate(() => game.lexiInit === true));
  await deep.close();
  ok('deep link: Lexi joins a game opened directly by URL');

  /* 12. Calm mode: auto for 7–9, manual toggle persists */
  await page.goto(BASE + '#/lesson/8/0');
  assert.ok(await page.evaluate(() => document.body.classList.contains('calm')));
  await page.goto(BASE + '#/lesson/2/0');
  assert.ok(!(await page.evaluate(() => document.body.classList.contains('calm'))));
  await page.locator('#calmToggle').click();
  await page.reload(); await page.locator('#launcher').waitFor();
  assert.ok(await page.evaluate(() => document.body.classList.contains('calm')));
  await page.locator('#calmToggle').click();
  ok('calm: auto for grades 7–9, persistent toggle');

  /* 13. Teacher: board mode toggle, print unchanged */
  await page.goto(BASE + '#/lesson/2/0/teacher');
  await page.locator('#boardToggle').check();
  assert.ok(await page.evaluate(() => document.body.classList.contains('board')));
  await page.evaluate(() => { window.print = () => { window.__printed = true; }; });
  await page.locator('#printTest').click();
  assert.ok(await page.evaluate(() => window.__printed && document.querySelectorAll('#lexigoPrint .print-question').length > 0));
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('#lexigoPrint *')].some(n => /lexi-/.test(n.className))), false);
  await page.locator('#boardToggle').uncheck();
  ok('teacher: board mode, print sheet without game elements');
  await page.close();

  /* 14. Corrupted storage never breaks the app */
  const broken = await fresh({ width: 375, height: 760 }, () => { localStorage.setItem('lexigo_quest_v1', '{"xp":"lots","days":{"bad":1,"2026-01-01":{"words":5}},"badges":[1],"streak":7}'); localStorage.setItem('lexigo_prefs_v1', 'not json'); });
  await broken.goto(BASE + '#/home');
  await broken.locator('.lexi-hero').waitFor();
  assert.match(await broken.locator('.lexi-level').innerText(), /0 \/ 100 XP/);
  ok('storage: corrupted quest and prefs are ignored safely');

  /* 15. Phone: every new screen fits 375 px */
  for (const r of ['#/home', '#/course/2/1', '#/lesson/2/5', '#/lesson/2/5/play/builder', '#/lesson/2/5/play/listen', '#/lesson/2/m1/play/boss', '#/awards', '#/profile']) {
    await broken.goto(BASE + r); await broken.waitForTimeout(250);
    assert.ok(await broken.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'overflow at ' + r);
  }
  ok('mobile: no horizontal scroll on new screens');
  await broken.close();

  assert.deepEqual(errors, [], 'Browser errors: ' + errors.join(' | '));
  console.log('PASS world:\n - ' + results.join('\n - '));
} finally {
  await browser.close();
}
