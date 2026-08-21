# AGENTS.md — dsh-desktop

An Electron desktop shell for DeepSeek Harness. Wraps the `dsh web` browser UI into a double-clickable Windows portable app.

## Project goal

The user has dsh (DeepSeek Harness) installed globally. This project builds an Electron app that:

- Detects the local dsh at startup and starts its web service
- Loads the web page into a native window, presenting it as a desktop app
- Ships as a Windows portable package (double-click to run, no installation)

## Decided decisions (confirmed round-by-round with the user; do not change without asking)

### Port policy (important)
- **Fixed port 3080**, no dynamic port (this overrides the earlier "dynamic port" decision; this entry is authoritative)
- Startup flow:
  1. Probe `127.0.0.1:3080`
  2. 3080 responds and matches dsh → **reuse directly**, loadURL
  3. 3080 no response → `spawn dsh web` ourselves (default port 3080), poll until ready, loadURL
  4. 3080 responds but **does not match** (occupied by a non-dsh program) → show error + retry button (never load an unknown page; security risk)
- Goal: only one dsh on 3080 at any time

### dsh feature detection
How to tell that "what's running on 3080 is dsh" (tested in practice):
- GET `http://127.0.0.1:3080`
- Page `<title>` is `DeepSeek Harness`
- HTML contains `window.__DSH_BOOT__`
- Match → reuse; 200 but no match → occupied by non-dsh

### dsh provisioning (Q1, updated 2026-08-17: manual selection; updated 2026-08-17: trust-direct-start)
- Depends **only on the system-global dsh**; no bundled dsh
- Detection order (startup, only when 3080 is free):
  1. Port probe and PATH-candidate collection run **in parallel** (candidates are only prefetched when no usable cached path exists — the reuse case never spawns `where dsh`)
  2. Use the user-confirmed path (from the select page) or the cached `userData/settings.json` path; if the file exists (`isFile` check, dirs rejected) → **trust it and spawn directly, skipping `dsh -V`** (saves one ~400ms node cold start per launch)
  3. If the trusted spawn fails (exit/timeout): verify the path with `dsh -V` — still valid → normal failure page; **invalid → auto-fallback**: take the first valid candidate from `where dsh`, `await killDsh()` (clears leftovers that may still hold 3080), retry once, and cache the fallback path **only after a successful start**; no valid candidate → select page
  4. No cached path / cached file missing → collect **all** dsh candidates from `where dsh` (deduped, prefer `.cmd/.bat/.exe`; extensionless only if nothing else) and show them on the startup page
  5. The startup page shows a candidate list (radio buttons, click again to deselect) + a manual path input ("Browse…" picker) + a confirm button:
     - Confirm uses the input path when non-empty (must match a Windows path shape — drive/UNC prefix, no illegal chars — before validation), otherwise the selected candidate
     - The chosen path is validated with `dsh -V` (5s cap); invalid → "未检测到此路径下有 dsh" shown inline; while validating, the confirm button / radio list / input are disabled (renderer-side 6s safety timeout)
  6. A valid path is used to start dsh; **only after a successful start** it is written back to `settings.json` (permanent cache) — a confirmed-but-failed start is not cached

### Process lifecycle (Q3, updated 2026-08-18: close prompts for reused dsh)
- Closing the window = quitting the app
  - dsh **started by the app** → closed **directly, no prompt**
  - dsh **reused from 3080** (started externally) → **prompt first** ("关闭 dsh / 保留 dsh"): closing it runs `killPortOwner`; keeping it leaves the external dsh running
- Kill strategy is two-layered (`killDsh(killOnClose)`): `taskkill /T /F` on the spawned cmd/node tree when app-started, **then** `killPortOwner` finds and kills whatever still listens on 3080 via `netstat` — this catches dsh server processes that detached from the cmd tree **and shuts down a reused external dsh** when the user confirms; `will-quit` waits for the in-flight kill task (`killTask`) before exiting
- The startup/retry cleanup call (`killDsh()` without args) only cleans app-started processes — it must **not** kill an external dsh, because the port probe right after is what reuses it
- V1 has no system tray

### Single instance (Q9)
- Single-instance lock at the exe level: a second double-click activates the existing window instead of opening another

