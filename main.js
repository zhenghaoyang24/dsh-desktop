const {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  dialog,
  shell,
  nativeTheme,
  Notification,
  WebContentsView,
} = require("electron");
const { spawn, execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const PORT = 3080;
const APP_URL = `http://127.0.0.1:${PORT}`;
const HOME_URL = "https://www.deepseek.com/harness/";
const REPO_URL = "https://github.com/zhenghaoyang24/dsh-desktop";
const START_TIMEOUT_MS = 30000;

// 注入 dsh 网页的任务观察器：监听合成器主按钮的 停止生成/发送消息 切换，
// 回答完成后通过 window.electronAPI.notifyTaskComplete() 上报（主进程决定是否通知）
const TASK_WATCHER = `(() => {
  if (window.__dshellTaskWatcher) return;
  window.__dshellTaskWatcher = true;
  const COMPLETE_DELAY = 800;
  let generating = false, sawGenerating = false, userStopped = false, timer = null;
  const isGenerating = () => {
    const card = document.querySelector('[data-composer-card="true"]');
    if (!card) return false;
    if (card.querySelector('button[aria-label*="停止"], button[aria-label*="Stop"]')) return true;
    const primary = card.querySelector('button[class$="_primary"]');
    return !!primary && !!primary.querySelector('svg rect');
  };
  document.addEventListener('click', (e) => {
    if (!generating) return;
    const card = document.querySelector('[data-composer-card="true"]');
    const stopBtn = card && card.querySelector('button[aria-label*="停止"], button[aria-label*="Stop"]');
    if (stopBtn && stopBtn.contains(e.target)) userStopped = true;
  }, true);
  const check = () => {
    const now = isGenerating();
    if (now && !generating) {
      generating = true; sawGenerating = true; userStopped = false; clearTimeout(timer);
    } else if (!now && generating) {
      generating = false;
      clearTimeout(timer);
      if (sawGenerating && !userStopped) {
        timer = setTimeout(() => {
          if (!isGenerating()) {
            try { window.electronAPI && window.electronAPI.notifyTaskComplete(); } catch (_) {}
          }
        }, COMPLETE_DELAY);
      }
      sawGenerating = false;
    }
  };
  new MutationObserver(check).observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label', 'class'],
  });
  check();
})();`;

let win = null;
let dshProc = null;
let dshOwned = false;
let killTask = null; // 进行中的 dsh 清理任务（close 触发后 will-quit 需等待其完成）
let webReady = false;
let busy = false;
let lastStatus = null;
let dshOut = "";
// 用户在启动页确认的 dsh 路径（校验通过但尚未启动成功，启动成功后才写入缓存）
let pendingDshPath = null;
// 本次会话实际使用的 dsh 路径（自启时记录；复用时置空，设置弹窗回退读缓存）
let currentDshPath = null;
// dsh 启动方式：'app' = 应用自启；'reuse' = 复用已有实例
let startMode = null;
// dsh 页面所在独立视图（WebContentsView，位于顶栏下方）
let dshView = null;

const userData = () => app.getPath("userData");
const settingsFile = () => path.join(userData(), "settings.json");
const logFile = () => path.join(userData(), "logs", "dsh.log");

function log(line) {
  try {
    fs.mkdirSync(path.dirname(logFile()), { recursive: true });
    fs.appendFileSync(logFile(), line + "\n");
  } catch (_) {}
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), "utf8")) || {};
  } catch (_) {
    return {};
  }
}

function readThemePreference() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
  try {
    const lines = fs.readFileSync(path.join(home, "settings.yaml"), "utf8").split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!/^ui-theme:\s*$/.test(lines[i])) continue;
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\S/.test(lines[j])) break;
        const m = lines[j].match(/^\s+preference:\s*"?(\w+)"?\s*$/);
        if (m) return m[1];
      }
    }
  } catch (_) {}
  return "system";
}

