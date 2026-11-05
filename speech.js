/* LEXI · озвучивание английских слов (2026-11-05).
 * Один модуль для всех игр, списка слов, уроков учителя и облачка Лекси (раньше было три копии speak()).
 *
 * Что исправлено:
 *  - Голоса в Chrome/Edge/Android загружаются асинхронно: первый speak() уходил без голоса, и на устройстве
 *    с русским интерфейсом английское слово иногда читал русский голос. Теперь голоса кэшируются по событию
 *    voiceschanged, а если их ещё нет — один раз ждём до 600 мс (кроме iOS, где первое воспроизведение должно идти
 *    прямо из нажатия и голоса доступны сразу).
 *  - Голос выбирается по качеству: британский (Spotlight — британский курс) → американский → любой английский;
 *    «нейросетевые» и улучшенные голоса выше, шуточные голоса macOS (Bells, Zarvox…) исключены.
 *    lang высказывания совпадает с языком выбранного голоса (Safari не любит расхождения).
 *  - Наложение: перед новым словом предыдущее останавливается; после cancel() в Chrome нужна короткая пауза,
 *    иначе новое высказывание иногда теряется или «съедается» его начало.
 *  - Ссылка на текущее высказывание хранится, чтобы сборщик мусора Chrome не обрывал звук.
 *  - Текст для синтезатора (только для звука, на экране слово не меняется):
 *      «I» (местоимение «я») → «eye»: тот же звук /aɪ/, но синтезатор не примет его за букву или
 *      римскую цифру «один»; sb/smb → somebody, sth/smth → something; «/» → «or», скобки → паузы;
 *      blond(e), (un)healthy → слово целиком; n, v, pl, cj (пометки словаря) → noun, verb, plural, conjunction;
 *      Mr / Mrs / Ms / St → mister / missus / mizz / saint; многоточия убираются.
 *    Русская транскрипция никогда не подставляется.
 */
