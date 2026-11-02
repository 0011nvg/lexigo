// Общие помощники тестов «Кристальной экспедиции»: дождаться конца анимации, ответить на карточку слова, пройти уровень.
export const idle = page => page.waitForFunction(() => !LexiCrystalQuest.debug().busy || document.querySelector('.cq-word') || document.querySelector('.crystal-result'), null, { timeout: 20000 });
export const st = page => page.evaluate(() => { const s = LexiCrystalQuest.state(); return s && { moves: s.moves, used: s.movesUsed, score: s.score, wordsOk: s.wordsOk, tried: s.wordsTried, energy: s.energy, need: s.energyNeed }; });
/* ответить на карточку со словом: верно (по слову из задания) или неверно */
export async function answer(page, right) {
  const w = await page.evaluate(() => { const g = LexiCrystalQuest.debug(); const it = g.pending && g.pending.item; return it && { en: it.w.en, ru: it.w.ru, type: game.activeQuestionMode }; });
  const box = page.locator('.cq-word');
  if (await box.locator('.builder-bank').count()) {
    const ans = await page.evaluate(en => LexiWordBuilder.answer(en), w.en);
    const order = right ? Array.from(ans) : Array.from(ans).reverse();
    for (const ch of order) await box.locator('.builder-bank .builder-token:not([hidden])').filter({ hasText: new RegExp('^' + ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).first().click();
    await box.locator('.builder-tools button', { hasText: 'Проверить' }).click();
  } else if (await box.locator('.letter-word').count()) {
    const fix = await page.evaluate(en => { const L = [...document.querySelectorAll('.cq-word .letter-word button')].map(b => b.textContent); const i = L.findIndex((c, k) => c !== Array.from(en)[k]); return { i, want: Array.from(en)[i] }; }, w.en);
    await box.locator('.letter-word button').nth(right ? fix.i : (fix.i + 1) % (await box.locator('.letter-word button').count())).click();
    const opt = box.locator('.options button').filter({ hasText: new RegExp('^' + fix.want + '$') });
    await (right ? opt.first() : box.locator('.options button').filter({ hasNotText: new RegExp('^' + fix.want + '$') }).first()).click();
  } else if (await box.locator('.answerbox input').count()) {
    await box.locator('.answerbox input').fill(right ? w.en : 'zzz'); await box.locator('.answerbox button').last().click();
  } else if (await box.locator('.buttons button', { hasText: 'Верно' }).count()) {
    const shown = await box.locator('.question p[style]').innerText().catch(() => '');
    const isRight = shown.trim() === w.ru;
    await box.locator('.buttons button', { hasText: (isRight === right) ? 'Верно' : 'Неверно' }).first().click();
  } else {
    const opts = box.locator('.options button');
    if (right) await opts.filter({ hasText: new RegExp('^\\s*' + w.ru.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$') }).first().click();
    else await opts.filter({ hasNotText: new RegExp('^\\s*' + w.ru.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$') }).first().click();
  }
  await box.locator('.cq-continue').click();
  await page.waitForFunction(() => !document.querySelector('.cq-word'), null, { timeout: 8000 });
}
/* сыграть уровень «внимательным игроком»: лучший видимый ход, слова — верно */
export async function playLevel(page, { maxMoves = 80, wrongFirst = false } = {}) {
  let wrong = wrongFirst;
  for (let k = 0; k < maxMoves; k++) {
    if (await page.locator('.crystal-result').count()) return;
    if (await page.locator('.cq-word').count()) { await answer(page, !wrong); wrong = false; await idle(page); continue; }
    const mv = await page.evaluate(() => { const E = LexiCrystalEngine, s = LexiCrystalQuest.state(); let best = null, bv = -1; for (const [a, b] of E.allMoves(s)) { const c = E.clone(s); E.swap(c, a, b); const v = c.score - s.score; if (v > bv) { bv = v; best = [a, b]; } } return best; });
    await page.locator(`#cqBoard .cq-gem[data-i="${mv[0]}"]`).click(); await page.locator(`#cqBoard .cq-gem[data-i="${mv[1]}"]`).click();
    await idle(page);
  }
  await page.locator('.crystal-result').waitFor({ timeout: 20000 });
}

