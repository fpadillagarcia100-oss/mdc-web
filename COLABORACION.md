# COLABORACIÓN — Protocolo Claude + Gemini

Dos IAs trabajan este repositorio: **Claude** (Claude Code) y **Gemini**
(Google Antigravity), sobre la misma carpeta. **Paco coordina, aprueba y hace
los merges a `main`.** Ninguna IA integra a `main` por su cuenta.

## Roles

| Quién | Hace | No hace |
|---|---|---|
| **Claude** | Implementación principal: lógica, JavaScript, base de datos y SQL (hoy SQL Server en `servidor/`; Supabase es historia), seguridad | Revisar su propio trabajo |
| **Gemini** | Revisión de código; imágenes y assets (`assets/img/`); textos y SEO; tareas pequeñas que Paco le asigne | Revisar su propio trabajo |
| **Paco** | Asigna tareas, responde preguntas, aprueba y hace el merge | — |

## Regla de oro

**Quien implementa NO se revisa a sí mismo.** Toda tarea la revisa la otra IA
antes de que Paco la integre.

## Flujo por tarea

1. **Leer** `CONTEXTO.md`, `TAREAS.md` y las últimas entradas de `BITACORA.md`.
2. **Tomar** sólo tareas asignadas a ti. Cambiar su estado a `en progreso` en
   `TAREAS.md`.
3. **Rama**: trabajar en una rama nueva desde `main` actualizado:
   - `claude/T-XX-nombre-corto` o `gemini/T-XX-nombre-corto`
   - Ejemplo: `git switch main && git pull && git switch -c claude/T-03-wa-boton`
4. **Al terminar**:
   - `npm run build` si tocaste datos, plantillas o scripts, y `npm test`
     (más `npm run test:visual` si el cambio se ve). Las pruebas deben pasar.
   - Commit en la rama con mensaje `T-XX: qué cambió`.
   - Entrada en `BITACORA.md` (plantilla abajo): qué cambió, archivos, cómo
     probarlo, dudas.
   - Estado de la tarea → `en revisión`.
5. **Revisión** (la otra IA): revisa el diff de la rama contra `main`
   (`git diff main...claude/T-XX-nombre`) y escribe `revisiones/T-XX.md` con
   la plantilla de `revisiones/PLANTILLA.md`:
   - Bugs con archivo:línea y cómo reproducirlo.
   - Seguridad.
   - Casos no manejados.
   - Veredicto: **APROBADO** o **CAMBIOS**.
   - **Sin reescribir el código.** La revisión señala; no corrige.
   - Estado de la tarea → `aprobado` o `cambios`.
6. **Correcciones**: quien implementó corrige en la misma rama y responde en el
   mismo `revisiones/T-XX.md`, debajo de cada punto. Vuelve a `en revisión`.
7. **Integración**: Paco hace el merge a `main` y marca `integrada`.

## Estados válidos en TAREAS.md

`pendiente` · `pendiente, no iniciar` · `en progreso` · `en revisión` ·
`cambios` · `aprobado` · `integrada` · `bloqueada ❓`

## Prohibido

- Editar archivos de una tarea que la otra IA tiene `en progreso`.
- Modificar lógica existente que la tarea no pide. Si ves algo roto fuera de
  tu tarea, anótalo en `BITACORA.md`; no lo arregles de paso.
- **Inventar datos del negocio**: teléfonos, direcciones, precios, horarios,
  correos, promesas comerciales. Si faltan, se marcan con `TODO` y se pregunta.
- Romper la CSP: nada de scripts externos, `<script>` en línea ni
  `onclick=""` u otros manejadores en el HTML. Los eventos van por delegación.
- Editar a mano archivos generados: `assets/js/catalogo-datos.js`,
  `equipos/*/index.html`, `maquinaria/*/index.html`, `sitemap.xml`, `dist/`.
  Se cambia la fuente (`data/catalogo.json`, `tools/build.js`) y se corre
  `npm run build`.
- Aceptar capturas visuales (`--aceptar`) que no cambiaron a propósito.
- Subir secretos (`.env`, llaves, cadenas de conexión).
- Hacer merge, push a `main` o borrar ramas ajenas.

## Si algo no está claro

Escribe la pregunta en `BITACORA.md` con la etiqueta **`❓ PARA PACO`**, marca
la tarea como `bloqueada ❓` y **detente**. No adivines.

## Plantilla de entrada de bitácora

Ver el inicio de `BITACORA.md`. Las entradas nuevas van **arriba** (la más
reciente primero).
