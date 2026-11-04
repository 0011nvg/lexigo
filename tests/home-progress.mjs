// Копилка слов в синем блоке (2026-11-04): то же число, что «слов в копилке» в профиле; склонения; новые слова
// после тренировки; обновление страницы; повторные ответы на одно слово не добавляют слов; узкий телефон.
import assert from 'node:assert/strict';
import { chromium } from './browser-runtime.mjs';
const BASE = process.env.LEXIGO_URL || 'http://127.0.0.1:4173/index.html';
const browser = await chromium.launch({ headless: true });
const errors = [];
const ok = m => console.log('  ✓ ' + m);
const page = await browser.newPage({ viewport: { width: 320, height: 640 }, reducedMotion: 'reduce' });
page.on('pageerror', e => errors.push(e.message));
const pill = () => page.locator('#lexiHome .lexi-personal-progress').innerText();
async function seed(n, repeat = 1) {
  await page.evaluate(([n, repeat]) => {
    const ids = DB.books.flatMap(b => b.sections.flatMap(s => s.words)).map(w => w.id).filter((x, i, a) => a.indexOf(x) === i).slice(0, n), p = {};
    ids.forEach(id => { p[id] = { right: repeat, wrong: 0, last: Date.now() }; });
    localStorage.setItem('lexigo_progress_v1', JSON.stringify(p));
  }, [n, repeat]);
  await page.reload(); await page.locator('#lexiHome .lexi-personal-progress').waitFor();
}
await page.goto(BASE + '#/home'); await page.evaluate(() => localStorage.clear()); await page.reload();
await page.locator('#lexiHome .lexi-personal-progress').waitFor();
assert.match(await pill(), /Первое слово для копилки уже ждёт тебя!/);
for (const [n, re] of [[1, /Первое слово уже в копилке!/], [2, /Уже 2 слова в твоей копилке!/], [5, /Уже 5 слов в твоей копилке!/], [11, /Здорово! 11 слов в копилке!/], [21, /Здорово! 21 слово в копилке!/], [24, /24 слова/], [89, /Вау! 89 слов в копилке!/], [1001, /Вау! 1001 слово в копилке!/]]) {
  await seed(n); assert.match(await pill(), re, String(n));
}
ok('0 / 1 / 2 / 5 / 11 / 21 / 24 / 89 / 1001: friendly wording and correct plural forms');
await seed(30, 7);
assert.match(await pill(), /30 слов/, 'many right answers on the same words do not add words');
await page.goto(BASE + '#/profile'); await page.locator('.progress-tile').nth(1).waitFor();
assert.equal(await page.locator('.progress-tile').nth(1).locator('strong').innerText(), '30');
assert.match(await page.locator('.progress-tile').nth(1).innerText(), /слов в копилке/);
ok('the number equals «слов в копилке» in «Профиль → Мой прогресс»; repeats are not counted twice');
// тренировка → новое слово → главная
await page.goto(BASE + '#/lesson/9/3');
await page.locator('#lessonWords .wordrow').first().waitFor();
const fresh = await page.evaluate(() => { const w = scope.find(x => !progress[x.id]); start('spell', [w]); record(w, true, 'recall'); save(); return w.id; });
assert.ok(fresh);
await page.goto(BASE + '#/home'); await page.waitForTimeout(300);
assert.match(await pill(), /31 слово/, 'a new right answer appears on the home page');
await page.reload(); await page.locator('#lexiHome .lexi-personal-progress').waitFor();
assert.match(await pill(), /31 слово/, 'and survives a reload');
ok('after a training: +1 on the home page right away and after reload');
// узкий телефон: плашка, кнопка и Лекси не налезают друг на друга, слова не рвутся
const boxes = await page.evaluate(() => ['.lexi-personal-progress', '.hero-go', '.lexi-hero-art', '.lexi-hero-title', '.lexi-hero-sub'].map(s => { const r = document.querySelector('#lexiHome ' + s).getBoundingClientRect(); return { s, x: r.x, y: r.y, w: r.width, h: r.height }; }));
const hit = (a, b) => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
const [pp, go, art, title, sub] = boxes;
for (const [a, b] of [[pp, go], [pp, art], [go, art], [title, art], [sub, art]]) assert.equal(hit(a, b), false, a.s + ' × ' + b.s);
const hero = await page.locator('#lexiHome .lexi-hero').boundingBox();
assert.ok(hero.height < 560, 'the welcome block stays compact on a 320 px phone: ' + hero.height);
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
const broken = await page.evaluate(() => [...document.querySelectorAll('#lexiHome .lexi-hero-title, #lexiHome .hero-go span')].some(n => { const r = document.createRange(); r.selectNodeContents(n); return [...r.getClientRects()].length > (n.matches('.lexi-hero-title') ? 4 : 1); }));
assert.equal(broken, false, 'no word broken mid-line');
ok('320 px phone: pill, button, Lexi and text do not overlap; block is compact; no broken words');
await browser.close();
assert.deepEqual(errors, []);
console.log('PASS home-progress: «копилка» wording, same number as the profile, updates after training, compact phone layout');
