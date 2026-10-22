/* One mode renderer and interaction controller for both storage adapters.
 * A view model contains public presentation data. Evaluation and persistence
 * are supplied by an adapter; this engine never awards protected scores.
 */
window.LexigoGameEngine=(()=>{
 const C=LexigoGameComponents;
 const supported=new Set(['quiz','spell','truefalse','fix','audio','cards','daily','pairs','crystals','boss','mixed']);
 function question(root,model,actions){
  if(!supported.has(model.mode))throw Error('Неизвестный режим');
  const kind=model.kind||model.mode;
  if(model.instruction)root.append(C.element('p',model.instruction,'muted'));
  if(model.prompt!=null)root.append(C.element(model.headingTag||'h2',model.prompt));
  if(model.proposed!=null){const proposed=C.element('p',(model.proposedPrefix||'')+model.proposed);proposed.style.fontSize=kind==='truefalse'&&!model.headingTag?'20px':'';root.append(proposed)}
  if(kind==='cards')return C.render(model.mode==='daily'?'daily':'cards',root,{...model.card,...actions});
  if(kind==='audio'&&actions.speak)root.append(C.button('🔊 Прослушать',actions.speak,'btn secondary'));
  const needsInput=!['quiz','truefalse'].includes(kind)||model.manualSubmit;
  let entry;
  if(needsInput){
   actions.beforeEntry?.(root);
   entry=C.render(['boss','spell','fix','audio'].includes(model.mode)?model.mode:'spell',root,{placeholder:model.placeholder,label:model.submitLabel,submit:actions.submit});
  }
  if(model.choices?.length)C.render(kind==='truefalse'?'truefalse':'quiz',root,{items:model.choices,className:kind==='truefalse'?'btn':'option',containerClass:kind==='truefalse'?'buttons':'options',onSelect:value=>{if(model.manualSubmit)entry.input.value=value;else actions.answer(value)}});
  if(model.autoplay&&actions.speak)actions.speak();
  return entry;
 }
 function pairs(root,{tiles,onPair,onSelect=()=>{},onError=()=>{},highlight=true}){
  let first=null,busy=false,disposed=false;const matched=new Set(),buttons=new Map();
  const apply=(a,b,result)=>{
   if(disposed)return;
   if(result.correct){matched.add(a.id);matched.add(b.id);for(const id of [a.id,b.id]){buttons.get(id).disabled=true;if(highlight)buttons.get(id).classList.add('matched')}}
   else if(highlight){for(const id of [a.id,b.id])buttons.get(id).classList.add('pair-error');setTimeout(()=>{for(const id of [a.id,b.id])buttons.get(id)?.classList.remove('pair-error')},320)}
   if(result.complete)for(const button of buttons.values())button.disabled=true;
   busy=false;
  };
  const choose=tile=>{
   if(disposed||busy||matched.has(tile.id))return;
   const button=buttons.get(tile.id);
   if(!first){first=tile;if(highlight)button.classList.add('selected');onSelect(tile);return}
   const previous=first;first=null;buttons.get(previous.id).classList.remove('selected');if(previous.id===tile.id)return;
   busy=true;
   try{const result=onPair(previous,tile);if(result?.then)result.then(value=>apply(previous,tile,value)).catch(error=>{busy=false;if(!disposed)onError(error)});else apply(previous,tile,result)}catch(error){busy=false;onError(error)}
  };
  for(const tile of tiles){const button=C.render('pairs',root,{text:tile.text,label:tile.label,onClick:()=>choose(tile)});buttons.set(tile.id,button);root.append(button)}
  return {dispose(){disposed=true;first=null},buttons};
 }
 function crystalSelection({selected,index,neighbors,onSelect,onSwap}){
  if(selected===index){onSelect(null);return}
  if(selected==null||!neighbors(selected,index)){onSelect(index);return}
  return onSwap(selected,index);
 }
 return Object.freeze({question,pairs,crystalSelection,render:C.render});
})();
