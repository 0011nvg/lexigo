// LEXI+ (2026-11-02): chosen words, games right after the word set, configurable final test, honest storage notes, mobile.
import assert from 'node:assert/strict';
import { chromium } from './browser-runtime.mjs';
import { useFakeCloud } from './fake-cloud.mjs';   // 2026-11-04: материалы учителя — только в аккаунте учителя
const BASE = process.env.LEXIGO_URL || 'http://127.0.0.1:4173/index.html';
const browser = await chromium.launch({ headless: true });
const errors = [];
const ok = m => console.log('  ✓ ' + m);
async function fresh(viewport = { width: 1280, height: 900 }) {
  const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  return page;
}
const solve = async page => {
  const st = await page.evaluate(() => ({ en: game.words[game.index].en, ru: game.words[game.index].ru, kind: game.activeQuestionMode, idx: game.index }));
  if (await page.locator('#play .builder-bank').count()) {
    const target = st.en.trim().includes(' ') ? st.en.trim().split(/\s+/) : [...st.en.trim()];
    for (const t of target) await page.locator('#play .builder-bank .builder-token:not([hidden])').filter({ hasText: new RegExp('^' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).first().click();
    await page.locator('#play .builder-tools button', { hasText: 'Проверить' }).click();
  } else if (await page.locator('#play .answerbox input:not([disabled])').count()) {
    await page.fill('#play .answerbox input', st.en); await page.locator('#play .answerbox button').first().click();
  } else if (await page.locator('#play .options button:not([disabled])').count()) {
    const want = st.kind === 'listen' ? st.en : st.ru;
    await page.locator('#play .options button').filter({ hasText: new RegExp('^\\s*' + want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$') }).first().click();
  } else if (await page.locator('#play .buttons .btn.good').count()) {
    const claim = await page.evaluate(() => document.querySelector('#play .question p[style]')?.textContent || '');
    await page.locator('#play .buttons .btn', { hasText: claim.trim() === st.ru.trim() ? 'Верно' : 'Неверно' }).first().click();
  }
  const next = page.locator('#play button:not([disabled])', { hasText: /Следующее|Результат/ }).first();
  await page.waitForFunction(i => !game || game.index !== i || document.querySelector('#play .lesson-result') || [...document.querySelectorAll('#play button:not([disabled])')].some(b => /Следующее|Результат/.test(b.textContent)), st.idx);
  if (await next.count()) await next.click();
};
async function finishRound(page) { for (let i = 0; i < 60 && !(await page.locator('#play .lesson-result').count()); i++) await solve(page); await page.locator('#play .lesson-result').waitFor(); }
try {
  /* 1. Choose 20 of 30 words: counter, games use only them, the choice is remembered */
  let page = await fresh();
  await page.goto(BASE + '#/lesson/4/3/words');
  await