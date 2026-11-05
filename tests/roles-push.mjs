// Роли, шапка, раздел «Уроки», уведомления в кабинете (2026-11-04). Сервер Supabase подменён (tests/fake-cloud.mjs);
// серверные правила (RLS, триггеры уведомлений, отправка Web Push) проверены SQL-сценариями — см. README «v7».
import assert from 'node:assert/strict';
import { chromium } from './browser-runtime.mjs';
import { useFakeCloud, IDS } from './fake-cloud.mjs';
const BASE = (process.env.LEXIGO_URL || 'http://127.0.0.1:4173/index.html').replace(/index\.html$/, '');
const browser = await chromium.launch({ headless: true });
const errors = [];
const ok = m => console.log('  ✓ ' + m);
const watch = page => { page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errors.push(m.text()); }); };
const visible = (page, sel) => page.locator(sel).isVisible();

// 1. Гость: учительского нет; «Уроки» открывает раздел; прямая ссылка на материалы учителя не открывается
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); watch(page);
  await page.goto(BASE + 'index.html#/lesson/5/3'); await page.locator('#launcher').waitFor();
  assert.equal(await visible(page, '#roleSwitch'), false); assert.equal(await visible(page, '#lessonPrint'), false);
  await page.goto(BASE + 'index.html#/lesson/5/3/teacher'); await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => [document.body.dataset.page, location.hash].join(' ')), 'lesson #/lesson/5/3', 'teacher materials redirect to the lesson');
  assert.equal(await page.locator('.lexi-chip, #lexiChip').count(), 0, 'no level chip with a cat in the header');
  await page.goto(BASE + 'index.html#/home'); await page.locator('#homeNav').click();
  await page.waitForFunction(() => document.body.dataset.page === 'lessons');
  assert.equal(await page.evaluate(() => location.hash), '#/lessons');
  await page.locator('.hub-books .hub-book').first().waitFor();
  assert.equal(await page.locator('.hub-book').count(), 9);
  assert.match(await page.locator('.hub-guest').innerText(), /после входа/);
  assert.equal(await page.locator('#breadcrumbs').isVisible(), false);
  await page.goto(BASE + 'index.html#/lesson/5/3'); await page.locator('#breadcrumbs a').first().click();
  await page.waitForFunction(() => document.body.dataset.page === 'lessons');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  ok('guest: no teacher tools, /teacher link refused, «Уроки» (header and breadcrumbs) opens the lessons section');
  await page.close();
}

// 2. Ученик: значок уровня в шапке → кабинет; учительского нет; «Уроки» — уроки от учителя
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const state = await useFakeCloud(ctx, { role: 'student', xp: 150 });
  const page = await ctx.newPage(); watch(page);
  await page.goto(BASE + 'index.html#/home');
  await page.locator('#accountButton .lvl-badge').waitFor({ timeout: 15000 });
  assert.equal(await page.locator('#accountButton').getAttribute('href'), 'me.html');
  assert.match(await page.locator('#accountButton').getAttribute('aria-label'), /Личный кабинет: Маша · Путешественник, уровень 2/);
  assert.equal(await page.locator('#accountButton .lvl-badge.lvl-2').count(), 1, 'level 2 badge (compass)');
  assert.equal(await page.locator('#accountButton img').count(), 0, 'no second cat picture in the header');
  await page.goto(BASE + 'index.html#/lesson/5/3'); await page.waitForTimeout(300);
  assert.equal(await visible(page, '#roleSwitch'), false); assert.equal(await visible(page, '#lessonPrint'), false);
  await page.goto(BASE + 'index.html#/lesson/5/3/teacher'); await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => document.body.dataset.page), 'lesson', 'student cannot open teacher materials by link');
  await page.goto(BASE + 'index.html#/my/t-' + IDS.lesson); await page.locator('#myLessonTitle').waitFor({ timeout: 15000 });
  assert.doesNotMatch(await page.locator('#myLessonPage').innerText(), /Редактировать|Назначить ученикам/);
  await page.goto(BASE + 'index.html#/lessons'); await page.locator('.hub-sec h2', { hasText: 'От учителя' }).waitFor({ timeout: 15000 });
  assert.match(await page.locator('#lessonsPage').innerText(), /Погода — слова урока/);
  assert.equal(await page.locator('#lessonsPage .hub-create, #lessonsPage a[href*="me.html?new"]').count(), 0, 'no «create lesson» for a student');
  ok('student: level badge → cabinet, no teacher tools or links, «Уроки» lists the teacher\'s lesson');
  await ctx.close();
}

