/*
 * reglas.sql — Las reglas que la base cumple por sí sola, comprobadas.
 *
 * Se corre contra una base DESECHABLE recién creada con 001_esquema.sql
 * (servidor/probar-esquema.ps1 lo hace). Escribe y borra: nunca contra la
 * base de verdad.
 *
 * Cada prueba imprime PASA o FALLA; al final, si hubo alguna FALLA, termina
 * con error para que el script que la llama lo note.
 */
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
DECLARE @fallas INT = 0, @ok BIT, @err NVARCHAR(4000);

/* Ayuda: corre @sql y dice si falló con un mensaje que contiene @espera. */
IF OBJECT_ID('tempdb..#r') IS NOT NULL DROP TABLE #r;
CREATE TABLE #r (prueba NVARCHAR(200), ok BIT, detalle NVARCHAR(4000));

DECLARE @casos TABLE (n INT IDENTITY, prueba NVARCHAR(200), sentencia NVARCHAR(MAX), debe_fallar BIT, mensaje NVARCHAR(200));

INSERT INTO dbo.equipos (slug, nombre, marca, categoria, condicion, precio_cents, ubicacion, anio, publicado, imagenes)
VALUES ('excavadora-prueba', N'Excavadora de prueba', N'CAT', N'Excavación', 'Nuevo', 100000, N'Tuxtla', 2024, 1,
        N'["https://api.mdcmaquinaria.com/fotos/a-w1400.webp","https://api.mdcmaquinaria.com/fotos/b-w1400.webp"]'),
       ('borrador-prueba', N'Borrador de prueba', N'CAT', N'Carga', 'Usado', 5000, N'Tuxtla', 2020, 0, N'[]');

INSERT INTO @casos (prueba, sentencia, debe_fallar, mensaje) VALUES
 (N'Un slug con mayúsculas no entra',
  N'INSERT INTO dbo.equipos (slug,nombre,marca,categoria,condicion,precio_cents,ubicacion,anio) VALUES (''Malo'',N''Nombre ok'',N''X'',N''Y'',''Nuevo'',1,N''Lugar'',2020)', 1, N'ck_equipos_slug'),
 (N'Un slug con doble guion no entra',
  N'INSERT INTO dbo.equipos (slug,nombre,marca,categoria,condicion,precio_cents,ubicacion,anio) VALUES (''a--b'',N''Nombre ok'',N''X'',N''Y'',''Nuevo'',1,N''Lugar'',2020)', 1, N'ck_equipos_slug'),
 (N'Un precio anterior menor que el actual no es descuento',
  N'UPDATE dbo.equipos SET precio_anterior_cents = 10 WHERE slug=''excavadora-prueba''', 1, N'ck_equipos_anterior'),
 (N'Una condición inventada no entra',
  N'UPDATE dbo.equipos SET condicion = ''Robado'' WHERE slug=''excavadora-prueba''', 1, N'ck_equipos_condicion'),
 (N'Más de 8 fotos no entran',
  N'UPDATE dbo.equipos SET imagenes = N''["https://a","https://a","https://a","https://a","https://a","https://a","https://a","https://a","https://a"]'' WHERE slug=''excavadora-prueba''', 1, N'8 fotos'),
 (N'Las especificaciones deben ser un arreglo',
  N'UPDATE dbo.equipos SET especificaciones = N''{"no":"arreglo"}'' WHERE slug=''excavadora-prueba''', 1, N'ck_equipos_specs'),
 (N'Un video que no es un ID de YouTube no entra',
  N'UPDATE dbo.equipos SET video_url = ''<script>x<'' WHERE slug=''excavadora-prueba''', 1, N'ck_equipos_video'),
 (N'Una foto que no es https no entra',
  N'UPDATE dbo.equipos SET imagenes = N''["javascript:alert(1)"]'' WHERE slug=''excavadora-prueba''', 1, N'ck_equipos_img_url'),
 (N'Un teléfono de sucursal con letras no entra',
  N'INSERT INTO dbo.sucursales (nombre,direccion,telefono) VALUES (N''Matriz'',N''Calle 123'',''961-ABC-1234'')', 1, N'ck_sucursales_telefono'),
 (N'Sólo existe una fila de ajustes',
  N'INSERT INTO dbo.ajustes (id) VALUES (0)', 1, N'ck_ajustes_unica'),
 (N'Un color de acento que no es #RRGGBB no entra',
  N'UPDATE dbo.ajustes SET color_acento = ''red''', 1, N'ck_ajustes_color'),
 (N'Un teléfono de 9 dígitos en una solicitud no entra',
  N'INSERT INTO dbo.solicitudes (tipo,nombre,telefono) VALUES (''cotizacion'',N''Ana'',''961123456'')', 1, N'ck_sol_telefono'),
 (N'Una solicitud de un tipo inventado no entra',
  N'INSERT INTO dbo.solicitudes (tipo,nombre,telefono) VALUES (''hackeo'',N''Ana'',''9611234567'')', 1, N'ck_sol_tipo'),
 (N'Una pregunta sobre un equipo que no existe se rechaza',
  N'EXEC dbo.preguntar ''no-existe'', N''Ana'', N''¿Cuánto cuesta?''', 1, N'no existe'),
 (N'Una pregunta sobre un borrador se rechaza',
  N'EXEC dbo.preguntar ''borrador-prueba'', N''Ana'', N''¿Cuánto cuesta?''', 1, N'no existe'),
 (N'Una pregunta demasiado corta se rechaza',
  N'EXEC dbo.preguntar ''excavadora-prueba'', N''Ana'', N''¿Y?''', 1, N'entre 5 y 300'),
 (N'Un usuario con rol inventado no entra',
  N'INSERT INTO dbo.usuarios (correo,nombre,rol) VALUES (N''x@y.com'',N''Equis'',''root'')', 1, N'ck_usuarios_rol');

