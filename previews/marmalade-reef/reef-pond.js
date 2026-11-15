(() => {
  const pond = document.querySelector('[data-reef-pond]');
  if (!pond) return;

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
