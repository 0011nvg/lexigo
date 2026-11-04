(() => {
'use strict';
const presets = {
  'lexi-hello': ['Лекси приветствует', 'assets/lexi-head.webp'],
  'lexi-wave': ['Лекси машет', 'assets/lexi-wave.webp'],
  'lexi-hero': ['Лекси и приключения', 'assets/lexi-hero.webp'],
  'lexi-travel5': ['Лекси путешествует', 'assets/lexi-travel-5-v2.webp'],
  'lexi-travel6': ['Лекси исследует', 'assets/lexi-travel-6-v2.webp'],
  'lexi-travel7': ['Лекси открывает мир', 'assets/lexi-travel-7-v2.webp']
};
const key = 'lexigo_profile_photo_v1';
function photo() { try { return localStorage.getItem(key) || ''; } catch { return ''; } }
function image(id, override) {
  const src = id === 'custom' ? (override || photo()) : presets[id]?.[1];
  if (!src) return null;
  const img = document.createElement('img'); img.src = src; img.alt = ''; img.className = 'profile-avatar-image'; Object.assign(img.style, {display:'block',width:'100%',height:'100%',objectFit:'cover',borderRadius:'inherit'}); return img;
}
function content(id, fallback, override) { return image(id, override) || document.createTextNode(fallback || '🐱'); }
function savePhoto(data) { try { localStorage.setItem(key, data); return true; } catch { return false; } }
function thumbnail(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 8 * 1024 * 1024) return reject(new Error('Выбери JPG, PNG или WebP до 8 МБ.'));
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { try { const c = document.createElement('canvas'); c.width = c.height = 240; const ctx = c.getContext('2d'); const side = Math.min(img.naturalWidth, img.naturalHeight); ctx.drawImage(img, (img.naturalWidth-side)/2, (img.naturalHeight-side)/2, side, side, 0, 0, 240, 240); resolve(c.toDataURL('image/jpeg', .82)); } catch(e) { reject(e); } finally { URL.revokeObjectURL(url); } };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось открыть изображение.')); }; img.src = url;
  });
}
window.LexiProfileAvatars = Object.freeze({ presets, content, savePhoto, thumbnail });
})();