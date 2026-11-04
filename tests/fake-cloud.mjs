// Подменный сервер Supabase для браузерных тестов (2026-11-04): вход учителем или учеником без настоящего облака.
// useFakeCloud(target, { role }) — target: page или context Playwright. Возвращает state с журналом вызовов.
// Права доступа самого сервера проверяются отдельно (SQL-сценарии в README), здесь — поведение интерфейса.
export const FAKE_URL = 'https://lexigo-fake.supabase.co';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
export const IDS = { teacher: '11111111-1111-4111-8111-111111111111', student: '33333333-3333-4333-8333-333333333333', lesson: '22222222-2222-4222-8222-222222222222', assignment: '44444444-4444-4444-8444-444444444444' };
export const WORDS = [{ en: 'apple', ru: 'яблоко' }, { en: 'orange juice', ru: 'апельсиновый сок' }, { en: 'carrot', ru: 'морковь' }, { en: 'lemonade', ru: 'лимонад' }];

export async function useFakeCloud(target, { role = 'teacher', name, xp = 0, seed = true } = {}) {
  const uid = role === 'teacher' ? IDS.teacher : IDS.student;
  const state = { calls: [], rpc: [], token: null, prefs: { lessons: true, daily: true, daily_time: '19:00', teacher_done: true, devices: 0, role } };
  const display = name || (role === 'teacher' ? 'Виктория Геннадьевна' : 'Маша');
  const jwt = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: uid, role: 'authenticated', exp: 4102444800, aud: 'authenticated' }) + '.sig';
  await target.route('**/config.js', r => r.fulfill({ contentType: 'application/javascript', body: `window.LEXIGO_CLOUD=Object.freeze({url:"${FAKE_URL}",anonKey:"sb_publishable_fake_test_key_0123456789"});` }));
  await target.route(u => String(u).startsWith(FAKE_URL), async r => {
    const req = r.request(), u = new URL(req.url()), path = u.pathname, one = /vnd\.pgrst\.object/.test(req.headers()['accept'] || '');
    state.calls.push(req.method() + ' ' + path + u.search);
    const json = (body, status = 200) => r.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' }, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const rpc = path.match(/\/rpc\/([a-z_]+)$/);
    if (rpc) {
      const args = JSON.parse(req.postData() || '{}'); state.rpc.push([rpc[1], args]);
      switch (rpc[1]) {
        case 'lesson_share': if (role !== 'teacher') return json({ message: 'only teachers share lessons', code: '42501' }, 403); state.token = args.enable ? 'a3f1c2d4e5b6978877665544332211aa' : null; return json(state.token);
        case 'push_public_key': return json('BP3OjTOCjCk7es1WfJ3_Ub__rPIzP-of6vTExlHgtBBbGGjRvrqzz3rFE6eHVUODLj_QpQoKhnhTY014Ky0rt08');
        case 'push_subscribe': state.prefs.devices = 1; return json({ ok: true, devices: 1 });
        case 'push_unsubscribe': state.prefs.devices = 0; return json(true);
        case 'notify_prefs': return json(state.prefs);
        case 'notify_prefs_set': Object.assign(state.prefs, { lessons: args.lessons, daily: args.daily, daily_time: args.daily_time, teacher_done: args.teacher_done }); return json(state.prefs);
        case 'push_test': return json({ ok: state.prefs.devices > 0, devices: state.prefs.devices });
        case 'submit_session': return json({ session_id: null, xp: 0, streak: 0 });
        default: return json(null);
      }
    }
    if (path.endsWith('/auth/v1/logout')) return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' }, body: '' });
    const prof = { id: uid, display_name: display, avatar: 'lexi-travel6', role }, stats = { user_id: uid, xp, streak_count: 0, streak_best: 0, perfect_games: 0, missions_total: 0, bosses: 0 };
    if (path.endsWith('/profiles')) return json(one ? prof : [prof]);
    if (path.endsWith('/user_stats')) return json(one ? stats : [stats]);
    const lesson = { id: IDS.lesson, owner_id: IDS.teacher, title: 'Food and drinks — extra words', words: WORDS, modes: ['quiz', 'spell', 'cards'], share_token: state.token, created_at: '2026-11-03T10:00:00Z', updated_at: '2026-11-04T10:00:00Z' };
    if (path.endsWith('/custom_lessons')) {
      if (req.method() === 'HEAD') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', 'content-range': '0-0/1' }, body: '' });
      return json(one ? lesson : role === 'teacher' ? [lesson] : []);
    }
    if (path.endsWith('/group_members') && role === 'student') return json([{ group_id: 'g1', joined_at: '2026-11-01T10:00:00Z', groups: { id: 'g1', name: '5 «А»', teacher_id: IDS.teacher } }]);
    if (path.endsWith('/assignments') && role === 'student') {
      const a = { id: IDS.assignment, group_id: 'g1', teacher_id: IDS.teacher, student_id: null, title: 'Погода — слова урока', grade: 5, section_indexes: [3], word_ids: null, lesson_id: null, modes: ['quiz', 'spell'], due_at: null, comment: null, created_at: '2026-11-04T09:00:00Z' };
      return json(one ? a : [a]);
    }
    return json(one ? null : []);
  });
  if (seed) {
    const script = ([uid, display, role, token]) => {
      if (sessionStorage.getItem('lexi-fake-seeded')) return; sessionStorage.setItem('lexi-fake-seeded', '1');
      localStorage.setItem('lexigo_active_account', JSON.stringify({ uid, name: display, role }));
      localStorage.setItem('lexigo-auth', JSON.stringify({ access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r', user: { id: uid, aud: 'authenticated', role: 'authenticated', email: 't@example.com' } }));
    };
    await target.addInitScript(script, [uid, display, role, jwt]);
  }
  return state;
}
