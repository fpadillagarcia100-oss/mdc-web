/**
 * build.js — Genera el sitio a partir de los datos del catálogo.
 *
 * Produce tres cosas:
 *
 *   1. assets/js/catalogo-datos.js  — los datos que consume la aplicación.
 *      Resuelve el problema de fondo del prototipo: hasta ahora el catálogo
 *      vivía en el localStorage de quien lo editaba, así que los visitantes
 *      veían siempre el de ejemplo. Ahora viaja dentro del sitio.
 *
 *   2. equipos/<slug>/index.html    — una página estática por equipo.
 *      Es la mayor ganancia de posicionamiento: Google no puede indexar lo
 *      que sólo existe después de ejecutar JavaScript. Con esto, cada máquina
 *      tiene su propia dirección, su título y sus datos estructurados.
 *
 *   3. sitemap.xml                  — con todas las direcciones reales.
 *
 * La fuente de datos hoy es data/catalogo.json. Cuando exista el backend,
 * basta cambiar leerCatalogo() por una consulta a Supabase: nada más de este
 * archivo cambia.
 *
 * Se corre con:  npm run build
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SITIO = 'https://mdcmaquinaria.com';

/* ── Fuente de datos ─────────────────────────────────────────────────────
   El único punto que cambia al migrar a Supabase.                        */
function leerCatalogo() {
  const crudo = fs.readFileSync(path.join(ROOT, 'data', 'catalogo.json'), 'utf8');
  return JSON.parse(crudo);
}

/* ── Utilidades ── */
const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const nf = new Intl.NumberFormat('es-MX');
const precioCompleto = n => '$' + nf.format(n) + ' MXN';
const precioCorto = n => n >= 1e6
  ? '$' + ((n / 1e6) % 1 === 0 ? (n / 1e6).toFixed(0) : (n / 1e6).toFixed(2)) + ' M'
  : '$' + nf.format(n);

/** Reutiliza los mismos SVG del sitio, sin duplicarlos. */
function cargarIconos() {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/icons.js'), 'utf8'), ctx);
  return vm.runInContext('svgs', ctx);
}

/**
 * Toma la calculadora del propio ficha.js en vez de copiar su HTML aquí.
 * Copiarlo significaría que un cambio en la aplicación no llega a las páginas
 * estáticas, y nadie se enteraría hasta ver dos calculadoras distintas.
 */
