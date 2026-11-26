using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Dapper;

namespace Mdc.Api.Pruebas;

/// <summary>Entrar, renovar, salir, y quién pasa por la puerta del panel.</summary>
[Collection("api")]
public sealed class AccesoPruebas(Entorno e)
{
    private static async Task<JsonElement> Json(HttpResponseMessage r) => await r.Content.ReadFromJsonAsync<JsonElement>();

    [Fact]
    public async Task Con_la_contraseña_correcta_se_entra_y_se_sabe_quien_es()
    {
        var c = await e.AdminAsync();
        var yo = await Json(await c.GetAsync("/api/auth/yo"));
        Assert.Equal(Entorno.CorreoAdmin, yo.GetProperty("correo").GetString());
        Assert.Equal("admin", yo.GetProperty("rol").GetString());
    }

    [Fact]
    public async Task Un_correo_que_no_existe_y_una_contraseña_mala_responden_lo_mismo()
    {
        var c = e.CreateClient();
        var noExiste = await c.PostAsJsonAsync("/api/auth/entrar", new { correo = "nadie@mdc.mx", contrasena = "lo-que-sea-123" });
        var mala = await c.PostAsJsonAsync("/api/auth/entrar", new { correo = Entorno.CorreoStaff, contrasena = "equivocada-123" });
        Assert.Equal(HttpStatusCode.BadRequest, noExiste.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, mala.StatusCode);
        // Distinguirlos le diría a un atacante qué correos son cuentas.
        Assert.Equal(await noExiste.Content.ReadAsStringAsync(), await mala.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Cinco_contraseñas_malas_bloquean_la_cuenta_aunque_luego_llegue_la_buena()
    {
        await using (var b = e.Base())
            await b.ExecuteAsync(
                "INSERT INTO dbo.usuarios (correo, nombre, rol, hash_contrasena) VALUES ('bloqueo@mdc.mx', N'Bloqueo', 'staff', @h)",
                new { h = Mdc.Api.Endpoints.AuthEndpoints.HashDe("la-buena-123456") });
        var c = e.CreateClient();
        for (var i = 0; i < 5; i++)
            await c.PostAsJsonAsync("/api/auth/entrar", new { correo = "bloqueo@mdc.mx", contrasena = "mala-" + i });
        var buena = await c.PostAsJsonAsync("/api/auth/entrar", new { correo = "bloqueo@mdc.mx", contrasena = "la-buena-123456" });
        Assert.Equal((HttpStatusCode)429, buena.StatusCode);
    }

    [Fact]
    public async Task El_token_de_renovacion_se_usa_una_sola_vez_y_reusarlo_cierra_todas_las_sesiones()
    {
        var c = e.CreateClient();
        var s1 = await Json(await c.PostAsJsonAsync("/api/auth/entrar", new { correo = Entorno.CorreoStaff, contrasena = Entorno.ClaveStaff }));
        var r1 = s1.GetProperty("refresh_token").GetString();

        var s2 = await c.PostAsJsonAsync("/api/auth/renovar", new { refresh_token = r1 });
        Assert.Equal(HttpStatusCode.OK, s2.StatusCode);
        var r2 = (await Json(s2)).GetProperty("refresh_token").GetString();
        Assert.NotEqual(r1, r2);

        // Alguien reusa el viejo: se le niega Y se cae también el nuevo.
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.PostAsJsonAsync("/api/auth/renovar", new { refresh_token = r1 })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.PostAsJsonAsync("/api/auth/renovar", new { refresh_token = r2 })).StatusCode);
    }

