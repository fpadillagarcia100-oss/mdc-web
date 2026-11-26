using System.Text.Json;
using Dapper;
using Mdc.Api.Datos;
using Mdc.Api.Seguridad;
using Microsoft.Data.SqlClient;

namespace Mdc.Api.Endpoints;

/// <summary>
/// El panel de administración: catálogo, ajustes, sucursales, la bandeja de
/// cotizaciones y preguntas, y las métricas. Todo detrás de SoloAdmin.
///
/// Las filas van y vienen con los nombres de columna de la base (los mismos
/// que daba Supabase), así que equipoDesdeFila() y filaDesdeEquipo() en
/// assets/js/remoto.js siguen sirviendo tal cual.
/// </summary>
public static class AdminEndpoints
{
    private static readonly string[] JsonEquipos = ["especificaciones", "imagenes", "atributos"];

    private static readonly Columnas ColEquipos = new(
        "slug", "nombre", "marca", "categoria", "condicion", "precio_cents", "precio_anterior_cents",
        "financiamiento", "arrendamiento", "envio_incluido", "ubicacion", "anio", "especificaciones",
        "descripcion", "imagenes", "icono", "destacado", "publicado", "disponibilidad", "video_url", "atributos")
    { Json = [.. JsonEquipos] };

    private static readonly Columnas ColAjustes = new(
        "marca_completa", "marca_principal", "marca_acento", "color_acento", "logo_url", "telefono",
        "whatsapp", "correo", "direccion", "horario", "barra_superior", "hero_etiqueta", "hero_titulo",
        "hero_resaltado", "hero_texto", "hero_imagen", "vendedor", "pie_descripcion");

    private static readonly string[] Obligatorias =
        ["slug", "nombre", "marca", "categoria", "condicion", "precio_cents", "ubicacion", "anio"];

    public record CambioEstado(string? estado);
    public record Respuesta(string? respuesta, bool? publicada);

