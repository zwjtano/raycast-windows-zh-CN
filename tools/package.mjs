import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const name='Raycast-Windows-2.4.0.0-zh-CN-r2',folder=path.resolve('dist',name),archive=path.resolve('dist',name+'.zip');
await fs.access(path.join(folder,'manifest.json'));
// Quote PowerShell literal strings, including apostrophes in workspace names.
const quote=s=>"'"+s.replaceAll("'","''")+"'";
execFileSync('powershell.exe',['-NoProfile','-Command',`Compress-Archive -LiteralPath ${quote(folder)} -DestinationPath ${quote(archive)} -Force`]);
const hash=createHash('sha256').update(await fs.readFile(archive)).digest('hex');
await fs.writeFile(archive+'.sha256',hash+'  '+path.basename(archive)+'\n');
console.log(JSON.stringify({archive,sha256:hash}));
