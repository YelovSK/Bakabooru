using Bakabooru.Core.Config;
using Bakabooru.Data;
using Bakabooru.Processing;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
var bakabooruConfig = builder.Configuration.GetSection(BakabooruConfig.SectionName).Get<BakabooruConfig>() ?? new BakabooruConfig();

builder.Services.Configure<BakabooruConfig>(builder.Configuration.GetSection(BakabooruConfig.SectionName));

// Add services to the container.
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAngular",
        policy =>
        {
            policy.WithOrigins("http://localhost:4200")
                  .AllowAnyHeader()
                  .AllowAnyMethod()
                  .AllowCredentials(); // Required for SignalR
        });
});

// Database
var resolvedConnectionString = StoragePathResolver.ResolveSqliteConnectionString(
    builder.Environment.ContentRootPath,
    builder.Configuration.GetConnectionString("DefaultConnection"),
    bakabooruConfig.Storage.DatabasePath);

builder.Services.AddDbContext<BakabooruDbContext>(options =>
    options.UseSqlite(resolvedConnectionString));


// Modular Processing Pipeline
builder.Services.AddBakabooruProcessing(bakabooruConfig);

var app = builder.Build();

// Auto-apply pending migrations on startup
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<BakabooruDbContext>();
    db.Database.Migrate();
}

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("AllowAngular");

var thumbnailPath = StoragePathResolver.ResolvePath(
    builder.Environment.ContentRootPath,
    bakabooruConfig.Storage.ThumbnailPath,
    "../../data/thumbnails");
if (!Directory.Exists(thumbnailPath))
{
    Directory.CreateDirectory(thumbnailPath);
}

app.Logger.LogInformation("Serving thumbnails from: {Path}", thumbnailPath);

if (app.Environment.IsDevelopment())
{
    app.Use(async (context, next) =>
    {
        if (context.Request.Path.StartsWithSegments("/thumbnails"))
        {
            await next();
            if (context.Response.StatusCode == 404)
            {
                var requestedFile = Path.GetFileName(context.Request.Path.Value ?? string.Empty);
                var filePath = Path.Combine(thumbnailPath, requestedFile);
                var exists = File.Exists(filePath);
                app.Logger.LogWarning("Thumbnail 404: {Url} (File exists at {Path}: {Exists})", context.Request.Path, filePath, exists);
            }
        }
        else
        {
            await next();
        }
    });
}

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(thumbnailPath),
    RequestPath = "/thumbnails"
});

app.UseAuthorization();

app.MapControllers();

// Redirect root to swagger
app.MapGet("/", () => Results.Redirect("/swagger"));

app.Run();
