/**
 * seguridad.test.js — Comprueba el RLS desde fuera, como lo haría un atacante.
 *
 * BACKEND.md dice: "una política de seguridad que nadie verifica es una
 * suposición, no una protección". Esto la verifica.
 *
 * La clave está en CÓMO se prueba: con la llave pública `anon`, contra la API
 * de verdad, por HTTP. No leyendo el SQL ni consultando el catálogo interno de
 * Postgres. Que una política exista no significa que haga lo que crees —
 * puede sobrar una que la contradiga, o faltar un `with check`. La única
 * comprobación que vale es intentar el ataque y que falle.
 *
 *   npm run test:seguridad
 *
 * Sin credenciales no falla: se salta con un aviso. Así el `npm test` de
 * siempre sigue corriendo en una máquina sin base de datos.
 *
 * ⚠️ Tres pruebas ESCRIBEN en la base (insertan solicitudes de prueba). Contra
 * una base local corren solas. Contra la nube hay que pedirlas a propósito con
 * SEGURIDAD_PERMITIR_ESCRITURA=1 — llenar de basura la tabla de prospectos
 * reales no es algo que deba pasar por descuido.
 */
'use strict';

const fs = require('fs');
const path = require('path');

/* ── Credenciales ── */
const ROOT = path.join(__dirname, '..');
require('../tools/entorno').cargarEnv();

const URL_BASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const LLAVE = process.env.SUPABASE_ANON_KEY || '';

if (!URL_BASE || !LLAVE) {
  console.log('⊘ Pruebas de seguridad omitidas: falta SUPABASE_URL / SUPABASE_ANON_KEY.');
  console.log('  Con la base local corriendo:');
  console.log('    SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=<anon> npm run test:seguridad');
  process.exit(0);
}

const ES_LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)/.test(URL_BASE);
const PUEDE_ESCRIBIR = ES_LOCAL || process.env.SEGURIDAD_PERMITIR_ESCRITURA === '1';

/* ── Motor de pruebas ── */
let pasan = 0, fallan = 0;

async function prueba(nombre, fn) {
  try {
    const detalle = await fn();
    pasan++;
    console.log(`PASA   ${nombre}${detalle ? ' — ' + detalle : ''}`);
  } catch (err) {
    fallan++;
    console.log(`FALLA  ${nombre}\n         ${err.message}`);
  }
}

