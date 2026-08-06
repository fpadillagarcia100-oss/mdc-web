# Backend — arquitectura y seguridad

Diseño del backend con Supabase. Léelo antes de tocar el esquema: las
decisiones de aquí son las que sostienen la seguridad del sistema.

## Lo que cambia respecto a hoy

| Hoy | Con backend |
|---|---|
| El catálogo vive en el navegador de quien lo edita | Vive en una base de datos, igual para todos |
| El PIN se compara en el cliente (saltable) | Sesión verificada por el servidor en cada operación |
| Las cotizaciones se pierden si no llega el WhatsApp | Quedan registradas con fecha y estado |
| Google no puede indexar equipos | Una URL por equipo, indexable |
| Las fotos ocupan el límite de 5 MB del navegador | Almacenamiento con CDN, sin límite práctico |

## El punto que hay que entender

Supabase expone la base de datos **directamente al navegador**. No hay un
servidor intermedio que revise cada petición: el cliente habla con Postgres
usando una llave pública que cualquiera puede leer en el código fuente.

> **Las políticas RLS son la seguridad. No hay una segunda línea de defensa.**

Por eso el esquema arranca negando todo (`enable row level security` sin
políticas = nadie puede nada) y va concediendo permisos mínimos, explícitos,
tabla por tabla.

## Decisiones y por qué

### 1. Negar por defecto, conceder por excepción
Cada tabla enciende RLS y además `force row level security`, que aplica las
políticas incluso al dueño de la tabla. Una tabla nueva sin políticas es
inaccesible: el error se manifiesta como "no funciona", no como "quedó
abierta". **El modo de fallo seguro es el que no te enteras tarde.**

### 2. Las solicitudes se escriben, no se leen
La tabla `solicitudes` guarda nombre, teléfono y correo de clientes.

- `INSERT` → permitido a cualquiera (para eso es el formulario)
- `SELECT` → **sólo al personal**

Es la política más importante del sistema. La filtración clásica en proyectos
con Supabase es dejar `for all using (true)` en la tabla de prospectos: con
eso, la competencia descarga tu cartera completa en una sola petición, sin
credenciales y sin dejar rastro.

Tampoco se pueden borrar, ni siquiera siendo admin: son registro comercial y
evidencia de consentimiento bajo la LFPDPPP. Se marcan como `cerrada` o `spam`.

### 3. El rol no lo decide el usuario
El rol vive en `perfiles`, no en los metadatos del usuario (que en ciertas
configuraciones el cliente puede editar). Además, un trigger impide cambiar
`rol` a quien no sea admin.

Sin eso, cualquiera que pueda editar su propio perfil se asciende a
administrador. Es la escalada de privilegios más común y más fácil de evitar.

### 4. `set search_path = ''` en cada función
Toda función con `security definer` fija el `search_path` vacío. Sin eso,
alguien capaz de crear un esquema podría suplantar la tabla `perfiles` con una
suya y hacer que `es_admin()` devuelva `true`. Es una vía de ataque real,
documentada, y se cierra con una línea.

### 5. Freno de spam del lado del servidor
El filtro del navegador —campo trampa y tiempo mínimo— se salta con un script
de dos líneas. El trigger `frenar_spam_solicitudes` limita a 3 solicitudes por
teléfono cada 10 minutos, y corre donde el atacante no llega.

Regla general: **toda validación del cliente es para la experiencia del
usuario; la del servidor es la que protege.** Se hacen las dos.

### 6. Dinero en enteros
Los precios se guardan en centavos como `bigint`. En punto flotante,
`0.1 + 0.2` no da `0.3`, y eso son centavos que desaparecen de las sumas. En
un catálogo de millones de pesos, no es aceptable.

### 7. El almacenamiento también se cierra
Lectura pública (son fotos de catálogo), escritura sólo del personal, con
límite de tamaño y lista blanca de tipos **aplicados en el servidor**. Un
bucket abierto a escritura termina alojando contenido ajeno bajo tu dominio.

