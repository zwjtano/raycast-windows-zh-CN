import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const source=path.resolve('extensions/bilibili-search');
const name='Bilibili-Search-Windows-zh-CN-v1.0.0';
const output=path.resolve('dist',name);
await fs.mkdir(output,{recursive:true});
await fs.cp(path.join(source,'dist'),path.join(output,'bundle'),{recursive:true});
await fs.writeFile(path.join(output,'install.ps1'),Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),await fs.readFile(path.join(source,'install.ps1'))]));
await fs.writeFile(path.join(output,'安装插件.cmd'),'@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"\r\npause\r\n','ascii');
for(const file of ['README.md','LICENSE','UPSTREAM.json'])await fs.copyFile(path.join(source,file),path.join(output,file));
const archive=output+'.zip',quote=value=>"'"+value.replaceAll("'","''")+"'";
execFileSync('powershell.exe',['-NoProfile','-Command',`Compress-Archive -LiteralPath ${quote(output)} -DestinationPath ${quote(archive)} -Force`]);
const hash=createHash('sha256').update(await fs.readFile(archive)).digest('hex');
await fs.writeFile(archive+'.sha256',hash+'  '+path.basename(archive)+'\n');
console.log(JSON.stringify({archive,sha256:hash}));