### Packaging (Q4 / Q11, updated 2026-08-14: both)
- Two artifacts; the **zip directory build** is the primary (unzip and run, instant start); the single-file portable is secondary (no extraction needed for distribution, but self-extracts ~15s on every launch)
  - `build/dsh-desktop-${version}-windows-x64.zip` → unzip, then double-click `dsh-desktop.exe`
  - `build/dsh-desktop-${version}-windows-x64.exe` (electron-builder `portable` target)
- App/product name: `dsh-desktop`; exe file name: `dsh-desktop.exe`; version `0.1.5`
- Icon: exe icon is `buildResources/icon.png` (black DeepSeek logo on a white rounded-corner background); the window/taskbar icon uses `buildResources/icon.ico` (multi-size .ico generated from `icon.png`, same white rounded bg, so the taskbar icon matches the exe); the startup-page top logo uses `buildResources/logo.png` (transparent background, referenced as `../buildResources/logo.png` from `renderer/status.html` — the old `renderer/logo.png` copy was removed)
- Not signed (SmartScreen considered for V2)

### Theme following (2026-08-14, updated 2026-08-17: custom top bar)
- The app follows the theme set in dsh's web UI (light/dark/system)
- Reads `ui-theme.preference` from `$DSH_HOME/settings.yaml` (default `~/.dsh/settings.yaml`)
- `system` resolves via the OS color scheme; the app sets `nativeTheme.themeSource` accordingly, updates the window `backgroundColor`, the custom top bar and Window Controls Overlay colors (`win.setTitleBarOverlay`), and pushes `chrome-theme` to the injected bar
- Window/taskbar icon is fixed to `buildResources/icon.ico` (generated from `icon.png`, white rounded bg) — no per-theme logo swap. A single lone PNG as the window icon renders as the Electron default on the Windows taskbar, so a multi-size .ico is used instead; the previous `win.setIcon()` light/dark logo swapping in `theme.js` was removed
- Live sync: `fs.watch` on `$DSH_HOME` filtered to `settings.yaml` events (dsh persists in-app theme changes there) → re-apply on change (~300ms debounce)
- The startup page receives the resolved theme as `?theme=dark|light` and uses DeepSeek's official dark palette (bg `rgb(21,21,23)`, layer `rgb(35,35,36)`, brand blue `rgb(86,134,254)`); the black logo is inverted in dark mode

### 多语言 i18n（2026-08-18：跟随 dsh web 语言切换）
- The app UI language follows dsh web: it reads `locale.preference` from `$DSH_HOME/settings.yaml` (`readLangPreference`). Only `zh`/`zh-*` maps to Chinese; a missing setting or any other language (including `en`) falls back to **English**
- Covers every app-owned string: the top-bar 帮助/View buttons (`Help`/帮助, `View`/视图), all dropdown-menu items (help + View, incl. the fullscreen hint), the entire 「当前 dsh / 关于」 overlay (title, labels, placeholders, mode/version text), all startup-page states (detecting / select / starting / port-conflict / failed / crashed + feedback hints), the reused-dsh close prompt dialog, and the completion toast
- Two delivery paths: the startup page gets its initial language via the `?lang=zh|en` `loadFile` query (same mechanism as `?theme=`); the injected top bar, help menu and overlays subscribe to the `chrome-language` IPC event (pushed by `applyLanguage()` to both `win.webContents` and the dsh view) for **live** switching
- `startSettingsWatch` (renamed from `startThemeWatch`) syncs theme and language together from the same `settings.yaml` watcher (~300ms debounce); the about overlay re-renders in place, keeping already-fetched dsh info and only swapping copy
- Main-process strings use `t()` (`currentLang`); **all strings live in one source** — `renderer/status-core.js`'s `T` (id → {zh,en}); main-process `src/i18n.js` and the injected `chrome`/`about`/`dropdown`/`fullscreen-hint` scripts pull from it (embedding an id-subset JSON); preload exposes `onChromeLanguage`

### Tech stack (Q5)
- **Plain JavaScript** — no TypeScript, no framework, no Vite/build step
- Keep the shell thin: the main process only spawns dsh → resolves the port → loadURL → status display (plus theme sync)
- Packaged with electron-builder

