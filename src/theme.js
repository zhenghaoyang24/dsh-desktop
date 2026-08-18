const fs = require("fs");
const path = require("path");
const { nativeTheme } = require("electron");
const { state } = require("./state");
const { dshHome, buildResource } = require("./paths");
const { applyLanguage } = require("./i18n");

function readThemePreference() {
  const home = dshHome();
  try {
    const lines = fs.readFileSync(path.join(home, "settings.yaml"), "utf8").split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!/^ui-theme:\s*$/.test(lines[i])) continue;
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\S/.test(lines[j])) break;
        const m = lines[j].match(/^\s+preference:\s*"?(\w+)"?\s*$/);
        if (m) return m[1];
      }
    }
  } catch (_) {}
  return "system";
}

function applyTheme() {
  const pref = readThemePreference();
  if (pref === "dark") nativeTheme.themeSource = "dark";
  else if (pref === "light") nativeTheme.themeSource = "light";
  else nativeTheme.themeSource = "system";
  const dark = nativeTheme.shouldUseDarkColors;
  const win = state.win;
  if (win && !win.isDestroyed()) {
    win.setBackgroundColor(dark ? "#151517" : "#f5f7fb");
    // 任务栏图标随主题切换：暗色用白色 logo，亮色用黑色 logo
    win.setIcon(buildResource(dark ? "logo-light.png" : "logo.png"));
    if (process.platform === "win32") {
      // 自绘顶栏 + Window Controls Overlay：原生窗口按钮区颜色随主题
      win.setTitleBarOverlay({
        color: dark ? "#1b1b1c" : "#f9fafb",
        symbolColor: dark ? "#f9fafb" : "#1f2329",
        height: 30,
      });
    }
    // 注入的顶栏主题同步
    win.webContents.send("chrome-theme", dark);
  }
  return dark;
}

// 主题 + 语言都从同一个 settings.yaml 实时同步（~300ms 防抖）
function startSettingsWatch() {
  try {
    const home = dshHome();
    let timer = null;
    fs.watch(home, { persistent: false }, (_ev, fname) => {
      if (fname !== "settings.yaml") return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        applyTheme();
        applyLanguage();
      }, 300);
    });
  } catch (_) {}
}

module.exports = { readThemePreference, applyTheme, startSettingsWatch };
