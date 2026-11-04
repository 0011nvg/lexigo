/* LEXI — уроки от учителя как полноценная часть платформы (2026-11-02, v2).
 *
 *  #/my/a-<задание>  — урок, назначенный ученику (свой урок учителя или уроки Spotlight);
 *  #/my/t-<урок>     — свой урок учителя: просмотр слов и тренировка во всех подходящих играх;
 *  #/my/<…>/play/<игра> — игра урока (тот же движок, те же экраны, что у модулей учебника).
 *
 *  • Игры берутся из того же списка, что и на странице урока Spotlight (#launcher): новая игра LEXI
 *    появится и здесь сама, если подходит к словам урока (LexigoCloud.modeFit).
 *  • Ученик: результаты и прогресс слов уходят в аккаунт (cloud.js → submit_session с assignment_id).
 *  • Учитель: тренировка ничего не отправляет в облако — ни сессий, ни XP, ни ТОП-3, ни статистики класса.
 *  • На главной у ученика первым показывается блок «Твой урок от учителя». Нет уроков — нет блока.
 *  Права доступа проверяет сервер (RLS): ученик видит только задания своих групп, учитель — свои уроки. */
(() => {
  'use strict';
  const C = window.LexigoCloud, Nav = window.LexigoNav, page = document.getElementById('myLessonPage');
  if (!C || !Nav || !page) return;
  const { h } = C;
  const S = () => window.LexigoCloudSession;
  const toast = (t, mood) => { try { window.LexiQuest ? window.LexiQuest.toast(t, mood || 'think') : null; } catch { /* cosmetic */ } };
  const prog = id => (typeof progress !== 'undefined' && progress) ? progress[id] : null;
  const canSpeak = () => typeof audioAvailable === 'function' && audioAvailable();
  const route = () => location.hash.slice(1);
  let cur = null, homeStamp = 0, homeDirty = true, homeBusy = false;

  /* ---------- данные урока ---------- */
  const PREVIEW = id => 'lexigo_preview_done_v1:' + id;
  const readPreview = id => { try { const x = JSON.parse(sessionStorage.getItem(PREVIEW(id)) || '[]'); return Array.isArray(x) ? x : []; } catch { return []; } };
  const writePreview = (id, set) => { try { sessionStorage.setItem(PREVIEW(id), JSON.stringify([...set])); } catch { /* private mode */ } };

  /* урок по ссылке: отметки «пройдено» живут на этом устройстве (у вошедшего — в его разделе, account-hint.js) */
  const SHARED_DONE = 'lexigo_shared_done_v1';
  const readShared = id => { try { const x = JSON.parse(localStorage.getItem(SHARED_DONE) || '{}'); return Array.isArray(x[id]) ? x[id] : []; } catch { return []; } };
  const writeShared = (id, set) => { try { const x = JSON.parse(localStorage.getItem(SHARED_DONE) || '{}') || {}; x[id] = [...set]; const ks = Object.keys(x); if (ks.length > 100) delete x[ks[0]]; localStorage.setItem(SHARED_DONE, JSON.stringify(x)); } catch { /* private mode */ } };

  /* #/my/s-<токен>: урок учителя по ссылке. Вход не нужен — сервер (shared_lesson) отдаёт только название,
     слова и игры. Вошедший ученик получает прогресс слов в аккаунт, гость — на этом устройстве. */
  async function loadShared(key) {
    const token = key.slice(2);
    if (!C.SHARE_RE.test(token)) return { error: 'shared-missing' };
    if (!C.configured) return { error: 'unavailable' };
    const session = S() ? await S().ready : null;
    const sb = session ? session.sb : await C.client();
    const { data, error } = await sb.rpc('shared_lesson', { t: token });
    if (error) throw error;
    const l = Array.isArray(data) ? data[0] : data;
    if (!l || !l.id) return { error: 'shared-missing' };
    const mine = !!l.mine, words = C.assignmentWords({ lesson_id: l.id }, l);
    if (words.length < 1) return { error: 'shared-missing' };
    const done = new Set(mine ? readPreview('s' + l.id) : readShared(l.id));
    return { key, kind: 's', lesson: { ...l, share_token: token }, preview: mine, mine, guest: !session, profile: session ? session.profile : null, title: l.title, words, modes: C.lessonModes(l),
      done, started: done.size > 0, a: { id: null, lesson_id: l.id }, previewId: 's' + l.id, updated: l.updated_at, token };
  }

  async function load(key) {
    if (key[0] === 's') return loadShared(key);
    const session = S() ? await S().ready : null;
    if (!session) return { error: 'signin' };
    const { sb, user, profile } = session, id = key.slice(2);
    if (key[0] === 'a') {
      const { data: a, error } = await sb.from('assignments').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!a) return { error: 'missing' };
      let lesson = null;
      if (a.lesson_id) { const r = await sb.from('custom_lessons').select('id,title,words').eq('id', a.lesson_id).maybeSingle(); if (r.error) throw r.error; lesson = r.data; if (!lesson) return { error: 'missing' }; }
      const own = a.teacher_id === user.id;   // учитель открыл своё задание — это тренировка, а не результат
      const [t, ses] = await Promise.all([
        sb.from('profiles').select('display_name').eq('id', a.teacher_id).maybeSingle(),
        own ? { data: [] } : sb.from('sessions').select('mode,finished').eq('assignment_id', a.id).eq('user_id', user.id)
      ]);
      if (ses.error) throw ses.error;
      const sess = ses.data || [];
      const done = own ? new Set(readPreview(a.id)) : new Set(sess.filter(s => s.finished).map(s => s.mode));
      return { key, kind: 'a', a, lesson, preview: own, profile, title: a.title, teacher: (t.data && t.data.display_name) || 'Учитель',
        words: C.assignmentWords(a, lesson), modes: a.modes.slice(), done, started: own ? done.size > 0 : sess.length > 0, comment: a.comment, due: a.due_at, previewId: a.id };
    }
    const { data: l, error } = await sb.from('custom_lessons').select('id,owner_id,title,words,modes,share_token,created_at,updated_at').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!l) return { error: 'missing' };
    if (l.owner_id !== user.id) {
      // ученик открыл ссылку на урок учителя — открываем его задание с этим уроком (если оно у него есть)
      const { data: as } = await sb.from('assignments').select('id').eq('lesson_id', l.id).order('created_at', { ascending: false }).limit(1);
      return as && as[0] ? { redirect: 'a-' + as[0].id } : { error: 'foreign' };
    }
    const { data: asg } = await sb.from('assignments').select('id,group_id,student_id,groups(name)').eq('lesson_id', l.id);
    const done = new Set(readPreview(l.id));
    return { key, kind: 't', lesson: l, preview: true, profile, title: l.title, words: C.assignmentWords({ lesson_id: l.id }, l), modes: C.lessonModes(l),
      done, started: done.size > 0, assigned: asg || [], created: l.created_at, a: { id: null, lesson_id: l.id }, previewId: l.id };
  }

  /* ---------- какие игры подходят ---------- */
  function fitOf(x, mode) {
    if (mode === 'review') {
      const has = typeof isReviewWord === 'function' && x.words.some(w => { try { return isReviewWord(w); } catch { return false; } });
      return has ? { ok: true, note: null } : { ok: false, soft: true, note: 'Появится, когда в уроке будут ошибки или слова для повторения.' };
    }
    return C.modeFit(mode, x.words, { runtime: true });
  }
  /* те же игры и та же раскладка, что на странице урока учебника (#launcher) */
  function gameGrid(x) {
    const src = document.querySelector('#launcher .modes');
    const grid = src ? src.cloneNode(true) : h('div', { class: 'modes' }, [...C.ASSIGNABLE, ...C.PLAY_EXTRA].map(m => h('button', { class: 'mode', 'data-mode': m }, h('span', { class: 'mode-symbol', 'aria-hidden': 'true' }), h('span', null, h('strong', { text: C.MODES[m] || m }), h('small', { text: C.MODE_HINTS[m] || '' })))));
    grid.classList.add('my-modes');
    // «Тренировка дня» получает data-game, а не data-mode: иначе сбился бы её значок
    grid.querySelectorAll('[id]').forEach(n => { if (n.id === 'quickStart') n.dataset.game = 'mixed'; n.removeAttribute('id'); });
    grid.querySelectorAll('[aria-labelledby]').forEach(n => { const t = n.querySelector('h3'); n.removeAttribute('aria-labelledby'); if (t) n.setAttribute('aria-label', t.textContent); });
    const unfit = [];
    for (const b of grid.querySelectorAll('.mode')) {
      const m = b.dataset.mode || b.dataset.game; b.type = 'button'; if (m) b.dataset.play = m;   // data-play — единое имя игры на странице урока
      const fit = m ? fitOf(x, m) : { ok: false };
      if (!fit.ok && !fit.soft) { if (m) unfit.push([m, fit.note]); b.remove(); continue; }
      const label = b.querySelector('span:not(.mode-symbol):not(.mode-arrow)') || b;
      const flags = h('span', { class: 'my-flags' });
      if (x.modes.includes(m)) { b.classList.add('is-task'); flags.append(h('span', { class: 'my-flag task', text: x.kind === 't' ? '★ в уроке' : '★ задание' })); }
      if (x.done.has(m)) { b.classList.add('is-done'); flags.append(h('span', { class: 'my-flag done', text: '✓ пройдено' })); }
      if (!fit.ok) { b.classList.add('is-soft'); b.setAttribute('aria-disabled', 'true'); flags.append(h('span', { class: 'my-flag soft', text: 'пока нет ошибок' })); }
      else if (fit.note) flags.append(h('span', { class: 'my-flag part', title: fit.note, text: fit.note.startsWith('Фразы') ? 'без фраз' : fit.note }));
      if (flags.childNodes.length) label.append(flags);
      b.setAttribute('aria-label', (C.MODES[m] || m) + (x.modes.includes(m) ? ', игра задания' : '') + (x.done.has(m) ? ', пройдено' : '') + (fit.ok ? '' : ', ' + fit.note));
      b.onclick = () => { if (!fit.ok) { toast(fit.note); return; } Nav.navigate('/my/' + x.key + '/play/' + m); };
    }
    for (const st of grid.querySelectorAll('.mode-stage')) if (!st.querySelector('.mode')) st.remove();
    const note = unfit.length ? h('details', { class: 'my-unfit' }, h('summary', { text: 'Не подходят к словам этого урока: ' + unfit.map(([m]) => '«' + (C.MODES[m] || m) + '»').join(', ') }),
      h('ul', null, unfit.map(([m, n]) => h('li', { text: (C.MODES[m] || m) + ': ' + (n || 'не подходит к словам урока') })))) : null;
    return { grid, note };
  }

  /* ---------- страница урока ---------- */
  const fmt = (n, a, b, c) => C.ruN(n, a, b, c);
  function crumbsFor(x) {
    if (x.kind === 's') return x.mine ? [['Мои уроки', 'me.html?tab=lessons'], [x.title, '/my/' + x.key]] : [['Урок по ссылке', null], [x.title, '/my/' + x.key]];
    const teacher = x.profile && x.profile.role === 'teacher';
    return [[teacher ? (x.kind === 't' ? 'Мои уроки' : 'Задания') : 'Уроки от учителя', teacher ? (x.kind === 't' ? 'me.html?tab=lessons' : 'me.html?tab=tasks') : 'me.html'], [x.title, '/my/' + x.key]];
  }
  function header(x) {
    const st = C.lessonState(x.modes, x.done, x.started), known = x.words.filter(w => C.knownLocal(prog(w.id))).length;
    const teacher = x.profile && x.profile.role === 'teacher';
    let eyebrow, meta;
    if (x.kind === 's') {
      eyebrow = x.mine ? 'МОЙ УРОК · ТАК ЕГО ВИДЯТ УЧЕНИКИ ПО ССЫЛКЕ' : 'УРОК ОТ УЧИТЕЛЯ · ПО ССЫЛКЕ';
      meta = fmt(x.words.length, 'слово', 'слова', 'слов') + (x.updated ? ' · обновлён ' + C.fmtDate(x.updated) : '');
    } else if (x.kind === 't') {
      const groups = [...new Set(x.assigned.map(a => a.groups && a.groups.name).filter(Boolean))];
      eyebrow = 'МОЙ УРОК';
      meta = fmt(x.words.length, 'слово', 'слова', 'слов') + ' · создан ' + C.fmtDate(x.created) + ' · ' + (groups.length ? 'назначен: ' + groups.join(', ') : 'ещё не назначен');
    } else {
      eyebrow = x.preview ? 'ЗАДАНИЕ КЛАССУ · ВЫ ПРОХОДИТЕ КАК УЧЕНИК' : 'УРОК ОТ УЧИТЕЛЯ';
      meta = (x.preview ? '' : x.teacher + ' · ') + fmt(x.words.length, 'слово', 'слова', 'слов') + (x.due ? ' · срок: ' + C.fmtDate(x.due, true) : '');
    }
    const actions = x.kind === 's'
      ? (x.mine ? [h('a', { class: 'btn secondary', href: 'me.html?edit=' + x.lesson.id, text: 'Редактировать' })]
        : x.guest ? [h('a', { class: 'btn secondary', href: 'auth.html?next=' + encodeURIComponent('index.html#/s/' + x.token), text: 'Войти, чтобы прогресс был в аккаунте' })] : [])
      : x.kind === 't'
      ? [h('a', { class: 'btn good', href: 'me.html?assign=' + x.lesson.id, text: 'Назначить ученикам' }), h('a', { class: 'btn secondary', href: 'me.html?edit=' + x.lesson.id, text: 'Редактировать' })]
      : teacher ? [h('a', { class: 'btn secondary', href: 'me.html?tab=tasks', text: 'К заданиям' })]
        : [h('a', { class: 'btn secondary', href: 'me.html', text: 'В кабинет' })];
    const progressText = (x.kind !== 'a' ? 'Пройдено игр урока: ' : 'Игры задания: ') + st.doneCount + ' из ' + st.total + ' · знаю ' + known + ' из ' + fmt(x.words.length, 'слова', 'слов', 'слов');
    return h('header', { class: 'my-head current-lesson' },
      h('div', { class: 'my-head-main' },
        h('p', { class: 'eyebrow', text: eyebrow }),
        h('h1', { id: 'myLessonTitle', tabindex: '-1', text: x.title }),
        h('p', { class: 'my-meta', text: meta }),
        h('div', { class: 'my-progress' },
          h('span', { class: 'tl-status tl-s-' + st.state, text: (st.state === 'done' ? '✓ ' : '') + (x.preview && st.state === 'done' ? 'Все игры пройдены' : st.label) }),
          h('div', { class: 'tl-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': st.percent, 'aria-label': 'Прогресс урока' }, h('i', { style: { width: st.percent + '%' } })),
          h('small', { text: progressText }))),
      h('div', { class: 'my-head-actions' }, actions));
  }
  function wordsPanel(x) {
    const list = h('ul', { class: 'my-word-list' }), LIMIT = 12;
    const say = canSpeak();
    x.words.forEach((w, i) => {
      const known = C.knownLocal(prog(w.id));
      list.append(h('li', { class: (known ? 'known' : '') + (i >= LIMIT ? ' extra' : ''), hidden: i >= LIMIT },
        h('b', { lang: 'en', text: w.en }), h('span', { text: w.ru }),
        known ? h('i', { class: 'my-known', title: 'Знаю', 'aria-label': 'знаю', text: '✓' }) : null,
        say ? h('button', { type: 'button', class: 'my-say', 'aria-label': 'Послушать: ' + w.en, text: '🔊', onclick: () => { try { speak(w.en); } catch { /* no voice */ } } }) : null));
    });
    const more = x.words.length > LIMIT ? h('button', { type: 'button', class: 'btn secondary my-more', text: 'Показать все ' + fmt(x.words.length, 'слово', 'слова', 'слов'), 'aria-expanded': 'false',
      onclick: e => { const open = e.currentTarget.getAttribute('aria-expanded') !== 'true'; list.querySelectorAll('li.extra').forEach(li => { li.hidden = !open; }); e.currentTarget.setAttribute('aria-expanded', String(open)); e.currentTarget.textContent = open ? 'Свернуть' : 'Показать все ' + fmt(x.words.length, 'слово', 'слова', 'слов'); } }) : null;
    return h('section', { class: 'panel my-words', 'aria-labelledby': 'myWordsH' },
      h('div', { class: 'my-sec-head' }, h('h2', { id: 'myWordsH', text: 'Слова урока' }), h('span', { class: 'my-count', text: x.words.length }),
        h('a', { class: 'text-button my-jump', href: '#myGames', onclick: e => { e.preventDefault(); document.getElementById('myGames')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, text: 'К играм ↓' })),
      list, more);
  }
  /* учитель: ссылка для учеников и рабочий лист A4 — прямо на странице своего урока */
  function teacherTools(x) {
    const wrap = h('div', { class: 'my-tools' });
    const S0 = S();
    if (x.kind === 't') S0?.ready.then(session => { if (session) wrap.prepend(C.sharePanel(session.sb, x.lesson, { onChange: t => { x.lesson.share_token = t; } })); });
    wrap.append(worksheetPanel(x));
    return wrap;
  }
  const WS_KEY = 'lexigo_ws_custom_v1';
  function worksheetPanel(x) {
    let saved = {}; try { saved = JSON.parse(localStorage.getItem(WS_KEY) || '{}') || {}; } catch { saved = {}; }
    const names = { quiz: 'Выбери перевод', spell: 'Напиши слово', fix: 'Исправь ошибку', truefalse: 'Верно / неверно' };
    const chosen = new Set(Array.isArray(saved.types) && saved.types.length ? saved.types : Object.keys(names));
    const count = h('select', { class: 'ws-count', 'aria-label': 'Количество заданий' }, ['all', '5', '10', '15', '20', '25', '30'].map(v => h('option', { value: v, text: v === 'all' ? 'Все слова урока (' + x.words.length + ')' : v + ' заданий' })));
    count.value = saved.amount && [...count.options].some(o => o.value === saved.amount) ? saved.amount : 'all';
    const checks = h('div', { class: 'ws-types', role: 'group', 'aria-label': 'Типы заданий' }, Object.entries(names).map(([k, t]) => h('label', null, h('input', { type: 'checkbox', value: k, checked: chosen.has(k) }), ' ' + t)));
    const msg = h('p', { class: 'ws-msg', role: 'status' });
    const go = h('button', { type: 'button', class: 'btn good', text: '🖨 Подготовить PDF / распечатать', onclick: () => {
      const types = [...checks.querySelectorAll('input:checked')].map(i => i.value);
      if (!types.length) { msg.textContent = 'Выберите хотя бы один тип заданий.'; return; }
      msg.textContent = '';
      try { localStorage.setItem(WS_KEY, JSON.stringify({ types, amount: count.value })); } catch { /* private mode */ }
      if (typeof printTeacherTest === 'function') printTeacherTest({ words: x.words, types, amount: count.value, subtitle: 'Урок учителя · ' + x.title });
    } });
    return h('details', { class: 'panel ws-panel' }, h('summary', null, h('b', { text: 'Рабочий лист A4' }), h('span', { text: 'самостоятельная работа по словам урока' })),
      h('div', { class: 'ws-body' }, h('label', { class: 'ws-field' }, h('span', { text: 'Количество заданий' }), count), h('p', { class: 'ws-label', text: 'Типы заданий' }), checks,
        h('p', { class: 'ws-note', text: 'До 20 заданий на странице. Критерии, шкала и ключи — на отдельном листе для учителя (шкалу можно поменять в «Материалах для учителя» любого урока учебника).' }), go, msg));
  }
  function renderPage(x, opts = {}) {
    const { grid, note } = gameGrid(x);
    const teacherSide = x.preview;
    const hint = x.kind === 's' ? (x.mine ? 'Так урок выглядит у учеников, открывших ссылку. ★ — игры урока.' : 'Проходи игры в любом порядке. ★ — игры, которые выбрал учитель.')
      : x.kind === 't' ? 'Можно пройти любую игру. ★ — игры урока: их получат ученики, когда вы назначите урок.'
      : teacherSide ? '★ — игры, которые получили ученики. Ваши тренировки не попадают в их результаты.'
        : x.modes.length >= grid.querySelectorAll('.mode').length ? 'Проходи игры в любом порядке. Пройди все — и урок будет завершён!'
          : 'Игры со звёздочкой ★ выбрал учитель — пройди их, чтобы завершить урок. Остальные — дополнительная тренировка.';
    page.replaceChildren(...[
      header(x),
      x.comment ? h('div', { class: 'my-comment' }, h('img', { src: 'assets/lexi-head.webp', alt: '', width: 56, height: 56 }), h('p', null, h('b', { text: (x.preview ? 'Комментарий для учеников' : x.teacher + ' пишет') + ': ' }), x.comment)) : null,
      teacherSide ? h('p', { class: 'task-preview-note', text: '👁 Вы проходите урок как ученик. Результаты не сохраняются в статистику класса, не начисляют XP и не попадают в ТОП-3.' }) : null,
      (x.kind === 't' || (x.kind === 's' && x.mine)) ? teacherTools(x) : null,
      wordsPanel(x),
      h('section', { class: 'panel my-games', id: 'myGames', 'aria-labelledby': 'myGamesH' },
        h('div', { class: 'mode-heading' }, h('h2', { id: 'myGamesH', text: 'Выбери игру' }), h('p', { text: hint })), grid, note,
        h('p', { class: 'progress-note', text: teacherSide ? 'Отметки «пройдено» в режиме учителя видны только вам и только до закрытия вкладки.'
          : x.kind === 's' && x.guest ? 'Прогресс сохраняется на этом устройстве. Войди в аккаунт, чтобы он был доступен везде.'
          : x.kind === 's' ? 'Слова урока попадают в прогресс твоего аккаунта. Отметки «пройдено» — на этом устройстве.'
          : 'Прогресс сохраняется в твоём аккаунте — можно выйти и вернуться к уроку позже, с любого устройства.' }))].filter(Boolean));
    Nav.crumbs(crumbsFor(x).map((c, i, all) => i === all.length - 1 ? [c[0], null] : c));
    document.title = x.title + ' — LEXI';
    if (opts.games) setTimeout(() => document.getElementById('myGames')?.scrollIntoView({ block: 'start' }), 30);
    else if (opts.focus !== false) { document.getElementById('myLessonTitle')?.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }
  }
  function renderError(kind, key) {
    const text = { signin: ['Войди в аккаунт', 'Уроки от учителя открываются после входа в аккаунт.'], missing: ['Урок не найден', 'Возможно, учитель удалил задание или ты больше не в этом классе.'],
      foreign: ['Этот урок открывается через задание', 'Попроси учителя назначить урок твоему классу — тогда он появится на главной и в кабинете.'], network: ['Нет связи', 'Не получилось загрузить урок. Проверь интернет и попробуй ещё раз.'],
      'shared-missing': ['Ссылка не открывает урок', 'Возможно, учитель выключил доступ по ссылке, удалил урок или в ссылке опечатка. Попроси у учителя новую ссылку.'],
      unavailable: ['Уроки по ссылке пока недоступны', 'Сервер уроков не подключён. Попробуй позже — игры учебника работают и сейчас.'] }[kind] || ['Урок недоступен', ''];
    page.replaceChildren(h('div', { class: 'my-empty panel' }, h('img', { src: 'assets/lexi-head.webp', alt: '', width: 120, height: 120 }), h('h1', { id: 'myLessonTitle', tabindex: '-1', text: text[0] }), h('p', { text: text[1] }),
      h('div', { class: 'buttons' }, kind === 'signin' ? h('a', { class: 'btn good', href: 'auth.html?next=' + encodeURIComponent('index.html#/my/' + key), text: 'Войти' }) : null,
        kind === 'network' ? h('button', { type: 'button', class: 'btn good', text: 'Попробовать ещё раз', onclick: () => open(key) }) : null,
        kind.startsWith('shared') || kind === 'unavailable' ? null : h('a', { class: 'btn secondary', href: 'me.html', text: 'В кабинет' }), h('a', { class: 'btn secondary', href: '#/home', text: 'На главную' }))));
    Nav.crumbs([['Урок', null]]); document.getElementById('myLessonTitle')?.focus({ preventScroll: true });
  }
  const loadingView = () => h('div', { class: 'my-loading panel', role: 'status' }, h('img', { src: 'assets/lexi-head.webp', alt: '', width: 72, height: 72 }), h('p', { text: 'Лекси открывает урок…' }));

  async function fetchLesson(key) {
    let x;
    try { x = await load(key); } catch (e) { console.warn('LEXI lesson', e); x = { error: 'network' }; }
    return x;
  }
  async function open(key, opts = {}) {
    document.getElementById('myLessonBanner')?.remove();
    const here = route();
    if (cur && cur.key === key) { Nav.setCustom({ key, crumbs: crumbsFor(cur) }); renderPage(cur, opts); }
    else { cur = null; page.replaceChildren(loadingView()); Nav.crumbs([['Урок', null]]); }
    const x = await fetchLesson(key);
    if (route() !== here) return;                       // ученик уже ушёл на другую страницу
    if (x.redirect) { Nav.navigate('/my/' + x.redirect, { replace: true }); return; }
    if (x.error) { if (!cur) renderError(x.error, key); return; }
    const first = !cur;
    // отметки «пройдено» только добавляются: игра, законченная секунду назад, могла ещё не дойти до сервера
    if (cur && cur.key === key) { for (const m of cur.done) x.done.add(m); x.started = x.started || cur.started; }
    cur = x; Nav.setCustom({ key, crumbs: crumbsFor(x) });
    renderPage(x, first ? opts : { ...opts, focus: false, games: false });
  }
  async function play(key, mode) {
    await Promise.resolve();                              // после того как маршрутизатор закончит отрисовку
    const here = route();
    if (!cur || cur.key !== key) {
      const x = await fetchLesson(key);
      if (route() !== here) return;
      if (x.redirect) { Nav.navigate('/my/' + x.redirect + '/play/' + mode, { replace: true }); return; }
      if (x.error) { Nav.navigate('/my/' + key, { replace: true }); return; }
      cur = x;
    }
    if (!launch(mode)) Nav.navigate('/my/' + key, { replace: true });
  }

  /* ---------- запуск игры: общий движок LEXI (start) с номером урока в «метке» результата ---------- */
  function launch(mode) {
    const x = cur; if (!x) return false;
    const fit = fitOf(x, mode);
    if (!fit.ok) { toast(fit.note); return false; }
    let ws = x.words.slice();
    if (mode === 'boss' || mode === 'crystals') ws = ws.filter(C.isSingleWord);
    if (mode === 'review') ws = ws.filter(w => { try { return isReviewWord(w); } catch { return false; } });
    if (x.a && !x.a.lesson_id && x.a.section_indexes && x.a.section_indexes.length) {
      // задание по Spotlight: контекст учебника (нужен «Кристаллам» и итогам), без смены страницы
      try { const b = DB.books.find(y => Number(y.grade) === Number(x.a.grade)), s = b.sections[x.a.section_indexes[0]];
        document.getElementById('book').value = String(x.a.grade); changeBook(); document.getElementById('module').value = s.module; changeModule(); document.getElementById('unit').value = String(x.a.section_indexes[0]); changeUnit(); } catch { /* keep current context */ }
    }
    const size = { pairs: 10, cards: 20, boss: 15, review: 12 }[mode] || 15;
    const picked = typeof lexiRound === 'function' ? lexiRound(ws, size) : ws.slice(0, size);
    const types = { mixed: ['quiz', 'spell', 'truefalse', 'spell', 'fix'], boss: ['spell', 'quiz', 'spell', 'truefalse'], crystals: ['quiz', 'truefalse', 'fix'], review: ['spell', 'builder', 'quiz', 'spell', 'audio'] }[mode];
    S()?.setMeta(x.kind === 's' && !x.preview ? { scope: 'custom', taskKey: x.key, lesson_id: x.lesson.id, title: x.title } : x.preview ? { scope: 'custom', preview: true, taskKey: x.key, lesson_id: x.a.lesson_id || null, title: x.title }
      : { scope: 'assignment', taskKey: x.key, assignment_id: x.a.id, lesson_id: x.a.lesson_id || null, grade: x.a.grade || null, section_index: x.a.section_indexes ? x.a.section_indexes[0] : null, title: x.title });
    Nav.setCustom({ key: x.key, crumbs: crumbsFor(x) });
    // 2026-11-03: большой урок — по порядку блоками (раунд 1 — первые слова, раунд 2 — следующие…), см. word-rounds.js
    const rounds = window.LexiRounds && !['review', 'crystals'].includes(mode) && ws.length > (mode === 'pairs' ? 9 : size);
    if (rounds) LexiRounds.launch({ key: ('T.' + x.key).replace(/[^A-Za-z0-9:_|.-]/g, '').slice(0, 70) + '|' + mode, pool: ws, mode, types, size: mode === 'pairs' ? 9 : size, pick: mode === 'pairs' ? uniquePairs : null, again: () => launch(mode) });
    else start(mode, picked, types);
    if (!game) { S()?.setMeta(null); return false; }
    document.getElementById('myLessonBanner')?.remove();
    const banner = h('p', { id: 'myLessonBanner', class: 'task-banner' + (x.preview ? ' preview' : '') },
      x.preview ? '👁 Тренировка учителя · «' + x.title + '» · результаты не сохраняются · ' : x.kind === 's' && x.guest ? '✏️ Урок по ссылке · «' + x.title + '» · прогресс на этом устройстве · ' : '✏️ Урок от учителя · «' + x.title + '» · прогресс сохраняется · ',
      h('button', { type: 'button', text: 'к уроку', onclick: () => { try { stop(); } catch { Nav.navigate('/my/' + x.key); } } }));
    document.getElementById('game')?.prepend(banner);
    return true;
  }
  const owns = g => !!(g && cur && g.cloud && g.cloud.meta && g.cloud.meta.taskKey === cur.key);
  function markDone(g) {
    if (!owns(g)) return;
    cur.done.add(g.mode); cur.started = true; homeDirty = true;
    if (cur.preview) writePreview(cur.previewId, cur.done);
    else if (cur.kind === 's') writeShared(cur.lesson.id, cur.done);
  }
  // после раунда: вернуться на страницу урока
  new MutationObserver(() => {
    const card = document.querySelector('#play .lesson-result, #play .pair-finish');
    if (!card || card.dataset.myLesson || !owns(game)) return;
    card.dataset.myLesson = '1';
    const x = cur;
    card.append(h('div', { class: 'task-return' }, h('button', { type: 'button', class: 'btn good', text: x.preview ? 'К играм урока' : 'Вернуться к уроку', onclick: () => Nav.navigate('/my/' + x.key) })));
  }).observe(document.getElementById('play') || document.body, { childList: true, subtree: true });

  /* ---------- главная ученика: «Твой урок от учителя» первым ---------- */
  async function home(force) {
    const homePage = document.getElementById('homePage'); if (!homePage) return;
    let host = document.getElementById('myLessonsHome');
    if (!host) { host = h('section', { id: 'myLessonsHome', class: 'tl-home', 'aria-label': 'Уроки от учителя', hidden: true }); homePage.prepend(host); }
    if (homeBusy || (!force && !homeDirty && Date.now() - homeStamp < 30000)) return;
    const session = S() ? await S().ready : null;
    if (session && session.profile && session.profile.role === 'teacher') { await teacherHome(host, session); return; }
    if (!session || !session.profile || session.profile.role !== 'student') { host.hidden = true; host.replaceChildren(); return; }
    homeBusy = true;
    try {
      const items = await C.loadStudentLessons(session.sb, session.user.id, id => C.knownLocal(prog(id)));
      homeDirty = false; homeStamp = Date.now();
      if (!items.length) { host.hidden = true; host.replaceChildren(); return; }
      const [first, ...rest] = items, open = items.filter(i => i.st.state !== 'done').length;
      host.replaceChildren(...[C.lessonCard(first, { variant: 'feature' }),
        rest.length ? h('div', { class: 'tl-more' },
          h('div', { class: 'tl-more-head' }, h('h2', { text: 'Уроки от учителя' }), h('span', { class: 'tl-count', text: open ? 'не завершено: ' + open : 'все пройдены' }), h('a', { class: 'text-button', href: 'me.html', text: 'Все в кабинете →' })),
          h('div', { class: 'tl-grid' }, rest.slice(0, 6).map(x => C.lessonCard(x)))) : null].filter(Boolean));
      host.hidden = false;
    } catch (e) { console.warn('LEXI: teacher lessons not loaded', e); }
    finally { homeBusy = false; }
  }
  /* главная учителя: «Создайте свой урок» — сразу к форме нового урока; рядом — «Мои уроки» */
  async function teacherHome(host, session) {
    homeBusy = true;
    try {
      let n = null;
      try { const r = await session.sb.from('custom_lessons').select('id', { count: 'exact', head: true }).eq('owner_id', session.user.id); if (!r.error) n = r.count; } catch { n = null; }
      homeDirty = false; homeStamp = Date.now();
      host.className = 'tl-home tl-teacher-home';
      host.setAttribute('aria-label', 'Свой урок');
      host.replaceChildren(h('div', { class: 'teacher-start' },
        h('img', { src: 'assets/lexi-head.webp', alt: '', width: 64, height: 64 }),
        h('div', { class: 'teacher-start-text' }, h('p', { class: 'eyebrow', text: 'ДЛЯ УЧИТЕЛЯ' }), h('h2', { text: 'Создайте свой урок' }),
          h('p', { text: 'Добавьте свои слова и поделитесь уроком с учениками по ссылке.' })),
        h('div', { class: 'teacher-start-actions' },
          h('a', { class: 'btn good', href: 'me.html?new=1', text: '＋ Создать урок' }),
          h('a', { class: 'btn secondary', href: 'me.html?tab=lessons', text: n ? 'Мои уроки · ' + n : 'Мои уроки' }))));
      host.hidden = false;
    } finally { homeBusy = false; }
  }
  const homeVisible = () => { const p = document.getElementById('homePage'); return p && !p.hidden; };
  new MutationObserver(() => { if (homeVisible()) home(); }).observe(document.getElementById('homePage'), { attributes: true, attributeFilter: ['hidden'] });

  window.LexigoMyLessons = Object.freeze({ open, play, launch, owns, markDone, dirty: () => { homeDirty = true; }, home, current: () => cur });
  if (/^#\/my\//.test(location.hash)) Nav.refresh();
  else if (homeVisible()) home(true);
})();
