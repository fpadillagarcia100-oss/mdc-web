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
  // Con el modal cerrado, las flechas vuelven a ser del navegador.
  galeria.id = null; galeria.enVideo = false; galeria.reproduciendo = false;

  /* El iframe hay que QUITARLO, no basta con apuntar que ya no se reproduce.
     Esconder el modal no detiene un video: se queda en el DOM sonando, y quien
     cerró la ficha oye un motor sin saber de dónde sale. */
  const media = $('#modalImg');
  if(media && media.querySelector('iframe')) media.innerHTML = '';
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

/* ══════════════════ GALERÍA DE FOTOS Y VIDEO ══════════════════ */
let galeria = { id: null, i: 0, enVideo: false, reproduciendo: false };

/**
 * El video, antes de cargarse.
 *
 * Se pinta una portada con un botón de play y NADA de YouTube. El reproductor
 * —que son varios cientos de kilobytes y las cookies de Google— sólo entra
 * cuando alguien decide verlo.
 *
 * Es la diferencia entre una ficha que carga en un celular con señal de obra y
 * una que no. Y de paso, quien sólo mira las fotos no queda fichado por un
 * tercero sin haber pedido nada.
 */
function videoFacadeHTML(p, poster){
  return `
    <div class="gal gal-video" role="group" aria-label="Video de ${esc(p.name)}">
      <button class="gal-facade" type="button" data-gal-play
              aria-label="Reproducir el video de ${esc(p.name)}">
        ${poster ? `<img src="${esc(poster)}" alt="" aria-hidden="true">` : ''}
        <span class="gal-play" aria-hidden="true">▶</span>
        <span class="gal-facade-txt">Ver el video del equipo</span>
      </button>
      <p class="gal-video-nota">El video se carga desde YouTube sólo cuando lo pides.</p>
    </div>`;
}

const videoIframeHTML = (p, id) => `
  <div class="gal gal-video">
    <iframe class="gal-frame" src="${esc(videoEmbed(id))}"
            title="Video de ${esc(p.name)}" loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
  </div>`;

/** Dibuja la galería del equipo abierto, con la foto n al frente. */
function renderGaleria(){
  const p = products.find(x=>x.id===galeria.id);
  const box = $('#modalImg');
  if(!p || !box) return;
  const fotos = p.imgs;
  const conVideo = !!p.video;
  box.className = 'modal-img' + (fotos.length || conVideo ? ' has-photo' : '');

  if(!fotos.length && !conVideo){ box.innerHTML = productMedia(p, false); return }

  /* Sin fotos pero con video, el video ES la galería: no hay a qué volver. */
  const enVideo = conVideo && (galeria.enVideo || !fotos.length);
  galeria.enVideo = enVideo;

  // El índice se acota aquí y no en quien llama: así un clic de más, una tecla
  // repetida o un equipo con menos fotos que antes no dejan la vista en blanco.
  const total = fotos.length;
  const i = total ? ((galeria.i % total) + total) % total : 0;
  galeria.i = i;

  const principal = enVideo
    ? (galeria.reproduciendo ? videoIframeHTML(p, p.video) : videoFacadeHTML(p, fotos[0] || null))
    : `<div class="gal" role="group" aria-roledescription="galería" aria-label="Fotos de ${esc(p.name)}">
      <img class="gal-main" src="${esc(fotos[i])}" alt="${esc(p.name)} — foto ${i+1} de ${total}">
      ${total>1?`
        <button class="gal-nav prev" type="button" data-gal="-1" aria-label="Foto anterior">‹</button>
        <button class="gal-nav next" type="button" data-gal="1" aria-label="Foto siguiente">›</button>
        <span class="gal-count" aria-hidden="true">${i+1} / ${total}</span>`:''}
    </div>`;

  /* La tira de miniaturas aparece si hay algo entre lo que elegir: varias
     fotos, o una foto y un video. Con una sola cosa sobraría. */
  const hayQueElegir = total > 1 || (conVideo && total >= 1);

  box.innerHTML = principal + (hayQueElegir ? `
      <div class="gal-thumbs" role="tablist" aria-label="Elegir foto o video">
        ${conVideo ? `
          <button class="gal-thumb gal-thumb-video${enVideo?' on':''}" type="button" role="tab"
                  data-gal-video aria-selected="${enVideo}" aria-label="Ver el video">
            ${fotos[0] ? `<img src="${esc(fotos[0])}" alt="" loading="lazy">` : ''}
            <span class="gal-play chico" aria-hidden="true">▶</span>
          </button>` : ''}
        ${fotos.map((f,n)=>`
          <button class="gal-thumb${!enVideo && n===i?' on':''}" type="button" role="tab"
                  data-gal-go="${n}" aria-selected="${!enVideo && n===i}" aria-label="Ver foto ${n+1}">
            <img src="${esc(f)}" alt="" loading="lazy">
          </button>`).join('')}
      </div>` : '');
}

