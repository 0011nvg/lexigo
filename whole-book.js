/* «Хочешь повторить весь учебник?» — тренировка слов всего выбранного Spotlight.
 * 2026-11-02: панель перенесена из узкой колонки модулей в основную колонку, раскрывается плавно,
 * адаптивная сетка режимов. Логика этапов и ключи хранения (lexigo_whole_book_v1_*) сохранены. */
(function(){
'use strict';
const host=document.getElementById('wholeBookHost');
if(!host||!window.LEXIGO_DATA)return;
const configs=[['cards','Карточки',20],['quiz','Выбери перевод',20],['spell','Напиши слово',15],['pairs','Найди пару',10],['truefalse','Верно / неверно',20],['fix','Исправь ошибку',15],['audio','Аудиодиктант',15],['crystals','Кристаллы',15],['boss','Финальный тест',15],['mixed','Смешанная тренировка',15],['builder','Конструктор слов',12],['listen','Слушай и выбирай',15],['review','Работа над ошибками',12]];
const SINGLE=/^[a-zA-Z]+(?:[-'’‘][a-zA-Z]+)*$/;
let active=null;
const panel=document.createElement('section');panel.className='wb-panel';panel.id='wholeBookPanel';panel.setAttribute('aria-labelledby','wholeBookTitle');
panel.innerHTML='<div class="wb-head"><span class="wb-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20"/><path d="M9 8h7M9 12h5"/></svg></span><div class="wb-copy"><strong id="wholeBookTitle">Хочешь повторить весь учебник?</strong><p>Слова из всех модулей <span id="wholeBookLabel">Spotlight</span> — в любимых играх, по небольшим этапам.</p></div><button id="wholeBookOpen" class="wb-toggle" type="button" aria-expanded="false" aria-controls="wholeBookBody">Выбрать игру <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></div><div class="wb-body" id="wholeBookBody"><div><div class="wb-inner"><p>Выбери игру — слова других учебников не попадутся. Прогресс по этапам сохраняется: в следующий раз продолжишь с новых слов.</p><div id="wholeBookModes" class="wb-grid"></div></div></div></div>';
host.append(panel);
const toggle=panel.querySelector('#wholeBookOpen'),body=panel.querySelector('#wholeBookBody'),modes=panel.querySelector('#wholeBookModes');
body.inert=true;
function selectedBook(){const grade=(document.getElementById('courseTitle').textContent.match(/\d+/)||[])[0];return window.LEXIGO_DATA.books.find(b=>String(b.grade)===String(grade))}
function key(grade,mode){return 'lexigo_whole_book_v1_'+grade+'_'+mode}
function read(k){try{const x=JSON.parse(localStorage.getItem(k)||'[]');return Array.isArray(x)?x:[]}catch{return []}}
function write(k,x){try{localStorage.setItem(k,JSON.stringify(x))}catch{}}
function lexical(b){return b.sections.flatMap(s=>s.words).filter(w=>typeof isLexicalEntry!=='function'||isLexicalEntry(w))}
function eligibleFor(words,mode){return mode==='boss'||mode==='crystals'?words.filter(w=>SINGLE.test(String(w.en).trim())):words}
function render(){const b=selectedBook();if(!b)return;const words=lexical(b);document.getElementById('wholeBookLabel').textContent='Spotlight '+b.grade;modes.replaceChildren();
 for(const [mode,title,limit] of configs){if(mode==='audio'&&typeof audioAvailable==='function'&&!audioAvailable())continue;const eligible=eligibleFor(words,mode);if(!eligible.length)continue;const seen=new Set(read(key(b.grade,mode)));const done=eligible.filter(w=>seen.has(w.id)).length;
  const btn=document.createElement('button');btn.type='button';btn.className='wb-mode';btn.dataset.wbMode=mode;const label=document.createElement('b');label.textContent=title;const sub=document.createElement('small');sub.textContent=done+' из '+eligible.length+' слов · по '+limit+' за этап';const meter=document.createElement('span');meter.className='wb-meter';const fill=document.createElement('i');fill.style.width=(eligible.length?Math.round(done/eligible.length*100):0)+'%';meter.append(fill);
  btn.append(label,sub,meter);btn.addEventListener('click',()=>play(b,mode,limit));modes.append(btn)}}
function setOpen(on){panel.classList.toggle('open',on);toggle.setAttribute('aria-expanded',String(on));body.inert=!on;toggle.firstChild.textContent=on?'Свернуть ':'Выбрать игру '}
function play(b,mode,limit){const eligible=eligibleFor(lexical(b),mode);if(!eligible.length)return;const k=key(b.grade,mode),seen=new Set(read(k));let remaining=eligible.filter(w=>!seen.has(w.id));if(!remaining.length){seen.clear();write(k,[]);remaining=eligible.slice()}
 const prioritized=remaining.sort((a,z)=>{const pa=typeof getProgress==='function'?getProgress(a):{},pz=typeof getProgress==='function'?getProgress(z):{};return (pz.wrong||0)-(pa.wrong||0)});const batch=prioritized.slice(0,limit);
 if(batch.length<2&&['quiz','pairs','truefalse'].includes(mode)){const extra=eligible.filter(w=>!batch.some(x=>x.id===w.id)).slice(0,2-batch.length);batch.push(...extra)}
 if(mode==='boss'&&batch.length<3)return;
 active={grade:b.grade,mode,ids:new Set(batch.map(w=>w.id))};setOpen(false);
 const types=mode==='crystals'?['quiz','truefalse','fix']:undefined;
 window.LexigoWholeBook.current={grade:b.grade,mode};
 start(mode,batch,types)}
const originalRecord=record;record=function(w,ok,skill){originalRecord(w,ok,skill);if(!active||!w||!active.ids.has(w.id))return;const k=key(active.grade,active.mode);const seen=new Set(read(k));seen.add(w.id);write(k,[...seen]);};
toggle.addEventListener('click',()=>{const on=!panel.classList.contains('open');if(on)render();setOpen(on);if(on)setTimeout(()=>panel.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'}),360)});
window.addEventListener('hashchange',()=>{if(panel.classList.contains('open'))render()});
document.querySelectorAll('[data-mode],#quickStart').forEach(el=>el.addEventListener('click',()=>{active=null;window.LexigoWholeBook.current=null}));
window.LexigoWholeBook={current:null,render};
})();
