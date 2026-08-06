/**
 * exportar-catalogo.js — Trae la base de datos a data/catalogo.json.
 *
 * Es el puente de vuelta, y el que hace que todo esto sirva de algo.
 *
 * La idea: la base de datos manda, pero el sitio sigue siendo estático. En
 * cada despliegue se exporta la base a data/catalogo.json y `npm run build`
 * genera las 18 fichas y el sitemap como hasta ahora. El visitante no habla
 * con ninguna base de datos: recibe HTML ya escrito.
 *
 * Lo que se gana frente a consultar Supabase desde el navegador:
 *   · El sitio no se cae si Supabase se cae.
 *   · No hay que abrir `connect-src` en la CSP.
 *   · Google indexa las fichas: existen como archivos, no como una promesa
 *     de JavaScript.
 *   · Cero peticiones por visita — y cero costo por visita.
 *
 * Lo que cuesta: los cambios se ven al desplegar, no al instante. Para un
 * catálogo de maquinaria, donde los precios cambian por semana y no por
 * minuto, es el intercambio correcto.
 *
 *   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_ANON_KEY=eyJ... npm run db:export
 *
 * Con la llave `anon` se exporta sólo lo publicado — que es exactamente lo
 * que debe salir al sitio. La llave `service_role` NO se usa aquí: no hace
 * falta, y lo que no se usa no se filtra.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DESTINO = path.join(ROOT, 'data', 'catalogo.json');

/* ── Credenciales ──
   Del entorno, o de un .env local que git ya ignora. Nunca del repositorio. */
require('./entorno').cargarEnv();

const URL_BASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const LLAVE = process.env.SUPABASE_ANON_KEY || '';

if (!URL_BASE || !LLAVE) {
  console.error('✗ Faltan credenciales.\n');
  console.error('  Define SUPABASE_URL y SUPABASE_ANON_KEY, o créalas en un archivo .env:\n');
  console.error('    SUPABASE_URL=https://xxxxxxxx.supabase.co');
  console.error('    SUPABASE_ANON_KEY=eyJhbGciOi...\n');
  console.error('  Están en Supabase → Project Settings → API.');
  console.error('  La llave anon es pública por diseño; la service_role NO va aquí.');
  process.exit(1);
}

// Un guardarraíl barato: la llave de servicio se salta todo el RLS. Si acaba
// en un archivo generado, se filtra el catálogo sin publicar — o algo peor.
// Supabase tiene dos generaciones de llaves y hay que reconocer las dos:
// las clásicas (JWT con "service_role" dentro) y las nuevas (`sb_secret_…`).
if (LLAVE.includes('service_role') || LLAVE.startsWith('sb_secret_')) {
  console.error('✗ Eso es una llave de servicio. Aquí va la pública (anon / sb_publishable_…).');
  process.exit(1);
}

const esperar = ms => new Promise(r => setTimeout(r, ms));

/**
 * Consulta con reintentos.
 *
 * Un tropiezo de red de un segundo no debe tumbar un despliegue. Sin esto,
 * el sitio se queda sin publicar por algo que se arregla solo al reintentar,
 * y el mensaje que ve quien despliega —"fetch failed"— no dice qué hacer.
 *
 * Sólo se reintentan los fallos de RED y los errores 5xx del servidor. Un 401
 * o un 404 no mejoran por insistir: son un problema de credenciales o de
 * nombre, y reintentarlos sólo retrasa el diagnóstico.
 */
