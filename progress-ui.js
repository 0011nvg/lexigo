window.LexigoDashboard=(()=>{
 const icons={home:'M3.5 10.5 12 3.7l8.5 6.8v9a1 1 0 0 1-1 1h-5v-6h-5v6h-5a1 1 0 0 1-1-1z',games:'M7.4 7.5h9.2c2.1 0 3.3 1.6 3.8 3.8l1.1 4.7c.5 2.2-1.4 3.7-3.2 2.2l-2.5-2H8.2l-2.5 2c-1.8 1.5-3.7 0-3.2-2.2l1.1-4.7c.5-2.2 1.7-3.8 3.8-3.8zM7.5 10v4M5.5 12h4M16 11h.01M18 13h.01',awards:'M8 3.5h8v4.3a4 4 0 0 1-8 0zM8 5H4.5v1.5c0 2.4 1.5 4 4 4M16 5h3.5v1.5c0 2.4-1.5 4-4 4M12 12v4.5M8 20h8M9.5 16.5h5',profile:'M12 12a4.3 4.3 0 1 0 0-8.6 4.3 4.3 0 0 0 0 8.6zM4.5 20.5v-1a7.5 7.5 0 0 1 15 0v1'};
 const icon=id=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="'+icons[id]+'"/></svg>';
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
   const grid=el('div',undefined,'dashboard-games');for(const [key,name] of Object.entries(modes)){const a=link(name,lessonPath+'/play/'+key,'dashboard-game');const i=el('span',undefined,'mode-symbol');i.innerHTML=icon(key==='crystals'||key==='boss'?'awards':'games');a.prepend(i);grid.append(a)}host.append(grid);return;
  }
  host.append(el('p','Свободная практика на этом устройстве. Это не подтверждённая школьная оценка.','dashboard-note'));
  if(page==='profile'){
   const stats=el('div',undefined,'progress-stats');stats.append(tile(s.practiced,'слов в практике'),tile(s.correct,'слов с верным ответом'),tile(s.recalled,'слов написал дважды'));host.append(stats);
   host.append(el('h2','Мои учебники'));for(const b of s.courses){const row=el('article',undefined,'course-progress');row.append(el('h3','Spotlight '+b.grade),el('p',b.practiced+' из '+b.total+' слов в практике'));const bar=el('progress');bar.max=b.total;bar.value=b.practiced;bar.setAttribute('aria-label','Слова в практике Spotlight '+b.grade);row.append(bar,link('Открыть учебник','/course/'+b.grade+'/0','text-button'));host.append(row)}
   if(!s.practiced)host.append(el('p','Начни первую тренировку — здесь появятся твои результаты.','dashboard-note'));
   host.append(link('К тренировкам','/games','btn dashboard-cta'));
  }else{
   const balance=el('div',undefined,'crystal-balance');balance.append(el('strong',String(s.crystals)),el('h2','Кристаллы за слова'),el('p','1 за первый правильный ответ для каждого слова. Ещё 2 — когда напишешь это слово правильно дважды без подсказки.'));host.append(balance);
   const grid=el('div',undefined,'award-grid');for(const a of s.awards){const card=el('article',undefined,'award-card'+(a.earned?' earned':''));const badge=el('span',undefined,'award-symbol');badge.innerHTML=icon('awards');card.append(badge,el('h2',a.name),el('p',a.rule),el('strong',a.earned?'Получено':Math.min(a.value,a.goal)+' / '+a.goal));grid.append(card)}host.append(grid);
   host.append(el('p','Награды рассчитываются по сохранённым результатам. Повторение одного слова не добавляет эту награду заново.','dashboard-note'));
  }
  host.append(el('p',(window.LexigoAccountHint&&window.LexigoAccountHint.uid())?'Прогресс сохраняется в твоём аккаунте и доступен на любом устройстве после входа.':'Прогресс сохраняется на этом устройстве. Войди в аккаунт, чтобы он не потерялся и был доступен везде.','dashboard-note'));
 }
 return Object.freeze({sync,render});
})();
