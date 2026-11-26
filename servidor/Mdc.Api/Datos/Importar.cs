using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Nodes;
using Dapper;
using Mdc.Api.Seguridad;
using Microsoft.Data.SqlClient;

namespace Mdc.Api.Datos;

/// <summary>
/// Llena la base desde otro lado. Dos orígenes:
///
/// · Supabase (la migración de verdad): TODO — equipos con sus borradores,
///   cotizaciones, preguntas, métricas, ajustes, sucursales, las fotos del
///   almacenamiento y las cuentas. Necesita la llave de servicio, que se pasa
///   por variable de entorno en ese momento y no se guarda en ningún lado.
/// · data/catalogo.json (desarrollo): sólo lo publicado, que es lo que trae
///   ese archivo. Sirve para tener una base local con datos reales.
///
/// Las contraseñas NO se pueden traer: Supabase no las entrega, y está bien
/// que así sea. Cada cuenta se crea con un enlace de invitación nuevo, y la
/// persona elige su contraseña otra vez.
///
/// Todo se escribe en UNA transacción: o queda la base completa o no queda
/// nada. Durante la carga se apagan el freno de spam (cotizaciones viejas del
/// mismo teléfono lo dispararían, y además pisaría sus fechas y estados) y la
/// bitácora (la importación no es un cambio de nadie).
/// </summary>
public sealed class Importar(string cadena, IConfiguration config, Action<string> informar)
{
    public sealed class Paquete
    {
        public Dictionary<string, object?> Ajustes { get; } = [];
        public List<Dictionary<string, object?>> Sucursales { get; } = [];
        public List<Dictionary<string, object?>> Equipos { get; } = [];
        public List<Dictionary<string, object?>> Solicitudes { get; } = [];
        public List<Dictionary<string, object?>> Preguntas { get; } = [];
        public List<Dictionary<string, object?>> Metricas { get; } = [];
        public List<(string correo, string nombre, string rol)> Usuarios { get; } = [];
    }

    private static readonly string[] ColAjustes =
    [
        "marca_completa", "marca_principal", "marca_acento", "color_acento", "logo_url", "telefono", "whatsapp",
        "correo", "direccion", "horario", "barra_superior", "hero_etiqueta", "hero_titulo", "hero_resaltado",
        "hero_texto", "hero_imagen", "vendedor", "pie_descripcion",
    ];
    private static readonly string[] ColEquipos =
    [
        "id", "slug", "nombre", "marca", "categoria", "condicion", "precio_cents", "precio_anterior_cents",
        "financiamiento", "arrendamiento", "envio_incluido", "ubicacion", "anio", "especificaciones", "descripcion",
        "imagenes", "icono", "destacado", "publicado", "disponibilidad", "video_url", "atributos", "creado_en", "actualizado_en",
    ];
    private static readonly string[] ColSolicitudes =
        ["id", "tipo", "nombre", "telefono", "correo", "empresa", "mensaje", "carrito", "estado", "creado_en"];
    private static readonly string[] ColPreguntas =
        ["id", "slug", "nombre", "pregunta", "respuesta", "publicada", "creado_en", "respondida_en"];
    private static readonly string[] ColMetricas = ["slug", "vistas", "cotizaciones", "ultima_vista"];
    private static readonly string[] ColSucursales = ["id", "nombre", "direccion", "telefono", "horario", "orden"];
    private static readonly HashSet<string> ColumnasJson = ["especificaciones", "imagenes", "atributos", "carrito"];

    /* ══════════ Origen: data/catalogo.json ══════════ */

