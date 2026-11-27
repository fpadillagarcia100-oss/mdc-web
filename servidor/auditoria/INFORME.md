# Auditoría de permisos: SQL Server y API (T-05)

- **Fecha:** 2026-11-27
- **Hizo:** Claude · **Revisa:** Gemini
- **Alcance:** el SQL Server Express de la oficina (base `MdcMaquinaria`) y
  `servidor/Mdc.Api`, la API que publica Cloudflare Tunnel como
  `api.mdcmaquinaria.com`. Supabase queda fuera: ya no se usa.
- **Cómo:** lectura del código (`servidor/Mdc.Api`, `servidor/sql/001_esquema.sql`,
  `Instalar.cs`, `Configurar.cs`) y un script SQL de sólo lectura para que Paco lo
  corra en la PC de la oficina: [`auditoria-permisos.sql`](auditoria-permisos.sql).
  **El script no se ejecutó contra la base**: la tarea pide entregarlo. Sólo se
  validó su sintaxis con `SET PARSEONLY ON`, que no corre consultas ni lee datos.

## Resumen

La base está bien planteada: la API entra con su propia cuenta de Windows
(sin contraseñas en archivos), no puede cambiar el esquema, todo lo del panel
exige ser administrador **comprobado en la base en cada petición**, las
consultas no admiten inyección SQL y los secretos están en un archivo que sólo
leen Administradores, SYSTEM y el servicio.

Lo que conviene corregir, por orden:

| # | Riesgo | Hallazgo | Dónde |
|---|---|---|---|
| 1 | Medio | La API puede **borrar, cambiar o falsificar renglones de la bitácora** | `Instalar.cs:82-84` |
| 2 | Medio | La bitácora **no registra cambios de cuentas ni de roles** | `001_esquema.sql:312-358` |
| 3 | Medio | El panel entra **sólo con contraseña**, sin segundo factor | `AuthEndpoints.cs` |
| 4 | Medio | **Respaldos**: no se pueden confirmar desde el código | script, sección 3 |
| 5 | Bajo | El bloqueo por contraseñas malas **revela qué correos tienen cuenta**, deja a un tercero bloquear al administrador y su contador no es atómico | `AuthEndpoints.cs:47-65` |
| 6 | Bajo | Permiso de ejecutar **cualquier** procedimiento de la base | `Instalar.cs:84` |
| 7 | Bajo | Renovar sesión con el mismo token dos veces **a la vez** puede abrir dos sesiones | `AuthEndpoints.cs:85-105` |
| 8 | Bajo | `/salud` y `/fotos` sin límite de peticiones | `Program.cs:121-144` |
| 9 | Por confirmar | **Exposición de SQL Server a la red** (SQL Browser, TCP/IP) | Windows y script, sección 2 |

Ninguno es una puerta abierta hoy: son capas de defensa que faltan.

## Hallazgos

### 1. La API puede borrar o cambiar la bitácora (medio)

El instalador mete a `NT SERVICE\MdcApi` en `db_datawriter`, que da
INSERT, UPDATE y DELETE **en todas las tablas**, incluida `dbo.bitacora` y
`dbo._migraciones`. La API nunca lo hace, pero si alguien llegara a ejecutar
código con esa cuenta (un error futuro, una dependencia comprometida) podría
borrar el rastro de lo que cambió, o **escribir renglones falsos** con el
autor que quisiera.

**Propuesta** (no aplicada; es un cambio al instalador y va en otra tarea):

```sql
DENY INSERT, UPDATE, DELETE ON dbo.bitacora     TO [NT SERVICE\MdcApi];
DENY INSERT, UPDATE, DELETE ON dbo._migraciones TO [NT SERVICE\MdcApi];
```

Los disparadores siguen escribiendo la bitácora: son de `dbo`, igual que la
tabla, y el encadenamiento de propiedad no vuelve a revisar permisos (tampoco
los DENY). Después de aplicarlo, correr `npm run test:servidor`.

### 2. La bitácora no registra cuentas ni roles (medio)

