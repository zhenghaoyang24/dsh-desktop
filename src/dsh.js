const fs = require("fs");
const cp = require("child_process");
const { isFile } = require("./settings-store");
const { probePort, killPortOwner } = require("./port");
const { log } = require("./paths");
const { state } = require("./state");
const { sendStatus } = require("./status");
const { removeDshView } = require("./view");
const { START_TIMEOUT_MS, DSH_NPM_NAME } = require("./constants");

function isCmd(p) {
  return /\.(cmd|bat)$/i.test(p);
}

function runDshCmd(dshPath, args) {
  if (isCmd(dshPath)) {
    return cp.spawn("cmd.exe", ["/d", "/s", "/c", `""${dshPath}" ${args.join(" ")}"`], {
      windowsVerbatimArguments: true,
    });
  }
  return cp.spawn(dshPath, args, {});
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
    cp.execFile("where.exe", ["dsh"], { windowsHide: true }, (err, stdout) => {
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

// always=true（关闭应用时）：清掉 3080 上的 dsh，不管是否由本应用启动；
// 默认（启动/重试清场）：只清理应用自启的进程，避免误杀可复用的外部 dsh
function killDsh(always) {
  if (state.killTask) return state.killTask; // 有进行中的清理任务则直接复用（供 will-quit 等待）
  const pid = state.dshProc && state.dshProc.pid;
  const owned = state.dshOwned;
  state.dshProc = null;
  state.dshOwned = false;
  if (!pid && !owned && !always) return null; // 非自启场景启动/重试不清理，保留复用机会
  state.killTask = new Promise((resolve) => {
    const done = () => {
      state.killTask = null;
      resolve();
    };
    const finish = () => {
      // 按端口兜底清掉 3080 上的监听进程：
      // 自启场景收编脱离进程树的孤儿；always 关闭时连复用的外部 dsh 一并关闭
      if (owned || always) killPortOwner().then(done);
      else done();
    };
    if (!pid) return finish();
    const tk = cp.spawn("taskkill.exe", ["/pid", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
      detached: true,
    });
    tk.unref();
    tk.on("error", finish);
    tk.on("exit", finish);
  });
  return state.killTask;
}

function pushDshOutput(d) {
  const s = d.toString();
  state.dshOut = (state.dshOut + s).slice(-8000);
  log(s.replace(/\s+$/, ""));
}

function spawnDsh(dshPath) {
  state.webReady = false;
  state.dshOut = "";
  const child = runDshCmd(dshPath, ["web"]);
  state.dshProc = child;
  state.dshOwned = true;
  child.stdout.on("data", pushDshOutput);
  child.stderr.on("data", pushDshOutput);
  child.on("error", (err) => log("[spawn error] " + err.message));
  child.on("exit", (code) => {
    log(`[dsh exited] code=${code}`);
    if (state.webReady && state.dshProc === child) {
      removeDshView(); // 撤掉 dsh 视图，露出启动页的崩溃提示
      sendStatus({ state: "crashed", stderr: state.dshOut });
    }
  });
  return child;
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

// 检查 npm registry 上 dsh 的最新版本
// 走 cmd.exe /c 继承完整用户环境（PATH、注册表、用户配置等），等同于在终端里敲 npm view
// 返回 { version: "x.y.z" | null, error: string | null }
function checkLatestDshVersion() {
  return new Promise((resolve) => {
    const child = cp.spawn(
      "cmd.exe",
      ["/d", "/s", "/c", `"npm view ${DSH_NPM_NAME} version"`],
      { windowsHide: true, windowsVerbatimArguments: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    const timer = setTimeout(() => {
      try { child.kill(); } catch (_) {}
    }, 15000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ version: null, error: "npm_not_found" });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const s = out.trim().toLowerCase();
        if (s.includes("enoent") || s.includes("not found") || s.includes("'" + DSH_NPM_NAME.toLowerCase() + "' is not recognized")) {
          return resolve({ version: null, error: "npm_not_found" });
        }
        if (s.includes("network") || s.includes("connect") || s.includes("timeout") || s.includes("eresolve")) {
          return resolve({ version: null, error: "network" });
        }
        return resolve({ version: null, error: "unknown" });
      }
      const ver = out.trim();
      if (/^\d+\.\d+\.\d+/.test(ver)) {
        resolve({ version: ver, error: null });
      } else {
        resolve({ version: null, error: "unknown" });
      }
    });
  });
}

module.exports = {
  isCmd,
  runDshCmd,
  verifyDsh,
  findDshCandidates,
  killDsh,
  spawnDsh,
  waitForPort,
  pushDshOutput,
  checkLatestDshVersion,
};
