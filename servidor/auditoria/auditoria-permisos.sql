/*
 * auditoria-permisos.sql — Auditoría de permisos de SQL Server para MDC (T-05)
 *
 * QUÉ HACE: revisa quién puede entrar al SQL Server de la oficina, qué puede
 * hacer la cuenta de la API (NT SERVICE\MdcApi) dentro de la base, qué
 * opciones peligrosas están encendidas, si hay respaldos y el estado de las
 * cuentas del panel. Al final muestra UNA tabla con cada control y su estado:
 *   ALERTA  → corregir
 *   REVISAR → mirar con calma; puede estar bien o no
 *   INFO    → dato para tener a la vista
 *   OK      → como debe estar
 *
 * NO CAMBIA NADA. Sólo lee (SELECT). Lo único que crea es una tabla temporal
 * (#hallazgos) que desaparece al cerrar la conexión, y para medir los permisos
 * reales de la API se pone un momento en su lugar (EXECUTE AS USER … REVERT),
 * sin escribir nada. No muestra contraseñas, hashes ni tokens.
 *
 * CÓMO CORRERLO, como administrador de la PC (para que vea todo), desde la
 * carpeta del repositorio. El resultado trae correos de las cuentas del
 * panel: va al Escritorio, no al repositorio.
 *   PowerShell:
 *     sqlcmd -S .\SQLEXPRESS -E -f 65001 -i servidor\auditoria\auditoria-permisos.sql -W -s "|" -o "$env:USERPROFILE\Desktop\auditoria.txt"
 *   Símbolo del sistema (cmd):
 *     sqlcmd -S .\SQLEXPRESS -E -f 65001 -i servidor\auditoria\auditoria-permisos.sql -W -s "|" -o "%USERPROFILE%\Desktop\auditoria.txt"
 *   o abrirlo en SQL Server Management Studio y ejecutarlo.
 * Sin -b a propósito: si un control falla, los demás se siguen revisando y
 * la tabla final sale igual.
 *
 * Si tu base no se llama MdcMaquinaria (p. ej. MdcMaquinaria_Dev), cambia el
 * nombre en las DOS líneas marcadas con ◄. Si el nombre está mal, el script
 * no inventa resultados: avisa con una ALERTA y se salta lo de dentro de la base.
 *
 * Lo que este script NO puede ver (revisarlo en Windows, ver INFORME.md):
 * el firewall, el servicio SQL Browser, quién es administrador de la PC y
 * la configuración del túnel de Cloudflare.
 */

SET NOCOUNT ON;
SET NOEXEC OFF;
IF OBJECT_ID(N'tempdb..#hallazgos') IS NOT NULL DROP TABLE #hallazgos;
CREATE TABLE #hallazgos (
  orden     INT IDENTITY PRIMARY KEY,
  seccion   NVARCHAR(30)  NOT NULL,
  control   NVARCHAR(200) NOT NULL,
  valor     NVARCHAR(400) NULL,
  esperado  NVARCHAR(200) NULL,
  estado    VARCHAR(7)    NOT NULL
);
GO

/* ══════════ 1. EL SERVIDOR: quién puede entrar ══════════ */

INSERT #hallazgos (seccion, control, valor, esperado, estado)
SELECT N'Servidor', N'Versión de SQL Server',
       CONCAT(CAST(SERVERPROPERTY('ProductVersion') AS NVARCHAR(50)), N' · ',
              CAST(SERVERPROPERTY('Edition') AS NVARCHAR(100)), N' · ',
              ISNULL(CAST(SERVERPROPERTY('ProductUpdateLevel') AS NVARCHAR(20)), N'sin actualización acumulativa')),
       N'La última actualización acumulativa (CU) de su versión', 'INFO';

INSERT #hallazgos (seccion, control, valor, esperado, estado)
SELECT N'Servidor', N'Modo de autenticación',
       IIF(CAST(SERVERPROPERTY('IsIntegratedSecurityOnly') AS INT) = 1, N'Sólo Windows', N'Mixto (Windows + usuarios SQL)'),
       N'Sólo Windows: la API entra con su cuenta de Windows',
       IIF(CAST(SERVERPROPERTY('IsIntegratedSecurityOnly') AS INT) = 1, 'OK', 'ALERTA');

