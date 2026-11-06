import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../cloud.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('  function readQueue()'), source.indexOf('  /* ---------- pull cloud'));
let stored = '[]', reply, calls = 0;
const context = vm.createContext({
  QUEUE: 'queue', localStorage: { getItem: () => stored, setItem: (_, v) => { stored = v; } },
  sb: { rpc: async () => { calls++; return reply(); } }, user: { id: 'one' }, Hint: { uid: () => 'one' },
  window: { addEventListener() {} }, setInterval() {}, console: { warn() {} }, toast() {},
  boards: {}, C: {},
});
vm.runInContext(code, context);
const run = code => vm.runInContext(code, context);
const entries = Array.from({ length: 75 }, (_, i) => ({ client_id: String(i) }));
run(`writeQueue(${JSON.stringify(entries)})`);
assert.equal(JSON.parse(stored).length, 75, 'offline queue must retain more than 50 sessions');
reply = async () => ({ error: { code: '503', message: 'Service unavailable' } });
await run('flush()');
assert.equal(JSON.parse(stored).length, 75, 'server errors must not discard results');
stored = JSON.stringify([{ client_id: 'first' }]);
let release;
reply = () => new Promise(resolve => { release = resolve; });
const pending = run('flush()');
run('writeQueue([...readQueue(), {client_id: "second"}])');
reply = async () => ({ error: { message: 'offline' } });
release({ data: null, error: null });
await pending;
assert.deepEqual(JSON.parse(stored), [{ client_id: 'second' }], 'an in-flight request must not overwrite new results');
reply = async () => ({ data: { duplicate: true }, error: null });
await run('flush()');
assert.deepEqual(JSON.parse(stored), [], 'server acknowledgement removes the queued result');
const before = calls;
run('user = { id: "another" }; writeQueue([{client_id: "private"}])');
await run('flush()');
assert.equal(calls, before, 'never submit one account’s queue for another account');
assert.match(source, /g.cloud.sent = submit\(snapshot, !!finished\)/, 'completed sessions are persisted synchronously');
console.log('Cloud queue: retention, retries, concurrent answers, duplicates and account guard OK');
