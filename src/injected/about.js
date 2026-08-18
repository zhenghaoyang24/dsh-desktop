// 「关于」浮层的样式与脚本：页面内 fixed 覆盖层（遮罩 + 高斯模糊），不改变任何布局；
// 注入到 dsh 视图（弹在 dsh 内容之上，模糊的就是 dsh 页面本身），启动页作为兜底
const { REPO_URL } = require("../constants");

const ABOUT_OVERLAY_CSS = `
.dsho-overlay {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  z-index: 2147483647;
}
.dsho-overlay[hidden] { display: none !important; }
.dsho-panel[hidden] { display: none; }
.dsho-box {
  position: relative; width: 440px; max-width: 90vw;
  background: #ffffff; color: #1f2329;
  border-radius: 12px; padding: 20px 22px;
  font-size: 13px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.2);
  --dsho-border: #e5e7eb;
  --dsho-muted: #6b7280;
  --dsho-accent: rgb(86, 134, 254);
}
html[data-dshc-theme="dark"] .dsho-box {
  background: rgb(35, 35, 36); color: rgb(249, 250, 251);
  --dsho-border: rgba(255, 255, 255, 0.08);
  --dsho-muted: rgb(129, 133, 140);
  --dsho-accent: rgb(86, 134, 254);
}
.dsho-head {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 12px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--dsho-border);
}
.dsho-title { font-size: 15px; font-weight: 600; }
.dsho-close {
  border: none; background: none; font-size: 18px; line-height: 1;
  cursor: pointer; color: inherit; padding: 4px;
}
.dsho-row {
  padding: 8px 0; word-break: break-all;
  font-family: Consolas, "Courier New", monospace;
}
.dsho-footer {
  margin-top: 14px;
  padding-top: 8px;
  text-align: center;
  font-size: 12px;
  color: var(--dsho-muted);
}
.dsho-link {
  color: var(--dsho-accent);
  cursor: pointer;
  text-decoration: none;
}
.dsho-link:hover { text-decoration: underline; }
.dsho-log { display: flex; align-items: flex-start; gap: 8px; }
.dsho-log-path {
  flex: 1; min-width: 0; word-break: break-all;
  color: var(--dsho-accent);
  text-decoration: underline;
  cursor: pointer;
}
`;

