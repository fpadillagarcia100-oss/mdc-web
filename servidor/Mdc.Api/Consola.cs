using Dapper;
using Mdc.Api.Datos;
using Mdc.Api.Seguridad;
using Microsoft.Data.SqlClient;

namespace Mdc.Api;

/// <summary>
/// Tareas de una sola vez, sin levantar el servidor:
///
///   Mdc.Api migrar                         aplica servidor/sql/ (crea la base si hace falta)
///   Mdc.Api invitar-admin correo "Nombre"  crea un administrador e imprime su enlace
///
/// El primer administrador no puede invitarse desde el panel —no hay nadie
/// que entre—, así que se crea aquí. No se escribe ninguna contraseña en la
/// terminal (quedaría en el historial): se imprime un enlace de invitación y
/// la contraseña se elige al abrirlo, igual que cualquier otra cuenta.
/// </summary>
public static class Consola
{
    public static bool EsComando(string a) => a is "migrar" or "invitar-admin" or "importar" or "configurar" or "instalar";

    public static async Task<int> Ejecutar(string[] args)
    {
        Console.OutputEncoding = System.Text.Encoding.UTF8;   // acentos, ✓ y flechas en la consola de Windows

        /* Sólo los argumentos "--clave=valor" van a la configuración. Una bandera
           suelta (--reemplazar, --rehacer) se tragaría el argumento siguiente
           como si fuera su valor. */
        var config = Host.CreateApplicationBuilder(new HostApplicationBuilderSettings
        {
            Args = args.Skip(1).Where(a => a.Contains('=')).ToArray(),
            // appsettings.json está junto al ejecutable, no donde esté parada la terminal.
            ContentRootPath = AppContext.BaseDirectory,
        }).Configuration;
        var cadena = config.GetConnectionString("Mdc");
        if (string.IsNullOrEmpty(cadena)) { Console.Error.WriteLine("Falta ConnectionStrings:Mdc"); return 1; }

        try
        {
            switch (args[0])
            {
                case "migrar":
                    var n = await Migraciones.AplicarAsync(cadena, Console.WriteLine);
                    Console.WriteLine(n == 0 ? "La base ya estaba al día." : $"Listo: {n} archivo(s) aplicado(s).");
                    return 0;

                case "instalar":
                {
                    // Mdc.Api instalar [--Sql:Servidor=.\SQLEXPRESS] [--Sql:Base=MdcMaquinaria]
                    return await Instalar.Ejecutar(config["Sql:Servidor"] ?? @".\SQLEXPRESS", config["Sql:Base"] ?? "MdcMaquinaria");
                }

                case "configurar":
                    // Mdc.Api configurar [--rehacer] --ConnectionStrings:Mdc=… --Fotos:Carpeta=…
                    return Configurar.Ejecutar(Endpoints.FotosEndpoints.Carpeta(config), cadena, args.Contains("--rehacer"));

                case "importar":
                {
                    /* Mdc.Api importar --desde-json data/catalogo.json [--reemplazar]
                       Mdc.Api importar --desde-supabase [--reemplazar]
                         (lee SUPABASE_URL y SUPABASE_SERVICE_KEY del entorno de ESA ejecución) */
                    var reemplazar = args.Contains("--reemplazar");
                    var imp = new Importar(cadena, config, Console.WriteLine);
                    Importar.Paquete paquete;
                    string? urlSupabase = null;
                    var iJson = Array.IndexOf(args, "--desde-json");
                    if (iJson > 0 && iJson + 1 < args.Length)
                    {
                        Console.WriteLine($"Leyendo {args[iJson + 1]}…");
                        paquete = Importar.DesdeJson(args[iJson + 1]);
                    }
                    else if (args.Contains("--desde-supabase"))
                    {
                        urlSupabase = Environment.GetEnvironmentVariable("SUPABASE_URL");
                        var llave = Environment.GetEnvironmentVariable("SUPABASE_SERVICE_KEY");
                        if (string.IsNullOrEmpty(urlSupabase) || string.IsNullOrEmpty(llave))
                        {
                            Console.Error.WriteLine("Faltan SUPABASE_URL y SUPABASE_SERVICE_KEY en el entorno de esta ejecución.");
                            return 1;
                        }
                        Console.WriteLine("Leyendo Supabase…");
                        paquete = await Importar.DesdeSupabaseAsync(urlSupabase, llave, Console.WriteLine);
                    }
                    else
                    {
                        Console.Error.WriteLine("Uso: Mdc.Api importar --desde-json <ruta> | --desde-supabase  [--reemplazar]");
                        return 1;
                    }

                    Console.WriteLine("Fotos…");
                    await imp.TraerFotosAsync(paquete, urlSupabase);
                    Console.WriteLine("Escribiendo en SQL Server…");
                    var enlaces = await imp.EscribirAsync(paquete, reemplazar);
                    if (enlaces.Count > 0)
                    {
                        Console.WriteLine();
                        Console.WriteLine("Las contraseñas no se pueden traer. Manda a cada quien su enlace (caducan en 7 días):");
                        foreach (var (correo, enlace) in enlaces) Console.WriteLine($"  {correo}  {enlace}");
                    }
                    Console.WriteLine("Listo.");
                    return 0;
                }

                case "invitar-admin":
                    if (args.Length < 3) { Console.Error.WriteLine("Uso: Mdc.Api invitar-admin correo \"Nombre\""); return 1; }
                    var token = Tokens.Aleatorio();
                    await using (var c = new SqlConnection(cadena))
                    {
                        await c.ExecuteAsync(
                            @"MERGE dbo.usuarios AS u USING (SELECT @correo AS correo) AS s ON u.correo = s.correo
                              WHEN MATCHED THEN UPDATE SET rol = 'admin', invitacion_hash = @h, invitacion_expira = @expira
                              WHEN NOT MATCHED THEN INSERT (correo, nombre, rol, invitacion_hash, invitacion_expira)
                                VALUES (@correo, @nombre, 'admin', @h, @expira);",
                            new
                            {
                                correo = args[1].Trim().ToLowerInvariant(), nombre = args[2].Trim(),
                                h = Tokens.Hash(token), expira = DateTimeOffset.UtcNow.AddDays(2),
                            });
                    }
                    var sitio = (config["Publico:UrlSitio"] ?? "https://mdcmaquinaria.com").TrimEnd('/');
                    Console.WriteLine("Abre este enlace para elegir la contraseña (caduca en 2 días):");
                    Console.WriteLine($"{sitio}/?invitacion={token}");
                    return 0;
            }
        }
        catch (SqlException ex)
        {
            Console.Error.WriteLine($"SQL Server: {ex.Message}");
            return 1;
        }
        catch (Exception ex) when (ex is IOException or InvalidOperationException or HttpRequestException or System.ComponentModel.Win32Exception)
        {
            // Un archivo que no está, una base con datos, Supabase que no contesta: se dice y se sale.
            Console.Error.WriteLine(ex.Message);
            return 1;
        }
        return 1;
    }
}
