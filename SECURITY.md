# Seguridad

Documento honesto sobre qué protege este proyecto y qué no. Léelo antes de
publicar el sitio o de confiarle datos de clientes.

## Resumen en una línea

> Esta es una aplicación **sin servidor**. Todo el código corre en el navegador
> del visitante, así que **no existe ninguna medida que un atacante decidido no
> pueda saltarse**. Lo que hay protege contra errores, accidentes y bots.

Esto no es un defecto de implementación: es una consecuencia inevitable de la
arquitectura. La única solución real es mover las decisiones a un servidor.

## Qué sí está implementado

### Escapado de salida — `assets/js/security.js`
Todo dato que se inyecta en el DOM pasa por `esc()`, que neutraliza
`& < > " '`. Sin esto, un nombre de equipo como `<img onerror=…>` —escrito por
error o traído en un respaldo importado— ejecutaría código en la página.

### Política de seguridad de contenido (CSP) — `index.html`
```
default-src 'self'; script-src 'self'; connect-src 'self';
object-src 'none'; base-uri 'none'; form-action 'none'
```
Aunque alguien lograra inyectar HTML, **no puede** cargar un script de otro
dominio, incrustar un iframe, ni enviar datos a un servidor externo.

`script-src 'self'` sin `unsafe-inline` sólo es posible porque todo el
JavaScript vive en archivos aparte. **Si vuelves a meter JavaScript dentro del
HTML, esta protección se cae.**

### PIN de administrador — `assets/js/security.js`
- Se guarda **hasheado con SHA-256** (WebCrypto), nunca en texto plano. Tampoco
  aparece en los respaldos que exportes.
- **Bloqueo de 60 segundos** tras 5 intentos fallidos.
- Migra automáticamente desde versiones anteriores que lo guardaban en claro.

### Validación y anti-spam — `assets/js/security.js`
- Teléfono de 10 dígitos y correo con formato válido.
- **Trampa oculta**: un campo invisible que sólo un bot llena. Si viene con
  texto, se finge éxito sin enviar nada.
- **Tiempo mínimo**: un envío en menos de un segundo se rechaza.

### Datos de clientes
Los datos que captura el sitio (nombre, teléfono, correo) **nunca salen del
dispositivo del visitante**. Se guardan en su `localStorage` y sólo se usan para
prellenar el mensaje de WhatsApp o correo que él mismo envía.

## Qué NO está protegido

| Riesgo | Realidad |
|---|---|
| **Alguien edita tu catálogo** | El PIN se compara en el navegador. Con las herramientas de desarrollo se salta en segundos. |
| **Alguien lee tus datos** | Todo el catálogo es público por definición: se descarga con la página. |
| **Pérdida de información** | Si el visitante limpia su navegador, se borra todo. Exporta respaldos. |
| **Suplantación** | No hay identidad ni sesión: cualquiera puede decir que es quien quiera en un formulario. |
| **Registro de solicitudes** | Las cotizaciones salen por WhatsApp o correo. Si no llegan, no queda rastro. |

## Cómo se resuelve de verdad

Migrando a **Next.js + Supabase** (ver `README.md`):

1. **Autorización en el servidor, en cada escritura.** Ocultar un botón no es
   seguridad; el servidor debe rechazar la petición de quien no es admin.
2. **Autenticación gestionada.** Nunca escribir el login a mano: contraseñas
   hasheadas y sesiones las resuelve el proveedor.
3. **Validación duplicada** en cliente (para la experiencia) y en servidor (para
   la seguridad). La del cliente siempre es opcional para el atacante.
4. **Rate limiting** en login y formularios, más un captcha discreto.
5. **HTTPS obligatorio** con HSTS.
6. **Respaldos automáticos** de la base de datos.

## Obligaciones legales

Al captar nombre y teléfono de clientes aplica la **LFPDPPP**. La página
«Aviso de privacidad» trae una plantilla base que **debe revisar un abogado** y
completarse con la razón social y el domicilio fiscal reales.

## Reportar un problema

Escribe a la dirección de contacto configurada en el sitio. Si encuentras algo
que permita modificar el catálogo publicado o acceder a datos de terceros,
repórtalo antes de divulgarlo.
