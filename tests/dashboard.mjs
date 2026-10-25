import assert from 'node:assert/strict';
import {chromium} from './browser-runtime.mjs';
const browser=await chromium.launch({headless:true});
try{for(const width of [390,1440]){
 const page=await browser.newPage({viewport:{width,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173/');await page.locator('.bottom-nav').waitFor();
 await page.locator('[data-tab="profile"]').click();assert.equal(await page.locator('.progress-tile strong').first().innerText(),'0');
 await page.evaluate(()=>{const w=LEXIGO_DATA.books[0].sections[0].words[0];localStorage.setItem('lexigo_progress_v1',JSON.stringify({[w.id]:{right:4,recall:2}}))});
 await page.reload();await page.locator('.progress-tile').first().waitFor();assert.equal(await page.locator('.progress-tile strong').first().innerText(),'1');
 await page.locator('[data-tab="awards"]').click();assert.equal(await page.locator('.crystal-balance>strong').innerText(),'3');assert.equal(await page.locator('.award-card.earned').count(),1);
 await page.reload();await page.locator('.crystal-balance').waitFor();assert.equal(await page.locator('.crystal-balance>strong').innerText(),'3');
 await page.locator('[data-tab="games"]').click();assert.equal(await page.locator('.dashboard-game').count(),10);
 await page.locator('.dashboard-game').filter({hasText:'Выбери перевод'}).click();await page.locator('#game').waitFor();assert.equal(await page.locator('.bottom-nav').isVisible(),false);
 await page.locator('#back').click();assert.equal(await page.locator('.bottom-nav').isVisible(),true);
 await page.locator('[data-tab="home"]').click();assert.equal(await page.locator('#homeTitle').isVisible(),true);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);await page.close();
}console.log('PASS dashboard: mobile/desktop routes, real persisted progress, stable rewards, ten game links');}finally{await browser.close()}
