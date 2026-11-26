/**
 * icons.js — Ilustraciones SVG que se usan cuando un equipo no tiene fotografía.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 */
'use strict';

/* ══════════════════ ICONOS SVG (respaldo cuando no hay foto) ══════════════════ */
const svgs = {
  excavadora: `<svg viewBox="0 0 200 110" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <rect x="10" y="78" width="100" height="18" rx="9" fill="#F5C400" opacity=".9"/>
    <rect x="18" y="80" width="84" height="14" rx="7" fill="#E0E0E0"/>
    <circle cx="24" cy="87" r="7" fill="#555"/><circle cx="24" cy="87" r="4" fill="#F5C400"/>
    <circle cx="96" cy="87" r="7" fill="#555"/><circle cx="96" cy="87" r="4" fill="#F5C400"/>
    <rect x="20" y="50" width="90" height="32" rx="3" fill="#444"/>
    <rect x="20" y="50" width="90" height="6" fill="#F5C400" opacity=".8"/>
    <rect x="70" y="28" width="44" height="26" rx="3" fill="#555"/>
    <rect x="75" y="32" width="34" height="16" rx="2" fill="#222" opacity=".7"/>
    <line x1="66" y1="55" x2="130" y2="28" stroke="#F5C400" stroke-width="7" stroke-linecap="round"/>
    <line x1="130" y1="28" x2="158" y2="48" stroke="#888" stroke-width="5" stroke-linecap="round"/>
    <path d="M158 48 L172 58 L162 70 L148 64 Z" fill="#F5C400"/>
  </svg>`,
  retro: `<svg viewBox="0 0 200 110" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <circle cx="42" cy="85" r="18" fill="#555"/><circle cx="42" cy="85" r="11" fill="#E0E0E0"/><circle cx="42" cy="85" r="5" fill="#F5C400"/>
    <circle cx="150" cy="85" r="14" fill="#555"/><circle cx="150" cy="85" r="9" fill="#E0E0E0"/><circle cx="150" cy="85" r="4" fill="#F5C400"/>
    <rect x="30" y="52" width="112" height="36" rx="3" fill="#444"/>
    <rect x="30" y="52" width="112" height="5" fill="#F5C400" opacity=".7"/>
    <rect x="88" y="30" width="50" height="26" rx="3" fill="#555"/>
    <rect x="93" y="34" width="40" height="16" rx="2" fill="#222" opacity=".8"/>
    <line x1="38" y1="55" x2="10" y2="38" stroke="#F5C400" stroke-width="6" stroke-linecap="round"/>
    <path d="M2 38 L14 30 L18 44 L6 48 Z" fill="#F5C400"/>
    <line x1="132" y1="56" x2="162" y2="38" stroke="#888" stroke-width="5" stroke-linecap="round"/>
    <line x1="162" y1="38" x2="182" y2="56" stroke="#888" stroke-width="4" stroke-linecap="round"/>
    <path d="M182 56 L192 66 L183 76 L172 68 Z" fill="#F5C400"/>
  </svg>`,
  bulldozer: `<svg viewBox="0 0 200 110" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <rect x="8" y="72" width="130" height="20" rx="10" fill="#F5C400" opacity=".9"/>
    <rect x="16" y="74" width="114" height="16" rx="8" fill="#E0E0E0"/>
    <circle cx="26" cy="82" r="7" fill="#555"/><circle cx="26" cy="82" r="3.5" fill="#F5C400"/>
    <circle cx="56" cy="82" r="5" fill="#555"/><circle cx="86" cy="82" r="5" fill="#555"/>
    <circle cx="116" cy="82" r="7" fill="#555"/><circle cx="116" cy="82" r="3.5" fill="#F5C400"/>
    <rect x="22" y="44" width="100" height="30" rx="3" fill="#444"/>
    <rect x="22" y="44" width="100" height="6" fill="#F5C400" opacity=".8"/>
    <rect x="68" y="22" width="50" height="26" rx="3" fill="#555"/>
    <rect x="73" y="26" width="40" height="16" rx="2" fill="#222" opacity=".8"/>
    <rect x="2" y="50" width="22" height="32" rx="2" fill="#F5C400"/>
    <rect x="2" y="50" width="6" height="32" fill="#D4A900"/>
  </svg>`,
  compactador: `<svg viewBox="0 0 200 110" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <ellipse cx="52" cy="82" rx="40" ry="18" fill="#555"/><ellipse cx="52" cy="82" rx="32" ry="14" fill="#E0E0E0"/>
    <ellipse cx="52" cy="82" rx="10" ry="6" fill="#F5C400" opacity=".6"/>
    <ellipse cx="148" cy="82" rx="38" ry="18" fill="#555"/><ellipse cx="148" cy="82" rx="30" ry="14" fill="#E0E0E0"/>
    <ellipse cx="148" cy="82" rx="10" ry="6" fill="#F5C400" opacity=".6"/>
    <rect x="50" y="56" width="100" height="28" rx="3" fill="#444"/>
    <rect x="50" y="56" width="100" height="5" fill="#F5C400" opacity=".8"/>
    <circle cx="100" cy="72" r="10" fill="#333" stroke="#F5C400" stroke-width="2"/>
    <circle cx="100" cy="72" r="4" fill="#F5C400"/>
    <rect x="106" y="30" width="42" height="28" rx="3" fill="#555"/>
    <rect x="111" y="34" width="32" height="18" rx="2" fill="#222" opacity=".8"/>
    <rect x="106" y="26" width="42" height="5" fill="#F5C400" opacity=".9"/>
  </svg>`,
  minicargador: `<svg viewBox="0 0 200 110" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <rect x="12" y="76" width="80" height="16" rx="8" fill="#F5C400" opacity=".85"/>
    <rect x="19" y="78" width="66" height="12" rx="6" fill="#E0E0E0"/>
    <circle cx="26" cy="84" r="5" fill="#555"/><circle cx="26" cy="84" r="2.5" fill="#F5C400"/>
    <circle cx="78" cy="84" r="5" fill="#555"/><circle cx="78" cy="84" r="2.5" fill="#F5C400"/>
    <rect x="18" y="46" width="80" height="32" rx="3" fill="#444"/>
    <rect x="24" y="24" width="48" height="26" rx="3" fill="#555"/>
    <rect x="29" y="28" width="38" height="16" rx="2" fill="#222" opacity=".8"/>
    <line x1="22" y1="50" x2="20" y2="35" stroke="#888" stroke-width="5" stroke-linecap="round"/>
    <line x1="94" y1="50" x2="96" y2="35" stroke="#888" stroke-width="5" stroke-linecap="round"/>
    <line x1="20" y1="35" x2="118" y2="35" stroke="#888" stroke-width="4" stroke-linecap="round"/>
    <rect x="106" y="35" width="68" height="24" rx="2" fill="#F5C400"/>
    <rect x="106" y="55" width="68" height="6" rx="1" fill="#D4A900"/>
  </svg>`,
  grua: `<svg viewBox="0 0 200 110" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <rect x="85" y="94" width="30" height="10" rx="1" fill="#555"/>
    <rect x="70" y="100" width="60" height="6" rx="1" fill="#444" stroke="#F5C400" stroke-width="1"/>
    <rect x="95" y="18" width="10" height="78" fill="#444"/>
    <line x1="95" y1="18" x2="105" y2="18" stroke="#F5C400" stroke-width="2"/>
    <line x1="95" y1="34" x2="105" y2="34" stroke="#666" stroke-width="1"/>
    <line x1="95" y1="50" x2="105" y2="50" stroke="#666" stroke-width="1"/>
    <line x1="95" y1="66" x2="105" y2="66" stroke="#666" stroke-width="1"/>
    <rect x="40" y="14" width="120" height="8" rx="2" fill="#F5C400"/>
    <rect x="34" y="14" width="12" height="16" rx="1" fill="#555" stroke="#F5C400" stroke-width="1"/>
    <rect x="130" y="18" width="14" height="8" rx="1" fill="#555"/>
    <circle cx="133" cy="18" r="2" fill="#F5C400"/><circle cx="141" cy="18" r="2" fill="#F5C400"/>
    <line x1="137" y1="26" x2="137" y2="56" stroke="#aaa" stroke-width="1.5"/>
    <path d="M130 56 Q137 64 144 56" stroke="#F5C400" stroke-width="2" fill="none"/>
    <rect x="103" y="6" width="16" height="14" rx="2" fill="#555"/>
    <rect x="106" y="9" width="10" height="8" rx="1" fill="#222" opacity=".7"/>
  </svg>`
};
const SVG_LABELS = {excavadora:'Excavadora',retro:'Retroexcavadora',bulldozer:'Bulldozer',compactador:'Compactador',minicargador:'Minicargador',grua:'Grúa'};

