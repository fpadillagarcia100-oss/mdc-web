using System.Net;
using System.Threading.RateLimiting;
using Dapper;
using Mdc.Api;
using Mdc.Api.Avisos;
using Mdc.Api.Datos;
using Mdc.Api.Endpoints;
using Mdc.Api.Seguridad;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;

/*
 * Mdc.Api — el servidor de MDC · Maquinaria de Chiapas, sobre SQL Server.
 *
 * Reemplaza a Supabase: la base (SQL Server de esta máquina), las cuentas,
 * las fotos y los avisos programados. El sitio sigue en Cloudflare Pages; lo
 * que necesita de un servidor lo pide aquí, a través de Cloudflare Tunnel.
 *
 * Escucha SÓLO en 127.0.0.1: ni la red de la oficina ni internet llegan a
 * ella directamente. La única entrada es cloudflared, que corre en esta misma
 * máquina y la publica como api.mdcmaquinaria.com con HTTPS.
 */

// Tareas de una sola vez, desde la línea de comandos (ver Consola.cs).
if (args.Length > 0 && Consola.EsComando(args[0]))
    return await Consola.Ejecutar(args);

var builder = WebApplication.CreateBuilder(args);
builder.Host.UseWindowsService(o => o.ServiceName = "MdcApi");

/* El registro va al Visor de eventos (Registros de Windows → Aplicación,
   origen MdcApi). El origen lo crea el instalador: la cuenta del servicio no
   tiene permiso para crearlo, y sin él todo se perdía en silencio — en la
   primera semana no se podía saber si un correo de aviso había salido. */
if (OperatingSystem.IsWindows())
    builder.Logging.AddEventLog(s => s.SourceName = "MdcApi");

var cfg = builder.Configuration;
builder.Services.AddSingleton<Bd>();
builder.Services.AddSingleton<Tokens>();
builder.Services.AddSingleton<Avisador>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<Avisador>());
builder.Services.AddSingleton<Programados>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<Programados>());
builder.Services.AddHttpClient("avisos", c => c.Timeout = TimeSpan.FromSeconds(15));
builder.Services.AddHttpClient(string.Empty, c => c.Timeout = TimeSpan.FromSeconds(15));

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
{
    o.MapInboundClaims = false;   // "sub" y "rol" tal cual, sin traducirlos a nombres de Microsoft
    o.TokenValidationParameters = new TokenValidationParameters
    {
        ValidIssuer = Tokens.Emisor,
        ValidAudience = Tokens.Emisor,
        IssuerSigningKey = Tokens.Llave(cfg),
        ClockSkew = TimeSpan.FromSeconds(30),
    };
});
builder.Services.AddAuthorization();

/* Sólo el sitio puede llamar desde un navegador. Las peticiones sin Origin
   (curl, la compilación de Cloudflare) no pasan por CORS y siguen sujetas a
   las mismas reglas de siempre: CORS no es seguridad, es cortesía del navegador. */
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(cfg.GetSection("Cors:Origenes").Get<string[]>() ?? ["https://mdcmaquinaria.com"])
    .WithMethods("GET", "POST", "PUT", "PATCH", "DELETE")
    .WithHeaders("Authorization", "Content-Type")
    .SetPreflightMaxAge(TimeSpan.FromHours(1))));

/* Freno por dirección IP. Es la primera capa; la segunda está en la base
   (3 cotizaciones por teléfono, 5 preguntas por equipo) y la tercera en el
   bloqueo de la cuenta tras 5 contraseñas malas. */
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.OnRejected = (ctx, ct) => new ValueTask(ctx.HttpContext.Response.WriteAsJsonAsync(
        new { error = "Demasiadas peticiones. Espera un momento." }, ct));
    o.AddPolicy("publico", http => RateLimitPartition.GetFixedWindowLimiter(Red.IpCliente(http),
        _ => new FixedWindowRateLimiterOptions { PermitLimit = cfg.GetValue("Limites:Publico", 30), Window = TimeSpan.FromMinutes(1) }));
    o.AddPolicy("acceso", http => RateLimitPartition.GetFixedWindowLimiter(Red.IpCliente(http),
        _ => new FixedWindowRateLimiterOptions { PermitLimit = cfg.GetValue("Limites:Acceso", 10), Window = TimeSpan.FromMinutes(1) }));
});