async function consultar(recurso, intentos = 3) {
  let ultimoError;

  for (let i = 1; i <= intentos; i++) {
    try {
      const r = await fetch(`${URL_BASE}/rest/v1/${recurso}`, {
        headers: { apikey: LLAVE, Authorization: `Bearer ${LLAVE}` },
        signal: AbortSignal.timeout(30000),
      });

      if (r.ok) return r.json();

      const detalle = (await r.text()).slice(0, 300);
      if (r.status < 500) {
        throw new Error(`${recurso} → HTTP ${r.status}: ${detalle}`);
      }
      ultimoError = new Error(`${recurso} → HTTP ${r.status}: ${detalle}`);
    } catch (err) {
      // Un error que ya trae "HTTP 4xx" viene del bloque de arriba: no se
      // reintenta, se propaga tal cual.
      if (/HTTP 4\d\d/.test(err.message)) throw err;
      ultimoError = err;
    }

    if (i < intentos) {
      const espera = i * 2000;   // 2 s, luego 4 s
      console.error(`  ⟳ ${recurso}: ${ultimoError.message}. Reintento ${i + 1}/${intentos} en ${espera / 1000}s…`);
      await esperar(espera);
    }
  }

  throw new Error(`${recurso} falló tras ${intentos} intentos — ${ultimoError.message}`);
}

/** Quita los null que el JSON actual no trae, para no ensuciar el diff. */
const limpiar = (o, campos) => {
  for (const c of campos) if (o[c] === null) delete o[c];
  return o;
};

(async () => {
  const [ajustesFilas, sucursales, equipos] = await Promise.all([
    consultar('ajustes?select=*&limit=1'),
    consultar('sucursales?select=nombre,direccion,telefono,horario&order=orden.asc'),
    consultar('catalogo_publico?select=*'),
  ]);

  if (!ajustesFilas.length) throw new Error('La tabla `ajustes` está vacía. ¿Corriste las migraciones?');
  if (!equipos.length) {
    // Sobrescribir el catálogo con cero equipos dejaría el sitio en blanco.
    // Casi siempre significa que el RLS no deja leer o que nada está
    // publicado — no que de verdad no haya máquinas.
    throw new Error(
      'La consulta devolvió 0 equipos. No se sobrescribe el catálogo.\n' +
      '   Revisa que haya equipos con publicado = true y que la política de lectura exista.'
    );
  }

  const a = ajustesFilas[0];

  const salida = {
    _comentario: 'GENERADO desde la base de datos con `npm run db:export`. La fuente de verdad es Supabase, no este archivo.',
    generado: new Date().toISOString().slice(0, 10),
    ajustes: {
      marca_principal: a.marca_principal,
      marca_acento: a.marca_acento,
      marca_completa: a.marca_completa,
      color_acento: a.color_acento,
      logo: a.logo_url ?? null,
      barra_superior: a.barra_superior,
      hero_etiqueta: a.hero_etiqueta,
      hero_titulo: a.hero_titulo,
      hero_resaltado: a.hero_resaltado,
      hero_texto: a.hero_texto,
      hero_imagen: a.hero_imagen ?? null,
      vendedor: a.vendedor,
      telefono: a.telefono,
      whatsapp: a.whatsapp,
      correo: a.correo,
      horario: a.horario,
      direccion: a.direccion,
      pie_descripcion: a.pie_descripcion,
    },
    sucursales: sucursales.map(s => ({
      name: s.nombre,
      address: s.direccion,
      phone: s.telefono,
      hours: s.horario,
    })),
    equipos: equipos.map(e => limpiar({
      slug: e.slug,
      id: e.id,
      name: e.name,
      brand: e.brand,
      cat: e.cat,
      cond: e.cond,
      price: e.price,
      original: e.original,
      finance: e.finance,
      leasing: e.leasing,
      shipping: e.shipping,
      location: e.location,
      year: e.year,
      specs: e.specs,
      desc: e.desc,
      svgKey: e.svgKey,
      img: e.img,
      hot: e.hot,
    }, [])),
  };

  fs.writeFileSync(DESTINO, JSON.stringify(salida, null, 2) + '\n', 'utf8');
  console.log(`✓ data/catalogo.json — ${salida.equipos.length} equipos, ${salida.sucursales.length} sucursales`);
  console.log('  Ahora corre `npm run build` para regenerar las fichas y el sitemap.');
})().catch(err => {
  console.error('✗ ' + err.message);
  process.exit(1);
});
