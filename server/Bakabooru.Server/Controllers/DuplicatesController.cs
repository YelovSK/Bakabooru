using Bakabooru.Core.Entities;
using Bakabooru.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Bakabooru.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DuplicatesController : ControllerBase
{
    private readonly BakabooruDbContext _context;

    public DuplicatesController(BakabooruDbContext context)
    {
        _context = context;
    }

    /// <summary>
    /// Returns all unresolved duplicate groups with their post details.
    /// </summary>
    [HttpGet]
    public async Task<ActionResult> GetDuplicateGroups(CancellationToken cancellationToken)
    {
        var groups = await _context.DuplicateGroups
            .Where(g => !g.IsResolved)
            .Include(g => g.Entries)
                .ThenInclude(e => e.Post)
            .OrderByDescending(g => g.SimilarityPercent ?? 100)
            .ThenByDescending(g => g.DetectedDate)
            .ToListAsync(cancellationToken);

        var result = groups.Select(g => new
        {
            g.Id,
            g.Type,
            g.SimilarityPercent,
            g.DetectedDate,
            Posts = g.Entries.Select(e => new
            {
                e.Post.Id,
                e.Post.LibraryId,
                e.Post.RelativePath,
                ContentHash = e.Post.ContentHash,
                e.Post.Width,
                e.Post.Height,
                e.Post.ContentType,
                e.Post.SizeBytes,
                e.Post.ImportDate,
                ThumbnailUrl = $"/thumbnails/{e.Post.ContentHash}.jpg",
                ContentUrl = $"/api/posts/{e.Post.Id}/content"
            })
        });

        return Ok(result);
    }

    /// <summary>
    /// Resolve a group by keeping all posts (dismiss the group).
    /// </summary>
    [HttpPost("{groupId}/keep-all")]
    public async Task<ActionResult> KeepAll(int groupId, CancellationToken cancellationToken)
    {
        var group = await _context.DuplicateGroups.FindAsync(new object[] { groupId }, cancellationToken);
        if (group == null) return NotFound();

        group.IsResolved = true;
        await _context.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    /// <summary>
    /// Resolve a group by keeping one post and removing the others from the booru.
    /// Removed posts are added to the exclusion list so they won't be re-imported.
    /// Files on disk are NOT deleted.
    /// </summary>
    [HttpPost("{groupId}/keep/{postId}")]
    public async Task<ActionResult> KeepOne(int groupId, int postId, CancellationToken cancellationToken)
    {
        var group = await _context.DuplicateGroups
            .Include(g => g.Entries)
                .ThenInclude(e => e.Post)
                    .ThenInclude(p => p.Library)
            .FirstOrDefaultAsync(g => g.Id == groupId, cancellationToken);

        if (group == null) return NotFound("Group not found");

        var keptEntry = group.Entries.FirstOrDefault(e => e.PostId == postId);
        if (keptEntry == null) return BadRequest("Post is not a member of this group");

        await ResolveGroupKeepingPost(group, postId, cancellationToken);
        return NoContent();
    }

    /// <summary>
    /// Bulk-resolve all exact (content-hash) duplicate groups by keeping the oldest post in each.
    /// </summary>
    [HttpPost("resolve-all-exact")]
    public async Task<ActionResult> ResolveAllExact(CancellationToken cancellationToken)
    {
        var exactGroups = await _context.DuplicateGroups
            .Where(g => !g.IsResolved && g.Type == "exact")
            .Include(g => g.Entries)
                .ThenInclude(e => e.Post)
                    .ThenInclude(p => p.Library)
            .ToListAsync(cancellationToken);

        if (exactGroups.Count == 0)
            return Ok(new { resolved = 0 });

        int resolved = 0;
        foreach (var group in exactGroups)
        {
            var keepPostId = group.Entries
                .OrderBy(e => e.Post.ImportDate)
                .First().PostId;

            await ResolveGroupKeepingPost(group, keepPostId, cancellationToken, saveChanges: false);
            resolved++;
        }

        await _context.SaveChangesAsync(cancellationToken);
        return Ok(new { resolved });
    }

    private async Task ResolveGroupKeepingPost(DuplicateGroup group, int keepPostId, CancellationToken cancellationToken, bool saveChanges = true)
    {
        var removedEntries = group.Entries.Where(e => e.PostId != keepPostId).ToList();

        foreach (var entry in removedEntries)
        {
            var post = entry.Post;
            var alreadyExcluded = await _context.ExcludedFiles.AnyAsync(
                e => e.LibraryId == post.LibraryId && e.RelativePath == post.RelativePath,
                cancellationToken);

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
            await _context.SaveChangesAsync(cancellationToken);
    }
}
