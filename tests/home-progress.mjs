// Выученные слова в синем блоке (2026-11-04): то же число, что «слов выучено» в профиле; склонения; новые слова
// после тренировки; обновление страницы; повторные ответы на одно слово не добавляют слов; узкий телефон.
import assert from 'node:assert/strict';
import { chromium } from './browser-runtime.mjs';
const BASE = process.env.LEXIGO_URL || 'http://127.0.0.1:4173/index.html';
const browser = await chromium.launch({ headless: true });
const errors = [];
const ok = m => console.log('  ✓ ' + m);
const page = await browser.newPage({ viewport: { width: 320, height: 640 }, reducedMotion: 'reduce' });
page.on('pageerror', e => errors.push(e.message));
const pill = () => page.locator('#lexiHome .lexi-personal-progress').getAttribute('aria-label');
async function seed(n, repeat = 2, extra = 0) {
  await page.evaluate(([n, repeat, extra]) => {
    const ids = DB.books.flatMap(b => b.sections.flatMap(s => s.words)).map(w => w.id).filter((x, i, a) => a.indexOf(x) === i).slice(0, n), p = {};
    ids.forEach(id => { p[id] = { right: repeat, recall: repeat, streak: repeat, wrong: 0, last: Date.now() }; });
    DB.books.flatMap(b => b.sections.flatMap(s => s.words)).map(w => w.id).filter(id => !p[id]).slice(0, extra).forEach(id => { p[id] = { right: 1, recall: 1, streak: 1, wrong: 0, last: Date.now() }; });
    localStorage.setItem('lexigo_progress_v1', JSON.stringify(p));
  }, [n, repeat, extra]);
  await page.reload(); await page.locator('#lexiHome .lexi-personal-progress').waitFor();
}
await page.goto(BASE + '#/home'); await page.evaluate(() => localStorage.clear()); await page.reload();
await page.locator('#lexiHome .lexi-personal-progress').waitFor();
assert.match(await pill(), /^Скоро ты выучишь первое слово!$/);
await seed(0, 2, 5); assert.match(await pill(), /^Скоро ты выучишь первое слово!$/, 'right answers but nothing learned yet — same friendly line, no «Почти»');
for (const [n, re] of [[1, /^1 слово выучено\. Первое слово! 🎉$/], [2, /^2 слова выучено\. Отличное начало!$/], [5, /^5 слов выучено/], [11, /^11 слов выучено\. Продолжай в том же духе!$/], [21, /^21 слово выучено/], [24, /^24 слова выучено/], [89, /^89 слов выучено\. Ты уже столько знаешь!$/], [100, /^100 слов выучено\. Впечатляет! 🌟$/], [1001, /^1001 слово выучено/]]) {
  await seed(n); assert.match(await pill(), re, String(n));
  if (n) assert.equal(await page.locator('#lexiHome .pp-num').innerText(), String(n), 'the number is the visual accent');
}
ok('0 / 1 / 2 / 5 / 11 / 21 / 24 / 89 / 100 / 1001: big number + «слов выучено» + short cheer, correct plural forms');
await seed(30, 7, 40);
assert.match(await pill(), /^30 слов выучено/, 'repeats do not add words; words answered once are not «learned»');
await page.goto(BASE + '#/profile'); await page.locator('.progress-tile').nth(2).waitFor();
assert.equal(await page.locator('.progress-tile').nth(2).locator('strong').innerText(), '30');
assert.match(await page.locator('.progress-tile').nth(2).innerText(), /слов выучено/);
ok('the number equals «слов выучено» in «Профиль → Мой прогресс»; repeats and single right answers are not counted');
// тренировка → новое слово → главная
await page.goto(BASE + '#/lesson/9/3');
await page.locator('#lessonWords .wordrow').first().waitFor();
const fresh = await page.evaluate(() => { const w = scope.find(x => !progress[x.id]); start('spell', [w]); record(w, true, 'recall'); record(w, true, 'recall'); save(); return w.id; });
assert.ok(fresh);
await page.goto(BASE + '#/home'); await page.waitForTimeout(300);
await page.waitForFunction(() => document.querySelector('#lexiHome .pp-num')?.textContent === '31');
assert.match(await pill(), /^31 слово выучено/, 'a word written from memory twice appears on the home page (counts up from 30)');
await page.reload(); await page.locator('#lexiHome .lexi-personal-progress').waitFor();
assert.match(await pill(), /31 слово/, 'and survives a reload');
ok('after a training (written twice from memory): +1 on the home page right away and after reload');
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
console.log('PASS home-progress: «выучено» wording, same number as the profile, updates after training, compact phone layout');
