using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Dapper;

namespace Mdc.Api.Pruebas;

/// <summary>El panel guardando equipos, y lo que un visitante puede y no puede hacer.</summary>
[Collection("api")]
public sealed class CatalogoPruebas(Entorno e)
{
    private static async Task<JsonElement> Json(HttpResponseMessage r) => await r.Content.ReadFromJsonAsync<JsonElement>();

    /// <summary>Un equipo como lo manda filaDesdeEquipo() en remoto.js.</summary>
    private static object Equipo(string slug, bool publicado = true) => new
    {
        slug, nombre = "Excavadora " + slug, marca = "CAT", categoria = "Excavación", condicion = "Nuevo",
        precio_cents = 285000000L, precio_anterior_cents = 310000000L, financiamiento = "18 MSI",
        arrendamiento = true, envio_incluido = true, ubicacion = "Tuxtla Gutiérrez", anio = 2025,
        especificaciones = new[] { "20 ton", "148 HP" }, descripcion = "Una buena máquina.",
        imagenes = new[] { "https://api.prueba/fotos/equipos/a-w1400.webp" }, icono = "excavadora",
        destacado = true, publicado, disponibilidad = "disponible", video_url = "dQw4w9WgXcQ",
        atributos = new { horas = 1200 },
    };

    [Fact]
    public async Task El_panel_da_de_alta_un_equipo_y_lo_recibe_con_los_mismos_nombres_de_columna()
    {
        var admin = await e.AdminAsync();
        var r = await admin.PostAsJsonAsync("/api/admin/equipos", Equipo("alta-completa"));
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var f = await Json(r);
        Assert.Equal("alta-completa", f.GetProperty("slug").GetString());
        Assert.Equal(285000000L, f.GetProperty("precio_cents").GetInt64());
        // Los JSON vuelven como JSON, no como texto: equipoDesdeFila() espera arreglos.
        Assert.Equal(JsonValueKind.Array, f.GetProperty("especificaciones").ValueKind);
        Assert.Equal(1200, f.GetProperty("atributos").GetProperty("horas").GetInt32());
        // La portada la pone la base: la primera foto de la galería.
        Assert.Equal("https://api.prueba/fotos/equipos/a-w1400.webp", f.GetProperty("imagen_url").GetString());
    }

    [Fact]
    public async Task Lo_que_no_esta_en_la_lista_blanca_se_ignora()
    {
        var admin = await e.AdminAsync();
        var cuerpo = JsonSerializer.SerializeToNode(Equipo("lista-blanca"))!.AsObject();
        cuerpo["id"] = 999999;
        cuerpo["imagen_url"] = "https://otro-sitio.example/trampa.webp";
        cuerpo["creado_en"] = "2000-01-01T00:00:00Z";
        var f = await Json(await admin.PostAsJsonAsync("/api/admin/equipos", cuerpo));
        Assert.NotEqual(999999, f.GetProperty("id").GetInt64());
        Assert.Equal("https://api.prueba/fotos/equipos/a-w1400.webp", f.GetProperty("imagen_url").GetString());
        Assert.True(f.GetProperty("creado_en").GetDateTimeOffset() > DateTimeOffset.UtcNow.AddMinutes(-5));
    }

    [Fact]
    public async Task Un_dato_invalido_se_rechaza_con_un_mensaje_que_dice_que_campo()
    {
        var admin = await e.AdminAsync();
        var cuerpo = JsonSerializer.SerializeToNode(Equipo("precio-raro"))!.AsObject();
        cuerpo["precio_anterior_cents"] = 1;   // "antes" más barato que "ahora"
        var r = await admin.PostAsJsonAsync("/api/admin/equipos", cuerpo);
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        Assert.Contains("precio anterior", (await Json(r)).GetProperty("error").GetString());
    }

