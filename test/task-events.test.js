// 任务完成通知（src/task-events.js）的纯判定逻辑测试：
// shouldNotifyRunEnd(s) —— 会话运行结束（running:true→false 结算后）是否通知。
// 语义（2026-08-20 用户确认）：成功失败都通知；只有手动停止（aborted）、
// 子代理会话、未观察到运行/回合事件的会话不通知。
const { test } = require("node:test");
const assert = require("node:assert");
const { shouldNotifyRunEnd } = require("../src/task-events");

const state = (over = {}) => ({
  wasRunning: true,
  subagent: false,
  lastTurnEnd: "completed",
  ...over,
});

test("completed 结束 → 通知", () => {
  assert.strictEqual(shouldNotifyRunEnd(state()), true);
});

test("失败类结束原因（error / blocked / max-tokens / interrupted）→ 也通知", () => {
  for (const kind of ["error", "blocked", "max-tokens", "interrupted"]) {
    assert.strictEqual(shouldNotifyRunEnd(state({ lastTurnEnd: kind })), true, kind);
  }
});

test("手动停止 aborted → 不通知", () => {
  assert.strictEqual(shouldNotifyRunEnd(state({ lastTurnEnd: "aborted" })), false);
});

test("子代理会话 → 不通知（无论成功失败）", () => {
  for (const kind of ["completed", "error", "blocked", "max-tokens", "interrupted"]) {
    assert.strictEqual(shouldNotifyRunEnd(state({ subagent: true, lastTurnEnd: kind })), false, kind);
  }
});

test("未观察到运行（wasRunning=false，如连接前已结束）→ 不通知", () => {
  assert.strictEqual(shouldNotifyRunEnd(state({ wasRunning: false })), false);
});

test("未观察到回合事件（lastTurnEnd=null）→ 不通知", () => {
  assert.strictEqual(shouldNotifyRunEnd(state({ lastTurnEnd: null })), false);
});

test("状态缺失 → 不通知", () => {
  assert.strictEqual(shouldNotifyRunEnd(null), false);
  assert.strictEqual(shouldNotifyRunEnd(undefined), false);
});
