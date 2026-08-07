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
 * La obra que trabaja al lado del formulario.
 *
 * Es SVG dibujado a mano y animado con CSS, no una imagen ni una librería: pesa
 * unos pocos kilobytes, se ve nítido en cualquier pantalla y no añade una sola
 * petición de red — cosa que importa porque el CSP del sitio no deja cargar
 * scripts de terceros.
 *
 * La pluma, el brazo y el cucharón son grupos ANIDADOS que giran cada uno sobre
 * su propio perno, igual que en la máquina real. Por eso el movimiento se ve
 * encadenado —al bajar la pluma, el brazo la acompaña— y no como tres piezas
 * sueltas moviéndose por su cuenta. El polvo y el humo salen sincronizados con
 * el ciclo: el polvo justo cuando el cucharón toca el suelo.
 *
 * Coordenadas en el viewBox de 380×330. El suelo está en y=268; los pernos, en
 * (160,196), (238,130) y (286,196) — los mismos valores que el CSS usa como
 * transform-origin, así que si mueves uno hay que mover el otro.
 */
function escenaExcavadora(){
  return `
  <svg viewBox="0 0 380 330" preserveAspectRatio="xMidYMid slice" role="presentation" focusable="false">
    <defs>
      <linearGradient id="lgCielo" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2B2A27"/>
        <stop offset=".55" stop-color="#1A1917"/>
        <stop offset="1" stop-color="#101010"/>
      </linearGradient>
      <linearGradient id="lgAmarillo" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FFDD5C"/><stop offset="1" stop-color="#E0A400"/>
      </linearGradient>
      <radialGradient id="lgHalo">
        <stop offset="0" stop-color="#FFC700" stop-opacity=".38"/>
        <stop offset="1" stop-color="#FFC700" stop-opacity="0"/>
      </radialGradient>
    </defs>

    <rect width="380" height="330" fill="url(#lgCielo)"/>
    <circle cx="298" cy="76" r="62" fill="url(#lgHalo)"/>
    <circle class="lg-sun" cx="298" cy="76" r="24" fill="#FFC700" opacity=".55"/>
    <ellipse class="lg-haze" cx="190" cy="120" rx="150" ry="34" fill="#8A6D00" opacity=".22"/>

    <!-- Dos cordilleras a distinta altura: la de atrás más clara y la de
         adelante más oscura. Es lo que da sensación de profundidad. -->
    <path d="M0 214 L58 188 L112 208 L170 176 L232 202 L292 182 L340 200 L380 190 V330 H0 Z" fill="#191817"/>
    <path d="M0 242 L70 226 L142 240 L212 220 L282 236 L340 226 L380 234 V330 H0 Z" fill="#131312"/>

    <!-- Camión de volteo esperando su carga, al fondo y más pequeño. -->
    <g class="lg-truck">
      <g transform="translate(0 250) scale(.74)" fill="#38352E">
        <path d="M6 -46 h54 v28 H6 Z" fill="#454138"/>
        <path d="M62 -40 h22 q6 0 8 5 l6 17 H62 Z" fill="#4A4034"/>
        <rect x="66" y="-36" width="18" height="12" rx="2" fill="#22282B"/>
        <rect x="6" y="-18" width="92" height="7" rx="2"/>
        <circle cx="24" cy="-7" r="8" fill="#2A2825"/><circle cx="24" cy="-7" r="3" fill="#4E4A42"/>
        <circle cx="82" cy="-7" r="8" fill="#2A2825"/><circle cx="82" cy="-7" r="3" fill="#4E4A42"/>
      </g>
    </g>

    <!-- Suelo, y la loma que la máquina va amontonando a su derecha. -->
    <path d="M0 268 H380 V330 H0 Z" fill="#16130E"/>
    <path d="M0 268 H262 q16 -13 34 -2 t28 2 H380" fill="#241F16" stroke="#3D3527" stroke-width="1.6"/>

    <g class="lg-machine">
      <!-- Orugas: la banda, las dos ruedas grandes y los rodillos de abajo. -->
      <rect x="40" y="234" width="152" height="30" rx="15" fill="#2C2B29" stroke="#4A4844" stroke-width="2"/>
      <circle cx="58" cy="249" r="9" fill="#4A4844"/><circle cx="174" cy="249" r="9" fill="#4A4844"/>
      <circle cx="92" cy="256" r="5" fill="#3B3936"/><circle cx="118" cy="256" r="5" fill="#3B3936"/>
      <circle cx="144" cy="256" r="5" fill="#3B3936"/>

      <!-- Contrapeso, casa de máquinas y cabina. -->
      <path d="M52 234 V206 q0 -8 9 -8 h26 l8 -16 h40 q8 0 8 8 v44 Z" fill="url(#lgAmarillo)"/>
      <path d="M95 182 h32 q5 0 5 5 v19 H90 Z" fill="#1E2A33" opacity=".92"/>
      <path d="M95 182 h14 l-14 24 Z" fill="#33454F" opacity=".55"/>
      <rect x="54" y="212" width="34" height="11" rx="3" fill="#B98700" opacity=".55"/>
      <rect x="70" y="176" width="3" height="22" fill="#6E5800"/>
      <circle class="lg-beacon" cx="140" cy="176" r="4" fill="#FF7A1A"/>
      <rect x="138.5" y="178" width="3" height="6" fill="#8A6D00"/>

      <!-- Pluma → brazo → cucharón. Cada <g> gira sobre su perno. -->
      <g class="lg-boom">
        <path d="M160 196 L238 130" stroke="url(#lgAmarillo)" stroke-width="15" stroke-linecap="round" fill="none"/>
        <path d="M168 202 L232 148" stroke="#00000022" stroke-width="4" fill="none"/>
        <circle cx="160" cy="196" r="5.5" fill="#2C2B29"/>
        <g class="lg-stick">
          <path d="M238 130 L286 196" stroke="url(#lgAmarillo)" stroke-width="11" stroke-linecap="round" fill="none"/>
          <circle cx="238" cy="130" r="4.5" fill="#2C2B29"/>
          <g class="lg-bucket">
            <path d="M276 191 h22 l-3 19 q-1 11 -12 12 q-12 1 -11 -12 Z" fill="#C99500" stroke="#7E6300" stroke-width="1.8" stroke-linejoin="round"/>
            <path d="M274 220 h26" stroke="#54430A" stroke-width="4" stroke-linecap="round"/>
            <circle cx="286" cy="196" r="4" fill="#2C2B29"/>
          </g>
        </g>
      </g>
    </g>

    <!-- Humo del escape, encima del tubo. -->
    <g fill="#6E6A60">
      <circle class="lg-smoke" cx="71" cy="174" r="4"/>
      <circle class="lg-smoke lg-smoke-b" cx="71" cy="174" r="3"/>
      <circle class="lg-smoke lg-smoke-c" cx="71" cy="174" r="3.5"/>
    </g>

    <!-- Polvo del cucharón contra el suelo. -->
    <g fill="#6B5F45">
      <circle class="lg-dust" cx="292" cy="262" r="7"/>
      <circle class="lg-dust lg-dust-b" cx="304" cy="266" r="5"/>
      <circle class="lg-dust lg-dust-c" cx="282" cy="266" r="4"/>
    </g>

    <!-- Partículas que suben lento: mantienen viva la escena entre ciclos. -->
    <g fill="#C9B98A" opacity=".45">
      <circle class="lg-mote" cx="120" cy="290" r="1.6"/>
      <circle class="lg-mote lg-mote-b" cx="230" cy="300" r="1.3"/>
      <circle class="lg-mote lg-mote-c" cx="320" cy="286" r="1.5"/>
    </g>
  </svg>`;
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
    <div class="login-shell">
      <div class="login-hero" aria-hidden="true">
        ${escenaExcavadora()}
        <div class="login-hero-badge"><i></i>Acceso del equipo</div>
        <div class="login-hero-copy">
          <b>La obra no se detiene.</b>
          <span>Publica equipos, contesta cotizaciones y mueve precios desde
                donde estés. Lo que guardes aquí lo ve todo el equipo.</span>
        </div>
      </div>

      <div class="login-form">
        <h3>Inicia <em>sesión</em></h3>
        <p class="sub">Entra con tu cuenta para editar el catálogo. Los cambios
           se guardan en la base, no en este navegador.</p>
        <div class="login-field">
          <span class="ico">✉️</span>
          <input id="mailInput" type="email" autocomplete="username" placeholder=" ">
          <label for="mailInput">Correo</label>
        </div>
        <div class="login-field">
          <span class="ico">🔑</span>
          <input id="passInput" type="password" autocomplete="current-password" placeholder=" ">
          <label for="passInput">Contraseña</label>
          <button class="login-eye" type="button" id="verPass" aria-pressed="false" aria-label="Mostrar la contraseña">👁</button>
        </div>
        <div class="login-hint" id="capsHint">⇪ Bloq Mayús está encendido.</div>
        <div class="login-err" id="pinErr" role="alert"></div>
        <button class="btn-primary" type="button" id="pinBtn">Entrar al panel</button>
        <p class="login-foot">🔐 La contraseña se comprueba en el servidor, nunca en esta página.</p>
      </div>
    </div>`;

  const mail = $('#mailInput'), pass = $('#passInput'), btn = $('#pinBtn'), err = $('#pinErr');

  /* El mensaje se repinta con una sacudida corta. Cuando el error es el mismo
     dos veces seguidas —contraseña mal escrita otra vez— el texto no cambia y
     sin el movimiento parecería que el botón no hizo nada. Reiniciar la clase
     en dos pasos obliga al navegador a volver a lanzar la animación. */
  const fallar = txt =>{
    err.textContent = txt;
    err.classList.remove('show');
    void err.offsetWidth;
    err.classList.add('show');
  };

  // Ver la contraseña: escribirla a ciegas es la causa más común de "no entra".
  $('#verPass').addEventListener('click', e =>{
    const b = e.currentTarget, ver = pass.type === 'password';
    pass.type = ver ? 'text' : 'password';
    b.textContent = ver ? '🙈' : '👁';
    b.setAttribute('aria-pressed', String(ver));
    b.setAttribute('aria-label', ver ? 'Ocultar la contraseña' : 'Mostrar la contraseña');
    pass.focus();
  });

  /* Bloq Mayús encendido: el campo va oculto, así que el aviso es la única
     pista de por qué la contraseña correcta es rechazada. */
  const caps = $('#capsHint');
  pass.addEventListener('keyup', e =>{
    caps.classList.toggle('show', e.getModifierState && e.getModifierState('CapsLock'));
  });
  pass.addEventListener('blur', ()=> caps.classList.remove('show'));

  const submit = async ()=>{
    err.textContent = '';
    err.classList.remove('show');
    if(!mail.value.trim() || !pass.value){
      fallar('Escribe tu correo y tu contraseña.');
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
      fallar(e.message);
      pass.value = '';
      pass.focus();
    }finally{
      btn.disabled = false;
      btn.textContent = 'Entrar al panel';
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
  else if(adminTab==='preguntas') body.innerHTML = preguntasAdminHTML();
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

/* ══════════════════ COTIZACIONES ══════════════════

   La bandeja de trabajo. Hasta ahora había que entrar a Supabase y leer
   columnas en crudo; aquí se ven como lo que son: gente que pidió precio.

   `null` significa "todavía no se han pedido", que no es lo mismo que "no hay
   ninguna". Distinguirlo evita enseñar "no tienes cotizaciones" mientras la
   consulta va en camino — un mensaje que asusta y encima es falso. */
let solicitudes = null;
let pidiendoSolicitudes = false;

async function cargarSolicitudes(){
  if(solicitudes !== null || pidiendoSolicitudes) return;
  pidiendoSolicitudes = true;
  try{
    solicitudes = await remotoSolicitudes();
  }catch(err){
    solicitudes = [];
    showToast('No se pudieron cargar las cotizaciones: ' + err.message, true);
  }finally{
    pidiendoSolicitudes = false;
  }
  if(!isAdmin) return;
  // Igual que con las preguntas: no se redibuja el panel entero a destiempo,
  // que se llevaría por delante un formulario a medio llenar.
  if(adminTab==='solicitudes' && editingId === null) renderAdmin();
  else pintarPendientes();
}

/** Cotizaciones que nadie ha atendido. Van en la pestaña para que no se pasen. */
const solicitudesPendientes = () =>
  solicitudes === null ? 0 : solicitudes.filter(s => s.estado === 'nueva').length;

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
    pintarPendientes();   // marcar una como atendida tiene que bajar el número
  }catch(err){
    showToast(err.message, true);
  }
}

/* ══════════════════ PREGUNTAS DEL PÚBLICO ══════════════════

   La bandeja que más rinde por minuto invertido: cada respuesta se queda en la
   ficha y contesta a todos los que lleguen después. Una duda contestada por
   WhatsApp sirve una vez; contestada aquí, sirve para siempre y además Google
   la indexa como contenido de la página.

   Igual que con las solicitudes, `null` es "todavía no se han pedido", que no
   es lo mismo que "no hay ninguna". */
let preguntas = null;
let pidiendoPreguntas = false;

async function cargarPreguntas(){
  /* renderAdmin() se llama muchas veces —al cambiar de pestaña, al guardar, al
     escribir en el buscador—. Sin este cerrojo cada redibujado dispararía otra
     consulta, y con la respuesta de cada una otro redibujado. */
  if(preguntas !== null || pidiendoPreguntas) return;
  pidiendoPreguntas = true;

  try{
    preguntas = await remotoPreguntas();
  }catch(err){
    preguntas = [];
    showToast('No se pudieron cargar las preguntas: ' + err.message, true);
  }finally{
    pidiendoPreguntas = false;
  }

  if(!isAdmin) return;
  /* Sólo se redibuja el panel entero si se está mirando esa pestaña. Si no, se
     actualiza nada más el número: un renderAdmin() a destiempo reconstruye el
     formulario de equipo desde la base y se lleva por delante lo que se
     estuviera escribiendo sin haber guardado. */
  if(adminTab==='preguntas' && editingId === null) renderAdmin();
  else pintarPendientes();
}

/** Cuántas esperan respuesta. Va en la pestaña para que no se olviden. */
const preguntasPendientes = () =>
  preguntas === null ? 0 : preguntas.filter(q => !q.respuesta).length;

/**
 * Los números rojos de las pestañas.
 *
 * Existen porque una bandeja que hay que abrir para saber si tiene algo, no se
 * abre. El número se ve desde cualquier pestaña del panel y es lo que convierte
 * "entrar a revisar por si acaso" en "entrar porque hay tres esperando".
 */
function pintarPendientes(){
  const poner = (id, n) => {
    const chip = $(id);
    if(!chip) return;
    chip.textContent = n;
    chip.hidden = n === 0;
  };
  poner('#tabPreguntasN', preguntasPendientes());
  poner('#tabSolicitudesN', solicitudesPendientes());
}

function preguntasAdminHTML(){
  if(preguntas === null) return '<p class="adm-note">Cargando preguntas…</p>';

  if(!preguntas.length) return `
    <div class="empty-state" style="border:none;background:#FAFAFA">
      <div class="icon">💬</div><h3>Todavía no hay preguntas</h3>
      <p>Cuando alguien pregunte desde una ficha, aparecerá aquí. Tu respuesta se
         publica en esa misma ficha y le sirve a todos los que la vean después.</p>
    </div>`;

  const pendientes = preguntasPendientes();

  /* Las pendientes primero, sin importar la fecha. Es una bandeja de trabajo:
     lo que hace falta ver arriba es lo que falta por hacer. */
  const orden = [...preguntas].sort((a, b) =>
    (a.respuesta ? 1 : 0) - (b.respuesta ? 1 : 0) ||
    new Date(b.creado_en) - new Date(a.creado_en));

  return `
    <p class="adm-note">${preguntas.length} preguntas${pendientes?` · <strong>${pendientes} sin contestar</strong>`:''}.
      Lo que respondas y marques como público sale en la ficha del equipo la
      próxima vez que publiques.</p>
    ${orden.map(preguntaFilaHTML).join('')}`;
}

function preguntaFilaHTML(q){
  const eq = products.find(p => p.slug === q.slug);
  const f = new Date(q.creado_en);
  const cuando = f.toLocaleDateString('es-MX',{day:'2-digit',month:'short'}) + ' · ' +
                 f.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});

  return `
    <div class="adm-section adm-pregunta${q.respuesta?'':' pendiente'}">
      <p class="sub" style="margin:0 0 6px">
        <strong>${esc(eq ? eq.name : q.slug)}</strong> · ${esc(q.nombre)} · ${esc(cuando)}
        ${q.respuesta ? (q.publicada
            ? '<span class="pcard-badge badge-rent" style="position:static;margin-left:6px">Publicada</span>'
            : '<span class="pcard-badge badge-used" style="position:static;margin-left:6px">Contestada en privado</span>')
          : '<span class="pcard-badge badge-new" style="position:static;margin-left:6px">Sin contestar</span>'}
      </p>
      <p style="font-weight:600;margin:0 0 10px">${esc(q.pregunta)}</p>
      <div class="field">
        <label class="sr-only" for="resp-${q.id}">Respuesta</label>
        <textarea id="resp-${q.id}" maxlength="1000" rows="3"
                  placeholder="Contesta como si lo fuera a leer todo el que abra esta ficha…">${esc(q.respuesta || '')}</textarea>
      </div>
      <div class="adm-toolbar" style="margin-top:8px">
        <label class="check"><input type="checkbox" id="pub-${q.id}"${q.publicada?' checked':''}> Publicar en la ficha</label>
        <button class="btn-primary" type="button" data-resp="${q.id}">Guardar respuesta</button>
        <button class="btn-danger" type="button" data-qdel="${q.id}">Borrar</button>
      </div>
    </div>`;
}

async function responderPregunta(id){
  const q = preguntas.find(x => x.id === id);
  if(!q) return;
  const texto = ($('#resp-'+id).value || '').trim();
  const publicar = $('#pub-'+id).checked;

  /* Publicar sin respuesta dejaría la pregunta colgada en la ficha, a la vista
     y sin contestar. Dice de la empresa lo contrario de lo que se busca aquí. */
  if(publicar && !texto){
    showToast('Para publicarla hace falta una respuesta.', true);
    return;
  }

  try{
    const actualizada = await remotoResponderPregunta(id, texto, publicar, !!q.respuesta);
    Object.assign(q, actualizada);
    renderAdmin();
    showToast(publicar ? 'Respuesta guardada. Publica el sitio para que se vea.' : 'Respuesta guardada');
  }catch(err){
    showToast(err.message, true);
  }
}

async function borrarPregunta(id){
  const q = preguntas.find(x => x.id === id);
  if(!q) return;
  if(!confirm(`¿Borrar esta pregunta?\n\n"${q.pregunta}"\n\nNo se puede deshacer.`)) return;
  try{
    await remotoBorrarPregunta(id);
    preguntas = preguntas.filter(x => x.id !== id);
    renderAdmin();
    showToast('Pregunta borrada');
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

        <div class="field full">
          <label for="f-video">Video de YouTube <span class="hint">(pega el enlace; opcional)</span></label>
          <input type="text" id="f-video" value="${esc(v.video ? videoPagina(v.video) : '')}"
                 placeholder="https://www.youtube.com/watch?v=…">
          <span class="hint">Un video de 30 segundos con el motor encendido vende más que ocho fotos.
            Se guarda sólo el identificador y se reproduce sin cookies hasta que el cliente le da al play.</span>
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

      <div class="adm-section" id="atributosBox" data-cat="${esc(v.cat || '')}">
        ${atributosCamposHTML(v.cat, v.atributos || {})}
      </div>

      <div class="form-actions">
        ${!nuevo?`<button class="btn-danger" type="button" data-delp="${v.id}">Eliminar equipo</button>`:''}
        <button class="btn-ghost" type="button" data-action="admin-cancel">Cancelar</button>
        <button class="btn-primary" type="submit">${nuevo?'Publicar equipo':'Guardar cambios'}</button>
      </div>
    </form>`;
}

