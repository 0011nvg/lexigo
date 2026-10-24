/* Screen routes share the existing practice engine. Hash URLs work on static hosts
 * without server rewrite rules; no grade/module/game implementation is duplicated. */
(()=>{'use strict';
 const byId=id=>document.getElementById(id),make=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n};
 const modeNames={cards:'Карточки',quiz:'Выбери перевод',spell:'Напиши слово',pairs:'Найди пару',truefalse:'Верно / неверно',fix:'Исправь ошибку',audio:'Аудиодиктант',crystals:'Кристаллы',boss:'Финальный тест',mixed:'Тренировка дня'};
 const originalStart=start,originalStop=stop;let applying=false,lastURL='',currentCourse=DB.books[0],moduleIndex=0;
 const modules=b=>[...new Set(b.sections.map(s=>s.module))];
 const currentKey=()=>unit==='__all'?'m'+modules(book).indexOf(mod):String(unit);
 const lessonPath=()=>'/lesson/'+book.grade+'/'+currentKey();
 const coursePath=()=>'/course/'+book.grade+'/'+modules(book).indexOf(mod);
 function link(label,path,className=''){const a=make('a',label);a.href='#'+path;a.className=className;return a}
 function focusPage(){const target=document.querySelector('[data-route-active] h1')||byId('gameTitle');target?.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'})}
 function show(page){
  document.body.dataset.page=page;
  for(const [id,on] of Object.entries({homePage:page==='home',coursePage:page==='course',learningArea:['lesson','words','teacher','play'].includes(page),lessonHeading:['lesson','words','teacher'].includes(page),catalogAside:['words','teacher'].includes(page),launcher:page==='lesson',teacherPage:page==='teacher',game:page==='play'})){
   const node=byId(id);node.hidden=!on;if(id==='launcher'||id==='game')node.classList.toggle('hidden',!on);node.toggleAttribute('data-route-active',on&&['homePage','coursePage','lessonHeading','game'].includes(id));
  }
  if(byId('serverWorkspace'))byId('serverWorkspace').hidden=page!=='cabinet';
  byId('serverGamesOpen').setAttribute('aria-expanded',String(page==='cabinet'));
  document.body.classList.toggle('teacher-mode',page==='teacher');
  byId('roleSwitch').setAttribute('aria-pressed',String(page==='teacher'));byId('roleSwitch').textContent=page==='teacher'?'К тренировкам':'Для учителя';
 }
 function crumbs(parts){const nav=byId('breadcrumbs');nav.replaceChildren(link('Учебники','/home'));for(const [label,path] of parts){nav.append(make('span','/'));if(path)nav.append(link(label,path));else{const here=make('span',label);here.setAttribute('aria-current','page');nav.append(here)}}nav.hidden=!parts.length}
 function context(grade,key){
  const b=DB.books.find(b=>String(b.grade)===grade);if(!b)return false;
  const group=/^m\d+$/.test(key)?Number(key.slice(1)):null,index=/^\d+$/.test(key)?Number(key):null;
  if(group!==null&&!modules(b)[group]||group===null&&(index===null||!b.sections[index]?.words.length))return false;
  const wantedModule=group!==null?modules(b)[group]:b.sections[index].module,wantedUnit=group!==null?'__all':String(index);
  if(book?.grade!==b.grade||mod!==wantedModule||unit!==wantedUnit){byId('search').value='';byId('book').value=String(b.grade);changeBook();byId('module').value=wantedModule;changeModule();byId('unit').value=wantedUnit;changeUnit()}
  return true;
 }
 function lessonCrumbs(tail){const title=unit==='__all'?'Все слова модуля':book.sections[Number(unit)].title;const parts=[['Spotlight '+book.grade,coursePath()],[title,tail?lessonPath():null]];if(tail)parts.push([tail,null]);crumbs(parts)}
 function lessonCopy(){byId('currentLesson').textContent=unit==='__all'?mod:book.sections[Number(unit)].title;byId('currentLessonDetail').textContent='Spotlight '+book.grade+' · '+mod+' · '+scope.length+' слов';byId('lessonEyebrow').textContent='SPOTLIGHT '+book.grade;}
 function course(grade,index){
  currentCourse=DB.books.find(b=>String(b.grade)===grade)||DB.books[0];const ms=modules(currentCourse);moduleIndex=Number.isInteger(Number(index))&&ms[Number(index)]?Number(index):0;
  byId('courseTitle').textContent='Spotlight '+currentCourse.grade;byId('courseSubtitle').textContent=currentCourse.sections.reduce((n,s)=>n+s.words.length,0)+' слов · Выбери модуль и урок';
  byId('courseTabs').replaceChildren(...DB.books.map(b=>{const a=link('Spotlight '+b.grade,'/course/'+b.grade+'/0');if(b===currentCourse)a.setAttribute('aria-current','page');return a}));
  byId('moduleTabs').replaceChildren(...ms.map((m,i)=>{const a=link(m,'/course/'+currentCourse.grade+'/'+i);if(i===moduleIndex)a.setAttribute('aria-current','page');return a}));
  byId('moduleTitle').textContent=ms[moduleIndex];const cards=byId('lessonCards');cards.replaceChildren();
  function add(title,subtitle,key,number){const a=link('','/lesson/'+currentCourse.grade+'/'+key,'lesson-card');const num=make('span',number);num.className='lesson-number';const label=make('span');label.append(make('strong',title),make('small',subtitle));a.append(num,label,make('span','→'));cards.append(a)}
  add('Все слова модуля','Общая тренировка по разделу','m'+moduleIndex,'↗');
  let number=0;currentCourse.sections.forEach((s,i)=>{if(s.module===ms[moduleIndex]&&s.words.length)add(s.title,s.words.length+' слов',String(i),String(++number).padStart(2,'0'))});
  crumbs([['Spotlight '+currentCourse.grade,null]]);document.title='Spotlight '+currentCourse.grade+' — LEXIGO';
 }
 function navigate(path,{replace=false}={}){history[replace?'replaceState':'pushState']({},'','#'+path);render()}
 function render(){
  const route=location.hash.slice(1)||'/home';if(lastURL===route)return;lastURL=route;applying=true;
  try{
   if(game)originalStop();const parts=route.split('/').filter(Boolean);
   if(parts[0]==='lesson'&&context(parts[1],parts[2])){
    const mode=parts[3]==='play'?parts[4]:null;const page=mode&&Object.hasOwn(modeNames,mode)?'play':['words','teacher'].includes(parts[3])?parts[3]:'lesson';
    show(page);lessonCopy();lessonCrumbs(page==='lesson'?null:page==='words'?'Слова':page==='teacher'?'Материалы':modeNames[mode]);
    if(page==='play'){if(mode==='mixed')quickStart();else originalStart(mode);if(!game){lastURL='';history.replaceState({},'','#'+lessonPath());render();return}byId('game').hidden=false;byId('gameTitle').textContent=modeNames[mode]}
    document.title=(page==='play'?modeNames[mode]:byId('currentLesson').textContent)+' — LEXIGO';
   }else if(parts[0]==='course'){show('course');course(parts[1],parts[2])}
   else if(parts[0]==='cabinet'&&byId('serverWorkspace')){show('cabinet');crumbs([['Кабинет',null]]);document.title='Кабинет — LEXIGO'}
   else{show('home');crumbs([]);document.title='LEXIGO — английский по шагам';if(route!=='/home'){history.replaceState({},'','#/home');lastURL='/home'}}
  }finally{applying=false}focusPage();
 }
 start=function(...args){originalStart(...args);if(!applying&&game){const path=lessonPath()+'/play/'+game.mode;history.pushState({},'','#'+path);lastURL=path;show('play');lessonCrumbs(modeNames[game.mode]);byId('gameTitle').textContent=modeNames[game.mode];document.title=modeNames[game.mode]+' — LEXIGO';focusPage()}};
 stop=function(){originalStop();if(!applying&&document.body.dataset.page==='play')navigate(lessonPath())};
 goHome=()=>navigate('/home');goToLibrary=()=>navigate('/course/'+book.grade+'/'+modules(book).indexOf(mod));
 for(const id of ['homeLogo','homeNav','gameHome'])byId(id).onclick=goHome;
 byId('heroStart').onclick=goToLibrary;byId('changeLesson').onclick=goToLibrary;byId('back').onclick=()=>stop();
 byId('openWords').onclick=()=>navigate(lessonPath()+'/words');byId('wordsDone').onclick=()=>navigate(lessonPath());
 byId('lessonPrint').onclick=()=>navigate(lessonPath()+'/teacher');byId('roleSwitch').onclick=()=>navigate(lessonPath()+(document.body.dataset.page==='teacher'?'':'/teacher'));
 byId('serverGamesOpen').onclick=()=>navigate('/cabinet');
 for(const [id,handler] of [['book',changeBook],['module',changeModule],['unit',changeUnit]])byId(id).onchange=()=>{applying=true;try{handler()}finally{applying=false}navigate(lessonPath()+'/'+(document.body.dataset.page==='teacher'?'teacher':'words'),{replace:true})};
 const courseCards=byId('courseCards');for(const b of DB.books){const a=link('','/course/'+b.grade+'/0','course-card grade-'+b.grade);const cover=make('div');cover.className='course-cover';cover.append(make('span','SPOTLIGHT'),make('b',String(b.grade)),make('small','ENGLISH PRACTICE'));const caption=make('div');caption.className='course-caption';caption.append(make('h3','Spotlight '+b.grade),make('p',b.sections.reduce((n,s)=>n+s.words.length,0)+' слов · '+b.grade+' класс'),make('span','Открыть учебник →'));a.append(cover,caption);courseCards.append(a)}
 document.querySelector('.skip-link').onclick=event=>{event.preventDefault();byId('pageContent').focus()};
 document.addEventListener('click',event=>{const a=event.target.closest('a[href^="#/"]');if(!a||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();navigate(a.getAttribute('href').slice(1))});
 window.addEventListener('popstate',render);window.addEventListener('hashchange',render);
 // Preserve the authorized assignment flow; only opaque assignment IDs stay in
 // the query string. Switching screens never clears the in-memory Auth session.
 if(new URLSearchParams(location.search).has('assignment')&&byId('serverWorkspace'))history.replaceState({},'','#/cabinet');
 byId('homeTitle').tabIndex=-1;
 const restartNote=make('p','Свободная тренировка · после обновления страницы начнётся заново.');restartNote.className='progress-note';byId('game').append(restartNote);
 if(game){history.replaceState({},'','#'+lessonPath()+'/play/'+game.mode);lastURL=location.hash.slice(1);show('play');lessonCrumbs(modeNames[game.mode])}else render();
})();
