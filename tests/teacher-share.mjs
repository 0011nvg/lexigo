// Свой урок учителя (2026-11-04): «Создайте свой урок» на главной, ссылка для учеников, урок по ссылке без входа,
// неверная / выключенная ссылка, нет связи, рабочий лист A4. Сервер Supabase подменён в браузере (page.route):
// права доступа самого сервера проверяются отдельно — SQL-сценарий в README («v6 · урок по ссылке»).
// Run: node tests/teacher-share.mjs (static server on 127.0.0.1:4173)
import assert from 'node:assert/strict';
import { chromium } from './browser-runtime.mjs';
const BASE = process.env.LEXIGO_URL || 'http://127.0.0.1:4173/';
const URL_ = 'https://lexigo-fake.supabase.co';
const browser = await chromium.launch({ headless: true });
const errors = [];
const ok = m => console.log('  ✓ ' + m);
const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/' + name + '.png', fullPage: true }); };
const TEACHER = '11111111-1111-4111-8111-111111111111', LESSON = '22222222-2222-4222-8222-222222222222';
const TOKEN = 'a3f1c2d4e5b6978877665544332211aa';
const words = [{ en: 'apple', ru: 'яблоко' }, { en: 'orange juice', ru: 'апельсиновый сок' }, { en: 'carrot', ru: 'морковь' }, { en: 'lemonade', ru: 'лимонад' }];
const state = { token: null, shared: true, down: false, calls: [] };
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: TEACHER, role: 'authenticated', exp: 4102444800, aud: 'authenticated' }) + '.sig';

async function context({ teacher = false, clipboard = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', permissions: clipboard ? ['clipboard-read', 'clipboard-write'] : [] });
  await ctx.route('**/config.js', r => r.fulfill({ contentType: 'application/javascript', body: `window.LEXIGO_CLOUD=Object.freeze({url:"${URL_}",anonKey:"sb_publishable_fake_test_key_0123456789"});` }));
  await ctx.route(u => String(u).startsWith(URL_), async r => {
    const req = r.request(), u = new URL(req.url()), path = u.pathname, one = /vnd\.pgrst\.object/.test(req.headers()['accept'] || '');
    state.calls.push(req.method() + ' ' + path + u.search);
    if (state.down) return r.abort('connectionrefused');
    const json = (body, headers = {}) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', ...headers }, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (path.endsWith('/rpc/shared_lesson')) {
      const t = JSON.parse(req.postData() || '{}').t;
      return json(state.shared && t === TOKEN ? [{ id: LESSON, title: 'Food and drinks — extra words', words, modes: ['quiz', 'spell', 'cards'], updated_at: '2026-11-04T10:00:00Z', mine: teacher }] : []);
    }
    if (path.endsWith('/rpc/lesson_share')) { const on = JSON.parse(req.postData() || '{}').enable; state.token = on ? TOKEN : null; return json(state.token); }
    if (path.endsWith('/rpc/submit_session')) return json({ session_id: null, xp: 0, streak: 0 });
    const prof = { display_name: 'Виктория Геннадьевна', avatar: 'lexi-travel6', role: 'teacher' }, stats = { xp: 0, streak_count: 0, streak_best: 0 };
    if (path.endsWith('/profiles')) return json(one ? prof : [prof]);
    if (path.endsWith('/user_stats')) return json(one ? stats : [stats]);
    if (path.endsWith('/custom_lessons')) {
      if (req.method() === 'HEAD' || /count/.test(req.headers()['prefer'] || '')) return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', 'content-range': '0-0/3' }, body: '' });
      const row = { id: LESSON, owner_id: TEACHER, title: 'Food and drinks — extra words', words, modes: ['quiz', 'spell', 'cards'], share_token: state.token, created_at: '2026-11-03T10:00:00Z', updated_at: '2026-11-04T10:00:00Z' };
      return json(one ? row : [row]);
    }
    return json(one ? null : []);
  });
  if (teacher) await ctx.addInitScript(([uid, token]) => {
    if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    localStorage.setItem('lexigo_active_account', JSON.stringify({ uid, name: 'Виктория Геннадьевна', role: 'teacher' }));
    localStorage.setItem('lexigo-auth', JSON.stringify({ access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r', user: { id: uid, aud: 'authenticated', role: 'authenticated', email: 't@example.com' } }));
  }, [TEACHER, jwt]);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_CONNECTION_REFUSED|net::/.test(m.text())) errors.push(m.text()); });
  return { ctx, page };
}