/* ══════════════════ ÍCONOS DE INTERFAZ ══════════════════
   Línea de 1.75 sobre 24×24, en currentColor: toman el color del texto que
   los rodea y escalan con su tamaño de letra. Sustituyen a los emojis, que
   cada sistema dibuja a su manera —en Windows son planos, en Android
   caricaturas— y le daban al sitio un aire de hace cinco años.

   Siempre decorativos (aria-hidden): el texto de al lado es el que dice qué
   es. Un ícono que tuviera que leerse solo necesitaría su propia etiqueta. */
const ico = (()=>{
  const trazos = {
    pin:    '<path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    camara: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    tarjeta:'<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18M7 15h4"/>',
    camion: '<path d="M2.5 6.5h11v9.5h-11zM13.5 10h4.2l3.3 3.4V16h-7.5"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    check:  '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    escudo: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    banco:  '<path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20.5h18"/>',
    lupa:   '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    persona:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
    lista:  '<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 3.5h6v2H9zM9 10.5h6M9 14h6M9 17.5h3"/>',
    candado:'<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    impresora:'<path d="M7 9V3.5h10V9M7 17H4.5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h15a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H17"/><rect x="7" y="14" width="10" height="7"/>',
    play:   '<path d="M8 5.5v13l10.5-6.5z"/>',
    telefono:'<path d="M5 4h3.5l1.5 4-2 1.5a11 11 0 0 0 6.5 6.5l1.5-2 4 1.5V19a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z"/>',
    reloj:  '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    mensaje:'<path d="M20 11.5a8 8 0 0 1-11.8 7L4 19.5l1.1-3.9A8 8 0 1 1 20 11.5z"/>',
    basura: '<path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l1 13.5h9l1-13.5M10 10.5v6M14 10.5v6"/>',
    correo: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/>',
  };
  return nombre => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${trazos[nombre] || ''}</svg>`;
})();
