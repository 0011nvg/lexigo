/* LEXI · push-уведомления на этом устройстве (2026-11-04).
 * Настоящие системные уведомления через Web Push: service worker (sw.js) + подписка браузера + сервер
 * (таблица push_subscriptions, отправка — Edge Function push-worker). Разрешение спрашиваем только по кнопке
 * «Включить уведомления», никогда при открытии сайта.
 * iPhone/iPad: Web Push работает с iOS 16.4 в веб-приложении, добавленном на экран «Домой»; в обычной вкладке
 * Safari подписки нет — показываем, как установить LEXI. Открытый ключ VAPID отдаёт сервер (push_public_key). */
(() => {
  'use strict';
  const SCOPE = './';
  const hasApi = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
  const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  let regPromise = null;
  function register() {
    if (!('serviceWorker' in navigator)) return Promise.resolve(null);
    if (!regPromise) regPromise = navigator.serviceWorker.register('sw.js', { scope: SCOPE }).catch(e => { console.warn('LEXI sw', e); return null; });
    return regPromise;
  }
  async function currentSub() {
    if (!hasApi()) return null;
    const reg = await register(); if (!reg) return null;
    try { return await reg.pushManager.getSubscription(); } catch { return null; }
  }
  /* состояние для интерфейса:
     unsupported — браузер не умеет Web Push; ios-install — iPhone в обычной вкладке Safari (нужно «На экран Домой»);
     denied — уведомления запрещены в настройках; off — можно включить; on — включены на этом устройстве */
  async function status() {
    if (!hasApi()) return { state: isIOS() && !standalone() ? 'ios-install' : 'unsupported', ios: isIOS() };
    if (Notification.permission === 'denied') return { state: 'denied', ios: isIOS() };
    const sub = await currentSub();
    return { state: sub && Notification.permission === 'granted' ? 'on' : 'off', ios: isIOS(), sub };
  }
  function payload(sub) {
    const j = sub.toJSON();
    return { endpoint: sub.endpoint, p256dh: j.keys && j.keys.p256dh || b64u(sub.getKey('p256dh')), auth: j.keys && j.keys.auth || b64u(sub.getKey('auth')), ua: navigator.userAgent.slice(0, 200) };
  }
  /* по нажатию кнопки: системный запрос → подписка → сервер. Запрос разрешения — первым действием (iOS требует жест). */
  async function enable(sb) {
    if (!hasApi()) return status();
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm !== 'granted') return { state: perm === 'denied' ? 'denied' : 'off', ios: isIOS(), dismissed: perm !== 'denied' };
    const reg = await register(); if (!reg) throw new Error('service worker unavailable');
    await navigator.serviceWorker.ready;
    const { data: key, error } = await sb.rpc('push_public_key');
    if (error || !key) throw error || new Error('no server key');
    let sub = await reg.pushManager.getSubscription();
    if (sub) {
      // подписка, сделанная со старым ключом, не примет уведомления — пересоздаём
      const old = sub.options && sub.options.applicationServerKey ? b64u(sub.options.applicationServerKey) : null;
      if (old && old !== key) { try { await sub.unsubscribe(); } catch { /* ignore */ } sub = null; }
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(key) });
    const p = payload(sub);
    const r = await sb.rpc('push_subscribe', p);
    if (r.error) throw r.error;
    return { state: 'on', ios: isIOS(), devices: r.data && r.data.devices };
  }
  async function disable(sb) {
    const sub = await currentSub();
    if (sub) { try { if (sb) await sb.rpc('push_unsubscribe', { endpoint: sub.endpoint }); } catch { /* offline: the server drops it after a failed send */ } try { await sub.unsubscribe(); } catch { /* ignore */ } }
    return status();
  }
  /* при каждом входе: если разрешение уже есть — подписка этого устройства закреплена за текущим аккаунтом */
  async function sync(sb) {
    if (!hasApi() || Notification.permission !== 'granted' || !sb) return;
    const sub = await currentSub(); if (!sub) return;
    try { await sb.rpc('push_subscribe', payload(sub)); } catch { /* offline — next time */ }
  }
  /* выход из аккаунта: уведомления этого аккаунта на устройство больше не приходят */
  async function beforeSignOut(sb) { try { await disable(sb); } catch { /* ignore */ } }

  // нажатие на уведомление, если окно уже открыто и навигация из service worker недоступна
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => {
    const d = e.data || {};
    if (d.type === 'lexi-open' && typeof d.url === 'string' && d.url.startsWith(location.origin)) location.href = d.url;
  });
  if (hasApi() && (standalone() || Notification.permission === 'granted')) register();

  // на страницах сайта: после входа закрепить подписку устройства за аккаунтом
  window.LexigoCloudSession?.ready.then(x => { if (x && x.sb) sync(x.sb); });
  window.LexigoPush = Object.freeze({ status, enable, disable, sync, beforeSignOut, register, isIOS, standalone, hasApi });
})();
