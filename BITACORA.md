# BITÁCORA

Las entradas nuevas van **arriba**, la más reciente primero. Una entrada por
tarea terminada (o por pregunta que bloquea). Las preguntas llevan la etiqueta
**`❓ PARA PACO`**.

<!--
PLANTILLA — copia esto arriba de la última entrada:

## AAAA-MM-DD · T-XX · <Claude | Gemini> · <título corto>

- **Rama:** `claude/T-XX-nombre` (commit `abc1234`)
- **Qué cambió:** una o dos frases, en términos de lo que nota quien usa el sitio.
- **Archivos:**
  - `ruta/archivo.js` — qué y por qué
- **Cómo probarlo:**
  1. `npm run build && npm test`
  2. Abrir http://localhost:8000 y …
  3. Lo que debe verse / no debe pasar
- **Pruebas:** resultado de `npm test` (y `npm run test:visual` si aplica).
- **Dudas / riesgos:** lo que no quedó claro o lo que el revisor debe mirar con lupa.
- **❓ PARA PACO:** (sólo si hace falta una decisión; si no, borra esta línea)
-->

## 2026-11-27 · T-04 · Claude · Pie de página con `h3` y sin estilos en línea

- **Rama:** `claude/T-04-footer`
- **Qué cambió:** nada visible (las 61 capturas dan 0.00% de diferencia).
  Los títulos del pie de página pasan de `h4` a `h3`: colgaban de un `h2` y
  se saltaban un nivel, lo que confunde a los lectores de pantalla. El
  `style="max-width:300px;line-height:1.6"` del párrafo de la empresa pasó a
  la clase `.footer-about` de `styles.css`.
- **Archivos:**
  - `index.html` — los 4 títulos del pie a `h3`; el párrafo usa
    `class="footer-about"`.
  - `tools/build.js` — lo mismo en el pie de las fichas y de las categorías,
    para que todo el sitio quede igual.
  - `assets/css/styles.css` — `.footer-col h4` → `.footer-col h3` (en las dos
    capas que lo estilizan) y la regla nueva `.footer-about`.
  - `equipos/*/index.html`, `maquinaria/*/index.html` — regenerados por
    `npm run build` (sólo cambia el pie).
  - `tests/smoke.test.js` — 1 prueba: el pie de la portada y el de una
    categoría usan `h3`, ningún `h4` y ningún `style=`.
- **Cómo probarlo:**
  1. `npm run build && npm test`
  2. `npm run test:visual`: ninguna captura debe cambiar.
  3. En http://localhost:8000 (recarga forzada), el pie se ve igual que antes.
- **Pruebas:** `npm test` en verde (224/224 integración, 1 nueva) y
  `npm run test:visual` 61/61 sin cambios de píxeles. En el navegador, los
  títulos del pie miden 12 px, en mayúsculas y con peso 650 (igual que antes),
  y el párrafo conserva `max-width:300px` sin atributo `style`.
- **Dudas / riesgos:** ninguno conocido. La hoja reinicia los márgenes de
  todo (`*{margin:0}`) y fija el tamaño de esos títulos, así que el cambio de
  etiqueta no altera el aspecto.

## 2026-11-27 · T-02 · Claude · Google ve una tienda, no una refaccionaria

- **Rama:** `claude/T-02-jsonld`
- **Qué cambió:** nada visible. Los datos estructurados de la portada (la
  ficha de la empresa que lee Google) declaraban a MDC y a sus dos sucursales
  como `AutoPartsStore` (refaccionaria de autos); ahora son `Store`. Los datos
  de contacto que parecen de relleno quedan marcados con un `TODO` para Paco
  en `TAREAS.md`, sin inventar reemplazos.
