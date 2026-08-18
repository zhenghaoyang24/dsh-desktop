const PORT = 3080;
const APP_URL = `http://127.0.0.1:${PORT}`;
const HOME_URL = "https://www.deepseek.com/harness/";
const COMMUNITY_URL = "https://github.com/topics/dsh-plugin";
const REPO_URL = "https://github.com/zhenghaoyang24/dsh-desktop";
const START_TIMEOUT_MS = 30000;
// 自绘顶栏高度（dsh 视图位于顶栏下方，y 从该处开始）
const BAR_HEIGHT = 32;
const DSH_NPM_NAME = "@deepseek-ai/dsh";
const DSH_GIT_REPO = "https://github.com/deepseek-ai/deepseek-harness";

module.exports = { PORT, APP_URL, HOME_URL, COMMUNITY_URL, REPO_URL, START_TIMEOUT_MS, BAR_HEIGHT, DSH_NPM_NAME, DSH_GIT_REPO };
