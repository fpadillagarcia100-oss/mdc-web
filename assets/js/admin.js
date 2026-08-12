/**
 * admin.js — Panel de administración: CRUD de equipos, imágenes, marca y respaldos.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 */
'use strict';

/* ══════════════════════════════════════════════════════════
   PANEL DE ADMINISTRACIÓN
   ══════════════════════════════════════════════════════════ */
let adminTab = 'products';
let adminQuery = '';
let editingId = null;   // null = listado, 0 = nuevo, n = editando ese id
let draftImgs;          // undefined = sin cambios; arreglo = galería en edición

const dataUriBytes = uri => uri ? Math.round((uri.length - (uri.indexOf(',')+1)) * 0.75) : 0;

function openAdmin(tab){
  if(isAdmin){ adminTab = tab || adminTab }
  closeAll();
  lastFocused = document.activeElement;
  if(isAdmin) renderAdmin(); else renderLogin();
  $('#adminOverlay').classList.add('open');
  lockScroll(true);
  openPanel = $('#adminPanel');
  const f = $('#adminBody').querySelector(FOCUSABLE) || $('#adminClose');
  f.focus();
}

/**
 * Reemplaza el catálogo en memoria por el de la base.
 *
 * Nunca escribe en localStorage: la base es la única fuente de verdad. Lo que
 * se guardaba antes en este navegador queda ignorado a propósito — si se
 * mezclaran las dos, ganaría cualquiera de las dos según el orden de carga, y
 * ese es justo el problema que se venía a resolver.
 */
async function sincronizarDesdeLaBase(){
  const datos = await remotoCargarTodo();

  /* Se normaliza uno por uno, no la lista entera.

     normalizeProducts() FILTRA lo que no reconoce, así que si un equipo se
     cayera del arreglo, la lista resultante quedaría más corta y desalineada
     respecto a la original. Recuperar el id por posición —datos.equipos[i]—
     le pondría a cada equipo el id del siguiente.

     Y eso no se ve: la pantalla enseñaría nombres correctos, pero editar uno
     escribiría encima de otro. Un fallo así no se nota hasta que un precio
     aparece en la máquina equivocada. */
  products = datos.equipos.map(eq => {
    const [normalizado] = normalizeProducts([eq]);
    if(!normalizado) return null;
    return { ...normalizado, id: eq.id, slug: eq.slug, publicado: eq.publicado };
  }).filter(Boolean);

  if(datos.ajustes) Object.assign(settings, datos.ajustes);
  if(datos.sucursales) settings.branches = datos.sucursales;

  applyBranding();
}

/**
 * Devuelve el modo administrador al recargar la página, si de verdad procede.
 *
 * "Si de verdad procede" es todo el asunto: se le pregunta al servidor. Aquí
 * no basta con que exista un token guardado —eso lo puede inventar
 * cualquiera—, hace falta que Supabase lo reconozca y que la tabla `perfiles`
 * diga que esa persona es admin.
 *
 * Es asíncrono, así que durante un instante tras cargar la página el panel
 * está cerrado aunque tengas sesión. Es el orden correcto: se abre al
 * confirmar, no mientras se confirma.
 */
async function restaurarSesion(){
  if(!BACKEND || !auth.haySesion()) return;

  if(await esAdministrador()){
    isAdmin = true;
    document.body.classList.add('is-admin');
    try{
      await sincronizarDesdeLaBase();
      render();
    }catch{
      // Sin conexión se sigue viendo el catálogo publicado. No es motivo
      // para echar a nadie de su sesión.
    }
  }else{
    // El token caducó, fue revocado, o la cuenta perdió el rol de admin.
    auth.olvidar();
  }
}

