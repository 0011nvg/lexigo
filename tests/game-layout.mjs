import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {chromium} from './browser-runtime.mjs';
const BASE=process.env.LEXIGO_URL||'http://127.0.0.1:4173/index.html';const browser=await chromium.launch({headless:true});await fs.mkdir('test-results',{recursive:true});
try{for(const viewport of [{width:1280,height:720},{width:1366,height:768}]){
 const page=await browser.newPage({viewport,reducedMotion:'reduce'});
 for(const mode of ['quiz','spell','audio','truefalse','cards','builder','pairs','listen','mixed']){
  await page.goto(BASE+'#/lesson/2/3/play/'+mode);await page.locator('#play').waitFor();
  const bounds=await page.locator('#play .option:visible,#play .answerbox:visible,#play .buttons:visible,#play .builder-tools:visible,#play .pair-grid .pair:visible').evaluateAll(nodes=>nodes.map(n=>({text:n.textContent.slice(0,30),top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom})));
  assert.ok(bounds.length,mode+' has answer controls');for(const b of bounds)assert.ok(b.top>=0&&b.bottom<=viewport.height,mode+' at '+viewport.width+': '+JSON.stringify(b));
  if(['quiz','spell','audio'].includes(mode)){
   if(mode==='quiz'){const correct=await page.evaluate(()=>game.words[game.index].ru);const labels=await page.locator('#play .option').allTextContents();await page.getByRole('button',{name:labels.find(t=>t!==correct),exact:true}).click();}
   else{await page.locator('.answerbox input').fill('zzzz');await page.locator('.answerbox button').click();}
   await page.locator('.feedback-row').waitFor();for(const selector of ['.feedback','.feedback-row>.btn']){const box=await page.locator(selector).boundingBox();assert.ok(box.y>=0&&box.y+box.height<=viewport.height,mode+' result fits: '+selector);}
   assert.equal(await page.locator('.why').getAttribute('open'),null);await page.screenshot({path:'test-results/'+mode+'-error-'+viewport.width+'.png'});
  }
 }
 await page.close();
}console.log('PASS game screens at 100%: 1280×720 and 1366×768, nine modes, answer controls and error/continue states');}finally{await browser.close();}
