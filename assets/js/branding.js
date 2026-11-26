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
  /* La imagen que suba el dueño desde el panel manda sobre la excavadora 3D:
     es SU banner. Si no hay, se deja un hueco `.hero-3d` que llena el bloque
     de abajo cuando la página ya terminó de cargar. Y si el hueco ya está
     —applyBranding corre otra vez cuando llegan los ajustes del servidor—
     no se toca: rehacerlo cortaría el video a la mitad y lo bajaría de nuevo. */
  const arte = $('#heroArt');
  if(settings.heroImage) arte.innerHTML = `<img src="${esc(settings.heroImage)}" alt="">`;
  else if(!arte.querySelector('.hero-3d')) arte.innerHTML = '<div class="hero-3d"></div>';
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

/* ══════════════════ LA EXCAVADORA 3D DEL HERO ══════════════════
   Un video de 5 s renderizado en Blender (tools/blender/, `npm run render3d`)
   que da vueltas sin corte dentro de la vitrina del hero.

   Lo que importa aquí es lo que NO hace:
   · No entra en la carga de la página. Se pide después de `load`, cuando el
     catálogo ya se ve y se puede usar. Un video que compite con el JavaScript
     del catálogo por la señal de una obra es un catálogo que tarda más.
   · No se baja en el teléfono. Por debajo de 1080 px la vitrina ni se ve
     (`.hero-art{display:none}`); pedirle 300 kB de video a alguien que no lo
     va a mirar sería cobrárselos en sus datos.
   · No se mueve para quien pidió menos movimiento, ni para quien activó el
     ahorro de datos: a ellos les toca la imagen fija, que es el primer
     cuadro del mismo video y pesa veinte veces menos.

   Va en un bloque cerrado porque el contrato de globales está lleno, y
   porque nadie más necesita llamarlo: se entera de los cambios mirando el
   DOM, igual que motion.js. */
(function(){
  const RUTA = 'assets/3d/excavadora';
  // Sin matchMedia (jsdom, navegadores viejos) no se sabe si la vitrina se ve:
  // se queda vacía, que es lo mismo que ve un teléfono.
  if(!window.matchMedia) return;
  const ancha = matchMedia('(min-width: 1081px)');
  const quieta = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ahorro = !!(navigator.connection && navigator.connection.saveData);

  /* Si la imagen fija tampoco llega, el dibujo plano de siempre: mejor eso
     que una vitrina vacía. */
  const plana = caja =>{ caja.innerHTML = svgs.excavadora; caja.classList.add('lista','plana') };

  function montar(){
    const caja = document.querySelector('#heroArt > .hero-3d:empty');
    if(!caja || !ancha.matches) return;

    const cartel = new Image();
    cartel.alt = '';
    cartel.decoding = 'async';
    cartel.addEventListener('load', ()=> caja.classList.add('lista'), {once:true});
    cartel.addEventListener('error', ()=> plana(caja), {once:true});
    cartel.src = RUTA + '.webp';
    caja.appendChild(cartel);
    if(quieta || ahorro) return;

    /* El navegador elige UNA fuente, la primera que sabe reproducir: VP9
       (más ligero) y si no, H.264. Nunca baja las dos. Muted y playsinline
       son la condición para que Safari y Chrome lo dejen arrancar solo. */
    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    for(const [ext, tipo] of [['webm','video/webm; codecs="vp9"'], ['mp4','video/mp4']]){
      const fuente = document.createElement('source');
      fuente.src = `${RUTA}.${ext}`;
      fuente.type = tipo;
      video.appendChild(fuente);
    }
    // Aparece cuando ya pinta: el primer cuadro es el mismo de la imagen
    // fija, así que el cambio no se nota.
    video.addEventListener('playing', ()=> video.classList.add('lista'), {once:true});
    caja.appendChild(video);

    /* Pausado mientras no se ve: al bajar al catálogo, o si la ventana se
       angosta y la vitrina desaparece. Un video corriendo fuera de pantalla
       gasta batería y procesador para nadie. */
    const correr = ()=>{ const p = video.play(); if(p && p.catch) p.catch(()=>{}) };
    if('IntersectionObserver' in window){
      new IntersectionObserver(([e])=> e.isIntersecting ? correr() : video.pause()).observe(caja);
    }else{
      correr();
    }
  }

  const arrancar = ()=>{
    montar();
    // La ventana se agranda (una tableta que se gira) o el dueño quita su
    // imagen desde el panel: en los dos casos aparece una vitrina que llenar.
    if(ancha.addEventListener) ancha.addEventListener('change', montar);
    const arte = document.getElementById('heroArt');
    if(arte) new MutationObserver(montar).observe(arte, {childList:true});
  };
  if(document.readyState === 'complete') arrancar();
  else window.addEventListener('load', arrancar, {once:true});
})();
