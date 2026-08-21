const { state } = require("./state");
const { START_TIMEOUT_MS } = require("./constants");
const { log } = require("./paths");
const { killDsh, spawnDsh, waitForPort, verifyDsh, findDshCandidates } = require("./dsh");
const { probePort } = require("./port");
const { readSettings, writeSettings, isFile } = require("./settings-store");
const { loadApp, removeDshView } = require("./view");
const { sendStatus } = require("./status");

function startFailureText(result) {
  return result.reason === "timeout"
    ? `启动超时（${START_TIMEOUT_MS / 1000} 秒）\n\n${state.dshOut}`
    : `dsh 进程已退出\n\n${state.dshOut}`;
}

// 启动状态机：探测 3080 → 复用 / 端口冲突 / 选择路径 / 自启 → 进入主界面
async function startFlow() {
  if (state.busy) return;
  state.busy = true;
  state.appInfoCache = null; // 重新探测后，关于浮层的缓存随之失效
  killDsh();
  removeDshView(); // 重试/重启时先撤掉旧的 dsh 视图，回到启动页
  try {
    sendStatus({ state: "detecting" });
    // 探测端口与 PATH 候选并行（候选仅无缓存/缓存失效时需要，复用场景不浪费）
    const cached = state.pendingDshPath || readSettings().dshPath || null;
    const candidatesP = cached && isFile(cached) ? Promise.resolve([]) : findDshCandidates();
    const probe = await probePort();
    if (probe.alive) {
      if (probe.match) {
        state.dshOwned = false;
        state.pendingDshPath = null;
        state.currentDshPath = null; // 复用已有实例，非应用启动，路径回退读缓存
        state.startMode = "reuse";
        sendStatus({ state: "starting", phase: "reuse" });
        loadApp();
        return;
      }
      state.pendingDshPath = null;
      sendStatus({ state: "port-conflict" });
      return;
    }

    // 启动路径：用户刚确认的优先，否则缓存；文件存在即信任直启（跳过 dsh -V）
    let dshPath = state.pendingDshPath || cached || null;
    if (!dshPath || !isFile(dshPath)) {
      state.pendingDshPath = null;
      sendStatus({ state: "select-dsh", candidates: await candidatesP });
      return;
    }

    log(`[startup] trust cached dsh path, skip -V: ${dshPath}`);
    state.currentDshPath = dshPath;
    state.startMode = "app";
    sendStatus({ state: "starting", path: dshPath, phase: "spawn" });
    const child = spawnDsh(dshPath);
    sendStatus({ state: "starting", path: dshPath, phase: "wait" });
    const result = await waitForPort(child);
    if (result.ok) {
      // 启动成功才把用户确认的路径写入缓存（永久）
      if (state.pendingDshPath) {
        writeSettings({ dshPath: state.pendingDshPath });
        state.pendingDshPath = null;
      }
      sendStatus({ state: "starting", path: dshPath, phase: "load" });
      loadApp();
      return;
    }
    if (result.reason === "conflict") {
      state.pendingDshPath = null;
      sendStatus({ state: "port-conflict" });
      return;
    }

    // 直启失败（退出/超时）：先验证缓存路径是否真的失效
    state.pendingDshPath = null;
    if (await verifyDsh(dshPath)) {
      sendStatus({ state: "failed", stderr: startFailureText(result) });
      return;
    }
    // 缓存路径失效 → 自动降级：PATH 候选里取第一个验证有效的重试。
    // 并发验证全部候选（最坏从逐个累加 ~N×400ms 降到最慢一个 ~400ms），
    // 再按原顺序取第一个有效值（Array.map 保证结果顺序与 candidates 一致）
    log("[startup] cached dsh path invalid, falling back to PATH candidates");
    const candidates = await findDshCandidates();
    const results = await Promise.all(candidates.map((c) => verifyDsh(c)));
    const found = results.findIndex((v) => v);
    const fallback = found >= 0 ? candidates[found] : null;
    if (!fallback) {
      sendStatus({ state: "select-dsh", candidates });
      return;
    }
    // 清理失败尝试的残留进程（可能仍占着 3080），再用候选路径重试
    await killDsh();
    log(`[startup] fallback to candidate: ${fallback}`);
    state.currentDshPath = fallback;
    sendStatus({ state: "starting", path: fallback, phase: "spawn" });
    const child2 = spawnDsh(fallback);
    sendStatus({ state: "starting", path: fallback, phase: "wait" });
    const retried = await waitForPort(child2);
    if (retried.ok) {
      writeSettings({ dshPath: fallback }); // 启动成功才写缓存
      sendStatus({ state: "starting", path: fallback, phase: "load" });
      loadApp();
      return;
    }
    if (retried.reason === "conflict") {
      sendStatus({ state: "port-conflict" });
      return;
    }
    sendStatus({ state: "failed", stderr: startFailureText(retried) });
  } finally {
    state.busy = false;
  }
}

module.exports = { startFlow, startFailureText };
