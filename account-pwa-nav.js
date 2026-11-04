(() => {
  const mobile = matchMedia('(pointer: coarse) and (max-width: 1024px)');
  const standalone = matchMedia('(display-mode: standalone)');
  if (!(mobile.matches && (standalone.matches || navigator.standalone === true))) return;
  document.body.classList.add('account-pwa-mobile');
  const paths = {home:'M3.5 10.5 12 3.7l8.5 6.8v9h-5v-6h-5v6h-5z',games:'M7 8h10l3 3 1 6-3 2-3-3H9l-3 3-3-2 1-6zM7 10v4M5 12h4M16 11h.01M18 13h.01',awards:'M8 4h8v4a4 4 0 0 1-8 0zM8 6H5v2a3 3 0 0 0 3 3M16 6h3v2a3 3 0 0 1-3 3M12 12v5M8 20h8',profile:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-5 3-7 8-7s8 2 8 7'};
  const nav = document.createElement('nav'); nav.className='account-pwa-nav'; nav.setAttribute('aria-label','Разделы LEXI');
  for (const [key,label] of Object.entries({home:'Главная',games:'Игры',awards:'Награды',profile:'Профиль'})) {
    const a=document.createElement('a'); a.href='index.html#/'+key;
    a.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+paths[key]+'"/></svg><span>'+label+'</span>';
    if(key==='profile') a.setAttribute('aria-current','page'); nav.append(a);
  }
  document.body.append(nav);
})();
