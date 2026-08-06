/**
 * publicar.js — Reconstruye y publica el sitio. Sólo administradores.
 *
 * Versión para Cloudflare Pages. Misma lógica que netlify/functions/publicar.js;
 * cambia la forma de recibir la petición y de leer las variables de entorno
 * (en Cloudflare llegan en `env`, no en un `process.env` global).
 *
 * Las dos conviven mientras se hace la mudanza. Duplicar código no es gratis
 * —dos sitios que corregir si algo cambia— pero durante un traslado es lo
 * correcto: el sitio viejo tiene que seguir funcionando hasta que el nuevo
 * esté probado, y un archivo que sirva a las dos plataformas no existe.
 *
 * ── Por qué existe esta función ──
 *
 * Cloudflare reconstruye el sitio cuando se llama a una dirección secreta. Lo
 * directo sería ponerla en el botón del panel. No se puede: todo lo que va en
 * el navegador es público, y quien la leyera podría lanzar despliegues en
 * bucle hasta agotar la cuota del mes.
 *
 * Así que vive aquí, en el servidor. Esta función es el portero.
 *
 * ── Cómo comprueba ──
 *
 * NO se cree el token que llega: se lo lleva a Supabase y pregunta de quién
 * es. Un token se puede inventar; hacer que Supabase confirme uno falso, no.
 *
 * Y no basta con que la sesión sea válida — se consulta además si esa persona
 * es `admin`. Una cuenta de personal con sesión abierta no debe publicar.
 *
 * ── Variables de entorno ──
 *
 *   SUPABASE_URL         la misma del resto del sitio
 *   SUPABASE_ANON_KEY    la misma; sólo para preguntar quién eres
 *   DEPLOY_HOOK          ⚠️ SECRETA de verdad. Se marca como secreta en
 *                        Cloudflare y nunca se escribe en el repositorio.
 */

export async function onRequestPost({ request, env }) {
  const json = (codigo, cuerpo) => new Response(JSON.stringify(cuerpo), {
    status: codigo,
    headers: { 'Content-Type': 'application/json' },
  });

  const URL_SUPABASE = (env.SUPABASE_URL || '').replace(/\/+$/, '');
  const LLAVE = env.SUPABASE_ANON_KEY || '';
  const HOOK = env.DEPLOY_HOOK || '';

  if (!URL_SUPABASE || !LLAVE || !HOOK) {
    // Sin decir cuál falta: ese detalle sólo le sirve a quien esté tanteando.
    // Para quien configura, está en el log.
    console.error('publicar: faltan variables de entorno', {
      supabase: !!URL_SUPABASE, llave: !!LLAVE, hook: !!HOOK,
    });
    return json(500, { error: 'La publicación automática no está configurada.' });
  }

  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'Falta la sesión.' });

  try {
    /* Paso 1 — ¿de quién es este token?
       Se le pregunta a Supabase. Aquí no se descifra por nuestra cuenta:
       leer sus datos sin verificar la firma es el error clásico, porque
       cualquiera puede escribir un token que diga "soy admin". */
    const quien = await fetch(`${URL_SUPABASE}/auth/v1/user`, {
      headers: { apikey: LLAVE, Authorization: `Bearer ${token}` },
    });
    if (!quien.ok) return json(401, { error: 'Tu sesión no es válida. Vuelve a entrar.' });

    /* Paso 2 — ¿es administrador?
       La política de `perfiles` sólo deja ver el perfil propio, así que esta
       consulta devuelve la fila de quien pregunta, o nada. */
    const perfil = await fetch(`${URL_SUPABASE}/rest/v1/perfiles?select=rol&limit=1`, {
      headers: { apikey: LLAVE, Authorization: `Bearer ${token}` },
    });
    const filas = perfil.ok ? await perfil.json() : [];

    if (filas[0]?.rol !== 'admin') {
      return json(403, { error: 'Sólo un administrador puede publicar.' });
    }

    /* Paso 3 — ahora sí, a construir. */
    const disparo = await fetch(HOOK, { method: 'POST' });
    if (!disparo.ok) {
      console.error('publicar: el hook respondió', disparo.status);
      return json(502, { error: 'Cloudflare no aceptó la petición. Intenta de nuevo.' });
    }

    return json(202, {
      ok: true,
      mensaje: 'Publicando. El sitio se actualiza en un par de minutos.',
    });
  } catch (err) {
    console.error('publicar:', err);
    return json(500, { error: 'No se pudo publicar. Intenta de nuevo en un momento.' });
  }
}

/** Cualquier otro método. Evita que un GET devuelva la página de 404. */
export async function onRequest() {
  return new Response(JSON.stringify({ error: 'Método no permitido.' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}
