# MDC — Maquinaria de Chiapas

Catálogo web de venta y renta de maquinaria pesada.

## Cómo cambiar el catálogo

**La fuente de verdad es [`data/catalogo.json`](data/catalogo.json).**

```powershell
# 1. Edita data/catalogo.json (equipos, sucursales, textos)
# 2. Regenera el sitio
npm run build
# 3. Verifica y publica
npm test
git add -A && git commit -m "Actualiza catálogo" && git push
```

`npm run build` produce tres cosas:

| Genera | Para qué |
|---|---|
| `assets/js/catalogo-datos.js` | Los datos que ve **cualquier visitante**, no sólo tu navegador |
| `equipos/<slug>/index.html` | Una página por equipo, indexable por Google |
| `sitemap.xml` | Con todas las direcciones reales |

## Aplicación instalable y modo sin señal

El sitio se instala en el teléfono y **funciona sin datos**: todo lo que ya se
visitó una vez —fichas, fotos, precios— sigue abriendo, y una cotización
llenada sin señal espera en el teléfono y se manda sola al volver la red.

| Archivo | Qué hace |
|---|---|
| [`sw.js`](sw.js) | Decide qué se guarda. Código a la red primero, fotos al caché primero |
| [`manifest.webmanifest`](manifest.webmanifest) | Nombre, colores e iconos de la app instalada |
| [`assets/js/pwa.js`](assets/js/pwa.js) | Enciende el trabajador y ofrece instalar |
| [`tools/make-icons.js`](tools/make-icons.js) | Dibuja los PNG del icono — `npm run icons` |

`sw.js` va en la raíz por obligación: un trabajador de servicio sólo manda
sobre las direcciones que cuelgan de su carpeta. Si lo mueves a `assets/`,
deja de atender la portada.

Netlify ejecuta `npm run build` en cada despliegue, así que basta con
`git push`. Y `npm run test:generado` impide publicar con las fichas
desactualizadas: si editas los datos y olvidas regenerar, el CI se pone rojo.

> El panel de administración sigue guardando en `localStorage`, que **es local
> a tu navegador**. Sirve para preparar y previsualizar; para que un cambio
> llegue a los visitantes hay que volcarlo a `data/catalogo.json`. Eso
> desaparece cuando entre el backend (ver [docs/BACKEND.md](docs/BACKEND.md)).

## Estado actual

Sitio estático, sin servidor. El catálogo viaja dentro del sitio publicado;
las ediciones del panel viven en el `localStorage` del navegador que las hace.

**Esto implica dos límites importantes:**

1. Los cambios que haces en el panel de administración **no viajan con el
   archivo**. Un visitante ve el catálogo de ejemplo, no el tuyo. Para moverlos:
   Panel → 💾 Respaldo → *Descargar respaldo*, e *Importar respaldo* en el otro
   navegador.
2. El PIN de administrador **no es seguridad real**. Se compara en el navegador
   del visitante, así que cualquiera puede leerlo o saltárselo desde las
   herramientas de desarrollo. Sirve para evitar ediciones accidentales, nada más.

Ambos se resuelven con un backend (ver *Siguientes pasos*).

## Estructura

```
mdc-web/
├── index.html              Sólo marcado. Ni estilos ni scripts en línea.
├── assets/
│   ├── css/styles.css      Hoja de estilos completa
│   └── js/
│       ├── icons.js        Ilustraciones SVG de respaldo
│       ├── config.js       Ajustes por defecto y catálogo semilla
│       ├── utils.js        Atajos del DOM y formato
│       ├── security.js     Escapado, validación, anti-spam y PIN
│       ├── storage.js      Persistencia y normalización de datos
│       ├── state.js        Estado de filtros y orden
│       ├── branding.js     Logo, colores y textos configurables
│       ├── catalog.js      Filtros, tarjetas y paginación
│       ├── cart.js         Carrito de cotización
│       ├── ui.js           Cajones, modal, foco y avisos
│       ├── pages.js        Ayuda, sucursales, cuenta, privacidad
│       ├── admin.js        Panel de administración
│       └── main.js         Eventos y arranque
│   └── img/og.png          Vista previa al compartir el link
├── tests/
│   ├── unit.test.js        Lógica de negocio (precios, filtros, validación)
│   └── smoke.test.js       El sitio completo en un navegador simulado
├── tools/
│   ├── check-csp.js        Vigila que no vuelva JavaScript en línea
│   ├── og-image.html       Diseño de la imagen de vista previa
│   └── make-og.js          La regenera con el navegador instalado
├── .github/workflows/ci.yml
├── netlify.toml            Cabeceras de seguridad y caché
├── robots.txt · sitemap.xml
├── SECURITY.md             Qué protege el sitio y qué no
└── README.md
```

