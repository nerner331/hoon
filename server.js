const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

loadEnvFile(path.join(__dirname, ".env"));

const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = resolveAppPath(process.env.DATA_DIR, path.join(ROOT_DIR, "data"));
const DB_PATH = resolveAppPath(process.env.DB_PATH, path.join(DATA_DIR, "souq-syria.db"));
const UPLOADS_DIR = resolveAppPath(process.env.UPLOADS_DIR, path.join(ROOT_DIR, "uploads"));
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const MIN_IMAGE_WIDTH = 320;
const MIN_IMAGE_HEIGHT = 320;
const DEFAULT_MAX_BODY_BYTES = MAX_IMAGE_SIZE_BYTES + 1024 * 512;
const MAX_MULTIPART_BODY_BYTES = MAX_IMAGE_SIZE_BYTES * 3 + 1024 * 512;
const NODE_ENV = normalizeNodeEnv(process.env.NODE_ENV);
const IS_PRODUCTION = NODE_ENV === "production";
const DEFAULT_ADMIN_USERNAME = "souq-admin";
const DEFAULT_ADMIN_EMAIL = "admin@souqsyria.local";
const DEFAULT_ADMIN_PASSWORD = "Admin123!";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || DEFAULT_ADMIN_USERNAME;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
const ADMIN_PANEL_HEADER = "x-admin-panel-path";
const ADMIN_PANEL_PATH = getConfiguredAdminPanelPath(process.env.ADMIN_PANEL_PATH);
const IS_DEFAULT_ADMIN_USERNAME = ADMIN_USERNAME === DEFAULT_ADMIN_USERNAME;
const IS_DEFAULT_ADMIN_EMAIL = ADMIN_EMAIL === DEFAULT_ADMIN_EMAIL;
const IS_DEFAULT_ADMIN_PASSWORD = ADMIN_PASSWORD === DEFAULT_ADMIN_PASSWORD;
const IS_DEFAULT_ADMIN_CREDENTIALS =
  IS_DEFAULT_ADMIN_USERNAME ||
  IS_DEFAULT_ADMIN_EMAIL ||
  IS_DEFAULT_ADMIN_PASSWORD;
const DEFAULT_SECURITY_HEADERS = Object.freeze({
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
});
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

validateRuntimeConfig();

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL,
    city TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    is_banned INTEGER NOT NULL DEFAULT 0,
    banned_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    member_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES members (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    price INTEGER NOT NULL,
    city TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    approval_status TEXT NOT NULL DEFAULT 'pending',
    approved_at TEXT,
    is_featured INTEGER NOT NULL DEFAULT 0,
    admin_highlight INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES members (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS favorites (
    member_id INTEGER NOT NULL,
    listing_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (member_id, listing_id),
    FOREIGN KEY (member_id) REFERENCES members (id) ON DELETE CASCADE,
    FOREIGN KEY (listing_id) REFERENCES listings (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS couriers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT NOT NULL UNIQUE,
    city TEXT NOT NULL,
    vehicle_type TEXT NOT NULL,
    coverage_cities TEXT NOT NULL DEFAULT '',
    national_id_number TEXT NOT NULL,
    identity_image_path TEXT NOT NULL,
    live_photo_path TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS courier_sessions (
    token TEXT PRIMARY KEY,
    courier_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (courier_id) REFERENCES couriers (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role_label TEXT NOT NULL DEFAULT 'مدير',
    can_manage_admins INTEGER NOT NULL DEFAULT 0,
    can_manage_couriers INTEGER NOT NULL DEFAULT 1,
    can_view_courier_documents INTEGER NOT NULL DEFAULT 1,
    can_manage_listings INTEGER NOT NULL DEFAULT 0,
    can_ban_members INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
    token TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    admin_id INTEGER,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES admins (id) ON DELETE CASCADE
  );
`);

ensureListingImageColumn();
ensureListingHighlightColumn();
ensureListingApprovalColumns();
ensureMemberModerationColumns();
ensureAdminPermissionColumns();
ensureAdminSessionColumns();
bootstrapAdminAccount();

db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date().toISOString());
db.prepare("DELETE FROM courier_sessions WHERE expires_at <= ?").run(new Date().toISOString());
db.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").run(new Date().toISOString());
removeLegacySeedData();

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname } = requestUrl;

  try {
    if (pathname.startsWith("/api/")) {
      await handleApiRoutes(req, res, pathname);
      return;
    }

    serveStatic(req, res, pathname);
  } catch (error) {
    console.error(error);
    const statusCode = error && Number.isInteger(error.statusCode) ? error.statusCode : 500;
    const message = statusCode >= 500
      ? "حدث خطأ داخلي في الخادم."
      : error.message;
    sendJson(res, statusCode, { error: message });
  }
});

server.listen(PORT, () => {
  console.log(`Hoon Store is running on http://localhost:${PORT}`);

  if (ADMIN_PANEL_PATH) {
    console.log("Admin panel is enabled with a protected environment path.");
  } else {
    console.log("Admin panel is disabled until ADMIN_PANEL_PATH is set.");
  }

  if (IS_DEFAULT_ADMIN_CREDENTIALS) {
    console.warn("Security warning: default admin credentials are active. Set ADMIN_USERNAME, ADMIN_EMAIL, and ADMIN_PASSWORD before public deployment.");
  }

  if (IS_PRODUCTION && !process.env.DATA_DIR && !process.env.UPLOADS_DIR && !process.env.DB_PATH) {
    console.warn("Deployment warning: storage directories still point to app-local defaults. Attach persistent storage before going live.");
  }

  console.log(`Database path: ${DB_PATH}`);
  console.log(`Uploads path: ${UPLOADS_DIR}`);
});

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const fileContent = fs.readFileSync(filePath, "utf8");
  const lines = fileContent.split(/\r?\n/);

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim();

    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) {
      continue;
    }

    const normalizedValue = rawValue
      .replace(/^"(.*)"$/, "$1")
      .replace(/^'(.*)'$/, "$1");

    process.env[key] = normalizedValue;
  }
}

function normalizeNodeEnv(value) {
  return String(value || "development").trim().toLowerCase();
}

function resolveAppPath(value, fallbackPath) {
  const rawValue = String(value || "").trim();

  if (!rawValue) {
    return fallbackPath;
  }

  return path.isAbsolute(rawValue)
    ? rawValue
    : path.join(ROOT_DIR, rawValue);
}

function getConfiguredAdminPanelPath(value) {
  const normalizedPath = normalizeAdminPanelPath(value);

  return normalizedPath && normalizedPath !== "/" ? normalizedPath : null;
}

function normalizeAdminPanelPath(value) {
  const rawPath = String(value || "").trim();

  if (!rawPath) {
    return "";
  }

  const normalizedPath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;

  return normalizedPath.replace(/\/+$/, "") || "/";
}

function hasAdminPanelAccess(req) {
  const requestPanelPath = normalizeAdminPanelPath(req.headers[ADMIN_PANEL_HEADER] || "");

  return Boolean(ADMIN_PANEL_PATH) && requestPanelPath === ADMIN_PANEL_PATH;
}

function validateRuntimeConfig() {
  const warnings = [];
  const blockingIssues = [];

  if (ADMIN_PANEL_PATH && ADMIN_PANEL_PATH.length < 12) {
    warnings.push("ADMIN_PANEL_PATH is short. Use a longer, less guessable path before exposing the admin panel.");
  }

  if (IS_PRODUCTION && !process.env.DATA_DIR && !process.env.UPLOADS_DIR && !process.env.DB_PATH) {
    warnings.push("Storage paths are using app-local defaults. Confirm your deployment mounts persistent storage for both the database and uploads.");
  }

  if (IS_PRODUCTION) {
    if (!ADMIN_PANEL_PATH) {
      blockingIssues.push("Set ADMIN_PANEL_PATH to a secret, non-root path before starting in production.");
    }

    if (IS_DEFAULT_ADMIN_CREDENTIALS) {
      blockingIssues.push("Replace every default admin credential via ADMIN_USERNAME, ADMIN_EMAIL, and ADMIN_PASSWORD before starting in production.");
    }

    if (ADMIN_PASSWORD.length < 10) {
      blockingIssues.push("Use an ADMIN_PASSWORD that is at least 10 characters long in production.");
    }
  }

  for (const warning of warnings) {
    console.warn(`Configuration warning: ${warning}`);
  }

  if (blockingIssues.length > 0) {
    throw new Error(`Invalid production configuration:\n- ${blockingIssues.join("\n- ")}`);
  }
}

function ensureListingImageColumn() {
  const columns = db.prepare("PRAGMA table_info(listings)").all();
  const hasImagePath = columns.some((column) => column.name === "image_path");

  if (!hasImagePath) {
    db.exec("ALTER TABLE listings ADD COLUMN image_path TEXT");
  }
}

