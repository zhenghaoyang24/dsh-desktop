// 主题色板：亮/暗两套，主进程原生窗口（window/theme/view）与注入样式（chrome/about）共用同一来源。
// 单值代表两套主题色相同；{ light, dark } 为两套分别的值。
const PALETTE = {
  // 顶栏（自绘标题栏）+ Window Controls Overlay + 窗口背景
  barBg: { light: "#f9fafb", dark: "#1b1b1c" },
  barFg: { light: "#1f2329", dark: "rgb(249, 250, 251)" }, // 顶栏主文字色 / 浮层正文色
  symbol: { light: "#1f2329", dark: "#f9fafb" }, // 原生窗口控制按钮（最小化/最大化/关闭）
  border: { light: "#e5e7eb", dark: "rgba(255, 255, 255, 0.08)" },
  textMuted: { light: "#6b7280", dark: "rgb(129, 133, 140)" },
  hoverBg: "rgba(128, 128, 128, 0.18)",
  windowBg: { light: "#f5f7fb", dark: "#151517" },
  // 关于浮层
  backdrop: "rgba(0, 0, 0, 0.55)",
  boxBg: { light: "#ffffff", dark: "rgb(35, 35, 36)" },
  accent: "rgb(86, 134, 254)",
};

// 取某键在给定主题下的颜色（单值直接返回）
function color(key, dark) {
  const v = PALETTE[key];
  return typeof v === "string" ? v : v[dark ? "dark" : "light"];
}

module.exports = { PALETTE, color };
