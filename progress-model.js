/* Device-only motivational summary. Never use as verified assessment or currency. */
window.LexigoProgress=(()=>{
 const n=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?Math.floor(v):0;
 function summarize(books,raw){
  const seen=new Set();let total=0,practiced=0,correct=0,recalled=0,answers=0;const courses=[];
  for(const book of books){let count=0,done=0;
   for(const section of book.sections)for(const word of section.words){
    if(seen.has(word.id))continue;seen.add(word.id);total++;count++;
    const p=raw&&Object.hasOwn(raw,word.id)&&raw[word.id]&&typeof raw[word.id]==='object'?raw[word.id]:{};
    const right=n(p.right),wrong=n(p.wrong),recall=n(p.recall);
    if(right+wrong+n(p.selfKnown)+n(p.selfLearning)>0){practiced++;done++}
    if(right>0)correct++;
    if(right>=2&&recall>=2)recalled++;
    answers+=Math.min(right+wrong,1000000);
   }courses.push({grade:book.grade,total:count,practiced:done});
  }
  const awards=[{id:'first',name:'Первый шаг',goal:1,value:correct,rule:'Дай правильный ответ для одного слова.'},{id:'ten',name:'Первые десять',goal:10,value:correct,rule:'Ответь правильно для 10 разных слов.'},{id:'recall',name:'Помню сам',goal:5,value:recalled,rule:'Напиши 5 разных слов правильно минимум дважды без подсказки.'},{id:'fifty',name:'Исследователь',goal:50,value:correct,rule:'Ответь правильно для 50 разных слов.'}].map(a=>({...a,earned:a.value>=a.goal}));
  return {total,practiced,correct,recalled,answers,courses,awards,crystals:correct+2*recalled};
 }
 return Object.freeze({summarize});
})();
