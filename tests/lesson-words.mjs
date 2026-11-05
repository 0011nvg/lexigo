// «Слова урока» на странице урока (2026-11-04): список, перевод, «Послушать», выбор, переход к играм.
// Run: node tests/lesson-words.mjs (static server on 127.0.0.1:4173)
import assert from 'node:assert/strict';
import { chromium } from './browser-runtime.mjs';
import { useFakeCloud } from './fake-cloud.mjs';   // 2026-11-04: материалы учителя — только в аккаунте учителя
const BASE = process.env.LEXIGO_URL || 'http://127.0.0.1:4173/index.html';
const browser = await chromium.launch({ headless: true });
const errors = [];
const ok = m => console.log('  ✓ ' + m);
async function fresh(viewport = { width: 1280, height: 900 }) {
  const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });await useFakeCloud(page, { role: 'teacher' });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => {
    window.__spoken = [];
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak: u => window.__spoken.push(u.text), cancel() {}, getVoices: () => [], addEventListener() {}, onvoiceschanged: null } });
  });
  return page;
}
const lessonWords = page => page.evaluate(() => scope.map(w => w.id));
const rows = page => page.locator('#lessonWords #words .wordrow');

// 1. Урок открывается сразу со словами: английский, перевод, «Послушать», отметка
{
  const page = await fresh();
  await page.goto(BASE + '#/lesson/5/3');
  await page.locator('#lessonWords .wordrow').first().waitFor();
  assert.equal(await page.evaluate(() => document.body.dataset.page), 'lesson');
  const expected = await page.evaluate(() => book.sections[3].words.map(w => [w.id, w.en, w.ru]));
  assert.equal(await rows(page).count(), expected.length, 'every word of the lesson is shown');
  const shown = await page.evaluate(() => [...document.querySelectorAll('#lessonWords .wordrow')].map(r => [r.dataset.id, r.querySelector('.word-en').textContent, r.querySelector('.word-ru').firstChild.textContent]));
  assert.deepEqual(shown, expected, 'words and translations come from the open lesson, in its order');
  assert.match(await page.locator('#lessonWordsTitle').innerText(), new RegExp('Слова урока · ' + expected.length + ' слов'));
  assert.match(await page.locator('#lwStatus').innerText(), /все слова/);
  // словарь — над играми, отдельной кнопки «Посмотреть слова» нет
  const [wy, gy] = await page.evaluate(() => [document.getElementById('lessonWords').getBoundingClientRect().top, document.querySelector('#launcher .modes').getBoundingClientRect().top]);
  assert.ok(wy < gy, 'the dictionary comes before the games');
  assert.equal(await page.locator('#openWords').isVisible(), false);
  assert.equal(await page.locator('#wordSetBar').isVisible(), false);
  await rows(page).nth(1).locator('.say-btn').click();
  await page.waitForFunction(() => window.__spoken.length > 0, null, { timeout: 3000 }).catch(() => {}); // speech.js один раз ждёт загрузку голосов
  assert.deepEqual(await page.evaluate(() => window.__spoken), [expected[1][1]], '«Послушать» speaks the English word');
  assert.equal(await rows(page).nth(1).locator('input').isChecked(), true, '«Послушать» does not toggle the word');
  ok('lesson page: all words of the lesson with translation, audio and checkbox, above the games');

  // 2. Выбор одним касанием по строке → счётчики → игра только с выбранными
  await rows(page).nth(0).locator('.word-text').click();
  await rows(page).nth(2).locator('.word-text').click();
  assert.match(await page.locator('#lwStatus').innerText(), new RegExp('Выбрано: ' + (expected.length - 2) + ' из ' + expected.length));
  assert.match(await page.locator('#wordsDone').innerText(), new RegExp('Тренировать выбранные \\(' + (expected.length - 2) + '\\)'));
  assert.equal(await page.locator('#all').isDisabled(), false);
  await page.locator('#wordsDone').click();
  assert.equal(await page.evaluate(() => document.activeElement?.closest('.mode-heading') !== null), true, '«Тренировать» leads to the games');
  await page.locator('[data-mode="quiz"]').click();
  await page.waitForFunction(() => document.body.dataset.page === 'play');
  const played = await page.evaluate(() => game.words.map(w => w.id).sort());
  const want = expected.map(w => w[0]).filter((_, i) => i !== 0 && i !== 2).sort();
  assert.deepEqual(played, want, 'the game uses exactly the chosen words');
  await page.locator('#back').click();
  await page.waitForFunction(() => document.body.dataset.page === 'lesson');
  assert.equal(await rows(page).nth(0).locator('input').isChecked(), false, 'the choice survives the game');
  await page.reload(); await rows(page).first().waitFor();
  assert.equal(await rows(page).nth(0).locator('input').isChecked(), false, 'the choice survives reload');
  assert.match(await page.locator('#lwStatus').innerText(), /Выбрано/);
  await page.locator('#all').click();
  assert.equal(await page.locator('#lessonWords .word-check:checked').count(), expected.length);
  assert.match(await page.locator('#lwStatus').innerText(), /все слова/);
  await page.locator('#none').click();
  assert.equal(await page.locator('#lessonWords .word-check:checked').count(), 0);
  assert.equal(await page.locator('#wordsDone').isDisabled(), true, 'no training without words');
  assert.match(await page.locator('#lwStatus').innerText(), /Отметь слова/);
  await page.locator('#lwMine').click();
  assert.equal(await page.locator('#lessonWords .word-check:checked').count(), expected.length - 2, '«Мой выбор» brings the own choice back');
  await page.locator('#all').click();
  ok('one tap selects a word; select all / clear / my choice; games get exactly the chosen words; kept after a game and reload');

  // 3. Переключение уроков: только слова нового урока, без повторов из других уроков
  await page.goto(BASE + '#/lesson/5/4'); await page.waitForTimeout(150);
  const ids4 = await page.evaluate(() => [...document.querySelectorAll('#lessonWords .wordrow')].map(r => r.dataset.id));
  assert.deepEqual(ids4, await page.evaluate(() => book.sections[4].words.map(w => w.id)));
  assert.equal(ids4.filter(id => expected.some(w => w[0] === id)).length, 0, 'no words from the previous lesson');
  await page.goto(BASE + '#/lesson/7/2'); await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => book.grade), 7);
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#lessonWords .wordrow')].map(r => r.dataset.id)), await page.evaluate(() => DB.books.find(b => b.grade == 7).sections[2].words.map(w => w.id)));
  await page.goto(BASE + '#/lesson/6/m1'); await page.waitForTimeout(150);
  const mod = await page.evaluate(() => { const b = DB.books.find(b => b.grade == 6), m = [...new Set(b.sections.map(s => s.module))][1]; return b.sections.filter(s => s.module === m).flatMap(s => s.words).length; });
  assert.match(await page.locator('#lwCount').innerText(), new RegExp(String(mod)));
  assert.equal(await page.evaluate(() => new Set(scope.map(w => w.id)).size), mod, 'module view: no duplicates');
  ok('switching grade/lesson/module shows the right dictionary, no words from other lessons');

  // 4. Старые ссылки …/words открывают урок на словаре
  await page.goto(BASE + '#/lesson/4/3/words'); await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => location.hash), '#/lesson/4/3');
  assert.equal(await page.evaluate(() => document.body.dataset.page), 'lesson');
  const top = await page.evaluate(() => document.getElementById('lessonWords').getBoundingClientRect().top);
  assert.ok(top >= -2 && top < 120, 'scrolled to the dictionary, top=' + top);
  ok('old …/words links open the lesson at the dictionary');
  await page.close();
}

