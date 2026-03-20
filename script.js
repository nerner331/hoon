const SESSION_STORAGE_KEY = "souq-syria-session";
const LEGACY_MEMBER_TOKEN_KEY = "souq-syria-token";

const storedSession = getStoredSession();

const state = {
  sessionType: storedSession?.type || "",
  token: storedSession?.token || "",
  currentAuthPanel: "register",
  currentCategory: "الكل",
  query: "",
  listings: [],
  currentMember: null,
  currentCourier: null,
  accountSummary: getEmptyAccountSummary(),
  courierProgram: {
    totalCouriers: 0,
    cities: [],
    rates: [],
  },
};

const previewUrls = {
  listing: "",
  identity: "",
  live: "",
};

const membersCountElement = document.querySelector("#membersCount");
const listingsCountElement = document.querySelector("#listingsCount");
const featuredCountElement = document.querySelector("#featuredCount");
const citiesCountElement = document.querySelector("#citiesCount");
const featuredGrid = document.querySelector("#featuredGrid");
const listingsGrid = document.querySelector("#listingsGrid");
const listingEmpty = document.querySelector("#listingEmpty");
const searchInput = document.querySelector("#searchInput");
const searchButton = document.querySelector("#searchButton");
const authMessage = document.querySelector("#authMessage");
const listingMessage = document.querySelector("#listingMessage");
const courierMessage = document.querySelector("#courierMessage");
const registerForm = document.querySelector("#registerForm");
const loginForm = document.querySelector("#loginForm");
const courierLoginForm = document.querySelector("#courierLoginForm");
const listingForm = document.querySelector("#listingForm");
const courierForm = document.querySelector("#courierForm");
const imageInput = document.querySelector("#imageInput");
const identityImageInput = document.querySelector("#identityImageInput");
const livePhotoInput = document.querySelector("#livePhotoInput");
const imagePreview = document.querySelector("#imagePreview");
const identityPreview = document.querySelector("#identityPreview");
const livePhotoPreview = document.querySelector("#livePhotoPreview");
const authShell = document.querySelector(".auth-shell");
const accountSummaryTitle = document.querySelector("#accountSummaryTitle");
const accountSummaryNote = document.querySelector("#accountSummaryNote");
const memberSummaryGrid = document.querySelector("#memberSummaryGrid");
const courierSummaryGrid = document.querySelector("#courierSummaryGrid");
const myListingsCount = document.querySelector("#myListingsCount");
const favoriteListingsCount = document.querySelector("#favoriteListingsCount");
const myListingsMini = document.querySelector("#myListingsMini");
const favoriteListingsMini = document.querySelector("#favoriteListingsMini");
const courierStatusBadge = document.querySelector("#courierStatusBadge");
const courierVehicleState = document.querySelector("#courierVehicleState");
const courierJoinDate = document.querySelector("#courierJoinDate");
const courierIdentityState = document.querySelector("#courierIdentityState");
const courierCoverageState = document.querySelector("#courierCoverageState");
const courierRateCity = document.querySelector("#courierRateCity");
const courierRateList = document.querySelector("#courierRateList");
const courierCountElement = document.querySelector("#courierCount");
const courierRatesGrid = document.querySelector("#courierRatesGrid");
const logoutButton = document.querySelector("#logoutButton");
const authTabs = document.querySelectorAll(".auth-tab");
const authJumpButtons = document.querySelectorAll("[data-auth-target]");
const categoryButtons = document.querySelectorAll(".category-pill");

bootstrap();

async function bootstrap() {
  bindEvents();
  switchAuthPanel(state.currentAuthPanel);
  await loadAppData();
}

