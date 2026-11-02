// LEXI — «Кристальная экспедиция»: проверка игрового движка без браузера (2026-11-02 v2).
// node tests/crystal-engine.mjs  — правила поля, особые кристаллы, каскады, ходы, перемешивание, очки, звёзды,
// детерминированность и симуляция сложности уровней двумя «игроками».
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require(new URL('../crystal-engine.js', import.meta.url).pathname);
const ok = m => console.log('  ✓ ' + m);

/* поле из строк: a–f — цвета, R/C — линии ↔/↕ (цвет a), B — бомба (цвет a), P — призма, # — лёд под «a» */
function board(levelId, rows, seed = 't') {
  const st = E.create(levelId, seed);
  assert.equal(rows.length, st.size);
  st.ice.fill(0);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const i = y * st.size + x, p = st.cells[i];
    if (ch === '#') { st.ice[i] = 1; ch = 'a'; }
    p.s = null; p.c = 'abcdef'.indexOf(ch);
    if (ch === 'R') { p.c = 0; p.s = 'row'; } if (ch === 'C') { p.c = 0; p.s = 'col'; } if (ch === 'B') { p.c = 0; p.s = 'bomb'; } if (ch === 'P') { p.c = -1; p.s = 'prism'; }
  }));
  st.stats.iceStart = st.ice.reduce((a, b) => a + b, 0);
  return st;
}
const idx = (st, x, y) => y * st.size + x;
const full = st => st.cells.every(p => p && Number.isInteger(p.id));
const stable = st => E.runs(st).length === 0;

/* 1. ряды по горизонтали и вертикали, фигуры */
{
  const st = board(3, ['aaabcdef', 'bcdefabc', 'cdeafbcd', 'dbcdefab', 'eadefcba', 'fabcdefa', 'abcdefab', 'bcdefabc']);
  const r = E.runs(st);
  assert.equal(r.filter(x => x.dir === 'h').length, 1); assert.deepEqual(r[0].cells, [0, 1, 2]);
  const v = board(3, ['abcdefab', 'acdefabc', 'acdbfbcd', 'dbcdefab', 'eadefcba', 'fabcdefa', 'abcdecab', 'bcdefabc']);
  assert.deepEqual(E.runs(v).filter(x => x.dir === 'v').map(x => x.cells), [[0, 8, 16]]);
  const L = board(3, ['aaabcdef', 'acdefabc', 'acdbfbcd', 'dbcdefab', 'eadefcba', 'fabcdefa', 'abcdecab', 'bcdefabc']);
  const g = E.groups(L); assert.equal(g.length, 1); assert.equal(g[0].cells.size, 5); assert.equal(g[0].runs.length, 2);
  ok('runs: horizontal and vertical lines of 3+, corner shape is one group of 5');
}

/* 2. неверный ход: кристаллы возвращаются, ход не тратится; верный — тратит ровно один ход */
{
  const st = board(1, ['abcdeab', 'bcdeabc', 'cdeabcd', 'deabcde', 'eabcdea', 'abcdeab', 'bcdeabc']);
  const before = JSON.stringify(st.cells), moves = st.moves;
  const r = E.swap(st, 0, 1);
  assert.equal(r.ok, false); assert.equal(st.moves, moves); assert.equal(JSON.stringify(st.cells), before);
  assert.deepEqual(r.steps.map(s => s.t), ['swap', 'back']);
  assert.equal(E.swap(st, 0, 9).ok, false, 'not neighbours');
  assert.equal(E.swap(st, 6, 7).ok, false, 'row wrap is not a neighbour');
  const g = board(1, ['aabaaee', 'bcdeabc', 'cdeabcd', 'deabcde', 'eabcdea', 'abcdeab', 'bcdeabc']);
  const r2 = E.swap(g, 2, 3);
  assert.equal(r2.ok, true); assert.equal(g.moves, moves - 1); assert.equal(g.movesUsed, 1);
  assert.ok(full(g) && stable(g), 'board full and settled after the move');
  ok('invalid swap returns crystals and keeps the move; neighbours only (no row wrap); valid swap costs exactly one move');
}