function ensureListingHighlightColumn() {
  const columns = db.prepare("PRAGMA table_info(listings)").all();
  const hasAdminHighlight = columns.some((column) => column.name === "admin_highlight");

  if (!hasAdminHighlight) {
    db.exec("ALTER TABLE listings ADD COLUMN admin_highlight INTEGER NOT NULL DEFAULT 0");
  }
}

function ensureListingApprovalColumns() {
  const columns = db.prepare("PRAGMA table_info(listings)").all();
  const hasApprovalStatus = columns.some((column) => column.name === "approval_status");
  const hasApprovedAt = columns.some((column) => column.name === "approved_at");

  if (!hasApprovalStatus) {
    db.exec("ALTER TABLE listings ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'pending'");
    db.exec(`
      UPDATE listings
      SET approval_status = 'approved'
      WHERE approval_status IS NULL OR approval_status = '' OR approval_status = 'pending'
    `);
  }

  if (!hasApprovedAt) {
    db.exec("ALTER TABLE listings ADD COLUMN approved_at TEXT");
  }

  if (!hasApprovalStatus || !hasApprovedAt) {
    db.exec(`
      UPDATE listings
      SET approved_at = COALESCE(approved_at, created_at, CURRENT_TIMESTAMP)
      WHERE approval_status = 'approved'
    `);
  }
}

function ensureMemberModerationColumns() {
  const columns = db.prepare("PRAGMA table_info(members)").all();
  const hasIsBanned = columns.some((column) => column.name === "is_banned");
  const hasBannedAt = columns.some((column) => column.name === "banned_at");

  if (!hasIsBanned) {
    db.exec("ALTER TABLE members ADD COLUMN is_banned INTEGER NOT NULL DEFAULT 0");
  }

  if (!hasBannedAt) {
    db.exec("ALTER TABLE members ADD COLUMN banned_at TEXT");
  }
}

function ensureAdminPermissionColumns() {
  const columns = db.prepare("PRAGMA table_info(admins)").all();
  const hasManageListings = columns.some((column) => column.name === "can_manage_listings");
  const hasBanMembers = columns.some((column) => column.name === "can_ban_members");

  if (!hasManageListings) {
    db.exec("ALTER TABLE admins ADD COLUMN can_manage_listings INTEGER NOT NULL DEFAULT 0");
  }

  if (!hasBanMembers) {
    db.exec("ALTER TABLE admins ADD COLUMN can_ban_members INTEGER NOT NULL DEFAULT 0");
  }
}

function ensureAdminSessionColumns() {
  const columns = db.prepare("PRAGMA table_info(admin_sessions)").all();
  const hasAdminId = columns.some((column) => column.name === "admin_id");

  if (!hasAdminId) {
    db.exec("ALTER TABLE admin_sessions ADD COLUMN admin_id INTEGER");
  }
}

