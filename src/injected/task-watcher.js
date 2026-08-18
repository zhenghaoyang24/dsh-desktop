// 注入 dsh 网页的任务观察器：监听合成器主按钮的 停止生成/发送消息 切换，
// 回答完成后通过 window.electronAPI.notifyTaskComplete() 上报（主进程决定是否通知）
const TASK_WATCHER = `(() => {
  if (window.__dshellTaskWatcher) return;
  window.__dshellTaskWatcher = true;
  const COMPLETE_DELAY = 800;
  let generating = false, sawGenerating = false, userStopped = false, timer = null;
  const isGenerating = () => {
    const card = document.querySelector('[data-composer-card="true"]');
    if (!card) return false;
    if (card.querySelector('button[aria-label*="停止"], button[aria-label*="Stop"]')) return true;
    const primary = card.querySelector('button[class$="_primary"]');
    return !!primary && !!primary.querySelector('svg rect');
  };
  document.addEventListener('click', (e) => {
    if (!generating) return;
    const card = document.querySelector('[data-composer-card="true"]');
    const stopBtn = card && card.querySelector('button[aria-label*="停止"], button[aria-label*="Stop"]');
    if (stopBtn && stopBtn.contains(e.target)) userStopped = true;
  }, true);
  const check = () => {
    const now = isGenerating();
    if (now && !generating) {
      generating = true; sawGenerating = true; userStopped = false; clearTimeout(timer);
    } else if (!now && generating) {
      generating = false;
      clearTimeout(timer);
      if (sawGenerating && !userStopped) {
        timer = setTimeout(() => {
          if (!isGenerating()) {
            try { window.electronAPI && window.electronAPI.notifyTaskComplete(); } catch (_) {}
          }
        }, COMPLETE_DELAY);
      }
      sawGenerating = false;
    }
  };
  new MutationObserver(check).observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label', 'class'],
  });
  check();
})();`;

module.exports = { TASK_WATCHER };