// 3. Учитель: «Материалы для учителя» доступны; «Уроки» — свои уроки, создать, ссылка
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const state = await useFakeCloud(ctx, { role: 'teacher' });
  const page = await ctx.newPage(); watch(page);
  await page.goto(BASE + 'index.html#/lesson/5/3'); await page.locator('#accountButton .lvl-teacher').waitFor({ timeout: 15000 });
  assert.equal(await visible(page, '#lessonPrint'), true);
  await page.locator('#lessonPrint').click(); await page.locator('#printTest').waitFor();
  assert.equal(await page.evaluate(() => document.body.dataset.page), 'teacher');
  await page.goto(BASE + 'index.html#/lessons'); await page.locator('.hub-row').first().waitFor({ timeout: 15000 });
  assert.equal(await page.locator('.hub-create').getAttribute('href'), 'me.html?new=1');
  await page.locator('.hub-row button', { hasText: 'Ссылка' }).click();
  await page.locator('.hub-share .share-box button', { hasText: 'Открыть доступ' }).click();
  await page.locator('.hub-share .share-url').waitFor();
  assert.match(await page.locator('.hub-share .share-url').inputValue(), /#\/s\/a3f1c2d4e5b6978877665544332211aa$/);
  ok('teacher: materials page opens, «Уроки» shows own lessons with create, open, edit and the student link');
  await ctx.close();
}

