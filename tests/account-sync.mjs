import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const source = readFileSync(new URL('../account-sync.js', import.meta.url), 'utf8');
const rows = new Map(); let offline = false, intercept;
const key = 'lexigo_my_class_v1', draft = 'lexigo_lesson_draft_v1';
function device(uid, initial = {}, authUid = uid) {
  class Storage {
    values = new Map(Object.entries(initial));
    getItem(k) { return this.values.get(k) ?? null; }
    setItem(k, v) { this.values.set(k, String(v)); }
    removeItem(k) { this.values.delete(k); }
  }
  const storage = new Storage();
  const sb = {
    auth: { getSession: async () => ({ data: { session: { user: { id: authUid } } } }) },
    from: () => ({ select: () => ({ eq: async (_, id) => offline
      ? { error: { message: 'offline' } }
      : { data: [...rows].filter(([k]) => k.startsWith(id + ':')).map(([,v]) => structuredClone(v)) } }) }),
    rpc: async (_, p) => {
      if (offline) return { error: { message: 'offline' } };
      const id = uid + ':' + p.p_key, old = rows.get(id);
      if ((old?.revision || 0) !== p.p_revision) return { data: { saved: false, row: structuredClone(old) } };
      const row = { key: p.p_key, value: p.p_value, revision: (old?.revision || 0) + 1 };
      rows.set(id, structuredClone(row));
      if (intercept) { const fn = intercept; intercept = null; await fn(); }
      return { data: { saved: true, row } };
    }
  };
  const window = { LexigoAccountHint: { uid: () => uid }, LexigoCloud: { configured: true, client: async () => sb }, dispatchEvent() {}, addEventListener() {} };
  vm.runInNewContext(source, { window, Storage, localStorage: storage, crypto: { randomUUID },
    CustomEvent: class {}, document: { readyState: 'loading', addEventListener() {} }, setTimeout() {}, clearTimeout() {}, setInterval() {} });
  return { storage, sync: window.LexigoAccountSync.sync, status: window.LexigoAccountSync.status };
}
const a = device('alice', { [key]: JSON.stringify({ grade: 6 }) });
await a.sync(); assert.equal(a.status(), 'saved');
const b = device('alice', { [key]: JSON.stringify({ grade: 2 }) });
await b.sync(); assert.equal(JSON.parse(b.storage.getItem(key)).grade, 6, 'stale device must prefer cloud');
offline = true;
a.storage.setItem(key, JSON.stringify({ grade: 7 })); await a.sync();
assert.equal(a.status(), 'offline');
offline = false; await a.sync(); await b.sync();
assert.equal(JSON.parse(b.storage.getItem(key)).grade, 7, 'offline edit must arrive on another device');
a.storage.setItem(draft, JSON.stringify({ title: 'Animals', text: 'cat — кот' })); await a.sync(); await b.sync();
assert.match(b.storage.getItem(draft), /Animals/);
a.storage.removeItem(draft); await a.sync(); await b.sync();
assert.equal(b.storage.getItem(draft), null, 'deleted drafts must not be resurrected');
a.storage.setItem(key, JSON.stringify({ grade: 8 }));
intercept = () => a.storage.setItem(key, JSON.stringify({ grade: 9 }));
await a.sync(); assert.equal(a.status(), 'pending'); await a.sync(); await b.sync();
assert.equal(JSON.parse(b.storage.getItem(key)).grade, 9, 'edit during request must survive acknowledgement');
const other = device('bob'); await other.sync(); assert.equal(other.storage.getItem(key), null);
const wrong = device('alice', {}, 'bob'); await wrong.sync(); assert.equal(wrong.status(), 'offline');
const guest = device(''); guest.storage.setItem(key, '{"grade":3}'); await guest.sync(); assert.equal(guest.status(), 'guest');
// Pending initial seed must yield to an already existing remote value after reload.
const stale = device('alice', {
  [key]: '{"grade":2}', lexigo_account_sync_v1: JSON.stringify({ known: {}, pending: { [key]: { value: { grade: 2 }, token: 'seed', seed: true } } })
});
await stale.sync(); assert.equal(JSON.parse(stale.storage.getItem(key)).grade, 9);
console.log('Account sync: two devices, offline retry, draft deletion, in-flight edits, guest/account isolation and upgrade OK');
