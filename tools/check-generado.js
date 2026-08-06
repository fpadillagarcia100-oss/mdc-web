/**
 * check-generado.js — Verifica que lo generado corresponda a los datos actuales.
 *
 * El riesgo que cubre: editas data/catalogo.json, se te olvida ejecutar
 * "npm run build", y publicas. El sitio se ve bien —con los datos viejos— y no
 * hay ningún error que te avise. Ese silencio es el problema.
 *
 * Compara la huella de data/catalogo.json contra la que quedó grabada al
 * generar, y comprueba que cada equipo tenga su página.
 *
 * Se corre con:  npm run test:generado
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const problemas = [];

const fuente = path.join(ROOT, 'data', 'catalogo.json');
const datos = path.join(ROOT, 'assets', 'js', 'catalogo-datos.js');

if (!fs.existsSync(datos)) {
  console.error('Falta assets/js/catalogo-datos.js. Ejecuta: npm run build');
  process.exit(1);
}

/* 1. ¿Coincide la huella? */
const esperada = crypto.createHash('sha256')
  .update(fs.readFileSync(fuente)).digest('hex').slice(0, 16);

const generado = fs.readFileSync(datos, 'utf8');
const encontrada = (/CATALOGO_HUELLA = '([a-f0-9]+)'/.exec(generado) || [])[1];

if (encontrada !== esperada) {
  problemas.push(
    'data/catalogo.json cambió pero no se regeneró el sitio.\n' +
    `    huella del archivo : ${esperada}\n` +
    `    huella de lo generado: ${encontrada || 'ninguna'}\n` +
    '    Solución: npm run build');
}

/* 2. ¿Tiene cada equipo su página? */
const catalogo = JSON.parse(fs.readFileSync(fuente, 'utf8'));
const sinPagina = catalogo.equipos.filter(
  eq => !fs.existsSync(path.join(ROOT, 'equipos', eq.slug, 'index.html')));

if (sinPagina.length) {
  problemas.push(`${sinPagina.length} equipos sin página estática: ` +
    sinPagina.slice(0, 3).map(e => e.slug).join(', ') +
    (sinPagina.length > 3 ? '…' : ''));
}

/* 3. ¿Quedaron páginas de equipos ya dados de baja? */
const dirFichas = path.join(ROOT, 'equipos');
if (fs.existsSync(dirFichas)) {
  const vigentes = new Set(catalogo.equipos.map(e => e.slug));
  const huerfanas = fs.readdirSync(dirFichas).filter(d => !vigentes.has(d));
  if (huerfanas.length) {
    problemas.push(`${huerfanas.length} páginas de equipos que ya no existen: ` +
      huerfanas.slice(0, 3).join(', ') + '. Quedarían publicadas y indexadas.');
  }
}

/* 3.b ¿Cada categoría tiene su página, y sin sobrar ninguna?

   Una categoría sin página es la búsqueda genérica perdida —«excavadora usada
   en chiapas»—, que es de donde llega casi todo el mundo. Y una página de una
   categoría que ya no tiene equipos es peor: queda publicada e indexada
   enseñando una rejilla vacía. */
const slugCategoria = c => String(c)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const porCategoria = new Map();
for (const eq of catalogo.equipos) {
  if (!porCategoria.has(eq.cat)) porCategoria.set(eq.cat, []);
  porCategoria.get(eq.cat).push(eq);
}

const dirCats = path.join(ROOT, 'maquinaria');
for (const [cat, equipos] of porCategoria) {
  const pagina = path.join(dirCats, slugCategoria(cat), 'index.html');
  if (!fs.existsSync(pagina)) {
    problemas.push(`La categoría "${cat}" (${equipos.length} equipos) no tiene página.`);
    continue;
  }
  const html = fs.readFileSync(pagina, 'utf8');
  const faltan = equipos.filter(e => !html.includes(`/equipos/${e.slug}/`));
  if (faltan.length) {
    problemas.push(`La página de "${cat}" no enlaza ${faltan.length} de sus equipos: ` +
      faltan.slice(0, 3).map(e => e.slug).join(', '));
  }
}

