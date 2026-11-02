// LEXI — письма Supabase Auth на русском: регистрация → письмо → «Подтвердить электронную почту» → сообщение на сайте;
// устаревшая ссылка → русская ошибка и повторная отправка; восстановление пароля; смена адреса почты.
// Запускает второй GoTrue (автоподтверждение выключено, шаблоны из supabase/email-templates) и свой SMTP-приёмник.
// Требует запущенный стек (tests/e2e/start-local-supabase.sh) и сайт на :4173: node tests/e2e/email-flow.mjs
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const W = process.env.WORK || '/tmp/lexigo-supabase';
const SITE = 'http://127.0.0.1:4173/';
const ANON = process.env.CLOUD_ANON; assert.ok(ANON, 'CLOUD_ANON is required');
const AUTH_PORT = 9998, PROXY = 54322, SMTP = 2526;
const SUBJ = JSON.parse(readFileSync(new URL('../../supabase/email-templates/subjects.json', import.meta.url), 'utf8'));
const run = Date.now().toString(36), PASS = 'Lexi-test-2026!';
const passed = [], errors = []; const ok = m => { passed.push(m); console.log('  ✓ ' + m); };

/* ---------- tiny SMTP sink with MIME decoding ---------- */
const inbox = [];
const qpBytes = s => { const out = []; s = s.replace(/=\r?\n/g, ''); for (let i = 0; i < s.length; i++) { if (s[i] === '=' && /^[0-9A-F]{2}$/i.test(s.slice(i + 1, i + 3))) { out.push(parseInt(s.slice(i + 1, i + 3), 16)); i += 2; } else out.push(s.charCodeAt(i) & 255); } return Buffer.from(out); };
const qp = s => qpBytes(s).toString('utf8');
// RFC 2047: соседние закодированные слова склеиваются байтами (буква может быть разрезана между ними)
const word = s => s.replace(/(=\?utf-8\?[BQ]\?[^?]*\?=)\s+(?==\?utf-8\?)/gi, '$1').replace(/(?:=\?utf-8\?[BQ]\?[^?]*\?=)+/gi, run => Buffer.concat([...run.matchAll(/=\?utf-8\?([BQ])\?([^?]*)\?=/gi)].map(([, e, t]) => e.toUpperCase() === 'B' ? Buffer.from(t, 'base64') : qpBytes(t.replace(/_/g, ' ')))).toString('utf8'));
function parse(raw) {
  const [head, ...rest] = raw.split(/\r?\n\r?\n/); const body = rest.join('\n\n');
  const headers = {}; head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/).forEach(l => { const i = l.indexOf(':'); if (i > 0) headers[l.slice(0, i).toLowerCase()] = l.slice(i + 1).trim(); });
  let html = body; const ct = headers['content-type'] || '';
  const b = ct.match(/boundary="?([^";]+)"?/);
  const decode = (hdr, txt) => /base64/i.test(hdr) ? Buffer.from(txt.replace(/\s+/g, ''), 'base64').toString('utf8') : /quoted-printable/i.test(hdr) ? qp(txt) : txt;
  if (b) { const part = body.split('--' + b[1]).find(p => /text\/html/i.test(p)) || ''; const [ph, ...pb] = part.split(/\r?\n\r?\n/); html = decode(ph, pb.join('\n\n')); }
  else html = decode(headers['content-transfer-encoding'] || '', body);
  return { to: headers.to, subject: word(headers.subject || ''), html };
}
const smtp = net.createServer(sock => {
  let data = false, buf = ''; sock.write('220 lexi-test ESMTP\r\n');
  sock.on('data', chunk => {
    buf += chunk.toString('latin1');
    for (;;) {
      if (data) { const end = buf.indexOf('\r\n.\r\n'); if (end < 0) return; inbox.push(parse(Buffer.from(buf.slice(0, end), 'latin1').toString('latin1'))); buf = buf.slice(end + 5); data = false; sock.write('250 OK\r\n'); continue; }
      const i = buf.indexOf('\r\n'); if (i < 0) return; const line = buf.slice(0, i); buf = buf.slice(i + 2);
      const cmd = line.slice(0, 4).toUpperCase();
      if (cmd === 'EHLO' || cmd === 'HELO') sock.write('250-lexi-test\r\n250 8BITMIME\r\n');
      else if (cmd === 'DATA') { data = true; sock.write('354 go\r\n'); }
      else if (cmd === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
      else sock.write('250 OK\r\n');
    }
  });
}).listen(SMTP, '127.0.0.1');
async function mail(to, n = 1, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const m = inbox.filter(x => x.to && x.to.includes(to)); if (m.length >= n) return m[n - 1]; await new Promise(r => setTimeout(r, 200)); }
  throw new Error('no mail #' + n + ' for ' + to);
}
const link = m => { const x = m.html.match(/href="([^"]*verify[^"]*)"/); assert.ok(x, 'confirmation link in the mail'); return x[1].replace(/&amp;/g, '&'); };
function checkMail(m, key, button) {
  assert.equal(m.subject, SUBJ[key], key + ': Russian subject');
  assert.ok(m.html.includes(button), key + ': button «' + button + '»');
  assert.ok(m.html.includes('Команда LEXI') && m.html.includes('lexi-icon-192.png'), key + ': LEXI branding and logo');
  for (const en of ['Confirm your', 'Follow this link', 'Reset Password', 'Magic Link', 'Change Email', 'Confirm Change']) assert.ok(!m.html.includes(en), key + ': no English «' + en + '»');
  assert.ok(!/\{\{/.test(m.html), key + ': all template variables filled');
}

/* ---------- second GoTrue: real e-mail confirmation with our templates ---------- */
const T = SITE + 'supabase/email-templates/';
const env = { ...process.env, GOTRUE_API_HOST: '127.0.0.1', PORT: String(AUTH_PORT), API_EXTERNAL_URL: `http://127.0.0.1:${PROXY}/auth/v1`, GOTRUE_DB_DRIVER: 'postgres',
  DATABASE_URL: 'postgres://supabase_auth_admin@127.0.0.1:54329/lexigo_e2e?sslmode=disable', DB_NAMESPACE: 'auth', GOTRUE_SITE_URL: SITE, GOTRUE_URI_ALLOW_LIST: SITE + '**',
  GOTRUE_JWT_SECRET: 'lexigo-local-test-secret-0123456789abcdef', GOTRUE_JWT_EXP: '3600', GOTRUE_JWT_AUD: 'authenticated', GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated', GOTRUE_JWT_ADMIN_ROLES: 'service_role',
  GOTRUE_DISABLE_SIGNUP: 'false', GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true', GOTRUE_MAILER_AUTOCONFIRM: 'false', GOTRUE_PASSWORD_MIN_LENGTH: '8', GOTRUE_RATE_LIMIT_EMAIL_SENT: '1000', GOTRUE_LOG_LEVEL: 'warn',
  GOTRUE_SMTP_HOST: '127.0.0.1', GOTRUE_SMTP_PORT: String(SMTP), GOTRUE_SMTP_ADMIN_EMAIL: 'noreply@lexi.test', GOTRUE_SMTP_SENDER_NAME: 'LEXI', GOTRUE_SMTP_MAX_FREQUENCY: '1s',
  GOTRUE_MAILER_URLPATHS_CONFIRMATION: '/auth/v1/verify', GOTRUE_MAILER_URLPATHS_RECOVERY: '/auth/v1/verify', GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE: '/auth/v1/verify', GOTRUE_MAILER_URLPATHS_INVITE: '/auth/v1/verify',
  GOTRUE_MAILER_SECURE_EMAIL_CHANGE_ENABLED: 'true', GOTRUE_MAILER_OTP_EXP: '86400' };
for (const k of ['confirmation', 'recovery', 'email_change', 'magic_link', 'invite', 'reauthentication']) { env['GOTRUE_MAILER_TEMPLATES_' + k.toUpperCase()] = T + k + '.html'; env['GOTRUE_MAILER_SUBJECTS_' + k.toUpperCase()] = SUBJ[k]; }
const auth = spawn(W + '/auth', ['serve'], { cwd: W, env, stdio: ['ignore', 'ignore', 'pipe'] });
let authLog = ''; auth.stderr.on('data', d => { authLog += d; });
const proxy = spawn(process.execPath, [new URL('./proxy.mjs', import.meta.url).pathname], { env: { ...process.env, PROXY_PORT: String(PROXY), AUTH_PORT: String(AUTH_PORT) }, stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { const r = await fetch(`http://127.0.0.1:${PROXY}/auth/v1/health`); if (r.ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 200)); }

const browser = await chromium.launch({ headless: true });
async function page() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, bypassCSP: true, reducedMotion: 'reduce' });
  await ctx.route('**/config.js', r => r.fulfill({ contentType: 'application/javascript', body: `window.LEXIGO_CLOUD=Object.freeze({url:"http://127.0.0.1:${PROXY}",anonKey:${JSON.stringify(ANON)}});` }));
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  p.on('dialog', d => { errors.push('alert ' + d.message()); d.dismiss(); });
  return p;
}
// a new page load each time: going from auth.html#… to auth.html#… would only change the hash
const open = async (p, url) => { await p.goto('about:blank'); await p.goto(url); };
const english = async p => { const t = await p.locator('#authBox').innerText(); for (const en of ['Email', 'link', 'expired', 'invalid', 'Confirm', 'error']) assert.ok(!new RegExp('\\b' + en + '\\b').test(t), 'no English on screen: ' + t); };
try {
  /* 1. sign-up → Russian e-mail → confirmed message in Russian → cabinet */
  const email = `nastya-${run}@lexi.test`;
  const p = await page();
  await open(p, SITE + 'auth.html#signup'); await p.getByRole('tab', { name: 'Регистрация' }).click();
  await p.fill('#suName', 'Настя'); await p.fill('#suEmail', email); await p.fill('#suPassword', PASS);
  await p.check('#consentAge'); await p.check('#consentPolicy');
  await p.getByRole('button', { name: 'Создать аккаунт' }).click();
  await p.locator('#authBox h2', { hasText: 'Проверь почту!' }).waitFor();
  assert.match(await p.locator('.resend-box button').innerText(), /через \d+ с/, 'resend waits 60 s');
  const m1 = await mail(email);
  checkMail(m1, 'confirmation', 'Подтвердить электронную почту');
  assert.ok(m1.html.includes('Привет, Настя!'), 'greeting uses the name');
  assert.ok(m1.html.includes('Добро пожаловать в LEXI'));
  ok('sign-up: e-mail «' + m1.subject + '», button «Подтвердить электронную почту», name, logo, no English');
  const url1 = link(m1);
  await p.goto(url1);
  await p.locator('#authBox h2', { hasText: 'Электронная почта успешно подтверждена!' }).waitFor();
  assert.match(await p.locator('#authBox').innerText(), /Теперь вы можете пользоваться LEXI/);
  await english(p);
  await p.locator('#confirmedGo').click();
  await p.waitForURL(/me\.html/); await p.locator('.cab-head h1', { hasText: 'Настя' }).waitFor();
  ok('confirmation link → «Электронная почта успешно подтверждена! Теперь вы можете пользоваться LEXI» → «Продолжить» → cabinet');

  /* 2. the same link again → expired/used: Russian text and resend */
  const p2 = await page();
  await open(p2, url1);
  await p2.locator('#authBox h2', { hasText: 'Ссылка больше не действует' }).waitFor();
  await english(p2);
  assert.ok(await p2.locator('.resend-box button', { hasText: 'Отправить письмо ещё раз' }).count());
  ok('used link → «Ссылка больше не действует», explanation and «Отправить письмо ещё раз» in Russian');

  /* 3. unconfirmed account: resend from the error screen and from the login form */
  const email2 = `kostya-${run}@lexi.test`;
  await open(p2, SITE + 'auth.html#signup'); await p2.getByRole('tab', { name: 'Регистрация' }).click();
  await p2.fill('#suName', 'Костя'); await p2.fill('#suEmail', email2); await p2.fill('#suPassword', PASS);
  await p2.check('#consentAge'); await p2.check('#consentPolicy');
  await p2.getByRole('button', { name: 'Создать аккаунт' }).click();
  await mail(email2);
  await open(p2, SITE + 'auth.html#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  await p2.locator('#authBox h2', { hasText: 'Ссылка больше не действует' }).waitFor();
  await p2.fill('#resendEmail', email2);
  // Supabase разрешает повторное письмо не чаще раза в минуту: сначала честное русское сообщение, потом — отправка
  await p2.locator('.resend-box button').click();
  await p2.locator('.resend-box .acc-msg.err', { hasText: 'Подожди минуту' }).waitFor();
  await p2.waitForTimeout(61000);
  await p2.locator('.resend-box button').click();
  await p2.locator('.resend-box .acc-msg.ok', { hasText: 'Новое письмо отправлено' }).waitFor();
  const m2 = await mail(email2, 2);
  checkMail(m2, 'confirmation', 'Подтвердить электронную почту');
  await open(p2, SITE + 'auth.html'); await p2.fill('#loginEmail', email2); await p2.fill('#loginPassword', PASS);
  await p2.getByRole('button', { name: 'Войти' }).click();
  await p2.locator('.acc-msg.err', { hasText: 'Почта ещё не подтверждена' }).waitFor();
  await p2.locator('.resend-box button', { hasText: 'Отправить письмо ещё раз' }).waitFor();
  await p2.goto(link(m2));
  await p2.locator('#authBox h2', { hasText: 'Электронная почта успешно подтверждена!' }).waitFor();
  ok('expired link → resend (too early: «Подожди минуту»; after a minute: sent) → a new Russian e-mail; login before confirming → «Почта ещё не подтверждена» + resend; new link confirms');

  /* 4. password recovery */
  const p3 = await page();
  await open(p3, SITE + 'auth.html'); await p3.getByRole('button', { name: 'Забыли пароль?' }).click();
  await p3.fill('#resetEmail', email); await p3.getByRole('button', { name: 'Прислать ссылку' }).click();
  await p3.locator('.acc-msg.ok').waitFor();
  const m3 = await mail(email, 2);
  checkMail(m3, 'recovery', 'Придумать новый пароль');
  await p3.goto(link(m3));
  await p3.locator('#newPassword').waitFor();
  await p3.fill('#newPassword', 'Lexi-new-2026!'); await p3.getByRole('button', { name: 'Сохранить пароль' }).click();
  await p3.waitForURL(/me\.html/);
  ok('password recovery: e-mail «' + m3.subject + '», button «Придумать новый пароль», new password saved');

  /* 5. e-mail change: both letters in Russian */
  const newEmail = `nastya2-${run}@lexi.test`;
  const r = await p3.evaluate(async to => { const sb = await LexigoCloud.client(); const { error } = await sb.auth.updateUser({ email: to }, { emailRedirectTo: location.origin + '/auth.html' }); return error ? error.message : 'ok'; }, newEmail);
  assert.equal(r, 'ok');
  const mOld = await mail(email, 3), mNew = await mail(newEmail);
  for (const m of [mOld, mNew]) { checkMail(m, 'email_change', 'Подтвердить новый адрес'); assert.ok(m.html.includes(newEmail)); }
  await p3.goto(link(mOld));
  await p3.locator('#authBox h2', { hasText: 'Почти готово!' }).waitFor();
  await p3.goto(link(mNew));
  await p3.locator('#authBox h2', { hasText: 'Новый адрес почты подтверждён!' }).waitFor();
  ok('e-mail change: two Russian letters («Подтвердить новый адрес»), «Почти готово!» after the first link, «Новый адрес почты подтверждён!» after the second');

  /* 6. every template renders: magic link and reauthentication are also Russian */
  for (const k of ['magic_link', 'invite', 'reauthentication']) { const html = readFileSync(new URL('../../supabase/email-templates/' + k + '.html', import.meta.url), 'utf8'); assert.ok(/LEXI/.test(html) && /[а-я]{4}/.test(html) && !/Confirm (your|Change|signup)|Follow this link|Magic Link/.test(html.replace(/{{[^}]*}}/g, ""))); }
  ok('magic link, invite and reauthentication templates are Russian too');

  assert.deepEqual(errors, []);
  console.log(`PASS e-mail flow: ${passed.length} scenarios`);
} catch (e) {
  console.error('FAIL', e.message, errors.slice(0, 5), '\nauth log:', authLog.slice(-1500));
  try { for (const c of browser.contexts()) for (const pg of c.pages()) await pg.screenshot({ path: '/tmp/mail-fail-' + Math.random().toString(36).slice(2, 6) + '.png' }); } catch { /* */ }
  process.exitCode = 1;
} finally { await browser.close(); auth.kill(); proxy.kill(); smtp.close(); }
