import assert from 'node:assert/strict';
import {chromium} from './browser-runtime.mjs';
const browser=await chromium.launch({headless:true});
try{for(const width of [390,1440]){
 const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173/#/lesson/2/m0');await page.locator('#launcher').waitFor();
 // Limit the real lesson to one word, then submit through the real input.
 await page.evaluate(()=>{selected=new Set([scope[0].id]);renderWords()});
 for(let attempt=0;attempt<3;attempt++){
  if(attempt===0)await page.locator('[data-mode="spell"]').click();else await page.locator('.result-actions').getByRole('button',{name:'Повторить',exact:true}).click();
  const answer=await page.evaluate(()=>game.words[0].en);await page.locator('#play .answerbox input').fill(answer);await page.locator('#play').getByRole('button',{name:'Проверить',exact:true}).click();
  await page.locator('#play').getByRole('button',{name:/Результат →/}).click();await page.locator('.lesson-result').waitFor();
  assert.equal(await page.locator('.result-earned strong').innerText(),attempt===0?'+1':attempt===1?'+2':'+0');
  assert.equal(await page.locator('.result-metric strong').first().innerText(),'1 / 1');
  await page.waitForFunction(()=>document.querySelector('.result-mascot')?.naturalWidth>0);
  const earned=await page.locator('.result-earned strong').innerText();await page.evaluate(()=>finish());assert.equal(await page.locator('.lesson-result').count(),1);assert.equal(await page.locator('.result-earned strong').innerText(),earned);
 }
 await page.locator('.result-actions').getByRole('button',{name:'К выбору режима'}).click();await page.locator('[data-mode="cards"]').click();
 // Use the engine completion for the presentation-only self-rating edge case.
 await page.evaluate(()=>{game.index=game.words.length;finish()});assert.match(await page.locator('.lesson-result').innerText(),/самооценка/);assert.equal(await page.locator('.result-earned strong').innerText(),'+0');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);await page.close();
}console.log('PASS results: real spelling completion, unique +1/+2/+0 rewards, stable rerender, self-rating distinction, responsive UI');}finally{await browser.close()}
