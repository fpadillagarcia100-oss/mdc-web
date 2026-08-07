/**
 * main.js — Cableado de eventos, envío de formularios y arranque de la aplicación.
 * Debe cargarse al final: asume que todo lo demás ya está definido.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 */
'use strict';

/**
 * Abre la ficha haciendo crecer la foto desde su lugar en la rejilla.
 *
 * Es una transición de elemento compartido: se le pone el mismo
 * `view-transition-name` a la foto de la tarjeta ANTES del cambio y a la foto
 * de la ficha DESPUÉS, y el navegador entiende que son la misma cosa en dos
 * sitios, así que la interpola en lugar de fundir una con otra.
 *
 * Dos cuidados que no son evidentes:
 *
 *   · El nombre se le quita a la tarjeta dentro de la misma tanda en que se le
 *     pone a la ficha. Si las dos lo llevaran a la vez el navegador aborta la
 *     transición entera: un nombre, un elemento.
 *   · Mientras dura, se apaga la transición CSS del modal (`body.vt-modal`).
 *     El navegador fotografía el resultado inmediatamente, y con la animación
 *     de apertura encendida esa foto saldría del modal aún transparente.
 *
 * Sin la API, o con menos animación pedida, abre el modal de siempre.
 */
function abrirFicha(id, tarjeta){
  const quieto = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const origen = tarjeta && tarjeta.querySelector('.pcard-img img, .pcard-img svg');
  if(quieto || !document.startViewTransition || !origen){ openModal(id); return }

  origen.style.viewTransitionName = 'fichafoto';
  document.body.classList.add('vt-modal');

  const vt = document.startViewTransition(()=>{
    origen.style.viewTransitionName = '';
    openModal(id);
    const destino = document.querySelector('#modalImg .gal-main, #modalImg img, #modalImg svg');
    if(destino) destino.style.viewTransitionName = 'fichafoto';
  });

  const limpiar = ()=>{
    origen.style.viewTransitionName = '';
    const d = document.querySelector('#modalImg .gal-main, #modalImg img, #modalImg svg');
    if(d) d.style.viewTransitionName = '';
    document.body.classList.remove('vt-modal');
  };
  vt.finished.then(limpiar, limpiar);
}

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
      guardarSucursalesRemoto(); renderAdmin();
    }
    return;
  }

  /* — Admin — */
  const admOpen = t.closest('[data-admin-open]');
  if(admOpen){ editingId = null; draftImgs = undefined; openAdmin(admOpen.dataset.adminOpen); return }

  const tabBtn = t.closest('.admin-tab');
  if(tabBtn){
    if(!isAdmin) return;   // sin sesión, una pestaña no es una puerta
    adminTab = tabBtn.dataset.tab; editingId = null; draftImgs = undefined; renderAdmin(); return;
  }

  const editBtn = t.closest('[data-edit]');
  if(editBtn){ editingId = Number(editBtn.dataset.edit); draftImgs = undefined; openAdmin('products'); return }

  const fotoMov = t.closest('[data-foto-mov]');
  if(fotoMov){ moverFoto(Number(fotoMov.dataset.fotoMov), Number(fotoMov.dataset.paso)); return }

  const fotoQuita = t.closest('[data-foto-quita]');
  if(fotoQuita){ quitarFoto(Number(fotoQuita.dataset.fotoQuita)); return }

  const solBtn = t.closest('[data-sol]');
  if(solBtn){ cambiarEstadoSolicitud(Number(solBtn.dataset.sol), solBtn.dataset.estado); return }

  const respBtn = t.closest('[data-resp]');
  if(respBtn){ responderPregunta(Number(respBtn.dataset.resp)); return }

  const qDel = t.closest('[data-qdel]');
  if(qDel){ borrarPregunta(Number(qDel.dataset.qdel)); return }

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
    if(a==='logo-remove'){ settings.logo = null; applyBranding(); guardarAjustesRemoto(); renderAdmin(); return }
    if(a==='hero-remove'){ settings.heroImage = null; applyBranding(); guardarAjustesRemoto(); renderAdmin(); return }
    if(a==='accent-reset'){ settings.accent = DEFAULT_SETTINGS.accent; applyBranding(); guardarAjustesRemoto(); renderAdmin(); return }
    if(a==='fin-wa'){
      const msg = financiamientoPayload();
      if(msg) window.open(waLink(msg), '_blank', 'noopener');
      return;
    }
    if(a==='cmp-clear'){ clearCompare(); return }
    if(a==='cmp-open'){ openPage('comparar'); return }
    if(a==='export'){ exportBackup(); return }
    if(a==='import'){ $('#importInput').click(); return }
    if(a==='reset'){ resetAll(); return }
    if(a==='publicar'){ publicarSitio(); return }
    if(a==='branch-add'){
      settings.branches = [...(settings.branches||[]), {name:'Nueva sucursal',address:'',phone:'',hours:''}];
      guardarSucursalesRemoto(); renderAdmin(); return;
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

  // Ver el video: primero la portada, y sólo al pulsar el play entra YouTube.
  if(t.closest('[data-gal-video]')){ verVideo(); return }
  if(t.closest('[data-gal-play]')){ reproducirVideo(); return }

  // Mismo trato para el mapa de una sucursal: Google entra cuando se le pide.
  const mapaBtn = t.closest('[data-mapa]');
  if(mapaBtn){ verMapa(Number(mapaBtn.dataset.mapa)); return }

  const openBtn = t.closest('[data-open]');
  if(openBtn){ abrirFicha(Number(openBtn.dataset.open), openBtn.closest('.pcard')); return }

  const addBtn = t.closest('[data-add]');
  if(addBtn){
    addToCart(Number(addBtn.dataset.add));
    if(addBtn.hasAttribute('data-close-after')) closeAll();
    return;
  }

  if(t.closest('#vistosClear')){ vistos = []; saveVistos(); renderVistos(); return }

  const favBtn = t.closest('[data-fav]');
  if(favBtn){ toggleFav(Number(favBtn.dataset.fav)); return }

  const cmpBtn = t.closest('[data-cmp]');
  if(cmpBtn){ toggleCompare(Number(cmpBtn.dataset.cmp)); return }

  const navBtn = t.closest('[data-cat]');
  if(navBtn){
    /* Los del pie son enlaces de verdad a /maquinaria/<cat>/ — hacen falta
       para que Google llegue a esas páginas. Pero a quien ya está en el
       catálogo no se le manda a otra página: se le filtra aquí mismo, que es
       instantáneo y no le pierde el carrito ni el resto de filtros.

       El enlace sigue sirviendo para abrir en pestaña nueva y para el
       buscador. Lo único que se cancela es la navegación por clic. */
    if(navBtn.tagName === 'A') e.preventDefault();
    state.cat = navBtn.dataset.cat;
    state.page = 1;
    render();
    if(navBtn.tagName === 'A') $('#catalogo').scrollIntoView({block:'start'});
    return;
  }

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
    if(name) abrirFicha(Number(name.dataset.open), card);
  }
});

