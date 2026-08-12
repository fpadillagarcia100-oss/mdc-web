/**
 * usuarios.js — Alta, baja y roles del personal que puede editar el catálogo.
 *
 * ── Por qué esto vive en el servidor y no en el panel ──
 *
 * Cambiar el rol de alguien SÍ se puede desde el navegador: la política de
 * `perfiles` lo permite a un admin, y un trigger impide que nadie se ascienda
 * solo. Eso ya estaba bien resuelto.
 *
 * Lo que no se puede desde el navegador es CREAR una cuenta ni ver los correos
 * del personal. Los correos viven en `auth.users`, que no expone la API
 * pública — a propósito: la lista de cuentas de una empresa es justo lo que
 * busca quien entra a husmear. Invitar exige la llave de servicio, y esa llave
 * puede TODO: leer la cartera de clientes, borrar el catálogo, saltarse cada
 * política. No puede pisar un navegador jamás.
 *
 * Así que todo pasa por aquí, con la misma comprobación de tres pasos que usa
 * publicar.js: se le pregunta a Supabase de quién es el token —no se descifra
 * por cuenta propia, que es el error clásico— y luego si esa persona es admin.
 *
 * ── Los dos candados que evitan el desastre ──
 *
 * Nadie puede cambiarse el rol a sí mismo, y no se puede quitar al ÚLTIMO
 * administrador. Sin esos dos, un clic distraído deja la empresa fuera de su
 * propio panel sin forma de volver a entrar salvo abriendo Supabase a mano.
 *
 * ── Configuración ──
 *
 * En Cloudflare Pages → Settings → Variables and secrets:
 *
 *   SUPABASE_SERVICE_KEY   ⚠️ SECRET, nunca Plaintext. Supabase → Settings →
 *                          API → `service_role`. Es la llave maestra.
 *
 * Sin ella la pestaña de usuarios avisa de que falta y no hace nada. Las otras
 * dos variables —SUPABASE_URL y SUPABASE_ANON_KEY— ya están.
 */

const json = (codigo, cuerpo) => new Response(JSON.stringify(cuerpo), {
  status: codigo,
  headers: { 'Content-Type': 'application/json' },
});

const CORREO_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/** Comprueba la sesión y devuelve quién es, o una respuesta de error. */
async function quienPregunta(request, env) {
  const URL_SUPABASE = (env.SUPABASE_URL || '').replace(/\/+$/, '');
  const ANON = env.SUPABASE_ANON_KEY || '';
  const SERVICIO = env.SUPABASE_SERVICE_KEY || '';

  if (!URL_SUPABASE || !ANON) {
    console.error('usuarios: faltan SUPABASE_URL o SUPABASE_ANON_KEY');
    return { error: json(500, { error: 'La gestión de usuarios no está configurada.' }) };
  }
  if (!SERVICIO) {
    /* Este mensaje SÍ es explícito, al revés que los de autenticación: quien
       llega aquí ya demostró ser administrador del sitio, y lo que necesita es
       saber exactamente qué le falta por configurar. */
    return { error: json(503, {
      error: 'Falta SUPABASE_SERVICE_KEY en Cloudflare. Sin ella no se pueden invitar usuarios.',
    }) };
  }

  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return { error: json(401, { error: 'Falta la sesión.' }) };

  const quien = await fetch(`${URL_SUPABASE}/auth/v1/user`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  });
  if (!quien.ok) return { error: json(401, { error: 'Tu sesión no es válida. Vuelve a entrar.' }) };
  const usuario = await quien.json();

  const perfil = await fetch(`${URL_SUPABASE}/rest/v1/perfiles?select=rol&limit=1`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  });
  const filas = perfil.ok ? await perfil.json() : [];
  if (filas[0]?.rol !== 'admin') {
    return { error: json(403, { error: 'Sólo un administrador puede gestionar usuarios.' }) };
  }

  return { URL_SUPABASE, SERVICIO, yo: usuario.id };
}

/** Llamada a la API con la llave de servicio. Nunca sale de este archivo. */
const conServicio = (url, servicio, opciones = {}) => fetch(url, {
  ...opciones,
  headers: {
    apikey: servicio,
    Authorization: `Bearer ${servicio}`,
    'Content-Type': 'application/json',
    ...(opciones.headers || {}),
  },
});

/** El personal, con su correo y su rol. */
async function listar(URL_SUPABASE, SERVICIO) {
  const [cuentas, perfiles] = await Promise.all([
    conServicio(`${URL_SUPABASE}/auth/v1/admin/users?per_page=200`, SERVICIO),
    conServicio(`${URL_SUPABASE}/rest/v1/perfiles?select=id,nombre,rol,creado_en`, SERVICIO),
  ]);

  const users = cuentas.ok ? (await cuentas.json()).users || [] : [];
  const roles = perfiles.ok ? await perfiles.json() : [];
  const porId = new Map(roles.map(p => [p.id, p]));

  return users.map(u => {
    const p = porId.get(u.id) || {};
    return {
      id: u.id,
      correo: u.email,
      nombre: p.nombre || '—',
      rol: p.rol || 'staff',
      // Sin confirmar = se le invitó y todavía no entró a poner su contraseña.
      confirmado: !!u.email_confirmed_at,
      creado: p.creado_en || u.created_at,
    };
  }).sort((a, b) => (a.rol === b.rol ? a.correo.localeCompare(b.correo) : a.rol === 'admin' ? -1 : 1));
}

