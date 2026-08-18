// 「检查 dsh 更新」浮层的样式与脚本。
// 显示当前版本、最新版本、状态，底部固定显示三种更新方式（npm / npx / git clone）。
// 检查失败时额外提示手动查询方式。
const { PALETTE: P } = require("../theme-palette");
const { T } = require("../../renderer/status-core");
const { DSH_GIT_REPO } = require("../constants");

const UPDATE_KEYS = [
  "updateTitle", "updateCurrentVersion", "updateLatestVersion",
  "updateChecking",
  "updateVersionUnknown", "updateSection",
  "updateManualCheckHint", "updateManualCheckGithub",
  "updateNpmViewCmd", "updateNpmInstallCmd", "updateNpmReinstallCmd", "updateGitCmd",
  "updateErrNetwork", "updateErrNpmNotFound", "updateErrUnknown",
];
const UPDATE_I18N = JSON.stringify({
  zh: Object.fromEntries(UPDATE_KEYS.map((k) => [k, T.zh[k]])),
  en: Object.fromEntries(UPDATE_KEYS.map((k) => [k, T.en[k]])),
});

const UPDATE_CHECK_CSS = `
.dshu-overlay {
  position: fixed; inset: 0; background: ${P.backdrop};
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  z-index: 2147483647;
}
.dshu-overlay[hidden] { display: none !important; }
.dshu-box {
  position: relative; width: 480px; max-width: 90vw;
  background: ${P.boxBg.light}; color: ${P.barFg.light};
  border-radius: 12px; padding: 20px 22px 16px;
  font-size: 13px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.2);
  --dshu-border: ${P.border.light};
  --dshu-muted: ${P.textMuted.light};
  --dshu-accent: ${P.accent};
}
html[data-dshc-theme="dark"] .dshu-box {
  background: ${P.boxBg.dark}; color: ${P.barFg.dark};
  --dshu-border: ${P.border.dark};
  --dshu-muted: ${P.textMuted.dark};
  --dshu-accent: ${P.accent};
}
.dshu-head {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 10px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--dshu-border);
}
.dshu-title { font-size: 15px; font-weight: 600; }
.dshu-close {
  border: none; background: none; font-size: 18px; line-height: 1;
  cursor: pointer; color: inherit; padding: 4px;
}
.dshu-body { min-height: 60px; }
/* 加载 */
.dshu-loading {
  text-align: center; padding: 32px 0;
  font-size: 14px; color: var(--dshu-muted);
}
.dshu-spinner {
  display: inline-block; width: 20px; height: 20px;
  border: 2px solid var(--dshu-border);
  border-top-color: var(--dshu-accent);
  border-radius: 50%;
  animation: dshu-spin 0.7s linear infinite;
  margin-right: 10px; vertical-align: middle;
}
@keyframes dshu-spin { to { transform: rotate(360deg); } }
.dshu-loading-text { vertical-align: middle; }
/* 信息区域（版本+状态） */
.dshu-info { padding: 4px 0 0; }
.dshu-row {
  padding: 6px 0; word-break: break-all;
  font-family: Consolas, "Courier New", monospace;
}
/* 手动查询提示 */
.dshu-manual-hint {
  margin: 8px 0 4px; padding: 10px 12px;
  border-radius: 8px;
  background: rgba(0,0,0,0.03); border: 1px solid var(--dshu-border);
  font-size: 12px; line-height: 1.6;
}
html[data-dshc-theme="dark"] .dshu-manual-hint {
  background: rgba(255,255,255,0.03);
}
.dshu-hint-label { color: var(--dshu-muted); display: block; margin-bottom: 6px; }
.dshu-hint-code {
  display: inline-block; background: rgba(0,0,0,0.06);
  padding: 4px 8px; border-radius: 4px;
  font-family: Consolas, "Courier New", monospace;
  font-size: 12px; user-select: all; cursor: text; word-break: break-all;
}
html[data-dshc-theme="dark"] .dshu-hint-code {
  background: rgba(255,255,255,0.06);
}
.dshu-hint-link {
  color: var(--dshu-accent); cursor: pointer;
  text-decoration: none; font-size: 12px;
}
.dshu-hint-link:hover { text-decoration: underline; }
/* 更新方式（始终显示） */
.dshu-methods {
  margin-top: 14px; padding-top: 12px;
  border-top: 1px solid var(--dshu-border);
}
.dshu-methods-title {
  font-size: 12px; font-weight: 600; color: var(--dshu-muted);
  margin-bottom: 10px;
}
.dshu-method {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 6px 0;
}
.dshu-method-code {
  flex: 1; min-width: 0;
  background: rgba(0,0,0,0.04); padding: 5px 10px;
  border-radius: 6px;
  font-family: Consolas, "Courier New", monospace;
  font-size: 12px; white-space: pre-wrap; word-break: break-all;
  user-select: all; cursor: text;
}
html[data-dshc-theme="dark"] .dshu-method-code {
  background: rgba(255,255,255,0.05);
}
`;

