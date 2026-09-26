(() => {
  'use strict';

  const ROOT_PAGE = 'index.html';
  let revealObserver = null;
  let routeInFlight = false;

  // Persistent route progress line. It stays outside <main>, so it survives soft navigation.
  const progress = document.createElement('div');
  progress.className = 'route-progress';
  progress.setAttribute('aria-hidden', 'true');
  document.body.appendChild(progress);

  const setRouteLoading = (state) => {
    if (state === 'start') {
      progress.classList.remove('done');
      requestAnimationFrame(() => progress.classList.add('loading'));
    } else {
      progress.classList.remove('loading');
      progress.classList.add('done');
      setTimeout(() => progress.classList.remove('done'), 500);
    }
  };

  const currentPageName = (url = location.href) => {
    const u = new URL(url, location.href);
    let file = u.pathname.split('/').pop() || ROOT_PAGE;
    if (!file.includes('.')) file = ROOT_PAGE;
    return file;
  };

  const updateActiveNav = (url = location.href) => {
    const page = currentPageName(url);
    document.querySelectorAll('.nav a').forEach(a => {
      const href = a.getAttribute('href') || '';
      if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      const active = currentPageName(new URL(href, location.href).href) === page;
      a.classList.toggle('active', active && !a.classList.contains('nav-cta'));
    });
  };

  const initMenu = () => {
    const menuBtn = document.querySelector('.menu-btn');
    const nav = document.querySelector('.nav');
    if (!menuBtn || !nav || menuBtn.dataset.bound === '1') return;
    menuBtn.dataset.bound = '1';
    menuBtn.setAttribute('aria-label', 'Open navigation');
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', String(open));
    });
  };

  const initReveal = () => {
    if (revealObserver) revealObserver.disconnect();
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
      return;
    }
    revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.10, rootMargin: '0px 0px -30px 0px' });
    document.querySelectorAll('main .reveal').forEach(el => revealObserver.observe(el));
  };

  // Keep every site video silent and make each video a clean tap-to-pause/play surface.
  const initVideos = () => {
    document.querySelectorAll('main video').forEach(video => {
      video.muted = true;
      video.defaultMuted = true;
      video.volume = 0;
      video.playsInline = true;
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      if (!video.dataset.bound) {
        video.dataset.bound = '1';
        const toggle = () => {
          if (video.paused) video.play().catch(() => {});
          else video.pause();
        };
        video.addEventListener('click', toggle);
        video.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        });
      }
      if (video.hasAttribute('autoplay')) video.play().catch(() => {});
    });
  };

  const initProjectWizard = () => {
    const form = document.querySelector('.project-wizard');
    if (!form || form.dataset.bound === '1') return;
    form.dataset.bound = '1';
    const steps = [...form.querySelectorAll('.wizard-step')];
    const dots = [...form.querySelectorAll('.wizard-dot')];
    const line = form.querySelector('.wizard-line i');
    let current = 0;
    let transitioning = false;
    const show = (index, direction = 1) => {
      if (index < 0 || index >= steps.length || index === current || transitioning) return;
      transitioning = true;
      const oldIndex = current;
      const outgoing = steps[oldIndex];
      const incoming = steps[index];
      outgoing.classList.add(direction > 0 ? 'step-exit-left' : 'step-exit-right');
      setTimeout(() => {
        outgoing.classList.remove('active','step-exit-left','step-exit-right');
        current = index;
        incoming.classList.add('active');
        dots.forEach((dot,i) => {
          dot.classList.toggle('active', i === current);
          dot.classList.toggle('complete', i < current);
        });
        if (line) line.style.width = (current / (steps.length - 1) * 100) + '%';
        form.scrollIntoView({behavior:'smooth', block:'center'});
        setTimeout(() => { transitioning = false; }, 460);
      }, 260);
    };
    const validStep = () => {
      const required = [...steps[current].querySelectorAll('[required]')];
      for (const field of required) if (!field.reportValidity()) return false;
      return true;
    };
    form.querySelectorAll('.wizard-next').forEach(btn => btn.addEventListener('click', () => {
      if (validStep()) show(current + 1, 1);
    }));
    form.querySelectorAll('.wizard-back').forEach(btn => btn.addEventListener('click', () => show(current - 1, -1)));
    dots.forEach((dot,i) => dot.addEventListener('click', () => {
      if (i < current || (i === current + 1 && validStep())) show(i, i > current ? 1 : -1);
    }));
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!validStep()) return;
      const data = new FormData(form);
      const subject = 'New website project enquiry — ' + (data.get('Business') || data.get('Name') || 'Spirit2k5');
      const body = [
        'NEW PROJECT ENQUIRY',
        '',
        'ABOUT YOU',
        'Name: ' + (data.get('Name') || ''),
        'Business / brand: ' + (data.get('Business') || ''),
        'Email: ' + (data.get('Email') || ''),
        'Phone / WhatsApp: ' + (data.get('Phone') || ''),
        '',
        'WHAT DO YOU NEED?',
        'Project type: ' + (data.get('Project type') || ''),
        'Budget: ' + (data.get('Budget') || ''),
        'Timeline: ' + (data.get('Timeline') || ''),
        'Existing website: ' + (data.get('Existing site') || ''),
        '',
        'THE PROJECT',
        data.get('Project details') || ''
      ].join('\n');
      const success = form.querySelector('.enquiry-success');
      if (success) {
        success.classList.add('show');
        setTimeout(() => success.classList.remove('show'), 5000);
      }
      const mailto = 'mailto:mahloricarlton@gmail.com?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
      setTimeout(() => { window.location.href = mailto; }, 350);
    });
  };

  const initMotion = () => {
    document.querySelectorAll('main .card, main .price-card, main .case-study, main .service-list a, main .process-track>div').forEach((el,i) => {
      el.style.setProperty('--motion-delay', (i % 6) * 55 + 'ms');
      el.classList.add('motion-item');
    });
  };

  const initInteractiveMotion = () => {
    const main = document.querySelector('main');
    if (!main || main.dataset.motionControls === '1') return;
    main.dataset.motionControls = '1';

    // Make visual project/media surfaces pressable, not hover-only.
    main.querySelectorAll('.case-media, .about-portrait, .media-card, .page-hero > img, .page-hero > video').forEach(el => {
      el.classList.add('pressable-visual');
      if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
      const press = () => {
        el.classList.remove('visual-pop');
        void el.offsetWidth;
        el.classList.add('visual-pop');
        setTimeout(() => el.classList.remove('visual-pop'), 700);
      };
      el.addEventListener('click', press);
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); press(); }
      });
    });

    // Home's design/development/live visual can be pressed to bring each stage forward.
    const build = main.querySelector('.build-visual');
    if (build) {
      const windows = [...build.querySelectorAll('.build-window')];
      windows.forEach((win, index) => {
        win.classList.add('pressable-build');
        win.tabIndex = 0;
        const activate = () => {
          windows.forEach(w => w.classList.remove('build-active'));
          win.classList.add('build-active');
          build.dataset.activeStage = String(index);
        };
        win.addEventListener('click', activate);
        win.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
        });
      });
    }

    // Buttons visibly react to touch/click on mobile and desktop.
    main.querySelectorAll('.btn, .price-card, .process-track > div').forEach(el => {
      el.addEventListener('pointerdown', () => el.classList.add('is-pressed'));
      ['pointerup','pointercancel','pointerleave'].forEach(evt => el.addEventListener(evt, () => el.classList.remove('is-pressed')));
    });
  };

  const initPackageCards = () => {
    document.querySelectorAll('.price-card[data-package-link]').forEach(card => {
      if (card.dataset.packageBound === '1') return;
      card.dataset.packageBound = '1';
      const openPackage = () => navigate(new URL(card.dataset.packageLink, location.href).href);
      card.addEventListener('click', event => {
        if (event.target.closest('a,button,input,select,textarea')) return;
        openPackage();
      });
      card.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openPackage();
        }
      });
    });
  };

  const initPageShowcaseAnimation = () => {
    const main = document.querySelector('main');
    if (!main || main.querySelector('.page-motion-showcase')) return;

    const page = currentPageName();
    const configs = {
      'index.html': {
        eyebrow: 'Interactive build',
        title: 'Press a stage and watch the build move.',
        buttons: ['Design','Develop','Launch'],
        cards: [
          ['DESIGN','Wireframes','Structure • layout • direction'],
          ['DEVELOP','Code','HTML • CSS • JavaScript'],
          ['LAUNCH','Live','Test • connect • publish']
        ]
      },
      'services.html': {
        eyebrow: 'Interactive services',
        title: 'Press a service and watch the idea change.',
        buttons: ['Website','Store','Redesign'],
        cards: [
          ['WEBSITE','Business site','Pages • enquiries • credibility'],
          ['STORE','E-commerce','Products • cart • checkout'],
          ['REDESIGN','Refresh','Modern UI • mobile • speed']
        ]
      },
      'portfolio.html': {
        eyebrow: 'Interactive work',
        title: 'Press through real project stages.',
        buttons: ['Denz','RONMAXAKS','FareMap'],
        cards: [
          ['LIVE','Denz iPhones','Storefront • stock • checkout'],
          ['LIVE','RONMAXAKS','Business site • responsive • launch'],
          ['BUILDING','FareMap','Supabase • SQL • product development']
        ]
      },
      'pricing.html': {
        eyebrow: 'Interactive pricing',
        title: 'Press a package to bring it forward.',
        buttons: ['Starter','Business','Store','Custom'],
        cards: [
          ['FROM','R1,500','Focused professional website'],
          ['FROM','R3,500','Full business website'],
          ['FROM','R6,500','E-commerce storefront'],
          ['SCOPED','Quote','Custom web systems']
        ]
      },
      'about.html': {
        eyebrow: 'Behind the build',
        title: 'Press a skill to move it into focus.',
        buttons: ['Design','Frontend','Systems'],
        cards: [
          ['DESIGN','UI / UX','Clean layouts • responsive thinking'],
          ['FRONTEND','Web build','HTML • CSS • JavaScript'],
          ['SYSTEMS','Web apps','Supabase • APIs • integrations']
        ]
      },
      'contact.html': {
        eyebrow: 'Project journey',
        title: 'Press through the enquiry journey.',
        buttons: ['About you','Your needs','The project'],
        cards: [
          ['STEP 01','About you','Name • business • contact'],
          ['STEP 02','What you need','Type • budget • timeline'],
          ['STEP 03','The project','Details • goals • send enquiry']
        ]
      }
    };
    const cfg = configs[page] || configs['index.html'];
    const anchor = main.querySelector('.hero, .page-hero, .about-hero, .contact-hero') || main.firstElementChild;
    if (!anchor) return;

    const section = document.createElement('section');
    section.className = 'page-motion-showcase reveal visible';
    section.setAttribute('aria-label', cfg.title);
    section.innerHTML = `
      <div class="page-motion-copy">
        <p class="eyebrow">${cfg.eyebrow}</p>
        <h2>${cfg.title}</h2>
        <div class="page-motion-tabs" role="tablist"></div>
      </div>
      <div class="page-motion-scene" aria-live="polite">
        <div class="motion-ring ring-a"></div>
        <div class="motion-ring ring-b"></div>
        <div class="motion-card-stack"></div>
        <div class="motion-pulse"></div>
      </div>`;

    const tabs = section.querySelector('.page-motion-tabs');
    const stack = section.querySelector('.motion-card-stack');

    cfg.cards.forEach((card, i) => {
      const panel = document.createElement('button');
      panel.type = 'button';
      panel.className = 'page-motion-card' + (i === 0 ? ' active' : '');
      panel.dataset.index = String(i);
      panel.style.setProperty('--slot', i);
      panel.innerHTML = `<span>${card[0]}</span><strong>${card[1]}</strong><small>${card[2]}</small>`;
      stack.appendChild(panel);
    });

    cfg.buttons.forEach((label, i) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'page-motion-tab' + (i === 0 ? ' active' : '');
      tab.textContent = label;
      tab.dataset.index = String(i);
      tabs.appendChild(tab);
    });

    const cards = [...stack.querySelectorAll('.page-motion-card')];
    const tabButtons = [...tabs.querySelectorAll('.page-motion-tab')];
    const activate = index => {
      const safe = Math.max(0, Math.min(index, cards.length - 1));
      cards.forEach((card, i) => {
        card.classList.toggle('active', i === safe);
        card.classList.toggle('before', i < safe);
        card.classList.toggle('after', i > safe);
      });
      tabButtons.forEach((tab, i) => tab.classList.toggle('active', i === safe));
      section.classList.remove('motion-scene-pop');
      void section.offsetWidth;
      section.classList.add('motion-scene-pop');
      setTimeout(() => section.classList.remove('motion-scene-pop'), 700);
    };

    tabButtons.forEach(tab => tab.addEventListener('click', () => activate(Number(tab.dataset.index))));
    cards.forEach(card => {
      card.addEventListener('click', () => activate(Number(card.dataset.index)));
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate(Number(card.dataset.index));
        }
      });
    });

    anchor.insertAdjacentElement('afterend', section);

    if (page === 'index.html') {
      const buildWindows = [...main.querySelectorAll('.build-window')];
      tabButtons.forEach((tab, i) => tab.addEventListener('click', () => {
        const win = buildWindows[i];
        if (!win) return;
        buildWindows.forEach(w => w.classList.remove('build-active'));
        win.classList.add('build-active');
      }));
    }

    if (page === 'contact.html') {
      tabButtons.forEach((tab, i) => tab.addEventListener('click', () => {
        const wizardDot = main.querySelectorAll('.wizard-dot')[i];
        if (wizardDot) wizardDot.click();
      }));
    }
  };

  const initPage = () => {
    initMenu();
    initReveal();
    initVideos();
    initProjectWizard();
    initMotion();
    initInteractiveMotion();
    initPackageCards();
    initPageShowcaseAnimation();
    updateActiveNav();
    const nav = document.querySelector('.nav');
    const btn = document.querySelector('.menu-btn');
    if (nav) nav.classList.remove('open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  };

  const copyHeadMetadata = (nextDoc) => {
    document.title = nextDoc.title || document.title;
    const selectors = [
      'meta[name="description"]',
      'meta[name="keywords"]',
      'link[rel="canonical"]',
      'meta[property="og:title"]',
      'meta[property="og:description"]',
      'meta[property="og:url"]',
      'meta[name="twitter:title"]',
      'meta[name="twitter:description"]'
    ];
    selectors.forEach(sel => {
      const current = document.head.querySelector(sel);
      const incoming = nextDoc.head.querySelector(sel);
      if (current && incoming) {
        [...incoming.attributes].forEach(attr => current.setAttribute(attr.name, attr.value));
      }
    });
  };

  // Soft navigation: swap only <main> so page transitions stay fast and smooth.
  const navigate = async (targetUrl, { push = true, restoreScroll = false } = {}) => {
    const url = new URL(targetUrl, location.href);
    if (routeInFlight) return;
    if (location.protocol === 'file:') {
      location.href = url.href; // fetch() between local files is blocked by many browsers.
      return;
    }

    routeInFlight = true;
    setRouteLoading('start');
    try {
      const response = await fetch(url.href, { credentials: 'same-origin', cache: 'no-cache' });
      if (!response.ok) throw new Error(`Navigation failed: ${response.status}`);
      const html = await response.text();
      const nextDoc = new DOMParser().parseFromString(html, 'text/html');
      const nextMain = nextDoc.querySelector('main');
      const currentMain = document.querySelector('main');
      if (!nextMain || !currentMain) throw new Error('Page main content missing');

      const swap = () => {
        currentMain.replaceWith(nextMain);
        copyHeadMetadata(nextDoc);
        if (push) history.pushState({ spiritSoftNav: true }, '', url.href);
        initPage();
        if (url.hash) {
          requestAnimationFrame(() => {
            const target = document.querySelector(url.hash);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        } else if (!restoreScroll) {
          window.scrollTo({ top: 0, behavior: 'auto' });
        }
      };

      if (document.startViewTransition) {
        const transition = document.startViewTransition(swap);
        await transition.finished.catch(() => {});
      } else {
        currentMain.style.opacity = '.35';
        await new Promise(resolve => setTimeout(resolve, 90));
        swap();
      }
      setRouteLoading('done');
    } catch (err) {
      console.warn('[Spirit2k5] Soft navigation fallback:', err);
      location.href = url.href;
    } finally {
      routeInFlight = false;
    }
  };

  document.addEventListener('click', event => {
    const anchor = event.target.closest('a[href]');
    if (!anchor) return;
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (anchor.target && anchor.target !== '_self') return;
    if (anchor.hasAttribute('download')) return;

    const raw = anchor.getAttribute('href') || '';
    if (!raw || raw.startsWith('mailto:') || raw.startsWith('tel:') || raw.startsWith('javascript:')) return;

    const url = new URL(anchor.href, location.href);
    if (url.origin !== location.origin) return;

    if (raw.startsWith('#')) {
      const target = document.querySelector(raw);
      if (target) {
        event.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }

    const samePage = url.pathname === location.pathname;
    if (samePage && url.hash) {
      event.preventDefault();
      const target = document.querySelector(url.hash);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    const file = currentPageName(url.href).toLowerCase();
    if (file.endsWith('.html') || url.pathname.endsWith('/')) {
      event.preventDefault();
      navigate(url.href);
    }
  });

  window.addEventListener('popstate', () => navigate(location.href, { push: false }));


  initPage();
})();