// 1. Учитель: на главной — «Создайте свой урок», ссылки в кабинет
{
  const { ctx, page } = await context({ teacher: true });
  await page.goto(BASE + 'index.html#/home');
  await page.locator('.teacher-start').waitFor({ timeout: 15000 });
  assert.match(await page.locator('.teacher-start h2').innerText(), /Создайте свой урок/);
  assert.equal(await page.locator('.teacher-start a', { hasText: 'Создать урок' }).getAttribute('href'), 'me.html?new=1');
  assert.match(await page.locator('.teacher-start a', { hasText: 'Мои уроки' }).innerText(), /Мои уроки · 3/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await shot(page, 'teacher-home');
  ok('teacher home: «Создайте свой урок» → me.html?new=1, «Мои уроки · 3», fits the phone');

  // 2. Свой урок: включить доступ, скопировать ссылку, выключить
  state.token = null;
  await page.goto(BASE + 'index.html#/my/t-' + LESSON);
  await page.locator('.share-box').waitFor({ timeout: 15000 });
  assert.match(await page.locator('.share-flag').innerText(), /выключен/);
  assert.match(await page.locator('.share-note').innerText(), /Ваше имя, классы и ученики не видны/);
  await page.locator('.share-box button', { hasText: 'Открыть доступ по ссылке' }).click();
  await page.locator('.share-url').waitFor();
  const link = await page.locator('.share-url').inputValue();
  assert.equal(link, BASE + 'index.html#/s/' + TOKEN);
  await page.locator('.share-box button', { hasText: 'Скопировать ссылку' }).click();
  await page.waitForFunction(() => /Ссылка скопирована/.test(document.querySelector('.share-status')?.textContent || ''));
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), link, 'the link is really in the clipboard');
  assert.ok(await page.locator('.share-box a', { hasText: 'Проверить, как видят ученики' }).getAttribute('href') === link);
  await shot(page, 'teacher-lesson');
  ok('own lesson: access off by default → «Открыть доступ» → link shown, copied for real, «Проверить, как видят ученики»');
  page.once('dialog', d => d.accept());
  await page.locator('.share-off').click();
  await page.waitForFunction(() => /выключен/.test(document.querySelector('.share-flag')?.textContent || ''));
  assert.equal(state.token, null);
  ok('«Выключить доступ» asks first and stops the link');

  // 3. Рабочий лист A4 по своему уроку
  await page.evaluate(() => { window.print = () => { window.__printed = document.getElementById('lexigoPrint')?.innerText || ''; }; });
  await page.locator('.ws-panel summary').click();
  await page.locator('.ws-panel button', { hasText: 'распечатать' }).click();
  const printed = await page.evaluate(() => window.__printed);
  assert.match(printed, /Урок учителя · Food and drinks — extra words/);
  assert.match(printed, /Критерии оценивания для учителя/);
  assert.equal(await page.evaluate(() => document.querySelectorAll('#lexigoPrint .print-question').length), words.length);
  await page.locator('.ws-types input[value=quiz]').uncheck(); await page.locator('.ws-types input[value=truefalse]').uncheck(); await page.locator('.ws-types input[value=spell]').uncheck();
  await page.locator('.ws-panel button', { hasText: 'распечатать' }).click();
  assert.match(await page.locator('.ws-msg').innerText(), /хотя бы один тип/);
  ok('worksheet A4 for the teacher\'s own lesson: all words, teacher sheet with the lesson title; no types → explained');

  // 3b. Кабинет: «＋ Создать урок» открывает форму, черновик не теряется; «🔗 Поделиться» в «Мои уроки»
  await page.goto(BASE + 'me.html?new=1');
  await page.locator('#lsTitle').waitFor({ timeout: 15000 });
  assert.equal(await page.evaluate(() => location.search), '', 'the address is cleaned');
  await page.fill('#lsTitle', 'Weather words'); await page.fill('#lsWords', 'sunny — солнечный\nrainy — дождливый');
  await page.goto(BASE + 'me.html?new=1'); await page.locator('#lsTitle').waitFor({ timeout: 15000 });
  assert.equal(await page.inputValue('#lsTitle'), 'Weather words', 'draft title restored');
  assert.match(await page.inputValue('#lsWords'), /rainy — дождливый/, 'draft words restored');
  state.token = null;
  await page.goto(BASE + 'me.html?tab=lessons');
  await page.locator('.ml-card button', { hasText: 'Поделиться' }).click();
  await page.locator('.dialog .share-box button', { hasText: 'Открыть доступ по ссылке' }).click();
  await page.locator('.dialog .share-url').waitFor();
  assert.equal(await page.locator('.dialog .share-url').inputValue(), BASE + 'index.html#/s/' + TOKEN);
  await page.locator('.dialog button', { hasText: 'Готово' }).click();
  await page.locator('.ml-shared').waitFor();
  ok('cabinet: me.html?new=1 opens the form, the draft survives; «🔗 Поделиться» in «Мои уроки» gives the same link');
  await ctx.close();
}

