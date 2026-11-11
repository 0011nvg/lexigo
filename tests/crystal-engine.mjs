import assert from 'node:assert/strict';
import E from '../crystal-engine.js';
const invariant=s=>{assert.equal(s.cells.length,s.n);assert.ok(s.cells.every(Boolean));assert.equal(new Set(s.cells.map(p=>p.id)).size,s.n);assert.equal(E.runs(s).length,0);assert.ok(E.findMove(s));for(const i of E.level(s.level).rocks)assert.ok(s.cells[i].rock);assert.equal(s.cells.filter(p=>p.rock).length,E.level(s.level).rocks.length);};
let wins=0,total=0;
for(const L of E.LEVELS)for(let seed=0;seed<100;seed++){
 const s=E.create(L.id,'audit-'+seed),same=E.create(L.id,'audit-'+seed);assert.deepEqual(s,same);invariant(s);
 const rockIds=L.rocks.map(i=>s.cells[i].id);
 while(!s.over){
  const options=E.allMoves(s);assert.ok(options.length);const before=s.moves;
  // A simple greedy player tests reachability with deterministic refills.
  const candidates=options.map(m=>{const t=E.clone(s);E.swap(t,...m);return {m,score:t.score};}).sort((a,b)=>b.score-a.score);
  const res=E.swap(s,...candidates[0].m);assert.ok(res.ok);assert.equal(s.moves,before-1);invariant(s);assert.deepEqual(L.rocks.map(i=>s.cells[i].id),rockIds);
 }
 assert.ok(s.finished);assert.equal(s.finished.won,s.score>=L.target);assert.ok(s.finished.won||s.moves===0);assert.equal(s.movesUsed+s.moves,L.moves);assert.equal(E.swap(s,0,1).ok,false);if(s.finished.won)wins++;total++;
}
{
 const s=E.create(1,'bad'),before=E.clone(s);let invalid;
 for(let a=0;a<s.n;a++)for(const b of [a+1,a+s.size])if(E.neighbors(s,a,b)&&!E.validSwap(s,a,b))invalid=[a,b];
 const r=E.swap(s,...invalid);assert.equal(r.reason,'no-match');assert.equal(r.steps.length,2);assert.deepEqual(s,before,'invalid swaps restore the full state and keep the move');
 assert.equal(E.swap(s,0,8).ok,false,'diagonal swap is invalid');
}
{
 const s=E.create(3,'stone');const before=E.clone(s);assert.equal(E.swap(s,24,25).reason,'rock');assert.deepEqual(s,before);E.shuffle(s);invariant(s);assert.equal(s.cells[24].id,before.cells[24].id);
}
{
 const s=E.create(1,'shapes');s.cells.forEach((p,i)=>p.c=(i%7+Math.floor(i/7)*2)%5);for(const i of [0,8,16])s.cells[i].c=4;assert.equal(E.runs(s).length,0,'diagonals do not match');
 // A plus comprises two straight runs; it has no separate cross match or special bonus.
 s.cells.forEach((p,i)=>p.c=(i%7+Math.floor(i/7)*2)%5);for(const i of [17,23,24,25,31])s.cells[i].c=4;assert.deepEqual(E.runs(s).map(r=>r.dir).sort(),['h','v']);
}
{
 const s=E.create(1,'dead');s.cells.forEach((p,i)=>p.c=(i%7+Math.floor(i/7))%5);assert.equal(E.findMove(s),null);assert.equal(E.runs(s).length,0);const m=s.moves,r=E.swap(s,0,1);assert.equal(r.reason,'reshuffled');assert.equal(s.moves,m);invariant(s);
}
for(const won of [true,false]){
 const s=E.create(1,'last');s.moves=1;s.target=won?1:1e9;const r=E.swap(s,...E.findMove(s));assert.ok(r.ok);assert.equal(s.moves,0);assert.equal(s.finished.won,won);assert.strictEqual(E.finish(s),s.finished,'finish is idempotent');
}
console.log('PASS crystal v4: '+total+' complete levels, '+wins+' greedy wins; matching, invalid swap, stones, no-move recovery, deterministic refills, win/loss and terminal input guards');
