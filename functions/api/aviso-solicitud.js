/**
 * aviso-solicitud.js — Avisa por correo en cuanto entra una cotización.
 *
 * ── El agujero que tapa ──
 *
 * Una cotización se guarda en la base y, acto seguido, se le abre WhatsApp al
 * cliente con el mensaje escrito. Pero el cliente PUEDE NO DARLE ENVIAR: se lo
 * piensa, se le va la señal, cambia de app y no vuelve.
 *
 * Esa solicitud queda en la base con su nombre y su teléfono, y nadie se entera
 * hasta que alguien entra al panel a mirar. Es el peor tipo de cliente perdido:
 * uno que ya había levantado la mano.
 *
 * ── Por qué es el servidor quien avisa, y no el navegador ──
 *
 * Lo fácil sería mandar el aviso desde la página, justo después de registrar.
 * Se descartó por dos motivos, y el segundo es el que decide:
 *
 *   · No es fiable. Es el mismo navegador que puede cerrarse, y sería el mismo
 *     momento en que se pierde el WhatsApp. Fallarían los dos a la vez —
 *     exactamente en el caso que venimos a cubrir.
 *   · Sería falsificable. Cualquiera podría llamar a la dirección del aviso y
 *     llenarte el correo de avisos inventados.
 *
 * Aquí lo dispara la base: un Database Webhook de Supabase que se ejecuta al
 * INSERTAR en `solicitudes`. Ocurra lo que ocurra en el navegador, si la fila
 * existe, el aviso sale.
 *
 * ── Configuración (todo opcional: sin esto, el sitio funciona igual) ──
 *
 * En Cloudflare Pages → Settings → Environment variables:
 *
 *   AVISO_SECRETO     ⚠️ SECRETA. Una cadena larga inventada por ti. Es lo
 *                     único que distingue a Supabase de cualquiera que
 *                     descubra esta dirección.
 *   AVISO_DESTINO     tu correo, donde quieres recibir los avisos
 *   RESEND_API_KEY    ⚠️ SECRETA. De resend.com (gratis hasta 3 000 al mes)
 *   AVISO_REMITENTE   opcional. Por omisión usa el remitente de pruebas de
 *                     Resend, que sirve sin verificar dominio.
 *
 * En Supabase → Database → Webhooks → Create:
 *   tabla `solicitudes`, evento INSERT, tipo HTTP Request, método POST,
 *   URL https://mdcmaquinaria.com/api/aviso-solicitud
 *   cabecera  x-aviso-secreto: <el mismo valor de AVISO_SECRETO>
 */

