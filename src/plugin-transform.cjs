// Adapted from zwjtano/raycast-zh-CN macOS r4 display-only transformer.
function __rcLiteralDisplayTransform(source,parser,lookup){return (function translate(source,parser,lookup){
 const ast=parser.parse(source,{ecmaVersion:'latest',sourceType:'script',allowReturnOutsideFunction:true});
 const nodes=[],scopeOf=new WeakMap();
 const top={parent:null,bindings:new Map(),functionScope:true};
 const children=n=>Object.values(n).flatMap(v=>Array.isArray(v)?v.filter(x=>x&&typeof x.type==='string'):v&&typeof v.type==='string'?[v]:[]);
 const names=(p,out=[])=>{if(!p)return out;if(p.type==='Identifier')out.push(p.name);else if(p.type==='RestElement')names(p.argument,out);else if(p.type==='AssignmentPattern')names(p.left,out);else if(p.type==='ObjectPattern')for(const x of p.properties)names(x.value||x.argument,out);else if(p.type==='ArrayPattern')for(const x of p.elements)names(x,out);return out};
 const bind=(scope,name,value)=>scope.bindings.set(name,value);
 function visit(n,parentScope){let scope=parentScope;
  if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(n.type)){
   if(n.type==='FunctionDeclaration'&&n.id)bind(parentScope,n.id.name,null);
   scope={parent:parentScope,bindings:new Map(),functionScope:true};if(n.id)bind(scope,n.id.name,null);for(const p of n.params)for(const name of names(p))bind(scope,name,null);
  }else if(['BlockStatement','CatchClause','ForStatement','ForOfStatement','ForInStatement'].includes(n.type)){scope={parent:parentScope,bindings:new Map()};if(n.type==='CatchClause')for(const name of names(n.param))bind(scope,name,null);}
  scopeOf.set(n,scope);nodes.push(n);
  if(n.type==='VariableDeclaration')for(const d of n.declarations){let target=scope;if(n.kind==='var')while(!target.functionScope)target=target.parent;for(const name of names(d.id))bind(target,name,d.id.type==='Identifier'?d.init:null);}
  if(n.type==='ClassDeclaration'&&n.id)bind(scope,n.id.name,null);
  for(const c of children(n))visit(c,scope);
 }
 visit(ast,top);
 // A reassigned import alias is no longer a reliable component identity.
 for(const n of nodes){const id=n.type==='AssignmentExpression'?n.left:n.type==='UpdateExpression'?n.argument:null;if(id?.type==='Identifier')for(let s=scopeOf.get(n);s;s=s.parent)if(s.bindings.has(id.name)){s.bindings.set(id.name,null);break;}}
 function moduleOf(init){if(!init||init.type!=='CallExpression')return null;if(init.callee.type==='Identifier'&&init.callee.name==='require'&&init.arguments.length===1&&typeof init.arguments[0].value==='string'){for(let s=scopeOf.get(init);s;s=s.parent)if(s.bindings.has('require'))return null;return init.arguments[0].value;}
  // Bundlers commonly wrap require in __toESM(require(...)).
  if(init.arguments.length<=2&&init.arguments[0]?.type==='CallExpression')return moduleOf(init.arguments[0]);return null;
 }
 function binding(id,at){for(let s=scopeOf.get(at);s;s=s.parent)if(s.bindings.has(id))return moduleOf(s.bindings.get(id));return null}
 function member(n){const parts=[];while(n?.type==='MemberExpression'&&!n.computed){parts.unshift(n.property.name);n=n.object}return n?.type==='Identifier'?{root:n.name,parts}:null}
 const keys=new Set(['title','subtitle','description','placeholder','searchBarPlaceholder','navigationTitle','label','info','tooltip','text']);
 const edits=[];
 function displayValue(v){
  if(!v)return;const plain=v.type==='Literal'&&typeof v.value==='string'?v.value:v.type==='TemplateLiteral'&&v.expressions.length===0?v.quasis[0].value.cooked:null;
  if(plain===null)return;const translation=lookup(plain);if(typeof translation==='string'&&translation!==plain)edits.push({start:v.start,end:v.end,source:plain,translation});
 }
 function noticeProps(props){
  if(props?.type!=='ObjectExpression')return;
  for(const p of props.properties){if(p.type!=='Property'||p.computed||p.kind!=='init')continue;const key=p.key.name??p.key.value;
   if(['title','message'].includes(key))displayValue(p.value);
   if(['primaryAction','dismissAction'].includes(key))noticeProps(p.value);
  }
 }
 for(const n of nodes){if(n.type!=='CallExpression')continue;let callee=n.callee;if(callee.type==='SequenceExpression')callee=callee.expressions.at(-1);const call=member(callee),component=member(n.arguments[0]);if(!call)continue;
  const noticeModule=binding(call.root,n),noticeKind=call.parts.at(-1);
  if(noticeModule==='@raycast/api'&&call.parts.length===1){
   if(['showToast','confirmAlert'].includes(noticeKind))noticeProps(n.arguments[0]);
   if(noticeKind==='showHUD')displayValue(n.arguments[0]);
  }
  if(noticeModule==='@raycast/utils'&&noticeKind==='showFailureToast'&&call.parts.length===1)noticeProps(n.arguments[1]);
  if(!component)continue;
  const kind=call.parts.at(-1),runtime=binding(call.root,n);if(!(['jsx','jsxs','jsxDEV'].includes(kind)&&['react/jsx-runtime','react/jsx-dev-runtime'].includes(runtime))&&!(kind==='createElement'&&runtime==='react'))continue;
  if(binding(component.root,n)!=='@raycast/api'||!component.parts.length)continue;
  const props=n.arguments[1];if(props?.type!=='ObjectExpression')continue;
  for(const p of props.properties){if(p.type!=='Property'||p.computed||p.kind!=='init')continue;const key=p.key.name??p.key.value;if(!keys.has(key))continue;const v=p.value;
   const plain=v.type==='Literal'&&typeof v.value==='string'?v.value:v.type==='TemplateLiteral'&&v.expressions.length===0?v.quasis[0].value.cooked:null;
   if(plain===null)continue;const translated=lookup(plain);if(typeof translated!=='string'||translated===plain)continue;edits.push({start:v.start,end:v.end,source:plain,translation:translated});
  }
 }
 edits.sort((a,b)=>b.start-a.start);let output=source;for(const e of edits)output=output.slice(0,e.start)+JSON.stringify(e.translation)+output.slice(e.end);
 parser.parse(output,{ecmaVersion:'latest',sourceType:'script',allowReturnOutsideFunction:true});return {output,edits};
})(source,parser,lookup)}

module.exports = __rcLiteralDisplayTransform;
