const http = require("node:http");
const path = require("node:path");
const { loadEnvFile, sendJson } = require("./lib/utils");

// Load environment variables before anything else
loadEnvFile(path.join(__dirname, ".env"));

const { PORT } = require("./lib/config");
const { initSchema } = require("./lib/database");
const { handleApiRoutes, runExpiredListingCleanup } = require("./lib/routes");
const { serveStatic } = require("./lib/static");

// Initialize Database Schema
initSchema();
runExpiredListingCleanup(true);

// Rate limiting map: IP -> { count, resetTime }
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 دقيقة
const RATE_LIMIT_MAX_REQUESTS = 100; // عدد الطلبات المسموح

// Middleware: Rate Limiting
function checkRateLimit(req, res) {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  const record = rateLimitMap.get(ip);
  
  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + RATE_LIMIT_WINDOW;
    return true;
  }
  
  record.count++;
  
  if (record.count > RATE_LIMIT_MAX_REQUESTS) {
    sendJson(res, 429, { error: "طلبات كثيرة جداً. يرجى المحاولة لاحقاً." });
    return false;
  }
  
  return true;
}

// Middleware: CORS Headers
function addCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "3600");
}

const server = http.createServer(async (req, res) => {
  // Check rate limit
  if (!checkRateLimit(req, res)) {
    return;
  }
  
  // Add CORS headers
  addCorsHeaders(req, res);
  
  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end();
    return;
  }
  
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname } = requestUrl;

  try {
    if (pathname.startsWith("/api/")) {
      await handleApiRoutes(req, res, pathname);
      return;
    }

    serveStatic(req, res, pathname);
  } catch (error) {
    console.error(`[ERROR] ${new Date().toISOString()}:`, error);
    
    const statusCode = error && Number.isInteger(error.statusCode) ? error.statusCode : 500;
    const message = statusCode >= 500
      ? "حدث خطأ داخلي في الخادم."
      : error.message || "حدث خطأ غير معروف.";
    
    sendJson(res, statusCode, { error: message });
  }
});

server.listen(PORT, () => {
  console.log(`Hoon Store is running on http://localhost:${PORT}`);
});

// Cleanup expired listings every hour
setInterval(() => {
  runExpiredListingCleanup(true);
}, 60 * 60 * 1000);

// Cleanup rate limit map every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now > record.resetTime + 300000) { // 5 دقائق إضافية
      rateLimitMap.delete(ip);
    }
  }
}, 300000);
