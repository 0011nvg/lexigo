// A4 teacher test layout: 20 tasks fit one page, margins 20 mm top/bottom and 15 mm left/right, nothing clipped — also with very long words.
// The teacher sheet «Критерии оценивания для учителя» (scale + keys) is a separate page and never on the student page.
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
    const sheets = await page.evaluate(() => ({ student: document.querySelector('#lexigoPrint .print-student-sheet').innerText, teacher: document.querySelector('#lexigoPrint .print-teacher').innerText }));
    assert.doesNotMatch(sheets.student, /Критерии|Ключи|→/, label + ': no criteria or keys on the student page');
    assert.match(sheets.teacher, /Критерии оценивания для учителя/); assert.doesNotMatch(sheets.teacher, /Для ребёнка/i);
    assert.match(sheets.teacher, /максимальный первичный балл/); assert.match(sheets.teacher, /«5»\s+18–20/); assert.match(sheets.teacher, /«2»\s+0–9/);
    assert.equal(await page.evaluate(() => document.querySelectorAll('#lexigoPrint .crit-keys li').length), 20, label + ': 20 keys');
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    await page.emulateMedia({ media: 'screen' });
    const pages = (await PDFDocument.load(pdf)).getPageCount();
    assert.ok(pages >= 2 && pages <= 3, label + ': one student page + teacher criteria (' + pages + ' pages)');
    if (hasPdftotext) { writeFileSync('/tmp/lexigo-pages.pdf', pdf); const p2 = execSync('pdftotext -f 2 -l 2 /tmp/lexigo-pages.pdf -').toString(); assert.match(p2, /Критерии оценивания для учителя/, label + ': criteria start on page 2'); const p1 = execSync('pdftotext -f 1 -l 1 /tmp/lexigo-pages.pdf -').toString(); assert.doesNotMatch(p1, /Критерии|Ключи/, label + ': student page has no criteria'); }

    if (hasPdftotext) {
      writeFileSync('/tmp/lexigo-layout.pdf', pdf); execSync('pdftotext -f 1 -l 1 -bbox /tmp/lexigo-layout.pdf /tmp/lexigo-layout.html');
      const html = (await import('node:fs')).readFileSync('/tmp/lexigo-layout.html', 'utf8');
      const box = [...html.matchAll(/xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)"/g)].map(m => m.slice(1).map(Number));
      const mm = pt => pt / 72 * 25.4, left = mm(Math.min(...box.map(b => b[0]))), right = mm(595.28 - Math.max(...box.map(b => b[2]))), top = mm(Math.min(...box.map(b => b[1]))), bottom = mm(841.89 - Math.max(...box.map(b => b[3])));
      assert.ok(left >= 14.5 && right >= 14.5, label + `: side margins ${left.toFixed(1)} / ${right.toFixed(1)} mm`);
      assert.ok(top >= 19.5 && bottom >= 19.5, label + `: top/bottom margins ${top.toFixed(1)} / ${bottom.toFixed(1)} mm`);
      console.log(`  ${label}: 20 tasks on one A4 page, margins top ${top.toFixed(1)} / bottom ${bottom.toFixed(1)} / left ${left.toFixed(1)} / right ${right.toFixed(1)} mm, nothing clipped`);
    } else console.log(`  ${label}: 20 tasks on one A4 page, nothing clipped (pdftotext not installed: margin check skipped)`);
  }
  assert.deepEqual(errors, []);
  console.log('PASS print layout: 20 tasks per A4 page, margins 20/20/15/15 mm, separate teacher criteria with scale and keys');
} finally { await browser.close(); }
