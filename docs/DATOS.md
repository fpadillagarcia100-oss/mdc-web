# Dónde viven los datos — opciones para centralizar

Complementa [BACKEND.md](BACKEND.md), que explica *cómo está diseñada* la base
de datos. Éste explica *cómo llegan los datos al sitio*, que es una decisión
aparte y con consecuencias distintas.

## El problema de hoy

Los datos del negocio están en tres lugares que no se hablan entre sí:

| Dato | Dónde vive | Quién lo ve |
|---|---|---|
| Catálogo publicado | `data/catalogo.json` (en git) | Todos |
| Ediciones del panel | `localStorage` del navegador | Sólo quien las hizo |
| Cotizaciones | Un mensaje de WhatsApp | Quien lo lea a tiempo |

Las consecuencias no son teóricas: cambias un precio desde el panel en tu
computadora y nadie más lo ve; abres el panel desde el celular y no aparecen
tus cambios; una cotización que no se contestó ese día no deja rastro de que
existió.

**Centralizar significa que esos tres renglones apunten al mismo lugar.**

## Lo que ya está listo en el repositorio

```
supabase/
  config.toml                          base de datos local, en tu máquina
  migrations/…_esquema_inicial.sql     tablas, RLS, triggers
  migrations/…_almacenamiento.sql      buckets de imágenes
  migrations/…_contenido_del_sitio.sql textos del sitio + vista catalogo_publico
  seed.sql                             los 18 equipos actuales (generado)
tools/
  generar-seed.js      data/catalogo.json  →  supabase/seed.sql
  exportar-catalogo.js base de datos       →  data/catalogo.json
```

### Levantarla en tu máquina (sin cuenta, sin costo)

Necesita Docker Desktop.

```bash
npm i -D supabase
npm run db:seed        # regenera seed.sql desde el JSON actual
npm run db:local       # levanta Postgres + auth + storage en local
npm run db:reset       # aplica migraciones y carga el catálogo
```

El panel queda en <http://localhost:54323>. Ahí ves las tablas, editas filas y
compruebas que las políticas hacen lo que dicen — sin tocar nada en producción.

### Subirla a la nube

```bash
npx supabase login
npx supabase link --project-ref <ref-del-proyecto>
npm run db:push                        # aplica las migraciones allá
psql "$DATABASE_URL" -f supabase/seed.sql   # carga el catálogo una sola vez
```

Después, lo del apartado "Puesta en marcha" de [BACKEND.md](BACKEND.md):
regístrate el primero (quedas admin), cierra el registro abierto, activa 2FA.

---

## Las cuatro opciones reales

### A. Base de datos + exportación al desplegar ← **la recomendada**

La base manda. En cada despliegue se exporta a `data/catalogo.json` y
`npm run build` genera las fichas estáticas como hasta ahora.

```
Panel admin → Supabase → npm run db:export → npm run build → HTML estático
```

En `netlify.toml`:

```toml
[build]
  command = "npm run db:export && npm run build"
```

y las dos variables en Netlify → Site settings → Environment variables.

- **A favor:** el sitio no depende de que Supabase esté arriba; la CSP se
  queda tal cual (`connect-src 'self'`); Google indexa las fichas porque son
  archivos de verdad; cero peticiones y cero costo por visita; si algo sale
  mal, el JSON anterior sigue en git y se revierte con un `git revert`.
- **En contra:** un cambio de precio se ve al terminar el despliegue —uno o
  dos minutos—, no al instante.
- **Cuándo no sirve:** si necesitaras inventario en tiempo real. Un catálogo
  de maquinaria no lo necesita.

### B. Base de datos consultada desde el navegador

El sitio pide los datos a Supabase en cada visita, con la llave pública.

- **A favor:** los cambios se ven al instante.
- **En contra:** hay que abrir `connect-src https://*.supabase.co` en la CSP;
  si Supabase se cae, el catálogo desaparece; cada visita cuesta peticiones; y
  el SEO empeora, porque las fichas vuelven a existir sólo después de ejecutar
  JavaScript — que es justamente el problema que resolvió el build actual.
- **Cuándo sí:** para el **panel de administración**, que no necesita SEO y sí
  necesita ver los cambios al momento. Lo sensato es B para el panel y A para
  el sitio público.

### C. Una hoja de cálculo como fuente (Google Sheets / Airtable)

Se exporta la hoja a `data/catalogo.json` en el build, igual que en A.

- **A favor:** editar es familiar, no hay panel que mantener, y se puede
  arrancar hoy mismo.
- **En contra:** una hoja no valida nada — un precio con coma de más entra sin
  chistar; los permisos son "quien tenga el enlace"; no hay historial útil ni
  forma de registrar cotizaciones. Es una fuente de datos prestada, no una
  base de datos.
- **Cuándo sí:** como paso intermedio si el panel se va a tardar. No como
  destino.

### D. Quedarse en el JSON de git

Es lo de hoy. Editar `data/catalogo.json`, `npm run build`, commit.

- **A favor:** cero infraestructura, historial completo, revertir es trivial.
- **En contra:** editar exige saber git y JSON. Las cotizaciones siguen sin
  registrarse en ningún lado — y ése es el hueco que de verdad cuesta dinero.
- **Cuándo sí:** si eres tú quien edita, siempre, y las cotizaciones se
  atienden bien por WhatsApp.

---

## Comparación

| | A. BD + build | B. BD en vivo | C. Hoja | D. JSON |
|---|---|---|---|---|
| Todos ven lo mismo | Sí | Sí | Sí | Sí |
| Editar sin saber git | Sí | Sí | Sí | No |
| Cotizaciones registradas | Sí | Sí | No | No |
| Se ve al instante | No (1–2 min) | Sí | No | No |
| SEO de las fichas | Intacto | Se degrada | Intacto | Intacto |
| Sobrevive si el proveedor falla | Sí | No | Sí | Sí |
| Validación de los datos | Sí | Sí | No | No |
| Costo mensual | $0 en el plan gratuito | $0 hasta cierto tráfico | $0 | $0 |

## Qué haría yo, en orden

1. **Levantar la base en local** (`npm run db:local && npm run db:reset`) y
   recorrer la lista de verificación de [BACKEND.md](BACKEND.md). Media hora,
   sin riesgo, y te dice si el diseño aguanta.
2. **Crear el proyecto en la nube** y hacer `db:push` + seed.
3. **Mover primero las cotizaciones**, no el catálogo. Es lo que hoy se pierde
   de verdad, y es la parte donde no puedes revertir un error: un prospecto no
   registrado no se recupera.
4. **Conectar el panel a Supabase** (opción B para el panel).
5. **Cambiar el build de Netlify a `npm run db:export && npm run build`**
   (opción A para el sitio público).

Cada paso funciona por sí solo. Si te detienes después del 3, el sitio sigue
sirviéndose del JSON y no se rompió nada.

## Regla que conviene no romper

`data/catalogo.json` pasa de ser la fuente de verdad a ser **un artefacto
generado**, igual que `equipos/*/index.html` o `sitemap.xml`. En cuanto la
base esté en la nube, editarlo a mano se pierde en la siguiente exportación.
El aviso está en la primera línea del archivo generado, y `npm run db:export`
lo vuelve a escribir cada vez.
