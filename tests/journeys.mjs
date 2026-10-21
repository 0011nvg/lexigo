import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base=process.env.LEXIGO_URL||'http://127.0.0.1:4173/';
const browser=await chromium.launch({headless:true});
const errors=[];
async function scenario(viewport){
 const page=await browser.newPage({viewport});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base,{waitUntil:'load'});
 await page.locator('#book').waitFor();
 assert.ok(await page.locator('#words input[type=checkbox]').count()>0,'Vocabulary loaded');
 await page.locator('#journeyStart').click();
 await page.locator('#game:not(.hidden)').waitFor();
 assert.ok(await page.locator('#play .question').count()>0,'Daily practice starts');
 await page.locator('#back').click();
 await page.locator('#launcher:not(.hidden)').waitFor();
 await page.locator('#journeyCrystals').click();
 await page.locator('.crystal-arena').waitFor();
 for(let i=0;i<4;i++)await page.locator('.gem:not([disabled])').first().click();
 assert.match(await page.locator('#crystalScore').innerText(),/4 \/ 4/);
 await page.locator('.crystal-continue').click();
 for(let n=0;n<4;n++){
  const state=await page.evaluate(()=>({w:game.words[game.index],mode:game.mode,index:game.index}));
  const box=page.locator('#play');
  if(await box.locator('.answerbox input').count()){
   await box.locator('.answerbox input').fill(state.w.en);
   await box.getByRole('button',{name:'Проверить'}).click();
  }else if(await box.locator('.options').count()){
   await box.locator('.options button').filter({hasText:state.w.ru}).first().click();
  }else if(await box.getByRole('button',{name:'✓ Верно'}).count()){
   const displayed=await box.locator('.question p').nth(1).innerText();
   await box.getByRole('button',{name:displayed.trim()===state.w.ru?'✓ Верно':'✕ Неверно'}).click();
  }else throw Error('Unexpected crystal exercise at '+n);
  await box.getByRole('button',{name:/Следующее|Результат/}).click();
 }
 const state=await page.evaluate(()=>({index:game.index,length:game.words.length}));
 if(state.index<state.length)await page.locator('.crystal-arena').waitFor();
 await page.locator('#back').click();
 await page.locator('#roleSwitch').click();
 assert.equal(await page.locator('#roleSwitch').getAttribute('aria-pressed'),'true');
 assert.ok(await page.locator('.teacher-only').first().isVisible());
 await page.locator('#showReport').click();
 assert.ok(await page.locator('#reportContent table tbody tr').count()>0);
 const downloadPromise=page.waitForEvent('download');await page.locator('#exportReport').click();const download=await downloadPromise;assert.match(download.suggestedFilename(),/lexigo.*csv/);
 await page.locator('#roleSwitch').click();
 assert.equal(await page.locator('#roleSwitch').getAttribute('aria-pressed'),'false');
 await page.locator('#changeLesson').click();
 assert.equal(await page.locator('#catalogToggle').getAttribute('aria-expanded'),'true');
 await page.locator('#book').selectOption('3');
 assert.ok((await page.locator('#currentLesson').innerText()).includes('3'));
 await page.close();
}
try{
 await scenario({width:1280,height:800});
 await scenario({width:390,height:844});
 assert.deepEqual(errors,[],'Browser runtime errors');
 console.log('PASS: desktop/mobile: daily training, crystal loop, teacher report/CSV, catalog and grade switch');
}finally{await browser.close()}
