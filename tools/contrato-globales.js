/**
 * contrato-globales.js — Quién aporta qué, y en qué orden.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 *
 * ── El problema que resuelve ──
 *
 * Los 21 scripts del sitio no son módulos: se cargan como scripts clásicos y
 * se hablan por variables globales. `render()` vive en catalog.js y lo llama
 * main.js sin importar nada.
 *
 * Eso funciona, pero deja dos agujeros. El primero: el contrato es invisible.
 * Nadie puede saber qué aporta un archivo sin leerlo entero, y una función
 * mal escrita —`renderVistas()` en vez de `renderVistos()`— no se nota hasta
 * que alguien pulsa el botón. El segundo: el orden de carga sólo existe en el
 * orden de las etiquetas del HTML, y usar algo de un archivo que carga DESPUÉS
 * revienta en producción y no en las pruebas, porque para cuando la prueba
 * hace clic ya cargó todo.
 *
 * Esto lee el código y deduce el contrato: qué global aporta cada archivo y en
 * qué posición se carga. De ahí beben el linter (eslint.config.js) y la prueba
 * de arquitectura (tests/arquitectura.test.js), así que no hay una lista que
 * mantener a mano y que envejezca.
 *
 * Analiza de verdad en lugar de usar expresiones regulares. El primer intento
 * fue con regex y falló a la primera: `let lastFocused = null, openPanel = null;`
 * declara DOS globales y una regex razonable sólo ve la primera. El resultado
 * fue que el linter marcó `openPanel` como inexistente cuando existía. Un
 * contrato que se equivoca es peor que no tenerlo, porque se acaba desactivando.
 *
 * El analizador es `espree`, que es el mismo que usa ESLint por dentro. No es
 * casualidad: si el contrato leyera el código con otro analizador, los dos
 * podrían discrepar sobre qué declara un archivo, y ese desacuerdo sería
 * exactamente el tipo de fallo que nadie encuentra.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const espree = require('espree');

const ROOT = path.join(__dirname, '..');

/** Los scripts del sitio, en el orden EXACTO en que los carga el navegador. */
function ordenDeCarga() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  return (html.match(/<script\s+src="(assets\/js\/[^"]+)"/g) || [])
    .map(t => t.match(/src="([^"]+)"/)[1]);
}

/**
 * Los identificadores que un archivo pone en el objeto global.
 *
 * Sólo el nivel superior del archivo: lo que está dentro de una función o de
 * un bloque no es global, y una envoltura `(function(){ ... })()` —como la de
 * motion.js y pwa.js— no aporta nada a nadie, que es justo su gracia.
 */
function aportaciones(codigo) {
  const arbol = espree.parse(codigo, { ecmaVersion: 2023, sourceType: 'script' });
  const nombres = new Set();

  /* Un patrón puede ser un nombre suelto o una desestructuración de objeto o
     de array, y anidarse. Se recorre entero en vez de suponer el caso fácil. */
  const delPatron = p => {
    if (!p) return;
    if (p.type === 'Identifier') nombres.add(p.name);
    else if (p.type === 'ObjectPattern') p.properties.forEach(x => delPatron(x.value || x.argument));
    else if (p.type === 'ArrayPattern') p.elements.forEach(delPatron);
    else if (p.type === 'AssignmentPattern') delPatron(p.left);
    else if (p.type === 'RestElement') delPatron(p.argument);
  };

  for (const nodo of arbol.body) {
    if (nodo.type === 'FunctionDeclaration' || nodo.type === 'ClassDeclaration') {
      if (nodo.id) nombres.add(nodo.id.name);
    } else if (nodo.type === 'VariableDeclaration') {
      // `let a = 1, b = 2;` son dos globales, no una.
      nodo.declarations.forEach(d => delPatron(d.id));
    }
  }
  return nombres;
}

/**
 * Los identificadores que un archivo USA y no declara él mismo.
 *
 * Es la otra mitad del contrato: sin esto se sabe quién ofrece qué, pero no
 * quién depende de quién, que es lo que decide si el orden de carga es
 * correcto.
 */
function consumos(codigo) {
  const arbol = espree.parse(codigo, { ecmaVersion: 2023, sourceType: 'script' });
  /* Map<nombre, {enCarga}>. `enCarga` distingue lo que se ejecuta MIENTRAS se
     carga el archivo de lo que está dentro de una función y por tanto no corre
     hasta que alguien la llame. La diferencia lo es todo: usar algo de un
     archivo posterior dentro de una función es un olor de diseño, y hacerlo en
     el cuerpo del archivo es un error que revienta al abrir la página. */
  const usados = new Map();
  const anota = (nombre, dentroDeFuncion) => {
    const ya = usados.get(nombre);
    if (ya) ya.enCarga = ya.enCarga || !dentroDeFuncion;
    else usados.set(nombre, { enCarga: !dentroDeFuncion });
  };
  const ES_FUNCION = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

  /* Recorrido genérico del árbol. Se salta dos sitios donde un identificador
     NO es una referencia a una variable: el nombre de una propiedad en
     `obj.prop` y la clave de un objeto literal. Confundirlos haría creer que
     `catalogo.render` usa la global `render`. */
  const visitar = (nodo, padre, dentro) => {
    if (!nodo || typeof nodo.type !== 'string') return;

    if (nodo.type === 'Identifier') {
      const esPropiedad = padre && padre.type === 'MemberExpression' &&
                          padre.property === nodo && !padre.computed;
      const esClave = padre && padre.type === 'Property' && padre.key === nodo && !padre.computed;
      if (!esPropiedad && !esClave) anota(nodo.name, dentro);
      return;
    }

    const ahoraDentro = dentro || ES_FUNCION.has(nodo.type);
    for (const k of Object.keys(nodo)) {
      if (k === 'type' || k === 'loc' || k === 'range' || k === 'parent') continue;
      const v = nodo[k];
      if (Array.isArray(v)) v.forEach(h => visitar(h, nodo, ahoraDentro));
      else if (v && typeof v.type === 'string') visitar(v, nodo, ahoraDentro);
    }
  };

  visitar(arbol, null, false);
  return usados;
}

