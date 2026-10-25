import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('practice-controller.js','utf8');
const ctx={Math,Set};vm.createContext(ctx);vm.runInContext('const GEM_SIDE=6;'+source.slice(source.indexOf('function gemMatches'),source.indexOf('function renderCrystalRound')),ctx);
for(let i=0;i<1000;i++){const b=ctx.gemBoard();assert.equal(ctx.gemMatches(b).length,0);assert.ok(ctx.gemPossible(b));assert.equal(b.length,36)}
assert.equal(ctx.gemNeighbors(5,6),false);assert.equal(ctx.gemNeighbors(0,6),true);
const b=Array.from({length:36},(_,i)=>(i+i%6)%6);b[0]=b[1]=b[2]=5;assert.ok(ctx.gemMatches(b).includes(0));
assert.ok(source.includes("game.types=['quiz','truefalse','fix']"));
console.log('PASS crystal generation: 1000 match-free playable boards, neighbor boundaries, match detection, three-type policy');
