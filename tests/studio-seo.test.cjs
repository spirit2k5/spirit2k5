const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(process.env.SPIRIT_SCRIPT_SOURCE || path.join(ROOT, 'script.js'), 'utf8');

// Exercise the shipped declarations without loading analytics, forms or real network.
function declaration(name) {
  const match = new RegExp('\\bconst\\s+' + name + '\\s*=').exec(source);
  assert.ok(match, 'Missing actual declaration ' + name);
  let depth = 0, quote = '', line = false, block = false;
  for (let i = source.indexOf('=', match.index) + 1; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && next === '/') { block = false; i++; } continue; }
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === '/' && next === '/') { line = true; i++; continue; }
    if (c === '/' && next === '*') { block = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ';' && depth === 0) return source.slice(match.index, i + 1);
  }
  throw Error('Incomplete actual declaration ' + name);
}
function decode(value) {
  return value.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
class Element {
  constructor(tag, attributes = {}, text = '') { this.tagName = tag.toLowerCase(); this.values = {...attributes}; this.textContent = text; this.parentNode = null; }
  get attributes() { return Object.entries(this.values).map(([name,value]) => ({name,value})); }
  getAttribute(name) { return this.values[name] ?? null; }
  setAttribute(name, value) { this.values[name] = String(value); }
  cloneNode() { return new Element(this.tagName, this.values, this.textContent); }
  remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
}
function matches(node, selectors) {
  return selectors.split(',').some(raw => {
    const selector = raw.trim(), tag = selector.match(/^[\w-]+/)?.[0];
    if (tag && tag !== node.tagName) return false;
    return [...selector.matchAll(/\[([\w:-]+)(?:(\^?=)"([^"]*)")?\]/g)].every(([,name,op,value]) => {
      const actual = node.getAttribute(name);
      return op === '^=' ? actual?.startsWith(value) : op === '=' ? actual === value : actual !== null;
    });
  });
}
class Head {
  constructor(nodes = []) { this.children = []; this.append(...nodes); }
  append(...nodes) { for (const node of nodes) { node.remove(); this.children.push(node); node.parentNode = this; } }
  appendChild(node) { this.append(node); return node; }
  querySelectorAll(selector) { return this.children.filter(node => matches(node, selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
function documentFromHTML(html) {
  const headHTML = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || '';
  const nodes = [...headHTML.matchAll(/<(meta|link)\b[^>]*>|<script\b[^>]*>[\s\S]*?<\/script>/gi)].map(match => {
    const opening = match[0].match(/^<(\w+)\b([^>]*)>/), attrs = {};
    for (const [,name,dq,sq,bare] of opening[2].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[name.toLowerCase()] = decode(dq ?? sq ?? bare ?? '');
    const text = opening[1].toLowerCase() === 'script' ? match[0].slice(opening[0].length).replace(/<\/script>$/i, '') : '';
    return new Element(opening[1], attrs, text);
  });
  return {title: decode(headHTML.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ''), head: new Head(nodes), importNode: node => node.cloneNode(true)};
}
const page = name => documentFromHTML(fs.readFileSync(path.join(ROOT, name), 'utf8'));
const managed = 'meta[name="description"],meta[name="keywords"],meta[name="robots"],meta[name="googlebot"],meta[name="bingbot"],link[rel="canonical"],link[rel="alternate"][hreflang],meta[property^="og:"],meta[name^="twitter:"],script[type="application/ld+json"]';
const signature = node => node.tagName + JSON.stringify(Object.entries(node.values).sort()) + node.textContent;
const metadata = doc => Array.from(doc.head.querySelectorAll(managed), signature).sort();
function headFixture(document = page('index.html')) {
  const context = {document, Set};
  const code = ['headSelectors','captureHead','restoreHead','copyHeadMetadata'].map(declaration).join('\n');
  return {...vm.runInNewContext(code + '\n;({captureHead,restoreHead,copyHeadMetadata});', context), document};
}

test('home to About navigation replaces page-specific schema and social image metadata', () => {
  const f = headFixture(), next = page('about.html');
  f.copyHeadMetadata(next);
  assert.equal(f.document.title, next.title);
  assert.deepEqual(metadata(f.document), metadata(next));
});
test('a service to plain page navigation removes absent Service FAQ and breadcrumb entities', () => {
  const f = headFixture(page('web-design-soweto.html')), next = page('privacy.html');
  f.copyHeadMetadata(next);
  assert.deepEqual(metadata(f.document), metadata(next));
});
test('destination metadata is created when the initial document does not contain it', () => {
  const f = headFixture(documentFromHTML('<head><title>Empty</title></head>')), next = page('web-design-soweto.html');
  f.copyHeadMetadata(next);
  assert.deepEqual(metadata(f.document), metadata(next));
});
test('missing optional social, alternate and structured fields clear prior page state', () => {
  const f = headFixture(), next = documentFromHTML('<head><title>Simple</title><meta name="robots" content="index, follow"><link rel="canonical" href="https://spirit2k5.co.za/simple.html"></head>');
  f.copyHeadMetadata(next);
  assert.deepEqual(metadata(f.document), metadata(next));
});
test('robots directives follow the destination in both directions', () => {
  const f = headFixture(), blocked = page('404.html'), home = page('index.html');
  f.copyHeadMetadata(blocked);
  assert.equal(f.document.head.querySelector('meta[name="robots"]').getAttribute('content'), 'noindex, follow');
  f.copyHeadMetadata(home);
  assert.equal(f.document.head.querySelector('meta[name="robots"]').getAttribute('content'), 'index, follow');
});
test('cached Back and Forward snapshots restore the complete managed head without aliasing', () => {
  const f = headFixture(), initial = metadata(f.document), first = f.captureHead();
  const next = page('web-design-soweto.html'); f.copyHeadMetadata(next); const second = f.captureHead();
  f.restoreHead(first); assert.deepEqual(metadata(f.document), initial);
  f.document.head.querySelector('meta[name="description"]').setAttribute('content', 'changed after restore');
  f.restoreHead(second); assert.deepEqual(metadata(f.document), metadata(next));
  f.restoreHead(first); assert.deepEqual(metadata(f.document), initial);
});
test('repeated soft navigations do not accumulate JSON-LD or duplicate SEO nodes', () => {
  const f = headFixture(), next = page('about.html');
  for (let i = 0; i < 4; i++) f.copyHeadMetadata(next);
  assert.deepEqual(metadata(f.document), metadata(next));
});
test('identical incoming JSON-LD duplicates are retained once while distinct entities survive', () => {
  const f = headFixture(), next = page('web-design-soweto.html');
  const scripts = next.head.querySelectorAll('script[type="application/ld+json"]');
  assert.ok(scripts.length);
  const expected = metadata(next); next.head.append(scripts[0].cloneNode(true));
  f.copyHeadMetadata(next);
  assert.deepEqual(metadata(f.document), expected);
});
test('global verification, styles, icons and runtime scripts remain the original nodes', () => {
  const f = headFixture();
  const global = f.document.head.children.filter(node => !matches(node, managed));
  f.copyHeadMetadata(page('about.html'));
  for (const node of global) assert.ok(f.document.head.children.includes(node));
});
test('copying metadata leaves the parsed source document intact', () => {
  const f = headFixture(), next = page('about.html'), original = metadata(next);
  f.copyHeadMetadata(next);
  assert.deepEqual(metadata(next), original);
  assert.ok(next.head.children.every(node => node.parentNode === next.head));
});

function revealNode(classes = [], top = 1200, bottom = 1400) {
  const values = new Set(['reveal', ...classes]);
  return {classList:{add:(...v)=>v.forEach(x=>values.add(x)),remove:(...v)=>v.forEach(x=>values.delete(x)),contains:x=>values.has(x)},
    matches: selector => selector.split(',').some(s => values.has(s.trim().replace(/^\./,''))),
    getBoundingClientRect:()=>({top,bottom}), has: name => values.has(name)};
}
function revealFixture(options = {}) {
  const nodes = options.nodes || [revealNode()], observers = [];
  class Observer {
    constructor(callback) { if (options.constructorError) throw Error('IO unavailable'); this.callback=callback; this.observed=[];this.unobserved=[];observers.push(this); }
    observe(node) {this.observed.push(node);if(options.observeError)throw Error('Observe failed');}
    unobserve(node) {this.unobserved.push(node);}
    disconnect() {this.disconnected=true;}
  }
  const document = {querySelectorAll:()=>nodes,documentElement:{clientHeight:800}};
  const window = {innerHeight:800,matchMedia:()=>({matches:options.reduced===true})};
  if (!options.missing) window.IntersectionObserver = Observer;
  const context = {document,window,IntersectionObserver:Observer};
  const api = vm.runInNewContext('let revealObserver=null;\n'+declaration('initReveal')+'\n;({initReveal});',context);
  return {...api,nodes,observers};
}
test('missing IntersectionObserver fails open and clears retained pending states', () => {
  const node=revealNode(['reveal-pending']),f=revealFixture({missing:true,nodes:[node]});f.initReveal();
  assert.ok(node.has('visible'));assert.equal(node.has('reveal-pending'),false);
});
test('a broken observer constructor cannot leave business content hidden', () => {
  const f=revealFixture({constructorError:true});assert.doesNotThrow(()=>f.initReveal());
  assert.ok(f.nodes.every(n=>n.has('visible')&&!n.has('reveal-pending')));
});
test('an observation error restores every partially initialized reveal section', () => {
  const f=revealFixture({observeError:true,nodes:[revealNode(),revealNode()]});assert.doesNotThrow(()=>f.initReveal());
  assert.ok(f.nodes.every(n=>n.has('visible')&&!n.has('reveal-pending')));
  assert.ok(f.observers[0].disconnected);
});
test('reduced motion skips hidden pending states and animation observers', () => {
  const f=revealFixture({reduced:true});f.initReveal();
  assert.ok(f.nodes.every(n=>n.has('visible')&&!n.has('reveal-pending')));assert.equal(f.observers.length,0);
});
test('hero sections and initially visible content are displayed immediately', () => {
  const heroes=['hero','page-hero','about-hero','contact-hero'].map(name=>revealNode([name]));
  const inView=revealNode([],100,400),f=revealFixture({nodes:[...heroes,inView]});f.initReveal();
  assert.ok(f.nodes.every(n=>n.has('visible')&&!n.has('reveal-pending')));
  assert.equal(f.observers.flatMap(o=>o.observed).length,0);
});
test('working below-fold reveal uses pending only until intersection', () => {
  const f=revealFixture();f.initReveal();const node=f.nodes[0],observer=f.observers[0];
  assert.ok(node.has('reveal-pending'));assert.equal(node.has('visible'),false);
  observer.callback([{target:node,isIntersecting:false}]);assert.ok(node.has('reveal-pending'));
  observer.callback([{target:node,isIntersecting:true}]);
  assert.ok(node.has('visible'));assert.equal(node.has('reveal-pending'),false);assert.ok(observer.unobserved.includes(node));
});
test('cached visible sections remain visible when initialized again', () => {
  const node=revealNode(['visible']),f=revealFixture({nodes:[node]});f.initReveal();
  assert.ok(node.has('visible'));assert.equal(node.has('reveal-pending'),false);assert.equal(f.observers.flatMap(o=>o.observed).length,0);
});
test('retired observer callbacks cannot operate on a replacement reveal observer', () => {
  const f=revealFixture();f.initReveal();const old=f.observers[0];f.initReveal();const current=f.observers[1];
  old.callback([{target:f.nodes[0],isIntersecting:true}]);
  assert.ok(old.disconnected);assert.equal(current.unobserved.length,0);assert.ok(f.nodes[0].has('reveal-pending'));
});
test('CSS keeps non-enhanced and reduced-motion content visible', () => {
  const css=fs.readFileSync(path.join(ROOT,'style.css'),'utf8');
  assert.match(css,/\.reveal\{[^}]*opacity:1[^}]*transform:none/);
  assert.match(css,/\.reveal\.reveal-pending:not\(\.visible\)\{[^}]*opacity:0/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)[\s\S]*?\.reveal[^}]*\.reveal\.reveal-pending:not\(\.visible\)[^}]*opacity:1/);
});
