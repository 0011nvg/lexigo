// Run with PGLITE_PATH pointing to an installed @electric-sql/pglite entry module.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.PGLITE_PATH || '@electric-sql/pglite');
const db = new PGlite();
try {
  await db.exec(readFileSync(new URL('./sql/supabase-shim.sql', import.meta.url), 'utf8'));
  const migration = readFileSync(new URL('../supabase/migrations/20261106_account_state.sql', import.meta.url), 'utf8');
  await db.exec(migration); await db.exec(migration);
  const a = '00000000-0000-4000-8000-000000000001', b = '00000000-0000-4000-8000-000000000002';
  await db.query('insert into auth.users(id) values ($1),($2)', [a,b]);
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${a}'`);
  const save = async (key, value, revision) => (await db.query('select public.save_account_state($1,$2::jsonb,$3) as result', [key, JSON.stringify(value), revision])).rows[0].result;
  assert.equal((await save('lexigo_my_class_v1', { grade: 6 }, 0)).saved, true);
  assert.equal((await save('lexigo_my_class_v1', { grade: 2 }, 0)).saved, false);
  assert.equal((await save('lexigo_my_class_v1', { grade: 7 }, 1)).row.revision, 2);
  await assert.rejects(() => save('password', 'secret', 0));
  await assert.rejects(() => save('lexigo_lesson_draft_v1', 'a'.repeat(500001), 0));
  await assert.rejects(() => db.exec("update public.account_state set value = '{}'"));
  await db.exec(`set request.jwt.claim.sub = '${b}'`);
  assert.equal((await db.query('select * from public.account_state')).rows.length, 0, 'RLS hides another account');
  assert.equal((await save('lexigo_my_class_v1', { grade: 3 }, 0)).saved, true);
  await db.exec(`set request.jwt.claim.sub = '${a}'`);
  assert.equal((await db.query('select value from public.account_state')).rows[0].value.grade, 7);
  assert.equal((await save('lexigo_my_class_v1', null, 2)).row.value, null, 'tombstone is retained');
  await db.exec('set role anon');
  await assert.rejects(() => db.query('select * from public.account_state'));
  await assert.rejects(() => save('lexigo_my_class_v1', {}, 0));
  console.log('Account state SQL: idempotent migration, CAS, RLS, anonymous denial, size/key checks and deletion OK');
} finally { await db.close(); }
