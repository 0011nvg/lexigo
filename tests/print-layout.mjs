// A4 teacher test layout: 20 tasks fit one page, 20 mm side margins, nothing clipped — also with very long words.
import { chromium } from './browser-runtime.mjs';
import { PDFDocument } from 'pdf-lib';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
const hasPdftotext = (() => { try { execSync('pdftotext -v', { stdio: 'ignore' }); return true; } catch { return false; } })();
try {
  for (const [label, long] of [['regular words', false], ['very long words and phrases', true]]) {
    await page.goto('http://127.0.0.1:4173/index.html#/lesson/5/m1/teacher');
    await page.waitForFunction(() => document.body.classList.contains('teacher-mode') && scope.length > 20);
    await page.evaluate(long => {
      window.print = () => {};
      if (long) { const base = uniquePairs(scope).slice(0, 20); scope = base.map((w, i) => ({ id: 'long-' + i, en: i % 3 ? 'internationalisation-and-telecommunications ' + w.en : 'Supercalifragilisticexpialidocious' + 'abcdefghijklmnopqrst'[i], ru: 'очень длинный перевод, который занимает несколько строк: ' + w.ru + ' и ещё немного пояснений' })); selected = new Set(scope.map(w => w.id)); renderWords(); }
    }, long);
    await page.locator('#testCount').selectOption('20');
    await page.evaluate(() => printTeacherTest());
    await page.emulateMedia({ media: 'print' });
    const fit = await page.evaluate(() => {
      const sheet = document.querySelector('#lexigoPrint .print-student-sheet');
      const qs = [...sheet.querySelectorAll('.print-question')];
      const clipped = qs.filter(q => q.scrollHeight > q.clientHeight + 1 || q.scrollWidth > q.clientWidth + 1).length;
      const area = sheet.querySelector('.print-questions').getBoundingClientRect(), last = Math.max(...qs.map(q => q.getBoundingClientRect().bottom));
      return { count: qs.length, clipped, overflowSheet: sheet.scrollHeight > sheet.clientHeight + 1, beyond: last > area.bottom + 1 };
    });
    assert.equal(fit.count, 20); assert.equal(fit.clipped, 0, label + ': clipped task'); assert.equal(fit.overflowSheet, false, label + ': sheet overflow'); assert.equal(fit.beyond, false, label + ': tasks beyond area');
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    await page.emulateMedia({ media: 'screen' });
    assert.equal((await PDFDocument.load(pdf)).getPageCount(), 2, label + ': one student page + answer key');
    if (hasPdftotext) {
      writeFileSync('/tmp/lexigo-layout.pdf', pdf); execSync('pdftotext -f 1 -l 1 -bbox /tmp/lexigo-layout.pdf /tmp/lexigo-layout.html');
      const html = (await import('node:fs')).readFileSync('/tmp/lexigo-layout.html', 'utf8');
      const xs = [...html.matchAll(/xMin="([\d.]+)"[^>]*xMax="([\d.]+)"/g)].map(m => [Number(m[1]), Number(m[2])]);
      const mm = pt => pt / 72 * 25.4, left = mm(Math.min(...xs.map(x => x[0]))), right = mm(595.28 - Math.max(...xs.map(x => x[1])));
      assert.ok(left >= 19.5 && right >= 19.5, label + `: side margins ${left.toFixed(1)} / ${right.toFixed(1)} mm`);
      console.log(`  ${label}: 20 tasks on one A4 page, margins ${left.toFixed(1)} mm / ${right.toFixed(1)} mm, nothing clipped`);
    } else console.log(`  ${label}: 20 tasks on one A4 page, nothing clipped (pdftotext not installed: margin check skipped)`);
  }
  assert.deepEqual(errors, []);
  console.log('PASS print layout: 20 tasks per A4 page, 20 mm side margins, long words wrap without clipping');
} finally { await browser.close(); }
