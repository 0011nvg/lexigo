// LEXI — «Конструктор слов»: набор букв всегда совпадает с правильным написанием (2026-11-02 v2).
// Без браузера: node tests/word-builder.mjs
// Проверяет все словари Spotlight 2–9, типичные авторские уроки учителя и случайное перемешивание.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ROOT = new URL('../', import.meta.url);
const B = require(new URL('word-builder.js', ROOT).pathname);
const ok = m => console.log('  ✓ ' + m);
const multiset = a => [...a].sort().join('\u0001');

// --- 1. explicit cases: repeated letters, case, hyphen, apostrophe, punctuation, unicode ---
const cases = {
  apple: 'apple', coffee: 'coffee', bookkeeper: 'bookkeeper', Mississippi: 'Mississippi', balloon: 'balloon', committee: 'committee',
  London: 'London', UK: 'UK', TV: 'TV', Monday: 'Monday', 'T-shirt': 'T-shirt', 'T‑shirt': 'T-shirt', 'ice-cream': 'ice-cream',
  "don't": "don't", 'baker’s': "baker's", 'Hello!': 'Hello', 'Mr.': 'Mr', 'Really?': 'Really', ' cat ': 'cat', 'café': 'café',
  'soft­ware': 'software', 'zero​width': 'zerowidth', 'café': 'café'
};
for (const [en, want] of Object.entries(cases)) {
  const p = B.prepare({ en });
  assert.ok(p.ok, en + ' must be playable'); assert.equal(p.answer, want, en);
  assert.equal(p.tiles.length, Array.from(want).length, en + ': tile count');
  assert.equal(multiset(p.tiles), multiset(Array.from(want)), en + ': same letters, same number of times');
  assert.ok(B.validate(p.tiles, p.answer), en + ': validate');
  assert.ok(B.check(Array.from(want).join(''), p.answer), en + ': correct order accepted');
  if (new Set(want).size > 1) assert.notEqual(p.tiles.join(''), want, en + ': tiles are shuffled');
}
const count = (s, c) => Array.from(s).filter(x => x === c).length;
for (const w of ['coffee', 'bookkeeper', 'Mississippi', 'balloon', 'committee']) {
  const p = B.prepare(w);
  for (const c of new Set(w)) assert.equal(count(p.tiles.join(''), c), count(w, c), w + ': letter ' + c);
}
assert.deepEqual(B.prepare('London').tiles.filter(t => t === t.toUpperCase()), ['L'], 'capital letter of a proper noun is kept, only one');
assert.deepEqual(B.prepare('UK').tiles.sort(), ['K', 'U']);
assert.equal(B.check('london', 'London'), false, 'case matters: the tiles carry the capital');
assert.equal(B.check('aplpe', 'apple'), false, 'wrong order rejected');
ok('repeated letters (coffee, bookkeeper, Mississippi), capitals (London, UK), hyphen/apostrophe variants, end punctuation, invisible characters');

// --- 2. not for the builder: phrases, one letter, too long → skipped, never broken ---
for (const en of ['get up', 'a/an', 'How are you?', '(to) swim', 'living room', 'Thank you!', 'I', 'a', '', '   ', 'antidisestablishment', '123', 'кошка', 'cat, dog'])
  assert.equal(B.prepare({ en }).ok, false, JSON.stringify(en) + ' must be skipped');
ok('phrases, one-letter words, words over 14 letters, digits and Cyrillic are skipped');

// --- 3. validate catches every kind of mismatch ---
assert.ok(B.validate(['p', 'a', 'l', 'e', 'p'], 'apple'));
assert.equal(B.validate(['p', 'a', 'l', 'e'], 'apple'), false, 'missing letter');
assert.equal(B.validate(['p', 'a', 'l', 'e', 'p', 'x'], 'apple'), false, 'extra letter');
assert.equal(B.validate(['p', 'a', 'l', 'e', 'e'], 'apple'), false, 'wrong repeat');
assert.equal(B.validate(['P', 'a', 'l', 'e', 'p'], 'apple'), false, 'wrong case');
assert.equal(B.validate(['pa', 'l', 'e', 'p'], 'apple'), false, 'two letters on one tile');
ok('validation rejects missing, extra, wrongly repeated, wrongly cased and merged tiles');