function bootstrapAdminAccount() {
  const adminsCount = Number(db.prepare("SELECT COUNT(*) AS count FROM admins").get().count);

  if (adminsCount === 0) {
    db.prepare(`
      INSERT INTO admins (
        full_name,
        username,
        email,
        password_hash,
        role_label,
        can_manage_admins,
        can_manage_couriers,
        can_view_courier_documents,
        can_manage_listings,
        can_ban_members
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "الإدارة الرئيسية",
      ADMIN_USERNAME,
      ADMIN_EMAIL,
      hashPassword(ADMIN_PASSWORD),
      "مدير عام",
      1,
      1,
      1,
      1,
      1,
    );
  }

  if (!IS_DEFAULT_ADMIN_CREDENTIALS && adminsCount === 1) {
    const defaultBootstrapAdmin = db.prepare(`
      SELECT id
      FROM admins
      WHERE username = ? AND email = ?
      ORDER BY id ASC
      LIMIT 1
    `).get(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_EMAIL);

    if (defaultBootstrapAdmin) {
      db.prepare(`
        UPDATE admins
        SET
          username = ?,
          email = ?,
          password_hash = ?
        WHERE id = ?
      `).run(
        ADMIN_USERNAME,
        ADMIN_EMAIL,
        hashPassword(ADMIN_PASSWORD),
        defaultBootstrapAdmin.id,
      );
    }
  }

  db.prepare(`
    UPDATE admins
    SET
      can_manage_admins = 1,
      can_manage_couriers = 1,
      can_view_courier_documents = 1,
      can_manage_listings = 1,
      can_ban_members = 1
    WHERE username = ?
  `).run(ADMIN_USERNAME);

  const hasConfiguredAdmin = Boolean(db.prepare(`
    SELECT 1
    FROM admins
    WHERE username = ? OR email = ?
    LIMIT 1
  `).get(ADMIN_USERNAME, ADMIN_EMAIL));

  if (!hasConfiguredAdmin && !IS_DEFAULT_ADMIN_CREDENTIALS) {
    console.warn("Bootstrap warning: ADMIN_* values did not seed an account because the database already contains admin records. Use an existing admin account or reset the admin data if you need to reseed the primary admin.");
  }
}

function removeLegacySeedData() {
  const legacySeedEmails = [
    "ahmad@example.com",
    "noor@example.com",
    "sara@example.com",
    "mohammad@example.com",
  ];

  const deleteMember = db.prepare("DELETE FROM members WHERE email = ?");

  for (const email of legacySeedEmails) {
    deleteMember.run(email);
  }
}

async function handleApiRoutes(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, { ok: true, date: new Date().toISOString() });
    return;
  }

  if (pathname.startsWith("/api/admin/") && !hasAdminPanelAccess(req)) {
    sendJson(res, 404, { error: "المسار المطلوب غير موجود." });
    return;
  }

  if (req.method === "GET" && pathname === "/api/stats") {
    const stats = getStats();
    sendJson(res, 200, stats);
    return;
  }

  if (req.method === "GET" && pathname === "/api/courier-program") {
    sendJson(res, 200, {
      totalCouriers: Number(db.prepare("SELECT COUNT(*) AS count FROM couriers").get().count),
      cities: [...new Set(DELIVERY_RATE_RULES.map((rate) => rate.city))],
      rates: DELIVERY_RATE_RULES,
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/members") {
    const members = db.prepare(`
      SELECT
        m.id,
        m.full_name AS fullName,
        m.city,
        m.created_at AS createdAt,
        COUNT(l.id) AS listingsCount
      FROM members m
      LEFT JOIN listings l ON l.member_id = m.id
      GROUP BY m.id
      ORDER BY m.created_at DESC
      LIMIT 8
    `).all();

    sendJson(res, 200, {
      members: members.map((member) => ({
        id: member.id,
        fullName: member.fullName,
        city: member.city,
        createdAt: member.createdAt,
        listingsCount: Number(member.listingsCount),
      })),
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/listings") {
    sendJson(res, 200, { listings: getListings() });
    return;
  }

  if (req.method === "GET" && (pathname === "/api/admin/dashboard" || pathname === "/api/admin/couriers")) {
    const session = getAdminSession(req);

    if (!session) {
      sendJson(res, 401, { error: "يجب تسجيل دخول المشرف أولًا." });
      return;
    }

    const admin = getPublicAdmin(session.adminId);

    if (!admin) {
      sendJson(res, 401, { error: "تعذر العثور على حساب الإدارة." });
      return;
    }

    const canViewCouriers = admin.canManageCouriers || admin.canViewCourierDocuments || admin.canManageAdmins;
    const canViewListings = admin.canManageListings || admin.canBanMembers || admin.canManageAdmins;
    const canViewMembers = admin.canBanMembers || admin.canManageAdmins;

    sendJson(res, 200, {
      admin,
      couriers: canViewCouriers ? getAdminCouriers(admin) : [],
      listings: canViewListings ? getAdminListings(admin) : [],
      members: canViewMembers ? getAdminMembers(admin) : [],
      managers: admin.canManageAdmins ? getAdminManagers() : [],
      stats: getAdminStats(),
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/me") {
    const session = getSession(req);

    if (!session) {
      sendJson(res, 401, { error: "يجب تسجيل الدخول أولًا." });
      return;
    }

    sendJson(res, 200, {
      member: getPublicMember(session.member_id),
      summary: getAccountSummary(session.member_id),
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/couriers/me") {
    const session = getCourierSession(req);

    if (!session) {
      sendJson(res, 401, { error: "يجب تسجيل دخول المندوب أولًا." });
      return;
    }

    const courier = getPublicCourier(session.courier_id);

    if (!courier) {
      sendJson(res, 401, { error: "تعذر العثور على حساب المندوب." });
      return;
    }

    sendJson(res, 200, {
      courier,
      rates: getCourierRatesForCity(courier.city),
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/register") {
    const body = await readJsonBody(req);
    const fullName = normalizeText(body.fullName);
    const email = normalizeEmail(body.email);
    const phone = normalizeText(body.phone);
    const city = normalizeText(body.city);
    const password = String(body.password || "");

    if (!fullName || !email || !phone || !city || !password) {
      sendJson(res, 400, { error: "يرجى تعبئة جميع بيانات العضو." });
      return;
    }

    if (password.length < 6) {
      sendJson(res, 400, { error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل." });
      return;
    }

    const existingMember = db.prepare("SELECT id FROM members WHERE email = ?").get(email);

    if (existingMember) {
      sendJson(res, 409, { error: "هذا البريد الإلكتروني مستخدم من قبل." });
      return;
    }

    const result = db.prepare(`
      INSERT INTO members (full_name, email, phone, city, password_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run(fullName, email, phone, city, hashPassword(password));

    const memberId = Number(result.lastInsertRowid);
    const session = createSession(memberId);

    sendJson(res, 201, {
      message: "تم إنشاء الحساب بنجاح.",
      token: session.token,
      member: getPublicMember(memberId),
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/login") {
    const body = await readJsonBody(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");

    if (!email || !password) {
      sendJson(res, 400, { error: "أدخل البريد الإلكتروني وكلمة المرور." });
      return;
    }

    const member = db.prepare(`
      SELECT id, password_hash AS passwordHash, is_banned AS isBanned
      FROM members
      WHERE email = ?
    `).get(email);

    if (!member || !verifyPassword(password, member.passwordHash)) {
      sendJson(res, 401, { error: "بيانات الدخول غير صحيحة." });
      return;
    }

    if (Number(member.isBanned) === 1) {
      sendJson(res, 403, { error: "هذا الحساب محظور حاليًا من استخدام المنصة." });
      return;
    }

    const session = createSession(member.id);

    sendJson(res, 200, {
      message: "تم تسجيل الدخول بنجاح.",
      token: session.token,
      member: getPublicMember(member.id),
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/couriers/apply") {
    const contentType = req.headers["content-type"] || "";

    if (!contentType.includes("multipart/form-data")) {
      sendJson(res, 400, { error: "يرجى إرسال بيانات المندوب مع صور الهوية والصورة المباشرة." });
      return;
    }

    const multipart = await readMultipartFormData(req, contentType, MAX_MULTIPART_BODY_BYTES);
    const body = multipart.fields;
    const identityImage = multipart.files.find((file) => file.fieldName === "identityImage");
    const livePhoto = multipart.files.find((file) => file.fieldName === "livePhoto");
    const fullName = normalizeText(body.fullName);
    const email = normalizeEmail(body.email);
    const phone = normalizeText(body.phone);
    const city = normalizeText(body.city);
    const vehicleType = normalizeText(body.vehicleType);
    const coverageCities = normalizeText(body.coverageCities);
    const nationalIdNumber = normalizeText(body.nationalIdNumber);
    const password = String(body.password || "");

    if (!fullName || !phone || !city || !vehicleType || !nationalIdNumber || !password) {
      sendJson(res, 400, { error: "يرجى تعبئة جميع بيانات المندوب المطلوبة." });
      return;
    }

    if (password.length < 6) {
      sendJson(res, 400, { error: "كلمة مرور المندوب يجب أن تكون 6 أحرف على الأقل." });
      return;
    }

    if (!identityImage || !livePhoto) {
      sendJson(res, 400, { error: "يجب رفع صورة الهوية وصورة مباشرة من الكاميرا." });
      return;
    }

    const existingCourier = db.prepare(`
      SELECT id
      FROM couriers
      WHERE phone = ? OR (? <> '' AND email = ?)
    `).get(phone, email, email);

    if (existingCourier) {
      sendJson(res, 409, { error: "يوجد طلب مندوب مسجل بنفس رقم الهاتف أو البريد الإلكتروني." });
      return;
    }

    const identityImagePath = saveUploadedImage(identityImage);
    const livePhotoPath = saveUploadedImage(livePhoto);
    const result = db.prepare(`
      INSERT INTO couriers (
        full_name,
        email,
        phone,
        city,
        vehicle_type,
        coverage_cities,
        national_id_number,
        identity_image_path,
        live_photo_path,
        password_hash,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      fullName,
      email || null,
      phone,
      city,
      vehicleType,
      coverageCities,
      nationalIdNumber,
      identityImagePath,
      livePhotoPath,
      hashPassword(password),
    );

    const courierId = Number(result.lastInsertRowid);
    const session = createCourierSession(courierId);

    sendJson(res, 201, {
      message: "تم استلام طلب الانضمام كمندوب، ويمكنك الآن متابعة حالته من حساب المندوب.",
      token: session.token,
      courier: getPublicCourier(courierId),
      rates: getCourierRatesForCity(city),
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/couriers/login") {
    const body = await readJsonBody(req);
    const identity = normalizeText(body.identity);
    const password = String(body.password || "");

    if (!identity || !password) {
      sendJson(res, 400, { error: "أدخل رقم الهاتف أو البريد الإلكتروني وكلمة المرور." });
      return;
    }

    const normalizedIdentity = normalizeEmail(identity);
    const courier = db.prepare(`
      SELECT id, password_hash AS passwordHash
      FROM couriers
      WHERE phone = ? OR email = ?
    `).get(identity, normalizedIdentity);

    if (!courier || !verifyPassword(password, courier.passwordHash)) {
      sendJson(res, 401, { error: "بيانات دخول المندوب غير صحيحة." });
      return;
    }

    const session = createCourierSession(courier.id);
    const publicCourier = getPublicCourier(courier.id);

    sendJson(res, 200, {
      message: "تم تسجيل دخول المندوب بنجاح.",
      token: session.token,
      courier: publicCourier,
      rates: getCourierRatesForCity(publicCourier.city),
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/login") {
    const body = await readJsonBody(req);
    const identifier = normalizeText(body.identifier);
    const password = String(body.password || "");

    if (!identifier || !password) {
      sendJson(res, 400, { error: "أدخل اسم المستخدم أو البريد الإلكتروني وكلمة المرور." });
      return;
    }

    const normalizedIdentifier = normalizeEmail(identifier);
    const admin = db.prepare(`
      SELECT
        id,
        password_hash AS passwordHash
      FROM admins
      WHERE username = ? OR email = ?
    `).get(identifier, normalizedIdentifier);

    if (!admin || !verifyPassword(password, admin.passwordHash)) {
      sendJson(res, 401, { error: "بيانات دخول الإدارة غير صحيحة." });
      return;
    }

    const publicAdmin = getPublicAdmin(admin.id);
    const session = createAdminSession(publicAdmin);
    const canViewCouriers = publicAdmin.canManageCouriers || publicAdmin.canViewCourierDocuments || publicAdmin.canManageAdmins;
    const canViewListings = publicAdmin.canManageListings || publicAdmin.canBanMembers || publicAdmin.canManageAdmins;
    const canViewMembers = publicAdmin.canBanMembers || publicAdmin.canManageAdmins;

    sendJson(res, 200, {
      message: "تم تسجيل دخول الإدارة بنجاح.",
      token: session.token,
      admin: publicAdmin,
      couriers: canViewCouriers ? getAdminCouriers(publicAdmin) : [],
      listings: canViewListings ? getAdminListings(publicAdmin) : [],
      members: canViewMembers ? getAdminMembers(publicAdmin) : [],
      managers: publicAdmin.canManageAdmins ? getAdminManagers() : [],
      stats: getAdminStats(),
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/managers") {
    const session = getAdminSession(req);

    if (!session) {
      sendJson(res, 401, { error: "يجب تسجيل دخول الإدارة أولًا." });
      return;
    }

    const currentAdmin = getPublicAdmin(session.adminId);

    if (!currentAdmin || !currentAdmin.canManageAdmins) {
      sendJson(res, 403, { error: "ليس لديك صلاحية لإضافة مديرين جدد." });
      return;
    }

    const body = await readJsonBody(req);
    const fullName = normalizeText(body.fullName);
    const username = normalizeText(body.username);
    const email = normalizeEmail(body.email);
    const roleLabel = normalizeText(body.roleLabel) || "مدير";
    const password = String(body.password || "");
    const canManageAdmins = isTruthy(body.canManageAdmins) ? 1 : 0;
    const canManageCouriers = isTruthy(body.canManageCouriers) ? 1 : 0;
    const canViewCourierDocuments = isTruthy(body.canViewCourierDocuments) ? 1 : 0;
    const canManageListings = isTruthy(body.canManageListings) ? 1 : 0;
    const canBanMembers = isTruthy(body.canBanMembers) ? 1 : 0;

    if (!fullName || !username || !email || !password) {
      sendJson(res, 400, { error: "يرجى تعبئة بيانات المدير كاملة." });
      return;
    }

    if (password.length < 6) {
      sendJson(res, 400, { error: "كلمة مرور المدير يجب أن تكون 6 أحرف على الأقل." });
      return;
    }

    if (!canManageAdmins && !canManageCouriers && !canViewCourierDocuments && !canManageListings && !canBanMembers) {
      sendJson(res, 400, { error: "اختر صلاحية واحدة على الأقل لهذا المدير." });
      return;
    }

    const existingAdmin = db.prepare(`
      SELECT id
      FROM admins
      WHERE username = ? OR email = ?
    `).get(username, email);

    if (existingAdmin) {
      sendJson(res, 409, { error: "اسم المستخدم أو البريد الإلكتروني مستخدم بالفعل." });
      return;
    }

    const result = db.prepare(`
      INSERT INTO admins (
        full_name,
        username,
        email,
        password_hash,
        role_label,
        can_manage_admins,
        can_manage_couriers,
        can_view_courier_documents,
        can_manage_listings,
        can_ban_members
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      fullName,
      username,
      email,
      hashPassword(password),
      roleLabel,
      canManageAdmins,
      canManageCouriers,
      canViewCourierDocuments,
      canManageListings,
      canBanMembers,
    );

    sendJson(res, 201, {
      message: "تمت إضافة المدير بنجاح.",
      manager: getPublicAdmin(Number(result.lastInsertRowid)),
      managers: getAdminManagers(),
      stats: getAdminStats(),
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/logout") {
    const session = getSession(req);

    if (session) {
      db.prepare("DELETE FROM sessions WHERE token = ?").run(session.token);
    }

    sendJson(res, 200, { message: "تم تسجيل الخروج." });
    return;
  }

  if (req.method === "POST" && pathname === "/api/couriers/logout") {
    const session = getCourierSession(req);

    if (session) {
      db.prepare("DELETE FROM courier_sessions WHERE token = ?").run(session.token);
    }

    sendJson(res, 200, { message: "تم تسجيل خروج المندوب." });
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/logout") {
    const session = getAdminSession(req);

    if (session) {
      db.prepare("DELETE FROM admin_sessions WHERE token = ?").run(session.token);
    }

    sendJson(res, 200, { message: "تم تسجيل خروج المشرف." });
    return;
  }

  const adminStatusMatch = pathname.match(/^\/api\/admin\/couriers\/(\d+)\/status$/);

  if (req.method === "POST" && adminStatusMatch) {
    const session = getAdminSession(req);

    if (!session) {
      sendJson(res, 401, { error: "يجب تسجيل دخول المشرف أولًا." });
      return;
    }

    const admin = getPublicAdmin(session.adminId);

    if (!admin || !admin.canManageCouriers) {
      sendJson(res, 403, { error: "ليس لديك صلاحية لتحديث حالات المندوبين." });
      return;
    }

    const courierId = Number(adminStatusMatch[1]);
    const body = await readJsonBody(req);
    const status = normalizeText(body.status);
    const allowedStatuses = new Set(["pending", "approved", "paused"]);

    if (!allowedStatuses.has(status)) {
      sendJson(res, 400, { error: "حالة المندوب غير صالحة." });
      return;
    }

    const courier = db.prepare("SELECT id FROM couriers WHERE id = ?").get(courierId);

    if (!courier) {
      sendJson(res, 404, { error: "طلب المندوب غير موجود." });
      return;
    }

    db.prepare("UPDATE couriers SET status = ? WHERE id = ?").run(status, courierId);

    sendJson(res, 200, {
      message: "تم تحديث حالة المندوب.",
      courier: getAdminCourierById(courierId, admin),
      couriers: getAdminCouriers(admin),
      stats: getAdminStats(),
    });
    return;
  }

  const adminListingHighlightMatch = pathname.match(/^\/api\/admin\/listings\/(\d+)\/highlight$/);

  if (req.method === "POST" && adminListingHighlightMatch) {
    const session = getAdminSession(req);

    if (!session) {
      sendJson(res, 401, { error: "يجب تسجيل دخول الإدارة أولًا." });
      return;
    }

    const admin = getPublicAdmin(session.adminId);

    if (!admin || !(admin.canManageListings || admin.canManageAdmins)) {
      sendJson(res, 403, { error: "ليس لديك صلاحية لتمييز الإعلانات." });
      return;
    }

    const listingId = Number(adminListingHighlightMatch[1]);
    const body = await readJsonBody(req);
    const highlighted = isTruthy(body.highlighted) ? 1 : 0;
    const listing = db.prepare(`
      SELECT id, approval_status AS approvalStatus
      FROM listings
      WHERE id = ?
    `).get(listingId);

    if (!listing) {
      sendJson(res, 404, { error: "الإعلان غير موجود." });
      return;
    }

    if (highlighted && listing.approvalStatus !== "approved") {
      sendJson(res, 400, { error: "اعتمد الإعلان أولًا قبل تمييزه بإطار ذهبي." });
      return;
    }

    db.prepare("UPDATE listings SET admin_highlight = ? WHERE id = ?").run(highlighted, listingId);

    sendJson(res, 200, {
      message: highlighted ? "تم تمييز الإعلان بإطار ذهبي." : "تمت إزالة الإطار الذهبي عن الإعلان.",
      listing: getAdminListingById(listingId, admin),
      listings: getAdminListings(admin),
      stats: getAdminStats(),
    });
    return;
  }

  const adminListingApprovalMatch = pathname.match(/^\/api\/admin\/listings\/(\d+)\/approve$/);

  if (req.method === "POST" && adminListingApprovalMatch) {
    const session = getAdminSession(req);

    if (!session) {
      sendJson(res, 401, { error: "ÙŠØ¬Ø¨ ØªØ³Ø¬ÙŠÙ„ Ø¯Ø®ÙˆÙ„ Ø§Ù„Ø¥Ø¯Ø§Ø±Ø© Ø£ÙˆÙ„Ù‹Ø§." });
      return;
    }

    const admin = getPublicAdmin(session.adminId);

    if (!admin || !(admin.canManageListings || admin.canManageAdmins)) {
      sendJson(res, 403, { error: "Ù„ÙŠØ³ Ù„Ø¯ÙŠÙƒ ØµÙ„Ø§Ø­ÙŠØ© Ù„Ø§Ø¹ØªÙ…Ø§Ø¯ Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†Ø§Øª." });
      return;
    }

    const listingId = Number(adminListingApprovalMatch[1]);
    const listing = db.prepare(`
      SELECT id, approval_status AS approvalStatus
      FROM listings
      WHERE id = ?
    `).get(listingId);

    if (!listing) {
      sendJson(res, 404, { error: "Ø§Ù„Ø¥Ø¹Ù„Ø§Ù† ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯." });
      return;
    }

    if (listing.approvalStatus === "approved") {
      sendJson(res, 200, {
        message: "Ø§Ù„Ø¥Ø¹Ù„Ø§Ù† Ù…Ø¹ØªÙ…Ø¯ Ù…Ø³Ø¨Ù‚Ù‹Ø§.",
        listing: getAdminListingById(listingId, admin),
        listings: getAdminListings(admin),
        stats: getAdminStats(),
      });
      return;
    }

    db.prepare(`
      UPDATE listings
      SET approval_status = 'approved', approved_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), listingId);

    sendJson(res, 200, {
      message: "ØªÙ… Ø§Ø¹ØªÙ…Ø§Ø¯ Ø§Ù„Ø¥Ø¹Ù„Ø§Ù† ÙˆØ£ØµØ¨Ø­ Ø¸Ø§Ù‡Ø±Ù‹Ø§ Ù„Ù„Ø²ÙˆØ§Ø±.",
      listing: getAdminListingById(listingId, admin),
      listings: getAdminListings(admin),
      stats: getAdminStats(),
    });
    return;
  }

  const adminListingImageMatch = pathname.match(/^\/api\/admin\/listings\/(\d+)\/remove-image$/);

  if (req.method === "POST" && adminListingImageMatch) {
    const session = getAdminSession(req);

    if (!session) {
      sendJson(res, 401, { error: "يجب تسجيل دخول الإدارة أولًا." });
      return;
    }

    const admin = getPublicAdmin(session.adminId);

    if (!admin || !(admin.canManageListings || admin.canManageAdmins)) {
      sendJson(res, 403, { error: "ليس لديك صلاحية لحذف صور الإعلانات." });
      return;
    }

    const listingId = Number(adminListingImageMatch[1]);
    const listing = db.prepare("SELECT image_path AS imagePath FROM listings WHERE id = ?").get(listingId);

    if (!listing) {
      sendJson(res, 404, { error: "الإعلان غير موجود." });
      return;
    }

    if (listing.imagePath) {
      deleteUploadedFile(listing.imagePath);
    }

    db.prepare("UPDATE listings SET image_path = NULL WHERE id = ?").run(listingId);

    sendJson(res, 200, {
      message: "تم حذف صورة الإعلان.",
      listing: getAdminListingById(listingId, admin),
      listings: getAdminListings(admin),
      stats: getAdminStats(),
    });
    return;
  }

  const adminListingDeleteMatch = pathname.match(/^\/api\/admin\/listings\/(\d+)$/);

  if (req.method === "DELETE" && adminListingDeleteMatch) {
    const session = getAdminSession(req);

    if (!session) {
      sendJson(res, 401, { error: "يجب تسجيل دخول الإدارة أولًا." });
      return;
    }

    const admin = getPublicAdmin(session.adminId);

    if (!admin || !(admin.canManageListings || admin.canManageAdmins)) {
      sendJson(res, 403, { error: "ليس لديك صلاحية لحذف الإعلانات." });
      return;
    }

    const listingId = Number(adminListingDeleteMatch[1]);
    const listing = db.prepare("SELECT image_path AS imagePath FROM listings WHERE id = ?").get(listingId);

    if (!listing) {
      sendJson(res, 404, { error: "الإعلان غير موجود." });
      return;
    }

    if (listing.imagePath) {
      deleteUploadedFile(listing.imagePath);
    }

    db.prepare("DELETE FROM listings WHERE id = ?").run(listingId);

    sendJson(res, 200, {
      message: "تم حذف الإعلان.",
      listings: getAdminListings(admin),
      members: admin.canBanMembers || admin.canManageAdmins ? getAdminMembers(admin) : [],
      stats: getAdminStats(),
    });
    return;
  }

  const adminMemberBanMatch = pathname.match(/^\/api\/admin\/members\/(\d+)\/ban$/);

  if (req.method === "POST" && adminMemberBanMatch) {
    const session = getAdminSession(req);

    if (!session) {
      sendJson(res, 401, { error: "يجب تسجيل دخول الإدارة أولًا." });
      return;
    }

    const admin = getPublicAdmin(session.adminId);

    if (!admin || !(admin.canBanMembers || admin.canManageAdmins)) {
      sendJson(res, 403, { error: "ليس لديك صلاحية لحظر المستخدمين." });
      return;
    }

    const memberId = Number(adminMemberBanMatch[1]);
    const body = await readJsonBody(req);
    const banned = isTruthy(body.banned) ? 1 : 0;
    const member = db.prepare("SELECT id FROM members WHERE id = ?").get(memberId);

    if (!member) {
      sendJson(res, 404, { error: "المستخدم غير موجود." });
      return;
    }

    db.prepare(`
      UPDATE members
      SET is_banned = ?, banned_at = ?
      WHERE id = ?
    `).run(banned, banned ? new Date().toISOString() : null, memberId);

    if (banned) {
      db.prepare("DELETE FROM sessions WHERE member_id = ?").run(memberId);
    }

    sendJson(res, 200, {
      message: banned ? "تم حظر المستخدم." : "تم فك حظر المستخدم.",
      members: getAdminMembers(admin),
      listings: admin.canManageListings || admin.canManageAdmins || admin.canBanMembers ? getAdminListings(admin) : [],
      stats: getAdminStats(),
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/favorites") {
    const session = getSession(req);

    if (!session) {
      sendJson(res, 401, { error: "يجب تسجيل الدخول لاستخدام المفضلة." });
      return;
    }

    const body = await readJsonBody(req);
    const listingId = Number(body.listingId);

    if (!Number.isInteger(listingId) || listingId <= 0) {
      sendJson(res, 400, { error: "الإعلان المطلوب غير صالح." });
      return;
    }

    const listing = db.prepare(`
      SELECT
        l.id,
        l.member_id AS memberId,
        l.approval_status AS approvalStatus,
        m.is_banned AS sellerIsBanned
      FROM listings l
      INNER JOIN members m ON m.id = l.member_id
      WHERE l.id = ?
    `).get(listingId);

    if (!listing) {
      sendJson(res, 404, { error: "الإعلان غير موجود." });
      return;
    }

    if (listing.approvalStatus !== "approved" || listing.sellerIsBanned) {
      sendJson(res, 400, { error: "لا يمكن إضافة إعلان غير معتمد أو محجوب إلى المفضلة." });
      return;
      sendJson(res, 400, { error: "Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø¥Ø¶Ø§ÙØ© Ø¥Ø¹Ù„Ø§Ù† ØºÙŠØ± Ù…Ø¹ØªÙ…Ø¯ Ø£Ùˆ Ù…Ø­Ø¬ÙˆØ¨ Ø¥Ù„Ù‰ Ø§Ù„Ù…ÙØ¶Ù„Ø©." });
      return;
    }

    if (listing.memberId === session.member_id) {
      sendJson(res, 400, { error: "لا يمكن إضافة إعلانك الشخصي إلى المفضلة." });
      return;
    }

    const existingFavorite = db.prepare(`
      SELECT listing_id AS listingId
      FROM favorites
      WHERE member_id = ? AND listing_id = ?
    `).get(session.member_id, listingId);

    let saved = false;

    if (existingFavorite) {
      db.prepare("DELETE FROM favorites WHERE member_id = ? AND listing_id = ?").run(session.member_id, listingId);
    } else {
      db.prepare("INSERT INTO favorites (member_id, listing_id) VALUES (?, ?)").run(session.member_id, listingId);
      saved = true;
    }

    sendJson(res, 200, {
      saved,
      summary: getAccountSummary(session.member_id),
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/listings") {
    const session = getSession(req);

    if (!session) {
      sendJson(res, 401, { error: "يجب تسجيل الدخول قبل نشر أي إعلان." });
      return;
    }

    const contentType = req.headers["content-type"] || "";
    let body = {};
    let uploadedImage = null;
    let uploadedImagePath = null;

    if (!contentType.includes("multipart/form-data")) {
      sendJson(res, 400, { error: "يجب إرسال الإعلان مع صورة مباشرة ملتقطة من الكاميرا." });
      return;
    }

    const multipart = await readMultipartFormData(req, contentType);
    body = multipart.fields;
    uploadedImage = multipart.files.find((file) => file.fieldName === "image");

    const title = normalizeText(body.title);
    const city = normalizeText(body.city);
    const category = normalizeText(body.category);
    const description = normalizeText(body.description);
    const price = Number(body.price);
    const isFeatured = isTruthy(body.isFeatured) ? 1 : 0;
    const imageSourceType = normalizeText(body.imageSourceType).toLowerCase();

    if (!title || !city || !category || !description || !Number.isFinite(price) || price <= 0) {
      sendJson(res, 400, { error: "بيانات الإعلان غير مكتملة أو غير صالحة." });
      return;
    }

    if (!uploadedImage) {
      sendJson(res, 400, { error: "يجب التقاط صورة مباشرة وواضحة للمنتج قبل إرسال الإعلان." });
      return;
    }

    if (imageSourceType !== "camera") {
      sendJson(res, 400, { error: "ارفع صورة المنتج عبر الالتقاط المباشر من الكاميرا فقط." });
      return;
    }

    try {
      uploadedImagePath = saveUploadedImage(uploadedImage);

      const result = db.prepare(`
        INSERT INTO listings (
          member_id,
          title,
          price,
          city,
          category,
          description,
          approval_status,
          approved_at,
          is_featured,
          image_path
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        session.member_id,
        title,
        Math.round(price),
        city,
        category,
        description,
        "pending",
        null,
        isFeatured,
        uploadedImagePath,
      );

      const submissionMessage = isFeatured
        ? "تم إرسال الإعلان وطلب تمييزه. ستراجع الإدارة الصورة والطلب قبل اعتماد الظهور."
        : "تم إرسال الإعلان بنجاح. ستراجع الإدارة الصورة أولًا للتأكد من أنها حقيقية وغير مخالفة قبل ظهوره.";

      sendJson(res, 201, {
        message: submissionMessage,
        listing: getListingById(Number(result.lastInsertRowid)),
      });
      return;
    } catch (error) {
      if (uploadedImagePath) {
        deleteUploadedFile(uploadedImagePath);
      }

      throw error;
    }
  }

  sendJson(res, 404, { error: "المسار المطلوب غير موجود." });
}

function serveStatic(req, res, pathname) {
  if (pathname.startsWith("/uploads/")) {
    serveUploadedFile(res, pathname);
    return;
  }

  const fileMap = {
    "/": "index.html",
    "/index.html": "index.html",
    "/styles.css": "styles.css",
    "/script.js": "script.js",
    "/admin.js": "admin.js",
    "/sh.png": "sh.png",
    "/sh.jpg": "sh.jpg",
  };

  if (ADMIN_PANEL_PATH && (pathname === ADMIN_PANEL_PATH || pathname === `${ADMIN_PANEL_PATH}/`)) {
    sendFile(res, path.join(ROOT_DIR, "admin.html"), "text/html; charset=utf-8", {
      "Cache-Control": "no-store",
    });
    return;
  }

  const fileName = fileMap[pathname];

  if (!fileName) {
    res.writeHead(404, buildResponseHeaders({
      "Content-Type": "text/plain; charset=utf-8",
    }));
    res.end("الصفحة غير موجودة.");
    return;
  }

  const filePath = path.join(ROOT_DIR, fileName);
  const ext = path.extname(filePath);
  const contentType = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
  }[ext] || "application/octet-stream";
  sendFile(res, filePath, contentType);
}

function getStats() {
  const totalMembers = db.prepare("SELECT COUNT(*) AS count FROM members").get().count;
  const totalListings = db.prepare(`
    SELECT COUNT(*) AS count
    FROM listings l
    INNER JOIN members m ON m.id = l.member_id
    WHERE l.approval_status = 'approved' AND m.is_banned = 0
  `).get().count;
  const featuredListings = db.prepare(`
    SELECT COUNT(*) AS count
    FROM listings l
    INNER JOIN members m ON m.id = l.member_id
    WHERE l.approval_status = 'approved' AND l.is_featured = 1 AND m.is_banned = 0
  `).get().count;
  const totalCities = db.prepare(`
    SELECT COUNT(DISTINCT l.city) AS count
    FROM listings l
    INNER JOIN members m ON m.id = l.member_id
    WHERE l.approval_status = 'approved' AND m.is_banned = 0
  `).get().count;

  return {
    totalMembers: Number(totalMembers),
    totalListings: Number(totalListings),
    featuredListings: Number(featuredListings),
    totalCities: Number(totalCities),
  };
}

function getListings() {
  const rows = db.prepare(`
    SELECT
      l.id,
      l.member_id AS sellerId,
      l.title,
      l.price,
      l.city,
      l.category,
      l.description,
      l.image_path AS imagePath,
      l.approval_status AS approvalStatus,
      l.approved_at AS approvedAt,
      l.admin_highlight AS adminHighlight,
      l.is_featured AS isFeatured,
      l.created_at AS createdAt,
      m.full_name AS sellerName,
      m.phone AS sellerPhone
    FROM listings l
    INNER JOIN members m ON m.id = l.member_id
    WHERE l.approval_status = 'approved' AND m.is_banned = 0
    ORDER BY l.admin_highlight DESC, l.is_featured DESC, l.created_at DESC
  `).all();

  return rows.map(mapListingRow);
}

function getListingById(id) {
  const row = db.prepare(`
    SELECT
      l.id,
      l.member_id AS sellerId,
      l.title,
      l.price,
      l.city,
      l.category,
      l.description,
      l.image_path AS imagePath,
      l.approval_status AS approvalStatus,
      l.approved_at AS approvedAt,
      l.admin_highlight AS adminHighlight,
      l.is_featured AS isFeatured,
      l.created_at AS createdAt,
      m.full_name AS sellerName,
      m.phone AS sellerPhone
    FROM listings l
    INNER JOIN members m ON m.id = l.member_id
    WHERE l.id = ?
  `).get(id);

  return mapListingRow(row);
}

function getPublicMember(memberId) {
  const row = db.prepare(`
    SELECT
      m.id,
      m.full_name AS fullName,
      m.email,
      m.phone,
      m.city,
      m.is_banned AS isBanned,
      m.created_at AS createdAt,
      COUNT(l.id) AS listingsCount
    FROM members m
    LEFT JOIN listings l ON l.member_id = m.id
    WHERE m.id = ?
    GROUP BY m.id
  `).get(memberId);

  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    city: row.city,
    isBanned: Boolean(row.isBanned || 0),
    createdAt: row.createdAt,
    listingsCount: Number(row.listingsCount),
  };
}

function getPublicCourier(courierId) {
  const row = db.prepare(`
    SELECT
      id,
      full_name AS fullName,
      email,
      phone,
      city,
      vehicle_type AS vehicleType,
      coverage_cities AS coverageCities,
      identity_image_path AS identityImageUrl,
      live_photo_path AS livePhotoUrl,
      status,
      created_at AS createdAt
    FROM couriers
    WHERE id = ?
  `).get(courierId);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email || "",
    phone: row.phone,
    city: row.city,
    vehicleType: row.vehicleType,
    coverageCities: row.coverageCities,
    identityImageUrl: row.identityImageUrl,
    livePhotoUrl: row.livePhotoUrl,
    status: row.status,
    statusLabel: getCourierStatusLabel(row.status),
    createdAt: row.createdAt,
  };
}

function getPublicAdmin(adminId) {
  const row = db.prepare(`
    SELECT
      id,
      full_name AS fullName,
      username,
      email,
      role_label AS roleLabel,
      can_manage_admins AS canManageAdmins,
      can_manage_couriers AS canManageCouriers,
      can_view_courier_documents AS canViewCourierDocuments,
      can_manage_listings AS canManageListings,
      can_ban_members AS canBanMembers,
      created_at AS createdAt
    FROM admins
    WHERE id = ?
  `).get(adminId);

  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    fullName: row.fullName,
    username: row.username,
    email: row.email,
    roleLabel: row.roleLabel,
    canManageAdmins: Boolean(row.canManageAdmins),
    canManageCouriers: Boolean(row.canManageCouriers),
    canViewCourierDocuments: Boolean(row.canViewCourierDocuments),
    canManageListings: Boolean(row.canManageListings),
    canBanMembers: Boolean(row.canBanMembers),
    createdAt: row.createdAt,
  };
}

function getAdminManagers() {
  return db.prepare(`
    SELECT
      id
    FROM admins
    ORDER BY created_at DESC
  `).all().map((row) => getPublicAdmin(row.id));
}

function getAdminStats() {
  return {
    totalManagers: Number(db.prepare("SELECT COUNT(*) AS count FROM admins").get().count),
    pendingCouriers: Number(db.prepare("SELECT COUNT(*) AS count FROM couriers WHERE status = 'pending'").get().count),
    approvedCouriers: Number(db.prepare("SELECT COUNT(*) AS count FROM couriers WHERE status = 'approved'").get().count),
    pausedCouriers: Number(db.prepare("SELECT COUNT(*) AS count FROM couriers WHERE status = 'paused'").get().count),
    highlightedListings: Number(db.prepare("SELECT COUNT(*) AS count FROM listings WHERE admin_highlight = 1 AND approval_status = 'approved'").get().count),
    pendingListings: Number(db.prepare("SELECT COUNT(*) AS count FROM listings WHERE approval_status = 'pending'").get().count),
    bannedMembers: Number(db.prepare("SELECT COUNT(*) AS count FROM members WHERE is_banned = 1").get().count),
  };
}

function getAdminListings(admin) {
  const rows = db.prepare(`
    SELECT
      l.id,
      l.member_id AS sellerId,
      l.title,
      l.price,
      l.city,
      l.category,
      l.description,
      l.image_path AS imagePath,
      l.approval_status AS approvalStatus,
      l.approved_at AS approvedAt,
      l.admin_highlight AS adminHighlight,
      l.is_featured AS isFeatured,
      l.created_at AS createdAt,
      m.full_name AS sellerName,
      m.phone AS sellerPhone,
      m.is_banned AS sellerIsBanned
    FROM listings l
    INNER JOIN members m ON m.id = l.member_id
    ORDER BY
      CASE WHEN l.approval_status = 'pending' THEN 0 ELSE 1 END,
      l.admin_highlight DESC,
      l.is_featured DESC,
      l.created_at DESC
  `).all();

  return rows.map((row) => ({
    ...mapListingRow(row),
    sellerIsBanned: Boolean(row.sellerIsBanned),
    canApprove: Boolean((admin.canManageListings || admin.canManageAdmins) && row.approvalStatus !== "approved"),
    canManageListings: Boolean(admin.canManageListings || admin.canManageAdmins),
    canBanMember: Boolean(admin.canBanMembers || admin.canManageAdmins),
  }));
}

function getAdminMembers(admin) {
  const rows = db.prepare(`
    SELECT
      m.id,
      m.full_name AS fullName,
      m.email,
      m.phone,
      m.city,
      m.is_banned AS isBanned,
      m.banned_at AS bannedAt,
      m.created_at AS createdAt,
      COUNT(l.id) AS listingsCount
    FROM members m
    LEFT JOIN listings l ON l.member_id = m.id
    GROUP BY m.id
    ORDER BY m.created_at DESC
  `).all();

  return rows.map((row) => ({
    id: Number(row.id),
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    city: row.city,
    isBanned: Boolean(row.isBanned),
    bannedAt: row.bannedAt || "",
    createdAt: row.createdAt,
    listingsCount: Number(row.listingsCount),
    canBanMember: Boolean(admin.canBanMembers || admin.canManageAdmins),
  }));
}

function getAdminCouriers(admin) {
  const rows = db.prepare(`
    SELECT
      id,
      full_name AS fullName,
      email,
      phone,
      city,
      vehicle_type AS vehicleType,
      coverage_cities AS coverageCities,
      national_id_number AS nationalIdNumber,
      identity_image_path AS identityImageUrl,
      live_photo_path AS livePhotoUrl,
      status,
      created_at AS createdAt
    FROM couriers
    ORDER BY created_at DESC
  `).all();

  return rows.map((row) => mapAdminCourierRow(row, admin));
}

function getAdminListingById(listingId, admin) {
  const row = db.prepare(`
    SELECT
      l.id,
      l.member_id AS sellerId,
      l.title,
      l.price,
      l.city,
      l.category,
      l.description,
      l.image_path AS imagePath,
      l.approval_status AS approvalStatus,
      l.approved_at AS approvedAt,
      l.admin_highlight AS adminHighlight,
      l.is_featured AS isFeatured,
      l.created_at AS createdAt,
      m.full_name AS sellerName,
      m.phone AS sellerPhone,
      m.is_banned AS sellerIsBanned
    FROM listings l
    INNER JOIN members m ON m.id = l.member_id
    WHERE l.id = ?
  `).get(listingId);

  if (!row) {
    return null;
  }

  return {
    ...mapListingRow(row),
    sellerIsBanned: Boolean(row.sellerIsBanned),
    canApprove: Boolean((admin.canManageListings || admin.canManageAdmins) && row.approvalStatus !== "approved"),
    canManageListings: Boolean(admin.canManageListings || admin.canManageAdmins),
    canBanMember: Boolean(admin.canBanMembers || admin.canManageAdmins),
  };
}

function getAdminCourierById(courierId, admin = null) {
  const row = db.prepare(`
    SELECT
      id,
      full_name AS fullName,
      email,
      phone,
      city,
      vehicle_type AS vehicleType,
      coverage_cities AS coverageCities,
      national_id_number AS nationalIdNumber,
      identity_image_path AS identityImageUrl,
      live_photo_path AS livePhotoUrl,
      status,
      created_at AS createdAt
    FROM couriers
    WHERE id = ?
  `).get(courierId);

  return row ? mapAdminCourierRow(row, admin) : null;
}

function getAccountSummary(memberId) {
  const personalListings = db.prepare(`
    SELECT
      l.id,
      l.member_id AS sellerId,
      l.title,
      l.price,
      l.city,
      l.category,
      l.description,
      l.image_path AS imagePath,
      l.approval_status AS approvalStatus,
      l.approved_at AS approvedAt,
      l.admin_highlight AS adminHighlight,
      l.is_featured AS isFeatured,
      l.created_at AS createdAt,
      m.full_name AS sellerName,
      m.phone AS sellerPhone
    FROM listings l
    INNER JOIN members m ON m.id = l.member_id
    WHERE l.member_id = ?
    ORDER BY l.created_at DESC
  `).all(memberId).map(mapListingRow);

  const favoriteListings = db.prepare(`
    SELECT
      l.id,
      l.member_id AS sellerId,
      l.title,
      l.price,
      l.city,
      l.category,
      l.description,
      l.image_path AS imagePath,
      l.approval_status AS approvalStatus,
      l.approved_at AS approvedAt,
      l.admin_highlight AS adminHighlight,
      l.is_featured AS isFeatured,
      l.created_at AS createdAt,
      m.full_name AS sellerName,
      m.phone AS sellerPhone
    FROM favorites f
    INNER JOIN listings l ON l.id = f.listing_id
    INNER JOIN members m ON m.id = l.member_id
    WHERE f.member_id = ?
      AND l.approval_status = 'approved'
      AND m.is_banned = 0
    ORDER BY f.created_at DESC
  `).all(memberId).map(mapListingRow);

  return {
    personalListings,
    favoriteListings,
    favoriteListingIds: favoriteListings.map((listing) => listing.id),
  };
}

function mapListingRow(row) {
  return {
    id: row.id,
    sellerId: Number(row.sellerId),
    title: row.title,
    price: Number(row.price),
    city: row.city,
    category: row.category,
    description: row.description,
    imageUrl: row.imagePath || null,
    approvalStatus: row.approvalStatus || "approved",
    approvalStatusLabel: getListingApprovalLabel(row.approvalStatus || "approved"),
    isApproved: (row.approvalStatus || "approved") === "approved",
    approvedAt: row.approvedAt || "",
    isAdminHighlighted: Boolean(row.adminHighlight),
    isFeatured: Boolean(row.isFeatured),
    createdAt: row.createdAt,
    sellerName: row.sellerName,
    sellerPhone: row.sellerPhone,
  };
}

function mapAdminCourierRow(row, admin = null) {
  const canViewCourierDocuments = !admin || admin.canViewCourierDocuments || admin.canManageAdmins;

  return {
    id: Number(row.id),
    fullName: row.fullName,
    email: row.email || "",
    phone: row.phone,
    city: row.city,
    vehicleType: row.vehicleType,
    coverageCities: row.coverageCities,
    nationalIdNumber: canViewCourierDocuments ? row.nationalIdNumber : "",
    identityImageUrl: canViewCourierDocuments ? row.identityImageUrl : "",
    livePhotoUrl: canViewCourierDocuments ? row.livePhotoUrl : "",
    status: row.status,
    statusLabel: getCourierStatusLabel(row.status),
    createdAt: row.createdAt,
  };
}

function getSession(req) {
  const authorization = req.headers.authorization || "";

  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice("Bearer ".length).trim();

  if (!token) {
    return null;
  }

  const session = db.prepare(`
    SELECT token, member_id, expires_at
    FROM sessions
    WHERE token = ?
  `).get(token);

  if (!session) {
    return null;
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }

  const member = db.prepare("SELECT is_banned AS isBanned FROM members WHERE id = ?").get(session.member_id);

  if (!member || Number(member.isBanned) === 1) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }

  return session;
}

function getCourierSession(req) {
  const authorization = req.headers.authorization || "";

  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice("Bearer ".length).trim();

  if (!token) {
    return null;
  }

  const session = db.prepare(`
    SELECT token, courier_id, expires_at
    FROM courier_sessions
    WHERE token = ?
  `).get(token);

  if (!session) {
    return null;
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    db.prepare("DELETE FROM courier_sessions WHERE token = ?").run(token);
    return null;
  }

  return session;
}

function getAdminSession(req) {
  const authorization = req.headers.authorization || "";

  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice("Bearer ".length).trim();

  if (!token) {
    return null;
  }

  const session = db.prepare(`
    SELECT token, username, admin_id AS adminId, expires_at
    FROM admin_sessions
    WHERE token = ?
  `).get(token);

  if (!session) {
    return null;
  }

  if (!session.adminId) {
    db.prepare("DELETE FROM admin_sessions WHERE token = ?").run(token);
    return null;
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    db.prepare("DELETE FROM admin_sessions WHERE token = ?").run(token);
    return null;
  }

  return session;
}

function createSession(memberId) {
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();

  db.prepare(`
    INSERT INTO sessions (token, member_id, expires_at)
    VALUES (?, ?, ?)
  `).run(token, memberId, expiresAt);

  return { token, expiresAt };
}

function createCourierSession(courierId) {
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();

  db.prepare(`
    INSERT INTO courier_sessions (token, courier_id, expires_at)
    VALUES (?, ?, ?)
  `).run(token, courierId, expiresAt);

  return { token, expiresAt };
}

function createAdminSession(admin) {
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();

  db.prepare(`
    INSERT INTO admin_sessions (token, username, admin_id, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(token, admin.username, admin.id, expiresAt);

  return { token, expiresAt };
}

async function readJsonBody(req) {
  const raw = (await readRawBody(req)).toString("utf-8");

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function readRawBody(req, maxBytes = DEFAULT_MAX_BODY_BYTES) {
  const chunks = [];
  let totalSize = 0;

  for await (const chunk of req) {
    totalSize += chunk.length;

    if (totalSize > maxBytes) {
      throw createHttpError(413, "حجم الملف كبير جدًا. الحد الأقصى هو 5 ميغابايت.");
    }

    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

async function readMultipartFormData(req, contentType, maxBytes = MAX_MULTIPART_BODY_BYTES) {
  const boundary = extractBoundary(contentType);

  if (!boundary) {
    throw createHttpError(400, "تعذر قراءة ملف الصورة المرفوع.");
  }

  const bodyBuffer = await readRawBody(req, maxBytes);
  return parseMultipartFormData(bodyBuffer, boundary);
}

function extractBoundary(contentType) {
  const match = String(contentType).match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  return match ? (match[1] || match[2]) : "";
}

function parseMultipartFormData(buffer, boundary) {
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const separatorBuffer = Buffer.from("\r\n\r\n");
  const parts = [];
  const fields = {};
  const files = [];
  let cursor = 0;

  while (cursor < buffer.length) {
    const boundaryIndex = buffer.indexOf(boundaryBuffer, cursor);

    if (boundaryIndex === -1) {
      break;
    }

    let partStart = boundaryIndex + boundaryBuffer.length;

    if (buffer.slice(partStart, partStart + 2).equals(Buffer.from("--"))) {
      break;
    }

    if (buffer.slice(partStart, partStart + 2).equals(Buffer.from("\r\n"))) {
      partStart += 2;
    }

    const nextBoundaryIndex = buffer.indexOf(boundaryBuffer, partStart);

    if (nextBoundaryIndex === -1) {
      break;
    }

    let partBuffer = buffer.slice(partStart, nextBoundaryIndex);

    if (partBuffer.slice(-2).equals(Buffer.from("\r\n"))) {
      partBuffer = partBuffer.slice(0, -2);
    }

    parts.push(partBuffer);
    cursor = nextBoundaryIndex;
  }

  for (const part of parts) {
    const headerEndIndex = part.indexOf(separatorBuffer);

    if (headerEndIndex === -1) {
      continue;
    }

    const headersText = part.slice(0, headerEndIndex).toString("utf-8");
    const content = part.slice(headerEndIndex + separatorBuffer.length);
    const disposition = headersText.match(/name="([^"]+)"/i);
    const name = disposition ? disposition[1] : "";

    if (!name) {
      continue;
    }

    const fileNameMatch = headersText.match(/filename="([^"]*)"/i);

    if (fileNameMatch && fileNameMatch[1]) {
      const contentTypeMatch = headersText.match(/content-type:\s*([^\r\n]+)/i);

      files.push({
        fieldName: name,
        fileName: path.basename(fileNameMatch[1]),
        mimeType: normalizeText(contentTypeMatch ? contentTypeMatch[1] : ""),
        buffer: content,
      });
      continue;
    }

    fields[name] = content.toString("utf-8");
  }

  return { fields, files };
}

function saveUploadedImage(file) {
  const reportedMimeType = normalizeText(file.mimeType).toLowerCase();
  const detectedImageType = detectImageType(file.buffer);

  if (!detectedImageType) {
    throw createHttpError(400, "ملف الصورة غير صالح أو لا يحتوي على بيانات صورة حقيقية.");
  }

  if (reportedMimeType && detectedImageType.mimeType !== reportedMimeType) {
    throw createHttpError(400, "نوع ملف الصورة لا يطابق محتواه الحقيقي.");
  }

  if (!["image/jpeg", "image/png", "image/webp"].includes(detectedImageType.mimeType)) {
    throw createHttpError(400, "صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WEBP.");
  }

  if (!file.buffer || file.buffer.length === 0) {
    throw createHttpError(400, "تم إرسال ملف صورة فارغ.");
  }

  if (file.buffer.length > MAX_IMAGE_SIZE_BYTES) {
    throw createHttpError(413, "حجم الصورة كبير جدًا. الحد الأقصى هو 5 ميغابايت.");
  }

  const dimensions = getImageDimensions(file.buffer, detectedImageType.mimeType);

  if (!dimensions) {
    throw createHttpError(400, "تعذر قراءة أبعاد الصورة. التقط صورة أوضح ثم حاول مجددًا.");
  }

  if (dimensions.width < MIN_IMAGE_WIDTH || dimensions.height < MIN_IMAGE_HEIGHT) {
    throw createHttpError(
      400,
      `أبعاد الصورة صغيرة جدًا. الحد الأدنى هو ${MIN_IMAGE_WIDTH}x${MIN_IMAGE_HEIGHT} بكسل.`,
    );
  }

  const extension = detectedImageType.extension;
  const fileName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${extension}`;
  const absolutePath = path.join(UPLOADS_DIR, fileName);

  fs.writeFileSync(absolutePath, file.buffer);
  return `/uploads/${fileName}`;
}

function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return {
      mimeType: "image/jpeg",
      extension: ".jpg",
    };
  }

  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return {
      mimeType: "image/png",
      extension: ".png",
    };
  }

  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return {
      mimeType: "image/webp",
      extension: ".webp",
    };
  }

  return null;
}

function getImageDimensions(buffer, mimeType) {
  if (mimeType === "image/png") {
    return getPngDimensions(buffer);
  }

  if (mimeType === "image/jpeg") {
    return getJpegDimensions(buffer);
  }

  if (mimeType === "image/webp") {
    return getWebpDimensions(buffer);
  }

  return null;
}

function getPngDimensions(buffer) {
  if (buffer.length < 24) {
    return null;
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function getJpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (offset < buffer.length && buffer[offset] === 0xff) {
      offset += 1;
    }

    if (offset >= buffer.length) {
      break;
    }

    const marker = buffer[offset];
    offset += 1;

    if (marker === 0xd8 || marker === 0xd9) {
      continue;
    }

    if (marker === 0xda) {
      break;
    }

    if (offset + 1 >= buffer.length) {
      break;
    }

    const segmentLength = buffer.readUInt16BE(offset);

    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      break;
    }

    if (isJpegStartOfFrameMarker(marker)) {
      if (offset + 7 > buffer.length) {
        break;
      }

      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }

    offset += segmentLength;
  }

  return null;
}

function isJpegStartOfFrameMarker(marker) {
  return [
    0xc0,
    0xc1,
    0xc2,
    0xc3,
    0xc5,
    0xc6,
    0xc7,
    0xc9,
    0xca,
    0xcb,
    0xcd,
    0xce,
    0xcf,
  ].includes(marker);
}

function getWebpDimensions(buffer) {
  if (buffer.length < 30) {
    return null;
  }

  const chunkType = buffer.toString("ascii", 12, 16);

  if (chunkType === "VP8X") {
    return {
      width: 1 + buffer[24] + (buffer[25] << 8) + (buffer[26] << 16),
      height: 1 + buffer[27] + (buffer[28] << 8) + (buffer[29] << 16),
    };
  }

  if (chunkType === "VP8 " && buffer.length >= 30) {
    if (buffer[23] !== 0x9d || buffer[24] !== 0x01 || buffer[25] !== 0x2a) {
      return null;
    }

    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }

  if (chunkType === "VP8L" && buffer.length >= 25) {
    if (buffer[20] !== 0x2f) {
      return null;
    }

    const b0 = buffer[21];
    const b1 = buffer[22];
    const b2 = buffer[23];
    const b3 = buffer[24];

    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    };
  }

  return null;
}

