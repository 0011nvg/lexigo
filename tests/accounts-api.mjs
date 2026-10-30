import assert from 'node:assert/strict';
const url=process.env.API_URL||'http://127.0.0.1:54321',key=process.env.ANON_KEY;
assert.ok(key,'Local anon key required');
async function call(path,body,token){const r=await fetch(url+path,{method:'POST',headers:{apikey:key,'Content-Type':'application/json',...(path.startsWith('/rest/')?{'Content-Profile':'lexigo','Accept-Profile':'lexigo'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});return {status:r.status,data:await r.json().catch(()=>null)}}
for(const role of ['student','teacher']){const email=`${role}-${Date.now()}@example.invalid`,password='Test-only-Strong-Password-293!';const signup=await call('/auth/v1/signup',{email,password,data:{role}});assert.equal(signup.status,200);assert.ok(signup.data.access_token);const first=await call('/rest/v1/rpc/my_entitlement',{},signup.data.access_token);assert.equal(first.status,200);assert.equal(first.data.role,role);assert.equal(first.data.status,'trialing');assert.equal(first.data.plus,true);const login=await call('/auth/v1/token?grant_type=password',{email,password});assert.equal(login.status,200);const again=await call('/rest/v1/rpc/my_entitlement',{},login.data.access_token);assert.equal(again.data.trialEndsAt,first.data.trialEndsAt);const write=await call('/rest/v1/subscription_accounts',{user_id:signup.data.user.id,plan_role:role,trial_started_at:new Date().toISOString(),trial_ends_at:new Date().toISOString()},login.data.access_token);assert.ok(write.status>=400);await call('/auth/v1/logout',{},login.data.access_token)}
console.log('PASS real Auth signup/login student+teacher, trial persistence, client write denial');

// Admin link generation is used only in isolated CI, never exposed to the browser.
const service=process.env.SERVICE_ROLE_KEY;assert.ok(service);
const email=`recovery-${Date.now()}@example.invalid`,oldPassword='Old-test-password-293!',newPassword='New-test-password-921!';
assert.equal((await call('/auth/v1/signup',{email,password:oldPassword,data:{role:'student'}})).status,200);
const linkResponse=await fetch(url+'/auth/v1/admin/generate_link',{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({type:'recovery',email})});assert.equal(linkResponse.status,200);const link=await linkResponse.json();
const verified=await call('/auth/v1/verify',{type:'recovery',token_hash:link.hashed_token});assert.equal(verified.status,200);assert.ok(verified.data.access_token);
const changed=await fetch(url+'/auth/v1/user',{method:'PUT',headers:{apikey:key,Authorization:'Bearer '+verified.data.access_token,'Content-Type':'application/json'},body:JSON.stringify({password:newPassword})});assert.equal(changed.status,200);
assert.equal((await call('/auth/v1/token?grant_type=password',{email,password:newPassword})).status,200);
assert.ok((await call('/auth/v1/token?grant_type=password',{email,password:oldPassword})).status>=400);
assert.ok((await call('/auth/v1/verify',{type:'recovery',token_hash:link.hashed_token})).status>=400);
console.log('PASS real recovery: password changed, old password rejected, recovery token cannot be reused');
