const ADMIN_TOKEN_KEY = "souq-syria-admin-token";
const ADMIN_PANEL_ACCESS_PATH = normalizeAdminPanelPath(window.location.pathname);

const state = {
  token: localStorage.getItem(ADMIN_TOKEN_KEY) || "",
  admin: null,
  couriers: [],
  listings: [],
  classifieds: [],
  members: [],
  managers: [],
  stats: {
    pendingCouriers: 0,
    approvedCouriers: 0,
    pausedCouriers: 0,
    pendingListings: 0,
    highlightedListings: 0,
    pendingClassifieds: 0,
    openClassifieds: 0,
    bannedMembers: 0,
    totalManagers: 0,
  },
};

const adminLoginShell = document.querySelector("#adminLoginShell");
const adminDashboard = document.querySelector("#adminDashboard");
const adminLoginForm = document.querySelector("#adminLoginForm");
const adminMessage = document.querySelector("#adminMessage");
const adminLogoutButton = document.querySelector("#adminLogoutButton");
const adminWelcomeTitle = document.querySelector("#adminWelcomeTitle");
const adminSummaryNote = document.querySelector("#adminSummaryNote");
const adminPendingCount = document.querySelector("#adminPendingCount");
const adminApprovedCount = document.querySelector("#adminApprovedCount");
const adminPausedCount = document.querySelector("#adminPausedCount");
const adminGoldCount = document.querySelector("#adminGoldCount");
const adminPendingClassifiedsCount = document.querySelector("#adminPendingClassifiedsCount");
const adminOpenClassifiedsCount = document.querySelector("#adminOpenClassifiedsCount");
const adminBannedMembersCount = document.querySelector("#adminBannedMembersCount");
const adminManagersCount = document.querySelector("#adminManagersCount");
const adminCourierList = document.querySelector("#adminCourierList");
const adminListingsList = document.querySelector("#adminListingsList");
const adminClassifiedsList = document.querySelector("#adminClassifiedsList");
const adminMembersList = document.querySelector("#adminMembersList");
const adminManagersList = document.querySelector("#adminManagersList");
const adminListingsNote = document.querySelector("#adminListingsNote");
const adminClassifiedsNote = document.querySelector("#adminClassifiedsNote");
const adminMembersNote = document.querySelector("#adminMembersNote");
const adminPermissionNote = document.querySelector("#adminPermissionNote");
const managerFormShell = document.querySelector("#managerFormShell");
const managerForm = document.querySelector("#managerForm");
const managerMessage = document.querySelector("#managerMessage");

bootstrap();

async function bootstrap() {
  bindEvents();

  if (state.token) {
    await loadDashboard();
  } else {
    renderState();
  }
}

function bindEvents() {
  adminLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleAdminLogin();
  });

  adminLogoutButton.addEventListener("click", async () => {
    await handleAdminLogout();
  });

  managerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleManagerCreate();
  });
}

async function loadDashboard() {
  try {
    const response = await apiRequest("/api/admin/dashboard", {
      headers: getAuthHeaders(),
    });

    hydrateDashboard(response);
    renderState();
  } catch (error) {
    clearSession();
    adminMessage.textContent = error.message;
    renderState();
  }
}

function hydrateDashboard(response) {
  state.admin = response.admin || null;
  state.couriers = response.couriers || [];
  state.listings = response.listings || [];
  state.classifieds = response.classifieds || [];
  state.members = response.members || [];
  state.managers = response.managers || [];
  state.stats = {
    ...state.stats,
    ...(response.stats || {}),
  };
}

