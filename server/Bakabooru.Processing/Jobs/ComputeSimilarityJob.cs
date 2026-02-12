using Bakabooru.Core;
using Bakabooru.Core.Interfaces;
using Bakabooru.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Bakabooru.Processing.Jobs;

public class ComputeSimilarityJob : IJob
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ComputeSimilarityJob> _logger;

    public ComputeSimilarityJob(IServiceScopeFactory scopeFactory, ILogger<ComputeSimilarityJob> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public string Name => "Compute Similarity";
    public string Description => "Computes perceptual hashes (dHash) for image posts.";

    public async Task ExecuteAsync(JobContext context)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BakabooruDbContext>();
        var similarityService = scope.ServiceProvider.GetRequiredService<ISimilarityService>();

        context.Status.Report("Loading posts...");

        // Only images have perceptual hashes
        var query = db.Posts.Include(p => p.Library).AsQueryable();
        if (context.Mode == JobMode.Missing)
            query = query.Where(p => p.PerceptualHash == null || p.PerceptualHash == 0);

        var posts = await query
            .Select(p => new { p.Id, p.RelativePath, LibraryPath = p.Library.Path })
            .ToListAsync(context.CancellationToken);

        // Filter to images only (similarity hashing doesn't apply to video)
        posts = posts.Where(p => SupportedMedia.IsImage(Path.GetExtension(p.RelativePath))).ToList();

        _logger.LogInformation("Computing similarity hashes for {Count} posts (mode: {Mode})", posts.Count, context.Mode);

        if (posts.Count == 0)
        {
            context.Status.Report("All similarity hashes are up to date.");
            context.Progress.Report(100);
            return;
        }

        int processed = 0;
        int failed = 0;

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
                    var hash = await similarityService.ComputeHashAsync(fullPath, context.CancellationToken);

                    var entity = await db.Posts.FindAsync(new object[] { post.Id }, context.CancellationToken);
                    if (entity != null)
                    {
                        entity.PerceptualHash = hash;
                    }

                    processed++;
                }
                catch (Exception ex)
                {
                    failed++;
                    _logger.LogWarning(ex, "Failed to compute similarity hash for post {Id}: {Path}", post.Id, post.RelativePath);
                }
            }

            await db.SaveChangesAsync(context.CancellationToken);

            var total = processed + failed;
            context.Progress.Report((float)total / posts.Count * 100);
            context.Status.Report($"Computing similarity hashes: {total}/{posts.Count}");
        }

        context.Progress.Report(100);
        context.Status.Report($"Done — computed {processed} similarity hashes ({failed} failed)");
        _logger.LogInformation("Similarity hash computation complete: {Processed} processed, {Failed} failed", processed, failed);
    }
}
