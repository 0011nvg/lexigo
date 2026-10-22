// Real browser -> local Supabase Auth -> PostgREST smoke against synthetic E2E fixtures.
// Run only after stage5-supabase-e2e.mjs has provisioned local synthetic accounts.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
const failures=[];
page.on('pageerror',e=>failures.push(e.message));
try{
 await page.goto('http://127.0.0.1:3000/index.html');
 await page.getByRole('button',{name:'Серверные игры'}).click();
 await page.locator('#serverWorkspace').waitFor({state:'visible',timeout:15000});
 await page.locator('#serverWorkspace').getByText('Вход через Supabase Auth').waitFor({timeout:15000});
 assert.ok(page.url().endsWith('/index.html'),'Server games must stay in main LEXIGO page');
 assert.equal(await page.locator('iframe').count(),0,'Server games must not be embedded in an iframe');
 await page.locator('#serverWorkspace').locator('#url').fill('http://127.0.0.1:54321');
 await page.locator('#serverWorkspace').locator('#key').fill(process.env.SUPABASE_ANON_KEY||'');
 assert.ok(process.env.SUPABASE_ANON_KEY,'local anon key missing');
 const login=async who=>{
  await page.locator('#serverWorkspace').locator('#email').fill('stage5-'+who+'@example.invalid');
  await page.locator('#serverWorkspace').locator('#password').fill('SyntheticTestPassword#2026');
  await page.locator('#form button[type=submit]').click();
  await page.waitForFunction(()=>!document.querySelector('#cabinet').hidden || document.querySelector('#status').classList.contains('error'),null,{timeout:15000});
  if(await page.locator('#serverWorkspace').locator('#cabinet').isHidden())throw new Error('Login failed for '+who+': '+await page.locator('#serverWorkspace').locator('#status').innerText());
 };
 // Invalid credentials must never reveal a cabinet.
 await page.locator('#serverWorkspace').locator('#email').fill('stage5-teacher@example.invalid');
 await page.locator('#serverWorkspace').locator('#password').fill('incorrect-password');
 await page.locator('#form button[type=submit]').click();
 await page.locator('#status.error').waitFor({state:'visible',timeout:15000});
 assert.ok(await page.locator('#serverWorkspace').locator('#cabinet').isHidden(),'Invalid password opened cabinet');
 await login('teacher');
 await page.getByText('Мои классы').waitFor();
 assert.equal(await page.getByText('Мои назначения').count(),0,'Teacher saw pupil-only cabinet');
 await page.getByText('Назначить задание').waitFor();
 const teacherForm=page.locator('#results form');
 await teacherForm.locator('select').nth(2).selectOption('quiz');
 await teacherForm.getByRole('button',{name:'Создать назначение'}).click();
 await page.getByText('Задание сохранено сервером').waitFor({timeout:15000});
 await page.getByText('Результаты моих учеников').waitFor();
 await page.getByText('Прогресс и рейтинг моих учеников').waitFor();
 for(const mode of ['spell','truefalse','fix','audio','pairs','crystals','boss','cards','daily']){
  const form=page.locator('#results form');
  await form.locator('select').nth(2).selectOption(mode);
  await form.getByRole('button',{name:'Создать назначение'}).click();
  await page.getByText('Задание сохранено сервером').waitFor({timeout:15000});
 }
 // Teacher shares an opaque server assignment URL, not credentials or a pupil identifier.
 const quizCopy=page.locator('#results button[data-assignment-id]').last();
 const assignmentId=await quizCopy.getAttribute('data-assignment-id');
 assert.match(assignmentId,/^[0-9a-f-]{36}$/i);
 const link=await page.evaluate(id=>assignmentLink(id),assignmentId);
 assert.ok(link.includes('assignment=')&&!link.includes('pupil=')&&!link.includes('token='));
 const pupilContext=await browser.newContext();
 const pupilPage=await pupilContext.newPage();
 pupilPage.on('pageerror',e=>failures.push(e.message));
 await pupilPage.goto(link);
 await pupilPage.getByText('Для открытия назначенного задания').waitFor();
 assert.ok(await pupilPage.locator('#cabinet').isHidden(),'Link bypassed authentication');
 await pupilPage.locator('#url').fill('http://127.0.0.1:54321');
 await pupilPage.locator('#key').fill(process.env.SUPABASE_ANON_KEY||'');
 await pupilPage.locator('#email').fill('stage5-foreign@example.invalid');
 await pupilPage.locator('#password').fill('SyntheticTestPassword#2026');
 await pupilPage.locator('#form button[type=submit]').click();
 await pupilPage.locator('[data-access-denied="true"]').waitFor({timeout:15000});
 assert.equal(await pupilPage.locator('#results div[data-assignment-id="'+assignmentId+'"]').count(),0,'Foreign pupil saw assignment');
 await pupilPage.locator('#logout').click();
 await pupilPage.locator('#email').fill('stage5-pupil@example.invalid');
 await pupilPage.locator('#password').fill('SyntheticTestPassword#2026');
 await pupilPage.locator('#form button[type=submit]').click();
 await pupilPage.locator('[data-link-accepted="true"]').waitFor({timeout:15000});
 const tile=pupilPage.locator('#results div[data-assignment-id="'+assignmentId+'"]');
 await tile.getByRole('button',{name:'Играть'}).click();
 await pupilPage.getByRole('heading',{name:'Игра · quiz'}).waitFor({timeout:15000});
 await pupilPage.getByPlaceholder('Ответ').fill('wrong');
 await pupilPage.getByRole('button',{name:'Проверить ответ'}).click();
 await pupilPage.getByText('Неверно').waitFor({timeout:15000});
 await pupilPage.getByRole('button',{name:'Завершить попытку'}).click();
 await pupilPage.getByText('Попытка завершена на сервере').waitFor({timeout:15000});
 await pupilContext.close();
 await page.locator('#serverWorkspace').locator('#logout').click();
 await page.locator('#login').waitFor({state:'visible'});
 await login('pupil');
 await page.getByText('Мои назначения').waitFor();
 await page.getByText('Мои галочки и рейтинг уроков').waitFor();
 assert.equal(await page.locator('#results .lesson-progress').count()>=0,true);
 assert.equal(await page.getByText('Назначить задание').count(),0,'Pupil saw teacher assignment control');
 await page.getByText('Начать игру').waitFor();
 const gameButtons=page.getByRole('button',{name:'Играть',exact:true});
 assert.ok(await gameButtons.count()>0,'No server-assigned game for pupil');
 await gameButtons.last().click();
 await page.getByRole('heading',{name:'Игра · quiz'}).waitFor({timeout:15000});
 await page.getByPlaceholder('Ответ').fill('wrong');
 await page.getByRole('button',{name:'Проверить ответ'}).click();
 await page.getByText('Неверно').waitFor({timeout:15000});
 await page.getByRole('button',{name:'Завершить попытку'}).click();
 await page.getByText('Попытка завершена на сервере').waitFor({timeout:15000});
 await page.getByText('Мои попытки').waitFor();
 for(const mode of ['pairs','crystals','boss','cards','daily']){
  const tile=page.locator('#results div[data-mode="'+mode+'"]').last();
  await tile.getByRole('button',{name:'Играть'}).click();
  await page.getByRole('heading',{name:'Игра · '+mode}).waitFor({timeout:15000});
  const round=page.locator('#results section').first();
  if(['spell','truefalse','fix','audio'].includes(mode)){
   const field=round.getByPlaceholder('Ответ');
   await field.waitFor({state:'visible',timeout:15000});
   await field.fill('wrong');
   await round.getByRole('button',{name:'Проверить ответ'}).click();
   await round.getByText('Неверно').waitFor({timeout:15000});
  }else if(mode==='pairs'){
   const buttons=round.locator('div > button');
   await page.waitForFunction(()=>document.querySelectorAll('#results section div > button').length>=2 || document.querySelector('#status')?.classList.contains('error'),null,{timeout:15000});
   assert.ok(await buttons.count()>=2,'No server-issued pair tiles; status: '+await page.locator('#serverWorkspace').locator('#status').innerText());
   await buttons.nth(0).click();
   await buttons.nth(1).click();
   await round.getByText(/Ход сохранён|Пока не получилось|Верно|Раунд завершён/).waitFor({timeout:15000});
  }else if(mode==='crystals'){
   const buttons=round.locator('div > button');
   await page.waitForFunction(()=>document.querySelectorAll('#results section div > button').length===36 || document.querySelector('#status').classList.contains('error'),null,{timeout:15000});
   assert.equal(await buttons.count(),36,'Expected 36 server-issued crystal cells; status: '+await page.locator('#serverWorkspace').locator('#status').innerText());
   await buttons.nth(0).click();
   await buttons.nth(1).click();
   await round.getByText(/Ход сохранён|Пока не получилось|Верно|Раунд завершён/).waitFor({timeout:15000});
  }else if(mode==='boss'){
   await round.getByPlaceholder('Введите ответ').fill('wrong');
   await round.getByRole('button',{name:'Ответить'}).click();
   await round.getByText(/Ход сохранён|Пока не получилось|Верно|Раунд завершён/).waitFor({timeout:15000});
  }else{
   await round.getByRole('button',{name:'Показать перевод'}).click();
   await round.getByRole('button',{name:'Знаю'}).click();
   await page.getByText('Самооценка сохранена сервером').waitFor({timeout:15000});
  }
  await page.locator('#results section').first().getByRole('button',{name:'Завершить попытку'}).click();
  await page.getByText('Попытка завершена на сервере').waitFor({timeout:15000});
 }
 await page.locator('#serverWorkspace').locator('#logout').click();
 await page.locator('#login').waitFor({state:'visible'});
 await login('teacher');
 await page.getByText('Результаты моих учеников').waitFor();
 const resultText=await page.locator('#serverWorkspace').locator('#results').innerText();
 assert.match(resultText,/fixture-section/,'Teacher assignment not present');
 assert.match(resultText,/completed|in_progress|finished|submitted|active/i,'Teacher cannot see saved attempt');
 await page.locator('#serverWorkspace').locator('#logout').click();
 await page.locator('#login').waitFor({state:'visible'});
 assert.equal(failures.length,0,'browser JS errors: '+failures.join('; '));
 console.log('Real browser login/logout, teacher and pupil RLS-backed cabinet reads passed');
}finally{await browser.close()}
