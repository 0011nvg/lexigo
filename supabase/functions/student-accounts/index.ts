import { createStudentPassword, createStudentUsername } from '../_shared/student-credentials.mjs';
import { hashStudentPassword, verifyStudentPassword } from '../_shared/student-password.mjs';
const base = Deno.env.get('SUPABASE_URL')!;
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const issuer = base + '/functions/v1/student-accounts';
const provider = 'custom:lexi-student';
const audience = 'lexi-student';
const headers = { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type':'application/json' };
const origins = new Set(['https://mylexi.ru','https://0011nvg.github.io']);
const enc = new TextEncoder();
function b64(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,''); }
function encoded(obj: unknown) { return b64(enc.encode(JSON.stringify(obj))); }
async function api(path: string, options: RequestInit = {}) {
 const r = await fetch(base + path, {...options, headers:{...headers,...options.headers}});
 const text = await r.text(); let data; try { data=JSON.parse(text); } catch { data=null; }
 if (!r.ok) throw new Error('Server request failed: '+r.status+' '+(data?.code || data?.error_code || ''));
 return data;
}
const table = (name: string, query='') => '/rest/v1/'+name+'?'+query;
const rpc = (name: string, body: unknown) => api('/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify(body)});
let keysPromise: Promise<any> | null = null;
async function keys() {
 if (!keysPromise) keysPromise=(async()=>{
  let rows=await api(table('student_identity_keys','id=eq.1'));
  if (!rows.length) {
   const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
   const private_jwk=await crypto.subtle.exportKey('jwk',pair.privateKey);
   const public_jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'lexi-student-v1',alg:'RS256',use:'sig'};
   await api(table('student_identity_keys','on_conflict=id'),{method:'POST',headers:{Prefer:'resolution=ignore-duplicates'},body:JSON.stringify({id:1,private_jwk,public_jwk})});
   rows=await api(table('student_identity_keys','id=eq.1'));
  }
  return rows[0];
 })().catch(e=>{keysPromise=null;throw e;});
 return keysPromise;
}
async function configureProvider() {
 await keys();
 const list=await api('/auth/v1/admin/custom-providers');
 const items=Array.isArray(list)?list:(list.providers || list.items || []);
 if (items.some((p:any)=>p.identifier===provider)) return;
 await api('/auth/v1/admin/custom-providers',{method:'POST',body:JSON.stringify({provider_type:'oidc',identifier:provider,name:'Lexi student',client_id:audience,client_secret:crypto.randomUUID()+crypto.randomUUID(),issuer,scopes:['openid','profile'],email_optional:true})});
}
async function session(subject:string, name:string) {
 const nonce=crypto.randomUUID();
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(nonce))),x=>x.toString(16).padStart(2,'0')).join('');
 const k=await keys(); const now=Math.floor(Date.now()/1000);
 const content=encoded({alg:'RS256',kid:k.public_jwk.kid,typ:'JWT'})+'.'+encoded({iss:issuer,aud:audience,sub:subject,name,preferred_username:name,iat:now,exp:now+60,nonce:digest});
 const key=await crypto.subtle.importKey('jwk',k.private_jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const signature=b64(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,enc.encode(content))));
 return api('/auth/v1/token?grant_type=id_token',{method:'POST',body:JSON.stringify({provider,id_token:content+'.'+signature,nonce})});
}
async function teacher(req:Request) {
 const auth=req.headers.get('Authorization') || '';
 if (!auth.startsWith('Bearer ')) throw new Error('Unauthorized');
 const user=await api('/auth/v1/user',{headers:{Authorization:auth}});
 const profile=await api(table('profiles','id=eq.'+user.id+'&select=role'));
 if (profile[0]?.role!=='teacher') throw new Error('Unauthorized');
 return user.id;
}
async function managed(actor:string, student:string) {
 const rows=await api(table('managed_students','teacher_id=eq.'+actor+'&student_id=eq.'+student));
 const memberships=await api(table('group_members','student_id=eq.'+student+'&select=groups!inner(teacher_id)'));
 if (!rows.length || !memberships.some((m:any)=>m.groups?.teacher_id===actor)) throw new Error('Unauthorized');
 return rows[0];
}
async function revoke(access:string) { await api('/auth/v1/logout?scope=global',{method:'POST',headers:{Authorization:'Bearer '+access}}); }
function uuid(s:unknown) { if(typeof s!=='string'||!/^[0-9a-f-]{36}$/i.test(s))throw new Error('Invalid input');return s; }
Deno.serve(async req=>{
 const origin=req.headers.get('origin');
 const cors=origin && origins.has(origin)?{'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,GET,OPTIONS'}:{};
 const response=(data:unknown,status=200)=>Response.json(data,{status,headers:{...cors,'Cache-Control':'no-store'}});
 if(origin && !origins.has(origin))return response({error:'Origin denied'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 const path=new URL(req.url).pathname.split('/student-accounts/')[1] || '';
 try {
  if(req.method==='GET' && path==='.well-known/openid-configuration')return response({issuer,jwks_uri:issuer+'/jwks',authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',response_types_supported:['code'],subject_types_supported:['public'],id_token_signing_alg_values_supported:['RS256']});
  if(req.method==='GET' && path==='jwks')return response({keys:[(await keys()).public_jwk]});
  if(req.method==='GET' && path==='health')return response({service:'student-accounts',ready:true});
  if(req.method!=='POST')return response({error:'Not found'},404);
  if(Number(req.headers.get('Content-Length') || 0)>4096)return response({error:'Request too large'},413);
  const raw=await req.text(); if(raw.length>4096)return response({error:'Request too large'},413);
  const body=JSON.parse(raw);
  if(path==='login') {
   const username=String(body.username||'').trim().toLowerCase();
   if(!/^[a-z][a-z0-9]{7,31}$/.test(username)||typeof body.password!=='string'||body.password.length>128)return response({error:'Проверь логин и пароль.'},401);
   const bucket=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(username))));
   if(!await rpc('student_auth_take_attempt',{p_bucket:'login:'+bucket}))return response({error:'Слишком много попыток. Попробуй через 15 минут.'},429);
   const rows=await api(table('managed_students','username=eq.'+username));
   const secret=rows[0]?await api(table('managed_student_secrets','student_id=eq.'+rows[0].student_id)):[];
   // Equal password derivation cost for unknown logins.
   const dummy='pbkdf2-sha256$600000$abcdefghijklmnopqrstuv$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ';
   const ok=await verifyStudentPassword(body.password,secret[0]?.password_hash||dummy);
   if(!ok||!rows[0])return response({error:'Проверь логин и пароль.'},401);
   const profile=await api(table('profiles','id=eq.'+rows[0].student_id+'&select=display_name'));
   const result=await session(rows[0].identity_subject,profile[0]?.display_name||'Ученик');
   if(result.user.id!==rows[0].student_id)throw new Error('Identity mismatch');
   return response(result);
  }
  const actor=await teacher(req);
  if(path==='setup') {await configureProvider();return response({ok:true});}
  if(path==='reset') {
   const student=uuid(body.student_id), account=await managed(actor,student);
   const password=createStudentPassword();
   await api(table('managed_student_secrets','student_id=eq.'+student),{method:'PATCH',body:JSON.stringify({password_hash:await hashStudentPassword(password),updated_at:new Date().toISOString()})});
   const fresh=await session(account.identity_subject,'Ученик');
   await revoke(fresh.access_token);
   const profile=await api(table('profiles','id=eq.'+student+'&select=display_name'));
   return response({student_id:student,name:profile[0]?.display_name||'Ученик',username:account.username,password});
  }
  if(path==='create') {
   const group=uuid(body.group_id);
   const name=[String(body.first_name||'').trim(),String(body.last_name||'').trim()].filter(Boolean).join(' ');
   if(!String(body.first_name||'').trim()||name.length>40||/[<>\x00-\x1f]/.test(name))return response({error:'Укажи имя ученика, до 40 символов.'},400);
   const groups=await api(table('groups','id=eq.'+group+'&teacher_id=eq.'+actor));
   if(!groups.length)throw new Error('Unauthorized');
   await configureProvider();
   // OIDC creates the same permanent Supabase user used by all existing data policies.
   const subject=crypto.randomUUID(); const result=await session(subject,name);
   const student=result.user.id;
   const username=createStudentUsername(body.first_name), password=createStudentPassword();
   try {
    await rpc('register_managed_student',{p_teacher:actor,p_student:student,p_group:group,p_username:username,p_hash:await hashStudentPassword(password)});
    await api(table('managed_students','student_id=eq.'+student),{method:'PATCH',body:JSON.stringify({identity_subject:subject})});
    await api(table('profiles','id=eq.'+student),{method:'PATCH',body:JSON.stringify({display_name:name})});
    await revoke(result.access_token);
   } catch(e) {await api('/auth/v1/admin/users/'+student,{method:'DELETE'});throw e;}
   return response({student_id:student,name,username,password,group:groups[0].name});
  }
  return response({error:'Not found'},404);
 } catch(e) {
  console.error('Student account request failed',path,String(e));
  return response({error:String(e).includes('Unauthorized')?'Нет доступа к этому аккаунту или классу.':'Не удалось выполнить действие. Попробуйте позже.'},String(e).includes('Unauthorized')?403:503);
 }
});
