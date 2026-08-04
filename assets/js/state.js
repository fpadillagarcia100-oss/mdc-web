/**
 * state.js — Estado de navegación del catálogo: filtros activos, orden, página y vista.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 */
'use strict';

/* ══════════════════ ESTADO DE NAVEGACIÓN ══════════════════ */
const state = {
  cat:'Todos', conds:[], brands:[], locations:[], finance:[],
  onlyFavs:false, min:null, max:null, q:'', sort:'rel', view:'grid', page:1
};

const predicates = {
  cat:   p => state.cat==='Todos' || (state.cat==='Renta' ? p.cond==='Renta' : p.cat===state.cat),
  cond:  p => !state.conds.length || state.conds.includes(p.cond),
  brand: p => !state.brands.length || state.brands.includes(p.brand),
  loc:   p => !state.locations.length || state.locations.includes(p.location),
  fin:   p => !state.finance.length || state.finance.every(f => f==='msi' ? !!p.finance : !!p.leasing),
  price: p => p.price >= (state.min ?? 0) && p.price <= (state.max ?? Infinity),
  q:     p => !state.q || `${p.name} ${p.brand} ${p.cat} ${p.location} ${p.specs.join(' ')}`.toLowerCase().includes(state.q),
  fav:   p => !state.onlyFavs || favorites.has(p.id)
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
    + (state.q?1:0) + (state.onlyFavs?1:0);
}
