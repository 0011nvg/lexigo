// LEXIGO repository integrity checks. Run: node tests/verify.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const data=JSON.parse(fs.readFileSync('data.json','utf8'));
const js=fs.readFileSync('data.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const context={window:{}};
vm.runInNewContext(js,context,{timeout:5000});
assert.equal(JSON.stringify(context.window.LEXIGO_DATA),JSON.stringify(data),'data.js and data.json must match');
const expected={2:236,3:423,4:376};
let all=[];
for(const book of data.books){
 const words=book.sections.flatMap(s=>s.words);
 assert.equal(words.length,expected[book.grade],`Grade ${book.grade} count changed`);
 for(const section of book.sections){
  assert.equal(typeof section.module,'string');
  assert.equal(typeof section.title,'string');
  assert.ok(Array.isArray(section.words));
  for(const word of section.words){
   assert.ok(word.id&&word.en&&word.ru,'Empty vocabulary field');
   all.push(word);
  }
 }
}
assert.equal(all.length,1035);
assert.equal(new Set(all.map(w=>w.id)).size,all.length,'Duplicate word IDs');
assert.ok(html.includes('<script src="data.js"></script>'));
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
assert.ok(scripts.length,'Inline script missing');
for(const match of scripts) new vm.Script(match[1],{filename:'index.html'});
for(const id of ['book','module','unit','words','quickStart','game','launcher','showReport','exportReport','reportContent']){
 assert.ok(html.includes(`id="${id}"`),`Missing UI element ${id}`);
}
console.log('PASS: 1035 original entries, grades, unique IDs, mirrored data, JavaScript syntax and key UI controls');

for(const file of ['local-game-adapter.js','game-engine.js','game-components.js','practice-controller.js','local-storage.js','server-storage.js','server-game-adapter.js','cabinet-controller.js','progress-controller.js','navigation-controller.js']) new vm.Script(fs.readFileSync(file,'utf8'),{filename:file});
