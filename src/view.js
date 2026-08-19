const { WebContentsView, nativeTheme, shell } = require("electron");
const { preloadPath, log } = require("./paths");
const { APP_URL, BAR_HEIGHT, PANEL_WIDTH } = require("./constants");
const { state } = require("./state");
const { TASK_WATCHER } = require("./injected/task-watcher");
const {
  injectAboutOverlay,
  injectUpdateCheckOverlay,
  injectDropdown,
  injectFullscreenHint,
  setChromeBtns,
  hideDropdown,
} = require("./injected/index");
const { isExternalUrl } = require("./external");
const { sendStatus } = require("./status");
const { color } = require("./theme-palette");

// 全局快捷键：F12 DevTools / F11 切换内容全屏。
// before-input-event 按 webContents 分发，所以同时挂到启动页与 dsh 视图，
// 保证焦点在 dsh 页面（主界面常态）时快捷键仍然生效。
function handleGlobalKey(input) {
  if (input.type !== "keyDown") return;
  if (input.key === "F12") {
    const target =
      state.dshView && !state.dshView.webContents.isDestroyed()
        ? state.dshView.webContents
        : state.win && state.win.webContents;
    if (target) target.toggleDevTools();
  } else if (input.key === "F11") {
    if (state.dshView) toggleFullscreenMode();
  }
}

// 注入 dsh 网页的任务观察器：监听合成器主按钮的 停止生成/发送消息 切换，
// 回答完成后通过 window.electronAPI.notifyTaskComplete() 上报（主进程决定是否通知）
function injectTaskWatcher(wc) {
  if (!wc || wc.isDestroyed()) return;
  if (!wc.getURL().startsWith(APP_URL)) return; // 只注入 dsh 页面
  wc.executeJavaScript(TASK_WATCHER).catch((err) => log("[watcher] " + err.message));
}

// dsh 页面放入独立的 WebContentsView（位于顶栏下方；内容全屏模式下铺满整个窗口），
// 不改动 dsh 页面任何元素
function layoutDshView() {
  const win = state.win;
  if (!win || win.isDestroyed() || !state.dshView) return;
  const [w, h] = win.getContentSize();
  if (state.fullscreenMode) {
    state.dshView.setBounds({ x: 0, y: 0, width: w, height: h });
    return;
  }
  const pw = state.filePanelOpen ? PANEL_WIDTH : 0;
  state.dshView.setBounds({ x: 0, y: BAR_HEIGHT, width: Math.max(0, w - pw), height: Math.max(0, h - BAR_HEIGHT) });
}

// —— 内容全屏模式（View → 最大化 / F11）——
// 窗口进入 OS 全屏（覆盖任务栏，与浏览器 F11 一致）+ 隐藏自绘顶栏 + dsh 视图铺满整个屏幕；
// 进入后 dsh 视图里弹出「F11 退出最大化」提示，F11 退出后恢复原窗口状态与顶栏。
function enterFullscreenMode() {
  const win = state.win;
  if (!win || win.isDestroyed() || !state.dshView) return;
  if (state.fullscreenMode) return;
  state.fullscreenMode = true;
  // 全屏下必须「只有 dsh web」：强制关闭文件树面板并收起可能打开的下拉菜单
  if (state.filePanelOpen) {
    state.filePanelOpen = false;
    win.webContents.send("file-panel-state", false);
  }
  hideDropdown();
  win.setFullScreen(true);
  win.webContents.send("chrome-bar-visible", false); // 隐藏顶栏
  layoutDshView();
  if (!state.dshView.webContents.isDestroyed()) {
    state.dshView.webContents.send("chrome-fullscreen", true); // 提示「F11 退出最大化」
  }
}

function exitFullscreenMode() {
  const win = state.win;
  if (!win || win.isDestroyed()) return;
  if (!state.fullscreenMode) return;
  state.fullscreenMode = false;
  if (win.isFullScreen()) win.setFullScreen(false); // 触发 leave-full-screen 可能重入本函数，但状态已复位
  if (win.isDestroyed()) return;
  win.webContents.send("chrome-bar-visible", true); // 恢复顶栏
  layoutDshView();
  if (state.dshView && !state.dshView.webContents.isDestroyed()) {
    state.dshView.webContents.send("chrome-fullscreen", false);
  }
}

function toggleFullscreenMode() {
  if (state.fullscreenMode) exitFullscreenMode();
  else enterFullscreenMode();
}

function removeDshView() {
  // 全屏中崩溃/移除视图：先退出全屏模式，恢复顶栏与窗口状态（启动页需要顶栏）
  if (state.fullscreenMode && state.win && !state.win.isDestroyed()) {
    state.fullscreenMode = false;
    if (state.win.isFullScreen()) state.win.setFullScreen(false);
    if (!state.win.isDestroyed()) state.win.webContents.send("chrome-bar-visible", true);
  }
  if (!state.dshView) return;
  try {
    state.win.contentView.removeChildView(state.dshView);
    state.dshView.webContents.destroy();
  } catch (_) {}
  state.dshView = null;
  setChromeBtns(false); // 回到启动页，隐藏「帮助 / View」按钮
}

// 挂载 dsh 主界面视图（先加载完成后才挂到窗口，避免空白间隔）
async function loadApp() {
  state.webReady = true;
  if (state.dshView) return;
  try {
    state.dshView = new WebContentsView({
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    // 视图背景跟随主题，避免 dsh 页加载期间的短暂白屏
    state.dshView.setBackgroundColor(color("windowBg", nativeTheme.shouldUseDarkColors));
    const wc = state.dshView.webContents;
    wc.on("did-finish-load", () => {
      injectTaskWatcher(wc);
      injectAboutOverlay(wc, nativeTheme.shouldUseDarkColors, state.currentLang);
      injectUpdateCheckOverlay(wc, nativeTheme.shouldUseDarkColors, state.currentLang);
      injectDropdown(wc, nativeTheme.shouldUseDarkColors, state.currentLang);
      injectFullscreenHint(wc, nativeTheme.shouldUseDarkColors, state.currentLang);
    });
    // 焦点在 dsh 页面时 F11/F12 快捷键仍然生效（before-input-event 按 webContents 分发）
    wc.on("before-input-event", (_e, input) => handleGlobalKey(input));
    wc.on("page-title-updated", (e) => e.preventDefault());
    // 外部链接转交系统默认浏览器
    wc.setWindowOpenHandler(({ url }) => {
      if (isExternalUrl(url)) shell.openExternal(url);
      return { action: "deny" };
    });
    wc.on("will-navigate", (e, url) => {
      if (isExternalUrl(url)) {
        e.preventDefault();
        shell.openExternal(url);
      }
    });
    await wc.loadURL(APP_URL);
    // 先加载完成后才挂载到窗口：加载期间用户停留在启动页，避免空白间隔
    state.win.contentView.addChildView(state.dshView);
    layoutDshView();
    setChromeBtns(true); // 进入主界面，顶栏显示「帮助 / View」按钮
  } catch (err) {
    state.webReady = false;
    log("[loadURL error] " + err.message);
    removeDshView();
    sendStatus({ state: "crashed", stderr: "无法加载页面：" + err.message + "\n\n" + state.dshOut });
  }
}

module.exports = {
  injectTaskWatcher,
  layoutDshView,
  removeDshView,
  loadApp,
  enterFullscreenMode,
  exitFullscreenMode,
  toggleFullscreenMode,
  handleGlobalKey,
};