/** Dibuja el panel y reconecta los widgets que necesitan listeners propios. */
function renderAdmin(){
  /* El cerrojo va AQUI, no solo en quien llama.

     El fallo que motivo esta linea: openAdmin() si comprobaba la sesion, pero
     el clic en una pestana llamaba a renderAdmin() directo. Una sola via sin
     revisar basta para que sobre todo lo demas.

     Regla: la comprobacion se pone en el sitio por el que hay que pasar
     obligatoriamente, no en cada camino que lleva a el. Los caminos se
     multiplican; el sitio es uno. */
  if(!isAdmin){ renderLogin(); return }

  $('#adminTabs').hidden = false;
  $$('#adminTabs .admin-tab').forEach(b=>b.setAttribute('aria-selected', String(b.dataset.tab===adminTab)));

  const body = $('#adminBody');
  if(editingId !== null) body.innerHTML = productFormHTML();
  else if(adminTab==='products') body.innerHTML = productListHTML();
  else if(adminTab==='solicitudes') body.innerHTML = solicitudesHTML();
  else if(adminTab==='preguntas') body.innerHTML = preguntasAdminHTML();
  else if(adminTab==='brand') body.innerHTML = brandHTML();
  else if(adminTab==='site') body.innerHTML = siteHTML();
  else if(adminTab==='usuarios') body.innerHTML = usuariosHTML();
  else body.innerHTML = backupHTML();

  const inv = $('#uInvitar');
  if(inv) inv.addEventListener('click', invitarUsuario);

  wireDropzone('dz','imgInput','product');
  wireDropzone('dzLogo','logoInput','logo');
  wireDropzone('dzHero','heroInput','hero');

  const s = $('#admSearch');
  if(s) s.addEventListener('input', e=>{
    adminQuery = e.target.value;
    renderAdmin();
    const again = $('#admSearch');
    again.focus();
    again.setSelectionRange(again.value.length, again.value.length);
  });

  const form = $('#pForm');
  if(form) form.addEventListener('submit', e=>{ e.preventDefault(); saveProductForm() });

  if(adminTab==='products' && metricas === null) cargarMetricas();

  /* Las cotizaciones y las preguntas se piden apenas se abre el panel, aunque
     la pestaña activa sea otra: sin el número al lado del rótulo, lo que está
     esperando sólo se descubre entrando a buscarlo — y nadie entra a buscar lo
     que no sabe que existe. */
  cargarSolicitudes();
  cargarPreguntas();
  pintarPendientes();

  // El botón se vuelve a dibujar en cada render: hay que devolverle la cuenta
  // atrás, o cambiar de pestaña serviría para saltarse la espera.
  if(Date.now() - ultimaPublicacion < ESPERA_PUBLICAR) cuentaAtrasPublicar();
}

/* ══════════════════ GUARDADO EN LA BASE ══════════════════

   Los ajustes se editan campo por campo, y cada uno dispara un guardado. Sin
   agrupar, cambiar cuatro textos de la portada serían cuatro peticiones que
   además pueden llegar desordenadas: la segunda respuesta pisando a la
   tercera deja guardado un valor que ya no es el que se ve en pantalla.

   Se espera un momento a que la persona termine y se manda una sola vez. */
let tempAjustes = null, tempSucursales = null;

function guardarAjustesRemoto(){
  clearTimeout(tempAjustes);
  tempAjustes = setTimeout(async ()=>{
    try{
      await remotoGuardarAjustes(settings);
      showToast('Cambios guardados');
    }catch(err){
      showToast('No se guardó: ' + err.message, true);
    }
  }, 800);
}

function guardarSucursalesRemoto(){
  clearTimeout(tempSucursales);
  tempSucursales = setTimeout(async ()=>{
    try{
      /* Se sustituye la lista por la que devuelve la base, no por la que
         creemos haber mandado. Si el servidor rechazó un teléfono con letras,
         la pantalla debe enseñar lo que de verdad quedó guardado. */
      settings.branches = await remotoGuardarSucursales(settings.branches || []);
      showToast('Sucursales guardadas');
      if(isAdmin && adminTab==='site') renderAdmin();
    }catch(err){
      showToast('No se guardaron las sucursales: ' + err.message, true);
    }
  }, 800);
}

/**
 * Publica: reconstruye el sitio con lo que hay ahora en la base.
 *
 * Hace falta un botón porque son dos cosas distintas. Guardar deja el cambio
 * en la base —y otro administrador lo ve al instante—, pero el sitio público
 * es HTML escrito de antemano. Hasta que no se reconstruye, el visitante
 * sigue viendo lo anterior.
 *
 * Que sea explícito además permite preparar varios cambios y publicarlos
 * juntos, en vez de que el sitio se reconstruya en cada tecla.
 */
/* Momento en que se lanzó la última publicación. Vive fuera de la función
   para sobrevivir a los redibujados del panel: si se guardara dentro, cambiar
   de pestaña reactivaría el botón y volveríamos a lo mismo. */