/* Al mover con flechas o miniaturas se sale del video, y se DEJA de
   reproducir. Si no, el audio seguiría sonando detrás de las fotos y nadie
   entendería de dónde sale. */
function moverGaleria(paso){
  const p = products.find(x=>x.id===galeria.id);
  if(!p || !p.imgs.length) return;   // sin fotos no hay nada que recorrer
  galeria.enVideo = false; galeria.reproduciendo = false;
  galeria.i += paso;
  renderGaleria();
}
function irGaleria(n){
  galeria.enVideo = false; galeria.reproduciendo = false;
  galeria.i = n;
  renderGaleria();
}
function verVideo(){ galeria.enVideo = true; galeria.reproduciendo = false; renderGaleria() }
function reproducirVideo(){ galeria.enVideo = true; galeria.reproduciendo = true; renderGaleria() }

/**
 * Pie que sólo aparece al imprimir. Va DENTRO de la ficha a propósito: al
 * imprimir se esconde todo lo que no sea el modal, así que un pie colgado del
 * body desaparecería junto con el resto de la página.
 */
function fichaPie(p){
  const marca = `${settings.brandMain}${settings.brandAccent} · ${settings.brandFull}`;
  const url = p.slug ? `${location.origin}/equipos/${p.slug}/` : location.origin;
  return `${marca} · ${settings.phone} · ${settings.email}\n` +
    `Ficha: ${url} — precio de referencia en MXN, no constituye una oferta comercial.`;
}

/* ══════════════════ FICHA TÉCNICA ══════════════════ */

/**
 * La tabla de datos técnicos, si hay alguno.
 *
 * Va aparte de las tres especificaciones de la tarjeta porque son cosas
 * distintas: aquéllas son el titular ("20 ton · 148 HP"), ésta es el detalle
 * que se mira cuando ya hay interés. Quien compra maquinaria usada baja hasta
 * aquí a buscar las horas.
 */
