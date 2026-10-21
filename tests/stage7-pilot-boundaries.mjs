import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../stage7-local-cabinet.html',import.meta.url),'utf8');
const edge=readFileSync(new URL('../supabase/functions/learning-api/index.ts',import.meta.url),'utf8');
for(const [name,pattern] of Object.entries({
'localhost boundary':/location\.hostname/,
'local API origin restriction':/127\.0\.0\.1.*localhost|localhost.*127\.0\.0\.1/,
'password grant':/grant_type=password/,
'auth bearer':/Bearer /,
'RLS profile read':/rows\('profiles'/,
'RLS teacher classes':/rows\('classes'/,
'RLS pupil assignments':/rows\('assignment_recipients'/,
'RLS pupil attempts':/rows\('attempts'/,
'server profile role gate':/profile\.role/,
'logout clears memory':/function clear\(\)/,
'no storage persistence':/pagehide/
}))assert.match(html,pattern,name);
assert.doesNotMatch(html,/localStorage|sessionStorage|SUPABASE_SERVICE_ROLE_KEY|service_role/i,'No browser persistence or service credentials');
assert.match(edge,/auth\.auth\.getUser\(bearer\[1\]\)/,'JWT checked with Supabase Auth');
assert.match(edge,/identity fields forbidden/,'Client identity spoofing blocked');
assert.match(edge,/const LOCAL_ORIGINS=new Set/,'CORS origin allowlist');
console.log('Stage 7 static access boundary checks passed; NOT a substitute for deployed HTTP E2E');
