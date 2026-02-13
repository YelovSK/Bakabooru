using Bakabooru.Core.Interfaces;
using Bakabooru.Processing.Scanning;
using Microsoft.Extensions.DependencyInjection;

namespace Bakabooru.Processing.Jobs;

public class ScanAllLibrariesJob : IJob
{
    private readonly IServiceScopeFactory _scopeFactory;

    public ScanAllLibrariesJob(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;
    }

    public string Name => "Scan All Libraries";
    public string Description => "Triggers a recursive scan for all configured libraries.";
    public bool SupportsAllMode => false;

    public async Task ExecuteAsync(JobContext context)
    {
        using var scope = _scopeFactory.CreateScope();
        var scannerService = scope.ServiceProvider.GetRequiredService<IScannerService>();

        var phase = "Scanning libraries...";

        var progress = new Progress<float>(percent =>
        {
            var normalized = percent <= 1f ? percent * 100f : percent;
            var processed = (int)Math.Clamp(Math.Round(normalized), 0, 100);
            context.State.Report(new JobState
            {
                Phase = phase,
                Processed = processed,
                Total = 100
            });
        });

        var status = new Progress<string>(message =>
        {
            phase = string.IsNullOrWhiteSpace(message) ? "Scanning libraries..." : message.Trim();
            context.State.Report(new JobState
            {
                Phase = phase,
                Processed = null,
                Total = null
            });
        });

        context.State.Report(new JobState
        {
            Phase = phase,
            Processed = 0,
            Total = 100
        });

        await scannerService.ScanAllLibrariesAsync(progress, status, context.CancellationToken);

        context.State.Report(new JobState
        {
            Phase = "Completed",
            Processed = 100,
            Total = 100,
            Summary = "Finished scanning all configured libraries."
        });
    }
}
