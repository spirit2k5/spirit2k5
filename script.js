(() => {
  'use strict';

  // Always send the old GitHub Pages address to the official Spirit2k5 domain.
  if (location.hostname.toLowerCase() === 'spirit2k5.github.io') {
    const legacyPrefix = '/spirit2k5';
    let cleanPath = location.pathname;
    if (cleanPath === legacyPrefix || cleanPath === legacyPrefix + '/') cleanPath = '/';
    else if (cleanPath.startsWith(legacyPrefix + '/')) cleanPath = cleanPath.slice(legacyPrefix.length);
    location.replace('https://spirit2k5.co.za' + cleanPath + location.search + location.hash);
    return;
  }

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
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!validStep()) return;
      const data = new FormData(form);
      const subject = 'New website project enquiry — ' + (data.get('Business') || data.get('Name') || 'Spirit2k5');
      const button = form.querySelector('.send-enquiry');
      const success = form.querySelector('.enquiry-success');
      const originalButton = button ? button.innerHTML : '';
      const payload = {};
      data.forEach((value, key) => { payload[key] = value; });
      payload._subject = subject;
      payload._template = 'table';
      payload._url = 'https://spirit2k5.co.za/contact.html';
      try {
        if (button) {
          button.disabled = true;
          button.textContent = 'Sending…';
        }
        const response = await fetch('https://formsubmit.co/ajax/mahloricarlton@gmail.com', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.success === false) throw new Error(result.message || 'Unable to send');
        if (success) {
          const title = success.querySelector('b');
          const copy = success.querySelector('p');
          if (title) title.textContent = 'Enquiry sent';
          if (copy) copy.textContent = 'Thanks — your project details were submitted. I’ll reply using the contact details you provided.';
          success.classList.add('show');
        }
        form.reset();
      } catch (error) {
        const phone = '27781888220';
        const message = 'Hi Carlton, I tried to send a Spirit2k5 website enquiry but the form could not send. I would like to discuss a website project.';
        if (success) {
          const title = success.querySelector('b');
          const copy = success.querySelector('p');
          if (title) title.textContent = 'Use WhatsApp instead';
          if (copy) copy.textContent = 'The form could not send right now. WhatsApp is available as an immediate backup.';
          success.classList.add('show');
        }
        setTimeout(() => window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(message), '_blank', 'noopener'), 450);
      } finally {
        if (button) {
          button.disabled = false;
          button.innerHTML = originalButton;
        }
        if (success) setTimeout(() => success.classList.remove('show'), 7000);
      }
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
        label: 'What happens after you enquire',
        title: 'Your website, from first idea to going live.',
        steps: [
          ['01','Brief','Tell us what your business needs.'],
          ['02','Design','Your layout and direction are prepared around your business.'],
          ['03','Build','Your real website comes together.'],
          ['04','Review','You review the website and request agreed changes.'],
          ['05','Pay','You pay after you approve the agreed work.'],
          ['06','Deploy','Your approved website is launched on the agreed domain.']
        ]
      },
      'services.html': {
        label: 'How your project moves',
        title: 'Choose what you need. Review the work. Then go live.',
        steps: [
          ['01','Choose','Your website needs and goals are confirmed.'],
          ['02','Plan','The pages, customer journey and required features are planned.'],
          ['03','Build','Your agreed website is prepared.'],
          ['04','Review','You review the working website before payment.'],
          ['05','Pay','Payment is due after you approve the agreed work.'],
          ['06','Launch','The approved website is launched and connected to the agreed domain.']
        ]
      },
      'portfolio.html': {
        label: 'What you can expect',
        title: 'This is how your project moves toward launch.',
        steps: [
          ['01','Build','Your agreed pages and features come together.'],
          ['02','Test','Mobile use, forms and important actions are checked.'],
          ['03','Refine','Anything agreed during review is refined.'],
          ['04','Review','You review the actual website.'],
          ['05','Approve','Payment follows your approval of the agreed work.'],
          ['06','Live','The approved website goes live on the agreed domain.']
        ]
      },
      'pricing.html': {
        label: 'How payment works',
        title: 'See the website. Review it. Pay after approval. Then go live.',
        steps: [
          ['01','Scope','Your website scope is agreed.'],
          ['02','Work','Your agreed website is prepared first.'],
          ['03','Review','You see and review the working website.'],
          ['04','Pay','You pay after you approve the agreed work.'],
          ['05','Deploy','Your approved website is put live.'],
          ['06','Domain','The domain you approved is purchased or connected after confirmation.']
        ]
      },
      'about.html': {
        label: 'What you can expect',
        title: 'Clear planning, careful review and a website ready for customers.',
        steps: [
          ['01','Understand','Your business, customers and goals are understood first.'],
          ['02','Design','Your pages and customer journey are planned.'],
          ['03','Code','Your mobile-friendly website comes together.'],
          ['04','Test','Important customer actions and forms are checked.'],
          ['05','Refine','The details are refined before launch.'],
          ['06','Deliver','You review the finished website before it goes live.']
        ]
      },
      'wordpress.html': {
        label: 'Your WordPress project',
        title: 'From your business needs to a customer-ready WordPress website.',
        steps: [
          ['01','Setup','The WordPress setup, pages and hosting needs are prepared.'],
          ['02','Design','Your layout and visual direction are prepared around your business.'],
          ['03','Build','Your pages, forms, store features and useful tools are set up as needed.'],
          ['04','Test','Mobile use, forms, store journeys and key customer actions are checked.'],
          ['05','Review','You review the WordPress website before payment.'],
          ['06','Launch','After approval and payment, The approved website is launched and connected to the agreed domain.']
        ]
      },
      'contact.html': {
        label: 'What happens after you enquire',
        title: 'Your enquiry starts a clear website process.',
        steps: [
          ['01','Enquiry','You send your business and website details.'],
          ['02','Scope','The scope and next steps are confirmed with you.'],
          ['03','Build','Your agreed website is prepared first.'],
          ['04','Review','You review the agreed website before payment.'],
          ['05','Pay','You pay after approving the agreed work.'],
          ['06','Launch','The approved website is launched and the agreed domain is connected.']
        ]
      }
    };

    const packageConfig = {
      label: 'What happens with this package',
      title: 'You see and review the agreed website before payment.',
      steps: [
        ['01','Confirm','Your package, pages and content are confirmed.'],
        ['02','Build','Your agreed website is prepared.'],
        ['03','Test','The pages, mobile experience and important actions are checked.'],
        ['04','Review','You review the finished website.'],
        ['05','Pay','You pay after approving the agreed work.'],
        ['06','Launch','Your approved website is launched on the agreed domain.']
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

  const initConversionLayer = () => {
    if (!document.getElementById('whatsapp-float')) {
      const whatsapp = document.createElement('a');
      whatsapp.id = 'whatsapp-float';
      whatsapp.className = 'whatsapp-float';
      whatsapp.href = 'https://wa.me/27781888220?text=' + encodeURIComponent('Hi Carlton, I found Spirit2k5 Web Studio and I want to discuss a website project.');
      whatsapp.target = '_blank';
      whatsapp.rel = 'noopener';
      whatsapp.setAttribute('aria-label', 'Chat with Spirit2k5 on WhatsApp');
      whatsapp.innerHTML = '<span aria-hidden="true">WA</span><b>WhatsApp</b>';
      document.body.appendChild(whatsapp);
    }

    const footer = document.querySelector('.footer');
    if (footer && !footer.querySelector('.footer-legal')) {
      const legal = document.createElement('div');
      legal.className = 'footer-legal';
      legal.innerHTML = '<a href="resources.html">Resources</a><a href="free-website-check.html">Free website check</a><a href="faq.html">FAQ</a><a href="privacy.html">Privacy / POPIA</a><a href="terms.html">Terms</a><a href="cancellations.html">Cancellations & refunds</a><a href="cookies.html">Cookies</a>';
      footer.appendChild(legal);
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
    initWorkProcessAnimation();
    initConversionLayer();
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
