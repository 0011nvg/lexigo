/* Shared local/cloud builder: pointer swaps, keyboard moves, click-to-swap. */
window.LexiBuilderInteraction = function(root, model, actions, C) {
 const line=C.element('div',null,'builder-line'),bank=C.element('div',null,'builder-bank');
 const placed=[];let done=false,selected=null,drag=null,suppressClick=false;
 const hint=C.element('p','Нажми на две установленные буквы, чтобы поменять их местами. Стрелки ← → перемещают выбранную букву; Delete возвращает её.','muted tiny');
 const returnHint=C.element('span','Перетащи букву сюда, чтобы вернуть','builder-bank-hint');returnHint.hidden=true;
 bank.setAttribute('role','group');bank.setAttribute('aria-label','Буквы для слова. Сюда можно вернуть букву');
 line.setAttribute('aria-label','Твой ответ');line.setAttribute('role','group');
 const status=C.element('p','','muted tiny');status.setAttribute('role','status');
 const remove=p=>{const i=placed.indexOf(p);if(i<0)return;placed.splice(i,1);p.btn.hidden=false;selected=null;paint();};
 const swap=(a,b)=>{const i=placed.indexOf(a),j=placed.indexOf(b);if(i<0||j<0)return;[placed[i],placed[j]]=[placed[j],placed[i]];selected=null;paint();status.textContent='Буквы переставлены: '+placed.map(p=>p.text).join(' ');};
 const paint=()=>{
  const focused=line.contains(document.activeElement)?document.activeElement.dataset.tile:null;
  line.replaceChildren(...(placed.length?placed.map((p,i)=>{
   const b=C.button(p.text,()=>{if(done)return;if(selected&&selected!==p)swap(selected,p);else {selected=selected===p?null:p;paint();}},'builder-token placed');
   b.dataset.tile=p.id;b.setAttribute('aria-label',p.text+', позиция '+(i+1));b.setAttribute('aria-pressed',String(selected===p));
   b.onkeydown=e=>{if(done)return;if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const j=i+(e.key==='ArrowLeft'?-1:1);if(placed[j]){swap(p,placed[j]);line.children[j]?.focus({preventScroll:true});}}else if(['Delete','Backspace'].includes(e.key)){e.preventDefault();remove(p);bank.querySelector('[data-tile="'+p.id+'"]')?.focus({preventScroll:true});}};
   return b;
  }):[C.element('span',model.joiner?'Нажимай на слова по порядку':'Нажимай на буквы по порядку','builder-placeholder')]));
  check.disabled=placed.length!==model.tiles.length;back.disabled=!selected;clear.disabled=!placed.length;returnHint.hidden=placed.length!==model.tiles.length;
  if(focused!=null)line.querySelector('[data-tile="'+focused+'"]')?.focus({preventScroll:true});
 };
 const tools=C.element('div',null,'builder-tools');
 const back=C.button('Вернуть выбранную',()=>{if(!done&&selected)remove(selected);},'btn secondary');
 const clear=C.button('↺ Сначала',()=>{if(done)return;placed.splice(0).forEach(p=>p.btn.hidden=false);selected=null;paint();},'btn secondary');
 const check=C.button('Проверить',()=>{if(done||placed.length!==model.tiles.length)return;done=true;for(const b of root.querySelectorAll('button'))b.disabled=true;actions.submitBuild(placed.map(p=>p.text).join(model.joiner));});
 model.tiles.forEach((text,id)=>{const p={text,id};p.btn=C.button(text,()=>{if(done)return;placed.push(p);p.btn.hidden=true;selected=null;paint();},'builder-token');p.btn.dataset.tile=id;bank.append(p.btn);});
 bank.append(returnHint);
 const tiles=()=>[...bank.querySelectorAll('button')].map(b=>({id:+b.dataset.tile,btn:b}));
 root.addEventListener('click',e=>{if(suppressClick&&e.isTrusted){suppressClick=false;e.preventDefault();e.stopImmediatePropagation();}},true);
 root.addEventListener('pointerdown',e=>{const b=e.target.closest('.builder-token');if(done||!b||e.button!==0)return;drag={id:+b.dataset.tile,x:e.clientX,y:e.clientY};});
 root.addEventListener('pointerup',e=>{if(!drag||done)return;const from=drag;drag=null;if(Math.hypot(e.clientX-from.x,e.clientY-from.y)<8)return;const target=document.elementFromPoint(e.clientX,e.clientY),tile=target?.closest('.builder-token');const p=placed.find(p=>p.id===from.id);if(p){if(target===bank||bank.contains(target))remove(p);else if(tile&&line.contains(tile)){const other=placed.find(p=>p.id===+tile.dataset.tile);if(other)swap(p,other);}}else if(target===line||line.contains(target)){const item=tiles().find(p=>p.id===from.id);if(item&&!item.btn.hidden)item.btn.click();}suppressClick=true;setTimeout(()=>suppressClick=false,0);e.preventDefault();},true);
 root.addEventListener('pointercancel',()=>drag=null);
 tools.append(back,clear,check);root.append(hint,line,bank,tools,status);paint();
};
