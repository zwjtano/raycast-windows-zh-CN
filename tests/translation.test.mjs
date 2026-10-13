import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { translateSource } from '../src/transform.mjs';
import { applyEdits, CDP } from '../src/agent.mjs';

const dictionary={Cancel:'取消',Delete:'删除',Name:'名称',Tab:'标签页','Open Command':'打开命令',Command:'命令',Favorites:'收藏','AI Extension':'AI 扩展','AI Command':'AI 命令'};
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
const releases=JSON.parse(await fs.readFile(new URL('../translations/releases.json',import.meta.url),'utf8'));
const inject=(await fs.readFile(new URL('../src/inject.js',import.meta.url),'utf8')).replace('__DICTIONARY__',()=>JSON.stringify(dictionary)).replace('__RELEASES__',()=>JSON.stringify(releases));

for (const [version,release] of Object.entries(releases)) test(`reviewed release ${version} translates every block and restores its banner and markup`,()=>{
  const dom=new JSDOM(`<div data-is-base-view-root><header><span>${release.title}</span></header><div class="markdown__root_a"><img alt="image" src="${release.image}">${Object.keys(release.blocks).map(b=>`<p>${b}</p>`).join('')}<p>Unknown upstream content</p></div></div>`,{runScripts:'outside-only',pretendToBeVisual:true});
  const d=dom.window.document, original=d.body.innerHTML;
  dom.window.mainRouter={state:{location:{pathname:'/whats-new'}}};dom.window.eval(inject);
  assert.equal(d.querySelector('header').textContent,release.localizedTitle);
  assert.match(d.querySelector('img').src,/^data:image\/svg\+xml/);
  assert.deepEqual([...d.querySelectorAll('p')].slice(0,-1).map(e=>e.innerHTML),Object.values(release.blocks));
  assert.equal(d.querySelector('p:last-child').textContent,'Unknown upstream content');
  dom.window.__raycastZhCN.stop();assert.equal(d.body.innerHTML,original);dom.window.close();
});

test('release translation does not alter matching content on other routes',()=>{
  const release=releases['2.7.1.0'];const original=Object.keys(release.blocks)[0];
  const dom=new JSDOM(`<div class="markdown__root_a"><img src="${release.image}"><p>${original}</p></div>`,{runScripts:'outside-only',pretendToBeVisual:true});
  dom.window.mainRouter={state:{location:{pathname:'/ai-chat'}}};dom.window.eval(inject);
  assert.equal(dom.window.document.querySelector('p').textContent,original);
  assert.equal(dom.window.document.querySelector('img').src,release.image);dom.window.close();
});
test('2.7 search hint translates without changing typed text or its width sizer',()=>{
  const dom=new JSDOM('<span class="search-field-ui__placeholder_a">Name</span><span class="search-field-ui__widthSizer_a">Name</span><span class="search-field-ui__input_a" contenteditable="true">Name</span>',{runScripts:'outside-only',pretendToBeVisual:true});
  dom.window.eval(inject);const nodes=dom.window.document.querySelectorAll('span');
  assert.equal(nodes[0].textContent,'名称');assert.equal(nodes[1].textContent,'Name');assert.equal(nodes[2].textContent,'Name');
  dom.window.__raycastZhCN.stop();assert.equal(nodes[0].textContent,'Name');dom.window.close();
});
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

test('expanded root search translates AI type labels without renaming user commands',()=>{
  const dom=new JSDOM(['AI Extension','AI Command'].map(kind=>`<div class="standard-list-item__root_a"><span class="standard-list-item__title_a">Name</span><span class="standard-list-item__labelAccessory_a">${kind}</span></div>`).join(''),{runScripts:'outside-only',pretendToBeVisual:true});
  dom.window.mainRouter={state:{location:{pathname:'/'}}};dom.window.eval(inject);
  assert.deepEqual([...dom.window.document.querySelectorAll('[class*=labelAccessory]')].map(e=>e.textContent),['AI 扩展','AI 命令']);
  assert.deepEqual([...dom.window.document.querySelectorAll('[class*=title_]')].map(e=>e.textContent),['Name','Name']);dom.window.close();
});
