// 任务完成通知：主进程直连 dsh 官方事件流（/api/events.host + /api/events.mux），
// 取代旧的 DOM 注入监听（task-watcher.js，已删除）。
//
// 语义（2026-08-20 与用户确认，2026-08-20 修重复通知）：
// - 「任务结束」= 会话运行状态翻转 running:true → false（host/session-status，由 agent/status 驱动）。
//   它和合成器停止按钮同源（web UI 的 primaryStops = running && subagent === null），
//   且 agent-loop 的 kick() 是 while(await this.turn())——一次用户任务跑完所有回合才回 idle，
//   所以 running:false 每个任务只触发一次。**不能按 turn/end 通知**：一个任务可能有多回合，
//   按回合通知会一次任务弹多次（旧实现的 bug）。
// - 结束原因取该运行最后一个 turn/end（mux 流）：手动停止（aborted）不通知；
//   completed / error / blocked / max-tokens / interrupted 都通知（成功失败都提醒）。
// - 通知那一刻窗口处于最小化才弹 toast；子代理会话（origin=subagent）不通知。
// - 点击通知 → 还原并聚焦窗口。
// - 跨流乱序：turn/end（mux 流）与 running:false（host 流）是两条 WS，到达顺序不保证；
//   running:false 后等 SETTLE_MS(400ms) 让最终 turn/end 落地再结算（turn/end 在服务端先于
//   running:false 产生，400ms 对 localhost 绰绰有余）。
// - 基线：启动/重连时拉一次 session.list，标记已在运行的会话与子代理会话
//   （复用场景下任务可能先于应用启动）。
const { Notification } = require("electron");
const { state } = require("./state");
const { t } = require("./i18n");
const { log } = require("./paths");
const { PORT } = require("./constants");

// —— 纯判定逻辑（可单测）——
// 会话运行结束（running:true→false，settle 之后）是否该通知：
// 观察到该会话在运行（wasRunning）、非子代理、最后一个 turn/end 不是手动停止（aborted）
// 且确实有回合事件（lastTurnEnd 非 null）
function shouldNotifyRunEnd(s) {
  if (!s) return false;
  if (!s.wasRunning) return false;
  if (s.subagent) return false;
  if (s.lastTurnEnd === null || s.lastTurnEnd === "aborted") return false;
  return true;
}

// —— 主进程侧事件流监听 ——
// 浏览器同款下行通道（dsh-client-connection 的 HOST_EVENTS_PATH / MUX_EVENTS_PATH），
// 帧格式：{ type: "server-request", rpcId, method, payload }
const MUX_URL = `ws://127.0.0.1:${PORT}/api/events.mux`; // 每会话 session/event 帧（turn/start、turn/end …）
const HOST_URL = `ws://127.0.0.1:${PORT}/api/events.host`; // host/session-added / session-status / session-removed
const RECONNECT_DELAY_MS = 3000;
const SETTLE_MS = 400; // running:false 后等待最终 turn/end 帧的结算窗口

let started = false; // 监听开关（dsh 视图挂载时开、移除时关）
let sockets = []; // 当前存活的 WebSocket
let reconnectTimer = null;
// sessionId → { wasRunning: 是否观察到该会话在运行, subagent, lastTurnEnd: 最近 turn/end 原因, settleTimer }
const sessions = new Map();

function sessionOf(id) {
  let s = sessions.get(id);
  if (!s) {
    s = { wasRunning: false, subagent: false, lastTurnEnd: null, settleTimer: null };
    sessions.set(id, s);
  }
  return s;
}

function notifyTaskComplete() {
  if (!state.win || state.win.isDestroyed()) return;
  if (!state.win.isMinimized()) {
    log("[task-events] run ended while window not minimized, skip toast");
    return;
  }
  const n = new Notification({ title: "DeepSeek Harness", body: t("toastBody") });
  n.on("click", () => {
    if (state.win && !state.win.isDestroyed()) {
      state.win.restore();
      state.win.focus();
    }
  });
  n.show();
  log("[task-events] completion toast shown");
}

// 运行结束结算：判定 + 复位会话状态（幂等，settle 定时器与提前 turn/end 两条路径共用）
function finalizeRunEnd(s) {
  if (s.settleTimer) {
    clearTimeout(s.settleTimer);
    s.settleTimer = null;
  }
  if (shouldNotifyRunEnd(s)) notifyTaskComplete();
  s.wasRunning = false;
  s.lastTurnEnd = null;
}

