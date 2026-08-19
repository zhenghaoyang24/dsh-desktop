// 主进程各模块共享的可变状态。原 main.js 中的模块级 let 变量集中到这里，
// 所有模块通过 `state.xxx` 读写，保持与原先完全相同的语义与赋值时机。
const state = {
  win: null, // 主 BrowserWindow
  dshProc: null, // 应用自启的 dsh 子进程
  dshOwned: false, // 3080 上的 dsh 是否由本应用启动
  killTask: null, // 进行中的 dsh 清理任务（close 触发后 will-quit 需等待其完成）
  webReady: false, // dsh 页面是否已加载
  busy: false, // 启动流程进行中，防止重入
  lastStatus: null, // 最近一次推送给启动页的状态（did-finish-load 后补发）
  dshOut: "", // dsh stdout/stderr 的滚动缓冲区（最近 8k，错误页展示用）
  pendingDshPath: null, // 用户在启动页确认的 dsh 路径（校验通过但尚未启动成功，成功后写入缓存）
  currentDshPath: null, // 本次会话实际使用的 dsh 路径（自启时记录；复用时置空）
  startMode: null, // dsh 启动方式：'app' = 应用自启；'reuse' = 复用已有实例
  currentLang: "en", // 界面语言：'zh' | 'en'
  appInfoCache: null, // get-app-info 的会话内缓存（弹「当前 dsh/关于」只探测一次；startFlow 时失效）
  dshView: null, // dsh 页面所在独立视图（WebContentsView，位于顶栏下方）
  killOnClose: false, // 关闭应用时是否一并关闭 3080 上的 dsh
  closePromptDone: false, // 复用场景退出询问弹窗是否已决策
  closePromptPending: false, // 弹窗弹出中，防止关闭事件重入
  filePanelOpen: false, // 文件树面板是否打开
};

module.exports = { state };