-- sa: deshabilitada y, por si algún día se habilita, sin contraseña trivial.
INSERT #hallazgos (seccion, control, valor, esperado, estado)
SELECT N'Servidor', N'Cuenta sa',
       CONCAT(IIF(p.is_disabled = 1, N'deshabilitada', N'HABILITADA'),
              IIF(PWDCOMPARE(N'', l.password_hash) = 1, N' · CONTRASEÑA VACÍA', N''),
              IIF(PWDCOMPARE(N'sa', l.password_hash) = 1, N' · CONTRASEÑA = sa', N'')),
       N'Deshabilitada y sin contraseña trivial',
       CASE WHEN p.is_disabled = 0 THEN 'ALERTA'
            WHEN PWDCOMPARE(N'', l.password_hash) = 1 OR PWDCOMPARE(N'sa', l.password_hash) = 1 THEN 'REVISAR'
            ELSE 'OK' END
FROM sys.server_principals p
LEFT JOIN sys.sql_logins l ON l.sid = p.sid
WHERE p.sid = 0x01;

-- Otros usuarios SQL (con contraseña propia de SQL Server). La API no necesita ninguno.
INSERT #hallazgos (seccion, control, valor, esperado, estado)
SELECT N'Servidor', N'Usuario SQL: ' + name,
       CONCAT(IIF(is_disabled = 1, N'deshabilitado', N'habilitado'),
              N' · política de contraseñas ', IIF(is_policy_checked = 1, N'sí', N'NO'),
              IIF(PWDCOMPARE(N'', password_hash) = 1, N' · CONTRASEÑA VACÍA', N''),
              IIF(PWDCOMPARE(name, password_hash) = 1, N' · CONTRASEÑA IGUAL AL NOMBRE', N'')),
       N'Ninguno habilitado',
       CASE WHEN PWDCOMPARE(N'', password_hash) = 1 OR PWDCOMPARE(name, password_hash) = 1 THEN 'ALERTA'
            WHEN is_disabled = 0 AND is_policy_checked = 0 THEN 'ALERTA'
            WHEN is_disabled = 0 THEN 'REVISAR'
            ELSE 'OK' END
FROM sys.sql_logins
WHERE name NOT LIKE N'##%' AND sid <> 0x01;

-- Quién es sysadmin: puede hacer cualquier cosa, incluido leer y borrar todo.
INSERT #hallazgos (seccion, control, valor, esperado, estado)
SELECT N'Servidor', N'sysadmin: ' + m.name,
       m.type_desc + IIF(m.is_disabled = 1, N' (deshabilitado)', N''),
       N'Sólo administradores de la PC y los servicios de SQL Server',
       CASE WHEN m.name = N'NT SERVICE\MdcApi' THEN 'ALERTA'
            WHEN m.name LIKE N'NT SERVICE\%' OR m.name = N'NT AUTHORITY\SYSTEM' OR m.sid = 0x01 THEN 'INFO'
            ELSE 'REVISAR' END
FROM sys.server_role_members rm
JOIN sys.server_principals r ON r.principal_id = rm.role_principal_id
JOIN sys.server_principals m ON m.principal_id = rm.member_principal_id
WHERE r.name = N'sysadmin';

-- Otros roles de servidor con poder (securityadmin, en la práctica, llega a sysadmin).
INSERT #hallazgos (seccion, control, valor, esperado, estado)
SELECT N'Servidor', N'Rol ' + r.name + N': ' + m.name, m.type_desc,
       N'Vacío',
       IIF(m.name = N'NT SERVICE\MdcApi' OR r.name = N'securityadmin', 'ALERTA', 'REVISAR')
FROM sys.server_role_members rm
JOIN sys.server_principals r ON r.principal_id = rm.role_principal_id
JOIN sys.server_principals m ON m.principal_id = rm.member_principal_id
WHERE r.name IN (N'securityadmin', N'serveradmin', N'setupadmin', N'processadmin', N'diskadmin', N'dbcreator', N'bulkadmin');

-- La cuenta de la API en el servidor: debe existir.
INSERT #hallazgos (seccion, control, valor, esperado, estado)
SELECT N'Servidor', N'Login NT SERVICE\MdcApi',
       IIF(SUSER_ID(N'NT SERVICE\MdcApi') IS NULL, N'NO EXISTE', N'existe'),
       N'Existe (lo crea el instalador)',
       IIF(SUSER_ID(N'NT SERVICE\MdcApi') IS NULL, 'ALERTA', 'OK');

