using System.Text.Json;
using Dapper;
using Mdc.Api.Avisos;
using Mdc.Api.Datos;
using Microsoft.Data.SqlClient;

namespace Mdc.Api.Endpoints;

/// <summary>
/// Lo que puede hacer cualquier visitante, sin sesión. Era lo que las
/// políticas RLS dejaban al rol `anon`: mandar una cotización, dejar una
/// pregunta, sumar una vista. Y leer el catálogo publicado, que sólo pide la
/// compilación del sitio: los visitantes lo reciben ya horneado en el HTML.
/// </summary>
public static class PublicoEndpoints
{
    public record Solicitud(string? tipo, string? nombre, string? telefono, string? correo,
        string? empresa, string? mensaje, JsonElement? carrito);
    public record Conteo(string? slug, string? tipo);
    public record Pregunta(string? slug, string? nombre, string? pregunta);

    public static void Mapear(WebApplication app)
    {
        var g = app.MapGroup("/api").RequireRateLimiting("publico");

        g.MapPost("/solicitudes", async (Solicitud s, Bd bd, Avisador avisador, ILogger<Program> log, CancellationToken ct) =>
        {
            var carrito = s.carrito is { ValueKind: JsonValueKind.Array } arr ? arr.GetRawText() : "[]";
            var fila = new
            {
                tipo = s.tipo,
                nombre = (s.nombre ?? "").Trim(),
                telefono = new string((s.telefono ?? "").Where(char.IsAsciiDigit).ToArray()),
                correo = string.IsNullOrWhiteSpace(s.correo) ? null : s.correo.Trim().ToLowerInvariant(),
                empresa = string.IsNullOrWhiteSpace(s.empresa) ? null : s.empresa.Trim(),
                mensaje = (s.mensaje ?? "").Trim(),
                carrito,
            };
            try
            {
                await using var c = await bd.AbrirAsync(ct: ct);
                /* La fecha y el estado no se mandan: los pone el disparador
                   solicitudes_frenar_spam, diga lo que diga quien llama. */
                await c.ExecuteAsync(
                    @"INSERT INTO dbo.solicitudes (tipo, nombre, telefono, correo, empresa, mensaje, carrito)
                      VALUES (@tipo, @nombre, @telefono, @correo, @empresa, @mensaje, @carrito)", fila);
            }
            catch (SqlException ex) { return Errores.Responder(ex, log); }

            // El correo necesita el carrito como arreglo, no como el texto que se guardó.
            avisador.FilaNueva("solicitudes", "/api/aviso-solicitud", new
            {
                fila.tipo, fila.nombre, fila.telefono, fila.correo, fila.empresa, fila.mensaje,
                carrito = JsonDocument.Parse(carrito).RootElement.Clone(),
            });
            return Results.NoContent();
        });

        g.MapPost("/contar", async (Conteo k, Bd bd, CancellationToken ct) =>
        {
            /* Como la RPC de antes: un slug o un tipo inventados se ignoran en
               silencio. No hay nada que explicarle a quien manda basura. */
            if (string.IsNullOrEmpty(k.slug) || k.slug.Length > 120) return Results.NoContent();
            await using var c = await bd.AbrirAsync(ct: ct);
            await c.ExecuteAsync("dbo.contar", new { slug = k.slug, tipo = k.tipo }, commandType: System.Data.CommandType.StoredProcedure);
            return Results.NoContent();
        });

        g.MapPost("/preguntas", async (Pregunta p, Bd bd, Avisador avisador, ILogger<Program> log, CancellationToken ct) =>
        {
            try
            {
                await using var c = await bd.AbrirAsync(ct: ct);
                var id = await c.ExecuteScalarAsync<long>("dbo.preguntar",
                    new { slug = p.slug ?? "", nombre = p.nombre, pregunta = p.pregunta },
                    commandType: System.Data.CommandType.StoredProcedure);
                var fila = await c.QuerySingleAsync(
                    "SELECT id, slug, nombre, pregunta, creado_en FROM dbo.preguntas WHERE id = @id", new { id });
                avisador.FilaNueva("preguntas", "/api/aviso-pregunta", Bd.Fila(fila)!);
            }
            catch (SqlException ex) { return Errores.Responder(ex, log); }
            return Results.NoContent();
        });

        /* Lo que la compilación del sitio necesita (tools/exportar-catalogo.js):
           sólo lo publicado, sólo las preguntas contestadas y publicadas. Es
           lo mismo que ya está a la vista en mdcmaquinaria.com. */
        g.MapGet("/catalogo", async (Bd bd, CancellationToken ct) =>
        {
            await using var c = await bd.AbrirAsync(ct: ct);
            using var m = await c.QueryMultipleAsync(
                @"SELECT * FROM dbo.ajustes;
                  SELECT nombre, direccion, telefono, horario FROM dbo.sucursales ORDER BY orden, id;
                  SELECT * FROM dbo.catalogo_publico ORDER BY id;
                  SELECT slug, nombre, pregunta, respuesta, respondida_en FROM dbo.preguntas
                   WHERE publicada = 1 AND respuesta IS NOT NULL ORDER BY respondida_en;");
            return Results.Ok(new
            {
                ajustes = Bd.Filas(await m.ReadAsync()),
                sucursales = Bd.Filas(await m.ReadAsync()),
                equipos = Bd.Filas(await m.ReadAsync(), "specs", "imgs", "atributos"),
                preguntas = Bd.Filas(await m.ReadAsync()),
            });
        });
    }
}
