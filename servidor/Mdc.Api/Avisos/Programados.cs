using Dapper;
using Mdc.Api.Datos;

namespace Mdc.Api.Avisos;

/// <summary>
/// Los dos correos que se mandan solos. Antes eran trabajos de pg_cron:
///
/// · Cada día a las 9:00 (hora de Chiapas): lo que lleva más de 24 horas sin
///   atender —cotizaciones "nuevas" y preguntas sin respuesta—, 20 de cada
///   una como mucho. Si no hay nada pendiente, no se manda nada: un aviso
///   diario que dice "todo al día" se deja de abrir.
/// · Cada lunes a las 8:00: los 10 equipos más vistos de la semana y totales.
///
/// El cuerpo es el mismo que armaba la base ({tipo:'pendientes'|'semanal',…})
/// y va al mismo /api/aviso-resumen de Cloudflare.
/// </summary>
public sealed class Programados(Bd bd, Avisador avisador, ILogger<Programados> log) : BackgroundService
{
    /* Chiapas no cambia de horario: UTC-6 todo el año, como Ciudad de México
       desde 2022. Se usa la zona por nombre por si eso vuelve a cambiar. */
    private static readonly TimeZoneInfo Zona = TimeZoneInfo.FindSystemTimeZoneById("America/Mexico_City");

    protected override async Task ExecuteAsync(CancellationToken alto)
    {
        while (!alto.IsCancellationRequested)
        {
            var ahora = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, Zona);
            var diario = Siguiente(ahora, 9, null);
            var semanal = Siguiente(ahora, 8, DayOfWeek.Monday);
            var (cuando, cual) = diario <= semanal ? (diario, "pendientes") : (semanal, "semanal");

            try { await Task.Delay(cuando - ahora, alto); }
            catch (OperationCanceledException) { return; }

            try
            {
                if (cual == "pendientes") await Pendientes(alto); else await Semanal(alto);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                log.LogError(ex, "Aviso programado {Cual} falló", cual);
            }
        }
    }

    /// <summary>La próxima vez que el reloj de Chiapas marque `hora` en punto (y ese día, si se pide).</summary>
    public static DateTimeOffset Siguiente(DateTimeOffset ahora, int hora, DayOfWeek? dia)
    {
        var t = new DateTimeOffset(ahora.Year, ahora.Month, ahora.Day, hora, 0, 0, ahora.Offset);
        while (t <= ahora || (dia is DayOfWeek d && t.DayOfWeek != d)) t = t.AddDays(1);
        return t;
    }

    public async Task Pendientes(CancellationToken ct)
    {
        await using var c = await bd.AbrirAsync(ct: ct);
        var cot = (await c.QueryAsync(
            @"SELECT TOP 20 nombre, telefono, creado_en FROM dbo.solicitudes
              WHERE estado = 'nueva' AND creado_en < DATEADD(HOUR, -24, SYSDATETIMEOFFSET()) ORDER BY creado_en")).ToList();
        var preg = (await c.QueryAsync(
            @"SELECT TOP 20 nombre, pregunta, slug, creado_en FROM dbo.preguntas
              WHERE respuesta IS NULL AND creado_en < DATEADD(HOUR, -24, SYSDATETIMEOFFSET()) ORDER BY creado_en")).ToList();
        if (cot.Count == 0 && preg.Count == 0) return;
        avisador.Encolar("/api/aviso-resumen", new { tipo = "pendientes", solicitudes = Bd.Filas(cot), preguntas = Bd.Filas(preg) });
    }

    public async Task Semanal(CancellationToken ct)
    {
        await using var c = await bd.AbrirAsync(ct: ct);
        var equipos = await c.QueryAsync(
            "SELECT TOP 10 slug, vistas, cotizaciones FROM dbo.metricas WHERE vistas > 0 ORDER BY vistas DESC");
        var totales = await c.QuerySingleAsync(
            "SELECT ISNULL(SUM(vistas), 0) AS vistas, ISNULL(SUM(cotizaciones), 0) AS cotizaciones FROM dbo.metricas");
        avisador.Encolar("/api/aviso-resumen", new { tipo = "semanal", equipos = Bd.Filas(equipos), totales = Bd.Fila(totales) });
    }
}