let ultimaPublicacion = 0;
const ESPERA_PUBLICAR = 120000;   // 2 minutos, lo que tarda una compilación

async function publicarSitio(){
  const btn = document.querySelector('[data-action="publicar"]');

  /* La petición devuelve enseguida —Cloudflare acepta y compila aparte—, así
     que sin esta espera el botón vuelve a estar activo en un segundo. Y ahí
     está la trampa: parece que no pasó nada, se vuelve a pulsar, y Cloudflare
     rechaza el segundo disparo con un error 502 que no explica nada.

     Cada clic además consume una compilación de las 500 del mes. */
  const restan = ESPERA_PUBLICAR - (Date.now() - ultimaPublicacion);
  if(restan > 0){
    showToast(`Ya se está publicando. Espera ${Math.ceil(restan/1000)} s.`, true);
    return;
  }

  if(btn){ btn.disabled = true; btn.textContent = 'Publicando…' }
  try{
    const r = await remotoPublicar();
    ultimaPublicacion = Date.now();
    showToast(r.mensaje || 'Publicando…');
    cuentaAtrasPublicar();
  }catch(err){
    showToast(err.message, true);
    if(btn){ btn.disabled = false; btn.textContent = '🚀 Publicar cambios' }
  }
}

/** Enseña cuánto falta, para que la espera no parezca que se colgó. */
function cuentaAtrasPublicar(){
  const btn = document.querySelector('[data-action="publicar"]');
  const restan = ESPERA_PUBLICAR - (Date.now() - ultimaPublicacion);

  if(!btn) return;   // se cambió de pestaña; al volver, renderAdmin lo recalcula
  if(restan <= 0){
    btn.disabled = false;
    btn.textContent = '🚀 Publicar cambios';
    return;
  }
  btn.disabled = true;
  btn.textContent = `Publicando… ${Math.ceil(restan/1000)} s`;
  setTimeout(cuentaAtrasPublicar, 1000);
}

/**
 * Convierte un nombre en la dirección web del equipo.
 *
 * El slug es lo que aparece en la URL de la ficha, así que una vez publicado
 * NO se toca: cambiarlo rompe los enlaces que ya circulan por WhatsApp y borra
 * el posicionamiento que esa página haya ganado en Google. Por eso sólo se
 * calcula al dar de alta.
 */
function slugDesdeNombre(nombre){
  const base = nombre
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // quita acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'equipo';

  // Si ya existe, se numera. Dos "Excavadora CAT 320" no pueden compartir URL.
  let slug = base, n = 2;
  while(products.some(p => p.slug === slug)) slug = `${base}-${n++}`;
  return slug;
}

async function saveProductForm(){
  const data = readForm();
  let ok = true;
  $$('#pForm .field').forEach(f=>f.classList.remove('err'));
  if(!data.name){ $('[data-f="name"]').classList.add('err'); ok = false }
  if(data.price === null || data.price < 0){ $('[data-f="price"]').classList.add('err'); ok = false }
  if(!ok){ showToast('Revisa los campos marcados', true); return }

  /* Un enlace de video que no se reconoce se avisa y se detiene el guardado.
     Aceptarlo en silencio dejaría al equipo sin video sin que nadie lo supiera
     hasta abrir la ficha publicada. */
  if(data.videoCrudo && !data.video){
    showToast('Ese enlace de video no es de YouTube. Copia la dirección desde la barra del navegador o desde «Compartir».', true);
    return;
  }
  delete data.videoCrudo;

  // Un "precio anterior" que no sea mayor no representa un descuento.
  if(data.original !== null && data.original <= data.price) data.original = null;

  const prev = editingId ? products.find(p=>p.id===editingId) : null;
  const fotos = draftImgs === undefined ? (prev ? prev.imgs : []) : draftImgs;
  // img es la portada derivada; se guarda junto a imgs para que el resto del
  // sitio (tarjetas, respaldos viejos, generador) siga leyendo un solo campo.
  const galeria = {imgs: fotos, img: fotos[0] || null};

  const aGuardar = prev
    ? {...prev, ...data, ...galeria}
    : {...data, ...galeria, slug: slugDesdeNombre(data.name), publicado: true};

  const btn = $('#pForm button[type="submit"]');
  if(btn){ btn.disabled = true; btn.textContent = 'Guardando…' }

  try{
    /* Se guarda en la base ANTES de tocar la pantalla.

       El orden importa: si primero se actualizara la lista y el guardado
       fallara, el administrador vería su cambio hecho y se iría tranquilo con
       un precio que en realidad sigue igual. Más vale un error visible que un
       éxito falso. */
    const guardado = await remotoGuardarEquipo(aGuardar);

    if(prev) Object.assign(prev, guardado);
    else products.unshift(guardado);

    showToast(prev ? 'Equipo actualizado' : 'Equipo dado de alta');
    editingId = null; draftImgs = undefined;
    navSignature = '';
    renderAdmin(); render(); renderCart();
  }catch(err){
    showToast(err.message, true);
  }finally{
    if(btn && document.contains(btn)){ btn.disabled = false; btn.textContent = 'Guardar' }
  }
}

