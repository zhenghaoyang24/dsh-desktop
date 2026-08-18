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
  - `build/dsh-desktop-0.1.3-win.zip` → unzip, then double-click `dsh-desktop.exe`
  - `build/dsh-desktop.exe` (electron-builder `portable` target)
- App/product name: `dsh-desktop`; exe file name: `dsh-desktop.exe`; version `0.1.3`
- Icon: exe icon is `buildResources/icon.png` (black DeepSeek logo on a white rounded-corner background); the in-app top-left icons — window icon and startup-page top icon — keep `buildResources/logo.png` (transparent background; a copy lives in `renderer/` for the startup page)
- Not signed (SmartScreen considered for V2)

### Theme following (2026-08-14, updated 2026-08-17: custom top bar)
- The app follows the theme set in dsh's web UI (light/dark/system)
- Reads `ui-theme.preference` from `$DSH_HOME/settings.yaml` (default `~/.dsh/settings.yaml`)
- `system` resolves via the OS color scheme; the app sets `nativeTheme.themeSource` accordingly, updates the window `backgroundColor`, the custom top bar and Window Controls Overlay colors (`win.setTitleBarOverlay`), and pushes `chrome-theme` to the injected bar
- Taskbar icon uses the black logo (`buildResources/logo.png`) in light mode / white logo (`buildResources/logo-light.png`) in dark mode — swapped via `win.setIcon()`; the two logo files are packaged (`buildResources/logo*.png` in `files`)
- Live sync: `fs.watch` on `$DSH_HOME` filtered to `settings.yaml` events (dsh persists in-app theme changes there) → re-apply on change (~300ms debounce)
- The startup page receives the resolved theme as `?theme=dark|light` and uses DeepSeek's official dark palette (bg `rgb(21,21,23)`, layer `rgb(35,35,36)`, brand blue `rgb(86,134,254)`); the black logo is inverted in dark mode

### Tech stack (Q5)
- **Plain JavaScript** — no TypeScript, no framework, no Vite/build step
- Keep the shell thin: the main process only spawns dsh → resolves the port → loadURL → status display (plus theme sync)
- Packaged with electron-builder

### Window (Q10 / Q13, updated 2026-08-17: custom top bar)
- 1280×800, maximizable, min size 800×600
- **No menu bar**; **custom top bar** replaces the native title bar: `titleBarStyle: 'hidden'` + `titleBarOverlay` (Window Controls Overlay keeps native min/max/close on the right); no title-bar icon
- The top bar (32px, injected only into the startup page via `injectChrome`) shows the **dsh-desktop** brand text on the left (no logo image — dsh web already shows its own logo), then **关于 / 官网** buttons; 关于 shows an **in-page overlay** (dark `rgba(0,0,0,.55)` backdrop + `backdrop-filter: blur`, injected via `injectAboutOverlay` into the dsh view, with the startup page as fallback before the view exists) — a bottom-bordered header (关于 + close), placeholder rows ("正在获取…") filled with the **detected** dsh path/version (in-use → cache → PATH candidates, first valid wins via `get-app-info`), port, start mode (app-started vs reused), and the **应用日志** path as a clickable link (`open-log`, opens the logs folder/file); footer links **dsh-desktop** to the repo (`open-repo`) plus `v<version>`; 官网 opens `https://www.deepseek.com/harness/` in the default browser
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
├── main.js                  # Electron main process: window, spawn/kill dsh, 3080 probe, IPC, theme sync
├── preload.js               # contextBridge exposing window.electronAPI
├── renderer/
│   ├── status.html          # Startup page (single page, all states) + top-bar host
│   ├── status.css
│   ├── status.js
│   └── logo.png             # Startup-page top logo (copy of buildResources')
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

# Build (output to build/: zip directory build + single-file portable)
npm run build    # equivalent to electron-builder --win zip portable
```

### Build mirror (important in CN network)

electron-builder downloads Electron/binaries from GitHub, which often times out in China.
Set the npmmirror mirrors before building (only needed once per shell session):

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
npm run build
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
- [ ] Custom top bar (32px) shows `dsh-desktop` text + 关于/官网 buttons; 关于 shows an in-page overlay (dark backdrop + blur) with detected dsh path/version, start mode, clickable 应用日志 path, repo link + version; 官网 opens the site in the default browser
- [ ] dsh page renders unmodified in its own view below the top bar: its modals/scrollbars behave normally and nothing is covered
- [ ] Clicking an external link in the dsh page opens the system default browser, never the app window
- [ ] Switching light/dark/system in the harness UI updates the title bar theme live
- [ ] Answer finished while the window is minimized → toast "回答已完成"; clicking it restores the window; manual stop does not notify

## Known risks / notes

- Relies on dsh's stdout format (`dsh web: http://...`) for matching; if the format changes, fall back to port polling
- A manual `dsh web` running alongside the app shares 3080; there is a small chance of concurrent writes to `~/.dsh/storages` (accepted for V1)
- Unsigned exe triggers SmartScreen (signing considered for V2)
- Without an API key dsh starts but cannot chat — hint at this in the error state
