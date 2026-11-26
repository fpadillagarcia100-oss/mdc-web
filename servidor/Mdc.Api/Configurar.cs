using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text.Json;

namespace Mdc.Api;

/// <summary>
/// `Mdc.Api configurar` — escribe los secretos del servicio.
///
/// Los pide aquí, con la entrada oculta, en vez de en el script de
/// instalación: un script de PowerShell que lee contraseñas y las pasa a
/// texto es justo lo que el antivirus busca (y con razón: es el patrón de
/// los programas que roban credenciales). El programa que va a usar los
/// secretos es el lugar natural para recibirlos.
///
/// El archivo (appsettings.Production.json, junto al ejecutable) queda
/// legible sólo para Administradores, SYSTEM y la cuenta del servicio.
/// </summary>
public static class Configurar
{
    public static int Ejecutar(string carpetaFotos, string cadena, bool rehacer, string? carpeta = null)
    {
        if (!OperatingSystem.IsWindows()) { Console.Error.WriteLine("Sólo en Windows."); return 1; }

        var archivo = Path.Combine(carpeta ?? AppContext.BaseDirectory, "appsettings.Production.json");
        if (File.Exists(archivo) && !rehacer)
        {
            Console.WriteLine("Los secretos ya están configurados (para cambiarlos: configurar --rehacer).");
            return 0;
        }

        Console.WriteLine();
        Console.WriteLine("AVISO_SECRETO: el mismo valor que tiene Cloudflare Pages en sus variables");
        Console.WriteLine("(Settings → Environment variables). Si no lo tienes, inventa uno largo y ponlo también allá.");
        var aviso = Oculto("AVISO_SECRETO: ");
        Console.WriteLine("DEPLOY_HOOK: la dirección del Deploy Hook de Cloudflare Pages (Settings → Builds → Deploy hooks).");
        var hook = Oculto("DEPLOY_HOOK: ");
        if (aviso.Length < 16) { Console.Error.WriteLine("AVISO_SECRETO es demasiado corto (mínimo 16)."); return 1; }
        if (!hook.StartsWith("https://", StringComparison.Ordinal)) { Console.Error.WriteLine("DEPLOY_HOOK debe empezar con https://"); return 1; }

        /* La clave de los tokens se genera aquí y no la ve nadie: con ella
           cualquiera podría fabricarse una sesión de administrador. */
        var clave = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));

        var json = JsonSerializer.Serialize(new
        {
            ConnectionStrings = new { Mdc = cadena },
            Jwt = new { Clave = clave },
            Avisos = new { Secreto = aviso },
            Publicar = new { DeployHook = hook },
            Fotos = new { Carpeta = carpetaFotos },
        }, new JsonSerializerOptions { WriteIndented = true });

        // Se crea vacío, se cierran los permisos, y SÓLO entonces se escribe.
        File.WriteAllText(archivo, "");
        var permisos = new FileSecurity();
        permisos.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);
        foreach (var quien in new IdentityReference[]
        {
            new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null),
            new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null),
        })
            permisos.AddAccessRule(new FileSystemAccessRule(quien, FileSystemRights.FullControl, AccessControlType.Allow));
        permisos.AddAccessRule(new FileSystemAccessRule(new NTAccount(@"NT SERVICE\MdcApi"), FileSystemRights.Read, AccessControlType.Allow));
        new FileInfo(archivo).SetAccessControl(permisos);
        File.WriteAllText(archivo, json);

        Console.WriteLine($"✓ Secretos guardados en {archivo} (sólo Administradores, SYSTEM y el servicio pueden leerlo).");
        return 0;
    }

    /// <summary>Lee de la consola sin mostrar lo que se escribe.</summary>
    private static string Oculto(string etiqueta)
    {
        Console.Write(etiqueta);
        var texto = new System.Text.StringBuilder();
        while (true)
        {
            var k = Console.ReadKey(intercept: true);
            /* Un Enter con el campo vacío se ignora. Al pegar desde el Bloc de
               notas suele venir un salto de línea pegado al final: sin esto, ese
               salto respondía la pregunta SIGUIENTE en blanco (pasó en la
               primera instalación). */
            if (k.Key == ConsoleKey.Enter) { if (texto.Length == 0) continue; break; }
            if (k.Key == ConsoleKey.Backspace) { if (texto.Length > 0) texto.Length--; continue; }
            if (!char.IsControl(k.KeyChar)) texto.Append(k.KeyChar);
        }
        Console.WriteLine();
        return texto.ToString().Trim();
    }
}
