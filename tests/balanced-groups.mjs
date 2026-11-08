import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const storage=new Map();
const ctx={window:{addEventListener(){}},document:{readyState:'loading',addEventListener(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},setTimeout,clearTimeout,console};
vm.runInNewContext(fs.readFileSync('word-rounds.js','utf8'),ctx);
const R=ctx.window.LexiRounds;
for(const [n,want] of [[0,[]],[12,[12]],[15,[15]],[16,[8,8]],[20,[10,10]],[29,[15,14]],[30,[15,15]],[31,[11,10,10]],[33,[11,11,11]],[40,[14,13,13]],[46,[12,12,11,11]]]){
 const pool=Array.from({length:n},(_,i)=>({id:'w'+i}));
 assert.deepEqual(Array.from(R.groups(pool),g=>g.length),want);
}
for(let n=1;n<=3000;n++){
 const pool=Array.from({length:n},(_,i)=>({id:'w'+i})),groups=R.groups(pool),sizes=Array.from(groups,g=>g.length);
 assert.ok(Math.max(...sizes)<=15);assert.ok(Math.max(...sizes)-Math.min(...sizes)<=1);
 assert.deepEqual(Array.from(groups.flat(),w=>w.id),pool.map(w=>w.id));
}
const pool=Array.from({length:33},(_,i)=>({id:'w'+i}));
for(let round=1;round<=3;round++){
 const p=R.plan({key:'test',pool,mode:'spell'});assert.equal(p.words.length,11);assert.equal(p.info.round,round);
 for(const w of p.words)R.mark('test',w.id);
}
assert.equal(R.info('test',pool,15).complete,true);
assert.equal(R.plan({key:'test',pool,mode:'spell'}).info.restarted,true);
R.adopt('legacy',pool.slice(0,15).map(w=>w.id));
const resumed=R.plan({key:'legacy',pool,mode:'spell'});
assert.equal(resumed.info.round,2);assert.equal(resumed.words.length,7);
assert.ok(resumed.words.every(w=>Number(w.id.slice(1))>=15&&Number(w.id.slice(1))<22));
console.log('PASS: all requested groups, 3000 invariants, sequential progress and next cycle');
