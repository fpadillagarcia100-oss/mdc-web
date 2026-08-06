/**
 * unit.test.js — Pruebas de la lógica de negocio, aisladas del navegador.
 *
 * A diferencia de smoke.test.js (que levanta la página entera), aquí cargamos
 * sólo los módulos que interesan y probamos casos borde: los precios, los
 * descuentos y el filtrado son donde un error cuesta dinero de verdad.
 *
 * Se corre con:  npm test
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const load = f => fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8');

/* Ejecutamos los módulos en un contexto limpio, con lo mínimo que esperan
   del navegador. Así probamos el código real, no una copia. */
const ctx = vm.createContext({
  document: { querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
  window: { print() {} },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  Intl, Math, Date, JSON, Set, Number, String, Array, Object, RegExp,
  console, TextEncoder,
});
/* El orden importa: catalogo-datos.js define CATALOGO, del que depende
   config.js; atributos.js define videoId y limpiarAtributos, de los que
   depende storage.js al normalizar. Es el mismo orden del index.html. */
['icons.js', 'catalogo-datos.js', 'config.js', 'atributos.js', 'utils.js', 'security.js',
 'storage.js', 'state.js', 'ficha.js']
  .forEach(f => vm.runInContext(load(f), ctx, { filename: f }));

const run = expr => vm.runInContext(expr, ctx);

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`PASA  ${name}`); pass++ }
  catch (e) { console.log(`FALLA ${name}\n      ${e.message}`); fail++ }
}

/* ── Formato de precios ── */
test('Precios de millones se abrevian', () => {
  assert.strictEqual(run('fmtCompact(2850000)'), '$2.85 M');
  assert.strictEqual(run('fmtCompact(4000000)'), '$4 M', 'un millón exacto no lleva decimales');
});

test('Precios menores a un millón se escriben completos', () => {
  assert.strictEqual(run('fmtCompact(42000)'), '$42,000');
  assert.strictEqual(run('fmtCompact(999999)'), '$999,999');
});

test('El límite del millón se cruza correctamente', () => {
  assert.strictEqual(run('fmtCompact(999999)'), '$999,999');
  assert.strictEqual(run('fmtCompact(1000000)'), '$1 M');
});

/* ── Descuentos ── */
test('El descuento se calcula sobre el precio anterior', () => {
  assert.strictEqual(run('discPct({price:900, original:1000})'), 10);
});

test('Sin precio anterior no hay descuento', () => {
  assert.strictEqual(run('discPct({price:900, original:null})'), 0);
});

test('Un precio anterior menor NO inventa un descuento negativo', () => {
  // Si alguien teclea mal el precio anterior, la tarjeta no debe mostrar "-20%".
  assert.strictEqual(run('discPct({price:1000, original:800})'), 0);
  assert.strictEqual(run('discPct({price:1000, original:1000})'), 0);
});

/* ── Escapado de salida (la defensa contra HTML inyectado) ── */
test('Escapa los caracteres peligrosos', () => {
  assert.strictEqual(run(`esc('<img src=x onerror=alert(1)>')`),
    '&lt;img src=x onerror=alert(1)&gt;');
  assert.strictEqual(run(`esc('Comillas " y \\'')`), 'Comillas &quot; y &#39;');
});

test('Escapa el ampersand primero, sin doble escapado', () => {
  assert.strictEqual(run(`esc('Tornillos & Tuercas')`), 'Tornillos &amp; Tuercas');
});

test('Un valor nulo no revienta ni escribe "null"', () => {
  assert.strictEqual(run('esc(null)'), '');
  assert.strictEqual(run('esc(undefined)'), '');
});

/* ── Validación de contacto ── */
test('Acepta teléfonos mexicanos de 10 dígitos', () => {
  assert.ok(run(`PHONE_RE.test('9611234567')`));
});

test('Rechaza teléfonos incompletos o de más', () => {
  assert.ok(!run(`PHONE_RE.test('961123456')`), '9 dígitos');
  assert.ok(!run(`PHONE_RE.test('96112345678')`), '11 dígitos');
});

test('Valida correos con criterio razonable', () => {
  assert.ok(run(`EMAIL_RE.test('ventas@mdc.mx')`));
  assert.ok(!run(`EMAIL_RE.test('ventas@mdc')`), 'sin dominio de primer nivel');
  assert.ok(!run(`EMAIL_RE.test('sin arroba.com')`));
});

