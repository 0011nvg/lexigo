import { chromium } from './browser-runtime.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try{
 for(const width of [360,390,768]){
  const page=await browser.newPage({viewport:{width,height:780},isMobile:width<500,
   hasTouch:width<500});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:3000/?localDemo=1#/lesson/2/m0');
  await page.locator('#localDemoPanel').waitFor();
  assert.equal(await page.locator('#localJwt').count(),1);
  assert.equal(await page.locator('#localAssignment').count(),1);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  assert.ok(overflow<=2,'Mobile horizontal overflow '+width+': '+overflow);
  await page.locator('#localBegin').click();
  await page.waitForFunction(()=>document.querySelector('#localStatus')?.textContent?.includes('Укажи тестовый JWT'));
  assert.match(await page.locator('#localStatus').innerText(),/Укажи тестовый JWT/);
  if(width===360){
   const calls=[];
   const attempt='00000000-0000-4000-8000-000000000501';
   const challenge='00000000-0000-4000-8000-000000000502';
   const board=Array.from({length:36},(_,i)=>String(i%6));
   await page.route('http://127.0.0.1:54321/functions/v1/learning-api/**',async route=>{
    const request=route.request();
    if(request.method()==='OPTIONS'){
     await route.fulfill({status:204,headers:{'access-control-allow-origin':'http://127.0.0.1:3000',
      'access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'authorization,content-type'}});
     return;
    }
    const name=new URL(request.url()).pathname.split('/').at(-1);
    const body=request.postDataJSON();calls.push({name,body});
    const data=name==='start-attempt'?{id:attempt}:name==='next-question'?
     {challengeId:challenge,index:0,wordId:'fixture-word',mode:'crystals',
      question:{responseType:'crystals',board,target:7}}:
     {correct:false,complete:false,board,hits:0,moves:1};
    await route.fulfill({status:200,contentType:'application/json',
     headers:{'access-control-allow-origin':'http://127.0.0.1:3000'},
     body:JSON.stringify(data)});
   });
   await page.locator('#localJwt').fill('synthetic-test-jwt');
   await page.locator('#localAssignment').fill('00000000-0000-4000-8000-000000000503');
   await page.locator('#localBegin').click();
   await page.getByText('crystals · задание 1').waitFor();
   const gems=page.getByRole('button',{name:/Кристалл/});
   assert.equal(await gems.count(),36,'Six-by-six mobile board not rendered');
   await gems.nth(0).click();await gems.nth(1).click();
   await page.waitForFunction(()=>document.querySelector('#localMessage')?.textContent?.includes('действие'));
   assert.ok(calls.some(x=>x.name==='play-round'&&x.body.action==='swap'&&
    x.body.payload.from===0&&x.body.payload.to===1),'Mobile swap not sent through API');
   const mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
   assert.ok(mobileOverflow<=2,'Crystal mobile overflow '+mobileOverflow);
  }
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
