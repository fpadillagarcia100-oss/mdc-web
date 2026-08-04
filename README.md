# MDC — Maquinaria de Chiapas

Catálogo web de venta y renta de maquinaria pesada.

## Estado actual

Prototipo funcional en un solo archivo (`index.html`), sin servidor. Todo el
catálogo, imágenes, logo y ajustes se guardan en el `localStorage` del navegador
que los edita.

**Esto implica dos límites importantes:**

1. Los cambios que haces en el panel de administración **no viajan con el
   archivo**. Un visitante ve el catálogo de ejemplo, no el tuyo. Para moverlos:
   Panel → 💾 Respaldo → *Descargar respaldo*, e *Importar respaldo* en el otro
   navegador.
2. El PIN de administrador **no es seguridad real**. Se compara en el navegador
   del visitante, así que cualquiera puede leerlo o saltárselo desde las
   herramientas de desarrollo. Sirve para evitar ediciones accidentales, nada más.

Ambos se resuelven con un backend (ver *Siguientes pasos*).

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

Lo que sí está hecho:

- El PIN se guarda **hasheado** (SHA-256 vía WebCrypto), nunca en claro — tampoco en los respaldos.
- **Bloqueo de 60 segundos** tras 5 intentos fallidos.
- **CSP** que impide cargar scripts externos, incrustar iframes o sacar datos a otro servidor.
- Todo lo que se pinta en pantalla pasa por escapado de HTML.
- Validación de teléfono y correo, con **trampa oculta anti-spam** en los formularios.

Lo que **no** está hecho, y no puede estarlo sin servidor:

> La comprobación del PIN ocurre en el navegador del visitante. Quien sepa lo que hace
> puede saltársela y editar el catálogo local. Esto **evita ediciones accidentales**, no
> ataques. La autorización real exige validarse en un servidor, en cada operación de
> escritura. Es la razón principal para migrar a Next.js + Supabase.

## Panel de administración

Botón **🔒 Admin** en la barra superior, o `Ctrl + Shift + A`.
PIN inicial: `2580` (cambiable en la pestaña *Respaldo*).

| Pestaña | Qué controla |
|---|---|
| 📦 Equipos | Alta, edición, duplicado y baja de maquinaria; fotos |
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
