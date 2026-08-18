const test = require("node:test");
const assert = require("node:assert/strict");
const { state } = require("../src/state.js");
const { T } = require("../renderer/status-core.js");
const { t } = require("../src/i18n.js");

const MAIN_KEYS = [
  "menuCurrentDsh", "menuHome", "menuAbout",
  "closeReuseMessage", "closeReuseDetail", "closeDsh", "keepDsh",
  "toastBody", "errPathEmpty", "errNoDsh",
];

test("主进程 t 与 status-core（唯一来源）取值一致", () => {
  state.currentLang = "zh";
  for (const k of MAIN_KEYS) assert.equal(t(k), T.zh[k], `zh.${k}`);
  state.currentLang = "en";
  for (const k of MAIN_KEYS) assert.equal(t(k), T.en[k], `en.${k}`);
});

test("顶栏与浮层用到的键在唯一来源里都有值", () => {
  const keys = ["help", "currentDsh", "about", "fetching", "dshPath", "dshVersion",
    "port", "mode", "modeApp", "modeReuse", "log", "notDetected", "version", "repo"];
  for (const k of keys) {
    assert.ok(T.zh[k] !== undefined && T.zh[k] !== "", `zh.${k}`);
    assert.ok(T.en[k] !== undefined && T.en[k] !== "", `en.${k}`);
  }
});

test("未知语言回退中文", () => {
  try {
    state.currentLang = "xx";
    assert.equal(t("menuAbout"), T.zh.menuAbout);
  } finally {
    state.currentLang = "en";
  }
});