function renderState() {
  const loggedIn = Boolean(state.token) && Boolean(state.admin);

  adminLoginShell.classList.toggle("hidden", loggedIn);
  adminDashboard.classList.toggle("hidden", !loggedIn);

  if (!loggedIn) {
    adminPendingCount.textContent = "0";
    adminApprovedCount.textContent = "0";
    adminPausedCount.textContent = "0";
    adminGoldCount.textContent = "0";
    adminPendingClassifiedsCount.textContent = "0";
    adminOpenClassifiedsCount.textContent = "0";
    adminBannedMembersCount.textContent = "0";
    adminManagersCount.textContent = "0";
    adminCourierList.innerHTML = `<div class="admin-empty">سجّل دخول الإدارة لعرض طلبات المندوبين.</div>`;
    adminListingsList.innerHTML = `<div class="admin-empty">سجّل دخول الإدارة لعرض الإعلانات.</div>`;
    adminClassifiedsList.innerHTML = `<div class="admin-empty">سجّل دخول الإدارة لعرض الإعلانات المبوبة.</div>`;
    adminMembersList.innerHTML = `<div class="admin-empty">سجّل دخول الإدارة لعرض حسابات المستخدمين.</div>`;
    adminManagersList.innerHTML = `<div class="admin-empty">سجّل دخول الإدارة لعرض حسابات المديرين.</div>`;
    managerFormShell.classList.add("hidden");
    adminListingsNote.textContent = "سجّل دخول الإدارة.";
    adminClassifiedsNote.textContent = "سجّل دخول الإدارة.";
    adminMembersNote.textContent = "سجّل دخول الإدارة.";
    adminPermissionNote.textContent = "تظهر الصلاحيات بعد الدخول.";
    return;
  }

  renderDashboard();
}

function renderDashboard() {
  adminWelcomeTitle.textContent = `${state.admin.roleLabel} - ${state.admin.fullName}`;
  adminSummaryNote.textContent = `دخول باسم ${state.admin.username}.`;
  adminPendingCount.textContent = formatNumber(state.stats.pendingCouriers);
  adminApprovedCount.textContent = formatNumber(state.stats.approvedCouriers);
  adminPausedCount.textContent = formatNumber(state.stats.pausedCouriers);
  adminGoldCount.textContent = formatNumber(state.stats.highlightedListings);
  adminPendingClassifiedsCount.textContent = formatNumber(state.stats.pendingClassifieds || 0);
  adminOpenClassifiedsCount.textContent = formatNumber(state.stats.openClassifieds || 0);
  adminBannedMembersCount.textContent = formatNumber(state.stats.bannedMembers);
  adminManagersCount.textContent = formatNumber(state.stats.totalManagers);
  adminPermissionNote.textContent = getPermissionSummary(state.admin);

  managerFormShell.classList.toggle("hidden", !state.admin.canManageAdmins);
  adminListingsNote.textContent = state.admin.canManageListings || state.admin.canManageAdmins
    ? "إدارة الإعلانات."
    : state.admin.canBanMembers
      ? "حظر أصحاب الإعلانات."
      : "لا تملك صلاحية لإدارة الإعلانات.";
  if (state.admin.canManageListings || state.admin.canManageAdmins) {
    adminListingsNote.textContent = `المعلقة: ${formatNumber(state.stats.pendingListings || 0)}.`;
  }

  adminClassifiedsNote.textContent = state.admin.canManageListings || state.admin.canManageAdmins
    ? `المعلقة: ${formatNumber(state.stats.pendingClassifieds || 0)}.`
    : "لا تملك صلاحية لإدارة الإعلانات المبوبة.";

  adminMembersNote.textContent = state.admin.canBanMembers || state.admin.canManageAdmins
    ? "إدارة المستخدمين."
    : "لا تملك صلاحية لإدارة المستخدمين.";

  renderCouriers();
  renderListings();
  renderClassifieds();
  renderMembers();
  renderManagers();
}

