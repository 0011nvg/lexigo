// Real Auth, Edge, RLS and DOM journey. Fixture identities only, no mocked network.
import assert from 'node:assert/strict';
import {chromium} from './browser-runtime.mjs';
const anon=process.env.SUPABASE_ANON_KEY,service=process.env.SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(anon&&service,'Disposable local Supabase keys required');
const base='http://127.0.0.1:54321',password='SyntheticTestPassword#2026';
async function api(path,token,body,method=body?'POST':'GET',key=anon){const r=await fetch(base+path,{method,headers:{apikey:key,authorization:'Bearer '+token,'content-type':'application/json','accept-profile':'lexigo','content-profile':'lexigo',prefer:'return=representation'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json().catch(()=>null)}}
async function auth(who){const r=await api('/auth/v1/token?grant_type=password',anon,{email:'stage5-'+who+'@example.invalid',password});assert.equal(r.status,200);return r.data}
const teacher=await auth('teacher'),pupil=await auth('newpupil');
const profile=await api('/rest/v1/profiles?select=organization_id&user_id=eq.'+teacher.user.id,teacher.access_token);
const other=await api('/auth/v1/signup',anon,{email:'stage5-otherteacher@example.invalid',password});assert.equal(other.status,200);
const seeded=await api('/rest/v1/profiles',service,{user_id:other.data.user.id,organization_id:profile.data[0].organization_id,role:'teacher',display_name:'Other teacher'},'POST',service);assert.equal(seeded.status,201);
const otherClass=await api('/functions/v1/learning-api/save-class',other.data.access_token,{title:'Other class',grade:2});assert.equal(otherClass.status,200);
const sharedPupil=await api('/rest/v1/enrollments',service,{class_id:otherClass.data.id,pupil_user_id:pupil.user.id},'POST',service);assert.equal(sharedPupil.status,201);
const browser=await chromium.launch({headless:true});const contexts=[];const errors=[];
async function pageFor(who){const ctx=await browser.newContext({viewport:{width:390,height:844}});contexts.push(ctx);const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:3000/index.html');await p.locator('#serverGamesOpen').click();await login(p,who);return p}
async function login(p,who){await p.locator('#key').fill(anon);await p.locator('#email').fill('stage5-'+who+'@example.invalid');await p.locator('#password').fill(password);await p.locator('#form button').click();await p.locator('#cabinet').waitFor({state:'visible'})}
async function action(p,route,fn){const promise=p.waitForResponse(r=>r.url().endsWith('/'+route)&&r.request().method()==='POST');await fn();const r=await promise;assert.equal(r.status(),200,route);return r.json()}
try{
 const t=await pageFor('teacher');
 await t.getByLabel('Название нового класса',{exact:true}).fill('2 Pilot');
 const created=await action(t,'save-class',()=>t.getByRole('button',{name:'Создать класс',exact:true}).click());
 await t.getByText('Класс создан',{exact:true}).waitFor();
 let card=t.locator('[data-class-id="'+created.id+'"]');await card.locator('summary').click();
 await card.getByLabel('Название класса',{exact:true}).fill('2 Pilot renamed');
 await action(t,'save-class',()=>card.getByRole('button',{name:'Сохранить название'}).click());await t.getByText('Название сохранено',{exact:true}).waitFor();
 card=t.locator('[data-class-id="'+created.id+'"]');await card.locator('summary').click();
 await action(t,'issue-invitation',()=>card.getByRole('button',{name:'Пригласить ученика'}).click());
 const token=await card.getByLabel('Одноразовый код приглашения',{exact:true}).inputValue();assert.match(token,/^[0-9a-f]{64}$/);
 const p=await pageFor('newpupil');await p.getByLabel('Код приглашения в класс',{exact:true}).fill(token);
 await action(p,'redeem-invitation',()=>p.getByRole('button',{name:'Вступить в класс'}).click());await p.getByText('Вы вступили в класс',{exact:true}).waitFor();
 await t.getByRole('button',{name:'Обновить данные',exact:true}).click();await t.locator('[data-class-id="'+created.id+'"] summary').filter({hasText:'учеников: 1'}).waitFor();
 const form=t.locator('#assignmentForm');await form.getByLabel('Класс',{exact:true}).selectOption(created.id);await form.getByLabel('Режим',{exact:true}).selectOption('quiz');await form.getByLabel('Кому назначить',{exact:true}).selectOption('class');
 const assignment=await action(t,'create-assignment',()=>form.getByRole('button',{name:'Создать назначение'}).click());await t.getByText('Задание сохранено сервером',{exact:true}).waitFor();
 const link=await t.evaluate(id=>window.lexigoPilotAssignmentLink(id),assignment.id);assert.equal(new URL(link).searchParams.size,1);
 await p.goto(link);await login(p,'newpupil');await p.locator('[data-link-accepted]').waitFor();
 const next=p.waitForResponse(r=>r.url().endsWith('/next-question')&&r.request().method()==='POST');
 const attempt=await action(p,'start-attempt',()=>p.getByRole('button',{name:'Играть',exact:true}).click());const challenge=await (await next).json();
 // Server records the final evaluation after three distinct failed tries.
 // Stopping after the first retry would deliberately leave no finalized event.
 for(let retry=0;retry<3;retry++){
  await p.getByPlaceholder('Ответ',{exact:true}).fill('deliberately wrong '+retry);
  const answer=await action(p,'answer-question',()=>p.getByRole('button',{name:'Проверить ответ',exact:true}).click());
  assert.equal(answer.correct,false);assert.equal(answer.complete,retry===2);
 }
 await action(p,'finish-attempt',()=>p.getByRole('button',{name:'Завершить попытку'}).click());await p.getByText('Попытка завершена на сервере',{exact:true}).waitFor();
 await t.getByRole('button',{name:'Обновить данные',exact:true}).click();
 let result=t.locator('[data-attempt-id="'+attempt.id+'"]');await result.waitFor();
 await t.getByLabel('Фильтр по классу',{exact:true}).selectOption(created.id);await t.getByLabel('Фильтр по ученику',{exact:true}).selectOption(pupil.user.id);await t.getByLabel('Статус попытки',{exact:true}).selectOption('finished');
 assert.equal(await t.locator('[data-teacher-report] [data-attempt-id]').count(),1);
 await result.getByRole('button',{name:'Посмотреть ответы'}).click();await result.getByText(/hello — привет · Ошибка|world — мир · Ошибка/).waitFor();
 await action(t,'review-attempt',()=>result.getByRole('button',{name:'Отметить просмотренным'}).click());await t.getByText('Отметка просмотра сохранена',{exact:true}).waitFor();
 await t.reload();await t.locator('#serverGamesOpen').click();await login(t,'teacher');result=t.locator('[data-attempt-id="'+attempt.id+'"]');await result.getByText('Просмотрено учителем',{exact:true}).waitFor();
 // Recheck persisted class name and no mobile overflow after a fresh login.
 await t.locator('[data-class-id="'+created.id+'"] summary').filter({hasText:'2 Pilot renamed'}).waitFor();
 assert.ok(await t.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile overflow');
 // Another teacher (same school) cannot read or mutate this teacher's class/results.
 const o=await pageFor('otherteacher');assert.equal(await o.locator('[data-class-id="'+created.id+'"]').count(),0);assert.equal(await o.locator('[data-attempt-id="'+attempt.id+'"]').count(),0);
 for(const [route,body] of [['save-class',{classId:created.id,title:'stolen',grade:2}],['revoke-assignment',{assignmentId:assignment.id}],['review-attempt',{attemptId:attempt.id}],['create-assignment',{classId:created.id,sectionId:'fixture-section',mode:'quiz',audience:'class',recipients:[],dueAt:'2030-01-01T00:00:00Z'}]]){
  const denied=await api('/functions/v1/learning-api/'+route,other.data.access_token,body);assert.equal(denied.status,403,route+' cross-teacher');
 }
 assert.equal((await api('/functions/v1/learning-api/save-class',pupil.access_token,{title:'Forbidden',grade:2})).status,403);
 assert.equal((await api('/rest/v1/rpc/save_class',teacher.access_token,{p_actor:teacher.user.id,p_class:null,p_title:'Bypass',p_grade:2})).status,403);
 assert.equal((await api('/functions/v1/learning-api/save-class',teacher.access_token,{actorId:teacher.user.id,title:'Spoof',grade:2})).status,400);
 const hidden=await api('/rest/v1/attempt_events?select=id&attempt_id=eq.'+attempt.id,other.data.access_token);assert.equal(hidden.status,200);assert.deepEqual(hidden.data,[]);
 t.on('dialog',d=>d.accept());
 await action(t,'revoke-assignment',()=>t.locator('[data-teacher-assignment="'+assignment.id+'"]').getByRole('button',{name:'Отозвать задание'}).click());await t.getByText('Задание отозвано',{exact:true}).waitFor();
 const history=t.locator('[data-attempt-id="'+attempt.id+'"]');await history.waitFor();await history.getByRole('button',{name:'Посмотреть ответы'}).click();await history.getByText(/hello — привет · Ошибка|world — мир · Ошибка/).waitFor();
 assert.equal((await api('/functions/v1/learning-api/start-attempt',pupil.access_token,{assignmentId:assignment.id,sessionId:crypto.randomUUID()})).status,403);
 await p.goto(link);await login(p,'newpupil');await p.locator('[data-access-denied]').waitFor();assert.equal(await p.getByRole('button',{name:'Играть',exact:true}).count(),0);
 card=t.locator('[data-class-id="'+created.id+'"]');await card.locator('summary').click();await action(t,'revoke-enrollment',()=>card.getByRole('button',{name:'Отозвать доступ'}).click());await t.getByText('Доступ к классу отозван',{exact:true}).waitFor();
 const enrollment=await api('/rest/v1/enrollments?select=status&class_id=eq.'+created.id,pupil.access_token);assert.ok(!enrollment.data.some(e=>e.status==='active'));
 await t.locator('#logout').click();assert.equal(await t.locator('#results').innerText(),'');
 assert.deepEqual(errors,[]);console.log('PASS teacher workspace: create/rename, invitation/join, class assignment/link, saved error report, filters, review after reload, second teacher denial, RPC denial, revocation, logout, mobile');
}finally{await browser.close()}
