// Crystal v4 browser contract; run against the isolated local server.
import assert from 'node:assert/strict';
import {chromium} from './browser-runtime.mjs';
import {webkit} from 'playwright';
const BASE=process.env.LEXIGO_URL||'http://127.0.0.1:4173/index.html';
for(const [name,engine] of [['chromium',chromium],...(process.env.LEXIGO_WEBKIT?[['webkit',webkit]]:[])]){
 const browser=await engine.launch({headless:true});
 try{
  const ctx=await browser.newContext({viewport:{width:1280,height:720},reducedMotion:'reduce'}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(BASE+'#/lesson/2/3/play/crystals');
  assert.equal(await page.locator('.cq-level').count(),5);assert.equal(await page.locator('.cq-level:disabled').count(),4);
  await page.locator('.cq-level[data-level="1"]').click();
  assert.equal(await page.locator('.cq-gem').count(),49);assert.equal(await page.locator('#cqMoves').innerText(),'10');
  const board=await page.locator('#cqBoard').boundingBox();assert.ok(board.width>=265, 'desktop board should be large enough');const bottom=await page.locator('.cq-tools').boundingBox();assert.ok(board.width>=500, 'desktop board uses the available screen space');
  const idle=()=>page.waitForFunction(()=>!LexiCrystalQuest.debug().busy||document.querySelector('.cq-word'));
  const words=async()=>{while(await page.locator('.cq-word').count()){await page.locator('.cq-word .question button').first().click();await page.locator('.cq-continue').click();}await idle();};
  const move=async pair=>{for(const i of pair)await page.locator('.cq-gem[data-i="'+i+'"]').click();await idle();if(await page.locator('.cq-word').count())await words();};
  const bad=await page.evaluate(()=>{const s=LexiCrystalQuest.state(),E=LexiCrystalEngine;for(let a=0;a<s.n;a++)for(const b of [a+1,a+s.size])if(E.neighbors(s,a,b)&&!E.validSwap(s,a,b))return [a,b];});
  const before=await page.evaluate(()=>JSON.stringify(LexiCrystalQuest.state()));await move(bad);assert.equal(await page.evaluate(()=>JSON.stringify(LexiCrystalQuest.state())),before);assert.match(await page.locator('#cqMessage').innerText(),/Ход сохранён|ход сохранён/);
  await page.locator('.cq-tools button',{hasText:'Подсказка'}).click();assert.equal(await page.locator('.cq-gem.hint').count(),2);
  const good=await page.evaluate(()=>LexiCrystalEngine.findMove(LexiCrystalQuest.state()));await move(good);assert.equal(await page.locator('#cqMoves').innerText(),'9');assert.ok(Number(await page.locator('#cqScore').innerText())>=30);
  await page.locator('.cq-tools button',{hasText:'Пауза'}).click();await page.locator('.cq-pause button',{hasText:'Продолжить'}).click();await idle();
  // Drive the real board into the two terminal conditions through its final legal move.
  await page.evaluate(()=>{const s=LexiCrystalQuest.state();s.moves=1;s.target=s.score+1;});await move(await page.evaluate(()=>LexiCrystalEngine.findMove(LexiCrystalQuest.state())));
  await page.locator('.crystal-result:not(.lost)').waitFor();assert.ok(await page.getByRole('button',{name:'Следующий уровень →',exact:true}).isVisible());
  await page.getByRole('button',{name:'Следующий уровень →',exact:true}).click();
  await page.evaluate(()=>{const s=LexiCrystalQuest.state();s.moves=1;s.target=1e9;});await move(await page.evaluate(()=>LexiCrystalEngine.findMove(LexiCrystalQuest.state())));
  await page.locator('.crystal-result.lost').waitFor();assert.match(await page.locator('.crystal-result').innerText(),/Ходы закончились/);
  await page.getByRole('button',{name:'Играть ещё',exact:true}).click();assert.equal(await page.locator('#cqMoves').innerText(),'10');
  // A dead board recovers without using a move.
  await page.evaluate(()=>{const s=LexiCrystalQuest.state();s.cells.forEach((p,i)=>p.c=(i%7+Math.floor(i/7))%5);});
  await page.locator('.cq-tools button',{hasText:'Подсказка'}).click();assert.equal(await page.locator('#cqMoves').innerText(),'10');assert.ok(await page.evaluate(()=>!!LexiCrystalEngine.findMove(LexiCrystalQuest.state())));
  await page.reload();await page.locator('.cq-map').waitFor();assert.equal(await page.locator('.cq-level[data-level="2"]').isEnabled(),true,'unlocked level survives reload');
  // Test a stone level through the same public level selector after fixture unlock.
  await page.evaluate(()=>{const key='lexigo_crystal_v4';const data=JSON.parse(localStorage.getItem(key));data.levels[2]={won:true,stars:1,best:650};localStorage.setItem(key,JSON.stringify(data));});await page.reload();await page.locator('.cq-level[data-level="3"]').click();assert.equal(await page.locator('.cq-rock').count(),1);
  const rock=await page.locator('.cq-rock').getAttribute('aria-label');await page.getByRole('button',{name:rock,exact:true}).click({force:true});assert.match(await page.locator('#cqMessage').innerText(),/неподвижный/);assert.equal(await page.locator('#cqMoves').innerText(),'10');
  for(const width of [390,360]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal scroll');const box=await page.locator('#cqBoard').boundingBox();assert.ok(box.width/7>=38);const tools=await page.locator('.cq-tools').boundingBox();assert.ok(box.width>=width-60,`board uses phone width: width=${width}, board=${box.width}`);}
  assert.deepEqual(errors,[]);console.log('PASS '+name+': crystal map, moves, recovery, win/loss, retry, storage, stones, phone layout');
 }finally{await browser.close();}
}
