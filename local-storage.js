/* Untrusted, device-only practice data. This adapter has no network capability. */
window.LexigoLocalStorage=(()=>{
 const shapes=Object.freeze({lexigo_progress_v1:'object',lexigo_pair_scores:'array',lexigo_cabinet_demo_v1:'array',lexigo_cabinet_attempts_v1:'array'});
 function validate(key,value){
  if(!Object.hasOwn(shapes,key))throw Error('Unknown local practice key');
  if(shapes[key]==='array'){if(!Array.isArray(value))return [];return value.filter(x=>x&&typeof x==='object'&&!Array.isArray(x)).slice(-1000)}
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  const clean=Object.create(null);
  for(const [id,row] of Object.entries(value)){
   if(['__proto__','constructor','prototype'].includes(id)||!row||typeof row!=='object'||Array.isArray(row))continue;
   const record=Object.create(null);
   for(const [field,v] of Object.entries(row))if(!['__proto__','constructor','prototype'].includes(field)&&(typeof v==='string'||typeof v==='number'&&Number.isFinite(v)&&v>=0))record[field]=v;
   record.right=Number(record.right)||0;record.wrong=Number(record.wrong)||0;clean[id]=record;
  }return clean;
 }
 function read(key){try{const text=localStorage.getItem(key);if(text&&text.length>2000000)return validate(key,null);return validate(key,JSON.parse(text||'null'))}catch{return validate(key,null)}}
 function write(key,value){
  const clean=validate(key,value);
  if(key==='lexigo_cabinet_attempts_v1')for(const row of clean)row.verified=false;
  try{localStorage.setItem(key,JSON.stringify(clean));return true}catch{return false}
 }
 return Object.freeze({read,write});
})();