DECLARE @i INT = 1, @n INT = (SELECT COUNT(*) FROM @casos), @prueba NVARCHAR(200), @sql NVARCHAR(MAX), @falla BIT, @msg NVARCHAR(200);
WHILE @i <= @n
BEGIN
  SELECT @prueba = prueba, @sql = sentencia, @falla = debe_fallar, @msg = mensaje FROM @casos WHERE n = @i;
  SET @err = NULL;
  BEGIN TRY
    BEGIN TRAN; EXEC sp_executesql @sql; ROLLBACK;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    SET @err = ERROR_MESSAGE();
  END CATCH
  SET @ok = CASE WHEN @falla = 1 THEN IIF(@err IS NOT NULL AND @err LIKE N'%' + @msg + N'%', 1, 0)
                 ELSE IIF(@err IS NULL, 1, 0) END;
  INSERT INTO #r VALUES (@prueba, @ok, ISNULL(@err, N'sin error'));
  SET @i += 1;
END;

/* ── Las que necesitan varios pasos ── */

-- La portada es la primera foto.
INSERT INTO #r SELECT N'La portada es siempre la primera foto',
  IIF(imagen_url = N'https://api.mdcmaquinaria.com/fotos/a-w1400.webp', 1, 0), imagen_url
  FROM dbo.equipos WHERE slug = 'excavadora-prueba';
UPDATE dbo.equipos SET imagenes = N'["https://api.mdcmaquinaria.com/fotos/b-w1400.webp"]' WHERE slug = 'excavadora-prueba';
INSERT INTO #r SELECT N'Y cambia sola al reordenar la galería',
  IIF(imagen_url = N'https://api.mdcmaquinaria.com/fotos/b-w1400.webp', 1, 0), imagen_url
  FROM dbo.equipos WHERE slug = 'excavadora-prueba';

-- Freno de spam: 3 por teléfono en 10 minutos; la 4.ª se rechaza.
BEGIN TRY
  INSERT INTO dbo.solicitudes (tipo, nombre, telefono) VALUES ('cotizacion', N'Ana', '9611112222');
  INSERT INTO dbo.solicitudes (tipo, nombre, telefono) VALUES ('cotizacion', N'Ana', '9611112222');
  INSERT INTO dbo.solicitudes (tipo, nombre, telefono) VALUES ('cotizacion', N'Ana', '9611112222');
  SET @err = NULL;
  BEGIN TRY
    INSERT INTO dbo.solicitudes (tipo, nombre, telefono) VALUES ('cotizacion', N'Ana', '9611112222');
  END TRY BEGIN CATCH SET @err = ERROR_MESSAGE(); END CATCH
  INSERT INTO #r VALUES (N'La cuarta solicitud seguida del mismo teléfono se rechaza', IIF(@err LIKE N'%Demasiadas%', 1, 0), ISNULL(@err, N'entró'));
