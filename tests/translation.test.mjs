import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { translateSource } from '../src/transform.mjs';
import { applyEdits, CDP } from '../src/agent.mjs';

const dictionary={Cancel:'取消',Delete:'删除',Name:'名称',Tab:'标签页','Open Command':'打开命令',Command:'命令',Favorites:'收藏'};
test('display translations preserve enum values, keys, imports and user data',()=>{
  const input='import x from "Cancel"; const Cancel="Cancel"; const a={title:"Cancel",value:"Cancel",name:"Cancel",id:"Cancel",url:"Cancel",children:["Delete",f()]}; if(x==="Cancel")run("Cancel");';
  const {output,edits}=translateSource(input,dictionary);
  assert.equal(edits.length,2);
  assert.match(output,/title:"取消"/);assert.match(output,/children:\["删除",f\(\)\]/);
  assert.match(output,/value:"Cancel",name:"Cancel",id:"Cancel",url:"Cancel"/);
  assert.match(output,/if\(x==="Cancel"\)run\("Cancel"\)/);
});
test('templates with expressions and conditional predicates are preserved',()=>{
  const {output}=translateSource('const a={title:x==="Cancel"?"Delete":"Cancel",description:`Name ${user}`,label:`Name`};',dictionary);
  assert.match(output,/x==="Cancel"\?"删除":"取消"/);assert.match(output,/description:`Name \$\{user\}`/);assert.match(output,/label:"名称"/);
});
test('keyboard cap names remain unchanged even when used as component children',()=>{
  const {output}=translateSource('const a={children:"Tab",title:"Tab"};',dictionary);
  assert.equal(output,'const a={children:"Tab",title:"标签页"};');
});
test('fingerprints and original text are required before applying edits',()=>{
  const source='const a={title:"Cancel"};';
  const {edits,output}=translateSource(source,dictionary);
  const entry={sha256:createHash('sha256').update(source).digest('hex'),edits};
  assert.equal(applyEdits(source,entry),output);
  assert.throws(()=>applyEdits(source+';',entry),/fingerprint/);
  assert.throws(()=>applyEdits(source,{...entry,edits:[{...edits[0],original:'wrong'}]}),/offset/);
});
test('debug connections cannot target the network',()=>{
  assert.throws(()=>new CDP('ws://example.com:1234/test'),/loopback/);
  assert.throws(()=>new CDP('wss://127.0.0.1:1234/test'),/loopback/);
});
const inject=(await fs.readFile(new URL('../src/inject.js',import.meta.url),'utf8')).replace('__DICTIONARY__',JSON.stringify(dictionary));
test('dynamic controls translate without changing input values, drafts or shortcut keys',()=>{
  const dom=new JSDOM('<button>Cancel<kbd>Tab</kbd></button><input placeholder="Name" value="Name"><textarea>Delete</textarea><div contenteditable="true"><button>Cancel</button></div><pre>Delete</pre><div id="data">Delete</div>',{runScripts:'outside-only',pretendToBeVisual:true});
  dom.window.eval(inject);const d=dom.window.document;
  assert.equal(d.querySelector('button').textContent,'取消Tab');
  assert.equal(d.querySelector('input').value,'Name');assert.equal(d.querySelector('input').placeholder,'名称');
  assert.equal(d.querySelector('textarea').value,'Delete');assert.equal(d.querySelector('[contenteditable]').textContent,'Cancel');
  assert.equal(d.querySelector('pre').textContent,'Delete');assert.equal(d.querySelector('#data').textContent,'Delete');
  dom.window.__raycastZhCN.stop();assert.equal(d.querySelector('button').textContent,'CancelTab');assert.equal(d.querySelector('input').placeholder,'Name');dom.window.close();
});
test('React-style updates translate again and uninstall preserves subsequent user changes',async()=>{
  const dom=new JSDOM('<button>Cancel</button>',{runScripts:'outside-only',pretendToBeVisual:true});dom.window.eval(inject);
  const b=dom.window.document.querySelector('button');b.firstChild.nodeValue='Delete';
  await new Promise(resolve=>setTimeout(resolve,60));assert.equal(b.textContent,'删除');
  b.firstChild.nodeValue='My new label';dom.window.__raycastZhCN.stop();assert.equal(b.textContent,'My new label');dom.window.close();
});
test('root search translates commands, preserves application names',()=>{
  const dom=new JSDOM('<div class="root-search-nav-hint__test"></div><div class="standard-list-item__root_a"><span class="standard-list-item__title_a">Cancel</span><span class="standard-list-item__labelAccessory_a">Application</span></div><div class="standard-list-item__root_a"><span class="standard-list-item__title_a">Open Command</span><span class="standard-list-item__labelAccessory_a">Command</span></div>',{runScripts:'outside-only',pretendToBeVisual:true});dom.window.eval(inject);
  const titles=dom.window.document.querySelectorAll('[class*="standard-list-item__title_"]');assert.equal(titles[0].textContent,'Cancel');assert.equal(titles[1].textContent,'打开命令');dom.window.close();
});
