import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.108.2/+esm";
import { createPassengerWebEnhancements } from "./passenger-v2.js";

// A publishable key is intended for browser apps. Never embed a service-role key.
// All reads and account operations remain subject to Supabase Row Level Security.
const supabase = createClient("https://gspydyktmdepgjhpgvyv.supabase.co", "sb_publishable_6LT8qH_6AypUkuZI5jOq_w_2_Nj7p7F", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce"
  }
});

const $ = (id) => document.getElementById(id);
const state = { user: null, fares: [], points: [], saved: new Set(), loadedFor: null };
let currentTab = "fares";
let busy = false;
let browsingAsGuest = false;
let previewLoaded = false;
let catalogRequest = 0;

function status(id, message, kind = "") {
  const el = $(id);
  el.textContent = message;
  el.className = "notice" + (kind ? " " + kind : "");
  if (!message) el.classList.add("hidden");
}

function authError(error) {
  const text = String(error?.message || "Authentication could not be completed.");
  if (/rate.?limit|too many requests|over_email_send_rate_limit/i.test(text)) {
    return "Too many sign-in attempts. Please wait and try again.";
  }
  if (/expired|otp_expired|invalid.?token|token.*invalid/i.test(text)) {
    return "Your link or code has expired. Request a new sign-in link.";
  }
  if (/smtp|email.*not sent|error sending|mail.*error|credentials invalid/i.test(text)) {
    return "FareMap email delivery is currently unavailable. Please try again later or use another enabled sign-in method.";
  }
  if (/redirect.*not.*allowed|invalid redirect/i.test(text)) {
    return "Website sign-in is not fully configured yet. The FareMap team needs to allow this website callback.";
  }
  if (/invalid login credentials/i.test(text)) {
    return "Email or password was not accepted. Check the details, or use an email sign-in link.";
  }
  if (/fetch|network|connection/i.test(text)) {
    return "Could not reach the sign-in service. Check your internet connection and retry.";
  }
  return "Sign-in failed. Please retry, or contact FareMap support if it keeps happening.";
}

function setBusy(working) {
  busy = working;
  for (const id of ["emailLinkBtn", "googleBtn", "passwordBtn"]) {
    $(id).disabled = working;
  }
}
function userKey() {
  return "faremap-web-favourites-v1:" + (state.user?.id || "guest");
}
function restoreSaved() {
  try {
    const items = JSON.parse(localStorage.getItem(userKey()) || "[]");
    state.saved = new Set(Array.isArray(items) ? items.filter(x => typeof x === "string") : []);
  } catch (_) {
    state.saved = new Set();
  }
}
function storeSaved() {
  try { localStorage.setItem(userKey(), JSON.stringify([...state.saved])); }
  catch (_) { status("dataMessage", "Unable to store favourites in this browser. The rest of FareMap remains available.", "warn"); }
}
function formatMoney(amount) {
  const value = Number(amount);
  return Number.isFinite(value) ? "R" + value.toFixed(2).replace(/\.00$/, "") : "Fare unavailable";
}
function readableDate(iso) {
  if (!iso) return "Unknown";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "Unknown" : d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}
