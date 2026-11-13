/* LEXI Crystal v4. Straight horizontal/vertical runs only; deterministic and DOM-free. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LexiCrystalEngine=api;})(typeof self!=='undefined'?self:this,function(){
'use strict';
const COLORS=['сапфир','аметист','изумруд','рубин','топаз','бирюза'];
const LEVELS=[
 {id:1,name:'Первые кристаллы',size:7,colors:5,moves:10,target:300,rocks:[]},
 {id:2,name:'Цепная реакция',size:7,colors:5,moves:10,target:400,rocks:[]},
 {id:3,name:'Каменная тропа',size:7,colors:5,moves:10,target:450,rocks:[24]},
 {id:4,name:'Сапфировая пещера',size:7,colors:6,moves:10,target:500,rocks:[17,31]},
 {id:5,name:'Сокровища Лекси',size:7,colors:6,moves:10,target:550,rocks:[16,18,30,32]}
].map(l=>Object.freeze({...l,rocks:Object.freeze(l.rocks),stars:Object.freeze([l.target,l.target+200,l.target+400])}));
function level(id){return LEVELS.find(l=>l.id===Number(id))||null;}
function hashSeed(s){let h=2166136261>>>0;for(const c of String(s)){h^=c.codePointAt(0);h=Math.imul(h,16777619)>>>0;}return h;}
function rnd(st){st.rng=(st.rng+0x6D2B79F5)>>>0;let t=st.rng;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;}
const rint=(st,n)=>Math.floor(rnd(st)*n);
const xy=(st,i)=>[i%st.size,Math.floor(i/st.size)];
const snap=st=>st.cells.map(p=>p?{...p}:null);
const gem=(st,c)=>({id:++st.nextId,c});
function neighbors(st,a,b){return Number.isInteger(a)&&Number.isInteger(b)&&a>=0&&b>=0&&a<st.n&&b<st.n&&Math.abs(a%st.size-b%st.size)+Math.abs(Math.floor(a/st.size)-Math.floor(b/st.size))===1;}
const movable=p=>!!p&&!p.rock;
function runs(st){
 const out=[],S=st.size;
 for(const dir of ['h','v'])for(let line=0;line<S;line++){
  let start=0;while(start<S){const index=k=>dir==='h'?line*S+k:k*S+line,p=st.cells[index(start)];let end=start+1;
   if(movable(p))while(end<S&&movable(st.cells[index(end)])&&st.cells[index(end)].c===p.c)end++;
   if(movable(p)&&end-start>=3)out.push({dir,c:p.c,cells:Array.from({length:end-start},(_,k)=>index(start+k))});start=end;
  }
 }
 return out;
}
function validSwap(st,a,b){
 if(!neighbors(st,a,b)||!movable(st.cells[a])||!movable(st.cells[b])||st.cells[a].c===st.cells[b].c)return false;
 [st.cells[a],st.cells[b]]=[st.cells[b],st.cells[a]];
 const ok=runs(st).some(r=>r.cells.includes(a)||r.cells.includes(b));
 [st.cells[a],st.cells[b]]=[st.cells[b],st.cells[a]];return ok;
}
function allMoves(st){const out=[];for(let a=0;a<st.n;a++)for(const b of [a+1,a+st.size])if(validSwap(st,a,b))out.push([a,b]);return out;}
function findMove(st){for(let a=0;a<st.n;a++)for(const b of [a+1,a+st.size])if(validSwap(st,a,b))return [a,b];return null;}
function fillFresh(st){
 const rocks=new Set(level(st.level).rocks);
 for(let tries=0;tries<200;tries++){
  st.cells=[];
  for(let i=0;i<st.n;i++){
   if(rocks.has(i)){st.cells.push({id:++st.nextId,c:-1,rock:true});continue;}
   const bad=new Set(),x=i%st.size,y=Math.floor(i/st.size);
   if(x>=2&&movable(st.cells[i-1])&&movable(st.cells[i-2])&&st.cells[i-1].c===st.cells[i-2].c)bad.add(st.cells[i-1].c);
   if(y>=2&&movable(st.cells[i-st.size])&&movable(st.cells[i-2*st.size])&&st.cells[i-st.size].c===st.cells[i-2*st.size].c)bad.add(st.cells[i-st.size].c);
   const choices=Array.from({length:st.colors},(_,c)=>c).filter(c=>!bad.has(c));st.cells.push(gem(st,choices[rint(st,choices.length)]));
  }
  if(findMove(st))return;
 }
 // Constructive fallback: the first two rows have no obstacles in any level.
 st.cells=Array.from({length:st.n},(_,i)=>rocks.has(i)?{id:++st.nextId,c:-1,rock:true}:gem(st,(i%st.size+Math.floor(i/st.size)*2)%st.colors));
 [st.cells[0].c,st.cells[1].c,st.cells[2].c,st.cells[st.size+2].c]=[0,0,1,0];
 if(runs(st).length||!findMove(st))throw Error('Cannot create playable board');
}
function create(id,seed){const L=level(id);if(!L)throw Error('Unknown level');const st={level:L.id,size:L.size,n:L.size*L.size,colors:L.colors,target:L.target,moves:L.moves,movesUsed:0,score:0,nextId:0,rng:hashSeed(seed),seed:String(seed),cells:[],over:false,finished:null,phase:'move',stats:{cleared:0,cascades:0,shuffles:0}};fillFresh(st);return st;}
function shuffle(st){
 const spots=st.cells.map((p,i)=>movable(p)?i:-1).filter(i=>i>=0),pieces=spots.map(i=>st.cells[i]);
 for(let attempt=0;attempt<200;attempt++){
  for(let i=pieces.length-1;i>0;i--){const j=rint(st,i+1);[pieces[i],pieces[j]]=[pieces[j],pieces[i]];}
  spots.forEach((i,k)=>st.cells[i]=pieces[k]);if(!runs(st).length&&findMove(st)){st.stats.shuffles++;return;}
 }
 fillFresh(st);st.stats.shuffles++;
}
function gravity(st){
 const spawned=[],S=st.size;
 for(let x=0;x<S;x++){
  let bottom=S-1;
  while(bottom>=0){if(st.cells[bottom*S+x]?.rock){bottom--;continue;}let top=bottom;while(top>0&&!st.cells[(top-1)*S+x]?.rock)top--;
   const kept=[];for(let y=bottom;y>=top;y--)if(st.cells[y*S+x])kept.push(st.cells[y*S+x]);
   for(let y=bottom,k=0;y>=top;y--,k++){let p=kept[k];if(!p){p=gem(st,rint(st,st.colors));spawned.push({id:p.id,drop:bottom-top+1-kept.length});}st.cells[y*S+x]=p;}
   bottom=top-1;
  }
 }
 return spawned;
}
function finish(st){
 if(st.finished)return st.finished;if(st.score<st.target&&st.moves>0)return null;
 const L=level(st.level),won=st.score>=st.target;st.over=true;st.phase='done';
 st.finished={won,score:st.score,stars:won?1+(st.moves>=Math.ceil(L.moves*.2)?1:0)+(st.moves>=Math.ceil(L.moves*.4)?1:0):0,movesLeft:st.moves,movesUsed:st.movesUsed,level:st.level,v:4};return st.finished;
}
function swap(st,a,b){
 if(st.over||st.moves<=0||!neighbors(st,a,b))return {ok:false,reason:'unavailable',steps:[]};
 if(!movable(st.cells[a])||!movable(st.cells[b]))return {ok:false,reason:'rock',steps:[]};
 if(!findMove(st)){shuffle(st);return {ok:false,reason:'reshuffled',steps:[{t:'shuffle',cells:snap(st)}]};}
 if(!validSwap(st,a,b)){
  [st.cells[a],st.cells[b]]=[st.cells[b],st.cells[a]];const preview=snap(st);[st.cells[a],st.cells[b]]=[st.cells[b],st.cells[a]];
  return {ok:false,reason:'no-match',steps:[{t:'swap',cells:preview},{t:'return',cells:snap(st)}]};
 }
 [st.cells[a],st.cells[b]]=[st.cells[b],st.cells[a]];st.moves--;st.movesUsed++;
 const steps=[{t:'swap',cells:snap(st)}];let chain=0;
 while(runs(st).length&&chain<60){chain++;const cleared=[...new Set(runs(st).flatMap(r=>r.cells))],points=cleared.length*10;
  for(const i of cleared)st.cells[i]=null;st.score+=points;st.stats.cleared+=cleared.length;if(chain>1)st.stats.cascades++;
  steps.push({t:'clear',cleared,points,chain,cells:snap(st)});const spawned=gravity(st);steps.push({t:'fall',spawned,cells:snap(st)});
 }
 // A bounded cascade cannot leave an unstable or dead board behind.
 if(runs(st).length||!findMove(st)){shuffle(st);steps.push({t:'shuffle',cells:snap(st)});}
 finish(st);return {ok:true,steps};
}
const goals=st=>[{type:'score',need:st.target,have:Math.min(st.target,st.score),done:st.score>=st.target,label:'Набери '+st.target+' очков'}];
return Object.freeze({VERSION:4,LEVELS:Object.freeze(LEVELS),COLORS,level,create,swap,validSwap,findMove,allMoves,neighbors,runs,shuffle,finish,goals,goalsMet:st=>st.score>=st.target,clone:st=>JSON.parse(JSON.stringify(st)),xy,dailySeed:(id,day)=>'lexi-crystal-v4|'+id+'|'+day,hashSeed});
});
