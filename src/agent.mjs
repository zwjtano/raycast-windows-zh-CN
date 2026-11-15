import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

export function applyEdits(source, entry) {
  if (createHash('sha256').update(source).digest('hex') !== entry.sha256) throw new Error('Resource fingerprint mismatch');
  const chunks = [];
  let end = source.length;
  for (const e of entry.edits) {
    if (!Number.isInteger(e.start) || !Number.isInteger(e.end) || e.start < 0 || e.end < e.start || e.end > end || source.slice(e.start, e.end) !== e.original) throw new Error('Invalid translation offset');
    chunks.push(source.slice(e.end, end), e.replacement);
    end = e.start;
  }
  chunks.push(source.slice(0, end));
  return chunks.reverse().join('');
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
      } else for (const callback of this.handlers.get(msg.method) ?? []) Promise.resolve(callback(msg.params,msg.sessionId)).catch(()=>{});
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
  async send(method,params={},sessionId) {
    await this.opened;
    if (this.closed) throw new Error('WebView closed');
    const id=++this.next;
    return new Promise((resolve,reject) => {
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`Timed out: ${method}`));},10000);
      this.pending.set(id,{resolve,reject,timer}); this.ws.send(JSON.stringify({id,method,params,...sessionId&&{sessionId}}));
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
  const clients=new Map(), sessions=new Map(), handled=new Set();
  let active=true, intercepted=0, browser=null;
  const patcher=createRequire(import.meta.url)(path.join(bundle,'plugin-patcher.cjs'));
  let pluginScan=0;
  const status={version:manifest.patchVersion,pid:process.pid,state:'waiting',pages:0,intercepted:0};
  async function save() {
    status.pages=clients.size+sessions.size;status.intercepted=intercepted;
    await fs.writeFile(path.join(base,'status.json'), JSON.stringify(status,null,2));
  }
  async function fulfil(c,event,sessionId) {
    const body=patched.get(event.request.url);
    if (body) {
      await c.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,
        responseHeaders:[{name:'Content-Type',value:'text/javascript; charset=utf-8'}],body},sessionId);
      intercepted++;
    } else await c.send('Fetch.continueRequest',{requestId:event.requestId},sessionId);
  }
  async function attach(target) {
    if (!target.url.startsWith(prefix) || !target.url.endsWith('.html')) return;
    const ws=new URL(target.webSocketDebuggerUrl);
    if (Number(ws.port)!==config.port) return;
    const c=new CDP(ws.href);clients.set(target.id,c);
    try {
      await c.send('Page.enable');
      c.on('Fetch.requestPaused', event => fulfil(c,event));
      await c.send('Fetch.enable',{patterns:[{urlPattern:prefix+'*.js',requestStage:'Request'}]});
      c.script=(await c.send('Page.addScriptToEvaluateOnNewDocument',{source})).identifier;
      const evaluation = await c.send('Runtime.evaluate',{expression:source});
      if(evaluation.exceptionDetails) throw new Error('Control translation script failed');
      // A window found by polling already ran its unpatched bundle, so it has to
      // be loaded again through the patch. Windows holding a draft keep theirs.
      if (!/(?:notes|ai-chat)-window\.html/.test(target.url)) await c.send('Page.reload',{ignoreCache:true});
      status.state='active';await save();
    } catch (error) { c.close(); clients.delete(target.id); status.state='attach-failed';status.error=error.message;await save(); }
  }
  // Raycast spawns the settings and companion windows on demand. Polling finds
  // them after their bundle already ran, which showed English first and then a
  // reload. Pause each new renderer instead, arm the patch, and let it start once.
  async function early({sessionId,targetInfo,waitingForDebugger}) {
    if (!waitingForDebugger) return; // Already running: the poll path reloads it.
    try {
      if (targetInfo.type==='page') {
        handled.add(targetInfo.targetId);sessions.set(sessionId,targetInfo.url);
        await browser.send('Page.enable',{},sessionId);
        await browser.send('Fetch.enable',{patterns:[{urlPattern:prefix+'*.js',requestStage:'Request'}]},sessionId);
        await browser.send('Page.addScriptToEvaluateOnNewDocument',{source},sessionId);
        status.state='active';
      }
    } catch { handled.delete(targetInfo.targetId);sessions.delete(sessionId); }
    finally { await browser.send('Runtime.runIfWaitingForDebugger',{},sessionId).catch(()=>{}); }
  }
  // Raycast may still be starting when this worker comes up (it runs at login),
  // so the browser session is opened on demand and retried until it sticks.
  async function connectBrowser() {
    try {
      const endpoint=await(await fetch(`http://127.0.0.1:${config.port}/json/version`,{signal:AbortSignal.timeout(2000)})).json();
      sessions.clear();handled.clear(); // A new session owns no previous renderer.
      browser=new CDP(endpoint.webSocketDebuggerUrl);
      browser.on('Target.attachedToTarget',early);
      browser.on('Target.detachedFromTarget',({sessionId})=>sessions.delete(sessionId));
      browser.on('Fetch.requestPaused',(event,sessionId)=>fulfil(browser,event,sessionId));
      await browser.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true});
    } catch { browser?.close();browser=null; } // An older runtime keeps the poll-only path.
  }
  await connectBrowser();
  process.on('SIGTERM',()=>{active=false;});process.on('SIGINT',()=>{active=false;});
  await save();
  while(active) {
    if (await fs.stat(path.join(base,'stop')).then(()=>true,()=>false)) break;
    if (config.appPid) { try { process.kill(config.appPid,0); } catch { break; } }
    if(Date.now()-pluginScan>15000) {
      pluginScan=Date.now();
      try{patcher.apply(path.dirname(bundle));}catch{status.pluginWarning='Plugin translation skipped; backups retained';}
    }
    if(!browser || browser.closed) await connectBrowser();
    try {
      const response=await fetch(`http://127.0.0.1:${config.port}/json/list`,{signal:AbortSignal.timeout(2000)});
      const targets=await response.json();
      for (const [id,c] of clients) if(c.closed || !targets.some(t=>t.id===id)){c.close();clients.delete(id);}
      for (const id of handled) if(!targets.some(t=>t.id===id)) handled.delete(id);
      for (const t of targets) if(t.type==='page'&&!clients.has(t.id)&&!handled.has(t.id)) await attach(t);
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
  if(browser) {
    for(const sessionId of sessions.keys()) await browser.send('Runtime.evaluate',{expression:'window.__raycastZhCN?.stop()'},sessionId).catch(()=>{});
    await browser.send('Target.setAutoAttach',{autoAttach:false,waitForDebuggerOnStart:false,flatten:true}).catch(()=>{});
    browser.close();
  }
  status.state='stopped';await save();
}
// Raycast 2.12 replaced the shared services module with content-hashed window
// bundles. Resolve the translated scripts the main window loads and use the
// export that owns the IPC client, so no minified name is pinned to a build.
export function mainWindowModules(html, manifest) {
  return [...html.matchAll(/src="\.\/([^"]+\.js)"/g)].map(m=>m[1]).filter(name=>Object.hasOwn(manifest.files,name));
}
export async function quitRaycast(configPath) {
  const config=JSON.parse(await fs.readFile(configPath,'utf8'));
  const frontend=path.join(config.appRoot,'frontend');
  const prefix=pathToFileURL(frontend+path.sep).href;
  let targets;
  try { targets=await(await fetch(`http://127.0.0.1:${config.port}/json/list`,{signal:AbortSignal.timeout(2000)})).json(); }
  catch { return; } // An already closed Raycast needs no shutdown request.
  const target=targets.find(t=>t.url===prefix+'main-window.html');
  if(!target) return;
  const manifest=JSON.parse(await fs.readFile(path.join(config.bundle,'manifest.json'),'utf8'));
  const modules=mainWindowModules(await fs.readFile(path.join(frontend,'main-window.html'),'utf8'),manifest);
  if(!modules.length) throw new Error('Unrecognized main window bundle');
  for(const name of modules) {
    const source=await fs.readFile(path.join(frontend,name));
    if(createHash('sha256').update(source).digest('hex')!==manifest.files[name].sha256) throw new Error('Resource fingerprint mismatch');
  }
  const c=new CDP(target.webSocketDebuggerUrl);
  try { await c.send('Runtime.evaluate',{expression:`(async()=>{for(const n of ${JSON.stringify(modules)}){const m=await import(${JSON.stringify('./')}+n),s=Object.values(m).find(v=>v?.ipc?.host?.raycast?.quit);if(s)return s.ipc.host.raycast.quit()}})()`}); }
  finally { c.close(); }
  return true;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (process.argv[2]==='--quit' ? quitRaycast(process.argv[3]).then(requested=>{if(requested)console.log('requested');}) : runAgent(process.argv[2])).catch(error=>{ console.error(error.message);process.exitCode=1; });
}
