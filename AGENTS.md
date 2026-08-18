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
  - `build/dsh-desktop-0.1.4-win.zip` → unzip, then double-click `dsh-desktop.exe`
  - `build/dsh-desktop.exe` (electron-builder `portable` target)
- App/product name: `dsh-desktop`; exe file name: `dsh-desktop.exe`; version `0.1.4`
- Icon: exe icon is `buildResources/icon.png` (black DeepSeek logo on a white rounded-corner background); the in-app top-left icons — window icon and startup-page top icon — keep `buildResources/logo.png` (transparent background; a copy lives in `renderer/` for the startup page)
- Not signed (SmartScreen considered for V2)

### Theme following (2026-08-14, updated 2026-08-17: custom top bar)
- The app follows the theme set in dsh's web UI (light/dark/system)
- Reads `ui-theme.preference` from `$DSH_HOME/settings.yaml` (default `~/.dsh/settings.yaml`)
- `system` resolves via the OS color scheme; the app sets `nativeTheme.themeSource` accordingly, updates the window `backgroundColor`, the custom top bar and Window Controls Overlay colors (`win.setTitleBarOverlay`), and pushes `chrome-theme` to the injected bar
- Taskbar icon uses the black logo (`buildResources/logo.png`) in light mode / white logo (`buildResources/logo-light.png`) in dark mode — swapped via `win.setIcon()`; the two logo files are packaged (`buildResources/logo*.png` in `files`)
- Live sync: `fs.watch` on `$DSH_HOME` filtered to `settings.yaml` events (dsh persists in-app theme changes there) → re-apply on change (~300ms debounce)
- The startup page receives the resolved theme as `?theme=dark|light` and uses DeepSeek's official dark palette (bg `rgb(21,21,23)`, layer `rgb(35,35,36)`, brand blue `rgb(86,134,254)`); the black logo is inverted in dark mode

### 多语言 i18n（2026-08-18：跟随 dsh web 语言切换）
- The app UI language follows dsh web: it reads `locale.preference` from `$DSH_HOME/settings.yaml` (`readLangPreference`). Only `zh`/`zh-*` maps to Chinese; a missing setting or any other language (including `en`) falls back to **English**
- Covers every app-owned string: the top-bar 帮助 button (`Help`/帮助), the three help-menu items, the entire 「当前 dsh / 关于」 overlay (title, labels, placeholders, mode/version text), all startup-page states (detecting / select / starting / port-conflict / failed / crashed + feedback hints), the reused-dsh close prompt dialog, and the completion toast
- Two delivery paths: the startup page gets its initial language via the `?lang=zh|en` `loadFile` query (same mechanism as `?theme=`); the injected top bar and about overlay subscribe to the `chrome-language` IPC event (pushed by `applyLanguage()` to both `win.webContents` and the dsh view) for **live** switching
- `startSettingsWatch` (renamed from `startThemeWatch`) syncs theme and language together from the same `settings.yaml` watcher (~300ms debounce); the about overlay re-renders in place, keeping already-fetched dsh info and only swapping copy
- Main-process strings use `t()` (`currentLang`); **all strings live in one source** — `renderer/status-core.js`'s `T` (id → {zh,en}); main-process `src/i18n.js` and the injected `chrome`/`about` scripts pull from it (embedding an id-subset JSON); preload exposes `onChromeLanguage`

### Tech stack (Q5)
- **Plain JavaScript** — no TypeScript, no framework, no Vite/build step
- Keep the shell thin: the main process only spawns dsh → resolves the port → loadURL → status display (plus theme sync)
- Packaged with electron-builder

