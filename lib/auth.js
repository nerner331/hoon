const { db } = require("./database");
const { generateToken } = require("./utils");
const { ADMIN_PANEL_HEADER, ADMIN_PANEL_PATH, normalizeAdminPanelPath } = require("./config");

function hasAdminPanelAccess(req) {
  const requestPanelPath = normalizeAdminPanelPath(req.headers[ADMIN_PANEL_HEADER] || "");
  const activeAdminPath = ADMIN_PANEL_PATH || "/admin.html";
  return requestPanelPath === activeAdminPath;
}

function buildSessionExpiry() {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
}

function createSession(memberId) {
  const token = generateToken();
  const expiresAt = buildSessionExpiry();
  db.prepare("INSERT INTO sessions (token, member_id, expires_at) VALUES (?, ?, ?)").run(token, memberId, expiresAt);
  return { token, expiresAt };
}

function createCourierSession(courierId) {
  const token = generateToken();
  const expiresAt = buildSessionExpiry();
  db.prepare("INSERT INTO courier_sessions (token, courier_id, expires_at) VALUES (?, ?, ?)").run(token, courierId, expiresAt);
  return { token, expiresAt };
}

function createAdminSession(admin) {
  const token = generateToken();
  const expiresAt = buildSessionExpiry();
  db.prepare("INSERT INTO admin_sessions (token, username, admin_id, expires_at) VALUES (?, ?, ?, ?)").run(
    token,
    admin.username,
    admin.id,
    expiresAt
  );
  return { token, expiresAt };
}

function getSession(req) {
  const authorization = req.headers.authorization || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) return null;

  const session = db.prepare("SELECT token, member_id AS memberId, expires_at AS expiresAt FROM sessions WHERE token = ?").get(token);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }

  const member = db.prepare("SELECT is_banned AS isBanned FROM members WHERE id = ?").get(session.memberId);
  if (!member || Number(member.isBanned) === 1) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }
  return session;
}

function getCourierSession(req) {
  const authorization = req.headers.authorization || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) return null;

  const session = db.prepare("SELECT token, courier_id AS courierId, expires_at AS expiresAt FROM courier_sessions WHERE token = ?").get(token);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    db.prepare("DELETE FROM courier_sessions WHERE token = ?").run(token);
    return null;
  }
  return session;
}

function getAdminSession(req) {
  const authorization = req.headers.authorization || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) return null;

  const session = db.prepare("SELECT token, admin_id AS adminId, username, expires_at AS expiresAt FROM admin_sessions WHERE token = ?").get(token);
  if (!session) return null;
  if (!session.adminId) {
    db.prepare("DELETE FROM admin_sessions WHERE token = ?").run(token);
    return null;
  }
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    db.prepare("DELETE FROM admin_sessions WHERE token = ?").run(token);
    return null;
  }
  return session;
}

module.exports = {
  hasAdminPanelAccess,
  createSession,
  createCourierSession,
  createAdminSession,
  getSession,
  getCourierSession,
  getAdminSession
};
