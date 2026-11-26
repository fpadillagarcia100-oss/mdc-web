/**
 * portada.js — Las cifras, las marcas y el equipo destacado de la portada.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 *
 * Sólo LEE el catálogo (`products`, `settings`) y pinta tres cosas que viven
 * fuera de la rejilla: las cifras bajo el hero, la fila de marcas y la
 * tarjeta del equipo destacado. No aporta globales —va en un bloque cerrado,
 * como motion.js— y nadie depende de ella: si falla, la portada se queda con
 * los números escritos en el HTML y el catálogo funciona igual.
 *
 * Se entera de los cambios mirando la rejilla: cada vez que el catálogo se
 * redibuja (llegan los datos del servidor, el dueño edita un equipo) vuelve a
 * contar. Contar dieciocho equipos cuesta menos que llevar la cuenta de
 * quién cambió qué.
 */
'use strict';

(function(){
  const grid = document.getElementById('productGrid');
  if(!grid || typeof products === 'undefined') return;

  const disponible = p => p.disponibilidad !== 'vendido';
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  /** Pone un texto sólo si cambió: así no se dispara otra mutación por nada. */
  const poner = (el, txt) => { if(el && el.textContent !== txt) el.textContent = txt };

  function cifras(){
    const vivos = products.filter(disponible);
    poner(document.querySelector('[data-kpi="equipos"]'), String(vivos.length));
    poner(document.querySelector('[data-kpi="marcas"]'), String(new Set(products.map(p => p.brand)).size));
    const suc = (settings && Array.isArray(settings.branches)) ? settings.branches.length : 0;
    if(suc) poner(document.querySelector('[data-kpi="sucursales"]'), String(suc));

    document.querySelectorAll('[data-cuenta]').forEach(el =>{
      const n = vivos.filter(p => p.cat === el.dataset.cuenta).length;
      if(n) poner(el, plural(n, 'equipo disponible', 'equipos disponibles'));
    });
  }

  let firmaMarcas = '';
  function marcas(){
    const lista = [...new Set(products.map(p => p.brand).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'es'));
    const firma = lista.join('|');
    if(!lista.length || firma === firmaMarcas) return;
    firmaMarcas = firma;
    const fila = document.getElementById('marcasFila');
    if(fila) fila.innerHTML = lista.map(m => `<span class="marca">${esc(m)}</span>`).join('');
  }

  /* El destacado: el más vendido que esté disponible, a la venta y con foto.
     Sin foto no se destaca nada: un dibujo de respaldo en el lugar más
     visible de la página dice "aquí falta algo". */
  let firmaDestacado = '';
  function destacado(){
    const caja = document.getElementById('heroArt');
    if(!caja) return;
    const conFoto = p => Array.isArray(p.imgs) && p.imgs.length;
    const p = products.find(x => x.hot && conFoto(x) && disponible(x) && x.cond !== 'Renta')
           || products.find(x => conFoto(x) && disponible(x));
    const firma = p ? [p.id, p.name, p.price, p.imgs[0]].join('|') : '';
    if(firma === firmaDestacado) return;
    firmaDestacado = firma;
    if(!p){ caja.innerHTML = ''; return }

    const set = typeof fotoSrcset === 'function' ? fotoSrcset(p.imgs[0]) : '';
    const precio = p.cond === 'Renta' ? `${fmtCompact(p.price)}<small>al mes</small>`
      : `${fmtCompact(p.price)}${p.finance ? `<small>${esc(p.finance)} sin intereses</small>` : ''}`;
    caja.innerHTML = `
      <article class="destacado">
        <div class="destacado-foto">
          <img src="${esc(p.imgs[0])}" alt="${esc(p.name)}" decoding="async"${set ? ` srcset="${esc(set)}" sizes="360px"` : ''}>
          <span class="destacado-tag">Destacado</span>
        </div>
        <div class="destacado-info">
          <h2>${esc(p.name)}</h2>
          <p class="destacado-meta">${esc(p.cond)} · ${esc(String(p.year))} · ${esc(p.location)}</p>
          <div class="destacado-fila">
            <p class="destacado-precio">${precio}</p>
            <div class="destacado-btns">
              <button class="ver" type="button" data-open="${p.id}">Ver ficha</button>
            </div>
          </div>
        </div>
      </article>`;
  }

  let pendiente = false;
  function pintar(){
    pendiente = false;
    try { cifras(); marcas(); destacado() }
    catch(err){ console.warn('[portada]', err) }   // adorno: nunca tumba el catálogo
  }
  const pedir = () =>{ if(!pendiente){ pendiente = true; requestAnimationFrame(pintar) } };

  pintar();
  new MutationObserver(pedir).observe(grid, {childList:true});
})();
