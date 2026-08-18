# TODO

> 维护时间：2026-08-18。按优先级排列；勾选后请更新状态。

## 高价值

- [x] **补自动化测试（目前完全空白）**
  用 Node 内置 `node:test`（无需引入框架），覆盖纯逻辑：
  - `src/external.js` 的 `isExternalUrl`（3080 白名单 / mailto / tel）
  - `renderer/status.js` 的 `looksLikePath`、i18n 字典完整性
  - `src/startup.js` 的 `startFailureText`
  - `src/dsh.js` 的 `verifyDsh` 超时与退出分支（可 mock child_process）
  - `src/port.js` 的 `probePort` 对 200 / 非 dsh / 超时的判型
  — 已实现（2026-08-18）：`test/` 下 5 个测试文件共 21 用例，`npm test` 全绿；
    `looksLikePath` 与文案字典抽到 `renderer/status-core.js`（浏览器 + Node 共用单源）；
    `src/dsh.js` 改用 `cp.spawn/cp.execFile` 以便 mock。

- [x] **`get-app-info` 结果按会话缓存**
  `src/ipc.js:get-app-info` 每次弹「当前 dsh」都顺序 `verifyDsh` 最多 4 个候选（reuse
  场景 `currentDshPath=null`，每个 ~400ms node 冷启动，最坏 ~1.5s+）。
  建议：缓存最近一次成功结果，`startFlow` / 重启时失效。
  — 已实现（2026-08-18）：结果缓存于 `state.appInfoCache`，`startFlow` 开头置空。

- [x] **i18n 字典去重（当前 4 处重复）**
  `renderer/status.js` 的 `T`、`src/i18n.js` 的 `UI`、`chromeScript`、`aboutOverlayScript`
  各持一份文案。抽一份 id → {zh, en} 翻译文件，页面注入 JSON，避免新增字符串漏改。
  — 已实现（2026-08-18）：唯一来源收敛到 `renderer/status-core.js` 的 `T`（42 键，id→{zh,en}）；
    主进程 `src/i18n.js` 与注入脚本 `chrome/about` 都从它取，页面注入 JSON 子集；
    `timeoutErr` 由函数改为 `{0}` 占位符模板；新增 `test/i18n.test.js` 锁定同源。

## 中价值

- [x] **主题色常量抽取**
  `#1b1b1c` / `#f9fafb` / `#6b7280` / `rgb(129,133,140)` 等散落在 `window.js`、
  `theme.js`、两处注入 CSS（`src/injected/*`）。抽 `src/theme-palette.js`（或并入
  `constants.js`），改主题只动一处。
  — 已实现（2026-08-18）：新建 `src/theme-palette.js`（`PALETTE` + `color()`），
    主进程 `window/theme/view` 与注入样式 `chrome/about` 统一引用；注入 CSS 经
    模板插值生成，输出与原颜色一致。

- [ ] **加 CI（GitHub Actions）**
  无任何 CI。加 workflow：`node --check` + 基础测试 + tag 时 `npm run build` 并上传
  Releases，可复现构建、衔接自动化测试。

- [ ] **`pushDshOutput` 写盘节流**
  `src/dsh.js` 每块 stdout 都同步 append 到日志，输出量大时磁盘刷写频繁。
  加 ~200ms 缓冲合并写，同时保持实时性。

## 低价值 / 小项

- [x] **fallback 候选并行验证**：`src/startup.js` 降级阶段用 `Promise.all` 并发
  `verifyDsh`，保持顺序取第一个有效，省掉最坏 N×400ms。
  — 已实现（2026-08-18）：`Promise.all(candidates.map(verifyDsh))` + `findIndex` 按序取第一个有效。
- [ x ] 已删除（2026-08-18）： **清理 `.tmp-locale/`**：仓库内未跟踪的临时目录，删除或加入 `.gitignore`。
- [ ] **JSDoc 类型注释**：给 `src/state.js` 各字段补类型（当前已有语义说明），可选。
- [ ] **代码签名 / 公证**：消除 SmartScreen 提示（V2 计划项）。
