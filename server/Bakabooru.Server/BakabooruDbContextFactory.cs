using Bakabooru.Core.Config;
using Bakabooru.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace Bakabooru.Server;

public class BakabooruDbContextFactory : IDesignTimeDbContextFactory<BakabooruDbContext>
{
    public BakabooruDbContext CreateDbContext(string[] args)
    {
        var contentRoot = AppContext.BaseDirectory;

        IConfigurationRoot configuration = new ConfigurationBuilder()
            .SetBasePath(contentRoot)
            .AddJsonFile("appsettings.json")
            .AddJsonFile("appsettings.Development.json", optional: true)
            .Build();

        var bakabooruConfig = configuration.GetSection(BakabooruConfig.SectionName).Get<BakabooruConfig>() ?? new BakabooruConfig();

        var resolvedConnectionString = StoragePathResolver.ResolveSqliteConnectionString(
            contentRoot,
            configuration.GetConnectionString("DefaultConnection"),
            bakabooruConfig.Storage.DatabasePath);

        var builder = new DbContextOptionsBuilder<BakabooruDbContext>();
        builder.UseSqlite(resolvedConnectionString);

        return new BakabooruDbContext(builder.Options);
    }
}
