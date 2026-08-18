const fs = require("fs");
const path = require("path");
const { state } = require("./state");
const { dshHome } = require("./paths");

// 应用自身界面的文案字典（主进程侧：菜单 / 退出弹窗 / 通知 / 校验错误等）。
// 注入到页面的顶栏与「关于」浮层各自带一份字典（见 injected/chrome.js 与 injected/about.js）
const UI = {
  zh: {
    menuCurrentDsh: "当前 dsh",
    menuHome: "DeepSeek Harness 官网",
    menuAbout: "关于",
    closeReuseMessage: "3080 端口上的 dsh 不是由本应用启动",
    closeReuseDetail: "是否在退出时一并关闭该 dsh？选择“保留”则 dsh 继续运行。",
    closeDsh: "关闭 dsh",
    keepDsh: "保留 dsh",
    toastBody: "回答已完成",
    errPathEmpty: "路径不能为空",
    errNoDsh: "未检测到此路径下有 dsh",
  },
  en: {
    menuCurrentDsh: "Current dsh",
    menuHome: "DeepSeek Harness Website",
    menuAbout: "About",
    closeReuseMessage: "The dsh on port 3080 was not started by this app",
    closeReuseDetail: "Close this dsh when exiting? Choose “Keep” to leave it running.",
    closeDsh: "Close dsh",
    keepDsh: "Keep dsh",
    toastBody: "Answer complete",
    errPathEmpty: "Path must not be empty",
    errNoDsh: "No dsh found at this path",
  },
};

const t = (k) => (UI[state.currentLang] && UI[state.currentLang][k]) ?? UI.zh[k];

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

module.exports = { UI, t, readLangPreference, applyLanguage };
