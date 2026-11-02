/* LEXIGO Cloud core — общий модуль для главной, входа и кабинетов (2026-11-02).
 * Подключается после config.js и account-hint.js. Библиотека Supabase загружается
 * только если облако настроено (config.js), поэтому гостевой режим ничего лишнего не грузит. */
(() => {
  'use strict';
  const cfg = window.LEXIGO_CLOUD || {};
  // https only; plain http is accepted solely for a local test stack on this computer
  const configured = typeof cfg.url === 'string' && /^(https:\/\/[a-z0-9.-]+|http:\/\/(127\.0\.0\.1|localhost)(:\d+)?)$/i.test(cfg.url.replace(/\/$/, '')) && typeof cfg.anonKey === 'string' && cfg.anonKey.length > 20;
  const VENDOR = 'vendor/supabase-2.118.0.min.js';
  let clientPromise = null;

  function loadVendor() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script'); s.src = VENDOR; s.async = true;
      s.onload = () => resolve(); s.onerror = () => reject(new Error('Не удалось загрузить модуль аккаунтов'));
      document.head.append(s);
    });
  }
  function client(opts = {}) {
    if (!configured) return Promise.reject(new Error('not-configured'));
    if (!clientPromise) clientPromise = loadVendor().then(() => window.supabase.createClient(cfg.url.replace(/\/$/, ''), cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: !!opts.detectSessionInUrl, flowType: 'implicit', storageKey: 'lexigo-auth' }
    }));
    return clientPromise;
  }

  /* ---------- game vocabulary shared with the cabinets ---------- */
  const LEVEL_TITLES = ['Новичок', 'Путешественник', 'Исследователь', 'Следопыт', 'Знаток слов', 'Мастер слов', 'Капитан LEXIGO', 'Легенда LEXIGO'];
  const levelStart = l => 50 * l * (l - 1);
  function levelOf(xp) { xp = Math.max(0, Number(xp) || 0); let l = 1; while (xp >= levelStart(l + 1)) l++; return { level: l, title: LEVEL_TITLES[Math.min(l - 1, LEVEL_TITLES.length - 1)], from: levelStart(l), to: levelStart(l + 1), xp }; }
  const MODES = { cards: 'Карточки', quiz: 'Выбери перевод', spell: 'Напиши слово', pairs: 'Найди пару', truefalse: 'Верно / неверно', fix: 'Исправь ошибку', audio: 'Аудиодиктант', crystals: 'Кристаллы', boss: 'Финальный тест', mixed: 'Тренировка дня', builder: 'Конструктор слов', listen: 'Слушай и выбирай', review: 'Работа над ошибками' };
  const ASSIGNABLE = ['quiz', 'spell', 'pairs', 'truefalse', 'cards', 'fix', 'builder', 'listen', 'audio', 'mixed', 'boss', 'crystals'];
  const BADGES = [
    ['streak3', '🔥', 'Три дня подряд', 'Занимайся 3 дня подряд', s => s.streak_best >= 3],
    ['streak7', '📅', 'Неделя слов', 'Занимайся 7 дней подряд', s => s.streak_best >= 7],
    ['perfect', '⭐', 'Без единой ошибки', 'Пройди раунд из 5+ слов без ошибок', s => s.perfect_games >= 1],
    ['missions', '🎯', 'Охотник за миссиями', 'Выполни 10 ежедневных миссий', s => s.missions_total >= 10],
    ['boss', '🛡️', 'Победитель стража', 'Пройди финальный тест модуля', s => s.bosses >= 1],
    ['boss5', '🏆', 'Покоритель модулей', 'Пройди финальные тесты 5 модулей', s => s.bosses >= 5],
    ['level5', '🎓', 'Знаток слов', 'Достигни 5 уровня', s => levelOf(s.xp).level >= 5]
  ];
  const AVATARS = { cat: '🐱', fox: '🦊', owl: '🦉', panda: '🐼', lion: '🦁', rabbit: '🐰', dino: '🦖', rocket: '🚀', star: '⭐', book: '📘' };

  let wordIndex = null;
  function words() {
    if (wordIndex) return wordIndex;
    wordIndex = new Map();
    const DB = window.LEXIGO_DATA;
    if (DB) for (const b of DB.books) b.sections.forEach((s, si) => s.words.forEach(w => wordIndex.set(w.id, { en: w.en, ru: w.ru, grade: b.grade, section: si, module: s.module, title: s.title })));
    return wordIndex;
  }
  const NON_LEXICAL = /^Module\s+\d+[a-z]?$/i;
  const isLexical = w => !!w && !(NON_LEXICAL.test(String(w.en).trim()) && !/[а-яё]/i.test(String(w.ru)));
  /* Custom lesson words get stable ids: c_<first 8 hex of lesson id>_<index> */
  const customWordId = (lessonId, i) => 'c_' + String(lessonId).replace(/-/g, '').slice(0, 8) + '_' + i;
  function customWords(lesson) {
    return (Array.isArray(lesson.words) ? lesson.words : []).slice(0, 200).map((w, i) => ({ id: customWordId(lesson.id, i), en: String(w.en || '').slice(0, 80), ru: String(w.ru || '').slice(0, 120) })).filter(w => w.en && w.ru);
  }
  /* "word — translation" lines → [{en,ru}] */
  function parseWordList(text) {
    const out = [], seen = new Set();
    for (const raw of String(text || '').split(/\r?\n/)) {
      const line = raw.trim(); if (!line) continue;
      const m = line.match(/^(.+?)\s*(?:\t|\s[—–-]\s|\s?[—–]\s?|;|=|:)\s*(.+)$/);
      if (!m) continue;
      const en = m[1].trim().replace(/\s+/g, ' ').slice(0, 80), ru = m[2].trim().replace(/\s+/g, ' ').slice(0, 120);
      if (!en || !ru || !/[a-z]/i.test(en)) continue;
      const k = en.toLowerCase() + '|' + ru.toLowerCase(); if (seen.has(k)) continue; seen.add(k);
      out.push({ en, ru });
      if (out.length >= 200) break;
    }
    return out;
  }

  /* ---------- tiny safe DOM helper (text only, never innerHTML with data) ---------- */
  function h(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
      else n.setAttribute(k, v === true ? '' : String(v));
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid instanceof Node ? kid : String(kid));
    return n;
  }
  const fmtDate = (d, withTime) => { if (!d) return ''; const x = new Date(d); return x.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + (withTime ? ', ' + x.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : ''); };
  const localDay = (t = new Date()) => t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  function clientId() { const a = new Uint8Array(12); crypto.getRandomValues(a); return 's' + Date.now().toString(36) + '-' + Array.from(a, b => b.toString(16).padStart(2, '0')).join(''); }

  /* Friendly Russian messages for Supabase Auth errors */
  function authMessage(err) {
    const m = String(err && (err.message || err.error_description || err) || '').toLowerCase();
    if (m.includes('invalid login')) return 'Неверная почта или пароль.';
    if (m.includes('email not confirmed')) return 'Почта ещё не подтверждена. Открой письмо от LEXIGO и нажми ссылку.';
    if (m.includes('already registered') || m.includes('already been registered')) return 'Аккаунт с этой почтой уже есть. Попробуй войти или восстановить пароль.';
    if (m.includes('password') && (m.includes('at least') || m.includes('weak') || m.includes('short'))) return 'Пароль слишком простой: нужно минимум 8 символов, лучше с цифрами.';
    if (m.includes('rate limit') || m.includes('too many') || m.includes('security purposes')) return 'Слишком много попыток. Подожди минуту и попробуй снова.';
    if (m.includes('invalid email') || m.includes('unable to validate email')) return 'Проверь адрес электронной почты.';
    if (m.includes('failed to fetch') || m.includes('network') || m.includes('загрузить модуль')) return 'Нет связи с сервером. Проверь интернет и попробуй ещё раз.';
    if (m.includes('same_password') || m.includes('different from the old')) return 'Новый пароль должен отличаться от старого.';
    if (m.includes('not-configured')) return 'Облачные аккаунты пока не подключены.';
    return 'Что-то пошло не так. Попробуй ещё раз чуть позже.';
  }

  window.LexigoCloud = Object.freeze({ configured, client, levelOf, MODES, ASSIGNABLE, BADGES, AVATARS, words, isLexical, customWords, customWordId, parseWordList, h, fmtDate, localDay, clientId, authMessage });
})();
