/* Private account preferences and lesson drafts. Authoritative scores remain in sessions/word_progress.
 * Load immediately after account-hint.js. Never sync guest data, credentials or another account. */
(() => {
  'use strict';
  const Hint = window.LexigoAccountHint, uid = Hint?.uid();
  const keys = new Set(['lexigo_my_class_v1', 'lexigo_fav_modules_v1', 'lexigo_last_activity_v1',
    'lexigo_hard_words_v1', 'lexigo_word_selection_v1', 'lexigo_boss_types_v1',
    'lexigo_shared_done_v1', 'lexigo_ws_custom_v1', 'lexigo_lesson_draft_v1']);
  const META = 'lexigo_account_sync_v1', proto = Storage.prototype;
  const get = proto.getItem, set = proto.setItem, remove = proto.removeItem;
  let state = uid ? 'pending' : 'guest', busy = false, timer;
  const status = () => state;
  const emit = value => { if (state !== value) { state = value; window.dispatchEvent(new CustomEvent('lexigo:sync')); } };
  const meta = () => { const v = JSON.parse(get.call(localStorage, META) || '{}'); return { known: v.known || {}, pending: v.pending || {} }; };
  const putMeta = m => set.call(localStorage, META, JSON.stringify(m));
  function schedule() { clearTimeout(timer); timer = setTimeout(sync, 800); }
  function mark(key, value) {
    if (!uid || !keys.has(key)) return;
    try {
      const m = meta();
      m.pending[key] = { value, token: crypto.randomUUID(), seed: false };
      putMeta(m); emit('pending'); schedule();
    } catch { emit('storage-error'); }
  }
  if (uid) {
    proto.setItem = function (key, value) {
      const result = set.call(this, key, value);
      if (this === localStorage && keys.has(key)) {
        try { mark(key, JSON.parse(value)); } catch { emit('storage-error'); }
      }
      return result;
    };
    proto.removeItem = function (key) {
      const result = remove.call(this, key);
      if (this === localStorage) mark(key, null);
      return result;
    };
  }
  function apply(row) {
    if (!row || !keys.has(row.key)) return;
    const m = meta(); m.known[row.key] = row.revision;
    if (m.pending[row.key]?.seed) delete m.pending[row.key];
    if (!m.pending[row.key]) {
      if (row.value === null) remove.call(localStorage, row.key);
      else set.call(localStorage, row.key, JSON.stringify(row.value));
    }
    putMeta(m);
  }
  async function sync() {
    if (!uid || busy || !window.LexigoCloud?.configured) return;
    busy = true;
    try {
      const sb = await window.LexigoCloud.client();
      const auth = await sb.auth.getSession();
      if (auth.error || auth.data?.session?.user?.id !== uid) { emit('offline'); return; }
      const { data, error } = await sb.from('account_state').select('key,value,revision').eq('user_id', uid);
      if (error) throw error;
      // Upgrade: seed only keys absent from the cloud; stale local caches never replace cloud values.
      for (const row of data || []) apply(row);
      let m = meta();
      for (const key of keys) {
        const value = get.call(localStorage, key);
        if (!m.known[key] && !m.pending[key] && value !== null)
          m.pending[key] = { value: JSON.parse(value), token: crypto.randomUUID(), seed: true };
      }
      putMeta(m);
      for (const key of keys) {
        m = meta(); const pending = m.pending[key]; if (!pending) continue;
        const { data: reply, error: failure } = await sb.rpc('save_account_state', {
          p_key: key, p_value: pending.value, p_revision: m.known[key] || 0
        });
        if (failure) throw failure;
        if (!reply?.row) throw new Error('Missing cloud acknowledgement');
        m = meta();
        // A new edit while the request was in flight must survive its acknowledgement.
        if (m.pending[key]?.token === pending.token && (reply.saved || pending.seed)) delete m.pending[key];
        putMeta(m); apply(reply.row);
      }
      emit(Object.keys(meta().pending).length ? 'pending' : 'saved');
      window.dispatchEvent(new CustomEvent('lexigo:preferences'));
    } catch (error) {
      emit(['42P01', 'PGRST205', 'PGRST202'].includes(error?.code) ? 'setup' : 'offline');
    } finally { busy = false; }
  }
  window.LexigoAccountSync = Object.freeze({ sync, status });
  if (uid) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync); else schedule();
    window.addEventListener('online', sync);
    window.addEventListener('focus', sync);
    window.addEventListener('storage', e => { if (String(e.key || '').startsWith(META)) schedule(); });
    setInterval(sync, 30000);
  }
})();