function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}
function routeName(fare) {
  return String(fare.route_from || "Unknown origin") + " → " + String(fare.route_to || "Unknown destination");
}
function addFeedbackButton(card, fare) {
  const row = element("div", "line");
  const save = element("button", "", state.saved.has(fare.id) ? "★ Saved" : "☆ Save");
  save.type = "button";
  save.setAttribute("aria-label", state.saved.has(fare.id) ? "Remove saved route" : "Save route");
  save.addEventListener("click", () => {
    if (state.saved.has(fare.id)) state.saved.delete(fare.id);
    else state.saved.add(fare.id);
    storeSaved();
    $("savedCount").textContent = state.saved.size;
    renderFares();
    renderSaved();
  });
  const report = element("button", "", "Report an issue");
  report.type = "button";
  report.addEventListener("click", () => v2.openIssue("fare", fare));
  row.append(save, report);
  card.append(row);
}
function fareCard(fare) {
  const card = element("article", "result");
  card.append(
    element("h3", "", routeName(fare)),
    element("span", "fare-price", formatMoney(fare.fare_price)),
    element("span", "tag-low", "Fare information — confirm locally"),
    element("p", "micro muted", "Record updated " + readableDate(fare.updated_at) + " · not a verification date")
  );
  v2.showTrust(card, "fare", fare);
  addFeedbackButton(card, fare);
  return card;
}
function renderFares() {
  const box = $("fareResults");
  box.replaceChildren();
  const from = $("fromInput").value.trim().toLocaleLowerCase();
  const to = $("toInput").value.trim().toLocaleLowerCase();
  const matched = state.fares.filter(f =>
    (!from || String(f.route_from || "").toLocaleLowerCase().includes(from)) &&
    (!to || String(f.route_to || "").toLocaleLowerCase().includes(to)));
  $("fareResultLabel").textContent = matched.length + " matching fare record" + (matched.length === 1 ? "" : "s") +
    (matched.length > 24 ? " · showing first 24, narrow your search" : "");
  if (!matched.length) box.append(element("p", "muted", "No matching fares are recorded yet. Try another origin or destination."));
  for (const fare of matched.slice(0, 24)) box.append(fareCard(fare));
}
function renderSaved() {
  const box = $("savedResults");
  box.replaceChildren();
  const items = state.fares.filter(f => state.saved.has(f.id));
  if (!items.length) box.append(element("p", "muted", "No saved routes yet. Open Taxi fares and select Save next to a route."));
  for (const fare of items) box.append(fareCard(fare));
}
function populateChoices() {
  const from = [...new Set(state.fares.map(f => f.route_from).filter(Boolean))].sort();
  const to = [...new Set(state.fares.map(f => f.route_to).filter(Boolean))].sort();
  for (const [id, items] of [["originList", from], ["destinationList", to]]) {
    const el = $(id);
    el.replaceChildren();
    for (const name of items) {
      const option = document.createElement("option");
      option.value = name;
      el.append(option);
    }
  }
  const budgetSelect = $("budgetRoute");
  budgetSelect.replaceChildren();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "Choose a route";
  budgetSelect.append(empty);
  for (const fare of state.fares) {
    const option = document.createElement("option");
    option.value = fare.id;
    option.textContent = routeName(fare) + " — " + formatMoney(fare.fare_price);
    budgetSelect.append(option);
  }
}
function pointCoordinate(point) {
  const lat = Number(point.latitude ?? point.lat);
  const lng = Number(point.longitude ?? point.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 ||
      (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}
function openPoint(point) {
  const box = $("pointMap");
  box.replaceChildren();
  const coords = pointCoordinate(point);
  box.append(element("strong", "", point.name || "Pickup point"));
  box.append(element("p", "micro muted", "Map data may be inaccurate. Check the actual queue, boarding side and route with the rank or operator."));
  if (!coords) {
    box.append(element("p", "muted", "Coordinates unavailable for this point."));
    return;
  }
  const map = document.createElement("iframe");
  const bbox = [coords.lng - .022, coords.lat - .015, coords.lng + .022, coords.lat + .015].join(",");
  map.src = "https://www.openstreetmap.org/export/embed.html?bbox=" + encodeURIComponent(bbox) +
    "&layer=mapnik&marker=" + encodeURIComponent(coords.lat + "," + coords.lng);
  map.title = "OpenStreetMap view of " + (point.name || "taxi pickup point");
  map.loading = "lazy";
  map.referrerPolicy = "strict-origin-when-cross-origin";
  box.append(map);
  const link = element("a", "micro", "Open larger map ↗");
  link.href = "https://www.openstreetmap.org/?mlat=" + encodeURIComponent(coords.lat) +
    "&mlon=" + encodeURIComponent(coords.lng) + "#map=15/" + coords.lat + "/" + coords.lng;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  box.append(link);
  const report = element("button", "action secondary", "Report inaccurate location");
  report.type = "button";
  report.style.marginTop = "12px";
  report.addEventListener("click", () => v2.openIssue("pickup", point));
  box.append(report);
}
function renderPoints() {
  const box = $("pointResults");
  box.replaceChildren();
  const query = $("pointSearch").value.trim().toLocaleLowerCase();
  const matches = state.points.filter(p => [p.name, p.city, p.suburb, p.province, p.point_type, p.route_name]
    .some(v => String(v || "").toLocaleLowerCase().includes(query)));
  if (!matches.length) {
    box.append(element("p", "muted", "No matching pickup points found. Try a different search."));
    return;
  }
  for (const point of matches.slice(0, 35)) {
    const button = element("button", "point");
    button.type = "button";
    button.append(element("strong", "", point.name || "Unnamed pickup point"));
    const place = [point.suburb, point.city, point.province].filter(Boolean).join(" · ");
    button.append(element("small", "", (place || point.point_type || "Taxi pickup") + " · Location not independently confirmed"));
    v2.showTrust(button, "pickup", point);
    button.addEventListener("click", () => { openPoint(point); v2.focusPoint(point); });
    box.append(button);
  }
  if (matches.length > 35) box.append(element("p", "micro muted", "Showing first 35 matches — narrow your search."));
}
function calculateBudget() {
  const fare = state.fares.find(f => f.id === $("budgetRoute").value);
  const count = Math.floor(Number($("budgetTrips").value));
  if (!fare || !Number.isFinite(count) || count < 1 || count > 120) {
    status("budgetResult", "Choose a taxi route and 1–120 rides.", "warn");
    return;
  }
  status("budgetResult", formatMoney(fare.fare_price * count) + " estimated for " + count +
    " ride" + (count === 1 ? "" : "s") + " on " + routeName(fare) +
    ". This is an estimate, not a guaranteed fare.");
}
function setTab(tab) {
  const target = ["home", "fares", "points", "budget", "saved", "profile", "planner"].includes(tab) ? tab : "home";
  currentTab = target;
  $("fmHomeView").classList.toggle("hidden", target !== "home");
  for (const button of document.querySelectorAll("[data-tab]")) {
    button.setAttribute("aria-selected", String(button.dataset.tab === target));
  }
  for (const id of ["fares", "points", "budget", "saved", "profile", "planner"]) {
    $("view-" + id).classList.toggle("hidden", id !== target);
  }
  for (const button of document.querySelectorAll("[data-nav]")) {
    const nav = button.dataset.nav;
    if (nav !== "add") button.setAttribute("aria-current", nav === target || (nav === "fares" && ["saved","budget","planner"].includes(target)) ? "page" : "false");
  }
  if (target === "saved") renderSaved();
  if (target === "profile" && state.user) $("profileEmail").textContent = state.user.email || "FareMap account";
  v2.onTab(target);
  window.scrollTo({ top: 0, behavior: "smooth" });
}
async function getSafePassengerCatalog() {
  try {
    // Public RPC returns only active taxi fares and approved public pickup fields,
    // and works with both anon and authenticated FareMap users.
    const { data, error } = await supabase.rpc("faremap_public_passenger_catalog");
    if (error) throw error;
    if (!data || data.schema !== 2 || !Array.isArray(data.fares) || !Array.isArray(data.points)) {
      throw new Error("Unexpected FareMap catalog response");
    }
    return { source: "live", generatedAt: data.generated_at, fares: data.fares, points: data.points };
  } catch (_) {
    // A dated public fallback must never be passed off as fresh verification.
    const response = await fetch("/faremap/passenger-snapshot.json", { cache: "no-store" });
    if (!response.ok) throw new Error("FareMap catalog and fallback are unavailable");
    const data = await response.json();
    if (data.schema !== 1 || !Array.isArray(data.fares) || !Array.isArray(data.points)) {
      throw new Error("Invalid public fallback");
    }
    return { source: "snapshot", generatedAt: data.generated_on, fares: data.fares, points: data.points };
  }
}
async function loadData() {
  if (!state.user && !browsingAsGuest) return;
  const request = ++catalogRequest;
  status("dataMessage", "Loading current taxi fare records and pickup points…");
  try {
    const data = await getSafePassengerCatalog();
    if (request !== catalogRequest) return;
    state.fares = data.fares.filter(f =>
      Number.isFinite(Number(f.fare_price)) && Number(f.fare_price) > 0 &&
      f.route_from && f.route_to);
    state.points = data.points.filter(p => p.id && p.name);
    previewLoaded = true;
    $("fareCount").textContent = state.fares.length;
    $("pointCount").textContent = state.points.length;
    populateChoices();
    renderFares();
    renderPoints();
    renderSaved();
    renderHome();
    status("dataMessage", data.source === "live"
      ? "Live FareMap catalog checked " + readableDate(data.generatedAt) +
        " · These are current records, NOT independently verified prices or safe locations. Confirm locally."
      : "Offline-style fallback from " + readableDate(data.generatedAt) +
        " · This is a dated snapshot, NOT current verified information. Confirm locally.", "warn");
    await v2.onData();
  } catch (_) {
    if (request === catalogRequest) {
      status("dataMessage", "Taxi information is currently unavailable. Please check your internet connection and retry.", "error");
    }
  }
}
async function loadPreview() {
  await loadData();
}
async function displaySession(session) {
  const user = session?.user || null;
  const previousUserId = state.user?.id || null;
  state.user = user;
  const signedIn = Boolean(user);
  if (signedIn) browsingAsGuest = false;
  const guest = !signedIn && browsingAsGuest;
  $("authSection").classList.toggle("hidden", signedIn || guest);
  $("appSection").classList.toggle("hidden", !(signedIn || guest));
  $("welcomeSection").classList.toggle("hidden", signedIn || guest);
  $("fmBottomNav").classList.toggle("hidden", !(signedIn || guest));
  $("profileQuickBtn").classList.toggle("hidden", !(signedIn || guest));
  $("signOutBtn").textContent = guest ? "Sign in to FareMap" : "Sign out";
  $("fmAccountStatus").textContent = guest ? "PUBLIC PASSENGER PREVIEW" : "PASSENGER ACCOUNT ACTIVE";
  if (signedIn) {
    $("accountLabel").textContent = "Signed in as " + (user.email || "FareMap account") + " · passenger interface only";
    $("profileEmail").textContent = user.email || "FareMap account";
    $("guestModeLabel").textContent = "Your FareMap passenger session is active.";
    setTab(currentTab);
    if (previousUserId !== user.id || state.loadedFor !== user.id) {
      state.loadedFor = user.id;
      restoreSaved();
      $("savedCount").textContent = state.saved.size;
      await loadData();
    }
  } else if (guest) {
    $("accountLabel").textContent = "Guest passenger · public taxi information";
    $("profileEmail").textContent = "Browsing without signing in";
    $("guestModeLabel").textContent = "Guest preview: fares and taxi ranks are a dated snapshot. Sign in for account features.";
    $("savedCount").textContent = state.saved.size;
    setTab(currentTab === "profile" ? "home" : currentTab);
    if (!previewLoaded) await loadPreview();
  } else {
    catalogRequest++;
    state.loadedFor = null;
    previewLoaded = false;
    state.fares = [];
    state.points = [];
    state.saved.clear();
    currentTab = "home";
    setTab("home");
  }
}
async function enterGuestMode() {
  browsingAsGuest = true;
  previewLoaded = false;
  restoreSaved();
  currentTab = "home";
  await displaySession(null);
  $("appSection").scrollIntoView({ behavior: "smooth", block: "start" });
}
async function sendEmailLink() {
  if (busy) return;
  const email = $("email").value.trim();
  if (!email || !$("email").validity.valid) {
    status("authMessage", "Enter a valid email address.", "warn");
    $("email").focus();
    return;
  }
  setBusy(true);
  status("authMessage", "Sending your sign-in link…");
  try {
    const result = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: "https://spirit2k5.co.za/faremap/" }
    });
    if (result.error) throw result.error;
    status("authMessage", "Check your email for a FareMap sign-in link. You may need to check Spam or Junk.");
  } catch (error) {
    status("authMessage", authError(error), "error");
  } finally { setBusy(false); }
}
async function signInWithPassword() {
  if (busy) return;
  const email = $("email").value.trim();
  const password = $("password").value;
  if (!$("email").validity.valid || !email || !password) {
    status("authMessage", "Enter your email address and existing password.", "warn");
    return;
  }
  setBusy(true);
  status("authMessage", "Checking your account…");
  try {
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    status("authMessage", "");
    await displaySession(result.data.session);
  } catch (error) {
    status("authMessage", authError(error), "error");
  } finally { setBusy(false); }
}
// The public FareMap HTTPS callback is allowlisted in Supabase Auth.
// This website uses browser PKCE, not the Expo/Android auth-callback.
async function signInWithGoogle() {
  if (busy) return;
  setBusy(true);
  status("authMessage", "Opening Google sign-in for FareMap Passenger Web…");
  try {
    // Generate the PKCE verifier in this website's browser session, and
    // return here rather than using Expo Go's temporary exp:// callback.
    const webReturnUrl = "https://spirit2k5.co.za/faremap/";
    const result = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: webReturnUrl, skipBrowserRedirect: true }
    });
    if (result.error) throw result.error;
    if (!result.data?.url) throw new Error("Missing Google authorization URL");
    const authorizationUrl = new URL(result.data.url);
    const requestedRedirect = authorizationUrl.searchParams.get("redirect_to");
    if (authorizationUrl.protocol !== "https:" ||
        authorizationUrl.origin !== "https://gspydyktmdepgjhpgvyv.supabase.co" ||
        requestedRedirect !== webReturnUrl) {
      throw new Error("Invalid FareMap Passenger Web redirect URL");
    }
    window.location.assign(authorizationUrl.toString());
  } catch (error) {
    status("authMessage", authError(error), "error");
  } finally { setBusy(false); }
}

