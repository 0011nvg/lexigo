// Screenshots of the account pages (local Supabase stack) for visual review.
import { chromium } from 'playwright';
const SITE = 'http://127.0.0.1:4173/', CLOUD = 'http://127.0.0.1:54321', ANON = process.env.CLOUD_ANON, OUT = process.env.OUT || '/tmp/shots';
const run = Date.now().toString(36), PASS = 'Lexi-test-2026!';
const b = await chromium.launch();
async function dev(vp) { const c = await b.newContext({ viewport: vp, bypassCSP: true, deviceScaleFactor: 1 }); await c.route('**/config.js', r => r.fulfill({ contentType: 'application/javascript', body: `window.LEXIGO_CLOUD={url:'${CLOUD}',anonKey:'${ANON}'}` })); return c; }
async function api(page, fn, arg) { return page.evaluate(fn, arg); }
const D = { width: 1366, height: 900 }, M = { width: 390, height: 844 };
const tc = await dev(D), t = await tc.newPage();
await t.goto(SITE + 'auth.html#signup'); await t.waitForTimeout(600); await t.screenshot({ path: OUT + '/acc-auth-desk.png' });
const sign = async (p, role, name, email) => api(p, async ([role, name, email, pass]) => { const sb = await window.LexigoCloud.client(); const r = await sb.auth.signUp({ email, password: pass, options: { data: { role, display_name: name } } }); window.LexigoAccountHint.set({ uid: r.data.user.id, name, role }); return r.data.user.id; }, [role, name, email, PASS]);
await sign(t, 'teacher', 'Виктория Геннадьевна', 't' + run + '@x.test');
const g = await api(t, async () => { const sb = await window.LexigoCloud.client(); const { data } = await sb.rpc('create_group', { p_name: '5 «Б»' }); await sb.rpc('create_group', { p_name: 'Группа по средам' }); await sb.from('custom_lessons').insert({ owner_id: (await sb.auth.getUser()).data.user.id, title: 'Фрукты — дополнительно', words: [{ en: 'apple', ru: 'яблоко' }, { en: 'pear', ru: 'груша' }, { en: 'plum', ru: 'слива' }] }); return data; });
const names = ['Маша', 'Саша', 'Дима', 'Аня'];
const sc = await dev(M), s = await sc.newPage(); await s.goto(SITE + 'auth.html'); await s.waitForTimeout(300);
await s.screenshot({ path: OUT + '/acc-auth-mob.png', fullPage: true });
for (const [i, n] of names.entries()) {
  const c = await dev(D), p = await c.newPage(); await p.goto(SITE + 'auth.html'); await p.waitForTimeout(200);
  await sign(p, 'student', n, 's' + i + run + '@x.test');
  await api(p, async ([code, i]) => { const sb = await window.LexigoCloud.client(); await sb.rpc('join_group', { p_code: code });
    const ev = Array.from({ length: 12 }, (_, k) => ({ w: 'w' + (300 + k), ok: (k + i) % 4 !== 0, k: k % 3 ? 'recognition' : 'recall' }));
    await sb.rpc('submit_session', { p: { client_id: 'demo-' + i + '-a-' + Date.now(), mode: 'quiz', finished: true, scope: 'lesson', grade: 3, section_index: 2, route: '/lesson/3/2', title: 'Spotlight 3 · Unit 2: School subjects', events: ev } }); }, [g.join_code, i]);
  if (i === 0) { await p.close(); }
  await c.close();
}
await t.goto(SITE + 'me.html'); await t.locator('.group-card').first().waitFor(); await t.waitForTimeout(500);
await t.screenshot({ path: OUT + '/acc-teacher-desk.png', fullPage: true });
await t.getByRole('tab', { name: 'Задания' }).click(); await t.getByRole('button', { name: '＋ Новое задание' }).click();
await t.locator('.lessons-pick label').first().click(); await t.waitForTimeout(300);
await t.screenshot({ path: OUT + '/acc-wizard-desk.png', fullPage: true });
await t.getByRole('button', { name: 'Назначить' }).click(); await t.locator('article.group-card').first().waitFor();
await t.getByRole('button', { name: 'Результаты' }).first().click(); await t.locator('.dialog .tbl').waitFor(); await t.waitForTimeout(400);
await t.screenshot({ path: OUT + '/acc-results-desk.png' });
await t.getByRole('tab', { name: 'Мои уроки' }).click({ force: true }).catch(() => {});
// student cabinet, mobile + desktop
await sign(s, 'student', 'Маша-моб', 'm' + run + '@x.test');
await api(s, async code => { const sb = await window.LexigoCloud.client(); await sb.rpc('join_group', { p_code: code }); await sb.rpc('submit_session', { p: { client_id: 'demo-m-' + Date.now(), mode: 'spell', finished: true, scope: 'lesson', grade: 3, section_index: 2, route: '/lesson/3/2', title: 'Spotlight 3 · Unit 2', events: Array.from({ length: 8 }, (_, k) => ({ w: 'w' + (300 + k), ok: true, k: 'recall' })) } }); }, g.join_code);
await s.goto(SITE + 'me.html'); await s.locator('.st-hero').waitFor(); await s.waitForTimeout(500);
await s.screenshot({ path: OUT + '/acc-student-mob.png', fullPage: true });
await s.setViewportSize(D); await s.reload(); await s.locator('.st-hero').waitFor(); await s.waitForTimeout(500);
await s.screenshot({ path: OUT + '/acc-student-desk.png', fullPage: true });
await s.locator('.task-card-s a').first().click(); await s.locator('.task-overlay').waitFor(); await s.waitForTimeout(300);
await s.screenshot({ path: OUT + '/acc-task-desk.png' });
await b.close(); console.log('screens done');