async function deleteProduct(id){
  const p = products.find(x=>x.id===id);
  if(!p) return;
  if(!confirm(`¿Eliminar "${p.name}"?\n\nEsta acción no se puede deshacer.`)) return;

  try{
    await remotoBorrarEquipo(id);
  }catch(err){
    showToast(err.message, true);
    return;   // no se quita de la pantalla algo que sigue en la base
  }

  products = products.filter(x=>x.id!==id);
  cart = cart.filter(x=>x.id!==id);
  favorites.delete(id);
  saveCart(); saveFavs();
  editingId = null; draftImgs = undefined;
  navSignature = '';
  renderAdmin(); render(); renderCart();
  showToast('Equipo eliminado');
}

async function duplicateProduct(id){
  const p = products.find(x=>x.id===id);
  if(!p) return;

  const nombre = p.name + ' (copia)';
  /* La copia nace SIN publicar. Duplicar es el atajo para dar de alta un
     equipo parecido, no para poner dos anuncios idénticos en el sitio: sale
     como borrador y se publica cuando ya tiene sus propios datos. */
  /* El video NO se copia. La ficha técnica sí.

     La diferencia: los datos técnicos de una máquina parecida son un buen
     punto de partida y se corrigen a ojo. El video es de ESA máquina —con sus
     horas en el tablero y sus rayones— y publicarlo en otra es enseñar una
     máquina que el cliente no va a recibir. Ése es un problema distinto y peor
     que un dato desactualizado. */
  const copia = {...p, id: null, name: nombre, slug: slugDesdeNombre(nombre),
                 hot: false, publicado: false, video: null};

  try{
    const guardado = await remotoGuardarEquipo(copia);
    products.splice(products.indexOf(p)+1, 0, guardado);
    renderAdmin(); render();
    showToast('Copia creada como borrador');
  }catch(err){
    showToast(err.message, true);
  }
}

