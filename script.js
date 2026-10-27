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

  // Bound both the network request and its response body; a stalled service must
  // not leave a customer waiting indefinitely or prevent the other route working.
  const requestJSON = async (url, options = {}, timeoutMs = 10000) => {
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        fetch(url, { ...options, signal: controller.signal }).then(async response => ({
          ok: response.ok,
          data: await response.json().catch(() => ({}))
        })),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error('Request timed out'));
          }, timeoutMs);
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
  };

  const sendToCollector = async payload => {
    try {
      const response = await requestJSON(SPIRIT_COLLECT_URL, {
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

  const firstSuccessfulRoute = routes => new Promise(resolve => {
    let remaining = routes.length;
    if (!remaining) { resolve({ ok: false, route: '' }); return; }
    routes.forEach(([route, request]) => {
      Promise.resolve(request).catch(() => false).then(ok => {
        if (ok) resolve({ ok: true, route });
        else if (--remaining === 0) resolve({ ok: false, route: '' });
      });
    });
  });

  const enquiryContactLinks = data => {
    const names = ['Name', 'Business', 'Email', 'Phone', 'Project type', 'Budget', 'Timeline', 'Existing site', 'Project details'];
    const details = names.map(name => [name, String(data.get(name) || '').trim()])
      .filter(([, value]) => value).map(([name, value]) => name + ': ' + value).join('\n');
    const message = 'Hi Carlton, here is my Spirit2k5 project enquiry.\n\n' + details;
    return {
      whatsapp: 'https://wa.me/27781888220?text=' + encodeURIComponent(message),
      email: 'mailto:mahloricarlton@gmail.com?subject=' + encodeURIComponent('Spirit2k5 website project enquiry') + '&body=' + encodeURIComponent(message)
    };
  };

  const safeTrackingTarget = target => {
    const value = String(target || '');
    // Contact links can carry private enquiry details in their query strings.
    // Keep only the destination; conversion records never need those details.
    if (/^(mailto:|tel:)/i.test(value)) return value.split(/[?#]/, 1)[0].slice(0, 500);
    try {
      const url = new URL(value);
      if (/^https?:$/.test(url.protocol)) return (url.origin + url.pathname).slice(0, 500);
    } catch (_) {}
    return value.slice(0, 500);
  };

  const trackEvent = (eventName, target = '') => {
    const payload = {
      type: 'event',
      event_name: eventName,
      target: safeTrackingTarget(target),
      ...getTrackingContext()
    };
    sendToCollector(payload);
  };
  window.spirit2k5TrackEvent = trackEvent;


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
  let activeFlowTimer = null;

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
    const currentUrl = new URL(url, location.href);
    const packagePages = ['starter-website.html','business-website.html','ecommerce-website.html','custom-web-app.html'];
    const servicePages = ['wordpress.html'];
    document.querySelectorAll('.nav a').forEach(a => {
      const href = a.getAttribute('href') || '';
      if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      const hrefUrl = new URL(href, location.href);
      if (hrefUrl.pathname === '/faremap' || hrefUrl.pathname.startsWith('/faremap/')) {
        a.classList.toggle('active', currentUrl.pathname === '/faremap' || currentUrl.pathname.startsWith('/faremap/'));
        return;
      }
      const hrefPage = currentPageName(hrefUrl.href);
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
    revealObserver = null;
    const elements = [...document.querySelectorAll('main .reveal')];
    const show = el => {
      el.classList.add('visible');
      el.classList.remove('reveal-pending');
    };
    try {
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || typeof window.IntersectionObserver !== 'function') {
        elements.forEach(show);
        return;
      }
      const observer = new window.IntersectionObserver(entries => {
        if (revealObserver !== observer) return;
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            show(entry.target);
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.10, rootMargin: '0px 0px -30px 0px' });
      revealObserver = observer;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      elements.forEach(el => {
        const bounds = el.getBoundingClientRect();
        if (el.classList.contains('visible') || el.matches('.hero, .page-hero, .about-hero, .contact-hero') || (bounds.top < viewportHeight && bounds.bottom > 0)) {
          show(el);
        } else {
          el.classList.add('reveal-pending');
          observer.observe(el);
        }
      });
    } catch (_) {
      if (revealObserver) revealObserver.disconnect();
      revealObserver = null;
      elements.forEach(show);
    }
  };

  let videoObserver = null;
  let activeVideos = [];
  let videoMotion = null;
  let videoMotionChange = null;

  // Video URLs stay deferred until the video enters the viewport. Native controls
  // remain available when autoplay is disabled or reduced motion is requested.
  const initVideos = () => {
    if (videoObserver) videoObserver.disconnect();
    activeVideos.forEach(video => { video.dataset.autoPaused = '1'; video.pause(); });
    if (videoMotion && videoMotionChange) videoMotion.removeEventListener?.('change', videoMotionChange);
    activeVideos = [...document.querySelectorAll('main video')];
    videoMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)') || { matches: false };
    videoObserver = null;
    const loadVideo = video => {
      let changed = false;
      [video, ...video.querySelectorAll('source[data-src]')].forEach(source => {
        if (!source.dataset.src) return;
        source.setAttribute('src', source.dataset.src);
        delete source.dataset.src;
        changed = true;
      });
      if (changed) video.load();
    };
    const update = video => {
      if (video.dataset.inViewport !== '1' || document.hidden) {
        video.dataset.autoPaused = '1';
        video.pause();
        return;
      }
      if (!videoMotion.matches) loadVideo(video);
      if (!videoMotion.matches && video.dataset.autoplay === 'true' && video.dataset.userPaused !== '1') {
        delete video.dataset.autoPaused;
        video.dataset.autoPlaying = '1';
        video.play().catch(() => { delete video.dataset.autoPlaying; });
      } else if (videoMotion.matches && video.dataset.userPlaying !== '1') {
        video.dataset.autoPaused = '1';
        video.pause();
      }
    };
    activeVideos.forEach(video => {
      video.muted = true;
      video.defaultMuted = true;
      video.volume = 0;
      video.playsInline = true;
      video.controls = true;
      if (video.hasAttribute('autoplay')) video.dataset.autoplay = 'true';
      video.removeAttribute('autoplay');
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      // A deferred video with reduced motion still needs a direct play action.
      video._spiritLoad = () => loadVideo(video);
      if (video.dataset.videoBound !== '1') {
        video.dataset.videoBound = '1';
        video.addEventListener('pointerdown', () => video._spiritLoad(), { passive: true });
        video.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') video._spiritLoad();
        });
        video.addEventListener('play', () => {
          delete video.dataset.userPaused;
          delete video.dataset.autoPaused;
          if (video.dataset.autoPlaying !== '1') video.dataset.userPlaying = '1';
          delete video.dataset.autoPlaying;
        });
        video.addEventListener('pause', () => {
          if (video.dataset.autoPaused !== '1' && video.dataset.inViewport === '1') {
            video.dataset.userPaused = '1';
            delete video.dataset.userPlaying;
          }
          delete video.dataset.autoPaused;
        });
      }
      video.dataset.inViewport = '0';
    });
    try {
      if (typeof window.IntersectionObserver === 'function') {
        const observer = new window.IntersectionObserver(entries => {
          if (videoObserver !== observer) return;
          entries.forEach(entry => {
            entry.target.dataset.inViewport = entry.isIntersecting ? '1' : '0';
            update(entry.target);
          });
        }, { threshold: 0.05 });
        videoObserver = observer;
        activeVideos.forEach(video => videoObserver.observe(video));
      }
    } catch (_) {
      // Observation is an enhancement. Native playback and the enquiry form
      // must remain usable when a browser cannot initialize it.
      videoObserver?.disconnect();
      videoObserver = null;
    }
    videoMotionChange = () => {
      activeVideos.forEach(video => { delete video.dataset.userPlaying; update(video); });
    };
    videoMotion.addEventListener?.('change', videoMotionChange);
    if (!document.documentElement.dataset.videoVisibilityBound) {
      document.documentElement.dataset.videoVisibilityBound = '1';
      document.addEventListener('visibilitychange', () => activeVideos.forEach(video => {
        if (document.hidden) { video.dataset.autoPaused = '1'; video.pause(); }
        else if (!videoMotion.matches && video.dataset.inViewport === '1' && video.dataset.autoplay === 'true' && video.dataset.userPaused !== '1') {
          video.dataset.autoPlaying = '1';
          video.play().catch(() => { delete video.dataset.autoPlaying; });
        }
      }));
    }
  };

  const initProjectWizard = () => {
    const form = document.querySelector('.project-wizard');
    if (!form || form.dataset.bound === '1') return;
    form.dataset.bound = '1';
    const steps = [...form.querySelectorAll('.wizard-step')];
    const dots = [...form.querySelectorAll('.wizard-dot')];
    const line = form.querySelector('.wizard-line i');
    let current = 0;
    let submitting = false;
    let formStarted = false;
    const markFormStarted = () => {
      if (formStarted) return;
      formStarted = true;
      trackEvent('enquiry_form_start', 'project-enquiry-form');
    };
    form.addEventListener('input', markFormStarted, { passive:true });
    form.addEventListener('change', markFormStarted, { passive:true });
    const updateProgress = () => {
      steps.forEach((step, i) => {
        step.classList.toggle('active', i === current);
        step.setAttribute('aria-hidden', String(i !== current));
      });
      dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === current);
        dot.classList.toggle('complete', i < current);
        if (i === current) dot.setAttribute('aria-current', 'step');
        else dot.removeAttribute('aria-current');
      });
      if (line) line.style.width = (current / Math.max(1, steps.length - 1) * 100) + '%';
    };
    const show = index => {
      if (index < 0 || index >= steps.length || submitting) return;
      current = index;
      updateProgress();
      const heading = steps[current].querySelector('h2');
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
      form.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    };
    const validStep = () => {
      const required = [...steps[current].querySelectorAll('[required]')];
      for (const field of required) if (!field.reportValidity()) return false;
      return true;
    };
    const advance = () => {
      if (!submitting && validStep() && current < steps.length - 1) {
        markFormStarted();
        trackEvent('enquiry_step', 'step-' + (current + 1) + '-complete');
        show(current + 1);
      }
    };
    const validForm = () => {
      for (let index = 0; index < steps.length; index++) {
        const invalid = [...steps[index].querySelectorAll('[required]')].find(field => !field.checkValidity());
        if (invalid) {
          show(index);
          invalid.focus({ preventScroll: true });
          invalid.reportValidity();
          return false;
        }
      }
      return true;
    };
    updateProgress();
    form.querySelectorAll('.wizard-next').forEach(btn => btn.addEventListener('click', advance));
    form.querySelectorAll('.wizard-back').forEach(btn => btn.addEventListener('click', () => show(current - 1)));
    dots.forEach((dot,i) => dot.addEventListener('click', () => {
      if (i < current || (i === current + 1 && validStep())) show(i);
    }));
    form.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.isComposing && event.target.tagName === 'INPUT' && current < steps.length - 1) {
        event.preventDefault();
        advance();
      }
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (submitting) return;
      // Browsers may implicitly submit when Enter is pressed in an early step.
      if (current < steps.length - 1) { advance(); return; }
      if (!validForm()) return;
      submitting = true;
      form.setAttribute('aria-busy', 'true');
      const data = new FormData(form);
      const subject = 'New website project enquiry — ' + (data.get('Business') || data.get('Name') || 'Spirit2k5');
      const button = form.querySelector('.send-enquiry');
      const success = form.querySelector('.enquiry-success');
      const originalButton = button ? button.innerHTML : '';
      const contactLinks = enquiryContactLinks(data);
      const showResult = (received, route = '') => {
        if (!success) return;
        const title = success.querySelector('b');
        const copy = success.querySelector('p');
        if (title) title.textContent = received ? 'Enquiry received' : 'Send your enquiry directly';
        if (copy) copy.textContent = received
          ? (route === 'stored' ? 'Your project details were saved. You can also follow up using the links below.' : 'Your project details were submitted. You can also follow up using the links below.')
          : 'The form could not confirm delivery. Your details are still here. Send them using WhatsApp or email below.';
        success.querySelector('.enquiry-fallback')?.remove();
        const links = document.createElement('div');
        links.className = 'enquiry-fallback';
        [['WhatsApp your enquiry', contactLinks.whatsapp, 'whatsapp'], ['Email your enquiry', contactLinks.email, 'email']].forEach(([label, href, method]) => {
          const anchor = document.createElement('a');
          anchor.textContent = label;
          anchor.href = href;
          if (method === 'whatsapp') { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; }
          anchor.addEventListener('click', () => trackEvent(method === 'whatsapp' ? 'enquiry_fallback_whatsapp' : 'enquiry_fallback_email', received ? 'enquiry-followup' : 'form-failed'));
          links.appendChild(anchor);
        });
        (success.querySelector('div') || success).appendChild(links);
        success.classList.add('show');
        if (title) { title.tabIndex = -1; title.focus({ preventScroll: true }); }
      };
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

        const delivery = await firstSuccessfulRoute([
          ['stored', sendToCollector(leadPayload)],
          ['email', requestJSON('https://formsubmit.co/ajax/mahloricarlton@gmail.com', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(payload)
          }).then(response => response.ok && (response.data.success === true || response.data.success === 'true'))]
        ]);

        if (!delivery.ok) throw new Error('Unable to confirm delivery');
        trackEvent('enquiry_success', delivery.route);
        showResult(true, delivery.route);
        form.reset();
      } catch (error) {
        showResult(false);
      } finally {
        submitting = false;
        form.setAttribute('aria-busy', 'false');
        if (button) {
          button.disabled = false;
          button.innerHTML = originalButton;
        }
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
    main.querySelectorAll('.case-media, .about-portrait, .media-card, .page-hero > img').forEach(el => {
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
        if (e.target !== el) return;
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
    if (!main) return;
    const existingFlow = main.querySelector('.work-flow-animation');
    if (existingFlow) {
      if (typeof existingFlow._resumeFlow === 'function') existingFlow._resumeFlow();
      return;
    }

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
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
      timer = setInterval(() => activate((current + 1) % cfg.steps.length), 3200);
      activeFlowTimer = timer;
    };
    section._resumeFlow = restartAuto;

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
    window.spiritEnhanceSocials?.();
    trackEvent('page_view', location.pathname);
    if (currentPageName() === 'pricing.html') trackEvent('pricing_view', location.pathname);
    updateActiveNav();
    const nav = document.querySelector('.nav');
    const btn = document.querySelector('.menu-btn');
    if (nav) nav.classList.remove('open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  };

  // Page metadata travels with the main content, including cached Back/Forward visits.
  // Verification tags, styles, icons and executable global scripts stay in place.
  const headSelectors = [
    'meta[name="description"]', 'meta[name="keywords"]',
    'meta[name="robots"]', 'meta[name="googlebot"]', 'meta[name="bingbot"]',
    'link[rel="canonical"]', 'link[rel="alternate"][hreflang]',
    'meta[property^="og:"]', 'meta[name^="twitter:"]',
    'script[type="application/ld+json"]'
  ];
  const captureHead = (sourceDoc = document) => {
    const seen = new Set();
    const nodes = [...sourceDoc.head.querySelectorAll(headSelectors.join(','))].filter(node => {
      const attributes = [...node.attributes].map(attr => [attr.name, attr.value]).sort((a, b) => a[0].localeCompare(b[0]));
      const key = JSON.stringify([node.tagName, attributes, node.textContent.trim()]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(node => node.cloneNode(true));
    return { title: sourceDoc.title, nodes };
  };
  const restoreHead = snapshot => {
    if (!snapshot) return;
    document.title = snapshot.title;
    document.head.querySelectorAll(headSelectors.join(',')).forEach(node => node.remove());
    snapshot.nodes.forEach(node => document.head.appendChild(document.importNode(node, true)));
  };
  const copyHeadMetadata = nextDoc => restoreHead(captureHead(nextDoc));


  // Browser history is an in-page visit stack, not a reason to re-download and reset a page.
  const routeHTML = new Map();
  const historyPages = new Map();
  const scrollPositions = new Map();
  let activePageUrl = location.href;
  let activeEntryId = history.state?.spiritEntryId || '';
  let navigationSerial = 0;
  let navigationController = null;
  let scrollSaveTimer = null;
  const newEntryId = () => 'spirit-' + (crypto.randomUUID?.() || (Date.now() + '-' + Math.random().toString(36).slice(2)));
  if (!activeEntryId) activeEntryId = newEntryId();
  const entryScroll = Number.isFinite(history.state?.spiritScrollY)
    ? history.state.spiritScrollY : window.scrollY;
  const makeState = (id, y = 0) => ({
    ...(history.state || {}), spiritSoftNav: true, spiritEntryId: id, spiritScrollY: y
  });
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  history.replaceState(makeState(activeEntryId, entryScroll), '', location.href);
  scrollPositions.set(activeEntryId, entryScroll);

  const documentKey = url => {
    const u = new URL(url, location.href);
    return u.pathname + u.search;
  };
  const retainPage = (id, url, main, head = null) => {
    const previous = historyPages.get(id);
    historyPages.delete(id);
    historyPages.set(id, { url, main, head: head || previous?.head || null });
    while (historyPages.size > 12) {
      const oldest = historyPages.keys().next().value;
      if (oldest === activeEntryId) break;
      historyPages.delete(oldest);
    }
  };
  retainPage(activeEntryId, activePageUrl, document.querySelector('main'), captureHead());
  const restorePosition = y => {
    const root = document.documentElement, old = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, Math.max(0, Number(y) || 0));
    requestAnimationFrame(() => { root.style.scrollBehavior = old; });
  };
  const rememberScroll = (persist = false) => {
    const y = Math.max(0, Math.round(window.scrollY));
    scrollPositions.set(activeEntryId, y);
    if (persist && history.state?.spiritEntryId === activeEntryId) {
      history.replaceState({ ...history.state, spiritScrollY: y }, '', location.href);
    }
  };
  window.addEventListener('scroll', () => {
    rememberScroll();
    if (scrollSaveTimer) return;
    scrollSaveTimer = setTimeout(() => {
      scrollSaveTimer = null;
      rememberScroll(true);
    }, 150);
  }, { passive: true });
  window.addEventListener('pagehide', () => rememberScroll(true));
  window.addEventListener('pageshow', e => {
    const kind = performance.getEntriesByType?.('navigation')?.[0]?.type;
    if (e.persisted || kind === 'back_forward' || kind === 'reload') {
      const y = scrollPositions.get(activeEntryId) ?? history.state?.spiritScrollY ?? 0;
      requestAnimationFrame(() => restorePosition(y));
    }
  });
  const scrollToHash = hash => {
    if (!hash || hash === '#') return false;
    let target = null;
    try { target = document.getElementById(decodeURIComponent(hash.slice(1))); } catch (_) {}
    if (!target) return false;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  };

  const navigate = async (targetUrl, { push = true, targetState = null } = {}) => {
    const url = new URL(targetUrl, location.href);
    if (location.protocol === 'file:') { location.href = url.href; return; }
    const serial = ++navigationSerial;
    if (navigationController) navigationController.abort();
    navigationController = new AbortController();

    // Same document / fragment navigation should not touch the page DOM or fetch.
    if (documentKey(url.href) === documentKey(activePageUrl)) {
      if (push) {
        if (url.href === activePageUrl && !url.hash) { restorePosition(0); return; }
        rememberScroll(true);
        const id = newEntryId();
        history.pushState(makeState(id), '', url.href);
        activeEntryId = id;
        activePageUrl = url.href;
        retainPage(id, activePageUrl, document.querySelector('main'), captureHead());
        scrollPositions.set(id, 0);
        if (!scrollToHash(url.hash)) restorePosition(0);
      } else {
        activeEntryId = targetState?.spiritEntryId || newEntryId();
        activePageUrl = url.href;
        if (!targetState?.spiritEntryId) history.replaceState(makeState(activeEntryId), '', url.href);
        const y = scrollPositions.get(activeEntryId) ?? targetState?.spiritScrollY ?? 0;
        restorePosition(y);
        requestAnimationFrame(() => restorePosition(y));
      }
      return;
    }

    const id = push ? newEntryId() : (targetState?.spiritEntryId || newEntryId());
    const cachedPage = push ? null : historyPages.get(id);
    let nextMain = cachedPage && documentKey(cachedPage.url) === documentKey(url.href)
      ? cachedPage.main : null;
    let nextDoc = null;
    setRouteLoading('start');
    try {
      if (!nextMain) {
        const key = documentKey(url.href);
        const cache = routeHTML.get(key);
        let html = cache && Date.now() - cache.time < 300000 ? cache.html : null;
        if (!html) {
          const response = await fetch(url.href, {
            credentials: 'same-origin', cache: 'default', signal: navigationController.signal
          });
          if (!response.ok) throw new Error(`Navigation failed: ${response.status}`);
          html = await response.text();
          routeHTML.delete(key);
          routeHTML.set(key, { html, time: Date.now() });
          if (routeHTML.size > 16) routeHTML.delete(routeHTML.keys().next().value);
        }
        if (serial !== navigationSerial) return;
        nextDoc = new DOMParser().parseFromString(html, 'text/html');
        nextMain = nextDoc.querySelector('main');
        if (!nextMain) throw new Error('Page main content missing');
      }
      if (serial !== navigationSerial) return;

      const swap = () => {
        const oldMain = document.querySelector('main');
        if (!oldMain) throw new Error('Current page main missing');
        rememberScroll(true);
        retainPage(activeEntryId, activePageUrl, oldMain, captureHead());
        if (activeFlowTimer) clearInterval(activeFlowTimer);
        activeFlowTimer = null;
        oldMain.replaceWith(nextMain);
        if (nextDoc) copyHeadMetadata(nextDoc);
        else restoreHead(cachedPage?.head);
        if (push) history.pushState(makeState(id), '', url.href);
        else if (!targetState?.spiritEntryId) history.replaceState(makeState(id), '', url.href);
        activeEntryId = id;
        activePageUrl = url.href;
        retainPage(id, url.href, nextMain, captureHead());
        initPage();
        const y = push ? 0 : (scrollPositions.get(id) ?? targetState?.spiritScrollY ?? 0);
        restorePosition(y);
        if (push && url.hash) requestAnimationFrame(() => scrollToHash(url.hash));
        else requestAnimationFrame(() => restorePosition(y));
      };
      if (push && document.startViewTransition &&
          !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        await document.startViewTransition(swap).finished.catch(() => {});
      } else {
        swap();
      }
      if (serial === navigationSerial) setRouteLoading('done');
    } catch (error) {
      if (serial !== navigationSerial || error.name === 'AbortError') return;
      console.warn('[Spirit2k5] Navigation fallback:', error);
      location.assign(url.href);
    }
  };

  document.addEventListener('click', event => {
    const anchor = event.target.closest('a[href]');
    if (!anchor || event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if ((anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return;
    const raw = anchor.getAttribute('href') || '';
    if (!raw || /^(mailto:|tel:|javascript:)/i.test(raw)) return;
    const url = new URL(anchor.href, location.href);
    if (url.origin !== location.origin) return;

    // Standalone FareMap uses a different runtime/authentication lifecycle.
    if (url.pathname === '/faremap' || url.pathname.startsWith('/faremap/')) return;
    if (raw.startsWith('#') || (url.pathname === location.pathname && url.hash)) {
      event.preventDefault();
      void navigate(url.href);
      return;
    }
    const file = currentPageName(url.href).toLowerCase();
    if (file.endsWith('.html') || url.pathname.endsWith('/')) {
      event.preventDefault();
      void navigate(url.href);
    }
  });
  window.addEventListener('popstate', event => {
    // Browser URL changes before popstate; store the outgoing position in memory.
    rememberScroll();
    void navigate(location.href, { push: false, targetState: event.state });
  });


  initPage();
})();


/* SPIRIT2K5 CUSTOMER ASSISTANT */
(() => {
  'use strict';

  const ENDPOINT = 'https://vpgexijihrozwugqqagy.supabase.co/functions/v1/spirit2k5-ai-chat';
  const WHATSAPP = 'https://wa.me/27781888220?text=' + encodeURIComponent('Hi Carlton, I would like to discuss a website project.');
  const PROJECT = 'https://spirit2k5.co.za/contact.html#project-form';
  const track = (name,target='') => {
    try { if (typeof window.spirit2k5TrackEvent === 'function') window.spirit2k5TrackEvent(name,target); } catch (_) {}
  };

  const ready = (fn) => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once:true });
    else fn();
  };

  const getSession = () => {
    try {
      let id = sessionStorage.getItem('spirit2k5_ai_session') || '';
      if (!id) {
        id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
        sessionStorage.setItem('spirit2k5_ai_session', id);
      }
      return id;
    } catch (_) {
      return String(Date.now()) + '-' + Math.random().toString(36).slice(2);
    }
  };

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (typeof text === 'string') node.textContent = text;
    return node;
  };

  const setAssistantOpen = (panel, launcher, input, open) => {
    clearTimeout(panel._focusTimer);
    panel.hidden = !open;
    panel.inert = !open;
    panel.style.display = open ? '' : 'none';
    panel.classList.toggle('open', open);
    panel.setAttribute('aria-hidden', String(!open));
    launcher.setAttribute('aria-expanded', String(open));
    if (open) panel._focusTimer = setTimeout(() => { if (!panel.hidden) input.focus(); }, 120);
    else launcher.focus({ preventScroll: true });
  };

  // The standalone assistant bounds its request and response body. A failed
  // question is retried only when the customer chooses Send again.
  const requestAssistant = async (question, sessionId, timeoutMs = 12000) => {
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ question, session_id: sessionId })
        }).then(async response => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok && !data?.answer) throw new Error('assistant_unavailable');
          return data;
        }),
        new Promise((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error('assistant_timeout')); }, timeoutMs);
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
  };

  ready(() => {
    if (document.getElementById('spirit-ai-launcher')) return;

    const launcher = el('button','spirit-ai-launcher');
    launcher.id = 'spirit-ai-launcher';
    launcher.type = 'button';
    launcher.setAttribute('aria-label','Open Spirit2k5 Customer Assistant');
    launcher.setAttribute('aria-expanded','false');
    const launchLogo = document.createElement('img');
    launchLogo.src = 'assets/logo-mark.svg';
    launchLogo.alt = '';
    launchLogo.width = 32;
    launchLogo.height = 32;
    launcher.appendChild(launchLogo);
    launcher.appendChild(el('span','spirit-ai-launcher-label','Need help?'));

    const panel = el('section','spirit-ai-panel');
    panel.id = 'spirit-ai-panel';
    panel.hidden = true;
    panel.inert = true;
    panel.style.display = 'none';
    panel.setAttribute('aria-label','Spirit2k5 Customer Assistant');
    panel.setAttribute('aria-hidden','true');

    const head = el('div','spirit-ai-head');
    const brand = el('div','spirit-ai-brand');
    const brandLogo = document.createElement('img');
    brandLogo.src = 'assets/logo-mark.svg';
    brandLogo.alt = '';
    brandLogo.width = 34;
    brandLogo.height = 34;
    const brandCopy = el('div','');
    const title = el('strong','', 'Spirit2k5 Customer Assistant');
    const status = el('small','', 'Website help • customer support');
    brandCopy.append(title,status);
    brand.append(brandLogo,brandCopy);
    const close = el('button','spirit-ai-close','×');
    close.type='button';
    close.setAttribute('aria-label','Close assistant');
    head.append(brand,close);

    const body = el('div','spirit-ai-body');
    body.setAttribute('role','log');
    body.setAttribute('aria-live','polite');

    const greeting = el('div','spirit-ai-message spirit-ai-bot');
    greeting.appendChild(el('p','', 'Hi 👋 How can we help your business today?'));
    body.appendChild(greeting);

    const quick = el('div','spirit-ai-quick');
    const quickItems = [
      ['I need a website','How do I start a project?'],
      ['View pricing','What are your website starting prices?'],
      ['WordPress','Do you build WordPress websites?'],
      ['Online store','What can an e-commerce website include?'],
      ['Redesign my website','Can you redesign my existing website?'],
      ['See your work','Can I see your work?'],
      ['How payment works','Do I need to pay upfront?'],
      ['Talk to someone','How can I contact Spirit2k5?']
    ];
    quickItems.forEach(([label,q]) => {
      const b=el('button','spirit-ai-chip',label);
      b.type='button';
      b.dataset.question=q;
      quick.appendChild(b);
    });

    const footer = el('div','spirit-ai-footer');
    const note = el('div','spirit-ai-note','Answers check Spirit2k5 website information first.');
    const form = el('form','spirit-ai-form');
    const input = document.createElement('textarea');
    input.className='spirit-ai-input';
    input.rows=1;
    input.maxLength=800;
    input.placeholder='Ask about websites, pricing, WordPress…';
    input.setAttribute('aria-label','Ask Spirit2k5 a question');
    const send=el('button','spirit-ai-send','Send');
    send.type='submit';
    form.append(input,send);

    const actions = el('div','spirit-ai-actions');
    const project = el('a','spirit-ai-action-primary','Start a project');
    project.href=PROJECT;
    const whatsapp = el('a','spirit-ai-action','WhatsApp');
    whatsapp.href=WHATSAPP;
    whatsapp.target='_blank';
    whatsapp.rel='noopener';
    project.addEventListener('click',()=>track('ai_project_click','start-project'));
    whatsapp.addEventListener('click',()=>track('ai_whatsapp_click','whatsapp'));
    actions.append(project,whatsapp);
    footer.append(note,form,actions);

    panel.append(head,body,quick,footer);
    document.body.append(panel,launcher);

    let busy=false;
    const openPanel=()=>setAssistantOpen(panel,launcher,input,true);
    const closePanel=()=>setAssistantOpen(panel,launcher,input,false);

    launcher.addEventListener('click',()=>{
      if (panel.classList.contains('open')) closePanel();
      else { track('ai_open','launcher'); openPanel(); }
    });
    close.addEventListener('click',closePanel);
    document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&panel.classList.contains('open')) closePanel(); });

    const addMessage=(text,who='bot',meta=null)=>{
      const wrap=el('div','spirit-ai-message '+(who==='user'?'spirit-ai-user':'spirit-ai-bot'));
      wrap.appendChild(el('p','',text));
      if(meta?.source_url){
        const a=el('a','spirit-ai-source','Read more →');
        a.href=meta.source_url;
        a.target='_self';
        a.addEventListener('click',()=>track('ai_source_click',meta.source_url));
        wrap.appendChild(a);
      }
      if(meta?.contact_url && !meta?.source_url){
        const a=el('a','spirit-ai-source','Ask on WhatsApp →');
        a.href=meta.contact_url;
        a.target='_blank';
        a.rel='noopener';
        a.addEventListener('click',()=>track('ai_whatsapp_click','answer-contact'));
        wrap.appendChild(a);
      }
      body.appendChild(wrap);
      body.scrollTop=body.scrollHeight;
    };

    const setBusy=(state)=>{
      busy=state;
      input.disabled=state;
      send.disabled=state;
      send.textContent=state?'Checking…':'Send';
    };

    const ask=async(question)=>{
      question=String(question||'').trim().slice(0,800);
      if(!question||busy)return;
      openPanel();
      addMessage(question,'user');
      track('ai_question','submitted');
      setBusy(true);
      let answered=false;
      try{
        const data=await requestAssistant(question,getSession());
        addMessage(data.answer||'I could not confirm that right now. Please contact Spirit2k5 directly.','bot',data);
        answered=true;
        track('ai_answer',[data.layer||'unknown',data.ai_provider||'local',data.learned_status||''].filter(Boolean).join('|'));
      }catch(_){
        addMessage('I could not reach the website assistant right now. Your question is still in the box so you can try again, or contact Spirit2k5 on WhatsApp.','bot',{contact_url:WHATSAPP});
      }finally{
        setBusy(false);
        input.value=answered?'':question;
        input.style.height='';
        if (!panel.hidden) input.focus();
      }
    };

    quick.addEventListener('click',e=>{
      const b=e.target.closest('button[data-question]');
      if(b) ask(b.dataset.question);
    });

    form.addEventListener('submit',e=>{
      e.preventDefault();
      ask(input.value);
    });

    input.addEventListener('keydown',e=>{
      if(e.key==='Enter'&&!e.shiftKey){
        e.preventDefault();
        form.requestSubmit();
      }
    });
    input.addEventListener('input',()=>{
      input.style.height='auto';
      input.style.height=Math.min(input.scrollHeight,110)+'px';
    });
  });
})();


/* Load Studio action animations once for every public studio page.
 * Separate from FareMap's own app/HUD and the private assistant admin page. */
(() => {
  if (document.querySelector('script[data-spirit-action-icons]')) return;
  const icons = document.createElement('script');
  icons.src = '/studio-action-icons.js?v=20261021-icons1';
  icons.defer = true;
  icons.dataset.spiritActionIcons = '1';
  document.head.appendChild(icons);
})();


/* Social logo links — loaded on every public Studio page. */
(() => {
  if (document.querySelector('script[data-spirit-social]')) return;
  if (!document.querySelector('link[data-spirit-social-style]')) {
    const sheet = document.createElement('link');
    sheet.rel = 'stylesheet';
    sheet.href = '/studio-social.css?v=20261021-social1';
    sheet.dataset.spiritSocialStyle = '1';
    document.head.appendChild(sheet);
  }
  const script = document.createElement('script');
  script.src = '/studio-social.js?v=20261021-social1';
  script.dataset.spiritSocial = '1';
  document.head.appendChild(script);
})();
