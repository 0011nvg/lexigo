// Real DOM actions -> local Auth -> Edge -> PostgreSQL. No route mocks or injected results.
import assert from 'node:assert/strict';
import {chromium} from './browser-runtime.mjs';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const modes=['quiz','spell','truefalse','fix','audio','pairs','crystals','boss','cards','daily'];
const en=id=>id==='fixture-word'?'hello':'world';
const ru=id=>id==='fixture-word'?'привет':'мир';
async function response(path,act){
 const pending=page.waitForResponse(r=>r.url().includes(path)&&r.request().method()!=='OPTIONS');
 await act();const r=await pending;const body=await r.json();assert.equal(r.status(),200,path+': '+JSON.stringify(body));return body;
}
async function login(who){
 await page.locator('#key').fill(process.env.SUPABASE_ANON_KEY);
 await page.locator('#email').fill('stage5-'+who+'@example.invalid');
 await page.locator('#password').fill('SyntheticTestPassword#2026');
 await page.locator('#form button').click();
 await page.locator('#cabinet').waitFor({state:'visible'});
}
async function resume(mode,attemptId){
 await page.reload();await page.locator('#serverGamesOpen').click();await login('pupil');
 const next=['cards','daily'].includes(mode)?null:page.waitForResponse(r=>r.url().endsWith('/next-question')&&r.request().method()==='POST');
 const started=[];const listener=r=>{if(r.url().endsWith('/start-attempt'))started.push(r)};page.on('request',listener);
 await page.locator('#results div[data-mode="'+mode+'"]').last().getByRole('button',{name:'Продолжить',exact:true}).click();
 await page.getByRole('heading',{name:'Игра · '+mode,exact:true}).waitFor();
 const state=next?await (await next).json():null;
 if(state)assert.ok(!/"expected"|"private_state"/.test(JSON.stringify(state)),'Private grading data leaked');
 page.off('request',listener);assert.equal(started.length,0,'Resume created a new attempt');
 return state;
}
try{
 assert.ok(process.env.SUPABASE_ANON_KEY,'Local public key required');
 await page.goto('http://127.0.0.1:3000/index.html');
 await page.locator('#serverGamesOpen').click();
 assert.equal(await page.locator('iframe').count(),0);
 assert.ok(new URL(page.url()).pathname.endsWith('/index.html'));
 await page.locator('#serverWorkspace').waitFor({state:'visible'});
 await login('pupil');
 const completed=[];
 for(const mode of modes){
  const tile=page.locator('#results div[data-mode="'+mode+'"]').last();
  const start=page.waitForResponse(r=>r.url().endsWith('/start-attempt')&&r.request().method()==='POST');
  const challengePromise=!['cards','daily'].includes(mode)?page.waitForResponse(r=>r.url().endsWith('/next-question')&&r.request().method()==='POST'):null;
  await tile.getByRole('button',{name:'Играть',exact:true}).click();
  const started=await start;assert.equal(started.status(),200);const attempt=await started.json();
  const round=page.locator('#results section').first();
  if(['cards','daily'].includes(mode)){
   for(let i=0;i<2;i++){
    await round.getByRole('button',{name:'Показать перевод'}).click();
    await response('/append-event',()=>round.getByRole('button',{name:'Знаю',exact:true}).click());
    if(i===0){await resume(mode,attempt.id);await round.getByText('2 / 2',{exact:true}).waitFor()}
   }
   await round.getByText('Все карточки пройдены').waitFor();
  }else{
   const first=await challengePromise;assert.equal(first.status(),200);let c=await first.json();const covered=new Set();
   for(let n=0;n<2;n++){
    covered.add(c.wordId);
    if(['quiz','spell','truefalse','fix','audio'].includes(mode)){
     if(n===0){await round.getByPlaceholder('Ответ',{exact:true}).fill('wrong resume fixture');const failed=await response('/answer-question',()=>round.getByRole('button',{name:'Проверить ответ'}).click());assert.equal(failed.complete,false);const restored=await resume(mode,attempt.id);assert.equal(restored.challengeId,c.challengeId)}
     const answer=mode==='quiz'?ru(c.wordId):mode==='truefalse'?String(c.question.proposed===ru(c.wordId)):en(c.wordId);
     await round.getByPlaceholder('Ответ',{exact:true}).fill(answer);
     const result=await response('/answer-question',()=>round.getByRole('button',{name:'Проверить ответ'}).click());assert.equal(result.correct,true,mode);
    }else if(mode==='pairs'){
     for(const [english,russian] of [['hello','привет'],['world','мир']]){
      await round.getByRole('button',{name:english,exact:true}).click();
      const result=await response('/play-round',()=>round.getByRole('button',{name:russian,exact:true}).click());assert.equal(result.correct,true);
      if(n===0&&english==='hello'){const restored=await resume(mode,attempt.id);assert.equal(restored.challengeId,c.challengeId);assert.equal(restored.question.matched.length,2);assert.equal(await round.getByRole('button',{name:'hello',exact:true}).isDisabled(),true)}
     }
    }else if(mode==='crystals'){
     let result;
     for(let move=0;move<7;move++){
      await round.locator('.crystal-tile').nth(0).click();
      result=await response('/play-round',()=>round.locator('.crystal-tile').nth(1).click());
     }
     assert.equal(result.boardComplete,true);
     if(n===0){const restored=await resume(mode,attempt.id);assert.equal(restored.challengeId,c.challengeId);assert.equal(restored.question.boardComplete,true);assert.deepEqual(restored.question.board,result.board);assert.equal(await round.locator('.crystal-tile:disabled').count(),36)}
     await round.getByPlaceholder('Введите ответ').fill(en(c.wordId));
     result=await response('/play-round',()=>round.getByRole('button',{name:'Ответить',exact:true}).click());assert.equal(result.complete,true);assert.equal(result.correct,true);
    }else if(mode==='boss'){
     let q=c.question.question;let result;
     for(let stage=0;stage<3;stage++){
      const answer=stage===0?ru(c.wordId):stage===1?(q.prompt==='привет'?'hello':'world'):String(q.proposed===ru(c.wordId));
      if(stage===2)await round.getByText('Вариант: '+q.proposed,{exact:true}).waitFor();
      await round.getByPlaceholder('Введите ответ').fill(answer);
      result=await response('/play-round',()=>round.getByRole('button',{name:'Ответить',exact:true}).click());assert.equal(result.correct,true);q=result.nextQuestion;
      if(n===0&&stage===0){const restored=await resume(mode,attempt.id);assert.equal(restored.challengeId,c.challengeId);assert.equal(restored.question.phase,1);assert.deepEqual(restored.question.question,q)}
     }
     assert.equal(result.complete,true);assert.equal(result.passed,true);
    }
    if(n===0)c=await response('/next-question',()=>round.getByRole('button',{name:'Следующий вопрос',exact:true}).click());
   }
   assert.equal(covered.size,2,'Server lesson must cover both distinct words in '+mode);
  }
  const progressPromise=page.waitForResponse(r=>r.url().includes('/lesson_attempt_progress?')&&r.request().method()==='GET');
  await response('/finish-attempt',()=>round.getByRole('button',{name:'Завершить попытку'}).click());
  const progressResponse=await progressPromise;assert.equal(progressResponse.status(),200);const rows=await progressResponse.json();
  const row=rows.find(r=>r.attempt_id===attempt.id);assert.ok(row,'Saved attempt absent from RLS progress');
  assert.equal(row.covered_words,2);assert.equal(row.lesson_completed,true);assert.equal(row.ranking_eligible,true);
  assert.equal(Number(row.total_words),2);assert.equal(row.accuracy_pct,['cards','daily'].includes(mode)?null:100);
  completed.push(attempt.id);await page.getByText('Попытка завершена на сервере',{exact:true}).waitFor();
  const history=page.locator('[data-pupil-attempt="'+attempt.id+'"]');await history.getByText(/✓ Урок пройден/).waitFor();
  if(['cards','daily'].includes(mode))await history.getByText(/Самооценка — без оценки точности/).waitFor();
  else await history.getByText(/Точность 100%/).waitFor();
  await page.getByLabel('Показать задания',{exact:true}).selectOption('completed');
  assert.ok(await page.locator('[data-pupil-assignments] [data-mode="'+mode+'"]').count()>0,'Completed assignment absent from filter');
  await page.getByLabel('Показать задания',{exact:true}).selectOption('all');
  const explorer=page.locator('[data-learning-progress]');
  await explorer.getByLabel('Прогресс: класс обучения',{exact:true}).selectOption('2');
  await explorer.getByLabel('Прогресс: модуль',{exact:true}).selectOption('1');
  await explorer.getByLabel('Прогресс: урок',{exact:true}).selectOption('fixture-section');
  assert.match(await explorer.locator('[data-progress-mode="'+mode+'"]').innerText(),/✓ Пройдено/);
  console.log('PASS real browser complete lesson, result, progress, ranking: '+mode);
 }
 await page.locator('#logout').click();await page.locator('#login').waitFor({state:'visible'});
 const teacherProgress=page.waitForResponse(r=>r.url().includes('/lesson_attempt_progress?')&&r.request().method()==='GET');
 await login('teacher');const teacherRows=await (await teacherProgress).json();
 for(const id of completed)assert.ok(teacherRows.some(r=>r.attempt_id===id&&r.lesson_completed),'Teacher cannot see finished pupil lesson');
 await page.locator('#logout').click();await page.locator('#login').waitFor({state:'visible'});
 const foreignProgress=page.waitForResponse(r=>r.url().includes('/lesson_attempt_progress?')&&r.request().method()==='GET');
 await login('foreign');const foreignRows=await (await foreignProgress).json();assert.ok(completed.every(id=>!foreignRows.some(r=>r.attempt_id===id)),'Foreign pupil read results');
 for(const id of completed)assert.equal(await page.locator('[data-pupil-attempt="'+id+'"]').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS all ten modes resumed after reload and completed through shared components; teacher and foreign-pupil RLS confirmed');
}finally{await browser.close()}
