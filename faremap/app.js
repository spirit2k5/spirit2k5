import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.108.2/+esm";

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
  const report = element("button", "", "Report incorrect fare");
  report.type = "button";
  report.addEventListener("click", () => {
    const subject = "FareMap fare correction: " + routeName(fare);
    const body = "I would like to report a possible fare error.\nRoute: " + routeName(fare) +
      "\nFare currently shown: " + formatMoney(fare.fare_price) +
      "\nCorrect fare (if known): \nDate observed: \nSupporting information (optional): \n\nPlease do not include sensitive personal or location details.";
    location.href = "mailto:mahloricarlton@gmail.com?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  });
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
  report.addEventListener("click", () => {
    const subject = "FareMap pickup-point correction: " + (point.name || "Unknown pickup point");
    const body = "Please review this pickup point.\nPoint name: " + (point.name || "") +
      "\nIssue (wrong location / moved / route / other): \nUpdated location (if known): \nObservation date: \n\nPlease do not include sensitive personal details.";
    location.href = "mailto:mahloricarlton@gmail.com?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  });
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
    button.addEventListener("click", () => openPoint(point));
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
  currentTab = tab;
  for (const button of document.querySelectorAll("[data-tab]")) {
    const active = button.dataset.tab === tab;
    button.setAttribute("aria-selected", String(active));
  }
  for (const id of ["fares", "points", "budget", "saved"]) {
    $("view-" + id).classList.toggle("hidden", id !== tab);
  }
  if (tab === "saved") renderSaved();
}
async function loadData() {
  if (!state.user) return;
  status("dataMessage", "Loading current taxi fares and pickup points…");
  try {
    const [faresResponse, pointsResponse] = await Promise.all([
      supabase.from("fare_prices")
        .select("id,route_from,route_to,fare_price,currency,updated_at")
        .eq("status", "active")
        .order("route_from", { ascending: true })
        .limit(1000),
      supabase.from("pickup_points")
        .select("id,name,point_type,route_name,province,suburb,city,latitude,longitude,lat,lng")
        .eq("is_active", true)
        .order("name", { ascending: true })
        .limit(1000)
    ]);
    if (faresResponse.error) throw faresResponse.error;
    if (pointsResponse.error) throw pointsResponse.error;
    state.fares = (faresResponse.data || []).filter(f => Number.isFinite(Number(f.fare_price)));
    state.points = pointsResponse.data || [];
    $("fareCount").textContent = state.fares.length;
    $("pointCount").textContent = state.points.length;
    populateChoices();
    renderFares();
    renderPoints();
    renderSaved();
    status("dataMessage", "Information loaded. Fares and locations may be unconfirmed or outdated; verify locally.", "warn");
  } catch (_) {
    status("dataMessage", "Unable to load FareMap information right now. Your account remains signed in — check your connection and choose Refresh.", "error");
  }
}
async function displaySession(session) {
  const user = session?.user || null;
  const previousUserId = state.user?.id || null;
  state.user = user;
  const signedIn = Boolean(user);
  $("authSection").classList.toggle("hidden", signedIn);
  $("appSection").classList.toggle("hidden", !signedIn);
  $("signOutBtn").classList.toggle("hidden", !signedIn);
  if (signedIn) {
    $("accountLabel").textContent = "Signed in as " + (user.email || "FareMap account") + " · passenger interface only";
    if (previousUserId !== user.id || state.loadedFor !== user.id) {
      state.loadedFor = user.id;
      restoreSaved();
      $("savedCount").textContent = state.saved.size;
      await loadData();
    }
  } else {
    state.loadedFor = null;
    state.fares = [];
    state.points = [];
    state.saved.clear();
  }
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
async function signInWithGoogle() {
  if (busy) return;
  setBusy(true);
  status("authMessage", "Opening Google sign-in…");
  try {
    const result = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: "https://spirit2k5.co.za/faremap/" }
    });
    if (result.error) throw result.error;
  } catch (error) {
    status("authMessage", authError(error), "error");
  } finally { setBusy(false); }
}
$("emailLinkBtn").addEventListener("click", sendEmailLink);
$("passwordBtn").addEventListener("click", signInWithPassword);
$("googleBtn").addEventListener("click", signInWithGoogle);
$("signOutBtn").addEventListener("click", async () => {
  await supabase.auth.signOut();
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
  const redirectError = url.searchParams.get("error_description");
  if (redirectError && !data.session) status("authMessage", "Sign-in was not completed. Please retry or choose another sign-in method.", "error");
} catch (_) {
  status("authMessage", "Cannot connect to FareMap sign-in at the moment. Retry when your connection is available.", "error");
}
