/**
 * codigo-muerto.js — Encuentra lo que ya no usa nadie.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 *
 * Se corre con:  npm run muerto
 *
 * Un `grep` a ojo no sirve para esto y es peligroso: borra funciones que se
 * llaman desde otro archivo, desde una prueba o desde una plantilla. Aquí se
 * analiza el árbol de sintaxis de TODO —el sitio, las herramientas, las
 * pruebas, el trabajador de servicio y las funciones del borde— y sólo se
 * señala lo que no aparece referenciado en ningún sitio.
 *
 * Aun así NO borra nada. Propone, con el archivo y la línea, y la decisión es
 * de quien lee: hay motivos legítimos para conservar algo sin usar —una pieza
 * a medio construir, una utilidad que se documenta sola— y una herramienta no
 * puede distinguirlos.
 *
 * ── El único caso que no puede ver ──
 *
 * Una función llamada por su nombre en texto: `window[nombre]()`, un
 * `onclick="algo()"` en HTML, o `ev('render()')` dentro de una prueba. Por eso
 * se rastrean también las CADENAS de texto de todo el proyecto y se marca como
 * "citada en texto" lo que aparezca ahí. Mejor un aviso de más que borrar algo
 * que se invocaba desde una cadena.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const espree = require('espree');

const ROOT = path.join(__dirname, '..');
const { contrato, consumos } = require('./contrato-globales');

/** Todos los .js del proyecto que escribimos nosotros. */
function archivosPropios() {
  const dirs = ['assets/js', 'tools', 'tests', 'tests/lib', 'functions/api'];
  const salida = [];
  for (const d of dirs) {
    const abs = path.join(ROOT, d);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs)) {
      if (!f.endsWith('.js')) continue;
      // sitio.js es la concatenación generada: contarlo duplicaría todo.
      if (f === 'sitio.js') continue;
      salida.push(path.join(d, f).replace(/\\/g, '/'));
    }
  }
  salida.push('sw.js');
  return salida.filter(f => fs.existsSync(path.join(ROOT, f)));
}

/** Las cadenas de texto de un archivo, donde puede esconderse una llamada. */
function cadenas(codigo, esModulo) {
  const texto = [];
  try {
    const arbol = espree.parse(codigo, {
      ecmaVersion: 2023,
      sourceType: esModulo ? 'module' : 'script',
    });
    const visitar = n => {
      if (!n || typeof n.type !== 'string') return;
      if (n.type === 'Literal' && typeof n.value === 'string') texto.push(n.value);
      if (n.type === 'TemplateElement') texto.push(n.value.raw);
      for (const k of Object.keys(n)) {
        if (k === 'type' || k === 'loc' || k === 'range') continue;
        const v = n[k];
        if (Array.isArray(v)) v.forEach(visitar);
        else if (v && typeof v.type === 'string') visitar(v);
      }
    };
    visitar(arbol);
  } catch { /* si no parsea, se ignora: otro paso ya lo reportará */ }
  return texto.join('\n');
}

const { aporta } = contrato();

// Cuántas veces se REFERENCIA cada nombre en todo el proyecto.
const referencias = new Map();
let textoDelProyecto = '';

for (const rel of archivosPropios()) {
  const codigo = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const esModulo = rel.startsWith('functions/');
  textoDelProyecto += '\n' + cadenas(codigo, esModulo);

  let usados;
  try {
    usados = consumos(codigo);
  } catch {
    // functions/ son módulos: consumos() los lee como script y falla. Se
    // recorren igual, con el analizador en el modo que toca.
    try {
      const arbol = espree.parse(codigo, { ecmaVersion: 2023, sourceType: 'module' });
      usados = new Map();
      const visitar = (n, padre) => {
        if (!n || typeof n.type !== 'string') return;
        if (n.type === 'Identifier') {
          const esProp = padre && padre.type === 'MemberExpression' && padre.property === n && !padre.computed;
          const esClave = padre && padre.type === 'Property' && padre.key === n && !padre.computed;
          if (!esProp && !esClave) usados.set(n.name, { enCarga: false });
          return;
        }
        for (const k of Object.keys(n)) {
          if (k === 'type' || k === 'loc' || k === 'range') continue;
          const v = n[k];
          if (Array.isArray(v)) v.forEach(h => visitar(h, n));
          else if (v && typeof v.type === 'string') visitar(v, n);
        }
      };
      visitar(arbol, null);
    } catch { usados = new Map() }
  }

  const propias = aporta.get(rel) || new Set();
  for (const nombre of usados.keys()) {
    /* Dentro de su propio archivo, la declaración misma cuenta como aparición.
       Sólo interesa el USO, así que las referencias del archivo que lo declara
       se cuentan aparte y se restan más abajo. */
    const clave = propias.has(nombre) ? `propio:${nombre}` : nombre;
    referencias.set(clave, (referencias.get(clave) || 0) + 1);
  }
}

