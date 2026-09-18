import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { translateSource } from '../src/transform.mjs';
import {storeDisplayEdits} from '../src/store-transform.mjs';

const dictionary = JSON.parse(await fs.readFile('translations/zh-CN.json', 'utf8'));
Object.assign(dictionary,JSON.parse(await fs.readFile('translations/windows.json','utf8')));
Object.assign(dictionary,JSON.parse(await fs.readFile('translations/plugins-windows.json','utf8')));
Object.assign(dictionary,JSON.parse(await fs.readFile('translations/store.json','utf8')));
Object.assign(dictionary, {
  'Show in File Explorer': '在文件资源管理器中显示', 'Open in File Explorer': '在文件资源管理器中打开',
  'Windows Settings': 'Windows 设置', 'Launch at Login': '登录时启动',
  'Clipboard': '剪贴板', 'Appearance': '外观', 'Keybindings': '按键绑定',
  'Manage Extensions': '管理扩展', 'Installed Extensions': '已安装的扩展',
  'Search for apps and commands…': '搜索应用和命令…', 'Search for apps and commands...': '搜索应用和命令…'
});
const packageInfo = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command',
  "Get-AppxPackage Raycast.Raycast | Select-Object Version,InstallLocation,Architecture,PackageFamilyName | ConvertTo-Json -Compress"], {encoding:'utf8'}));
if (packageInfo.Version !== '2.4.0.0') throw new Error('Only Raycast 2.4.0.0 has been reviewed.');
const root = path.join(packageInfo.InstallLocation, 'Raycast');
const out = 'dist/Raycast-Windows-2.4.0.0-zh-CN-r2';
await fs.mkdir(out, { recursive: true });
const hash = data => createHash('sha256').update(data).digest('hex');
const manifest = { format: 1, patchVersion: '2.4.0.0-r2', appVersion: packageInfo.Version,
  architecture:'x64', family: packageInfo.PackageFamilyName, files: {},
  dictionaryEntries: Object.keys(dictionary).length, translatedOccurrences: 0 };
for (const name of (await fs.readdir(path.join(root, 'frontend'))).filter(x => x.endsWith('.js'))) {
  const original = await fs.readFile(path.join(root, 'frontend', name), 'utf8');
  const result = translateSource(original, dictionary);
  result.edits.push(...storeDisplayEdits(original));
  result.edits.sort((a,b)=>b.start-a.start);
  if (!result.edits.length) continue;
  manifest.files[name] = { sha256: hash(Buffer.from(original)), edits: result.edits.map(({value,...e})=>e) };
  manifest.translatedOccurrences += result.edits.length;
}
manifest.hostSha256 = hash(await fs.readFile(path.join(root, 'Raycast.dll')));
manifest.backendSha256 = hash(await fs.readFile(path.join(root, 'backend', 'index.mjs')));
manifest.nodeSha256 = hash(await fs.readFile(path.join(root, 'backend', 'node.exe')));
await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
await fs.writeFile(path.join(out, 'inject.js'), (await fs.readFile('src/inject.js','utf8')).replace('__DICTIONARY__', JSON.stringify(dictionary)));
const hookPath = path.resolve(out, 'NativeMenuHook.dll');
await fs.rm(hookPath, {force:true});
execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File','tools/compile-hook.ps1',
  '-Source',path.resolve('src/NativeMenuHook.cs'),'-Output',hookPath],{stdio:'pipe'});
manifest.nativeHookSha256=hash(await fs.readFile(hookPath));
await fs.copyFile('node_modules/acorn/dist/acorn.js',path.join(out,'acorn.cjs'));
await fs.copyFile('node_modules/acorn/LICENSE',path.join(out,'Acorn-LICENSE.txt'));
await fs.writeFile(path.join(out,'plugin-dictionary.json'),JSON.stringify(dictionary));
for(const file of ['plugin-patcher.cjs','plugin-transform.cjs','plugin-scopes.cjs']) await fs.copyFile('src/'+file,path.join(out,file));
await fs.rm(path.join(out,'plugin-loader.cjs'),{force:true});
await fs.copyFile('translations/extensions.json',path.join(out,'extensions.json'));
manifest.pluginFiles={};
for(const file of ['plugin-patcher.cjs','plugin-transform.cjs','plugin-scopes.cjs','plugin-dictionary.json','acorn.cjs','extensions.json']) manifest.pluginFiles[file]=hash(await fs.readFile(path.join(out,file)));
await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest,null,2));
for (const file of ['agent.mjs','launch.ps1','setup.ps1']) {
  const data=await fs.readFile(`src/${file}`);
  await fs.writeFile(path.join(out,file),file.endsWith('.ps1') ? Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),data]) : data);
}
for (const [label, mode] of [['安装汉化','install'],['卸载汉化','uninstall'],['检查状态','status']]) {
  await fs.writeFile(path.join(out, `${label}.cmd`), `@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" -Action ${mode}\r\nif errorlevel 1 echo Operation failed. See the message above.\r\npause\r\n`, 'ascii');
}
await fs.copyFile('README.md', path.join(out, '使用说明.md'));
await fs.copyFile('THIRD-PARTY-NOTICES.md', path.join(out, 'THIRD-PARTY-NOTICES.md'));
console.log(JSON.stringify({ output: out, files: Object.keys(manifest.files).length,
  translatedOccurrences: manifest.translatedOccurrences, dictionaryEntries: manifest.dictionaryEntries }, null, 2));
