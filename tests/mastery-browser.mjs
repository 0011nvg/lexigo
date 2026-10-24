// Actual DOM -> Auth -> Edge -> RLS. Synthetic local fixtures; never production.
import assert from 'node:assert/strict';
import {chromium} from './browser-runtime.mjs';
const anon=process.env.SUPABASE_ANON_KEY,service=process.env.SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(anon&&service,'Disposable Supabase credentials required');
const base='http://127.0.0.1:54321',section='mastery-section',password='SyntheticTestPassword#2026';
async function api(path,token,body,method=body?'POST':'GET',key=anon){const r=await fetch(base+path,{method,headers:{apikey:key,authorization:'Bearer '+token,'content-type':'application/json','accept-profile':'lexigo','content-profile':'lexigo',prefer:'return=representation'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json().catch(()=>null)}}
async function auth(who){const r=await api('/auth/v1/token?grant_type=password',anon,{email:'stage5-'+who+'@example.invalid',password});assert.equal(r.status,200);return r.data}
async function seed(table,body){const r=await api('/rest/v1/'+table,service,body,'POST',service);assert.equal(r.status,201);return r.data}
const teacher=await auth('teacher'),pupil=await auth('pupil'),second=await auth('newpupil'),foreign=await auth('foreign'),other=await auth('otherteacher');
const cls=await api('/functions/v1/learning-api/save-class',teacher.access_token,{title:'Mastery E2E',grade:3});assert.equal(cls.status,200);
await seed('enrollments',[{class_id:cls.data.id,pupil_user_id:pupil.user.id},{class_id:cls.data.id,pupil_user_id:second.user.id}]);
await seed('vocabulary_sections',{id:section,grade:3,module:'Mastery',title:'Word review',order_index:0});
const terms=[{id:'mastery-hello',section_id:section,en:'hello',ru:'привет',order_index:0},{id:'mastery-world',section_id:section,en:'world',ru:'мир',order_index:1}];await seed('vocabulary_words',terms);
const assignments={};for(const mode of ['quiz','spell','cards','audio']){const r=await api('/functions/v1/learning-api/create-assignment',teacher.access_token,{classId:cls.data.id,sectionId:section,mode,audience:'class',recipients:[],dueAt:'2030-01-01T00:00:00Z'});assert.equal(r.status,200);assignments[mode]=r.data.id}
const browser=await chromium.launch({headless:true}),errors=[];
async function login(page,who,standalone=false){await page.goto('http://127.0.0.1:3000/'+(standalone?'stage7-local-cabinet.html':'index.html'));if(!standalone)await page.locator('#serverGamesOpen').click();await page.locator('#key').fill(anon);await page.locator('#email').fill('stage5-'+who+'@example.invalid');await page.locator('#password').fill(password);await page.locator('#form button').click();await page.locator('#cabinet').waitFor({state:'visible'})}
async function action(page,route,fn){const pending=page.waitForResponse(r=>r.url().endsWith('/'+route)&&r.request().method()==='POST');await fn();const r=await pending,body=await r.json();assert.equal(r.status(),200,route+JSON.stringify(body));return body}
async function read(token=pupil.access_token,mode='quiz'){const r=await api('/rest/v1/lesson_word_progress?select=*&section_id=eq.'+section+'&mode=eq.'+mode,token);assert.equal(r.status,200);return r.data}
async function selectLesson(page,actor){const panel=page.locator('[data-learning-progress]');if(actor)await panel.getByLabel('Прогресс ученика',{exact:true}).selectOption(actor);await panel.getByLabel('Прогресс: класс обучения',{exact:true}).selectOption('3');await panel.getByLabel('Прогресс: модуль',{exact:true}).selectOption('Mastery');await panel.getByLabel('Прогресс: урок',{exact:true}).selectOption(section);return panel}
async function play(page,mode,{dirty=false,partial=false,beforeFinish}={}){
 const next=['cards','daily'].includes(mode)?null:page.waitForResponse(r=>r.url().endsWith('/next-question')&&r.request().method()==='POST');
 const attempt=await action(page,'start-attempt',()=>page.locator('[data-pupil-assignments] [data-assignment-id="'+assignments[mode]+'"]').getByRole('button',{name:'Играть',exact:true}).click());
 let c=next?await (await next).json():null;
 for(let i=0;i<(partial?1:2);i++){
  if(mode==='cards'){await page.getByRole('button',{name:'Показать перевод'}).click();await action(page,'append-event',()=>page.getByRole('button',{name:'Знаю',exact:true}).click())}
  else{
   const term=terms.find(w=>w.id===c.wordId);assert.ok(term);
   if(dirty&&i===0){const h=await api('/functions/v1/learning-api/hint-question',pupil.access_token,{attemptId:attempt.id,challengeId:c.challengeId});assert.equal(h.status,200)}
   if(dirty&&i===1){await page.getByPlaceholder('Ответ',{exact:true}).fill('wrong');const wrong=await action(page,'answer-question',()=>page.getByRole('button',{name:'Проверить ответ'}).click());assert.equal(wrong.complete,false)}
   await page.getByPlaceholder('Ответ',{exact:true}).fill(mode==='quiz'?term.ru:term.en);const answer=await action(page,'answer-question',()=>page.getByRole('button',{name:'Проверить ответ'}).click());assert.equal(answer.correct,true);
   if(i===0&&!partial)c=await action(page,'next-question',()=>page.getByRole('button',{name:'Следующий вопрос'}).click());
  }
 }
 if(beforeFinish)await beforeFinish(attempt.id);
 await action(page,'finish-attempt',()=>page.getByRole('button',{name:'Завершить попытку'}).click());await page.getByText('Попытка завершена на сервере',{exact:true}).waitFor();return attempt.id;
}
try{
 const p=await browser.newPage({viewport:{width:390,height:844}});p.on('pageerror',e=>errors.push(e.message));await login(p,'pupil');
 const first=await play(p,'quiz',{beforeFinish:async()=>{const words=await read();assert.ok(words.every(w=>w.clean_correct_attempts===0&&!w.mastered),'Unfinished attempt counted')}});
 let words=await read();assert.ok(words.every(w=>w.clean_correct_attempts===1&&!w.mastered));
 const replay=await api('/functions/v1/learning-api/finish-attempt',pupil.access_token,{attemptId:first});assert.equal(replay.status,200);assert.ok((await read()).every(w=>w.clean_correct_attempts===1));
 let panel=await selectLesson(p);assert.match(await panel.locator('[data-progress-summary]').innerText(),/Пройдено режимов: 1\/10 · Освоено слов: 0\/2/);
 await panel.getByLabel('Показать слова',{exact:true}).selectOption('mastered');assert.equal(await panel.locator('[data-progress-word]').count(),0);
 await play(p,'quiz');words=await read();assert.ok(words.every(w=>w.mastered&&w.clean_correct_attempts===2));
 // Simulate a historical unverified client score. It must not provide evidence.
 const legacy=await api('/rest/v1/attempt_events?attempt_id=eq.'+first,service,{verified_correct:null,verification_source:'client_unverified'},'PATCH',service);assert.equal(legacy.status,200);
 assert.ok((await read()).every(w=>!w.mastered&&w.clean_correct_attempts===1));
 const restore=await api('/rest/v1/attempt_events?attempt_id=eq.'+first,service,{verified_correct:true,verification_source:'server_evaluated'},'PATCH',service);assert.equal(restore.status,200);
 await login(p,'pupil',true);panel=await selectLesson(p);await panel.getByLabel('Показать слова',{exact:true}).selectOption('mastered');assert.equal(await panel.locator('[data-progress-word]').count(),2);assert.match(await panel.locator('[data-progress-summary]').innerText(),/Освоено слов: 2\/2/);
 await panel.locator('[data-progress-word="mastery-hello"] summary').click();await panel.getByText('Выбери перевод: чистых верных попыток: 2; нужно 2 · ✓ Освоено',{exact:true}).first().waitFor();
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Progress overflows mobile');
 for(let i=0;i<2;i++)await play(p,'spell',{dirty:true});assert.ok((await read(pupil.access_token,'spell')).every(w=>w.clean_correct_attempts===0&&!w.mastered),'Hint or retry became mastery');
 for(let i=0;i<2;i++)await play(p,'cards');assert.ok((await read(pupil.access_token,'cards')).every(w=>w.self_rated_known===2&&w.clean_correct_attempts===0&&!w.mastered),'Self-rating became mastery');
 const partial=await play(p,'audio',{partial:true});const progress=await api('/rest/v1/lesson_attempt_progress?attempt_id=eq.'+partial,pupil.access_token);assert.equal(progress.data[0].lesson_completed,false);assert.equal(progress.data[0].ranking_eligible,false);
 panel=await selectLesson(p);assert.match(await panel.locator('[data-progress-mode="audio"]').innerText(),/Есть попытки/);assert.match(await panel.locator('[data-progress-mode="cards"]').innerText(),/Пройдено.*самооценка/s);
 const p2=await browser.newPage();await login(p2,'newpupil');await play(p2,'quiz');assert.ok((await read(second.access_token)).every(w=>!w.mastered&&w.clean_correct_attempts===1));
 const t=await browser.newPage();await login(t,'teacher');panel=await selectLesson(t,pupil.user.id);assert.match(await panel.locator('[data-progress-summary]').innerText(),/Освоено слов: 2\/2/);await panel.getByLabel('Прогресс ученика',{exact:true}).selectOption(second.user.id);assert.match(await panel.locator('[data-progress-summary]').innerText(),/Освоено слов: 0\/2/);
 for(const actor of [foreign,other])assert.deepEqual(await read(actor.access_token),[],'Foreign identity read mastery');
 for(const method of ['PATCH','POST']){const denied=await api('/rest/v1/lesson_word_progress',pupil.access_token,{mastered:true},method);assert.ok(denied.status>=400,'Pupil wrote mastery')}
 await t.reload();await t.locator('#serverGamesOpen').click();await t.locator('#key').fill(anon);await t.locator('#email').fill('stage5-teacher@example.invalid');await t.locator('#password').fill(password);await t.locator('#form button').click();await t.locator('#cabinet').waitFor({state:'visible'});panel=await selectLesson(t,pupil.user.id);assert.match(await panel.locator('[data-progress-summary]').innerText(),/Освоено слов: 2\/2/);
 assert.deepEqual(errors,[]);console.log('PASS mastery: two clean finished attempts, unfinished/idempotency, legacy provenance, hints/retries, self-rating, partial lessons, reload, both entry points, mobile, pupil isolation and read-only RLS');
}finally{await browser.close()}
