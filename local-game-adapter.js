/* Device-only question policy. No server transport or verified-result writes. */
window.LexigoLocalGameAdapter=Object.freeze({create({getState,shuffle,normalize,audioAvailable,speak,record,renderQuestion,answerUI,textAnswerHints}){
// Local adapter: chooses public question data and evaluates device-only practice.
function question(mode,w){
 const game=getState();
 const pool=game.mode==='crystals'?window.LEXIGO_DATA.books.find(b=>b.sections.some(s=>s.words.some(x=>x.id===w.id)))?.sections.flatMap(s=>s.words)||game.words:game.words;
 const feedback=()=>`${w.en} — ${w.ru}`;
 const model={mode,kind:mode,instruction:'Напиши английское слово или выражение',prompt:w.ru};
 const actions={beforeEntry:root=>textAnswerHints(root,w),submit:(input,button)=>{if(!normalize(input.value)){input.focus();return}answerUI(w,normalize(input.value)===normalize(w.en),feedback(),'recall');input.disabled=true;button.disabled=true}};
 if(mode==='cards'){
  Object.assign(model,{instruction:'Нажми на карточку, чтобы увидеть перевод. «Знаю» — твоя самооценка, а не проверка знания. Чтобы подтвердить результат, попробуй режим «Напиши слово».',prompt:null,card:{front:w.en,back:w.ru}});
  Object.assign(actions,{onFlip:value=>game.flipped=value,speak:()=>speak(w.en),onUnknown:()=>{record(w,false,'self');game.index++;game.flipped=false;renderQuestion()},onKnown:()=>{record(w,true,'self');game.index++;game.flipped=false;renderQuestion()}});
 }else if(mode==='quiz'){
  const distract=shuffle(pool.filter(x=>x.id!==w.id&&normalize(x.ru)!==normalize(w.ru)&&normalize(x.en)!==normalize(w.en))).filter((x,i,a)=>a.findIndex(y=>normalize(y.ru)===normalize(x.ru))===i).slice(0,3);
  if(!distract.length)model.kind='spell';
  else{model.instruction='Выбери правильный перевод';model.prompt=w.en;model.choices=shuffle([w,...distract]).map(x=>({label:x.ru,value:x.id}));actions.answer=id=>answerUI(w,id===w.id,feedback())}
 }else if(mode==='truefalse'){
  const other=shuffle(pool.filter(x=>x.id!==w.id&&normalize(x.ru)!==normalize(w.ru)&&normalize(x.en)!==normalize(w.en)))[0];
  if(!other)model.kind='spell';
  else{const correct=Math.random()>.5;Object.assign(model,{instruction:'Верно ли указан перевод?',prompt:w.en,proposed:correct?w.ru:other.ru,choices:[{label:'✓ Верно',value:true,className:'btn good'},{label:'✕ Неверно',value:false,className:'btn warn'}]});actions.answer=value=>answerUI(w,value===correct,feedback())}
 }else if(mode==='fix'&&game.mode==='crystals'){
  const letters=Array.from(w.en),indices=letters.map((c,i)=>/[a-z]/i.test(c)?i:-1).filter(i=>i>=0);
  if(!indices.length)return question('quiz',w);
  const idx=indices[Math.floor(Math.random()*indices.length)],original=letters[idx],alphabet='abcdefghijklmnopqrstuvwxyz';
  const replacement=alphabet[(alphabet.indexOf(original.toLowerCase())+7)%26];letters[idx]=original===original.toUpperCase()?replacement.toUpperCase():replacement;
  Object.assign(model,{kind:'letterfix',instruction:'Нажми на ошибочную букву, затем выбери замену',prompt:null,proposed:w.ru,letters,letterChoices:shuffle([original,...shuffle([...alphabet].filter(c=>c!==original.toLowerCase()&&c!==replacement)).slice(0,3).map(c=>original===original.toUpperCase()?c.toUpperCase():c)])});
  actions.chooseLetter=(position,value)=>{const ok=position===idx&&value===original;answerUI(w,ok,feedback());return ok};
 }else if(mode==='fix'){
  const letters=Array.from(w.en),possible=letters.map((c,i)=>/[a-z]/i.test(c)?i:-1).filter(i=>i>=0);
  if(possible.length){const idx=possible[Math.floor(Math.random()*possible.length)],alphabet='abcdefghijklmnopqrstuvwxyz',replacement=alphabet[(alphabet.indexOf(letters[idx].toLowerCase())+7)%26];letters[idx]=letters[idx]===letters[idx].toUpperCase()?replacement.toUpperCase():replacement;Object.assign(model,{instruction:'Исправь ошибку и напиши слово правильно',prompt:letters.join(''),proposed:w.ru})}
 }else if(mode==='audio'){
  if(audioAvailable()){Object.assign(model,{instruction:'Послушай и напиши английское слово или выражение',prompt:null,autoplay:true});actions.speak=()=>speak(w.en)}
  else{model.kind='spell';model.instruction='Озвучивание недоступно. Напиши слово по переводу.'}
 }
 return {model,actions};
}

return Object.freeze({question,pairCorrect:(a,b)=>a.wordId===b.wordId&&a.side!==b.side});
}});
