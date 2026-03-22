const path = require("node:path");
const fs = require("node:fs");

const ROOT_DIR = path.resolve(__dirname, "..");
const resolveAppPath = (value, fallbackPath) => {
  const rawValue = String(value || "").trim();
  if (!rawValue) return fallbackPath;
  return path.isAbsolute(rawValue) ? rawValue : path.join(ROOT_DIR, rawValue);
};

const DATA_DIR = resolveAppPath(process.env.DATA_DIR, path.join(ROOT_DIR, "data"));
const DB_PATH = resolveAppPath(process.env.DB_PATH, path.join(DATA_DIR, "souq-syria.db"));
const UPLOADS_DIR = resolveAppPath(process.env.UPLOADS_DIR, path.join(ROOT_DIR, "uploads"));

const PORT = Number(process.env.PORT || 3000);
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_LISTING_IMAGES = 5;
const MAX_LISTING_DESCRIPTION_LENGTH = 1000;
const MIN_IMAGE_WIDTH = 320;
const MIN_IMAGE_HEIGHT = 320;
const DEFAULT_MAX_BODY_BYTES = MAX_IMAGE_SIZE_BYTES + 1024 * 512;
const MAX_MULTIPART_BODY_BYTES = MAX_IMAGE_SIZE_BYTES * (MAX_LISTING_IMAGES + 2) + 1024 * 512;

const NODE_ENV = String(process.env.NODE_ENV || "development").trim().toLowerCase();
const IS_PRODUCTION = NODE_ENV === "production";

const DEFAULT_ADMIN_USERNAME = "souq-admin";
const DEFAULT_ADMIN_EMAIL = "admin@souqsyria.local";
const DEFAULT_ADMIN_PASSWORD = "Admin123!";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || DEFAULT_ADMIN_USERNAME;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;

const ADMIN_PANEL_HEADER = "x-admin-panel-path";

function normalizeAdminPanelPath(value) {
  const rawPath = String(value || "").trim();
  if (!rawPath) return "";
  const normalizedPath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  return normalizedPath.replace(/\/+$/, "") || "/";
}

function getConfiguredAdminPanelPath(value) {
  const normalizedPath = normalizeAdminPanelPath(value);
  return normalizedPath && normalizedPath !== "/" ? normalizedPath : null;
}

const ADMIN_PANEL_PATH = getConfiguredAdminPanelPath(process.env.ADMIN_PANEL_PATH);

const DELIVERY_RATE_RULES = [
  { city: "دمشق", category: "موبايلات", percentage: 5 },
  { city: "دمشق", category: "إلكترونيات", percentage: 6 },
  { city: "دمشق", category: "أثاث", percentage: 8 },
  { city: "دمشق", category: "أجهزة منزلية", percentage: 7 },
  { city: "دمشق", category: "دراجات", percentage: 6 },
  { city: "حلب", category: "موبايلات", percentage: 5 },
  { city: "حلب", category: "إلكترونيات", percentage: 6 },
  { city: "حلب", category: "أثاث", percentage: 9 },
  { city: "حلب", category: "أجهزة منزلية", percentage: 8 },
  { city: "حلب", category: "دراجات", percentage: 6 },
  { city: "حمص", category: "موبايلات", percentage: 6 },
  { city: "حمص", category: "إلكترونيات", percentage: 6 },
  { city: "حمص", category: "أثاث", percentage: 8 },
  { city: "حمص", category: "أجهزة منزلية", percentage: 7 },
  { city: "حمص", category: "دراجات", percentage: 6 },
  { city: "اللاذقية", category: "موبايلات", percentage: 6 },
  { city: "اللاذقية", category: "إلكترونيات", percentage: 7 },
  { city: "اللاذقية", category: "أثاث", percentage: 9 },
  { city: "اللاذقية", category: "أجهزة منزلية", percentage: 8 },
  { city: "اللاذقية", category: "دراجات", percentage: 7 },
  { city: "محافظات أخرى", category: "موبايلات", percentage: 6 },
  { city: "محافظات أخرى", category: "إلكترونيات", percentage: 7 },
  { city: "محافظات أخرى", category: "أثاث", percentage: 9 },
  { city: "محافظات أخرى", category: "أجهزة منزلية", percentage: 8 },
  { city: "محافظات أخرى", category: "دراجات", percentage: 7 },
];

const DEFAULT_SECURITY_HEADERS = Object.freeze({
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
});

module.exports = {
  ROOT_DIR,
  DATA_DIR,
  DB_PATH,
  UPLOADS_DIR,
  PORT,
  MAX_IMAGE_SIZE_BYTES,
  MAX_LISTING_IMAGES,
  MAX_LISTING_DESCRIPTION_LENGTH,
  MIN_IMAGE_WIDTH,
  MIN_IMAGE_HEIGHT,
  DEFAULT_MAX_BODY_BYTES,
  MAX_MULTIPART_BODY_BYTES,
  IS_PRODUCTION,
  ADMIN_USERNAME,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ADMIN_PANEL_HEADER,
  ADMIN_PANEL_PATH,
  DELIVERY_RATE_RULES,
  DEFAULT_SECURITY_HEADERS,
  normalizeAdminPanelPath,
  DEFAULT_ADMIN_USERNAME,
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_ADMIN_PASSWORD
};