/* ── Ficha técnica ──
   Los campos dependen de la categoría: una grúa torre no tiene profundidad de
   excavación y una excavadora no tiene longitud de pluma. Enseñarlos todos
   sería pedir treinta datos para capturar cinco. */
function atributosCamposHTML(cat, valores){
  const campos = camposDe(cat);
  const v = valores || {};

  const control = c => {
    if(c.tipo === 'opcion') return `
      <select id="at-${c.k}" data-at="${c.k}">
        <option value="">—</option>
        ${c.opciones.map(o=>`<option value="${esc(o)}"${v[c.k]===o?' selected':''}>${esc(o)}</option>`).join('')}
      </select>`;
    if(c.tipo === 'num') return `
      <input type="number" id="at-${c.k}" data-at="${c.k}" min="0" step="any"
             value="${v[c.k] ?? ''}" placeholder="${esc(c.unidad||'')}">`;
    return `<input type="text" id="at-${c.k}" data-at="${c.k}" maxlength="60" value="${esc(v[c.k] ?? '')}">`;
  };

  return `
    <h3>Ficha técnica <span class="hint">(${esc(cat || 'sin categoría')})</span></h3>
    <p class="sub">Esto es lo que se puede filtrar y comparar; las «especificaciones» de arriba
      son sólo el resumen que sale en la tarjeta. <strong>Las horas son el dato que más
      se busca</strong> en maquinaria usada: sin capturarlas, el equipo desaparece de ese
      filtro. Deja vacío lo que no apliqué.</p>
    <div class="form-grid">
      ${campos.map(c=>`
        <div class="field">
          <label for="at-${c.k}">${esc(c.etq)}${c.unidad?` <span class="hint">(${esc(c.unidad)})</span>`:''}</label>
          ${control(c)}
        </div>`).join('')}
    </div>
    <p class="sub">Los campos cambian según la categoría. Si la cambias, se conservan
      sólo los datos que sigan aplicando.</p>`;
}