function applyTheme() {
  const pref = readThemePreference();
  if (pref === "dark") nativeTheme.themeSource = "dark";
  else if (pref === "light") nativeTheme.themeSource = "light";
  else nativeTheme.themeSource = "system";
  const dark = nativeTheme.shouldUseDarkColors;
  if (win && !win.isDestroyed()) {
    win.setBackgroundColor(dark ? "#151517" : "#f5f7fb");
    // 任务栏图标随主题切换：暗色用白色 logo，亮色用黑色 logo
    win.setIcon(path.join(__dirname, "buildResources", dark ? "logo-light.png" : "logo.png"));
    if (process.platform === "win32") {
      // 自绘顶栏 + Window Controls Overlay：原生窗口按钮区颜色随主题
      win.setTitleBarOverlay({
        color: dark ? "#1b1b1c" : "#f9fafb",
        symbolColor: dark ? "#f9fafb" : "#1f2329",
        height: 30,
      });
    }
    // 注入的顶栏主题同步
    win.webContents.send("chrome-theme", dark);
  }
  return dark;
}

function startThemeWatch() {
  try {
    const home = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
    let timer = null;
    fs.watch(home, { persistent: false }, (_ev, fname) => {
      if (fname !== "settings.yaml") return;
      clearTimeout(timer);
      timer = setTimeout(() => applyTheme(), 300);
    });
  } catch (_) {}
}

function writeSettings(obj) {
  fs.mkdirSync(userData(), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(obj, null, 2));
}

function isCmd(p) {
  return /\.(cmd|bat)$/i.test(p);
}

function runDshCmd(dshPath, args) {
  if (isCmd(dshPath)) {
    return spawn("cmd.exe", ["/d", "/s", "/c", `""${dshPath}" ${args.join(" ")}"`], {
      windowsVerbatimArguments: true,
    });
  }
  return spawn(dshPath, args, {});
}

function verifyDsh(dshPath) {
  return new Promise((resolve) => {
    if (!dshPath || typeof dshPath !== "string") return resolve(null);
    if (!fs.existsSync(dshPath)) return resolve(null); // 快速预检：文件已不存在直接判无效
    const child = runDshCmd(dshPath, ["-V"]);
    let out = "";
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch (_) {}
    }, 5000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? out.trim() : null);
    });
  });
}

// 收集 PATH 上所有 dsh 候选（去重；优先 .cmd/.bat/.exe，全部无扩展名时才退回原样）
function findDshCandidates() {
  return new Promise((resolve) => {
    execFile("where.exe", ["dsh"], { windowsHide: true }, (err, stdout) => {
      if (err) return resolve([]);
      const hits = [
        ...new Set(
          stdout
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ];
      const withExt = hits.filter((h) => /\.(cmd|bat|exe)$/i.test(h));
      resolve(withExt.length ? withExt : hits);
    });
  });
}

function probePort(timeout = 3000) {
  return new Promise((resolve) => {
    const req = http.get(APP_URL, { timeout }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => {
        body += c;
        if (body.length > 131072) req.destroy();
      });
      res.on("end", () => {
        resolve({
          alive: true,
          match:
            body.includes("window.__DSH_BOOT__") &&
            /<title>\s*DeepSeek Harness\s*<\/title>/i.test(body),
        });
      });
      res.on("error", () => resolve({ alive: true, match: false }));
    });
    req.on("error", () => resolve({ alive: false, match: false }));
    req.on("timeout", () => req.destroy());
  });
}