function renderCouriers() {
  if (!state.couriers.length) {
    adminCourierList.innerHTML = `<div class="admin-empty">لا توجد طلبات مندوبين مسجلة حاليًا.</div>`;
    return;
  }

  adminCourierList.innerHTML = state.couriers.map((courier) => `
    <article class="admin-courier-card">
      <div class="admin-courier-head">
        <div>
          <h4>${escapeHtml(courier.fullName)}</h4>
          <p>${escapeHtml(courier.phone)} | ${escapeHtml(courier.city)} | ${formatDate(courier.createdAt)}</p>
        </div>
        <span class="admin-status-chip ${getCourierStatusClass(courier.status)}">${escapeHtml(courier.statusLabel)}</span>
      </div>

      <div class="admin-courier-meta">
        <span class="admin-meta-pill">المركبة: ${escapeHtml(courier.vehicleType)}</span>
        <span class="admin-meta-pill">التغطية: ${escapeHtml(courier.coverageCities || courier.city)}</span>
        <span class="admin-meta-pill">${courier.nationalIdNumber ? `رقم الهوية: ${escapeHtml(courier.nationalIdNumber)}` : "المستندات مخفية حسب الصلاحية"}</span>
      </div>

      ${renderCourierMedia(courier)}

      <div class="admin-courier-actions">
        ${renderActionButton("pending", "قيد المراجعة", courier.status === "pending", state.admin.canManageCouriers, { courierId: courier.id, type: "courier-status" })}
        ${renderActionButton("approved", "جاهز للعمل", courier.status === "approved", state.admin.canManageCouriers, { courierId: courier.id, type: "courier-status" })}
        ${renderActionButton("paused", "موقوف مؤقتًا", courier.status === "paused", state.admin.canManageCouriers, { courierId: courier.id, type: "courier-status" })}
      </div>
    </article>
  `).join("");

  adminCourierList.querySelectorAll(".admin-action-button[data-type='courier-status']").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleCourierStatusUpdate(Number(button.dataset.courierId), button.dataset.status);
    });
  });
}

function renderCourierMedia(courier) {
  if (!courier.identityImageUrl || !courier.livePhotoUrl) {
    return `<div class="admin-empty">عرض المستندات غير متاح لهذا الحساب الإداري.</div>`;
  }

  return `
    <div class="admin-media-grid">
      <a class="admin-media-link" href="${escapeHtmlAttribute(courier.identityImageUrl)}" target="_blank" rel="noopener noreferrer">
        <img src="${escapeHtmlAttribute(courier.identityImageUrl)}" alt="هوية ${escapeHtmlAttribute(courier.fullName)}">
        <p class="admin-media-caption">صورة الهوية الشخصية</p>
      </a>
      <a class="admin-media-link" href="${escapeHtmlAttribute(courier.livePhotoUrl)}" target="_blank" rel="noopener noreferrer">
        <img src="${escapeHtmlAttribute(courier.livePhotoUrl)}" alt="الصورة المباشرة للمندوب ${escapeHtmlAttribute(courier.fullName)}">
        <p class="admin-media-caption">الصورة المباشرة من الكاميرا</p>
      </a>
    </div>
  `;
}

function renderListings() {
  if (!state.listings.length) {
    adminListingsList.innerHTML = `<div class="admin-empty">لا توجد إعلانات منشورة حاليًا.</div>`;
    return;
  }

  adminListingsList.innerHTML = state.listings.map((listing) => `
    <article class="admin-listing-card ${listing.isAdminHighlighted ? "admin-listing-card-gold" : ""}">
      <div class="admin-courier-head">
        <div>
          <h4>${escapeHtml(listing.title)}</h4>
          <p>${escapeHtml(listing.sellerName)} | ${escapeHtml(listing.city)} | ${formatCurrency(listing.price)}</p>
        </div>
        <div class="admin-manager-permissions">
          <span class="admin-status-chip ${listing.isApproved ? "status-approved" : "status-pending"}">${escapeHtml(listing.approvalStatusLabel)}</span>
          ${listing.isAdminHighlighted ? '<span class="admin-status-chip status-gold">إطار ذهبي</span>' : ""}
          ${listing.isFeatured ? '<span class="admin-status-chip status-pending">إعلان مدفوع</span>' : ""}
          ${listing.sellerIsBanned ? '<span class="admin-status-chip status-paused">صاحب الإعلان محظور</span>' : ""}
        </div>
      </div>

      ${renderListingAdminMedia(listing)}

      <p class="admin-listing-description">${escapeHtml(listing.description)}</p>

      <div class="admin-courier-actions">
        ${renderActionButton("approve-listing", listing.isApproved ? "تم الاعتماد" : "اعتماد الإعلان", listing.isApproved, listing.canApprove, { listingId: listing.id, type: "listing-approve" })}
        ${renderActionButton(listing.isAdminHighlighted ? "remove-gold" : "gold", listing.isAdminHighlighted ? "إزالة الإطار الذهبي" : "تمييز بإطار ذهبي", listing.isAdminHighlighted, listing.canManageListings, { listingId: listing.id, type: "listing-highlight", highlighted: listing.isAdminHighlighted ? "0" : "1" })}
        ${renderActionButton("remove-image", "حذف الصورة", false, listing.canManageListings && Boolean(listing.imageUrl), { listingId: listing.id, type: "listing-remove-image" })}
        ${renderActionButton("delete-listing", "حذف الإعلان", false, listing.canManageListings, { listingId: listing.id, type: "listing-delete" })}
        ${renderActionButton(listing.sellerIsBanned ? "unban-member" : "ban-member", listing.sellerIsBanned ? "فك حظر المستخدم" : "حظر المستخدم", listing.sellerIsBanned, listing.canBanMember, { memberId: listing.sellerId, type: "member-ban", banned: listing.sellerIsBanned ? "0" : "1" })}
      </div>
    </article>
  `).join("");

  bindAdminActionButtons(adminListingsList);
}

