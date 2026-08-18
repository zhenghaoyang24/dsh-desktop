const fs = require("fs");
const path = require("path");
const { state } = require("./state");
const { dshHome } = require("./paths");
// 文案唯一来源在 renderer/status-core.js（浏览器 + 主进程 + 注入脚本共用同一份 T）
const { T } = require("../renderer/status-core");

// 主进程侧取文案：菜单 / 退出弹窗 / 通知 / 校验错误等
const t = (k) => (T[state.currentLang] && T[state.currentLang][k]) ?? T.zh[k];

// 读取 dsh web 的语言偏好（dsh 持久化在 $DSH_HOME/settings.yaml 的 locale.preference）。
// 只有 zh 用中文；缺省/未设置/其他语言（含 en 之外的任何值）一律回退英文
function readLangPreference() {
  const home = dshHome();
  try {
    const lines = fs.readFileSync(path.join(home, "settings.yaml"), "utf8").split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!/^locale:\s*$/.test(lines[i])) continue;
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\S/.test(lines[j])) break;
        const m = lines[j].match(/^\s+preference:\s*"?([\w-]+)"?\s*$/);
        if (m) return /^zh(\b|-)/i.test(m[1]) ? "zh" : "en";
      }
    }
  } catch (_) {}
  return "en";
}

// 跟随 dsh web 的语言切换：读取 locale.preference 并推送给各页面（顶栏 / 关于浮层）
function applyLanguage() {
  state.currentLang = readLangPreference();
  if (state.win && !state.win.isDestroyed()) {
    state.win.webContents.send("chrome-language", state.currentLang);
    if (state.dshView && !state.dshView.webContents.isDestroyed()) {
      state.dshView.webContents.send("chrome-language", state.currentLang);
    }
  }
  return state.currentLang;
}

module.exports = { t, readLangPreference, applyLanguage };
