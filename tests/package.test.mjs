import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse } from 'acorn';
import { applyEdits, mainWindowModules } from '../src/agent.mjs';

const name='Raycast-Windows-2.12.1.0-zh-CN-r1', folder=path.resolve('dist',name);
const manifest=fs.existsSync(path.join(folder,'manifest.json'))?JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8')):null;
// Only a machine with the reviewed build installed can replay the real bundle.
function installedRoot(){
  if(!manifest||process.platform!=='win32')return null;
  try {
    const info=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command','Get-AppxPackage Raycast.Raycast|Select-Object Version,InstallLocation|ConvertTo-Json -Compress'],{encoding:'utf8'}));
    return info.Version===manifest.appVersion?path.join(info.InstallLocation,'Raycast'):null;
  } catch { return null; }
}
const root=installedRoot();
test('packaged manifest keeps edits ordered, in range and non-overlapping',{skip:!manifest},()=>{
  assert.equal(manifest.appVersion,'2.12.1.0');
  assert.equal(manifest.patchVersion,'2.12.1.0-r1');
  for(const [file,entry] of Object.entries(manifest.files)){
    assert.match(entry.sha256,/^[a-f0-9]{64}$/,file);
    let previous=Infinity;
    for(const edit of entry.edits){
      assert.ok(Number.isInteger(edit.start)&&Number.isInteger(edit.end),`${file}: integer offsets`);
      assert.ok(edit.start>=0&&edit.end>edit.start&&edit.end<=previous,`${file}: descending non-overlapping edits`);
      assert.equal(typeof edit.original,'string',`${file}: original text`);
      assert.equal(typeof edit.replacement,'string',`${file}: replacement text`);
      previous=edit.start;
    }
  }
});
test('every packaged edit applies to the installed frontend and still parses',{skip:!root},()=>{
  let files=0,edits=0;
  for(const [file,entry] of Object.entries(manifest.files)){
    const source=fs.readFileSync(path.join(root,'frontend',file),'utf8');
    const patched=applyEdits(source,entry);
    parse(patched,{ecmaVersion:'latest',sourceType:'module'});
    assert.match(patched,/\p{Script=Han}/u,`${file}: no translated text`);
    files++;edits+=entry.edits.length;
  }
  assert.equal(files,Object.keys(manifest.files).length);
  assert.equal(edits,manifest.translatedOccurrences);
});
test('packaged shutdown finds the main window bundle it translated',{skip:!root},()=>{
  const html=fs.readFileSync(path.join(root,'frontend','main-window.html'),'utf8');
  const modules=mainWindowModules(html,manifest);
  assert.equal(modules.length,1);
  assert.match(modules[0],/^startup-.*\.js$/);
  const source=fs.readFileSync(path.join(root,'frontend',modules[0]),'utf8');
  assert.equal(applyEdits(source,manifest.files[modules[0]]).length>0,true);
});
