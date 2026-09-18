import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const acorn=require('acorn');
const transform=require('../src/plugin-transform.cjs');
const patcher=require('../src/plugin-patcher.cjs');
const dictionary={Name:'名称',Cancel:'取消',Delete:'删除','Download Video':'下载视频'};
const lookup=v=>dictionary[v]||v;
test('extension transformer changes API display props, never field IDs or custom component content',()=>{
  const source='var api=require("@raycast/api"),r=require("react/jsx-runtime");r.jsx(api.Form.TextField,{id:"Name",title:"Name",value:"Name",placeholder:"Name"});r.jsx(Custom,{title:"Name"});';
  const r=transform(source,acorn,lookup);assert.equal(r.edits.length,2);
  assert.match(r.output,/id:"Name",title:"名称",value:"Name",placeholder:"名称"/);
  assert.match(r.output,/r.jsx\(Custom,\{title:"Name"\}\)/);
});
test('notices translate literal display text without changing callbacks or live errors',()=>{
  const source='var api=require("@raycast/api"),utils=require("@raycast/utils");api.showToast({title:"Cancel",message:error.message,style:"Cancel"});api.confirmAlert({title:"Delete",primaryAction:{title:"Delete",onAction:run}});api.showHUD("Name");utils.showFailureToast(error,{title:"Cancel"});';
  const r=transform(source,acorn,lookup);assert.equal(r.edits.length,5);assert.match(r.output,/style:"Cancel"/);assert.match(r.output,/message:error.message/);assert.match(r.output,/onAction:run/);
});
test('shadowed and reassigned API imports are not trusted',()=>{
  const source='var api=require("@raycast/api"),r=require("react/jsx-runtime");function f(api){r.jsx(api.Form,{title:"Name"})}api=custom;r.jsx(api.Form,{title:"Name"});';
  assert.equal(transform(source,acorn,lookup).edits.length,0);
});
function fixture(t) {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'raycast-zh-test-'));
  t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const install=path.join(temp,'install'),bundle=path.join(install,'bundle'),root=path.join(temp,'extensions'),folder=path.join(root,'uuid');
  fs.mkdirSync(bundle,{recursive:true});fs.mkdirSync(folder,{recursive:true});
  fs.copyFileSync('node_modules/acorn/dist/acorn.js',path.join(bundle,'acorn.cjs'));
  fs.writeFileSync(path.join(bundle,'extensions.json'),JSON.stringify([{name:'video-downloader'}]));
  fs.writeFileSync(path.join(bundle,'plugin-dictionary.json'),JSON.stringify(dictionary));
  fs.writeFileSync(path.join(folder,'package.json'),JSON.stringify({name:'video-downloader',commands:[{name:'index'}]}));
  const file=path.join(folder,'index.js'),original='var api=require("@raycast/api"),r=require("react/jsx-runtime");r.jsx(api.Action,{title:"Download Video"});';
  fs.writeFileSync(file,original);fs.utimesSync(file,0,0);
  return {install,file,original,options:{roots:[root],bundle}};
}
test('plugin apply is idempotent and uninstall restores exact original bytes',t=>{
  const f=fixture(t);assert.equal(patcher.apply(f.install,f.options).extensions['video-downloader'],1);
  const first=fs.readFileSync(f.file,'utf8');assert.match(first,/下载视频/);
  patcher.apply(f.install,f.options);assert.equal(fs.readFileSync(f.file,'utf8'),first);
  assert.equal(patcher.restore(f.install,f.options).restored,1);assert.equal(fs.readFileSync(f.file,'utf8'),f.original);
});
test('uninstall preserves upstream updates and refuses manual changes to patched files',t=>{
  const f=fixture(t);patcher.apply(f.install,f.options);fs.appendFileSync(f.file,'\n// user edit');
  assert.deepEqual(patcher.restore(f.install,f.options).conflicts,['video-downloader']);
  assert.match(fs.readFileSync(f.file,'utf8'),/user edit/);
  fs.writeFileSync(f.file,f.original+'\n// upstream update');
  const r=patcher.restore(f.install,f.options);assert.deepEqual(r.preservedUpdates,['video-downloader']);assert.match(fs.readFileSync(f.file,'utf8'),/upstream update/);
});
test('new plugin versions get a new backup and restore to the new original',t=>{
  const f=fixture(t);patcher.apply(f.install,f.options);const update=f.original+'\n// next version';
  fs.writeFileSync(f.file,update);fs.utimesSync(f.file,0,0);patcher.apply(f.install,f.options);patcher.restore(f.install,f.options);assert.equal(fs.readFileSync(f.file,'utf8'),update);
});
test('unlisted plugins and traversal command names are skipped',t=>{
  const f=fixture(t);fs.writeFileSync(path.join(path.dirname(f.file),'package.json'),JSON.stringify({name:'unlisted',commands:[{name:'index'},{name:'../escape'}]}));
  assert.deepEqual(patcher.apply(f.install,f.options).extensions,{});assert.equal(fs.readFileSync(f.file,'utf8'),f.original);
});
