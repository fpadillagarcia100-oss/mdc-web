/**
 * pages.js — Páginas de contenido: ayuda, sucursales, publicar equipo, cuenta,
 * aviso de privacidad y solicitud de cotización.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 */
'use strict';

/* ══════════════════════════════════════════════════════════
   PÁGINAS DE CONTENIDO Y FORMULARIOS
   ══════════════════════════════════════════════════════════ */
let account = store.read(K.account, null);
let currentPage = null;
let formOpenedAt = 0;

const saveAccount = () => store.write(K.account, account);
function updateAcctLabel(){
  const el = $('#acctLabel');
  if(el) el.textContent = account && account.name ? account.name.split(' ')[0] : 'Ingresar';
}

const waLink = txt => `https://wa.me/${settings.whatsapp.replace(/\D/g,'')}?text=${encodeURIComponent(txt)}`;
const mailLink = (subject, body) =>
  `mailto:${settings.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

function saveRequest(type, summary){
  const reqs = store.read(K.requests, []);
  reqs.unshift({type, summary, at: new Date().toISOString()});
  store.write(K.requests, reqs.slice(0, 30));
}

/* Abre WhatsApp o el correo. El registro en la base ocurre aparte, en
   deliver(), y a propósito no puede estorbar este camino. */
function abrirCanal(channel, subject, body){
  if(channel==='wa') window.open(waLink(body), '_blank', 'noopener');
  else window.location.href = mailLink(subject, body);
}

function deliver(channel, subject, body, datos){
  saveRequest(subject, body.split('\n')[0]);

  /* WhatsApp PRIMERO, y sin esperar a la base.

     El orden importa más de lo que parece. Los navegadores bloquean las
     ventanas emergentes que no salen de un clic del usuario; si primero se
     esperara la respuesta de la base, para cuando llegara ya se habría
     perdido ese permiso y WhatsApp no abriría. El cliente vería que "no pasa
     nada" al enviar.

     Así que el canal se abre de inmediato y el registro va detrás, en
     segundo plano. Si falla, el cliente ni se entera: su mensaje ya salió. */
  abrirCanal(channel, subject, body);
  showToast('Solicitud lista para enviar');

  if(datos && typeof registrarSolicitud === 'function'){
    registrarSolicitud(datos);   // no se espera: es una mejora, no un requisito
  }

  /* Se cuenta qué equipos terminan en cotización. Junto con las vistas, es lo
     que responde la pregunta que importa: no "cuál se mira más" sino "cuál se
     mira mucho y no se cotiza" — ése es el que tiene el precio mal o las
     fotos malas. */
  if(datos && Array.isArray(datos.carrito) && typeof contar === 'function'){
    datos.carrito.forEach(i => contar(i.slug, 'cotizacion'));
  }
  setTimeout(closeAll, 600);
}


/* ── Definición de páginas ── */
const PAGES = {
  ayuda:       {title:'❓ Centro de ayuda',        html:()=>ayudaHTML()},
  sucursales:  {title:'📍 Nuestras sucursales',    html:()=>sucursalesHTML()},
  vender:      {title:'📤 Publica tu equipo',      html:()=>venderHTML()},
  cuenta:      {title:'👤 Mi cuenta',              html:()=>cuentaHTML()},
  privacidad:  {title:'🔐 Aviso de privacidad',    html:()=>privacidadHTML()},
  cotizar:     {title:'📋 Solicitar cotización',   html:()=>cotizarHTML()},
  comparar:    {title:'⇄ Comparar equipos',        html:()=>compararHTML()},
  financiamiento:{title:'🧮 Financiamiento',       html:()=>financiamientoHTML()}
};

/* ── Financiamiento ── */

/** Equipos que se pueden financiar: los de venta. Una renta no se financia. */
const financiables = () => products.filter(p => p.cond !== 'Renta');

function financiamientoHTML(){
  const eq = financiables();
  const base = eq[0] ? eq[0].price : 1000000;

  return `
    <p class="fin-intro">Calcula tu pago mensual antes de hablar con nosotros.
      Elige un equipo o escribe un monto, y ajusta el enganche y el plazo hasta
      que los números te acomoden.</p>

    <div class="fin-selector">
      <div class="field">
        <label for="finEquipo">Equipo</label>
        <select id="finEquipo" data-fin>
          ${eq.map(p=>`<option value="${p.id}">${esc(p.name)} — ${fmtFull(p.price)}</option>`).join('')}
          <option value="otro">Otro monto…</option>
        </select>
      </div>
      <div class="field" id="finMontoCampo" ${eq.length?'hidden':''}>
        <label for="finMonto">Monto a financiar (MXN)</label>
        <input type="number" id="finMonto" data-fin min="0" step="10000" value="${base}">
      </div>
    </div>

    ${calculadoraHTML(base, {msi: eq[0] ? eq[0].finance : null})}

    <div class="fin-acciones">
      <button class="btn-primary" type="button" data-action="fin-wa">💬 Enviar esta simulación por WhatsApp</button>
    </div>

    <div class="fin-opciones">
      <h3>Tres formas de pagar tu equipo</h3>
      <div class="fin-op">
        <strong>💳 Meses sin intereses</strong>
        <p>Pagas el precio de lista repartido en mensualidades iguales, sin un peso
          de intereses. Es la opción más barata cuando el equipo la tiene disponible;
          en el catálogo aparece marcada en cada ficha.</p>
      </div>
      <div class="fin-op">
        <strong>🏦 Crédito simple</strong>
        <p>Das un enganche y financias el resto a plazo con una tasa. Es lo que
          calcula el simulador de arriba. El equipo queda a tu nombre desde el
          primer día.</p>
      </div>
      <div class="fin-op">
        <strong>📄 Arrendamiento puro</strong>
        <p>Pagas por usar el equipo sin comprarlo. La renta suele ser deducible al
          100%, así que conviene revisarlo con tu contador antes de decidir.
          Los equipos que lo permiten están marcados en el catálogo.</p>
      </div>
    </div>

    <p class="calc-nota">Las cifras son estimadas y sirven para orientarte. No son
      una oferta de crédito: la tasa, el plazo y la aprobación los determina la
      institución financiera según tu historial.</p>`;
}

/** Aplica al simulador el equipo (o el monto libre) que se eligió arriba. */
function actualizarFinanciamiento(){
  const root = $('#pageBody [data-calc]');
  if(!root) return;
  const sel = $('#finEquipo'), campo = $('#finMontoCampo'), monto = $('#finMonto');
  const otro = !sel || sel.value === 'otro';
  if(campo) campo.hidden = !otro;

  let precio, msi = '';
  if(otro){
    precio = Math.max(0, Number(monto && monto.value) || 0);
  } else {
    const p = products.find(x => String(x.id) === sel.value);
    precio = p ? p.price : 0;
    msi = p && p.finance ? p.finance : '';
    if(monto) monto.value = precio;   // deja el monto listo por si cambia a "otro"
  }

  root.dataset.precio = precio;
  root.dataset.msi = msi ? parseInt(msi, 10) : '';
  refrescarCalculadora(root);
}

/** Arma el mensaje con los números que el cliente acaba de simular. */
function financiamientoPayload(){
  const root = $('#pageBody [data-calc]');
  if(!root) return null;
  const sel = $('#finEquipo');
  const equipo = sel && sel.value !== 'otro'
    ? (products.find(p=>String(p.id)===sel.value) || {}).name
    : null;
  const dato = campo => (root.querySelector(`[data-calc-out="${campo}"]`) || {}).textContent || '—';

  return [
    equipo ? `Simulación de financiamiento — ${equipo}` : 'Simulación de financiamiento',
    `Monto: ${fmtFull(Number(root.dataset.precio) || 0)}`,
    `Enganche: ${dato('enganche')} (${dato('pagoInicial')})`,
    `Mensualidad estimada: ${dato('mensual')} ${dato('plazoTxt')}`,
    `Total estimado: ${dato('total')}`,
    '',
    '¿Me pueden confirmar si califico y cuál sería la tasa real?'
  ].join('\n');
}

/* ── Comparador ── */

/**
 * Renglones de ficha técnica para la tabla comparativa.
 *
 * Sólo salen los datos que tiene al menos uno de los equipos elegidos: una
 * fila entera de guiones no compara nada y aleja las que sí sirven.
 *
 * Se resalta un ganador únicamente cuando "mejor" significa algo Y hay al
 * menos dos cifras que enfrentar. Más potencia es mejor y menos horas también,
 * pero un ancho de tambor mayor depende de la obra — ahí no se marca nada, que
 * es más honesto que inventar un criterio.
 */
function filasTecnicas(eq){
  return FICHA_TECNICA
    .filter(c => eq.some(p => p.atributos[c.k] != null))
    .map(c => {
      const valores = eq.map(p => p.atributos[c.k]).filter(v => v != null);
      const gana = (c.mejor && valores.length >= 2 && c.tipo === 'num')
        ? (c.mejor === 'menor' ? Math.min(...valores) : Math.max(...valores))
        : null;
      return {
        etq: c.etq,
        val: p => p.atributos[c.k] != null ? esc(textoAtributo(c, p.atributos[c.k])) : '—',
        destaca: gana === null ? null : (p => p.atributos[c.k] === gana),
      };
    });
}

function compararHTML(){
  const eq = comparados();
  if(eq.length < 2) return '<p>Elige al menos dos equipos del catálogo para compararlos.</p>';

  const mejorPrecio = Math.min(...eq.map(p=>p.price));
  const masNuevo = Math.max(...eq.map(p=>p.year));

  /* Cada fila es un criterio. `destaca` marca al ganador de esa fila; se deja
     en null cuando "mejor" no significa nada (una ubicación no es mejor que otra). */
  const filas = [
    {etq:'Precio', destaca:p=>p.price===mejorPrecio,
     val:p=>`${fmtFull(p.price)}${p.cond==='Renta'?' <small>/mes</small>':''}`},
    {etq:'Condición', val:p=>esc(COND_LABELS[p.cond])},
    {etq:'Marca',     val:p=>esc(p.brand)},
    {etq:'Año',       val:p=>String(p.year), destaca:p=>p.year===masNuevo},
    {etq:'Ubicación', val:p=>esc(p.location)},
    {etq:'Especificaciones', val:p=>p.specs.length
      ? p.specs.map(s=>`<span class="pcard-spec">${esc(s)}</span>`).join(' ') : '—'},
    ...filasTecnicas(eq),
    {etq:'Video', val:p=>p.video?'▶ Sí':'—', destaca:p=>!!p.video},
    {etq:'Meses sin intereses', val:p=>p.finance?esc(p.finance):'—', destaca:p=>!!p.finance},
    {etq:'Arrendamiento', val:p=>p.leasing?'Sí':'—',  destaca:p=>p.leasing},
    {etq:'Envío a obra',  val:p=>p.shipping?'Incluido':'No incluido', destaca:p=>p.shipping},
    {etq:'Garantía', val:p=>p.cond==='Nuevo'?'12 meses de fábrica'
      : p.cond==='Renta'?'Incluida en la renta':'6 meses certificada'}
  ];

  return `
    <div class="cmp-wrap">
      <table class="cmp-tabla">
        <caption class="sr-only">Comparación de ${eq.length} equipos</caption>
        <thead>
          <tr>
            <th scope="col"><span class="sr-only">Característica</span></th>
            ${eq.map(p=>`<th scope="col">
              <div class="cmp-th-img">${productMedia(p, false)}</div>
              <div class="cmp-th-name">${esc(p.name)}</div>
              <button class="cmp-th-quita" type="button" data-cmp="${p.id}">Quitar</button>
            </th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${filas.map(f=>`<tr>
            <th scope="row">${f.etq}</th>
            ${eq.map(p=>{
              const gana = f.destaca && f.destaca(p);
              return `<td${gana?' class="cmp-gana"':''}>${f.val(p)}</td>`;
            }).join('')}
          </tr>`).join('')}
          <tr>
            <th scope="row">Acciones</th>
            ${eq.map(p=>`<td>
              <button class="btn-add" type="button" data-add="${p.id}">+ Cotizar</button>
              <button class="btn-quote" type="button" data-open="${p.id}">Ver ficha</button>
            </td>`).join('')}
          </tr>
        </tbody>
      </table>
    </div>
    <p class="cmp-nota">Lo resaltado es lo más conveniente de cada renglón.
      Donde no hay nada resaltado es porque una opción no es mejor que otra.</p>`;
}

function openPage(kind){
  const def = PAGES[kind];
  if(!def) return;
  closeAll();
  lastFocused = document.activeElement;
  currentPage = kind;
  $('#pageTitle').textContent = def.title;
  $('#pageBody').innerHTML = def.html();
  // La calculadora nace ahora, después de DOMContentLoaded: su primer pintado
  // no lo hace ficha.js.
  if(kind === 'financiamiento') actualizarFinanciamiento();
  $('#pageOverlay').classList.add('open');
  lockScroll(true);
  openPanel = $('#pagePanel');
  formOpenedAt = performance.now();
  const f = $('#pageBody').querySelector(FOCUSABLE) || $('#pageClose');
  f.focus();
}

/* ── Ayuda ── */
const FAQ = [
  ['¿Cómo pido una cotización?','Agrega los equipos que te interesen con el botón «+ Agregar a cotización». Cuando termines, abre el carrito 🛒 arriba a la derecha y presiona «Solicitar cotización formal». Te pedimos tus datos y nos llega la solicitud por WhatsApp o correo. Respondemos en menos de 24 horas hábiles.'],
  ['¿Los precios que veo son finales?','No. Son precios de referencia en pesos mexicanos y no incluyen IVA. El precio final depende de accesorios, condiciones de entrega y el esquema de pago que elijas. Por eso siempre confirmamos con una cotización formal.'],
  ['¿Qué necesito para el financiamiento a meses sin intereses?','Identificación oficial, comprobante de domicilio, y para persona moral el acta constitutiva y poder del representante legal. Los MSI aplican con tarjetas participantes; también manejamos arrendamiento puro y crédito simple para montos mayores.'],
  ['¿Cómo funciona la renta?','La renta es mensual e incluye mantenimiento preventivo, seguro y, en los equipos marcados, operador certificado. Se requiere depósito en garantía y contrato. Para obras cortas consulta la disponibilidad de renta semanal.'],
  ['¿Qué garantía tienen los equipos?','Los equipos nuevos traen 12 meses de garantía de fábrica. Los usados certificados pasan una inspección de más de 100 puntos y salen con 6 meses de garantía en tren motriz e hidráulico. Los equipos en renta están cubiertos durante todo el contrato.'],
  ['¿Hacen entregas a pie de obra?','Sí. Los equipos marcados con 🚚 incluyen el envío dentro de Chiapas. Fuera del estado cotizamos la maniobra y el traslado por separado, según distancia y peso del equipo.'],
  ['¿Puedo vender o consignar mi maquinaria?','Sí. Usa la opción «Vende tu equipo»: llena la ficha con marca, modelo, año y horas de uso. Un valuador te contacta, agenda la inspección y te damos una oferta en firme o lo tomamos a consignación.'],
  ['¿Aceptan mi equipo a cuenta?','Sí, recibimos maquinaria a cuenta como parte del pago. El avalúo se hace en sitio y el monto se aplica directo al precio del equipo nuevo.']
];

const ayudaHTML = () => `
  <p class="page-intro">Resolvemos las dudas más frecuentes. Si no encuentras la tuya, escríbenos: contestamos rápido.</p>
  <div class="faq">
    ${FAQ.map(([q,a])=>`<details><summary>${esc(q)}</summary><div class="ans">${esc(a)}</div></details>`).join('')}
  </div>
  <h3>¿Sigues con dudas?</h3>
  <div class="branch">
    <p>📞 <a href="tel:${esc(settings.phone.replace(/\s/g,''))}" style="color:inherit">${esc(settings.phone)}</a><br>
       ✉️ <a href="mailto:${esc(settings.email)}" style="color:inherit">${esc(settings.email)}</a><br>
       🕘 ${esc(settings.hours)}</p>
    <div class="links">
      <a href="${waLink('Hola '+settings.brandMain+settings.brandAccent+', tengo una duda sobre sus equipos.')}" target="_blank" rel="noopener">💬 Escribir por WhatsApp</a>
      <a href="#" data-goto="sucursales">📍 Ver sucursales</a>
    </div>
  </div>`;

/* ── Sucursales ── */
/**
 * El mapa de una sucursal, con fachada.
 *
 * No se incrusta el iframe de Google de entrada, y no es por capricho:
 *
 *   · Un mapa incrustado carga medio megabyte de Google y le pone cookies a
 *     todo el que abra la página, haya mirado el mapa o no. Con tres
 *     sucursales serían tres.
 *   · Cada iframe se lleva por delante el presupuesto de rendimiento que
 *     vigila la prueba visual.
 *
 * Así que primero se enseña un dibujo hecho aquí —no pesa ni pide nada— y el
 * mapa de verdad entra al pulsarlo. Es exactamente el mismo trato que ya se le
 * daba al video de YouTube en la ficha del equipo: coherencia, no invento.
 *
 * El enlace de "Cómo llegar" sigue existiendo debajo, porque en un teléfono
 * abrir la app de mapas es mejor que mirar un recuadro.
 */
function mapaFachadaHTML(b, i){
  return `
    <div class="mapa" id="mapa${i}">
      <button class="mapa-fachada" type="button" data-mapa="${i}"
              aria-label="Ver en el mapa: ${esc(b.name)}">
        <svg viewBox="0 0 320 150" aria-hidden="true" focusable="false">
          <rect width="320" height="150" fill="#E8EAE6"/>
          <path d="M0 96 H320 M0 40 H320 M78 0 V150 M212 0 V150" stroke="#D2D6CE" stroke-width="7"/>
          <path d="M0 68 H320 M148 0 V150" stroke="#DCE0D8" stroke-width="4"/>
          <path d="M212 0 V150" stroke="#F0D68A" stroke-width="9"/>
          <rect x="18" y="106" width="44" height="30" fill="#DDE1D9"/>
          <rect x="232" y="52" width="58" height="34" fill="#DDE1D9"/>
          <rect x="96" y="8" width="38" height="24" fill="#DDE1D9"/>
          <circle cx="160" cy="70" r="26" fill="#1A1A1A" opacity=".08"/>
          <path d="M160 46 a15 15 0 0 1 15 15 c0 11 -15 27 -15 27 s-15 -16 -15 -27 a15 15 0 0 1 15 -15 z"
                fill="#D32F2F"/>
          <circle cx="160" cy="61" r="5.5" fill="#fff"/>
        </svg>
        <span class="mapa-txt">🗺️ Ver el mapa</span>
      </button>
      <p class="mapa-nota">Se carga desde Google sólo cuando lo pides.</p>
    </div>`;
}

/** El iframe de verdad. `q=` con la dirección: no hace falta llave de API. */
const mapaIframeHTML = b => `
  <iframe class="mapa-marco"
          src="https://www.google.com/maps?q=${encodeURIComponent(b.address)}&output=embed"
          title="Mapa de ${esc(b.name)}" loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"></iframe>`;

const sucursalesHTML = () => `
  <p class="page-intro">Visítanos en cualquiera de nuestras ubicaciones. Todas cuentan con patio de exhibición y taller de servicio.</p>
  ${(settings.branches||[]).map((b,i)=>`
    <div class="branch">
      <h3><span class="dot"></span>${esc(b.name)}</h3>
      <p>📍 ${esc(b.address)}<br>
         📞 <a href="tel:${esc((b.phone||'').replace(/\s/g,''))}" style="color:inherit">${esc(b.phone)}</a><br>
         🕘 ${esc(b.hours)}</p>
      ${mapaFachadaHTML(b, i)}
      <div class="links">
        <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address)}" target="_blank" rel="noopener">🗺️ Cómo llegar</a>
        <a href="tel:${esc((b.phone||'').replace(/\s/g,''))}">📞 Llamar</a>
        <a href="${waLink('Hola, quiero información de la sucursal '+b.name+'.')}" target="_blank" rel="noopener">💬 WhatsApp</a>
      </div>
    </div>`).join('') || '<p>Aún no hay sucursales registradas.</p>'}`;

