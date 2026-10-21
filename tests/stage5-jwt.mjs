import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {signFixtureJwt,verifyFixtureJwt,authorizeLocalRequest} from '../supabase/local-api/jwt-gateway.mjs';
const secret=randomBytes(32).toString('hex'); // ephemeral CI-only, never persisted
const users=[
 '00000000-0000-4000-8000-000000000101',
 '00000000-0000-4000-8000-000000000103',
 '00000000-0000-4000-8000-000000000105'
];
for(const actor of users){
 const jwt=signFixtureJwt(actor,secret);
 assert.equal(verifyFixtureJwt(jwt,secret),actor);
 const cmd=authorizeLocalRequest(jwt,secret,{classId:'class',sectionId:'section',recipients:[]},'create-assignment');
 assert.equal(cmd.actor,actor);
 assert.equal(cmd.rpc,'create_assignment_atomic');
 assert.throws(()=>authorizeLocalRequest(jwt,secret,{actor:users[0],classId:'class',sectionId:'section',recipients:[]},'create-assignment'),/identity override/);
 assert.throws(()=>authorizeLocalRequest(jwt,secret,{pupilId:users[1],attemptId:'attempt',index:0,wordId:'word'},'append-event'),/identity override/);
 assert.throws(()=>authorizeLocalRequest(jwt,secret,{user_id:users[1]},'finish-attempt'),/identity override/);
 assert.throws(()=>authorizeLocalRequest(jwt,secret,{attemptId:'a',index:0.5,wordId:'w'},'append-event'),/invalid payload/);
 assert.throws(()=>verifyFixtureJwt(jwt+'tampered',secret),/unauthorized/);
 assert.throws(()=>verifyFixtureJwt(signFixtureJwt(actor,secret,1),secret),/unauthorized/);
 assert.throws(()=>verifyFixtureJwt(jwt,'wrong-secret'),/unauthorized/);
}
assert.throws(()=>authorizeLocalRequest('bad',secret,{},'finish-attempt'),/unauthorized/);
console.log('Local cryptographic JWT signature, expiry and actor/pupil spoofing tests passed (fixture JWT, not Supabase Auth).');

const edge=readFileSync(new URL('../supabase/functions/learning-api/index.ts',import.meta.url),'utf8');
assert.match(edge,/auth\.auth\.getUser\(bearer\[1\]\)/);
assert.match(edge,/p_actor:user\.id/);
assert.match(edge,/SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(edge,/jwt\.decode|atob\(/);
assert.match(edge,/identity fields forbidden/);
console.log('Edge Function identity-binding static checks passed; real Supabase Auth HTTP integration remains pending.');
