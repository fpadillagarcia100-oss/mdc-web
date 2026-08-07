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

/* Las guías de compra por categoría. Es contenido editorial —cómo elegir, qué
   revisar, qué cuesta operar— y no inventario, así que vive aparte y se edita
   sin tocar el catálogo. Si el archivo no está, las páginas salen como antes:
   nunca puede tumbar la compilación por un texto. */
const GUIAS = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'guias.json'), 'utf8')); }
  catch { return {}; }
})();

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
 * Toma el catálogo de datos técnicos del mismo archivo que usa la aplicación.
 *
 * Copiar aquí la lista de campos sería garantizar que un día no digan lo
 * mismo: se añade "horas de motor" en el panel, se olvida aquí, y las fichas
 * publicadas —las que ve Google— se quedan sin ese dato sin que nadie lo note.
 *
 * Por esto atributos.js no toca el DOM: aquí no hay `document`.
 */
function cargarAtributos() {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/atributos.js'), 'utf8'), ctx,
    { filename: 'atributos.js' });
  return {
    fichaTecnica: vm.runInContext('fichaTecnica', ctx),
    videoId: vm.runInContext('videoId', ctx),
    // La misma que usa el pie de la portada para enlazar. Si cada uno tuviera
    // la suya, los enlaces del pie llevarían a páginas que no existen.
    slugCategoria: vm.runInContext('slugCategoria', ctx),
  };
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

/**
 * Equipos relacionados para el pie de la ficha.
 *
 * Quien llega desde Google cae en UNA máquina. Si no le convence, se va — hoy
 * no hay nada que le invite a mirar otra. Y quien busca una retro de 8
 * toneladas casi siempre está dispuesto a ver dos o tres parecidas.
 *
 * Se prefieren las de la misma categoría y, dentro de ellas, las de precio más
 * cercano: quien mira una máquina de un millón no está buscando una de cien
 * mil. Si la categoría no da para tres, se completa con el resto del catálogo
 * ordenado por cercanía de precio — mejor tres sugerencias que una sola fila
 * a medias.
 *
 * Los vendidos quedan fuera: no tiene sentido rematar una ficha invitando a
 * ver algo que tampoco está.
 */
function similaresHTML(eq, catalogo, iconos) {
  const candidatos = catalogo.equipos.filter(o =>
    o.slug !== eq.slug && o.disponibilidad !== 'vendido');

  const cerca = (a, b) => Math.abs(a.price - eq.price) - Math.abs(b.price - eq.price);
  const mismaCat = candidatos.filter(o => o.cat === eq.cat).sort(cerca);
  const resto = candidatos.filter(o => o.cat !== eq.cat).sort(cerca);
  const elegidos = [...mismaCat, ...resto].slice(0, 3);

  if (!elegidos.length) return '';

  return `
  <section class="similares">
    <h2>Otros equipos que te pueden servir</h2>
    <div class="similares-grid">
      ${elegidos.map(o => `
        <a class="similar" href="${SITIO}/equipos/${o.slug}/">
          <div class="similar-img">${
            o.img ? `<img src="${esc(o.img)}" alt="${esc(o.name)}" loading="lazy" decoding="async">`
                  : (iconos[o.svgKey] || iconos.excavadora)
          }</div>
          <div class="similar-body">
            <p class="similar-cat">${esc(o.cat)} · ${esc(o.brand)}</p>
            <h3>${esc(o.name)}</h3>
            <p class="similar-precio">${precioCorto(o.price)}${o.cond === 'Renta' ? ' <small>/mes</small>' : ''}</p>
          </div>
        </a>`).join('')}
    </div>
  </section>`;
}

/**
 * Preguntas contestadas, en la ficha.
 *
 * Es lo que convierte una página de producto en una que sirve para más de una
 * persona: la duda que alguien tuvo la semana pasada ya está resuelta para
 * quien llegue hoy, y es texto propio que Google indexa con la máquina.
 */
function preguntasFichaHTML(eq) {
  const qa = Array.isArray(eq.qa) ? eq.qa : [];
  if (!qa.length) return '';

  return `
  <section class="fqa">
    <h2>Preguntas sobre este equipo</h2>
    ${qa.map(q => `
      <article class="qa-item">
        <p class="qa-p"><span class="qa-etq" aria-hidden="true">P</span>${esc(q.pregunta)}</p>
        <p class="qa-r"><span class="qa-etq r" aria-hidden="true">R</span>${esc(q.respuesta)}</p>
        <p class="qa-meta">${esc(q.nombre || 'Cliente')}${q.fecha ? ` · ${esc(q.fecha)}` : ''}</p>
      </article>`).join('')}
    <p class="fqa-nota">¿Tu duda no está aquí? Pregúntala desde el catálogo o
      escríbenos por WhatsApp: contestamos el mismo día.</p>
  </section>`;
}

