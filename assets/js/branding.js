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
  /* La imagen que suba el dueño desde el panel manda sobre la foto de obra
     de fábrica: es SU banner. Se cambia la fuente del <img> del fondo (no se
     rehace el elemento) y se guarda la original para volver a ella si el
     dueño la quita. */
  const foto = $('#heroFoto');
  if(foto){
    if(!foto.dataset.src0){ foto.dataset.src0 = foto.getAttribute('src'); foto.dataset.set0 = foto.getAttribute('srcset') || '' }
    if(settings.heroImage){
      if(foto.getAttribute('src') !== settings.heroImage){ foto.removeAttribute('srcset'); foto.src = settings.heroImage }
    }else if(foto.getAttribute('src') !== foto.dataset.src0){
      foto.setAttribute('srcset', foto.dataset.set0);
      foto.src = foto.dataset.src0;
    }
  }
  $('#adminTag').textContent = brandText;

  $('#footBrand').textContent = `${brandText} · ${settings.brandFull}`;
  $('#printMarca').textContent = `${brandText} · ${settings.brandFull}`;
  $('#footAbout').textContent = settings.footerAbout;
  $('#footContact').innerHTML = `
    <li><a href="tel:${esc(settings.phone.replace(/\s/g,''))}">${esc(settings.phone)}</a></li>
    <li><a href="mailto:${esc(settings.email)}">${esc(settings.email)}</a></li>
    <li>${esc(settings.address)}</li>
    <li>${esc(settings.hours)}</li>`;
  /* Enlaces DE VERDAD a las páginas de categoría, no anclas a la portada.

     Antes eran `#catalogo` con un `data-cat` que el JavaScript convertía en un
     filtro. Para una persona daba igual; para Google, no: una ancla a la misma
     página no es un enlace a ningún sitio, así que las páginas de categoría
     quedaban sin una sola entrada desde la portada — que es la única página
     del sitio con algo de autoridad.

     Siguen filtrando al hacer clic (lo intercepta main.js), así que quien
     navega no nota la diferencia. Quien la nota es el buscador. */
  $('#footCats').innerHTML = baseCats().map(c =>
    `<li><a href="/maquinaria/${esc(slugCategoria(c))}/" data-cat="${esc(c)}">${esc(c)}</a></li>`).join('');
  /* El botón ya no salta directo a WhatsApp: abre el simulador. El cliente
     llega a escribirnos con una cifra concreta en vez de un "¿cuánto sale?". */
}
