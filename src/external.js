const { PORT } = require("./constants");

// 外部链接（非本应用 3080 页面）一律交给系统默认浏览器打开
function isExternalUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol === "mailto:" || u.protocol === "tel:") return true;
    if (u.protocol === "http:" || u.protocol === "https:") {
      return !(u.hostname === "127.0.0.1" && u.port === String(PORT));
    }
  } catch (_) {}
  return false;
}

module.exports = { isExternalUrl };