/** El video: portada estática y, sólo si lo piden, el reproductor (ver ficha.js). */
function videoFichaHTML(eq, poster) {
  if (!eq.video) return '';
  return `
  <section class="fvideo">
    <h2>Ve la máquina trabajando</h2>
    <div class="fvideo-caja">
      <button class="fvideo-facade" type="button" data-video="${esc(eq.video)}"
              aria-label="Reproducir el video de ${esc(eq.name)}">
        ${poster ? `<img src="${esc(poster)}" alt="" aria-hidden="true" loading="lazy">` : ''}
        <span class="gal-play" aria-hidden="true">▶</span>
        <span class="gal-facade-txt">Ver el video</span>
      </button>
    </div>
    <p class="fvideo-nota">El video se carga desde YouTube sólo cuando le das al play.
      Hasta entonces esta página no habla con ningún tercero.</p>
  </section>`;
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

  /* Datos estructurados: lo que permite que Google muestre precio y
     disponibilidad directamente en los resultados de búsqueda.

     La disponibilidad tiene que ser la de verdad. Antes decía siempre
     "InStock", así que una máquina vendida seguía anunciándose como
     disponible en Google durante meses — y esa es la peor llamada que puedes
     recibir: el cliente llega ilusionado por algo que ya no existe y tú
     explicas lo mismo por décima vez.

     Marcarla como vendida es además lo que hace que Google deje de mostrarla
     arriba, sin que tengas que borrar la página y perder su posicionamiento. */
  const DISPONIBILIDAD = {
    disponible: 'https://schema.org/InStock',
    apartado:   'https://schema.org/LimitedAvailability',
    vendido:    'https://schema.org/SoldOut',
  };
  const existencias = DISPONIBILIDAD[eq.disponibilidad] || DISPONIBILIDAD.disponible;

  const oferta = esRenta
    ? {
        '@type': 'Offer', url, priceCurrency: 'MXN',
        availability: existencias,
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: eq.price, priceCurrency: 'MXN',
          unitText: 'MES', referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitText: 'MES' },
        },
      }
    : {
        '@type': 'Offer', url, price: eq.price, priceCurrency: 'MXN',
        availability: existencias,
        itemCondition: eq.cond === 'Nuevo'
          ? 'https://schema.org/NewCondition'
          : 'https://schema.org/UsedCondition',
        seller: { '@type': 'Organization', name: a.vendedor },
      };

  /* La ficha técnica va como `additionalProperty` CON NOMBRE, al revés que las
     especificaciones libres.

     La diferencia importa: {name:"Especificación", value:"148 HP"} le dice a
     Google que hay un dato, no cuál. {name:"Potencia", value:148, unitText:"HP"}
     sí se puede entender, comparar y enseñar en una tabla de resultados. Es lo
     mismo que ganamos nosotros con los filtros, aplicado a quien busca fuera. */
  const tecnicos = fichaTecnica(eq).map(f => ({
    '@type': 'PropertyValue', name: f.etq, value: f.valor,
  }));

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
    additionalProperty: [
      ...tecnicos,
      ...eq.specs.map(s => ({ '@type': 'PropertyValue', name: 'Especificación', value: s })),
    ],
  };

  /* Preguntas y respuestas como FAQPage.

     Sin promesas de más: desde 2023 Google reserva el resultado enriquecido de
     FAQ para sitios de gobierno y salud, así que esto NO va a pintar las
     preguntas desplegables en los resultados. Lo que sí hace es dejar
     explícito que ese texto son preguntas de clientes con respuesta del
     vendedor —contenido propio, no relleno—, y otros buscadores y asistentes sí
     lo usan. El valor principal sigue siendo para quien abre la página. */
  const qa = Array.isArray(eq.qa) ? eq.qa : [];
  const datosFAQ = qa.length ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: qa.map(q => ({
      '@type': 'Question',
      name: q.pregunta,
      acceptedAnswer: { '@type': 'Answer', text: q.respuesta },
    })),
  } : null;

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
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src 'self' data: blob: ${ORIGEN_FOTOS}; connect-src 'self'; frame-src https://www.youtube-nocookie.com; form-action 'none'; object-src 'none'; base-uri 'none'">
<link rel="canonical" href="${url}">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/assets/img/icon-180.png">
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
${datosFAQ ? `<script type="application/ld+json">
${JSON.stringify(datosFAQ, null, 2)}
</script>` : ''}
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
  <!-- La miga apunta a la página de la categoría, no a la portada. Es lo que
       le da a esa página enlaces desde las 18 fichas, y a quien llega desde
       Google buscando una máquina, un sitio donde ver las parecidas. -->
  <nav class="miga" aria-label="Ruta">
    <a href="/">Inicio</a> ›
    <a href="${SITIO}/maquinaria/${slugCategoria(eq.cat)}/">${esc(eq.cat)}</a> ›
    <span>${esc(eq.name)}</span>
  </nav>

  <div class="ficha-grid">
    <div class="ficha-media${fotos.length > 1 ? ' galeria' : ''}">${medio}</div>

    <div class="ficha-info">
      <p class="ficha-cat">${esc(eq.cat)} · ${esc(eq.brand)}</p>
      <h1>${esc(eq.name)}</h1>
      ${eq.disponibilidad === 'vendido' ? `
        <p class="ficha-agotado">Esta máquina ya se vendió.
          <a href="${SITIO}/#catalogo">Ver equipos disponibles</a></p>` : ''}
      ${eq.disponibilidad === 'apartado' ? `
        <p class="ficha-agotado apartado">Apartada. Escríbenos por si se libera.</p>` : ''}
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

      ${tecnicos.length ? `
      <div class="ft">
        <h2 class="ft-titulo">Ficha técnica</h2>
        <table class="ft-tabla">
          <tbody>
            ${fichaTecnica(eq).map(f => `<tr><th scope="row">${esc(f.etq)}</th><td>${esc(f.texto)}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}

      <div class="ficha-acciones">
        <a class="btn-primary" href="${esc(wa)}" target="_blank" rel="noopener">💬 Cotizar este equipo</a>
        <a class="btn-ghost" href="tel:${esc(String(a.telefono).replace(/\s/g, ''))}">📞 ${esc(a.telefono)}</a>
        <button class="btn-ghost" type="button" data-imprimir>🖨 Imprimir o guardar en PDF</button>
      </div>
    </div>
  </div>

  ${videoFichaHTML(eq, publicas[0] || null)}

  ${esRenta ? '' : calculadoraHTML(eq.price, { msi: eq.finance })}

  ${preguntasFichaHTML(eq)}

  ${similaresHTML(eq, catalogo, iconos)}

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

