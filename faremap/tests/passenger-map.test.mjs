import test from "node:test";
import assert from "node:assert/strict";
import { createPassengerMapController, pickupCoordinates, pickupConfidence,
  NATIVE_STREET_STYLE, NATIVE_SATELLITE_STYLE, NATIVE_CONFIDENCE_COLOURS } from "../passenger-map.js";

class Node {
  constructor(name = "div") {
    this.tagName = name; this.children = []; this.listeners = new Map(); this.attrs = {}; this.dataset = {};
    this.className = ""; this.textContent = ""; this.parentElement = null;
    this.style = { overflow: "", setProperty(key, value) { this[key] = value; } };
    const set = new Set();
    this.classList = { add:(...xs)=>xs.forEach(x=>set.add(x)),remove:(...xs)=>xs.forEach(x=>set.delete(x)),contains:x=>set.has(x),
      toggle:(x,on)=>{const value=on ?? !set.has(x);value?set.add(x):set.delete(x);return value;} };
  }
  append(...nodes) {this.children.push(...nodes);for(const node of nodes)node.parentElement=this;}
  setAttribute(key, value) {this.attrs[key]=String(value);}
  getAttribute(key) {return this.attrs[key] ?? null;}
  removeAttribute(key) {delete this.attrs[key];}
  addEventListener(name, fn) {if(!this.listeners.has(name))this.listeners.set(name,[]);this.listeners.get(name).push(fn);}
  removeEventListener(name, fn) {this.listeners.set(name,(this.listeners.get(name)||[]).filter(x=>x!==fn));}
  fire(name, args = {}) {for(const fn of this.listeners.get(name)||[])fn({target:this,...args});}
  remove() {this.removed=true;this.parentElement?.children.splice(this.parentElement.children.indexOf(this),1);}
  focus() {this.focused=true;if(globalThis.document)globalThis.document.activeElement=this;}
  closest(selector) {let node=this;while(node){if(selector===".fm-map-frame" && node.classList.contains("fm-map-frame"))return node;node=node.parentElement;}return null;}
  querySelector(selector) {for(const node of this.children){if(node.tagName===selector || (selector==="[data-map-layer-label]" && node.attrs["data-map-layer-label"]!==undefined))return node;const result=node.querySelector?.(selector);if(result)return result;}return null;}
  querySelectorAll() {const result=[];for(const node of this.children){if(node.tagName==="button" && !node.disabled)result.push(node);result.push(...node.querySelectorAll());}return result;}
}
function fixture(t, options={}) {
  const nodes=new Map(), controls=[], maps=[], markers=[], selected=[], locating=[];
  const $=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};
  for(const id of ["fmHomeMap","v2Map"]){const frame=new Node();frame.classList.add("fm-map-frame");frame.append($(id));}
  for(const view of ["home","points"])for(const action of ["street","satellite","layers","locate","all","fullscreen","zoom-in","zoom-out"]){
    const button=new Node("button");button.dataset={mapView:view,mapAction:action};controls.push(button);
    $(view==="home"?"fmHomeMap":"v2Map").parentElement.append(button);
    if(action==="layers"){const label=new Node("span");label.setAttribute("data-map-layer-label","");label.textContent="Streets";button.append(label);}
  }
  const body=new Node("body");body.style.overflow="auto";
  const document=new Node("document");Object.assign(document,{body,activeElement:controls[0],getElementById:$,
    createElement:tag=>new Node(tag),createElementNS:(_ns,tag)=>new Node(tag),querySelectorAll:()=>controls});
  class FakeMap {
    constructor(config) {if(options.throwConstructor)throw new Error("No rendering context");this.config=config;this.events=new globalThis.Map();this.zoom=config.zoom;this.resizes=0;this.eases=[];this.fits=[];this.styles=[];this.zoomIns=0;this.zoomOuts=0;maps.push(this);}
    on(name, fn) {this.events.set(name,fn);return this;}
    emit(name, args={}) {this.events.get(name)?.(args);}
    resize() {this.resizes++;}
    easeTo(args) {this.eases.push(args);if(args.zoom!==undefined)this.zoom=args.zoom;}
    fitBounds(bounds,args) {this.fits.push({bounds,args});}
    getZoom() {return this.zoom;}
    setStyle(value) {this.styles.push(value);}
    zoomIn() {this.zoomIns++;}
    zoomOut() {this.zoomOuts++;}
    remove() {this.removed=true;}
  }
  class Marker {
    constructor(config) {this.config=config;markers.push(this);}
    setLngLat(value) {this.coordinates=value;return this;}
    addTo(map) {this.map=map;return this;}
    remove() {this.removed=true;}
  }
  const previousDocument=globalThis.document,previousWindow=globalThis.window;
  globalThis.document=document;
  globalThis.window=options.missingGL?{}:{maplibregl:{Map:FakeMap,Marker,supported:()=>options.supported!==false}};
  const controller=createPassengerMapController({onSelectPoint:p=>selected.push(p),onLocate:()=>locating.push(true)});
  controller.init();
  t.after(()=>{controller.destroy();globalThis.document=previousDocument;globalThis.window=previousWindow;});
  return {controller,$,controls,maps,markers,selected,locating,document,button:(view,action)=>controls.find(n=>n.dataset.mapView===view && n.dataset.mapAction===action),
    currentPins:()=>markers.filter(m=>!m.removed && m.config.element.className==="fm-pickup-marker")};
}
const point=(id="p1",latitude=-26.2,longitude=28.04,name="Recorded pickup")=>({id,name,latitude,longitude});

