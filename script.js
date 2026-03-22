const SESSION_STORAGE_KEY = "souq-syria-session";
const LEGACY_MEMBER_TOKEN_KEY = "souq-syria-token";
const MAX_LISTING_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_LISTING_IMAGES = 5;
const MAX_LISTING_DESCRIPTION_LENGTH = 1000;
const PLATFORM_SUPPORT_WHATSAPP_NUMBER = "963933001122";
const ALLOWED_LISTING_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const LISTING_PREVIEW_PLACEHOLDER = "ستظهر معاينة الصورة هنا بعد الالتقاط المباشر";
const LISTING_CAMERA_UNAVAILABLE_MESSAGE = "يتطلب نشر الإعلان متصفحًا يدعم التقاط صورة مباشرة من الكاميرا.";
const currentPage = document.body?.dataset.page || "";
const PAGE_URLS = {
  home: "index.html",
  account: "account.html",
  sell: "sell.html",
  classifieds: "classifieds.html",
  courier: "courier.html",
};
const SYRIAN_CITIES = Object.freeze([
  "دمشق",
  "ريف دمشق",
  "دوما",
  "حرستا",
  "جرمانا",
  "داريا",
  "المعضمية",
  "صحنايا",
  "قدسيا",
  "التل",
  "النبك",
  "يبرود",
  "الزبداني",
  "قطنا",
  "الكسوة",
  "سقبا",
  "عربين",
  "زملكا",
  "كفر بطنا",
  "حلب",
  "منبج",
  "الباب",
  "إعزاز",
  "عفرين",
  "جرابلس",
  "السفيرة",
  "الأتارب",
  "دير حافر",
  "تل رفعت",
  "مارع",
  "حمص",
  "تدمر",
  "الرستن",
  "تلبيسة",
  "القصير",
  "تلكلخ",
  "القريتين",
  "الحولة",
  "المخرم",
  "حماة",
  "سلمية",
  "مصياف",
  "محردة",
  "السقيلبية",
  "صوران",
  "كفرزيتا",
  "طيبة الإمام",
  "اللاذقية",
  "جبلة",
  "القرداحة",
  "الحفة",
  "كسب",
  "طرطوس",
  "بانياس",
  "صافيتا",
  "الدريكيش",
  "الشيخ بدر",
  "إدلب",
  "معرة النعمان",
  "أريحا",
  "جسر الشغور",
  "سراقب",
  "خان شيخون",
  "بنش",
  "الدانا",
  "حارم",
  "درعا",
  "إزرع",
  "الصنمين",
  "نوى",
  "جاسم",
  "بصرى الشام",
  "داعل",
  "الحراك",
  "طفس",
  "السويداء",
  "شهبا",
  "صلخد",
  "عريقة",
  "دير الزور",
  "الميادين",
  "البوكمال",
  "العشارة",
  "الرقة",
  "الطبقة",
  "تل أبيض",
  "عين عيسى",
  "الحسكة",
  "القامشلي",
  "رأس العين",
  "المالكية",
  "عامودا",
  "الدرباسية",
  "الشدادي",
  "تل تمر",
  "القنيطرة",
  "خان أرنبة",
  "مدينة البعث",
  "حضر",
]);

const storedSession = getStoredSession();

const state = {
  sessionType: storedSession?.type || "",
  token: storedSession?.token || "",
  currentAuthPanel: "register",
  currentCategory: "الكل",
  currentCity: "all",
  listingSort: "newest",
  query: "",
  listings: [],
  classifieds: [],
  currentClassifiedType: "all",
  classifiedQuery: "",
  currentMember: null,
  currentCourier: null,
  accountSummary: getEmptyAccountSummary(),
  courierProgram: {
    totalCouriers: 0,
    cities: [],
    rates: [],
  },
};

const listingGalleryIndexes = Object.create(null);

const previewUrls = {
  identity: "",
  live: "",
};

const listingCameraState = {
  stream: null,
  files: [],
};

const membersCountElement = document.querySelector("#membersCount");
const listingsCountElement = document.querySelector("#listingsCount");
const featuredCountElement = document.querySelector("#featuredCount");
const citiesCountElement = document.querySelector("#citiesCount");
const featuredGrid = document.querySelector("#featuredGrid");
const listingsGrid = document.querySelector("#listingsGrid");
const listingEmpty = document.querySelector("#listingEmpty");
const classifiedGrid = document.querySelector("#classifiedGrid");
const classifiedEmpty = document.querySelector("#classifiedEmpty");
const searchInput = document.querySelector("#searchInput");
const searchButton = document.querySelector("#searchButton");
const listingCityFilter = document.querySelector("#listingCityFilter");
const listingSortSelect = document.querySelector("#listingSortSelect");
const listingResetFilters = document.querySelector("#listingResetFilters");
const listingResultsLabel = document.querySelector("#listingResultsLabel");
const classifiedSearchInput = document.querySelector("#classifiedSearchInput");
const classifiedSearchButton = document.querySelector("#classifiedSearchButton");
const authMessage = document.querySelector("#authMessage");
const listingMessage = document.querySelector("#listingMessage");
const classifiedMessage = document.querySelector("#classifiedMessage");
const courierMessage = document.querySelector("#courierMessage");
const registerForm = document.querySelector("#registerForm");
const loginForm = document.querySelector("#loginForm");
const courierLoginForm = document.querySelector("#courierLoginForm");
const listingForm = document.querySelector("#listingForm");
const classifiedForm = document.querySelector("#classifiedForm");
const courierForm = document.querySelector("#courierForm");
const identityImageInput = document.querySelector("#identityImageInput");
const livePhotoInput = document.querySelector("#livePhotoInput");
const listingPreviewGrid = document.querySelector("#listingPreviewGrid");
const listingPreviewEmpty = document.querySelector("#listingPreviewEmpty");
const identityPreview = document.querySelector("#identityPreview");
const livePhotoPreview = document.querySelector("#livePhotoPreview");
const openListingCameraButton = document.querySelector("#openListingCameraButton");
const captureListingCameraButton = document.querySelector("#captureListingCameraButton");
const cancelListingCameraButton = document.querySelector("#cancelListingCameraButton");
const clearListingImageButton = document.querySelector("#clearListingImageButton");
const listingCameraPanel = document.querySelector("#listingCameraPanel");
const listingCameraVideo = document.querySelector("#listingCameraVideo");
const listingCameraCanvas = document.querySelector("#listingCameraCanvas");
const imagePolicyNote = document.querySelector("#imagePolicyNote");
const authShell = document.querySelector(".auth-shell");
const accountSummaryTitle = document.querySelector("#accountSummaryTitle");
const accountSummaryNote = document.querySelector("#accountSummaryNote");
const memberSummaryGrid = document.querySelector("#memberSummaryGrid");
const courierSummaryGrid = document.querySelector("#courierSummaryGrid");
const myListingsCount = document.querySelector("#myListingsCount");
const myClassifiedsCount = document.querySelector("#myClassifiedsCount");
const favoriteListingsCount = document.querySelector("#favoriteListingsCount");
const myListingsMini = document.querySelector("#myListingsMini");
const myClassifiedsMini = document.querySelector("#myClassifiedsMini");
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
const categoryTabShell = document.querySelector("#categoryTabShell");
const activeCategoryLabel = document.querySelector("#activeCategoryLabel");
const quickCityButtons = document.querySelectorAll(".tag-btn[data-city]");
const classifiedTypeButtons = document.querySelectorAll(".classified-type-pill");

