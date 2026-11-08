import {chromium as playwrightChromium} from 'playwright';
// CI uses Playwright's installed browser. Restricted developer environments can
// explicitly provide an existing Chromium binary without changing assertions.
// Site tests run in guest mode: config.js is replaced by an empty cloud config so no test
// ever talks to the production Supabase project (set LEXIGO_REAL_CLOUD=1 to opt out).
const OFFLINE_CONFIG='window.LEXIGO_CLOUD=Object.freeze({url:"",anonKey:""});';
async function offline(target){
 if(process.env.LEXIGO_STATIC_ORIGIN){
  const origin=new URL(process.env.LEXIGO_STATIC_ORIGIN);
  if(!['127.0.0.1','localhost','[::1]'].includes(origin.hostname))throw Error('Static test origin must be loopback');
  await target.route('http://127.0.0.1:4173/**',async route=>{try{const url=new URL(route.request().url());const response=await route.fetch({url:origin.origin+url.pathname+url.search,maxRetries:2});await route.fulfill({response});}catch{await route.abort().catch(()=>{});}});
 }
 if(!process.env.LEXIGO_REAL_CLOUD)await target.route('**/config.js',r=>r.fulfill({contentType:'application/javascript',body:OFFLINE_CONFIG}));return target;
}
export const chromium={async launch(options={}){
 const browser=await playwrightChromium.launch({...options,...(process.env.LEXIGO_CHROMIUM_PATH?{executablePath:process.env.LEXIGO_CHROMIUM_PATH,args:[...(options.args||[]),'--no-sandbox','--disable-dev-shm-usage']}: {})});
 const newPage=browser.newPage.bind(browser),newContext=browser.newContext.bind(browser);
 browser.newPage=async(...a)=>offline(await newPage(...a));
 browser.newContext=async(...a)=>offline(await newContext(...a));
 return browser;
}};
