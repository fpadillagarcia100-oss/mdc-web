/**
 * utils.js — Atajos del DOM y formato de números, precios y colores.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 */
'use strict';

/* ══════════════════ UTILIDADES ══════════════════ */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const uniq = a => [...new Set(a)];
const brands = () => uniq(products.map(p=>p.brand)).sort((a,b)=>a.localeCompare(b,'es'));
const locations = () => uniq(products.map(p=>p.location)).sort((a,b)=>a.localeCompare(b,'es'));
const baseCats = () => uniq(products.map(p=>p.cat)).sort((a,b)=>a.localeCompare(b,'es'));
const navCatList = () => ['Todos', ...baseCats(), 'Renta'];

const nf = new Intl.NumberFormat('es-MX');
function fmtCompact(p){
  if(p>=1000000){const m=p/1000000;return '$'+(m%1===0?m.toFixed(0):m.toFixed(2))+' M'}
  return '$'+nf.format(p);
}
const fmtFull = p => '$'+nf.format(p)+' MXN';
const discPct = p => p.original && p.original>p.price ? Math.round((1-p.price/p.original)*100) : 0;
const fmtKB = b => b<1024 ? b+' B' : b<1048576 ? (b/1024).toFixed(0)+' KB' : (b/1048576).toFixed(2)+' MB';

/* ══════════════════ BÚSQUEDA ══════════════════

   El buscador viejo comparaba el texto tal cual. Quien escribía «escabadora»,
   «excavadora» sin acento o «rodillo» veía «Sin resultados» y se iba creyendo
   que no tenemos — cuando estaba buscando exactamente lo que vendemos.

   No es un caso raro: son máquinas con nombres largos que casi nadie teclea
   bien, y medio país escribe sin acentos. Cada uno de esos es un cliente que
   ya había levantado la mano.

   Tres arreglos, de más barato a más caro, y en ese orden se aplican:
     1. normalizar  — quita acentos y mayúsculas
     2. sinónimos   — «rodillo» es un compactador aunque no lo diga la ficha
     3. distancia   — «escabadora» está a una letra de «excavadora» */

/** Sin acentos, en minúsculas. La base de todo lo demás. */
const normalizar = s => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* Cómo le dice la gente a las máquinas, frente a cómo vienen en la ficha.
   Salen de escuchar a un cliente, no de un diccionario. */
const SINONIMOS = {
  rodillo: 'compactador', vibro: 'compactador', aplanadora: 'compactador',
  tractor: 'bulldozer', bulldocer: 'bulldozer', buldozer: 'bulldozer', doser: 'bulldozer',
  pala: 'cargador', payloader: 'cargador',
  bobcat: 'minicargador', minicarg: 'minicargador',
  retro: 'retroexcavadora',
  excava: 'excavadora', escabadora: 'excavadora',
  torre: 'grua', gruas: 'grua',
  oruga: 'orugas', llanta: 'neumatico',
};

/**
 * Distancia de edición, con freno.
 *
 * En cuanto supera el tope deja de calcular: comparar «excavadora» contra
 * «compactador» hasta el final no aporta nada, y esto corre una vez por
 * palabra y por equipo en cada tecla.
 */
function distancia(a, b, tope) {
  if (Math.abs(a.length - b.length) > tope) return tope + 1;
  let fila = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    let anterior = fila[0];
    fila[0] = i;
    let mejor = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = fila[j];
      fila[j] = Math.min(
        fila[j] + 1,            // borrar
        fila[j - 1] + 1,        // insertar
        anterior + (a[i - 1] === b[j - 1] ? 0 : 1),   // sustituir
      );
      anterior = temp;
      if (fila[j] < mejor) mejor = fila[j];
    }
    if (mejor > tope) return tope + 1;   // ninguna vía puede ya bajar del tope
  }
  return fila[b.length];
}

/**
 * Cuántas erratas se le perdonan a una palabra.
 *
 * Depende del largo, y no por elegancia: con una letra de margen, «cat» pasa
 * por «gat», «car» y «can». En palabras cortas casi todo está a un paso de
 * todo, así que ahí no se perdona nada.
 */
const margen = palabra => palabra.length >= 8 ? 2 : palabra.length >= 5 ? 1 : 0;

/**
 * ¿El texto de un equipo responde a lo que se escribió?
 *
 * Cada palabra de la consulta tiene que encontrarse — es un Y, no un O. Quien
 * escribe «excavadora komatsu» no quiere todas las excavadoras del mundo más
 * todos los Komatsu; quiere la intersección.
 */
function coincideBusqueda(texto, consulta) {
  const q = normalizar(consulta).trim();
  if (!q) return true;

  const heno = normalizar(texto);
  const palabras = heno.split(/[^a-z0-9]+/).filter(Boolean);

  return q.split(/\s+/).every(termino => {
    // 1. Tal cual (cubre también los prefijos: «exca» encuentra «excavadora»).
    if (heno.includes(termino)) return true;

    // 2. Como le dice la gente.
    const sinonimo = SINONIMOS[termino];
    if (sinonimo && heno.includes(sinonimo)) return true;

    // 3. Con erratas. Sólo contra palabras completas: buscar por distancia
    //    dentro de una frase entera daría coincidencias sin sentido.
    const tope = margen(termino);
    return tope > 0 && palabras.some(p => distancia(termino, p, tope) <= tope);
  });
}

/** Oscurece un color hex (para el :hover del acento). */
function darken(hex,amt=0.16){
  const m = /^#?([a-f\d]{6})$/i.exec(hex||'');
  if(!m) return '#D4A900';
  const n = parseInt(m[1],16);
  const c = [(n>>16)&255,(n>>8)&255,n&255].map(v=>Math.max(0,Math.round(v*(1-amt))));
  return '#'+c.map(v=>v.toString(16).padStart(2,'0')).join('');
}
