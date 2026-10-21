import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
const base=process.env.LEXIGO_URL||'http://127.0.0.1:4173/';
const page=await browser.newPage({viewport:{width:1280,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base);
 await page.locator('#book').waitFor();
 await page.locator('#all').click();
 // Complete every pair using real DOM clicks, not by calling the scoring function.
 await page.locator('[data-mode="pairs"]').click();
 await page.locator('#play .pair-grid button').first().waitFor();
 const pairs=await page.evaluate(()=>game.words.map(w=>({en:w.en,ru:w.ru})));
 for(const w of pairs){
  await page.getByRole('button',{name:'Английское слово: '+w.en,exact:true}).click();
  await page.getByRole('button',{name:'Перевод: '+w.ru,exact:true}).click();
 }
 await page.locator('.pair-name-form input').waitFor();
 await page.locator('.pair-name-form input').fill('Тестовый игрок');
 await page.locator('.pair-name-form button').click();
 assert.match(await page.locator('.pair-leaderboard').innerText(),/Тестовый игрок/);
 const scores=await page.evaluate(()=>JSON.parse(localStorage.getItem('lexigo_pair_scores')||'[]'));
 assert.ok(scores.some(s=>s.name==='Тестовый игрок'&&s.pairs===pairs.length),'Named record was not saved');
 await page.reload();
 await page.locator('[data-mode="pairs"]').click();
 assert.match(await page.locator('.pair-leaderboard').innerText(),/Тестовый игрок/,'Leaderboard did not survive reload');
 await page.locator('#back').click();
 await page.locator('#roleSwitch').click();
 await page.locator('#all').click();
 for(const count of [5,10,20]){
  await page.locator('#testCount').selectOption(String(count));
  await page.evaluate(()=>{window.print=()=>{};printTeacherTest()});
  assert.equal(await page.locator('#lexigoPrint .print-question').count(),count);
  assert.equal(await page.locator('#lexigoPrint .print-key li').count(),count);
  const pdf=await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true});
  const doc=await PDFDocument.load(pdf);
  const pages=doc.getPageCount();
  console.log('Print A4 '+count+' questions: '+pages+' pages');
  assert.equal(pages,2,'Expected exactly one question sheet and one teacher key for '+count+' questions');
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: named pairs leaderboard persistence and 5/10/20-question two-page A4 PDFs');
}finally{await browser.close()}
