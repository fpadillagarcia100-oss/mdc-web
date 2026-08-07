/**
 * aviso-pregunta.js — Avisa por correo en cuanto alguien pregunta por un equipo.
 *
 * ── El agujero que tapa ──
 *
 * Una cotización avisa (ver aviso-solicitud.js). Una pregunta, no. Y una
 * pregunta es peor de perder de lo que parece:
 *
 *   · Quien pregunta "¿sigue disponible?" o "¿cuántas horas tiene?" está más
 *     cerca de comprar que quien sólo mira. Ya eligió la máquina.
 *   · Se queda invisible. La pregunta nace SIN publicar —hasta que alguien la
 *     contesta y decide enseñarla—, así que ni siquiera aparece en la ficha
 *     para recordarte que está ahí. Se entera el que entre al panel.
 *   · No deja teléfono. En una cotización queda el número; aquí sólo el nombre
 *     y el texto. Si no se contesta en la ficha, no hay segunda oportunidad de
 *     alcanzar a esa persona: se fue y no dejó por dónde.
 *
 * ── Por qué avisa el servidor y no la página ──
 *
 * Mismo razonamiento que en aviso-solicitud.js, y por los mismos dos motivos:
 * el navegador puede cerrarse justo entonces, y cualquiera podría llamar a
 * esta dirección para llenarte el correo de avisos inventados. Lo dispara la
 * base: si la fila existe, el aviso sale.
 *
 * ── Configuración ──
 *
 * Comparte variables de entorno con aviso-solicitud.js: si aquéllas ya están
 * puestas, esto no necesita ninguna nueva. Sólo falta el webhook:
 *
 *   Supabase → Database → Webhooks → Create:
 *     tabla `preguntas`, evento INSERT, tipo HTTP Request, método POST,
 *     URL https://mdcmaquinaria.com/api/aviso-pregunta
 *     cabecera  x-aviso-secreto: <el mismo valor de AVISO_SECRETO>
 *
 * Sin configurar, no pasa nada: la pregunta se guarda igual y aparece en el
 * panel. El aviso es una mejora, no el registro.
 */

const SITIO = 'https://mdcmaquinaria.com';

/* A dónde van los avisos si nadie configuró `AVISO_DESTINO` en Cloudflare.
   Está aquí para no depender de un ajuste del panel de Cloudflare que se puede
   olvidar; la variable de entorno, si existe, manda sobre esto.

   Ojo con una cosa: esto viaja en el repositorio. Si el repositorio es
   público, esta dirección queda a la vista de cualquiera y de los robots que
   rastrean correos para mandar publicidad. Para que no se vea, se borra de
   aquí y se pone `AVISO_DESTINO` en Cloudflare, que es privado. */
const DESTINO_POR_OMISION = 'pacopadillajr@outlook.com';