/* ── Normalización de datos que entran ── */
test('Un respaldo con basura no tumba el catálogo', () => {
  const out = run(`normalizeProducts([
    null, 'texto suelto', {sinNombre:true},
    {name:'Equipo válido', price:'1500', cond:'Inventada', specs:'no es arreglo'}
  ]).length`);
  assert.strictEqual(out, 1, 'sólo debe sobrevivir el registro con nombre');
});

test('Los campos inválidos se corrigen a valores seguros', () => {
  const p = run(`JSON.stringify(normalizeProducts([
    {name:'X', price:'1500', cond:'Inventada', specs:'no es arreglo', svgKey:'inexistente', img:'javascript:alert(1)'}
  ])[0])`);
  const o = JSON.parse(p);
  assert.strictEqual(o.price, 1500, 'el precio se convierte a número');
  assert.strictEqual(o.cond, 'Nuevo', 'una condición inventada cae al valor por defecto');
  assert.deepStrictEqual(o.specs, [], 'las specs que no son arreglo se descartan');
  assert.strictEqual(o.svgKey, 'excavadora', 'un ícono inexistente cae al de respaldo');
  assert.strictEqual(o.img, null, 'una imagen que no sea data:image se rechaza');
});

test('El catálogo por defecto pasa su propia normalización', () => {
  assert.strictEqual(run('normalizeProducts(DEFAULT_PRODUCTS).length'), 18);
});

/* ── Galería de fotos ── */
test('Un equipo con varias fotos las conserva todas', () => {
  const p = JSON.parse(run(`JSON.stringify(normalizeProducts([
    {name:'X', imgs:['data:image/webp;base64,AA','data:image/jpeg;base64,BB','data:image/png;base64,CC']}
  ])[0])`));
  assert.strictEqual(p.imgs.length, 3);
  assert.strictEqual(p.img, 'data:image/webp;base64,AA', 'la portada es la primera foto');
});

test('Un respaldo viejo de una sola foto se convierte en galería', () => {
  // Los respaldos hechos antes de la galería traen "img", no "imgs".
  const p = JSON.parse(run(`JSON.stringify(normalizeProducts([
    {name:'X', img:'data:image/webp;base64,AA'}
  ])[0])`));
  assert.deepStrictEqual(p.imgs, ['data:image/webp;base64,AA']);
  assert.strictEqual(p.img, 'data:image/webp;base64,AA');
});

test('Una foto maliciosa no entra a la galería', () => {
  const p = JSON.parse(run(`JSON.stringify(normalizeProducts([
    {name:'X', imgs:['javascript:alert(1)','//otrodominio.com/rastreo.gif','data:text/html,<script>',
                     'https://otrodominio.com/foto.jpg','data:image/webp;base64,AA','/assets/img/real.jpg']}
  ])[0])`));
  assert.deepStrictEqual(p.imgs, ['data:image/webp;base64,AA','/assets/img/real.jpg'],
    'sólo sobreviven fotos incrustadas y archivos del propio sitio');
});

test('La galería se corta en el tope de fotos', () => {
  const n = run(`normalizeProducts([{name:'X',
    imgs: Array.from({length: MAX_FOTOS + 5}, () => 'data:image/webp;base64,AA')}])[0].imgs.length`);
  assert.strictEqual(n, run('MAX_FOTOS'));
});

test('Sin fotos, la galería es un arreglo vacío y no null', () => {
  // El resto del código hace p.imgs.length sin preguntar: un null reventaría.
  const p = JSON.parse(run(`JSON.stringify(normalizeProducts([{name:'X'}])[0])`));
  assert.deepStrictEqual(p.imgs, []);
  assert.strictEqual(p.img, null);
});

/* ── Simulador de financiamiento ──
   Aquí un error no es un detalle visual: es un número equivocado en la
   pantalla de alguien que está por comprometer millones de pesos. */
test('La mensualidad coincide con la fórmula de pagos iguales', () => {
  // $1,000,000 a 12 meses con 12% anual = $88,848.79 al mes.
  const m = run('mensualidadCredito(1000000, 12, 12)');
  assert.ok(Math.abs(m - 88848.79) < 0.01, `dio ${m}`);
});

