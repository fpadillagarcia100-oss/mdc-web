/**
 * ui.js — Superposiciones compartidas: cajones, modal de ficha, foco atrapado y avisos.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 */
'use strict';

/* ══════════════════ OVERLAYS ══════════════════ */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
let lastFocused = null, openPanel = null;
const lockScroll = on => { document.body.style.overflow = on ? 'hidden' : '' };

function openDrawer(el){
  closeAll();
  lastFocused = document.activeElement;
  el.hidden = false;
  requestAnimationFrame(()=>el.classList.add('open'));
  $('#overlay').classList.add('open');
  lockScroll(true);
  openPanel = el;
  const f = el.querySelector(FOCUSABLE); if(f) f.focus();
  if(el.id==='cartDrawer') $('#cartToggle').setAttribute('aria-expanded','true');
  if(el.id==='filterDrawer') $('#filtersToggle').setAttribute('aria-expanded','true');
}

function closeAll(){
  ['#cartDrawer','#filterDrawer'].forEach(sel=>{
    const el = $(sel);
    if(el.classList.contains('open')){
      el.classList.remove('open');
      setTimeout(()=>{ if(!el.classList.contains('open')) el.hidden = true }, 300);
    }
  });
  $('#modalOverlay').classList.remove('open');
  $('#adminOverlay').classList.remove('open');
  $('#pageOverlay').classList.remove('open');
  $('#overlay').classList.remove('open');
  currentPage = null;
  $('#cartToggle').setAttribute('aria-expanded','false');
  $('#filtersToggle').setAttribute('aria-expanded','false');
  lockScroll(false);
  if(openPanel && lastFocused && document.contains(lastFocused)) lastFocused.focus();
  openPanel = null;
}

function trapTab(e){
  if(e.key!=='Tab' || !openPanel) return;
  const items = [...openPanel.querySelectorAll(FOCUSABLE)].filter(el=>el.offsetParent!==null);
  if(!items.length) return;
  const first = items[0], last = items[items.length-1];
  if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus() }
  else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus() }
}

/* ══════════════════ MODAL PRODUCTO ══════════════════ */
function openModal(id){
  const p = products.find(x=>x.id===id);
  if(!p) return;
  closeAll();
  lastFocused = document.activeElement;

  const imgBox = $('#modalImg');
  imgBox.className = 'modal-img' + (p.img ? ' has-photo' : '');
  imgBox.innerHTML = productMedia(p, false);

  const months = p.finance ? parseInt(p.finance,10) : 0;
  const disc = discPct(p)
    ? `<span style="font-size:14px;color:#767676;text-decoration:line-through">${fmtCompact(p.original)}</span>
       <span style="font-size:14px;color:#D32F2F;font-weight:600">−${discPct(p)}%</span>` : '';

  $('#modalInfo').innerHTML = `
    <p class="modal-cat">${esc(p.cat)} · ${esc(p.brand)}</p>
    <h2 class="modal-name" id="modalName">${esc(p.name)}</h2>
    <div class="modal-seller-row">
      <span class="modal-seller">Vendedor: ${esc(settings.sellerName)} · 📍 ${esc(p.location)}</span>
      <span class="modal-verified">✓ Verificado</span>
    </div>
    <div class="modal-price-area">
      <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
        <span class="modal-price">${fmtFull(p.price)}${p.cond==='Renta'?'<small> /mes</small>':''}</span>${disc}
      </div>
      ${months?`<p class="modal-price-sub">💳 ${esc(p.finance)} sin intereses = ${fmtFull(Math.round(p.price/months))} al mes</p>`:''}
      ${p.leasing?`<p class="modal-price-sub">🏦 Disponible en arrendamiento puro</p>`:''}
      ${p.shipping?`<p style="font-size:13px;color:#2E7D32;margin-top:4px">🚚 Envío incluido a pie de obra</p>`:''}
    </div>
    <div class="modal-specs">
      ${p.specs.map((s,i)=>`<div class="modal-spec"><div class="modal-spec-label">${['Capacidad','Potencia','Detalle'][i]||'Especificación'}</div><div class="modal-spec-val">${esc(s)}</div></div>`).join('')}
      <div class="modal-spec"><div class="modal-spec-label">Condición</div><div class="modal-spec-val">${esc(COND_LABELS[p.cond])}</div></div>
      <div class="modal-spec"><div class="modal-spec-label">Año</div><div class="modal-spec-val">${p.year}</div></div>
      <div class="modal-spec"><div class="modal-spec-label">Garantía</div><div class="modal-spec-val">${p.cond==='Nuevo'?'12 meses fábrica':p.cond==='Renta'?'Incluida en renta':'6 meses certificada'}</div></div>
    </div>
    <p class="modal-desc">${esc(p.desc)}</p>
    <div class="modal-actions">
      <button class="modal-add" type="button" data-add="${p.id}" data-close-after>+ Agregar a cotización</button>
      <button class="modal-quote" type="button" data-fav="${p.id}">${favorites.has(p.id)?'♥ Guardado':'♡ Guardar'}</button>
      ${isAdmin?`<button class="modal-quote" type="button" data-edit="${p.id}">✎ Editar</button>`:''}
    </div>`;

  $('#modalOverlay').classList.add('open');
  lockScroll(true);
  openPanel = $('#modal');
  $('#modalClose').focus();
}

/* ══════════════════ TOAST ══════════════════ */
let toastTimer;
function showToast(msg, isError=false){
  const t = $('#toast');
  $('#toastMsg').textContent = msg;
  t.classList.toggle('error', isError);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove('show'), isError?5000:2800);
}

/* ══════════════════ ACCIONES CATÁLOGO ══════════════════ */
function toggleFav(id){
  if(favorites.has(id)) favorites.delete(id); else favorites.add(id);
  saveFavs(); render();
  const inModal = $(`#modalInfo [data-fav="${id}"]`);
  if(inModal) inModal.textContent = favorites.has(id) ? '♥ Guardado' : '♡ Guardar';
  showToast(favorites.has(id)?'Agregado a favoritos ♥':'Quitado de favoritos');
}

function clearFilters(){
  Object.assign(state,{cat:'Todos',conds:[],brands:[],locations:[],finance:[],onlyFavs:false,min:null,max:null,q:'',page:1});
  $('#searchInput').value = '';
  render();
}

function removeChip(type,value){
  state.page = 1;
  switch(type){
    case 'cat': state.cat='Todos'; break;
    case 'cond': state.conds = state.conds.filter(v=>v!==value); break;
    case 'brand': state.brands = state.brands.filter(v=>v!==value); break;
    case 'loc': state.locations = state.locations.filter(v=>v!==value); break;
    case 'fin': state.finance = state.finance.filter(v=>v!==value); break;
    case 'min': state.min=null; break;
    case 'max': state.max=null; break;
    case 'q': state.q=''; $('#searchInput').value=''; break;
    case 'fav': state.onlyFavs=false; break;
  }
  render();
}