function aboutOverlayScript(dark, lang) {
  return `(() => {
  if (window.__dshAbout) return;
  var api = window.electronAPI;
  var LANG = {
    zh: {
      currentDsh: '当前 dsh', about: '关于', fetching: '正在获取…',
      dshPath: 'dsh 路径：', dshVersion: 'dsh 版本：', port: '启动端口：',
      mode: '启动方式：', modeApp: '应用启动', modeReuse: '复用已有实例',
      log: '应用日志：', notDetected: '（未检测到）',
      version: '版本：dsh-desktop v', repo: '仓库：',
    },
    en: {
      currentDsh: 'Current dsh', about: 'About', fetching: 'Fetching…',
      dshPath: 'dsh path: ', dshVersion: 'dsh version: ', port: 'port: ',
      mode: 'start mode: ', modeApp: 'started by app', modeReuse: 'reused existing instance',
      log: 'app log: ', notDetected: '(not detected)',
      version: 'version: dsh-desktop v', repo: 'repository: ',
    },
  };
  var cur = ${JSON.stringify(lang === "zh" ? "zh" : "en")};
  var showType = 'dsh';
  var info = null;
  function t(key) { return (LANG[cur] && LANG[cur][key]) || LANG['zh'][key]; }
  function mk(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined && text !== null) el.textContent = text;
    return el;
  }
  var overlay = mk('div', 'dsho-overlay');
  overlay.hidden = true;
  var box = mk('div', 'dsho-box');
  var head = mk('div', 'dsho-head');
  var titleEl = mk('span', 'dsho-title', t('currentDsh'));
  var closeBtn = mk('button', 'dsho-close', '\u00d7');
  head.appendChild(titleEl);
  head.appendChild(closeBtn);
  box.appendChild(head);
  var body = mk('div', 'dsho-body');
  // 当前 dsh 面板：路径 / 版本 / 端口 / 启动方式
  var dshPanel = mk('div', 'dsho-panel');
  var pathRow = mk('div', 'dsho-row', t('fetching'));
  var verRow = mk('div', 'dsho-row', t('fetching'));
  var portRow = mk('div', 'dsho-row', t('fetching'));
  var modeRow = mk('div', 'dsho-row', t('fetching'));
  dshPanel.appendChild(pathRow);
  dshPanel.appendChild(verRow);
  dshPanel.appendChild(portRow);
  dshPanel.appendChild(modeRow);
  // 关于面板：软件版本 / 仓库地址 / 应用日志
  var appPanel = mk('div', 'dsho-panel');
  appPanel.hidden = true;
  var appVerRow = mk('div', 'dsho-row', '');
  var appRepoRow = mk('div', 'dsho-row');
  var repoLabel = mk('span', '', t('repo'));
  appRepoRow.appendChild(repoLabel);
  var repoLink = mk('a', 'dsho-link', '${REPO_URL}');
  repoLink.href = '#';
  repoLink.addEventListener('click', function (e) {
    e.preventDefault();
    if (api && api.openRepo) api.openRepo();
  });
  appRepoRow.appendChild(repoLink);
  var logLabel = mk('span', '', t('log'));
  var logPathSpan = mk('span', 'dsho-log-path', '…');
  logPathSpan.addEventListener('click', function () { if (api && api.openLog) api.openLog(); });
  var logRow = mk('div', 'dsho-row dsho-log');
  logRow.appendChild(logLabel);
  logRow.appendChild(logPathSpan);
  appPanel.appendChild(appVerRow);
  appPanel.appendChild(appRepoRow);
  appPanel.appendChild(logRow);
  body.appendChild(dshPanel);
  body.appendChild(appPanel);
  box.appendChild(body);
  overlay.appendChild(box);
  document.documentElement.appendChild(overlay);
  function setTheme(d) {
    document.documentElement.setAttribute('data-dshc-theme', d ? 'dark' : 'light');
  }
  // 按当前语言 + 已获取的信息重绘全部文案（语言切换 / 数据刷新共用）
  function render() {
    titleEl.textContent = showType === 'app' ? t('about') : t('currentDsh');
    logLabel.textContent = t('log');
    repoLabel.textContent = t('repo');
    if (!info) return;
    pathRow.textContent = t('dshPath') + (info.dshPath ? info.dshPath : t('notDetected'));
    verRow.textContent = t('dshVersion') + (info.dshVersion ? info.dshVersion : t('notDetected'));
    portRow.textContent = t('port') + (info.port ? info.port : '-');
    modeRow.textContent = t('mode') + (info.startMode === 'app' ? t('modeApp') : t('modeReuse'));
    logPathSpan.textContent = info.logPath ? info.logPath : '';
    appVerRow.textContent = t('version') + (info.version ? info.version : '-');
  }
  function applyLang(l) {
    cur = l === 'zh' ? 'zh' : 'en';
    render();
  }
  function refresh() {
    if (!api || !api.getAppInfo) return;
    api.getAppInfo().then(function (res) {
      info = res;
      render();
    }).catch(function () {});
  }
  function show(type) {
    showType = type === 'app' ? 'app' : 'dsh';
    refresh();
    if (showType === 'app') {
      dshPanel.hidden = true;
      appPanel.hidden = false;
    } else {
      dshPanel.hidden = false;
      appPanel.hidden = true;
    }
    render();
    overlay.hidden = false;
  }
  function hide() { overlay.hidden = true; }
  closeBtn.addEventListener('click', hide);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) hide(); });
  if (api && api.onChromeTheme) api.onChromeTheme(setTheme);
  if (api && api.onChromeLanguage) api.onChromeLanguage(applyLang);
  setTheme(${dark ? "true" : "false"});
  window.__dshAbout = { show: show };
})();`;
}

module.exports = { ABOUT_OVERLAY_CSS, aboutOverlayScript };
