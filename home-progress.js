/* LEXI · личный результат в синем приветственном блоке (2026-11-04).
 * Число — «выученные слова», то же, что «слов выучено» в «Профиль → Мой прогресс» и в кабинете ученика:
 * слово учебника 2–10 классов, которое ученик написал по памяти хотя бы дважды, и два последних ответа на него
 * верные (LexigoProgress.summarize → learned). Пока выученных нет, но верные ответы уже есть — фраза о том,
 * что первое выученное слово близко. Слова из уроков учителя сюда не входят (у них нет общего словаря — см. README).
 * Источник — прогресс этого браузера; у вошедшего ученика он свой для аккаунта (account-hint.js) и
 * дополняется прогрессом из облака при входе (cloud.js → событие lexigo:progress). */
(() => {
  'use strict';
  const host = document.getElementById('lexiHome');
  if (!host || !window.LexigoProgress || !window.LexigoLocalStorage) return;
  const plural = (n, a, b, c) => { const m = n % 100, d = n % 10; return m > 10 && m < 20 ? c : d === 1 ? a : d >= 2 && d <= 4 ? b : c; };
  const words = n => n + ' ' + plural(n, 'слово', 'слова', 'слов');
  const NS = 'http://www.w3.org/2000/svg';
  const STAR = 'M12 2.5c.6 4.6 2.9 6.9 7.5 7.5-4.6.6-6.9 2.9-7.5 7.5-.6-4.6-2.9-6.9-7.5-7.5 4.6-.6 6.9-2.9 7.5-7.5Z';
  function star(cls) {
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', cls);
    const p = document.createElementNS(NS, 'path'); p.setAttribute('d', STAR); svg.append(p); return svg;
  }
  /* Состояния (2026-11-04, вечер): до первого выученного слова — одна фраза; дальше главный акцент — число.
     «N слов выучено» — без рода («выучил / выучила»), подходит и мальчикам, и девочкам. */
  function message(n) {
    if (!n) return { text: 'Скоро ты выучишь первое слово!' };
    const label = plural(n, 'слово', 'слова', 'слов') + ' выучено';
    const cheer = n === 1 ? 'Первое слово! 🎉' : n < 10 ? 'Отличное начало!' : n < 50 ? 'Продолжай в том же духе!' : n < 100 ? 'Ты уже столько знаешь!' : 'Впечатляет! 🌟';
    return { n, label, cheer };
  }
  function count() {
    try { return LexigoProgress.summarize(window.LEXIGO_DATA.books, LexigoLocalStorage.read('lexigo_progress_v1')).learned; } catch { return null; }
  }
  /* последнее показанное число — чтобы мягко «досчитать» до нового, когда слово выучено (у аккаунта — своё, account-hint.js) */
  const SEEN = 'lexigo_home_learned_seen';
  const seen = () => { try { const v = Number(localStorage.getItem(SEEN)); return Number.isFinite(v) && localStorage.getItem(SEEN) !== null ? v : null; } catch { return null; } };
  const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.classList.contains('calm');
  function countUp(el, from, to) {
    if (reduce() || to - from > 400) { el.textContent = String(to); return; }
    const t0 = performance.now(), dur = Math.min(900, 300 + (to - from) * 60);
    const step = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = String(Math.round(from + (to - from) * e)); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  /* вошедший ученик: пока облачный прогресс не загружен, не показываем «первое слово» тому, у кого слова уже есть */
  let waitCloud = !!(window.LexigoAccountHint && LexigoAccountHint.uid() && window.LexigoCloudSession);
  if (waitCloud) { const go = () => { waitCloud = false; soon(); }; window.LexigoCloudSession.ready.then(go, go); setTimeout(go, 16000); }
  let last = '';
  function update() {
    const text = host.querySelector('.lexi-hero-text'), sub = text && text.querySelector('.lexi-hero-sub');
    if (!sub) return;
    let box = text.querySelector('.lexi-personal-progress');
    if (waitCloud) { if (box) box.hidden = true; return; }
    const n = count(); if (n == null) return;
    if (box && last === String(n) && !box.hidden) return;
    last = String(n);
    if (!box) { box = document.createElement('p'); box.className = 'lexi-personal-progress'; sub.after(box); }
    box.hidden = false;
    box.classList.toggle('is-empty', !n); box.classList.toggle('has-number', !!n);
    box.title = 'Слово выучено, когда оно дважды написано по памяти и два последних ответа на него верные';
    const m = message(n);
    const badge = document.createElement('span'); badge.className = 'pp-badge'; badge.append(star('pp-star'));
    const glints = document.createElement('span'); glints.className = 'pp-glints'; glints.setAttribute('aria-hidden', 'true');
    glints.append(star('pp-g g1'), star('pp-g g2'), star('pp-g g3'));
    if (!n) {
      const label = document.createElement('span'); label.className = 'pp-text'; label.textContent = m.text;
      box.replaceChildren(badge, label, glints); box.setAttribute('aria-label', m.text);
    } else {
      const num = document.createElement('span'); num.className = 'pp-num'; num.setAttribute('aria-hidden', 'true');
      const txt = document.createElement('span'); txt.className = 'pp-text';
      const b = document.createElement('b'); b.textContent = m.label;
      const small = document.createElement('small'); small.textContent = m.cheer;
      txt.append(b, small);
      box.replaceChildren(badge, num, txt, glints);
      box.setAttribute('aria-label', n + ' ' + m.label + '. ' + m.cheer);
      const before = seen();
      if (before != null && n > before && before >= 0) {
        num.textContent = String(before); countUp(num, before, n);
        if (!reduce()) { box.classList.remove('pp-bump'); void box.offsetWidth; box.classList.add('pp-bump'); setTimeout(() => box.classList.remove('pp-bump'), 1400); }
      } else num.textContent = String(n);
    }
    try { localStorage.setItem(SEEN, String(n)); } catch { /* private mode */ }
  }
  const soon = () => { last = ''; requestAnimationFrame(update); };
  new MutationObserver(() => { if (!host.querySelector('.lexi-personal-progress')) soon(); }).observe(host, { childList: true, subtree: true });
  window.addEventListener('hashchange', soon);
  window.addEventListener('storage', soon);
  window.addEventListener('lexigo:progress', soon);
  window.addEventListener('lexigo:account', soon);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) soon(); });
  update();
  window.LexigoHomeProgress = Object.freeze({ refresh: soon, message });
})();
