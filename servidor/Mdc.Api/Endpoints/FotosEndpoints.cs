using System.Security.Cryptography;
using Mdc.Api.Seguridad;
using Microsoft.AspNetCore.Mvc;

namespace Mdc.Api.Endpoints;

/// <summary>
/// Las fotos de los equipos, en el disco de esta máquina. Era el bucket
/// `equipos` de Supabase Storage.
///
/// El navegador ya las manda comprimidas a WebP en dos tamaños (700 y 1400
/// px, ver admin-equipos.js); aquí sólo se comprueba que de verdad sean WebP
/// y no pesen de más, y se guardan con un nombre que nadie elige desde fuera.
/// Se sirven en /fotos/… con caché de un año: el nombre lleva la hora y un
/// aleatorio, así que una foto nueva nunca pisa a una vieja.
/// </summary>
public static class FotosEndpoints
{
    public const long PesoMaximo = 3 * 1024 * 1024;   // lo mismo que permitía el bucket

    public static string Carpeta(IConfiguration config) =>
        config["Fotos:Carpeta"] is { Length: > 0 } c ? c
        : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "MdcMaquinaria", "fotos");

    public static void Mapear(WebApplication app)
    {
        app.MapPost("/api/admin/fotos", async (HttpRequest req, IConfiguration config) =>
        {
            if (!req.HasFormContentType) return Results.BadRequest(new { error = "Se esperaba un formulario con las fotos." });
            var form = await req.ReadFormAsync(req.HttpContext.RequestAborted);
            var slug = form["slug"].ToString();
            /* El slug acaba siendo una carpeta: con el mismo filtro que la base
               (minúsculas, números, guiones) no hay forma de escribir "..\". */
            if (slug.Length is < 1 or > 120 || !slug.All(ch => ch is >= 'a' and <= 'z' or >= '0' and <= '9' or '-'))
                return Results.BadRequest(new { error = "Dirección de equipo no válida." });

            var grande = form.Files["w1400"];
            var chica = form.Files["w700"];
            if (grande is null || chica is null) return Results.BadRequest(new { error = "Faltan los dos tamaños de la foto." });

            foreach (var f in new[] { grande, chica })
            {
                if (f.Length is 0 or > PesoMaximo) return Results.BadRequest(new { error = "La foto pesa demasiado (máximo 3 MB)." });
                if (!await EsWebp(f)) return Results.BadRequest(new { error = "La foto no es una imagen WebP." });
            }

            var carpeta = Path.Combine(Carpeta(config), "equipos", slug);
            Directory.CreateDirectory(carpeta);
            var baseNombre = $"{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}-{Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(4))}";
            foreach (var (f, sufijo) in new[] { (grande, "w1400"), (chica, "w700") })
            {
                await using var destino = File.Create(Path.Combine(carpeta, $"{baseNombre}-{sufijo}.webp"));
                await f.CopyToAsync(destino, req.HttpContext.RequestAborted);
            }

            var publica = (config["Publico:UrlApi"] ?? "").TrimEnd('/');
            return Results.Ok(new { url = $"{publica}/fotos/equipos/{slug}/{baseNombre}-w1400.webp" });
        })
        .RequireAuthorization().AddEndpointFilter<SoloAdmin>()
        .DisableAntiforgery()   // la API se autentica con Bearer, no con cookies: no hay CSRF que frenar
        .WithMetadata(new RequestSizeLimitAttribute(2 * PesoMaximo + 64 * 1024));
    }

    /// <summary>Un WebP empieza con "RIFF", 4 bytes de tamaño y "WEBP". Lo demás no pasa.</summary>
    private static async Task<bool> EsWebp(IFormFile f)
    {
        var cabecera = new byte[12];
        await using var s = f.OpenReadStream();
        return await s.ReadAtLeastAsync(cabecera, 12, throwOnEndOfStream: false) == 12
            && cabecera.AsSpan(0, 4).SequenceEqual("RIFF"u8)
            && cabecera.AsSpan(8, 4).SequenceEqual("WEBP"u8);
    }
}