**El orden de los `<script>` en `index.html` importa.** Son scripts clásicos que
comparten ámbito global: `main.js` va al final porque asume que todo lo demás ya
existe. Si agregas un archivo, colócalo respetando sus dependencias.

## Pruebas

```powershell
npm install     # sólo la primera vez
npm test        # las tres suites
```

| Comando | Qué verifica |
|---|---|
| `npm run test:unit` | Precios, descuentos, escapado, validación y normalización de datos |
| `npm run test:smoke` | El sitio real en un navegador simulado: catálogo, páginas, formularios, carrito y PIN |
| `npm run test:csp` | Que nadie haya metido JavaScript en línea en **ninguna** página, lo que anularía el CSP |
| `npm run test:generado` | Que las fichas y el sitemap correspondan a `data/catalogo.json` |

Corren solas en cada push gracias a `.github/workflows/ci.yml`.
En local, córrelas antes de cada commit.

## Antes de publicar

- [x] ~~Dominio~~ — **mdcmaquinaria.com**, registrado en Namecheap el 5 ago 2026,
      con privacidad WHOIS incluida. Ya está puesto en `index.html`,
      `robots.txt` y `sitemap.xml`
- [ ] Apuntar los nameservers de Namecheap a Netlify
- [ ] Activar renovación automática y 2FA en la cuenta de Namecheap
- [ ] Contratar correo para `ventas@mdcmaquinaria.com` (Zoho Mail tiene plan
      gratuito) — el dominio por sí solo no da buzón
- [ ] Poner el **número real de WhatsApp** en 🌐 *Textos del sitio* —
      sin él los formularios no le llegan a nadie
- [ ] Direcciones y teléfonos reales de las sucursales
- [ ] Completar el aviso de privacidad con la razón social y el domicilio fiscal
- [ ] Activar `Strict-Transport-Security` en `netlify.toml` **sólo** cuando el
      dominio ya sirva bien por HTTPS (es difícil de revertir)

## Fotos de los equipos

Hasta **8 fotos por equipo**. La **primera es la portada**: es la que sale en la
tarjeta del catálogo, al compartir el enlace y en los resultados de Google.
Se reordenan con ◀ ▶ en el panel.

En `data/catalogo.json` cada equipo lleva un arreglo `imgs`, y hay **dos formas**
de poner una foto:

| Forma | Ejemplo | Cuándo |
|---|---|---|
| Archivo del sitio | `"/assets/img/equipos/cat320-1.jpg"` | **La buena para publicar** |
| Foto incrustada | `"data:image/webp;base64,…"` | La que produce el panel |

**No son equivalentes, y la diferencia importa.** Una foto incrustada viaja
dentro del propio archivo: Google no puede citarla en los resultados y WhatsApp
no puede mostrarla en la vista previa del enlace, porque ninguno de los dos
puede descargarla por separado. Además el panel guarda en `localStorage`, que
ronda los 5 MB para todo el catálogo — con ocho fotos por equipo se llena rápido.

Por eso, para el inventario real: pon los archivos en `assets/img/equipos/` y
referéncialos con una ruta. Usa el panel para preparar y previsualizar.

Cualquier otra cosa —una URL de otro dominio, un `javascript:`— se descarta al
cargar. Una foto ajena en un respaldo importado sería código o rastreo de un
tercero corriendo dentro de tu página.

## Imagen al compartir

Al mandar el link por WhatsApp se muestra una tarjeta con logo y descripción, no
la URL pelona. El diseño está en `tools/og-image.html`; si lo editas:

```powershell
npm run og
```

## Cómo verlo

**Local:** abre `index.html` con doble clic.

