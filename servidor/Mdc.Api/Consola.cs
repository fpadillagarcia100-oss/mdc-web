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
    public static bool EsComando(string a) => a is "migrar" or "invitar-admin";

    public static async Task<int> Ejecutar(string[] args)
    {
        var config = Host.CreateApplicationBuilder(args[1..]).Configuration;
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
        return 1;
    }
}
