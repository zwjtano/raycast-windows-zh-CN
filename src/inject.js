/* Runs only in Raycast's own local WebView, with a reviewed static dictionary. */
(() => {
  if (window.__raycastZhCN) return;
  const dictionary = __DICTIONARY__;
  const releases = __RELEASES__;
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
    // Only reviewed Raycast release pages qualify, never arbitrary Markdown or chats.
    const route = window.mainRouter?.state?.location?.pathname;
    if (route === '/whats-new' || /^\/changelog\/[^/]+$/.test(route || '')) {
      for (const release of Object.values(releases)) {
        const banner = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(release.bannerSvg);
        for (const markdown of root.querySelectorAll('[class*="markdown__root_"]')) {
          const img = [...markdown.querySelectorAll('img')].find(e => [release.image, banner].includes(e.getAttribute('src')));
          if (!img || markdown.closest(excluded)) continue;
          if (img.getAttribute('src') === release.image) {
            keep(img, 'src', release.image, banner); img.setAttribute('src', banner);
            const alt = img.getAttribute('alt');
            keep(img, 'alt', alt, '新增系统操作'); img.setAttribute('alt', '新增系统操作');
          }
          const view = markdown.closest('[data-is-base-view-root]');
          for (const title of view?.querySelectorAll('header span') || []) {
            if (title.textContent === release.title && title.childNodes.length === 1) {
              keep(title.firstChild, 'text', release.title, release.localizedTitle);
              title.firstChild.nodeValue = release.localizedTitle;
            }
          }
          for (const block of markdown.querySelectorAll('p,h2,li')) {
            if (block.closest(excluded)) continue;
            const original = block.innerHTML, translated = release.blocks[original];
            if (translated) { keep(block, 'html', original, translated); block.innerHTML = translated; }
          }
        }
      }
    }
    for (const element of root.querySelectorAll('[placeholder],[aria-label],[title]')) {
      if (element.closest('pre,code,[contenteditable],.tiptap,.ProseMirror')) continue;
      for (const attr of attributes) {
        const value = element.getAttribute(attr), next = translate(value);
        if (value !== next) { keep(element, attr, value, next); element.setAttribute(attr, next); }
      }
    }
    const elements = [...root.querySelectorAll(controls)];
    // Raycast 2.7 renders its empty search hint as a span, not an input attribute.
    // Only the explicit placeholder is eligible; typed text and width sizers stay untouched.
    elements.push(...root.querySelectorAll('[class*="search-field-ui__placeholder_"]'));
    // This host-provided settings section is not an installed app's name.
    for(const label of root.querySelectorAll('[class*="settings-window-view__navlink_"] span')) {
      if(label.textContent.trim()==='Windows Settings') elements.push(label);
    }
    if(route === '/' || root.querySelector('[class*="root-search-nav-hint__"]')) {
      elements.push(...root.querySelectorAll('[class*="list__sectionHeaderTitle_"]'));
      for(const item of root.querySelectorAll('[class*="standard-list-item__root_"]')) {
        const kind=item.querySelector('[class*="standard-list-item__labelAccessory_"]');
        if(kind && ['AI Extension','AI Command','AI 扩展','AI 命令'].includes(kind.textContent.trim())) elements.push(kind);
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
        else if (key === 'html') { if (node.innerHTML === value.translated) node.innerHTML = value.original; }
        else if (node.getAttribute(key) === value.translated) {
          if (value.original === null) node.removeAttribute(key); else node.setAttribute(key, value.original);
        }
      }
      originals.clear(); delete window.__raycastZhCN;
    }
  };
  if (document.documentElement) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
