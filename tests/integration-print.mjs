import {chromium} from 'playwright';
import {PDFDocument} from 'pdf-lib';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:3000/index.html');
 await page.locator('#book').waitFor();
 await page.locator('#roleSwitch').click();
 const largest=await page.evaluate(()=>DB.books.flatMap(b=>[...new Set(b.sections.map(x=>x.module))].map(m=>({grade:String(b.grade),module:m,count:uniquePairs(b.sections.filter(x=>x.module===m).flatMap(x=>x.words)).length}))).sort((a,b)=>b.count-a.count)[0]);
 assert.ok(largest.count>=20,'Need 20 real vocabulary words');
 await page.locator('#book').selectOption(largest.grade);
 await page.locator('#module').selectOption(largest.module);
 await page.locator('#unit').selectOption('__all');
 await page.locator('#all').click();
 for(const count of [5,10,20,25,30]){
  // Only test fixtures gain synthetic entries. The canonical 1035-word database is unchanged.
  await page.evaluate(count=>{
   const original=uniquePairs(scope);
   const extras=Array.from({length:Math.max(0,count-original.length)},(_,i)=>({id:'print-fixture-'+i,en:'sampleword'+i,ru:'тестовое слово '+i}));
   scope=[...original,...extras];selected=new Set(scope.map(w=>w.id));renderWords();
   window.print=()=>{};
  },count);
  await page.locator('#testCount').selectOption(String(count));
  await page.evaluate(()=>printTeacherTest());
  assert.equal(await page.locator('#lexigoPrint .print-question').count(),count);
  const sheets=page.locator('#lexigoPrint .print-student-sheet');
  assert.equal(await sheets.count(),Math.ceil(count/20));
  const distribution=await sheets.evaluateAll(nodes=>nodes.map(n=>[...n.querySelectorAll('.print-questions > div')].map(c=>c.querySelectorAll('.print-question').length)));
  assert.deepEqual(distribution,count<=20?[[Math.min(10,count),Math.max(0,count-10)]]:[[10,10],[Math.min(10,count-20),Math.max(0,count-30)]]);
  const pdf=await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true});
  const pages=(await PDFDocument.load(pdf)).getPageCount();
  console.log('A4 '+count+' questions: '+pages+' PDF pages; student columns '+JSON.stringify(distribution));
  assert.equal(pages,Math.ceil(count/20)+1,'One student page per 20 questions plus teacher answer key');
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: A4 PDF 5/10/20/25/30, 20 per student page, 10+10 columns');
}finally{await browser.close()}
