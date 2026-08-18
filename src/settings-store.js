const fs = require("fs");
const paths = require("./paths");

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(paths.settingsFile(), "utf8")) || {};
  } catch (_) {
    return {};
  }
}

function writeSettings(obj) {
  fs.mkdirSync(paths.userData(), { recursive: true });
  fs.writeFileSync(paths.settingsFile(), JSON.stringify(obj, null, 2));
}

// 快速文件存在性检查（区别于 existsSync：目录不算有效路径）
function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch (_) {
    return false;
  }
}

module.exports = { readSettings, writeSettings, isFile };
