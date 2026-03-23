const fs = require("node:fs");
const path = require("node:path");
const { db } = require("./database");
const {
  sendJson,
  readJsonBody,
  normalizeText,
  normalizeEmail,
  verifyPassword,
  hashPassword,
  containsBlockedPhoneNumber,
} = require("./utils");
const {
  createSession,
  createCourierSession,
  createAdminSession,
  getSession,
  getCourierSession,
  getAdminSession,
  hasAdminPanelAccess,
} = require("./auth");
const { readMultipartFormData, saveUploadedImage } = require("./multipart");
const {
  DELIVERY_RATE_RULES,
  MAX_MULTIPART_BODY_BYTES,
  MAX_LISTING_IMAGES,
  MAX_LISTING_DESCRIPTION_LENGTH,
  UPLOADS_DIR,
} = require("./config");

const CLASSIFIED_AD_TYPE_LABELS = Object.freeze({
  service_request: "طلب خدمة",
  job_opening: "وظيفة شاغرة",
  job_seeker: "باحث عن عمل",
  office_service: "مكتب أو خدمة توظيف",
});

const CLASSIFIED_AVAILABILITY_LABELS = Object.freeze({
  open: "مفتوح",
  closed: "مغلق",
});

const LISTING_RETENTION_DAYS = 30;
const LISTING_RETENTION_MS = LISTING_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const EXPIRED_LISTING_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
let lastExpiredListingCleanupAt = 0;

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  if (String(password || "").length < 6) {
    return { valid: false, error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل." };
  }
  return { valid: true };
}

function validatePhone(phone) {
  if (!/^[0-9\s+\-()]*$/.test(String(phone || ""))) {
    return { valid: false, error: "رقم الهاتف يحتوي على أحرف غير صالحة." };
  }
  return { valid: true };
}

