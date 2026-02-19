using Bakabooru.Core.DTOs;
using Bakabooru.Processing.Services;
using Bakabooru.Server.Extensions;
using Microsoft.AspNetCore.Mvc;

namespace Bakabooru.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DuplicatesController : ControllerBase
{
    private readonly DuplicateService _duplicateService;

    public DuplicatesController(DuplicateService duplicateService)
    {
        _duplicateService = duplicateService;
    }

    /// <summary>
    /// Returns all unresolved duplicate groups with their post details.
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<IEnumerable<DuplicateGroupDto>>> GetDuplicateGroups(CancellationToken cancellationToken)
    {
        return Ok(await _duplicateService.GetDuplicateGroupsAsync(cancellationToken));
    }

    /// <summary>
    /// Resolve a group by keeping all posts (dismiss the group).
    /// </summary>
    [HttpPost("{groupId}/keep-all")]
    public async Task<IActionResult> KeepAll(int groupId)
    {
        return await _duplicateService.KeepAllAsync(groupId).ToHttpResult();
    }

    /// <summary>
    /// Resolve a group by keeping one post and removing the others from the booru.
    /// Removed posts are added to the exclusion list so they won't be re-imported.
    /// Files on disk are NOT deleted.
    /// </summary>
    [HttpPost("{groupId}/keep/{postId}")]
    public async Task<IActionResult> KeepOne(int groupId, int postId)
    {
        return await _duplicateService.KeepOneAsync(groupId, postId).ToHttpResult();
    }

    /// <summary>
    /// Bulk-resolve all exact (content-hash) duplicate groups by keeping the oldest post in each.
    /// </summary>
    [HttpPost("resolve-all-exact")]
    public async Task<ActionResult<ResolveAllExactResponseDto>> ResolveAllExact()
    {
        return Ok(await _duplicateService.ResolveAllExactAsync());
    }

    /// <summary>
    /// Returns all excluded files (e.g. from duplicate resolution).
    /// </summary>
    [HttpGet("excluded")]
    public async Task<ActionResult<IEnumerable<ExcludedFileDto>>> GetExcludedFiles(CancellationToken cancellationToken)
    {
        return Ok(await _duplicateService.GetExcludedFilesAsync(cancellationToken));
    }

    /// <summary>
    /// Remove a file from the exclusion list. It will be re-imported on the next scan.
    /// </summary>
    [HttpDelete("excluded/{id}")]
    public async Task<IActionResult> UnexcludeFile(int id)
    {
        return await _duplicateService.UnexcludeFileAsync(id).ToHttpResult();
    }

    /// <summary>
    /// Serves the original file content for an excluded file.
    /// </summary>
    [HttpGet("excluded/{id}/content")]
    public async Task<IActionResult> GetExcludedFileContent(int id, CancellationToken cancellationToken)
    {
        return await _duplicateService.GetExcludedFileContentPathAsync(id, cancellationToken)
            .ToHttpResult(fullPath =>
            {
                var provider = new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider();
                if (!provider.TryGetContentType(fullPath!, out var contentType))
                {
                    contentType = "application/octet-stream";
                }
                return PhysicalFile(fullPath!, contentType, enableRangeProcessing: true);
            });
    }
}
