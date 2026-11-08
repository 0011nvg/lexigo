/* LEXI · «Слова урока» прямо на странице урока (2026-11-04).
 * Отдельной страницы «Слова» больше нет: список выбранного урока стоит между заголовком урока и играми.
 * Список — тот же узел #wordSelection и тот же renderWords (practice-controller.js), что и раньше:
 * те же данные словаря, тот же набор `selected`, то же сохранение выбора (lexigo-plus.js) и ☆ (personal.js).
 * navigation-controller.js переставляет узел сюда на странице урока и обратно в каталог для учителя.
 * Этот файл добавляет только оформление списка: счётчики, быстрые наборы, сворачивание длинных уроков,
 * переход к играм и «показать словарь» для старых ссылок …/words. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const root = $('lessonWords'), list = $('words'), tools = document.querySelector('#wordSelection .buttons');
  if (!root || !list || !tools) return;
  const COLLAPSE_OVER = 16, PREVIEW_WIDE = 12, PREVIEW_PHONE = 8, SEARCH_FROM = 13;
  const phone = matchMedia('(max-width:760px)');
  const wide = matchMedia('(min-width:1000px)'), launcher=$('launcher'), modes=document.querySelector('#launcher .modes'), modeHeading=document.querySelector('#launcher .mode-heading');
  function orderModes(){if(!launcher||!modes||!modeHeading)return;if(wide.matches)launcher.prepend(modes);else modeHeading.after(modes);}
  modes?.setAttribute('role','group');modes?.setAttribute('aria-label','Игровые режимы урока');
  orderModes();wide.addEventListener('change',orderModes);
  const smooth = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  const plural = (n, a, b, c) => { n = Math.abs(n) % 100; const n1 = n % 10; return n > 10 && n < 20 ? c : n1 > 1 && n1 < 5 ? b : n1 === 1 ? a : c; };
  const words = n => n + ' ' + plural(n, 'слово', 'слова', 'слов');
  let expanded = false, lessonKey = '';

  /* ---------- быстрые наборы: все · снять · мой выбор · сложные · с ошибками · повторить ---------- */
  tools.classList.add('lw-tools'); tools.setAttribute('role', 'group'); tools.setAttribute('aria-label', 'Какие слова тренировать');
  $('all').textContent = 'Выбрать все'; $('none').textContent = 'Снять выбор';
  function chip(id, onclick) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn secondary'; b.id = id; b.hidden = true; b.onclick = onclick; return b; }
  const mine = chip('lwMine', () => window.LexigoPlus?.setWordSet('chosen'));
  const hard = chip('lwHard', () => window.LexigoPlus?.setWordSet('hard'));
  $('none').after(mine, hard);
  const errorsBtn = $('errors'), dueBtn = $('due');

  /* ---------- «Показать все N слов» для длинных уроков ---------- */
  const more = document.createElement('button');
  more.type = 'button'; more.className = 'lw-more'; more.id = 'lwMore'; more.hidden = true; more.setAttribute('aria-controls', 'words');
  list.after(more);
  more.onclick = () => { expanded = !expanded; paint(); if (!expanded) root.scrollIntoView({ block: 'start', behavior: smooth() }); };

  // поиск: полный renderWords (со ☆ из personal.js), а не исходная функция, сохранённая при запуске
  $('search').oninput = () => renderWords();
  $('search').placeholder = 'Найти слово или перевод';

  const progress = w => { try { return getProgress(w) || {}; } catch { return {}; } };
  const due = w => { const p = progress(w); return !!(p.last && p.due <= Date.now()); };

  function paint() {
    if (typeof scope === 'undefined' || typeof selected === 'undefined') return;
    const key = (typeof book !== 'undefined' ? book.grade : '') + ':' + (typeof unit !== 'undefined' ? unit : '');
    if (key !== lessonKey) { lessonKey = key; expanded = false; }
    const m = scope.length, n = scope.filter(w => selected.has(w.id)).length;
    const set = window.LexigoPlus?.wordSet ? window.LexigoPlus.wordSet() : { mode: n === m ? 'all' : 'chosen', chosen: 0, hard: 0 };

    $('lwCount').textContent = '· ' + words(m);
    const status = $('lwStatus');
    status.textContent = !m ? 'В этом уроке пока нет слов'
      : n === 0 ? 'Отметь слова для тренировки'
      : n === m ? (m === 1 ? 'В играх — это слово' : 'В играх — все слова')
      : (set.mode === 'hard' ? '★ Сложные: ' : 'Выбрано: ') + n + ' из ' + m;
    root.classList.toggle('is-subset', n > 0 && n < m);
    root.classList.toggle('is-empty', m > 0 && n === 0);
    let note = $('lwNote');
    const noteText = n === 1 && m > 1 ? 'Для «Выбери перевод», «Верно / неверно» и «Найди пару» нужно минимум 2 слова, для финального теста — 3.'
      : n === 2 && m > 2 ? 'Для финального теста нужно минимум 3 слова.' : '';
    if (noteText && !note) { note = document.createElement('p'); note.id = 'lwNote'; note.className = 'lw-note'; root.querySelector('.lw-head').after(note); }
    if (note) { note.textContent = noteText; note.hidden = !noteText; }

    $('all').disabled = !m || n === m; $('none').disabled = n === 0;
    hard.hidden = !set.hard; hard.textContent = '★ Сложные · ' + set.hard; hard.setAttribute('aria-pressed', String(set.mode === 'hard' && n === set.hard));
    const chosen = set.chosen || 0;
    mine.hidden = !(chosen && chosen < m && !(set.mode === 'chosen' && n === chosen)); mine.textContent = 'Мой выбор · ' + chosen;
    const errs = scope.filter(w => (progress(w).wrong || 0) > 0).length, later = scope.filter(due).length;
    errorsBtn.hidden = !errs; errorsBtn.textContent = 'С ошибками · ' + errs;
    dueBtn.hidden = !later; dueBtn.textContent = 'Повторить сегодня · ' + later;

    root.classList.toggle('has-search', m >= SEARCH_FROM || !!$('search').value);
    const rows = [...list.querySelectorAll('.wordrow')], limit = phone.matches ? PREVIEW_PHONE : PREVIEW_WIDE;
    const collapsible = !$('search').value && rows.length > COLLAPSE_OVER;
    rows.forEach((r, i) => r.classList.toggle('lw-extra', collapsible && !expanded && i >= limit));
    more.hidden = !collapsible;
    more.setAttribute('aria-expanded', String(expanded));
    more.textContent = expanded ? 'Свернуть список ↑' : 'Показать все ' + words(rows.length) + ' ↓';
    if (!rows.length && m) { let empty = $('lwEmpty'); if (!empty) { empty = document.createElement('p'); empty.id = 'lwEmpty'; empty.className = 'lw-empty'; list.append(empty); } empty.textContent = 'Ничего не нашлось. Попробуй другое слово.'; }
  }

  const prevStats = updateStats;
  updateStats = function (...a) { const r = prevStats.apply(this, a); try { paint(); } catch { /* оформление не должно ломать игры */ } return r; };
  window.addEventListener('lexigo:wordset', () => setTimeout(paint));
  list.addEventListener('click', e => { if (e.target.closest('.star-btn')) setTimeout(paint); }, true);
  phone.addEventListener?.('change', paint);
  new MutationObserver(paint).observe(document.body, { attributes: true, attributeFilter: ['data-page'] });

  function focusTarget(node) { if (!node) return; if (!node.matches('button,input,select,textarea,a[href],[tabindex]')) node.tabIndex = -1; node.focus({ preventScroll: true }); }
  function reveal() {
    if (document.body.dataset.page !== 'lesson') return;
    requestAnimationFrame(() => { root.scrollIntoView({ block: 'start', behavior: smooth() }); focusTarget($('lessonWordsTitle')); });
  }
  function toGames() {
    const heading = document.querySelector('#launcher .mode-heading'), modes = document.querySelector('#launcher .modes');
    const visibleHeading=heading&&heading.getClientRects().length?heading:null;
    (visibleHeading||modes)?.scrollIntoView({ block: 'start', behavior: smooth() });
    focusTarget(visibleHeading?.querySelector('h2')||modes?.querySelector('button:not(:disabled)'));
    if (modes) { modes.classList.remove('lw-pulse'); void modes.offsetWidth; modes.classList.add('lw-pulse'); setTimeout(() => modes.classList.remove('lw-pulse'), 1600); }
  }
  window.LexigoLessonWords = Object.freeze({ reveal, toGames, refresh: paint });

  paint();
  if (window.LEXI_REVEAL_WORDS) { window.LEXI_REVEAL_WORDS = false; reveal(); }
})();
