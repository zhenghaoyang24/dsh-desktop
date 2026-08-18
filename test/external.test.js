const test = require("node:test");
const assert = require("node:assert/strict");
const { isExternalUrl } = require("../src/external");

test("3080 本应用页面不是外部链接", () => {
  assert.equal(isExternalUrl("http://127.0.0.1:3080/"), false);
  assert.equal(isExternalUrl("http://127.0.0.1:3080/chat?x=1"), false);
});

test("外部 http/https 链接判为外部", () => {
  assert.equal(isExternalUrl("https://www.deepseek.com/harness/"), true);
  assert.equal(isExternalUrl("https://github.com/zhenghaoyang24/dsh-desktop"), true);
});

test("http 前缀但非 127.0.0.1:3080 也是外部", () => {
  assert.equal(isExternalUrl("http://localhost:3080/"), true);
  assert.equal(isExternalUrl("http://127.0.0.1:9000/"), true);
});

test("mailto / tel 是外部", () => {
  assert.equal(isExternalUrl("mailto:a@b.com"), true);
  assert.equal(isExternalUrl("tel:+8613800000000"), true);
});

test("非法 / 无法解析的 URL 不是外部", () => {
  assert.equal(isExternalUrl(""), false);
  assert.equal(isExternalUrl("not a url"), false);
  assert.equal(isExternalUrl("file:///C:/x"), false);
});
