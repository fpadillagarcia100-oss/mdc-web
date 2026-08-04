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

## Panel de administración

Botón **🔒 Admin** en la barra superior, o `Ctrl + Shift + A`.
PIN inicial: `2580` (cambiable en la pestaña *Respaldo*).

| Pestaña | Qué controla |
|---|---|
| 📦 Equipos | Alta, edición, duplicado y baja de maquinaria; fotos |
| 🎨 Logo y marca | Logotipo, nombre, color de acento, imagen del banner |
| 🌐 Textos del sitio | Banner, teléfono, WhatsApp, correo, horario, pie |
| 💾 Respaldo | Exportar/importar JSON, espacio usado, PIN, restablecer |

## Siguientes pasos

- [ ] Dominio propio con HTTPS
- [ ] Backend real: Next.js + Supabase (base de datos, auth, almacenamiento)
- [ ] Autenticación de verdad — validada en el servidor, no en el navegador
- [ ] Guardar las solicitudes de cotización y notificarlas por correo
- [ ] SEO: una URL por equipo, renderizado en servidor, datos estructurados
- [ ] Aviso de privacidad (obligatorio por la LFPDPPP al captar datos de clientes)
