/**
 * admin-acceso.js — La pantalla de entrada: la escena de la obra y el formulario.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 */
'use strict';

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
    <!-- La neblina va con el degradado radial, no con un color plano: en plano
         se ve el borde de la elipse y parece un manchón pegado encima. -->
    <ellipse class="lg-haze" cx="190" cy="120" rx="170" ry="46" fill="url(#lgHalo)" opacity=".5"/>

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
      /* Se respeta la pestaña que se venía a ver. Quien llega desde el correo
         de "tienes una pregunta" pidió `?panel=preguntas`, y mandarlo al
         listado de equipos tras entrar sería hacerle buscar otra vez lo que ya
         había pedido. Sin pestaña pedida, el listado de siempre. */
      adminTab = adminTab || 'products';

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

