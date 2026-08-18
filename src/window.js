const { BrowserWindow, Menu, dialog, shell, nativeTheme, app } = require("electron");
const { state } = require("./state");
const { buildResource, statusHtml, preloadPath } = require("./paths");
const { t } = require("./i18n");
const { killDsh } = require("./dsh");
const { layoutDshView } = require("./view");
const { injectChrome } = require("./injected/index");
const { isExternalUrl } = require("./external");
const { color } = require("./theme-palette");

function createWindow(dark) {
  state.win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: `dsh-desktop ${app.getVersion()}`,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: color("barBg", dark),
      symbolColor: color("symbol", dark),
      height: 30,
    },
    backgroundColor: color("windowBg", dark),
    icon: buildResource(dark ? "logo-light.png" : "logo.png"),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const win = state.win;
  Menu.setApplicationMenu(null);
  // 新窗口（target=_blank / window.open）与页面内导航：外部链接转交系统浏览器，本应用页面照常
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (isExternalUrl(url)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
  win.loadFile(statusHtml, {
    query: { theme: dark ? "dark" : "light", lang: state.currentLang },
  });
  win.webContents.on("did-finish-load", () => {
    if (state.lastStatus) win.webContents.send("status", state.lastStatus);
    injectChrome(nativeTheme.shouldUseDarkColors);
  });
  win.webContents.on("before-input-event", (_e, input) => {
    if (input.type === "keyDown" && input.key === "F12") {
      const target =
        state.dshView && !state.dshView.webContents.isDestroyed()
          ? state.dshView.webContents
          : win.webContents;
      target.toggleDevTools();
    }
  });
  win.on("page-title-updated", (e) => e.preventDefault());
  win.on("resize", () => layoutDshView());
  win.on("maximize", () => layoutDshView());
  win.on("unmaximize", () => layoutDshView());
  win.on("close", (e) => {
    // 复用场景：先弹窗询问是否一并关闭非应用启动的 dsh；应用自启则退出即回收
    if (state.closePromptDone || state.startMode !== "reuse") {
      if (state.startMode !== "reuse") state.killOnClose = true;
      killDsh(state.killOnClose);
      return;
    }
    if (state.closePromptPending) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    state.closePromptPending = true;
    dialog
      .showMessageBox(win, {
        type: "question",
        noLink: true,
        title: `dsh-desktop ${app.getVersion()}`,
        message: t("closeReuseMessage"),
        detail: t("closeReuseDetail"),
        buttons: [t("closeDsh"), t("keepDsh")],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        state.closePromptPending = false;
        state.closePromptDone = true;
        state.killOnClose = response === 0;
        win.close();
      })
      .catch(() => {
        state.closePromptPending = false;
        state.closePromptDone = true;
        state.killOnClose = false;
        win.close();
      });
  });
  win.on("closed", () => {
    state.win = null;
    state.dshView = null;
  });
}

module.exports = { createWindow };
