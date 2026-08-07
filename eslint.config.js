/**
 * eslint.config.js — El linter del proyecto.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 *
 * Lo que se persigue aquí NO es el estilo. Comillas, punto y coma y sangría
 * los decide quien escribe; discutirlo con una herramienta es tiempo tirado.
 *
 * Lo que se persigue es lo que este proyecto puede romper de verdad. El sitio
 * se apoya en variables globales compartidas entre 21 archivos, y ahí el fallo
 * típico es un nombre mal escrito: `renderVistas()` en vez de `renderVistos()`
 * no falla al cargar, no falla en las pruebas y falla el día que un cliente
 * pulsa el botón. `no-undef` con el contrato completo declarado lo convierte
 * en un error de compilación.
 *
 * La lista de globales NO está escrita a mano: sale de leer el código, en
 * tools/contrato-globales.js. Una lista a mano envejece el día que alguien
 * añade una función, y entonces se desactiva la regla en vez de arreglarla.
 */
'use strict';

const { contrato } = require('./tools/contrato-globales');

/* Todo lo que aportan los 21 archivos del sitio, como escribible: son globales
   de script clásico y varios se reasignan (`products`, `cart`, `isAdmin`). */
const delSitio = Object.fromEntries(contrato().todos.map(n => [n, 'writable']));

/* Del navegador. Se listan los que se usan de verdad en lugar de traer un
   paquete de globales entero: así, si mañana alguien usa `alert`, salta y se
   discute — que es justo cuando hay que discutirlo. */
const navegador = {
  window: 'readonly', document: 'readonly', location: 'readonly', navigator: 'readonly',
  localStorage: 'readonly', sessionStorage: 'readonly', console: 'readonly',
  fetch: 'readonly', Response: 'readonly', Request: 'readonly', Headers: 'readonly',
  FormData: 'readonly', Blob: 'readonly', File: 'readonly', FileReader: 'readonly',
  URL: 'readonly', URLSearchParams: 'readonly', AbortSignal: 'readonly', AbortController: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
  requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
  performance: 'readonly', crypto: 'readonly', matchMedia: 'readonly', getComputedStyle: 'readonly',
  MutationObserver: 'readonly', IntersectionObserver: 'readonly', ResizeObserver: 'readonly',
  CustomEvent: 'readonly', Event: 'readonly', Image: 'readonly', TextEncoder: 'readonly',
  createImageBitmap: 'readonly', OffscreenCanvas: 'readonly', DOMParser: 'readonly', CSS: 'readonly',
  atob: 'readonly', btoa: 'readonly', structuredClone: 'readonly',
  innerWidth: 'readonly', innerHeight: 'readonly', scrollTo: 'readonly', history: 'readonly',
  alert: 'readonly', confirm: 'readonly', prompt: 'readonly', caches: 'readonly', self: 'readonly',
};

const node = {
  require: 'readonly', module: 'writable', exports: 'writable',
  process: 'readonly', __dirname: 'readonly', __filename: 'readonly',
  console: 'readonly', Buffer: 'readonly', URL: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', fetch: 'readonly',
  TextEncoder: 'readonly', TextDecoder: 'readonly', AbortSignal: 'readonly', AbortController: 'readonly',
  Response: 'readonly', Request: 'readonly', performance: 'readonly', structuredClone: 'readonly',
};

/* Las reglas que sí atrapan fallos. Cada una está aquí por un motivo, no por
   venir en una lista recomendada. */
const reglasDeFondo = {
  'no-undef': 'error',                                  // el nombre mal escrito
  /* Sólo ámbito local. Una función global la usa OTRO archivo y ESLint no
     puede verlo: dejarlo en 'all' produciría 40 avisos falsos, y 40 avisos
     falsos son la forma más segura de que nadie vuelva a leer la salida.
     De las globales muertas se encarga tests/arquitectura.test.js, que sí
     mira los 21 archivos a la vez. */
  'no-unused-vars': ['warn', { args: 'none', vars: 'local', varsIgnorePattern: '^_' }],
  'no-dupe-keys': 'error',
  'no-dupe-args': 'error',
  'no-duplicate-case': 'error',
  'no-func-assign': 'error',
  'no-unreachable': 'error',
  'no-fallthrough': 'error',
  'no-cond-assign': 'error',                            // el `if (a = b)` de siempre
  'no-constant-condition': ['error', { checkLoops: false }],
  'no-self-compare': 'error',
  'no-unsafe-negation': 'error',
  'no-sparse-arrays': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
  'no-implicit-globals': 'off',                         // aquí son el mecanismo, no un accidente
  /* Baja a aviso: en este código son casi todos estado de interfaz reasignado
     tras un await y ya protegido por banderas propias (pidiendoSolicitudes,
     pidiendoPreguntas). Como error bloquearía por ruido; como aviso sigue
     señalando el sitio si algún día aparece una carrera de verdad. */
  'require-atomic-updates': 'warn',
  eqeqeq: ['warn', 'smart'],
};

module.exports = [
  { ignores: ['node_modules/**', 'dist/**', 'assets/js/sitio.js', 'assets/js/catalogo-datos.js', 'supabase/**'] },

  // El sitio: scripts clásicos que comparten globales.
  {
    files: ['assets/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: { ...navegador, ...delSitio, CATALOGO: 'readonly', BACKEND_CONFIG: 'readonly',
                 CATALOGO_HUELLA: 'readonly' },
    },
    rules: reglasDeFondo,
  },

  // El trabajador de servicio vive en otro mundo: sin DOM y con sus propias APIs.
  {
    files: ['sw.js'],
    languageOptions: {
      ecmaVersion: 2023, sourceType: 'script',
      globals: { self: 'readonly', caches: 'readonly', fetch: 'readonly', Response: 'readonly',
                 URL: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', console: 'readonly' },
    },
    rules: reglasDeFondo,
  },

  // Herramientas y pruebas: Node.
  {
    files: ['tools/**/*.js', 'tests/**/*.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: node },
    rules: reglasDeFondo,
  },

  /* La prueba visual es un caso mixto de verdad: el archivo corre en Node,
     pero las funciones que entran en page.evaluate() se ejecutan DENTRO del
     navegador y ven el DOM y las globales del sitio. Es real, no un atajo. */
  {
    files: ['tests/visual.test.js'],
    languageOptions: {
      ecmaVersion: 2023, sourceType: 'commonjs',
      globals: { ...node, ...navegador, ...delSitio },
    },
    rules: reglasDeFondo,
  },

  // Las funciones de Cloudflare son módulos y corren en el borde.
  {
    files: ['functions/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023, sourceType: 'module',
      globals: { Response: 'readonly', Request: 'readonly', fetch: 'readonly', crypto: 'readonly',
                 TextEncoder: 'readonly', console: 'readonly', URL: 'readonly' },
    },
    rules: reglasDeFondo,
  },
];
