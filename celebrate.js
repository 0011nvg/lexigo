/* LEXI · праздничное завершение раунда (2026-11-05).
 * Работает поверх общего экрана результатов (result-ui.js → .lesson-result, Кристальная экспедиция → .crystal-result)
 * для всех игр: карточки, переводы, написание, пары, аудиодиктант, конструктор, финальный тест, уроки учителя.
 *
 *  1. Лекси (те же иллюстрации, что на главной) радуется: при хорошем результате подпрыгивает с поднятой лапой,
 *     при слабом — машет лапкой и подбадривает. Реплика в облачке меняется и не повторяется подряд.
 *  2. Лёгкое конфетти (CSS, 14–28 частиц, ~2 с, без библиотек) — только за хороший и отличный результат.
 *  3. Сразу под счётом — кнопки «дальше»: ученик может продолжить, не дожидаясь анимации.
 *  4. Достижения — только по фактическим данным: первый раунд (до этого ответов не было), первый раунд без ошибок
 *     (счётчик Лекси), новый личный рекорд в этой игре этого урока, серия дней, новые выученные слова
 *     (по модели прогресса: слово написано по памяти, два последних ответа верные).
 *  5. «Уменьшить движение» в системе или спокойный режим — без конфетти и прыжков.
 *  Тренировка учителя (предпросмотр) — без конфетти и достижений. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = String(text); return n; };
  const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.classList.contains('calm'); } catch { return false; } };
  const plural = (n, a, b, c) => { n = Math.abs(n) % 100; const d = n % 10; return n > 10 && n < 20 ? c : d > 1 && d < 5 ? b : d === 1 ? a : c; };
  const read = (k, f) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? f : v; } catch { return f; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

  const PHRASES = {
    perfect: ['Идеально! Ни одной ошибки!', 'Супер! Продолжаем?', 'Lexi гордится тобой!', 'Блестяще! Так держать!', 'Отличная работа!', 'Каждое слово — новая победа!'],
    good: ['Молодец! Продолжай в том же духе!', 'Отличная работа!', 'Ты становишься лучше с каждым заданием!', 'Ещё один шаг к свободному английскому!', 'Ты отлично справляешься!', 'Супер! Продолжаем?'],
    ok: ['Хороший результат! Ещё немного практики — и будет отлично.', 'Ты на верном пути!', 'Неплохо! Повтори трудные слова — и вперёд.', 'Каждая попытка делает тебя сильнее.'],
    low: ['Хорошая попытка! Давай попробуем ещё раз.', 'Ошибки — это часть учёбы. Попробуем ещё?', 'Не сдавайся — у тебя всё получится!', 'Начало положено! Повтори слова и сыграй ещё раз.'],
    cards: ['Хорошая разминка! Теперь проверь себя в игре.', 'Карточки пройдены — отличное начало!', 'Ещё один шаг к свободному английскому!'],
    boss: ['Страж модуля побеждён! Lexi гордится тобой!', 'Финальный тест пройден — ты молодец!'],
    preview: ['Так ученики увидят завершение раунда.']
  };
  const HIST = 'lexi_phrase_hist_v1';
  function phrase(tier) {
    const pool = PHRASES[tier] || PHRASES.good, hist = read(HIST, []);
    const fresh = pool.filter(p => !hist.includes(p)), list = fresh.length ? fresh : pool;
    const p = list[Math.floor(Math.random() * list.length)];
    write(HIST, [p, ...hist.filter(x => x !== p)].slice(0, 4));
    return p;
  }

  /* ---------- результат раунда ---------- */
  const isPreview = g => !!(g && g.cloud && g.cloud.meta && g.cloud.meta.preview);
  function assess(g, card) {
    if (isPreview(g)) return { tier: 'preview' };
    if (card.classList.contains('crystal-result')) {
      const m = /(\d)\s*из\s*3/.exec(card.querySelector('.cq-res-stars')?.getAttribute('aria-label') || ''), stars = m ? Number(m[1]) : 0;
      return { tier: !card.classList.contains('won') ? 'low' : stars >= 3 ? 'perfect' : stars === 2 ? 'good' : 'ok', crystals: true };
    }
    if (g.mode === 'cards') return { tier: 'cards' };
    if (g.mode === 'pairs') { const m = g.pairMistakes || 0, n = g.words.length || 1; return { tier: m === 0 ? 'perfect' : m <= Math.max(1, Math.round(n * .25)) ? 'good' : m <= n ? 'ok' : 'low', pairs: true }; }
    const total = Math.max(0, g.words.length - (g.retries || 0)), right = Math.min(g.firstCorrect || 0, total), ratio = total ? right / total : 0;
    const bossWin = g.mode === 'boss' && typeof window.finalTestPassed === 'function' && window.finalTestPassed(g);
    return { tier: bossWin ? 'boss' : !total ? 'ok' : ratio === 1 ? 'perfect' : ratio >= .7 ? 'good' : ratio >= .4 ? 'ok' : 'low', ratio, right, total, perfect: total >= 5 && ratio === 1 };
  }
  function routeKey(g) { try { const wb = window.LexigoWholeBook && window.LexigoWholeBook.current; if (wb) return 'book' + wb.grade + ':' + g.mode; const N = window.LexigoNav; const c = N && N.custom && N.custom(); return (c ? 'my:' + c.key : (N && N.stablePath ? N.stablePath() : '')) + ':' + g.mode; } catch { return ''; } }

  /* только подтверждённые данными достижения */
  function achievements(g, r) {
    const out = [];
    if (r.tier === 'preview' || r.crystals) return out;
    const base = g.rewardBaseline;
    let now = null; try { now = window.LexigoProgress.summarize(DB.books, progress); } catch { /* ignore */ }
    if (base && base.answers === 0 && now && now.answers > 0 && !document.querySelector('#play .result-awards')) out.push(['🎉', 'Первый раунд пройден!']);
    let quest = null; try { quest = window.LexiQuest && window.LexiQuest.state(); } catch { /* ignore */ }
    if (r.perfect && quest && quest.perfectGames === 1) out.push(['⭐', 'Первый раунд без ошибок!']);
    if (r.total >= 3 && !g.assignmentId) {
      const key = routeKey(g), best = read('lexi_best_round_v1', {});
      if (key) { const prev = best[key]; if (typeof prev === 'number' && r.ratio > prev) out.push(['🏆', 'Новый личный рекорд: ' + r.right + ' из ' + r.total + '!']); if (typeof prev !== 'number' || r.ratio > prev) { best[key] = r.ratio; write('lexi_best_round_v1', best); } }
    }
    if (base && now && now.learned > base.learned) { const d = now.learned - base.learned; out.push(['📘', 'Выучено ' + d + ' ' + plural(d, 'новое слово', 'новых слова', 'новых слов')]); }
    const today = new Date(); const k = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    if (quest && quest.streak && quest.streak.count >= 2 && quest.streak.last === k) out.push(['🔥', quest.streak.count + ' ' + plural(quest.streak.count, 'день', 'дня', 'дней') + ' подряд']);
    return out.slice(0, 3);
  }

  /* ---------- конфетти ---------- */
  const COLORS = ['#2c56f5', '#b4ef3a', '#ffc83a', '#ff6a55', '#1fc497', '#7a5cff'];
  function confetti(host, count) {
    if (reduced() || !count) return;
    const layer = el('div', 'lxc-confetti'); layer.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < count; i++) {
      const p = el('i'); const x = Math.random() * 100, drift = (Math.random() * 2 - 1) * 60;
      p.style.cssText = `left:${x.toFixed(1)}%;background:${COLORS[i % COLORS.length]};--dx:${drift.toFixed(0)}px;--rot:${(Math.random() * 720 - 360).toFixed(0)}deg;animation-delay:${(Math.random() * .25).toFixed(2)}s;animation-duration:${(1.4 + Math.random() * .8).toFixed(2)}s;` + (i % 3 === 0 ? 'border-radius:50%;width:8px;height:8px' : '');
      layer.append(p);
    }
    host.append(layer);
    setTimeout(() => layer.remove(), 2600);
  }

  /* ---------- оформление карточки результата ---------- */
  function enhance(card, g) {
    if (card.dataset.lxc) return; card.dataset.lxc = '1';
    const r = assess(g, card), tier = r.tier, happy = ['perfect', 'good', 'boss'].includes(tier);
    card.classList.add('lx-celebrate', 'lxc-' + tier);
    const stage = el('div', 'lxc-stage');
    let img = card.querySelector('.result-mascot');
    if (!img) { img = el('img', 'result-mascot'); img.alt = ''; }
    img.src = happy || tier === 'preview' ? 'assets/lexi-hero.webp' : 'assets/lexi-wave.webp';
    img.width = 220; img.height = 220; img.decoding = 'async';
    const cat = el('div', 'lxc-cat' + (reduced() ? '' : happy ? ' lxc-jump' : ' lxc-wave')); cat.append(img);
    const bubble = el('p', 'lxc-phrase', phrase(tier));
    stage.append(cat, bubble);
    card.prepend(stage);
    if (happy && !r.crystals || tier === 'perfect') confetti(stage, tier === 'perfect' || tier === 'boss' ? 28 : 16);
    // счёт и кнопки — рядом, чтобы продолжить можно было сразу
    const metrics = card.querySelector('.result-metrics') || card.querySelector('.cq-res-stats');
    const actions = card.querySelector(':scope > .result-actions');
    const list = achievements(g, r);
    let anchor = metrics || card.querySelector('h2');
    if (list.length) {
      const box = el('ul', 'lxc-achievements'); box.setAttribute('aria-label', 'Достижения раунда');
      for (const [icon, text] of list) { const li = el('li'); li.append(el('span', 'lxc-ico', icon), el('span', null, text)); box.append(li); }
      anchor ? anchor.after(box) : card.append(box); anchor = box;
    }
    if (actions && anchor && !card.classList.contains('crystal-result')) anchor.after(actions);
    // реплика Лекси в блоке наград дублировала облачко — оставляем одно (кроме предпросмотра учителя)
    const tidy = () => { const head = card.querySelector('.lexi-reward:not(.preview) .lexi-reward-head'); if (head) head.hidden = true; };
    tidy(); setTimeout(tidy, 0);
    // карточка уже прокручена к началу до появления Лекси — выравниваем ещё раз, чтобы котёнок не прятался под шапкой
    const head = document.querySelector('.site-header'), top = head && getComputedStyle(head).position.match(/sticky|fixed/) ? head.getBoundingClientRect().bottom : 0;
    if (card.getBoundingClientRect().top < top + 4) window.scrollBy({ top: card.getBoundingClientRect().top - top - 12, behavior: 'instant' });
  }

  function scan() {
    const card = document.querySelector('#play .lesson-result');
    if (!card || card.dataset.lxc || typeof game === 'undefined' || !game) return;
    try { enhance(card, game); } catch (e) { console.warn('LEXI celebrate', e); }
  }
  const play = $('play');
  if (play) new MutationObserver(() => requestAnimationFrame(scan)).observe(play, { childList: true });
  window.LexiCelebrate = Object.freeze({ phrase, assess, PHRASES, confetti });
})();