END TRY BEGIN CATCH INSERT INTO #r VALUES (N'La cuarta solicitud seguida del mismo teléfono se rechaza', 0, ERROR_MESSAGE()); END CATCH

-- La fecha y el estado los pone la base, no quien inserta.
INSERT INTO dbo.solicitudes (tipo, nombre, telefono, estado, creado_en)
VALUES ('cotizacion', N'Beto', '9613334444', 'cerrada', '2000-01-01');
INSERT INTO #r SELECT TOP 1 N'Una solicitud nace "nueva" y con la fecha de la base, diga lo que diga quien la manda',
  IIF(estado = 'nueva' AND creado_en > DATEADD(MINUTE, -1, SYSDATETIMEOFFSET()), 1, 0), CONCAT(estado, ' ', creado_en)
  FROM dbo.solicitudes WHERE telefono = '9613334444' ORDER BY id DESC;

-- Un carrito con 51 renglones no entra.
SET @err = NULL;
DECLARE @carrito NVARCHAR(MAX) = N'[' + REPLICATE(CAST(N'{"id":1},' AS NVARCHAR(MAX)), 50) + N'{"id":1}]';
BEGIN TRY INSERT INTO dbo.solicitudes (tipo, nombre, telefono, carrito) VALUES ('cotizacion', N'Caro', '9615556666', @carrito); END TRY
BEGIN CATCH SET @err = ERROR_MESSAGE(); END CATCH
INSERT INTO #r VALUES (N'Una cotización con más de 50 equipos se rechaza', IIF(@err LIKE N'%demasiados%', 1, 0), ISNULL(@err, N'entró'));

-- La pregunta nace sin responder y sin publicar.
EXEC dbo.preguntar 'excavadora-prueba', N'  Ana  ', N'¿Tiene garantía de fábrica?';
INSERT INTO #r SELECT TOP 1 N'Una pregunta nace sin responder, sin publicar y sin espacios de sobra',
  IIF(publicada = 0 AND respuesta IS NULL AND nombre = N'Ana', 1, 0), CONCAT(nombre, '|', publicada)
  FROM dbo.preguntas ORDER BY id DESC;

-- 5 preguntas en 10 minutos sobre el mismo equipo; la 6.ª no.
EXEC dbo.preguntar 'excavadora-prueba', N'Ana', N'Pregunta número dos';
EXEC dbo.preguntar 'excavadora-prueba', N'Ana', N'Pregunta número tres';
EXEC dbo.preguntar 'excavadora-prueba', N'Ana', N'Pregunta número cuatro';
EXEC dbo.preguntar 'excavadora-prueba', N'Ana', N'Pregunta número cinco';
SET @err = NULL;
BEGIN TRY EXEC dbo.preguntar 'excavadora-prueba', N'Ana', N'Pregunta número seis'; END TRY
BEGIN CATCH SET @err = ERROR_MESSAGE(); END CATCH
INSERT INTO #r VALUES (N'La sexta pregunta en diez minutos sobre el mismo equipo se frena', IIF(@err LIKE N'%varias preguntas%', 1, 0), ISNULL(@err, N'entró'));

-- Métricas: suma de uno en uno, ignora tipos y slugs inventados.
EXEC dbo.contar 'excavadora-prueba', 'vista';
EXEC dbo.contar 'excavadora-prueba', 'vista';
EXEC dbo.contar 'excavadora-prueba', 'cotizacion';
EXEC dbo.contar 'inventado', 'vista';
EXEC dbo.contar 'excavadora-prueba', 'borrar-todo';
INSERT INTO #r SELECT N'Las métricas suman de uno en uno y sólo para equipos que existen',
  IIF(vistas = 2 AND cotizaciones = 1 AND (SELECT COUNT(*) FROM dbo.metricas) = 1, 1, 0), CONCAT(vistas, '/', cotizaciones)
  FROM dbo.metricas WHERE slug = 'excavadora-prueba';

