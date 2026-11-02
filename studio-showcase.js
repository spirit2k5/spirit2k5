/* Progressive controls for the Studio's authentic project captures.
 * Each preview/comparison is independent. Filter controls and their gallery/status
 * share a section or [data-project-showcase]; aria-controls can name a gallery.
 * All project cards and the original captures remain usable without JavaScript.
 */
(() => {
  'use strict';

  const previews = new WeakSet();
  const filters = new WeakSet();
  const comparisons = new WeakSet();
  const views = new Set(['desktop', 'mobile']);
  const categories = new Set(['all', 'business', 'store', 'app']);

  const matching = (scope, selector) => [
    ...(scope.matches?.(selector) ? [scope] : []),
    ...scope.querySelectorAll(selector)
  ];

  const enhancePreview = preview => {
    if (previews.has(preview)) return;
    const stage = preview.querySelector('.device-stage');
    const capture = preview.querySelector('img[data-preview-capture]');
    const buttons = [...preview.querySelectorAll('button[data-preview-view]')];
    if (!stage || !capture || !buttons.length) return;
    const sources = {
      desktop: capture.dataset.desktopSrc?.trim(),
      mobile: capture.dataset.mobileSrc?.trim()
    };
    const show = view => {
      if (!views.has(view) || !sources[view]) return;
      stage.dataset.device = view;
      // A stale srcset would otherwise override the chosen device capture.
      capture.removeAttribute('srcset');
      if (capture.getAttribute('src') !== sources[view]) capture.setAttribute('src', sources[view]);
      buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.previewView === view)));
    };
    buttons.forEach(button => button.addEventListener('click', () => show(button.dataset.previewView)));
    previews.add(preview);
    preview.dataset.enhanced = 'true';
    const chosen = buttons.find(button => button.getAttribute('aria-pressed') === 'true')?.dataset.previewView;
    show(views.has(chosen) ? chosen : views.has(stage.dataset.device) ? stage.dataset.device : 'desktop');
  };

  const enhanceFilters = controls => {
    if (filters.has(controls)) return;
    const scope = controls.closest('[data-project-showcase]') || controls.closest('section') || controls.parentElement;
    if (!scope) return;
    const galleryId = controls.getAttribute('aria-controls');
    const namedGallery = galleryId ? document.getElementById(galleryId) : null;
    const gallery = namedGallery?.matches('[data-project-gallery]') ? namedGallery : scope.querySelector('[data-project-gallery]');
    const status = controls.querySelector('[data-filter-status]') || scope.querySelector('[data-filter-status]');
    const buttons = [...controls.querySelectorAll('button[data-filter]')];
    if (!gallery || !buttons.length) return;
    if (status) status.setAttribute('aria-live', 'polite');
    const apply = filter => {
      if (!categories.has(filter)) return;
      let count = 0;
      gallery.querySelectorAll('article[data-category]').forEach(article => {
        const matches = filter === 'all' || (article.dataset.category || '').split(/\s+/).includes(filter);
        article.hidden = !matches;
        article.setAttribute('aria-hidden', String(!matches));
        if (matches) count++;
      });
      buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === filter)));
      if (status) status.textContent = count + (count === 1 ? ' project shown' : ' projects shown');
    };
    buttons.forEach(button => button.addEventListener('click', () => apply(button.dataset.filter)));
    filters.add(controls);
    controls.dataset.enhanced = 'true';
    const chosen = buttons.find(button => button.getAttribute('aria-pressed') === 'true')?.dataset.filter;
    apply(categories.has(chosen) ? chosen : 'all');
  };

  const enhanceComparison = comparison => {
    if (comparisons.has(comparison)) return;
    const range = comparison.querySelector('input[data-comparison-range]');
    const output = comparison.querySelector('output[data-comparison-output]');
    if (!range) return;
    range.min = '0';
    range.max = '100';
    const before = comparison.dataset.beforeLabel?.trim() || 'Earlier version';
    const after = comparison.dataset.afterLabel?.trim() || 'Current version';
    const update = () => {
      const number = range.value === '' ? 50 : Number(range.value);
      const position = Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 50;
      range.value = String(position);
      comparison.style.setProperty('--comparison-position', position + '%');
      const description = before + ' ' + position + '%, ' + after + ' ' + (100 - position) + '%';
      range.setAttribute('aria-valuetext', description);
      if (output) output.textContent = description;
    };
    range.addEventListener('input', update);
    range.addEventListener('change', update);
    comparisons.add(comparison);
    comparison.dataset.enhanced = 'true';
    update();
  };

  const initialize = (scope = document) => {
    matching(scope, '[data-device-preview]').forEach(enhancePreview);
    matching(scope, '[data-project-filters]').forEach(enhanceFilters);
    matching(scope, '[data-comparison]').forEach(enhanceComparison);
  };

  const start = () => {
    initialize();
    // Studio soft navigation replaces <main> without reloading global scripts.
    // Scan added elements only; text/status updates cannot create observer loops.
    if (typeof MutationObserver === 'function') {
      const observer = new MutationObserver(records => {
        const scopes = new Set();
        records.forEach(record => record.addedNodes.forEach(node => {
          if (node.nodeType === 1) scopes.add(node.closest('[data-project-showcase], section') || node);
        }));
        scopes.forEach(initialize);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