export async function onRequest({ request, env }) {
  const metodo = request.method.toUpperCase();
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(metodo)) {
    return json(405, { error: 'Método no permitido.' });
  }

  const sesion = await quienPregunta(request, env);
  if (sesion.error) return sesion.error;
  const { URL_SUPABASE, SERVICIO, yo } = sesion;

  try {
    if (metodo === 'GET') {
      return json(200, { usuarios: await listar(URL_SUPABASE, SERVICIO) });
    }

    const cuerpo = await request.json().catch(() => ({}));

    /* ── Invitar ── */
    if (metodo === 'POST') {
      const correo = String(cuerpo.correo || '').trim().toLowerCase();
      const nombre = String(cuerpo.nombre || '').trim();
      const rol = cuerpo.rol === 'admin' ? 'admin' : 'staff';

      if (!CORREO_RE.test(correo)) return json(400, { error: 'Ese correo no parece válido.' });
      if (nombre.length < 2) return json(400, { error: 'Escribe el nombre de la persona.' });

      /* Se invita en lugar de crear con contraseña. La diferencia importa: así
         la contraseña la elige quien va a usarla y no pasa nunca por aquí, ni
         por un WhatsApp, ni por la memoria de quien la inventó. */
      const invita = await conServicio(`${URL_SUPABASE}/auth/v1/invite`, SERVICIO, {
        method: 'POST',
        body: JSON.stringify({ email: correo, data: { nombre } }),
      });

      if (!invita.ok) {
        const detalle = await invita.text();
        console.error('usuarios: invite respondió', invita.status, detalle.slice(0, 200));
        if (invita.status === 422) return json(409, { error: 'Ese correo ya tiene cuenta.' });
        return json(502, { error: 'Supabase no aceptó la invitación. Revisa el correo.' });
      }

      const nuevo = await invita.json();

      /* El trigger de alta ya creó el perfil con rol 'staff'. Si se pidió
         admin, se sube aquí — con la llave de servicio, que es la única que
         puede saltarse el trigger que bloquea la escalada de rol. */
      if (rol === 'admin' && nuevo.id) {
        await conServicio(`${URL_SUPABASE}/rest/v1/perfiles?id=eq.${nuevo.id}`, SERVICIO, {
          method: 'PATCH',
          body: JSON.stringify({ rol: 'admin', nombre }),
        });
      }

      return json(201, { ok: true, mensaje: `Invitación enviada a ${correo}.` });
    }

    /* ── Cambiar rol ── */
    if (metodo === 'PATCH') {
      const id = String(cuerpo.id || '');
      const rol = cuerpo.rol === 'admin' ? 'admin' : 'staff';
      if (!id) return json(400, { error: 'Falta el usuario.' });

      /* Candado 1: nadie se toca a sí mismo. Quitarse el rol por descuido deja
         a esa persona fuera del panel al instante, y con la sesión abierta
         creyendo que sigue dentro. */
      if (id === yo) return json(400, { error: 'No puedes cambiar tu propio rol.' });

      if (rol !== 'admin') {
        /* Candado 2: tiene que quedar al menos un administrador. Sin esto, un
           clic deja a la empresa fuera de su propio panel, y volver a entrar
           exige abrir Supabase a mano — si es que alguien sabe cómo. */
        const admins = await conServicio(
          `${URL_SUPABASE}/rest/v1/perfiles?select=id&rol=eq.admin`, SERVICIO);
        const lista = admins.ok ? await admins.json() : [];
        if (lista.length <= 1 && lista.some(p => p.id === id)) {
          return json(409, { error: 'Es el único administrador. Nombra otro antes de quitarle el acceso.' });
        }
      }

      const r = await conServicio(`${URL_SUPABASE}/rest/v1/perfiles?id=eq.${id}`, SERVICIO, {
        method: 'PATCH',
        body: JSON.stringify({ rol }),
      });
      if (!r.ok) return json(502, { error: 'No se pudo cambiar el rol.' });
      return json(200, { ok: true });
    }

    /* ── Eliminar la cuenta ── */
    if (metodo === 'DELETE') {
      const id = String(cuerpo.id || '');
      if (!id) return json(400, { error: 'Falta el usuario.' });
      if (id === yo) return json(400, { error: 'No puedes eliminar tu propia cuenta.' });

      const admins = await conServicio(
        `${URL_SUPABASE}/rest/v1/perfiles?select=id&rol=eq.admin`, SERVICIO);
      const lista = admins.ok ? await admins.json() : [];
      if (lista.length <= 1 && lista.some(p => p.id === id)) {
        return json(409, { error: 'Es el único administrador. Nombra otro antes de eliminarlo.' });
      }

      const r = await conServicio(`${URL_SUPABASE}/auth/v1/admin/users/${id}`, SERVICIO,
        { method: 'DELETE' });
      if (!r.ok) return json(502, { error: 'No se pudo eliminar la cuenta.' });
      return json(200, { ok: true });
    }
  } catch (err) {
    console.error('usuarios:', err);
    return json(500, { error: 'Algo falló. Intenta de nuevo.' });
  }
}
