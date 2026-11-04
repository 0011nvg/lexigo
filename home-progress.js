/* LEXI · личный результат в синем приветственном блоке (2026-11-04).
 * Число — то же, что «слов в копилке» в «Профиль → Мой прогресс»: разные слова учебников 2–9 классов,
 * на которые хотя бы раз дан верный ответ (LexigoProgress.summarize → correct). Повторы одного слова
 * не считаются, слова из уроков учителя сюда не входят (у них нет общего словаря — см. README).
 * Источник — прогресс этого браузера; у вошедшего ученика он свой для аккаунта (account-hint.js) и
 * дополняется прогрессом из облака при входе (cloud.js → событие lexigo:progress).
 * Заменяет встроенный скрипт и стили из index.html. */
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
  /* Фраза честно описывает показатель: слово «в копилке» после первого верного ответа — не «выучено». */
  function message(n) {
    if (!n) return { before: '', strong: 'Первое слово', after: ' для копилки уже ждёт тебя!' };
    if (n === 1) return { before: '', strong: 'Первое слово', after: ' уже в копилке!' };
    if (n < 10) return { before: 'Уже ', strong: words(n), after: ' в твоей копилке!' };
    if (n < 50) return { before: 'Здорово! ', strong: words(n), after: ' в копилке!' };
    return { before: 'Вау! ', strong: words(n), after: ' в копилке!' };
  }
  function count() {
    try { return LexigoProgress.summarize(window.LEXIGO_DATA.books, LexigoLocalStorage.read('lexigo_progress_v1')).correct; } catch { return null; }
  }
  let last = '';
  function update() {
    const text = host.querySelector('.lexi-hero-text'), sub = text && text.querySelector('.lexi-hero-sub');
    if (!sub) return;
    const n = count(); if (n == null) return;
    let box = text.querySelector('.lexi-personal-progress');
    const key = String(n);
    if (box && last === key) return;
    last = key;
    if (!box) { box = document.createElement('p'); box.className = 'lexi-personal-progress'; sub.after(box); }
    box.classList.toggle('is-empty', !n);
    box.title = 'Слово попадает в копилку, когда ты хотя бы раз ответишь на него верно';
    const m = message(n), label = document.createElement('span'), b = document.createElement('strong');
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