/* ── Logo y marca ── */
function brandHTML(){
  return `
    <div class="adm-section">
      <h3>Logotipo</h3>
      <p class="sub">Se muestra en el encabezado. Recomendado: PNG o SVG con fondo transparente, alto ~80 px.</p>
      ${settings.logo ? `
        <div class="img-preview" style="background:#1A1A1A;max-width:340px">
          <img src="${esc(settings.logo)}" alt="Logo actual" style="max-height:110px;padding:14px">
          <button class="rm" type="button" data-action="logo-remove">✕ Quitar logo</button>
          <div class="img-meta">Peso: ${fmtKB(dataUriBytes(settings.logo))}</div>
        </div>` : `
        <div class="dropzone" id="dzLogo" tabindex="0" role="button" aria-label="Subir logotipo" style="max-width:340px">
          <div class="dz-icon">🖼️</div>
          <p><strong>Haz clic o arrastra tu logo</strong></p>
          <p>PNG, SVG o WebP · fondo transparente</p>
        </div>`}
      <input type="file" id="logoInput" accept="image/*" hidden>
    </div>

    <div class="adm-section">
      <h3>Logo de texto</h3>
      <p class="sub">Se usa cuando no hay imagen de logo. La segunda parte toma el color de acento.</p>
      <div class="form-grid">
        <div class="field">
          <label for="s-brandMain">Texto principal</label>
          <input type="text" id="s-brandMain" data-set="brandMain" maxlength="12" value="${esc(settings.brandMain)}">
        </div>
        <div class="field">
          <label for="s-brandAccent">Texto en color</label>
          <input type="text" id="s-brandAccent" data-set="brandAccent" maxlength="12" value="${esc(settings.brandAccent)}">
        </div>
        <div class="field full">
          <label for="s-brandFull">Nombre completo</label>
          <input type="text" id="s-brandFull" data-set="brandFull" value="${esc(settings.brandFull)}">
        </div>
        <div class="field">
          <label for="s-accent">Color de acento</label>
          <input type="color" id="s-accent" data-set="accent" value="${esc(settings.accent)}" style="height:42px;padding:4px;border:1px solid var(--border2);border-radius:6px;width:100%;cursor:pointer">
        </div>
        <div class="field" style="justify-content:flex-end">
          <button class="btn-ghost" type="button" data-action="accent-reset">Restaurar amarillo original</button>
        </div>
      </div>
    </div>

    <div class="adm-section">
      <h3>Imagen del banner principal</h3>
      <p class="sub">Aparece a la derecha del texto del banner. Si la dejas vacía se usa la ilustración por defecto.</p>
      ${settings.heroImage ? `
        <div class="img-preview" style="max-width:420px">
          <img src="${esc(settings.heroImage)}" alt="Imagen del banner">
          <button class="rm" type="button" data-action="hero-remove">✕ Quitar imagen</button>
          <div class="img-meta">Peso: ${fmtKB(dataUriBytes(settings.heroImage))}</div>
        </div>` : `
        <div class="dropzone" id="dzHero" tabindex="0" role="button" aria-label="Subir imagen del banner" style="max-width:420px">
          <div class="dz-icon">🏗️</div>
          <p><strong>Haz clic o arrastra una foto</strong></p>
          <p>Ideal: horizontal, 800×500 px</p>
        </div>`}
      <input type="file" id="heroInput" accept="image/*" hidden>
    </div>`;
}

/* ── Textos del sitio ── */
/**
 * Bloque de publicación.
 *
 * Se explica la diferencia en el propio panel porque es la parte que confunde:
 * "ya lo cambié y no se ve". Un cartel de dos líneas ahorra esa llamada.
 */
function publicarHTML(){
  return `
    <div class="adm-section" style="border-left:3px solid var(--accent);padding-left:14px">
      <h3>Publicar en el sitio</h3>
      <p class="sub">Guardar deja el cambio en la base y el equipo lo ve al instante.
        Los visitantes siguen viendo lo anterior hasta que publiques: la página
        pública se arma de antemano, por eso carga rápido y no se cae aunque la
        base falle. Tarda un par de minutos.</p>
      <button class="btn-primary" type="button" data-action="publicar">🚀 Publicar cambios</button>
    </div>`;
}

function siteHTML(){
  const f = (id,label,hint) => `
    <div class="field${['heroText','footerAbout','topbarMsg'].includes(id)?' full':''}">
      <label for="s-${id}">${label}${hint?` <span class="hint">${hint}</span>`:''}</label>
      ${['heroText','footerAbout'].includes(id)
        ? `<textarea id="s-${id}" data-set="${id}">${esc(settings[id])}</textarea>`
        : `<input type="text" id="s-${id}" data-set="${id}" value="${esc(settings[id])}">`}
    </div>`;
  return `
    <p class="adm-note">Los cambios se guardan en la base al salir de cada campo,
      y el resto del equipo los ve al momento. Para que los vean los
      <strong>visitantes</strong>, hay que publicar.</p>
    ${publicarHTML()}
    <div class="adm-section">
      <h3>Encabezado y banner</h3>
      <div class="form-grid">
        ${f('topbarMsg','Mensaje de la barra superior')}
        ${f('heroTag','Etiqueta del banner')}
        ${f('heroTitle','Título del banner')}
        ${f('heroHighlight','Título resaltado','(en color de acento)')}
        ${f('heroText','Texto del banner')}
      </div>
    </div>
    <div class="adm-section">
      <h3>Datos de contacto</h3>
      <div class="form-grid">
        ${f('sellerName','Nombre del vendedor','(en la ficha del equipo)')}
        ${f('phone','Teléfono')}
        ${f('whatsapp','WhatsApp','(con lada país, ej. 5219611234567)')}
        ${f('email','Correo')}
        ${f('address','Dirección / ciudad')}
        ${f('hours','Horario')}
        ${f('footerAbout','Descripción del pie de página')}
      </div>
    </div>
    <div class="adm-section">
      <h3>Sucursales</h3>
      <p class="sub">Aparecen en la página «Sucursales». El botón «Cómo llegar» se arma solo con la dirección que escribas.</p>
      ${(settings.branches||[]).map((b,i)=>`
        <div class="branch" style="margin-bottom:14px">
          <div class="form-grid">
            <div class="field"><label>Nombre</label>
              <input type="text" data-branch="${i}" data-bfield="name" value="${esc(b.name)}"></div>
            <div class="field"><label>Teléfono</label>
              <input type="text" data-branch="${i}" data-bfield="phone" value="${esc(b.phone)}"></div>
            <div class="field full"><label>Dirección</label>
              <input type="text" data-branch="${i}" data-bfield="address" value="${esc(b.address)}"></div>
            <div class="field full"><label>Horario</label>
              <input type="text" data-branch="${i}" data-bfield="hours" value="${esc(b.hours)}"></div>
          </div>
          <div class="links" style="margin-top:12px">
            <button class="btn-danger" type="button" data-branch-del="${i}">Eliminar sucursal</button>
          </div>
        </div>`).join('')}
      <button class="btn-primary" type="button" data-action="branch-add">+ Agregar sucursal</button>
    </div>`;
}