function afirmar(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

/** Petición con la llave pública. Devuelve estado y cuerpo, sin lanzar. */
async function api(recurso, opciones = {}) {
  const r = await fetch(`${URL_BASE}/rest/v1/${recurso}`, {
    ...opciones,
    headers: {
      apikey: LLAVE,
      Authorization: `Bearer ${LLAVE}`,
      'Content-Type': 'application/json',
      ...(opciones.headers || {}),
    },
  });
  const texto = await r.text();
  let cuerpo;
  try { cuerpo = JSON.parse(texto); } catch { cuerpo = texto; }
  return { estado: r.status, ok: r.ok, cuerpo };
}

/** Un rechazo válido es 401/403/404, o un 400 por violar una restricción. */
const fueRechazado = r => !r.ok;
const resumen = r => `HTTP ${r.estado}${r.cuerpo?.message ? ' · ' + String(r.cuerpo.message).slice(0, 80) : ''}`;

(async () => {
  console.log(`\nProbando ${URL_BASE} con la llave pública (anon)`);
  console.log(ES_LOCAL ? '(base local — se incluyen las pruebas de escritura)\n'
                       : `(base remota — escritura ${PUEDE_ESCRIBIR ? 'HABILITADA' : 'omitida'})\n`);

  /* ── Antes de nada: ¿hay alguien del otro lado? ──
     Sin esto, una base apagada produce 16 "FALLA" idénticos y el informe
     parece un desastre de seguridad. Enseñar a la gente que las fallas rojas
     son ruido es peor que no tener pruebas: el día que una sea real, nadie
     la va a mirar. Una base inalcanzable no es una prueba fallida. */
  try {
    await fetch(`${URL_BASE}/rest/v1/`, { headers: { apikey: LLAVE } });
  } catch (err) {
    console.error(`✗ No hay respuesta en ${URL_BASE} — ${err.message}\n`);
    console.error('  Esto NO significa que la seguridad falle: significa que no hay base que probar.');
    console.error('  Levántala con `npm run db:local`, o apunta a la de la nube.');
    process.exit(1);
  }

  /* ── Lo que SÍ debe funcionar ──
     Tan importante como lo que debe fallar: una base que lo niega todo
     también está mal, y esa avería se ve como "el sitio no carga". */

  await prueba('El catálogo publicado es legible', async () => {
    const r = await api('equipos?select=slug,publicado');
    afirmar(r.ok, `el público no puede leer el catálogo: ${resumen(r)}`);
    afirmar(Array.isArray(r.cuerpo) && r.cuerpo.length > 0, 'devolvió 0 equipos');
    return `${r.cuerpo.length} equipos`;
  });

  await prueba('Sólo salen los equipos publicados', async () => {
    const r = await api('equipos?select=slug,publicado');
    afirmar(r.ok, resumen(r));
    const filtrados = r.cuerpo.filter(e => e.publicado !== true);
    afirmar(filtrados.length === 0,
      `${filtrados.length} equipos SIN publicar son visibles al público`);
  });

  await prueba('Los ajustes y las sucursales son públicos', async () => {
    const a = await api('ajustes?select=marca_completa&limit=1');
    const s = await api('sucursales?select=nombre');
    afirmar(a.ok && s.ok, `ajustes ${a.estado}, sucursales ${s.estado}`);
  });

  /* ── Lo que NO debe funcionar ── */

  await prueba('⚠️ Las solicitudes NO se pueden leer', async () => {
    const r = await api('solicitudes?select=nombre,telefono,correo');
    // Dos desenlaces aceptables: rechazo, o lista vacía (el RLS filtra todo).
    // Lo inaceptable es que devuelva datos de clientes.
    if (r.ok) {
      afirmar(Array.isArray(r.cuerpo) && r.cuerpo.length === 0,
        `¡FUGA DE DATOS PERSONALES! Se leyeron ${r.cuerpo.length} solicitudes con la llave pública`);
      return 'devuelve 0 filas';
    }
    return resumen(r);
  });

  await prueba('La bitácora NO se puede leer', async () => {
    const r = await api('bitacora?select=*');
    if (r.ok) afirmar(r.cuerpo.length === 0, `se leyeron ${r.cuerpo.length} registros de bitácora`);
    return r.ok ? 'devuelve 0 filas' : resumen(r);
  });

  await prueba('Los perfiles del personal NO se pueden leer', async () => {
    const r = await api('perfiles?select=id,nombre,rol');
    if (r.ok) afirmar(r.cuerpo.length === 0, `se leyeron ${r.cuerpo.length} perfiles`);
    return r.ok ? 'devuelve 0 filas' : resumen(r);
  });

  await prueba('No se puede dar de alta un equipo', async () => {
    const r = await api('equipos', {
      method: 'POST',
      body: JSON.stringify({
        slug: 'equipo-de-prueba-de-seguridad', nombre: 'Intruso', marca: 'X',
        categoria: 'X', condicion: 'Nuevo', precio_cents: 1, ubicacion: 'X', anio: 2025,
      }),
    });
    afirmar(fueRechazado(r), '¡se insertó un equipo con la llave pública!');
    return resumen(r);
  });

  await prueba('No se puede cambiar un precio', async () => {
    const r = await api('equipos?slug=eq.excavadora-cat-320-gc', {
      method: 'PATCH',
      body: JSON.stringify({ precio_cents: 1 }),
    });
    // PostgREST devuelve 204 aunque no toque nada si el RLS filtra la fila.
    // Por eso no basta el código: hay que releer el precio.
    const despues = await api('equipos?slug=eq.excavadora-cat-320-gc&select=precio_cents');
    if (despues.ok && despues.cuerpo.length) {
      afirmar(despues.cuerpo[0].precio_cents !== 1, '¡EL PRECIO SE MODIFICÓ con la llave pública!');
    }
    return resumen(r);
  });

  await prueba('No se puede publicar un borrador', async () => {
    const r = await api('equipos?publicado=eq.false', {
      method: 'PATCH',
      body: JSON.stringify({ publicado: true }),
    });
    const borradores = await api('equipos?publicado=eq.false&select=slug');
    afirmar(!borradores.ok || borradores.cuerpo.length === 0 || fueRechazado(r),
      'se pudieron publicar borradores');
    return resumen(r);
  });

  await prueba('No se puede borrar un equipo', async () => {
    const antes = await api('equipos?select=slug');
    await api('equipos?slug=eq.excavadora-cat-320-gc', { method: 'DELETE' });
    const despues = await api('equipos?select=slug');
    afirmar(despues.cuerpo.length === antes.cuerpo.length,
      `¡SE BORRÓ UN EQUIPO! quedaban ${antes.cuerpo.length}, ahora ${despues.cuerpo.length}`);
    return `siguen ${despues.cuerpo.length} equipos`;
  });

  await prueba('No se puede subir un archivo al almacenamiento', async () => {
    const r = await fetch(`${URL_BASE}/storage/v1/object/equipos/prueba-seguridad.txt`, {
      method: 'POST',
      headers: { apikey: LLAVE, Authorization: `Bearer ${LLAVE}`, 'Content-Type': 'text/plain' },
      body: 'esto no debería subirse',
    });
    afirmar(!r.ok, '¡se subió un archivo con la llave pública! El bucket está abierto a escritura.');
    return `HTTP ${r.status}`;
  });

  /* ── Pruebas que escriben ── */

  if (!PUEDE_ESCRIBIR) {
    console.log('\n⊘ Pruebas de escritura omitidas (base remota).');
    console.log('  Para incluirlas: SEGURIDAD_PERMITIR_ESCRITURA=1 npm run test:seguridad');
    console.log('  Insertan solicitudes de prueba en la tabla real de prospectos.\n');
  } else {
    /* Un teléfono DISTINTO por comprobación, todos con el prefijo 999.
       No es manía de orden: el freno de spam corta a la cuarta solicitud del
       mismo número. Con un solo teléfono, la prueba del carrito gigante sería
       la cuarta y saldría rechazada por el límite de ráfaga, no por el tope
       de tamaño — pasaría en verde sin haber probado nada.

       Una prueba que pasa por el motivo equivocado es peor que una que falla:
       la que falla se investiga. */
    const TEL = {
      formulario: '9990000001',
      fecha:      '9990000002',
      estado:     '9990000003',
      carrito:    '9990000004',
      rafaga:     '9990000005',
    };

    /* `return=minimal` NO es un detalle de estilo — es obligatorio.

       Con `Prefer: return=representation`, PostgREST hace INSERT ... RETURNING,
       y devolver la fila exige permiso de SELECT. El público no lo tiene sobre
       `solicitudes` (para eso está la política que impide leer la cartera de
       clientes), así que la inserción entera se rechaza con un error de RLS.

       Consecuencia para el sitio: el formulario de cotización DEBE enviar con
       `return=minimal`. Si pide la fila de vuelta, el visitante ve "error al
       enviar" aunque las políticas estén perfectas — y el diagnóstico es
       engañoso, porque el mensaje culpa al RLS de la tabla. */
    await prueba('Se puede enviar una solicitud (el formulario funciona)', async () => {
      const r = await api('solicitudes', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          tipo: 'cotizacion', nombre: 'Prueba de seguridad', telefono: TEL.formulario,
          mensaje: 'Generada por tests/seguridad.test.js',
        }),
      });
      afirmar(r.ok, `el formulario está roto: ${resumen(r)}`);
      return resumen(r);
    });

    await prueba('El público no puede pedir de vuelta la fila insertada', async () => {
      // Que esto falle es lo correcto: si devolviera la fila, bastaría insertar
      // para empezar a leer la tabla de prospectos.
      const r = await api('solicitudes', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          tipo: 'cotizacion', nombre: 'Prueba retorno', telefono: TEL.estado,
        }),
      });
      afirmar(fueRechazado(r), '¡devolvió la fila insertada al público!');
      return resumen(r);
    });

    /* ⚠️ La comprobación del arreglo importante, y hay que hacerla a ciegas.

       Lo natural sería insertar con una fecha falsa y releer qué se guardó —
       pero el público no puede leer `solicitudes`, y así debe seguir. Hay que
       deducirlo desde fuera:

         · Se insertan 3 solicitudes con creado_en = 2020, todas del mismo
           teléfono.
         · Se intenta la cuarta.

       Si el servidor hubiera respetado las fechas del cliente, esas 3 estarían
       en 2020, el conteo de "últimos 10 minutos" daría cero y la cuarta
       pasaría — que es exactamente el agujero que se cerró.

       Que la cuarta sea rechazada demuestra que el servidor pisó las fechas.  */
    await prueba('⚠️ El cliente NO puede falsear la fecha (freno de spam)', async () => {
      for (let i = 0; i < 3; i++) {
        const previa = await api('solicitudes', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            tipo: 'cotizacion', nombre: `Prueba fecha ${i}`, telefono: TEL.fecha,
            creado_en: '2020-01-01T00:00:00Z',
          }),
        });
        afirmar(previa.ok, `no se pudo preparar la prueba: ${resumen(previa)}`);
      }

      const cuarta = await api('solicitudes', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          tipo: 'cotizacion', nombre: 'Prueba fecha 4', telefono: TEL.fecha,
          creado_en: '2020-01-01T00:00:00Z',
        }),
      });

      afirmar(fueRechazado(cuarta),
        '¡el servidor aceptó la fecha del cliente! Mandando creado_en en el pasado, ' +
        'el límite de 3 por teléfono no cuenta nada y se puede insertar sin tope.');
      return 'el servidor impone la fecha — ' + resumen(cuarta);
    });

    await prueba('⚠️ Un carrito gigante es rechazado', async () => {
      const enorme = Array.from({ length: 5000 }, (_, i) => ({
        slug: 'x'.repeat(200), n: i,
      }));
      const r = await api('solicitudes', {
        method: 'POST',
        body: JSON.stringify({
          tipo: 'cotizacion', nombre: 'Prueba carrito', telefono: TEL.carrito, carrito: enorme,
        }),
      });
      afirmar(fueRechazado(r),
        '¡se aceptó un carrito de cientos de KB! Cualquiera puede llenar la base hasta agotar la cuota.');
      return resumen(r);
    });

    await prueba('El freno de spam corta a la cuarta seguida', async () => {
      let ultima;
      for (let i = 0; i < 5; i++) {
        ultima = await api('solicitudes', {
          method: 'POST',
          body: JSON.stringify({
            tipo: 'cotizacion', nombre: `Ráfaga ${i}`, telefono: TEL.rafaga,
          }),
        });
        if (!ultima.ok) break;
      }
      afirmar(fueRechazado(ultima), 'se aceptaron 5 solicitudes seguidas del mismo teléfono');
      return resumen(ultima);
    });

    // No se pueden contar desde aquí: el RLS las esconde, que es justo lo que
    // debe pasar. Se avisa a ciegas.
    console.log(`\n  Nota: quedaron solicitudes de prueba con teléfonos ${Object.values(TEL)[0]}–${Object.values(TEL).at(-1)}.`);
    console.log('  Fíltralas por "999" en el panel y márcalas como spam (no se borran, por diseño).');
  }

  console.log(`\n${pasan}/${pasan + fallan} comprobaciones de seguridad pasaron`);
  if (fallan) {
    console.log('\n✗ Hay políticas que no protegen lo que deberían. No despliegues así.');
    process.exit(1);
  }
})().catch(err => {
  console.error(`\n✗ No se pudo completar la revisión: ${err.message}`);
  console.error('  ¿Está corriendo la base? ¿Son correctas las credenciales?');
  process.exit(1);
});
