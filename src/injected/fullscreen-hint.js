// 内容全屏模式（View → 最大化 / F11）下的「F11 退出最大化」提示浮层：
// 注入到 dsh 视图（只有视图挂载后才能进入全屏），进入全屏时由主进程推送
// chrome-fullscreen=true 触发显示，~3.5s 自动淡出；指针穿透，不挡任何点击。
const { T } = require("../../renderer/status-core"); // i18n 唯一来源

const HINT_I18N = JSON.stringify({
  zh: { hint: T.zh.fullscreenHint },
  en: { hint: T.en.fullscreenHint },
});

const FULLSCREEN_HINT_CSS = `
.dshf-hint {
  position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
  padding: 8px 18px; border-radius: 8px;
  font-size: 13px; font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  z-index: 2147483647;
  pointer-events: none;
  opacity: 0; transition: opacity .3s;
  user-select: none;
}
html[data-dshc-theme="dark"] .dshf-hint {
  background: rgb(35, 35, 36); color: rgb(249, 250, 251);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
html[data-dshc-theme="light"] .dshf-hint {
  background: #333; color: #fff;
  border: 1px solid rgba(0, 0, 0, 0.1);
}
`;

function fullscreenHintScript(dark, lang) {
  return `(() => {
  if (window.__dshFullscreenHint) return;
  var cur = ${JSON.stringify(lang === "zh" ? "zh" : "en")};
  var I18N = ${HINT_I18N};
  var el = document.createElement('div');
  el.className = 'dshf-hint';
  el.textContent = I18N[cur].hint;
  document.documentElement.appendChild(el);
  var timer = null;
  function show() {
    el.style.opacity = '1';
    clearTimeout(timer);
    timer = setTimeout(function () { el.style.opacity = '0'; }, 3500);
  }
  function hide() {
    clearTimeout(timer);
    el.style.opacity = '0';
  }
  function applyLang(l) {
    cur = l === 'zh' ? 'zh' : 'en';
    el.textContent = I18N[cur].hint;
  }
  function setTheme(d) {
    document.documentElement.setAttribute('data-dshc-theme', d ? 'dark' : 'light');
  }
  var api = window.electronAPI;
  if (api && api.onFullscreenMode) {
    api.onFullscreenMode(function (on) { if (on) show(); else hide(); });
  }
  if (api && api.onChromeTheme) api.onChromeTheme(setTheme);
  if (api && api.onChromeLanguage) api.onChromeLanguage(applyLang);
  setTheme(${dark ? "true" : "false"});
  window.__dshFullscreenHint = { show: show, hide: hide };
})();`;
}

module.exports = { FULLSCREEN_HINT_CSS, fullscreenHintScript };
