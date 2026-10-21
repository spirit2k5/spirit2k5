import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {pickupDisplayName, pickupNameInfo, pickupConfidence} from "../passenger-map.js";

const snapshot = JSON.parse(fs.readFileSync(new URL("../passenger-snapshot.json", import.meta.url), "utf8"));
const original = snapshot.points.find(point => point.id === "4316083b-522a-4923-97b7-79c05c26e26d");

test("all original unnamed pickups have specific sourced labels without changing catalogue records", () => {
  const before = JSON.stringify(snapshot);
  const unnamed = snapshot.points.filter(point => /^Mapped taxi rank/.test(point.name));
  assert.equal(unnamed.length, 196);
  for (const point of unnamed) {
    const info = pickupNameInfo(point);
    assert.ok(info, "Missing reviewed label for " + point.id);
    assert.doesNotMatch(pickupDisplayName(point), /Mapped taxi rank|osm:(?:node|way|relation):/i);
    assert.match(info.sourceUrl, /^https:\/\/www\.openstreetmap\.org\/(?:node|way|relation)\/\d+$/);
    assert.equal(typeof info.note, "string");
  }
  assert.equal(JSON.stringify(snapshot), before);
});

test("the reported source ID resolves to Phefeni context with an honest nearby description", () => {
  assert.equal(pickupDisplayName(original), "Taxi rank near Phefeni");
  assert.match(pickupNameInfo(original).note, /local.*name|nearby/i);
  assert.equal(original.name, "Mapped taxi rank (osm:way:810545632)");
});

test("later genuine name edits take precedence over a retained geographic label", () => {
  const renamed = {...original, name: "Phefeni Taxi Rank (Local)"};
  assert.equal(pickupNameInfo(renamed), null);
  assert.equal(pickupDisplayName(renamed), "Phefeni Taxi Rank (Local)");
  for (const name of ["Bosman Taxi Rank", "Sandton (Gautrain) Taxi Rank", "Maja Ka Thata Taxi Rank (Long Distance)"])
    assert.equal(pickupDisplayName({...original, name}), name);
});

test("a moved, missing-coordinate or mismatched-source record cannot inherit an old place label", () => {
  for (const point of [
    {...original, id: "another-record"},
    {...original, latitude: Number(original.latitude) + 0.001},
    {...original, longitude: Number(original.longitude) - 0.001},
    {...original, latitude: null, lat: null},
    {...original, source_key: "osm:way:1"},
    {...original, id: "__proto__"}
  ]) {
    assert.equal(pickupNameInfo(point), null);
    assert.notEqual(pickupDisplayName(point), "Taxi rank near Phefeni");
  }
});

test("name sourcing does not create a verification or change the record's confidence", () => {
  const point = {...original, data_confidence: {confidence_level: "unverified"}, fact_revision: "original-fact"};
  const before = structuredClone(point);
  pickupDisplayName(point);
  pickupNameInfo(point);
  assert.deepEqual(point, before);
  assert.equal(pickupConfidence(point.data_confidence).level, "unverified");
  assert.equal(pickupConfidence(null).label, "Unknown");
});