-- Permisos de servidor fuera de los de fábrica: CONNECT SQL de cada login,
-- VIEW ANY DATABASE y los endpoints de public, y los que SQL Server da a sus
-- propios servicios (MSSQL$…, SQLWriter, SQLTELEMETRY, Winmgmt).
INSERT #hallazgos (seccion, control, valor, esperado, estado)
SELECT N'Servidor', N'Permiso de servidor: ' + p.permission_name + N' → ' + g.name, p.state_desc,
       N'Sólo los de fábrica',
       IIF(p.permission_name IN (N'CONTROL SERVER', N'IMPERSONATE ANY LOGIN', N'ALTER ANY LOGIN', N'ALTER ANY SERVER ROLE')
           AND p.state IN ('G', 'W'), 'ALERTA', 'REVISAR')
FROM sys.server_permissions p
JOIN sys.server_principals g ON g.principal_id = p.grantee_principal_id
WHERE p.permission_name <> N'CONNECT SQL'
  AND g.name NOT LIKE N'##%'
  AND NOT (g.name = N'public' AND (p.class_desc = N'ENDPOINT' OR p.permission_name = N'VIEW ANY DATABASE'))
  AND NOT (g.name LIKE N'NT SERVICE\MSSQL%' OR g.name LIKE N'NT SERVICE\SQL%' OR g.name = N'NT SERVICE\Winmgmt');
GO

/* ══════════ 2. SUPERFICIE: lo que estaría de más ══════════ */

INSERT #hallazgos (seccion, control, valor, esperado, estado)
SELECT N'Superficie', N'Opción: ' + name, CAST(value_in_use AS NVARCHAR(10)), N'0 (apagada)',
       IIF(CAST(value_in_use AS INT) = 0, 'OK', 'ALERTA')
FROM sys.configurations
WHERE name IN (N'xp_cmdshell', N'clr enabled', N'Ole Automation Procedures', N'Ad Hoc Distributed Queries',
               N'cross db ownership chaining', N'external scripts enabled', N'Database Mail XPs',
               N'contained database authentication', N'remote admin connections');

-- La API entra por memoria compartida (Server=.\SQLEXPRESS). TCP/IP y
-- canalizaciones con nombre sólo hacen falta si otra máquina se conecta.
-- Si TCP está encendido, las filas "Escuchando en" dicen si es sólo local.
INSERT #hallazgos (seccion, control, valor, esperado, estado)
SELECT N'Superficie',
       IIF(registry_key LIKE N'%SuperSocketNetLib\Tcp', N'Protocolo TCP/IP', N'Protocolo canalizaciones con nombre'),
       IIF(CAST(value_data AS INT) = 1, N'habilitado', N'deshabilitado'),
       IIF(registry_key LIKE N'%SuperSocketNetLib\Tcp', N'Deshabilitado, o escuchando sólo en 127.0.0.1', N'Deshabilitado'),
       CASE WHEN CAST(value_data AS INT) = 0 THEN 'OK'
            WHEN registry_key LIKE N'%SuperSocketNetLib\Tcp' THEN 'INFO'
            ELSE 'REVISAR' END
FROM sys.dm_server_registry
WHERE (registry_key LIKE N'%SuperSocketNetLib\Tcp' OR registry_key LIKE N'%SuperSocketNetLib\Np')
  AND value_name = N'Enabled';

INSERT #hallazgos (seccion, control, valor, esperado, estado)
SELECT N'Superficie', N'Escuchando en ' + ip_address + N':' + CAST(port AS NVARCHAR(10)),
       type_desc + N' · ' + state_desc,
       N'Nada fuera de 127.0.0.1 / ::1',
       IIF(ip_address IN (N'127.0.0.1', N'::1'), 'OK', 'REVISAR')
FROM sys.dm_tcp_listener_states
WHERE type_desc = N'TSQL';

INSERT #hallazgos (seccion, control, valor, esperado, estado)
SELECT N'Superficie', N'Servicio: ' + servicename,
       CONCAT(service_account, N' · ', startup_type_desc, N' · ', status_desc),
       N'Cuenta virtual NT Service\…, no LocalSystem ni una persona',
       IIF(service_account LIKE N'NT Service\%' OR service_account = N'NT AUTHORITY\NETWORK SERVICE', 'OK', 'REVISAR')
