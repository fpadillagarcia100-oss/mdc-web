/**
 * atributos.js — La ficha técnica: qué datos tiene una máquina y cómo se leen.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 *
 * ── Por qué existe ──
 *
 * Hasta ahora las especificaciones eran tres textos libres: "20 ton",
 * "148 HP", "2,400 hrs". Se ven bien y no sirven para nada más, porque nadie
 * —ni el código ni Google— sabe cuál de los tres es el peso.
 *
 * Eso tiene tres consecuencias que se notan al vender:
 *   · No se puede filtrar "excavadoras de menos de 3,000 horas".
 *   · El comparador no puede decir cuál de dos máquinas tiene más potencia.
 *   · Cada quien escribe la unidad como quiere y la ficha parece improvisada.
 *
 * Aquí las claves están definidas. `atributos` en la base guarda
 * {"horas": 2400, "peso": 20}, y este archivo es lo único que sabe qué
 * significa cada clave, en qué unidad va y a qué categorías aplica.
 *
 * ── Regla ──
 *
 * Este archivo NO toca el DOM ni genera HTML. Devuelve datos.
 *
 * No es purismo: tools/build.js lo ejecuta dentro de un `vm` para armar las
 * fichas estáticas, donde no hay `document`. Si aquí apareciera un
 * `querySelector`, la compilación reventaría — y peor, sólo la compilación,
 * así que se descubriría al desplegar.
 *
 * Las especificaciones libres NO desaparecen: siguen siendo el resumen de tres
 * líneas de la tarjeta. Lo que cambia es que ya no son lo único.
 */
'use strict';

/**
 * Catálogo de datos técnicos.
 *
 *   k        clave en la base. NO se cambia una vez usada: es lo que hay
 *            guardado en `equipos.atributos` de cada máquina.
 *   tipo     'num' | 'texto' | 'opcion'
 *   mejor    'mayor' o 'menor' — sólo donde de verdad significa algo. Más
 *            potencia es mejor; menos horas es mejor. Un ancho de tambor
 *            mayor no es mejor, depende de la obra, así que va sin marcar y
 *            el comparador no resalta nada en ese renglón.
 *   cats     '*' = aplica a todo. Una lista = sólo a esas categorías.
 *
 * El orden de esta lista es el orden en que se ven en la ficha y en el
 * formulario. Lo primero es lo que más pesa al decidir una compra de segunda
 * mano: cuántas horas lleva encima.
 */
const FICHA_TECNICA = [
  { k: 'horas',       etq: 'Horas de uso',              unidad: 'h',  tipo: 'num', mejor: 'menor', cats: '*' },
  { k: 'peso',        etq: 'Peso operativo',            unidad: 't',  tipo: 'num', cats: '*' },
  { k: 'potencia',    etq: 'Potencia',                  unidad: 'HP', tipo: 'num', mejor: 'mayor', cats: '*' },
  { k: 'motor',       etq: 'Motor',                     tipo: 'texto', cats: '*' },
  { k: 'cabina',      etq: 'Cabina',                    tipo: 'opcion',
    opciones: ['Cerrada con A/C', 'Cerrada', 'Abierta / ROPS'], cats: '*' },

  { k: 'alcance',     etq: 'Alcance máximo',            unidad: 'm',  tipo: 'num', cats: ['Excavación', 'Elevación'] },
  { k: 'profundidad', etq: 'Profundidad de excavación', unidad: 'm',  tipo: 'num', cats: ['Excavación'] },
  { k: 'cucharon',    etq: 'Capacidad del cucharón',    unidad: 'm³', tipo: 'num', cats: ['Excavación', 'Carga'] },

  { k: 'traccion',    etq: 'Tracción',                  tipo: 'opcion',
    opciones: ['Orugas', '4WD', '2WD'], cats: ['Carga', 'Nivelación', 'Compactación'] },
  { k: 'hoja',        etq: 'Ancho de hoja',             unidad: 'm',  tipo: 'num', cats: ['Nivelación'] },
  { k: 'ripper',      etq: 'Ripper',                    tipo: 'opcion',
    opciones: ['Incluido', 'No incluye'], cats: ['Nivelación'] },
  { k: 'tambor',      etq: 'Ancho de tambor',           unidad: 'm',  tipo: 'num', cats: ['Compactación'] },

  { k: 'carga',       etq: 'Capacidad de carga',        unidad: 't',  tipo: 'num', mejor: 'mayor', cats: ['Elevación', 'Carga'] },
  { k: 'pluma',       etq: 'Longitud de pluma',         unidad: 'm',  tipo: 'num', cats: ['Elevación'] },
  { k: 'altura',      etq: 'Altura de elevación',       unidad: 'm',  tipo: 'num', cats: ['Elevación', 'Carga'] },
];

