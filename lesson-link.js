/* LEXI · «Поделиться уроком» для любого урока и модуля учебников 2–10 (2026-11-05).
 *
 * Ссылка: https://…/lexigo/#/l/<класс>/<id первого слова урока>   — урок
 *         https://…/lexigo/#/l/<класс>/m-<id первого слова модуля> — все слова модуля
 * Маршрут разбирает navigation-controller.js (stableTarget). Id слов постоянные, поэтому ссылка ведёт в тот же урок
 * после обновлений платформы, после перезагрузки страницы и в новом браузере; вход для стандартных уроков не нужен.
 * Уроки учителя по-прежнему делятся своей ссылкой #/s/<токен> с правами доступа на сервере (cloud-core.js → sharePanel).
 *
 * Где кнопка: в шапке урока рядом с «Сменить урок» и у названия модуля на странице учебника — учитель
 * открывает модуль и нажимает «Поделиться»: ссылка уже в буфере обмена (два действия). В открывшемся окошке —
 * «Отправить…» (системное меню телефона), Telegram, WhatsApp, ВКонтакте и поле со ссылкой.
 *
 * Гость, открывший урок по ссылке, видит подсказку «Войти, чтобы результаты сохранились в профиле»; после входа
 * auth.html возвращает его в этот же урок (параметр next). Результаты вошедшего ученика сохраняет cloud.js. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = String(text); return n; };
  const Nav = () => window.LexigoNav;
  const modulesOf = b => [...new Set(b.sections.map(s => s.module))];
  const ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13.5a4.5 4.5 0 0 0 6.4.4l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2"/><path d="M14 10.5a4.5 4.5 0 0 0-6.4-.4l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/></svg>';

  function siteBase() { return location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, ''); }
  function urlFor(path) { return path ? siteBase() + '#' + path : ''; }
  async function copyText(text) {
    if (window.LexigoCloud && window.LexigoCloud.copyText) { try { return await window.LexigoCloud.copyText(text); } catch { /* fall through */ } }
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch { /* fall back */ }
    try { const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'; document.body.append(t); t.select(); t.setSelectionRange(0, text.length); const ok = document.execCommand('copy'); t.remove(); return !!ok; } catch { return false; }
  }

  /* ---------- что сейчас открыто ---------- */
  function lessonTarget() {
    const N = Nav(); if (!N || !N.stablePath) return null;
    const path = N.stablePath(); if (!path) return null;
    return { path, url: urlFor(path), title: 'LEXI · ' + N.lessonLabel(), kind: path.includes('/m-') ? 'модуль' : 'урок' };
  }
  function courseTarget() {
    const m = location.hash.match(/^#\/course\/(\d+)(?:\/(\d+))?/); if (!m) return null;
    const b = DB.books.find(x => String(x.grade) === m[1]); if (!b) return null;
    const ms = modulesOf(b), name = ms[Number(m[2] || 0)] != null ? ms[Number(m[2] || 0)] : ms[0];
    const s = b.sections.find(x => x.module === name && x.words.length); if (!s) return null;
    const path = '/l/' + b.grade + '/m-' + s.words[0].id;
    return { path, url: urlFor(path), title: 'LEXI · ' + b.grade + ' класс · ' + name, kind: 'модуль' };
  }

  /* ---------- окошко «Ссылка скопирована» ---------- */
  let pop = null, popFor = null;
  function closePop() { if (!pop) return; pop.remove(); pop = null; if (popFor) { popFor.setAttribute('aria-expanded', 'false'); popFor = null; } document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', onKey, true); }
  function outside(e) { if (pop && !pop.contains(e.target) && !(popFor && popFor.contains(e.target))) closePop(); }
  function onKey(e) { if (e.key === 'Escape') { const b = popFor; closePop(); b && b.focus(); } }
  async function open(button, target) {
    if (pop && popFor === button) { closePop(); return; }
    closePop();
    if (!target) return;
    const copied = await copyText(target.url);
    pop = el('div', 'lx-share-pop'); pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Ссылка на ' + target.kind);
    const status = el('p', 'lx-share-status' + (copied ? ' ok' : ''), copied ? '✓ Ссылка скопирована — вставьте её в сообщение' : 'Скопируйте ссылку из поля');
    status.setAttribute('role', 'status');
    const field = el('input', 'lx-share-url'); field.type = 'text'; field.readOnly = true; field.value = target.url; field.setAttribute('aria-label', 'Ссылка на ' + target.kind);
    field.onfocus = () => field.select();
    const send = el('div', 'lx-share-send');
    const msg = target.title + '\n' + target.url, enc = encodeURIComponent;
    if (navigator.share) {
      const b = el('button', 'lx-share-native', 'Отправить…'); b.type = 'button';
      b.onclick = () => navigator.share({ title: target.title, text: target.title, url: target.url }).catch(() => {});
      send.append(b);
    }
    for (const [name, href] of [
      ['Telegram', 'https://t.me/share/url?url=' + enc(target.url) + '&text=' + enc(target.title)],
      ['WhatsApp', 'https://wa.me/?text=' + enc(msg)],
      ['ВКонтакте', 'https://vk.com/share.php?url=' + enc(target.url) + '&title=' + enc(target.title)]
    ]) { const a = el('a', 'lx-share-app', name); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; send.append(a); }
    const note = el('p', 'lx-share-note', 'Ссылка откроет этот ' + target.kind + ' на телефоне и компьютере, даже без входа. Вошедший ученик сохранит результаты в своём профиле.');
    pop.append(status, field, send, note);
    document.body.append(pop); place(button); popFor = button; button.setAttribute('aria-expanded', 'true');
    if (!copied) { field.focus(); field.select(); }
    document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', onKey, true);
  }
  /* окошко живёт в body (карточка урока обрезает содержимое) и стоит под кнопкой; на телефоне — снизу над меню (CSS) */
  function place(button) {
    if (!pop) return;
    const r = button.getBoundingClientRect(), w = Math.min(360, innerWidth - 32);
    const left = Math.max(16, Math.min(r.right - w, innerWidth - w - 16));
    pop.style.top = (r.bottom + scrollY + 8) + 'px'; pop.style.left = (left + scrollX) + 'px';
  }
  window.addEventListener('resize', () => { if (pop && popFor) place(popFor); });
  function shareButton(id, getTarget, label) {
    let b = $(id);
    if (!b) {
      b = el('button', 'lx-share-btn'); b.id = id; b.type = 'button'; b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-expanded', 'false');
      b.innerHTML = ICON; b.append(el('span', 'lx-share-txt', 'Поделиться'));
      b.onclick = () => open(b, getTarget());
    }
    b.title = label; b.setAttribute('aria-label', label);
    return b;
  }

  /* ---------- размещение ---------- */
  function placeLesson() {
    const head = $('lessonHeading'), change = $('changeLesson'); if (!head || !change) return;
    let wrap = head.querySelector('.lesson-head-actions');
    if (!wrap) { wrap = el('div', 'lesson-head-actions'); change.before(wrap); wrap.append(change); }
    const t = lessonTarget();
    const b = shareButton('lessonShare', lessonTarget, t && t.kind === 'модуль' ? 'Поделиться ссылкой на модуль' : 'Поделиться ссылкой на урок');
    if (b.parentNode !== wrap) wrap.append(b);
    b.hidden = !t;
  }
  function placeCourse() {
    const title = $('moduleTitle'); if (!title || !title.textContent) return;
    let row = title.parentNode.classList.contains('module-title-row') ? title.parentNode : null;
    if (!row) { row = el('div', 'module-title-row'); title.before(row); row.append(title); }
    const b = shareButton('moduleShare', courseTarget, 'Поделиться ссылкой на модуль');
    if (b.parentNode !== row) row.append(b);
    const fav = $('favToggle'); if (fav && fav.parentNode !== row) row.insertBefore(fav, b);
  }

  /* ---------- гость пришёл по ссылке: как сохранить результаты ---------- */
  const cloudOn = () => !!(window.LexigoCloud && window.LexigoCloud.configured);
  const signedIn = () => !!(window.LexigoAccountHint && window.LexigoAccountHint.uid());
  function viaLink() { try { return sessionStorage.getItem('lexigo_via_link') || ''; } catch { return ''; } }
  function guestNote() {
    const old = $('linkGuestNote');
    const via = viaLink(), page = document.body.dataset.page;
    if (!via || page !== 'lesson' || !cloudOn() || signedIn()) { old && old.remove(); return; }
    if (old) return;
    let dismissed = false; try { dismissed = sessionStorage.getItem('lexigo_via_link_ok') === via; } catch { /* ignore */ }
    if (dismissed) return;
    const n = el('div', 'link-guest-note'); n.id = 'linkGuestNote'; n.setAttribute('role', 'note');
    const a = el('a', 'btn small', 'Войти'); a.href = 'auth.html?next=' + encodeURIComponent('index.html#' + via);
    const x = el('button', 'link-guest-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Скрыть подсказку');
    x.onclick = () => { try { sessionStorage.setItem('lexigo_via_link_ok', via); } catch { /* ignore */ } n.remove(); };
    n.append(el('span', null, 'Урок открыт по ссылке. Заниматься можно сразу, а чтобы результаты сохранились в твоём профиле — войди в аккаунт.'), a, x);
    $('lessonHeading')?.after(n);
  }
  /* «Войти» в шапке возвращает туда, где был ученик (урок, модуль), а не в кабинет */
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a.acct-btn.guest'); if (!a) return;
    const route = (document.body.dataset.page === 'lesson' || document.body.dataset.page === 'play') && Nav() && Nav().stablePath ? Nav().stablePath() : location.hash.slice(1);
    if (route && /^\/[A-Za-z0-9/_-]{1,118}$/.test(route)) a.href = 'auth.html?next=' + encodeURIComponent('index.html#' + route);
  }, true);

  function refresh() { try { placeLesson(); placeCourse(); guestNote(); if (pop && popFor && !popFor.isConnected) closePop(); } catch (e) { console.warn('LEXI share', e); } }
  const watch = new MutationObserver(() => { clearTimeout(watch.t); watch.t = setTimeout(refresh, 30); });
  for (const id of ['currentLesson', 'currentLessonDetail', 'moduleTitle']) { const n = $(id); if (n) watch.observe(n, { childList: true, characterData: true, subtree: true }); }
  watch.observe(document.body, { attributes: true, attributeFilter: ['data-page'] });
  window.addEventListener('lexigo:account', refresh);
  window.addEventListener('hashchange', () => setTimeout(refresh, 30));
  refresh();
  window.LexiLessonLink = Object.freeze({ lessonTarget, courseTarget, urlFor, refresh });
})();
