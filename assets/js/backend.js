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
    /* Un 4xx es un dato que la base rechaza: reintentarlo daría lo mismo mil
       veces. Un 5xx es el servidor teniendo un mal momento, y eso sí vale la
       pena volver a intentarlo más tarde. */
    if (!r.ok && r.status >= 500) encolarSolicitud(s);
    return r.ok;
  } catch (err) {
    if (window.console) console.warn('[MDC] No se pudo registrar la solicitud:', err.message);
    // Se cayó la red o se agotó el plazo: la solicitud no se pierde, espera.
    encolarSolicitud(s);
    return false;
  }
}


/* ── COLA DE SOLICITUDES SIN SEÑAL ───────────────────────────────────────────
 *
 * El caso real: el vendedor está en obra, el cliente le pide precio, llena la
 * cotización y no hay datos. Hasta ahora esa solicitud se perdía y sólo
 * quedaba el mensaje de WhatsApp — que tampoco sale sin señal.
 *
 * Ahora espera en el teléfono y se manda sola en cuanto vuelve la red.
 *
 * Lo que esto NO garantiza: que no se duplique. Si el servidor recibió la
 * solicitud pero la respuesta se perdió en el camino, al reintentar entra dos
 * veces. Se acepta a sabiendas: una solicitud repetida se ve de un vistazo en
 * la bandeja y se descarta en dos segundos; una perdida es un cliente que se
 * fue con otro y del que nunca te enteras.
 */
const TOPE_COLA = 20;

/* La cola vive EN MEMORIA, como todo lo demás en este sitio.
 *
 * Hay que decir lo que eso cuesta, porque es la única pérdida real de no
 * escribir en el navegador: la solicitud espera mientras la pestaña siga
 * abierta y se manda sola en cuanto vuelva la red. Si se cierra antes, se
 * pierde.
 *
 * Lo que la salva en la práctica es que el móvil no cierra las pestañas al
 * bloquearse: el vendedor llena la cotización, guarda el teléfono, sigue con
 * la visita y al recuperar señal sale sola. Lo que ya no aguanta es reiniciar
 * el teléfono o cerrar la pestaña a mano.
 */
let colaSolicitudes = [];

function leerCola() {
  return colaSolicitudes;
}

function encolarSolicitud(s) {
  if (!BACKEND) return;
  // Se guarda cuándo se llenó: al llegar tarde a la bandeja, la hora del
  // servidor diría "hoy" cuando en realidad se pidió anteayer en la sierra.
  colaSolicitudes.push({ ...s, encoladaEn: new Date().toISOString() });
  colaSolicitudes = colaSolicitudes.slice(-TOPE_COLA);
}

/**
 * Intenta mandar lo que quedó pendiente. Se llama al volver la red y al abrir.
 *
 * Cada una se saca de la cola SÓLO si el servidor la aceptó. Y se reescribe la
 * cola completa al final, no dentro del bucle: si el cliente cierra la página
 * a media tanda, lo peor que pasa es que se reintente algo ya enviado.
 */
async function vaciarColaSolicitudes() {
  if (!BACKEND || typeof fetch !== 'function' || navigator.onLine === false) return;

  const cola = leerCola();
  if (!cola.length) return;

  const pendientes = [];
  let enviadas = 0;

  for (const s of cola) {
    try {
      const r = await fetch(`${BACKEND.url}/rest/v1/solicitudes`, {
        method: 'POST',
        headers: {
          apikey: BACKEND.llave,
          Authorization: `Bearer ${BACKEND.llave}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          tipo: s.tipo,
          nombre: s.nombre,
          telefono: s.telefono,
          correo: s.correo || null,
          empresa: s.empresa || null,
          mensaje: s.encoladaEn
            ? `${s.mensaje || ''}\n\n[Se llenó sin señal el ${s.encoladaEn}]`.trim()
            : (s.mensaje || ''),
          carrito: Array.isArray(s.carrito) ? s.carrito : [],
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) { enviadas++; continue; }
      if (r.status >= 500) pendientes.push(s);   // el 4xx no se reintenta jamás
    } catch {
      pendientes.push(s);                        // sigue sin red: que espere
    }
  }

  colaSolicitudes = pendientes;

  if (enviadas && typeof showToast === 'function') {
    showToast(enviadas === 1
      ? 'Se envió la cotización que quedó pendiente sin señal.'
      : `Se enviaron ${enviadas} cotizaciones que quedaron pendientes.`);
  }
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('online', vaciarColaSolicitudes);
  // También al abrir: la señal pudo volver con la página cerrada.
  window.addEventListener('load', ()=> setTimeout(vaciarColaSolicitudes, 2500));
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


/**
 * Deja una pregunta pública sobre un equipo.
 *
 * ── Por qué ésta SÍ avisa si falla, al revés que las otras dos ──
 *
 * Registrar una solicitud y contar una vista ocurren detrás de algo que el
 * cliente ya vio funcionar: su mensaje de WhatsApp salió, su ficha se abrió.
 * Que fallen en silencio es lo correcto.
 *
 * Una pregunta no tiene otro camino. Alguien escribió tres renglones y le dio
 * a enviar; si esto falla callado, se queda esperando una respuesta que nunca
 * va a llegar porque la pregunta no existe en ningún lado. Aquí el silencio
 * sería mentir.
 *
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function preguntar(slug, nombre, pregunta) {
  if (!BACKEND || typeof fetch !== 'function') {
    return { ok: false, error: 'Las preguntas no están disponibles ahora. Escríbenos por WhatsApp.' };
  }

  try {
    const r = await fetch(`${BACKEND.url}/rest/v1/rpc/preguntar`, {
      method: 'POST',
      headers: {
        apikey: BACKEND.llave,
        Authorization: `Bearer ${BACKEND.llave}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_slug: slug, p_nombre: nombre, p_pregunta: pregunta }),
      signal: AbortSignal.timeout(10000),
    });

    if (r.ok) return { ok: true };

    /* Los mensajes de la función están escritos para leerse tal cual ("Espera
       unos minutos", "Escribe tu nombre"): se validan en el servidor porque es
       el único sitio donde la validación cuenta, y se redactan pensando en que
       van a acabar delante de una persona. */
    const d = await r.json().catch(() => ({}));
    return { ok: false, error: d.message || 'No se pudo enviar tu pregunta. Inténtalo de nuevo.' };
  } catch {
    return { ok: false, error: 'No se pudo enviar tu pregunta. Revisa tu conexión.' };
  }
}
