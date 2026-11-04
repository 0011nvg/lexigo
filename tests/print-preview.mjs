// Renders the real A4 PDF of the teacher test (20 tasks) for visual review: node tests/print-preview.mjs out.pdf [grade] [section]
import { chromium } from './browser-runtime.mjs';
import { useFakeCloud } from './fake-cloud.mjs';   // 2026-11-04: материалы учителя — только в аккаунте учителя
const out = process.argv[2] || '/tmp/lexigo-test.pdf', grade = process.argv[3] || '5', sec = process.argv[4] || 'm1';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();await useFakeCloud(page, { role: 'teacher' });
await page.goto('http://127.0.0.1:4173/index.html#/lesson/' + grade + '/' + sec + '/teacher');
await page.locator('#printTest').waitFor();
await page.evaluate(() => { window.print = () => {}; });
await page.locator('#testCount').selectOption('20');
await page.waitForFunction(() => document.body.classList.contains('teacher-mode') && typeof scope !== 'undefined' && scope.length > 0);
console.log(await page.evaluate(() => [document.body.className, scope.length, selected.size]));
await page.evaluate(() => printTeacherTest());
console.log('tasks', await page.locator('#lexigoPrint .print-question').count());
await page.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
console.log('PDF written', out);
await browser.close();
