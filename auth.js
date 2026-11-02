/* LEXI — вход, регистрация, восстановление пароля (Supabase Auth, 2026-11-02).
 * Пароли не проходят через наш код дальше вызова Supabase Auth и нигде не сохраняются. */
(() => {
  'use strict';
  const C = window.LexigoCloud, Hint = window.LexigoAccountHint, { h } = C;
  const box = document.getElementById('authBox');
  const params = new URLSearchParams(location.search);
  const base = location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
  const joinParam = (params.get('join') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  if (joinParam.length === 8) try { sessionStorage.setItem('lexigo_join', joinParam); } catch { /* private mode */ }
  const pendingJoin = () => { try { return sessionStorage.getItem('lexigo_join') || ''; } catch { return ''; } };
  const safeNext = () => { const n = params.get('next') || ''; return /^(index\.html|me\.html)(\?[A-Za-z0-9=&_-]{0,120})?(#\/[A-Za-z0-9\/_-]{1,120})?$/.test(n) ? n : 'me.html'; };
  let sb = null, mode = location.hash === '#signup' || pendingJoin() ? 'signup' : 'login';

  function msgBox() { return h('p', { class: 'acc-msg', role: 'status' }); }
  function setMsg(el, text, kind = 'err') { el.className = 'acc-msg ' + kind; el.textContent = text; if (text) el.scrollIntoView({ block: 'nearest' }); }
  function pwField(id, label, autocomplete, hint) {
    const input = h('input', { id, type: 'password', required: true, minlength: 8, maxlength: 72, autocomplete });
    const toggle = h('button', { type: 'button', text: 'Показать', 'aria-controls': id, onclick: () => { const on = input.type === 'password'; input.type = on ? 'text' : 'password'; toggle.textContent = on ? 'Скрыть' : 'Показать'; } });
    return h('label', { class: 'acc-field', for: id }, h('span', { text: label }), h('div', { class: 'pw-wrap' }, input, toggle), hint ? h('small', { text: hint }) : null);
  }
  function busy(btn, on, text) { btn.disabled = on; if (text) btn.textContent = text; }

  /* ---------- not configured yet: honest, friendly notice ---------- */
  function closed() {
    box.replaceChildren(h('div', { class: 'auth-closed' },
      h('img', { src: 'assets/lexi-head.webp', alt: '', width: 150, height: 150 }),
      h('h2', { text: 'Аккаунты скоро откроются', style: { fontSize: '22px', marginBottom: '10px' } }),
      h('p', { class: 'acc-muted', text: 'Мы готовим личные кабинеты для учеников и учителей. А пока все игры доступны без регистрации — прогресс сохраняется на этом устройстве.' }),
      h('a', { class: 'btn-acc lime', href: 'index.html', text: 'Играть без аккаунта', style: { marginTop: '14px' } })));
  }

  /* ---------- tabs ---------- */
  function render() {
    const tabs = h('div', { class: 'auth-tabs', role: 'tablist', 'aria-label': 'Вход или регистрация' },
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(mode === 'login'), onclick: () => { mode = 'login'; render(); } }, 'Вход'),
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(mode === 'signup'), onclick: () => { mode = 'signup'; render(); } }, 'Регистрация'));
    box.replaceChildren(tabs, mode === 'login' ? loginForm() : mode === 'signup' ? signupForm() : resetForm());
    if (mode === 'reset') tabs.remove();
  }

  function loginForm() {
    const msg = msgBox(), btn = h('button', { class: 'btn-acc', type: 'submit', style: { width: '100%' }, text: 'Войти' });
    const form = h('form', { novalidate: true },
      pendingJoin() ? h('p', { class: 'acc-msg info', text: 'Учитель пригласил тебя в класс. Войди или зарегистрируйся — и ты сразу окажешься в группе.' }) : null,
      msg,
      h('label', { class: 'acc-field', for: 'loginEmail' }, h('span', { text: 'Электронная почта' }), h('input', { id: 'loginEmail', type: 'email', required: true, autocomplete: 'email', inputmode: 'email', maxlength: 254 })),
      pwField('loginPassword', 'Пароль', 'current-password'),
      btn,
      h('p', { class: 'auth-foot' }, h('button', { type: 'button', class: 'btn-link', text: 'Забыли пароль?', onclick: () => { mode = 'reset'; render(); } })));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const email = form.querySelector('#loginEmail').value.trim(), password = form.querySelector('#loginPassword').value;
      if (!email || !password) return setMsg(msg, 'Введи почту и пароль.');
      busy(btn, true, 'Входим…');
      try {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await finish(data.session);
      } catch (err) { setMsg(msg, C.authMessage(err)); busy(btn, false, 'Войти'); }
    });
    return form;
  }

  function signupForm() {
    const msg = msgBox(), btn = h('button', { class: 'btn-acc lime', type: 'submit', style: { width: '100%' }, text: 'Создать аккаунт' });
    const consentStudent = h('label', { class: 'acc-check' }, h('input', { type: 'checkbox', id: 'consentAge' }),
      h('span', null, 'Мне уже исполнилось 14 лет, или мой родитель (законный представитель) знает о регистрации и согласен.'));
    const consentPolicy = h('label', { class: 'acc-check' }, h('input', { type: 'checkbox', id: 'consentPolicy' }),
      h('span', null, 'Даю ', h('a', { href: 'consent.html', target: '_blank', rel: 'noopener', text: 'согласие на обработку персональных данных' }), ' (имя, почта, учебные результаты). Подробнее — в ', h('a', { href: 'privacy.html', target: '_blank', rel: 'noopener', text: 'политике конфиденциальности' }), '.'));
    const roleBox = h('fieldset', { class: 'role-pick' }, h('legend', { text: 'Кто ты?' }),
      h('label', null, h('input', { type: 'radio', name: 'role', value: 'student', checked: true }), h('span', { class: 'ico', 'aria-hidden': 'true', text: '🎒' }), h('b', { text: 'Ученик' }), h('small', { text: 'играю и учу слова' })),
      h('label', null, h('input', { type: 'radio', name: 'role', value: 'teacher', disabled: !!pendingJoin() }), h('span', { class: 'ico', 'aria-hidden': 'true', text: '🧑‍🏫' }), h('b', { text: 'Учитель' }), h('small', { text: 'создаю классы и задания' })));
    const nameHint = h('small', { text: 'Можно только имя или псевдоним. Фамилию указывать не нужно.' });
    const form = h('form', { novalidate: true },
      pendingJoin() ? h('p', { class: 'acc-msg info', text: 'Тебя пригласили в класс (код ' + pendingJoin() + '). После регистрации ты сразу окажешься в группе.' }) : null,
      msg, roleBox,
      h('label', { class: 'acc-field', for: 'suName' }, h('span', { text: 'Как тебя называть?' }), h('input', { id: 'suName', type: 'text', required: true, maxlength: 40, autocomplete: 'nickname' }), nameHint),
      h('label', { class: 'acc-field', for: 'suEmail' }, h('span', { text: 'Электронная почта' }), h('input', { id: 'suEmail', type: 'email', required: true, autocomplete: 'email', inputmode: 'email', maxlength: 254 }), h('small', { text: 'Нужна для входа и восстановления пароля. Мы не рассылаем рекламу.' })),
      pwField('suPassword', 'Пароль', 'new-password', 'Минимум 8 символов. Не используй пароль от других сайтов.'),
      consentStudent, consentPolicy, btn);
    const syncRole = () => { const teacher = form.querySelector('input[name=role]:checked').value === 'teacher'; consentStudent.hidden = teacher; nameHint.textContent = teacher ? 'Так вас увидят ученики, например «Виктория Геннадьевна».' : 'Можно только имя или псевдоним. Фамилию указывать не нужно.'; };
    roleBox.addEventListener('change', syncRole);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const role = form.querySelector('input[name=role]:checked').value;
      const name = form.querySelector('#suName').value.trim().replace(/\s+/g, ' ');
      const email = form.querySelector('#suEmail').value.trim(), password = form.querySelector('#suPassword').value;
      if (!name) return setMsg(msg, 'Напиши, как тебя называть.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setMsg(msg, 'Проверь адрес электронной почты.');
      if (password.length < 8) return setMsg(msg, 'Пароль должен быть не короче 8 символов.');
      if (role === 'student' && !form.querySelector('#consentAge').checked) return setMsg(msg, 'Попроси родителя помочь с регистрацией и отметь галочку о согласии.');
      if (!form.querySelector('#consentPolicy').checked) return setMsg(msg, 'Без согласия на обработку данных аккаунт создать нельзя. Играть можно и без аккаунта.');
      busy(btn, true, 'Создаём аккаунт…');
      try {
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { role, display_name: name }, emailRedirectTo: base + 'auth.html' + (pendingJoin() ? '?join=' + pendingJoin() : '') } });
        if (error) throw error;
        if (data.session) return finish(data.session);
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new Error('already registered');
        box.replaceChildren(h('div', { class: 'auth-closed' },
          h('img', { src: 'assets/lexi-head.webp', alt: '', width: 120, height: 120 }),
          h('h2', { text: 'Проверь почту!', style: { fontSize: '22px', marginBottom: '8px' } }),
          h('p', { class: 'acc-muted' }, 'Мы отправили письмо на ', h('b', { text: email }), '. Открой его и нажми ссылку — аккаунт активируется, и ты сразу попадёшь в кабинет.'),
          h('p', { class: 'acc-muted acc-small', text: 'Письма нет? Загляни в «Спам» или «Промоакции». Ссылка действует 24 часа.' }),
          h('button', { type: 'button', class: 'btn-link', text: 'Ко входу', onclick: () => { mode = 'login'; render(); } })));
      } catch (err) { setMsg(msg, C.authMessage(err)); busy(btn, false, 'Создать аккаунт'); }
    });
    queueMicrotask(syncRole);
    return form;
  }

  function resetForm() {
    const msg = msgBox(), btn = h('button', { class: 'btn-acc', type: 'submit', style: { width: '100%' }, text: 'Прислать ссылку' });
    const form = h('form', { novalidate: true },
      h('h2', { text: 'Восстановление пароля', style: { fontSize: '20px', marginBottom: '8px' } }),
      h('p', { class: 'acc-muted acc-small', text: 'Укажи почту аккаунта — пришлём ссылку для нового пароля.' }), msg,
      h('label', { class: 'acc-field', for: 'resetEmail' }, h('span', { text: 'Электронная почта' }), h('input', { id: 'resetEmail', type: 'email', required: true, autocomplete: 'email' })),
      btn, h('p', { class: 'auth-foot' }, h('button', { type: 'button', class: 'btn-link', text: '← Ко входу', onclick: () => { mode = 'login'; render(); } })));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const email = form.querySelector('#resetEmail').value.trim();
      if (!email) return setMsg(msg, 'Укажи почту.');
      busy(btn, true, 'Отправляем…');
      try {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: base + 'auth.html?recovery=1' });
        if (error) throw error;
        setMsg(msg, 'Если такой аккаунт есть, письмо уже в пути. Проверь почту (и папку «Спам»).', 'ok'); busy(btn, false, 'Отправить ещё раз');
      } catch (err) { setMsg(msg, C.authMessage(err)); busy(btn, false, 'Прислать ссылку'); }
    });
    return form;
  }

  function newPasswordForm() {
    const msg = msgBox(), btn = h('button', { class: 'btn-acc lime', type: 'submit', style: { width: '100%' }, text: 'Сохранить пароль' });
    const form = h('form', { novalidate: true }, h('h2', { text: 'Новый пароль', style: { fontSize: '20px', marginBottom: '12px' } }), msg,
      pwField('newPassword', 'Придумай новый пароль', 'new-password', 'Минимум 8 символов.'), btn);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const password = form.querySelector('#newPassword').value;
      if (password.length < 8) return setMsg(msg, 'Пароль должен быть не короче 8 символов.');
      busy(btn, true, 'Сохраняем…');
      try { const { error } = await sb.auth.updateUser({ password }); if (error) throw error;
        setMsg(msg, 'Пароль изменён! Переходим в кабинет…', 'ok');
        const { data } = await sb.auth.getSession(); setTimeout(() => finish(data.session), 900);
      } catch (err) { setMsg(msg, C.authMessage(err)); busy(btn, false, 'Сохранить пароль'); }
    });
    box.replaceChildren(form);
  }

  /* ---------- after sign-in ---------- */
  async function finish(session) {
    if (!session) { mode = 'login'; return render(); }
    const uid = session.user.id;
    let profile = null;
    for (let i = 0; i < 4 && !profile; i++) { const { data } = await sb.from('profiles').select('display_name,role').eq('id', uid).maybeSingle(); profile = data; if (!profile) await new Promise(r => setTimeout(r, 400)); }
    Hint.set({ uid, name: profile ? profile.display_name : '', role: profile ? profile.role : 'student' });
    const code = pendingJoin();
    if (code && profile && profile.role === 'student') {
      try { const { data } = await sb.rpc('join_group', { p_code: code }); sessionStorage.removeItem('lexigo_join'); if (data && data.ok) sessionStorage.setItem('lexigo_joined', data.name); } catch { /* shown in the cabinet */ }
    }
    location.replace(safeNext());
  }

  async function init() {
    if (!C.configured) return closed();
    const hash = new URLSearchParams(location.hash.slice(1));
    try { sb = await C.client({ detectSessionInUrl: true }); }
    catch (err) { box.replaceChildren(h('p', { class: 'acc-msg err', text: C.authMessage(err) })); return; }
    let recovering = params.get('recovery') === '1' || hash.get('type') === 'recovery';
    sb.auth.onAuthStateChange(event => { if (event === 'PASSWORD_RECOVERY') { recovering = true; newPasswordForm(); } });
    if (hash.get('error_code') || hash.get('error')) {
      render();
      const m = box.querySelector('.acc-msg[role=status]');
      if (m) setMsg(m, hash.get('error_code') === 'otp_expired' ? 'Ссылка из письма устарела или уже использована. Войди или запроси новую.' : 'Не получилось открыть ссылку из письма. Попробуй войти.');
      history.replaceState(null, '', location.pathname + location.search);
      return;
    }
    const { data: { session } } = await sb.auth.getSession();
    if (recovering && session) return newPasswordForm();
    if (session) return finish(session);
    render();
  }
  init();
})();
