import fs from 'node:fs';
import vm from 'node:vm';
const ctx={window:{}};
vm.runInNewContext(fs.readFileSync('data.js','utf8'),ctx);
const data=ctx.window.LEXIGO_DATA;
const norm=s=>s.trim().toLowerCase().replace(/[’‘]/g,"'").replace(/[‑–]/g,'-').replace(/\s+/g,' ');
const aliases={'greenhouse':'green house','birdhouse':'bird house','a hundred':'hundred','how many …?':'how many :?'};
const changes=[];
for(const grade of [2,3]){
 const b=data.books.find(x=>x.grade===grade), old=b.sections.map(s=>({...s,words:s.words.slice()}));
 const used=new Set();
 const source=fs.readFileSync('scripts/spotlight-'+grade+'-source.txt','utf8').trim().split(/\r?\n\s*\r?\n/).map(block=>{const [head,...lines]=block.split(/\r?\n/);const [module,title]=head.split('|');return {module,title,words:lines.map(line=>{const n=line.indexOf('=');if(n<1)throw Error(line);return {en:line.slice(0,n).trim(),ru:line.slice(n+1).trim()}})}});
 const titleKey=s=>norm(s).replace(/[^a-z0-9]/g,'');
 const keep=grade===3?25:0;
 // Keep every existing section index, including empty category headings: old lesson links stay valid.
 for(let i=keep;i<b.sections.length;i++)b.sections[i].words=[];
 for(const [sourceIndex,spec] of source.entries()){
  let ix=old.findIndex((s,i)=>i>=keep&&titleKey(s.title)===titleKey(spec.title)&& (grade===3||s.module===spec.module));
  if(ix<0){ix=b.sections.length;b.sections.push({module:spec.module,title:spec.title,words:[]});}
  const section=b.sections[ix];section.module=spec.module;section.sourceOrder=keep+sourceIndex;
  for(const w of spec.words){
   const match=x=>norm(x.en)===norm(w.en)||norm(x.en)===norm(aliases[norm(w.en)]||'');
   const prev=(old[ix]?.words||[]).find(x=>match(x)&&!used.has(x.id))||old.slice(keep).flatMap(s=>s.words).find(x=>match(x)&&!used.has(x.id));
   const id=prev?.id||'s'+grade+'_20261111_'+ix+'_'+section.words.length;
   used.add(id);section.words.push({...w,id});
   if(prev&&(prev.en!==w.en||prev.ru!==w.ru))changes.push({grade,section:spec.title,before:[prev.en,prev.ru],after:[w.en,w.ru]});
  }
 }
}
fs.writeFileSync('data.json',JSON.stringify(data,null,2)+'\n');
fs.writeFileSync('data.js','window.LEXIGO_DATA = '+JSON.stringify(data,null,2)+';\n');

console.log(data.books.map(b=>({grade:b.grade,sections:b.sections.length,words:b.sections.reduce((n,s)=>n+s.words.length,0)})));
