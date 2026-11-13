(() => {
  const nav = document.querySelector('.nav');
  const button = document.getElementById('menu-toggle');
  const menu = document.getElementById('nav-links');
  const links = [...menu.querySelectorAll('a')];

  const setOpen = (open) => {
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    menu.classList.toggle('open', open);
  };

  nav.classList.add('nav-ready');
  button.addEventListener('click', () => {
    setOpen(button.getAttribute('aria-expanded') !== 'true');
  });

  links.forEach((link) => {
    link.addEventListener('click', () => {
      setOpen(false);
      // Move keyboard focus into the chosen section before hiding the menu.
      if (matchMedia('(max-width: 1160px)').matches) {
        const target = document.querySelector(link.hash);
        if (target) {
          target.setAttribute('tabindex', '-1');
          target.focus({ preventScroll: true });
        }
      }
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      button.focus();
    }
  });
  document.addEventListener('click', (event) => {
    if (!nav.contains(event.target)) setOpen(false);
  });
  const desktop = matchMedia('(min-width: 1161px)');
  const closeOnDesktop = () => setOpen(false);
  if (desktop.addEventListener) desktop.addEventListener('change', closeOnDesktop);
  else if (desktop.addListener) desktop.addListener(closeOnDesktop);

  const updateCurrent = () => {
    links.forEach((link) => {
      if (link.hash === location.hash) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };
  window.addEventListener('hashchange', updateCurrent);
  updateCurrent();
  document.getElementById('year').textContent = new Date().getFullYear();
})();