function renderListingAdminMedia(listing) {
  if (!listing.imageUrl) {
    return `<div class="admin-empty">لا توجد صورة مرفقة لهذا الإعلان.</div>`;
  }

  return `
    <a class="admin-media-link admin-media-link-wide" href="${escapeHtmlAttribute(listing.imageUrl)}" target="_blank" rel="noopener noreferrer">
      <img src="${escapeHtmlAttribute(listing.imageUrl)}" alt="صورة الإعلان ${escapeHtmlAttribute(listing.title)}">
      <p class="admin-media-caption">الصورة الحالية للإعلان</p>
    </a>
  `;
}

function renderClassifieds() {
  if (!state.admin.canManageListings && !state.admin.canManageAdmins) {
    adminClassifiedsList.innerHTML = `<div class="admin-empty">لا تملك صلاحية لإدارة الإعلانات المبوبة.</div>`;
    return;
  }

  if (!state.classifieds.length) {
    adminClassifiedsList.innerHTML = `<div class="admin-empty">لا توجد إعلانات مبوبة مسجلة حاليًا.</div>`;
    return;
  }

  adminClassifiedsList.innerHTML = state.classifieds.map((classified) => `
    <article class="admin-classified-card ${classified.isOpen ? "" : "admin-classified-card-closed"}">
      <div class="admin-courier-head">
        <div>
          <h4>${escapeHtml(classified.title)}</h4>
          <p>${escapeHtml(classified.memberName)} | ${escapeHtml(classified.city)} | ${escapeHtml(classified.category)}</p>
        </div>
        <div class="admin-manager-permissions">
          <span class="admin-status-chip ${classified.isApproved ? "status-approved" : "status-pending"}">${escapeHtml(classified.approvalStatusLabel)}</span>
          <span class="admin-status-chip ${classified.isOpen ? "status-approved" : "status-paused"}">${escapeHtml(classified.availabilityStatusLabel)}</span>
          ${classified.memberIsBanned ? `<span class="admin-status-chip status-paused">صاحب الطلب محظور</span>` : ""}
        </div>
      </div>

      <div class="admin-courier-meta">
        <span class="admin-meta-pill">${escapeHtml(classified.adTypeLabel)}</span>
        ${classified.compensation ? `<span class="admin-meta-pill">${escapeHtml(classified.compensation)}</span>` : ""}
        <span class="admin-meta-pill">${formatDate(classified.createdAt)}</span>
      </div>

      <p class="admin-listing-description">${escapeHtml(classified.description)}</p>

      <div class="admin-courier-actions">
        ${renderActionButton("approve-classified", classified.isApproved ? "تم الاعتماد" : "اعتماد الإعلان", classified.isApproved, classified.canApprove, { classifiedId: classified.id, type: "classified-approve" })}
        ${renderActionButton("open-classified", "فتح", classified.isOpen, classified.canManageClassifieds, { classifiedId: classified.id, type: "classified-status", availabilityStatus: "open" })}
        ${renderActionButton("close-classified", "إغلاق", !classified.isOpen, classified.canManageClassifieds, { classifiedId: classified.id, type: "classified-status", availabilityStatus: "closed" })}
        ${renderActionButton("delete-classified", "حذف", false, classified.canManageClassifieds, { classifiedId: classified.id, type: "classified-delete" })}
        ${renderActionButton(classified.memberIsBanned ? "unban-member" : "ban-member", classified.memberIsBanned ? "فك حظر المستخدم" : "حظر المستخدم", classified.memberIsBanned, classified.canBanMember, { memberId: classified.memberId, type: "member-ban", banned: classified.memberIsBanned ? "0" : "1" })}
      </div>
    </article>
  `).join("");

  bindAdminActionButtons(adminClassifiedsList);
}
function renderMembers() {
  if (!state.admin.canBanMembers && !state.admin.canManageAdmins) {
    adminMembersList.innerHTML = `<div class="admin-empty">لا تملك صلاحية لإدارة المستخدمين.</div>`;
    return;
  }

  if (!state.members.length) {
    adminMembersList.innerHTML = `<div class="admin-empty">لا توجد حسابات مستخدمين مسجلة حاليًا.</div>`;
    return;
  }

  adminMembersList.innerHTML = state.members.map((member) => `
    <article class="admin-member-card">
      <div class="admin-courier-head">
        <div>
          <h4>${escapeHtml(member.fullName)}</h4>
          <p>${escapeHtml(member.email)} | ${escapeHtml(member.phone)} | ${escapeHtml(member.city)}</p>
        </div>
        <span class="admin-status-chip ${member.isBanned ? "status-paused" : "status-approved"}">${member.isBanned ? "محظور" : "نشط"}</span>
      </div>

      <div class="admin-courier-meta">
        <span class="admin-meta-pill">عدد الإعلانات: ${formatNumber(member.listingsCount)}</span>
        <span class="admin-meta-pill">تاريخ التسجيل: ${formatDate(member.createdAt)}</span>
        <span class="admin-meta-pill">${member.bannedAt ? `تاريخ الحظر: ${formatDate(member.bannedAt)}` : "لا يوجد حظر"}</span>
      </div>

      <div class="admin-courier-actions">
        ${renderActionButton(member.isBanned ? "unban-member" : "ban-member", member.isBanned ? "فك الحظر" : "حظر المستخدم", member.isBanned, member.canBanMember, { memberId: member.id, type: "member-ban", banned: member.isBanned ? "0" : "1" })}
      </div>
    </article>
  `).join("");

  bindAdminActionButtons(adminMembersList);
}