/* ── El informe ── */
const muertas = [];
const soloEnSuArchivo = [];

for (const [rel, nombres] of aporta) {
  const codigo = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const nombre of nombres) {
    const fuera = referencias.get(nombre) || 0;
    // Veces que aparece el identificador dentro de su propio archivo. Una es
    // la declaración; más de una significa que se usa ahí dentro.
    const dentro = (codigo.match(new RegExp(`\\b${nombre}\\b`, 'g')) || []).length;
    const citada = new RegExp(`\\b${nombre}\\b`).test(textoDelProyecto);

    if (fuera === 0 && dentro <= 1 && !citada) {
      const linea = codigo.split('\n').findIndex(l => new RegExp(`\\b${nombre}\\b`).test(l)) + 1;
      muertas.push({ nombre, rel, linea });
    } else if (fuera === 0 && !citada) {
      soloEnSuArchivo.push({ nombre, rel });
    }
  }
}

console.log('\n══ NO LAS USA NADIE ══');
if (!muertas.length) console.log('  (ninguna)');
for (const m of muertas) console.log(`  ${m.rel}:${m.linea}  ${m.nombre}`);

console.log('\n══ SÓLO SE USAN DENTRO DE SU ARCHIVO ══');
console.log('   No sobran: sobra que sean globales. Encerrarlas quitaría');
console.log('   nombres del contrato que comparten los 24 archivos.\n');
const porArchivo = new Map();
for (const s of soloEnSuArchivo) {
  if (!porArchivo.has(s.rel)) porArchivo.set(s.rel, []);
  porArchivo.get(s.rel).push(s.nombre);
}
for (const [rel, nombres] of [...porArchivo].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${rel} (${nombres.length}): ${nombres.join(', ')}`);
}
console.log(`\n${muertas.length} sin uso · ${soloEnSuArchivo.length} privadas de su archivo\n`);

/* ── CSS ─────────────────────────────────────────────────────────────────────
 *
 * Las hojas de estilo acumulan más basura que el código, porque borrar una
 * regla nunca rompe nada visible el mismo día. Se buscan las clases del CSS
 * que no aparecen en ningún HTML ni en ninguna cadena de JavaScript.
 *
 * Con una salvedad importante: aquí las clases se escriben dentro de plantillas
 * (`class="pcard ${agotado?'agotado':''}"`), así que basta con que el NOMBRE
 * aparezca en algún texto del proyecto. Y aun así puede haber falsos positivos
 * si alguna se compone a trozos. Por eso esto también propone, no borra.
 */
function claseUsada(nombre, texto) {
  // Delimitada por lo que puede rodear a una clase en HTML o en una plantilla.
  return new RegExp(`(^|[\\s"'\`.,>(\\[{;:+~$])${nombre}($|[\\s"'\`.,)\\]}$;:+~-])`).test(texto)
      || new RegExp(`\\b${nombre}\\b`).test(texto);
}

function marcadoDelProyecto() {
  let texto = '';
  const leer = dir => {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      const st = fs.statSync(p);
      if (st.isDirectory()) { if (f !== 'node_modules' && f !== 'dist' && f !== '.git') leer(p); continue }
      if (/\.(html|js)$/.test(f) && f !== 'sitio.js') texto += '\n' + fs.readFileSync(p, 'utf8');
    }
  };
  leer(ROOT);
  return texto;
}

const css = fs.readFileSync(path.join(ROOT, 'assets/css/styles.css'), 'utf8');
const marcado = marcadoDelProyecto();
const clases = new Set();
for (const m of css.matchAll(/\.([a-zA-Z][\w-]*)/g)) clases.add(m[1]);

const cssHuerfanas = [...clases].filter(c => !claseUsada(c, marcado)).sort();

console.log('══ CLASES DEL CSS QUE NADIE APLICA ══');
console.log(cssHuerfanas.length ? '  ' + cssHuerfanas.join(', ') : '  (ninguna)');
console.log(`\n${cssHuerfanas.length} de ${clases.size} clases\n`);
