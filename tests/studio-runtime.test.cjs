const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(process.env.SPIRIT_SCRIPT_SOURCE || path.join(__dirname, '..', 'script.js'), 'utf8');

// Run the shipped functions with deterministic DOM/network adapters. No request
// in this suite reaches FormSubmit, analytics, the assistant or a real database.
function declaration(name) {
  const match = new RegExp('\\bconst\\s+' + name + '\\s*=').exec(source);
  assert.ok(match, 'Missing shipped declaration ' + name);
  let depth = 0, quote = '', line = false, block = false;
  for (let i = source.indexOf('=', match.index) + 1; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && next === '/') { block = false; i++; } continue; }
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === '/' && next === '/') { line = true; i++; continue; }
    if (c === '/' && next === '*') { block = true; i++; continue; }
    if ('"\'`'.includes(c)) { quote = c; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ';' && depth === 0) return source.slice(match.index, i + 1);
  }
  throw Error('Incomplete declaration ' + name);
}
function functions(names, context = {}, prefix = '') {
  return vm.runInNewContext(prefix + '\n' + names.map(declaration).join('\n') + '\n;({' + names.join(',') + '});', { setTimeout, clearTimeout, AbortController, ...context });
}
class Element {
  constructor(tag = 'div', className = '') {
    this.tagName = tag.toUpperCase(); this.className = className; this.dataset = {}; this.attributes = {}; this.style = {};
    this.children = []; this.listeners = {}; this.value = ''; this.textContent = ''; this.innerHTML = ''; this.focusCount = 0;
    const classes = new Set(className.split(' ').filter(Boolean));
    this.classList = { contains: x => classes.has(x), add: (...xs) => xs.forEach(x => classes.add(x)), remove: (...xs) => xs.forEach(x => classes.delete(x)), toggle: (x, force) => { const value = force ?? !classes.has(x); value ? classes.add(x) : classes.delete(x); return value; } };
  }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  async dispatch(type, event = {}) { await Promise.all((this.listeners[type] || []).map(listener => listener({ target: this, preventDefault() {}, ...event }))); }
  focus() { this.focusCount++; }
  scrollIntoView() {}
  remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); }
  matches(selector) {
    if (selector === '[required]') return this.required;
    if (selector === 'source[data-src]') return this.tagName === 'SOURCE' && !!this.dataset.src;
    if (selector.startsWith('.')) return this.className.split(' ').includes(selector.slice(1));
    return this.tagName === selector.toUpperCase();
  }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

test('a stalled request is aborted and bounded', async () => {
  let signal;
  const { requestJSON } = functions(['requestJSON'], { fetch: (_url, options) => { signal = options.signal; return new Promise(() => {}); } });
  await assert.rejects(requestJSON('/test', {}, 10), /timed out/);
  assert.equal(signal.aborted, true);
});
test('the timeout also bounds a stalled response body', async () => {
  const { requestJSON } = functions(['requestJSON'], { fetch: async () => ({ ok: true, json: () => new Promise(() => {}) }) });
  await assert.rejects(requestJSON('/test', {}, 10), /timed out/);
});
test('one successful delivery settles without waiting for a stuck second route', async () => {
  const { firstSuccessfulRoute } = functions(['firstSuccessfulRoute']);
  const result = await firstSuccessfulRoute([['stored', Promise.resolve(true)], ['email', new Promise(() => {})]]);
  assert.equal(result.ok, true); assert.equal(result.route, 'stored');
});
test('all failed or rejected delivery routes report failure', async () => {
  const { firstSuccessfulRoute } = functions(['firstSuccessfulRoute']);
  assert.equal((await firstSuccessfulRoute([['stored', Promise.resolve(false)], ['email', Promise.reject(Error('offline'))]])).ok, false);
});

test('conversion tracking removes private text from WhatsApp and email destinations', () => {
  const payloads = [];
  const { trackEvent } = functions(['safeTrackingTarget', 'trackEvent'], { URL, getTrackingContext: () => ({}), sendToCollector: payload => payloads.push(payload) });
  trackEvent('whatsapp_click', 'https://wa.me/27781888220?text=Private%20Customer%20Email');
  trackEvent('email_click', 'mailto:mahloricarlton@gmail.com?subject=Private%20Name&body=Private%20Project');
  assert.equal(payloads[0].target, 'https://wa.me/27781888220');
  assert.equal(payloads[1].target, 'mailto:mahloricarlton@gmail.com');
  assert.doesNotMatch(JSON.stringify(payloads), /Private|body=|text=|subject=/);
});

