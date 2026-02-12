using Bakabooru.Core;
using Bakabooru.Core.Config;
using Bakabooru.Core.Interfaces;
using Bakabooru.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Bakabooru.Processing.Jobs;

public class GenerateThumbnailsJob : IJob
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<GenerateThumbnailsJob> _logger;
    private readonly string _thumbnailPath;

    public GenerateThumbnailsJob(
        IServiceScopeFactory scopeFactory,
        ILogger<GenerateThumbnailsJob> logger,
        IOptions<BakabooruConfig> options,
        IHostEnvironment hostEnvironment)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _thumbnailPath = StoragePathResolver.ResolvePath(
            hostEnvironment.ContentRootPath,
            options.Value.Storage.ThumbnailPath,
            "../../data/thumbnails");

        if (!Directory.Exists(_thumbnailPath))
            Directory.CreateDirectory(_thumbnailPath);
    }

    public string Name => "Generate Thumbnails";
    public string Description => "Generates missing (or all) thumbnails for posts.";

    public async Task ExecuteAsync(JobContext context)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BakabooruDbContext>();
        var imageProcessor = scope.ServiceProvider.GetRequiredService<IImageProcessor>();

        context.Status.Report("Loading posts...");

        var posts = await db.Posts
            .Include(p => p.Library)
            .Where(p => !string.IsNullOrEmpty(p.ContentHash))
            .Select(p => new { p.Id, p.ContentHash, p.RelativePath, LibraryPath = p.Library.Path })
            .ToListAsync(context.CancellationToken);

        // Filter based on mode
        var toProcess = context.Mode == JobMode.All
            ? posts
            : posts.Where(p => !File.Exists(Path.Combine(_thumbnailPath, $"{p.ContentHash}.jpg"))).ToList();

        _logger.LogInformation("Generating thumbnails for {Count}/{Total} posts (mode: {Mode})", 
            toProcess.Count, posts.Count, context.Mode);

        if (toProcess.Count == 0)
        {
            context.Status.Report("All thumbnails are up to date.");
            context.Progress.Report(100);
            return;
        }

        int processed = 0;
        int failed = 0;
        var parallelOptions = new ParallelOptions
        {
            MaxDegreeOfParallelism = Math.Max(2, Environment.ProcessorCount / 2),
            CancellationToken = context.CancellationToken
        };

        await Parallel.ForEachAsync(toProcess, parallelOptions, async (post, ct) =>
        {
            try
            {
                var fullPath = Path.Combine(post.LibraryPath, post.RelativePath);
                var destination = Path.Combine(_thumbnailPath, $"{post.ContentHash}.jpg");

                if (context.Mode == JobMode.All || !File.Exists(destination))
                {
                    await imageProcessor.GenerateThumbnailAsync(fullPath, destination, 400, 400, ct);
                }

                var count = Interlocked.Increment(ref processed);
                if (count % 10 == 0 || count == toProcess.Count)
                {
                    context.Progress.Report((float)count / toProcess.Count * 100);
                    context.Status.Report($"Generating thumbnails: {count}/{toProcess.Count}");
                }
            }
            catch (Exception ex)
            {
                Interlocked.Increment(ref failed);
                _logger.LogWarning(ex, "Failed to generate thumbnail for post {Id}: {Path}", post.Id, post.RelativePath);
            }
        });

        context.Progress.Report(100);
        context.Status.Report($"Done — generated {processed} thumbnails ({failed} failed)");
        _logger.LogInformation("Thumbnail generation complete: {Processed} generated, {Failed} failed", processed, failed);
    }
}