/* 3. особые кристаллы: создание и действие (поля нарисованы так, чтобы до хода рядов не было) */
const BASE = ['abcdefab', 'bcdefaac', 'cdeXXXbd', 'defabcde', 'efabcdef', 'fabcdefa', 'abcdefab', 'bcdefabc'];
const with3 = mid => BASE.map((r, y) => y === 2 ? 'cde' + mid + 'bd' : r);   // ход: (6,1)«a» ↔ (6,2)«b»
{
  // 4 в ряд по горизонтали → «линия ↔»
  const s4 = board(2, ['aabacde', 'bcadeab', 'cdeabcd', 'deabcde', 'eabcdea', 'abcdeab', 'bcdeabc']);
  const r = E.swap(s4, 2, 9);
  assert.ok(r.ok); const c = r.steps.find(x => x.t === 'clear');
  assert.equal(c.created.length, 1); assert.equal(s4.stats.specials, 1);
  assert.equal(r.steps.find(x => x.t === 'clear').cells[2].s, 'row', 'line created where the player moved');
  // уголок из пяти → бомба
  const b = board(3, ['aabacdef', 'bcadeabc', 'cdaebcde', 'defabcda', 'efabcdef', 'fabcdefa', 'abcdefab', 'bcdefabc']);
  const rb = E.swap(b, 2, 3);   // «a» встаёт в (2,0): строка a a a и столбец (2,0)…(2,2) — уголок
  assert.ok(rb.ok); assert.equal(b.stats.bombs, 1, 'corner → bomb');
  // линия ↔ в ряду из трёх очищает всю строку
  const row = board(3, with3('bRa'));
  const rr = E.swap(row, idx(row, 6, 2), idx(row, 6, 1));
  assert.ok(rr.ok, 'line in a match'); const cl = rr.steps.find(x => x.t === 'clear');
  for (let x = 0; x < 8; x++) assert.ok(cl.cleared.includes(idx(row, x, 2)), 'row cleared at x=' + x);
  // бомба 3×3
  const bomb = board(3, with3('bBa'));
  const cb = E.swap(bomb, idx(bomb, 6, 2), idx(bomb, 6, 1)).steps.find(x => x.t === 'clear');
  for (let y = 1; y <= 3; y++) for (let x = 3; x <= 5; x++) assert.ok(cb.cleared.includes(idx(bomb, x, y)), 'bomb area');
  // призма + цвет: исчезают все кристаллы этого цвета; призма меняется с любым соседом
  const pr = board(3, with3('Pbe'));
  const bCount = pr.cells.filter(p => p.c === 1).length;
  const rp = E.swap(pr, idx(pr, 3, 2), idx(pr, 4, 2));
  assert.ok(rp.ok, 'prism swaps with any neighbour');
  const cp = rp.steps.find(x => x.t === 'clear');
  assert.ok(cp.cleared.length >= bCount + 1, 'all crystals of the colour removed');
  // линия + линия → крест; бомба + бомба → 5×5
  const cross = board(3, with3('RCe'));
  const cc = E.swap(cross, idx(cross, 3, 2), idx(cross, 4, 2)).steps.find(x => x.t === 'clear');
  for (let k = 0; k < 8; k++) { assert.ok(cc.cleared.includes(idx(cross, k, 2)), 'row'); assert.ok(cc.cleared.includes(idx(cross, 4, k)), 'col'); }
  const bb = board(3, with3('BBe'));
  const cbb = E.swap(bb, idx(bb, 3, 2), idx(bb, 4, 2)).steps.find(x => x.t === 'clear');
  for (let y = 0; y <= 4; y++) for (let x = 2; x <= 6; x++) assert.ok(cbb.cleared.includes(idx(bb, x, y)), '5x5');
  // уровень 1: особых кристаллов нет — четвёрка просто даёт больше очков
  const l1 = board(1, ['aabacde', 'bcadeab', 'cdeabcd', 'deabcde', 'eabcdea', 'abcdeab', 'bcdeabc']);
  E.swap(l1, 2, 9); assert.equal(l1.stats.specials, 0); assert.ok(l1.cells.every(p => !p.s));
  ok('specials: 4 → line at the moved crystal, corner → bomb, line clears its row, bomb 3×3, prism removes a colour and swaps with anything, line+line cross, bomb+bomb 5×5; none on level 1');
}

