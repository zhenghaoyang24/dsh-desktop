# dsh-desktop

<p align="center">
  <img src="buildResources/icon.png" alt="dsh-desktop logo" width="160" />
</p>

<p align="center">
  <a href="https://github.com/zhenghaoyang24/dsh-desktop/releases"><img src="https://img.shields.io/github/v/release/zhenghaoyang24/dsh-desktop" alt="GitHub Release"></a>
  <a href="https://github.com/zhenghaoyang24/dsh-desktop/blob/main/LICENSE"><img src="https://img.shields.io/github/license/zhenghaoyang24/dsh-desktop" alt="License"></a>
  <a href="https://github.com/zhenghaoyang24/dsh-desktop"><img src="https://img.shields.io/badge/platform-Windows%2010%2F11-blue" alt="Platform"></a>
</p>

<p align="center">
  English | <a href="README.zh.md">中文</a>
</p>

A desktop client for [DeepSeek Harness](https://www.deepseek.com/harness/) — start dsh as easily as using Claude Code or Codex. Double-click and go, no commands needed.

> This project is not affiliated with or endorsed by DeepSeek Harness. It is an independent effort to fill the gap of an official Harness desktop client and make it easier to use.

## Screenshots

<img width="1920" height="1018" alt="Startup" src="https://github.com/user-attachments/assets/afe6b36c-8139-425c-9a18-ba28d819aec0" />
<img width="1920" height="1018" alt="Main UI" src="https://github.com/user-attachments/assets/b80a5eb7-92ec-486e-871b-a3bb716a8217" />

## Features

- 🚀 **One-Click Launch** — Double-click to run, automatically detects and remembers dsh path
- 🔄 **Smart Management** — Auto-scans PATH candidates, port reuse, graceful exit prompts
- 🎨 **Theme Sync** — Real-time follow of dsh light/dark/system theme
- 🌐 **Multilingual** — English & Chinese, instantly switches with dsh settings
- 📋 **Help Menu** — Current dsh info, check for updates, refresh page, quick links
- 🖥️ **View Controls** — Fullscreen, refresh page...
- 🔔 **Task Notifications** — Get notified when dsh completes answering, even when window is minimized
- 🔒 **Security Assurance** — Loads only verified dsh pages, external links open in browser

## Requirements

- **dsh installed**: Run `dsh -V` in a terminal; it should print a version number

## Installation

> **Note**: Currently only supports **Windows x64**.

Download from [GitHub Releases](https://github.com/zhenghaoyang24/dsh-desktop/releases):

| Package | File | Description |
|---------|------|-------------|
| **Portable folder** (recommended) | `dsh-desktop-0.1.5-windows-x64.zip` | Unzip to any folder, then double-click `dsh-desktop.exe` |
| **Single-file portable** | `dsh-desktop-0.1.5-windows-x64.exe` | Double-click directly (self-extracts ~15s on each launch) |

## Usage

1. **First Launch**: The app will scan for dsh installations and prompt you to select one
2. **Subsequent Launches**: Starts automatically using your saved dsh path
3. **Close**: Click the window close button — if dsh was running before the app, you'll be asked whether to close it

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `F11` | Toggle fullscreen mode |
| `F12` | Toggle DevTools |

## Building from Source

```powershell
# Clone the repository
git clone https://github.com/zhenghaoyang24/dsh-desktop.git
cd dsh-desktop

# Install dependencies
pnpm install

# Run in development mode
npx electron .

# Run tests
pnpm test

# Build for Windows
pnpm run build
```

### Build Mirrors (for China network)

If GitHub downloads time out, set these mirrors before building:

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
pnpm run build
```

## Project Structure

```
dsh-desktop/
├── main.js                  # App entry: lifecycle management
├── preload.js               # Context bridge for IPC
├── src/                     # Main process modules
│   ├── constants.js         # Port, URLs, timeouts
│   ├── dsh.js               # dsh process management
│   ├── startup.js           # Boot state machine
│   ├── view.js              # dsh WebContentsView
│   ├── window.js            # Window creation and management
│   ├── ipc.js               # IPC handlers
│   ├── theme.js             # Theme synchronization
│   ├── i18n.js              # Language support
│   ├── task-events.js       # Completion notification (dsh official event streams)
│   └── injected/            # Scripts injected into dsh page
│       ├── chrome.js        # Custom title bar
│       ├── dropdown.js      # Help/View menus
│       └── about.js         # About overlay
├── renderer/                # Startup page UI
│   ├── status.html          # Main HTML
│   ├── status.js            # UI logic
│   └── status-core.js       # i18n strings
├── test/                    # Automated tests
└── buildResources/          # Icons and logos
```

## FAQ

**Q: Port 3080 is occupied by another program?**
A: The app will show an error. Free the port or close the other program, then click Retry.

**Q: dsh not found in PATH?**
A: Install dsh globally (`npm install -g @deepseek-ai/dsh`) or manually enter the path when prompted.

**Q: How to change dsh path after initial setup?**
A: Delete `settings.json` in `%APPDATA%\github.zhenghaoyang24.dsh-desktop\` and restart the application.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [DeepSeek Harness](https://www.deepseek.com/harness/) — The AI coding assistant this app wraps
- [Electron](https://www.electronjs.org/) — Cross-platform desktop framework
- [electron-builder](https://www.electron.build/) — Packaging and distribution
