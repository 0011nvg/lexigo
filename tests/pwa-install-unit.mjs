import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../pwa-install.js', import.meta.url), 'utf8');

function scenario({ ua = '', standalone = false, stored = {} } = {}) {
  const events = {}, memory = new Map(Object.entries(stored));
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.attrs = {}; this.hidden = false; }
    set innerHTML(_) { this.open = new Element('button'); this.close = new Element('button'); this.guide = new Element('div'); this.guide.hidden = true; }
    setAttribute(k,v) { this.attrs[k] = v; }
    append(...items) { this.children.push(...items); }
    replaceChildren(...items) { this.children = items; }
    querySelector(selector) { return ({ '.pwa-install-open': this.open, '.pwa-install-close': this.close, '.pwa-install-guide': this.guide })[selector] || null; }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    click() { return this.listeners.click?.(); }
  }
  const home = new Element('section'); let box;
  home.querySelector = () => ({before(el) { box = el; }});
  const mq = { matches: standalone, addEventListener() {} };
  const win = { matchMedia: () => mq, addEventListener(name, fn) { events[name] = fn; } };
  const ctx = { window: win, navigator: { userAgent: ua }, document: { getElementById: () => home, createElement: tag => new Element(tag), head: new Element('head') }, localStorage: { getItem: k => memory.get(k) || null, setItem: (k,v) => memory.set(k,v) }, Date };
  vm.runInNewContext(source, ctx);
  return { get box() { return box; }, events, memory };
}
{
 const s = scenario({ua:'Mozilla iPhone'});
 assert.equal(s.box.hidden, false);
 await s.box.open.click();
 assert.equal(s.box.guide.hidden, false);
 const steps = s.box.guide.children[1].children.map(x => x.textContent);
 assert.ok(steps.some(x => x.includes('Поделиться')));
 assert.ok(steps.some(x => x.includes('Домой')));
 assert.ok(steps.some(x => x.includes('войди в аккаунт')));
 s.box.close.click(); assert.equal(s.box.hidden, true); assert.ok(s.memory.has('lexi_install_dismissed_v1'));
}
{
 const s = scenario({ua:'Android'}); let called = 0, prevented = false;
 assert.equal(s.box.open.textContent, 'Как добавить');
 s.events.beforeinstallprompt({ preventDefault() { prevented = true; }, async prompt() { called++; } });
 assert.equal(s.box.open.textContent, 'Установить LEXI'); assert.ok(prevented);
 await s.box.open.click(); assert.equal(called, 1);
 s.events.appinstalled(); assert.equal(s.box.hidden, true);
}
{
 const s = scenario({ua:'Android'});
 await s.box.open.click(); assert.match(s.box.guide.children[1].children[1].textContent, /если такой пункт доступен/);
 s.box.close.click(); s.events.beforeinstallprompt({preventDefault(){}}); assert.equal(s.box.hidden, true);
}
assert.equal(scenario({ua:'iPhone', standalone:true}).box, undefined);
assert.equal(scenario({ua:'iPhone', stored:{lexi_install_dismissed_v1:String(Date.now())}}).box, undefined);
{
 const s = scenario(); assert.equal(s.box.hidden, true);
 s.events.beforeinstallprompt({preventDefault(){},async prompt(){}}); assert.equal(s.box.hidden, false);
}
console.log('PASS PWA installation: iOS instructions, Android prompt/fallback, dismissal and standalone');