window.LexiSpeech = (() => {
  'use strict';
  const supported = () => typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance === 'function';
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const IOS = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);

  /* ---------- текст для синтезатора ---------- */
  const LABELS = { n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb', pl: 'plural', cj: 'conjunction', conj: 'conjunction', prep: 'preposition', pron: 'pronoun' };
  const WHOLE = { I: 'eye' };
  function speechText(raw) {
    let s = String(raw == null ? '' : raw).normalize('NFC').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    const bare = s.replace(/^[¡¿"“«(\[]+|[!?.,;:…"”»)\]]+$/g, '').trim();
    if (Object.hasOwn(WHOLE, bare)) return WHOLE[bare];
    if (Object.hasOwn(LABELS, bare)) return LABELS[bare];
    s = s
      .replace(/[‘’ʼ]/g, "'")
      .replace(/…|\.{3,}/g, ' ')                                 // «How about …?»
      .replace(/([A-Za-z])\(([A-Za-z]+)\)/g, '$1$2')                 // blond(e) → blonde
      .replace(/\(([A-Za-z]+)\)([A-Za-z])/g, '$1$2')                 // (un)healthy → unhealthy
      .replace(/\(\s*(?:pl|plural)\s*:\s*/gi, '(plural: ')
      .replace(/\b(?:smb|sb)\b\.?/g, 'somebody')
      .replace(/\b(?:smth|sth)\b\.?/g, 'something')
      .replace(/\bMrs\b\.?/g, 'Missus').replace(/\bMr\b\.?/g, 'Mister').replace(/\bMs\b\.?/g, 'Mizz')
      .replace(/\bSt\b\.?(?=\s+[A-Z])/g, 'Saint')
      .replace(/\betc\b\.?/g, 'et cetera')
      .replace(/₂/g, '2')
      .replace(/=/g, ' ')
      .replace(/\s*\+\s*-?ing\b/g, '')                               // «How about… + ing»
      .replace(/\s*\/\s*/g, ' or ')                                  // her/him → her or him
      .replace(/\s*[()[\]]\s*/g, ', ')                               // (later) → пауза
      .replace(/\s*\+\s*/g, ' ')
      .replace(/(?:\s*,\s*)+/g, ', ')
      .replace(/^[\s,]+|[\s,]+$/g, '')
      .replace(/,\s*([?!.])/g, '$1')
      .replace(/\s+/g, ' ').trim();
    return s;
  }
  /* Звучит ли запись иначе, чем пишется (пометки словаря n, v, pl…). Такие записи не годятся для аудиодиктанта. */
  function soundsDifferent(raw) {
    const bare = String(raw == null ? '' : raw).trim().replace(/[.!?]+$/, '');
    return Object.hasOwn(LABELS, bare);
  }

  /* ---------- выбор голоса ---------- */
  const NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Good News|Hysterical|Jester|Organ|Pipe Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Fred|Junior|Ralph|Kathy|Princess|Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\b/i;
  const GOOD_NAMES = /\b(Daniel|Kate|Serena|Arthur|Martha|Stephanie|Oliver|Samantha|Karen|Moira|Libby|Sonia|Ryan|Maisie|Thomas|Hazel|George|Susan)\b/;
  function langOf(v) { return String(v && v.lang || '').replace('_', '-'); }
  function score(v) {
    const lang = langOf(v).toLowerCase();
    if (!/^en(-|$)/.test(lang)) return -1;
    const name = String(v.name || '');
    if (NOVELTY.test(name)) return -1;
    let s = lang === 'en-gb' ? 40 : lang === 'en-us' ? 30 : 20;
    if (/natural|neural|online/i.test(name)) s += 20;          // Edge: Microsoft Libby Online (Natural)
    if (/premium|enhanced|improved/i.test(name)) s += 14;      // iOS/macOS: улучшенные голоса
    if (/^Google/i.test(name)) s += 12;                         // Chrome: Google UK English Female
    if (GOOD_NAMES.test(name)) s += 8;
    if (/compact|eloquence/i.test(name)) s -= 6;
    if (v.localService) s += 2;
    if (v.default) s += 1;
    return s;
  }
  function pickVoice(list) {
    let best = null, top = 0;
    for (const v of list || []) { const s = score(v); if (s > top) { top = s; best = v; } }
    return best;
  }
  let voices = [], chosen = null, noticeShown = false;
  function loadVoices() {
    try { voices = window.speechSynthesis.getVoices() || []; } catch { voices = []; }
    chosen = pickVoice(voices);
    return voices;
  }
  function englishVoice() { if (!voices.length || !chosen) loadVoices(); return chosen; }
  const waiters = [];
  if (supported()) {
    loadVoices();
    try {
      const onChange = () => { loadVoices(); while (waiters.length) waiters.shift()(); };
      if (window.speechSynthesis.addEventListener) window.speechSynthesis.addEventListener('voiceschanged', onChange);
      else window.speechSynthesis.onvoiceschanged = onChange;
    } catch { /* старые браузеры */ }
  }
  function whenVoices(ms) {
    return new Promise(resolve => {
      if (voices.length) return resolve();
      const t = setTimeout(done, ms); function done() { clearTimeout(t); const i = waiters.indexOf(done); if (i >= 0) waiters.splice(i, 1); resolve(); }
      waiters.push(done);
    });
  }
  function noEnglishNotice() {
    if (noticeShown || !voices.length || chosen) return;
    noticeShown = true;
    const text = 'На этом устройстве не найден английский голос. Добавьте английский язык озвучки в настройках устройства — тогда слова будут звучать правильно.';
    try { if (window.LexiQuest && window.LexiQuest.toast) window.LexiQuest.toast(text, 'think'); else console.warn('LEXI speech: ' + text); } catch { /* cosmetic */ }
  }

  /* ---------- воспроизведение ---------- */
  let current = null, seq = 0, settled = false; const BORN = performance.now();
  function speak(raw, opts = {}) {
    if (!supported()) { if (!opts.silent) alert('Озвучивание недоступно в этом браузере.'); return false; }
    const text = speechText(raw); if (!text) return false;
    const synth = window.speechSynthesis, my = ++seq;
    const busy = synth.speaking || synth.pending;
    try { synth.cancel(); } catch { /* ignore */ }
    const go = () => {
      if (my !== seq) return;                                 // уже нажали другое слово — старое не играем
      const u = new SpeechSynthesisUtterance(text), v = englishVoice();
      if (v) { u.voice = v; u.lang = langOf(v); } else { u.lang = 'en-GB'; noEnglishNotice(); }
      u.rate = opts.rate || (text.split(' ').length <= 3 ? 0.85 : 0.9);
      u.pitch = 1; u.volume = 1;
      u.onend = u.onerror = () => { if (current === u) current = null; };
      current = u;
      try { synth.resume(); } catch { /* Chrome иногда «застревает» на паузе после смены вкладки */ }
      synth.speak(u);
    };
    // ждём голоса один раз и только в первые секунды после загрузки: дальше пустой список значит «голосов нет», и задержки не нужны
    if (!voices.length && !IOS && !settled && performance.now() - BORN < 4000) { whenVoices(600).then(() => { settled = true; setTimeout(go, busy ? 60 : 0); }); return true; }
    if (busy && !IOS) setTimeout(go, 60); else go();
    return true;
  }
  function stop() { seq++; try { if (supported()) window.speechSynthesis.cancel(); } catch { /* ignore */ } current = null; }

  return Object.freeze({ supported, speak, stop, speechText, soundsDifferent, pickVoice, englishVoice, score, get current() { return current; } });
})();