/** Cambia la fachada por el mapa. Sólo esa: las otras siguen sin cargar nada. */
function verMapa(i){
  const b = (settings.branches || [])[i];
  const caja = $('#mapa' + i);
  if(!b || !caja) return;
  caja.innerHTML = mapaIframeHTML(b);
}

/* ── Vende tu equipo ── */
const venderHTML = () => `
  <p class="page-intro">Compramos, consignamos y recibimos maquinaria a cuenta. Llena la ficha y un valuador te contacta para agendar la inspección.</p>
  <form id="sellForm" novalidate>
    ${HP}
    <div class="form-grid">
      <div class="field"><label for="v-name">Tu nombre *</label>
        <input type="text" id="v-name" value="${esc(account?.name||'')}" placeholder="Juan Pérez">
        <span class="errmsg">Escribe tu nombre.</span></div>
      <div class="field"><label for="v-phone">Teléfono * <span class="hint">(10 dígitos)</span></label>
        <input type="text" id="v-phone" inputmode="tel" value="${esc(account?.phone||'')}" placeholder="9611234567">
        <span class="errmsg">Necesitamos 10 dígitos.</span></div>
      <div class="field full"><label for="v-email">Correo <span class="hint">(opcional)</span></label>
        <input type="text" id="v-email" inputmode="email" value="${esc(account?.email||'')}" placeholder="tucorreo@ejemplo.com">
        <span class="errmsg">Ese correo no parece válido.</span></div>

      <div class="field"><label for="v-type">Tipo de equipo</label>
        <select id="v-type">${baseCats().map(c=>`<option>${esc(c)}</option>`).join('')}<option>Otro</option></select></div>
      <div class="field"><label for="v-cond">Condición</label>
        <select id="v-cond"><option>Funcionando</option><option>Requiere reparación menor</option><option>Requiere reparación mayor</option></select></div>

      <div class="field"><label for="v-brand">Marca y modelo *</label>
        <input type="text" id="v-brand" placeholder="CAT 320 GC">
        <span class="errmsg">Indica marca y modelo.</span></div>
      <div class="field"><label for="v-year">Año</label>
        <input type="number" id="v-year" min="1970" max="2100" placeholder="2019"></div>

      <div class="field"><label for="v-hours">Horas de uso</label>
        <input type="text" id="v-hours" inputmode="numeric" placeholder="3200"></div>
      <div class="field"><label for="v-price">Precio esperado (MXN)</label>
        <input type="text" id="v-price" inputmode="numeric" placeholder="850000"></div>

      <div class="field full"><label for="v-notes">Comentarios</label>
        <textarea id="v-notes" placeholder="Mantenimientos, accesorios incluidos, detalles a considerar…"></textarea></div>
    </div>
    <div class="send-row">
      <button class="btn-primary" type="submit" data-send="wa">💬 Enviar por WhatsApp</button>
      <button class="btn-ghost" type="button" data-send="mail">✉️ Enviar por correo</button>
    </div>
  </form>
  <div class="privacy-note">Usamos tus datos únicamente para contactarte sobre este equipo.
    Consulta el <button type="button" data-goto="privacidad" style="background:none;border:none;color:#1565C0;text-decoration:underline;cursor:pointer;font:inherit;padding:0">aviso de privacidad</button>.</div>`;