function homeRow(icon, title, subtitle, onClick, price = "") {
  const row = element("button", "fm-row");
  row.type = "button";
  const iconEl = element("span", "fm-row-icon", icon);
  const content = element("span", "fm-row-copy");
  content.append(element("b", "", title), element("small", "", subtitle));
  row.append(iconEl, content);
  if (price) row.append(element("span", "fm-mini-price", price));
  row.append(element("span", "fm-chevron", "›"));
  row.addEventListener("click", onClick);
  return row;
}
function renderHome() {
  const list = $("homeNearbyList"), fareList = $("homeFareList");
  list.replaceChildren();
  fareList.replaceChildren();
  // Don't describe arbitrary database records as "nearby" before a location fix.
  // The native passenger app uses device location and a 20 km radius.
  if (!state.points.length) {
    list.append(element("div", "fm-row", "No taxi pickup points are recorded yet."));
  } else {
    const locate = homeRow("⌖", "Find pickup points near me",
      "Tap My location and allow browser location access to view recorded points within 20 km.",
      locatePassengerOnWeb);
    list.append(locate);
    const browse = homeRow("▧", "Browse all pickup points",
      "Search by taxi rank, suburb or province — accuracy is not guaranteed.",
      () => setTab("points"));
    list.append(browse);
  }
  if (!state.fares.length) {
    fareList.append(element("div", "fm-row", "No fare records are available right now."));
  } else {
    for (const fare of state.fares.slice(0, 4)) {
      fareList.append(homeRow("◈", routeName(fare), "Fare record · confirm locally", () => {
        $("fromInput").value = fare.route_from || "";
        $("toInput").value = fare.route_to || "";
        renderFares();
        setTab("fares");
      }, formatMoney(fare.fare_price)));
    }
  }
}
function setMapAt(lat, lng, label) {
  const coords = { lat: Number(lat), lng: Number(lng) };
  if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng) ||
      Math.abs(coords.lat) > 90 || Math.abs(coords.lng) > 180) return;
  const map = $("fmHomeMap");
  const bounds = [coords.lng - .022, coords.lat - .016, coords.lng + .022, coords.lat + .016].join(",");
  map.src = "https://www.openstreetmap.org/export/embed.html?bbox=" + encodeURIComponent(bounds) +
    "&layer=mapnik&marker=" + encodeURIComponent(coords.lat + "," + coords.lng);
  $("homeMapStatus").textContent = label + " · verify actual boarding points locally";
}
function locatePassengerOnWeb() {
  if (!("geolocation" in navigator)) {
    $("homeMapStatus").textContent = "Browser location is unavailable. You can search pickup points manually.";
    return;
  }
  $("homeMapStatus").textContent = "Requesting your location…";
  navigator.geolocation.getCurrentPosition(position => {
    const { latitude, longitude } = position.coords;
    setMapAt(latitude, longitude, "Approximate device location");
    const toRadians = d => d * Math.PI / 180;
    const distanceKm = point => {
      const position = pointCoordinate(point);
      if (!position) return Infinity;
      const dLat = toRadians(position.lat - latitude);
      const dLng = toRadians(position.lng - longitude);
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(latitude)) * Math.cos(toRadians(position.lat)) *
        Math.sin(dLng / 2) ** 2;
      return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };
    const nearby = state.points.map(p => ({ point: p, dist: distanceKm(p) }))
      .filter(x => x.dist <= 20).sort((a, b) => a.dist - b.dist).slice(0, 4);
    const list = $("homeNearbyList");
    list.replaceChildren();
    if (!nearby.length) {
      list.append(element("div", "fm-row", "No recorded pickup points within 20 km. Try searching all pickup points."));
    }
    for (const item of nearby) {
      const point = item.point;
      list.append(homeRow("⌖", point.name || "Taxi pickup point",
        (item.dist < 1 ? Math.round(item.dist * 1000) + " m" : item.dist.toFixed(1) + " km") +
          " from your location · not independently verified",
        () => { setTab("points"); $("pointSearch").value = point.name || ""; renderPoints(); openPoint(point); }));
    }
  }, () => {
    $("homeMapStatus").textContent = "Location unavailable or not allowed. You can still search taxi fares and ranks.";
  }, { enableHighAccuracy: false, maximumAge: 60000, timeout: 11000 });
}
function openAddSheet() {
  $("fmAddSheet").classList.remove("hidden");
  $("fmCloseAdd").focus();
}
function closeAddSheet() {
  $("fmAddSheet").classList.add("hidden");
}
function suggestFareMapData(kind) {
  closeAddSheet();
  v2.openGeneralReport(kind);
}
const themeMedia = window.matchMedia("(prefers-color-scheme: dark)");
function applyTheme() {
  let saved = "system";
  try { saved = localStorage.getItem("faremap_web_theme_v1") || "system"; } catch (_) {}
  const dark = saved === "dark" || (saved !== "light" && themeMedia.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  $("themeToggleBtn").textContent = dark ? "☀" : "☾";
  $("themeToggleBtn").setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  $("profileThemeLabel").textContent = dark ? "Dark theme (FareMap)" : "Light theme (FareMap)";
}
function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  try { localStorage.setItem("faremap_web_theme_v1", next); } catch (_) {}
  applyTheme();
}

