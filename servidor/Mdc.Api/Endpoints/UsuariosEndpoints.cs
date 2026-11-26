using Dapper;
using Mdc.Api.Avisos;
using Mdc.Api.Datos;
using Mdc.Api.Seguridad;
using Microsoft.Data.SqlClient;

namespace Mdc.Api.Endpoints;

/// <summary>
/// Quién puede entrar al panel, y publicar el sitio. Reemplazan a las
/// funciones de Cloudflare functions/api/usuarios.js y publicar.js, con las
/// mismas respuestas para que el panel no note la diferencia.
/// </summary>
public static class UsuariosEndpoints
{
    public record Invitacion(string? correo, string? nombre, string? rol);
    public record Cambio(string? id, string? rol);

    private static readonly TimeSpan VidaInvitacion = TimeSpan.FromDays(7);
    private static readonly TimeSpan EsperaPublicar = TimeSpan.FromMinutes(2);
    private static DateTimeOffset ultimaPublicacion = DateTimeOffset.MinValue;
    private static readonly Lock CerrojoPublicar = new();

    public static void Mapear(WebApplication app)
    {
        var g = app.MapGroup("/api/admin").RequireAuthorization().AddEndpointFilter<SoloAdmin>();

        g.MapGet("/usuarios", async (HttpContext http, Bd bd) =>
        {
            await using var c = await bd.AbrirAsync(ct: http.RequestAborted);
            var filas = await c.QueryAsync(
                @"SELECT id, correo, nombre, rol, CAST(IIF(hash_contrasena IS NULL, 0, 1) AS BIT) AS confirmado, creado_en AS creado
                  FROM dbo.usuarios ORDER BY IIF(rol = 'admin', 0, 1), correo");
            return Results.Ok(new { usuarios = Bd.Filas(filas) });
        });

        /* Se invita, no se crea con contraseña: la elige quien la va a usar,
           con el enlace que le llega por correo, y no pasa por nadie más. */
        g.MapPost("/usuarios", async (Invitacion i, HttpContext http, Bd bd, Avisador avisador, IConfiguration config, ILogger<Program> log) =>
        {
            var correo = (i.correo ?? "").Trim().ToLowerInvariant();
            var nombre = (i.nombre ?? "").Trim();
            var rol = i.rol == "admin" ? "admin" : "staff";
            if (!correo.Contains('@') || correo.Length > 254) return Results.BadRequest(new { error = "Ese correo no parece válido." });
            if (nombre.Length < 2) return Results.BadRequest(new { error = "Escribe el nombre de la persona." });
            if (!avisador.Configurado)
                return Results.Json(new { error = "Los correos no están configurados: la invitación no llegaría." }, statusCode: 503);

            var token = Tokens.Aleatorio();
            try
            {
                await using var c = await bd.AbrirAsync(SoloAdmin.Usuario(http), http.RequestAborted);
                await c.ExecuteAsync(
                    @"INSERT INTO dbo.usuarios (correo, nombre, rol, invitacion_hash, invitacion_expira)
                      VALUES (@correo, @nombre, @rol, @h, @expira)",
                    new { correo, nombre, rol, h = Tokens.Hash(token), expira = DateTimeOffset.UtcNow.Add(VidaInvitacion) });
            }
            catch (SqlException ex) { return Errores.Responder(ex, log); }

            var sitio = (config["Publico:UrlSitio"] ?? "").TrimEnd('/');
            avisador.Encolar("/api/aviso-invitacion", new
            {
                correo, nombre,
                enlace = $"{sitio}/?invitacion={token}",
                dias = (int)VidaInvitacion.TotalDays,
            });
            return Results.Json(new { ok = true, mensaje = $"Invitación enviada a {correo}." }, statusCode: 201);
        });

        g.MapPatch("/usuarios", async (Cambio k, HttpContext http, Bd bd, ILogger<Program> log) =>
        {
            if (!Guid.TryParse(k.id, out var id)) return Results.BadRequest(new { error = "Falta el usuario." });
            /* Cambiarse el rol a sí mismo deja a esa persona fuera del panel al
               instante, con la sesión abierta y creyendo que sigue dentro. */
            if (id == SoloAdmin.Usuario(http)) return Results.BadRequest(new { error = "No puedes cambiar tu propio rol." });
            var rol = k.rol == "admin" ? "admin" : "staff";
            try
            {
                await using var c = await bd.AbrirAsync(SoloAdmin.Usuario(http), http.RequestAborted);
                await c.ExecuteAsync("UPDATE dbo.usuarios SET rol = @rol WHERE id = @id", new { id, rol });
                if (rol != "admin")   // fuera del panel también fuera de sus sesiones abiertas
                    await c.ExecuteAsync("UPDATE dbo.sesiones SET revocada = 1 WHERE usuario_id = @id", new { id });
            }
            catch (SqlException ex) when (ex.Number == 51001)
            {
                return Results.Conflict(new { error = "Es el único administrador. Nombra otro antes de quitarle el acceso." });
            }
            catch (SqlException ex) { return Errores.Responder(ex, log); }
            return Results.Ok(new { ok = true });
        });

        g.MapDelete("/usuarios", async (HttpContext http, Bd bd, ILogger<Program> log) =>
        {
            var k = await http.Request.ReadFromJsonAsync<Cambio>(http.RequestAborted);
            if (!Guid.TryParse(k?.id, out var id)) return Results.BadRequest(new { error = "Falta el usuario." });
            if (id == SoloAdmin.Usuario(http)) return Results.BadRequest(new { error = "No puedes eliminar tu propia cuenta." });
            try
            {
                await using var c = await bd.AbrirAsync(SoloAdmin.Usuario(http), http.RequestAborted);
                await c.ExecuteAsync("DELETE FROM dbo.usuarios WHERE id = @id", new { id });
            }
            catch (SqlException ex) when (ex.Number == 51001)
            {
                return Results.Conflict(new { error = "Es el único administrador. Nombra otro antes de eliminarlo." });
            }
            catch (SqlException ex) { return Errores.Responder(ex, log); }
            return Results.Ok(new { ok = true });
        });

        /* Publicar: dispara la compilación en Cloudflare, que lee el catálogo
           de esta API (/api/catalogo) y regenera el sitio. La espera de dos
           minutos también vive aquí, no sólo en el botón: cada disparo gasta
           una de las 500 compilaciones del mes, y dos seguidos dan un 502. */
        g.MapPost("/publicar", async (IHttpClientFactory fabrica, IConfiguration config, ILogger<Program> log) =>
        {
            var hook = config["Publicar:DeployHook"];
            if (string.IsNullOrEmpty(hook)) return Results.Json(new { error = "Publicar no está configurado." }, statusCode: 503);
            lock (CerrojoPublicar)
            {
                var restan = EsperaPublicar - (DateTimeOffset.UtcNow - ultimaPublicacion);
                if (restan > TimeSpan.Zero)
                    return Results.Json(new { error = $"Ya se está publicando. Espera {Math.Ceiling(restan.TotalSeconds)} s." }, statusCode: 429);
                ultimaPublicacion = DateTimeOffset.UtcNow;
            }
            try
            {
                using var r = await fabrica.CreateClient().PostAsync(hook, null);
                if (!r.IsSuccessStatusCode)
                {
                    log.LogError("Publicar: el hook respondió {Codigo}", (int)r.StatusCode);
                    lock (CerrojoPublicar) ultimaPublicacion = DateTimeOffset.MinValue;
                    return Results.Json(new { error = "Cloudflare no aceptó la petición. Intenta de nuevo." }, statusCode: 502);
                }
            }
            catch (HttpRequestException ex)
            {
                log.LogError(ex, "Publicar: no se pudo llamar al hook");
                lock (CerrojoPublicar) ultimaPublicacion = DateTimeOffset.MinValue;
                return Results.Json(new { error = "No se pudo publicar. Intenta de nuevo en un momento." }, statusCode: 502);
            }
            return Results.Json(new { ok = true, mensaje = "Publicando. El sitio se actualiza en un par de minutos." }, statusCode: 202);
        });
    }
}
