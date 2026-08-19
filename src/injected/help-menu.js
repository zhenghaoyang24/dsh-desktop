// 自定义「帮助」下拉菜单的样式与脚本：页面内 fixed 定位的下拉框，替代原生 Menu.popup。
// 注入到 dsh 视图（视图挂载后菜单弹在视图之上），启动页作为兜底 —— 与关于/更新浮层同一模式。
// 关键点：帮助按钮在启动页顶栏里，而 dsh 视图覆盖启动页 y ≥ 32 的区域，所以菜单必须注入到
// 视图页面；主进程负责把按钮的视口坐标换算成视图坐标（y - BAR_HEIGHT，见 injected/index.js）。
// 打开/关闭由主进程推送 help-menu-popup 控制；菜单自行关闭（点击外部 / Escape / 点击菜单项）
// 时通过 help-menu-closed 通知主进程复位按钮高亮。
const { PALETTE: P } = require("../theme-palette");
const { T } = require("../../renderer/status-core"); // i18n 唯一来源

// 菜单用到的文案子集，注入到页面脚本里
const MENU_KEYS = [
  "menuCurrentDsh", "menuCheckUpdate", "menuHome",
  "menuCommunity", "menuAwesomePlugin", "menuAbout",
];
const MENU_I18N = JSON.stringify({
  zh: Object.fromEntries(MENU_KEYS.map((k) => [k, T.zh[k]])),
  en: Object.fromEntries(MENU_KEYS.map((k) => [k, T.en[k]])),
});

const HELP_MENU_CSS = `
.dshm-menu {
  position: fixed;
  min-width: 190px;
  padding: 4px;
  border-radius: 8px;
  font-size: 12px;
  font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  border: 1px solid var(--dshm-border);
  background: var(--dshm-bg);
  color: var(--dshm-fg);
  z-index: 2147483646;
  user-select: none;
}
.dshm-menu[hidden] { display: none !important; }
html[data-dshc-theme="light"] .dshm-menu {
  --dshm-bg: ${P.boxBg.light}; --dshm-fg: ${P.barFg.light};
  --dshm-border: ${P.border.light};
}
html[data-dshc-theme="dark"] .dshm-menu {
  --dshm-bg: ${P.boxBg.dark}; --dshm-fg: ${P.barFg.dark};
  --dshm-border: ${P.border.dark};
}
.dshm-item {
  display: block; width: 100%; text-align: left;
  padding: 6px 12px; border: none; border-radius: 5px;
  background: transparent; color: inherit; font: inherit;
  cursor: pointer;
}
.dshm-item:hover { background: ${P.hoverBg}; }
.dshm-sep { height: 1px; margin: 4px 6px; background: var(--dshm-border); }
`;

function helpMenuScript(dark, lang) {
  return `(() => {
  if (window.__dshHelpMenu) return;
  var api = window.electronAPI;
  var cur = ${JSON.stringify(lang === "zh" ? "zh" : "en")};
  var I18N = ${MENU_I18N};
  function t(key) { return (I18N[cur] && I18N[cur][key]) || I18N['zh'][key]; }
  // 菜单项：id → 主进程动作（help-menu-action）；null 为分组分隔线（dsh 组 / 社区组 / 关于）
  var ITEMS = [
    { id: 'current-dsh', key: 'menuCurrentDsh' },
    { id: 'check-update', key: 'menuCheckUpdate' },
    { id: 'home', key: 'menuHome' },
    null,
    { id: 'community', key: 'menuCommunity' },
    { id: 'awesome-plugin', key: 'menuAwesomePlugin' },
    null,
    { id: 'about', key: 'menuAbout' },
  ];
  function mk(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined && text !== null) el.textContent = text;
    return el;
  }
  var menu = mk('div', 'dshm-menu');
  menu.hidden = true;
  var labels = [];
  ITEMS.forEach(function (item) {
    if (!item) { menu.appendChild(mk('div', 'dshm-sep')); return; }
    var btn = mk('button', 'dshm-item', t(item.key));
    btn.addEventListener('click', function () {
      close(); // 先关菜单（通知主进程复位按钮高亮），再执行动作
      if (api && api.helpMenuAction) api.helpMenuAction(item.id);
    });
    labels.push({ btn: btn, item: item });
    menu.appendChild(btn);
  });
  document.documentElement.appendChild(menu);
  function render() {
    labels.forEach(function (l) { l.btn.textContent = t(l.item.key); });
  }
  function applyLang(l) {
    cur = l === 'zh' ? 'zh' : 'en';
    render();
  }
  function setTheme(d) {
    document.documentElement.setAttribute('data-dshc-theme', d ? 'dark' : 'light');
  }
  // 用户侧关闭（点击外部 / Escape / 点击菜单项）：通知主进程复位按钮高亮
  function close() {
    if (menu.hidden) return;
    menu.hidden = true;
    if (api && api.helpMenuClosed) api.helpMenuClosed();
  }
  // 主进程侧关闭（toggle / 窗口失焦）：主进程自己已复位状态，这里只隐藏
  function hideSilent() { menu.hidden = true; }
  function show(pos) {
    var x = pos && Number.isFinite(pos.x) ? pos.x : 0;
    var y = pos && Number.isFinite(pos.y) ? pos.y : 0;
    menu.hidden = false;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    // 同步测量尺寸后夹紧到视口（同帧内完成，无闪烁）：先向右夹紧，下方放不下则向上展开
    var w = menu.offsetWidth, h = menu.offsetHeight;
    var vw = document.documentElement.clientWidth;
    var vh = document.documentElement.clientHeight;
    var nx = Math.min(x, Math.max(4, vw - w - 4));
    var ny = y;
    if (y + h > vh - 4 && y - h > 4) ny = y - h;
    ny = Math.max(4, Math.min(ny, Math.max(4, vh - h - 4)));
    menu.style.left = nx + 'px';
    menu.style.top = ny + 'px';
  }
  // 点击菜单外关闭（帮助按钮除外：按钮点击走主进程 toggle，避免「关掉又立刻弹开」）
  document.addEventListener('mousedown', function (e) {
    if (menu.hidden) return;
    if (e.target.closest && e.target.closest('.dshc-btn')) return;
    if (menu.contains(e.target)) return;
    close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !menu.hidden) close();
  });
  if (api && api.onHelpMenuPopup) {
    api.onHelpMenuPopup(function (p) {
      if (p && p.visible === false) { hideSilent(); return; }
      show(p || {});
    });
  }
  if (api && api.onChromeTheme) api.onChromeTheme(setTheme);
  if (api && api.onChromeLanguage) api.onChromeLanguage(applyLang);
  setTheme(${dark ? "true" : "false"});
  window.__dshHelpMenu = { show: show, hide: close };
})();`;
}

module.exports = { HELP_MENU_CSS, helpMenuScript };
