// 自定义「下拉菜单」的样式与脚本：帮助（Help）与 View 两个菜单共用同一套组件。
// 注入到 dsh 视图（视图挂载后菜单弹在视图之上），启动页作为兜底 —— 与关于/更新浮层同一模式。
// 关键点：菜单按钮在启动页顶栏里，而 dsh 视图覆盖启动页 y ≥ 32 的区域，所以菜单必须注入到
// 视图页面；主进程负责把按钮的视口坐标换算成视图坐标（y - BAR_HEIGHT，见 injected/index.js）。
// 打开/关闭由主进程推送 dropdown-popup（menuId + visible + pos）控制；菜单自行关闭
// （点击外部 / Escape / 点击菜单项）时通过 dropdown-closed 通知主进程复位按钮高亮。
const { PALETTE: P } = require("../theme-palette");
const { T } = require("../../renderer/status-core"); // i18n 唯一来源

// 菜单配置：menuId → 菜单项数组；null 为分组分隔线；id 是主进程 dropdown-action 的动作标识
const MENUS = {
  help: [
    { id: "current-dsh", key: "menuCurrentDsh" },
    { id: "check-update", key: "menuCheckUpdate" },
    { id: "home", key: "menuHome" },
    null,
    { id: "community", key: "menuCommunity" },
    { id: "awesome-plugin", key: "menuAwesomePlugin" },
    null,
    { id: "about", key: "menuAbout" },
  ],
  // View 菜单：后续「调整布局等视图相关内容」的菜单项都加在这里；
  // shortcut 为菜单项右侧的快捷键提示（没有则省略）
  view: [{ id: "maximize", key: "viewMaximize", shortcut: "F11" }],
};

// 菜单用到的文案子集，注入到页面脚本里
const MENU_KEYS = [...new Set(
  Object.values(MENUS).flat().filter(Boolean).map((i) => i.key),
)];
const MENU_I18N = JSON.stringify({
  zh: Object.fromEntries(MENU_KEYS.map((k) => [k, T.zh[k]])),
  en: Object.fromEntries(MENU_KEYS.map((k) => [k, T.en[k]])),
});

const DROPDOWN_CSS = `
.dshdd-menu {
  position: fixed;
  min-width: 190px;
  padding: 4px;
  border-radius: 8px;
  font-size: 12px;
  font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  border: 1px solid var(--dshdd-border);
  background: var(--dshdd-bg);
  color: var(--dshdd-fg);
  z-index: 2147483646;
  user-select: none;
}
.dshdd-menu[hidden] { display: none !important; }
html[data-dshc-theme="light"] .dshdd-menu {
  --dshdd-bg: ${P.boxBg.light}; --dshdd-fg: ${P.barFg.light};
  --dshdd-border: ${P.border.light}; --dshdd-muted: ${P.textMuted.light};
}
html[data-dshc-theme="dark"] .dshdd-menu {
  --dshdd-bg: ${P.boxBg.dark}; --dshdd-fg: ${P.barFg.dark};
  --dshdd-border: ${P.border.dark}; --dshdd-muted: ${P.textMuted.dark};
}
.dshdd-item {
  display: flex; align-items: center; justify-content: space-between; gap: 24px;
  width: 100%; text-align: left;
  padding: 6px 12px; border: none; border-radius: 5px;
  background: transparent; color: inherit; font: inherit;
  cursor: pointer;
}
.dshdd-item:hover { background: ${P.hoverBg}; }
/* 菜单项右侧的快捷键提示（如 View → 最大化的 F11） */
.dshdd-shortcut { color: var(--dshdd-muted); font-size: 11px; flex-shrink: 0; }
.dshdd-sep { height: 1px; margin: 4px 6px; background: var(--dshdd-border); }
`;

