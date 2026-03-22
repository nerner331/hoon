const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");
const { DB_PATH, DATA_DIR, ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD } = require("./config");
const { hashPassword } = require("./utils");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON;");

function initSchema() {
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

    CREATE TABLE IF NOT EXISTS classified_ads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      ad_type TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      city TEXT NOT NULL,
      compensation TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL,
      availability_status TEXT NOT NULL DEFAULT 'open',
      approval_status TEXT NOT NULL DEFAULT 'pending',
      approved_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (member_id) REFERENCES members (id) ON DELETE CASCADE
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

    CREATE TABLE IF NOT EXISTS listing_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id INTEGER NOT NULL,
      image_path TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (listing_id) REFERENCES listings (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      listing_id INTEGER,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      read_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (member_id) REFERENCES members (id) ON DELETE CASCADE,
      FOREIGN KEY (listing_id) REFERENCES listings (id) ON DELETE SET NULL
    );
  `);

  ensureMigrations();
  bootstrapAdminAccount();

  // Create indexes for better performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);
    CREATE INDEX IF NOT EXISTS idx_listings_member_id ON listings(member_id);
    CREATE INDEX IF NOT EXISTS idx_listings_approval ON listings(approval_status);
    CREATE INDEX IF NOT EXISTS idx_listings_created ON listings(created_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_member_id ON sessions(member_id);
    CREATE INDEX IF NOT EXISTS idx_couriers_email ON couriers(email);
    CREATE INDEX IF NOT EXISTS idx_classified_ads_member_id ON classified_ads(member_id);
    CREATE INDEX IF NOT EXISTS idx_classified_ads_approval ON classified_ads(approval_status);
    CREATE INDEX IF NOT EXISTS idx_notifications_member_id ON notifications(member_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
    CREATE INDEX IF NOT EXISTS idx_favorites_member_id ON favorites(member_id);
  `);
}

function ensureMigrations() {
  ensureColumn("listings", "image_path", "TEXT");
  ensureColumn("listings", "admin_highlight", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("listings", "approval_status", "TEXT NOT NULL DEFAULT 'pending'");
  ensureColumn("listings", "approved_at", "TEXT");
  ensureColumn("members", "is_banned", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("members", "banned_at", "TEXT");
  ensureColumn("admins", "can_manage_listings", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("admins", "can_ban_members", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("admin_sessions", "admin_id", "INTEGER");
}

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some(c => c.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function bootstrapAdminAccount() {
  const adminsCount = Number(db.prepare("SELECT COUNT(*) AS count FROM admins").get().count);
  if (adminsCount === 0) {
    db.prepare(`
      INSERT INTO admins (full_name, username, email, password_hash, role_label, can_manage_admins, can_manage_couriers, can_view_courier_documents, can_manage_listings, can_ban_members)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run("الإدارة الرئيسية", ADMIN_USERNAME, ADMIN_EMAIL, hashPassword(ADMIN_PASSWORD), "مدير عام", 1, 1, 1, 1, 1);
  }
}

// Pagination helper
function getPaginatedQuery(query, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  return {
    data: db.prepare(query + " LIMIT ? OFFSET ?").all(limit, offset),
    totalQuery: query.replace(/SELECT .+ FROM/, "SELECT COUNT(*) AS total FROM"),
    page,
    limit
  };
}

function getPaginationInfo(totalQuery, page, limit) {
  const result = db.prepare(totalQuery).get();
  const total = Number(result?.total || 0);
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
}

module.exports = {
  db,
  initSchema,
  getPaginatedQuery,
  getPaginationInfo
};
