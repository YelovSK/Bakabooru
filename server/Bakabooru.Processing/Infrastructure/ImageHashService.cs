using Bakabooru.Core.Interfaces;
using FFMpegCore;
using FFMpegCore.Pipes;
using Microsoft.Extensions.Logging;

namespace Bakabooru.Processing.Infrastructure;

/// <summary>
/// Computes perceptual dHash using FFmpeg for image decoding.
/// Supports all formats FFmpeg can decode (including JXL, AVIF, WebP, etc.)
/// </summary>
public class ImageHashService : ISimilarityService
{
    private readonly ILogger<ImageHashService> _logger;

    public ImageHashService(ILogger<ImageHashService> logger)
    {
        _logger = logger;
    }

    public async Task<ulong?> ComputeHashAsync(string filePath, CancellationToken cancellationToken = default)
    {
        try
        {
            // Use FFmpeg to convert the image to raw grayscale pixels at 9x8
            // This works for ANY format FFmpeg supports (JXL, AVIF, WebP, PNG, JPEG, etc.)
            using var memoryStream = new MemoryStream();

            await FFMpegArguments
                .FromFileInput(filePath)
                .OutputToPipe(new StreamPipeSink(memoryStream), options => options
                    .WithVideoFilters(filter => filter.Scale(9, 8))
                    .ForceFormat("rawvideo")
                    .WithCustomArgument("-pix_fmt gray")
                    .WithCustomArgument("-frames:v 1")
                )
                .ProcessAsynchronously();

            var pixels = memoryStream.ToArray();

            // Expected: 9 * 8 = 72 grayscale bytes
            if (pixels.Length < 72)
            {
                _logger.LogWarning("Unexpected pixel count ({Count}) for {Path}, expected 72", pixels.Length, filePath);
                return null;
            }

            // Compute dHash: compare adjacent horizontal pixels
            ulong hash = 0;
            for (int y = 0; y < 8; y++)
            {
                for (int x = 0; x < 8; x++)
                {
                    int idx = y * 9 + x;
                    if (pixels[idx] > pixels[idx + 1])
                    {
                        hash |= 1UL << ((y * 8) + x);
                    }
                }
            }

            return hash;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to compute perceptual hash for {Path}", filePath);
            return null;
        }
    }
}