function dropdownScript(dark, lang) {
  return `(() => {
  if (window.__dshDropdown) return;
  var api = window.electronAPI;
  var cur = ${JSON.stringify(lang === "zh" ? "zh" : "en")};
  var I18N = ${MENU_I18N};
  var MENUS = ${JSON.stringify(MENUS)};
  function t(key) { return (I18N[cur] && I18N[cur][key]) || I18N['zh'][key]; }
  function mk(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined && text !== null) el.textContent = text;
    return el;
  }
  // 每个菜单一份 DOM：菜单项 id → 主进程动作（dropdown-action）；null 为分组分隔线
  var menus = {};
  Object.keys(MENUS).forEach(function (menuId) {
    var menu = mk('div', 'dshdd-menu');
    menu.hidden = true;
    var labels = [];
    MENUS[menuId].forEach(function (item) {
      if (!item) { menu.appendChild(mk('div', 'dshdd-sep')); return; }
      // 按钮 = 左侧文案 + 右侧可选快捷键提示（如「最大化 F11」）
      var btn = mk('button', 'dshdd-item');
      var label = mk('span', 'dshdd-label', t(item.key));
      btn.appendChild(label);
      if (item.shortcut) btn.appendChild(mk('span', 'dshdd-shortcut', item.shortcut));
      btn.addEventListener('click', function () {
        close(menuId); // 先关菜单（通知主进程复位按钮高亮），再执行动作
        if (api && api.dropdownAction) api.dropdownAction(menuId, item.id);
      });
      labels.push({ btn: btn, label: label, item: item });
      menu.appendChild(btn);
    });
    menus[menuId] = { menu: menu, labels: labels };
    document.documentElement.appendChild(menu);
  });
  function renderAll() {
    Object.keys(menus).forEach(function (menuId) {
      menus[menuId].labels.forEach(function (l) { l.label.textContent = t(l.item.key); });
    });
  }
  function applyLang(l) {
    cur = l === 'zh' ? 'zh' : 'en';
    renderAll();
  }
  function setTheme(d) {
    document.documentElement.setAttribute('data-dshc-theme', d ? 'dark' : 'light');
  }
  // 用户侧关闭（点击外部 / Escape / 点击菜单项）：通知主进程复位按钮高亮
  function close(menuId) {
    var m = menus[menuId];
    if (!m || m.menu.hidden) return;
    m.menu.hidden = true;
    if (api && api.dropdownClosed) api.dropdownClosed(menuId);
  }
  // 主进程侧关闭（toggle / 窗口失焦 / 进入全屏）：主进程自己已复位状态，这里只隐藏
  function hideSilent(menuId) {
    var m = menus[menuId];
    if (m) m.menu.hidden = true;
  }
  function show(menuId, pos) {
    var m = menus[menuId];
    if (!m) return;
    // 同一时刻只显示一个菜单（主进程已保证，这里再兜底）
    Object.keys(menus).forEach(function (id) { if (id !== menuId) menus[id].menu.hidden = true; });
    var x = pos && Number.isFinite(pos.x) ? pos.x : 0;
    var y = pos && Number.isFinite(pos.y) ? pos.y : 0;
    m.menu.hidden = false;
    m.menu.style.left = x + 'px';
    m.menu.style.top = y + 'px';
    // 同步测量尺寸后夹紧到视口（同帧内完成，无闪烁）：先向右夹紧，下方放不下则向上展开
    var w = m.menu.offsetWidth, h = m.menu.offsetHeight;
    var vw = document.documentElement.clientWidth;
    var vh = document.documentElement.clientHeight;
    var nx = Math.min(x, Math.max(4, vw - w - 4));
    var ny = y;
    if (y + h > vh - 4 && y - h > 4) ny = y - h;
    ny = Math.max(4, Math.min(ny, Math.max(4, vh - h - 4)));
    m.menu.style.left = nx + 'px';
    m.menu.style.top = ny + 'px';
  }
  // 点击菜单外关闭（顶栏按钮除外：按钮点击走主进程 toggle，避免「关掉又立刻弹开」）
  document.addEventListener('mousedown', function (e) {
    var openId = null;
    Object.keys(menus).forEach(function (id) { if (!menus[id].menu.hidden) openId = id; });
    if (!openId) return;
    if (e.target.closest && e.target.closest('.dshc-btn')) return;
    if (menus[openId].menu.contains(e.target)) return;
    close(openId);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    Object.keys(menus).forEach(function (id) { if (!menus[id].menu.hidden) close(id); });
  });
  if (api && api.onDropdownPopup) {
    api.onDropdownPopup(function (menuId, p) {
      if (p && p.visible === false) { hideSilent(menuId); return; }
      show(menuId, p || {});
    });
  }
  if (api && api.onChromeTheme) api.onChromeTheme(setTheme);
  if (api && api.onChromeLanguage) api.onChromeLanguage(applyLang);
  setTheme(${dark ? "true" : "false"});
  window.__dshDropdown = { show: show, hide: close };
})();`;
}

module.exports = { DROPDOWN_CSS, dropdownScript };
