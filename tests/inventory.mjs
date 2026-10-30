// LEXIGO data inventory. `node tests/inventory.mjs --write` stores the baseline;
// without flags it compares the current data with tests/fixtures/inventory-baseline.json.
import fs from 'node:fs'; import vm from 'node:vm'; import crypto from 'node:crypto'; import assert from 'node:assert/strict';
const html = fs.readFileSync('index.html', 'utf8');
const ctx = { window: {} }; vm.createContext(ctx);
const files = [...html.matchAll(/<script src="((?:data|vocabulary\/[^"]+)\.js)"><\/script>/g)].map(m => m[1]);
for (const f of files) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
const books = ctx.window.LEXIGO_DATA.books;
const h = s => crypto.createHash('sha256').update(s).digest('hex');
const inv = { files, books: books.map(b => ({ grade: b.grade, sections: b.sections.length, modules: [...new Set(b.sections.map(s => s.module))].length, words: b.sections.reduce((n, s) => n + s.words.length, 0),
  hash: h(JSON.stringify(b.sections.map(s => [s.module, s.title, s.words.map(w => [w.id, w.en, w.ru])]))) })) };
inv.totalWords = inv.books.reduce((n, b) => n + b.words, 0); inv.totalSections = inv.books.reduce((n, b) => n + b.sections, 0);
inv.ids = h(JSON.stringify(books.flatMap(b => b.sections.flatMap(s => s.words.map(w => w.id)))));
const modes = [...html.matchAll(/data-mode="([a-z]+)"/g)].map(m => m[1]);
const path = 'tests/fixtures/inventory-baseline.json';
if (process.argv.includes('--write')) { fs.writeFileSync(path, JSON.stringify({ ...inv, modes }, null, 1)); console.log('baseline written', inv.totalWords, 'words', inv.totalSections, 'sections', modes.length, 'modes'); process.exit(0); }
const base = JSON.parse(fs.readFileSync(path, 'utf8'));
assert.equal(JSON.stringify(inv.books), JSON.stringify(base.books), 'Vocabulary books / sections / words / order changed');
assert.equal(inv.ids, base.ids, 'Word IDs or order changed'); assert.equal(inv.totalWords, base.totalWords);
for (const m of base.modes) assert.ok(modes.includes(m), 'Mode removed: ' + m);
console.log(`PASS inventory: ${inv.totalWords} words, ${inv.totalSections} sections, ${inv.books.length} books identical to baseline (sha256 per book); ${base.modes.length} original modes present (+${modes.length - base.modes.length} new)`);
