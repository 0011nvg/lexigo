/* LEXIGO — «живой» Лекси на главной (2026-11-02).
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
  const PHRASES = {
    morning: ['Hello! Начнём день с пары новых слов?', 'Утро — лучшее время для 5 минут английского!'],
    day: ['Hi! Готов к маленькому приключению?', 'Пять минут — и пара новых слов твоя!'],
    evening: ['Good evening! Повторим слова перед сном?', 'Вечером слова запоминаются особенно хорошо.'],
    night: ['Уже поздно… Одну короткую тренировку — и спать!', 'Good night! Завтра продолжим.'],
    poke: ['Мяу! Это я, Лекси 😺', 'Hi there!', 'Нажми «Начать», и поехали!', 'Я нашёл кристалл слов!', 'Let’s play!', 'Ты сегодня молодец!']
  };
  const pick = list => list[Math.floor(Math.random() * list.length)];

  /* Builds the animated Lexi block. Eyelids are positioned over the eyes of assets/lexi-hero.webp (520×520). */
  function art() {
    const wrap = document.createElement('div');
    wrap.className = 'lexi-live';
    wrap.innerHTML =
      '<button class="lexi-live-hit" type="button" aria-label="Лекси машет тебе лапкой. Нажми, чтобы он что-нибудь сказал"></button>' +
      '<p class="lexi-live-bubble" aria-live="polite"></p>' +
      '<span class="lexi-live-shadow" aria-hidden="true"></span>' +
      '<div class="lexi-live-body" aria-hidden="true">' +
      '<img src="assets/lexi-hero.webp" alt="" width="520" height="520" decoding="async">' +
      '<i class="lexi-lid l"></i><i class="lexi-lid r"></i>' +
      '<i class="lexi-spark s1"></i><i class="lexi-spark s2"></i><i class="lexi-spark s3"></i>' +
      '</div>';
    const body = wrap.querySelector('.lexi-live-body'), bubble = wrap.querySelector('.lexi-live-bubble'), hit = wrap.querySelector('.lexi-live-hit');
    let bubbleTimer = 0, blinkTimer = 0;
    function say(text, ms = 3200) {
      bubble.textContent = text; bubble.classList.add('show');
      clearTimeout(bubbleTimer); bubbleTimer = setTimeout(() => bubble.classList.remove('show'), ms);
    }
    function play(cls) {
      if (reduced()) return;
      body.classList.remove('hop', 'wave'); void body.offsetWidth; body.classList.add(cls);
    }
    function blink() {
      if (!wrap.isConnected) return;
      if (!reduced() && !calm() && !document.hidden) { body.classList.remove('blink'); void body.offsetWidth; body.classList.add('blink'); if (Math.random() < .25) setTimeout(() => { body.classList.remove('blink'); void body.offsetWidth; body.classList.add('blink'); }, 260); }
      blinkTimer = setTimeout(blink, 2600 + Math.random() * 3200);
    }
    hit.addEventListener('click', () => { play('hop'); say(pick(PHRASES.poke)); });
    hit.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') play('wave'); });
    body.addEventListener('animationend', e => { if (['lx-hop', 'lx-wave'].includes(e.animationName)) body.classList.remove('hop', 'wave'); });
    // first hello: a wave and a time-of-day line, once per page view
    setTimeout(() => { if (!wrap.isConnected) return; play('wave'); if (!calm()) say(pick(PHRASES[partOfDay()]), 4200); }, 900);
    blinkTimer = setTimeout(blink, 1800);
    return wrap;
  }

  window.LexiLive = Object.freeze({ art, greeting, partOfDay });
})();
