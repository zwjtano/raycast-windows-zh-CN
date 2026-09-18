import fs from 'node:fs';
import path from 'node:path';
import {transformSync} from 'esbuild';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),parser=require('acorn'),transform=require('../src/plugin-transform.cjs');
const scopes=require('../src/plugin-scopes.cjs');
const dictionary=Object.assign({},...['zh-CN','windows','plugins-windows'].map(x=>JSON.parse(fs.readFileSync(`translations/${x}.json`,'utf8'))));
const missing={},results=[];
const root='.cache/extension-sources';
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const name of fs.readdirSync(root)){
 let literals=new Set(),translated=new Set(),errors=[],fileCount=0;
 for(const file of files(path.join(root,name))){
  if(!/\.[jt]sx?$/.test(file)||file.endsWith('.d.ts'))continue;
  try{
   const loader=path.extname(file).slice(1);
   const js=transformSync(fs.readFileSync(file,'utf8'),{loader,format:'cjs',jsx:'automatic',target:'es2022'}).code;
   transform(js,parser,value=>{literals.add(value);if(Object.hasOwn(scopes[name]||{},value)){translated.add(value);return scopes[name][value];}if(Object.hasOwn(dictionary,value)){translated.add(value);return dictionary[value];}if(/[a-zA-Z]{2}/.test(value)){(missing[value]??=new Set()).add(name);}return value;});
   fileCount++;
  }catch(e){errors.push({file:path.relative(root,file),error:e.message});}
 }
 results.push({name,files:fileCount,displayLiterals:literals.size,matchedDisplayLiterals:translated.size,errors});
}
fs.writeFileSync('docs/plugin-source-audit.json',JSON.stringify({checkedAt:new Date().toISOString(),scope:'Public source syntax audit; not an authenticated runtime test. Dynamic strings and custom-component props are not counted.',extensions:results},null,2)+'\n');
fs.writeFileSync('.cache/missing-plugin-strings.json',JSON.stringify(Object.fromEntries(Object.entries(missing).map(([s,n])=>[s,[...n]])),null,2));
console.log(JSON.stringify({extensions:results.length,files:results.reduce((n,x)=>n+x.files,0),missing:Object.keys(missing).length,errors:results.flatMap(x=>x.errors)}));
