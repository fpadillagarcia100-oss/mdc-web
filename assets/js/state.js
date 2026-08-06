/**
 * state.js — Estado de navegación del catálogo: filtros activos, orden, página y vista.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 */
'use strict';

/* ══════════════════ ESTADO DE NAVEGACIÓN ══════════════════ */
const state = {
  cat:'Todos', conds:[], brands:[], locations:[], finance:[],
  onlyFavs:false, min:null, max:null, q:'', sort:'rel', view:'grid', page:1,
  compare:[],   // ids de los equipos elegidos para comparar
  /* Filtros de ficha técnica. Sólo dos, y son los dos que de verdad usa quien
     compra maquinaria de segunda mano: cuánto la han trabajado y de qué
     tamaño es. Cada filtro que se añade divide el catálogo, y con 18 equipos
     dividirlo de más deja pantallas vacías. */
  horasMax:null, pesoMin:null, pesoMax:null
};

const predicates = {
  cat:   p => state.cat==='Todos' || (state.cat==='Renta' ? p.cond==='Renta' : p.cat===state.cat),
  cond:  p => !state.conds.length || state.conds.includes(p.cond),
  brand: p => !state.brands.length || state.brands.includes(p.brand),
  loc:   p => !state.locations.length || state.locations.includes(p.location),
  fin:   p => !state.finance.length || state.finance.every(f => f==='msi' ? !!p.finance : !!p.leasing),
  price: p => p.price >= (state.min ?? 0) && p.price <= (state.max ?? Infinity),
  q:     p => !state.q || `${p.name} ${p.brand} ${p.cat} ${p.location} ${p.specs.join(' ')}`.toLowerCase().includes(state.q),
  fav:   p => !state.onlyFavs || favorites.has(p.id),

  /* Horas de uso.

     El caso que hay que decidir: un equipo sin horas capturadas, con el filtro
     puesto en "hasta 3,000 h". ¿Entra o no?

     Si entra, el filtro miente — se ofrece como "menos de 3,000 horas" algo
     que podría tener nueve mil. Si no entra, desaparecen los equipos NUEVOS,
     que no tienen horas porque no las han trabajado.

     Así que se distingue: un nuevo pasa siempre (cero horas por definición) y
     un usado sin el dato queda fuera. La consecuencia es visible y sirve de
     recordatorio: la máquina usada a la que no se le capturaron las horas
     deja de aparecer en la búsqueda que más usa la gente. */
  horas: p => {
    if(state.horasMax == null) return true;
    const h = p.atributos.horas;
    if(h == null) return p.cond === 'Nuevo';
    return h <= state.horasMax;
  },

  /* Peso operativo. Aquí sí se deja pasar lo desconocido: el peso se deduce
     del modelo y quien busca "de 15 a 25 toneladas" prefiere ver una máquina
     de más y descartarla él, a que se la escondan. */
  peso: p => {
    if(state.pesoMin == null && state.pesoMax == null) return true;
    const w = p.atributos.peso;
    if(w == null) return true;
    return w >= (state.pesoMin ?? 0) && w <= (state.pesoMax ?? Infinity);
  }
};

function filterAll(skip){
  const keys = Object.keys(predicates).filter(k => k!==skip);
  return products.filter(p => keys.every(k => predicates[k](p)));
}

function sortList(list){
  const s = [...list];
  if(state.sort==='price-asc') s.sort((a,b)=>a.price-b.price);
  else if(state.sort==='price-desc') s.sort((a,b)=>b.price-a.price);
  else if(state.sort==='new') s.sort((a,b)=>b.year-a.year || b.id-a.id);
  else if(state.sort==='disc') s.sort((a,b)=>discPct(b)-discPct(a));
  else s.sort((a,b)=>(b.hot?1:0)-(a.hot?1:0) || a.id-b.id);
  return s;
}

function activeFilterCount(){
  return state.conds.length + state.brands.length + state.locations.length + state.finance.length
    + (state.cat!=='Todos'?1:0) + (state.min!=null?1:0) + (state.max!=null?1:0)
    + (state.q?1:0) + (state.onlyFavs?1:0)
    + (state.horasMax!=null?1:0) + (state.pesoMin!=null?1:0) + (state.pesoMax!=null?1:0);
}