/* 4. лёд, энергия, слова, бонус за ходы, звёзды */
{
  const st = board(4, ['abcdefab', 'bcdeaabc', 'cd#aebcd', 'defabcde', 'efabcdef', 'fabcdefa', 'abcdefab', 'bcdefabc']);
  const ice0 = st.ice.reduce((a, b) => a + b, 0);
  const r = E.swap(st, idx(st, 4, 2), idx(st, 4, 1));
  assert.ok(r.ok);
  assert.ok(st.ice.reduce((a, b) => a + b, 0) < ice0, 'ice cracked under a match');
  const w = E.create(2, 'w'); const m = w.moves, s0 = w.score;
  const res = E.wordAnswered(w, true);
  assert.equal(w.moves, m + 1); assert.equal(w.score, s0 + E.WORD_POINTS); assert.equal(w.wordsOk, 1);
  assert.equal(res.steps[0].t, 'reward'); assert.ok(w.cells[res.steps[0].i].s, 'a special crystal as a reward');
  E.wordAnswered(w, false); assert.equal(w.moves, m + 1, 'no penalty for a mistake'); assert.equal(w.wordsTried, 2);
  w.energy = w.energyNeed + 3; assert.ok(E.energyFull(w)); E.useEnergy(w); assert.equal(w.energy, 3);
  w.energy = w.energyNeed * 3; assert.ok(E.takeEnergy(w)); assert.equal(w.energy, Math.floor(w.energyNeed / 2), 'one word card per move, surplus capped');
  const done = E.create(1, 'd'); done.score = 9999; done.wordsOk = 3; done.energy = 99; assert.equal(E.takeEnergy(done), false, 'no questions after all goals are met');
  // выигрыш: оставшиеся ходы → бонус, звёзды по очкам
  const v = E.create(1, 'v'); v.score = 5000; v.wordsOk = 3; v.moves = 4;
  const f = E.finish(v); assert.ok(f.won); assert.equal(f.bonus, 4 * E.MOVE_BONUS); assert.equal(f.score, 6000); assert.equal(f.stars, 2);
  assert.deepEqual(E.finish(v), f, 'finish is idempotent');
  const lose = E.create(1, 'l'); lose.score = 9999; lose.wordsOk = 1; const fl = E.finish(lose); assert.equal(fl.won, false); assert.equal(fl.stars, 0); assert.equal(fl.bonus, 0);
  assert.ok(E.rating(1, f) > 2000 && E.rating(1, fl) === 0);
  ok('ice cracks under matches; correct word: +1 move, +150, special crystal; mistake: no penalty; won level: moves → bonus; stars; rating only for wins');
}

/* 5. детерминированность: одно зерно и одни ходы — один результат («Экспедиция дня» одинакова для всех) */
{
  const play = seed => { const st = E.create(5, seed); const log = []; for (let k = 0; k < 15 && !st.over; k++) { const [a, b] = E.allMoves(st)[k % 3] || E.allMoves(st)[0]; E.swap(st, a, b); log.push(st.score); } return JSON.stringify([log, st.cells, st.ice]); };
  assert.equal(play(E.dailySeed(5, '2026-11-02')), play(E.dailySeed(5, '2026-11-02')));
  assert.notEqual(play(E.dailySeed(5, '2026-11-02')), play(E.dailySeed(5, '2026-11-03')));
  assert.equal(JSON.stringify(E.create(3, 'same').cells), JSON.stringify(E.create(3, 'same').cells));
  ok('deterministic: the same seed and moves give the same board and score; another day — another board');
}

/* 6. тысячи случайных ходов: поле всегда полное и устойчивое, ход всегда есть, каскады конечны, очки не превышают предел */
{
  let moves = 0, shuffles = 0, maxChain = 0, games = 0;
  for (const L of E.LEVELS) for (let gIdx = 0; gIdx < 40; gIdx++) {
    const st = E.create(L.id, 'fuzz' + L.id + '-' + gIdx); games++;
    assert.ok(full(st) && stable(st) && E.findMove(st), 'fresh board: full, no ready rows, has a move');
    let r = E.hashSeed('f' + gIdx);
    while (!st.over) {
      const all = E.allMoves(st); assert.ok(all.length, 'there is always a move');
      r = (Math.imul(r, 1103515245) + 12345) >>> 0;
      const [a, b] = all[r % all.length];
      const before = st.moves, res = E.swap(st, a, b);
      assert.ok(res.ok); assert.equal(st.moves, before - 1); moves++;
      assert.ok(full(st), 'no holes'); assert.ok(stable(st), 'no rows left after the cascade');
      assert.ok(res.steps.filter(s => s.t === 'clear').length <= 60);
      maxChain = Math.max(maxChain, st.stats.maxChain);
      shuffles += res.steps.filter(s => s.t === 'shuffle').length;
      assert.ok(new Set(st.cells.map(p => p.id)).size === st.n, 'unique crystal ids');
      if (r % 7 === 0) E.wordAnswered(st, true);
    }
    const f = E.finish(st);
    assert.ok(f.score <= E.scoreCap(L.id, f.movesUsed), 'score within the server limit');
  }
  ok(`fuzz: ${games} games, ${moves} random moves — board always full and settled, always a move (${shuffles} auto-shuffles without losing a move), longest cascade ×${maxChain}, scores within the limit`);
}

