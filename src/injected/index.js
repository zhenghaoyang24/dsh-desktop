// 注入编排：把顶栏 / 关于浮层 / 检查更新浮层 / 共享下拉菜单（帮助 + View）/ 文件树面板 /
// 全屏提示脚本注入到各页面，并提供下拉菜单与内容全屏相关的主进程入口
const { state } = require("../state");
const { log } = require("../paths");
const { BAR_HEIGHT } = require("../constants");
const { CHROME_CSS, chromeScript } = require("./chrome");
const { ABOUT_OVERLAY_CSS, aboutOverlayScript } = require("./about");
const { UPDATE_CHECK_CSS, updateCheckScript } = require("./update-check");
const { DROPDOWN_CSS, dropdownScript } = require("./dropdown");
const { FULLSCREEN_HINT_CSS, fullscreenHintScript } = require("./fullscreen-hint");
const { FILES_PANEL_CSS, filesPanelScript } = require("./files-panel");
const { getWorkspaceRoot } = require("../files");

function injectAboutOverlay(wc, dark, lang) {
  if (!wc || wc.isDestroyed()) return;
  wc.insertCSS(ABOUT_OVERLAY_CSS).catch((err) => log("[about-css] " + err.message));
  wc.executeJavaScript(aboutOverlayScript(dark, lang)).catch((err) =>
    log("[about] " + err.message),
  );
}

function injectUpdateCheckOverlay(wc, dark, lang) {
  if (!wc || wc.isDestroyed()) return;
  wc.insertCSS(UPDATE_CHECK_CSS).catch((err) => log("[update-css] " + err.message));
  wc.executeJavaScript(updateCheckScript(dark, lang)).catch((err) =>
    log("[update] " + err.message),
  );
}

// 共享下拉菜单（帮助 / View）：注入到 dsh 视图（视图挂载后菜单弹在视图之上），启动页兜底
function injectDropdown(wc, dark, lang) {
  if (!wc || wc.isDestroyed()) return;
  wc.insertCSS(DROPDOWN_CSS).catch((err) => log("[dropdown-css] " + err.message));
  wc.executeJavaScript(dropdownScript(dark, lang)).catch((err) =>
    log("[dropdown] " + err.message),
  );
}

// 内容全屏提示浮层：只注入 dsh 视图（只有视图挂载后才能进入全屏）
function injectFullscreenHint(wc, dark, lang) {
  if (!wc || wc.isDestroyed()) return;
  wc.insertCSS(FULLSCREEN_HINT_CSS).catch((err) => log("[fs-hint-css] " + err.message));
  wc.executeJavaScript(fullscreenHintScript(dark, lang)).catch((err) =>
    log("[fs-hint] " + err.message),
  );
}

function injectChrome(dark) {
  const win = state.win;
  if (!win || win.isDestroyed()) return;
  if (!win.webContents.getURL().startsWith("file:")) return; // 只注入我们自己的启动页
  win.webContents.insertCSS(CHROME_CSS).catch((err) => log("[chrome-css] " + err.message));
  win.webContents
    .executeJavaScript(chromeScript(dark, state.currentLang))
    .then(() => setChromeBtns(state.dshView != null)) // 脚本执行完监听器已就绪，补发按钮可见性（防止竞态丢失）
    .catch((err) => log("[chrome] " + err.message));
  injectAboutOverlay(win.webContents, dark, state.currentLang); // 启动页兜底（dsh 视图未创建时）
  injectUpdateCheckOverlay(win.webContents, dark, state.currentLang); // 同上，检查更新浮层兜底
  injectDropdown(win.webContents, dark, state.currentLang); // 同上，下拉菜单兜底
  injectFilesPanel(dark, state.currentLang); // 文件树面板（始终隐藏，点击 Files 按钮时显示）
}

// 注入文件树面板到启动页
function injectFilesPanel(dark, lang) {
  const win = state.win;
  if (!win || win.isDestroyed()) return;
  if (!win.webContents.getURL().startsWith("file:")) return;
  const root = getWorkspaceRoot();
  win.webContents.insertCSS(FILES_PANEL_CSS).catch((err) => log("[fp-css] " + err.message));
  win.webContents
    .executeJavaScript(filesPanelScript(dark, lang, root))
    .catch((err) => log("[fp] " + err.message));
}

