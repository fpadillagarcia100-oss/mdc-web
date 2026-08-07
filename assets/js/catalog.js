/**
 * catalog.js — Dibuja el catálogo: filtros con conteos, navegación, tarjetas y paginación.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 */
'use strict';

/* ══════════════════ RENDER: FILTROS ══════════════════ */
function countsFor(facet, key){
  const base = filterAll(facet);
  return v => base.filter(p => key(p)===v).length;
}

const GROUP_KEY = {cond:'conds', brand:'brands', loc:'locations', fin:'finance'};

function checkboxRow(group,value,label,count){
  const checked = state[GROUP_KEY[group]].includes(value);
  const disabled = count===0 && !checked;
  return `<label class="filter-opt${disabled?' disabled':''}">
    <input type="checkbox" data-filter="${group}" value="${esc(value)}"${checked?' checked':''}${disabled?' disabled':''}>
    <span>${esc(label)}</span>
    ${count!=null?`<span class="filter-count">${count}</span>`:''}
  </label>`;
}

function filterHTML(){
  const condCount = countsFor('cond', p=>p.cond);
  const brandCount = countsFor('brand', p=>p.brand);
  const locCount = countsFor('loc', p=>p.location);
  const finBase = filterAll('fin');
  const n = activeFilterCount();
  return `
    <div class="filter-title">
      <span>Filtros${n?` <span class="filter-count">(${n})</span>`:''}</span>
      <button type="button" data-action="clear-filters">Limpiar todo</button>
    </div>
    <div class="filter-group">
      <div class="filter-group-title">Condición</div>
      ${CONDS.map(c=>checkboxRow('cond',c,COND_LABELS[c],condCount(c))).join('')}
    </div>
    <div class="filter-group">
      <div class="filter-group-title">Marca</div>
      ${brands().map(b=>checkboxRow('brand',b,BRAND_LABELS[b]||b,brandCount(b))).join('')}
    </div>
    <div class="filter-group">
      <div class="filter-group-title">Precio / renta (MXN)</div>
      <div class="price-inputs">
        <input class="price-input" type="number" min="0" step="1000" data-price="min" aria-label="Precio mínimo" placeholder="Mínimo" value="${state.min ?? ''}">
        <span class="price-sep" aria-hidden="true">—</span>
        <input class="price-input" type="number" min="0" step="1000" data-price="max" aria-label="Precio máximo" placeholder="Máximo" value="${state.max ?? ''}">
      </div>
      <p class="price-hint">Los equipos en renta se comparan por su costo mensual.</p>
    </div>
    <div class="filter-group">
      <div class="filter-group-title">Horas de uso</div>
      <div class="price-inputs">
        <input class="price-input" type="number" min="0" step="500" data-tec="horasMax"
               aria-label="Horas de uso máximas" placeholder="Hasta…" value="${state.horasMax ?? ''}">
      </div>
      <p class="price-hint">Los equipos nuevos aparecen siempre. Los usados sin horas
        capturadas no salen con este filtro puesto.</p>
    </div>
    <div class="filter-group">
      <div class="filter-group-title">Peso operativo (toneladas)</div>
      <div class="price-inputs">
        <input class="price-input" type="number" min="0" step="1" data-tec="pesoMin" aria-label="Peso mínimo" placeholder="Mínimo" value="${state.pesoMin ?? ''}">
        <span class="price-sep" aria-hidden="true">—</span>
        <input class="price-input" type="number" min="0" step="1" data-tec="pesoMax" aria-label="Peso máximo" placeholder="Máximo" value="${state.pesoMax ?? ''}">
      </div>
    </div>
    <div class="filter-group">
      <div class="filter-group-title">Financiamiento</div>
      ${FINANCE_OPTS.map(o=>checkboxRow('fin',o.value,o.label,
        finBase.filter(p=>o.value==='msi'?!!p.finance:!!p.leasing).length)).join('')}
    </div>
    <div class="filter-group">
      <div class="filter-group-title">Ubicación</div>
      ${locations().map(l=>checkboxRow('loc',l,l,locCount(l))).join('')}
    </div>
    <div class="filter-group">
      <div class="filter-group-title">Guardados</div>
      <label class="filter-opt">
        <input type="checkbox" data-filter="fav"${state.onlyFavs?' checked':''}>
        <span>Sólo favoritos</span>
        <span class="filter-count">${favorites.size}</span>
      </label>
    </div>`;
}