/* ── 3. Una página por categoría ────────────────────────────────────────────
   El hueco que tapa: hoy Google tiene la portada y una ficha por máquina.
   Quien busca «excavadora usada en chiapas» —que es como busca casi todo el
   mundo, por trabajo y no por modelo— no encuentra nada nuestro. Sólo aparece
   quien ya sabe que quiere una CAT 320 GC, que es un cliente que casi no
   existe.

   Estas páginas son la respuesta a esa búsqueda: una dirección propia por
   categoría, con sus máquinas, indexable sin ejecutar JavaScript.

   El catálogo con filtros sigue viviendo en la portada. Esto no lo sustituye:
   es la puerta de entrada desde el buscador, y cada tarjeta lleva a la ficha
   de siempre. */

function categoriaHTML(cat, equipos, catalogo, iconos) {
  const a = catalogo.ajustes;
  const marca = a.marca_principal + a.marca_acento;
  const slug = slugCategoria(cat);
  const url = `${SITIO}/maquinaria/${slug}/`;

  const enVenta = equipos.filter(e => e.cond !== 'Renta').length;
  const enRenta = equipos.length - enVenta;
  const precios = equipos.map(e => e.price);
  const desde = Math.min(...precios);

  const titulo = `Maquinaria de ${cat.toLowerCase()} en Chiapas — venta y renta | ${marca}`;
  const resumen = `${equipos.length} equipos de ${cat.toLowerCase()} disponibles en Chiapas: ` +
    equipos.slice(0, 4).map(e => e.name).join(', ') + '. ' +
    `${enVenta ? `${enVenta} en venta` : ''}${enVenta && enRenta ? ' y ' : ''}${enRenta ? `${enRenta} en renta` : ''}, ` +
    `desde ${precioCompleto(desde)}. Garantía, financiamiento y entrega a pie de obra.`;

  /* ItemList le dice a Google que esto es un listado y cuál es el orden, no un
     texto con enlaces sueltos. Es lo que permite que enseñe el grupo entero en
     vez de una máquina al azar. */
  const datos = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Maquinaria de ${cat.toLowerCase()} en Chiapas`,
    numberOfItems: equipos.length,
    itemListElement: equipos.map((e, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITIO}/equipos/${e.slug}/`,
      name: e.name,
    })),
  };

  const migas = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: SITIO + '/' },
      { '@type': 'ListItem', position: 2, name: cat, item: url },
    ],
  };

  /* La guía de compra de esta categoría, si la hay.

     Es lo único de estas páginas que no sale del inventario, y es a propósito:
     una página que sólo lista lo que hay hoy queda vacía el día que se venden
     los tres equipos, y para Google nunca fue más que una lista de enlaces.
     Lo que se responde aquí —qué tamaño necesito, qué reviso en una usada,
     cuánto cuesta operarla— sigue siendo cierto y útil con el inventario
     vacío, y es lo que de verdad busca quien todavía no sabe qué comprar.

     Vive en data/guias.json para que se corrija sin tocar código. */
  const guia = GUIAS[cat] || null;

  const guiaFAQ = guia && guia.faq && guia.faq.length ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: guia.faq.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.r },
    })),
  } : null;

  const guiaHTML = !guia ? '' : `
  <section class="cat-guia">
    <h2>${esc(guia.titulo)}</h2>
    <p class="cat-guia-entrada">${esc(guia.entrada)}</p>
    ${guia.secciones.map(s => `
    <div class="cat-guia-bloque">
      <h3>${esc(s.h)}</h3>
      <p>${esc(s.p)}</p>
    </div>`).join('')}
    ${!guia.faq || !guia.faq.length ? '' : `
    <div class="cat-guia-faq">
      <h3>Preguntas frecuentes</h3>
      ${guia.faq.map(f => `
      <details>
        <summary>${esc(f.q)}</summary>
        <p>${esc(f.r)}</p>
      </details>`).join('')}
    </div>`}
  </section>`;

  const wa = `https://wa.me/${String(a.whatsapp).replace(/\D/g, '')}?text=` +
    encodeURIComponent(`Hola ${marca}, me interesa su maquinaria de ${cat.toLowerCase()}. ¿Qué tienen disponible?`);

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(resumen.slice(0, 300))}">
<meta name="theme-color" content="#1A1A1A">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src 'self' data: blob: ${ORIGEN_FOTOS}; connect-src 'self'; frame-src https://www.youtube-nocookie.com; form-action 'none'; object-src 'none'; base-uri 'none'">
<link rel="canonical" href="${url}">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/assets/img/icon-180.png">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(resumen.slice(0, 300))}">
<meta property="og:image" content="${esc(equipos.map(e => e.img).find(Boolean) || `${SITIO}/assets/img/og.png`)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/styles.css">
<script type="application/ld+json">
${JSON.stringify(datos, null, 2)}
</script>
<script type="application/ld+json">
${JSON.stringify(migas, null, 2)}
</script>
${guiaFAQ ? `<script type="application/ld+json">
${JSON.stringify(guiaFAQ, null, 2)}
</script>` : ''}
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

