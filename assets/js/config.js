/**
 * config.js — Valores por defecto: ajustes del sitio, catálogo semilla y constantes.
 * Editar aquí cambia lo que ve un visitante nuevo, antes de tocar el panel.
 *
 * Parte de MDC · Maquinaria de Chiapas.
 */
'use strict';

/* ══════════════════ CONFIGURACIÓN POR DEFECTO ══════════════════

   Estos valores ya NO se escriben aquí: vienen de data/catalogo.json y los
   inyecta "npm run build" en catalogo-datos.js, que se carga antes que este
   archivo.

   El motivo es de fondo: antes el catálogo real vivía en el localStorage de
   quien lo editaba, así que los visitantes seguían viendo el de ejemplo.
   Ahora los datos viajan dentro del sitio publicado.

   Para cambiar el catálogo: edita data/catalogo.json y ejecuta npm run build.
   ══════════════════════════════════════════════════════════════ */
const _A = CATALOGO.ajustes;

const DEFAULT_SETTINGS = {
  logo:_A.logo,
  brandMain:_A.marca_principal, brandAccent:_A.marca_acento,
  brandFull:_A.marca_completa,
  accent:_A.color_acento,
  topbarMsg:_A.barra_superior,
  heroTag:_A.hero_etiqueta,
  heroTitle:_A.hero_titulo,
  heroHighlight:_A.hero_resaltado,
  heroText:_A.hero_texto,
  heroImage:_A.hero_imagen,
  sellerName:_A.vendedor,
  phone:_A.telefono,
  whatsapp:_A.whatsapp,
  email:_A.correo,
  hours:_A.horario,
  address:_A.direccion,
  footerAbout:_A.pie_descripcion,
  branches:CATALOGO.sucursales
};

const DEFAULT_PRODUCTS = CATALOGO.equipos;

const BRAND_LABELS = {CAT:'Caterpillar'};
const FINANCE_OPTS = [{value:'msi',label:'Con MSI disponible'},{value:'leasing',label:'Arrendamiento'}];
const CONDS = ['Nuevo','Usado','Renta'];
const COND_LABELS = {Nuevo:'Nuevo',Usado:'Usado certificado',Renta:'En renta'};
const PER_PAGE = 9;
/* Tope de fotos por equipo. No es capricho: cada foto vive como data URI dentro
   del localStorage, que ronda los 5 MB para TODO el catálogo. Ocho fotos
   comprimidas caben; treinta llenan la cuota y la siguiente edición se pierde. */
const MAX_FOTOS = 8;
/* Tope de equipos a comparar. Tres caben lado a lado incluso en un celular;
   con más, la tabla obliga a hacer scroll horizontal y deja de comparar nada. */
const MAX_COMPARA = 3;
const K = {products:'mdc_v1_products', settings:'mdc_v1_settings', cart:'mdc_v1_cart',
           favs:'mdc_v1_favs', account:'mdc_v1_account', requests:'mdc_v1_requests'};
