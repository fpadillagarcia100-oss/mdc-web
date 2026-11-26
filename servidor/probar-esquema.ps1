# probar-esquema.ps1 — Crea una base desechable, le aplica el esquema y prueba sus reglas.
#
# Nunca toca la base de verdad: la de prueba se llama MdcPrueba_Esquema y se
# borra y se rehace en cada corrida.
#
#   powershell -File servidor\probar-esquema.ps1
param([string]$Servidor = '.\SQLEXPRESS')
$ErrorActionPreference = 'Stop'
$db = 'MdcPrueba_Esquema'
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path

sqlcmd -S $Servidor -E -b -Q "IF DB_ID('$db') IS NOT NULL BEGIN ALTER DATABASE [$db] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$db]; END; CREATE DATABASE [$db];" | Out-Null
if ($LASTEXITCODE) { throw 'No se pudo crear la base de prueba' }

foreach ($f in Get-ChildItem (Join-Path $aqui 'sql\*.sql') | Sort-Object Name) {
  sqlcmd -S $Servidor -E -b -I -d $db -i $f.FullName -f 65001 | Out-Null
  if ($LASTEXITCODE) { throw "Falló al aplicar $($f.Name)" }
}

# -h -1 y -W: sólo los renglones, sin encabezados ni relleno.
sqlcmd -S $Servidor -E -b -I -d $db -i (Join-Path $aqui 'sql\pruebas\reglas.sql') -f 65001 -h -1 -W
$codigo = $LASTEXITCODE

sqlcmd -S $Servidor -E -Q "ALTER DATABASE [$db] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$db];" | Out-Null
exit $codigo
