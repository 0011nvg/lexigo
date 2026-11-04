/* Updates wait until all old tabs are closed, keeping active games consistent. */
(() => {
  'use strict';
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  function offerUpdate(registration) {
    if (!registration.waiting || !navigator.serviceWorker.controller || document.getElementById('lexiPwaUpdate')) return;
    const box = document.createElement('div'); box.id = 'lexiPwaUpdate'; box.setAttribute('role', 'status');
    box.style.cssText = 'position:fixed;z-index:9999;left:50%;bottom:max(16px,env(safe-area-inset-bottom));transform:translateX(-50%);width:max-content;max-width:calc(100vw - 32px);box-sizing:border-box;background:#1b2a6b;color:white;border-radius:16px;padding:12px 16px;box-shadow:0 4px 18px #0003;font:600 14px/1.4 system-ui,sans-serif;display:flex;align-items:center;gap:12px;flex-wrap:wrap';
    const text = document.createElement('span'); text.textContent = 'Доступно обновление. Закрой все вкладки LEXI и открой приложение снова.';
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', 'Закрыть');
    close.style.cssText = 'border:0;background:transparent;color:white;font:24px/1 system-ui,sans-serif;cursor:pointer'; close.addEventListener('click', () => box.remove());
    box.append(text, close); document.body.append(box);
  }
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
      offerUpdate(registration);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (worker) worker.addEventListener('statechange', () => { if (worker.state === 'installed') offerUpdate(registration); });
      });
    } catch (error) { console.warn('LEXI: service worker unavailable', error); }
  });
})();
