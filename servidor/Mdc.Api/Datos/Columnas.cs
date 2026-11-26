using System.Text.Json;
using Dapper;

namespace Mdc.Api.Datos;

/// <summary>
/// Del JSON que manda el panel a los parámetros de un INSERT o UPDATE, pero
/// sólo con las columnas de una lista blanca.
///
/// Es lo que en Supabase hacían las políticas y los GRANT por columna: si el
/// panel (o alguien imitándolo) manda `imagen_url`, `id` o `creado_en`, aquí
/// simplemente no existen. Los nombres de columna que acaban en el SQL salen
/// SIEMPRE de la lista, nunca del JSON: no hay forma de colar texto en la
/// consulta por esa vía.
/// </summary>
public sealed class Columnas(params string[] permitidas)
{
    private readonly HashSet<string> permitidas = new(permitidas, StringComparer.Ordinal);
    public HashSet<string> Json { get; init; } = [];

    public (List<string> nombres, DynamicParameters valores) Leer(JsonElement cuerpo)
    {
        if (cuerpo.ValueKind != JsonValueKind.Object)
            throw new ArgumentException("Se esperaba un objeto.");
        var nombres = new List<string>();
        var valores = new DynamicParameters();
        foreach (var p in cuerpo.EnumerateObject())
        {
            if (!permitidas.Contains(p.Name)) continue;
            nombres.Add(p.Name);
            valores.Add(p.Name, Json.Contains(p.Name) ? p.Value.GetRawText() : Valor(p.Value));
        }
        return (nombres, valores);
    }

    private static object? Valor(JsonElement v) => v.ValueKind switch
    {
        JsonValueKind.String => v.GetString(),
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        JsonValueKind.Number => v.TryGetInt64(out var n) ? n : v.GetDecimal(),
        JsonValueKind.Null or JsonValueKind.Undefined => null,
        // Un objeto o arreglo en una columna que no es JSON es un error de quien llama.
        _ => throw new ArgumentException("Tipo de dato no válido."),
    };
}
