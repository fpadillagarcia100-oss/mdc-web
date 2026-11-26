using System.Net.Http.Json;
using System.Threading.Channels;

namespace Mdc.Api.Avisos;

/// <summary>
/// Manda los correos de aviso SIN que el cliente espere.
///
/// Antes lo hacía Supabase con pg_net desde un disparador: al insertar una
/// cotización, la base hacía un POST a /api/aviso-solicitud (una función de
/// Cloudflare que arma el correo y lo manda por Resend). Aquí la API hace
/// exactamente el mismo POST, con el mismo cuerpo {type, table, record} y la
/// misma cabecera x-aviso-secreto, así que las plantillas, la llave de Resend
/// y el destinatario siguen viviendo donde estaban y no cambian.
///
/// Va por una cola: la cotización ya está guardada, y el cliente no tiene por
/// qué esperar a que Cloudflare y Resend contesten. Si el aviso falla se
/// registra y se sigue: el aviso es una ayuda, el registro es la base.
/// </summary>
public sealed class Avisador(IHttpClientFactory http, IConfiguration config, ILogger<Avisador> log) : BackgroundService
{
    public sealed record Aviso(string Ruta, object Cuerpo);

    private readonly Channel<Aviso> cola = Channel.CreateBounded<Aviso>(new BoundedChannelOptions(200)
    {
        // Si se juntan 200 sin mandar, algo está muy mal afuera; perder avisos
        // viejos es mejor que llenar la memoria del servicio.
        FullMode = BoundedChannelFullMode.DropOldest,
    });

    public bool Configurado => !string.IsNullOrEmpty(config["Avisos:Secreto"]) && !string.IsNullOrEmpty(config["Avisos:UrlSitio"]);

    /// <summary>Encola un aviso. Nunca lanza y nunca espera.</summary>
    public void Encolar(string ruta, object cuerpo)
    {
        if (Configurado) cola.Writer.TryWrite(new Aviso(ruta, cuerpo));
    }

    /// <summary>Encola el aviso de una fila nueva, con la forma que mandaba pg_net.</summary>
    public void FilaNueva(string tabla, string ruta, object registro) =>
        Encolar(ruta, new { type = "INSERT", table = tabla, record = registro });

    protected override async Task ExecuteAsync(CancellationToken alto)
    {
        await foreach (var aviso in cola.Reader.ReadAllAsync(alto))
        {
            try
            {
                using var cliente = http.CreateClient("avisos");
                using var req = new HttpRequestMessage(HttpMethod.Post,
                    new Uri(new Uri(config["Avisos:UrlSitio"]!), aviso.Ruta))
                {
                    Content = JsonContent.Create(aviso.Cuerpo),
                };
                req.Headers.Add("x-aviso-secreto", config["Avisos:Secreto"]);
                using var r = await cliente.SendAsync(req, alto);
                if (!r.IsSuccessStatusCode)
                    log.LogWarning("Aviso {Ruta}: el sitio respondió {Codigo}", aviso.Ruta, (int)r.StatusCode);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                log.LogWarning(ex, "Aviso {Ruta}: no se pudo mandar", aviso.Ruta);
            }
        }
    }
}