// 4. Уведомления в кабинете: ученик — включить (подписка уходит на сервер), настройки, проверка, выключение, выход
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['notifications'] });
  const state = await useFakeCloud(ctx, { role: 'student' });
  await ctx.addInitScript(() => {
    // браузер без связи с push-сервисом: подписку имитируем, всё остальное — настоящее (service worker, разрешение)
    const key = new Uint8Array(65).fill(4);
    const fake = { endpoint: 'https://fcm.googleapis.com/fcm/send/test-device', options: { applicationServerKey: null }, toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/test-device', keys: { p256dh: 'BPfake_p256dh_key_for_tests_only_0123456789', auth: 'auth_secret_123' } }), getKey: () => key.buffer, unsubscribe: async () => { window.__unsub = (window.__unsub || 0) + 1; window.__sub = null; return true; } };
    if (window.PushManager) {
      PushManager.prototype.subscribe = async function () { window.__sub = fake; return fake; };
      PushManager.prototype.getSubscription = async function () { return window.__sub || null; };
    }
  });
  const page = await ctx.newPage(); watch(page);
  await page.goto(BASE + 'me.html'); await page.locator('#notifications').waitFor({ timeout: 15000 });
  await page.locator('#notifications .notif-state').waitFor();
  assert.match(await page.locator('#notifications .notif-state').innerText(), /выключены/);
  assert.equal(state.rpc.filter(([n]) => n === 'push_subscribe').length, 0, 'nothing is requested on page open');
  await page.locator('#notifications button', { hasText: 'Включить уведомления' }).click();
  await page.waitForFunction(() => /Включены на этом устройстве/.test(document.querySelector('#notifications .notif-state')?.textContent || ''), null, { timeout: 15000 });
  const sub = state.rpc.find(([n]) => n === 'push_subscribe');
  assert.ok(sub && sub[1].endpoint === 'https://fcm.googleapis.com/fcm/send/test-device' && sub[1].p256dh && sub[1].auth, 'the device subscription is stored on the server');
  assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration('./'))?.active?.scriptURL.endsWith('/sw.js')), true, 'service worker registered');
  await page.locator('#notifications .notif-opt', { hasText: 'Новые уроки' }).locator('input').uncheck();
  await page.waitForFunction(() => /Сохранено/.test(document.querySelector('#notifications .notif-msg')?.textContent || ''));
  assert.equal(state.prefs.lessons, false);
  await page.locator('#notifications select').selectOption('20:30');
  await page.waitForTimeout(300); assert.equal(state.prefs.daily_time, '20:30');
  await page.locator('#notifications button', { hasText: 'Проверить уведомление' }).click();
  await page.waitForFunction(() => /Отправлено/.test(document.querySelector('#notifications .notif-msg')?.textContent || ''));
  assert.ok(state.rpc.some(([n]) => n === 'push_test'));
  assert.doesNotMatch(await page.locator('#notifications').innerText(), /Ученик прошёл/, 'no teacher settings for a student');
  await page.locator('#notifications button', { hasText: 'Выключить на этом устройстве' }).click();
  await page.waitForFunction(() => /выключены/.test(document.querySelector('#notifications .notif-state')?.textContent || ''));
  assert.ok(state.rpc.some(([n, a]) => n === 'push_unsubscribe' && a.endpoint === 'https://fcm.googleapis.com/fcm/send/test-device'));
  ok('student cabinet: «Включить уведомления» → permission → subscription saved; lessons/daily/time saved; test push; off');
  // выход: подписка устройства снимается до выхода
  await page.locator('#notifications button', { hasText: 'Включить уведомления' }).click();
  await page.waitForFunction(() => /Включены/.test(document.querySelector('#notifications .notif-state')?.textContent || ''));
  const before = state.rpc.filter(([n]) => n === 'push_unsubscribe').length;
  await page.locator('#logoutBtn').click(); await page.waitForURL(/index\.html/, { timeout: 15000 });
  assert.equal(state.rpc.filter(([n]) => n === 'push_unsubscribe').length, before + 1, 'sign-out removes this device from the account');
  ok('sign-out: this device stops receiving the account\'s notifications');
  await ctx.close();
}

// 5. iPhone в обычной вкладке Safari и запрещённые уведомления — понятные инструкции, без всплывающих «уведомлений»
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1' });
  await useFakeCloud(ctx, { role: 'student' });
  await ctx.addInitScript(() => { delete window.PushManager; });
  const page = await ctx.newPage(); watch(page);
  await page.goto(BASE + 'me.html'); await page.locator('#notifications .notif-state').waitFor({ timeout: 15000 });
  assert.match(await page.locator('#notifications').innerText(), /На экран „Домой“/);
  assert.equal(await page.locator('#notifications button', { hasText: 'Включить уведомления' }).count(), 0);
  await ctx.close();
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await useFakeCloud(ctx2, { role: 'teacher' });
  await ctx2.addInitScript(() => { Object.defineProperty(Notification, 'permission', { get: () => 'denied' }); });
  const p2 = await ctx2.newPage(); watch(p2);
  await p2.goto(BASE + 'me.html'); await p2.locator('#notifications .notif-state').waitFor({ timeout: 15000 });
  assert.match(await p2.locator('#notifications').innerText(), /запрещены[\s\S]*Разрешить/);
  assert.match(await p2.locator('#notifications').innerText(), /Ученик прошёл все игры/, 'teacher sees the teacher setting');
  assert.doesNotMatch(await p2.locator('#notifications').innerText(), /Напоминание позаниматься/, 'and not the student reminder');
  ok('iPhone Safari tab → «На экран Домой» guide; permission denied → how to allow; teacher sees only teacher settings');
  await ctx2.close();
}
await browser.close();
assert.deepEqual(errors, [], 'console errors: ' + errors.join(' | '));
console.log('PASS roles-push: roles, header, «Уроки», notifications settings');
