using Bakabooru.Core.Entities;
using Bakabooru.Data;
using Bakabooru.Server.DTOs;
using Bakabooru.Server.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Linq;

namespace Bakabooru.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PostsController : ControllerBase
{
    private readonly BakabooruDbContext _context;

    public PostsController(BakabooruDbContext context)
    {
        _context = context;
    }

    private async Task<PostDto?> LoadPostDtoAsync(int id, CancellationToken cancellationToken)
    {
        var postCore = await _context.Posts
            .AsNoTracking()
            .Where(x => x.Id == id)
            .Select(post => new
            {
                Id = post.Id,
                LibraryId = post.LibraryId,
                RelativePath = post.RelativePath,
                ContentHash = post.ContentHash,
                Width = post.Width,
                Height = post.Height,
                ContentType = post.ContentType,
                ImportDate = post.ImportDate
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (postCore == null) return null;

        var tags = await _context.PostTags
            .AsNoTracking()
            .Where(pt => pt.PostId == id)
            .Select(pt => new TagDto
            {
                Id = pt.Tag.Id,
                Name = pt.Tag.Name,
                CategoryId = pt.Tag.TagCategoryId,
                CategoryName = pt.Tag.TagCategory != null ? pt.Tag.TagCategory.Name : null,
                CategoryColor = pt.Tag.TagCategory != null ? pt.Tag.TagCategory.Color : null,
                Usages = pt.Tag.PostCount,
            })
            .ToListAsync(cancellationToken);

        return new PostDto
        {
            Id = postCore.Id,
            LibraryId = postCore.LibraryId,
            RelativePath = postCore.RelativePath,
            ContentHash = postCore.ContentHash,
            Width = postCore.Width,
            Height = postCore.Height,
            ContentType = postCore.ContentType,
            ImportDate = postCore.ImportDate,
            ThumbnailUrl = MediaPaths.GetThumbnailUrl(postCore.ContentHash),
            ContentUrl = MediaPaths.GetPostContentUrl(postCore.Id),
            Tags = tags
        };
    }

    private async Task<IQueryable<Post>> ApplyTagFiltersAsync(IQueryable<Post> query, string? tags, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(tags))
        {
            return query;
        }

        var parsedQuery = Bakabooru.Processing.Pipeline.QueryParser.Parse(tags);
        var includedTags = parsedQuery.IncludedTags.Distinct().ToList();
        var excludedTags = parsedQuery.ExcludedTags.Distinct().ToList();
        var allTagNames = includedTags.Concat(excludedTags).Distinct().ToList();

        if (allTagNames.Count == 0)
        {
            return query;
        }

        var tagIdsByName = await _context.Tags
            .Where(t => allTagNames.Contains(t.Name))
            .Select(t => new { t.Name, t.Id })
            .ToDictionaryAsync(t => t.Name, t => t.Id, cancellationToken);

        // If any required tag doesn't exist, there can be no results.
        if (includedTags.Any(tag => !tagIdsByName.ContainsKey(tag)))
        {
            return query.Where(_ => false);
        }

        foreach (var tag in includedTags)
        {
            var tagId = tagIdsByName[tag];
            query = query.Where(p => p.PostTags.Any(pt => pt.TagId == tagId));
        }

        foreach (var tag in excludedTags)
        {
            if (!tagIdsByName.TryGetValue(tag, out var tagId))
            {
                continue;
            }

            query = query.Where(p => !p.PostTags.Any(pt => pt.TagId == tagId));
        }

        return query;
    }

    [HttpGet]
    public async Task<ActionResult<PostListDto>> GetPosts(
        [FromQuery] string? tags = null,
        [FromQuery] int page = 1, 
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        if (page < 1) page = 1;
        if (pageSize < 1) pageSize = 20;
        if (pageSize > 100) pageSize = 100;

        var query = await ApplyTagFiltersAsync(_context.Posts, tags, cancellationToken);

        var totalCount = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderByDescending(p => p.ImportDate)
            .ThenByDescending(p => p.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(p => new PostDto
            {
                Id = p.Id,
                LibraryId = p.LibraryId,
                RelativePath = p.RelativePath,
                ContentHash = p.ContentHash,
                Width = p.Width,
                Height = p.Height,
                ContentType = p.ContentType,
                ImportDate = p.ImportDate,
                ThumbnailUrl = MediaPaths.GetThumbnailUrl(p.ContentHash),
                ContentUrl = MediaPaths.GetPostContentUrl(p.Id),
                Tags = new List<TagDto>(),
            })
            .ToListAsync(cancellationToken);

        return new PostListDto
        {
            Items = items,
            TotalCount = totalCount,
            Page = page,
            PageSize = pageSize
        };
    }

    [HttpGet("{id}/around")]
    public async Task<ActionResult<PostsAroundDto>> GetPostsAround(int id, [FromQuery] string? tags = null, CancellationToken cancellationToken = default)
    {
        var current = await _context.Posts
            .AsNoTracking()
            .Where(p => p.Id == id)
            .Select(p => new { p.Id, p.ImportDate })
            .FirstOrDefaultAsync(cancellationToken);

        if (current == null)
        {
            return NotFound();
        }

        var query = await ApplyTagFiltersAsync(_context.Posts.AsNoTracking(), tags, cancellationToken);

        var prevRaw = await query
            .Where(p => p.Id != current.Id
                        && (p.ImportDate > current.ImportDate
                            || (p.ImportDate == current.ImportDate && p.Id > current.Id)))
            .OrderBy(p => p.ImportDate)
            .ThenBy(p => p.Id)
            .Select(p => new
            {
                p.Id,
                p.ContentHash
            })
            .FirstOrDefaultAsync(cancellationToken);

        var nextRaw = await query
            .Where(p => p.Id != current.Id
                        && (p.ImportDate < current.ImportDate
                            || (p.ImportDate == current.ImportDate && p.Id < current.Id)))
            .OrderByDescending(p => p.ImportDate)
            .ThenByDescending(p => p.Id)
            .Select(p => new
            {
                p.Id,
                p.ContentHash
            })
            .FirstOrDefaultAsync(cancellationToken);

        PostDto? prev = null;
        PostDto? next = null;

        if (prevRaw != null && nextRaw != null)
        {
            var prevTask = LoadPostDtoAsync(prevRaw.Id, cancellationToken);
            var nextTask = LoadPostDtoAsync(nextRaw.Id, cancellationToken);
            await Task.WhenAll(prevTask, nextTask);
            prev = prevTask.Result;
            next = nextTask.Result;
        }
        else if (prevRaw != null)
        {
            prev = await LoadPostDtoAsync(prevRaw.Id, cancellationToken);
        }
        else if (nextRaw != null)
        {
            next = await LoadPostDtoAsync(nextRaw.Id, cancellationToken);
        }

        return Ok(new PostsAroundDto
        {
            Prev = prev,
            Next = next
        });
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<PostDto>> GetPost(int id, CancellationToken cancellationToken = default)
    {
        var post = await LoadPostDtoAsync(id, cancellationToken);
        if (post == null) return NotFound();
        return post;
    }

    [HttpPost("{id}/tags")]
    public async Task<IActionResult> AddTag(int id, [FromBody] string tagName)
    {
        var postExists = await _context.Posts.AnyAsync(p => p.Id == id);
        if (!postExists) return NotFound("Post not found");

        tagName = tagName.Trim();
        if (string.IsNullOrEmpty(tagName)) return BadRequest("Tag name cannot be empty");

        // Check if tag exists
        var tag = await _context.Tags.FirstOrDefaultAsync(t => t.Name == tagName);
        if (tag == null)
        {
            // Create new tag
            tag = new Tag { Name = tagName };
            _context.Tags.Add(tag);
            await _context.SaveChangesAsync();
        }

        // Check if post already has this tag
        var alreadyAssigned = await _context.PostTags.AnyAsync(pt => pt.PostId == id && pt.TagId == tag.Id);
        if (alreadyAssigned)
        {
            return Conflict("Tag already assigned");
        }

        _context.PostTags.Add(new PostTag { PostId = id, TagId = tag.Id });
        await _context.SaveChangesAsync();

        return NoContent();
    }
    
    [HttpDelete("{id}/tags/{tagName}")]
    public async Task<IActionResult> RemoveTag(int id, string tagName)
    {
        var postExists = await _context.Posts.AnyAsync(p => p.Id == id);
        if (!postExists) return NotFound("Post not found");

        var postTag = await _context.PostTags
            .Where(pt => pt.PostId == id && pt.Tag.Name == tagName)
            .FirstOrDefaultAsync();
        if (postTag == null) return NotFound("Tag not found on post");

        _context.PostTags.Remove(postTag);
        await _context.SaveChangesAsync();
        return NoContent();
    }

    [HttpGet("{id}/content")]
    public async Task<IActionResult> GetPostContent(int id, CancellationToken cancellationToken = default)
    {
        var post = await _context.Posts
            .Where(p => p.Id == id)
            .Select(p => new
            {
                p.RelativePath,
                p.ContentType,
                LibraryPath = p.Library.Path
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (post == null) return NotFound();

        var fullPath = Path.GetFullPath(Path.Combine(post.LibraryPath, post.RelativePath));
        var libraryRoot = Path.GetFullPath(post.LibraryPath + Path.DirectorySeparatorChar);

        if (!fullPath.StartsWith(libraryRoot, StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest("Invalid file path");
        }

        if (!System.IO.File.Exists(fullPath))
        {
            return NotFound("File not found on disk");
        }

        return PhysicalFile(fullPath, post.ContentType, enableRangeProcessing: true);
    }
}
