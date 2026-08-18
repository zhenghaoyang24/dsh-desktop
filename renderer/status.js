const theme = new URLSearchParams(location.search).get('theme');
if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');

// 界面语言：跟随主进程传入的 ?lang=（仅 zh 用中文；其余默认英文）
const lang = new URLSearchParams(location.search).get('lang') === 'zh' ? 'zh' : 'en';
const T = {
  zh: {
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
    timeoutErr: (n) => `校验超时（${n} 秒），请重试`,
    errNoDsh: '未检测到此路径下有 dsh',
  },
  en: {
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
    timeoutErr: (n) => `Validation timed out (${n}s); try again`,
    errNoDsh: 'No dsh found at this path',
  },
};
const t = (key, ...args) => {
  const s = (T[lang] && T[lang][key]) ?? T.zh[key];
  return typeof s === 'function' ? s(...args) : s;
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

// 校验输入是否为 Windows 路径格式（盘符/UNC 开头，且不含非法字符）
function looksLikePath(p) {
  if (!p || p.length < 3) return false;
  const drive = /^[a-zA-Z]:[\\/]/.test(p);
  const unc = /^\\\\[^\\]+\\[^\\]+/.test(p);
  if (!drive && !unc) return false;
  return !/[<>"|?*]/.test(drive ? p.slice(3) : p);
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