function sellPayload(){
  const v = readAndValidate([
    {id:'v-name', required:true},
    {id:'v-phone', required:true, type:'tel'},
    {id:'v-email', type:'email'},
    {id:'v-brand', required:true}
  ]);
  if(!v) return null;
  const g = id => $('#'+id).value.trim();

  /* Se devuelven dos cosas del mismo formulario: el texto que lee una persona
     en WhatsApp y los campos sueltos que entiende la base. Separarlos evita
     tener que reconstruir el teléfono a partir de un mensaje escrito. */
  const datos = {
    tipo: 'publicacion',
    nombre: v['v-name'],
    telefono: v['v-phone'],
    correo: v['v-email'] || null,
    mensaje: [
      `Equipo: ${g('v-brand')}`,
      `Tipo: ${g('v-type')}`,
      `Año: ${g('v-year') || 'no especificado'}`,
      `Horas: ${g('v-hours') || 'no especificado'}`,
      `Condición: ${g('v-cond')}`,
      `Precio esperado: ${g('v-price') ? '$' + g('v-price') + ' MXN' : 'a valuar'}`,
      g('v-notes') ? `Comentarios: ${g('v-notes')}` : '',
    ].filter(Boolean).join('\n').slice(0, 4000),
  };

  const texto = `Hola ${settings.brandMain}${settings.brandAccent}, quiero vender/consignar mi equipo:

Equipo: ${g('v-brand')}
Tipo: ${g('v-type')}
Año: ${g('v-year') || 'no especificado'}
Horas de uso: ${g('v-hours') || 'no especificado'}
Condición: ${g('v-cond')}
Precio esperado: ${g('v-price') ? '$'+g('v-price')+' MXN' : 'a valuar'}

Mis datos:
${v['v-name']} · Tel. ${v['v-phone']}${v['v-email'] ? ' · '+v['v-email'] : ''}
${g('v-notes') ? '\nComentarios: '+g('v-notes') : ''}`;

  return { texto, datos };
}