    public static void Mapear(WebApplication app)
    {
        var g = app.MapGroup("/api/admin").RequireAuthorization().AddEndpointFilter<SoloAdmin>();

        /* ── Todo lo que el panel necesita al abrirse ── */
        g.MapGet("/todo", async (HttpContext http, Bd bd) =>
        {
            await using var c = await bd.AbrirAsync(ct: http.RequestAborted);
            using var m = await c.QueryMultipleAsync(
                @"SELECT * FROM dbo.equipos ORDER BY id;
                  SELECT * FROM dbo.ajustes;
                  SELECT * FROM dbo.sucursales ORDER BY orden, id;");
            return Results.Ok(new
            {
                equipos = Bd.Filas(await m.ReadAsync(), JsonEquipos),
                ajustes = Bd.Filas(await m.ReadAsync()).FirstOrDefault(),
                sucursales = Bd.Filas(await m.ReadAsync()),
            });
        });

        /* ── Equipos ── */
        g.MapPost("/equipos", async (JsonElement cuerpo, HttpContext http, Bd bd, ILogger<Program> log) =>
        {
            var (nombres, valores) = ColEquipos.Leer(cuerpo);
            var faltan = Obligatorias.Except(nombres).ToList();
            if (faltan.Count > 0) return Results.BadRequest(new { error = "Faltan datos: " + string.Join(", ", faltan) });
            try
            {
                await using var c = await bd.AbrirAsync(SoloAdmin.Usuario(http), http.RequestAborted);
                /* Sin OUTPUT: la tabla tiene disparadores, y SQL Server no deja
                   OUTPUT sin INTO en ese caso. SCOPE_IDENTITY() sí es de este
                   INSERT (los disparadores no crean filas en equipos). */
                var id = await c.ExecuteScalarAsync<long>(
                    $"INSERT INTO dbo.equipos ({string.Join(", ", nombres)}) VALUES ({string.Join(", ", nombres.Select(n => "@" + n))}); SELECT CAST(SCOPE_IDENTITY() AS BIGINT);",
                    valores);
                return Results.Ok(await Equipo(c, id));
            }
            catch (SqlException ex) { return Errores.Responder(ex, log); }
        });

        g.MapPut("/equipos/{id:long}", async (long id, JsonElement cuerpo, HttpContext http, Bd bd, ILogger<Program> log) =>
        {
            var (nombres, valores) = ColEquipos.Leer(cuerpo);
            if (nombres.Count == 0) return Results.BadRequest(new { error = "No hay nada que guardar." });
            valores.Add("id", id);
            try
            {
                await using var c = await bd.AbrirAsync(SoloAdmin.Usuario(http), http.RequestAborted);
                var n = await c.ExecuteAsync(
                    $"UPDATE dbo.equipos SET {string.Join(", ", nombres.Select(x => $"{x} = @{x}"))} WHERE id = @id", valores);
                return n == 0 ? Results.NotFound(new { error = "Ese equipo ya no existe." }) : Results.Ok(await Equipo(c, id));
            }
            catch (SqlException ex) { return Errores.Responder(ex, log); }
        });

        g.MapDelete("/equipos/{id:long}", async (long id, HttpContext http, Bd bd, ILogger<Program> log) =>
        {
            try
            {
                await using var c = await bd.AbrirAsync(SoloAdmin.Usuario(http), http.RequestAborted);
                var n = await c.ExecuteAsync("DELETE FROM dbo.equipos WHERE id = @id", new { id });
                return n == 0 ? Results.NotFound(new { error = "Ese equipo ya no existe." }) : Results.NoContent();
            }
            catch (SqlException ex) { return Errores.Responder(ex, log); }
        });

        /* ── Ajustes (una sola fila) ── */
        g.MapPut("/ajustes", async (JsonElement cuerpo, HttpContext http, Bd bd, ILogger<Program> log) =>
        {
            var (nombres, valores) = ColAjustes.Leer(cuerpo);
            if (nombres.Count == 0) return Results.BadRequest(new { error = "No hay nada que guardar." });
            try
            {
                await using var c = await bd.AbrirAsync(SoloAdmin.Usuario(http), http.RequestAborted);
                await c.ExecuteAsync(
                    $"UPDATE dbo.ajustes SET {string.Join(", ", nombres.Select(x => $"{x} = @{x}"))}, actualizado_en = SYSDATETIMEOFFSET() WHERE id = 1",
                    valores);
                return Results.Ok(Bd.Fila(await c.QuerySingleAsync("SELECT * FROM dbo.ajustes")));
            }
            catch (SqlException ex) { return Errores.Responder(ex, log); }
        });

        /* ── Sucursales: se reemplaza la lista entera, en una transacción ──
           Antes eran un DELETE y un POST sueltos: si el segundo fallaba, la
           empresa se quedaba sin sucursales. Aquí o se guarda todo o nada. */
        g.MapPut("/sucursales", async (JsonElement cuerpo, HttpContext http, Bd bd, ILogger<Program> log) =>
        {
            if (cuerpo.ValueKind != JsonValueKind.Array || cuerpo.GetArrayLength() > 50)
                return Results.BadRequest(new { error = "Se esperaba la lista de sucursales." });
            var col = new Columnas("nombre", "direccion", "telefono", "horario");
            await using var c = await bd.AbrirAsync(SoloAdmin.Usuario(http), http.RequestAborted);
            await using var t = await c.BeginTransactionAsync(http.RequestAborted);
            try
            {
                await c.ExecuteAsync("DELETE FROM dbo.sucursales", transaction: t);
                short orden = 0;
                foreach (var s in cuerpo.EnumerateArray())
                {
                    var (_, v) = col.Leer(s);
                    v.Add("orden", orden++);
                    await c.ExecuteAsync(
                        "INSERT INTO dbo.sucursales (nombre, direccion, telefono, horario, orden) VALUES (@nombre, @direccion, @telefono, ISNULL(@horario, N''), @orden)",
                        v, t);
                }
                await t.CommitAsync(http.RequestAborted);
            }
            catch (SqlException ex) { await t.RollbackAsync(); return Errores.Responder(ex, log); }
            return Results.Ok(Bd.Filas(await c.QueryAsync("SELECT * FROM dbo.sucursales ORDER BY orden, id")));
        });

        /* ── Cotizaciones ── */
        g.MapGet("/solicitudes", async (string? estado, HttpContext http, Bd bd) =>
        {
            await using var c = await bd.AbrirAsync(ct: http.RequestAborted);
            var filas = await c.QueryAsync(
                @"SELECT TOP 200 * FROM dbo.solicitudes WHERE (@estado IS NULL OR estado = @estado) ORDER BY creado_en DESC",
                new { estado });
            return Results.Ok(Bd.Filas(filas, "carrito"));
        });

        g.MapPatch("/solicitudes/{id:long}", async (long id, CambioEstado e, HttpContext http, Bd bd, ILogger<Program> log) =>
        {
            try
            {
                await using var c = await bd.AbrirAsync(SoloAdmin.Usuario(http), http.RequestAborted);
                var n = await c.ExecuteAsync("UPDATE dbo.solicitudes SET estado = @estado WHERE id = @id", new { id, e.estado });
                return n == 0 ? Results.NotFound() : Results.NoContent();
            }
            catch (SqlException ex) { return Errores.Responder(ex, log); }
        });

        /* ── Preguntas ── */
        g.MapGet("/preguntas", async (HttpContext http, Bd bd) =>
        {
            await using var c = await bd.AbrirAsync(ct: http.RequestAborted);
            return Results.Ok(Bd.Filas(await c.QueryAsync("SELECT TOP 300 * FROM dbo.preguntas ORDER BY creado_en DESC")));
        });

        g.MapPatch("/preguntas/{id:long}", async (long id, Respuesta r, HttpContext http, Bd bd, ILogger<Program> log) =>
        {
            var respuesta = string.IsNullOrWhiteSpace(r.respuesta) ? null : r.respuesta.Trim();
            try
            {
                await using var c = await bd.AbrirAsync(SoloAdmin.Usuario(http), http.RequestAborted);
                /* La fecha de respuesta la pone la base, no el navegador: con
                   el reloj de una computadora mal puesta, las preguntas
                   saldrían ordenadas al revés en la ficha. Y sólo la primera
                   vez: es cuándo se atendió, no cuándo se corrigió una errata
                   tres semanas después. No se publica lo que no tiene respuesta. */
                var n = await c.ExecuteAsync(
                    @"UPDATE dbo.preguntas SET
                        respuesta = @respuesta,
                        publicada = IIF(@respuesta IS NULL, 0, @publicada),
                        respondida_en = CASE WHEN @respuesta IS NULL THEN NULL
                                             WHEN respondida_en IS NULL THEN SYSDATETIMEOFFSET()
                                             ELSE respondida_en END
                      WHERE id = @id",
                    new { id, respuesta, publicada = r.publicada ?? false });
                return n == 0 ? Results.NotFound() : Results.Ok(Bd.Fila(await c.QuerySingleAsync("SELECT * FROM dbo.preguntas WHERE id = @id", new { id })));
            }
            catch (SqlException ex) { return Errores.Responder(ex, log); }
        });

        g.MapDelete("/preguntas/{id:long}", async (long id, HttpContext http, Bd bd) =>
        {
            await using var c = await bd.AbrirAsync(SoloAdmin.Usuario(http), http.RequestAborted);
            await c.ExecuteAsync("DELETE FROM dbo.preguntas WHERE id = @id", new { id });
            return Results.NoContent();
        });

        /* ── Métricas ── */
        g.MapGet("/metricas", async (HttpContext http, Bd bd) =>
        {
            await using var c = await bd.AbrirAsync(ct: http.RequestAborted);
            return Results.Ok(Bd.Filas(await c.QueryAsync("SELECT * FROM dbo.metricas ORDER BY vistas DESC")));
        });
    }

    private static async Task<Dictionary<string, object?>?> Equipo(SqlConnection c, long id) =>
        Bd.Fila(await c.QuerySingleOrDefaultAsync("SELECT * FROM dbo.equipos WHERE id = @id", new { id }), JsonEquipos);
}
