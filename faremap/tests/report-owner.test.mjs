import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const source = process.env.FAREMAP_REPORT_SOURCE
  ? pathToFileURL(process.env.FAREMAP_REPORT_SOURCE).href
  : new URL("../passenger-v2.js", import.meta.url).href;
const { createPassengerWebEnhancements } = await import(source);
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
function session(uid = A, sid = S1, extra = {}) {
  return { user: { id: uid }, access_token: "header." + Buffer.from(JSON.stringify({ sub: uid, session_id: sid, ...extra })).toString("base64url") + ".signature" };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, bad) => { resolve = ok; reject = bad; });
  return { promise, resolve, reject };
}
class Node {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {};
    this.value = ""; this.textContent = ""; this.disabled = false;
    this.listeners = new Map();
    const values = new Set();
    this.classList = { add: (...xs) => xs.forEach(x => values.add(x)), remove: (...xs) => xs.forEach(x => values.delete(x)),
      contains: x => values.has(x), toggle: (x, on) => { const next = on ?? !values.has(x); next ? values.add(x) : values.delete(x); return next; } };
  }
  append(...nodes) { this.children.push(...nodes); if (this.tagName === "SELECT" && !this.value && nodes[0]) this.value = nodes[0].value; }
  replaceChildren(...nodes) { this.children = []; if (this.tagName === "SELECT") this.value = ""; this.append(...nodes); }
  addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, []); this.listeners.get(name).push(fn); }
  async fire(name, input = {}) { for (const fn of this.listeners.get(name) || []) await fn({ target: this, ...input }); }
  focus() {} setAttribute() {}
}
function fixture() {
  const nodes = new Map();
  const $ = id => { if (!nodes.has(id)) nodes.set(id, new Node(/(Kind|Record|From|To)$/.test(id) ? "select" : "div")); return nodes.get(id); };
  const doc = new Node(); doc.createElement = tag => new Node(tag); doc.querySelectorAll = () => [];
  globalThis.document = doc; globalThis.window = {};
  const state = { user: null, fares: [{ id: "fare-1", route_from: "Place A", route_to: "Place B", fare_price: 10, updated_at: "2026-10-20" },
    { id: "fare-2", route_from: "Place C", route_to: "Place D", fare_price: 20, updated_at: "2026-10-20" }], points: [] };
  const calls = [], revisions = [], mutations = [];
  const supabase = { rpc: async (name, args) => {
    calls.push({ name, args: structuredClone(args) });
    if (name === "faremap_get_data_confidence") {
      if (revisions.length) return revisions.shift().promise;
      return { data: args.p_entity_ids.map(id => ({ entity_id: id, fact_revision: "revision-1" })), error: null };
    }
    if (name === "faremap_report_data_issue_as") {
      if (mutations.length) return mutations.shift().promise;
      return { data: { status: "saved", issue_id: "synthetic-issue" }, error: null };
    }
    throw new Error("Unexpected RPC " + name);
  } };
  const api = createPassengerWebEnhancements({ supabase, state, $, element: (tag, cls, text) => {
    const node = new Node(tag); node.textContent = text ?? ""; return node;
  }, setTab() {}, openPoint() {}, formatMoney: String, readableDate: String, status() {}, showLogin() {} });
  api.init();
  function observe(next) { state.user = next?.user || null; api.onIdentityChanged?.(next); }
  observe(session());
  function open(index = 0, details = "The displayed fare is incorrect") {
    api.openIssue("fare", state.fares[index]); $("v2ReportKind").value = "fare_incorrect"; $("v2ReportDetails").value = details;
  }
  function send() { return $("v2ReportSubmit").fire("click"); }
  function revision(result = "revision-1", id = "fare-1") { const wait = deferred(); revisions.push(wait); return { ...wait, finish: () => wait.resolve({data:[{entity_id:id,fact_revision:result}],error:null}) }; }
  function mutation() { const wait = deferred(); mutations.push(wait); return { ...wait, finish: () => wait.resolve({data:{status:"saved",issue_id:"synthetic-issue"},error:null}) }; }
  return { $, state, api, observe, open, send, revision, mutation, calls, mutations: () => calls.filter(x => x.name === "faremap_report_data_issue_as") };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test("ordinary report uses protected RPC and captured expected actor", async () => {
  const f = fixture(); f.open(); await f.send();
  assert.equal(f.mutations().length, 1); assert.equal(f.mutations()[0].args.p_expected_actor, A);
  assert.equal(f.mutations()[0].args.p_expected_revision, "revision-1");
  assert.equal(f.$("v2ReportDetails").value, ""); assert.match(f.$("v2ReportMessage").textContent, /received/);
});
test("account replacement clears private draft and closes modal synchronously", () => {
  const f = fixture(); f.open(); f.observe(session(B));
  assert.equal(f.$("v2ReportDetails").value, ""); assert.equal(f.$("v2ReportTitle").textContent, "");
  assert.equal(f.$("v2ReportModal").classList.contains("hidden"), true);
});
test("logout clears report without waiting for display rendering", () => {
  const f = fixture(); f.open(); f.observe(null);
  assert.equal(f.$("v2ReportDetails").value, ""); assert.equal(f.$("v2ReportSubmit").disabled, true);
});
test("delayed A revision cannot dispatch a retained A draft under B", async () => {
  const f = fixture(); f.open(); const read = f.revision(); const work = f.send();
  f.observe(session(B)); read.finish(); await work; assert.equal(f.mutations().length, 0);
});
test("logout while checking revision dispatches no report", async () => {
  const f = fixture(); f.open(); const read = f.revision(); const work = f.send();
  f.observe(null); read.finish(); await work; assert.equal(f.mutations().length, 0);
});
test("A to B to A permanently retires original action", async () => {
  const f = fixture(); f.open(); const read = f.revision(); const work = f.send();
  f.observe(session(B)); f.observe(session()); read.finish(); await work; assert.equal(f.mutations().length, 0);
});
test("same UID new session cancels original action", async () => {
  const f = fixture(); f.open(); const read = f.revision(); const work = f.send();
  f.observe(session(A,S2)); read.finish(); await work; assert.equal(f.mutations().length, 0);
});
test("same UID/session token refresh preserves legitimate action and draft", async () => {
  const f = fixture(); f.open(); const read = f.revision(); const work = f.send();
  f.observe(session(A,S1,{exp:123456})); read.finish(); await work; assert.equal(f.mutations().length, 1);
});
test("agreeing initial session read does not cancel first report", async () => {
  const f = fixture(); f.open(); const read = f.revision(); const work = f.send();
  f.observe(session()); read.finish(); await work; assert.equal(f.mutations().length, 1);
});
test("unknown or malformed session fails closed", async () => {
  const f = fixture(); f.observe({user:{id:A},access_token:"bad"}); f.open(); await f.send(); assert.equal(f.mutations().length, 0);
});
test("JWT sub mismatch fails closed", async () => {
  const f = fixture(); f.observe(session(A,S1,{sub:B})); f.open(); await f.send(); assert.equal(f.mutations().length, 0);
});
test("changed mutable state before auth callback cannot dispatch under B", async () => {
  const f = fixture(); f.open(); const read = f.revision(); const work = f.send();
  f.state.user = {id:B}; read.finish(); await work; assert.equal(f.mutations().length, 0);
});
test("close during revision check clears draft and cancels dispatch", async () => {
  const f = fixture(); f.open(); const read = f.revision(); const work = f.send();
  await f.$("v2ReportClose").fire("click"); read.finish(); await work;
  assert.equal(f.mutations().length, 0); assert.equal(f.$("v2ReportDetails").value, "");
});
test("change target while awaiting revision never mixes old details and new target", async () => {
  const f = fixture(); f.open(); const read = f.revision(); const work = f.send();
  f.open(1,"Second target private draft"); read.finish(); await work;
  assert.equal(f.mutations().length, 0); assert.equal(f.$("v2ReportDetails").value, "Second target private draft");
});
test("editing details during revision cancels old dispatch", async () => {
  const f = fixture(); f.open(); const read = f.revision(); const work = f.send();
  f.$("v2ReportDetails").value = "Edited private draft"; await f.$("v2ReportDetails").fire("input");
  read.finish(); await work; assert.equal(f.mutations().length, 0); assert.equal(f.$("v2ReportDetails").value, "Edited private draft");
});
test("editing issue type during revision cancels old dispatch", async () => {
  const f = fixture(); f.open(); const read = f.revision(); const work = f.send();
  f.$("v2ReportKind").value = "safety_concern"; await f.$("v2ReportKind").fire("change"); read.finish(); await work;
  assert.equal(f.mutations().length, 0);
});
test("programmatic details replacement also cancels obsolete action", async () => {
  const f = fixture(); f.open(); const read = f.revision(); const work = f.send();
  f.$("v2ReportDetails").value = "Another draft without an input event"; read.finish(); await work; assert.equal(f.mutations().length, 0);
});
test("editing the underlying fare record cancels obsolete report", async () => {
  const f = fixture(); f.open(); const read = f.revision(); const work = f.send();
  f.state.fares[0].fare_price = 35; read.finish(); await work; assert.equal(f.mutations().length, 0);
});
test("double click dispatches one protected mutation", async () => {
  const f = fixture(); f.open(); const read = f.revision(); const first = f.send(); const second = f.send();
  read.finish(); await Promise.all([first,second]); assert.equal(f.mutations().length, 1);
});
test("old mutation success cannot clear new account draft or emit success", async () => {
  const f = fixture(); f.open(); const write = f.mutation(); const old = f.send(); await tick();
  assert.equal(f.mutations().length, 1); f.observe(session(B)); f.open(1,"B private draft must remain");
  write.finish(); await old; assert.equal(f.$("v2ReportDetails").value,"B private draft must remain");
  assert.doesNotMatch(f.$("v2ReportMessage").textContent,/received/);
});
test("old mutation error cannot replace new account status", async () => {
  const f = fixture(); f.open(); const write = f.mutation(); const old = f.send(); await tick();
  f.observe(session(B)); f.open(1,"B private draft must remain"); const message = f.$("v2ReportMessage").textContent;
  write.reject(new Error("network")); await old; assert.equal(f.$("v2ReportMessage").textContent,message);
});
test("old action finalizer cannot unlock newer pending action", async () => {
  const f = fixture(); f.open(); const oldWrite = f.mutation(); const old = f.send(); await tick();
  f.observe(session(B)); f.open(1,"B private draft"); const newRead = f.revision("revision-2","fare-2"); const current = f.send();
  oldWrite.finish(); await old; assert.equal(f.$("v2ReportSubmit").disabled,true);
  newRead.finish(); await current; assert.equal(f.mutations().length,2); assert.equal(f.mutations()[1].args.p_expected_actor,B);
});
test("closing an in-flight mutation prevents its later success in reopened form", async () => {
  const f = fixture(); f.open(); const write=f.mutation(); const old=f.send(); await tick();
  await f.$("v2ReportClose").fire("click"); f.open(1,"Reopened private draft"); write.finish(); await old;
  assert.equal(f.$("v2ReportDetails").value,"Reopened private draft"); assert.doesNotMatch(f.$("v2ReportMessage").textContent,/received/);
});
test("mutation uncertainty is not automatically replayed", async () => {
  const f = fixture(); f.open(); const write=f.mutation(); const work=f.send(); await tick();
  write.reject(new Error("network timeout")); await work; assert.equal(f.mutations().length,1);
  assert.match(f.$("v2ReportMessage").textContent,/not resent|not automatically|could not confirm/i);
});
test("incomplete or invalid issue type never dispatches", async () => {
  const f=fixture(); f.open(); f.$("v2ReportKind").value="untrusted_kind"; await f.send(); assert.equal(f.mutations().length,0);
});
test("late account action does not clear intentionally shared public confidence", async () => {
  const f=fixture(); const card=new Node(); f.api.showTrust(card,"fare",f.state.fares[0]);
  f.observe(session(B)); assert.equal(card.children.length,1);
  assert.match(card.children[0].children[0].textContent,/Not independently verified/);
});
test("revision check failure clearly says report was not sent", async () => {
  const f=fixture(); f.open(); const read=f.revision(); const work=f.send(); read.reject(new Error("network timeout")); await work;
  assert.equal(f.mutations().length,0); assert.match(f.$("v2ReportMessage").textContent,/report was not sent/);
});
test("unexpected mutation response does not claim successful submission", async () => {
  const f=fixture(); f.open(); const write=f.mutation(); const work=f.send(); await tick();
  write.resolve({data:null,error:null}); await work;
  assert.doesNotMatch(f.$("v2ReportMessage").textContent,/Report received/); assert.match(f.$("v2ReportMessage").textContent,/not automatically resent/);
});
test("duplicate receipt retains actual duplicate semantics", async () => {
  const f=fixture(); f.open(); const write=f.mutation(); const work=f.send(); await tick();
  write.resolve({data:{status:"duplicate",issue_id:"synthetic-issue"},error:null}); await work;
  assert.match(f.$("v2ReportMessage").textContent,/already have an open report/); assert.equal(f.mutations().length,1);
});
test("anonymous sign-in object does not become report-capable", async () => {
  const f=fixture(); const next=session(); next.user.is_anonymous=true; f.observe(next); f.open(); await f.send(); assert.equal(f.mutations().length,0);
});
test("editing after dispatch reports uncertainty without resending", async () => {
  const f=fixture(); f.open(); const write=f.mutation(); const work=f.send(); await tick();
  f.$("v2ReportDetails").value="New information after dispatch"; await f.$("v2ReportDetails").fire("input");
  assert.match(f.$("v2ReportMessage").textContent,/may already have been received/); write.finish(); await work;
  assert.equal(f.mutations().length,1); assert.equal(f.$("v2ReportDetails").value,"New information after dispatch");
});
test("changed fact revision does not silently attach a draft to a replacement fact", async () => {
  const f=fixture(); await f.api.onData(); f.open(); const read=f.revision("revision-2"); const work=f.send(); read.finish(); await work;
  assert.equal(f.mutations().length,0); assert.match(f.$("v2ReportMessage").textContent,/record has changed/);
});
