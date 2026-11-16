import assert from 'node:assert/strict';
import { createStudentPassword, createStudentUsername } from '../supabase/functions/_shared/student-credentials.mjs';

const seen = new Set();
for (let i = 0; i < 1000; i++) {
  const password = createStudentPassword();
  assert.match(password, /^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789]{14}$/);
  const username = createStudentUsername('Иван');
  assert.match(username, /^ivan[a-hjkmnp-z2-9]{8}$/);
  assert(!seen.has(username));
  seen.add(username);
}
assert.match(createStudentUsername('!!!'), /^student[a-hjkmnp-z2-9]{8}$/);
console.log('Student credential generator checks passed');
