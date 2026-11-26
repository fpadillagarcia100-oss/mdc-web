using Dapper;
using Mdc.Api.Datos;
using Mdc.Api.Seguridad;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.SqlClient;

namespace Mdc.Api.Endpoints;

/// <summary>
/// Entrar, renovar, salir y aceptar una invitación. Reemplaza a /auth/v1 de
/// Supabase con el mismo comportamiento que esperaba el panel.
/// </summary>
public static class AuthEndpoints
{
    public sealed record Usuario(Guid id, string correo, string nombre, string rol,
        string? hash_contrasena, int intentos_fallidos, DateTimeOffset? bloqueado_hasta);

    public record Entrada(string? correo, string? contrasena);
    public record Renovacion(string? refresh_token);
    public record Aceptacion(string? token, string? contrasena);

    private const int MaxIntentos = 5;
    private static readonly TimeSpan Bloqueo = TimeSpan.FromMinutes(15);
    public const int LargoMinimo = 10;

    /* Un solo mensaje para "no existe", "contraseña mala" y "aún no aceptó la
       invitación": distinguirlos le diría a un atacante qué correos son cuentas. */
    private static readonly object Incorrecto = new { error = "Correo o contraseña incorrectos." };

    private static readonly PasswordHasher<Usuario> Hasher = new();
    // Un hash real de una contraseña que nadie conoce, sólo para gastar el mismo tiempo.
    private static readonly string HashFalso = Hasher.HashPassword(null!, Guid.NewGuid().ToString());

