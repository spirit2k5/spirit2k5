import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createIdentityClock, createGuardedAuthStorage} from "../web-auth.js";

const session = (id, sid = id + "-session", email = id + "@example.test") => ({
  user:{id,email}, access_token:"e30."+Buffer.from(JSON.stringify({sub:id,session_id:sid})).toString("base64url")+".test",
  refresh_token:"synthetic-refresh-"+sid, expires_at:Math.floor(Date.now()/1000)+3600
});
const deferred = () => {let resolve; const promise=new Promise(r=>resolve=r); return {promise,resolve};};
class Node {
  constructor(id="") {
    this.id=id; this.value=""; this.textContent=""; this.disabled=false; this.children=[]; this.dataset={}; this.events={};
    const classes = new Set(["hidden"]);
    this.classList={add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),
      toggle:(c,on)=>{if(on===undefined)on=!classes.has(c);on?classes.add(c):classes.delete(c);return on;}};
    this.style={}; this.validity={valid:true};
  }
  addEventListener(event, fn) {this.events[event]=fn;}
  setAttribute() {} focus() {} scrollIntoView() {}
  append(...nodes) {this.children.push(...nodes);}
  replaceChildren(...nodes) {this.children=nodes;}
}
async function fixture(options={}) {
  const nodes=new Map(), $=id=>{if(!nodes.has(id))nodes.set(id,new Node(id));return nodes.get(id);};
  const store=new Map(), timers=[], calls={send:[],verify:[],adopt:[],identity:[],catalog:0};
  let listener, sdkOptions;
  const seed=options.seed || Promise.resolve({data:{session:null},error:null});
  const storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
  const primary={rpc:async()=>{calls.catalog++;return {data:{schema:2,fares:[],points:[],generated_at:"2026-10-21T07:00:00Z"},error:null};},auth:{
    onAuthStateChange:fn=>{listener=fn;return {data:{subscription:{unsubscribe(){}}}};},
    getSession:()=>seed,
    signInWithOtp:async args=>{calls.send.push(args);return options.send?options.send(args):{error:null};},
    signInWithPassword:async()=>({error:null,data:{session:session("A")}}),
    signInWithOAuth:async args=>options.oauth?options.oauth(args):({error:{message:"synthetic-disabled"}}),
    signOut:async()=>{listener("SIGNED_OUT",null);return {error:null};},
    setSession:async tokens=>{
      calls.adopt.push(tokens);
      if(options.beforeWrite)await options.beforeWrite();
      try {sdkOptions.auth.storage.setItem("sb-test-auth-token",JSON.stringify({...options.verified, ...tokens}));}
      catch(error){return {error};}
      listener("SIGNED_IN",options.verified);
      return {data:{session:options.verified},error:null};
    }
  }};
  const verifier={auth:{
    verifyOtp:async args=>{calls.verify.push(args);return options.verify?options.verify(args):{data:{session:options.verified},error:null};},
    signInWithPassword:async args=>options.password?options.password(args):{data:{session:options.verified},error:null}
  }};
  let clientCount=0;
  const createClient=(_url,_key,opts)=>{if(clientCount++===0){sdkOptions=opts;return primary;}return verifier;};
  const v2={onIdentityChanged:s=>calls.identity.push(s),onTab(){},onData:async()=>{},init(){},showTrust(){},focusPoint(){},openIssue(){},openGeneralReport(){}};
  let code=fs.readFileSync(new URL(options.original?"../../../source/faremap/app.js":"../app.js",import.meta.url),"utf8").replace(/^import .*;\r?\n/gm,"");
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  const run=new AsyncFunction("createClient","createPassengerWebEnhancements","createIdentityClock","createGuardedAuthStorage","document","window","localStorage","navigator","location","history","setTimeout",code+"\nreturn {state};");
  const document={getElementById:$,createElement:()=>new Node(),querySelectorAll:()=>[],addEventListener(){},documentElement:{dataset:{}}};
  const window={matchMedia:()=>({matches:false,addEventListener(){}}),scrollTo(){},location:{assign(){}}};
  const pending=run(createClient,()=>v2,createIdentityClock,createGuardedAuthStorage,document,window,storage,{}, {href:"https://spirit2k5.co.za/faremap/"},{replaceState(){}},fn=>timers.push(fn));
  const flush=async()=>{for(let i=0;i<6;i++){while(timers.length)timers.shift()();await Promise.resolve();}};
  const api={$,calls,store,pending,event:(event,s)=>listener(event,s),flush,
    click:async id=>{assert.equal(typeof $(id).events.click,"function",id+" action exists");return $(id).events.click();},
    input:(id,value)=>{$(id).value=value;$(id).events.input?.();}};
  if(!options.deferSeed){await pending;await flush();}
  return api;
}
const original=process.env.FAREMAP_TEST_ORIGINAL==="1";
const setup=opts=>fixture({...opts,original});

