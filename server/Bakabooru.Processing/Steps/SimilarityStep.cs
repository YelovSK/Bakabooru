using Bakabooru.Core;
using Bakabooru.Core.Interfaces;
using Microsoft.Extensions.Logging;

namespace Bakabooru.Processing.Steps;

public class SimilarityStep : IMediaProcessingStep
{
    private readonly ISimilarityService _similarityService;
    private readonly ILogger<SimilarityStep> _logger;

    public int Order => 40;

    public SimilarityStep(ISimilarityService similarityService, ILogger<SimilarityStep> logger)
    {
        _similarityService = similarityService;
        _logger = logger;
    }

    public async Task ExecuteAsync(MediaProcessingContext context, CancellationToken cancellationToken)
    {
        var extension = Path.GetExtension(context.FilePath);

        if (SupportedMedia.IsImage(extension))
        {
            var hashes = await _similarityService.ComputeHashesAsync(context.FilePath, cancellationToken);
            context.PerceptualDHash = hashes?.DHash;
            context.PerceptualPHash = hashes?.PHash;
        }
    }
}
