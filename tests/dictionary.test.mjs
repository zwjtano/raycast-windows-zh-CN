import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// JSON.parse silently keeps the last duplicate, so count the printed entries.
const flat=file=>{
  const text=fs.readFileSync(new URL('../translations/'+file,import.meta.url),'utf8');
  const keys=[...text.matchAll(/^ {2}"((?:[^"\\]|\\.)*)":/gm)].map(match=>JSON.parse('"'+match[1]+'"'));
  return {keys,dictionary:JSON.parse(text)};
};
test('each dictionary file holds one localised entry per display string',()=>{
  for(const file of ['zh-CN.json','windows.json','plugins-windows.json','store.json']){
    const {keys,dictionary}=flat(file);
    assert.equal(keys.length,Object.keys(dictionary).length,`${file}: unparsed or duplicate key`);
    assert.equal(new Set(keys).size,keys.length,`${file}: duplicate key`);
    for(const [key,value] of Object.entries(dictionary)){
      assert.ok(key.length>0&&value.length>0,`${file}: empty entry for ${JSON.stringify(key)}`);
      assert.notEqual(key,value,`${file}: ${JSON.stringify(key)} is not translated`);
    }
  }
});
test('reviewed releases stay complete, consistent and fully translated',()=>{
  const releases=JSON.parse(fs.readFileSync(new URL('../translations/releases.json',import.meta.url),'utf8'));
  for(const [version,release] of Object.entries(releases)){
    assert.equal(release.title,`What's new in v${version}?`);
    assert.equal(release.localizedTitle,`v${version} 更新内容`);
    assert.match(release.image,/^https:\/\/misc-assets\.raycast\.com\/releases\/[a-f0-9]+\.png$/);
    assert.ok(release.bannerSvg.startsWith('<svg '),`${version}: banner is not an SVG`);
    assert.ok(release.bannerSvg.includes(`>v${version.split('.').slice(0,2).join('.')}<`),`${version}: banner version`);
    const blocks=Object.entries(release.blocks);
    assert.ok(blocks.length>0,`${version}: no release blocks`);
    for(const [english,chinese] of blocks){
      assert.ok(english.length>0&&chinese.length>0,`${version}: empty block`);
      assert.ok(/\p{Script=Han}/u.test(chinese),`${version}: ${english.slice(0,60)} is not translated`);
      // Earlier releases drop <strong> and <code> on their own labels; markup is
      // never invented, and a link must survive so the block keeps working.
      const tags=english.match(/<\/?[a-z]+[^>]*>/g)??[];
      for(const tag of chinese.match(/<\/?[a-z]+[^>]*>/g)??[]) assert.ok(tags.includes(tag),`${version}: ${english.slice(0,60)} invented ${tag}`);
      for(const [anchor] of english.matchAll(/<a\b[^>]*>/g)) assert.ok(chinese.includes(anchor),`${version}: ${english.slice(0,60)} lost ${anchor}`);
    }
  }
});