/**
 * Redibuja los campos técnicos al cambiar de categoría.
 *
 * Se toca SÓLO ese bloque, no el formulario entero: renderAdmin() lo
 * reconstruye desde `products` y se llevaría por delante todo lo que se haya
 * escrito y no esté guardado — precio, descripción, fotos recién subidas.
 */
function refrescarAtributos(){
  const box = $('#atributosBox');
  const cat = $('#f-cat');
  if(!box || !cat) return;
  if(box.dataset.cat === cat.value.trim()) return;   // nada que rehacer
  box.dataset.cat = cat.value.trim();
  box.innerHTML = atributosCamposHTML(cat.value.trim(), leerAtributosForm());
}

/** Lee los campos técnicos que estén en pantalla ahora mismo. */
function leerAtributosForm(){
  const crudo = {};
  $$('#pForm [data-at]').forEach(el => { crudo[el.dataset.at] = el.value });
  return limpiarAtributos(crudo);
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
    disponibilidad: val('f-disp') || 'disponible',
    /* videoId() devuelve null si lo pegado no es un enlace de YouTube
       reconocible. Eso se avisa en saveProductForm: guardar en silencio un
       equipo sin el video que se acaba de pegar es el fallo que parece que
       funcionó. */
    video: videoId(val('f-video')),
    videoCrudo: val('f-video'),
    atributos: leerAtributosForm()
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
  /* Un video arrastrado a la zona de fotos es el error MÁS probable aquí, y
     "no es una imagen" no le dice a nadie qué hacer con él. La respuesta —que
     el video va por su propio campo, como enlace— cabe en el mismo aviso. */
  if(file.type.startsWith('video/')){
    throw new Error('los videos no se suben aquí: súbelo a YouTube y pega el enlace en el campo «Video de YouTube»');
  }
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
