using System.Text.RegularExpressions;
using Dapper;
using Microsoft.Data.SqlClient;

namespace Mdc.Api.Datos;

/// <summary>
/// Los archivos de servidor/sql/, aplicados en orden y una sola vez.
///
/// El servicio NO los aplica al arrancar: corre con un usuario de SQL que no
/// puede tocar el esquema (si la API cayera en malas manos, no podría borrar
/// tablas ni crear puertas traseras). Los aplica `Mdc.Api migrar`, que corre
/// el instalador con la cuenta de quien administra la máquina. Al arrancar,
/// el servicio sólo comprueba que no falte ninguno, y si falta se niega a
/// arrancar con un mensaje que dice qué hacer.
/// </summary>
public static partial class Migraciones
{
    private static string Carpeta => Path.Combine(AppContext.BaseDirectory, "sql");

    private static IEnumerable<string> Archivos() =>
        Directory.Exists(Carpeta)
            ? Directory.GetFiles(Carpeta, "*.sql").Select(Path.GetFileName).Order(StringComparer.Ordinal)!
            : [];

    public static async Task ComprobarAsync(Bd bd, ILogger log)
    {
        await using var c = await bd.AbrirAsync();
        var aplicadas = await c.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM sys.tables WHERE name = '_migraciones'") == 0
            ? new HashSet<string>()
            : (await c.QueryAsync<string>("SELECT nombre FROM dbo._migraciones")).ToHashSet();
        var faltan = Archivos().Where(a => !aplicadas.Contains(a)).ToList();
        if (faltan.Count > 0)
        {
            log.LogCritical("La base no está al día. Faltan: {Faltan}. Corre: Mdc.Api migrar", string.Join(", ", faltan));
            throw new InvalidOperationException("La base no está al día: " + string.Join(", ", faltan));
        }
    }

    /// <summary>Crea la base si no existe y aplica lo que falte. Devuelve cuántos archivos aplicó.</summary>
    public static async Task<int> AplicarAsync(string cadena, Action<string> informar)
    {
        var datos = new SqlConnectionStringBuilder(cadena);
        var nombreBase = datos.InitialCatalog;
        await using (var maestra = new SqlConnection(new SqlConnectionStringBuilder(cadena) { InitialCatalog = "master" }.ConnectionString))
        {
            await maestra.OpenAsync();
            if (await maestra.ExecuteScalarAsync<int?>("SELECT database_id FROM sys.databases WHERE name = @nombreBase", new { nombreBase }) is null)
            {
                informar($"Creando la base {nombreBase}…");
                await maestra.ExecuteAsync($"CREATE DATABASE [{nombreBase.Replace("]", "]]")}]");
            }
        }

        await using var c = new SqlConnection(cadena);
        await c.OpenAsync();
        await c.ExecuteAsync(@"IF OBJECT_ID('dbo._migraciones') IS NULL
            CREATE TABLE dbo._migraciones (nombre NVARCHAR(200) NOT NULL PRIMARY KEY, aplicada_en DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET())");
        var aplicadas = (await c.QueryAsync<string>("SELECT nombre FROM dbo._migraciones")).ToHashSet();

        var n = 0;
        foreach (var archivo in Archivos().Where(a => !aplicadas.Contains(a)))
        {
            informar($"Aplicando {archivo}…");
            var texto = await File.ReadAllTextAsync(Path.Combine(Carpeta, archivo));
            /* Todo el archivo o nada: si un lote falla a la mitad, la base no
               se queda con medio esquema y una fila en _migraciones diciendo
               que ya está. */
            await using var t = await c.BeginTransactionAsync();
            foreach (var lote in Lotes(texto))
                await c.ExecuteAsync(lote, transaction: t, commandTimeout: 300);
            await c.ExecuteAsync("INSERT INTO dbo._migraciones (nombre) VALUES (@archivo)", new { archivo }, t);
            await t.CommitAsync();
            n++;
        }
        return n;
    }

    /// <summary>Parte un archivo en lotes por las líneas "GO", como sqlcmd.</summary>
    public static IEnumerable<string> Lotes(string texto) =>
        SeparadorGo().Split(texto).Select(l => l.Trim()).Where(l => l.Length > 0);

    [GeneratedRegex(@"^\s*GO\s*;?\s*$", RegexOptions.Multiline | RegexOptions.IgnoreCase)]
    private static partial Regex SeparadorGo();
}