FROM sys.dm_server_services;
GO

/* ══════════ 3. LA BASE: dueño, opciones y respaldos ══════════ */

DECLARE @base SYSNAME = N'MdcMaquinaria';                                                 -- ◄ (1 de 2)

INSERT #hallazgos (seccion, control, valor, esperado, estado)
SELECT N'Base', N'La base ' + @base + N' existe', IIF(DB_ID(@base) IS NULL, N'NO', N'sí'),
       N'Sí', IIF(DB_ID(@base) IS NULL, 'ALERTA', 'OK');

INSERT #hallazgos (seccion, control, valor, esperado, estado)
SELECT N'Base', N'Dueño de la base', ISNULL(SUSER_SNAME(owner_sid), N'(una cuenta que ya no existe)'),
       N'Un administrador o sa; nunca la cuenta de la API',
       CASE WHEN SUSER_SNAME(owner_sid) = N'NT SERVICE\MdcApi' THEN 'ALERTA'
            WHEN SUSER_SNAME(owner_sid) IS NULL THEN 'REVISAR'
            ELSE 'INFO' END
FROM sys.databases WHERE name = @base
UNION ALL
SELECT N'Base', N'TRUSTWORTHY', IIF(is_trustworthy_on = 1, N'ENCENDIDO', N'apagado'),
       N'Apagado', IIF(is_trustworthy_on = 1, 'ALERTA', 'OK')
FROM sys.databases WHERE name = @base
UNION ALL
SELECT N'Base', N'Encadenamiento de propiedad entre bases', IIF(is_db_chaining_on = 1, N'ENCENDIDO', N'apagado'),
       N'Apagado', IIF(is_db_chaining_on = 1, 'ALERTA', 'OK')
FROM sys.databases WHERE name = @base
UNION ALL
SELECT N'Base', N'Modelo de recuperación', recovery_model_desc,
       N'SIMPLE con respaldo diario, o FULL con respaldos del log', 'INFO'
FROM sys.databases WHERE name = @base;

-- Respaldos: sin ellos, un disco dañado es perder cotizaciones y catálogo.
INSERT #hallazgos (seccion, control, valor, esperado, estado)
SELECT N'Base', N'Último respaldo completo',
       ISNULL(CONVERT(NVARCHAR(30), MAX(b.backup_finish_date), 120), N'NUNCA'),
       N'Hace menos de 1 día',
       CASE WHEN MAX(b.backup_finish_date) IS NULL THEN 'ALERTA'
            WHEN MAX(b.backup_finish_date) < DATEADD(DAY, -7, GETDATE()) THEN 'ALERTA'
            WHEN MAX(b.backup_finish_date) < DATEADD(DAY, -1, GETDATE()) THEN 'REVISAR'
            ELSE 'OK' END
FROM msdb.dbo.backupset b
WHERE b.database_name = @base AND b.type = 'D';

INSERT #hallazgos (seccion, control, valor, esperado, estado)
SELECT N'Base', N'Último respaldo del log (modelo FULL)',
       ISNULL(CONVERT(NVARCHAR(30), MAX(b.backup_finish_date), 120), N'NUNCA'),
       N'Hace menos de 1 día; si no, el log crece sin límite',
       CASE WHEN MAX(b.backup_finish_date) IS NULL OR MAX(b.backup_finish_date) < DATEADD(DAY, -1, GETDATE())
            THEN 'ALERTA' ELSE 'OK' END
FROM sys.databases d
LEFT JOIN msdb.dbo.backupset b ON b.database_name = d.name AND b.type = 'L'
WHERE d.name = @base AND d.recovery_model_desc = N'FULL'
GROUP BY d.name;
GO

/* ══════════ 4. DENTRO DE LA BASE: quién puede qué ══════════ */

USE [MdcMaquinaria];                                                                      -- ◄ (2 de 2)
GO

/* Si el USE falló (la base no existe o el nombre está mal), seguimos en la
   base con la que se abrió la conexión: medirla daría resultados falsos. Se
   reconoce la de MDC por sus tablas, no por el nombre. Se avisa y, con
   NOEXEC, las secciones 4 a 6 se compilan pero no se ejecutan; la tabla
   final sale. */