function cargarCalculadora() {
  const ctx = vm.createContext({
    Intl, Math, Number, String, Array, Object, JSON, parseInt,
    // ficha.js se registra en el documento al cargarse; aquí sólo queremos su HTML.
    document: { addEventListener() {}, querySelectorAll: () => [] },
    window: {},
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/ficha.js'), 'utf8'), ctx,
    { filename: 'ficha.js' });
  return vm.runInContext('calculadoraHTML', ctx);
}

/** Huella de la fuente, para detectar si lo generado quedó desactualizado. */
function huellaFuente() {
  const crudo = fs.readFileSync(path.join(ROOT, 'data', 'catalogo.json'));
  return require('crypto').createHash('sha256').update(crudo).digest('hex').slice(0, 16);
}

/**
 * Credenciales del backend para el navegador, tomadas del entorno.
 *
 * Se inyectan al compilar en vez de escribirse en un archivo del repositorio
 * para que exista un solo lugar donde cambiarlas: las variables de Netlify.
 * El día que haya que rotar la llave, no hay que buscarla repartida en el
 * código.
 *
 * Sin credenciales devuelve `null`, y el sitio sigue funcionando — sólo que
 * las cotizaciones no quedan registradas. Es lo correcto para desarrollo
 * local: nadie debería necesitar una base de datos para ver la portada.
 */
function configBackend() {
  let cred;
  try {
    // Rechaza la llave de servicio. Aquí importa más que en ningún otro lado:
    // esto se escribe en un archivo que descarga cada visitante del sitio.
    cred = require('./entorno').credenciales();
  } catch (err) {
    console.error('✗ ' + err.message);
    process.exit(1);
  }

  if (!cred) {
    console.warn('  ⚠ Sin SUPABASE_URL/ANON_KEY: las cotizaciones NO se registrarán.');
    return 'null';
  }
  return JSON.stringify(cred, null, 2);
}

/* Dominio del que pueden venir las fotos, para la CSP de las fichas.

   Antes decía `https:` a secas: cualquier dominio del mundo. Bastaba con que
   una URL ajena entrara al catálogo para incrustar una imagen de terceros en
   tus páginas —y con ella, un rastreador que ve quién las visita.

   Sin credenciales al compilar no hay fotos remotas que permitir, así que se
   cierra del todo. */
const ORIGEN_FOTOS = (() => {
  const cred = require('./entorno').credenciales();
  return cred ? cred.url : "'none'";
})();

/* ── 1. Datos para la aplicación ── */
function generarDatos(catalogo) {
  const destino = path.join(ROOT, 'assets/js/catalogo-datos.js');
  const cuerpo = `/**
 * catalogo-datos.js — GENERADO AUTOMÁTICAMENTE. No lo edites a mano.
 *
 * Se produce con "npm run build" a partir de data/catalogo.json.
 * Cualquier cambio aquí se pierde en la siguiente compilación.
 */
'use strict';

/* Huella de data/catalogo.json al momento de generar. La verifica
   "npm run test:generado" para que nadie publique fichas desactualizadas. */
const CATALOGO_HUELLA = '${huellaFuente()}';

const CATALOGO = ${JSON.stringify(
    { ajustes: catalogo.ajustes, sucursales: catalogo.sucursales, equipos: catalogo.equipos },
    null, 2)};

/* Adónde manda backend.js las solicitudes de cotización.

   La llave es la 'publishable': está pensada para viajar en el navegador y
   cualquiera puede leerla aquí. Lo que impide que sirva para algo son las
   políticas RLS — con ella sólo se puede insertar una solicitud. Ni leer la
   cartera de clientes, ni tocar precios. Verificado en tests/seguridad.test.js.

   Si al compilar no hay credenciales en el entorno, esto queda en null y el
   sitio funciona como siempre: las cotizaciones salen sólo por WhatsApp. */
const BACKEND_CONFIG = ${configBackend()};
`;
  fs.writeFileSync(destino, cuerpo, 'utf8');
  return destino;
}

/* ── 2. Una página por equipo ── */
function fichaHTML(eq, catalogo, iconos) {
  const a = catalogo.ajustes;
  const marca = a.marca_principal + a.marca_acento;
  const url = `${SITIO}/equipos/${eq.slug}/`;
  const esRenta = eq.cond === 'Renta';
  const fotos = Array.isArray(eq.imgs) && eq.imgs.length ? eq.imgs : (eq.img ? [eq.img] : []);

  /* Para compartir y para Google hacen falta URLs absolutas y alcanzables: una
     foto incrustada como data URI no le sirve a ninguno de los dos. */
  const absoluta = f => f.startsWith('http') ? f : f.startsWith('/') ? SITIO + f : null;
  const publicas = fotos.map(absoluta).filter(Boolean);
  const imagen = publicas[0] || `${SITIO}/assets/img/og.png`;

  const titulo = `${eq.name} — ${esRenta ? 'renta' : 'venta'} en ${eq.location} | ${marca}`;
  const resumen = `${eq.name} ${eq.cond.toLowerCase()} en ${eq.location}. ` +
    `${eq.specs.join(' · ')}. ${esRenta ? precioCompleto(eq.price) + ' al mes' : precioCompleto(eq.price)}. ` +
    `${eq.finance ? eq.finance + ' sin intereses. ' : ''}${eq.shipping ? 'Envío incluido a obra.' : ''}`.trim();

  // Datos estructurados: lo que permite que Google muestre precio y
  // disponibilidad directamente en los resultados de búsqueda.
  const oferta = esRenta
    ? {
        '@type': 'Offer', url, priceCurrency: 'MXN',
        availability: 'https://schema.org/InStock',
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: eq.price, priceCurrency: 'MXN',
          unitText: 'MES', referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitText: 'MES' },
        },
      }
    : {
        '@type': 'Offer', url, price: eq.price, priceCurrency: 'MXN',
        availability: 'https://schema.org/InStock',
        itemCondition: eq.cond === 'Nuevo'
          ? 'https://schema.org/NewCondition'
          : 'https://schema.org/UsedCondition',
        seller: { '@type': 'Organization', name: a.vendedor },
      };

  const datos = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: eq.name,
    description: eq.desc,
    sku: eq.slug,
    category: eq.cat,
    image: publicas.length ? publicas : imagen,
    brand: { '@type': 'Brand', name: eq.brand },
    offers: oferta,
    additionalProperty: eq.specs.map(s => ({
      '@type': 'PropertyValue', name: 'Especificación', value: s,
    })),
  };

  const mensajeWa = `Hola ${marca}, me interesa el ${eq.name} (${url}). ¿Me pueden dar más información?`;
  const wa = `https://wa.me/${String(a.whatsapp).replace(/\D/g, '')}?text=${encodeURIComponent(mensajeWa)}`;

  /* Galería sin una línea de JavaScript: un carril con scroll-snap y
     miniaturas que son anclas. Las fotos son lo primero que mira un cliente,
     así que se ven aunque el script tarde, falle o venga bloqueado. */
  const medio = !fotos.length
    ? (iconos[eq.svgKey] || iconos.excavadora)
    : fotos.length === 1
      ? `<img src="${esc(fotos[0])}" alt="${esc(eq.name)}">`
      : `<div class="fgal">
    <div class="fgal-track">
      ${fotos.map((f, n) => `<img id="foto-${n + 1}" src="${esc(f)}" alt="${esc(eq.name)} — foto ${n + 1} de ${fotos.length}">`).join('\n      ')}
    </div>
    <div class="fgal-thumbs">
      ${fotos.map((f, n) => `<a href="#foto-${n + 1}" aria-label="Ver la foto ${n + 1}"><img src="${esc(f)}" alt="" loading="lazy"></a>`).join('\n      ')}
    </div>
  </div>`;

  const descuento = eq.original && eq.original > eq.price
    ? Math.round((1 - eq.price / eq.original) * 100) : 0;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(resumen)}">
