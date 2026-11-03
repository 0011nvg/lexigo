import { chromium } from './browser-runtime.mjs';
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
 await page.locator('#courseCards a').first().click();
 assert.ok(await page.locator('#coursePage').isVisible(),'CTA opens the course page');
 await page.locator('#homeNav').click();
 assert.ok(await page.locator('#homeTitle').isVisible(),'Home navigation works');

 await page.goto(base+'#/lesson/2/m0');
 await page.locator('#quickStart').click();
 await page.locator('#game:not(.hidden)').waitFor();
 assert.ok(await page.locator('#play .question').count()>0,'Daily practice starts');
 await page.locator('#gameHome').click();
 assert.ok(await page.locator('#homeTitle').isVisible(),'Game can return home');
 await page.goto(base+'#/lesson/2/m0');
 await page.locator('#quickStart').click();
 await page.locator('#game:not(.hidden)').waitFor();

 await page.locator('#back').click();
 await page.locator('#launcher:not(.hidden)').waitFor();
 await page.locator('[data-mode="crystals"]').click();
 // 2026-11-02 v2: «Кристальная экспедиция» — карта уровней, ходы, цели, «Энергия Лекси» (подробно — tests/crystal-play.mjs)
 await page.locator('.cq-level[data-level="1"]').click();
 await page.locator('#cqBoard .cq-gem').first().waitFor();
 const sound=page.locator('.cq-tools [data-pref="muted"]');await sound.click();assert.match(await sound.innerText(),/выключен/);await sound.click();assert.match(await sound.innerText(),/включён/);
 for(let i=0;i<3;i++){
  if(await page.locator('.cq-word').count())break;
  const move=await page.evaluate(()=>LexiCrystalEngine.findMove(LexiCrystalQuest.state()));
  await page.locator('#cqBoard .cq-gem[data-i="'+move[0]+'"]').click();
  await page.locator('#cqBoard .cq-gem[data-i="'+move[1]+'"]').click();
  await page.waitForFunction(()=>!LexiCrystalQuest.debug().busy||document.querySelector('.cq-word'),null,{timeout:10000});
 }
 assert.ok(await page.evaluate(()=>LexiCrystalQuest.state().movesUsed>=1),'moves were made');
 assert.match(await page.locator('.cq-goals').innerText(),/Набери 1500 очков[\s\S]*Ответь верно на 12 слов/);
 await page.locator('#back').click();
 await page.locator('#roleSwitch').click();
 assert.equal(await page.locator('#roleSwitch').getAttribute('aria-pressed'),'true');
 assert.ok(await page.locator('.teacher-only').first().isVisible());
 assert.ok(await page.locator('#printTest').isVisible(),'Printable teacher test available');
 await page.evaluate(()=>{window.__printCalled=false;window.print=()=>{window.__printCalled=true};printTeacherTest()});
 assert.equal(await page.evaluate(()=>window.__printCalled),true,'Print dialog invoked');
 assert.ok(await page.locator('#lexigoPrint .print-question').count()>0,'Printable questions generated');
 assert.ok(await page.locator('#lexigoPrint .print-key li').count()>0,'Separate answer key generated');
 await page.locator('#showReport').click();
 assert.ok(await page.locator('#reportContent table tbody tr').count()>0);
 const downloadPromise=page.waitForEvent('download');await page.locator('#exportReport').click();const download=await downloadPromise;assert.match(download.suggestedFilename(),/lexi_spotlight.*csv/);
 await page.locator('#roleSwitch').click();
 assert.equal(await page.locator('#roleSwitch').getAttribute('aria-pressed'),'false');
 await page.locator('#openWords').click();
 await page.locator('#book').waitFor({state:'visible'});
 await page.locator('#book').selectOption('3');
 assert.ok((await page.locator('#currentLessonDetail').innerText()).includes('Spotlight 3'));
 await page.close();
}
try{
 await scenario({width:1280,height:800});
 await scenario({width:390,height:844});
 assert.deepEqual(errors,[],'Browser runtime errors');
 console.log('PASS: desktop/mobile: daily training, match-three crystals, teacher report/CSV, catalog and grade switch');
}finally{await browser.close()}
