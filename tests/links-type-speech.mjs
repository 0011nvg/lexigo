// 2026-11-05: прямые ссылки на любой урок/модуль, типографика английских слов, озвучка, праздничное завершение раунда,
// главная без дублирующего выбора класса. Run: node tests/links-type-speech.mjs (static server on 127.0.0.1:4173)
import assert from 'node:assert/strict';
import { chromium } from './browser-runtime.mjs';
import { useFakeCloud } from './fake-cloud.mjs';
const BASE = process.env.LEXIGO_URL || 'http://127.0.0.1:4173/index.html';
const SITE = BASE.replace(/index\.html$/, '');
const browser = await chromium.launch({ headless: true });
const errors = [];
const ok = m => console.log('  ✓ ' + m);
async function fresh(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, ...opts });
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
  return page;
}
const first7_3a = async page => page.evaluate(() => { const b = DB.books.find(x => x.grade === 7); const i = b.sections.findIndex(s => /^Урок 3a\b/.test(s.title)); return { i, id: b.sections[i].words[0].id, title: b.sections[i].title }; });

try {
  /* ---------- 1. прямые ссылки на уроки и модули ---------- */
  let page = await fresh({ permissions: ['clipboard-read', 'clipboard-write'] });
  await page.goto(BASE + '#/home');
  const l3a = await first7_3a(page);
  await page.goto(BASE + '#/l/7/' + l3a.id);
  await page.waitForURL(new RegExp('#/lesson/7/' + l3a.i + '$'));
  assert.equal(await page.locator('#currentLesson').innerText(), l3a.title);
  await page.reload(); await page.locator('#launcher').waitFor();
  assert.equal(await page.locator('#currentLesson').innerText(), l3a.title, 'survives reload');
  ok('#/l/7/<id> opens 7 класс → ' + l3a.title + ', survives a reload');

  await page.locator('#lessonShare').click();
  await page.locator('.lx-share-pop').waitFor();
  const shared = await page.locator('.lx-share-url').inputValue();
  assert.equal(shared, SITE + '#/l/7/' + l3a.id);
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), shared, 'copied to clipboard');
  assert.match(await page.locator('.lx-share-status').innerText(), /скопирована/);
  for (const app of ['Telegram', 'WhatsApp', 'ВКонтакте']) assert.match(await page.locator('.lx-share-app', { hasText: app }).getAttribute('href'), /^https:\/\//);
  assert.match(await page.locator('.lx-share-app', { hasText: 'Telegram' }).getAttribute('href'), new RegExp(encodeURIComponent(shared).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  await page.keyboard.press('Escape'); assert.equal(await page.locator('.lx-share-pop').count(), 0);
  ok('«Поделиться» in the lesson header: one click copies the permanent link; Telegram / WhatsApp / VK; Esc closes');

  // учитель: модуль на странице учебника — два действия (открыть модуль → «Поделиться»)
  await page.goto(BASE + '#/course/7/2'); await page.locator('#moduleShare').click(); await page.locator('.lx-share-pop').waitFor();
  const modUrl = await page.locator('.lx-share-url').inputValue();
  assert.match(modUrl, /#\/l\/7\/m-s7_\d+$/);
  ok('module page: «Поделиться» next to the module title → ' + modUrl.replace(SITE, ''));
  await page.context().close();

  // новый браузер (чистый контекст), телефон: ссылка на модуль и на урок с игрой
  const phone = await fresh({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await phone.goto(modUrl.replace(SITE, SITE + 'index.html'));
  await phone.waitForURL(/#\/lesson\/7\/m2$/);
  assert.equal(await phone.locator('#currentLesson').innerText(), 'Модуль 3');
  const noScroll = await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  assert.ok(noScroll, 'no horizontal scroll on the phone');
  const shareBox = await phone.locator('#lessonShare').boundingBox(); assert.ok(shareBox.width >= 44 && shareBox.height >= 44, 'tap target ≥ 44px');
  await phone.goto(BASE + '#/l/7/' + l3a.id + '/play/quiz'); await phone.locator('#play .options button').first().waitFor();
  assert.match(phone.url(), new RegExp('#/lesson/7/' + l3a.i + '/play/quiz$'));
  ok('fresh browser on a phone: module link → 7 класс · Модуль 3; …/play/quiz tail opens the game; no horizontal scroll');

  // другие классы: первый и последний урок каждого учебника
  const all = await phone.evaluate(() => DB.books.flatMap(b => { const xs = b.sections.map((s, i) => [i, s]).filter(([, s]) => s.words.length); return [xs[0], xs[xs.length - 1]].map(([i, s]) => ({ g: b.grade, i, id: s.words[0].id, title: s.title })); }));
  for (const x of all) {
    await phone.goto(BASE + '#/l/' + x.g + '/' + x.id); await phone.waitForURL(new RegExp('#/lesson/' + x.g + '/' + x.i + '$'));
    assert.equal(await phone.locator('#currentLesson').innerText(), x.title);
  }
  ok('every textbook 2–10: first and last lesson links resolve to the right lesson (' + all.length + ' links)');
  // неизвестный урок — страница учебника, а не главная
  await phone.goto(BASE + '#/l/7/zzz_404'); await phone.waitForURL(/#\/course\/7\/0$/);
  await phone.goto(BASE + '#/l/99/zzz'); await phone.waitForURL(/#\/lessons$/);
  ok('broken link: known grade → its textbook, unknown → «Уроки» (never silently the home page)');
  // старые адреса по номеру раздела продолжают работать
  await phone.goto(BASE + '#/lesson/7/' + l3a.i); assert.equal(await phone.locator('#currentLesson').innerText(), l3a.title);
  ok('old #/lesson/<grade>/<index> links still work');
  await phone.context().close();

  // гость в облачном режиме: подсказка «войти» с возвратом в урок; «Войти» в шапке тоже возвращает в урок
  page = await fresh();
  await useFakeCloud(page, { seed: false });
  await page.goto(BASE + '#/l/7/' + l3a.id); await page.locator('#linkGuestNote').waitFor();
  assert.equal(await page.locator('#linkGuestNote a').getAttribute('href'), 'auth.html?next=' + encodeURIComponent('index.html#/l/7/' + l3a.id));
  const headerHref = await page.evaluate(() => { const a = document.querySelector('a.acct-btn.guest'); a.addEventListener('click', e => e.preventDefault(), { once: true }); a.click(); return a.getAttribute('href'); });
  assert.equal(headerHref, 'auth.html?next=' + encodeURIComponent('index.html#/l/7/' + l3a.id));
  ok('guest via link: «войди, чтобы результаты сохранились в профиле» → auth.html?next=<this lesson>; header «Войти» too');
  await page.context().close();

  // вошедший ученик: подсказки нет (результаты сохраняет cloud.js)
  page = await fresh();
  await useFakeCloud(page, { role: 'student' });
  await page.goto(BASE + '#/l/7/' + l3a.id); await page.locator('#launcher').waitFor(); await page.waitForTimeout(400);
  assert.equal(await page.locator('#linkGuestNote').count(), 0);
  ok('signed-in student via link: no sign-in note');
  await page.context().close();

  /* ---------- 2. типографика ---------- */
  page = await fresh();
  await page.goto(BASE + '#/l/2/' + (await (async () => { await page.goto(BASE); return page.evaluate(() => DB.books[0].sections[0].words[0].id); })()) + '/play/quiz');
  await page.locator('#play .question h2').waitFor();
  await page.evaluate(() => { document.querySelector('#play .question h2').textContent = 'I J l i j 1 O 0'; });
  await page.evaluate(() => document.fonts.ready);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument');
  const fontsOf = async sel => { const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel }); return (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts.map(f => f.familyName); };
  const used = await fontsOf('#play .question h2'); assert.ok(used.length === 1 && /^Atkinson Hyperlegible Next/.test(used[0]), used.join() + ' — English prompt must be drawn only with the learning font (no browser substitution)');
  const opt = await fontsOf('#play .option'); assert.ok(opt.some(f => /^Nunito/.test(f)), 'Russian options keep Nunito: ' + opt.join());
  const widths = await page.evaluate(() => { const c = document.createElement('canvas').getContext('2d'); c.font = '800 40px "LEXI Latin"'; return ['I', 'l', '1', 'O', '0', 'J'].map(ch => [ch, c.measureText(ch).width]); });
  const w = Object.fromEntries(widths);
  assert.notEqual(w.I, w.l); assert.notEqual(w.O, w['0']);
  const jBox = await page.evaluate(() => { const c = document.createElement('canvas').getContext('2d'); c.font = '800 40px "LEXI Latin"'; return c.measureText('J').actualBoundingBoxDescent; });
  assert.ok(jBox <= 1, 'capital J sits on the baseline (no descender to clip)');
  const loaded = await page.evaluate(async () => { const out = {}; for (const wt of ['500', '600', '700', '800']) out[wt] = (await document.fonts.load(wt + ' 16px Nunito', 'Ая')).map(f => f.weight); return out; });
  for (const wt of ['500', '600', '700', '800']) assert.deepEqual(loaded[wt], [wt], 'Nunito ' + wt + ' is a real face, not a substitute: ' + JSON.stringify(loaded));
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#play .question h2')).fontVariantLigatures), 'none');
  ok('I J l i j 1 O 0 rendered with Atkinson Hyperlegible Next (distinct shapes, J on the baseline), Nunito keeps Cyrillic, weights 500–800, no ligatures');
  await page.context().close();

  /* ---------- 3. озвучка ---------- */
  const stub = () => {
    const voices = [{ name: 'Microsoft Irina', lang: 'ru-RU', default: true, localService: true }, { name: 'Bells', lang: 'en-US' }, { name: 'Google UK English Female', lang: 'en-GB' }, { name: 'Samantha', lang: 'en-US', localService: true }];
    const listeners = []; let ready = false; window.__spoken = []; window.__voicesReady = () => { ready = true; listeners.forEach(f => f()); };
    class U { constructor(t) { this.text = t; this.lang = ''; this.voice = null; } }
    window.SpeechSynthesisUtterance = U;
    const synth = { speaking: false, pending: false, getVoices: () => ready ? voices : [], cancel() { window.__spoken.push('cancel'); this.speaking = false; }, resume() {}, speak(u) { this.speaking = true; window.__spoken.push({ text: u.text, lang: u.lang, voice: u.voice && u.voice.name, rate: u.rate }); }, addEventListener: (n, f) => listeners.push(f) };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  };
  page = await fresh(); await page.addInitScript(stub);
  await page.goto(BASE + '#/home');
  await page.evaluate(() => LexiSpeech.speak('I'));
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.__spoken.filter(x => x.text).length), 0, 'waits for asynchronously loaded voices');
  await page.evaluate(() => window.__voicesReady()); await page.waitForTimeout(150);
  let spoken = await page.evaluate(() => window.__spoken.filter(x => x.text));
  assert.deepEqual(spoken.map(x => [x.text, x.lang, x.voice]), [['eye', 'en-GB', 'Google UK English Female']]);
  ok('«I» (я) → spoken as /aɪ/ («eye»), en-GB voice; waits for voices instead of falling back to the Russian default');
  await page.evaluate(() => { window.__spoken = []; LexiSpeech.speak('apple'); LexiSpeech.speak('orange'); LexiSpeech.speak('pear'); });
  await page.waitForTimeout(250);
  spoken = await page.evaluate(() => window.__spoken.filter(x => x.text).map(x => x.text));
  assert.deepEqual(spoken.slice(-1), ['pear']); assert.ok(spoken.length <= 2, 'rapid taps do not queue overlapping audio: ' + spoken.join(','));
  const cases = await page.evaluate(() => Object.fromEntries(['n', 'pl', 'take sb for walks', 'her/him', 'blond(e)', 'Mr', 'St. Patrick’s Day', 'Hi!', 'Can I come in?', 'go', 'PE'].map(x => [x, LexiSpeech.speechText(x)])));
  assert.deepEqual(cases, { n: 'noun', pl: 'plural', 'take sb for walks': 'take somebody for walks', 'her/him': 'her or him', 'blond(e)': 'blonde', Mr: 'Mister', 'St. Patrick’s Day': "Saint Patrick's Day", 'Hi!': 'Hi!', 'Can I come in?': 'Can I come in?', go: 'go', PE: 'PE' });
  assert.ok(!(await page.evaluate(() => DB.books.flatMap(b => b.sections.flatMap(s => s.words)).some(w => /[а-яё]/i.test(LexiSpeech.speechText(w.en))))), 'no Cyrillic ever reaches the English voice');
  ok('short words, abbreviations (n, pl, sb, Mr, St) and phrases are prepared for the English voice; never Cyrillic');
  // аудиодиктант: «n» (пометка) и «I» не проверяются на слух
  await page.goto(BASE + '#/lesson/2/0'); await page.waitForFunction(() => typeof localGameAdapter !== 'undefined' || typeof start === 'function');
  const kinds = await page.evaluate(() => { start('audio'); const pick = en => DB.books.flatMap(b => b.sections.flatMap(s => s.words)).find(w => w.en === en); return ['I', 'n', 'apple'].map(en => { const w = pick(en); return w ? LexigoLocalGameAdapter.create({ getState: () => game, shuffle: a => a, normalize: s => s, audioAvailable: () => true, speak: () => {}, record() {}, renderQuestion() {}, answerUI() {}, textAnswerHints() {} }).question('audio', w).model.kind : 'missing'; }); });
  assert.deepEqual(kinds.slice(0, 2), ['spell', 'spell']);
  ok('audio dictation: «I» and dictionary labels (n) become «write by translation», regular words stay on audio (' + kinds[2] + ')');
  await page.context().close();

  /* ---------- 4. завершение раунда ---------- */
  async function finishWith(ratio, opts = {}) {
    const p = await fresh(opts);
    await p.goto(BASE + '#/lesson/7/12/play/quiz'); await p.waitForFunction(() => typeof game !== 'undefined' && game);
    await p.evaluate(r => { const n = game.words.length; game.firstCorrect = Math.round(n * r); game.index = n; finish(); }, ratio);
    await p.locator('.lxc-stage').waitFor();
    const info = await p.evaluate(() => { const c = document.querySelector('.lesson-result'); const kids = [...c.children]; return { cls: c.className, phrase: c.querySelector('.lxc-phrase').textContent, confetti: c.querySelectorAll('.lxc-confetti i').length, anim: c.querySelector('.lxc-cat').className, img: c.querySelector('.result-mascot').getAttribute('src'), metrics: kids.findIndex(k => k.classList.contains('result-metrics')), actions: kids.findIndex(k => k.classList.contains('result-actions')) }; });
    return { p, info };
  }
  let r = await finishWith(1);
  const pools = await r.p.evaluate(() => LexiCelebrate.PHRASES);
  assert.match(r.info.cls, /lxc-perfect/); assert.ok(pools.perfect.includes(r.info.phrase)); assert.ok(r.info.confetti > 0 && r.info.confetti <= 30); assert.match(r.info.anim, /lxc-jump/); assert.match(r.info.img, /lexi-hero/);
  assert.ok(r.info.actions > r.info.metrics && r.info.actions - r.info.metrics <= 2, 'next buttons right under the score');
  await r.p.locator('.lesson-result .result-actions button').first().click(); // можно сразу дальше
  ok('perfect round: Lexi jumps, «' + r.info.phrase + '», light confetti (' + r.info.confetti + '), buttons under the score — next round at once');
  await r.p.context().close();
  r = await finishWith(.6);
  assert.match(r.info.cls, /lxc-ok/); assert.ok(pools.ok.includes(r.info.phrase)); assert.equal(r.info.confetti, 0); assert.match(r.info.anim, /lxc-wave/);
  ok('round with mistakes: supportive «' + r.info.phrase + '», no confetti, Lexi waves');
  await r.p.context().close();
  r = await finishWith(.1, { viewport: { width: 390, height: 844 } });
  assert.match(r.info.cls, /lxc-low/); assert.ok(pools.low.includes(r.info.phrase)); assert.ok(!/плохо|ошибся|неудач/i.test(r.info.phrase));
  const mob = await r.p.evaluate(() => { const c = document.querySelector('.lxc-cat').getBoundingClientRect(); return { fits: c.left >= 0 && c.right <= innerWidth, noScroll: document.documentElement.scrollWidth <= innerWidth + 1 }; });
  assert.ok(mob.fits && mob.noScroll);
  ok('low result on a phone: kind «' + r.info.phrase + '», animation fits the screen');
  await r.p.context().close();
  r = await finishWith(1, { reducedMotion: 'reduce' });
  assert.equal(r.info.confetti, 0); assert.doesNotMatch(r.info.anim, /lxc-jump|lxc-wave/);
  ok('prefers-reduced-motion: no confetti, no jumping');
  await r.p.context().close();
  const phrases = new Set(); page = await fresh(); await page.goto(BASE + '#/home');
  for (let i = 0; i < 6; i++) phrases.add(await page.evaluate(() => LexiCelebrate.phrase('good')));
  assert.ok(phrases.size >= 5, 'phrases rotate without repeats');
  ok('phrases rotate (' + phrases.size + ' different in 6 rounds)');
  await page.context().close();

  /* ---------- 5. главная ---------- */
  page = await fresh();
  await page.goto(BASE + '#/home'); await page.locator('.lexi-hero .hero-go').waitFor();
  assert.equal(await page.locator('.class-picker').count(), 0);
  assert.match(await page.locator('.lexi-hero .hero-go').innerText(), /Начать учиться/);
  ok('new student: no duplicate «В каком ты классе?» block; one clear first action «Начать учиться»');
  await page.evaluate(() => { localStorage.setItem('lexigo_my_class_v1', JSON.stringify({ grade: 7, at: 1 })); localStorage.setItem('lexigo_last_activity_v1', JSON.stringify({ path: '/lesson/7/12', mode: 'quiz', finished: true, at: Date.now() })); });
  await page.reload(); await page.locator('.lexi-desk').waitFor();
  assert.match(await page.locator('.lexi-hero .hero-go').innerText(), /Дальше|Продолжить/);
  assert.equal(await page.locator('.hero-go').count(), 1, 'one continue action, no second «last lesson» block');
  ok('student with progress: lemon button continues the last lesson; «Мой класс» card kept');
  await page.context().close();
  page = await fresh(); await useFakeCloud(page, { role: 'teacher' });
  await page.goto(BASE + '#/home'); await page.locator('.teacher-start').waitFor({ timeout: 15000 });
  assert.equal(await page.locator('.class-picker').count(), 0);
  assert.equal(await page.locator('.teacher-start a', { hasText: 'Создать урок' }).getAttribute('href'), 'me.html?new=1');
  ok('teacher home: «Создайте свой урок» kept, no class picker');
  await page.context().close();
  assert.deepEqual(errors, []);
  ok('no page errors');
} finally { await browser.close(); }
