using Bakabooru.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace Bakabooru.Server;

public class BakabooruDbContextFactory : IDesignTimeDbContextFactory<BakabooruDbContext>
{
    public BakabooruDbContext CreateDbContext(string[] args)
    {
        // Build configuration
        IConfigurationRoot configuration = new ConfigurationBuilder()
            .SetBasePath(Directory.GetCurrentDirectory())
            .AddJsonFile("appsettings.json")
            .Build();

        // Create options
        var builder = new DbContextOptionsBuilder<BakabooruDbContext>();
        var connectionString = configuration.GetConnectionString("DefaultConnection");
        
        builder.UseSqlite(connectionString);

        return new BakabooruDbContext(builder.Options);
    }
}
