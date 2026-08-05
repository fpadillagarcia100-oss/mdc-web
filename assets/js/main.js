/**
 * main.js — Cableado de eventos, envío de formularios y arranque de la aplicación.
 * Debe cargarse al final: asume que todo lo demás ya está definido.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 */
'use strict';

/* ══════════════════ EVENTOS GLOBALES ══════════════════ */
document.addEventListener('click', e => {
  const t = e.target;

  /* — Páginas de contenido — */
  const goto = t.closest('[data-goto]');
  if(goto){ e.preventDefault(); openPage(goto.dataset.goto); return }

  const sendMail = t.closest('[data-send="mail"]');
  if(sendMail){ e.preventDefault(); submitCurrentForm('mail'); return }

  const branchDel = t.closest('[data-branch-del]');
  if(branchDel){
    const i = Number(branchDel.dataset.branchDel);
    const b = settings.branches[i];
    if(b && confirm(`¿Eliminar la sucursal "${b.name}"?`)){
      settings.branches.splice(i,1);
      saveSettings(); renderAdmin();
      showToast('Sucursal eliminada');
    }
    return;
  }

  /* — Admin — */
  const admOpen = t.closest('[data-admin-open]');
  if(admOpen){ editingId = null; draftImgs = undefined; openAdmin(admOpen.dataset.adminOpen); return }

  const tabBtn = t.closest('.admin-tab');
  if(tabBtn){ adminTab = tabBtn.dataset.tab; editingId = null; draftImgs = undefined; renderAdmin(); return }

  const editBtn = t.closest('[data-edit]');
  if(editBtn){ editingId = Number(editBtn.dataset.edit); draftImgs = undefined; openAdmin('products'); return }

  const fotoMov = t.closest('[data-foto-mov]');
  if(fotoMov){ moverFoto(Number(fotoMov.dataset.fotoMov), Number(fotoMov.dataset.paso)); return }

  const fotoQuita = t.closest('[data-foto-quita]');
  if(fotoQuita){ quitarFoto(Number(fotoQuita.dataset.fotoQuita)); return }

  const dupBtn = t.closest('[data-dup]');
  if(dupBtn){ duplicateProduct(Number(dupBtn.dataset.dup)); return }

  const delBtn = t.closest('[data-delp]');
  if(delBtn){ deleteProduct(Number(delBtn.dataset.delp)); return }

  const act = t.closest('[data-action]');
  if(act){
    const a = act.dataset.action;
    if(a==='clear-filters'){ clearFilters(); return }
    if(a==='home'){ e.preventDefault(); clearFilters(); $('#catalogo').scrollIntoView({block:'start'}); return }
    if(a==='admin-new'){ editingId = 0; draftImgs = undefined; openAdmin('products'); return }
    if(a==='admin-cancel'){ editingId = null; draftImgs = undefined; renderAdmin(); return }
    if(a==='logo-remove'){ settings.logo = null; saveSettings(); applyBranding(); renderAdmin(); return }
    if(a==='hero-remove'){ settings.heroImage = null; saveSettings(); applyBranding(); renderAdmin(); return }
    if(a==='accent-reset'){ settings.accent = DEFAULT_SETTINGS.accent; saveSettings(); applyBranding(); renderAdmin(); return }
    if(a==='export'){ exportBackup(); return }
    if(a==='import'){ $('#importInput').click(); return }
    if(a==='reset'){ resetAll(); return }
    if(a==='branch-add'){
      settings.branches = [...(settings.branches||[]), {name:'Nueva sucursal',address:'',phone:'',hours:''}];
      saveSettings(); renderAdmin();
      showToast('Sucursal agregada'); return;
    }
    if(a==='acct-clear'){
      if(!confirm('Se borrarán tus datos de contacto y el historial de solicitudes de este dispositivo.\n\n¿Continuar?')) return;
      account = null;
      try{ localStorage.removeItem(K.account); localStorage.removeItem(K.requests) }catch{}
      updateAcctLabel(); openPage('cuenta');
      showToast('Datos borrados de este dispositivo'); return;
    }
  }

  /* — Catálogo — */
  const galBtn = t.closest('[data-gal]');
  if(galBtn){ moverGaleria(Number(galBtn.dataset.gal)); return }

  const galGo = t.closest('[data-gal-go]');
  if(galGo){ irGaleria(Number(galGo.dataset.galGo)); return }

  const openBtn = t.closest('[data-open]');
  if(openBtn){ openModal(Number(openBtn.dataset.open)); return }

  const addBtn = t.closest('[data-add]');
  if(addBtn){
    addToCart(Number(addBtn.dataset.add));
    if(addBtn.hasAttribute('data-close-after')) closeAll();
    return;
  }

  const favBtn = t.closest('[data-fav]');
  if(favBtn){ toggleFav(Number(favBtn.dataset.fav)); return }

  const navBtn = t.closest('[data-cat]');
  if(navBtn){ state.cat = navBtn.dataset.cat; state.page = 1; render(); return }

  const pageBtn = t.closest('[data-page]');
  if(pageBtn){ state.page = Number(pageBtn.dataset.page); render(); $('#catalogo').scrollIntoView({block:'start'}); return }

  const chipBtn = t.closest('[data-chip]');
  if(chipBtn){ removeChip(chipBtn.dataset.chip, chipBtn.dataset.value); return }

  const viewBtn = t.closest('[data-view]');
  if(viewBtn){
    state.view = viewBtn.dataset.view;
    $$('[data-view]').forEach(b=>b.setAttribute('aria-pressed', String(b.dataset.view===state.view)));
    render(); return;
  }

  if(t.closest('[data-close-cart]') || t.id==='overlay'){ closeAll(); return }

  const qty = t.closest('[data-qty]');
  if(qty){ changeQty(Number(qty.dataset.id), Number(qty.dataset.qty)); return }
  const del = t.closest('[data-del]');
  if(del){ removeFromCart(Number(del.dataset.del)); return }

  const card = t.closest('.pcard');
  if(card && !t.closest('button')){
    const name = card.querySelector('[data-open]');
    if(name) openModal(Number(name.dataset.open));
  }
});

