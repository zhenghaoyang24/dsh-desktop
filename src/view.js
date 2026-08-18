const { WebContentsView, nativeTheme, shell } = require("electron");
const { preloadPath, log } = require("./paths");
const { APP_URL, BAR_HEIGHT } = require("./constants");
const { state } = require("./state");
const { TASK_WATCHER } = require("./injected/task-watcher");
const { injectAboutOverlay, setHelpBtn } = require("./injected/index");
const { isExternalUrl } = require("./external");
const { sendStatus } = require("./status");

// 注入 dsh 网页的任务观察器：监听合成器主按钮的 停止生成/发送消息 切换，
// 回答完成后通过 window.electronAPI.notifyTaskComplete() 上报（主进程决定是否通知）
function injectTaskWatcher(wc) {
  if (!wc || wc.isDestroyed()) return;
  if (!wc.getURL().startsWith(APP_URL)) return; // 只注入 dsh 页面
  wc.executeJavaScript(TASK_WATCHER).catch((err) => log("[watcher] " + err.message));
}

// dsh 页面放入独立的 WebContentsView（位于顶栏下方），不改动 dsh 页面任何元素
function layoutDshView() {
  const win = state.win;
  if (!win || win.isDestroyed() || !state.dshView) return;
  const [w, h] = win.getContentSize();
  state.dshView.setBounds({ x: 0, y: BAR_HEIGHT, width: w, height: Math.max(0, h - BAR_HEIGHT) });
}

function removeDshView() {
  if (!state.dshView) return;
  try {
    state.win.contentView.removeChildView(state.dshView);
    state.dshView.webContents.destroy();
  } catch (_) {}
  state.dshView = null;
  setHelpBtn(false); // 回到启动页，隐藏「帮助」按钮
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
    state.dshView.setBackgroundColor(nativeTheme.shouldUseDarkColors ? "#151517" : "#f5f7fb");
    const wc = state.dshView.webContents;
    wc.on("did-finish-load", () => {
      injectTaskWatcher(wc);
      injectAboutOverlay(wc, nativeTheme.shouldUseDarkColors, state.currentLang);
    });
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
    setHelpBtn(true); // 进入主界面，顶栏显示「帮助」按钮
  } catch (err) {
    state.webReady = false;
    log("[loadURL error] " + err.message);
    removeDshView();
    sendStatus({ state: "crashed", stderr: "无法加载页面：" + err.message + "\n\n" + state.dshOut });
  }
}

module.exports = { injectTaskWatcher, layoutDshView, removeDshView, loadApp };