<main class="cat-pagina">
  <nav class="miga" aria-label="Ruta">
    <a href="/">Inicio</a> › <span>${esc(cat)}</span>
  </nav>

  <h1>Maquinaria de ${esc(cat.toLowerCase())} en Chiapas</h1>
  <p class="cat-intro">
    ${equipos.length} equipo${equipos.length === 1 ? '' : 's'} disponible${equipos.length === 1 ? '' : 's'}${
      enVenta && enRenta ? `, ${enVenta} en venta y ${enRenta} en renta` :
      enRenta ? ', todos en renta' : ''}, desde ${precioCompleto(desde)}.
    Todos revisados, con garantía por escrito y entrega a pie de obra en Chiapas.
  </p>

  <div class="similares-grid cat-grid">
    ${equipos.map(e => `
      <a class="similar" href="${SITIO}/equipos/${e.slug}/">
        <div class="similar-img">${
          e.img ? `<img src="${esc(e.img)}" alt="${esc(e.name)}" loading="lazy" decoding="async">`
                : (iconos[e.svgKey] || iconos.excavadora)
        }</div>
        <div class="similar-body">
          <p class="similar-cat">${esc(e.cat)} · ${esc(e.brand)} · ${e.year}</p>
          <h2>${esc(e.name)}</h2>
          <p class="similar-precio">${precioCorto(e.price)}${e.cond === 'Renta' ? ' <small>/mes</small>' : ''}</p>
          <p class="cat-meta">📍 ${esc(e.location)}${e.specs.length ? ' · ' + esc(e.specs[0]) : ''}</p>
        </div>
      </a>`).join('')}
  </div>

