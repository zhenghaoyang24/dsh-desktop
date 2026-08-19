// 自绘顶栏（标题栏）的样式与脚本：注入到启动页
const { PALETTE: P } = require("../theme-palette");
const { T } = require("../../renderer/status-core"); // i18n 唯一来源
const CHROME_I18N = JSON.stringify({
  zh: { help: T.zh.help, view: T.zh.view },
  en: { help: T.en.help, view: T.en.view },
});

const CHROME_CSS = `
.dshc-bar {
  position: fixed; top: 0; left: 0; right: 0; height: 32px;
  display: flex; align-items: center; gap: 8px;
  padding: 0 12px;
  padding-right: 148px; /* 给右侧原生窗口按钮留空间 */
  border-bottom: 1px solid var(--dshc-border);
  -webkit-app-region: drag;
  z-index: 2147483646;
  user-select: none;
  font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
}
html[data-dshc-theme="dark"] .dshc-bar { background: ${P.barBg.dark}; color: ${P.barFg.dark}; --dshc-border: ${P.border.dark}; --dshc-muted: ${P.textMuted.dark}; }
html[data-dshc-theme="light"] .dshc-bar { background: ${P.barBg.light}; color: ${P.barFg.light}; --dshc-border: ${P.border.light}; --dshc-muted: ${P.textMuted.light}; }
/* 顶栏左侧 logo：复用 buildResources/logo.png（黑色透明底），暗色主题下 filter: invert 转为白色 */
.dshc-brand { height: 16px; width: auto; flex-shrink: 0; -webkit-user-drag: none; }
html[data-dshc-theme="dark"] .dshc-brand { filter: invert(1); }
.dshc-btn {
  -webkit-app-region: no-drag;
  border: 1px solid transparent; border-radius: 6px;
  padding: 3px 10px; font-size: 12px; cursor: pointer;
  background: transparent; color: var(--dshc-muted);
}
/* hover 时按钮文字回归主要文本色（继承顶栏的 color，即主文字色） */
.dshc-btn:hover { background: ${P.hoverBg}; color: inherit; }
/* 下拉菜单打开期间按钮保持高亮（自定义菜单打开状态的视觉反馈，由 dropdown-menu-state 切换） */
.dshc-btn.dshc-menu-open { background: ${P.hoverBg}; color: inherit; }
`;

function chromeScript(dark, lang) {
  return `(() => {
  if (window.__dshChrome) return;
  window.__dshChrome = true;
  var cur = ${JSON.stringify(lang === "zh" ? "zh" : "en")};
  var I18N = ${CHROME_I18N};
  function mk(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined && text !== null) el.textContent = text;
    return el;
  }
  function applyTheme(d) {
    document.documentElement.setAttribute('data-dshc-theme', d ? 'dark' : 'light');
  }
  var bar = mk('div', 'dshc-bar');
  // 左侧 logo（黑色透明底，暗色主题下由 CSS 反转成白色）替代原来的品牌文字
  var brand = document.createElement('img');
  brand.className = 'dshc-brand';
  brand.src = '../buildResources/logo.png';
  brand.alt = 'dsh-desktop';
  bar.appendChild(brand);
  // 「帮助」下拉按钮：启动页面隐藏，进入主界面（dsh 视图挂载）后由主进程显示；文字随界面语言
  var btnHelp = mk('button', 'dshc-btn');
  // 「View」下拉按钮（视图/布局相关）：同帮助按钮一套显隐逻辑，点击弹 View 菜单
  var btnView = mk('button', 'dshc-btn');
  btnHelp.style.display = 'none';
  btnView.style.display = 'none';
  bar.appendChild(btnHelp);
  bar.appendChild(btnView);
  // 右侧弹性空间
  var spacer = document.createElement('div');
  spacer.style.flex = '1';
  bar.appendChild(spacer);
  // 「文件树」按钮：暂时隐藏，后续开发
  var btnFiles = mk('button', 'dshc-btn');
  btnFiles.textContent = 'Files';
  btnFiles.style.display = 'none';
  btnFiles.addEventListener('click', function () {
    if (!api || !api.toggleFilesPanel) return;
    api.toggleFilesPanel();
  });
  bar.appendChild(btnFiles);
  document.documentElement.appendChild(bar);
  var api = window.electronAPI;
  var BTNS = { help: btnHelp, view: btnView };
  function applyLang(l) {
    cur = l === 'zh' ? 'zh' : 'en';
    btnHelp.textContent = I18N[cur].help;
    btnView.textContent = I18N[cur].view;
  }
  applyLang(cur);
  // 顶栏按钮可见性：启动页隐藏，dsh 视图挂载（进入主界面）后显示
  window.__dshcSetBtns = function (visible) {
    var d = visible ? '' : 'none';
    btnHelp.style.display = d;
    btnView.style.display = d;
  };
  // 下拉菜单打开期间对应按钮保持高亮（由 dropdown-menu-state 切换）
  window.__dshcSetMenuOpen = function (menuId, open) {
    var b = BTNS[menuId];
    if (b) b.classList.toggle('dshc-menu-open', !!open);
  };
  // 顶栏整体显示/隐藏（View → 最大化 内容全屏模式用）
  window.__dshcSetBar = function (visible) {
    bar.style.display = visible ? '' : 'none';
  };
  function openMenu(menuId, btn) {
    if (!api || !api.openMenu) return;
    var r = btn.getBoundingClientRect(); // 视口坐标，主进程换算成菜单所在页面（dsh 视图）的坐标
    btn.classList.add('dshc-menu-open'); // 先高亮，等主进程推送 dropdown-menu-state 复位
    api.openMenu(menuId, { x: r.left, y: r.bottom });
  }
  btnHelp.addEventListener('click', function () { openMenu('help', btnHelp); });
  btnView.addEventListener('click', function () { openMenu('view', btnView); });
  if (api && api.onDropdownMenuState) {
    api.onDropdownMenuState(window.__dshcSetMenuOpen);
  }
  if (api && api.onChromeBtnsState) {
    api.onChromeBtnsState(window.__dshcSetBtns);
  }
  if (api && api.onChromeBarVisible) {
    api.onChromeBarVisible(window.__dshcSetBar);
  }
  if (api && api.onChromeTheme) {
    api.onChromeTheme(applyTheme);
  }
  if (api && api.onChromeLanguage) {
    api.onChromeLanguage(applyLang);
  }
  applyTheme(${dark ? "true" : "false"});
})();`;
}

module.exports = { CHROME_CSS, chromeScript };
