/* LEXI — «Конструктор слов» (составь слово из букв). Единственный источник правил (2026-11-02, v2).
 * Используется игрой (local-game-adapter.js, practice-controller.js), кабинетами (cloud-core.js)
 * и автотестами (tests/word-builder.mjs) — поэтому набор букв всегда совпадает с правильным ответом.
 *
 * Правила:
 *  • только отдельные слова: don't, ice-cream, T-shirt, Mr., Hello! — да; get up, a/an, How are you? — нет;
 *  • ответ = слово так, как оно написано в словаре, без знаков в конце (Hello! → Hello, Mr. → Mr);
 *    типографские дефисы и апострофы приводятся к обычным (T‑shirt → T-shirt, baker’s → baker's),
 *    невидимые символы (мягкий перенос, нулевой пробел) удаляются;
 *  • регистр сохраняется: London, Monday, English, UK пишутся с заглавной — и плитка будет заглавной;
 *  • плитки = ровно символы ответа: каждая буква столько раз, сколько она встречается в слове;
 *  • перемешивание только меняет порядок; перед запуском набор проверяется (validate),
 *    неподходящее слово пропускается, а не ломает игру. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.LexiWordBuilder = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MIN_LETTERS = 2, MAX_LETTERS = 14;
  const INVISIBLE = /[­​-‍⁠﻿]/g;
  const LATIN = '[A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u024F]';
  const SINGLE = new RegExp('^' + LATIN + '+(?:[-\']' + LATIN + '+)*$');
  const LETTER = new RegExp(LATIN);

  /* «правильное написание» записи словаря для конструктора */
  function answer(en) {
    let s = String(en == null ? '' : en).normalize('NFC').replace(INVISIBLE, '').replace(/ /g, ' ').trim();
    s = s.replace(/^[¡¿"“«(\[]+|[!?.,;:…"”»)\]]+$/g, '').trim();                 // знаки вокруг слова
    s = s.replace(/[‐‑‒–−]/g, '-').replace(/[’‘ʼ`´]/g, "'"); // типографские дефисы и апострофы
    return s;
  }
  const letterCount = s => Array.from(s).filter(c => LETTER.test(c)).length;
  function isSingleWord(en) { return SINGLE.test(answer(en)); }
  function tilesOf(form) { return Array.from(form); }
  /* набор плиток ровно совпадает с ответом: те же символы, столько же раз */
  function validate(tiles, form) {
    if (!Array.isArray(tiles) || typeof form !== 'string' || !form) return false;
    const want = Array.from(form);
    if (tiles.length !== want.length) return false;
    const count = new Map();
    for (const c of want) count.set(c, (count.get(c) || 0) + 1);
    for (const t of tiles) { if (typeof t !== 'string' || Array.from(t).length !== 1 || !count.get(t)) return false; count.set(t, count.get(t) - 1); }
    return [...count.values()].every(n => n === 0);
  }
  /* Fisher–Yates: меняется только порядок. Если возможно, порядок отличается от ответа. */
  function shuffle(tiles, rnd = Math.random) {
    const src = tiles.slice(), distinct = new Set(src).size > 1;
    let out = src;
    for (let attempt = 0; attempt < 25; attempt++) {
      out = src.slice();
      for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
      if (!distinct || out.join('') !== src.join('')) break;
    }
    if (distinct && out.join('') === src.join('')) out.push(out.shift());   // крайний случай: циклический сдвиг
    return out;
  }
  /* → { ok, answer, tiles, reason } — всё, что нужно игре; ok:false = слово пропускается */
  function prepare(word, rnd = Math.random) {
    const en = word && typeof word === 'object' ? word.en : word;
    const form = answer(en);
    if (!form) return { ok: false, reason: 'empty' };
    if (!SINGLE.test(form)) return { ok: false, answer: form, reason: 'phrase' };
    const n = letterCount(form);
    if (n < MIN_LETTERS || n > MAX_LETTERS) return { ok: false, answer: form, reason: 'length' };
    const ordered = tilesOf(form), tiles = shuffle(ordered, rnd);
    if (!validate(tiles, form)) return { ok: false, answer: form, reason: 'tiles' };
    return { ok: true, answer: form, tiles };
  }
  function isBuilderWord(word) { return prepare(word, () => 0.5).ok; }
  /* ответ ученика (склеенные плитки) против правильного написания */
  function check(built, form) { return answer(built) === answer(form); }
  return Object.freeze({ MIN_LETTERS, MAX_LETTERS, answer, isSingleWord, isBuilderWord, validate, shuffle, prepare, check, letterCount });
});
