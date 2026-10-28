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
assert.ok(html.includes('<script src="navigation-controller.js"></script>'),'Navigation entry missing');
for(const file of ['navigation-controller.js','practice-controller.js','game-components.js','game-engine.js','local-storage.js','local-game-adapter.js']) new vm.Script(fs.readFileSync(file,'utf8'),{filename:file});
assert.ok(!/server-storage\.js|server-game-adapter\.js|cabinet-controller\.js|Supabase Auth/.test(html),'Server-only dependencies in static entry');
for(const match of scripts) new vm.Script(match[1],{filename:'index.html'});
for(const id of ['book','module','unit','words','quickStart','game','launcher','showReport','exportReport','reportContent']){
 assert.ok(html.includes(`id="${id}"`),`Missing UI element ${id}`);
}
// Extended dictionaries are additive: do not replace the original 1035 records or their IDs.
const extendedCounts={5:1514,6:1148,7:1222,8:2261,9:2199};
for(const [grade,count] of Object.entries(extendedCounts)){
 const path='vocabulary/spotlight-'+grade+'.js';
 assert.ok(html.includes('<script src="'+path+'"></script>'),'Grade '+grade+' script missing from HTML');
 vm.runInNewContext(fs.readFileSync(path,'utf8'),context,{timeout:5000,filename:path});
 const book=context.window.LEXIGO_DATA.books.find(b=>String(b.grade)===grade);
 assert.ok(book,'Missing Spotlight '+grade);
 assert.equal(book.sections.flatMap(s=>s.words).length,count,'Spotlight '+grade+' vocabulary count mismatch');
 assert.ok(book.sections.every(s=>s.module&&s.title&&s.words.length),'Unlabeled vocabulary section');
}
const expanded=context.window.LEXIGO_DATA.books;
assert.deepEqual(Array.from(expanded,b=>b.grade),[2,3,4,5,6,7,8,9]);
const expandedWords=expanded.flatMap(b=>b.sections.flatMap(s=>s.words));
assert.equal(expandedWords.length,9379,'Extended vocabulary total changed');
assert.equal(new Set(expandedWords.map(w=>w.id)).size,9379,'Duplicate IDs across books');
assert.ok(expandedWords.every(w=>typeof w.en==='string'&&w.en.trim()&&typeof w.ru==='string'&&w.ru.trim()));
assert.ok(html.includes('2–9 классы'),'Landing class range not updated');
console.log('PASS: 1035 original records intact + 8344 imported records = 9379 words, Spotlight 2–9, unique IDs, mirrored legacy data and JS syntax');
