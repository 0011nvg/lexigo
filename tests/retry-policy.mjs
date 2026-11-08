import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('practice-controller.js','utf8');
const advance=source.match(/function advance\(\)\{.*?\}function bar\(/s)[0].replace(/function bar\($/,'');
const passed=source.match(/function finalTestPassed\(g\)\{.*?\}function finish\(/s)[0].replace(/function finish\($/,'');
for(const index of [0,1,2,5]){
 const words=Array.from({length:10},(_,i)=>({id:'w'+i}));const game={index,words,retryQueue:[{...words[index],retryAfter:index+4}],retries:0,retryIndexes:new Set()};
 const ctx={game,renderQuestion(){}};vm.createContext(ctx);vm.runInContext(advance,ctx);
 for(let n=0;n<3;n++){ctx.advance();assert.equal(game.retries,0,'must wait for three other answers');}
 ctx.advance();assert.equal(game.words[game.index].id,'w'+index);assert.equal(game.retries,1);assert.equal(game.retryIndexes.has(game.index),true);
}
const ctx={};vm.createContext(ctx);vm.runInContext(passed,ctx);
const state={words:Array(10),retries:0,firstCorrect:8,recallTotal:0,recallScore:0,retryQueue:[],retryIds:new Set()};
assert.equal(ctx.finalTestPassed(state),true);
assert.equal(ctx.finalTestPassed({...state,firstCorrect:7}),false);
assert.equal(ctx.finalTestPassed({...state,recallTotal:10,recallScore:6}),false);
assert.equal(ctx.finalTestPassed({...state,recallTotal:10,recallScore:7}),true);
assert.equal(ctx.finalTestPassed({...state,retryIds:new Set(['w1'])}),false);
console.log('PASS: retry delay from multiple positions and agreed final-test thresholds');
