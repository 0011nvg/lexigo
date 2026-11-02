/* LEXI — «Кристальная экспедиция» v2: экран игры (2026-11-02).
 * Правила — crystal-engine.js. Здесь: карта уровней, поле (перетаскивание, касания, клавиатура), анимации,
 * «Энергия Лекси» и задания со словами модуля или урока учителя, пауза, итоги, рекорды и рейтинг.
 *
 * Слова: собранные кристаллы заряжают «Энергию Лекси». Когда шкала полна (и только между ходами),
 * появляется карточка со словом урока. Верно — +1 ход, +150 очков и особый кристалл; ошибка без штрафа:
 * показываем правильный ответ, слово вернётся позже в более простом задании. Ответы записываются как в
 * остальных играх (прогресс слов, XP на сервере, задания учителя).
 * Рекорды: на устройстве (у вошедшего — отдельно для аккаунта) и в рейтинге LEXI (supabase: crystal_*).
 * У всех игроков в один день одинаковое поле уровня («Экспедиция дня») — рейтинг честный. */
(() => {
  'use strict';
  const E = window.LexiCrystalEngine; if (!E) return;
  const $ = id => document.getElementById(id);
  const Hint = window.LexigoAccountHint;
  const C = window.LexigoCloud;
  const S = () => window.LexigoCloudSession;
  /* игра может открыться по ссылке раньше, чем загрузится cloud.js: дожидаемся его (до 10 с), затем сессии */
  async function cloud() {
    for (let k = 0; k < 100 && !S(); k++) await new Promise(r => setTimeout(r, 100));
    return S() ? S().ready : null;
  }
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = String(text); return n; }
  function btn(text, cls, onclick) { const b = el('button', cls || 'btn', text); b.type = 'button'; if (onclick) b.addEventListener('click', onclick); return b; }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const fmt = n => Number(n || 0).toLocaleString('ru-RU');
  const today = () => (C && C.localDay) ? C.localDay() : new Date().toISOString().slice(0, 10);
  const ruN = (n, a, b, c) => { const m = Math.abs(n) % 100, d = m % 10; return n + ' ' + (m > 10 && m < 20 ? c : d === 1 ? a : d > 1 && d < 5 ? b : c); };
  const isPreview = g => !!(g && g.cloud && g.cloud.meta && g.cloud.meta.preview);
  const signedIn = () => !!(Hint && Hint.uid());

  /* ---------- хранилище: рекорды и настройки на устройстве (у вошедшего — отдельно для аккаунта) ---------- */
  const KEY = () => 'lexigo_crystal_v2' + (signedIn() ? ':' + Hint.uid() : '');
  function sanitize(x) {
    const out = { prefs: { muted: false, calm: false }, levels: {} };
    if (x && typeof x === 'object') {
      if (x.prefs && typeof x.prefs === 'object') { out.prefs.muted = x.prefs.muted === true; out.prefs.calm = x.prefs.calm === true; }
      for (const L of E.LEVELS) {
        const r = x.levels && x.levels[L.id]; if (!r || typeof r !== 'object') continue;
        const int = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
        out.levels[L.id] = { best: int(r.best, 1e7), stars: int(r.stars, 3), wins: int(r.wins, 1e6), plays: int(r.plays, 1e6), rating: int(r.rating, 1e5) };
      }
    }
    return out;
  }
  let data = sanitize(null);
  const loadData = () => { try { data = sanitize(JSON.parse(localStorage.getItem(KEY()) || 'null')); } catch { data = sanitize(null); } return data; };
  const persist = () => { try { localStorage.setItem(KEY(), JSON.stringify(data)); } catch { /* full or private */ } };
  const lvl = id => (data.levels[id] = data.levels[id] || { best: 0, stars: 0, wins: 0, plays: 0, rating: 0 });
  const reduced = () => data.prefs.calm || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const unlocked = id => id === 1 || isPreview(G && G.game) || (data.levels[id - 1] && data.levels[id - 1].wins > 0);

  /* ---------- звук: короткие синтезированные сигналы, без файлов ---------- */
  let audio = null;
  function sound(kind, level = 1) {
    if (data.prefs.muted) return;
    try {
      const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
      if (!audio || audio.state === 'closed') audio = new A(); if (audio.state === 'suspended') audio.resume();
      const notes = { swap: [330], bad: [240, 200], match: [523, 659, 784], special: [784, 988, 1175], word: [660, 880, 1046], win: [523, 659, 784, 1047], soft: [392, 349] }[kind] || [440];
      const now = audio.currentTime, up = Math.min(level - 1, 6) * 45;
      notes.forEach((hz, i) => {
        const o = audio.createOscillator(), g = audio.createGain(), t = now + i * (kind === 'win' ? 0.11 : 0.07);
        o.type = kind === 'swap' ? 'sine' : 'triangle'; o.frequency.setValueAtTime(hz + up, t);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(kind === 'swap' ? 0.04 : 0.08, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
        o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + 0.27);
      });
    } catch { /* звук необязателен */ }
  }

  /* ---------- кристаллы: свои фигуры для каждого цвета (различимы и без цвета) ---------- */
  const GEMS = [
    ['#7fb4ff', '#2f6bff', '#163c9e', '<polygon points="50,6 89,28 89,72 50,94 11,72 11,28"/>', '<path d="M50 6V40L89 28M50 40L11 28"/><polygon points="50,40 70,52 50,64 30,52" opacity=".35" fill="#fff"/>'],
    ['#d5a8ff', '#8b3cf0', '#4c1593', '<polygon points="50,4 86,50 50,96 14,50"/>', '<polyline points="14,50 50,40 86,50"/><polyline points="50,4 50,40"/>'],
    ['#8ff0b1', '#16b062', '#0b6337', '<polygon points="31,8 69,8 92,31 92,69 69,92 31,92 8,69 8,31"/>', '<rect x="30" y="30" width="40" height="40" rx="4" opacity=".3" fill="#fff"/>'],
    ['#ff9a9a', '#ec2f45', '#8e0f22', '<path d="M50 90C22 70 8 54 8 34C8 18 20 9 32 9C41 9 47 14 50 21C53 14 59 9 68 9C80 9 92 18 92 34C92 54 78 70 50 90Z"/>', '<path d="M30 30C30 22 36 18 42 20" stroke-width="6" opacity=".7"/>'],
    ['#ffe58a', '#f5b20a', '#9a5d00', '<circle cx="50" cy="50" r="42"/>', '<polygon points="50,20 58,42 80,42 62,56 69,78 50,64 31,78 38,56 20,42 42,42" opacity=".35" fill="#fff"/>'],
    ['#9ff4f2', '#14b8c4', '#08626b', '<path d="M50 8L93 86Q95 92 88 92H12Q5 92 7 86Z"/>', '<path d="M50 8V62L93 86M50 62L7 86"/>']
  ];
  function sprite() {
    if ($('cqSprite')) return;
    const defs = GEMS.map(([lite, mid, dark, shape, facets], c) => `<linearGradient id="cqg${c}" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${lite}"/><stop offset=".55" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
      <symbol id="cq-gem${c}" viewBox="0 0 100 100"><g fill="url(#cqg${c})" stroke="${dark}" stroke-width="3" stroke-linejoin="round">${shape}</g><g fill="none" stroke="#fff" stroke-width="2.4" stroke-opacity=".55" stroke-linecap="round">${facets}</g><ellipse cx="36" cy="28" rx="12" ry="7" fill="#fff" opacity=".55" transform="rotate(-25 36 28)"/></symbol>`).join('');
    const prism = `<radialGradient id="cqpr" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#ffe9a8"/><stop offset=".65" stop-color="#ff7ad9"/><stop offset="1" stop-color="#5b3fe0"/></radialGradient>
      <symbol id="cq-prism" viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="url(#cqpr)" stroke="#3b2a9e" stroke-width="3"/><g stroke-width="7" stroke-linecap="round" fill="none" opacity=".9"><path d="M22 62a30 30 0 0 1 56 0" stroke="#ff5a6e"/><path d="M30 64a21 21 0 0 1 40 0" stroke="#ffc83a"/><path d="M38 66a12 12 0 0 1 24 0" stroke="#2fd18a"/></g><polygon points="50,14 55,28 70,28 58,37 62,51 50,42 38,51 42,37 30,28 45,28" fill="#fff"/></symbol>`;
    const holder = document.createElement('div'); holder.id = 'cqSprite'; holder.setAttribute('aria-hidden', 'true'); holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    holder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg"><defs>${defs}${prism}</defs></svg>`;
    document.body.append(holder);
  }
  const gemSVG = c => `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><use href="#${c < 0 ? 'cq-prism' : 'cq-gem' + c}"/></svg>`;
  const SPECIAL_NAME = { row: 'линия ↔', col: 'линия ↕', bomb: 'бомба', prism: 'призма' };
  const gemLabel = p => p.s === 'prism' ? 'призма' : E.COLORS[p.c] + (p.s ? ', ' + SPECIAL_NAME[p.s] : '');

  /* ---------- состояние игры ---------- */
  let G = null, adapter = null;
  const T = () => reduced() ? { swap: 40, pop: 60, fall: 60, flash: 40, back: 40 } : { swap: 170, pop: 300, fall: 300, flash: 260, back: 170 };

  function begin(game) {
    loadData(); sprite();
    G = { game, queue: [], wordCount: 0, answers: [], st: null, busy: false, sel: null, focus: 0, tiles: new Map(), view: [], hintTimer: 0, run: null };
    G.queue = game.words.map(w => ({ w }));
    game.crystals = 0; game.crystalPoints = 0;
    if (!adapter && window.LexigoLocalGameAdapter) adapter = window.LexigoLocalGameAdapter.create({ getState: () => game_(), shuffle, normalize, audioAvailable, speak, record, renderQuestion: () => {}, answerUI: onAnswer, textAnswerHints });
    flushQueue();
    showMap();
  }
  const game_ = () => G && G.game;
  function end() { if (!G) return; clearTimeout(G.hintTimer); G.dead = true; G = null; }
  const alive = g => G && G === g && !g.dead && game === g.game;

  /* ---------- карта уровней ---------- */
  function showMap() {
    if (!G) return;
    const g = G; g.st = null; clearTimeout(g.hintTimer);
    $('gameTitle').textContent = '💎 Кристальная экспедиция';
    const total = E.LEVELS.reduce((n, L) => n + (data.levels[L.id] ? data.levels[L.id].stars : 0), 0);
    $('counter').textContent = 'Звёзд: ' + total + ' из ' + E.LEVELS.length * 3;
    $('bar').style.width = Math.round(total / (E.LEVELS.length * 3) * 100) + '%';
    const wrap = el('section', 'cq-map'); wrap.setAttribute('aria-labelledby', 'cqMapTitle');
    const head = el('div', 'cq-map-head');
    const img = el('img', 'cq-map-lexi'); img.src = 'assets/lexi-head.webp'; img.alt = '';
    const htext = el('div');
    const h2 = el('h2', null, 'Выбери уровень'); h2.id = 'cqMapTitle'; h2.tabIndex = -1;
    htext.append(h2, el('p', null, 'Собирай кристаллы, заряжай «Энергию Лекси» и отвечай на вопросы по словам — за верный ответ +1 ход. Сегодня у всех игроков одинаковое поле: «Экспедиция дня».'));
    head.append(img, htext);
    const list = el('div', 'cq-levels');
    for (const L of E.LEVELS) {
      const r = data.levels[L.id], open = unlocked(L.id);
      const b = btn('', 'cq-level' + (open ? '' : ' locked') + (r && r.wins ? ' done' : ''), () => { if (!open) { toast('Сначала пройди уровень ' + (L.id - 1) + '.'); return; } startLevel(L.id); });
      b.dataset.level = L.id;
      if (!open) b.setAttribute('aria-disabled', 'true');
      const stars = el('span', 'cq-stars'); stars.setAttribute('aria-label', 'Звёзд: ' + (r ? r.stars : 0) + ' из 3');
      for (let k = 1; k <= 3; k++) stars.append(el('i', r && r.stars >= k ? 'on' : null, '★'));
      b.append(el('span', 'cq-num', open ? L.id : '🔒'),
        el('span', 'cq-level-txt'), stars);
      const t = b.querySelector('.cq-level-txt');
      t.append(el('b', null, L.name), el('small', null, open ? L.intro : 'Откроется после уровня ' + (L.id - 1)),
        el('small', 'cq-level-meta', open ? (r && r.best ? 'Рекорд: ' + fmt(r.best) + ' · ' : '') + ruN(L.moves, 'ход', 'хода', 'ходов') + ' · ' + L.goals.length + ' ' + (L.goals.length < 5 ? 'цели' : 'целей') : ''));
      list.append(b);
    }
    const tools = el('div', 'cq-map-tools');
    tools.append(prefButton('muted'), prefButton('calm'));
    const words = el('p', 'cq-map-words muted tiny', 'Слова для заданий: ' + ruN(G.game.words.length, 'слово', 'слова', 'слов') + (isPreview(G.game) ? ' · тренировка учителя: все уровни открыты, в рейтинг не попадает' : ''));
    const board = el('section', 'cq-rating'); board.setAttribute('aria-labelledby', 'cqRatingTitle');
    wrap.append(head, list, tools, words, board);
    $('play').replaceChildren(wrap);
    h2.focus({ preventScroll: true });
    loadRating(board, g);
  }
  function prefButton(key) {
    const label = () => key === 'muted' ? (data.prefs.muted ? '🔇 Звук выключен' : '🔊 Звук включён') : (data.prefs.calm ? '🌙 Спокойная анимация' : '✨ Яркая анимация');
    const b = btn(label(), 'btn secondary cq-pref', () => { data.prefs[key] = !data.prefs[key]; persist(); b.textContent = label(); b.setAttribute('aria-pressed', String(data.prefs[key])); if (key === 'muted' && !data.prefs.muted) sound('swap'); document.querySelector('.cq-play')?.classList.toggle('calm', reduced()); });
    b.setAttribute('aria-pressed', String(data.prefs[key])); b.dataset.pref = key;
    return b;
  }

  /* ---------- рейтинг (сервер) ---------- */
  async function loadRating(box, g) {
    const title = el('h3', null, '🏆 Рейтинг экспедиции'); title.id = 'cqRatingTitle';
    box.replaceChildren(title, el('p', 'cq-rating-rule muted tiny', 'Очки рейтинга = звёзды (главное) + качество ответов по словам + сэкономленные ходы + очки уровня с разумным пределом. В рейтинг идёт лучший результат каждого уровня.'));
    if (isPreview(g.game)) { box.append(el('p', 'muted', 'Тренировка учителя в рейтинг не попадает.')); return; }
    if (!C || !C.configured || !signedIn()) { const p = el('p', 'muted'); p.append('Чтобы попасть в рейтинг и хранить рекорды на любом устройстве, '); const a = el('a', null, 'войди в аккаунт'); a.href = 'auth.html'; p.append(a, '. Рекорды этого устройства сохраняются и так.'); box.append(p); return; }
    const session = await cloud(); if (!session || !alive(g) || g.st) return;
    try {
      const [{ data: top, error: e1 }, { data: mine, error: e2 }] = await Promise.all([session.sb.rpc('crystal_top'), session.sb.rpc('crystal_my')]);
      if (e1 || e2) throw e1 || e2;
      if (!alive(g) || g.st) return;
      // лучшие результаты с сервера открывают уровни и на новом устройстве
      for (const r of mine && mine.levels || []) { const l = lvl(r.level); l.best = Math.max(l.best, r.best_score || 0); l.stars = Math.max(l.stars, r.stars || 0); l.wins = Math.max(l.wins, r.wins || 0); l.rating = Math.max(l.rating, r.rating || 0); }
      persist();
      const ol = el('ol', 'cq-top');
      (top || []).forEach(r => { const li = el('li', r.mine ? 'mine' : null); li.append(el('span', 'cq-place', ['🥇', '🥈', '🥉'][r.place - 1] || r.place), el('b', null, r.name), el('span', 'cq-top-stars', '★ ' + r.stars), el('span', 'cq-top-pts', fmt(r.rating))); ol.append(li); });
      if (!(top || []).length) ol.append(el('li', 'empty', 'Пока никого нет — стань первым!'));
      box.append(ol);
      const me = el('p', 'cq-me');
      me.append(mine && mine.rating ? 'Твой рейтинг: ' + fmt(mine.rating) + (mine.place ? ' · место ' + mine.place : '') : 'Пройди уровень — и появишься в рейтинге.');
      box.append(me, nameForm(session.sb, mine && mine.name, box, g));
      // карта могла обновиться (звёзды, открытые уровни)
      const marks = document.querySelectorAll('.cq-level'); if (marks.length) refreshLevels();
    } catch (e) { console.warn('LEXI crystals rating', e); box.append(el('p', 'muted', 'Рейтинг сейчас недоступен. Рекорды сохранены на этом устройстве.')); }
  }
  function refreshLevels() {
    for (const b of document.querySelectorAll('.cq-level')) {
      const id = Number(b.dataset.level), r = data.levels[id];
      if (unlocked(id) && b.classList.contains('locked')) { /* перерисуем карту целиком */ showMap(); return; }
      if (r) b.querySelectorAll('.cq-stars i').forEach((s, k) => s.classList.toggle('on', r.stars > k));
    }
  }
  function nameForm(sb, current, box, g) {
    const form = el('form', 'cq-name');
    const input = el('input'); input.maxLength = 20; input.value = current || ''; input.placeholder = 'Ник для рейтинга'; input.setAttribute('aria-label', 'Ник для рейтинга'); input.autocomplete = 'off';
    const msg = el('small', 'muted', current ? 'В рейтинге тебя видят под этим ником.' : 'Придумай ник: 2–20 символов. Фамилию писать не нужно — пока ника нет, ты «Исследователь».');
    form.append(input, btn(current ? 'Сменить' : 'Сохранить', 'btn secondary'), msg);
    form.querySelector('button').type = 'submit';
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const name = input.value.trim().replace(/\s+/g, ' ');
      if (!/^[A-Za-zА-Яа-яЁё0-9 ._-]{2,20}$/.test(name)) { msg.textContent = 'Ник: от 2 до 20 символов — буквы, цифры, пробел, точка, дефис.'; input.focus(); return; }
      const { data: r, error } = await sb.rpc('crystal_set_name', { p_name: name });
      if (error || !r || !r.ok) { msg.textContent = 'Не получилось сохранить ник. Попробуй ещё раз.'; return; }
      msg.textContent = '✓ Ник сохранён.'; if (alive(g) && !g.st) loadRating(box, g);
    });
    return form;
  }
  /* результаты, не дошедшие до сервера (нет связи), отправляются позже; повторная отправка безопасна */
  const QKEY = 'lexigo_crystal_queue';
  async function flushQueue() {
    if (!signedIn()) return;
    let q; try { q = JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch { q = []; }
    if (!Array.isArray(q) || !q.length) return;
    const session = await cloud(); if (!session) return;
    const left = [];
    for (const p of q.slice(-20)) { try { const { error } = await session.sb.rpc('crystal_finish', { p }); if (error && /fetch|network/i.test(error.message || '')) left.push(p); } catch { left.push(p); } }
    try { localStorage.setItem(QKEY, JSON.stringify(left)); } catch { /* */ }
  }
  window.addEventListener('online', flushQueue);

  /* ---------- уровень ---------- */
  function startLevel(id) {
    if (!G || !unlocked(id)) return;
    const g = G, L = E.level(id);
    clearTimeout(g.hintTimer);
    g.level = L; g.st = E.create(id, E.dailySeed(id, today())); g.busy = false; g.sel = null; g.focus = 0; g.tiles = new Map(); g.view = []; g.answers = [];
    g.shown = { score: 0, energy: 0 };
    g.run = { id: null, day: today(), t0: Date.now() };
    lvl(id).plays++; persist();
    renderPlay();
    say(L.intro, 3200);
    if (signedIn() && !isPreview(g.game)) cloud().then(session => session && session.sb.rpc('crystal_start', { p_level: id, p_day: g.run.day })).then(r => { if (r && !r.error && r.data && r.data.ok && alive(g)) g.run.id = r.data.run_id; }).catch(() => { /* рейтинг без связи недоступен — игра продолжается */ });
  }
  function renderPlay() {
    const g = G, st = g.st, L = g.level;
    $('gameTitle').textContent = '💎 ' + L.id + '. ' + L.name;
    const play = el('div', 'cq-play' + (reduced() ? ' calm' : ''));
    play.innerHTML = `<div class="cq-hud">
        <div class="cq-moves" aria-live="polite"><b id="cqMoves"></b><small>ходов</small></div>
        <div class="cq-scorebox"><div class="cq-score-top"><b id="cqScore">0</b><small>очков</small></div><div class="cq-starbar" aria-hidden="true"><i id="cqStarFill"></i></div></div>
        <div class="cq-energy" title="Энергия Лекси: собирай кристаллы — получишь задание со словом"><img src="assets/lexi-head.webp" alt=""><div><small>Энергия Лекси</small><div class="cq-energy-bar"><i id="cqEnergy"></i></div></div></div>
      </div>
      <ul class="cq-goals" id="cqGoals" aria-label="Цели уровня"></ul>
      <div class="cq-stage"><div class="cq-board" id="cqBoard" role="group" tabindex="0"></div><div class="cq-fx" id="cqFx" aria-hidden="true"></div><p class="cq-toast" id="cqToast" role="status" aria-live="polite"></p></div>
      <p class="cq-help muted tiny">Проведи кристалл к соседнему или нажми два соседних кристалла. С клавиатуры: стрелки — выбрать, Enter — взять кристалл, стрелка — поменять.</p>
      <div class="cq-tools"></div>`;
    const marks = play.querySelector('.cq-starbar');
    L.stars.forEach((s, k) => { const m = el('span', 'cq-starmark', '★'); m.style.left = Math.min(98, s / L.stars[2] * 92) + '%'; m.dataset.k = k; marks.append(m); });
    play.querySelector('.cq-tools').append(btn('⏸ Пауза', 'btn secondary', pause), prefButton('muted'), prefButton('calm'));
    $('play').replaceChildren(play);
    const board = $('cqBoard');
    board.style.setProperty('--n', st.size);
    board.setAttribute('aria-label', 'Поле кристаллов ' + st.size + ' на ' + st.size + '. Ходов: ' + st.moves);
    for (let i = 0; i < st.n; i++) { const c = el('span', 'cq-ice'); c.dataset.i = i; place(c, i); board.append(c); }
    syncIce(st.ice);
    sync(st.cells, { instant: true });
    bindInput(board);
    hud();
    board.focus({ preventScroll: true });
    play.querySelector('.cq-hud').scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
    hintLater();
  }
  /* позиции плиток: CSS-переменные --x/--y, анимация через transform */
  function place(node, i) { const [x, y] = E.xy(G.st, i); node.style.setProperty('--x', x); node.style.setProperty('--y', y); }
  function syncIce(ice) { document.querySelectorAll('#cqBoard .cq-ice').forEach(c => { const n = ice[Number(c.dataset.i)] || 0; c.dataset.layers = n; c.classList.toggle('on', n > 0); }); }
  function tileFor(p) {
    let t = G.tiles.get(p.id);
    if (!t) { t = el('button', 'cq-gem'); t.type = 'button'; t.tabIndex = -1; t.dataset.id = p.id; G.tiles.set(p.id, t); $('cqBoard').append(t); }
    const key = p.c + '|' + p.s;
    if (t.dataset.key !== key) { t.dataset.key = key; t.innerHTML = gemSVG(p.s === 'prism' ? -1 : p.c); t.className = 'cq-gem c' + p.c + (p.s ? ' s-' + p.s : ''); }
    return t;
  }
  function sync(cells, opts = {}) {
    const seen = new Set();
    cells.forEach((p, i) => {
      if (!p) return; seen.add(p.id);
      const t = tileFor(p);
      const fresh = !t.dataset.i;
      if (fresh && opts.drop && opts.drop.has(p.id) && !reduced()) {   // новый кристалл появляется над полем
        t.classList.add('no-anim'); const [x, y] = E.xy(G.st, i); t.style.setProperty('--x', x); t.style.setProperty('--y', y - opts.drop.get(p.id)); void t.offsetWidth; t.classList.remove('no-anim');
      } else if (fresh || opts.instant) t.classList.add('no-anim');
      t.dataset.i = i; place(t, i);
      t.setAttribute('aria-label', gemLabel(p) + ', строка ' + (Math.floor(i / G.st.size) + 1) + ', столбец ' + (i % G.st.size + 1));
      if (fresh || opts.instant) requestAnimationFrame(() => t.classList.remove('no-anim'));
    });
    for (const [id, t] of G.tiles) if (!seen.has(id)) { t.remove(); G.tiles.delete(id); }
    G.view = cells;
    markSelection();
  }
  const tileAt = i => { const p = G.view[i]; return p ? G.tiles.get(p.id) : null; };
  function markSelection() {
    document.querySelectorAll('#cqBoard .cq-gem.sel, #cqBoard .cq-gem.kbd').forEach(t => t.classList.remove('sel', 'kbd'));
    if (G.sel != null) tileAt(G.sel)?.classList.add('sel');
    if (G.kbd) tileAt(G.focus)?.classList.add('kbd');
  }

  /* ---------- ввод: перетаскивание, касания, клавиатура ---------- */
  function bindInput(board) {
    let start = null;
    board.addEventListener('pointerdown', e => {
      const t = e.target.closest('.cq-gem'); if (!t || G.busy) return;
      start = { i: Number(t.dataset.i), x: e.clientX, y: e.clientY, moved: false };
      try { board.setPointerCapture(e.pointerId); } catch { /* */ }
      G.kbd = false;
    });
    board.addEventListener('pointermove', e => {
      if (!start || start.moved || G.busy) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y, size = board.getBoundingClientRect().width / G.st.size;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < size * 0.35) return;
      start.moved = true;
      const [x, y] = E.xy(G.st, start.i), tx = x + (Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) : 0), ty = y + (Math.abs(dx) > Math.abs(dy) ? 0 : Math.sign(dy));
      if (tx < 0 || ty < 0 || tx >= G.st.size || ty >= G.st.size) return;
      G.sel = null; attempt(start.i, ty * G.st.size + tx);
    });
    const up = () => { if (start && !start.moved) tap(start.i); start = null; };
    board.addEventListener('pointerup', up);
    board.addEventListener('pointercancel', () => { start = null; });
    board.addEventListener('keydown', e => {
      const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (dirs[e.key]) {
        e.preventDefault(); G.kbd = true;
        const [x, y] = E.xy(G.st, G.sel != null ? G.sel : G.focus), [dx, dy] = dirs[e.key], nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= G.st.size || ny >= G.st.size) return;
        const to = ny * G.st.size + nx;
        if (G.sel != null) { const from = G.sel; G.sel = null; G.focus = to; attempt(from, to); }
        else { G.focus = to; markSelection(); announce(gemLabel(G.view[to])); }
      } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); G.kbd = true; tap(G.focus); }
      else if (e.key === 'Escape') { G.sel = null; markSelection(); }
    });
  }
  function tap(i) {
    if (!G || G.busy || !G.st || G.st.finished) return;
    clearHint(); G.focus = i;
    if (G.sel == null) { G.sel = i; markSelection(); sound('swap'); return; }
    if (G.sel === i) { G.sel = null; markSelection(); return; }
    if (E.neighbors(G.st, G.sel, i)) { const a = G.sel; G.sel = null; attempt(a, i); return; }
    G.sel = i; markSelection();
  }
  async function attempt(a, b) {
    const g = G; if (!g || g.busy || !g.st || g.st.finished || g.st.over) return;
    if (!E.neighbors(g.st, a, b)) return;
    clearHint(); g.busy = true; markSelection();
    const res = E.swap(g.st, a, b);
    if (!res.ok) {
      const ta = tileAt(a), tb = tileAt(b);
      if (ta && tb) { place(ta, b); place(tb, a); await wait(T().back); if (!alive(g)) return; place(ta, a); place(tb, b); }
      sound('bad'); g.bad = (g.bad || 0) + 1;
      if (g.bad <= 2) say('Нужно собрать три одинаковых в ряд — кристаллы вернулись, ход не потрачен.', 2600);
      await wait(T().back); if (!alive(g)) return;
      g.busy = false; hintLater(); return;
    }
    await runSteps(res.steps, g); if (!alive(g)) return;
    await afterMove(g);
  }

  /* ---------- проигрывание шагов движка ---------- */
  async function runSteps(steps, g) {
    for (const s of steps) {
      if (!alive(g)) return;
      if (s.t === 'swap') { sync(s.cells); sound('swap'); await wait(T().swap); }
      else if (s.t === 'transform' || s.t === 'reward') { sync(s.cells); const t = s.i != null ? tileAt(s.i) : null; if (t) { t.classList.add('born'); setTimeout(() => t.classList.remove('born'), 600); } sound('special'); await wait(T().flash); }
      else if (s.t === 'clear') {
        const prev = G.view, fx = $('cqFx');
        for (const i of s.fired) beam(i, prev[i]);
        let cx = 0, cy = 0;
        for (const i of s.cleared) { const t = tileAt(i); if (t) { t.classList.add('pop'); if (!reduced()) burst(i, prev[i]); } const [x, y] = E.xy(G.st, i); cx += x; cy += y; }
        if (s.cleared.length) floatText('+' + fmt(s.points), cx / s.cleared.length, cy / s.cleared.length, s.chain);
        if (s.chain >= 2) say('Цепочка ×' + s.chain + '!', 1200);
        if (s.created.length) say(s.created.map(i => SPECIAL_NAME[s.cells[i].s]).map(n => 'Особый кристалл: ' + n + '!').join(' '), 1600);
        sound(s.fired.length ? 'special' : 'match', s.chain);
        syncIce(s.iceMap);
        g.shown.score += s.points; g.shown.energy += s.cleared.length; hud(true);
        await wait(T().pop); if (!alive(g)) return;
        sync(s.cells);
        for (const i of s.created) { const t = tileAt(i); if (t) { t.classList.add('born'); setTimeout(() => t.classList.remove('born'), 600); } }
        fx && fx.childElementCount > 40 && fx.replaceChildren();
      } else if (s.t === 'fall') {
        sync(s.cells, { drop: new Map(s.spawned.map(x => [x.id, x.drop])) });
        const far = Math.max(1, ...s.spawned.map(x => x.drop));
        await wait(T().fall + (reduced() ? 0 : far * 25));
      } else if (s.t === 'shuffle') {
        say('Ходов не осталось — Лекси перемешал поле. Ход не потрачен!', 2600);
        sync(s.cells); await wait(reduced() ? 60 : 500);
      }
    }
    if (alive(g)) { g.shown.score = g.st.score; g.shown.energy = g.st.energy; hud(); }
  }
  function cellCenter(i) { const [x, y] = E.xy(G.st, i); return [(x + 0.5) / G.st.size * 100, (y + 0.5) / G.st.size * 100]; }
  function burst(i, p) {
    const fx = $('cqFx'); if (!fx || !p) return;
    const [x, y] = cellCenter(i), b = el('span', 'cq-burst c' + (p.c < 0 ? 'p' : p.c));
    b.style.left = x + '%'; b.style.top = y + '%';
    for (let k = 0; k < 6; k++) { const s = el('i'); s.style.setProperty('--a', (k * 60 + (i * 17) % 60) + 'deg'); b.append(s); }
    fx.append(b); setTimeout(() => b.remove(), 650);
  }
  function beam(i, p) {
    const fx = $('cqFx'); if (!fx || !p || !p.s) return;
    const [x, y] = cellCenter(i), b = el('span', 'cq-beam ' + p.s);
    b.style.left = x + '%'; b.style.top = y + '%'; b.style.setProperty('--n', G.st.size);
    fx.append(b); setTimeout(() => b.remove(), reduced() ? 120 : 520);
  }
  function floatText(text, x, y, chain) {
    const fx = $('cqFx'); if (!fx) return;
    const t = el('span', 'cq-float' + (chain > 1 ? ' chain' : ''), text);
    t.style.left = ((x + 0.5) / G.st.size * 100) + '%'; t.style.top = ((y + 0.5) / G.st.size * 100) + '%';
    fx.append(t); setTimeout(() => t.remove(), reduced() ? 300 : 900);
  }
  let toastTimer = 0;
  function say(text, ms = 2000) { const t = $('cqToast'); if (!t) return; t.textContent = text; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), ms); }
  const toast = text => { try { window.LexiQuest ? window.LexiQuest.toast(text, 'think') : say(text); } catch { say(text); } };
  function announce(text) { const t = $('cqToast'); if (t) { t.textContent = text; } }

  /* ---------- HUD: ходы, очки и звёзды, энергия, цели ---------- */
  function hud(partial) {
    const g = G; if (!g || !g.st) return;
    const st = g.st, L = g.level, score = partial ? g.shown.score : st.score, energy = partial ? g.shown.energy : st.energy;
    const m = $('cqMoves'); if (m) { m.textContent = st.moves; m.parentElement.classList.toggle('low', st.moves <= 5); }
    const s = $('cqScore'); if (s) s.textContent = fmt(score);
    const f = $('cqStarFill'); if (f) f.style.width = Math.min(100, score / L.stars[2] * 92) + '%';
    document.querySelectorAll('.cq-starmark').forEach(mk => mk.classList.toggle('on', score >= L.stars[Number(mk.dataset.k)]));
    const en = $('cqEnergy'); if (en) { en.style.width = Math.min(100, energy / st.energyNeed * 100) + '%'; en.parentElement.classList.toggle('full', energy >= st.energyNeed); }
    const list = $('cqGoals');
    if (list) {
      list.replaceChildren(...E.goals(st).map(x => {
        const li = el('li', 'cq-goal ' + x.type + (x.done ? ' done' : ''));
        const ico = el('span', 'cq-goal-ico');
        if (x.type === 'collect') ico.innerHTML = gemSVG(x.color); else ico.textContent = { score: '⭐', words: '📖', special: '✦', bomb: '💣', cascade: '⛓', ice: '❄' }[x.type] || '•';
        li.append(ico, el('span', 'cq-goal-txt', x.label), el('b', null, x.done ? '✓' : (x.type === 'score' ? fmt(x.have) + ' / ' + fmt(x.need) : x.have + ' / ' + x.need)));
        return li;
      }));
    }
    const board = $('cqBoard'); if (board) board.setAttribute('aria-label', 'Поле кристаллов ' + st.size + ' на ' + st.size + '. Ходов: ' + st.moves + '. Очков: ' + st.score);
    $('counter').textContent = 'Ходов: ' + st.moves + ' · очков: ' + fmt(st.score);
    $('bar').style.width = Math.round(st.movesUsed / Math.max(1, st.movesUsed + st.moves) * 100) + '%';
  }
  /* подсказка, если ученик долго думает */
  function clearHint() { if (!G) return; clearTimeout(G.hintTimer); document.querySelectorAll('#cqBoard .hint').forEach(t => t.classList.remove('hint')); }
  function hintLater() {
    if (!G) return; const g = G; clearTimeout(g.hintTimer);
    g.hintTimer = setTimeout(() => { if (!alive(g) || g.busy || !g.st || g.st.over) return; const mv = E.findMove(g.st); if (mv) mv.forEach(i => tileAt(i)?.classList.add('hint')); }, 7000);
  }

  /* ---------- после хода: слова → цели → конец ходов ---------- */
  async function afterMove(g) {
    if (alive(g) && E.takeEnergy(g.st)) { hud(); await askWord(g); }
    if (!alive(g)) return;
    if (E.goalsMet(g.st)) return finishLevel(g);
    if (g.st.moves <= 0) return finishLevel(g);
    g.busy = false; hintLater();
    if (g.st.moves === 3) say('Осталось 3 хода!', 1800);
  }

  /* ---------- задания со словами ---------- */
  const TYPES = { 1: ['quiz', 'truefalse'], 2: ['quiz', 'fix', 'truefalse'], 3: ['quiz', 'builder', 'fix', 'truefalse'], 4: ['builder', 'quiz', 'fix', 'truefalse'], 5: ['builder', 'spell', 'fix', 'quiz'] };
  function nextWord(g) {
    if (!g.queue.length) g.queue = shuffle(g.game.words).map(w => ({ w }));
    const item = g.queue.shift();
    let type = item.retry ? 'quiz' : TYPES[g.level.id][g.wordCount % TYPES[g.level.id].length];
    if (type === 'builder' && !(window.LexiWordBuilder && window.LexiWordBuilder.isBuilderWord(item.w))) type = 'quiz';
    if (['quiz', 'truefalse'].includes(type) && g.game.words.length < 2 && !findBook(item.w)) type = 'spell';
    g.wordCount++;
    return { ...item, type };
  }
  const findBook = w => window.LEXIGO_DATA && window.LEXIGO_DATA.books.some(b => b.sections.some(s => s.words.some(x => x.id === w.id)));
  function askWord(g) {
    return new Promise(resolve => {
      const item = nextWord(g), game = g.game;
      game.answered = false; game.hinted = false; game.activeQuestionMode = item.type; game.retryActive = !!item.retry;
      const stage = document.getElementById('play'); if (!stage || !document.querySelector('.cq-stage')) return resolve();
      const box = el('div', 'cq-word'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'cqWordTitle');
      const card = el('div', 'cq-word-card');
      const head = el('div', 'cq-word-head'); const img = el('img'); img.src = 'assets/lexi-head.webp'; img.alt = '';
      const ht = el('div'); const title = el('b', null, item.retry ? 'Вернёмся к этому слову' : 'Энергия Лекси заряжена!'); title.id = 'cqWordTitle';
      ht.append(title, el('small', null, 'Ответь верно — получишь +1 ход' + (g.st.specials.length ? ' и особый кристалл' : '') + '.'));
      head.append(img, ht);
      const q = el('div', 'question');
      card.append(head, q); box.append(card); stage.append(box);
      g.pending = { item, resolve, box, q };
      try {
        const { model, actions } = adapter.question(item.type, item.w);
        const entry = LexigoGameEngine.question(q, model, actions);
        setTimeout(() => (entry && entry.input ? entry.input : q.querySelector('button:not([disabled])'))?.focus(), 30);
      } catch (e) { console.warn('LEXI crystals word', e); box.remove(); g.pending = null; resolve(); }
    });
  }
  /* ответ на задание (вызывается заданием так же, как в остальных играх) */
  function onAnswer(w, correct, msg, skill = 'recognition') {
    const g = G, game = g && g.game; if (!g || !g.pending || !game || game.answered) return;
    game.answered = true;
    const hinted = !!game.hinted, counted = !!correct && !hinted, item = g.pending.item;
    try { recordLearningEvent(w, counted, hinted, !!game.retryActive, game.activeQuestionMode); } catch { /* */ }
    if (hinted && correct) { try { const pr = getProgress(w); pr.hints = (pr.hints || 0) + 1; pr.last = Date.now(); pr.due = pr.last; progress[w.id] = pr; save(); updateStats(); } catch { /* */ } }
    else record(w, counted, skill);
    if (counted && !game.retryActive) game.firstCorrect = (game.firstCorrect || 0) + 1;
    g.answers.push({ w, ok: counted });
    if (!counted) g.queue.splice(Math.min(1, g.queue.length), 0, { w, retry: true });
    const res = E.wordAnswered(g.st, counted);
    g.pending.q.querySelectorAll('button.option, .options button, .buttons button').forEach(b => { b.disabled = true; });
    const d = el('div', 'feedback'); d.dataset.result = counted ? 'ok' : hinted ? 'hint' : 'miss'; d.setAttribute('role', 'status');
    d.append(el('strong', null, counted ? '✓ Верно! +1 ход' + (res.steps.length ? ' и особый кристалл' : '') : hinted ? 'Подсказка помогла — слово ещё вернётся' : 'Почти! Запомни правильный ответ'), el('div', null, msg),
      el('div', 'learning-tip', counted ? 'Отлично! Возвращаемся к кристаллам.' : 'Это слово вернётся чуть позже. Ходы не сгорают — ошибаться не страшно.'));
    const next = btn('Продолжить ▶', 'btn good cq-continue', () => close());
    g.pending.q.append(d, next);   // кнопка вне карточки ответа: Лекси может свернуть её до короткой плашки
    sound(counted ? 'word' : 'soft');
    try { document.dispatchEvent(new CustomEvent('lexigo:answer', { detail: { word: w, correct: counted, hinted, skill, mode: game.activeQuestionMode, gameMode: 'crystals', retry: !!game.retryActive, feedback: d } })); } catch { /* */ }
    setTimeout(() => next.focus(), 40);
    let closed = false;
    async function close() {
      if (closed) return; closed = true;
      const p = g.pending; g.pending = null; p.box.remove();
      $('cqBoard')?.focus({ preventScroll: true });
      await runSteps(res.steps, g); hud();
      p.resolve();
    }
  }

  /* ---------- пауза ---------- */
  function pause() {
    const g = G; if (!g || !g.st || g.pending || document.querySelector('.cq-pause')) return;
    const stage = document.getElementById('play'); if (!stage || !document.querySelector('.cq-stage')) return;
    const box = el('div', 'cq-word cq-pause'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Пауза');
    const card = el('div', 'cq-word-card');
    card.append(el('h3', null, '⏸ Пауза'), el('p', 'muted', 'Отвеченные слова уже сохранены. Если выйти, этот уровень можно будет начать заново.'));
    const row = el('div', 'cq-pause-actions');
    row.append(btn('▶ Продолжить', 'btn good', () => { box.remove(); $('cqBoard')?.focus(); }),
      btn('↻ Начать уровень заново', 'btn secondary', () => { leaveRound(g); startLevel(g.level.id); }),
      btn('Карта уровней', 'btn secondary', () => { leaveRound(g); showMap(); }),
      btn('К выбору игр', 'btn secondary', () => { box.remove(); try { stop(); } catch { /* */ } }));
    card.append(row); box.append(card); stage.append(box);
    row.querySelector('button').focus();
  }
  /* незаконченный уровень: ответы на слова отправляются как незавершённая тренировка */
  function leaveRound(g) {
    if (!g.answers.length) return;
    try { saveLearningAttempt(g.game, false); } catch { /* */ }
    try { S()?.restartRound?.(g.game); } catch { /* */ }
    g.answers = [];
  }

  /* ---------- конец уровня ---------- */
  async function finishLevel(g) {
    g.busy = true; clearHint();
    const st = g.st, L = g.level, won = E.goalsMet(st), left = st.moves;
    if (won && left > 0) {
      say('Бонус Лекси: ' + ruN(left, 'ход', 'хода', 'ходов') + ' × ' + E.MOVE_BONUS + ' очков!', 2000);
      sound('win');
      if (!reduced()) { for (let k = 0; k < Math.min(left, 12); k++) { g.shown.score = st.score + (k + 1) * E.MOVE_BONUS; $('cqMoves').textContent = left - k - 1; $('cqScore').textContent = fmt(g.shown.score); await wait(70); if (!alive(g)) return; } }
    }
    const f = E.finish(st);
    hud();
    await wait(reduced() ? 50 : 450); if (!alive(g)) return;
    const rec = lvl(L.id), prevBest = rec.best, rating = E.rating(L.id, f);
    rec.best = Math.max(rec.best, f.score); rec.stars = Math.max(rec.stars, f.stars); if (f.won) rec.wins++; rec.rating = Math.max(rec.rating, rating);
    persist();
    // ответы на слова — обычная тренировка: прогресс слов, XP, задание учителя
    g.game.crystals = (g.game.crystals || 0) + st.stats.cleared; g.game.crystalPoints = (g.game.crystalPoints || 0) + f.score;
    try { saveLearningAttempt(g.game, true); } catch { /* */ }
    try { S()?.restartRound?.(g.game); } catch { /* */ }
    const answers = g.answers.slice(); g.answers = [];
    results(g, f, { record: f.score > prevBest && prevBest > 0, first: prevBest === 0 && f.score > 0, rating, answers });
    submit(g, f);
  }
  function submit(g, f) {
    if (!signedIn() || isPreview(g.game) || !g.run) return;
    const p = { run_id: g.run.id, client_id: 'cq' + g.run.t0.toString(36) + '-' + g.level.id, level: g.level.id, day: g.run.day, won: f.won, score: f.score, moves_left: f.movesLeft, moves_used: f.movesUsed, words_ok: f.wordsOk, words_tried: f.wordsTried, seconds: Math.round((Date.now() - g.run.t0) / 1000) };
    if (!p.run_id) { queuePush(p); return; }
    cloud().then(session => session && session.sb.rpc('crystal_finish', { p })).then(r => {
      if (!r) return;
      if (r.error) { if (/fetch|network/i.test(r.error.message || '')) queuePush(p); else console.warn('LEXI crystals result', r.error.message); return; }
      const box = document.querySelector('.crystal-result .cq-res-rating');
      if (box && r.data && r.data.ok) box.textContent = r.data.counted ? '🏆 Рейтинг экспедиции: ' + fmt(r.data.total) + (r.data.place ? ' · место ' + r.data.place : '') + (r.data.improved ? ' · новый рекорд уровня!' : '') : 'Результат сохранён. В рейтинг идёт лучший результат уровня.';
    }).catch(() => queuePush(p));
  }
  function queuePush(p) { if (!p.run_id) return; try { const q = JSON.parse(localStorage.getItem(QKEY) || '[]'); q.push(p); localStorage.setItem(QKEY, JSON.stringify(q.slice(-20))); } catch { /* */ } }

  function results(g, f, extra) {
    const L = g.level, st = g.st;
    $('counter').textContent = f.won ? 'Уровень пройден!' : 'Ходы закончились';
    $('bar').style.width = '100%';
    const card = el('section', 'lesson-result crystal-result' + (f.won ? ' won' : ' lost'));
    const img = el('img', 'result-mascot'); img.src = 'assets/mascot-result.webp'; img.alt = '';
    const h = el('h2', null, f.won ? (f.stars === 3 ? 'Блестяще! Три звезды!' : 'Уровень пройден!') : 'Почти получилось!'); h.tabIndex = -1;
    const stars = el('div', 'cq-res-stars'); stars.setAttribute('aria-label', 'Звёзд: ' + f.stars + ' из 3');
    for (let k = 1; k <= 3; k++) { const s = el('span', f.stars >= k ? 'on' : null, '★'); s.style.animationDelay = (k * 0.18) + 's'; stars.append(s); }
    const goalsLeft = E.goals(st).filter(x => !x.done);
    const lead = el('p', 'cq-res-lead', f.won
      ? 'Очки: ' + fmt(f.score) + (f.bonus ? ' (бонус за ' + ruN(f.movesLeft, 'оставшийся ход', 'оставшихся хода', 'оставшихся ходов') + ': +' + fmt(f.bonus) + ')' : '')
      : 'Не хватило совсем чуть-чуть: ' + goalsLeft.map(x => x.label.toLowerCase() + ' (' + x.have + ' / ' + x.need + ')').join(', ') + '. Попробуй ещё раз — поле будет тем же, и ты уже знаешь, где искать комбинации!');
    const stats = el('div', 'cq-res-stats');
    const metric = (v, t) => { const m = el('div', 'cq-metric'); m.append(el('b', null, v), el('small', null, t)); return m; };
    stats.append(metric(fmt(f.score), 'очков'), metric(fmt(lvl(L.id).best), 'рекорд уровня'), metric(f.wordsOk + ' / ' + f.wordsTried, 'верных ответов'), metric(st.stats.cleared, 'кристаллов собрано'));
    const badges = el('div', 'cq-res-badges');
    if (extra.record) badges.append(el('span', 'cq-badge gold', '🏅 Новый рекорд!'));
    if (st.stats.maxChain >= 3) badges.append(el('span', 'cq-badge', '⛓ Цепочка ×' + st.stats.maxChain));
    if (st.stats.specials) badges.append(el('span', 'cq-badge', '✦ Особых кристаллов: ' + st.stats.specials));
    const words = el('div', 'cq-res-words');
    if (extra.answers.length) {
      words.append(el('h3', null, 'Слова этого уровня'));
      const ul = el('ul'); const seen = new Map();
      for (const a of extra.answers) seen.set(a.w.id, { w: a.w, ok: (seen.get(a.w.id) || {}).ok || a.ok });
      for (const { w, ok } of seen.values()) { const li = el('li', ok ? 'ok' : 'again'); li.append(el('b', null, w.en), ' — ' + w.ru + ' ', el('span', null, ok ? '✓' : '↺ повторим')); ul.append(li); }
      words.append(ul);
    }
    const rating = el('p', 'cq-res-rating muted', isPreview(g.game) ? 'Тренировка учителя: результат не попадает в рейтинг и статистику класса.' : signedIn() ? (f.won ? 'Сохраняем результат в рейтинг…' : 'В рейтинг идут пройденные уровни.') : 'Войди в аккаунт, чтобы участвовать в рейтинге экспедиции.');
    const actions = el('div', 'cq-res-actions');
    if (f.won && E.level(L.id + 1)) actions.append(btn('Следующий уровень →', 'btn good', () => startLevel(L.id + 1)));
    actions.append(btn(f.won ? '↻ Улучшить результат' : '↻ Попробовать ещё раз', f.won ? 'btn secondary' : 'btn good', () => startLevel(L.id)),
      btn('Карта уровней', 'btn secondary', showMap), btn('К выбору игр', 'btn secondary', () => { try { stop(); } catch { /* */ } }));
    card.append(img, h, stars, lead, badges, stats, words, rating, actions);
    if (f.won && !reduced()) { const conf = el('div', 'cq-confetti'); conf.setAttribute('aria-hidden', 'true'); for (let k = 0; k < 24; k++) { const i = el('i'); i.style.setProperty('--x', ((k * 37) % 100) + '%'); i.style.setProperty('--d', (k % 6) * 0.08 + 's'); i.style.setProperty('--c', ['#ffc83a', '#2c56f5', '#ff6a55', '#1fc497', '#b4ef3a', '#7a5cff'][k % 6]); conf.append(i); } card.append(conf); }
    $('play').replaceChildren(card);
    sound(f.won ? 'win' : 'soft');
    try { window.LexiQuest?.toast(f.won ? (f.stars === 3 ? 'Wow! Three stars!' : 'Great job!') + ' 🐱' : 'Почти! Попробуем ещё раз?', f.won ? 'cheer' : 'think'); } catch { /* */ }
    h.focus({ preventScroll: true }); card.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
  }

  window.LexiCrystalQuest = Object.freeze({ begin, end, startLevel, showMap, state: () => G && G.st, debug: () => G });
})();
