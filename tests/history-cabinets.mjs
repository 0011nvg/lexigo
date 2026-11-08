import assert from 'node:assert/strict';
import {chromium} from './browser-runtime.mjs';
import {useFakeCloud,IDS,FAKE_URL} from './fake-cloud.mjs';
const browser=await chromium.launch({headless:true});
const SITE=(process.env.LEXIGO_URL||'http://127.0.0.1:4173/').replace(/index\.html$/,'');
const samples=[{id:'aaaaaaaa-0000-4000-8000-000000000001',user_id:IDS.student,title:'Слова — тестовая история',mode:'spell',grade:5,section_index:0,created_at:'2026-11-08T08:00:00Z',finished:true,accuracy:0,correct:1,wrong:1,total:2,first_correct:0,xp:0,events:[{w:'s5_2',m:'spell',ok:false,answer:'aplpe',expected:'apple',answered_at:'2026-11-08T08:00:00Z',attempt_index:1},{w:'s5_2',m:'spell',ok:true,r:true,answer:'apple',expected:'apple',answered_at:'2026-11-08T08:01:00Z',attempt_index:2}]},{id:'aaaaaaaa-0000-4000-8000-000000000002',user_id:IDS.student,title:'Старое занятие',mode:'quiz',grade:5,created_at:'2026-11-07T08:00:00Z',finished:true,accuracy:0,correct:0,wrong:1,total:1,first_correct:0,xp:0,events:[{w:'s5_3',ok:false}]}];
async function open(role){
 const page=await browser.newPage({viewport:{width:1280,height:850},reducedMotion:'reduce'});await useFakeCloud(page,{role});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(FAKE_URL+'/rest/v1/**',async route=>{
  const u=new URL(route.request().url()),table=u.pathname.split('/').pop(),one=/vnd\.pgrst\.object/.test(route.request().headers().accept||'');
  let data;
  if(table==='sessions'){data=samples.filter(s=>!u.searchParams.get('id')||'eq.'+s.id===u.searchParams.get('id'));}
  else if(role==='teacher'&&table==='groups')data=[{id:'g1',name:'Тестовый класс',teacher_id:IDS.teacher,join_code:'ABCDEFGH'}];
  else if(role==='teacher'&&table==='group_members')data=[{group_id:'g1',student_id:IDS.student}];
  else if(table==='profiles'&&u.searchParams.get('id')?.startsWith('in.'))data=[{id:IDS.student,display_name:'Маша — тест',role:'student',avatar:'lexi-travel6'}];
  else return route.fallback();
  return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(one?data[0]||null:data)});
 });
 await page.goto(SITE+'me.html');await page.locator('#cab .acc-card, #cab .group-card').first().waitFor();return {page,errors};
}
try{
 const {page,errors}=await open('teacher');await page.getByRole('button',{name:'История',exact:true}).click();const dialog=page.locator('.dialog');await dialog.locator('.attempt-history').waitFor();
 assert.match(await dialog.innerText(),/Маша — тест/);assert.match(await dialog.innerText(),/aplpe/);assert.match(await dialog.innerText(),/Повтор · №2/);assert.match(await dialog.innerText(),/Ответ не записывался/);
 await dialog.getByLabel('Слово или ответ').fill('aplpe');assert.equal(await dialog.locator('tbody tr').count(),1);
 await dialog.getByLabel('Слово или ответ').fill('');await dialog.getByLabel('Только ошибки').check();assert.equal(await dialog.locator('tbody tr').count(),2);
 await dialog.getByLabel('С даты',{exact:true}).fill('2026-11-09');assert.match(await dialog.innerText(),/Нет ответов/);assert.deepEqual(errors,[]);await page.close();
 console.log('PASS cabinets: teacher history reads session details; word, error and date filters work');
 const student=await open('student');await student.page.getByRole('button',{name:'Ответы',exact:true}).first().click();await student.page.locator('.dialog .attempt-history').waitFor();assert.match(await student.page.locator('.dialog').innerText(),/aplpe/);assert.match(await student.page.locator('.dialog').innerText(),/apple/);assert.deepEqual(student.errors,[]);await student.page.close();
 console.log('PASS cabinets: student opens own answers from the session list; no page errors');
}finally{await browser.close();}
