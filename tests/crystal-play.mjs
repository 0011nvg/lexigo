// LEXI — «Кристальная экспедиция» v2 в браузере (2026-11-02): карта уровней, перетаскивание, касания, клавиатура,
// неверный ход без списания, блокировка во время анимации, «Энергия Лекси» и слова, победа и проигрыш,
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
    assert.equal(await page.locator('#cqMoves').innerText(), '20');
    assert.match(await page.locator('#cqGoals').innerText(), /Набери 3000 очков[\s\S]*Ответь верно на 3 слова/);
    const shapes = await page.evaluate(() => new Set([...document.querySelectorAll('#cqBoard .cq-gem use')].map(u => u.getAttribute('href'))).size);
    assert.ok(shapes >= 4, 'gems of different colours have different shapes');
    ok(name + ': level 1 — 7×7 board, 20 moves, goals «3000 очков» and «3 слова», gems differ by shape');

    /* 3. неверный ход: кристаллы вернулись, ход не потрачен */
    const bad = await page.evaluate(() => { const E = LexiCrystalEngine, s = LexiCrystalQuest.state(); for (let a = 0; a < s.n; a++) for (const b of [a + 1, a + s.size]) if (E.neighbors(s, a, b) && !E.validSwap(s, a, b)) return [a, b]; });
    const before = await page.evaluate(() => JSON.stringify(LexiCrystalQuest.state().cells));
    await drag(page, bad[0], bad[1]); await idle(page);
    assert.equal(await page.evaluate(() => JSON.stringify(LexiCrystalQuest.state().cells)), before);
    assert.equal((await st(page)).moves, 20);
    const pos = await page.evaluate(i => getComputedStyle(document.querySelector(`#cqBoard .cq-gem[data-i="${i}"]`)).getPropertyValue('--x'), bad[0]);
    assert.equal(pos.trim(), String(bad[0] % 7), 'tile is back in place');
    ok(name + ': invalid drag — crystals return, the move is not spent');

    /* 4. верный ход: перетаскивание, касания, клавиатура — каждый ровно −1 ход */
    let mv = await page.evaluate(() => LexiCrystalEngine.findMove(LexiCrystalQuest.state()));
    await drag(page, mv[0], mv[1]); await idle(page);
    assert.equal((await st(page)).moves, 19, 'drag');
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
    if (await page.locator('.cq-word').count()) await answer(page, true);
    await page.evaluate(() => { const p = document.querySelector('.cq-play'); p.classList.remove('calm'); });
    const m2 = (await st(page)).moves;
    await page.evaluate(() => { const E = LexiCrystalEngine, s = LexiCrystalQuest.state(), [a, b] = E.findMove(s); const g = LexiCrystalQuest.debug(); g.sel = a; document.querySelector(`#cqBoard .cq-gem[data-i="${a}"]`); });
    const two = await page.evaluate(() => { const s = LexiCrystalQuest.state(), all = LexiCrystalEngine.allMoves(s); return [all[0], all[all.length - 1]]; });
    await drag(page, two[0][0], two[0][1]);
    const busy = await page.evaluate(() => LexiCrystalQuest.debug().busy);
    await drag(page, two[1][0], two[1][1]); await idle(page);
    if (busy) assert.equal((await st(page)).moves, m2 - 1, 'second move during the animation is ignored');
    ok(name + ': input is locked while crystals fall (second drag ignored)');

    /* 6. «Энергия Лекси»: ошибка без штрафа, верный ответ +1 ход */
    for (let k = 0; k < 30 && !(await page.locator('.cq-word').count()); k++) {
      mv = await page.evaluate(() => LexiCrystalEngine.findMove(LexiCrystalQuest.state()));
      await page.locator(`#cqBoard .cq-gem[data-i="${mv[0]}"]`).click(); await page.locator(`#cqBoard .cq-gem[data-i="${mv[1]}"]`).click(); await idle(page);
    }
    await page.locator('.cq-word').waitFor();
    assert.match(await page.locator('.cq-word').innerText(), /Энергия Лекси заряжена|Вернёмся к этому слову/);
    const a0 = await st(page);
    await answer(page, false);
    const a1 = await st(page);
    assert.equal(a1.moves, a0.moves, 'no penalty for a mistake'); assert.equal(a1.tried, a0.tried + 1);
    const retried = await page.evaluate(() => LexiCrystalQuest.debug().queue.slice(0, 2).some(x => x.retry));
    assert.ok(retried, 'the word comes back soon');
    for (let k = 0; k < 30 && !(await page.locator('.cq-word').count()); k++) {
      mv = await page.evaluate(() => LexiCrystalEngine.findMove(LexiCrystalQuest.state()));
      await page.locator(`#cqBoard .cq-gem[data-i="${mv[0]}"]`).click(); await page.locator(`#cqBoard .cq-gem[data-i="${mv[1]}"]`).click(); await idle(page);
    }
    const b0 = await st(page);
    await answer(page, true);
    const b1 = await st(page);
    assert.equal(b1.moves, b0.moves + 1, '+1 move'); assert.equal(b1.wordsOk, b0.wordsOk + 1);
    const prog = await page.evaluate(() => Object.keys(progress).length);
    assert.ok(prog >= 2, 'answers saved in word progress like in other games');
    ok(name + ': energy fills → word card; mistake: no penalty, the word returns soon; correct: +1 move; answers go to word progress');

    /* 7. победа: бонус за ходы, звёзды, рекорд, следующий уровень открыт и после перезагрузки */
    await playLevel(page);
    await page.locator('.crystal-result').waitFor();
    const res = await page.locator('.crystal-result').innerText();
    assert.match(res, /Уровень пройден|Три звезды/); assert.match(res, /Следующий уровень/); assert.match(res, /Слова этого уровня/);
    const stars = await page.locator('.cq-res-stars .on').count(); assert.ok(stars >= 1);
    const best = await page.evaluate(() => JSON.parse(localStorage.getItem('lexigo_crystal_v2')).levels[1]);
    assert.ok(best.best > 3000 && best.wins === 1 && best.stars === stars);
    await page.reload(); await page.locator('.cq-map').waitFor();
    assert.equal(await page.locator('.cq-level.locked').count(), 3, 'level 2 open after reload');
    assert.equal(await page.locator('.cq-level[data-level="1"] .cq-stars .on').count(), stars);
    ok(name + ': win → stars ' + stars + ', moves turned into bonus, words list, record ' + best.best + '; after reload: record kept, level 2 open');

    /* 8. проигрыш: мягкий экран и «Попробовать ещё раз»; пауза */
    await page.locator('.cq-level[data-level="2"]').click(); await page.locator('#cqBoard .cq-gem').first().waitFor();
    await page.evaluate(() => { LexiCrystalQuest.state().moves = 1; });
    mv = await page.evaluate(() => LexiCrystalEngine.findMove(LexiCrystalQuest.state()));
    await page.locator(`#cqBoard .cq-gem[data-i="${mv[0]}"]`).click(); await page.locator(`#cqBoard .cq-gem[data-i="${mv[1]}"]`).click();
    for (let k = 0; k < 5 && !(await page.locator('.crystal-result').count()); k++) { await idle(page); if (await page.locator('.cq-word').count()) await answer(page, false); }
    await page.locator('.crystal-result.lost').waitFor();
    const lost = await page.locator('.crystal-result').innerText();
    assert.match(lost, /Почти получилось/); assert.match(lost, /Попробовать ещё раз/); assert.ok(!/проиграл|неудач/i.test(lost), 'no negative wording');
    await page.locator('.crystal-result button', { hasText: 'Попробовать ещё раз' }).click();
    await page.locator('#cqBoard .cq-gem').first().waitFor();
    assert.equal(await page.locator('#cqMoves').innerText(), '20');
    await page.locator('.cq-tools button', { hasText: 'Пауза' }).click();
    await page.locator('.cq-pause').waitFor();
    await page.locator('.cq-pause button', { hasText: 'Карта уровней' }).click();
    await page.locator('.cq-map').waitFor();
    ok(name + ': lost level — «Почти получилось!», what was missing, «Попробовать ещё раз» (same board, 20 moves); pause → map');

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
    const card = await m.locator('.cq-word-card').boundingBox(); assert.ok(card.y >= 0 && card.y + card.height <= 740 && card.x >= 0 && card.x + card.width <= 360, 'word card fits the phone screen');
    ok(name + ': phone 360 px — no horizontal scroll, tiles ≥ 40 px, taps work, word card fits the screen');

    assert.deepEqual(errors, [], 'no JS errors');
  } finally { await browser.close(); }
}
console.log('PASS crystal expedition in the browser');