    [Fact]
    public async Task Salir_invalida_el_token_de_renovacion()
    {
        var c = e.CreateClient();
        var s = await Json(await c.PostAsJsonAsync("/api/auth/entrar", new { correo = Entorno.CorreoAdmin, contrasena = Entorno.ClaveAdmin }));
        var r = s.GetProperty("refresh_token").GetString();
        await c.PostAsJsonAsync("/api/auth/salir", new { refresh_token = r });
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.PostAsJsonAsync("/api/auth/renovar", new { refresh_token = r })).StatusCode);
    }

    [Fact]
    public async Task Sin_sesion_el_panel_no_contesta()
    {
        var r = await e.CreateClient().GetAsync("/api/admin/todo");
        Assert.Equal(HttpStatusCode.Unauthorized, r.StatusCode);
    }

    [Fact]
    public async Task Un_token_inventado_tampoco()
    {
        var c = e.CreateClient();
        c.DefaultRequestHeaders.Authorization = new("Bearer",
            "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDAiLCJyb2wiOiJhZG1pbiJ9.firma-falsa");
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.GetAsync("/api/admin/todo")).StatusCode);
    }

    [Fact]
    public async Task Staff_tiene_sesion_pero_no_entra_al_panel()
    {
        var c = await e.ComoAsync(Entorno.CorreoStaff, Entorno.ClaveStaff);
        Assert.Equal(HttpStatusCode.Forbidden, (await c.GetAsync("/api/admin/todo")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await c.PostAsJsonAsync("/api/admin/publicar", new { })).StatusCode);
    }

    [Fact]
    public async Task Quitarle_el_rol_a_alguien_lo_saca_del_panel_en_ese_momento_no_en_una_hora()
    {
        await using (var b = e.Base())
            await b.ExecuteAsync(
                "INSERT INTO dbo.usuarios (correo, nombre, rol, hash_contrasena) VALUES ('temporal@mdc.mx', N'Temporal', 'admin', @h)",
                new { h = Mdc.Api.Endpoints.AuthEndpoints.HashDe("temporal-123456") });
        var c = await e.ComoAsync("temporal@mdc.mx", "temporal-123456");
        Assert.Equal(HttpStatusCode.OK, (await c.GetAsync("/api/admin/todo")).StatusCode);

        await using (var b = e.Base())
            await b.ExecuteAsync("UPDATE dbo.usuarios SET rol = 'staff' WHERE correo = 'temporal@mdc.mx'");
        // Su token todavía dice "admin"; la base ya no.
        Assert.Equal(HttpStatusCode.Forbidden, (await c.GetAsync("/api/admin/todo")).StatusCode);
    }

    [Fact]
    public async Task La_invitacion_deja_elegir_la_contraseña_una_sola_vez()
    {
        var admin = await e.AdminAsync();
        var r = await admin.PostAsJsonAsync("/api/admin/usuarios", new { correo = "nuevo@mdc.mx", nombre = "Nuevo", rol = "staff" });
        Assert.Equal(HttpStatusCode.Created, r.StatusCode);

        // El enlace sólo viaja por correo; aquí se simula poniendo un token conocido.
        var token = Mdc.Api.Seguridad.Tokens.Aleatorio();
        await using (var b = e.Base())
            await b.ExecuteAsync("UPDATE dbo.usuarios SET invitacion_hash = @h WHERE correo = 'nuevo@mdc.mx'",
                new { h = Mdc.Api.Seguridad.Tokens.Hash(token) });

        var c = e.CreateClient();
        Assert.Equal(HttpStatusCode.BadRequest,
            (await c.PostAsJsonAsync("/api/auth/aceptar-invitacion", new { token, contrasena = "corta" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await c.PostAsJsonAsync("/api/auth/aceptar-invitacion", new { token, contrasena = "una-contraseña-larga" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await c.PostAsJsonAsync("/api/auth/aceptar-invitacion", new { token, contrasena = "otra-contraseña-larga" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await c.PostAsJsonAsync("/api/auth/entrar", new { correo = "nuevo@mdc.mx", contrasena = "una-contraseña-larga" })).StatusCode);
    }

    [Fact]
    public async Task Nadie_se_cambia_el_rol_a_si_mismo_ni_se_borra()
    {
        var admin = await e.AdminAsync();
        Guid yo;
        await using (var b = e.Base()) yo = await b.ExecuteScalarAsync<Guid>("SELECT id FROM dbo.usuarios WHERE correo = @c", new { c = Entorno.CorreoAdmin });
        var r = await admin.PatchAsJsonAsync("/api/admin/usuarios", new { id = yo, rol = "staff" });
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        var borrar = new HttpRequestMessage(HttpMethod.Delete, "/api/admin/usuarios") { Content = JsonContent.Create(new { id = yo }) };
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.SendAsync(borrar)).StatusCode);
    }
}

/// <summary>El freno por IP, con un límite bajo y su propia base.</summary>
public sealed class LimitePruebas
{
    [Fact]
    public async Task Pasado_el_limite_por_minuto_responde_429_con_un_mensaje()
    {
        var e = new Entorno { LimiteAcceso = 3, NombreBase = "MdcPrueba_Api_Limite" };
        await e.InitializeAsync();
        try
        {
            var c = e.CreateClient();
            HttpResponseMessage? ultima = null;
            for (var i = 0; i < 4; i++)
                ultima = await c.PostAsJsonAsync("/api/auth/entrar", new { correo = "x@y.mx", contrasena = "z-" + i });
            Assert.Equal((HttpStatusCode)429, ultima!.StatusCode);
            Assert.Contains("Demasiadas", await ultima.Content.ReadAsStringAsync());
        }
        finally { await ((IAsyncLifetime)e).DisposeAsync(); }
    }
}