function wizardFixture({ stored = async () => true, email = async () => ({ ok: true, data: { success: 'true' } }) } = {}) {
  const form = new Element('form', 'project-wizard');
  const steps = [0, 1, 2].map(() => form.appendChild(new Element('div', 'wizard-step')));
  const headings = steps.map(step => step.appendChild(new Element('h2')));
  const dots = [0, 1, 2].map(() => form.appendChild(new Element('button', 'wizard-dot')));
  const next = [0, 1].map(i => steps[i].appendChild(new Element('button', 'wizard-next')));
  const back = [1, 2].map(i => steps[i].appendChild(new Element('button', 'wizard-back')));
  const fields = new Map();
  [['Name', 0, 'input'], ['Email', 0, 'input'], ['Project type', 1, 'select'], ['Project details', 2, 'textarea']].forEach(([name, i, tag]) => {
    const field = steps[i].appendChild(new Element(tag)); field.name = name; field.required = true;
    field.value = name === 'Email' ? 'customer@example.test' : name === 'Project details' ? 'A shop for phones & repairs' : name === 'Project type' ? 'Business website' : 'Test Customer';
    field.checkValidity = () => !!field.value.trim(); field.reportValidity = () => { field.reported = true; return field.checkValidity(); }; fields.set(name, field);
  });
  const button = steps[2].appendChild(new Element('button', 'send-enquiry')); button.innerHTML = 'Send enquiry';
  const success = steps[2].appendChild(new Element('div', 'enquiry-success'));
  const resultCopy = success.appendChild(new Element('div')); const title = resultCopy.appendChild(new Element('b')); resultCopy.appendChild(new Element('p'));
  form.reset = () => { form.resetCount = (form.resetCount || 0) + 1; fields.forEach(field => { field.value = ''; }); };
  const document = { querySelector: selector => selector === '.project-wizard' ? form : null, createElement: tag => new Element(tag) };
  const calls = [], events = [];
  class FormDataAdapter {
    constructor() { this.values = new Map([...fields].map(([name, field]) => [name, field.value])); }
    get(name) { return this.values.get(name); }
    forEach(fn) { this.values.forEach(fn); }
  }
  const { initProjectWizard } = functions(['firstSuccessfulRoute', 'enquiryContactLinks', 'initProjectWizard'], {
    document, window: { matchMedia: () => ({ matches: false }) }, FormData: FormDataAdapter, location: { pathname: '/contact.html', search: '' },
    getTrackingContext: () => ({}), trackEvent: (...args) => events.push(args),
    sendToCollector: payload => { calls.push({ route: 'stored', payload }); return stored(payload); },
    requestJSON: (url, options) => { calls.push({ route: 'email', payload: JSON.parse(options.body) }); return email(url, options); }
  });
  initProjectWizard();
  return { form, steps, dots, next, back, headings, fields, button, success, title, calls, events,
    async lastStep() { await next[0].dispatch('click'); await next[1].dispatch('click'); } };
}

