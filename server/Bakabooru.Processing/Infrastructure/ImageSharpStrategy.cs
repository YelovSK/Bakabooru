using Bakabooru.Core;
using Bakabooru.Core.Interfaces;
using Microsoft.Extensions.Logging;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Processing;

namespace Bakabooru.Processing.Infrastructure;

public class ImageSharpStrategy : IMediaProcessorStrategy
{
    private readonly ILogger<ImageSharpStrategy> _logger;

    public ImageSharpStrategy(ILogger<ImageSharpStrategy> logger)
    {
        _logger = logger;
    }

    public bool CanProcess(string extension)
    {
        return SupportedMedia.IsImage(extension);
    }

    public async Task GenerateThumbnailAsync(string sourcePath, string destinationPath, int width, int height, CancellationToken cancellationToken = default)
    {
        try 
        {
            using var image = await Image.LoadAsync(sourcePath, cancellationToken);
            
            image.Mutate(x => x.Resize(new ResizeOptions
            {
                Size = new Size(width, height),
                Mode = ResizeMode.Max
            }));

            await image.SaveAsync(destinationPath, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to generate thumbnail for image {Path}", sourcePath);
            throw;
        }
    }

    public async Task<ImageMetadata> GetMetadataAsync(string filePath, CancellationToken cancellationToken = default)
    {
        try
        {
            var info = await Image.IdentifyAsync(filePath, cancellationToken);
            return new ImageMetadata
            {
                Width = info.Width,
                Height = info.Height,
                Format = info.Metadata.DecodedImageFormat?.Name ?? "Unknown"
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to read image metadata for {Path}", filePath);
            return new ImageMetadata { Width = 0, Height = 0, Format = "Unknown" };
        }
    }
}
