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

/** Redimensiona y comprime una imagen a data URI. Los SVG se leen tal cual. */
async function fileToDataURL(file, maxW = 1000, quality = 0.82){
  if(!file.type.startsWith('image/')) throw new Error('El archivo no es una imagen.');
  if(file.type === 'image/svg+xml'){
    if(file.size > 200*1024) throw new Error('El SVG es muy pesado (máx. 200 KB).');
    return await new Promise((res,rej)=>{
      const r = new FileReader();
      r.onload = ()=>res(r.result);
      r.onerror = ()=>rej(new Error('No se pudo leer el archivo.'));
      r.readAsDataURL(file);
    });
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxW / bitmap.width);
  const w = Math.max(1, Math.round(bitmap.width*scale));
  const h = Math.max(1, Math.round(bitmap.height*scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const keepAlpha = file.type === 'image/png' || file.type === 'image/webp';
  if(!keepAlpha){ ctx.fillStyle = '#fff'; ctx.fillRect(0,0,w,h) }
  ctx.drawImage(bitmap, 0, 0, w, h);
  if(bitmap.close) bitmap.close();
  return c.toDataURL(keepAlpha ? 'image/webp' : 'image/jpeg', quality);
}

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
 * Acceso con cuenta de Supabase.
 *
 * Sustituye al PIN, que se comparaba aquí en el navegador y por tanto no era
 * una barrera: bastaba con editar el JavaScript para entrar. Sólo protegía
 * porque los cambios se quedaban en el localStorage de quien los hacía.
 *
 * Ahora el panel escribe en una base compartida y la comprobación ocurre en
 * el servidor: sin un token válido, cada guardado es rechazado sin importar
 * lo que crea la página.
 */
function renderLogin(){
  $('#adminTabs').hidden = true;

  if(!BACKEND){
    $('#adminBody').innerHTML = `
      <div class="login-box">
        <div class="dz-icon">🔌</div>
        <h3>Sin conexión a la base de datos</h3>
        <p>Este sitio se compiló sin credenciales, así que el panel no puede
           guardar nada. Es lo normal al abrirlo en local sin un archivo
           <code>.env</code>.</p>
      </div>`;
    return;
  }

  $('#adminBody').innerHTML = `
    <div class="login-box">
      <div class="dz-icon">🔒</div>
      <h3>Acceso de administrador</h3>
      <p>Entra con tu cuenta para editar el catálogo. Los cambios se guardan
         en la base y los ve todo el equipo, desde cualquier dispositivo.</p>
      <label class="sr-only" for="mailInput">Correo</label>
      <input id="mailInput" type="email" autocomplete="username" placeholder="tucorreo@ejemplo.com">
      <label class="sr-only" for="passInput">Contraseña</label>
      <input id="passInput" type="password" autocomplete="current-password" placeholder="Contraseña" style="margin-top:8px">
      <div class="err" id="pinErr"></div>
      <button class="btn-primary" type="button" id="pinBtn" style="width:100%;margin-top:10px;padding:12px">Entrar</button>
    </div>`;

  const mail = $('#mailInput'), pass = $('#passInput'), btn = $('#pinBtn'), err = $('#pinErr');

  const submit = async ()=>{
    err.textContent = '';
    if(!mail.value.trim() || !pass.value){
      err.textContent = 'Escribe tu correo y tu contraseña.';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Entrando…';
    try{
      await iniciarSesion(mail.value.trim(), pass.value);

      /* Tener sesión no basta: una cuenta de personal entra pero no administra.
         Se pregunta a la base en vez de suponerlo. */
      if(!await esAdministrador()){
        await cerrarSesion();
        throw new Error('Tu cuenta no tiene permisos de administrador.');
      }

      isAdmin = true;
      document.body.classList.add('is-admin');
      adminTab = 'products';

      // Traer lo que hay en la base ANTES de pintar el panel: editar sobre una
      // copia vieja es como dos personas se pisan los cambios sin enterarse.
      await sincronizarDesdeLaBase();
      renderAdmin(); render();
    }catch(e){
      err.textContent = e.message;
      pass.value = '';
      pass.focus();
    }finally{
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  };

  btn.addEventListener('click', submit);
  [mail, pass].forEach(el => el.addEventListener('keydown', e=>{ if(e.key==='Enter') submit() }));
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
  else if(adminTab==='brand') body.innerHTML = brandHTML();
  else if(adminTab==='site') body.innerHTML = siteHTML();
  else body.innerHTML = backupHTML();

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

  if(adminTab==='solicitudes' && solicitudes === null) cargarSolicitudes();
  if(adminTab==='products' && metricas === null) cargarMetricas();

  // El botón se vuelve a dibujar en cada render: hay que devolverle la cuenta
  // atrás, o cambiar de pestaña serviría para saltarse la espera.
  if(Date.now() - ultimaPublicacion < ESPERA_PUBLICAR) cuentaAtrasPublicar();
}

/* ══════════════════ COTIZACIONES ══════════════════

   La bandeja de trabajo. Hasta ahora había que entrar a Supabase y leer
   columnas en crudo; aquí se ven como lo que son: gente que pidió precio.

   `null` significa "todavía no se han pedido", que no es lo mismo que "no hay
   ninguna". Distinguirlo evita enseñar "no tienes cotizaciones" mientras la
   consulta va en camino — un mensaje que asusta y encima es falso. */
let solicitudes = null;

async function cargarSolicitudes(){
  try{
    solicitudes = await remotoSolicitudes();
  }catch(err){
    solicitudes = [];
    showToast('No se pudieron cargar las cotizaciones: ' + err.message, true);
  }
  if(isAdmin && adminTab==='solicitudes') renderAdmin();
}

const ETIQUETA_ESTADO = {
  nueva:    {texto:'Nueva',    clase:'badge-new'},
  atendida: {texto:'Atendida', clase:'badge-rent'},
  cerrada:  {texto:'Cerrada',  clase:'badge-used'},
  spam:     {texto:'Spam',     clase:'badge-vendido'},
};

function solicitudesHTML(){
  if(solicitudes === null) return '<p class="adm-note">Cargando cotizaciones…</p>';

  if(!solicitudes.length) return `
    <div class="empty-state" style="border:none;background:#FAFAFA">
      <div class="icon">📨</div><h3>Todavía no hay cotizaciones</h3>
      <p>Aquí van a aparecer las solicitudes que llegue por el formulario del sitio,
         con sus datos de contacto y lo que pidieron.</p>
    </div>`;

  const nuevas = solicitudes.filter(s => s.estado==='nueva').length;

  return `
    <p class="adm-note">${solicitudes.length} solicitudes${nuevas?` · <strong>${nuevas} sin atender</strong>`:''}.
      No se pueden borrar: son registro comercial y la evidencia de que el cliente
      dio sus datos. Se marcan como atendida, cerrada o spam.</p>
    <table class="adm-table">
      <thead><tr>
        <th>Cuándo</th><th>Quién</th><th class="hide-sm">Pidió</th><th>Estado</th><th></th>
      </tr></thead>
      <tbody>
        ${solicitudes.map(s => solicitudFilaHTML(s)).join('')}
      </tbody>
    </table>`;
}

function solicitudFilaHTML(s){
  const f = new Date(s.creado_en);
  const cuando = f.toLocaleDateString('es-MX',{day:'2-digit',month:'short'}) + ' · ' +
                 f.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
  const et = ETIQUETA_ESTADO[s.estado] || ETIQUETA_ESTADO.nueva;
  const carrito = Array.isArray(s.carrito) ? s.carrito : [];

  /* El teléfono es un enlace directo a WhatsApp con el nombre ya escrito.
     Ese es el gesto que convierte una lista en una herramienta: se ve la
     solicitud y se contesta sin copiar números a mano. */
  const wa = `https://wa.me/52${String(s.telefono).replace(/\D/g,'')}?text=` +
    encodeURIComponent(`Hola ${s.nombre}, le escribo de ${settings.brandMain}${settings.brandAccent} por su solicitud.`);

  return `<tr>
    <td style="white-space:nowrap;font-size:12px">${esc(cuando)}</td>
    <td>
      <div style="font-weight:600">${esc(s.nombre)}</div>
      <div style="font-size:12px">
        <a href="${wa}" target="_blank" rel="noopener">💬 ${esc(s.telefono)}</a>
        ${s.correo?` · ${esc(s.correo)}`:''}
      </div>
      ${s.empresa?`<div style="font-size:12px;color:var(--muted)">${esc(s.empresa)}</div>`:''}
    </td>
    <td class="hide-sm" style="font-size:12px">
      ${s.tipo==='publicacion'?'<em>Quiere vender un equipo</em>':''}
      ${carrito.length?carrito.map(i=>`${i.cantidad||1}× ${esc(i.nombre||i.slug||'')}`).join('<br>'):''}
      ${s.mensaje?`<div style="color:var(--muted);margin-top:4px">${esc(String(s.mensaje).slice(0,180))}</div>`:''}
    </td>
    <td><span class="pcard-badge ${et.clase}" style="position:static">${et.texto}</span></td>
    <td style="white-space:nowrap">
      ${s.estado!=='atendida'?`<button class="icon-btn" type="button" data-sol="${s.id}" data-estado="atendida" title="Marcar como atendida">✓</button>`:''}
      ${s.estado!=='cerrada'?`<button class="icon-btn" type="button" data-sol="${s.id}" data-estado="cerrada" title="Cerrar">📁</button>`:''}
      ${s.estado!=='spam'?`<button class="icon-btn" type="button" data-sol="${s.id}" data-estado="spam" title="Marcar como spam">🚫</button>`:''}
    </td>
  </tr>`;
}

async function cambiarEstadoSolicitud(id, estado){
  try{
    const actualizada = await remotoEstadoSolicitud(id, estado);
    const i = solicitudes.findIndex(s => s.id === id);
    if(i >= 0) solicitudes[i] = actualizada;
    renderAdmin();
  }catch(err){
    showToast(err.message, true);
  }
}

/* ══════════════════ QUÉ SE MIRA Y QUÉ SE COTIZA ══════════════════

   Dos números por equipo, contados en tu propia base. Sin cookies, sin
   scripts de terceros y sin poder saber quién miró: sólo cuántas veces.

   Lo que se busca no es "cuál se mira más" — eso ya se intuye. Es el equipo
   que se mira MUCHO y se cotiza POCO: ése tiene el precio fuera de mercado,
   las fotos malas o la descripción incompleta. Es el único dato que dice
   dónde tocar. */
let metricas = null;

async function cargarMetricas(){
  try{
    metricas = await remotoMetricas();
  }catch{
    metricas = [];   // sin métricas el panel sigue sirviendo: no se avisa
  }
  if(isAdmin && adminTab==='products' && editingId === null) renderAdmin();
}

function metricasHTML(){
  if(metricas === null || !metricas.length) return '';

  const total = metricas.reduce((n,m)=>n+Number(m.vistas||0), 0);
  if(!total) return '';

  /* Se ordena por vistas SIN cotización, no por vistas a secas: lo que hay
     que enseñar arriba es dónde se está perdiendo gente. */
  const conNombre = metricas.map(m => {
    const eq = products.find(p => p.slug === m.slug);
    const vistas = Number(m.vistas||0), cot = Number(m.cotizaciones||0);
    return { nombre: eq ? eq.name : m.slug, vistas, cot, perdidas: vistas - cot };
  }).filter(m => m.vistas > 0).sort((a,b) => b.perdidas - a.perdidas).slice(0, 6);

  return `
    <div class="adm-section">
      <h3>Qué miran tus clientes</h3>
      <p class="sub">${total} fichas abiertas en total. Se cuenta en tu propia base,
        sin cookies ni rastreo: no se sabe quién miró, sólo cuántas veces.
        <strong>Fíjate en el que tiene muchas vistas y pocas cotizaciones</strong> —
        ése suele ser el que tiene el precio alto o las fotos flojas.</p>
      <table class="adm-table">
        <thead><tr><th>Equipo</th><th>Vistas</th><th>Cotizado</th><th></th></tr></thead>
        <tbody>
          ${conNombre.map(m => `<tr>
            <td>${esc(m.nombre)}</td>
            <td>${m.vistas}</td>
            <td>${m.cot}</td>
            <td style="font-size:12px;color:var(--muted)">${
              m.vistas >= 5 && m.cot === 0 ? 'Se mira y nadie cotiza' : ''
            }</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ── Listado de equipos ── */
function productListHTML(){
  const q = adminQuery.toLowerCase();
  const list = products.filter(p=>!q || `${p.name} ${p.brand} ${p.cat} ${p.location}`.toLowerCase().includes(q));
  return `
    <div class="adm-toolbar">
      <input class="adm-search" type="search" id="admSearch" placeholder="Buscar por nombre, marca, categoría…" value="${esc(adminQuery)}">
      <button class="btn-primary" type="button" data-action="admin-new">+ Nuevo equipo</button>
    </div>
    ${publicarHTML()}
    ${metricasHTML()}
    ${!list.length ? `<div class="empty-state" style="border:none;background:#FAFAFA">
        <div class="icon">📦</div><h3>${products.length?'Sin coincidencias':'Catálogo vacío'}</h3>
        <p>${products.length?'Prueba con otra búsqueda.':'Publica tu primer equipo para que aparezca en la tienda.'}</p></div>` : `
    <table class="adm-table">
      <thead><tr>
        <th style="width:60px">Foto</th><th>Equipo</th>
        <th class="hide-sm">Categoría</th><th class="hide-sm">Ubicación</th>
        <th>Precio</th><th>Estado</th><th></th>
      </tr></thead>
      <tbody>
        ${list.map(p=>`<tr>
          <td><div class="adm-thumb-wrap">${p.img?`<img class="adm-thumb" src="${esc(p.img)}" alt="">`:(svgs[p.svgKey]||'')}</div></td>
          <td>
            <div style="font-weight:600">${esc(p.name)}</div>
            <div style="font-size:11px;color:var(--light)">${esc(p.brand)} · ${p.year}${p.hot?' · 🔥 destacado':''}${p.imgs.length?` · 📷 ${p.imgs.length} foto${p.imgs.length>1?'s':''}`:' · sin fotos'}</div>
          </td>
          <td class="hide-sm">${esc(p.cat)}</td>
          <td class="hide-sm">${esc(p.location)}</td>
          <td style="white-space:nowrap">${fmtCompact(p.price)}${p.cond==='Renta'?'<small>/mes</small>':''}</td>
          <td><span class="pill ${p.cond.toLowerCase()}">${esc(COND_LABELS[p.cond])}</span></td>
          <td><div class="adm-row-actions">
            <button class="icon-btn" type="button" data-edit="${p.id}" title="Editar" aria-label="Editar ${esc(p.name)}">✎</button>
            <button class="icon-btn" type="button" data-dup="${p.id}" title="Duplicar" aria-label="Duplicar ${esc(p.name)}">⧉</button>
            <button class="icon-btn del" type="button" data-delp="${p.id}" title="Eliminar" aria-label="Eliminar ${esc(p.name)}">🗑</button>
          </div></td>
        </tr>`).join('')}
      </tbody>
    </table>
    <p style="font-size:12px;color:var(--light);margin-top:14px">${list.length} de ${products.length} equipos · almacenamiento usado: ${fmtKB(store.usedBytes())}</p>`}`;
}

/* ── Formulario de equipo ── */
function productFormHTML(){
  const p = editingId ? products.find(x=>x.id===editingId) : null;
  const nuevo = !p;
  const v = p || {name:'',brand:'',cat:'',cond:'Nuevo',price:'',original:'',finance:'',leasing:false,
                  shipping:true,location:'',year:new Date().getFullYear(),specs:[],desc:'',svgKey:'excavadora',imgs:[],hot:false};
  const fotos = draftImgs === undefined ? (v.imgs || []) : draftImgs;

  return `
    <div class="adm-toolbar">
      <button class="btn-ghost" type="button" data-action="admin-cancel">← Volver al listado</button>
      <strong style="font-size:15px">${nuevo?'Nuevo equipo':'Editar: '+esc(v.name)}</strong>
    </div>
    <form id="pForm" novalidate>
      <div class="adm-section">
        <h3>Fotos del equipo <span class="hint">(hasta ${MAX_FOTOS})</span></h3>
        <p class="sub">Cada una se redimensiona a 1000 px y se comprime automáticamente.
          La <strong>primera es la portada</strong>: es la que sale en el catálogo y al compartir el enlace.
          Sin fotos se usa un ícono ilustrativo.</p>
        ${fotos.length ? `
          <div class="fotos-grid">
            ${fotos.map((f,n)=>`
              <figure class="foto-item${n===0?' portada':''}">
                <img src="${esc(f)}" alt="Foto ${n+1}">
                ${n===0?'<figcaption class="foto-tag">Portada</figcaption>':''}
                <div class="foto-tools">
                  <button type="button" data-foto-mov="${n}" data-paso="-1" ${n===0?'disabled':''} title="Mover antes" aria-label="Mover la foto ${n+1} antes">◀</button>
                  <button type="button" data-foto-mov="${n}" data-paso="1" ${n===fotos.length-1?'disabled':''} title="Mover después" aria-label="Mover la foto ${n+1} después">▶</button>
                  <button type="button" class="rm" data-foto-quita="${n}" title="Quitar" aria-label="Quitar la foto ${n+1}">✕</button>
                </div>
                <figcaption class="foto-peso">${fmtKB(dataUriBytes(f))}</figcaption>
              </figure>`).join('')}
          </div>
          <p class="sub" style="margin-top:8px">Total de las ${fotos.length} fotos: ${fmtKB(fotos.reduce((s,f)=>s+dataUriBytes(f),0))}</p>` : ''}
        ${fotos.length < MAX_FOTOS ? `
          <div class="dropzone${fotos.length?' compacta':''}" id="dz" tabindex="0" role="button" aria-label="Agregar fotos del equipo">
            <div class="dz-icon">📷</div>
            <p><strong>Haz clic o arrastra ${fotos.length?'más fotos':'imágenes'} aquí</strong></p>
            <p>JPG, PNG o WebP · puedes elegir varias a la vez</p>
          </div>` : `<p class="sub">Llegaste al máximo de ${MAX_FOTOS} fotos. Quita alguna para agregar otra.</p>`}
        <input type="file" id="imgInput" accept="image/*" multiple hidden>
      </div>

      <div class="form-grid">
        <div class="field full" data-f="name">
          <label for="f-name">Nombre del equipo *</label>
          <input type="text" id="f-name" value="${esc(v.name)}" placeholder="Excavadora CAT 320 GC">
          <span class="errmsg">Escribe un nombre.</span>
        </div>

        <div class="field">
          <label for="f-brand">Marca</label>
          <input type="text" id="f-brand" list="dl-brands" value="${esc(v.brand)}" placeholder="CAT">
          <datalist id="dl-brands">${brands().map(b=>`<option value="${esc(b)}">`).join('')}</datalist>
        </div>
        <div class="field">
          <label for="f-cat">Categoría <span class="hint">(escribe una nueva para crearla)</span></label>
          <input type="text" id="f-cat" list="dl-cats" value="${esc(v.cat)}" placeholder="Excavación">
          <datalist id="dl-cats">${baseCats().map(c=>`<option value="${esc(c)}">`).join('')}</datalist>
        </div>

        <div class="field">
          <label for="f-cond">Condición</label>
          <select id="f-cond">${CONDS.map(c=>`<option value="${c}"${v.cond===c?' selected':''}>${COND_LABELS[c]}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label for="f-disp">Disponibilidad</label>
          <select id="f-disp">
            <option value="disponible"${(v.disponibilidad||'disponible')==='disponible'?' selected':''}>Disponible</option>
            <option value="apartado"${v.disponibilidad==='apartado'?' selected':''}>Apartado</option>
            <option value="vendido"${v.disponibilidad==='vendido'?' selected':''}>Vendido</option>
          </select>
        </div>
        <div class="field">
          <label for="f-location">Ubicación</label>
          <input type="text" id="f-location" list="dl-locs" value="${esc(v.location)}" placeholder="Tuxtla Gutiérrez">
          <datalist id="dl-locs">${locations().map(l=>`<option value="${esc(l)}">`).join('')}</datalist>
        </div>

        <div class="field" data-f="price">
          <label for="f-price">Precio en MXN * <span class="hint">(si es renta, el costo mensual)</span></label>
          <input type="number" id="f-price" min="0" step="100" value="${v.price}">
          <span class="errmsg">Escribe un precio válido.</span>
        </div>
        <div class="field">
          <label for="f-original">Precio anterior <span class="hint">(para mostrar descuento)</span></label>
          <input type="number" id="f-original" min="0" step="100" value="${v.original ?? ''}">
        </div>

        <div class="field">
          <label for="f-finance">Meses sin intereses <span class="hint">(ej. "18 MSI"; vacío = sin MSI)</span></label>
          <input type="text" id="f-finance" value="${esc(v.finance ?? '')}" placeholder="18 MSI">
        </div>
        <div class="field">
          <label for="f-year">Año</label>
          <input type="number" id="f-year" min="1980" max="2100" value="${v.year}">
        </div>

        <div class="field full">
          <label for="f-specs">Especificaciones <span class="hint">(separadas por coma; se muestran las 3 primeras)</span></label>
          <input type="text" id="f-specs" value="${esc(v.specs.join(', '))}" placeholder="20 ton, 148 HP, 6.5 m alcance">
        </div>

        <div class="field full">
          <label for="f-desc">Descripción</label>
          <textarea id="f-desc" placeholder="Describe el equipo, su estado y qué incluye…">${esc(v.desc)}</textarea>
        </div>

        <div class="field">
          <label for="f-svg">Ícono de respaldo <span class="hint">(si no hay foto)</span></label>
          <select id="f-svg">${Object.keys(svgs).map(k=>`<option value="${k}"${v.svgKey===k?' selected':''}>${SVG_LABELS[k]}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label>Opciones</label>
          <div class="checks">
            <label class="check"><input type="checkbox" id="f-shipping"${v.shipping?' checked':''}> Envío incluido</label>
            <label class="check"><input type="checkbox" id="f-leasing"${v.leasing?' checked':''}> Arrendamiento</label>
            <label class="check"><input type="checkbox" id="f-hot"${v.hot?' checked':''}> Destacado 🔥</label>
          </div>
        </div>
      </div>

      <div class="form-actions">
        ${!nuevo?`<button class="btn-danger" type="button" data-delp="${v.id}">Eliminar equipo</button>`:''}
        <button class="btn-ghost" type="button" data-action="admin-cancel">Cancelar</button>
        <button class="btn-primary" type="submit">${nuevo?'Publicar equipo':'Guardar cambios'}</button>
      </div>
    </form>`;
}

function readForm(){
  const val = id => $('#'+id).value.trim();
  const num = id => { const raw = $('#'+id).value; if(raw==='') return null; const n = Number(raw); return Number.isFinite(n) ? n : null };
  return {
    name: val('f-name'),
    brand: val('f-brand') || 'Sin marca',
    cat: val('f-cat') || 'General',
    cond: val('f-cond'),
    price: num('f-price'),
    original: num('f-original'),
    finance: val('f-finance') || null,
    leasing: $('#f-leasing').checked,
    shipping: $('#f-shipping').checked,
    hot: $('#f-hot').checked,
    location: val('f-location') || 'Tuxtla Gutiérrez',
    year: num('f-year') || new Date().getFullYear(),
    specs: val('f-specs').split(',').map(s=>s.trim()).filter(Boolean),
    desc: val('f-desc'),
    svgKey: val('f-svg'),
    disponibilidad: val('f-disp') || 'disponible'
  };
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
  const copia = {...p, id: null, name: nombre, slug: slugDesdeNombre(nombre), hot: false, publicado: false};

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
      <strong>Importante:</strong> todo lo que editas se guarda en el <em>localStorage de este navegador</em>, en esta
      computadora. Tus visitantes <strong>no verán estos cambios</strong>, y se pierden si limpias los datos del navegador
      o cambias de equipo. Exporta un respaldo con frecuencia. Para que el catálogo sea el mismo para todo el mundo
      hace falta un servidor con base de datos.
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

/* ── Carga de imágenes ── */

/** Fotos del equipo en edición, sean las guardadas o las que ya se tocaron. */
function fotosEnEdicion(){
  if(draftImgs !== undefined) return draftImgs;
  const p = editingId ? products.find(x=>x.id===editingId) : null;
  return p ? [...p.imgs] : [];
}

function moverFoto(n, paso){
  const fotos = fotosEnEdicion();
  const destino = n + paso;
  if(destino < 0 || destino >= fotos.length) return;
  [fotos[n], fotos[destino]] = [fotos[destino], fotos[n]];
  draftImgs = fotos;
  renderAdmin();
}

function quitarFoto(n){
  const fotos = fotosEnEdicion();
  fotos.splice(n, 1);
  draftImgs = fotos;
  renderAdmin();
}

/** Procesa varias imágenes a la vez, respetando el tope. */
async function handleImageFiles(files, target){
  const lista = [...(files || [])];
  if(!lista.length) return;
  if(target !== 'product'){ await handleImageFile(lista[0], target); return }

  const fotos = fotosEnEdicion();
  const espacio = MAX_FOTOS - fotos.length;
  if(espacio <= 0){ showToast(`Máximo ${MAX_FOTOS} fotos por equipo`, true); return }

  const aceptadas = lista.slice(0, espacio);
  showToast(aceptadas.length>1 ? `Subiendo ${aceptadas.length} fotos…` : 'Subiendo foto…');

  /* Se comprime ANTES de subir, no después.

     Una foto de celular ronda los 4-8 MB y el servidor rechaza cualquier cosa
     por encima de 3. Comprimiendo aquí a 1400 px se queda en unos cientos de
     KB: sube en segundos incluso con mala señal, y en pantalla se ve igual.
     Subir el original sería tardar diez veces más para que el visitante
     descargue una foto que su pantalla no puede aprovechar. */
  const prev = editingId ? products.find(p=>p.id===editingId) : null;
  const slug = prev?.slug || (($('#f-name')?.value || 'equipo').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''));

  const fallidas = [];
  for(const file of aceptadas){
    try{
      const grande = await fileToBlob(file, 1400, .82);
      // La chica se genera bajo demanda: si la grande falla, no se gasta
      // tiempo comprimiendo una miniatura que nadie va a usar.
      fotos.push(await remotoSubirFoto(grande, slug, () => fileToBlob(file, 700, .78)));
    }catch(err){
      fallidas.push(`${file.name || 'una imagen'} (${err.message})`);
    }
  }
  draftImgs = fotos;
  renderAdmin();

  if(fallidas.length) showToast('No se subieron: ' + fallidas.join(' · '), true);
  else if(lista.length > espacio) showToast(`Se subieron ${aceptadas.length}; el tope es ${MAX_FOTOS} fotos`, true);
  else showToast(aceptadas.length>1 ? `${aceptadas.length} fotos subidas` : 'Foto subida');
}

/**
 * Comprime una imagen y la devuelve como Blob, listo para subir.
 *
 * Es fileToDataURL pero sin convertir a texto. La conversión a data URI infla
 * el tamaño un 33% y sólo servía para meter la foto en el localStorage — que
 * es justamente lo que dejamos de hacer.
 */
async function fileToBlob(file, maxW = 1400, quality = 0.82){
  if(!file.type.startsWith('image/')) throw new Error('no es una imagen');

  // Los SVG no se rasterizan: son vectores y pesan poco. Van tal cual.
  if(file.type === 'image/svg+xml'){
    if(file.size > 200*1024) throw new Error('el SVG pesa más de 200 KB');
    return file;
  }

  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, maxW / bitmap.width);
  const w = Math.max(1, Math.round(bitmap.width*escala));
  const h = Math.max(1, Math.round(bitmap.height*escala));

  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  // Sin fondo blanco, un JPEG con transparencia sale con manchas negras.
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,w,h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  if(bitmap.close) bitmap.close();

  const blob = await new Promise(res => c.toBlob(res, 'image/webp', quality));
  if(!blob) throw new Error('no se pudo comprimir');
  if(blob.size > 3*1024*1024) throw new Error('sigue pesando más de 3 MB');
  return blob;
}

async function handleImageFile(file, target){
  if(!file) return;
  try{
    showToast('Procesando imagen…');
    /* Subir imágenes desde aquí está desactivado a propósito.

       La imagen se convertía en texto incrustado y se guardaba en el
       navegador. Ahora el catálogo vive en la base, y una foto así no cabe
       en una columna de texto ni debe: para eso está el almacenamiento de
       Supabase, con su CDN y su límite por archivo.

       Lo importante es que NO se quede a medias. Si aceptáramos la imagen y
       la pintáramos sin guardarla, se vería el logo nuevo hasta recargar y
       luego desaparecería, y nadie entendería por qué. Vale más decir que
       todavía no se puede. */
    showToast('Las imágenes aún no se pueden subir desde aquí. Se conectarán al almacenamiento de Supabase.', true);
    return;
  }catch(err){
    showToast(err.message || 'No se pudo procesar la imagen', true);
  }
}

function wireDropzone(zoneId, inputId, target){
  const zone = $('#'+zoneId), input = $('#'+inputId);
  if(!zone || !input) return;
  const pick = ()=>input.click();
  zone.addEventListener('click', pick);
  zone.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); pick() } });
  zone.addEventListener('dragover', e=>{ e.preventDefault(); zone.classList.add('drag') });
  zone.addEventListener('dragleave', ()=>zone.classList.remove('drag'));
  zone.addEventListener('drop', e=>{
    e.preventDefault(); zone.classList.remove('drag');
    handleImageFiles(e.dataTransfer.files, target);
  });
  input.addEventListener('change', ()=>handleImageFiles(input.files, target));
}

async function logoutAdmin(){
  isAdmin = false;
  document.body.classList.remove('is-admin');
  editingId = null; draftImgs = undefined;

  /* Se borra el token de este dispositivo y se le avisa al servidor.
     Importa porque la sesión vive en localStorage y sobrevive al cierre del
     navegador: en una computadora compartida, cerrar la pestaña NO basta. */
  await cerrarSesion();

  /* Se recarga para volver al catálogo publicado. Sin esto quedaría en
     pantalla lo que se trajo de la base -- incluidos los borradores sin
     publicar, que no debe seguir viendo quien ya salió. */
  location.reload();
}
