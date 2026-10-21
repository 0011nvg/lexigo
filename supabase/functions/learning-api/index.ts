// Supabase Edge Function proposal, NOT deployed.
// Dependencies resolved by Supabase Edge Runtime. No credentials in repository.
// All identities are derived from auth.getUser(accessToken), never request body.
import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED = new Set(['create-assignment','start-attempt','append-event','submit-answer','next-question','answer-question','play-round','hint-question','finish-attempt','issue-invitation','redeem-invitation','revoke-invitation','verify-parent-link','revoke-parent-link','review-attempt','revoke-review','revoke-enrollment']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Hosted pilot origins must be explicitly configured server-side, never inferred from a request.
const LOCAL_ORIGINS=new Set(['http://127.0.0.1:3000','http://localhost:3000']);
const PILOT_ORIGINS=new Set((Deno.env.get('LEXIGO_PILOT_ORIGINS')||'').split(',').map(s=>s.trim()).filter(s=>{try{const u=new URL(s);return u.protocol==='https:'&&u.origin===s&&!u.username&&!u.password}catch{return false}}));
const allowedOrigin=(origin:string)=>LOCAL_ORIGINS.has(origin)||PILOT_ORIGINS.has(origin);
const reply=(status:number,data:unknown,origin='')=>new Response(JSON.stringify(data),{
 status,headers:{'content-type':'application/json','cache-control':'no-store',
 ...(allowedOrigin(origin)?{'access-control-allow-origin':origin,'vary':'Origin',
 'access-control-allow-headers':'authorization,content-type,apikey',
 'access-control-allow-methods':'POST,OPTIONS'}:{})}
});
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')||'';
 const respond=(status:number,data:unknown)=>reply(status,data,origin);
 if(req.method==='OPTIONS')return respond(allowedOrigin(origin)?204:403,{});
 if(req.method!=='POST')return respond(405,{error:'method not allowed'});
 // Origin checks are defense-in-depth; authorization is always verified separately.
 if(origin&&!allowedOrigin(origin))return respond(403,{error:'origin not allowed'});
 const bearer=/^Bearer (\S+)$/i.exec(req.headers.get('authorization')||'');
 if(!bearer)return respond(401,{error:'unauthorized'});
 const url=Deno.env.get('SUPABASE_URL');
 const anon=Deno.env.get('SUPABASE_ANON_KEY');
 const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!anon||!service)return respond(503,{error:'not configured'});
 // Real Supabase Auth verification; no local JWT shortcut or unverified decode.
 const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authError}=await auth.auth.getUser(bearer[1]);
 if(authError||!user)return respond(401,{error:'unauthorized'});
 const route=new URL(req.url).pathname.split('/').filter(Boolean).at(-1)||'';
 if(!ALLOWED.has(route))return respond(404,{error:'not found'});
 let body:Record<string,unknown>;
 try{
  if(Number(req.headers.get('content-length')||'0')>16384)return respond(413,{error:'too large'});
  const raw=await req.text();
  if(raw.length>16384)return respond(413,{error:'too large'});
  body=JSON.parse(raw);
  if(!body||typeof body!=='object'||Array.isArray(body))throw Error();
 }catch{return respond(400,{error:'invalid JSON'})}
 if(['actor','actorId','pupilId','pupil_user_id','user_id'].some(k=>Object.hasOwn(body,k)))
  return respond(400,{error:'identity fields forbidden'});
 const server=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 let fn:string,args:Record<string,unknown>;
 switch(route){
  case 'create-assignment':{
   if(!UUID.test(String(body.classId||''))||typeof body.sectionId!=='string'||
   !Array.isArray(body.recipients)||body.recipients.length>100||
   !body.recipients.every(x=>typeof x==='string'&&UUID.test(x)))
    return respond(400,{error:'invalid assignment'});
   fn='create_assignment_atomic';
   args={p_actor:user.id,p_class:body.classId,p_section:body.sectionId,
    p_mode:body.mode,p_due:body.dueAt,p_audience:body.audience,
    p_recipients:body.recipients};break;
  }
  case 'start-attempt':{
   if(!UUID.test(String(body.assignmentId||''))||!UUID.test(String(body.sessionId||'')))
    return respond(400,{error:'invalid attempt'});
   fn='start_attempt_atomic';args={p_actor:user.id,p_assignment:body.assignmentId,p_session:body.sessionId};break;
  }
  case 'append-event':{
   if(!UUID.test(String(body.attemptId||''))||typeof body.wordId!=='string'||
    body.kind!=='card_self_rating'||body.correct!=null||
    !Number.isInteger(body.index)||Number(body.index)<0||Number(body.index)>499)
    return respond(400,{error:'invalid event'});
   fn='append_event_atomic';
   args={p_actor:user.id,p_attempt:body.attemptId,p_index:body.index,
    p_word:body.wordId,p_kind:body.kind,p_correct:body.correct??null,
    p_hinted:body.hinted,p_retry:body.retry,p_rating:body.rating??null};break;
  }
  case 'submit-answer':{
   return respond(410,{error:'use server-issued challenge'});
   if(!UUID.test(String(body.attemptId||''))||typeof body.wordId!=='string'||
    typeof body.answer!=='string'||body.answer.length>250||
    !Number.isInteger(body.index)||Number(body.index)<0||Number(body.index)>499||
    typeof body.hinted!=='boolean'||typeof body.retry!=='boolean'||
    Object.hasOwn(body,'correct')||Object.hasOwn(body,'verifiedCorrect')||
    Object.hasOwn(body,'verificationSource'))
    return respond(400,{error:'invalid answer'});
   fn='append_verified_answer';
   args={p_actor:user.id,p_attempt:body.attemptId,p_index:body.index,
    p_word:body.wordId,p_answer:body.answer,p_hinted:body.hinted,p_retry:body.retry};break;
  }
  case 'next-question':{
   if(!UUID.test(String(body.attemptId||'')))return respond(400,{error:'invalid attempt'});
   fn='next_challenge';args={p_actor:user.id,p_attempt:body.attemptId};break;
  }
  case 'hint-question':{
   if(!UUID.test(String(body.attemptId||''))||!UUID.test(String(body.challengeId||'')))
    return respond(400,{error:'invalid challenge'});
   fn='request_challenge_hint';args={p_actor:user.id,p_attempt:body.attemptId,p_challenge:body.challengeId};break;
  }
  case 'answer-question':{
   if(!UUID.test(String(body.attemptId||''))||!UUID.test(String(body.challengeId||''))||
    typeof body.wordId!=='string'||typeof body.answer!=='string'||body.answer.length>250||
    !Number.isInteger(body.index)||body.index<0||body.index>499||
    Object.hasOwn(body,'correct')||Object.hasOwn(body,'hinted')||Object.hasOwn(body,'retry'))
    return respond(400,{error:'invalid challenge answer'});
   fn='answer_challenge';args={p_actor:user.id,p_attempt:body.attemptId,
    p_challenge:body.challengeId,p_index:body.index,p_word:body.wordId,p_answer:body.answer};break;
  }
  case 'play-round':{
   if(!UUID.test(String(body.attemptId||''))||
    !UUID.test(String(body.challengeId||''))||
    !UUID.test(String(body.requestId||''))||
    !['pair','swap','answer','hint','retry'].includes(String(body.action))||
    !body.payload||typeof body.payload!=='object'||Array.isArray(body.payload)||
    JSON.stringify(body.payload).length>2048||
    ['correct','actor','pupilId','wordId','expected','score'].some(k=>Object.hasOwn(body.payload,k)))
    return respond(400,{error:'invalid round action'});
   fn='play_challenge';args={p_actor:user.id,p_attempt:body.attemptId,
    p_challenge:body.challengeId,p_request:body.requestId,
    p_action:body.action,p_payload:body.payload};break;
  }
  case 'issue-invitation':{
   if(!UUID.test(String(body.classId||''))||!['pupil','parent'].includes(String(body.role))||
    !Number.isInteger(body.ttlHours)||Number(body.ttlHours)<1||Number(body.ttlHours)>168)
    return respond(400,{error:'invalid invitation'});
   fn='issue_invitation';args={p_actor:user.id,p_class:body.classId,p_role:body.role,p_ttl_hours:body.ttlHours};break;
  }
  case 'redeem-invitation':{
   if(typeof body.token!=='string'||!/^[0-9a-f]{64}$/.test(body.token))
    return respond(400,{error:'invalid invitation'});
   fn='redeem_invitation';args={p_user:user.id,p_token:body.token};break;
  }
  case 'revoke-invitation':{
   if(!UUID.test(String(body.invitationId||'')))return respond(400,{error:'invalid invitation'});
   fn='revoke_invitation';args={p_actor:user.id,p_invitation:body.invitationId};break;
  }
  case 'verify-parent-link':
  case 'revoke-parent-link':{
   if(!UUID.test(String(body.parentUserId||''))||!UUID.test(String(body.childUserId||'')))
    return respond(400,{error:'invalid parent link'});
   fn=route==='verify-parent-link'?'verify_parent_link':'revoke_parent_link';
   args={p_actor:user.id,p_parent:body.parentUserId,p_pupil:body.childUserId};break;
  }
  case 'review-attempt':
  case 'revoke-review':{
   if(!UUID.test(String(body.attemptId||'')))return respond(400,{error:'invalid attempt'});
   fn=route==='review-attempt'?'review_attempt':'revoke_teacher_review';
   args={p_actor:user.id,p_attempt:body.attemptId};break;
  }
  case 'revoke-enrollment':{
   if(!UUID.test(String(body.classId||''))||!UUID.test(String(body.childUserId||'')))
    return respond(400,{error:'invalid enrollment'});
   fn='revoke_enrollment';args={p_actor:user.id,p_class:body.classId,p_pupil:body.childUserId};break;
  }
  default:{
   if(!UUID.test(String(body.attemptId||'')))return respond(400,{error:'invalid attempt'});
   fn='finish_attempt_atomic';args={p_actor:user.id,p_attempt:body.attemptId};
  }
 }
 const {data,error}=await server.schema('lexigo').rpc(fn,args);
 if(error)return respond(error.code==='42501'?403:error.code==='23505'?409:400,{error:'request rejected'});
 return respond(200,fn==='next_challenge'||fn==='answer_challenge'||fn==='play_challenge'||fn==='request_challenge_hint'?data:{id:data});
});