function renderManagers() {
  if (!state.admin.canManageAdmins) {
    adminManagersList.innerHTML = `<div class="admin-empty">لا تملك صلاحية إدارة المديرين أو إضافة حسابات جديدة.</div>`;
    return;
  }

  if (!state.managers.length) {
    adminManagersList.innerHTML = `<div class="admin-empty">لا توجد حسابات إدارية إضافية بعد.</div>`;
    return;
  }

  adminManagersList.innerHTML = state.managers.map((manager) => `
    <article class="admin-manager-card">
      <div class="admin-courier-head">
        <div>
          <h4>${escapeHtml(manager.fullName)}</h4>
          <p>${escapeHtml(manager.username)} | ${escapeHtml(manager.email)}</p>
        </div>
        <span class="admin-status-chip status-approved">${escapeHtml(manager.roleLabel)}</span>
      </div>
      <div class="admin-manager-permissions">
        ${renderPermissionPill("إدارة المديرين", manager.canManageAdmins)}
        ${renderPermissionPill("إدارة المندوبين", manager.canManageCouriers)}
        ${renderPermissionPill("عرض المستندات", manager.canViewCourierDocuments)}
        ${renderPermissionPill("إدارة الإعلانات", manager.canManageListings)}
        ${renderPermissionPill("حظر المستخدمين", manager.canBanMembers)}
      </div>
    </article>
  `).join("");
}

