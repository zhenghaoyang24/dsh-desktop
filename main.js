const { app, BrowserWindow, Menu, ipcMain, dialog, shell, nativeTheme } = require('electron');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const PORT = 3080;
const APP_URL = `http://127.0.0.1:${PORT}`;
const HOME_URL = 'https://www.deepseek.com/harness/';
const START_TIMEOUT_MS = 30000;

let win = null;
let dshProc = null;
let dshOwned = false;
let webReady = false;
let busy = false;
let lastStatus = null;
let dshOut = '';

const userData = () => app.getPath('userData');
const settingsFile = () => path.join(userData(), 'settings.json');
const logFile = () => path.join(userData(), 'logs', 'dsh.log');

function log(line) {
  try {
    fs.mkdirSync(path.dirname(logFile()), { recursive: true });
    fs.appendFileSync(logFile(), line + '\n');
  } catch (_) {}
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) || {};
  } catch (_) {
    return {};
  }
}

function readThemePreference() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  try {
    const lines = fs.readFileSync(path.join(home, 'settings.yaml'), 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!/^ui-theme:\s*$/.test(lines[i])) continue;
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\S/.test(lines[j])) break;
        const m = lines[j].match(/^\s+preference:\s*"?(\w+)"?\s*$/);
        if (m) return m[1];
      }
    }
  } catch (_) {}
  return 'system';
}

function applyTheme() {
  const pref = readThemePreference();
  if (pref === 'dark') nativeTheme.themeSource = 'dark';
  else if (pref === 'light') nativeTheme.themeSource = 'light';
  else nativeTheme.themeSource = 'system';
  const dark = nativeTheme.shouldUseDarkColors;
  if (win && !win.isDestroyed()) {
    win.setBackgroundColor(dark ? '#151517' : '#f5f7fb');
    // 标题栏左上角图标随主题切换：暗色用白色 logo，亮色用黑色 logo
    win.setIcon(path.join(__dirname, 'buildResources', dark ? 'logo-light.png' : 'logo.png'));
  }
  return dark;
}

function startThemeWatch() {
  try {
    const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
    let timer = null;
    fs.watch(home, { persistent: false }, (_ev, fname) => {
      if (fname !== 'settings.yaml') return;
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
    return spawn('cmd.exe', ['/d', '/s', '/c', `""${dshPath}" ${args.join(' ')}"`], {
      windowsVerbatimArguments: true,
    });
  }
  return spawn(dshPath, args, {});
}

function verifyDsh(dshPath) {
  return new Promise((resolve) => {
    if (!dshPath || typeof dshPath !== 'string') return resolve(null);
    const child = runDshCmd(dshPath, ['-V']);
    let out = '';
    const timer = setTimeout(() => {
      try { child.kill(); } catch (_) {}
    }, 8000);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', () => { clearTimeout(timer); resolve(null); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? out.trim() : null);
    });
  });
}

function findDshOnPath() {
  return new Promise((resolve) => {
    execFile('where.exe', ['dsh'], { windowsHide: true }, (err, stdout) => {
      if (err) return resolve(null);
      const hits = stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      const hit = hits.find((h) => /\.(cmd|bat|exe)$/i.test(h)) || hits[0];
      resolve(hit || null);
    });
  });
}

function probePort(timeout = 3000) {
  return new Promise((resolve) => {
    const req = http.get(APP_URL, { timeout }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => {
        body += c;
        if (body.length > 131072) req.destroy();
      });
      res.on('end', () => {
        resolve({
          alive: true,
          match:
            body.includes('window.__DSH_BOOT__') &&
            /<title>\s*DeepSeek Harness\s*<\/title>/i.test(body),
        });
      });
      res.on('error', () => resolve({ alive: true, match: false }));
    });
    req.on('error', () => resolve({ alive: false, match: false }));
    req.on('timeout', () => req.destroy());
  });
}

function killDsh() {
  if (!dshProc) return null;
  const pid = dshProc.pid;
  dshProc = null;
  dshOwned = false;
  return new Promise((resolve) => {
    const tk = spawn('taskkill.exe', ['/pid', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
      detached: true,
    });
    tk.unref();
    tk.on('error', resolve);
    tk.on('exit', resolve);
  });
}

function pushDshOutput(d) {
  const s = d.toString();
  dshOut = (dshOut + s).slice(-8000);
  log(s.replace(/\s+$/, ''));
}

