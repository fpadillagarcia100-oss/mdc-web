/**
 * auth.js — Sesión de administrador contra la API de MDC (servidor/Mdc.Api).
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
 * escritura sin un token válido de alguien que la base tenga como admin, sin
 * importar lo que diga el JavaScript del cliente. Poner `isAdmin = true` a
 * mano ahora sólo pinta botones que fallan.
 *
 * ── Dónde vive la sesión ──
 *
 * SÓLO EN MEMORIA. El sitio no escribe nada en el navegador, ni siquiera el
 * token; al recargar la página hay que volver a entrar.
 *
 * Es más incómodo y también más seguro, y en este negocio la segunda parte
 * pesa más: el panel se abre desde la computadora del taller y desde teléfonos
 * que se prestan. Un token guardado sobrevive al cierre del navegador y espera
 * a quien se siente después. Uno en memoria muere con la pestaña.
 *
 * El botón de salir sigue siendo visible de todas formas: cerrar sesión a
 * propósito revoca el token también en el servidor, y eso no lo hace recargar.
 */
'use strict';

/* La sesión, y nada más que aquí. Una variable del módulo: se va con la
   pestaña, no queda copia en ningún sitio del que haya que acordarse. */
let sesionActiva = null;

const auth = {
  /** @returns {{access_token:string, refresh_token:string, expira:number, correo:string}|null} */
  sesion() {
    return sesionActiva;
  },

  guardar(s) {
    sesionActiva = s;
  },

  olvidar() {
    sesionActiva = null;
  },

  /** ¿Hay sesión, aunque el token esté por caducar? */
  haySesion() { return !!this.sesion(); },

  /** El token del enlace de invitación, si se llegó con uno (main.js lo pone). */
  invitacion: null,

  /**
   * Elige la contraseña con el enlace de invitación y deja la sesión abierta.
   * Va aquí y no como función suelta: el contrato de globales del sitio está
   * lleno (tests/arquitectura.test.js), y esto es de la sesión.
   * @throws {Error} con un mensaje ya listo para enseñar al usuario.
   */
  async aceptarInvitacion(token, contrasena) {
    try {
      guardarDeRespuesta(await authFetch('aceptar-invitacion', { token, contrasena }));
    } catch (err) {
      throw new Error(err.estado === 400 ? err.message : 'No se pudo guardar la contraseña. Intenta de nuevo.');
    }
  },
};

/** Petición a /api/auth/ de la API. */
async function authFetch(ruta, cuerpo) {
  if (!BACKEND) throw new Error('Este sitio se compiló sin conexión al servidor.');

  const r = await fetch(`${BACKEND.url}/api/auth/${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(15000),
  });

  const datos = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(datos.error || `HTTP ${r.status}`);
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
    correo: d.usuario?.correo || '',
    rol: d.usuario?.rol || '',
  });
}

/**
 * Inicia sesión con correo y contraseña.
 * @throws {Error} con un mensaje ya listo para enseñar al usuario.
 */
async function iniciarSesion(correo, contrasena) {
  try {
    const d = await authFetch('entrar', { correo, contrasena });
    guardarDeRespuesta(d);
    return true;
  } catch (err) {
    /* El servidor responde lo mismo para "no existe esa cuenta" y para
       "contraseña incorrecta". Eso es correcto —decir cuál de las dos falló
       le confirma a un atacante qué correos están registrados— y aquí se
       respeta en lugar de intentar afinarlo. */
    if (err.estado === 400) throw new Error('Correo o contraseña incorrectos.');
    if (err.estado === 429) throw new Error(err.message || 'Demasiados intentos. Espera un momento.');
    throw new Error('No se pudo entrar: ' + err.message);
  }
}

async function cerrarSesion() {
  const s = auth.sesion();
  auth.olvidar();
  // Se avisa al servidor para invalidar el refresh_token, pero si falla da
  // igual: lo que importa es que este dispositivo ya no lo tiene.
  if (s) {
    try { await authFetch('salir', { refresh_token: s.refresh_token }); } catch {}
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
    const d = await authFetch('renovar', { refresh_token: s.refresh_token });
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
 * No se cree lo que diga el cliente: se le pregunta al servidor, que lee el
 * rol de la base en ese momento. (Supabase hacía esto con una consulta a
 * `perfiles` sin filtrar por id, que con dos cuentas podía contestar con el
 * rol de la otra. /api/auth/yo sólo sabe contestar por quien pregunta.)
 *
 * Es informativo, para decidir qué botones pintar. La seguridad real está en
 * el servidor: aunque esto devolviera `true` por error, cada escritura del
 * panel se vuelve a comprobar contra la base.
 */
async function esAdministrador() {
  const token = await tokenValido();
  if (!token) return false;

  try {
    const r = await fetch(`${BACKEND.url}/api/auth/yo`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return false;
    return (await r.json()).rol === 'admin';
  } catch {
    return false;
  }
}