<meta name="theme-color" content="#1A1A1A">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src 'self' data: blob: ${ORIGEN_FOTOS}; connect-src 'self'; form-action 'none'; object-src 'none'; base-uri 'none'">
<link rel="canonical" href="${url}">
<meta property="og:type" content="product">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(eq.name)} — ${marca}">
<meta property="og:description" content="${esc(resumen)}">
<meta property="og:image" content="${esc(imagen)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/styles.css">
<!-- Simulador de financiamiento y botón de impresión. Es un archivo externo,
     no código en línea: así el CSP de esta página sigue sin 'unsafe-inline'. -->
<script src="/assets/js/ficha.js" defer></script>
<script type="application/ld+json">
${JSON.stringify(datos, null, 2)}
</script>
</head>
<body>

<header>
  <div class="header-inner">
    <a class="logo" href="/">
      <span>
        <span class="logo-text">${esc(a.marca_principal)}<span>${esc(a.marca_acento)}</span></span>
        <span class="logo-sub">${esc(a.marca_completa)}</span>
      </span>
    </a>
    <div class="header-actions">
      <a class="hbtn" href="/#catalogo">← Ver todo el catálogo</a>
      <a class="hbtn primary" href="${esc(wa)}" target="_blank" rel="noopener">💬 Cotizar por WhatsApp</a>
    </div>
  </div>
</header>