    public static Paquete DesdeJson(string ruta)
    {
        var raiz = JsonNode.Parse(File.ReadAllText(ruta))!.AsObject();
        var p = new Paquete();

        var a = raiz["ajustes"]!.AsObject();
        foreach (var col in ColAjustes)
            if (a[col] is { } v) p.Ajustes[col] = Valor(v);
        if (a["logo"] is { } logo) p.Ajustes["logo_url"] = Valor(logo);

        short orden = 0;
        foreach (var s in raiz["sucursales"]!.AsArray())
            p.Sucursales.Add(new()
            {
                ["nombre"] = (string?)s!["name"], ["direccion"] = (string?)s["address"],
                ["telefono"] = (string?)s["phone"], ["horario"] = (string?)s["hours"] ?? "", ["orden"] = orden++,
            });

        foreach (var e in raiz["equipos"]!.AsArray())
        {
            var imgs = e!["imgs"] is JsonArray arr ? arr.Select(x => (string?)x).Where(x => x is not null).ToList()
                     : e["img"] is { } img && (string?)img is { } i1 ? [i1] : [];
            p.Equipos.Add(new()
            {
                ["id"] = (long?)e["id"], ["slug"] = (string?)e["slug"], ["nombre"] = (string?)e["name"],
                ["marca"] = (string?)e["brand"], ["categoria"] = (string?)e["cat"], ["condicion"] = (string?)e["cond"],
                ["precio_cents"] = Centavos(e["price"]),
                ["precio_anterior_cents"] = e["original"] is null ? null : Centavos(e["original"]),
                ["financiamiento"] = (string?)e["finance"], ["arrendamiento"] = (bool?)e["leasing"] ?? false,
                ["envio_incluido"] = (bool?)e["shipping"] ?? false, ["ubicacion"] = (string?)e["location"],
                ["anio"] = (int?)e["year"], ["especificaciones"] = (e["specs"] ?? new JsonArray()).ToJsonString(),
                ["descripcion"] = (string?)e["desc"] ?? "", ["imagenes"] = JsonSerializer.Serialize(imgs),
                ["icono"] = (string?)e["svgKey"] ?? "excavadora", ["destacado"] = (bool?)e["hot"] ?? false,
                ["publicado"] = true, ["disponibilidad"] = (string?)e["disponibilidad"] ?? "disponible",
                ["video_url"] = (string?)e["video"], ["atributos"] = (e["atributos"] ?? new JsonObject()).ToJsonString(),
            });
            if (e["qa"] is JsonArray qa)
                foreach (var q in qa)
                    p.Preguntas.Add(new()
                    {
                        ["slug"] = (string?)e["slug"], ["nombre"] = (string?)q!["nombre"], ["pregunta"] = (string?)q["pregunta"],
                        ["respuesta"] = (string?)q["respuesta"], ["publicada"] = true,
                        ["respondida_en"] = (string?)q["fecha"] is { } f ? DateTimeOffset.Parse(f) : null,
                    });
        }
        return p;
    }

    /* ══════════ Origen: Supabase ══════════ */

    public static async Task<Paquete> DesdeSupabaseAsync(string url, string llaveServicio, Action<string> informar)
    {
        using var http = new HttpClient { BaseAddress = new Uri(url.TrimEnd('/') + "/"), Timeout = TimeSpan.FromMinutes(2) };
        http.DefaultRequestHeaders.Add("apikey", llaveServicio);
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", llaveServicio);

        async Task<List<Dictionary<string, object?>>> Tabla(string tabla, string orden)
        {
            var filas = new List<Dictionary<string, object?>>();
            for (var desde = 0; ; desde += 1000)   // max_rows de Supabase es 1000: se pide por páginas
            {
                var lote = await http.GetFromJsonAsync<List<Dictionary<string, JsonElement>>>(
                    $"rest/v1/{tabla}?select=*&order={orden}&limit=1000&offset={desde}") ?? [];
                filas.AddRange(lote.Select(f => f.ToDictionary(k => k.Key, k => Valor(k.Value))));
                if (lote.Count < 1000) break;
            }
            informar($"  {tabla}: {filas.Count}");
            return filas;
        }

        var p = new Paquete();
        var aj = (await Tabla("ajustes", "id.asc")).FirstOrDefault() ?? [];
        foreach (var col in ColAjustes) if (aj.TryGetValue(col, out var v)) p.Ajustes[col] = v;
        p.Sucursales.AddRange(await Tabla("sucursales", "orden.asc"));
        p.Equipos.AddRange(await Tabla("equipos", "id.asc"));
        p.Solicitudes.AddRange(await Tabla("solicitudes", "id.asc"));
        p.Preguntas.AddRange(await Tabla("preguntas", "id.asc"));
        p.Metricas.AddRange(await Tabla("metricas", "slug.asc"));

        var perfiles = (await Tabla("perfiles", "creado_en.asc")).ToDictionary(x => x["id"]!.ToString()!);
        var cuentas = await http.GetFromJsonAsync<JsonElement>("auth/v1/admin/users?per_page=200");
        foreach (var u in cuentas.GetProperty("users").EnumerateArray())
        {
            var id = u.GetProperty("id").GetString()!;
            perfiles.TryGetValue(id, out var pf);
            p.Usuarios.Add((u.GetProperty("email").GetString()!.ToLowerInvariant(),
                pf?["nombre"]?.ToString() ?? "Sin nombre", pf?["rol"]?.ToString() == "admin" ? "admin" : "staff"));
        }
        informar($"  cuentas: {p.Usuarios.Count}");
        return p;
    }