test('A tasa cero se reparte el monto entre los meses', () => {
  // La fórmula normal se indetermina con tasa 0; este caso va aparte.
  assert.strictEqual(run('mensualidadCredito(120000, 0, 12)'), 10000);
});

test('Los pagos suman más que lo financiado cuando hay intereses', () => {
  const r = JSON.parse(run(`JSON.stringify(simularCredito(2850000, {enganche:20, plazo:36, tasa:16}))`));
  assert.strictEqual(r.pagoInicial, 570000, 'el 20% de 2.85 M');
  assert.strictEqual(r.financiado, 2280000);
  assert.ok(r.intereses > 0, 'con tasa positiva tiene que haber intereses');
  assert.strictEqual(r.total, 2850000 + r.intereses,
    'el total es el precio más los intereses, sin sorpresas');
});

test('A tasa cero el total es exactamente el precio', () => {
  // Multiplicar la mensualidad YA redondeada por el plazo arrastra el error y
  // llegaba a decir que pagabas menos que el equipo. Los totales usan la exacta.
  for(const plazo of [12, 24, 36, 48, 60]){
    const r = JSON.parse(run(`JSON.stringify(simularCredito(2850000, {enganche:50, plazo:${plazo}, tasa:0}))`));
    assert.strictEqual(r.total, 2850000, `a ${plazo} meses dio ${r.total}`);
    assert.strictEqual(r.intereses, 0, `a ${plazo} meses cobró ${r.intereses} de intereses`);
  }
});

test('Nunca sale más barato financiar que pagar de contado', () => {
  for(const tasa of [0, 5, 12, 16, 24]){
    const r = JSON.parse(run(`JSON.stringify(simularCredito(1500000, {enganche:20, plazo:48, tasa:${tasa}}))`));
    assert.ok(r.total >= 1500000, `al ${tasa}% el total quedó en ${r.total}`);
    assert.ok(r.intereses >= 0, `al ${tasa}% los intereses quedaron en ${r.intereses}`);
  }
});

test('Un enganche del 100% deja mensualidad en cero, no un error', () => {
  const r = JSON.parse(run(`JSON.stringify(simularCredito(500000, {enganche:100, plazo:36, tasa:16}))`));
  assert.strictEqual(r.financiado, 0);
  assert.strictEqual(r.mensual, 0);
  assert.strictEqual(r.intereses, 0);
  assert.strictEqual(r.total, 500000, 'pagar de contado cuesta el precio, ni un peso más');
});

test('El simulador se declara estimado y no una oferta de crédito', () => {
  // Presentar un cálculo como oferta en firme sería un problema, no un detalle.
  // El texto se parte en varias líneas en el código: comparamos sin importar
  // dónde caiga el salto, para que reacomodarlo no rompa la prueba.
  const html = run('calculadoraHTML(1000000, {})').replace(/\s+/g, ' ');
  assert.ok(/no es una oferta de crédito/i.test(html));
  assert.ok(/estimado/i.test(html));
});

test('Los meses sin intereses viajan con la calculadora', () => {
  // El texto ya no se hornea en el HTML: se calcula al pintar, porque en la
  // página de financiamiento el equipo cambia. Aquí verificamos el dato de
  // entrada; que el texto salga bien lo comprueba smoke.test.js.
  assert.ok(run(`calculadoraHTML(360000, {msi:'12 MSI'})`).includes('data-msi="12"'));
  assert.ok(run(`calculadoraHTML(360000, {})`).includes('data-msi=""'),
    'sin MSI no debe inventar un plazo');
});

