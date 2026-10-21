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
 await page.locator('#logout').click();
 await page.locator('#login').waitFor({state:'visible'});
 await login('pupil');
 await page.getByText('Мои назначения').waitFor();
 await page.getByText('Начать игру').waitFor();
 await page.locator('#logout').click();
 await page.locator('#login').waitFor({state:'visible'});
 assert.equal(failures.length,0,'browser JS errors: '+failures.join('; '));
 console.log('Real browser login/logout, teacher and pupil RLS-backed cabinet reads passed');
}finally{await browser.close()}
