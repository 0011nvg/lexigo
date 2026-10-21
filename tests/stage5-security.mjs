import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const foundation=read('supabase/migrations/202610210001_stage5_foundation.sql');
const operations=read('supabase/migrations/202610210002_privileged_operations.sql');
const rls=read('supabase/tests/rls_isolation.sql');
const spec=read('docs/stage-5-technical-spec.md');
const tables=['organizations','profiles','classes','enrollments','parent_pupils','vocabulary_sections','vocabulary_words','assignments','assignment_recipients','attempts','attempt_events','teacher_reviews','invitations','audit_log'];
for(const t of tables){
 assert.match(foundation,new RegExp('create table lexigo\\.'+t+'\\s*\\(','i'),t+' table missing');
 assert.ok(foundation.includes("'"+t+"'"),t+' missing from RLS enable/force list');
}
assert.match(foundation,/force row level security/i);
assert.match(foundation,/revoke all on lexigo\.invitations,lexigo\.audit_log from anon,authenticated/i);
assert.doesNotMatch(foundation,/grant (?:insert|update|delete).*lexigo\.(?:invitations|parent_pupils|teacher_reviews)/i);
for(const fn of ['issue_invitation','redeem_invitation','revoke_invitation','verify_parent_link','revoke_parent_link','review_attempt']){
 assert.ok(operations.includes('create function lexigo.'+fn+'('),fn+' missing');
}
assert.match(operations,/grant execute on function[\s\S]*to service_role/i);
assert.match(operations,/revoke all on function[\s\S]*from public,anon,authenticated/i);
assert.match(operations,/expires_at<=now\(\)/);
assert.match(operations,/for update/);
assert.match(operations,/revoked_at=now\(\)/);
assert.match(operations,/if not lexigo\.is_teacher_of/);
assert.match(rls,/Pupil A sees foreign attempts/);
assert.match(rls,/Parent A sees foreign attempt/);
assert.match(rls,/Teacher A sees foreign attempt/);
assert.match(rls,/Revoked parent still sees attempts/);
assert.match(rls,/Foreign attempt insert unexpectedly succeeded/);
assert.match(rls,/rollback;/);
assert.match(spec,/1035/);
const data=JSON.parse(read('data.json'));
const books=data.books||data;
const count=Array.isArray(books)?books.reduce((n,b)=>n+b.sections.reduce((k,section)=>k+section.words.length,0),0):null;
assert.equal(count,1035,'Vocabulary size changed');
console.log('Stage 5 schema static checks passed; SQL integration still requires disposable PostgreSQL/Supabase.');
