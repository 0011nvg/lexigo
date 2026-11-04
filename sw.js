/* LEXI · service worker (2026-11-04): только системные push-уведомления и переход по нажатию.
 * Ничего не кэширует — сайт всегда загружается свежим (обновления не «застревают»).
 * Уведомления присылает сервер (Supabase Edge Function push-worker) через Web Push (VAPID). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data ? event.data.text() : '' }; }
  const title = String(d.title || 'LEXI').slice(0, 80);
  event.waitUntil(self.registration.showNotification(title, {
    body: String(d.body || '').slice(0, 240),
    icon: 'assets/lexi-icon-192.png',
    badge: 'assets/lexi-icon-192.png',
    tag: d.tag || undefined,
    lang: 'ru',
    data: { url: typeof d.url === 'string' ? d.url : 'index.html' }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const scope = self.registration.scope;
  let url;
  try { url = new URL((event.notification.data && event.notification.data.url) || 'index.html', scope).href; } catch { url = scope; }
  if (!url.startsWith(scope)) url = scope;          // только страницы LEXI
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (!c.url.startsWith(scope)) continue;
      await c.focus();
      try { await c.navigate(url); } catch { c.postMessage({ type: 'lexi-open', url }); }
      return;
    }
    await self.clients.openWindow(url);
  })());
});