const json = (codigo, cuerpo) => new Response(JSON.stringify(cuerpo), {
  status: codigo,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Compara dos cadenas en tiempo constante.
 *
 * Igual que en aviso-solicitud.js, y a propósito duplicado: son dos funciones
 * de borde independientes y compartir código entre ellas obligaría a un paso
 * de compilación que hoy no existe. Ocho líneas duplicadas cuestan menos que
 * eso.
 */
function igualSeguro(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * El slug, legible.
 *
 * La fila sólo guarda `excavadora-cat-320-gc`; el nombre bonito vive en la
 * tabla de equipos, y consultarlo obligaría a darle a esta función una llave
 * de servicio con permiso de lectura sobre el catálogo. No compensa: para
 * saber de qué máquina hablan basta con esto, y el enlace de abajo lleva a la
 * ficha exacta.
 */
const legible = slug => String(slug || '')
  .split('-')
  .map(p => (p.length <= 3 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1)))
  .join(' ');

/** El correo. Lo primero que se lee tiene que ser la pregunta. */
function cuerpoCorreo(p) {
  const ficha = `${SITIO}/equipos/${encodeURIComponent(p.slug)}/`;
  const panel = `${SITIO}/?panel=preguntas`;

  return `<!doctype html>
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A">
  <p style="font-size:12px;color:#767676;text-transform:uppercase;letter-spacing:.5px;margin:0 0 4px">
    Pregunta sobre un equipo
  </p>
  <h1 style="font-size:20px;margin:0 0 16px">${esc(legible(p.slug))}</h1>

  <p style="background:#FFFBEC;border-left:3px solid #F5C400;padding:14px 16px;
            font-size:16px;line-height:1.6;white-space:pre-line;margin:0 0 8px">${esc(p.pregunta)}</p>
  <p style="margin:0 0 22px;font-size:13px;color:#767676">— ${esc(p.nombre)}</p>

  <p style="margin:0 0 22px">
    <a href="${esc(panel)}"
       style="background:#F5C400;color:#1A1A1A;text-decoration:none;font-weight:700;
              padding:12px 22px;border-radius:6px;display:inline-block;font-size:15px">
      Contestar en el panel
    </a>
    <a href="${esc(ficha)}"
       style="color:#1565C0;text-decoration:none;font-size:14px;margin-left:14px">Ver la ficha</a>
  </p>

  <p style="font-size:12px;color:#9E9E9E;line-height:1.6;margin:0">
    Quien pregunta ya eligió la máquina: está más cerca de comprar que quien sólo mira.
    <br><br>
    Esta pregunta NO se ve todavía en la ficha —nace sin publicar— así que nadie
    más la está viendo, y no deja teléfono: si no se contesta aquí, no hay otra
    forma de alcanzar a esa persona.
  </p>
</div>`;
}

export async function onRequestPost({ request, env }) {
  const SECRETO = env.AVISO_SECRETO || '';
  const DESTINO = env.AVISO_DESTINO || DESTINO_POR_OMISION;
  const LLAVE = env.RESEND_API_KEY || '';
  const REMITENTE = env.AVISO_REMITENTE || 'MDC Maquinaria <onboarding@resend.dev>';

  /* Sin configurar no es un error: es el estado normal hasta que alguien
     active los avisos. Se responde 200 para que Supabase no marque el webhook
     como fallido y lo reintente en bucle. */
  if (!SECRETO || !DESTINO || !LLAVE) {
    return json(200, { ok: false, motivo: 'avisos no configurados' });
  }

  if (!igualSeguro(request.headers.get('x-aviso-secreto') || '', SECRETO)) {
    return json(401, { error: 'No autorizado.' });
  }

  try {
    const cuerpo = await request.json();
    // Supabase manda { type, table, record, old_record }. Se acepta también la
    // fila suelta, para poder probar la función a mano con curl.
    const p = cuerpo.record || cuerpo;
    if (!p || !p.pregunta || !p.slug) return json(400, { error: 'Pregunta incompleta.' });

    /* Un INSERT es una pregunta nueva. Pero si algún día el webhook se
       configura también para UPDATE —al contestarla, por ejemplo— avisaría
       otra vez de algo ya atendido. Se corta aquí. */
    if (cuerpo.type && cuerpo.type !== 'INSERT') {
      return json(200, { ok: false, motivo: 'sólo se avisa de preguntas nuevas' });
    }

    /* El equipo va en el ASUNTO: con varias preguntas en la bandeja, se ve de
       qué máquina habla cada una sin abrir ninguna. */
    const asunto = `Pregunta sobre ${legible(p.slug)} — ${p.nombre}`;

    const envio = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LLAVE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: REMITENTE,
        to: DESTINO.split(',').map(d => d.trim()).filter(Boolean),
        subject: asunto,
        html: cuerpoCorreo(p),
      }),
    });

    if (!envio.ok) {
      const detalle = await envio.text();
      console.error('aviso-pregunta: Resend respondió', envio.status, detalle.slice(0, 200));
      // 200 igualmente: ver el razonamiento en aviso-solicitud.js.
      return json(200, { ok: false, motivo: 'el proveedor de correo rechazó el envío' });
    }

    return json(200, { ok: true });
  } catch (err) {
    console.error('aviso-pregunta:', err);
    return json(200, { ok: false, motivo: 'error al procesar' });
  }
}

/** Cualquier otro método. Evita que un GET devuelva la página de 404. */
export async function onRequest() {
  return new Response(JSON.stringify({ error: 'Método no permitido.' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}
