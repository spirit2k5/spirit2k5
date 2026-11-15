(() => {
  const trail = document.querySelector('[data-reef-trail]');
  if (!trail) return;

  const chart = trail.querySelector('.reef-trail-frame');
  const path = trail.querySelector('[data-trail-path]');
  const reveal = trail.querySelector('[data-trail-reveal]');
  if (!chart || !path || !reveal || typeof path.getTotalLength !== 'function') return;

  const fish = [...trail.querySelectorAll('[data-trail-fish]')].map((element) => ({
    element,
    lag: Number(element.dataset.trailFish),
  }));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motionAllowed = () => !reducedMotion.matches && document.documentElement.dataset.reefMotion !== 'paused';
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const viewBox = path.ownerSVGElement.viewBox.baseVal;
  const pathLength = path.getTotalLength();

  let frame = 0;
  let watching = false;

  function draw() {
    frame = 0;
    if (!motionAllowed() || document.hidden) return;

    const rect = chart.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= innerHeight) return;

    const scroll = clamp((innerHeight * .92 - rect.top) / (innerHeight * .72), 0, 1);
    const progress = scroll * scroll * (3 - 2 * scroll);
    const lead = .23 + .75 * progress;
    const scaleX = rect.width / viewBox.width;
    const scaleY = rect.height / viewBox.height;

    fish.forEach(({ element, lag }) => {
      const distance = pathLength * (lead - lag);
      const point = path.getPointAtLength(distance);
      const ahead = path.getPointAtLength(Math.min(distance + 3, pathLength));
      const angle = Math.atan2((ahead.y - point.y) * scaleY, (ahead.x - point.x) * scaleX) * 180 / Math.PI;
      const drift = Math.sin(progress * Math.PI * 5 + lag * 11) * 3;

      element.style.setProperty('--trail-fish-x', `${point.x / viewBox.width * 100}%`);
      element.style.setProperty('--trail-fish-y', `${(point.y + drift) / viewBox.height * 100}%`);
      element.style.setProperty('--trail-fish-angle', `${clamp(angle, -36, 36)}deg`);
    });

    reveal.setAttribute('stroke-dasharray', `${(lead * pathLength).toFixed(1)} ${Math.ceil(pathLength)}`);
    trail.toggleAttribute('data-trail-arrived', scroll > .93);
    trail.setAttribute('data-trail-moving', '');
  }

  function schedule() {
    if (!frame && watching && !document.hidden && motionAllowed()) frame = requestAnimationFrame(draw);
  }

  function updateMotion() {
    if (!motionAllowed()) {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (reducedMotion.matches) {
        trail.removeAttribute('data-trail-moving');
        trail.removeAttribute('data-trail-arrived');
        fish.forEach(({ element }) => {
          element.style.removeProperty('--trail-fish-x');
          element.style.removeProperty('--trail-fish-y');
          element.style.removeProperty('--trail-fish-angle');
        });
      }
      return;
    }
    schedule();
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(([entry]) => {
      watching = entry.isIntersecting;
      schedule();
    });
    observer.observe(chart);
  } else {
    watching = true;
    schedule();
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('reef-motion-change', updateMotion);
  document.addEventListener('visibilitychange', schedule);
  reducedMotion.addEventListener('change', updateMotion);
})();
