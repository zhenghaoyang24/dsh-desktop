// i18n 唯一来源：所有文案集中在这里，按 id → {zh, en} 组织。
// 消费方：
//   · 浏览器 —— status.html 的前置脚本，挂到 window.DSHStartup（status.js 读 T）
//   · Node（主进程）—— src/i18n.js 直接 require 本模块的 T；注入脚本 chrome/about 也从此取
// 新增字符串只需在这里加 zh/en 两个值（test/status-core.test.js 会校验键一致性）。
(function () {
  // 校验输入是否为 Windows 路径格式（盘符/UNC 开头，且不含非法字符）
  function looksLikePath(p) {
    if (!p || p.length < 3) return false;
    const drive = /^[a-zA-Z]:[\\/]/.test(p);
    const unc = /^\\\\[^\\]+\\[^\\]+/.test(p);
    if (!drive && !unc) return false;
    return !/[<>"|?*]/.test(drive ? p.slice(3) : p);
  }

  const T = {
    zh: {
      // —— 启动页 ——
      detecting: '正在检测环境…',
      selectHint: '未找到可用的 dsh 缓存，请选择下方找到的 dsh，或手动输入路径：',
      pathPlaceholder: '例如 C:\\Users\\me\\AppData\\Roaming\\npm\\dsh.cmd',
      browse: '浏览…',
      confirm: '确定',
      starting: '正在启动 dsh web…',
      portConflictTitle: '端口 3080 被其他程序占用',
      portConflictHint1: '该端口上不是 dsh 服务，为避免加载陌生页面已停止。',
      portConflictHint2: '请释放端口后重试。',
      retry: '重试',
      failedTitle: 'dsh 启动失败',
      crashedTitle: 'dsh 运行中崩溃',
      restart: '重启',
      noCandidates: '未在 PATH 中找到 dsh，请手动输入路径',
      pathFormatErr: '路径格式不正确，请输入形如 C:\\path\\to\\dsh.cmd 的路径',
      selectOrInput: '请选择或输入 dsh 路径',
      validating: '校验中…',
      timeoutErr: '校验超时（{0} 秒），请重试',
      errNoDsh: '未检测到此路径下有 dsh',
      // —— 主进程：帮助菜单 / 退出弹窗 / 通知 / 校验错误 ——
      menuCurrentDsh: '当前 dsh',
      menuHome: 'DeepSeek Harness 官网',
      menuCommunity: '社区插件',
      menuAwesomePlugin: 'awesome-dsh-plugin',
      menuAbout: '关于',
      closeReuseMessage: '3080 端口上的 dsh 不是由本应用启动',
      closeReuseDetail: '是否在退出时一并关闭该 dsh？选择“保留”则 dsh 继续运行。',
      closeDsh: '关闭 dsh',
      keepDsh: '保留 dsh',
      toastBody: '回答已完成',
      errPathEmpty: '路径不能为空',
      // —— 检查更新 ——
      menuCheckUpdate: '检查 dsh 更新',
      updateTitle: '检查 dsh 更新',
      updateCurrentVersion: '当前版本：',
      updateLatestVersion: '最新版本：',
      updateChecking: '正在检查…',
      updateLatest: '已是最新版本',
      updateAvailable: '有新版本可用',
      updateVersionUnknown: '（无法获取）',
      updateSection: '更新方式',
      updateCheckFailed: '检查更新失败',
      updateManualCheckHint: '可在终端运行以下命令查询版本：',
      updateManualCheckGithub: '或访问：',
      updateNpmViewCmd: 'npm view @deepseek-ai/dsh version',
      updateNpmInstallCmd: 'npm install -g @deepseek-ai/dsh@latest',
      updateNpmReinstallCmd: 'npm install -g @deepseek-ai/dsh',
      updateNpxCmd: 'npx @deepseek-ai/dsh@latest',
      updateGitCmd: 'git clone',
      updateErrNetwork: '无法连接到 npm registry，请检查网络或代理设置。',
      updateErrNpmNotFound: '未在系统中找到 npm。',
      updateErrUnknown: '发生未知错误，请稍后重试。',
      // —— 顶栏 ——
      help: '帮助',
      view: '视图',
      // —— View 菜单 / 内容全屏 ——
      viewMaximize: '最大化',
      fullscreenHint: 'F11 退出最大化',
      // —— 关于浮层（当前 dsh / 关于 面板） ——
      currentDsh: '当前 dsh',
      about: '关于',
      fetching: '正在获取…',
      dshPath: 'dsh 路径：',
      dshVersion: 'dsh 版本：',
      port: '启动端口：',
      mode: '启动方式：',
      modeApp: '应用启动',
      modeReuse: '复用已有实例',
      log: '应用日志：',
      notDetected: '（未检测到）',
      version: '版本：dsh-desktop v',
      repo: '仓库：',
    },
    en: {
      // —— 启动页 ——
      detecting: 'Detecting environment…',
      selectHint: 'No usable dsh cache was found. Pick a detected dsh below, or enter a path manually:',
      pathPlaceholder: 'e.g. C:\\Users\\me\\AppData\\Roaming\\npm\\dsh.cmd',
      browse: 'Browse…',
      confirm: 'Confirm',
      starting: 'Starting dsh web…',
      portConflictTitle: 'Port 3080 is occupied by another program',
      portConflictHint1: 'The service on this port is not dsh, so the app stopped to avoid loading an unknown page.',
      portConflictHint2: 'Free the port and try again.',
      retry: 'Retry',
      failedTitle: 'dsh failed to start',
      crashedTitle: 'dsh crashed while running',
      restart: 'Restart',
      noCandidates: 'No dsh found in PATH; enter a path manually',
      pathFormatErr: 'Invalid path format; enter something like C:\\path\\to\\dsh.cmd',
      selectOrInput: 'Select or enter a dsh path',
      validating: 'Validating…',
      timeoutErr: 'Validation timed out ({0}s); try again',
      errNoDsh: 'No dsh found at this path',
      // —— 主进程：帮助菜单 / 退出弹窗 / 通知 / 校验错误 ——
      menuCurrentDsh: 'Current dsh',
      menuHome: 'DeepSeek Harness Website',
      menuCommunity: 'Community Plugins',
      menuAwesomePlugin: 'awesome-dsh-plugin',
      menuAbout: 'About',
      closeReuseMessage: 'The dsh on port 3080 was not started by this app',
      closeReuseDetail: 'Close this dsh when exiting? Choose “Keep” to leave it running.',
      closeDsh: 'Close dsh',
      keepDsh: 'Keep dsh',
      toastBody: 'Answer complete',
      errPathEmpty: 'Path must not be empty',
      // —— 检查更新 ——
      menuCheckUpdate: 'Check dsh Update',
      updateTitle: 'Check dsh Update',
      updateCurrentVersion: 'Current version: ',
      updateLatestVersion: 'Latest version: ',
      updateChecking: 'Checking…',
      updateLatest: 'Up to date',
      updateAvailable: 'Update available',
      updateVersionUnknown: '(Unknown)',
      updateSection: 'Update methods',
      updateCheckFailed: 'Update check failed',
      updateManualCheckHint: 'Run this command in terminal to check version:',
      updateManualCheckGithub: 'Or visit:',
      updateNpmViewCmd: 'npm view @deepseek-ai/dsh version',
      updateNpmInstallCmd: 'npm install -g @deepseek-ai/dsh@latest',
      updateNpmReinstallCmd: 'npm install -g @deepseek-ai/dsh',
      updateNpxCmd: 'npx @deepseek-ai/dsh@latest',
      updateGitCmd: 'git clone',
      updateErrNetwork: 'Cannot connect to npm registry. Check your network or proxy settings.',
      updateErrNpmNotFound: 'npm not found on this system.',
      updateErrUnknown: 'An unknown error occurred. Please try again later.',
      // —— 顶栏 ——
      help: 'Help',
      view: 'View',
      // —— View 菜单 / 内容全屏 ——
      viewMaximize: 'Maximize',
      fullscreenHint: 'Press F11 to exit fullscreen',
      // —— 关于浮层（当前 dsh / 关于 面板） ——
      currentDsh: 'Current dsh',
      about: 'About',
      fetching: 'Fetching…',
      dshPath: 'dsh path: ',
      dshVersion: 'dsh version: ',
      port: 'port: ',
      mode: 'start mode: ',
      modeApp: 'started by app',
      modeReuse: 'reused existing instance',
      log: 'app log: ',
      notDetected: '(not detected)',
      version: 'version: dsh-desktop v',
      repo: 'repository: ',
    },
  };

  const core = { looksLikePath, T };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  if (typeof window !== "undefined") window.DSHStartup = core;
})();