Sólo `equipos` y `sucursales` tienen disparador de bitácora. Invitar a un
administrador, cambiar un rol, borrar una cuenta o cambiar los ajustes del
sitio (teléfono, WhatsApp, correo) **no deja rastro en la base**; a lo más un
error en el Visor de eventos. Es justo lo que más importa saber si alguien
entra al panel con una contraseña robada.

**Propuesta:** un disparador `usuarios_bitacora` (sin copiar
`hash_contrasena`, `invitacion_hash` ni los intentos) y otro para `ajustes`.
El de usuarios debe anotar sólo altas, bajas y cambios de `rol`, `correo` o
`nombre`: cada contraseña mala actualiza `intentos_fallidos` y, si se anotara,
llenaría la bitácora de ruido. Es lógica nueva: tarea aparte.

### 3. Sin segundo factor en el panel (medio)

Con correo y contraseña basta para administrar el catálogo, las cuentas y
publicar el sitio. Hay buenas defensas alrededor (10 intentos por minuto por
IP, bloqueo de 15 minutos tras 5 errores, contraseñas de 10 caracteres o más,
PBKDF2 con sal, sesiones de 1 hora que se renuevan con un token de un solo
uso), pero una contraseña reutilizada y filtrada en otro sitio abre el panel.

**Propuesta:** un segundo factor con app (TOTP) para los administradores.
Tarea aparte.

### 4. Respaldos (medio, por confirmar)

`docs/SERVIDOR.md` pide programarlos, pero nada en el código lo hace y
SQL Server Express **no trae el Agente** para programarlos solo. La sección 3
del script dice cuándo fue el último respaldo completo y, si la base está en
modelo FULL, el del log (sin él, el archivo de log crece sin límite).

**Propuesta:** una tarea del Programador de tareas de Windows que haga
`BACKUP DATABASE` diario y copie el archivo, junto con
`C:\ProgramData\MdcMaquinaria\fotos`, a otro disco o a la nube.

### 5. El bloqueo revela cuentas y permite bloquear al admin (bajo)

Tras 5 contraseñas malas, `/api/auth/entrar` responde **"Demasiados
intentos"** (429), mientras que un correo sin cuenta siempre responde
"Correo o contraseña incorrectos". Probando 6 veces se sabe si un correo es
del panel. Y quien sepa el correo del administrador puede dejarlo fuera 15
minutos cada vez.

Además, el contador no es atómico (`AuthEndpoints.cs:58-65`): lee
`intentos_fallidos`, suma uno en el programa y escribe el número. Varias
contraseñas enviadas **a la vez** leen el mismo valor, así que se pueden
probar más de 5 antes del bloqueo. El límite de 10 por minuto por IP lo
acota, pero no si las peticiones vienen de muchas IP.

**Propuesta:** contestar lo mismo para correos sin cuenta (contar también sus
intentos), que el bloqueo cuente por cuenta **y** IP, y sumar en la base
(`SET intentos_fallidos = intentos_fallidos + 1 OUTPUT inserted.intentos_fallidos`).
Tarea aparte.

### 6. Ejecutar cualquier procedimiento (bajo)

`GRANT EXECUTE TO [NT SERVICE\MdcApi]` vale para todos los procedimientos,
también los que se creen después. Hoy sólo existen `dbo.preguntar` y
`dbo.contar`, que son justo los que usa.

**Propuesta:** `GRANT EXECUTE ON dbo.preguntar` y `ON dbo.contar` en lugar del
permiso general.

### 7. Renovación simultánea (bajo)

`/api/auth/renovar` lee la sesión, comprueba que no esté revocada y después la
revoca, en dos pasos. Dos peticiones al mismo tiempo con el mismo token pasan
las dos y abren dos sesiones, y la detección de token robado no salta.

**Propuesta:** revocar y comprobar en una sola instrucción
(`UPDATE … SET revocada = 1 WHERE id = @id AND revocada = 0` y mirar cuántas
filas cambió).

