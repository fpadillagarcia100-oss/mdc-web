# CONTEXTO — MDC · Maquinaria de Chiapas

Lo que cualquier IA (Claude o Gemini) necesita saber antes de tocar este
proyecto. Si algo de aquí deja de ser cierto, se corrige en la misma tarea que
lo cambió.

## Qué es

Catálogo web de **venta y renta de maquinaria pesada** (excavadoras,
retroexcavadoras, bulldozers, compactadores, minicargadores, grúas torre) para
Chiapas y el Sureste. Dominio: `mdcmaquinaria.com`.

El visitante filtra el inventario, abre la ficha de cada equipo, simula
financiamiento, compara hasta 3 equipos y arma una **cotización** que se envía
por WhatsApp o correo (y queda registrada en la base). El dueño administra
equipos, fotos, textos, sucursales, cotizaciones y preguntas desde un **panel
de administración** dentro del mismo sitio.

## Stack

| Capa | Qué se usa |
|---|---|
| Sitio | HTML + CSS + JavaScript **sin framework ni módulos**: 26 scripts clásicos que se hablan por variables globales |
| Tipografía | Inter servida desde `assets/fonts/` (sin Google Fonts) |
| App instalable | PWA: `sw.js` (raíz, obligatorio ahí) + `manifest.webmanifest` + `assets/js/pwa.js` |
| Compilación | Node 24: `tools/build.js` genera datos, fichas, categorías y sitemap; `tools/empaquetar.js` arma `dist/` con esbuild (JS y CSS minificados y versionados) |
| Hospedaje | Cloudflare Pages (cabeceras en `_headers`). Netlify quedó de respaldo |
| Servidor | `servidor/Mdc.Api`: ASP.NET Core (.NET 10) + Dapper + **SQL Server Express** en la PC de la oficina, publicado por Cloudflare Tunnel como `https://api.mdcmaquinaria.com`. Ver `docs/SERVIDOR.md` |
| Avisos por correo | `functions/api/aviso-*.js`: Cloudflare Pages Functions |
| Pruebas | Lint (ESLint 10), unitarias y de integración en jsdom, arquitectura, CSP, visuales con Playwright sobre el Edge de Windows; servidor con `dotnet test` |
| Supabase | **Ya no se usa.** Quedan `supabase/`, `docs/BACKEND.md` y `docs/PUESTA-EN-MARCHA.md` como historia. El cambio a SQL Server es el commit `8c9e41f` |

## De dónde salen los datos

- **`data/catalogo.json` es la fuente de verdad** de lo que ve el público:
  ajustes, sucursales, equipos y créditos de fotos.
- `npm run build` lo convierte en `assets/js/catalogo-datos.js`,
  `equipos/<slug>/index.html` (una página por equipo), `maquinaria/<cat>/index.html`
  y `sitemap.xml`. **Esos archivos son generados: nunca se editan a mano.**
- El panel de administración lee y escribe la base de SQL Server a través de la
  API. `npm run db:export` baja la base a `data/catalogo.json`.

## Arquitectura: los scripts en orden de carga

El orden está en `index.html` y **importa**: cada archivo sólo puede usar al
cargar lo que definieron los de arriba. `tests/arquitectura.test.js` lo vigila
(y limita el contrato a 280 globales compartidas).

| # | Archivo | Qué hace |
|---|---|---|
| 1 | `icons.js` | Ilustraciones SVG de respaldo para equipos sin foto e íconos de línea (`ico()`) |
| 2 | `catalogo-datos.js` | **Generado.** El catálogo compilado (`CATALOGO`), la config del servidor y los mapas |
| 3 | `config.js` | Valores por defecto: ajustes, catálogo semilla y constantes (p. ej. `MAX_COMPARA`) |
| 4 | `atributos.js` | La ficha técnica: qué datos tiene cada tipo de máquina y cómo se muestran |
| 5 | `backend.js` | Registra las solicitudes de cotización en la base |
| 6 | `auth.js` | Sesión de administrador contra la API (`servidor/Mdc.Api`) |
| 7 | `remoto.js` | Lee y escribe el catálogo en la base; tamaños de foto (`fotoSrcset`) |
| 8 | `utils.js` | Atajos del DOM y formato de números, precios, colores; búsqueda tolerante |
| 9 | `security.js` | Escapado de salida (`esc`), validación, anti-spam |
| 10 | `storage.js` | Normalización de lo que entra (equipos, fotos permitidas) y estado global `products`/`settings` |
| 11 | `state.js` | Estado de navegación: filtros, orden, página y vista |
| 12 | `branding.js` | Aplica marca, colores, textos, contacto y la foto del hero |
| 13 | `catalog.js` | Dibuja filtros, navegación, tarjetas y paginación; renders 3D de respaldo |
| 14 | `cart.js` | Carrito de cotización: altas, bajas, cantidades, totales y enlace de WhatsApp |
| 15 | `ficha.js` | Simulador de financiamiento y ficha imprimible (también lo cargan las fichas estáticas) |
| 16 | `ui.js` | Cajones, modal de ficha con galería, foco atrapado y avisos |
| 17 | `pages.js` | Páginas: ayuda, sucursales, vender, cuenta, privacidad, cotizar, comparar, financiamiento, créditos |
| 18 | `admin.js` | Panel: núcleo, sincronización con la base, marca y respaldos |
| 19 | `admin-acceso.js` | Pantalla de entrada al panel |
| 20 | `admin-bandeja.js` | Cotizaciones, preguntas del público y métricas |
| 21 | `admin-equipos.js` | Alta, baja y edición de equipos con ficha técnica y fotos |
| 22 | `admin-usuarios.js` | Quién puede entrar al panel |
| 23 | `main.js` | Delegación de eventos (`data-*`), formularios y arranque. Va después de todo lo anterior |
| 24 | `portada.js` | Cifras, marcas y equipo destacado de la portada. Sin globales |
| 25 | `motion.js` | Capa de movimiento. Sin globales; si falta, todo funciona |
| 26 | `pwa.js` | Registra el trabajador de servicio y ofrece instalar |

