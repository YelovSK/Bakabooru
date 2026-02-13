using Bakabooru.Core.Entities;
using Bakabooru.Core.Interfaces;
using Bakabooru.Data;
using Cronos;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Bakabooru.Processing.Services;

public class SchedulerService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<SchedulerService> _logger;
    private readonly TimeSpan _pollingInterval = TimeSpan.FromSeconds(30);

    /// <summary>
    /// Default scheduled jobs to seed if they don't exist in the database.
    /// All disabled by default — users can enable and configure from the Jobs page.
    /// </summary>
    private static readonly (string Name, string Cron)[] DefaultJobs =
    [
        ("Scan All Libraries", "0 */6 * * *"),    // Every 6 hours
        ("Generate Thumbnails", "30 */6 * * *"),   // 30 min after scan
        ("Cleanup Orphaned Thumbnails", "45 */6 * * *"), // 45 min after scan
        ("Extract Metadata", "35 */6 * * *"),      // 35 min after scan
        ("Compute Similarity", "40 */6 * * *"),    // 40 min after scan
        ("Find Duplicates", "0 3 * * 0"),          // Weekly, Sunday 3 AM
    ];

    public SchedulerService(IServiceScopeFactory scopeFactory, ILogger<SchedulerService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Scheduler Service is starting.");

        // Seed default scheduled jobs on startup
        await SeedDefaultJobsAsync(stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CheckScheduledJobsAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred while checking scheduled jobs.");
            }

            await Task.Delay(_pollingInterval, stoppingToken);
        }
    }

    private async Task SeedDefaultJobsAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<BakabooruDbContext>();

        var existingNames = await dbContext.ScheduledJobs
            .Select(j => j.JobName)
            .ToListAsync(cancellationToken);

        var existingSet = new HashSet<string>(existingNames, StringComparer.OrdinalIgnoreCase);
        bool added = false;

        foreach (var (name, cron) in DefaultJobs)
        {
            if (existingSet.Contains(name)) continue;

            dbContext.ScheduledJobs.Add(new ScheduledJob
            {
                JobName = name,
                CronExpression = cron,
                IsEnabled = false,
                NextRun = CalculateNextRun(cron)
            });
            added = true;
            _logger.LogInformation("Seeded scheduled job: {Name} ({Cron})", name, cron);
        }

        if (added)
            await dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task CheckScheduledJobsAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<BakabooruDbContext>();
        var jobService = scope.ServiceProvider.GetRequiredService<IJobService>();

        var jobsToRun = await dbContext.ScheduledJobs
            .Where(j => j.IsEnabled && (j.NextRun == null || j.NextRun <= DateTime.UtcNow))
            .ToListAsync(cancellationToken);

        foreach (var scheduledJob in jobsToRun)
        {
            _logger.LogInformation("Triggering scheduled job: {Name}", scheduledJob.JobName);

            try
            {
                await jobService.StartJobAsync(scheduledJob.JobName, cancellationToken);

                scheduledJob.LastRun = DateTime.UtcNow;
                scheduledJob.NextRun = CalculateNextRun(scheduledJob.CronExpression);

                await dbContext.SaveChangesAsync(cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to trigger scheduled job {Name}", scheduledJob.JobName);
            }
        }
    }

    private DateTime? CalculateNextRun(string cronExpression)
    {
        try
        {
            var expression = CronExpression.Parse(cronExpression);
            var next = expression.GetNextOccurrence(DateTime.UtcNow, inclusive: false);
            return next;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to parse cron expression '{Cron}', defaulting to 24h", cronExpression);
            return DateTime.UtcNow.AddHours(24);
        }
    }
}
