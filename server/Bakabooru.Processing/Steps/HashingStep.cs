using Bakabooru.Core;
using Bakabooru.Core.Interfaces;
using Microsoft.Extensions.Logging;

namespace Bakabooru.Processing.Steps;

public class HashingStep : IMediaProcessingStep
{
    private readonly IHasherService _hasher;
    private readonly ILogger<HashingStep> _logger;

    public int Order => 10;

    public HashingStep(IHasherService hasher, ILogger<HashingStep> logger)
    {
        _hasher = hasher;
        _logger = logger;
    }

    public async Task ExecuteAsync(MediaProcessingContext context, CancellationToken cancellationToken)
    {
        if (!string.IsNullOrEmpty(context.ContentHash)) return;

        context.ContentHash = await _hasher.ComputeContentHashAsync(context.FilePath, cancellationToken);
    }
}

