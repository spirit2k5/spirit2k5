(() => {
  const control = document.querySelector('[data-reef-motion-toggle]');
  if (!control) return;

  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const label = control.querySelector('[data-reef-motion-label]');
  const storageKey = 'marmalade-reef-motion-paused';
  let preference = false;

  function syncMotion() {
    root.dataset.reefMotion = reduce.matches || preference ? 'paused' : 'playing';
    label.textContent = preference ? 'Resume animations' : 'Pause animations';
    control.hidden = reduce.matches;
    window.dispatchEvent(new Event('reef-motion-change'));
  }

  function restorePreference() {
    try { preference = localStorage.getItem(storageKey) === 'true'; } catch {}
    syncMotion();
  }

  control.addEventListener('click', () => {
    preference = !preference;
    try { localStorage.setItem(storageKey, String(preference)); } catch {}
    syncMotion();
  });
  reduce.addEventListener('change', syncMotion);
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) restorePreference();
  });
  restorePreference();

  const currents = document.querySelectorAll('.reef-current');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      for (const { target, isIntersecting } of entries) {
        target.toggleAttribute('data-current-visible', isIntersecting);
      }
    });
    currents.forEach((current) => observer.observe(current));
  } else {
    currents.forEach((current) => current.setAttribute('data-current-visible', ''));
  }
})();
