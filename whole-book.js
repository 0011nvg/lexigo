/* «Хочешь повторить весь учебник?» — тренировка слов всего выбранного Spotlight.
 * 2026-11-02: панель в основной колонке, плавно раскрывается, адаптивная сетка режимов.
 * 2026-11-03: слова идут по порядку блоками (word-rounds.js): раунд 1 — первые 15 слов, раунд 2 — следующие…
 *   прогресс «N из M слов · раунд k из n» отдельно для каждой игры; «Несколько игр» — выбрать одну, несколько
 *   или все игры и пройти слова учебника в смешанном раунде; «Финальный тест» — с выбором типов заданий.
 *   Старый прогресс lexigo_whole_book_v1_* переносится один раз. */
(function(){
'use strict';
const host=document.getElementById('wholeBookHost');
if(!host||!window.LEXIGO_DATA)return;
const configs=[['cards','Карточки'],['quiz','Выбери перевод'],['truefalse','Верно / неверно'],['listen','Слушай и выбирай'],['pairs','Найди пару'],['builder','Конструктор слов'],['fix','Исправь ошибку'],['spell','Напиши слово'],['audio','Аудиодиктант'],['crystals','Кристаллы']];
const MIX=[['quiz','Выбери перевод'],['truefalse','Верно / неверно'],['listen','Слушай и выбирай'],['builder','Конструктор слов'],['fix','Исправь ошибку'],['spell','Напиши слово'],['audio','Аудиодиктант']];
const MIX_KEY='lexigo_wb_mix_types';
const SINGLE=/^[a-zA-Z]+(?:[-'’‘][a-zA-Z]+)*$/;
const panel=document.createElement('section');panel.className='wb-panel';panel.id='wholeBookPanel';panel.setAttribute('aria-labelledby','wholeBookTitle');
panel.innerHTML='<div class="wb-head"><span class="wb-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20"/><path d="M9 8h7M9 12h5"/></svg></span><div class="wb-copy"><strong id="wholeBookTitle">Хочешь повторить весь учебник?</strong><p>Слова из всех модулей <span id="wholeBookLabel">Spotlight</span> — в любимых играх, по 15 слов за раунд.</p></div><button id="wholeBookOpen" class="wb-toggle" type="button" aria-expanded="false" aria-controls="wholeBookBody">Выбрать игру <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></div><div class="wb-body" id="wholeBookBody"><div><div class="wb-inner"><p>Слова идут по порядку: раунд 1 — первые 15 слов, раунд 2 — следующие, пока не пройдёшь весь учебник. Прогресс сохраняется для каждой игры.</p><div id="wholeBookModes" class="wb-grid"></div></div></div></div>';
host.append(panel);
const toggle=panel.querySelector('#wholeBookOpen'),body=panel.querySelector('#wholeBookBody'),modes=panel.querySelector('#wholeBookModes');
body.inert=true;
function selectedBook(){const grade=((location.hash.match(/^#\/(?:course|book)\/(\d)/)||[])[1])||(document.getElementById('courseTitle').textContent.match(/\d+/)||[])[0];return window.LEXIGO_DATA.books.find(b=>String(b.grade)===String(grade))}
const roundKey=(grade,mode)=>'B'+grade+'|'+mode;
function lexical(b){const seen=new Set();return b.sections.flatMap(s=>s.words).filter(w=>(typeof isLexicalEntry!=='function'||isLexicalEntry(w))&&!seen.has(w.id)&&seen.add(w.id))}
function eligibleFor(words,mode){
 if(mode==='boss'||mode==='crystals')return words.filter(w=>SINGLE.test(String(w.en).trim()));
 if(mode==='builder')return words.filter(w=>typeof isBuilderWord!=='function'||isBuilderWord(w));
 if(mode==='audio')return words.filter(w=>typeof isSingleWordEntry!=='function'||isSingleWordEntry(w));
 return words}
const sizeOf=mode=>window.LexiRounds?LexiRounds.sizeFor(mode):15;
/* старый прогресс «по этапам» → раунды, один раз */
function adoptOld(grade,mode){try{const k='lexigo_whole_book_v1_'+grade+'_'+mode,x=JSON.parse(localStorage.getItem(k)||'null');if(Array.isArray(x)&&x.length)LexiRounds.adopt(roundKey(grade,mode),x)}catch{}}
function tile(title,sub,pct,onClick,extra){const btn=document.createElement('button');btn.type='button';btn.className='wb-mode'+(extra?' '+extra:'');const label=document.createElement('b');label.textContent=title;const s=document.createElement('small');s.textContent=sub;btn.append(label,s);if(pct!=null){const meter=document.createElement('span');meter.className='wb-meter';const fill=document.createElement('i');fill.style.width=pct+'%';meter.append(fill);btn.append(meter)}btn.addEventListener('click',onClick);return btn}
function progressText(i,sep=' · '){return i.complete?'Все '+i.total+' пройдены'+sep+'начать заново':i.done+' из '+i.total+' '+LexiRounds.ofWords(i.total)+sep+'раунд '+i.round+' из '+i.rounds}
function render(){const b=selectedBook();if(!b||!window.LexiRounds)return;const words=lexical(b);document.getElementById('wholeBookLabel').textContent='Spotlight '+b.grade;modes.replaceChildren();
 for(const [mode,title] of configs){if(mode==='audio'&&typeof audioAvailable==='function'&&!audioAvailable())continue;if(mode==='listen'&&typeof audioAvailable==='function'&&!audioAvailable())continue;
  const eligible=eligibleFor(words,mode);if(!eligible.length)continue;adoptOld(b.grade,mode);
  const btn=tile(title,'',null,()=>play(b,mode));
  if(mode==='crystals'){btn.querySelector('small').textContent='15 слов учебника по порядку · своя игра с уровнями'}
  else{const i=LexiRounds.info(roundKey(b.grade,mode),eligible,sizeOf(mode));btn.querySelector('small').textContent=progressText(i,'\n');const meter=document.createElement('span');meter.className='wb-meter';const fill=document.createElement('i');fill.style.width=Math.round(i.done/Math.max(1,i.total)*100)+'%';meter.append(fill);btn.append(meter)}
  btn.dataset.wbMode=mode;modes.append(btn)}
 /* несколько игр сразу */
 const mi=LexiRounds.info(roundKey(b.grade,'mixed'),words,15);
 const mix=tile('Несколько игр','Одна, несколько или все игры\n'+progressText(mi),Math.round(mi.done/Math.max(1,mi.total)*100),()=>mixDialog(b),'wb-mix');mix.dataset.wbMode='mixed';modes.append(mix);
 /* работа над ошибками */
 const hard=words.filter(w=>typeof isReviewWord==='function'&&isReviewWord(w));
 const rv=tile('Работа над ошибками',hard.length?hard.length+' '+(typeof ruWords==='function'?ruWords(hard.length):'слов')+' с ошибками или пора повторить':'Пока ошибок нет',null,()=>review(b));rv.dataset.wbMode='review';modes.append(rv);
 /* финальный тест */
 const singles=eligibleFor(words,'boss');if(singles.length>=3){const bi=LexiRounds.info(roundKey(b.grade,'boss'),singles,15);const bt=tile('Финальный тест','Выбери задания\n'+progressText(bi),Math.round(bi.done/Math.max(1,bi.total)*100),()=>boss(b),'wb-boss');bt.dataset.wbMode='boss';modes.append(bt)}
}
function setOpen(on){panel.classList.toggle('open',on);toggle.setAttribute('aria-expanded',String(on));body.inert=!on;toggle.firstChild.textContent=on?'Свернуть ':'Выбрать игру '}
function useBook(b){try{if(typeof book!=='undefined'&&book&&String(book.grade)!==String(b.grade)){document.getElementById('book').value=String(b.grade);changeBook()}}catch{}}
function begin(b,mode,pool,types){if(!window.LexiRounds||!pool.length)return;setOpen(false);useBook(b);window.LexigoWholeBook.current={grade:b.grade,mode};
 const ok=LexiRounds.launch({key:roundKey(b.grade,mode),pool,mode,types,size:sizeOf(mode),pick:mode==='pairs'&&typeof uniquePairs==='function'?uniquePairs:null,label:'Spotlight '+b.grade+' · весь учебник'});
 if(!ok||!game)window.LexigoWholeBook.current=null}
function play(b,mode){const pool=eligibleFor(lexical(b),mode);begin(b,mode,pool,mode==='crystals'?['quiz','truefalse','fix']:undefined)}
function review(b){const hard=lexical(b).filter(w=>typeof isReviewWord==='function'&&isReviewWord(w));if(!hard.length){window.LexiQuest?.toast('Ошибок и слов для повторения пока нет. Отличная работа!','happy');return}setOpen(false);useBook(b);window.LexigoWholeBook.current={grade:b.grade,mode:'review'};start('review',typeof lexiRound==='function'?lexiRound(hard,12):hard.slice(0,12));if(!game)window.LexigoWholeBook.current=null}
function boss(b){const pool=eligibleFor(lexical(b),'boss');if(window.LexigoPlus&&window.LexigoPlus.bossDialog)window.LexigoPlus.bossDialog(t=>begin(b,'boss',pool,t),{pool,key:roundKey(b.grade,'boss'),title:'весь Spotlight '+b.grade});else begin(b,'boss',pool)}
/* «Несколько игр»: выбор одной, нескольких или всех игр; выбор живёт до конца сессии браузера */
function savedMix(){try{const x=JSON.parse(sessionStorage.getItem(MIX_KEY)||'null');if(Array.isArray(x)){const t=x.filter(v=>MIX.some(m=>m[0]===v));if(t.length)return t}}catch{}return ['quiz','builder','spell']}
function mixDialog(b){
 const audioOK=typeof audioAvailable!=='function'||audioAvailable();const list=MIX.filter(([t])=>audioOK||!['audio','listen'].includes(t));
 const chosen=new Set(savedMix().filter(t=>list.some(m=>m[0]===t)));
 document.querySelector('.lx-notice')?.remove();
 const box=document.createElement('div');box.className='lx-notice boss-setup wb-mix-setup';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-labelledby','wbMixTitle');
 const card=document.createElement('div');card.className='lx-notice-card';
 const h=document.createElement('h2');h.id='wbMixTitle';h.textContent='Несколько игр · Spotlight '+b.grade;
 const words=lexical(b),i=LexiRounds.info(roundKey(b.grade,'mixed'),words,15);
 const info=document.createElement('p');info.className='boss-words';info.textContent='Слова учебника по порядку, по 15 за раунд · '+progressText(i)+'. Задания чередуются.';
 const h3=document.createElement('h3');h3.textContent='Какие игры включить?';
 const grid=document.createElement('div');grid.className='boss-types';grid.setAttribute('role','group');grid.setAttribute('aria-label','Игры в раунде');
 const msg=document.createElement('p');msg.className='boss-msg';msg.setAttribute('role','status');
 const go=document.createElement('button');go.type='button';go.className='btn';go.textContent='Начать раунд →';
 const paint=()=>{grid.querySelectorAll('button').forEach(x=>{const on=chosen.has(x.dataset.type);x.setAttribute('aria-pressed',String(on));x.querySelector('.tick').textContent=on?'✓':''});msg.textContent=chosen.size?'В раунде: '+list.filter(([t])=>chosen.has(t)).map(m=>m[1]).join(', ')+'.':'Отметь хотя бы одну игру.';msg.classList.toggle('warn',!chosen.size);go.disabled=!chosen.size};
 for(const [t,name] of list){const x=document.createElement('button');x.type='button';x.className='boss-type';x.dataset.type=t;const tick=document.createElement('span');tick.className='tick';const nb=document.createElement('b');nb.textContent=name;x.append(tick,nb);x.onclick=()=>{chosen.has(t)?chosen.delete(t):chosen.add(t);paint()};grid.append(x)}
 const presets=document.createElement('div');presets.className='boss-presets';
 const pAll=document.createElement('button');pAll.type='button';pAll.className='text-button';pAll.textContent='Выбрать все';pAll.onclick=()=>{list.forEach(([t])=>chosen.add(t));paint()};
 const pNone=document.createElement('button');pNone.type='button';pNone.className='text-button';pNone.textContent='Снять все';pNone.onclick=()=>{chosen.clear();paint()};presets.append(pAll,pNone);
 const row=document.createElement('div');row.className='lx-notice-actions';const cancel=document.createElement('button');cancel.type='button';cancel.className='btn secondary';cancel.textContent='Отмена';cancel.onclick=()=>box.remove();
 go.onclick=()=>{const t=list.map(m=>m[0]).filter(x=>chosen.has(x));try{sessionStorage.setItem(MIX_KEY,JSON.stringify(t))}catch{}box.remove();begin(b,'mixed',words,t)};
 row.append(cancel,go);card.append(h,info,h3,grid,presets,msg,row);box.append(card);
 box.addEventListener('click',e=>{if(e.target===box)box.remove()});box.addEventListener('keydown',e=>{if(e.key==='Escape')box.remove()});
 document.body.append(box);paint();go.focus()}
toggle.addEventListener('click',()=>{const on=!panel.classList.contains('open');if(on)render();setOpen(on);if(on)setTimeout(()=>panel.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'}),360)});
window.addEventListener('hashchange',()=>{if(panel.classList.contains('open'))render()});
document.querySelectorAll('[data-mode],#quickStart').forEach(el=>el.addEventListener('click',()=>{window.LexigoWholeBook.current=null}));
/* запуск по адресу #/book/<класс>/play/<игра> (обновление страницы, «Назад», «Дальше: …») — без диалогов, с последним выбором */
function playRoute(g,mode){const b=window.LEXIGO_DATA.books.find(x=>String(x.grade)===String(g));if(!b)return false;
 if(mode==='mixed')begin(b,'mixed',lexical(b),savedMix());
 else if(mode==='boss')begin(b,'boss',eligibleFor(lexical(b),'boss'),window.LexigoPlus?window.LexigoPlus.bossTypes():undefined);
 else if(mode==='review')review(b);
 else if(configs.some(c=>c[0]===mode))play(b,mode);
 return !!game}
window.LexigoWholeBook={current:null,render,play:playRoute,mixDialog:()=>{const b=selectedBook();if(b)mixDialog(b)}};
if(/^#\/book\//.test(location.hash)){const go=()=>{if(window.LexigoNav&&!game)window.LexigoNav.refresh()};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',go);else go()}
})();
