const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_SECURITY_HEADERS, UPLOADS_DIR, ROOT_DIR, ADMIN_PANEL_PATH } = require("./config");

function buildResponseHeaders(headers = {}) {
  return { ...DEFAULT_SECURITY_HEADERS, ...headers };
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  }[ext] || "application/octet-stream";
}

function sendFile(res, absolutePath, contentType, extraHeaders = {}) {
  fs.readFile(absolutePath, (error, data) => {
    if (error) {
      res.writeHead(500, buildResponseHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
      res.end("تعذر تحميل الملف.");
      return;
    }
    res.writeHead(200, buildResponseHeaders({ "Content-Type": contentType, ...extraHeaders }));
    res.end(data);
  });
}

function serveStatic(req, res, pathname) {
  if ((ADMIN_PANEL_PATH && (pathname === ADMIN_PANEL_PATH || pathname === `${ADMIN_PANEL_PATH}/`))
    || (!ADMIN_PANEL_PATH && pathname === "/admin.html")) {
    sendFile(res, path.join(ROOT_DIR, "admin.html"), getContentType("admin.html"), {
      "Cache-Control": "no-store",
    });
    return;
  }

  const safePath = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
  const absolutePath = path.join(ROOT_DIR, safePath);

  if (pathname.startsWith("/uploads/")) {
    serveUploadedFile(res, pathname);
    return;
  }

  if (!fs.existsSync(absolutePath) || fs.statSync(absolutePath).isDirectory()) {
    res.writeHead(404, buildResponseHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
    res.end("الصفحة غير موجودة.");
    return;
  }

  sendFile(res, absolutePath, getContentType(absolutePath));
}

function serveUploadedFile(res, pathname) {
  const fileName = path.basename(pathname);
  const absolutePath = path.join(UPLOADS_DIR, fileName);

  if (!fs.existsSync(absolutePath)) {
    res.writeHead(404, buildResponseHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
    res.end("الصورة غير موجودة.");
    return;
  }

  sendFile(res, absolutePath, getContentType(absolutePath), {
    "Cache-Control": "public, max-age=86400, immutable",
  });
}

module.exports = {
  serveStatic,
  serveUploadedFile
};
