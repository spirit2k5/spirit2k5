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

  const initPage = () => {
    initMenu();
    initReveal();
    initVideos();
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

  // Soft navigation: swap only <main>. Header + music player remain alive, so music never restarts.
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

  // Persistent site-entry music. Because soft navigation never destroys this node, playback is seamless between pages.
  const initMusic = () => {
    if (document.getElementById('spirit-site-audio')) return;

    const KEY_TIME = 'spirit2k5MusicTime';
    const KEY_ENDED = 'spirit2k5MusicEnded';
    const KEY_PAUSED = 'spirit2k5MusicUserPaused';

    const audio = document.createElement('audio');
    audio.id = 'spirit-site-audio';
    audio.src = 'assets/spirit2k5-entry-track.mp3';
    audio.preload = 'auto';
    audio.playsInline = true;
    audio.volume = 0.62;
    audio.setAttribute('aria-hidden', 'true');
    document.body.appendChild(audio);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'site-music-toggle';
    button.setAttribute('aria-label', 'Toggle site music');
    document.body.appendChild(button);

    const saved = Number.parseFloat(sessionStorage.getItem(KEY_TIME) || '0');
    if (Number.isFinite(saved) && saved > 0) {
      audio.addEventListener('loadedmetadata', () => {
        if (saved < audio.duration - .5) audio.currentTime = saved;
      }, { once: true });
    }

    const saveTime = () => {
      if (Number.isFinite(audio.currentTime)) sessionStorage.setItem(KEY_TIME, String(audio.currentTime));
    };

    const updateButton = () => {
      if (sessionStorage.getItem(KEY_ENDED) === '1') {
        button.textContent = '♫ Track finished';
        return;
      }
      button.textContent = audio.paused ? '♫ Play music' : '♫ Music on';
    };

    audio.addEventListener('play', () => {
      sessionStorage.setItem(KEY_PAUSED, '0');
      button.classList.remove('needs-gesture');
      updateButton();
    });
    audio.addEventListener('pause', updateButton);
    audio.addEventListener('ended', () => {
      sessionStorage.setItem(KEY_ENDED, '1');
      sessionStorage.setItem(KEY_TIME, '0');
      updateButton();
    });
    setInterval(saveTime, 1500);
    window.addEventListener('pagehide', saveTime);

    button.addEventListener('click', async () => {
      if (sessionStorage.getItem(KEY_ENDED) === '1') {
        sessionStorage.setItem(KEY_ENDED, '0');
        audio.currentTime = 0;
      }
      if (audio.paused) {
        sessionStorage.setItem(KEY_PAUSED, '0');
        try { await audio.play(); }
        catch { button.classList.add('needs-gesture'); }
      } else {
        sessionStorage.setItem(KEY_PAUSED, '1');
        audio.pause();
        saveTime();
      }
      updateButton();
    });

    const tryStart = async () => {
      if (sessionStorage.getItem(KEY_ENDED) === '1' || sessionStorage.getItem(KEY_PAUSED) === '1') {
        updateButton();
        return;
      }
      try {
        await audio.play();
      } catch {
        button.classList.add('needs-gesture');
        button.textContent = '♫ Tap for music';
      }
    };

    const gestureStart = async () => {
      if (sessionStorage.getItem(KEY_ENDED) === '1' || sessionStorage.getItem(KEY_PAUSED) === '1' || !audio.paused) return;
      try { await audio.play(); } catch {}
    };
    document.addEventListener('pointerdown', gestureStart, { once: true, capture: true });
    document.addEventListener('keydown', gestureStart, { once: true, capture: true });

    updateButton();
    tryStart();
  };

  initPage();
  initMusic();
})();
