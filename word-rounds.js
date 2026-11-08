/* LEXI · раунды блоками (2026-11-03).
 * Большой набор слов (урок, модуль, весь учебник) проходится по порядку небольшими блоками:
 * раунд 1 — первые 15 слов, раунд 2 — следующие 15 … пока не пройдены все. Внутри блока слова перемешиваются.
 * Слово считается пройденным, когда на него ответили (верно или неверно) — так прерванный раунд продолжается
 * с того же места. Когда пройдены все слова, начинается новый круг (cycle + 1).
 * Прогресс хранится отдельно для каждого набора и игры («ключ»): на устройстве (localStorage, у вошедшего —
 * отдельно для аккаунта) и, если ученик вошёл, в облаке (таблица word_rounds, функция rounds_save) — продолжить
 * можно на другом устройстве. Повторы внутри одной игры (повтор ошибок) этим модулем не ограничиваются. */
(() => {
  'use strict';
  const KEY = 'lexigo_rounds_v1';
  const MAX_KEYS = 300, MAX_IDS = 3000;
  const ID = /^[A-Za-z0-9_-]{1,24}$/, SCOPE = /^[A-Za-z0-9:_|.-]{1,80}$/;
  const SIZE = { pairs: 9 };                       // «Найди пару»: столько пар помещается на поле
  const MIN = { quiz: 2, truefalse: 2, pairs: 2, listen: 2, boss: 3 };
  const DEFAULT_SIZE = 15;
  let pending = null;                              // источник следующей игры (весь учебник, «Несколько игр»)
  const listeners = new Set();

  /* ---------- хранение ---------- */
  function readAll() {
    try {
      const x = JSON.parse(localStorage.getItem(KEY) || '{}');
      if (!x || typeof x !== 'object' || Array.isArray(x)) return {};
      const clean = {};
      for (const [k, v] of Object.entries(x)) {
        if (!SCOPE.test(k) || !v || typeof v !== 'object') continue;
        clean[k] = { seen: Array.isArray(v.seen) ? v.seen.filter(id => typeof id === 'string' && ID.test(id)).slice(0, MAX_IDS) : [], cycle: Math.max(0, Math.floor(+v.cycle || 0)), at: Math.max(0, +v.at || 0), synced: !!v.synced };
      }
      return clean;
    } catch { return {}; }
  }
  function writeAll(all) {
    const keys = Object.keys(all);
    if (keys.length > MAX_KEYS) keys.sort((a, b) => all[a].at - all[b].at).slice(0, keys.length - MAX_KEYS).forEach(k => delete all[k]);
    try { localStorage.setItem(KEY, JSON.stringify(all)); return true; } catch { return false; }
  }
  const entry = (all, key) => all[key] || (all[key] = { seen: [], cycle: 0, at: 0, synced: false });

  /* ---------- раунды ---------- */
  const sizeFor = mode => SIZE[mode] || DEFAULT_SIZE;
  const shuffle = a => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
  const uniqueById = list => { const s = new Set(); return list.filter(w => w && !s.has(w.id) && s.add(w.id)); };
  // Stable balanced boundaries preserve dictionary order and existing seen IDs.
  function groups(pool, max = DEFAULT_SIZE) {
    if (!Number.isInteger(max) || max < 1) throw new RangeError('Invalid group size');
    if (!pool.length) return [];
    const count = Math.ceil(pool.length / max), base = Math.floor(pool.length / count), extra = pool.length % count;
    let offset = 0;
    return Array.from({ length: count }, (_, i) => { const size = base + (i < extra ? 1 : 0); const group = pool.slice(offset, offset + size); offset += size; return group; });
  }

  /* состояние набора: сколько слов пройдено, какой раунд */
  function info(key, pool, size) {
    pool = uniqueById(pool);
    const e = readAll()[key] || { seen: [], cycle: 0 };
    const seen = new Set(e.seen), done = pool.filter(w => seen.has(w.id)).length, total = pool.length;
    const batches = groups(pool, size), rounds = Math.max(1, batches.length);
    const next = batches.findIndex(batch => batch.some(w => !seen.has(w.id)));
    return { key, total, done, size, groupSize: next < 0 ? 0 : batches[next].length, cycle: e.cycle || 0, rounds, round: next < 0 ? rounds : next + 1, complete: total > 0 && done >= total };
  }

  /* следующий блок слов: первые ещё не пройденные по порядку набора; pick — особый отбор (пары без одинаковых переводов) */
  function plan({ key, pool, mode, size = sizeFor(mode), pick = null }) {
    pool = uniqueById(pool);
    const all = readAll(), e = entry(all, key), poolIds = new Set(pool.map(w => w.id));
    let seen = new Set(e.seen.filter(id => poolIds.has(id)));
    let restarted = false;
    if (pool.length && pool.every(w => seen.has(w.id))) {           // круг пройден — новый круг с первых слов
      e.seen = e.seen.filter(id => !poolIds.has(id)); e.cycle = (e.cycle || 0) + 1; e.at = Date.now(); e.synced = false;
      writeAll(all); push(key); seen = new Set(); restarted = true;
    }
    const group = groups(pool, size).find(batch => batch.some(w => !seen.has(w.id))) || [];
    const remaining = group.filter(w => !seen.has(w.id));
    let batch = (pick ? pick(remaining) : remaining).slice(0, size);
    const min = MIN[mode] || 1;
    if (batch.length < min) {                                          // последний неполный раунд меньше минимума игры — добираем уже пройденными
      const extra = (pick ? pick([...batch, ...pool.filter(w => !batch.includes(w))]) : pool).filter(w => !batch.includes(w));
      batch = [...batch, ...extra].slice(0, Math.max(min, batch.length));
    }
    return { words: shuffle(batch), info: { ...info(key, pool, size), restarted, mode, poolIds: pool.map(w => w.id) } };
  }

  function mark(key, id) {
    if (!SCOPE.test(key) || !ID.test(String(id))) return;
    const all = readAll(), e = entry(all, key);
    if (e.seen.includes(id)) return;
    e.seen.push(id); e.seen = e.seen.slice(-MAX_IDS); e.at = Date.now(); e.synced = false;
    writeAll(all); push(key);
    listeners.forEach(f => { try { f(key, id); } catch { /* */ } });
  }
  function reset(key) { const all = readAll(); if (all[key]) { all[key].seen = []; all[key].cycle = (all[key].cycle || 0) + 1; all[key].at = Date.now(); all[key].synced = false; writeAll(all); push(key); } }
  /* перенос старого прогресса «Весь учебник» (lexigo_whole_book_v1_*) — один раз */
  function adopt(key, ids) {
    const all = readAll(); if (all[key]) return;
    const e = entry(all, key); e.seen = (ids || []).filter(id => typeof id === 'string' && ID.test(id)).slice(-MAX_IDS); e.at = Date.now(); writeAll(all); push(key);
  }

  /* ---------- облако: продолжить на другом устройстве ---------- */
  let cloud = null, timer = null; const dirty = new Set();
  function push(key) { dirty.add(key); if (!cloud) return; clearTimeout(timer); timer = setTimeout(flush, 1200); }
  async function flush() {
    if (!cloud || !dirty.size) return;
    const all = readAll(), keys = [...dirty]; dirty.clear();
    for (const k of keys) {
      const e = all[k]; if (!e) continue;
      try {
        const { error } = await cloud.sb.rpc('rounds_save', { p_scope: k, p_seen: e.seen, p_cycle: e.cycle || 0 });
        if (error) throw error;
        const now = readAll(); if (now[k] && now[k].at === e.at) { now[k].synced = true; writeAll(now); }
      } catch (err) { dirty.add(k); console.warn('LEXI rounds: not saved to the cloud yet', err && err.message); }
    }
  }
  async function pull() {
    const { data, error } = await cloud.sb.from('word_rounds').select('scope,seen,cycle,updated_at').eq('user_id', cloud.user.id).limit(MAX_KEYS);
    if (error) throw error;
    const all = readAll();
    for (const r of data || []) {
      if (!SCOPE.test(r.scope)) continue;
      const e = all[r.scope], seen = (r.seen || []).filter(id => ID.test(id));
      if (!e || (r.cycle || 0) > (e.cycle || 0)) all[r.scope] = { seen, cycle: r.cycle || 0, at: Date.parse(r.updated_at) || Date.now(), synced: true };
      else if ((r.cycle || 0) === (e.cycle || 0)) { const u = [...new Set([...e.seen, ...seen])].slice(-MAX_IDS); if (u.length !== e.seen.length) { e.seen = u; } if (u.length !== seen.length) { e.synced = false; dirty.add(r.scope); } }
    }
    for (const [k, e] of Object.entries(all)) if (!e.synced) dirty.add(k);
    writeAll(all);
  }
  const hook = () => { try {
    window.LexigoCloudSession?.ready.then(async c => {
      if (!c || !c.user) return;
      cloud = c;
      try { await pull(); } catch (e) { console.warn('LEXI rounds: cloud progress not loaded', e && e.message); }
      flush();
      listeners.forEach(f => { try { f(null, null); } catch { /* */ } });
    });
  } catch { /* гостевой режим */ } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
  window.addEventListener('pagehide', () => { if (cloud && dirty.size) flush(); });

  /* ---------- запуск игры из внешнего источника (весь учебник, «Несколько игр») ---------- */
  function launch({ key, pool, mode, types, size, pick, label, again }) {
    const p = plan({ key, pool, mode, size, pick });
    if (!p.words.length) return false;
    pending = { ...p.info, label: label || '', types: types || null, again: again || (() => launch({ key, pool, mode, types, size, pick, label })) };
    start(mode, p.words, types || undefined);
    if (pending) pending = null;                                       // старт не состоялся (слов мало и т. п.)
    return true;
  }
  /* practice-controller.js берёт источник в start() */
  function take(mode) { const p = pending; pending = null; return p && p.mode === mode ? p : null; }

  const ofWords = n => (n % 10 === 1 && n % 100 !== 11) ? 'слова' : 'слов';   // «из 21 слова», «из 300 слов»
  function label(r) {
    const i = info(r.key, (r.poolIds || []).map(id => ({ id })), r.size);
    return i.done + ' из ' + i.total + ' ' + ofWords(i.total) + ' · Группа ' + i.round + ' из ' + i.rounds + ' · ' + i.groupSize + ' слов';
  }

  window.LexiRounds = Object.freeze({ groups, plan, info, mark, reset, adopt, launch, take, label, ofWords, sizeFor, onChange: f => listeners.add(f), flush, DEFAULT_SIZE });
})();

