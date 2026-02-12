using Bakabooru.Core.Interfaces;
using Bakabooru.Data;
using Bakabooru.Scanner;
using Bakabooru.Processing;
using Microsoft.EntityFrameworkCore;

var builder = Host.CreateApplicationBuilder(args);

builder.Services.AddDbContext<BakabooruDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection")));


// Modular Processing Pipeline
builder.Services.AddBakabooruProcessing();

builder.Services.AddHostedService<Worker>();

var host = builder.Build();
host.Run();
