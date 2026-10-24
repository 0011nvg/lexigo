/* Local pilot transport. Credentials live only in this closure, never browser storage. */
window.LexigoServerStorage=Object.freeze({
 create(){
  let api='',anon='',access='',generation=0;
  const pending=new Set();
  function clear(){generation++;access='';for(const controller of pending)controller.abort();pending.clear()}
  function configure(address,key){
   const url=new URL(address);
   if(!['localhost','127.0.0.1'].includes(url.hostname)||url.protocol!=='http:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Разрешён только локальный Supabase');
   const value=String(key).trim();if(!value)throw Error('Введите локальный anon key');
   // Reject privileged JWT keys even when a user pastes one into the public-key field.
   if(value.split('.').length===3){
    let claims;try{claims=JSON.parse(atob(value.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')))}catch{throw Error('Некорректный публичный ключ')}
    if(claims.role!=='anon')throw Error('Нужен публичный anon key');
   }else if(!value.startsWith('sb_publishable_'))throw Error('Нужен публичный anon key');
   clear();api=url.origin;anon=value;
  }
  async function request(path,options={}){
   if(!api||!anon)throw Error('Настройте локальный Supabase');
   if(!/^\/(auth\/v1\/|rest\/v1\/|functions\/v1\/learning-api\/)/.test(path)||path.includes('..'))throw Error('Недопустимый маршрут');
   const version=generation,controller=new AbortController();pending.add(controller);
   try{
    const headers={apikey:anon,...(access?{authorization:'Bearer '+access}:{}),...(options.body?{'content-type':'application/json'}:{}),...(path.startsWith('/rest/v1/')?{'Accept-Profile':'lexigo'}:{})};
    const response=await fetch(api+path,{method:options.method||'GET',body:options.body,headers,cache:'no-store',redirect:'error',credentials:'omit',signal:controller.signal});
    const data=await response.json().catch(()=>null);
    if(version!==generation)throw Error('Сессия изменилась. Войдите снова.');
    if(!response.ok)throw Error('HTTP '+response.status+': '+(data?.msg||data?.message||data?.error||'доступ запрещён'));
    return data;
   }finally{pending.delete(controller)}
  }
  return Object.freeze({configure,request,clear,get authenticated(){return !!access},acceptSession(data){if(!data?.access_token||!data.user?.id)throw Error('Auth не вернул подтверждённую сессию');access=data.access_token}});
 }
});