/* El selector de la página de financiamiento vive FUERA de la calculadora, así
   que ficha.js no lo escucha: hay que conectarlo aquí. */
document.addEventListener('input', e => {
  if(e.target.closest('[data-fin]')) actualizarFinanciamiento();
});

document.addEventListener('change', e => {
  if(e.target.closest('[data-fin]')){ actualizarFinanciamiento(); return }

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
  /* Filtros de ficha técnica. Comparten forma con los de precio pero no el
     manejador: el de precio intercambia mínimo y máximo si vienen al revés, y
     aquí "hasta 3,000 horas" no tiene pareja con la que intercambiarse. */
  const tec = e.target.closest('[data-tec]');
  if(tec){
    const v = tec.value === '' ? null : Math.max(0, Number(tec.value));
    state[tec.dataset.tec] = Number.isFinite(v) ? v : null;
    if(state.pesoMin!=null && state.pesoMax!=null && state.pesoMin > state.pesoMax){
      [state.pesoMin, state.pesoMax] = [state.pesoMax, state.pesoMin];
    }
    state.page = 1; render(); return;
  }

  /* Cambiar la categoría cambia qué datos técnicos aplican. */
  if(e.target.id === 'f-cat'){ refrescarAtributos(); return }

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
    if(b){ b[branchField.dataset.bfield] = branchField.value.trim(); guardarSucursalesRemoto() }
    return;
  }

  /* Ajustes del sitio: se guardan al salir del campo */
  const setter = e.target.closest('[data-set]');
  if(setter){
    const key = setter.dataset.set;
    const val = setter.value.trim();
    settings[key] = val;
    applyBranding();
    guardarAjustesRemoto();
  }
});

