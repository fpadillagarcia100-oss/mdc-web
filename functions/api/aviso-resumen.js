/**
 * aviso-resumen.js — Los dos correos que se mandan solos: lo pendiente y el
 * resumen semanal.
 *
 * ── Por qué los dos en una función ──
 *
 * Comparten todo lo que cuesta: la comprobación del secreto, el envío por
 * Resend, el estilo del correo y la decisión de no fallar hacia fuera. Lo
 * único que cambia es qué se cuenta. Dos archivos casi idénticos envejecen
 * distinto y acaban divergiendo en la parte de seguridad, que es justo donde
 * no puede haber dos versiones.
 *
 * El cuerpo trae `{tipo: 'pendientes' | 'semanal', ...datos}` y lo manda
 * `pg_cron` desde la base (ver la migración de avisos programados).
 *
 * ── PENDIENTES ──
 *
 * El aviso de una cotización o una pregunta llega cuando entra. Si estás en
 * obra y no lo ves, nadie insiste. A las 24 horas este correo repite lo que
 * sigue sin contestar. Es el que de verdad cumple "que no se me pase ninguno":
 * el primer aviso puede perderse; éste no depende de que lo hayas visto.
 *
 * No manda nada si no hay nada pendiente. Un correo diario que casi siempre
 * dice "todo al día" enseña a ignorarlo, y el día que trae algo tampoco se
 * abre.
 *
 * ── SEMANAL ──
 *
 * Ya se guardan vistas y cotizaciones por equipo, y nadie las mira. El correo
 * de los lunes las pone delante: qué se miró mucho y no se cotizó —precio o
 * foto mal puestos— y qué convirtió. Es el único informe que sirve sin tener
 * que entrar a ningún sitio.
 *
 * ── Configuración ──
 *
 * Ninguna nueva: usa las mismas variables que los otros avisos.
 */

const SITIO = 'https://mdcmaquinaria.com';

const json = (codigo, cuerpo) => new Response(JSON.stringify(cuerpo), {
  status: codigo,
  headers: { 'Content-Type': 'application/json' },
});

/** Compara en tiempo constante. Ver la nota en aviso-solicitud.js. */
function igualSeguro(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const legible = slug => String(slug || '')
  .split('-')
  .map(p => (p.length <= 3 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1)))
  .join(' ');

/** Cuántos días lleva esperando algo. Se dice en días, no en horas. */
function espera(fecha) {
  const dias = Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  return `hace ${dias} días`;
}

const CAJA = 'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A';

/* ── LO PENDIENTE ── */
function correoPendientes(d) {
  const cot = d.solicitudes || [];
  const preg = d.preguntas || [];

  const fila = (titulo, sub, cuando) => `
    <tr>
      <td style="padding:11px 0;border-bottom:1px solid #EEE">
        <div style="font-weight:600;font-size:14px">${esc(titulo)}</div>
        <div style="font-size:12.5px;color:#767676;margin-top:2px">${esc(sub)}</div>
      </td>
      <td style="padding:11px 0;border-bottom:1px solid #EEE;text-align:right;
                 white-space:nowrap;font-size:12px;color:#B26A00;vertical-align:top">${esc(cuando)}</td>
    </tr>`;

  return `<!doctype html>
<div style="${CAJA}">
  <p style="font-size:12px;color:#767676;text-transform:uppercase;letter-spacing:.5px;margin:0 0 4px">
    Sigue sin contestar
  </p>
  <h1 style="font-size:21px;margin:0 0 18px">
    ${cot.length + preg.length} ${cot.length + preg.length === 1 ? 'persona espera' : 'personas esperan'} respuesta
  </h1>

  ${cot.length ? `
    <p style="font-size:13px;font-weight:700;color:#767676;margin:0 0 4px">COTIZACIONES</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      ${cot.map(s => fila(s.nombre, s.telefono || 'sin teléfono', espera(s.creado_en))).join('')}
    </table>` : ''}

  ${preg.length ? `
    <p style="font-size:13px;font-weight:700;color:#767676;margin:0 0 4px">PREGUNTAS</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      ${preg.map(p => fila(p.pregunta, `${p.nombre} · ${legible(p.slug)}`, espera(p.creado_en))).join('')}
    </table>` : ''}

  <p style="margin:0 0 20px">
    <a href="${SITIO}/?panel=${cot.length ? 'solicitudes' : 'preguntas'}"
       style="background:#F5C400;color:#1A1A1A;text-decoration:none;font-weight:700;
              padding:12px 22px;border-radius:6px;display:inline-block;font-size:15px">
      Contestar ahora
    </a>
  </p>

  <p style="font-size:12px;color:#9E9E9E;line-height:1.6;margin:0">
    Este correo sólo llega cuando hay algo esperando más de un día. Si no hay nada, no se manda:
    un aviso diario que casi siempre dice "todo al día" se deja de abrir.
  </p>
</div>`;
}

