using Bakabooru.Core.Interfaces;
using Microsoft.Extensions.Logging;

namespace Bakabooru.Processing.Infrastructure;

public class MediaProcessorDelegator : IImageProcessor
{
    private readonly IEnumerable<IMediaProcessorStrategy> _strategies;
    private readonly ILogger<MediaProcessorDelegator> _logger;

    public MediaProcessorDelegator(IEnumerable<IMediaProcessorStrategy> strategies, ILogger<MediaProcessorDelegator> logger)
    {
        _strategies = strategies;
        _logger = logger;
    }

    private IMediaProcessorStrategy GetStrategy(string filePath)
    {
        var extension = Path.GetExtension(filePath).ToLowerInvariant();
        var strategy = _strategies.FirstOrDefault(s => s.CanProcess(extension));
        
        if (strategy == null)
        {
            throw new NotSupportedException($"No strategy found for extension: {extension}");
        }
        
        return strategy;
    }

    public async Task GenerateThumbnailAsync(string sourcePath, string destinationPath, int width, int height, CancellationToken cancellationToken = default)
    {
        var strategy = GetStrategy(sourcePath);
        await strategy.GenerateThumbnailAsync(sourcePath, destinationPath, width, height, cancellationToken);
    }

    public async Task<ImageMetadata> GetMetadataAsync(string filePath, CancellationToken cancellationToken = default)
    {
        var strategy = GetStrategy(filePath);
        return await strategy.GetMetadataAsync(filePath, cancellationToken);
    }
}
