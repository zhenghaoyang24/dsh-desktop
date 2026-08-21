const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { probePort } = require("../src/port.js");

// mock http.get：不自动回复；由测试显式触发 __respond（回复回调）或 __emit('error'/'timeout')
function mockGet(t, body) {
  let reqHandlers = {};
  let respond = null;
  const fakeReq = {
    on: (ev, cb) => {
      reqHandlers[ev] = cb;
    },
    destroy: () => {
      if (reqHandlers.error) reqHandlers.error();
    },
    __emit: (ev) => {
      if (reqHandlers[ev]) reqHandlers[ev]();
    },
    __respond: () => {
      setImmediate(() =>
        respond({
          setEncoding: () => {},
          on: (ev, h) => {
            if (ev === "data") h(Buffer.from(body, "utf8"));
            if (ev === "end") h();
          },
        }),
      );
    },
  };
  t.mock.method(http, "get", (_url, _opts, cb) => {
    respond = cb;
    return fakeReq;
  });
  return fakeReq;
}

test("响应包含 dsh 标志 → match", async (t) => {
  const dshPage =
    "<html><head><title>DeepSeek Harness</title></head><body>" +
    "<script>window.__DSH_BOOT__={}</script></body></html>";
  const fakeReq = mockGet(t, dshPage);
  const p = probePort();
  fakeReq.__respond();
  const r = await p;
  assert.deepEqual(r, { alive: true, match: true });
});

test("新版 dsh 标志 globalThis[\"__DSH_BOOT__\"] → match", async (t) => {
  const dshPage =
    "<html><head><title>DeepSeek Harness</title></head><body>" +
    '<script>globalThis["__DSH_BOOT__"]={}</script></body></html>';
  const fakeReq = mockGet(t, dshPage);
  const p = probePort();
  fakeReq.__respond();
  const r = await p;
  assert.deepEqual(r, { alive: true, match: true });
});

test("有响应但不是 dsh → 不匹配", async (t) => {
  const fakeReq = mockGet(t, "<html><title>Other App</title></html>");
  const p = probePort();
  fakeReq.__respond();
  const r = await p;
  assert.deepEqual(r, { alive: true, match: false });
});

test("请求 error → 视为无服务", async (t) => {
  const fakeReq = mockGet(t, "");
  const p = probePort();
  fakeReq.__emit("error");
  const r = await p;
  assert.deepEqual(r, { alive: false, match: false });
});

test("timeout → destroy 请求（走 error 分支）", async (t) => {
  const fakeReq = mockGet(t, "");
  const p = probePort();
  fakeReq.__emit("timeout");
  const r = await p;
  assert.deepEqual(r, { alive: false, match: false });
});