test("uses the same street style, satellite source and confidence palette as the native app",()=>{
  assert.equal(NATIVE_STREET_STYLE,"https://tiles.openfreemap.org/styles/liberty");
  assert.deepEqual(NATIVE_CONFIDENCE_COLOURS,{high:"#2563EB",community:"#7C3AED",unverified:"#64748B",stale:"#B45309",disputed:"#C2410C"});
  assert.match(NATIVE_SATELLITE_STYLE.sources.worldImagery.tiles[0],/World_Imagery\/MapServer\/tile\/\{z\}\/\{y\}\/\{x\}$/);
  assert.equal(NATIVE_SATELLITE_STYLE.sources.worldImagery.tileSize,256);
});
test("coordinates reject missing, empty, whitespace, boolean, invalid and zero-zero values",()=>{
  for(const value of [point("x",null,1),point("x","",1),point("x"," ",1),point("x",true,1),point("x",100,1),point("x",1,181),point("x",0,0),point("x",[],1),point("x",[2],1),point("x",{valueOf:()=>3},1),point("x",1,{valueOf:()=>3}),point("x",1n,2),point("x","0x20",1)])assert.equal(pickupCoordinates(value),null);
  assert.deepEqual(pickupCoordinates(point("x","-26.2","28.04")),{lat:-26.2,lng:28.04});
  assert.deepEqual(pickupCoordinates(point("x",0,28)),{lat:0,lng:28});
});
test("confidence falls back honestly and ages old positive observations",()=>{
  const now=Date.parse("2026-10-21T00:00:00Z");
  assert.equal(pickupConfidence(null,now).label,"Unknown");
  assert.equal(pickupConfidence({confidence_level:"high",unavailable:true},now).colour,"#64748B");
  assert.equal(pickupConfidence({confidence_level:"high",last_verified_at:"2026-08-01",freshness_days:30},now).label,"Stale");
  assert.equal(pickupConfidence({confidence_level:"high",fetched_at:"2026-10-20T23:58:29Z"},now).label,"Unknown");
  assert.equal(pickupConfidence({confidence_level:"community"},now).label,"Community");
  assert.equal(pickupConfidence({confidence_level:"high",last_verified_at:"2027-01-01",freshness_days:30},now).label,"Unknown");
  assert.equal(pickupConfidence({confidence_level:"high",fetched_at:"2027-01-01"},now).label,"Unknown");
  assert.equal(pickupConfidence({confidence_level:"high",fetched_at:"not a date"},now).label,"Unknown");
});
test("maps are lazy, initialized once and never request location automatically",t=>{
  const f=fixture(t);f.controller.setPoints([point()]);assert.equal(f.maps.length,0);assert.equal(f.locating.length,0);
  f.controller.onTab("home");f.controller.onTab("home");assert.equal(f.maps.length,1);
  assert.equal(f.maps[0].config.container,f.$("fmHomeMap"));assert.equal(f.maps[0].config.style,NATIVE_STREET_STYLE);
  assert.deepEqual(f.maps[0].config.center,[28.0473,-26.2041]);assert.equal(f.maps[0].config.attributionControl,true);
  f.controller.onTab("points");assert.equal(f.maps.length,2);assert.equal(f.locating.length,0);
});
test("renders actual bus/location pickup pins, not generic dots or invented live counts",t=>{
  const f=fixture(t);f.controller.setPoints([point(),point("invalid",null,1)]);f.controller.onTab("home");
  const pins=f.currentPins();assert.equal(pins.length,1);
  const node=pins[0].config.element;assert.equal(node.tagName,"button");assert.equal(node.type,"button");
  assert.equal(pins[0].config.anchor,"bottom");assert.deepEqual(pins[0].coordinates,[28.04,-26.2]);
  assert.equal(node.style["--fm-pin-size"],"42px");assert.equal(node.style["--fm-pin-color"],"#64748B");
  assert.match(node.getAttribute("aria-label"),/Recorded pickup.*Confidence unavailable.*not physical safety/);
  assert.match(node.querySelector("use").getAttribute("href"),/#bus$/);
  assert.equal(node.children.at(-1).textContent,"Unknown");
  assert.doesNotMatch(node.getAttribute("aria-label"),/waiting|live taxi/);
});
test("point names remain text/attributes and are never inserted as HTML",t=>{
  const f=fixture(t);const unsafe=point("p1",-26,28,'<img src=x onerror=alert(1)>');f.controller.setPoints([unsafe]);f.controller.onTab("points");
  const pin=f.currentPins()[0].config.element;assert.match(pin.getAttribute("aria-label"),/^<img src=x/);
  assert.equal(pin.querySelector("img"),null);assert.equal(pin.title,unsafe.name);
});
test("selecting a pin highlights both maps and calls back with the actual record",t=>{
  const f=fixture(t);f.controller.setPoints([point()]);f.controller.onTab("home");f.controller.onTab("points");
  f.currentPins()[0].config.element.fire("click");
  assert.deepEqual(f.selected,[point()]);
  const pins=f.currentPins();assert.equal(pins[0].config.element.style["--fm-pin-size"],"49px");
  assert.equal(pins[1].config.element.style["--fm-pin-size"],"56px");
  assert.ok(pins.every(m=>m.config.element.getAttribute("aria-pressed")==="true"));
});
test("actual passenger factory opens visible full-map details before focusing a home pin",async t=>{
  const {createPassengerWebEnhancements}=await import("../passenger-v2.js");
  const f=fixture(t);f.controller.destroy();
  for(const id of ["v2PlanFrom","v2PlanTo","v2PlanResults"]){
    const node=f.$(id);node.value="";
    node.replaceChildren=(...children)=>{node.children=[];node.append(...children);};
  }
  f.document.querySelectorAll=selector=>selector==="[data-map-action][data-map-view]"?f.controls:[];
  const selected=point(),steps=[];
  let currentTab="home",details=null,api;
  api=createPassengerWebEnhancements({
    supabase:{rpc:async()=>({data:[],error:null})},state:{points:[selected],fares:[],user:null},$:f.$,
    element:(tag,cls,text)=>{const node=new Node(tag);node.className=cls;node.textContent=text??"";return node;},
    setTab:tab=>{currentTab=tab;steps.push("tab:"+tab);api.onTab(tab);},
    openPoint:value=>{assert.equal(currentTab,"points");details=value;steps.push("details");},
    formatMoney:String,readableDate:String,status(){},showLogin(){},locatePassenger(){}
  });
  api.init();await api.onData();api.onTab("home");
  assert.equal(f.maps.length,1);f.currentPins()[0].config.element.fire("click");
  assert.deepEqual(steps,["tab:points","details"]);assert.equal(details.id,selected.id);
  assert.equal(f.maps.length,2);assert.equal(f.maps[1].config.container,f.$("v2Map"));
  assert.deepEqual(f.maps[1].eases.at(-1).center,[selected.longitude,selected.latitude]);
  assert.equal(f.maps[1].eases.at(-1).zoom,15);
});

test("late callbacks from replaced or removed pickup records cannot select old data",t=>{
  const f=fixture(t);f.controller.setPoints([point()]);f.controller.onTab("home");const prior=f.currentPins()[0].config.element;
  f.controller.setPoints([point("p2")]);prior.fire("click");assert.equal(f.selected.length,0);
  f.controller.setPoints([]);assert.equal(f.currentPins().length,0);
});
test("confidence updates preserve marker positions, camera and selected state",t=>{
  const f=fixture(t);f.controller.setPoints([point()]);f.controller.onTab("points");f.controller.focusPoint(point());
  const pin=f.currentPins()[0],eases=f.maps[0].eases.length;
  f.controller.setConfidence(new Map([["pickup:p1",{confidence_level:"community"}]]));
  assert.equal(f.currentPins()[0],pin);assert.equal(f.maps[0].eases.length,eases);
  assert.equal(pin.config.element.style["--fm-pin-color"],"#7C3AED");assert.equal(pin.config.element.children.at(-1).textContent,"Community");
  assert.equal(pin.config.element.getAttribute("aria-pressed"),"true");
});
test("array confidence input uses pickup IDs and no invented confirmation from updated_at",t=>{
  const f=fixture(t);f.controller.setPoints([{...point(),updated_at:new Date().toISOString()}]);f.controller.onTab("home");
  assert.equal(f.currentPins()[0].config.element.children.at(-1).textContent,"Unknown");
  f.controller.setConfidence([{entity_id:"p1",confidence_level:"disputed"}]);
  assert.equal(f.currentPins()[0].config.element.children.at(-1).textContent,"Review");
  assert.equal(f.currentPins()[0].config.element.style["--fm-pin-color"],"#C2410C");
});
test("street and satellite controls use the native styles with explicit pressed state",t=>{
  const f=fixture(t);f.controller.onTab("points");f.button("points","satellite").fire("click");
  assert.deepEqual(f.maps[0].styles[0],NATIVE_SATELLITE_STYLE);
  assert.equal(f.button("points","satellite").getAttribute("aria-pressed"),"true");
  assert.equal(f.button("points","street").getAttribute("aria-pressed"),"false");
  f.button("points","street").fire("click");assert.equal(f.maps[0].styles[1],NATIVE_STREET_STYLE);
});
test("single native layers control toggles the current Streets/Satellite label and accessible action",t=>{
  const f=fixture(t);f.controller.onTab("home");const layers=f.button("home","layers"), label=layers.querySelector("[data-map-layer-label]");
  assert.equal(layers.getAttribute("aria-label"),"Show satellite map");assert.equal(label.textContent,"Streets");
  layers.fire("click");assert.equal(label.textContent,"Satellite");assert.equal(layers.getAttribute("aria-pressed"),"true");
  assert.equal(layers.getAttribute("aria-label"),"Show street map");
  layers.fire("click");assert.equal(label.textContent,"Streets");assert.equal(layers.getAttribute("aria-pressed"),"false");
});
test("all-points fitting and zoom controls are explicit and use only valid coordinates",t=>{
  const f=fixture(t);f.controller.setPoints([point("a",-26,27),point("b",-25,28),point("bad",null,2)]);f.controller.onTab("points");
  assert.equal(f.maps[0].fits.length,0);f.button("points","all").fire("click");
  assert.deepEqual(f.maps[0].fits[0].bounds,[[27,-26],[28,-25]]);
  f.button("points","zoom-in").fire("click");f.button("points","zoom-out").fire("click");
  assert.equal(f.maps[0].zoomIns,1);assert.equal(f.maps[0].zoomOuts,1);
});
test("location is requested only by its control and displays only a supplied valid fix",t=>{
  const f=fixture(t);f.controller.setPoints([point()]);f.controller.onTab("home");
  assert.equal(f.markers.length,1);f.button("home","locate").fire("click");assert.equal(f.locating.length,1);
  assert.equal(f.markers.length,1);f.controller.setLocation({lat:-26.1,lng:28.1});
  const fix=f.markers.at(-1);assert.equal(fix.config.element.className,"fm-user-location-dot");assert.deepEqual(fix.coordinates,[28.1,-26.1]);
  f.controller.setLocation({lat:null,lng:28});assert.equal(fix.removed,true);
});
test("clearLocation removes only private location fixes, preserving public pins, selected state and cameras",t=>{
  const f=fixture(t);f.controller.setPoints([point()]);f.controller.onTab("home");f.controller.onTab("points");
  f.controller.focusPoint(point());f.controller.setLocation({lat:-26.1,lng:28.1});
  const pins=f.currentPins(),positions=f.maps.map(map=>map.eases.length),userFixes=f.markers.filter(marker=>!marker.removed && marker.config.element.className==="fm-user-location-dot");
  f.controller.clearLocation();assert.ok(userFixes.every(marker=>marker.removed));
  assert.deepEqual(f.currentPins(),pins);assert.ok(pins.every(marker=>marker.config.element.getAttribute("aria-pressed")==="true"));
  assert.deepEqual(f.maps.map(map=>map.eases.length),positions);
});
test("missing or unsupported WebGL keeps an accessible fallback and permits later recovery",t=>{
  const f=fixture(t,{supported:false});f.controller.onTab("points");assert.equal(f.maps.length,0);
  assert.match(f.$("v2MapNote").textContent,/list.*external map links/);assert.equal(f.$("v2Map").children[0].getAttribute("role"),"status");
  window.maplibregl.supported=()=>true;f.controller.onTab("points");assert.equal(f.maps.length,1);
});
test("constructor failure does not hide the independent pickup-point list",t=>{
  const f=fixture(t,{throwConstructor:true});f.controller.onTab("home");
  assert.match(f.$("homeMapStatus").textContent,/unavailable/);assert.equal(f.$("fmHomeMap").children[0].getAttribute("role"),"status");
});
test("asynchronous tile errors are reported and a successful load can recover",t=>{
  const f=fixture(t);f.controller.setPoints([point()]);f.controller.onTab("points");
  f.maps[0].emit("error");assert.match(f.$("v2MapNote").textContent,/tiles could not load/);
  f.maps[0].emit("load");assert.match(f.$("v2MapNote").textContent,/1 recorded pickup point/);
});
test("a successful replacement style recovers an old tile warning without moving the camera",t=>{
  const f=fixture(t);f.controller.setPoints([point()]);f.controller.onTab("points");
  f.maps[0].emit("error");f.button("points","layers").fire("click");f.maps[0].emit("style.load");
  assert.match(f.$("v2MapNote").textContent,/1 recorded pickup point/);assert.equal(f.maps[0].eases.length,0);
});
test("expanded map closes on Escape and restores overflow and focus",t=>{
  const f=fixture(t);f.controller.onTab("home");const button=f.button("home","fullscreen"),frame=f.$("fmHomeMap").parentElement;
  button.fire("click");assert.equal(frame.classList.contains("fm-map-expanded"),true);assert.equal(f.document.body.style.overflow,"hidden");
  assert.equal(button.getAttribute("aria-pressed"),"true");f.document.fire("keydown",{key:"Escape",preventDefault(){}});
  assert.equal(frame.classList.contains("fm-map-expanded"),false);assert.equal(f.document.body.style.overflow,"auto");assert.equal(f.controls[0].focused,true);
});
test("leaving the expanded map view restores page scroll and original accessibility attributes",t=>{
  const f=fixture(t);f.controller.onTab("home");const frame=f.$("fmHomeMap").parentElement;
  frame.setAttribute("role","region");frame.setAttribute("aria-label","Original map area");
  f.button("home","fullscreen").fire("click");assert.equal(frame.getAttribute("role"),"dialog");assert.equal(frame.getAttribute("aria-modal"),"true");
  f.controller.onTab("fares");assert.equal(f.document.body.style.overflow,"auto");assert.equal(frame.classList.contains("fm-map-expanded"),false);
  assert.equal(frame.getAttribute("role"),"region");assert.equal(frame.getAttribute("aria-label"),"Original map area");assert.equal(frame.getAttribute("aria-modal"),null);assert.equal(frame.getAttribute("tabindex"),null);
});
test("expanded map contains keyboard focus in both directions",t=>{
  const f=fixture(t);f.controller.onTab("home");f.button("home","fullscreen").fire("click");
  const first=f.button("home","street"),last=f.button("home","zoom-out");let prevented=0;
  last.focus();f.document.fire("keydown",{key:"Tab",preventDefault(){prevented++;}});assert.equal(f.document.activeElement,first);
  first.focus();f.document.fire("keydown",{key:"Tab",shiftKey:true,preventDefault(){prevented++;}});assert.equal(f.document.activeElement,last);assert.equal(prevented,2);
});
test("destroy retires controls, marker callbacks and late map events",t=>{
  const f=fixture(t);f.controller.setPoints([point()]);f.controller.onTab("home");const map=f.maps[0],pin=f.currentPins()[0];
  f.controller.destroy();pin.config.element.fire("click");f.button("home","locate").fire("click");map.emit("load");
  assert.equal(map.removed,true);assert.equal(f.selected.length,0);assert.equal(f.locating.length,0);
});