// 找到并杀掉 3080 上的监听进程（兜底：dsh 服务可能已脱离 cmd 进程树成为孤儿进程）
function killPortOwner() {
  return new Promise((resolve) => {
    execFile("netstat.exe", ["-ano"], { windowsHide: true }, (err, stdout) => {
      if (err) return resolve();
      const line = stdout
        .split(/\r?\n/)
        .find((l) => /(127\.0\.0\.1|0\.0\.0\.0|\[::\]):3080\b.*LISTENING/i.test(l));
      const m = line && line.match(/(\d+)\s*$/);
      if (!m) return resolve();
      const tk = spawn("taskkill.exe", ["/pid", m[1], "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
        detached: true,
      });
      tk.unref();
      tk.on("error", resolve);
      tk.on("exit", resolve);
    });
  });
}

function killDsh() {
  if (!dshProc) return killTask; // 已启动过清理则返回进行中的任务，让 will-quit 等待
  const pid = dshProc.pid;
  const owned = dshOwned;
  dshProc = null;
  dshOwned = false;
  killTask = new Promise((resolve) => {
    const tk = spawn("taskkill.exe", ["/pid", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
      detached: true,
    });
    tk.unref();
    tk.on("error", finish);
    tk.on("exit", finish);
    function finish() {
      // 自启场景：再按端口兜底清掉可能残留的 3080 监听进程
      if (owned) killPortOwner().then(resolve);
      else resolve();
    }
  });
  return killTask;
}

function pushDshOutput(d) {
  const s = d.toString();
  dshOut = (dshOut + s).slice(-8000);
  log(s.replace(/\s+$/, ""));
}

function spawnDsh(dshPath) {
  webReady = false;
  dshOut = "";
  const child = runDshCmd(dshPath, ["web"]);
  dshProc = child;
  dshOwned = true;
  child.stdout.on("data", pushDshOutput);
  child.stderr.on("data", pushDshOutput);
  child.on("error", (err) => log("[spawn error] " + err.message));
  child.on("exit", (code) => {
    log(`[dsh exited] code=${code}`);
    if (webReady && dshProc === child) {
      removeDshView(); // 撤掉 dsh 视图，露出启动页的崩溃提示
      sendStatus({ state: "crashed", stderr: dshOut });
    }
  });
  return child;
}

function sendStatus(status) {
  lastStatus = status;
  if (win && !win.isDestroyed()) {
    win.webContents.send("status", status);
  }
}

function injectTaskWatcher(wc) {
  if (!wc || wc.isDestroyed()) return;
  if (!wc.getURL().startsWith(APP_URL)) return; // 只注入 dsh 页面
  wc.executeJavaScript(TASK_WATCHER).catch((err) => log("[watcher] " + err.message));
}

// dsh 页面放入独立的 WebContentsView（位于顶栏下方），不改动 dsh 页面任何元素
function layoutDshView() {
  if (!win || win.isDestroyed() || !dshView) return;
  const [w, h] = win.getContentSize();
  dshView.setBounds({ x: 0, y: 32, width: w, height: Math.max(0, h - 32) });
}

function removeDshView() {
  if (!dshView) return;
  try {
    win.contentView.removeChildView(dshView);
    dshView.webContents.destroy();
  } catch (_) {}
  dshView = null;
}

async function loadApp() {
  webReady = true;
  if (dshView) return;
  try {
    dshView = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    win.contentView.addChildView(dshView);
    layoutDshView();
    const wc = dshView.webContents;
    wc.on("did-finish-load", () => {
      injectTaskWatcher(wc);
      injectAboutOverlay(wc, nativeTheme.shouldUseDarkColors);
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
  } catch (err) {
    webReady = false;
    log("[loadURL error] " + err.message);
    removeDshView();
    sendStatus({ state: "crashed", stderr: "无法加载页面：" + err.message + "\n\n" + dshOut });
  }
}

function waitForPort(child, timeoutMs = START_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const start = Date.now();
    let settled = false;
    const finish = (r) => {
      if (!settled) {
        settled = true;
        clearInterval(timer);
        resolve(r);
      }
    };
    const timer = setInterval(async () => {
      const p = await probePort();
      if (p.alive && p.match) return finish({ ok: true });
      if (p.alive && !p.match) return finish({ ok: false, reason: "conflict" });
      if (Date.now() - start > timeoutMs) return finish({ ok: false, reason: "timeout" });
    }, 500);
    child.once("exit", () => finish({ ok: false, reason: "exit" }));
    child.once("error", () => finish({ ok: false, reason: "exit" }));
  });
}

