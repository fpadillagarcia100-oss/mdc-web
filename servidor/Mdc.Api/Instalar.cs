using System.Diagnostics;
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
        var existe = Sc("query", Servicio) == 0;

        if (Path.GetFullPath(origen).TrimEnd('\\').Equals(destino, StringComparison.OrdinalIgnoreCase))
        {
            Console.Error.WriteLine($"Corre el instalador desde la carpeta de publicación, no desde {destino}.");
            return 1;
        }

        Paso("Copiando el programa…");
        if (existe) { Sc("stop", Servicio); EsperarDetenido(); }
        Copiar(origen, destino);

        Paso($"Aplicando el esquema en {servidorSql} / {nombreBase}…");
        await Migraciones.AplicarAsync(cadena, t => Console.WriteLine("  " + t));

        if (!existe)
        {
            Paso("Creando el servicio de Windows…");
            if (Sc("create", Servicio, "binPath=", $"\"{Path.Combine(destino, "Mdc.Api.exe")}\"", "start=", "delayed-auto",
                   "obj=", Cuenta, "DisplayName=", "MDC Maquinaria API") != 0)
                throw new InvalidOperationException("No se pudo crear el servicio.");
            Sc("description", Servicio, "Servidor de mdcmaquinaria.com sobre SQL Server. Lo publica Cloudflare Tunnel.");
            // Si se cae, se levanta: a los 5 s, a los 30 s y luego cada minuto.
            Sc("failure", Servicio, "reset=", "86400", "actions=", "restart/5000/restart/30000/restart/60000");
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
        Sc("start", Servicio);
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

    /// <summary>
    /// sc.exe con cada argumento por separado. ArgumentList pone las comillas
    /// que hagan falta: la ruta del servicio lleva espacios ("Program Files") y
    /// sin comillas sería una "ruta de servicio sin entrecomillar", una vía
    /// clásica para colar otro ejecutable (C:\Program.exe).
    /// </summary>
    private static int Sc(params string[] args)
    {
        var psi = new ProcessStartInfo("sc.exe") { RedirectStandardOutput = true, UseShellExecute = false };
        foreach (var a in args) psi.ArgumentList.Add(a);
        using var p = Process.Start(psi)!;
        p.StandardOutput.ReadToEnd();
        p.WaitForExit();
        return p.ExitCode;
    }

    private static void EsperarDetenido()
    {
        for (var i = 0; i < 30; i++)
        {
            var p = Process.Start(new ProcessStartInfo("sc.exe", $"query {Servicio}") { RedirectStandardOutput = true, UseShellExecute = false })!;
            var salida = p.StandardOutput.ReadToEnd();
            p.WaitForExit();
            if (salida.Contains("STOPPED")) return;
            Thread.Sleep(1000);
        }
        throw new InvalidOperationException("El servicio no se detuvo a tiempo para actualizarlo.");
    }

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
