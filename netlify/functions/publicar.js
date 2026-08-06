/**
 * publicar.js — Reconstruye y publica el sitio, sólo para administradores.
 *
 * ── Por qué existe esta función ──
 *
 * Netlify reconstruye el sitio cuando se llama a una dirección secreta (un
 * "build hook"). Lo directo sería poner esa dirección en el botón del panel.
 * No se puede: todo lo que va en el navegador es público, y quien la leyera
 * podría lanzar despliegues en bucle hasta agotar los minutos de compilación
 * del mes. El sitio no se cae, pero deja de poder actualizarse — y averiguar
 * por qué llevaría un buen rato.
 *
 * Así que la dirección vive aquí, en el servidor, donde nadie la ve. Esta
 * función es el portero: recibe la petición, comprueba quién la hace, y sólo
 * entonces llama a Netlify.
 *
 * ── Cómo comprueba ──
 *
 * NO se cree el token que llega. Se lo lleva a Supabase y pregunta de quién
 * es. Un token se puede inventar; lo que no se puede es hacer que Supabase
 * confirme uno falso.
 *
 * Y no basta con que la sesión sea válida: se consulta además si esa persona
 * es `admin` en la tabla `perfiles`. Una cuenta de personal con sesión abierta
 * no debe poder publicar.
 *
 * ── Variables de entorno que necesita ──
 *
 *   SUPABASE_URL            la misma del resto del sitio
 *   SUPABASE_ANON_KEY       la misma; sólo se usa para preguntar quién eres
 *   NETLIFY_BUILD_HOOK      ⚠️ SECRETA de verdad. Ésta sí se marca como
 *                           secreta en Netlify y nunca se escribe en el
 *                           repositorio.
 */
'use strict';

exports.handler = async (event) => {
  const json = (codigo, cuerpo) => ({
    statusCode: codigo,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Método no permitido.' });
  }

  const URL_SUPABASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const LLAVE = process.env.SUPABASE_ANON_KEY || '';
  const HOOK = process.env.NETLIFY_BUILD_HOOK || '';

  if (!URL_SUPABASE || !LLAVE || !HOOK) {
    // Sin mencionar cuál falta: el detalle sólo le sirve a quien esté
    // tanteando el terreno. Para quien configura, está en el log del deploy.
    console.error('publicar: faltan variables de entorno', {
      supabase: !!URL_SUPABASE, llave: !!LLAVE, hook: !!HOOK,
    });
    return json(500, { error: 'La publicación automática no está configurada.' });
  }

  const token = (event.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'Falta la sesión.' });

  try {
    /* Paso 1 — ¿de quién es este token?
       Se le pregunta a Supabase. Aquí no se descifra ni se inspecciona el
       token por nuestra cuenta: leer sus datos sin verificar la firma es el
       error clásico, porque cualquiera puede escribir un token que diga
       "soy admin". */
    const quien = await fetch(`${URL_SUPABASE}/auth/v1/user`, {
      headers: { apikey: LLAVE, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!quien.ok) return json(401, { error: 'Tu sesión no es válida. Vuelve a entrar.' });

    /* Paso 2 — ¿es administrador?
       La política de `perfiles` sólo deja ver el perfil propio, así que esta
       consulta, hecha con el token de esa persona, devuelve su fila o nada. */
    const perfil = await fetch(`${URL_SUPABASE}/rest/v1/perfiles?select=rol&limit=1`, {
      headers: { apikey: LLAVE, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    const filas = perfil.ok ? await perfil.json() : [];

    if (filas[0]?.rol !== 'admin') {
      return json(403, { error: 'Sólo un administrador puede publicar.' });
    }

    /* Paso 3 — ahora sí, a construir. */
    const disparo = await fetch(HOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger_title: 'Publicado desde el panel' }),
      signal: AbortSignal.timeout(15000),
    });

    if (!disparo.ok) {
      console.error('publicar: el build hook respondió', disparo.status);
      return json(502, { error: 'Netlify no aceptó la petición. Intenta de nuevo.' });
    }

    return json(202, {
      ok: true,
      mensaje: 'Publicando. El sitio se actualiza en un par de minutos.',
    });
  } catch (err) {
    console.error('publicar:', err);
    return json(500, { error: 'No se pudo publicar. Intenta de nuevo en un momento.' });
  }
};
