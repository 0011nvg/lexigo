/* Mobile installed app: keep navigation available during practice. */
(() => {
  'use strict';
  const installed = window.matchMedia('(display-mode: standalone)');
  const mobile = window.matchMedia('(pointer: coarse) and (max-width: 1024px)');
  const enabled = () => (installed.matches || navigator.standalone === true) && mobile.matches;
  const isTextInput = node => node && (/^(INPUT|TEXTAREA)$/.test(node.tagName) || node.isContentEditable);
  function update() {
    const on = enabled();
    document.body.classList.toggle('pwa-mobile-game-nav', on);
    const nav = document.querySelector('.bottom-nav');
    if (nav && document.body.dataset.page === 'play') nav.hidden = !on;
    const vv = window.visualViewport;
    const keyboard = on && document.body.dataset.page === 'play' && vv && isTextInput(document.activeElement)
      ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
    document.documentElement.style.setProperty('--pwa-keyboard-offset', keyboard > 80 ? `${keyboard}px` : '0px');
  }
  window.LexiPwaGameNav = Object.freeze({ enabled, update });
  for (const m of [installed, mobile]) {
    if (m.addEventListener) m.addEventListener('change', update);
    else if (m.addListener) m.addListener(update);
  }
  window.visualViewport?.addEventListener('resize', update);
  window.visualViewport?.addEventListener('scroll', update);
  document.addEventListener('focusin', () => requestAnimationFrame(update));
  document.addEventListener('focusout', () => requestAnimationFrame(update));
  // Run the existing cloud-aware stop before the SPA route handler. This is
  // scoped to our mobile PWA navigation and does not change browser routing.
  document.addEventListener('click', event => {
    if (!enabled() || document.body.dataset.page !== 'play' || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('.bottom-nav a[href^="#/"]');
    if (link && typeof game !== 'undefined' && game && typeof stop === 'function') stop();
  }, true);
  document.addEventListener('DOMContentLoaded', () => {
    new MutationObserver(update).observe(document.body, { attributes: true, attributeFilter: ['data-page'] });
    update();
  });
})();
