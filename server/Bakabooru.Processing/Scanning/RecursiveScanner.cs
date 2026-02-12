using Bakabooru.Core.Interfaces;
using Bakabooru.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.DependencyInjection;

namespace Bakabooru.Processing.Scanning;

public class RecursiveScanner : IScannerService
{
    private readonly ILogger<RecursiveScanner> _logger;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IMediaProcessor _mediaProcessor;

    public RecursiveScanner(
        ILogger<RecursiveScanner> logger,
        IServiceScopeFactory scopeFactory,
        IMediaProcessor mediaProcessor)
    {
        _logger = logger;
        _scopeFactory = scopeFactory;
        _mediaProcessor = mediaProcessor;
    }
    public async Task ScanAllLibrariesAsync(IProgress<float>? progress = null, IProgress<string>? status = null, CancellationToken cancellationToken = default)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<BakabooruDbContext>();
        
        var libraries = await dbContext.Libraries.ToListAsync(cancellationToken);
        _logger.LogInformation("Found {Count} libraries to scan.", libraries.Count);
        
        int totalLibraries = libraries.Count;
        int currentLibraryIndex = 0;

        foreach (var library in libraries)
        {
            if (cancellationToken.IsCancellationRequested) break;

            _logger.LogInformation("Starting scan for library {Id}: {Path}", library.Id, library.Path);
            status?.Report($"Scanning library: {library.Name}");
            
            // Create a sub-progress that maps 0-100 of this library to a slice of the total progress
            var subProgress = new Progress<float>(percent => 
            {
                if (progress != null)
                {
                    float baseProgress = (float)currentLibraryIndex / totalLibraries * 100;
                    float slice = 100f / totalLibraries;
                    float currentTotal = baseProgress + (percent / 100f * slice);
                    progress.Report(currentTotal);
                }
            });

            await _mediaProcessor.ProcessDirectoryAsync(library, library.Path, subProgress, status, cancellationToken);
            currentLibraryIndex++;
        }
    }

    public async Task ScanLibraryAsync(int libraryId, IProgress<float>? progress = null, IProgress<string>? status = null, CancellationToken cancellationToken = default)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<BakabooruDbContext>();
        
        var library = await dbContext.Libraries.FindAsync(new object[] { libraryId }, cancellationToken);
        if (library == null)
        {
            _logger.LogWarning("Library {LibraryId} not found.", libraryId);
            return;
        }

        _logger.LogInformation("Scanning library: {Path}", library.Path);
        status?.Report($"Scanning library: {library.Name}");
        await _mediaProcessor.ProcessDirectoryAsync(library, library.Path, progress, status, cancellationToken);
        progress?.Report(100);
        status?.Report($"Completed scan for: {library.Name}");
        _logger.LogInformation("Finished scanning library: {Path}", library.Path);
    }
}
