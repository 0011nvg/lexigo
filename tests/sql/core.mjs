// Embedded PostgreSQL tests: real SQL/RLS, local auth.uid shim; no GoTrue or push worker.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
const root=new URL('../../',import.meta.url),read=file=>fs.readFile(new URL(file,root),'utf8');
const db=new PGlite({extensions:{pgcrypto}});await db.waitReady;
try{
 await db.exec(await read('tests/sql/supabase-shim.sql'));
 const schema=await read('supabase/schema.sql');
 const pushStart=schema.indexOf('create extension if not exists pg_net'),lastLessonPolicy=schema.lastIndexOf('-- учитель управляет только своими уроками');
 assert.ok(pushStart>0&&lastLessonPolicy>pushStart,'optional push section identified');
 const core=schema.slice(0,pushStart)+schema.slice(lastLessonPolicy);
 await db.exec(core);await db.exec(core);
 await db.exec(await read('supabase/migrations/20261106_account_state.sql'));
 await db.exec((await read('tests/sql/rls-test.sql')).replace(/^\\.*$/gm,''));
 console.log('PASS PostgreSQL: core schema idempotence, existing RLS and scoring');
 const migration=await read('supabase/migrations/20261108_final_test_formats.sql');
 await db.exec('reset role');await db.exec(migration);
 await db.exec(await read('tests/sql/answer-history.sql'));
 console.log('PASS PostgreSQL: answer history, ownership, teacher access, duplicate and payload validation');
 const count=async()=>(await db.query('select count(*)::int as n from public.sessions')).rows[0].n;
 const before=await count();
 await db.exec(await read('supabase/rollbacks/20261108_final_test_formats.sql'));assert.equal(await count(),before);
 assert.match((await db.query("select pg_get_functiondef('public.submit_session(jsonb)'::regprocedure) as definition")).rows[0].definition,/v_recall_total > 0/);
 await db.exec(migration);assert.equal(await count(),before);
 console.log('PASS PostgreSQL: migration, rollback and reapply preserve all sessions');
}finally{await db.close();}
