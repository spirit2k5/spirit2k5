(() => {
  'use strict';
  const SPIRIT_COLLECT_URL = 'https://vpgexijihrozwugqqagy.supabase.co/functions/v1/spirit2k5-collect';

  const getTrackingContext = () => {
    const params = new URLSearchParams(location.search);
    let sessionId = '';
    let campaign = { source:'', medium:'', name:'' };
    try {
      sessionId = sessionStorage.getItem('spirit2k5_session') || '';
      if (!sessionId) {
        sessionId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2));
        sessionStorage.setItem('spirit2k5_session', sessionId);
      }
      const incoming = {
        source: params.get('utm_source') || '',
        medium: params.get('utm_medium') || '',
        name: params.get('utm_campaign') || ''
      };
      if (incoming.source || incoming.medium || incoming.name) {
        sessionStorage.setItem('spirit2k5_campaign', JSON.stringify(incoming));
        campaign = incoming;
      } else {
        campaign = JSON.parse(sessionStorage.getItem('spirit2k5_campaign') || '{}');
      }
    } catch (_) {}
    return {
      page_path: location.pathname + location.search,
      referrer: document.referrer || '',
      utm_source: campaign.source || '',
      utm_medium: campaign.medium || '',
      utm_campaign: campaign.name || '',
      session_id: sessionId
    };
  };

  const sendToCollector = async payload => {
    try {
      const response = await fetch(SPIRIT_COLLECT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify(payload)
      });
      return response.ok;
    } catch (_) {
      return false;
    }
  };

  const trackEvent = (eventName, target = '') => {
    const payload = {
      type: 'event',
      event_name: eventName,
      target: String(target || '').slice(0, 500),
      ...getTrackingContext()
    };
    sendToCollector(payload);
  };


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

      const leadPayload = {
        type: 'enquiry',
        website: data.get('_honey') || '',
        name: data.get('Name') || '',
        business: data.get('Business') || '',
        email: data.get('Email') || '',
        phone: data.get('Phone') || '',
        project_type: data.get('Project type') || '',
        budget: data.get('Budget') || '',
        timeline: data.get('Timeline') || '',
        existing_site: data.get('Existing site') || '',
        project_details: data.get('Project details') || '',
        source_page: location.pathname + location.search,
        ...getTrackingContext()
      };

      trackEvent('enquiry_submit', 'project-enquiry-form');

      try {
        if (button) {
          button.disabled = true;
          button.textContent = 'Sending…';
        }

        const [stored, emailResult] = await Promise.all([
          sendToCollector(leadPayload),
          fetch('https://formsubmit.co/ajax/mahloricarlton@gmail.com', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(payload)
          }).then(async response => {
            const result = await response.json().catch(() => ({}));
            return { ok: response.ok && result.success !== false, message: result.message || '' };
          }).catch(() => ({ ok: false, message: '' }))
        ]);

        if (!stored && !emailResult.ok) throw new Error(emailResult.message || 'Unable to send');

        trackEvent('enquiry_success', stored && emailResult.ok ? 'stored+email' : stored ? 'stored' : 'email');

        if (success) {
          const title = success.querySelector('b');
          const copy = success.querySelector('p');
          if (title) title.textContent = 'Enquiry received';
          if (copy) copy.textContent = emailResult.ok
            ? 'Thanks — your project details were submitted. You’ll receive a reply using the contact details you provided.'
            : 'Your project details were saved securely. WhatsApp will open as an extra backup so you can reach Spirit2k5 immediately.';
          success.classList.add('show');
        }

        form.reset();

        if (!emailResult.ok && stored) {
          const phone = '27781888220';
          const message = 'Hi Carlton, I submitted a Spirit2k5 website enquiry on spirit2k5.co.za. My details were saved, and I am following up here on WhatsApp.';
          trackEvent('enquiry_fallback_whatsapp', 'stored-without-email');
          setTimeout(() => window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(message), '_blank', 'noopener'), 450);
        }
      } catch (error) {
        const phone = '27781888220';
        const message = 'Hi Carlton, I tried to send a Spirit2k5 website enquiry but the form could not send. I would like to discuss a website project.';
        trackEvent('enquiry_fallback_whatsapp', 'form-failed');
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
        label: 'What you get after you enquire',
        title: 'See your business move from idea to a website customers can use.',
        steps: [
          ['01','Your goals','Tell us what your business needs customers to understand or do.'],
          ['02','Your look','See a direction shaped around your business and customers.'],
          ['03','Your website','Your real pages, contact options and features come together.'],
          ['04','Your review','You check the website on your own device and request agreed changes.'],
          ['05','Your approval','You approve the agreed work before payment is due.'],
          ['06','Customers online','Your approved website goes live on your domain for customers to use.']
        ]
      },
      'services.html': {
        label: 'What your business gets',
        title: 'Choose what you need, see it working, then put it in front of customers.',
        steps: [
          ['01','Your needs','Tell us what customers should be able to find, understand or do.'],
          ['02','Your pages','Your pages and customer journey are shaped around those needs.'],
          ['03','Your website','Your agreed website and features come together.'],
          ['04','Your review','You check the working website before payment.'],
          ['05','Your approval','Payment follows your approval of the agreed work.'],
          ['06','Customers online','Your approved website is connected to your domain and ready for customers.']
        ]
      },
      'portfolio.html': {
        label: 'What you can expect',
        title: 'See what happens before customers see your website.',
        steps: [
          ['01','Your website','Your agreed pages and customer features come together.'],
          ['02','Every screen','The website is checked on phones, tablets and desktops.'],
          ['03','Your details','Forms, contact actions and agreed details are checked and refined.'],
          ['04','Your review','You review the real website on your own device.'],
          ['05','Your approval','Payment follows your approval of the agreed work.'],
          ['06','Customers online','Your approved website goes live on your domain.']
        ]
      },
      'pricing.html': {
        label: 'How payment works for you',
        title: 'See your website first. Approve it. Pay. Then welcome customers.',
        steps: [
          ['01','Your package','Your pages, features and price are agreed.'],
          ['02','Your website','Your agreed website is prepared first.'],
          ['03','Your review','You see and review the working website.'],
          ['04','Your approval','You approve the agreed work before payment.'],
          ['05','Go live','Your approved website is published.'],
          ['06','Your domain','Your approved domain is connected so customers can find you.']
        ]
      },
      'about.html': {
        label: 'What you can expect',
        title: 'A website experience built around your customers from the start.',
        steps: [
          ['01','Your business','Your goals, customers and priorities come first.'],
          ['02','Your journey','Your pages and customer journey are shaped around what matters.'],
          ['03','Your website','Your mobile-friendly website comes together.'],
          ['04','Customer actions','Forms, contact options and important actions are checked.'],
          ['05','Your changes','Agreed details are refined before launch.'],
          ['06','Ready for customers','You review the finished website before it goes live.']
        ]
      },
      'wordpress.html': {
        label: 'Your WordPress website',
        title: 'From your business needs to a WordPress website customers can use easily.',
        steps: [
          ['01','Your needs','Your pages, store needs and content are confirmed.'],
          ['02','Your look','Your layout and visual direction are shaped around your business.'],
          ['03','Your website','Your pages, forms, store features and useful tools come together.'],
          ['04','Customer journey','Mobile use, forms, checkout and important actions are checked.'],
          ['05','Your review','You review the WordPress website before payment.'],
          ['06','Customers online','After approval and payment, your website goes live on the agreed domain.']
        ]
      },
      'contact.html': {
        label: 'What happens after you enquire',
        title: 'Your enquiry turns into clear next steps for your business.',
        steps: [
          ['01','Your enquiry','You send your business and website details.'],
          ['02','Your quote','The scope, price and next steps are confirmed with you.'],
          ['03','Your website','Your agreed website is prepared first.'],
          ['04','Your review','You review the working website before payment.'],
          ['05','Your approval','You approve the agreed work and payment follows.'],
          ['06','Customers online','Your approved website goes live on the agreed domain.']
        ]
      }
    };

    const packageConfig = {
      label: 'What you get with this package',
      title: 'You see the real website before payment, then it goes live for customers.',
      steps: [
        ['01','Your package','Your pages, content and agreed features are confirmed.'],
        ['02','Your website','Your agreed website is prepared.'],
        ['03','Every screen','Mobile use and important customer actions are checked.'],
        ['04','Your review','You review the finished website.'],
        ['05','Your approval','You approve the agreed work before payment.'],
        ['06','Customers online','Your approved website goes live on your domain.']
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
          <div class="flow-browser-bar"><i></i><i></i><i></i><span>spirit2k5 / your website</span></div>
          <div class="flow-screen" data-scene="brief">
            <div class="flow-screen-label">01</div>
            <strong>Your business</strong>
            <div class="flow-stage-art">
              <div class="art-brief">
                <div class="brief-card"><b>YOUR WEBSITE GOALS</b><i></i><i></i><i></i><span>goals confirmed ✓</span></div>
              </div>
              <div class="art-design">
                <div class="wireframe-nav"></div><div class="wireframe-hero"></div>
                <div class="wireframe-grid"><i></i><i></i><i></i></div>
              </div>
              <div class="art-code">
                <span>YOUR WEBSITE</span><span>clear services</span><span>easy contact</span><span>mobile friendly</span><span>ready for customers</span><span>yourbusiness.co.za</span><b></b>
              </div>
              <div class="art-test">
                <div class="device desktop"><i></i></div><div class="device tablet"><i></i></div><div class="device phone"><i></i></div>
                <span class="test-check">Looks good on every screen ✓</span>
              </div>
              <div class="art-review">
                <div class="review-site"><i></i><i></i><i></i></div>
                <div class="review-comment one">Your feedback</div><div class="review-comment two">✓ Updated for you</div>
              </div>
              <div class="art-pay">
                <div class="payment-card"><small>YOU APPROVED IT</small><b>Payment</b><span>✓ confirmed</span></div>
              </div>
              <div class="art-deploy">
                <div class="deploy-code">YOUR WEBSITE</div><span class="deploy-arrow">→</span><div class="deploy-cloud">YOUR DOMAIN</div><span class="deploy-arrow">→</span><div class="deploy-live">● READY FOR CUSTOMERS</div>
              </div>
              <div class="art-domain">
                <div class="domain-chip">yourbusiness.co.za</div><div class="dns-line"></div><div class="domain-server">YOUR DOMAIN</div><div class="dns-line"></div><div class="domain-live">● READY FOR CUSTOMERS</div>
              </div>
              <div class="art-wordpress">
                <div class="wp-admin-mini">
                  <div class="wp-side"><b>WP</b><i></i><i></i><i></i><i></i></div>
                  <div class="wp-main-mini"><span>Your website</span><strong>Homepage</strong><em>Ready to review</em><div class="wp-blocks"><i></i><i></i><i></i></div></div>
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
      if (/customers online|ready for customers|go live|launch|live/.test(value)) return 'deploy';
      if (/approval|pay|payment/.test(value)) return 'pay';
      if (/review|feedback|changes/.test(value)) return 'review';
      if (/every screen|customer action|customer journey|details/.test(value)) return 'test';
      if (/wordpress|setup/.test(value)) return 'wordpress';
      if (/look|journey|pages/.test(value)) return 'design';
      if (/website/.test(value)) return 'code';
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
    if (document.documentElement.dataset.spiritTrackingBound !== '1') {
      document.documentElement.dataset.spiritTrackingBound = '1';
      document.addEventListener('click', event => {
        const anchor = event.target.closest('a[href]');
        if (!anchor) return;
        const href = anchor.href || '';
        const text = (anchor.textContent || '').trim().toLowerCase();
        if (href === 'https://search.google.com/local/writereview?placeid=ChIJ2xvi1PahlR4RscgChP2mlp0') trackEvent('google_review_click', href);
        else if (/wa\.me\/27781888220/.test(href)) trackEvent('whatsapp_click', href);
        else if (href.startsWith('tel:')) trackEvent('phone_click', href);
        else if (href.startsWith('mailto:')) trackEvent('email_click', href);
        else if (href.includes('contact.html#project-form') || text.includes('start a project') || text.includes('start this project')) trackEvent('start_project_click', href);
        else if (href.includes('free-website-check.html')) trackEvent('free_check_click', href);
        else if (href.includes('pricing.html')) trackEvent('pricing_click', href);
        else if (href.includes('portfolio.html') || href.includes('case-study-')) trackEvent('portfolio_click', href);
        else if (/^https:\/\//.test(href) && !href.includes('spirit2k5.co.za')) trackEvent('live_site_click', href);
      }, { capture: true });
    }
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
    if (footer && !footer.querySelector('[data-google-review-link]')) {
      const contactBlock = [...footer.children].find(el => el.querySelector && el.querySelector('h4')?.textContent.trim() === 'Contact');
      if (contactBlock) {
        const review = document.createElement('a');
        review.href = 'https://search.google.com/local/writereview?placeid=ChIJ2xvi1PahlR4RscgChP2mlp0';
        review.target = '_blank';
        review.rel = 'noopener';
        review.dataset.googleReviewLink = '1';
        review.textContent = 'Review Spirit2k5 on Google ↗';
        contactBlock.appendChild(review);
      }
    }
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
    trackEvent('page_view', location.pathname);
    if (currentPageName() === 'pricing.html') trackEvent('pricing_view', location.pathname);
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
