/* LEXIGO Cloud ↔ игры (2026-11-02). Подключается последним на index.html.
 *  • кнопка «Войти» / аккаунт в шапке;
 *  • единая фиксация результатов: каждый ответ любой игры → событие; по завершении (или выходе)
 *    тренировка отправляется в submit_session. Награды пересчитывает сервер;
 *  • повторная отправка той же тренировки не начисляет XP (client_id), офлайн — очередь;
 *  • при входе прогресс слов из облака объединяется с локальным (вход с другого устройства);
 *  • задания учителя: index.html?task=<id>;
 *  • гость: мягкое предложение создать аккаунт после первой завершённой тренировки.
 * Если облако не настроено, работают только кнопка «Войти» и гостевой режим — игры не меняются. */
(() => {
  'use strict';
  const C = window.LexigoCloud, Hint = window.LexigoAccountHint;
  if (!C || !Hint) return;
  const { h } = C;
  const QUEUE = 'lexigo_cloud_queue';
  let sb = null, user = null, profile = null, nextMeta = null;
  const toast = (t, mood) => { try { window.LexiQuest?.toast(t, mood || 'hello'); } catch { /* cosmetic */ } };
  const emit = () => window.dispatchEvent(new CustomEvent('lexigo:account', { detail: { signedIn: !!user, profile } }));

  /* ---------- header button ---------- */
  function headerButton() {
    const nav = document.querySelector('.header-actions'); if (!nav) return;
    let a = document.getElementById('accountButton');
    if (!a) { a = h('a', { id: 'accountButton' }); nav.append(a); }
    a.replaceChildren();
    if (Hint.uid()) {
      a.className = 'acct-btn'; a.href = 'me.html';
      const name = (profile && profile.display_name) || Hint.name() || 'Кабинет';
      a.setAttribute('aria-label', 'Личный кабинет: ' + name);
      a.append(h('span', { class: 'acct-ava', 'aria-hidden': 'true', text: C.AVATARS[(profile && profile.avatar) || 'cat'] || '🐱' }), name.length > 14 ? name.slice(0, 13) + '…' : name);
    } else {
      a.className = 'acct-btn guest'; a.href = 'auth.html'; a.setAttribute('aria-label', 'Войти или создать аккаунт');
      a.append(h('span', { class: 'acct-ico', 'aria-hidden': 'true' }, h('svg', null)), h('span', { class: 'acct-txt', text: 'Войти' }));
      a.querySelector('.acct-ico').innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>';
    }
  }

  /* ---------- result capture (works for every game mode) ---------- */
  function metaFromContext() {
    try {
      const wb = window.LexigoWholeBook && window.LexigoWholeBook.current;
      if (wb) return { scope: 'book', grade: Number(wb.grade), title: 'Spotlight ' + wb.grade + ' · весь учебник' };
      if (typeof book === 'undefined' || !book) return { scope: 'other' };
      const all = unit === '__all';
      const modules = [...new Set(book.sections.map(s => s.module))];
      const key = all ? 'm' + modules.indexOf(mod) : String(unit);
      return { scope: all ? 'module' : 'lesson', grade: Number(book.grade), section_index: all ? null : Number(unit), route: '/lesson/' + book.grade + '/' + key,
        title: 'Spotlight ' + book.grade + ' · ' + (all ? mod : (book.sections[Number(unit)] || {}).title || mod) };
    } catch { return { scope: 'other' }; }
  }
  const origStart = start;
  start = function (...args) {
    const meta = nextMeta; nextMeta = null;
    keepUnfinished();
    origStart(...args);
    if (game && !game.cloud) game.cloud = { id: C.clientId(), events: [], meta: meta || metaFromContext(), sent: false };
  };
  const origRecord = record;
  record = function (w, ok, skill = 'recognition') {
    origRecord(w, ok, skill);
    try {
      if (!game || !w || !w.id) return;
      if (!game.cloud) game.cloud = { id: C.clientId(), events: [], meta: metaFromContext(), sent: false };
      if (game.cloud.events.length >= 600) return;
      const ev = { w: String(w.id).slice(0, 60), ok: !!ok, k: skill };
      if (game.hinted) ev.h = true;
      if (game.retryActive) ev.r = true;
      if (game.activeQuestionMode) ev.m = game.activeQuestionMode;
      game.cloud.events.push(ev);
    } catch { /* never break practice */ }
  };
  const origSave = saveLearningAttempt;
  saveLearningAttempt = function (g, finished) {
    origSave(g, finished);
    try { if (finished && task && g && g.cloud && g.cloud.meta && g.cloud.meta.assignment_id === task.a.id) task.done.add(g.mode); } catch { /* optimistic only */ }
    try { if (g && g.cloud && !g.cloud.sent && g.cloud.events.length) { g.cloud.sent = true; const snapshot = g; setTimeout(() => submit(snapshot, !!finished), finished ? 400 : 0); } } catch { /* never break practice */ }
  };

  // rounds left in the middle (back button, another game, closing the tab) are kept as unfinished
  function keepUnfinished() { try { if (game && game.cloud && !game.cloud.sent && game.cloud.events.length) { game.cloud.sent = true; if (Hint.uid()) { writeQueue([...readQueue(), payload(game, false)]); } } } catch { /* never break practice */ } }
  const origStop = stop;
  stop = function (...args) { keepUnfinished(); flush(); return origStop.apply(this, args); };
  window.addEventListener('pagehide', keepUnfinished);

  function payload(g, finished) {
    const meta = g.cloud.meta || {};
    const q = window.LexiQuest ? window.LexiQuest.state() : null, today = C.localDay(), d = q && q.days ? q.days[today] : null;
    const prog = {};
    for (const e of g.cloud.events) { const p = typeof progress !== 'undefined' ? progress[e.w] : null; if (p && Number.isFinite(p.due)) prog[e.w] = { due: p.due }; }
    let bossKey = null; try { if (g.mode === 'boss' && typeof book !== 'undefined' && book) bossKey = book.grade + ':' + mod; } catch { bossKey = null; }
    return { client_id: g.cloud.id, mode: g.mode, finished, day: today, scope: meta.scope || 'other', grade: meta.grade ?? null, section_index: meta.section_index ?? null,
      route: meta.route || null, title: meta.title || null, assignment_id: meta.assignment_id || null, lesson_id: meta.lesson_id || null,
      events: g.cloud.events, progress: prog, missions: d ? d.done.filter(x => x !== 'chest') : [], chest: !!(d && d.chest), boss_key: bossKey };
  }
  function readQueue() { try { const x = JSON.parse(localStorage.getItem(QUEUE) || '[]'); return Array.isArray(x) ? x : []; } catch { return []; } }
  function writeQueue(x) { try { localStorage.setItem(QUEUE, JSON.stringify(x.slice(-50))); } catch { /* full */ } }

  function submit(g, finished) {
    if (!Hint.uid()) { if (finished) nudge(); return; }
    const p = payload(g, finished);
    writeQueue([...readQueue(), p]);
    flush();
  }
  let flushing = false;
  async function flush() {
    if (flushing || !sb || !user) return; flushing = true;
    try {
      let queue = readQueue(), last = null;
      while (queue.length) {
        const item = queue[0];
        const { data, error } = await sb.rpc('submit_session', { p: item });
        if (error) {
          if (/fetch|network|timeout/i.test(error.message || '') || error.code === '54000') break;   // keep for later
          console.warn('LEXIGO cloud: result rejected', error.message);
        } else last = data;
        queue = queue.slice(1); writeQueue(queue);
      }
      if (last && window.LexiQuest) window.LexiQuest.syncCloud({ xp: last.xp, streak: last.streak, streakLast: C.localDay() });
      if (last && last.assignment_id) refreshTaskPanel();
    } catch (e) { console.warn('LEXIGO cloud: offline, results kept on this device', e); }
    finally { flushing = false; }
  }
  window.addEventListener('online', flush);

  /* ---------- pull cloud progress into this device ---------- */
  async function pullProgress() {
    const rows = [];
    for (let page = 0; page < 12; page++) {
      const { data, error } = await sb.from('word_progress').select('word_id,right_count,wrong_count,recall_count,streak,last_at,due_at').eq('user_id', user.id).range(page * 1000, page * 1000 + 999);
      if (error) throw error; rows.push(...data); if (data.length < 1000) break;
    }
    if (typeof progress === 'undefined' || !rows.length) return;
    for (const r of rows) {
      const local = progress[r.word_id] || { right: 0, wrong: 0 };
      const cloudLast = r.last_at ? Date.parse(r.last_at) : 0, localLast = Number(local.last) || 0;
      const merged = Object.assign({}, local, {
        right: Math.max(Number(local.right) || 0, r.right_count), wrong: Math.max(Number(local.wrong) || 0, r.wrong_count),
        recall: Math.max(Number(local.recall) || 0, r.recall_count)
      });
      if (cloudLast > localLast) { merged.last = cloudLast; merged.streak = r.streak; if (r.due_at) merged.due = Date.parse(r.due_at); }
      progress[r.word_id] = merged;
    }
    try { save(); updateStats(); } catch { /* lesson view not ready */ }
  }

  /* ---------- soft sign-up prompt for guests ---------- */
  function nudge() {
    if (!C.configured || Hint.uid()) return;
    try { if (localStorage.getItem('lexigo_signup_nudge')) return; localStorage.setItem('lexigo_signup_nudge', '1'); } catch { return; }
    setTimeout(() => {
      const host = document.querySelector('#play .lesson-result, #play .pair-finish'); if (!host) return;
      const box = h('div', { class: 'signup-nudge', role: 'note' },
        h('p', null, 'Хочешь, чтобы Лекси запомнил твои успехи на любом устройстве и ты получал задания от учителя? ', h('a', { href: 'auth.html#signup', text: 'Создай аккаунт →' })),
        h('button', { type: 'button', 'aria-label': 'Скрыть', text: '×', onclick: () => box.remove() }));
      host.append(box);
    }, 600);
  }

  /* ---------- teacher assignments: index.html?task=<id> ---------- */
  let task = null, panel = null;
  async function loadTask(id) {
    const { data: a, error } = await sb.from('assignments').select('*').eq('id', id).maybeSingle();
    if (error || !a) { toast('Задание не найдено или больше недоступно.', 'think'); return; }
    let words = [], lesson = null;
    if (a.lesson_id) {
      const { data: l } = await sb.from('custom_lessons').select('id,title,words').eq('id', a.lesson_id).maybeSingle();
      if (!l) { toast('Урок учителя недоступен.', 'think'); return; }
      lesson = l; words = C.customWords(l);
    } else {
      const b = DB.books.find(x => Number(x.grade) === Number(a.grade)); if (!b) return;
      for (const i of a.section_indexes || []) if (b.sections[i]) words.push(...b.sections[i].words);
      if (a.word_ids && a.word_ids.length) { const keep = new Set(a.word_ids); words = words.filter(w => keep.has(w.id)); }
    }
    words = words.filter(w => typeof isLexicalEntry !== 'function' || isLexicalEntry(w));
    const seen = new Set(); words = words.filter(w => !seen.has(w.id) && seen.add(w.id));
    const { data: sess } = await sb.from('sessions').select('mode,finished,accuracy').eq('assignment_id', a.id).eq('user_id', user.id);
    task = { a, lesson, words, done: new Set((sess || []).filter(s => s.finished).map(s => s.mode)) };
    showTaskPanel();
  }
  async function refreshTaskPanel() {
    if (!task) return;
    const { data: sess } = await sb.from('sessions').select('mode,finished').eq('assignment_id', task.a.id).eq('user_id', user.id);
    for (const s of sess || []) if (s.finished) task.done.add(s.mode);
  }
  function showTaskPanel() {
    if (!task) return;
    panel?.remove();
    const { a, words, done } = task;
    const list = h('div', { class: 'task-modes' });
    for (const m of a.modes) list.append(h('button', { type: 'button', class: 'task-mode' + (done.has(m) ? ' done' : ''), onclick: () => launch(m) },
      h('b', { text: C.MODES[m] || m }), h('span', { text: done.has(m) ? '✓ выполнено · можно ещё раз' : 'Начать →' })));
    const all = a.modes.every(m => done.has(m));
    panel = h('div', { class: 'task-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'taskTitle' },
      h('div', { class: 'task-card' },
        h('div', { class: 'task-head' }, window.LexiQuest ? window.LexiQuest.avatar(all ? 'cheer' : 'hello', 'm') : '', h('div', null,
          h('p', { class: 'eyebrow', text: 'ЗАДАНИЕ ОТ УЧИТЕЛЯ' }), h('h2', { id: 'taskTitle', text: a.title }),
          h('p', { class: 'task-meta', text: words.length + ' слов' + (a.due_at ? ' · срок: ' + C.fmtDate(a.due_at, true) : '') }))),
        a.comment ? h('p', { class: 'task-comment', text: '«' + a.comment + '»' }) : null,
        all ? h('p', { class: 'task-done', text: 'Все игры задания выполнены! Учитель увидит результат.' }) : h('p', { class: 'task-hint', text: 'Пройди каждую игру до конца — результат сохранится автоматически.' }),
        list,
        h('div', { class: 'task-actions' }, h('a', { class: 'btn secondary', href: 'me.html', text: 'В кабинет' }), h('button', { type: 'button', class: 'btn secondary', text: 'Закрыть', onclick: () => { panel.remove(); panel = null; } }))));
    document.body.append(panel);
    panel.querySelector('.task-mode')?.focus();
  }
  function launch(mode) {
    const { a, lesson, words } = task;
    let ws = words.slice();
    const single = w => /^[a-zA-Z]+(?:[-'’‘][a-zA-Z]+)*$/.test(String(w.en).trim());
    if (mode === 'boss' || mode === 'crystals') ws = ws.filter(single);
    if (mode === 'audio' && typeof audioAvailable === 'function' && !audioAvailable()) { toast('В этом браузере нет озвучки. Выбери другую игру.', 'think'); return; }
    if (ws.length < (mode === 'boss' ? 3 : ['quiz', 'truefalse', 'pairs', 'listen'].includes(mode) ? 2 : 1)) { toast('Для этой игры в задании мало подходящих слов. Выбери другую.', 'think'); return; }
    if (!lesson && a.section_indexes && a.section_indexes.length) {
      try { const b = DB.books.find(x => Number(x.grade) === Number(a.grade)), s = b.sections[a.section_indexes[0]];
        document.getElementById('book').value = String(a.grade); changeBook(); document.getElementById('module').value = s.module; changeModule(); document.getElementById('unit').value = String(a.section_indexes[0]); changeUnit(); } catch { /* keep current context */ }
    }
    const size = { pairs: 10, cards: 20, boss: 15 }[mode] || 15;
    const picked = typeof lexiRound === 'function' ? lexiRound(ws, size) : ws.slice(0, size);
    const types = { mixed: ['quiz', 'spell', 'truefalse', 'spell', 'fix'], boss: ['spell', 'quiz', 'spell', 'truefalse'], crystals: ['quiz', 'truefalse', 'fix'] }[mode];
    nextMeta = { scope: 'assignment', assignment_id: a.id, lesson_id: a.lesson_id || null, grade: a.grade || null, section_index: a.section_indexes ? a.section_indexes[0] : null, title: a.title };
    panel?.remove(); panel = null;
    start(mode, picked, types);
    if (game) { const note = h('p', { id: 'cloudTaskBanner', class: 'task-banner' }, '📌 Задание: ' + a.title + ' · ', h('button', { type: 'button', text: 'к списку игр', onclick: () => { try { stop(); } catch { /* */ } showTaskPanel(); } })); document.getElementById('game')?.prepend(note); }
  }
  // after a finished assignment round: offer to go back to the task list
  new MutationObserver(() => {
    const card = document.querySelector('#play .lesson-result, #play .pair-finish');
    if (!card || card.dataset.cloudTask || !task || !game || !game.cloud || !game.cloud.meta || game.cloud.meta.assignment_id !== task.a.id) return;
    card.dataset.cloudTask = '1';
    card.append(h('div', { class: 'task-return' }, h('button', { type: 'button', class: 'btn good', text: 'Вернуться к заданию', onclick: async () => { await refreshTaskPanel(); try { stop(); } catch { /* */ } showTaskPanel(); } })));
  }).observe(document.getElementById('play') || document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', () => document.getElementById('cloudTaskBanner')?.remove());

  /* ---------- start-up ---------- */
  async function init() {
    headerButton();
    if (!C.configured) { if (Hint.uid()) { Hint.clear(); location.reload(); } return; }
    if (!Hint.uid() && !new URLSearchParams(location.search).get('task')) {
      // a session may exist from another tab; only then load the library
      try { if (!localStorage.getItem('lexigo-auth')) return; } catch { return; }
    }
    try {
      sb = await C.client();
      const { data: { session } } = await sb.auth.getSession();
      user = session ? session.user : null;
      if (!user) {
        if (Hint.uid()) { Hint.clear(); location.reload(); return; }
        if (new URLSearchParams(location.search).get('task')) location.href = 'auth.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search);
        return;
      }
      if (Hint.uid() !== user.id) {
        if (sessionStorage.getItem('lexigo_reloaded') === user.id) return;
        sessionStorage.setItem('lexigo_reloaded', user.id);
        const { data: p } = await sb.from('profiles').select('display_name,role').eq('id', user.id).maybeSingle();
        Hint.set({ uid: user.id, name: p ? p.display_name : '', role: p ? p.role : 'student' }); location.reload(); return;
      }
      const [{ data: p }, { data: st }, { data: last }] = await Promise.all([
        sb.from('profiles').select('display_name,avatar,role').eq('id', user.id).maybeSingle(),
        sb.from('user_stats').select('xp,streak_count,streak_best,streak_last').eq('user_id', user.id).maybeSingle(),
        sb.from('sessions').select('route').eq('user_id', user.id).not('route', 'is', null).order('created_at', { ascending: false }).limit(1)
      ]);
      profile = p || null;
      if (p && p.display_name !== Hint.name()) Hint.set({ uid: user.id, name: p.display_name, role: p.role });
      headerButton(); emit();
      if (st && window.LexiQuest) window.LexiQuest.syncCloud({ xp: st.xp, streak: st.streak_last && (C.localDay() === st.streak_last || C.localDay(new Date(Date.now() - 864e5)) === st.streak_last) ? st.streak_count : 0, best: st.streak_best, streakLast: st.streak_last || '', lastLesson: last && last[0] ? last[0].route : '' });
      await pullProgress().catch(e => console.warn('LEXIGO cloud: progress not loaded', e));
      flush();
      const taskId = new URLSearchParams(location.search).get('task');
      if (taskId && /^[0-9a-f-]{36}$/i.test(taskId)) await loadTask(taskId);
    } catch (e) { console.warn('LEXIGO cloud unavailable, guest mode continues', e); }
  }
  window.LexigoCloudSession = Object.freeze({ flush, signedIn: () => !!user, showTask: () => showTaskPanel() });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