function bindAdminActionButtons(rootElement) {
  rootElement.querySelectorAll(".admin-action-button[data-type='listing-approve']").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleListingApproval(Number(button.dataset.listingId));
    });
  });

  rootElement.querySelectorAll(".admin-action-button[data-type='listing-highlight']").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleListingHighlight(Number(button.dataset.listingId), button.dataset.highlighted === "1");
    });
  });

  rootElement.querySelectorAll(".admin-action-button[data-type='listing-remove-image']").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleListingImageRemoval(Number(button.dataset.listingId));
    });
  });

  rootElement.querySelectorAll(".admin-action-button[data-type='listing-delete']").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleListingDelete(Number(button.dataset.listingId));
    });
  });

  rootElement.querySelectorAll(".admin-action-button[data-type='member-ban']").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleMemberBan(Number(button.dataset.memberId), button.dataset.banned === "1");
    });
  });

  rootElement.querySelectorAll(".admin-action-button[data-type='classified-approve']").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleClassifiedApproval(Number(button.dataset.classifiedId));
    });
  });

  rootElement.querySelectorAll(".admin-action-button[data-type='classified-status']").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleClassifiedStatusUpdate(Number(button.dataset.classifiedId), button.dataset.availabilityStatus);
    });
  });

  rootElement.querySelectorAll(".admin-action-button[data-type='classified-delete']").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleClassifiedDelete(Number(button.dataset.classifiedId));
    });
  });
}

async function handleAdminLogin() {
  adminMessage.textContent = "جارٍ تسجيل دخول الإدارة...";

  const payload = Object.fromEntries(new FormData(adminLoginForm).entries());

  try {
    const response = await apiRequest("/api/admin/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    state.token = response.token;
    localStorage.setItem(ADMIN_TOKEN_KEY, response.token);
    hydrateDashboard(response);
    adminLoginForm.reset();
    adminMessage.textContent = response.message;
    renderState();
  } catch (error) {
    adminMessage.textContent = error.message;
  }
}

async function handleAdminLogout() {
  try {
    await apiRequest("/api/admin/logout", {
      method: "POST",
      headers: getAuthHeaders(),
    });
  } catch {
    // تجاهل الخطأ لأننا سنمسح الجلسة محليًا في كل الأحوال.
  }

  clearSession();
  adminMessage.textContent = "تم تسجيل خروج الإدارة.";
  renderState();
}

async function handleManagerCreate() {
  managerMessage.textContent = "جارٍ إضافة المدير...";

  const formData = new FormData(managerForm);
  const payload = Object.fromEntries(formData.entries());
  payload.canManageAdmins = formData.has("canManageAdmins");
  payload.canManageCouriers = formData.has("canManageCouriers");
  payload.canViewCourierDocuments = formData.has("canViewCourierDocuments");
  payload.canManageListings = formData.has("canManageListings");
  payload.canBanMembers = formData.has("canBanMembers");

  try {
    const response = await apiRequest("/api/admin/managers", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    state.managers = response.managers || state.managers;
    state.stats = {
      ...state.stats,
      ...(response.stats || {}),
    };
    managerForm.reset();
    managerMessage.textContent = response.message;
    renderManagers();
    adminManagersCount.textContent = formatNumber(state.stats.totalManagers);
  } catch (error) {
    managerMessage.textContent = error.message;
  }
}

async function handleCourierStatusUpdate(courierId, status) {
  if (!state.admin?.canManageCouriers) {
    adminMessage.textContent = "ليس لديك صلاحية لتحديث حالات المندوبين.";
    return;
  }

  try {
    const response = await apiRequest(`/api/admin/couriers/${courierId}/status`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ status }),
    });

    state.couriers = response.couriers || state.couriers;
    state.stats = {
      ...state.stats,
      ...(response.stats || {}),
    };
    renderDashboard();
  } catch (error) {
    adminMessage.textContent = error.message;
  }
}

async function handleListingHighlight(listingId, highlighted) {
  if (!state.admin?.canManageListings && !state.admin?.canManageAdmins) {
    adminMessage.textContent = "ليس لديك صلاحية لتمييز الإعلانات.";
    return;
  }

  try {
    const response = await apiRequest(`/api/admin/listings/${listingId}/highlight`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ highlighted }),
    });

    state.listings = response.listings || state.listings;
    state.stats = {
      ...state.stats,
      ...(response.stats || {}),
    };
    renderDashboard();
  } catch (error) {
    adminMessage.textContent = error.message;
  }
}

async function handleListingApproval(listingId) {
  if (!state.admin?.canManageListings && !state.admin?.canManageAdmins) {
    adminMessage.textContent = "ليس لديك صلاحية لاعتماد الإعلانات.";
    return;
  }

  try {
    const response = await apiRequest(`/api/admin/listings/${listingId}/approve`, {
      method: "POST",
      headers: getAuthHeaders(),
    });

    state.listings = response.listings || state.listings;
    state.stats = {
      ...state.stats,
      ...(response.stats || {}),
    };
    adminMessage.textContent = response.message || "";
    renderDashboard();
  } catch (error) {
    adminMessage.textContent = error.message;
  }
}

