import { PICKUP_LOCATION_LABELS } from "./pickup-location-labels.js?v=20261021-named-pickups1";

// Passenger map parity with FareMapPremiumMapMarkers and FareMapWebMap.android.
// Public catalogue/confidence only: no driver operations or invented live taxis.
export const NATIVE_STREET_STYLE = "https://tiles.openfreemap.org/styles/liberty";
export const NATIVE_SATELLITE_STYLE = {
  version: 8,
  sources: { worldImagery: { type: "raster", tiles: [
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
  ], tileSize: 256, minzoom: 0, maxzoom: 19,
  attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community" } },
  layers: [{ id: "background", type: "background", paint: { "background-color": "#e9efe4" } },
    { id: "world-imagery", type: "raster", source: "worldImagery" }]
};
export const NATIVE_CONFIDENCE_COLOURS = Object.freeze({
  high: "#2563EB", community: "#7C3AED", unverified: "#64748B", stale: "#B45309", disputed: "#C2410C"
});
const SHORT_LABELS = { high: "High", community: "Community", unverified: "Unconfirmed", stale: "Stale", disputed: "Review" };
const LONG_LABELS = { high: "High data confidence", community: "Community confirmed", unverified: "Not yet confirmed", stale: "Confirmation out of date", disputed: "Accuracy needs review" };
const SPRITE = "/faremap/assets/native-map-icons.svg";
const CONTEXTS = { home: { id: "fmHomeMap", note: "homeMapStatus", size: 42 }, points: { id: "v2Map", note: "v2MapNote", size: 44 } };

// Apply a reviewed label only to the exact original record and coordinates.
// A later rename or moved point must never inherit an obsolete place description.
export function pickupNameInfo(point) {
  if (!point || !Object.hasOwn(PICKUP_LOCATION_LABELS, point.id)) return null;
  const label = PICKUP_LOCATION_LABELS[point.id];
  const coords = pickupCoordinates(point);
  if (point.name !== label.expectedName || !coords ||
      Math.abs(coords.lat - label.latitude) > 0.0000001 ||
      Math.abs(coords.lng - label.longitude) > 0.0000001 ||
      (point.source_key && point.source_key !== label.sourceKey)) return null;
  return label;
}

// Source identifiers remain in canonical records, never in the passenger label.
export function pickupDisplayName(point, fallback = "Taxi pickup point") {
  const location = pickupNameInfo(point);
  if (location) return location.name;
  const name = typeof point?.name === "string" ? point.name : "";
  const clean = name.replace(/(?:\s*\(\s*osm\s*:\s*(?:node|way|relation)\s*:\s*\d+\s*\))+\s*$/i, "").trim();
  if (/^Mapped taxi rank$/i.test(clean)) {
    const area = point.suburb || point.city || point.province;
    return area ? "Taxi pickup in " + area : "Taxi pickup — local name needed";
  }
  return clean || fallback;
}

export function pickupCoordinates(point) {
  const rawLat = point?.latitude ?? point?.lat, rawLng = point?.longitude ?? point?.lng;
  if (rawLat === null || rawLat === undefined || rawLat === "" || rawLng === null || rawLng === undefined || rawLng === "") return null;
  const numeric = value => typeof value === "number" || (typeof value === "string" && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()));
  if (!numeric(rawLat) || !numeric(rawLng)) return null;
  const lat = Number(rawLat), lng = Number(rawLng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0)
    ? { lat, lng } : null;
}

export function pickupConfidence(row, now = Date.now(), receivedAt = null) {
  if (!row || row.unavailable || row.not_found || !Object.hasOwn(NATIVE_CONFIDENCE_COLOURS, row.confidence_level)) {
    return { level: "unverified", colour: NATIVE_CONFIDENCE_COLOURS.unverified, label: "Unknown", description: "Confidence unavailable" };
  }
  let level = row.confidence_level;
  const fetched = row.fetched_at ? Date.parse(row.fetched_at) : receivedAt;
  const observed = Date.parse(row.last_verified_at ?? ""), days = Number(row.freshness_days);
  if ((row.fetched_at && (!Number.isFinite(fetched) || fetched > now)) ||
      (row.last_verified_at && (!Number.isFinite(observed) || observed > now)) ||
      (Number.isFinite(fetched) && now - fetched > 90000)) {
    return { level: "unverified", colour: NATIVE_CONFIDENCE_COLOURS.unverified, label: "Unknown", description: "Confidence unavailable" };
  }
  if (Number.isFinite(observed) && Number.isFinite(days) && days > 0 && observed <= now - days * 86400000 && ["high", "community"].includes(level)) level = "stale";
  return { level, colour: NATIVE_CONFIDENCE_COLOURS[level], label: SHORT_LABELS[level], description: LONG_LABELS[level] };
}

function icon(name, extraClass = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "fm-native-icon" + (extraClass ? " " + extraClass : ""));
  svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", SPRITE + "#" + name); svg.append(use);
  return svg;
}
function span(className) { const node = document.createElement("span"); node.className = className; node.setAttribute("aria-hidden", "true"); return node; }

