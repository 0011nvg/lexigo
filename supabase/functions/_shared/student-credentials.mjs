// Server-side helpers. Account creation must enforce username uniqueness in the database.
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const USERNAME_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CYRILLIC = { а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ё:'e', ж:'zh', з:'z', и:'i', й:'y', к:'k', л:'l', м:'m', н:'n', о:'o', п:'p', р:'r', с:'s', т:'t', у:'u', ф:'f', х:'h', ц:'ts', ч:'ch', ш:'sh', щ:'shch', ъ:'', ы:'y', ь:'', э:'e', ю:'yu', я:'ya' };

// Rejection sampling avoids modulo bias. Never use Math.random for credentials.
function randomString(alphabet, length) {
  const limit = 256 - (256 % alphabet.length);
  let result = '';
  while (result.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(Math.max(16, length - result.length)));
    for (const byte of bytes) {
      if (byte < limit) result += alphabet[byte % alphabet.length];
      if (result.length === length) break;
    }
  }
  return result;
}

export function createStudentPassword() {
  return randomString(PASSWORD_ALPHABET, 14);
}

export function createStudentUsername(name) {
  const stem = Array.from(String(name).trim().toLowerCase(), c => CYRILLIC[c] ?? c)
    .join('').replace(/[^a-z0-9]/g, '').slice(0, 12) || 'student';
  return `${stem}${randomString(USERNAME_ALPHABET, 8)}`;
}
