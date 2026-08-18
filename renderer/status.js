const theme = new URLSearchParams(location.search).get('theme');
if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');

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
    p.textContent = '未在 PATH 中找到 dsh，请手动输入路径';
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
      fb.textContent = '路径格式不正确，请输入形如 C:\\path\\to\\dsh.cmd 的路径';
      fb.className = 'feedback err';
      return;
    }
    path = input;
  } else if (selectedPath) {
    path = selectedPath;
  } else {
    fb.textContent = '请选择或输入 dsh 路径';
    fb.className = 'feedback err';
    return;
  }
  fb.textContent = '校验中…';
  fb.className = 'feedback';
  setBusy(true);
  let r;
  try {
    r = await withTimeout(api.confirmDshPath(path), VALIDATE_TIMEOUT_MS);
  } catch (_) {
    fb.textContent = `校验超时（${VALIDATE_TIMEOUT_MS / 1000} 秒），请重试`;
    fb.className = 'feedback err';
    return;
  } finally {
    setBusy(false);
  }
  if (!r.ok) {
    fb.textContent = r.error || '未检测到此路径下有 dsh';
    fb.className = 'feedback err';
    return;
  }
  fb.textContent = '';
  api.retry();
});

$('retry-btn').addEventListener('click', () => api.retry());
$('retry-btn-2').addEventListener('click', () => api.retry());
$('restart-btn').addEventListener('click', () => api.restartDsh());
