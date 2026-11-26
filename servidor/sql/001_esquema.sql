/*
 * 001_esquema.sql — La base de MDC en SQL Server.
 *
 * Es el mismo modelo que vivía en Supabase (supabase/migrations/), portado
 * regla por regla. Lo que allá hacían las políticas RLS aquí lo hace la API:
 * es el único programa que se conecta, con un usuario que no puede cambiar el
 * esquema. Lo que NO depende de quién llama —formatos, límites, el freno de
 * spam, la bitácora, el último administrador— se queda aquí, en la base,
 * porque así lo cumple también cualquier script que algún día escriba directo.
 *
 * SQL Server 2022 no tiene expresiones regulares: los formatos van con LIKE y
 * clases de caracteres, siempre con intercalación binaria para que [a-z] no
 * acepte mayúsculas ni acentos.
 *
 * Los arreglos (text[]) y los JSON (jsonb) de Postgres son NVARCHAR(MAX) con
 * ISJSON(…, ARRAY|OBJECT): la base sigue negándose a guardar algo que no sea
 * del tipo correcto.
 *
 * Lo aplica la API al arrancar (Datos/Migraciones.cs), en orden, una vez.
 */

/* Los índices filtrados y los disparadores que leen JSON exigen estas dos
   opciones encendidas. SqlClient ya las trae así; sqlcmd no, y sin esto el
   mismo archivo funcionaría desde la API y fallaría a mano. */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

/* ══════════ USUARIOS ══════════
   Antes eran auth.users (de Supabase) + perfiles. Aquí es una sola tabla.
   La contraseña se guarda como hash (PasswordHasher de ASP.NET: PBKDF2 con
   sal); queda NULL mientras la persona no acepta su invitación. */
CREATE TABLE dbo.usuarios (
  id                  UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_usuarios PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  correo              NVARCHAR(254)    NOT NULL,
  nombre              NVARCHAR(120)    NOT NULL,
  rol                 VARCHAR(10)      NOT NULL CONSTRAINT df_usuarios_rol DEFAULT 'staff',
  hash_contrasena     NVARCHAR(400)    NULL,
  invitacion_hash     CHAR(64)         NULL,      -- sha256 del enlace; el enlace en sí nunca se guarda
  invitacion_expira   DATETIMEOFFSET   NULL,
  intentos_fallidos   INT              NOT NULL CONSTRAINT df_usuarios_intentos DEFAULT 0,
  bloqueado_hasta     DATETIMEOFFSET   NULL,
  creado_en           DATETIMEOFFSET   NOT NULL CONSTRAINT df_usuarios_creado DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT uq_usuarios_correo UNIQUE (correo),
  CONSTRAINT ck_usuarios_rol    CHECK (rol IN ('admin', 'staff')),
  CONSTRAINT ck_usuarios_nombre CHECK (LEN(LTRIM(RTRIM(nombre))) BETWEEN 2 AND 120),
  CONSTRAINT ck_usuarios_correo CHECK (correo LIKE '_%@_%._%' AND correo NOT LIKE '% %')
);
GO

/* Sesiones: un refresh token por dispositivo, rotado en cada uso. Se guarda
   el hash, no el token: quien lea esta tabla no puede iniciar sesión. */
CREATE TABLE dbo.sesiones (
  id          BIGINT IDENTITY CONSTRAINT pk_sesiones PRIMARY KEY,
  usuario_id  UNIQUEIDENTIFIER NOT NULL CONSTRAINT fk_sesiones_usuario REFERENCES dbo.usuarios(id) ON DELETE CASCADE,
  token_hash  CHAR(64)         NOT NULL CONSTRAINT uq_sesiones_token UNIQUE,
  expira      DATETIMEOFFSET   NOT NULL,
  revocada    BIT              NOT NULL CONSTRAINT df_sesiones_revocada DEFAULT 0,
  creada_en   DATETIMEOFFSET   NOT NULL CONSTRAINT df_sesiones_creada DEFAULT SYSDATETIMEOFFSET()
);
CREATE INDEX ix_sesiones_usuario ON dbo.sesiones (usuario_id);
GO

