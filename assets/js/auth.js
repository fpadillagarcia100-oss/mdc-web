/**
 * auth.js — Sesión de administrador contra Supabase.
 *
 * ── Qué cambia respecto al PIN ──
 *
 * El PIN se comparaba en el navegador. Eso nunca fue una barrera de
 * seguridad: cualquiera con las herramientas de desarrollador podía poner
 * `isAdmin = true` y entrar al panel. Lo que impedía el destrozo no era el
 * PIN, era que los cambios sólo tocaban el localStorage de esa persona.
 *
 * Ahora el panel escribe en una base compartida, así que la puerta tiene que
 * ser de verdad. Y lo es por dónde se comprueba: el servidor no acepta una
 * escritura sin un token válido, sin importar lo que diga el JavaScript del
 * cliente. Poner `isAdmin = true` a mano ahora sólo pinta botones que fallan.
 *
 * ── Dónde vive la sesión ──
 *
 * En localStorage, para no tener que escribir la contraseña en cada visita.
 * A cambio, el token sobrevive al cierre del navegador: en una computadora
 * compartida hay que cerrar sesión, no sólo cerrar la pestaña. Por eso el
 * botón de salir es visible y no está escondido en un menú.
 *
 * No se usa la librería oficial de Supabase: la CSP sólo permite scripts del
 * propio sitio, y añadir un CDN abriría esa puerta para ahorrar 80 líneas.
 * No vale el cambio.
 */
'use strict';

const AUTH_LLAVE = 'mdc_sesion';

const auth = {
  /** @returns {{access_token:string, refresh_token:string, expira:number, correo:string}|null} */
  sesion() {
    try { return JSON.parse(localStorage.getItem(AUTH_LLAVE)) || null; }
    catch { return null; }
  },

  guardar(s) {
    try { localStorage.setItem(AUTH_LLAVE, JSON.stringify(s)); } catch {}
  },

  olvidar() {
    try { localStorage.removeItem(AUTH_LLAVE); } catch {}
  },

  /** ¿Hay sesión, aunque el token esté por caducar? */
  haySesion() { return !!this.sesion(); },
};

/** Petición a la API de autenticación de Supabase. */
async function authFetch(ruta, cuerpo) {
  if (!BACKEND) throw new Error('Este sitio se compiló sin conexión a la base de datos.');

  const r = await fetch(`${BACKEND.url}/auth/v1/${ruta}`, {
    method: 'POST',
    headers: { apikey: BACKEND.llave, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(15000),
  });

  const datos = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(datos.error_description || datos.msg || datos.message || `HTTP ${r.status}`);
    e.estado = r.status;
    throw e;
  }
  return datos;
}

function guardarDeRespuesta(d) {
  auth.guardar({
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    // Se renueva un minuto ANTES de caducar. Renovar justo al filo deja una
    // ventana en la que la petición sale con un token recién vencido.
    expira: Date.now() + (d.expires_in - 60) * 1000,
    correo: d.user?.email || '',
  });
}

/**
 * Inicia sesión con correo y contraseña.
 * @throws {Error} con un mensaje ya listo para enseñar al usuario.
 */
async function iniciarSesion(correo, contrasena) {
  try {
    const d = await authFetch('token?grant_type=password', { email: correo, password: contrasena });
    guardarDeRespuesta(d);
    return true;
  } catch (err) {
    /* El mensaje que devuelve Supabase es el mismo para "no existe esa cuenta"
       y para "contraseña incorrecta". Eso es correcto —decir cuál de las dos
       falló le confirma a un atacante qué correos están registrados— y aquí se
       respeta en lugar de intentar afinarlo. */
    if (err.estado === 400) throw new Error('Correo o contraseña incorrectos.');
    if (err.estado === 429) throw new Error('Demasiados intentos. Espera un momento.');
    throw new Error('No se pudo entrar: ' + err.message);
  }
}

async function cerrarSesion() {
  const s = auth.sesion();
  auth.olvidar();
  // Se avisa al servidor para invalidar el refresh_token, pero si falla da
  // igual: lo que importa es que este dispositivo ya no lo tiene.
  if (s) {
    try {
      await fetch(`${BACKEND.url}/auth/v1/logout`, {
        method: 'POST',
        headers: { apikey: BACKEND.llave, Authorization: `Bearer ${s.access_token}` },
      });
    } catch {}
  }
}

/**
 * Devuelve un token válido, renovándolo si hace falta.
 * @returns {Promise<string|null>} null si no hay sesión o ya no se puede renovar.
 */
async function tokenValido() {
  const s = auth.sesion();
  if (!s) return null;
  if (Date.now() < s.expira) return s.access_token;

  try {
    const d = await authFetch('token?grant_type=refresh_token', { refresh_token: s.refresh_token });
    guardarDeRespuesta(d);
    return d.access_token;
  } catch {
    // El refresh_token caducó o fue revocado: la sesión terminó de verdad.
    auth.olvidar();
    return null;
  }
}

/**
 * ¿La sesión actual es de un administrador?
 *
 * No se cree lo que diga el cliente: se le pregunta a la base. La tabla
 * `perfiles` sólo deja ver el perfil propio, así que esta consulta devuelve
 * exactamente una fila —la de quien pregunta— o ninguna.
 *
 * Es informativo, para decidir qué botones pintar. La seguridad real está en
 * las políticas del servidor: aunque esto devolviera `true` por error, la
 * base seguiría rechazando cada escritura.
 */
async function esAdministrador() {
  const token = await tokenValido();
  if (!token) return false;

  try {
    const r = await fetch(`${BACKEND.url}/rest/v1/perfiles?select=rol&limit=1`, {
      headers: { apikey: BACKEND.llave, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return false;
    const filas = await r.json();
    return filas[0]?.rol === 'admin';
  } catch {
    return false;
  }
}
