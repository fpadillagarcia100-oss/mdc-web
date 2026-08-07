/**
 * motion.js — La capa de movimiento del catálogo.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 *
 * Lo que se puede animar con CSS está en styles.css, sección MOVIMIENTO. Aquí
 * vive sólo lo que el CSS no alcanza: cosas que dependen de dónde está un
 * elemento en la pantalla, de que un número haya cambiado, o de que la rejilla
 * se acabe de volver a dibujar.
 *
 * Tres reglas que se respetan en todo el archivo:
 *
 *   · Nada de esto es necesario para usar el sitio. Si este archivo no carga
 *     —o el navegador es viejo, o falla una API— el catálogo funciona igual,
 *     sólo que más seco. Por eso todo va envuelto en comprobaciones y nada
 *     modifica datos.
 *   · Si el sistema pide menos animación, este archivo se apaga entero en la
 *     primera línea ejecutable.
 *   · Cero acoplamiento con el resto del código: se escucha al DOM en lugar de
 *     pedirle a cart.js o a ui.js que avisen. Así ninguna de las dos partes se
 *     rompe cuando la otra cambia.
 */
'use strict';

(function(){
  /* matchMedia no existe en todos lados —jsdom, por ejemplo, donde corren las
     pruebas—. Sin él no hay forma de saber la preferencia: se anima, que es lo
     que hace el 99% de los navegadores reales que sí lo traen. */
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const $$ = s => Array.from(document.querySelectorAll(s));

  /* ═══════════ 1. APARICIÓN DE LAS TARJETAS ═══════════
     Sólo para los navegadores sin animaciones ligadas al scroll. Donde
     `animation-timeline` existe, el CSS ya lo resolvió y esto no se activa:
     tener los dos caminos encendidos a la vez haría que una tarjeta se
     revelara dos veces. */
  const conScrollNativo = window.CSS && CSS.supports && CSS.supports('animation-timeline: view()');

  if(!conScrollNativo && 'IntersectionObserver' in window){
    document.body.classList.add('js-reveal');

    const vigia = new IntersectionObserver((entradas, obs) => {
      entradas.forEach(e =>{
        if(!e.isIntersecting) return;
        e.target.classList.add('visto');
        obs.unobserve(e.target);   // una tarjeta aparece una vez, no cada vez que pasa
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: .05 });

    /* El escalón entre tarjeta y tarjeta se calcula por fila, no por posición
       absoluta: si fuera absoluta, la tarjeta número 30 esperaría un segundo y
       medio antes de aparecer y parecería que la página se colgó. */
    const observarTarjetas = ()=>{
      $$('.pcard:not(.visto)').forEach((c,i)=>{
        c.style.setProperty('--i', i % 6);
        vigia.observe(c);
      });
    };

    observarTarjetas();
    /* La rejilla se reconstruye entera con innerHTML en cada filtro, orden o
       cambio de página. En vez de pedirle a catalog.js que avise, se mira el
       propio DOM: funciona pase lo que pase allá. */
    const rejilla = document.getElementById('productGrid');
    if(rejilla) new MutationObserver(observarTarjetas).observe(rejilla, {childList:true});
  }

  /* ═══════════ 2. LA FOTO QUE VUELA A LA COTIZACIÓN ═══════════
     Al agregar un equipo, su foto sale de la tarjeta y aterriza en el carrito
     del encabezado. Es la respuesta a un problema real: el botón está a media
     página y el contador que cambia queda arriba, fuera de la vista, así que
     agregar un equipo no se sentía como que hubiera pasado nada.

     Se anima un CLON suelto en position:fixed, nunca el original: mover el
     original lo sacaría del flujo y reacomodaría la rejilla entera. */
  document.addEventListener('click', e =>{
    const btn = e.target.closest('[data-add]');
    if(!btn) return;

    const destino = document.getElementById('cartToggle');
    if(!destino || !destino.animate) return;   // sin Web Animations, no se intenta

    const origen = (btn.closest('.pcard') || btn.closest('.modal') || document)
                     .querySelector('.pcard-img img, .pcard-img svg, .gal-main, .modal-img img, .modal-img svg');
    if(!origen) return;

    const a = origen.getBoundingClientRect();
    const b = destino.getBoundingClientRect();
    if(!a.width || !b.width) return;           // elemento oculto: no hay nada que volar

    const clon = origen.cloneNode(true);
    clon.classList.add('vuela');
    clon.removeAttribute('id');
    clon.style.cssText += `left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px`;
    document.body.appendChild(clon);

    // A dónde: al centro del botón del carrito, encogido hasta casi nada.
    const dx = (b.left + b.width/2) - (a.left + a.width/2);
    const dy = (b.top + b.height/2) - (a.top + a.height/2);

    clon.animate([
      { transform:'translate(0,0) scale(1)', opacity:1 },
      /* El punto intermedio levanta la foto antes de bajarla: una parábola se
         lee como un objeto lanzado, y una línea recta como un error de CSS. */
      { transform:`translate(${dx*.55}px, ${dy*.35 - 70}px) scale(.6)`, opacity:.9, offset:.55 },
      { transform:`translate(${dx}px, ${dy}px) scale(.08)`, opacity:.15 }
    ], { duration:720, easing:'cubic-bezier(.4,.1,.3,1)' })
      .finished.catch(()=>{})                  // si se cancela (pestaña oculta), da igual
      .finally(()=> clon.remove());            // pase lo que pase, el clon no se queda
  });

  /* ═══════════ 3. EL CONTADOR QUE SALTA ═══════════
     Se vigila el texto del contador en lugar de engancharse a renderCart():
     cualquier camino que cambie el número —agregar, quitar, cambiar cantidad—
     dispara el salto sin que cart.js sepa que esto existe. */
  const contador = document.getElementById('cartBadge');
  if(contador && 'MutationObserver' in window){
    let previo = contador.textContent;
    const saltar = ()=>{
      if(contador.textContent === previo) return;
      const subio = Number(contador.textContent) > Number(previo || 0);
      previo = contador.textContent;
      if(!subio) return;                       // quitar algo no merece festejo

      contador.classList.remove('bump');
      void contador.offsetWidth;               // reinicia la animación si se repite
      contador.classList.add('bump');

      const boton = document.getElementById('cartToggle');
      if(boton){
        boton.classList.remove('recibe');
        void boton.offsetWidth;
        boton.classList.add('recibe');
      }
    };
    new MutationObserver(saltar).observe(contador, {childList:true, characterData:true, subtree:true});
  }

  /* ═══════════ 4. LA REJILLA QUE SE REACOMODA (FLIP) ═══════════
     Al filtrar u ordenar, la rejilla se reemplaza entera con innerHTML: las
     nueve tarjetas de antes desaparecen y salen otras nueve. Aunque seis sean
     las mismas, se lee como si todo hubiera cambiado, y no se entiende qué
     quitó el filtro.

     FLIP lo arregla midiendo dónde estaba cada tarjeta ANTES (First), dónde
     queda DESPUÉS (Last), y arrancando la nueva desde la posición vieja para
     dejarla caer en la suya (Invert + Play). El navegador sólo interpola un
     transform: no hay reflow por cuadro.

     Se escuchan los avisos que emite catalog.js —`mdc:rejilla-antes` y
     `mdc:rejilla-despues`— en lugar de envolver render() por fuera. La primera
     versión hacía justo eso: reemplazaba `window.render` con un decorador. Se
     cambió porque era acción a distancia: quien viniera a depurar por qué
     render tarda no iba a sospechar de un archivo de animaciones. Ahora la
     dependencia está declarada en los dos extremos y sigue sin acoplar nada:
     si este archivo desaparece, nadie escucha y no pasa nada.

     Sólo se animan las tarjetas SUPERVIVIENTES —las que estaban antes y siguen
     después—. Las nuevas ya tienen su propia aparición, y encimarle una
     segunda animación haría que pelearan por la misma propiedad. */
  const idDe = tarjeta =>{
    const b = tarjeta.querySelector('[data-open]');
    return b ? b.dataset.open : null;
  };
  let antes = null;

  document.addEventListener('mdc:rejilla-antes', ()=>{
    const rejilla = document.getElementById('productGrid');
    if(!rejilla || !rejilla.animate){ antes = null; return }
    antes = new Map();
    rejilla.querySelectorAll('.pcard').forEach(c =>{
      const id = idDe(c);
      if(id) antes.set(id, c.getBoundingClientRect());
    });
  });

  document.addEventListener('mdc:rejilla-despues', ()=>{
    const rejilla = document.getElementById('productGrid');
    if(!rejilla || !antes || !antes.size) return;

    rejilla.querySelectorAll('.pcard').forEach(c =>{
      const a = antes.get(idDe(c));
      if(!a) return;                              // tarjeta nueva: no es cosa del FLIP
      const b = c.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      const sx = b.width ? a.width/b.width : 1, sy = b.height ? a.height/b.height : 1;
      // Se quedó donde estaba: animarla sería gastar un cuadro en nada.
      if(Math.abs(dx) < 2 && Math.abs(dy) < 2 && Math.abs(sx-1) < .02 && Math.abs(sy-1) < .02) return;
      c.animate(
        [{transform:`translate(${dx}px,${dy}px) scale(${sx},${sy})`}, {transform:'none'}],
        {duration:420, easing:'cubic-bezier(.2,.8,.25,1)', composite:'replace'}
      );
    });
    antes = null;
  });

  /* ═══════════ 5. FOTOS QUE NO PARPADEAN ═══════════
     Las fotos viven en Supabase y van con loading="lazy": en una obra con mala
     señal la tarjeta se queda con un hueco gris y luego la imagen entra de
     golpe. Con esto el hueco tiene un brillo que indica "viene en camino" y la
     foto aparece fundiéndose.

     La clase la pone JavaScript sólo cuando hay una <img> que de verdad está
     pendiente. Si la tarjeta trae un dibujo SVG en lugar de foto, no hay nada
     que esperar y el brillo no se enciende nunca. */
  const marcarCargada = img =>{
    img.classList.add('cargada');
    const caja = img.closest('.pcard-img');
    if(caja) caja.classList.remove('cargando');
  };

  const revisarFotos = ()=>{
    document.querySelectorAll('.pcard-img img:not(.cargada)').forEach(img =>{
      // `complete` cubre las que salieron del caché antes de que mirásemos.
      if(img.complete && img.naturalWidth) marcarCargada(img);
      else img.closest('.pcard-img').classList.add('cargando');
    });
  };

  revisarFotos();
  const rejillaFotos = document.getElementById('productGrid');
  if(rejillaFotos && 'MutationObserver' in window){
    new MutationObserver(revisarFotos).observe(rejillaFotos, {childList:true});
  }

  // `load` no burbujea; se escucha en captura para no ponerle uno a cada foto.
  document.addEventListener('load', e =>{
    if(e.target.tagName === 'IMG' && e.target.closest('.pcard-img')) marcarCargada(e.target);
  }, true);
  // Si la foto falla, el brillo se apaga igual: mejor un hueco que un brillo eterno.
  document.addEventListener('error', e =>{
    if(e.target.tagName === 'IMG' && e.target.closest('.pcard-img')) marcarCargada(e.target);
  }, true);

  /* ═══════════ 6. EL CONTADOR DE RESULTADOS ═══════════
     "18 equipos" → "7 equipos" contando, no saltando. El número que baja se
     lee como consecuencia del filtro que acabas de tocar.

     El candado importa: al escribir el número se dispara el observador otra
     vez, y sin él se llamaría a sí mismo hasta agotar la pila. */
  const marcador = document.getElementById('resultsCount');
  if(marcador && 'MutationObserver' in window){
    let previo = null, contando = false, cuadro = 0;

    const contar = ()=>{
      if(contando) return;
      const fuerte = marcador.querySelector('strong');
      if(!fuerte) return;
      const texto = fuerte.textContent;
      const m = texto.match(/^\s*([\d,]+)/);
      if(!m) return;
      const destino = Number(m[1].replace(/,/g,''));
      const desde = previo;
      previo = destino;
      if(desde === null || desde === destino || Math.abs(destino-desde) < 2) return;

      const resto = texto.slice(m[0].length);
      const t0 = performance.now(), dur = 380;
      cancelAnimationFrame(cuadro);
      const paso = ahora =>{
        const k = Math.min(1, (ahora-t0)/dur);
        const suave = 1 - Math.pow(1-k, 3);
        contando = true;
        fuerte.textContent = Math.round(desde + (destino-desde)*suave).toLocaleString('es-MX') + resto;
        contando = false;
        if(k < 1) cuadro = requestAnimationFrame(paso);
      };
      cuadro = requestAnimationFrame(paso);
    };

    contar();                                   // primera lectura: fija el punto de partida
    new MutationObserver(contar).observe(marcador, {childList:true, characterData:true, subtree:true});
  }

  /* ═══════════ 7. EL CORAZÓN QUE LATE ═══════════
     toggleFav() redibuja la rejilla entera, así que el botón que se pulsó ya
     no existe cuando termina. Se espera al siguiente cuadro y se busca el
     botón nuevo por su id de equipo. Este listener corre después del de
     main.js —se registró después— y para entonces render() ya terminó. */
  document.addEventListener('click', e =>{
    const btn = e.target.closest('[data-fav]');
    if(!btn) return;
    const id = btn.dataset.fav;
    requestAnimationFrame(()=>{
      const nuevo = document.querySelector(`.pcard-fav[data-fav="${id}"][aria-pressed="true"]`);
      if(!nuevo) return;                       // lo quitó de favoritos: sin latido
      nuevo.classList.add('pop');
      nuevo.addEventListener('animationend', ()=> nuevo.classList.remove('pop'), {once:true});
    });
  });
})();
