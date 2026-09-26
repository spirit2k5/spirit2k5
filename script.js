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
    const packagePages = ['starter-website.html','business-website.html','ecommerce-website.html','custom-web-app.html'];
    const servicePages = ['wordpress.html'];
    document.querySelectorAll('.nav a').forEach(a => {
      const href = a.getAttribute('href') || '';
      if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      const hrefPage = currentPageName(new URL(href, location.href).href);
      const active = hrefPage === page || (packagePages.includes(page) && hrefPage === 'pricing.html') || (servicePages.includes(page) && hrefPage === 'services.html');
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

  const initWorkProcessAnimation = () => {
    const main = document.querySelector('main');
    if (!main || main.querySelector('.work-flow-animation')) return;

    const page = currentPageName();
    const packagePages = ['starter-website.html','business-website.html','ecommerce-website.html','custom-web-app.html'];
    const configs = {
      'index.html': {
        label: 'How I work',
        title: 'From your idea to a live website.',
        steps: [
          ['01','Brief','You tell me what you need.'],
          ['02','Design','I shape the layout and direction.'],
          ['03','Build','I develop the real website.'],
          ['04','Review','You see the work and request changes.'],
          ['05','Pay','You pay once you are happy.'],
          ['06','Deploy','I deploy it and set up the approved domain.']
        ]
      },
      'services.html': {
        label: 'How the service works',
        title: 'Choose it. I build it. You review it.',
        steps: [
          ['01','Choose','We confirm the website or service you need.'],
          ['02','Plan','I map the pages, features and structure.'],
          ['03','Build','I design and develop the project.'],
          ['04','Review','You see it working before payment.'],
          ['05','Pay','You pay after you approve the work.'],
          ['06','Launch','I deploy and connect the approved domain.']
        ]
      },
      'portfolio.html': {
        label: 'Behind the work',
        title: 'This is how a project reaches live.',
        steps: [
          ['01','Build','The interface and features are developed.'],
          ['02','Test','Responsive behaviour and functions are checked.'],
          ['03','Refine','Problems and details are corrected.'],
          ['04','Review','The client sees the actual project.'],
          ['05','Approve','Payment follows approval.'],
          ['06','Live','The project is deployed and connected.']
        ]
      },
      'pricing.html': {
        label: 'Payment process',
        title: 'Work first. Review it. Pay. Then I deploy.',
        steps: [
          ['01','Scope','We agree on what must be built.'],
          ['02','Work','I build the website first.'],
          ['03','Review','You see and test the work.'],
          ['04','Pay','You pay once you are happy.'],
          ['05','Deploy','I put the approved website live.'],
          ['06','Domain','I buy or connect the domain you approved.']
        ]
      },
      'about.html': {
        label: 'My build method',
        title: 'Plan carefully, build properly, refine the details.',
        steps: [
          ['01','Understand','I learn what the business needs.'],
          ['02','Design','I shape the user interface and structure.'],
          ['03','Code','I build the responsive website.'],
          ['04','Test','I check the experience and functionality.'],
          ['05','Refine','I fix the small details.'],
          ['06','Deliver','You review the finished work.']
        ]
      },
      'wordpress.html': {
        label: 'WordPress workflow',
        title: 'From WordPress setup to a finished live website.',
        steps: [
          ['01','Setup','I prepare WordPress, hosting and the project structure.'],
          ['02','Design','I build the layout and visual direction.'],
          ['03','Build','Themes, plugins, forms or WooCommerce are configured and developed.'],
          ['04','Test','I test responsive layout, forms, store flows and key functions.'],
          ['05','Review','You see and review the WordPress website before payment.'],
          ['06','Launch','After approval and payment, I deploy and connect the approved domain.']
        ]
      },
      'contact.html': {
        label: 'What happens next',
        title: 'Your enquiry starts the real build process.',
        steps: [
          ['01','Enquiry','You send the project details.'],
          ['02','Scope','I confirm what the project needs.'],
          ['03','Build','I do the work first.'],
          ['04','Review','You see the project before payment.'],
          ['05','Pay','You pay after approval.'],
          ['06','Launch','I deploy it and handle the approved domain.']
        ]
      }
    };

    const packageConfig = {
      label: 'Package workflow',
      title: 'I build first. You review before you pay.',
      steps: [
        ['01','Confirm','We confirm the package and your content.'],
        ['02','Build','I design and develop the website.'],
        ['03','Test','I test the pages and responsive layout.'],
        ['04','Review','You see the finished work.'],
        ['05','Pay','You pay when you are happy.'],
        ['06','Launch','I deploy it and set up the approved domain.']
      ]
    };

    const cfg = packagePages.includes(page) ? packageConfig : (configs[page] || configs['index.html']);
    const anchor = main.querySelector('.hero, .page-hero, .about-hero, .contact-hero, .package-hero') || main.firstElementChild;
    if (!anchor) return;

    const section = document.createElement('section');
    section.className = 'work-flow-animation reveal visible';
    section.innerHTML = `
      <div class="flow-copy">
        <p class="eyebrow">${cfg.label}</p>
        <h2>${cfg.title}</h2>
        <p class="flow-status" aria-live="polite"></p>
      </div>
      <div class="flow-visual">
        <div class="flow-browser" aria-hidden="true">
          <div class="flow-browser-bar"><i></i><i></i><i></i><span>spirit2k5 / project</span></div>
          <div class="flow-screen" data-scene="brief">
            <div class="flow-screen-label">01</div>
            <strong>Brief</strong>
            <div class="flow-stage-art">
              <div class="art-brief">
                <div class="brief-card"><b>PROJECT BRIEF</b><i></i><i></i><i></i><span>requirements ✓</span></div>
              </div>
              <div class="art-design">
                <div class="wireframe-nav"></div><div class="wireframe-hero"></div>
                <div class="wireframe-grid"><i></i><i></i><i></i></div>
              </div>
              <div class="art-code">
                <span>&lt;main&gt;</span><span>&nbsp;&nbsp;&lt;section class="website"&gt;</span><span>&nbsp;&nbsp;&nbsp;&nbsp;build();</span><span>&nbsp;&nbsp;&nbsp;&nbsp;test();</span><span>&nbsp;&nbsp;&lt;/section&gt;</span><span>&lt;/main&gt;</span><b></b>
              </div>
              <div class="art-test">
                <div class="device desktop"><i></i></div><div class="device tablet"><i></i></div><div class="device phone"><i></i></div>
                <span class="test-check">Responsive ✓</span>
              </div>
              <div class="art-review">
                <div class="review-site"><i></i><i></i><i></i></div>
                <div class="review-comment one">Make this clearer</div><div class="review-comment two">✓ Updated</div>
              </div>
              <div class="art-pay">
                <div class="payment-card"><small>PROJECT APPROVED</small><b>Payment</b><span>✓ received</span></div>
              </div>
              <div class="art-deploy">
                <div class="deploy-code">BUILD</div><span class="deploy-arrow">→</span><div class="deploy-cloud">CLOUD</div><span class="deploy-arrow">→</span><div class="deploy-live">● LIVE</div>
              </div>
              <div class="art-domain">
                <div class="domain-chip">yourbusiness.co.za</div><div class="dns-line"></div><div class="domain-server">DNS</div><div class="dns-line"></div><div class="domain-live">● CONNECTED</div>
              </div>
              <div class="art-wordpress">
                <div class="wp-admin-mini">
                  <div class="wp-side"><b>WP</b><i></i><i></i><i></i><i></i></div>
                  <div class="wp-main-mini"><span>Pages</span><strong>Home</strong><em>Editing…</em><div class="wp-blocks"><i></i><i></i><i></i></div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="flow-track"><span class="flow-progress"></span></div>
        <div class="flow-steps"></div>
      </div>`;

    const stepsWrap = section.querySelector('.flow-steps');
    const progress = section.querySelector('.flow-progress');
    const status = section.querySelector('.flow-status');
    const screenLabel = section.querySelector('.flow-screen-label');
    const screenTitle = section.querySelector('.flow-screen strong');
    const screen = section.querySelector('.flow-screen');
    const sceneFor = title => {
      const value = title.toLowerCase();
      if (/domain/.test(value)) return 'domain';
      if (/deploy|launch|live/.test(value)) return 'deploy';
      if (/pay|payment/.test(value)) return 'pay';
      if (/review|approve|deliver/.test(value)) return 'review';
      if (/test|refine/.test(value)) return 'test';
      if (/wordpress|setup|theme|plugin|woocommerce/.test(value)) return 'wordpress';
      if (/design|plan/.test(value)) return 'design';
      if (/build|work|code/.test(value)) return 'code';
      return 'brief';
    };
    let current = 0;
    let timer = null;

    cfg.steps.forEach((step, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'flow-step' + (index === 0 ? ' active' : '');
      button.dataset.index = String(index);
      button.innerHTML = `<b>${step[0]}</b><span>${step[1]}</span>`;
      stepsWrap.appendChild(button);
    });

    const buttons = [...stepsWrap.querySelectorAll('.flow-step')];
    const activate = index => {
      current = Math.max(0, Math.min(index, cfg.steps.length - 1));
      const step = cfg.steps[current];
      buttons.forEach((button, i) => {
        button.classList.toggle('active', i === current);
        button.classList.toggle('done', i < current);
      });
      progress.style.width = (current / (cfg.steps.length - 1) * 100) + '%';
      status.textContent = step[2];
      screenLabel.textContent = step[0];
      screenTitle.textContent = step[1];
      screen.dataset.scene = sceneFor(step[1]);
      screen.classList.remove('flow-screen-change');
      void screen.offsetWidth;
      screen.classList.add('flow-screen-change');
    };

    const restartAuto = () => {
      clearInterval(timer);
      timer = setInterval(() => activate((current + 1) % cfg.steps.length), 3200);
    };

    buttons.forEach(button => button.addEventListener('click', () => {
      activate(Number(button.dataset.index));
      restartAuto();
    }));

    anchor.insertAdjacentElement('afterend', section);
    activate(0);
    restartAuto();
  };

  const initPage = () => {
    initMenu();
    initReveal();
    initVideos();
    initProjectWizard();
    initMotion();
    initInteractiveMotion();
    initPackageCards();
    initWorkProcessAnimation();
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
