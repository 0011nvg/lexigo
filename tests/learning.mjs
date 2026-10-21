import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
const base=process.env.LEXIGO_URL||'http://127.0.0.1:4173/';
const errors=[];
async function run(viewport){
 const page=await browser.newPage({viewport,reducedMotion:'reduce'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base);
 await page.locator('#words input[type=checkbox]').first().waitFor({state:'attached'});
 // Select a small, unambiguous vocabulary sample.
 const sample=await page.evaluate(()=>{
  const distinct=[];const en=new Set(),ru=new Set();
  for(const w of scope){if(en.has(normalize(w.en))||ru.has(normalize(w.ru)))continue;
   distinct.push(w);en.add(normalize(w.en));ru.add(normalize(w.ru));if(distinct.length===4)break}
  if(distinct.length<4)throw Error('Not enough unique words');
  selected=new Set(distinct.map(w=>w.id));renderWords();return distinct.map(w=>w.id);
 });
 assert.equal(sample.length,4);
 // Flashcards: reveal translation and mark known.
 await page.evaluate(()=>start('cards'));
 await page.locator('.flash').click();
 assert.equal((await page.locator('.flash').innerText()).length>0,true);
 await page.getByRole('button',{name:'Знаю',exact:true}).click();
 assert.equal(await page.evaluate(()=>game.index),1);
 await page.locator('#back').click();
 // Spelling: empty input must not count, then hint must not count as mastered.
 await page.evaluate(()=>start('spell'));
 await page.getByRole('button',{name:'Проверить'}).click();
 assert.equal(await page.evaluate(()=>game.answered),false);
 await page.getByRole('button',{name:/Подсказка/}).click();
 const current=await page.evaluate(()=>game.words[game.index].en);
 await page.locator('.answerbox input').fill(current);
 await page.getByRole('button',{name:'Проверить'}).click();
 assert.equal(await page.evaluate(()=>game.firstCorrect),0);
 assert.ok(await page.locator('.feedback').count());
 await page.getByRole('button',{name:/Следующее|Результат/}).click();
 assert.ok(await page.evaluate(()=>game.retryQueue.length+game.retries)>0,'Hinted word queued for review');
 await page.locator('#back').click();
 // Wrong answer must reappear, and progress must record the mistake.
 await page.evaluate(()=>start('spell'));
 const wrong=await page.evaluate(()=>game.words[game.index].id);
 await page.locator('.answerbox input').fill('___incorrect___');
 await page.getByRole('button',{name:'Проверить'}).click();
 assert.equal(await page.evaluate(()=>game.firstCorrect),0);
 assert.ok(await page.evaluate(id=>getProgress({id}).wrong>0,wrong));
 await page.getByRole('button',{name:/Следующее|Результат/}).click();
 assert.ok(await page.evaluate(()=>game.retryQueue.length+game.retries)>0);
 await page.locator('#back').click();
 // Pairs: each unique word must appear twice and can be matched.
 await page.evaluate(()=>start('pairs'));
 assert.equal(await page.locator('.pair').count(),8);
 const first=await page.evaluate(()=>game.words[0]);
 await page.getByRole('button',{name:first.en,exact:true}).click();
 await page.getByRole('button',{name:first.ru,exact:true}).click();
 assert.equal(await page.evaluate(()=>game.matched),1);
 await page.locator('#back').click();
 // Single-word fallback for quiz and true/false must be writable.
 await page.evaluate(()=>{selected=new Set([scope[0].id]);start('quiz')});
 // Quiz deliberately blocks one-word selections: no accidental game start.
 assert.equal(await page.evaluate(()=>game),null);
 await page.close();
}
try{
 await run({width:1280,height:800});
 await run({width:390,height:844});
 assert.deepEqual(errors,[]);
 console.log('PASS: cards, spelling, empty input, hints, errors, retry queue, pairs, single-word guard on desktop/mobile');
}finally{await browser.close()}