- **Archivos:**
  - `index.html` — `@type` de la empresa y de las dos sucursales → `Store`.
    Se actualizó el comentario de arriba del bloque: ya no dice que los
    equipos "viven en el navegador", porque cada equipo tiene su página
    estática.
  - `TAREAS.md` — el `TODO ❓ PARA PACO` con la lista de datos a confirmar.
    Primero estaba en un comentario de `index.html`, pero los comentarios HTML
    se publican (revisión de Gemini); `TAREAS.md` no llega a `dist/`.
  - `tests/smoke.test.js` — 2 pruebas: los bloques son JSON válido, y la
    ficha de la empresa (la que tiene `url` del sitio y `department`) y sus
    sucursales son `Store`. Esta segunda falla con el `index.html` de `main`.
- **Cómo probarlo:**
  1. `npm run build && npm test`
  2. Opcional: pegar el código de la portada en el validador de datos
     estructurados de Google (https://validator.schema.org/).
- **Pruebas:** `npm test` en verde (223/223 integración, 2 nuevas). No se
  corrió `test:visual`: el cambio está en `<head>` y no se ve.
- **Dudas / riesgos:**
  - Mientras Paco no confirme, Google sigue leyendo los teléfonos y calles de
    relleno como oficiales. Quitarlos del JSON-LD es decisión de Paco.
  - El teléfono de la matriz no coincide: el JSON-LD dice `961 123 4567` y
    `data/catalogo.json` (`ajustes.telefono`) dice `312 174 3817`, el mismo
    del WhatsApp. No se cambió: decide Paco.
  - Fuera de esta tarea: `data/catalogo.json` repite los mismos teléfonos y
    direcciones de sucursal, y su `_comentario` todavía dice que la fuente de
    verdad es Supabase.
- **❓ PARA PACO:** ¿cuáles son el teléfono, la dirección y el horario reales
  de cada sucursal, y el correo de ventas?

## 2026-11-27 · T-03 · Claude · El botón de WhatsApp sin `href="#"`

- **Rama:** `claude/T-03-wa-boton`
- **Qué cambió:** con la cotización vacía, "Enviar por WhatsApp" ya no es un
  enlace a `#` en pestaña nueva. Además se corrigió un hueco que salió al
  probarlo: si alguien agregaba equipos y luego vaciaba la cotización, el
  botón se atenuaba pero **conservaba el enlace de WhatsApp con los equipos
  anteriores**; un clic central o Ctrl+clic (que no pasan por el aviso
  "Agrega equipos primero" de `main.js`) lo abría.
- **Archivos:**
  - `index.html` — `#waBtn` sin `href`, con `role="link"` y
    `aria-disabled="true"` de inicio (el estado real antes de que cargue JS).
  - `assets/js/cart.js` — `renderCart()` quita el `href` al quedar vacía; con
    equipos lo sigue poniendo como antes.
  - `tests/smoke.test.js` — 3 pruebas: vacía sin `href`, con equipos apunta a
    `https://wa.me/<número>?text=`, y al vaciarla se quita el enlace viejo.
  - `main.js` no se tocó: su aviso al hacer clic con la cotización vacía
    sigue funcionando igual.
- **Cómo probarlo:**
  1. `npm run build && npm test`
  2. En http://localhost:8000 (recarga forzada), abrir la cotización vacía:
     clic en "Enviar por WhatsApp" → aviso "Agrega equipos primero"; clic
     central → no abre nada.
  3. Agregar un equipo → el botón abre WhatsApp con el mensaje. Quitarlo →
     el clic central ya no abre nada.
- **Pruebas:** `npm test` en verde (221/221 integración, 3 nuevas) y
  `npm run test:visual` 61/61. Se comprobó que la prueba nueva **falla** con
  el `cart.js` anterior (conservaba el enlace con los dos equipos).
- **Dudas / riesgos:** un `<a>` sin `href` no recibe el foco con Tab, igual
  que `#checkoutBtn` cuando está deshabilitado. Con equipos vuelve a ser un
  enlace normal y enfocable.

## 2026-11-27 · T-01 · Claude · Rutas absolutas en todo el sitio

- **Rama:** `claude/T-01-rutas`
- **Qué cambió:** nada visible. `index.html` era la única página que mezclaba
  rutas relativas (`assets/…` en la hoja de estilos, los 26 scripts y las
  fotos) con absolutas (`/assets/…` en la fuente, el manifiesto y el ícono).
  Ahora todo es absoluto, como ya lo eran las fichas, las categorías, el
  manifiesto, `sw.js` y el `@font-face` de la hoja de estilos.
- **Archivos:**
  - `index.html` — 37 rutas `assets/…` → `/assets/…` (`href`, `src` y `srcset`).
  - `assets/js/catalog.js` — la ruta de los renders 3D de respaldo de las
    tarjetas, la única relativa que se armaba desde JavaScript.
  - `tools/empacar-js.js` — `scriptsDelHtml` acepta la ruta con o sin barra y
    devuelve la del repositorio (sin barra); `htmlConBundle` ubica la primera
    y la última etiqueta con la misma expresión en lugar de reconstruir el
    texto de la etiqueta.
  - `tools/contrato-globales.js` — `ordenDeCarga` acepta las dos formas.
- **Cómo probarlo:**
  1. `npm run build && npm test`
  2. `npm run test:visual` (arranca el sitio fuente y el publicado en Edge).
  3. En http://localhost:8000, ninguna petición a `/assets/` debe dar 404.
  4. `dist/index.html` debe tener un solo `<script src="/assets/v/sitio.….js">`.
- **Pruebas:** `npm test` en verde (53 unitarias, 10 arquitectura, 218
  integración, CSP, generado) y `npm run test:visual` 61/61. En el navegador,
  30 recursos de `/assets/` sin ningún fallo.
- **Dudas / riesgos:**
  - Abrir `index.html` con doble clic (`file://`) ya no carga estilos ni
    scripts. Antes tampoco funcionaba del todo (la fuente, el manifiesto y el
    trabajador de servicio ya eran absolutos); la forma documentada sigue
    siendo `python -m http.server`.
  - El ícono de la pestaña de `index.html` es un SVG en `data:`, no una ruta,
    y se dejó igual. Las fichas y categorías no declaran `rel="icon"`: el
    navegador pide `/favicon.ico`, que no existe (404). Queda anotado, fuera
    de esta tarea.
||||||| 792d4d4

## 2026-11-26 · T-00 · Claude · Correcciones de la revisión de Gemini

- **Rama:** `claude/T-00-portada-fotos` (segundo commit)
- **Qué cambió:** se atendieron los 5 puntos obligatorios y los 3 opcionales de
  `revisiones/T-00.md` (respuesta debajo de cada uno).
- **Archivos:** `assets/js/portada.js`, `assets/js/pages.js`, `tools/build.js`,
  `assets/css/styles.css`, `index.html`, `tests/visual.test.js`,
  `revisiones/T-00.md`, generados por `npm run build`.
- **Cómo probarlo:** `npm run build && npm test && npm run test:visual`; en la
  portada, el destacado lleva "Foto ilustrativa" y las marcas ya no parecen botones.
- **Pruebas:** `npm test` en verde; `npm run test:visual` 61/61.
- **Dudas / riesgos:** el tope de fotos de la prueba visual subió de 12/700 kB a
  14/850 kB porque la medición variaba entre corridas (carga diferida de Edge).
- **Nota de proceso:** la revisión se hizo en la app de chat de Gemini (no en
  Antigravity), con el diff de código y CSS pegado; Gemini no vio imágenes,
  generados ni `data/catalogo.json`. Claude guardó su respuesta sin cambios
  en `revisiones/T-00.md`.

## 2026-11-26 · T-00 · Claude · Portada nueva con fotografía real

- **Rama:** `claude/T-00-portada-fotos` (un solo commit sobre `main` en `ef97612`)
- **Qué cambió:** la portada pasa del estilo "aurora" morado/cian a uno
  industrial (negro, acero y el amarillo de marca) con fotografía real. Cada
  uno de los 18 equipos tiene 1 o 2 fotos reales del modelo en tarjetas, ficha,
  páginas estáticas y categorías, con el aviso "Foto ilustrativa" y una página
  "Créditos de fotografías". La excavadora 3D del hero se retiró (sigue en git).
- **Archivos:**
  - `index.html` — hero con foto (`#heroFoto`, srcset), cifras, marcas,
    categorías con foto, encabezado del inventario, servicios, "Cómo
    funciona", llamado final, enlace a créditos en el pie, carga de `portada.js`.
  - `assets/js/portada.js` (nuevo) — cifras, marcas y equipo destacado a partir
    del catálogo. Bloque cerrado, sin globales.
  - `assets/css/styles.css` — la capa "era de la IA" se reemplaza por la capa
    "DISEÑO INDUSTRIAL · FOTOGRAFÍA REAL" (mismo lugar del archivo). Se
    conservan las reglas `.maq3d` de los renders de respaldo.
  - `assets/js/branding.js` — el banner que suba el dueño reemplaza la foto del
    hero; se quita el cargador del video 3D del hero.
  - `assets/js/catalog.js` — etiqueta "Foto ilustrativa" en tarjetas.
  - `assets/js/ui.js` — aviso y enlace a créditos sobre la galería de la ficha.
  - `assets/js/pages.js` — página `creditos` (dentro de `PAGES`, sin global nueva;
    enlaces sólo `https://`).
  - `assets/js/main.js` — las categorías con foto, servicios y pie llevan al
    catálogo al filtrar (antes sólo los enlaces `<a>`).
  - `data/catalogo.json` — `imgs`/`img` de los 18 equipos y `creditos_fotos`
    (autor, licencia, enlace de cada foto).
  - `assets/img/equipos/` (68 WebP) y `assets/img/obra/` (4 WebP) — fotos de
    Wikimedia Commons, re-codificadas sin metadatos, en 1400/700 y 1920/960 px.
  - `tools/build.js` — `creditos` en `CATALOGO`; crédito en las fichas
    estáticas; aviso en categorías; `imgTarjeta()` con srcset de 700 px.
  - `tools/exportar-catalogo.js` — `db:export` ya no borra fotos ni créditos si
    la base no tiene fotos de ese equipo.
  - `tests/visual.test.js` — fuera los chequeos del video 3D; presupuesto
    propio para fotos (12 fotos / 700 kB); publicado de 300 a 330 kB.
  - `tests/capturas/*.png` — referencias nuevas (cambio visual intencional).
  - Generados: `catalogo-datos.js`, `equipos/`, `maquinaria/`, `sitemap.xml`.
- **Cómo probarlo:**
  1. `npm run build && npm test`
  2. `npm run test:visual` (Edge)
  3. `python -m http.server 8000` → http://localhost:8000: hero con foto y
     destacado; categorías con foto filtran y bajan al catálogo; ficha con
     galería y "Créditos"; pie → "Créditos de fotografías"; en 375 px el
     destacado se oculta y el hero baja la foto de 960 px.
- **Pruebas:** `npm test` en verde (53 unitarias, 10 arquitectura, 218
  integración, CSP, generado). `npm run test:visual` 61/61.
- **Dudas / riesgos para el revisor:**
  - Las fotos son del **modelo**, no de la unidad: revisar que el aviso se
    entienda en tarjeta, ficha y categoría. CAT 416F2 usa foto de una CAT 420F
    y Potain MDT 178 la de otra MDT.
  - Licencias CC BY-SA/CC BY: revisar que cada foto tenga autor, licencia y
    enlace en `creditos_fotos` y que la página de créditos los muestre.
  - Peso: el sitio publicado mide 314 kB sin comprimir; las fotos van con
    presupuesto aparte. Revisar que se justifique subir el tope.
  - Textos de servicios/proceso: se alinearon con el Centro de ayuda para no
    prometer nada nuevo; revisar que no haya datos de negocio inventados.
  - `npm run db:export` contra la base real no se probó (no se tocó la base).