${guiaHTML}

  <section class="cat-cierre">
    <h2>¿No encuentras lo que buscas?</h2>
    <p>Movemos maquinaria constantemente y no todo alcanza a publicarse. Dinos qué
      necesitas y qué presupuesto manejas, y te decimos qué tenemos o qué nos entra.</p>
    <p>
      <a class="btn-primary" href="${esc(wa)}" target="_blank" rel="noopener">💬 Escribir por WhatsApp</a>
      <a class="btn-ghost" href="/#catalogo">Ver el catálogo completo</a>
    </p>
  </section>
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

/** Categorías con al menos un equipo publicado, en orden alfabético. */
function categoriasCon(catalogo) {
  const mapa = new Map();
  for (const eq of catalogo.equipos) {
    if (!mapa.has(eq.cat)) mapa.set(eq.cat, []);
    mapa.get(eq.cat).push(eq);
  }
  return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'));
}

function generarCategorias(catalogo, iconos) {
  const base = path.join(ROOT, 'maquinaria');
  // Se rehace entera: una categoría que se queda sin equipos no puede dejar su
  // página publicada e indexada enseñando una rejilla vacía.
  fs.rmSync(base, { recursive: true, force: true });

  const lista = categoriasCon(catalogo);
  for (const [cat, equipos] of lista) {
    const dir = path.join(base, slugCategoria(cat));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'),
      categoriaHTML(cat, equipos, catalogo, iconos), 'utf8');
  }
  return lista;
}

/* ── 4. Sitemap ── */
function generarSitemap(catalogo, categorias) {
  const hoy = new Date().toISOString().slice(0, 10);
  const urls = [
    `  <url>\n    <loc>${SITIO}/</loc>\n    <lastmod>${hoy}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>`,
    /* Las categorías van con prioridad ALTA y revisión semanal, por encima de
       las fichas. No es un capricho de números: una ficha desaparece cuando se
       vende la máquina, y la categoría se queda. Es la página que conviene que
       Google trate como estable y que acumule posicionamiento. */
    ...categorias.map(([cat]) =>
      `  <url>\n    <loc>${SITIO}/maquinaria/${slugCategoria(cat)}/</loc>\n    <lastmod>${hoy}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>`),
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
const { fichaTecnica, slugCategoria } = cargarAtributos();

const faltantes = catalogo.equipos.filter(e => !e.slug);
if (faltantes.length) {
  console.error(`Hay ${faltantes.length} equipos sin "slug" en data/catalogo.json. Sin él no se puede generar su página.`);
  process.exit(1);
}

generarDatos(catalogo);
const fichas = generarFichas(catalogo, iconos);
const categorias = generarCategorias(catalogo, iconos);
const urls = generarSitemap(catalogo, categorias);

/* Los 21 scripts, unidos en uno. Sólo para publicar: el index.html del
   repositorio sigue cargándolos por separado, que es lo que hace depurable el
   sitio. Ver tools/empacar-js.js. */
const paquete = require('./empacar-js').empacarJS();

console.log('Sitio generado:');
console.log(`  assets/js/catalogo-datos.js   ${catalogo.equipos.length} equipos, ${catalogo.sucursales.length} sucursales`);
console.log(`  assets/js/sitio.js            ${paquete.archivos} scripts unidos, ${(paquete.despues/1024).toFixed(0)} kB`);
console.log(`  equipos/<slug>/index.html     ${fichas} fichas`);
console.log(`  maquinaria/<cat>/index.html   ${categorias.length} categorías (${categorias.map(([c, e]) => `${c}: ${e.length}`).join(', ')})`);
console.log(`  sitemap.xml                   ${urls} direcciones`);