$("emailLinkBtn").addEventListener("click", sendEmailLink);
$("passwordBtn").addEventListener("click", signInWithPassword);
$("googleBtn").addEventListener("click", signInWithGoogle);
$("guestBtn").addEventListener("click", enterGuestMode);
$("signOutBtn").addEventListener("click", async () => {
  if (browsingAsGuest && !state.user) {
    browsingAsGuest = false;
    await displaySession(null);
    $("authSection").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const { error } = await supabase.auth.signOut();
  if (error) {
    status("dataMessage", "Sign-out could not be completed; please retry.", "error");
    return;
  }
  browsingAsGuest = false;
  await displaySession(null);
  status("authMessage", "Signed out of the FareMap website.");
});
$("refreshBtn").addEventListener("click", loadData);
$("fromInput").addEventListener("input", renderFares);
$("toInput").addEventListener("input", renderFares);
$("pointSearch").addEventListener("input", renderPoints);
$("budgetBtn").addEventListener("click", calculateBudget);
for (const button of document.querySelectorAll("[data-tab]")) {
  button.addEventListener("click", () => setTab(button.dataset.tab));
}

$("themeToggleBtn").addEventListener("click", toggleTheme);
$("profileQuickBtn").addEventListener("click", () => setTab("profile"));
$("profileSavedBtn").addEventListener("click", () => setTab("saved"));
$("homeSearchBtn").addEventListener("click", () => {
  $("fromInput").value = "";
  $("toInput").value = $("homeDestinationInput").value.trim();
  renderFares();
  setTab("fares");
});
$("homeDestinationInput").addEventListener("keydown", e => {
  if (e.key === "Enter") $("homeSearchBtn").click();
});
$("homeAllFaresBtn").addEventListener("click", () => setTab("fares"));
$("homeAllPointsBtn").addEventListener("click", () => setTab("points"));
$("homeFullMapBtn").addEventListener("click", () => setTab("points"));
$("homeLocateButton").addEventListener("click", locatePassengerOnWeb);
$("myLocationBtn").addEventListener("click", locatePassengerOnWeb);
for (const el of document.querySelectorAll("[data-open]")) {
  el.addEventListener("click", () => setTab(el.dataset.open));
}
for (const el of document.querySelectorAll("[data-nav]")) {
  el.addEventListener("click", () => {
    if (el.dataset.nav === "add") openAddSheet();
    else setTab(el.dataset.nav);
  });
}
for (const el of document.querySelectorAll("[data-report-kind]")) {
  el.addEventListener("click", () => suggestFareMapData(el.dataset.reportKind));
}
$("fmCloseAdd").addEventListener("click", closeAddSheet);
$("fmAddSheet").addEventListener("click", e => {
  if (e.target === $("fmAddSheet")) closeAddSheet();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeAddSheet();
});
if (themeMedia.addEventListener) themeMedia.addEventListener("change", applyTheme);
applyTheme();

// V2 is kept inside FareMap's existing passenger UI and five-button native HUD.
const v2 = createPassengerWebEnhancements({
  supabase, state, $, element, setTab, openPoint, formatMoney, readableDate, status,
  showLogin: async () => {
    browsingAsGuest = false;
    await displaySession(null);
    $("authSection").scrollIntoView({ behavior: "smooth", block: "start" });
  }
});
v2.init();

supabase.auth.onAuthStateChange((_event, session) => {
  // Avoid awaiting further Supabase work inside an auth callback.
  setTimeout(() => { displaySession(session); }, 0);
});
try {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  await displaySession(data.session);
  // Remove OAuth / PKCE codes from visible browser history only after processing.
  const url = new URL(location.href);
  if (data.session && (url.searchParams.has("code") || url.hash.includes("access_token"))) {
    history.replaceState(null, "", "/faremap/");
  }
  const redirectError = url.searchParams.get("error_description") ||
    new URLSearchParams(url.hash.slice(1)).get("error_description");
  if (redirectError && !data.session) {
    status("authMessage", "Google or email sign-in could not finish. Please request a fresh login, use an existing email password, or browse as a guest while website redirects are being configured.", "error");
    history.replaceState(null, "", "/faremap/");
  }
} catch (_) {
  status("authMessage", "Cannot connect to FareMap sign-in at the moment. Retry when your connection is available.", "error");
}