/* ── Solicitar cotización ── */
function cotizarHTML(){
  const lines = cartLines();
  if(!lines.length) return `<p class="page-intro">Tu cotización está vacía. Agrega equipos del catálogo para solicitar precios.</p>`;
  const buy = lines.filter(i=>i.cond!=='Renta').reduce((s,i)=>s+i.price*i.qty,0);
  const rent = lines.filter(i=>i.cond==='Renta').reduce((s,i)=>s+i.price*i.qty,0);
  const total = `${buy?fmtFull(buy):''}${buy&&rent?' + ':''}${rent?fmtFull(rent)+'/mes':''}`;
  return `
    <p class="page-intro">Confirma tus datos y te enviamos la cotización formal con precios vigentes, tiempos de entrega y opciones de financiamiento.</p>
    <ul class="cart-recap">
      ${lines.map(i=>`<li><span>${i.qty}× ${esc(i.name)}</span><span>${fmtFull(i.price*i.qty)}${i.cond==='Renta'?'/mes':''}</span></li>`).join('')}
      <li><span>Total estimado</span><span>${total}</span></li>
    </ul>
    <form id="quoteForm" novalidate>
      ${HP}
      <div class="form-grid">
        <div class="field"><label for="c-name">Tu nombre *</label>
          <input type="text" id="c-name" value="${esc(account?.name||'')}" placeholder="Juan Pérez">
          <span class="errmsg">Escribe tu nombre.</span></div>
        <div class="field"><label for="c-phone">Teléfono * <span class="hint">(10 dígitos)</span></label>
          <input type="text" id="c-phone" inputmode="tel" value="${esc(account?.phone||'')}" placeholder="9611234567">
          <span class="errmsg">Necesitamos 10 dígitos.</span></div>
        <div class="field"><label for="c-email">Correo <span class="hint">(opcional)</span></label>
          <input type="text" id="c-email" inputmode="email" value="${esc(account?.email||'')}" placeholder="tucorreo@ejemplo.com">
          <span class="errmsg">Ese correo no parece válido.</span></div>
        <div class="field"><label for="c-company">Empresa u obra <span class="hint">(opcional)</span></label>
          <input type="text" id="c-company" placeholder="Constructora del Sureste"></div>
        <div class="field full"><label for="c-notes">Comentarios</label>
          <textarea id="c-notes" placeholder="Fechas en que lo necesitas, lugar de entrega, forma de pago…"></textarea></div>
        <label class="check full"><input type="checkbox" id="c-save"${account?' checked':''}> Guardar mis datos en este dispositivo para la próxima vez</label>
      </div>
      <div class="send-row">
        <button class="btn-primary" type="submit" data-send="wa">💬 Enviar por WhatsApp</button>
        <button class="btn-ghost" type="button" data-send="mail">✉️ Enviar por correo</button>
      </div>
    </form>
    <div class="privacy-note">Tus datos se usan sólo para atender esta cotización.
      Consulta el <button type="button" data-goto="privacidad" style="background:none;border:none;color:#1565C0;text-decoration:underline;cursor:pointer;font:inherit;padding:0">aviso de privacidad</button>.</div>`;
}

