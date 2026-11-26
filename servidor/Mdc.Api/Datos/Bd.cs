using System.Text.Json;
using System.Text.Json.Nodes;
using Dapper;
using Microsoft.Data.SqlClient;

namespace Mdc.Api.Datos;

/// <summary>
/// La única puerta a SQL Server.
///
/// Abre conexiones y, si hay alguien con sesión, le dice a la base quién es
/// (sp_set_session_context 'usuario_id'): así los disparadores de bitácora
/// anotan al autor de cada cambio sin que cada consulta tenga que pasarlo.
/// El pool de conexiones limpia ese contexto al devolver la conexión
/// (sp_reset_connection), de modo que no se hereda de una petición a otra.
/// </summary>
public sealed class Bd(IConfiguration config)
{
    private readonly string cadena = config.GetConnectionString("Mdc")
        ?? throw new InvalidOperationException("Falta ConnectionStrings:Mdc");

    public async Task<SqlConnection> AbrirAsync(Guid? usuario = null, CancellationToken ct = default)
    {
        var conexion = new SqlConnection(cadena);
        await conexion.OpenAsync(ct);
        if (usuario is Guid id)
            await conexion.ExecuteAsync("EXEC sp_set_session_context N'usuario_id', @id", new { id });
        return conexion;
    }

    /// <summary>
    /// Filas de Dapper → diccionarios listos para JSON, con las columnas que
    /// guardan JSON (arreglos, atributos, carrito) convertidas de texto a
    /// objeto. Sin esto el panel recibiría "[\"20 ton\"]" en vez de un arreglo.
    /// </summary>
    public static List<Dictionary<string, object?>> Filas(IEnumerable<dynamic> filas, params string[] columnasJson)
    {
        var salida = new List<Dictionary<string, object?>>();
        foreach (IDictionary<string, object?> fila in filas)
        {
            var d = new Dictionary<string, object?>(fila.Count);
            foreach (var (k, v) in fila)
                d[k] = columnasJson.Contains(k) && v is string s ? JsonNode.Parse(s) : v;
            salida.Add(d);
        }
        return salida;
    }

    public static Dictionary<string, object?>? Fila(dynamic? fila, params string[] columnasJson)
        => fila is null ? null : Filas(new[] { fila }, columnasJson)[0];

    public static string Json(JsonElement e) => e.GetRawText();
}