// --- 4. shuffling only changes the order (seeded random, 2000 runs) ---
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
for (let i = 0; i < 2000; i++) {
  const w = ['bookkeeper', 'Mississippi', 'coffee', "don't", 'T-shirt', 'aa', 'ab'][i % 7];
  const t = B.shuffle(Array.from(w), rnd);
  assert.equal(multiset(t), multiset(Array.from(w)));
  if (new Set(w).size > 1) assert.notEqual(t.join(''), w);
}
ok('2000 shuffles keep the exact set of letters; the order always differs when it can');

// --- 5. every dictionary: Spotlight 2–9 (9417 entries) ---
const ctx = { window: {} }; ctx.window.window = ctx.window; vm.createContext(ctx);
for (const f of ['data.js', 'vocabulary/spotlight-2-4-additions.js', ...[5, 6, 7, 8, 9].map(g => `vocabulary/spotlight-${g}.js`)])
  vm.runInContext(readFileSync(new URL(f, ROOT), 'utf8'), ctx, { filename: f });
const books = ctx.window.LEXIGO_DATA.books;
let total = 0, playable = 0, withRepeats = 0, withCaps = 0;
const byGrade = {};
for (const b of books) for (const s of b.sections) for (const w of s.words) {
  total++;
  const p = B.prepare(w);
  if (!p.ok) { assert.notEqual(p.reason, 'tiles', w.id + ' ' + w.en + ': tiles mismatch'); continue; }
  playable++; byGrade[b.grade] = (byGrade[b.grade] || 0) + 1;
  assert.equal(multiset(p.tiles), multiset(Array.from(p.answer)), w.id + ' ' + w.en);
  assert.ok(B.letterCount(p.answer) >= 2 && B.letterCount(p.answer) <= 14, w.id);
  assert.ok(B.isSingleWord(w.en), w.id + ' is a single word');
  assert.ok(!/\s/.test(p.answer), w.id + ' has no spaces');
  if (new Set(p.answer.toLowerCase()).size < p.answer.length) withRepeats++;
  if (/[A-Z]/.test(p.answer)) withCaps++;
  for (let k = 0; k < 3; k++) { const q = B.prepare(w, rnd); assert.ok(B.validate(q.tiles, q.answer), w.id); }
}
assert.ok(total >= 9417, 'all entries scanned: ' + total);
assert.ok(playable > 6000, 'most single words are playable: ' + playable);
ok(`all ${total} dictionary entries: ${playable} playable words (${withRepeats} with repeated letters, ${withCaps} with capitals) — tiles always match; phrases skipped (` + Object.entries(byGrade).map(([g, n]) => g + ': ' + n).join(', ') + ')');

// --- 6. teacher's own lessons: the same parser as the cabinet ---
const cctx = { window: { LexiWordBuilder: B, LEXIGO_CLOUD: {} }, crypto: globalThis.crypto, console };
cctx.window.window = cctx.window; cctx.self = cctx.window; vm.createContext(cctx);
vm.runInContext(readFileSync(new URL('cloud-core.js', ROOT), 'utf8'), cctx, { filename: 'cloud-core.js' });
const Core = cctx.window.LexigoCloud;
const text = ['apple — яблоко', 'coffee - кофе', 'Mississippi: Миссисипи', 'T‑shirt — футболка', 'ice cream — мороженое', 'London — Лондон',
  'butcher’s — мясная лавка', 'Hello! — Привет!', 'bookkeeper\tбухгалтер', '  sheep   —  овца ', 'get up — вставать', 'I — я'].join('\n');
const lesson = { id: '0f3c2a10-1111-2222-3333-444455556666', words: Core.parseWordList(text) };
const words = Core.customWords(lesson);
assert.equal(words.length, 12);
const fit = Core.modeFit('builder', words);
assert.ok(fit.ok && fit.usable === 9 && /пропускаются/.test(fit.note), 'builder uses 9 of 12 words, phrases/one-letter skipped: ' + JSON.stringify(fit));
for (const w of words) { const p = B.prepare(w); if (p.ok) assert.equal(multiset(p.tiles), multiset(Array.from(p.answer)), w.en); }
assert.equal(B.prepare(words.find(w => w.en.startsWith('T'))).answer, 'T-shirt');
ok('teacher lesson: 9 of 12 words playable (repeats, capitals, typographic hyphen/apostrophe), «ice cream», «get up» and «I» skipped with a note');

console.log('PASS word builder: tiles match the correct spelling everywhere');
