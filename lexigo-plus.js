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

  /* ---------- 1. word selection: remember per lesson, clear counter ---------- */
  const SEL_KEY = 'lexigo_word_selection_v1';
  let restoring = false;
  function saveSelection() {
    if (restoring || typeof scope === 'undefined' || !scope.length) return;
    const key = lessonKey(); if (!key) return;
    const all = readJSON(SEL_KEY, {}); const ids = scope.filter(w => selected.has(w.id)).map(w => w.id);
    if (ids.length === scope.length) delete all[key]; else all[key] = ids;
    const keys = Object.keys(all); if (keys.length > 300) for (const k of keys.slice(0, keys.length - 300)) delete all[k];
    writeJSON(SEL_KEY, all);
  }
  function restoreSelection() {
    const saved = readJSON(SEL_KEY, {})[lessonKey()];
    if (!Array.isArray(saved)) return;
    const inScope = new Set(scope.map(w => w.id)), ids = saved.filter(id => inScope.has(id));
    selected = new Set(ids); renderWords();
  }
  const origChangeUnit = changeUnit;
  changeUnit = function (...a) { restoring = true; try { origChangeUnit.apply(this, a); restoreSelection(); } finally { restoring = false; } refreshSelectionUI(); };
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
    const done = $('wordsDone'); if (done) { done.textContent = n ? 'Тренировать ' + n + ' ' + plural(n, 'слово', 'слова', 'слов') + ' →' : 'Отметь хотя бы одно слово'; done.disabled = !n; }
    let chip = $('selectionChip');
    const launcher = $('launcher');
    if (launcher && n !== m) {
      if (!chip) { chip = el('p', 'selection-chip'); chip.id = 'selectionChip'; launcher.querySelector('.stats')?.after(chip); }
      chip.replaceChildren(el('span', null, '🎯 В играх только выбранные слова: ' + n + ' из ' + m + '. '), Object.assign(el('button', 'text-button', 'Изменить'), { type: 'button', onclick: openWords }), Object.assign(el('button', 'text-button', 'Вернуть все'), { type: 'button', onclick: () => { scope.forEach(w => selected.add(w.id)); renderWords(); } }));
    } else chip?.remove();
  }
  function plural(n, a, b, c) { n = Math.abs(n) % 100; const n1 = n % 10; return n > 10 && n < 20 ? c : n1 > 1 && n1 < 5 ? b : n1 === 1 ? a : c; }
  // nicer labels for the existing buttons
  for (const [id, t] of [['all', 'Выбрать все'], ['none', 'Снять выделение']]) { const b = $(id); if (b) b.textContent = t; }
  // the old "Все"/"Снять" etc. already call renderWords → updateStats → saved automatically

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
  function bossDialog(onStart) {
    const pool = (overridePool || selectedWords()).filter(w => typeof isLexicalEntry !== 'function' || isLexicalEntry(w)).filter(SINGLE);
    const chosen = new Set(bossTypes());
    document.querySelector('.lx-notice')?.remove();
    const box = el('div', 'lx-notice boss-setup'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'bossSetupTitle');
    const card = el('div', 'lx-notice-card');
    const title = el('h2', null, 'Финальный тест'); title.id = 'bossSetupTitle';
    const all = selectedWords().filter(w => typeof isLexicalEntry !== 'function' || isLexicalEntry(w));
    const info = el('p', 'boss-words', 'Слова: ' + pool.length + (pool.length !== all.length ? ' из ' + all.length + ' выбранных (фразы в тест не входят)' : '') + ' · в тесте до 15 слов');
    const change = el('button', 'text-button', 'Изменить слова'); change.type = 'button'; change.onclick = () => { box.remove(); openWords(); };
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

  /* ---------- 2. choose several modes / follow the route ---------- */
  const ROUTE_KEY = 'lexigo_route_v1';
  const launcher = $('launcher');
  const modeButtons = () => [...launcher.querySelectorAll('.mode-stage .mode[data-mode]')].filter(b => b.dataset.mode !== 'audio' || audioOK());
  let picking = false; const picked = new Set();
  const bar = el('div', 'route-tools');
  const allBtn = el('button', 'route-btn primary'); allBtn.type = 'button'; allBtn.innerHTML = '<b>▶ Пройти по порядку</b><small>все игры трёх этапов</small>';
  const pickBtn = el('button', 'route-btn'); pickBtn.type = 'button'; pickBtn.innerHTML = '<b>☑ Выбрать игры</b><small>отметь несколько и пройди подряд</small>';
  bar.append(allBtn, pickBtn);
  launcher.querySelector('.mode-heading')?.after(bar);
  const headP = launcher.querySelector('.mode-heading p'); if (headP) headP.textContent = 'Нажми на игру, чтобы начать, — или пройди несколько игр подряд.';
  const pickBar = el('div', 'route-pickbar'); pickBar.hidden = true;
  const pickInfo = el('span', null, ''); const pickGo = el('button', 'btn', 'Начать'); pickGo.type = 'button'; const pickCancel = el('button', 'btn secondary', 'Отмена'); pickCancel.type = 'button';
  pickBar.append(pickInfo, pickCancel, pickGo); document.body.append(pickBar);
  function setPicking(on) {
    picking = on; picked.clear(); launcher.classList.toggle('picking', on); pickBar.hidden = !on;
    modeButtons().forEach(b => { b.classList.remove('picked'); if (on) b.setAttribute('aria-pressed', 'false'); else b.removeAttribute('aria-pressed'); });
    pickBtn.classList.toggle('active', on); paintPick();
  }
  function paintPick() { const n = picked.size; pickInfo.textContent = n ? 'Выбрано игр: ' + n : 'Отметь игры'; pickGo.disabled = !n; pickGo.textContent = n ? 'Начать (' + n + ') →' : 'Начать'; }
  pickBtn.onclick = () => setPicking(!picking);
  pickCancel.onclick = () => setPicking(false);
  pickGo.onclick = () => { const order = modeButtons().map(b => b.dataset.mode).filter(m => picked.has(m)); setPicking(false); beginRoute(order); };
  allBtn.onclick = () => beginRoute(modeButtons().map(b => b.dataset.mode));
  // capture clicks on game cards: picking mode toggles, the final test opens its settings
  launcher.addEventListener('click', e => {
    const b = e.target.closest('.mode[data-mode]'); if (!b || !launcher.contains(b)) return;
    if (picking && b.closest('.mode-stage')) { e.preventDefault(); e.stopImmediatePropagation(); const m = b.dataset.mode; picked.has(m) ? picked.delete(m) : picked.add(m); b.classList.toggle('picked', picked.has(m)); b.setAttribute('aria-pressed', String(picked.has(m))); paintPick(); return; }
    if (b.dataset.mode === 'boss') { e.preventDefault(); e.stopImmediatePropagation(); clearRoute(); bossDialog(t => start('boss', null, t)); return; }
    clearRoute();
  }, true);
  $('quickStart')?.addEventListener('click', () => clearRoute(), true);

  function clearRoute() { try { sessionStorage.removeItem(ROUTE_KEY); } catch { /* */ } }
  function saveRoute(r) { try { sessionStorage.setItem(ROUTE_KEY, JSON.stringify(r)); } catch { /* */ } }
  // the route lives in sessionStorage: it belongs to this tab only
  function readRoute() { try { const r = JSON.parse(sessionStorage.getItem(ROUTE_KEY) || 'null'); return r && r.key === lessonKey() && Array.isArray(r.modes) ? r : null; } catch { return null; } }
  function beginRoute(modes) {
    if (!modes.length) return;
    if (!selectedWords().length) { alert('Сначала выбери хотя бы одно слово.'); return; }
    saveRoute({ key: lessonKey(), modes, i: 0 });
    runStep();
  }
  function runStep() {
    const r = readRoute(); if (!r) return;
    const mode = r.modes[r.i];
    if (!mode) { clearRoute(); return; }
    const launchIt = types => { start(mode, null, types); if (!game) { // not enough words for this game: skip it
        r.i++; saveRoute(r); if (r.i < r.modes.length) { toast('Игру «' + MODE_NAMES[mode] + '» пропускаем: для неё мало подходящих слов.', 'think'); setTimeout(runStep, 300); } else clearRoute(); } };
    if (mode === 'boss') bossDialog(launchIt); else launchIt(undefined);
  }
  function routeBanner() {
    const r = readRoute(); const g = $('game'); g?.querySelector('.route-banner')?.remove();
    if (!r || !game || r.modes[r.i] !== game.mode) return;
    const steps = el('ol', 'route-steps'); r.modes.forEach((m, k) => { const li = el('li', k < r.i ? 'done' : k === r.i ? 'now' : '', MODE_NAMES[m]); steps.append(li); });
    const box = el('div', 'route-banner'); box.append(el('b', null, 'Маршрут · игра ' + (r.i + 1) + ' из ' + r.modes.length), steps);
    g.querySelector('#counter')?.after(box);
  }
  // after a finished game in a route: offer the next one
  new MutationObserver(() => {
    const card = document.querySelector('#play .lesson-result, #play .pair-finish');
    if (!card || card.dataset.route) { if (!card) routeBanner(); return; }
    card.dataset.route = '1';
    const r = readRoute(); if (!r || !game || r.modes[r.i] !== game.mode) return;
    const box = el('div', 'route-next');
    if (r.i + 1 < r.modes.length) {
      const next = r.modes[r.i + 1];
      const b = el('button', 'btn good', 'Дальше: ' + MODE_NAMES[next] + ' →'); b.type = 'button'; b.onclick = () => { r.i++; saveRoute(r); runStep(); };
      const stopBtn = el('button', 'btn secondary', 'Закончить маршрут'); stopBtn.type = 'button'; stopBtn.onclick = () => { clearRoute(); box.remove(); };
      box.append(el('p', null, 'Маршрут: пройдено ' + (r.i + 1) + ' из ' + r.modes.length), b, stopBtn);
    } else { box.append(el('p', 'route-finished', '🏁 Маршрут пройден! Все выбранные игры позади.')); clearRoute(); }
    card.append(box);
  }).observe($('play'), { childList: true, subtree: true });

  /* ---------- 5. honest storage notes ---------- */
  function storageNotes() {
    const signed = !!(window.LexigoAccountHint && window.LexigoAccountHint.uid());
    const note = launcher.querySelector('.progress-note');
    if (note) note.textContent = signed ? '*Прогресс сохраняется в твоём аккаунте — продолжай на любом устройстве.' : '*Прогресс сохраняется на этом устройстве. Войди в аккаунт, чтобы он был доступен везде.';
    const rep = document.querySelector('#teacherPage .report');
    if (rep) { const h = rep.querySelector('h3'), p = rep.querySelector('p'); if (h) h.textContent = 'Результаты практики'; if (p) p.textContent = signed ? 'Слова с ошибками и даты повторения из вашего прогресса. Результаты учеников — в кабинете учителя.' : 'Слова с ошибками и даты повторения по данным этого устройства. Результаты учеников — в кабинете учителя после входа.'; }
  }
  storageNotes();
  window.addEventListener('lexigo:account', storageNotes);
  window.LexigoPlus = Object.freeze({ bossTypes, notice, route: readRoute });
  // the first lesson may already be open (the page was loaded with a lesson link): restore its saved choice now
  try { if (typeof book !== 'undefined' && book && scope.length) { restoring = true; restoreSelection(); } } finally { restoring = false; }
  refreshSelectionUI();
})();
