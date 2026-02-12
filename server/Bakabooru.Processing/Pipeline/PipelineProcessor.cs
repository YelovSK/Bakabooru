using Bakabooru.Core;
using Bakabooru.Core.Entities;
using Bakabooru.Core.Interfaces;
using Bakabooru.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using System.Collections.Concurrent;

namespace Bakabooru.Processing.Pipeline;

public class PipelineProcessor : IMediaProcessor
{
    private readonly ILogger<PipelineProcessor> _logger;
    private readonly IHasherService _hasher;
    private readonly IPostIngestionService _ingestionService;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IMediaSource _mediaSource;
    private readonly bool _skipVideoHashing;

    public PipelineProcessor(
        ILogger<PipelineProcessor> logger,
        IHasherService hasher,
        IPostIngestionService ingestionService,
        IServiceScopeFactory scopeFactory,
        IMediaSource mediaSource,
        Microsoft.Extensions.Configuration.IConfiguration config)
    {
        _logger = logger;
        _hasher = hasher;
        _ingestionService = ingestionService;
        _scopeFactory = scopeFactory;
        _mediaSource = mediaSource;
        _skipVideoHashing = config.GetValue<bool>("Bakabooru:Scanner:SkipVideoHashing");
    }

    public async Task ProcessDirectoryAsync(Library library, string directoryPath, IProgress<float>? progress = null, IProgress<string>? status = null, CancellationToken cancellationToken = default)
    {
        status?.Report($"Counting files in {directoryPath}...");
        _logger.LogInformation("Counting files in {Path}...", directoryPath);
        var total = await _mediaSource.CountAsync(directoryPath, cancellationToken);
        _logger.LogInformation("Found {Count} files to process in library {Library}", total, library.Name);

        // Pre-load existing posts for bulk deduplication
        status?.Report($"Loading existing posts database...");
        _logger.LogInformation("Loading existing posts for library {Library}...", library.Name);
        Dictionary<string, string> existingPosts;
        ConcurrentDictionary<string, byte> knownHashes;
        HashSet<string> excludedPaths;
        
        using (var scope = _scopeFactory.CreateScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<BakabooruDbContext>();
            var posts = await dbContext.Posts
                .AsNoTracking()
                .Select(p => new { p.LibraryId, p.RelativePath, p.Md5Hash })
                .ToListAsync(cancellationToken);

            existingPosts = posts
                .Where(p => p.LibraryId == library.Id)
                .GroupBy(p => p.RelativePath, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.First().Md5Hash, StringComparer.OrdinalIgnoreCase);

            knownHashes = new ConcurrentDictionary<string, byte>(
                posts.Select(p => p.Md5Hash).Distinct(StringComparer.OrdinalIgnoreCase)
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

        status?.Report($"Queueing files...");
        _logger.LogInformation("Streaming files from {Path}...", directoryPath);

        int scanned = 0;

        var parallelOptions = new ParallelOptions 
        { 
            MaxDegreeOfParallelism = Environment.ProcessorCount,
            CancellationToken = cancellationToken 
        };

        var items = _mediaSource.GetItemsAsync(directoryPath, cancellationToken);

        await Parallel.ForEachAsync(items, parallelOptions, async (item, ct) =>
        {
            await ProcessFileOptimizedAsync(library, item, existingPosts, knownHashes, excludedPaths, ct);
            Interlocked.Increment(ref scanned);

            if (scanned % 10 == 0 || scanned == total)
            {
                if (total > 0)
                {
                    progress?.Report((float)scanned / total * 100);
                    status?.Report($"Processing: {scanned}/{total} files");
                }
            }
        });
        
        progress?.Report(100);
        status?.Report($"Finished scanning {library.Name}");

        await _ingestionService.FlushAsync(cancellationToken);
    }

    public async Task ProcessFileAsync(Library library, MediaSourceItem item, CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<BakabooruDbContext>();
        var relativePath = item.RelativePath;
        var existingPost = await dbContext.Posts.FirstOrDefaultAsync(p => p.LibraryId == library.Id && p.RelativePath == relativePath, cancellationToken);
        
        if (existingPost != null) return; // Already ingested

        var md5 = await ComputeHashAsync(item.FullPath, cancellationToken);
        if (string.IsNullOrEmpty(md5)) return;

        var isDuplicate = await dbContext.Posts.AnyAsync(p => p.Md5Hash == md5, cancellationToken);
        if (isDuplicate) return;

        await EnqueuePostAsync(library, item, md5, cancellationToken);
    }

    private async Task ProcessFileOptimizedAsync(Library library, MediaSourceItem item, Dictionary<string, string> existingPosts, ConcurrentDictionary<string, byte> knownHashes, HashSet<string> excludedPaths, CancellationToken cancellationToken)
    {
        var relativePath = item.RelativePath;

        // Skip files on the exclusion list (e.g. duplicates resolved by user)
        if (excludedPaths.Contains(relativePath)) return;

        // Skip already-ingested files
        if (existingPosts.ContainsKey(relativePath)) return;

        // Hash the file
        var md5 = await ComputeHashAsync(item.FullPath, cancellationToken);
        if (string.IsNullOrEmpty(md5)) return;

        // Check global deduplication using in-memory set
        if (!knownHashes.TryAdd(md5, 0))
        {
            _logger.LogDebug("Skipping duplicate content {Hash} at {Path}", md5, relativePath);
            return;
        }

        await EnqueuePostAsync(library, item, md5, cancellationToken);
    }

    private async Task<string> ComputeHashAsync(string filePath, CancellationToken cancellationToken)
    {
        var extension = Path.GetExtension(filePath);
        var isVideo = SupportedMedia.IsVideo(extension);

        if (_skipVideoHashing && isVideo)
        {
            var fileInfo = new FileInfo(filePath);
            return $"QUICK_{fileInfo.Length}_{fileInfo.LastWriteTimeUtc.Ticks}";
        }

        return await _hasher.ComputeMd5Async(filePath, cancellationToken);
    }

    private async Task EnqueuePostAsync(Library library, MediaSourceItem item, string md5Hash, CancellationToken cancellationToken)
    {
        var contentType = SupportedMedia.GetMimeType(Path.GetExtension(item.RelativePath));

        var post = new Post
        {
            LibraryId = library.Id,
            RelativePath = item.RelativePath,
            Md5Hash = md5Hash,
            SizeBytes = item.SizeBytes,
            ContentType = contentType,
            ImportDate = DateTime.UtcNow
        };

        await _ingestionService.EnqueuePostAsync(post, cancellationToken);
    }
}
