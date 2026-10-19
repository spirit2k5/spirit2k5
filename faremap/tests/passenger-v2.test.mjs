import test from "node:test";
import assert from "node:assert/strict";
import { normalizeStop, planJourneys, confidenceDescription } from "../passenger-v2.js";

const route = (id, from, to, fare) => ({
  id, route_from: from, route_to: to, fare_price: fare
});
const records = [
  route("1", "Meadowlands", "Baragwanath Taxi Rank", 19),
  route("2", "Baragwanath Taxi Rank", "Sandton", 30),
  route("3", "Meadowlands", "Sandton", 52),
  route("4", "Sandton", "Johannesburg CBD", 25),
  route("5", "Meadowlands", "Orange Farm", -2),
  route("6", "Sandton", "Sandton", 1)
];

test("normalizes names without inventing locations", () => {
  assert.equal(normalizeStop("  Bara-Gwanath  "), "bara gwanath");
  assert.equal(normalizeStop("MÉadowlands"), "méadowlands");
});
test("records direct trips, not imaginary journeys", () => {
  const rows = planJourneys(records, "Meadowlands", "Baragwanath Taxi Rank");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].total, 19);
  assert.equal(rows[0].possibleTransfer, false);
});
test("shows possible transfers only at an identical named stop", () => {
  const rows = planJourneys(records, "Meadowlands", "Sandton");
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(x => x.legs.length), [1, 2]);
  assert.equal(rows[1].total, 49);
  assert.deepEqual(rows[1].legs.map(x => x.id), ["1", "2"]);
});
test("does not suggest missing journeys, invalid fares, or self trips", () => {
  assert.deepEqual(planJourneys(records, "Meadowlands", "Cape Town"), []);
  assert.deepEqual(planJourneys(records, "Meadowlands", "Meadowlands"), []);
  assert.deepEqual(planJourneys(records, "Meadowlands", "Orange Farm"), []);
});
test("limits results and rejects nonmatching transfer stop", () => {
  assert.equal(planJourneys([route("x","A","B",10),route("y","B","C",14)],"A","D").length, 0);
  assert.equal(planJourneys([route("x","A","B",10),route("y","B","C",14)],"A","C")[0].total, 24);
});
test("does not confuse a record update with independent verification", () => {
  const badge = confidenceDescription(null);
  assert.match(badge.title, /Not independently verified/);
  assert.doesNotMatch(badge.detail, /safe/i);
});
test("preserves accuracy dispute and private concern independently", () => {
  const result = confidenceDescription({
    confidence_level:"disputed",recent_confirmations:3,
    verification_source:"community",
    last_verified_at:"2026-10-01T12:00:00Z",
    pending_accuracy_reports:1,pending_safety_reports:2
  });
  assert.match(result.detail, /accuracy report/);
  assert.match(result.detail, /private concern/);
  assert.match(result.detail, /Last recorded observation/);
  assert.doesNotMatch(result.detail, /physically safe/i);
});
