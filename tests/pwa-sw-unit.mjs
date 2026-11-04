// Executes the real worker with Cache Storage and Fetch stand-ins; not a browser integration test.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const listeners = {}, stored = new Map(), names = new Map();
const cache = {
  async add(url) { stored.set(url, {body:'offline', clone(){return this}}); },
  async put(req,res) { stored.set(typeof req === 'string' ? req : req.url,res); },
  async match(req) { return stored.get(typeof req === 'string' ? req : req.url); },
  async keys() { return [...stored.keys()].map(url => ({url})); },
  async delete(req) { return stored.delete(req.url); },
};
const caches = { async open(name) { names.set(name,cache); return cache; }, async keys(){return [...names.keys()]}, async delete(name){return names.delete(name)}, async match(key){return cache.match(key)} };
let fail = false, claimed = 0, clones = 0;
const fetch = async () => { if (fail) throw Error('offline'); return {ok:true,type:'basic', headers:new Headers(), clone(){clones++; return this}}; };
const self = {registration:{scope:'https://example.test/lexigo/'},clients:{async claim(){claimed++}},skipWaiting(){skip++},addEventListener(type,cb){listeners[type]=cb}};
vm.runInNewContext(readFileSync(new URL('../sw.js',import.meta.url),'utf8'),{self,caches,fetch,URL,Response,console});
const wait=[]; listeners.install({waitUntil:p=>wait.push(p)}); await Promise.all(wait); assert(stored.has('https://example.test/lexigo/offline.html'));
listeners.activate({waitUntil:p=>wait.push(p)}); await Promise.all(wait); assert.equal(claimed,0, 'activation must not take over open pages');
function request(url, mode='no-cors', headers={}) { return {url,method:'GET',mode,headers:new Headers(headers)}; }
async function run(req) { let response; const jobs=[]; listeners.fetch({request:req,respondWith:p=>response=p,waitUntil:p=>jobs.push(p)}); if(response) await response; await Promise.all(jobs); return response; }
await run(request('https://example.test/lexigo/assets/lexi-icon-192.png?v=1')); assert(stored.has('https://example.test/lexigo/assets/lexi-icon-192.png?v=1')); assert.equal(clones,1,'body cloned before page receives it');
for (const url of ['https://example.test/lexigo/config.js','https://example.test/lexigo/world.css?v=1','https://example.test/lexigo/cloud.js?v=1','https://example.test/lexigo/vocabulary/spotlight-5.js?v=1','https://example.test/lexigo/assets/icon.svg?token=secret','https://example.test/lexigo/api/data.js','https://remote.test/a.js','https://example.test/other/a.js']) {
  assert.equal(await run(request(url)),undefined,'not intercepted: '+url); assert(!stored.has(url));
}
assert.equal(await run(request('https://example.test/lexigo/assets/icon.svg?v=2','no-cors',{authorization:'Bearer test'})),undefined);
await run(request('https://example.test/lexigo/auth.html?token=private','navigate')); assert(![...stored.keys()].some(k=>k.includes('token=private')));
fail=true; const fallback=await run(request('https://example.test/lexigo/auth.html?token=private','navigate')); assert.equal((await fallback).body,'offline');
assert(await run(request('https://example.test/lexigo/assets/lexi-icon-192.png?v=1')));
// Even if a previous release left code under the same URL in Cache Storage,
// an HTML update must never receive that stale executable code as a fallback.
stored.set('https://example.test/lexigo/cloud.js?v=1', {body:'old-code'});
assert.equal(await run(request('https://example.test/lexigo/cloud.js?v=1')), undefined, 'old code is not served during a partial outage');
const shell = readFileSync(new URL('../offline.html',import.meta.url),'utf8');
assert.match(shell, /Нет подключения|интернет отключился/i);
assert.match(shell, /location\.reload\(\)/, 'retry reloads the original navigation, including auth callbacks');
assert.doesNotMatch(shell, /<script\s+src=|<img\s+src=/i, 'offline shell needs no uncached external resources');
assert.equal(listeners.message, undefined, 'no forced activation while other tabs may be playing');
console.log('PASS PWA worker: scoped static cache, private/API bypass, offline fallback and safe update waiting');