    /* ══════════ Fotos ══════════
       Las del almacenamiento de Supabase se bajan a la carpeta de fotos y se
       reescribe su dirección. La pequeña (-w700) se baja también: el sitio la
       pide por su cuenta en el srcset. Lo que no sea de Supabase ni ya
       nuestro, se descarta con aviso: una foto de otro dominio no pasaría la
       regla de la base ni la CSP del sitio. */
    public async Task TraerFotosAsync(Paquete p, string? urlSupabase)
    {
        var carpeta = Endpoints.FotosEndpoints.Carpeta(config);
        var publica = (config["Publico:UrlApi"] ?? "").TrimEnd('/') + "/fotos/";
        var prefijo = urlSupabase is null ? null : urlSupabase.TrimEnd('/') + "/storage/v1/object/public/";
        using var http = new HttpClient { Timeout = TimeSpan.FromMinutes(1) };

        async Task<string?> Traer(string url)
        {
            if (url.StartsWith(publica, StringComparison.Ordinal)) return url;
            if (prefijo is null || !url.StartsWith(prefijo, StringComparison.Ordinal))
            {
                informar($"  ⚠ foto descartada (no es del almacenamiento): {url}");
                return null;
            }
            var relativa = url[prefijo.Length..];   // equipos/<slug>/<archivo>
            if (relativa.Contains("..")) return null;
            var variantes = relativa.EndsWith("-w1400.webp") ? new[] { relativa, relativa.Replace("-w1400.webp", "-w700.webp") } : [relativa];
            foreach (var r in variantes)
            {
                var destino = Path.Combine(carpeta, r.Replace('/', Path.DirectorySeparatorChar));
                if (File.Exists(destino)) continue;
                using var resp = await http.GetAsync(prefijo + r);
                if (!resp.IsSuccessStatusCode)
                {
                    if (r == relativa) { informar($"  ⚠ no se pudo bajar {url} ({(int)resp.StatusCode})"); return null; }
                    continue;   // falta la pequeña: el sitio cae a la grande, no es grave
                }
                Directory.CreateDirectory(Path.GetDirectoryName(destino)!);
                await File.WriteAllBytesAsync(destino, await resp.Content.ReadAsByteArrayAsync());
            }
            return publica + relativa;
        }

        var n = 0;
        foreach (var e in p.Equipos)
        {
            var viejas = JsonSerializer.Deserialize<List<string>>(e["imagenes"]?.ToString() ?? "[]") ?? [];
            if (viejas.Count == 0 && e.GetValueOrDefault("imagen_url") is string portada) viejas.Add(portada);
            var nuevas = new List<string>();
            foreach (var u in viejas) if (await Traer(u) is { } nueva) { nuevas.Add(nueva); n++; }
            e["imagenes"] = JsonSerializer.Serialize(nuevas);
        }
        foreach (var col in new[] { "logo_url", "hero_imagen" })
            if (p.Ajustes.GetValueOrDefault(col) is string u) p.Ajustes[col] = await Traer(u);
        informar($"  fotos: {n}");
    }

    /* ══════════ Escribir ══════════ */

