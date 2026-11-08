import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from './browser-runtime.mjs';
import {useFakeCloud} from './fake-cloud.mjs';
const browser=await chromium.launch({headless:true});
const BASE=process.env.LEXIGO_URL||'http://127.0.0.1:4173/index.html';
try{
 await fs.mkdir('test-results',{recursive:true});
 const page=await browser.newPage({viewport:{width:1366,height:768},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));const cloud=await useFakeCloud(page,{role:'student'});
 await page.goto(BASE+'#/lesson/5/0');await page.locator('.mode[data-mode=builder]').waitFor();
 const cards=await page.locator('#launcher .mode').evaluateAll(nodes=>nodes.map(n=>({bottom:n.getBoundingClientRect().bottom,top:n.getBoundingClientRect().top})));
 assert.ok(cards.every(r=>r.top>=0&&r.bottom<690),'all modes fit above bottom navigation at 1366×768');
 assert.equal(await page.locator('[data-mode=fix]').count(),0);
 await page.screenshot({path:'test-results/lexi-next-modes.png'});
 await page.evaluate(()=>{const apple=selectedWords().find(w=>w.en==='apple');start('builder',[apple]);});
 for(const ch of 'aplpe')await page.locator('.builder-bank button:not([hidden])').filter({hasText:new RegExp('^'+ch+'$')}).first().click();
 const value=()=>page.locator('.builder-line button').allTextContents().then(x=>x.join(''));
 assert.equal(await value(),'aplpe');
 await page.locator('.builder-line button').nth(2).click();await page.locator('.builder-line button').nth(3).click();assert.equal(await value(),'apple');
 const source=await page.locator('.builder-line button').nth(0).boundingBox(),target=await page.locator('.builder-line button').nth(1).boundingBox();
 await page.mouse.move(source.x+source.width/2,source.y+source.height/2);await page.mouse.down();await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:8});await page.mouse.up();assert.equal(await value(),'paple','drag swaps installed letters');
 const returning=await page.locator('.builder-line button').first().boundingBox(),bank=await page.locator('.builder-bank').boundingBox();assert.ok(bank.height>=48,'return area remains available with no unused letters');
 await page.mouse.move(returning.x+returning.width/2,returning.y+returning.height/2);await page.mouse.down();await page.mouse.move(bank.x+bank.width/2,bank.y+bank.height/2,{steps:8});await page.mouse.up();
 assert.equal(await page.locator('.builder-line button').count(),4);assert.equal(await page.locator('.builder-bank button:not([hidden])').count(),1);
 await page.locator('.builder-bank button:not([hidden])').click();assert.equal(await page.locator('.builder-line button').count(),5);
 const before=await value();await page.locator('.builder-line button').first().press('ArrowRight');assert.notEqual(await value(),before);await page.locator('.builder-line button').first().press('Delete');assert.equal(await page.locator('.builder-line button').count(),4);
 console.log('PASS next: compact modes, click swaps, drag swap/return, keyboard and repeated letters');
 // Actual client answer recording and queue submission, with all RPCs intercepted.
 await page.evaluate(()=>{const words=selectedWords().filter(isBuilderWord).slice(0,3);start('spell',words);});
 const incorrect=await page.evaluate(()=>game.words[game.index].en);
 await page.locator('.answerbox input').fill('aplpe-test');await page.locator('.answerbox button').click();await page.getByRole('button',{name:/Следующее/}).click();
 for(let guard=0;guard<8&&!(await page.locator('.lesson-result').count());guard++){
  const current=await page.evaluate(()=>({index:game.index,en:game.words[game.index].en}));await page.locator('.answerbox input').fill(current.en);await page.locator('.answerbox button').click();await page.waitForFunction(i=>game.index!==i||document.querySelector('.lesson-result'),current.index);
 }
 await page.locator('.lesson-result').waitFor();
 for(let i=0;i<100&&!cloud.rpc.some(([name,args])=>name==='submit_session'&&args.p.mode==='spell');i++)await page.waitForTimeout(100);
 const sent=cloud.rpc.find(([name,args])=>name==='submit_session'&&args.p.mode==='spell')?.[1].p;
 assert.ok(sent,'spell session submitted to intercepted RPC');assert.equal(sent.events.length,4);assert.equal(sent.events[0].answer,'aplpe-test');assert.equal(sent.events[0].expected,incorrect);
 assert.equal(sent.events.at(-1).r,true);assert.equal(sent.events.at(-1).answer,incorrect);assert.ok(sent.events.every((e,i)=>Number.isFinite(Date.parse(e.answered_at))&&e.attempt_index===i+1));
 console.log('PASS next: raw first/retry answers, timestamps and order reach submit_session');
 await page.locator('#back').click();await page.locator('.mode[data-mode=boss]').click();
 assert.deepEqual(await page.locator('.boss-type').evaluateAll(nodes=>nodes.map(n=>n.dataset.type)),['truefalse','quiz','builder','audio']);
 for(const type of await page.locator('.boss-type[aria-pressed=true]').evaluateAll(nodes=>nodes.map(n=>n.dataset.type)))await page.locator('.boss-type[data-type='+type+']').click();
 assert.equal(await page.getByRole('button',{name:'Начать тест →'}).isDisabled(),true);await page.locator('.boss-type[data-type=audio]').click();await page.screenshot({path:'test-results/lexi-next-audio.png'});await page.getByRole('button',{name:'Начать тест →'}).click();
 assert.deepEqual(await page.evaluate(()=>game.types),['audio']);await page.locator('.answerbox input').waitFor();assert.equal(await page.getByRole('button',{name:/Подсказка/}).count(),0);assert.ok(await page.getByRole('button',{name:/Прослушать/}).isVisible());
 console.log('PASS next: four final-test formats, audio-only launch, no hint');
 const submittedBefore=cloud.rpc.filter(([name])=>name==='submit_session').length;
 await page.evaluate(()=>localStorage.setItem('lexigo_cabinet_demo_v1',JSON.stringify([{id:'task-device-only',className:'2А',grade:2,sectionIndex:0,mode:'spell'}])));
 await page.goto(BASE+'?assignment=task-device-only&pupil=masha-2a');await page.waitForFunction(()=>typeof game!=='undefined'&&game?.deviceOnly);
 const localWord=await page.evaluate(()=>{game.words=game.words.slice(0,1);return game.words[0].en;});
 await page.locator('.answerbox input').fill(localWord);await page.locator('.answerbox button').click();await page.locator('.lesson-result').waitFor();await page.waitForTimeout(400);
 assert.equal(cloud.rpc.filter(([name])=>name==='submit_session').length,submittedBefore,'local demo must not send pupil results to the account');
 assert.deepEqual(errors,[]);console.log('PASS next: signed-in local demo remains device-only; no page errors');
}finally{await browser.close();}
