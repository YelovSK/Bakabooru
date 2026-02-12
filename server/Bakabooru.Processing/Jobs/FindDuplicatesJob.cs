using Bakabooru.Core.Entities;
using Bakabooru.Core.Interfaces;
using Bakabooru.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using System.Numerics;

namespace Bakabooru.Processing.Jobs;

public class FindDuplicatesJob : IJob
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<FindDuplicatesJob> _logger;

    /// <summary>
    /// Maximum hamming distance (out of 64 bits) to consider two images perceptually similar.
    /// Default 3 bits ≈ ~95% similarity. Configurable from client.
    /// </summary>
    public int PerceptualThreshold { get; set; } = 3;

    public FindDuplicatesJob(IServiceScopeFactory scopeFactory, ILogger<FindDuplicatesJob> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public string Name => "Find Duplicates";
    public string Description => "Scans for exact (MD5) and perceptual (dHash) duplicate posts.";

    public async Task ExecuteAsync(JobContext context)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BakabooruDbContext>();

        context.Status.Report("Loading posts...");
        var posts = await db.Posts
            .AsNoTracking()
            .Select(p => new { p.Id, p.Md5Hash, p.PerceptualHash })
            .ToListAsync(context.CancellationToken);

        _logger.LogInformation("Loaded {Count} posts for duplicate analysis", posts.Count);

        // Clear old unresolved groups (they'll be regenerated)
        context.Status.Report("Clearing old unresolved groups...");
        var oldGroups = await db.DuplicateGroups
            .Where(g => !g.IsResolved)
            .ToListAsync(context.CancellationToken);
        db.DuplicateGroups.RemoveRange(oldGroups);
        await db.SaveChangesAsync(context.CancellationToken);

        var newGroups = new List<DuplicateGroup>();

        // --- Phase 1: Exact duplicates (same MD5) ---
        context.Status.Report("Finding exact duplicates (MD5)...");
        context.Progress.Report(10);

        var exactGroups = posts
            .Where(p => !string.IsNullOrEmpty(p.Md5Hash))
            .GroupBy(p => p.Md5Hash, StringComparer.OrdinalIgnoreCase)
            .Where(g => g.Count() > 1);

        foreach (var group in exactGroups)
        {
            var dupGroup = new DuplicateGroup
            {
                Type = "exact",
                DetectedDate = DateTime.UtcNow,
                Entries = group.Select(p => new DuplicateGroupEntry { PostId = p.Id }).ToList()
            };
            newGroups.Add(dupGroup);
        }

        _logger.LogInformation("Found {Count} exact duplicate groups", newGroups.Count);
        context.Progress.Report(30);

        // --- Phase 2: Perceptual duplicates (dHash hamming distance) ---
        context.Status.Report("Finding perceptual duplicates (dHash)...");

        var hashPosts = posts
            .Where(p => p.PerceptualHash.HasValue && p.PerceptualHash.Value != 0)
            .Select(p => new { p.Id, Hash = p.PerceptualHash!.Value })
            .ToList();

        _logger.LogInformation("Comparing {Count} perceptual hashes", hashPosts.Count);

        // Collect matching pairs, then merge into groups using union-find
        var parent = new Dictionary<int, int>(); // union-find

        int Find(int x)
        {
            if (!parent.ContainsKey(x)) parent[x] = x;
            if (parent[x] != x) parent[x] = Find(parent[x]);
            return parent[x];
        }

        void Union(int a, int b)
        {
            var ra = Find(a);
            var rb = Find(b);
            if (ra != rb) parent[ra] = rb;
        }

        // Also track the minimum similarity % for each merged group
        var groupSimilarity = new Dictionary<int, int>(); // root -> min similarity %

        int totalComparisons = hashPosts.Count * (hashPosts.Count - 1) / 2;
        int comparedSoFar = 0;
        int lastReportedPercent = 30;

        // Exclude post IDs that are already in exact duplicate groups
        var exactPostIds = new HashSet<int>(newGroups.SelectMany(g => g.Entries.Select(e => e.PostId)));

        for (int i = 0; i < hashPosts.Count; i++)
        {
            for (int j = i + 1; j < hashPosts.Count; j++)
            {
                comparedSoFar++;

                var distance = HammingDistance(hashPosts[i].Hash, hashPosts[j].Hash);
                if (distance <= PerceptualThreshold)
                {
                    var idA = hashPosts[i].Id;
                    var idB = hashPosts[j].Id;

                    // Skip if both are already grouped as exact duplicates
                    if (exactPostIds.Contains(idA) && exactPostIds.Contains(idB))
                        continue;

                    Union(idA, idB);
                    int similarity = (int)Math.Round((1.0 - (double)distance / 64) * 100);

                    var root = Find(idA);
                    if (!groupSimilarity.ContainsKey(root))
                        groupSimilarity[root] = similarity;
                    else
                        groupSimilarity[root] = Math.Min(groupSimilarity[root], similarity);
                }

                // Progress reporting (30% -> 90%)
                if (totalComparisons > 0)
                {
                    int percent = 30 + (int)((double)comparedSoFar / totalComparisons * 60);
                    if (percent > lastReportedPercent + 2) // avoid too-frequent updates
                    {
                        lastReportedPercent = percent;
                        context.Progress.Report(percent);
                        context.Status.Report($"Comparing perceptual hashes: {comparedSoFar:N0}/{totalComparisons:N0}");
                    }
                }
            }
        }

        // Build perceptual groups from union-find
        var perceptualGroups = hashPosts
            .Where(p => parent.ContainsKey(p.Id))
            .GroupBy(p => Find(p.Id))
            .Where(g => g.Count() > 1);

        int perceptualCount = 0;
        foreach (var group in perceptualGroups)
        {
            var root = group.Key;
            var similarity = groupSimilarity.GetValueOrDefault(root, 100);

            var dupGroup = new DuplicateGroup
            {
                Type = "perceptual",
                SimilarityPercent = similarity,
                DetectedDate = DateTime.UtcNow,
                Entries = group.Select(p => new DuplicateGroupEntry { PostId = p.Id }).ToList()
            };
            newGroups.Add(dupGroup);
            perceptualCount++;
        }

        _logger.LogInformation("Found {Count} perceptual duplicate groups", perceptualCount);

        // --- Phase 3: Save results ---
        context.Status.Report("Saving results...");
        context.Progress.Report(90);

        if (newGroups.Count > 0)
        {
            db.DuplicateGroups.AddRange(newGroups);
            await db.SaveChangesAsync(context.CancellationToken);
        }

        context.Progress.Report(100);
        var totalEntries = newGroups.Sum(g => g.Entries.Count);
        context.Status.Report($"Done — found {newGroups.Count} duplicate groups ({totalEntries} posts)");
        _logger.LogInformation("Duplicate scan complete: {Groups} groups, {Entries} total posts",
            newGroups.Count, totalEntries);
    }

    private static int HammingDistance(ulong a, ulong b)
    {
        return BitOperations.PopCount(a ^ b);
    }
}