function quotePayload(){
  const v = readAndValidate([
    {id:'c-name', required:true},
    {id:'c-phone', required:true, type:'tel'},
    {id:'c-email', type:'email'}
  ]);
  if(!v) return null;

  if($('#c-save').checked){
    account = {name:v['c-name'], phone:v['c-phone'], email:v['c-email']};
    saveAccount(); updateAcctLabel();
  }
  const lines = cartLines();
  const buy = lines.filter(i=>i.cond!=='Renta').reduce((s,i)=>s+i.price*i.qty,0);
  const rent = lines.filter(i=>i.cond==='Renta').reduce((s,i)=>s+i.price*i.qty,0);
  const company = $('#c-company').value.trim(), notes = $('#c-notes').value.trim();

  const datos = {
    tipo: 'cotizacion',
    nombre: v['c-name'],
    telefono: v['c-phone'],
    correo: v['c-email'] || null,
    empresa: company || null,
    mensaje: notes.slice(0, 4000),
    /* Sólo lo indispensable de cada equipo. La base topa el carrito en 16 KB
       —lo puso la migración de endurecimiento— y mandar el objeto completo,
       con descripción y especificaciones, lo rebasaría con pocos renglones.
       El slug basta para reconstruir la ficha; el precio se guarda porque es
       el que vio el cliente ese día, y puede cambiar después. */
    carrito: lines.map(i => ({
      slug: i.slug, nombre: i.name, cantidad: i.qty,
      precio: i.price, renta: i.cond === 'Renta',
    })),
  };

  const texto = `Hola ${settings.brandMain}${settings.brandAccent}, solicito cotización formal de:

${lines.map(i=>`• ${i.qty}× ${i.name} — ${fmtFull(i.price)}${i.cond==='Renta'?'/mes':''}`).join('\n')}

Total estimado: ${buy?fmtFull(buy):''}${buy&&rent?' + ':''}${rent?fmtFull(rent)+'/mes':''}

Mis datos:
${v['c-name']}${company ? ' · '+company : ''}
Tel. ${v['c-phone']}${v['c-email'] ? ' · '+v['c-email'] : ''}${notes ? '\n\nComentarios: '+notes : ''}`;

  return { texto, datos };
}

