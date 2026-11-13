import { chromium } from './browser-runtime.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
for(const [name,width,height] of [['desktop',1280,720],['phone',390,844],['short',1024,600]]){
 const ctx=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173/index.html#/lesson/2/3/play/crystals');await page.locator('.cq-level[data-level="1"]').click();
 for(let i=0;i<3;i++){await page.evaluate(()=>{LexiCrystalQuest.tryMove(...LexiCrystalEngine.findMove(LexiCrystalQuest.state()));});await page.waitForTimeout(200);await page.waitForFunction(()=>!LexiCrystalQuest.debug().busy||!!document.querySelector('.cq-word'));}
 for(let i=0;i<7;i++){
  await page.locator('.cq-word').waitFor();assert.match(await page.locator('#cqWordTitle').innerText(),new RegExp(`Задание ${i+1} из 7`));
  const rect=await page.locator('.cq-word-card').evaluate(e=>({h:e.scrollHeight,c:e.clientHeight}));assert.ok(rect.h<=rect.c+1,`${name} scroll on question ${i+1}: ${JSON.stringify(rect)}`);
  const info=await page.evaluate(()=>{const w=LexiCrystalQuest.debug().words[LexiCrystalQuest.debug().answers.length];const q=document.querySelector('.cq-word .question');return {en:w.en,ru:w.ru,proposed:q.querySelector('h2')?.nextElementSibling?.textContent,buttons:[...q.querySelectorAll('button')].map(x=>x.textContent.trim())}});
  let label=i%3===0?(info.proposed===info.ru?'✓ Верно':'✕ Неверно'):i%3===1?info.ru:info.en;
  if(i===0)label=label==='✓ Верно'?'✕ Неверно':'✓ Верно';
  await page.locator('.cq-word .question').getByRole('button',{name:label,exact:true}).click();await page.locator('.cq-continue').waitFor();
  const end=await page.locator('.cq-continue').boundingBox();assert.ok(end.y+end.height<=height+1,`${name} continue offscreen`);
  await page.locator('.cq-continue').click();
 }
 await page.waitForFunction(()=>!LexiCrystalQuest.debug().busy);
 await page.evaluate(()=>{const s=LexiCrystalQuest.state();s.moves=1;s.target=1e9;});await page.evaluate(()=>{LexiCrystalQuest.tryMove(...LexiCrystalEngine.findMove(LexiCrystalQuest.state()));});await page.locator('.crystal-result').waitFor();
 assert.match(await page.locator('.crystal-result').innerText(),/Верных ответов:\s*6 из 7/);assert.match(await page.locator('.crystal-result').innerText(),/Получено кристаллов:\s*6/);
 await page.getByRole('button',{name:'Играть ещё'}).click();assert.equal(await page.locator('.cq-gem').count(),49);assert.deepEqual(errors,[]);console.log('PASS',name,'seven mixed questions, error, reward, result, retry, layout');await ctx.close();
}
await browser.close();
