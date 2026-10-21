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
 // Accept case and harmless sentence punctuation without altering source vocabulary.
 assert.equal(await page.evaluate(()=>normalize('Fine things!')),await page.evaluate(()=>normalize('fine things')));
 assert.equal(await page.evaluate(()=>normalize('  Hello, world!!! ')),await page.evaluate(()=>normalize('hello world')));
 assert.equal(await page.evaluate(()=>gemScore(3,1)),30);
 assert.equal(await page.evaluate(()=>gemScore(4,1)),60);
 assert.equal(await page.evaluate(()=>gemScore(5,1)),100);
 assert.equal(await page.evaluate(()=>gemScore(3,2)),60);
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
 const selfBefore=await page.evaluate(()=>({id:game.words[0].id,p:{...getProgress(game.words[0])}}));
 await page.getByRole('button',{name:'Знаю',exact:true}).click();
 assert.equal(await page.evaluate(()=>game.index),1);
 const selfAfter=await page.evaluate(id=>getProgress({id}),selfBefore.id);
 assert.equal(selfAfter.selfKnown,(selfBefore.p.selfKnown||0)+1,'Flashcard self-assessment recorded separately');
 assert.equal(selfAfter.right||0,selfBefore.p.right||0,'Self-assessment does not count as verified answer');
 assert.equal(selfAfter.recall||0,selfBefore.p.recall||0,'Self-assessment does not count as recall');
 assert.equal(selfAfter.wrong||0,selfBefore.p.wrong||0,'Self-assessment does not count as error');
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
 await page.getByRole('button',{name:'Английское слово: '+first.en,exact:true}).click();
 await page.getByRole('button',{name:'Перевод: '+first.ru,exact:true}).click();
 assert.equal(await page.evaluate(()=>game.matched),1);
 // A restarted round must not be affected by stale callbacks from the previous round.
 await page.evaluate(()=>start('pairs'));
 assert.equal(await page.locator('#play .pair-leaderboard').count(),1,'Only one active leaderboard');
 const round=await page.evaluate(()=>game);
 assert.equal(await page.evaluate(()=>game.matched),0,'New round starts with zero matches');
 await page.locator('#back').click();
 assert.equal(await page.locator('#play .pair').count(),0,'Pair tiles cleared when leaving');
 // Completing a full round must replace, not duplicate, the leaderboard.
 await page.evaluate(()=>start('pairs'));
 const pairs=await page.evaluate(()=>game.words.map(w=>({en:w.en,ru:w.ru})));
 for(const word of pairs){
  await page.getByRole('button',{name:'Английское слово: '+word.en,exact:true}).click();
  await page.getByRole('button',{name:'Перевод: '+word.ru,exact:true}).click();
 }
 assert.equal(await page.evaluate(()=>game.matched),pairs.length,'All pairs matched');
 assert.equal(await page.locator('#play .pair-leaderboard').count(),1,'One leaderboard after completion');
 assert.equal(await page.locator('#play .pair-finish').count(),1,'One completion panel');
 await page.locator('#back').click();

 // The leaderboard retains fastest results even after more than 100 sessions.
 await page.evaluate(()=>{
  localStorage.setItem('lexigo_pair_scores',JSON.stringify(Array.from({length:100},(_,i)=>({pairs:4,seconds:i+1,mistakes:0}))));
  const scores=savePairScore({pairs:4,seconds:999,mistakes:9});
  if(scores.length!==100||scores.some(x=>x.seconds===999)||!scores.some(x=>x.seconds===1))throw Error('Fastest records were lost');
  localStorage.removeItem('lexigo_pair_scores');
 });
 // Recognition must never shorten a future interval earned by unaided recall.
 await page.evaluate(()=>{
  const w=scope[0],saved=progress[w.id],oldGame=game;
  try{
   game={score:0,misses:0};
   const now=Date.now();
   progress[w.id]={right:2,wrong:0,recall:2,reviewStreak:3,reviewDay:'2020-01-01',due:now+7*86400000,last:now};
   record(w,true,'recognition');
   if(progress[w.id].due<now+6*86400000)throw Error('Recognition shortened spaced recall interval');
   record(w,false,'recognition');
   if(progress[w.id].due> Date.now()+10000||progress[w.id].reviewStreak!==0)throw Error('Wrong answer did not reset due date');
  }finally{if(saved)progress[w.id]=saved;else delete progress[w.id];game=oldGame;save();updateStats()}
 });
 // Final test cannot be passed using only a visible typo as proof of unaided spelling.
 await page.evaluate(()=>{
  const singles=scope.filter(w=>/^[a-zA-Z]+(?:[-'][a-zA-Z]+)*$/.test(w.en.trim())).slice(0,4);
  if(singles.length<3)throw Error('Insufficient single words');
  selected=new Set(singles.map(w=>w.id));
  const original=[...document.querySelectorAll('#taskTypes input')].map(x=>[x,x.checked]);
  try{
   document.querySelectorAll('#taskTypes input').forEach(x=>x.checked=x.value==='fix');
   const previous=game;start('boss');
   if(game!==previous)throw Error('Boss accepted typo correction as independent recall');
   document.querySelectorAll('#taskTypes input').forEach(x=>x.checked=x.value==='spell');
   start('boss');
   if(!game||game.mode!=='boss'||!['spell','audio'].includes(game.activeQuestionMode))throw Error('Boss lacks unaided recall');
   stop();
  }finally{original.forEach(([x,v])=>x.checked=v)}
 });
 // Daily session uses up to fifteen words, not the old eight-word cap.
 await page.evaluate(()=>{selected=new Set(scope.map(w=>w.id));quickStart()});
 assert.equal(await page.evaluate(()=>game.words.length),Math.min(15,await page.evaluate(()=>scope.length)));
 await page.locator('#back').click();
 // Boss must exclude phrases, while preserving source vocabulary in the library.
 const boss=await page.evaluate(()=>{
  const singles=scope.filter(w=>/^[a-zA-Z]+(?:[-'][a-zA-Z]+)*$/.test(w.en.trim())).slice(0,4);
  const phrase=scope.find(w=>w.en.trim().includes(' '));
  if(singles.length<3)return {skip:true};
  selected=new Set([...singles,...(phrase?[phrase]:[])].map(w=>w.id));
  start('boss');return {skip:false,phraseId:phrase?.id||null};
 });
 if(!boss.skip){assert.equal(await page.evaluate(()=>game.words.every(w=>!w.en.trim().includes(' '))),true);await page.locator('#back').click()}
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