async function startFlow() {
  if (busy) return;
  busy = true;
  killDsh();
  removeDshView(); // 重试/重启时先撤掉旧的 dsh 视图，回到启动页
  try {
    sendStatus({ state: "detecting" });
    const probe = await probePort();
    if (probe.alive) {
      if (probe.match) {
        dshOwned = false;
        pendingDshPath = null;
        currentDshPath = null; // 复用已有实例，非应用启动，路径回退读缓存
        startMode = "reuse";
        loadApp();
        return;
      }
      pendingDshPath = null;
      sendStatus({ state: "port-conflict" });
      return;
    }

    // ① 用户刚确认的路径优先；否则用缓存；都无效则列出候选让用户选择
    let dshPath = pendingDshPath || readSettings().dshPath || null;
    if (!(await verifyDsh(dshPath))) {
      pendingDshPath = null;
      const candidates = await findDshCandidates();
      sendStatus({ state: "select-dsh", candidates });
      return;
    }

    currentDshPath = dshPath;
    startMode = "app";
    sendStatus({ state: "starting", path: dshPath });
    const child = spawnDsh(dshPath);
    const result = await waitForPort(child);
    if (result.ok) {
      // 启动成功才把用户确认的路径写入缓存（永久）
      if (pendingDshPath) {
        writeSettings({ dshPath: pendingDshPath });
        pendingDshPath = null;
      }
      loadApp();
    } else if (result.reason === "conflict") {
      pendingDshPath = null;
      sendStatus({ state: "port-conflict" });
    } else if (result.reason === "timeout") {
      pendingDshPath = null;
      sendStatus({
        state: "failed",
        stderr: `启动超时（${START_TIMEOUT_MS / 1000} 秒）\n\n${dshOut}`,
      });
    } else {
      pendingDshPath = null;
      sendStatus({ state: "failed", stderr: "dsh 进程已退出\n\n" + dshOut });
    }
  } finally {
    busy = false;
  }
}

// ---- 自绘顶栏（标题栏）：注入到启动页与 dsh 页面 ----
const CHROME_CSS = `
.dshc-bar {
  position: fixed; top: 0; left: 0; right: 0; height: 32px;
  display: flex; align-items: center; gap: 8px;
  padding: 0 12px;
  padding-right: 148px; /* 给右侧原生窗口按钮留空间 */
  border-bottom: 1px solid var(--dshc-border);
  -webkit-app-region: drag;
  z-index: 2147483646;
  user-select: none;
  font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
}
html[data-dshc-theme="dark"] .dshc-bar { background: #1b1b1c; color: rgb(249, 250, 251); --dshc-border: rgba(255, 255, 255, 0.08); }
html[data-dshc-theme="light"] .dshc-bar { background: #f9fafb; color: #1f2329; --dshc-border: #e5e7eb; }
.dshc-brand { font-size: 13px; font-weight: 600; white-space: nowrap; flex-shrink: 0; }
.dshc-btn {
  -webkit-app-region: no-drag;
  border: 1px solid transparent; border-radius: 6px;
  padding: 3px 10px; font-size: 12px; cursor: pointer;
  background: transparent; color: inherit;
}
.dshc-btn:hover { background: rgba(128, 128, 128, 0.18); }
`;

