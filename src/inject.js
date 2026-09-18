/* Runs only in Raycast's own local WebView, with a reviewed static dictionary. */
(() => {
  if (window.__raycastZhCN) return;
  const dictionary = __DICTIONARY__;
  const originals = new Map();
  const attributes = ['placeholder', 'aria-label', 'title'];
  const excluded = 'input,textarea,pre,code,kbd,script,style,[class*="shortcut__"],[class*="hotkey"],[contenteditable],.tiptap,.ProseMirror,[data-raycast-zh-skip]';
  const controls = 'button,label,option,[role="button"],[role="menuitem"],[role="tab"],h1,h2,h3';
  let count = 0, scheduled = false, enabled = true;
  function translate(value) {
    if (typeof value !== 'string') return value;
    const key = value.trim();
    return Object.hasOwn(dictionary, key) ? value.replace(key, dictionary[key]) : value;
  }
  function keep(node, key, original, translated) {
    let entry = originals.get(node);
    if (!entry) originals.set(node, entry = new Map());
    entry.set(key, { original, translated });
    count++;
  }
  function visit(root) {
    if (!enabled || !root) return;
    // Prune removed React nodes so the resident translation layer cannot leak.
    for (const node of originals.keys()) if (!node.isConnected) originals.delete(node);
    for (const element of root.querySelectorAll('[placeholder],[aria-label],[title]')) {
      if (element.closest('pre,code,[contenteditable],.tiptap,.ProseMirror')) continue;
      for (const attr of attributes) {
        const value = element.getAttribute(attr), next = translate(value);
        if (value !== next) { keep(element, attr, value, next); element.setAttribute(attr, next); }
      }
    }
    const elements = [...root.querySelectorAll(controls)];
    // This host-provided settings section is not an installed app's name.
    for(const label of root.querySelectorAll('[class*="settings-window-view__navlink_"] span')) {
      if(label.textContent.trim()==='Windows Settings') elements.push(label);
    }
    if(root.querySelector('[class*="root-search-nav-hint__"]')) {
      elements.push(...root.querySelectorAll('[class*="list__sectionHeaderTitle_"]'));
      for(const item of root.querySelectorAll('[class*="standard-list-item__root_"]')) {
        const kind=item.querySelector('[class*="standard-list-item__labelAccessory_"]');
        if(kind && ['Command','命令','Windows Settings','Windows 设置'].includes(kind.textContent.trim())) {
          elements.push(kind);
          const title=item.querySelector('[class*="standard-list-item__title_"]');
          if(title) elements.push(title);
        }
      }
    }
    for (const element of elements) {
      if (element.closest(excluded)) continue;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.parentElement.closest(excluded)) continue;
        const value = node.nodeValue, next = translate(value);
        if (next !== value) { keep(node, 'text', value, next); node.nodeValue = next; }
      }
    }
  }
  const observer = new MutationObserver(() => {
    if (scheduled || !enabled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; visit(document); });
  });
  function start() {
    document.documentElement.lang = 'zh-CN';
    visit(document);
    observer.observe(document.documentElement, { subtree: true, childList: true,
      characterData: true, attributes: true, attributeFilter: attributes });
  }
  window.__raycastZhCN = {
    storeText(value) { return typeof value==='string' && Object.hasOwn(dictionary,value) ? dictionary[value] : value; },
    version: '0.1.0', get translatedControls() { return count; },
    stop() {
      enabled = false; observer.disconnect();
      for (const [node, entries] of originals) for (const [key, value] of entries) {
        if (key === 'text') { if (node.nodeValue === value.translated) node.nodeValue = value.original; }
        else if (node.getAttribute(key) === value.translated) node.setAttribute(key, value.original);
      }
      originals.clear(); delete window.__raycastZhCN;
    }
  };
  if (document.documentElement) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
