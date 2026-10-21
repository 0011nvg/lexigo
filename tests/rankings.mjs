import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const modes=['cards','quiz','spell','fix','truefalse','audio','mixed','boss','crystals'];
try{
 await page.goto(process.env.LEXIGO_URL||'http://127.0.0.1:4173/');
 await page.locator('#book').waitFor();
 const lesson=await page.evaluate(()=>{
  const b=DB.books.find(b=>b.sections.some(s=>s.words.length>=3&&s.words.every(w=>isSingleVocabularyWord(w.en))&&uniquePairs(s.words).length===s.words.length&&uniquePairs(s.words).length===s.words.length));
  const index=b?.sections.findIndex(s=>s.words.length>=3&&s.words.every(w=>isSingleVocabularyWord(w.en)));
  return b&&index>=0?{grade:String(b.grade),module:b.sections[index].module,index:String(index)}:null;
 });
 assert.ok(lesson,'Need one complete lesson of >=3 single words');
 await page.locator('#book').selectOption(lesson.grade);
 await page.locator('#module').selectOption(lesson.module);
 await page.locator('#unit').selectOption(lesson.index);
 for(const mode of modes){
  // This checks the result/eligibility UI. Real gameplay is exercised by journeys/learning tests.
  await page.evaluate(mode=>{
   start(mode);
   if(!game)throw Error('Could not start '+mode);
   game.index=game.words.length;game.firstCorrect=game.words.length;
   finish();
  },mode);
  assert.equal(await page.locator('.mode-leaderboard').count(),1,'Full lesson ranking missing for '+mode);
  await page.locator('.mode-leaderboard + .pair-name-form input').fill('Игрок '+mode);
  await page.locator('.mode-leaderboard + .pair-name-form button').click();
  const records=await page.evaluate(()=>JSON.parse(localStorage.getItem('lexigo_mode_records_v1')||'[]'));
  assert.ok(records.some(r=>r.mode===mode&&r.name==='Игрок '+mode),'Ranking not persisted for '+mode);
  await page.evaluate(()=>stop());
  // Partial lesson must not show a form even when its subset is finished.
  await page.locator('#words input[type=checkbox]').first().uncheck();
  await page.evaluate(mode=>{start(mode);if(!game)throw Error('Cannot start partial '+mode);game.index=game.words.length;finish()},mode);
  assert.equal(await page.locator('.mode-leaderboard').count(),0,'Partial lesson ranked for '+mode);
  await page.evaluate(()=>stop());
  await page.locator('#all').click();
  // A timer-triggered early finish cannot enter rankings.
  await page.evaluate(mode=>{start(mode);if(!game)throw Error('Cannot start '+mode);game.index=0;finish()},mode);
  assert.equal(await page.locator('.mode-leaderboard').count(),0,'Early finish ranked for '+mode);
  await page.evaluate(()=>stop());
  console.log('Ranking eligibility and persistence: '+mode+' PASS');
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close()}
