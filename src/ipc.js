const { ipcMain, dialog, shell, Menu, Notification, app } = require("electron");
const fs = require("fs");
const path = require("path");
const { state } = require("./state");
const { t } = require("./i18n");
const { verifyDsh, findDshCandidates, checkLatestDshVersion } = require("./dsh");
const { readSettings } = require("./settings-store");
const { startFlow } = require("./startup");
const { showAboutDialog, showUpdateCheckDialog, resolveHelpHover } = require("./injected/index");
const { log, logFile } = require("./paths");
const { PORT, HOME_URL, COMMUNITY_URL, AWESOME_DSH_PLUGIN_URL, REPO_URL, DSH_NPM_NAME, PANEL_WIDTH } = require("./constants");
const { readDirectory, readFileContent, writeFileContent, getWorkspaceRoot } = require("./files");
const { layoutDshView } = require("./view");

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

// 「帮助」下拉菜单：点击后出现在按钮正下方、左对齐。
// Menu.popup 的 x/y 相对窗口内容区（与渲染进程 getBoundingClientRect 的视口坐标同原点），
// 直接传递即可，无需叠加 getContentBounds()（那会再次加上窗口屏幕原点导致位置错位）。
// 菜单项直接在主进程执行；菜单打开期间用 help-menu-state 抑制按钮 hover，关闭（callback）时复位
ipcMain.handle("open-help-menu", (_e, rect) => {
  if (!state.win || state.win.isDestroyed()) return;
  const menu = Menu.buildFromTemplate([
    { label: t("menuCurrentDsh"), click: () => showAboutDialog("dsh") },
    { label: t("menuCheckUpdate"), click: () => showUpdateCheckDialog() },
    { label: t("menuHome"), click: () => shell.openExternal(HOME_URL) },
    { type: "separator" },
    { label: t("menuCommunity"), click: () => shell.openExternal(COMMUNITY_URL) },
    { label: t("menuAwesomePlugin"), click: () => shell.openExternal(AWESOME_DSH_PLUGIN_URL) },
    { type: "separator" },
    { label: t("menuAbout"), click: () => showAboutDialog("app") },
  ]);
  const setMenuOpen = (open) => {
    if (state.win && !state.win.isDestroyed()) state.win.webContents.send("help-menu-state", open);
  };
  setMenuOpen(true);
  try {
    // x/y 相对窗口内容区（与按钮的视口坐标一致）；不要叠加 win.getContentBounds()，否则菜单会错位
    const x = rect && Number.isFinite(rect.x) ? Math.round(rect.x) : undefined;
    const y = rect && Number.isFinite(rect.y) ? Math.round(rect.y) : undefined;
    menu.popup({
      window: state.win,
      x,
      y,
      callback: () => {
        setMenuOpen(false);
        // 菜单刚关闭时原生菜单窗口尚在销毁，稍等一拍再推送鼠标位置刷新 hover
        setTimeout(resolveHelpHover, 0);
      },
    });
  } catch (err) {
    log("[menu] " + err.message);
    setMenuOpen(false);
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
