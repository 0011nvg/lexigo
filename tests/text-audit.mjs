// LEXI (2026-11-03): typography audit. Opens the main screens, every game, dialogs and results at 360 / 768 / 1280 px
// and checks: one brand font family (Nunito / Unbounded) everywhere, no text spilling out of its box or clipped,
// no word broken in the middle across lines, no horizontal page scroll, dropdowns/dialogs inside the screen.
// LEXIGO_AUDIT_REPORT=1 prints every finding; LEXIGO_AUDIT_SHOTS=dir saves screenshots; LEXIGO_WEBKIT=1 adds WebKit.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from './browser-runtime.mjs';
const BASE = process.env.LEXIGO_URL || 'http://127.0.0.1:4173/';
const SHOTS = process.env.LEXIGO_AUDIT_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const WIDTHS = [360, 768, 1280];
const browsers = [['chromium', chromium]];
if (process.env.LEXIGO_WEBKIT) { const pw = await import('playwright'); browsers.push(['webkit', pw.webkit]); }
const errors = [];

/* the in-page checker: returns a list of human-readable findings */
function auditPage() {
  const out = [];
  const vw = document.documentElement.clientWidth;
  const visible = el => { const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const name = el => { let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; else if (el.classList.length) s += '.' + [...el.classList].slice(0, 2).join('.'); const p = el.parentElement; if (p && !el.id) s = (p.id ? '#' + p.id : p.classList[0] ? '.' + p.classList[0] : p.tagName.toLowerCase()) + ' > ' + s; return s; };
  const ignored = el => el.closest('#lexigoPrint, svg, .sr-only, .visually-hidden, [aria-hidden="true"], code, pre, .cq-board, .lexi-live-bubble-hidden, noscript, script, style');
  if (document.documentElement.scrollWidth > vw + 1) out.push('horizontal page scroll: ' + document.documentElement.scrollWidth + ' > ' + vw);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.nodeValue.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const el = n.parentElement;
    if (!el || ignored(el) || !visible(el) || el.closest('[inert]')) continue;
    const s = getComputedStyle(el);
    /* 1. font family */
    const fam = s.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    if (!/^(Nunito|Unbounded)$/i.test(fam) && /[A-Za-zА-Яа-яЁё]/.test(text) && !seen.has('f' + name(el))) { seen.add('f' + name(el)); out.push('font «' + fam + '» in ' + name(el) + ': ' + text.slice(0, 40)); }
    /* 2. text outside its box / outside its scroll-clipping ancestor / outside the screen */
    const range = document.createRange(); range.selectNodeContents(n);
    const rects = [...range.getClientRects()].filter(r => r.width > 0.5);
    if (!rects.length) continue;
    let clip = el; while (clip && clip !== document.body) { const cs = getComputedStyle(clip); if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible' || clip.matches('button, .btn, .option, .mode, .wb-mode, .boss-type, .chip, .tile, .card')) break; clip = clip.parentElement; }
    const box = (clip && clip !== document.body ? clip : el).getBoundingClientRect();
    const scrollable = clip && clip !== document.body && /auto|scroll/.test(getComputedStyle(clip).overflowX + getComputedStyle(clip).overflowY);
    for (const r of rects) {
      if (!scrollable && (r.right > box.right + 2 || r.left < box.left - 2 || r.bottom > box.bottom + 3 || r.top < box.top - 3)) { if (!seen.has('o' + name(el))) { seen.add('o' + name(el)); out.push('text spills out of ' + name(clip && clip !== document.body ? clip : el) + ': «' + text.slice(0, 40) + '»'); } break; }
      if (!scrollable && !el.closest('#courseTabs, .h-scroll, [data-scroll-x]') && (r.right > vw + 1 || r.left < -1)) { if (!seen.has('v' + name(el))) { seen.add('v' + name(el)); out.push('text outside the screen in ' + name(el) + ': «' + text.slice(0, 40) + '»'); } break; }
    }
    /* 3. ellipsis-clipped text */
    if (s.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1 && !seen.has('e' + name(el))) { seen.add('e' + name(el)); out.push('text cut with «…» in ' + name(el) + ': «' + text.slice(0, 40) + '»'); }
    /* 4. a word broken across lines (letters on two lines; a real hyphen in the word is fine) */
    if (rects.length > 1) {
      const re = /[A-Za-zА-Яа-яЁё’']+/g; let m;
      while ((m = re.exec(n.nodeValue))) {
        if (m[0].length < 2) continue;
        const wr = document.createRange(); wr.setStart(n, m.index); wr.setEnd(n, m.index + m[0].length);
        const lines = new Set([...wr.getClientRects()].filter(r => r.width > 0.5).map(r => Math.round(r.top)));
        if (lines.size > 1 && !seen.has('w' + name(el) + m[0])) { seen.add('w' + name(el) + m[0]); out.push('word broken across lines in ' + name(el) + ': «' + m[0] + '»'); }
      }
    }
  }
  /* 5. form controls and dialogs */
  for (const el of document.querySelectorAll('input, select, textarea, button')) {
    if (ignored(el) || !visible(el)) continue;
    const fam = getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim();
    if (!/^(Nunito|Unbounded)$/i.test(fam) && !seen.has('c' + name(el))) { seen.add('c' + name(el)); out.push('control font «' + fam + '» in ' + name(el)); }
  }
  for (const el of document.querySelectorAll('[role=dialog], .lx-notice-card, .cq-word, .toast, [role=listbox], [role=menu]')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.left < -1 || r.right > vw + 1) out.push('dialog/list wider than the screen: ' + name(el));
  }
  return out;
}

const scenes = [
  ['home', '#/home'],
  ['course-5', '#/course/5/0', async p => { await p.locator('#wholeBookOpen').click(); await p.waitForTimeout(500); }],
  ['course-9', '#/course/9/3'],
  ['lesson-8', '#/lesson/8/3'],
  ['lesson-words-9', '#/lesson/9/5/words'],
  ['boss-dialog', '#/lesson/8/3', async p => { await p.locator('.mode[data-mode=boss]').click(); await p.waitForTimeout(300); }],
  ['games', '#/games'], ['awards', '#/awards'], ['profile', '#/profile'],
  ...['cards', 'quiz', 'truefalse', 'listen', 'pairs', 'builder', 'fix', 'spell', 'audio', 'review'].map(m => ['play-' + m, '#/lesson/8/3', async p => { await p.evaluate(mode => { if (mode === 'review') { selectedWords().slice(0, 6).forEach(x => { progress[x.id] = { right: 0, wrong: 1, last: Date.now(), due: 0 }; }); } start(mode); }, m); await p.waitForTimeout(400); }]),
  ['play-quiz-long', '#/lesson/9/5', async p => { await p.evaluate(() => { const ws = selectedWords().filter(isLexicalEntry).sort((a, b) => (b.en + b.ru).length - (a.en + a.ru).length).slice(0, 8); start('quiz', ws); }); await p.waitForTimeout(400); }],
  ['play-wrong-feedback', '#/lesson/9/5', async p => { await p.evaluate(() => { const ws = selectedWords().filter(isLexicalEntry).sort((a, b) => b.en.length - a.en.length).slice(0, 6); start('spell', ws); }); await p.locator('#play input').fill('qwertyuiopasdfghjk'); await p.keyboard.press('Enter'); await p.waitForTimeout(400); }],
  ['result', '#/lesson/8/3', async p => { await p.evaluate(() => { start('spell', selectedWords().filter(isLexicalEntry).slice(0, 2)); }); for (let i = 0; i < 6 && await p.evaluate(() => !!game && game.index < game.words.length); i++) { await p.locator('#play input').fill(await p.evaluate(() => game.words[game.index].en)); await p.keyboard.press('Enter'); await p.waitForTimeout(700); const b = p.locator('#play button', { hasText: /Следующее|Результат/ }); if (await b.count()) await b.click(); } await p.waitForTimeout(600); }],
  ['crystals-map', '#/lesson/8/3', async p => { await p.evaluate(() => start('crystals')); await p.waitForTimeout(600); }],
  ['me', 'me.html'], ['auth', 'auth.html'], ['privacy', 'privacy.html'], ['consent', 'consent.html']
];

let total = 0;
const report = [];
for (const [bname, engine] of browsers) {
  const browser = await engine.launch({ headless: true });
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 780 : 900 }, reducedMotion: 'reduce' });
    if (!process.env.LEXIGO_REAL_CLOUD) await ctx.route('**/config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.LEXIGO_CLOUD=Object.freeze({url:"",anonKey:""});' }));
    await ctx.route(/supabase\.co/, r => r.abort());
    for (const [label, path, act] of scenes) {
      const page = await ctx.newPage();
      page.on('pageerror', e => errors.push(label + ': ' + e.message));
      page.on('dialog', d => d.dismiss());
      const url = path.startsWith('#') ? BASE + 'index.html' + path : BASE + path;
      await page.goto(url); await page.waitForLoadState('load');
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      try { if (act) await act(page); } catch (e) { errors.push(label + ' @' + width + ': ' + e.message.split('\n')[0]); }
      await page.evaluate(() => document.fonts.ready);
      const found = await page.evaluate(auditPage);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${bname}-${width}-${label}.png`, fullPage: false });
      for (const f of found) report.push(`${bname} ${width}px ${label}: ${f}`);
      total += found.length;
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
}
if (process.env.LEXIGO_AUDIT_REPORT || total) console.log(report.join('\n'));
assert.deepEqual(errors, [], 'no page errors');
assert.equal(total, 0, total + ' typography findings (see the list above)');
console.log('  ✓ text audit: one font family, no spilling or clipped text, no words broken mid-line, no horizontal scroll — ' + scenes.length + ' screens × ' + WIDTHS.length + ' widths');
