using Microsoft.Extensions.Configuration;
using Npgsql;
using PralayDrishti.Infrastructure.Configuration;
using StackExchange.Redis;

namespace PralayDrishti.UnitTests.Infrastructure;

public class CloudConfigTests
{
    [Fact]
    public void Render_style_postgres_url_becomes_npgsql_keyvalue()
    {
        string cs = CloudConfig.Postgres("postgres://pralay:s3cr%40t@dpg-abc123-a.oregon-postgres.render.com/pralaydrishti");
        var b = new NpgsqlConnectionStringBuilder(cs);

        Assert.Equal("dpg-abc123-a.oregon-postgres.render.com", b.Host);
        Assert.Equal(5432, b.Port);
        Assert.Equal("pralaydrishti", b.Database);
        Assert.Equal("pralay", b.Username);
        Assert.Equal("s3cr@t", b.Password);   // percent-encoded characters are decoded
        Assert.Equal(SslMode.Prefer, b.SslMode);
    }

    [Fact]
    public void Neon_style_url_keeps_port_and_sslmode()
    {
        var b = new NpgsqlConnectionStringBuilder(
            CloudConfig.Postgres("postgresql://u:p@ep-cool-1.ap-southeast-1.aws.neon.tech:6543/neondb?sslmode=require&channel_binding=require"));

        Assert.Equal(6543, b.Port);
        Assert.Equal("neondb", b.Database);
        Assert.Equal(SslMode.Require, b.SslMode);
    }

    [Fact]
    public void Keyvalue_postgres_string_is_left_alone()
    {
        const string cs = "Host=localhost;Port=5432;Database=pralaydrishti;Username=pralay;Password=pralay";
        Assert.Equal(cs, CloudConfig.Postgres(cs));
    }

    [Theory]
    [InlineData("redis://red-abc123:6379", "red-abc123:6379", false, null)]
    [InlineData("rediss://default:pw@oregon-keyvalue.render.com:6379", "oregon-keyvalue.render.com:6379", true, "pw")]
    public void Redis_url_becomes_stackexchange_options(string url, string endpoint, bool ssl, string? password)
    {
        var o = ConfigurationOptions.Parse(CloudConfig.Redis(url));

        Assert.Equal(endpoint, o.EndPoints.Single().ToString()!.Replace("Unspecified/", ""));
        Assert.Equal(ssl, o.Ssl);
        Assert.Equal(password, o.Password);
    }

    [Fact]
    public void Redis_plain_string_is_left_alone()
    {
        Assert.Equal("localhost:6379", CloudConfig.Redis("localhost:6379"));
    }

    [Fact]
    public void DATABASE_URL_and_REDIS_URL_fill_empty_connection_strings()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:DefaultConnection"] = "",
            ["DATABASE_URL"] = "postgres://a:b@db.example:5432/app",
            ["REDIS_URL"] = "redis://cache.example:6379",
        }).Build();

        CloudConfig.Apply(config);

        Assert.Equal("db.example", new NpgsqlConnectionStringBuilder(config.GetConnectionString("DefaultConnection")).Host);
        Assert.Equal("cache.example:6379", config.GetConnectionString("Redis"));
    }

    [Fact]
    public void Explicit_connection_string_wins_over_DATABASE_URL()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:DefaultConnection"] = "postgres://x:y@explicit.example/db1",
            ["DATABASE_URL"] = "postgres://a:b@ignored.example/db2",
        }).Build();

        CloudConfig.Apply(config);

        Assert.Equal("explicit.example", new NpgsqlConnectionStringBuilder(config.GetConnectionString("DefaultConnection")).Host);
    }
}
