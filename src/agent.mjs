import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

export function applyEdits(source, entry) {
  if (createHash('sha256').update(source).digest('hex') !== entry.sha256) throw new Error('Resource fingerprint mismatch');
  let result = source;
  for (const e of entry.edits) {
    if (result.slice(e.start, e.end) !== e.original) throw new Error('Invalid translation offset');
    result = result.slice(0, e.start) + e.replacement + result.slice(e.end);
  }
  return result;
}

export class CDP {
  constructor(url) {
    const u = new URL(url);
    if (u.protocol !== 'ws:' || u.hostname !== '127.0.0.1') throw new Error('Only loopback WebSockets are allowed');
    this.ws = new WebSocket(url); this.next = 0; this.pending = new Map(); this.handlers = new Map();
    this.opened = new Promise((resolve,reject) => {
      this.ws.addEventListener('open', resolve, {once:true});
      this.ws.addEventListener('error', () => reject(new Error('WebView connection failed')), {once:true});
    });
    this.ws.addEventListener('message', ({data}) => {
      const msg = JSON.parse(String(data));
      if (msg.id) {
        const p = this.pending.get(msg.id); if (!p) return;
        this.pending.delete(msg.id); clearTimeout(p.timer);
        msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
      } else for (const callback of this.handlers.get(msg.method) ?? []) Promise.resolve(callback(msg.params)).catch(()=>{});
    });
    this.ws.addEventListener('close', () => {
      for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('WebView closed')); }
      this.pending.clear(); this.closed = true;
    });
  }
  on(method, callback) {
    if (!this.handlers.has(method)) this.handlers.set(method,[]);
    this.handlers.get(method).push(callback);
  }
  async send(method,params={}) {
    await this.opened;
    if (this.closed) throw new Error('WebView closed');
    const id=++this.next;
    return new Promise((resolve,reject) => {
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`Timed out: ${method}`));},10000);
      this.pending.set(id,{resolve,reject,timer}); this.ws.send(JSON.stringify({id,method,params}));
    });
  }
  close() { this.ws.close(); }
}

export async function runAgent(configPath) {
  const config = JSON.parse(await fs.readFile(configPath,'utf8'));
  const base=path.dirname(configPath), bundle=config.bundle;
  const manifest=JSON.parse(await fs.readFile(path.join(bundle,'manifest.json'),'utf8'));
  const source=await fs.readFile(path.join(bundle,'inject.js'),'utf8');
  const prefix=pathToFileURL(path.join(config.appRoot,'frontend')+path.sep).href;
  const patched=new Map();
  for (const [name,entry] of Object.entries(manifest.files)) {
    const original=await fs.readFile(path.join(config.appRoot,'frontend',name),'utf8');
    patched.set(prefix+name, Buffer.from(applyEdits(original,entry)).toString('base64'));
  }
  const clients=new Map(); let active=true, intercepted=0;
  const patcher=createRequire(import.meta.url)(path.join(bundle,'plugin-patcher.cjs'));
  let pluginScan=0;
  const status={version:manifest.patchVersion,pid:process.pid,state:'waiting',pages:0,intercepted:0};
  async function save() {
    status.pages=clients.size;status.intercepted=intercepted;
    await fs.writeFile(path.join(base,'status.json'), JSON.stringify(status,null,2));
  }
  async function attach(target) {
    if (!target.url.startsWith(prefix) || !target.url.endsWith('.html')) return;
    const ws=new URL(target.webSocketDebuggerUrl);
    if (Number(ws.port)!==config.port) return;
    const c=new CDP(ws.href);clients.set(target.id,c);
    try {
      await c.send('Page.enable');
      c.on('Fetch.requestPaused', async event => {
        const body=patched.get(event.request.url);
        if (body) {
          await c.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,
            responseHeaders:[{name:'Content-Type',value:'text/javascript; charset=utf-8'}],body});
          intercepted++;
        } else await c.send('Fetch.continueRequest',{requestId:event.requestId});
      });
      await c.send('Fetch.enable',{patterns:[{urlPattern:prefix+'*.js',requestStage:'Request'}]});
      c.script=(await c.send('Page.addScriptToEvaluateOnNewDocument',{source})).identifier;
      const evaluation = await c.send('Runtime.evaluate',{expression:source});
      if(evaluation.exceptionDetails) throw new Error('Control translation script failed');
      // New main/settings windows contain no document drafts. Other windows
      // receive control translations without discarding an editor's contents.
      if (/(?:main|settings)-window\.html$/.test(target.url)) await c.send('Page.reload',{ignoreCache:true});
      status.state='active';await save();
    } catch (error) { c.close(); clients.delete(target.id); status.state='attach-failed';status.error=error.message;await save(); }
  }
  process.on('SIGTERM',()=>{active=false;});process.on('SIGINT',()=>{active=false;});
  await save();
  while(active) {
    if (await fs.stat(path.join(base,'stop')).then(()=>true,()=>false)) break;
    if (config.appPid) { try { process.kill(config.appPid,0); } catch { break; } }
    if(Date.now()-pluginScan>15000) {
      pluginScan=Date.now();
      try{patcher.apply(path.dirname(bundle));}catch{status.pluginWarning='Plugin translation skipped; backups retained';}
    }
    try {
      const response=await fetch(`http://127.0.0.1:${config.port}/json/list`,{signal:AbortSignal.timeout(2000)});
      const targets=await response.json();
      for (const [id,c] of clients) if(c.closed || !targets.some(t=>t.id===id)){c.close();clients.delete(id);}
      for (const t of targets) if(t.type==='page'&&!clients.has(t.id)) await attach(t);
      await save();
    } catch {
      for(const c of clients.values())c.close();clients.clear();status.state='waiting';
      await save();
    }
    await new Promise(resolve=>setTimeout(resolve,800));
  }
  for(const c of clients.values()) {
    try {
      await c.send('Fetch.disable');
      if(c.script) await c.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:c.script});
      await c.send('Runtime.evaluate',{expression:'window.__raycastZhCN?.stop()'});
    } catch { /* A closed WebView already discarded its in-memory patch. */ }
    c.close();
  }
  status.state='stopped';await save();
}
export async function quitRaycast(configPath) {
  const config=JSON.parse(await fs.readFile(configPath,'utf8'));
  const prefix=pathToFileURL(path.join(config.appRoot,'frontend')+path.sep).href;
  let targets;
  try { targets=await(await fetch(`http://127.0.0.1:${config.port}/json/list`,{signal:AbortSignal.timeout(2000)})).json(); }
  catch { return; } // An already closed Raycast needs no shutdown request.
  const target=targets.find(t=>t.url===prefix+'main-window.html');
  if(!target) return;
  const names=(await fs.readdir(path.join(config.appRoot,'frontend'))).filter(x=>/^services-.*\.js$/.test(x));
  if(names.length!==1) throw new Error('Unrecognized services module');
  const c=new CDP(target.webSocketDebuggerUrl);
  try { await c.send('Runtime.evaluate',{expression:`import(${JSON.stringify('./'+names[0])}).then(m=>m.t.ipc.host.raycast.quit())`}); }
  finally { c.close(); }
  return true;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (process.argv[2]==='--quit' ? quitRaycast(process.argv[3]).then(requested=>{if(requested)console.log('requested');}) : runAgent(process.argv[2])).catch(error=>{ console.error(error.message);process.exitCode=1; });
}