// 5. Маленький и большой урок, поиск, телефон
{
  const page = await fresh({ width: 390, height: 844 });
  const one = await page.evaluate(() => 0); void one;
  await page.goto(BASE + '#/lesson/3/16'); await rows(page).first().waitFor();
  assert.equal(await rows(page).count(), 1);
  assert.match(await page.locator('#lwCount').innerText(), /1 слово/);
  assert.equal(await page.locator('#lwMore').isVisible(), false);
  assert.equal(await page.locator('#search').isVisible(), false, 'no search box for a short lesson');
  await page.goto(BASE + '#/lesson/5/0'); await page.waitForTimeout(200);
  const total = await page.evaluate(() => scope.length);
  assert.ok(total > 100);
  assert.equal(await page.locator('#lessonWords .wordrow:visible').count(), 8, 'long lesson: a short preview on the phone');
  assert.match(await page.locator('#lwMore').innerText(), new RegExp('Показать все ' + total));
  await page.locator('#lwMore').click();
  assert.equal(await page.locator('#lessonWords .wordrow:visible').count(), total);
  await page.locator('#lwMore').click();
  assert.equal(await page.locator('#lessonWords .wordrow:visible').count(), 8);
  await page.locator('#search').fill('bird');
  const found = await page.locator('#lessonWords .wordrow:visible').count();
  assert.ok(found >= 1 && found < 8);
  assert.equal(await page.locator('#lessonWords .wordrow:visible .star-btn').count(), found, 'stars stay on searched rows');
  await page.locator('#search').fill('');
  // телефон: без горизонтальной прокрутки, крупные области касания, без наложений
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal scroll');
  const box = await rows(page).first().boundingBox(), say = await rows(page).first().locator('.say-btn').boundingBox(), star = await rows(page).first().locator('.star-btn').boundingBox();
  assert.ok(box.height >= 56 && say.width >= 42 && say.height >= 42 && star.height >= 42, 'large tap targets');
  assert.ok(say.x + say.width <= star.x + 1 && star.x + star.width <= box.x + box.width + 1, 'audio and star do not overlap');
  for (const w of [360, 320]) {
    await page.setViewportSize({ width: w, height: 740 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal scroll at ' + w);
  }
  ok('1-word and 123-word lessons, collapse/expand, search, phone 390/360/320 without horizontal scroll');
  await page.close();
}

// 6. Учитель: тот же список в «Материалах к уроку»
{
  const page = await fresh();
  await page.goto(BASE + '#/lesson/2/0/teacher'); await page.waitForTimeout(200);
  assert.equal(await page.locator('#wordSelection').evaluate(n => n.parentElement.id), 'catalogAside');
  await page.locator('#teacherPickWords').click();
  assert.ok(await page.locator('#words .wordrow').first().isVisible());
  assert.equal(await page.locator('#lessonWords').isVisible(), false);
  await page.goto(BASE + '#/lesson/2/0'); await page.waitForTimeout(200);
  assert.equal(await page.locator('#wordSelection').evaluate(n => n.parentElement.id), 'lessonWordsBody');
  ok('teacher materials keep their own word picker; the lesson page gets the list back');
  await page.close();
}
await browser.close();
assert.deepEqual(errors, [], 'console errors: ' + errors.join(' | '));
console.log('PASS lesson-words: dictionary on the lesson page, selection, audio, games, lessons, phone, teacher');