IF DB_NAME() IN (N'master', N'tempdb', N'model', N'msdb')
   OR OBJECT_ID(N'dbo.usuarios') IS NULL OR OBJECT_ID(N'dbo.bitacora') IS NULL
BEGIN
  INSERT #hallazgos (seccion, control, valor, esperado, estado)
  VALUES (N'Base', N'No se pudo entrar a la base: secciones 4 a 6 sin revisar',
          N'Sigue en ' + DB_NAME(), N'Cambiar el nombre en las líneas ◄', 'ALERTA');
  SET NOEXEC ON;
END;
GO

INSERT #hallazgos (seccion, control, valor, esperado, estado)
SELECT N'Permisos', N'Usuario NT SERVICE\MdcApi en la base',
       IIF(USER_ID(N'NT SERVICE\MdcApi') IS NULL, N'NO EXISTE', N'existe'),
       N'Existe', IIF(USER_ID(N'NT SERVICE\MdcApi') IS NULL, 'ALERTA', 'OK');

-- Miembros de los roles de la base (dbo, el dueño, no cuenta).
INSERT #hallazgos (seccion, control, valor, esperado, estado)
SELECT N'Permisos', N'Rol ' + r.name + N': ' + m.name, m.type_desc,
       CASE WHEN m.name = N'NT SERVICE\MdcApi' THEN N'La API: sólo db_datareader y db_datawriter, con DENY en bitácora y _migraciones (INFORME, hallazgo 1)'
            ELSE N'Sólo quien administra la base' END,
       CASE WHEN m.name = N'NT SERVICE\MdcApi' AND r.name = N'db_datareader' THEN 'OK'
            WHEN m.name = N'NT SERVICE\MdcApi' AND r.name = N'db_datawriter' THEN 'REVISAR'   -- ver la sección 5
            WHEN m.name = N'NT SERVICE\MdcApi' THEN 'ALERTA'   -- de más (db_owner…) o de menos (db_deny…)
            WHEN r.name IN (N'db_owner', N'db_securityadmin', N'db_accessadmin', N'db_ddladmin') THEN 'REVISAR'
            ELSE 'INFO' END
FROM sys.database_role_members rm
JOIN sys.database_principals r ON r.principal_id = rm.role_principal_id
JOIN sys.database_principals m ON m.principal_id = rm.member_principal_id
WHERE m.name <> N'dbo';

/* Permisos dados a mano, fuera de los roles (GRANT/DENY). Se dejan fuera los
   de fábrica: los de public sobre objetos del sistema (sys, INFORMATION_SCHEMA,
   que en cada base son cientos) y el CONNECT de cada usuario, incluido guest,
   que tiene su propio control abajo. */
INSERT #hallazgos (seccion, control, valor, esperado, estado)
SELECT N'Permisos',
       CONCAT(p.permission_name, N' en ',
              CASE p.class WHEN 0 THEN N'toda la base'
                           WHEN 1 THEN ISNULL(OBJECT_SCHEMA_NAME(p.major_id) + N'.' + OBJECT_NAME(p.major_id), N'objeto ' + CAST(p.major_id AS NVARCHAR(20)))
                           WHEN 3 THEN N'esquema ' + SCHEMA_NAME(p.major_id)
                           ELSE p.class_desc END,
              N' → ', g.name),
       p.state_desc,
       CASE WHEN g.name = N'NT SERVICE\MdcApi' AND p.permission_name = N'EXECUTE' AND p.class = 0
            THEN N'Ejecutar sólo los procedimientos que usa (dbo.preguntar, dbo.contar)'
            WHEN p.state = 'D' THEN N'Un DENY: la sección 5 dice si le quita algo que la API usa'
            ELSE N'Nada fuera de lo que pone el instalador' END,
       CASE WHEN p.state IN ('G', 'W') AND p.permission_name IN (N'CONTROL', N'ALTER', N'ALTER ANY USER', N'ALTER ANY ROLE', N'ALTER ANY SCHEMA', N'IMPERSONATE', N'TAKE OWNERSHIP') THEN 'ALERTA'
            WHEN p.state = 'D' THEN 'INFO'
            ELSE 'REVISAR' END