/* ── EL RESUMEN SEMANAL ── */
function correoSemanal(d) {
  const equipos = d.equipos || [];
  const totales = d.totales || {};

  /* El orden importa más que los números: arriba lo más mirado, porque lo que
     se mira mucho y no se cotiza es donde está el problema — y ese es el único
     dato accionable de todo el informe. */
  const filas = equipos.slice(0, 10).map(e => {
    const frio = e.vistas >= 8 && Number(e.cotizaciones) === 0;
    return `
      <tr>
        <td style="padding:9px 0;border-bottom:1px solid #EEE;font-size:13.5px">
          ${esc(legible(e.slug))}
          ${frio ? '<span style="color:#B26A00;font-size:11.5px"> · nadie preguntó</span>' : ''}
        </td>
        <td style="padding:9px 0;border-bottom:1px solid #EEE;text-align:right;font-size:13.5px;white-space:nowrap">
          ${Number(e.vistas) || 0} <span style="color:#9E9E9E;font-size:11.5px">vistas</span>
        </td>
        <td style="padding:9px 0;border-bottom:1px solid #EEE;text-align:right;font-size:13.5px;white-space:nowrap;
                   font-weight:${Number(e.cotizaciones) ? '700' : '400'};
                   color:${Number(e.cotizaciones) ? '#2E7D32' : '#BDBDBD'}">
          ${Number(e.cotizaciones) || 0} <span style="color:#9E9E9E;font-size:11.5px;font-weight:400">cotiz.</span>
        </td>
      </tr>`;
  }).join('');

  return `<!doctype html>
<div style="${CAJA}">
  <p style="font-size:12px;color:#767676;text-transform:uppercase;letter-spacing:.5px;margin:0 0 4px">
    Resumen de la semana
  </p>
  <h1 style="font-size:21px;margin:0 0 16px">
    ${Number(totales.vistas) || 0} visitas a fichas · ${Number(totales.cotizaciones) || 0} cotizaciones
  </h1>

  ${filas ? `
    <table style="width:100%;border-collapse:collapse;margin-bottom:18px">${filas}</table>` :
    '<p style="font-size:14px;color:#767676">Todavía no hay suficientes datos esta semana.</p>'}

  <p style="background:#FFFBEC;border-left:3px solid #F5C400;padding:12px 14px;
            font-size:13px;line-height:1.65;margin:0 0 18px;color:#6B5400">
    Lo que se mira mucho y nadie cotiza suele ser una de dos cosas: el precio está
    fuera de mercado, o la foto no enseña la máquina. Son las dos que puedes
    arreglar hoy mismo desde el panel.
  </p>

  <p style="font-size:12px;color:#9E9E9E;line-height:1.6;margin:0">
    Se cuenta al abrir la ficha, no al pasar por delante de la tarjeta. Sin cookies
    ni identificación: sólo cuántas veces, nunca quién.
  </p>
</div>`;
}

export async function onRequestPost({ request, env }) {
  const SECRETO = env.AVISO_SECRETO || '';
  const DESTINO = env.AVISO_DESTINO || 'pacopadillajr@outlook.com';
  const LLAVE = env.RESEND_API_KEY || '';
  const REMITENTE = env.AVISO_REMITENTE || 'MDC Maquinaria <onboarding@resend.dev>';

  if (!SECRETO || !DESTINO || !LLAVE) {
    return json(200, { ok: false, motivo: 'avisos no configurados' });
  }
  if (!igualSeguro(request.headers.get('x-aviso-secreto') || '', SECRETO)) {
    return json(401, { error: 'No autorizado.' });
  }

  try {
    const d = await request.json();

    let asunto, html;
    if (d.tipo === 'pendientes') {
      const cuantos = (d.solicitudes || []).length + (d.preguntas || []).length;
      /* Nada pendiente, nada que mandar. Que la base pregunte y la función
         decida callarse es lo correcto: la condición de "vale la pena avisar"
         vive en un solo sitio y se lee. */
      if (!cuantos) return json(200, { ok: true, enviado: false, motivo: 'nada pendiente' });
      asunto = `${cuantos} ${cuantos === 1 ? 'persona espera' : 'personas esperan'} respuesta`;
      html = correoPendientes(d);
    } else if (d.tipo === 'semanal') {
      asunto = `Semana: ${Number(d.totales?.vistas) || 0} visitas · ${Number(d.totales?.cotizaciones) || 0} cotizaciones`;
      html = correoSemanal(d);
    } else {
      return json(400, { error: 'Tipo de resumen desconocido.' });
    }

    const envio = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LLAVE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: REMITENTE,
        to: DESTINO.split(',').map(x => x.trim()).filter(Boolean),
        subject: asunto,
        html,
      }),
    });

    if (!envio.ok) {
      const detalle = await envio.text();
      console.error('aviso-resumen: Resend respondió', envio.status, detalle.slice(0, 200));
      return json(200, { ok: false, motivo: 'el proveedor de correo rechazó el envío' });
    }

    return json(200, { ok: true, enviado: true });
  } catch (err) {
    console.error('aviso-resumen:', err);
    return json(200, { ok: false, motivo: 'error al procesar' });
  }
}

export async function onRequest() {
  return new Response(JSON.stringify({ error: 'Método no permitido.' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}
