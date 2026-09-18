import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

test('Explorer and packaged launchers resolve legacy installations; new installs avoid LocalAppData redirection', {skip:process.platform!=='win32'}, () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'raycast-location-'));
  try {
    const source=fs.readFileSync('src/setup.ps1','utf8');
    const prefix=source.slice(source.indexOf("$ErrorActionPreference="),source.indexOf('$markerPath='));
    const script=path.join(root,'resolve.ps1');
    fs.writeFileSync(script,'\ufeff'+prefix+'\n[Console]::Write($installRoot)', 'utf8');
    const local=path.join(root,'AppData','Local');
    const resolve=()=>execFileSync('powershell.exe',['-NoProfile','-File',script],{cwd:os.tmpdir(),encoding:'utf8',env:{...process.env,USERPROFILE:root,LOCALAPPDATA:local}}).trim();
    const mark=p=>{fs.mkdirSync(p,{recursive:true});fs.writeFileSync(path.join(p,'installation.json'),JSON.stringify({product:'Raycast-zh-CN-Windows'}));};
    assert.equal(resolve(),path.join(root,'.raycast-zh-CN'));
    const legacy=path.join(local,'Raycast-zh-CN');mark(legacy);
    assert.equal(resolve(),legacy);
    const redirected=path.join(local,'Packages','OpenAI.Codex_test','LocalCache','Local','Raycast-zh-CN');mark(redirected);
    assert.equal(resolve(),redirected);
    const current=path.join(root,'.raycast-zh-CN');mark(current);
    assert.equal(resolve(),current);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
