// Supabase Edge Function proposal, NOT deployed.
// Dependencies resolved by Supabase Edge Runtime. No credentials in repository.
// All identities are derived from auth.getUser(accessToken), never request body.
import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED = new Set(['create-assignment','start-attempt','append-event','finish-attempt']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{
 status,headers:{'content-type':'application/json','cache-control':'no-store'}
});
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return reply(405,{error:'method not allowed'});
 const bearer=/^Bearer (\S+)$/i.exec(req.headers.get('authorization')||'');
 if(!bearer)return reply(401,{error:'unauthorized'});
 const url=Deno.env.get('SUPABASE_URL');
 const anon=Deno.env.get('SUPABASE_ANON_KEY');
 const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!anon||!service)return reply(503,{error:'not configured'});
 // Real Supabase Auth verification; no local JWT shortcut or unverified decode.
 const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authError}=await auth.auth.getUser(bearer[1]);
 if(authError||!user)return reply(401,{error:'unauthorized'});
 const route=new URL(req.url).pathname.split('/').filter(Boolean).at(-1)||'';
 if(!ALLOWED.has(route))return reply(404,{error:'not found'});
 let body:Record<string,unknown>;
 try{
  if(Number(req.headers.get('content-length')||'0')>16384)return reply(413,{error:'too large'});
  const raw=await req.text();
  if(raw.length>16384)return reply(413,{error:'too large'});
  body=JSON.parse(raw);
  if(!body||typeof body!=='object'||Array.isArray(body))throw Error();
 }catch{return reply(400,{error:'invalid JSON'})}
 if(['actor','actorId','pupilId','pupil_user_id','user_id'].some(k=>Object.hasOwn(body,k)))
  return reply(400,{error:'identity fields forbidden'});
 const server=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 let fn:string,args:Record<string,unknown>;
 switch(route){
  case 'create-assignment':{
   if(!UUID.test(String(body.classId||''))||typeof body.sectionId!=='string'||
   !Array.isArray(body.recipients)||body.recipients.length>100||
   !body.recipients.every(x=>typeof x==='string'&&UUID.test(x)))
    return reply(400,{error:'invalid assignment'});
   fn='create_assignment_atomic';
   args={p_actor:user.id,p_class:body.classId,p_section:body.sectionId,
    p_mode:body.mode,p_due:body.dueAt,p_audience:body.audience,
    p_recipients:body.recipients};break;
  }
  case 'start-attempt':{
   if(!UUID.test(String(body.assignmentId||''))||!UUID.test(String(body.sessionId||'')))
    return reply(400,{error:'invalid attempt'});
   fn='start_attempt_atomic';args={p_actor:user.id,p_assignment:body.assignmentId,p_session:body.sessionId};break;
  }
  case 'append-event':{
   if(!UUID.test(String(body.attemptId||''))||typeof body.wordId!=='string'||
    !Number.isInteger(body.index)||Number(body.index)<0||Number(body.index)>499)
    return reply(400,{error:'invalid event'});
   fn='append_event_atomic';
   args={p_actor:user.id,p_attempt:body.attemptId,p_index:body.index,
    p_word:body.wordId,p_kind:body.kind,p_correct:body.correct??null,
    p_hinted:body.hinted,p_retry:body.retry,p_rating:body.rating??null};break;
  }
  default:{
   if(!UUID.test(String(body.attemptId||'')))return reply(400,{error:'invalid attempt'});
   fn='finish_attempt_atomic';args={p_actor:user.id,p_attempt:body.attemptId};
  }
 }
 const {data,error}=await server.schema('lexigo').rpc(fn,args);
 if(error)return reply(error.code==='42501'?403:error.code==='23505'?409:400,{error:'request rejected'});
 return reply(200,{id:data});
});
