# El servidor: SQL Server en la oficina

La base de datos de mdcmaquinaria.com es el **SQL Server de la computadora de la
oficina**. El sitio sigue en Cloudflare Pages; lo que necesita de un servidor
(cotizaciones, preguntas, el panel, las fotos) lo pide a `servidor/Mdc.Api`, que
corre en esa computadora como servicio de Windows y sale a internet por
**Cloudflare Tunnel** como `https://api.mdcmaquinaria.com`.

```
 visitante ──► mdcmaquinaria.com (Cloudflare Pages, HTML ya escrito)
                    │  cotización / pregunta / panel
                    ▼
            api.mdcmaquinaria.com (Cloudflare) ══ túnel ══► esta PC
                                                            ├─ MdcApi (servicio, 127.0.0.1:5080)
                                                            └─ SQL Server Express (MdcMaquinaria)
```

## Lo que hay que saber antes

- **La PC tiene que estar encendida y con internet.** Si se apaga, el catálogo se
  sigue viendo (es HTML estático), pero no llegan cotizaciones ni preguntas, el
  panel no abre y "Publicar" no puede leer el catálogo.
- **Respaldos.** Ahora los datos viven en esta máquina. Programa un respaldo de
  la base `MdcMaquinaria` y de la carpeta `C:\ProgramData\MdcMaquinaria\fotos`
  a otro disco o a la nube. Sin eso, un disco dañado es perder el catálogo.
- La API sólo escucha en `127.0.0.1`: nadie de la red ni de internet entra
  directo. La única puerta es el túnel.

## 1. Instalar el servicio

En una terminal **como administrador**, desde la carpeta del repositorio:

```powershell
dotnet publish servidor\Mdc.Api -c Release -o servidor\publicado
servidor\publicado\Mdc.Api.exe instalar
```

Crea la base, el servicio `MdcApi` (arranca con Windows, se reinicia si se cae,
corre con su propia cuenta `NT SERVICE\MdcApi`) y te pide dos secretos:

| Pide | De dónde sale |
|---|---|
| `AVISO_SECRETO` | El mismo valor que tiene Cloudflare Pages → Settings → Environment variables. Es lo que autoriza al servidor a pedir los correos de aviso. |
| `DEPLOY_HOOK` | Cloudflare Pages → Settings → Builds → Deploy hooks. Es lo que dispara "Publicar". |

La clave de los tokens de sesión la genera solo y no la ve nadie. Los secretos
quedan en `C:\Program Files\MdcApi\appsettings.Production.json`, que sólo
pueden leer los administradores y el servicio.

**Actualizar** el servidor después de un cambio: los mismos dos comandos. No toca
datos ni secretos. Para cambiar los secretos:
`"C:\Program Files\MdcApi\Mdc.Api.exe" configurar --rehacer`.

## 2. Publicarlo con Cloudflare Tunnel

Lo más simple es crearlo desde el panel de Cloudflare:

1. Cloudflare → **Zero Trust → Networks → Tunnels → Create a tunnel** →
   Cloudflared → nombre `mdc-api`.
2. Te da un comando `cloudflared service install <token>`. Instala cloudflared
   (`winget install --id Cloudflare.cloudflared`) y corre ese comando en una
   terminal como administrador.
3. En **Public Hostname**: subdominio `api`, dominio `mdcmaquinaria.com`,
   servicio `HTTP` → `127.0.0.1:5080`.

Comprueba: abre `https://api.mdcmaquinaria.com/salud` → debe decir `{"ok":true}`.

## 3. Traer los datos de Supabase (una sola vez)

En una terminal normal, con la llave de servicio de Supabase **sólo en esa
ejecución** (Supabase → Project Settings → API → `service_role`):

```powershell
$env:SUPABASE_URL = 'https://xxxx.supabase.co'
$env:SUPABASE_SERVICE_KEY = '…'
& "C:\Program Files\MdcApi\Mdc.Api.exe" importar --desde-supabase
Remove-Item Env:SUPABASE_SERVICE_KEY
```

Trae equipos (con borradores), cotizaciones, preguntas, métricas, ajustes,
sucursales y las fotos. **Las contraseñas no se pueden traer**: al final imprime
un enlace por cuenta; mándale a cada quien el suyo para que elija contraseña
(caducan en 7 días).

## 4. Cambiar el sitio

1. Cloudflare Pages → Settings → Environment variables:
   - `API_URL` = `https://api.mdcmaquinaria.com`
   - deja `AVISO_SECRETO`, `RESEND_API_KEY`, `AVISO_DESTINO` como están.
2. Build command: `npm run db:export && npm run build`.
3. Une la rama `sql-server` a `main` y súbela. El despliegue lee el catálogo de
   la API y publica.
4. Prueba: una cotización desde el celular, una pregunta, entrar al panel y
   cambiar un precio, "Publicar".

Cuando lleve una semana funcionando: borra `SUPABASE_URL`, `SUPABASE_ANON_KEY`
y `SUPABASE_SERVICE_KEY` de Cloudflare, y pausa o borra el proyecto de Supabase.

## Si algo falla

| Síntoma | Dónde mirar |
|---|---|
| El panel dice "El servidor de la oficina no responde" | ¿PC encendida? `Get-Service MdcApi, cloudflared` |
| `api.mdcmaquinaria.com` da error 530 | El túnel no ve la PC: servicio `cloudflared` |
| El servicio no arranca | Visor de eventos → Registros de Windows → Aplicación, origen `MdcApi` |
| "La base no está al día" | Falta aplicar una migración: vuelve a correr `instalar` |
| No llegan correos de aviso | `AVISO_SECRETO` distinto entre el servidor y Cloudflare |

## Desarrollo

```powershell
cd servidor
$env:DOTNET_ENVIRONMENT = 'Development'          # base MdcMaquinaria_Dev
dotnet user-secrets set Jwt:Clave "<48 bytes al azar>" --project Mdc.Api
dotnet run --project Mdc.Api -- migrar
dotnet run --project Mdc.Api -- importar --desde-json C:\ruta\al\repo\data\catalogo.json
dotnet run --project Mdc.Api -- invitar-admin tu@correo.mx "Tu Nombre"
dotnet run --project Mdc.Api                     # http://localhost:5080
```

Pruebas: `npm run test:servidor` (API contra una base desechable + reglas de la
base) y `npm run test:e2e` (Edge contra la API de desarrollo; ver la cabecera de
`tests/e2e-servidor.test.js`).