### 8. Bitácora
Cada alta, cambio o baja en `equipos` y `sucursales` queda registrada con quién
y qué cambió. El día que un precio aparezca mal, es lo único que responde
"¿qué pasó?".

## Reglas que no se rompen

1. **La llave `service_role` jamás toca el navegador.** Se salta todo el RLS.
   Va sólo en variables de entorno del servidor. Si se filtra, se rota de
   inmediato desde el panel de Supabase.
2. **Nada de secretos en el repositorio.** El `.gitignore` ya bloquea `.env`.
3. **La llave `anon` sí es pública** — está diseñada para eso. Su seguridad
   depende por completo del RLS.
4. **Toda tabla nueva enciende RLS en la misma migración** en que se crea.
5. **Toda validación se hace dos veces**: en el cliente y en el servidor.

## Puesta en marcha

```bash
npm install -D supabase
npx supabase login
npx supabase link --project-ref <ref-del-proyecto>
npx supabase db push
```

Después:

1. Regístrate en el sitio. **El primer usuario queda como admin
   automáticamente** — hazlo tú, de inmediato, antes de que el sitio sea
   conocido. Los siguientes entran como `staff`.
2. En Supabase → Authentication → Providers: deja sólo correo, y **desactiva
   el registro abierto** una vez creadas las cuentas del personal.
3. Activa 2FA en tu cuenta de Supabase.
4. Confirma en el panel que ninguna tabla aparece con el aviso
   *"RLS disabled"*.

## Verificación

Antes de dar por bueno el backend, comprobar con la llave pública (anon):

- [ ] `select` a `solicitudes` devuelve **0 filas**, no error — debe estar vacío
      para el público
- [ ] `insert` en `equipos` es **rechazado**
- [ ] `update` de un precio es **rechazado**
- [ ] `select` a `equipos` devuelve **sólo** los publicados
- [ ] Subir un archivo al bucket es **rechazado**
- [ ] Cambiar el propio `rol` a `admin` es **rechazado**

Estas comprobaciones van como pruebas automatizadas en el CI. Una política de
seguridad que nadie verifica es una suposición, no una protección.

**Ya están escritas** en [tests/seguridad.test.js](../tests/seguridad.test.js).
Corren contra la API real con la llave pública —intentando el ataque, no
leyendo el SQL— porque que una política exista no significa que haga lo que
crees:

```bash
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=<anon> npm run test:seguridad
```

Sin credenciales se saltan con un aviso, para que `npm test` siga corriendo en
una máquina sin base de datos.

## ⚠️ El formulario debe enviar con `return=minimal`

Descubierto al probar contra la base real, y no es evidente:

```js
// Correcto
{ headers: { Prefer: 'return=minimal' } }

// Rompe el formulario
{ headers: { Prefer: 'return=representation' } }
```

Con `return=representation`, PostgREST hace `INSERT ... RETURNING`, y devolver
la fila exige permiso de **SELECT**. El público no lo tiene sobre
`solicitudes` — para eso está la política que protege la cartera de clientes.
Resultado: la inserción entera se rechaza.

Lo traicionero es el diagnóstico. El error dice *"new row violates row-level
security policy"*, que suena a política de INSERT mal puesta. No lo es: la de
INSERT está bien, falla la lectura de vuelta. Se pierden horas ahí.

Y que falle es lo correcto: si devolviera la fila, bastaría con insertar para
empezar a leer la tabla de prospectos.

## Lo que se corrigió después del diseño inicial

La migración
[`…_endurecer_seguridad.sql`](../supabase/migrations/20260806000002_endurecer_seguridad.sql)
cierra cuatro rendijas del esquema de origen. La primera era explotable:

1. **El freno de spam era saltable.** `creado_en` tiene `default now()`, pero
   un valor por omisión sólo aplica si el cliente no manda el campo — y podía
   mandarlo. Insertando con `creado_en = '2020-01-01'`, el conteo de "últimos
   10 minutos" daba cero y el límite de 3 por teléfono no frenaba nada. Ahora
   el trigger pisa la fecha. **Un dato que decide un permiso nunca puede venir
   del cliente, aunque tenga default.**
