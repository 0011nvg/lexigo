/* LEXI — «живой» Лекси на главной (2026-11-02).
 * Только оформление: дыхание, покачивание, моргание, искры кристалла, реплики по наведению/нажатию.
 * Никаких данных не меняет. Уважает prefers-reduced-motion и спокойный режим (body.calm). */
(() => {
  'use strict';
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const calm = () => document.body.classList.contains('calm');

  function greeting(date = new Date()) {
    const h = date.getHours();
    if (h >= 5 && h < 12) return 'Доброе утро';
    if (h >= 12 && h < 18) return 'Добрый день';
    if (h >= 18 && h < 23) return 'Добрый вечер';
    return 'Доброй ночи';
  }
  function partOfDay(date = new Date()) {
    const h = date.getHours();
    return h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 18 ? 'day' : h >= 18 && h < 23 ? 'evening' : 'night';
  }
  /* 2026-11-02: Lexi sometimes speaks English — short, friendly, with a quiet Russian hint underneath.
     [english, russian hint, mood] — mood picks the little animation: wave (hello), hop (joy), tilt (surprise). */
  const PHRASES = {
    morning: [['Good morning!', 'Доброе утро! Начнём с пары слов?', 'wave'], ['Hello! Ready to play?', 'Привет! Поиграем?', 'wave']],
    day: [['Hey there!', 'Привет! Готов к маленькому приключению?', 'wave'], ['Ready to play?', 'Пять минут — и пара новых слов твоя!', 'hop']],
    evening: [['Good evening!', 'Повторим слова перед сном?', 'wave'], ['Let’s learn!', 'Вечером слова запоминаются особенно хорошо.', 'hop']],
    night: [['Good night!', 'Одну короткую тренировку — и спать!', 'wave'], ['Sleepy time…', 'Уже поздно. Завтра продолжим!', 'tilt']],
    back: [['Welcome back!', 'С возвращением! Продолжим?', 'hop'], ['Hi again!', 'Рад тебя видеть! Продолжим учить слова?', 'wave']],
    poke: [['Hello, I’m Lexi!', 'Привет! Я Лекси, твой помощник в английском.', 'wave'], ['Let’s learn!', 'Давай учить слова вместе!', 'hop'], ['Ready to play?', 'Готов поиграть?', 'hop'],
      ['You can do it!', 'У тебя всё получится!', 'hop'], ['Keep going!', 'Продолжай — ты молодец!', 'hop'], ['You’re a star!', 'Ты звезда! ⭐', 'hop'],
      ['Wow, a crystal!', 'Я нашёл кристалл слов!', 'tilt'], ['Meow!', 'Мяу! Это значит «привет» 😺', 'tilt'], ['Great job!', 'Отличная работа!', 'hop']]
  };
  const RECENT_KEY = 'lexi_live_recent';
  function pick(list) { // never the same line twice in a row, and not one of the last few
    let recent = []; try { recent = JSON.parse(sessionStorage.getItem(RECENT_KEY) || '[]'); } catch { recent = []; }
    const fresh = list.filter(x => !recent.includes(x[0])); const choice = (fresh.length ? fresh : list)[Math.floor(Math.random() * (fresh.length || list.length))];
    recent = [choice[0], ...recent.filter(x => x !== choice[0])].slice(0, Math.min(4, list.length - 1));
    try { sessionStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch { /* private mode */ }
    return choice;
  }
  const canSpeak = () => typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance === 'function';
  function speakEn(text) { // only after a tap — never automatic
    if (!canSpeak()) return; try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text.replace(/[⭐😺…]/g, '')); u.lang = 'en-GB'; u.rate = .9; const v = typeof englishVoice === 'function' ? englishVoice() : null; if (v) u.voice = v; speechSynthesis.speak(u); } catch { /* no voice */ }
  }

  /* Builds the animated Lexi block. Eyelids are positioned over the eyes of assets/lexi-wave.webp (520×520). */
  function art() {
    const wrap = document.createElement('div');
    wrap.className = 'lexi-live';
    wrap.innerHTML =
      '<button class="lexi-live-hit" type="button" aria-label="Лекси. Нажми — и он что-нибудь скажет по-английски"></button>' +
      '<p class="lexi-live-bubble" aria-live="polite"></p>' +
      '<span class="lexi-live-shadow" aria-hidden="true"></span>' +
      '<div class="lexi-live-body" aria-hidden="true">' +
      '<img src="assets/lexi-wave.webp" alt="" width="520" height="520" decoding="async">' +
      '<i class="lexi-lid l"></i><i class="lexi-lid r"></i>' +
      '<i class="lexi-spark s1"></i><i class="lexi-spark s2"></i><i class="lexi-spark s3"></i>' +
      '</div>';
    const body = wrap.querySelector('.lexi-live-body'), bubble = wrap.querySelector('.lexi-live-bubble'), hit = wrap.querySelector('.lexi-live-hit');
    let bubbleTimer = 0, blinkTimer = 0;
    function say(line, ms = 3600) {
      const [en, ru, mood] = Array.isArray(line) ? line : [line, '', 'wave'];
      bubble.replaceChildren();
      const b = document.createElement('b'); b.textContent = en; b.lang = 'en'; bubble.append(b);
      if (canSpeak()) { const sp = document.createElement('button'); sp.type = 'button'; sp.className = 'lexi-say'; sp.textContent = '🔊'; sp.setAttribute('aria-label', 'Послушать: ' + en); sp.onclick = e => { e.stopPropagation(); speakEn(en); clearTimeout(bubbleTimer); bubbleTimer = setTimeout(() => bubble.classList.remove('show'), 3000); }; bubble.append(sp); }
      if (ru) { const r = document.createElement('small'); r.textContent = ru; bubble.append(r); }
      bubble.classList.add('show'); play(mood === 'tilt' ? 'tilt' : mood === 'hop' ? 'hop' : 'wave');
      clearTimeout(bubbleTimer); bubbleTimer = setTimeout(() => bubble.classList.remove('show'), ms);
    }
    function play(cls) {
      if (reduced()) return;
      body.classList.remove('hop', 'wave', 'tilt'); void body.offsetWidth; body.classList.add(cls);
    }
    function blink() {
      if (!wrap.isConnected) return;
      if (!reduced() && !calm() && !document.hidden) { body.classList.remove('blink'); void body.offsetWidth; body.classList.add('blink'); if (Math.random() < .25) setTimeout(() => { body.classList.remove('blink'); void body.offsetWidth; body.classList.add('blink'); }, 260); }
      blinkTimer = setTimeout(blink, 2600 + Math.random() * 3200);
    }
    hit.addEventListener('click', () => say(pick(PHRASES.poke)));
    hit.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') play('wave'); });
    body.addEventListener('animationend', e => { if (['lx-hop', 'lx-wave', 'lx-tilt'].includes(e.animationName)) body.classList.remove('hop', 'wave', 'tilt'); });
    // first hello: a wave and a time-of-day line, once per page view
    setTimeout(() => { if (!wrap.isConnected) return; let back = false; try { back = !!(window.LexiPersonal && window.LexiPersonal.lastActivity()); } catch { back = false; } if (!calm()) say(pick(back ? PHRASES.back : PHRASES[partOfDay()]), 4600); else play('wave'); }, 900);
    blinkTimer = setTimeout(blink, 1800);
    return wrap;
  }

  window.LexiLive = Object.freeze({ art, greeting, partOfDay, phrases: PHRASES });
})();
