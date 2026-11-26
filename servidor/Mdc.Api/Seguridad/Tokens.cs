using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Mdc.Api.Seguridad;

/// <summary>
/// Los dos tokens de una sesión, como los daba Supabase:
///
/// · Acceso (JWT, 1 hora). Viaja en cada petición. Corto a propósito: si se
///   filtra, sirve poco tiempo. No se guarda en la base.
/// · Renovación (30 días). Sólo sirve para pedir otro acceso. En la base se
///   guarda su SHA-256, nunca el token: quien lea la tabla no puede entrar.
/// </summary>
public sealed class Tokens(IConfiguration config)
{
    public static readonly TimeSpan VidaAcceso = TimeSpan.FromHours(1);
    public static readonly TimeSpan VidaRenovacion = TimeSpan.FromDays(30);
    public const string Emisor = "mdc-api";

    public static SymmetricSecurityKey Llave(IConfiguration config)
    {
        var clave = config["Jwt:Clave"];
        /* 32 bytes es el mínimo para HS256. Arrancar con una clave corta o de
           ejemplo sería firmar tokens que cualquiera puede falsificar: mejor
           que el servicio no arranque. */
        if (string.IsNullOrWhiteSpace(clave) || Encoding.UTF8.GetByteCount(clave) < 32)
            throw new InvalidOperationException("Jwt:Clave falta o es demasiado corta (mínimo 32 bytes).");
        return new SymmetricSecurityKey(Encoding.UTF8.GetBytes(clave));
    }

    public string Acceso(Guid usuario, string rol)
    {
        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = Emisor,
            Audience = Emisor,
            Expires = DateTime.UtcNow.Add(VidaAcceso),
            Subject = new ClaimsIdentity([new Claim("sub", usuario.ToString()), new Claim("rol", rol)]),
            SigningCredentials = new SigningCredentials(Llave(config), SecurityAlgorithms.HmacSha256),
        };
        return new JsonWebTokenHandler().CreateToken(descriptor);
    }

    /// <summary>32 bytes al azar en base64url: imposible de adivinar, cómodo en una URL.</summary>
    public static string Aleatorio() => Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));

    public static string Hash(string token) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}