2. **`carrito` no tenía tope de tamaño.** `mensaje` estaba topado en 4 000
   caracteres; `carrito` era un `jsonb` libre, y Postgres acepta hasta 1 GB.
   Con la llave pública se podía agotar la cuota del plan. Todo campo que
   escriba un desconocido va topado.
3. **La política de edición de perfiles no tenía `with check`.** `using` dice
   qué filas puedes tocar; `with check`, cómo pueden quedar. Sin la segunda,
   la política está incompleta aunque otras restricciones tapen el hueco.
4. **El rol `staff` no concedía nada.** Todas las políticas exigen
   `es_admin()`, así que un `staff` equivalía a un visitante — pero el
   comentario decía "el personal ve todo". Esa creencia falsa es de donde
   salen los permisos abiertos de más. No se amplió nada: la decisión está
   planteada en la migración para que la tomes tú.

## Lo que se añadió después: video, ficha técnica y preguntas

Migración
[`…_video_ficha_preguntas.sql`](../supabase/migrations/20260806000006_video_ficha_preguntas.sql).

### Video: se guarda el identificador, no la dirección

`equipos.video_url` acepta exactamente once caracteres alfanuméricos y nada
más. Una columna de texto libre aquí sería una puerta abierta: bastaría con
guardar `javascript:…` o el dominio de un tercero para incrustar algo ajeno
dentro de las fichas, que es donde más caro sale.

Con once caracteres no cabe una dirección. El sitio arma el enlace hacia
`youtube-nocookie.com`, y ese dominio es el único que la CSP permite meter en
un marco (`frame-src`). Dos cierres independientes para la misma cosa.

El reproductor **no se carga hasta que alguien le da al play**. Antes de eso la
página no habla con ningún tercero: se ve una portada y un botón. No es sólo
privacidad — es que una ficha con un iframe de YouTube pesa varios cientos de
kilobytes más, y se abre desde una obra con mala señal.

El video **no se sube a nuestro almacenamiento** a propósito. Treinta megas
vistos doscientas veces son seis gigas de tráfico al mes, y el plan da cinco.

### Ficha técnica: `jsonb` con claves conocidas

`equipos.atributos` guarda `{"horas": 2400, "peso": 20}`. El catálogo de claves
vive en [`assets/js/atributos.js`](../assets/js/atributos.js) y lo comparten el
panel, los filtros, el comparador y el generador de fichas — **un solo sitio**,
porque dos listas de campos acaban no diciendo lo mismo y el fallo aparece sólo
en las páginas publicadas.

Es `jsonb` y no columnas porque una grúa torre y un minicargador casi no
comparten datos: en columnas serían treinta, veinticinco nulas por renglón.

Como es la única columna del esquema donde cabe cualquier forma, lleva su tope
(`pg_column_size <= 4096`) y las claves desconocidas se descartan al normalizar.

### Preguntas: la tabla no tiene política de `INSERT`

Es la decisión que sostiene todo lo demás. Si el público pudiera insertar
directo, tendría que poder nombrar todas las columnas — incluidas `respuesta` y
`publicada`. Un `with check` lo taparía hoy, y cada columna nueva volvería a
abrir el hueco hasta que alguien se acordara de actualizarlo.

La única puerta es `preguntar(slug, nombre, pregunta)`, `security definer` con
`search_path = ''`. Lo que decide el servidor no se puede ni nombrar desde
fuera: una pregunta **nace sin responder y sin publicar, siempre**.

Dos frenos, porque son dos problemas distintos:

- **cinco por equipo cada diez minutos** — contra el que aporrea el botón;
- **treinta sin contestar por equipo** — contra el que vuelve mañana. Una
  bandeja con cien preguntas basura es una bandeja que nadie abre, y ahí se
  pierden las de verdad. Se libera sola conforme se contestan.

