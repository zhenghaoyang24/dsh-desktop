// 入口：应用生命周期 + 装配各功能模块（业务逻辑见 src/）
const { app, nativeTheme } = require("electron");
const { state } = require("./src/state");
const { applyTheme, startSettingsWatch } = require("./src/theme");
const { applyLanguage } = require("./src/i18n");
const { createWindow } = require("./src/window");
const { startFlow } = require("./src/startup");
const { killDsh } = require("./src/dsh");
require("./src/ipc"); // 注册全部 ipcMain 处理器

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  // Windows 通知 toast / 任务栏分组需要 AUMID（与 electron-builder.yml 的 appId 一致）
  app.setAppUserModelId("github.zhenghaoyang24.dsh-desktop");
  app.on("second-instance", () => {
    if (state.win) {
      if (state.win.isMinimized()) state.win.restore();
      state.win.focus();
    }
  });
  app.whenReady().then(() => {
    // 'system' 模式下 OS 主题变化时重新应用（背景色 + 标题栏图标）
    nativeTheme.on("updated", applyTheme);
    state.currentLang = applyLanguage(); // 窗口创建前先定好语言（启动页 loadFile 的 ?lang= 用到）
    const dark = applyTheme();
    startSettingsWatch(); // 主题 + 语言均从 settings.yaml 实时同步
    createWindow(dark);
    startFlow();
  });
}

app.on("will-quit", (e) => {
  const task = killDsh(state.killOnClose);
  if (task) {
    e.preventDefault();
    task.then(() => app.exit(0));
  }
});
app.on("window-all-closed", () => app.quit());