`/renovar` tampoco comprueba el rol ni el bloqueo antes de dar tokens nuevos.
Hoy no es un riesgo: los tokens no abren nada sin pasar por `SoloAdmin`, que
pregunta el rol a la base en cada petición, y quitarle el rol a alguien ya
cierra sus sesiones. Se puede sumar a la misma tarea.

### 8. Rutas sin límite de peticiones (bajo)

`/salud` abre una conexión a la base en cada llamada y no tiene límite;
`/fotos/…` tampoco (Cloudflare las cachea, así que casi no llegan). Las rutas
de `/api/admin` no tienen límite, pero exigen sesión de administrador.

**Propuesta:** `RequireRateLimiting("publico")` en `/salud`.

### 9. Exposición de SQL Server a la red (por confirmar)

La API entra a la base por memoria compartida (`Server=.\SQLEXPRESS`): no
necesita que SQL Server se vea en la red. El servicio **SQL Browser**, el
protocolo **TCP/IP** y las **canalizaciones con nombre** sólo hacen falta si
otra máquina se conecta a la base. Si están encendidos sin que nadie los use,
son una puerta de más.

**Propuesta:** correr el script (sección 2) y revisar el firewall. Si nadie se
conecta a la base desde otra máquina, apagar TCP/IP y canalizaciones con
nombre y deshabilitar SQL Browser. Si alguien sí se conecta, limitar las
reglas del firewall a la IP de esa máquina.

## Qué protege cada ruta de la API

| Ruta | Quién puede | Límite |
|---|---|---|
| `GET /salud` | Cualquiera | Ninguno |
| `GET /fotos/…` | Cualquiera; sólo sirve .webp, .avif, .jpg, .png | Ninguno (caché de Cloudflare) |
| `GET /api/catalogo` | Cualquiera; sólo lo publicado | 30/min por IP |
| `POST /api/solicitudes` | Cualquiera | 30/min por IP + 3 por teléfono cada 10 min (en la base) |
| `POST /api/preguntas` | Cualquiera, sólo sobre equipos publicados | 30/min por IP + 5 por equipo cada 10 min (en la base) |
| `POST /api/contar` | Cualquiera; sólo suma de uno en uno | 30/min por IP |
| `POST /api/auth/entrar`, `renovar`, `salir`, `aceptar-invitacion` | Cualquiera | 10/min por IP + bloqueo tras 5 errores |
| `GET /api/auth/yo` | Con sesión | 10/min por IP |
| `/api/admin/*` (equipos, ajustes, sucursales, cotizaciones, preguntas, métricas, usuarios, publicar, fotos) | **Administrador**, comprobado en la base en cada petición | Ninguno; "publicar" una vez cada 2 min |

El rol `staff` existe en la base pero no abre ninguna ruta: hoy sólo sirve
para dejar a alguien sin acceso sin borrarlo.

## Lo que está bien (comprobado en el código)

- **La API sólo escucha en 127.0.0.1:5080**; la única entrada desde internet
  es el túnel de Cloudflare (`appsettings.json`).
- **Sin contraseña de base de datos en ningún archivo:** la API entra con la
  cuenta virtual `NT SERVICE\MdcApi` (seguridad integrada de Windows).
- **La API no puede cambiar el esquema:** sólo `db_datareader`,
  `db_datawriter` y `EXECUTE`; las migraciones las aplica el instalador con la
  cuenta de quien instala.
- **Sin inyección SQL:** todas las consultas usan parámetros. Las que arman
  texto (`AdminEndpoints.cs:71, 87, 113`) sólo ponen nombres de columna de una
  lista blanca (`Columnas.cs`), nunca texto que llega de fuera.
- **Administrador comprobado en cada petición** (`SoloAdmin.cs`): quitarle el
  rol a alguien lo saca del panel al instante, no al caducar su token. Cambiar
  el rol a staff también cierra sus sesiones.
- **La base hace cumplir sus reglas** aunque alguien escriba directo: nunca
  queda sin administrador, frenos de spam, formatos, tamaños.