    [Fact]
    public async Task Dos_equipos_con_la_misma_direccion_no_caben()
    {
        var admin = await e.AdminAsync();
        await admin.PostAsJsonAsync("/api/admin/equipos", Equipo("repetido"));
        var r = await admin.PostAsJsonAsync("/api/admin/equipos", Equipo("repetido"));
        Assert.Equal(HttpStatusCode.Conflict, r.StatusCode);
    }

    [Fact]
    public async Task La_bitacora_sabe_quien_cambio_el_precio()
    {
        var admin = await e.AdminAsync();
        var id = (await Json(await admin.PostAsJsonAsync("/api/admin/equipos", Equipo("bitacora")))).GetProperty("id").GetInt64();
        await admin.PutAsJsonAsync($"/api/admin/equipos/{id}", new { precio_cents = 100000000L, precio_anterior_cents = (long?)null });
        await using var b = e.Base();
        var actor = await b.ExecuteScalarAsync<string>(
            @"SELECT TOP 1 u.correo FROM dbo.bitacora k JOIN dbo.usuarios u ON u.id = k.actor
              WHERE k.tabla = 'equipos' AND k.registro = @id AND k.operacion = 'UPDATE' ORDER BY k.id DESC", new { id });
        Assert.Equal(Entorno.CorreoAdmin, actor);
    }

    [Fact]
    public async Task El_catalogo_publico_no_enseña_borradores()
    {
        var admin = await e.AdminAsync();
        await admin.PostAsJsonAsync("/api/admin/equipos", Equipo("publicado-si"));
        await admin.PostAsJsonAsync("/api/admin/equipos", Equipo("borrador-no", publicado: false));
        var cat = await Json(await e.CreateClient().GetAsync("/api/catalogo"));
        var slugs = cat.GetProperty("equipos").EnumerateArray().Select(x => x.GetProperty("slug").GetString()).ToList();
        Assert.Contains("publicado-si", slugs);
        Assert.DoesNotContain("borrador-no", slugs);
        // Con los nombres que espera el sitio, y el precio en pesos.
        var eq = cat.GetProperty("equipos").EnumerateArray().First(x => x.GetProperty("slug").GetString() == "publicado-si");
        Assert.Equal(2850000m, eq.GetProperty("price").GetDecimal());
        Assert.Equal(JsonValueKind.Array, eq.GetProperty("specs").ValueKind);
    }

    [Fact]
    public async Task Las_sucursales_se_reemplazan_todas_o_ninguna()
    {
        var admin = await e.AdminAsync();
        var bien = new[] { new { nombre = "Matriz", direccion = "Blvd. Belisario 1250", telefono = "961 123 4567", horario = "L-V" } };
        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync("/api/admin/sucursales", bien)).StatusCode);