const json = (codigo, cuerpo) => new Response(JSON.stringify(cuerpo), {
  status: codigo,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Compara dos cadenas en tiempo constante.
 *
 * Un `===` normal corta en la primera letra distinta, y esa diferencia de
 * microsegundos deja adivinar el secreto letra por letra. Es un ataque real
 * aunque suene teórico, y evitarlo cuesta ocho líneas.
 */
function igualSeguro(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const pesos = n => '$' + new Intl.NumberFormat('es-MX').format(Number(n) || 0) + ' MXN';

/** El correo. Lo primero que se ve tiene que ser a quién llamar. */
function cuerpoCorreo(s) {
  const carrito = Array.isArray(s.carrito) ? s.carrito : [];
  const tel = String(s.telefono || '').replace(/\D/g, '');
  const wa = `https://wa.me/52${tel}?text=` +
    encodeURIComponent(`Hola ${s.nombre}, le escribo de MDC Maquinaria por su solicitud.`);

  const total = carrito.reduce((n, i) => n + (Number(i.precio) || 0) * (Number(i.cantidad) || 1), 0);

  return `<!doctype html>
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A">
  <p style="font-size:12px;color:#767676;text-transform:uppercase;letter-spacing:.5px;margin:0 0 4px">
    ${s.tipo === 'publicacion' ? 'Quieren venderte un equipo' : 'Nueva cotización'}
  </p>
  <h1 style="font-size:22px;margin:0 0 4px">${esc(s.nombre)}</h1>
  <p style="margin:0 0 18px;font-size:15px">
    <a href="tel:+52${esc(tel)}" style="color:#1565C0;text-decoration:none">${esc(s.telefono)}</a>
    ${s.correo ? ` · <a href="mailto:${esc(s.correo)}" style="color:#1565C0;text-decoration:none">${esc(s.correo)}</a>` : ''}
    ${s.empresa ? `<br><span style="color:#767676;font-size:13px">${esc(s.empresa)}</span>` : ''}
  </p>

  <p style="margin:0 0 22px">
    <a href="${esc(wa)}"
       style="background:#F5C400;color:#1A1A1A;text-decoration:none;font-weight:700;
              padding:12px 22px;border-radius:6px;display:inline-block;font-size:15px">
      Contestar por WhatsApp
    </a>
  </p>

  ${carrito.length ? `
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:18px">
      ${carrito.map(i => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #E0E0E0">
            ${Number(i.cantidad) || 1}× ${esc(i.nombre || i.slug || 'Equipo')}
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #E0E0E0;text-align:right;white-space:nowrap">
            ${pesos(i.precio)}${i.renta ? '/mes' : ''}
          </td>
        </tr>`).join('')}
      ${total ? `<tr>
        <td style="padding:8px 0;font-weight:700">Total estimado</td>
        <td style="padding:8px 0;text-align:right;font-weight:700">${pesos(total)}</td>
      </tr>` : ''}
    </table>` : ''}

  ${s.mensaje ? `
    <p style="background:#FAFAFA;border-left:3px solid #F5C400;padding:12px 14px;
              font-size:14px;line-height:1.6;white-space:pre-line;margin:0 0 18px">${esc(s.mensaje)}</p>` : ''}

  <p style="font-size:12px;color:#9E9E9E;line-height:1.6;margin:0">
    Este aviso lo manda tu propia base de datos al recibir la solicitud, así que
    llega aunque el cliente no haya alcanzado a enviar su WhatsApp.
    La solicitud completa está en el panel → Cotizaciones.
  </p>
</div>`;
}

export async function onRequestPost({ request, env }) {
  const SECRETO = env.AVISO_SECRETO || '';
  const DESTINO = env.AVISO_DESTINO || '';
  const LLAVE = env.RESEND_API_KEY || '';
  const REMITENTE = env.AVISO_REMITENTE || 'MDC Maquinaria <onboarding@resend.dev>';

  /* Sin configurar no es un error: es el estado normal hasta que alguien
     decida activar los avisos. Se responde 200 para que Supabase no marque el
     webhook como fallido y lo empiece a reintentar en bucle. */
  if (!SECRETO || !DESTINO || !LLAVE) {
    return json(200, { ok: false, motivo: 'avisos no configurados' });
  }

  if (!igualSeguro(request.headers.get('x-aviso-secreto') || '', SECRETO)) {
    /* Sin pista de qué falló. Quien llegue aquí sin el secreto no tiene por
       qué saber si la dirección existe, si el secreto es corto o si va en otra
       cabecera. */
    return json(401, { error: 'No autorizado.' });
  }

  try {
    const cuerpo = await request.json();
    // Supabase manda { type, table, record, old_record }. Se acepta también la
    // fila suelta, para poder probar la función a mano con curl.
    const s = cuerpo.record || cuerpo;
    if (!s || !s.nombre || !s.telefono) return json(400, { error: 'Solicitud incompleta.' });

    const asunto = s.tipo === 'publicacion'
      ? `Quieren venderte un equipo — ${s.nombre}`
      /* El teléfono va en el ASUNTO a propósito: en la lista del correo, sin
         abrir nada, ya se ve a quién hay que marcar. */
      : `Nueva cotización — ${s.nombre} · ${s.telefono}`;

    const envio = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LLAVE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: REMITENTE,
        to: DESTINO.split(',').map(d => d.trim()).filter(Boolean),
        subject: asunto,
        html: cuerpoCorreo(s),
        // Contestar el aviso escribe al cliente, no a un buzón que nadie lee.
        ...(s.correo ? { reply_to: s.correo } : {}),
      }),
    });

    if (!envio.ok) {
      const detalle = await envio.text();
      console.error('aviso-solicitud: Resend respondió', envio.status, detalle.slice(0, 200));
      /* 200 igualmente. Si se devolviera un error, Supabase reintentaría, y un
         problema de configuración se convertiría en decenas de intentos por
         cada cotización. La solicitud ya está guardada: el aviso es una
         mejora, no el registro. */
      return json(200, { ok: false, motivo: 'el proveedor de correo rechazó el envío' });
    }

    return json(200, { ok: true });
  } catch (err) {
    console.error('aviso-solicitud:', err);
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
