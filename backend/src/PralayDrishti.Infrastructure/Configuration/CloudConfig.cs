using Microsoft.Extensions.Configuration;
using Npgsql;

namespace PralayDrishti.Infrastructure.Configuration;

/// <summary>
/// Hosting platforms (Render, Neon, Railway, Heroku) hand out connection strings as URLs -
/// postgres://user:pass@host:port/db and redis://user:pass@host:port - but Npgsql and StackExchange.Redis
/// only take their own key/value formats. This translates both, and falls back to the conventional
/// DATABASE_URL / REDIS_URL variables when ConnectionStrings:* is not set.
/// </summary>
public static class CloudConfig
{
    public static void Apply(IConfiguration config)
    {
        string? db = FirstSet(config.GetConnectionString("DefaultConnection"), config["DATABASE_URL"]);
        if (db != null) config["ConnectionStrings:DefaultConnection"] = Postgres(db);

        string? redisCs = config.GetConnectionString("Redis");
        string? redisUrl = config["REDIS_URL"];
        string? redis = !string.IsNullOrWhiteSpace(redisUrl) && IsLocalDefault(redisCs) ? redisUrl : FirstSet(redisCs, redisUrl);
        if (redis != null) config["ConnectionStrings:Redis"] = Redis(redis);
    }

    public static string Postgres(string value)
    {
        if (!TryUri(value, "postgres", "postgresql", out var uri)) return value;
        var (user, password) = UserInfo(uri);
        var b = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.IsDefaultPort || uri.Port <= 0 ? 5432 : uri.Port,
            Database = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/')),
            Username = user,
            Password = password,
            // managed databases generally want TLS; Prefer still works on a private network without it
            SslMode = Query(uri, "sslmode")?.ToLowerInvariant() switch
            {
                "disable" => SslMode.Disable,
                "allow" => SslMode.Allow,
                "require" => SslMode.Require,
                "verify-ca" => SslMode.VerifyCA,
                "verify-full" => SslMode.VerifyFull,
                _ => SslMode.Prefer,
            },
        };
        return b.ConnectionString;
    }

    public static string Redis(string value)
    {
        if (!TryUri(value, "redis", "rediss", out var uri)) return value;
        var (user, password) = UserInfo(uri);
        var parts = new List<string> { $"{uri.Host}:{(uri.Port > 0 ? uri.Port : 6379)}" };
        if (!string.IsNullOrEmpty(user) && user != "default") parts.Add($"user={user}");
        if (!string.IsNullOrEmpty(password)) parts.Add($"password={password}");
        if (uri.Scheme == "rediss") parts.Add("ssl=true");
        return string.Join(',', parts);
    }

    // appsettings.json ships "localhost:6379" for local dev; a platform-provided REDIS_URL should replace it
    private static bool IsLocalDefault(string? cs) => string.IsNullOrWhiteSpace(cs) || cs.StartsWith("localhost:", StringComparison.OrdinalIgnoreCase);

    private static string? FirstSet(params string?[] values) => values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v));

    private static bool TryUri(string value, string scheme1, string scheme2, out Uri uri)
    {
        uri = null!;
        return Uri.TryCreate(value.Trim(), UriKind.Absolute, out var u)
               && (u.Scheme == scheme1 || u.Scheme == scheme2)
               && (uri = u) != null;
    }

    private static (string? User, string? Password) UserInfo(Uri uri)
    {
        if (string.IsNullOrEmpty(uri.UserInfo)) return (null, null);
        string[] p = uri.UserInfo.Split(':', 2);
        return (Uri.UnescapeDataString(p[0]), p.Length > 1 ? Uri.UnescapeDataString(p[1]) : null);
    }

    private static string? Query(Uri uri, string key)
    {
        foreach (string pair in uri.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            string[] kv = pair.Split('=', 2);
            if (kv[0].Equals(key, StringComparison.OrdinalIgnoreCase)) return kv.Length > 1 ? Uri.UnescapeDataString(kv[1]) : "";
        }
        return null;
    }
}
