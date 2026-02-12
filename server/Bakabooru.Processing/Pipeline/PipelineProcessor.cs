using Bakabooru.Core;
using Bakabooru.Core.Config;
using Bakabooru.Core.Entities;
using Bakabooru.Core.Interfaces;
using Bakabooru.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Collections.Concurrent;

namespace Bakabooru.Processing.Pipeline;

public class PipelineProcessor : IMediaProcessor
{
    private readonly ILogger<PipelineProcessor> _logger;
    private readonly IHasherService _hasher;
    private readonly IPostIngestionService _ingestionService;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IMediaSource _mediaSource;
    private readonly int _scanParallelism;

    public PipelineProcessor(
        ILogger<PipelineProcessor> logger,
        IHasherService hasher,
        IPostIngestionService ingestionService,
        IServiceScopeFactory scopeFactory,
        IMediaSource mediaSource,
        IOptions<BakabooruConfig> options)
    {
        _logger = logger;
        _hasher = hasher;
        _ingestionService = ingestionService;
        _scopeFactory = scopeFactory;
        _mediaSource = mediaSource;
        _scanParallelism = Math.Max(1, options.Value.Scanner.Parallelism);
    }

    /// <summary>Snapshot of an existing post for fast in-memory comparison.</summary>
    private record ExistingPostInfo(int Id, string Hash, long SizeBytes, DateTime? FileModifiedDate);

