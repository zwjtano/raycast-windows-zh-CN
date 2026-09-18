import { parse } from 'acorn';

// Translate display properties only. Never replace strings globally: the same
// English word can be an enum, an API parameter, a route, or a storage key.
const displayKeys = new Set(['title', 'subtitle', 'description', 'label',
  'placeholder', 'searchBarPlaceholder', 'navigationTitle', 'tooltip',
  'message', 'emptyStateTitle', 'emptyStateDescription', 'children']);
const options = { ecmaVersion: 'latest', sourceType: 'module' };
export function translateSource(source, dictionary) {
  const ast = parse(source, options);
  const edits = [];
  function literal(n) {
    if (n.type === 'Literal' && typeof n.value === 'string') return n.value;
    if (n.type === 'TemplateLiteral' && !n.expressions.length) return n.quasis[0].value.cooked;
    return null;
  }
  function display(n, key) {
    const value = literal(n);
    if (value !== null) {
      if (key === 'children' && ['Tab','Space','Enter','Esc','Ctrl','Alt','Shift'].includes(value)) return;
      const translated = Object.hasOwn(dictionary, value) ? dictionary[value] : null;
      if (translated && translated !== value) edits.push({ start: n.start, end: n.end,
        original: source.slice(n.start, n.end), replacement: JSON.stringify(translated), value });
    } else if (n.type === 'ConditionalExpression') { display(n.consequent,key); display(n.alternate,key); }
    else if (n.type === 'ArrayExpression') n.elements.filter(Boolean).forEach(x=>display(x,key));
  }
  function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'Property' && !n.computed && n.kind === 'init' && displayKeys.has(n.key.name ?? n.key.value)) display(n.value,n.key.name ?? n.key.value);
    for (const value of Object.values(n)) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value.type === 'string') walk(value);
    }
  }
  walk(ast);
  const unique = [...new Map(edits.map(e => [e.start, e])).values()].sort((a, b) => b.start - a.start);
  let output = source;
  for (const e of unique) output = output.slice(0, e.start) + e.replacement + output.slice(e.end);
  parse(output, options);
  return { output, edits: unique };
}
