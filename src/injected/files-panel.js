const FILES_PANEL_CSS = `
.dshc-fp { display:none; position:fixed; top:32px; right:0; bottom:0; width:320px;
  flex-direction:column; z-index:2147483645; font-family:"Segoe UI","Microsoft YaHei",sans-serif;
  overflow:hidden; user-select:none; }
.dshc-fp-open { display:flex; }
.dshc-fp-bar { display:flex; align-items:center; height:32px; padding:0 8px;
  border-bottom:1px solid var(--dshc-border); flex-shrink:0; gap:2px; }
.dshc-fp-bar-icon { width:16px; height:16px; margin-right:4px; flex-shrink:0;
  background:currentColor; -webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M2 1.5A1.5 1.5 0 0 0 .5 3v10A1.5 1.5 0 0 0 2 14.5h12a1.5 1.5 0 0 0 1.5-1.5V5.91a1.5 1.5 0 0 0-.44-1.06l-2.91-2.91A1.5 1.5 0 0 0 11.09 1.5H2z'/%3E%3C/svg%3E") no-repeat center/contain;
  -webkit-mask-repeat:no-repeat; -webkit-mask-position:center; -webkit-mask-size:contain; }
.dshc-fp-bar-title { flex:1; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dshc-fp-bar-btns { display:flex; gap:1px; flex-shrink:0; }
.dshc-fp-bar-btn { -webkit-app-region:no-drag; border:1px solid transparent; border-radius:4px;
  width:24px; height:24px; cursor:pointer; background:transparent;
  display:flex; align-items:center; justify-content:center; font-size:12px; line-height:1;
  color:var(--dshc-muted); padding:0; }
.dshc-fp-bar-btn:hover { background:var(--dshc-hover-bg); color:inherit; }
.dshc-fp-bar-btn-close:hover { background:rgb(196,43,28); color:#fff; }
html[data-dshc-theme="dark"] .dshc-fp-bar-btn-close:hover { background:rgb(224,60,49); color:#fff; }

.dshc-fp-tabs { display:flex; align-items:center; height:28px; padding:0 0 0 4px;
  border-bottom:1px solid var(--dshc-border); flex-shrink:0; overflow-x:auto; gap:0; }
.dshc-fp-tabs::-webkit-scrollbar { height:2px; }
.dshc-fp-tab { -webkit-app-region:no-drag; display:flex; align-items:center; gap:4px;
  height:100%; padding:0 6px; font-size:11px; cursor:pointer; white-space:nowrap;
  border:1px solid transparent; border-bottom:none; background:transparent; color:var(--dshc-muted);
  border-radius:4px 4px 0 0; flex-shrink:0; }
.dshc-fp-tab:hover { color:inherit; }
.dshc-fp-tab-active { color:inherit; background:var(--dshc-tab-active-bg); }
.dshc-fp-tab-close { -webkit-app-region:no-drag; border:none; background:transparent;
  cursor:pointer; width:16px; height:16px; border-radius:3px; display:flex;
  align-items:center; justify-content:center; font-size:10px; line-height:1; padding:0;
  color:var(--dshc-muted); flex-shrink:0; }
.dshc-fp-tab-close:hover { background:var(--dshc-hover-bg); color:inherit; }

.dshc-fp-body { flex:1; overflow:auto; }
.dshc-fp-tree { padding:4px 0; }
.dshc-fp-tree-item { display:flex; align-items:center; gap:4px; padding:2px 8px;
  cursor:pointer; font-size:12px; white-space:nowrap; }
.dshc-fp-tree-item:hover { background:var(--dshc-hover-bg); }
.dshc-fp-tree-arrow { width:16px; height:16px; flex-shrink:0; display:flex;
  align-items:center; justify-content:center; font-size:8px; color:var(--dshc-muted);
  transition:transform .15s; }
.dshc-fp-tree-arrow-exp { transform:rotate(90deg); }
.dshc-fp-tree-icon { width:14px; height:14px; flex-shrink:0; }
.dshc-fp-tree-name { overflow:hidden; text-overflow:ellipsis; flex:1; }
.dshc-fp-tree-children { padding-left:16px; }

.dshc-fp-editor { display:flex; flex-direction:column; height:100%; }
.dshc-fp-editor-path { padding:4px 8px; font-size:11px; color:var(--dshc-muted);
  border-bottom:1px solid var(--dshc-border); flex-shrink:0; white-space:nowrap;
  overflow:hidden; text-overflow:ellipsis; }
.dshc-fp-editor-text { flex:1; border:none; outline:none; resize:none; padding:8px;
  font-family:"Cascadia Code","Fira Code","Consolas","Courier New",monospace;
  font-size:12px; line-height:1.5; tab-size:2; background:transparent; color:inherit; }
.dshc-fp-editor-actions { display:flex; gap:4px; padding:4px 8px;
  border-top:1px solid var(--dshc-border); flex-shrink:0; }
.dshc-fp-editor-btn { -webkit-app-region:no-drag; border:1px solid var(--dshc-border);
  border-radius:4px; padding:2px 10px; font-size:11px; cursor:pointer;
  background:transparent; color:inherit; }
.dshc-fp-editor-btn:hover { background:var(--dshc-hover-bg); }
.dshc-fp-editor-btn-primary { background:var(--dshc-accent); color:#fff; border-color:var(--dshc-accent); }
.dshc-fp-editor-btn-primary:hover { opacity:.85; }
.dshc-fp-toast { position:fixed; bottom:24px; right:40px; padding:6px 16px;
  border-radius:6px; font-size:12px; z-index:2147483648; pointer-events:none;
  transition:opacity .3s; }
html[data-dshc-theme="dark"] .dshc-fp { background:#1b1b1c; color:rgb(249,250,251); --dshc-tab-active-bg:rgba(255,255,255,.06); --dshc-hover-bg:rgba(255,255,255,.1); --dshc-accent:rgb(86,134,254); }
html[data-dshc-theme="light"] .dshc-fp { background:#f9fafb; color:#1f2329; --dshc-tab-active-bg:rgba(0,0,0,.04); --dshc-hover-bg:rgba(0,0,0,.06); --dshc-accent:rgb(86,134,254); }
html[data-dshc-theme="dark"] .dshc-fp-toast { background:rgb(35,35,36); color:rgb(249,250,251); }
html[data-dshc-theme="light"] .dshc-fp-toast { background:#333; color:#fff; }
`;

