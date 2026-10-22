/* Shared RLS-backed cabinet, mounted into a Document or ShadowRoot. */
window.mountLexigoCabinet=function(root){
'use strict';
if(!['localhost','127.0.0.1'].includes(location.hostname)){document.body.replaceChildren(document.createTextNode('Локальный пилот недоступен вне localhost'));throw Error('localhost only')}
const $=id=>root.getElementById(id);let userId='';
const transport=LexigoServerStorage.create();
const sharedAssignment=(()=>{const id=new URLSearchParams(location.search).get('assignment');return id&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)?id:null})();
if(new URLSearchParams(location.search).has('assignment')){$('linkHint').hidden=false;$('linkHint').textContent=sharedAssignment?'Для открытия назначенного задания войдите под учётной записью ученика. Ссылка сама по себе не даёт доступ.':'Некорректная ссылка на задание.'}
function assignmentLink(id){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw Error('Некорректный ID задания');const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('assignment',id);return url.href}
 window.lexigoPilotAssignmentLink=assignmentLink;
async function copyAssignmentLink(id,status){const url=assignmentLink(id);try{await navigator.clipboard.writeText(url);status.textContent='Ссылка скопирована';}catch{const input=el('input');input.value=url;input.readOnly=true;input.setAttribute('aria-label','Ссылка на задание');status.replaceChildren(input);input.select();status.append(' Скопируйте ссылку вручную.')}}
function say(msg,error=false){$('status').textContent=msg;$('status').className=error?'error':''}
function clear(){transport.clear();userId='';$('password').value='';$('cabinet').hidden=true;$('login').hidden=false;$('results').replaceChildren();$('identity').textContent='Кабинет'}
function config(){transport.configure($('url').value,$('key').value)}
const request=(path,options={})=>transport.request(path,options);
async function rows(table,params){return request('/rest/v1/'+table+'?'+params,{headers:{}})}
async function renderLessonProgress(root,profile,classes=[]){
 const records=await rows('lesson_attempt_progress','select=attempt_id,assignment_id,pupil_user_id,section_id,mode,total_words,covered_words,lesson_completed,ranking_eligible,accuracy_pct,duration_seconds,status');
 heading(root,profile.role==='teacher'?'Прогресс и рейтинг моих учеников':'Мои галочки и рейтинг уроков');
 const words=await rows('lesson_word_progress','select=pupil_user_id,section_id,mode,word_id,en,practiced,mastered,clean_correct_attempts,self_rated_known');
 const byWordSection=new Map();
 for(const w of words){const k=w.section_id+' · '+w.mode;if(!byWordSection.has(k))byWordSection.set(k,[]);byWordSection.get(k).push(w)}
 for(const [key,items] of byWordSection){
  const details=document.createElement('details');details.className='lesson-progress';
  const summary=el('summary','Слова · '+key+' · освоено '+items.filter(w=>w.mastered).length+'/'+items.length);
  details.append(summary);
  const ul=el('ul');
  for(const w of items.slice(0,120)){
   const status=w.mastered?'✓ Освоено':w.practiced?'◐ Тренируется':'○ Ещё не пройдено';
   ul.append(el('li',status+' · '+w.en+(profile.role==='teacher'?' · ученик '+w.pupil_user_id.slice(0,8):'')));
  }details.append(ul);root.append(details)
 }
 const visible=records.filter(r=>r.total_words>0);
 if(!visible.length){root.append(el('p','Завершённых занятий пока нет'));return}
 const bySection=new Map();
 for(const r of visible){const k=r.section_id+' · '+r.mode;if(!bySection.has(k))bySection.set(k,[]);bySection.get(k).push(r)}
 for(const [key,attempts] of bySection){
  const panel=el('div');panel.className='lesson-progress';
  const headingNode=el('h4',key);panel.append(headingNode);
  const ranking=attempts.filter(x=>x.ranking_eligible).sort((a,b)=>{
   const ap=a.accuracy_pct??-1,bp=b.accuracy_pct??-1;
   return bp-ap||(a.duration_seconds??1e9)-(b.duration_seconds??1e9)
  });
  const list=el('ol');for(const a of attempts){
   const row=el('li',(a.lesson_completed?'✓ Пройдено':'○ В процессе')+' · '+a.covered_words+'/'+a.total_words+' слов'+(a.accuracy_pct==null?' · самооценка':' · точность '+a.accuracy_pct+'%')+(profile.role==='teacher'?' · ученик '+a.pupil_user_id.slice(0,8):''));
   list.append(row)
  }panel.append(list);
  const label=el('p',ranking.length?'Рейтинг (только полный урок):':'В рейтинг пока никто не попал: нужно выполнить все слова урока.');panel.append(label);
  const leaderboard=el('ol');for(const a of ranking.slice(0,10)){
   leaderboard.append(el('li',(profile.role==='teacher'?'Ученик '+a.pupil_user_id.slice(0,8):'Мой результат')+' · '+(a.accuracy_pct==null?'самооценка':a.accuracy_pct+'%')+' · '+(a.duration_seconds??0)+' сек.'))
  }panel.append(leaderboard);root.append(panel)
 }
}
function heading(root,text){const h=document.createElement('h4');h.textContent=text;root.append(h)}
function showRows(root,items,fields){const ul=document.createElement('ul');if(!items.length){const li=document.createElement('li');li.textContent='Пока нет данных';ul.append(li)}
for(const item of items){const li=document.createElement('li');li.textContent=fields.map(f=>String(item[f]??'')).join(' · ');ul.append(li)}root.append(ul)}
async function load(){const profiles=await rows('profiles','select=user_id,role,display_name&user_id=eq.'+encodeURIComponent(userId));if(profiles.length!==1)throw Error('Нет доступного профиля: вход запрещён');
const profile=profiles[0];if(!['teacher','pupil'].includes(profile.role))throw Error('Эта роль пока не поддерживается в пилоте');
$('identity').textContent='Кабинет: '+profile.display_name+' ('+(profile.role==='teacher'?'учитель':'ученик')+')';
const root=$('results');root.replaceChildren();
if(profile.role==='teacher'){
const classes=await rows('classes','select=id,title,grade&teacher_user_id=eq.'+encodeURIComponent(userId));
heading(root,'Мои классы');showRows(root,classes,['title','grade']);
const assignments=await rows('assignments','select=id,section_id,mode,class_id&created_by=eq.'+encodeURIComponent(userId));
heading(root,'Созданные задания');
for(const assignment of assignments){const line=el('div');line.append(el('span',assignment.mode+' · '+assignment.section_id+' '));const copy=el('button','Скопировать ссылку');copy.type='button';copy.dataset.assignmentId=assignment.id;const status=el('span');status.setAttribute('role','status');copy.onclick=()=>copyAssignmentLink(assignment.id,status);line.append(copy,status);root.append(line)}
await teacherControls(root,classes,assignments);await renderLessonProgress(root,profile,classes);
}else{
const recipients=await rows('assignment_recipients','select=assignment_id&pupil_user_id=eq.'+encodeURIComponent(userId));
heading(root,'Мои назначения');showRows(root,recipients,['assignment_id']);await pupilControls(root,recipients);
const attempts=await rows('attempts','select=id,assignment_id,status,started_at&pupil_user_id=eq.'+encodeURIComponent(userId));
heading(root,'Мои попытки');showRows(root,attempts,['assignment_id','status','started_at']);await renderLessonProgress(root,profile);
}
$('login').hidden=true;$('cabinet').hidden=false;say('Данные загружены с сервера; браузерное демо-хранилище не используется')}



