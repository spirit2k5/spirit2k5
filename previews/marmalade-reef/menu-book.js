(() => {
  const root = document.querySelector('[data-menu-book]');
  const PageFlip = window.St?.PageFlip;
  if (!root || !PageFlip) return;

  const host = root.querySelector('[data-book-pages]');
  const controls = root.querySelector('[data-book-controls]');
  const previous = root.querySelector('[data-book-prev]');
  const next = root.querySelector('[data-book-next]');
  const open = root.querySelector('[data-book-open]');
  const status = root.querySelector('[data-book-status]');
  if (!host || !controls || !previous || !next || !open || !status) return;

  const pages = Array.from(host.children).filter((page) => page.matches('.book-page'));
  if (pages.length < 4 || pages.length % 2 !== 0) return;

  const chartTargets = new Map();
  for (const link of root.querySelectorAll('a[data-book-target][href^="#"]')) {
    const hash = link.getAttribute('href');
    const heading = document.getElementById(hash.slice(1));
    if (!heading) continue;
    const index = pages.findIndex((page) => page.contains(heading));
    if (index >= 0) chartTargets.set(hash, { hash, heading, index, link });
  }

  const openLabel = open.querySelector('[data-book-open-label]') || open;
  const coverAction = openLabel.textContent.trim();
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const originalHost = host.cloneNode(true);
  const last = pages.length - 1;
  let gesture = null;
  let requestedTarget = null;
  let activeTarget = null;

  const book = new PageFlip(host, {
    width: 400,
    height: 560,
    size: 'stretch',
    minWidth: 320,
    maxWidth: 400,
    minHeight: 1,
    maxHeight: 560,
    showCover: true,
    usePortrait: true,
    autoSize: true,
    drawShadow: true,
    maxShadowOpacity: 0.42,
    flippingTime: 920,
    useMouseEvents: false,
  });

  function syncPage() {
    const index = book.getCurrentPageIndex();
    const layout = book.getOrientation();
    const front = index === 0;
    const back = index === last;
    const facing = layout === 'landscape' && !front && !back;
    const isVisible = (number) => number === index || (facing && number === index + 1);

    if (activeTarget && root.dataset.bookLayout === layout && !isVisible(activeTarget.index)) {
      activeTarget = null;
    }

    root.dataset.bookLayout = layout;
    root.dataset.bookPage = String(index);
    root.dataset.bookPosition = front ? 'front-cover' : back ? 'back-cover' : 'spread';
    previous.setAttribute('aria-disabled', String(front));
    next.setAttribute('aria-disabled', String(back));
    openLabel.textContent = front ? coverAction : 'Back to cover';

    const interiorCount = pages.length - 2;
    let label = `Page ${index} of ${interiorCount}`;
    if (front) label = 'Front cover';
    else if (back) label = 'Back cover';
    else if (facing) label = `Pages ${index}–${index + 1} of ${interiorCount}`;
    if (status.textContent !== label) status.textContent = label;
    status.title = pages.slice(index, index + (facing ? 2 : 1))
      .map((page) => page.dataset.bookTitle).filter(Boolean).join(' · ');

    for (const [number, page] of pages.entries()) {
      const visible = isVisible(number);
      if (!visible && page.contains(document.activeElement)) host.focus({ preventScroll: true });
      page.inert = !visible;
      if (visible) page.removeAttribute('aria-hidden');
      else page.setAttribute('aria-hidden', 'true');
    }
  }

  function adjacentPage(direction) {
    const current = book.getCurrentPageIndex();
    if (book.getOrientation() === 'portrait') return current + direction;
    if (direction === 1) return current === 0 ? 1 : current + 2;
    return current === 1 ? 0 : current - 2;
  }

  function canTurn(direction) {
    const target = adjacentPage(direction);
    return target >= 0 && target <= last;
  }

  function turn(direction, corner = 'bottom') {
    if (book.getState() !== 'read' || !canTurn(direction)) return;
    if (motion.matches) book.turnToPage(adjacentPage(direction));
    else if (direction === 1) book.flipNext(corner);
    else book.flipPrev(corner);
  }

  function jump(index) {
    if (book.getState() === 'read') book.turnToPage(index);
  }

  function revealRequestedTarget() {
    if (!requestedTarget || gesture || book.getState() !== 'read') return;
    const target = requestedTarget;
    requestedTarget = null;
    if (window.location.hash !== target.hash) return;

    activeTarget = target;
    book.turnToPage(target.index);
    // The engine draws the selected spread on the next frame.
    requestAnimationFrame(() => {
      if (activeTarget !== target || window.location.hash !== target.hash) return;
      target.heading.focus({ preventScroll: true });
      target.heading.scrollIntoView({
        block: 'start', inline: 'nearest', behavior: motion.matches ? 'instant' : 'smooth',
      });
    });
  }

  function routeHash() {
    requestedTarget = chartTargets.get(window.location.hash) || null;
    if (!requestedTarget) activeTarget = null;
    revealRequestedTarget();
  }

  book.on('flip', syncPage);
  book.on('changeOrientation', () => {
    if (activeTarget && book.getState() === 'read') book.turnToPage(activeTarget.index);
    else syncPage();
  });
  book.on('changeState', ({ data }) => {
    root.dataset.bookState = data;
    host.setAttribute('aria-busy', String(data !== 'read'));
    if (data === 'read' && requestedTarget) requestAnimationFrame(revealRequestedTarget);
  });

  try {
    book.loadFromHTML(pages);
  } catch (error) {
    host.replaceWith(originalHost);
    console.warn('Marmalade Reef is showing the readable menu because the flipbook could not start.', error);
    return;
  }

  const surface = host.querySelector('.stf__block');
  const controller = book.getFlipController();
  // minWidth is an orientation threshold. The page itself can fit smaller phones.
  host.style.removeProperty('min-width');
  root.dataset.bookMode = motion.matches ? 'instant' : 'animated';
  root.dataset.bookState = 'read';
  root.classList.add('is-book-ready');
  host.tabIndex = 0;
  host.setAttribute('role', 'group');
  host.setAttribute('aria-label', 'Menu book pages');
  if (root.querySelector('#book-control-help')) host.setAttribute('aria-describedby', 'book-control-help');
  host.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight Home End');
  controls.hidden = false;
  syncPage();
  book.on('init', () => {
    syncPage();
    routeHash();
  });
  window.addEventListener('hashchange', routeHash);
  for (const { link, hash } of chartTargets.values()) {
    link.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey
        || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      if (window.location.hash === hash) routeHash();
      else window.location.hash = hash;
    });
  }

  // The engine temporarily clones the turned page in portrait. Keep the clone
  // visual only so its content and fragment IDs stay unique on the real pages.
  if (window.MutationObserver) {
    const sourcePages = new Set(pages);
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!node.matches?.('.book-page') || sourcePages.has(node)) continue;
          node.inert = true;
          node.setAttribute('aria-hidden', 'true');
          node.removeAttribute('id');
          for (const child of node.querySelectorAll('[id]')) child.removeAttribute('id');
        }
      }
    }).observe(surface, { childList: true });
  }

  previous.addEventListener('click', () => turn(-1));
  next.addEventListener('click', () => turn(1));
  open.addEventListener('click', () => {
    if (book.getCurrentPageIndex() === 0) turn(1);
    else if (adjacentPage(-1) === 0) turn(-1);
    else jump(0);
  });

  root.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!host.contains(event.target) && !controls.contains(event.target)) return;
    if (event.target.closest('input, select, textarea, [contenteditable]')) return;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') jump(0);
    else if (event.key === 'End') jump(last);
    else turn(event.key === 'ArrowRight' ? 1 : -1);
  });

  function fold(drag, progress, clientY) {
    const bounds = book.getBoundsRect();
    const surfaceTop = surface.getBoundingClientRect().top;
    const spine = bounds.left + bounds.pageWidth;
    const y = Math.max(bounds.top + 3, Math.min(bounds.top + bounds.height - 3, clientY - surfaceTop));
    controller.fold({ x: spine + drag.direction * bounds.pageWidth * (1 - progress), y });
  }

  function completeShortDrag(drag, clientY) {
    const started = performance.now();
    function continueFold(now) {
      const time = motion.matches ? 1 : Math.min(1, (now - started) / 145);
      const eased = time * (2 - time);
      fold(drag, drag.progress + (1.06 - drag.progress) * eased, clientY);
      if (time < 1) requestAnimationFrame(continueFold);
      else {
        controller.stopMove();
        if (motion.matches) book.getRender().finishAnimation();
      }
    }
    requestAnimationFrame(continueFold);
  }

  function release(event, cancelled = false) {
    if (!gesture || gesture.id !== event.pointerId) return;
    const drag = gesture;
    gesture = null;
    if (surface.hasPointerCapture(drag.id)) surface.releasePointerCapture(drag.id);
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const direction = dx < 0 ? 1 : -1;
    const horizontalSwipe = Math.abs(dx) >= 28 && Math.abs(dx) > Math.abs(dy) * 1.25;

    if (drag.folding) {
      const dragThreshold = drag.touch ? 28 : drag.width * 0.3;
      const completed = !cancelled && horizontalSwipe && Math.abs(dx) >= dragThreshold
        && Math.sign(dx) === -drag.direction;
      if (cancelled) fold(drag, 0.02, drag.y);
      if (completed && drag.progress < 1) completeShortDrag(drag, event.clientY);
      else controller.stopMove();
    } else if (!cancelled && horizontalSwipe && (drag.touch || drag.direction === direction)) {
      turn(direction, drag.corner);
    } else if (!cancelled && Math.hypot(dx, dy) < 8 && drag.tapDirection) {
      turn(drag.tapDirection, drag.corner);
    }
    revealRequestedTarget();
  }

  surface.addEventListener('pointerdown', (event) => {
    if (gesture || !event.isPrimary || event.button !== 0 || book.getState() !== 'read') return;
    if (event.target.closest('a, button, input, select, textarea, [contenteditable]')) return;
    const page = event.target.closest('.book-page');
    if (!page || !pages.includes(page) || page.inert) return;

    const area = page.getBoundingClientRect();
    const block = surface.getBoundingClientRect();
    const portrait = book.getOrientation() === 'portrait';
    const edge = Math.min(66, area.width * 0.22);
    const corner = event.clientY - area.top < area.height / 2 ? 'top' : 'bottom';
    const nearCorner = Math.min(event.clientY - area.top, area.bottom - event.clientY) < edge;
    let direction = 0;
    if (nearCorner && (portrait || page.classList.contains('--left')) && event.clientX - area.left < edge) direction = -1;
    if (nearCorner && (portrait || page.classList.contains('--right')) && area.right - event.clientX < edge) direction = 1;
    if (direction && !canTurn(direction)) direction = 0;
    const tapDirection = direction || (page === pages[0] ? 1 : page === pages[last] ? -1 : 0);
    const touch = event.pointerType !== 'mouse';
    if (!touch && !tapDirection) return;

    gesture = {
      id: event.pointerId, x: event.clientX, y: event.clientY, width: area.width,
      direction, tapDirection, corner, touch, portrait, folding: false, progress: 0,
      start: { x: event.clientX - block.left, y: event.clientY - block.top },
    };
    surface.setPointerCapture(event.pointerId);
    if (!touch) event.preventDefault();
  });

  surface.addEventListener('pointermove', (event) => {
    const drag = gesture;
    if (!drag || drag.id !== event.pointerId || !drag.direction || motion.matches) return;
    const dx = (drag.x - event.clientX) * drag.direction;
    const dy = Math.abs(drag.y - event.clientY);
    if (!drag.folding) {
      if (dx < 8 || dx < dy * 0.8) return;
      if (!controller.start(drag.start)) return;
      drag.folding = true;
    }
    const travel = drag.portrait ? drag.width : drag.width * 2;
    drag.progress = Math.max(0.02, Math.min(1.98, dx * 2 / travel));
    fold(drag, drag.progress, event.clientY);
  });

  surface.addEventListener('pointerup', release);
  surface.addEventListener('pointercancel', (event) => release(event, true));
  surface.addEventListener('lostpointercapture', (event) => release(event, true));

  motion.addEventListener('change', () => {
    root.dataset.bookMode = motion.matches ? 'instant' : 'animated';
    if (motion.matches && gesture) release({ pointerId: gesture.id, clientX: gesture.x, clientY: gesture.y }, true);
    if (motion.matches) book.getRender().finishAnimation();
  });
})();