test("identity epochs preserve refresh and reject A-B-A recapture",()=>{
  const clock=createIdentityClock();clock.observe(session("A"));const owner=clock.snapshot();
  clock.observe(session("A"));assert.equal(clock.isCurrent(owner),true);
  clock.observe(session("B"));clock.observe(session("A"));assert.equal(clock.isCurrent(owner),false);
});
test("a new session for the same account invalidates pending work",()=>{
  const clock=createIdentityClock();clock.observe(session("A","one"));const owner=clock.snapshot();
  clock.observe(session("A","two"));assert.equal(clock.isCurrent(owner),false);
});
test("late adoption storage writes are denied without removing the new account",()=>{
  const store=new Map([["auth","B"]]);const storage=createGuardedAuthStorage({getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)});
  storage.guardSession("A-token",()=>false);
  assert.throws(()=>storage.setItem("auth",JSON.stringify({access_token:"A-token"})),/cancelled/);
  assert.equal(store.get("auth"),"B");
  storage.setItem("auth",JSON.stringify({access_token:"B-refreshed"}));
  assert.match(store.get("auth"),/B-refreshed/);
});
test("obsolete adoption cannot delete a newer Google PKCE verifier",()=>{
  const store=new Map([["auth-code-verifier","B-verifier"]]);
  const storage=createGuardedAuthStorage({getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)});
  const release=storage.guardSession("A-token",()=>false);
  storage.removeItem("auth-code-verifier");assert.equal(store.get("auth-code-verifier"),"B-verifier");
  release();storage.removeItem("auth-code-verifier");assert.equal(store.has("auth-code-verifier"),false);
});
test("a later auth event wins over the asynchronous startup seed",async()=>{
  const seed=deferred();const f=await setup({seed:seed.promise,deferSeed:true});
  f.event("SIGNED_IN",session("B"));seed.resolve({data:{session:session("A")},error:null});
  const result=await f.pending;await f.flush();assert.equal(result.state.user.id,"B");
  assert.match(f.$("profileEmail").textContent,/B@example/);
});
test("late INITIAL_SESSION cannot rewind an established sign-in",async()=>{
  const f=await setup();f.event("SIGNED_IN",session("B"));f.event("INITIAL_SESSION",session("A"));await f.flush();
  assert.match(f.$("profileEmail").textContent,/B@example/);
});
test("logout clears the previous account label synchronously",async()=>{
  const f=await setup();f.event("SIGNED_IN",session("A"));await f.flush();
  f.event("SIGNED_OUT",null);assert.equal(f.$("profileEmail").textContent,"");
});
test("guest source label reflects a live catalogue rather than claiming snapshot",async()=>{
  const f=await setup();await f.click("guestBtn");await f.flush();
  assert.match(f.$("guestModeLabel").textContent,/current public catalogue/);
  assert.doesNotMatch(f.$("guestModeLabel").textContent,/dated snapshot/);
});
test("accepted email request exposes code entry without creating a session",async()=>{
  const f=await setup();f.input("email","A@example.test");await f.click("emailLinkBtn");
  assert.equal(f.$("emailCodeSection").classList.contains("hidden"),false);
  assert.equal(f.calls.adopt.length,0);assert.match(f.$("authMessage").textContent,/another device/);
});
test("editing email cancels an in-flight send and cannot display its old address",async()=>{
  const send=deferred();const f=await setup({send:()=>send.promise});f.input("email","A@example.test");
  const pending=f.click("emailLinkBtn");f.input("email","B@example.test");send.resolve({error:null});await pending;
  assert.equal(f.$("emailCodeSection").classList.contains("hidden"),true);
  assert.doesNotMatch(f.$("authMessage").textContent,/A@example/);
});
test("a code from another device verifies and adopts once, then clears the code",async()=>{
  const verified=session("A");const f=await setup({verified});f.input("email",verified.user.email);await f.click("emailLinkBtn");
  f.input("emailCode","123456");await f.click("verifyEmailCodeBtn");await f.flush();
  assert.equal(f.calls.verify.length,1);assert.equal(f.calls.adopt.length,1);
  assert.equal(f.calls.verify[0].type,"email");assert.match(f.$("profileEmail").textContent,/A@example/);
  assert.equal(f.$("emailCode").value,"");
});
test("wrong-account verification never adopts its credentials",async()=>{
  const f=await setup({verified:session("B")});f.input("email","A@example.test");await f.click("emailLinkBtn");
  f.input("emailCode","123456");await f.click("verifyEmailCodeBtn");assert.equal(f.calls.adopt.length,0);
});
test("a late code response cannot replace a different signed-in account",async()=>{
  const verify=deferred();const f=await setup({verify:()=>verify.promise,verified:session("A")});
  f.input("email","A@example.test");await f.click("emailLinkBtn");f.input("emailCode","123456");
  const pending=f.click("verifyEmailCodeBtn");f.event("SIGNED_IN",session("B"));
  verify.resolve({data:{session:session("A")},error:null});await pending;await f.flush();
  assert.equal(f.calls.adopt.length,0);assert.match(f.$("profileEmail").textContent,/B@example/);
});
test("account changes during SDK adoption wait prevent the stale storage write",async()=>{
  const wait=deferred();const f=await setup({verified:session("A"),beforeWrite:()=>wait.promise});
  f.input("email","A@example.test");await f.click("emailLinkBtn");f.input("emailCode","123456");
  const pending=f.click("verifyEmailCodeBtn");await Promise.resolve();await Promise.resolve();
  f.event("SIGNED_IN",session("B"));f.store.set("sb-test-auth-token","B-session");
  wait.resolve();await pending;await f.flush();
  assert.equal(f.store.get("sb-test-auth-token"),"B-session");assert.match(f.$("profileEmail").textContent,/B@example/);
});
test("invalid code does not dispatch and repeated clicks do not double-verify",async()=>{
  const verify=deferred();const f=await setup({verify:()=>verify.promise,verified:session("A")});
  f.input("email","A@example.test");await f.click("emailLinkBtn");f.input("emailCode","abc");await f.click("verifyEmailCodeBtn");
  assert.equal(f.calls.verify.length,0);f.input("emailCode","123456");const pending=f.click("verifyEmailCodeBtn");
  await f.click("verifyEmailCodeBtn");assert.equal(f.calls.verify.length,1);
  verify.resolve({error:{message:"otp_expired"}});await pending;
  assert.match(f.$("authMessage").textContent,/expired/);assert.equal(f.$("verifyEmailCodeBtn").disabled,false);
});
test("choosing guest browsing cancels an in-flight code verification",async()=>{
  const verify=deferred();const f=await setup({verify:()=>verify.promise,verified:session("A")});
  f.input("email","A@example.test");await f.click("emailLinkBtn");f.input("emailCode","123456");
  const pending=f.click("verifyEmailCodeBtn");await f.click("guestBtn");
  verify.resolve({data:{session:session("A")},error:null});await pending;await f.flush();
  assert.equal(f.calls.adopt.length,0);assert.match(f.$("accountLabel").textContent,/Guest passenger/);
});
test("password sign-in uses isolated verification and guarded adoption",async()=>{
  const f=await setup({verified:session("A")});f.input("email","A@example.test");f.input("password","synthetic-password");
  await f.click("passwordBtn");await f.flush();assert.equal(f.calls.adopt.length,1);
  assert.match(f.$("profileEmail").textContent,/A@example/);assert.equal(f.$("password").value,"");
});
test("late password completion cannot adopt over a replacement account",async()=>{
  const password=deferred();const f=await setup({password:()=>password.promise,verified:session("A")});
  f.input("email","A@example.test");f.input("password","synthetic-password");const pending=f.click("passwordBtn");
  f.event("SIGNED_IN",session("B"));password.resolve({data:{session:session("A")},error:null});await pending;await f.flush();
  assert.equal(f.calls.adopt.length,0);assert.match(f.$("profileEmail").textContent,/B@example/);
});
test("obsolete password errors cannot overwrite a newer email request or unlock it",async()=>{
  const password=deferred(), send=deferred();const f=await setup({password:()=>password.promise,send:()=>send.promise});
  f.input("email","A@example.test");f.input("password","synthetic-password");const prior=f.click("passwordBtn");
  f.input("email","B@example.test");const next=f.click("emailLinkBtn");
  password.resolve({error:{message:"invalid login credentials"}});await prior;
  assert.match(f.$("authMessage").textContent,/Sending/);assert.equal(f.$("emailLinkBtn").disabled,true);
  send.resolve({error:null});await next;
});
test("obsolete Google completion cannot navigate or overwrite a new email action",async()=>{
  const oauth=deferred(),send=deferred();const f=await setup({oauth:()=>oauth.promise,send:()=>send.promise});
  const prior=f.click("googleBtn");f.input("email","B@example.test");const next=f.click("emailLinkBtn");
  oauth.resolve({error:{message:"network"}});await prior;
  assert.match(f.$("authMessage").textContent,/Sending/);assert.equal(f.$("emailLinkBtn").disabled,true);
  send.resolve({error:null});await next;
});
for (const action of ["emailLinkBtn","passwordBtn","googleBtn"]) {
  test("failed new "+action+" request hides the retired email-code challenge",async()=>{
    let sends=0;
    const f=await setup({send:async()=>++sends===1?{error:null}:{error:{message:"network"}},password:async()=>({error:{message:"invalid login credentials"}})});
    f.input("email","A@example.test");await f.click("emailLinkBtn");
    assert.equal(f.$("emailCodeSection").classList.contains("hidden"),false);
    f.input("password","synthetic-password");await f.click(action);
    assert.equal(f.$("emailCodeSection").classList.contains("hidden"),true);
  });
}