if (fs.existsSync(dirCats)) {
  const vigentes = new Set([...porCategoria.keys()].map(slugCategoria));
  const sobran = fs.readdirSync(dirCats).filter(d => !vigentes.has(d));
  if (sobran.length) {
    problemas.push(`${sobran.length} páginas de categorías sin equipos: ${sobran.join(', ')}. ` +
      'Quedarían publicadas y vacías.');
  }
}

/* 4. ¿El sitemap lista todo? */
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const faltanEnSitemap = catalogo.equipos.filter(
  eq => !sitemap.includes(`/equipos/${eq.slug}/`));
if (faltanEnSitemap.length) {
  problemas.push(`${faltanEnSitemap.length} equipos no aparecen en sitemap.xml. Google no los encontrará.`);
}

const catsFuera = [...porCategoria.keys()]
  .filter(c => !sitemap.includes(`/maquinaria/${slugCategoria(c)}/`));
if (catsFuera.length) {
  problemas.push(`${catsFuera.length} categorías no aparecen en sitemap.xml: ${catsFuera.join(', ')}`);
}

/* 5. ¿Cada ficha dice la verdad sobre la disponibilidad y ofrece alternativas?

   La disponibilidad importa porque es lo que Google enseña en los resultados.
   Si una máquina vendida sigue anunciándose como disponible, entran llamadas
   por algo que ya no existe — la peor llamada que puede recibir un vendedor.

   Los equipos similares importan porque quien llega desde Google cae en UNA
   ficha: sin nada más que mirar, se va. */
const ESPERADO = {
  disponible: 'schema.org/InStock',
  apartado:   'schema.org/LimitedAvailability',
  vendido:    'schema.org/SoldOut',
};

for (const eq of catalogo.equipos) {
  const ficha = path.join(dirFichas, eq.slug, 'index.html');
  if (!fs.existsSync(ficha)) continue;
  const html = fs.readFileSync(ficha, 'utf8');

  const debe = ESPERADO[eq.disponibilidad || 'disponible'];
  if (!html.includes(debe)) {
    problemas.push(`${eq.slug}: la ficha no le dice a Google "${eq.disponibilidad || 'disponible'}".`);
  }

  // Con tres equipos o menos no hay nada que sugerir.
  if (catalogo.equipos.length > 3 && !html.includes('class="similar"')) {
    problemas.push(`${eq.slug}: la ficha no ofrece equipos similares.`);
  }

  /* El video y las preguntas viven en la base y viajan al sitio al publicar.
     Que se pierdan por el camino es invisible: la ficha se ve bien, sólo que
     sin lo que más cuesta conseguir. Por eso se comprueba que lleguen. */
  if (eq.video && !html.includes(`data-video="${eq.video}"`)) {
    problemas.push(`${eq.slug}: tiene video en el catálogo pero la ficha no lo incluye.`);
  }

  if (Array.isArray(eq.qa) && eq.qa.length) {
    if (!html.includes('class="fqa"')) {
      problemas.push(`${eq.slug}: tiene ${eq.qa.length} preguntas contestadas y la ficha no las muestra.`);
    }
    if (!html.includes('"FAQPage"')) {
      problemas.push(`${eq.slug}: las preguntas no salen como datos estructurados.`);
    }
  }

  /* Un dato técnico capturado que no llega a los datos estructurados es
     trabajo tirado: es justo lo que permite que un buscador entienda que esa
     máquina pesa 20 toneladas en vez de leer "20 ton" como texto suelto. */
  const tecnicos = Object.keys(eq.atributos || {}).length;
  if (tecnicos && !html.includes('class="ft-tabla"')) {
    problemas.push(`${eq.slug}: tiene ficha técnica capturada y la página no la publica.`);
  }
}

if (problemas.length) {
  console.error('El sitio generado no corresponde a los datos:\n');
  problemas.forEach(p => console.error('  · ' + p));
  process.exit(1);
}

console.log(`Sitio generado al día: ${catalogo.equipos.length} equipos con página y en el sitemap.`);
