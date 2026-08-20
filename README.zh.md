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
  <a href="README.md">English</a> | 中文
</p>

DeepSeek Harness 桌面端，像用 Claude Code、Codex 一样轻松启动 dsh——双击即用，免敲命令。

> 本项目与 DeepSeek Harness 官方无任何关系，旨在补齐官方 Harness 桌面端的缺失，便于使用。

## 截图

<img width="1920" height="1018" alt="启动页" src="https://github.com/user-attachments/assets/afe6b36c-8139-425c-9a18-ba28d819aec0" />
<img width="1920" height="1018" alt="主界面" src="https://github.com/user-attachments/assets/b80a5eb7-92ec-486e-871b-a3bb716a8217" />

## 功能特性

- 🚀 **一键启动** — 双击即用，自动检测并记住 dsh 路径
- 🔄 **智能管理** — 自动扫描 PATH 候选、端口复用、优雅退出提示
- 🎨 **主题同步** — 实时跟随 dsh 亮色/暗色/跟随系统主题
- 🌐 **多语言** — 中英文，跟随 dsh 设置即时切换
- 📋 **帮助菜单** — 当前 dsh 信息、检查更新、刷新页面、快捷链接
- 🖥️ **视图控制** — 全屏、刷新页面...
- 🔔 **任务通知** — dsh 回答完成时，窗口最小化会收到通知
- 🔒 **安全保障** — 只加载验证过的 dsh 页面，外部链接在浏览器打开

## 环境要求

- **已安装 dsh**：终端执行 `dsh -V` 有输出版本号即满足

## 安装

> **注意**：当前仅支持 **Windows x64** 系统。

从 [GitHub Releases](https://github.com/zhenghaoyang24/dsh-desktop/releases) 下载：

| 包类型                   | 文件名                                | 说明                                      |
| ------------------------ | ------------------------------------- | ----------------------------------------- |
| **解压版**（推荐） | `dsh-desktop-0.1.5-windows-x64.zip` | 解压到任意文件夹，双击`dsh-desktop.exe` |
| **免安装版**       | `dsh-desktop-0.1.5-windows-x64.exe` | 单个文件直接双击（首次自解压约 15 秒）    |

## 使用方法

1. **首次启动**：应用会扫描 dsh 安装，提示你选择一个
2. **后续启动**：使用保存的 dsh 路径自动启动
3. **关闭窗口**：点击窗口关闭按钮——如果 dsh 是应用启动前就运行的，会询问是否一并关闭

### 快捷键

| 快捷键  | 功能           |
| ------- | -------------- |
| `F11` | 切换全屏模式   |
| `F12` | 切换开发者工具 |

## 从源码构建

```powershell
# 克隆仓库
git clone https://github.com/zhenghaoyang24/dsh-desktop.git
cd dsh-desktop

# 安装依赖
pnpm install

# 开发模式运行
npx electron .

# 运行测试
pnpm test

# 构建 Windows 版本
pnpm run build
```

### 国内镜像配置

如果 GitHub 下载超时，构建前设置以下镜像：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
pnpm run build
```

## 项目结构

```
dsh-desktop/
├── main.js                  # 应用入口：生命周期管理
├── preload.js               # IPC 上下文桥接
├── src/                     # 主进程模块
│   ├── constants.js         # 端口、URL、超时时间
│   ├── dsh.js               # dsh 进程管理
│   ├── startup.js           # 启动状态机
│   ├── view.js              # dsh WebContentsView
│   ├── window.js            # 窗口创建与管理
│   ├── ipc.js               # IPC 处理器
│   ├── theme.js             # 主题同步
│   ├── i18n.js              # 语言支持
│   └── injected/            # 注入到 dsh 页面的脚本
│       ├── chrome.js        # 自定义标题栏
│       ├── dropdown.js      # 帮助/视图菜单
│       ├── about.js         # 关于浮层
│       └── task-watcher.js  # 完成检测
├── renderer/                # 启动页 UI
│   ├── status.html          # 主 HTML
│   ├── status.js            # UI 逻辑
│   └── status-core.js       # i18n 字符串
├── test/                    # 自动化测试
└── buildResources/          # 图标和 Logo
```

## 常见问题

**Q: 端口 3080 被其他程序占用怎么办？**
A: 应用会显示错误提示。释放端口或关闭占用程序，然后点击「重试」。

**Q: PATH 中找不到 dsh？**
A: 全局安装 dsh（`npm install -g @deepseek-ai/dsh`）或在提示时手动输入路径。

**Q: 如何更改已设置的 dsh 路径？**
A: 删除 `%APPDATA%\github.zhenghaoyang24.dsh-desktop\` 下的 `settings.json` 后重启应用。

## 参与贡献

欢迎提交 Pull Request！

1. Fork 本仓库
2. 创建功能分支（`git checkout -b feature/amazing-feature`）
3. 提交更改（`git commit -m '添加某个功能'`）
4. 推送到分支（`git push origin feature/amazing-feature`）
5. 发起 Pull Request

## 开源协议

本项目基于 MIT 协议开源，详见 [LICENSE](LICENSE) 文件。

## 致谢

- [DeepSeek Harness](https://www.deepseek.com/harness/) —— 本应用封装的 AI 编程助手
- [Electron](https://www.electronjs.org/) —— 跨平台桌面应用框架
- [electron-builder](https://www.electron.build/) —— 打包与分发工具