### Window (Q10 / Q13, updated 2026-08-17: custom top bar; updated 2026-08-18: 帮助 dropdown menu; updated 2026-08-18: custom HTML dropdown; updated 2026-08-18: View dropdown + 内容全屏)
- 1280×800, maximizable, min size 800×600
- **No menu bar**; **custom top bar** replaces the native title bar: `titleBarStyle: 'hidden'` + `titleBarOverlay` (Window Controls Overlay keeps native min/max/close on the right); no title-bar icon
- The top bar (32px, injected only into the startup page via `injectChrome`) shows the **dsh logo** on the left (`../buildResources/logo.png`, black transparent; inverted to white via CSS `filter` in dark mode — it replaced the earlier `dsh-desktop` brand text), then **帮助** and **View** buttons whose labels use the **secondary/muted text color** (`--dshc-muted`: `#6b7280` light / `rgb(129,133,140)` dark) and switch to the **primary text color** (inherited bar `color`) on hover; the buttons are **hidden on the startup page** (default `display:none`, shown by the `chrome-btns-state` IPC once the dsh view is mounted, hidden again when the view is removed)
- Clicking 帮助 pops a **custom HTML dropdown menu** (native `Menu.popup` was replaced 2026-08-18). The menu UI is a **shared dropdown component** (`src/injected/dropdown.js`, `.dshdd-*` CSS + `dropdownScript`, one injection registers both the help and View menus from the `MENUS` config) injected into the **dsh view**, with the **startup page as fallback** before the view exists — the same injection pattern as the about/update overlays. Why the view: the dsh `WebContentsView` covers the startup page below the bar, so a menu rendered in the startup page would be hidden behind it. Flow: button click → `open-menu` IPC (menuId + button's viewport rect) → main (`toggleDropdown`/`showDropdown` in `src/injected/index.js`) translates the rect into the target page's coordinates (**y − BAR_HEIGHT** when targeting the view, since view y:0 = window content y:32) and pushes `dropdown-popup`; the injected script renders the dropdown below the button (right-edge clamp, flips upward when there is no room below) and stays theme/language-synced via the same `onChromeTheme` / `onChromeLanguage` channels. Two separators split it into three groups; the dsh group (当前 dsh / 检查 dsh 更新 / 刷新 dsh 页面), the community group (社区插件 / awesome-dsh-plugin / DeepSeek Harness 官网), then 关于:
  1. **当前 dsh** — in-page overlay (`injectAboutOverlay` into the dsh view, with the startup page as fallback before the view exists): dark `rgba(0,0,0,.55)` backdrop + `backdrop-filter: blur`, bottom-bordered header (当前 dsh + close), placeholder rows ("正在获取…") filled with the **detected** dsh path/version (in-use → cache → PATH candidates, first valid wins via `get-app-info`), port, start mode (app-started vs reused)
  2. **检查 dsh 更新** — in-page overlay (`injectUpdateCheckOverlay`): current dsh version vs npm registry latest (`check-dsh-update` / `checkLatestDshVersion`), plus manual update commands
  3. **刷新 dsh 页面** — reloads the dsh WebContentsView (`state.dshView.webContents.reload()`)
  4. **社区插件** — opens `https://github.com/topics/dsh-plugin` in the default browser
  5. **awesome-dsh-plugin** — opens `https://awesome-dsh-plugin.com/` in the default browser
  6. **DeepSeek Harness 官网** — opens `https://www.deepseek.com/harness/` in the default browser
  7. **关于** — the same overlay in app mode: **dsh-desktop version**, **仓库地址** (`open-repo`), and the **应用日志** path as a clickable link (`open-log`, opens the logs folder/file)
- Menu-item clicks report back via `dropdown-action` (menuId + action id whitelist handled in the main process: about/update overlays + `shell.openExternal` links + view-maximize). The menus close on **outside click / Escape / clicking the same button again (toggle, `state.openMenu`) / opening the other menu / window blur** (`win.on('blur')` in `src/window.js`); user-side closes send `dropdown-closed` so the main process resets the button's `.dshc-menu-open` highlight (`dropdown-menu-state`). The old native-menu hover-residue workaround (`resolveHelpHover` + trusted `sendInputEvent` `mouseMove`) was removed — a custom in-page menu has no native window swallowing mouse input, so no stale `:hover` can persist
- **View 菜单与内容全屏（2026-08-18）**: 顶栏「帮助」右侧的 **View** 按钮（文案 `view`：视图/View，与帮助按钮同一套显隐/高亮/语言逻辑）弹出同组件的下拉菜单，菜单项配置在 `dropdown.js` 的 `MENUS.view` 里（后续「调整布局等视图相关内容」直接加项；菜单项支持可选 `shortcut` 字段渲染右侧快捷键提示，如「最大化 F11」），目前只有一项「最大化」。点击 **View → 最大化** 进入**内容全屏模式**：`win.setFullScreen(true)`（OS 全屏、覆盖任务栏，与浏览器 F11 一致）+ 隐藏自绘顶栏（`chrome-bar-visible` IPC）+ dsh 视图铺满整个窗口内容区（`layoutDshView` 的 `state.fullscreenMode` 分支，y:0 全尺寸）；进入时强制关闭文件树面板并收起已打开的下拉菜单，随后 dsh 视图内弹出「F11 退出最大化」提示（`src/injected/fullscreen-hint.js`，~3.5s 自动淡出、指针穿透、随主题/语言联动）；**F11 切换**进出（`handleGlobalKey` 同时挂在启动页与 dsh 视图的 `before-input-event` 上 —— before-input-event 按 webContents 分发，焦点在 dsh 页面时快捷键也要生效；DevTools 改为仅由 View 菜单「打开开发者工具」按钮打开，不再绑定 F12 快捷键）。退出恢复原窗口状态与顶栏；`leave-full-screen`（如 Win+↓ 等外部途径退出）同步复位；dsh 崩溃移除视图时自动退出全屏
- Bar colors: light `#f9fafb` / dark `#1b1b1c`, with a bottom border; the Window Controls Overlay uses the same colors
- **The dsh page lives in its own `WebContentsView`** positioned below the top bar (`y: 32`, re-laid out on resize/maximize; in 内容全屏 mode it fills the whole window at `y: 0`): the dsh page is **never modified for layout** (no CSS/DOM injection that changes layout), so its own modals, popups and scrollbars behave exactly like a normal browser viewport; only non-layout additions are attached to the view's webContents — the about/update-check overlays, the shared dropdown menus (帮助/View), the fullscreen hint and the external-link handlers; on dsh crash the view is removed so the startup page's crash state shows
- Title is locked (`page-title-updated` prevented): window/taskbar title always shows `dsh-desktop <version>`, never the page's conversation title
- External links (http/https outside `127.0.0.1:3080`, plus `mailto:`/`tel:`) open in the **system default browser** via `shell.openExternal` — handled for both `target="_blank"`/`window.open` (`setWindowOpenHandler`) and in-page navigations (`will-navigate`); the app page itself is never redirected to the browser

### Startup page state machine (Q7, all states)
```
[App start]
  ├─ Single-instance lock → instance exists? → activate existing, exit
  ├─ Detect dsh path (see "dsh provisioning")
  ├─ Probe 3080 (see "Port policy")
  ├─ Show the corresponding state on the startup page
  └─ Window close → kill self-started dsh → exit
```
States the startup page must cover: detecting → select dsh (candidate list + manual input + confirm) → starting web → port ready → switch to main UI. Additional: dsh crash/timeout after start → show **dsh's raw stderr** + retry button.

### Crash recovery (Q14)
- dsh crashes mid-run: show an error page + manual "Restart" button. No auto-restart

### Logging (Q15)
- dsh's stdout/stderr is **written to disk** at `userData/logs/dsh.log`; error states also display it

### DevTools (Q16)
- No menu bar; DevTools opens **only via the View menu「打开开发者工具」button** (no F12 shortcut, so it cannot be triggered app-wide by a keypress)

### Completion notification (2026-08-17, updated 2026-08-20: official event stream; 2026-08-20: failures notify too; 2026-08-20: per-run detection fixes duplicate toasts)
- When a harness run (task) ends and the window is **minimized** at that moment, the app shows a Windows toast ("任务有新回复"); clicking it restores and focuses the window
- Detection (replaced the old DOM `TASK_WATCHER` injection, deleted 2026-08-20): the **main process** connects directly to dsh's official event streams — `ws://127.0.0.1:3080/api/events.host` + `ws://127.0.0.1:3080/api/events.mux` (same channels the web UI uses; no auth, no handshake, frames are `{type:"server-request", rpcId, method, payload}`)
- **"Task ended" = the session's `host/session-status` running:true→false flip** (driven by `agent/status`, the same signal as the composer's stop button: `primaryStops = running && subagent === null`). The agent-loop's `kick()` is `while (await this.turn())` — one user task runs all its turns before returning to idle, so `running:false` fires **once per task**. Never notify per `turn/end`: one task can contain multiple turns, which caused duplicate toasts
- The terminal reason comes from the run's **last `turn/end`** (mux stream). Notify on **every** reason — `completed` and failures (`error`/`blocked`/`max-tokens`/`interrupted`) alike; **manual stop does not notify** (`aborted`) and subagent sessions are skipped (origin from `host/session-added` + `session.list` baseline)
- Cross-stream ordering: `turn/end` (mux WS) and `running:false` (host WS) are two sockets with no ordering guarantee, so `running:false` waits a 400ms settle window (or is finalized early when the trailing `turn/end` arrives) before evaluating; a `session.list` baseline on connect/reconnect marks already-running sessions (reuse case) and existing subagent sessions
- `src/task-events.js` owns the watcher: `startTaskWatcher()` on dsh view mount (`view.js` `loadApp`), `stopTaskWatcher()` on `removeDshView` (dsh crash), auto-reconnect (3s) while started; Node ≥22 global `WebSocket` (Electron 43 = Node 24), zero new dependencies; pure predicate `shouldNotifyRunEnd` unit-tested in `test/task-events.test.js`
- Requires `app.setAppUserModelId('github.zhenghaoyang24.dsh-desktop')` (matches `appId`) — without it Windows toasts silently fail
- AUMID / `appId` 统一为 `github.zhenghaoyang24.dsh-desktop`：Windows 会**按 AUMID 缓存任务栏图标**；旧值 `com.dsh.desktop` 的图标缓存曾被污染成 Electron 默认图标，换新值可强制生成新缓存条目、恢复正确图标。务必保持 `main.js` 的 AUMID 与 `electron-builder.yml` 的 `appId` 一致，且**不要**改回旧值（除非先清掉 `%LocalAppData%\Microsoft\Windows\Explorer\iconcache_*.db`）