function chromeScript(dark) {
  return `(() => {
  if (window.__dshChrome) return;
  window.__dshChrome = true;
  function mk(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined && text !== null) el.textContent = text;
    return el;
  }
  function applyTheme(d) {
    document.documentElement.setAttribute('data-dshc-theme', d ? 'dark' : 'light');
  }
  var bar = mk('div', 'dshc-bar');
  bar.appendChild(mk('div', 'dshc-brand', 'dsh-desktop'));
  var btnAbout = mk('button', 'dshc-btn', '关于');
  var btnHome = mk('button', 'dshc-btn', '官网');
  bar.appendChild(btnAbout);
  bar.appendChild(btnHome);
  document.documentElement.appendChild(bar);
  var api = window.electronAPI;
  btnAbout.addEventListener('click', function () { if (api && api.openAbout) api.openAbout(); });
  btnHome.addEventListener('click', function () { if (api && api.openHomepage) api.openHomepage(); });
  if (api && api.onChromeTheme) {
    api.onChromeTheme(applyTheme);
  }
  applyTheme(${dark ? "true" : "false"});
})();`;
}

// 「关于」浮层：页面内 fixed 覆盖层（遮罩 + 高斯模糊），不改变任何布局；
// 注入到 dsh 视图（弹在 dsh 内容之上，模糊的就是 dsh 页面本身）
const ABOUT_OVERLAY_CSS = `
.dsho-overlay {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  z-index: 2147483647;
}
.dsho-overlay[hidden] { display: none !important; }
.dsho-box {
  position: relative; width: 440px; max-width: 90vw;
  background: #ffffff; color: #1f2329;
  border-radius: 12px; padding: 20px 22px;
  font-size: 13px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.2);
  --dsho-border: #e5e7eb;
  --dsho-muted: #6b7280;
  --dsho-accent: rgb(86, 134, 254);
}
html[data-dshc-theme="dark"] .dsho-box {
  background: rgb(35, 35, 36); color: rgb(249, 250, 251);
  --dsho-border: rgba(255, 255, 255, 0.08);
  --dsho-muted: rgb(129, 133, 140);
  --dsho-accent: rgb(86, 134, 254);
}
.dsho-head {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 12px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--dsho-border);
}
.dsho-title { font-size: 15px; font-weight: 600; }
.dsho-close {
  border: none; background: none; font-size: 18px; line-height: 1;
  cursor: pointer; color: inherit; padding: 4px;
}
.dsho-row {
  padding: 8px 0; word-break: break-all;
  font-family: Consolas, "Courier New", monospace;
}
.dsho-footer {
  margin-top: 14px;
  padding-top: 8px;
  text-align: center;
  font-size: 12px;
  color: var(--dsho-muted);
}
.dsho-link {
  color: var(--dsho-accent);
  cursor: pointer;
  text-decoration: none;
}
.dsho-link:hover { text-decoration: underline; }
.dsho-log { display: flex; align-items: flex-start; gap: 8px; }
.dsho-log-path {
  flex: 1; min-width: 0; word-break: break-all;
  color: var(--dsho-accent);
  text-decoration: underline;
  cursor: pointer;
}
`;

