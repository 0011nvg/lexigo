/* LEXI Cloud ↔ игры (2026-11-02). Подключается последним на index.html.
 *  • кнопка «Войти» / аккаунт в шапке;
 *  • единая фиксация результатов: каждый ответ любой игры → событие; по завершении (или выходе)
 *    тренировка отправляется в submit_session. Награды пересчитывает сервер;
 *  • повторная отправка той же тренировки не начисляет XP (client_id), офлайн — очередь;
 *  • при входе прогресс слов из облака объединяется с локальным (вход с другого устройства);
 *  • уроки от учителя и свои уроки учителя — полноценные страницы #/my/... (my-lessons.js); отсюда им
 *    доступны сессия, профиль и «метка» следующей игры (LexigoCloudSession). Тренировка учителя ничего
 *    не отправляет в облако (нет сессий, XP, ТОП-3, статистики класса);
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
      a.append(h('span', { class: 'acct-ava', 'aria-hidden': 'true' }, window.LexiProfileAvatars.content(profile && profile.avatar, C.AVATARS[(profile && profile.avatar) || 'cat'] || '🐱')), name.length > 14 ? name.slice(0, 13) + '…' : name);
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
      if (wb) return { scope: 'book', grade: Number(wb.grade), title: wb.grade + ' класс' + ' · весь учебник' };
      if (typeof book === 'undefined' || !book) return { scope: 'other' };
      const all = unit === '__all';
      const modules = [...new Set(book.sections.map(s => s.module))];
      const key = all ? 'm' + modules.indexOf(mod) : String(unit);
      return { scope: all ? 'module' : 'lesson', grade: Number(book.grade), section_index: all ? null : Number(unit), route: '/lesson/' + book.grade + '/' + key,
        title: book.grade + ' класс' + ' · ' + (all ? mod : (book.sections[Number(unit)] || {}).title || mod) };
    } catch { return { scope: 'other' }; }
  }
  const origStart = start;
  start = function (...args) {
    // «Повторить» на карточке результата задания или своего урока — снова слова этого задания/урока, а не учебника
    const ML = window.LexigoMyLessons;
    if (!nextMeta && !args[1] && ML && ML.owns(game)) return ML.launch(args[0]);
    const meta = nextMeta; nextMeta = null;
    keepUnfinished();
    origStart(...args);
    if (game && !game.cloud) game.cloud = { id: C.clientId(), events: [], meta: meta || metaFromContext(), sent: false };
    if (game && game.cloud && !game.cloud.t0) {
      game.cloud.t0 = performance.now();
      try { const pool = (Array.isArray(args[1]) ? args[1] : selectedWords()).filter(w => typeof isLexicalEntry !== 'function' || isLexicalEntry(w)); game.cloud.poolHash = hashIds(pool.map(w => w.id)); } catch { game.cloud.poolHash = ''; }
    }
  };
  function hashIds(ids) { let h = 0x811c9dc5; for (const id of [...new Set(ids)].sort()) for (const ch of id + '|') { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); }
  /* ТОП-3 board: same game + same lesson/word set + same round size; the final test also needs the same words and task types */
  function boardKey(g) {
    try {
      // «Кристальная экспедиция» — свой рейтинг уровней (crystal_*), общий ТОП-3 ей не нужен
      if (!g || ['cards', 'review', 'mixed', 'crystals'].includes(g.mode) || !/^[a-z]{2,12}$/.test(g.mode)) return null;
      if (g.cloud && g.cloud.meta && g.cloud.meta.preview) return null;
      const m = g.cloud && g.cloud.meta || {};
      let part = null;
      if (m.assignment_id) part = 'a' + String(m.assignment_id).replace(/-/g, '').slice(0, 10);
      else if (m.lesson_id) part = 'c' + String(m.lesson_id).replace(/-/g, '').slice(0, 10);
      else if (m.scope === 'book' && m.grade) part = 'g' + m.grade + 'b';
      else if (m.route) { const r = m.route.match(/^\/lesson\/(\d+)\/(m?)(\d+)$/); if (r) part = 'g' + r[1] + (r[2] ? 'm' : 's') + r[3]; }
      if (!part) return null;
      const n = Math.max(0, g.words.length - (g.retries || 0)); if (!n || n > 999) return null;
      let key = g.mode + '|' + part + '|n' + n;
      if (g.mode === 'boss') key += '|w' + (g.cloud.poolHash || '0').slice(0, 8) + '|t' + [...new Set(g.types || [])].filter(t => /^[a-z]+$/.test(t)).sort().join(',');
      return key.length <= 160 ? key : null;
    } catch { return null; }
  }
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
    try { if (finished) window.LexigoMyLessons?.markDone(g); } catch { /* optimistic only */ }
    if (isPreview(g)) return;   // тренировка учителя: в облако ничего не отправляем
    try { if (g && g.cloud && !g.cloud.sent && g.cloud.events.length) { g.cloud.sent = true; const snapshot = { ...g, cloud: g.cloud }; setTimeout(() => submit(snapshot, !!finished), finished ? 400 : 0); } } catch { /* never break practice */ }
  };

  // rounds left in the middle (back button, another game, closing the tab) are kept as unfinished
  const isPreview = g => !!(g && g.cloud && g.cloud.meta && g.cloud.meta.preview);
  function keepUnfinished() { if (isPreview(game)) return; try { if (game && game.cloud && !game.cloud.sent && game.cloud.events.length) { game.cloud.sent = true; if (Hint.uid()) { writeQueue([...readQueue(), payload(game, false)]); } } } catch { /* never break practice */ } }
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
      events: g.cloud.events, progress: prog, missions: d ? d.done.filter(x => x !== 'chest') : [], chest: !!(d && d.chest), boss_key: bossKey,
      board_key: finished ? boardKey(g) : null, seconds: g.cloud.t0 ? Math.round((performance.now() - g.cloud.t0) / 100) / 10 : null,
      mistakes: g.mode === 'pairs' ? (g.pairMistakes || 0) : g.cloud.events.filter(e => !e.ok && e.k !== 'self').length };
  }
  function readQueue() { try { const x = JSON.parse(localStorage.getItem(QUEUE) || '[]'); return Array.isArray(x) ? x : []; } catch { return []; } }
  function writeQueue(x) { try { localStorage.setItem(QUEUE, JSON.stringify(x.slice(-50))); } catch { /* full */ } }

  function submit(g, finished) {
    if (isPreview(g)) return;
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
          console.warn('LEXI cloud: result rejected', error.message);
        } else { last = data; if (item.board_key && item.finished && data && data.session_id && !data.duplicate) boards.saved(item.client_id, data.session_id, item.board_key); }
        queue = queue.slice(1); writeQueue(queue);
      }
      if (last && window.LexiQuest) window.LexiQuest.syncCloud({ xp: last.xp, streak: last.streak, streakLast: C.localDay() });
      if (last) window.LexigoMyLessons?.dirty();
    } catch (e) { console.warn('LEXI cloud: offline, results kept on this device', e); }
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
    window.dispatchEvent(new CustomEvent('lexigo:progress'));   // главная: «слов в копилке» с учётом облака
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

  /* ---------- ТОП-3 (server leaderboard) ---------- */
  const boards = (() => {
    const pending = new Map();   // client_id → result card waiting for the saved session
    const fmt = (key, r) => key.startsWith('pairs|') ? (r.seconds != null ? Number(r.seconds).toFixed(1).replace('.', ',') + ' с' : '—') + (r.mistakes != null ? ' · ошибок: ' + r.mistakes : '') : (r.accuracy != null ? r.accuracy + '%' : '—') + (r.seconds != null ? ' · ' + Math.round(r.seconds) + ' с' : '');
    const rule = key => key.startsWith('pairs|') ? 'Места: быстрее → меньше ошибок → кто раньше.' : 'Места: больше верных с первой попытки → быстрее → кто раньше.';
    const medal = ['🥇', '🥈', '🥉'];
    async function top(key) { const sb2 = sb || await C.client(); const { data, error } = await sb2.rpc('leaderboard_top', { p_board: key }); if (error) throw error; return data || []; }
    function box(card) { let b = card.querySelector('.lb'); if (!b) { b = h('section', { class: 'lb', 'aria-label': 'ТОП-3 рекордов' }); card.append(b); } return b; }
    function paint(b, key, rows, extra) {
      const list = h('ol', { class: 'lb-list' });
      for (let i = 0; i < 3; i++) { const r = rows[i]; list.append(h('li', { class: (r && r.mine ? 'mine' : '') + (r ? '' : ' empty') }, h('span', { class: 'lb-medal', 'aria-hidden': 'true', text: medal[i] }), h('b', { text: r ? r.name : 'свободно' }), h('span', { class: 'lb-score', text: r ? fmt(key, r) : '' }))); }
      b.replaceChildren(h('div', { class: 'lb-head' }, h('h3', { text: '🏆 ТОП-3 этой игры' }), h('small', { text: rule(key) })), list, extra || '');
    }
    function guestCandidate(g) { const acc = g.cloud.events.filter(e => !e.r && e.k !== 'self'); return { accuracy: acc.length ? Math.round(100 * acc.filter(e => e.ok && !e.h).length / acc.length) : null, seconds: g.cloud.t0 ? (performance.now() - g.cloud.t0) / 1000 : null, mistakes: g.pairMistakes || 0 }; }
    function better(key, a, b) { const k = r => key.startsWith('pairs|') ? [r.seconds ?? 99999, r.mistakes ?? 99999] : [-(r.accuracy ?? -1), r.seconds ?? 99999]; const x = k(a), y = k(b); return x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]); }
    async function showGuest(card, g, key) {
      try { const rows = await top(key); const cand = guestCandidate(g); const would = rows.length < 3 || better(key, cand, rows[rows.length - 1]);
        paint(box(card), key, rows, would ? h('p', { class: 'lb-cta' }, 'Твой результат попал бы в ТОП-3! ', h('a', { href: 'auth.html#signup', text: 'Войди или создай аккаунт' }), ', чтобы записать своё имя в таблицу.') : h('p', { class: 'lb-note', text: 'Рейтинг общий для всех учеников LEXI. Чтобы попасть в него, нужен аккаунт.' }));
      } catch { /* leaderboard is optional */ }
    }
    async function saved(clientId, sessionId, key) {
      const card = pending.get(clientId); pending.delete(clientId);
      if (!card || !card.isConnected) return;
      try {
        const [{ data: pre }, rows] = await Promise.all([sb.rpc('leaderboard_preview', { p_session: sessionId }), top(key)]);
        const b = box(card);
        if (!pre || !pre.qualifies) { paint(b, key, rows, pre && pre.reason === 'own_better' ? h('p', { class: 'lb-note', text: 'Твой лучший результат в этой игре уже в таблице.' }) : ''); return; }
        const input = h('input', { class: 'lb-name', type: 'text', maxlength: 20, minlength: 2, value: (profile && profile.display_name || Hint.name() || '').slice(0, 20), 'aria-label': 'Имя для таблицы рекордов', autocomplete: 'nickname' });
        const msg = h('p', { class: 'lb-msg', role: 'status' });
        const send = h('button', { class: 'btn good', type: 'submit', text: 'Записать' });
        const form = h('form', { class: 'lb-claim' }, h('p', { class: 'lb-congrats', text: 'Поздравляем! Ты вошёл в ТОП-3 — ' + pre.place + '-е место!' }), h('label', { text: 'Введи имя для таблицы рекордов (можно псевдоним):' }), h('div', { class: 'lb-row' }, input, send), msg);
        form.addEventListener('submit', async e => {
          e.preventDefault();
          const name = input.value.trim().replace(/\s+/g, ' ');
          if (!/^[A-Za-zА-Яа-яЁё0-9 ._-]{2,20}$/.test(name)) { msg.textContent = 'Имя: от 2 до 20 символов — буквы, цифры, пробел, точка, дефис.'; input.focus(); return; }
          send.disabled = true;
          const { data, error } = await sb.rpc('leaderboard_claim', { p_session: sessionId, p_name: name });
          if (error || !data || !data.ok) { send.disabled = false; msg.textContent = error ? 'Не получилось сохранить. Попробуй ещё раз.' : 'Пока ты вводил имя, таблица обновилась — место уже занято.'; if (!error) paint(b, key, await top(key)); return; }
          paint(b, key, await top(key), h('p', { class: 'lb-saved', text: '✓ Ты в таблице рекордов! Место: ' + data.place + '.' }));
          toast('Ты в ТОП-3! Место: ' + data.place, 'cheer');
        });
        paint(b, key, rows, form); try { window.LexiQuest?.toast('Новый рекорд! Ты в ТОП-3!', 'cheer'); } catch { /* */ }
      } catch (e) { console.warn('LEXI leaderboard', e); }
    }
    // a finished round with a result card: remember it, or show the board to a guest
    new MutationObserver(() => {
      const card = document.querySelector('#play .lesson-result, #play .pair-finish');
      if (!card || card.dataset.lb || !game || !game.cloud) return;
      const key = boardKey(game); card.dataset.lb = key || '-';
      if (!key || !C.configured) return;
      if (Hint.uid()) pending.set(game.cloud.id, card); else showGuest(card, game, key);
    }).observe(document.getElementById('play') || document.body, { childList: true, subtree: true });
    return { saved };
  })();

  /* ---------- start-up ---------- */
  async function init() {
    headerButton();
    if (!C.configured) { done(null); if (Hint.uid()) { Hint.clear(); location.reload(); } return; }
    const wantsCloud = /^#\/my\/[at]-/.test(location.hash);   // урок по ссылке (#/my/s-…) открывается и без входа
    if (!Hint.uid() && !wantsCloud) {
      // a session may exist from another tab; only then load the library
      try { if (!localStorage.getItem('lexigo-auth')) return done(null); } catch { return done(null); }
    }
    try {
      sb = await C.client();
      const { data: { session } } = await sb.auth.getSession();
      user = session ? session.user : null;
      if (!user) {
        done(null);
        if (Hint.uid()) { Hint.clear(); location.reload(); return; }
        if (wantsCloud) location.href = 'auth.html?next=' + encodeURIComponent((location.pathname.split('/').pop() || 'index.html') + location.search + location.hash);
        return;
      }
      if (Hint.uid() !== user.id) {
        done(null);
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
      await pullProgress().catch(e => console.warn('LEXI cloud: progress not loaded', e));
      flush();
      done({ sb, user, profile });
    } catch (e) { console.warn('LEXI cloud unavailable, guest mode continues', e); done(null); }
  }
  /* готовность облака: { sb, user, profile } или null (гость, нет сети, облако не настроено) */
  let done; const ready = new Promise(r => { done = v => { r(v); done = () => {}; }; });
  window.LexigoCloudSession = Object.freeze({ flush, ready, signedIn: () => !!user, setMeta: m => { nextMeta = m; }, toast,
    /* новая тренировка в той же игре (следующий уровень экспедиции): новая сессия с той же «меткой» */
    restartRound: g => { if (g && g.cloud) g.cloud = { id: C.clientId(), events: [], meta: g.cloud.meta, sent: false, t0: performance.now(), poolHash: g.cloud.poolHash }; } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
