// Real local Supabase Auth -> PostgREST -> Edge Runtime -> PostgreSQL RPC.
// Server-owned challenges, synthetic vocabulary and localhost-only demo are CI tested.
// Uses only synthetic users and CLI-generated ephemeral local keys.
import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';
import {randomUUID} from 'node:crypto';
const base='http://127.0.0.1:54321';
const anon=process.env.SUPABASE_ANON_KEY;
const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(anon&&service,'Local CLI-generated API keys are required');
const uuid='00000000-0000-4000-8000-0000000000';
const ids={org:uuid+'01',teacher2:uuid+'02',classA:uuid+'03',classB:uuid+'04',assignment:'',attempt:''};
async function api(path,{method='GET',key=anon,token=key,body,schema}={}){
 const res=await fetch(base+path,{method,headers:{
 apikey:key,authorization:'Bearer '+token,
 ...(body?{'content-type':'application/json'}:{}),
 ...(schema?{'accept-profile':schema,'content-profile':schema}:{}),
 ...(method==='POST'?{prefer:'return=representation'}:{})
 },body:body?JSON.stringify(body):undefined});
 const raw=await res.text();let data;try{data=JSON.parse(raw)}catch{data=raw}
 return {status:res.status,data};
}
async function signup(label){
 const email='stage5-'+label+'@example.invalid';
 const result=await api('/auth/v1/signup',{method:'POST',body:{email,password:'SyntheticTestPassword#2026'}});
 assert.ok(result.status===200||result.status===201,'Signup '+label+': '+JSON.stringify(result));
 assert.ok(result.data.user?.id&&result.data.access_token,'Auth did not issue JWT '+label);
 return {id:result.data.user.id,jwt:result.data.access_token};
}
async function insert(table,rows){
 const result=await api('/rest/v1/'+table,{method:'POST',key:service,body:rows,schema:'lexigo'});
 assert.ok(result.status===201||result.status===200,table+': '+JSON.stringify(result));
 return result.data;
}
async function edge(route,jwt,body){
 return api('/functions/v1/learning-api/'+route,{method:'POST',token:jwt,body});
}
async function main(){
 for(let n=0;n<40;n++){try{const r=await fetch(base+'/auth/v1/health');if(r.ok)break}catch{}await sleep(1000)}
 // Supabase gateway may answer OPTIONS itself (200), bypassing Edge OPTIONS.
 // Verify a browser preflight succeeds; access remains protected by Auth JWT/RLS.
 const preflight=await fetch(base+'/functions/v1/learning-api/next-question',
 {method:'OPTIONS',headers:{origin:'http://127.0.0.1:3000',
 'access-control-request-method':'POST',
 'access-control-request-headers':'authorization,content-type'}});
 assert.ok(preflight.status===200||preflight.status===204,
 'Local preflight rejected '+preflight.status);
 const [teacher,pupil,parent,foreign,newPupil]=await Promise.all(['teacher','pupil','parent','foreign','newpupil'].map(signup));
 await insert('organizations',[{id:ids.org,name:'Fixture school A'},{id:ids.teacher2,name:'Fixture school B'}]);
 await insert('profiles',[
 {user_id:teacher.id,organization_id:ids.org,role:'teacher',display_name:'Teacher'},
 {user_id:pupil.id,organization_id:ids.org,role:'pupil',display_name:'Pupil'},
 {user_id:parent.id,organization_id:ids.org,role:'parent',display_name:'Parent'},
 {user_id:foreign.id,organization_id:ids.teacher2,role:'pupil',display_name:'Foreign pupil'},
 {user_id:newPupil.id,organization_id:ids.org,role:'pupil',display_name:'New pupil'}
 ]);
 await insert('classes',[{id:ids.classA,organization_id:ids.org,teacher_user_id:teacher.id,grade:2,title:'2A'}]);
 await insert('enrollments',[{class_id:ids.classA,pupil_user_id:pupil.id}]);
 await insert('vocabulary_sections',[{id:'fixture-section',grade:2,module:'1',title:'Test',order_index:0}]);
 await insert('vocabulary_words',[{id:'fixture-word',section_id:'fixture-section',en:'hello',ru:'привет',order_index:0},
 {id:'fixture-second',section_id:'fixture-section',en:'world',ru:'мир',order_index:1}]);
 let r=await edge('create-assignment',teacher.jwt,{classId:ids.classA,sectionId:'fixture-section',mode:'quiz',dueAt:'2030-01-01T00:00:00Z',audience:'individual',recipients:[pupil.id]});
 assert.equal(r.status,200,'Teacher assignment '+JSON.stringify(r));ids.assignment=r.data.id;
 // Stage 7 cabinet contract: real Auth JWT + PostgREST lexigo schema, no client-side role authority.
 const cabinetRead=(table,query,jwt)=>api('/rest/v1/'+table+'?'+query,{token:jwt,schema:'lexigo'});
 let view=await cabinetRead('profiles','select=user_id,role,display_name&user_id=eq.'+teacher.id,teacher.jwt);
 assert.equal(view.status,200);assert.equal(view.data.length,1);assert.equal(view.data[0].role,'teacher');
 view=await cabinetRead('classes','select=id,title,grade&teacher_user_id=eq.'+teacher.id,teacher.jwt);
 assert.equal(view.status,200);assert.equal(view.data.length,1);
 view=await cabinetRead('assignments','select=id,section_id,mode,class_id&created_by=eq.'+teacher.id,teacher.jwt);
 assert.equal(view.status,200);assert.equal(view.data.length,1);
 view=await cabinetRead('assignment_recipients','select=assignment_id&pupil_user_id=eq.'+pupil.id,pupil.jwt);
 assert.equal(view.status,200);assert.equal(view.data.length,1);
 view=await cabinetRead('assignment_recipients','select=assignment_id&pupil_user_id=eq.'+pupil.id,foreign.jwt);
 assert.equal(view.status,200);assert.equal(view.data.length,0,'Foreign pupil read assignment recipient');
 view=await cabinetRead('profiles','select=user_id,role,display_name&user_id=eq.'+teacher.id,foreign.jwt);
 assert.equal(view.status,200);assert.equal(view.data.length,0,'Foreign pupil read teacher profile');
 view=await cabinetRead('classes','select=id,title,grade&teacher_user_id=eq.'+teacher.id,foreign.jwt);
 assert.equal(view.status,200);assert.equal(view.data.length,0,'Foreign pupil read teacher class');
 const impersonate=await edge('create-assignment',pupil.jwt,{classId:ids.classA,sectionId:'fixture-section',mode:'quiz',dueAt:'2030-01-01T00:00:00Z',audience:'individual',recipients:[pupil.id]});
 assert.equal(impersonate.status,403,'Pupil forged teacher assignment');
 const spoof=await edge('create-assignment',pupil.jwt,{actorId:teacher.id,classId:ids.classA,sectionId:'fixture-section',mode:'quiz',dueAt:'2030-01-01T00:00:00Z',audience:'individual',recipients:[pupil.id]});
 assert.equal(spoof.status,400,'Client-supplied teacher identity accepted');

 // Direct PostgREST writes must fail even for a legitimate teacher.
 for(const table of ['assignments','assignment_recipients','attempts','attempt_events']){
  const direct=await api('/rest/v1/'+table,{method:'POST',token:teacher.jwt,
   schema:'lexigo',body:table==='assignments'?{class_id:ids.classA,created_by:teacher.id,
   section_id:'fixture-section',mode:'quiz',due_at:'2030-01-01T00:00:00Z',audience_type:'class'}:{}});
  assert.equal(direct.status,403,'Direct '+table+' write bypassed Edge: '+JSON.stringify(direct));
 }
 r=await edge('create-assignment',parent.jwt,{classId:ids.classA,sectionId:'fixture-section',mode:'quiz',dueAt:'2030-01-01T00:00:00Z',audience:'class',recipients:[]});
 assert.equal(r.status,403,'Parent created assignment');
 r=await edge('create-assignment',teacher.jwt,{actor:teacher.id,classId:ids.classA,sectionId:'fixture-section',mode:'quiz',dueAt:'2030-01-01T00:00:00Z',audience:'class',recipients:[]});
 assert.equal(r.status,400,'Actor spoofing accepted');
 r=await edge('start-attempt',foreign.jwt,{assignmentId:ids.assignment,sessionId:ids.classB});
 assert.equal(r.status,403,'Foreign pupil started attempt');
 r=await edge('start-attempt',pupil.jwt,{assignmentId:ids.assignment,sessionId:ids.classB});
 assert.equal(r.status,200,'Pupil start '+JSON.stringify(r));ids.attempt=r.data.id;
 r=await edge('start-attempt',pupil.jwt,{assignmentId:ids.assignment,sessionId:ids.classB});
 assert.equal(r.status,200,'Start retry '+JSON.stringify(r));assert.equal(r.data.id,ids.attempt);
 // Concurrent retries must resolve to one attempt.
 const sessions=await Promise.all(Array.from({length:5},()=>edge('start-attempt',pupil.jwt,
 {assignmentId:ids.assignment,sessionId:ids.classB})));
 assert.ok(sessions.every(x=>x.status===200&&x.data.id===ids.attempt),
 'Concurrent session idempotency failed: '+JSON.stringify(sessions));
 // Real Auth JWT -> server-issued challenge; concurrent fetch is idempotent.
 const questions=await Promise.all(Array.from({length:5},()=>edge('next-question',pupil.jwt,{attemptId:ids.attempt})));
 assert.ok(questions.every(x=>x.status===200&&x.data.challengeId===questions[0].data.challengeId),
 'Concurrent challenge issuance changed identity: '+JSON.stringify(questions));
 const question=questions[0].data;
 assert.equal(question.index,0);
 assert.ok(['fixture-word','fixture-second'].includes(question.wordId));
 assert.equal(question.mode,'quiz');
 const forged=await edge('answer-question',pupil.jwt,{attemptId:ids.attempt,
 challengeId:question.challengeId,index:0,wordId:'fake-word',answer:'hello'});
 assert.equal(forged.status,403,'Forged wordId accepted');
 const badActor=await edge('answer-question',parent.jwt,{attemptId:ids.attempt,
 challengeId:question.challengeId,index:0,wordId:question.wordId,answer:'hello'});
 assert.equal(badActor.status,403,'Parent forged pupil response');
 const injected=await edge('answer-question',pupil.jwt,{attemptId:ids.attempt,
 challengeId:question.challengeId,index:0,wordId:question.wordId,answer:'hello',correct:true});
 assert.equal(injected.status,400,'Client correctness injected');
 const expectedTranslation=question.wordId==='fixture-word'?'привет':'мир';
 const hint=await edge('hint-question',pupil.jwt,{attemptId:ids.attempt,challengeId:question.challengeId});
 assert.equal(hint.status,200,'Hint rejected');assert.equal(hint.data.hinted,true);
 const forbiddenHint=await edge('hint-question',foreign.jwt,{attemptId:ids.attempt,challengeId:question.challengeId});
 assert.equal(forbiddenHint.status,403,'Foreign hint allowed');
 const response={attemptId:ids.attempt,challengeId:question.challengeId,index:0,
 wordId:question.wordId,answer:expectedTranslation};
 const concurrent=await Promise.all(Array.from({length:5},()=>edge('answer-question',pupil.jwt,response)));
 assert.ok(concurrent.every(x=>x.status===200&&x.data.id===concurrent[0].data.id),
 'Concurrent challenge answers not idempotent: '+JSON.stringify(concurrent));
 assert.ok(concurrent.every(x=>x.data.correct===true),'Server quiz answer not verified');
 const conflicting=await edge('answer-question',pupil.jwt,{...response,answer:'wrong'});
 assert.equal(conflicting.status,409,'Changed answer replay accepted');
 const grading=await api('/rest/v1/attempt_events?select=verified_correct,verification_source&attempt_id=eq.'+ids.attempt,
 {token:teacher.jwt,schema:'lexigo'});
 assert.equal(grading.data[0]?.verified_correct,true,'Server did not grade correct response');
 assert.equal(grading.data[0]?.verification_source,'server_evaluated');
 const direct=await api('/rest/v1/attempt_events?id=eq.'+concurrent[0].data.id,
 {method:'PATCH',token:pupil.jwt,schema:'lexigo',body:{verified_correct:false}});
 assert.equal(direct.status,403,'Direct score edit accepted');
 const next=await edge('next-question',pupil.jwt,{attemptId:ids.attempt});
 assert.equal(next.status,200,'Next challenge missing');
 assert.equal(next.data.index,1,'Challenge sequence not advanced');
 const wrong=await edge('answer-question',pupil.jwt,{attemptId:ids.attempt,
 challengeId:next.data.challengeId,index:1,wordId:next.data.wordId,answer:'wrong'});
 assert.equal(wrong.status,200);
 assert.equal(wrong.data.correct,false,'Wrong answer accepted as correct');
 assert.equal(wrong.data.complete,false,'First wrong answer prematurely finalized');
 const repeatedWrong=await edge('answer-question',pupil.jwt,{attemptId:ids.attempt,
 challengeId:next.data.challengeId,index:1,wordId:next.data.wordId,answer:'wrong'});
 assert.equal(repeatedWrong.data.remaining,wrong.data.remaining,'Repeated wrong answer consumed retry');
 const secondWrong=await edge('answer-question',pupil.jwt,{attemptId:ids.attempt,
 challengeId:next.data.challengeId,index:1,wordId:next.data.wordId,answer:'wrong again'});
 assert.equal(secondWrong.data.complete,false);
 const finalWrong=await edge('answer-question',pupil.jwt,{attemptId:ids.attempt,
 challengeId:next.data.challengeId,index:1,wordId:next.data.wordId,answer:'wrong finally'});
 assert.equal(finalWrong.data.complete,true,'Retry cap not enforced');
 const stale=await edge('answer-question',pupil.jwt,{attemptId:ids.attempt,
 challengeId:question.challengeId,index:1,wordId:question.wordId,answer:'hello'});
 assert.equal(stale.status,403,'Challenge index substitution accepted');
 const old=await edge('submit-answer',pupil.jwt,{attemptId:ids.attempt,index:2,
 wordId:'fixture-word',answer:'hello',hinted:false,retry:false});
 assert.equal(old.status,410,'Predictable legacy scoring still available');
 // Objective text modes use server-issued, server-graded challenges.
 for(const [k,mode] of ['spell','truefalse','fix','audio'].entries()){
  const assignment=await edge('create-assignment',teacher.jwt,{classId:ids.classA,
   sectionId:'fixture-section',mode,dueAt:'2030-01-01T00:00:00Z',
   audience:'individual',recipients:[pupil.id]});
  assert.equal(assignment.status,200,'Create '+mode+' '+JSON.stringify(assignment));
  const started=await edge('start-attempt',pupil.jwt,{assignmentId:assignment.data.id,
   sessionId:'00000000-0000-4000-8000-'+String(100+k).padStart(12,'0')});
  assert.equal(started.status,200,'Start '+mode);
  const challenge=await edge('next-question',pupil.jwt,{attemptId:started.data.id});
  assert.equal(challenge.status,200,'Issue '+mode);
  const en=challenge.data.wordId==='fixture-word'?'hello':'world';
  const ru=challenge.data.wordId==='fixture-word'?'привет':'мир';
  const answer=mode==='truefalse'?String(challenge.data.question.proposed===ru):en;
  const scored=await edge('answer-question',pupil.jwt,{attemptId:started.data.id,
   challengeId:challenge.data.challengeId,index:challenge.data.index,
   wordId:challenge.data.wordId,answer});
  assert.equal(scored.status,200,'Grade '+mode+' '+JSON.stringify(scored));
  assert.equal(scored.data.correct,true,'Wrong grading for '+mode);
 }
 // Challenge secrets must never be exposed through client PostgREST.
 const hiddenChallenges=await api('/rest/v1/attempt_challenges?select=expected,private_state',
 {token:pupil.jwt,schema:'lexigo'});
 assert.equal(hiddenChallenges.status,403,'Pupil read server challenge answers');
 const hiddenActions=await api('/rest/v1/challenge_actions?select=*',
 {token:teacher.jwt,schema:'lexigo'});
 assert.equal(hiddenActions.status,403,'Teacher read private replay journal');
 // Stateful pair matching: server checks both sides and tile ownership.
 const pairAssignment=await edge('create-assignment',teacher.jwt,{classId:ids.classA,
 sectionId:'fixture-section',mode:'pairs',dueAt:'2030-01-01T00:00:00Z',
 audience:'individual',recipients:[pupil.id]});
 assert.equal(pairAssignment.status,200);
 const pairAttempt=await edge('start-attempt',pupil.jwt,{assignmentId:pairAssignment.data.id,
 sessionId:'00000000-0000-4000-8000-000000000301'});
 assert.equal(pairAttempt.status,200);
 const pairQuestion=await edge('next-question',pupil.jwt,{attemptId:pairAttempt.data.id});
 assert.equal(pairQuestion.status,200,'Pair challenge '+JSON.stringify(pairQuestion));
 assert.equal(pairQuestion.data.question.responseType,'pairs');
 const tiles=pairQuestion.data.question.tiles;
 assert.equal(tiles.length,4);
 assert.ok(tiles.every(t=>!Object.hasOwn(t,'word')),'Private pair IDs leaked');
 const pairAction=(action,payload,requestId=randomUUID(),jwt=pupil.jwt)=>
 edge('play-round',jwt,{attemptId:pairAttempt.data.id,challengeId:pairQuestion.data.challengeId,
 requestId,action,payload});
 const teacherTamper=await pairAction('hint',{},randomUUID(),teacher.jwt);
 assert.equal(teacherTamper.status,403,'Teacher forged pupil gameplay');
 const foreignTamper=await pairAction('hint',{},randomUUID(),foreign.jwt);
 assert.equal(foreignTamper.status,403,'Foreign pupil manipulated round');
 const scoreInjection=await edge('play-round',pupil.jwt,{attemptId:pairAttempt.data.id,
 challengeId:pairQuestion.data.challengeId,requestId:randomUUID(),action:'pair',
 payload:{first:tiles[0].id,second:tiles[1].id,correct:true}});
 assert.equal(scoreInjection.status,400,'Client score injection accepted');
 let pairBad=await pairAction('pair',{first:tiles[0].id,second:'00000000-0000-4000-8000-000000000099'});
 assert.equal(pairBad.status,403,'Invented tile accepted');
 const wrongPair=tiles.find(t=>t.side!==tiles[0].side&&
 ((tiles[0].text==='hello'&&t.text!=='привет')||
 (tiles[0].text==='world'&&t.text!=='мир')||
 (tiles[0].text==='привет'&&t.text!=='hello')||
 (tiles[0].text==='мир'&&t.text!=='world')));
 assert.ok(wrongPair);
 const incorrectPair=await pairAction('pair',{first:tiles[0].id,second:wrongPair.id});
 assert.equal(incorrectPair.status,200);
 assert.equal(incorrectPair.data.correct,false);
 const groups=[['hello','привет'],['world','мир']];
 for(const [en,ru] of groups){
  const t1=tiles.find(t=>t.text===en),t2=tiles.find(t=>t.text===ru);
  const payload={first:t1.id,second:t2.id},requestId=randomUUID();
  const parallel=await Promise.all(Array.from({length:5},()=>pairAction('pair',payload,requestId)));
  assert.ok(parallel.every(x=>x.status===200),'Concurrent pair mismatch '+JSON.stringify(parallel));
  assert.ok(parallel.every(x=>x.data.correct===true),'Valid pair rejected');
  const changed=await pairAction('pair',{first:t2.id,second:t1.id},requestId);
  assert.equal(changed.status,409,'Replayed request ID with altered pair accepted');
 }
 const afterPair=await pairAction('pair',{first:tiles[0].id,second:tiles[1].id});
 assert.equal(afterPair.status,403,'Completed pair challenge reopened');
 const bypassPair=await edge('answer-question',pupil.jwt,{attemptId:pairAttempt.data.id,
 challengeId:pairQuestion.data.challengeId,index:0,wordId:pairQuestion.data.wordId,answer:'hello'});
 assert.equal(bypassPair.status,403,'Text API bypassed pair state');
 const unauthorizedPair=await pairAction('hint',{},randomUUID(),parent.jwt);
 assert.equal(unauthorizedPair.status,403,'Parent manipulated pair state');

 // Crystals: server validates adjacent swaps, move limits, board and replay.
 const crystalAssignment=await edge('create-assignment',teacher.jwt,{classId:ids.classA,
 sectionId:'fixture-section',mode:'crystals',dueAt:'2030-01-01T00:00:00Z',
 audience:'individual',recipients:[pupil.id]});
 assert.equal(crystalAssignment.status,200);
 const crystalAttempt=await edge('start-attempt',pupil.jwt,{assignmentId:crystalAssignment.data.id,
 sessionId:'00000000-0000-4000-8000-000000000302'});
 assert.equal(crystalAttempt.status,200);
 const crystalQuestion=await edge('next-question',pupil.jwt,{attemptId:crystalAttempt.data.id});
 assert.equal(crystalQuestion.status,200);
 assert.equal(crystalQuestion.data.question.board.length,36);
 const crystalAction=(payload,requestId=randomUUID())=>edge('play-round',pupil.jwt,{
 attemptId:crystalAttempt.data.id,challengeId:crystalQuestion.data.challengeId,
 requestId,action:'swap',payload});
 const far=await crystalAction({from:0,to:15});
 assert.equal(far.status,403,'Nonadjacent crystal swap accepted');
 const firstSwapId=randomUUID();
 const simultaneousSwaps=await Promise.all(Array.from({length:5},()=>crystalAction({from:0,to:1},firstSwapId)));
 assert.ok(simultaneousSwaps.every(x=>x.status===200),'Crystal concurrency '+JSON.stringify(simultaneousSwaps));
 assert.deepEqual(simultaneousSwaps.map(x=>x.data),Array(5).fill(simultaneousSwaps[0].data));
 let crystalLast=simultaneousSwaps[0];
 for(let i=1;i<7&&!crystalLast.data.boardComplete;i++){
  crystalLast=await crystalAction({from:0,to:1});
  assert.equal(crystalLast.status,200,'Crystal move '+i+' '+JSON.stringify(crystalLast));
 }
 assert.equal(crystalLast.data.boardComplete,true,'Seven swaps did not open vocabulary test');
 assert.equal(crystalLast.data.complete,false,'Gem swaps falsely verified vocabulary');
 assert.ok(crystalLast.data.hits>=0);
 const extraCrystal=await crystalAction({from:0,to:1});
 assert.equal(extraCrystal.status,403,'Extra crystal swap after seven moves accepted');
 const crystalAnswer=async(answer)=>edge('play-round',pupil.jwt,{
 attemptId:crystalAttempt.data.id,challengeId:crystalQuestion.data.challengeId,
 requestId:randomUUID(),action:'answer',payload:{answer}});
 const crystalCorrect=await crystalAnswer(crystalQuestion.data.wordId==='fixture-word'?'hello':'world');
 assert.equal(crystalCorrect.status,200,'Crystal vocabulary answer '+JSON.stringify(crystalCorrect));
 assert.equal(crystalCorrect.data.complete,true,'Crystal word not graded');
 assert.equal(crystalCorrect.data.correct,true);
 const crystalRead=await api('/rest/v1/attempt_events?select=verified_correct&id=eq.'+crystalCorrect.data.eventId,
 {token:teacher.jwt,schema:'lexigo'});
 assert.equal(crystalRead.data[0]?.verified_correct,true);

 // Boss: 3 server-owned phases, hint and retry cannot be spoofed.
 const bossAssignment=await edge('create-assignment',teacher.jwt,{classId:ids.classA,
 sectionId:'fixture-section',mode:'boss',dueAt:'2030-01-01T00:00:00Z',
 audience:'individual',recipients:[pupil.id]});
 assert.equal(bossAssignment.status,200);
 const bossAttempt=await edge('start-attempt',pupil.jwt,{assignmentId:bossAssignment.data.id,
 sessionId:'00000000-0000-4000-8000-000000000303'});
 assert.equal(bossAttempt.status,200);
 const bossQuestion=await edge('next-question',pupil.jwt,{attemptId:bossAttempt.data.id});
 assert.equal(bossQuestion.status,200);
 assert.equal(bossQuestion.data.question.responseType,'boss');
 const bossAction=(action,payload={})=>edge('play-round',pupil.jwt,{
 attemptId:bossAttempt.data.id,challengeId:bossQuestion.data.challengeId,
 requestId:randomUUID(),action,payload});
 const bossHint=await bossAction('hint');
 assert.equal(bossHint.status,200,'Boss hint denied');
 const secondHint=await bossAction('hint');
 assert.equal(secondHint.status,403,'Unlimited boss hints accepted');
 const miss=await bossAction('answer',{answer:'wrong'});
 assert.equal(miss.status,200);assert.equal(miss.data.correct,false);
 const blocked=await bossAction('answer',{answer:'wrong'});
 assert.equal(blocked.status,400,'Boss retry gate bypassed');
 const retry=await bossAction('retry');
 assert.equal(retry.status,200,'Boss retry denied');
 const q0=bossQuestion.data.question.question;
 const bossFirst=await bossAction('answer',{answer:q0.prompt.endsWith('hello')?'привет':'мир'});
 assert.equal(bossFirst.status,200,'Boss quiz '+JSON.stringify(bossFirst));
 assert.equal(bossFirst.data.correct,true);
 const q1=bossFirst.data.nextQuestion;
 const bossSecond=await bossAction('answer',{answer:q1.prompt==='привет'?'hello':'world'});
 assert.equal(bossSecond.status,200,'Boss spell '+JSON.stringify(bossSecond));
 assert.equal(bossSecond.data.correct,true);
 const q2=bossSecond.data.nextQuestion;
 const bossExpected=q0.prompt.endsWith('hello')?'привет':'мир';
 const bossThird=await bossAction('answer',{answer:String(q2.proposed===bossExpected)});
 assert.equal(bossThird.status,200,'Boss truefalse '+JSON.stringify(bossThird));
 assert.equal(bossThird.data.complete,true);
 assert.equal(bossThird.data.passed,true);
 const bossReplay=await bossAction('answer',{answer:'true'});
 assert.equal(bossReplay.status,403,'Completed boss reopened');
 // Self-rating is independent of server-graded answers.
 const cards=await edge('create-assignment',teacher.jwt,{classId:ids.classA,
 sectionId:'fixture-section',mode:'cards',dueAt:'2030-01-01T00:00:00Z',
 audience:'individual',recipients:[pupil.id]});
 assert.equal(cards.status,200);
 const cardStart=await edge('start-attempt',pupil.jwt,{assignmentId:cards.data.id,
 sessionId:'00000000-0000-4000-8000-000000000055'});
 assert.equal(cardStart.status,200);
 const cardEvent=await edge('append-event',pupil.jwt,{attemptId:cardStart.data.id,
 index:0,wordId:'fixture-word',kind:'card_self_rating',correct:null,
 hinted:false,retry:false,rating:'known'});
 assert.equal(cardEvent.status,200);
 const cardRead=await api('/rest/v1/attempt_events?select=verified_correct,verification_source,self_rating&id=eq.'+cardEvent.data.id,
 {token:teacher.jwt,schema:'lexigo'});
 assert.equal(cardRead.data[0]?.verified_correct,null);
 assert.equal(cardRead.data[0]?.verification_source,'client_unverified');
 const dailyAssignment=await edge('create-assignment',teacher.jwt,{classId:ids.classA,
 sectionId:'fixture-section',mode:'daily',dueAt:'2030-01-01T00:00:00Z',
 audience:'individual',recipients:[pupil.id]});
 assert.equal(dailyAssignment.status,200,'Daily assignment '+JSON.stringify(dailyAssignment));
 const dailyAttempt=await edge('start-attempt',pupil.jwt,{assignmentId:dailyAssignment.data.id,
 sessionId:'00000000-0000-4000-8000-000000000304'});
 assert.equal(dailyAttempt.status,200);
 const dailyEvent=await edge('append-event',pupil.jwt,{attemptId:dailyAttempt.data.id,
 index:0,wordId:'fixture-word',kind:'card_self_rating',correct:null,
 hinted:false,retry:false,rating:'unknown'});
 assert.equal(dailyEvent.status,200,'Daily self rating '+JSON.stringify(dailyEvent));
 const dailyRead=await api('/rest/v1/attempt_events?select=verified_correct,verification_source,self_rating&id=eq.'+dailyEvent.data.id,
 {token:teacher.jwt,schema:'lexigo'});
 assert.equal(dailyRead.data[0]?.verified_correct,null);
 assert.equal(dailyRead.data[0]?.self_rating,'unknown');
 r=await edge('finish-attempt',pupil.jwt,{attemptId:ids.attempt});assert.equal(r.status,200,'Finish '+JSON.stringify(r));
 const progressPupil=await api('/rest/v1/lesson_attempt_progress?select=attempt_id,section_id,mode,total_words,covered_words,lesson_completed,ranking_eligible,accuracy_pct&attempt_id=eq.'+ids.attempt,{token:pupil.jwt,schema:'lexigo'});
 assert.equal(progressPupil.status,200,'Pupil RLS progress '+JSON.stringify(progressPupil));
 assert.equal(progressPupil.data.length,1,'Pupil must see own attempt progress');
 const progress=progressPupil.data[0];
 assert.equal(progress.total_words,2,'Progress must use full server vocabulary section');
 assert.equal(progress.lesson_completed,progress.covered_words===2,'Completion must require every word');
 assert.equal(progress.ranking_eligible,progress.covered_words===2,'Partial attempt must not enter ranking');
 const wordsOwn=await api('/rest/v1/lesson_word_progress?select=word_id,practiced,mastered,clean_correct_attempts,section_id&section_id=eq.fixture-section&mode=eq.quiz',{token:pupil.jwt,schema:'lexigo'});
 assert.equal(wordsOwn.status,200,'Pupil word mastery RLS '+JSON.stringify(wordsOwn));
 assert.equal(wordsOwn.data.length,2,'Both lesson words must be present in mastery view');
 assert.ok(wordsOwn.data.every(w=>w.mastered===false),'One attempt must never mark a word mastered');
 const wordsForeign=await api('/rest/v1/lesson_word_progress?select=word_id&section_id=eq.fixture-section',{token:foreign.jwt,schema:'lexigo'});
 assert.equal(wordsForeign.status,200);assert.equal(wordsForeign.data.length,0,'Unassigned pupil must not see mastery records');
 const progressTeacher=await api('/rest/v1/lesson_attempt_progress?select=attempt_id&attempt_id=eq.'+ids.attempt,{token:teacher.jwt,schema:'lexigo'});
 assert.equal(progressTeacher.status,200);assert.equal(progressTeacher.data.length,1,'Teacher must see enrolled pupil progress');
 const progressOther=await api('/rest/v1/lesson_attempt_progress?select=attempt_id&attempt_id=eq.'+ids.attempt,{token:foreign.jwt,schema:'lexigo'});
 assert.equal(progressOther.status,200);assert.equal(progressOther.data.length,0,'Unassigned pupil must not see another pupil ranking');
 r=await edge('next-question',pupil.jwt,{attemptId:ids.attempt});assert.equal(r.status,403,'Challenge after finish accepted');
 r=await edge('finish-attempt','broken.jwt',{attemptId:ids.attempt});assert.equal(r.status,401,'Invalid JWT accepted');
 const parentRead=await api('/rest/v1/attempts?select=id',{token:parent.jwt,schema:'lexigo'});
 assert.equal(parentRead.status,200,'Parent read '+JSON.stringify(parentRead));
 assert.equal(parentRead.data.length,0,'Unverified parent saw pupil attempts');
 // Verified parent link is server-controlled and its revocation takes effect immediately.
 await insert('parent_pupils',[{parent_user_id:parent.id,pupil_user_id:pupil.id,verified_by:teacher.id}]);
 const linked=await api('/rest/v1/attempts?select=id',{token:parent.jwt,schema:'lexigo'});
 assert.equal(linked.status,200,'Linked parent read '+JSON.stringify(linked));
 assert.equal(linked.data.length,10,'Verified parent cannot see linked pupil attempts');
 const revoke=await api('/rest/v1/parent_pupils?parent_user_id=eq.'+parent.id+'&pupil_user_id=eq.'+pupil.id,
 {method:'PATCH',key:service,body:{revoked_at:new Date().toISOString()},schema:'lexigo'});
 assert.equal(revoke.status,204,'Parent link revoke '+JSON.stringify(revoke));
 const afterRevoke=await api('/rest/v1/attempts?select=id',{token:parent.jwt,schema:'lexigo'});
 assert.equal(afterRevoke.status,200,'Revoked parent read '+JSON.stringify(afterRevoke));
 assert.equal(afterRevoke.data.length,0,'Revoked parent still sees pupil attempts');
 const pupilRead=await api('/rest/v1/attempts?select=id',{token:pupil.jwt,schema:'lexigo'});
 assert.equal(pupilRead.status,200,'Pupil read '+JSON.stringify(pupilRead));
 assert.equal(pupilRead.data.length,10,'Pupil cannot see own attempts');
 const foreignRead=await api('/rest/v1/attempts?select=id',{token:foreign.jwt,schema:'lexigo'});
 assert.equal(foreignRead.status,200,'Foreign read '+JSON.stringify(foreignRead));
 assert.equal(foreignRead.data.length,0,'Foreign pupil saw attempt');
 // Invitation lifecycle over real Auth-issued JWT and Edge HTTP, with no token in logs.
 let inv=await edge('issue-invitation',parent.jwt,{classId:ids.classA,role:'pupil',ttlHours:24});
 assert.equal(inv.status,403,'Parent issued invitation');
 inv=await edge('issue-invitation',teacher.jwt,{classId:ids.classA,role:'pupil',ttlHours:24});
 assert.equal(inv.status,200,'Teacher issue '+JSON.stringify(inv));
 const firstToken=inv.data.id;
 assert.match(firstToken,/^[0-9a-f]{64}$/);
 let redeem=await edge('redeem-invitation',newPupil.jwt,{token:firstToken});
 assert.equal(redeem.status,200,'Pupil redeem '+JSON.stringify(redeem));
 const redeemedId=redeem.data.id;
 redeem=await edge('redeem-invitation',newPupil.jwt,{token:firstToken});
 assert.equal(redeem.status,403,'Invitation replay accepted');
 const enrollment=await api('/rest/v1/enrollments?select=status&class_id=eq.'+ids.classA+
 '&pupil_user_id=eq.'+newPupil.id,{key:service,schema:'lexigo'});
 assert.equal(enrollment.data[0]?.status,'active','Redeemed invitation did not enroll user');
 let revokeEnrollment=await edge('revoke-enrollment',teacher.jwt,{classId:ids.classA,childUserId:newPupil.id});
 assert.equal(revokeEnrollment.status,200,'Teacher revoke enrollment');
 const afterEnrollment=await api('/rest/v1/enrollments?select=status&class_id=eq.'+ids.classA+
 '&pupil_user_id=eq.'+newPupil.id,{key:service,schema:'lexigo'});
 assert.equal(afterEnrollment.data[0]?.status,'revoked','Enrollment revocation not applied');
 inv=await edge('issue-invitation',teacher.jwt,{classId:ids.classA,role:'pupil',ttlHours:24});
 assert.equal(inv.status,200);
 const revokedToken=inv.data.id;
 const lookup=await api('/rest/v1/invitations?select=id&order=created_at.desc&limit=1',
 {key:service,schema:'lexigo'});
 assert.equal(lookup.status,200,'Invite lookup '+JSON.stringify(lookup));
 assert.equal(lookup.data.length,1,'Invitation not persisted');
 let rev=await edge('revoke-invitation',teacher.jwt,{invitationId:lookup.data[0].id});
 assert.equal(rev.status,200,'Revoke invitation '+JSON.stringify(rev));
 redeem=await edge('redeem-invitation',newPupil.jwt,{token:revokedToken});
 assert.equal(redeem.status,403,'Revoked invitation redeemed');
 inv=await edge('issue-invitation',teacher.jwt,{classId:ids.classA,role:'pupil',ttlHours:1});
 assert.equal(inv.status,200);
 const expiredToken=inv.data.id;
 const expList=await api('/rest/v1/invitations?select=id&order=created_at.desc&limit=1',
 {key:service,schema:'lexigo'});
 assert.equal(expList.status,200,'Expired invite lookup '+JSON.stringify(expList));
 const expRecord=expList.data[0];
 assert.ok(expRecord,'Expired invitation not persisted');
 const expired=await api('/rest/v1/invitations?id=eq.'+expRecord.id,
 {method:'PATCH',key:service,schema:'lexigo',body:{created_at:new Date(Date.now()-2*86400000).toISOString(),expires_at:new Date(Date.now()-86400000).toISOString()}});
 assert.equal(expired.status,204,'Fixture expiry update '+JSON.stringify(expired));
 redeem=await edge('redeem-invitation',newPupil.jwt,{token:expiredToken});
 assert.equal(redeem.status,403,'Expired invitation redeemed');
 const invalidParent=await edge('verify-parent-link',parent.jwt,{parentUserId:parent.id,childUserId:pupil.id});
 assert.equal(invalidParent.status,403,'Parent self-verified relationship');
 const verified=await edge('verify-parent-link',teacher.jwt,{parentUserId:parent.id,childUserId:pupil.id});
 assert.equal(verified.status,200,'Teacher parent verification '+JSON.stringify(verified));
 const linkedAgain=await api('/rest/v1/attempts?select=id',{token:parent.jwt,schema:'lexigo'});
 assert.equal(linkedAgain.data.length,10,'Verified parent still denied');
 const unlinked=await edge('revoke-parent-link',teacher.jwt,{parentUserId:parent.id,childUserId:pupil.id});
 assert.equal(unlinked.status,200,'Teacher parent revocation');
 const unlinkedRead=await api('/rest/v1/attempts?select=id',{token:parent.jwt,schema:'lexigo'});
 assert.equal(unlinkedRead.data.length,0,'Revoked parent read persisted');
 const reviewed=await edge('review-attempt',teacher.jwt,{attemptId:ids.attempt});
 assert.equal(reviewed.status,200,'Teacher review '+JSON.stringify(reviewed));
 const fakeReview=await edge('review-attempt',parent.jwt,{attemptId:ids.attempt});
 assert.equal(fakeReview.status,403,'Parent forged teacher review');
 const revokedReview=await edge('revoke-review',teacher.jwt,{attemptId:ids.attempt});
 assert.equal(revokedReview.status,200,'Teacher review revocation');
 // Mode-by-mode ranking E2E: every server attempt must appear, but unfinished or partial
 // lessons must never receive a ranking badge. Self-assessment is never accuracy.
 const allModes=['cards','daily','quiz','spell','pairs','truefalse','fix','audio','crystals','boss'];
 const modeProgress=await api('/rest/v1/lesson_attempt_progress?select=attempt_id,mode,status,total_words,covered_words,ranking_eligible,lesson_completed,accuracy_pct&section_id=eq.fixture-section',
 {token:pupil.jwt,schema:'lexigo'});
 assert.equal(modeProgress.status,200,'Ten-mode ranking view '+JSON.stringify(modeProgress));
 for(const mode of allModes){
  const records=modeProgress.data.filter(a=>a.mode===mode);
  assert.ok(records.length>0,'Missing real HTTP attempt for mode '+mode);
  for(const row of records){
   assert.equal(row.total_words,2,'Incorrect lesson size in '+mode);
   assert.equal(row.lesson_completed,row.status==='finished'&&row.covered_words===2,'Wrong completion flag '+mode);
   if(row.status!=='finished'||row.covered_words<2)assert.equal(row.ranking_eligible,false,'Unfinished/partial mode entered ranking: '+mode);
   if(mode==='cards'||mode==='daily')assert.equal(row.accuracy_pct,null,'Self-rating misrepresented as accuracy: '+mode);
  }
 }
 const foreignModes=await api('/rest/v1/lesson_attempt_progress?select=mode&section_id=eq.fixture-section',
 {token:foreign.jwt,schema:'lexigo'});
 assert.equal(foreignModes.status,200);
 assert.deepEqual(foreignModes.data,[],'Foreign pupil can inspect other pupils leaderboard');
 console.log('PASS: ten-mode real JWT ranking eligibility, partial lesson exclusion, RLS isolation, self-rating distinction.');
 console.log('Real Supabase Auth JWT, Edge HTTP, RLS, assignment and event idempotency passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