/* ── Envío de formularios ── */
function submitCurrentForm(channel){
  const subject = currentPage === 'vender' ? 'Publicación de equipo'
                : currentPage === 'cotizar' ? 'Solicitud de cotización' : null;
  if(!subject) return;

  // Validar SIEMPRE antes del filtro anti-bot: si no, el usuario recibiría un
  // "vuelve a enviar" genérico en lugar de ver qué campo tiene mal.
  const payload = currentPage === 'vender' ? sellPayload() : quotePayload();
  if(!payload) return;

  if(botCheck() !== 'ok') return;
  deliver(channel, subject, payload.texto, payload.datos);
}

document.addEventListener('submit', async e => {
  const id = e.target.id;
  if(!['sellForm','quoteForm','acctForm','qaForm'].includes(id)) return;
  e.preventDefault();

  if(id==='sellForm' || id==='quoteForm'){ submitCurrentForm('wa'); return }

  if(id==='qaForm'){ await enviarPregunta(e.target); return }

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
  /* Se guarda tal como se escribió, con acentos y mayúsculas: la etiqueta de
     filtro activo enseña esto mismo, y «“excavadora cat”» se lee mejor que lo
     que quedaría después de normalizar. De normalizar se encarga la búsqueda. */
  state.q = $('#searchInput').value.trim();
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
restaurarSesion();   // asíncrono: el panel se abre al confirmar, no antes

/* ── Botón flotante de WhatsApp ──
   El mensaje cambia según dónde esté el cliente: si tiene equipos en la
   cotización los nombra, y si está viendo una ficha, la menciona. No es
   adorno — que el cliente no tenga que explicar qué máquina le interesa
   quita el principal motivo por el que la gente no escribe. */
$('#waFloat').addEventListener('click', () => {
  const enCarrito = cartLines();
  let msg;

  if(enCarrito.length){
    msg = [
      `Hola ${settings.brandMain}${settings.brandAccent}, me interesan:`,
      '',
      ...enCarrito.map(i => `• ${i.qty}× ${i.name}`),
      '',
      '¿Me pueden dar más información?',
    ].join('\n');
  }else{
    const abierto = products.find(p => p.id === galeria.id);
    msg = abierto
      ? `Hola, me interesa la ${abierto.name} que vi en su página. ¿Sigue disponible?`
      : `Hola ${settings.brandMain}${settings.brandAccent}, vi su página y quiero información sobre sus equipos.`;
  }

  window.open(waLink(msg), '_blank', 'noopener');
});
cart = cart.filter(c=>products.some(p=>p.id===c.id));
favorites = new Set([...favorites].filter(id=>products.some(p=>p.id===id)));
if(!Array.isArray(settings.branches)) settings.branches = DEFAULT_SETTINGS.branches.map(b=>({...b}));
applyBranding();
updateAcctLabel();
render();
renderCart();
