/* LEXI — личные кабинеты ученика и учителя (Supabase, 2026-11-02).
 * Все данные выводятся только через textContent (функция h), права проверяет сервер (RLS). */
(() => {
  'use strict';
  const C = window.LexigoCloud, Hint = window.LexigoAccountHint, { h } = C;
  const root = document.getElementById('cab');
  const DB = window.LEXIGO_DATA;
  const base = location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
  let sb, me, profile;

  const toastHost = h('div', { class: 'lexi-toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(toastHost);
  function toast(text) { const t = h('div', { class: 'lexi-toast' }, h('span', { class: 'lexi-avatar lexi-s', 'aria-hidden': 'true' }, h('img', { src: 'assets/lexi-head.webp', alt: '' })), h('p', { text })); toastHost.append(t); setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 3400); }
  function fail(e, text) { console.warn('LEXI cabinet', e); toast(text || (String(e && e.message || '').match(/fetch|network/i) ? 'Нет связи с сервером. Попробуй ещё раз.' : 'Не получилось. Попробуй ещё раз.')); }
  function dialog(title, body, actions) {
    const d = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
    const close = () => { d.remove(); document.removeEventListener('keydown', esc); };
    const esc = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esc);
    d.addEventListener('click', e => { if (e.target === d) close(); });
    d.append(h('div', null, h('h2', { text: title }), body, h('div', { class: 'dialog-actions' }, ...(actions ? actions(close) : [h('button', { class: 'btn-acc ghost', type: 'button', text: 'Закрыть', onclick: close })]))));
    document.body.append(d); (d.querySelector('input,textarea,select,button.btn-acc') || d).focus?.();
    return close;
  }
  async function copy(text, ok) { try { await navigator.clipboard.writeText(text); toast(ok); } catch { dialog('Скопируйте вручную', h('input', { class: 'acc-input', value: text, readonly: true, onfocus: e => e.target.select() })); } }
  const plural = (n, a, b, c) => { n = Math.abs(n) % 100; const n1 = n % 10; return n > 10 && n < 20 ? c : n1 > 1 && n1 < 5 ? b : n1 === 1 ? a : c; };
  const daysAgo = d => Math.floor((Date.now() - Date.parse(d)) / 864e5);
  const relDay = d => { const n = daysAgo(d); return n <= 0 ? 'сегодня' : n === 1 ? 'вчера' : n + ' ' + plural(n, 'день', 'дня', 'дней') + ' назад'; };
  const isLearned = r => r.recall_count >= 2 && r.streak >= 2;
  const needsReview = r => (r.due_at && Date.parse(r.due_at) <= Date.now()) || (r.wrong_count > 0 && r.streak < 2);
  const modules = b => [...new Set(b.sections.map(s => s.module))];
  const lexicalCount = b => b.sections.reduce((n, s) => n + s.words.filter(C.isLexical).length, 0);
  async function allRows(q) { const out = []; for (let p = 0; p < 15; p++) { const { data, error } = await q().range(p * 1000, p * 1000 + 999); if (error) throw error; out.push(...data); if (data.length < 1000) break; } return out; }

  /* ---------- account actions shared by both roles ---------- */
  let leaving = false;
  async function logout() { leaving = true; try { await sb.auth.signOut(); } catch { /* offline: local session is still removed */ } Hint.clear(); location.replace('index.html'); }
  function settings(onSaved) {
    let avatar = profile.avatar;
    const name = h('input', { class: 'acc-input', value: profile.display_name, maxlength: 40, id: 'setName' });
    const A = window.LexiProfileAvatars;
    if (avatar === 'custom') avatar = 'lexi-hello';
    const pick = h('div', { class: 'ava-pick', role: 'group', 'aria-label': 'Выбери аватар' });
    function refreshPick() {
      pick.replaceChildren();
      for (const [id, [label]] of Object.entries(A.presets)) {
        pick.append(h('button', { type: 'button', 'aria-pressed': String(id === avatar), 'aria-label': label, title: label,
          onclick: () => { avatar = id; refreshPick(); } }, A.content(id)));
      }
    }
    refreshPick();
    dialog('Настройки профиля', h('div', null,
      h('label', { class: 'acc-field', for: 'setName' }, h('span', { text: profile.role === 'teacher' ? 'Как вас видят ученики' : 'Как тебя называть' }), name),
      h('div', { class: 'acc-field' }, h('span', { text: 'Выбери своего Лекси' }), pick,
        h('p', { class: 'acc-small acc-muted', text: 'Выбранный образ сохранится в твоём аккаунте.' })),
      h('p', { class: 'acc-small acc-muted', text: 'Почта: ' + (me.email || '—') }),
      h('p', null, h('button', { type: 'button', class: 'btn-link', text: 'Сменить пароль', onclick: async () => { try { const { error } = await sb.auth.resetPasswordForEmail(me.email, { redirectTo: base + 'auth.html?recovery=1' }); if (error) throw error; toast('Письмо со ссылкой для смены пароля отправлено.'); } catch (e) { fail(e); } } })),
      h('p', null, h('button', { type: 'button', class: 'btn-link', style: { color: 'var(--w-miss)' }, text: 'Удалить аккаунт и все данные', onclick: deleteAccount }))),
      close => [h('button', { class: 'btn-acc ghost', type: 'button', text: 'Отмена', onclick: close }), h('button', { class: 'btn-acc', type: 'button', text: 'Сохранить', onclick: async () => {
        const n = name.value.trim().replace(/\s+/g, ' ');
        if (!n) return toast('Имя не может быть пустым.');
        const { error } = await sb.from('profiles').update({ display_name: n, avatar }).eq('id', me.id);
        if (error) return fail(error);
        profile.display_name = n; profile.avatar = avatar; Hint.set({ uid: me.id, name: n, role: profile.role }); close(); toast('Сохранено!'); onSaved();
      } })]);
  }
  function deleteAccount() {
    document.querySelectorAll('.dialog').forEach(d => d.remove());
    const input = h('input', { class: 'acc-input', id: 'delConfirm', autocomplete: 'off' });
    dialog('Удалить аккаунт?', h('div', null,
      h('p', { text: 'Будут удалены профиль, весь прогресс, история занятий' + (profile.role === 'teacher' ? ', ваши группы, задания и уроки.' : ' и участие в классах.') + ' Восстановить данные будет нельзя.' }),
      h('label', { class: 'acc-field', for: 'delConfirm' }, h('span', { text: 'Чтобы подтвердить, напиши слово УДАЛИТЬ' }), input)),
      close => [h('button', { class: 'btn-acc ghost', type: 'button', text: 'Отмена', onclick: close }), h('button', { class: 'btn-acc danger', type: 'button', text: 'Удалить навсегда', onclick: async () => {
        if (input.value.trim().toUpperCase() !== 'УДАЛИТЬ') return toast('Напиши слово УДАЛИТЬ.');
        const { error } = await sb.rpc('delete_my_account'); if (error) return fail(error);
        leaving = true;
        try { await sb.auth.signOut(); } catch { /* already gone */ }
        Hint.clear(); location.replace('index.html');
      } })]);
  }
  function head(sub, extra) {
    return h('div', { class: 'cab-head' },
      h('button', { class: 'cab-ava', type: 'button', 'aria-label': 'Настройки профиля', onclick: () => settings(boot) }, window.LexiProfileAvatars.content(profile.avatar, C.AVATARS[profile.avatar] || (profile.role === 'teacher' ? '🧑‍🏫' : '🐱'))),
      h('div', null, h('h1', { text: profile.display_name }), h('p', { class: 'acc-muted', text: sub })),
      h('div', { class: 'cab-head-actions' }, extra, h('button', { class: 'btn-acc ghost small', type: 'button', text: '⚙ Настройки', onclick: () => settings(boot) })));
  }

  /* =====================================================================
     STUDENT
     ===================================================================== */
  async function student() {
    const uid = me.id;
    const [stats, sessions, wp, memberships] = await Promise.all([
      sb.from('user_stats').select('*').eq('user_id', uid).maybeSingle().then(r => r.data || { xp: 0, streak_count: 0, streak_best: 0, perfect_games: 0, missions_total: 0, bosses: 0, guest_imported: false }),
      sb.from('sessions').select('id,mode,title,route,grade,scope,accuracy,correct,wrong,total,first_correct,xp,finished,created_at,assignment_id').eq('user_id', uid).order('created_at', { ascending: false }).limit(300).then(r => r.data || []),
      allRows(() => sb.from('word_progress').select('word_id,right_count,wrong_count,recall_count,streak,due_at').eq('user_id', uid)),
      sb.from('group_members').select('group_id,joined_at,groups(id,name,teacher_id)').eq('student_id', uid).then(r => r.data || [])
    ]);
    const wpById = new Map(wp.map(r => [r.word_id, r]));
    const myLessons = await C.loadStudentLessons(sb, uid, id => C.knownRow(wpById.get(id)));
    const teacherIds = [...new Set(memberships.map(m => m.groups && m.groups.teacher_id).filter(Boolean))];
    const teachers = new Map();
    if (teacherIds.length) { const { data } = await sb.from('profiles').select('id,display_name').in('id', teacherIds); (data || []).forEach(t => teachers.set(t.id, t.display_name)); }
    const groupName = new Map(memberships.map(m => [m.group_id, m.groups ? m.groups.name : '']));
    const groupTeacher = new Map(memberships.map(m => [m.group_id, m.groups ? teachers.get(m.groups.teacher_id) || '' : '']));

    const streakAlive = stats.streak_last && daysAgo(stats.streak_last + 'T12:00:00') <= 1 ? stats.streak_count : 0;
    const lv = C.levelOf(stats.xp);
    const learned = wp.filter(isLearned).length, review = wp.filter(needsReview).length;
    const last = sessions.find(s => s.route);
    const continueHref = last ? 'index.html#' + last.route : 'index.html#/course/' + (DB.books[0].grade) + '/0';
    const greeting = window.LexiLive ? window.LexiLive.greeting() : 'Привет';

    // hero
    const hero = h('section', { class: 'st-hero span-12', 'aria-label': 'Мой уровень' },
      h('div', null,
        h('h2', { text: greeting + ', ' + profile.display_name + '!' }),
        h('p', { text: last ? 'В прошлый раз: ' + (last.title || C.MODES[last.mode] || 'тренировка') + ' · ' + relDay(last.created_at) : 'Выбери учебник — и начнём собирать слова!' }),
        h('div', { class: 'lvl' }, h('b', { text: lv.level }), h('div', { style: { flex: '1' } },
          h('div', { class: 'bar' }, h('i', { style: { width: Math.round((lv.xp - lv.from) / (lv.to - lv.from) * 100) + '%' } })),
          h('small', { text: lv.title + ' · ' + stats.xp + ' XP · до уровня ' + (lv.level + 1) + ': ' + (lv.to - lv.xp) + ' XP' }))),
        h('a', { class: 'btn-acc lime', href: continueHref, text: last ? 'Продолжить обучение →' : 'Начать →' })),
      h('img', { src: 'assets/lexi-hero.webp', alt: '', width: 520, height: 520 }));

    const tiles = h('section', { class: 'tiles span-12', 'aria-label': 'Мои показатели' },
      h('div', { class: 'tile t1' }, h('b', { text: learned }), h('span', { text: plural(learned, 'слово изучено', 'слова изучено', 'слов изучено') })),
      h('div', { class: 'tile t2' }, h('b', { text: review }), h('span', { text: 'нужно повторить' })),
      h('div', { class: 'tile t3' }, h('b', { text: streakAlive ? '🔥 ' + streakAlive : '0' }), h('span', { text: 'дней подряд · рекорд ' + stats.streak_best })),
      h('div', { class: 'tile t4' }, h('b', { text: sessions.filter(s => s.finished).length }), h('span', { text: 'тренировок пройдено' })));

    // уроки от учителя: заметные карточки, самый актуальный — первым; завершённые остаются для повторения
    const taskList = h('div', { class: 'tl-grid' });
    if (!memberships.length) taskList.append(h('div', { class: 'empty', text: 'Здесь появятся уроки от учителя. Попроси у учителя код класса и введи его в блоке «Мои классы».' }));
    else if (!myLessons.length) taskList.append(h('div', { class: 'empty', text: 'Пока уроков нет — можно тренироваться самостоятельно!' }));
    const SHOW = 8;
    myLessons.forEach((x, i) => { const card = C.lessonCard(x, { fromCabinet: true }); if (i >= SHOW) card.hidden = true; taskList.append(card); });
    const moreLessons = myLessons.length > SHOW ? h('button', { class: 'btn-acc ghost small', type: 'button', text: 'Показать все уроки (' + myLessons.length + ')', onclick: e => { taskList.querySelectorAll('.tl-card[hidden]').forEach(c => { c.hidden = false; }); e.currentTarget.remove(); } }) : null;
    const openLessons = myLessons.filter(x => x.st.state !== 'done').length;

    // books
    const byGrade = new Map();
    const idx = C.words();
    for (const r of wp) { const w = idx.get(r.word_id); if (!w) continue; const g = byGrade.get(w.grade) || { touched: 0, learned: 0 }; g.touched++; if (isLearned(r)) g.learned++; byGrade.set(w.grade, g); }
    const books = h('div');
    const gradesShown = [...byGrade.keys()].sort((a, b) => a - b);
    if (!gradesShown.length) books.append(h('div', { class: 'empty', text: 'Когда начнёшь тренироваться, здесь появится прогресс по учебникам.' }));
    for (const g of gradesShown) {
      const b = DB.books.find(x => x.grade === g), total = lexicalCount(b), st = byGrade.get(g);
      books.append(h('div', { class: 'book-row' }, h('span', { class: 'book-badge', text: g }),
        h('div', null, h('b', { text: 'Spotlight ' + g }), h('small', { text: 'встречено ' + st.touched + ' из ' + total + ' · изучено ' + st.learned }), h('div', { class: 'bar' }, h('i', { style: { width: Math.min(100, Math.round(st.touched / total * 100)) + '%' } }))),
        h('a', { class: 'btn-acc ghost small', href: 'index.html#/course/' + g + '/0', text: 'Открыть' })));
    }

    // badges
    const badges = h('div', { class: 'badges' }, C.BADGES.map(([id, ico, name, how, test]) => { const got = test(stats); return h('div', { class: 'badge' + (got ? '' : ' locked'), title: how }, h('i', { 'aria-hidden': 'true', text: ico }), h('b', { text: name }), h('small', { text: got ? 'Получено!' : how })); }));

    // history
    const hist = h('div', { class: 'hist' });
    if (!sessions.length) hist.append(h('div', { class: 'empty', text: 'История появится после первой тренировки.' }));
    for (const s of sessions.slice(0, 15)) {
      const assessed = s.correct + s.wrong;
      hist.append(h('div', { class: 'row' }, h('div', { class: 'row-main' }, h('b', { text: (s.title || 'Тренировка') }), h('small', { text: (C.MODES[s.mode] || s.mode) + ' · ' + C.fmtDate(s.created_at, true) + (s.finished ? '' : ' · не завершена') })),
        assessed ? h('span', { class: 'score', title: 'Верно с первой попытки', text: s.accuracy != null ? s.accuracy + '%' : s.correct + '/' + assessed }) : null,
        s.xp ? h('span', { class: 'chip blue', text: '+' + s.xp + ' XP' }) : null));
    }

    // classes
    const joinInput = h('input', { class: 'acc-input code-in', id: 'joinCode', maxlength: 9, placeholder: 'КОД КЛАССА', autocomplete: 'off', 'aria-label': 'Код класса' });
    const joinBtn = h('button', { class: 'btn-acc', type: 'submit', text: 'Вступить' });
    const joinForm = h('form', { class: 'join-row' }, joinInput, joinBtn);
    joinForm.addEventListener('submit', async e => {
      e.preventDefault(); const code = joinInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length !== 8) return toast('Код класса состоит из 8 букв и цифр.');
      joinBtn.disabled = true;
      const { data, error } = await sb.rpc('join_group', { p_code: code }); joinBtn.disabled = false;
      if (error) return fail(error);
      if (!data.ok) return toast('Класс с таким кодом не найден. Проверь код у учителя.');
      toast('Ты в классе «' + data.name + '»!'); boot();
    });
    const classes = h('div', { class: 'list' }, memberships.map(m => h('div', { class: 'row' }, h('div', { class: 'row-main' }, h('b', { text: m.groups ? m.groups.name : 'Класс' }), h('small', { text: 'Учитель: ' + (groupTeacher.get(m.group_id) || '—') })),
      h('button', { class: 'btn-acc ghost small', type: 'button', text: 'Выйти', onclick: () => dialog('Выйти из класса?', h('p', { text: 'Учитель больше не будет видеть твои результаты и давать задания в этой группе.' }), close => [h('button', { class: 'btn-acc ghost', type: 'button', text: 'Остаться', onclick: close }), h('button', { class: 'btn-acc danger', type: 'button', text: 'Выйти из класса', onclick: async () => { const { error } = await sb.from('group_members').delete().eq('group_id', m.group_id).eq('student_id', uid); if (error) return fail(error); close(); boot(); } })]) }))));

    // guest progress on this device
    let importBox = null;
    try {
      const raw = Hint.guestGet('lexigo_progress_v1'); const guest = raw ? JSON.parse(raw) : null; const n = guest && typeof guest === 'object' ? Object.keys(guest).length : 0;
      if (n && !stats.guest_imported) {
        importBox = h('div', { class: 'acc-msg info span-12', style: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', margin: 0 } },
          h('span', { style: { flex: '1', minWidth: '220px' }, text: 'На этом устройстве есть прогресс без аккаунта: ' + n + ' ' + plural(n, 'слово', 'слова', 'слов') + '. Перенести его в аккаунт? (Это можно сделать один раз.)' }),
          h('button', { class: 'btn-acc small', type: 'button', text: 'Перенести', onclick: async ev => { ev.currentTarget.disabled = true; const { data, error } = await sb.rpc('import_guest_progress', { p: guest }); if (error) return fail(error); toast('Готово! Перенесено слов: ' + data.imported); boot(); } }));
      }
    } catch { importBox = null; }

    const joined = sessionStorage.getItem('lexigo_joined'); if (joined) { sessionStorage.removeItem('lexigo_joined'); setTimeout(() => toast('Ты в классе «' + joined + '»!'), 400); }

    root.replaceChildren(head('Ученик · ' + lv.title), h('div', { class: 'cab-grid' },
      importBox, hero,
      h('section', { class: 'acc-card span-12 st-lessons', id: 'lessons', 'aria-labelledby': 'tTasks' }, h('div', { class: 'sec-title' }, h('h2', { id: 'tTasks', text: 'Уроки от учителя' }),
        myLessons.length ? h('span', { class: 'chip ' + (openLessons ? 'blue' : 'ok'), text: openLessons ? 'не завершено: ' + openLessons : 'все пройдены' }) : null), taskList, moreLessons),
      tiles,
      h('section', { class: 'acc-card span-12', 'aria-labelledby': 'tBooks' }, h('div', { class: 'sec-title' }, h('h2', { id: 'tBooks', text: 'Мои учебники' })), books),
      h('section', { class: 'acc-card span-12', 'aria-labelledby': 'tBadges' }, h('div', { class: 'sec-title' }, h('h2', { id: 'tBadges', text: 'Достижения' }), h('span', { class: 'chip', text: C.BADGES.filter(b => b[4](stats)).length + ' из ' + C.BADGES.length })), badges),
      h('section', { class: 'acc-card span-7', 'aria-labelledby': 'tHist' }, h('div', { class: 'sec-title' }, h('h2', { id: 'tHist', text: 'История занятий' })), hist),
      h('section', { class: 'acc-card span-5', 'aria-labelledby': 'tClass' }, h('div', { class: 'sec-title' }, h('h2', { id: 'tClass', text: 'Мои классы' })), joinForm, h('div', { style: { height: '12px' } }), classes)));
  }

  /* =====================================================================
     TEACHER
     ===================================================================== */
  let T = null, tab = 'groups', lessonEdit = null;   // lessonEdit: null — список, 'new' — новый урок, объект — правка
  async function loadTeacher() {
    const [groups, lessons, assignments] = await Promise.all([
      sb.from('groups').select('*').eq('teacher_id', me.id).order('created_at').then(r => { if (r.error) throw r.error; return r.data; }),
      sb.from('custom_lessons').select('*').eq('owner_id', me.id).order('updated_at', { ascending: false }).then(r => r.data || []),
      sb.from('assignments').select('*').eq('teacher_id', me.id).order('created_at', { ascending: false }).then(r => r.data || [])
    ]);
    const members = groups.length ? (await sb.from('group_members').select('group_id,student_id,joined_at').in('group_id', groups.map(g => g.id))).data || [] : [];
    const ids = [...new Set(members.map(m => m.student_id))];
    let students = [], stats = [], sessions = [];
    if (ids.length) {
      const since = new Date(Date.now() - 60 * 864e5).toISOString();
      [students, stats, sessions] = await Promise.all([
        sb.from('profiles').select('id,display_name,avatar').in('id', ids).then(r => r.data || []),
        sb.from('user_stats').select('user_id,xp,streak_count,streak_last').in('user_id', ids).then(r => r.data || []),
        allRows(() => sb.from('sessions').select('id,user_id,assignment_id,mode,finished,accuracy,correct,wrong,total,created_at').in('user_id', ids).gte('created_at', since).order('created_at', { ascending: false }))
      ]);
    }
    T = { groups, lessons, assignments, members, students: new Map(students.map(s => [s.id, s])), stats: new Map(stats.map(s => [s.user_id, s])), sessions };
  }
  function teacher() {
    const tabs = [['groups', 'Классы'], ['tasks', 'Задания'], ['lessons', 'Мои уроки' + (T.lessons.length ? ' · ' + T.lessons.length : '')]];
    const tabBar = h('div', { class: 'cab-tabs', role: 'tablist' }, tabs.map(([k, label]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === k), onclick: () => { tab = k; lessonEdit = null; teacher(); } }, label)));
    const view = tab === 'groups' ? groupsView() : tab === 'tasks' ? tasksView() : lessonsView(lessonEdit);
    const totalStudents = new Set(T.members.map(m => m.student_id)).size;
    root.replaceChildren(head('Учитель · ' + T.groups.length + ' ' + plural(T.groups.length, 'класс', 'класса', 'классов') + ' · ' + totalStudents + ' ' + plural(totalStudents, 'ученик', 'ученика', 'учеников'),
      h('span', { class: 'seg' }, h('button', { class: 'btn-acc small ghost', type: 'button', text: '＋ Урок', onclick: () => { tab = 'lessons'; lessonEdit = 'new'; teacher(); } }),
        h('button', { class: 'btn-acc small', type: 'button', text: '＋ Задание', onclick: () => { tab = 'tasks'; teacher(); openWizard(); } }))), tabBar, view);
  }
  const studentName = id => (T.students.get(id) || {}).display_name || 'Ученик';
  function studentRow(id) {
    const ss = T.sessions.filter(s => s.user_id === id), week = ss.filter(s => daysAgo(s.created_at) < 7);
    const acc = ss.filter(s => s.accuracy != null).slice(0, 20); const avg = acc.length ? Math.round(acc.reduce((n, s) => n + s.accuracy, 0) / acc.length) : null;
    const st = T.stats.get(id) || { xp: 0 };
    return { week: week.length, avg, last: ss[0] ? ss[0].created_at : null, xp: st.xp };
  }

  /* ---------- groups ---------- */
  function groupsView() {
    const name = h('input', { class: 'acc-input', placeholder: 'Например: 5 «Б» или Группа по средам', maxlength: 60, 'aria-label': 'Название группы' });
    const form = h('form', { class: 'join-row' }, name, h('button', { class: 'btn-acc', type: 'submit', text: 'Создать класс' }));
    form.addEventListener('submit', async e => { e.preventDefault(); const n = name.value.trim(); if (!n) return toast('Придумайте название группы.'); const { error } = await sb.rpc('create_group', { p_name: n }); if (error) return fail(error); toast('Класс создан. Отправьте ученикам код или ссылку.'); await refresh(); });
    const wrap = h('div', { class: 'list' }, h('section', { class: 'acc-card' }, h('div', { class: 'sec-title' }, h('h2', { text: 'Новый класс или группа' })), form,
      h('p', { class: 'acc-small acc-muted', text: 'Ученики вступают сами: по коду в своём кабинете или по ссылке-приглашению. Вы видите только учеников своих групп.' })));
    if (!T.groups.length) wrap.append(h('div', { class: 'empty', text: 'Создайте первый класс — и пригласите учеников по коду.' }));
    for (const g of T.groups) {
      const ms = T.members.filter(m => m.group_id === g.id), link = base + 'auth.html?join=' + g.join_code;
      const rows = ms.map(m => { const r = studentRow(m.student_id); return h('tr', null,
        h('td', null, h('b', { text: studentName(m.student_id) })),
        h('td', { text: C.levelOf(r.xp).level + ' ур. · ' + r.xp + ' XP' }),
        h('td', { text: r.week }),
        h('td', null, r.avg == null ? '—' : h('span', { class: 'chip ' + (r.avg >= 80 ? 'ok' : r.avg >= 60 ? 'warn' : 'miss'), text: r.avg + '%' })),
        h('td', { text: r.last ? relDay(r.last) : 'ещё не занимался' }),
        h('td', null, h('button', { class: 'btn-link', type: 'button', text: 'Убрать', onclick: () => dialog('Убрать ученика из группы?', h('p', { text: studentName(m.student_id) + ' больше не будет получать задания этой группы, а вы перестанете видеть его результаты. Аккаунт ученика сохранится.' }), close => [h('button', { class: 'btn-acc ghost', type: 'button', text: 'Отмена', onclick: close }), h('button', { class: 'btn-acc danger', type: 'button', text: 'Убрать', onclick: async () => { const { error } = await sb.from('group_members').delete().eq('group_id', g.id).eq('student_id', m.student_id); if (error) return fail(error); close(); await refresh(); } })]) }))); });
      const gSess = T.sessions.filter(s => ms.some(m => m.student_id === s.user_id)), week = new Set(gSess.filter(s => daysAgo(s.created_at) < 7).map(s => s.user_id)).size;
      const accs = gSess.filter(s => s.accuracy != null); const avg = accs.length ? Math.round(accs.reduce((n, s) => n + s.accuracy, 0) / accs.length) : null;
      const hardBox = h('div');
      wrap.append(h('section', { class: 'group-card' },
        h('header', null, h('h3', { text: g.name }), h('span', { class: 'chip', text: ms.length + ' ' + plural(ms.length, 'ученик', 'ученика', 'учеников') }),
          h('button', { class: 'btn-link', type: 'button', text: 'Переименовать', onclick: () => { const inp = h('input', { class: 'acc-input', value: g.name, maxlength: 60 }); dialog('Название группы', inp, close => [h('button', { class: 'btn-acc ghost', type: 'button', text: 'Отмена', onclick: close }), h('button', { class: 'btn-acc', type: 'button', text: 'Сохранить', onclick: async () => { const { error } = await sb.from('groups').update({ name: inp.value.trim() }).eq('id', g.id); if (error) return fail(error); close(); await refresh(); } })]); } }),
          h('button', { class: 'btn-link', type: 'button', style: { color: 'var(--w-miss)' }, text: 'Удалить', onclick: () => dialog('Удалить группу «' + g.name + '»?', h('p', { text: 'Будут удалены группа и её задания. Аккаунты и личный прогресс учеников сохранятся.' }), close => [h('button', { class: 'btn-acc ghost', type: 'button', text: 'Отмена', onclick: close }), h('button', { class: 'btn-acc danger', type: 'button', text: 'Удалить группу', onclick: async () => { const { error } = await sb.from('groups').delete().eq('id', g.id); if (error) return fail(error); close(); await refresh(); } })]) })),
        h('div', { class: 'invite' }, h('span', { text: 'Код класса:' }), h('span', { class: 'code', text: g.join_code }),
          h('button', { class: 'btn-acc ghost small', type: 'button', text: 'Копировать код', onclick: () => copy(g.join_code, 'Код скопирован') }),
          h('button', { class: 'btn-acc ghost small', type: 'button', text: 'Копировать ссылку-приглашение', onclick: () => copy(link, 'Ссылка скопирована — отправьте её ученикам') }),
          h('button', { class: 'btn-link', type: 'button', text: 'Новый код', title: 'Старый код перестанет работать', onclick: async () => { const { error } = await sb.rpc('regenerate_join_code', { p_group: g.id }); if (error) return fail(error); toast('Код обновлён. Старый больше не работает.'); await refresh(); } })),
        ms.length ? h('div', { class: 'summary' },
          h('div', { class: 'tile t1' }, h('b', { text: week + '/' + ms.length }), h('span', { text: 'занимались за 7 дней' })),
          h('div', { class: 'tile t3' }, h('b', { text: avg == null ? '—' : avg + '%' }), h('span', { text: 'средняя точность' })),
          h('div', { class: 'tile t4' }, h('b', { text: gSess.filter(s => s.finished).length }), h('span', { text: 'тренировок за 60 дней' })),
          h('div', { class: 'tile t2' }, h('b', { text: T.assignments.filter(a => a.group_id === g.id).length }), h('span', { text: 'заданий' }))) : null,
        ms.length ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, ['Ученик', 'Уровень', 'Занятий за 7 дн.', 'Точность', 'Последнее занятие', ''].map(t => h('th', { text: t })))), h('tbody', null, rows)))
          : h('div', { class: 'empty', text: 'Пока никто не вступил. Отправьте ученикам код ' + g.join_code + ' или ссылку-приглашение.' }),
        ms.length ? h('div', null, h('button', { class: 'btn-acc ghost small', type: 'button', text: 'Показать трудные слова группы', onclick: async ev => { ev.currentTarget.remove(); hardBox.append(h('p', { class: 'acc-muted acc-small', text: 'Считаем…' })); const ids = gSess.slice(0, 400).map(s => s.id); hardBox.replaceChildren(await hardWords(ids, 'Трудные слова за 60 дней')); } }), hardBox) : null));
    }
    return wrap;
  }
  async function hardWords(sessionIds, title, lessonsById) {
    if (!sessionIds.length) return h('div', { class: 'empty', text: 'Пока нет ответов.' });
    const counts = new Map(), totals = new Map();
    for (let i = 0; i < sessionIds.length; i += 100) {
      const { data, error } = await sb.from('sessions').select('events,lesson_id').in('id', sessionIds.slice(i, i + 100)); if (error) { fail(error); break; }
      for (const s of data) for (const e of (Array.isArray(s.events) ? s.events : [])) { if (!e || !e.w || e.k === 'self' || e.r) continue; totals.set(e.w, (totals.get(e.w) || 0) + 1); if (!e.ok || e.h) counts.set(e.w, (counts.get(e.w) || 0) + 1); }
    }
    const idx = C.words(), custom = new Map();
    for (const l of T.lessons) C.customWords(l).forEach(w => custom.set(w.id, w));
    if (lessonsById) for (const l of lessonsById) C.customWords(l).forEach(w => custom.set(w.id, w));
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
    if (!top.length) return h('div', null, h('h3', { text: title, style: { fontSize: '15px', margin: '6px 0 8px' } }), h('div', { class: 'empty', text: 'Ошибок почти нет — отличная работа класса!' }));
    return h('div', null, h('h3', { text: title, style: { fontSize: '15px', margin: '6px 0 8px' } }),
      h('div', { class: 'hard' }, top.map(([id, n]) => { const w = idx.get(id) || custom.get(id) || { en: id, ru: '' }; return h('span', { title: w.ru }, w.en + ' — ' + w.ru + ' ', h('small', { text: '(' + n + ' из ' + totals.get(id) + ')' })); })),
      h('p', { class: 'acc-small acc-muted', text: 'В скобках: ошибки или подсказки / все первые ответы.' }));
  }

  /* ---------- assignments ---------- */
  let wizard = null;
  function tasksView() {
    const wrap = h('div', { class: 'list' });
    wrap.append(wizard || h('div', null, h('button', { class: 'btn-acc', type: 'button', text: '＋ Новое задание', onclick: () => openWizard() })));
    if (!T.assignments.length) wrap.append(h('div', { class: 'empty', text: 'Заданий пока нет. Выберите учебник, модуль, слова и игры — и назначьте классу за пару минут.' }));
    for (const a of T.assignments) {
      const g = T.groups.find(x => x.id === a.group_id);
      const targets = a.student_id ? [a.student_id] : T.members.filter(m => m.group_id === a.group_id).map(m => m.student_id);
      const done = targets.filter(id => a.modes.every(m => T.sessions.some(s => s.assignment_id === a.id && s.user_id === id && s.finished && s.mode === m))).length;
      const started = targets.filter(id => T.sessions.some(s => s.assignment_id === a.id && s.user_id === id)).length;
      wrap.append(h('article', { class: 'group-card' },
        h('header', null, h('h3', { text: a.title }), h('span', { class: 'chip ' + (targets.length && done === targets.length ? 'ok' : 'blue'), text: 'выполнили ' + done + ' из ' + targets.length })),
        h('small', { class: 'acc-muted', text: (g ? g.name : 'Группа') + (a.student_id ? ' · только ' + studentName(a.student_id) : ' · вся группа') + ' · создано ' + C.fmtDate(a.created_at) + (a.due_at ? ' · срок ' + C.fmtDate(a.due_at, true) : '') + ' · приступили ' + started }),
        h('div', { class: 'bar' }, h('i', { style: { width: (targets.length ? Math.round(done / targets.length * 100) : 0) + '%' } })),
        h('div', { class: 'seg' }, a.modes.map(m => h('span', { class: 'chip', text: C.MODES[m] || m }))),
        a.comment ? h('p', { class: 'acc-small', style: { margin: 0 }, text: '💬 ' + a.comment }) : null,
        h('div', { class: 'seg' }, h('button', { class: 'btn-acc small', type: 'button', text: 'Результаты', onclick: () => results(a) }),
          h('button', { class: 'btn-acc ghost small', type: 'button', text: 'Удалить', onclick: () => dialog('Удалить задание?', h('p', { text: 'Задание исчезнет у учеников. Уже сохранённые тренировки останутся в их истории.' }), close => [h('button', { class: 'btn-acc ghost', type: 'button', text: 'Отмена', onclick: close }), h('button', { class: 'btn-acc danger', type: 'button', text: 'Удалить', onclick: async () => { const { error } = await sb.from('assignments').delete().eq('id', a.id); if (error) return fail(error); close(); await refresh(); } })]) }))));
    }
    return wrap;
  }
  async function results(a) {
    const targets = a.student_id ? [a.student_id] : T.members.filter(m => m.group_id === a.group_id).map(m => m.student_id);
    const { data: ss, error } = await sb.from('sessions').select('id,user_id,mode,finished,accuracy,correct,wrong,total,created_at').eq('assignment_id', a.id).order('created_at', { ascending: false });
    if (error) return fail(error);
    const rows = targets.map(id => {
      const mine = ss.filter(s => s.user_id === id), doneModes = new Set(mine.filter(s => s.finished).map(s => s.mode)), n = a.modes.filter(m => doneModes.has(m)).length;
      const accs = mine.filter(s => s.accuracy != null), avg = accs.length ? Math.round(accs.reduce((x, s) => x + s.accuracy, 0) / accs.length) : null;
      const status = n === a.modes.length ? ['ok', 'Выполнено'] : mine.length ? ['warn', 'В процессе ' + n + '/' + a.modes.length] : ['miss', 'Не приступал'];
      return { id, status, avg, correct: mine.reduce((x, s) => x + s.correct, 0), wrong: mine.reduce((x, s) => x + s.wrong, 0), last: mine[0] && mine[0].created_at, tries: mine.length };
    }).sort((x, y) => x.status[1].localeCompare(y.status[1]));
    const cnt = k => rows.filter(r => r.status[0] === k).length;
    const accAll = rows.filter(r => r.avg != null); const avgAll = accAll.length ? Math.round(accAll.reduce((x, r) => x + r.avg, 0) / accAll.length) : null;
    let lessons = null; if (a.lesson_id) { const { data } = await sb.from('custom_lessons').select('id,words').eq('id', a.lesson_id); lessons = data; }
    const hard = await hardWords(ss.map(s => s.id), 'Слова, которые вызывают затруднения', lessons);
    dialog(a.title, h('div', null,
      h('div', { class: 'summary' }, h('div', { class: 'tile t3' }, h('b', { text: cnt('ok') }), h('span', { text: 'выполнили' })), h('div', { class: 'tile t2' }, h('b', { text: cnt('warn') }), h('span', { text: 'в процессе' })),
        h('div', { class: 'tile t1' }, h('b', { text: cnt('miss') }), h('span', { text: 'не приступали' })), h('div', { class: 'tile t4' }, h('b', { text: avgAll == null ? '—' : avgAll + '%' }), h('span', { text: 'средняя точность' }))),
      rows.length ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, ['Ученик', 'Статус', 'Точность', 'Верно / ошибки', 'Попыток', 'Последняя'].map(t => h('th', { text: t })))),
        h('tbody', null, rows.map(r => h('tr', null, h('td', null, h('b', { text: studentName(r.id) })), h('td', null, h('span', { class: 'chip ' + r.status[0], text: r.status[1] })), h('td', { text: r.avg == null ? '—' : r.avg + '%' }), h('td', { text: r.correct + ' / ' + r.wrong }), h('td', { text: r.tries }), h('td', { text: r.last ? C.fmtDate(r.last, true) : '—' })))))) : h('div', { class: 'empty', text: 'В группе пока нет учеников.' }),
      h('div', { style: { marginTop: '14px' } }, hard),
      h('p', { class: 'acc-small acc-muted', text: 'Точность — доля верных ответов с первой попытки без подсказки. «Выполнено» — пройдены до конца все игры задания.' })));
    document.querySelector('.dialog > div').style.width = 'min(860px,100%)';
  }

  function openWizard(preset = {}) {
    if (!T.groups.length) { tab = 'groups'; teacher(); return toast('Сначала создайте класс — задания назначаются группе или ученику из неё.'); }
    const state = { group: T.groups[0].id, student: '', source: preset.lesson ? 'lesson' : 'book', grade: 2, module: 0, sections: new Set(), wordIds: null, lesson: preset.lesson || (T.lessons[0] && T.lessons[0].id) || '', modes: new Set(['quiz', 'spell', 'pairs']), title: '', titleTouched: false };
    const lessonById = id => T.lessons.find(x => x.id === id);
    // игры своего урока подставляются автоматически — учитель выбрал их при создании урока
    const useLessonModes = () => { const l = lessonById(state.lesson); if (l) { state.modes.clear(); C.lessonModes(l).forEach(m => state.modes.add(m)); } };
    if (state.source === 'lesson') useLessonModes();
    const box = h('section', { class: 'acc-card wiz', 'aria-label': 'Новое задание' });
    const msg = h('p', { class: 'acc-msg', role: 'status' });
    function sectionsOf() { const b = DB.books.find(x => x.grade === state.grade); const m = modules(b)[state.module]; return b.sections.map((s, i) => ({ s, i })).filter(x => x.s.module === m && x.s.words.some(C.isLexical)); }
    function chosenWords() {
      if (state.source === 'lesson') { const l = T.lessons.find(x => x.id === state.lesson); return l ? C.customWords(l) : []; }
      const b = DB.books.find(x => x.grade === state.grade); let ws = [...state.sections].sort((x, y) => x - y).flatMap(i => b.sections[i].words.filter(C.isLexical));
      const seen = new Set(); ws = ws.filter(w => !seen.has(w.id) && seen.add(w.id));
      return state.wordIds ? ws.filter(w => state.wordIds.has(w.id)) : ws;
    }
    function autoTitle() {
      if (state.titleTouched) return state.title;
      if (state.source === 'lesson') { const l = T.lessons.find(x => x.id === state.lesson); return l ? l.title : 'Мой урок'; }
      const b = DB.books.find(x => x.grade === state.grade), list = [...state.sections].sort((x, y) => x - y);
      const m = modules(b)[state.module];
      return 'Spotlight ' + state.grade + ' · ' + m + (list.length === 1 ? ' · ' + b.sections[list[0]].title : '');
    }
    function draw() {
      const g = T.groups.find(x => x.id === state.group), ms = T.members.filter(m => m.group_id === state.group);
      const step1 = h('div', { class: 'wiz-step' }, h('h3', null, h('i', { text: '1' }), 'Кому'),
        h('div', { class: 'seg' }, T.groups.map(x => h('button', { type: 'button', 'aria-pressed': String(x.id === state.group), text: x.name, onclick: () => { state.group = x.id; state.student = ''; draw(); } }))),
        h('label', { class: 'acc-field', style: { marginTop: '10px', marginBottom: 0 } }, h('span', { text: 'Ученики' }),
          h('select', { onchange: e => { state.student = e.target.value; } }, h('option', { value: '', text: 'Вся группа «' + (g ? g.name : '') + '» (' + ms.length + ')' }), ms.map(m => h('option', { value: m.student_id, selected: state.student === m.student_id, text: studentName(m.student_id) })))));
      const step2 = h('div', { class: 'wiz-step' }, h('h3', null, h('i', { text: '2' }), 'Что повторяем'),
        h('div', { class: 'seg' }, h('button', { type: 'button', 'aria-pressed': String(state.source === 'book'), text: '📘 Учебник Spotlight', onclick: () => { state.source = 'book'; draw(); } }), h('button', { type: 'button', 'aria-pressed': String(state.source === 'lesson'), text: '✏️ Мой урок', onclick: () => { if (state.source !== 'lesson') { state.source = 'lesson'; useLessonModes(); } draw(); } })));
      if (state.source === 'book') {
        const b = DB.books.find(x => x.grade === state.grade), mods = modules(b), secs = sectionsOf();
        const grid = h('div', { class: 'lessons-pick' }, secs.map(({ s, i }) => h('label', null, h('input', { type: 'checkbox', checked: state.sections.has(i), onchange: e => { e.target.checked ? state.sections.add(i) : state.sections.delete(i); state.wordIds = null; draw(); } }), h('span', null, s.title, h('small', { class: 'acc-muted', text: ' · ' + s.words.filter(C.isLexical).length + ' сл.' })))));
        step2.append(h('div', { class: 'cab-grid', style: { gap: '10px', marginTop: '10px' } },
          h('label', { class: 'acc-field span-4', style: { margin: 0 } }, h('span', { text: 'Учебник' }), h('select', { onchange: e => { state.grade = Number(e.target.value); state.module = 0; state.sections.clear(); state.wordIds = null; draw(); } }, DB.books.map(x => h('option', { value: x.grade, selected: x.grade === state.grade, text: 'Spotlight ' + x.grade })))),
          h('label', { class: 'acc-field span-8', style: { margin: 0 } }, h('span', { text: 'Модуль' }), h('select', { onchange: e => { state.module = Number(e.target.value); state.sections.clear(); state.wordIds = null; draw(); } }, mods.map((m, i) => h('option', { value: i, selected: i === state.module, text: m }))))),
          h('div', { class: 'sec-title', style: { margin: '12px 0 6px' } }, h('b', { text: 'Уроки модуля' }), h('button', { type: 'button', class: 'btn-link', text: state.sections.size === secs.length ? 'Снять все' : 'Выбрать все', onclick: () => { if (state.sections.size === secs.length) state.sections.clear(); else secs.forEach(x => state.sections.add(x.i)); state.wordIds = null; draw(); } })), grid);
        if (state.sections.size) {
          const all = (() => { const keep = state.wordIds; state.wordIds = null; const w = chosenWords(); state.wordIds = keep; return w; })();
          const det = h('details', { open: !!state.wordIds }, h('summary', { class: 'btn-link', style: { cursor: 'pointer', marginTop: '10px' }, text: state.wordIds ? 'Выбрано слов: ' + state.wordIds.size + ' из ' + all.length : 'Все ' + all.length + ' слов · выбрать отдельные' }),
            h('div', { class: 'words-pick' }, all.map(w => h('label', null, h('input', { type: 'checkbox', checked: !state.wordIds || state.wordIds.has(w.id), onchange: e => { if (!state.wordIds) state.wordIds = new Set(all.map(x => x.id)); e.target.checked ? state.wordIds.add(w.id) : state.wordIds.delete(w.id); det.querySelector('summary').textContent = 'Выбрано слов: ' + state.wordIds.size + ' из ' + all.length; picker.refresh(); } }), h('span', null, w.en, h('small', { text: w.ru }))))));
          step2.append(det);
        }
      } else if (!T.lessons.length) {
        step2.append(h('div', { class: 'empty', style: { marginTop: '10px' } }, 'У вас пока нет своих уроков. ', h('button', { type: 'button', class: 'btn-link', text: 'Создать урок', onclick: () => { wizard = null; tab = 'lessons'; lessonEdit = 'new'; teacher(); } })));
      } else {
        step2.append(h('label', { class: 'acc-field', style: { marginTop: '10px' } }, h('span', { text: 'Урок' }), h('select', { onchange: e => { state.lesson = e.target.value; useLessonModes(); draw(); } }, T.lessons.map(l => h('option', { value: l.id, selected: l.id === state.lesson, text: l.title + ' (' + l.words.length + ' сл.)' })))));
      }
      const picker = modePicker(state.modes, chosenWords);
      const step3 = h('div', { class: 'wiz-step' }, h('h3', null, h('i', { text: '3' }), 'Игры'), picker,
        h('p', { class: 'acc-small acc-muted', style: { margin: '8px 0 0' }, text: 'Можно выбрать одну игру, несколько или все. «Конструктор слов», «Аудиодиктант», «Кристаллы» и «Финальный тест» используют только отдельные слова (без фраз).' + (state.source === 'lesson' ? ' Для своего урока подставлены игры, выбранные при его создании.' : '') }));
      const titleIn = h('input', { class: 'acc-input', maxlength: 120, value: autoTitle(), oninput: e => { state.title = e.target.value; state.titleTouched = true; } });
      const due = h('input', { class: 'acc-input', type: 'datetime-local', id: 'wizDue' });
      const comment = h('textarea', { class: 'acc-input', maxlength: 500, rows: 2, style: { minHeight: '70px' }, placeholder: 'Например: «Повторите слова к контрольной в пятницу»' });
      const step4 = h('div', { class: 'wiz-step' }, h('h3', null, h('i', { text: '4' }), 'Название, срок и комментарий'),
        h('label', { class: 'acc-field' }, h('span', { text: 'Название' }), titleIn),
        h('div', { class: 'cab-grid', style: { gap: '10px' } }, h('label', { class: 'acc-field span-4', style: { margin: 0 } }, h('span', { text: 'Срок (необязательно)' }), due), h('label', { class: 'acc-field span-8', style: { margin: 0 } }, h('span', { text: 'Комментарий для учеников' }), comment)));
      const go = h('button', { class: 'btn-acc lime', type: 'button', text: 'Назначить', onclick: async () => {
        const ws = chosenWords();
        if (state.source === 'book' && !state.sections.size) return setMsg('Выберите хотя бы один урок.');
        if (state.source === 'lesson' && !state.lesson) return setMsg('Выберите урок.');
        if (ws.length < 2) return setMsg('Нужно минимум 2 слова.');
        if (!state.modes.size) return setMsg('Выберите хотя бы одну игру.');
        const unfit = [...state.modes].filter(m => !C.modeFit(m, ws).ok);
        if (unfit.length) return setMsg(unfit.map(m => '«' + C.MODES[m] + '»: ' + C.modeFit(m, ws).note).join(' ') + ' Снимите эти игры или выберите другие слова.');
        const title = (titleIn.value || autoTitle()).trim().slice(0, 120);
        const row = { group_id: state.group, teacher_id: me.id, student_id: state.student || null, title, modes: C.ASSIGNABLE.filter(m => state.modes.has(m)), due_at: due.value ? new Date(due.value).toISOString() : null, comment: comment.value.trim() || null };
        if (state.source === 'book') { row.grade = state.grade; row.section_indexes = [...state.sections].sort((x, y) => x - y); if (state.wordIds) row.word_ids = ws.map(w => w.id).slice(0, 300); }
        else row.lesson_id = state.lesson;
        go.disabled = true;
        const { error } = await sb.from('assignments').insert(row); go.disabled = false;
        if (error) return fail(error);
        wizard = null; toast('Задание назначено! Ученики увидят его в кабинете.'); await refresh();
      } });
      function setMsg(t) { msg.className = 'acc-msg err'; msg.textContent = t; msg.scrollIntoView({ block: 'nearest' }); }
      const words = chosenWords();
      box.replaceChildren(h('div', { class: 'sec-title' }, h('h2', { text: 'Новое задание' }), h('button', { type: 'button', class: 'btn-link', text: 'Отмена', onclick: () => { wizard = null; teacher(); } })),
        step1, step2, step3, step4, msg,
        h('div', { class: 'seg', style: { alignItems: 'center' } }, go, h('span', { class: 'acc-muted acc-small', text: words.length ? 'Слов в задании: ' + words.length : '' })));
    }
    draw(); wizard = box; teacher(); box.scrollIntoView({ block: 'start' });
  }

  /* ---------- выбор игр: без ограничения по количеству, с проверкой совместимости ---------- */
  // modes: Set (изменяется на месте); getWords(): текущие слова; onChange(): после изменения
  function modePicker(modes, getWords, onChange) {
    const all = C.ASSIGNABLE, box = h('div', { class: 'mode-pick' });
    const count = h('b', { class: 'mode-count', 'aria-live': 'polite' });
    const toggleAll = h('button', { type: 'button', class: 'btn-link' });
    const grid = h('div', { class: 'mode-grid', role: 'group', 'aria-label': 'Игры' });
    const note = h('p', { class: 'mode-note', role: 'status' });
    function paint() {
      const ws = getWords(), bad = [], part = [];
      count.textContent = 'Выбрано: ' + modes.size + ' из ' + all.length;
      toggleAll.textContent = modes.size === all.length ? 'Снять все' : 'Выбрать все';
      grid.replaceChildren(...all.map(m => {
        const fit = ws.length ? C.modeFit(m, ws) : { ok: true, note: null };
        const on = modes.has(m);
        if (on && !fit.ok) bad.push(m); else if (on && fit.note) part.push(m);
        const status = !ws.length ? '' : !fit.ok ? '✕ не подходит' : fit.note ? '⚠ частично' : '✓';
        return h('button', { type: 'button', class: 'mode-opt' + (fit.ok ? '' : ' unfit') + (fit.ok && fit.note ? ' partial' : ''), 'aria-pressed': String(on), 'data-mode': m, title: fit.note || C.MODE_HINTS[m] || '',
          onclick: () => { on ? modes.delete(m) : modes.add(m); paint(); onChange && onChange(); } },
          h('span', { class: 'mo-check', 'aria-hidden': 'true', text: on ? '✓' : '' }), h('span', { class: 'mo-txt' }, h('b', { text: C.MODES[m] || m }), h('small', { text: C.MODE_HINTS[m] || '' }),
            status && status !== '✓' ? h('i', { class: 'mo-fit', text: status }) : null));
      }));
      const lines = [];
      const line = (mark, m) => { const n = C.modeFit(m, ws).note; return mark + ' ' + (n.startsWith('«') ? n : C.MODES[m] + ': ' + n); };
      for (const m of bad) lines.push(line('✕', m));
      for (const m of part) lines.push(line('⚠', m));
      note.className = 'mode-note' + (bad.length ? ' err' : part.length ? ' warn' : '');
      note.replaceChildren(...lines.map(t => h('span', { text: t })));
      note.hidden = !lines.length;
    }
    toggleAll.addEventListener('click', () => { if (modes.size === all.length) modes.clear(); else all.forEach(m => modes.add(m)); paint(); onChange && onChange(); });
    box.append(h('div', { class: 'mode-head' }, count, h('span', { class: 'seg' }, toggleAll)), grid, note);
    paint();
    box.refresh = paint;
    box.unfit = () => { const ws = getWords(); return [...modes].filter(m => !C.modeFit(m, ws).ok); };
    return box;
  }
  /* страница своего урока — та же, что видит ученик, с режимом тренировки учителя (my-lessons.js) */
  const lessonUrl = id => 'index.html#/my/t-' + encodeURIComponent(id), playUrl = id => lessonUrl(id) + '/games';

  /* ---------- «Мои уроки»: карточки уроков, полноценная страница урока, создание и правка ---------- */
  function lessonsView(edit) {
    return edit ? lessonForm(edit === 'new' ? null : edit) : lessonsList();
  }
  function assignedInfo(l) {
    const list = T.assignments.filter(a => a.lesson_id === l.id);
    if (!list.length) return { list, text: 'Ещё не назначен', none: true };
    const parts = list.map(a => { const g = T.groups.find(x => x.id === a.group_id); return (g ? g.name : 'группа') + (a.student_id ? ' — ' + studentName(a.student_id) : ''); });
    let targets = 0, done = 0;
    for (const a of list) {
      const ids = a.student_id ? [a.student_id] : T.members.filter(m => m.group_id === a.group_id).map(m => m.student_id);
      targets += ids.length;
      done += ids.filter(id => a.modes.every(m => T.sessions.some(s => s.assignment_id === a.id && s.user_id === id && s.finished && s.mode === m))).length;
    }
    return { list, text: 'Назначен: ' + [...new Set(parts)].join(', ') + (targets ? ' · выполнили ' + done + ' из ' + targets : '') };
  }
  function lessonsList() {
    const wrap = h('div', { class: 'list' });
    const newBtn = h('button', { class: 'btn-acc lime', type: 'button', text: '＋ Новый урок', onclick: () => { lessonEdit = 'new'; teacher(); window.scrollTo({ top: 0 }); } });
    wrap.append(h('div', { class: 'ml-head' }, h('h2', { text: 'Мои уроки' }), h('span', { class: 'chip', text: T.lessons.length + ' ' + plural(T.lessons.length, 'урок', 'урока', 'уроков') }), newBtn));
    if (!T.lessons.length) {
      wrap.append(h('section', { class: 'acc-card ml-empty' }, h('img', { src: 'assets/lexi-head.webp', alt: '' }),
        h('div', null, h('h3', { text: 'Создайте первый урок', style: { margin: '0 0 6px' } }), h('p', { class: 'acc-muted', style: { margin: '0 0 10px' }, text: 'Свои слова → любые игры LEXI → пройдите урок сами → назначьте классу.' }), h('button', { class: 'btn-acc', type: 'button', text: '＋ Новый урок', onclick: () => newBtn.click() }))));
      return wrap;
    }
    const grid = h('div', { class: 'ml-grid' });
    const search = T.lessons.length > 6 ? h('input', { class: 'acc-input', type: 'search', placeholder: 'Найти урок по названию или слову', 'aria-label': 'Найти урок', oninput: e => {
      const q = e.target.value.trim().toLowerCase();
      for (const card of grid.children) card.hidden = !!q && !card.dataset.search.includes(q);
    } }) : null;
    if (search) wrap.append(h('div', { class: 'ml-tools' }, search));
    for (const l of T.lessons) {
      const info = assignedInfo(l), ms = C.lessonModes(l);
      const card = h('article', { class: 'ml-card lesson-row', 'data-id': l.id, 'data-search': (l.title + ' ' + l.words.map(w => w.en + ' ' + w.ru).join(' ')).toLowerCase() },
        h('h3', { text: l.title }),
        h('div', { class: 'ml-facts' }, h('span', { text: l.words.length + ' ' + plural(l.words.length, 'слово', 'слова', 'слов') }), h('span', { text: 'создан ' + C.fmtDate(l.created_at) }), h('span', { text: 'игр в уроке: ' + ms.length })),
        h('p', { class: 'ml-assigned' + (info.none ? ' none' : ''), text: info.text }),
        h('p', { class: 'ml-words', text: l.words.slice(0, 6).map(w => w.en).join(', ') + (l.words.length > 6 ? '…' : '') }),
        h('div', { class: 'ml-actions' },
          h('a', { class: 'btn-acc small ghost', href: lessonUrl(l.id), 'aria-label': 'Открыть: ' + l.title, text: 'Открыть' }),
          h('a', { class: 'btn-acc small lime', href: playUrl(l.id), 'aria-label': 'Играть: ' + l.title, text: '▶ Играть' }),
          h('button', { class: 'btn-acc small ghost', type: 'button', 'aria-label': 'Редактировать: ' + l.title, text: 'Редактировать', onclick: () => { lessonEdit = l; teacher(); window.scrollTo({ top: 0 }); } }),
          h('button', { class: 'btn-acc small', type: 'button', 'aria-label': 'Назначить: ' + l.title, text: 'Назначить', onclick: () => { tab = 'tasks'; openWizard({ lesson: l.id }); } })),
        h('div', { class: 'ml-more' }, h('button', { class: 'btn-link', type: 'button', style: { color: 'var(--w-miss)' }, text: 'Удалить', onclick: () => dialog('Удалить урок «' + l.title + '»?', h('p', { text: 'Задания с этим уроком тоже будут удалены.' }), close => [h('button', { class: 'btn-acc ghost', type: 'button', text: 'Отмена', onclick: close }), h('button', { class: 'btn-acc danger', type: 'button', text: 'Удалить', onclick: async () => { const { error } = await sb.from('custom_lessons').delete().eq('id', l.id); if (error) return fail(error); close(); await refresh(); } })]) })));
      grid.append(card);
    }
    wrap.append(grid, h('p', { class: 'acc-small acc-muted', text: '«Открыть» — слова урока и все подходящие игры на отдельной странице; «Играть» — сразу к играм. Ваши тренировки не попадают в статистику класса и не начисляют XP. Ученики видят урок, когда вы назначаете его.' }));
    return wrap;
  }
  function lessonForm(editing) {
    const wrap = h('div', { class: 'list' });
    const title = h('input', { class: 'acc-input', maxlength: 80, value: editing ? editing.title : '', placeholder: 'Например: Еда и напитки — дополнительные слова', id: 'lsTitle' });
    const text = h('textarea', { class: 'acc-input', id: 'lsWords', placeholder: 'apple — яблоко\nice cream — мороженое\ncarrot; морковь', value: '' });
    if (editing) text.value = editing.words.map(w => w.en + ' — ' + w.ru).join('\n');
    const modes = new Set(editing ? C.lessonModes(editing) : C.ASSIGNABLE);
    const words = () => C.parseWordList(text.value).map((w, i) => ({ id: 'n' + i, en: w.en, ru: w.ru }));
    const preview = h('div', { class: 'preview-words' }), count = h('small');
    const picker = modePicker(modes, words);
    let timer = 0;
    const upd = () => { const ws = C.parseWordList(text.value); count.textContent = 'Распознано слов: ' + ws.length + ' (нужно от 2 до 200). Строки без перевода пропускаются.'; preview.replaceChildren(...ws.slice(0, 60).map(w => h('span', { text: w.en + ' — ' + w.ru }))); clearTimeout(timer); timer = setTimeout(picker.refresh, 250); };
    text.addEventListener('input', upd); upd();
    const back = () => { lessonEdit = null; tab = 'lessons'; teacher(); };
    const save = h('button', { class: 'btn-acc', type: 'submit', text: editing ? 'Сохранить изменения' : 'Сохранить урок' });
    const saveAndPlay = h('button', { class: 'btn-acc lime', type: 'button', text: '▶ Сохранить и пройти' });
    const form = h('form', { class: 'acc-card' }, h('div', { class: 'sec-title' }, h('h2', { text: editing ? 'Редактировать урок' : 'Новый урок' }), h('button', { type: 'button', class: 'btn-link', text: '← К моим урокам', onclick: back })),
      h('label', { class: 'acc-field', for: 'lsTitle' }, h('span', { text: 'Название' }), title),
      h('label', { class: 'acc-field', for: 'lsWords' }, h('span', { text: 'Слова — по одному на строку: английское слово, тире, перевод' }), text, count),
      preview,
      h('div', { class: 'acc-field', style: { marginTop: '14px' } }, h('span', { text: 'Игры урока — их получат ученики при назначении. Сами вы можете пройти любую подходящую игру.' }), picker),
      h('div', { class: 'seg', style: { marginTop: '12px', alignItems: 'center' } }, save, saveAndPlay, h('button', { type: 'button', class: 'btn-acc ghost', text: 'Отмена', onclick: back })));
    async function persist(play) {
      const ws = C.parseWordList(text.value), t = title.value.trim();
      if (!t) return toast('Добавьте название урока.'); if (ws.length < 2) return toast('Нужно минимум 2 слова с переводом.');
      if (!modes.size) return toast('Выберите хотя бы одну игру.');
      const unfit = picker.unfit();
      if (unfit.length) return toast('Не подходит к словам урока: ' + unfit.map(m => '«' + C.MODES[m] + '»').join(', ') + '. Снимите эти игры или добавьте отдельные слова.');
      const list = C.ASSIGNABLE.filter(m => modes.has(m));
      save.disabled = saveAndPlay.disabled = true;
      const res = editing ? await sb.from('custom_lessons').update({ title: t, words: ws, modes: list, updated_at: new Date().toISOString() }).eq('id', editing.id)
        : await sb.from('custom_lessons').insert({ owner_id: me.id, title: t, words: ws, modes: list });
      if (res.error) { save.disabled = saveAndPlay.disabled = false; return fail(res.error); }
      let id = editing ? editing.id : null;
      // RLS не отдаёт строку в ответ на insert — находим только что созданный урок отдельным запросом
      if (!id && play) { const r = await sb.from('custom_lessons').select('id').eq('owner_id', me.id).eq('title', t).order('created_at', { ascending: false }).limit(1); id = r.data && r.data[0] && r.data[0].id; }
      save.disabled = saveAndPlay.disabled = false;
      if (play && id) { location.href = playUrl(id); return; }
      toast(editing ? 'Урок обновлён.' : 'Урок сохранён. Откройте его («▶ Играть») или назначьте классу.'); lessonEdit = null; tab = 'lessons'; await refresh();
    }
    form.addEventListener('submit', e => { e.preventDefault(); persist(false); });
    saveAndPlay.addEventListener('click', () => persist(true));
    wrap.append(form);
    wrap.append(h('p', { class: 'acc-small acc-muted', text: 'Создайте урок → выберите игры → сохраните → пройдите его сами → назначьте классу. Ваши тренировки не попадают в статистику класса и не начисляют XP.' }));
    return wrap;
  }
  async function refresh() { try { await loadTeacher(); teacher(); } catch (e) { fail(e); } }

  /* =====================================================================
     START
     ===================================================================== */
  async function boot() {
    try {
      if (profile.role === 'teacher') {
        await loadTeacher();
        // ссылки из режима тренировки: me.html?tab=lessons, me.html?assign=<id урока>
        const q = new URLSearchParams(location.search), assign = q.get('assign'), t = q.get('tab');
        if (t && ['groups', 'tasks', 'lessons'].includes(t)) tab = t;
        const edit = q.get('edit'), el = edit && T.lessons.find(l => l.id === edit);
        if (el) { tab = 'lessons'; lessonEdit = el; }
        if (q.has('assign') || q.has('tab') || q.has('edit')) history.replaceState(null, '', location.pathname);
        teacher();
        if (assign && T.lessons.some(l => l.id === assign)) { tab = 'tasks'; openWizard({ lesson: assign }); }
      } else await student();
    } catch (e) { root.replaceChildren(h('div', { class: 'acc-card' }, h('p', { class: 'acc-msg err', text: 'Не удалось загрузить кабинет. Проверьте интернет и обновите страницу.' }), h('button', { class: 'btn-acc', type: 'button', text: 'Обновить', onclick: () => location.reload() }))); console.warn(e); }
  }
  async function init() {
    if (!C.configured) {
      root.replaceChildren(h('div', { class: 'acc-card auth-closed', style: { maxWidth: '560px', margin: '40px auto' } }, h('img', { src: 'assets/lexi-head.webp', alt: '', width: 140, height: 140 }), h('h1', { text: 'Кабинеты скоро откроются', style: { fontSize: '24px', margin: '6px 0 10px' } }), h('p', { class: 'acc-muted', text: 'Облачные аккаунты ещё не подключены. Все игры доступны без регистрации.' }), h('a', { class: 'btn-acc lime', href: 'index.html', text: 'К играм' })));
      return;
    }
    try { sb = await C.client(); } catch (e) { root.replaceChildren(h('p', { class: 'acc-msg err', text: C.authMessage(e) })); return; }
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { Hint.clear(); location.replace('auth.html?next=me.html'); return; }
    me = session.user;
    const { data: p, error } = await sb.from('profiles').select('*').eq('id', me.id).maybeSingle();
    if (error || !p) { root.replaceChildren(h('p', { class: 'acc-msg err', text: 'Профиль не найден. Попробуйте выйти и войти снова.' }), h('button', { class: 'btn-acc', type: 'button', text: 'Выйти', onclick: logout })); return; }
    profile = p;
    if (Hint.uid() !== me.id || Hint.name() !== p.display_name) Hint.set({ uid: me.id, name: p.display_name, role: p.role });
    const lo = document.getElementById('logoutBtn'); lo.hidden = false; lo.addEventListener('click', logout);
    document.title = (p.role === 'teacher' ? 'Кабинет учителя' : 'Мой кабинет') + ' — LEXI';
    sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT' && !leaving) { leaving = true; Hint.clear(); location.replace('index.html'); } });
    await boot();
  }
  init();
})();