FROM sys.database_permissions p
JOIN sys.database_principals g ON g.principal_id = p.grantee_principal_id
WHERE g.name <> N'dbo'
  AND NOT (p.class = 1 AND (p.major_id < 0 OR OBJECT_SCHEMA_NAME(p.major_id) IN (N'sys', N'INFORMATION_SCHEMA')))
  AND NOT (p.class = 3 AND SCHEMA_NAME(p.major_id) IN (N'sys', N'INFORMATION_SCHEMA'))
  AND NOT (p.permission_name = N'CONNECT' AND p.class = 0)
  AND NOT (g.name = N'public' AND p.class = 0 AND p.permission_name LIKE N'VIEW ANY COLUMN%');

-- guest no debe poder entrar a la base.
INSERT #hallazgos (seccion, control, valor, esperado, estado)
SELECT N'Permisos', N'Usuario guest puede conectarse',
       IIF(EXISTS (SELECT 1 FROM sys.database_permissions
                   WHERE grantee_principal_id = DATABASE_PRINCIPAL_ID(N'guest')
                     AND permission_name = N'CONNECT' AND state IN ('G', 'W')), N'SÍ', N'no'),
       N'No',
       IIF(EXISTS (SELECT 1 FROM sys.database_permissions
                   WHERE grantee_principal_id = DATABASE_PRINCIPAL_ID(N'guest')
                     AND permission_name = N'CONNECT' AND state IN ('G', 'W')), 'ALERTA', 'OK');

-- Usuarios de la base sin login en el servidor (huérfanos).
INSERT #hallazgos (seccion, control, valor, esperado, estado)
SELECT N'Permisos', N'Usuario huérfano: ' + dp.name, dp.type_desc,
       N'Ninguno', 'REVISAR'
FROM sys.database_principals dp
LEFT JOIN sys.server_principals sp ON sp.sid = dp.sid
WHERE dp.type IN ('S', 'U', 'G') AND sp.sid IS NULL
  AND dp.authentication_type_desc IN (N'INSTANCE', N'WINDOWS')
  AND dp.name NOT IN (N'dbo', N'guest', N'INFORMATION_SCHEMA', N'sys');
GO

/* ══════════ 5. LO QUE DE VERDAD PUEDE HACER LA API ══════════
   Se mide poniéndose en su lugar un momento: lo que dicen los roles y lo que
   resulta de combinarlos con GRANT y DENY puede no coincidir.

   Si el objeto existe y HAS_PERMS_BY_NAME devuelve NULL, es que la API ni
   siquiera lo ve: no tiene ningún permiso, cuenta como "no". Si el objeto no
   existe, se dice aparte (se comprueba antes, con la cuenta de quien corre
   el script). */

DECLARE @puede TABLE (
  control NVARCHAR(200), objeto NVARCHAR(260), clase NVARCHAR(20), permiso NVARCHAR(60),
  deberia BIT, nota NVARCHAR(200), existe BIT, puede BIT);

INSERT @puede (control, objeto, clase, permiso, deberia, nota) VALUES
  (N'Leer equipos',                           N'dbo.equipos',      N'OBJECT', N'SELECT',  1, N'La necesita'),
  (N'Cambiar equipos',                        N'dbo.equipos',      N'OBJECT', N'UPDATE',  1, N'La necesita'),
  (N'Crear cotizaciones',                     N'dbo.solicitudes',  N'OBJECT', N'INSERT',  1, N'La necesita'),
  (N'Invitar y borrar cuentas del panel',     N'dbo.usuarios',     N'OBJECT', N'DELETE',  1, N'La necesita'),
  (N'Abrir sesiones',                         N'dbo.sesiones',     N'OBJECT', N'INSERT',  1, N'La necesita'),
  (N'Ejecutar dbo.preguntar',                 N'dbo.preguntar',    N'OBJECT', N'EXECUTE', 1, N'La necesita'),
  (N'Ejecutar dbo.contar',                    N'dbo.contar',       N'OBJECT', N'EXECUTE', 1, N'La necesita'),
  (N'Escribir renglones falsos en la bitácora', N'dbo.bitacora',   N'OBJECT', N'INSERT',  0, N'Sólo la llenan los disparadores'),
  (N'Cambiar renglones de la bitácora',       N'dbo.bitacora',     N'OBJECT', N'UPDATE',  0, N'Sólo la llenan los disparadores'),
  (N'Borrar renglones de la bitácora',        N'dbo.bitacora',     N'OBJECT', N'DELETE',  0, N'Sólo la llenan los disparadores'),
  (N'Escribir en el registro de migraciones', N'dbo._migraciones', N'OBJECT', N'INSERT',  0, N'Lo escribe el instalador con otra cuenta'),
  (N'Cambiar el registro de migraciones',     N'dbo._migraciones', N'OBJECT', N'UPDATE',  0, N'Lo escribe el instalador con otra cuenta'),
  (N'Borrar del registro de migraciones',     N'dbo._migraciones', N'OBJECT', N'DELETE',  0, N'Lo escribe el instalador con otra cuenta'),
  (N'Apagar disparadores de equipos (ALTER)', N'dbo.equipos',      N'OBJECT', N'ALTER',   0, N'Sería saltarse la bitácora'),
  (N'Vaciar la bitácora (TRUNCATE = ALTER)',  N'dbo.bitacora',     N'OBJECT', N'ALTER',   0, N''),
  (N'Cambiar el esquema dbo',                 N'dbo',              N'SCHEMA', N'ALTER',   0, N''),
  (N'Crear tablas',                           QUOTENAME(DB_NAME()), N'DATABASE', N'CREATE TABLE',   0, N''),
  (N'Crear o cambiar usuarios de la base',    QUOTENAME(DB_NAME()), N'DATABASE', N'ALTER ANY USER', 0, N''),
  (N'Control total de la base',               QUOTENAME(DB_NAME()), N'DATABASE', N'CONTROL',        0, N'');

