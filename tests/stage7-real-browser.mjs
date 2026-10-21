// Real browser -> local Supabase Auth -> PostgREST smoke against synthetic E2E fixtures.
// Run only after stage5-supabase-e2e.mjs has provisioned local synthetic accounts.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
const failures=[];
page.on('pageerror',e=>failures.push(e.message));
try{
 await page.goto('http://127.0.0.1:3000/stage7-local-cabinet.html');
 await page.locator('#url').fill('http://127.0.0.1:54321');
 await page.locator('#key').fill(process.env.SUPABASE_ANON_KEY||'');
 assert.ok(process.env.SUPABASE_ANON_KEY,'local anon key missing');
 const login=async who=>{
  await page.locator('#email').fill('stage5-'+who+'@example.invalid');
  await page.locator('#password').fill('SyntheticTestPassword#2026');
  await page.locator('#form button[type=submit]').click();
  await page.locator('#cabinet').waitFor({state:'visible',timeout:15000});
 };
 await login('teacher');
 await page.getByText('Мои классы').waitFor();
 await page.getByText('Назначить задание').waitFor();
 const teacherForm=page.locator('#results form');
 await teacherForm.locator('select').nth(2).selectOption('quiz');
 await teacherForm.getByRole('button',{name:'Создать назначение'}).click();
 await page.getByText('Задание сохранено сервером').waitFor({timeout:15000});
 await page.getByText('Результаты моих учеников').waitFor();
 await page.locator('#logout').click();
 await page.locator('#login').waitFor({state:'visible'});
 await login('pupil');
 await page.getByText('Мои назначения').waitFor();
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
 await page.locator('#logout').click();
 await page.locator('#login').waitFor({state:'visible'});
 await login('teacher');
 await page.getByText('Результаты моих учеников').waitFor();
 const resultText=await page.locator('#results').innerText();
 assert.match(resultText,/fixture-section/,'Teacher assignment not present');
 assert.match(resultText,/completed|in_progress|finished|submitted|active/i,'Teacher cannot see saved attempt');
 await page.locator('#logout').click();
 await page.locator('#login').waitFor({state:'visible'});
 assert.equal(failures.length,0,'browser JS errors: '+failures.join('; '));
 console.log('Real browser login/logout, teacher and pupil RLS-backed cabinet reads passed');
}finally{await browser.close()}