function aboutOverlayScript(dark) {
  return `(() => {
  if (window.__dshAbout) return;
  var api = window.electronAPI;
  function mk(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined && text !== null) el.textContent = text;
    return el;
  }
  var overlay = mk('div', 'dsho-overlay');
  overlay.hidden = true;
  var box = mk('div', 'dsho-box');
  var head = mk('div', 'dsho-head');
  head.appendChild(mk('span', 'dsho-title', '关于'));
  var closeBtn = mk('button', 'dsho-close', '\u00d7');
  head.appendChild(closeBtn);
  box.appendChild(head);
  var body = mk('div', 'dsho-body');
  var pathRow = mk('div', 'dsho-row', 'dsh 路径：正在获取…');
  var verRow = mk('div', 'dsho-row', 'dsh 版本：正在获取…');
  var portRow = mk('div', 'dsho-row', '启动端口：正在获取…');
  var modeRow = mk('div', 'dsho-row', '启动方式：正在获取…');
  var logRow = mk('div', 'dsho-row dsho-log');
  logRow.appendChild(mk('span', '', '应用日志：'));
  var logPathSpan = mk('span', 'dsho-log-path', '…');
  logPathSpan.addEventListener('click', function () { if (api && api.openLog) api.openLog(); });
  logRow.appendChild(logPathSpan);
  body.appendChild(pathRow);
  body.appendChild(verRow);
  body.appendChild(portRow);
  body.appendChild(modeRow);
  body.appendChild(logRow);
  var footer = mk('div', 'dsho-footer');
  var repoLink = mk('a', 'dsho-link', 'dsh-desktop');
  repoLink.href = '#';
  repoLink.addEventListener('click', function (e) {
    e.preventDefault();
    if (api && api.openRepo) api.openRepo();
  });
  var verSpan = mk('span', 'dsho-ver', ' v…');
  footer.appendChild(repoLink);
  footer.appendChild(verSpan);
  box.appendChild(body);
  box.appendChild(footer);
  overlay.appendChild(box);
  document.documentElement.appendChild(overlay);
  function setTheme(d) {
    document.documentElement.setAttribute('data-dshc-theme', d ? 'dark' : 'light');
  }
  function refresh() {
    if (!api || !api.getAppInfo) return;
    api.getAppInfo().then(function (info) {
      pathRow.textContent = 'dsh 路径：' + (info && info.dshPath ? info.dshPath : '（未检测到）');
      verRow.textContent = 'dsh 版本：' + (info && info.dshVersion ? info.dshVersion : '（未检测到）');
      portRow.textContent = '启动端口：' + (info ? info.port : '-');
      modeRow.textContent = '启动方式：' + (info && info.startMode === 'app' ? '应用启动' : '复用已有实例');
      logPathSpan.textContent = info && info.logPath ? info.logPath : '';
      verSpan.textContent = ' v' + (info && info.version ? info.version : '-');
    }).catch(function () {});
  }
  function show() { refresh(); overlay.hidden = false; }
  function hide() { overlay.hidden = true; }
  closeBtn.addEventListener('click', hide);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) hide(); });
  if (api && api.onChromeTheme) api.onChromeTheme(setTheme);
  setTheme(${dark ? "true" : "false"});
  window.__dshAbout = { show: show };
})();`;
}

function injectAboutOverlay(wc, dark) {
  if (!wc || wc.isDestroyed()) return;
  wc.insertCSS(ABOUT_OVERLAY_CSS).catch((err) => log("[about-css] " + err.message));
  wc.executeJavaScript(aboutOverlayScript(dark)).catch((err) => log("[about] " + err.message));
}

function injectChrome(dark) {
  if (!win || win.isDestroyed()) return;
  if (!win.webContents.getURL().startsWith("file:")) return; // 只注入我们自己的启动页
  win.webContents.insertCSS(CHROME_CSS).catch((err) => log("[chrome-css] " + err.message));
  win.webContents
    .executeJavaScript(chromeScript(dark))
    .catch((err) => log("[chrome] " + err.message));
  injectAboutOverlay(win.webContents, dark); // 启动页兜底（dsh 视图未创建时）
}

// 外部链接（非本应用 3080 页面）一律交给系统默认浏览器打开
function isExternalUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol === "mailto:" || u.protocol === "tel:") return true;
    if (u.protocol === "http:" || u.protocol === "https:") {
      return !(u.hostname === "127.0.0.1" && u.port === String(PORT));
    }
  } catch (_) {}
  return false;
}

