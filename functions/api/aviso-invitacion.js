/**
 * /api/aviso-invitacion — Manda el correo con el enlace para entrar al panel.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 *
 * Antes lo mandaba Supabase al invitar a alguien. Ahora la cuenta se crea en
 * el servidor de la oficina (servidor/Mdc.Api), que no tiene la llave de
 * Resend: la llave vive aquí, junto a las de los otros avisos, y el servidor
 * llama a esta función igual que a aviso-solicitud y aviso-pregunta — con el
 * secreto en la cabecera x-aviso-secreto.
 *
 * El correo NO lleva contraseña. Lleva un enlace de un solo uso con el que la
 * persona elige la suya; caduca solo. Así la contraseña no pasa por nadie: ni
 * por quien invita, ni por un WhatsApp, ni por este correo.
 */

const json = (codigo, cuerpo) => new Response(JSON.stringify(cuerpo), {
  status: codigo,
  headers: { 'Content-Type': 'application/json' },
});

/** Comparación en tiempo constante: que el tiempo de respuesta no delate el secreto. */
function igualSeguro(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function cuerpoCorreo({ nombre, enlace, dias }) {
  return `<!doctype html>
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#1A1A1A">
  <p style="font-size:12px;color:#767676;text-transform:uppercase;letter-spacing:.5px;margin:0 0 4px">MDC · Maquinaria de Chiapas</p>
  <h1 style="font-size:22px;margin:0 0 12px">Hola, ${esc(nombre)}</h1>
  <p style="font-size:15px;line-height:1.6;margin:0 0 22px">
    Te dieron acceso al panel del catálogo. Para entrar, elige tu contraseña:
  </p>
  <p style="margin:0 0 22px">
    <a href="${esc(enlace)}"
       style="background:#F5C400;color:#1A1A1A;text-decoration:none;font-weight:700;
              padding:12px 22px;border-radius:999px;display:inline-block;font-size:15px">
      Elegir mi contraseña
    </a>
  </p>
  <p style="font-size:12px;color:#9E9E9E;line-height:1.6;margin:0">
    El enlace sirve una sola vez y caduca en ${Number(dias) || 7} días. Si no esperabas
    este correo, ignóralo: sin abrir el enlace no se crea ninguna contraseña.
  </p>
</div>`;
}

export async function onRequestPost({ request, env }) {
  const SECRETO = env.AVISO_SECRETO || '';
  const LLAVE = env.RESEND_API_KEY || '';
  const REMITENTE = env.AVISO_REMITENTE || 'MDC Maquinaria <onboarding@resend.dev>';

  /* A diferencia de los otros avisos, aquí NO se responde 200 si falta la
     configuración: una invitación que no sale deja a alguien sin poder
     entrar, y el panel tiene que poder decirlo. */
  if (!SECRETO || !LLAVE) return json(503, { error: 'Los correos no están configurados.' });

  if (!igualSeguro(request.headers.get('x-aviso-secreto') || '', SECRETO)) {
    return json(401, { error: 'No autorizado.' });
  }

  try {
    const { correo, nombre, enlace, dias } = await request.json();
    /* El enlace sólo puede apuntar a este mismo sitio. Si el secreto se
       filtrara, esto impide usar la función para mandar, con remitente de
       MDC, enlaces a cualquier otra parte. */
    const origen = new URL(request.url).origin;
    if (!correo || !nombre || typeof enlace !== 'string' || !enlace.startsWith(origen + '/?invitacion=')) {
      return json(400, { error: 'Invitación incompleta.' });
    }

    const envio = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LLAVE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: REMITENTE,
        to: [correo],
        subject: 'Tu acceso al panel de MDC Maquinaria',
        html: cuerpoCorreo({ nombre, enlace, dias }),
      }),
    });

    if (!envio.ok) {
      console.error('aviso-invitacion: Resend respondió', envio.status, (await envio.text()).slice(0, 200));
      return json(502, { error: 'El proveedor de correo rechazó el envío.' });
    }
    return json(200, { ok: true });
  } catch (err) {
    console.error('aviso-invitacion:', err);
    return json(500, { error: 'Error al procesar.' });
  }
}

/** Cualquier otro método. Evita que un GET devuelva la página de 404. */
export async function onRequest() {
  return json(405, { error: 'Método no permitido.' });
}
