const { ipcMain, dialog, shell, Notification, app } = require("electron");
const fs = require("fs");
const path = require("path");
const { state } = require("./state");
const { t } = require("./i18n");
const { verifyDsh, findDshCandidates, checkLatestDshVersion } = require("./dsh");
const { readSettings } = require("./settings-store");
const { startFlow } = require("./startup");
const { showAboutDialog, showUpdateCheckDialog, toggleDropdown } = require("./injected/index");
const { log, logFile } = require("./paths");
const { PORT, HOME_URL, COMMUNITY_URL, AWESOME_DSH_PLUGIN_URL, REPO_URL, DSH_NPM_NAME, PANEL_WIDTH } = require("./constants");
const { readDirectory, readFileContent, writeFileContent, getWorkspaceRoot } = require("./files");
const { layoutDshView, toggleFullscreenMode } = require("./view");

ipcMain.handle("confirm-dsh-path", async (_e, p) => {
  if (typeof p !== "string" || !p.trim()) return { ok: false, error: t("errPathEmpty") };
  p = p.trim();
  const version = await verifyDsh(p);
  if (!version) return { ok: false, error: t("errNoDsh") };
  state.pendingDshPath = p; // 暂存，启动成功后才写入缓存
  return { ok: true, version };
});

ipcMain.handle("browse-dsh-path", async () => {
  const r = await dialog.showOpenDialog(state.win, {
    title: "选择 dsh 可执行文件",
    properties: ["openFile"],
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle("retry", () => startFlow());
ipcMain.handle("restart-dsh", () => startFlow());
ipcMain.handle("open-repo", () => shell.openExternal(REPO_URL));

// 自定义下拉菜单（帮助 / View，替代原生 Menu.popup）：菜单 UI 由注入脚本渲染在页面内
// （dsh 视图，启动页兜底），坐标换算与打开/关闭见 injected/index.js 的 toggleDropdown。
// 点击菜单按钮 → 主进程推送 dropdown-popup 并置 dropdown-menu-state=true（对应按钮高亮）；
// 菜单自行关闭（点击外部 / Escape / 点击菜单项）→ dropdown-closed 复位按钮高亮。
ipcMain.handle("open-menu", (_e, menuId, rect) => {
  if (menuId !== "help" && menuId !== "view") return;
  toggleDropdown(menuId, rect);
});

// 菜单项动作：由注入的自定义菜单点击触发（menuId + 动作 id 白名单）
ipcMain.on("dropdown-action", (_e, menuId, action) => {
  if (menuId === "help") {
    switch (action) {
      case "current-dsh":
        showAboutDialog("dsh");
        break;
      case "check-update":
        showUpdateCheckDialog();
        break;
      case "home":
        shell.openExternal(HOME_URL);
        break;
      case "community":
        shell.openExternal(COMMUNITY_URL);
        break;
      case "awesome-plugin":
        shell.openExternal(AWESOME_DSH_PLUGIN_URL);
        break;
      case "about":
        showAboutDialog("app");
        break;
      default:
        log("[menu] unknown action: " + action);
    }
  } else if (menuId === "view") {
    switch (action) {
      case "maximize":
        toggleFullscreenMode(); // View → 最大化：内容全屏（窗口全屏 + 隐藏顶栏，F11 退出）
        break;
      default:
        log("[menu] unknown action: " + action);
    }
  } else {
    log("[menu] unknown menu: " + menuId);
  }
});

// 菜单自行关闭：复位打开状态与按钮高亮
ipcMain.on("dropdown-closed", (_e, menuId) => {
  if (state.openMenu !== menuId) return;
  state.openMenu = null;
  if (state.win && !state.win.isDestroyed()) {
    state.win.webContents.send("dropdown-menu-state", menuId, false);
  }
});

// 检查 dsh 更新：获取当前版本 + 比较 npm registry 上的最新版本
ipcMain.handle("check-dsh-update", async () => {
  // 取当前版本：优先用缓存，失败则重新验证
  let currentVersion = null;
  if (state.appInfoCache && state.appInfoCache.dshVersion) {
    currentVersion = state.appInfoCache.dshVersion;
  } else {
    const seen = new Set();
    for (const c of [
      state.currentDshPath,
      readSettings().dshPath,
      ...(await findDshCandidates()),
    ]) {
      if (!c || seen.has(c)) continue;
      seen.add(c);
      const v = await verifyDsh(c);
      if (v) { currentVersion = v; break; }
    }
  }
  // 检查最新版本（走 cmd.exe 继承完整用户环境）
  const result = await checkLatestDshVersion();
  const latestVersion = result.version;
  const error = result.error;
  // 语义化版本比较: 取第一段数字部分比较
  let hasUpdate = false;
  if (currentVersion && latestVersion) {
    const cur = currentVersion.match(/^\d+\.\d+\.\d+/);
    const lat = latestVersion.match(/^\d+\.\d+\.\d+/);
    if (cur && lat) hasUpdate = lat[0] !== cur[0];
  }
  return { currentVersion, latestVersion, hasUpdate, error, pkgName: DSH_NPM_NAME };
});

// 关于浮层数据：会话内缓存（首次探测：自启记录 → 缓存 → PATH 候选，取第一个有效值；
// 之后直接复用，startFlow 时失效——运行中的 dsh 可能已变化）
ipcMain.handle("get-app-info", async () => {
  if (state.appInfoCache) return state.appInfoCache;
  let dshPath = null;
  let dshVersion = null;
  const seen = new Set();
  for (const c of [
    state.currentDshPath,
    readSettings().dshPath,
    ...(await findDshCandidates()),
  ]) {
    if (!c || seen.has(c)) continue;
    seen.add(c);
    const v = await verifyDsh(c);
    if (v) {
      dshPath = c;
      dshVersion = v; // verifyDsh 成功时返回 dsh -V 的输出
      break;
    }
  }
  state.appInfoCache = {
    version: app.getVersion(),
    dshPath,
    dshVersion,
    startMode: state.startMode === "app" ? "app" : "reuse",
    port: PORT,
    logPath: logFile(),
  };
  return state.appInfoCache;
});

ipcMain.handle("open-log", () => {
  const file = logFile();
  if (fs.existsSync(file)) {
    shell.showItemInFolder(file);
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    shell.openPath(path.dirname(file));
  }
});

// 回答完成上报：只在窗口最小化时弹系统通知
ipcMain.on("task-complete", () => {
  if (!state.win || state.win.isDestroyed()) return;
  if (!state.win.isMinimized()) return;
  const n = new Notification({ title: "DeepSeek Harness", body: t("toastBody") });
  n.on("click", () => {
    if (state.win && !state.win.isDestroyed()) {
      state.win.restore();
      state.win.focus();
    }
  });
  n.show();
});

// 文件树面板：切换开关，重置 dsh 视图布局，通知启动页
ipcMain.handle("toggle-file-panel", () => {
  state.filePanelOpen = !state.filePanelOpen;
  layoutDshView();
  if (state.win && !state.win.isDestroyed()) {
    state.win.webContents.send("file-panel-state", state.filePanelOpen);
  }
  return { open: state.filePanelOpen };
});

// 读取目录内容
ipcMain.handle("read-directory", (_e, dirPath) => {
  return readDirectory(dirPath);
});

// 读取文件内容
ipcMain.handle("read-file", (_e, filePath) => {
  return readFileContent(filePath);
});

// 写入文件内容
ipcMain.handle("write-file", (_e, filePath, content) => {
  return writeFileContent(filePath, content);
});

// 获取工作区根目录
ipcMain.handle("get-workspace-root", () => {
  return getWorkspaceRoot();
});

module.exports = {};
