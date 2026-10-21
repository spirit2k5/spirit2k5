/* Spirit2k5 Web Studio — branded, icon-only social links. */
(() => {
  'use strict';
  if (window.spiritEnhanceSocials) return;
  const socialLinks = [
    { platform:'instagram', label:'Instagram', url:'https://www.instagram.com/spirit.2k5/', image:'/assets/social-instagram.png' },
    { platform:'whatsapp', label:'WhatsApp', url:'https://wa.me/27781888220', image:'/assets/social-whatsapp.png' },
    { platform:'tiktok', label:'TikTok', url:'https://www.tiktok.com/@.spirit2k5', image:'/assets/social-tiktok.png' }
  ];
  const byPlatform = new Map(socialLinks.map(x => [x.platform, x]));
  const platformFromUrl = value => {
    try {
      const url = new URL(value, location.href);
      const host = url.hostname.toLowerCase();
      if (host === 'instagram.com' || host === 'www.instagram.com') return 'instagram';
      if (host === 'tiktok.com' || host === 'www.tiktok.com') return 'tiktok';
      if (host === 'wa.me' || host === 'api.whatsapp.com') return 'whatsapp';
    } catch (_) {}
    return null;
  };
  const picture = info => {
    const image = document.createElement('img');
    image.src = info.image;
    image.alt = '';
    image.width = info.platform === 'instagram' ? 60 : 42;
    image.height = info.platform === 'instagram' ? 18 : 42;
    image.loading = 'lazy';
    image.decoding = 'async';
    return image;
  };
  const makeIcon = (info, extraClass = '') => {
    const a = document.createElement('a');
    a.href = info.url;
    a.className = 'spirit-social-btn spirit-social-' + info.platform + (extraClass ? ' ' + extraClass : '');
    a.setAttribute('aria-label', 'Open Spirit2k5 on ' + info.label + ' (new tab)');
    a.title = info.label;
    a.target = '_blank';
    a.rel = 'noopener noreferrer me';
    a.append(picture(info));
    return a;
  };
  const iconifyExisting = (a, platform) => {
    if (a.classList.contains('spirit-social-btn')) return;
    const info = byPlatform.get(platform);
    if (!info) return;
    a.classList.remove('text-link', 'btn', 'primary', 'ghost', 'ghost-dark');
    a.classList.add('spirit-social-btn', 'spirit-social-' + platform, 'spirit-social-inline');
    a.replaceChildren(picture(info));
    a.setAttribute('aria-label', 'Open Spirit2k5 on ' + info.label + ' (new tab)');
    a.title = info.label;
    a.target = '_blank';
    a.rel = 'noopener noreferrer me';
  };
  const install = () => {
    // Put the same recognizable three-logo set in every studio footer.
    const footer = document.querySelector('.footer');
    if (footer) {
      // Replace old social-media text links, but keep email, phone and Google links.
      footer.querySelectorAll('a[href]').forEach(a => {
        if (!a.closest('.spirit-social-links') && platformFromUrl(a.href)) a.remove();
      });
      if (!footer.querySelector('.spirit-social-links')) {
        const headingBlock = [...footer.children].find(block =>
          [...block.querySelectorAll('h4')].some(h => h.textContent.trim().toLowerCase() === 'contact')
        );
        const target = headingBlock || [...footer.children].find(el => !el.classList.contains('footer-legal')) || footer;
        const group = document.createElement('div');
        group.className = 'spirit-social-links';
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', 'Spirit2k5 social media');
        socialLinks.forEach(info => group.append(makeIcon(info)));
        target.append(group);
      }
    }
    // Standalone social profile links become icon-only too, including About and Contact.
    // Purpose-specific enquiry/WhatsApp CTA buttons retain their descriptive text.
    document.querySelectorAll('main a[href]').forEach(a => {
      if (a.classList.contains('spirit-social-btn')) return;
      const platform = platformFromUrl(a.href);
      if (!platform) return;
      if (platform === 'whatsapp' && !a.closest('.contact-direct')) return;
      if (a.closest('.faremap-showcase')) return;
      iconifyExisting(a, platform);
    });
  };
  window.spiritEnhanceSocials = install;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();