/* ── Utilidades de marca ── */
test('Oscurecer un color devuelve hexadecimal válido', () => {
  assert.match(run(`darken('#F5C400')`), /^#[0-9a-f]{6}$/);
});

test('Un color inválido no rompe el sitio', () => {
  assert.strictEqual(run(`darken('no es un color')`), '#D4A900');
});


/* ══════════════════ VIDEO ══════════════════ */

test('Se reconoce el enlace de YouTube en las formas que la gente copia', () => {
  const id = 'dQw4w9WgXcQ';
  const formas = [
    'https://www.youtube.com/watch?v=' + id,
    'https://www.youtube.com/watch?v=' + id + '&t=30s',
    'https://youtu.be/' + id,
    'https://www.youtube.com/embed/' + id,
    'https://www.youtube.com/shorts/' + id,
    '  ' + id + '  ',
  ];
  for (const f of formas) {
    assert.strictEqual(run(`videoId(${JSON.stringify(f)})`), id, `no reconoció: ${f}`);
  }
});

test('Lo que no es un video de YouTube se descarta, no se guarda a medias', () => {
  /* Devolver el texto tal cual sería lo cómodo y lo peligroso: acabaría en la
     base una cadena que el sitio metería dentro de un iframe. */
  for (const malo of ['', null, undefined, 'javascript:alert(1)', 'https://ejemplo.com/video.mp4',
                      'https://www.youtube.com/watch?v=corto', '<script>x</script>']) {
    assert.strictEqual(run(`videoId(${JSON.stringify(malo ?? null)})`), null,
      `debió rechazar: ${malo}`);
  }
});

test('El video se reproduce sin cookies hasta que lo piden', () => {
  const url = run(`videoEmbed('dQw4w9WgXcQ')`);
  assert.ok(url.startsWith('https://www.youtube-nocookie.com/'),
    'un embed de youtube.com pondría cookies de rastreo nada más cargar: ' + url);
});

/* ══════════════════ FICHA TÉCNICA ══════════════════ */

test('Sólo se guardan las claves del catálogo de atributos', () => {
  const r = JSON.parse(run(`JSON.stringify(limpiarAtributos(
    {horas: 2400, potencia: '148', inventado: 'x', __proto__: 'y'}))`));
  assert.deepStrictEqual(r, { horas: 2400, potencia: 148 });
});

test('Un número imposible se descarta en vez de guardarse', () => {
  // Un peso negativo rompería el filtro sin que nadie lo notara hasta que un
  // equipo dejara de aparecer en las búsquedas.
  const r = JSON.parse(run(`JSON.stringify(limpiarAtributos(
    {horas: -50, peso: 'no es número', potencia: 148}))`));
  assert.deepStrictEqual(r, { potencia: 148 });
});

test('Una opción fuera de la lista no pasa', () => {
  assert.deepStrictEqual(
    JSON.parse(run(`JSON.stringify(limpiarAtributos({traccion: 'lo que sea'}))`)), {});
  assert.deepStrictEqual(
    JSON.parse(run(`JSON.stringify(limpiarAtributos({traccion: '4WD'}))`)), { traccion: '4WD' });
});

test('Los campos técnicos dependen de la categoría', () => {
  const exc = JSON.parse(run(`JSON.stringify(camposDe('Excavación').map(c=>c.k))`));
  const gru = JSON.parse(run(`JSON.stringify(camposDe('Elevación').map(c=>c.k))`));

  assert.ok(exc.includes('profundidad'), 'una excavadora excava');
  assert.ok(!gru.includes('profundidad'), 'una grúa torre no');
  assert.ok(gru.includes('pluma'));

  // Una categoría inventada desde el panel se queda con los universales, no con
  // una lista vacía: las horas y el peso los tiene cualquier máquina.
  const rara = JSON.parse(run(`JSON.stringify(camposDe('Categoría que no existe').map(c=>c.k))`));
  assert.deepStrictEqual(rara, ['horas', 'peso', 'potencia', 'motor', 'cabina']);
});

test('Los valores se muestran con su unidad', () => {
  const filas = JSON.parse(run(
    `JSON.stringify(fichaTecnica({atributos:{horas:2400, peso:20, alcance:6.5}}))`));
  const texto = Object.fromEntries(filas.map(f => [f.k, f.texto]));
  assert.strictEqual(texto.horas, '2,400 h');
  assert.strictEqual(texto.peso, '20 t', 'un entero no lleva decimales de adorno');
  assert.strictEqual(texto.alcance, '6.5 m', 'un decimal sí conserva el suyo');
});

test('La ficha técnica sale en el orden del catálogo, no en el que se capturó', () => {
  const orden = JSON.parse(run(
    `JSON.stringify(fichaTecnica({atributos:{potencia:148, horas:2400, peso:20}}).map(f=>f.k))`));
  assert.deepStrictEqual(orden, ['horas', 'peso', 'potencia'],
    'las horas van primero: es el dato que más se busca en maquinaria usada');
});

/* ══════════════════ FILTROS DE FICHA TÉCNICA ══════════════════ */

/**
 * Prepara un catálogo de prueba, aplica los filtros REALES del sitio y deja
 * todo como estaba.
 *
 * Se restaura `products` a propósito: es una variable global del contexto, y
 * una prueba que se lo deja pisado al siguiente hace fallar a otra por un
 * motivo que no tiene nada que ver con lo que prueba. Eso se persigue durante
 * horas.
 */
function conCatalogo(equipos, filtros) {
  /* La restauración tiene que ir por `run`, no por `ctx.products = …`.
     `products` se declara con `let`, y un `let` del ámbito global de un script
     NO es una propiedad del objeto global: asignarlo desde fuera crea otra
     variable distinta y la de verdad se queda pisada.

     Costó descubrirlo porque el síntoma aparece en OTRA prueba —las de
     búsqueda daban cero resultados— y ahí no hay nada que mirar. */
  ctx.__catalogoOriginal = run('products');
  try {
    run(`products = normalizeProducts(${JSON.stringify(equipos)})`);
    run(`Object.assign(state, {cat:'Todos',conds:[],brands:[],locations:[],finance:[],
         onlyFavs:false,min:null,max:null,q:'',horasMax:null,pesoMin:null,pesoMax:null})`);
    run(`Object.assign(state, ${JSON.stringify(filtros)})`);
    return JSON.parse(run('JSON.stringify(filterAll().map(p=>p.name))'));
  } finally {
    run('products = __catalogoOriginal');
    run(`Object.assign(state, {horasMax:null, pesoMin:null, pesoMax:null})`);
  }
}

test('Filtrar por horas deja fuera lo que no cumple', () => {
  const eq = [
    { name: 'Poco usada', cond: 'Usado', atributos: { horas: 1200 } },
    { name: 'Muy usada',  cond: 'Usado', atributos: { horas: 9000 } },
  ];
  assert.deepStrictEqual(conCatalogo(eq, { horasMax: 3000 }), ['Poco usada']);
  assert.deepStrictEqual(conCatalogo(eq, {}).length, 2, 'sin filtro salen las dos');
});

test('Un equipo nuevo pasa el filtro de horas aunque no las tenga capturadas', () => {
  /* Es la decisión que hace que el filtro sirva: un nuevo tiene cero horas por
     definición y esconderlo de "hasta 3,000 h" sería absurdo. */
  const eq = [
    { name: 'Nuevo sin dato',  cond: 'Nuevo', atributos: {} },
    { name: 'Usado sin dato',  cond: 'Usado', atributos: {} },
  ];
  assert.deepStrictEqual(conCatalogo(eq, { horasMax: 3000 }), ['Nuevo sin dato'],
    'un usado sin horas capturadas no puede prometerse como de pocas horas');
});

test('El filtro de peso deja pasar lo que no tiene el dato', () => {
  /* Al revés que las horas, y a propósito: el peso se deduce del modelo, y
     quien busca "de 15 a 25 t" prefiere ver una de más y descartarla él. */
  const eq = [
    { name: 'Chica',   cond: 'Usado', atributos: { peso: 4 } },
    { name: 'Mediana', cond: 'Usado', atributos: { peso: 20 } },
    { name: 'Sin dato', cond: 'Usado', atributos: {} },
  ];
  assert.deepStrictEqual(conCatalogo(eq, { pesoMin: 15, pesoMax: 25 }), ['Mediana', 'Sin dato']);
});

test('Los filtros nuevos cuentan en el contador de filtros activos', () => {
  run(`Object.assign(state, {horasMax:3000, pesoMin:10, pesoMax:null})`);
  assert.strictEqual(run('activeFilterCount()'), 2);
  run(`Object.assign(state, {horasMax:null, pesoMin:null, pesoMax:null})`);
});

/* ══════════════════ PREGUNTAS ══════════════════ */

test('Una pregunta sin respuesta no llega a la ficha', () => {
  /* Publicar una pregunta colgada sin contestar dice de la empresa justo lo
     contrario de lo que se busca al abrir este canal. */
  const qa = JSON.parse(run(`JSON.stringify(normalizeProducts([{name:'X', qa:[
    {nombre:'Ana', pregunta:'¿Tiene factura?', respuesta:'Sí, factura A.'},
    {nombre:'Luis', pregunta:'¿Cuántas horas?'}
  ]}])[0].qa)`));
  assert.strictEqual(qa.length, 1);
  assert.strictEqual(qa[0].nombre, 'Ana');
});


/* ══════════════════ BUSCADOR ══════════════════
   Cada consulta que devuelve "sin resultados" teniendo el equipo es un cliente
   que ya estaba buscando lo tuyo y se va creyendo que no lo tienes. */

/** Busca en el catálogo real y devuelve los nombres encontrados. */
function buscar(texto) {
  run(`Object.assign(state, {cat:'Todos',conds:[],brands:[],locations:[],finance:[],
       onlyFavs:false,min:null,max:null,horasMax:null,pesoMin:null,pesoMax:null,
       q:${JSON.stringify(texto)}})`);
  const r = JSON.parse(run('JSON.stringify(filterAll().map(p=>p.name))'));
  run(`state.q = ''`);
  return r;
}

test('Buscar sin acentos encuentra igual', () => {
  // Medio país escribe sin acentos, y "nivelacion" no traía nada.
  assert.ok(buscar('excavacion').length > 0, 'excavacion');
  assert.ok(buscar('nivelacion').length > 0, 'nivelacion');
  assert.ok(buscar('compactacion').length > 0, 'compactacion');
});

test('Buscar con mayúsculas o acentos de más da lo mismo', () => {
  assert.deepStrictEqual(buscar('EXCAVADORA'), buscar('excavadora'));
  assert.deepStrictEqual(buscar('Excavación'), buscar('excavacion'));
});

test('Una errata de una letra no deja al cliente sin resultados', () => {
  const bien = buscar('excavadora');
  assert.ok(bien.length > 0, 'la prueba no vale si no hay excavadoras');
  for (const errata of ['escavadora', 'excabadora', 'exacavadora']) {
    assert.ok(buscar(errata).length > 0, `"${errata}" no encontró nada`);
  }
});

test('Como le dice la gente también encuentra', () => {
  // "rodillo" y "aplanadora" no aparecen en ninguna ficha, pero es como se
  // pide un compactador en obra.
  assert.ok(buscar('rodillo').length > 0, 'rodillo → compactador');
  assert.ok(buscar('tractor').length > 0, 'tractor → bulldozer');
  assert.ok(buscar('retro').length > 0, 'retro → retroexcavadora');
});

test('Varias palabras se cruzan, no se suman', () => {
  /* Quien escribe "excavadora komatsu" quiere la intersección. Si fuera un O,
     saldrían todas las excavadoras más todos los Komatsu y el buscador sería
     inútil justo cuando alguien afina la búsqueda. */
  const cruce = buscar('excavadora komatsu');
  assert.ok(cruce.length > 0 && cruce.length < buscar('excavadora').length,
    `"excavadora komatsu" devolvió ${cruce.length}, "excavadora" ${buscar('excavadora').length}`);
  assert.ok(cruce.every(n => /komatsu/i.test(n)), cruce.join(', '));
});

test('Lo que de verdad no existe sigue sin aparecer', () => {
  /* El riesgo de perdonar erratas es perdonar de más: si "helicóptero"
     devolviera excavadoras, el buscador dejaría de servir para descartar. */
  for (const nada of ['helicoptero', 'zapatos', 'xyzabc']) {
    assert.deepStrictEqual(buscar(nada), [], `"${nada}" devolvió resultados`);
  }
});

test('Las palabras cortas no perdonan erratas', () => {
  // Con una letra de margen, "cat" pasaría por "gas", "can" y "car".
  assert.strictEqual(run(`margen('cat')`), 0);
  assert.strictEqual(run(`margen('bomag')`), 1);
  assert.strictEqual(run(`margen('excavadora')`), 2);
});

test('La distancia se corta en cuanto se pasa del tope', () => {
  // Corre una vez por palabra y por equipo en CADA tecla: si no frena, el
  // buscador se siente lento justo en un celular de obra.
  assert.strictEqual(run(`distancia('excavadora','excavadora',2)`), 0);
  assert.strictEqual(run(`distancia('escavadora','excavadora',2)`), 1);
  assert.ok(run(`distancia('excavadora','compactador',2)`) > 2);
});

test('Una búsqueda vacía no filtra nada', () => {
  assert.strictEqual(buscar('').length, run('products.length'));
  assert.strictEqual(buscar('   ').length, run('products.length'));
});

console.log(`\n${pass}/${pass + fail} pruebas unitarias pasaron`);
process.exit(fail ? 1 : 0);