document.addEventListener('change', e => {
  const cb = e.target.closest('[data-filter]');
  if(cb){
    const group = cb.dataset.filter;
    if(group==='fav') state.onlyFavs = cb.checked;
    else{
      const key = GROUP_KEY[group];
      state[key] = cb.checked ? [...state[key], cb.value] : state[key].filter(v=>v!==cb.value);
    }
    state.page = 1; render(); return;
  }
  const price = e.target.closest('[data-price]');
  if(price){
    const v = price.value === '' ? null : Math.max(0, Number(price.value));
    state[price.dataset.price] = Number.isFinite(v) ? v : null;
    if(state.min!=null && state.max!=null && state.min > state.max) [state.min, state.max] = [state.max, state.min];
    state.page = 1; render(); return;
  }
  if(e.target.id==='sortSel'){ state.sort = e.target.value; state.page = 1; render(); return }
  if(e.target.id==='searchCat'){ state.cat = e.target.value; state.page = 1; render(); return }
  if(e.target.id==='importInput'){ const f = e.target.files[0]; if(f) importBackup(f); e.target.value=''; return }

  /* Sucursales: se guardan al salir del campo */
  const branchField = e.target.closest('[data-branch]');
  if(branchField){
    const b = settings.branches[Number(branchField.dataset.branch)];
    if(b){ b[branchField.dataset.bfield] = branchField.value.trim(); saveSettings() }
    return;
  }

  /* Ajustes del sitio: se guardan al salir del campo */
  const setter = e.target.closest('[data-set]');
  if(setter){
    const key = setter.dataset.set;
    const val = setter.value.trim();
    settings[key] = (key==='pin' && !val) ? DEFAULT_SETTINGS.pin : val;
    saveSettings(); applyBranding();
  }
});

/* ── Envío de formularios ── */
function submitCurrentForm(channel){
  const subject = currentPage === 'vender' ? 'Publicación de equipo'
                : currentPage === 'cotizar' ? 'Solicitud de cotización' : null;
  if(!subject) return;

  // Validar SIEMPRE antes del filtro anti-bot: si no, el usuario recibiría un
  // "vuelve a enviar" genérico en lugar de ver qué campo tiene mal.
  const body = currentPage === 'vender' ? sellPayload() : quotePayload();
  if(!body) return;

  if(botCheck() !== 'ok') return;
  deliver(channel, subject, body);
}