    public static void Mapear(WebApplication app)
    {
        var g = app.MapGroup("/api/auth").RequireRateLimiting("acceso");

        g.MapPost("/entrar", async (Entrada e, Bd bd, Tokens tokens, ILogger<Program> log, CancellationToken ct) =>
        {
            var correo = (e.correo ?? "").Trim().ToLowerInvariant();
            var clave = e.contrasena ?? "";
            await using var c = await bd.AbrirAsync(ct: ct);
            var u = await c.QuerySingleOrDefaultAsync<Usuario>(
                "SELECT id, correo, nombre, rol, hash_contrasena, intentos_fallidos, bloqueado_hasta FROM dbo.usuarios WHERE correo = @correo",
                new { correo });

            if (u?.bloqueado_hasta > DateTimeOffset.UtcNow)
                return Results.Json(new { error = "Demasiados intentos. Espera unos minutos." }, statusCode: 429);

            if (u?.hash_contrasena is null)
            {
                // Se calcula un hash igual, para que "no existe" tarde lo mismo que "existe".
                Hasher.VerifyHashedPassword(null!, HashFalso, clave);
                return Results.Json(Incorrecto, statusCode: 400);
            }

            var resultado = Hasher.VerifyHashedPassword(u, u.hash_contrasena, clave);
            if (resultado == PasswordVerificationResult.Failed)
            {
                var intentos = u.intentos_fallidos + 1;
                await c.ExecuteAsync(intentos >= MaxIntentos
                    ? "UPDATE dbo.usuarios SET intentos_fallidos = 0, bloqueado_hasta = @hasta WHERE id = @id"
                    : "UPDATE dbo.usuarios SET intentos_fallidos = @intentos WHERE id = @id",
                    new { u.id, intentos, hasta = DateTimeOffset.UtcNow.Add(Bloqueo) });
                log.LogWarning("Contraseña incorrecta para {Usuario} (intento {N})", u.id, intentos);
                return Results.Json(Incorrecto, statusCode: 400);
            }

            /* Si el algoritmo de hash se endureció desde que se guardó, se
               aprovecha que tenemos la contraseña en claro para actualizarlo. */
            var nuevoHash = resultado == PasswordVerificationResult.SuccessRehashNeeded
                ? Hasher.HashPassword(u, clave) : u.hash_contrasena;
            await c.ExecuteAsync(
                "UPDATE dbo.usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, hash_contrasena = @nuevoHash WHERE id = @id",
                new { u.id, nuevoHash });

            return Results.Ok(await AbrirSesion(c, tokens, u));
        });

        g.MapPost("/renovar", async (Renovacion r, Bd bd, Tokens tokens, ILogger<Program> log, CancellationToken ct) =>
        {
            if (string.IsNullOrEmpty(r.refresh_token)) return Results.Unauthorized();
            var hash = Tokens.Hash(r.refresh_token);
            await using var c = await bd.AbrirAsync(ct: ct);
            var s = await c.QuerySingleOrDefaultAsync<(long id, Guid usuario_id, DateTimeOffset expira, bool revocada)>(
                "SELECT id, usuario_id, expira, revocada FROM dbo.sesiones WHERE token_hash = @hash", new { hash });
            if (s.id == 0) return Results.Unauthorized();

            /* Un token de renovación sólo se usa una vez: al usarlo se cambia
               por otro. Si llega uno ya gastado, alguien más lo tiene. No se
               sabe quién es el legítimo, así que se cierran TODAS las sesiones
               de esa cuenta y que vuelva a entrar quien sepa la contraseña. */
            if (s.revocada)
            {
                await c.ExecuteAsync("UPDATE dbo.sesiones SET revocada = 1 WHERE usuario_id = @usuario_id", new { s.usuario_id });
                log.LogWarning("Token de renovación reutilizado para {Usuario}: sesiones cerradas", s.usuario_id);
                return Results.Unauthorized();
            }
            if (s.expira < DateTimeOffset.UtcNow) return Results.Unauthorized();

            await c.ExecuteAsync("UPDATE dbo.sesiones SET revocada = 1 WHERE id = @id", new { s.id });
            var u = await c.QuerySingleAsync<Usuario>(
                "SELECT id, correo, nombre, rol, hash_contrasena, intentos_fallidos, bloqueado_hasta FROM dbo.usuarios WHERE id = @usuario_id",
                new { s.usuario_id });
            return Results.Ok(await AbrirSesion(c, tokens, u));
        });

        g.MapPost("/salir", async (Renovacion r, Bd bd, CancellationToken ct) =>
        {
            if (!string.IsNullOrEmpty(r.refresh_token))
            {
                await using var c = await bd.AbrirAsync(ct: ct);
                await c.ExecuteAsync("UPDATE dbo.sesiones SET revocada = 1 WHERE token_hash = @h", new { h = Tokens.Hash(r.refresh_token) });
            }
            return Results.NoContent();
        });

        g.MapGet("/yo", async (HttpContext http, Bd bd, CancellationToken ct) =>
        {
            if (!Guid.TryParse(http.User.FindFirst("sub")?.Value, out var id)) return Results.Unauthorized();
            await using var c = await bd.AbrirAsync(ct: ct);
            var u = await c.QuerySingleOrDefaultAsync("SELECT id, correo, nombre, rol FROM dbo.usuarios WHERE id = @id", new { id });
            return u is null ? Results.Unauthorized() : Results.Ok(Bd.Fila(u));
        }).RequireAuthorization();

        /* La invitación: el enlace del correo trae un token; quien lo abre
           elige su contraseña aquí. La contraseña nunca pasó por nadie más. */
        g.MapPost("/aceptar-invitacion", async (Aceptacion a, Bd bd, Tokens tokens, CancellationToken ct) =>
        {
            if (string.IsNullOrEmpty(a.token)) return Results.BadRequest(new { error = "El enlace no es válido." });
            var clave = a.contrasena ?? "";
            if (clave.Length < LargoMinimo)
                return Results.BadRequest(new { error = $"La contraseña debe tener al menos {LargoMinimo} caracteres." });

            await using var c = await bd.AbrirAsync(ct: ct);
            var u = await c.QuerySingleOrDefaultAsync<Usuario>(
                @"SELECT id, correo, nombre, rol, hash_contrasena, intentos_fallidos, bloqueado_hasta FROM dbo.usuarios
                  WHERE invitacion_hash = @h AND invitacion_expira > SYSDATETIMEOFFSET()",
                new { h = Tokens.Hash(a.token) });
            if (u is null)
                return Results.BadRequest(new { error = "El enlace caducó o ya se usó. Pide otra invitación." });

            var hash = Hasher.HashPassword(u, clave);
            await c.ExecuteAsync(
                "UPDATE dbo.usuarios SET hash_contrasena = @hash, invitacion_hash = NULL, invitacion_expira = NULL WHERE id = @id",
                new { hash, u.id });
            return Results.Ok(await AbrirSesion(c, tokens, u with { hash_contrasena = hash }));
        });
    }

    private static async Task<object> AbrirSesion(SqlConnection c, Tokens tokens, Usuario u)
    {
        var renovacion = Tokens.Aleatorio();
        await c.ExecuteAsync(
            "INSERT INTO dbo.sesiones (usuario_id, token_hash, expira) VALUES (@id, @h, @expira)",
            new { u.id, h = Tokens.Hash(renovacion), expira = DateTimeOffset.UtcNow.Add(Tokens.VidaRenovacion) });
        return new
        {
            access_token = tokens.Acceso(u.id, u.rol),
            refresh_token = renovacion,
            expires_in = (int)Tokens.VidaAcceso.TotalSeconds,
            usuario = new { u.id, u.correo, u.nombre, u.rol },
        };
    }

    /// <summary>Para crear el primer administrador desde la línea de comandos.</summary>
    public static string HashDe(string contrasena) => Hasher.HashPassword(null!, contrasena);
}
