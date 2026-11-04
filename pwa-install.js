/* Install guidance is optional and never blocks lessons. */
(() => {
  'use strict';
  const home = document.getElementById('homePage');
  if (!home) return;
  const mq = window.matchMedia('(display-mode: standalone)');
  const isInstalled = () => mq.matches || navigator.standalone === true;
  if (isInstalled()) return;

  const agent = navigator.userAgent || '';
  const ios = /iPhone|iPad|iPod/i.test(agent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(agent);
  const dismissedKey = 'lexi_install_dismissed_v1';
  const dismissedFor = 30 * 24 * 60 * 60 * 1000;
  let dismissed = false;
  try { const t = Number(localStorage.getItem(dismissedKey)); dismissed = t > 0 && Date.now() - t < dismissedFor; } catch { /* storage can be disabled */ }
  if (dismissed) return;

  const style = document.createElement('link');
  style.rel = 'stylesheet'; style.href = 'pwa-install.css?v=20261104-pwa1';
  document.head.append(style);
  const box = document.createElement('section');
  box.className = 'pwa-install'; box.hidden = true;
  box.setAttribute('aria-label', 'Установка LEXI');
  box.innerHTML = '<div class="pwa-install-main"><div><strong>LEXI всегда под рукой</strong><p>Добавь приложение на главный экран устройства.</p></div><div class="pwa-install-actions"><button class="pwa-install-open" type="button">Как добавить</button><button class="pwa-install-close" type="button" aria-label="Скрыть предложение установки">×</button></div></div><div class="pwa-install-guide" hidden></div>';
  const anchor = home.querySelector('.home-footnote');
  if (anchor) anchor.before(box); else home.append(box);
  const open = box.querySelector('.pwa-install-open');
  const close = box.querySelector('.pwa-install-close');
  const guide = box.querySelector('.pwa-install-guide');
  guide.id = 'pwa-install-guide'; open.setAttribute('aria-controls', guide.id); open.setAttribute('aria-expanded', 'false');
  let deferred = null, installed = false;
  function refresh() {
    box.hidden = dismissed || installed || isInstalled() || !(ios || android || deferred);
    open.textContent = deferred && !ios ? 'Установить LEXI' : 'Как добавить';
  }
  function showGuide() {
    guide.replaceChildren();
    const title = document.createElement('p');
    title.textContent = ios ? 'На iPhone или iPad:' : (android ? 'В браузере на Android:' : 'В браузере:');
    const list = document.createElement('ol');
    const steps = ios ? [
      'Открой LEXI в Safari.',
      'Нажми «Поделиться».',
      'Выбери «На экран „Домой“».',
      'Нажми «Добавить». При повторном открытии при необходимости войди в аккаунт.'
    ] : [
      'Открой меню браузера.',
      'Выбери «Установить приложение» или «Добавить на главный экран», если такой пункт доступен.',
      'Подтверди добавление. Названия пунктов могут отличаться в разных браузерах.'
    ];
    for (const text of steps) { const li = document.createElement('li'); li.textContent = text; list.append(li); }
    guide.append(title, list); guide.hidden = false; open.setAttribute('aria-expanded', 'true');
  }
  open.addEventListener('click', async () => {
    if (deferred && !ios) {
      const prompt = deferred; deferred = null;
      try { await prompt.prompt(); } catch { showGuide(); }
      refresh();
    } else if (guide.hidden) showGuide();
    else { guide.hidden = true; open.setAttribute('aria-expanded', 'false'); }
  });
  close.addEventListener('click', () => {
    try { localStorage.setItem(dismissedKey, String(Date.now())); } catch { /* hide for this visit */ }
    dismissed = true; box.hidden = true;
  });
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); deferred = event; refresh();
  });
  window.addEventListener('appinstalled', () => { deferred = null; installed = true; box.hidden = true; });
  if (mq.addEventListener) mq.addEventListener('change', refresh);
  refresh();
})();
