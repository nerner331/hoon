const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const fileContent = fs.readFileSync(filePath, "utf8");
  const lines = fileContent.split(/\r?\n/);
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;
    const separatorIndex = trimmedLine.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = trimmedLine.slice(0, separatorIndex).trim();
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;
    const normalizedValue = rawValue.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    process.env[key] = normalizedValue;
  }
}

function sendJson(res, statusCode, data, headers = {}) {
  res.writeHead(statusCode, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(data));
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (e) {
        const error = new Error("بيانات JSON غير صالحة.");
        error.statusCode = 400;
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedPassword) {
  const [salt, storedHash] = String(storedPassword || "").split(":");
  if (!salt || !storedHash) return false;
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(storedHash, "hex"));
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

function normalizeDigits(value) {
  return String(value || "")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

function containsBlockedPhoneNumber(value) {
  const normalizedValue = normalizeDigits(value);
  const matches = normalizedValue.match(/(?:\+?\d[\d\s().-]{6,}\d)/g) || [];

  return matches.some((match) => {
    const digitsOnly = match.replace(/\D/g, "");
    return digitsOnly.length >= 8 && digitsOnly.length <= 15;
  });
}

module.exports = {
  loadEnvFile,
  sendJson,
  readJsonBody,
  normalizeText,
  normalizeEmail,
  hashPassword,
  verifyPassword,
  generateToken,
  normalizeDigits,
  containsBlockedPhoneNumber
};
