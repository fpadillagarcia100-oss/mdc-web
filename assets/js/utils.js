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

/** Oscurece un color hex (para el :hover del acento). */
function darken(hex,amt=0.16){
  const m = /^#?([a-f\d]{6})$/i.exec(hex||'');
  if(!m) return '#D4A900';
  const n = parseInt(m[1],16);
  const c = [(n>>16)&255,(n>>8)&255,n&255].map(v=>Math.max(0,Math.round(v*(1-amt))));
  return '#'+c.map(v=>v.toString(16).padStart(2,'0')).join('');
}