function isTruthy(value) {
  return value === true || value === 1 || value === "1" || value === "true" || value === "on";
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

  runExpiredListingCleanup();

  if (req.method === "GET" && pathname === "/api/stats") {
    sendJson(res, 200, getStats());
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
        id: Number(member.id),
        fullName: member.fullName,
        city: member.city,
        createdAt: member.createdAt,
        listingsCount: Number(member.listingsCount),
      })),
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/listings") {
    const { page, limit } = getPagination(req);
    const { rows, total } = getPublicListingsPage(page, limit);
    sendJson(res, 200, {
      listings: rows.map(mapListingRow),
      pagination: buildPagination(page, limit, total),
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/classifieds") {
    const { page, limit } = getPagination(req);
    const { rows, total } = getPublicClassifiedsPage(page, limit);
    sendJson(res, 200, {
      classifieds: rows.map(mapClassifiedRow),
      pagination: buildPagination(page, limit, total),
    });
    return;
  }

  if (req.method === "GET" && (pathname === "/api/admin/dashboard" || pathname === "/api/admin/couriers")) {
    const adminContext = getCurrentAdminContext(req, res);
    if (!adminContext) return;

    sendJson(res, 200, buildAdminDashboardPayload(adminContext.admin));
    return;
  }

  if (req.method === "GET" && pathname === "/api/me") {
    const session = getSession(req);
    if (!session) {
      sendJson(res, 401, { error: "يجب تسجيل الدخول أولًا." });
      return;
    }

    sendJson(res, 200, {
      member: getPublicMember(session.memberId),
      summary: getAccountSummary(session.memberId),
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/couriers/me") {
    const session = getCourierSession(req);
    if (!session) {
      sendJson(res, 401, { error: "يجب تسجيل دخول المندوب أولًا." });
      return;
    }

    const courier = getPublicCourier(session.courierId);
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

    if (!validateEmail(email)) {
      sendJson(res, 400, { error: "البريد الإلكتروني غير صحيح." });
      return;
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      sendJson(res, 400, { error: passwordValidation.error });
      return;
    }

    const phoneValidation = validatePhone(phone);
    if (!phoneValidation.valid) {
      sendJson(res, 400, { error: phoneValidation.error });
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
      sendJson(res, 403, { error: "هذا الحساب محظور حاليًا." });
      return;
    }

    const session = createSession(Number(member.id));
    sendJson(res, 200, {
      message: "تم تسجيل الدخول بنجاح.",
      token: session.token,
      member: getPublicMember(Number(member.id)),
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

    if (email && !validateEmail(email)) {
      sendJson(res, 400, { error: "البريد الإلكتروني غير صحيح." });
      return;
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      sendJson(res, 400, { error: passwordValidation.error });
      return;
    }

    const phoneValidation = validatePhone(phone);
    if (!phoneValidation.valid) {
      sendJson(res, 400, { error: phoneValidation.error });
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

    let identityImagePath = "";
    let livePhotoPath = "";

    try {
      identityImagePath = saveUploadedImage(identityImage);
      livePhotoPath = saveUploadedImage(livePhoto);

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
          password_hash
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        fullName,
        email,
        phone,
        city,
        vehicleType,
        coverageCities,
        nationalIdNumber,
        identityImagePath,
        livePhotoPath,
        hashPassword(password)
      );

      const courierId = Number(result.lastInsertRowid);
      const session = createCourierSession(courierId);
      const courier = getPublicCourier(courierId);

      sendJson(res, 201, {
        message: "تم تقديم طلب الانضمام بنجاح وهو قيد المراجعة.",
        token: session.token,
        courier,
        rates: getCourierRatesForCity(courier.city),
      });
      return;
    } catch (error) {
      deleteUploadedFile(identityImagePath);
      deleteUploadedFile(livePhotoPath);
      throw error;
    }
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

    const session = createCourierSession(Number(courier.id));
    const publicCourier = getPublicCourier(Number(courier.id));

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

    const publicAdmin = getPublicAdmin(Number(admin.id));
    const session = createAdminSession(publicAdmin);

    sendJson(res, 200, {
      message: "تم تسجيل دخول الإدارة بنجاح.",
      token: session.token,
      ...buildAdminDashboardPayload(publicAdmin),
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/managers") {
    const adminContext = getCurrentAdminContext(req, res);
    if (!adminContext) return;

    const { admin } = adminContext;
    if (!admin.canManageAdmins) {
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

    if (!validateEmail(email)) {
      sendJson(res, 400, { error: "البريد الإلكتروني غير صحيح." });
      return;
    }

    const managerPasswordValidation = validatePassword(password);
    if (!managerPasswordValidation.valid) {
      sendJson(res, 400, { error: managerPasswordValidation.error });
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
      canBanMembers
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

    sendJson(res, 200, { message: "تم تسجيل خروج الإدارة." });
    return;
  }

  const adminCourierStatusMatch = pathname.match(/^\/api\/admin\/couriers\/(\d+)\/status$/);
  if (req.method === "POST" && adminCourierStatusMatch) {
    const adminContext = getCurrentAdminContext(req, res);
    if (!adminContext) return;

    const { admin } = adminContext;
    if (!admin.canManageCouriers && !admin.canManageAdmins) {
      sendJson(res, 403, { error: "ليس لديك صلاحية لتحديث حالات المندوبين." });
      return;
    }

    const courierId = Number(adminCourierStatusMatch[1]);
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
    const adminContext = getCurrentAdminContext(req, res);
    if (!adminContext) return;

    const { admin } = adminContext;
    if (!admin.canManageListings && !admin.canManageAdmins) {
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
      sendJson(res, 400, { error: "اعتمد الإعلان أولًا قبل تمييزه." });
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
    const adminContext = getCurrentAdminContext(req, res);
    if (!adminContext) return;

    const { admin } = adminContext;
    if (!admin.canManageListings && !admin.canManageAdmins) {
      sendJson(res, 403, { error: "ليس لديك صلاحية لاعتماد الإعلانات." });
      return;
    }

    const listingId = Number(adminListingApprovalMatch[1]);
    const listing = db.prepare(`
      SELECT id, member_id AS memberId, title, approval_status AS approvalStatus
      FROM listings
      WHERE id = ?
    `).get(listingId);

    if (!listing) {
      sendJson(res, 404, { error: "الإعلان غير موجود." });
      return;
    }

    if (listing.approvalStatus === "approved") {
      sendJson(res, 200, {
        message: "الإعلان معتمد مسبقًا.",
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

    createNotification(
      Number(listing.memberId),
      "listing-approved",
      "تم اعتماد الإعلان",
      `تمت مراجعة إعلانك "${listing.title}" وأصبح ظاهرًا الآن داخل المنصة لمدة 30 يومًا قبل الحذف التلقائي.`,
      listingId
    );

    sendJson(res, 200, {
      message: "تم اعتماد الإعلان وأصبح ظاهرًا للزوار لمدة 30 يومًا.",
      listing: getAdminListingById(listingId, admin),
      listings: getAdminListings(admin),
      stats: getAdminStats(),
    });
    return;
  }

  const adminListingImageMatch = pathname.match(/^\/api\/admin\/listings\/(\d+)\/remove-image$/);
  if (req.method === "POST" && adminListingImageMatch) {
    const adminContext = getCurrentAdminContext(req, res);
    if (!adminContext) return;

    const { admin } = adminContext;
    if (!admin.canManageListings && !admin.canManageAdmins) {
      sendJson(res, 403, { error: "ليس لديك صلاحية لحذف صور الإعلانات." });
      return;
    }

    const listingId = Number(adminListingImageMatch[1]);
    const listing = db.prepare("SELECT id FROM listings WHERE id = ?").get(listingId);
    if (!listing) {
      sendJson(res, 404, { error: "الإعلان غير موجود." });
      return;
    }

    const removed = removePrimaryListingImage(listingId);
    if (!removed) {
      sendJson(res, 400, { error: "لا توجد صور مرفقة بهذا الإعلان." });
      return;
    }

    sendJson(res, 200, {
      message: "تم حذف الصورة الرئيسية من الإعلان.",
      listing: getAdminListingById(listingId, admin),
      listings: getAdminListings(admin),
      stats: getAdminStats(),
    });
    return;
  }

  const adminListingDeleteMatch = pathname.match(/^\/api\/admin\/listings\/(\d+)$/);
  if (req.method === "DELETE" && adminListingDeleteMatch) {
    const adminContext = getCurrentAdminContext(req, res);
    if (!adminContext) return;

    const { admin } = adminContext;
    if (!admin.canManageListings && !admin.canManageAdmins) {
      sendJson(res, 403, { error: "ليس لديك صلاحية لحذف الإعلانات." });
      return;
    }

    const listingId = Number(adminListingDeleteMatch[1]);
    const listing = db.prepare("SELECT id FROM listings WHERE id = ?").get(listingId);
    if (!listing) {
      sendJson(res, 404, { error: "الإعلان غير موجود." });
      return;
    }

    deleteAllListingImages(listingId);
    db.prepare("DELETE FROM listings WHERE id = ?").run(listingId);

    sendJson(res, 200, {
      message: "تم حذف الإعلان.",
      listings: getAdminListings(admin),
      members: admin.canBanMembers || admin.canManageAdmins ? getAdminMembers(admin) : [],
      classifieds: admin.canManageListings || admin.canManageAdmins || admin.canBanMembers ? getAdminClassifieds(admin) : [],
      stats: getAdminStats(),
    });
    return;
  }

  const adminClassifiedApprovalMatch = pathname.match(/^\/api\/admin\/classifieds\/(\d+)\/approve$/);
  if (req.method === "POST" && adminClassifiedApprovalMatch) {
    const adminContext = getCurrentAdminContext(req, res);
    if (!adminContext) return;

    const { admin } = adminContext;
    if (!admin.canManageListings && !admin.canManageAdmins) {
      sendJson(res, 403, { error: "ليس لديك صلاحية لاعتماد الإعلانات المبوبة." });
      return;
    }

    const classifiedId = Number(adminClassifiedApprovalMatch[1]);
    const classified = db.prepare(`
      SELECT id, member_id AS memberId, title, approval_status AS approvalStatus
      FROM classified_ads
      WHERE id = ?
    `).get(classifiedId);

    if (!classified) {
      sendJson(res, 404, { error: "الإعلان المبوب غير موجود." });
      return;
    }

    if (classified.approvalStatus === "approved") {
      sendJson(res, 200, {
        message: "الإعلان المبوب معتمد مسبقًا.",
        classifieds: getAdminClassifieds(admin),
        stats: getAdminStats(),
      });
      return;
    }

    db.prepare(`
      UPDATE classified_ads
      SET approval_status = 'approved', approved_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), classifiedId);

    createNotification(
      Number(classified.memberId),
      "classified-approved",
      "تم اعتماد الإعلان المبوب",
      `تمت مراجعة إعلانك المبوب "${classified.title}" وأصبح منشورًا الآن داخل المنصة.`,
      null
    );

    sendJson(res, 200, {
      message: "تم اعتماد الإعلان المبوب.",
      classifieds: getAdminClassifieds(admin),
      stats: getAdminStats(),
    });
    return;
  }

  const adminClassifiedStatusMatch = pathname.match(/^\/api\/admin\/classifieds\/(\d+)\/status$/);
  if (req.method === "POST" && adminClassifiedStatusMatch) {
    const adminContext = getCurrentAdminContext(req, res);
    if (!adminContext) return;

    const { admin } = adminContext;
    if (!admin.canManageListings && !admin.canManageAdmins) {
      sendJson(res, 403, { error: "ليس لديك صلاحية لتحديث حالة الإعلانات المبوبة." });
      return;
    }

    const classifiedId = Number(adminClassifiedStatusMatch[1]);
    const body = await readJsonBody(req);
    const availabilityStatus = normalizeText(body.availabilityStatus);
    const allowedStatuses = new Set(["open", "closed"]);

    if (!allowedStatuses.has(availabilityStatus)) {
      sendJson(res, 400, { error: "حالة الإعلان المبوب غير صالحة." });
      return;
    }

    const classified = db.prepare(`
      SELECT id, member_id AS memberId, title
      FROM classified_ads
      WHERE id = ?
    `).get(classifiedId);

    if (!classified) {
      sendJson(res, 404, { error: "الإعلان المبوب غير موجود." });
      return;
    }

    db.prepare(`
      UPDATE classified_ads
      SET availability_status = ?
      WHERE id = ?
    `).run(availabilityStatus, classifiedId);

    createNotification(
      Number(classified.memberId),
      "classified-status",
      availabilityStatus === "open" ? "تم فتح الإعلان المبوب" : "تم إغلاق الإعلان المبوب",
      availabilityStatus === "open"
        ? `تم فتح إعلانك المبوب "${classified.title}" من جديد.`
        : `تم إغلاق إعلانك المبوب "${classified.title}" حاليًا.`,
      null
    );

    sendJson(res, 200, {
      message: availabilityStatus === "open" ? "تم فتح الإعلان المبوب." : "تم إغلاق الإعلان المبوب.",
      classifieds: getAdminClassifieds(admin),
      stats: getAdminStats(),
    });
    return;
  }

  const adminClassifiedDeleteMatch = pathname.match(/^\/api\/admin\/classifieds\/(\d+)$/);
  if (req.method === "DELETE" && adminClassifiedDeleteMatch) {
    const adminContext = getCurrentAdminContext(req, res);
    if (!adminContext) return;

    const { admin } = adminContext;
    if (!admin.canManageListings && !admin.canManageAdmins) {
      sendJson(res, 403, { error: "ليس لديك صلاحية لحذف الإعلانات المبوبة." });
      return;
    }

    const classifiedId = Number(adminClassifiedDeleteMatch[1]);
    const classified = db.prepare("SELECT id FROM classified_ads WHERE id = ?").get(classifiedId);
    if (!classified) {
      sendJson(res, 404, { error: "الإعلان المبوب غير موجود." });
      return;
    }

    db.prepare("DELETE FROM classified_ads WHERE id = ?").run(classifiedId);

    sendJson(res, 200, {
      message: "تم حذف الإعلان المبوب.",
      classifieds: getAdminClassifieds(admin),
      stats: getAdminStats(),
    });
    return;
  }

  const adminMemberBanMatch = pathname.match(/^\/api\/admin\/members\/(\d+)\/ban$/);
  if (req.method === "POST" && adminMemberBanMatch) {
    const adminContext = getCurrentAdminContext(req, res);
    if (!adminContext) return;

    const { admin } = adminContext;
    if (!admin.canBanMembers && !admin.canManageAdmins) {
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
      classifieds: admin.canManageListings || admin.canManageAdmins || admin.canBanMembers ? getAdminClassifieds(admin) : [],
      stats: getAdminStats(),
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/favorites") {
    const session = getSession(req);
    if (!session) {
      sendJson(res, 401, { error: "يجب تسجيل الدخول أولًا." });
      return;
    }

    const { page, limit } = getPagination(req);
    const { rows, total } = getFavoriteListingsPage(session.memberId, page, limit);
    sendJson(res, 200, {
      listings: rows.map(mapListingRow),
      favoriteListingIds: rows.map((row) => Number(row.id)),
      summary: getAccountSummary(session.memberId),
      pagination: buildPagination(page, limit, total),
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

    if (listing.approvalStatus !== "approved" || Number(listing.sellerIsBanned) === 1) {
      sendJson(res, 400, { error: "لا يمكن حفظ إعلان غير معتمد أو محظور." });
      return;
    }

    if (Number(listing.memberId) === Number(session.memberId)) {
      sendJson(res, 400, { error: "لا يمكن إضافة إعلانك الشخصي إلى المفضلة." });
      return;
    }

    const existingFavorite = db.prepare(`
      SELECT listing_id AS listingId
      FROM favorites
      WHERE member_id = ? AND listing_id = ?
    `).get(session.memberId, listingId);

    let saved = false;
    if (existingFavorite) {
      db.prepare("DELETE FROM favorites WHERE member_id = ? AND listing_id = ?").run(session.memberId, listingId);
    } else {
      db.prepare("INSERT INTO favorites (member_id, listing_id) VALUES (?, ?)").run(session.memberId, listingId);
      saved = true;
    }

    sendJson(res, 200, {
      saved,
      summary: getAccountSummary(session.memberId),
    });
    return;
  }

  const favoriteDeleteMatch = pathname.match(/^\/api\/favorites\/(\d+)$/);
  if (req.method === "DELETE" && favoriteDeleteMatch) {
    const session = getSession(req);
    if (!session) {
      sendJson(res, 401, { error: "يجب تسجيل الدخول أولًا." });
      return;
    }

    const listingId = Number(favoriteDeleteMatch[1]);
    db.prepare("DELETE FROM favorites WHERE member_id = ? AND listing_id = ?").run(session.memberId, listingId);

    sendJson(res, 200, {
      message: "تمت إزالة الإعلان من المفضلة.",
      summary: getAccountSummary(session.memberId),
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/notifications") {
    const session = getSession(req);
    if (!session) {
      sendJson(res, 401, { error: "يجب تسجيل الدخول أولًا." });
      return;
    }

    const notifications = db.prepare(`
      SELECT
        id,
        member_id AS memberId,
        listing_id AS listingId,
        type,
        title,
        message,
        is_read AS isRead,
        read_at AS readAt,
        created_at AS createdAt
      FROM notifications
      WHERE member_id = ?
      ORDER BY created_at DESC
    `).all(session.memberId).map((row) => ({
      id: Number(row.id),
      memberId: Number(row.memberId),
      listingId: row.listingId ? Number(row.listingId) : null,
      type: row.type,
      title: row.title,
      message: row.message,
      isRead: Boolean(row.isRead),
      readAt: row.readAt || "",
      createdAt: row.createdAt,
    }));

    sendJson(res, 200, {
      notifications,
      unreadCount: notifications.filter((notification) => !notification.isRead).length,
    });
    return;
  }

  const notificationMatch = pathname.match(/^\/api\/notifications\/(\d+)$/);
  if (req.method === "PUT" && notificationMatch) {
    const session = getSession(req);
    if (!session) {
      sendJson(res, 401, { error: "يجب تسجيل الدخول أولًا." });
      return;
    }

    const notificationId = Number(notificationMatch[1]);
    const existingNotification = db.prepare(`
      SELECT id
      FROM notifications
      WHERE id = ? AND member_id = ?
    `).get(notificationId, session.memberId);

    if (!existingNotification) {
      sendJson(res, 404, { error: "الإشعار غير موجود." });
      return;
    }

    db.prepare(`
      UPDATE notifications
      SET is_read = 1, read_at = ?
      WHERE id = ? AND member_id = ?
    `).run(new Date().toISOString(), notificationId, session.memberId);

    sendJson(res, 200, { message: "تم تحديث الإشعار." });
    return;
  }

  if (req.method === "DELETE" && pathname === "/api/notifications") {
    const session = getSession(req);
    if (!session) {
      sendJson(res, 401, { error: "يجب تسجيل الدخول أولًا." });
      return;
    }

    db.prepare("DELETE FROM notifications WHERE member_id = ?").run(session.memberId);
    sendJson(res, 200, { message: "تم حذف جميع الإشعارات." });
    return;
  }

  if (req.method === "DELETE" && notificationMatch) {
    const session = getSession(req);
    if (!session) {
      sendJson(res, 401, { error: "يجب تسجيل الدخول أولًا." });
      return;
    }

    const notificationId = Number(notificationMatch[1]);
    db.prepare("DELETE FROM notifications WHERE id = ? AND member_id = ?").run(notificationId, session.memberId);
    sendJson(res, 200, { message: "تم حذف الإشعار." });
    return;
  }

  if (req.method === "POST" && pathname === "/api/classifieds") {
    const session = getSession(req);
    if (!session) {
      sendJson(res, 401, { error: "يجب تسجيل الدخول قبل نشر إعلان مبوب." });
      return;
    }

    const body = await readJsonBody(req);
    const adType = normalizeText(body.adType);
    const category = normalizeText(body.category);
    const title = normalizeText(body.title);
    const city = normalizeText(body.city);
    const compensation = normalizeText(body.compensation);
    const description = normalizeText(body.description);
    const allowedAdTypes = new Set(Object.keys(CLASSIFIED_AD_TYPE_LABELS));

    if (!adType || !category || !title || !city || !description) {
      sendJson(res, 400, { error: "بيانات الإعلان المبوب غير مكتملة." });
      return;
    }

    if (!allowedAdTypes.has(adType)) {
      sendJson(res, 400, { error: "نوع الإعلان المبوب غير صالح." });
      return;
    }

    if (containsBlockedPhoneNumber([title, description, compensation].filter(Boolean).join(" "))) {
      sendJson(res, 400, { error: "يُمنع إدراج أرقام الهاتف أو وسائل التواصل داخل الإعلان المبوب." });
      return;
    }

    const result = db.prepare(`
      INSERT INTO classified_ads (
        member_id,
        ad_type,
        category,
        title,
        city,
        compensation,
        description,
        availability_status,
        approval_status,
        approved_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'open', 'pending', NULL)
    `).run(
      session.memberId,
      adType,
      category,
      title,
      city,
      compensation,
      description
    );

    sendJson(res, 201, {
      message: "تم استلام الإعلان المبوب وهو الآن بانتظار مراجعة الإدارة.",
      classified: getClassifiedById(Number(result.lastInsertRowid)),
    });
    return;
  }

  if (req.method === "POST" && (pathname === "/api/listings" || pathname === "/api/listings/create")) {
    const session = getSession(req);
    if (!session) {
      sendJson(res, 401, { error: "يجب تسجيل الدخول قبل نشر أي إعلان." });
      return;
    }

    const contentType = req.headers["content-type"] || "";
    if (!contentType.includes("multipart/form-data")) {
      sendJson(res, 400, { error: "يجب إرسال الإعلان مع صور مرفقة." });
      return;
    }

    const multipart = await readMultipartFormData(req, contentType, MAX_MULTIPART_BODY_BYTES);
    const body = multipart.fields;
    const uploadedImages = multipart.files.filter((file) => file.fieldName === "images");
    const fallbackImage = multipart.files.find((file) => file.fieldName === "image");
    const files = uploadedImages.length ? uploadedImages : (fallbackImage ? [fallbackImage] : []);

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

    if (description.length > MAX_LISTING_DESCRIPTION_LENGTH) {
      sendJson(res, 400, { error: `وصف الإعلان يجب ألا يتجاوز ${MAX_LISTING_DESCRIPTION_LENGTH} حرف.` });
      return;
    }

    if (containsBlockedPhoneNumber([title, description].join(" "))) {
      sendJson(res, 400, { error: "يُمنع إدراج أرقام الهاتف أو وسائل التواصل داخل الإعلان." });
      return;
    }

    if (!files.length) {
      sendJson(res, 400, { error: "يجب رفع صورة واحدة على الأقل للإعلان." });
      return;
    }

    if (files.length > MAX_LISTING_IMAGES) {
      sendJson(res, 400, { error: `يمكن رفع ${MAX_LISTING_IMAGES} صور كحد أقصى لكل إعلان.` });
      return;
    }

    if (imageSourceType && imageSourceType !== "camera") {
      sendJson(res, 400, { error: "يجب التقاط الصور مباشرة من الكاميرا." });
      return;
    }

    const savedImagePaths = [];

    try {
      for (const file of files) {
        savedImagePaths.push(saveUploadedImage(file));
      }

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
        VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?)
      `).run(
        session.memberId,
        title,
        Math.round(price),
        city,
        category,
        description,
        isFeatured,
        savedImagePaths[0] || null
      );

      const listingId = Number(result.lastInsertRowid);
      const insertImageStatement = db.prepare(`
        INSERT INTO listing_images (listing_id, image_path, sort_order)
        VALUES (?, ?, ?)
      `);

      savedImagePaths.forEach((imagePath, index) => {
        insertImageStatement.run(listingId, imagePath, index);
      });

      syncPrimaryListingImage(listingId);

      sendJson(res, 201, {
        message: isFeatured
          ? "تم إرسال الإعلان وطلب تمييزه، وهو الآن بانتظار مراجعة الإدارة. بعد اعتماده سيبقى ظاهرًا لمدة 30 يومًا ثم يُحذف تلقائيًا مع صوره."
          : "تم إرسال الإعلان بنجاح وهو الآن بانتظار مراجعة الإدارة. بعد اعتماده سيبقى ظاهرًا لمدة 30 يومًا ثم يُحذف تلقائيًا مع صوره.",
        listing: getListingById(listingId),
      });
      return;
    } catch (error) {
      savedImagePaths.forEach(deleteUploadedFile);
      throw error;
    }
  }

  if (req.method === "GET" && pathname === "/api/listings/search") {
    const requestUrl = new URL(req.url, "http://localhost");
    const query = normalizeText(requestUrl.searchParams.get("q"));

    if (!query) {
      sendJson(res, 200, { listings: getListings() });
      return;
    }

    const normalizedQuery = `%${query.toLowerCase()}%`;
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
      WHERE l.approval_status = 'approved'
        AND m.is_banned = 0
        AND (
          LOWER(l.title) LIKE ?
          OR LOWER(l.description) LIKE ?
          OR LOWER(l.city) LIKE ?
          OR LOWER(l.category) LIKE ?
          OR LOWER(m.full_name) LIKE ?
        )
      ORDER BY l.admin_highlight DESC, l.is_featured DESC, l.created_at DESC
    `).all(normalizedQuery, normalizedQuery, normalizedQuery, normalizedQuery, normalizedQuery);

    sendJson(res, 200, { listings: rows.map(mapListingRow) });
    return;
  }

  const listingDetailMatch = pathname.match(/^\/api\/listings\/(\d+)$/);
  if (req.method === "GET" && listingDetailMatch) {
    const listingId = Number(listingDetailMatch[1]);
    const listing = getListingById(listingId);

    if (!listing) {
      sendJson(res, 404, { error: "الإعلان غير موجود." });
      return;
    }

    const memberSession = getSession(req);
    const adminSession = getAdminSession(req);
    const canViewHidden = Boolean(
      adminSession
      || (memberSession && Number(memberSession.memberId) === Number(listing.sellerId))
    );

    if (!listing.isApproved && !canViewHidden) {
      sendJson(res, 404, { error: "الإعلان غير موجود." });
      return;
    }

    sendJson(res, 200, { listing });
    return;
  }

  const classifiedDetailMatch = pathname.match(/^\/api\/classifieds\/(\d+)$/);
  if (req.method === "GET" && classifiedDetailMatch) {
    const classifiedId = Number(classifiedDetailMatch[1]);
    const classified = getClassifiedById(classifiedId);

    if (!classified) {
      sendJson(res, 404, { error: "الإعلان المبوب غير موجود." });
      return;
    }

    const memberSession = getSession(req);
    const adminSession = getAdminSession(req);
    const canViewHidden = Boolean(
      adminSession
      || (memberSession && Number(memberSession.memberId) === Number(classified.memberId))
    );

    if (!classified.isApproved && !canViewHidden) {
      sendJson(res, 404, { error: "الإعلان المبوب غير موجود." });
      return;
    }

    sendJson(res, 200, { classified });
    return;
  }

  sendJson(res, 404, { error: "المسار المطلوب غير موجود." });
}

function getCurrentAdminContext(req, res) {
  const session = getAdminSession(req);
  if (!session) {
    sendJson(res, 401, { error: "يجب تسجيل دخول الإدارة أولًا." });
    return null;
  }

  const admin = getPublicAdmin(session.adminId);
  if (!admin) {
    sendJson(res, 401, { error: "تعذر العثور على حساب الإدارة." });
    return null;
  }

  return { session, admin };
}

function getPagination(req, defaultLimit = 24, maxLimit = 60) {
  const requestUrl = new URL(req.url, "http://localhost");
  const page = Math.max(1, Number(requestUrl.searchParams.get("page")) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number(requestUrl.searchParams.get("limit")) || defaultLimit));
  return { page, limit };
}

function buildPagination(page, limit, total) {
  const totalItems = Number(total || 0);
  const totalPages = totalItems === 0 ? 1 : Math.ceil(totalItems / limit);

  return {
    page,
    limit,
    total: totalItems,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
  };
}

function getStats() {
  const totalMembers = Number(db.prepare("SELECT COUNT(*) AS count FROM members").get().count);
  const totalListings = Number(db.prepare(`
    SELECT COUNT(*) AS count
    FROM listings l
    INNER JOIN members m ON m.id = l.member_id
    WHERE l.approval_status = 'approved' AND m.is_banned = 0
  `).get().count);
  const featuredListings = Number(db.prepare(`
    SELECT COUNT(*) AS count
    FROM listings l
    INNER JOIN members m ON m.id = l.member_id
    WHERE l.approval_status = 'approved'
      AND m.is_banned = 0
      AND (l.is_featured = 1 OR l.admin_highlight = 1)
  `).get().count);
  const totalCities = Number(db.prepare(`
    SELECT COUNT(DISTINCT l.city) AS count
    FROM listings l
    INNER JOIN members m ON m.id = l.member_id
    WHERE l.approval_status = 'approved' AND m.is_banned = 0
  `).get().count);

  return {
    totalMembers,
    totalListings,
    featuredListings,
    totalCities,
  };
}

function runExpiredListingCleanup(force = false) {
  const now = Date.now();
  if (!force && now - lastExpiredListingCleanupAt < EXPIRED_LISTING_CLEANUP_INTERVAL_MS) {
    return 0;
  }

  lastExpiredListingCleanupAt = now;
  return cleanupExpiredListings(now);
}

function cleanupExpiredListings(referenceTime = Date.now()) {
  const cutoffIso = new Date(referenceTime - LISTING_RETENTION_MS).toISOString();
  const expiredRows = db.prepare(`
    SELECT id
    FROM listings
    WHERE julianday(COALESCE(approved_at, created_at)) <= julianday(?)
    ORDER BY COALESCE(approved_at, created_at) ASC
  `).all(cutoffIso);

  if (!expiredRows.length) {
    return 0;
  }

  const deleteListingStatement = db.prepare("DELETE FROM listings WHERE id = ?");

  expiredRows.forEach((row) => {
    const listingId = Number(row.id);
    deleteAllListingImages(listingId);
    deleteListingStatement.run(listingId);
  });

  return expiredRows.length;
}

function getAdminStats() {
  return {
    totalManagers: Number(db.prepare("SELECT COUNT(*) AS count FROM admins").get().count),
    pendingCouriers: Number(db.prepare("SELECT COUNT(*) AS count FROM couriers WHERE status = 'pending'").get().count),
    approvedCouriers: Number(db.prepare("SELECT COUNT(*) AS count FROM couriers WHERE status = 'approved'").get().count),
    pausedCouriers: Number(db.prepare("SELECT COUNT(*) AS count FROM couriers WHERE status = 'paused'").get().count),
    pendingListings: Number(db.prepare("SELECT COUNT(*) AS count FROM listings WHERE approval_status = 'pending'").get().count),
    highlightedListings: Number(db.prepare(`
      SELECT COUNT(*) AS count
      FROM listings
      WHERE approval_status = 'approved' AND admin_highlight = 1
    `).get().count),
    pendingClassifieds: Number(db.prepare("SELECT COUNT(*) AS count FROM classified_ads WHERE approval_status = 'pending'").get().count),
    openClassifieds: Number(db.prepare(`
      SELECT COUNT(*) AS count
      FROM classified_ads
      WHERE approval_status = 'approved' AND availability_status = 'open'
    `).get().count),
    bannedMembers: Number(db.prepare("SELECT COUNT(*) AS count FROM members WHERE is_banned = 1").get().count),
  };
}

function buildAdminDashboardPayload(admin) {
  const canViewCouriers = admin.canManageCouriers || admin.canViewCourierDocuments || admin.canManageAdmins;
  const canViewListings = admin.canManageListings || admin.canBanMembers || admin.canManageAdmins;
  const canViewClassifieds = admin.canManageListings || admin.canBanMembers || admin.canManageAdmins;
  const canViewMembers = admin.canBanMembers || admin.canManageAdmins;

  return {
    admin,
    couriers: canViewCouriers ? getAdminCouriers(admin) : [],
    listings: canViewListings ? getAdminListings(admin) : [],
    classifieds: canViewClassifieds ? getAdminClassifieds(admin) : [],
    members: canViewMembers ? getAdminMembers(admin) : [],
    managers: admin.canManageAdmins ? getAdminManagers() : [],
    stats: getAdminStats(),
  };
}

function getPublicListingsPage(page, limit) {
  const offset = (page - 1) * limit;
  const total = Number(db.prepare(`
    SELECT COUNT(*) AS count
    FROM listings l
    INNER JOIN members m ON m.id = l.member_id
    WHERE l.approval_status = 'approved' AND m.is_banned = 0
  `).get().count);

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
    LIMIT ? OFFSET ?
  `).all(limit, offset);

  return { rows, total };
}

function getPublicClassifiedsPage(page, limit) {
  const offset = (page - 1) * limit;
  const total = Number(db.prepare(`
    SELECT COUNT(*) AS count
    FROM classified_ads c
    INNER JOIN members m ON m.id = c.member_id
    WHERE c.approval_status = 'approved' AND m.is_banned = 0
  `).get().count);

  const rows = db.prepare(`
    SELECT
      c.id,
      c.member_id AS memberId,
      c.ad_type AS adType,
      c.category,
      c.title,
      c.city,
      c.compensation,
      c.description,
      c.availability_status AS availabilityStatus,
      c.approval_status AS approvalStatus,
      c.approved_at AS approvedAt,
      c.created_at AS createdAt,
      m.full_name AS memberName,
      m.phone AS memberPhone,
      m.is_banned AS memberIsBanned
    FROM classified_ads c
    INNER JOIN members m ON m.id = c.member_id
    WHERE c.approval_status = 'approved' AND m.is_banned = 0
    ORDER BY
      CASE WHEN c.availability_status = 'open' THEN 0 ELSE 1 END,
      c.created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);

  return { rows, total };
}

function getFavoriteListingsPage(memberId, page, limit) {
  const offset = (page - 1) * limit;
  const total = Number(db.prepare(`
    SELECT COUNT(*) AS count
    FROM favorites f
    INNER JOIN listings l ON l.id = f.listing_id
    INNER JOIN members m ON m.id = l.member_id
    WHERE f.member_id = ?
      AND l.approval_status = 'approved'
      AND m.is_banned = 0
  `).get(memberId).count);

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
    FROM favorites f
    INNER JOIN listings l ON l.id = f.listing_id
    INNER JOIN members m ON m.id = l.member_id
    WHERE f.member_id = ?
      AND l.approval_status = 'approved'
      AND m.is_banned = 0
    ORDER BY f.created_at DESC
    LIMIT ? OFFSET ?
  `).all(memberId, limit, offset);

  return { rows, total };
}

function getListings() {
  return getPublicListingsPage(1, 500).rows.map(mapListingRow);
}

function getClassifieds() {
  return getPublicClassifiedsPage(1, 500).rows.map(mapClassifiedRow);
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
      m.phone AS sellerPhone,
      m.is_banned AS sellerIsBanned
    FROM listings l
    INNER JOIN members m ON m.id = l.member_id
    WHERE l.id = ?
  `).get(id);

  return row ? mapListingRow(row) : null;
}

function getClassifiedById(id) {
  const row = db.prepare(`
    SELECT
      c.id,
      c.member_id AS memberId,
      c.ad_type AS adType,
      c.category,
      c.title,
      c.city,
      c.compensation,
      c.description,
      c.availability_status AS availabilityStatus,
      c.approval_status AS approvalStatus,
      c.approved_at AS approvedAt,
      c.created_at AS createdAt,
      m.full_name AS memberName,
      m.phone AS memberPhone,
      m.is_banned AS memberIsBanned
    FROM classified_ads c
    INNER JOIN members m ON m.id = c.member_id
    WHERE c.id = ?
  `).get(id);

  return row ? mapClassifiedRow(row) : null;
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

  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    city: row.city,
    isBanned: Boolean(row.isBanned),
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
    id: Number(row.id),
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
    SELECT id
    FROM admins
    ORDER BY created_at DESC
  `).all().map((row) => getPublicAdmin(Number(row.id)));
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

function getAdminClassifieds(admin) {
  const rows = db.prepare(`
    SELECT
      c.id,
      c.member_id AS memberId,
      c.ad_type AS adType,
      c.category,
      c.title,
      c.city,
      c.compensation,
      c.description,
      c.availability_status AS availabilityStatus,
      c.approval_status AS approvalStatus,
      c.approved_at AS approvedAt,
      c.created_at AS createdAt,
      m.full_name AS memberName,
      m.phone AS memberPhone,
      m.is_banned AS memberIsBanned
    FROM classified_ads c
    INNER JOIN members m ON m.id = c.member_id
    ORDER BY
      CASE WHEN c.approval_status = 'pending' THEN 0 ELSE 1 END,
      CASE WHEN c.availability_status = 'open' THEN 0 ELSE 1 END,
      c.created_at DESC
  `).all();

  return rows.map((row) => ({
    ...mapClassifiedRow(row),
    memberIsBanned: Boolean(row.memberIsBanned),
    canApprove: Boolean((admin.canManageListings || admin.canManageAdmins) && row.approvalStatus !== "approved"),
    canManageClassifieds: Boolean(admin.canManageListings || admin.canManageAdmins),
    canBanMember: Boolean(admin.canBanMembers || admin.canManageAdmins),
  }));
}

function getAdminClassifiedById(classifiedId, admin) {
  const row = db.prepare(`
    SELECT
      c.id,
      c.member_id AS memberId,
      c.ad_type AS adType,
      c.category,
      c.title,
      c.city,
      c.compensation,
      c.description,
      c.availability_status AS availabilityStatus,
      c.approval_status AS approvalStatus,
      c.approved_at AS approvedAt,
      c.created_at AS createdAt,
      m.full_name AS memberName,
      m.phone AS memberPhone,
      m.is_banned AS memberIsBanned
    FROM classified_ads c
    INNER JOIN members m ON m.id = c.member_id
    WHERE c.id = ?
  `).get(classifiedId);

  if (!row) {
    return null;
  }

  return {
    ...mapClassifiedRow(row),
    memberIsBanned: Boolean(row.memberIsBanned),
    canApprove: Boolean((admin.canManageListings || admin.canManageAdmins) && row.approvalStatus !== "approved"),
    canManageClassifieds: Boolean(admin.canManageListings || admin.canManageAdmins),
    canBanMember: Boolean(admin.canBanMembers || admin.canManageAdmins),
  };
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

  const personalClassifieds = db.prepare(`
    SELECT
      c.id,
      c.member_id AS memberId,
      c.ad_type AS adType,
      c.category,
      c.title,
      c.city,
      c.compensation,
      c.description,
      c.availability_status AS availabilityStatus,
      c.approval_status AS approvalStatus,
      c.approved_at AS approvedAt,
      c.created_at AS createdAt,
      m.full_name AS memberName,
      m.phone AS memberPhone,
      m.is_banned AS memberIsBanned
    FROM classified_ads c
    INNER JOIN members m ON m.id = c.member_id
    WHERE c.member_id = ?
    ORDER BY c.created_at DESC
  `).all(memberId).map(mapClassifiedRow);

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
    personalClassifieds,
    favoriteListings,
    favoriteListingIds: favoriteListings.map((listing) => listing.id),
  };
}

function mapListingRow(row) {
  if (!row) {
    return null;
  }

  const listingId = Number(row.id);
  const imageRows = Number.isInteger(listingId) ? getListingImageRows(listingId) : [];
  const legacyImagePath = row.imagePath || row.image_path || null;
  const imageUrls = imageRows.length
    ? imageRows.map((imageRow) => imageRow.imagePath)
    : legacyImagePath
      ? [legacyImagePath]
      : [];

  return {
    id: listingId,
    sellerId: Number(row.sellerId),
    title: row.title,
    price: Number(row.price),
    city: row.city,
    category: row.category,
    description: row.description,
    imageUrl: imageUrls[0] || null,
    imageUrls,
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

function mapClassifiedRow(row) {
  if (!row) {
    return null;
  }

  const approvalStatus = row.approvalStatus || "pending";
  const availabilityStatus = row.availabilityStatus || "open";

  return {
    id: Number(row.id),
    memberId: Number(row.memberId),
    adType: row.adType,
    adTypeLabel: getClassifiedAdTypeLabel(row.adType),
    category: row.category,
    title: row.title,
    city: row.city,
    compensation: row.compensation || "",
    description: row.description,
    availabilityStatus,
    availabilityStatusLabel: getClassifiedAvailabilityLabel(availabilityStatus),
    approvalStatus,
    approvalStatusLabel: getClassifiedApprovalLabel(approvalStatus),
    isOpen: availabilityStatus === "open",
    isApproved: approvalStatus === "approved",
    approvedAt: row.approvedAt || "",
    createdAt: row.createdAt,
    memberName: row.memberName,
    memberPhone: row.memberPhone || "",
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

function getCourierRatesForCity(city) {
  const exactRates = DELIVERY_RATE_RULES.filter((rate) => rate.city === city);
  return exactRates.length
    ? exactRates
    : DELIVERY_RATE_RULES.filter((rate) => rate.city === "محافظات أخرى");
}

function getCourierStatusLabel(status) {
  return {
    pending: "قيد المراجعة",
    approved: "جاهز للعمل",
    paused: "موقوف مؤقتًا",
  }[status] || "غير معروف";
}

function getListingApprovalLabel(status) {
  return {
    approved: "معتمد",
    pending: "بانتظار المراجعة",
    rejected: "مرفوض",
  }[status] || "بانتظار المراجعة";
}

function getClassifiedApprovalLabel(status) {
  return {
    approved: "معتمد",
    pending: "بانتظار المراجعة",
    rejected: "مرفوض",
  }[status] || "بانتظار المراجعة";
}

function getClassifiedAvailabilityLabel(status) {
  return CLASSIFIED_AVAILABILITY_LABELS[status] || "مفتوح";
}

function getClassifiedAdTypeLabel(adType) {
  return CLASSIFIED_AD_TYPE_LABELS[adType] || adType || "إعلان مبوب";
}

function getListingImageRows(listingId) {
  return db.prepare(`
    SELECT
      id,
      listing_id AS listingId,
      image_path AS imagePath,
      sort_order AS sortOrder,
      created_at AS createdAt
    FROM listing_images
    WHERE listing_id = ?
    ORDER BY sort_order ASC, id ASC
  `).all(listingId).map((row) => ({
    id: Number(row.id),
    listingId: Number(row.listingId),
    imagePath: row.imagePath,
    sortOrder: Number(row.sortOrder),
    createdAt: row.createdAt,
  }));
}

function renumberListingImages(listingId) {
  const rows = db.prepare(`
    SELECT id
    FROM listing_images
    WHERE listing_id = ?
    ORDER BY sort_order ASC, id ASC
  `).all(listingId);

  const updateStatement = db.prepare("UPDATE listing_images SET sort_order = ? WHERE id = ?");
  rows.forEach((row, index) => {
    updateStatement.run(index, Number(row.id));
  });
}

function syncPrimaryListingImage(listingId) {
  const firstImage = db.prepare(`
    SELECT image_path AS imagePath
    FROM listing_images
    WHERE listing_id = ?
    ORDER BY sort_order ASC, id ASC
    LIMIT 1
  `).get(listingId);

  db.prepare("UPDATE listings SET image_path = ? WHERE id = ?").run(firstImage ? firstImage.imagePath : null, listingId);
}

function removePrimaryListingImage(listingId) {
  const imageRows = getListingImageRows(listingId);

  if (imageRows.length > 0) {
    const [primaryImage] = imageRows;
    db.prepare("DELETE FROM listing_images WHERE id = ?").run(primaryImage.id);
    deleteUploadedFile(primaryImage.imagePath);
    renumberListingImages(listingId);
    syncPrimaryListingImage(listingId);
    return true;
  }

  const listing = db.prepare("SELECT image_path AS imagePath FROM listings WHERE id = ?").get(listingId);
  if (!listing || !listing.imagePath) {
    return false;
  }

  deleteUploadedFile(listing.imagePath);
  db.prepare("UPDATE listings SET image_path = NULL WHERE id = ?").run(listingId);
  return true;
}

function deleteAllListingImages(listingId) {
  const imageRows = getListingImageRows(listingId);
  const listing = db.prepare("SELECT image_path AS imagePath FROM listings WHERE id = ?").get(listingId);
  const imagePaths = new Set(imageRows.map((row) => row.imagePath));

  if (listing && listing.imagePath) {
    imagePaths.add(listing.imagePath);
  }

  db.prepare("DELETE FROM listing_images WHERE listing_id = ?").run(listingId);
  db.prepare("UPDATE listings SET image_path = NULL WHERE id = ?").run(listingId);

  for (const imagePath of imagePaths) {
    deleteUploadedFile(imagePath);
  }
}

function deleteUploadedFile(uploadedPath) {
  const normalizedPath = String(uploadedPath || "").trim();
  if (!normalizedPath) {
    return;
  }

  const fileName = path.basename(normalizedPath);
  const absolutePath = path.join(UPLOADS_DIR, fileName);

  if (!absolutePath.startsWith(path.resolve(UPLOADS_DIR))) {
    return;
  }

  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }
}

function createNotification(memberId, type, title, message, listingId = null) {
  if (!memberId || !type || !title || !message) {
    return null;
  }

  try {
    const result = db.prepare(`
      INSERT INTO notifications (member_id, listing_id, type, title, message)
      VALUES (?, ?, ?, ?, ?)
    `).run(memberId, listingId || null, type, title, message);

    return Number(result.lastInsertRowid);
  } catch {
    return null;
  }
}

module.exports = {
  handleApiRoutes,
  createNotification,
  runExpiredListingCleanup,
};
