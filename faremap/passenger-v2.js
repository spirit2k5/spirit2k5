import { createPassengerMapController, pickupDisplayName } from "./passenger-map.js?v=20261021-clean-labels1";

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
  supabase, state, $, element, setTab, openPoint, formatMoney, readableDate, status, showLogin, locatePassenger
}) {
  const trust = new Map();
  const maps = createPassengerMapController({
    onSelectPoint: point => {
      setTab("points");
      openPoint(point);
      maps.focusPoint(point);
    },
    onLocate: locatePassenger
  });
  let issueTarget = null, issuePending = null, formGeneration = 0;
  const dispatchedReports = new WeakSet();
  let reportIdentity = { userId: null, sessionId: null, epoch: 0 };
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

  // Local cancellation identity only. The protected RPC checks the actual user.
  function sessionIdentity(session) {
    const userId = session?.user?.id, token = session?.access_token;
    if (session?.user?.is_anonymous === true || typeof userId !== "string" || !uuid.test(userId) || typeof token !== "string" || token.length > 32768) return null;
    const parts = token.split(".");
    if (parts.length !== 3 || !parts[0] || !parts[2] || !/^[A-Za-z0-9_-]+$/.test(parts[1]) || parts[1].length % 4 === 1) return null;
    try {
      const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "=")));
      return claims.sub === userId && typeof claims.session_id === "string" && uuid.test(claims.session_id)
        ? { userId, sessionId: claims.session_id } : null;
    } catch (_) { return null; }
  }
  function canReport() {
    return Boolean(reportIdentity.userId && reportIdentity.sessionId && state.user?.id === reportIdentity.userId);
  }
  function onIdentityChanged(session) {
    const next = sessionIdentity(session);
    const userId = next?.userId || null, sessionId = next?.sessionId || null;
    if (reportIdentity.userId === userId && reportIdentity.sessionId === sessionId) return;
    reportIdentity = { userId, sessionId, epoch: reportIdentity.epoch + 1 };
    maps.clearLocation();
    // This runs synchronously in the accepted auth callback, before UI deferral.
    closeIssue();
  }
  function targetFacts(type, item) {
    return JSON.stringify(type === "fare"
      ? [item.id, item.route_from, item.route_to, item.fare_price, item.updated_at, item.fact_revision]
      : [item.id, item.name, item.latitude ?? item.lat, item.longitude ?? item.lng, item.updated_at, item.fact_revision]);
  }
  function targetIsCurrent(target) {
    const item = (target.type === "fare" ? state.fares : state.points).find(row => row.id === target.item.id);
    return Boolean(item && targetFacts(target.type, item) === target.facts);
  }
  function ownsAction(action) {
    return issuePending === action && formGeneration === action.formGeneration && issueTarget === action.target &&
      reportIdentity.epoch === action.epoch && reportIdentity.userId === action.userId &&
      reportIdentity.sessionId === action.sessionId && state.user?.id === action.userId;
  }
  function actionIsCurrent(action) {
    return ownsAction(action) && targetIsCurrent(action.target) &&
      $("v2ReportKind").value === action.kind && $("v2ReportDetails").value.trim() === action.details;
  }
  function invalidateEditedAction() {
    if (!issueTarget) return;
    const alreadyDispatched = issuePending && dispatchedReports.has(issuePending);
    formGeneration += 1;
    issuePending = null;
    $("v2ReportSubmit").disabled = !canReport();
    $("v2ReportMessage").textContent = alreadyDispatched
      ? "Your earlier submission may already have been received. These edits have not been sent."
      : "Your changes have not been sent. Review them before submitting.";
  }

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
  function updateMarkerColours() {
    maps.setConfidence(trust);
  }
  async function fetchConfidence(type, ids) {
    if (!ids.length) return;
    for (let offset = 0; offset < ids.length; offset += 200) {
      try {
        const { data, error } = await supabase.rpc("faremap_get_data_confidence", {
          p_entity_type: type, p_entity_ids: ids.slice(offset, offset + 200)
        });
        if (error) throw error;
        for (const row of data || []) trust.set(type + ":" + row.entity_id, { ...row, fetched_at: new Date().toISOString() });
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

  function refreshMap() {
    maps.setPoints(state.points);
    maps.setConfidence(trust);
  }
  function focusPoint(point, zoom = true) {
    maps.focusPoint(point, zoom);
  }
  function onTab(tab) {
    maps.onTab(tab);
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
      pickupDisplayName(target.item);
  }
  function setIssueTarget(target) {
    formGeneration += 1;
    issuePending = null;
    const item = Object.freeze({ ...target.item });
    const factRevision = trust.get(target.type + ":" + item.id)?.fact_revision || item.fact_revision || null;
    issueTarget = Object.freeze({ type: target.type, item, facts: targetFacts(target.type, item), factRevision });
    $("v2ReportTitle").textContent = describeTarget(target);
    $("v2ReportKind").replaceChildren();
    for (const [value, label] of issueTypes[target.type] || []) {
      const opt = document.createElement("option"); opt.value = value; opt.textContent = label;
      $("v2ReportKind").append(opt);
    }
    $("v2ReportDetails").value = "";
    $("v2ReportMessage").textContent = canReport()
      ? "Your report will be private until reviewed. It does not automatically change the displayed fare or pin."
      : "Sign in to submit a report. Guest browsing remains available without an account.";
    $("v2ReportSubmit").disabled = !canReport();
    $("v2ReportSubmit").classList.toggle("hidden", !canReport());
    $("v2ReportLogin").classList.toggle("hidden", canReport());
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
      opt.textContent = type === "fare" ? item.route_from + " → " + item.route_to : pickupDisplayName(item);
      select.append(opt);
    }
    $("v2ReportRecordWrap").classList.remove("hidden");
    setIssueTarget({type, item:items[0]});
    if (kind === "route" && type === "pickup") $("v2ReportKind").value = "route_incorrect";
    $("v2ReportModal").classList.remove("hidden");
    $("v2ReportClose").focus();
  }
  function closeIssue() {
    formGeneration += 1;
    issuePending = null;
    $("v2ReportModal").classList.add("hidden");
    $("v2ReportRecordWrap").classList.add("hidden");
    $("v2ReportDetails").value = "";
    $("v2ReportTitle").textContent = "";
    $("v2ReportMessage").textContent = "";
    $("v2ReportKind").replaceChildren();
    $("v2ReportSubmit").disabled = true;
    issueTarget = null;
  }
  async function submitIssue() {
    if (!issueTarget || issuePending) return;
    if (!canReport()) {
      $("v2ReportMessage").textContent = "Sign in before submitting. This helps prevent false reports.";
      return;
    }
    const description = $("v2ReportDetails").value.trim();
    if (description.length < 8 || description.length > 1000) {
      $("v2ReportMessage").textContent = "Please describe the issue in 8–1000 characters.";
      return;
    }
    const kind = $("v2ReportKind").value;
    if (!issueTypes[issueTarget.type].some(([value]) => value === kind) || !targetIsCurrent(issueTarget)) {
      $("v2ReportMessage").textContent = "This record changed. Refresh FareMap and open the report again.";
      return;
    }
    const action = Object.freeze({ ...reportIdentity, formGeneration, target: issueTarget, kind, details: description });
    issuePending = action;
    $("v2ReportSubmit").disabled = true;
    $("v2ReportMessage").textContent = "Checking the record and submitting privately…";
    try {
      if (!actionIsCurrent(action)) return;
      const {data: facts, error: revisionError} = await supabase.rpc("faremap_get_data_confidence", {
        p_entity_type: action.target.type, p_entity_ids: [action.target.item.id]
      });
      if (!actionIsCurrent(action)) return;
      if (revisionError) throw revisionError;
      const revision = facts?.find(f => f.entity_id === action.target.item.id)?.fact_revision;
      if (typeof revision !== "string" || !revision ||
        (action.target.factRevision && action.target.factRevision !== revision)) {
        throw new Error("This record changed or is unavailable. Refresh before reporting.");
      }
      const request = Object.freeze({ type: action.target.type, id: action.target.item.id,
        kind: action.kind, details: action.details, revision, actor: action.userId });
      if (!actionIsCurrent(action)) return;
      // One dispatch only. expected actor remains the initiating user even if
      // Supabase obtains a replacement account token after this final UI guard.
      dispatchedReports.add(action);
      const {data, error} = await supabase.rpc("faremap_report_data_issue_as", {
        p_entity_type: request.type,
        p_entity_id: request.id,
        p_issue_type: request.kind,
        p_details: request.details,
        p_expected_revision: request.revision,
        p_expected_actor: request.actor
      });
      if (!actionIsCurrent(action)) return;
      if (error) throw error;
      if (data?.status !== "saved" && data?.status !== "duplicate") throw new Error("Unexpected report response");
      $("v2ReportMessage").textContent = data?.status === "duplicate"
        ? "You already have an open report for this issue. The existing report is still awaiting review."
        : "Report received for review. No automatic fare or location changes were made.";
      $("v2ReportDetails").value = "";
    } catch (error) {
      if (!actionIsCurrent(action)) return;
      $("v2ReportMessage").textContent = /changed|refresh|no longer active/i.test(error?.message || "")
        ? "The record has changed. Refresh FareMap and open the report again."
        : /limit/i.test(error?.message || "") ? "Report limit reached. Please wait before reporting again."
        : dispatchedReports.has(action)
          ? "Could not confirm whether your report was received. It was not automatically resent. Check before submitting again."
          : "Could not check this record. Your report was not sent. Check your connection and reopen the report.";
    } finally {
      if (ownsAction(action)) {
        issuePending = null;
        $("v2ReportSubmit").disabled = !canReport();
        if ($("v2ReportMessage").textContent === "Checking the record and submitting privately…") {
          $("v2ReportMessage").textContent = "This report changed before completion. Review it before submitting again.";
        }
      }
    }
  }
  function init() {
    maps.init();
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
    $("v2ReportDetails").addEventListener("input", invalidateEditedAction);
    $("v2ReportKind").addEventListener("change", invalidateEditedAction);
  }
  async function onData() {
    if (issueTarget && !targetIsCurrent(issueTarget)) closeIssue();
    populateStops();
    renderPlanner();
    refreshMap();
    await refreshConfidence();
  }
  return { init, onData, onIdentityChanged, showTrust, onTab, focusPoint, openIssue, openGeneralReport, openPlanner, renderPlanner,
    setLocation: position => maps.setLocation(position) };
}