// 4. Ученик без аккаунта открывает ссылку на другом «устройстве» (новый контекст браузера)
{
  state.shared = true; state.calls = [];
  const { ctx, page } = await context();
  await page.goto(BASE + 'index.html#/s/' + TOKEN);
  await page.locator('#myLessonTitle').waitFor({ timeout: 15000 });
  assert.equal(await page.evaluate(() => location.hash), '#/my/s-' + TOKEN);
  assert.equal(await page.locator('#myLessonTitle').innerText(), 'Food and drinks — extra words');
  assert.match(await page.locator('.my-head .eyebrow').innerText(), /ПО ССЫЛКЕ/);
  assert.equal(await page.locator('.my-word-list li').count(), words.length);
  assert.equal(await page.locator('.share-box, .ws-panel, a[href*="me.html?edit"]').count(), 0, 'no teacher tools for the student');
  assert.doesNotMatch(await page.locator('#myLessonPage').innerText(), /Виктория|Назначить|Редактировать|Удалить/, 'no teacher name or management actions');
  assert.match(await page.locator('.my-games .progress-note').innerText(), /на этом устройстве/);
  assert.ok(!state.calls.some(c => /custom_lessons/.test(c)), 'the student never reads the lessons table');
  await shot(page, 'student-shared');
  await page.locator('.my-games .mode[data-play=quiz]').click();
  await page.waitForFunction(() => document.body.dataset.page === 'play' && typeof game !== 'undefined' && game && game.words.length > 0);
  assert.deepEqual(await page.evaluate(() => game.words.map(w => w.id).sort()), words.map((_, i) => 'c_22222222_' + i).sort());
  ok('student without an account: the link opens the lesson (title, words, games), no teacher data, games use its words');
  await ctx.close();
}

// 5. Неверная, выключенная ссылка, нет связи
{
  const { ctx, page } = await context();
  await page.goto(BASE + 'index.html#/s/not-a-token');
  await page.locator('#myLessonTitle').waitFor({ timeout: 15000 });
  assert.match(await page.locator('#myLessonTitle').innerText(), /Ссылка не открывает урок/);
  state.shared = false;
  await page.goto(BASE + 'index.html#/s/' + TOKEN); await page.reload();
  await page.locator('#myLessonTitle').waitFor();
  await page.waitForFunction(() => /Ссылка не открывает урок/.test(document.getElementById('myLessonTitle')?.textContent || ''));
  state.shared = true; state.down = true;
  await page.reload();
  await page.waitForFunction(() => /Нет связи/.test(document.getElementById('myLessonTitle')?.textContent || ''), null, { timeout: 20000 });
  state.down = false;
  await page.locator('.my-empty button', { hasText: 'Попробовать ещё раз' }).click();
  await page.waitForFunction(() => /Food and drinks/.test(document.getElementById('myLessonTitle')?.textContent || ''), null, { timeout: 15000 });
  ok('wrong link, switched-off link, no connection (then «Попробовать ещё раз» works)');
  await ctx.close();
}

// 6. Копирование недоступно → ссылка выделена, «скопирована» не пишем
{
  const { ctx, page } = await context({ teacher: true, clipboard: false });
  await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) } }); document.execCommand = () => false; });
  state.token = TOKEN;
  await page.goto(BASE + 'index.html#/my/t-' + LESSON);
  await page.locator('.share-url').waitFor({ timeout: 15000 });
  await page.locator('.share-box button', { hasText: 'Скопировать ссылку' }).click();
  await page.waitForFunction(() => /вручную/.test(document.querySelector('.share-status')?.textContent || ''));
  assert.doesNotMatch(await page.locator('.share-status').innerText(), /скопирована/);
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('share-url')), true, 'the link is selected for manual copy');
  ok('copy blocked: no false «скопирована», the link is selected for manual copying');
  await ctx.close();
}
await browser.close();
assert.deepEqual(errors, [], 'console errors: ' + errors.join(' | '));
console.log('PASS teacher-share: home card, share link, student without account, broken links, offline, worksheet');