- **Contraseñas y tokens:** PBKDF2 con sal; de los tokens de sesión y de
  invitación sólo se guarda el SHA-256; el token de renovación es de un solo
  uso y, si se reutiliza, se cierran todas las sesiones de esa cuenta.
- **Clave de firma de sesiones** generada por el programa (48 bytes al azar);
  el servicio no arranca con una clave corta.
- **Secretos** (`appsettings.Production.json`): herencia de permisos cortada;
  sólo Administradores, SYSTEM y la cuenta del servicio (lectura).
- **Fotos:** sólo administradores suben; se comprueba que sean WebP de verdad
  y de 3 MB como mucho; el nombre lo pone el servidor y la carpeta sale de un
  slug validado (sin `..\`).
- **IP real del visitante:** `CF-Connecting-IP` sólo se cree si la conexión
  viene de la propia máquina (cloudflared).
- **Cabeceras:** `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy:
  no-referrer`; CORS sólo para mdcmaquinaria.com.

## Corrida en la PC de la oficina

El script se corrió el 2026-11-27, con permiso de Paco. **Los resultados no
están en este repositorio a propósito: el repositorio es público** y el
resultado describe cuentas, puertos y reglas del firewall de la máquina. Paco
los tiene en su Escritorio, con la interpretación y el orden en que conviene
atenderlos. Lo mismo vale para cualquier corrida futura: **nunca** subir
`auditoria.txt` ni copiar sus filas a un archivo del repositorio, a un issue
o a un PR.

Se vio también que el script marca como REVISAR algunas cosas que son de
fábrica: logins internos ligados a certificados (`l_certSign…`), permisos que
el instalador de SQL Server da a `NT AUTHORITY\SYSTEM` y el Agente
deshabilitado de la edición Express. Queda para afinarlo en otra tarea.

## Cómo correr la auditoría en la PC de la oficina

En una terminal de PowerShell **como administrador**, desde la carpeta del
repositorio (en el Símbolo del sistema, cambiar `$env:USERPROFILE` por
`%USERPROFILE%`):

```powershell
sqlcmd -S .\SQLEXPRESS -E -f 65001 -i servidor\auditoria\auditoria-permisos.sql -W -s "|" -o "$env:USERPROFILE\Desktop\auditoria.txt"
```

`auditoria.txt` queda en el Escritorio, fuera del repositorio. Trae dos
tablas: quién tiene cuenta en el panel y los controles (primero las
ALERTAS). **No contiene contraseñas, hashes ni tokens**, pero sí correos: no
subirlo. Si la base no se llama `MdcMaquinaria`, cambiar las dos líneas
marcadas con ◄; si el nombre está mal, el script lo dice con una ALERTA en
lugar de revisar otra base.

Lo que el script no puede ver y conviene revisar a mano en Windows:

- `Get-Service SQLBrowser`: ver hallazgo 9.
- Que el Firewall de Windows no tenga reglas de entrada para SQL Server
  (puertos 1433/TCP y 1434/UDP) ni para el 5080.
- Quiénes son administradores de la PC (`Get-LocalGroupMember Administradores`):
  todos ellos pueden leer los secretos y la base completa.

## Detalles menores

- `appsettings.json` dice que los secretos los pone `servidor/instalar.ps1`;
  ahora los pone `Mdc.Api.exe configurar` (`Configurar.cs`). Sólo el texto está
  desactualizado.
- La cadena de conexión lleva `TrustServerCertificate=True`. Con la base en la
  misma PC por memoria compartida no hay red de por medio; si algún día la
  base se mueve a otra máquina, habría que quitarlo y usar un certificado.
- La tabla `sesiones` guarda para siempre las vencidas y cerradas; no es un
  riesgo, sólo crece. El script dice cuántas hay.
- `Instalar.cs:80` arma `USE [{nombreBase}]` sin escapar un `]` en el nombre.
  El nombre lo escribe quien instala, como administrador, así que no es una
  puerta; con `QUOTENAME` quedaría correcto para cualquier nombre.
