/* LEXI Crystal: one match-three game, progressively harder levels. */
(()=>{'use strict';
const E=window.LexiCrystalEngine;if(!E)return;
const $=id=>document.getElementById(id);
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
const btn=(text,cls,fn)=>{const b=el('button',cls||'btn',text);b.type='button';b.onclick=fn;return b;};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const moveWord=n=>n%100>=11&&n%100<=14?'ходов':n%10===1?'ход':n%10>=2&&n%10<=4?'хода':'ходов';
let G=null,data;
const key=()=> 'lexigo_crystal_v4'+(window.LexigoAccountHint?.uid()?':'+window.LexigoAccountHint.uid():'');
function load(){try{data=JSON.parse(localStorage.getItem(key())||'null');}catch{}if(!data||typeof data!=='object')data={};if(!data.levels||typeof data.levels!=='object')data.levels={};data.calm=data.calm===true;}
function persist(){try{localStorage.setItem(key(),JSON.stringify(data));}catch{}}
const reduced=()=>data.calm||matchMedia('(prefers-reduced-motion: reduce)').matches;
const alive=g=>G===g&&game===g.game&&!g.dead;
const open=id=>id===1||data.levels[id-1]?.won===true;
function begin(game){end();load();sprite();G={game,st:null,busy:false,sel:null,focus:0,revision:0};showMap();}
function end(){if(G){G.dead=true;G=null;}}
function heading(text){$('gameTitle').textContent=text;$('timer').textContent='';}
function showMap(){
 if(!G)return;if(G.st&&G.answers?.length&&!G.attemptSaved){saveLearningAttempt(G.game,false);G.attemptSaved=true;}G.revision++;G.st=null;G.busy=false;heading('💎 Кристалл');$('counter').textContent='Один режим · пять уровней';$('bar').style.width='0%';
 const map=el('section','cq-map');map.innerHTML='<div class="cq-map-head"><img class="cq-map-lexi" src="assets/lexi-head.webp" alt=""><div><h2>Собери три в ряд</h2><p>Меняй соседние кристаллы местами. Ряд из трёх и более одинаковых по горизонтали или вертикали взрывается: каждый кристалл даёт 10 очков. Набери цель до окончания ходов. После трёх удачных ходов Лекси предложит 5 заданий со словами.</p></div></div>';
 const rules=el('p','cq-rules','Без ряда кристаллы возвращаются обратно, ход сохраняется. Новые кристаллы падают сверху; новые ряды взрываются автоматически. Диагонали не считаются. С уровня 3 появляются неподвижные камни.');map.append(rules);
 const list=el('div','cq-levels');
 for(const L of E.LEVELS){const unlocked=open(L.id),r=data.levels[L.id];const b=btn('', 'cq-level'+(unlocked?'':' locked'),()=>{if(unlocked)startLevel(L.id);});b.dataset.level=L.id;b.disabled=!unlocked;b.setAttribute('aria-label','Уровень '+L.id+'. '+L.name+(unlocked?'':'. Сначала пройди предыдущий уровень'));
  const text=el('span','cq-level-txt');text.append(el('strong',null,L.name),el('small',null,L.target+' очков · '+L.moves+' '+moveWord(L.moves)+(L.rocks.length?' · камни: '+L.rocks.length:'')));
  b.append(el('span','cq-num',unlocked?L.id:'🔒'),text,el('span','cq-stars',r?.won?'★'.repeat(r.stars||1):'☆'));list.append(b);
 }
 map.append(list,el('p','muted tiny','Пройденные уровни и рекорды сохраняются на этом устройстве.'));
 $('play').replaceChildren(map);map.querySelector('h2').tabIndex=-1;map.querySelector('h2').focus({preventScroll:true});
}
function startLevel(id){
 if(!G||!open(id))return;const L=E.level(id);if(!L)return;
 if(G.st&&G.answers?.length&&!G.attemptSaved)saveLearningAttempt(G.game,false);G.attemptSaved=false;G.revision++;G.st=E.create(id,E.dailySeed(id,new Date().toLocaleDateString('sv-SE')));const available=shuffle(G.game.words.filter((w,i,a)=>a.findIndex(x=>x.id===w.id)===i));G.words=available.length?Array.from({length:5},(_,i)=>available[i%available.length]):[];G.answers=[];G.earned=0;G.wordsDone=false;G.game.score=0;G.game.firstCorrect=0;G.game.misses=0;G.game.savedAttempt=false;if(G.game.events)G.game.events=[];window.LexigoCloudSession?.restartRound?.(G.game);G.busy=false;G.sel=null;G.focus=0;heading('💎 '+L.id+'. '+L.name);
 const play=el('section','cq-play cq-simple'+(reduced()?' calm':''));
 play.innerHTML='<div class="cq-hud"><div class="cq-moves"><b id="cqMoves"></b><small id="cqMovesLabel">ходов</small></div><div class="cq-scorebox"><b id="cqScore">0</b><small id="cqTarget"></small><div class="cq-starbar"><i id="cqStarFill"></i></div></div><img class="cq-friend" src="assets/lexi-head.webp" alt="Лекси"></div><div class="cq-stage"><div class="cq-board" id="cqBoard" role="group" tabindex="0"></div></div><p id="cqMessage" class="cq-message" role="status" aria-live="polite"></p><p class="cq-help">Перетащи кристалл к соседнему или нажми два соседних. Клавиатура: стрелки — выбор, Enter — взять, стрелка — сдвиг. Камни не двигаются.</p><div class="cq-tools"></div>';
 play.querySelector('.cq-tools').append(btn('💡 Подсказка','btn secondary',hint),btn('⏸ Пауза','btn secondary',pause),btn(data.calm?'Анимация: спокойная':'Анимация: обычная','btn secondary',()=>{data.calm=!data.calm;persist();startLevelAfterPreference();}));
 const soundButton=btn(data.muted?'Звук: выключен':'Звук: включён','btn secondary',()=>{data.muted=!data.muted;persist();soundButton.textContent=data.muted?'Звук: выключен':'Звук: включён';if(!data.muted)sound('swap');});soundButton.dataset.pref='muted';play.querySelector('.cq-tools').append(soundButton);
 $('play').replaceChildren(play);const board=$('cqBoard');board.style.setProperty('--n',G.st.size);bind(board);draw(G.st.cells);hud();message('Цель: '+L.target+' очков за '+L.moves+' '+moveWord(L.moves)+'.'+(L.rocks.length?' Серые камни нельзя перемещать или разбить.':''));board.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});
}
function startLevelAfterPreference(){const p=document.querySelector('.cq-play');p?.classList.toggle('calm',reduced());const b=p?.querySelector('.cq-tools button:nth-child(3)');if(b)b.textContent=data.calm?'Анимация: спокойная':'Анимация: обычная';}
function draw(cells){
 const board=$('cqBoard');if(!board||!G?.st)return;board.replaceChildren();
 cells.forEach((p,i)=>{if(!p)return;const b=el('button','cq-gem'+(p.rock?' cq-rock':' c'+p.c));b.type='button';b.tabIndex=-1;b.dataset.i=i;b.dataset.id=p.id;b.style.setProperty('--x',i%G.st.size);b.style.setProperty('--y',Math.floor(i/G.st.size));
  b.setAttribute('aria-label',(p.rock?'Неподвижный камень':E.COLORS[p.c])+', строка '+(Math.floor(i/G.st.size)+1)+', столбец '+(i%G.st.size+1));b.setAttribute('aria-pressed',String(i===G.sel));if(p.rock){b.textContent='◆';b.setAttribute('aria-disabled','true');}else b.innerHTML=gemSVG(p.c);board.append(b);
 });selection();
}
function selection(){if(!G)return;document.querySelectorAll('#cqBoard .cq-gem').forEach(b=>{const i=Number(b.dataset.i);b.classList.toggle('sel',i===G.sel);b.classList.toggle('kbd',!!G.keyboard&&i===G.focus);b.setAttribute('aria-pressed',String(i===G.sel));});}
function message(text){if($('cqMessage'))$('cqMessage').textContent=text;}
function hud(){const st=G?.st;if(!st||!$('cqMoves'))return;$('cqMoves').textContent=st.moves;$('cqMovesLabel').textContent=moveWord(st.moves);$('cqScore').textContent=st.score;$('cqTarget').textContent='Цель: '+st.target+' очков';$('cqStarFill').style.width=Math.min(100,st.score/st.target*100)+'%';$('bar').style.width=Math.min(100,st.score/st.target*100)+'%';$('counter').textContent='Уровень '+st.level+' из '+E.LEVELS.length+' · 10 очков за кристалл';$('cqBoard').setAttribute('aria-label','Поле 7 на 7. '+st.moves+' ходов, '+st.score+' из '+st.target+' очков.');}
function tap(i){if(!G?.st||G.busy||G.st.over)return;if(G.st.cells[i]?.rock){message('Это неподвижный камень. Выбери соседние кристаллы.');return;}G.focus=i;
 if(G.sel===i)G.sel=null;else if(G.sel==null)G.sel=i;else if(E.neighbors(G.st,G.sel,i)){const a=G.sel;G.sel=null;attempt(a,i);return;}else G.sel=i;selection();}
