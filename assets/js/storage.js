/**
 * storage.js — Persistencia en localStorage, con normalización de los datos que entran
 * (un respaldo importado puede traer cualquier cosa) y aviso si se agota el espacio.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 */
'use strict';

/* ══════════════════ ALMACENAMIENTO ══════════════════ */
const store = {
  read(key,fallback){ try{const v=localStorage.getItem(key);return v?JSON.parse(v):fallback}catch{return fallback} },
  write(key,value){
    try{ localStorage.setItem(key,JSON.stringify(value)); return true }
    catch(err){
      const full = err && (err.name==='QuotaExceededError' || err.code===22);
      showToast(full
        ? 'Sin espacio: las imágenes ocupan demasiado. Quita alguna foto o exporta un respaldo.'
        : 'No se pudo guardar en este navegador.', true);
      return false;
    }
  },
  usedBytes(){
    let n=0;
    try{ for(const k of Object.values(K)){ const v=localStorage.getItem(k); if(v) n+=v.length*2 } }catch{}
    return n;
  }
};

function normalizeProducts(list){
  if(!Array.isArray(list)) return DEFAULT_PRODUCTS.map(p=>({...p}));
  return list.filter(p=>p && typeof p==='object' && p.name).map((p,i)=>({
    id: Number.isFinite(p.id) ? p.id : i+1,
    name: String(p.name),
    brand: String(p.brand||'Sin marca'),
    cat: String(p.cat||'General'),
    cond: CONDS.includes(p.cond) ? p.cond : 'Nuevo',
    price: Number(p.price)||0,
    original: Number(p.original)||null,
    finance: p.finance || null,
    leasing: !!p.leasing,
    shipping: !!p.shipping,
    location: String(p.location||'Tuxtla Gutiérrez'),
    year: Number(p.year)||new Date().getFullYear(),
    specs: Array.isArray(p.specs) ? p.specs.map(String).filter(Boolean) : [],
    desc: String(p.desc||''),
    svgKey: svgs[p.svgKey] ? p.svgKey : 'excavadora',
    img: typeof p.img==='string' && p.img.startsWith('data:image') ? p.img : null,
    hot: !!p.hot
  }));
}

let products = normalizeProducts(store.read(K.products, null) || DEFAULT_PRODUCTS);
let settings = Object.assign({}, DEFAULT_SETTINGS, store.read(K.settings, {}));
let cart = store.read(K.cart, []);
let favorites = new Set(store.read(K.favs, []));
let isAdmin = sessionStorage.getItem('mdc_admin')==='1';

const saveProducts = () => store.write(K.products, products);
const saveSettings = () => store.write(K.settings, settings);
const saveCart = () => store.write(K.cart, cart);
const saveFavs = () => store.write(K.favs, [...favorites]);
