/* Spirit2k5 Web Studio — Animated action icons, no external fonts. */
(() => {
 'use strict';
 if (window.__spiritStudioIconsReady) return;
 window.__spiritStudioIconsReady = true;
 const paths = {
  home:'<path d="m3 11 9-8 9 8v9H3z"/><path d="M9 21v-8h6v8"/>',
  layers:'<path d="m12 2 9 5-9 5-9-5 9-5zm-9 10 9 5 9-5M3 17l9 5 9-5"/>',
  work:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/>',
  tag:'<path d="M3 12V4h9l9 9-9 9-9-9z"/><circle cx="8" cy="8" r="1"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  chat:'<path d="M20 11a8 8 0 0 1-8 8c-1 0-2.2-.2-3.2-.6L4 20l1.1-4.8A8 8 0 1 1 20 11z"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 7 9-7"/>',
  phone:'<path d="M6 3h4l2 5-2.5 2a14 14 0 0 0 4.5 4.5L16 12l5 2v4a3 3 0 0 1-3 3C10 21 3 14 3 6a3 3 0 0 1 3-3z"/>',
  arrow:'<path d="M5 12h14m-7-7 7 7-7 7"/>',
  back:'<path d="M19 12H5m7-7-7 7 7 7"/>',
  external:'<path d="M14 4h6v6m0-6-9 9"/><path d="M20 13v6H4V5h7"/>',
  eye:'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  monitor:'<rect x="2" y="3" width="20" height="15" rx="2"/><path d="M8 22h8m-4-4v4"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  send:'<path d="m22 2-7 20-4-9-9-4zM22 2 11 13"/>',
  sparkle:'<path d="m12 3 2 5 5 2-5 2-2 5-2-5-5-2 5-2zM19 17l.7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7z"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
  refresh:'<path d="M20 8a8 8 0 0 0-14-2L4 8m0-5v5h5M4 16a8 8 0 0 0 14 2l2-2m0 5v-5h-5"/>',
  shield:'<path d="m12 2 8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z"/><path d="m9 12 2 2 4-4"/>',
  shop:'<path d="M4 8h16l-1 13H5zM9 9V6a3 3 0 0 1 6 0v3"/>',
  edit:'<path d="m4 20 5-.9L20 8a2.1 2.1 0 0 0-4-4L5 15z"/>',
  map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15m6-12v15"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2.4c-1.4.9-2 1.3-2 2.6m0 3h.01"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>'
 };
 const selector=['a.btn','button.btn','.nav a','.menu-btn','.spirit-ai-launcher',
   '.spirit-ai-close','.spirit-ai-send','.spirit-ai-chip','.spirit-ai-action',
   '.spirit-ai-action-primary','.spirit-ai-source','.faremap-access-link',
   'main button:not(.mini-site button)','main a[role="button"]'].join(',');
 const style=document.createElement('style');
 style.id='spirit-studio-action-icon-styles';
 style.textContent="\n.spirit-action{display:inline-flex;align-items:center;justify-content:center;gap:.52em;vertical-align:middle}\n.spirit-action .spirit-action-svg{width:1.12em;height:1.12em;min-width:1.12em;flex:0 0 1.12em;display:block;color:#d97a20;pointer-events:none;transform-origin:center;transition:transform .35s cubic-bezier(.2,.8,.2,1),filter .35s ease}\n.spirit-action.btn.primary .spirit-action-svg,.spirit-action.nav-cta .spirit-action-svg,.spirit-ai-action-primary.spirit-action .spirit-action-svg{color:#eca24f}\n.spirit-action.spirit-ai-send .spirit-action-svg{color:#fff}\n.spirit-action.spirit-ai-close,.spirit-action.menu-btn{gap:0}\n.spirit-action.spirit-ai-close .spirit-action-svg,.spirit-action.menu-btn .spirit-action-svg{width:21px;height:21px;min-width:21px;flex-basis:21px;color:inherit}\n.spirit-action.spirit-ai-chip .spirit-action-svg,.spirit-action.spirit-ai-source .spirit-action-svg{width:14px;height:14px;min-width:14px;flex-basis:14px}\n.nav a.spirit-action:not(.nav-cta){display:inline-flex;align-items:center}\n.nav a:not(.nav-cta) .spirit-action-svg{display:none}\n.spirit-action:focus-visible,.spirit-native-icon:focus-visible{outline:3px solid rgba(217,122,32,.55);outline-offset:3px}\n.spirit-action:active:not(:disabled) .spirit-action-svg{transform:scale(.8) rotate(-7deg)}\n.spirit-action:disabled .spirit-action-svg{opacity:.6}\n.spirit-native-icon img,.spirit-native-icon .faremap-action-icon,.spirit-native-icon .faremap-play-icon{transform-origin:center;transition:transform .38s cubic-bezier(.2,.8,.2,1)}\n.spirit-numbered-action{transition:transform .25s ease}\n.spirit-action.menu-btn[aria-expanded=\"true\"] .spirit-action-svg{transform:rotate(90deg)}\n@keyframes spirit-icon-twinkle{0%,100%{transform:scale(1) rotate(0)}40%{transform:scale(1.22) rotate(14deg)}75%{transform:scale(.96) rotate(-8deg)}}\n@media(hover:hover){\n .spirit-action:hover:not(:disabled) .spirit-action-svg{transform:translateY(-2px) rotate(-8deg) scale(1.1);filter:drop-shadow(0 3px 5px rgba(217,122,32,.2))}\n .spirit-action[data-spirit-icon=\"arrow\"]:hover .spirit-action-svg,\n .spirit-action[data-spirit-icon=\"send\"]:hover .spirit-action-svg,\n .spirit-action[data-spirit-icon=\"external\"]:hover .spirit-action-svg{transform:translate(4px,-2px) rotate(-8deg)}\n .spirit-action[data-spirit-icon=\"back\"]:hover .spirit-action-svg{transform:translateX(-4px)}\n .spirit-action[data-spirit-icon=\"refresh\"]:hover .spirit-action-svg{transform:rotate(110deg)}\n .spirit-action[data-spirit-icon=\"sparkle\"]:hover .spirit-action-svg{animation:spirit-icon-twinkle .65s ease}\n .spirit-native-icon:hover img,.spirit-native-icon:hover .faremap-action-icon,.spirit-native-icon:hover .faremap-play-icon{transform:rotate(-6deg) scale(1.1)}\n .spirit-numbered-action:hover{transform:translateY(-2px)}\n}\n@media(max-width:980px){\n .nav a:not(.nav-cta) .spirit-action-svg{display:block;width:16px;height:16px;min-width:16px;flex-basis:16px}\n .nav a.spirit-action:not(.nav-cta){justify-content:flex-start}\n .nav a.spirit-action.nav-cta{justify-content:center}\n}\n@media(max-width:680px){\n .spirit-action.btn{gap:7px}\n .spirit-action .spirit-action-svg{width:1em;height:1em;min-width:1em;flex-basis:1em}\n .spirit-action.spirit-ai-chip .spirit-action-svg{width:12px;height:12px;min-width:12px;flex-basis:12px}\n}\n@media(prefers-reduced-motion:reduce){\n .spirit-action .spirit-action-svg,.spirit-native-icon img,\n .spirit-native-icon .faremap-action-icon,.spirit-native-icon .faremap-play-icon,\n .spirit-numbered-action{animation:none!important;transition:none!important;transform:none!important}\n}";
 document.head.appendChild(style);
 const pick=el=>{
   const t=(el.textContent||el.getAttribute('aria-label')||'').trim().toLowerCase();
   const h=(el.getAttribute('href')||'').toLowerCase();
   if(el.matches('.menu-btn'))return 'menu';
   if(el.matches('.spirit-ai-close'))return 'x';
   if(el.matches('.wizard-back'))return 'back';
   if(el.matches('.wizard-next'))return 'arrow';
   if(el.matches('.spirit-ai-send,.send-enquiry'))return 'send';
   if(h.startsWith('mailto:'))return 'mail';
   if(h.startsWith('tel:'))return 'phone';
   if(/wa\.me|whatsapp/.test(h+' '+t))return 'chat';
   if(/play\.google|download|play store/.test(h+' '+t))return 'download';
   if(h.includes('/faremap'))return 'map';
   if(el.closest('.nav')&&!el.classList.contains('nav-cta')){
     if(/index\.html|^\/$/.test(h))return 'home';
     if(/services/.test(h))return 'layers';
     if(/portfolio/.test(h))return 'work';
     if(/pricing/.test(h))return 'tag';
     if(/about/.test(h))return 'user';
     if(/contact/.test(h))return 'chat';
   }
   if(/\b(back|previous|return)\b/.test(t))return 'back';
   if(/\b(next|continue)\b/.test(t))return 'arrow';
   if(/send|submit/.test(t))return 'send';
   if(/start.*project|start.*website|enquir|request.*quote|contact|talk to/.test(t))return 'sparkle';
   if(/chat|message|help|ask|question/.test(t))return 'chat';
   if(/view|see |preview|explore|work|portfolio|case study/.test(t))return 'eye';
   if(/pricing|cost|payment|packages|budget/.test(t))return 'tag';
   if(/website check|audit|search|review/.test(t))return 'search';
   if(/online store|ecommerce|e-commerce|shop/.test(t))return 'shop';
   if(/redesign|edit|change/.test(t))return 'edit';
   if(/refresh|reload/.test(t))return 'refresh';
   if(/home/.test(t))return 'home';
   if(/service/.test(t+h))return 'layers';
   if(/website|web version|browser/.test(t))return 'monitor';
   if(/faq|help|read more/.test(t))return 'help';
   if(/privacy|terms|conduct|secure/.test(h))return 'shield';
   if(/open|visit|live site/.test(t)||/^https?:\/\//.test(h))return 'external';
   return 'arrow';
 };
 const decorate=el=>{
   if(!el?.matches?.(selector))return;
   if(el.matches('.flow-step,.wizard-dot')){el.classList.add('spirit-numbered-action');return;}
   if(el.matches('.faremap-access-link,.spirit-ai-launcher')||el.querySelector(':scope > svg:not(.spirit-action-svg)')){
     el.classList.add('spirit-native-icon');return;
   }
   if(el.querySelector(':scope > .spirit-action-svg'))return;
   const name=pick(el);
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
   for(const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',
      'stroke-width':'1.9','stroke-linecap':'round','stroke-linejoin':'round',
      'aria-hidden':'true',focusable:'false'}))svg.setAttribute(key,value);
   svg.classList.add('spirit-action-svg');
   svg.innerHTML=paths[name]||paths.arrow;
   if(el.matches('.menu-btn,.spirit-ai-close'))el.textContent='';
   el.prepend(svg);
   el.classList.add('spirit-action');
   el.dataset.spiritIcon=name;
 };
 const decorateTree=root=>{
   if(root.nodeType!==1)return;
   decorate(root);
   root.querySelectorAll?.(selector).forEach(decorate);
 };
 const start=()=>{
   decorateTree(document.body);
   const observer=new MutationObserver(records=>{
     for(const record of records){
       if(record.target.nodeType===1)decorate(record.target);
       for(const node of record.addedNodes)if(node.nodeType===1)decorateTree(node);
     }
   });
   observer.observe(document.body,{childList:true,subtree:true});
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})();