function bind(board){
 let drag=null,suppress=false;
 board.addEventListener('pointerdown',e=>{const b=e.target.closest('.cq-gem');if(!b||G.busy)return;drag={i:Number(b.dataset.i),x:e.clientX,y:e.clientY};suppress=false;try{board.setPointerCapture(e.pointerId);}catch{}});
 board.addEventListener('pointerup',e=>{if(!drag)return;const d=drag;drag=null;const dx=e.clientX-d.x,dy=e.clientY-d.y;G.keyboard=false;
  if(Math.max(Math.abs(dx),Math.abs(dy))>=board.clientWidth/G.st.size*.3){suppress=true;const x=d.i%G.st.size,y=Math.floor(d.i/G.st.size),nx=x+(Math.abs(dx)>Math.abs(dy)?Math.sign(dx):0),ny=y+(Math.abs(dx)>Math.abs(dy)?0:Math.sign(dy));if(nx>=0&&ny>=0&&nx<G.st.size&&ny<G.st.size)attempt(d.i,ny*G.st.size+nx);}else{tap(d.i);suppress=true;}
 });
 board.addEventListener('pointercancel',()=>{drag=null;suppress=false;});
 board.addEventListener('click',e=>{const b=e.target.closest('.cq-gem');if(!b)return;if(suppress){suppress=false;return;}tap(Number(b.dataset.i));});
 board.addEventListener('keydown',e=>{if(!G?.st||G.busy)return;G.keyboard=true;const dirs={ArrowLeft:-1,ArrowRight:1,ArrowUp:-G.st.size,ArrowDown:G.st.size};
  if(e.key in dirs){e.preventDefault();const to=G.focus+dirs[e.key];if(!E.neighbors(G.st,G.focus,to))return;const from=G.sel;G.focus=to;if(from!=null){G.sel=null;attempt(from,to);}else selection();}
  else if(e.key==='Enter'||e.key===' '){e.preventDefault();tap(G.focus);}else if(e.key==='Escape'){G.sel=null;selection();}
 });
}
async function attempt(a,b){
 const g=G;if(!g?.st||g.busy||g.st.over||!alive(g))return;g.busy=true;g.sel=null;const rev=g.revision,res=E.swap(g.st,a,b);const board=$('cqBoard');board?.setAttribute('aria-busy','true');if(res.ok)sound('match');else sound('bad');let cleared=0,shuffled=false;
 for(const step of res.steps){if(!alive(g)||g.revision!==rev)return;
  if(step.t==='clear'){cleared+=step.cleared.length;step.cleared.forEach(i=>board?.querySelector('[data-i="'+i+'"]')?.classList.add('pop'));await wait(reduced()?25:170);}else {draw(step.cells);if(step.t==='shuffle')shuffled=true;await wait(reduced()?25:step.t==='fall'?180:120);}
 }
 if(!alive(g)||g.revision!==rev)return;draw(g.st.cells);hud();g.busy=false;board?.setAttribute('aria-busy','false');
 if(!g.wordsDone&&(g.st.movesUsed>=3||g.st.finished)){await wordBlock(g);if(!alive(g)||g.revision!==rev)return;}
 if(g.st.finished){result();return;}
 message(shuffled?'Возможных рядов не было. Лекси перемешал кристаллы бесплатно — можно продолжать.':res.ok?'Отлично! +'+cleared*10+' очков.':res.reason==='rock'?'Камни неподвижны. Ход сохранён.':'Ряд не получился. Кристаллы вернулись, ход сохранён.');
}

