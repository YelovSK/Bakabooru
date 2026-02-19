using Bakabooru.Core.DTOs;
using Bakabooru.Core.Entities;
using Bakabooru.Core.Results;
using Bakabooru.Data;
using Microsoft.EntityFrameworkCore;

namespace Bakabooru.Processing.Services;

public class DuplicateService
{
    private sealed record SameFolderPartitionContext(
        DuplicateGroup Group,
        string NormalizedFolderPath,
        List<Post> PartitionPosts);

    private readonly BakabooruDbContext _context;

    public DuplicateService(BakabooruDbContext context)
    {
        _context = context;
    }

    public Task<List<DuplicateGroupDto>> GetDuplicateGroupsAsync(CancellationToken cancellationToken = default)
    {
        return _context.DuplicateGroups
            .Where(g => !g.IsResolved)
            .OrderByDescending(g => g.SimilarityPercent ?? 100)
            .ThenByDescending(g => g.DetectedDate)
            .Select(g => new DuplicateGroupDto
            {
                Id = g.Id,
                Type = g.Type,
                SimilarityPercent = g.SimilarityPercent,
                DetectedDate = g.DetectedDate,
                Posts = g.Entries.Select(e => new DuplicatePostDto
                {
                    Id = e.Post.Id,
                    LibraryId = e.Post.LibraryId,
                    RelativePath = e.Post.RelativePath,
                    ContentHash = e.Post.ContentHash,
                    Width = e.Post.Width,
                    Height = e.Post.Height,
                    ContentType = e.Post.ContentType,
                    SizeBytes = e.Post.SizeBytes,
                    ImportDate = e.Post.ImportDate,
                    FileModifiedDate = e.Post.FileModifiedDate,
                    ThumbnailLibraryId = e.Post.LibraryId,
                    ThumbnailContentHash = e.Post.ContentHash,
                    ContentPostId = e.Post.Id,
                }).ToList()
            }).ToListAsync(cancellationToken);
    }