builder.Services.AddProblemDetails();

var app = builder.Build();

await Migraciones.ComprobarAsync(app.Services.GetRequiredService<Bd>(), app.Logger);

app.UseExceptionHandler(e => e.Run(async http =>
{
    /* Un JSON mal formado o con un tipo inesperado es culpa de quien llama:
       400 con un mensaje claro. Lo demás, 500 genérico y al registro. */
    var ex = http.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>()?.Error;
    var esDelCliente = ex is ArgumentException or BadHttpRequestException or System.Text.Json.JsonException;
    http.Response.StatusCode = esDelCliente ? 400 : 500;
    if (!esDelCliente) app.Logger.LogError(ex, "Error no previsto en {Ruta}", http.Request.Path);
    await http.Response.WriteAsJsonAsync(new { error = esDelCliente ? "La petición no tiene el formato correcto." : "Algo falló. Intenta de nuevo." });
}));

app.Use(async (http, siguiente) =>
{
    var h = http.Response.Headers;
    h.XContentTypeOptions = "nosniff";
    h.XFrameOptions = "DENY";
    h["Referrer-Policy"] = "no-referrer";
    await siguiente(http);
});

app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

/* Las fotos. Inmutables: el nombre lleva hora y aleatorio, nunca se reescribe.
   Sólo imágenes: aunque alguien lograra dejar otro archivo en la carpeta (un
   .html, un .svg con script), no se serviría. */
var carpetaFotos = FotosEndpoints.Carpeta(cfg);
Directory.CreateDirectory(carpetaFotos);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(carpetaFotos),
    RequestPath = "/fotos",
    ServeUnknownFileTypes = false,
    ContentTypeProvider = new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider(
        new Dictionary<string, string>
        {
            [".webp"] = "image/webp", [".avif"] = "image/avif",
            // Las fotos anteriores a la compresión en el navegador pueden venir así de Supabase.
            [".jpg"] = "image/jpeg", [".jpeg"] = "image/jpeg", [".png"] = "image/png",
        }),
    OnPrepareResponse = r =>
    {
        r.Context.Response.Headers.CacheControl = "public, max-age=31536000, immutable";
        r.Context.Response.Headers["Cross-Origin-Resource-Policy"] = "cross-origin";
    },
});

app.MapGet("/salud", async (Bd bd) =>
{
    await using var c = await bd.AbrirAsync();
    return Results.Ok(new { ok = await c.ExecuteScalarAsync<int>("SELECT 1") == 1 });
});

PublicoEndpoints.Mapear(app);
AuthEndpoints.Mapear(app);
AdminEndpoints.Mapear(app);
FotosEndpoints.Mapear(app);
UsuariosEndpoints.Mapear(app);

app.Run();
return 0;

namespace Mdc.Api
{
    public static class Red
    {
        /// <summary>
        /// La IP del visitante. Detrás de Cloudflare Tunnel todas las peticiones
        /// llegan desde 127.0.0.1 (cloudflared), y la IP real viene en
        /// CF-Connecting-IP. Esa cabecera sólo se cree si la conexión viene de
        /// esta misma máquina: de cualquier otro lado sería inventable.
        /// </summary>
        public static string IpCliente(HttpContext http)
        {
            var remota = http.Connection.RemoteIpAddress;
            if (remota is not null && IPAddress.IsLoopback(remota)
                && http.Request.Headers.TryGetValue("CF-Connecting-IP", out var real)
                && IPAddress.TryParse(real.ToString(), out var ip))
                return ip.ToString();
            return remota?.ToString() ?? "desconocida";
        }
    }
}

public partial class Program;