/* ── Mi cuenta ── */
function cuentaHTML(){
  const reqs = store.read(K.requests, []);
  const favs = products.filter(p=>favorites.has(p.id));

  const form = `
    <form id="acctForm" novalidate>
      <div class="form-grid">
        <div class="field full"><label for="a-name">Nombre *</label>
          <input type="text" id="a-name" value="${esc(account?.name||'')}" placeholder="Juan Pérez">
          <span class="errmsg">Escribe tu nombre.</span></div>
        <div class="field"><label for="a-phone">Teléfono * <span class="hint">(10 dígitos)</span></label>
          <input type="text" id="a-phone" inputmode="tel" value="${esc(account?.phone||'')}" placeholder="9611234567">
          <span class="errmsg">Necesitamos 10 dígitos.</span></div>
        <div class="field"><label for="a-email">Correo <span class="hint">(opcional)</span></label>
          <input type="text" id="a-email" inputmode="email" value="${esc(account?.email||'')}" placeholder="tucorreo@ejemplo.com">
          <span class="errmsg">Ese correo no parece válido.</span></div>
      </div>
      <div class="send-row"><button class="btn-primary" type="submit">Guardar mis datos</button></div>
    </form>`;

  return `
    <p class="page-intro">Guarda tus datos para no volver a escribirlos en cada cotización.</p>
    ${account ? `
      <div class="acct-card">
        <strong>${esc(account.name)}</strong><br>
        📞 ${esc(account.phone)}${account.email?`<br>✉️ ${esc(account.email)}`:''}
      </div>` : ''}
    ${form}

    <h3>♥ Equipos guardados (${favs.length})</h3>
    ${favs.length
      ? favs.map(p=>`<div class="req-item"><strong>${esc(p.name)}</strong> — ${fmtCompact(p.price)}${p.cond==='Renta'?'/mes':''}</div>`).join('')
      : '<p>Aún no guardas equipos. Usa el ♡ en cualquier tarjeta del catálogo.</p>'}

    <h3>📋 Mis solicitudes (${reqs.length})</h3>
    ${reqs.length
      ? reqs.map(r=>`<div class="req-item"><strong>${esc(r.type)}</strong><br>${esc(r.summary)}<div class="when">${new Date(r.at).toLocaleString('es-MX')}</div></div>`).join('')
      : '<p>Aquí aparecerán las cotizaciones y publicaciones que envíes.</p>'}

    <div class="privacy-note">
      <strong>Esto no es una cuenta de usuario.</strong> Tus datos, favoritos y solicitudes se guardan
      únicamente en este navegador y en este dispositivo: no viajan a ningún servidor y no los podemos ver.
      Si usas otra computadora o borras los datos del navegador, empiezas de cero.
      ${account?`<br><br><button class="btn-ghost" type="button" data-action="acct-clear">Borrar mis datos de este dispositivo</button>`:''}
    </div>`;
}

