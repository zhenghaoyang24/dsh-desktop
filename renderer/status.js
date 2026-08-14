const theme = new URLSearchParams(location.search).get('theme');
if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');

const api = window.electronAPI;
const $ = (id) => document.getElementById(id);

const VIEWS = ['detecting', 'no-dsh', 'starting', 'port-conflict', 'failed', 'crashed'];
let pathValid = false;

function show(state) {
  for (const v of VIEWS) {
    $(`view-${v}`).hidden = v !== state;
  }
}

api.onStatus((s) => {
  show(s.state);
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

async function validatePath(p) {
  const fb = $('path-feedback');
  if (!p.trim()) {
    pathValid = false;
    fb.textContent = '';
    fb.className = 'feedback';
  } else {
    fb.textContent = '校验中…';
    fb.className = 'feedback';
    const r = await api.setDshPath(p);
    pathValid = !!r.ok;
    fb.textContent = r.ok ? '路径有效' : r.error;
    fb.className = 'feedback ' + (r.ok ? 'ok' : 'err');
  }
  $('go-btn').disabled = !pathValid;
}

let validateTimer = null;
$('dsh-path').addEventListener('input', (e) => {
  clearTimeout(validateTimer);
  validateTimer = setTimeout(() => validatePath(e.target.value), 400);
});

$('browse-btn').addEventListener('click', async () => {
  const p = await api.browseDshPath();
  if (p) {
    $('dsh-path').value = p;
    validatePath(p);
  }
});

$('go-btn').addEventListener('click', () => api.retry());
$('home-btn').addEventListener('click', () => api.openHomepage());
$('retry-btn').addEventListener('click', () => api.retry());
$('retry-btn-2').addEventListener('click', () => api.retry());
$('restart-btn').addEventListener('click', () => api.restartDsh());
