import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base=process.env.LEXIGO_URL||'http://127.0.0.1:4173/';
const browser=await chromium.launch({headless:true});
const errors=[];
async function scenario(viewport){
 const page=await browser.newPage({viewport,reducedMotion:'reduce',acceptDownloads:true});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base,{waitUntil:'load'});
 await page.locator('#book').waitFor({state:'attached'});
 assert.ok(await page.locator('#words input[type=checkbox]').count()>0,'Vocabulary loaded');
 assert.ok(await page.locator('#homeTitle').isVisible(),'Landing page headline visible');
 assert.equal(await page.locator('.home-step').count(),3,'Three onboarding steps');
 await page.locator('#heroStart').click();
 assert.ok(await page.locator('#catalogAside').isVisible(),'CTA reveals library on mobile and desktop');
 await page.locator('#homeNav').click();
 assert.ok(await page.locator('#homeTitle').isVisible(),'Home navigation works');

 await page.locator('#quickStart').click();
 await page.locator('#game:not(.hidden)').waitFor();
 assert.ok(await page.locator('#play .question').count()>0,'Daily practice starts');
 await page.locator('#gameHome').click();
 await page.locator('#launcher:not(.hidden)').waitFor();
 assert.ok(await page.locator('#homeTitle').isVisible(),'Game can return home');
 await page.locator('#quickStart').click();
 await page.locator('#game:not(.hidden)').waitFor();

 await page.locator('#back').click();
 await page.locator('#launcher:not(.hidden)').waitFor();
 await page.locator('[data-mode="crystals"]').click();
 await page.locator('#crystalBoard .crystal-tile').first().waitFor();
 await page.locator('#crystalMute').click();assert.match(await page.locator('#crystalMute').innerText(),/выкл/);
 await page.locator('#crystalMute').click();assert.match(await page.locator('#crystalMute').innerText(),/вкл/);
 for(let i=0;i<7;i++){
  const move=await page.evaluate(()=>gemPossible([...game.gemBoard]));
  assert.ok(move,'Playable match-three move exists');
  await page.locator('#crystalBoard .crystal-tile').nth(move[0]).click();
  await page.locator('#crystalBoard .crystal-tile').nth(move[1]).click();
 }
 assert.match(await page.locator('#crystalScore').innerText(),/очков/);
 assert.ok(await page.evaluate(()=>game.crystals>=21));
 assert.ok(await page.evaluate(()=>game.crystalPoints>=210));
 assert.ok(await page.locator('.crystal-question-overlay').isVisible(),'Vocabulary task automatically overlays gems');
 assert.ok(await page.locator('.crystal-arena').count(),'Gem board remains behind the task');
 for(let n=0;n<3;n++){
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
 if(viewport.width<=760){await page.locator('#catalogToggle').click();assert.equal(await page.locator('#catalogToggle').getAttribute('aria-expanded'),'true')}
 await page.locator('#book').waitFor({state:'visible'});
 await page.locator('#book').selectOption('3');
 assert.ok((await page.locator('#currentLesson').innerText()).includes('3'));
 await page.close();
}
try{
 await scenario({width:1280,height:800});
 await scenario({width:390,height:844});
 assert.deepEqual(errors,[],'Browser runtime errors');
 console.log('PASS: desktop/mobile: daily training, match-three crystals, teacher report/CSV, catalog and grade switch');
}finally{await browser.close()}
