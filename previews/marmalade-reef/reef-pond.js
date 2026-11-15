(() => {
  const pond = document.querySelector('[data-reef-pond]');
  const control = document.querySelector('[data-reef-motion-toggle]');
  if (!pond || !control) return;

  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const label = control.querySelector('[data-reef-motion-label]');
  const storageKey = 'marmalade-reef-motion-paused';
  let preference = false;
  try { preference = localStorage.getItem(storageKey) === 'true'; } catch {}

  const syncMotion = () => {
    root.dataset.reefMotion = reduce.matches || preference ? 'paused' : 'playing';
    label.textContent = preference ? 'Resume animations' : 'Pause animations';
    control.hidden = reduce.matches;
    window.dispatchEvent(new Event('reef-motion-change'));
  };
  control.addEventListener('click', () => {
    preference = !preference;
    try { localStorage.setItem(storageKey, String(preference)); } catch {}
    syncMotion();
  });
  reduce.addEventListener('change', syncMotion);
  syncMotion();

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      pond.toggleAttribute('data-pond-visible', entry.isIntersecting);
    }).observe(pond);
  } else {
    pond.setAttribute('data-pond-visible', '');
  }

  // Leave the original artwork visible if either animation layer fails to load.
  const base = pond.querySelector('.reef-pond-base');
  const koi = pond.querySelector('.reef-koi img');
  Promise.all([base.decode(), koi.decode()])
    .then(() => { pond.setAttribute('data-pond-ready', ''); })
    .catch(() => {});
})();
