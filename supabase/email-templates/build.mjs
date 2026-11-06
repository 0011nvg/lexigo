// LEXI — русские письма Supabase Auth в фирменном стиле (2026-11-02).
// Шаблоны собираются из одного макета: node supabase/email-templates/build.mjs
// Готовые .html вставляются в Supabase: Authentication → Emails → Templates (см. README.md рядом).
// Переменные Supabase (Go templates): {{ .ConfirmationURL }}, {{ .Email }}, {{ .NewEmail }}, {{ .Token }}, {{ .Data.display_name }}.
import { writeFileSync } from 'node:fs';
const SITE = 'https://mylexi.ru/';
const LOGO = SITE + 'assets/lexi-icon-192.png';
const hello = '{{ if .Data.display_name }}Привет, {{ .Data.display_name }}! 👋{{ else }}Привет! 👋{{ end }}';

function layout({ preheader, title, body, button, note }) {
  const btn = button ? `
          <tr><td align="center" style="padding:8px 32px 6px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#b4ef3a" style="border-radius:16px">
              <a href="{{ .ConfirmationURL }}" target="_blank" style="display:inline-block;padding:16px 30px;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:bold;color:#13200a;text-decoration:none;border-radius:16px;border-bottom:4px solid #8fc21d">${button}</a>
            </td></tr></table>
          </td></tr>
          <tr><td style="padding:14px 32px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#6c7593">
            Кнопка не нажимается? Скопируйте ссылку в адресную строку браузера:<br>
            <a href="{{ .ConfirmationURL }}" style="color:#2c56f5;word-break:break-all">{{ .ConfirmationURL }}</a>
          </td></tr>` : '';
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f5f6fd">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f5f6fd">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f6fd" style="background:#f5f6fd">
  <tr><td align="center" style="padding:28px 12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 10px 28px -14px rgba(27,42,107,.28)">
      <tr><td bgcolor="#2c56f5" style="background:#2c56f5;background-image:linear-gradient(120deg,#1b2a6b,#2c56f5);padding:22px 32px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="middle" style="padding-right:12px"><img src="${LOGO}" width="44" height="44" alt="" style="display:block;border:0;border-radius:12px"></td>
          <td valign="middle" style="font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:900;letter-spacing:1px;color:#ffffff">LEXI</td>
        </tr></table>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#d8e1ff;padding-top:6px">Английские слова — в игре</div>
      </td></tr>
      <tr><td style="padding:28px 32px 6px;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:bold;line-height:1.3;color:#141b3d">${title}</td></tr>
      <tr><td style="padding:6px 32px 14px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#141b3d">${body}</td></tr>${btn}
      <tr><td style="padding:22px 32px 6px;font-family:Arial,Helvetica,sans-serif;font-size:13.5px;line-height:1.6;color:#4b5577">${note}</td></tr>
      <tr><td style="padding:10px 32px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#141b3d">До встречи в LEXI! 🐱<br><b>Команда LEXI</b></td></tr>
      <tr><td bgcolor="#f0f3ff" style="background:#f0f3ff;padding:16px 32px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#6c7593">
        Это автоматическое письмо, отвечать на него не нужно. LEXI — <a href="${SITE}" style="color:#2c56f5">mylexi.ru</a><br>
        Письмо отправлено на адрес {{ .Email }}.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
`;
}
const T = {
  confirmation: { subject: 'Добро пожаловать в LEXI! Подтвердите электронную почту', html: layout({
    preheader: 'Остался один шаг — подтвердите адрес электронной почты.',
    title: 'Добро пожаловать в LEXI!',
    body: `${hello}<br><br>LEXI — платформа, где изучение английских слов превращается в увлекательную игру вместе с котёнком Лекси.<br><br>Чтобы завершить регистрацию, подтвердите свой адрес электронной почты.`,
    button: 'Подтвердить электронную почту',
    note: 'Если вы не регистрировались в LEXI, просто проигнорируйте это письмо.' }) },
  recovery: { subject: 'LEXI: восстановление пароля', html: layout({
    preheader: 'Ссылка, чтобы придумать новый пароль.',
    title: 'Восстановление пароля',
    body: `${hello}<br><br>Мы получили запрос на смену пароля для вашего аккаунта LEXI. Нажмите кнопку и придумайте новый пароль.`,
    button: 'Придумать новый пароль',
    note: 'Ссылка действует 1 час и подходит только один раз. Если вы не просили сменить пароль, ничего делать не нужно — старый пароль продолжит работать.' }) },
  email_change: { subject: 'LEXI: подтвердите новый адрес почты', html: layout({
    preheader: 'Подтвердите смену адреса электронной почты.',
    title: 'Смена адреса электронной почты',
    body: `${hello}<br><br>Вы попросили сменить адрес почты в LEXI с <b>{{ .Email }}</b> на <b>{{ .NewEmail }}</b>. Подтвердите, пожалуйста, это изменение.`,
    button: 'Подтвердить новый адрес',
    note: 'Если вы не меняли адрес, не нажимайте кнопку и смените пароль в кабинете LEXI.' }) },
  magic_link: { subject: 'LEXI: ссылка для входа', html: layout({
    preheader: 'Войдите в LEXI одной кнопкой.',
    title: 'Вход в LEXI',
    body: `${hello}<br><br>Нажмите кнопку, чтобы войти в свой аккаунт LEXI.`,
    button: 'Войти в LEXI',
    note: 'Ссылка действует 1 час и подходит только один раз. Если вы не пытались войти, просто проигнорируйте письмо.' }) },
  invite: { subject: 'Вас пригласили в LEXI', html: layout({
    preheader: 'Приглашение в LEXI — английские слова в игре.',
    title: 'Приглашение в LEXI',
    body: `Привет! 👋<br><br>Вас пригласили в LEXI — платформу, где английские слова учатся в игре. Нажмите кнопку, чтобы принять приглашение.`,
    button: 'Принять приглашение',
    note: 'Если вы не ждали приглашения, просто проигнорируйте письмо.' }) },
  reauthentication: { subject: 'LEXI: код подтверждения', html: layout({
    preheader: 'Код для подтверждения действия в LEXI.',
    title: 'Код подтверждения',
    body: `${hello}<br><br>Ваш код для подтверждения действия в LEXI:<br><br><span style="display:inline-block;padding:12px 20px;border-radius:14px;background:#eef3ff;font-size:28px;font-weight:bold;letter-spacing:6px;color:#1b2a6b">{{ .Token }}</span>`,
    button: null,
    note: 'Никому не сообщайте этот код. Если вы ничего не подтверждали, просто проигнорируйте письмо.' }) }
};
const dir = new URL('./', import.meta.url);
for (const [k, v] of Object.entries(T)) writeFileSync(new URL(k + '.html', dir), v.html);
writeFileSync(new URL('subjects.json', dir), JSON.stringify(Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v.subject])), null, 2) + '\n');
console.log('written:', Object.keys(T).join(', '));
