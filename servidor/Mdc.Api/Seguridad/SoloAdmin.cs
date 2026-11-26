using Dapper;
using Mdc.Api.Datos;

namespace Mdc.Api.Seguridad;

/// <summary>
/// La puerta de todo lo del panel. Era es_admin() en las políticas RLS.
///
/// El token trae el rol, pero se vuelve a preguntar a la base en CADA
/// petición: si a alguien le quitan el acceso, lo pierde en ese momento y no
/// dentro de una hora, cuando caduque su token. Es una consulta por clave
/// primaria; no se nota.
/// </summary>
public sealed class SoloAdmin(Bd bd) : IEndpointFilter
{
    public const string ClaveUsuario = "mdc.usuario";

    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext ctx, EndpointFilterDelegate siguiente)
    {
        var http = ctx.HttpContext;
        if (!Guid.TryParse(http.User.FindFirst("sub")?.Value, out var id))
            return Results.Unauthorized();

        await using var c = await bd.AbrirAsync(ct: http.RequestAborted);
        var rol = await c.ExecuteScalarAsync<string?>("SELECT rol FROM dbo.usuarios WHERE id = @id", new { id });
        if (rol != "admin")
            return Results.Json(new { error = "Tu cuenta no tiene acceso al panel." }, statusCode: 403);

        http.Items[ClaveUsuario] = id;
        return await siguiente(ctx);
    }

    public static Guid Usuario(HttpContext http) => (Guid)http.Items[ClaveUsuario]!;
}