/* ── Aviso de privacidad ── */
const privacidadHTML = () => `
  <div class="adm-note"><strong>Plantilla base.</strong> Este texto cubre lo que exige la Ley Federal de
    Protección de Datos Personales en Posesión de los Particulares, pero debe revisarlo un abogado y
    completarse con tu razón social y domicilio fiscal reales antes de publicarlo.</div>

  <h3>Responsable</h3>
  <p>${esc(settings.sellerName)}, con domicilio en ${esc(settings.address)}, es responsable del tratamiento
     de tus datos personales.</p>

  <h3>¿Qué datos recabamos?</h3>
  <p>Nombre, teléfono, correo electrónico y, en su caso, el nombre de tu empresa u obra. Los obtenemos
     directamente de ti cuando solicitas una cotización o publicas un equipo en venta.</p>

  <h3>¿Para qué los usamos?</h3>
  <p>Únicamente para contactarte, elaborar y dar seguimiento a tu cotización, valuar la maquinaria que
     ofreces y cumplir obligaciones fiscales derivadas de una compraventa o arrendamiento. No vendemos
     ni compartimos tus datos con terceros para fines publicitarios.</p>

  <h3>Derechos ARCO</h3>
  <p>Puedes solicitar el Acceso, Rectificación, Cancelación u Oposición al tratamiento de tus datos,
     así como revocar tu consentimiento, escribiendo a
     <a href="mailto:${esc(settings.email)}" style="color:#1565C0">${esc(settings.email)}</a>.
     Responderemos en un plazo máximo de 20 días hábiles.</p>

  <h3>Cambios a este aviso</h3>
  <p>Cualquier modificación se publicará en esta misma página.</p>

  <div class="privacy-note">Este sitio no utiliza cookies de rastreo ni publicidad. La información que
    guardamos (tus datos de contacto, favoritos y solicitudes) permanece en el almacenamiento local de
    tu navegador y nunca se envía a nuestros servidores.</div>`;
