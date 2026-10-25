/* Mode views are shared by free practice and protected attempts.
 * Views emit actions; they never decide whether a protected answer is correct.
 */
window.LexigoGameComponents=(()=>{
 const element=(tag,text,className)=>{const n=document.createElement(tag);if(text!=null)n.textContent=String(text);if(className)n.className=className;return n};
 const button=(label,action,className='btn')=>{const b=element('button',label,className);b.type='button';b.onclick=action;return b};
 function textEntry(root,{placeholder='Твой ответ',label='Проверить',submit}){
  const box=element('div',null,'answerbox'),input=element('input');input.type='text';input.autocomplete='off';input.placeholder=placeholder;
  const send=button(label,()=>submit(input,send));input.onkeydown=e=>{if(e.key==='Enter'&&!send.disabled){e.preventDefault();send.click()}};
  box.append(input,send);root.append(box);return {input,send};
 }
 function choices(root,{items,onSelect,className='option',containerClass='options'}){
  const list=element('div',null,containerClass);for(const item of items)list.append(button(item.label,()=>onSelect(item.value),item.className||className));root.append(list);return list;
 }
 function card(root,{front,back,onFlip=()=>{},onKnown,onUnknown,speak,legacy=false}){
  const flash=element('div',null,'flash'),title=element('h2',front);flash.append(title);flash.tabIndex=0;flash.setAttribute('role','button');flash.setAttribute('aria-label','Перевернуть карточку');let flipped=false;
  flash.onclick=()=>{flipped=!flipped;title.textContent=flipped?back:front;onFlip(flipped)};
  flash.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();flash.click()}};
  root.append(flash);const controls=element('div',null,'buttons');
  if(legacy)controls.append(button('Показать перевод',()=>{flipped=true;title.textContent=back;onFlip(true)}));
  if(speak)controls.append(button('🔊 Слушать',speak,'btn secondary'));
  const unknown=button(legacy?'Пока учу':'Ещё учу',()=>onUnknown(known,unknown),'btn warn'),known=button('Знаю',()=>onKnown(known,unknown),'btn good');controls.append(unknown,known);root.append(controls);return {flash,known,unknown};
 }
 function pairTile({text,label,onClick}){const b=button(text,()=>onClick(b),'pair');if(label)b.setAttribute('aria-label',label);return b}
 function crystalTile({value,index,selected=false,art,onClick,onSwap,busy=()=>false,neighbors}){
  const tile=button('',()=>onClick(index),'crystal-tile'+(selected?' selected':''));tile.dataset.gem=String(value);
  if(art)tile.innerHTML=art(value);else tile.textContent=String(value);
  tile.setAttribute('aria-label','Кристалл '+(index+1)+', '+(['сапфир','аметист','изумруд','рубин','топаз','бирюза'][value]||value));tile.setAttribute('aria-pressed',String(selected));
  let start=null;
  tile.addEventListener('pointerdown',e=>{if(busy())return;start={x:e.clientX,y:e.clientY};tile.setPointerCapture(e.pointerId)});
  tile.addEventListener('pointermove',e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y,limit=tile.getBoundingClientRect().width;tile.style.zIndex='4';tile.style.transform='translate('+Math.max(-limit,Math.min(limit,dx))+'px,'+Math.max(-limit,Math.min(limit,dy))+'px) scale(1.08)'});
  tile.addEventListener('pointerup',e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;start=null;tile.style.transform='';tile.style.zIndex='';if(Math.max(Math.abs(dx),Math.abs(dy))<16)return;const target=index+(Math.abs(dx)>Math.abs(dy)?(dx>0?1:-1):(dy>0?6:-6));if(target<0||target>=36||!neighbors(index,target))return;e.preventDefault();tile.dataset.swiped='true';onSwap(index,target)});
  tile.addEventListener('pointercancel',()=>{start=null;tile.style.transform='';tile.style.zIndex=''});
  tile.addEventListener('click',e=>{if(tile.dataset.swiped==='true'){e.stopImmediatePropagation();tile.dataset.swiped='false'}},true);
  return tile;
 }
 const modes=Object.freeze({quiz:choices,spell:textEntry,truefalse:choices,fix:textEntry,audio:textEntry,cards:card,daily:card,pairs:pairTile,crystals:crystalTile,boss:textEntry});
 return Object.freeze({element,button,textEntry,choices,card,pairTile,crystalTile,modes,render(mode,root,props){const component=modes[mode];if(!component)throw Error('Неизвестный режим');return ['pairs','crystals'].includes(mode)?component(props):component(root,props)}});
})();