/* Restore the word block removed in v4, while keeping the existing board and
   the regular learning/progress pipeline. Rewards are derived, not minted. */
async function wordBlock(g){
 g.wordsDone=true;g.busy=true;
 for(let i=0;i<g.words.length;i++){
  await askWord(g,g.words[i],i);
  if(!alive(g))return;
 }
 g.busy=false;
}
function askWord(g,w,index){return new Promise(resolve=>{
 const box=el('div','cq-word');box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-labelledby','cqWordTitle');
 const card=el('div','cq-word-card'),head=el('div','cq-word-head'),img=el('img');img.src='assets/lexi-head.webp';img.alt='';
 const title=el('b',null,'Задание '+(index+1)+' из '+g.words.length);title.id='cqWordTitle';head.append(img,title);
 const q=el('div','question');card.append(head,q);box.append(card);$('play').append(box);
 const ownBook=DB.books.find(b=>b.sections.some(s=>s.words.some(x=>x.id===w.id)));
 const pool=ownBook?ownBook.sections.flatMap(s=>s.words):g.game.words;
 const alternatives=shuffle(pool.filter(x=>x.id!==w.id&&normalize(x.en)!==normalize(w.en)&&normalize(x.ru)!==normalize(w.ru))).filter((x,i,a)=>a.findIndex(y=>normalize(y.en)===normalize(x.en)&&normalize(y.ru)===normalize(x.ru))===i);
 const kind=['truefalse','quiz','reverse'][index%3];let model,correct,choices;
 if(!alternatives.length){model={mode:'spell',kind:'spell',instruction:'Напиши английское слово',prompt:w.ru};}
 else if(kind==='truefalse'){
  const truth=Math.random()<.5,proposed=truth?w.ru:alternatives[0].ru;correct=truth;
  model={mode:'truefalse',kind:'truefalse',instruction:'Верно ли указан перевод?',prompt:w.en,proposed,choices:[{label:'✓ Верно',value:true},{label:'✕ Неверно',value:false}]};
 }else{
  const reverse=kind==='reverse',field=reverse?'en':'ru',distinct=[];
  for(const x of alternatives)if(normalize(x[field])!==normalize(w[field])&&!distinct.some(y=>normalize(y[field])===normalize(x[field])))distinct.push(x);
  choices=shuffle([w,...distinct.slice(0,3)]).map(x=>({label:x[field],value:x.id}));correct=w.id;
  model={mode:'quiz',kind:'quiz',instruction:reverse?'Найди английское слово':'Выбери правильный перевод',prompt:reverse?w.ru:w.en,choices};
 }
 g.game.activeQuestionMode=!alternatives.length?'spell':kind==='reverse'?'quiz':kind;g.game.answered=false;g.game.hinted=false;g.game.retryActive=false;
 function answer(value,label){
  if(g.game.answered)return;g.game.answered=true;
  const ok=kind==='truefalse'&&alternatives.length?value===correct:alternatives.length?value===correct:normalize(value)===normalize(w.en);
  const expected=kind==='truefalse'&&alternatives.length?(correct?'✓ Верно':'✕ Неверно'):kind==='reverse'?w.en:alternatives.length?w.ru:w.en;
  g.game.answerDetail={wordId:w.id,answer:String(label).slice(0,200),expected:String(expected).slice(0,200),answered_at:new Date().toISOString()};
  const before=window.LexigoProgress.summarize(DB.books,progress).crystals;
  recordLearningEvent(w,ok,false,false,g.game.activeQuestionMode);record(w,ok,alternatives.length?'recognition':'recall');
  const after=window.LexigoProgress.summarize(DB.books,progress).crystals;g.earned+=Math.max(0,after-before);
  if(ok)g.game.firstCorrect++;g.answers.push(ok);
  q.querySelectorAll('button,input').forEach(b=>b.disabled=true);
  const feedback=el('div','feedback',ok?'✓ Верно!':'Почти! Правильный ответ: '+w.en+' — '+w.ru);feedback.dataset.result=ok?'ok':'miss';feedback.setAttribute('role','status');q.append(feedback);
  document.dispatchEvent(new CustomEvent('lexigo:answer',{detail:{word:w,correct:ok,hinted:false,skill:alternatives.length?'recognition':'recall',mode:g.game.activeQuestionMode,gameMode:'crystals',retry:false,feedback}}));sound(ok?'word':'soft');
  const next=btn(index+1===g.words.length?'Продолжить игру':'Дальше','btn good cq-continue',()=>{box.remove();resolve();});q.append(next);next.focus({preventScroll:true});
 }
 const actions={answer:value=>answer(value,model.choices.find(x=>x.value===value)?.label??value),submit:(input)=>{if(input.value.trim())answer(input.value,input.value)}};
 LexigoGameEngine.question(q,model,actions);q.querySelector('button,input')?.focus({preventScroll:true});
});}