    public async Task<List<SameFolderDuplicateGroupDto>> GetSameFolderDuplicateGroupsAsync(CancellationToken cancellationToken = default)
    {
        var groups = await _context.DuplicateGroups
            .AsNoTracking()
            .Where(g => !g.IsResolved)
            .Include(g => g.Entries)
                .ThenInclude(e => e.Post)
                    .ThenInclude(p => p.Library)
            .ToListAsync(cancellationToken);

        var result = new List<SameFolderDuplicateGroupDto>();

        foreach (var group in groups)
        {
            var sameFolderPartitions = group.Entries
                .Select(e => e.Post)
                .GroupBy(
                    p => new { p.LibraryId, FolderPath = GetParentFolderPath(p.RelativePath) },
                    p => p);

            foreach (var partition in sameFolderPartitions)
            {
                var posts = partition.ToList();
                if (posts.Count < 2)
                {
                    continue;
                }

                var orderedPosts = posts
                    .OrderByDescending(p => (long)p.Width * p.Height)
                    .ThenByDescending(p => p.SizeBytes)
                    .ThenByDescending(p => p.FileModifiedDate)
                    .ThenByDescending(p => p.Id)
                    .ToList();

                result.Add(new SameFolderDuplicateGroupDto
                {
                    ParentDuplicateGroupId = group.Id,
                    DuplicateType = group.Type,
                    SimilarityPercent = group.SimilarityPercent,
                    LibraryId = partition.Key.LibraryId,
                    LibraryName = orderedPosts[0].Library.Name,
                    FolderPath = partition.Key.FolderPath,
                    RecommendedKeepPostId = orderedPosts[0].Id,
                    Posts = posts
                        .OrderByDescending(p => (long)p.Width * p.Height)
                        .ThenByDescending(p => p.SizeBytes)
                        .ThenByDescending(p => p.FileModifiedDate)
                        .ThenByDescending(p => p.Id)
                        .Select(p => new SameFolderDuplicatePostDto
                        {
                            Id = p.Id,
                            LibraryId = p.LibraryId,
                            RelativePath = p.RelativePath,
                            ContentHash = p.ContentHash,
                            Width = p.Width,
                            Height = p.Height,
                            SizeBytes = p.SizeBytes,
                            ImportDate = p.ImportDate,
                            FileModifiedDate = p.FileModifiedDate,
                            ThumbnailLibraryId = p.LibraryId,
                            ThumbnailContentHash = p.ContentHash,
                            ContentPostId = p.Id,
                        })
                        .ToList()
                });
            }
        }

        return result
            .OrderBy(r => r.DuplicateType == "exact" ? 0 : 1)
            .ThenByDescending(r => r.SimilarityPercent ?? 0)
            .ThenBy(r => r.LibraryName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(r => r.FolderPath, StringComparer.OrdinalIgnoreCase)
            .ThenBy(r => r.ParentDuplicateGroupId)
            .ToList();
    }

    public async Task<Result> KeepAllAsync(int groupId)
    {
        var group = await _context.DuplicateGroups.FindAsync(new object[] { groupId });
        if (group == null)
        {
            return Result.Failure(OperationError.NotFound, "Group not found.");
        }

        group.IsResolved = true;
        await _context.SaveChangesAsync();
        return Result.Success();
    }

    public async Task<Result> KeepOneAsync(int groupId, int postId)
    {
        var group = await _context.DuplicateGroups
            .Include(g => g.Entries)
                .ThenInclude(e => e.Post)
                    .ThenInclude(p => p.Library)
            .Include(g => g.Entries)
                .ThenInclude(e => e.Post)
                    .ThenInclude(p => p.PostTags)
            .Include(g => g.Entries)
                .ThenInclude(e => e.Post)
                    .ThenInclude(p => p.Sources)
            .FirstOrDefaultAsync(g => g.Id == groupId);

        if (group == null)
        {
            return Result.Failure(OperationError.NotFound, "Group not found.");
        }

        var keptEntry = group.Entries.FirstOrDefault(e => e.PostId == postId);
        if (keptEntry == null)
        {
            return Result.Failure(OperationError.InvalidInput, "Post is not a member of this group.");
        }

        await ResolveGroupKeepingPostAsync(group, postId);
        return Result.Success();
    }

    public async Task<ResolveAllExactResponseDto> ResolveAllExactAsync()
    {
        var exactGroups = await _context.DuplicateGroups
            .Where(g => !g.IsResolved && g.Type == "exact")
            .Include(g => g.Entries)
                .ThenInclude(e => e.Post)
                    .ThenInclude(p => p.Library)
            .Include(g => g.Entries)
                .ThenInclude(e => e.Post)
                    .ThenInclude(p => p.PostTags)
            .Include(g => g.Entries)
                .ThenInclude(e => e.Post)
                    .ThenInclude(p => p.Sources)
            .ToListAsync();

        if (exactGroups.Count == 0)
        {
            return new ResolveAllExactResponseDto { Resolved = 0 };
        }

        var resolved = 0;
        foreach (var group in exactGroups)
        {
            var keepPostId = group.Entries
                .OrderBy(e => e.Post.ImportDate)
                .First().PostId;

            await ResolveGroupKeepingPostAsync(group, keepPostId, saveChanges: false);
            resolved++;
        }

        await _context.SaveChangesAsync();
        return new ResolveAllExactResponseDto { Resolved = resolved };
    }

    public async Task<Result> DeleteSameFolderDuplicateAsync(
        DeleteSameFolderDuplicateRequestDto request,
        CancellationToken cancellationToken = default)
    {
        if (request.ParentDuplicateGroupId <= 0 || request.LibraryId <= 0 || request.PostId <= 0)
        {
            return Result.Failure(OperationError.InvalidInput, "Invalid request payload.");
        }

        var partitionResult = await LoadSameFolderPartitionAsync(
            request.ParentDuplicateGroupId,
            request.LibraryId,
            request.FolderPath,
            cancellationToken);
        if (!partitionResult.IsSuccess)
        {
            return Result.Failure(partitionResult.Error ?? OperationError.InvalidInput, partitionResult.Message ?? "Request failed.");
        }

        var partitionContext = partitionResult.Value!;
        var postToDelete = partitionContext.PartitionPosts.FirstOrDefault(p => p.Id == request.PostId);
        if (postToDelete == null)
        {
            return Result.Failure(OperationError.InvalidInput, "Post is not in the requested same-folder duplicate group.");
        }

        if (partitionContext.PartitionPosts.Count < 2)
        {
            return Result.Failure(OperationError.InvalidInput, "Cannot delete the last remaining post in a same-folder duplicate group.");
        }

        var affectedGroupIds = await CollectAffectedGroupIdsAsync([postToDelete.Id], cancellationToken);

        await using var transaction = await _context.Database.BeginTransactionAsync(cancellationToken);
        var deleteResult = DeletePostFromDiskAndDb(postToDelete);
        if (!deleteResult.IsSuccess)
        {
            return deleteResult;
        }

        await _context.SaveChangesAsync(cancellationToken);
        await ReconcileDuplicateGroupsAsync(affectedGroupIds, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Result.Success();
    }

    public async Task<Result<ResolveSameFolderResponseDto>> ResolveSameFolderGroupAsync(
        ResolveSameFolderGroupRequestDto request,
        CancellationToken cancellationToken = default)
    {
        if (request.ParentDuplicateGroupId <= 0 || request.LibraryId <= 0)
        {
            return Result<ResolveSameFolderResponseDto>.Failure(OperationError.InvalidInput, "Invalid request payload.");
        }

        var partitionResult = await LoadSameFolderPartitionAsync(
            request.ParentDuplicateGroupId,
            request.LibraryId,
            request.FolderPath,
            cancellationToken);
        if (!partitionResult.IsSuccess)
        {
            return Result<ResolveSameFolderResponseDto>.Failure(partitionResult.Error ?? OperationError.InvalidInput, partitionResult.Message ?? "Request failed.");
        }

        var resolveResult = await ResolveSameFolderPartitionAsync(partitionResult.Value!, cancellationToken);
        if (!resolveResult.IsSuccess)
        {
            return resolveResult;
        }

        return Result<ResolveSameFolderResponseDto>.Success(resolveResult.Value!);
    }

    public async Task<Result<ResolveSameFolderResponseDto>> ResolveAllSameFolderAsync(CancellationToken cancellationToken = default)
    {
        var groups = await GetSameFolderDuplicateGroupsAsync(cancellationToken);
        if (groups.Count == 0)
        {
            return Result<ResolveSameFolderResponseDto>.Success(new ResolveSameFolderResponseDto());
        }

        var summary = new ResolveSameFolderResponseDto();
        foreach (var group in groups)
        {
            var partitionResult = await LoadSameFolderPartitionAsync(
                group.ParentDuplicateGroupId,
                group.LibraryId,
                group.FolderPath,
                cancellationToken);

            if (!partitionResult.IsSuccess)
            {
                if (partitionResult.Error == OperationError.NotFound || partitionResult.Error == OperationError.InvalidInput)
                {
                    summary.SkippedGroups++;
                    continue;
                }

                return Result<ResolveSameFolderResponseDto>.Failure(partitionResult.Error ?? OperationError.InvalidInput, partitionResult.Message ?? "Request failed.");
            }

            var resolveResult = await ResolveSameFolderPartitionAsync(partitionResult.Value!, cancellationToken);
            if (!resolveResult.IsSuccess)
            {
                return resolveResult;
            }

            summary.ResolvedGroups += resolveResult.Value!.ResolvedGroups;
            summary.DeletedPosts += resolveResult.Value.DeletedPosts;
            summary.SkippedGroups += resolveResult.Value.SkippedGroups;
        }

        return Result<ResolveSameFolderResponseDto>.Success(summary);
    }

    private async Task ResolveGroupKeepingPostAsync(DuplicateGroup group, int keepPostId, bool saveChanges = true)
    {
        var keptEntry = group.Entries.First(e => e.PostId == keepPostId);
        var keptPost = keptEntry.Post;
        var removedEntries = group.Entries.Where(e => e.PostId != keepPostId).ToList();

        // Collect existing tag assignments and source URLs on the survivor
        var existingTagAssignments = new HashSet<(int TagId, PostTagSource Source)>(
            keptPost.PostTags.Select(pt => (pt.TagId, pt.Source)));
        var existingSourceUrls = new HashSet<string>(
            keptPost.Sources.Select(s => s.Url),
            StringComparer.OrdinalIgnoreCase);
        var maxSourceOrder = keptPost.Sources.Count > 0
            ? keptPost.Sources.Max(s => s.Order)
            : -1;

        foreach (var entry in removedEntries)
        {
            var post = entry.Post;

            // Merge tags from loser into survivor
            foreach (var pt in post.PostTags)
            {
                if (existingTagAssignments.Add((pt.TagId, pt.Source)))
                {
                    _context.PostTags.Add(new PostTag
                    {
                        PostId = keepPostId,
                        TagId = pt.TagId,
                        Source = pt.Source,
                    });
                }
            }

            // Merge sources from loser into survivor
            foreach (var source in post.Sources)
            {
                if (existingSourceUrls.Add(source.Url))
                {
                    maxSourceOrder++;
                    _context.Set<PostSource>().Add(new PostSource
                    {
                        PostId = keepPostId,
                        Url = source.Url,
                        Order = maxSourceOrder,
                    });
                }
            }

            var alreadyExcluded = await _context.ExcludedFiles.AnyAsync(
                e => e.LibraryId == post.LibraryId && e.RelativePath == post.RelativePath);

            if (!alreadyExcluded)
            {
                _context.ExcludedFiles.Add(new ExcludedFile
                {
                    LibraryId = post.LibraryId,
                    RelativePath = post.RelativePath,
                    ContentHash = post.ContentHash,
                    ExcludedDate = DateTime.UtcNow,
                    Reason = "duplicate_resolution"
                });
            }

            _context.Posts.Remove(post);
        }

        group.IsResolved = true;

        if (saveChanges)
        {
            await _context.SaveChangesAsync();
        }
    }

    public async Task<List<ExcludedFileDto>> GetExcludedFilesAsync(CancellationToken cancellationToken = default)
    {
        return await _context.ExcludedFiles
            .AsNoTracking()
            .Include(e => e.Library)
            .OrderByDescending(e => e.ExcludedDate)
            .Select(e => new ExcludedFileDto
            {
                Id = e.Id,
                LibraryId = e.LibraryId,
                LibraryName = e.Library.Name,
                RelativePath = e.RelativePath,
                ContentHash = e.ContentHash,
                ExcludedDate = e.ExcludedDate,
                Reason = e.Reason,
            })
            .ToListAsync(cancellationToken);
    }

    public async Task<Result> UnexcludeFileAsync(int excludedFileId)
    {
        var entry = await _context.ExcludedFiles.FindAsync(new object[] { excludedFileId });
        if (entry == null)
        {
            return Result.Failure(OperationError.NotFound, "Excluded file not found.");
        }

        _context.ExcludedFiles.Remove(entry);
        await _context.SaveChangesAsync();
        return Result.Success();
    }
    public async Task<Result<string>> GetExcludedFileContentPathAsync(int excludedFileId, CancellationToken cancellationToken = default)
    {
        var entry = await _context.ExcludedFiles
            .AsNoTracking()
            .Where(e => e.Id == excludedFileId)
            .Select(e => new
            {
                e.RelativePath,
                LibraryPath = e.Library.Path,
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (entry == null)
        {
            return Result<string>.Failure(OperationError.NotFound, "Excluded file not found.");
        }

        var fullPath = Path.GetFullPath(Path.Combine(entry.LibraryPath, entry.RelativePath));
        var libraryRoot = Path.GetFullPath(entry.LibraryPath + Path.DirectorySeparatorChar);

        if (!fullPath.StartsWith(libraryRoot, StringComparison.OrdinalIgnoreCase))
        {
            return Result<string>.Failure(OperationError.InvalidInput, "Invalid file path.");
        }

        if (!File.Exists(fullPath))
        {
            return Result<string>.Failure(OperationError.NotFound, "File not found on disk.");
        }

        return Result<string>.Success(fullPath);
    }

    private async Task<Result<SameFolderPartitionContext>> LoadSameFolderPartitionAsync(
        int parentDuplicateGroupId,
        int libraryId,
        string folderPath,
        CancellationToken cancellationToken)
    {
        var group = await _context.DuplicateGroups
            .Where(g => g.Id == parentDuplicateGroupId && !g.IsResolved)
            .Include(g => g.Entries)
                .ThenInclude(e => e.Post)
                    .ThenInclude(p => p.Library)
            .FirstOrDefaultAsync(cancellationToken);

        if (group == null)
        {
            return Result<SameFolderPartitionContext>.Failure(OperationError.NotFound, "Duplicate group not found.");
        }

        var normalizedFolderPath = NormalizeFolderPath(folderPath);
        var partitionPosts = group.Entries
            .Select(e => e.Post)
            .Where(p => p.LibraryId == libraryId && GetParentFolderPath(p.RelativePath) == normalizedFolderPath)
            .ToList();

        if (partitionPosts.Count < 2)
        {
            return Result<SameFolderPartitionContext>.Failure(OperationError.InvalidInput, "Same-folder partition no longer has at least two posts.");
        }

        return Result<SameFolderPartitionContext>.Success(new SameFolderPartitionContext(group, normalizedFolderPath, partitionPosts));
    }

    private async Task<Result<ResolveSameFolderResponseDto>> ResolveSameFolderPartitionAsync(
        SameFolderPartitionContext partitionContext,
        CancellationToken cancellationToken)
    {
        if (partitionContext.PartitionPosts.Count < 2)
        {
            return Result<ResolveSameFolderResponseDto>.Success(new ResolveSameFolderResponseDto
            {
                SkippedGroups = 1
            });
        }

        var keepPostId = SelectBestQualityPostId(partitionContext.PartitionPosts);
        var postIdsToDelete = partitionContext.PartitionPosts
            .Where(p => p.Id != keepPostId)
            .Select(p => p.Id)
            .ToList();

        if (postIdsToDelete.Count == 0)
        {
            return Result<ResolveSameFolderResponseDto>.Success(new ResolveSameFolderResponseDto
            {
                SkippedGroups = 1
            });
        }

        var affectedGroupIds = await CollectAffectedGroupIdsAsync(postIdsToDelete, cancellationToken);

        await using var transaction = await _context.Database.BeginTransactionAsync(cancellationToken);
        var deleted = 0;
        foreach (var post in partitionContext.PartitionPosts.Where(p => p.Id != keepPostId))
        {
            var deleteResult = DeletePostFromDiskAndDb(post);
            if (!deleteResult.IsSuccess)
            {
                return Result<ResolveSameFolderResponseDto>.Failure(deleteResult.Error ?? OperationError.InvalidInput, deleteResult.Message ?? "Request failed.");
            }

            deleted++;
        }

        await _context.SaveChangesAsync(cancellationToken);
        await ReconcileDuplicateGroupsAsync(affectedGroupIds, cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Result<ResolveSameFolderResponseDto>.Success(new ResolveSameFolderResponseDto
        {
            ResolvedGroups = 1,
            DeletedPosts = deleted,
        });
    }

    private static int SelectBestQualityPostId(IEnumerable<Post> posts)
    {
        return posts
            .OrderByDescending(p => (long)p.Width * p.Height)
            .ThenByDescending(p => p.SizeBytes)
            .ThenByDescending(p => p.FileModifiedDate)
            .ThenByDescending(p => p.Id)
            .Select(p => p.Id)
            .First();
    }

    private Result DeletePostFromDiskAndDb(Post post)
    {
        var fullPath = Path.GetFullPath(Path.Combine(post.Library.Path, post.RelativePath));
        var libraryRoot = Path.GetFullPath(post.Library.Path + Path.DirectorySeparatorChar);

        if (!fullPath.StartsWith(libraryRoot, StringComparison.OrdinalIgnoreCase))
        {
            return Result.Failure(OperationError.InvalidInput, "Invalid file path.");
        }

        try
        {
            if (File.Exists(fullPath))
            {
                File.Delete(fullPath);
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return Result.Failure(OperationError.Conflict, $"Failed to delete file from disk: {ex.Message}");
        }

        var excluded = _context.ExcludedFiles
            .Where(e => e.LibraryId == post.LibraryId && e.RelativePath == post.RelativePath);
        _context.ExcludedFiles.RemoveRange(excluded);
        _context.Posts.Remove(post);

        return Result.Success();
    }

    private async Task<List<int>> CollectAffectedGroupIdsAsync(IReadOnlyCollection<int> postIds, CancellationToken cancellationToken)
    {
        if (postIds.Count == 0)
        {
            return [];
        }

        return await _context.DuplicateGroups
            .Where(g => !g.IsResolved && g.Entries.Any(e => postIds.Contains(e.PostId)))
            .Select(g => g.Id)
            .Distinct()
            .ToListAsync(cancellationToken);
    }

    private async Task ReconcileDuplicateGroupsAsync(IReadOnlyCollection<int> groupIds, CancellationToken cancellationToken)
    {
        if (groupIds.Count == 0)
        {
            return;
        }

        var groups = await _context.DuplicateGroups
            .Where(g => !g.IsResolved && groupIds.Contains(g.Id))
            .Select(g => new { Group = g, EntryCount = g.Entries.Count })
            .ToListAsync(cancellationToken);

        var changed = false;
        foreach (var group in groups)
        {
            if (group.EntryCount < 2)
            {
                group.Group.IsResolved = true;
                changed = true;
            }
        }

        if (changed)
        {
            await _context.SaveChangesAsync(cancellationToken);
        }
    }

    private static string GetParentFolderPath(string relativePath)
    {
        var normalizedPath = NormalizePath(relativePath);
        var slashIndex = normalizedPath.LastIndexOf('/');
        return slashIndex < 0 ? string.Empty : normalizedPath[..slashIndex];
    }

    private static string NormalizeFolderPath(string folderPath)
    {
        if (string.IsNullOrWhiteSpace(folderPath))
        {
            return string.Empty;
        }

        return NormalizePath(folderPath);
    }

    private static string NormalizePath(string path)
    {
        var normalized = path.Replace('\\', '/').Trim();
        normalized = normalized.Trim('/');
        return normalized == "." ? string.Empty : normalized;
    }
}