function updateCheckScript(dark, lang) {
  const gitCmd = `git clone ${DSH_GIT_REPO}`;
  return `(() => {
  if (window.__dshUpdateCheck) return;
  var api = window.electronAPI;
  var cur = ${JSON.stringify(lang === "zh" ? "zh" : "en")};
  var I18N = ${UPDATE_I18N};
  var GIT_CMD = ${JSON.stringify(gitCmd)};
  function t(key) { return (I18N[cur] && I18N[cur][key]) || I18N['zh'][key]; }
  function mk(tag, cls, html) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html !== undefined && html !== null) el.innerHTML = html;
    return el;
  }
  var overlay = mk('div', 'dshu-overlay');
  overlay.hidden = true;
  var box = mk('div', 'dshu-box');
  // 标题栏
  var head = mk('div', 'dshu-head');
  var titleEl = mk('span', 'dshu-title', t('updateTitle'));
  var closeBtn = mk('button', 'dshu-close', '\u00d7');
  head.appendChild(titleEl);
  head.appendChild(closeBtn);
  box.appendChild(head);
  // 内容区
  var body = mk('div', 'dshu-body');
  // 加载态
  var loading = mk('div', 'dshu-loading');
  var spinner = mk('span', 'dshu-spinner', '');
  var loadingText = mk('span', 'dshu-loading-text', t('updateChecking'));
  loading.appendChild(spinner);
  loading.appendChild(loadingText);
  body.appendChild(loading);
  // 信息区（版本 + 状态 + 手动查询提示）
  var info = mk('div', 'dshu-info');
  info.style.display = 'none';
  var curVerRow = mk('div', 'dshu-row', '');
  var latestVerRow = mk('div', 'dshu-row', '');
  var manualHint = mk('div', 'dshu-manual-hint');
  manualHint.style.display = 'none';
  info.appendChild(curVerRow);
  info.appendChild(latestVerRow);
  info.appendChild(manualHint);
  body.appendChild(info);
  // 更新方式（始终显示）
  var methods = mk('div', 'dshu-methods');
  var methodsTitle = mk('div', 'dshu-methods-title', t('updateSection'));
  methods.appendChild(methodsTitle);
  function addMethod(codeText) {
    var row = mk('div', 'dshu-method');
    var code = mk('span', 'dshu-method-code', codeText);
    row.appendChild(code);
    methods.appendChild(row);
  }
  addMethod(t('updateNpmInstallCmd'));
  addMethod(t('updateNpmReinstallCmd'));
  addMethod(GIT_CMD);
  body.appendChild(methods);
  box.appendChild(body);
  overlay.appendChild(box);
  document.documentElement.appendChild(overlay);
  // 主题
  function setTheme(d) {
    document.documentElement.setAttribute('data-dshc-theme', d ? 'dark' : 'light');
  }
  // 语言切换（保留已获取的数据重新渲染）
  function applyLang(l) {
    cur = l === 'zh' ? 'zh' : 'en';
    titleEl.textContent = t('updateTitle');
    loadingText.textContent = t('updateChecking');
    methodsTitle.textContent = t('updateSection');
    var data = overlay.__dshu_data;
    if (data) render(data);
  }
  // 渲染结果
  function render(data) {
    overlay.__dshu_data = data;
    loading.style.display = 'none';
    info.style.display = '';
    var cv = data.currentVersion || '-';
    var lv = data.latestVersion || '-';
    curVerRow.textContent = t('updateCurrentVersion') + cv;
    if (data.error) {
      // 检查失败
      latestVerRow.textContent = t('updateLatestVersion') + lv + ' ' + t('updateVersionUnknown');
      // 手动查询提示
      var errDetail = '';
      switch (data.error) {
        case 'npm_not_found': errDetail = t('updateErrNpmNotFound'); break;
        case 'network': errDetail = t('updateErrNetwork'); break;
        default: errDetail = t('updateErrUnknown');
      }
      manualHint.innerHTML =
        '<span class="dshu-hint-label">' + errDetail + '</span>' +
        '<span class="dshu-hint-label">' + t('updateManualCheckHint') + '</span>' +
        '<span class="dshu-hint-code">' + t('updateNpmViewCmd') + '</span>' +
        '<br><span class="dshu-hint-label">' + t('updateManualCheckGithub') + '</span>' +
        '<a class="dshu-hint-link" href="#" onclick="event.preventDefault();if(window.electronAPI&&window.electronAPI.openRepo)window.electronAPI.openRepo()">' + GIT_CMD + '</a>';
      manualHint.style.display = '';
    } else {
      // 检查成功
      latestVerRow.textContent = t('updateLatestVersion') + lv;
      manualHint.style.display = 'none';
    }
  }
  // 显示并执行检查
  function show() {
    loading.style.display = '';
    info.style.display = 'none';
    manualHint.style.display = 'none';
    overlay.hidden = false;
    overlay.__dshu_data = null;
    if (!api || !api.checkDshUpdate) {
      var fake = { currentVersion: null, latestVersion: null, error: 'unknown' };
      render(fake);
      return;
    }
    api.checkDshUpdate().then(function (res) {
      render(res);
    }).catch(function () {
      render({ currentVersion: null, latestVersion: null, error: 'unknown' });
    });
  }
  function hide() { overlay.hidden = true; }
  closeBtn.addEventListener('click', hide);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) hide(); });
  if (api && api.onChromeTheme) api.onChromeTheme(setTheme);
  if (api && api.onChromeLanguage) api.onChromeLanguage(applyLang);
  setTheme(${dark ? "true" : "false"});
  window.__dshUpdateCheck = { show: show };
})();`;
}

module.exports = { UPDATE_CHECK_CSS, updateCheckScript };