bootstrap();

async function bootstrap() {
  bindEvents();
  initializeListingCameraControls();
  renderListingImagePreviews();
  switchAuthPanel(getInitialAuthPanel());
  await loadAppData();
}

function bindEvents() {
  authTabs.forEach((button) => {
    button.addEventListener("click", () => switchAuthPanel(button.dataset.panel));
  });

  authJumpButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      const panelName = button.dataset.authTarget || "login";

      if (!hasAnyAuthPanel()) {
        event.preventDefault();
        navigateTo(panelName === "courier-login" ? "courier" : "account", panelName);
        return;
      }

      switchAuthPanel(panelName);
      updateAuthPanelLocation(panelName);
    });
  });

  categoryButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.currentCategory = button.dataset.category;
      syncCategoryState();
      if (categoryTabShell) {
        categoryTabShell.open = false;
      }
      renderListings();
    });
  });

  quickCityButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.currentCity = button.dataset.city || "all";
      if (listingCityFilter) {
        listingCityFilter.value = state.currentCity;
      }
      syncListingToolbarState();
      renderListings();
      scrollToSelectorOrNavigate("#listings", `${getPageUrl("home")}#listings`);
    });
  });

  classifiedTypeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      classifiedTypeButtons.forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.currentClassifiedType = button.dataset.classifiedType;
      renderClassifieds();
    });
  });

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      state.query = searchInput.value.trim();
      renderListings();
    });
  }

  if (searchButton) {
    searchButton.addEventListener("click", () => {
      state.query = searchInput?.value.trim() || "";
      renderListings();
      scrollToSelectorOrNavigate("#listings", `${getPageUrl("home")}#listings`);
    });
  }

  if (listingCityFilter) {
    listingCityFilter.addEventListener("change", () => {
      state.currentCity = listingCityFilter.value || "all";
      syncListingToolbarState();
      renderListings();
    });
  }

  if (listingSortSelect) {
    listingSortSelect.addEventListener("change", () => {
      state.listingSort = listingSortSelect.value || "newest";
      renderListings();
    });
  }

  if (listingResetFilters) {
    listingResetFilters.addEventListener("click", () => {
      state.query = "";
      state.currentCategory = "الكل";
      state.currentCity = "all";
      state.listingSort = "newest";

      if (searchInput) {
        searchInput.value = "";
      }

      syncCategoryState();
      if (categoryTabShell) {
        categoryTabShell.open = false;
      }
      syncListingToolbarState();
      renderListings();
    });
  }

  if (classifiedSearchInput) {
    classifiedSearchInput.addEventListener("input", () => {
      state.classifiedQuery = classifiedSearchInput.value.trim();
      renderClassifieds();
    });
  }

  if (classifiedSearchButton) {
    classifiedSearchButton.addEventListener("click", () => {
      state.classifiedQuery = classifiedSearchInput?.value.trim() || "";
      renderClassifieds();
      scrollToSelectorOrNavigate("#classifieds", `${getPageUrl("classifieds")}#classifieds`);
    });
  }

  if (registerForm) {
    registerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await handleRegister();
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await handleLogin();
    });
  }

  if (courierLoginForm) {
    courierLoginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await handleCourierLogin();
    });
  }

  if (listingForm) {
    listingForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await handleListingSubmit();
    });
  }

  if (classifiedForm) {
    classifiedForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await handleClassifiedSubmit();
    });
  }

  if (courierForm) {
    courierForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await handleCourierApplication();
    });
  }

  if (identityImageInput) {
    identityImageInput.addEventListener("change", () => {
      updateFilePreview(identityImageInput, identityPreview, "identity", "صورة الهوية الشخصية");
    });
  }

  if (livePhotoInput) {
    livePhotoInput.addEventListener("change", () => {
      updateFilePreview(livePhotoInput, livePhotoPreview, "live", "صورة مباشرة للمندوب");
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      await handleLogout();
    });
  }

  if (openListingCameraButton) {
    openListingCameraButton.addEventListener("click", async () => {
      await openListingCamera();
    });
  }

  if (captureListingCameraButton) {
    captureListingCameraButton.addEventListener("click", async () => {
      await captureListingPhoto();
    });
  }

  if (cancelListingCameraButton) {
    cancelListingCameraButton.addEventListener("click", () => {
      closeListingCamera();
    });
  }

  if (clearListingImageButton) {
    clearListingImageButton.addEventListener("click", () => {
      clearListingImages();
    });
  }

  window.addEventListener("beforeunload", () => {
    stopListingCameraStream();
  });
}

function hasAnyAuthPanel() {
  return Boolean(registerForm || loginForm || courierLoginForm);
}

function getInitialAuthPanel() {
  const requestedPanel = window.location.hash.replace(/^#/, "").trim();

  if (requestedPanel) {
    if (requestedPanel === "courier-login" && !courierLoginForm) {
      return loginForm ? "login" : "register";
    }

    return requestedPanel;
  }

  if (currentPage === "courier" && courierLoginForm && !registerForm && !loginForm) {
    return "courier-login";
  }

  return state.currentAuthPanel || "register";
}

function updateAuthPanelLocation(panelName) {
  if (!window.history?.replaceState) {
    return;
  }

  const nextHash = panelName ? `#${panelName}` : "";
  window.history.replaceState(null, "", `${window.location.pathname}${nextHash}`);
}

function getPageUrl(pageName) {
  return PAGE_URLS[pageName] || PAGE_URLS.home;
}

function navigateTo(pageName, hash = "") {
  const hashSuffix = hash ? `#${hash}` : "";
  window.location.href = `${getPageUrl(pageName)}${hashSuffix}`;
}

function scrollToSelectorOrNavigate(selector, fallbackUrl = "") {
  const element = document.querySelector(selector);

  if (element) {
    element.scrollIntoView({ behavior: "smooth" });
    return true;
  }

  if (fallbackUrl) {
    window.location.href = fallbackUrl;
  }

  return false;
}

function redirectToMemberLogin() {
  navigateTo("account", "login");
}

function initializeListingCameraControls() {
  if (!openListingCameraButton || !imagePolicyNote) {
    return;
  }

  const supported = canUseListingCameraCapture();

  openListingCameraButton.disabled = !supported;

  if (supported) {
    imagePolicyNote.textContent = "يمكنك التقاط حتى 5 صور مباشرة وواضحة للمنتج. استخدم إضاءة جيدة وثبّت الهاتف قليلًا لتحصل على جودة أفضل.";
    return;
  }

  openListingCameraButton.textContent = "الكاميرا غير متاحة";
  imagePolicyNote.textContent = "هذا المتصفح لا يدعم التقاط صورة مباشرة. استخدم هاتفًا أو متصفحًا يدعم الكاميرا لإرسال الإعلان.";
}

function canUseListingCameraCapture() {
  return Boolean(
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function" &&
    listingCameraVideo &&
    listingCameraCanvas,
  );
}

async function openListingCamera() {
  if (!canUseListingCameraCapture()) {
    listingMessage.textContent = LISTING_CAMERA_UNAVAILABLE_MESSAGE;
    return;
  }

  try {
    stopListingCameraStream();
    listingCameraState.stream = await requestListingCameraStream();
    listingCameraVideo.srcObject = listingCameraState.stream;
    await listingCameraVideo.play().catch(() => {});
    listingCameraPanel.classList.remove("hidden");
    listingMessage.textContent = "وجّه الكاميرا نحو المنتج ثم اضغط على زر التقاط الصورة الآن.";
  } catch (error) {
    listingMessage.textContent = getListingCameraErrorMessage(error);
  }
}

async function requestListingCameraStream() {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
      },
      audio: false,
    });
  } catch (error) {
    if (error && (error.name === "OverconstrainedError" || error.name === "NotFoundError")) {
      return navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
    }

    throw error;
  }
}