async function handleListingImageRemoval(listingId) {
  if (!state.admin?.canManageListings && !state.admin?.canManageAdmins) {
    adminMessage.textContent = "ليس لديك صلاحية لحذف صور الإعلانات.";
    return;
  }

  try {
    const response = await apiRequest(`/api/admin/listings/${listingId}/remove-image`, {
      method: "POST",
      headers: getAuthHeaders(),
    });

    state.listings = response.listings || state.listings;
    state.stats = {
      ...state.stats,
      ...(response.stats || {}),
    };
    renderDashboard();
  } catch (error) {
    adminMessage.textContent = error.message;
  }
}

async function handleListingDelete(listingId) {
  if (!state.admin?.canManageListings && !state.admin?.canManageAdmins) {
    adminMessage.textContent = "ليس لديك صلاحية لحذف الإعلانات.";
    return;
  }

  try {
    const response = await apiRequest(`/api/admin/listings/${listingId}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });

    state.listings = response.listings || state.listings;
    state.members = response.members || state.members;
    state.stats = {
      ...state.stats,
      ...(response.stats || {}),
    };
    renderDashboard();
  } catch (error) {
    adminMessage.textContent = error.message;
  }
}

async function handleClassifiedApproval(classifiedId) {
  if (!state.admin?.canManageListings && !state.admin?.canManageAdmins) {
    adminMessage.textContent = "ليس لديك صلاحية لاعتماد الإعلانات المبوبة.";
    return;
  }

  try {
    const response = await apiRequest(`/api/admin/classifieds/${classifiedId}/approve`, {
      method: "POST",
      headers: getAuthHeaders(),
    });

    state.classifieds = response.classifieds || state.classifieds;
    state.stats = {
      ...state.stats,
      ...(response.stats || {}),
    };
    adminMessage.textContent = response.message || "";
    renderDashboard();
  } catch (error) {
    adminMessage.textContent = error.message;
  }
}

async function handleClassifiedStatusUpdate(classifiedId, availabilityStatus) {
  if (!state.admin?.canManageListings && !state.admin?.canManageAdmins) {
    adminMessage.textContent = "ليس لديك صلاحية لتحديث حالة الإعلانات المبوبة.";
    return;
  }

  try {
    const response = await apiRequest(`/api/admin/classifieds/${classifiedId}/status`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ availabilityStatus }),
    });

    state.classifieds = response.classifieds || state.classifieds;
    state.stats = {
      ...state.stats,
      ...(response.stats || {}),
    };
    adminMessage.textContent = response.message || "";
    renderDashboard();
  } catch (error) {
    adminMessage.textContent = error.message;
  }
}

async function handleClassifiedDelete(classifiedId) {
  if (!state.admin?.canManageListings && !state.admin?.canManageAdmins) {
    adminMessage.textContent = "ليس لديك صلاحية لحذف الإعلانات المبوبة.";
    return;
  }

  try {
    const response = await apiRequest(`/api/admin/classifieds/${classifiedId}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });

    state.classifieds = response.classifieds || state.classifieds;
    state.stats = {
      ...state.stats,
      ...(response.stats || {}),
    };
    adminMessage.textContent = response.message || "";
    renderDashboard();
  } catch (error) {
    adminMessage.textContent = error.message;
  }
}
async function handleMemberBan(memberId, banned) {
  if (!state.admin?.canBanMembers && !state.admin?.canManageAdmins) {
    adminMessage.textContent = "ليس لديك صلاحية لحظر المستخدمين.";
    return;
  }

  try {
    const response = await apiRequest(`/api/admin/members/${memberId}/ban`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ banned }),
    });

    state.members = response.members || state.members;
    state.listings = response.listings || state.listings;
    state.classifieds = response.classifieds || state.classifieds;
    state.stats = {
      ...state.stats,
      ...(response.stats || {}),
    };
    renderDashboard();
  } catch (error) {
    adminMessage.textContent = error.message;
  }
}