/* Nunca se queda la empresa sin nadie que pueda entrar al panel.
   En Supabase esto vivía sólo en functions/api/usuarios.js; un DELETE escrito
   a mano se lo saltaba. Aquí lo cumple la base, venga de donde venga. */
CREATE TRIGGER dbo.usuarios_ultimo_admin ON dbo.usuarios AFTER UPDATE, DELETE AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS (SELECT 1 FROM deleted WHERE rol = 'admin')
     AND NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE rol = 'admin')
  BEGIN
    THROW 51001, N'No se puede quitar al último administrador.', 1;
  END
END;
GO

/* ══════════ EQUIPOS ══════════ */
CREATE TABLE dbo.equipos (
  id                     BIGINT IDENTITY CONSTRAINT pk_equipos PRIMARY KEY,
  slug                   VARCHAR(120) COLLATE Latin1_General_BIN2 NOT NULL CONSTRAINT uq_equipos_slug UNIQUE,
  nombre                 NVARCHAR(160) NOT NULL,
  marca                  NVARCHAR(60)  NOT NULL,
  categoria              NVARCHAR(60)  NOT NULL,
  condicion              VARCHAR(10)   NOT NULL,
  precio_cents           BIGINT        NOT NULL,
  precio_anterior_cents  BIGINT        NULL,
  financiamiento         NVARCHAR(40)  NULL,
  arrendamiento          BIT           NOT NULL CONSTRAINT df_equipos_arrend DEFAULT 0,
  envio_incluido         BIT           NOT NULL CONSTRAINT df_equipos_envio DEFAULT 0,
  ubicacion              NVARCHAR(120) NOT NULL,
  anio                   SMALLINT      NOT NULL,
  especificaciones       NVARCHAR(MAX) NOT NULL CONSTRAINT df_equipos_specs DEFAULT N'[]',
  descripcion            NVARCHAR(4000) NOT NULL CONSTRAINT df_equipos_desc DEFAULT N'',
  imagen_url             NVARCHAR(500) NULL,
  imagenes               NVARCHAR(MAX) NOT NULL CONSTRAINT df_equipos_imgs DEFAULT N'[]',
  icono                  VARCHAR(30)   NOT NULL CONSTRAINT df_equipos_icono DEFAULT 'excavadora',
  destacado              BIT           NOT NULL CONSTRAINT df_equipos_dest DEFAULT 0,
  publicado              BIT           NOT NULL CONSTRAINT df_equipos_pub DEFAULT 0,
  disponibilidad         VARCHAR(12)   NOT NULL CONSTRAINT df_equipos_disp DEFAULT 'disponible',
  video_url              VARCHAR(11) COLLATE Latin1_General_BIN2 NULL,
  atributos              NVARCHAR(MAX) NOT NULL CONSTRAINT df_equipos_attr DEFAULT N'{}',
  creado_en              DATETIMEOFFSET NOT NULL CONSTRAINT df_equipos_creado DEFAULT SYSDATETIMEOFFSET(),
  actualizado_en         DATETIMEOFFSET NOT NULL CONSTRAINT df_equipos_act DEFAULT SYSDATETIMEOFFSET(),

  -- ^[a-z0-9]+(-[a-z0-9]+)*$
  CONSTRAINT ck_equipos_slug CHECK (slug NOT LIKE '%[^a-z0-9-]%' AND slug NOT LIKE '-%'
                                    AND slug NOT LIKE '%-' AND slug NOT LIKE '%--%' AND LEN(slug) >= 1),
  CONSTRAINT ck_equipos_nombre    CHECK (LEN(LTRIM(RTRIM(nombre))) BETWEEN 3 AND 160),
  CONSTRAINT ck_equipos_marca     CHECK (LEN(LTRIM(RTRIM(marca))) BETWEEN 1 AND 60),
  CONSTRAINT ck_equipos_categoria CHECK (LEN(LTRIM(RTRIM(categoria))) BETWEEN 1 AND 60),
  CONSTRAINT ck_equipos_condicion CHECK (condicion IN ('Nuevo', 'Usado', 'Renta')),
  CONSTRAINT ck_equipos_precio    CHECK (precio_cents >= 0),
  CONSTRAINT ck_equipos_anterior  CHECK (precio_anterior_cents IS NULL OR precio_anterior_cents > precio_cents),
  CONSTRAINT ck_equipos_ubicacion CHECK (LEN(LTRIM(RTRIM(ubicacion))) BETWEEN 2 AND 120),
  CONSTRAINT ck_equipos_anio      CHECK (anio BETWEEN 1970 AND 2100),
  CONSTRAINT ck_equipos_specs     CHECK (ISJSON(especificaciones, ARRAY) = 1),
  CONSTRAINT ck_equipos_imgs      CHECK (ISJSON(imagenes, ARRAY) = 1),
  CONSTRAINT ck_equipos_attr      CHECK (ISJSON(atributos, OBJECT) = 1 AND DATALENGTH(atributos) <= 8192),
  CONSTRAINT ck_equipos_img_url   CHECK (imagen_url IS NULL OR imagen_url LIKE 'https://%' OR imagen_url LIKE 'http://localhost%'),
  CONSTRAINT ck_equipos_disp      CHECK (disponibilidad IN ('disponible', 'apartado', 'vendido')),
  -- ^[A-Za-z0-9_-]{11}$
  CONSTRAINT ck_equipos_video     CHECK (video_url IS NULL OR (LEN(video_url) = 11 AND video_url NOT LIKE '%[^A-Za-z0-9_-]%'))
);
CREATE INDEX ix_equipos_publicados ON dbo.equipos (publicado, categoria) WHERE publicado = 1;
GO