### Window (Q10 / Q13, updated 2026-08-17: custom top bar; updated 2026-08-18: 帮助 dropdown menu)
- 1280×800, maximizable, min size 800×600
- **No menu bar**; **custom top bar** replaces the native title bar: `titleBarStyle: 'hidden'` + `titleBarOverlay` (Window Controls Overlay keeps native min/max/close on the right); no title-bar icon
- The top bar (32px, injected only into the startup page via `injectChrome`) shows the **dsh logo** on the left (the rendering page's `logo.png`, black transparent; inverted to white via CSS `filter` in dark mode — it replaced the earlier `dsh-desktop` brand text), then a single **帮助** button whose label uses the **secondary/muted text color** (`--dshc-muted`: `#6b7280` light / `rgb(129,133,140)` dark) and switches to the **primary text color** (inherited bar `color`) on hover; the button is **hidden on the startup page** (default `display:none`, shown by the `help-btn-state` IPC once the dsh view is mounted, hidden again when the view is removed)
- Clicking 帮助 pops a **native dropdown menu** (`Menu.popup` via the `open-help-menu` IPC), positioned **below the button, left-aligned** (the button's `getBoundingClientRect()` viewport rect is passed straight to `Menu.popup` — its `x`/`y` are relative to the window content area, so **no** `win.getContentBounds()`/screen-coordinate conversion is added), with three items:
  1. **当前 dsh** — in-page overlay (`injectAboutOverlay` into the dsh view, with the startup page as fallback before the view exists): dark `rgba(0,0,0,.55)` backdrop + `backdrop-filter: blur`, bottom-bordered header (当前 dsh + close), placeholder rows ("正在获取…") filled with the **detected** dsh path/version (in-use → cache → PATH candidates, first valid wins via `get-app-info`), port, start mode (app-started vs reused)
  2. **DeepSeek Harness 官网** — opens `https://www.deepseek.com/harness/` in the default browser
  3. **关于** — the same overlay in app mode: **dsh-desktop version**, **仓库地址** (`open-repo`), and the **应用日志** path as a clickable link (`open-log`, opens the logs folder/file)
- Hover residue fix: while the menu is open the button's hover highlight is suppressed via the `.dshc-menu-open` class (toggle pushed by the `help-menu-state` IPC; `true` before `popup`, `false` in the popup `callback`, which fires when the menu closes); because the native menu swallows mouse input, the renderer's `:hover` can stay stale after close, so the popup callback also pushes a **trusted `mouseMove` input event** (`sendInputEvent`) at the real cursor position (`screen.getCursorScreenPoint()` → content-relative via `getContentBounds()`, `setTimeout(…, 0)` after close) to force Chromium to re-hit-test and drop any leftover highlight
- Bar colors: light `#f9fafb` / dark `#1b1b1c`, with a bottom border; the Window Controls Overlay uses the same colors
- **The dsh page lives in its own `WebContentsView`** positioned below the top bar (`y: 32`, re-laid out on resize/maximize): the dsh page is **never modified** (no CSS/DOM injection for layout), so its own modals, popups and scrollbars behave exactly like a normal browser viewport; only the `TASK_WATCHER` script and the external-link handlers are attached to the view's webContents; on dsh crash the view is removed so the startup page's crash state shows
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
- No menu bar; register an **F12 shortcut** to toggle DevTools (off by default)

### Completion notification (2026-08-17)
- When the harness finishes answering and the window is **minimized**, the app shows a Windows toast ("回答已完成"); clicking it restores and focuses the window
- Detection: a `TASK_WATCHER` script is injected into the dsh page (only for `APP_URL` loads, re-injected on every `did-finish-load`) — a `MutationObserver` watches the composer card (`[data-composer-card="true"]`); "generating" = the primary button (`button[class$="_primary"]`) shows the stop icon (`svg rect`) or a 停止/Stop aria-label; completion = that state clears after an 800ms settle delay, then `window.electronAPI.notifyTaskComplete()` reports via IPC
- Manual stop (clicking the stop button) is tracked and does **not** notify
- Requires `app.setAppUserModelId('com.dsh.desktop')` (matches `appId`) — without it Windows toasts silently fail
- The selectors are bilingual (zh/en) and resilient to CSS-module hash changes (`[class$="_primary"]`, stable `data-composer-card` attribute)

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
│   ├── view.js              # dsh WebContentsView: loadApp / layoutDshView / removeDshView / injectTaskWatcher
│   ├── window.js            # createWindow (close prompt, F12, external links)
│   ├── ipc.js               # All ipcMain handlers (registered on require)
│   └── injected/
│       ├── task-watcher.js  # TASK_WATCHER (answer-complete detection script)
│       ├── chrome.js        # CHROME_CSS + chromeScript() (custom top bar)
│       ├── about.js         # ABOUT_OVERLAY_CSS + aboutOverlayScript() (当前 dsh / 关于 overlay)
│       └── index.js         # injectChrome / injectAboutOverlay / showAboutDialog / setHelpBtn / resolveHelpHover
├── renderer/
│   ├── status.html          # Startup page (single page, all states) + top-bar host
│   ├── status-core.js       # 启动页纯逻辑（looksLikePath）+ i18n 唯一来源 T（浏览器/主进程/注入共用单源）
│   ├── status.css
│   ├── status.js
│   └── logo.png             # Startup-page top logo (copy of buildResources')
├── test/                    # node:test 自动化测试（pnpm test 运行）
│   ├── external.test.js     # isExternalUrl
│   ├── status-core.test.js  # looksLikePath + i18n 字典完整性
│   ├── startup.test.js      # startFailureText
│   ├── dsh.test.js          # verifyDsh（mock child_process 超时/退出/error 分支）
│   └── port.test.js         # probePort（match / 非 dsh / error / timeout）
├── buildResources/
│   ├── logo.png             # Black DeepSeek logo, transparent bg (light-mode window icon)
│   ├── logo-light.png       # White DeepSeek logo (dark-mode window icon, inverted from logo.png)
│   └── icon.png             # Logo on white rounded-corner background (exe icon)
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
- [ ] F12 toggles DevTools
- [ ] Custom top bar (32px) shows the **dsh logo** (black; white in dark mode) + a single 帮助 button (secondary/muted label color, `#6b7280` light / `rgb(129,133,140)` dark, switching to the **primary text color** on hover), **hidden on the startup page** and shown after the dsh view loads; clicking it pops a native menu **below the button, left-aligned** with 当前 dsh / DeepSeek Harness 官网 / 关于; 当前 dsh shows the in-page overlay (dark backdrop + blur) with detected dsh path/version, start mode; 官网 opens the site in the default browser; 关于 shows dsh-desktop version + repo address + clickable 应用日志 path; after the menu closes the 帮助 button shows **no leftover hover highlight**
- [ ] dsh page renders unmodified in its own view below the top bar: its modals/scrollbars behave normally and nothing is covered
- [ ] Clicking an external link in the dsh page opens the system default browser, never the app window
- [ ] Switching light/dark/system in the harness UI updates the title bar theme live
- [ ] Switching language in the harness UI updates the app UI **live** (帮助↔Help, the dropdown menu, and the whole 「当前 dsh / 关于」 overlay follow `locale.preference`); with no `locale.preference` or a non-zh setting the app defaults to **English** (startup page, menu, overlay, close prompt, toast)
- [ ] Answer finished while the window is minimized → toast "回答已完成"; clicking it restores the window; manual stop does not notify

## Known risks / notes

- Relies on dsh's stdout format (`dsh web: http://...`) for matching; if the format changes, fall back to port polling
- A manual `dsh web` running alongside the app shares 3080; there is a small chance of concurrent writes to `~/.dsh/storages` (accepted for V1)
- Unsigned exe triggers SmartScreen (signing considered for V2)
- Without an API key dsh starts but cannot chat — hint at this in the error state
