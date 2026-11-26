using System.Security.AccessControl;
using System.Security.Principal;
using Dapper;
using Mdc.Api.Datos;
using Microsoft.Data.SqlClient;

namespace Mdc.Api;

/// <summary>
/// `Mdc.Api instalar` — instala o actualiza el servidor como servicio de Windows.
///
/// Se corre UNA vez como administrador, desde la carpeta que deja
/// `dotnet publish` (ver docs/SERVIDOR.md). Volver a correrlo actualiza el
/// programa y la base sin tocar datos ni secretos.
///
///   1. Se copia a C:\Program Files\MdcApi.
///   2. Crea la base (si no existe) y le aplica servidor/sql/, con TU cuenta.
///   3. Crea el servicio "MdcApi": arranca con Windows, se levanta solo si se
///      cae, y corre con su propia cuenta virtual (NT SERVICE\MdcApi), no con
///      la tuya.
///   4. Le da a esa cuenta en SQL Server lo justo: leer, escribir y ejecutar
///      procedimientos. No puede crear, cambiar ni borrar tablas.
///   5. Pide los secretos (Configurar.cs) y arranca.
///
/// Antes era un script de PowerShell. Defender lo borró al guardarlo: un
/// script que crea servicios, cambia permisos y lee contraseñas se parece
/// demasiado a lo que de verdad hace el malware. El programa que se instala
/// es el lugar natural para instalarse.
/// </summary>
public static class Instalar
{
    private const string Servicio = "MdcApi";
    private const string Cuenta = @"NT SERVICE\" + Servicio;

    public static async Task<int> Ejecutar(string servidorSql, string nombreBase)
    {
        if (!OperatingSystem.IsWindows()) { Console.Error.WriteLine("Sólo en Windows."); return 1; }
        if (!new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator))
        {
            Console.Error.WriteLine("Abre la terminal como administrador (clic derecho → Ejecutar como administrador).");
            return 1;
        }

        var origen = AppContext.BaseDirectory;
        var destino = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), Servicio);
        var fotos = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "MdcMaquinaria", "fotos");
        var cadena = $"Server={servidorSql};Database={nombreBase};Integrated Security=True;TrustServerCertificate=True;Application Name=Mdc.Api";
        var existe = ServicioWindows.Existe(Servicio);

        if (Path.GetFullPath(origen).TrimEnd('\\').Equals(destino, StringComparison.OrdinalIgnoreCase))
        {
            Console.Error.WriteLine($"Corre el instalador desde la carpeta de publicación, no desde {destino}.");
            return 1;
        }

        Paso("Copiando el programa…");
        if (existe) ServicioWindows.Detener(Servicio);
        Copiar(origen, destino);

        Paso($"Aplicando el esquema en {servidorSql} / {nombreBase}…");
        await Migraciones.AplicarAsync(cadena, t => Console.WriteLine("  " + t));

        if (!existe)
        {
            Paso("Creando el servicio de Windows…");
            ServicioWindows.Crear(Servicio, "MDC Maquinaria API",
                "Servidor de mdcmaquinaria.com sobre SQL Server. Lo publica Cloudflare Tunnel.",
                Path.Combine(destino, "Mdc.Api.exe"), Cuenta);
        }

        Paso($"Dando a {Cuenta} lectura y escritura, sin poder cambiar el esquema…");
        await using (var c = new SqlConnection(new SqlConnectionStringBuilder(cadena) { InitialCatalog = "master" }.ConnectionString))
        {
            await c.ExecuteAsync($"IF SUSER_ID(N'{Cuenta}') IS NULL CREATE LOGIN [{Cuenta}] FROM WINDOWS;");
            await c.ExecuteAsync($@"USE [{nombreBase}];
                IF USER_ID(N'{Cuenta}') IS NULL CREATE USER [{Cuenta}] FOR LOGIN [{Cuenta}];
                ALTER ROLE db_datareader ADD MEMBER [{Cuenta}];
                ALTER ROLE db_datawriter ADD MEMBER [{Cuenta}];
                GRANT EXECUTE TO [{Cuenta}];");
        }

        Paso("Carpeta de fotos…");
        Directory.CreateDirectory(fotos);
        var dir = new DirectoryInfo(fotos);
        var permisos = dir.GetAccessControl();
        permisos.AddAccessRule(new FileSystemAccessRule(new NTAccount(Cuenta), FileSystemRights.Modify,
            InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
        dir.SetAccessControl(permisos);
        Console.WriteLine("  " + fotos);

        Paso("Secretos del servicio…");
        // Se escriben junto al ejecutable INSTALADO, no junto al de la carpeta de publicación.
        var r = Configurar.Ejecutar(fotos, cadena, rehacer: false, carpeta: destino);
        if (r != 0) return r;

        Paso("Arrancando…");
        ServicioWindows.Arrancar(Servicio);
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
        for (var i = 0; i < 20; i++)
        {
            try
            {
                if ((await http.GetAsync("http://127.0.0.1:5080/salud")).IsSuccessStatusCode)
                {
                    Console.WriteLine();
                    Console.WriteLine("✓ MdcApi corre en http://127.0.0.1:5080 (sólo esta máquina).");
                    Console.WriteLine("  Siguiente paso: publicarlo con Cloudflare Tunnel (docs/SERVIDOR.md).");
                    return 0;
                }
            }
            catch (HttpRequestException) { }
            catch (TaskCanceledException) { }
            await Task.Delay(1000);
        }
        Console.Error.WriteLine("El servicio no contesta. Revisa el Visor de eventos → Registros de Windows → Aplicación (origen MdcApi).");
        return 1;
    }

    private static void Paso(string texto) { Console.WriteLine(); Console.WriteLine("▸ " + texto); }

    /// <summary>Copia la publicación, salvo los secretos que ya hubiera: actualizar no debe borrarlos.</summary>
    private static void Copiar(string desde, string hacia)
    {
        Directory.CreateDirectory(hacia);
        foreach (var archivo in Directory.GetFiles(desde, "*", SearchOption.AllDirectories))
        {
            var relativo = Path.GetRelativePath(desde, archivo);
            if (relativo.Equals("appsettings.Production.json", StringComparison.OrdinalIgnoreCase)) continue;
            var final = Path.Combine(hacia, relativo);
            Directory.CreateDirectory(Path.GetDirectoryName(final)!);
            File.Copy(archivo, final, overwrite: true);
        }
    }
}