        // La segunda tiene un teléfono con letras: no debe quedar la lista a medias.
        var mal = new[]
        {
            new { nombre = "Nueva", direccion = "Calle Uno 100", telefono = "961 000 0000", horario = "" },
            new { nombre = "Rota", direccion = "Calle Dos 200", telefono = "961-ABC", horario = "" },
        };
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync("/api/admin/sucursales", mal)).StatusCode);
        await using var b = e.Base();
        Assert.Equal(new[] { "Matriz" }, (await b.QueryAsync<string>("SELECT nombre FROM dbo.sucursales")).ToArray());
    }

    [Fact]
    public async Task Una_cotizacion_entra_sin_sesion_y_nace_nueva_aunque_diga_otra_cosa()
    {
        var r = await e.CreateClient().PostAsJsonAsync("/api/solicitudes", new
        {
            tipo = "cotizacion", nombre = "Ana López", telefono = "961 111 2233", correo = "ANA@Correo.MX",
            mensaje = "Me interesa", carrito = new[] { new { slug = "x", nombre = "Excavadora", precio = 100, cantidad = 1 } },
            estado = "cerrada",
        });
        Assert.Equal(HttpStatusCode.NoContent, r.StatusCode);
        await using var b = e.Base();
        var f = await b.QuerySingleAsync<(string estado, string telefono, string correo)>(
            "SELECT TOP 1 estado, telefono, correo FROM dbo.solicitudes WHERE nombre = N'Ana López' ORDER BY id DESC");
        Assert.Equal(("nueva", "9611112233", "ana@correo.mx"), f);
    }

    [Fact]
    public async Task La_cuarta_cotizacion_seguida_del_mismo_telefono_se_frena()
    {
        var c = e.CreateClient();
        HttpResponseMessage? r = null;
        for (var i = 0; i < 4; i++)
            r = await c.PostAsJsonAsync("/api/solicitudes", new { tipo = "cotizacion", nombre = "Spam", telefono = "9619998877" });
        Assert.Equal(HttpStatusCode.BadRequest, r!.StatusCode);
        Assert.Contains("Demasiadas", (await Json(r)).GetProperty("error").GetString());
    }

    [Fact]
    public async Task Un_visitante_no_puede_leer_las_cotizaciones()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await e.CreateClient().GetAsync("/api/admin/solicitudes")).StatusCode);
    }

    [Fact]
    public async Task Una_pregunta_nace_sin_publicar_y_se_publica_al_contestarla()
    {
        var admin = await e.AdminAsync();
        await admin.PostAsJsonAsync("/api/admin/equipos", Equipo("con-preguntas"));
        var c = e.CreateClient();
        Assert.Equal(HttpStatusCode.NoContent, (await c.PostAsJsonAsync("/api/preguntas",
            new { slug = "con-preguntas", nombre = "Beto", pregunta = "¿Tiene garantía?" })).StatusCode);

        var cat = await Json(await c.GetAsync("/api/catalogo"));
        Assert.DoesNotContain(cat.GetProperty("preguntas").EnumerateArray(), p => p.GetProperty("slug").GetString() == "con-preguntas");

        long id;
        await using (var b = e.Base()) id = await b.ExecuteScalarAsync<long>("SELECT id FROM dbo.preguntas WHERE slug = 'con-preguntas'");
        var resp = await Json(await admin.PatchAsJsonAsync($"/api/admin/preguntas/{id}", new { respuesta = "Sí, 12 meses.", publicada = true }));
        Assert.True(resp.GetProperty("respondida_en").GetDateTimeOffset() > DateTimeOffset.UtcNow.AddMinutes(-5));

        cat = await Json(await c.GetAsync("/api/catalogo"));
        Assert.Contains(cat.GetProperty("preguntas").EnumerateArray(), p => p.GetProperty("slug").GetString() == "con-preguntas");
    }

    [Fact]
    public async Task Una_pregunta_sobre_un_equipo_que_no_existe_explica_por_que()
    {
        var r = await e.CreateClient().PostAsJsonAsync("/api/preguntas", new { slug = "no-existe", nombre = "Ana", pregunta = "¿Cuánto cuesta?" });
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        Assert.Equal("Ese equipo no existe.", (await Json(r)).GetProperty("error").GetString());
    }

    [Fact]
    public async Task Contar_suma_vistas_e_ignora_lo_inventado()
    {
        var admin = await e.AdminAsync();
        await admin.PostAsJsonAsync("/api/admin/equipos", Equipo("contado"));
        var c = e.CreateClient();
        await c.PostAsJsonAsync("/api/contar", new { slug = "contado", tipo = "vista" });
        await c.PostAsJsonAsync("/api/contar", new { slug = "contado", tipo = "vista" });
        await c.PostAsJsonAsync("/api/contar", new { slug = "inventado", tipo = "vista" });
        var m = await Json(await admin.GetAsync("/api/admin/metricas"));
        var fila = m.EnumerateArray().Single(x => x.GetProperty("slug").GetString() == "contado");
        Assert.Equal(2, fila.GetProperty("vistas").GetInt64());
        Assert.DoesNotContain(m.EnumerateArray(), x => x.GetProperty("slug").GetString() == "inventado");
    }

    [Fact]
    public async Task Un_JSON_mal_formado_es_un_400_no_un_500()
    {
        var r = await e.CreateClient().PostAsync("/api/solicitudes",
            new StringContent("{no es json", System.Text.Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
    }

    [Fact]
    public async Task CORS_solo_deja_llamar_desde_el_sitio()
    {
        var c = e.CreateClient();
        HttpRequestMessage Previa(string origen)
        {
            var m = new HttpRequestMessage(HttpMethod.Options, "/api/solicitudes");
            m.Headers.Add("Origin", origen);
            m.Headers.Add("Access-Control-Request-Method", "POST");
            return m;
        }
        var propio = await c.SendAsync(Previa("https://sitio.prueba"));
        var ajeno = await c.SendAsync(Previa("https://sitio-malo.example"));
        Assert.Equal("https://sitio.prueba", propio.Headers.GetValues("Access-Control-Allow-Origin").Single());
        Assert.False(ajeno.Headers.Contains("Access-Control-Allow-Origin"));
    }
}

/// <summary>Subir fotos: sólo WebP de verdad, sólo a carpetas con nombre válido.</summary>
[Collection("api")]
public sealed class FotosPruebas(Entorno e)
{
    // La cabecera mínima de un WebP: "RIFF" + tamaño + "WEBP".
    private static byte[] Webp() => [.. "RIFF"u8.ToArray(), 4, 0, 0, 0, .. "WEBPVP8 "u8.ToArray()];

    private static MultipartFormDataContent Formulario(string slug, byte[] grande, byte[] chica)
    {
        var f = new MultipartFormDataContent { { new StringContent(slug), "slug" } };
        f.Add(new ByteArrayContent(grande), "w1400", "a.webp");
        f.Add(new ByteArrayContent(chica), "w700", "a.webp");
        return f;
    }

    [Fact]
    public async Task Una_foto_webp_se_guarda_y_se_sirve_con_cache_de_un_año()
    {
        var admin = await e.AdminAsync();
        var r = await admin.PostAsync("/api/admin/fotos", Formulario("con-foto", Webp(), Webp()));
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var url = (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("url").GetString()!;
        Assert.StartsWith("https://api.prueba/fotos/equipos/con-foto/", url);
        Assert.EndsWith("-w1400.webp", url);

        var foto = await e.CreateClient().GetAsync(new Uri(url).AbsolutePath);
        Assert.Equal(HttpStatusCode.OK, foto.StatusCode);
        Assert.Equal("image/webp", foto.Content.Headers.ContentType?.MediaType);
        Assert.Contains("immutable", foto.Headers.CacheControl?.ToString());
        // Y la de 700 existe con el mismo nombre: fotoSrcset() en remoto.js cuenta con eso.
        Assert.Equal(HttpStatusCode.OK, (await e.CreateClient().GetAsync(new Uri(url).AbsolutePath.Replace("-w1400", "-w700"))).StatusCode);
    }

    [Fact]
    public async Task Algo_que_no_es_webp_no_entra_aunque_diga_llamarse_webp()
    {
        var admin = await e.AdminAsync();
        var html = "<script>alert(1)</script>"u8.ToArray();
        var r = await admin.PostAsync("/api/admin/fotos", Formulario("trampa", html, html));
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
    }

    [Theory]
    [InlineData("../../windows")]
    [InlineData("..\\..\\windows")]
    [InlineData("Mayusculas")]
    [InlineData("")]
    public async Task Un_slug_raro_no_se_convierte_en_carpeta(string slug)
    {
        var admin = await e.AdminAsync();
        var r = await admin.PostAsync("/api/admin/fotos", Formulario(slug, Webp(), Webp()));
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
    }

    [Fact]
    public async Task Sin_sesion_no_se_sube_nada()
    {
        var r = await e.CreateClient().PostAsync("/api/admin/fotos", Formulario("sin-sesion", Webp(), Webp()));
        Assert.Equal(HttpStatusCode.Unauthorized, r.StatusCode);
    }
}
