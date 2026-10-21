import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try{
 for(const width of [360,390,768]){
  const page=await browser.newPage({viewport:{width,height:780},isMobile:width<500,
   hasTouch:width<500});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:3000/?localDemo=1');
  await page.locator('#localDemoPanel').waitFor();
  assert.equal(await page.locator('#localJwt').count(),1);
  assert.equal(await page.locator('#localAssignment').count(),1);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  assert.ok(overflow<=2,'Mobile horizontal overflow '+width+': '+overflow);
  await page.locator('#localBegin').click();
  await page.locator('#localStatus').getByText('Укажи тестовый JWT и ID назначения').waitFor();
  assert.deepEqual(errors,[],'Mobile demo script error');
  await page.close();
 }
 const hidden=await browser.newPage();
 await hidden.goto('http://127.0.0.1:3000/');
 assert.equal(await hidden.locator('#localDemoPanel').count(),0,'Demo enabled without flag');
 await hidden.goto('http://127.0.0.1:4173/?localDemo=1');
 assert.equal(await hidden.locator('#localDemoPanel').count(),0,'Demo enabled on nonlocal-demo port');
 await hidden.close();
 console.log('PASS: local-only game adapter gate and mobile layout');
}finally{await browser.close()}
