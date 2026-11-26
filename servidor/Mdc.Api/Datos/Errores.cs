using Microsoft.Data.SqlClient;

namespace Mdc.Api.Datos;

/// <summary>
/// Errores de la base → respuestas que una persona entiende.
///
/// Los THROW 51xxx de los procedimientos y disparadores ya vienen escritos
/// para el usuario ("Demasiadas solicitudes seguidas…"): se dejan pasar tal
/// cual. Las restricciones CHECK traen su nombre técnico; se traducen al
/// campo que falló, que es lo que el panel necesita para marcarlo en rojo.
/// Cualquier otra cosa se registra y se responde con un mensaje genérico:
/// el detalle de un error de SQL le dice demasiado a quien no debe.
/// </summary>
public static class Errores
{
    private static readonly Dictionary<string, string> Campos = new()
    {
        ["ck_equipos_slug"] = "La dirección del equipo sólo admite minúsculas, números y guiones.",
        ["ck_equipos_nombre"] = "El nombre debe tener entre 3 y 160 caracteres.",
        ["ck_equipos_marca"] = "Escribe la marca.",
        ["ck_equipos_categoria"] = "Escribe la categoría.",
        ["ck_equipos_condicion"] = "La condición debe ser Nuevo, Usado o Renta.",
        ["ck_equipos_precio"] = "El precio no puede ser negativo.",
        ["ck_equipos_anterior"] = "El precio anterior debe ser mayor que el actual.",
        ["ck_equipos_ubicacion"] = "Escribe la ubicación.",
        ["ck_equipos_anio"] = "El año debe estar entre 1970 y 2100.",
        ["ck_equipos_specs"] = "Las especificaciones no tienen el formato correcto.",
        ["ck_equipos_imgs"] = "La galería no tiene el formato correcto.",
        ["ck_equipos_img_url"] = "Una de las fotos no es una dirección segura (https).",
        ["ck_equipos_attr"] = "La ficha técnica es demasiado grande.",
        ["ck_equipos_disp"] = "La disponibilidad no es válida.",
        ["ck_equipos_video"] = "Ese video no es de YouTube.",
        ["ck_sucursales_nombre"] = "Cada sucursal necesita un nombre.",
        ["ck_sucursales_direccion"] = "Cada sucursal necesita una dirección.",
        ["ck_sucursales_telefono"] = "El teléfono de una sucursal sólo admite números, espacios, +, ( ) y guiones.",
        ["ck_ajustes_color"] = "El color debe ser #RRGGBB.",
        ["ck_ajustes_wa"] = "El WhatsApp sólo admite números.",
        ["ck_ajustes_mp"] = "La marca necesita al menos un carácter.",
        ["ck_sol_telefono"] = "El teléfono debe tener 10 dígitos.",
        ["ck_sol_nombre"] = "Escribe tu nombre.",
        ["ck_sol_correo"] = "Ese correo no parece válido.",
        ["ck_sol_tipo"] = "Tipo de solicitud no válido.",
        ["ck_sol_carrito"] = "La cotización no tiene el formato correcto.",
        ["ck_sol_estado"] = "Estado no válido.",
        ["ck_preg_respuesta"] = "La respuesta debe tener entre 1 y 1000 caracteres.",
        ["ck_usuarios_nombre"] = "El nombre debe tener entre 2 y 120 caracteres.",
        ["ck_usuarios_correo"] = "Ese correo no parece válido.",
        ["ck_usuarios_rol"] = "Rol no válido.",
    };

    public static IResult Responder(SqlException ex, ILogger log)
    {
        // THROW con número propio (51000–51999): el mensaje ya es para el usuario.
        if (ex.Number is >= 51000 and < 52000)
            return Results.BadRequest(new { error = ex.Message });

        // 547: una restricción CHECK o FOREIGN KEY.
        if (ex.Number == 547)
        {
            foreach (var (restriccion, mensaje) in Campos)
                if (ex.Message.Contains(restriccion, StringComparison.Ordinal))
                    return Results.BadRequest(new { error = mensaje, restriccion });
            return Results.BadRequest(new { error = "Algún dato no tiene el formato correcto." });
        }

        // 2627/2601: clave única repetida.
        if (ex.Number is 2627 or 2601)
        {
            var que = ex.Message.Contains("uq_equipos_slug") ? "Ya hay un equipo con esa dirección."
                    : ex.Message.Contains("uq_usuarios_correo") ? "Ya hay una cuenta con ese correo."
                    : "Ese registro ya existe.";
            return Results.Conflict(new { error = que });
        }

        // 2628/8152: texto más largo que la columna.
        if (ex.Number is 2628 or 8152)
            return Results.BadRequest(new { error = "Algún texto es demasiado largo." });

        log.LogError(ex, "Error de SQL no previsto ({Numero})", ex.Number);
        return Results.Problem("No se pudo completar la operación.", statusCode: 500);
    }
}