function bindEvents() {
  authTabs.forEach((button) => {
    button.addEventListener("click", () => switchAuthPanel(button.dataset.panel));
  });

  authJumpButtons.forEach((button) => {
    button.addEventListener("click", () => {
      switchAuthPanel(button.dataset.authTarget);
    });
  });

  categoryButtons.forEach((button) => {
    button.addEventListener("click", () => {
      categoryButtons.forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.currentCategory = button.dataset.category;
      renderListings();
    });
  });

  searchInput.addEventListener("input", () => {
    state.query = searchInput.value.trim();
    renderListings();
  });

  searchButton.addEventListener("click", () => {
    state.query = searchInput.value.trim();
    renderListings();
    document.querySelector("#listings").scrollIntoView({ behavior: "smooth" });
  });

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleRegister();
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleLogin();
  });

  courierLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleCourierLogin();
  });

  listingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleListingSubmit();
  });

  courierForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleCourierApplication();
  });

  imageInput.addEventListener("change", () => {
    updateFilePreview(imageInput, imagePreview, "listing", "معاينة صورة الإعلان");
  });

  identityImageInput.addEventListener("change", () => {
    updateFilePreview(identityImageInput, identityPreview, "identity", "صورة الهوية الشخصية");
  });

  livePhotoInput.addEventListener("change", () => {
    updateFilePreview(livePhotoInput, livePhotoPreview, "live", "صورة مباشرة للمندوب");
  });

  logoutButton.addEventListener("click", async () => {
    await handleLogout();
  });
}

async function loadAppData() {
  try {
    const [statsResponse, listingsResponse, courierProgramResponse] = await Promise.all([
      apiRequest("/api/stats"),
      apiRequest("/api/listings"),
      apiRequest("/api/courier-program"),
    ]);

    state.listings = listingsResponse.listings;
    state.courierProgram = courierProgramResponse;

    renderStats(statsResponse);
    renderCourierProgram();
    renderFeatured();
    renderListings();

    if (!state.token) {
      renderSessionState();
      renderAccountSummary();
      return;
    }

    if (state.sessionType === "courier") {
      await loadCurrentCourier();
      return;
    }

    await loadCurrentMember();
  } catch (error) {
    authMessage.textContent = error.message;
  }
}

async function loadCurrentMember() {
  try {
    const response = await apiRequest("/api/me", {
      headers: getAuthHeaders(),
    });

    state.currentMember = response.member;
    state.currentCourier = null;
    state.sessionType = "member";
    state.accountSummary = response.summary || getEmptyAccountSummary();
    renderSessionState();
    renderAccountSummary();
    renderListings();
  } catch {
    clearSession();
    renderSessionState();
    renderAccountSummary();
  }
}

async function loadCurrentCourier() {
  try {
    const response = await apiRequest("/api/couriers/me", {
      headers: getAuthHeaders(),
    });

    state.currentCourier = response.courier;
    state.currentMember = null;
    state.sessionType = "courier";
    renderSessionState();
    renderAccountSummary();
    renderListings();
  } catch {
    clearSession();
    renderSessionState();
    renderAccountSummary();
  }
}

function renderStats(stats) {
  membersCountElement.textContent = formatNumber(stats.totalMembers);
  listingsCountElement.textContent = formatNumber(stats.totalListings);
  featuredCountElement.textContent = formatNumber(stats.featuredListings);
  citiesCountElement.textContent = formatNumber(stats.totalCities);
}

function renderCourierProgram() {
  courierCountElement.textContent = formatNumber(state.courierProgram.totalCouriers);

  const groupedRates = groupRatesByCity(state.courierProgram.rates, state.courierProgram.cities);

  if (!groupedRates.length) {
    courierRatesGrid.innerHTML = `<p class="empty-state">سيتم إضافة نسب التوصيل قريبًا.</p>`;
    return;
  }

  courierRatesGrid.innerHTML = groupedRates.map(({ city, rates }) => `
    <article class="courier-rate-card">
      <div>
        <h4>${escapeHtml(city)}</h4>
        <p>${city === "محافظات أخرى" ? "للطلبات الخارجة عن المدن الرئيسية." : "نسب مبدئية قبل تثبيت المهمة."}</p>
      </div>
      <ul>
        ${rates.map((rate) => `
          <li>
            <span>${escapeHtml(rate.category)}</span>
            <strong>${formatPercentage(rate.percentage)}</strong>
          </li>
        `).join("")}
      </ul>
    </article>
  `).join("");
}