En producción, `tools/empaquetar.js` une 1–17 y 23–26 en `sitio.js` y los
cinco `admin*.js` en `panel.js`, que sólo se baja al entrar al panel.

Otros archivos clave: `assets/css/styles.css` (hoja única, por capas: base →
diseño 2026 → capa industrial con fotografía), `_headers` (CSP y caché),
`tools/` (compilación y utilidades), `tests/` (pruebas), `docs/` (guías).

## Reglas técnicas que no se negocian

- **CSP sin `'unsafe-inline'` en scripts**: nada de `<script>` en línea ni
  `onclick=""`. Los eventos van por delegación en `main.js` con atributos
  `data-*`. `npm run test:csp` lo comprueba.
- Sin scripts ni imágenes de terceros: todo se sirve desde el propio sitio.
- Todo lo que se pinta con `innerHTML` pasa por `esc()`.
- Las fotos sólo pueden ser rutas del sitio (`/assets/...`), `data:image` o el
  dominio de fotos del servidor (`imgOk` en `storage.js`).

## Cómo correrlo en local (PowerShell)

```powershell
cd C:\Users\pc202502\Documents\mdc-web
npm install                      # la primera vez
npm run build                    # regenera datos, fichas y dist/
python -m http.server 8000       # o: npm run dev
# Abrir http://localhost:8000
```

El sitio empaquetado (lo que se publica) se prueba sirviendo `dist/`:

```powershell
python -m http.server 8001 --directory dist
```

Pruebas:

```powershell
npm test                         # lint + unitarias + arquitectura + integración + CSP + generado
npm run test:visual              # navegador real (Edge), capturas y presupuesto de rendimiento
npm run test:visual -- --aceptar # sólo cuando una captura cambia A PROPÓSITO
npm run test:servidor            # API en .NET contra SQL Server
```

Nota: desde `localhost` la API responde con error de CORS (se ve en la
consola). Es esperado: la API sólo acepta al dominio publicado. El catálogo
funciona igual porque viene compilado.

## Qué ya funciona

- Catálogo con filtros con conteo, búsqueda tolerante a erratas, orden, vista
  cuadrícula/lista, paginación, favoritos, vistos recientemente.
- Fichas con galería, ficha técnica, simulador de financiamiento, preguntas y
  equipos similares; una página estática indexable por equipo y por categoría.
- Comparador (hasta 3), cotización por WhatsApp/correo registrada en la base.
- Panel de administración contra la API, con usuarios, bandeja y métricas.
- PWA instalable con modo sin señal.
- Rediseño de portada con fotografía real de los 18 modelos (fotos de
  Wikimedia Commons con licencia libre; créditos en `data/catalogo.json →
  creditos_fotos` y en la página "Créditos de fotografías"). **Sin integrar a
  `main` todavía**: está en el árbol de trabajo esperando decisión de Paco.

## Qué está pendiente (conocido)

- Tareas del tablero: ver `TAREAS.md`.
- Datos de contacto de relleno: los teléfonos de sucursal (`961 123 4567`,
  `962 123 4567`, `967 123 4567`) y los del JSON-LD de `index.html` parecen
  de ejemplo. **No se inventan reemplazos**: los da Paco.
- El aviso de privacidad es una plantilla: debe revisarlo un abogado.
- `README.md` aún habla de Next.js + Supabase como siguiente paso; está
  desactualizado respecto a SQL Server.
- Las fotos de catálogo son del **modelo**, no de la unidad en venta; lo ideal
  es reemplazarlas con fotos propias de cada máquina cuando existan.
