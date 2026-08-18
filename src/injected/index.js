// 注入编排：把顶栏 / 关于浮层脚本注入到启动页或 dsh 视图，并提供「帮助」菜单相关的主进程入口
const { screen } = require("electron");
const { state } = require("../state");
const { log } = require("../paths");
const { CHROME_CSS, chromeScript } = require("./chrome");
const { ABOUT_OVERLAY_CSS, aboutOverlayScript } = require("./about");
const { UPDATE_CHECK_CSS, updateCheckScript } = require("./update-check");

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

function injectChrome(dark) {
  const win = state.win;
  if (!win || win.isDestroyed()) return;
  if (!win.webContents.getURL().startsWith("file:")) return; // 只注入我们自己的启动页
  win.webContents.insertCSS(CHROME_CSS).catch((err) => log("[chrome-css] " + err.message));
  win.webContents
    .executeJavaScript(chromeScript(dark, state.currentLang))
    .then(() => setHelpBtn(state.dshView != null)) // 脚本执行完监听器已就绪，补发按钮可见性（防止竞态丢失）
    .catch((err) => log("[chrome] " + err.message));
  injectAboutOverlay(win.webContents, dark, state.currentLang); // 启动页兜底（dsh 视图未创建时）
  injectUpdateCheckOverlay(win.webContents, dark, state.currentLang); // 同上，检查更新浮层兜底
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

// 顶栏「帮助」按钮可见性：启动页隐藏，dsh 视图挂载（进入主界面）后显示
function setHelpBtn(visible) {
  if (state.win && !state.win.isDestroyed()) {
    state.win.webContents.send("help-btn-state", !!visible);
  }
}

// 原生菜单弹出期间会吞掉鼠标事件，渲染进程的 :hover 停在旧位置（点击时的按钮上），
// 菜单关闭后不会收到对应的 mouseleave，残留高亮。这里主动推送一次「可信」mouseMove：
// 主进程的 sendInputEvent 走真实输入管线，Chromium 会按真实光标位置重新命中测试并刷新 hover
function resolveHelpHover() {
  const win = state.win;
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
  try {
    const pt = screen.getCursorScreenPoint(); // 屏幕坐标(DIP)
    const cb = win.getContentBounds(); // 内容区原点 → 换算成 webContents 视口坐标
    win.webContents.sendInputEvent({
      type: "mouseMove",
      x: Math.round(pt.x - cb.x),
      y: Math.round(pt.y - cb.y),
    });
  } catch (_) {}
}

module.exports = {
  injectAboutOverlay,
  injectUpdateCheckOverlay,
  injectChrome,
  showAboutDialog,
  showUpdateCheckDialog,
  setHelpBtn,
  resolveHelpHover,
};
