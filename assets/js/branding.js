/**
 * branding.js — Aplica la identidad configurable: logo, colores, textos y datos de contacto.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 */
'use strict';

/* ══════════════════ MARCA / IDENTIDAD ══════════════════ */
function applyBranding(){
  document.documentElement.style.setProperty('--y', settings.accent);
  document.documentElement.style.setProperty('--yd', darken(settings.accent));

  const brandText = settings.brandMain + settings.brandAccent;
  document.title = `${brandText} — ${settings.brandFull}`;

  $('#logoSlot').innerHTML = settings.logo
    ? `<img class="logo-img" src="${esc(settings.logo)}" alt="${esc(brandText)} — ${esc(settings.brandFull)}">`
    : `<span><span class="logo-text">${esc(settings.brandMain)}<span>${esc(settings.brandAccent)}</span></span>
       <span class="logo-sub">${esc(settings.brandFull)}</span></span>`;

  $('#topbarMsg').textContent = settings.topbarMsg;
  $('#heroTag').textContent = settings.heroTag;
  $('#heroH').innerHTML = `${esc(settings.heroTitle)}<br><span>${esc(settings.heroHighlight)}</span>`;
  $('#heroP').textContent = settings.heroText;
  $('#heroArt').innerHTML = settings.heroImage
    ? `<img src="${esc(settings.heroImage)}" alt="">`
    : svgs.excavadora;
  $('#adminTag').textContent = brandText;

  $('#footBrand').textContent = `${brandText} · ${settings.brandFull}`;
  $('#footAbout').textContent = settings.footerAbout;
  $('#footContact').innerHTML = `
    <li><a href="tel:${esc(settings.phone.replace(/\s/g,''))}">${esc(settings.phone)}</a></li>
    <li><a href="mailto:${esc(settings.email)}">${esc(settings.email)}</a></li>
    <li>${esc(settings.address)}</li>
    <li>${esc(settings.hours)}</li>`;
  $('#footCats').innerHTML = baseCats().map(c=>`<li><a href="#catalogo" data-cat="${esc(c)}">${esc(c)}</a></li>`).join('');
  /* El botón ya no salta directo a WhatsApp: abre el simulador. El cliente
     llega a escribirnos con una cifra concreta en vez de un "¿cuánto sale?". */
}
