const test = require("node:test");
const assert = require("node:assert/strict");
const { startFailureText } = require("../src/startup.js");

test("timeout 返回含超时时长的文案", () => {
  const s = startFailureText({ reason: "timeout" });
  assert.match(s, /启动超时（30 秒）/);
});

test("exit 返回进程退出文案", () => {
  const s = startFailureText({ reason: "exit" });
  assert.match(s, /dsh 进程已退出/);
});

test("其他 reason 按退出分支处理", () => {
  const s = startFailureText({ reason: "unknown" });
  assert.match(s, /dsh 进程已退出/);
});
