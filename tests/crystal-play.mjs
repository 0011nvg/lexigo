// LEXI — «Кристальная экспедиция» в браузере (2026-11-02 v2; 2026-11-03 v3): карта уровней, перетаскивание, касания, клавиатура,
// свободный обмен без ряда, блокировка во время анимации, циклы «5 ходов → 5 заданий на слова», победа и проигрыш,
// рекорды после перезагрузки, пауза, звук и спокойная анимация, телефон. Chromium; с LEXIGO_WEBKIT=1 — ещё и WebKit.
import assert from 'node:assert/strict';
import { chromium } from './browser-runtime.mjs';
import { webkit } from 'playwright';
import { idle, st, answer, playLevel } from './crystal-helpers.mjs';
const BASE = process.env.LEXIGO_URL || 'http://127.0.0.1:4173/index.html';
const ok = m => console.log('  ✓ ' + m);
const engines = [['chromium', chromium]]; if (process.env.LEXIGO_WEBKIT) engines.push(['webkit', webkit]);

async function cellPoint(page, i) {
  const n = await page.evaluate(() => LexiCrystalQuest.state().size), box = await page.locator('#cqBoard').boundingBox(), c = box.width / n;
  return [box.x + (i % n + 0.5) * c, box.y + (Math.floor(i / n) + 0.5) * c];
}
async function drag(page, a, b) {
  const [ax, ay] = await cellPoint(page, a), [bx, by] = await cellPoint(page, b);
  await page.mouse.move(ax, ay); await page.mouse.down(); await page.mouse.move((ax + bx) / 2, (ay + by) / 2, { steps: 4 }); await page.mouse.move(bx, by, { steps: 4 }); await page.mouse.up();
}
for (const [name, engine] of engines) {
  const browser = await engine.launch({ headless: true });
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('dialog', d => { errors.push('alert: ' + d.message()); d.dismiss(); });
    await page.route(/supabase\.co/, r => r.abort());
    await page.goto(BASE + '#/lesson/5/3/play/crystals');

    /* 1. карта уровней */
    await page.locator('.cq-map').waitFor();
    assert.equal(await page.locator('.cq-level').count(), 5);
    assert.equal(await page.locator('.cq-level.locked').count(), 4, 'levels open one after another');
    assert.equal(await page.locator('.cq-level[data-level="2"]').getAttribute('aria-disabled'), 'true');
    await page.locator('.cq-level[data-level="2"]').click({ force: true });
    assert.equal(await page.locator('#cqBoard').count(), 0, 'locked level does not start');
    assert.match(await page.locator('.cq-rating').innerText(), /войди в аккаунт/);
    ok(name + ': map — 5 levels, only level 1 open, locked level does not start, rating asks to sign in');

    /* 2. уровень 1: поле, ходы, цели */
    await page.locator('.cq-level[data-level="1"]').click();
    await page.locator('#cqBoard .cq-gem').first().waitFor();
    assert.equal(await page.locator('#cqBoard .cq-gem').count(), 49);
    assert.equal(await page.locator('#cqMoves').innerText(), '5');
    assert.match(await page.locator('.cq-moves').innerText(), /до заданий/);
    assert.match(await page.locator('#cqCycle').innerText(), /Уровень 1 · цикл 1 из 4/);
    assert.match(await page.locator('#cqGoals').innerText(), /Набери 1500 очков[\s\S]*Ответь верно на 12 слов/);
    const shapes = await page.evaluate(() => new Set([...document.querySelectorAll('#cqBoard .cq-gem use')].map(u => u.getAttribute('href'))).size);
    assert.ok(shapes >= 4, 'gems of different colours have different shapes');
    ok(name + ': level 1 — 7×7 board, «5 ходов до заданий», cycle 1 of 4, goals «1500 очков» and «12 слов», gems differ by shape');

    /* 3. ход без ряда: кристаллы остаются на новых местах, ход потрачен, очков нет */
    const bad = await page.evaluate(() => { const E = LexiCrystalEngine, s = LexiCrystalQuest.state(); for (let a = 0; a < s.n; a++) for (const b of [a + 1, a + s.size]) if (E.neighbors(s, a, b) && !E.validSwap(s, a, b)) return [a, b]; });
    const ids = await page.evaluate(([a, b]) => { const s = LexiCrystalQuest.state(); return [s.cells[a].id, s.cells[b].id]; }, bad);
    await drag(page, bad[0], bad[1]); await idle(page);
    const after = await page.evaluate(([a, b]) => { const s = LexiCrystalQuest.state(); return [s.cells[a].id, s.cells[b].id]; }, bad);
    assert.deepEqual(after, [ids[1], ids[0]], 'crystals stay where they were moved');
    assert.equal((await st(page)).used, 1); assert.equal((await st(page)).score, 0);
    const pos = await page.evaluate(i => getComputedStyle(document.querySelector(`#cqBoard .cq-gem[data-id="${i}"]`)).getPropertyValue('--x'), ids[0]);
    assert.equal(pos.trim(), String(bad[1] % 7), 'the tile is drawn at its new place');
    assert.equal(await page.locator('#cqMoves').innerText(), '4');
    ok(name + ': a swap without a row — crystals stay at their new places, the move is spent, 0 points');

    /* 4. верный ход: перетаскивание, касания, клавиатура — каждый ровно −1 ход */
    let mv = await page.evaluate(() => LexiCrystalEngine.findMove(LexiCrystalQuest.state()));
    await drag(page, mv[0], mv[1]); await idle(page);
    assert.equal((await st(page)).moves, 18, 'drag');
    if (await page.locator('.cq-word').count()) await answer(page, true);
    mv = await page.evaluate(() => LexiCrystalEngine.findMove(LexiCrystalQuest.state()));
    const m0 = (await st(page)).moves;
    await page.locator(`#cqBoard .cq-gem[data-i="${mv[0]}"]`).click(); await page.locator(`#cqBoard .cq-gem[data-i="${mv[1]}"]`).click(); await idle(page);
    assert.equal((await st(page)).moves, m0 - 1, 'tap + tap');
    if (await page.locator('.cq-word').count()) await answer(page, true);
    mv = await page.evaluate(() => LexiCrystalEngine.findMove(LexiCrystalQuest.state()));
    const m1 = (await st(page)).moves;
    await page.evaluate(i => { LexiCrystalQuest.debug().focus = i; }, mv[0]);
    await page.locator('#cqBoard').focus(); await page.keyboard.press('Enter');
    const n = 7, [ax, ay] = [mv[0] % n, Math.floor(mv[0] / n)], [bx, by] = [mv[1] % n, Math.floor(mv[1] / n)];
    await page.keyboard.press(bx > ax ? 'ArrowRight' : bx < ax ? 'ArrowLeft' : by > ay ? 'ArrowDown' : 'ArrowUp'); await idle(page);
    assert.equal((await st(page)).moves, m1 - 1, 'keyboard');
    ok(name + ': valid move by drag, by two taps and by keyboard (Enter + arrow) — each costs exactly one move');

    /* 5. во время анимации кристаллы не двигаются */
    const m2 = (await st(page)).used;
    await page.evaluate(() => { const p = document.querySelector('.cq-play'); p.classList.remove('calm'); });
    const res2 = await page.evaluate(() => { const E = LexiCrystalEngine, s = LexiCrystalQuest.state(), all = E.allMoves(s); const a = all[0], b = all.find(m => !m.some(i => a.includes(i))) || all[all.length - 1];
      LexiCrystalQuest.tryMove(a[0], a[1]); const busy = LexiCrystalQuest.debug().busy; LexiCrystalQuest.tryMove(b[0], b[1]); return busy; });
    assert.ok(res2, 'busy during the animation');
    await idle(page);
    assert.equal((await st(page)).used, m2 + 1, 'second move during the animation is ignored');
    ok(name + ': input is locked while crystals fall (a second move at the same moment is ignored)');

    /* 6. после 5-го хода — блок из 5 заданий: поле закрыто, «Задание k из 5», ошибка без штрафа, верно +20 и серия; затем снова 5 ходов */
    await page.locator('.cq-word').waitFor();
    let s6 = await st(page);
    assert.equal(s6.phase, 'words'); assert.equal(s6.used, 5);
    assert.match(await page.locator('.cq-word').innerText(), /Задание 1 из 5/);
    assert.equal(await page.evaluate(() => LexiCrystalEngine.swap(LexiCrystalQuest.state(), 0, 1).ok), false, 'no moves during the word block');
    const pool = await page.evaluate(() => selectedWords().map(w => w.id));
    const a0 = await st(page);
    await answer(page, false);
    const a1 = await st(page);
    assert.equal(a1.score, a0.score, 'no points and no penalty for a mistake'); assert.equal(a1.tried, a0.tried + 1);
    await page.locator('.cq-word').waitFor(); assert.match(await page.locator('.cq-word').innerText(), /Задание 2 из 5/);
    const scores = [];
    for (let k = 0; k < 4; k++) { const b0 = await st(page); const wid = await page.evaluate(() => LexiCrystalQuest.debug().pending.item.w.id); assert.ok(pool.includes(wid), 'words of this lesson only'); await answer(page, true); scores.push((await st(page)).score - b0.score); }
    assert.deepEqual(scores, [20, 20, 30, 40 + 60], 'right answers: +20, from the 3rd in a row +10 more each; 4 of 5 in the block: +60');
    await idle(page);
    s6 = await st(page);
    assert.equal(s6.phase, 'move'); assert.equal(s6.cycle, 2); assert.equal(await page.locator('#cqMoves').innerText(), '5');
    const retried = await page.evaluate(() => LexiCrystalQuest.debug().retries.length);
    assert.equal(retried, 1, 'the mistaken word comes back in the next block');
    const prog = await page.evaluate(() => Object.keys(progress).length);
    const singles = await page.evaluate(() => LexiCrystalQuest.debug().pool.length);
    assert.ok(prog >= Math.min(5, singles), 'answers saved in word progress like in other games');
    ok(name + ': after 5 moves — 5 word tasks (board locked, «Задание k из 5»); mistake 0 points, comes back next block; right +20 and streak; then 5 new moves');

    /* 7. победа: бонус за ходы, звёзды, рекорд, следующий уровень открыт и после перезагрузки */
    await playLevel(page);
    await page.locator('.crystal-result').waitFor();
    const res = await page.locator('.crystal-result').innerText();
    assert.match(res, /Уровень пройден|Три звезды/); assert.match(res, /Следующий уровень/); assert.match(res, /Слова этого уровня/);
    const stars = await page.locator('.cq-res-stars .on').count(); assert.ok(stars >= 1);
    const best = await page.evaluate(() => JSON.parse(localStorage.getItem('lexigo_crystal_v2')).levels[1]);
    assert.ok(best.best >= 1500 && best.wins === 1 && best.stars === stars);
    const tried = await page.evaluate(() => LexiCrystalQuest.debug().st.wordsTried);
    assert.ok(tried >= 12 && tried % 5 === 0 || tried >= 12, 'at least 12 words answered: ' + tried);
    await page.reload(); await page.locator('.cq-map').waitFor();
    assert.equal(await page.locator('.cq-level.locked').count(), 3, 'level 2 open after reload');
    assert.equal(await page.locator('.cq-level[data-level="1"] .cq-stars .on').count(), stars);
    ok(name + ': win → stars ' + stars + ', moves turned into bonus, words list, record ' + best.best + '; after reload: record kept, level 2 open');

    /* 8. проигрыш: мягкий экран и «Попробовать ещё раз»; пауза */
    await page.locator('.cq-level[data-level="2"]').click(); await page.locator('#cqBoard .cq-gem').first().waitFor();
    await page.evaluate(() => { const s = LexiCrystalQuest.state(); s.moves = 1; s.cycleLeft = 1; s.cycle = s.cycles; });
    mv = await page.evaluate(() => LexiCrystalEngine.findMove(LexiCrystalQuest.state()));
    await page.locator(`#cqBoard .cq-gem[data-i="${mv[0]}"]`).click(); await page.locator(`#cqBoard .cq-gem[data-i="${mv[1]}"]`).click();
    for (let k = 0; k < 12 && !(await page.locator('.crystal-result').count()); k++) { await idle(page); if (await page.locator('.cq-word').count()) await answer(page, false); }
    await page.locator('.crystal-result.lost').waitFor();
    const lost = await page.locator('.crystal-result').innerText();
    assert.match(lost, /Почти получилось/); assert.match(lost, /Попробовать ещё раз/); assert.ok(!/проиграл|неудач/i.test(lost), 'no negative wording');
    await page.locator('.crystal-result button', { hasText: 'Попробовать ещё раз' }).click();
    await page.locator('#cqBoard .cq-gem').first().waitFor();
    assert.equal(await page.locator('#cqMoves').innerText(), '5');
    assert.equal((await st(page)).moves, 20);
    await page.locator('.cq-tools button', { hasText: 'Пауза' }).click();
    await page.locator('.cq-pause').waitFor();
    await page.locator('.cq-pause button', { hasText: 'Карта уровней' }).click();
    await page.locator('.cq-map').waitFor();
    ok(name + ': lost level — «Почти получилось!», what was missing, «Попробовать ещё раз» (same board, 4 cycles of 5 moves); pause → map');

    /* 9. звук и спокойная анимация сохраняются */
    await page.locator('.cq-map-tools [data-pref="muted"]').click(); await page.locator('.cq-map-tools [data-pref="calm"]').click();
    await page.reload(); await page.locator('.cq-map').waitFor();
    assert.match(await page.locator('.cq-map-tools [data-pref="muted"]').innerText(), /выключен/);
    assert.match(await page.locator('.cq-map-tools [data-pref="calm"]').innerText(), /Спокойная/);
    ok(name + ': sound off and calm animation are remembered');

    /* 10. телефон: всё помещается, карточка слова видна целиком */
    const phone = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: name === 'chromium' });
    const m = await phone.newPage(); m.on('pageerror', e => errors.push(e.message));
    await m.route(/supabase\.co/, r => r.abort());
    await m.goto(BASE + '#/lesson/3/2/play/crystals'); await m.locator('.cq-level[data-level="1"]').click(); await m.locator('#cqBoard .cq-gem').first().waitFor();
    assert.ok(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal scroll');
    const bb = await m.locator('#cqBoard').boundingBox(); assert.ok(bb.width >= 310 && bb.x >= 0 && bb.x + bb.width <= 360, 'board fits: ' + JSON.stringify(bb));
    const tile = await m.locator('#cqBoard .cq-gem').first().boundingBox(); assert.ok(tile.width >= 40, 'tiles at least 40 px: ' + tile.width);
    // уровень с полем 8×8 тоже удобен пальцем
    const t8 = await m.evaluate(() => document.querySelector('#cqBoard').getBoundingClientRect().width / 8); assert.ok(t8 >= 38, '8×8 tiles ≥ 38 px: ' + t8);
    for (let k = 0; k < 30 && !(await m.locator('.cq-word').count()); k++) {
      const mv2 = await m.evaluate(() => LexiCrystalEngine.findMove(LexiCrystalQuest.state()));
      await m.locator(`#cqBoard .cq-gem[data-i="${mv2[0]}"]`).tap(); await m.locator(`#cqBoard .cq-gem[data-i="${mv2[1]}"]`).tap(); await idle(m);
    }
    const hud = await m.locator('.cq-hud').boundingBox(); assert.ok(hud.x >= 0 && hud.x + hud.width <= 360, 'HUD fits the phone');
    const card = await m.locator('.cq-word-card').boundingBox(); assert.ok(card.y >= 0 && card.y + card.height <= 740 && card.x >= 0 && card.x + card.width <= 360, 'word card fits the phone screen');
    ok(name + ': phone 360 px — no horizontal scroll, tiles ≥ 40 px, taps work, word card fits the screen');

    assert.deepEqual(errors, [], 'no JS errors');
  } finally { await browser.close(); }
}
console.log('PASS crystal expedition in the browser');
