/* LEXI Cloud core — общий модуль для главной, входа и кабинетов (2026-11-02).
 * Подключается после config.js и account-hint.js. Библиотека Supabase загружается
 * только если облако настроено (config.js), поэтому гостевой режим ничего лишнего не грузит. */
(() => {
  'use strict';
  const cfg = window.LEXIGO_CLOUD || {};
  // https only; plain http is accepted solely for a local test stack on this computer
  const configured = typeof cfg.url === 'string' && /^(https:\/\/[a-z0-9.-]+|http:\/\/(127\.0\.0\.1|localhost)(:\d+)?)$/i.test(cfg.url.replace(/\/$/, '')) && typeof cfg.anonKey === 'string' && cfg.anonKey.length > 20;
  const VENDOR = 'vendor/supabase-2.118.0.min.js';
  let clientPromise = null;

  function loadVendor() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script'); s.src = VENDOR; s.async = true;
      s.onload = () => resolve(); s.onerror = () => reject(new Error('Не удалось загрузить модуль аккаунтов'));
      document.head.append(s);
    });
  }
  /* 2026-11-03: запрос к серверу аккаунтов не висит бесконечно (медленная или ограниченная сеть):
     через 15 с он прерывается, сайт продолжает работать в гостевом режиме и показывает понятное сообщение */
  const TIMEOUT_MS = 15000;
  function timedFetch(input, init = {}) {
    if (typeof AbortController !== 'function') return fetch(input, init);
    const ctl = new AbortController(), outer = init.signal;
    if (outer) { if (outer.aborted) ctl.abort(); else outer.addEventListener('abort', () => ctl.abort(), { once: true }); }
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    return fetch(input, { ...init, signal: ctl.signal }).catch(e => { if (ctl.signal.aborted && !(outer && outer.aborted)) throw new Error('Сервер не отвечает (timeout)'); throw e; }).finally(() => clearTimeout(timer));
  }
  function client(opts = {}) {
    if (!configured) return Promise.reject(new Error('not-configured'));
    if (!clientPromise) clientPromise = loadVendor().then(() => window.supabase.createClient(cfg.url.replace(/\/$/, ''), cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: !!opts.detectSessionInUrl, flowType: 'implicit', storageKey: 'lexigo-auth' },
      global: { fetch: timedFetch }
    }));
    return clientPromise;
  }

  /* ---------- game vocabulary shared with the cabinets ---------- */
  const LEVEL_TITLES = ['Новичок', 'Путешественник', 'Исследователь', 'Следопыт', 'Знаток слов', 'Мастер слов', 'Капитан LEXI', 'Легенда LEXI'];
  const levelStart = l => 50 * l * (l - 1);
  function levelOf(xp) { xp = Math.max(0, Number(xp) || 0); let l = 1; while (xp >= levelStart(l + 1)) l++; return { level: l, title: LEVEL_TITLES[Math.min(l - 1, LEVEL_TITLES.length - 1)], from: levelStart(l), to: levelStart(l + 1), xp }; }
  const MODES = { cards: 'Карточки', quiz: 'Выбери перевод', spell: 'Напиши слово', pairs: 'Найди пару', truefalse: 'Верно / неверно', fix: 'Исправь ошибку', audio: 'Аудиодиктант', crystals: 'Кристаллы', boss: 'Финальный тест', mixed: 'Тренировка дня', builder: 'Конструктор слов', listen: 'Слушай и выбирай', review: 'Работа над ошибками' };
  const ASSIGNABLE = ['quiz', 'spell', 'pairs', 'truefalse', 'cards', 'fix', 'builder', 'listen', 'audio', 'mixed', 'boss', 'crystals'];
  /* Подходит ли игра к набору слов. Правила совпадают с самими играми (practice-controller.js):
     «Конструктор», «Аудиодиктант», «Кристаллы», «Финальный тест» — только отдельные слова, без фраз. */
  const MODE_HINTS = { cards: 'переворачивай и вспоминай', quiz: 'выбор перевода', spell: 'написание по памяти', pairs: 'поиск пар на время', truefalse: 'быстрая проверка',
    fix: 'найди ошибку в слове', audio: 'услышь и напиши', crystals: 'экспедиция за кристаллами', boss: 'итоговая проверка', mixed: 'разные задания подряд',
    builder: 'собери слово из букв', listen: 'выбери услышанное', review: 'повтор ошибок' };
  const wordForm = s => String(s == null ? '' : s).trim().replace(/^[¡¿"“«(\[]+|[!?.,;:…"”»)\]]+$/g, '').trim();
  const isSingle = w => /^[a-zA-Z]+(?:[-'’‘][a-zA-Z]+)*$/.test(wordForm(w && w.en));
  const isBuilder = w => { if (window.LexiWordBuilder) return window.LexiWordBuilder.isBuilderWord(w); const n = wordForm(w && w.en).replace(/[^a-z]/gi, '').length; return isSingle(w) && n >= 2 && n <= 14; };
  const norm = s => String(s || '').toLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}' -]/gu, '').replace(/\s+/g, ' ').trim();
  function uniquePairCount(ws) { const a = new Set(), b = new Set(); let n = 0; for (const w of ws) { const x = norm(w.en), y = norm(w.ru); if (a.has(x) || b.has(y)) continue; a.add(x); b.add(y); n++; } return n; }
  const speechOK = () => typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance === 'function';
  const ruN = (n, one, few, many) => { const a = n % 10, b = n % 100; return n + ' ' + (a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many); };
  /* → { ok, usable, total, note } ; note объясняет причину отказа или частичного использования */
  function modeFit(mode, list, opts = {}) {
    const ws = (list || []).filter(isLexical), total = ws.length;
    const single = ws.filter(isSingle).length;
    const need = (n, min, what) => n >= min ? null : (n ? 'Нужно минимум ' + ruN(min, what[0], what[1], what[2]) + ', а в уроке ' + n + '.' : 'В уроке нет ' + what[2] + '.');
    let usable = total, note = null;
    if (mode === 'builder') { usable = ws.filter(isBuilder).length; note = need(usable, 1, ['отдельное слово', 'отдельных слова', 'отдельных слов (2–14 букв)']); if (note) note = '«Конструктор» собирает только отдельные слова из 2–14 букв. ' + note; }
    else if (mode === 'audio') { usable = single; note = need(usable, 1, ['отдельное слово', 'отдельных слова', 'отдельных слов']); if (note) note = '«Аудиодиктант» диктует только отдельные слова, без фраз. ' + note; }
    else if (mode === 'crystals') { usable = single; note = need(usable, 1, ['отдельное слово', 'отдельных слова', 'отдельных слов']); if (note) note = '«Кристаллы» работают только с отдельными словами. ' + note; }
    else if (mode === 'boss') { usable = single; note = need(usable, 3, ['отдельное слово', 'отдельных слова', 'отдельных слов']); if (note) note = '«Финальный тест» проверяет только отдельные слова. ' + note; }
    else if (mode === 'pairs') { usable = uniquePairCount(ws); note = need(usable, 2, ['пара', 'пары', 'пар с разными словами и переводами']); }
    else if (['quiz', 'truefalse', 'listen'].includes(mode)) note = need(total, 2, ['слово', 'слова', 'слов']);
    else note = need(total, 1, ['слово', 'слова', 'слов']);
    const ok = !note;
    if (ok && (mode === 'audio' || mode === 'listen') && opts.runtime && !speechOK()) return { ok: false, usable, total, note: 'В этом браузере нет озвучки — игра на слух недоступна.' };
    if (ok && usable < total && ['builder', 'audio', 'crystals', 'boss'].includes(mode)) note = 'Фразы пропускаются: в игре ' + ruN(usable, 'слово', 'слова', 'слов') + ' из ' + total + '.';
    return { ok, usable, total, note };
  }
  /* игры своего урока: сохранённый список или (для старых уроков) все игры */
  function lessonModes(lesson) { const m = lesson && Array.isArray(lesson.modes) ? lesson.modes.filter(x => ASSIGNABLE.includes(x)) : []; return m.length ? ASSIGNABLE.filter(x => m.includes(x)) : ASSIGNABLE.slice(); }
  const BADGES = [
    ['streak3', '🔥', 'Три дня подряд', 'Занимайся 3 дня подряд', s => s.streak_best >= 3],
    ['streak7', '📅', 'Неделя слов', 'Занимайся 7 дней подряд', s => s.streak_best >= 7],
    ['perfect', '⭐', 'Без единой ошибки', 'Пройди раунд из 5+ слов без ошибок', s => s.perfect_games >= 1],
    ['missions', '🎯', 'Охотник за миссиями', 'Выполни 10 ежедневных миссий', s => s.missions_total >= 10],
    ['boss', '🛡️', 'Победитель стража', 'Пройди финальный тест модуля', s => s.bosses >= 1],
    ['boss5', '🏆', 'Покоритель модулей', 'Пройди финальные тесты 5 модулей', s => s.bosses >= 5],
    ['level5', '🎓', 'Знаток слов', 'Достигни 5 уровня', s => levelOf(s.xp).level >= 5]
  ];
  const AVATARS = { cat: '🐱', fox: '🦊', owl: '🦉', panda: '🐼', lion: '🦁', rabbit: '🐰', dino: '🦖', rocket: '🚀', star: '⭐', book: '📘' };

  let wordIndex = null;
  function words() {
    if (wordIndex) return wordIndex;
    wordIndex = new Map();
    const DB = window.LEXIGO_DATA;
    if (DB) for (const b of DB.books) b.sections.forEach((s, si) => s.words.forEach(w => wordIndex.set(w.id, { en: w.en, ru: w.ru, grade: b.grade, section: si, module: s.module, title: s.title })));
    return wordIndex;
  }
  const NON_LEXICAL = /^Module\s+\d+[a-z]?$/i;
  const isLexical = w => !!w && !(NON_LEXICAL.test(String(w.en).trim()) && !/[а-яё]/i.test(String(w.ru)));
  /* Custom lesson words get stable ids: c_<first 8 hex of lesson id>_<index> */
  const customWordId = (lessonId, i) => 'c_' + String(lessonId).replace(/-/g, '').slice(0, 8) + '_' + i;
  function customWords(lesson) {
    return (Array.isArray(lesson.words) ? lesson.words : []).slice(0, 200).map((w, i) => ({ id: customWordId(lesson.id, i), en: String(w.en || '').slice(0, 80), ru: String(w.ru || '').slice(0, 120) })).filter(w => w.en && w.ru);
  }
  /* "word — translation" lines → [{en,ru}] */
  function parseWordList(text) {
    const out = [], seen = new Set();
    for (const raw of String(text || '').split(/\r?\n/)) {
      const line = raw.trim(); if (!line) continue;
      const m = line.match(/^(.+?)\s*(?:\t|\s[—–-]\s|\s?[—–]\s?|;|=|:)\s*(.+)$/);
      if (!m) continue;
      const en = m[1].trim().replace(/\s+/g, ' ').slice(0, 80), ru = m[2].trim().replace(/\s+/g, ' ').slice(0, 120);
      if (!en || !ru || !/[a-z]/i.test(en)) continue;
      const k = en.toLowerCase() + '|' + ru.toLowerCase(); if (seen.has(k)) continue; seen.add(k);
      out.push({ en, ru });
      if (out.length >= 200) break;
    }
    return out;
  }

  /* ---------- уроки от учителя: одна модель для главной, кабинета ученика и страницы урока (2026-11-02 v2) ----------
   * «Урок от учителя» = назначенное задание (свой урок учителя или уроки Spotlight).
   * Игры, которые выбрал учитель, определяют статус; на странице урока доступны и все остальные подходящие игры. */
  const PLAY_EXTRA = ['review'];               // игры страницы урока сверх назначаемых (работа над ошибками)
  function assignmentWords(a, lesson) {
    let ws = [];
    if (a && a.lesson_id) ws = lesson ? customWords(lesson) : [];
    else if (a) {
      const DB = window.LEXIGO_DATA, b = DB && DB.books.find(x => Number(x.grade) === Number(a.grade));
      if (b) for (const i of a.section_indexes || []) if (b.sections[i]) ws.push(...b.sections[i].words);
      if (a.word_ids && a.word_ids.length) { const keep = new Set(a.word_ids); ws = ws.filter(w => keep.has(w.id)); }
    }
    const seen = new Set();
    return ws.filter(isLexical).filter(w => !seen.has(w.id) && seen.add(w.id));
  }
  const STATES = { new: 'Не начат', progress: 'В процессе', done: 'Завершён' };
  function lessonState(modes, done, started) {
    const total = modes.length, n = modes.filter(m => done.has(m)).length;
    const state = total && n === total ? 'done' : (n || started) ? 'progress' : 'new';
    return { state, label: STATES[state], doneCount: n, total, percent: total ? Math.round(n / total * 100) : 0 };
  }
  /* слово «знаю»: хотя бы раз отвечено верно и последний ответ верный */
  const knownLocal = p => !!p && (Number(p.right) || 0) >= 1 && (Number(p.streak) || 0) >= 1;
  const knownRow = r => !!r && r.right_count >= 1 && r.streak >= 1;
  /* все уроки ученика: [{ a, title, teacher, group, words, done:Set, started, st, known, due, overdue, key }] */
  async function loadStudentLessons(sb, uid, known = () => false) {
    const [mem, asg, ses] = await Promise.all([
      sb.from('group_members').select('group_id,groups(id,name,teacher_id)').eq('student_id', uid),
      sb.from('assignments').select('*').order('created_at', { ascending: false }),
      sb.from('sessions').select('assignment_id,mode,finished').eq('user_id', uid).not('assignment_id', 'is', null).limit(5000)
    ]);
    for (const r of [mem, asg, ses]) if (r.error) throw r.error;
    const groups = new Map((mem.data || []).map(m => [m.group_id, m.groups || {}]));
    // ученик видит только задания своих групп (на сервере это же правило — RLS)
    const list = (asg.data || []).filter(a => groups.has(a.group_id) && (!a.student_id || a.student_id === uid));
    const lessonIds = [...new Set(list.map(a => a.lesson_id).filter(Boolean))];
    const teacherIds = [...new Set(list.map(a => a.teacher_id))];
    const [les, prof] = await Promise.all([
      lessonIds.length ? sb.from('custom_lessons').select('id,title,words').in('id', lessonIds) : { data: [] },
      teacherIds.length ? sb.from('profiles').select('id,display_name').in('id', teacherIds) : { data: [] }
    ]);
    const lessons = new Map((les.data || []).map(l => [l.id, l])), names = new Map((prof.data || []).map(p => [p.id, p.display_name]));
    const done = new Map(), started = new Set();
    for (const s of ses.data || []) { started.add(s.assignment_id); if (s.finished) { if (!done.has(s.assignment_id)) done.set(s.assignment_id, new Set()); done.get(s.assignment_id).add(s.mode); } }
    return sortLessons(list.filter(a => !a.lesson_id || lessons.has(a.lesson_id)).map(a => {
      const words = assignmentWords(a, lessons.get(a.lesson_id)), d = done.get(a.id) || new Set(), st = lessonState(a.modes, d, started.has(a.id));
      return { a, key: 'a-' + a.id, title: a.title, teacher: names.get(a.teacher_id) || 'Учитель', group: (groups.get(a.group_id) || {}).name || '', words, done: d, started: started.has(a.id), st,
        known: words.filter(w => known(w.id)).length, due: a.due_at, overdue: st.state !== 'done' && !!a.due_at && Date.parse(a.due_at) < Date.now() };
    }));
  }
  /* самый актуальный — первым: незавершённые (в процессе → с ближайшим сроком → новые), затем завершённые */
  function sortLessons(items) {
    const rank = x => x.st.state === 'done' ? 2 : x.st.state === 'progress' ? 0 : 1;
    const due = x => x.due ? Date.parse(x.due) : 4e15;
    return items.slice().sort((x, y) => (x.st.state === 'done') - (y.st.state === 'done') || due(x) - due(y) || rank(x) - rank(y) || Date.parse(y.a.created_at) - Date.parse(x.a.created_at));
  }
  function lessonHref(key, fromCabinet) { return (fromCabinet ? 'index.html' : '') + '#/my/' + key; }
  const ruWords = n => ruN(n, 'слово', 'слова', 'слов');
  /* карточка урока: «feature» — крупная на главной, «card» — в списках */
  function lessonCard(x, opts = {}) {
    const feature = opts.variant === 'feature', st = x.st;
    const action = st.state === 'done' ? 'Повторить' : st.state === 'progress' ? 'Продолжить' : 'Открыть урок';
    const meta = [x.teacher, ruWords(x.words.length), x.due ? (x.overdue ? 'срок прошёл ' : 'до ') + fmtDate(x.due, true) : null].filter(Boolean).join(' · ');
    const pct = Math.max(st.percent, st.state === 'progress' && !st.percent ? 4 : 0);
    return h('article', { class: 'tl-card tl-' + st.state + (feature ? ' tl-feature' : '') + (x.overdue ? ' tl-overdue' : ''), 'data-key': x.key },
      feature ? h('img', { class: 'tl-lexi', src: 'assets/lexi-head.webp', alt: '', width: 96, height: 96, loading: 'lazy' }) : null,
      h('div', { class: 'tl-body' },
        h('div', { class: 'tl-top' }, h('span', { class: 'tl-kicker', text: feature ? 'Твой урок от учителя' : 'Урок от учителя' }), h('span', { class: 'tl-status tl-s-' + st.state, text: (st.state === 'done' ? '✓ ' : '') + st.label })),
        h(feature ? 'h2' : 'h3', { class: 'tl-title', text: x.title }),
        h('p', { class: 'tl-meta', text: meta }),
        x.a.comment ? h('p', { class: 'tl-comment', text: '«' + x.a.comment + '»' }) : null,
        h('div', { class: 'tl-progress' },
          h('div', { class: 'tl-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': st.percent, 'aria-label': 'Прогресс урока' }, h('i', { style: { width: pct + '%' } })),
          h('small', { text: 'Игры: ' + st.doneCount + ' из ' + st.total + ' · знаю ' + x.known + ' из ' + ruWords(x.words.length) })),
        h('a', { class: 'tl-btn' + (st.state === 'done' ? ' ghost' : ''), href: lessonHref(x.key, opts.fromCabinet), 'aria-label': action + ': ' + x.title }, action + ' →')));
  }

  /* ---------- tiny safe DOM helper (text only, never innerHTML with data) ---------- */
  function h(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
      else n.setAttribute(k, v === true ? '' : String(v));
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid instanceof Node ? kid : String(kid));
    return n;
  }
  const fmtDate = (d, withTime) => { if (!d) return ''; const x = new Date(d); return x.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + (withTime ? ', ' + x.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : ''); };
  const localDay = (t = new Date()) => t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  function clientId() { const a = new Uint8Array(12); crypto.getRandomValues(a); return 's' + Date.now().toString(36) + '-' + Array.from(a, b => b.toString(16).padStart(2, '0')).join(''); }

  /* Friendly Russian messages for Supabase Auth errors */
  function authMessage(err) {
    const m = String(err && (err.message || err.error_description || err) || '').toLowerCase();
    if (m.includes('invalid login')) return 'Неверная почта или пароль.';
    if (m.includes('email not confirmed')) return 'Почта ещё не подтверждена. Открой письмо от LEXI и нажми ссылку.';
    if (m.includes('already registered') || m.includes('already been registered')) return 'Аккаунт с этой почтой уже есть. Попробуй войти или восстановить пароль.';
    if (m.includes('password') && (m.includes('at least') || m.includes('weak') || m.includes('short'))) return 'Пароль слишком простой: нужно минимум 8 символов, лучше с цифрами.';
    if (m.includes('rate limit') || m.includes('too many') || m.includes('security purposes')) return 'Слишком много попыток. Подожди минуту и попробуй снова.';
    if (m.includes('invalid email') || m.includes('unable to validate email')) return 'Проверь адрес электронной почты.';
    if (m.includes('timeout') || m.includes('не отвечает')) return 'Сервер аккаунтов сейчас не отвечает. Игры работают и без входа — прогресс сохранится на этом устройстве. Попробуй войти позже.';
    if (m.includes('failed to fetch') || m.includes('network') || m.includes('load failed') || m.includes('загрузить модуль')) return 'Нет связи с сервером аккаунтов. Проверь интернет и попробуй ещё раз — игры работают и без входа.';
    if (m.includes('same_password') || m.includes('different from the old')) return 'Новый пароль должен отличаться от старого.';
    if (m.includes('not-configured')) return 'Облачные аккаунты пока не подключены.';
    if (m.includes('otp_expired') || m.includes('expired') || m.includes('invalid or has expired')) return 'Ссылка устарела или уже использована. Запроси новую.';
    if (m.includes('signup') && m.includes('disabled')) return 'Регистрация временно закрыта. Попробуй позже.';
    if (m.includes('email address') && m.includes('invalid')) return 'Проверь адрес электронной почты.';
    if (m.includes('user not found')) return 'Аккаунт с этой почтой не найден.';
    return 'Что-то пошло не так. Попробуй ещё раз чуть позже.';
  }

  /* ---------- урок по ссылке (2026-11-04, v6 базы) ----------
   * Ссылка вида index.html#/s/<32 hex>. Токен создаёт и стирает только сервер (lesson_share), открывает урок
   * функция shared_lesson — она отдаёт название, слова и игры, без имени учителя, классов и учеников. */
  const SHARE_RE = /^[0-9a-f]{32}$/;
  function shareUrl(token) {
    if (!SHARE_RE.test(String(token || ''))) return '';
    const u = new URL('index.html', location.href); u.search = ''; u.hash = '/s/' + token; return u.href;
  }
  async function copyText(text) {
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch { /* fall back */ }
    try {
      const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.append(t); t.select(); t.setSelectionRange(0, text.length); const ok = document.execCommand('copy'); t.remove(); return !!ok;
    } catch { return false; }
  }
  /* Блок «Ссылка для учеников» для своего урока учителя. lesson: { id, title, share_token }.
     onChange(token) — после включения/выключения. Сообщение «скопирована» — только если копирование удалось. */
  function sharePanel(sb, lesson, opts = {}) {
    const box = h('section', { class: 'share-box', 'aria-label': 'Ссылка для учеников' });
    let token = lesson.share_token || null, busy = false;
    const status = h('p', { class: 'share-status', role: 'status', 'aria-live': 'polite' });
    const say = (t, kind) => { status.textContent = t || ''; status.className = 'share-status' + (kind ? ' ' + kind : ''); };
    async function toggle(enable) {
      if (busy) return; busy = true; paint(); say(enable ? 'Включаем доступ…' : 'Выключаем доступ…');
      try {
        const { data, error } = await sb.rpc('lesson_share', { l: lesson.id, enable });
        if (error) throw error;
        token = enable ? (SHARE_RE.test(String(data || '')) ? data : null) : null;
        if (enable && !token) throw new Error('no token');
        lesson.share_token = token; busy = false; paint();
        say(enable ? 'Доступ по ссылке включён. Скопируйте ссылку и отправьте ученикам.' : 'Доступ выключен: старая ссылка больше не открывает урок.', 'ok');
        opts.onChange && opts.onChange(token);
      } catch (e) { busy = false; paint(); say(/fetch|network|timeout|не отвечает/i.test(String(e && e.message)) ? 'Нет связи с сервером. Ссылка не изменилась — попробуйте ещё раз.' : 'Не получилось изменить доступ. Обновите страницу и попробуйте ещё раз.', 'err'); console.warn('LEXI share', e); }
    }
    function paint() {
      const head = h('div', { class: 'share-head' }, h('h3', { text: 'Ссылка для учеников' }), h('span', { class: 'share-flag' + (token ? ' on' : ''), text: token ? '● Доступ по ссылке включён' : '○ Доступ по ссылке выключен' }));
      if (!token) {
        box.replaceChildren(head,
          h('p', { class: 'share-text', text: 'Включите доступ — и урок откроется по ссылке на любом телефоне или компьютере, даже без входа в аккаунт.' }),
          h('p', { class: 'share-note', text: 'По ссылке видны только название урока, слова и игры. Ваше имя, классы и ученики не видны. Ссылку сможет открыть любой, кому её перешлют.' }),
          h('div', { class: 'share-actions' }, h('button', { type: 'button', class: opts.btn || 'btn good', disabled: busy, text: '🔗 Открыть доступ по ссылке', onclick: () => toggle(true) })), status);
        return;
      }
      const url = shareUrl(token);
      const field = h('input', { class: 'share-url', type: 'text', readonly: true, value: url, 'aria-label': 'Ссылка на урок', onfocus: e => e.target.select() });
      const copy = h('button', { type: 'button', class: opts.btn || 'btn good', text: 'Скопировать ссылку', onclick: async () => {
        const ok = await copyText(url);
        if (ok) { say('Ссылка скопирована ✓ Вставьте её в сообщение ученикам.', 'ok'); copy.textContent = 'Скопировано ✓'; setTimeout(() => { copy.textContent = 'Скопировать ссылку'; }, 2200); }
        else { field.focus(); field.select(); say('Не получилось скопировать автоматически. Ссылка выделена в поле — скопируйте её вручную.', 'err'); }
      } });
      const send = navigator.share ? h('button', { type: 'button', class: opts.ghost || 'btn secondary', text: 'Отправить…', onclick: () => navigator.share({ title: lesson.title, text: 'Урок LEXI: ' + lesson.title, url }).catch(() => {}) }) : null;
      box.replaceChildren(head,
        h('div', { class: 'share-row' }, field, copy),
        h('div', { class: 'share-actions' }, send, h('a', { class: opts.ghost || 'btn secondary', href: url, target: '_blank', rel: 'noopener', text: 'Проверить, как видят ученики' }),
          h('button', { type: 'button', class: 'share-off', disabled: busy, text: 'Выключить доступ', onclick: () => { if (confirm('Выключить доступ по ссылке? Старая ссылка перестанет открывать урок.')) toggle(false); } })),
        h('p', { class: 'share-note', text: 'Ссылка открывает урок у любого, кто её получит. Если вы измените слова, ученики увидят новую версию при следующем открытии. Ученики не могут менять или удалять урок.' }), status);
    }
    paint();
    return box;
  }

  /* ---------- значок уровня (2026-11-04): одна линейная система для шапки и кабинета ----------
   * Уровни и названия — те же, что в игре (lexi-world.js / levelOf): 🌱 🧭 🔎 🗺️ 📚 ⭐ 🚀 👑 — здесь в виде векторных значков. */
  const LEVEL_ICONS = [
    '<path d="M12 20v-7"/><path d="M12 13c0-4.2 3-6.5 7-6.5 0 4.2-3 6.5-7 6.5Z"/><path d="M12 15.5c0-3.2-2.5-5.4-6-5.4 0 3.2 2.5 5.4 6 5.4Z"/>',
    '<circle cx="12" cy="12" r="8"/><path d="m15.6 8.4-2.1 5.1-5.1 2.1 2.1-5.1 5.1-2.1Z"/>',
    '<circle cx="10.5" cy="10.5" r="5.5"/><path d="m14.8 14.8 4.7 4.7"/>',
    '<path d="M4 6.5 9 4.5l6 2 5-2v13l-5 2-6-2-5 2Z"/><path d="M9 4.5v13M15 6.5v13"/>',
    '<path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15H7.5A2.5 2.5 0 0 0 5 20.5Z"/><path d="M5 20.5A2.5 2.5 0 0 1 7.5 18H19"/><path d="M9 7.5h6"/>',
    '<path d="m12 3.6 2.6 5.3 5.8.9-4.2 4.1 1 5.8L12 17l-5.2 2.7 1-5.8-4.2-4.1 5.8-.9Z"/>',
    '<path d="M12 3c3.4 2 5 5.4 5 9.4L14.5 15h-5L7 12.4C7 8.4 8.6 5 12 3Z"/><circle cx="12" cy="9.6" r="1.6"/><path d="M9.5 15 8.2 19.5l3-1.6M14.5 15l1.3 4.5-3-1.6"/>',
    '<path d="m4 8 4.2 4L12 5.5 15.8 12 20 8l-1.6 10.5H5.6Z"/><path d="M5.6 21h12.8"/>'
  ];
  const TEACHER_ICON = '<path d="m2.5 9.5 9.5-5 9.5 5-9.5 5Z"/><path d="M6.5 11.6v4.4c3.1 2.3 7.9 2.3 11 0v-4.4M21.5 9.5v5"/>';
  function levelBadge(xp, role) {
    const lv = levelOf(xp), i = Math.min(lv.level, LEVEL_ICONS.length) - 1, teacher = role === 'teacher';
    const span = document.createElement('span');
    span.className = 'lvl-badge ' + (teacher ? 'lvl-teacher' : 'lvl-' + (i + 1));
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (teacher ? TEACHER_ICON : LEVEL_ICONS[i]) + '</svg>';
    return { node: span, title: teacher ? 'Учитель' : lv.title, level: lv.level };
  }

  window.LexigoCloud = Object.freeze({ PLAY_EXTRA, assignmentWords, lessonState, knownLocal, knownRow, loadStudentLessons, sortLessons, lessonCard, lessonHref, ruN, configured, client, levelOf, MODES, MODE_HINTS, ASSIGNABLE, modeFit, lessonModes, isSingleWord: isSingle, BADGES, AVATARS, words, isLexical, customWords, customWordId, parseWordList, h, shareUrl, copyText, sharePanel, SHARE_RE, levelBadge, fmtDate, localDay, clientId, authMessage });
})();