// running:true → false：等 SETTLE_MS 让最终 turn/end（另一条流）落地后再结算
function settleRunEnd(s) {
  if (s.settleTimer) return;
  s.settleTimer = setTimeout(() => {
    s.settleTimer = null;
    finalizeRunEnd(s);
  }, SETTLE_MS);
}

function onMuxFrame(msg) {
  if (!msg || msg.type !== "server-request" || !msg.payload) return;
  const p = msg.payload;
  if (p.type !== "session/event" || !p.event || p.event.type !== "turn/end") return;
  const s = sessionOf(p.sessionId);
  s.lastTurnEnd = (p.event.data && p.event.data.reason && p.event.data.reason.kind) || null;
  // 该会话正等结算且最终 turn/end 已到 → 提前结算，无需等满 SETTLE_MS
  if (s.settleTimer) finalizeRunEnd(s);
}

function onHostFrame(msg) {
  if (!msg || msg.type !== "server-request" || !msg.payload) return;
  const p = msg.payload;
  if (p.type === "host/session-added") {
    if (p.origin === "subagent") sessionOf(p.sessionId).subagent = true;
  } else if (p.type === "host/session-status") {
    const s = sessionOf(p.sessionId);
    if (p.running) {
      // 新的运行开始：清掉上一次的残留（含未结算的 settle）
      s.wasRunning = true;
      s.lastTurnEnd = null;
      if (s.settleTimer) {
        clearTimeout(s.settleTimer);
        s.settleTimer = null;
      }
    } else if (s.wasRunning) {
      settleRunEnd(s); // 运行结束 → 结算
    }
  } else if (p.type === "host/session-removed") {
    const s = sessions.get(p.sessionId);
    if (s && s.settleTimer) clearTimeout(s.settleTimer);
    sessions.delete(p.sessionId);
  }
}

// 基线快照：标记已在运行的会话（复用场景任务先于应用开始）与既有的子代理会话
async function fetchBaseline() {
  try {
    const body = JSON.stringify({
      type: "client-request",
      rpcId: crypto.randomUUID(),
      method: "session.list",
      payload: {},
    });
    const res = await fetch(`http://127.0.0.1:${PORT}/api/session.list`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    if (!res.ok) return;
    const json = await res.json();
    const items = json && json.result && json.result.ok && json.result.value && json.result.value.items;
    if (!Array.isArray(items)) return;
    for (const it of items) {
      const s = sessionOf(it.sessionId);
      if (it.origin === "subagent") s.subagent = true;
      if (it.running) s.wasRunning = true;
    }
  } catch (_) {}
}

// 断开后自动重连（dsh 重启/短暂掉线可自愈）；stopTaskWatcher 置 started=false 停止循环
function scheduleReconnect() {
  if (!started) return;
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (started) connect();
  }, RECONNECT_DELAY_MS);
}

function connect() {
  if (!started) return;
  const open = (url, onFrame) => {
    // 主进程 Node ≥22 自带全局 WebSocket（Electron 43 = Node 24），零依赖
    const ws = new WebSocket(url);
    ws.addEventListener("open", () => log("[task-events] connected " + url));
    ws.addEventListener("message", (ev) => {
      if (typeof ev.data !== "string") return;
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (_) {
        return;
      }
      onFrame(msg);
    });
    ws.addEventListener("close", () => {
      log("[task-events] closed " + url + ", will reconnect");
      scheduleReconnect();
    });
    ws.addEventListener("error", () => {
      try {
        ws.close();
      } catch (_) {}
    });
    sockets.push(ws);
  };
  open(MUX_URL, onMuxFrame);
  open(HOST_URL, onHostFrame);
  // 连接（含重连）后刷新基线：补上连接间隙里开始运行的会话
  setTimeout(fetchBaseline, 500);
}

// dsh 主界面挂载成功后启动（见 view.js loadApp）
function startTaskWatcher() {
  if (started) return;
  started = true;
  sessions.clear();
  connect();
}

// dsh 视图移除/崩溃时停止（见 view.js removeDshView）；下次挂载再启动
function stopTaskWatcher() {
  started = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  for (const ws of sockets) {
    try {
      ws.close();
    } catch (_) {}
  }
  sockets = [];
  for (const s of sessions.values()) {
    if (s.settleTimer) clearTimeout(s.settleTimer);
  }
  sessions.clear();
}

module.exports = { startTaskWatcher, stopTaskWatcher, shouldNotifyRunEnd };
