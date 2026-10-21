import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.LEXIGO_URL||'http://127.0.0.1:4173/';
const browser=await chromium.launch({headless:true});
await fs.mkdir('test-results',{recursive:true});
const issues=[];
async function run(name,viewport){
 const page=await browser.newPage({viewport,reducedMotion:'reduce',acceptDownloads:true});
 const faults=[];page.on('pageerror',e=>faults.push(e.message));
 page.on('console',m=>{if(m.type()==='error')faults.push('console: '+m.text())});
 const capture=async suffix=>page.screenshot({path:'test-results/'+name+'-'+suffix+'.png',fullPage:true});
 try{
  await page.goto(base,{waitUntil:'load'});await page.locator('#words input[type=checkbox]').first().waitFor();
  assert.equal(await page.locator('#homeTitle').isVisible(),true);
  await capture('home');
  const layout=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));
  assert.ok(layout.scroll<=layout.viewport+2,'Horizontal overflow: '+JSON.stringify(layout));
  await page.locator('#heroStart').click();await capture('library');
  for(const mode of ['cards','quiz','pairs','spell','fix','truefalse','audio','boss','crystals']){
   await page.evaluate(()=>{selected=new Set(scope.map(w=>w.id));renderWords()});
   await page.locator('[data-mode="'+mode+'"]').click();
   assert.ok(await page.locator('#game').isVisible(),mode+' opened');
   assert.ok(await page.locator('#play').isVisible(),mode+' has play area');
   await capture(mode);
   if(mode==='pairs')assert.ok(await page.locator('#play .pair').count()>=8,'pairs populated');
   if(mode==='crystals')assert.equal(await page.locator('#crystalBoard .crystal-tile').count(),36);
   await page.locator('#back').click();
   assert.equal(await page.locator('#launcher').isVisible(),true,mode+' exited');
  }
  await page.locator('#roleSwitch').click();
  assert.equal(await page.locator('#printTest').isVisible(),true);
  await page.evaluate(()=>{window.__printCalled=0;window.print=()=>{window.__printCalled++};printTeacherTest()});
  assert.equal(await page.evaluate(()=>window.__printCalled),1);
  assert.ok(await page.locator('#lexigoPrint .print-question').count()>0);
  assert.equal(await page.locator('#lexigoPrint .print-question').count(),await page.locator('#lexigoPrint .print-key li').count());
  await capture('teacher');
  assert.deepEqual(faults,[],'Browser errors: '+faults.join('; '));
  console.log('PASS',name,'home, library, 9 modes, teacher print');
 }catch(e){issues.push({name,message:e.stack||String(e),faults});await capture('failure').catch(()=>{});console.error('FAIL',name,e)}finally{await page.close()}
}
try{
 await run('desktop',{width:1440,height:900});
 await run('laptop',{width:1024,height:768});
 await run('tablet',{width:768,height:1024});
 await run('phone',{width:390,height:844});
 await run('small-phone',{width:360,height:740});
 if(issues.length)throw Error(JSON.stringify(issues,null,2));
}finally{await browser.close()}
