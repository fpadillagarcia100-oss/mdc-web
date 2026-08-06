# Puesta en marcha en la nube

Recorrido completo, en orden. Cada paso deja el sitio funcionando: si te
detienes a la mitad, nada se rompe — sigue sirviéndose de `data/catalogo.json`
como hasta hoy.

Lo que no puedo hacer por ti: crear la cuenta y el proyecto. Requiere tu
correo y tu tarjeta de recuperación. El resto ya está escrito.

---

## 1. Crear el proyecto (10 min)

En <https://supabase.com> → **New project**.

| Campo | Qué poner |
|---|---|
| Name | `mdc-web` |
| Database password | Una larga y aleatoria. **Guárdala en tu gestor de contraseñas ahora**, no se puede volver a ver |
| Region | `East US (North Virginia)` — la más cercana a Chiapas con menor latencia |
| Plan | Free |

Tarda un par de minutos en aprovisionar.

> **La contraseña de la base no es la de tu cuenta.** Si la pierdes, se puede
> restablecer desde el panel, pero cualquier cosa conectada con ella deja de
> funcionar hasta que la actualices.

## 2. Aplicar el esquema (5 min)

```bash
npm i -D supabase
npx supabase login
npx supabase link --project-ref <ref>     # el ref está en la URL del panel
npm run db:push
```

`db:push` aplica las cuatro migraciones en orden. **Aquí se ejecuta el SQL por
primera vez** — hasta ahora sólo era texto en la carpeta. Si algo tiene un
error de sintaxis, aparece en este paso y no en otro.

Después, el catálogo:

```bash
npm run db:seed                                  # regenera seed.sql
npx supabase db push --include-seed               # o cárgalo desde el editor SQL del panel
```

Si `--include-seed` no aplica en tu versión del CLI: abre **SQL Editor** en el
panel, pega el contenido de `supabase/seed.sql` y ejecútalo. Es idempotente —
correrlo dos veces deja lo mismo que correrlo una.

Comprueba en **Table Editor** que `equipos` tiene 18 filas.

## 3. Tomar el control antes que nadie (5 min) — *el paso que no se pospone*

El trigger `crear_perfil_al_registrarse` da rol `admin` **al primer usuario que
se registre**. No a ti: al primero.

1. En **Authentication → Users → Add user**, créate la cuenta con tu correo.
2. En **Table Editor → perfiles**, confirma que tu fila dice `rol = admin`.
3. En **Authentication → Providers → Email**, **desactiva "Enable signup"**.

A partir de ahí, las cuentas del personal las creas tú desde el panel. Con el
registro abierto, cualquiera que encuentre tu proyecto se hace una cuenta.

4. En tu cuenta de Supabase (no la del proyecto): **activa 2FA**. Esa cuenta
   puede borrar la base entera.

## 4. Verificar que la seguridad es real (5 min)

Copia `.env.ejemplo` a `.env` y rellena los dos valores desde
**Project Settings → API**:

```bash
cp .env.ejemplo .env      # y edita los valores
npm run test:seguridad
```

Las 11 comprobaciones de lectura deben pasar. Prueban con la llave pública,
por HTTP, intentando el ataque de verdad: leer la lista de prospectos, cambiar
un precio, subir un archivo al bucket.

**Si alguna falla, no sigas.** Una falla aquí significa que ese ataque
funciona hoy, contra tu base real.

Las cuatro pruebas que escriben se omiten contra la nube. Para incluirlas:

```bash
SEGURIDAD_PERMITIR_ESCRITURA=1 npm run test:seguridad
```

Dejan solicitudes de prueba con el teléfono `9990000000`; márcalas como spam
desde el panel.

## 5. Exportar y desplegar (5 min)

```bash
npm run db:export      # base → data/catalogo.json
npm run build          # → las 18 fichas y el sitemap
npm test               # nada debe romperse
```

Si el resultado es idéntico al JSON de hoy, el circuito completo funciona.
Revísalo con `git diff data/catalogo.json` antes de confiar en él.

Luego, en `netlify.toml`:

```toml
[build]
  command = "npm run db:export && npm run build"
```

y las dos variables en **Netlify → Site settings → Environment variables**.

> **No cambies esto antes de que el paso 5 funcione en tu máquina.** Si el
> build de Netlify no puede leer la base, el despliegue falla y el sitio se
> queda en la versión anterior — recuperable, pero un susto evitable.

---

## Dos avisos que importan

### El plan gratuito pausa los proyectos inactivos

Supabase suspende un proyecto gratuito tras **una semana sin actividad**.
Y aquí hay una interacción incómoda entre las dos decisiones tomadas: como el
sitio es estático y sólo consulta la base **al desplegar**, un mes sin cambios
en el catálogo es un mes sin actividad. El proyecto se pausa, y el siguiente
despliegue falla justo cuando querías publicar algo.

Se reactiva desde el panel en un par de minutos, así que no es grave — pero
conviene saberlo de antemano en vez de descubrirlo con prisa. Tres salidas:

- Entrar al panel de vez en cuando (basta con eso).
- Programar un despliegue mensual en Netlify.
- Pasar al plan Pro (25 USD/mes) cuando el proyecto lo justifique.

El panel de administración conectado a Supabase (opción B de
[DATOS.md](DATOS.md)) resuelve esto solo: cada edición es actividad.

### Conectar el panel abre un agujero en la CSP

Hoy `connect-src 'self'` significa que el sitio no habla con nadie de fuera.
Cuando el panel consulte Supabase desde el navegador habrá que añadir
`https://<ref>.supabase.co` en `netlify.toml` **y** en el `<meta>` de
`index.html` — los dos, o el `<meta>` bloqueará lo que la cabecera permite.

`npm run test:csp` sigue vigilando que no aparezca JavaScript en línea.

---

## Lo que sigue funcionando igual

- El visitante **nunca** habla con Supabase: recibe HTML ya escrito.
- Si Supabase se cae, el sitio no se entera.
- `data/catalogo.json` sigue en git, así que siempre hay a dónde volver.

Y lo que cambia de naturaleza: `data/catalogo.json` pasa a ser un **archivo
generado**, como `sitemap.xml`. Editarlo a mano se pierde en la siguiente
exportación.

---

## Sobre "que el administrador manipule todo"

Con esto, tu administrador edita desde el **Table Editor** de Supabase: se ve
como una hoja de cálculo, funciona desde el celular, y a diferencia de una
hoja de verdad, rechaza un precio negativo o un año imposible.

Pero conviene decirlo claro: el Table Editor es una herramienta para quien
construye software. Enseña nombres de columna en crudo, precios en centavos
(`285000000`, no `$2,850,000`) y da acceso a tablas que nadie debería tocar a
mano, como `bitacora`. Sirve muy bien para arrancar y para arreglar algo
puntual.

El panel del propio sitio —conectado a Supabase— es lo que de verdad quieres a
mediano plazo: habla de equipos y precios, no de filas y columnas. Ése es el
siguiente proyecto, y ahora tiene dónde guardar las cosas.
