/* Server attempt adapter: issues API actions and converts responses to shared
 * engine view models. Correctness, progress and ranking are never calculated here. */
window.LexigoServerGameAdapter=Object.freeze({create({rows,edge,say,load,uuid}){
 const el=LexigoGameComponents.element;
async function selfRating(root,assignment,attemptId){
 const words=await rows('vocabulary_words','select=id,en,ru&section_id=eq.'+encodeURIComponent(assignment.section_id)+'&order=order_index.asc');
 if(!words.length)throw Error('Нет слов для самооценки');
 let index=0;
 function display(){
  root.replaceChildren();const w=words[index];if(!w){root.append(el('p','Все карточки пройдены'));return}
  root.append(el('p',(index+1)+' / '+words.length));
  LexigoGameEngine.question(root,{mode:assignment.mode,kind:'cards',card:{front:w.en,back:w.ru,legacy:true}},{onKnown:(a,b)=>rate('known',a,b),onUnknown:(a,b)=>rate('unknown',a,b)});
 }
 async function rate(rating,known,unknown){known.disabled=unknown.disabled=true;try{const w=words[index];await edge('append-event',{attemptId,wordId:w.id,index,kind:'card_self_rating',hinted:false,retry:false,rating});index++;display();say('Самооценка сохранена сервером — это не проверенный игровой балл')}catch(err){say(err.message,true)}finally{known.disabled=unknown.disabled=false}}
 display();
}

async function statefulRound(root,c,attemptId,mode){
 const q=c.question||{};
 const status=el('p','Все ходы и ответы проверяются сервером');root.append(status);
 const action=async(kind,payload)=>{
  const data=await edge('play-round',{attemptId,challengeId:c.challengeId,requestId:uuid(),action:kind,payload});
  status.textContent=data.complete?'Раунд завершён':data.correct===true?'Верно':data.correct===false?'Пока не получилось':'Ход сохранён';
  if(data.complete){root.append(el('p','Раунд сохранён сервером. Выберите следующий вопрос.'))}
  return data;
 };
 const stage=el('div');root.append(stage);
 const showStage=question=>{stage.replaceChildren();LexigoGameEngine.question(stage,{mode:'boss',kind:'quiz',headingTag:'p',prompt:question.prompt||'',proposed:question.proposed,proposedPrefix:'Вариант: '},{})};
 const answerField=()=>{
  const {input:field,send:button}=LexigoGameEngine.question(root,{mode,kind:'spell',placeholder:'Введите ответ',submitLabel:'Ответить'},{submit:async(field,button)=>{
   button.disabled=true;try{const result=await action('answer',{answer:field.value});if(result.nextQuestion){field.value='';showStage(result.nextQuestion);button.disabled=false}
   else if(result.complete){button.remove();field.disabled=true}else button.disabled=false;
   }catch(err){say(err.message,true);button.disabled=false}
  }});return {field,button};
 };
 if(mode==='pairs'){
  const tiles=Array.isArray(q.tiles)?q.tiles:[];if(!tiles.length)throw Error('Сервер не выдал пары');
  LexigoGameEngine.pairs(root,{tiles,onPair:(first,second)=>action('pair',{first:first.id,second:second.id}),onSelect:()=>status.textContent='Выберите вторую карточку',onError:err=>say(err.message,true)});
 }else if(mode==='crystals'){
  const board=Array.isArray(q.board)?q.board:[];if(board.length!==36)throw Error('Сервер не выдал поле');
  let current=board.slice();const cells=[];let selected=null,moves=0,done=false,busy=false;
  const grid=el('div');grid.style.cssText='display:grid;grid-template-columns:repeat(6,1fr);gap:4px;max-width:420px';
  root.append(grid);
  for(let i=0;i<36;i++){const b=LexigoGameEngine.render('crystals',grid,{value:current[i],index:i,onClick:()=>{},onSwap:async(from,to)=>{if(done||busy)return;selected=from;await cells[to].onclick()},busy:()=>done||busy,neighbors:(a,b)=>Math.abs(Math.floor(a/6)-Math.floor(b/6))+Math.abs(a%6-b%6)===1});b.style.margin='0';grid.append(b);cells.push(b);
   b.onclick=()=>{if(done||busy)return;return LexigoGameEngine.crystalSelection({selected,index:i,neighbors:(a,b)=>Math.abs(Math.floor(a/6)-Math.floor(b/6))+Math.abs(a%6-b%6)===1,onSelect:value=>{selected=value;status.textContent='Выберите соседний кристалл'},onSwap:async(from,to)=>{
    selected=null;busy=true;try{const result=await action('swap',{from,to});
     if(Array.isArray(result.board)&&result.board.length===36){current=result.board;cells.forEach((cell,j)=>cell.textContent=String(current[j]))}
     if(result.moves!=null)moves=Number(result.moves);else if(result.correct)moves++;
     if(result.boardComplete){done=true;cells.forEach(cell=>cell.disabled=true);showStage(result.vocabQuestion||{prompt:q.prompt||'Переведите слово'});answerField()}
    }catch(err){say(err.message,true)}finally{busy=false}
   }})};
  }
 }else if(mode==='boss'){
  showStage(q.question||{prompt:'Ответьте на вопрос босса'});
  const {field,button}=answerField();
  const original=button.onclick;button.onclick=async()=>{const before=root.querySelectorAll('p').length;await original();if(root.querySelectorAll('p').length>before)field.focus()};
  const retry=el('button','Повторить этап');retry.onclick=async()=>{retry.disabled=true;try{await action('retry',{});retry.disabled=false}catch(err){say(err.message,true);retry.disabled=false}};
  root.append(retry);
 }
}

async function play(root,assignment,attemptId){
 const box=el('section');root.prepend(box);box.append(el('h3','Игра · '+assignment.mode));
 const next=el('button','Следующий вопрос');box.append(next);
 const question=el('div');box.append(question);
 const finish=el('button','Завершить попытку');box.append(finish);
 finish.onclick=async()=>{try{await edge('finish-attempt',{attemptId});await load();say('Попытка завершена на сервере')}catch(err){say(err.message,true)}};
 next.onclick=async()=>{next.disabled=true;question.replaceChildren();try{
  if(['cards','daily'].includes(assignment.mode)){await selfRating(question,assignment,attemptId);return}
  const c=await edge('next-question',{attemptId});
  if(['pairs','crystals','boss'].includes(assignment.mode)){
   await statefulRound(question,c,attemptId,assignment.mode);return;
  }
  const model={mode:assignment.mode,kind:assignment.mode,headingTag:'p',prompt:c.question?.prompt??'Вопрос',proposed:c.question?.proposed,proposedPrefix:'Вариант: ',manualSubmit:true,placeholder:'Ответ',submitLabel:'Проверить ответ'};
  if(assignment.mode==='truefalse')model.choices=[{label:'✓ Верно',value:'true'},{label:'✕ Неверно',value:'false'}];
  else if(Array.isArray(c.question?.choices))model.choices=c.question.choices.map(v=>({label:String(v),value:String(v)}));
  LexigoGameEngine.question(question,model,{submit:async(answer,send)=>{
   send.disabled=true;try{const result=await edge('answer-question',{attemptId,challengeId:c.challengeId,index:c.index,wordId:c.wordId,answer:answer.value});question.append(el('p',result.correct?'Верно':'Неверно'));if(result.complete!==false){send.remove();answer.disabled=true}else send.disabled=false}catch(err){say(err.message,true);send.disabled=false}
  },speak:c.question?.speechText?()=>{if(!window.speechSynthesis||!window.SpeechSynthesisUtterance){say('Озвучивание недоступно в этом браузере',true);return}const speech=new SpeechSynthesisUtterance(c.question.speechText);speech.lang='en-GB';speech.rate=.85;speechSynthesis.cancel();speechSynthesis.speak(speech)}:null});

 }catch(err){say(err.message,true)}finally{next.disabled=false}};
 await next.onclick();
}

return Object.freeze({play});
}});