-- Bitácora: quién cambió el precio.
DECLARE @quien UNIQUEIDENTIFIER = NEWID();
EXEC sp_set_session_context N'usuario_id', @quien;
UPDATE dbo.equipos SET precio_cents = 200000 WHERE slug = 'excavadora-prueba';
EXEC sp_set_session_context N'usuario_id', NULL;
INSERT INTO #r SELECT TOP 1 N'La bitácora anota quién cambió el precio y cuánto era antes',
  IIF(actor = @quien AND operacion = 'UPDATE' AND JSON_VALUE(antes, '$.precio_cents') = '100000'
      AND JSON_VALUE(despues, '$.precio_cents') = '200000', 1, 0), CONCAT(actor, ' ', operacion)
  FROM dbo.bitacora WHERE tabla = 'equipos' ORDER BY id DESC;
INSERT INTO #r SELECT N'Y una sola vez por cambio, aunque el disparador de reglas vuelva a escribir',
  IIF(COUNT(*) = 1, 1, 0), CAST(COUNT(*) AS NVARCHAR) FROM dbo.bitacora WHERE actor = @quien;

-- El catálogo público no enseña borradores.
INSERT INTO #r SELECT N'El catálogo público no enseña borradores',
  IIF(COUNT(*) = 1 AND MAX(slug) = 'excavadora-prueba', 1, 0), CAST(COUNT(*) AS NVARCHAR) FROM dbo.catalogo_publico;

-- Borrar un equipo se lleva sus preguntas.
DELETE FROM dbo.equipos WHERE slug = 'excavadora-prueba';
INSERT INTO #r SELECT N'Borrar un equipo se lleva sus preguntas', IIF(COUNT(*) = 0, 1, 0), CAST(COUNT(*) AS NVARCHAR) FROM dbo.preguntas;

-- El último administrador no se puede quitar, ni bajándolo de rol ni borrándolo.
INSERT INTO dbo.usuarios (correo, nombre, rol) VALUES (N'jefe@mdc.mx', N'Jefe', 'admin'), (N'ayudante@mdc.mx', N'Ayudante', 'staff');
SET @err = NULL;
BEGIN TRY UPDATE dbo.usuarios SET rol = 'staff' WHERE correo = N'jefe@mdc.mx'; END TRY BEGIN CATCH SET @err = ERROR_MESSAGE(); END CATCH
INSERT INTO #r VALUES (N'No se puede bajar de rol al último administrador', IIF(@err LIKE N'%último administrador%', 1, 0), ISNULL(@err, N'se pudo'));
SET @err = NULL;
BEGIN TRY DELETE FROM dbo.usuarios WHERE correo = N'jefe@mdc.mx'; END TRY BEGIN CATCH SET @err = ERROR_MESSAGE(); END CATCH
INSERT INTO #r VALUES (N'Ni borrarlo', IIF(@err LIKE N'%último administrador%', 1, 0), ISNULL(@err, N'se pudo'));
UPDATE dbo.usuarios SET rol = 'admin' WHERE correo = N'ayudante@mdc.mx';
SET @err = NULL;
BEGIN TRY UPDATE dbo.usuarios SET rol = 'staff' WHERE correo = N'jefe@mdc.mx'; END TRY BEGIN CATCH SET @err = ERROR_MESSAGE(); END CATCH
INSERT INTO #r VALUES (N'Con otro administrador, sí', IIF(@err IS NULL, 1, 0), ISNULL(@err, N'se pudo'));

/* ── Reporte ── */
SELECT CONCAT(IIF(ok = 1, N'PASA   ', N'FALLA  '), prueba, IIF(ok = 1, N'', N' — ' + detalle)) AS resultado FROM #r;
SELECT @fallas = COUNT(*) FROM #r WHERE ok = 0;
DECLARE @total INT = (SELECT COUNT(*) FROM #r);
PRINT CONCAT(@total - @fallas, N'/', @total, N' reglas de la base se cumplen');
IF @fallas > 0 THROW 50000, N'Hay reglas que la base no está cumpliendo.', 1;
