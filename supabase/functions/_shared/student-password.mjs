// Password hashes remain server-side. Format identifies the algorithm and work factor.
const ITERATIONS = 600000;
const encoder = new TextEncoder();
const encode = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
function decode(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encoding');
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0));
}
async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt, iterations}, key, 256));
}
export async function hashStudentPassword(password) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) throw new Error('Invalid password length');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${ITERATIONS}$${encode(salt)}$${encode(await derive(password, salt, ITERATIONS))}`;
}
export async function verifyStudentPassword(password, stored) {
  try {
    if (typeof password !== 'string' || password.length > 128 || typeof stored !== 'string') return false;
    const parts = stored.split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256' || parts[1] !== String(ITERATIONS)) return false;
    const salt = decode(parts[2]), expected = decode(parts[3]);
    if (salt.length !== 16 || expected.length !== 32) return false;
    const actual = await derive(password, salt, ITERATIONS);
    let difference = 0;
    for (let i = 0; i < expected.length; i++) difference |= actual[i] ^ expected[i];
    return difference === 0;
  } catch { return false; }
}