UPDATE @puede SET existe = CASE clase WHEN N'OBJECT'   THEN IIF(OBJECT_ID(objeto) IS NULL, 0, 1)
                                      WHEN N'SCHEMA'   THEN IIF(SCHEMA_ID(objeto) IS NULL, 0, 1)
                                      ELSE 1 END;

IF USER_ID(N'NT SERVICE\MdcApi') IS NOT NULL
BEGIN
  BEGIN TRY
    EXECUTE AS USER = N'NT SERVICE\MdcApi';
    UPDATE @puede SET puede = ISNULL(HAS_PERMS_BY_NAME(objeto, clase, permiso), 0) WHERE existe = 1;
    REVERT;
  END TRY
  BEGIN CATCH
    -- Pase lo que pase, de vuelta a la cuenta de quien corre el script.
    IF USER_NAME() = N'NT SERVICE\MdcApi' REVERT;
    INSERT #hallazgos (seccion, control, valor, esperado, estado)
    VALUES (N'La API puede', N'No se pudieron medir los permisos de la API', ERROR_MESSAGE(),
            N'Correr el script como administrador', 'ALERTA');
  END CATCH;
END;

INSERT #hallazgos (seccion, control, valor, esperado, estado)
SELECT N'La API puede', control,
       CASE WHEN existe = 0 THEN N'(el objeto no existe)'
            WHEN puede = 1 THEN N'sí' WHEN puede = 0 THEN N'no' ELSE N'(sin medir)' END,
       IIF(deberia = 1, N'Sí', N'No') + IIF(nota <> N'', N' · ' + nota, N''),
       -- Distinto de lo esperado es ALERTA en los dos sentidos: si le falta algo
       -- que usa, la API falla; si puede algo de más, es un riesgo.
       CASE WHEN existe = 0 THEN IIF(deberia = 1, 'ALERTA', 'INFO')
            WHEN puede IS NULL THEN 'REVISAR'
            WHEN puede = deberia THEN 'OK'
            ELSE 'ALERTA' END
FROM @puede;
GO

/* ══════════ 6. LAS CUENTAS DEL PANEL (sin mostrar contraseñas) ══════════ */

INSERT #hallazgos (seccion, control, valor, esperado, estado)
SELECT N'Cuentas', N'Administradores que pueden entrar',
       CAST(COUNT(*) AS NVARCHAR(10)),
       N'Al menos 2 (uno de respaldo), todos conocidos',
       CASE WHEN COUNT(*) = 0 THEN 'ALERTA'     -- nadie puede entrar al panel
            WHEN COUNT(*) = 1 THEN 'REVISAR'
            ELSE 'OK' END
FROM dbo.usuarios WHERE rol = 'admin' AND hash_contrasena IS NOT NULL;