/* ── Respaldo ── */
function backupHTML(){
  const used = store.usedBytes(), limit = 5*1024*1024, pct = Math.min(100, used/limit*100);
  const cls = pct>85 ? 'full' : pct>60 ? 'warn' : '';
  return `
    <p class="adm-note">
      <strong>Todo lo que editas se guarda en la base de datos</strong>, no en esta computadora. Lo ve el equipo entero
      desde cualquier dispositivo, y no se pierde aunque limpies el navegador o cambies de equipo. Los visitantes verán
      los cambios cuando pulses <em>Publicar cambios</em>.
    </p>
    <p class="adm-note">
      Este sitio <strong>no guarda nada en tu navegador</strong>: ni catálogo, ni sesión, ni carrito. Al recargar la
      página hay que volver a entrar. Es a propósito — un token olvidado en la computadora del taller es de las cosas
      que más caro salen.
    </p>

    <div class="adm-section">
      <h3>Espacio utilizado</h3>
      <p class="sub">Límite aproximado del navegador: 5 MB. Las fotos son lo que más ocupa.</p>
      <div class="storage-bar ${cls}"><div style="width:${pct.toFixed(1)}%"></div></div>
      <p style="font-size:12px;color:var(--muted)">${fmtKB(used)} de ~5 MB (${pct.toFixed(1)}%) · ${products.reduce((s,p)=>s+p.imgs.length,0)} fotos en ${products.filter(p=>p.imgs.length).length} de ${products.length} equipos</p>
    </div>

    <div class="adm-section">
      <h3>Exportar / importar</h3>
      <p class="sub">El archivo JSON incluye equipos, imágenes, logo y configuración. Sirve como respaldo y para pasar todo a otra computadora.</p>
      <div class="adm-toolbar">
        <button class="btn-primary" type="button" data-action="export">⬇ Descargar respaldo (.json)</button>
        <button class="btn-ghost" type="button" data-action="import">⬆ Importar respaldo</button>
        <input type="file" id="importInput" accept="application/json,.json" hidden>
      </div>
    </div>

    <div class="adm-section">
      <h3>Tu cuenta</h3>
      <p class="sub">El acceso ya no es un PIN, sino una cuenta con correo y contraseña.
        Quien decide si puedes guardar algo es el servidor, no esta página — y ahí
        está la diferencia: el PIN se comparaba aquí mismo, así que cualquiera con
        las herramientas del navegador podía saltarlo.</p>
      <p class="sub">Para cambiar tu contraseña o dar de alta a alguien del equipo,
        entra al panel de Supabase → <strong>Authentication</strong>.
        En una computadora compartida, cierra sesión: queda abierta aunque
        cierres el navegador.</p>
    </div>

    <div class="adm-section">
      <h3>Restablecer</h3>
      <p class="sub">Borra todo lo que has editado y vuelve al catálogo de ejemplo. Descarga un respaldo antes.</p>
      <button class="btn-danger" type="button" data-action="reset">⚠ Restablecer todo a valores de fábrica</button>
    </div>`;
}