function renderActionButton(kind, label, active, enabled, dataset) {
  const activeClass = active ? "active" : "";
  const disabledAttribute = enabled ? "" : "disabled";
  const dataAttributes = Object.entries(dataset)
    .map(([key, value]) => `data-${toKebabCase(key)}="${escapeHtmlAttribute(String(value))}"`)
    .join(" ");

  return `
    <button class="admin-action-button ${activeClass}" type="button" ${dataAttributes} ${disabledAttribute}>
      ${label}
    </button>
  `;
}

function renderPermissionPill(label, enabled) {
  const className = enabled ? "status-approved" : "status-paused";
  const text = enabled ? label : `بدون ${label}`;
  return `<span class="admin-status-chip ${className}">${escapeHtml(text)}</span>`;
}

function getPermissionSummary(admin) {
  const permissions = [];

  if (admin.canManageAdmins) {
    permissions.push("إضافة مديرين وتحديد صلاحياتهم");
  }

  if (admin.canManageCouriers) {
    permissions.push("تحديث حالات المندوبين");
  }

  if (admin.canViewCourierDocuments) {
    permissions.push("عرض مستندات المندوبين");
  }

  if (admin.canManageListings) {
    permissions.push("إدارة الإعلانات والتمييز الذهبي");
  }

  if (admin.canBanMembers) {
    permissions.push("حظر المستخدمين وفك الحظر");
  }

  return permissions.length
    ? `صلاحياتك الحالية: ${permissions.join("، ")}.`
    : "لا توجد صلاحيات إدارية مفعلة لهذا الحساب.";
}

function getCourierStatusClass(status) {
  const classMap = {
    pending: "status-pending",
    approved: "status-approved",
    paused: "status-paused",
  };

  return classMap[status] || "status-pending";
}

function getAuthHeaders() {
  return state.token ? { Authorization: `Bearer ${state.token}` } : {};
}

function clearSession() {
  state.token = "";
  state.admin = null;
  state.couriers = [];
  state.listings = [];
  state.classifieds = [];
  state.members = [];
  state.managers = [];
  state.stats = {
    pendingCouriers: 0,
    approvedCouriers: 0,
    pausedCouriers: 0,
    pendingListings: 0,
    highlightedListings: 0,
    pendingClassifieds: 0,
    openClassifieds: 0,
    bannedMembers: 0,
    totalManagers: 0,
  };
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

async function apiRequest(url, options = {}) {
  const headers = {
    "X-Admin-Panel-Path": ADMIN_PANEL_ACCESS_PATH,
    ...(options.headers || {}),
  };

  if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "حدث خطأ غير متوقع.");
  }

  return data;
}

function toKebabCase(value) {
  return String(value).replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

function formatNumber(value) {
  return new Intl.NumberFormat("ar-SY").format(Number(value || 0));
}

function formatCurrency(value) {
  return `${formatNumber(value)} ل.س`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ar-SY", { dateStyle: "medium" }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeHtmlAttribute(value) {
  return escapeHtml(value).replaceAll("`", "");
}

function normalizeAdminPanelPath(value) {
  const rawPath = String(value || "").trim();

  if (!rawPath) {
    return "/";
  }

  return rawPath.replace(/\/+$/, "") || "/";
}

function renderListingAdminMedia(listing) {
  const imageUrls = listing.imageUrls || (listing.imageUrl ? [listing.imageUrl] : []);

  if (!imageUrls.length) {
    return `<div class="admin-empty">لا توجد صور مرفقة لهذا الإعلان.</div>`;
  }

  return `
    <div class="admin-media-grid">
      ${imageUrls.map((imageUrl, index) => `
        <a class="admin-media-link ${index === 0 ? "admin-media-link-wide" : ""}" href="${escapeHtmlAttribute(imageUrl)}" target="_blank" rel="noopener noreferrer">
          <img src="${escapeHtmlAttribute(imageUrl)}" alt="صورة الإعلان ${index + 1} ${escapeHtmlAttribute(listing.title)}">
          <p class="admin-media-caption">${index === 0 ? "الصورة الرئيسية" : `صورة إضافية ${index + 1}`}</p>
        </a>
      `).join("")}
    </div>
  `;
}