/* 7. сложность: два «игрока» (как новичок и внимательный ученик) — уровни проходимы, сложность растёт постепенно */
{
  function visible(st, a, b, L) {
    const c = E.clone(st), p = c.cells[a], q = c.cells[b];
    if (p.s === 'prism' || q.s === 'prism') return 40; if (p.s && q.s) return 45;
    c.cells[a] = q; c.cells[b] = p; let v = 0; const goal = L.goals.filter(g => g.type === 'collect').map(g => g.color);
    for (const g of E.groups(c)) { if (![...g.cells].some(i => i === a || i === b)) continue; v += g.cells.size * 3; const m = Math.max(...g.runs.map(r => r.cells.length)); v += m >= 5 ? 30 : g.runs.length > 1 ? 20 : m === 4 ? 12 : 0; if (goal.includes(g.c)) v += g.cells.size * 4; for (const i of g.cells) { if (c.cells[i].s) v += 15; if (c.ice[i]) v += 6 * c.ice[i]; } }
    return v + E.xy(c, Math.max(a, b))[1] * 0.3;
  }
  const rate = {};
  for (const kind of ['random', 'visible']) for (const L of E.LEVELS) {
    let won = 0; const N = 100;
    for (let i = 0; i < N; i++) {
      const st = E.create(L.id, 'sim' + i); let r = E.hashSeed(kind + i) || 1; const rand = () => ((r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 4294967296);
      while (!st.over) {
        const mv = E.allMoves(st); let best = mv[Math.floor(rand() * mv.length)];
        if (kind === 'visible') { let bv = -1; for (const [a, b] of mv) { const v = visible(st, a, b, L) + rand(); if (v > bv) { bv = v; best = [a, b]; } } }
        E.swap(st, best[0], best[1]);
        if (E.takeEnergy(st)) E.wordAnswered(st, rand() < 0.75);
        if (E.goalsMet(st)) break;
      }
      if (E.finish(st).won) won++;
    }
    (rate[kind] = rate[kind] || []).push(won);
  }
  for (const kind of ['random', 'visible']) for (let k = 1; k < 5; k++) assert.ok(rate[kind][k] <= rate[kind][k - 1] + 6, kind + ': difficulty grows gradually ' + rate[kind]);
  assert.ok(rate.visible.every(x => x >= 60), 'every level is winnable for an attentive player: ' + rate.visible);
  assert.ok(rate.random[0] >= 85, 'level 1 is easy even for a beginner: ' + rate.random[0]);
  ok('difficulty (wins out of 100, 75% correct words): beginner ' + rate.random.join(' / ') + ' · attentive ' + rate.visible.join(' / '));
}
/* 8. сервер считает так же: параметры уровней в supabase/schema.sql совпадают с движком */
{
  const { readFileSync } = await import('node:fs');
  const sqlText = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  const block = sqlText.slice(sqlText.indexOf('function public.crystal_cfg'), sqlText.indexOf(') as c(level'));
  const rows = [...block.matchAll(/\((\d), (\d+), (\d+), (\d+), (\d+), (\d+), (true|false)\)/g)].map(m => m.slice(1));
  assert.equal(rows.length, E.LEVELS.length);
  for (const [lv, moves, s1, s2, s3, words, scoreGoal] of rows) {
    const L = E.level(Number(lv)), sg = L.goals.find(g => g.type === 'score');
    assert.deepEqual([Number(moves), Number(s1), Number(s2), Number(s3)], [L.moves, ...L.stars], 'level ' + lv);
    assert.equal(Number(words), L.goals.find(g => g.type === 'words').n); assert.equal(scoreGoal === 'true', !!sg);
    if (sg) assert.equal(sg.n, L.stars[0], 'score goal = first star');
  }
  ok('server level table (moves, stars, words, score goal) matches the engine');
}
console.log('PASS crystal engine: rules, specials, cascades, moves, shuffle, scoring, determinism, difficulty');