function renderFeatured() {
  const featuredListings = [...state.listings]
    .filter((listing) => listing.isAdminHighlighted || listing.isFeatured)
    .sort((left, right) => {
      const leftPriority = (left.isAdminHighlighted ? 2 : 0) + (left.isFeatured ? 1 : 0);
      const rightPriority = (right.isAdminHighlighted ? 2 : 0) + (right.isFeatured ? 1 : 0);

      if (rightPriority !== leftPriority) {
        return rightPriority - leftPriority;
      }

      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });

  if (featuredListings.length === 0) {
    featuredGrid.innerHTML = `<p class="empty-state">لا توجد إعلانات ذهبية أو مميزة حاليًا.</p>`;
    return;
  }

  featuredGrid.innerHTML = featuredListings.slice(0, 3).map((listing, index) => `
    <article class="featured-card ${listing.isAdminHighlighted ? "gold-card" : index === 0 ? "premium" : ""}">
      ${renderListingMedia(listing, { featured: true })}
      <div class="featured-tags">
        ${listing.isAdminHighlighted ? '<div class="featured-badge gold-badge">إعلان ذهبي</div>' : ""}
        ${listing.isFeatured ? `<div class="featured-badge ${listing.isAdminHighlighted ? "featured-badge-soft" : ""}">${index === 0 && !listing.isAdminHighlighted ? "مميز ومدفوع" : "إعلان مميز"}</div>` : ""}
      </div>
      <h3>${escapeHtml(listing.title)}</h3>
      <p>${escapeHtml(listing.description)}</p>
      <div class="featured-meta">
        <span>${escapeHtml(listing.category)}</span>
        <span>${escapeHtml(listing.city)}</span>
        <span>${formatCurrency(listing.price)}</span>
      </div>
      <button class="${index === 0 ? "primary-button" : "secondary-button"}" type="button" data-phone="${escapeHtmlAttribute(listing.sellerPhone)}">
        تواصل مع ${escapeHtml(listing.sellerName)}
      </button>
    </article>
  `).join("");

  featuredGrid.querySelectorAll("button[data-phone]").forEach((button) => {
    button.addEventListener("click", () => {
      window.location.href = `tel:${button.dataset.phone}`;
    });
  });
}

function renderListings() {
  const filteredListings = state.listings.filter((listing) => {
    const matchesCategory = state.currentCategory === "الكل" || listing.category === state.currentCategory;
    const normalizedQuery = state.query.toLowerCase();
    const matchesQuery = !normalizedQuery || [
      listing.title,
      listing.description,
      listing.city,
      listing.category,
      listing.sellerName,
    ].some((value) => String(value).toLowerCase().includes(normalizedQuery));

    return matchesCategory && matchesQuery;
  });

  listingEmpty.classList.toggle("hidden", filteredListings.length > 0);

  listingsGrid.innerHTML = filteredListings.map((listing, index) => `
    <article class="product-card ${getListingTileClass(index, listing)}">
      ${renderListingMedia(listing)}
      <div class="product-content">
        <div class="listing-row">
          <h3>${escapeHtml(listing.title)}</h3>
          <span class="price">${formatCurrency(listing.price)}</span>
        </div>
        ${listing.isAdminHighlighted ? '<span class="gold-frame-badge">إطار ذهبي</span>' : ""}
        <span class="category-badge">${escapeHtml(listing.category)}</span>
        <p>${escapeHtml(listing.description)}</p>
        <div class="product-footer">
          <span>${escapeHtml(listing.city)} | ${escapeHtml(listing.sellerName)}</span>
          <div class="product-actions">
            ${renderFavoriteButton(listing)}
            <a href="tel:${escapeHtmlAttribute(listing.sellerPhone)}">اتصل بالبائع</a>
          </div>
        </div>
      </div>
    </article>
  `).join("");

  listingsGrid.querySelectorAll(".favorite-button[data-listing-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleFavoriteToggle(Number(button.dataset.listingId));
    });
  });
}