Y una diferencia deliberada con las solicitudes: **las preguntas sí se pueden
borrar.** Una solicitud es registro comercial y evidencia del consentimiento con
que alguien dio sus datos. Una pregunta de spam no es registro de nada.

### Lo que se publica pasa por el compilador, no por el navegador

Las preguntas contestadas viajan **dentro del sitio**, como el resto del
catálogo: `npm run db:export` se trae las publicadas y `npm run build` las
escribe en cada ficha, con sus datos estructurados.

Se pensó en pedirlas desde el navegador para que una respuesta se viera al
momento. Se descartó por tres motivos, en este orden: Google no indexaría lo que
sólo existe tras ejecutar JavaScript (y ésa es la mitad de la razón de tenerlas
en público), sería una petición por visita, y una dependencia más que puede
caerse. El precio es que una respuesta nueva se ve al publicar — igual que un
precio nuevo.

## Aviso por correo cuando entra una cotización

Función: [`functions/api/aviso-solicitud.js`](../functions/api/aviso-solicitud.js).

### El agujero que tapa

Una cotización se guarda en la base y acto seguido se le abre WhatsApp al
cliente con el mensaje ya escrito. Pero **el cliente puede no darle enviar**:
se lo piensa, se le va la señal, cambia de app y no vuelve.

Esa solicitud queda con su nombre y su teléfono, y nadie se entera hasta que
alguien entra al panel. Es el peor cliente perdido: uno que ya levantó la mano.

### Por qué avisa el servidor y no el navegador

Lo fácil sería mandar el aviso desde la página, justo tras registrar. Se
descartó por dos motivos, y el segundo decide:

- **No es fiable.** Es el mismo navegador que puede cerrarse, y el mismo
  momento en que se pierde el WhatsApp. Fallarían los dos a la vez —
  exactamente en el caso que veníamos a cubrir.
- **Sería falsificable.** Cualquiera podría llamar a la dirección y llenar el
  correo de avisos inventados.

Lo dispara la base: un Database Webhook de Supabase sobre `INSERT` en
`solicitudes`. Pase lo que pase en el navegador, si la fila existe, el aviso
sale.

### Configuración

Todo es opcional. Sin configurar, el sitio funciona igual y la función
responde `200 {ok:false}` — nunca un error, para que Supabase no marque el
webhook como fallido y lo reintente en bucle.

En **Cloudflare Pages → Settings → Environment variables**:

| Variable | Qué es |
|---|---|
| `AVISO_SECRETO` | ⚠️ Secreta. Una cadena larga inventada. Es lo único que distingue a Supabase de cualquiera que descubra la dirección. |
| `AVISO_DESTINO` | Tu correo. Acepta varios separados por coma. |
| `RESEND_API_KEY` | ⚠️ Secreta. De [resend.com](https://resend.com), gratis hasta 3 000 correos al mes. |
| `AVISO_REMITENTE` | Opcional. Por omisión usa el remitente de pruebas de Resend, que funciona sin verificar dominio. |

En **Supabase → Database → Webhooks → Create**: tabla `solicitudes`, evento
`INSERT`, tipo *HTTP Request*, método `POST`, URL
`https://mdcmaquinaria.com/api/aviso-solicitud`, y una cabecera
`x-aviso-secreto` con el mismo valor de `AVISO_SECRETO`.

### Detalles que no son adorno

- El secreto se compara **en tiempo constante**. Un `===` corta en la primera
  letra distinta, y esa diferencia de microsegundos deja adivinarlo letra por
  letra. Evitarlo cuesta ocho líneas.
- El **teléfono va en el asunto**. En la lista del correo, sin abrir nada, ya
  se ve a quién hay que marcar.
- `reply_to` apunta al correo del cliente: contestar el aviso le escribe a él.
- Si Resend falla, se devuelve `200` igualmente y se registra en el log. Un
  problema de configuración no puede convertirse en decenas de reintentos por
  cada cotización — la solicitud ya está guardada, el aviso es una mejora.
