/* Spirit2k5 cinematic scene controller — zero dependencies, one active listener set. */
(() => {
  'use strict';
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  let cleanActive = null;

  window.spiritInitCinema = () => {
    const root = document.querySelector('.spirit-cinema');
    if (!root || root.dataset.cinemaReady === '1') return;
    if (cleanActive) { cleanActive(); cleanActive = null; }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const track = root.querySelector('.cinema-track');
    const pin = root.querySelector('.cinema-pin');
    const art = root.querySelector('.cinema-art');
    const scenes = [...root.querySelectorAll('.cinema-scene')];
    const chapters = [...root.querySelectorAll('.cinema-chapter')];
    const steps = [...root.querySelectorAll('[data-cinema-step]')];
    const counter = root.querySelector('.cinema-count');
    if (!track || !pin || !art || scenes.length !== 3 || chapters.length !== 3) return;

    root.dataset.cinemaReady = '1';
    root.classList.add('is-enhanced');
    let previous = -1, scheduled = false;
    const selectScene = index => {
      if (index === previous) return;
      previous = index;
      art.dataset.scene = String(index);
      counter.textContent = '0' + (index + 1) + ' / 03';
      scenes.forEach((scene, i) => scene.classList.toggle('is-active', index === i));
      chapters.forEach((chapter, i) => {
        chapter.classList.toggle('is-active', index === i);
        chapter.setAttribute('aria-hidden', index === i ? 'false' : 'true');
      });
      steps.forEach((step, i) => {
        if (i === index) step.setAttribute('aria-current', 'step');
        else step.removeAttribute('aria-current');
      });
    };
    const draw = () => {
      scheduled = false;
      if (!root.isConnected) { teardown(); return; }
      const top = parseFloat(getComputedStyle(pin).top) || 0;
      const distance = Math.max(1, track.offsetHeight - pin.offsetHeight);
      const y = track.getBoundingClientRect().top;
      const progress = clamp((top - y) / distance, 0, 1);
      selectScene(clamp(Math.floor(progress * 3), 0, 2));
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(draw);
    };
    const click = event => {
      const button = event.target.closest('[data-cinema-step]');
      if (!button || !root.contains(button)) return;
      const index = Number(button.dataset.cinemaStep);
      if (!Number.isInteger(index) || index < 0 || index > 2) return;
      const distance = Math.max(1, track.offsetHeight - pin.offsetHeight);
      const top = parseFloat(getComputedStyle(pin).top) || 0;
      const target = window.scrollY + track.getBoundingClientRect().top - top + ((index + .17) / 3) * distance;
      window.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
      selectScene(index);
    };
    const teardown = () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      root.removeEventListener('click', click);
      resizeObserver?.disconnect();
      root.classList.remove('is-enhanced');
      delete root.dataset.cinemaReady;
      if (cleanActive === teardown) cleanActive = null;
    };
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    if (resizeObserver) resizeObserver.observe(track);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    root.addEventListener('click', click);
    cleanActive = teardown;
    selectScene(0);
    schedule();
  };
})();
