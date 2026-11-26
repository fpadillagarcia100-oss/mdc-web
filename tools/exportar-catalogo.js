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
 * La base es el SQL Server de la oficina, y se lee por la API
 * (GET /api/catalogo), a través de Cloudflare Tunnel. Lo que se gana frente a
 * consultarla desde el navegador de cada visitante:
 *   · El sitio no se cae si la computadora de la oficina se apaga: sigue
 *     enseñando lo último que se publicó.
 *   · Google indexa las fichas: existen como archivos, no como una promesa
 *     de JavaScript.
 *   · Cero peticiones por visita a la oficina, que tiene el internet que tiene.
 *
 * Lo que cuesta: los cambios se ven al desplegar, no al instante. Para un
 * catálogo de maquinaria, donde los precios cambian por semana y no por
 * minuto, es el intercambio correcto. Y si al desplegar la oficina no
 * contesta, el despliegue falla y Cloudflare sigue sirviendo el anterior:
 * nunca se publica un sitio vacío.
 *
 *   API_URL=https://api.mdcmaquinaria.com npm run db:export
 *
 * No hace falta ninguna llave: /api/catalogo sólo devuelve lo publicado, que
 * es exactamente lo que ya está a la vista en el sitio.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DESTINO = path.join(ROOT, 'data', 'catalogo.json');

/* ── Dónde está el servidor ──
   Del entorno, o de un .env local que git ya ignora. */
let servidor;
try {
  servidor = require('./entorno').servidor();
} catch (err) {
  console.error('✗ ' + err.message);
  process.exit(1);
}
if (!servidor) {
  console.error('✗ Falta la dirección del servidor.\n');
  console.error('  Define API_URL, o escríbela en un archivo .env:\n');
  console.error('    API_URL=https://api.mdcmaquinaria.com\n');
  process.exit(1);
}
const URL_BASE = servidor.url;

const esperar = ms => new Promise(r => setTimeout(r, ms));

/**
 * Consulta con reintentos.
 *
 * Un tropiezo de red de un segundo no debe tumbar un despliegue. Sin esto,
 * el sitio se queda sin publicar por algo que se arregla solo al reintentar,
 * y el mensaje que ve quien despliega —"fetch failed"— no dice qué hacer.
 *
 * Sólo se reintentan los fallos de RED y los errores 5xx del servidor (530 es
 * el de Cloudflare cuando el túnel no encuentra la oficina: puede ser un
 * reinicio de dos segundos). Un 404 no mejora por insistir.
 */
async function consultar(recurso, intentos = 3) {
  let ultimoError;

  for (let i = 1; i <= intentos; i++) {
    try {
      const r = await fetch(`${URL_BASE}/api/${recurso}`, { signal: AbortSignal.timeout(30000) });

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

  throw new Error(
    `${recurso} falló tras ${intentos} intentos — ${ultimoError.message}\n` +
    '   ¿Está encendida la computadora de la oficina, con el servicio MdcApi y el túnel corriendo?'
  );
}

/** Quita los null que el JSON actual no trae, para no ensuciar el diff. */
const limpiar = (o, campos) => {
  for (const c of campos) if (o[c] === null) delete o[c];
  return o;
};

(async () => {
  /* Todo en una sola petición: lo publicado del catálogo, los ajustes, las
     sucursales y las preguntas contestadas y publicadas. El servidor ya filtra;
     abajo se vuelve a comprobar lo que no puede faltar. */
  const { ajustes: ajustesFilas, sucursales, equipos, preguntas } = await consultar('catalogo');

  /* Agrupadas por equipo antes de armar la salida: recorrer la lista entera
     por cada máquina sería cuadrático y, con el tiempo, lento sin motivo. */
  const qaPorSlug = new Map();
  for (const q of preguntas) {
    if (!qaPorSlug.has(q.slug)) qaPorSlug.set(q.slug, []);
    qaPorSlug.get(q.slug).push({
      nombre: q.nombre,
      pregunta: q.pregunta,
      respuesta: q.respuesta,
      fecha: q.respondida_en ? q.respondida_en.slice(0, 10) : null,
    });
  }

  if (!ajustesFilas.length) throw new Error('La tabla `ajustes` está vacía. ¿Corriste las migraciones?');
  if (!equipos.length) {
    // Sobrescribir el catálogo con cero equipos dejaría el sitio en blanco.
    // Casi siempre significa que nada está publicado, o que la API apunta a
    // una base vacía — no que de verdad no haya máquinas.
    throw new Error(
      'La consulta devolvió 0 equipos. No se sobrescribe el catálogo.\n' +
      '   Revisa que haya equipos publicados y que el servidor use la base correcta (MdcMaquinaria).'
    );
  }

  const a = ajustesFilas[0];

  const salida = {
    _comentario: 'GENERADO desde la base de datos con `npm run db:export`. La fuente de verdad es la base (SQL Server), no este archivo.',
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
      imgs: Array.isArray(e.imgs) ? e.imgs : (e.img ? [e.img] : []),
      disponibilidad: e.disponibilidad || 'disponible',
      video: e.video || null,
      atributos: e.atributos && typeof e.atributos === 'object' ? e.atributos : {},
      qa: qaPorSlug.get(e.slug) || [],
      hot: e.hot,
    }, ['video'])),
  };

  fs.writeFileSync(DESTINO, JSON.stringify(salida, null, 2) + '\n', 'utf8');
  console.log(`✓ data/catalogo.json — ${salida.equipos.length} equipos, ${salida.sucursales.length} sucursales, ` +
    `${preguntas.length} preguntas contestadas`);
  console.log('  Ahora corre `npm run build` para regenerar las fichas y el sitemap.');
})().catch(err => {
  console.error('✗ ' + err.message);
  process.exit(1);
});