<main class="ficha">
  <p class="print-marca">${esc(marca)} · ${esc(a.marca_completa)}</p>
  <nav class="miga" aria-label="Ruta">
    <a href="/">Inicio</a> ›
    <a href="/#catalogo">${esc(eq.cat)}</a> ›
    <span>${esc(eq.name)}</span>
  </nav>

  <div class="ficha-grid">
    <div class="ficha-media${fotos.length > 1 ? ' galeria' : ''}">${medio}</div>

    <div class="ficha-info">
      <p class="ficha-cat">${esc(eq.cat)} · ${esc(eq.brand)}</p>
      <h1>${esc(eq.name)}</h1>
      <p class="ficha-meta">📍 ${esc(eq.location)} · Año ${eq.year} ·
        <span class="pcard-seller-tag">✓ ${esc(eq.cond === 'Renta' ? 'En renta' : eq.cond === 'Nuevo' ? 'Nuevo' : 'Usado certificado')}</span>
      </p>

      <p class="ficha-precio">
        ${precioCompleto(eq.price)}${esRenta ? '<small> / mes</small>' : ''}
        ${descuento ? `<span class="pcard-original">${precioCorto(eq.original)}</span><span class="pcard-disc">−${descuento}%</span>` : ''}
      </p>
      ${eq.finance ? `<p class="ficha-extra">💳 ${esc(eq.finance)} sin intereses = ${precioCompleto(Math.round(eq.price / parseInt(eq.finance, 10)))} al mes</p>` : ''}
      ${eq.leasing ? '<p class="ficha-extra">🏦 Disponible en arrendamiento puro</p>' : ''}
      ${eq.shipping ? '<p class="ficha-extra">🚚 Envío incluido a pie de obra</p>' : ''}

      <div class="ficha-specs">
        ${eq.specs.map((s, i) => `<div class="modal-spec">
          <div class="modal-spec-label">${['Capacidad', 'Potencia', 'Detalle'][i] || 'Especificación'}</div>
          <div class="modal-spec-val">${esc(s)}</div></div>`).join('')}
        <div class="modal-spec"><div class="modal-spec-label">Garantía</div>
          <div class="modal-spec-val">${eq.cond === 'Nuevo' ? '12 meses de fábrica' : eq.cond === 'Renta' ? 'Incluida en la renta' : '6 meses certificada'}</div></div>
      </div>

      <p class="ficha-desc">${esc(eq.desc)}</p>

      <div class="ficha-acciones">
        <a class="btn-primary" href="${esc(wa)}" target="_blank" rel="noopener">💬 Cotizar este equipo</a>
        <a class="btn-ghost" href="tel:${esc(String(a.telefono).replace(/\s/g, ''))}">📞 ${esc(a.telefono)}</a>
        <button class="btn-ghost" type="button" data-imprimir>🖨 Imprimir o guardar en PDF</button>
      </div>
    </div>
  </div>

  ${esRenta ? '' : calculadoraHTML(eq.price, { msi: eq.finance })}

  <p class="solo-impresion">
    ${esc(marca)} · ${esc(a.marca_completa)} · ${esc(a.telefono)} · ${esc(a.correo)}<br>
    Ficha consultada en ${url} — precio de referencia en MXN, no constituye una oferta comercial.
  </p>
</main>

<footer>
  <div class="footer-inner">
    <div class="footer-col">
      <h4>${esc(marca)} · ${esc(a.marca_completa)}</h4>
      <p style="max-width:300px;line-height:1.6">${esc(a.pie_descripcion)}</p>
    </div>
    <div class="footer-col">
      <h4>Contacto</h4>
      <ul>
        <li><a href="tel:${esc(String(a.telefono).replace(/\s/g, ''))}">${esc(a.telefono)}</a></li>
        <li><a href="mailto:${esc(a.correo)}">${esc(a.correo)}</a></li>
        <li>${esc(a.direccion)}</li>
        <li>${esc(a.horario)}</li>
      </ul>
    </div>
  </div>
  <div class="footer-legal">Precio de referencia en MXN, no constituye una oferta comercial.</div>
</footer>

</body>
</html>
`;
}

function generarFichas(catalogo, iconos) {
  const base = path.join(ROOT, 'equipos');
  fs.rmSync(base, { recursive: true, force: true });   // borra fichas de equipos ya dados de baja
  let n = 0;
  for (const eq of catalogo.equipos) {
    const dir = path.join(base, eq.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), fichaHTML(eq, catalogo, iconos), 'utf8');
    n++;
  }
  return n;
}

/* ── 3. Sitemap ── */
function generarSitemap(catalogo) {
  const hoy = new Date().toISOString().slice(0, 10);
  const urls = [
    `  <url>\n    <loc>${SITIO}/</loc>\n    <lastmod>${hoy}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>`,
    ...catalogo.equipos.map(eq =>
      `  <url>\n    <loc>${SITIO}/equipos/${eq.slug}/</loc>\n    <lastmod>${hoy}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- GENERADO AUTOMÁTICAMENTE por "npm run build". No lo edites a mano. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml, 'utf8');
  return urls.length;
}

/* ── Ejecución ── */
const catalogo = leerCatalogo();
const iconos = cargarIconos();
const calculadoraHTML = cargarCalculadora();

const faltantes = catalogo.equipos.filter(e => !e.slug);
if (faltantes.length) {
  console.error(`Hay ${faltantes.length} equipos sin "slug" en data/catalogo.json. Sin él no se puede generar su página.`);
  process.exit(1);
}

generarDatos(catalogo);
const fichas = generarFichas(catalogo, iconos);
const urls = generarSitemap(catalogo);

console.log('Sitio generado:');
console.log(`  assets/js/catalogo-datos.js   ${catalogo.equipos.length} equipos, ${catalogo.sucursales.length} sucursales`);
console.log(`  equipos/<slug>/index.html     ${fichas} fichas`);
console.log(`  sitemap.xml                   ${urls} direcciones`);