const FICHA_POR_CLAVE = FICHA_TECNICA.reduce((m, c) => { m[c.k] = c; return m }, {});

/**
 * Campos que aplican a una categoría.
 *
 * Una categoría desconocida —el panel deja inventarlas— se queda con los
 * universales. Es lo correcto: mejor cinco campos ciertos que treinta que no
 * vienen a cuento, y el día que esa categoría crezca se añade aquí.
 */
function camposDe(cat) {
  return FICHA_TECNICA.filter(c => c.cats === '*' || c.cats.indexOf(cat) >= 0);
}

/**
 * Limpia lo que venga de fuera y deja un objeto guardable.
 *
 * Descarta las claves que no están en el catálogo. Esto importa más de lo que
 * parece: `atributos` es la única columna del esquema donde cabe cualquier
 * forma, así que sin este filtro un respaldo importado a mano podría meter
 * campos que luego nadie sabe de dónde salieron.
 */
function limpiarAtributos(crudo) {
  const salida = {};
  if (!crudo || typeof crudo !== 'object') return salida;

  for (const campo of FICHA_TECNICA) {
    const v = crudo[campo.k];
    if (v === undefined || v === null || v === '') continue;

    if (campo.tipo === 'num') {
      const n = Number(v);
      // Un número negativo o absurdo es un error de tecleo, no un dato. Se
      // descarta en vez de guardarse: un peso de -20 t rompería el filtro.
      if (Number.isFinite(n) && n >= 0 && n < 1e7) salida[campo.k] = n;
    } else if (campo.tipo === 'opcion') {
      if (campo.opciones.indexOf(String(v)) >= 0) salida[campo.k] = String(v);
    } else {
      const t = String(v).trim().slice(0, 60);
      if (t) salida[campo.k] = t;
    }
  }
  return salida;
}

/** Formatea un valor con su unidad. 2400 → "2,400 h". */
function textoAtributo(campo, valor) {
  if (campo.tipo !== 'num') return String(valor);
  const n = Number(valor);
  // Sin decimales cuando es entero: "20 t" se lee mejor que "20.0 t", y
  // "6.5 m" necesita el suyo. El formato lo decide el dato, no una regla fija.
  const txt = Number.isInteger(n) ? n.toLocaleString('es-MX') : String(n);
  return campo.unidad ? `${txt} ${campo.unidad}` : txt;
}

/**
 * La ficha técnica de un equipo, lista para pintar.
 *
 * Devuelve sólo lo que tiene valor, en el orden del catálogo. Un renglón
 * vacío no aporta nada y hace que la tabla parezca incompleta.
 *
 * @returns {Array<{k:string, etq:string, valor:*, texto:string, mejor:string|undefined}>}
 */
function fichaTecnica(eq) {
  const a = (eq && eq.atributos) || {};
  return FICHA_TECNICA
    .filter(c => a[c.k] !== undefined && a[c.k] !== null && a[c.k] !== '')
    .map(c => ({ k: c.k, etq: c.etq, valor: a[c.k], texto: textoAtributo(c, a[c.k]), mejor: c.mejor }));
}

/** ¿Tiene este equipo algún dato técnico capturado? */
const tieneFichaTecnica = eq => fichaTecnica(eq).length > 0;

/**
 * Saca el identificador de YouTube de lo que sea que peguen.
 *
 * Acepta las cuatro formas que la gente copia de verdad: la barra de
 * direcciones, el botón "Compartir", el enlace corto y el de un Short. Y
 * acepta el identificador suelto, porque es lo que se guarda en la base y hay
 * que poder volver a leerlo.
 *
 * Devuelve null si no reconoce nada. Devolver el texto tal cual sería peor:
 * acabaría en la base una cadena que el sitio intentaría meter en un iframe.
 *
 * @returns {string|null} identificador de 11 caracteres
 */
function videoId(texto) {
  const s = String(texto || '').trim();
  if (!s) return null;

  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;

  const patrones = [
    /(?:youtube\.com|youtube-nocookie\.com)\/watch\?(?:.*&)?v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com|youtube-nocookie\.com)\/(?:embed|shorts|v)\/([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patrones) {
    const m = p.exec(s);
    if (m) return m[1];
  }
  return null;
}

/* `youtube-nocookie.com` y no `youtube.com`: no deja cookies de rastreo hasta
   que alguien le da al play, y el sitio nunca carga el reproductor hasta ese
   clic. La diferencia práctica es que quien sólo mira las fotos no queda
   fichado por Google, y la ficha no arrastra el peso del reproductor. */
const videoEmbed = id => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`;
const videoPagina = id => `https://www.youtube.com/watch?v=${id}`;