function createWindow(dark) {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: `dsh-desktop ${app.getVersion()}`,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: dark ? "#1b1b1c" : "#f9fafb",
      symbolColor: dark ? "#f9fafb" : "#1f2329",
      height: 30,
    },
    backgroundColor: dark ? "#151517" : "#f5f7fb",
    icon: path.join(__dirname, "buildResources", dark ? "logo-light.png" : "logo.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
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
  win.loadFile(path.join(__dirname, "renderer", "status.html"), {
    query: { theme: dark ? "dark" : "light" },
  });
  win.webContents.on("did-finish-load", () => {
    if (lastStatus) win.webContents.send("status", lastStatus);
    injectChrome(nativeTheme.shouldUseDarkColors);
  });
  win.webContents.on("before-input-event", (_e, input) => {
    if (input.type === "keyDown" && input.key === "F12") {
      const target =
        dshView && !dshView.webContents.isDestroyed() ? dshView.webContents : win.webContents;
      target.toggleDevTools();
    }
  });
  win.on("page-title-updated", (e) => e.preventDefault());
  win.on("resize", () => layoutDshView());
  win.on("maximize", () => layoutDshView());
  win.on("unmaximize", () => layoutDshView());
  win.on("close", () => killDsh());
  win.on("closed", () => {
    win = null;
    dshView = null;
  });
}

ipcMain.handle("confirm-dsh-path", async (_e, p) => {
  if (typeof p !== "string" || !p.trim()) return { ok: false, error: "路径不能为空" };
  p = p.trim();
  const version = await verifyDsh(p);
  if (!version) return { ok: false, error: "未检测到此路径下有 dsh" };
  pendingDshPath = p; // 暂存，启动成功后才写入缓存
  return { ok: true, version };
});

ipcMain.handle("browse-dsh-path", async () => {
  const r = await dialog.showOpenDialog(win, {
    title: "选择 dsh 可执行文件",
    properties: ["openFile"],
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle("retry", () => startFlow());
ipcMain.handle("restart-dsh", () => startFlow());
ipcMain.handle("open-homepage", () => shell.openExternal(HOME_URL));
ipcMain.handle("open-repo", () => shell.openExternal(REPO_URL));
ipcMain.handle("open-about", () => {
  // 弹在 dsh 视图之上；视图未创建（启动阶段）时用启动页兜底
  const target =
    dshView && !dshView.webContents.isDestroyed() ? dshView.webContents : win.webContents;
  target.executeJavaScript("window.__dshAbout && window.__dshAbout.show()").catch(() => {});
});
// 关于浮层数据：dsh 路径按 自启记录 → 缓存 → PATH 候选 依次检测，取第一个有效值
ipcMain.handle("get-app-info", async () => {
  let dshPath = null;
  let dshVersion = null;
  const seen = new Set();
  for (const c of [currentDshPath, readSettings().dshPath, ...(await findDshCandidates())]) {
    if (!c || seen.has(c)) continue;
    seen.add(c);
    const v = await verifyDsh(c);
    if (v) {
      dshPath = c;
      dshVersion = v; // verifyDsh 成功时返回 dsh -V 的输出
      break;
    }
  }
  return {
    version: app.getVersion(),
    dshPath,
    dshVersion,
    startMode: startMode === "app" ? "app" : "reuse",
    port: PORT,
    logPath: logFile(),
  };
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
  if (!win || win.isDestroyed()) return;
  if (!win.isMinimized()) return;
  const n = new Notification({ title: "DeepSeek Harness", body: "回答已完成" });
  n.on("click", () => {
    if (win && !win.isDestroyed()) {
      win.restore();
      win.focus();
    }
  });
  n.show();
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  // Windows 通知 toast / 任务栏分组需要 AUMID（与 electron-builder.yml 的 appId 一致）
  app.setAppUserModelId("com.dsh.desktop");
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    // 'system' 模式下 OS 主题变化时重新应用（背景色 + 标题栏图标）
    nativeTheme.on("updated", applyTheme);
    const dark = applyTheme();
    startThemeWatch();
    createWindow(dark);
    startFlow();
  });
}

app.on("will-quit", (e) => {
  const task = killDsh();
  if (task) {
    e.preventDefault();
    task.then(() => app.exit(0));
  }
});
app.on("window-all-closed", () => app.quit());