function renderFilters(){
  const active = document.activeElement;
  const card = active && active.closest ? active.closest('.filter-card') : null;
  /* Los filtros se redibujan enteros en cada cambio (los conteos dependen del
     resto), así que hay que devolver el foco al control donde estaba o se
     pierde a media escritura. */
  const mark = card ? (active.dataset.filter
      ? `[data-filter="${active.dataset.filter}"]${active.value?`[value="${active.value}"]`:''}`
      : active.dataset.price ? `[data-price="${active.dataset.price}"]`
      : active.dataset.tec ? `[data-tec="${active.dataset.tec}"]` : null) : null;

  const html = filterHTML();
  $('#filterCardDesktop').innerHTML = html;
  $('#filterCardMobile').innerHTML = html;

  if(mark && card){ const again = card.querySelector(mark); if(again) again.focus() }

  const badge = $('#filtersCountBadge');
  const n = activeFilterCount();
  badge.textContent = n;
  badge.hidden = n===0;
}

/* ══════════════════ RENDER: NAV Y BUSCADOR ══════════════════ */
let navSignature = '';
function renderNav(){
  const list = navCatList();
  const sig = list.join('|');
  const nav = $('#navCats');
  if(sig !== navSignature){
    navSignature = sig;
    nav.innerHTML = list.map(c=>`<button class="nav-cat" type="button" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
    $('#searchCat').innerHTML = `<option value="Todos">Todas las categorías</option>` +
      baseCats().map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
  }
  nav.querySelectorAll('[data-cat]').forEach(b=>b.setAttribute('aria-current', String(b.dataset.cat===state.cat)));
  $('#searchCat').value = baseCats().includes(state.cat) ? state.cat : 'Todos';
}

/* ══════════════════ RENDER: PRODUCTOS ══════════════════ */
function badgeHTML(p){
  /* Vendido y apartado van PRIMERO, por encima de "Nuevo" o "Mas vendido".
     Un equipo vendido con la etiqueta de oferta es una llamada perdida para
     los dos: el cliente se ilusiona y tu explicas lo mismo por decima vez. */
  if(p.disponibilidad==='vendido') return '<span class="pcard-badge badge-vendido">Vendido</span>';
  if(p.disponibilidad==='apartado') return '<span class="pcard-badge badge-apartado">Apartado</span>';
  if(p.cond==='Renta') return '<span class="pcard-badge badge-rent">En renta</span>';
  if(p.hot) return '<span class="pcard-badge badge-hot">🔥 Más vendido</span>';
  if(p.cond==='Nuevo') return '<span class="pcard-badge badge-new">Nuevo</span>';
  return '<span class="pcard-badge badge-used">Usado cert.</span>';
}

/* `decoding="async"` deja que el navegador descomprima la foto sin frenar el
   dibujado de la pagina. Con nueve tarjetas y fotos de verdad, la diferencia
   se nota en un celular de obra: la pagina responde mientras las imagenes
   siguen llegando, en vez de quedarse tiesa. */
const productMedia = (p, alt=true) => {
  if(!p.img) return svgs[p.svgKey] || svgs.excavadora;

  /* `sizes` le dice al navegador cuanto ancho ocupara la foto ANTES de
     descargarla, para que elija el archivo adecuado. Sin esto supone que
     ocupa toda la pantalla y se baja siempre la grande, que es justo lo que
     veniamos a evitar.

     Los valores siguen la rejilla: tres columnas en escritorio, dos en
     tableta, una en movil. */
  const set = typeof fotoSrcset === 'function' ? fotoSrcset(p.img) : '';
  return `<img src="${esc(p.img)}" alt="${alt?esc(p.name):''}" loading="lazy" decoding="async"` +
    (set ? ` srcset="${esc(set)}" sizes="(max-width:560px) 92vw, (max-width:1024px) 46vw, 30vw"` : '') +
    '>';
};

function priceHTML(p){
  if(p.cond==='Renta') return `<span class="pcard-price">${fmtCompact(p.price)}<small> /mes</small></span>`;
  const d = discPct(p)
    ? `<span class="pcard-original">${fmtCompact(p.original)}</span><span class="pcard-disc">−${discPct(p)}%</span>` : '';
  return `<span class="pcard-price">${fmtCompact(p.price)}</span>${d}`;
}

function cardHTML(p){
  const fav = favorites.has(p.id);
  const agotado = p.disponibilidad === 'vendido' || p.disponibilidad === 'apartado';
  return `<article class="pcard${agotado?' agotado':''}">
    <div class="pcard-img">
      ${productMedia(p)}
      ${p.imgs.length>1||p.video?`<span class="pcard-fotos" aria-label="${p.imgs.length} fotos${p.video?' y video':''}">${
        p.imgs.length>1?`📷 ${p.imgs.length}`:''}${p.imgs.length>1&&p.video?' · ':''}${p.video?'▶':''}</span>`:''}
      ${badgeHTML(p)}
      <button class="pcard-fav" type="button" data-fav="${p.id}" aria-pressed="${fav}"
              aria-label="${fav?'Quitar de':'Guardar en'} favoritos: ${esc(p.name)}">${fav?'♥':'♡'}</button>
      <button class="pcard-cmp" type="button" data-cmp="${p.id}" aria-pressed="${state.compare.includes(p.id)}"
              title="Comparar" aria-label="${state.compare.includes(p.id)?'Quitar de la':'Agregar a la'} comparación: ${esc(p.name)}">⇄</button>
      <button class="pcard-edit" type="button" data-edit="${p.id}" title="Editar equipo" aria-label="Editar ${esc(p.name)}">✎</button>
    </div>
    <div class="pcard-body">
      <p class="pcard-cat">${esc(p.cat)} · ${esc(p.brand)}</p>
      <h3><button class="pcard-name" type="button" data-open="${p.id}">${esc(p.name)}</button></h3>
      <p class="pcard-meta">📍 ${esc(p.location)} · ${p.year} <span class="pcard-seller-tag">✓ Verificado</span></p>
      <div class="pcard-specs-row">${p.specs.map(s=>`<span class="pcard-spec">${esc(s)}</span>`).join('')}</div>
    </div>
    <div class="pcard-price-area">
      ${priceHTML(p)}
      ${p.finance?`<p class="pcard-finance">💳 ${esc(p.finance)} sin intereses</p>`:''}
      ${p.shipping?`<p class="pcard-shipping">🚚 Envío incluido a obra</p>`:''}
      <div class="pcard-actions">
        <button class="btn-add" type="button" data-add="${p.id}">+ Agregar a cotización</button>
        <button class="btn-quote" type="button" data-open="${p.id}">Ver ficha</button>
      </div>
    </div>
  </article>`;
}

/**
 * Anota que se abrió una ficha, al frente del historial y sin repetirla.
 *
 * Se llama desde openModal, no al pintar la tarjeta: pasar por delante de un
 * equipo mientras se hace scroll no es haberlo mirado. Sólo abrir la ficha lo
 * es, y esa es justo la señal que sirve para traerlo de vuelta después.
 */
function anotarVisto(id){
  vistos = [id, ...vistos.filter(x => x !== id)].slice(0, MAX_VISTOS);
  saveVistos();
  renderVistos();
}

/**
 * La fila de "vistos recientemente".
 *
 * Se esconde con menos de dos: una sola tarjeta no es un historial, es la
 * ficha que acabas de cerrar repetida debajo del catálogo.
 *
 * Los ids que ya no existen en el catálogo —equipo vendido y retirado— se
 * caen solos aquí, sin necesidad de limpiar el almacenamiento.
 */
function renderVistos(){
  const caja = $('#vistos');
  if(!caja) return;                             // las páginas generadas no la tienen

  const lista = vistos.map(id => products.find(p => p.id === id)).filter(Boolean);
  caja.hidden = lista.length < 2;
  if(caja.hidden){ $('#vistosRow').innerHTML = ''; return }

  $('#vistosRow').innerHTML = lista.map(p => `
    <button class="visto" type="button" data-open="${p.id}">
      <span class="visto-img">${productMedia(p, false)}</span>
      <span class="visto-name">${esc(p.name)}</span>
      <span class="visto-price">${fmtCompact(p.price)}${p.cond==='Renta'?' <small>/mes</small>':''}</span>
    </button>`).join('');
}

function render(){
  const results = sortList(filterAll());
  const totalPages = Math.max(1, Math.ceil(results.length / PER_PAGE));
  if(state.page > totalPages) state.page = totalPages;
  const start = (state.page-1)*PER_PAGE;
  const pageItems = results.slice(start, start+PER_PAGE);

  const grid = $('#productGrid');
  grid.className = 'product-grid' + (state.view==='list' ? ' list' : '');

  if(!results.length){
    grid.innerHTML = `<div class="empty-state">
      <div class="icon" aria-hidden="true">${products.length?'🔍':'📦'}</div>
      <h3>${products.length?'Sin resultados':'Aún no hay equipos publicados'}</h3>
      <p>${products.length?'Ningún equipo coincide con los filtros seleccionados.':'Entra al panel de administración para publicar el primero.'}</p>
      <button type="button" data-action="${products.length?'clear-filters':'admin-new'}">${products.length?'Limpiar filtros':'+ Publicar equipo'}</button>
    </div>`;
    $('#resultsCount').innerHTML = '<strong>0 equipos</strong> encontrados';
    $('#pagination').innerHTML = '';
  } else {
    grid.innerHTML = pageItems.map(cardHTML).join('');
    $('#resultsCount').innerHTML =
      `<strong>${results.length} equipo${results.length===1?'':'s'}</strong> · mostrando ${start+1}–${start+pageItems.length}`;
    renderPagination(totalPages);
  }

  renderChips();
  renderFilters();
  renderNav();
  renderCompareBar();
  renderVistos();
  if(isAdmin) $('#adminBarInfo').textContent = `${products.length} equipos · ${fmtKB(store.usedBytes())} usados`;
}

/* ══════════════════ COMPARADOR ══════════════════ */

/** Equipos elegidos, en el orden en que se eligieron y sin los que ya no existen. */
const comparados = () => state.compare
  .map(id => products.find(p => p.id === id))
  .filter(Boolean);

function toggleCompare(id){
  const i = state.compare.indexOf(id);
  if(i >= 0){ state.compare.splice(i, 1) }
  else if(state.compare.length >= MAX_COMPARA){
    showToast(`Puedes comparar hasta ${MAX_COMPARA} equipos. Quita uno para agregar otro.`, true);
    return;
  }
  else state.compare.push(id);
  render();
  // Si la comparación está abierta, se redibuja con el cambio en vez de quedarse vieja.
  if(currentPage === 'comparar') openPage('comparar');
}

function clearCompare(){
  state.compare = [];
  render();
  if(currentPage === 'comparar') closeAll();
}

function renderCompareBar(){
  const bar = $('#cmpBar');
  if(!bar) return;
  const lista = comparados();
  // El estado puede traer ids de equipos ya eliminados: se limpia aquí.
  state.compare = lista.map(p => p.id);
  bar.hidden = lista.length === 0;
  // La barra va fija al fondo: sin este margen taparía la paginación y el pie.
  document.body.classList.toggle('con-cmp', lista.length > 0);
  if(!lista.length) return;

  $('#cmpChips').innerHTML = lista.map(p => `
    <span class="cmp-chip">
      <span class="cmp-chip-img">${productMedia(p, false)}</span>
      <span class="cmp-chip-name">${esc(p.name)}</span>
      <button type="button" data-cmp="${p.id}" aria-label="Quitar ${esc(p.name)} de la comparación">×</button>
    </span>`).join('');

  const btn = $('#cmpOpen');
  btn.textContent = `Comparar (${lista.length})`;
  // Comparar uno contra nada no compara nada: el botón lo dice en vez de fallar.
  btn.disabled = lista.length < 2;
  btn.title = lista.length < 2 ? 'Elige al menos dos equipos' : '';
}

function renderPagination(totalPages){
  if(totalPages<=1){ $('#pagination').innerHTML=''; return }
  const cur = state.page, pages = [];
  if(totalPages<=7){ for(let i=1;i<=totalPages;i++) pages.push(i) }
  else{
    pages.push(1);
    if(cur>3) pages.push('…');
    for(let i=Math.max(2,cur-1);i<=Math.min(totalPages-1,cur+1);i++) pages.push(i);
    if(cur<totalPages-2) pages.push('…');
    pages.push(totalPages);
  }
  $('#pagination').innerHTML =
    `<button class="pag-btn" type="button" data-page="${cur-1}" ${cur===1?'disabled':''} aria-label="Página anterior">‹</button>` +
    pages.map(p => p==='…' ? '<span class="pag-gap" aria-hidden="true">…</span>'
      : `<button class="pag-btn" type="button" data-page="${p}" ${p===cur?'aria-current="page"':''} aria-label="Página ${p}">${p}</button>`).join('') +
    `<button class="pag-btn" type="button" data-page="${cur+1}" ${cur===totalPages?'disabled':''} aria-label="Página siguiente">›</button>`;
}

function renderChips(){
  const chips = [];
  if(state.cat!=='Todos') chips.push({type:'cat',value:state.cat,label:state.cat});
  state.conds.forEach(v=>chips.push({type:'cond',value:v,label:COND_LABELS[v]}));
  state.brands.forEach(v=>chips.push({type:'brand',value:v,label:BRAND_LABELS[v]||v}));
  state.locations.forEach(v=>chips.push({type:'loc',value:v,label:'📍 '+v}));
  state.finance.forEach(v=>chips.push({type:'fin',value:v,label:FINANCE_OPTS.find(o=>o.value===v).label}));
  if(state.min!=null) chips.push({type:'min',value:'',label:'Desde '+fmtCompact(state.min)});
  if(state.max!=null) chips.push({type:'max',value:'',label:'Hasta '+fmtCompact(state.max)});
  if(state.horasMax!=null) chips.push({type:'horasMax',value:'',label:`Hasta ${nf.format(state.horasMax)} h`});
  if(state.pesoMin!=null) chips.push({type:'pesoMin',value:'',label:`Desde ${state.pesoMin} t`});
  if(state.pesoMax!=null) chips.push({type:'pesoMax',value:'',label:`Hasta ${state.pesoMax} t`});
  if(state.q) chips.push({type:'q',value:'',label:`“${state.q}”`});
  if(state.onlyFavs) chips.push({type:'fav',value:'',label:'♥ Favoritos'});

  $('#activeFilters').innerHTML = chips.length
    ? chips.map(c=>`<span class="af-tag">${esc(c.label)}
        <button type="button" data-chip="${c.type}" data-value="${esc(c.value)}" aria-label="Quitar filtro ${esc(c.label)}">×</button></span>`).join('')
      + (chips.length>1?'<button class="af-clear" type="button" data-action="clear-filters">Limpiar todo</button>':'')
    : '';
}
