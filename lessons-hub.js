/* LEXI · раздел «Уроки» (#/lessons, 2026-11-04) — по кнопке «Уроки» в шапке.
 * Раньше кнопка вела на главную и на главной ничего не происходило. Теперь это один раздел со всеми уроками:
 *   ученик  — «От учителя» (нужно пройти / пройдены), начатые уроки учебника, учебники;
 *   учитель — «Мои уроки» (открыть, изменить, ссылка для учеников, ＋ создать), учебники;
 *   гость   — начатые уроки и учебники; уроки от учителя — после входа.
 * Данные: уроки от учителя — сервер (RLS: ученик видит только задания своих групп, учитель — свои уроки);
 * начатые уроки — прогресс этого устройства (у вошедшего — свой для аккаунта, с облачным прогрессом). */
(() => {
  'use strict';
  const C = window.LexigoCloud, host = document.getElementById('lessonsPage');
  if (!C || !host) return;
  const { h } = C;
  const S = () => window.LexigoCloudSession;
  const words = n => C.ruN(n, 'слово', 'слова', 'слов');
  const prog = id => (typeof progress !== 'undefined' && progress) ? progress[id] : null;
  const learned = p => !!p && (Number(p.recall) || 0) >= 2 && (Number(p.streak) || 0) >= 2;
  let stamp = 0;

  function startedLessons() {
    const out = [];
    for (const b of DB.books) b.sections.forEach((s, i) => {
      if (!s.words.length) return;
      let last = 0, done = 0, touched = 0;
      for (const w of s.words) { const p = prog(w.id); if (!p) continue; touched++; last = Math.max(last, Number(p.last) || 0); if (learned(p)) done++; }
      if (touched) out.push({ grade: b.grade, index: i, title: s.title, module: s.module, total: s.words.length, done, last });
    });
    return out.sort((a, b) => b.last - a.last).slice(0, 6);
  }
  function section(title, extra, ...kids) {
    return h('section', { class: 'hub-sec' }, h('div', { class: 'hub-sec-head' }, h('h2', { text: title }), extra || null), ...kids);
  }
  function startedBlock() {
    const list = startedLessons();
    if (!list.length) return null;
    return section('Начатые уроки учебника', null, h('div', { class: 'hub-grid' }, list.map(x => h('a', { class: 'hub-card', href: '#/lesson/' + x.grade + '/' + x.index },
      h('span', { class: 'hub-kicker', text: x.grade + ' класс · ' + x.module }), h('b', { text: x.title }),
      h('span', { class: 'hub-meter', style: '--p:' + Math.round(x.done / x.total * 100) + '%', role: 'img', 'aria-label': 'выучено ' + x.done + ' из ' + x.total }),
      h('small', { text: 'выучено ' + x.done + ' из ' + words(x.total) })))));
  }
  function booksBlock() {
    const mine = window.LexiPersonal ? window.LexiPersonal.myClass() : null;
    return section('Учебники', null, h('div', { class: 'hub-books' }, DB.books.map(b => h('a', { class: 'hub-book' + (b.grade === mine ? ' mine' : ''), href: '#/course/' + b.grade + '/0', 'aria-label': b.grade + ' класс' + (b.grade === mine ? ', мой класс' : '') },
      h('b', { text: String(b.grade) }), h('span', { text: b.grade === mine ? 'мой класс' : 'класс' })))));
  }
  async function teacherBlock(session) {
    const { data, error } = await session.sb.from('custom_lessons').select('id,title,words,share_token,updated_at').eq('owner_id', session.user.id).order('updated_at', { ascending: false });
    if (error) throw error;
    const create = h('a', { class: 'btn good hub-create', href: 'me.html?new=1', text: '＋ Создать урок' });
    if (!data.length) return section('Мои уроки', create, h('p', { class: 'hub-empty', text: 'Здесь появятся ваши уроки. Добавьте свои слова — Лекси сделает из них игры, а ссылкой можно поделиться с учениками.' }));
    return section('Мои уроки', create, h('div', { class: 'hub-list' }, data.map(l => {
      const row = h('article', { class: 'hub-row' });
      const shareHost = h('div', { class: 'hub-share', hidden: true });
      row.append(h('div', { class: 'hub-row-main' }, h('b', { text: l.title }), h('small', { text: words((l.words || []).length) + ' · изменён ' + C.fmtDate(l.updated_at) + (l.share_token ? ' · 🔗 доступ по ссылке' : '') })),
        h('div', { class: 'hub-row-actions' },
          h('a', { class: 'btn secondary', href: '#/my/t-' + l.id, text: 'Открыть' }),
          h('a', { class: 'btn secondary', href: 'me.html?edit=' + l.id, text: 'Изменить' }),
          h('button', { type: 'button', class: 'btn secondary', 'aria-expanded': 'false', text: '🔗 Ссылка', onclick: e => {
            const open = shareHost.hidden; shareHost.hidden = !open; e.currentTarget.setAttribute('aria-expanded', String(open));
            if (open && !shareHost.firstChild) shareHost.append(C.sharePanel(session.sb, l, { onChange: t => { l.share_token = t; } }));
          } })), shareHost);
      return row;
    })), h('p', { class: 'hub-note', text: 'Назначить урок классу и посмотреть результаты — в кабинете: «Задания».' }), h('a', { class: 'text-button', href: 'me.html?tab=tasks', text: 'Открыть задания →' }));
  }
  async function studentBlock(session) {
    const items = await C.loadStudentLessons(session.sb, session.user.id, id => C.knownLocal(prog(id)));
    if (!items.length) return section('От учителя', null, h('p', { class: 'hub-empty', text: 'Пока уроков от учителя нет. Попроси у учителя код класса и введи его в кабинете — новые уроки появятся здесь.' }));
    const open = items.filter(x => x.st.state !== 'done'), done = items.filter(x => x.st.state === 'done');
    return section('От учителя', h('span', { class: 'hub-count', text: open.length ? 'нужно пройти: ' + open.length : 'все пройдены ✓' }),
      open.length ? h('div', { class: 'tl-grid' }, open.map(x => C.lessonCard(x))) : null,
      done.length ? h('details', { class: 'hub-done' }, h('summary', { text: 'Пройденные уроки · ' + done.length }), h('div', { class: 'tl-grid' }, done.map(x => C.lessonCard(x)))) : null);
  }
  async function render() {
    const my = ++stamp;
    const session = S() ? await S().ready : null;
    if (my !== stamp) return;
    const role = session && session.profile ? session.profile.role : null;
    const head = h('div', { class: 'page-heading hub-head' }, h('p', { class: 'eyebrow', text: role === 'teacher' ? 'ДЛЯ УЧИТЕЛЯ' : 'ВСЕ УРОКИ' }), h('h1', { id: 'lessonsTitle', tabindex: '-1', text: 'Уроки' }),
      h('p', { text: role === 'teacher' ? 'Ваши уроки, ссылки для учеников и учебники 2–10 классов.' : role === 'student' ? 'Уроки от учителя, начатые уроки и учебники.' : 'Начатые уроки и учебники 2–9 классов.' }));
    const loading = h('p', { class: 'hub-loading', role: 'status', text: 'Лекси собирает уроки…' });
    host.replaceChildren(head, loading);
    const blocks = [];
    try {
      if (role === 'teacher') blocks.push(await teacherBlock(session));
      else if (role === 'student') blocks.push(await studentBlock(session));
    } catch (e) {
      console.warn('LEXI lessons hub', e);
      blocks.push(section(role === 'teacher' ? 'Мои уроки' : 'От учителя', null, h('p', { class: 'hub-empty', text: 'Не получилось загрузить уроки — нет связи с сервером. Уроки учебника доступны и сейчас.' }), h('button', { type: 'button', class: 'btn secondary', text: 'Попробовать ещё раз', onclick: render })));
    }
    if (my !== stamp) return;
    if (!role) blocks.push(h('p', { class: 'hub-note hub-guest' }, 'Уроки от учителя появятся здесь после входа в аккаунт. ', h('a', { href: 'auth.html?next=' + encodeURIComponent('index.html#/lessons'), text: 'Войти' })));
    if (role !== 'teacher') blocks.push(startedBlock());
    blocks.push(booksBlock());
    loading.remove(); host.append(...blocks.filter(Boolean));
  }
  window.LexigoLessonsHub = Object.freeze({ render });
  if (document.body.dataset.page === 'lessons') render();
})();
