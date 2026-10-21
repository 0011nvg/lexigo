// Real local Supabase Auth -> PostgREST -> Edge Runtime -> PostgreSQL RPC.
// Uses only synthetic users and CLI-generated ephemeral local keys.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
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
 await insert('vocabulary_words',[{id:'fixture-word',section_id:'fixture-section',en:'hello',ru:'привет',order_index:0}]);
 let r=await edge('create-assignment',teacher.jwt,{classId:ids.classA,sectionId:'fixture-section',mode:'quiz',dueAt:'2030-01-01T00:00:00Z',audience:'individual',recipients:[pupil.id]});
 assert.equal(r.status,200,'Teacher assignment '+JSON.stringify(r));ids.assignment=r.data.id;
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
 const event={attemptId:ids.attempt,index:0,wordId:'fixture-word',kind:'answer',correct:true,hinted:false,retry:false};
 r=await edge('append-event',pupil.jwt,event);assert.equal(r.status,200,'Event '+JSON.stringify(r));const eventId=r.data.id;
 r=await edge('append-event',pupil.jwt,event);assert.equal(r.status,200,'Event retry '+JSON.stringify(r));assert.equal(r.data.id,eventId);
 const simultaneous=await Promise.all(Array.from({length:5},()=>edge('append-event',pupil.jwt,event)));
 assert.ok(simultaneous.every(x=>x.status===200&&x.data.id===eventId),
 'Concurrent event idempotency failed: '+JSON.stringify(simultaneous));
 const grading=await api('/rest/v1/attempt_events?select=correct,verified_correct,verification_source&id=eq.'+eventId,
 {token:teacher.jwt,schema:'lexigo'});
 assert.equal(grading.status,200,'Teacher event read '+JSON.stringify(grading));
 assert.equal(grading.data[0]?.correct,true,'Client-reported answer missing');
 assert.equal(grading.data[0]?.verified_correct,null,'Forged client correctness was marked verified');
 assert.equal(grading.data[0]?.verification_source,'client_unverified','Client correctness not labeled unverified');
 r=await edge('append-event',pupil.jwt,{...event,correct:false});assert.equal(r.status,409,'Conflicting replay accepted');
 r=await edge('append-event',parent.jwt,event);assert.equal(r.status,403,'Parent forged event');
 r=await edge('finish-attempt',pupil.jwt,{attemptId:ids.attempt});assert.equal(r.status,200,'Finish '+JSON.stringify(r));
 r=await edge('append-event',pupil.jwt,{...event,index:1});assert.equal(r.status,403,'Event after finish accepted');
 r=await edge('finish-attempt','broken.jwt',{attemptId:ids.attempt});assert.equal(r.status,401,'Invalid JWT accepted');
 const parentRead=await api('/rest/v1/attempts?select=id',{token:parent.jwt,schema:'lexigo'});
 assert.equal(parentRead.status,200,'Parent read '+JSON.stringify(parentRead));
 assert.equal(parentRead.data.length,0,'Unverified parent saw pupil attempts');
 // Verified parent link is server-controlled and its revocation takes effect immediately.
 await insert('parent_pupils',[{parent_user_id:parent.id,pupil_user_id:pupil.id,verified_by:teacher.id}]);
 const linked=await api('/rest/v1/attempts?select=id',{token:parent.jwt,schema:'lexigo'});
 assert.equal(linked.status,200,'Linked parent read '+JSON.stringify(linked));
 assert.equal(linked.data.length,1,'Verified parent cannot see linked pupil');
 const revoke=await api('/rest/v1/parent_pupils?parent_user_id=eq.'+parent.id+'&pupil_user_id=eq.'+pupil.id,
 {method:'PATCH',key:service,body:{revoked_at:new Date().toISOString()},schema:'lexigo'});
 assert.equal(revoke.status,204,'Parent link revoke '+JSON.stringify(revoke));
 const afterRevoke=await api('/rest/v1/attempts?select=id',{token:parent.jwt,schema:'lexigo'});
 assert.equal(afterRevoke.status,200,'Revoked parent read '+JSON.stringify(afterRevoke));
 assert.equal(afterRevoke.data.length,0,'Revoked parent still sees pupil attempts');
 const pupilRead=await api('/rest/v1/attempts?select=id',{token:pupil.jwt,schema:'lexigo'});
 assert.equal(pupilRead.status,200,'Pupil read '+JSON.stringify(pupilRead));
 assert.equal(pupilRead.data.length,1,'Pupil cannot see own attempt');
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
 const digest=Array.from(createHash('sha256').update(revokedToken).digest()).map(x=>x.toString(16).padStart(2,'0')).join('');
 const lookup=await api('/rest/v1/invitations?select=id,token_digest',{key:service,schema:'lexigo'});
 assert.equal(lookup.status,200,'Invite lookup '+JSON.stringify(lookup));
 const matching=lookup.data.filter(x=>String(x.token_digest).toLowerCase().replace(/^\\\\x/,'')===digest);
 assert.equal(matching.length,1,'Token digest lookup failed');
 let rev=await edge('revoke-invitation',teacher.jwt,{invitationId:matching[0].id});
 assert.equal(rev.status,200,'Revoke invitation '+JSON.stringify(rev));
 redeem=await edge('redeem-invitation',newPupil.jwt,{token:revokedToken});
 assert.equal(redeem.status,403,'Revoked invitation redeemed');
 inv=await edge('issue-invitation',teacher.jwt,{classId:ids.classA,role:'pupil',ttlHours:1});
 assert.equal(inv.status,200);
 const expiredToken=inv.data.id;
 const expiredDigest=createHash('sha256').update(expiredToken).digest('hex');
 const expList=await api('/rest/v1/invitations?select=id,token_digest',{key:service,schema:'lexigo'});
 const expRecord=expList.data.find(x=>String(x.token_digest).toLowerCase().replace(/^\\\\x/,'')===expiredDigest);
 assert.ok(expRecord,'Expired invite digest not found');
 const expired=await api('/rest/v1/invitations?id=eq.'+expRecord.id,
 {method:'PATCH',key:service,schema:'lexigo',body:{expires_at:new Date(Date.now()-1000).toISOString()}});
 assert.equal(expired.status,204,'Fixture expiry update '+JSON.stringify(expired));
 redeem=await edge('redeem-invitation',newPupil.jwt,{token:expiredToken});
 assert.equal(redeem.status,403,'Expired invitation redeemed');
 const invalidParent=await edge('verify-parent-link',parent.jwt,{parentUserId:parent.id,childUserId:pupil.id});
 assert.equal(invalidParent.status,403,'Parent self-verified relationship');
 const verified=await edge('verify-parent-link',teacher.jwt,{parentUserId:parent.id,childUserId:pupil.id});
 assert.equal(verified.status,200,'Teacher parent verification '+JSON.stringify(verified));
 const linkedAgain=await api('/rest/v1/attempts?select=id',{token:parent.jwt,schema:'lexigo'});
 assert.equal(linkedAgain.data.length,1,'Verified parent still denied');
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
 console.log('Real Supabase Auth JWT, Edge HTTP, RLS, assignment and event idempotency passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
