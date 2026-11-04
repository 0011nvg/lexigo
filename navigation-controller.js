/* Screen routes share the existing practice engine. Hash URLs work on static hosts
 * without server rewrite rules; no grade/module/game implementation is duplicated. */
(()=>{'use strict';
 const byId=id=>document.getElementById(id),make=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n};
 const modeNames={cards:'Карточки',quiz:'Выбери перевод',spell:'Напиши слово',pairs:'Найди пару',truefalse:'Верно / неверно',fix:'Исправь ошибку',audio:'Аудиодиктант',crystals:'Кристальная экспедиция',boss:'Финальный тест',mixed:'Тренировка дня',builder:'Конструктор слов',listen:'Слушай и выбирай',review:'Работа над ошибками'};
 const originalStart=start,originalStop=stop;let applying=false,revealWords=false,lastURL='',currentCourse=DB.books[0],moduleIndex=0;
 /* 2026-11-02 v2: уроки от учителя и свои уроки учителя — полноценные страницы #/my/a-<задание> и #/my/t-<урок>
    (my-lessons.js). Старые ссылки index.html?task=<id> и ?lesson=<id> переводятся на них. */
 let custom=null;const MY_KEY=/^[at]-[0-9a-f-]{36}$/i;
 (()=>{const q=new URLSearchParams(location.search),t=q.get('task'),l=q.get('lesson'),id=t||l;if(id&&/^[0-9a-f-]{36}$/i.test(id)){q.delete('task');q.delete('lesson');const rest=q.toString();history.replaceState({},'',location.pathname+(rest?'?'+rest:'')+'#/my/'+(t?'a-':'t-')+id)}})();
 const modules=b=>[...new Set(b.sections.map(s=>s.module))];
 const currentKey=()=>unit==='__all'?'m'+modules(book).indexOf(mod):String(unit);
 const lessonPath=()=>'/lesson/'+book.grade+'/'+currentKey();
 const coursePath=()=>'/course/'+book.grade+'/'+modules(book).indexOf(mod);
 function link(label,path,className=''){const a=make('a',label);a.href=path.startsWith('/')?'#'+path:path;a.className=className;return a}
 function focusPage(){const target=document.querySelector('[data-route-active] h1')||byId('gameTitle');target?.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'})}
 function show(page){
  document.body.dataset.page=page;
  LexigoDashboard.sync(page);
  for(const [id,on] of Object.entries({myLessonPage:page==='mylesson',homePage:page==='home',coursePage:page==='course',learningArea:['lesson','words','teacher','play'].includes(page),lessonHeading:['lesson','words','teacher'].includes(page),catalogAside:['words','teacher'].includes(page),launcher:page==='lesson',teacherPage:page==='teacher',game:page==='play'})){
   const node=byId(id);node.hidden=!on;if(id==='launcher'||id==='game')node.classList.toggle('hidden',!on);node.toggleAttribute('data-route-active',on&&['myLessonPage','homePage','coursePage','lessonHeading','game'].includes(id));
  }

  /* 2026-11-04: один список слов. На странице урока он стоит в «Словах урока» (#lessonWords),
     в «Материалах для учителя» — в каталоге, как раньше. Узел один: те же обработчики и данные. */
  const ws=byId('wordSelection'),done=byId('wordsDone'),host=byId('lessonWordsBody');
  if(ws&&host){if(page==='lesson'){if(ws.parentNode!==host)host.append(ws,done)}else if(ws.parentNode===host)byId('sectionHint').after(ws,done)}
  document.body.classList.toggle('teacher-mode',page==='teacher');
  byId('roleSwitch').setAttribute('aria-pressed',String(page==='teacher'));byId('roleSwitch').textContent=page==='teacher'?'К тренировкам':'Для учителя';
 }
 function crumbs(parts){const nav=byId('breadcrumbs');nav.replaceChildren(link('Уроки','/home'));for(const [label,path] of parts){nav.append(make('span','/'));if(path)nav.append(link(label,path));else{const here=make('span',label);here.setAttribute('aria-current','page');nav.append(here)}}nav.hidden=!parts.length}
 function context(grade,key){
  const b=DB.books.find(b=>String(b.grade)===grade);if(!b)return false;
  const group=/^m\d+$/.test(key)?Number(key.slice(1)):null,index=/^\d+$/.test(key)?Number(key):null;
  if(group!==null&&!modules(b)[group]||group===null&&(index===null||!b.sections[index]?.words.length))return false;
  const wantedModule=group!==null?modules(b)[group]:b.sections[index].module,wantedUnit=group!==null?'__all':String(index);
  if(book?.grade!==b.grade||mod!==wantedModule||unit!==wantedUnit){byId('search').value='';byId('book').value=String(b.grade);changeBook();byId('module').value=wantedModule;changeModule();byId('unit').value=wantedUnit;changeUnit()}
  return true;
 }
 function lessonCrumbs(tail){const title=unit==='__all'?'Все слова модуля':book.sections[Number(unit)].title;const parts=[[book.grade+' класс',coursePath()],[title,tail?lessonPath():null]];if(tail)parts.push([tail,null]);crumbs(parts)}
 function lessonCopy(){byId('currentLesson').textContent=unit==='__all'?mod:book.sections[Number(unit)].title;byId('currentLessonDetail').textContent=book.grade+' класс'+' · '+mod+' · '+scope.length+' слов';byId('lessonEyebrow').textContent=book.grade+' КЛАСС';}
 function course(grade,index){
  currentCourse=DB.books.find(b=>String(b.grade)===grade)||DB.books[0];const ms=modules(currentCourse);moduleIndex=Number.isInteger(Number(index))&&ms[Number(index)]?Number(index):0;
  byId('courseTitle').textContent=currentCourse.grade+' класс';byId('courseSubtitle').textContent=currentCourse.sections.reduce((n,s)=>n+s.words.length,0)+' слов · Выбери модуль и урок';
  byId('courseTabs').replaceChildren(...DB.books.map(b=>{const a=link(b.grade+' класс','/course/'+b.grade+'/0');if(b===currentCourse)a.setAttribute('aria-current','page');return a}));
  byId('moduleTabs').replaceChildren(...ms.map((m,i)=>{const a=link(m,'/course/'+currentCourse.grade+'/'+i);if(i===moduleIndex)a.setAttribute('aria-current','page');return a}));
  byId('moduleTitle').textContent=ms[moduleIndex];const cards=byId('lessonCards');cards.replaceChildren();
  function add(title,subtitle,key,number){const a=link('','/lesson/'+currentCourse.grade+'/'+key,'lesson-card');const num=make('span',number);num.className='lesson-number';const label=make('span');label.append(make('strong',title),make('small',subtitle));a.append(num,label,make('span','→'));cards.append(a)}
  add('Все слова модуля','Общая тренировка по разделу','m'+moduleIndex,'↗');
  let number=0;currentCourse.sections.forEach((s,i)=>{if(s.module===ms[moduleIndex]&&s.words.length)add(s.title,s.words.length+' слов',String(i),String(++number).padStart(2,'0'))});
  crumbs([[currentCourse.grade+' класс',null]]);document.title=currentCourse.grade+' класс'+' — LEXI';
 }
 function navigate(path,{replace=false}={}){history[replace?'replaceState':'pushState']({},'','#'+path);render()}
 function render(){
  const route=location.hash.slice(1)||'/home';if(lastURL===route)return;lastURL=route;applying=true;
  try{
   if(game)originalStop();const parts=route.split('/').filter(Boolean);
   if(parts[0]!=='my')custom=null;
   if(parts[0]==='my'&&MY_KEY.test(parts[1]||'')){
    const ML=window.LexigoMyLessons,mode=parts[2]==='play'&&Object.hasOwn(modeNames,parts[3])?parts[3]:null;
    if(mode){show('play');byId('gameTitle').textContent=modeNames[mode];document.title=modeNames[mode]+' — LEXI';ML?.play(parts[1],mode)}
    else{show('mylesson');ML?.open(parts[1],{games:parts[2]==='games'})}
    if(!ML)byId('myLessonPage').replaceChildren(make('p','Загружаем урок…'));
    return;
   }
   if(parts[0]!=='book'&&window.LexigoWholeBook)window.LexigoWholeBook.current=null;
   if(parts[0]==='book'){
    const g=parts[1],mode=parts[2]==='play'&&Object.hasOwn(modeNames,parts[3])?parts[3]:null,known=DB.books.some(b=>String(b.grade)===g);
    if(known&&mode&&window.LexigoWholeBook){show('play');window.LexigoWholeBook.play(g,mode);
     if(game&&wholeBook()&&String(wholeBook().grade)===g){byId('game').hidden=false;byId('gameTitle').textContent=modeNames[mode];bookCrumbs(g,mode);document.title=modeNames[mode]+' · '+g+' класс'+' — LEXI';return}}
    if(known&&mode&&!window.LexigoWholeBook)return; /* whole-book.js ещё загружается — он сам перерисует маршрут */
    lastURL='';history.replaceState({},'','#'+(known?'/course/'+g+'/0':'/home'));render();return;
   }
   if(parts[0]==='lesson'&&context(parts[1],parts[2])){
    /* 2026-11-04: отдельной страницы «Слова» больше нет — старые ссылки …/words открывают урок на словаре */
    if(parts[3]==='words'){revealWords=true;history.replaceState({},'','#'+lessonPath());lastURL=lessonPath();parts.length=3}
    const mode=parts[3]==='play'?parts[4]:null;const page=mode&&Object.hasOwn(modeNames,mode)?'play':parts[3]==='teacher'?'teacher':'lesson';
    show(page);lessonCopy();lessonCrumbs(page==='lesson'?null:page==='teacher'?'Материалы':modeNames[mode]);
    if(page==='play'){if(mode==='mixed')quickStart();else originalStart(mode,null,mode==='boss'&&window.LexigoPlus?window.LexigoPlus.bossTypes():undefined);if(!game){lastURL='';history.replaceState({},'','#'+lessonPath());render();return}byId('game').hidden=false;byId('gameTitle').textContent=modeNames[mode]}
    document.title=(page==='play'?modeNames[mode]:byId('currentLesson').textContent)+' — LEXI';
   }else if(['games','awards','profile'].includes(parts[0])){const page=parts[0];show(page);crumbs([]);LexigoDashboard.render(page,lessonPath(),book.grade+' класс'+' · '+(unit==='__all'?mod:book.sections[Number(unit)].title),modeNames);document.title=({games:'Игры',awards:'Награды',profile:'Профиль'}[page])+' — LEXI';}
   else if(parts[0]==='course'&&DB.books.some(b=>String(b.grade)===parts[1])){show('course');course(parts[1],parts[2])}

   else{show('home');crumbs([]);document.title='LEXI — английский по шагам';if(route!=='/home'){history.replaceState({},'','#/home');lastURL='/home'}}
  }finally{applying=false}focusPage();
  if(revealWords){revealWords=false;if(document.body.dataset.page==='lesson'){if(window.LexigoLessonWords)window.LexigoLessonWords.reveal();else window.LEXI_REVEAL_WORDS=true}}
 }
 start=function(...args){originalStart(...args);if(!applying&&game){const wb=wholeBook();const path=wb?'/book/'+wb.grade+'/play/'+game.mode:(custom?'/my/'+custom.key:lessonPath())+'/play/'+game.mode;history[location.hash==='#'+path?'replaceState':'pushState']({},'','#'+path);lastURL=path;show('play');if(wb)bookCrumbs(wb.grade,game.mode);else if(custom)crumbs([...custom.crumbs,[modeNames[game.mode],null]]);else lessonCrumbs(modeNames[game.mode]);byId('gameTitle').textContent=modeNames[game.mode];document.title=modeNames[game.mode]+' — LEXI';focusPage()}};
 stop=function(){const wb=wholeBook();originalStop();if(!applying&&document.body.dataset.page==='play')navigate(wb?'/course/'+wb.grade+'/0':custom?'/my/'+custom.key:lessonPath())};
 /* 2026-11-03: «Весь учебник» — свой адрес #/book/<класс>/play/<игра>: учебник берётся из адреса, а не из последнего открытого урока */
 function wholeBook(){const w=window.LexigoWholeBook&&window.LexigoWholeBook.current;return w&&DB.books.some(b=>String(b.grade)===String(w.grade))?w:null}
 function bookCrumbs(g,mode){crumbs([[g+' класс','/course/'+g+'/0'],['Весь учебник · '+modeNames[mode],null]])}
 /* для страниц уроков учителя (my-lessons.js) */
 window.LexigoNav=Object.freeze({navigate,crumbs,show,focusPage,setCustom(ctx){custom=ctx||null},custom:()=>custom,refresh(){lastURL='';render()}});
 goHome=()=>navigate('/home');goToLibrary=()=>navigate('/course/'+book.grade+'/'+modules(book).indexOf(mod));
 for(const id of ['homeLogo','homeNav','gameHome'])byId(id).onclick=goHome;
 byId('heroStart').onclick=goToLibrary;byId('changeLesson').onclick=goToLibrary;byId('back').onclick=()=>stop();
 byId('openWords').onclick=()=>window.LexigoLessonWords?window.LexigoLessonWords.reveal():navigate(lessonPath());byId('wordsDone').onclick=()=>window.LexigoLessonWords&&document.body.dataset.page==='lesson'?window.LexigoLessonWords.toGames():navigate(lessonPath());
 byId('lessonPrint').onclick=()=>navigate(lessonPath()+'/teacher');byId('roleSwitch').onclick=()=>navigate(lessonPath()+(document.body.dataset.page==='teacher'?'':'/teacher'));

 for(const [id,handler] of [['book',changeBook],['module',changeModule],['unit',changeUnit]])byId(id).onchange=()=>{applying=true;try{handler()}finally{applying=false}navigate(lessonPath()+(document.body.dataset.page==='teacher'?'/teacher':''),{replace:true})};
 const courseCards=byId('courseCards');for(const b of DB.books){const a=link('','/course/'+b.grade+'/0','course-card grade-'+b.grade);const cover=make('div');cover.className='course-cover';cover.append(make('span',String(b.grade)+' КЛАСС'),make('b',String(b.grade)),make('small','ENGLISH PRACTICE'));const scene=make('div');scene.className='travel-scene';scene.setAttribute('aria-hidden','true');const place=make('span');place.className='travel-landmark landmark-'+b.grade;const mascot=make('span');mascot.className='travel-cat mascot-'+b.grade;const badge=make('span',({2:'LONDON',3:'NEW YORK',4:'SYDNEY'}[b.grade]||'WORDS & GAMES'));badge.className='travel-city';scene.append(place,mascot,badge);cover.append(scene);const caption=make('div');caption.className='course-caption';caption.append(make('h3',b.grade+' класс'),make('p',b.sections.reduce((n,s)=>n+s.words.length,0)+' слов'),make('span','Открыть учебник →'));a.append(cover,caption);courseCards.append(a)}
 // Будущие классы видны в каталоге, но не открывают несуществующий учебник.
 for(const grade of [10,11]){if(DB.books.some(b=>Number(b.grade)===grade))continue;const card=make('div');card.className='course-card teen grade-'+grade+' course-coming';const caption=make('div');caption.className='course-caption';caption.append(make('h3',grade+' класс'),make('p','Слова появятся позже'),make('span','Скоро'));card.append(caption);courseCards.append(card)}
 document.querySelector('.skip-link').onclick=event=>{event.preventDefault();byId('pageContent').focus()};
 document.addEventListener('click',event=>{const a=event.target.closest('a[href^="#/"]');if(!a||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();navigate(a.getAttribute('href').slice(1))});
 window.addEventListener('popstate',render);window.addEventListener('hashchange',render);
 // Preserve the authorized assignment flow; only opaque assignment IDs stay in
 // the query string. Switching screens never clears the in-memory Auth session.

 byId('homeTitle').tabIndex=-1;
 const restartNote=make('p','Свободная тренировка · после обновления страницы начнётся заново.');restartNote.className='progress-note';byId('game').append(restartNote);
 if(game){history.replaceState({},'','#'+lessonPath()+'/play/'+game.mode);lastURL=location.hash.slice(1);show('play');lessonCrumbs(modeNames[game.mode])}else render();
})();
