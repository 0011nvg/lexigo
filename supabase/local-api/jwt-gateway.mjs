// Local JWT authorization gateway for disposable tests. NOT a deployed Edge Function.
// Verifies a cryptographically signed JWT; never accepts actor/pupil IDs from request bodies.
import {createHmac,timingSafeEqual} from 'node:crypto';
const b64=s=>Buffer.from(s).toString('base64url');
export const signFixtureJwt=(sub,secret,exp=Math.floor(Date.now()/1000)+300)=>
 [b64(JSON.stringify({alg:'HS256',typ:'JWT'})),b64(JSON.stringify({sub,role:'authenticated',aud:'authenticated',exp,iss:'lexigo-local-fixture'}))].join('.')+
 '.'+createHmac('sha256',secret).update([b64(JSON.stringify({alg:'HS256',typ:'JWT'})),b64(JSON.stringify({sub,role:'authenticated',aud:'authenticated',exp,iss:'lexigo-local-fixture'}))].join('.')).digest('base64url');
export function verifyFixtureJwt(token,secret){
 if(typeof token!=='string'||token.length>4096)throw Error('unauthorized');
 const parts=token.split('.');
 if(parts.length!==3)throw Error('unauthorized');
 let header,payload;
 try{header=JSON.parse(Buffer.from(parts[0],'base64url'));payload=JSON.parse(Buffer.from(parts[1],'base64url'))}catch{throw Error('unauthorized')}
 if(header.alg!=='HS256'||header.typ!=='JWT'||payload.iss!=='lexigo-local-fixture'
 ||payload.aud!=='authenticated'||payload.role!=='authenticated'
 ||typeof payload.sub!=='string'||!/^([0-9a-f]{8}-){1}[0-9a-f-]{27}$/.test(payload.sub)
 ||!Number.isInteger(payload.exp)||payload.exp<=Date.now()/1000)throw Error('unauthorized');
 const expected=createHmac('sha256',secret).update(parts[0]+'.'+parts[1]).digest();
 let actual;try{actual=Buffer.from(parts[2],'base64url')}catch{throw Error('unauthorized')}
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error('unauthorized');
 return payload.sub;
}
export function authorizeLocalRequest(token,secret,body,route){
 const actor=verifyFixtureJwt(token,secret);
 if(!body||typeof body!=='object'||Array.isArray(body))throw Error('invalid payload');
 if(Object.hasOwn(body,'actor')||Object.hasOwn(body,'actorId')||
 Object.hasOwn(body,'pupilId')||Object.hasOwn(body,'pupil_user_id')||
 Object.hasOwn(body,'user_id'))throw Error('identity override rejected');
 if(route==='create-assignment'){
  if(typeof body.classId!=='string'||typeof body.sectionId!=='string'||!Array.isArray(body.recipients))throw Error('invalid payload');
  return {rpc:'create_assignment_atomic',actor,classId:body.classId,sectionId:body.sectionId,recipients:body.recipients};
 }
 if(route==='append-event'){
  if(typeof body.attemptId!=='string'||!Number.isInteger(body.index)||typeof body.wordId!=='string')throw Error('invalid payload');
  return {rpc:'append_event_atomic',actor,attemptId:body.attemptId,index:body.index,wordId:body.wordId};
 }
 if(route==='start-attempt'||route==='finish-attempt')return {rpc:route==='start-attempt'?'start_attempt_atomic':'finish_attempt_atomic',actor};
 throw Error('unknown route');
}
