const test = require("node:test");
const assert = require("node:assert/strict");
const { looksLikePath, T } = require("../renderer/status-core.js");

test("有效盘符路径", () => {
  assert.equal(looksLikePath("C:\\Users\\me\\dsh.cmd"), true);
  assert.equal(looksLikePath("C:/x/dsh.cmd"), true);
  assert.equal(looksLikePath("D:\\a\\b.cmd"), true);
});

test("有效 UNC 路径", () => {
  assert.equal(looksLikePath("\\\\server\\share\\dsh.cmd"), true);
});

test("无效路径", () => {
  assert.equal(looksLikePath(null), false);
  assert.equal(looksLikePath(""), false);
  assert.equal(looksLikePath("ab"), false);
  assert.equal(looksLikePath("foo"), false);
  assert.equal(looksLikePath("/usr/bin/dsh"), false);
  assert.equal(looksLikePath("C:no-separator"), false);
  assert.equal(looksLikePath("C:\\a\\b<.cmd"), false);
  assert.equal(looksLikePath('C:\\a\\b".cmd'), false);
  assert.equal(looksLikePath("C:\\a\\b|.cmd"), false);
});

test("zh 与 en 字典键集合一致且值非空", () => {
  const zhKeys = Object.keys(T.zh).sort();
  const enKeys = Object.keys(T.en).sort();
  assert.deepEqual(enKeys, zhKeys);
  for (const k of zhKeys) {
    const v = T.en[k];
    assert.ok(v !== undefined && v !== null && v !== "", `en.${k} 缺值`);
  }
});
