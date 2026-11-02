/* LEXIGO — разделение локальных данных по аккаунтам на одном устройстве (2026-11-02).
 * Если на устройстве выполнен вход, все ключи localStorage вида «lexigo_…» читаются и пишутся
 * с суффиксом «@<id аккаунта>». Так два ученика за одним школьным компьютером не смешивают
 * прогресс, а гостевой прогресс остаётся под обычными ключами. Подключается ПЕРВЫМ скриптом.
 * Здесь хранится только id, имя и роль для мгновенного приветствия — не пароль и не токен. */
(() => {
  'use strict';
  const HINT = 'lexigo_active_account';
  const SHARED = new Set([HINT, 'lexigo_prefs_v1', 'lexigo_gem_muted', 'lexigo_cloud_device']);
  const proto = Storage.prototype, rawGet = proto.getItem, rawSet = proto.setItem, rawRemove = proto.removeItem;
  let hint = null;
  try {
    const h = JSON.parse(rawGet.call(localStorage, HINT) || 'null');
    if (h && typeof h.uid === 'string' && /^[0-9a-f-]{36}$/.test(h.uid)) hint = { uid: h.uid, name: String(h.name || '').slice(0, 40), role: h.role === 'teacher' ? 'teacher' : 'student' };
  } catch { hint = null; }
  const scoped = key => (hint && typeof key === 'string' && key.startsWith('lexigo_') && !SHARED.has(key)) ? key + '@' + hint.uid : key;
  if (hint) {
    proto.getItem = function (k) { return rawGet.call(this, this === localStorage ? scoped(k) : k); };
    proto.setItem = function (k, v) { return rawSet.call(this, this === localStorage ? scoped(k) : k, v); };
    proto.removeItem = function (k) { return rawRemove.call(this, this === localStorage ? scoped(k) : k); };
  }
  window.LexigoAccountHint = Object.freeze({
    uid: () => hint ? hint.uid : '',
    name: () => hint ? hint.name : '',
    role: () => hint ? hint.role : '',
    /* raw access to the guest (unscoped) keys, e.g. to offer importing guest progress */
    guestGet: key => { try { return rawGet.call(localStorage, key); } catch { return null; } },
    set(account) {
      try { rawSet.call(localStorage, HINT, JSON.stringify({ uid: account.uid, name: String(account.name || '').slice(0, 40), role: account.role })); } catch { /* storage full or blocked */ }
    },
    clear() { try { rawRemove.call(localStorage, HINT); } catch { /* ignore */ } }
  });
})();