function spawnDsh(dshPath) {
  webReady = false;
  dshOut = '';
  const child = runDshCmd(dshPath, ['web']);
  dshProc = child;
  dshOwned = true;
  child.stdout.on('data', pushDshOutput);
  child.stderr.on('data', pushDshOutput);
  child.on('error', (err) => log('[spawn error] ' + err.message));
  child.on('exit', (code) => {
    log(`[dsh exited] code=${code}`);
    if (webReady && dshProc === child) {
      sendStatus({ state: 'crashed', stderr: dshOut });
    }
  });
  return child;
}

function sendStatus(status) {
  lastStatus = status;
  if (win && !win.isDestroyed()) {
    win.webContents.send('status', status);
  }
}

async function loadApp() {
  webReady = true;
  try {
    await win.loadURL(APP_URL);
  } catch (err) {
    webReady = false;
    log('[loadURL error] ' + err.message);
    sendStatus({ state: 'crashed', stderr: '无法加载页面：' + err.message + '\n\n' + dshOut });
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
      if (p.alive && !p.match) return finish({ ok: false, reason: 'conflict' });
      if (Date.now() - start > timeoutMs) return finish({ ok: false, reason: 'timeout' });
    }, 500);
    child.once('exit', () => finish({ ok: false, reason: 'exit' }));
    child.once('error', () => finish({ ok: false, reason: 'exit' }));
  });
}

async function startFlow() {
  if (busy) return;
  busy = true;
  killDsh();
  try {
    sendStatus({ state: 'detecting' });
    const probe = await probePort();
    if (probe.alive) {
      if (probe.match) {
        dshOwned = false;
        loadApp();
        return;
      }
      sendStatus({ state: 'port-conflict' });
      return;
    }

    let dshPath = readSettings().dshPath || null;
    if (!(await verifyDsh(dshPath))) dshPath = await findDshOnPath();
    if (!dshPath) {
      sendStatus({ state: 'no-dsh' });
      return;
    }

    sendStatus({ state: 'starting', path: dshPath });
    const child = spawnDsh(dshPath);
    const result = await waitForPort(child);
    if (result.ok) {
      loadApp();
    } else if (result.reason === 'conflict') {
      sendStatus({ state: 'port-conflict' });
    } else if (result.reason === 'timeout') {
      sendStatus({
        state: 'failed',
        stderr: `启动超时（${START_TIMEOUT_MS / 1000} 秒）\n\n${dshOut}`,
      });
    } else {
      sendStatus({ state: 'failed', stderr: 'dsh 进程已退出\n\n' + dshOut });
    }
  } finally {
    busy = false;
  }
}

function createWindow(dark) {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'DeepSeek Harness',
    backgroundColor: dark ? '#151517' : '#f5f7fb',
    icon: path.join(__dirname, 'buildResources', dark ? 'logo-light.png' : 'logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'renderer', 'status.html'), {
    query: { theme: dark ? 'dark' : 'light' },
  });
  win.webContents.on('did-finish-load', () => {
    if (lastStatus) win.webContents.send('status', lastStatus);
  });
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      win.webContents.toggleDevTools();
    }
  });
  win.on('page-title-updated', (e) => e.preventDefault());
  win.on('close', () => killDsh());
  win.on('closed', () => { win = null; });
}

ipcMain.handle('set-dsh-path', async (_e, p) => {
  if (typeof p !== 'string' || !p.trim()) return { ok: false, error: '路径不能为空' };
  p = p.trim();
  const version = await verifyDsh(p);
  if (!version) return { ok: false, error: '路径无效，未检测到 dsh 可执行文件' };
  writeSettings({ dshPath: p });
  return { ok: true, version };
});

ipcMain.handle('browse-dsh-path', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: '选择 dsh 可执行文件',
    properties: ['openFile'],
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('open-homepage', () => shell.openExternal(HOME_URL));
ipcMain.handle('retry', () => startFlow());
ipcMain.handle('restart-dsh', () => startFlow());

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    // 'system' 模式下 OS 主题变化时重新应用（背景色 + 标题栏图标）
    nativeTheme.on('updated', applyTheme);
    const dark = applyTheme();
    startThemeWatch();
    createWindow(dark);
    startFlow();
  });
}

app.on('will-quit', (e) => {
  const task = killDsh();
  if (task) {
    e.preventDefault();
    task.then(() => app.exit(0));
  }
});
app.on('window-all-closed', () => app.quit());
