/**
 * FareMap Passenger Web 2.0
 * No driver mode, no fabricated routes, no safety guarantees.
 * All planner legs come from actual published FareMap fare records.
 */
export function normalizeStop(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("en-ZA")
    .replace(/[’']/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

export function planJourneys(fares, origin, destination, maxResults = 12) {
  const from = normalizeStop(origin), to = normalizeStop(destination);
  if (!from || !to || from === to) return [];
  const active = (fares || []).filter(f =>
    normalizeStop(f.route_from) && normalizeStop(f.route_to) &&
    Number.isFinite(Number(f.fare_price)) && Number(f.fare_price) > 0
  );
  const starts = active.filter(f => normalizeStop(f.route_from) === from);
  const ends = active.filter(f => normalizeStop(f.route_to) === to);
  const journeys = [];
  const used = new Set();
  function append(legs) {
    const signature = legs.map(f => String(f.id)).join(":");
    if (used.has(signature)) return;
    used.add(signature);
    const price = legs.reduce((n, f) => n + Number(f.fare_price), 0);
    journeys.push({ legs, total: Math.round(price * 100) / 100,
      possibleTransfer: legs.length > 1 });
  }
  for (const direct of starts) {
    if (normalizeStop(direct.route_to) === to) append([direct]);
  }
  for (const first of starts) {
    const via = normalizeStop(first.route_to);
    if (via === from || via === to) continue;
    for (const second of ends) {
      if (String(first.id) === String(second.id)) continue;
      if (normalizeStop(second.route_from) === via &&
          normalizeStop(second.route_to) !== via) append([first, second]);
    }
  }
  journeys.sort((a, b) => a.legs.length - b.legs.length || a.total - b.total);
  return journeys.slice(0, Math.max(1, Math.min(maxResults, 25)));
}

export function confidenceDescription(row) {
  if (!row) return { title: "Not independently verified", tone: "unknown",
    detail: "No recent confirmation evidence is available." };
  const n = Number(row.recent_confirmations || 0);
  const source = row.verification_source === "verified_driver" ? "approved driver" : "community";
  const evidence = row.last_verified_at
    ? "Last recorded observation: " + new Date(row.last_verified_at).toLocaleDateString("en-ZA") +
      " (" + source + ")" : "No dated observation";
  const disputes = Number(row.pending_accuracy_reports || 0);
  const safety = Number(row.pending_safety_reports || 0);
  const caution = (disputes ? " · " + disputes + " accuracy report(s) under review" : "") +
    (safety ? " · " + safety + " private concern(s) reported" : "");
  const title = {
    high: "Multiple recent confirmations",
    community: "Community observed",
    stale: "Observation is stale",
    disputed: "Accuracy disputed",
    unverified: "Not independently verified"
  }[row.confidence_level] || "Verification unknown";
  return { title, tone: row.confidence_level || "unknown",
    detail: evidence + (n ? " · " + n + " recent confirmation(s)" : "") + caution };
}

export function createPassengerWebEnhancements({
  supabase, state, $, element, setTab, openPoint, formatMoney, readableDate, status, showLogin
}) {
  const trust = new Map();
  let map = null, mapLayer = null, markers = new Map();
  let issueTarget = null, issuePending = false;

  function showTrust(parent, type, item) {
    const box = element("div", "fm-trust");
    box.dataset.trustType = type;
    box.dataset.trustId = item.id;
    parent.append(box);
    fillTrust(box);
  }
  function fillTrust(box) {
    const data = confidenceDescription(trust.get(box.dataset.trustType + ":" + box.dataset.trustId));
    box.replaceChildren();
    const pill = element("span", "fm-trust-pill fm-trust-" + data.tone, data.title);
    box.append(pill, element("small", "muted", data.detail));
  }
  function refreshTrust() {
    for (const node of document.querySelectorAll("[data-trust-type][data-trust-id]")) fillTrust(node);
    updateMarkerColours();
  }
  function colourFor(id) {
    const row = trust.get("pickup:" + id);
    const level = row?.confidence_level || "unverified";
    return ({ high: "#13A957", community: "#3997A6", stale: "#E9B000", disputed: "#DC3344",
      unverified: "#8794A2" })[level] || "#8794A2";
  }
  function updateMarkerColours() {
    for (const [id, marker] of markers) marker.setStyle({ color: colourFor(id),
      fillColor: colourFor(id) });
  }
  async function fetchConfidence(type, ids) {
    if (!ids.length) return;
    for (let offset = 0; offset < ids.length; offset += 200) {
      try {
        const { data, error } = await supabase.rpc("faremap_get_data_confidence", {
          p_entity_type: type, p_entity_ids: ids.slice(offset, offset + 200)
        });
        if (error) throw error;
        for (const row of data || []) trust.set(type + ":" + row.entity_id, row);
        refreshTrust();
      } catch (_) {
        // Confidence is optional; never promote a record to verified on an RPC failure.
      }
    }
  }
  async function refreshConfidence() {
    trust.clear();
    refreshTrust();
    await Promise.all([
      fetchConfidence("fare", [...new Set(state.fares.map(f => f.id))]),
      fetchConfidence("pickup", [...new Set(state.points.map(p => p.id))])
    ]);
    renderPlanner();
  }

  function coordinates(point) {
    const lat = Number(point.latitude ?? point.lat), lng = Number(point.longitude ?? point.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) &&
      Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0)
      ? [lat, lng] : null;
  }
  function ensureMap() {
    if (!window.L) {
      $("v2MapNote").textContent = "Interactive map is temporarily unavailable. The pickup-point list and individual map links still work.";
      return;
    }
    if (map || !$("v2Map")) return;
    const L = window.L;
    map = L.map("v2Map", { scrollWheelZoom: false }).setView([-26.247, 27.855], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'
    }).addTo(map);
    mapLayer = L.layerGroup().addTo(map);
  }
  function refreshMap() {
    ensureMap();
    if (!map || !mapLayer) return;
    mapLayer.clearLayers(); markers.clear();
    for (const point of state.points) {
      const pos = coordinates(point);
      if (!pos) continue;
      const marker = window.L.circleMarker(pos, {
        radius: 6, weight: 2, color: colourFor(point.id), fillColor: colourFor(point.id),
        fillOpacity: .8
      }).addTo(mapLayer);
      const tip = document.createElement("span");
      tip.textContent = point.name || "Taxi pickup point";
      marker.bindTooltip(tip);
      marker.on("click", () => { openPoint(point); focusPoint(point, false); });
      markers.set(point.id, marker);
    }
    setTimeout(() => map?.invalidateSize(), 50);
    $("v2MapNote").textContent = markers.size
      ? markers.size + " mapped pickup point(s) · colours indicate data confidence, NOT physical safety."
      : "No pickup coordinates available. Search recorded pickup points below.";
  }
  function focusPoint(point, zoom = true) {
    ensureMap();
    const coords = coordinates(point);
    if (!map || !coords) return;
    if (zoom) map.setView(coords, Math.max(map.getZoom(), 15));
    markers.get(point.id)?.openTooltip();
  }
  function onTab(tab) {
    if (tab === "points") {
      ensureMap();
      if (map) setTimeout(() => map.invalidateSize(), 70);
    }
    if (tab === "planner") renderPlanner();
  }

  function renderPlanner() {
    const box = $("v2PlanResults");
    if (!box) return;
    box.replaceChildren();
    const origin = $("v2PlanFrom").value.trim(), destination = $("v2PlanTo").value.trim();
    if (!origin || !destination) {
      box.append(element("p", "muted", "Choose a starting point and destination to explore recorded fares."));
      return;
    }
    const journeys = planJourneys(state.fares, origin, destination);
    if (!journeys.length) {
      box.append(element("p", "muted", "No matching direct fare or two-leg fare chain is recorded. FareMap cannot assume a route exists."));
      return;
    }
    for (const journey of journeys) {
      const card = element("article", "fm-plan-card");
      const head = element("div", "fm-plan-top");
      head.append(element("strong", "", journey.possibleTransfer ? "Possible two-leg fare chain" : "Recorded direct fare"),
        element("strong", "fm-plan-price", formatMoney(journey.total)));
      card.append(head);
      journey.legs.forEach((leg, i) => {
        card.append(element("p", "fm-plan-leg", (i + 1) + ". " + leg.route_from + " → " +
          leg.route_to + " · " + formatMoney(leg.fare_price)));
        showTrust(card, "fare", leg);
        const report = element("button", "fm-small-link", "Report fare or route information");
        report.type = "button";
        report.addEventListener("click", () => openIssue("fare", leg));
        card.append(report);
      });
      card.append(element("p", "micro muted", journey.possibleTransfer ?
        "The two fare records share a named stop. Transfer availability, taxi ranks, continuity and directions are NOT confirmed." :
        "Direct fare record only. Confirm taxi availability, boarding point, direction and price locally."));
      box.append(card);
    }
  }
  function populateStops() {
    const select = (id, names) => {
      const old = $(id).value;
      $(id).replaceChildren();
      const empty = document.createElement("option"); empty.value = ""; empty.textContent = "Choose a place"; $(id).append(empty);
      for (const name of names) {
        const opt = document.createElement("option"); opt.value = name; opt.textContent = name;
        $(id).append(opt);
      }
      if (names.includes(old)) $(id).value = old;
    };
    select("v2PlanFrom", [...new Set(state.fares.map(f => f.route_from).filter(Boolean))].sort());
    select("v2PlanTo", [...new Set(state.fares.map(f => f.route_to).filter(Boolean))].sort());
  }
  function openPlanner(from = "", to = "") {
    setTab("planner");
    if (from) $("v2PlanFrom").value = from;
    if (to) $("v2PlanTo").value = to;
    renderPlanner();
  }

  const issueTypes = {
    fare: [["fare_incorrect", "Incorrect fare"], ["safety_concern", "Private safety concern"]],
    pickup: [["incorrect_location", "Incorrect location"], ["pickup_moved", "Pickup point moved"],
      ["route_incorrect", "Route/direction incorrect"], ["safety_concern", "Private safety concern"]]
  };
  function describeTarget(target) {
    return target.type === "fare" ? target.item.route_from + " → " + target.item.route_to :
      target.item.name || "Taxi pickup point";
  }
  function setIssueTarget(target) {
    issueTarget = target;
    $("v2ReportTitle").textContent = describeTarget(target);
    $("v2ReportKind").replaceChildren();
    for (const [value, label] of issueTypes[target.type] || []) {
      const opt = document.createElement("option"); opt.value = value; opt.textContent = label;
      $("v2ReportKind").append(opt);
    }
    $("v2ReportDetails").value = "";
    $("v2ReportMessage").textContent = state.user
      ? "Your report will be private until reviewed. It does not automatically change the displayed fare or pin."
      : "Sign in to submit a report. Guest browsing remains available without an account.";
    $("v2ReportSubmit").disabled = !state.user;
    $("v2ReportSubmit").classList.toggle("hidden", !state.user);
    $("v2ReportLogin").classList.toggle("hidden", !!state.user);
  }
  function openIssue(type, item) {
    if (!issueTypes[type] || !item?.id) return;
    setIssueTarget({ type, item });
    $("v2ReportModal").classList.remove("hidden");
    $("v2ReportClose").focus();
  }
  function openGeneralReport(kind) {
    const type = kind === "point" || kind === "route" ? "pickup" : "fare";
    const items = type === "fare" ? state.fares : state.points;
    if (!items.length) {
      status("dataMessage", "No suitable FareMap record is loaded yet. Refresh and try again.", "warn");
      return;
    }
    const select = $("v2ReportRecord");
    select.replaceChildren();
    for (const item of items) {
      const opt = document.createElement("option");
      opt.value = item.id;
      opt.textContent = type === "fare" ? item.route_from + " → " + item.route_to : item.name;
      select.append(opt);
    }
    $("v2ReportRecordWrap").classList.remove("hidden");
    setIssueTarget({type, item:items[0]});
    if (kind === "route" && type === "pickup") $("v2ReportKind").value = "route_incorrect";
    $("v2ReportModal").classList.remove("hidden");
    $("v2ReportClose").focus();
  }
  function closeIssue() {
    $("v2ReportModal").classList.add("hidden");
    $("v2ReportRecordWrap").classList.add("hidden");
    issueTarget = null;
  }
  async function submitIssue() {
    if (!issueTarget || issuePending) return;
    if (!state.user) {
      $("v2ReportMessage").textContent = "Sign in before submitting. This helps prevent false reports.";
      return;
    }
    const description = $("v2ReportDetails").value.trim();
    if (description.length < 8 || description.length > 1000) {
      $("v2ReportMessage").textContent = "Please describe the issue in 8–1000 characters.";
      return;
    }
    issuePending = true;
    $("v2ReportSubmit").disabled = true;
    $("v2ReportMessage").textContent = "Checking the record and submitting privately…";
    try {
      // Re-fetch the current revision so we never submit against stale data.
      const {data: facts, error: revisionError} = await supabase.rpc("faremap_get_data_confidence", {
        p_entity_type: issueTarget.type, p_entity_ids: [issueTarget.item.id]
      });
      if (revisionError) throw revisionError;
      const revision = facts?.find(f => f.entity_id === issueTarget.item.id)?.fact_revision;
      if (!revision) throw new Error("This record changed or is unavailable. Refresh before reporting.");
      const {data, error} = await supabase.rpc("faremap_report_data_issue_as", {
        p_entity_type: issueTarget.type,
        p_entity_id: issueTarget.item.id,
        p_issue_type: $("v2ReportKind").value,
        p_details: description,
        p_expected_revision: revision,
        p_expected_actor: state.user.id
      });
      if (error) throw error;
      $("v2ReportMessage").textContent = data?.status === "duplicate"
        ? "You already have an open report for this issue. The existing report is still awaiting review."
        : "Report received for review. No automatic fare or location changes were made.";
      $("v2ReportDetails").value = "";
    } catch (error) {
      $("v2ReportMessage").textContent = /changed|refresh|no longer active/i.test(error?.message || "")
        ? "The record has changed. Refresh FareMap and open the report again."
        : /limit/i.test(error?.message || "") ? "Report limit reached. Please wait before reporting again."
        : "Could not submit your report. Please check your connection and try again.";
    } finally {
      issuePending = false; $("v2ReportSubmit").disabled = !state.user;
    }
  }
  function init() {
    $("v2PlanBtn").addEventListener("click", renderPlanner);
    $("v2PlanFrom").addEventListener("change", renderPlanner);
    $("v2PlanTo").addEventListener("change", renderPlanner);
    $("v2ReportClose").addEventListener("click", closeIssue);
    $("v2ReportSubmit").addEventListener("click", submitIssue);
    $("v2ReportLogin").addEventListener("click", () => { closeIssue(); showLogin(); });
    $("v2ReportModal").addEventListener("click", e => { if (e.target === $("v2ReportModal")) closeIssue(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeIssue(); });
    $("v2ReportRecord").addEventListener("change", () => {
      const type = issueTarget?.type;
      if (!type) return;
      const items = type === "fare" ? state.fares : state.points;
      const item = items.find(x => x.id === $("v2ReportRecord").value);
      if (item) setIssueTarget({ type, item });
    });
  }
  async function onData() {
    populateStops();
    renderPlanner();
    refreshMap();
    await refreshConfidence();
  }
  return { init, onData, showTrust, onTab, focusPoint, openIssue, openGeneralReport, openPlanner, renderPlanner };
}
