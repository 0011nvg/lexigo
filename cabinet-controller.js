/* Shared RLS-backed cabinet, mounted into a Document or ShadowRoot. */
window.mountLexigoCabinet=function(root){
'use strict';
if(!['localhost','127.0.0.1'].includes(location.hostname)){document.body.replaceChildren(document.createTextNode('Локальный пилот недоступен вне localhost'));throw Error('localhost only')}
const $=id=>root.getElementById(id);let userId='';
root.querySelector('style').append(document.createTextNode('select{font:inherit;padding:10px;border:1px solid #bbc8d8;border-radius:10px;width:100%;box-sizing:border-box}summary{cursor:pointer;font-weight:700}#results form{display:grid;gap:8px}#results label{min-width:0}#results p{overflow-wrap:anywhere}'));
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
async function renderLessonProgress(root,profile){return LexigoProgress.render({root,profile,rows})}
function heading(root,text){const h=document.createElement('h4');h.textContent=text;root.append(h)}
function showRows(root,items,fields){const ul=document.createElement('ul');if(!items.length){const li=document.createElement('li');li.textContent='Пока нет данных';ul.append(li)}
for(const item of items){const li=document.createElement('li');li.textContent=fields.map(f=>String(item[f]??'')).join(' · ');ul.append(li)}root.append(ul)}
async function load(){const profiles=await rows('profiles','select=user_id,role,display_name&user_id=eq.'+encodeURIComponent(userId));if(profiles.length!==1)throw Error('Нет доступного профиля: вход запрещён');
const profile=profiles[0];if(!['teacher','pupil'].includes(profile.role))throw Error('Эта роль пока не поддерживается в пилоте');
$('identity').textContent='Кабинет: '+profile.display_name+' ('+(profile.role==='teacher'?'учитель':'ученик')+')';
const root=$('results');root.replaceChildren();
if(profile.role==='teacher'){
const classes=await rows('classes','select=id,title,grade&teacher_user_id=eq.'+encodeURIComponent(userId));
const assignments=await rows('assignments','select=id,section_id,mode,class_id,due_at,audience_type,revoked_at&created_by=eq.'+encodeURIComponent(userId)+'&order=created_at.desc');
await teacherControls(root,classes,assignments);await renderLessonProgress(root,profile,classes);
}else{
const recipients=await rows('assignment_recipients','select=assignment_id&pupil_user_id=eq.'+encodeURIComponent(userId));
heading(root,'Мои назначения');await pupilControls(root,recipients);await renderLessonProgress(root,profile);
}
$('login').hidden=true;$('cabinet').hidden=false;say('Данные загружены с сервера; браузерное демо-хранилище не используется')}



const uuid=()=>crypto.randomUUID();
async function edge(route,payload){if(!transport.authenticated)throw Error('Войдите снова');return request('/functions/v1/learning-api/'+route,{method:'POST',body:JSON.stringify(payload)})}
const gameAdapter=LexigoServerGameAdapter.create({rows,edge,say,load,uuid});
function el(tag,text){const n=document.createElement(tag);if(text!=null)n.textContent=text;return n}
function choice(parent,options){const select=el('select');for(const [value,label] of options){const o=el('option',label);o.value=value;select.append(o)}parent.append(select);return select}
async function teacherControls(root,classes,assignments){
 const names=await rows('profiles','select=user_id,display_name&role=eq.pupil');
 const name=id=>names.find(p=>p.user_id===id)?.display_name||'Ученик '+id.slice(0,8);
 const recipients=await rows('enrollments','select=class_id,pupil_user_id,status&status=eq.active');
 const sections=await rows('vocabulary_sections','select=id,title,grade&order=order_index.asc');
 const sectionName=id=>sections.find(s=>s.id===id)?.title||id;
 const modeNames={quiz:'Выбери перевод',spell:'Напиши слово',truefalse:'Верно / неверно',fix:'Исправь ошибку',audio:'Аудиодиктант',pairs:'Найди пару',crystals:'Кристаллы',boss:'Финальный тест',cards:'Карточки',daily:'Тренировка дня'};
 function field(parent,label,node){const wrap=el('label',label);node.setAttribute('aria-label',label);wrap.append(node);parent.append(wrap);return node}
 function select(parent,label,options){const holder=el('span');const node=choice(holder,options);field(parent,label,node);return node}
 function input(parent,label,type,value=''){const node=el('input');node.type=type;node.value=value;return field(parent,label,node)}
 function button(parent,label,action){const b=el('button',label);b.type='button';parent.append(b);b.onclick=async()=>{b.disabled=true;try{await action()}catch(e){say(e.message,true)}finally{b.disabled=false}};return b}
 function submit(form,label,action){const b=el('button',label);b.type='submit';form.append(b);form.onsubmit=async e=>{e.preventDefault();b.disabled=true;try{await action()}catch(err){say(err.message,true)}finally{b.disabled=false}}}
 const refresh=button(root,'Обновить данные',()=>load());refresh.dataset.teacherRefresh='true';
 heading(root,'Мои классы');
 const create=el('form');create.id='createClassForm';create.className='lesson-progress';
 const title=input(create,'Название нового класса','text');title.required=true;title.maxLength=80;
 const grade=select(create,'Параллель',[[2,'2 класс'],[3,'3 класс'],[4,'4 класс']]);
 submit(create,'Создать класс',async()=>{await edge('save-class',{title:title.value,grade:Number(grade.value)});await load();say('Класс создан')});root.append(create);
 if(!classes.length)root.append(el('p','Создайте первый класс и пригласите ученика.'));
 for(const c of classes){
  const box=el('details');box.className='lesson-progress';box.dataset.classId=c.id;
  const members=recipients.filter(r=>r.class_id===c.id);
  box.append(el('summary',c.title+' · '+c.grade+' класс · учеников: '+members.length));
  const rename=el('form');const value=input(rename,'Название класса','text',c.title);value.required=true;value.maxLength=80;
  submit(rename,'Сохранить название',async()=>{await edge('save-class',{classId:c.id,title:value.value,grade:c.grade});await load();say('Название сохранено')});box.append(rename);
  const list=el('ul');for(const member of members){const li=el('li',name(member.pupil_user_id));
   button(li,'Отозвать доступ',async()=>{if(!confirm('Отозвать доступ ученика '+name(member.pupil_user_id)+' к классу '+c.title+'?'))return;await edge('revoke-enrollment',{classId:c.id,childUserId:member.pupil_user_id});await load();say('Доступ к классу отозван')});list.append(li)}
  box.append(list);
  const invitation=el('div');invitation.setAttribute('role','status');
  button(box,'Пригласить ученика',async()=>{const data=await edge('issue-invitation',{classId:c.id,role:'pupil',ttlHours:48});invitation.replaceChildren();const token=input(invitation,'Одноразовый код приглашения','text',data.id);token.readOnly=true;invitation.append(el('p','Действует 48 часов. Передайте код ученику лично. Нужна учётная запись ученика вашей школы. Код исчезнет при обновлении страницы.'))});
  box.append(invitation);root.append(box);
 }
 heading(root,'Назначить задание (серверная проверка)');
 if(classes.length){
 const form=el('form');form.id='assignmentForm';form.className='lesson-progress';
 const classSelect=select(form,'Класс',classes.map(c=>[c.id,c.title]));
 const sectionSelect=select(form,'Раздел',[]);
 const mode=select(form,'Режим',Object.entries(modeNames));
 const audience=select(form,'Кому назначить',[['individual','Одному ученику'],['class','Всему классу']]);
 const pupil=select(form,'Ученик',[]);
 const due=input(form,'Выполнить до (местное время)','datetime-local');due.required=true;
 const date=new Date(Date.now()+7*86400000);due.value=new Date(date-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
 const update=()=>{sectionSelect.replaceChildren();for(const s of sections.filter(s=>s.grade===classes.find(c=>c.id===classSelect.value)?.grade)){const o=el('option',s.title);o.value=s.id;sectionSelect.append(o)}pupil.replaceChildren();for(const r of recipients.filter(r=>r.class_id===classSelect.value)){const o=el('option',name(r.pupil_user_id));o.value=r.pupil_user_id;pupil.append(o)}};
 classSelect.onchange=update;audience.onchange=()=>{pupil.disabled=audience.value==='class'};update();
 submit(form,'Создать назначение',async()=>{if(!sectionSelect.value||(audience.value==='individual'&&!pupil.value))throw Error('Нужен раздел и активный ученик');const deadline=new Date(due.value);if(!Number.isFinite(+deadline)||deadline<=new Date())throw Error('Выберите будущий срок');await edge('create-assignment',{classId:classSelect.value,sectionId:sectionSelect.value,mode:mode.value,dueAt:deadline.toISOString(),audience:audience.value,recipients:audience.value==='class'?[]:[pupil.value]});await load();say('Задание сохранено сервером')});root.append(form);
 }
 heading(root,'Созданные задания');
 if(!assignments.length)root.append(el('p','Пока нет назначений'));
 for(const a of assignments){
  const line=el('div');line.className='lesson-progress';line.dataset.teacherAssignment=a.id;
  const inactive=a.revoked_at||new Date(a.due_at)<=new Date();
  line.append(el('p',(classes.find(c=>c.id===a.class_id)?.title||'Класс')+' · '+sectionName(a.section_id)+' · '+modeNames[a.mode]+' · '+(a.audience_type==='class'?'весь класс':'индивидуально')+' · до '+new Date(a.due_at).toLocaleString('ru-RU')+' · '+(a.revoked_at?'Отозвано':inactive?'Срок истёк':'Активно')));
  if(!inactive){const status=el('span');status.setAttribute('role','status');const copy=button(line,'Скопировать ссылку',()=>copyAssignmentLink(a.id,status));copy.dataset.assignmentId=a.id;line.append(status);button(line,'Отозвать задание',async()=>{if(!confirm('Закрыть доступ к этому заданию? Сохранённые результаты останутся в отчёте.'))return;await edge('revoke-assignment',{assignmentId:a.id});await load();say('Задание отозвано')})}root.append(line);
 }
 heading(root,'Результаты моих учеников');
 const attempts=await rows('attempts','select=id,assignment_id,pupil_user_id,status,started_at');
 const progress=await rows('lesson_attempt_progress','select=attempt_id,covered_words,total_words,lesson_completed,accuracy_pct');
 const reviews=await rows('teacher_reviews','select=attempt_id,revoked_at');
 const filters=el('div');filters.className='lesson-progress';
 const fc=select(filters,'Фильтр по классу',[['','Все классы'],...classes.map(c=>[c.id,c.title])]);
 const fp=select(filters,'Фильтр по ученику',[['','Все ученики'],...names.map(p=>[p.user_id,p.display_name])]);
 const fs=select(filters,'Статус попытки',[['','Все попытки'],['started','В процессе'],['finished','Завершена']]);
 const report=el('div');report.dataset.teacherReport='true';root.append(filters,report);
 function render(){report.replaceChildren();const visible=attempts.filter(t=>{const a=assignments.find(a=>a.id===t.assignment_id);return a&&(!fc.value||a.class_id===fc.value)&&(!fp.value||t.pupil_user_id===fp.value)&&(!fs.value||t.status===fs.value)});
 if(!visible.length)report.append(el('p','Нет попыток по выбранным условиям'));
 for(const t of visible){const a=assignments.find(a=>a.id===t.assignment_id),p=progress.find(p=>p.attempt_id===t.id);
 const row=el('div');row.className='lesson-progress';row.dataset.attemptId=t.id;
 row.append(el('p',name(t.pupil_user_id)+' · '+sectionName(a.section_id)+' · '+modeNames[a.mode]+' · '+(t.status==='finished'?'Завершена':'В процессе')+' · '+new Date(t.started_at).toLocaleString('ru-RU')));
 row.append(el('p',p?(p.lesson_completed?'✓ Урок пройден':'Урок не завершён')+' · '+p.covered_words+'/'+p.total_words+' слов · '+(p.accuracy_pct==null?'Самооценка, без оценки точности':'Точность '+p.accuracy_pct+'%'):'Пока нет ответов'));
 const detail=el('div');
 button(row,'Посмотреть ответы',async()=>{const events=await rows('attempt_events','select=word_id,event_index,event_type,verified_correct,hinted,retry,self_rating&attempt_id=eq.'+encodeURIComponent(t.id)+'&order=event_index.asc');const words=await rows('vocabulary_words','select=id,en,ru&section_id=eq.'+encodeURIComponent(a.section_id));detail.replaceChildren();if(!events.length)detail.append(el('p','Ответов пока нет'));for(const e of events){const w=words.find(w=>w.id===e.word_id);detail.append(el('p',(w?w.en+' — '+w.ru:e.word_id)+' · '+(e.event_type==='card_self_rating'?'Самооценка: '+(e.self_rating==='known'?'знаю':'повторить'):e.verified_correct===true?'Верно':e.verified_correct===false?'Ошибка':'Не проверено')+(e.hinted?' · с подсказкой':'')+(e.retry?' · повторная попытка':'')))}});
 if(t.status==='finished'){const reviewed=reviews.some(r=>r.attempt_id===t.id&&!r.revoked_at);row.append(el('span',reviewed?'Просмотрено учителем':'Ожидает просмотра'));button(row,reviewed?'Снять отметку просмотра':'Отметить просмотренным',async()=>{await edge(reviewed?'revoke-review':'review-attempt',{attemptId:t.id});await load();say('Отметка просмотра сохранена')})}
 row.append(detail);report.append(row);
 }}
 fc.onchange=fp.onchange=fs.onchange=render;render();
}
async function pupilControls(root,recipients){
 const refresh=el('button','Обновить мои задания');refresh.onclick=async()=>{refresh.disabled=true;try{await load()}catch(err){say(err.message,true);refresh.disabled=false}};root.append(refresh);
 const join=el('form');join.id='joinClassForm';const label=el('label','Код приглашения в класс');const code=el('input');code.required=true;code.pattern='[0-9a-f]{64}';label.append(code);join.append(label);const submit=el('button','Вступить в класс');submit.type='submit';join.append(submit);join.onsubmit=async e=>{e.preventDefault();submit.disabled=true;try{await edge('redeem-invitation',{token:code.value.trim()});code.value='';await load();say('Вы вступили в класс')}catch(err){say(err.message,true)}finally{submit.disabled=false}};root.append(join);
 heading(root,'Начать игру');
 const assigned=await rows('assignments','select=id,section_id,mode,audience_type,class_id,due_at,revoked_at');
 const attempts=await rows('attempts','select=id,assignment_id,status,started_at&pupil_user_id=eq.'+encodeURIComponent(userId)+'&order=started_at.desc');
 const progress=await rows('lesson_attempt_progress','select=attempt_id,assignment_id,covered_words,total_words,lesson_completed,accuracy_pct,ranking_eligible');
 const sections=await rows('vocabulary_sections','select=id,title,grade,module');
 const classes=await rows('classes','select=id,title');
 const names={quiz:'Выбери перевод',spell:'Напиши слово',truefalse:'Верно / неверно',fix:'Исправь ошибку',audio:'Аудиодиктант',pairs:'Найди пару',crystals:'Кристаллы',boss:'Финальный тест',cards:'Карточки',daily:'Тренировка дня'};
 const title=a=>{const s=sections.find(s=>s.id===a.section_id);return (s?s.grade+' класс · '+s.title:a.section_id)+' · '+names[a.mode]};
 const individual=new Set(recipients.map(r=>r.assignment_id));
 const allowed=new Set(assigned.filter(a=>!a.revoked_at&&new Date(a.due_at)>new Date()&&(a.audience_type==='class'||individual.has(a.id))).map(a=>a.id));
if(sharedAssignment&&!allowed.has(sharedAssignment)){const warning=el('p','Это задание не назначено вашей учётной записи или доступ отозван.');warning.className='error';warning.dataset.accessDenied='true';root.append(warning)}
else if(sharedAssignment){const info=el('p','Задание по ссылке найдено. Нажмите «Играть», чтобы начать.');info.dataset.linkAccepted='true';root.append(info)}
 let onlyShared=!!sharedAssignment;
 if(sharedAssignment){const all=el('button','Все мои задания');all.onclick=()=>{onlyShared=false;draw()};root.append(all)}
 const filterLabel=el('label','Показать задания');const filter=choice(filterLabel,[['all','Все доступные'],['new','Ещё не начаты'],['started','В процессе'],['completed','Пройдены']]);filter.setAttribute('aria-label','Показать задания');root.append(filterLabel);
 const list=el('div');list.dataset.pupilAssignments='true';root.append(list);
 function draw(){list.replaceChildren();let count=0;
 for(const assignment of assigned.filter(a=>allowed.has(a.id)&&(!onlyShared||a.id===sharedAssignment))){
  const own=attempts.filter(t=>t.assignment_id===assignment.id),active=own.find(t=>t.status==='started');
  const done=progress.some(p=>p.assignment_id===assignment.id&&p.lesson_completed);
  const state=done?'completed':own.length?'started':'new';if(filter.value!=='all'&&filter.value!==state)continue;count++;
  const box=el('div');box.className='lesson-progress';box.dataset.mode=assignment.mode;box.dataset.assignmentId=assignment.id;box.dataset.assignmentState=state;
  box.append(el('h4',title(assignment)),el('p',(classes.find(c=>c.id===assignment.class_id)?.title||'Мой класс')+' · Выполнить до '+new Date(assignment.due_at).toLocaleString('ru-RU')),el('p',done?'✓ Урок пройден':own.length?'Урок ещё не завершён':'Можно начинать'));
  const current=active&&progress.find(p=>p.attempt_id===active.id);if(current)box.append(el('p','В текущей попытке: '+current.covered_words+'/'+current.total_words+' слов'));
  const open=async(button,id)=>{button.disabled=true;try{if(id){const latest=await rows('attempts','select=id,status&id=eq.'+encodeURIComponent(id));if(latest[0]?.status!=='started')throw Error('Попытка уже завершена. Обновите список заданий.')}else{id=(await edge('start-attempt',{assignmentId:assignment.id,sessionId:uuid()})).id}if(typeof id!=='string')throw Error('Сервер не вернул ID попытки');await gameAdapter.play(root,assignment,id)}catch(err){say(err.message,true)}finally{button.disabled=false}};
  if(active){const resume=el('button','Продолжить');resume.onclick=()=>open(resume,active.id);box.append(resume)}
  const button=el('button','Играть');button.onclick=()=>open(button,null);box.append(button);
  if(own.length)box.append(el('p','«Играть» начинает новую попытку. «Продолжить» возвращает к сохранённой. Если срок игрового вопроса истёк, начните новую попытку.'));
  list.append(box);
 }if(!count)list.append(el('p',filter.value==='all'?'Доступных заданий пока нет. Получите назначение от учителя или введите код приглашения.':'В этой категории пока нет заданий.'))}
 filter.onchange=draw;draw();
 heading(root,'Мои попытки');
 if(!attempts.length)root.append(el('p','Здесь появятся ваши сохранённые результаты.'));
 for(const t of attempts){const a=assigned.find(a=>a.id===t.assignment_id);if(!a)continue;const p=progress.find(p=>p.attempt_id===t.id);const row=el('div');row.className='lesson-progress';row.dataset.pupilAttempt=t.id;
  row.append(el('h4',title(a)),el('p',new Date(t.started_at).toLocaleString('ru-RU')+' · '+(t.status==='finished'?'Попытка завершена':'Попытка не завершена')+(allowed.has(a.id)?'':a.revoked_at?' · Задание отозвано':' · Срок задания истёк')));
  if(p)row.append(el('p',(p.lesson_completed?'✓ Урок пройден':'Урок не завершён')+' · '+p.covered_words+'/'+p.total_words+' слов · '+(p.accuracy_pct==null?'Самооценка — без оценки точности':'Точность '+p.accuracy_pct+'%')+' · '+(p.ranking_eligible?'Результат участвует в рейтинге':'Для рейтинга нужно пройти полный урок')));
  const button=el('button','Мои ответы');const detail=el('div');button.onclick=async()=>{button.disabled=true;try{const events=await rows('attempt_events','select=word_id,event_type,verified_correct,self_rating,hinted,retry&attempt_id=eq.'+encodeURIComponent(t.id)+'&order=event_index.asc');const words=await rows('vocabulary_words','select=id,en,ru&section_id=eq.'+encodeURIComponent(a.section_id));detail.replaceChildren();if(!events.length)detail.append(el('p','Завершённых ответов пока нет'));for(const e of events){const w=words.find(w=>w.id===e.word_id);detail.append(el('p',(w?w.en+' — '+w.ru:'Слово')+' · '+(e.event_type==='card_self_rating'?'Самооценка: '+(e.self_rating==='known'?'знаю':'повторить'):e.verified_correct===true?'Верно':e.verified_correct===false?'Стоит повторить':'Не проверено')+(e.hinted?' · с подсказкой':'')+(e.retry?' · повторная попытка':'')))}}catch(err){say(err.message,true)}finally{button.disabled=false}};row.append(button,detail);root.append(row);
 }
}

$('form').onsubmit=async e=>{e.preventDefault();transport.clear();userId='';try{config();say('Проверка входа…');const data=await request('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:$('email').value,password:$('password').value})});if(!data.access_token||!data.user?.id)throw Error('Auth не вернул подтверждённую сессию');transport.acceptSession(data);userId=data.user.id;await load()}catch(err){clear();say(err.message,true)}};
$('logout').onclick=async()=>{try{if(transport.authenticated)await request('/auth/v1/logout',{method:'POST'})}catch{}finally{clear();say('Вы вышли. Сессия удалена из памяти страницы.')}};
window.addEventListener('pagehide',clear);

};
