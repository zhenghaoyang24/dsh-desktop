const theme = new URLSearchParams(location.search).get('theme');
if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');

// 界面语言：跟随主进程传入的 ?lang=（仅 zh 用中文；其余默认英文）
const lang = new URLSearchParams(location.search).get('lang') === 'zh' ? 'zh' : 'en';
// 纯逻辑与文案字典定义在 status-core.js（浏览器挂到 window.DSHStartup；测试可直接 require）
const { looksLikePath, T } = window.DSHStartup;
const t = (key, ...args) => {
  const s = (T[lang] && T[lang][key]) ?? T.zh[key];
  if (typeof s !== 'string') return s;
  // 支持 {0} {1}… 占位符（如 timeoutErr）
  return s.replace(/\{(\d+)\}/g, (_, i) => args[Number(i)] ?? '');
};
function applyI18n() {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
}
applyI18n();

const api = window.electronAPI;
const $ = (id) => document.getElementById(id);

const VIEWS = ['detecting', 'select-dsh', 'starting', 'port-conflict', 'failed', 'crashed'];
const VALIDATE_TIMEOUT_MS = 6000; // 渲染层兜底超时（主进程 verifyDsh 上限 5s）
let selectedPath = null;

function show(state) {
  for (const v of VIEWS) {
    $(`view-${v}`).hidden = v !== state;
  }
}

// 校验期间禁用：确认按钮、路径输入框、浏览按钮、候选单选
function setBusy(busy) {
  $('confirm-btn').disabled = busy;
  $('dsh-path').disabled = busy;
  $('browse-btn').disabled = busy;
  for (const r of document.querySelectorAll('input[name="dsh-candidate"]')) r.disabled = busy;
}

function clearFeedback() {
  const fb = $('path-feedback');
  fb.textContent = '';
  fb.className = 'feedback';
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

function renderCandidates(candidates) {
  const list = $('candidate-list');
  list.innerHTML = '';
  selectedPath = null;
  if (!candidates || candidates.length === 0) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = t('noCandidates');
    list.appendChild(p);
    return;
  }
  for (const c of candidates) {
    const label = document.createElement('label');
    label.className = 'candidate';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'dsh-candidate';
    radio.value = c;
    // 点击事件触发时浏览器已更新 checked，必须用 mousedown 记录点击前状态，
    // 才能区分「新选中」和「再次点击取消选择」。
    // mousedown 挂在 label 上：点 radio 小圆点会冒泡到 label，点 label 文字
    // 只有 click 被转发（mousedown 不会），两者都要记录点击前状态
    label.addEventListener('mousedown', () => {
      radio.dataset.prev = radio.checked ? '1' : '0';
    });
    radio.addEventListener('click', () => {
      if (radio.checked && radio.dataset.prev === '1') {
        // 点击前已选中 → 取消选择
        radio.checked = false;
        selectedPath = null;
        clearFeedback();
      }
    });
    radio.addEventListener('change', () => {
      if (radio.checked) {
        selectedPath = c;
        clearFeedback();
      }
    });
    const span = document.createElement('span');
    span.className = 'candidate-path';
    span.textContent = c;
    label.appendChild(radio);
    label.appendChild(span);
    list.appendChild(label);
  }
}

api.onStatus((s) => {
  show(s.state);
  if (s.state === 'select-dsh') {
    $('dsh-path').value = '';
    setBusy(false);
    renderCandidates(s.candidates);
  }
  if (s.state === 'starting' && s.path) {
    $('starting-sub').textContent = 'dsh: ' + s.path;
  }
  if (s.state === 'failed') {
    $('failed-log').textContent = s.stderr || '';
  }
  if (s.state === 'crashed') {
    $('crashed-log').textContent = s.stderr || '';
  }
});

$('browse-btn').addEventListener('click', async () => {
  const p = await api.browseDshPath();
  if (p) {
    $('dsh-path').value = p;
    const fb = $('path-feedback');
    fb.textContent = '';
    fb.className = 'feedback';
  }
});

$('confirm-btn').addEventListener('click', async () => {
  const fb = $('path-feedback');
  const input = $('dsh-path').value.trim();
  let path = null;
  if (input) {
    if (!looksLikePath(input)) {
      fb.textContent = t('pathFormatErr');
      fb.className = 'feedback err';
      return;
    }
    path = input;
  } else if (selectedPath) {
    path = selectedPath;
  } else {
    fb.textContent = t('selectOrInput');
    fb.className = 'feedback err';
    return;
  }
  fb.textContent = t('validating');
  fb.className = 'feedback';
  setBusy(true);
  let r;
  try {
    r = await withTimeout(api.confirmDshPath(path), VALIDATE_TIMEOUT_MS);
  } catch (_) {
    fb.textContent = t('timeoutErr', VALIDATE_TIMEOUT_MS / 1000);
    fb.className = 'feedback err';
    return;
  } finally {
    setBusy(false);
  }
  if (!r.ok) {
    fb.textContent = r.error || t('errNoDsh');
    fb.className = 'feedback err';
    return;
  }
  fb.textContent = '';
  api.retry();
});

$('retry-btn').addEventListener('click', () => api.retry());
$('retry-btn-2').addEventListener('click', () => api.retry());
$('restart-btn').addEventListener('click', () => api.restartDsh());