INSERT #hallazgos (seccion, control, valor, esperado, estado)
SELECT N'Cuentas', N'Invitaciones vencidas sin aceptar',
       CAST(COUNT(*) AS NVARCHAR(10)), N'0 (borrar o reenviar)',
       IIF(COUNT(*) = 0, 'OK', 'REVISAR')
FROM dbo.usuarios WHERE hash_contrasena IS NULL AND invitacion_expira < SYSDATETIMEOFFSET();

INSERT #hallazgos (seccion, control, valor, esperado, estado)
SELECT N'Cuentas', N'Cuentas "staff" (no entran al panel)',
       CAST(COUNT(*) AS NVARCHAR(10)), N'0, o saber por qué existen', IIF(COUNT(*) = 0, 'OK', 'INFO')
FROM dbo.usuarios WHERE rol = 'staff';

INSERT #hallazgos (seccion, control, valor, esperado, estado)
SELECT N'Cuentas', N'Cuentas bloqueadas ahora (5 contraseñas malas)',
       CAST(COUNT(*) AS NVARCHAR(10)), N'0; si se repite, alguien está probando contraseñas',
       IIF(COUNT(*) = 0, 'OK', 'REVISAR')
FROM dbo.usuarios WHERE bloqueado_hasta > SYSDATETIMEOFFSET();

INSERT #hallazgos (seccion, control, valor, esperado, estado)
SELECT N'Cuentas', N'Sesiones abiertas de cuentas que ya no son admin',
       CAST(COUNT(*) AS NVARCHAR(10)), N'0',
       IIF(COUNT(*) = 0, 'OK', 'REVISAR')
FROM dbo.sesiones s JOIN dbo.usuarios u ON u.id = s.usuario_id
WHERE s.revocada = 0 AND s.expira > SYSDATETIMEOFFSET() AND u.rol <> 'admin';

INSERT #hallazgos (seccion, control, valor, esperado, estado)
SELECT N'Cuentas', N'Sesiones vencidas o cerradas guardadas',
       CAST(COUNT(*) AS NVARCHAR(10)), N'Pocas; no se borran solas', 'INFO'
FROM dbo.sesiones WHERE revocada = 1 OR expira < SYSDATETIMEOFFSET();

-- Cambios a equipos o sucursales hechos por fuera de la API (sin autor).
INSERT #hallazgos (seccion, control, valor, esperado, estado)
SELECT N'Bitácora', N'Cambios sin autor en los últimos 90 días',
       CONCAT(COUNT(*), IIF(COUNT(*) > 0, N' · el último: ' + CONVERT(NVARCHAR(30), MAX(ocurrio_en), 120), N'')),
       N'0, salvo importaciones o arreglos a mano que conozcas',
       IIF(COUNT(*) = 0, 'OK', 'REVISAR')
FROM dbo.bitacora
WHERE actor IS NULL AND ocurrio_en > DATEADD(DAY, -90, SYSDATETIMEOFFSET());

INSERT #hallazgos (seccion, control, valor, esperado, estado)
SELECT N'Bitácora', N'Cambios hechos por cuentas que ya no existen',
       CAST(COUNT(*) AS NVARCHAR(10)), N'Información: quedan con su id', 'INFO'
FROM dbo.bitacora b
WHERE b.actor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.usuarios u WHERE u.id = b.actor);

-- Quién tiene cuenta en el panel (sin contraseñas ni tokens).
SELECT u.correo, u.nombre, u.rol,
       IIF(u.hash_contrasena IS NULL, N'invitación pendiente', N'activa') AS estado_cuenta,
       u.creado_en,
       (SELECT COUNT(*) FROM dbo.sesiones s
         WHERE s.usuario_id = u.id AND s.revocada = 0 AND s.expira > SYSDATETIMEOFFSET()) AS sesiones_abiertas
FROM dbo.usuarios u
ORDER BY IIF(u.rol = 'admin', 0, 1), u.correo;
GO

/* ══════════ RESULTADO ══════════
   SET NOEXEC OFF se procesa aunque NOEXEC esté encendido: la tabla final
   sale siempre, también cuando no se pudo entrar a la base. */
SET NOEXEC OFF;
GO

SELECT estado, seccion, control, valor, esperado
FROM #hallazgos
ORDER BY CASE estado WHEN 'ALERTA' THEN 0 WHEN 'REVISAR' THEN 1 WHEN 'INFO' THEN 2 ELSE 3 END, orden;

DROP TABLE #hallazgos;
