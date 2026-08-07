/**
 * admin-bandeja.js — Cotizaciones, preguntas del público y métricas de interés.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 */
'use strict';

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