function renderSessionState() {
  const loggedIn = Boolean(state.token) && (Boolean(state.currentMember) || Boolean(state.currentCourier));

  authShell.classList.toggle("hidden", loggedIn);
  logoutButton.classList.toggle("hidden", !loggedIn);

  if (!loggedIn) {
    switchAuthPanel(state.currentAuthPanel || "register");
  }
}

function switchAuthPanel(panelName) {
  state.currentAuthPanel = panelName;

  authTabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.panel === panelName);
  });

  registerForm.classList.toggle("auth-form-active", panelName === "register");
  loginForm.classList.toggle("auth-form-active", panelName === "login");
  courierLoginForm.classList.toggle("auth-form-active", panelName === "courier-login");
}

async function handleRegister() {
  authMessage.textContent = "جارٍ إنشاء الحساب...";

  const payload = Object.fromEntries(new FormData(registerForm).entries());

  try {
    const response = await apiRequest("/api/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    setSession("member", response.token, response.member);
    registerForm.reset();
    authMessage.textContent = response.message;
    await refreshDynamicData();
  } catch (error) {
    authMessage.textContent = error.message;
  }
}

async function handleLogin() {
  authMessage.textContent = "جارٍ تسجيل الدخول...";

  const payload = Object.fromEntries(new FormData(loginForm).entries());

  try {
    const response = await apiRequest("/api/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    setSession("member", response.token, response.member);
    loginForm.reset();
    authMessage.textContent = response.message;
    await refreshDynamicData();
  } catch (error) {
    authMessage.textContent = error.message;
  }
}

async function handleCourierLogin() {
  authMessage.textContent = "جارٍ تسجيل دخول المندوب...";

  const payload = Object.fromEntries(new FormData(courierLoginForm).entries());

  try {
    const response = await apiRequest("/api/couriers/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    setSession("courier", response.token, response.courier);
    courierLoginForm.reset();
    authMessage.textContent = response.message;
    await refreshDynamicData();
  } catch (error) {
    authMessage.textContent = error.message;
  }
}

async function handleCourierApplication() {
  courierMessage.textContent = "جارٍ إرسال طلب الانضمام...";

  const formData = new FormData(courierForm);

  try {
    const response = await apiRequest("/api/couriers/apply", {
      method: "POST",
      body: formData,
    });

    setSession("courier", response.token, response.courier);
    courierForm.reset();
    resetFilePreview(identityPreview, "identity", "ستظهر معاينة الهوية هنا");
    resetFilePreview(livePhotoPreview, "live", "ستظهر الصورة المباشرة هنا");
    courierMessage.textContent = response.message;
    await refreshDynamicData();
    document.querySelector("#members").scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    courierMessage.textContent = error.message;
  }
}

async function handleLogout() {
  const logoutPath = state.sessionType === "courier" ? "/api/couriers/logout" : "/api/logout";

  try {
    await apiRequest(logoutPath, {
      method: "POST",
      headers: getAuthHeaders(),
    });
  } catch {
    // تجاهل الخطأ لأننا سنمسح الجلسة المحلية في كل الأحوال.
  }

  const logoutMessage = state.sessionType === "courier" ? "تم تسجيل خروج المندوب." : "تم تسجيل الخروج.";
  clearSession();
  authMessage.textContent = logoutMessage;
  listingMessage.textContent = "";
  courierMessage.textContent = "";
  renderSessionState();
  renderAccountSummary();
  renderListings();
}

async function handleListingSubmit() {
  listingMessage.textContent = "جارٍ حفظ الإعلان...";

  if (!state.token) {
    listingMessage.textContent = "يجب تسجيل الدخول أولًا قبل نشر الإعلان.";
    document.querySelector("#members").scrollIntoView({ behavior: "smooth" });
    return;
  }

  if (state.sessionType !== "member") {
    listingMessage.textContent = "الحساب الحالي خاص بالمندوب. استخدم حساب عضو لنشر الإعلانات.";
    document.querySelector("#members").scrollIntoView({ behavior: "smooth" });
    return;
  }

  const formData = new FormData(listingForm);

  try {
    const response = await apiRequest("/api/listings", {
      method: "POST",
      headers: getAuthHeaders(),
      body: formData,
    });

    listingForm.reset();
    resetFilePreview(imagePreview, "listing", "ستظهر معاينة الصورة هنا بعد الاختيار");
    listingMessage.textContent = response.message;
    await refreshDynamicData();
    document.querySelector("#listings").scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    listingMessage.textContent = error.message;
  }
}

async function refreshDynamicData() {
  const [statsResponse, listingsResponse, courierProgramResponse] = await Promise.all([
    apiRequest("/api/stats"),
    apiRequest("/api/listings"),
    apiRequest("/api/courier-program"),
  ]);

  state.listings = listingsResponse.listings;
  state.courierProgram = courierProgramResponse;

  renderStats(statsResponse);
  renderCourierProgram();
  renderFeatured();
  renderListings();

  if (!state.token) {
    renderAccountSummary();
    return;
  }

  if (state.sessionType === "courier") {
    await loadCurrentCourier();
    return;
  }

  await loadCurrentMember();
}

function setSession(type, token, entity) {
  state.sessionType = type;
  state.token = token;
  state.currentMember = type === "member" ? entity : null;
  state.currentCourier = type === "courier" ? entity : null;
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ type, token }));

  if (type === "member") {
    localStorage.setItem(LEGACY_MEMBER_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(LEGACY_MEMBER_TOKEN_KEY);
  }

  renderSessionState();
}

function clearSession() {
  state.token = "";
  state.sessionType = "";
  state.currentMember = null;
  state.currentCourier = null;
  state.accountSummary = getEmptyAccountSummary();
  localStorage.removeItem(SESSION_STORAGE_KEY);
  localStorage.removeItem(LEGACY_MEMBER_TOKEN_KEY);
}

function renderAccountSummary() {
  const loggedIn = Boolean(state.token) && (Boolean(state.currentMember) || Boolean(state.currentCourier));

  if (!loggedIn) {
    memberSummaryGrid.classList.remove("hidden");
    courierSummaryGrid.classList.add("hidden");
    accountSummaryTitle.textContent = "إعلاناتي والمفضلة";
    accountSummaryNote.textContent = "سجّل الدخول لعرض إعلاناتك الشخصية والإعلانات المفضلة فقط.";
    myListingsCount.textContent = "0";
    favoriteListingsCount.textContent = "0";
    myListingsMini.innerHTML = `<div class="mini-empty">لا توجد إعلانات شخصية بعد.</div>`;
    favoriteListingsMini.innerHTML = `<div class="mini-empty">لا توجد إعلانات مفضلة بعد.</div>`;
    return;
  }

  if (state.sessionType === "courier" && state.currentCourier) {
    renderCourierSummary();
    return;
  }

  renderMemberSummary();
}

function renderMemberSummary() {
  const personalListings = state.accountSummary.personalListings || [];
  const favoriteListings = state.accountSummary.favoriteListings || [];

  memberSummaryGrid.classList.remove("hidden");
  courierSummaryGrid.classList.add("hidden");
  accountSummaryTitle.textContent = `حساب ${state.currentMember.fullName}`;
  accountSummaryNote.textContent = "عرض مختصر لإعلاناتك الشخصية والإعلانات التي حفظتها في المفضلة.";
  myListingsCount.textContent = formatNumber(personalListings.length);
  favoriteListingsCount.textContent = formatNumber(favoriteListings.length);
  myListingsMini.innerHTML = renderMiniListings(personalListings, "لا توجد إعلانات شخصية حتى الآن.");
  favoriteListingsMini.innerHTML = renderMiniListings(favoriteListings, "لا توجد إعلانات محفوظة في المفضلة.");
}

function renderCourierSummary() {
  const rates = getRatesForCity(state.currentCourier.city);
  const coverageText = state.currentCourier.coverageCities || state.currentCourier.city;
  const imagesCompleted = state.currentCourier.identityImageUrl && state.currentCourier.livePhotoUrl;

  memberSummaryGrid.classList.add("hidden");
  courierSummaryGrid.classList.remove("hidden");
  accountSummaryTitle.textContent = `حساب المندوب ${state.currentCourier.fullName}`;
  accountSummaryNote.textContent = "متابعة حالة طلب المندوب ونسب التوصيل الخاصة بالمحافظة المعتمدة.";
  courierStatusBadge.textContent = state.currentCourier.statusLabel;
  courierVehicleState.textContent = `نوع المركبة: ${state.currentCourier.vehicleType}`;
  courierJoinDate.textContent = `تاريخ الانضمام: ${formatDate(state.currentCourier.createdAt)}`;
  courierIdentityState.textContent = imagesCompleted
    ? "الهوية والصورة المباشرة مكتملتان"
    : "الهوية أو الصورة المباشرة ما زالت غير مكتملة";
  courierCoverageState.textContent = `نطاق العمل: ${coverageText}`;
  courierRateCity.textContent = state.currentCourier.city;
  courierRateList.innerHTML = renderCourierRateMiniList(rates);
}

function renderMiniListings(listings, emptyText) {
  if (!listings.length) {
    return `<div class="mini-empty">${emptyText}</div>`;
  }

  return listings.slice(0, 4).map((listing) => `
    <article class="mini-item">
      <p class="mini-item-title">${escapeHtml(listing.title)}</p>
      <p class="mini-item-meta">${formatCurrency(listing.price)} | ${escapeHtml(listing.city)}</p>
    </article>
  `).join("");
}

function renderCourierRateMiniList(rates) {
  if (!rates.length) {
    return `<div class="mini-empty">لا توجد نسب متاحة لهذه المحافظة بعد.</div>`;
  }

  return rates.map((rate) => `
    <article class="mini-item">
      <p class="mini-item-title">${escapeHtml(rate.category)}</p>
      <p class="mini-item-meta">نسبة التوصيل: ${formatPercentage(rate.percentage)}</p>
    </article>
  `).join("");
}

async function handleFavoriteToggle(listingId) {
  if (!state.token) {
    authMessage.textContent = "سجّل الدخول أولًا لإضافة الإعلانات إلى المفضلة.";
    document.querySelector("#members").scrollIntoView({ behavior: "smooth" });
    return;
  }

  if (state.sessionType !== "member") {
    authMessage.textContent = "حساب المندوب لا يدعم المفضلة. استخدم حساب عضو لحفظ الإعلانات.";
    document.querySelector("#members").scrollIntoView({ behavior: "smooth" });
    return;
  }

  try {
    const response = await apiRequest("/api/favorites", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ listingId }),
    });

    state.accountSummary = response.summary || getEmptyAccountSummary();
    renderAccountSummary();
    renderListings();
  } catch (error) {
    authMessage.textContent = error.message;
  }
}

