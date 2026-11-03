/* LEXI+ (2026-11-02) — доработки поверх существующего движка игр, без изменения словаря и игр.
 *  1. Выбор конкретных слов: «Выбрано N из M», запоминание набора для каждого урока/модуля.
 *  2. Выбор нескольких режимов и маршрут «по порядку» в трёх этапах «Знакомлюсь — Вспоминаю — Проверяю себя».
 *  3. Настраиваемый финальный тест: какие типы заданий (без «Кристальной экспедиции»), по выбранным словам.
 *  4. Дружелюбные сообщения Лекси вместо системных alert().
 *  5. Подписи о хранении прогресса соответствуют реальности (аккаунт / это устройство).
 * Подключается после lexi-world.js и до cloud.js. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = String(text); return n; };
  const toast = (t, mood) => { try { window.LexiQuest?.toast(t, mood || 'think'); } catch { /* cosmetic */ } };
  const readJSON = (k, f) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v && typeof v === 'object' ? v : f; } catch { return f; } };
  const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full */ } };
  const MODE_NAMES = { cards: 'Карточки', quiz: 'Выбери перевод', spell: 'Напиши слово', pairs: 'Найди пару', truefalse: 'Верно / неверно', fix: 'Исправь ошибку', audio: 'Аудиодиктант', crystals: 'Кристальная экспедиция', boss: 'Финальный тест', mixed: 'Тренировка дня', builder: 'Конструктор слов', listen: 'Слушай и выбирай', review: 'Работа над ошибками' };
  const lessonKey = () => (typeof book !== 'undefined' && book ? book.grade + ':' + unit : '');
  const SINGLE = w => /^[a-zA-Z]+(?:[-'’‘][a-zA-Z]+)*$/.test(String(w.en).trim());

  /* ---------- 4. friendly messages instead of browser alerts ---------- */
  function notice(text, actions) {
    document.querySelector('.lx-notice')?.remove();
    const box = el('div', 'lx-notice'); box.setAttribute('role', 'alertdialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Сообщение Лекси');
    const card = el('div', 'lx-notice-card');
    const head = el('div', 'lx-notice-head');
    if (window.LexiQuest?.avatar) head.append(window.LexiQuest.avatar('think', 'm'));
    head.append(el('p', null, text));
    const row = el('div', 'lx-notice-actions');
    const close = () => { box.remove(); document.removeEventListener('keydown', esc); };
    const esc = e => { if (e.key === 'Escape') close(); };
    for (const [label, fn, primary] of (actions || [])) { const b = el('button', 'btn' + (primary ? '' : ' secondary'), label); b.type = 'button'; b.onclick = () => { close(); fn(); }; row.append(b); }
    const ok = el('button', 'btn' + (actions && actions.length ? ' secondary' : ''), actions && actions.length ? 'Закрыть' : 'Понятно'); ok.type = 'button'; ok.onclick = close; row.append(ok);
    card.append(head, row); box.append(card); box.addEventListener('click', e => { if (e.target === box) close(); });
    document.addEventListener('keydown', esc); document.body.append(box); row.querySelector('button').focus();
  }
  const openWords = () => { try { location.hash = '#/lesson/' + book.grade + '/' + (unit === '__all' ? 'm' + [...new Set(book.sections.map(s => s.module))].indexOf(mod) : unit) + '/words'; } catch { /* no lesson */ } };
  window.alert = msg => {
    const text = String(msg || '');
    const wordsRelated = /слов/i.test(text) && document.body.dataset.page !== 'words';
    notice(text.replace(/^Для этого режима/, 'Для этой игры') + (wordsRelated ? ' Можно выбрать больше слов урока.' : ''), wordsRelated ? [['Выбрать слова', openWords, true]] : []);
  };

  /* ---------- 1. word selection: remember per lesson, clear counter ----------
   * Storage (per browser, per account): { "<grade>:<unit>": { m: 'all'|'chosen'|'hard', ids: [...] } }.
   * Old format (a bare array of ids) is read as the 'chosen' set. 'ids' keeps the student's own
   * choice even while they train all words or only hard words, so they can come back to it. */
  const SEL_KEY = 'lexigo_word_selection_v1';
  const HARD_KEY = 'lexigo_hard_words_v1';
  let restoring = false, currentSet = 'all';
  const hardStore = () => { const h = readJSON(HARD_KEY, {}); return h && !Array.isArray(h) ? h : {}; };
  const hardIds = () => { const h = hardStore(); return typeof scope === 'undefined' ? [] : scope.filter(w => h[w.id]).map(w => w.id); };
  function savedEntry(key) {
    const v = readJSON(SEL_KEY, {})[key || lessonKey()];
    if (Array.isArray(v)) return { m: 'chosen', ids: v };
    return v && typeof v === 'object' && Array.isArray(v.ids) ? { m: ['all', 'chosen', 'hard'].includes(v.m) ? v.m : 'chosen', ids: v.ids } : { m: 'all', ids: [] };
  }
  function writeEntry(entry) {
    const key = lessonKey(); if (!key) return;
    const all = readJSON(SEL_KEY, {});
    if (entry.m === 'all' && !entry.ids.length) delete all[key]; else all[key] = entry;
    const keys = Object.keys(all); if (keys.length > 300) for (const k of keys.slice(0, keys.length - 300)) delete all[k];
    writeJSON(SEL_KEY, all);
  }
  function saveSelection() {
    if (restoring || typeof scope === 'undefined' || !scope.length) return;
    const prev = savedEntry(); const ids = scope.filter(w => selected.has(w.id)).map(w => w.id);
    const hard = hardIds(), same = (a, b) => a.length === b.length && a.every(x => b.includes(x));
    if (currentSet === 'hard' && hard.length && same(ids, hard)) { writeEntry({ m: 'hard', ids: prev.ids }); return; }
    if (ids.length === scope.length) { currentSet = 'all'; writeEntry({ m: 'all', ids: prev.ids }); return; }
    currentSet = 'chosen'; writeEntry({ m: 'chosen', ids });
  }
  function restoreSelection() {
    const e = savedEntry(); const inScope = new Set(scope.map(w => w.id));
    const chosen = e.ids.filter(id => inScope.has(id)), hard = hardIds();
    if (e.m === 'hard' && hard.length) { currentSet = 'hard'; selected = new Set(hard); }
    else if (e.m === 'chosen' && chosen.length) { currentSet = 'chosen'; selected = new Set(chosen); }
    else { currentSet = 'all'; return; }
    renderWords();
  }
  /* One learning context for every game: all words / my chosen words / my hard words — always inside the open lesson or module. */
  function wordSet() {
    if (typeof scope === 'undefined' || !scope.length) return { mode: 'all', all: 0, chosen: 0, hard: 0, active: 0 };
    const inScope = new Set(scope.map(w => w.id));
    return { mode: currentSet, all: scope.length, chosen: savedEntry().ids.filter(id => inScope.has(id)).length || (currentSet === 'chosen' ? scope.filter(w => selected.has(w.id)).length : 0), hard: hardIds().length, active: scope.filter(w => selected.has(w.id)).length };
  }
  function setWordSet(mode) {
    if (typeof scope === 'undefined' || !scope.length) return false;
    const inScope = new Set(scope.map(w => w.id)), e = savedEntry();
    if (mode === 'hard') { const h = hardIds(); if (!h.length) return false; currentSet = 'hard'; selected = new Set(h); restoring = true; try { renderWords(); } finally { restoring = false; } writeEntry({ m: 'hard', ids: e.ids }); }
    else if (mode === 'chosen') { const c = e.ids.filter(id => inScope.has(id)); if (!c.length) return false; currentSet = 'chosen'; selected = new Set(c); renderWords(); }
    else { currentSet = 'all'; scope.forEach(w => selected.add(w.id)); restoring = true; try { renderWords(); } finally { restoring = false; } writeEntry({ m: 'all', ids: e.ids }); }
    refreshSelectionUI(); window.dispatchEvent(new CustomEvent('lexigo:wordset')); return true;
  }
  // a set is chosen for one lesson before that lesson is opened (e.g. «Повторить сложные» on the home page)
  function presetWordSet(grade, unitKey, mode) { const all = readJSON(SEL_KEY, {}); const k = grade + ':' + unitKey; const prev = Array.isArray(all[k]) ? { m: 'chosen', ids: all[k] } : (all[k] || { m: 'all', ids: [] }); all[k] = { m: mode, ids: prev.ids || [] }; writeJSON(SEL_KEY, all); }
  const origChangeUnit = changeUnit;
  changeUnit = function (...a) { restoring = true; currentSet = 'all'; try { origChangeUnit.apply(this, a); restoreSelection(); } finally { restoring = false; } refreshSelectionUI(); window.dispatchEvent(new CustomEvent('lexigo:wordset')); };
  $('unit').onchange = changeUnit;
  const origUpdateStats = updateStats;
  updateStats = function (...a) { origUpdateStats.apply(this, a); saveSelection(); refreshSelectionUI(); };
  function refreshSelectionUI() {
    if (typeof scope === 'undefined') return;
    const n = scope.filter(w => selected.has(w.id)).length, m = scope.length;
    const sc = $('selectedCount'), tc = $('totalCount');
    if (sc) sc.textContent = 'Выбрано ' + n + ' из ' + m;
    if (tc) tc.textContent = n === m ? 'в играх — все слова' : n ? 'в играх — только отмеченные' : 'отметь слова для игр';
    const ow = $('openWords'); if (ow) { ow.textContent = n === m ? 'Слова урока: ' + m + ' · выбрать' : 'Слова: ' + n + ' из ' + m + ' · изменить'; ow.classList.toggle('has-subset', n !== m); }
    const done = $('wordsDone'); if (done && document.body.dataset.page === 'teacher') { done.textContent = n ? 'Готово: ' + n + ' ' + plural(n, 'слово', 'слова', 'слов') + ' для работы ↓' : 'Отметь хотя бы одно слово'; done.disabled = !n; } else if (done) { done.textContent = !n ? 'Отметь хотя бы одно слово' : n === m ? 'Тренировать все слова (' + n + ') →' : 'Тренировать выбранные (' + n + ') →'; done.disabled = !n; }
    const twc = $('teacherWordCount'); if (twc) twc.textContent = n === m ? 'все слова урока: ' + m : 'выбрано ' + n + ' из ' + m;
    let chip = $('selectionChip');
    const launcher = $('launcher');
    if (launcher && n !== m) {
      if (!chip) { chip = el('p', 'selection-chip'); chip.id = 'selectionChip'; launcher.querySelector('.stats')?.after(chip); }
      chip.replaceChildren(el('span', null, (currentSet === 'hard' ? '★ Во всех играх только сложные слова: ' : '🎯 Во всех играх только выбранные слова: ') + n + ' из ' + m + '. '), Object.assign(el('button', 'text-button', 'Изменить'), { type: 'button', onclick: openWords }), Object.assign(el('button', 'text-button', 'Вернуть все'), { type: 'button', onclick: () => setWordSet('all') }));
    } else chip?.remove();
  }
  function plural(n, a, b, c) { n = Math.abs(n) % 100; const n1 = n % 10; return n > 10 && n < 20 ? c : n1 > 1 && n1 < 5 ? b : n1 === 1 ? a : c; }
  // nicer labels for the existing buttons
  for (const [id, t] of [['all', 'Выбрать все'], ['none', 'Снять выделение']]) { const b = $(id); if (b) b.textContent = t; }
  // the old "Все"/"Снять" etc. already call renderWords → updateStats → saved automatically

  /* teacher materials: choose the words right here (the student «train» block is not shown to the teacher) */
  const tpw = $('teacherPickWords');
  if (tpw) tpw.onclick = () => { const open = !document.body.classList.contains('teacher-words-open'); document.body.classList.toggle('teacher-words-open', open); tpw.setAttribute('aria-expanded', String(open)); tpw.textContent = open ? 'Готово' : 'Выбрать слова'; if (open) $('wordSelection')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); else $('teacherPickWords')?.scrollIntoView({ block: 'center' }); };
  $('wordsDone')?.addEventListener('click', e => { if (document.body.dataset.page === 'teacher') { e.preventDefault(); e.stopImmediatePropagation(); if (document.body.classList.contains('teacher-words-open')) tpw?.click(); } }, true);
  new MutationObserver(() => { refreshSelectionUI(); if (document.body.dataset.page !== 'teacher' && document.body.classList.contains('teacher-words-open')) { document.body.classList.remove('teacher-words-open'); if (tpw) { tpw.textContent = 'Выбрать слова'; tpw.setAttribute('aria-expanded', 'false'); } } }).observe(document.body, { attributes: true, attributeFilter: ['data-page'] });

  /* ---------- 3. configurable final test ---------- */
  const BOSS_KEY = 'lexigo_boss_types_v1';
  const BOSS_TYPES = [['spell', 'Напиши слово', 'по памяти, без подсказок', true], ['audio', 'Аудиодиктант', 'услышь и напиши', true], ['builder', 'Конструктор слов', 'собери слово или фразу', false], ['fix', 'Исправь ошибку', 'найди опечатку', false], ['quiz', 'Выбери перевод', 'один из четырёх', false], ['truefalse', 'Верно / неверно', 'проверь перевод', false], ['listen', 'Слушай и выбирай', 'узнай на слух', false]];
  const BOSS_DEFAULT = ['spell', 'builder', 'fix', 'quiz'];
  const audioOK = () => typeof audioAvailable === 'function' && audioAvailable();
  function bossTypes() {
    const saved = readJSON(BOSS_KEY, null);
    let t = Array.isArray(saved) ? saved.filter(x => BOSS_TYPES.some(b => b[0] === x)) : BOSS_DEFAULT.slice();
    if (!audioOK()) t = t.filter(x => !['audio', 'listen'].includes(x));
    if (!t.some(x => ['spell', 'audio'].includes(x))) t.unshift('spell');
    return t;
  }
  // every way of starting the final test (launcher, dashboard link, whole book, route) uses the chosen task types
  const origStart = start;
  start = function (mode, words, types) {
    if (mode === 'boss' && !types) types = bossTypes();
    if (mode !== 'boss' && types) types = types.filter(t => t !== 'crystals' || mode === 'crystals');
    return origStart.call(this, mode, words, types);
  };
  /* opts (2026-11-03): { pool, key, title } — финальный тест по другому набору (весь учебник) */
  function bossDialog(onStart, opts = {}) {
    const source = opts.pool || overridePool || selectedWords();
    const pool = source.filter(w => typeof isLexicalEntry !== 'function' || isLexicalEntry(w)).filter(SINGLE);
    const chosen = new Set(bossTypes());
    document.querySelector('.lx-notice')?.remove();
    const box = el('div', 'lx-notice boss-setup'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'bossSetupTitle');
    const card = el('div', 'lx-notice-card');
    const title = el('h2', null, 'Финальный тест' + (opts.title ? ' · ' + opts.title : '')); title.id = 'bossSetupTitle';
    const all = source.filter(w => typeof isLexicalEntry !== 'function' || isLexicalEntry(w));
    let roundNote = ' · в тесте до 15 слов';
    try {
      const key = opts.key || (typeof lessonRoundKey === 'function' ? lessonRoundKey('boss') : '');
      if (window.LexiRounds && key && pool.length > 15) { const i = LexiRounds.info(key, pool, 15); roundNote = ' · по 15 слов по порядку, сейчас раунд ' + (i.complete ? 1 : i.round) + ' из ' + i.rounds; }
    } catch { /* */ }
    const info = el('p', 'boss-words', 'Слова: ' + pool.length + (pool.length !== all.length ? ' из ' + all.length + (opts.pool ? '' : ' выбранных') + ' (фразы в тест не входят)' : '') + roundNote);
    const change = el('button', 'text-button', 'Изменить слова'); change.type = 'button'; change.onclick = () => { box.remove(); openWords(); };
    if (opts.pool) change.hidden = true;
    const grid = el('div', 'boss-types'); grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', 'Типы заданий в тесте');
    const msg = el('p', 'boss-msg'); msg.setAttribute('role', 'status');
    const paint = () => {
      grid.querySelectorAll('button').forEach(b => { const on = chosen.has(b.dataset.type); b.setAttribute('aria-pressed', String(on)); b.querySelector('.tick').textContent = on ? '✓' : ''; });
      const ok = [...chosen].some(t => ['spell', 'audio'].includes(t));
      msg.textContent = !chosen.size ? 'Отметь хотя бы один тип заданий.' : !ok ? 'Добавь «Напиши слово» или «Аудиодиктант»: в финальном тесте слово нужно написать самому хотя бы раз.' : 'В тесте: ' + [...chosen].map(t => MODE_NAMES[t]).join(', ') + '. Ошибки вернутся в конце теста — это работа над ошибками.';
      msg.classList.toggle('warn', !chosen.size || !ok);
      go.disabled = !chosen.size || !ok || pool.length < 3;
      if (pool.length < 3) { msg.textContent = 'Для финального теста нужно минимум 3 отдельных слова (без фраз). Сейчас: ' + pool.length + '.'; msg.classList.add('warn'); }
    };
    for (const [t, name, hint, recall] of BOSS_TYPES) {
      if (['audio', 'listen'].includes(t) && !audioOK()) continue;
      const b = el('button', 'boss-type' + (recall ? ' recall' : '')); b.type = 'button'; b.dataset.type = t;
      b.append(el('span', 'tick'), el('b', null, name), el('small', null, hint));
      b.onclick = () => { chosen.has(t) ? chosen.delete(t) : chosen.add(t); paint(); };
      grid.append(b);
    }
    const presets = el('div', 'boss-presets');
    const pAll = el('button', 'text-button', 'Выбрать все'); pAll.type = 'button'; pAll.onclick = () => { grid.querySelectorAll('button').forEach(b => chosen.add(b.dataset.type)); paint(); };
    const pRec = el('button', 'text-button', 'Рекомендуемый набор'); pRec.type = 'button'; pRec.onclick = () => { chosen.clear(); BOSS_DEFAULT.forEach(t => chosen.add(t)); paint(); };
    presets.append(pAll, pRec, el('span', 'boss-note', '«Кристальная экспедиция» — отдельная игра и в тест не входит.'));
    const row = el('div', 'lx-notice-actions');
    const cancel = el('button', 'btn secondary', 'Отмена'); cancel.type = 'button'; cancel.onclick = () => box.remove();
    const go = el('button', 'btn', 'Начать тест →'); go.type = 'button';
    go.onclick = () => { const t = BOSS_TYPES.map(x => x[0]).filter(x => chosen.has(x)); writeJSON(BOSS_KEY, t); box.remove(); onStart(t); };
    row.append(cancel, go);
    const wordsRow = el('div', 'boss-words-row'); wordsRow.append(info, change);
    card.append(title, wordsRow, el('h3', null, 'Какие задания включить?'), grid, presets, msg, row);
    box.append(card); box.addEventListener('click', e => { if (e.target === box) box.remove(); });
    box.addEventListener('keydown', e => { if (e.key === 'Escape') box.remove(); });
    document.body.append(box); paint(); go.focus();
  }
  let overridePool = null;

  /* ---------- 2. games right after the word set (2026-11-02: «Пройти по порядку» / «Выбрать игры» removed) ----------
   * The launcher shows every game straight away; one tap starts it. The final test still opens its settings first. */
  const launcher = $('launcher');
  const headP = launcher.querySelector('.mode-heading p'); if (headP) headP.textContent = 'Нажми на игру — и начнём.';
  try { sessionStorage.removeItem('lexigo_route_v1'); } catch { /* old route from an earlier visit */ }
  launcher.addEventListener('click', e => {
    const b = e.target.closest('.mode[data-mode]'); if (!b || !launcher.contains(b)) return;
    if (b.dataset.mode === 'boss') { e.preventDefault(); e.stopImmediatePropagation(); bossDialog(t => start('boss', null, t)); }
  }, true);
  const readRoute = () => null;

  /* ---------- 5. honest storage notes ---------- */
  function storageNotes() {
    const signed = !!(window.LexigoAccountHint && window.LexigoAccountHint.uid());
    const note = launcher.querySelector('.progress-note');
    if (note) note.textContent = signed ? '*Прогресс сохраняется в твоём аккаунте — продолжай на любом устройстве.' : '*Прогресс сохраняется на этом устройстве. Войди в аккаунт, чтобы он был доступен везде.';
    const rep = document.querySelector('#teacherPage .report');
    if (rep) { const h = rep.querySelector('h3'), p = rep.querySelector('p'); if (h) h.textContent = 'Результаты практики'; if (p) p.textContent = signed ? 'Слова с ошибками и даты повторения из вашего прогресса. Результаты учеников — в кабинете учителя.' : 'Слова с ошибками и даты повторения по данным этого устройства. Результаты учеников — в кабинете учителя после входа.'; }
  }
  storageNotes();
  try { restoreGradeScale(); $('gradeScale')?.addEventListener('change', () => gradeScale()); } catch { /* teacher settings are optional */ }
  window.addEventListener('lexigo:account', storageNotes);
  window.LexigoPlus = Object.freeze({ bossTypes, bossDialog, notice, route: readRoute, wordSet, setWordSet, presetWordSet, refreshSelection: () => refreshSelectionUI(), HARD_KEY });
  // the first lesson may already be open (the page was loaded with a lesson link): restore its saved choice now
  try { if (typeof book !== 'undefined' && book && scope.length) { restoring = true; restoreSelection(); } } finally { restoring = false; }
  refreshSelectionUI();
})();