**Desde otro dispositivo** (celular en la misma red Wi-Fi):

```powershell
cd C:\Users\pc202502\Documents\mdc-web
python -m http.server 8000
```

Luego, en el otro dispositivo: `http://<IP-de-la-PC>:8000`
(la IP sale con `ipconfig`, en el adaptador Wi-Fi).

**Publicado:** arrastra esta carpeta a [app.netlify.com/drop](https://app.netlify.com/drop).

## Qué funciona hoy

| Sección | Qué hace |
|---|---|
| **Catálogo** | Filtros por condición, marca, precio, financiamiento, ubicación y favoritos, con conteos que se recalculan solos. Orden, paginación y vista lista/cuadrícula |
| **Simulador de financiamiento** | Enganche, plazo y tasa editables; mensualidad, intereses y total pagado. Marcado como estimado, no como oferta de crédito |
| **Comparador** ⇄ | Hasta 3 equipos lado a lado, resaltando lo más conveniente de cada renglón |
| **Ficha imprimible** 🖨 | Hoja limpia con foto, precio, specs y datos de contacto, lista para PDF o WhatsApp |
| **Cotización** 🛒 | Carrito persistente; separa total de compra del total de renta mensual |
| **Solicitar cotización** | Formulario validado que arma el mensaje y lo envía por WhatsApp o correo |
| **Vende tu equipo** | Ficha de valuación (marca, año, horas, precio esperado) que llega por WhatsApp o correo |
| **Ayuda** | 8 preguntas frecuentes + accesos directos de contacto |
| **Sucursales** | Editable desde el panel; genera solo el enlace a Google Maps |
| **Mi cuenta** | Guarda tus datos de contacto, favoritos e historial de solicitudes **en este dispositivo** |
| **Aviso de privacidad** | Plantilla conforme a la LFPDPPP — revísala con un abogado antes de publicar |

Las solicitudes salen por WhatsApp o correo porque no hay servidor que las reciba.
Funciona bien y el lead sí llega, pero nada queda registrado del lado de la empresa.

## Seguridad

Resumen; el detalle completo está en **[SECURITY.md](SECURITY.md)**.

- PIN **hasheado con SHA-256**, con bloqueo de 60 s tras 5 intentos fallidos.
- **CSP sin `unsafe-inline`** para scripts: nada de código externo, iframes ni exfiltración.
- **Cabeceras HTTP** en `netlify.toml` (`X-Frame-Options`, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy`, HSTS), más fuertes que el `<meta>`
  porque el navegador las aplica antes de leer el HTML.
- Escapado de HTML en todo lo que se pinta en pantalla.
- Validación de teléfono y correo, más trampa oculta anti-spam.
- Los datos del visitante nunca salen de su dispositivo.

> **El límite:** todo corre en el navegador del visitante. El PIN se compara ahí
> mismo, así que quien sepa lo que hace puede saltárselo. Esto **evita ediciones
> accidentales, no ataques.** La autorización real exige un servidor que valide
> cada escritura — es el motivo principal para migrar a Next.js + Supabase.

## Panel de administración

Botón **🔒 Iniciar sesión** en la barra superior, o `Ctrl + Shift + A`.
PIN inicial: `2580` (cambiable en la pestaña *Respaldo*).

| Pestaña | Qué controla |
|---|---|
| 📦 Equipos | Alta, edición, duplicado y baja de maquinaria; galería de fotos |
| 🎨 Logo y marca | Logotipo, nombre, color de acento, imagen del banner |
| 🌐 Textos del sitio | Banner, teléfono, WhatsApp, correo, horario, pie y **sucursales** |
| 💾 Respaldo | Exportar/importar JSON, espacio usado, **cambio de PIN**, restablecer |

## Siguientes pasos

- [ ] Dominio propio con HTTPS
- [ ] Backend real: Next.js + Supabase (base de datos, auth, almacenamiento)
- [ ] Autenticación de verdad — validada en el servidor, no en el navegador
- [ ] Guardar las solicitudes de cotización y notificarlas por correo
- [ ] SEO: una URL por equipo, renderizado en servidor, datos estructurados
- [ ] Aviso de privacidad (obligatorio por la LFPDPPP al captar datos de clientes)