function updateFilePreview(inputElement, previewElement, previewKey, altText) {
  const [file] = inputElement.files || [];

  if (!file) {
    return;
  }

  if (previewUrls[previewKey]) {
    URL.revokeObjectURL(previewUrls[previewKey]);
  }

  const objectUrl = URL.createObjectURL(file);
  previewUrls[previewKey] = objectUrl;
  previewElement.classList.remove("placeholder");
  previewElement.innerHTML = `<img src="${escapeHtmlAttribute(objectUrl)}" alt="${escapeHtmlAttribute(altText)}">`;
}

function resetFilePreview(previewElement, previewKey, placeholderText) {
  if (previewUrls[previewKey]) {
    URL.revokeObjectURL(previewUrls[previewKey]);
    previewUrls[previewKey] = "";
  }

  previewElement.classList.add("placeholder");
  previewElement.innerHTML = `<span>${placeholderText}</span>`;
}

function renderListingMedia(listing, options = {}) {
  if (listing.imageUrl) {
    const photoClass = options.featured ? "listing-photo featured-photo" : "listing-photo";
    return `<img class="${photoClass}" src="${escapeHtmlAttribute(listing.imageUrl)}" alt="${escapeHtmlAttribute(listing.title)}">`;
  }

  const fallbackClass = getCategoryImageClass(listing.category);
  const mediaClass = options.featured ? "product-image featured-photo" : "product-image";
  return `<div class="${mediaClass} ${fallbackClass}"></div>`;
}

