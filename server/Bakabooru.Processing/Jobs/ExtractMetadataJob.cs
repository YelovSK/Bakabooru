using Bakabooru.Core;
using Bakabooru.Core.Interfaces;
using Bakabooru.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Bakabooru.Processing.Jobs;

public class ExtractMetadataJob : IJob
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ExtractMetadataJob> _logger;

    public ExtractMetadataJob(IServiceScopeFactory scopeFactory, ILogger<ExtractMetadataJob> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public string Name => "Extract Metadata";
    public string Description => "Extracts dimensions and content type for posts.";

    public async Task ExecuteAsync(JobContext context)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BakabooruDbContext>();
        var imageProcessor = scope.ServiceProvider.GetRequiredService<IImageProcessor>();

        context.Status.Report("Loading posts...");

        // In "missing" mode, find posts that haven't been processed yet (Width == 0)
        var query = db.Posts.Include(p => p.Library).AsQueryable();
        if (context.Mode == JobMode.Missing)
            query = query.Where(p => p.Width == 0 || string.IsNullOrEmpty(p.ContentType));

        var posts = await query
            .Select(p => new { p.Id, p.RelativePath, LibraryPath = p.Library.Path })
            .ToListAsync(context.CancellationToken);

        _logger.LogInformation("Extracting metadata for {Count} posts (mode: {Mode})", posts.Count, context.Mode);

        if (posts.Count == 0)
        {
            context.Status.Report("All metadata is up to date.");
            context.Progress.Report(100);
            return;
        }

        int processed = 0;
        int failed = 0;

        // Process in batches to avoid holding too many tracked entities
        const int batchSize = 100;
        for (int i = 0; i < posts.Count; i += batchSize)
        {
            var batch = posts.Skip(i).Take(batchSize).ToList();

            foreach (var post in batch)
            {
                context.CancellationToken.ThrowIfCancellationRequested();
                try
                {
                    var fullPath = Path.Combine(post.LibraryPath, post.RelativePath);
                    var metadata = await imageProcessor.GetMetadataAsync(fullPath, context.CancellationToken);
                    var contentType = SupportedMedia.GetMimeType(Path.GetExtension(post.RelativePath));

                    // Update the tracked entity
                    var entity = await db.Posts.FindAsync(new object[] { post.Id }, context.CancellationToken);
                    if (entity != null)
                    {
                        entity.Width = metadata.Width;
                        entity.Height = metadata.Height;
                        entity.ContentType = contentType;
                    }

                    processed++;
                }
                catch (Exception ex)
                {
                    failed++;
                    _logger.LogWarning(ex, "Failed to extract metadata for post {Id}: {Path}", post.Id, post.RelativePath);
                }
            }

            await db.SaveChangesAsync(context.CancellationToken);

            var total = processed + failed;
            context.Progress.Report((float)total / posts.Count * 100);
            context.Status.Report($"Extracting metadata: {total}/{posts.Count}");
        }

        context.Progress.Report(100);
        context.Status.Report($"Done — extracted metadata for {processed} posts ({failed} failed)");
        _logger.LogInformation("Metadata extraction complete: {Processed} processed, {Failed} failed", processed, failed);
    }
}
