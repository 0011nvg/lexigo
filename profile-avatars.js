(() => {
'use strict';
const presets = {
  'lexi-hello': ['Весёлый Лекси', 'assets/avatar-lexi-hello-v2.webp'],
  'lexi-wave': ['Лекси-исследователь', 'assets/avatar-lexi-explorer-v2.webp'],
  'lexi-hero': ['Лекси-космонавт', 'assets/avatar-lexi-space-v2.webp'],
  'lexi-travel5': ['Лекси-художник', 'assets/avatar-lexi-artist-v2.webp'],
  'lexi-travel6': ['Сонный Лекси', 'assets/avatar-lexi-sleepy-v2.webp'],
  'lexi-travel7': ['Лекси-меломан', 'assets/avatar-lexi-music-v2.webp']
};
function content(id, fallback) {
  const preset = presets[id] || (id === 'custom' ? presets['lexi-hello'] : null);
  if (!preset) return document.createTextNode(fallback || '🐱');
  const img = document.createElement('img'); img.src = preset[1]; img.alt = ''; img.className = 'profile-avatar-image';
  Object.assign(img.style, {display:'block',width:'100%',height:'100%',objectFit:'cover',borderRadius:'inherit'});
  return img;
}
window.LexiProfileAvatars = Object.freeze({ presets, content });
})();