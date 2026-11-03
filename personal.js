/* LEXI · личное пространство ученика (2026-11-02).
 *  «Мой класс», «Продолжить обучение», «Мои модули», «Сложные слова» и единый набор слов для игр.
 *  Всё хранится в localStorage этого браузера (у вошедшего ученика — отдельно для его аккаунта,
 *  см. account-hint.js). Между устройствами эти настройки НЕ синхронизируются — так и пишем ученику.
 *  Подключается после lexigo-plus.js и до cloud.js; игры, словарь и печать не меняет. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = String(text); return n; };
  const readJSON = (k, f) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? f; } catch { return f; } };
  const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
  const toast = (t, mood) => { try { window.LexiQuest?.toast(t, mood || 'happy'); } catch { /* cosmetic */ } };
  const plural = (n, a, b, c) => { n = Math.abs(n) % 100; const n1 = n % 10; return n > 10 && n < 20 ? c : n1 > 1 && n1 < 5 ? b : n1 === 1 ? a : c; };
  const BOOKS = DB.books;
  const bookOf = g => BOOKS.find(b => String(b.grade) === String(g)) || null;
  const modulesOf = b => [...new Set(b.sections.map(s => s.module))];
  const MODE_NAMES = { cards: 'Карточки', quiz: 'Выбери перевод', spell: 'Напиши слово', pairs: 'Найди пару', truefalse: 'Верно / неверно', fix: 'Исправь ошибку', audio: 'Аудиодиктант', crystals: 'Кристальная экспедиция', boss: 'Финальный тест', mixed: 'Тренировка дня', builder: 'Конструктор слов', listen: 'Слушай и выбирай', review: 'Работа над ошибками' };
  const DEVICE_NOTE = 'Сохраняется в этом браузере на этом устройстве.';

  /* ---------- storage ---------- */
  const CLASS_KEY = 'lexigo_my_class_v1', FAV_KEY = 'lexigo_fav_modules_v1', LAST_KEY = 'lexigo_last_activity_v1';
  const HARD_KEY = window.LexigoPlus?.HARD_KEY || 'lexigo_hard_words_v1', SEL_KEY = 'lexigo_word_selection_v1';
  function myClass() { const v = readJSON(CLASS_KEY, null); const g = v && Number(v.grade); return bookOf(g) ? g : null; }
  function setMyClass(g) { if (!bookOf(g)) return; writeJSON(CLASS_KEY, { grade: Number(g), at: Date.now() }); refreshAll(); }
  function favs() { const v = readJSON(FAV_KEY, []); return (Array.isArray(v) ? v : []).filter(f => { const b = bookOf(f.g); return b && modulesOf(b)[f.m] != null; }); }
  const isFav = (g, m) => favs().some(f => f.g === Number(g) && f.m === Number(m));
  function toggleFav(g, m) {
    let list = favs(); g = Number(g); m = Number(m);
    if (list.some(f => f.g === g && f.m === m)) list = list.filter(f => !(f.g === g && f.m === m));
    else { list.unshift({ g, m }); list = list.slice(0, 12); }
    writeJSON(FAV_KEY, list); return list.some(f => f.g === g && f.m === m);
  }
  function hardStore() { const h = readJSON(HARD_KEY, {}); return h && typeof h === 'object' && !Array.isArray(h) ? h : {}; }
  const isHard = id => !!hardStore()[id];
  function setHard(id, on) { const h = hardStore(); if (on) h[id] = h[id] || { at: Date.now(), ok: 0 }; else delete h[id]; writeJSON(HARD_KEY, h); }
  const PATH_RE = /^\/lesson\/(\d+)\/(m?)(\d+)$/;
  function lastActivity() {
    const v = readJSON(LAST_KEY, null);
    if (v && typeof v.path === 'string' && pathInfo(v.path)) return v;
    const ql = window.LexiQuest?.state?.().lastLesson; // older visits: the lesson Lexi already remembered
    return ql && pathInfo(ql) ? { path: ql, mode: null, finished: false, at: 0 } : null;
  }
  function pathInfo(path) {
    const whole = String(path).match(/^\/book\/(\d+)$/);
    if (whole) { const b = bookOf(whole[1]); return b ? { grade: b.grade, module: 'Весь учебник', unitKey: '__book', title: 'Все слова учебника', whole: true } : null; }
    const m = String(path).match(PATH_RE); if (!m) return null;
    const b = bookOf(m[1]); if (!b) return null; const ms = modulesOf(b);
    if (m[2]) { const name = ms[Number(m[3])]; return name == null ? null : { grade: b.grade, module: name, mi: Number(m[3]), unitKey: '__all', title: 'Все слова модуля' }; }
    const s = b.sections[Number(m[3])]; if (!s || !s.words.length) return null;
    return { grade: b.grade, module: s.module, mi: ms.indexOf(s.module), unitKey: String(m[3]), title: s.title };
  }
  const currentPath = () => { try { return '/lesson/' + book.grade + '/' + (unit === '__all' ? 'm' + modulesOf(book).indexOf(mod) : unit); } catch { return null; } };

  /* word id → where it lives (to group hard words by module — words of different grades/modules are never mixed) */
  let INDEX = null;
  function wordIndex() {
    if (INDEX) return INDEX; INDEX = new Map();
    for (const b of BOOKS) { const ms = modulesOf(b); b.sections.forEach(s => { for (const w of s.words) INDEX.set(w.id, { w, g: b.grade, module: s.module, mi: ms.indexOf(s.module) }); }); }
    return INDEX;
  }
  function hardGroups() {
    const idx = wordIndex(), groups = new Map();
    for (const id of Object.keys(hardStore())) { const loc = idx.get(id); if (!loc) continue; const k = loc.g + ':' + loc.mi; if (!groups.has(k)) groups.set(k, { g: loc.g, mi: loc.mi, module: loc.module, words: [] }); groups.get(k).words.push(loc.w); }
    return [...groups.values()].sort((a, b) => b.words.length - a.words.length);
  }
  function repeatHard(g, mi) {
    const b = bookOf(g); if (!b) return; const name = modulesOf(b)[mi];
    window.LexigoPlus?.presetWordSet(g, '__all', 'hard');
    try { if (book.grade === b.grade && unit === '__all' && mod === name) window.LexigoPlus?.setWordSet('hard'); } catch { /* not in a lesson yet */ }
    location.hash = '#/lesson/' + g + '/m' + mi + '/play/mixed';
  }

  /* ---------- last activity: lesson, game, finished or not ---------- */
  function noteLesson() {
    const path = currentPath(); if (!path) return;
    const prev = readJSON(LAST_KEY, null) || {};
    const next = prev.path === path ? { ...prev, at: Date.now() } : { path, mode: null, finished: false, at: Date.now() };
    writeJSON(LAST_KEY, next);
  }
  let lastGame = null, mistakes = new Set();
  function noteGame() {
    if (typeof game === 'undefined' || !game || game.assignmentId) return;
    if (game !== lastGame) { lastGame = game; mistakes = new Set(); const wb = window.LexigoWholeBook?.current; const path = wb && bookOf(wb.grade) ? '/book/' + wb.grade : currentPath(); if (path) writeJSON(LAST_KEY, { path, mode: game.mode, finished: false, at: Date.now() }); }
  }
  function noteFinished() {
    const v = readJSON(LAST_KEY, null); if (!v || typeof game === 'undefined' || !game || v.mode !== game.mode || v.finished) return;
    v.finished = true; v.at = Date.now(); writeJSON(LAST_KEY, v);
  }
  const STAGE_ORDER = () => [...document.querySelectorAll('#launcher .mode-stage .mode[data-mode]')].map(b => b.dataset.mode).filter(m => m !== 'audio' || (typeof audioAvailable !== 'function' || audioAvailable()));

  /* hard words leave the list by themselves after 3 correct answers in a row */
  const origRecord = record;
  record = function (w, ok, ...rest) {
    const r = origRecord.call(this, w, ok, ...rest);
    try {
      noteGame();
      if (!ok && w && w.id) mistakes.add(w.id);
      const h = hardStore(), e = w && h[w.id];
      if (e) { e.ok = ok ? (e.ok || 0) + 1 : 0; if (e.ok >= 3) { delete h[w.id]; toast('«' + w.en + '» больше не сложное слово — 3 верных ответа подряд! ★', 'happy'); } writeJSON(HARD_KEY, h); }
    } catch { /* never break a game */ }
    return r;
  };

  /* ---------- home: personal desk ---------- */
  function sectionCard(cls, title) { const c = el('section', 'desk-card ' + cls); const h = el('h3', 'desk-title', title); c.append(h); return c; }
  function linkBtn(text, href, cls) { const a = el('a', cls || 'btn', text); a.href = href; return a; }
  function btn(text, fn, cls) { const b = el('button', cls || 'btn', text); b.type = 'button'; b.onclick = fn; return b; }
  function selectionLabel(path) {
    const info = pathInfo(path); if (!info) return '';
    const v = readJSON(SEL_KEY, {})[info.grade + ':' + info.unitKey];
    if (Array.isArray(v) || v?.m === 'chosen') return 'только выбранные слова';
    if (v?.m === 'hard') return 'только сложные слова';
    return '';
  }
  function classPicker(current, suggested, onPick) {
    const row = el('div', 'class-picker'); row.setAttribute('role', 'group'); row.setAttribute('aria-label', 'Выбери свой класс');
    for (const b of BOOKS) {
      const k = btn(String(b.grade), () => onPick(b.grade), 'class-chip' + (b.grade === current ? ' on' : '') + (b.grade === suggested && !current ? ' hint' : ''));
      k.setAttribute('aria-label', b.grade + ' класс · Spotlight ' + b.grade); if (b.grade === current) k.setAttribute('aria-pressed', 'true');
      row.append(k);
    }
    return row;
  }
  function renderDesk(host) {
    const g = myClass(), last = lastActivity(), favList = favs(), groups = hardGroups(), hardTotal = groups.reduce((n, x) => n + x.words.length, 0);
    const desk = el('div', 'lexi-desk'); desk.setAttribute('aria-label', 'Моё обучение');
    // 1. my class
    const cls = sectionCard('desk-class', 'Мой класс');
    if (g) {
      const b = bookOf(g); const body = el('div', 'desk-row');
      body.append(el('b', 'desk-big', 'Spotlight ' + g), linkBtn('Открыть уроки →', '#/course/' + g + '/0', 'btn small'));
      const change = btn('Сменить класс', () => { change.hidden = true; cls.append(classPicker(g, null, ng => { setMyClass(ng); toast('Готово! Твой класс — ' + ng + '.', 'happy'); })); }, 'text-button');
      cls.append(body, el('p', 'desk-note', b.sections.reduce((n, s) => n + s.words.length, 0) + ' слов · ' + modulesOf(b).length + ' модулей'), change);
    } else {
      const sug = last ? pathInfo(last.path)?.grade : null;
      cls.classList.add('desk-new'); cls.querySelector('h3').textContent = 'В каком ты классе?';
      cls.append(classPicker(null, sug, ng => { setMyClass(ng); location.hash = '#/course/' + ng + '/0'; }), el('p', 'desk-note', 'Выбери один раз — Лекси запомнит. Поменять можно в любой момент.'));
    }
    desk.append(cls);
    // 2. continue
    if (last) {
      const info = pathInfo(last.path); const c = sectionCard('desk-continue', 'Продолжить обучение');
      c.append(el('p', 'desk-where', 'Spotlight ' + info.grade + ' · ' + info.module), el('p', 'desk-lesson', info.title));
      const sel = selectionLabel(last.path);
      if (last.mode && MODE_NAMES[last.mode]) c.append(el('p', 'desk-note', 'Последняя тренировка: ' + MODE_NAMES[last.mode] + (last.finished ? ' · завершена ✓' : ' · не завершена') + (sel ? ' · ' + sel : '')));
      else if (sel) c.append(el('p', 'desk-note', 'В играх: ' + sel));
      const row = el('div', 'desk-actions');
      if (info.whole && last.mode) { row.append(linkBtn('Продолжить', '#' + last.path + '/play/' + last.mode, 'btn')); c.append(el('p', 'desk-hint', 'Пройденные слова сохранены. При возвращении игра подберёт следующие слова; результат незавершённого раунда не сохраняется.')); }
      else if (last.mode && !last.finished) { row.append(linkBtn('Продолжить', '#' + last.path + '/play/' + last.mode, 'btn')); c.append(el('p', 'desk-hint', 'Игра начнётся сначала — незаконченная игра не сохраняется.')); }
      else if (last.mode) {
        const order = STAGE_ORDER(), i = order.indexOf(last.mode), next = i >= 0 ? order[i + 1] : null;
        if (next) row.append(linkBtn('Дальше: ' + MODE_NAMES[next], '#' + last.path + '/play/' + next, 'btn'));
        row.append(linkBtn('Повторить', '#' + last.path + '/play/' + last.mode, next ? 'btn secondary' : 'btn'));
      } else row.append(linkBtn('Продолжить', '#' + last.path, 'btn'));
      row.append(linkBtn(info.whole ? 'К учебнику' : 'К уроку', info.whole ? '#/course/' + info.grade + '/0' : '#' + last.path, 'text-button'));
      c.append(row); desk.append(c);
    }
    // 3. favourite modules
    if (favList.length || g) {
      const c = sectionCard('desk-favs', 'Мои модули');
      if (favList.length) {
        const ul = el('ul', 'fav-list');
        for (const f of favList) {
          const b = bookOf(f.g), li = el('li'); const a = linkBtn('', '#/course/' + f.g + '/' + f.m, 'fav-link');
          a.append(el('span', 'fav-grade', f.g), el('span', null, modulesOf(b)[f.m]));
          const x = btn('×', () => { toggleFav(f.g, f.m); refreshAll(); }, 'fav-x'); x.setAttribute('aria-label', 'Убрать из моих модулей: Spotlight ' + f.g + ', ' + modulesOf(b)[f.m]); x.title = 'Убрать';
          li.append(a, x); ul.append(li);
        }
        c.append(ul);
      } else c.append(el('p', 'desk-note', 'Нажми ☆ рядом с названием модуля в учебнике — он появится здесь.'));
      desk.append(c);
    }
    // 4. hard words
    if (hardTotal || g || last) {
      const c = sectionCard('desk-hard', 'Мои сложные слова');
      if (hardTotal) {
        c.append(el('p', 'desk-where', hardTotal + ' ' + plural(hardTotal, 'слово', 'слова', 'слов') + ' для повторения'));
        if (groups.length === 1) { const x = groups[0]; c.append(el('p', 'desk-note', 'Spotlight ' + x.g + ' · ' + x.module), btn('Повторить ★', () => repeatHard(x.g, x.mi))); }
        else { const ul = el('ul', 'hard-list'); for (const x of groups.slice(0, 6)) { const li = el('li'); li.append(el('span', null, 'Spotlight ' + x.g + ' · ' + x.module + ' — ' + x.words.length), btn('Повторить', () => repeatHard(x.g, x.mi), 'btn small')); ul.append(li); } c.append(ul); }
      } else c.append(el('p', 'desk-note', 'Отмечай ☆ трудные слова в списке слов урока — потом их можно повторить отдельно.'));
      desk.append(c);
    }
    desk.append(el('p', 'desk-device', '🔒 ' + DEVICE_NOTE + ' На другом устройстве класс, модули и сложные слова нужно будет отметить заново.'));
    (host.querySelector('.lexi-panel') || host.querySelector('.lexi-hero'))?.after(desk);
  }
  function tuneHero(host) {
    const hero = host.querySelector('.lexi-hero'); if (!hero) return;
    const last = lastActivity(), g = myClass(), sub = hero.querySelector('.lexi-hero-sub'), actions = hero.querySelector('.lexi-hero-actions');
    if (last) {
      if (sub) sub.textContent = 'С возвращением! Продолжим учить слова?';
      const info = pathInfo(last.path); const go = actions?.querySelector('.hero-go');
      if (go && info) {
        go.href = '#' + last.path + (last.mode ? '/play/' + last.mode : '');
        go.innerHTML = '<span>Продолжить</span><small></small>'; go.querySelector('small').textContent = 'Spotlight ' + info.grade + ' · ' + info.title;
        actions.querySelector('.btn.secondary')?.remove();
      }
    } else if (!g) {
      if (sub) sub.textContent = 'Я помогу выучить слова из твоего учебника Spotlight. Выбери свой класс — и начнём!';
      const go = actions?.querySelector('.hero-go');
      if (go) { go.href = '#/home'; go.innerHTML = '<span>Выбрать класс</span><small>2–9 классы</small>'; go.onclick = e => { e.preventDefault(); e.stopPropagation(); const p = host.querySelector('.class-picker button'); p?.scrollIntoView({ block: 'center', behavior: 'smooth' }); p?.focus({ preventScroll: true }); }; }
    } else {
      const go = actions?.querySelector('.hero-go'); if (go) { go.href = '#/course/' + g + '/0'; go.innerHTML = '<span>Начать</span><small></small>'; go.querySelector('small').textContent = 'Spotlight ' + g + ' · выбери урок'; }
    }
  }
  function decorateHome() {
    const host = $('lexiHome'); if (!host || !host.querySelector('.lexi-hero') || host.querySelector('.lexi-desk')) return;
    tuneHero(host); renderDesk(host);
    const g = myClass();
    document.querySelectorAll('#courseCards .course-card').forEach(card => {
      const on = g && card.classList.contains('grade-' + g); card.classList.toggle('my-class', !!on);
      card.querySelector('.my-class-badge')?.remove(); if (on) card.querySelector('.course-caption')?.prepend(el('span', 'my-class-badge', '★ Мой класс'));
    });
    const hs = $('heroStart'); if (hs) hs.onclick = () => { location.hash = '#/course/' + (myClass() || (typeof book !== 'undefined' && book ? book.grade : BOOKS[0].grade)) + '/0'; };
  }

  /* ---------- course page: my class + favourite module ---------- */
  function decorateCourse() {
    const m = location.hash.match(/#\/course\/(\d+)\/(\d+)/); const b = bookOf(m ? m[1] : null); if (!b) return;
    const mi = Math.max(0, modulesOf(b)[Number(m[2])] != null ? Number(m[2]) : 0), g = myClass();
    let bar = $('classBar'); if (!bar) { bar = el('div', 'class-bar'); bar.id = 'classBar'; $('courseTabs')?.after(bar); }
    bar.replaceChildren();
    if (g === b.grade) bar.append(el('span', 'class-badge', '★ Мой класс'));
    else {
      bar.append(el('span', 'class-other', g ? 'Ты смотришь Spotlight ' + b.grade + '. Твой класс — ' + g + ', он не изменится.' : 'Это твой класс?'));
      bar.append(btn(g ? 'Сделать моим классом' : 'Да, я в ' + b.grade + ' классе', () => { setMyClass(b.grade); toast('Готово! Теперь твой класс — ' + b.grade + '.', 'happy'); }, 'btn small secondary'));
    }
    document.querySelectorAll('#courseTabs a').forEach(a => a.classList.toggle('my-class-tab', g != null && /\/course\/(\d+)/.exec(a.getAttribute('href'))?.[1] === String(g)));
    const title = $('moduleTitle'); if (!title) return;
    let fav = $('favToggle'); if (!fav) { fav = el('button', 'fav-toggle'); fav.id = 'favToggle'; fav.type = 'button'; title.after(fav); }
    const paint = () => { const on = isFav(b.grade, mi); fav.textContent = on ? '★ В моих модулях' : '☆ В мои модули'; fav.setAttribute('aria-pressed', String(on)); fav.title = on ? 'Убрать из «Моих модулей»' : 'Добавить в «Мои модули» на главной'; };
    fav.onclick = () => { const on = toggleFav(b.grade, mi); paint(); toast(on ? 'Модуль добавлен в «Мои модули» на главной.' : 'Модуль убран из «Моих модулей».', on ? 'happy' : 'hello'); };
    paint();
  }

  /* ---------- word list: ☆ per word ---------- */
  const origRender = renderWords;
  renderWords = function (...a) {
    const r = origRender.apply(this, a);
    try { starRows(); } catch { /* cosmetic */ }
    return r;
  };
  function starRows() {
    const list = $('words'); if (!list || typeof scope === 'undefined') return;
    const q = ($('search')?.value || '').toLowerCase(), visible = scope.filter(w => `${w.en} ${w.ru}`.toLowerCase().includes(q));
    const rows = list.querySelectorAll('label.wordrow'); const h = hardStore();
    rows.forEach((row, i) => {
      const w = visible[i]; if (!w) return; row.dataset.id = w.id;
      const on = !!h[w.id]; row.classList.toggle('is-hard', on);
      const s = el('button', 'star-btn' + (on ? ' on' : ''), on ? '★' : '☆'); s.type = 'button';
      s.setAttribute('aria-pressed', String(on)); s.setAttribute('aria-label', (on ? 'Убрать из сложных: ' : 'Отметить как сложное: ') + w.en);
      s.title = on ? 'Сложное слово · нажми, чтобы убрать' : 'Отметить как сложное';
      s.onclick = e => { e.preventDefault(); e.stopPropagation(); const nowOn = !isHard(w.id); setHard(w.id, nowOn); row.classList.toggle('is-hard', nowOn); s.classList.toggle('on', nowOn); s.textContent = nowOn ? '★' : '☆'; s.setAttribute('aria-pressed', String(nowOn)); s.setAttribute('aria-label', (nowOn ? 'Убрать из сложных: ' : 'Отметить как сложное: ') + w.en); paintWordSet(); };
      row.append(s);
    });
    let hint = $('starHint');
    if (!hint) { hint = el('p', 'star-hint'); hint.id = 'starHint'; list.before(hint); }
    const n = scope.filter(w => h[w.id]).length;
    hint.textContent = n ? '★ Сложных слов в этом уроке: ' + n + '. Их можно тренировать отдельно — кнопка «Сложные» на странице урока.' : '☆ Нажми звёздочку у трудного слова, чтобы потом повторить его отдельно.';
  }

  /* ---------- lesson: which words are we training? ---------- */
  function paintWordSet() {
    const launcher = $('launcher'); if (!launcher || !window.LexigoPlus?.wordSet) return;
    const s = window.LexigoPlus.wordSet();
    let box = $('wordSetBar');
    if (!box) {
      box = el('div', 'wordset-bar'); box.id = 'wordSetBar'; box.setAttribute('role', 'group'); box.setAttribute('aria-labelledby', 'wordSetTitle');
      const t = el('span', 'wordset-title', 'Какие слова тренируем?'); t.id = 'wordSetTitle';
      const seg = el('div', 'wordset-seg');
      for (const [mode, label] of [['all', 'Все слова'], ['chosen', 'Выбранные'], ['hard', '★ Сложные']]) {
        const b = el('button', 'wordset-btn'); b.type = 'button'; b.dataset.set = mode; b.append(el('b', null, label), el('small'));
        b.onclick = () => {
          if (mode === 'chosen' && !window.LexigoPlus.wordSet().chosen) { $('openWords')?.click(); return; }
          if (!window.LexigoPlus.setWordSet(mode) && mode === 'hard') toast('Сложных слов в этом уроке пока нет. Отметь их ☆ в списке слов.', 'think');
        };
        seg.append(b);
      }
      const msg = el('p', 'wordset-msg'); msg.setAttribute('aria-live', 'polite');
      box.append(t, seg, msg);
      launcher.querySelector('.lesson-tools')?.after(box);
    }
    for (const b of box.querySelectorAll('.wordset-btn')) {
      const mode = b.dataset.set, n = s[mode], on = s.mode === mode;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
      b.querySelector('small').textContent = mode === 'chosen' && !n ? 'выбрать' : String(n);
      b.disabled = mode === 'hard' && !n;
      b.title = mode === 'hard' && !n ? 'Отметь ☆ трудные слова в списке слов урока' : '';
    }
    const msg = box.querySelector('.wordset-msg'), n = s.active;
    msg.classList.toggle('warn', n < 3);
    msg.textContent = n === 0 ? 'Не выбрано ни одного слова — отметь слова в списке.'
      : n === 1 ? 'Выбрано 1 слово: подойдут «Карточки», «Напиши слово» и «Конструктор». Для «Выбери перевод», «Верно / неверно» и «Найди пару» нужно минимум 2 слова, для финального теста — 3.'
      : n === 2 ? 'Выбрано 2 слова: для финального теста нужно минимум 3 слова.'
      : 'Этот набор (' + n + ' ' + plural(n, 'слово', 'слова', 'слов') + ') сохранится во всех играх урока, пока ты его не поменяешь.';
  }

  /* ---------- result card: mark mistakes as hard ---------- */
  function decorateResult() {
    const card = document.querySelector('#play .lesson-result, #play .pair-finish'); if (!card) return;
    noteFinished();
    if (card.querySelector('.hard-add') || !mistakes.size) return;
    const fresh = [...mistakes].filter(id => !isHard(id)); if (!fresh.length) return;
    const b = btn('☆ Добавить ошибки в «Сложные слова» (' + fresh.length + ')', () => { fresh.forEach(id => setHard(id, true)); b.disabled = true; b.textContent = '★ Добавлено в «Сложные слова»: ' + fresh.length; }, 'btn secondary hard-add');
    card.append(b);
  }

  /* ---------- wiring ---------- */
  function refreshAll() {
    const page = document.body.dataset.page;
    if (page === 'home' || !page) { $('lexiHome')?.querySelector('.lexi-desk')?.remove(); decorateHome(); }
    if (page === 'course') decorateCourse();
    if (page === 'lesson') paintWordSet();
  }
  function onPage() {
    const page = document.body.dataset.page;
    if (['lesson', 'words'].includes(page)) noteLesson();
    if (page === 'play') noteGame();
    if (page === 'home' || !page) decorateHome();
    if (page === 'course') decorateCourse();
    if (page === 'lesson') paintWordSet();
  }
  new MutationObserver(onPage).observe(document.body, { attributes: true, attributeFilter: ['data-page'] });
  new MutationObserver(() => decorateHome()).observe($('lexiHome'), { childList: true });
  new MutationObserver(() => { if (document.body.dataset.page === 'course') decorateCourse(); }).observe($('lessonCards'), { childList: true });
  new MutationObserver(() => { noteGame(); decorateResult(); }).observe($('play'), { childList: true, subtree: true });
  window.addEventListener('lexigo:wordset', paintWordSet);
  const origUpdate = updateStats; updateStats = function (...a) { const r = origUpdate.apply(this, a); try { paintWordSet(); } catch { /* cosmetic */ } return r; };
  window.addEventListener('lexigo:account', () => setTimeout(refreshAll, 0)); // another account → its own class, modules and words
  window.addEventListener('storage', e => { if ([CLASS_KEY, FAV_KEY, HARD_KEY, LAST_KEY].some(k => String(e.key || '').startsWith(k))) refreshAll(); });
  window.LexiPersonal = Object.freeze({ myClass, setMyClass, favs, toggleFav, isHard, setHard, hardGroups, lastActivity });
  try { starRows(); } catch { /* first paint */ }
  onPage();
})();