// 关于浮层：type = 'dsh'（当前 dsh 信息）| 'app'（软件版本 + 仓库地址）
// 弹在 dsh 视图之上；视图未创建（启动阶段）时用启动页兜底
function showAboutDialog(type) {
  if (!state.win || state.win.isDestroyed()) return;
  const target =
    state.dshView && !state.dshView.webContents.isDestroyed()
      ? state.dshView.webContents
      : state.win.webContents;
  target
    .executeJavaScript(`window.__dshAbout && window.__dshAbout.show(${JSON.stringify(type)})`)
    .catch(() => {});
}

// 检查更新浮层
function showUpdateCheckDialog() {
  if (!state.win || state.win.isDestroyed()) return;
  const target =
    state.dshView && !state.dshView.webContents.isDestroyed()
      ? state.dshView.webContents
      : state.win.webContents;
  target
    .executeJavaScript(`window.__dshUpdateCheck && window.__dshUpdateCheck.show()`)
    .catch(() => {});
}

// 顶栏「帮助 / View」按钮可见性：启动页隐藏，dsh 视图挂载（进入主界面）后显示
function setChromeBtns(visible) {
  if (state.win && !state.win.isDestroyed()) {
    state.win.webContents.send("chrome-btns-state", !!visible);
  }
}

// 共享下拉菜单的注入目标：dsh 视图（视图挂载后弹在视图之上），启动页兜底
function dropdownTarget() {
  if (!state.win || state.win.isDestroyed()) return null;
  return state.dshView && !state.dshView.webContents.isDestroyed()
    ? state.dshView.webContents
    : state.win.webContents;
}

// 只发「关闭」消息（菜单 + 按钮高亮复位），不改 state.openMenu
function sendMenuClosed(menuId) {
  if (!menuId) return;
  const target = dropdownTarget();
  if (target) target.send("dropdown-popup", menuId, { visible: false });
  if (state.win && !state.win.isDestroyed()) {
    state.win.webContents.send("dropdown-menu-state", menuId, false);
  }
}

// 打开下拉菜单：把按钮的视口坐标（窗口内容区坐标）换算成目标页面的坐标后推送。
// 菜单按钮在启动页顶栏，dsh 视图位于顶栏下方（视图 y:0 对应窗口内容区 y:BAR_HEIGHT），
// 所以注入到视图时 y 要减 BAR_HEIGHT；注入到启动页（视图未创建）时坐标原样。
function showDropdown(menuId, rect) {
  const win = state.win;
  if (!win || win.isDestroyed()) return;
  const target = dropdownTarget();
  if (!target) return;
  const x = rect && Number.isFinite(rect.x) ? Math.round(rect.x) : 0;
  const y = rect && Number.isFinite(rect.y) ? Math.round(rect.y) : 0;
  const isView = state.dshView && target === state.dshView.webContents;
  target.send("dropdown-popup", menuId, { visible: true, x, y: isView ? y - BAR_HEIGHT : y });
  state.openMenu = menuId;
  win.webContents.send("dropdown-menu-state", menuId, true);
}

// 关闭当前打开的下拉菜单（toggle / 窗口失焦 / 进入全屏时由主进程主动调用）
function hideDropdown() {
  const menuId = state.openMenu;
  if (!menuId) return;
  sendMenuClosed(menuId);
  state.openMenu = null;
}

// 点击菜单按钮：同菜单已打开则关闭，否则（先关掉另一个菜单）打开
function toggleDropdown(menuId, rect) {
  if (state.openMenu === menuId) {
    hideDropdown();
    return;
  }
  if (state.openMenu) sendMenuClosed(state.openMenu);
  showDropdown(menuId, rect);
}

module.exports = {
  injectAboutOverlay,
  injectUpdateCheckOverlay,
  injectDropdown,
  injectFullscreenHint,
  injectChrome,
  injectFilesPanel,
  showAboutDialog,
  showUpdateCheckDialog,
  setChromeBtns,
  showDropdown,
  hideDropdown,
  toggleDropdown,
};
