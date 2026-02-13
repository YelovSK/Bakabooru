using Bakabooru.Core.Entities;
using Bakabooru.Core.Interfaces;
using Bakabooru.Data;
using Bakabooru.Processing.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Bakabooru.Processing.Jobs;

public class ApplyFolderTagsJob : IJob
{
    private sealed record FolderTagCandidate(int Id, string RelativePath);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ApplyFolderTagsJob> _logger;

    public ApplyFolderTagsJob(IServiceScopeFactory scopeFactory, ILogger<ApplyFolderTagsJob> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public string Name => "Apply Folder Tags";
    public string Description => "Adds tags to posts based on parent folders (spaces become underscores).";
    public bool SupportsAllMode => false;

    public async Task ExecuteAsync(JobContext context)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BakabooruDbContext>();
        var folderTagging = scope.ServiceProvider.GetRequiredService<FolderTaggingService>();

        var totalPosts = await db.Posts.AsNoTracking().CountAsync(context.CancellationToken);
        if (totalPosts == 0)
        {
            context.State.Report(new JobState
            {
                Phase = "Completed",
                Processed = 0,
                Total = 0,
                Succeeded = 0,
                Failed = 0,
                Skipped = 0,
                Summary = "No posts to process."
            });
            return;
        }

        const int batchSize = 500;
        var lastId = 0;
        var processed = 0;
        var updatedPosts = 0;
        var addedTags = 0;
        var skipped = 0;
        var failed = 0;

        while (true)
        {
            var batch = await db.Posts
                .AsNoTracking()
                .Where(p => p.Id > lastId)
                .OrderBy(p => p.Id)
                .Select(p => new FolderTagCandidate(p.Id, p.RelativePath))
                .Take(batchSize)
                .ToListAsync(context.CancellationToken);

            if (batch.Count == 0)
            {
                break;
            }

            lastId = batch[^1].Id;
            processed += batch.Count;

            try
            {
                var postIds = batch.Select(p => p.Id).ToList();

                var existingTagRows = await db.PostTags
                    .AsNoTracking()
                    .Where(pt => postIds.Contains(pt.PostId))
                    .Select(pt => new { pt.PostId, TagName = pt.Tag.Name })
                    .ToListAsync(context.CancellationToken);

                var existingTagsByPost = existingTagRows
                    .GroupBy(x => x.PostId)
                    .ToDictionary(
                        g => g.Key,
                        g => g.Select(x => x.TagName).ToHashSet(StringComparer.OrdinalIgnoreCase));

                var plans = new List<(int PostId, List<string> TagsToAdd)>(batch.Count);
                var neededTagNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                foreach (var post in batch)
                {
                    var existing = existingTagsByPost.TryGetValue(post.Id, out var names)
                        ? names
                        : [];

                    var plan = folderTagging.BuildPlan(post.RelativePath, existing);
                    if (plan.FolderTags.Count == 0 || plan.TagsToAdd.Count == 0)
                    {
                        skipped++;
                        continue;
                    }

                    var tagsToAdd = plan.TagsToAdd.ToList();
                    plans.Add((post.Id, tagsToAdd));

                    foreach (var tagName in tagsToAdd)
                    {
                        neededTagNames.Add(tagName);
                    }
                }

                if (plans.Count > 0)
                {
                    var tagsByName = await db.Tags
                        .Where(t => neededTagNames.Contains(t.Name))
                        .ToDictionaryAsync(t => t.Name, StringComparer.OrdinalIgnoreCase, context.CancellationToken);

                    foreach (var tagName in neededTagNames)
                    {
                        if (tagsByName.ContainsKey(tagName))
                        {
                            continue;
                        }

                        var tag = new Tag { Name = tagName };
                        db.Tags.Add(tag);
                        tagsByName[tagName] = tag;
                    }

                    foreach (var (postId, tagsToAdd) in plans)
                    {
                        var postAdded = 0;
                        foreach (var tagName in tagsToAdd)
                        {
                            db.PostTags.Add(new PostTag
                            {
                                PostId = postId,
                                Tag = tagsByName[tagName]
                            });
                            postAdded++;
                        }

                        if (postAdded > 0)
                        {
                            updatedPosts++;
                            addedTags += postAdded;
                        }
                    }

                    await db.SaveChangesAsync(context.CancellationToken);
                }
            }
            catch (Exception ex)
            {
                failed += batch.Count;
                _logger.LogWarning(ex, "Failed processing folder tags for batch ending at post id {LastId}", lastId);
            }

            context.State.Report(new JobState
            {
                Phase = "Applying folder tags...",
                Processed = processed,
                Total = totalPosts,
                Succeeded = updatedPosts,
                Failed = failed,
                Skipped = skipped,
                Summary = $"Updated {updatedPosts} posts, added {addedTags} tags"
            });
        }

        context.State.Report(new JobState
        {
            Phase = "Completed",
            Processed = processed,
            Total = totalPosts,
            Succeeded = updatedPosts,
            Failed = failed,
            Skipped = skipped,
            Summary = $"Updated {updatedPosts} posts and added {addedTags} folder tags."
        });
    }
}
