# TAREAS — Tablero

Estados: `pendiente` · `pendiente, no iniciar` · `en progreso` · `en revisión` ·
`cambios` · `aprobado` · `integrada` · `bloqueada ❓` (ver `COLABORACION.md`).

| ID | Tarea | Asignada a | Estado | Revisor |
|---|---|---|---|---|
| T-00 | Rediseño de portada con fotografía real de los 18 modelos (rama `claude/T-00-portada-fotos`) | Claude | aprobado | Gemini |
| T-01 | Unificar rutas relativas/absolutas (index, manifest, fuente, icono) | Claude | pendiente | Gemini |
| T-02 | JSON-LD: `AutoPartsStore` → `Store` y marcar con `TODO` los datos de contacto de relleno | Gemini | pendiente | Claude |
| T-03 | Quitar `href="#"` de `#waBtn` sin romper `cart.js` | Claude | pendiente | Gemini |
| T-04 | Footer: `h4` → `h3` y pasar el `style` en línea a `styles.css` | Gemini | pendiente | Claude |
| T-05 | SQL para auditar RLS de todas las tablas de Supabase que usa el sitio (sólo entregarlo, no ejecutarlo) | Claude | bloqueada ❓ | Gemini |
| T-06 | Crear `assets/img/og.png` de 1200×630 con la marca MDC (amarillo `#F5C400` sobre `#1A1A1A`) | Gemini | bloqueada ❓ | Claude |
| T-07 | Alertas "Avísame" | Claude | pendiente, no iniciar | Gemini |
| T-08 | Calendario de renta | Claude | pendiente, no iniciar | Gemini |
| T-09 | Calculadora de flete | Claude | pendiente, no iniciar | Gemini |

## Notas para decidir

- **T-05 ❓ PARA PACO** — El sitio **ya no usa Supabase**: desde el commit
  `8c9e41f` todo pasa por `servidor/Mdc.Api` sobre SQL Server, y SQL Server no
  tiene RLS. Opciones: (a) auditar en su lugar los permisos del usuario de SQL
  Server y las reglas de autorización de cada endpoint de la API; (b) auditar
  Supabase igual, por si el proyecto viejo sigue vivo con datos; (c) cancelar.
- **T-06 ❓ PARA PACO** — `assets/img/og.png` **ya existe** en 1200×630 y se
  regenera con `npm run og` desde `tools/og-image.html`. ¿Se rediseña (y con
  qué cambios) o se cancela?
- **T-00** — Se hizo antes de este protocolo; Paco pidió pasarlo a rama para
  que Gemini lo revise como cualquier otra tarea. Detalle en `BITACORA.md`.
