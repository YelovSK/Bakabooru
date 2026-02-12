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

    public async Task ExecuteAsync(JobContext context)
    {
        using var scope = _scopeFactory.CreateScope();
        var scannerService = scope.ServiceProvider.GetRequiredService<IScannerService>();
        await scannerService.ScanAllLibrariesAsync(context.Progress, context.Status, context.CancellationToken);
    }
}
