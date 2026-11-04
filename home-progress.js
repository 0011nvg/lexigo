/* LEXI · личный результат в синем приветственном блоке (2026-11-04).
 * Число — «выученные слова», то же, что «слов выучено» в «Профиль → Мой прогресс» и в кабинете ученика:
 * слово учебника 2–9 классов, которое ученик написал по памяти хотя бы дважды, и два последних ответа на него
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
  /* «Выучено» — без рода («выучил / выучила»), подходит и мальчикам, и девочкам. */
  function message(learned, started) {
    if (!learned) return started ? { before: 'Почти! Скоро выучишь ', strong: 'первое слово', after: '!' }
      : { before: 'Выучи ', strong: 'первое слово', after: ' вместе с Лекси!' };
    if (learned === 1) return { before: 'Ура! ', strong: 'Первое слово', after: ' выучено!' };
    const head = learned < 10 ? 'Молодец! ' : learned < 50 ? 'Здорово! ' : 'Вау! ';
    return { before: head + 'Уже выучено ', strong: words(learned), after: '!' };
  }
  function count() {
    try { const s = LexigoProgress.summarize(window.LEXIGO_DATA.books, LexigoLocalStorage.read('lexigo_progress_v1')); return { learned: s.learned, started: s.correct > 0 }; } catch { return null; }
  }
  let last = '';
  function update() {
    const text = host.querySelector('.lexi-hero-text'), sub = text && text.querySelector('.lexi-hero-sub');
    if (!sub) return;
    const c = count(); if (c == null) return;
    const n = c.learned;
    let box = text.querySelector('.lexi-personal-progress');
    const key = n + ':' + c.started;
    if (box && last === key) return;
    last = key;
    if (!box) { box = document.createElement('p'); box.className = 'lexi-personal-progress'; sub.after(box); }
    box.classList.toggle('is-empty', !n);
    box.title = 'Слово выучено, когда оно дважды написано по памяти и два последних ответа на него верные';
    const m = message(n, c.started), label = document.createElement('span'), b = document.createElement('strong');
    label.className = 'pp-text'; b.textContent = m.strong; label.append(m.before, b, m.after);
    const badge = document.createElement('span'); badge.className = 'pp-badge'; badge.append(star('pp-star'));
    const glints = document.createElement('span'); glints.className = 'pp-glints'; glints.setAttribute('aria-hidden', 'true');
    glints.append(star('pp-g g1'), star('pp-g g2'), star('pp-g g3'));
    box.replaceChildren(badge, label, glints);
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