test('Enter and early implicit submit advance steps without sending an enquiry', async () => {
  const f = wizardFixture(); let prevented = false;
  await f.form.dispatch('keydown', { key: 'Enter', target: f.fields.get('Email'), preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(f.dots[1].getAttribute('aria-current'), 'step'); assert.equal(f.headings[1].focusCount, 1);
  await f.form.dispatch('submit');
  assert.equal(f.dots[2].getAttribute('aria-current'), 'step'); assert.equal(f.calls.length, 0);
});
test('final submission rechecks required fields in earlier steps and focuses the invalid field', async () => {
  const f = wizardFixture(); await f.lastStep(); f.fields.get('Email').value = '';
  await f.form.dispatch('submit');
  assert.equal(f.calls.length, 0); assert.equal(f.dots[0].getAttribute('aria-current'), 'step');
  assert.equal(f.fields.get('Email').reported, true); assert.ok(f.fields.get('Email').focusCount);
});
test('delivery is not duplicated while pending and one working route releases the form', async () => {
  let resolveStored;
  const f = wizardFixture({ stored: () => new Promise(resolve => { resolveStored = resolve; }), email: () => new Promise(() => {}) });
  await f.lastStep(); const pending = f.form.dispatch('submit'); await f.form.dispatch('submit');
  assert.equal(f.calls.length, 2); assert.equal(f.button.disabled, true); resolveStored(true); await pending;
  assert.equal(f.button.disabled, false); assert.equal(f.form.getAttribute('aria-busy'), 'false'); assert.equal(f.form.resetCount, 1);
  assert.equal(f.title.textContent, 'Enquiry received'); assert.ok(f.events.some(([name]) => name === 'enquiry_success'));
  const links = f.success.querySelector('.enquiry-fallback').children;
  assert.match(decodeURIComponent(links[0].href), /Test Customer/); assert.match(decodeURIComponent(links[0].href), /A shop for phones & repairs/);
});
test('both delivery failures keep details and expose actionable WhatsApp and email links', async () => {
  const f = wizardFixture({ stored: async () => false, email: async () => ({ ok: true, data: { success: 'false' } }) });
  await f.lastStep(); await f.form.dispatch('submit');
  assert.equal(f.form.resetCount, undefined); assert.equal(f.fields.get('Name').value, 'Test Customer'); assert.equal(f.button.disabled, false);
  const links = f.success.querySelector('.enquiry-fallback').children;
  assert.match(links[0].href, /^https:\/\/wa\.me\//); assert.match(links[1].href, /^mailto:/);
  assert.match(decodeURIComponent(links[1].href), /A shop for phones & repairs/); assert.equal(f.title.textContent, 'Send your enquiry directly');
});

test('closed assistant is hidden and inert and returns focus to its launcher', () => {
  const timers = new Map(); let timer = 0;
  const { setAssistantOpen } = functions(['setAssistantOpen'], { setTimeout: fn => { timers.set(++timer, fn); return timer; }, clearTimeout: id => timers.delete(id) });
  const panel = new Element('section'), launcher = new Element('button'), input = new Element('textarea');
  setAssistantOpen(panel, launcher, input, true); assert.equal(panel.hidden, false); assert.equal(panel.inert, false);
  setAssistantOpen(panel, launcher, input, false); [...timers.values()].forEach(fn => fn());
  assert.equal(panel.hidden, true); assert.equal(panel.inert, true); assert.equal(panel.style.display, 'none');
  assert.equal(panel.getAttribute('aria-hidden'), 'true'); assert.equal(launcher.getAttribute('aria-expanded'), 'false');
  assert.equal(launcher.focusCount, 1); assert.equal(input.focusCount, 0);
});

test('assistant request timeout aborts a stalled response body', async () => {
  let signal;
  const { requestAssistant } = functions(['requestAssistant'], { ENDPOINT: '/assistant-test', fetch: async (_url, options) => {
    signal = options.signal; assert.equal(JSON.parse(options.body).question, 'Test question');
    return { ok: true, json: () => new Promise(() => {}) };
  } });
  await assert.rejects(requestAssistant('Test question', 'local-test-session', 10), /assistant_timeout/);
  assert.equal(signal.aborted, true);
});
test('failed assistant requests release controls and keep the question for an explicit retry', async () => {
  const input = new Element('textarea'), panel = new Element('section'), messages = []; panel.hidden = false;
  const { ask } = functions(['ask'], {
    busy: false, input, panel, openPanel() {}, track() {}, getSession: () => 'local-test', WHATSAPP: 'https://wa.me/test',
    addMessage: text => messages.push(text), setBusy: state => { input.disabled = state; },
    requestAssistant: async () => { throw Error('assistant_timeout'); }
  });
  await ask('Keep my question'); assert.equal(input.disabled, false); assert.equal(input.value, 'Keep my question');
  assert.ok(messages.some(text => text.includes('try again')));
});
test('FareMap navigation is not marked active on the marketing homepage', () => {
  const home = new Element('a'), faremap = new Element('a'); home.setAttribute('href', 'index.html'); faremap.setAttribute('href', '/faremap/');
  const { updateActiveNav } = functions(['currentPageName', 'updateActiveNav'], { ROOT_PAGE: 'index.html', URL,
    location: { href: 'https://spirit2k5.co.za/' }, document: { querySelectorAll: () => [home, faremap] } });
  updateActiveNav(); assert.equal(home.classList.contains('active'), true); assert.equal(faremap.classList.contains('active'), false);
});

function videoFixture({ reduced = false, observerAvailable = true, observerThrows = false } = {}) {
  const video = new Element('video'); video.dataset.autoplay = 'true'; video.paused = true; video.loadCount = 0; video.playCount = 0; video.pauseCount = 0;
  video.load = () => video.loadCount++;
  video.play = () => { video.paused = false; video.playCount++; void video.dispatch('play'); return Promise.resolve(); };
  video.pause = () => { video.pauseCount++; const wasPlaying = !video.paused; video.paused = true; if (wasPlaying) void video.dispatch('pause'); };
  const mediaSource = video.appendChild(new Element('source')); mediaSource.dataset.src = 'assets/test.mp4';
  const listeners = {}, motion = { matches: reduced, addEventListener: (name, fn) => { listeners[name] = fn; }, removeEventListener() {} };
  const observers = [];
  class Observer { constructor(callback) { if (observerThrows) throw Error('Observer unavailable'); this.callback = callback; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } }
  const document = { hidden: false, documentElement: { dataset: {} }, querySelectorAll: () => [video], addEventListener: (name, fn) => { listeners[name] = fn; } };
  const { initVideos } = functions(['initVideos'], { document, window: { matchMedia: () => motion, IntersectionObserver: observerAvailable ? Observer : undefined } }, 'let videoObserver = null, activeVideos = [], videoMotion = null, videoMotionChange = null;');
  initVideos();
  return { video, mediaSource, motion, document, listeners, observers, initVideos, intersect(visible) { observers.at(-1).callback([{ target: video, isIntersecting: visible }]); } };
}
test('video sources defer until visible, play silently, and pause offscreen', () => {
  const f = videoFixture(); assert.equal(f.mediaSource.getAttribute('src'), null); assert.equal(f.video.playCount, 0);
  f.intersect(true); assert.equal(f.mediaSource.getAttribute('src'), 'assets/test.mp4'); assert.equal(f.video.loadCount, 1); assert.equal(f.video.playCount, 1);
  assert.equal(f.video.muted, true); assert.equal(f.video.controls, true); f.intersect(false); assert.equal(f.video.paused, true);
});
test('reduced motion keeps poster idle while direct interaction can load the video', async () => {
  const f = videoFixture({ reduced: true }); f.intersect(true);
  assert.equal(f.video.playCount, 0); assert.equal(f.mediaSource.getAttribute('src'), null);
  await f.video.dispatch('pointerdown'); assert.equal(f.mediaSource.getAttribute('src'), 'assets/test.mp4');
});
test('manual pause is respected on viewport reentry and hidden documents pause playback', () => {
  const f = videoFixture(); f.intersect(true); f.video.pause(); f.intersect(false); f.intersect(true); assert.equal(f.video.playCount, 1);
  delete f.video.dataset.userPaused; f.intersect(true); f.document.hidden = true; f.listeners.visibilitychange(); assert.equal(f.video.paused, true);
});
test('missing observer leaves native playback available without eager loading', async () => {
  const f = videoFixture({ observerAvailable: false }); assert.equal(f.video.playCount, 0); assert.equal(f.mediaSource.getAttribute('src'), null);
  await f.video.dispatch('keydown', { key: ' ' }); assert.equal(f.mediaSource.getAttribute('src'), 'assets/test.mp4');
});
test('retired video observers cannot resume old playback after navigation', () => {
  const f = videoFixture(), old = f.observers[0]; f.initVideos(); old.callback([{ target: f.video, isIntersecting: true }]);
  assert.equal(old.disconnected, true); assert.equal(f.video.playCount, 0); assert.equal(f.mediaSource.getAttribute('src'), null);
});
test('a broken observer cannot prevent native media or the rest of page initialization', async () => {
  const f = videoFixture({ observerThrows: true }); assert.equal(f.video.playCount, 0);
  await f.video.dispatch('pointerdown'); assert.equal(f.mediaSource.getAttribute('src'), 'assets/test.mp4');
});

test('decorative keyboard handlers leave native video controls alone', () => {
  const code = declaration('initInteractiveMotion');
  assert.doesNotMatch(code.match(/main\.querySelectorAll\(([^\n]+)/)?.[1] || '', /> video/);
  assert.match(code, /if \(e\.target !== el\) return/);
});
