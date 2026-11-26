using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Dapper;
using Mdc.Api.Datos;
using Mdc.Api.Endpoints;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace Mdc.Api.Pruebas;

/// <summary>
/// La API de verdad, contra una base de SQL Server DESECHABLE.
///
/// Cada corrida borra y rehace MdcPrueba_Api, le aplica servidor/sql/ con el
/// mismo código que usa el instalador y siembra dos cuentas: un administrador
/// y alguien de "staff". Nunca toca MdcMaquinaria ni MdcMaquinaria_Dev.
/// </summary>
public sealed class Entorno : WebApplicationFactory<Program>, IAsyncLifetime
{
    /* En esta máquina, el SQL Express con la cuenta de Windows. En el CI
       (Linux, SQL Server en un contenedor) se cambia con MDC_PRUEBAS_SQL,
       que trae servidor y credenciales pero NO la base: el nombre de la base
       lo pone siempre la prueba, para que nunca apunte a una de verdad. */
    private static readonly string Conexion =
        Environment.GetEnvironmentVariable("MDC_PRUEBAS_SQL") is { Length: > 0 } c ? c
        : @"Server=.\SQLEXPRESS;Integrated Security=True";
    public string NombreBase { get; init; } = "MdcPrueba_Api";
    public string Cadena => new SqlConnectionStringBuilder(Conexion)
    {
        InitialCatalog = NombreBase, TrustServerCertificate = true, ApplicationName = "Mdc.Api.Pruebas",
    }.ConnectionString;

    public const string CorreoAdmin = "jefe@mdc.mx", ClaveAdmin = "contraseña-del-jefe-123";
    public const string CorreoStaff = "ayudante@mdc.mx", ClaveStaff = "contraseña-del-ayudante-123";

    public string CarpetaFotos { get; } = Path.Combine(Path.GetTempPath(), "mdc-pruebas-fotos-" + Guid.NewGuid().ToString("N")[..8]);

    /// <summary>Límites por IP. Altos para que las pruebas no se estorben; una prueba aparte usa uno bajo.</summary>
    public int LimitePublico { get; init; } = 10_000;
    public int LimiteAcceso { get; init; } = 10_000;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Pruebas");
        builder.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:Mdc"] = Cadena,
            ["Jwt:Clave"] = "clave-de-pruebas-que-mide-mas-de-32-bytes!!",
            ["Fotos:Carpeta"] = CarpetaFotos,
            ["Publico:UrlApi"] = "https://api.prueba",
            ["Publico:UrlSitio"] = "https://sitio.prueba",
            ["Cors:Origenes:0"] = "https://sitio.prueba",
            // Configurados, para que la invitación se acepte; apuntan a un puerto cerrado.
            ["Avisos:Secreto"] = "secreto-de-prueba",
            ["Avisos:UrlSitio"] = "http://127.0.0.1:9",
            ["Limites:Publico"] = LimitePublico.ToString(),
            ["Limites:Acceso"] = LimiteAcceso.ToString(),
        }));
    }

    public async Task InitializeAsync()
    {
        await using (var maestra = new SqlConnection(new SqlConnectionStringBuilder(Cadena) { InitialCatalog = "master" }.ConnectionString))
        {
            await maestra.ExecuteAsync($@"IF DB_ID('{NombreBase}') IS NOT NULL BEGIN
                ALTER DATABASE [{NombreBase}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{NombreBase}]; END");
        }
        await Migraciones.AplicarAsync(Cadena, _ => { });
        await using var c = new SqlConnection(Cadena);
        await c.ExecuteAsync(
            @"INSERT INTO dbo.usuarios (correo, nombre, rol, hash_contrasena) VALUES
              (@ca, N'El Jefe', 'admin', @ha), (@cs, N'El Ayudante', 'staff', @hs)",
            new { ca = CorreoAdmin, ha = AuthEndpoints.HashDe(ClaveAdmin), cs = CorreoStaff, hs = AuthEndpoints.HashDe(ClaveStaff) });
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
        await base.DisposeAsync();
        SqlConnection.ClearAllPools();
        await using var maestra = new SqlConnection(new SqlConnectionStringBuilder(Cadena) { InitialCatalog = "master" }.ConnectionString);
        await maestra.ExecuteAsync($"ALTER DATABASE [{NombreBase}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{NombreBase}]");
        if (Directory.Exists(CarpetaFotos)) Directory.Delete(CarpetaFotos, recursive: true);
    }

    public SqlConnection Base() => new(Cadena);

    /// <summary>Un cliente con la sesión de esa cuenta ya iniciada.</summary>
    public async Task<HttpClient> ComoAsync(string correo, string clave)
    {
        var cliente = CreateClient();
        var r = await cliente.PostAsJsonAsync("/api/auth/entrar", new { correo, contrasena = clave });
        r.EnsureSuccessStatusCode();
        var sesion = await r.Content.ReadFromJsonAsync<JsonElement>();
        cliente.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", sesion.GetProperty("access_token").GetString());
        return cliente;
    }

    public Task<HttpClient> AdminAsync() => ComoAsync(CorreoAdmin, ClaveAdmin);
}

/// <summary>Una sola base para todas las clases de prueba: crearla cuesta segundos.</summary>
[CollectionDefinition("api")]
public sealed class ColeccionApi : ICollectionFixture<Entorno>;
