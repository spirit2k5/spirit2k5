/* Spirit2k5's illustrated story. Native scrolling drives a small, event-based timeline. */
(() => {
  'use strict';

  const film = document.querySelector('[data-film]');
  const stage = document.querySelector('[data-stage]');
  const scenes = Array.from(document.querySelectorAll('[data-scene]'));
  if (!film || !stage || scenes.length < 2) return;

  const chapterLinks = Array.from(document.querySelectorAll('a[data-chapter]'));
  // Scene CTAs can jump chapters too, but only the persistent navigation owns
  // aria-current and receives focus when an outgoing scene becomes inert.
  const chapters = Array.from(document.querySelectorAll('.chapter-nav a[data-chapter]'));
  const chapterNav = document.querySelector('.chapter-nav');
  const motionToggle = document.querySelector('[data-motion-toggle]');
  const motionLabel = document.querySelector('[data-motion-label]');
  const progressBar = document.querySelector('[data-progress]');
  const counter = document.querySelector('[data-counter]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const shortViewport = window.matchMedia('(max-height: 419px)');
  const cleanups = [];
  const decodedImages = new WeakSet();
  const count = scenes.length;
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const ease = value => value * value * (3 - 2 * value);
  let enabled = false;
  let userMotion = null;
  let active = -1;
  let frame = 0;
  let filmTop = 0;
  let distance = 1;
  let disposed = false;
  let measureNeeded = true;
  let geometryReady = false;
  let decodeQueue = [];
  let decodingCount = 0;

  function listen(target, name, callback, options) {
    target.addEventListener(name, callback, options);
    cleanups.push(() => target.removeEventListener(name, callback, options));
  }

  function decodeUpcomingImages() {
    if (disposed) return;
    while (decodingCount < 2 && decodeQueue.length) {
      const image = decodeQueue.shift();
      if (decodedImages.has(image)) continue;
      decodedImages.add(image);
      decodingCount += 1;
      // Decoding never gates text, scrolling, or scene changes. A failed image
      // retains the browser's normal loading behaviour and cannot stop the queue.
      Promise.resolve().then(() => image.decode()).catch(() => {}).finally(() => {
        decodingCount -= 1;
        decodeUpcomingImages();
      });
    }
  }

  function warmChapterImages(index) {
    // Prioritise the current destination and its next chapter rather than decode
    // every hidden illustration at once. Replace stale queued work on fast jumps.
    decodeQueue = [scenes[index], scenes[index + 1]]
      .filter(Boolean)
      .flatMap(scene => Array.from(scene.querySelectorAll('img')))
      .filter(image => typeof image.decode === 'function' && !decodedImages.has(image))
      .slice(0, 4);
    decodeUpcomingImages();
  }

  function keepCurrentChapterVisible() {
    if (!chapterNav || chapterNav.scrollWidth <= chapterNav.clientWidth + 1) return;
    const currentLink = chapters.find(link => Number(link.dataset.chapter) === active);
    if (!currentLink) return;
    const navBounds = chapterNav.getBoundingClientRect();
    const linkBounds = currentLink.getBoundingClientRect();
    const inset = 8;
    // Move only an overflowing chapter strip, never the document or story stage.
    if (linkBounds.left < navBounds.left + inset) {
      chapterNav.scrollLeft += linkBounds.left - navBounds.left - inset;
    } else if (linkBounds.right > navBounds.right - inset) {
      chapterNav.scrollLeft += linkBounds.right - navBounds.right + inset;
    }
  }

  function updateChapter(index) {
    index = clamp(index, 0, count - 1);
    if (index === active) return;

    // A keyboard user must never remain focused inside a scene that becomes inert.
    const previous = scenes[active];
    if (enabled && previous?.contains(document.activeElement)) {
      const nextChapter = chapters.find(link => Number(link.dataset.chapter) === index);
      nextChapter?.focus({ preventScroll: true });
    }
    active = index;
    chapters.forEach(link => {
      if (Number(link.dataset.chapter) === active) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    });
    scenes.forEach((scene, sceneIndex) => {
      const current = sceneIndex === active;
      scene.classList.toggle('is-active', current);
      if (enabled) {
        scene.inert = !current;
        scene.setAttribute('aria-hidden', String(!current));
      }
    });
    if (counter) counter.textContent = `${String(active + 1).padStart(2, '0')} / ${String(count).padStart(2, '0')}`;
    keepCurrentChapterVisible();
    warmChapterImages(active);
  }

  function measure() {
    filmTop = film.getBoundingClientRect().top + window.scrollY;
    distance = Math.max(1, film.offsetHeight - stage.clientHeight);
    measureNeeded = false;
    geometryReady = true;
    keepCurrentChapterVisible();
  }

  function resizeGeometry() {
    if (disposed) return;
    // Read the logical position against the OLD distance before layout is measured
    // again. Mobile viewport settling must not move a complete chapter into a wipe.
    const savedProgress = enabled && geometryReady ? clamp((window.scrollY - filmTop) / distance) : null;
    const previousTop = filmTop;
    const previousDistance = distance;
    measure();
    const changed = Math.abs(filmTop - previousTop) > 0.5 || Math.abs(distance - previousDistance) > 0.5;
    if (savedProgress !== null && changed) {
      const top = filmTop + savedProgress * distance;
      if (Math.abs(top - window.scrollY) > 0.5) window.scrollTo({ top, behavior: 'auto' });
    }
    // Window and visualViewport can emit the same resize; unchanged geometry does
    // not scroll again. Ordinary wheel/touch scrolling only schedules rendering.
    schedule();
  }

  function render() {
    frame = 0;
    if (disposed) return;
    if (measureNeeded) measure();

    if (!enabled) {
      // The reading layout keeps every chapter available to keyboards and assistive tools.
      const viewportMarker = Math.max(0, window.innerHeight * 0.36);
      const positions = scenes.map(scene => scene.getBoundingClientRect().top);
      let index = 0;
      positions.forEach((top, sceneIndex) => {
        if (top <= viewportMarker) index = sceneIndex;
      });
      updateChapter(index);
      if (progressBar) progressBar.style.transform = `scaleX(${(index + 1) / count})`;
      return;
    }

    const progress = clamp((window.scrollY - filmTop) / distance);
    const phase = progress * count;
    const reveals = scenes.map((_, index) => index === 0 ? 1 : ease(clamp((phase - index + 0.22) / 0.44)));
    updateChapter(Math.min(count - 1, Math.floor(phase)));

    scenes.forEach((scene, index) => {
      const reveal = reveals[index];
      const nextReveal = reveals[index + 1] || 0;
      const visible = reveal > 0 && (index === count - 1 || nextReveal < 1);
      const localProgress = clamp((phase - index + 0.25) / 1.25);
      const incomingCopy = index === 0 ? 1 : ease(clamp((reveal - 0.7) / 0.3));
      const outgoingCopy = 1 - ease(clamp(nextReveal / 0.35));
      scene.style.setProperty('--scene-progress', localProgress.toFixed(4));
      scene.style.setProperty('--scene-pan', (localProgress * 2 - 1).toFixed(4));
      scene.style.setProperty('--copy-opacity', (incomingCopy * outgoingCopy).toFixed(4));
      scene.style.opacity = visible ? '1' : '0';
      scene.style.visibility = visible ? 'visible' : 'hidden';
      scene.style.zIndex = String(index + 1);
      // Outgoing artwork stays beneath the incoming circle until it covers the frame.
      // No blank frame, scroll interception, animation library, or perpetual render loop.
      scene.style.clipPath = reveal >= 1 ? 'none' : `circle(${(reveal * 145).toFixed(2)}% at ${index % 2 ? '74%' : '28%'} 50%)`;
      scene.style.pointerEvents = index === active ? 'auto' : 'none';
    });
    if (progressBar) progressBar.style.transform = `scaleX(${progress})`;
  }

  function schedule() {
    if (!disposed && !frame) frame = window.requestAnimationFrame(render);
  }

  function jump(index, { behavior = 'auto', history = false, focus = false } = {}) {
    if (disposed || index < 0 || index >= count) return;
    warmChapterImages(index);
    if (measureNeeded) measure();
    if (history && window.location.hash !== `#${scenes[index].id}`) {
      window.history.pushState(null, '', `#${scenes[index].id}`);
    }
    let top;
    if (enabled) {
      // Land after the circular reveal so each chapter control presents a complete scene.
      const phase = index === 0 ? 0 : index + 0.25;
      top = filmTop + distance * (phase / count);
    } else {
      top = scenes[index].getBoundingClientRect().top + window.scrollY;
    }
    window.scrollTo({ top, behavior: enabled ? behavior : 'auto' });
    if (focus) chapters.find(link => Number(link.dataset.chapter) === index)?.focus({ preventScroll: true });
    schedule();
  }

  function clearSceneStyles() {
    scenes.forEach(scene => {
      ['opacity', 'visibility', 'z-index', 'clip-path', 'pointer-events', '--scene-progress', '--scene-pan', '--copy-opacity'].forEach(property => scene.style.removeProperty(property));
      scene.inert = false;
      scene.removeAttribute('aria-hidden');
    });
  }

  function setMode({ preserveChapter = true } = {}) {
    const nextEnabled = (userMotion ?? !reducedMotion.matches) && !shortViewport.matches;
    const previousChapter = Math.max(0, active);
    const changed = nextEnabled !== enabled;
    enabled = nextEnabled;
    if ('scrollRestoration' in window.history) {
      try {
        // The story owns its enhanced chapter position; prevent a late browser
        // history restore from replacing an explicit chapter jump after reload.
        window.history.scrollRestoration = enabled ? 'manual' : 'auto';
      } catch { /* Older browsers may expose a read-only restoration property. */ }
    }
    document.body.classList.toggle('is-enhanced', enabled);
    document.body.classList.toggle('is-static', !enabled);
    clearSceneStyles();
    // Force an accessibility refresh even when the chapter number did not change.
    active = -1;
    updateChapter(previousChapter);
    if (motionToggle) {
      motionToggle.setAttribute('aria-pressed', String(enabled));
      motionToggle.setAttribute('aria-label', enabled ? 'Turn story motion off' : 'Turn story motion on');
      motionToggle.disabled = shortViewport.matches;
      motionToggle.title = shortViewport.matches ? 'The story uses a reading layout in short windows.' : '';
    }
    if (motionLabel) motionLabel.textContent = enabled ? 'Motion on' : 'Motion off';
    measureNeeded = true;
    if (changed && preserveChapter) jump(previousChapter);
    schedule();
  }

  chapterLinks.forEach(link => listen(link, 'click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const index = Number(link.dataset.chapter);
    if (!Number.isInteger(index) || !scenes[index]) return;
    event.preventDefault();
    jump(index, { behavior: enabled ? 'smooth' : 'auto', history: true });
  }));

  if (motionToggle) listen(motionToggle, 'click', () => {
    userMotion = !enabled;
    setMode();
  });

  document.querySelectorAll('[data-replay]').forEach(button => listen(button, 'click', () => {
    jump(0, { behavior: enabled ? 'smooth' : 'auto', history: true, focus: true });
  }));

  function followHash() {
    let id;
    try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { return; }
    const index = scenes.findIndex(scene => scene.id === id);
    if (index !== -1) jump(index);
  }

  listen(window, 'scroll', schedule, { passive: true });
  listen(window, 'resize', resizeGeometry, { passive: true });
  listen(window, 'hashchange', followHash);
  listen(window, 'popstate', followHash);
  listen(reducedMotion, 'change', () => { if (userMotion === null) setMode(); });
  listen(shortViewport, 'change', () => setMode());
  if (window.visualViewport) listen(window.visualViewport, 'resize', resizeGeometry, { passive: true });
  if (document.fonts?.ready) document.fonts.ready.then(resizeGeometry);

  // BFCache pages are resumed intact. Only dispose listeners on a permanent departure.
  listen(window, 'pagehide', event => {
    if (event.persisted) return;
    disposed = true;
    decodeQueue = [];
    if (frame) window.cancelAnimationFrame(frame);
    cleanups.forEach(cleanup => cleanup());
  });
  listen(window, 'pageshow', event => {
    if (event.persisted) resizeGeometry();
  });

  setMode({ preserveChapter: false });
  measure();
  followHash();
})();
