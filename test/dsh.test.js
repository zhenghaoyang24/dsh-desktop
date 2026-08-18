const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("events");
const cp = require("child_process");
const { verifyDsh } = require("../src/dsh.js");

function fakeChild({ out = "", code = 0, emitClose = true, onError = false, kill } = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = kill || (() => {});
  setImmediate(() => {
    if (onError) {
      child.emit("error");
      return;
    }
    if (emitClose) {
      if (out) child.stdout.emit("data", Buffer.from(out));
      child.emit("close", code);
    }
  });
  return child;
}

test("文件不存在 → 直接判无效（不 spawn）", async (t) => {
  const spawnMock = t.mock.method(cp, "spawn");
  const v = await verifyDsh("C:\\definitely\\missing\\dsh\\path.cmd");
  assert.equal(v, null);
  assert.equal(spawnMock.mock.callCount(), 0);
});

test("exit 0 并把版本输出到 stdout → 返回版本", async (t) => {
  t.mock.method(cp, "spawn", () => fakeChild({ out: "dsh v1.2.3\n" }));
  const v = await verifyDsh(__filename); // 真实存在的文件，绕过 existsSync 预检
  assert.equal(v, "dsh v1.2.3");
});

test("exit 非 0 → 判无效", async (t) => {
  t.mock.method(cp, "spawn", () => fakeChild({ out: "error output", code: 1 }));
  const v = await verifyDsh(__filename);
  assert.equal(v, null);
});

test("spawn 报 error → 判无效", async (t) => {
  t.mock.method(cp, "spawn", () => fakeChild({ onError: true }));
  const v = await verifyDsh(__filename);
  assert.equal(v, null);
});

test("超时（5s 无响应）→ 调用 kill 并判无效", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let killed = false;
  const child = fakeChild({
    emitClose: false,
    kill: () => {
      killed = true;
      queueMicrotask(() => child.emit("close", -7)); // kill 后真实进程会退出 → 触发 close
    },
  });
  t.mock.method(cp, "spawn", () => child);
  const p = verifyDsh(__filename);
  t.mock.timers.tick(5000);
  const v = await p;
  assert.equal(killed, true);
  assert.equal(v, null);
});
