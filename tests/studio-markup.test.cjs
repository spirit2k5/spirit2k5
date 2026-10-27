const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const html = name => fs.readFileSync(path.join(ROOT, name), 'utf8');

test('every customer enquiry field has a persistent associated label', () => {
  const contact = html('contact.html');
  const controls = [...contact.matchAll(/<(input|select|textarea)\b([^>]+)>/g)]
    .filter(([, , attrs]) => !/type="hidden"|name="_honey"/.test(attrs));
  assert.equal(controls.length, 9);
  for (const [, , attrs] of controls) {
    const id = attrs.match(/\bid="([^"]+)"/)?.[1];
    assert.ok(id, `Missing field id: ${attrs}`);
    assert.ok(contact.includes(`for="${id}"`), `Missing label for ${id}`);
  }
  assert.match(contact, /type="tel" autocomplete="tel"/);
});

test('marketing videos expose controls and defer source URLs with valid posters', () => {
  let count = 0;
  for (const name of fs.readdirSync(ROOT).filter(name => name.endsWith('.html'))) {
    for (const [video] of html(name).matchAll(/<video\b[^>]*>[\s\S]*?<\/video>/g)) {
      count++;
      const open = video.match(/^<video\b([^>]*)>/)[1];
      assert.match(open, /\bcontrols\b/, `${name}: native controls missing`);
      assert.doesNotMatch(open, /\sautoplay(?:\s|>|=)/, `${name}: eager autoplay`);
      assert.match(open, /preload="none"/, `${name}: preload must stay deferred`);
      const poster = open.match(/\bposter="([^"]+)"/)?.[1];
      assert.ok(poster && fs.existsSync(path.join(ROOT, poster)), `${name}: missing poster ${poster}`);
      const source = video.match(/\bdata-src="([^"]+)"/)?.[1];
      assert.ok(source && fs.existsSync(path.join(ROOT, source)), `${name}: missing deferred source ${source}`);
      assert.doesNotMatch(video, /(?:<video\b|<source\b)[^>]*\ssrc="/, `${name}: eager video URL`);
    }
  }
  assert.ok(count >= 10, 'Expected existing project videos to be preserved');
});

test('portfolio uses public FareMap artwork without the internal dashboard screenshot', () => {
  const portfolio = html('portfolio.html');
  assert.match(portfolio, /faremap\/assets\/faremap_map_dark\.png/);
  assert.doesNotMatch(portfolio, /faremap-backend-development/);
  assert.equal(fs.existsSync(path.join(ROOT, 'assets/faremap-backend-development.png')), false);
});
