import {parse} from 'acorn';
// Match reviewed Store components by their preserved React displayName. Only
// render expressions are wrapped; server responses and search data stay intact.
export function storeDisplayEdits(source) {
  if(!source.includes('SearchStoreListItem')&&!source.includes('SearchStoreDetailView'))return [];
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),names=new Set(),edits=[];
  const children=n=>Object.values(n).flatMap(v=>Array.isArray(v)?v.filter(x=>x&&typeof x.type==='string'):v&&typeof v.type==='string'?[v]:[]);
  function walk(n,fn){fn(n);for(const c of children(n))walk(c,fn);}
  const string=n=>n.type==='Literal'?n.value:n.type==='TemplateLiteral'&&!n.expressions.length?n.quasis[0].value.cooked:null;
  walk(ast,n=>{if(n.type==='AssignmentExpression'&&n.left.type==='MemberExpression'&&!n.left.computed&&n.left.object.type==='Identifier'&&n.left.property.name==='displayName'&&['SearchStoreListItem','SearchStoreDetailView'].includes(string(n.right)))names.add(n.left.object.name);});
  function display(n){
    if(n.type==='ArrayExpression'){n.elements.filter(Boolean).forEach(display);return;}
    if(n.type!=='MemberExpression'||n.computed||!['title','description'].includes(n.property.name))return;
    const original=source.slice(n.start,n.end);
    edits.push({start:n.start,end:n.end,original,replacement:`(window.__raycastZhCN?.storeText(${original})??${original})`});
  }
  walk(ast,n=>{if(n.type==='FunctionDeclaration'&&names.has(n.id?.name))walk(n.body,p=>{if(p.type==='Property'&&!p.computed&&['children','label'].includes(p.key.name??p.key.value))display(p.value);});});
  return [...new Map(edits.map(e=>[e.start,e])).values()].sort((a,b)=>b.start-a.start);
}
