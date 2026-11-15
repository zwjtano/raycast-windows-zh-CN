import fs from 'node:fs';
import path from 'node:path';

// Lists every visible English string in the running Raycast windows and marks
// whether it sits inside the localization boundary (docs/boundaries.md).
// Read-only: it attaches, reads text, and disconnects.
const config=JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE,'.raycast-zh-CN','runtime','config.json'),'utf8'));
const base=`http://127.0.0.1:${config.port}`;

const COLLECT=`(()=>{
  const han=/[\\u4e00-\\u9fff]/;
  const visible=e=>{const s=getComputedStyle(e);return s.visibility!=='hidden'&&s.display!=='none'&&e.getClientRects().length>0;};
  const out=[];
  for(const e of document.querySelectorAll('body *')){
    if(e.children.length)continue;
    const t=(e.textContent||'').trim();
    if(!t||t.length<2||han.test(t)||!/^[A-Za-z0-9$€£¥]/.test(t))continue;
    if(!visible(e))continue;
    out.push(t);
  }
  return [...new Set(out)];})()`;

const rules=[
  ['brand', /^(Raycast(\s|$)|MCP$|AI$|Slack|Twitter|Threads|Instagram|Mastodon|Bluesky|Reddit|YouTube|Steam|XBOX|GRIS|Emacs|PowerShell|Apple|Gelato|Corals|Sky|Sunset|Midnight|Dawn|Overcast|Noon|Paper Slice|Summer Dress|Flower)/i],
  ['keycap', /^(Ctrl|Alt|Shift|Esc|Tab|Space|Enter|Win|Cmd|⌘|↵)(\s*[+↵]|$)/i],
  ['path-or-url', /(^[A-Za-z]:\\|^\/|https?:\/\/|\/|\\\\|^~\/)/],
  ['code-sample', /[{}();=<>`]|^[a-z]+\(|^\d/],
  ['technical', /^[A-Z_]{2,}$|^[\d.,%]+(\s?(kB|MB|GB|ms|s))?$/],
];
function verdict(text){
  for(const [name,re] of rules) if(re.test(text)) return name;
  return /^[A-Za-z][A-Za-z0-9 .,'’"!?:&-]*$/.test(text)&&text.split(/\s+/).length<=3 ? 'name-or-label' : 'review';
}

function connect(url){
  const ws=new WebSocket(url); const pending=new Map(); let id=0;
  ws.addEventListener('message',({data})=>{const m=JSON.parse(String(data));if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}});
  return new Promise(res=>ws.addEventListener('open',()=>res({
    send(method,params={}){const n=++id;ws.send(JSON.stringify({id:n,method,params}));return new Promise(r=>{pending.set(n,r);setTimeout(()=>{if(pending.delete(n))r({error:{message:'timeout'}})},8000)});},
    close(){ws.close();}
  })));
}

const targets=await(await fetch(base+'/json/list')).json();
const rows=[];
for(const target of targets){
  const name=target.url.split('/').pop().split('?')[0];
  if(!name.endsWith('.html')) continue;
  const c=await connect(target.webSocketDebuggerUrl);
  const r=await c.send('Runtime.evaluate',{expression:COLLECT,returnByValue:true,awaitPromise:true}).catch(()=>null);
  c.close();
  for(const text of r?.result?.result?.value??[]) rows.push({window:name,text,verdict:verdict(text)});
}
const order=['review','name-or-label','brand','keycap','path-or-url','code-sample','technical'];
rows.sort((a,b)=>order.indexOf(a.verdict)-order.indexOf(b.verdict)||b.text.length-a.text.length);
for(const v of order){
  const group=rows.filter(r=>r.verdict===v);
  if(!group.length) continue;
  console.log(`\n## ${v} (${group.length})`);
  for(const r of group) console.log(`  ${r.window.padEnd(24)} ${r.text.slice(0,120)}`);
}
const needs=rows.filter(r=>r.verdict==='review'||r.verdict==='name-or-label').length;
console.log(`\n${rows.length} strings, ${needs} need a decision, ${rows.length-needs} inside the boundary.`);
