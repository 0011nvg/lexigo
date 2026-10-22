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



async function selfRating(root,assignment,attemptId){
 const words=await rows('vocabulary_words','select=id,en,ru&section_id=eq.'+encodeURIComponent(assignment.section_id)+'&order=order_index.asc');
 if(!words.length)throw Error('Нет слов для самооценки');
 let index=0;
 function display(){
  root.replaceChildren();const w=words[index];if(!w){root.append(el('p','Все карточки пройдены'));return}
  root.append(el('p',(index+1)+' / '+words.length));
  LexigoGameComponents.render(assignment.mode,root,{front:w.en,back:w.ru,legacy:true,onKnown:(a,b)=>rate('known',a,b),onUnknown:(a,b)=>rate('unknown',a,b)});
 }
 async function rate(rating,known,unknown){known.disabled=unknown.disabled=true;try{const w=words[index];await edge('append-event',{attemptId,wordId:w.id,index,kind:'card_self_rating',hinted:false,retry:false,rating});index++;display();say('Самооценка сохранена сервером — это не проверенный игровой балл')}catch(err){say(err.message,true)}finally{known.disabled=unknown.disabled=false}}
 display();
}

async function statefulRound(root,c,attemptId,mode){
 const q=c.question||{};
 const status=el('p','Все ходы и ответы проверяются сервером');root.append(status);
 const action=async(kind,payload)=>{
  const data=await edge('play-round',{attemptId,challengeId:c.challengeId,requestId:uuid(),action:kind,payload});
  status.textContent=data.complete?'Раунд завершён':data.correct===true?'Верно':data.correct===false?'Пока не получилось':'Ход сохранён';
  if(data.complete){root.append(el('p','Раунд сохранён сервером. Выберите следующий вопрос.'))}
  return data;
 };
 const stage=el('div');root.append(stage);
 const showStage=question=>{stage.replaceChildren();stage.append(el('p',String(question.prompt||'')));if(question.proposed!=null)stage.append(el('p','Вариант: '+String(question.proposed)))};
 const answerField=()=>{
  const {input:field,send:button}=LexigoGameComponents.render(mode==='boss'?'boss':'spell',root,{placeholder:'Введите ответ',label:'Ответить',submit:async(field,button)=>{
   button.disabled=true;try{const result=await action('answer',{answer:field.value});if(result.nextQuestion){field.value='';showStage(result.nextQuestion);button.disabled=false}
   else if(result.complete){button.remove();field.disabled=true}else button.disabled=false;
   }catch(err){say(err.message,true);button.disabled=false}
  }});return {field,button};
 };
 if(mode==='pairs'){
  const tiles=Array.isArray(q.tiles)?q.tiles:[];if(!tiles.length)throw Error('Сервер не выдал пары');
  let first=null,busy=false;const matched=new Set();const buttons=[];
  for(const tile of tiles){const b=LexigoGameComponents.render('pairs',root,{text:tile.text,onClick:()=>{}});root.append(b);buttons.push([tile,b]);b.onclick=async()=>{
   if(busy||matched.has(tile.id))return;
   if(!first){first=tile;status.textContent='Выберите вторую карточку';return}
   const selected=first;first=null;if(selected.id===tile.id)return;
   busy=true;b.disabled=true;try{const result=await action('pair',{first:selected.id,second:tile.id});
    if(result.correct){matched.add(selected.id);matched.add(tile.id);for(const [t,btn] of buttons)if(matched.has(t.id))btn.disabled=true}
    if(result.complete)for(const [,btn] of buttons)btn.disabled=true;
   }catch(err){say(err.message,true)}finally{busy=false;if(!matched.has(tile.id))b.disabled=false}
  }}
 }else if(mode==='crystals'){
  const board=Array.isArray(q.board)?q.board:[];if(board.length!==36)throw Error('Сервер не выдал поле');
  let current=board.slice();const cells=[];let selected=null,moves=0,done=false,busy=false;
  const grid=el('div');grid.style.cssText='display:grid;grid-template-columns:repeat(6,1fr);gap:4px;max-width:420px';
  root.append(grid);
  for(let i=0;i<36;i++){const b=LexigoGameComponents.render('crystals',grid,{value:current[i],index:i,onClick:()=>{},onSwap:async(from,to)=>{if(done||busy)return;selected=from;await cells[to].onclick()},busy:()=>done||busy,neighbors:(a,b)=>Math.abs(Math.floor(a/6)-Math.floor(b/6))+Math.abs(a%6-b%6)===1});b.style.margin='0';grid.append(b);cells.push(b);
   b.onclick=async()=>{if(done||busy)return;if(selected==null){selected=i;status.textContent='Выберите соседний кристалл';return}
    const from=selected;selected=null;busy=true;try{const result=await action('swap',{from,to:i});
     if(Array.isArray(result.board)&&result.board.length===36){current=result.board;cells.forEach((cell,j)=>cell.textContent=String(current[j]))}
     if(result.moves!=null)moves=Number(result.moves);else if(result.correct)moves++;
     if(result.boardComplete){done=true;cells.forEach(cell=>cell.disabled=true);root.append(el('p',String(result.vocabQuestion?.prompt||q.prompt||'Переведите слово')));answerField()}
    }catch(err){say(err.message,true)}finally{busy=false}
   };
  }
 }else if(mode==='boss'){
  showStage(q.question||{prompt:'Ответьте на вопрос босса'});
  const {field,button}=answerField();
  const original=button.onclick;button.onclick=async()=>{const before=root.querySelectorAll('p').length;await original();if(root.querySelectorAll('p').length>before)field.focus()};
  const retry=el('button','Повторить этап');retry.onclick=async()=>{retry.disabled=true;try{await action('retry',{});retry.disabled=false}catch(err){say(err.message,true);retry.disabled=false}};
  root.append(retry);
 }
}

