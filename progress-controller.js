/* Read-only progress explorer shared by both cabinet entry points.
 * The server decides completion and mastery; this component only groups evidence. */
window.LexigoProgress=Object.freeze({async render({root,profile,rows}){
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n};
 const modes={quiz:'Выбери перевод',spell:'Напиши слово',truefalse:'Верно / неверно',fix:'Исправь ошибку',audio:'Аудиодиктант',pairs:'Найди пару',crystals:'Кристаллы',boss:'Финальный тест',cards:'Карточки',daily:'Тренировка дня'};
 // PostgREST caps responses. Read every page in a deterministic order instead of
 // silently dropping older results or the last 35 canonical vocabulary entries.
 async function all(table,query){const result=[];for(let offset=0;;offset+=500){const page=await rows(table,query+'&limit=500&offset='+offset);result.push(...page);if(page.length<500)return result}}
 const records=await all('lesson_attempt_progress','select=attempt_id,pupil_user_id,section_id,mode,total_words,covered_words,lesson_completed,ranking_eligible,accuracy_pct,duration_seconds,status&order=attempt_id.asc');
 const evidence=await all('lesson_word_progress','select=pupil_user_id,section_id,mode,word_id,practiced,mastered,clean_correct_attempts,self_rated_known&order=pupil_user_id.asc,section_id.asc,mode.asc,word_id.asc');
 const sections=await all('vocabulary_sections','select=id,title,grade,module&order=grade.asc,order_index.asc,id.asc');
 const vocabulary=await all('vocabulary_words','select=id,section_id,en,ru&order=id.asc');
 const pupils=profile.role==='teacher'?await all('profiles','select=user_id,display_name&role=eq.pupil&order=user_id.asc'):[profile];
 const panel=el('section');panel.dataset.learningProgress='true';panel.className='lesson-progress';
 panel.append(el('h4',profile.role==='teacher'?'Освоение слов моих учеников':'Мой прогресс по урокам'));
 panel.append(el('p','Пройдено — выполнены все слова урока и завершена попытка. Освоено — два верных ответа без подсказок и повторных попыток в двух завершённых занятиях одного режима. Учитывается только проверка сервера. Карточки и тренировка дня — самооценка.'));
 panel.append(el('p','Эта отметка показывает успешную практику, а не долговременное запоминание. Полезно вернуться к словам в другой день.'));
 function select(label){const wrap=el('label',label);const s=el('select');s.setAttribute('aria-label',label);wrap.append(s);panel.append(wrap);return s}
 function options(s,items){s.replaceChildren(...items.map(([value,label])=>{const o=el('option',label);o.value=value;return o}))}
 const pupil=profile.role==='teacher'?select('Прогресс ученика'):null;
 if(pupil)options(pupil,pupils.map(p=>[p.user_id,p.display_name]));
 const grade=select('Прогресс: класс обучения'),module=select('Прогресс: модуль'),lesson=select('Прогресс: урок');
 const filter=select('Показать слова');options(filter,[['all','Все слова'],['review','Для практики'],['mastered','Освоенные']]);
 const content=el('div');content.setAttribute('aria-live','polite');panel.append(content);root.append(panel);
 options(grade,[...new Set(sections.map(s=>s.grade))].map(g=>[g,g+' класс']));
 function lessons(){options(lesson,sections.filter(s=>String(s.grade)===grade.value&&s.module===module.value).map(s=>[s.id,s.title]));draw()}
 function modules(){options(module,[...new Set(sections.filter(s=>String(s.grade)===grade.value).map(s=>s.module))].map(m=>[m,'Модуль '+m]));lessons()}
 function draw(){
  content.replaceChildren();const actor=pupil?pupil.value:profile.user_id,section=sections.find(s=>s.id===lesson.value);
  if(!actor||!section){content.append(el('p','Пока нет доступных учеников или уроков'));return}
  const attempts=records.filter(r=>r.pupil_user_id===actor&&r.section_id===section.id);
  const words=evidence.filter(w=>w.pupil_user_id===actor&&w.section_id===section.id);
  const terms=vocabulary.filter(w=>w.section_id===section.id);
  content.append(el('h4',section.grade+' класс · Модуль '+section.module+' · '+section.title));
  const completed=new Set(attempts.filter(a=>a.lesson_completed).map(a=>a.mode));
  const mastered=new Set(words.filter(w=>w.mastered).map(w=>w.word_id));
  const summary=el('p','Пройдено режимов: '+completed.size+'/10 · Освоено слов: '+mastered.size+'/'+terms.length);summary.dataset.progressSummary='true';content.append(summary);
  const modeList=el('ul');content.append(modeList);
  for(const [mode,title] of Object.entries(modes)){
   const played=attempts.filter(a=>a.mode===mode),selfRated=['cards','daily'].includes(mode);
   const item=el('li',(completed.has(mode)?'✓ Пройдено':played.length?'◐ Есть попытки':'○ Ещё не начато')+' · '+title+(selfRated?' · самооценка':''));item.dataset.progressMode=mode;
   const ranked=played.filter(a=>a.ranking_eligible).sort((a,b)=>(b.accuracy_pct??-1)-(a.accuracy_pct??-1)||(a.duration_seconds??1e9)-(b.duration_seconds??1e9));
   if(ranked.length){const best=ranked[0];item.append(el('p','Лучший полный результат: '+(selfRated?'самооценка':best.accuracy_pct+'%')+' · '+best.duration_seconds+' сек.'))}
   if(profile.role==='teacher'){
    const ranking=records.filter(a=>a.section_id===section.id&&a.mode===mode&&a.ranking_eligible).sort((a,b)=>(b.accuracy_pct??-1)-(a.accuracy_pct??-1)||(a.duration_seconds??1e9)-(b.duration_seconds??1e9));
    if(ranking.length){const details=el('details');details.append(el('summary','Рейтинг полных попыток моих учеников'));const list=el('ol');for(const a of ranking.slice(0,10))list.append(el('li',(pupils.find(p=>p.user_id===a.pupil_user_id)?.display_name||'Ученик')+' · '+(selfRated?'самооценка':a.accuracy_pct+'%')+' · '+a.duration_seconds+' сек.'));details.append(list);item.append(details)}
   }
   modeList.append(item);
  }
  const list=el('ul');list.dataset.progressWords='true';content.append(list);
  for(const term of terms){
   const isMastered=mastered.has(term.id);if(filter.value==='mastered'&&!isMastered||filter.value==='review'&&isMastered)continue;
   const history=words.filter(w=>w.word_id===term.id),practiced=history.some(w=>w.practiced);
   const item=el('li');item.dataset.progressWord=term.id;
   item.append(el('p',(isMastered?'✓ Освоено':practiced?'◐ Тренируется':'○ Ещё не пройдено')+' · '+term.en+' — '+term.ru));
   const details=el('details');details.append(el('summary','Почему такая отметка?'));const proof=el('ul');
   for(const w of history){const selfRated=['cards','daily'].includes(w.mode);proof.append(el('li',modes[w.mode]+': '+(selfRated?'самооценок «знаю»: '+w.self_rated_known+'; освоение не подтверждает':'чистых верных попыток: '+w.clean_correct_attempts+'; нужно 2'+(w.mastered?' · ✓ Освоено':''))))}
   if(!history.length)proof.append(el('li','Проверенных занятий по этому слову ещё нет'));
   details.append(proof);item.append(details);list.append(item);
  }
  if(!list.children.length)list.append(el('li','Слов с такой отметкой пока нет'));
 }
 grade.onchange=modules;module.onchange=lessons;lesson.onchange=draw;filter.onchange=draw;if(pupil)pupil.onchange=draw;modules();
}});