    public async Task ProcessDirectoryAsync(Library library, string directoryPath, IProgress<float>? progress = null, IProgress<string>? status = null, CancellationToken cancellationToken = default)
    {
        status?.Report($"Counting files in {directoryPath}...");
        _logger.LogInformation("Counting files in {Path}...", directoryPath);
        var total = await _mediaSource.CountAsync(directoryPath, cancellationToken);
        _logger.LogInformation("Found {Count} files to process in library {Library}", total, library.Name);

        // Pre-load existing posts for comparison
        status?.Report($"Loading existing posts database...");
        _logger.LogInformation("Loading existing posts for library {Library}...", library.Name);

        Dictionary<string, ExistingPostInfo> existingPosts;
        ConcurrentDictionary<string, byte> knownHashes;
        HashSet<string> excludedPaths;

        using (var scope = _scopeFactory.CreateScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<BakabooruDbContext>();
            var posts = await dbContext.Posts
                .AsNoTracking()
                .Select(p => new { p.Id, p.LibraryId, p.RelativePath, p.ContentHash, p.SizeBytes, p.FileModifiedDate })
                .ToListAsync(cancellationToken);

            existingPosts = posts
                .Where(p => p.LibraryId == library.Id)
                .GroupBy(p => p.RelativePath, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(
                    g => g.Key,
                    g => new ExistingPostInfo(g.First().Id, g.First().ContentHash, g.First().SizeBytes, g.First().FileModifiedDate),
                    StringComparer.OrdinalIgnoreCase);

            knownHashes = new ConcurrentDictionary<string, byte>(
                posts.Select(p => p.ContentHash).Distinct(StringComparer.OrdinalIgnoreCase)
                     .Select(h => new KeyValuePair<string, byte>(h, 0)),
                StringComparer.OrdinalIgnoreCase);

            excludedPaths = (await dbContext.ExcludedFiles
                .AsNoTracking()
                .Where(e => e.LibraryId == library.Id)
                .Select(e => e.RelativePath)
                .ToListAsync(cancellationToken))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
        }
        _logger.LogInformation("Loaded {Count} existing posts and {HashCount} unique hashes.", existingPosts.Count, knownHashes.Count);

        // Track which paths we see on disk for orphan detection
        var seenPaths = new ConcurrentDictionary<string, byte>(StringComparer.OrdinalIgnoreCase);
        // Track posts that need updating (changed files)
        var postsToUpdate = new ConcurrentBag<(int Id, string NewHash, long NewSize, DateTime NewMtime)>();

        status?.Report($"Scanning files...");
        _logger.LogInformation("Streaming files from {Path}...", directoryPath);

        int scanned = 0;

        var parallelOptions = new ParallelOptions
        {
            MaxDegreeOfParallelism = _scanParallelism,
            CancellationToken = cancellationToken
        };

        var items = _mediaSource.GetItemsAsync(directoryPath, cancellationToken);

        await Parallel.ForEachAsync(items, parallelOptions, async (item, ct) =>
        {
            seenPaths.TryAdd(item.RelativePath, 0);
            await ProcessFileOptimizedAsync(library, item, existingPosts, knownHashes, excludedPaths, postsToUpdate, ct);
            Interlocked.Increment(ref scanned);

            if (scanned % 10 == 0 || scanned == total)
            {
                if (total > 0)
                {
                    progress?.Report((float)scanned / total * 80); // Reserve 20% for cleanup
                    status?.Report($"Scanning: {scanned}/{total} files");
                }
            }
        });

        await _ingestionService.FlushAsync(cancellationToken);

        // Phase 2: Update changed files
        if (!postsToUpdate.IsEmpty)
        {
            status?.Report($"Updating {postsToUpdate.Count} changed files...");
            _logger.LogInformation("Updating {Count} changed files in library {Library}", postsToUpdate.Count, library.Name);

            using var scope = _scopeFactory.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<BakabooruDbContext>();

            foreach (var update in postsToUpdate)
            {
                var post = await dbContext.Posts.FindAsync(new object[] { update.Id }, cancellationToken);
                if (post != null)
                {
                    post.ContentHash = update.NewHash;
                    post.SizeBytes = update.NewSize;
                    post.FileModifiedDate = update.NewMtime;
                    // Reset enrichment fields so they get reprocessed
                    post.Width = 0;
                    post.Height = 0;
                    post.PerceptualHash = null;
                }
            }

            await dbContext.SaveChangesAsync(cancellationToken);
        }

        // Phase 3: Remove orphaned posts (files deleted from disk)
        var orphanPaths = existingPosts.Keys
            .Where(p => !seenPaths.ContainsKey(p))
            .ToList();

        if (orphanPaths.Count > 0)
        {
            status?.Report($"Removing {orphanPaths.Count} orphaned posts...");
            _logger.LogInformation("Removing {Count} orphaned posts from library {Library}", orphanPaths.Count, library.Name);

            using var scope = _scopeFactory.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<BakabooruDbContext>();

            // Remove in batches to avoid huge IN clauses
            const int batchSize = 100;
            for (int i = 0; i < orphanPaths.Count; i += batchSize)
            {
                var batch = orphanPaths.Skip(i).Take(batchSize).ToList();
                var orphanIds = batch.Select(p => existingPosts[p].Id).ToList();

                await dbContext.Posts
                    .Where(p => orphanIds.Contains(p.Id))
                    .ExecuteDeleteAsync(cancellationToken);
            }

            _logger.LogInformation("Removed {Count} orphaned posts", orphanPaths.Count);
        }

        progress?.Report(100);
        status?.Report($"Finished scanning {library.Name} — {scanned} files, {postsToUpdate.Count} updated, {orphanPaths.Count} orphans removed");
    }

    public async Task ProcessFileAsync(Library library, MediaSourceItem item, CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<BakabooruDbContext>();
        var relativePath = item.RelativePath;
        var existingPost = await dbContext.Posts.FirstOrDefaultAsync(p => p.LibraryId == library.Id && p.RelativePath == relativePath, cancellationToken);

        if (existingPost != null) return;

        var hash = await ComputeHashAsync(item.FullPath, cancellationToken);
        if (string.IsNullOrEmpty(hash)) return;

        var isDuplicate = await dbContext.Posts.AnyAsync(p => p.ContentHash == hash, cancellationToken);
        if (isDuplicate) return;

        await EnqueuePostAsync(library, item, hash, cancellationToken);
    }

    private async Task ProcessFileOptimizedAsync(
        Library library,
        MediaSourceItem item,
        Dictionary<string, ExistingPostInfo> existingPosts,
        ConcurrentDictionary<string, byte> knownHashes,
        HashSet<string> excludedPaths,
        ConcurrentBag<(int Id, string NewHash, long NewSize, DateTime NewMtime)> postsToUpdate,
        CancellationToken cancellationToken)
    {
        var relativePath = item.RelativePath;

        // Skip files on the exclusion list (e.g. duplicates resolved by user)
        if (excludedPaths.Contains(relativePath)) return;

        // Check if file already exists in DB
        if (existingPosts.TryGetValue(relativePath, out var existing))
        {
            // Change detection: compare file size and mtime
            var fileChanged = item.SizeBytes != existing.SizeBytes
                           || existing.FileModifiedDate == null
                           || Math.Abs((item.LastModifiedUtc - existing.FileModifiedDate.Value).TotalSeconds) > 1;

            if (!fileChanged) return; // File unchanged, skip

            // File has changed — re-hash and queue for update
            var newHash = await ComputeHashAsync(item.FullPath, cancellationToken);
            if (string.IsNullOrEmpty(newHash)) return;

            if (!string.Equals(newHash, existing.Hash, StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogInformation("File changed: {Path} (size: {OldSize}→{NewSize})", relativePath, existing.SizeBytes, item.SizeBytes);
                postsToUpdate.Add((existing.Id, newHash, item.SizeBytes, item.LastModifiedUtc));

                // Update the known hash set
                knownHashes.TryAdd(newHash, 0);
            }
            return;
        }

        // New file — hash and ingest
        var hash = await ComputeHashAsync(item.FullPath, cancellationToken);
        if (string.IsNullOrEmpty(hash)) return;

        // Check global deduplication
        if (!knownHashes.TryAdd(hash, 0))
        {
            _logger.LogDebug("Skipping duplicate content {Hash} at {Path}", hash, relativePath);
            return;
        }

        await EnqueuePostAsync(library, item, hash, cancellationToken);
    }

    private async Task<string> ComputeHashAsync(string filePath, CancellationToken cancellationToken)
    {
        return await _hasher.ComputeContentHashAsync(filePath, cancellationToken);
    }

    private async Task EnqueuePostAsync(Library library, MediaSourceItem item, string hash, CancellationToken cancellationToken)
    {
        var contentType = SupportedMedia.GetMimeType(Path.GetExtension(item.RelativePath));

        var post = new Post
        {
            LibraryId = library.Id,
            RelativePath = item.RelativePath,
            ContentHash = hash,
            SizeBytes = item.SizeBytes,
            FileModifiedDate = item.LastModifiedUtc,
            ContentType = contentType,
            ImportDate = DateTime.UtcNow
        };

        await _ingestionService.EnqueuePostAsync(post, cancellationToken);
    }
}