function renderFavoriteButton(listing) {
  if (state.sessionType === "courier") {
    return "";
  }

  if (state.currentMember && listing.sellerId === state.currentMember.id) {
    return "";
  }

  const isSaved = state.accountSummary.favoriteListingIds.includes(listing.id);
  const label = isSaved ? "محفوظ" : "المفضلة";
  const activeClass = isSaved ? "active" : "";

  return `
    <button class="favorite-button ${activeClass}" type="button" data-listing-id="${listing.id}">
      ${label}
    </button>
  `;
}

function getListingTileClass(index, listing) {
  const themes = [
    "tile-tone-sand",
    "tile-tone-sage",
    "tile-tone-slate",
  ];
  const themeClass = themes[index % themes.length];

  return `${themeClass} ${listing.isFeatured ? "tile-highlight" : ""} ${listing.isAdminHighlighted ? "tile-gold-frame" : ""}`.trim();
}

function getAuthHeaders() {
  return state.token ? { Authorization: `Bearer ${state.token}` } : {};
}

function getRatesForCity(city) {
  const exactRates = state.courierProgram.rates.filter((rate) => rate.city === city);

  return exactRates.length
    ? exactRates
    : state.courierProgram.rates.filter((rate) => rate.city === "محافظات أخرى");
}

function groupRatesByCity(rates, cityOrder) {
  const buckets = new Map();

  cityOrder.forEach((city) => {
    buckets.set(city, []);
  });

  rates.forEach((rate) => {
    if (!buckets.has(rate.city)) {
      buckets.set(rate.city, []);
    }

    buckets.get(rate.city).push(rate);
  });

  return [...buckets.entries()]
    .map(([city, cityRates]) => ({ city, rates: cityRates }))
    .filter((entry) => entry.rates.length > 0);
}

async function apiRequest(url, options = {}) {
  const headers = {
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

function getEmptyAccountSummary() {
  return {
    personalListings: [],
    favoriteListings: [],
    favoriteListingIds: [],
  };
}

function getStoredSession() {
  try {
    const rawSession = localStorage.getItem(SESSION_STORAGE_KEY);

    if (rawSession) {
      const parsed = JSON.parse(rawSession);

      if (parsed && typeof parsed.token === "string" && typeof parsed.type === "string") {
        return parsed;
      }
    }
  } catch {
    // تجاهل أخطاء القراءة من التخزين المحلي.
  }

  const legacyToken = localStorage.getItem(LEGACY_MEMBER_TOKEN_KEY);

  if (legacyToken) {
    return { type: "member", token: legacyToken };
  }

  return null;
}

function getCategoryImageClass(category) {
  const map = {
    "موبايلات": "phone",
    "إلكترونيات": "electronics",
    "أثاث": "furniture",
    "أجهزة منزلية": "appliance",
    "دراجات": "bike",
  };

  return map[category] || "default";
}

function formatCurrency(value) {
  return `${formatNumber(value)} ل.س`;
}

function formatPercentage(value) {
  return `${formatNumber(value)}%`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("ar-SY").format(Number(value || 0));
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
