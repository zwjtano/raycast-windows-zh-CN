import test from 'node:test';import assert from 'node:assert/strict';
import {storeDisplayEdits}from'../src/store-transform.mjs';
import {parse}from'acorn';
test('Store data descriptions are translated only at reviewed render expressions',()=>{
 const source='function X(e){const request={description:e.description};return jsx(Row,{children:[e.title,e.description],id:e.title})}X.displayName="SearchStoreListItem";function Other(e){return jsx(Row,{children:e.description})}';
 const edits=storeDisplayEdits(source);assert.equal(edits.length,2);
 let output=source;for(const e of edits)output=output.slice(0,e.start)+e.replacement+output.slice(e.end);
 parse(output,{ecmaVersion:'latest'});assert.match(output,/description:e.description/);assert.match(output,/id:e.title/);assert.match(output,/function Other\(e\)\{return jsx\(Row,\{children:e.description\}\)\}/);
});
