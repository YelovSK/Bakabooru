using Bakabooru.Data;
using Bakabooru.Processing;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

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
builder.Services.AddDbContext<BakabooruDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection")));


// Modular Processing Pipeline
builder.Services.AddBakabooruProcessing();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("AllowAngular");

var thumbnailPath = Path.GetFullPath(builder.Configuration["Bakabooru:Storage:ThumbnailPath"] ?? "thumbnails");
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
                var requestedFile = Path.GetFileName(context.Request.Path.Value);
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