## Directory layout

```
dsh-desktop\
├── package.json
├── main.js                  # Entry: app lifecycle + module assembly (single-instance lock, whenReady, will-quit)
├── preload.js               # contextBridge exposing window.electronAPI
├── src/                     # Main-process modules (plain JS, CommonJS, no build step)
│   ├── constants.js         # PORT / APP_URL / HOME_URL / REPO_URL / START_TIMEOUT_MS / BAR_HEIGHT
│   ├── paths.js             # Project root, userData/settings/log/dshHome paths, log(), preload/statusHtml/buildResource
│   ├── state.js             # Shared mutable state (win / dshView / dshProc / startMode / …)
│   ├── settings-store.js    # readSettings / writeSettings / isFile
│   ├── status.js            # sendStatus (startup-page state push)
│   ├── i18n.js              # t() + readLangPreference + applyLanguage（文案取 renderer/status-core）
│   ├── theme.js             # readThemePreference + applyTheme + startSettingsWatch
│   ├── theme-palette.js     # PALETTE + color()（主进程与注入样式共用的主题色板）
│   ├── port.js              # probePort (3080 dsh match) + killPortOwner (netstat)
│   ├── external.js          # isExternalUrl (links to system browser)
│   ├── dsh.js               # runDshCmd / verifyDsh / findDshCandidates / spawnDsh / killDsh / waitForPort
│   ├── startup.js           # startFlow (boot state machine) + startFailureText
│   ├── view.js              # dsh WebContentsView: loadApp / layoutDshView / removeDshView / 内容全屏 enter/exit/toggle / handleGlobalKey (F11)
│   ├── window.js            # createWindow (close prompt, F11 按键, external links)
│   ├── ipc.js               # All ipcMain handlers (registered on require)
│   ├── task-events.js       # 任务完成通知：主进程直连 dsh 官方事件流（/api/events.mux + .host），running:true→false（成功或失败）→ 最小化时弹 toast
│   └── injected/
│       ├── chrome.js        # CHROME_CSS + chromeScript() (custom top bar: logo + 帮助/View 按钮)
│       ├── about.js         # ABOUT_OVERLAY_CSS + aboutOverlayScript() (当前 dsh / 关于 overlay)
│       ├── update-check.js  # UPDATE_CHECK_CSS + updateCheckScript() (检查 dsh 更新 overlay)
│       ├── dropdown.js      # DROPDOWN_CSS + dropdownScript() (共享下拉菜单组件：帮助 + View，MENUS 配置)
│       ├── fullscreen-hint.js # FULLSCREEN_HINT_CSS + fullscreenHintScript() (「F11 退出最大化」提示)
│       └── index.js         # injectChrome / injectAboutOverlay / injectDropdown / injectFullscreenHint / toggleDropdown / setChromeBtns
├── renderer/
│   ├── status.html          # Startup page (single page, all states) + top-bar host
│   ├── status-core.js       # 启动页纯逻辑（looksLikePath）+ i18n 唯一来源 T（浏览器/主进程/注入共用单源）
│   ├── status.css
│   ├── status.js
├── test/                    # node:test 自动化测试（pnpm test 运行）
│   ├── external.test.js     # isExternalUrl
│   ├── status-core.test.js  # looksLikePath + i18n 字典完整性
│   ├── startup.test.js      # startFailureText
│   ├── dsh.test.js          # verifyDsh（mock child_process 超时/退出/error 分支）
│   ├── port.test.js         # probePort（match / 非 dsh / error / timeout）
│   └── task-events.test.js  # shouldNotifyRunEnd（成功/失败原因、aborted、子代理、未运行/无回合事件）
├── buildResources/
│   ├── logo.png             # Black DeepSeek logo, transparent bg (startup-page top logo)
│   ├── logo-light.png       # White DeepSeek logo (no longer used by window; kept as resource)
│   ├── icon.png             # Logo on white rounded-corner background (exe icon source)
│   └── icon.ico             # Multi-size .ico from icon.png (window/taskbar icon)
├── electron-builder.yml
├── README.md
├── .gitignore
└── AGENTS.md
```