document.addEventListener('submit', async e => {
  const id = e.target.id;
  if(!['sellForm','quoteForm','acctForm','pinChangeForm'].includes(id)) return;
  e.preventDefault();

  if(id==='sellForm' || id==='quoteForm'){ submitCurrentForm('wa'); return }

  if(id==='acctForm'){
    const v = readAndValidate([
      {id:'a-name', required:true},
      {id:'a-phone', required:true, type:'tel'},
      {id:'a-email', type:'email'}
    ]);
    if(!v) return;
    account = {name:v['a-name'], phone:v['a-phone'], email:v['a-email']};
    saveAccount(); updateAcctLabel(); openPage('cuenta');
    showToast('Datos guardados en este dispositivo');
    return;
  }

  if(id==='pinChangeForm'){
    const nuevo = $('#p-new'), conf = $('#p-confirm');
    [nuevo, conf].forEach(el=>el.closest('.field').classList.remove('err'));
    if(!/^\d{4,8}$/.test(nuevo.value)){
      nuevo.closest('.field').classList.add('err'); nuevo.focus();
      showToast('El PIN debe tener entre 4 y 8 dígitos', true); return;
    }
    if(nuevo.value !== conf.value){
      conf.closest('.field').classList.add('err'); conf.focus();
      showToast('Los PIN no coinciden', true); return;
    }
    settings.pinHash = await hashPin(nuevo.value);
    delete settings.pin;
    saveSettings(); renderAdmin();
    showToast('PIN actualizado');
  }
});

/* Vista previa en vivo del color de acento */
document.addEventListener('input', e => {
  if(e.target.id==='s-accent'){
    document.documentElement.style.setProperty('--y', e.target.value);
    document.documentElement.style.setProperty('--yd', darken(e.target.value));
  }
});

let searchTimer;
const runSearch = (scroll=false) => {
  clearTimeout(searchTimer);
  state.q = $('#searchInput').value.trim().toLowerCase();
  state.page = 1;
  render();
  if(scroll) $('#catalogo').scrollIntoView({block:'start'});
};
$('#searchInput').addEventListener('input', ()=>{ clearTimeout(searchTimer); searchTimer = setTimeout(()=>runSearch(), 250) });
$('#searchInput').addEventListener('keydown', e => { if(e.key==='Enter') runSearch(true) });
$('#searchBtn').addEventListener('click', ()=>runSearch(true));

$('#cartToggle').addEventListener('click', ()=>{
  const d = $('#cartDrawer');
  d.classList.contains('open') ? closeAll() : openDrawer(d);
});
$('#filtersToggle').addEventListener('click', ()=>{
  const d = $('#filterDrawer');
  d.classList.contains('open') ? closeAll() : openDrawer(d);
});
$('#modalClose').addEventListener('click', closeAll);
$('#modalOverlay').addEventListener('click', e => { if(e.target.id==='modalOverlay') closeAll() });
$('#adminClose').addEventListener('click', closeAll);
$('#adminOverlay').addEventListener('click', e => { if(e.target.id==='adminOverlay') closeAll() });
$('#adminEntry').addEventListener('click', ()=>{ editingId = null; draftImgs = undefined; openAdmin('products') });
$('#adminLogout').addEventListener('click', logoutAdmin);

$('#pageClose').addEventListener('click', closeAll);
$('#pageOverlay').addEventListener('click', e => { if(e.target.id==='pageOverlay') closeAll() });

$('#checkoutBtn').addEventListener('click', ()=>{
  if(!cart.length){ showToast('Agrega equipos primero'); return }
  openPage('cotizar');
});
$('#waBtn').addEventListener('click', e => { if(!cart.length){ e.preventDefault(); showToast('Agrega equipos primero') } });

document.addEventListener('keydown', e => {
  if(e.key==='Escape' && (openPanel || $('#modalOverlay').classList.contains('open'))) closeAll();
  // Flechas para recorrer la galería, sólo con la ficha abierta y fuera de un campo.
  if(galeria.id && (e.key==='ArrowLeft' || e.key==='ArrowRight')
     && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)){
    e.preventDefault();
    moverGaleria(e.key==='ArrowRight' ? 1 : -1);
  }
  // Ctrl+Shift+A abre el panel de administración
  if(e.ctrlKey && e.shiftKey && (e.key==='A' || e.key==='a')){
    e.preventDefault();
    editingId = null; draftImgs = undefined;
    openAdmin('products');
  }
  trapTab(e);
});

/* ══════════════════ INIT ══════════════════ */
if(isAdmin) document.body.classList.add('is-admin');
cart = cart.filter(c=>products.some(p=>p.id===c.id));
favorites = new Set([...favorites].filter(id=>products.some(p=>p.id===id)));
if(!Array.isArray(settings.branches)) settings.branches = DEFAULT_SETTINGS.branches.map(b=>({...b}));
applyBranding();
updateAcctLabel();
render();
renderCart();
ensurePinHash();
