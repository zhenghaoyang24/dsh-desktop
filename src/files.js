const fs = require("fs");
const path = require("path");

const IGNORE_DIRS = new Set(["node_modules", ".git", ".svn", ".hg", ".DS_Store", "dist", "build", ".vscode", ".idea"]);
const MAX_DEPTH = 6;

function readDirectory(dirPath, depth = 0) {
  if (depth > MAX_DEPTH) return [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const items = [];
    for (const entry of entries) {
      const name = entry.name;
      if (name.startsWith(".")) continue;
      if (entry.isDirectory() && IGNORE_DIRS.has(name)) continue;
      const fullPath = path.join(dirPath, name);
      const isDir = entry.isDirectory();
      items.push({
        name,
        path: fullPath,
        type: isDir ? "directory" : "file",
        children: isDir ? readDirectory(fullPath, depth + 1) : undefined,
      });
    }
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    });
    return items;
  } catch {
    return [];
  }
}

function readFileContent(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return { error: "Not a file" };
    if (stat.size > 1048576) return { error: "File too large (>1MB)" };
    const ext = path.extname(filePath).toLowerCase();
    const binaryExts = new Set([".exe", ".dll", ".bin", ".obj", ".ico", ".png", ".jpg", ".gif", ".svg", ".woff", ".eot", ".ttf"]);
    if (binaryExts.has(ext)) return { error: "Binary file" };
    const content = fs.readFileSync(filePath, "utf-8");
    return { content };
  } catch (err) {
    return { error: err.message };
  }
}

function writeFileContent(filePath, content) {
  try {
    fs.writeFileSync(filePath, content, "utf-8");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function getWorkspaceRoot() {
  return process.cwd();
}

module.exports = { readDirectory, readFileContent, writeFileContent, getWorkspaceRoot };