const uuid=()=>crypto.randomUUID();
async function edge(route,payload){if(!transport.authenticated)throw Error('Войдите снова');return request('/functions/v1/learning-api/'+route,{method:'POST',body:JSON.stringify(payload)})}
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
  button.onclick=async()=>{button.disabled=true;try{const result=await edge('start-attempt',{assignmentId:assignment.id,sessionId:uuid()});const attemptId=result.id;if(typeof attemptId!=='string')throw Error('Сервер не вернул ID попытки');await play(root,assignment,attemptId)}catch(err){say(err.message,true)}finally{button.disabled=false}};
 }
}
async function play(root,assignment,attemptId){
 const box=el('section');root.prepend(box);box.append(el('h3','Игра · '+assignment.mode));
 const next=el('button','Следующий вопрос');box.append(next);
 const question=el('div');box.append(question);
 const finish=el('button','Завершить попытку');box.append(finish);
 finish.onclick=async()=>{try{await edge('finish-attempt',{attemptId});await load();say('Попытка завершена на сервере')}catch(err){say(err.message,true)}};
 next.onclick=async()=>{next.disabled=true;question.replaceChildren();try{
  if(['cards','daily'].includes(assignment.mode)){await selfRating(question,assignment,attemptId);return}
  const c=await edge('next-question',{attemptId});
  if(['pairs','crystals','boss'].includes(assignment.mode)){
   await statefulRound(question,c,attemptId,assignment.mode);return;
  }
  question.append(el('p',String(c.question?.prompt??'Вопрос')));
  if(c.question?.proposed!=null)question.append(el('p','Вариант: '+String(c.question.proposed)));
  const {input:answer}=LexigoGameComponents.render(['quiz','truefalse'].includes(assignment.mode)?'spell':assignment.mode,question,{placeholder:'Ответ',label:'Проверить ответ',submit:async(answer,send)=>{
   send.disabled=true;try{const result=await edge('answer-question',{attemptId,challengeId:c.challengeId,index:c.index,wordId:c.wordId,answer:answer.value});question.append(el('p',result.correct?'Верно':'Неверно'));send.remove();answer.disabled=true}catch(err){say(err.message,true);send.disabled=false}
  }});
  if(assignment.mode==='truefalse')LexigoGameComponents.render('truefalse',question,{items:[{label:'✓ Верно',value:'true'},{label:'✕ Неверно',value:'false'}],onSelect:value=>answer.value=value});
  if(c.question?.speechText){const listen=el('button','🔊 Прослушать');listen.onclick=()=>{if(!window.speechSynthesis||!window.SpeechSynthesisUtterance){say('Озвучивание недоступно в этом браузере',true);return}const speech=new SpeechSynthesisUtterance(c.question.speechText);speech.lang='en-GB';speech.rate=.85;speechSynthesis.cancel();speechSynthesis.speak(speech)};question.append(listen)}
  if(Array.isArray(c.question?.choices))LexigoGameComponents.render('quiz',question,{items:c.question.choices.map(v=>({label:String(v),value:String(v)})),onSelect:value=>answer.value=value});

 }catch(err){say(err.message,true)}finally{next.disabled=false}};
 await next.onclick();
}

$('form').onsubmit=async e=>{e.preventDefault();transport.clear();userId='';try{config();say('Проверка входа…');const data=await request('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:$('email').value,password:$('password').value})});if(!data.access_token||!data.user?.id)throw Error('Auth не вернул подтверждённую сессию');transport.acceptSession(data);userId=data.user.id;await load()}catch(err){clear();say(err.message,true)}};
$('logout').onclick=async()=>{try{if(transport.authenticated)await request('/auth/v1/logout',{method:'POST'})}catch{}finally{clear();say('Вы вышли. Сессия удалена из памяти страницы.')}};
window.addEventListener('pagehide',clear);

};