function fichaTecnicaHTML(p){
  const filas = fichaTecnica(p);
  if(!filas.length) return '';
  return `
    <div class="ft">
      <h3 class="ft-titulo">Ficha técnica</h3>
      <table class="ft-tabla">
        <tbody>
          ${filas.map(f=>`<tr><th scope="row">${esc(f.etq)}</th><td>${esc(f.texto)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ══════════════════ PREGUNTAS PÚBLICAS ══════════════════ */

/** "hace 3 días" se lee mejor que una fecha cuando lo que importa es si es reciente. */
function haceCuanto(iso){
  if(!iso) return '';
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if(!Number.isFinite(dias) || dias < 0) return '';
  if(dias === 0) return 'hoy';
  if(dias === 1) return 'ayer';
  if(dias < 30) return `hace ${dias} días`;
  const meses = Math.floor(dias/30);
  return meses < 12 ? `hace ${meses} ${meses===1?'mes':'meses'}` : 'hace más de un año';
}

/**
 * Preguntas contestadas, más el formulario para dejar una nueva.
 *
 * Lo que resuelve: las dudas de maquinaria se repiten —¿tiene factura?, ¿acepta
 * cambio?, ¿cuántas horas de verdad?—. Contestarlas por WhatsApp las contesta
 * una vez, para una persona. Contestarlas aquí las contesta para todos los que
 * lleguen después, y Google las indexa como contenido de la ficha.
 *
 * Las que no tienen respuesta NO salen. Una pregunta colgada sin contestar en
 * público dice de la empresa justo lo contrario de lo que se busca aquí.
 */
function preguntasHTML(p){
  const qa = p.qa || [];

  const lista = qa.length
    ? qa.map(q => `
        <article class="qa-item">
          <p class="qa-p"><span class="qa-etq" aria-hidden="true">P</span>${esc(q.pregunta)}</p>
          <p class="qa-r"><span class="qa-etq r" aria-hidden="true">R</span>${esc(q.respuesta)}</p>
          <p class="qa-meta">${esc(q.nombre)}${q.fecha?` · ${esc(haceCuanto(q.fecha))}`:''}</p>
        </article>`).join('')
    : `<p class="qa-vacio">Todavía nadie ha preguntado por este equipo. Si tienes una duda,
         escríbela: contestamos aquí mismo y la respuesta le sirve al que venga después.</p>`;

  /* Sin slug no hay a qué colgar la pregunta —le pasa a un equipo recién
     creado que aún no se publica—, así que se enseñan las respuestas y se
     calla el formulario en vez de ofrecer un botón que no puede funcionar. */
  const form = p.slug ? `
    <form class="qa-form" id="qaForm" data-slug="${esc(p.slug)}" novalidate>
      <input class="hp-field" type="text" id="hp_pregunta" tabindex="-1" autocomplete="off" aria-hidden="true">
      <div class="field">
        <label for="qa-nombre">Tu nombre</label>
        <input type="text" id="qa-nombre" maxlength="60" placeholder="Juan Pérez"
               value="${esc(account?.name || '')}">
      </div>
      <div class="field">
        <label for="qa-texto">Tu pregunta <span class="hint">(máx. 300 caracteres)</span></label>
        <textarea id="qa-texto" maxlength="300" rows="2"
                  placeholder="¿Cuántas horas reales tiene? ¿Se puede ver en sitio?"></textarea>
      </div>
      <button class="btn-ghost" type="submit">Enviar pregunta</button>
      <p class="qa-aviso">Tu pregunta y nuestra respuesta se publican en esta ficha.
        No escribas aquí tu teléfono ni datos personales.</p>
    </form>` : '';

  return `
    <section class="qa">
      <h3 class="ft-titulo">Preguntas y respuestas${qa.length?` <span class="qa-n">${qa.length}</span>`:''}</h3>
      ${lista}
      ${form}
    </section>`;
}

/**
 * Manda la pregunta.
 *
 * La validación de verdad ocurre en el servidor —longitudes, existencia del
 * equipo, freno al spam— porque es el único sitio donde no se puede saltar.
 * Lo de aquí sirve para dar el aviso antes del viaje, no para autorizar nada.
 */
async function enviarPregunta(form){
  const slug = form.dataset.slug;
  const trampa = $('#hp_pregunta');
  const nombre = ($('#qa-nombre').value || '').trim();
  const texto = ($('#qa-texto').value || '').trim();
  const btn = form.querySelector('button[type="submit"]');

  // Campo invisible relleno: es un bot. Se finge éxito para no darle pistas.
  if(trampa && trampa.value){ showToast('Pregunta enviada'); return }

  if(nombre.length < 2){ showToast('Escribe tu nombre.', true); $('#qa-nombre').focus(); return }
  if(texto.length < 5){ showToast('Escribe tu pregunta.', true); $('#qa-texto').focus(); return }

  if(btn){ btn.disabled = true; btn.textContent = 'Enviando…' }
  const r = await preguntar(slug, nombre, texto);
  if(btn){ btn.disabled = false; btn.textContent = 'Enviar pregunta' }

  if(!r.ok){ showToast(r.error, true); return }

  /* No se pinta la pregunta en la lista.

     Sería lo cómodo, pero enseñaría en la ficha algo que todavía no está
     contestado ni aprobado — y sólo a quien la escribió, que se iría creyendo
     que ya está publicada. Se dice lo que de verdad pasó: llegó, y falta
     contestarla. */
  $('#qa-texto').value = '';
  form.innerHTML = `<p class="qa-ok">✓ Tu pregunta llegó. La contestamos aquí mismo,
    normalmente el mismo día. Si tienes prisa, escríbenos por WhatsApp.</p>`;
}

/* ══════════════════ MODAL PRODUCTO ══════════════════ */
function openModal(id){
  const p = products.find(x=>x.id===id);
  if(!p) return;

  // Se cuenta al abrir, no al cargar el catálogo: ver una tarjeta de paso no
  // es lo mismo que abrir la ficha. Sólo lo segundo dice que hubo interés.
  if(typeof contar === 'function' && !isAdmin) contar(p.slug, 'vista');
  closeAll();
  lastFocused = document.activeElement;

  galeria = { id: p.id, i: 0 };
  renderGaleria();

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
    ${fichaTecnicaHTML(p)}
    <div class="modal-actions">
      <button class="modal-add" type="button" data-add="${p.id}" data-close-after>+ Agregar a cotización</button>
      <button class="modal-quote" type="button" data-fav="${p.id}">${favorites.has(p.id)?'♥ Guardado':'♡ Guardar'}</button>
      <button class="modal-quote" type="button" data-imprimir>🖨 Imprimir ficha</button>
      ${p.slug?`<a class="modal-quote" href="/equipos/${esc(p.slug)}/" style="text-decoration:none">Ficha completa ↗</a>`:''}
      ${isAdmin?`<button class="modal-quote" type="button" data-edit="${p.id}">✎ Editar</button>`:''}
    </div>
    ${p.cond!=='Renta' ? calculadoraHTML(p.price, {msi:p.finance}) : ''}
    ${preguntasHTML(p)}
    <p class="solo-impresion">${esc(fichaPie(p))}</p>`;

  // La calculadora nace después de DOMContentLoaded, así que su primer pintado
  // no lo hace ficha.js: hay que pedirlo aquí.
  refrescarCalculadora($('#modalInfo [data-calc]'));

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
  Object.assign(state,{cat:'Todos',conds:[],brands:[],locations:[],finance:[],onlyFavs:false,
                       min:null,max:null,horasMax:null,pesoMin:null,pesoMax:null,q:'',page:1});
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
    case 'horasMax': case 'pesoMin': case 'pesoMax': state[type]=null; break;
    case 'q': state.q=''; $('#searchInput').value=''; break;
    case 'fav': state.onlyFavs=false; break;
  }
  render();
}
