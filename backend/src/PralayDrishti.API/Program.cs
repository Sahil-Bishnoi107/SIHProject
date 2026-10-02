using PralayDrishti.API.Extensions;
using PralayDrishti.Application;
using PralayDrishti.Infrastructure;
using PralayDrishti.Infrastructure.Configuration;

var builder = WebApplication.CreateBuilder(args);

// Render/Heroku-style hosting: connection strings arrive as URLs and the port as $PORT
CloudConfig.Apply(builder.Configuration);
if (Environment.GetEnvironmentVariable("PORT") is { Length: > 0 } port)
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration, builder.Environment);
builder.Services.AddPresentation(builder.Configuration);

var app = builder.Build();
await app.UsePresentationAsync();
app.Run();

// exposed for WebApplicationFactory in the integration tests
public partial class Program { }