/* Los topes de cantidad (12 especificaciones, 8 fotos) no caben en un CHECK
   —contar elementos de un JSON necesita una subconsulta—, así que van en el
   mismo disparador que mantiene la portada y la fecha de actualización. */
CREATE TRIGGER dbo.equipos_reglas ON dbo.equipos AFTER INSERT, UPDATE AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS (SELECT 1 FROM inserted i WHERE (SELECT COUNT(*) FROM OPENJSON(i.especificaciones)) > 12)
    THROW 51010, N'Un equipo admite como máximo 12 especificaciones.', 1;
  IF EXISTS (SELECT 1 FROM inserted i WHERE (SELECT COUNT(*) FROM OPENJSON(i.imagenes)) > 8)
    THROW 51011, N'Un equipo admite como máximo 8 fotos.', 1;

  -- La portada es siempre la primera foto de la galería (sincronizar_portada).
  -- Y actualizado_en se toca en cada cambio (tocar_actualizado_en).
  UPDATE e SET
    imagen_url     = JSON_VALUE(i.imagenes, '$[0]'),
    actualizado_en = CASE WHEN EXISTS (SELECT 1 FROM deleted) THEN SYSDATETIMEOFFSET() ELSE e.actualizado_en END
  FROM dbo.equipos e JOIN inserted i ON i.id = e.id
  WHERE ISNULL(e.imagen_url, N'') <> ISNULL(JSON_VALUE(i.imagenes, '$[0]'), N'')
     OR EXISTS (SELECT 1 FROM deleted);
END;
GO

/* ══════════ SUCURSALES ══════════ */
CREATE TABLE dbo.sucursales (
  id         BIGINT IDENTITY CONSTRAINT pk_sucursales PRIMARY KEY,
  nombre     NVARCHAR(120) NOT NULL,
  direccion  NVARCHAR(240) NOT NULL,
  telefono   VARCHAR(20)   NOT NULL,
  horario    NVARCHAR(200) NOT NULL CONSTRAINT df_sucursales_horario DEFAULT N'',
  orden      SMALLINT      NOT NULL CONSTRAINT df_sucursales_orden DEFAULT 0,
  CONSTRAINT ck_sucursales_nombre    CHECK (LEN(LTRIM(RTRIM(nombre))) BETWEEN 2 AND 120),
  CONSTRAINT ck_sucursales_direccion CHECK (LEN(LTRIM(RTRIM(direccion))) BETWEEN 5 AND 240),
  -- ^[0-9 +()-]{7,20}$
  CONSTRAINT ck_sucursales_telefono  CHECK (LEN(telefono) BETWEEN 7 AND 20 AND telefono NOT LIKE '%[^0-9 +()-]%')
);
GO

