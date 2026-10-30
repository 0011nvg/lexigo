/* LEXIGO World — game layer over the existing practice engine (2026-10-30).
 * Lexi the cat (guide + reactions), XP & levels, daily missions, streaks, badges,
 * lesson stars, module boss, "why is it wrong" explanations, calm mode, board mode.
 * Device-only motivation: nothing here changes vocabulary data or verified results.
 * XP is earned only for real correct answers and is capped per word per day. */
(() => {
  'use strict';
  const QUEST_KEY = 'lexigo_quest_v1', PREFS_KEY = 'lexigo_prefs_v1';
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = String(text); return n; };
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const today = (t = Date.now()) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const dayDiff = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 86400000);
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const allWords = () => DB.books.flatMap(b => b.sections.flatMap(s => s.words));

  /* ---------- safe storage ---------- */
  function readJSON(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v && typeof v === 'object' && !Array.isArray(v) ? v : fallback; } catch { return fallback; }
  }
  function writeJSON(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
  const num = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  function loadQuest() {
    const q = readJSON(QUEST_KEY, {});
    const clean = { v: 1, xp: num(q.xp), days: {}, streak: { last: '', count: 0, best: 0 }, badges: {}, bosses: {}, lastLesson: '', missionsTotal: num(q.missionsTotal), perfectGames: num(q.perfectGames) };
    if (q.streak && typeof q.streak === 'object') clean.streak = { last: typeof q.streak.last === 'string' ? q.streak.last.slice(0, 10) : '', count: num(q.streak.count), best: num(q.streak.best) };
    if (q.badges && typeof q.badges === 'object') for (const [k, v] of Object.entries(q.badges)) if (/^[a-z0-9_-]{1,40}$/.test(k)) clean.badges[k] = num(v);
    if (q.bosses && typeof q.bosses === 'object') for (const [k, v] of Object.entries(q.bosses)) if (k.length < 120) clean.bosses[k] = num(v);
    if (typeof q.lastLesson === 'string' && /^\/lesson\/\d+\/(m?\d+)$/.test(q.lastLesson)) clean.lastLesson = q.lastLesson;
    if (q.days && typeof q.days === 'object') {
      const keys = Object.keys(q.days).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort().slice(-14);
      for (const k of keys) {
        const d = q.days[k] || {};
        const c = d.counters && typeof d.counters === 'object' ? d.counters : {};
        clean.days[k] = { xp: num(d.xp), words: {}, counters: {}, done: Array.isArray(d.done) ? d.done.filter(x => typeof x === 'string').slice(0, 10) : [], chest: !!d.chest, modes: Array.isArray(d.modes) ? d.modes.filter(x => typeof x === 'string').slice(0, 30) : [] };
        for (const [ck, cv] of Object.entries(c)) if (/^[a-z]{2,12}$/.test(ck)) clean.days[k].counters[ck] = num(cv);
        if (d.words && typeof d.words === 'object') for (const [wk, wv] of Object.entries(d.words).slice(0, 3000)) if (wk.length < 60) clean.days[k].words[wk] = num(wv);
      }
    }
    return clean;
  }
  let quest = loadQuest();
  const saveQuest = () => writeJSON(QUEST_KEY, quest);
  function day(k = today()) { return quest.days[k] || (quest.days[k] = { xp: 0, words: {}, counters: {}, done: [], chest: false, modes: [] }); }
  const prefs = Object.assign({ calm: 'auto', board: false }, readJSON(PREFS_KEY, {}));
  const savePrefs = () => writeJSON(PREFS_KEY, { calm: ['auto', 'on', 'off'].includes(prefs.calm) ? prefs.calm : 'auto', board: !!prefs.board });

  /* ---------- levels ---------- */
  const TITLES = ['Новичок', 'Путешественник', 'Следопыт', 'Исследователь', 'Знаток слов', 'Мастер слов', 'Капитан LEXIGO', 'Легенда LEXIGO'];
  const levelStart = l => 50 * l * (l - 1); // 1:0 2:100 3:300 4:600 5:1000 ...
  function levelOf(xp) { let l = 1; while (xp >= levelStart(l + 1)) l++; return { level: l, title: TITLES[Math.min(l - 1, TITLES.length - 1)], from: levelStart(l), to: levelStart(l + 1), xp }; }

  /* ---------- daily missions ---------- */
  const MISSIONS = {
    newwords: { text: 'Познакомься с 8 новыми словами', goal: 8, counter: 'newwords', icon: 'spark' },
    recall: { text: 'Напиши 10 слов по памяти', goal: 10, counter: 'recall', icon: 'pen' },
    fixed: { text: 'Исправь 5 своих ошибок', goal: 5, counter: 'fixed', icon: 'bolt' },
    due: { text: 'Повтори 6 слов, которые пора повторить', goal: 6, counter: 'due', icon: 'clock' },
    listen: { text: 'Узнай 6 слов на слух', goal: 6, counter: 'listen', icon: 'ear' },
    perfect: { text: 'Пройди раунд без единой ошибки', goal: 1, counter: 'perfect', icon: 'star' },
    variety: { text: 'Сыграй в 2 разных режима', goal: 2, counter: 'variety', icon: 'dice' }
  };
  function seeded(k) { let h = 0; for (const c of k) h = (h * 31 + c.charCodeAt(0)) >>> 0; return () => ((h = (h * 1103515245 + 12345) >>> 0) / 4294967296); }
  function missionsFor(k = today()) {
    const r = seeded(k), hasPractice = Object.keys(progress || {}).length > 0;
    const a = ['newwords', 'recall'], b = hasPractice ? ['fixed', 'due', 'listen'] : ['listen', 'newwords'], c = ['perfect', 'variety'];
    const first = a[Math.floor(r() * a.length)];
    let second = b[Math.floor(r() * b.length)]; if (second === first) second = 'listen';
    return [first, second, c[Math.floor(r() * c.length)]];
  }
  function missionState(k = today()) {
    const d = day(k);
    return missionsFor(k).map(id => { const m = MISSIONS[id]; const value = Math.min(num(d.counters[m.counter]), m.goal); return { id, ...m, value, done: value >= m.goal }; });
  }
  function bump(counter, by = 1) {
    const d = day(); const before = missionState();
    d.counters[counter] = num(d.counters[counter]) + by;
    const after = missionState(); const news = [];
    after.forEach((m, i) => { if (m.done && !before[i].done && !d.done.includes(m.id)) { d.done.push(m.id); quest.missionsTotal++; addXP(25); news.push(m); } });
    if (after.every(m => m.done) && !d.chest) { d.chest = true; addXP(40); news.push({ id: 'chest', text: 'Сундук дня открыт!' }); }
    saveQuest();
    news.forEach(m => toast(m.id === 'chest' ? 'Все миссии дня выполнены! Сундук открыт: +40 XP' : 'Миссия выполнена: ' + m.text + ' · +25 XP', 'cheer'));
    refreshChrome();
  }
  function addXP(n) {
    const before = levelOf(quest.xp).level; quest.xp += n; day().xp += n;
    const after = levelOf(quest.xp);
    if (after.level > before) setTimeout(() => toast('Новый уровень ' + after.level + ': ' + after.title + '!', 'cheer'), 400);
  }

  /* ---------- badges ---------- */
  const BADGES = [
    ['streak3', 'Три дня подряд', 'Занимайся 3 дня подряд', () => quest.streak.best >= 3],
    ['streak7', 'Неделя слов', 'Занимайся 7 дней подряд', () => quest.streak.best >= 7],
    ['perfect', 'Без единой ошибки', 'Пройди раунд из 5+ слов без ошибок', () => quest.perfectGames >= 1],
    ['missions', 'Охотник за миссиями', 'Выполни 10 ежедневных миссий', () => quest.missionsTotal >= 10],
    ['boss', 'Победитель стража', 'Пройди финальный тест модуля', () => Object.keys(quest.bosses).length >= 1],
    ['boss5', 'Покоритель модулей', 'Пройди финальные тесты 5 модулей', () => Object.keys(quest.bosses).length >= 5],
    ['level5', 'Знаток слов', 'Достигни 5 уровня', () => levelOf(quest.xp).level >= 5]
  ];
  function checkBadges() {
    let changed = false;
    for (const [id, name] of BADGES) if (!quest.badges[id] && BADGES.find(b => b[0] === id)[3]()) { quest.badges[id] = Date.now(); changed = true; setTimeout(() => toast('Новое достижение: ' + name, 'cheer'), 700); }
    if (changed) saveQuest();
  }

  /* ---------- calm & board modes ---------- */
  function currentGrade() { return Number((typeof book !== 'undefined' && book && book.grade) || 2); }
  function isCalm() { return prefs.calm === 'on' || (prefs.calm === 'auto' && currentGrade() >= 7); }
  function applyModes() {
    document.body.classList.toggle('calm', isCalm());
    document.body.classList.toggle('board', !!prefs.board);
    const t = $('calmToggle');
    if (t) { t.setAttribute('aria-pressed', String(isCalm())); t.querySelector('span').textContent = isCalm() ? 'Спокойный' : 'Игровой'; t.title = isCalm() ? 'Спокойный режим: меньше анимаций и реплик. Нажми, чтобы включить игровой.' : 'Игровой режим: Лекси комментирует, есть эффекты. Нажми, чтобы включить спокойный.'; }
    const b = $('boardToggle'); if (b) b.checked = !!prefs.board;
  }

  /* ---------- Lexi: avatar, bubble, toast ---------- */
  const HEAD = 'assets/lexi-head.webp';
  function avatar(mood = 'hello', size = 'm') { const w = el('span', 'lexi-avatar lexi-' + size + ' mood-' + mood); const img = el('img'); img.src = HEAD; img.alt = ''; img.width = 96; img.height = 96; img.decoding = 'async'; w.append(img); w.setAttribute('aria-hidden', 'true'); return w; }
  let toastHost = null;
  function toast(text, mood = 'hello') {
    if (!toastHost) { toastHost = el('div', 'lexi-toasts'); toastHost.setAttribute('role', 'status'); toastHost.setAttribute('aria-live', 'polite'); document.body.append(toastHost); }
    const t = el('div', 'lexi-toast'); t.append(avatar(mood, 's'), el('p', null, text));
    toastHost.append(t); while (toastHost.children.length > 3) toastHost.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 3600);
  }
  const LINES = {
    ok: ['Верно!', 'Отлично!', 'Так держать!', 'Yes! Правильно!', 'Супер!', 'В точку!'],
    okRecall: ['Ты вспомнил сам — это сильнее всего!', 'По памяти — вот это да!', 'Слово твоё. Отлично!'],
    miss: ['Ничего, разберёмся.', 'Ошибка — это шаг к знанию.', 'Почти! Посмотри разбор.', 'Это слово вернётся ещё раз.'],
    hint: ['Подсказка — это нормально. Закрепим ещё раз.', 'С подсказкой тоже учимся!'],
    start: { cards: 'Переворачивай и вспоминай.', quiz: 'Выбирай перевод. Не спеши.', truefalse: 'Верно или нет? Смотри внимательно.', spell: 'Пиши по памяти. Есть подсказка 💡', fix: 'Найди ошибку в слове.', audio: 'Слушай и пиши. Можно слушать снова.', listen: 'Слушай и выбирай слово.', builder: 'Собирай по порядку.', pairs: 'Соединяй пары как можно быстрее!', crystals: 'Собери кристаллы — и отвечай на слова.', boss: 'Страж модуля ждёт. Без подсказок!', mixed: 'Тренировка дня: всего понемногу.', review: 'Работаем над ошибками. Ты справишься!' }
  };
  const CALM_LINES = { ok: ['Верно.'], okRecall: ['Верно, по памяти.'], miss: ['Посмотри разбор.'], hint: ['Ответ с подсказкой.'] };
  function coach() {
    let c = $('lexiCoach');
    if (!c) { c = el('div', 'lexi-coach'); c.id = 'lexiCoach'; c.append(avatar('hello', 'm'), el('p', 'lexi-bubble')); c.querySelector('.lexi-bubble').setAttribute('aria-live', 'polite'); $('game').querySelector('.toprow')?.after(c); }
    return c;
  }
  function say(text, mood) {
    const c = coach(); const av = c.querySelector('.lexi-avatar'); av.className = 'lexi-avatar lexi-m mood-' + mood;
    void av.offsetWidth; av.classList.add('react');
    c.querySelector('.lexi-bubble').textContent = text;
  }

  /* ---------- XP & mission counters from real answers ---------- */
  const origRecord = record;
  record = function (w, ok, skill = 'recognition') {
    const before = w && progress[w.id] ? { ...progress[w.id] } : null;
    origRecord(w, ok, skill);
    try {
      if (!w || skill === 'self' || !ok) return;
      const d = day(), seen = num(d.words[w.id]);
      if (seen < 2) { d.words[w.id] = seen + 1; const gain = skill === 'recall' ? 4 : 2; addXP(gain); if (game) { game.lexiXP = (game.lexiXP || 0) + gain; game.lexiPending = gain; } }
      if (!before || !(num(before.right) + num(before.wrong))) bump('newwords');
      if (skill === 'recall') bump('recall');
      if (before && num(before.wrong) > 0 && !num(before.streak)) bump('fixed');
      else if (game?.retryActive) bump('fixed');
      if (before?.last && before.due && before.due <= Date.now()) bump('due');
      if (['audio', 'listen'].includes(game?.activeQuestionMode)) bump('listen');
      saveQuest();
    } catch { /* motivation layer must never break practice */ }
  };
  function floatXP(n) {
    if (isCalm() || reduced() || prefs.board) return;
    const host = document.querySelector('#play .feedback') || $('counter'); if (!host) return;
    const f = el('span', 'xp-float', '+' + n + ' XP'); host.append(f); setTimeout(() => f.remove(), 1200);
  }

  /* ---------- reactions & "why is it wrong" ---------- */
  let lastPick = null;
  document.addEventListener('click', e => { const b = e.target.closest?.('#play .options button, #play .buttons button'); if (b) lastPick = b.textContent.trim(); }, true);
  function diffHTML(answer, right) {
    const a = [...answer], b = [...right]; const m = a.length, n = b.length; const L = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i][j] = a[i].toLowerCase() === b[j].toLowerCase() ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0, j = 0; const yours = [], ok = [];
    while (i < m && j < n) { if (a[i].toLowerCase() === b[j].toLowerCase()) { yours.push([a[i], 0]); ok.push([b[j], 0]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) { yours.push([a[i], 1]); i++; } else { ok.push([b[j], 1]); j++; } }
    while (i < m) yours.push([a[i++], 1]); while (j < n) ok.push([b[j++], 1]);
    const paint = (list, cls) => list.map(([c, bad]) => bad ? '<mark class="' + cls + '">' + escapeHTML(c === ' ' ? '␣' : c) + '</mark>' : escapeHTML(c)).join('');
    return { yours: paint(yours, 'diff-extra'), right: paint(ok, 'diff-miss'), dist: yours.filter(x => x[1]).length + ok.filter(x => x[1]).length };
  }
  function explain(detail) {
    const { word: w, mode, feedback } = detail; if (!feedback || detail.correct) return;
    const box = el('div', 'why'); const title = el('strong', null, 'Почему неверно?'); box.append(title);
    const input = document.querySelector('#play .answerbox input');
    if (['spell', 'audio', 'fix', 'boss'].includes(mode) && input && input.value.trim()) {
      const d = diffHTML(input.value.trim(), String(w.en));
      const p = el('p'); p.innerHTML = 'Твой ответ: <span class="diff">' + d.yours + '</span><br>Правильно: <span class="diff">' + d.right + '</span>'; box.append(p);
      const sorted = s => [...s.toLowerCase().replace(/[^a-z]/g, '')].sort().join('');
      box.append(el('p', 'why-tip', d.dist <= 2 ? 'Ошибка всего в одной-двух буквах — проверь выделенные места.' : sorted(input.value) === sorted(w.en) ? 'Буквы верные, но порядок другой. Произнеси слово по слогам.' : 'Посмотри на слово, произнеси его вслух и напиши ещё раз — оно вернётся в этой тренировке.'));
    } else if (mode === 'quiz' && lastPick) {
      const other = (game?.words || []).find(x => normalize(x.ru) === normalize(lastPick)) || (book?.sections || []).flatMap(s => s.words).find(x => normalize(x.ru) === normalize(lastPick));
      box.append(el('p', null, other ? 'Ты выбрал «' + lastPick + '» — так переводится «' + other.en + '».' : 'Ты выбрал «' + lastPick + '».'), el('p', 'why-tip', '«' + w.en + '» — это «' + w.ru + '». Скажи пару вслух.'));
    } else if (mode === 'listen' && lastPick) {
      box.append(el('p', null, 'Ты выбрал «' + lastPick + '», а прозвучало «' + w.en + '».'));
      const again = el('button', 'btn secondary', '🔊 Послушать ещё раз'); again.type = 'button'; again.onclick = () => speak(w.en); box.append(again);
    } else if (mode === 'truefalse') {
      box.append(el('p', null, 'Правильная пара: «' + w.en + '» — «' + w.ru + '».'), el('p', 'why-tip', 'Сравни перевод на экране с правильным.'));
    } else if (mode === 'builder') {
      box.append(el('p', null, 'Правильный порядок: «' + w.en + '».'), el('p', 'why-tip', 'Собери ещё раз в голове: сначала первое слово или первая буква.'));
    } else if (mode === 'letterfix') {
      box.append(el('p', null, 'Правильно пишется: «' + w.en + '».'));
    } else return;
    const tip = feedback.querySelector('.learning-tip');
    if (tip) tip.before(box); else feedback.append(box);
  }
  function markChoices(d) {
    const right = d.mode === 'listen' ? d.word.en : d.mode === 'quiz' ? d.word.ru : null;
    document.querySelectorAll('#play .options button, #play .buttons button').forEach(b => {
      const t = b.textContent.trim();
      if (right != null && normalize(t) === normalize(right)) b.classList.add('is-correct');
      if (lastPick != null && t === lastPick) b.classList.add(d.correct ? 'is-correct' : 'is-wrong');
    });
  }
  document.addEventListener('pointerdown', () => {}, { passive: true });
  document.addEventListener('lexigo:answer', e => {
    const d = e.detail || {}; if (!d.word) return;
    const lines = isCalm() ? CALM_LINES : LINES;
    initGame();
    if (d.correct) { say(pick(d.skill === 'recall' ? lines.okRecall : lines.ok), 'happy'); burst(); if (game?.lexiPending) { floatXP(game.lexiPending); game.lexiPending = 0; } }
    else if (d.hinted) say(pick(lines.hint), 'think');
    else say(pick(lines.miss), 'oops');
    markChoices(d);
    explain(d);
    if (game?.mode === 'boss') bossHUD(d);
    if (!d.correct && d.feedback?.scrollIntoView) setTimeout(() => d.feedback.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' }), 30);
  });
  function burst() {
    if (isCalm() || reduced() || prefs.board) return;
    const host = document.querySelector('#play .feedback'); if (!host) return;
    const b = el('span', 'burst'); b.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 10; i++) { const s = el('i'); s.style.setProperty('--a', (i * 36) + 'deg'); b.append(s); }
    host.append(b); setTimeout(() => b.remove(), 900);
  }

  /* ---------- module boss HUD ---------- */
  function bossHUD(answer) {
    if (!game || game.mode !== 'boss') return;
    let hud = $('bossHud');
    if (!hud) { hud = el('div', 'boss-hud'); hud.id = 'bossHud'; hud.innerHTML = '<span class="boss-face" aria-hidden="true">🛡️</span><div><b>Страж модуля</b><div class="boss-hp"><i></i></div></div><span class="boss-count"></span>'; $('game').querySelector('.progress')?.before(hud); }
    const initial = Math.max(1, game.words.length - (game.retries || 0));
    const left = Math.max(0, initial - game.firstCorrect);
    hud.querySelector('.boss-hp i').style.width = (left / initial * 100) + '%';
    hud.querySelector('.boss-count').textContent = 'Защита: ' + left + ' / ' + initial;
    if (answer?.correct && !reduced()) { hud.classList.remove('hit'); void hud.offsetWidth; hud.classList.add('hit'); }
  }

  /* ---------- game start & finish ---------- */
  const origStart = start;
  start = function (...args) { origStart(...args); initGame(); };
  new MutationObserver(() => { initGame(); if (!document.querySelector('#play .feedback')) lastPick = null; }).observe($('play'), { childList: true });
  function initGame() {
    if (!game || game.lexiInit) return;
    game.lexiInit = true; game.lexiXP = game.lexiXP || 0; game.lexiStarted = Date.now();
    $('bossHud')?.remove(); $('game').classList.toggle('boss-mode', game.mode === 'boss');
    const c = coach(); c.hidden = false;
    say(LINES.start[game.mode] || 'Поехали!', game.mode === 'boss' ? 'think' : 'hello');
    if (game.mode === 'boss') bossHUD();
    const total = game.words.length;
    if (!game.assignmentId && total >= 2 && ['quiz', 'spell', 'truefalse', 'fix', 'audio', 'cards', 'builder', 'listen', 'crystals'].includes(game.mode)) {
      const scopeSize = (typeof selectedWords === 'function' ? selectedWords().filter(isLexicalEntry).length : total);
      if (scopeSize > total) $('counter').dataset.round = 'Раунд: ' + total + ' из ' + scopeSize + ' слов урока';
      else delete $('counter').dataset.round;
    } else delete $('counter').dataset.round;
  }
  const resultObserver = new MutationObserver(() => {
    const card = document.querySelector('#play .lesson-result');
    if (!card || card.dataset.lexi || !game) return;
    card.dataset.lexi = '1';
    try { rewardCard(card, game); } catch (e) { console.warn('LEXIGO reward layer', e); }
  });
  resultObserver.observe($('play'), { childList: true, subtree: false });
  function rewardCard(card, g) {
    const d = day(), k = today();
    if (!d.modes.includes(g.mode)) d.modes.push(g.mode);
    d.counters.variety = new Set(d.modes.filter(m => m !== 'cards')).size;
    // streak: any finished training today
    if (quest.streak.last !== k) { const gap = quest.streak.last ? dayDiff(quest.streak.last, k) : 99; quest.streak.count = gap === 1 ? quest.streak.count + 1 : 1; quest.streak.last = k; quest.streak.best = Math.max(quest.streak.best, quest.streak.count); }
    const initial = Math.max(0, g.words.length - (g.retries || 0));
    const perfect = !['cards', 'pairs'].includes(g.mode) && initial >= 5 && g.firstCorrect === initial;
    if (perfect) { quest.perfectGames++; bump('perfect'); }
    let bossWin = false;
    if (g.mode === 'boss' && typeof finalTestPassed === 'function' && finalTestPassed(g)) { const key = book.grade + ':' + mod; if (!quest.bosses[key]) { quest.bosses[key] = Date.now(); addXP(50); g.lexiXP = (g.lexiXP || 0) + 50; } bossWin = true; }
    bump('variety', 0);
    saveQuest(); checkBadges();
    const lv = levelOf(quest.xp);
    const box = el('section', 'lexi-reward'); box.setAttribute('aria-label', 'Награды Лекси');
    const head = el('div', 'lexi-reward-head'); head.append(avatar(bossWin || perfect ? 'cheer' : g.firstCorrect >= initial / 2 ? 'happy' : 'think', 'm'));
    const msg = bossWin ? 'Страж модуля побеждён! Модуль пройден.' : perfect ? 'Ни одной ошибки! Ты в ударе.' : initial && g.firstCorrect / initial >= .7 ? 'Хороший раунд! Ещё немного — и слова твои.' : 'Ошибки — это нормально. Сыграй ещё раунд, трудные слова вернутся.';
    head.append(el('p', 'lexi-say', isCalm() ? msg.replace(/!/g, '.') : msg)); box.append(head);
    const row = el('div', 'lexi-reward-row');
    const xp = el('div', 'reward-pill xp'); xp.append(el('b', null, '+' + (g.lexiXP || 0)), el('span', null, 'XP за раунд')); row.append(xp);
    const lvl = el('div', 'reward-pill lvl'); lvl.append(el('b', null, 'Ур. ' + lv.level), el('span', null, lv.title)); const bar = el('i', 'lvl-bar'); bar.style.setProperty('--p', ((lv.xp - lv.from) / (lv.to - lv.from) * 100).toFixed(0) + '%'); lvl.append(bar); row.append(lvl);
    const st = el('div', 'reward-pill streak'); st.append(el('b', null, quest.streak.count), el('span', null, quest.streak.count === 1 ? 'день подряд' : 'дней подряд')); row.append(st);
    box.append(row);
    const ms = missionState(); const list = el('ul', 'mission-mini');
    ms.forEach(m => { const li = el('li', m.done ? 'done' : ''); li.append(el('span', null, m.text), el('b', null, m.done ? '✓' : m.value + '/' + m.goal)); list.append(li); });
    box.append(list);
    // what next: methodology ladder
    const next = el('div', 'lexi-next'); const nextMode = recommendNext(g);
    if (nextMode) { const a = el('a', 'btn next-btn'); a.href = '#' + lessonHash() + '/play/' + nextMode[0]; a.textContent = 'Дальше: ' + nextMode[1] + ' →'; next.append(el('span', 'next-why', nextMode[2]), a); }
    const hard = g.words.filter(w => (progress[w.id]?.wrong || 0) > 0 && !(progress[w.id]?.streak >= 2)).slice(0, 5);
    if (hard.length >= 3 && !isCalm() && !g.assignmentId && g.mode !== 'review' && Math.random() < .5) {
      const ch = el('button', 'btn challenge', '⚡ Мини-челлендж: ' + hard.length + ' трудных слова — справишься?'); ch.type = 'button'; ch.onclick = () => start('spell', hard); next.append(ch);
    }
    box.append(next);
    card.querySelector('.result-actions')?.before(box);
    const again = [...card.querySelectorAll('.result-actions button')].find(b => b.textContent.trim() === 'Повторить');
    if (again && $('counter').dataset.round) again.title = 'Следующий раунд: Лекси подберёт слова, которые ещё не закреплены';
    say(msg, bossWin || perfect ? 'cheer' : 'happy');
    refreshChrome();
  }
  function recommendNext(g) {
    const ladder = { cards: ['quiz', 'Выбери перевод', 'Узнал слова? Теперь проверь себя.'], quiz: ['builder', 'Конструктор слов', 'Следующий шаг — собрать слово самому.'], truefalse: ['builder', 'Конструктор слов', 'Теперь собери слова из букв.'], listen: ['audio', 'Аудиодиктант', 'Узнаёшь на слух — попробуй записать.'], pairs: ['builder', 'Конструктор слов', 'Пары найдены. Теперь собери слова.'], builder: ['spell', 'Напиши слово', 'Собирать умеешь — пиши по памяти!'], fix: ['spell', 'Напиши слово', 'Теперь напиши слова целиком.'], spell: ['boss', 'Финальный тест', 'Готов к стражу модуля?'], audio: ['spell', 'Напиши слово', 'Теперь по переводу, без звука.'], crystals: ['spell', 'Напиши слово', 'Закрепи слова письмом.'], mixed: ['review', 'Работа над ошибками', 'Добей трудные слова.'], review: ['boss', 'Финальный тест', 'Ошибки исправлены — вперёд к стражу!'], boss: ['review', 'Работа над ошибками', 'Повтори слова, где были ошибки.'] };
    const r = ladder[g.mode]; if (!r) return null;
    if (r[0] === 'boss' && g.firstCorrect < (g.words.length - (g.retries || 0)) * .7) return ['review', 'Работа над ошибками', 'Сначала исправь ошибки, потом страж.'];
    return r;
  }
  function lessonHash() { return '/lesson/' + book.grade + '/' + (unit === '__all' ? 'm' + [...new Set(book.sections.map(s => s.module))].indexOf(mod) : unit); }

  /* ---------- header chrome: level chip, streak, calm toggle ---------- */
  function chrome() {
    const nav = document.querySelector('.header-actions'); if (!nav || $('lexiChip')) return;
    const chip = el('a', 'lexi-chip'); chip.id = 'lexiChip'; chip.href = '#/awards'; chip.setAttribute('aria-label', 'Мой уровень и награды');
    chip.append(avatar('hello', 's'), el('span', 'chip-lvl'), el('span', 'chip-streak'));
    const calm = el('button', 'calm-toggle'); calm.id = 'calmToggle'; calm.type = 'button'; calm.innerHTML = '<i aria-hidden="true"></i><span></span>';
    calm.onclick = () => { prefs.calm = isCalm() ? 'off' : 'on'; savePrefs(); applyModes(); toast(isCalm() ? 'Спокойный режим: меньше эффектов и реплик.' : 'Игровой режим включён!', 'hello'); };
    nav.prepend(chip); nav.append(calm);
  }
  function refreshChrome() {
    const lv = levelOf(quest.xp), chip = $('lexiChip'); if (!chip) return;
    chip.querySelector('.chip-lvl').textContent = 'Ур. ' + lv.level + ' · ' + quest.xp + ' XP'; chip.querySelector('.chip-lvl').dataset.short = 'Ур. ' + lv.level; chip.dataset.level = lv.level; chip.setAttribute('aria-label', 'Уровень ' + lv.level + ', ' + quest.xp + ' XP. Мои награды');
    chip.querySelector('.chip-lvl').style.setProperty('--p', ((lv.xp - lv.from) / (lv.to - lv.from) * 100).toFixed(0) + '%');
    const alive = quest.streak.last && dayDiff(quest.streak.last, today()) <= 1 ? quest.streak.count : 0;
    chip.querySelector('.chip-streak').textContent = alive ? '🔥 ' + alive : '';
  }

  /* ---------- home: Lexi hero, continue, missions ---------- */
  function renderHome() {
    const host = $('lexiHome'); if (!host) return;
    host.replaceChildren();
    const hero = el('section', 'lexi-hero');
    const txt = el('div', 'lexi-hero-text');
    const hr = new Date().getHours(), hi = hr < 12 ? 'Доброе утро!' : hr < 18 ? 'Привет!' : 'Добрый вечер!';
    txt.append(el('p', 'eyebrow', 'LEXIGO · МИР АНГЛИЙСКИХ СЛОВ'), el('h2', 'lexi-hero-title', hi + ' Я Лекси.'), el('p', 'lexi-hero-sub', quest.lastLesson ? 'Продолжим путешествие? Выполни миссии дня и открой сундук.' : 'Я помогу выучить слова из твоего учебника Spotlight: узнать, вспомнить и проверить себя. Выбери учебник ниже.'));
    const actions = el('div', 'lexi-hero-actions');
    if (quest.lastLesson) {
      const label = lessonLabel(quest.lastLesson);
      const go = el('a', 'btn hero-go'); go.href = '#' + quest.lastLesson + '/play/mixed'; go.innerHTML = '<span>Тренировка дня</span><small></small>'; go.querySelector('small').textContent = label;
      const cont = el('a', 'btn secondary'); cont.href = '#' + quest.lastLesson; cont.textContent = 'Открыть урок';
      actions.append(go, cont);
    } else { const go = el('a', 'btn hero-go'); go.href = '#/course/' + (DB.books[0].grade) + '/0'; go.innerHTML = '<span>Начать путешествие</span><small>Выбери учебник и урок</small>'; actions.append(go); }
    txt.append(actions);
    const art = el('div', 'lexi-hero-art'); const img = el('img'); img.src = 'assets/lexi-hero.webp'; img.alt = 'Котёнок Лекси в синей толстовке с кристаллом'; img.width = 520; img.height = 520; img.decoding = 'async'; art.append(img);
    hero.append(txt, art); host.append(hero);
    const panel = el('section', 'lexi-panel'); panel.setAttribute('aria-labelledby', 'missionsTitle');
    const lv = levelOf(quest.xp);
    const level = el('div', 'lexi-level'); level.innerHTML = '<span class="lvl-num"></span><div><b class="lvl-title"></b><div class="lvl-track"><i></i></div><small class="lvl-xp"></small></div>';
    level.querySelector('.lvl-num').textContent = lv.level; level.querySelector('.lvl-title').textContent = lv.title;
    level.querySelector('.lvl-track i').style.width = ((lv.xp - lv.from) / (lv.to - lv.from) * 100) + '%';
    level.querySelector('.lvl-xp').textContent = quest.xp + ' / ' + lv.to + ' XP до уровня ' + (lv.level + 1);
    const ms = missionState(), d = day();
    const missions = el('div', 'lexi-missions'); const h = el('h3', null, 'Миссии дня'); h.id = 'missionsTitle'; missions.append(h);
    const ul = el('ul');
    ms.forEach(m => { const li = el('li', m.done ? 'done' : ''); const t = el('div', 'm-text'); t.append(el('span', 'm-icon icon-' + m.icon), el('span', null, m.text)); const track = el('div', 'm-track'); const i = el('i'); i.style.width = (m.value / m.goal * 100) + '%'; track.append(i); li.append(t, track, el('b', 'm-val', m.done ? '✓' : m.value + '/' + m.goal)); ul.append(li); });
    missions.append(ul);
    const chest = el('div', 'lexi-chest' + (d.chest ? ' open' : '')); chest.append(el('span', 'chest-icon'), el('span', null, d.chest ? 'Сундук открыт: +40 XP' : 'Выполни 3 миссии — откроется сундук дня (+40 XP)')); missions.append(chest);
    const streak = el('div', 'lexi-streak'); const alive = quest.streak.last && dayDiff(quest.streak.last, today()) <= 1 ? quest.streak.count : 0;
    streak.append(el('b', null, alive), el('span', null, alive ? (alive === 1 ? 'день подряд' : 'дней подряд') + ' · рекорд ' + quest.streak.best : 'Начни серию сегодня'));
    panel.append(level, streak, missions); host.append(panel);
    decorateCourseCards();
  }
  function lessonLabel(path) {
    const m = path.match(/^\/lesson\/(\d+)\/(m?)(\d+)$/); if (!m) return '';
    const b = DB.books.find(x => String(x.grade) === m[1]); if (!b) return '';
    if (m[2]) return 'Spotlight ' + b.grade + ' · ' + ([...new Set(b.sections.map(s => s.module))][Number(m[3])] || '');
    return 'Spotlight ' + b.grade + ' · ' + (b.sections[Number(m[3])]?.title || '');
  }
  function bookStats(b) {
    const words = b.sections.flatMap(s => s.words).filter(isLexicalEntry);
    let practiced = 0; for (const w of words) { const p = progress[w.id]; if (p && (p.right || p.wrong || p.selfKnown || p.selfLearning)) practiced++; }
    return { total: words.length, practiced };
  }
  function decorateCourseCards() {
    document.querySelectorAll('#courseCards .course-card').forEach(card => {
      const grade = (card.className.match(/grade-(\d)/) || [])[1]; const b = DB.books.find(x => String(x.grade) === grade); if (!b) return;
      card.classList.toggle('teen', Number(grade) >= 5);
      let meter = card.querySelector('.book-meter'); if (!meter) { meter = el('div', 'book-meter'); meter.append(el('i'), el('span')); card.querySelector('.course-caption')?.append(meter); }
      const s = bookStats(b); meter.querySelector('i').style.setProperty('--p', (s.practiced / Math.max(1, s.total) * 100).toFixed(1) + '%');
      meter.querySelector('span').textContent = s.practiced ? s.practiced + ' из ' + s.total + ' слов в практике' : 'Ещё не начат';
      if (Number(grade) >= 5 && !card.querySelector('.teen-num')) { const n = el('span', 'teen-num', grade); n.setAttribute('aria-hidden', 'true'); card.prepend(n); }
    });
  }

  /* ---------- course page: lesson stars and module boss ---------- */
  function stars(words) {
    const lex = words.filter(isLexicalEntry); if (!lex.length) return 0;
    let seen = 0, right = 0, recalled = 0;
    for (const w of lex) { const p = progress[w.id]; if (!p) continue; if (p.right || p.wrong || p.selfKnown || p.selfLearning) seen++; if (p.right) right++; if ((p.recall || 0) >= 1) recalled++; }
    const n = lex.length; return recalled / n >= .6 && right / n >= .8 ? 3 : right / n >= .8 ? 2 : seen / n >= .5 ? 1 : 0;
  }
  function starRow(n) { const s = el('span', 'stars'); s.setAttribute('aria-label', n + ' из 3 звёзд'); for (let i = 0; i < 3; i++) s.append(el('i', i < n ? 'on' : '')); return s; }
  function decorateLessons() {
    const list = $('lessonCards'); if (!list || list.dataset.lexi === list.childElementCount + ':' + location.hash) return;
    list.dataset.lexi = list.childElementCount + ':' + location.hash;
    const m = location.hash.match(/#\/course\/(\d+)\/(\d+)/); const b = DB.books.find(x => String(x.grade) === (m ? m[1] : String(DB.books[0].grade))); if (!b) return;
    const ms = [...new Set(b.sections.map(s => s.module))]; const mi = m ? Number(m[2]) : 0; const moduleName = ms[mi] || ms[0];
    let total = 0, count = 0;
    list.querySelectorAll('a.lesson-card').forEach(a => {
      const key = (a.getAttribute('href').match(/\/lesson\/\d+\/(m?\d+)$/) || [])[1]; if (!key) return;
      const words = key.startsWith('m') ? b.sections.filter(s => s.module === moduleName).flatMap(s => s.words) : (b.sections[Number(key)]?.words || []);
      const n = stars(words); if (!key.startsWith('m')) { total += n; count++; }
      a.querySelector('.stars')?.remove(); const label = a.querySelector('span:not(.lesson-number)'); (label || a).append(starRow(n));
      a.classList.toggle('mastered', n === 3);
    });
    if (!list.querySelector('.boss-card') && count) {
      const boss = el('a', 'lesson-card boss-card'); boss.href = '#/lesson/' + b.grade + '/m' + mi + '/play/boss';
      const won = !!quest.bosses[b.grade + ':' + moduleName];
      const num = el('span', 'lesson-number', won ? '🏆' : '🛡️'); num.setAttribute('aria-hidden', 'true');
      const lab = el('span'); lab.append(el('strong', null, 'Страж модуля'), el('small', null, won ? 'Побеждён! Можно сразиться ещё раз' : total >= count * 2 ? 'Финальный тест: ты готов!' : 'Финальный тест модуля · лучше после уроков'));
      boss.append(num, lab, el('span', null, '→')); list.append(boss);
    }
  }

  /* ---------- lesson launcher: Lexi tip ---------- */
  function decorateLauncher() {
    const launcher = $('launcher'); if (!launcher || launcher.hidden) return;
    let tip = $('lexiTip'); if (!tip) { tip = el('div', 'lexi-tip'); tip.id = 'lexiTip'; tip.append(avatar('hello', 'm'), el('p')); launcher.querySelector('.mode-heading')?.before(tip); }
    const ws = typeof selectedWords === 'function' ? selectedWords().filter(isLexicalEntry) : [];
    const hard = ws.filter(isReviewWord).length, fresh = ws.filter(w => !progress[w.id]).length, recalled = ws.filter(w => (progress[w.id]?.recall || 0) >= 1).length;
    let text;
    if (!ws.length) text = 'Выбери слова в списке — и начнём.';
    else if (hard >= 3) text = 'Есть ' + hard + ' слов для повторения. Начни с «Работы над ошибками» — это самое полезное сейчас.';
    else if (fresh === ws.length) text = 'Новые слова! Начни с «Карточек» или «Выбери перевод», потом переходи к «Конструктору».';
    else if (recalled / ws.length >= .6) text = 'Ты хорошо знаешь эти слова. Сразись со стражем модуля в «Финальном тесте»!';
    else text = 'Слова уже знакомы. Попробуй «Конструктор» и «Напиши слово» — так они запомнятся надолго.';
    tip.querySelector('p').textContent = text;
  }

  /* ---------- awards & profile pages ---------- */
  function decorateDashboard() {
    const host = $('dashboardPage'); if (!host || host.hidden || host.querySelector('.lexi-journey')) return;
    const page = document.body.dataset.page;
    if (page === 'awards') {
      const lv = levelOf(quest.xp); const sec = el('section', 'lexi-journey');
      sec.append(el('h2', null, 'Путь Лекси'));
      const lvl = el('div', 'lexi-level big'); lvl.innerHTML = '<span class="lvl-num"></span><div><b class="lvl-title"></b><div class="lvl-track"><i></i></div><small class="lvl-xp"></small></div>';
      lvl.querySelector('.lvl-num').textContent = lv.level; lvl.querySelector('.lvl-title').textContent = 'Уровень ' + lv.level + ': ' + lv.title;
      lvl.querySelector('.lvl-track i').style.width = ((lv.xp - lv.from) / (lv.to - lv.from) * 100) + '%'; lvl.querySelector('.lvl-xp').textContent = quest.xp + ' XP · до следующего уровня ' + (lv.to - lv.xp) + ' XP';
      sec.append(lvl, el('p', 'dashboard-note', 'XP начисляется только за верные ответы: 2 XP за узнавание, 4 XP за слово по памяти, не больше двух раз за слово в день. Ещё XP — за миссии дня, сундук и победу над стражем модуля.'));
      const grid = el('div', 'badge-grid');
      for (const [id, name, rule] of BADGES) { const card = el('article', 'badge-card' + (quest.badges[id] ? ' earned' : '')); card.append(el('span', 'badge-icon badge-' + id), el('h3', null, name), el('p', null, rule), el('strong', null, quest.badges[id] ? 'Получено' : 'Ещё впереди')); grid.append(card); }
      sec.append(grid); host.querySelector('h1')?.after(sec);
    } else if (page === 'profile') {
      const words = allWords().filter(isLexicalEntry); let recog = 0, recall = 0, hard = 0;
      for (const w of words) { const p = progress[w.id]; if (!p) continue; if ((p.recognition || 0) >= 1) recog++; if ((p.recall || 0) >= 1) recall++; if ((p.wrong || 0) > 0 && (p.streak || 0) < 2) hard++; }
      const sec = el('section', 'lexi-journey skills'); sec.append(el('h2', null, 'Мои навыки'));
      for (const [label, value, hint] of [['Узнаю слово', recog, 'выбор перевода, верно/неверно, пары, на слух'], ['Вспоминаю и пишу', recall, 'слова, написанные по памяти'], ['Нужно повторить', hard, 'слова с ошибками — «Работа над ошибками»']]) {
        const row = el('div', 'skill-row'); row.append(el('span', null, label), el('b', null, value), el('small', null, hint)); sec.append(row);
      }
      host.querySelector('.progress-stats')?.after(sec);
    }
  }

  /* ---------- teacher: board mode ---------- */
  function teacherTools() {
    const cfg = document.querySelector('#teacherPage .test-config'); if (!cfg || $('boardToggle')) return;
    const box = el('div', 'board-config'); const label = el('label', 'board-label'); const cb = el('input'); cb.type = 'checkbox'; cb.id = 'boardToggle';
    cb.onchange = () => { prefs.board = cb.checked; savePrefs(); applyModes(); };
    label.append(cb, el('span', null, 'Режим интерактивной доски: крупный шрифт, без игровых эффектов и реплик кота'));
    box.append(el('h3', null, 'Урок на доске'), label, el('p', 'muted tiny', 'Выберите слова урока и запустите любую игру — её будет хорошо видно с последней парты. Печать не меняется.'));
    cfg.before(box); applyModes();
  }

  /* ---------- page tracking ---------- */
  function onPage() {
    const page = document.body.dataset.page;
    applyModes();
    if (['lesson', 'words', 'play'].includes(page) && typeof book !== 'undefined' && book) {
      const key = unit === '__all' ? 'm' + [...new Set(book.sections.map(s => s.module))].indexOf(mod) : unit;
      const path = '/lesson/' + book.grade + '/' + key; if (quest.lastLesson !== path) { quest.lastLesson = path; saveQuest(); }
    }
    if (page === 'home') renderHome();
    if (page === 'course') { decorateLessons(); document.querySelector('#courseTabs [aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'center' }); }
    if (page === 'lesson') decorateLauncher();
    if (page === 'teacher') teacherTools();
    if (page !== 'play') { const c = $('lexiCoach'); if (c) c.hidden = true; $('game').classList.remove('boss-mode'); }
    if (['awards', 'profile'].includes(page)) setTimeout(decorateDashboard, 0);
    refreshChrome();
  }
  new MutationObserver(onPage).observe(document.body, { attributes: true, attributeFilter: ['data-page'] });
  new MutationObserver(() => { if (document.body.dataset.page === 'course') decorateLessons(); }).observe($('lessonCards'), { childList: true });
  new MutationObserver(() => decorateDashboard()).observe($('dashboardPage') || document.body, { childList: true });
  document.addEventListener('change', e => { if (e.target?.closest?.('#words')) decorateLauncher(); });
  window.addEventListener('storage', e => { if (e.key === QUEST_KEY) { quest = loadQuest(); refreshChrome(); } });

  chrome(); checkBadges(); onPage();
  if (typeof game !== 'undefined' && game) initGame(); // deep link straight into a game
  window.LexiQuest = Object.freeze({ toast, levelOf, missionState, state: () => JSON.parse(JSON.stringify(quest)), isCalm });
})();