function hint(){if(!G?.st||G.busy)return;let mv=E.findMove(G.st);if(!mv){E.shuffle(G.st);draw(G.st.cells);mv=E.findMove(G.st);message('Комбинаций не было — поле перемешано бесплатно.');}else message('Подсвеченные кристаллы можно поменять местами. Ход не потрачен.');document.querySelectorAll('.cq-gem.hint').forEach(b=>b.classList.remove('hint'));mv?.forEach(i=>$('cqBoard').querySelector('[data-i="'+i+'"]').classList.add('hint'));}
function pause(){if(!G?.st||G.busy)return;G.busy=true;const overlay=el('div','cq-pause');const card=el('div','cq-pause-card');card.append(el('h2',null,'Пауза'),btn('Продолжить','btn',()=>{overlay.remove();G.busy=false;$('cqBoard')?.focus({preventScroll:true});}),btn('Карта уровней','btn secondary',showMap));overlay.append(card);$('play').append(overlay);card.querySelector('button').focus();}
function result(){const st=G.st,f=st.finished;if(!f)return;const originalWords=G.game.words;G.game.words=G.words.slice();saveLearningAttempt(G.game,true);G.attemptSaved=true;G.game.words=originalWords;sound(f.won?'win':'soft');G.busy=false;const prev=data.levels[st.level]||{};data.levels[st.level]={won:prev.won||f.won,best:Math.max(prev.best||0,f.score),stars:Math.max(prev.stars||0,f.stars)};persist();
 const card=el('section','lesson-result crystal-result'+(f.won?'':' lost'));card.innerHTML='<img class="cq-result-lexi" src="assets/lexi-head.webp" alt="Лекси"><h2 tabindex="-1">'+(f.won?'Уровень пройден!':'Ходы закончились')+'</h2><p>'+(f.won?'Ты собрал кристальные сокровища!':'Нужно ещё '+Math.max(0,st.target-st.score)+' очков до цели. Попробуем ещё раз?')+'</p><p class="cq-res-stars">'+(f.won?'★'.repeat(f.stars):'☆')+'</p><p>'+st.score+' из '+st.target+' очков · использовано ходов: '+st.movesUsed+'</p><p>Верных ответов: <strong>'+G.answers.filter(x=>x).length+' из '+G.words.length+'</strong> · 💎 Получено кристаллов: <strong>'+G.earned+'</strong></p><p>Рекорд на этом устройстве: '+data.levels[st.level].best+'</p>';
 const actions=el('div','cq-result-actions');if(f.won&&E.level(st.level+1))actions.append(btn('Следующий уровень →','btn good',()=>startLevel(st.level+1)));if(f.won&&st.level===E.LEVELS.length)card.append(el('p',null,'Все пять уровней пройдены!'));
 actions.append(btn('Играть ещё','btn',()=>startLevel(st.level)),btn('Карта уровней','btn secondary',showMap),btn('К выбору игр','btn secondary',()=>stop()));card.append(actions);$('play').replaceChildren(card);card.querySelector('h2').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});
}
  let audio = null;
  function sound(kind, level = 1) {
    if (data.muted) return;
    try {
      const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
      if (!audio || audio.state === 'closed') audio = new A(); if (audio.state === 'suspended') audio.resume();
      const notes = { swap: [330], bad: [240, 200], match: [523, 659, 784], special: [784, 988, 1175], word: [660, 880, 1046], win: [523, 659, 784, 1047], soft: [392, 349] }[kind] || [440];
      const now = audio.currentTime, up = Math.min(level - 1, 6) * 45;
      notes.forEach((hz, i) => {
        const o = audio.createOscillator(), g = audio.createGain(), t = now + i * (kind === 'win' ? 0.11 : 0.07);
        o.type = kind === 'swap' ? 'sine' : 'triangle'; o.frequency.setValueAtTime(hz + up, t);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(kind === 'swap' ? 0.04 : 0.08, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
        o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + 0.27);
      });
    } catch { /* звук необязателен */ }
  }

  const GEMS = [
    ['#7fb4ff', '#2f6bff', '#163c9e', '<polygon points="50,6 89,28 89,72 50,94 11,72 11,28"/>', '<path d="M50 6V40L89 28M50 40L11 28"/><polygon points="50,40 70,52 50,64 30,52" opacity=".35" fill="#fff"/>'],
    ['#d5a8ff', '#8b3cf0', '#4c1593', '<polygon points="50,4 86,50 50,96 14,50"/>', '<polyline points="14,50 50,40 86,50"/><polyline points="50,4 50,40"/>'],
    ['#8ff0b1', '#16b062', '#0b6337', '<polygon points="31,8 69,8 92,31 92,69 69,92 31,92 8,69 8,31"/>', '<rect x="30" y="30" width="40" height="40" rx="4" opacity=".3" fill="#fff"/>'],
    ['#ff9a9a', '#ec2f45', '#8e0f22', '<path d="M50 90C22 70 8 54 8 34C8 18 20 9 32 9C41 9 47 14 50 21C53 14 59 9 68 9C80 9 92 18 92 34C92 54 78 70 50 90Z"/>', '<path d="M30 30C30 22 36 18 42 20" stroke-width="6" opacity=".7"/>'],
    ['#ffe58a', '#f5b20a', '#9a5d00', '<circle cx="50" cy="50" r="42"/>', '<polygon points="50,20 58,42 80,42 62,56 69,78 50,64 31,78 38,56 20,42 42,42" opacity=".35" fill="#fff"/>'],
    ['#9ff4f2', '#14b8c4', '#08626b', '<path d="M50 8L93 86Q95 92 88 92H12Q5 92 7 86Z"/>', '<path d="M50 8V62L93 86M50 62L7 86"/>']
  ];
  function sprite() {
    if ($('cqSprite')) return;
    const defs = GEMS.map(([lite, mid, dark, shape, facets], c) => `<linearGradient id="cqg${c}" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${lite}"/><stop offset=".55" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
      <symbol id="cq-gem${c}" viewBox="0 0 100 100"><g fill="url(#cqg${c})" stroke="${dark}" stroke-width="3" stroke-linejoin="round">${shape}</g><g fill="none" stroke="#fff" stroke-width="2.4" stroke-opacity=".55" stroke-linecap="round">${facets}</g><ellipse cx="36" cy="28" rx="12" ry="7" fill="#fff" opacity=".55" transform="rotate(-25 36 28)"/></symbol>`).join('');
    const prism = `<radialGradient id="cqpr" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#ffe9a8"/><stop offset=".65" stop-color="#ff7ad9"/><stop offset="1" stop-color="#5b3fe0"/></radialGradient>
      <symbol id="cq-prism" viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="url(#cqpr)" stroke="#3b2a9e" stroke-width="3"/><g stroke-width="7" stroke-linecap="round" fill="none" opacity=".9"><path d="M22 62a30 30 0 0 1 56 0" stroke="#ff5a6e"/><path d="M30 64a21 21 0 0 1 40 0" stroke="#ffc83a"/><path d="M38 66a12 12 0 0 1 24 0" stroke="#2fd18a"/></g><polygon points="50,14 55,28 70,28 58,37 62,51 50,42 38,51 42,37 30,28 45,28" fill="#fff"/></symbol>`;
    const holder = document.createElement('div'); holder.id = 'cqSprite'; holder.setAttribute('aria-hidden', 'true'); holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    holder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg"><defs>${defs}${prism}</defs></svg>`;
    document.body.append(holder);
  }
  const gemSVG = c => `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><use href="#${c < 0 ? 'cq-prism' : 'cq-gem' + c}"/></svg>`;

window.LexiCrystalQuest=Object.freeze({begin,end,startLevel,showMap,tryMove:attempt,state:()=>G?.st,debug:()=>G});
})();