    public async Task<List<(string correo, string enlace)>> EscribirAsync(Paquete p, bool reemplazar)
    {
        await using var c = new SqlConnection(cadena);
        await c.OpenAsync();
        var hayDatos = await c.ExecuteScalarAsync<int>("SELECT (SELECT COUNT(*) FROM dbo.equipos) + (SELECT COUNT(*) FROM dbo.solicitudes)");
        if (hayDatos > 0 && !reemplazar)
            throw new InvalidOperationException("La base ya tiene datos. Para borrarlos y cargar de nuevo: --reemplazar");

        await using var t = (SqlTransaction)await c.BeginTransactionAsync();
        await c.ExecuteAsync(@"
            DISABLE TRIGGER dbo.solicitudes_frenar_spam ON dbo.solicitudes;
            DISABLE TRIGGER dbo.equipos_bitacora ON dbo.equipos;
            DISABLE TRIGGER dbo.sucursales_bitacora ON dbo.sucursales;", transaction: t);

        if (reemplazar)
            await c.ExecuteAsync(@"DELETE FROM dbo.preguntas; DELETE FROM dbo.metricas; DELETE FROM dbo.solicitudes;
                                   DELETE FROM dbo.equipos; DELETE FROM dbo.sucursales;", transaction: t);

        if (p.Ajustes.Count > 0)
        {
            var cols = p.Ajustes.Keys.Where(ColAjustes.Contains).ToList();
            await c.ExecuteAsync($"UPDATE dbo.ajustes SET {string.Join(", ", cols.Select(k => $"{k} = @{k}"))} WHERE id = 1",
                Parametros(p.Ajustes, cols), t);
        }
        await Insertar(c, t, "sucursales", ColSucursales, p.Sucursales);
        await Insertar(c, t, "equipos", ColEquipos, p.Equipos);
        await Insertar(c, t, "solicitudes", ColSolicitudes, p.Solicitudes);
        await Insertar(c, t, "preguntas", ColPreguntas, p.Preguntas);
        await Insertar(c, t, "metricas", ColMetricas, p.Metricas);

        var enlaces = new List<(string, string)>();
        var sitio = (config["Publico:UrlSitio"] ?? "").TrimEnd('/');
        foreach (var (correo, nombre, rol) in p.Usuarios)
        {
            if (await c.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM dbo.usuarios WHERE correo = @correo", new { correo }, t) > 0) continue;
            var token = Tokens.Aleatorio();
            await c.ExecuteAsync(
                @"INSERT INTO dbo.usuarios (correo, nombre, rol, invitacion_hash, invitacion_expira)
                  VALUES (@correo, @nombre, @rol, @h, DATEADD(DAY, 7, SYSDATETIMEOFFSET()))",
                new { correo, nombre = nombre.Length >= 2 ? nombre : "Sin nombre", rol, h = Tokens.Hash(token) }, t);
            enlaces.Add((correo, $"{sitio}/?invitacion={token}"));
        }

        await c.ExecuteAsync(@"
            ENABLE TRIGGER dbo.solicitudes_frenar_spam ON dbo.solicitudes;
            ENABLE TRIGGER dbo.equipos_bitacora ON dbo.equipos;
            ENABLE TRIGGER dbo.sucursales_bitacora ON dbo.sucursales;", transaction: t);
        await t.CommitAsync();
        informar($"  escrito: {p.Equipos.Count} equipos, {p.Sucursales.Count} sucursales, {p.Solicitudes.Count} cotizaciones, " +
                 $"{p.Preguntas.Count} preguntas, {p.Metricas.Count} métricas, {enlaces.Count} cuentas nuevas");
        return enlaces;
    }

    private static async Task Insertar(SqlConnection c, SqlTransaction t, string tabla, string[] columnas, List<Dictionary<string, object?>> filas)
    {
        if (filas.Count == 0) return;
        /* Se conservan los ids: las cotizaciones y las preguntas viejas se
           citan por número en correos y conversaciones. */
        var conId = columnas.Contains("id") && filas.All(f => f.GetValueOrDefault("id") is not null);
        var cols = columnas.Where(k => (k != "id" || conId) && filas.Any(f => f.ContainsKey(k))).ToList();
        var sql = $"INSERT INTO dbo.{tabla} ({string.Join(", ", cols)}) VALUES ({string.Join(", ", cols.Select(k => "@" + k))})";
        if (conId) await c.ExecuteAsync($"SET IDENTITY_INSERT dbo.{tabla} ON", transaction: t);
        foreach (var f in filas) await c.ExecuteAsync(sql, Parametros(f, cols), t);
        if (conId) await c.ExecuteAsync($"SET IDENTITY_INSERT dbo.{tabla} OFF", transaction: t);
    }

    private static DynamicParameters Parametros(Dictionary<string, object?> fila, IEnumerable<string> cols)
    {
        var d = new DynamicParameters();
        foreach (var k in cols)
        {
            var v = fila.GetValueOrDefault(k);
            // Lo que vino como arreglo u objeto, a texto JSON; lo demás, tal cual.
            d.Add(k, ColumnasJson.Contains(k) && v is not null and not string ? JsonSerializer.Serialize(v) : v);
        }
        return d;
    }

    private static long Centavos(JsonNode? pesos) => (long)Math.Round((decimal)pesos! * 100m);

    private static object? Valor(JsonNode? n) => n is null ? null : Valor(JsonSerializer.Deserialize<JsonElement>(n.ToJsonString()));

    /// <summary>Un valor de JSON al tipo que entiende SqlClient. Fechas ISO → DateTimeOffset.</summary>
    private static object? Valor(JsonElement v) => v.ValueKind switch
    {
        JsonValueKind.Null or JsonValueKind.Undefined => null,
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        JsonValueKind.Number => v.TryGetInt64(out var l) ? l : v.GetDecimal(),
        JsonValueKind.String => v.TryGetDateTimeOffset(out var f) && v.GetString()!.Length >= 19 ? f : v.GetString(),
        _ => v.GetRawText(),   // arreglos y objetos: texto JSON, como los guarda la base
    };
}
