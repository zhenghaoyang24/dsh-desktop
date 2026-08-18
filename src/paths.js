const { app } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");

// 项目根目录：本文件位于 src/ 下，因此根目录是上一级
const root = path.join(__dirname, "..");

const userData = () => app.getPath("userData");
const settingsFile = () => path.join(userData(), "settings.json");
const logFile = () => path.join(userData(), "logs", "dsh.log");
// dsh 的配置目录（$DSH_HOME 或 ~/.dsh），theme / locale 偏好都读这里的 settings.yaml
const dshHome = () => process.env.DSH_HOME || path.join(os.homedir(), ".dsh");

function log(line) {
  try {
    fs.mkdirSync(path.dirname(logFile()), { recursive: true });
    fs.appendFileSync(logFile(), line + "\n");
  } catch (_) {}
}

const preloadPath = path.join(root, "preload.js");
const statusHtml = path.join(root, "renderer", "status.html");
const buildResource = (name) => path.join(root, "buildResources", name);

module.exports = { root, userData, settingsFile, logFile, dshHome, log, preloadPath, statusHtml, buildResource };
