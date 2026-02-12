using Bakabooru.Core.Entities;
using Bakabooru.Core.Interfaces;
using Bakabooru.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bakabooru.Scanner;

public class Worker : BackgroundService
{
    private readonly ILogger<Worker> _logger;
    private readonly IServiceScopeFactory _scopeFactory;

    public Worker(ILogger<Worker> logger, IServiceScopeFactory scopeFactory)
    {
        _logger = logger;
        _scopeFactory = scopeFactory;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Worker ensuring default scheduled jobs exist...");

        using (var scope = _scopeFactory.CreateScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<BakabooruDbContext>();
            
            // Default: Scan All Libraries every 24 hours
            var scanJobName = "Scan All Libraries";
            var defaultScanJob = await dbContext.ScheduledJobs
                .FirstOrDefaultAsync(j => j.JobName == scanJobName, stoppingToken);

            if (defaultScanJob == null)
            {
                _logger.LogInformation("Creating default scheduled job: {Name}", scanJobName);
                dbContext.ScheduledJobs.Add(new ScheduledJob
                {
                    JobName = scanJobName,
                    CronExpression = "1440", // Using Minutes for simplicity based on SchedulerService implementation
                    IsEnabled = true,
                    NextRun = DateTime.UtcNow.AddSeconds(5) // Run immediately on first setup
                });
                await dbContext.SaveChangesAsync(stoppingToken);
            }
        }
        
        _logger.LogInformation("Worker initialization complete. SchedulerService will handle job execution.");
    }
}
