import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
const base=process.env.LEXIGO_URL||'http://127.0.0.1:4173/';
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base);
 await page.locator('#book').waitFor();
 await page.locator('#roleSwitch').click();
 await page.locator('#unit').selectOption({index:1});
 const shared=await page.evaluate(()=>lessonShareUrl());
 assert.ok(shared&&shared.includes('lessonGrade=')&&shared.includes('lessonSection='));
 await page.goto(shared);
 assert.equal(await page.evaluate(()=>String(book.grade)),new URL(shared).searchParams.get('lessonGrade'));
 assert.equal(await page.evaluate(()=>String(unit)),new URL(shared).searchParams.get('lessonSection'));
 assert.ok(await page.locator('#words input:checked').count()>0);
 assert.equal(await page.locator('#shareLesson').isVisible(),false);
 await page.goto(base+'cabinet.html#parent');
 assert.equal(await page.locator('#tab-parent').count(),0);
 assert.equal(await page.locator('#parent').count(),0);
 assert.equal(await page.locator('#teacher').isVisible(),true);
 assert.deepEqual(errors,[]);
 console.log('PASS: shareable lesson deep link, teacher-only sharing, parent role removed');
}finally{await browser.close()}
