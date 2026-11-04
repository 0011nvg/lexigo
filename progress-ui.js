window.LexigoDashboard=(()=>{
 const icons={home:'M3.5 10.5 12 3.7l8.5 6.8v9a1 1 0 0 1-1 1h-5v-6h-5v6h-5a1 1 0 0 1-1-1z',games:'M7.4 7.5h9.2c2.1 0 3.3 1.6 3.8 3.8l1.1 4.7c.5 2.2-1.4 3.7-3.2 2.2l-2.5-2H8.2l-2.5 2c-1.8 1.5-3.7 0-3.2-2.2l1.1-4.7c.5-2.2 1.7-3.8 3.8-3.8zM7.5 10v4M5.5 12h4M16 11h.01M18 13h.01',awards:'M8 3.5h8v4.3a4 4 0 0 1-8 0zM8 5H4.5v1.5c0 2.4 1.5 4 4 4M16 5h3.5v1.5c0 2.4-1.5 4-4 4M12 12v4.5M8 20h8M9.5 16.5h5',profile:'M12 12a4.3 4.3 0 1 0 0-8.6 4.3 4.3 0 0 0 0 8.6zM4.5 20.5v-1a7.5 7.5 0 0 1 15 0v1'};
 const icon=id=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="'+icons[id]+'"/></svg>';
 const gamePaths={
 cards:'<rect x="7" y="5" width="12" height="15" rx="2"/><path d="M5 8v11a2 2 0 0 0 2 2h9M10 10h6M10 13h4"/>',
 quiz:'<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8 12 2.5 2.5L16 9"/>',
 spell:'<path d="m5 19 3.5-.6L19 7.9 16.1 5 5.6 15.5 5 19Z"/><path d="m14.5 6.6 2.9 2.9M5 20h14"/>',
 pairs:'<rect x="3" y="7" width="7" height="10" rx="2"/><rect x="14" y="7" width="7" height="10" rx="2"/><path d="M10 12h4M7 10h0M17.5 10h0"/>',
 truefalse:'<circle cx="12" cy="12" r="9"/><path d="m6.5 12 2 2 3-4M14.5 10l3 4m0-4-3 4"/>',
 fix:'<path d="M5 5h9M5 9h6M5 13h4"/><path d="m12 17 1-.2 6.2-6.2-2-2L11 14.8 10.8 17H12ZM5 19h14"/>',
 audio:'<path d="M5 13v-1a7 7 0 0 1 14 0v1"/><rect x="4" y="12" width="3" height="6" rx="1.3"/><rect x="17" y="12" width="3" height="6" rx="1.3"/><path d="M10 17h4M10 20h4"/>',
 crystals:'<path d="M5 9 8.5 4h7L19 9l-7 11L5 9ZM5 9h14M8.5 4l3.5 5 3.5-5M12 9v11"/>',
 boss:'<path d="M8 5h8v3a4 4 0 0 1-8 0V5ZM8 6H5v2a3 3 0 0 0 3 3M16 6h3v2a3 3 0 0 1-3 3M12 12v4M8 19h8M9 16h6"/>',
 mixed:'<circle cx="12" cy="12" r="7"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/><path d="m9 12 2 2 4-4"/>',
 builder:'<rect x="3.5" y="4" width="7.5" height="7.5" rx="1.5"/><rect x="13" y="4" width="7.5" height="7.5" rx="1.5"/><rect x="8.25" y="13" width="7.5" height="7.5" rx="1.5"/><path d="m5.7 9 1.6-3 1.6 3M5.9 8.3h2.8M15 9V6h1.2c1 0 1 .9.4 1.3.8.3.7 1.7-.4 1.7H15Z"/>',
 listen:'<path d="M4 9.5h3.2L11.5 6v12l-4.3-3.5H4z"/><path d="M15 9.2a4 4 0 0 1 0 5.6M17.7 6.6a7.6 7.6 0 0 1 0 10.8"/>',
 review:'<path d="M19 8a7.5 7.5 0 1 0 .3 7M19 4v4h-4"/><path d="m9 12 2 2 4-4"/>'
 };
 const gameIcon=key=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(gamePaths[key]||gamePaths.quiz)+'</svg>';
 const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
 const link=(text,path,cls)=>{const a=el('a',text,cls);a.href='#'+path;return a};
 const host=el('section',undefined,'dashboard');host.id='dashboardPage';host.hidden=true;document.getElementById('pageContent').prepend(host);
 const nav=el('nav',undefined,'bottom-nav');nav.setAttribute('aria-label','Разделы LEXI');
 for(const [key,label] of Object.entries({home:'Главная',games:'Игры',awards:'Награды',profile:'Профиль'})){const a=link('', '/'+key);a.dataset.tab=key;a.innerHTML=icon(key);a.append(el('span',label));nav.append(a)}document.body.append(nav);
 function sync(page){host.hidden=!['games','awards','profile'].includes(page);host.toggleAttribute('data-route-active',!host.hidden);nav.hidden=page==='play';for(const a of nav.children){const active=a.dataset.tab===(['lesson','words'].includes(page)?'games':page==='course'?'home':page);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')}}
 function tile(value,label){const d=el('div',undefined,'progress-tile');d.append(el('strong',String(value)),el('span',label));return d}
 function render(page,lessonPath,lessonLabel,modes){
  const s=LexigoProgress.summarize(window.LEXIGO_DATA.books,LexigoLocalStorage.read('lexigo_progress_v1'));
  host.replaceChildren();const title=el('h1',{games:'Игры',awards:'Мои награды',profile:'Мой прогресс'}[page]);title.tabIndex=-1;host.append(title);
  if(page==='games'){
   const context=el('div',undefined,'dashboard-context');context.append(el('p',lessonLabel),link('Выбрать другой урок','/course/'+book.grade+'/0','text-button'));host.append(context);
   const grid=el('div',undefined,'dashboard-games');for(const [key,name] of Object.entries(modes)){const a=link(name,lessonPath+'/play/'+key,'dashboard-game');const i=el('span',undefined,'mode-symbol mode-symbol-'+key);i.innerHTML=gameIcon(key);a.prepend(i);grid.append(a)}host.append(grid);return;
  }
  host.append(el('p','Свободная практика на этом устройстве. Это не подтверждённая школьная оценка.','dashboard-note'));
  if(page==='profile'){
   const stats=el('div',undefined,'progress-stats');stats.append(tile(s.practiced,'слов в практике'),tile(s.correct,'слов в копилке'),tile(s.recalled,'слов написал дважды'));host.append(stats);host.append(el('p','В копилку попадает слово, на которое ты хотя бы раз ответил верно. «Написал дважды» — слово, которое ты дважды написал по памяти без подсказки.','dashboard-note'));
   host.append(el('h2','Мои учебники'));for(const b of s.courses){const row=el('article',undefined,'course-progress');row.append(el('h3',b.grade+' класс'),el('p',b.practiced+' из '+b.total+' слов в практике'));const bar=el('progress');bar.max=b.total;bar.value=b.practiced;bar.setAttribute('aria-label','Слова в практике: '+b.grade+' класс');row.append(bar,link('Открыть учебник','/course/'+b.grade+'/0','text-button'));host.append(row)}
   if(!s.practiced)host.append(el('p','Начни первую тренировку — здесь появятся твои результаты.','dashboard-note'));
   host.append(link('К тренировкам','/games','btn dashboard-cta'));
  }else{
   const balance=el('div',undefined,'crystal-balance');balance.append(el('strong',String(s.crystals)),el('h2','Кристаллы за слова'),el('p','1 за первый правильный ответ для каждого слова. Ещё 2 — когда напишешь это слово правильно дважды без подсказки.'));host.append(balance);
   const grid=el('div',undefined,'award-grid');for(const a of s.awards){const card=el('article',undefined,'award-card'+(a.earned?' earned':''));const badge=el('span',undefined,'award-symbol');badge.innerHTML=icon('awards');card.append(badge,el('h2',a.name),el('p',a.rule),el('strong',a.earned?'Получено':Math.min(a.value,a.goal)+' / '+a.goal));grid.append(card)}host.append(grid);
   host.append(el('p','Награды рассчитываются по сохранённым результатам. Повторение одного слова не добавляет эту награду заново.','dashboard-note'));
  }
  host.append(el('p',(window.LexigoAccountHint&&window.LexigoAccountHint.uid())?'Прогресс сохраняется в твоём аккаунте и доступен на любом устройстве после входа.':'Прогресс сохраняется на этом устройстве. Войди в аккаунт, чтобы он не потерялся и был доступен везде.','dashboard-note'));
 }
 /* 2026-11-04: one icon set — the lesson page (#launcher, and lessons cloned from it) takes the same icons as «Игры» */
 for(const b of document.querySelectorAll('#launcher .mode[data-mode], #launcher #quickStart')){const key=b.dataset.mode||'mixed',s=b.querySelector('.mode-symbol');if(s&&gamePaths[key])s.innerHTML=gameIcon(key)}
 return Object.freeze({sync,render,gameIcon});
})();