async function captureListingPhoto() {
  if (!listingCameraState.stream) {
    listingMessage.textContent = "افتح الكاميرا أولًا ثم التقط صورة المنتج.";
    return;
  }

  try {
    const capturedFile = await createListingCameraFile();
    const validationError = validateListingImageFile(capturedFile);

    if (validationError) {
      listingMessage.textContent = validationError;
      return;
    }

    listingCameraState.file = capturedFile;
    updatePreviewFromFile(capturedFile, imagePreview, "listing", "معاينة صورة الإعلان");
    clearListingImageButton.classList.remove("hidden");
    closeListingCamera();
    listingMessage.textContent = "تم التقاط صورة المنتج مباشرة. يمكنك الآن إرسال الإعلان للمراجعة.";
  } catch (error) {
    listingMessage.textContent = error.message || "تعذر التقاط صورة المنتج الآن.";
  }
}

async function createListingCameraFile() {
  if (!listingCameraVideo.videoWidth || !listingCameraVideo.videoHeight) {
    throw new Error("انتظر حتى تظهر صورة الكاميرا بوضوح ثم التقط الصورة.");
  }

  const { width, height } = getListingCaptureDimensions(listingCameraVideo);
  const context = listingCameraCanvas.getContext("2d");

  if (!context) {
    throw new Error("تعذر تجهيز مساحة التقاط الصورة. حاول مرة أخرى.");
  }

  listingCameraCanvas.width = width;
  listingCameraCanvas.height = height;
  context.drawImage(listingCameraVideo, 0, 0, width, height);

  const blob = await canvasToBlob(listingCameraCanvas, "image/jpeg", 0.88);

  if (!blob) {
    throw new Error("تعذر تجهيز الصورة الملتقطة. حاول مرة أخرى.");
  }

  return new File([blob], `listing-camera-${Date.now()}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

function getListingCaptureDimensions(videoElement) {
  const videoWidth = videoElement.videoWidth || 1280;
  const videoHeight = videoElement.videoHeight || 960;
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(videoWidth, videoHeight));

  return {
    width: Math.max(1, Math.round(videoWidth * scale)),
    height: Math.max(1, Math.round(videoHeight * scale)),
  };
}

function canvasToBlob(canvasElement, type, quality) {
  return new Promise((resolve) => {
    canvasElement.toBlob(resolve, type, quality);
  });
}

function closeListingCamera() {
  stopListingCameraStream();

  if (listingCameraPanel) {
    listingCameraPanel.classList.add("hidden");
  }
}

function stopListingCameraStream() {
  if (listingCameraState.stream) {
    listingCameraState.stream.getTracks().forEach((track) => {
      track.stop();
    });
    listingCameraState.stream = null;
  }

  if (listingCameraVideo?.srcObject) {
    listingCameraVideo.srcObject = null;
  }
}

function clearListingImage() {
  listingCameraState.file = null;
  clearListingImageButton.classList.add("hidden");
  resetFilePreview(imagePreview, "listing", LISTING_PREVIEW_PLACEHOLDER);
  listingMessage.textContent = "تم حذف الصورة. التقط صورة مباشرة جديدة للمتابعة.";
}

function validateListingImageFile(file) {
  if (!file) {
    return "يجب التقاط صورة مباشرة للمنتج قبل إرسال الإعلان.";
  }

  if (!ALLOWED_LISTING_IMAGE_TYPES.has(file.type)) {
    return "الصورة الملتقطة يجب أن تكون بصيغة JPG أو PNG أو WEBP.";
  }

  if (file.size > MAX_LISTING_IMAGE_BYTES) {
    return "حجم الصورة كبير جدًا. التقط صورة أوضح بحجم لا يتجاوز 5 ميغابايت.";
  }

  return "";
}

function getListingCameraErrorMessage(error) {
  if (error && (error.name === "NotAllowedError" || error.name === "SecurityError")) {
    return "يجب السماح بالوصول إلى الكاميرا لالتقاط صورة المنتج.";
  }

  if (error && error.name === "NotFoundError") {
    return "لم يتم العثور على كاميرا متاحة على هذا الجهاز.";
  }

  return "تعذر تشغيل الكاميرا الآن. جرّب مرة أخرى أو استخدم جهازًا يدعم التصوير المباشر.";
}

async function loadAppData() {
  try {
    const [statsResponse, listingsResponse, classifiedsResponse, courierProgramResponse] = await Promise.all([
      apiRequest("/api/stats"),
      apiRequest("/api/listings"),
      apiRequest("/api/classifieds"),
      apiRequest("/api/courier-program"),
    ]);

    state.listings = listingsResponse.listings;
    state.classifieds = classifiedsResponse.classifieds || [];
    state.courierProgram = courierProgramResponse;

    renderStats(statsResponse);
    renderCourierProgram();
    renderFeatured();
    renderListings();
    renderClassifieds();

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
  if (membersCountElement) {
    membersCountElement.textContent = formatNumber(stats.totalMembers);
  }

  if (listingsCountElement) {
    listingsCountElement.textContent = formatNumber(stats.totalListings);
  }

  if (featuredCountElement) {
    featuredCountElement.textContent = formatNumber(stats.featuredListings);
  }

  if (citiesCountElement) {
    citiesCountElement.textContent = formatNumber(stats.totalCities);
  }
}

function renderCourierProgram() {
  if (courierCountElement) {
    courierCountElement.textContent = formatNumber(state.courierProgram.totalCouriers);
  }

  if (!courierRatesGrid) {
    return;
  }

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
      <a class="${index === 0 ? "primary-button" : "secondary-button"} listing-contact-link" href="${escapeHtmlAttribute(getPlatformContactUrl(listing))}" target="_blank" rel="noopener noreferrer">
        اطلب التواصل عبر الإدارة
      </a>
    </article>
  `).join("");
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
            <a class="listing-contact-link" href="${escapeHtmlAttribute(getPlatformContactUrl(listing))}" target="_blank" rel="noopener noreferrer">اطلب التواصل عبر الإدارة</a>
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

  if (authShell) {
    authShell.classList.toggle("hidden", loggedIn);
  }

  if (logoutButton) {
    logoutButton.classList.toggle("hidden", !loggedIn);
  }

  if (!loggedIn) {
    switchAuthPanel(state.currentAuthPanel || "register");
  }
}

function switchAuthPanel(panelName) {
  if (panelName === "courier-login" && !courierLoginForm) {
    panelName = loginForm ? "login" : "register";
  }

  state.currentAuthPanel = panelName;

  authTabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.panel === panelName);
  });

  if (registerForm) {
    registerForm.classList.toggle("auth-form-active", panelName === "register");
  }

  if (loginForm) {
    loginForm.classList.toggle("auth-form-active", panelName === "login");
  }

  if (courierLoginForm) {
    courierLoginForm.classList.toggle("auth-form-active", panelName === "courier-login");
  }
}

