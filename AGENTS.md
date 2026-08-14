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

### dsh provisioning (Q1)
- Depends **only on the system-global dsh**; no bundled dsh
- Detection order:
  1. Check the path saved in `userData/settings.json` → verify it with `dsh -V`
  2. Saved path invalid/missing → probe `dsh -V` on PATH
  3. Both fail → the startup page shows "dsh not detected" with:
     - A path input (persisted + "Browse…" file picker + instant validation — all three)
     - A "Go to website" button → `https://www.deepseek.com/harness/` (via `shell.openExternal`)
  4. A validated input/selected path is written back to `settings.json` for next launch

### Process lifecycle (Q3)
- Closing the window = quitting the app, and **kills the dsh the app started itself**
- If a dsh is already on 3080 (reuse case, not started by the app), do NOT kill it on close
- V1 has no system tray

### Single instance (Q9)
- Single-instance lock at the exe level: a second double-click activates the existing window instead of opening another

### Packaging (Q4 / Q11, updated 2026-08-14: both)
- Two artifacts; the **zip directory build** is the primary (unzip and run, instant start); the single-file portable is secondary (no extraction needed for distribution, but self-extracts ~15s on every launch)
  - `build/dsh-desktop-0.1.0-win.zip` → unzip, then double-click `dsh-desktop.exe`
  - `build/dsh-desktop.exe` (electron-builder `portable` target)
- App/product name: `dsh-desktop`; exe file name: `dsh-desktop.exe`; version `0.1.0`
- Icon: `buildResources/logo.png` (black DeepSeek logo), used as the exe icon, window icon, and startup-page top icon (a copy lives in `renderer/` for the startup page)
- Not signed (SmartScreen considered for V2)

### Theme following (2026-08-14)
- The app follows the theme set in dsh's web UI (light/dark/system)
- Reads `ui-theme.preference` from `$DSH_HOME/settings.yaml` (default `~/.dsh/settings.yaml`)
- `system` resolves via the OS color scheme; the app sets `nativeTheme.themeSource` accordingly so the native title bar (status bar) follows the theme, and also updates the window `backgroundColor`
- Live sync: `fs.watch` on `$DSH_HOME` filtered to `settings.yaml` events (dsh persists in-app theme changes there) → re-apply on change (~300ms debounce)
- The startup page receives the resolved theme as `?theme=dark|light` and uses DeepSeek's official dark palette (bg `rgb(21,21,23)`, layer `rgb(35,35,36)`, brand blue `rgb(86,134,254)`); the black logo is inverted in dark mode

### Tech stack (Q5)
- **Plain JavaScript** — no TypeScript, no framework, no Vite/build step
- Keep the shell thin: the main process only spawns dsh → resolves the port → loadURL → status display (plus theme sync)
- Packaged with electron-builder

### Window (Q10 / Q13)
- 1280×800, maximizable, min size 800×600
- **No menu bar**; top-left title `DeepSeek Harness`, native max/min/close buttons on the right
- **Native title bar** (no custom frameless)
- Title is locked (`page-title-updated` prevented): the title bar always shows `DeepSeek Harness` + icon, never the page's conversation title

### Startup page state machine (Q7, all states)
```
[App start]
  ├─ Single-instance lock → instance exists? → activate existing, exit
  ├─ Detect dsh path (see "dsh provisioning")
  ├─ Probe 3080 (see "Port policy")
  ├─ Show the corresponding state on the startup page
  └─ Window close → kill self-started dsh → exit
```
States the startup page must cover: detecting → dsh not detected (input) → starting web → port ready → switch to main UI. Additional: dsh crash/timeout after start → show **dsh's raw stderr** + retry button.

### Crash recovery (Q14)
- dsh crashes mid-run: show an error page + manual "Restart" button. No auto-restart

### Logging (Q15)
- dsh's stdout/stderr is **written to disk** at `userData/logs/dsh.log`; error states also display it

### DevTools (Q16)
- No menu bar; register an **F12 shortcut** to toggle DevTools (off by default)

## Directory layout

```
dsh-desktop\
├── package.json
├── main.js                  # Electron main process: window, spawn/kill dsh, 3080 probe, IPC, theme sync
├── preload.js               # contextBridge exposing window.electronAPI
├── renderer/
│   ├── status.html          # Startup page (single page, all states)
│   ├── status.css
│   ├── status.js
│   └── logo.png             # Startup-page top logo (copy of buildResources')
├── buildResources/
│   └── logo.png             # Black DeepSeek logo (exe/window/startup-page icon)
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

## Verification checklist (self-test after changes)

- [ ] App starts when `dsh web` is not running: spawns dsh, waits for 3080, loads the page
- [ ] 3080 already used by dsh (manual `dsh web`): app reuses it, no second start
- [ ] 3080 occupied by a non-dsh program: shows "3080 occupied" error + retry
- [ ] dsh not installed: shows the input, instant path validation, persistence, "Go to website" opens the browser
- [ ] Closing the window: self-started dsh is killed; reused dsh is kept
- [ ] Second double-click: activates the existing window
- [ ] dsh crashes mid-run: error page + manual restart
- [ ] dsh logs land in `userData/logs/dsh.log`
- [ ] F12 toggles DevTools
- [ ] Title bar always shows `DeepSeek Harness` (conversation titles never appear)
- [ ] Switching light/dark/system in the harness UI updates the title bar theme live

## Known risks / notes

- Relies on dsh's stdout format (`dsh web: http://...`) for matching; if the format changes, fall back to port polling
- A manual `dsh web` running alongside the app shares 3080; there is a small chance of concurrent writes to `~/.dsh/storages` (accepted for V1)
- Unsigned exe triggers SmartScreen (signing considered for V2)
- Without an API key dsh starts but cannot chat — hint at this in the error state
