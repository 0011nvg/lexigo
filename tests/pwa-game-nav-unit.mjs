import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../pwa-game-nav.js', import.meta.url), 'utf8');
function create({standalone=true, mobile=true}={}) {
  const handlers={}, flags=new Set(), variables={}, nav={hidden:true}, medias=[];
  const doc = {
    body:{dataset:{page:'play'},classList:{toggle(key,on){on?flags.add(key):flags.delete(key)}}},
    documentElement:{style:{setProperty(k,v){variables[k]=v}}},
    activeElement:{tagName:'INPUT'}, querySelector:s=>s==='.bottom-nav'?nav:null,
    addEventListener:(type,fn)=>handlers[type]=fn
  };
  const vv={height:500,offsetTop:0,addEventListener(){}};
  const window={innerHeight:800, visualViewport:vv,matchMedia:()=>{const m={matches:medias.length===0?standalone:mobile,addEventListener(){}};medias.push(m);return m}};
  let saves=0, sessions=0; const state={sent:false};
  const context={document:doc,window,navigator:{},requestAnimationFrame:fn=>fn(),MutationObserver:class {observe(){}},game:{},stop(){if(!state.sent){saves++;state.sent=true;}sessions++;context.game=null}};
  vm.runInNewContext(source,context);return {doc,window,handlers,flags,variables,nav,medias,get saves(){return saves},get sessions(){return sessions},context};
}
const pwa=create(); pwa.handlers.DOMContentLoaded();
assert.equal(pwa.nav.hidden,false);assert.ok(pwa.flags.has('pwa-mobile-game-nav'));assert.equal(pwa.variables['--pwa-keyboard-offset'],'300px');
const target={closest:()=>({})};
pwa.handlers.click({target,button:0});assert.equal(pwa.saves,1);assert.equal(pwa.sessions,1);
pwa.handlers.click({target,button:0});assert.equal(pwa.saves,1,'second click cannot stop already stopped game');
const browser=create({standalone:false});browser.handlers.DOMContentLoaded();assert.equal(browser.nav.hidden,true);browser.handlers.click({target,button:0});assert.equal(browser.saves,0);
const desktop=create({mobile:false});desktop.handlers.DOMContentLoaded();assert.equal(desktop.nav.hidden,true);desktop.handlers.click({target,button:0});assert.equal(desktop.saves,0);
const modified=create();modified.handlers.DOMContentLoaded();modified.handlers.click({target,button:0,ctrlKey:true});assert.equal(modified.saves,0);
const nonNav=create();nonNav.handlers.DOMContentLoaded();nonNav.handlers.click({target:{closest:()=>null},button:0});assert.equal(nonNav.saves,0);
console.log('PASS mobile PWA game navigation: scope, keyboard offset and single exit callback (simulated DOM)');
// Exercise the real cloud.js stop wrapper together with this panel. Network is
// intentionally unavailable; this does not replace a browser/Supabase test.
{
 const handlers={}, store=new Map(), nav={hidden:true}, vars={};
 const uid='11111111-1111-1111-1111-111111111111';
 const doc={readyState:'loading',body:{dataset:{page:'play'},classList:{toggle(){}}},
  documentElement:{style:{setProperty(k,v){vars[k]=v}}},activeElement:{tagName:'DIV'},
  querySelector:s=>s==='.bottom-nav'?nav:null,getElementById:()=>null,
  addEventListener:(name,fn)=>{if(name==='click')handlers.click=fn}};
 const win={innerHeight:800,matchMedia:()=>({matches:true,addEventListener(){}}),
  addEventListener(){},dispatchEvent(){},LexigoCloud:{h(){},clientId:()=> 'session-test-id',localDay:()=> '2026-11-04'},
  LexigoAccountHint:{uid:()=>uid}};
 const storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v))};
 const progress={w1:{right:3,wrong:2,due:100}};
 const state={window:win,document:doc,navigator:{},localStorage:storage,sessionStorage:storage,
  progress,performance:{now:()=>1},console,setTimeout,clearTimeout,requestAnimationFrame:fn=>fn(),
  MutationObserver:class {observe(){}},CustomEvent:class {},
  game:{mode:'quiz',words:[{id:'w1'}],cloud:{id:'session-test-id',events:[{w:'w1',ok:true,k:'recognition'}],meta:{},sent:false}},
  start(){},record(){},saveLearningAttempt(){},stop(){state.game=null}};
 vm.runInNewContext(source,state);
 vm.runInNewContext(fs.readFileSync(new URL('../cloud.js',import.meta.url),'utf8'),state);
 const click={target:{closest:()=>({})},button:0};
 handlers.click(click); handlers.click(click);
 const queue=JSON.parse(store.get('lexigo_cloud_queue'));
 assert.equal(queue.length,1,'the real cloud wrapper enqueues unfinished session once');
 assert.equal(queue[0].client_id,'session-test-id');assert.equal(queue[0].events.length,1);
 assert.deepEqual(progress.w1,{right:3,wrong:2,due:100},'existing local progress unchanged');
 console.log('PASS mobile PWA exit calls the real cloud queue wrapper once (simulated browser)');
}
