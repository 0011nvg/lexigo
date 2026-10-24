import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from './browser-runtime.mjs';
const browser=await chromium.launch({headless:true});await fs.mkdir('test-results',{recursive:true});
try{
 for(const width of [1440,390,360]){
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4173/');
  assert.equal(await page.locator('#homeTitle').isVisible(),true);assert.equal(await page.locator('#launcher').isVisible(),false);assert.equal(await page.locator('#words').isVisible(),false);
  await page.screenshot({path:'test-results/navigation-'+width+'-home.png',fullPage:true});
  for(const grade of [2,3,4]){
   await page.locator('#courseCards a[href="#/course/'+grade+'/0"]').click();
   assert.equal(await page.locator('#courseTitle').innerText(),'Spotlight '+grade);
   assert.equal(await page.locator('#courseTabs [aria-current]').innerText(),'Spotlight '+grade);
   assert.ok(await page.locator('#lessonCards a').count()>1);
   if(grade===2)await page.screenshot({path:'test-results/navigation-'+width+'-course.png',fullPage:true});
   await page.locator('#lessonCards a').nth(1).click();assert.equal(await page.locator('#launcher').isVisible(),true);
   assert.equal(await page.locator('#game').isVisible(),false);assert.equal(await page.locator('#words').isVisible(),false);
   assert.match(await page.locator('#currentLessonDetail').innerText(),new RegExp('Spotlight '+grade));
   await page.locator('#openWords').click();await page.locator('#words input').first().uncheck();
   const selected=await page.evaluate(()=>selectedWords().map(w=>w.id));await page.locator('#wordsDone').click();assert.deepEqual(await page.evaluate(()=>selectedWords().map(w=>w.id)),selected);
   await page.reload();assert.equal(await page.locator('#launcher').isVisible(),true);assert.match(await page.locator('#currentLessonDetail').innerText(),new RegExp('Spotlight '+grade));
   await page.locator('#homeNav').click();
  }
  await page.goto('http://127.0.0.1:4173/#/lesson/2/m0');
  await page.screenshot({path:'test-results/navigation-'+width+'-lesson.png',fullPage:true});
  for(const mode of ['cards','quiz','spell','pairs','truefalse','fix','audio','crystals','boss','mixed']){
   await page.locator(mode==='mixed'?'#quickStart':'#launcher [data-mode="'+mode+'"]').click();await page.locator('#game').waitFor({state:'visible'});
   assert.ok(page.url().endsWith('/play/'+mode));assert.equal(await page.locator('#launcher').isVisible(),false);assert.equal(await page.locator('#catalogAside').isVisible(),false);assert.equal(await page.locator('#homeTitle').isVisible(),false);
   if(mode==='quiz')await page.screenshot({path:'test-results/navigation-'+width+'-game.png',fullPage:true});
   await page.goBack();await page.locator('#launcher').waitFor();assert.equal(await page.evaluate(()=>game),null);
   await page.goForward();await page.locator('#game').waitFor();assert.equal(await page.evaluate(()=>game.mode),mode);
   await page.reload();await page.locator('#game').waitFor();assert.equal(await page.evaluate(()=>game.mode),mode);
   await page.locator('#back').click();
  }
  await page.locator('#lessonPrint').click();await page.locator('#printTest').waitFor();assert.equal(await page.locator('#launcher').isVisible(),false);
  await page.screenshot({path:'test-results/navigation-'+width+'-teacher.png',fullPage:true});
  await page.locator('#homeNav').click();await page.goto('http://127.0.0.1:4173/#/lesson/999/invalid/play/quiz');assert.equal(await page.locator('#homeTitle').isVisible(),true);
  await page.locator('#serverGamesOpen').click();await page.locator('#serverWorkspace').waitFor();assert.equal(await page.locator('#homeTitle').isVisible(),false);await page.locator('#homeNav').click();assert.equal(await page.locator('#serverWorkspace').isVisible(),false);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow');assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS navigation: three books, lesson isolation, chosen words, all ten routes, back/forward, reload, invalid links, cabinet, desktop/mobile');
}finally{await browser.close()}