function exportBackup(){
  const blob = new Blob([JSON.stringify({version:1, exported:new Date().toISOString(), settings, products}, null, 2)],
                        {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mdc-respaldo-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
  showToast('Respaldo descargado');
}

/**
 * Importa un respaldo AL CATÁLOGO DE LA BASE, equipo por equipo.
 *
 * Antes esto sobrescribía el localStorage y listo. Ya no sirve: el catálogo
 * vive en la base, así que un import que sólo tocara este navegador enseñaría
 * un catálogo que nadie más ve y que se esfuma al recargar. Eso es peor que
 * no funcionar, porque parece que funcionó.
 *
 * Se guardan en secuencia, uno a uno. Es más lento que mandarlos todos juntos,
 * pero si el equipo número 12 trae un año imposible, los once anteriores ya
 * quedaron guardados y el aviso dice exactamente cuál falló. En bloque, un
 * solo dato malo tira la importación entera sin decir dónde.
 *
 * NO borra nada: se cruza por slug o por nombre, así que un respaldo actualiza
 * lo que ya existe y da de alta lo que falta. Un import no debería poder
 * vaciarte el catálogo por descuido.
 */
async function importBackup(file){
  let data;
  try{
    data = JSON.parse(await file.text());
    if(!data || !Array.isArray(data.products)) throw new Error('formato');
  }catch{
    showToast('El archivo no es un respaldo válido', true);
    return;
  }

  if(!confirm(`Se guardarán ${data.products.length} equipos en la base de datos.

Los que ya existan se actualizan; los nuevos se dan de alta. Nada se borra.

¿Continuar?`)) return;

  let guardados = 0;
  for(const crudo of normalizeProducts(data.products)){
    try{
      const existente = products.find(p => (crudo.slug && p.slug === crudo.slug) || p.name === crudo.name);
      await remotoGuardarEquipo({
        ...crudo,
        id: existente ? existente.id : null,
        slug: existente ? existente.slug : (crudo.slug || slugDesdeNombre(crudo.name)),
      });
      guardados++;
    }catch(err){
      showToast(`Se guardaron ${guardados}. Falló en "${crudo.name}": ${err.message}`, true);
      await sincronizarDesdeLaBase();
      renderAdmin(); render();
      return;
    }
  }

  if(data.settings){
    try{ await remotoGuardarAjustes({...settings, ...data.settings}) }catch{}
  }

  await sincronizarDesdeLaBase();
  navSignature = '';
  renderAdmin(); render(); renderCart();
  showToast(`Respaldo importado: ${guardados} equipos en la base`);
}

/**
 * "Restablecer" ya no aplica.
 *
 * Antes vaciaba el localStorage y volvía al catálogo de ejemplo. Hoy el
 * catálogo vive en la base: hacer lo mismo dejaría la pantalla con datos de
 * ejemplo mientras la base sigue intacta, y al recargar volvería todo. Un
 * botón que finge borrar es peor que ninguno.
 *
 * Borrar de verdad los 18 equipos con un par de confirmaciones tampoco es
 * aceptable: es irreversible y compartido. Si de verdad hace falta vaciar el
 * catálogo, se hace equipo por equipo, o desde el panel de Supabase donde
 * queda registrado en la bitácora quién lo hizo.
 */
async function resetAll(){
  alert(`Esta opción ya no existe.

El catálogo vive en la base de datos y lo comparte todo el equipo, así que no
se puede restablecer desde un solo navegador.

Para quitar equipos, bórralos uno por uno desde la pestaña Equipos.`);
}

async function logoutAdmin(){
  isAdmin = false;
  document.body.classList.remove('is-admin');
  editingId = null; draftImgs = undefined;

  /* Se olvida el token y se le avisa al SERVIDOR. Recargar ya borra la sesión
     de esta pestaña —vive en memoria— pero eso no revoca el token en Supabase:
     seguiría siendo válido hasta caducar. Sólo cerrar sesión a propósito lo
     invalida de verdad. */
  await cerrarSesion();

  /* Se recarga para volver al catálogo publicado. Sin esto quedaría en
     pantalla lo que se trajo de la base -- incluidos los borradores sin
     publicar, que no debe seguir viendo quien ya salió. */
  location.reload();
}
