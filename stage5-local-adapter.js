/* Local-only synthetic Supabase integration in the existing LEXIGO game panel.
 * Never loaded by the published GitHub Pages game or for real pupils.
 * JWT stays in memory, never localStorage/sessionStorage or query strings. */
(()=>{
'use strict';
if(!['http://127.0.0.1:3000','http://localhost:3000'].includes(location.origin)||
 new URLSearchParams(location.search).get('localDemo')!=='1')return;
const api='http://127.0.0.1:54321/functions/v1/learning-api/';
const $=id=>document.getElementById(id);
const panel=document.createElement('section');panel.className='panel';panel.id='localDemoPanel';
panel.innerHTML='<h2>🧪 Локальная игра с серверной проверкой</h2><p class="muted">Только фиктивные аккаунты и локальный Supabase. Обычные игры и словарь не меняются.</p><label class="field">JWT фиктивного ученика<input id="localJwt" type="password" autocomplete="off" aria-label="JWT фиктивного ученика"></label><label class="field">ID серверного назначения<input id="localAssignment" type="text" autocomplete="off" aria-label="ID серверного назначения"></label><button class="btn" id="localBegin" type="button">Играть с сервером</button><p id="localStatus" role="status"></p>';
const area=$('launcher')||$('game');area.parentNode.insertBefore(panel,area);
let token='',attempt='',question=null,busy=false,selected=null;
const status=s=>{const el=$('localStatus');if(el)el.textContent=s;const m=$('localMessage');if(m)m.textContent=s};
const btn=(label,callback)=>{const b=document.createElement('button');b.className='btn secondary';b.type='button';b.textContent=label;b.onclick=callback;return b};
async function call(route,body){
 const res=await fetch(api+route,{method:'POST',headers:{authorization:'Bearer '+token,
 'content-type':'application/json'},body:JSON.stringify(body)});
 const data=await res.json();if(!res.ok)throw Error('HTTP '+res.status+': '+(data.error||'отказано'));
 return data;
}
function screen(){if($('launcher'))$('launcher').classList.add('hidden');$('game').classList.remove('hidden');
 $('gameTitle').textContent='🧪 Локальная проверка';$('counter').textContent='Только тестовые результаты';
 $('bar').style.width='0%';$('timer').textContent='';$('play').replaceChildren()}
function content(){const root=$('play');root.replaceChildren();const title=document.createElement('h3');
 title.textContent=question.mode+' · задание '+(question.index+1);root.append(title);
 const msg=document.createElement('p');msg.id='localMessage';msg.setAttribute('role','status');root.append(msg);
 return root}
function actionBtn(root,label,handler){const b=btn(label,async()=>{if(busy)return;busy=true;try{await handler()}catch(e){status(e.message)}finally{busy=false}});
 root.append(b);return b}
async function submit(answer){const result=await call('answer-question',{attemptId:attempt,
 challengeId:question.challengeId,index:question.index,wordId:question.wordId,answer});
 status(result.correct?'✓ Ответ проверен сервером':'✕ Сервер обнаружил ошибку');
 const root=$('play');root.querySelectorAll('button').forEach(b=>b.disabled=true);
 actionBtn(root,'Следующий вопрос',next);
}
async function play(action,payload={}){const result=await call('play-round',{attemptId:attempt,
 challengeId:question.challengeId,requestId:crypto.randomUUID(),action,payload});
 if(result.complete){status(result.passed===false?'Босс не пройден':'Раунд завершён');
 actionBtn($('play'),'Следующий раунд',next);return result}
 if(result.correct!==undefined)status(result.correct?'✓ Сервер подтвердил действие':'Попробуй другое действие');
 return result}
function renderQuestion(){const root=content(),q=question.question;
 const p=document.createElement('p');p.textContent=q.prompt||q.instruction||'Выполни задание';root.append(p);
 if(q.responseType==='pairs'){
  let first=null;const tiles=document.createElement('div');tiles.className='buttons';
  for(const tile of q.tiles){const b=actionBtn(tiles,tile.text,async()=>{
   if(!first){first=tile;return}const a=first;first=null;
   const r=await play('pair',{first:a.id,second:tile.id});
   if(r.correct){for(const id of [a.id,tile.id]){const button=tiles.querySelector('[data-tile="'+id+'"]');if(button)button.disabled=true}}
  });b.dataset.tile=tile.id}
  root.append(tiles);actionBtn(root,'Подсказка',()=>play('hint'));return;
 }
 if(q.responseType==='crystals'){
  let board=q.board,first=null;const grid=document.createElement('div');
  grid.style.cssText='display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;max-width:360px';
  const draw=()=>{grid.replaceChildren();board.forEach((color,i)=>{
   const b=actionBtn(grid,['🔴','🟢','🔵','🟡','🟣'][Number(color)]||'💎',async()=>{
    if(first===null){first=i;return}const a=first;first=null;
    const r=await play('swap',{from:a,to:i});if(r.board){board=r.board;draw()}
   });b.setAttribute('aria-label','Кристалл '+(i+1))})};
  draw();root.append(grid);return;
 }
 if(q.responseType==='boss'){
  let stage=q.question;
  const stageText=document.createElement('p');root.append(stageText);
  const input=document.createElement('input');input.type='text';input.autocomplete='off';
  input.setAttribute('aria-label','Ответ босса');root.append(input);
  const update=()=>{stageText.textContent=stage.prompt+(stage.proposed?' — '+stage.proposed:'')};
  update();
  actionBtn(root,'Ответить',async()=>{
   const r=await play('answer',{answer:input.value});input.value='';
   if(r.nextQuestion){stage=r.nextQuestion;update()}
   if(r.correct===false)status('Неверно. Используй повторную попытку.');
  });
  actionBtn(root,'Повторить',()=>play('retry'));
  actionBtn(root,'Подсказка',()=>play('hint'));return;
 }
 if(q.responseType==='choice'){
  for(const choice of q.choices)actionBtn(root,choice,()=>submit(choice));
 }else if(q.responseType==='boolean'){
  actionBtn(root,'Верно',()=>submit('true'));actionBtn(root,'Неверно',()=>submit('false'));
 }else{
  if(q.responseType==='audio')actionBtn(root,'🔊 Прослушать',()=>{
   if(!('speechSynthesis'in window))throw Error('Аудио недоступно');
   speechSynthesis.cancel();const speech=new SpeechSynthesisUtterance(q.speechText);speech.lang='en-GB';
   speechSynthesis.speak(speech)});
  const input=document.createElement('input');input.type='text';input.autocomplete='off';
  input.setAttribute('aria-label','Ответ');root.append(input);
  actionBtn(root,'Проверить',()=>submit(input.value));
 }
}
async function next(){question=await call('next-question',{attemptId:attempt});renderQuestion()}
$('localBegin').onclick=async()=>{if(busy)return;busy=true;try{
 token=$('localJwt').value.trim();const assignmentId=$('localAssignment').value.trim();
 if(!token||!/^[0-9a-f-]{36}$/i.test(assignmentId))throw Error('Укажи тестовый JWT и ID назначения');
 const started=await call('start-attempt',{assignmentId,sessionId:crypto.randomUUID()});
 attempt=started.id;screen();await next();
 }catch(e){status(e.message)}finally{busy=false}};
})();