const uuid=()=>crypto.randomUUID();
async function edge(route,payload){if(!transport.authenticated)throw Error('Войдите снова');return request('/functions/v1/learning-api/'+route,{method:'POST',body:JSON.stringify(payload)})}
const gameAdapter=LexigoServerGameAdapter.create({rows,edge,say,load,uuid});
function el(tag,text){const n=document.createElement(tag);if(text!=null)n.textContent=text;return n}
function choice(parent,options){const select=el('select');for(const [value,label] of options){const o=el('option',label);o.value=value;select.append(o)}parent.append(select);return select}
async function teacherControls(root,classes,assignments){
 heading(root,'Назначить задание (серверная проверка)');
 if(!classes.length){root.append(el('p','Нет доступных классов'));return}
 const form=el('form');const classSelect=choice(form,classes.map(c=>[c.id,c.title+' · '+c.grade]));
 const sections=await rows('vocabulary_sections','select=id,title,grade&order=order_index.asc');
 const sectionSelect=choice(form,sections.filter(s=>s.grade===classes[0].grade).map(s=>[s.id,s.title]));
 classSelect.onchange=()=>{sectionSelect.replaceChildren();for(const s of sections.filter(s=>s.grade===classes.find(c=>c.id===classSelect.value)?.grade)){const o=el('option',s.title);o.value=s.id;sectionSelect.append(o)}};
 const mode=choice(form,['quiz','spell','truefalse','fix','audio','pairs','crystals','boss','cards','daily'].map(m=>[m,m]));
 const recipients=await rows('enrollments','select=class_id,pupil_user_id,status&status=eq.active');
 const pupil=choice(form,recipients.filter(r=>r.class_id===classes[0].id).map(r=>[r.pupil_user_id,'Тестовый ученик '+r.pupil_user_id.slice(0,8)]));
 classSelect.addEventListener('change',()=>{pupil.replaceChildren();for(const r of recipients.filter(r=>r.class_id===classSelect.value)){const o=el('option','Тестовый ученик '+r.pupil_user_id.slice(0,8));o.value=r.pupil_user_id;pupil.append(o)}});
 const button=el('button','Создать назначение');button.type='submit';form.append(button);
 form.onsubmit=async e=>{e.preventDefault();button.disabled=true;try{if(!pupil.value||!sectionSelect.value)throw Error('Нужен активный ученик и раздел');await edge('create-assignment',{classId:classSelect.value,sectionId:sectionSelect.value,mode:mode.value,dueAt:new Date(Date.now()+7*86400000).toISOString(),audience:'individual',recipients:[pupil.value]});await load();say('Задание сохранено сервером')}catch(err){say(err.message,true)}finally{button.disabled=false}};
 root.append(form);
 heading(root,'Результаты моих учеников');
 const attempts=await rows('attempts','select=id,assignment_id,pupil_user_id,status,started_at');
 const mine=new Set(assignments.map(a=>a.id));showRows(root,attempts.filter(a=>mine.has(a.assignment_id)),['pupil_user_id','assignment_id','status','started_at']);
}
async function pupilControls(root,recipients){
 heading(root,'Начать игру');
 const assigned=await rows('assignments','select=id,section_id,mode');
 const allowed=new Set(recipients.map(r=>r.assignment_id));
if(sharedAssignment&&!allowed.has(sharedAssignment)){const warning=el('p','Это задание не назначено вашей учётной записи или доступ отозван.');warning.className='error';warning.dataset.accessDenied='true';root.append(warning)}
else if(sharedAssignment){const info=el('p','Задание по ссылке найдено. Нажмите «Играть», чтобы начать.');info.dataset.linkAccepted='true';root.append(info)}
 for(const assignment of assigned.filter(a=>allowed.has(a.id)&&(!sharedAssignment||a.id===sharedAssignment))){
  const box=el('div');box.dataset.mode=assignment.mode;box.dataset.assignmentId=assignment.id;box.append(el('span',assignment.section_id+' · '+assignment.mode+' '));
  const button=el('button','Играть');box.append(button);root.append(box);
  button.onclick=async()=>{button.disabled=true;try{const result=await edge('start-attempt',{assignmentId:assignment.id,sessionId:uuid()});const attemptId=result.id;if(typeof attemptId!=='string')throw Error('Сервер не вернул ID попытки');await gameAdapter.play(root,assignment,attemptId)}catch(err){say(err.message,true)}finally{button.disabled=false}};
 }
}

$('form').onsubmit=async e=>{e.preventDefault();transport.clear();userId='';try{config();say('Проверка входа…');const data=await request('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:$('email').value,password:$('password').value})});if(!data.access_token||!data.user?.id)throw Error('Auth не вернул подтверждённую сессию');transport.acceptSession(data);userId=data.user.id;await load()}catch(err){clear();say(err.message,true)}};
$('logout').onclick=async()=>{try{if(transport.authenticated)await request('/auth/v1/logout',{method:'POST'})}catch{}finally{clear();say('Вы вышли. Сессия удалена из памяти страницы.')}};
window.addEventListener('pagehide',clear);

};
