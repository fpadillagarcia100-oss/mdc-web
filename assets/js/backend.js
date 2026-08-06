/**
 * backend.js — Registra las solicitudes en la base de datos.
 *
 * Es lo único del sitio público que habla con Supabase. Todo lo demás
 * (catálogo, precios, sucursales) viaja dentro del sitio, escrito al
 * desplegar. Aquí no se puede: una cotización nace en el navegador del
 * cliente y tiene que llegar a algún lado en ese momento.
 *
 * ── La regla que gobierna este archivo ──
 *
 * WhatsApp SIEMPRE se abre, guarde o no la base.
 *
 * Registrar es una mejora, no un requisito. Si Supabase está caído, si el
 * cliente tiene mala señal, si la llave caducó — el cliente no se entera y su
 * mensaje sale igual. Al revés estaría mal: convertir un canal que funciona
 * desde hace meses en algo que depende de un servicio nuevo sería cambiar una
 * venta por un renglón en una tabla.
 *
 * ── Por qué la llave está a la vista ──
 *
 * Es la llave `publishable`, diseñada para viajar en el navegador. Cualquiera
 * puede leerla en el código fuente. Lo que impide que sirva para algo son las
 * políticas RLS de la base: con ella se puede INSERTAR una solicitud y nada
 * más. Leer la cartera de clientes, cambiar precios o borrar equipos está
 * cerrado, y se comprueba en tests/seguridad.test.js.
 */
'use strict';

/* La configuración la inyecta tools/build.js desde las variables de entorno.
   Si no está —desarrollo local sin credenciales—, esto queda en null y el
   sitio funciona exactamente como antes: sólo WhatsApp. */
const BACKEND = (typeof BACKEND_CONFIG !== 'undefined' && BACKEND_CONFIG) || null;

/**
 * Guarda una solicitud. Nunca lanza: devuelve true/false.
 *
 * Que no lance es deliberado. Quien la llama está a punto de abrir WhatsApp y
 * no debe tener que envolver nada en try/catch para no romper ese camino.
 *
 * @param {object} s
 * @param {'cotizacion'|'publicacion'} s.tipo
 * @param {string} s.nombre
 * @param {string} s.telefono   10 dígitos
 * @param {string} [s.correo]
 * @param {string} [s.empresa]
 * @param {string} [s.mensaje]
 * @param {Array}  [s.carrito]  equipos solicitados
 * @returns {Promise<boolean>}
 */
async function registrarSolicitud(s) {
  // Sin credenciales, o en un entorno sin fetch (las pruebas con jsdom), no hay
  // nada que intentar. Devolver false en silencio es lo correcto: quien llama
  // ya tiene su camino de WhatsApp asegurado.
  if (!BACKEND || typeof fetch !== 'function') return false;

  try {
    const r = await fetch(`${BACKEND.url}/rest/v1/solicitudes`, {
      method: 'POST',
      headers: {
        apikey: BACKEND.llave,
        Authorization: `Bearer ${BACKEND.llave}`,
        'Content-Type': 'application/json',
        /* `return=minimal` NO es optimización: es obligatorio.

           Con `return=representation`, PostgREST hace INSERT ... RETURNING, y
           devolver la fila exige permiso de LECTURA sobre `solicitudes` — que
           el público no tiene, precisamente para que nadie descargue la lista
           de clientes. La inserción entera se rechazaría.

           El error diría "violates row-level security policy", que suena a
           política de INSERT mal puesta. No lo es. Se pierden horas ahí. */
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        tipo: s.tipo,
        nombre: s.nombre,
        telefono: s.telefono,
        correo: s.correo || null,
        empresa: s.empresa || null,
        mensaje: s.mensaje || '',
        carrito: Array.isArray(s.carrito) ? s.carrito : [],
        // `estado` y `creado_en` NO se mandan: los impone el servidor. Mandarlos
        // sería darle al cliente control sobre datos que deciden permisos.
      }),
      // Una solicitud colgada no puede dejar al cliente esperando: a los 8
      // segundos se abandona y se sigue a WhatsApp.
      signal: AbortSignal.timeout(8000),
    });

    if (!r.ok && window.console) {
      console.warn('[MDC] La solicitud no se registró:', r.status);
    }
    return r.ok;
  } catch (err) {
    if (window.console) console.warn('[MDC] No se pudo registrar la solicitud:', err.message);
    return false;
  }
}


/**
 * Suma una vista o una cotización a un equipo.
 *
 * Nunca espera, nunca avisa, nunca falla hacia fuera. Contar es lo último que
 * importa de la página: si el contador se cae, el cliente no debe enterarse
 * ni esperar un milisegundo por ello.
 *
 * No hay cookies ni identificación. Sólo se suma uno a un contador por
 * equipo — no se puede saber quién miró, sólo cuántas veces se miró.
 *
 * @param {string} slug   dirección del equipo
 * @param {'vista'|'cotizacion'} tipo
 */
function contar(slug, tipo) {
  if (!BACKEND || typeof fetch !== 'function' || !slug) return;

  fetch(`${BACKEND.url}/rest/v1/rpc/contar`, {
    method: 'POST',
    headers: {
      apikey: BACKEND.llave,
      Authorization: `Bearer ${BACKEND.llave}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_slug: slug, p_tipo: tipo }),
    /* `keepalive` deja que la petición termine aunque la persona cierre la
       pestaña justo después. Sin esto se perderían precisamente las visitas
       de quien mira y se va — que son la mayoría. */
    keepalive: true,
  }).catch(() => {});
}