function filesPanelScript(dark, lang, root) {
  return `(() => {
  if (window.__dshFilesPanel) return;
  var ROOT = ${JSON.stringify(root)};
  var curLang = ${JSON.stringify(lang === "zh" ? "zh" : "en")};
  var I18N = { zh: { tree:'文件树', editor:'编辑', save:'保存', saved:'已保存', err:'错误' }, en: { tree:'Files', editor:'Edit', save:'Save', saved:'Saved', err:'Error' } };
  var L = function(k){ var m=I18N[curLang]||I18N.en; return m[k]||k; };
  var state = { tabs:[], activeTab:null, modified:{} };
  window.__dshFilesPanel = true;

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined && html !== null) e.innerHTML = html;
    return e;
  }

  // --- panel container ---
  var panel = el("div", "dshc-fp");
  // --- bar ---
  var bar = el("div", "dshc-fp-bar");
  var icon = el("div", "dshc-fp-bar-icon");
  bar.appendChild(icon);
  var barTitle = el("div", "dshc-fp-bar-title", "");
  bar.appendChild(barTitle);
  var barBtns = el("div", "dshc-fp-bar-btns");
  var btnMin = el("button", "dshc-fp-bar-btn", "");
  btnMin.textContent = "_";
  btnMin.title = L("tree");
  btnMin.addEventListener("click", function(){ showTree(); });
  barBtns.appendChild(btnMin);
  var btnClose = el("button", "dshc-fp-bar-btn dshc-fp-bar-btn-close", "");
  btnClose.innerHTML = "&#x2715;";
  btnClose.title = "Close";
  btnClose.addEventListener("click", function(){ window.__dshcToggleFilesPanel(); });
  barBtns.appendChild(btnClose);
  bar.appendChild(barBtns);
  panel.appendChild(bar);
  // --- tabs ---
  var tabBar = el("div", "dshc-fp-tabs");
  panel.appendChild(tabBar);
  // --- body ---
  var body = el("div", "dshc-fp-body");
  panel.appendChild(body);
  document.documentElement.appendChild(panel);

  var toast = null;
  function showToast(msg) {
    if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
    toast = el("div", "dshc-fp-toast", msg);
    document.documentElement.appendChild(toast);
    setTimeout(function(){ if (toast) { toast.style.opacity="0"; setTimeout(function(){ if (toast && toast.parentNode) toast.parentNode.removeChild(toast); toast=null; }, 300); } }, 2000);
  }

  // --- tree rendering ---
  var treeData = [];

  function renderTree(dirPath) {
    body.innerHTML = "";
    var tree = el("div", "dshc-fp-tree");
    body.appendChild(tree);
    loadAndRender(tree, dirPath, 0);
  }

  function loadAndRender(container, dirPath, level) {
    container.innerHTML = '<div class="dshc-fp-tree-item" style="padding:8px;justify-content:center;opacity:.5;font-size:11px">Loading…</div>';
    window.electronAPI.readDirectory(dirPath).then(function(items){
      container.innerHTML = "";
      items.forEach(function(item){ renderItem(container, item, level); });
      if (items.length === 0) container.innerHTML = '<div class="dshc-fp-tree-item" style="padding:8px;justify-content:center;opacity:.3;font-size:11px">(empty)</div>';
    }).catch(function(){
      container.innerHTML = '<div class="dshc-fp-tree-item" style="padding:8px;opacity:.3;font-size:11px">Error loading</div>';
    });
  }

  function renderItem(container, item, level) {
    var isDir = item.type === "directory";
    var hasChildren = isDir && item.children && item.children.length > 0;
    var row = el("div", "dshc-fp-tree-item");
    row.style.paddingLeft = (8 + level * 16) + "px";
    // arrow
    var arrow = el("span", "dshc-fp-tree-arrow", isDir ? "&#x25B6;" : "");
    if (isDir) row.appendChild(arrow);
    else { var sp = el("span", "dshc-fp-tree-arrow", ""); row.appendChild(sp); }
    // icon
    var ic = el("span", "dshc-fp-tree-icon", isDir ? "&#x1F4C1;" : "&#x1F4C4;");
    ic.style.fontSize = "12px";
    row.appendChild(ic);
    // name
    var nm = el("span", "dshc-fp-tree-name", item.name);
    row.appendChild(nm);

    var childrenContainer = el("div", "dshc-fp-tree-children");
    if (isDir && hasChildren) {
      childrenContainer.style.display = "none";
      item.children.forEach(function(ch){ renderItem(childrenContainer, ch, level + 1); });
    }

    row.addEventListener("click", function(e){
      e.stopPropagation();
      if (isDir) {
        if (hasChildren) {
          var expanded = childrenContainer.style.display !== "none";
          childrenContainer.style.display = expanded ? "none" : "";
          arrow.classList.toggle("dshc-fp-tree-arrow-exp", !expanded);
        }
      } else {
        openFile(item.path, item.name);
      }
    });
    container.appendChild(row);
    if (isDir) container.appendChild(childrenContainer);
  }

  // --- tab management ---
  function openFile(filePath, fileName) {
    var existing = state.tabs.findIndex(function(t){ return t.path === filePath; });
    if (existing >= 0) {
      activateTab(existing);
      return;
    }
    window.electronAPI.readFile(filePath).then(function(result){
      if (result.error) { showToast(L("err") + ": " + result.error); return; }
      state.tabs.push({ path: filePath, name: fileName, content: result.content });
      state.modified[filePath] = false;
      activateTab(state.tabs.length - 1);
    });
  }

  function activateTab(idx) {
    if (idx < 0 || idx >= state.tabs.length) return;
    state.activeTab = idx;
    renderTabs();
    showEditor(state.tabs[idx]);
  }

  function closeTab(idx) {
    if (idx < 0 || idx >= state.tabs.length) return;
    state.tabs.splice(idx, 1);
    delete state.modified[state.tabs[idx] ? state.tabs[idx].path : ""];
    if (state.tabs.length === 0) {
      state.activeTab = null;
      renderTabs();
      showTree();
    } else {
      state.activeTab = Math.min(idx, state.tabs.length - 1);
      renderTabs();
      showEditor(state.tabs[state.activeTab]);
    }
  }

  function renderTabs() {
    tabBar.innerHTML = "";
    state.tabs.forEach(function(tab, i){
      var t = el("div", "dshc-fp-tab" + (i === state.activeTab ? " dshc-fp-tab-active" : ""), tab.name);
      var x = el("span", "dshc-fp-tab-close", "&#x2715;");
      x.addEventListener("click", function(e){
        e.stopPropagation();
        closeTab(i);
      });
      t.appendChild(x);
      t.addEventListener("click", function(){ activateTab(i); });
      tabBar.appendChild(t);
    });
  }

  // --- editor ---
  function showEditor(tab) {
    body.innerHTML = "";
    var editor = el("div", "dshc-fp-editor");
    var pathBar = el("div", "dshc-fp-editor-path", tab.path);
    editor.appendChild(pathBar);
    var textarea = document.createElement("textarea");
    textarea.className = "dshc-fp-editor-text";
    textarea.value = tab.content;
    textarea.spellcheck = false;
    editor.appendChild(textarea);
    var actions = el("div", "dshc-fp-editor-actions");
    var btnSave = el("button", "dshc-fp-editor-btn dshc-fp-editor-btn-primary", L("save"));
    btnSave.addEventListener("click", function(){
      var newContent = textarea.value;
      window.electronAPI.writeFile(tab.path, newContent).then(function(result){
        if (result.ok) {
          tab.content = newContent;
          state.modified[tab.path] = false;
          showToast(L("saved"));
        } else {
          showToast(L("err") + ": " + result.error);
        }
      });
    });
    actions.appendChild(btnSave);
    editor.appendChild(actions);
    body.appendChild(editor);
    textarea.focus();
  }

  function showTree() {
    renderTree(ROOT);
    barTitle.textContent = ROOT;
  }

  // --- show / hide ---
  var api = window.electronAPI;
  window.__dshcShowFilesPanel = function(visible) {
    panel.classList.toggle("dshc-fp-open", visible);
    if (visible && state.tabs.length === 0) showTree();
    else if (visible && state.activeTab != null) showEditor(state.tabs[state.activeTab]);
  };
  window.__dshcToggleFilesPanel = function() {
    window.electronAPI.toggleFilesPanel();
  };
  // 主进程推送的状态同步（Files 按钮触发 invoke 后，主进程 push event 到此）
  if (api && api.onFilePanelState) {
    api.onFilePanelState(window.__dshcShowFilesPanel);
  }

  // --- theme ---
  function applyTheme(d) {
    document.documentElement.setAttribute("data-dshc-theme", d ? "dark" : "light");
  }

  // --- lang (for future use) ---
  function applyLang(l) {
    curLang = l === "zh" ? "zh" : "en";
  }

  if (api && api.onChromeTheme) api.onChromeTheme(applyTheme);
  if (api && api.onChromeLanguage) api.onChromeLanguage(applyLang);
  applyTheme(${dark ? "true" : "false"});
})();`;
}

module.exports = { FILES_PANEL_CSS, filesPanelScript };