/* ══════════ AJUSTES (una sola fila) ══════════ */
CREATE TABLE dbo.ajustes (
  id              BIT NOT NULL CONSTRAINT pk_ajustes PRIMARY KEY CONSTRAINT df_ajustes_id DEFAULT 1,
  marca_completa  NVARCHAR(160) NOT NULL CONSTRAINT df_aj_mc  DEFAULT N'Maquinaria de Chiapas',
  marca_principal NVARCHAR(20)  NOT NULL CONSTRAINT df_aj_mp  DEFAULT N'MD',
  marca_acento    NVARCHAR(20)  NOT NULL CONSTRAINT df_aj_ma  DEFAULT N'C',
  color_acento    VARCHAR(7)    NOT NULL CONSTRAINT df_aj_col DEFAULT '#F5C400',
  logo_url        NVARCHAR(500) NULL,
  telefono        NVARCHAR(40)  NOT NULL CONSTRAINT df_aj_tel DEFAULT N'',
  whatsapp        VARCHAR(20)   NOT NULL CONSTRAINT df_aj_wa  DEFAULT '',
  correo          NVARCHAR(254) NOT NULL CONSTRAINT df_aj_cor DEFAULT N'',
  direccion       NVARCHAR(240) NOT NULL CONSTRAINT df_aj_dir DEFAULT N'',
  horario         NVARCHAR(200) NOT NULL CONSTRAINT df_aj_hor DEFAULT N'',
  barra_superior  NVARCHAR(200) NOT NULL CONSTRAINT df_aj_bs  DEFAULT N'',
  hero_etiqueta   NVARCHAR(120) NOT NULL CONSTRAINT df_aj_he  DEFAULT N'',
  hero_titulo     NVARCHAR(160) NOT NULL CONSTRAINT df_aj_ht  DEFAULT N'',
  hero_resaltado  NVARCHAR(160) NOT NULL CONSTRAINT df_aj_hr  DEFAULT N'',
  hero_texto      NVARCHAR(600) NOT NULL CONSTRAINT df_aj_hx  DEFAULT N'',
  hero_imagen     NVARCHAR(500) NULL,
  vendedor        NVARCHAR(160) NOT NULL CONSTRAINT df_aj_ven DEFAULT N'',
  pie_descripcion NVARCHAR(600) NOT NULL CONSTRAINT df_aj_pie DEFAULT N'',
  actualizado_en  DATETIMEOFFSET NOT NULL CONSTRAINT df_aj_act DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT ck_ajustes_unica   CHECK (id = 1),
  CONSTRAINT ck_ajustes_mp      CHECK (LEN(LTRIM(RTRIM(marca_principal))) BETWEEN 1 AND 20),
  CONSTRAINT ck_ajustes_color   CHECK (color_acento LIKE '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
  CONSTRAINT ck_ajustes_wa      CHECK (whatsapp NOT LIKE '%[^0-9]%'),
  CONSTRAINT ck_ajustes_logo    CHECK (logo_url IS NULL OR logo_url LIKE 'https://%'),
  CONSTRAINT ck_ajustes_hero    CHECK (hero_imagen IS NULL OR hero_imagen LIKE 'https://%')
);
INSERT INTO dbo.ajustes (id) VALUES (1);
GO

/* ══════════ SOLICITUDES (cotizaciones y publicaciones) ══════════ */
CREATE TABLE dbo.solicitudes (
  id         BIGINT IDENTITY CONSTRAINT pk_solicitudes PRIMARY KEY,
  tipo       VARCHAR(12)   NOT NULL,
  nombre     NVARCHAR(120) NOT NULL,
  telefono   CHAR(10)      NOT NULL,
  correo     NVARCHAR(254) NULL,
  empresa    NVARCHAR(160) NULL,
  mensaje    NVARCHAR(4000) NOT NULL CONSTRAINT df_sol_msg DEFAULT N'',
  carrito    NVARCHAR(MAX) NOT NULL CONSTRAINT df_sol_carrito DEFAULT N'[]',
  estado     VARCHAR(10)   NOT NULL CONSTRAINT df_sol_estado DEFAULT 'nueva',
  creado_en  DATETIMEOFFSET NOT NULL CONSTRAINT df_sol_creado DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT ck_sol_tipo     CHECK (tipo IN ('cotizacion', 'publicacion')),
  CONSTRAINT ck_sol_nombre   CHECK (LEN(LTRIM(RTRIM(nombre))) BETWEEN 2 AND 120),
  CONSTRAINT ck_sol_telefono CHECK (telefono NOT LIKE '%[^0-9]%' AND LEN(telefono) = 10),
  CONSTRAINT ck_sol_correo   CHECK (correo IS NULL OR (correo LIKE '_%@_%._%' AND correo NOT LIKE '% %')),
  CONSTRAINT ck_sol_estado   CHECK (estado IN ('nueva', 'atendida', 'cerrada', 'spam')),
  -- solicitudes_carrito_acotado: un arreglo, de hasta 16 kB
  CONSTRAINT ck_sol_carrito  CHECK (ISJSON(carrito, ARRAY) = 1 AND DATALENGTH(carrito) <= 32768)
);
CREATE INDEX ix_sol_pendientes ON dbo.solicitudes (creado_en DESC) WHERE estado = 'nueva';
CREATE INDEX ix_sol_telefono   ON dbo.solicitudes (telefono, creado_en DESC);
GO

/* Freno de spam del lado del servidor: máximo 3 por teléfono cada 10 minutos,
   y como mucho 50 renglones en el carrito. Es INSTEAD OF para que la fecha la
   ponga SIEMPRE la base: si el cliente mandara una fecha vieja, el conteo de
   "los últimos 10 minutos" no la vería (lo probaba tests/seguridad.test.js). */
CREATE TRIGGER dbo.solicitudes_frenar_spam ON dbo.solicitudes INSTEAD OF INSERT AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS (SELECT 1 FROM inserted i WHERE (SELECT COUNT(*) FROM OPENJSON(i.carrito)) > 50)
    THROW 51020, N'La cotización tiene demasiados equipos.', 1;
  IF EXISTS (
    SELECT 1 FROM inserted i
    WHERE (SELECT COUNT(*) FROM dbo.solicitudes s
           WHERE s.telefono = i.telefono AND s.creado_en > DATEADD(MINUTE, -10, SYSDATETIMEOFFSET())) >= 3)
    THROW 51021, N'Demasiadas solicitudes seguidas. Intenta de nuevo en unos minutos.', 1;

  INSERT INTO dbo.solicitudes (tipo, nombre, telefono, correo, empresa, mensaje, carrito, estado, creado_en)
  SELECT tipo, nombre, telefono, correo, empresa, mensaje, carrito, 'nueva', SYSDATETIMEOFFSET()
  FROM inserted;
END;
GO

/* ══════════ PREGUNTAS ══════════ */
CREATE TABLE dbo.preguntas (
  id             BIGINT IDENTITY CONSTRAINT pk_preguntas PRIMARY KEY,
  slug           VARCHAR(120) COLLATE Latin1_General_BIN2 NOT NULL
                 CONSTRAINT fk_preguntas_equipo REFERENCES dbo.equipos(slug) ON DELETE CASCADE ON UPDATE CASCADE,
  nombre         NVARCHAR(60)   NOT NULL,
  pregunta       NVARCHAR(300)  NOT NULL,
  respuesta      NVARCHAR(1000) NULL,
  publicada      BIT            NOT NULL CONSTRAINT df_preg_pub DEFAULT 0,
  creado_en      DATETIMEOFFSET NOT NULL CONSTRAINT df_preg_creado DEFAULT SYSDATETIMEOFFSET(),
  respondida_en  DATETIMEOFFSET NULL,
  CONSTRAINT ck_preg_nombre    CHECK (LEN(nombre) BETWEEN 2 AND 60),
  CONSTRAINT ck_preg_pregunta  CHECK (LEN(pregunta) BETWEEN 5 AND 300),
  CONSTRAINT ck_preg_respuesta CHECK (respuesta IS NULL OR LEN(respuesta) BETWEEN 1 AND 1000)
);
CREATE INDEX ix_preguntas_equipo ON dbo.preguntas (slug, creado_en DESC);
GO

/* La única puerta para crear una pregunta (era la RPC preguntar()). Nace sin
   responder y sin publicar, siempre: quien pregunta no elige nada de eso. */
CREATE PROCEDURE dbo.preguntar @slug VARCHAR(120), @nombre NVARCHAR(200), @pregunta NVARCHAR(1000) AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @n NVARCHAR(200) = LTRIM(RTRIM(ISNULL(@nombre, N''))),
          @p NVARCHAR(1000) = LTRIM(RTRIM(ISNULL(@pregunta, N'')));
  IF NOT EXISTS (SELECT 1 FROM dbo.equipos WHERE slug = @slug AND publicado = 1)
    THROW 51030, N'Ese equipo no existe.', 1;
  IF LEN(@n) < 2 OR LEN(@n) > 60
    THROW 51031, N'Escribe tu nombre.', 1;
  IF LEN(@p) < 5 OR LEN(@p) > 300
    THROW 51032, N'La pregunta debe tener entre 5 y 300 caracteres.', 1;
  /* Dos frenos para dos problemas: el que aporrea el botón (5 en 10 minutos
     sobre la misma máquina) y el que vuelve cada día (30 sin contestar). */
  IF (SELECT COUNT(*) FROM dbo.preguntas WHERE slug = @slug AND creado_en > DATEADD(MINUTE, -10, SYSDATETIMEOFFSET())) >= 5
    THROW 51033, N'Ya hay varias preguntas recientes sobre este equipo. Espera unos minutos.', 1;
  IF (SELECT COUNT(*) FROM dbo.preguntas WHERE slug = @slug AND respuesta IS NULL) >= 30
    THROW 51034, N'Hay demasiadas preguntas sin contestar sobre este equipo. Escríbenos por WhatsApp.', 1;

  INSERT INTO dbo.preguntas (slug, nombre, pregunta) OUTPUT inserted.id VALUES (@slug, @n, @p);
END;
GO

/* ══════════ MÉTRICAS ══════════ */
CREATE TABLE dbo.metricas (
  slug          VARCHAR(120) COLLATE Latin1_General_BIN2 NOT NULL CONSTRAINT pk_metricas PRIMARY KEY,
  vistas        BIGINT NOT NULL CONSTRAINT df_met_vistas DEFAULT 0,
  cotizaciones  BIGINT NOT NULL CONSTRAINT df_met_cot DEFAULT 0,
  ultima_vista  DATETIMEOFFSET NULL
);
GO

/* La única forma de escribir en métricas (era la RPC contar()): suma de uno
   en uno y sólo para equipos que existen, para que nadie llene la tabla de
   slugs inventados. Un tipo desconocido se ignora en silencio. */
CREATE PROCEDURE dbo.contar @slug VARCHAR(120), @tipo VARCHAR(12) AS
BEGIN
  SET NOCOUNT ON;
  IF @tipo NOT IN ('vista', 'cotizacion') RETURN;
  IF NOT EXISTS (SELECT 1 FROM dbo.equipos WHERE slug = @slug) RETURN;
  DECLARE @v INT = IIF(@tipo = 'vista', 1, 0), @c INT = IIF(@tipo = 'cotizacion', 1, 0);
  MERGE dbo.metricas WITH (HOLDLOCK) AS m
  USING (SELECT @slug AS slug) AS s ON m.slug = s.slug
  WHEN MATCHED THEN UPDATE SET
    vistas = m.vistas + @v, cotizaciones = m.cotizaciones + @c,
    ultima_vista = IIF(@v = 1, SYSDATETIMEOFFSET(), m.ultima_vista)
  WHEN NOT MATCHED THEN INSERT (slug, vistas, cotizaciones, ultima_vista)
    VALUES (@slug, @v, @c, IIF(@v = 1, SYSDATETIMEOFFSET(), NULL));
END;
GO

/* ══════════ BITÁCORA ══════════
   Quién cambió qué en equipos y sucursales. El actor lo dice la API con
   sp_set_session_context 'usuario_id' antes de escribir; un cambio hecho a
   mano por fuera de la API queda con actor NULL, que también es información. */
CREATE TABLE dbo.bitacora (
  id          BIGINT IDENTITY CONSTRAINT pk_bitacora PRIMARY KEY,
  actor       UNIQUEIDENTIFIER NULL,
  tabla       VARCHAR(30)  NOT NULL,
  operacion   VARCHAR(6)   NOT NULL,
  registro    BIGINT       NULL,
  antes       NVARCHAR(MAX) NULL,
  despues     NVARCHAR(MAX) NULL,
  ocurrio_en  DATETIMEOFFSET NOT NULL CONSTRAINT df_bit_ocurrio DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT ck_bit_operacion CHECK (operacion IN ('INSERT', 'UPDATE', 'DELETE'))
);
CREATE INDEX ix_bitacora_reciente ON dbo.bitacora (ocurrio_en DESC);
GO

CREATE TRIGGER dbo.equipos_bitacora ON dbo.equipos AFTER INSERT, UPDATE, DELETE AS
BEGIN
  SET NOCOUNT ON;
  -- El disparador de reglas también actualiza la tabla; esa segunda pasada no es un cambio de nadie.
  IF TRIGGER_NESTLEVEL() > 1 RETURN;
  DECLARE @actor UNIQUEIDENTIFIER = TRY_CAST(SESSION_CONTEXT(N'usuario_id') AS UNIQUEIDENTIFIER);
  DECLARE @op VARCHAR(6) = CASE WHEN NOT EXISTS (SELECT 1 FROM deleted) THEN 'INSERT'
                                WHEN NOT EXISTS (SELECT 1 FROM inserted) THEN 'DELETE' ELSE 'UPDATE' END;
  INSERT INTO dbo.bitacora (actor, tabla, operacion, registro, antes, despues)
  SELECT @actor, 'equipos', @op, COALESCE(i.id, d.id),
         (SELECT d.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
         (SELECT i.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
  FROM inserted i FULL OUTER JOIN deleted d ON d.id = i.id;
END;
GO

CREATE TRIGGER dbo.sucursales_bitacora ON dbo.sucursales AFTER INSERT, UPDATE, DELETE AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @actor UNIQUEIDENTIFIER = TRY_CAST(SESSION_CONTEXT(N'usuario_id') AS UNIQUEIDENTIFIER);
  DECLARE @op VARCHAR(6) = CASE WHEN NOT EXISTS (SELECT 1 FROM deleted) THEN 'INSERT'
                                WHEN NOT EXISTS (SELECT 1 FROM inserted) THEN 'DELETE' ELSE 'UPDATE' END;
  INSERT INTO dbo.bitacora (actor, tabla, operacion, registro, antes, despues)
  SELECT @actor, 'sucursales', @op, COALESCE(i.id, d.id),
         (SELECT d.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
         (SELECT i.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
  FROM inserted i FULL OUTER JOIN deleted d ON d.id = i.id;
END;
GO

/* ══════════ CATÁLOGO PÚBLICO ══════════
   La misma vista que en Supabase (catalogo_publico): sólo lo publicado, con
   los nombres de campo que espera el sitio y los precios en pesos. */
CREATE VIEW dbo.catalogo_publico AS
SELECT id, slug,
  nombre AS name, marca AS brand, categoria AS cat, condicion AS cond,
  CAST(precio_cents / 100.0 AS DECIMAL(18,2)) AS price,
  CAST(precio_anterior_cents / 100.0 AS DECIMAL(18,2)) AS original,
  financiamiento AS finance, arrendamiento AS leasing, envio_incluido AS shipping,
  ubicacion AS location, anio AS [year], especificaciones AS specs, descripcion AS [desc],
  icono AS svgKey, imagen_url AS img, imagenes AS imgs, destacado AS hot,
  disponibilidad, video_url AS video, atributos
FROM dbo.equipos
WHERE publicado = 1;
GO