function deleteUploadedFile(relativePath) {
  const fileName = path.basename(String(relativePath || "").replace(/^\/uploads\//, ""));

  if (!fileName) {
    return;
  }

  const absolutePath = path.join(UPLOADS_DIR, fileName);

  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedPassword) {
  const [salt, storedHash] = String(storedPassword || "").split(":");

  if (!salt || !storedHash) {
    return false;
  }

  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(storedHash, "hex"));
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function getCourierRatesForCity(city) {
  const normalizedCity = normalizeText(city);
  const exactRates = DELIVERY_RATE_RULES.filter((rate) => rate.city === normalizedCity);

  return exactRates.length
    ? exactRates
    : DELIVERY_RATE_RULES.filter((rate) => rate.city === "محافظات أخرى");
}

function getCourierStatusLabel(status) {
  const labels = {
    pending: "قيد المراجعة",
    approved: "جاهز للعمل",
    paused: "موقوف مؤقتًا",
  };

  return labels[status] || "قيد المراجعة";
}

function getListingApprovalLabel(status) {
  return status === "approved"
    ? "معتمد"
    : "بانتظار موافقة الإدارة";
}

function isTruthy(value) {
  return value === true || value === 1 || value === "1" || value === "true" || value === "on";
}

function serveUploadedFile(res, pathname) {
  const relativePath = pathname.replace(/^\/uploads\//, "");
  const fileName = path.basename(relativePath);
  const absolutePath = path.join(UPLOADS_DIR, fileName);

  if (!fs.existsSync(absolutePath)) {
    res.writeHead(404, buildResponseHeaders({
      "Content-Type": "text/plain; charset=utf-8",
    }));
    res.end("الصورة غير موجودة.");
    return;
  }

  sendFile(res, absolutePath, getContentType(absolutePath), {
    "Cache-Control": "public, max-age=86400, immutable",
  });
}

function sendFile(res, absolutePath, contentType, extraHeaders = {}) {
  fs.readFile(absolutePath, (error, data) => {
    if (error) {
      res.writeHead(500, buildResponseHeaders({
        "Content-Type": "text/plain; charset=utf-8",
      }));
      res.end("تعذر تحميل الملف.");
      return;
    }

    res.writeHead(200, buildResponseHeaders({
      "Content-Type": contentType,
      ...extraHeaders,
    }));
    res.end(data);
  });
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

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, buildResponseHeaders({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  }));
  res.end(JSON.stringify(payload));
}

function buildResponseHeaders(headers = {}) {
  return {
    ...DEFAULT_SECURITY_HEADERS,
    ...headers,
  };
}