export function createPassengerMapController({ onSelectPoint = () => {}, onLocate = () => {} } = {}) {
  let points = new Map(), confidence = new Map(), selectedId = null, location = null;
  let destroyed = false, initialized = false, expanded = null, priorOverflow = "", priorFocus = null;
  const views = new Map(), controls = [];
  const receivedTimes = new WeakMap();

  function note(view, message) { const node = document.getElementById(CONTEXTS[view.name].note); if (node) node.textContent = message; }
  function rowFor(point) { return confidence.get("pickup:" + point.id) || confidence.get(point.id) || point.data_confidence || null; }
  function displayed(point) { const row = rowFor(point); return pickupConfidence(row, Date.now(), row && receivedTimes.get(row)); }
  function liveView(view) { return !destroyed && views.get(view.name) === view; }
  function applyAppearance(view, record) {
    const selected = selectedId === record.point.id;
    const size = selected ? (view.name === "points" ? 56 : 49) : CONTEXTS[view.name].size;
    const display = displayed(record.point), el = record.element;
    el.style.setProperty("--fm-pin-size", size + "px");
    el.style.setProperty("--fm-pin-color", display.colour);
    el.style.width = (size + 24) + "px"; el.style.height = (size + 31) + "px";
    el.style.zIndex = selected ? "5" : "1";
    el.classList.toggle("is-selected", selected);
    el.setAttribute("aria-pressed", String(selected));
    el.setAttribute("aria-label", pickupDisplayName(record.point) + ": " + display.description + ". Colours describe data confidence, not physical safety.");
    el.dataset.confidence = display.level;
    record.label.textContent = display.label;
  }
  function updateIcons() {
    for (const view of views.values()) for (const record of view.markers.values()) applyAppearance(view, record);
  }
  function markerElement(view, point) {
    const button = document.createElement("button"); button.type = "button"; button.className = "fm-pickup-marker";
    button.title = pickupDisplayName(point);
    const halo = span("fm-pin-halo"), head = span("fm-pin-head"), inner = span("fm-pin-inner");
    inner.append(icon("bus", "fm-pin-glyph")); head.append(inner);
    const tail = span("fm-pin-tail"), badge = span("fm-pin-location"), label = span("fm-pin-confidence");
    badge.append(icon("location")); button.append(halo, head, tail, badge, label);
    const record = { point, element: button, label, marker: null };
    button.addEventListener("click", () => {
      if (!liveView(view) || view.markers.get(point.id)?.element !== button || !points.has(point.id)) return;
      const currentPoint = points.get(point.id); selectedId = point.id; updateIcons();
      onSelectPoint(currentPoint);
    });
    applyAppearance(view, record);
    return record;
  }
  function draw(view) {
    if (!liveView(view) || !view.map) return;
    for (const record of view.markers.values()) record.marker.remove();
    view.markers.clear();
    for (const point of points.values()) {
      const pos = pickupCoordinates(point); if (!pos) continue;
      const record = markerElement(view, point);
      record.marker = new window.maplibregl.Marker({ element: record.element, anchor: "bottom" }).setLngLat([pos.lng, pos.lat]).addTo(view.map);
      view.markers.set(point.id, record);
    }
    updateLocation(view);
    if (!view.failed) note(view, view.markers.size
      ? view.markers.size + " recorded pickup point" + (view.markers.size === 1 ? "" : "s") + " · colours mean data confidence, not physical safety."
      : "No pickup coordinates available. Search the recorded pickup-point list.");
  }
  function updateLocation(view) {
    view.userMarker?.remove(); view.userMarker = null;
    if (!location || !view.map) return;
    const dot = document.createElement("span"); dot.className = "fm-user-location-dot";
    dot.setAttribute("role", "img"); dot.setAttribute("aria-label", "Approximate device location");
    view.userMarker = new window.maplibregl.Marker({ element: dot, anchor: "center" }).setLngLat([location.lng, location.lat]).addTo(view.map);
  }
  function unavailable(view) {
    if (!liveView(view)) return;
    view.failed = true;
    note(view, "Interactive map is unavailable. The pickup-point list, record details and external map links still work.");
    if (!view.map && !view.fallback) {
      const fallback = document.createElement("p"); fallback.className = "fm-map-unavailable";
      fallback.setAttribute("role", "status");
      fallback.textContent = "Map unavailable. You can still search and choose a pickup point below.";
      view.container.append(fallback); view.fallback = fallback;
    }
  }
  function ensure(name) {
    if (destroyed || !CONTEXTS[name]) return null;
    const container = document.getElementById(CONTEXTS[name].id); if (!container) return null;
    let view = views.get(name);
    if (view?.map) return view;
    if (!view) {
      view = { name, container, map: null, markers: new Map(), userMarker: null, terrain: "street", failed: false, fallback: null };
      views.set(name, view);
    }
    const GL = window.maplibregl;
    if (!GL || (typeof GL.supported === "function" && !GL.supported())) { unavailable(view); return view; }
    try {
      view.fallback?.remove(); view.fallback = null;
      view.map = new GL.Map({ container, style: NATIVE_STREET_STYLE, center: [28.0473, -26.2041], zoom: 11,
        attributionControl: true, scrollZoom: false, cooperativeGestures: true });
      view.failed = false;
      view.map.on("load", () => { if (liveView(view)) { view.failed = false; draw(view); view.map.resize(); } });
      view.map.on("style.load", () => { if (liveView(view)) { view.failed = false; draw(view); view.map.resize(); } });
      view.map.on("moveend", () => { if (liveView(view)) updateIcons(); });
      view.map.on("error", () => { if (liveView(view)) { view.failed = true; note(view, "Some map tiles could not load. Pickup records and their map links remain available."); } });
      draw(view);
    } catch (_) {
      try { view.map?.remove(); } catch (_) { /* Constructor cleanup only */ }
      view.map = null; unavailable(view);
    }
    return view;
  }
  function refreshSize() { for (const view of views.values()) view.map?.resize(); }
  function fitAll(view) {
    const coords = [...points.values()].map(pickupCoordinates).filter(Boolean);
    if (!view?.map || !coords.length) return;
    if (coords.length === 1) view.map.easeTo({ center: [coords[0].lng, coords[0].lat], zoom: 15, duration: 0 });
    else {
      const lngs = coords.map(c => c.lng), lats = coords.map(c => c.lat);
      view.map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 64, maxZoom: 15, duration: 0 });
    }
  }
  function updateTerrainControls(view) {
    for (const {node} of controls) {
      if (node.dataset.mapView !== view.name) continue;
      const action = node.dataset.mapAction;
      if (action === "street" || action === "satellite") {
        const active = action === view.terrain;
        node.classList.toggle("is-active", active); node.setAttribute("aria-pressed", String(active));
      }
      if (action === "layers") {
        const satellite = view.terrain === "satellite";
        node.classList.toggle("is-active", satellite); node.setAttribute("aria-pressed", String(satellite));
        node.setAttribute("aria-label", satellite ? "Show street map" : "Show satellite map");
        const label = node.querySelector?.("[data-map-layer-label]"); if (label) label.textContent = satellite ? "Satellite" : "Streets";
      }
    }
  }
  function closeExpanded() {
    if (!expanded) return;
    expanded.wrapper.classList.remove("fm-map-expanded"); document.body.classList.remove("fm-map-is-expanded");
    document.body.style.overflow = priorOverflow;
    expanded.button?.setAttribute("aria-pressed", "false");
    expanded.button?.setAttribute("aria-label", "Expand passenger map");
    for (const [name,value] of Object.entries(expanded.attributes)) {
      if (value === null) expanded.wrapper.removeAttribute(name); else expanded.wrapper.setAttribute(name,value);
    }
    const use = expanded.button?.querySelector?.("use"); if (use) use.setAttribute("href", SPRITE + "#expand-outline");
    expanded = null; refreshSize(); priorFocus?.focus?.(); priorFocus = null;
  }
  function toggleExpanded(view, button) {
    if (expanded?.view === view) { closeExpanded(); return; }
    closeExpanded();
    const wrapper = view.container.closest?.(".fm-map-frame") || view.container.parentElement;
    if (!wrapper || !document.body) return;
    priorOverflow = document.body.style.overflow || ""; priorFocus = document.activeElement || button;
    const attributes = Object.fromEntries(["role", "aria-modal", "aria-label", "tabindex"].map(name => [name, wrapper.getAttribute(name)]));
    expanded = { view, wrapper, button, attributes };
    wrapper.setAttribute("role", "dialog"); wrapper.setAttribute("aria-modal", "true"); wrapper.setAttribute("aria-label", "Expanded passenger map"); wrapper.setAttribute("tabindex", "-1");
    wrapper.classList.add("fm-map-expanded"); document.body.classList.add("fm-map-is-expanded"); document.body.style.overflow = "hidden";
    button?.setAttribute("aria-pressed", "true"); button?.setAttribute("aria-label", "Close expanded passenger map");
    const use = button?.querySelector?.("use"); if (use) use.setAttribute("href", SPRITE + "#close");
    button?.focus?.(); view.map?.resize();
  }
  function controlClick(node) {
    if (destroyed) return;
    const view = ensure(node.dataset.mapView); if (!view) return;
    updateIcons();
    const action = node.dataset.mapAction;
    if (action === "locate") { onLocate(); return; }
    if (action === "fullscreen") { toggleExpanded(view, node); return; }
    if (!view.map) return;
    if (action === "all") fitAll(view);
    if (action === "zoom-in") view.map.zoomIn();
    if (action === "zoom-out") view.map.zoomOut();
    if (action === "street" || action === "satellite" || action === "layers") {
      const terrain = action === "layers" ? (view.terrain === "street" ? "satellite" : "street") : action;
      if (view.terrain !== terrain) {
        view.terrain = terrain; view.failed = false;
        view.map.setStyle(terrain === "satellite" ? structuredClone(NATIVE_SATELLITE_STYLE) : NATIVE_STREET_STYLE);
      }
      updateTerrainControls(view);
    }
  }
  const onKeyDown = event => {
    if (!expanded) return;
    if (event.key === "Escape") { event.preventDefault?.(); closeExpanded(); return; }
    if (event.key !== "Tab") return;
    const focusable = [...expanded.wrapper.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
      .filter(node => !node.disabled && !node.hidden && node.getAttribute("aria-hidden") !== "true" && (!node.getClientRects || node.getClientRects().length > 0));
    const index = focusable.indexOf(document.activeElement);
    if (!focusable.length) { event.preventDefault?.(); expanded.wrapper.focus(); }
    else if (index < 0 || (!event.shiftKey && index === focusable.length - 1) || (event.shiftKey && index === 0)) {
      event.preventDefault?.(); (event.shiftKey ? focusable.at(-1) : focusable[0]).focus();
    }
  };
  function init() {
    if (initialized || destroyed) return; initialized = true;
    for (const node of document.querySelectorAll("[data-map-action][data-map-view]")) {
      const callback = () => controlClick(node); node.addEventListener("click", callback); controls.push({ node, callback });
      if (node.dataset.mapAction === "street") node.setAttribute("aria-pressed", "true");
      if (node.dataset.mapAction === "layers") { node.setAttribute("aria-pressed", "false"); node.setAttribute("aria-label", "Show satellite map"); }
    }
    document.addEventListener("keydown", onKeyDown);
  }
  function setPoints(rows) {
    points = new Map();
    for (const point of rows || []) if (point && typeof point.id === "string" && point.id && pickupCoordinates(point)) points.set(point.id, { ...point });
    if (!points.has(selectedId)) selectedId = null;
    for (const view of views.values()) draw(view);
  }
  function setConfidence(rows) {
    confidence = rows instanceof Map ? new Map(rows) : new Map((Array.isArray(rows) ? rows : []).filter(Boolean).map(row => ["pickup:" + row.entity_id, row]));
    for (const row of confidence.values()) if (row && typeof row === "object" && !receivedTimes.has(row)) receivedTimes.set(row, Date.now());
    updateIcons();
  }
  function focusPoint(point, zoom = true) {
    if (destroyed || !points.has(point?.id)) return;
    const pos = pickupCoordinates(points.get(point.id)); if (!pos) return;
    selectedId = point.id; updateIcons();
    if (zoom) {
      const view = views.get("points")?.map ? views.get("points") : views.get("home");
      if (view?.map) view.map.easeTo({ center: [pos.lng, pos.lat], zoom: Math.max(15, view.map.getZoom()), duration: 0 });
    }
  }
  function setLocation(value) {
    if (destroyed) return;
    location = pickupCoordinates(value);
    for (const view of views.values()) {
      updateLocation(view);
      if (location && view.map) view.map.easeTo({ center: [location.lng, location.lat], zoom: 14, duration: 0 });
    }
  }
  function clearLocation() { setLocation(null); }
  function onTab(tab) {
    if (destroyed) return;
    if (expanded && expanded.view.name !== tab) closeExpanded();
    if (tab === "home" || tab === "points") { const view = ensure(tab); view?.map?.resize(); }
  }
  function destroy() {
    if (destroyed) return; closeExpanded(); destroyed = true;
    document.removeEventListener("keydown", onKeyDown);
    for (const {node,callback} of controls) node.removeEventListener("click", callback);
    for (const view of views.values()) {
      for (const record of view.markers.values()) record.marker.remove();
      view.userMarker?.remove(); view.map?.remove(); view.fallback?.remove();
    }
    views.clear(); controls.length = 0;
  }
  return { init, onTab, setPoints, setConfidence, focusPoint, setLocation, clearLocation, refreshSize, destroy };
}