## Behavior constraints (for agents working in this repo)

1. **Do not change decided decisions** unless the user explicitly asks again. Core decisions like the port policy must be re-confirmed with the user first.
2. Keep the shell thin: no unrelated features, no abstractions, no unrequested config.
3. The startup page is plain HTML/CSS/JS — no frameworks, no build step.
4. IPC goes through `preload.js`'s `contextBridge` (`contextIsolation: true`, `nodeIntegration: false`).
5. The main process uses `child_process.spawn` to launch dsh; on Windows `.cmd` needs the correct spawn handling.
6. Every dsh interaction error must land on the error-state page with stderr shown — never let the user stare at a black screen.
7. Logs go to `userData/logs/`.
8. Follow this repo's style; every new file must earn its place — no dead code.

## Run and build

```powershell
# Development
npx electron .

# Test
pnpm test    # node --test（纯逻辑 / mock 进程与端口探测）

# Build (output to build/: zip directory build + single-file portable)
pnpm run build    # equivalent to electron-builder --win zip portable
```

### Build mirror (important in CN network)

electron-builder downloads Electron/binaries from GitHub, which often times out in China.
Set the npmmirror mirrors before building (only needed once per shell session):

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
pnpm run build
```

### GitHub Actions Release

Workflow file: `.github/workflows/release.yml`

**Trigger**: Push a tag matching `v*` pattern (e.g. `v0.1.5`)

**Steps**:
1. Run tests (`pnpm test`)
2. Build the app (`pnpm run build`)
3. Verify build artifacts exist
4. Upload artifacts (retained for 30 days)
5. Create a Draft Release (manual Publish required)

**Usage**:
```powershell
# 1. Update version, commit and push to main
git add -A
git commit -m "chore: bump version to x.y.z"
git push origin main

