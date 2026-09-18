// Local acceptance-test helper. It targets only this component's Raycast instance.
import fs from 'node:fs/promises';
import path from 'node:path';
import { CDP } from '../src/agent.mjs';
const root=path.join(process.env.LOCALAPPDATA,'Raycast-zh-CN');
const config=JSON.parse(await fs.readFile(path.join(root,'runtime/config.json'),'utf8'));
const targets=await(await fetch(`http://127.0.0.1:${config.port}/json/list`)).json();
const target=targets.find(t=>t.url.endsWith(process.argv[3] || 'main-window.html'));
if(!target)throw new Error('Requested Raycast window is not open');
const c=new CDP(target.webSocketDebuggerUrl);
try {
  if(process.argv[2]==='quit') {
    const services=(await fs.readdir(path.join(config.appRoot,'frontend'))).filter(x=>/^services-.*\.js$/.test(x));
    if(services.length!==1)throw new Error('Ambiguous services module');
    await c.send('Runtime.evaluate',{expression:`import(${JSON.stringify('./'+services[0])}).then(m=>m.t.ipc.host.raycast.quit())`});
  } else if(process.argv[2]==='capture') {
    const result=await c.send('Page.captureScreenshot',{format:'png'});
    await fs.writeFile(process.argv[4],Buffer.from(result.data,'base64'));
  } else if(process.argv[2]==='open-video') {
    await c.send('Runtime.evaluate',{expression:`Array.from(document.querySelectorAll('[class*=standard-list-item__title_]')).find(e=>['下载视频','Download Video'].includes(e.textContent))?.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`});
  }
} finally {c.close();}
