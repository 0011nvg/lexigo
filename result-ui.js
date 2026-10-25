/* Presentation only: preserve the original engine's scoring and attempt saving. */
window.LexigoResults=(()=>{
 const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
 const summary=()=>LexigoProgress.summarize(DB.books,progress);
 const oldStart=start,oldFinish=finish;
 start=function(...args){const before=summary(),previous=game;oldStart(...args);if(game&&game!==previous)game.rewardBaseline=before};
 const metric=(value,label,cls='')=>{const e=el('div',undefined,'result-metric '+cls);e.append(el('strong',String(value)),el('span',label));return e};
 function decorate(g,time,pairs=false){
  if(!g||g!==game)return;
  const play=document.getElementById('play');play.querySelector('.lesson-result')?.remove();
  const now=summary(),baseline=g.rewardBaseline;
  // Snapshot once; rerendering a completion never mints or re-awards anything.
  if(!g.resultRewards)g.resultRewards={crystals:baseline?Math.max(0,now.crystals-baseline.crystals):0,awards:baseline?now.awards.filter(a=>a.earned&&!baseline.awards.find(b=>b.id===a.id)?.earned):[]};
  const reward=g.resultRewards,card=el('section',undefined,'lesson-result');card.setAttribute('aria-labelledby','resultHeading');
  const picture=el('img');picture.src='assets/mascot-result.webp';picture.alt='';picture.width=240;picture.height=240;picture.className='result-mascot';card.append(picture);
  const heading=el('h2',pairs?'Все пары найдены!':g.mode==='cards'?'Карточки пройдены!':g.mode==='boss'?(finalTestPassed(g)?'Финальный тест пройден!':'Продолжай тренироваться!'):'Тренировка завершена!');heading.id='resultHeading';heading.tabIndex=-1;card.append(heading);
  card.append(el('p',g.mode==='cards'?'Ты повторил слова и оценил, что помнишь.':g.mode==='boss'&&!finalTestPassed(g)?'Повтори трудные слова и попробуй ещё раз.':'Каждый шаг помогает лучше запомнить слова.','result-subtitle'));
  const total=Math.max(0,g.words.length-(g.retries||0)),stats=el('div',undefined,'result-metrics');
  stats.append(metric(pairs?g.matched+' / '+g.words.length:g.mode==='cards'?Math.min(g.index,g.words.length):g.firstCorrect+' / '+total,pairs?'пар найдено':g.mode==='cards'?'карточек просмотрено':'верно с первого раза'));
  stats.append(metric('+'+reward.crystals,'кристаллов за слова','result-earned'),metric(Math.floor(time/60)+':'+String(Math.floor(time%60)).padStart(2,'0'),'время тренировки'));card.append(stats);
  if(!reward.crystals)card.append(el('p',g.mode==='cards'?'Самооценка не начисляет кристаллы. Попробуй режим «Напиши слово».':'Новые кристаллы появятся за новые слова или самостоятельное написание.','result-note'));
  if(reward.awards.length){const awards=el('div',undefined,'result-awards');awards.append(el('h3','Новые достижения'));for(const a of reward.awards)awards.append(el('span',a.name,'result-award'));card.append(awards)}
  if(pairs)card.append(el('p','Ошибок при подборе: '+g.pairMistakes,'result-note'));
  if(g.mode==='cards')card.append(el('p','Это самооценка, а не проверка правильности ответов.','result-note'));
  const old=play.querySelector(pairs?'.pair-finish':'.question');
  if(old){if(g.mode==='cards'){old.replaceChildren(el('p','Повтори слова в игровом режиме, чтобы проверить себя.'))}const details=el('details',undefined,'result-details');details.append(el('summary','Подробнее о результате'),old);card.append(details)}
  play.prepend(card);
  const buttons=el('div',undefined,'result-actions');for(const b of [...play.children].filter(n=>n.tagName==='BUTTON'))buttons.append(b);if(pairs)buttons.append(action('К выбору режима',stop,'btn secondary'));card.append(buttons);
  const awardsLink=el('a','Мои награды','result-awards-link');awardsLink.href='#/awards';card.append(awardsLink);
  if(pairs){play.querySelector('.pair-grid')?.setAttribute('hidden','');play.querySelector('.pair-hud')?.setAttribute('hidden','');play.querySelector('.pair-instruction')?.setAttribute('hidden','')}
  heading.focus({preventScroll:true});card.scrollIntoView({block:'start',behavior:'instant'});
 }
 finish=function(){if(!game)return;const g=game;oldFinish();decorate(g,seconds)};
 return Object.freeze({decorate});
})();