# 2. Create and push tag
git tag vx.y.z
git push origin vx.y.z

# 3. GitHub Actions builds and creates Draft Release automatically
# 4. Go to GitHub Releases page, review and click Publish
```

**Requirements**: pnpm 11, Node.js 24 (LTS)

## Verification checklist (self-test after changes)

- [ ] App starts when `dsh web` is not running: spawns dsh, waits for 3080, loads the page
- [ ] 3080 already used by dsh (manual `dsh web`): app reuses it, no second start
- [ ] 3080 occupied by a non-dsh program: shows "3080 occupied" error + retry
- [ ] No usable cached dsh: shows the candidate list (click again to deselect) + manual input; path-format check; validation disables controls and times out (~5s); invalid path shows "未检测到此路径下有 dsh"; valid path starts dsh and is cached after a successful start
- [ ] Cached path file exists: dsh starts directly without `dsh -V`; a broken cached path (fake/exited) auto-falls back to the first valid PATH candidate, retries, and caches it only on success
- [ ] Closing the window: app-started dsh is killed directly; a reused dsh shows a "关闭 dsh / 保留 dsh" prompt first (保留 leaves it running)
- [ ] Second double-click: activates the existing window
- [ ] dsh crashes mid-run: error page + manual restart
- [ ] dsh logs land in `userData/logs/dsh.log`
- [ ] DevTools opens only via View → 打开开发者工具 button (no F11/F12 key); F11 toggles 内容全屏 only when the dsh view is mounted
- [ ] Custom top bar (32px) shows the **dsh logo** (black; white in dark mode) + **帮助** and **View** buttons (secondary/muted label color, `#6b7280` light / `rgb(129,133,140)` dark, switching to the **primary text color** on hover), **hidden on the startup page** and shown after the dsh view loads; clicking 帮助 pops a **custom HTML dropdown** below the button with 当前 dsh / 检查 dsh 更新 / 刷新 dsh 页面 / 社区插件 / awesome-dsh-plugin / DeepSeek Harness 官网 / 关于; clicking View pops its own dropdown (currently one item: 最大化); 当前 dsh shows the in-page overlay (dark backdrop + blur) with detected dsh path/version, start mode; 刷新 dsh 页面 reloads the dsh webContents; 官网 opens the site in the default browser; awesome-dsh-plugin opens `https://awesome-dsh-plugin.com/`; 关于 shows dsh-desktop version + repo address + clickable 应用日志 path; the menus close on **outside click / Escape / clicking the same button again (toggle) / opening the other menu / window blur** and the button highlight resets (no stale hover highlight); the menus and their labels follow the theme/language live
- [ ] View → 最大化: window enters OS fullscreen (covers the taskbar like browser F11), the top bar disappears and only the dsh page fills the screen; a "F11 退出最大化" hint appears over the dsh page and fades out; pressing F11 exits fullscreen, restoring the top bar and the previous window state; entering fullscreen force-closes the file tree panel; if the file tree panel was open it is closed; if dsh crashes while in fullscreen the app exits fullscreen and shows the crash page; Win+↓-style external fullscreen exit also restores the top bar
- [ ] dsh page renders unmodified in its own view below the top bar: its modals/scrollbars behave normally and nothing is covered
- [ ] Clicking an external link in the dsh page opens the system default browser, never the app window
- [ ] Switching light/dark/system in the harness UI updates the title bar theme live
- [ ] Switching language in the harness UI updates the app UI **live** (帮助↔Help, the dropdown menu, and the whole 「当前 dsh / 关于」 overlay follow `locale.preference`); with no `locale.preference` or a non-zh setting the app defaults to **English** (startup page, menu, overlay, close prompt, toast)
- [ ] A run (task) ends (success **or** failure) while the window is minimized → toast "任务有新回复"（主进程直连 dsh 官方事件流，按 host/session-status running 翻转检测、每任务只弹一次，不受最小化渲染节流影响）; clicking it restores the window; manual stop (turn/end aborted) and subagent runs do not notify; the toast is skipped when the window is not minimized at that moment

## Known risks / notes

- Relies on dsh's stdout format (`dsh web: http://...`) for matching; if the format changes, fall back to port polling
- A manual `dsh web` running alongside the app shares 3080; there is a small chance of concurrent writes to `~/.dsh/storages` (accepted for V1)
- Unsigned exe triggers SmartScreen (signing considered for V2)
- Without an API key dsh starts but cannot chat — hint at this in the error state
