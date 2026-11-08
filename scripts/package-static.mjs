import fs from 'node:fs/promises';import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const destination=path.resolve(process.argv[2]||path.join(root,'static-preview'));
if(destination===root||root.startsWith(destination+path.sep))throw Error('Choose a separate output directory');
await fs.mkdir(destination,{recursive:true});
for(const item of await fs.readdir(root,{withFileTypes:true})){
 if(item.isFile()&&/\.(html|js|css|json|webmanifest)$/.test(item.name))await fs.copyFile(path.join(root,item.name),path.join(destination,item.name));
 if(item.isDirectory()&&['assets','vocabulary','vendor'].includes(item.name))await fs.cp(path.join(root,item.name),path.join(destination,item.name),{recursive:true});
}
await fs.writeFile(path.join(destination,'config.js'),'// Isolated preview: never connect to the production account.\nwindow.LEXIGO_CLOUD=Object.freeze({url:"",anonKey:""});\n');
await fs.writeFile(path.join(destination,'README.txt'),'LEXI isolated static preview · Spotlight 2–10\nServe this folder with a local HTTP server. Cloud accounts are disabled.\n');
for(const file of (await fs.readdir(destination)).filter(name=>name.endsWith('.html'))){
 const html=await fs.readFile(path.join(destination,file),'utf8');
 for(const [,ref] of html.matchAll(/(?:src|href)="([^"?#]+)(?:[?#][^\"]*)?"/g)){
  if(/^(?:[a-z]+:|\/\/|#)/i.test(ref))continue;
  if(!/\.(?:js|css|svg|png|webp|json|webmanifest|html)$/i.test(ref))continue;
  await fs.access(path.resolve(destination,ref)).catch(()=>{throw Error(file+' references missing '+ref);});
 }
}
console.log('PASS: complete static package; production cloud disabled; '+destination);