/**
 * El contrato completo.
 *
 * Devuelve:
 *   orden        — los archivos, en orden de carga
 *   aporta       — Map<archivo, Set<nombre>>
 *   proveedor    — Map<nombre, archivo>  (el primero que lo declara)
 *   colisiones   — [{nombre, archivos}]  declarado por más de un archivo
 *   todos        — todos los nombres, para el linter
 */
function contrato() {
  const orden = ordenDeCarga();
  const aporta = new Map();
  const proveedor = new Map();
  const colisiones = [];

  for (const rel of orden) {
    const ruta = path.join(ROOT, rel);
    if (!fs.existsSync(ruta)) continue;
    const nombres = aportaciones(fs.readFileSync(ruta, 'utf8'));
    aporta.set(rel, nombres);
    for (const n of nombres) {
      if (proveedor.has(n)) {
        /* Dos archivos declarando el mismo nombre global no es un detalle: el
           segundo pisa al primero en silencio, y cuál gana depende del orden
           de carga. Es de los fallos más difíciles de encontrar a mano. */
        const ya = colisiones.find(c => c.nombre === n);
        if (ya) ya.archivos.push(rel);
        else colisiones.push({ nombre: n, archivos: [proveedor.get(n), rel] });
      } else {
        proveedor.set(n, rel);
      }
    }
  }

  return { orden, aporta, proveedor, colisiones, todos: [...proveedor.keys()] };
}

/** Los archivos de assets/js que nadie carga. Código muerto o etiqueta olvidada. */
function huerfanos() {
  const cargados = new Set(ordenDeCarga().map(r => path.basename(r)));
  return fs.readdirSync(path.join(ROOT, 'assets', 'js'))
    .filter(f => f.endsWith('.js'))
    // sitio.js lo genera la compilación: no se carga en desarrollo y es correcto.
    .filter(f => f !== 'sitio.js' && !cargados.has(f));
}

/**
 * Dependencias entre archivos: quién usa algo de quién.
 *
 * `haciaAtras` es lo que de verdad importa: un archivo usando una global de
 * otro que se carga DESPUÉS. No se nota en las pruebas —cuando la prueba hace
 * clic ya cargó todo— y revienta en producción sólo si algo se ejecuta durante
 * la carga. Es una bomba de relojería silenciosa, y la única forma seria de
 * cazarla es contarlo.
 */
/**
 * A qué subsistema pertenece un archivo: `admin-bandeja.js` → `admin`.
 *
 * Hace falta para no confundir dos cosas muy distintas. Cuando el panel era un
 * archivo de 1,700 líneas, sus partes se llamaban entre sí y eso no contaba
 * como dependencia: era el interior de un archivo. Al partirlo en cuatro, esas
 * mismas llamadas aparecen como referencias entre archivos y el número se
 * dispara — sin que el programa haya empeorado ni un poco; al revés.
 *
 * Lo que sí es señal de que algo va mal es una dependencia contra el orden
 * ENTRE subsistemas: la capa de datos llamando a la de interfaz, por ejemplo.
 * Eso es lo que se cuenta.
 */
function subsistema(rel) {
  return path.basename(rel, '.js').split('-')[0];
}

function dependencias() {
  const { orden, aporta, proveedor } = contrato();
  const posicion = new Map(orden.map((f, i) => [f, i]));
  const aristas = [];
  const haciaAtras = [];       // contra el orden, dentro de funciones
  const entreCapas = [];       // ...y además entre subsistemas distintos: el olor real
  const rotas = [];            // error: se ejecuta durante la carga

  for (const rel of orden) {
    const ruta = path.join(ROOT, rel);
    if (!fs.existsSync(ruta)) continue;
    const propias = aporta.get(rel) || new Set();

    for (const [nombre, uso] of consumos(fs.readFileSync(ruta, 'utf8'))) {
      if (propias.has(nombre)) continue;
      const de = proveedor.get(nombre);
      if (!de || de === rel) continue;

      const arista = { archivo: rel, usa: nombre, de, enCarga: uso.enCarga };
      aristas.push(arista);
      if (posicion.get(de) > posicion.get(rel)) {
        haciaAtras.push(arista);
        if (subsistema(de) !== subsistema(rel)) entreCapas.push(arista);
        if (uso.enCarga) rotas.push(arista);
      }
    }
  }
  return { aristas, haciaAtras, entreCapas, rotas };
}

/** Globales que nadie usa fuera del archivo que las declara: candidatas a morir. */
function sinUso() {
  const { orden, aporta } = contrato();
  const usoExterno = new Map();

  for (const rel of orden) {
    const ruta = path.join(ROOT, rel);
    if (!fs.existsSync(ruta)) continue;
    for (const n of consumos(fs.readFileSync(ruta, 'utf8')).keys()) {
      if (!(aporta.get(rel) || new Set()).has(n)) usoExterno.set(n, (usoExterno.get(n) || 0) + 1);
    }
  }

  const muertas = [];
  for (const [rel, nombres] of aporta) {
    for (const n of nombres) if (!usoExterno.has(n)) muertas.push({ nombre: n, archivo: rel });
  }
  return muertas;
}

module.exports = { contrato, ordenDeCarga, aportaciones, consumos, dependencias, sinUso, huerfanos, subsistema, ROOT };