async function handleRegister() {
  if (!registerForm) {
    return;
  }

  if (authMessage) {
    authMessage.textContent = "جارٍ إنشاء الحساب...";
  }

  const payload = Object.fromEntries(new FormData(registerForm).entries());

  try {
    const response = await apiRequest("/api/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    setSession("member", response.token, response.member);
    registerForm.reset();
    if (authMessage) {
      authMessage.textContent = response.message;
    }
    await refreshDynamicData();
  } catch (error) {
    if (authMessage) {
      authMessage.textContent = error.message;
    }
  }
}

async function handleLogin() {
  if (!loginForm) {
    return;
  }

  if (authMessage) {
    authMessage.textContent = "جارٍ تسجيل الدخول...";
  }

  const payload = Object.fromEntries(new FormData(loginForm).entries());

  try {
    const response = await apiRequest("/api/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    setSession("member", response.token, response.member);
    loginForm.reset();
    if (authMessage) {
      authMessage.textContent = response.message;
    }
    await refreshDynamicData();
  } catch (error) {
    if (authMessage) {
      authMessage.textContent = error.message;
    }
  }
}

async function handleCourierLogin() {
  if (!courierLoginForm) {
    return;
  }

  if (authMessage) {
    authMessage.textContent = "جارٍ تسجيل دخول المندوب...";
  }

  const payload = Object.fromEntries(new FormData(courierLoginForm).entries());

  try {
    const response = await apiRequest("/api/couriers/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    setSession("courier", response.token, response.courier);
    courierLoginForm.reset();
    if (authMessage) {
      authMessage.textContent = response.message;
    }
    await refreshDynamicData();
  } catch (error) {
    if (authMessage) {
      authMessage.textContent = error.message;
    }
  }
}

async function handleCourierApplication() {
  if (!courierForm) {
    return;
  }

  if (courierMessage) {
    courierMessage.textContent = "جارٍ إرسال طلب الانضمام...";
  }

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
    if (courierMessage) {
      courierMessage.textContent = response.message;
    }
    await refreshDynamicData();
    scrollToSelectorOrNavigate("#courier-access", `${getPageUrl("courier")}#courier-access`);
  } catch (error) {
    if (courierMessage) {
      courierMessage.textContent = error.message;
    }
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
  if (authMessage) {
    authMessage.textContent = logoutMessage;
  }

  if (listingMessage) {
    listingMessage.textContent = "";
  }

  if (classifiedMessage) {
    classifiedMessage.textContent = "";
  }

  if (courierMessage) {
    courierMessage.textContent = "";
  }

  renderSessionState();
  renderAccountSummary();
  renderListings();
}

async function handleListingSubmit() {
  if (!listingForm || !listingMessage) {
    return;
  }

  listingMessage.textContent = "جارٍ حفظ الإعلان...";

  if (!state.token) {
    listingMessage.textContent = "يجب تسجيل الدخول أولًا قبل نشر الإعلان.";
    redirectToMemberLogin();
    return;
  }

  if (state.sessionType !== "member") {
    listingMessage.textContent = "الحساب الحالي خاص بالمندوب. استخدم حساب عضو لنشر الإعلانات.";
    redirectToMemberLogin();
    return;
  }

  if (!canUseListingCameraCapture()) {
    listingMessage.textContent = LISTING_CAMERA_UNAVAILABLE_MESSAGE;
    return;
  }

  const imageValidationError = validateListingImageFile(listingCameraState.file);

  if (imageValidationError) {
    listingMessage.textContent = imageValidationError;
    return;
  }

  const formData = new FormData(listingForm);
  formData.set("image", listingCameraState.file, listingCameraState.file.name);
  formData.set("imageSourceType", "camera");

  try {
    const response = await apiRequest("/api/listings", {
      method: "POST",
      headers: getAuthHeaders(),
      body: formData,
    });

    listingForm.reset();
    clearListingImage();
    listingMessage.textContent = response.message;
    await refreshDynamicData();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    listingMessage.textContent = error.message;
  }
}

async function refreshDynamicData() {
  const [statsResponse, listingsResponse, classifiedsResponse, courierProgramResponse] = await Promise.all([
    apiRequest("/api/stats"),
    apiRequest("/api/listings"),
    apiRequest("/api/classifieds"),
    apiRequest("/api/courier-program"),
  ]);

  state.listings = listingsResponse.listings;
  state.classifieds = classifiedsResponse.classifieds || [];
  state.courierProgram = courierProgramResponse;

  renderStats(statsResponse);
  renderCourierProgram();
  renderFeatured();
  renderListings();
  renderClassifieds();

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
  if (!accountSummaryTitle && !accountSummaryNote && !memberSummaryGrid && !courierSummaryGrid) {
    return;
  }

  const loggedIn = Boolean(state.token) && (Boolean(state.currentMember) || Boolean(state.currentCourier));

  if (!loggedIn) {
    if (memberSummaryGrid) {
      memberSummaryGrid.classList.remove("hidden");
    }

    if (courierSummaryGrid) {
      courierSummaryGrid.classList.add("hidden");
    }

    if (accountSummaryTitle) {
      accountSummaryTitle.textContent = currentPage === "courier" ? "حساب المندوب" : "إعلاناتي والمفضلة";
    }

    if (accountSummaryNote) {
      accountSummaryNote.textContent = currentPage === "courier"
        ? "سجّل دخول المندوب لعرض حالتك."
        : "سجّل الدخول لعرض حسابك هنا.";
    }

    if (myListingsCount) {
      myListingsCount.textContent = "0";
    }

    if (myClassifiedsCount) {
      myClassifiedsCount.textContent = "0";
    }

    if (favoriteListingsCount) {
      favoriteListingsCount.textContent = "0";
    }

    if (myListingsMini) {
      myListingsMini.innerHTML = `<div class="mini-empty">سجّل الدخول لعرض إعلاناتك الشخصية هنا.</div>`;
    }

    if (myClassifiedsMini) {
      myClassifiedsMini.innerHTML = `<div class="mini-empty">لا توجد طلبات أو خدمات محفوظة هنا بعد.</div>`;
    }

    if (favoriteListingsMini) {
      favoriteListingsMini.innerHTML = `<div class="mini-empty">سجّل الدخول لعرض الإعلانات المفضلة هنا.</div>`;
    }

    return;
  }

  if (state.sessionType === "courier" && state.currentCourier) {
    renderCourierSummary();
    return;
  }

  renderMemberSummary();
}

function renderMemberSummary() {
  if (!memberSummaryGrid) {
    return;
  }

  const personalListings = state.accountSummary.personalListings || [];
  const personalClassifieds = state.accountSummary.personalClassifieds || [];
  const favoriteListings = state.accountSummary.favoriteListings || [];

  memberSummaryGrid.classList.remove("hidden");
  if (courierSummaryGrid) {
    courierSummaryGrid.classList.add("hidden");
  }

  if (accountSummaryTitle) {
    accountSummaryTitle.textContent = `حساب ${state.currentMember.fullName}`;
  }

  if (accountSummaryNote) {
    accountSummaryNote.textContent = "هنا تجد إعلاناتك ومفضلتك.";
  }

  if (myListingsCount) {
    myListingsCount.textContent = formatNumber(personalListings.length);
  }

  if (myClassifiedsCount) {
    myClassifiedsCount.textContent = formatNumber(personalClassifieds.length);
  }

  if (favoriteListingsCount) {
    favoriteListingsCount.textContent = formatNumber(favoriteListings.length);
  }

  if (myListingsMini) {
    myListingsMini.innerHTML = renderMiniListings(personalListings, "لا توجد إعلانات شخصية منشورة باسمك حتى الآن.");
  }

  if (myClassifiedsMini) {
    myClassifiedsMini.innerHTML = renderMiniClassifieds(personalClassifieds, "لا توجد إعلانات مبوبة منشورة باسمك.");
  }

  if (favoriteListingsMini) {
    favoriteListingsMini.innerHTML = renderMiniListings(favoriteListings, "لا توجد إعلانات محفوظة في المفضلة.");
  }
}

function renderCourierSummary() {
  if (!courierSummaryGrid) {
    if (accountSummaryTitle) {
      accountSummaryTitle.textContent = `حساب المندوب ${state.currentCourier.fullName}`;
    }

    if (accountSummaryNote) {
      accountSummaryNote.textContent = "افتح صفحة المندوبين لمتابعة طلبك.";
    }

    return;
  }

  const rates = getRatesForCity(state.currentCourier.city);
  const coverageText = state.currentCourier.coverageCities || state.currentCourier.city;
  const imagesCompleted = state.currentCourier.identityImageUrl && state.currentCourier.livePhotoUrl;

  if (memberSummaryGrid) {
    memberSummaryGrid.classList.add("hidden");
  }

  courierSummaryGrid.classList.remove("hidden");
  if (accountSummaryTitle) {
    accountSummaryTitle.textContent = `حساب المندوب ${state.currentCourier.fullName}`;
  }

  if (accountSummaryNote) {
    accountSummaryNote.textContent = "حالة الطلب ونسب التوصيل.";
  }

  if (courierStatusBadge) {
    courierStatusBadge.textContent = state.currentCourier.statusLabel;
  }

  if (courierVehicleState) {
    courierVehicleState.textContent = `نوع المركبة: ${state.currentCourier.vehicleType}`;
  }

  if (courierJoinDate) {
    courierJoinDate.textContent = `تاريخ الانضمام: ${formatDate(state.currentCourier.createdAt)}`;
  }

  if (courierIdentityState) {
    courierIdentityState.textContent = imagesCompleted
      ? "الهوية والصورة المباشرة مكتملتان"
      : "الهوية أو الصورة المباشرة ما زالت غير مكتملة";
  }

  if (courierCoverageState) {
    courierCoverageState.textContent = `نطاق العمل: ${coverageText}`;
  }

  if (courierRateCity) {
    courierRateCity.textContent = state.currentCourier.city;
  }

  if (courierRateList) {
    courierRateList.innerHTML = renderCourierRateMiniList(rates);
  }
}

function renderMiniListings(listings, emptyText) {
  if (!listings.length) {
    return `<div class="mini-empty">${emptyText}</div>`;
  }

  return listings.slice(0, 4).map((listing) => `
    <article class="mini-item">
      <p class="mini-item-title">${escapeHtml(listing.title)}</p>
      <p class="mini-item-meta">${formatCurrency(listing.price)} | ${escapeHtml(listing.city)} | ${escapeHtml(listing.approvalStatusLabel || "بانتظار المراجعة")}</p>
    </article>
  `).join("");
}

function renderMiniClassifieds(classifieds, emptyText) {
  if (!classifieds.length) {
    return `<div class="mini-empty">${emptyText}</div>`;
  }

  return classifieds.slice(0, 4).map((classified) => `
    <article class="mini-item">
      <p class="mini-item-title">${escapeHtml(classified.title)}</p>
      <p class="mini-item-meta">${escapeHtml(classified.city)} | ${escapeHtml(classified.adTypeLabel)} | ${escapeHtml(classified.availabilityStatusLabel)}</p>
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
    if (authMessage) {
      authMessage.textContent = "سجّل الدخول أولًا لإضافة الإعلانات إلى المفضلة.";
    }
    redirectToMemberLogin();
    return;
  }

  if (state.sessionType !== "member") {
    if (authMessage) {
      authMessage.textContent = "حساب المندوب لا يدعم المفضلة. استخدم حساب عضو لحفظ الإعلانات.";
    }
    redirectToMemberLogin();
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
    if (authMessage) {
      authMessage.textContent = error.message;
    }
  }
}

function updateFilePreview(inputElement, previewElement, previewKey, altText) {
  if (!inputElement || !previewElement) {
    return;
  }

  const [file] = inputElement.files || [];

  if (!file) {
    return;
  }

  updatePreviewFromFile(file, previewElement, previewKey, altText);
}

function updatePreviewFromFile(file, previewElement, previewKey, altText) {
  if (!previewElement) {
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
  if (!previewElement) {
    return;
  }

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

async function requestListingCameraStream() {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        resizeMode: "none",
      },
      audio: false,
    });
  } catch (error) {
    if (error && (error.name === "OverconstrainedError" || error.name === "NotFoundError")) {
      return navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
    }

    throw error;
  }
}

async function openListingCamera() {
  if (!canUseListingCameraCapture()) {
    listingMessage.textContent = LISTING_CAMERA_UNAVAILABLE_MESSAGE;
    return;
  }

  try {
    stopListingCameraStream();
    listingCameraState.stream = await requestListingCameraStream();
    listingCameraVideo.srcObject = listingCameraState.stream;
    await listingCameraVideo.play().catch(() => {});
    listingCameraPanel.classList.remove("hidden");
    listingMessage.textContent = "وجّه الكاميرا نحو المنتج ثم التقط صورة أو أكثر. نحاول استخدام دقة أعلى لتحسين النتيجة.";
  } catch (error) {
    listingMessage.textContent = getListingCameraErrorMessage(error);
  }
}

async function captureListingPhoto() {
  if (!listingCameraState.stream) {
    listingMessage.textContent = "افتح الكاميرا أولًا ثم التقط صورة المنتج.";
    return;
  }

  if (listingCameraState.files.length >= MAX_LISTING_IMAGES) {
    listingMessage.textContent = `وصلت إلى الحد الأقصى: ${MAX_LISTING_IMAGES} صور لكل إعلان.`;
    return;
  }

  try {
    const capturedFile = await createListingCameraFile();
    const validationError = validateListingImageFile(capturedFile);

    if (validationError) {
      listingMessage.textContent = validationError;
      return;
    }

    listingCameraState.files = [...listingCameraState.files, capturedFile];
    renderListingImagePreviews();
    if (clearListingImageButton) {
      clearListingImageButton.classList.remove("hidden");
    }
    if (listingMessage) {
      listingMessage.textContent = `تم التقاط ${listingCameraState.files.length} من ${MAX_LISTING_IMAGES} صور. يمكنك المتابعة أو التقاط صورة إضافية.`;
    }
  } catch (error) {
    if (listingMessage) {
      listingMessage.textContent = error.message || "تعذر التقاط صورة المنتج الآن.";
    }
  }
}

function getListingCaptureDimensions(videoElement) {
  const videoWidth = videoElement.videoWidth || 1280;
  const videoHeight = videoElement.videoHeight || 960;
  const maxSide = 2200;
  const scale = Math.min(1, maxSide / Math.max(videoWidth, videoHeight));

  return {
    width: Math.max(1, Math.round(videoWidth * scale)),
    height: Math.max(1, Math.round(videoHeight * scale)),
  };
}

async function createListingCameraFile() {
  if (!listingCameraVideo.videoWidth || !listingCameraVideo.videoHeight) {
    throw new Error("انتظر حتى تظهر صورة الكاميرا بوضوح ثم التقط الصورة.");
  }

  const { width, height } = getListingCaptureDimensions(listingCameraVideo);
  const context = listingCameraCanvas.getContext("2d");

  if (!context) {
    throw new Error("تعذر تجهيز مساحة التقاط الصورة. حاول مرة أخرى.");
  }

  listingCameraCanvas.width = width;
  listingCameraCanvas.height = height;
  context.drawImage(listingCameraVideo, 0, 0, width, height);

  const blob = await canvasToBlob(listingCameraCanvas, "image/jpeg", 0.95);

  if (!blob) {
    throw new Error("تعذر تجهيز الصورة الملتقطة. حاول مرة أخرى.");
  }

  return new File([blob], `listing-camera-${Date.now()}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

function clearListingImages() {
  listingCameraState.files = [];
  if (clearListingImageButton) {
    clearListingImageButton.classList.add("hidden");
  }
  renderListingImagePreviews();
  if (listingMessage) {
    listingMessage.textContent = "تم حذف صور الإعلان. يمكنك التقاط صور جديدة الآن.";
  }
}

function renderListingImagePreviews() {
  if (!listingPreviewGrid || !listingPreviewEmpty) {
    return;
  }

  if (!listingCameraState.files.length) {
    listingPreviewGrid.innerHTML = "";
    listingPreviewEmpty.classList.remove("hidden");
    return;
  }

  listingPreviewEmpty.classList.add("hidden");
  listingPreviewGrid.innerHTML = listingCameraState.files.map((file, index) => {
    const objectUrl = URL.createObjectURL(file);

    return `
      <article class="listing-shot-card">
        <img src="${escapeHtmlAttribute(objectUrl)}" alt="معاينة صورة الإعلان ${index + 1}">
        <button class="listing-shot-remove" type="button" data-index="${index}">حذف</button>
        <span class="listing-shot-badge">${index === 0 ? "الرئيسية" : `صورة ${index + 1}`}</span>
      </article>
    `;
  }).join("");

  listingPreviewGrid.querySelectorAll(".listing-shot-remove").forEach((button) => {
    button.addEventListener("click", () => {
      removeListingImageAt(Number(button.dataset.index));
    });
  });
}

function removeListingImageAt(index) {
  listingCameraState.files = listingCameraState.files.filter((_, currentIndex) => currentIndex !== index);
  if (clearListingImageButton) {
    clearListingImageButton.classList.toggle("hidden", listingCameraState.files.length === 0);
  }
  renderListingImagePreviews();
  if (listingMessage) {
    listingMessage.textContent = listingCameraState.files.length
      ? `بقي ${listingCameraState.files.length} صور في الإعلان.`
      : "تم حذف كل الصور. يمكنك التقاط صور جديدة الآن.";
  }
}

async function handleListingSubmit() {
  if (!listingForm || !listingMessage) {
    return;
  }

  listingMessage.textContent = "جارٍ حفظ الإعلان...";

  if (!state.token) {
    listingMessage.textContent = "يجب تسجيل الدخول أولًا قبل نشر الإعلان.";
    redirectToMemberLogin();
    return;
  }

  if (state.sessionType !== "member") {
    listingMessage.textContent = "الحساب الحالي خاص بالمندوب. استخدم حساب عضو لنشر الإعلانات.";
    redirectToMemberLogin();
    return;
  }

  if (!canUseListingCameraCapture()) {
    listingMessage.textContent = LISTING_CAMERA_UNAVAILABLE_MESSAGE;
    return;
  }

  const title = String(formDataValue(listingForm, "title")).trim();
  const description = String(formDataValue(listingForm, "description")).trim();

  if (description.length > MAX_LISTING_DESCRIPTION_LENGTH) {
    listingMessage.textContent = `وصف الإعلان يجب أن يكون ${MAX_LISTING_DESCRIPTION_LENGTH} حرف كحد أقصى.`;
    return;
  }

  const contactPolicyError = getListingContactPolicyError(title, description);

  if (contactPolicyError) {
    listingMessage.textContent = contactPolicyError;
    return;
  }

  if (!listingCameraState.files.length) {
    listingMessage.textContent = "يجب التقاط صورة واحدة على الأقل قبل نشر الإعلان.";
    return;
  }

  if (listingCameraState.files.length > MAX_LISTING_IMAGES) {
    listingMessage.textContent = `يمكن إضافة ${MAX_LISTING_IMAGES} صور كحد أقصى.`;
    return;
  }

  const imageValidationError = listingCameraState.files.map(validateListingImageFile).find(Boolean);

  if (imageValidationError) {
    listingMessage.textContent = imageValidationError;
    return;
  }

  const formData = new FormData(listingForm);
  listingCameraState.files.forEach((file) => {
    formData.append("images", file, file.name);
  });
  formData.set("imageSourceType", "camera");

  try {
    const response = await apiRequest("/api/listings", {
      method: "POST",
      headers: getAuthHeaders(),
      body: formData,
    });

    listingForm.reset();
    clearListingImages();
    closeListingCamera();
    listingMessage.textContent = response.message;
    await refreshDynamicData();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    listingMessage.textContent = error.message;
  }
}

async function handleClassifiedSubmit() {
  if (!classifiedForm || !classifiedMessage) {
    return;
  }

  classifiedMessage.textContent = "جارٍ حفظ الإعلان المبوب...";

  if (!state.token) {
    classifiedMessage.textContent = "يجب تسجيل الدخول أولًا قبل نشر الإعلان المبوب.";
    redirectToMemberLogin();
    return;
  }

  if (state.sessionType !== "member") {
    classifiedMessage.textContent = "الحساب الحالي خاص بالمندوب. استخدم حساب عضو لنشر الإعلانات المبوبة.";
    redirectToMemberLogin();
    return;
  }

  const title = String(formDataValue(classifiedForm, "title")).trim();
  const description = String(formDataValue(classifiedForm, "description")).trim();
  const compensation = String(formDataValue(classifiedForm, "compensation")).trim();
  const contactPolicyError = getListingContactPolicyError(title, [description, compensation].filter(Boolean).join(" "));

  if (contactPolicyError) {
    classifiedMessage.textContent = contactPolicyError;
    return;
  }

  const payload = Object.fromEntries(new FormData(classifiedForm).entries());

  try {
    const response = await apiRequest("/api/classifieds", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    classifiedForm.reset();
    classifiedMessage.textContent = response.message;
    await refreshDynamicData();
    scrollToSelectorOrNavigate("#classifieds", `${getPageUrl("classifieds")}#classifieds`);
  } catch (error) {
    classifiedMessage.textContent = error.message;
  }
}

function renderListingMedia(listing, options = {}) {
  if (listing.imageUrl) {
    const photoClass = options.featured ? "listing-photo featured-photo" : "listing-photo";
    const imageCountBadge = (listing.imageUrls || []).length > 1
      ? `<span class="listing-image-count">+${listing.imageUrls.length - 1}</span>`
      : "";

    return `
      <div class="listing-media-shell">
        <img class="${photoClass}" src="${escapeHtmlAttribute(listing.imageUrl)}" alt="${escapeHtmlAttribute(listing.title)}">
        ${imageCountBadge}
      </div>
    `;
  }

  const fallbackClass = getCategoryImageClass(listing.category);
  const mediaClass = options.featured ? "product-image featured-photo" : "product-image";
  return `<div class="${mediaClass} ${fallbackClass}"></div>`;
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

function renderClassifieds() {
  if (!classifiedGrid || !classifiedEmpty) {
    return;
  }

  const filteredClassifieds = state.classifieds.filter((classified) => {
    const matchesType = state.currentClassifiedType === "all" || classified.adType === state.currentClassifiedType;
    const normalizedQuery = state.classifiedQuery.toLowerCase();
    const matchesQuery = !normalizedQuery || [
      classified.title,
      classified.description,
      classified.city,
      classified.category,
      classified.memberName,
      classified.compensation,
      classified.adTypeLabel,
    ].some((value) => String(value || "").toLowerCase().includes(normalizedQuery));

    return matchesType && matchesQuery;
  });

  classifiedEmpty.classList.toggle("hidden", filteredClassifieds.length > 0);

  classifiedGrid.innerHTML = filteredClassifieds.map((classified) => `
    <article class="classified-card ${classified.isOpen ? "" : "classified-card-closed"}">
      <div class="classified-card-head">
        <div>
          <span class="classified-type-badge">${escapeHtml(classified.adTypeLabel)}</span>
          <h3>${escapeHtml(classified.title)}</h3>
        </div>
        <span class="classified-status-chip ${classified.isOpen ? "status-open" : "status-closed"}">${escapeHtml(classified.availabilityStatusLabel)}</span>
      </div>
      <div class="classified-meta-row">
        <span>${escapeHtml(classified.city)}</span>
        <span>${escapeHtml(classified.category)}</span>
        ${classified.compensation ? `<span>${escapeHtml(classified.compensation)}</span>` : ""}
      </div>
      <p>${escapeHtml(classified.description)}</p>
      <div class="classified-footer">
        <span>${escapeHtml(classified.memberName)}</span>
        <a class="secondary-button classified-contact-link" href="${escapeHtmlAttribute(getClassifiedContactUrl(classified))}" target="_blank" rel="noopener noreferrer">اطلب التواصل عبر الإدارة</a>
      </div>
    </article>
  `).join("");
}

function getClassifiedContactUrl(classified) {
  const message = [
    "مرحبًا، أريد التواصل عبر الإدارة بخصوص الإعلان المبوب التالي:",
    `العنوان: ${classified.title}`,
    `النوع: ${classified.adTypeLabel}`,
    `المدينة: ${classified.city}`,
    `رقم الإعلان: ${classified.id}`,
    `صاحب الطلب: ${classified.memberName}`,
  ].join("\n");

  return `https://wa.me/${PLATFORM_SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
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
    personalClassifieds: [],
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

function formDataValue(formElement, fieldName) {
  if (!formElement) {
    return "";
  }

  return new FormData(formElement).get(fieldName) || "";
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

function getListingContactPolicyError(title, description) {
  if (containsBlockedPhoneNumber(title) || containsBlockedPhoneNumber(description)) {
    return "يُمنع إضافة أرقام الهاتف داخل عنوان الإعلان أو وصفه. يتم التواصل فقط عبر إدارة المنصة.";
  }

  return "";
}

function getPlatformContactUrl(listing) {
  const message = [
    "مرحبًا، أريد التواصل عبر إدارة المنصة بخصوص هذا الإعلان:",
    `العنوان: ${listing.title}`,
    `المدينة: ${listing.city}`,
    `رقم الإعلان: ${listing.id}`,
    `اسم الناشر: ${listing.sellerName}`,
  ].join("\n");

  return `https://wa.me/${PLATFORM_SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

function getListingGalleryState(listing) {
  const imageUrls = Array.isArray(listing.imageUrls) ? listing.imageUrls.filter(Boolean) : [];
  const safeImageUrls = imageUrls.length ? imageUrls : (listing.imageUrl ? [listing.imageUrl] : []);
  const maxIndex = Math.max(0, safeImageUrls.length - 1);
  const storedIndex = Number.isInteger(listingGalleryIndexes[listing.id]) ? listingGalleryIndexes[listing.id] : 0;
  const currentIndex = Math.min(Math.max(storedIndex, 0), maxIndex);

  listingGalleryIndexes[listing.id] = currentIndex;

  return {
    imageUrls: safeImageUrls,
    currentIndex,
    currentImageUrl: safeImageUrls[currentIndex] || "",
    hasMultipleImages: safeImageUrls.length > 1,
  };
}

function setListingGalleryIndex(listingId, nextIndex) {
  const listing = state.listings.find((item) => item.id === listingId);

  if (!listing) {
    return;
  }

  const imageUrls = Array.isArray(listing.imageUrls) ? listing.imageUrls.filter(Boolean) : [];

  if (!imageUrls.length) {
    listingGalleryIndexes[listingId] = 0;
    return;
  }

  const maxIndex = imageUrls.length - 1;
  listingGalleryIndexes[listingId] = ((nextIndex % imageUrls.length) + imageUrls.length) % imageUrls.length;

  if (listingGalleryIndexes[listingId] > maxIndex) {
    listingGalleryIndexes[listingId] = maxIndex;
  }
}

function changeListingGalleryIndex(listingId, direction) {
  const listing = state.listings.find((item) => item.id === listingId);

  if (!listing) {
    return;
  }

  const imageUrls = Array.isArray(listing.imageUrls) ? listing.imageUrls.filter(Boolean) : [];

  if (imageUrls.length <= 1) {
    return;
  }

  const currentIndex = Number.isInteger(listingGalleryIndexes[listingId]) ? listingGalleryIndexes[listingId] : 0;
  setListingGalleryIndex(listingId, currentIndex + direction);
  renderFeatured();
  renderListings();
}

function bindListingGalleryControls(rootElement) {
  if (!rootElement) {
    return;
  }

  rootElement.querySelectorAll(".listing-gallery-nav[data-listing-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      changeListingGalleryIndex(Number(button.dataset.listingId), Number(button.dataset.direction));
    });
  });

  rootElement.querySelectorAll(".listing-gallery-dot[data-listing-id][data-image-index]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setListingGalleryIndex(Number(button.dataset.listingId), Number(button.dataset.imageIndex));
      renderFeatured();
      renderListings();
    });
  });
}

function getListingPriority(listing) {
  return (listing.isAdminHighlighted ? 2 : 0) + (listing.isFeatured ? 1 : 0);
}

function getFilteredListings() {
  const normalizedQuery = state.query.trim().toLowerCase();

  return state.listings.filter((listing) => {
    const matchesCategory = state.currentCategory === "الكل" || listing.category === state.currentCategory;
    const matchesCity = state.currentCity === "all" || listing.city === state.currentCity;
    const matchesQuery = !normalizedQuery || [
      listing.title,
      listing.description,
      listing.city,
      listing.category,
      listing.sellerName,
    ].some((value) => String(value || "").toLowerCase().includes(normalizedQuery));

    return matchesCategory && matchesCity && matchesQuery;
  });
}

function sortListings(listings) {
  return [...listings].sort((left, right) => {
    if (state.listingSort === "price-asc") {
      return Number(left.price || 0) - Number(right.price || 0);
    }

    if (state.listingSort === "price-desc") {
      return Number(right.price || 0) - Number(left.price || 0);
    }

    if (state.listingSort === "highlighted") {
      const priorityDifference = getListingPriority(right) - getListingPriority(left);
      if (priorityDifference !== 0) {
        return priorityDifference;
      }
    }

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

function getCurrentCategoryLabel() {
  return state.currentCategory === "الكل" ? "كل التصنيفات" : state.currentCategory;
}

function syncCategoryState() {
  categoryButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.category === state.currentCategory);
  });

  if (activeCategoryLabel) {
    activeCategoryLabel.textContent = getCurrentCategoryLabel();
  }
}

function getUniqueListingCities() {
  return [...new Set([
    ...SYRIAN_CITIES,
    ...state.listings
      .map((listing) => String(listing.city || "").trim())
      .filter(Boolean),
  ])].sort((left, right) => left.localeCompare(right, "ar"));
}

function syncListingToolbarState() {
  if (listingCityFilter) {
    const cities = getUniqueListingCities();
    const currentOptions = Array.from(listingCityFilter.options).map((option) => option.value);

    if (cities.length + 1 !== currentOptions.length || cities.some((city) => !currentOptions.includes(city))) {
      listingCityFilter.innerHTML = [
        '<option value="all">كل المدن</option>',
        ...cities.map((city) => `<option value="${escapeHtmlAttribute(city)}">${escapeHtml(city)}</option>`),
      ].join("");
    }

    if (!cities.includes(state.currentCity) && state.currentCity !== "all") {
      state.currentCity = "all";
    }

    listingCityFilter.value = state.currentCity;
  }

  if (listingSortSelect) {
    listingSortSelect.value = state.listingSort;
  }

  quickCityButtons.forEach((button) => {
    button.classList.toggle("active", (button.dataset.city || "") === state.currentCity);
  });
}

function updateListingResultsLabel(filteredListings) {
  if (!listingResultsLabel) {
    return;
  }

  const categoryLabel = getCurrentCategoryLabel();
  const cityLabel = state.currentCity === "all" ? "كل المدن" : state.currentCity;
  const resultCount = formatNumber(filteredListings.length);

  listingResultsLabel.textContent = `يعرض الآن ${resultCount} إعلان ضمن ${categoryLabel} في ${cityLabel}.`;
}

function renderFeatured() {
  if (!featuredGrid) {
    return;
  }

  const featuredListings = [...state.listings]
    .filter((listing) => listing.isAdminHighlighted || listing.isFeatured)
    .sort((left, right) => {
      const leftPriority = getListingPriority(left);
      const rightPriority = getListingPriority(right);

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
      <div class="featured-signal-row">
        <span class="featured-price">${formatCurrency(listing.price)}</span>
        <div class="featured-tags">
          ${listing.isAdminHighlighted ? '<div class="featured-badge gold-badge">إعلان ذهبي</div>' : ""}
          ${listing.isFeatured ? `<div class="featured-badge ${listing.isAdminHighlighted ? "featured-badge-soft" : ""}">${index === 0 && !listing.isAdminHighlighted ? "مميز ومدفوع" : "إعلان مميز"}</div>` : ""}
        </div>
      </div>
      <h3>${escapeHtml(listing.title)}</h3>
      <p>${escapeHtml(listing.description)}</p>
      <div class="featured-meta">
        <span>${escapeHtml(listing.category)}</span>
        <span>${escapeHtml(listing.city)}</span>
        <span>${escapeHtml(listing.sellerName)}</span>
      </div>
      <a class="${index === 0 ? "primary-button" : "secondary-button"} listing-contact-link" href="${escapeHtmlAttribute(getPlatformContactUrl(listing))}" target="_blank" rel="noopener noreferrer">
        اطلب التواصل عبر الإدارة
      </a>
    </article>
  `).join("");

  bindListingGalleryControls(featuredGrid);
}

function renderListings() {
  if (!listingsGrid || !listingEmpty) {
    return;
  }

  syncCategoryState();
  syncListingToolbarState();

  const filteredListings = sortListings(getFilteredListings());

  listingEmpty.classList.toggle("hidden", filteredListings.length > 0);
  updateListingResultsLabel(filteredListings);

  listingsGrid.innerHTML = filteredListings.map((listing, index) => `
    <article class="product-card ${getListingTileClass(index, listing)}">
      ${renderListingMedia(listing)}
      <div class="product-content">
        <div class="product-signal-row">
          <span class="price">${formatCurrency(listing.price)}</span>
          <div class="product-badge-row">
            ${listing.isAdminHighlighted ? '<span class="gold-frame-badge">إطار ذهبي</span>' : ""}
            ${listing.isFeatured ? '<span class="featured-badge featured-badge-soft">مميز</span>' : ""}
            <span class="category-badge">${escapeHtml(listing.category)}</span>
          </div>
        </div>
        <h3>${escapeHtml(listing.title)}</h3>
        <div class="product-meta-chips">
          <span class="product-meta-chip">${escapeHtml(listing.city)}</span>
          <span class="product-meta-chip">${escapeHtml(listing.sellerName)}</span>
          <span class="product-meta-chip">نشر ${formatDate(listing.createdAt)}</span>
        </div>
        <p>${escapeHtml(listing.description)}</p>
        <div class="product-footer">
          <div class="product-actions">
            ${renderFavoriteButton(listing)}
            <a class="listing-contact-link" href="${escapeHtmlAttribute(getPlatformContactUrl(listing))}" target="_blank" rel="noopener noreferrer">اطلب التواصل عبر الإدارة</a>
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

  bindListingGalleryControls(listingsGrid);
}

function renderListingMedia(listing, options = {}) {
  const gallery = getListingGalleryState(listing);

  if (gallery.currentImageUrl) {
    const photoClass = options.featured ? "listing-photo featured-photo" : "listing-photo";
    const navigationButtons = gallery.hasMultipleImages
      ? `
        <button class="listing-gallery-nav is-prev" type="button" data-listing-id="${listing.id}" data-direction="-1" aria-label="الصورة السابقة">‹</button>
        <button class="listing-gallery-nav is-next" type="button" data-listing-id="${listing.id}" data-direction="1" aria-label="الصورة التالية">›</button>
      `
      : "";
    const dots = gallery.hasMultipleImages
      ? `
        <div class="listing-gallery-dots" aria-label="تنقل الصور">
          ${gallery.imageUrls.map((_, index) => `
            <button
              class="listing-gallery-dot ${index === gallery.currentIndex ? "active" : ""}"
              type="button"
              data-listing-id="${listing.id}"
              data-image-index="${index}"
              aria-label="عرض الصورة ${index + 1}"
            ></button>
          `).join("")}
        </div>
      `
      : "";

    return `
      <div class="listing-media-shell ${gallery.hasMultipleImages ? "has-gallery" : ""}">
        <img class="${photoClass}" src="${escapeHtmlAttribute(gallery.currentImageUrl)}" alt="${escapeHtmlAttribute(listing.title)}">
        ${gallery.hasMultipleImages ? `<span class="listing-image-count">${gallery.currentIndex + 1}/${gallery.imageUrls.length}</span>` : ""}
        ${navigationButtons}
        ${dots}
      </div>
    `;
  }

  const fallbackClass = getCategoryImageClass(listing.category);
  const mediaClass = options.featured ? "product-image featured-photo" : "product-image";
  return `<div class="${mediaClass} ${fallbackClass}"></div>`;
}
