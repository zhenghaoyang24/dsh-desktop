const http = require("http");
const { execFile, spawn } = require("child_process");
const { APP_URL } = require("./constants");

// 探测 3080：alive=有响应；match=是 dsh（页面 title + __DSH_BOOT__ 标志）。
// 旧版 HTML 注入 window.__DSH_BOOT__，新版注入 globalThis["__DSH_BOOT__"]，只匹配标记名即可兼容两者
function probePort(timeout = 3000) {
  return new Promise((resolve) => {
    const req = http.get(APP_URL, { timeout }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => {
        body += c;
        if (body.length > 131072) req.destroy();
      });
      res.on("end", () => {
        resolve({
          alive: true,
          match:
            body.includes("__DSH_BOOT__") &&
            /<title>\s*DeepSeek Harness\s*<\/title>/i.test(body),
        });
      });
      res.on("error", () => resolve({ alive: true, match: false }));
    });
    req.on("error", () => resolve({ alive: false, match: false }));
    req.on("timeout", () => req.destroy());
  });
}

// 找到并杀掉 3080 上的监听进程（兜底：dsh 服务可能已脱离 cmd 进程树成为孤儿进程）
function killPortOwner() {
  return new Promise((resolve) => {
    execFile("netstat.exe", ["-ano"], { windowsHide: true }, (err, stdout) => {
      if (err) return resolve();
      const line = stdout
        .split(/\r?\n/)
        .find((l) => /(127\.0\.0\.1|0\.0\.0\.0|\[::\]):3080\b.*LISTENING/i.test(l));
      const m = line && line.match(/(\d+)\s*$/);
      if (!m) return resolve();
      const tk = spawn("taskkill.exe", ["/pid", m[1], "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
        detached: true,
      });
      tk.unref();
      tk.on("error", resolve);
      tk.on("exit", resolve);
    });
  });
}

module.exports = { probePort, killPortOwner };
