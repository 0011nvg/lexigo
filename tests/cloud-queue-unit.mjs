// Exercise the production queue code with an isolated storage and Supabase boundary.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
const uid = '11111111-1111-1111-1111-111111111111';
const store = new Map();
let full = false;
const storage = {
  get length() { return store.size; }, key(i) { return [...store.keys()][i] ?? null; },
  getItem(k) { return store.get(k + '@' + uid) ?? null; },
  setItem(k,v) { if (full) throw Error('quota'); store.set(k + '@' + uid,String(v)); },
  removeItem(k) { store.delete(k + '@' + uid); }
};
const listeners = [];
const window = { LexigoCloud: { h() {}, clientId: () => 'session-test-id', localDay: () => '2026-11-04' },
  LexigoAccountHint: { uid: () => uid }, dispatchEvent: e => listeners.push(e.detail), addEventListener() {} };
const ctx = { window, localStorage: storage, sessionStorage: storage, console, crypto: webcrypto,
  navigator: { onLine: false }, performance: { now: () => 1 }, setTimeout, clearTimeout,
  CustomEvent: class { constructor(type, options) { this.detail = options.detail; } },
  document: { readyState:'loading', addEventListener(){}, getElementById(){return null}, body:{} },
  MutationObserver: class { observe() {} },
  start(){}, stop(){}, record(){}, saveLearningAttempt(){}, game: null };
let source = readFileSync(new URL('../cloud.js', import.meta.url), 'utf8');
source = source.replace("  if (document.readyState === 'loading')", "  window.testQueue = { writeQueue, readQueue, flush, queueAttempt, flushAttempts, pendingAttemptKeys, connect: (client, account) => { sb = client; user = account; } };\n  if (document.readyState === 'loading')");
runInNewContext(source, ctx);
const q = window.testQueue;
const old = Array.from({length: 55}, (_, i) => ({ client_id:'session-'+i }));
assert.equal(q.writeQueue(old), true);
assert.equal(q.readQueue().length, 55, 'no 50-entry truncation');
let resolveFirst;
let sessionUid = uid;
const auth = { getSession: async () => ({data: {session: {user: {id: sessionUid}}}}) };
const requested = [];
q.connect({auth, rpc: async (_name, {p}) => { requested.push(p.client_id); if (p.client_id === 'session-0') await new Promise(r => resolveFirst = r); return p.client_id === 'session-1' ? {error: {message:'bad event',code:'22023'}} : {data:{session_id:p.client_id},error:null}; }}, {id:uid});
const flushing = q.flush();
while (!resolveFirst) await Promise.resolve();
q.writeQueue([...q.readQueue(), {client_id:'new-session'}]);
resolveFirst(); await flushing;
assert.deepEqual(Array.from(q.readQueue(), x => x.client_id), ['session-1', 'new-session'], 'rejected and concurrently added sessions remain');
assert.match(storage.getItem('lexigo_cloud_queue_errors'), /bad event/);
q.connect({auth, rpc: async () => { throw Error('must not send'); }}, {id:'22222222-2222-2222-2222-222222222222'});
await q.flush();
assert.equal(q.readQueue().length, 2, 'different signed-in user cannot flush this account queue');
let releaseChange;
q.connect({auth, rpc: async () => { await new Promise(r => releaseChange = r); return {data: {session_id:'saved'}}; }}, {id:uid});
const duringChange = q.flush();
while (!releaseChange) await Promise.resolve();
sessionUid = '22222222-2222-2222-2222-222222222222'; releaseChange(); await duringChange;
assert.equal(q.readQueue().length, 2, 'account change during request must not delete queue');
sessionUid = uid;
full = true;
assert.equal(q.writeQueue([]), false);
assert.equal(q.readQueue().length, 2, 'quota failure does not erase old queue');
assert.ok(listeners.some(x => x.status === 'storage_error'));
full = false;
const g = { mode:'quiz', cloud:{id:'session-test-id',meta:{}} };
q.queueAttempt(g, {w:'w1',ok:true,k:'recognition'});
assert.equal(q.pendingAttemptKeys().length,1);
let attemptCalls = 0;
q.connect({auth, rpc: async (_name, {p_events}) => { attemptCalls++; return attemptCalls === 1 ? {error:{message:'network'}} : {data:{accepted:p_events.map(x => x.event_id)}}; }}, {id:uid});
await q.flushAttempts();
assert.equal(q.pendingAttemptKeys().length,1, 'failed event remains');
await q.flushAttempts();
assert.equal(q.pendingAttemptKeys().length,0, 'event removed after explicit acknowledgement');
console.log('Production cloud queue: OK');
