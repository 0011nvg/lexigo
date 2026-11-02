/* LEXI — «Кристальная экспедиция»: игровой движок «три в ряд» (2026-11-02, v2).
 * Чистая логика без DOM: одинаково работает в браузере, в тестах (node) и в симуляторе сложности.
 * Полностью детерминирован: поле и новые кристаллы берутся из генератора с «зерном» (seed),
 * поэтому у всех игроков «Экспедиции дня» одинаковые условия, а партию можно воспроизвести по ходам.
 *
 * Клетка поля — кристалл { id, c, s }: c — цвет 0…5 (-1 у призмы), s — особый кристалл или null:
 *   'row'  — «линия ↔»: очищает строку      (4 в ряд по горизонтали)
 *   'col'  — «линия ↕»: очищает столбец     (4 в ряд по вертикали)
 *   'bomb' — «бомба»:   очищает квадрат 3×3 (уголок или «Т» из 5+)
 *   'prism'— «призма»:  убирает все кристаллы одного цвета (5 в ряд); меняется с любым соседом
 * Лёд (ice) — слой клетки: разбивается, когда в клетке исчезает кристалл.
 * Каждый успешный ход возвращает «шаги» (steps) со снимками поля — их проигрывает интерфейс. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.LexiCrystalEngine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const COLORS = ['сапфир', 'аметист', 'изумруд', 'рубин', 'топаз', 'бирюза'];
  const COLORS_GEN = ['сапфиров', 'аметистов', 'изумрудов', 'рубинов', 'топазов', 'бирюзы'];
  const ALL = ['row', 'col', 'bomb', 'prism'];
  /* Уровни. Цели проверены симулятором (tests/crystal-engine.mjs): каждый уровень проходим
     простым «жадным» игроком; сложность растёт постепенно — новых правил, а не случайных невозможных полей. */
  const ICE4 = [], ICE5 = [];
  for (let y = 2; y <= 5; y++) for (let x = 2; x <= 5; x++) ICE4.push([y * 8 + x, 1]);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    if ((y === 3 || y === 4) || (x === 3 || x === 4)) ICE5.push([y * 8 + x, (y === 3 || y === 4) && (x === 3 || x === 4) ? 2 : 1]);
  }
  const LEVELS = [
    { id: 1, name: 'Первые кристаллы', intro: 'Собирай по три одинаковых кристалла в ряд.', size: 7, colors: 5, moves: 20, energy: 18, specials: [],
      goals: [{ type: 'score', n: 3000 }, { type: 'words', n: 3 }], stars: [3000, 4800, 6600] },
    { id: 2, name: 'Мастер комбинаций', intro: 'Четыре в ряд — «линия», пять в ряд — «призма».', size: 7, colors: 5, moves: 20, energy: 22, specials: ['row', 'col', 'prism'],
      goals: [{ type: 'score', n: 4600 }, { type: 'special', n: 2 }, { type: 'words', n: 3 }], stars: [4600, 6800, 8600] },
    { id: 3, name: 'Кристальный взрыв', intro: 'Уголок или «Т» из пяти — «бомба» 3×3. Меняй особые кристаллы друг с другом!', size: 8, colors: 5, moves: 22, energy: 30, specials: ALL,
      goals: [{ type: 'score', n: 6800 }, { type: 'bomb', n: 2 }, { type: 'words', n: 4 }], stars: [6800, 10000, 12500] },
    { id: 4, name: 'Цепная реакция', intro: 'Падающие кристаллы складываются в новые ряды — это цепочка. Разбей лёд!', size: 8, colors: 6, moves: 24, energy: 24, specials: ALL, ice: ICE4,
      goals: [{ type: 'ice' }, { type: 'collect', color: 3, n: 24 }, { type: 'cascade', n: 2 }, { type: 'words', n: 4 }], stars: [5500, 8200, 10200] },
    { id: 5, name: 'Легенда кристаллов', intro: 'Несколько целей сразу и толстый лёд в центре. Продумывай ходы!', size: 8, colors: 6, moves: 26, energy: 26, specials: ALL, ice: ICE5,
      goals: [{ type: 'ice' }, { type: 'collect', color: 0, n: 22 }, { type: 'score', n: 8000 }, { type: 'words', n: 5 }], stars: [8000, 10500, 12500] }
  ];
  const MOVE_BONUS = 250, WORD_POINTS = 150, MAX_CHAIN = 60;

  /* ---------- генератор случайных чисел (mulberry32) ---------- */
  function hashSeed(text) { let h = 2166136261 >>> 0; for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function rnd(st) { st.rng = (st.rng + 0x6D2B79F5) >>> 0; let t = st.rng; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  const rint = (st, n) => Math.floor(rnd(st) * n);
  /* зерно «Экспедиции дня»: одно и то же поле у всех игроков в этот день */
  function dailySeed(level, day) { return 'lexi-crystal|' + level + '|' + day; }

  /* ---------- поле ---------- */
  const level = id => LEVELS.find(l => l.id === Number(id)) || null;
  const xy = (st, i) => [i % st.size, Math.floor(i / st.size)];
  const at = (st, x, y) => (x < 0 || y < 0 || x >= st.size || y >= st.size) ? -1 : y * st.size + x;
  function neighbors(st, a, b) { if (a < 0 || b < 0 || a >= st.n || b >= st.n) return false; const [ax, ay] = xy(st, a), [bx, by] = xy(st, b); return Math.abs(ax - bx) + Math.abs(ay - by) === 1; }
  const gem = (st, c, s = null) => ({ id: ++st.nextId, c, s });
  const snap = st => st.cells.map(p => p ? { id: p.id, c: p.c, s: p.s } : null);

  function create(levelId, seed) {
    const L = level(levelId); if (!L) throw new Error('unknown level');
    const st = { level: L.id, size: L.size, n: L.size * L.size, colors: L.colors, specials: L.specials.slice(), cells: [], ice: Array(L.size * L.size).fill(0),
      rng: hashSeed(seed), seed: String(seed), nextId: 0, moves: L.moves, movesUsed: 0, score: 0, energy: 0, energyNeed: L.energy, wordsOk: 0, wordsTried: 0,
      stats: { collected: Array(6).fill(0), specials: 0, bombs: 0, cascades: 0, cleared: 0, maxChain: 0, iceStart: 0 }, over: false, finished: null };
    for (const [i, n] of L.ice || []) if (i < st.n) st.ice[i] = n;
    st.stats.iceStart = st.ice.reduce((a, b) => a + b, 0);
    fillFresh(st);
    return st;
  }
  /* новое поле без готовых рядов и хотя бы с одним ходом */
  function fillFresh(st) {
    for (let tries = 0; tries < 500; tries++) {
      st.cells = [];
      for (let i = 0; i < st.n; i++) {
        const [x, y] = xy(st, i);
        const bad = new Set();
        if (x >= 2 && st.cells[i - 1].c === st.cells[i - 2].c) bad.add(st.cells[i - 1].c);
        if (y >= 2 && st.cells[i - st.size].c === st.cells[i - 2 * st.size].c) bad.add(st.cells[i - st.size].c);
        const choices = []; for (let c = 0; c < st.colors; c++) if (!bad.has(c)) choices.push(c);
        st.cells.push(gem(st, choices[rint(st, choices.length)]));
      }
      if (findMove(st)) return;
    }
    throw new Error('board generation failed');
  }

  /* ---------- поиск рядов и фигур ---------- */
  function runs(st) {
    const out = [], S = st.size;
    for (let y = 0; y < S; y++) { let x = 0; while (x < S) { const p = st.cells[y * S + x]; let e = x + 1; if (p && p.c >= 0) while (e < S && st.cells[y * S + e] && st.cells[y * S + e].c === p.c) e++; if (p && p.c >= 0 && e - x >= 3) { const cells = []; for (let k = x; k < e; k++) cells.push(y * S + k); out.push({ dir: 'h', c: p.c, cells }); } x = e; } }
    for (let x = 0; x < S; x++) { let y = 0; while (y < S) { const p = st.cells[y * S + x]; let e = y + 1; if (p && p.c >= 0) while (e < S && st.cells[e * S + x] && st.cells[e * S + x].c === p.c) e++; if (p && p.c >= 0 && e - y >= 3) { const cells = []; for (let k = y; k < e; k++) cells.push(k * S + x); out.push({ dir: 'v', c: p.c, cells }); } y = e; } }
    return out;
  }
  /* ряды, имеющие общую клетку, — одна фигура (уголок, «Т», «+») */
  function groups(st) {
    const rs = runs(st), parent = rs.map((_, i) => i), find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
    const owner = new Map();
    rs.forEach((r, i) => r.cells.forEach(c => { if (owner.has(c)) parent[find(i)] = find(owner.get(c)); else owner.set(c, i); }));
    const map = new Map();
    rs.forEach((r, i) => { const k = find(i); if (!map.has(k)) map.set(k, { c: r.c, runs: [], cells: new Set() }); const g = map.get(k); g.runs.push(r); r.cells.forEach(c => g.cells.add(c)); });
    return [...map.values()];
  }
  function specialFor(st, g) {
    const max = Math.max(...g.runs.map(r => r.cells.length)), hasH = g.runs.some(r => r.dir === 'h'), hasV = g.runs.some(r => r.dir === 'v');
    const want = max >= 5 ? ['prism', 'bomb'] : hasH && hasV ? ['bomb', max === 4 ? (g.runs.find(r => r.cells.length === 4).dir === 'h' ? 'row' : 'col') : null]
      : max === 4 ? [g.runs[0].dir === 'h' ? 'row' : 'col'] : [];
    return want.find(k => k && st.specials.includes(k)) || null;
  }
  function groupPoints(g) { const n = g.cells.size, max = Math.max(...g.runs.map(r => r.cells.length)); return n <= 3 ? 60 : max >= 5 ? 200 + (n - 5) * 20 : g.runs.length > 1 ? 160 + (n - 5) * 20 : 120; }

  /* ---------- ходы ---------- */
  function validSwap(st, a, b) {
    if (!neighbors(st, a, b)) return false;
    const p = st.cells[a], q = st.cells[b]; if (!p || !q) return false;
    if (p.s === 'prism' || q.s === 'prism' || (p.s && q.s)) return true;
    st.cells[a] = q; st.cells[b] = p;
    const ok = runs(st).some(r => r.cells.includes(a) || r.cells.includes(b));
    st.cells[a] = p; st.cells[b] = q;
    return ok;
  }
  function findMove(st) {
    for (let a = 0; a < st.n; a++) for (const b of [a + 1, a + st.size]) if (b < st.n && neighbors(st, a, b) && validSwap(st, a, b)) return [a, b];
    return null;
  }
  function allMoves(st) { const out = []; for (let a = 0; a < st.n; a++) for (const b of [a + 1, a + st.size]) if (b < st.n && neighbors(st, a, b) && validSwap(st, a, b)) out.push([a, b]); return out; }

  /* область действия особого кристалла */
  function area(st, i, s, c) {
    const [x, y] = xy(st, i), out = [];
    if (s === 'row') for (let k = 0; k < st.size; k++) out.push(at(st, k, y));
    else if (s === 'col') for (let k = 0; k < st.size; k++) out.push(at(st, x, k));
    else if (s === 'bomb') { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const j = at(st, x + dx, y + dy); if (j >= 0) out.push(j); } }
    else if (s === 'prism') { const color = c != null && c >= 0 ? c : commonColor(st); st.cells.forEach((p, j) => { if (p && p.c === color) out.push(j); }); out.push(i); }
    return out;
  }
  function commonColor(st) { const n = Array(st.colors).fill(0); for (const p of st.cells) if (p && p.c >= 0) n[p.c]++; return n.indexOf(Math.max(...n)); }

  /* Ход игрока. → { ok:false } (кристаллы вернутся, ход не списан) или { ok:true, steps } */
  function swap(st, a, b) {
    if (st.over || st.moves <= 0 || !neighbors(st, a, b) || !validSwap(st, a, b)) return { ok: false, steps: [{ t: 'swap', a, b }, { t: 'back', a, b }] };
    const p = st.cells[a], q = st.cells[b];
    st.cells[a] = q; st.cells[b] = p;
    st.moves--; st.movesUsed++;
    const steps = [{ t: 'swap', a, b, cells: snap(st) }];
    let forced = null;
    // особые кристаллы, поменянные друг с другом или с призмой
    if (p.s === 'prism' || q.s === 'prism') {
      const prismAt = p.s === 'prism' ? b : a, other = p.s === 'prism' ? q : p, otherAt = p.s === 'prism' ? a : b;
      const clear = new Set([prismAt]);
      if (other.s === 'prism') st.cells.forEach((g, j) => { if (g) clear.add(j); });
      else if (other.s) {   // все кристаллы этого цвета становятся такими же особыми и срабатывают
        st.cells.forEach((g, j) => { if (g && g.c === other.c) { if (!g.s) g.s = other.s === 'bomb' ? 'bomb' : (rint(st, 2) ? 'row' : 'col'); clear.add(j); } });
        steps.push({ t: 'transform', cells: snap(st) });
      } else { st.cells.forEach((g, j) => { if (g && g.c === other.c) clear.add(j); }); clear.add(otherAt); }
      st.cells[prismAt].s = null; st.cells[prismAt].c = -2;   // призма израсходована (не срабатывает повторно)
      forced = clear;
    } else if (p.s && q.s) {
      const kinds = [p.s, q.s].sort().join('+'), [bx, by] = xy(st, b), clear = new Set([a, b]);
      const addRow = y => { for (let k = 0; k < st.size; k++) { const j = at(st, k, y); if (j >= 0) clear.add(j); } };
      const addCol = x => { for (let k = 0; k < st.size; k++) { const j = at(st, x, k); if (j >= 0) clear.add(j); } };
      if (kinds === 'bomb+bomb') { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const j = at(st, bx + dx, by + dy); if (j >= 0) clear.add(j); } }
      else if (kinds.includes('bomb')) { for (let d = -1; d <= 1; d++) { if (by + d >= 0 && by + d < st.size) addRow(by + d); if (bx + d >= 0 && bx + d < st.size) addCol(bx + d); } }
      else { addRow(by); addCol(bx); }
      st.cells[a].s = null; st.cells[b].s = null;          // сработали как пара — повторно не взрываются
      forced = clear;
    }
    resolve(st, [a, b], steps, forced);
    return { ok: true, steps };
  }

  /* очистка → падение → новые ряды, пока поле не успокоится */
  function resolve(st, swapCells, steps, forced) {
    let chain = 0, movePoints = 0;
    for (;;) {
      const gs = groups(st);
      if (!gs.length && !forced) break;
      chain++;
      if (chain > MAX_CHAIN) break;   // страховка от бесконечного цикла (на практике недостижимо)
      const clear = new Set(forced || []), created = [];
      let points = forced ? 0 : 0;
      for (const g of gs) {
        const kind = specialFor(st, g);
        let spot = null;
        if (kind) {
          const free = [...g.cells].filter(i => !st.cells[i].s);
          const swapHit = chain === 1 && swapCells ? swapCells.find(i => g.cells.has(i) && !st.cells[i].s) : undefined;
          if (swapHit != null) spot = swapHit;
          else if (kind === 'bomb') { const seen = new Map(); for (const r of g.runs) for (const c of r.cells) seen.set(c, (seen.get(c) || 0) + 1); spot = [...seen].find(([c, n]) => n > 1 && !st.cells[c].s)?.[0] ?? free[0]; }
          else { const longest = g.runs.slice().sort((x, y) => y.cells.length - x.cells.length)[0].cells; spot = longest.filter(i => !st.cells[i].s)[Math.floor(longest.length / 2)] ?? free[0]; }
          if (spot == null) spot = null;
        }
        for (const i of g.cells) if (i !== spot) clear.add(i);
        if (spot != null) created.push({ i: spot, kind, c: g.c });
        points += groupPoints(g);
      }
      // цепная реакция особых кристаллов внутри очищаемой области
      const queue = [...clear], fired = new Set();
      while (queue.length) {
        const i = queue.shift(), p = st.cells[i];
        if (!p || !p.s || fired.has(i)) continue;
        fired.add(i);
        for (const j of area(st, i, p.s, p.s === 'prism' ? null : undefined)) if (!clear.has(j)) { clear.add(j); queue.push(j); }
      }
      const fromMatch = new Set(); for (const g of gs) for (const i of g.cells) fromMatch.add(i);
      for (const { i } of created) clear.delete(i);
      let cleared = 0, iceHit = [];
      for (const i of clear) {
        const p = st.cells[i];
        if (p) { if (p.c >= 0) st.stats.collected[p.c]++; cleared++; if (!fromMatch.has(i)) points += 20; }
        if (st.ice[i] > 0) { st.ice[i]--; iceHit.push(i); }
        st.cells[i] = null;
      }
      for (const { i, kind, c } of created) {
        const p = st.cells[i] || gem(st, c);
        p.s = kind; if (kind === 'prism') p.c = -1; else p.c = c;
        if (c >= 0) st.stats.collected[c]++;
        st.cells[i] = p; st.stats.specials++; if (kind === 'bomb') st.stats.bombs++;
      }
      const mult = 1 + 0.5 * (chain - 1);
      const gained = Math.round(points * mult);
      st.score += gained; movePoints += gained; st.stats.cleared += cleared; st.energy += cleared;
      steps.push({ t: 'clear', chain, cleared: [...clear], fired: [...fired], created: created.map(x => x.i), ice: iceHit, points: gained, cells: snap(st), iceMap: st.ice.slice() });
      forced = null;
      const fall = gravity(st);
      steps.push({ t: 'fall', cells: snap(st), spawned: fall });
    }
    st.stats.maxChain = Math.max(st.stats.maxChain, chain);
    if (chain >= 3) st.stats.cascades++;
    if (!findMove(st)) { shuffle(st); steps.push({ t: 'shuffle', cells: snap(st) }); }
    if (st.moves <= 0) st.over = true;
    return movePoints;
  }
  /* кристаллы падают вниз, сверху появляются новые: → [{ id, drop }] — новый падает из-за края поля на drop клеток */
  function gravity(st) {
    const S = st.size, spawned = [];
    for (let x = 0; x < S; x++) {
      const col = [];
      for (let y = S - 1; y >= 0; y--) { const p = st.cells[y * S + x]; if (p) col.push(p); }
      let missing = S - col.length, k = 0;
      for (let y = S - 1; y >= 0; y--) {
        let p = col[S - 1 - y];
        if (!p) { p = gem(st, rint(st, st.colors)); spawned.push({ id: p.id, drop: missing }); k++; }
        st.cells[y * S + x] = p;
      }
    }
    return spawned;
  }
  /* нет ходов — Лекси перемешивает поле (особые кристаллы остаются на месте), ход не тратится */
  function shuffle(st) {
    const spots = []; st.cells.forEach((p, i) => { if (p && !p.s) spots.push(i); });
    const pieces = spots.map(i => st.cells[i]);
    for (let tries = 0; tries < 300; tries++) {
      for (let i = pieces.length - 1; i > 0; i--) { const j = rint(st, i + 1); [pieces[i], pieces[j]] = [pieces[j], pieces[i]]; }
      spots.forEach((i, k) => { st.cells[i] = pieces[k]; });
      if (!runs(st).length && findMove(st)) return true;
      if (tries > 150) for (const p of pieces) p.c = rint(st, st.colors);   // крайний случай: новые цвета
    }
    fillFresh(st); return true;
  }

  /* ---------- слова и бонусы ---------- */
  const energyFull = st => st.energy >= st.energyNeed;
  function useEnergy(st) { st.energy = Math.max(0, st.energy - st.energyNeed); }
  /* не больше одного задания со словом за ход: лишняя энергия переходит на следующий раз, но не больше половины шкалы;
     когда все цели выполнены, заданий больше нет — уровень заканчивается */
  function takeEnergy(st) {
    if (!energyFull(st) || goalsMet(st) || st.finished) return false;
    st.energy = Math.min(st.energy - st.energyNeed, Math.floor(st.energyNeed / 2));
    return true;
  }
  /* верный ответ: +1 ход, +150 очков и (с уровня 2) особый кристалл на поле */
  function wordAnswered(st, correct) {
    st.wordsTried++;
    if (!correct) return { steps: [] };
    st.wordsOk++; st.moves++; st.score += WORD_POINTS; st.over = false;
    const kinds = st.specials.filter(k => k !== 'prism'), steps = [];
    if (kinds.length) {
      const free = []; st.cells.forEach((p, i) => { if (p && !p.s) free.push(i); });
      if (free.length) { const i = free[rint(st, free.length)], kind = kinds[rint(st, kinds.length)]; st.cells[i].s = kind; if (kind === 'bomb') st.stats.bombs++; st.stats.specials++; steps.push({ t: 'reward', i, kind, cells: snap(st) }); }
    }
    return { steps };
  }

  /* ---------- цели, звёзды, итог ---------- */
  function goals(st) {
    const L = level(st.level);
    return L.goals.map(g => {
      let have = 0, need = g.n || 0, label;
      if (g.type === 'score') { have = st.score; label = 'Набери ' + need + ' очков'; }
      else if (g.type === 'words') { have = st.wordsOk; label = 'Ответь верно на ' + need + ' ' + (need === 1 ? 'слово' : need < 5 ? 'слова' : 'слов'); }
      else if (g.type === 'special') { have = st.stats.specials; label = 'Создай ' + need + ' особых кристалла'; }
      else if (g.type === 'bomb') { have = st.stats.bombs; label = 'Создай ' + need + ' бомбы'; }
      else if (g.type === 'collect') { have = st.stats.collected[g.color]; label = 'Собери ' + need + ' ' + COLORS_GEN[g.color]; }
      else if (g.type === 'cascade') { have = st.stats.cascades; label = 'Сделай ' + need + ' цепочки ×3'; }
      else if (g.type === 'ice') { need = st.stats.iceStart; have = need - st.ice.reduce((a, b) => a + b, 0); label = 'Разбей весь лёд'; }
      return { type: g.type, color: g.color, need, have: Math.min(have, need), done: have >= need, label };
    });
  }
  const goalsMet = st => goals(st).every(g => g.done);
  function starsFor(st, won) { const L = level(st.level); return !won ? 0 : 1 + (st.score >= L.stars[1] ? 1 : 0) + (st.score >= L.stars[2] ? 1 : 0); }
  /* конец уровня: цели выполнены — оставшиеся ходы превращаются в бонус */
  function finish(st) {
    if (st.finished) return st.finished;
    const won = goalsMet(st), left = st.moves, bonus = won ? left * MOVE_BONUS : 0;
    st.score += bonus; st.over = true;
    st.finished = { won, stars: starsFor(st, won), score: st.score, bonus, movesLeft: left, movesUsed: st.movesUsed, wordsOk: st.wordsOk, wordsTried: st.wordsTried, level: st.level };
    return st.finished;
  }
  /* верхняя граница очков для проверки на сервере (щедрая: никакая честная партия её не превысит) */
  function scoreCap(levelId, movesUsed) { const L = level(levelId); return Math.round((movesUsed || 0) * 9000 + (L.moves + 15) * MOVE_BONUS + 40 * WORD_POINTS); }
  /* рейтинговые очки уровня — считаются и на сервере тем же способом: звёзды важнее удачи */
  function rating(levelId, f) {
    const L = level(levelId); if (!L || !f || !f.won) return 0;
    const top = L.stars[2] * 2, acc = f.wordsTried ? f.wordsOk / f.wordsTried : 0;
    return f.stars * 1000 + Math.round(500 * Math.min(f.score, top) / top) + 15 * Math.min(f.movesLeft, 30) + Math.round(300 * acc);
  }
  const clone = st => JSON.parse(JSON.stringify(st));

  return Object.freeze({ LEVELS, COLORS, COLORS_GEN, MOVE_BONUS, WORD_POINTS, level, create, swap, validSwap, findMove, allMoves, neighbors, runs, groups, goals, goalsMet, finish, starsFor,
    energyFull, useEnergy, takeEnergy, wordAnswered, shuffle, dailySeed, hashSeed, scoreCap, rating, clone, xy });
});
