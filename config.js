/* LEXI — подключение облачных аккаунтов (Supabase).
 *
 * Сюда вставляются ДВА публичных значения из Supabase → Project Settings → API:
 *   url      — Project URL, например https://abcdefghijklm.supabase.co
 *   anonKey  — ключ «anon public» (или «Publishable key», начинается с sb_publishable_)
 *
 * Эти значения предназначены для браузера и могут лежать в открытом репозитории:
 * доступ к данным защищён правилами Row Level Security из supabase/schema.sql.
 *
 * НИКОГДА не вставляйте сюда ключ service_role / Secret key — он даёт полный доступ к базе.
 * Пока поля пустые, сайт работает в гостевом режиме: прогресс хранится только на устройстве. */
window.LEXIGO_CLOUD = Object.freeze({
  url: 'https://ajzfspevzlhsfduwrlzu.supabase.co',
  anonKey: 'sb_publishable_Z4LfEMsYuKh8szLcNfefNg_MNWryiBt'
});
